from use_cases.build_playlist import resolve_video_path


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
