from __future__ import annotations

import asyncio
from typing import ClassVar

import numpy as np
import pytest

from ports.frame_encoder import PixelEncoder
from use_cases.broadcast_hub import BroadcastHub, StreamKey


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
            (None, np.ones((rows, cols, 3), dtype=np.uint8) * 100),
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


@pytest.fixture(autouse=True)
def reset_mock_decoder() -> None:
    MockDecoder.instances.clear()
    MockDecoder.release_count = 0


def pixel_encoder_factory(_pixel_mode: bool, _render_mode: int) -> PixelEncoder:
    return PixelEncoder()


@pytest.mark.asyncio
async def test_two_subscribers_receive_identical_frames() -> None:
    hub = BroadcastHub(decoder_factory=MockDecoder, encoder_factory=pixel_encoder_factory)
    key = StreamKey(
        video_path="test.mp4",
        cols=4,
        rows=3,
        pixel_mode=True,
        render_mode=5,
    )

    sub_a = await hub.subscribe(key)
    sub_b = await hub.subscribe(key)

    payloads_a: list[bytes] = []
    payloads_b: list[bytes] = []

    async def collect(sub, out: list[bytes]) -> None:
        async for payload in sub:
            out.append(payload)

    await asyncio.gather(collect(sub_a, payloads_a), collect(sub_b, payloads_b))

    assert len(payloads_a) == 3
    assert payloads_a == payloads_b
    for payload in payloads_a:
        assert isinstance(payload, bytes)
        assert len(payload) == 4 + 3 * 4 * 3

    await hub.unsubscribe(key, sub_a.queue)
    await hub.unsubscribe(key, sub_b.queue)


@pytest.mark.asyncio
async def test_refcount_releases_decoder_once() -> None:
    hub = BroadcastHub(decoder_factory=MockDecoder, encoder_factory=pixel_encoder_factory)
    key = StreamKey(
        video_path="clip.mp4",
        cols=2,
        rows=2,
        pixel_mode=True,
        render_mode=5,
    )

    sub_a = await hub.subscribe(key)
    sub_b = await hub.subscribe(key)
    assert len(MockDecoder.instances) == 1

    async def drain(sub) -> None:
        async for _ in sub:
            pass

    task_a = asyncio.create_task(drain(sub_a))
    task_b = asyncio.create_task(drain(sub_b))
    await asyncio.gather(task_a, task_b)

    await hub.unsubscribe(key, sub_a.queue)
    assert MockDecoder.release_count == 0

    await hub.unsubscribe(key, sub_b.queue)
    assert MockDecoder.release_count == 1
