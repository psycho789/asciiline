import argparse
import json

from use_cases.build_playlist import build_queue, load_folder, load_playlist, resolve_video_path


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


def test_playlist_partial_fields_use_global_defaults(tmp_path):
    playlist_path = tmp_path / "partial.json"
    playlist_path.write_text(
        json.dumps([{"video": "clip.mp4", "mode": 4}]),
        encoding="utf-8",
    )
    queue = build_queue(_args(playlist=str(playlist_path), vol=2, mode=1, pixel=False))
    assert queue[0]["mode"] == 4
    assert queue[0]["vol"] == 2
    assert queue[0]["pixel"] is False
    assert queue[0]["cols"] == 200


def test_folder_scan_priority_over_single_video(tmp_path):
    folder = tmp_path / "vids"
    folder.mkdir()
    (folder / "a.mp4").write_bytes(b"fake")
    queue = build_queue(_args(video="ignored.mp4", folder=str(folder)))
    assert len(queue) == 1
    assert queue[0]["video"].endswith("a.mp4")


def test_resolve_as_is_absolute_path(tmp_path, monkeypatch):
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake")
    monkeypatch.setattr("use_cases.build_playlist.BASE_DIR", str(tmp_path / "project"))
    assert resolve_video_path(str(video)) == str(video)


def test_resolve_under_base_dir(tmp_path, monkeypatch):
    base = tmp_path / "project"
    base.mkdir()
    video = base / "clip.mp4"
    video.write_bytes(b"fake")
    monkeypatch.setattr("use_cases.build_playlist.BASE_DIR", str(base))
    assert resolve_video_path("clip.mp4") == str(video)


def test_resolve_under_videos_subfolder(tmp_path, monkeypatch):
    base = tmp_path / "project"
    videos = base / "videos"
    videos.mkdir(parents=True)
    video = videos / "clip.mp4"
    video.write_bytes(b"fake")
    monkeypatch.setattr("use_cases.build_playlist.BASE_DIR", str(base))
    assert resolve_video_path("clip.mp4") == str(video)


def test_resolve_returns_original_when_missing(tmp_path, monkeypatch):
    base = tmp_path / "project"
    base.mkdir()
    monkeypatch.setattr("use_cases.build_playlist.BASE_DIR", str(base))
    assert resolve_video_path("missing.mp4") == "missing.mp4"


def test_load_playlist_resolves_paths(tmp_path, monkeypatch):
    base = tmp_path / "project"
    videos = base / "videos"
    videos.mkdir(parents=True)
    video = videos / "x.mp4"
    video.write_bytes(b"fake")
    monkeypatch.setattr("use_cases.build_playlist.BASE_DIR", str(base))
    playlist_path = tmp_path / "pl.json"
    playlist_path.write_text(json.dumps([{"video": "x.mp4"}]), encoding="utf-8")
    items = load_playlist(str(playlist_path))
    assert items[0]["video"] == str(video)


def test_load_folder_returns_all_videos(tmp_path):
    folder = tmp_path / "folder"
    folder.mkdir()
    (folder / "b.mp4").write_bytes(b"b")
    (folder / "a.mp4").write_bytes(b"a")
    items = load_folder(str(folder), default_mode=3, default_vol=1)
    names = {item["video"].split("/")[-1] for item in items}
    assert names == {"a.mp4", "b.mp4"}
    assert all(item["mode"] == 3 and item["vol"] == 1 for item in items)
