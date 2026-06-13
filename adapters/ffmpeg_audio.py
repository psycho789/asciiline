import asyncio
import logging
import os
from collections.abc import AsyncIterator

from fastapi import HTTPException, Response
from fastapi.responses import StreamingResponse

from use_cases.stream_session import SessionRegistry

logger = logging.getLogger(__name__)

READ_TIMEOUT_SEC = 5.0
CANCEL_WAIT_SEC = 1.0


def _ffmpeg_args(video_path: str, ffmpeg_vol: float) -> list[str]:
    return [
        "ffmpeg",
        "-i",
        video_path,
        "-vn",
        "-filter:a",
        f"volume={ffmpeg_vol}",
        "-acodec",
        "libmp3lame",
        "-ab",
        "128k",
        "-ar",
        "44100",
        "-f",
        "mp3",
        "-loglevel",
        "quiet",
        "pipe:1",
    ]


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    process.kill()
    try:
        await asyncio.wait_for(process.wait(), timeout=CANCEL_WAIT_SEC)
    except TimeoutError:
        logger.error("FFmpeg did not exit within cancel window")
    if process.returncode is None:
        process.returncode = -9


async def _read_stderr_snippet(process: asyncio.subprocess.Process, limit: int = 500) -> str:
    if process.stderr is None:
        return ""
    try:
        data = await asyncio.wait_for(process.stderr.read(limit), timeout=1.0)
    except TimeoutError:
        return ""
    return data.decode(errors="replace").strip()


async def async_audio_stream(video_path: str, ffmpeg_vol: float) -> AsyncIterator[bytes]:
    process = await asyncio.create_subprocess_exec(
        *_ffmpeg_args(video_path, ffmpeg_vol),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        while True:
            try:
                chunk = await asyncio.wait_for(process.stdout.read(4096), timeout=READ_TIMEOUT_SEC)
            except TimeoutError:
                logger.error(
                    "FFmpeg read timeout",
                    extra={"video_path": video_path},
                )
                await _terminate_process(process)
                break
            if not chunk:
                break
            yield chunk
    finally:
        await _terminate_process(process)
        return_code = process.returncode
        if return_code not in (0, None, -15):
            stderr_snippet = await _read_stderr_snippet(process)
            logger.error(
                "FFmpeg exited with code %s for video: %s stderr=%s",
                return_code,
                video_path,
                stderr_snippet,
            )


def stream_audio_for_session(
    session_id: str,
    queue: list[dict],
    registry: SessionRegistry,
) -> Response | StreamingResponse:
    session = registry.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    idx = session.queue_index
    entry = queue[idx] if queue and idx < len(queue) else {}

    vol_level = entry.get("vol", 1)
    video_path = entry.get("video", "video.mp4")

    if vol_level <= 0:
        return Response(status_code=204)

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    ffmpeg_vol = 1.0 + (vol_level - 1) * 0.25
    return StreamingResponse(
        async_audio_stream(video_path, ffmpeg_vol),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
