import asyncio
import struct

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from adapters.fastapi_routes import create_app
from ascii_video_player2 import VideoDecoder
from use_cases import broadcast_hub


def _write_tiny_video(path, frames: int = 3) -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(path), fourcc, 24.0, (64, 48))
    for i in range(frames):
        frame = np.full((48, 64, 3), i * 40, dtype=np.uint8)
        out.write(frame)
    out.release()


@pytest.fixture
def tiny_video(tmp_path):
    video_path = tmp_path / "test.mp4"
    _write_tiny_video(video_path)
    return str(video_path)


@pytest.fixture
def wait_for_two_subscribers(monkeypatch):
    """Delay shared decode until both WebSocket clients have subscribed."""
    original = broadcast_hub._SharedStream._decode_loop

    async def patched_decode_loop(self):
        for _ in range(200):
            if len(self.subscribers) >= 2:
                break
            await asyncio.sleep(0.01)
        await original(self)

    monkeypatch.setattr(broadcast_hub._SharedStream, "_decode_loop", patched_decode_loop)


def test_single_decoder_for_two_websocket_clients(
    tiny_video, monkeypatch, wait_for_two_subscribers
):
    decoder_count = 0
    real_init = VideoDecoder.__init__

    def counting_init(self, *args, **kwargs):
        nonlocal decoder_count
        decoder_count += 1
        return real_init(self, *args, **kwargs)

    monkeypatch.setattr(VideoDecoder, "__init__", counting_init)

    queue = [
        {
            "video": tiny_video,
            "mode": 5,
            "vol": 0,
            "pixel": True,
            "cols": 8,
            "rows": 6,
        }
    ]
    app = create_app(queue=queue, loop_flag=False)

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws_a:
            init_a = ws_a.receive_text()
            with client.websocket_connect("/ws") as ws_b:
                init_b = ws_b.receive_text()
                frame_a = ws_a.receive_bytes()
                frame_b = ws_b.receive_bytes()

    assert init_a.startswith("INIT:")
    assert init_b.startswith("INIT:")

    parts_a = init_a.split(":")
    parts_b = init_b.split(":")
    assert int(parts_a[3]) == int(parts_b[3])
    assert int(parts_a[4]) == int(parts_b[4])

    idx_a = struct.unpack(">I", frame_a[:4])[0]
    idx_b = struct.unpack(">I", frame_b[:4])[0]
    assert idx_a == idx_b == 0
    assert len(frame_a) == len(frame_b)
    assert decoder_count == 1
