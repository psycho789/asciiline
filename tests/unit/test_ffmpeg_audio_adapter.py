import asyncio
from unittest.mock import MagicMock

import pytest

from adapters import ffmpeg_audio


class HungStdout:
    async def read(self, _n: int) -> bytes:
        await asyncio.sleep(3600)
        return b""


class EmptyStderr:
    async def read(self, _limit: int) -> bytes:
        return b""


@pytest.mark.asyncio
async def test_async_audio_read_timeout_logs_error(caplog) -> None:
    process = MagicMock()
    process.stdout = HungStdout()
    process.stderr = EmptyStderr()
    process.returncode = None
    process.kill = MagicMock()

    async def fake_wait() -> int:
        process.returncode = 0
        return 0

    process.wait = fake_wait

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        return process

    caplog.set_level("ERROR")
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
        mp.setattr(ffmpeg_audio, "READ_TIMEOUT_SEC", 0.01)

        chunks: list[bytes] = []
        async for chunk in ffmpeg_audio.async_audio_stream("video.mp4", 1.0):
            chunks.append(chunk)

    assert chunks == []
    assert any("FFmpeg read timeout" in record.message for record in caplog.records)
    assert process.kill.call_count == 1


@pytest.mark.asyncio
async def test_vol_zero_returns_without_spawning(monkeypatch) -> None:
    spawned = False

    async def fake_create(*_args, **_kwargs):
        nonlocal spawned
        spawned = True
        raise AssertionError("should not spawn ffmpeg")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create)

    from fastapi import Response
    from fastapi.testclient import TestClient

    from adapters.fastapi_routes import create_app
    from use_cases.stream_session import StreamSession

    queue = [{"video": "video.mp4", "mode": 3, "vol": 0, "pixel": False, "cols": 8, "rows": 4}]
    app = create_app(queue=queue, loop_flag=False)
    session = StreamSession()
    app.state.session_registry.register(session)

    with TestClient(app) as client:
        resp = client.get(f"/audio?session={session.session_id}")
        assert resp.status_code == 204
        assert isinstance(resp, Response) or resp.status_code == 204

    assert spawned is False
