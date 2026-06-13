from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Protocol

from ascii_video_player2 import VideoDecoder
from ports.connection import Connection
from ports.frame_encoder import FrameEncoder, select_encoder
from use_cases.broadcast_hub import BroadcastHub, StreamKey
from use_cases.effective_fps import effective_fps

logger = logging.getLogger(__name__)


def build_init_message(
    fps: float,
    render_mode: int,
    cols: int,
    rows: int,
    pixel_mode: bool,
    session_id: str,
) -> str:
    return f"INIT:{fps}:{render_mode}:{cols}:{rows}:{int(pixel_mode)}:{session_id}"


class StreamingProvider(Protocol):
    async def stream_entry(
        self,
        conn: Connection,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
        session_id: str,
    ) -> bool: ...


class HubStreamingProvider:
    def __init__(self, hub: BroadcastHub) -> None:
        self._hub = hub
        self.logger = logging.getLogger(__name__)

    async def stream_entry(
        self,
        conn: Connection,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
        session_id: str,
    ) -> bool:
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
            await conn.send_text(f"Error: '{video_path}' not found!")
            return True

        metadata = subscription.metadata
        await conn.send_text(
            build_init_message(
                metadata.effective_fps,
                render_mode,
                cols,
                rows,
                pixel_mode,
                session_id,
            )
        )
        if metadata.skip_n > 1:
            self.logger.info(
                "FPS cap: skip every %s frames (effective_fps=%s)",
                metadata.skip_n,
                metadata.effective_fps,
                extra={"session_id": session_id},
            )

        try:
            async for payload in subscription:
                if isinstance(payload, str):
                    await conn.send_text(payload)
                else:
                    await conn.send_bytes(payload)
        finally:
            await self._hub.unsubscribe(key, subscription.queue)

        return True


class LocalStreamingProvider:
    def __init__(
        self,
        decoder_factory: Callable[..., VideoDecoder] = VideoDecoder,
        encoder_factory: Callable[..., FrameEncoder] | None = None,
    ) -> None:
        self._decoder_factory = decoder_factory
        self._encoder_factory = encoder_factory or select_encoder
        self.logger = logging.getLogger(__name__)

    async def stream_entry(
        self,
        conn: Connection,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
        session_id: str,
    ) -> bool:
        try:
            decoder = self._decoder_factory(video_path, cols, rows, skip_gray=pixel_mode)
        except FileNotFoundError:
            await conn.send_text(f"Error: '{video_path}' not found!")
            return True

        source_fps = decoder.fps
        capped_fps, skip_n = effective_fps(source_fps)
        encoder = self._encoder_factory(pixel_mode, render_mode)
        encoder.prepare(rows, cols, render_mode, pixel_mode)
        frame_t = 1.0 / capped_fps

        await conn.send_text(
            build_init_message(capped_fps, render_mode, cols, rows, pixel_mode, session_id)
        )

        start_time = asyncio.get_running_loop().time()
        frame_index = 0

        with decoder:
            while True:
                for _ in range(skip_n - 1):
                    if not decoder.grab():
                        break

                try:
                    gray_frame, bgr_frame = next(decoder)
                except StopIteration:
                    break

                payload = encoder.encode(frame_index, gray_frame, bgr_frame)
                if isinstance(payload, str):
                    await conn.send_text(payload)
                else:
                    await conn.send_bytes(payload)

                elapsed = asyncio.get_running_loop().time() - start_time
                wait = (frame_index * frame_t) - elapsed
                if wait > 0:
                    await asyncio.sleep(wait)

                frame_index += 1

        return True
