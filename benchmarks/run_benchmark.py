#!/usr/bin/env python3
"""WebSocket client benchmark runner for asciiline.

Usage:
    python benchmarks/run_benchmark.py --label baseline --duration 30
    python benchmarks/run_benchmark.py --url ws://localhost:8000/ws --metrics-url http://localhost:8000/metrics
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

from websockets.asyncio.client import connect

RESULTS_DIR = Path(__file__).resolve().parent / "results"

_ASCIILINE_METRICS_KEYS = frozenset(
    {"connected_clients", "active_streams", "encode_fps", "bytes_per_frame"}
)


def _http_base_from_ws(ws_url: str) -> str:
    parsed = urlparse(ws_url)
    scheme = "https" if parsed.scheme == "wss" else "http"
    host = parsed.hostname or "localhost"
    port = parsed.port
    if port is None:
        port = 443 if scheme == "https" else 80
    return f"{scheme}://{host}:{port}"


def _verify_asciiline_server(metrics_url: str) -> None:
    """Fail fast if the target port is empty or not an asciiline server."""
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(metrics_url, timeout=3) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"Preflight failed: GET {metrics_url} returned HTTP {exc.code}. "
            "Another service may be bound to this port (not asciiline). "
            "Stop it or pass --url/--metrics-url for the running dev server "
            "(dev.py defaults to port 8001)."
        ) from exc
    except OSError as exc:
        raise SystemExit(
            f"Preflight failed: nothing listening at {metrics_url} ({exc}). "
            "Start the server first, e.g. "
            "`.venv/bin/python dev.py --video videos/demo.mp4 start`."
        ) from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise SystemExit(
            f"Preflight failed: {metrics_url} did not return JSON ({exc}). "
            "Wrong service on this port."
        ) from exc

    if not isinstance(data, dict) or not _ASCIILINE_METRICS_KEYS.issubset(data):
        raise SystemExit(
            f"Preflight failed: {metrics_url} JSON missing asciiline metrics keys "
            f"{sorted(_ASCIILINE_METRICS_KEYS)}. Got: {data!r}"
        )


def _port_from_url(url: str) -> int | None:
    parsed = urlparse(url)
    if parsed.port is not None:
        return parsed.port
    if parsed.scheme in ("wss", "https"):
        return 443
    if parsed.scheme in ("ws", "http"):
        return 80
    return None


def _kill_port(port: int) -> None:
    result = subprocess.run(
        ["lsof", "-t", f"-i:{port}"],
        capture_output=True,
        text=True,
        check=False,
    )
    pids = [p for p in result.stdout.split() if p.strip()]
    if not pids:
        return
    for pid in pids:
        subprocess.run(["kill", pid], check=False)
    time.sleep(0.5)


def _validate_init_message(
    init_msg: str,
    expect_mode: int | None,
    expect_cols: int | None = None,
) -> None:
    if not init_msg.startswith("INIT:"):
        raise SystemExit(
            f"Preflight failed: first WebSocket message is not INIT (got {init_msg[:80]!r}). "
            "Wrong service or stale client path."
        )
    parts = init_msg.split(":")
    if len(parts) < 5:
        raise SystemExit(f"Preflight failed: malformed INIT message: {init_msg!r}")
    mode = int(parts[2])
    cols = int(parts[3])
    if expect_mode is not None and mode != expect_mode:
        raise SystemExit(
            f"Preflight failed: INIT mode={mode} but --expect-init-mode={expect_mode}. "
            "Server queue/mode mismatch — wrong video or server instance."
        )
    if expect_cols is not None and cols != expect_cols:
        raise SystemExit(
            f"Preflight failed: INIT cols={cols} but --expect-init-cols={expect_cols}. "
            "Grid size mismatch."
        )


def _steady_metric_average(samples: list[dict], key: str) -> float:
    values = [float(s[key]) for s in samples if s.get(key, 0) > 0]
    if not values:
        return 0.0
    return sum(values) / len(values)


async def _poll_metrics(metrics_url: str, samples: list[dict], stop: asyncio.Event) -> None:
    import urllib.request

    while not stop.is_set():
        try:
            with urllib.request.urlopen(metrics_url, timeout=2) as resp:
                data = json.loads(resp.read().decode())
                data["timestamp"] = time.time()
                samples.append(data)
        except OSError:
            pass
        await asyncio.sleep(1.0)


async def run_benchmark(
    ws_url: str,
    metrics_url: str,
    duration: float,
    label: str,
    *,
    expect_init_mode: int | None = None,
    expect_init_cols: int | None = None,
) -> Path:
    _verify_asciiline_server(metrics_url)

    frame_count = 0
    byte_count = 0
    metrics_samples: list[dict] = []
    stop_event = asyncio.Event()
    start = time.monotonic()

    metrics_task = asyncio.create_task(_poll_metrics(metrics_url, metrics_samples, stop_event))

    async with connect(ws_url) as ws:
        init_msg = await ws.recv()
        if isinstance(init_msg, bytes):
            init_msg = init_msg.decode()
        _validate_init_message(init_msg, expect_init_mode, expect_init_cols)

        deadline = time.monotonic() + duration
        while time.monotonic() < deadline:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=deadline - time.monotonic())
            except TimeoutError:
                break

            if isinstance(msg, str):
                byte_count += len(msg.encode())
            else:
                byte_count += len(msg)
                if len(msg) >= 4:
                    frame_count += 1

    elapsed = time.monotonic() - start
    stop_event.set()
    await metrics_task

    client_samples = [s.get("connected_clients", 0) for s in metrics_samples]

    avg_fps = frame_count / elapsed if elapsed > 0 else 0.0
    avg_kbps = (byte_count * 8 / 1024) / elapsed if elapsed > 0 else 0.0
    wire_bytes_per_frame = round(byte_count / frame_count) if frame_count else 0
    encode_fps_steady = round(_steady_metric_average(metrics_samples, "encode_fps"), 2)
    bytes_per_frame_steady = round(_steady_metric_average(metrics_samples, "bytes_per_frame"))

    result = {
        "label": label,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ws_url": ws_url,
        "metrics_url": metrics_url,
        "duration_sec": round(elapsed, 2),
        "init_message": init_msg if isinstance(init_msg, str) else "",
        "frames_received": frame_count,
        "bytes_received": byte_count,
        "avg_fps": round(avg_fps, 2),
        "avg_kbps": round(avg_kbps, 2),
        "wire_bytes_per_frame": wire_bytes_per_frame,
        "bytes_per_frame_avg": wire_bytes_per_frame,
        "encode_fps_steady": encode_fps_steady,
        "encode_fps_avg": encode_fps_steady,
        "bytes_per_frame_metrics_steady": bytes_per_frame_steady,
        "peak_clients": max(client_samples) if client_samples else 0,
        "metrics_samples": metrics_samples,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_label = label.replace("/", "-").replace(" ", "_")
    out_path = RESULTS_DIR / f"{safe_label}_{int(time.time())}.json"
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(
        f"  avg_fps={result['avg_fps']} avg_kbps={result['avg_kbps']} "
        f"wire_bytes/frame={result['wire_bytes_per_frame']} "
        f"encode_fps={result['encode_fps_steady']}"
    )
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run asciiline WebSocket benchmark")
    parser.add_argument("--label", default="baseline", help="Result label prefix")
    parser.add_argument("--duration", type=float, default=30.0, help="Seconds to stream")
    parser.add_argument(
        "--url",
        default="ws://localhost:8001/ws",
        help="WebSocket URL (dev.py default port is 8001)",
    )
    parser.add_argument(
        "--metrics-url",
        default=None,
        help="Metrics HTTP URL (default: derived from --url)",
    )
    parser.add_argument(
        "--expect-init-mode",
        type=int,
        default=None,
        help="Fail if INIT mode field does not match (validates server queue/mode)",
    )
    parser.add_argument(
        "--expect-init-cols",
        type=int,
        default=None,
        help="Fail if INIT cols field does not match",
    )
    parser.add_argument(
        "--kill-port",
        action="store_true",
        help="Kill any process listening on the URL port before preflight",
    )
    args = parser.parse_args()

    metrics_url = args.metrics_url or f"{_http_base_from_ws(args.url)}/metrics"
    if args.kill_port:
        port = _port_from_url(args.url)
        if port is not None:
            _kill_port(port)
    asyncio.run(
        run_benchmark(
            args.url,
            metrics_url,
            args.duration,
            args.label,
            expect_init_mode=args.expect_init_mode,
            expect_init_cols=args.expect_init_cols,
        )
    )


if __name__ == "__main__":
    main()
