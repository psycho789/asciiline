from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from ascii_video_player2 import VideoDecoder
from ports.frame_encoder import FrameEncoder, select_encoder
from use_cases.effective_fps import effective_fps

logger = logging.getLogger(__name__)

_END_SENTINEL = object()

_zmq_pub: Any | None = None


def _init_zmq_publisher() -> None:
    global _zmq_pub
    endpoint = os.getenv("ASCIILINE_ZMQ_ENDPOINT", "")
    if not endpoint:
        return
    try:
        import zmq
    except ImportError:
        logger.warning("pyzmq not installed — ZMQ fan-out disabled")
        return
    ctx = zmq.Context.instance()
    socket = ctx.socket(zmq.PUB)
    socket.bind(endpoint)
    _zmq_pub = socket
    logger.info("ZMQ publisher bound at %s", endpoint)


@dataclass(frozen=True, slots=True)
class StreamKey:
    video_path: str
    cols: int
    rows: int
    pixel_mode: bool
    render_mode: int


def _stream_key_bytes(key: StreamKey) -> bytes:
    return f"{key.video_path}|{key.cols}|{key.rows}|{key.pixel_mode}|{key.render_mode}".encode()


_init_zmq_publisher()


@dataclass(frozen=True, slots=True)
class StreamMetadata:
    effective_fps: float
    skip_n: int
    cols: int
    rows: int
    pixel_mode: bool
    render_mode: int


class StreamSubscription:
    """Async iterator of pre-encoded frames from a shared broadcast stream."""

    def __init__(
        self,
        hub: BroadcastHub,
        key: StreamKey,
        queue: asyncio.Queue[bytes | str | object],
        metadata: StreamMetadata,
    ) -> None:
        self._hub = hub
        self._key = key
        self._queue = queue
        self.metadata = metadata

    def __aiter__(self) -> StreamSubscription:
        return self

    async def __anext__(self) -> bytes | str:
        payload = await self._queue.get()
        if payload is _END_SENTINEL:
            raise StopAsyncIteration
        if isinstance(payload, (bytes, str)):
            return payload
        raise StopAsyncIteration

    @property
    def queue(self) -> asyncio.Queue[bytes | str | object]:
        return self._queue


class _SharedStream:
    def __init__(
        self,
        key: StreamKey,
        decoder_factory: Callable[..., VideoDecoder],
        encoder_factory: Callable[[bool, int], FrameEncoder],
    ) -> None:
        self.key = key
        self._decoder_factory = decoder_factory
        self._encoder_factory = encoder_factory
        self.subscribers: list[asyncio.Queue[bytes | str | object]] = []
        self.decoder: VideoDecoder | None = None
        self.encoder: FrameEncoder | None = None
        self.metadata: StreamMetadata | None = None
        self._task: asyncio.Task[None] | None = None
        self._start_task: asyncio.Task[None] | None = None
        self._stopped = False
        self._encode_count: int = 0
        self._bytes_total: int = 0
        self._last_fps_reset: float = 0.0
        self._encode_fps: float = 0.0
        self._bytes_per_frame: float = 0.0

    def schedule_decode_start(self) -> None:
        if self._start_task is not None and not self._start_task.done():
            self._start_task.cancel()
        self._start_task = asyncio.create_task(self._delayed_decode_start())

    async def _delayed_decode_start(self) -> None:
        await asyncio.sleep(0)
        if not self._stopped and self.subscribers:
            self.ensure_decode_task()

    def start(self) -> StreamMetadata:
        if self.decoder is not None and self.metadata is not None:
            return self.metadata

        decoder = self._decoder_factory(
            self.key.video_path,
            self.key.cols,
            self.key.rows,
            skip_gray=self.key.pixel_mode,
        )
        source_fps = decoder.fps
        effective, skip_n = effective_fps(source_fps)

        encoder = self._encoder_factory(self.key.pixel_mode, self.key.render_mode)
        encoder.prepare(self.key.rows, self.key.cols, self.key.render_mode, self.key.pixel_mode)

        self.decoder = decoder
        self.encoder = encoder
        self.metadata = StreamMetadata(
            effective_fps=effective,
            skip_n=skip_n,
            cols=self.key.cols,
            rows=self.key.rows,
            pixel_mode=self.key.pixel_mode,
            render_mode=self.key.render_mode,
        )
        return self.metadata

    def ensure_decode_task(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(
                self._decode_loop(), name=f"broadcast-{self.key.video_path}"
            )

    async def _decode_loop(self) -> None:
        assert self.decoder is not None
        assert self.encoder is not None
        assert self.metadata is not None

        decoder = self.decoder
        encoder = self.encoder
        skip_n = self.metadata.skip_n
        frame_index = 0
        frame_t = 1.0 / self.metadata.effective_fps
        start_time = asyncio.get_running_loop().time()

        try:
            while not self._stopped and self.subscribers:
                for _ in range(skip_n - 1):
                    if not decoder.grab():
                        break

                try:
                    gray_frame, bgr_frame = next(decoder)
                except StopIteration:
                    break

                payload = encoder.encode(frame_index, gray_frame, bgr_frame)
                fan_out = payload if isinstance(payload, str) else bytes(payload)
                self._fan_out(fan_out)
                self._encode_count += 1
                self._bytes_total += (
                    len(fan_out)
                    if isinstance(fan_out, (bytes, bytearray))
                    else len(fan_out.encode())
                )
                now = asyncio.get_running_loop().time()
                if self._last_fps_reset == 0.0:
                    self._last_fps_reset = now
                if now - self._last_fps_reset >= 1.0:
                    elapsed_window = now - self._last_fps_reset
                    self._encode_fps = self._encode_count / elapsed_window
                    self._bytes_per_frame = self._bytes_total / max(1, self._encode_count)
                    self._encode_count = 0
                    self._bytes_total = 0
                    self._last_fps_reset = now
                frame_index += 1

                elapsed = asyncio.get_running_loop().time() - start_time
                wait = (frame_index * frame_t) - elapsed
                if wait > 0:
                    await asyncio.sleep(wait)
                else:
                    await asyncio.sleep(0)
        except Exception:
            logger.exception(
                "Broadcast decode loop failed",
                extra={"video_path": self.key.video_path},
            )
        finally:
            self._fan_out_end()

    def _fan_out(self, payload: bytes | str) -> None:
        payload_bytes = payload.encode() if isinstance(payload, str) else bytes(payload)
        if _zmq_pub is not None:
            try:
                import zmq

                _zmq_pub.send_multipart(
                    [_stream_key_bytes(self.key), payload_bytes],
                    flags=zmq.NOBLOCK,
                )
            except zmq.Again:
                pass
        for queue in list(self.subscribers):
            copy = payload if isinstance(payload, str) else bytes(payload)
            try:
                queue.put_nowait(copy)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(copy)
                except asyncio.QueueFull:
                    pass

    def _fan_out_end(self) -> None:
        for queue in list(self.subscribers):
            try:
                queue.put_nowait(_END_SENTINEL)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(_END_SENTINEL)
                except asyncio.QueueFull:
                    pass

    async def shutdown(self) -> None:
        self._stopped = True
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self.decoder is not None:
            self.decoder.release()
            self.decoder = None
        self.encoder = None
        self.metadata = None
        self._task = None


class BroadcastHub:
    def __init__(
        self,
        decoder_factory: Callable[..., VideoDecoder] = VideoDecoder,
        encoder_factory: Callable[[bool, int], FrameEncoder] | None = None,
    ) -> None:
        self._decoder_factory = decoder_factory
        self._encoder_factory = encoder_factory or select_encoder
        self._streams: dict[StreamKey, _SharedStream] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, key: StreamKey) -> StreamSubscription:
        async with self._lock:
            stream = self._streams.get(key)
            if stream is None:
                stream = _SharedStream(key, self._decoder_factory, self._encoder_factory)
                self._streams[key] = stream

            metadata = stream.start()
            queue: asyncio.Queue[bytes | str | object] = asyncio.Queue(maxsize=2)
            stream.subscribers.append(queue)
            stream.schedule_decode_start()

            return StreamSubscription(self, key, queue, metadata)

    def subscriber_count(self) -> int:
        return sum(len(stream.subscribers) for stream in self._streams.values())

    def active_stream_count(self) -> int:
        return len(self._streams)

    def last_encode_fps(self) -> float:
        for stream in self._streams.values():
            if stream._encode_fps > 0:
                return stream._encode_fps
        return 0.0

    def last_bytes_per_frame(self) -> float:
        for stream in self._streams.values():
            if stream._bytes_per_frame > 0:
                return stream._bytes_per_frame
        return 0.0

    async def unsubscribe(self, key: StreamKey, queue: asyncio.Queue[Any]) -> None:
        async with self._lock:
            stream = self._streams.get(key)
            if stream is None:
                return
            try:
                stream.subscribers.remove(queue)
            except ValueError:
                return
            if not stream.subscribers:
                await stream.shutdown()
                self._streams.pop(key, None)
