from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable

from fastapi import WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from ascii_video_player2 import VideoDecoder
from ports.frame_encoder import select_encoder
from use_cases.broadcast_hub import BroadcastHub, StreamKey
from use_cases.video_geometry import calc_auto_rows, get_video_dimensions

logger = logging.getLogger(__name__)


class SessionRegistry:
    """Maps session_id to active StreamSession instances for audio routing."""

    def __init__(self) -> None:
        self._sessions: dict[str, StreamSession] = {}

    def register(self, session: StreamSession) -> None:
        self._sessions[session.session_id] = session

    def unregister(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def get(self, session_id: str) -> StreamSession | None:
        return self._sessions.get(session_id)


class StreamSession:
    def __init__(
        self,
        session_registry: SessionRegistry | None = None,
        hub: BroadcastHub | None = None,
        decoder_factory: Callable[..., VideoDecoder] = VideoDecoder,
    ) -> None:
        self.session_id = str(uuid.uuid4())
        self.queue_index = 0
        self.session_registry = session_registry
        self._hub = hub
        self._decoder_factory = decoder_factory
        self.logger = logging.getLogger(__name__)

    async def run(self, websocket: WebSocket, queue: list, loop_flag: bool) -> None:
        if self.session_registry is not None:
            self.session_registry.register(self)

        try:
            if not queue:
                await websocket.send_text("Error: No video in queue!")
                await websocket.close()
                return

            while True:
                entry = queue[self.queue_index]
                video_path = entry["video"]
                render_mode = entry["mode"]
                pixel_mode = entry.get("pixel", False)
                cols = entry.get("cols", 200)
                rows_cfg = entry.get("rows", 0)

                self.logger.info(
                    "Playing queue entry %s/%s: %s mode=%s pixel=%s vol=%s",
                    self.queue_index + 1,
                    len(queue),
                    video_path,
                    render_mode,
                    pixel_mode,
                    entry["vol"],
                    extra={"session_id": self.session_id},
                )

                try:
                    vid_w, vid_h = get_video_dimensions(video_path)
                except FileNotFoundError:
                    await websocket.send_text(f"Error: '{video_path}' not found!")
                    if not self._advance_queue(len(queue), loop_flag):
                        break
                    continue

                if rows_cfg == 0:
                    rows = calc_auto_rows(cols, vid_w, vid_h, pixel_mode)
                    self.logger.info(
                        "Auto rows: %sx%s -> grid %sx%s",
                        vid_w,
                        vid_h,
                        cols,
                        rows,
                        extra={"session_id": self.session_id},
                    )
                else:
                    rows = rows_cfg

                if self._hub is not None:
                    finished = await self._stream_via_hub(
                        websocket,
                        video_path,
                        render_mode,
                        pixel_mode,
                        cols,
                        rows,
                    )
                else:
                    finished = await self._stream_via_local_decoder(
                        websocket,
                        video_path,
                        render_mode,
                        pixel_mode,
                        cols,
                        rows,
                    )

                if not finished:
                    break

                if not self._advance_queue(len(queue), loop_flag):
                    break

        except (WebSocketDisconnect, ConnectionClosed):
            self.logger.info(
                "Client disconnected",
                extra={"session_id": self.session_id},
            )

    async def _stream_via_hub(
        self,
        websocket: WebSocket,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
    ) -> bool:
        """Subscribe to shared decode; returns False when video ended normally."""
        assert self._hub is not None
        key = StreamKey(
            video_path=video_path,
            cols=cols,
            rows=rows,
            pixel_mode=pixel_mode,
            render_mode=render_mode,
        )
        try:
            subscription = await self._hub.subscribe(key)
        except FileNotFoundError:
            await websocket.send_text(f"Error: '{video_path}' not found!")
            return True
        metadata = subscription.metadata
        effective_fps = metadata.effective_fps
        frame_t = 1.0 / effective_fps

        await websocket.send_text(
            f"INIT:{effective_fps}:{render_mode}:{cols}:{rows}:{int(pixel_mode)}:{self.session_id}"
        )
        if metadata.skip_n > 1:
            self.logger.info(
                "FPS cap: skip every %s frames (effective_fps=%s)",
                metadata.skip_n,
                effective_fps,
                extra={"session_id": self.session_id},
            )

        start_time = asyncio.get_running_loop().time()
        frame_index = 0

        try:
            async for payload in subscription:
                if isinstance(payload, str):
                    await websocket.send_text(payload)
                else:
                    await websocket.send_bytes(payload)

                elapsed = asyncio.get_running_loop().time() - start_time
                wait = (frame_index * frame_t) - elapsed
                if wait > 0:
                    await asyncio.sleep(wait)
                frame_index += 1
        finally:
            await self._hub.unsubscribe(key, subscription.queue)

        return True

    async def _stream_via_local_decoder(
        self,
        websocket: WebSocket,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
    ) -> bool:
        """Fallback path when no hub is injected (tests / legacy)."""
        max_fps = 30

        try:
            decoder = self._decoder_factory(video_path, cols, rows, skip_gray=pixel_mode)
        except FileNotFoundError:
            await websocket.send_text(f"Error: '{video_path}' not found!")
            return True

        source_fps = decoder.fps
        encoder = select_encoder(pixel_mode, render_mode)
        encoder.prepare(rows, cols, render_mode)

        if source_fps > max_fps:
            skip_n = round(source_fps / max_fps)
            effective_fps = source_fps / skip_n
        else:
            skip_n = 1
            effective_fps = source_fps
        frame_t = 1.0 / effective_fps

        await websocket.send_text(
            f"INIT:{effective_fps}:{render_mode}:{cols}:{rows}:{int(pixel_mode)}:{self.session_id}"
        )

        start_time = asyncio.get_running_loop().time()
        frame_index = 0

        try:
            while True:
                for _ in range(skip_n - 1):
                    if not decoder.grab():
                        break

                try:
                    gray_frame, bgr_frame = next(decoder)
                except StopIteration:
                    break

                payload = encoder.encode(
                    frame_index,
                    gray_frame,
                    bgr_frame,
                    render_mode,
                    pixel_mode,
                    rows,
                    cols,
                )
                if isinstance(payload, str):
                    await websocket.send_text(payload)
                else:
                    await websocket.send_bytes(payload)

                elapsed = asyncio.get_running_loop().time() - start_time
                wait = (frame_index * frame_t) - elapsed
                if wait > 0:
                    await asyncio.sleep(wait)

                frame_index += 1
        finally:
            decoder.release()

        return True

    def _advance_queue(self, queue_len: int, loop_flag: bool) -> bool:
        """Advance queue_index. Returns False when streaming should stop."""
        self.queue_index += 1
        if self.queue_index >= queue_len:
            if loop_flag:
                self.logger.info(
                    "Looping queue from beginning",
                    extra={"session_id": self.session_id},
                )
                self.queue_index = 0
                return True
            self.logger.info(
                "All videos finished",
                extra={"session_id": self.session_id},
            )
            return False
        return True
