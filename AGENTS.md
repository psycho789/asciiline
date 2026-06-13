# AGENTS.md — asciiline

## Role

You are a coding agent operating on **asciiline** — a local single-user video-to-ASCII
streaming tool. The codebase has ~10 source files (~1,950 lines): Python FastAPI server
+ video engine, and a JavaScript browser WebSocket client + Canvas renderer.

## First Step of Every Task

Read `CODING_STANDARDS.md` before making any change. If any standard it defines is
violated in the files you touch, fix those violations as part of your task.

## Lint Gates (Mandatory)

After any Python edit, run:
```bash
cd /Users/adamvoliva/Code/asciiline
ruff check .
ruff format --check .
```

After any JavaScript edit, run:
```bash
cd /Users/adamvoliva/Code/asciiline
npx eslint app.js
```

Fix **all** reported issues before declaring any task complete. Both lint gates must
pass with zero errors.

If the `Makefile` is present (Sprint 1 creates it), use `make lint` to run both checks
simultaneously.

## File Discipline

- Do not create new files unless the task explicitly requires it
- Do not add `print()` statements as debug artifacts — remove them before completing
- Do not add inline imports inside function bodies (see Import Rule below)

## Async Rule

Inside any `async def` function, use `asyncio.get_running_loop()` — **never**
`asyncio.get_event_loop()`.

This applies to every usage in `stream_server.py`. The ruff `UP` ruleset detects
this automatically.

## Import Rule

- All imports must be at the **module top level**
- If you encounter an inline import in a function body during a task, move it to the
  top-level import block
- Exception: imports inside `if __name__ == "__main__":` guard blocks are acceptable

## Dead Code Rule

- Remove unused variable assignments — do not leave dead code in place
- If `ruff check .` reports `F841` (local variable assigned but never used), delete
  that variable assignment
- Do not comment out dead code — delete it

## Test Discipline

- Place tests in `tests/` directory at the repo root
- Use `pytest` for Python unit tests
- Write at minimum a smoke test for any new function added to `ascii_video_player2.py`
  or `stream_server.py`

## Key Files

| File | Purpose |
|------|---------|
| `stream_server.py` | FastAPI server, WebSocket streaming, audio route (616 lines) |
| `ascii_video_player2.py` | Video decode engine, ASCII/pixel mapping (339 lines) |
| `app.js` | Browser WebSocket client, Canvas renderer, A/V sync (375 lines) |
| `index.html` | Single-page UI shell (81 lines) |
| `style.css` | Dark blog theme, player layout (262 lines) |
| `playlist.json` | Video queue config |
| `pyproject.toml` | Ruff lint + format config (created Sprint 1) |
| `Makefile` | lint, lint-fix, format targets (created Sprint 1) |

## WebSocket Protocol — Do Not Break

The binary frame protocol is a contract between `stream_server.py` and `app.js`:

- **INIT** (text): `INIT:<fps>:<mode>:<cols>:<rows>:<pixel>`
- **Frame** (binary): 4-byte big-endian frame index + payload
  - Pixel mode: `[frame_index(4)] + BGR bytes (rows × cols × 3)`
  - Color ASCII mode: `[frame_index(4)] + [char,R,G,B] per cell (rows × cols × 4)`

Any change to these formats requires a **synchronous update** to both
`stream_server.py` (sender) and `app.js` (receiver) in the same story.

## Render Modes

| Mode | Description |
|------|-------------|
| 1 | B&W text (ASCII characters, text frames over WebSocket) |
| 2–5 | Color ASCII (binary frames with char + RGB per cell) |
| pixel | Pixel/dot mode (raw BGR binary, no ASCII characters) |

---

*Generated 2026-06-12 from `engineering-baseline-gap.md` iteration 1 analysis.*
