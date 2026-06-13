"""
stream_server.py
================
Thin entry point and backward-compatible re-exports for the ASCILINE web server.

Run: python stream_server.py [video] [options]
Implementation lives in cli/, use_cases/, ports/, and adapters/.
"""

from adapters.paths import BASE_DIR
from cli.server_main import main
from use_cases.build_playlist import build_queue, load_folder, load_playlist, resolve_video_path
from use_cases.video_geometry import calc_auto_rows, get_video_dimensions

__all__ = [
    "BASE_DIR",
    "build_queue",
    "calc_auto_rows",
    "get_video_dimensions",
    "load_folder",
    "load_playlist",
    "main",
    "resolve_video_path",
]

if __name__ == "__main__":
    main()
