import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from adapters.fastapi_routes import create_app
from use_cases.stream_session import StreamSession


class _NoopProvider:
    async def stream_entry(self, *args, **kwargs):
        return True


@pytest.fixture
def captured_ffmpeg_args(monkeypatch):
    calls: list[list[str]] = []

    async def fake_create_subprocess_exec(*args, **_kwargs):
        calls.append(list(args))
        process = MagicMock()
        process.stdout = _EmptyStdout()
        process.stderr = AsyncMock(return_value=b"")
        process.returncode = 0
        process.kill = MagicMock()
        process.wait = AsyncMock(return_value=0)
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    return calls


class _EmptyStdout:
    async def read(self, _n: int) -> bytes:
        return b""


def test_audio_selects_video_path_per_session_queue_index(captured_ffmpeg_args, tmp_path):
    video_a = tmp_path / "a.mp4"
    video_b = tmp_path / "b.mp4"
    video_a.write_bytes(b"fake")
    video_b.write_bytes(b"fake")

    queue = [
        {"video": str(video_a), "mode": 3, "vol": 2, "pixel": False, "cols": 8, "rows": 4},
        {"video": str(video_b), "mode": 3, "vol": 2, "pixel": False, "cols": 8, "rows": 4},
    ]
    app = create_app(queue=queue, loop_flag=False)

    session_a = StreamSession(provider=_NoopProvider(), session_registry=app.state.session_registry)
    session_a.queue_index = 0
    app.state.session_registry.register(session_a)

    session_b = StreamSession(provider=_NoopProvider(), session_registry=app.state.session_registry)
    session_b.queue_index = 1
    app.state.session_registry.register(session_b)

    with TestClient(app) as client:
        resp_a = client.get(f"/audio?session={session_a.session_id}")
        resp_b = client.get(f"/audio?session={session_b.session_id}")
        assert resp_a.status_code == 200
        assert resp_b.status_code == 200

    assert len(captured_ffmpeg_args) == 2
    assert captured_ffmpeg_args[0][captured_ffmpeg_args[0].index("-i") + 1] == str(video_a)
    assert captured_ffmpeg_args[1][captured_ffmpeg_args[1].index("-i") + 1] == str(video_b)
