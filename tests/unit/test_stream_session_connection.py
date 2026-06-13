import pytest

from ports.connection import ConnectionClosedError
from use_cases.stream_session import StreamSession


class FakeConnection:
    def __init__(self) -> None:
        self.sent: list[bytes | str] = []
        self._closed = False

    async def send_text(self, text: str) -> None:
        self.sent.append(text)

    async def send_bytes(self, data: bytes) -> None:
        self.sent.append(data)

    async def close(self) -> None:
        self._closed = True

    @property
    def closed(self) -> bool:
        return self._closed


class FailingConnection(FakeConnection):
    async def send_text(self, text: str) -> None:
        raise ConnectionClosedError()


class RecordingProvider:
    def __init__(self, *, return_value: bool = True, raise_on_stream: bool = False) -> None:
        self.calls: list[tuple] = []
        self._return_value = return_value
        self._raise_on_stream = raise_on_stream

    async def stream_entry(
        self,
        conn,
        video_path: str,
        render_mode: int,
        pixel_mode: bool,
        cols: int,
        rows: int,
        session_id: str,
    ) -> bool:
        self.calls.append((video_path, render_mode, pixel_mode, cols, rows, session_id))
        if self._raise_on_stream:
            raise ConnectionClosedError()
        await conn.send_text(f"INIT:24:{render_mode}:{cols}:{rows}:{int(pixel_mode)}:{session_id}")
        return self._return_value


@pytest.mark.asyncio
async def test_empty_queue_sends_error() -> None:
    conn = FakeConnection()
    provider = RecordingProvider()
    session = StreamSession(provider=provider)
    await session.run(conn, [], loop_flag=False)
    assert conn.sent[0] == "Error: No video in queue!"


@pytest.mark.asyncio
async def test_provider_receives_stream_entry(monkeypatch) -> None:
    monkeypatch.setattr(
        "use_cases.stream_session.get_video_dimensions",
        lambda _path: (640, 480),
    )
    monkeypatch.setattr(
        "use_cases.stream_session.resolve_grid_size",
        lambda cols, _w, _h, _pixel, **kwargs: (cols, 4),
    )

    conn = FakeConnection()
    provider = RecordingProvider(return_value=False)
    session = StreamSession(provider=provider)
    queue = [{"video": "clip.mp4", "mode": 3, "vol": 0, "pixel": False, "cols": 8, "rows": 4}]

    await session.run(conn, queue, loop_flag=False)

    assert len(provider.calls) == 1
    assert provider.calls[0][0] == "clip.mp4"
    assert conn.sent[0].startswith("INIT:")


@pytest.mark.asyncio
async def test_connection_closed_exits_cleanly(monkeypatch) -> None:
    monkeypatch.setattr(
        "use_cases.stream_session.get_video_dimensions",
        lambda _path: (640, 480),
    )
    monkeypatch.setattr(
        "use_cases.stream_session.resolve_grid_size",
        lambda cols, _w, _h, _pixel, **kwargs: (cols, 4),
    )

    conn = FakeConnection()
    provider = RecordingProvider(raise_on_stream=True)
    session = StreamSession(provider=provider)
    queue = [{"video": "clip.mp4", "mode": 3, "vol": 0, "pixel": False, "cols": 8, "rows": 4}]

    await session.run(conn, queue, loop_flag=False)
