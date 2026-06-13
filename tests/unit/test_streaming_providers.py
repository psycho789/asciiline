from __future__ import annotations

import struct
from typing import ClassVar

import numpy as np
import pytest

from ports.frame_encoder import PixelEncoder
from use_cases.effective_fps import effective_fps
from use_cases.streaming_provider import (
    HubStreamingProvider,
    LocalStreamingProvider,
)


class MockDecoder:
    instances: ClassVar[list[MockDecoder]] = []
    release_count: ClassVar[int] = 0

    def __init__(self, path: str, cols: int, rows: int, skip_gray: bool = False) -> None:
        self.path = path
        self.cols = cols
        self.rows = rows
        self.skip_gray = skip_gray
        self.fps = 24.0
        self._frames = [
            (None, np.zeros((rows, cols, 3), dtype=np.uint8)),
            (None, np.ones((rows, cols, 3), dtype=np.uint8) * 50),
        ]
        self._index = 0
        MockDecoder.instances.append(self)

    def __iter__(self):
        return self

    def __next__(self):
        if self._index >= len(self._frames):
            raise StopIteration
        frame = self._frames[self._index]
        self._index += 1
        return frame

    def grab(self) -> bool:
        return self._index < len(self._frames)

    def release(self) -> None:
        MockDecoder.release_count += 1

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.release()


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


@pytest.fixture(autouse=True)
def reset_mock_decoder() -> None:
    MockDecoder.instances.clear()
    MockDecoder.release_count = 0


def test_effective_fps_no_cap() -> None:
    fps, skip_n = effective_fps(24.0)
    assert fps == 24.0
    assert skip_n == 1


def test_effective_fps_caps_at_60() -> None:
    fps, skip_n = effective_fps(120.0)
    assert fps == 60.0
    assert skip_n == 2


def pixel_encoder_factory(_pixel_mode: bool, _render_mode: int) -> PixelEncoder:
    return PixelEncoder()


@pytest.mark.asyncio
async def test_hub_provider_sends_init() -> None:
    from use_cases.broadcast_hub import BroadcastHub

    hub = BroadcastHub(decoder_factory=MockDecoder, encoder_factory=pixel_encoder_factory)
    provider = HubStreamingProvider(hub)
    conn = FakeConnection()

    finished = await provider.stream_entry(
        conn,
        "test.mp4",
        render_mode=5,
        pixel_mode=True,
        cols=4,
        rows=3,
        session_id="sess-1",
    )

    assert finished is True
    assert conn.sent[0].startswith("INIT:")
    parts = conn.sent[0].split(":")
    assert parts[6] == "sess-1"


@pytest.mark.asyncio
async def test_local_provider_sends_frames() -> None:
    provider = LocalStreamingProvider(
        decoder_factory=MockDecoder,
        encoder_factory=pixel_encoder_factory,
    )
    conn = FakeConnection()

    finished = await provider.stream_entry(
        conn,
        "test.mp4",
        render_mode=5,
        pixel_mode=True,
        cols=4,
        rows=3,
        session_id="sess-2",
    )

    assert finished is True
    assert conn.sent[0].startswith("INIT:")
    binary_frames = [item for item in conn.sent if isinstance(item, bytes)]
    assert len(binary_frames) == 2
    assert struct.unpack(">I", binary_frames[0][:4]) == (0,)
    assert MockDecoder.release_count == 1
