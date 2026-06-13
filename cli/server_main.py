import argparse
import logging
import os
import shutil
import sys
import threading

import cv2
import uvicorn

from adapters.fastapi_routes import create_app
from use_cases.build_playlist import build_queue

logger = logging.getLogger(__name__)

ASCII_LOGO = (
    "\033[36m"
    + r"""
    _    ____   ____ ___ _     ___ _   _ _____
   / \  / ___| / ___|_ _| |   |_ _| \ | | ____|
  / _ \ \___ \| |    | || |    | ||  \| |  _|
 / ___ \ ___) | |___ | || |___ | || |\  | |___
/_/   \_\____/ \____|___|_____|___|_| \_|_____|
"""
    + "\033[0m"
)

HELP_TEXT = (
    "\033[1;37m"
    + """
╔═══════════════════════════════════════════════════╗
║               ASCILINE  —  COMMANDS               ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  \033[36m/help\033[1;37m      Show this help message               ║
║  \033[36m/status\033[1;37m    Show current server & playback info  ║
║  \033[36m/quit\033[1;37m      Stop the server and exit             ║
║                                                   ║
╠═══════════════════════════════════════════════════╣
║             CLI LAUNCH OPTIONS                    ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  \033[33m─── Source ───\033[1;37m                                  ║
║  \033[32mvideo\033[1;37m          Path to a single video file      ║
║  \033[32m--playlist\033[1;37m     JSON playlist file               ║
║  \033[32m--folder\033[1;37m       Play all videos in a folder      ║
║                                                   ║
║  \033[33m─── Render ───\033[1;37m                                  ║
║  \033[32m--mode\033[1;37m  \033[35m1-5\033[1;37m    Color quality                    ║
║     1=B&W  2=512c  3=32Kc  4=262Kc  5=16M        ║
║  \033[32m--pixel\033[1;37m        Pixel block mode (with mode 2-5) ║
║  \033[32m--cols\033[1;37m  \033[35mN\033[1;37m      Grid columns  (default: 200)     ║
║  \033[32m--rows\033[1;37m  \033[35mN\033[1;37m      Grid rows     (default: auto)    ║
║                                                   ║
║  \033[33m─── Playback ───\033[1;37m                                ║
║  \033[32m--vol\033[1;37m   \033[35m0-5\033[1;37m    Volume (0=mute, 1=normal, 5=2x)  ║
║  \033[32m--loop\033[1;37m         Loop the playlist infinitely     ║
║                                                   ║
║  \033[33m─── Server ───\033[1;37m                                  ║
║  \033[32m--port\033[1;37m  \033[35mN\033[1;37m      Server port    (default: 8000)    ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
"""
    + "\033[0m"
)


def configure_logging(debug: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _log_status(queue: list, loop_flag: bool, default_cols: int, default_rows: int) -> None:
    logger.info("═" * 55)
    logger.info("Queue      : %s video(s)", len(queue))
    logger.info("Now Playing: session-scoped (per WebSocket)")
    res_str = f"{default_cols}x{default_rows}" if default_rows > 0 else f"{default_cols}x(auto)"
    logger.info("Resolution : %s", res_str)
    logger.info("Loop       : %s", "ON" if loop_flag else "OFF")
    logger.info("═" * 55)


def command_loop(queue: list, loop_flag: bool, default_cols: int, default_rows: int) -> None:
    """Interactive command listener — runs in main thread alongside uvicorn."""
    sys.stdout.write(" \033[90mType \033[36m/help\033[90m for available commands.\033[0m\n\n")
    while True:
        try:
            cmd = input().strip().lower()
            if cmd in ("/help", "help"):
                sys.stdout.write(HELP_TEXT + "\n")
            elif cmd in ("/status", "status"):
                _log_status(queue, loop_flag, default_cols, default_rows)
            elif cmd in ("/quit", "quit", "exit"):
                sys.stdout.write("\n \033[33m⏹  Shutting down ASCILINE...\033[0m\n\n")
                os._exit(0)
            elif cmd:
                sys.stdout.write(
                    f" \033[90mUnknown command: '{cmd}'. "
                    f"Type \033[36m/help\033[90m for options.\033[0m\n"
                )
        except (EOFError, KeyboardInterrupt):
            sys.stdout.write("\n \033[33m⏹  Shutting down ASCILINE...\033[0m\n\n")
            os._exit(0)


def _run_uvicorn(**kwargs: object) -> None:
    """Wrapper so exceptions inside the server thread are logged, not silently swallowed."""
    try:
        uvicorn.run(**kwargs)  # type: ignore[arg-type]
    except Exception:
        logger.exception("uvicorn exited with an error")


def main(argv: list[str] | None = None) -> None:
    configure_logging()
    os.system("")

    parser = argparse.ArgumentParser(
        description=f"{ASCII_LOGO}\nReal-Time ASCII Web Server\n"
        "Stream local videos to your browser with high performance ASCII and Pixel rendering.",
        formatter_class=argparse.RawTextHelpFormatter,
    )

    src = parser.add_argument_group("\033[33mSource\033[0m")
    src.add_argument("video", nargs="?", default="video.mp4", help="Single video file to stream")
    src.add_argument(
        "--playlist",
        metavar="FILE",
        default=None,
        help="Path to a playlist JSON file\n"
        '  Format: [{"video": "a.mp4", "mode": 5, "vol": 3}, ...]',
    )
    src.add_argument(
        "--folder",
        metavar="DIR",
        default=None,
        help="Path to a folder; plays all videos in filesystem order",
    )

    render = parser.add_argument_group("\033[33mRender\033[0m")
    render.add_argument(
        "--mode",
        type=int,
        choices=[1, 2, 3, 4, 5, 6],
        default=1,
        help="Color quality: 1=B&W  2=512c  3=32Kc  4=262Kc  5=16M Ultra  6=Delta color",
    )
    render.add_argument(
        "--pixel",
        action="store_true",
        default=False,
        help="Pixel mode: replaces ASCII characters with colored blocks (combine with --mode 2-5)",
    )
    render.add_argument(
        "--cols", type=int, default=None, help="Grid columns (default: 200 for text, 450 for pixel)"
    )
    render.add_argument(
        "--rows", type=int, default=0, help="Grid rows    (default: auto from video aspect ratio)"
    )

    playback = parser.add_argument_group("\033[33mPlayback\033[0m")
    playback.add_argument(
        "--vol", type=int, default=1, help="Volume 0-5  (0=muted, 1=normal, 5=double)"
    )
    playback.add_argument(
        "--loop", action="store_true", default=False, help="Loop the queue infinitely"
    )

    srv = parser.add_argument_group("\033[33mServer\033[0m")
    srv.add_argument("--port", type=int, default=8000, help="Server port (default: 8000)")
    srv.add_argument(
        "--debug",
        action="store_true",
        default=False,
        help="Debug mode: Python DEBUG logging + uvicorn access logs",
    )

    srv.add_argument(
        "--render-to",
        metavar="FILE",
        default=None,
        help="Pre-render video to ASCLBIN static file and exit (no server)",
    )

    args = parser.parse_args(argv)

    if args.debug:
        configure_logging(debug=True)

    if args.pixel and args.mode == 1:
        logger.error("--pixel requires a color mode (--mode 2-5). B&W mode is text-only.")
        sys.exit(1)

    queue = build_queue(args)

    if not queue:
        logger.error("No videos found. Check your --playlist / --folder / video argument.")
        sys.exit(1)

    global_default_cols = args.cols if args.cols is not None else (450 if args.pixel else 200)

    if args.render_to:
        from cli.render_asclbin import render_video_to_asclbin

        out = render_video_to_asclbin(
            args.video,
            args.render_to,
            cols=global_default_cols,
            rows=args.rows,
            render_mode=args.mode,
            pixel_mode=args.pixel,
        )
        logger.info("Rendered ASCLBIN → %s", out)
        return

    high_fps_videos = []
    for entry in queue:
        cap = cv2.VideoCapture(entry["video"])
        if cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps > 65:
                high_fps_videos.append((entry["video"], fps))
        cap.release()

    if high_fps_videos:
        logger.warning("High FPS source(s) detected:")
        for vid, fps in high_fps_videos:
            logger.warning("  - %s is %.1f FPS", vid, fps)
        logger.warning(
            "ASCILINE decimates high FPS to ~60 FPS; performance may vary on slower CPUs."
        )

        if sys.stdin.isatty():
            while True:
                choice = (
                    input("\033[1mDo you want to continue anyway? (y/n): \033[0m").strip().lower()
                )
                if choice == "y":
                    break
                if choice == "n":
                    logger.info("Exiting...")
                    sys.exit(0)
        else:
            logger.warning("Non-interactive stdin — continuing automatically (daemon mode).")

    sys.stdout.write(ASCII_LOGO + "\n")
    logger.info("═" * 55)
    logger.info("Queue     : %s video(s)", len(queue))
    logger.info("Loop      : %s", "ON" if args.loop else "OFF")
    res_str = (
        f"{global_default_cols}x{args.rows}" if args.rows > 0 else f"{global_default_cols}x(auto)"
    )
    logger.info("Resolution: %s", res_str)
    logger.info(
        "Default   : mode=%s | pixel=%s | vol=%s",
        args.mode,
        "ON" if args.pixel else "OFF",
        args.vol,
    )
    logger.info("─" * 55)
    for i, entry in enumerate(queue, 1):
        px = " [PIXEL]" if entry.get("pixel") else ""
        logger.info(
            "  %2d. %s  (mode=%s%s vol=%s)",
            i,
            entry["video"],
            entry["mode"],
            px,
            entry["vol"],
        )
    logger.info("═" * 55)
    logger.info("Server live → http://localhost:%s", args.port)

    if shutil.which("ffmpeg") is None:
        logger.warning(
            "ffmpeg not found on PATH — audio streaming (/audio) will fail at request time."
        )

    app = create_app(queue=queue, loop_flag=args.loop, debug=args.debug)

    server_thread = threading.Thread(
        target=_run_uvicorn,
        kwargs={
            "app": app,
            "host": "0.0.0.0",
            "port": args.port,
            "ws_ping_interval": None,
            "ws_ping_timeout": None,
            "ws_per_message_deflate": True,
            "log_level": "info" if args.debug else "warning",
        },
        daemon=True,
    )
    server_thread.start()
    if sys.stdin.isatty():
        command_loop(queue, args.loop, global_default_cols, args.rows)
    else:
        server_thread.join()
