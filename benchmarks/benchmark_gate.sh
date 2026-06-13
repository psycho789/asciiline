#!/usr/bin/env bash
# Run a clean benchmark gate: stop dev server, free port, start fresh server, benchmark, compare.
#
# Usage:
#   benchmarks/benchmark_gate.sh post-phase-1
#   benchmarks/benchmark_gate.sh post-phase-3 --port 8001 --video videos/demo.mp4 --mode 6 --cols 280
#
# Environment overrides: PORT, VIDEO, DURATION, COLS, MODE

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LABEL="${1:?Usage: benchmark_gate.sh LABEL [--port PORT] [--video PATH] [--mode N] [--cols N] [--duration SEC]}"
shift

PORT="${PORT:-8001}"
VIDEO="${VIDEO:-videos/demo.mp4}"
DURATION="${DURATION:-30}"
COLS="${COLS:-280}"
MODE="${MODE:-3}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --video) VIDEO="$2"; shift 2 ;;
        --duration) DURATION="$2"; shift 2 ;;
        --cols) COLS="$2"; shift 2 ;;
        --mode) MODE="$2"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

PY="${ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
    PY=python3
fi

echo "=== benchmark gate: label=$LABEL port=$PORT video=$VIDEO mode=$MODE cols=$COLS ==="

echo "--- stop dev server ---"
"$PY" dev.py stop 2>/dev/null || true
sleep 1

echo "--- free port $PORT ---"
if pids=$(lsof -t -i:"$PORT" 2>/dev/null); then
    echo "Killing PID(s) on port $PORT: $pids"
    kill $pids 2>/dev/null || true
    sleep 0.5
fi
if lsof -i:"$PORT" >/dev/null 2>&1; then
    echo "ERROR: port $PORT still in use after kill" >&2
    lsof -i:"$PORT" >&2
    exit 1
fi
echo "Port $PORT is free"

echo "--- start asciiline server ---"
"$PY" dev.py --port "$PORT" --video "$VIDEO" --mode "$MODE" start
sleep 2

SERVER_PID="$(lsof -t -i:"$PORT" 2>/dev/null | head -1 || true)"
if [[ -z "$SERVER_PID" ]]; then
    echo "ERROR: no process listening on port $PORT after start" >&2
    exit 1
fi
SERVER_CMD="$(ps -p "$SERVER_PID" -o command= 2>/dev/null || true)"
echo "--- verify server process (PID $SERVER_PID) ---"
echo "$SERVER_CMD"
case "$SERVER_CMD" in
    *"$ROOT/stream_server.py"*) echo "OK: stream_server.py from this repo" ;;
    *) echo "ERROR: port $PORT is not this repo's stream_server.py" >&2; exit 1 ;;
esac
case "$SERVER_CMD" in
    *"--mode $MODE"*) echo "OK: server started with --mode $MODE" ;;
    *) echo "ERROR: server command missing --mode $MODE (got wrong code?)" >&2; exit 1 ;;
esac
case "$SERVER_CMD" in
    *"$VIDEO"*) echo "OK: server video $VIDEO" ;;
    *) echo "ERROR: server command missing video $VIDEO" >&2; exit 1 ;;
esac

WS_URL="ws://localhost:${PORT}/ws?cols=${COLS}&aspect=auto"
METRICS_URL="http://localhost:${PORT}/metrics"

echo "--- preflight metrics ---"
METRICS_BODY="$(curl -sf "$METRICS_URL")"
echo "$METRICS_BODY" | "$PY" -c "
import json, sys
d = json.load(sys.stdin)
need = {'connected_clients', 'active_streams', 'encode_fps', 'bytes_per_frame'}
missing = need - set(d)
if missing:
    raise SystemExit(f'Invalid /metrics shape; missing {missing}: {d!r}')
print('Preflight OK:', d)
"

echo "--- run benchmark (${DURATION}s) ---"

"$PY" benchmarks/run_benchmark.py \
    --label "$LABEL" \
    --url "$WS_URL" \
    --metrics-url "$METRICS_URL" \
    --duration "$DURATION" \
    --expect-init-mode "$MODE" \
    --expect-init-cols "$COLS"

echo "--- compare all results ---"
"$PY" benchmarks/compare.py benchmarks/results/

echo "=== gate complete: $LABEL ==="
