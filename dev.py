"""
dev.py
======
Development daemon for asciiline — start/stop/restart/status/watch/logs.

Commands:
  start        Start server in background
  stop         Stop server
  restart      Restart server
  status       Show server and watcher status
  watch        Start file watcher with auto-restart on source changes
  stop-watch   Stop file watcher
  logs         Show server log tail

Usage:
  python dev.py [--port PORT] [--video PATH] COMMAND
"""

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
PIDFILE = ROOT / ".server.pid"
LOGFILE = ROOT / ".server.log"
WATCH_PIDFILE = ROOT / ".watch.pid"

WATCH_PATHS: list[Path] = [
    ROOT / "stream_server.py",
    ROOT / "ascii_video_player2.py",
    ROOT / "adapters",
    ROOT / "use_cases",
    ROOT / "ports",
    ROOT / "cli",
    ROOT / "app.js",
    ROOT / "index.html",
    ROOT / "style.css",
    ROOT / "dev.py",
    ROOT / "playlist.json",  # queue rebuilt at startup; watch triggers restart on playlist change
]

DEFAULT_VIDEO = "videos/blow-the-whistle.mp4"
PYTHON = ROOT / ".venv" / "bin" / "python"
SERVER = ROOT / "stream_server.py"

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def server_cmd(port: int, video: str, *, mode: int = 3, debug: bool = False) -> list[str]:
    cmd = [
        str(PYTHON),
        str(SERVER),
        video,
        "--mode",
        str(mode),
        "--cols",
        "280",
        "--vol",
        "1",
        "--loop",
        "--port",
        str(port),
    ]
    if debug:
        cmd.append("--debug")
    return cmd


def read_pid(path: Path) -> int | None:
    try:
        return int(path.read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_pidfile(path: Path, label: str) -> None:
    pid = read_pid(path)
    if pid is None:
        logger.info("%s is not running.", label)
        return
    if not is_running(pid):
        logger.warning("%s PID %s not found — removing stale PID file.", label, pid)
        path.unlink(missing_ok=True)
        return
    logger.info("Stopping %s (PID %s)...", label, pid)
    os.kill(pid, signal.SIGTERM)
    for _ in range(20):
        time.sleep(0.1)
        if not is_running(pid):
            break
    else:
        os.kill(pid, signal.SIGKILL)
    path.unlink(missing_ok=True)
    logger.info("%s stopped.", label)


def daemonize() -> None:
    """Double-fork to create a POSIX daemon; redirect stdio to LOGFILE."""
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    if os.fork() > 0:
        sys.exit(0)
    os.chdir(str(ROOT))
    log_fd = os.open(str(LOGFILE), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    null_fd = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null_fd, 0)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)
    os.close(null_fd)
    os.close(log_fd)


def start_server(
    port: int,
    video: str,
    *,
    mode: int = 3,
    detach: bool = True,
    debug: bool = False,
) -> None:
    if not PYTHON.exists():
        logger.error("Virtual environment not found: %s", PYTHON)
        logger.error("Run: python -m venv .venv && .venv/bin/pip install -e '.[dev]'")
        sys.exit(1)
    cmd = server_cmd(port, video, mode=mode, debug=debug)
    if detach:
        daemonize()
        PIDFILE.write_text(str(os.getpid()))
        os.execv(str(PYTHON), cmd)
    else:
        proc = subprocess.Popen(cmd)
        PIDFILE.write_text(str(proc.pid))
        proc.wait()
        PIDFILE.unlink(missing_ok=True)


def cmd_start(port: int, video: str, mode: int = 3, debug: bool = False) -> None:
    pid = read_pid(PIDFILE)
    if pid is not None and is_running(pid):
        logger.info("Server already running (PID %s).", pid)
        return
    logger.info("Starting server on port %s (mode=%s)...", port, mode)
    start_server(port, video, mode=mode, detach=True, debug=debug)
    logger.info("Server started. http://localhost:%s", port)


def cmd_stop() -> None:
    stop_pidfile(PIDFILE, "Server")


def cmd_restart(port: int, video: str, mode: int = 3, debug: bool = False) -> None:
    cmd_stop()
    time.sleep(0.5)
    cmd_start(port, video, mode=mode, debug=debug)


def cmd_status() -> None:
    pid = read_pid(PIDFILE)
    if pid is not None and is_running(pid):
        logger.info("Server running (PID %s).", pid)
    else:
        logger.info("Server not running.")
    wpid = read_pid(WATCH_PIDFILE)
    if wpid is not None and is_running(wpid):
        logger.info("Watcher running (PID %s).", wpid)
    else:
        logger.info("Watcher not running.")


def snapshot_mtimes() -> dict[Path, float]:
    mtimes: dict[Path, float] = {}
    for path in WATCH_PATHS:
        try:
            mtimes[path] = path.stat().st_mtime
        except FileNotFoundError:
            mtimes[path] = 0.0
    return mtimes


def _watch_loop(port: int, video: str, mode: int = 3, debug: bool = False) -> None:
    """Poll WATCH_PATHS every second; restart server when any mtime changes."""
    logger.info("[watch] Watching for changes...")
    prev = snapshot_mtimes()
    while True:
        time.sleep(1)
        curr = snapshot_mtimes()
        changed = [p for p in WATCH_PATHS if curr.get(p, 0.0) != prev.get(p, 0.0)]
        if changed:
            names = [p.name for p in changed]
            logger.info("[watch] Changed: %s — restarting server...", names)
            stop_pidfile(PIDFILE, "Server")
            time.sleep(0.5)
            proc = subprocess.Popen(server_cmd(port, video, mode=mode, debug=debug))
            PIDFILE.write_text(str(proc.pid))
        prev = curr


def cmd_watch(port: int, video: str, mode: int = 3, debug: bool = False) -> None:
    wpid = read_pid(WATCH_PIDFILE)
    if wpid is not None and is_running(wpid):
        logger.info("Watcher already running (PID %s).", wpid)
        return
    child = os.fork()
    if child == 0:
        os.setsid()
        WATCH_PIDFILE.write_text(str(os.getpid()))
        _watch_loop(port, video, mode=mode, debug=debug)
        sys.exit(0)
    logger.info("Watcher started (PID %s). Monitoring %s paths.", child, len(WATCH_PATHS))
    logger.info("  Stop: python dev.py stop-watch")
    logger.info("  Logs: python dev.py logs")


def cmd_stop_watch() -> None:
    stop_pidfile(WATCH_PIDFILE, "Watcher")


def cmd_logs(lines: int = 50, follow: bool = False) -> None:
    if not LOGFILE.exists():
        logger.info("No log file found.")
        return
    if follow:
        # Print existing tail then stream new lines via tail -f
        subprocess.run(["tail", f"-{lines}", "-f", str(LOGFILE)], check=False)
    else:
        content = LOGFILE.read_text().splitlines()
        for line in content[-lines:]:
            logger.info("%s", line)


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="asciiline dev server control")
    parser.add_argument("--port", type=int, default=8001, help="Server port (default: 8001)")
    parser.add_argument("--video", default=DEFAULT_VIDEO, help="Video path (default: %(default)s)")
    parser.add_argument(
        "--mode",
        type=int,
        default=3,
        choices=[1, 2, 3, 4, 5, 6],
        help="Render mode passed to stream_server (default: 3)",
    )
    parser.add_argument(
        "--debug", action="store_true", default=False, help="Pass --debug to server process"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("start", help="Start server in background")
    sub.add_parser("stop", help="Stop server")
    sub.add_parser("restart", help="Restart server")
    sub.add_parser("status", help="Show server and watcher status")
    sub.add_parser("watch", help="Start file watcher with auto-restart")
    sub.add_parser("stop-watch", help="Stop file watcher")
    logs_p = sub.add_parser("logs", help="Show server log tail")
    logs_p.add_argument("--lines", type=int, default=50)
    logs_p.add_argument(
        "--follow", "-f", action="store_true", default=False, help="Follow log in real time"
    )
    args = parser.parse_args()

    if args.cmd == "start":
        cmd_start(args.port, args.video, mode=args.mode, debug=args.debug)
    elif args.cmd == "stop":
        cmd_stop()
    elif args.cmd == "restart":
        cmd_restart(args.port, args.video, mode=args.mode, debug=args.debug)
    elif args.cmd == "status":
        cmd_status()
    elif args.cmd == "watch":
        cmd_watch(args.port, args.video, mode=args.mode, debug=args.debug)
    elif args.cmd == "stop-watch":
        cmd_stop_watch()
    elif args.cmd == "logs":
        cmd_logs(args.lines, follow=args.follow)


if __name__ == "__main__":
    main()
