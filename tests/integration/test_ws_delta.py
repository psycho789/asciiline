"""Integration tests for delta encoding (render_mode=6) over WebSocket."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from adapters.fastapi_routes import create_app


def _write_tiny_video(path, frames: int = 3) -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(path), fourcc, 24.0, (64, 48))
    for i in range(frames):
        frame = np.full((48, 64, 3), i * 40, dtype=np.uint8)
        out.write(frame)
    out.release()


@pytest.fixture
def delta_video(tmp_path):
    video_path = tmp_path / "delta.mp4"
    _write_tiny_video(video_path, frames=3)
    return str(video_path)


def test_ws_init_mode_6(delta_video) -> None:
    queue = [
        {
            "video": delta_video,
            "mode": 6,
            "vol": 0,
            "pixel": False,
            "cols": 80,
            "rows": 0,
        }
    ]
    app = create_app(queue=queue, loop_flag=False)
    with TestClient(app) as client:
        with client.websocket_connect("/ws?cols=80&aspect=auto") as ws:
            init = ws.receive_text()
            assert init.startswith("INIT:")
            parts = init.split(":")
            assert int(parts[2]) == 6
            assert int(parts[3]) == 80

            frame_types: list[int] = []
            for _ in range(3):
                data = ws.receive_bytes()
                assert len(data) >= 5
                frame_types.append(data[4])
            assert frame_types[0] == 0x00
            assert 0x01 in frame_types[1:]
