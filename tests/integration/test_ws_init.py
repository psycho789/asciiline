import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from adapters.fastapi_routes import create_app


def _write_tiny_video(path, frames: int = 2) -> None:
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


def test_ws_init_handshake(tiny_video):
    queue = [
        {
            "video": tiny_video,
            "mode": 3,
            "vol": 0,
            "pixel": False,
            "cols": 8,
            "rows": 4,
        }
    ]
    app = create_app(queue=queue, loop_flag=False)

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            init_msg = ws.receive_text()
            assert init_msg.startswith("INIT:")
            parts = init_msg.split(":")
            assert len(parts) >= 7
            assert float(parts[1]) > 0
            assert int(parts[2]) == 3
            assert int(parts[3]) == 8
            assert int(parts[4]) == 4
            session_id = parts[6]
            assert len(session_id) > 0

            audio_resp = client.get(f"/audio?session={session_id}")
            assert audio_resp.status_code == 204


def test_audio_session_not_found():
    app = create_app(queue=[], loop_flag=False)
    with TestClient(app) as client:
        resp = client.get("/audio?session=nonexistent-id")
        assert resp.status_code == 404
