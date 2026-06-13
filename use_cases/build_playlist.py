import json
import logging
import os

from adapters.paths import BASE_DIR

logger = logging.getLogger(__name__)


def resolve_video_path(video: str) -> str:
    """
    Resolves a video path by checking multiple locations in order:
      1. As-is (absolute or relative to CWD)
      2. Inside the project root (BASE_DIR)
      3. Inside BASE_DIR/videos/ subfolder
    Returns the first path that exists, or the original string if none found.
    """
    candidates = [
        video,
        os.path.join(BASE_DIR, video),
        os.path.join(BASE_DIR, "videos", os.path.basename(video)),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return video


def load_playlist(playlist_path: str) -> list[dict]:
    """Loads playlist from a JSON file and resolves all video paths."""
    with open(playlist_path, encoding="utf-8") as f:
        items = json.load(f)
    for item in items:
        item["video"] = resolve_video_path(item["video"])
    return items


def load_folder(folder_path: str, default_mode: int, default_vol: int) -> list[dict]:
    """
    Scans a folder for video files in filesystem order (top to bottom,
    as they appear in the directory — not alphabetically sorted).
    """
    supported = (".mp4", ".mkv", ".avi", ".mov", ".webm")
    entries = []
    with os.scandir(folder_path) as it:
        for entry in it:
            if entry.is_file() and entry.name.lower().endswith(supported):
                entries.append({"video": entry.path, "mode": default_mode, "vol": default_vol})
    return entries


def build_queue(args) -> list[dict]:
    """
    Builds the video queue based on argument priority:
      1. --playlist JSON file
      2. --folder directory
      3. Single positional video argument
    """
    if args.playlist:
        logger.info("Loading playlist: %s", args.playlist)
        items = load_playlist(args.playlist)
        for item in items:
            item.setdefault("mode", args.mode)
            item.setdefault("vol", args.vol)
            item.setdefault("pixel", args.pixel)

            is_pixel = item.get("pixel", False)
            default_cols = args.cols if args.cols is not None else (450 if is_pixel else 200)
            item.setdefault("cols", default_cols)
            item.setdefault("rows", args.rows)
        return items

    if args.folder:
        logger.info("Scanning folder: %s", args.folder)
        items = load_folder(args.folder, args.mode, args.vol)
        default_cols = args.cols if args.cols is not None else (450 if args.pixel else 200)
        for item in items:
            item["pixel"] = args.pixel
            item["cols"] = default_cols
            item["rows"] = args.rows
        return items

    default_cols = args.cols if args.cols is not None else (450 if args.pixel else 200)
    return [
        {
            "video": resolve_video_path(args.video),
            "mode": args.mode,
            "vol": args.vol,
            "pixel": args.pixel,
            "cols": default_cols,
            "rows": args.rows,
        }
    ]
