import asyncio
import logging
import os
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import HTTPException, Response
from fastapi.responses import FileResponse

from use_cases.stream_session import SessionRegistry

logger = logging.getLogger(__name__)

READ_TIMEOUT_SEC = 5.0
CANCEL_WAIT_SEC = 1.0
_AUDIO_CACHE_MAX = 5

_audio_cache: dict[tuple[str, int], Path] = {}
_audio_cache_order: list[tuple[str, int]] = []


def _ffmpeg_args(video_path: str, ffmpeg_vol: float, output_path: str | None = None) -> list[str]:
    args = [
        "ffmpeg",
        "-y",
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
    ]
    if output_path is None:
        args.append("pipe:1")
    else:
        args.append(output_path)
    return args


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


async def _ffmpeg_extract(video_path: str, ffmpeg_vol: float, output_path: Path) -> None:
    process = await asyncio.create_subprocess_exec(
        *_ffmpeg_args(video_path, ffmpeg_vol, str(output_path)),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        return_code = await process.wait()
    finally:
        if process.returncode is None:
            await _terminate_process(process)
            return_code = process.returncode
    if return_code not in (0, None):
        stderr_snippet = await _read_stderr_snippet(process)
        raise RuntimeError(
            f"FFmpeg extract failed code={return_code} video={video_path} stderr={stderr_snippet}"
        )


async def get_or_extract_audio(video_path: str, vol_level: int) -> Path:
    ffmpeg_vol = 1.0 + (vol_level - 1) * 0.25
    key = (video_path, vol_level)
    cached = _audio_cache.get(key)
    if cached is not None and cached.exists():
        if key in _audio_cache_order:
            _audio_cache_order.remove(key)
        _audio_cache_order.append(key)
        return cached

    while len(_audio_cache) >= _AUDIO_CACHE_MAX:
        evict = _audio_cache_order.pop(0)
        evict_path = _audio_cache.pop(evict, None)
        if evict_path is not None:
            evict_path.unlink(missing_ok=True)

    fd, tmp_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    tmp = Path(tmp_path)
    await _ffmpeg_extract(video_path, ffmpeg_vol, tmp)
    _audio_cache[key] = tmp
    _audio_cache_order.append(key)
    return tmp


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


async def stream_audio_for_session(
    session_id: str,
    queue: list[dict],
    registry: SessionRegistry,
) -> Response | FileResponse:
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

    audio_path = await get_or_extract_audio(video_path, vol_level)
    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
