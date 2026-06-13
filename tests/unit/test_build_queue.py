import argparse
import json

from use_cases.build_playlist import build_queue


def _args(**overrides):
    defaults = {
        "video": "solo.mp4",
        "playlist": None,
        "folder": None,
        "mode": 3,
        "pixel": False,
        "cols": None,
        "rows": 0,
        "vol": 1,
        "loop": False,
        "port": 8000,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def test_single_video_default_cols_ascii():
    queue = build_queue(_args(video="solo.mp4"))
    assert len(queue) == 1
    assert queue[0]["video"] == "solo.mp4"
    assert queue[0]["cols"] == 200
    assert queue[0]["mode"] == 3
    assert queue[0]["vol"] == 1
    assert queue[0]["pixel"] is False


def test_single_video_default_cols_pixel():
    queue = build_queue(_args(video="solo.mp4", pixel=True))
    assert queue[0]["cols"] == 450


def test_playlist_overrides_single_video(tmp_path):
    playlist_path = tmp_path / "playlist.json"
    playlist_path.write_text(
        json.dumps([{"video": "from-playlist.mp4", "mode": 5, "vol": 3}]),
        encoding="utf-8",
    )
    queue = build_queue(_args(video="ignored.mp4", playlist=str(playlist_path)))
    assert len(queue) == 1
    assert queue[0]["video"] == "from-playlist.mp4"
    assert queue[0]["mode"] == 5
    assert queue[0]["vol"] == 3


def test_playlist_fills_missing_defaults(tmp_path):
    playlist_path = tmp_path / "playlist.json"
    playlist_path.write_text(json.dumps([{"video": "a.mp4"}]), encoding="utf-8")
    queue = build_queue(
        _args(
            playlist=str(playlist_path),
            mode=2,
            vol=4,
            pixel=True,
            cols=320,
            rows=90,
        )
    )
    item = queue[0]
    assert item["mode"] == 2
    assert item["vol"] == 4
    assert item["pixel"] is True
    assert item["cols"] == 320
    assert item["rows"] == 90
