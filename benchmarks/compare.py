#!/usr/bin/env python3
"""Compare asciiline benchmark result JSON files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _wire_bytes_per_frame(row: dict) -> float:
    if row.get("wire_bytes_per_frame"):
        return float(row["wire_bytes_per_frame"])
    frames = row.get("frames_received", 0)
    if frames:
        return row.get("bytes_received", 0) / frames
    return float(row.get("bytes_per_frame_avg", 0))


def _encode_fps(row: dict) -> float:
    if row.get("encode_fps_steady"):
        return float(row["encode_fps_steady"])
    return float(row.get("encode_fps_avg", 0))


def load_results(results_dir: Path) -> list[dict]:
    files = sorted(results_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
    results: list[dict] = []
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data["_file"] = path.name
            results.append(data)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"Skipping {path}: {exc}", file=sys.stderr)
    return results


def print_table(results: list[dict]) -> None:
    if not results:
        print("No result files found.")
        return

    header = (
        f"{'label':<24} {'dur':>5} {'mode':>4} {'avg_fps':>8} {'avg_kbps':>10} "
        f"{'wire/frame':>11} {'encode_fps':>10}"
    )
    print(header)
    print("-" * len(header))

    for row in results:
        label = str(row.get("label", "?"))[:24]
        init = row.get("init_message", "")
        mode = init.split(":")[2] if init.startswith("INIT:") else "?"
        dur = row.get("duration_sec", 0)
        wire_bpf = _wire_bytes_per_frame(row)
        print(
            f"{label:<24} "
            f"{dur:>4.0f}s "
            f"{mode:>4} "
            f"{row.get('avg_fps', 0):>8.2f} "
            f"{row.get('avg_kbps', 0):>10.2f} "
            f"{wire_bpf:>11.0f} "
            f"{_encode_fps(row):>10.2f}"
        )
        if init:
            print(f"  init: {init[:70]}")
        ws_url = row.get("ws_url")
        if ws_url:
            print(f"  ws:   {ws_url}")
        print(f"  file: {row.get('_file', '?')}")

    if len(results) >= 2:
        print()
        print("Deltas vs first row (wire bytes/frame and avg_kbps):")
        base = results[0]
        base_kbps = base.get("avg_kbps", 0)
        base_bpf = _wire_bytes_per_frame(base)
        for row in results[1:]:
            kbps = row.get("avg_kbps", 0)
            bpf = _wire_bytes_per_frame(row)
            kbps_pct = ((kbps / base_kbps) - 1) * 100 if base_kbps else 0
            bpf_pct = ((bpf / base_bpf) - 1) * 100 if base_bpf else 0
            print(
                f"  {row.get('label', '?')}: "
                f"kbps {kbps - base_kbps:+.0f} ({kbps_pct:+.1f}%), "
                f"wire/frame {bpf - base_bpf:+.0f} ({bpf_pct:+.1f}%) vs {base.get('label')}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare benchmark JSON results")
    parser.add_argument(
        "results_dir",
        nargs="?",
        default=str(Path(__file__).resolve().parent / "results"),
        help="Directory containing *.json benchmark results",
    )
    args = parser.parse_args()
    results_dir = Path(args.results_dir)
    if not results_dir.is_dir():
        print(f"Directory not found: {results_dir}", file=sys.stderr)
        sys.exit(1)
    print_table(load_results(results_dir))


if __name__ == "__main__":
    main()
