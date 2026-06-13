from __future__ import annotations

import logging
import uuid

from ports.connection import Connection, ConnectionClosedError
from use_cases.stream_prefs import StreamPrefs
from use_cases.streaming_provider import StreamingProvider
from use_cases.video_geometry import get_video_dimensions, resolve_grid_size

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
        provider: StreamingProvider,
        session_registry: SessionRegistry | None = None,
    ) -> None:
        self.session_id = str(uuid.uuid4())
        self.queue_index = 0
        self.session_registry = session_registry
        self._provider = provider
        self.logger = logging.getLogger(__name__)

    async def run(
        self,
        conn: Connection,
        queue: list,
        loop_flag: bool,
        stream_prefs: StreamPrefs | None = None,
    ) -> None:
        if self.session_registry is not None:
            self.session_registry.register(self)

        try:
            if not queue:
                await conn.send_text("Error: No video in queue!")
                await conn.close()
                return

            while True:
                entry = queue[self.queue_index]
                video_path = entry["video"]
                render_mode = entry["mode"]
                pixel_mode = entry.get("pixel", False)
                cols = entry.get("cols", 200)
                if stream_prefs is not None and stream_prefs.cols is not None:
                    cols = stream_prefs.cols
                rows_cfg = entry.get("rows", 0)
                aspect_preset = stream_prefs.aspect if stream_prefs is not None else "auto"

                self.logger.info(
                    "Playing queue entry %s/%s: %s mode=%s pixel=%s vol=%s cols=%s aspect=%s",
                    self.queue_index + 1,
                    len(queue),
                    video_path,
                    render_mode,
                    pixel_mode,
                    entry["vol"],
                    cols,
                    aspect_preset,
                    extra={"session_id": self.session_id},
                )

                try:
                    vid_w, vid_h = get_video_dimensions(video_path)
                except FileNotFoundError:
                    await conn.send_text(f"Error: '{video_path}' not found!")
                    if not self._advance_queue(len(queue), loop_flag):
                        break
                    continue

                cols, rows = resolve_grid_size(
                    cols,
                    vid_w,
                    vid_h,
                    pixel_mode,
                    aspect_preset=aspect_preset,
                    rows_cfg=rows_cfg,
                )
                self.logger.info(
                    "Grid %sx%s (source %sx%s aspect=%s)",
                    cols,
                    rows,
                    vid_w,
                    vid_h,
                    aspect_preset,
                    extra={"session_id": self.session_id},
                )

                finished = await self._provider.stream_entry(
                    conn,
                    video_path,
                    render_mode,
                    pixel_mode,
                    cols,
                    rows,
                    self.session_id,
                )

                if not finished:
                    break

                if not self._advance_queue(len(queue), loop_flag):
                    break

        except ConnectionClosedError:
            self.logger.info(
                "Client disconnected",
                extra={"session_id": self.session_id},
            )
        else:
            try:
                await conn.send_text("DONE:")
            except ConnectionClosedError:
                pass
        finally:
            if self.session_registry is not None:
                self.session_registry.unregister(self.session_id)

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
