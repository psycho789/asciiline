# Coding Standards — asciiline

## 1. Mission & Scope

asciiline is a local, single-user streaming tool that decodes video files with OpenCV and
renders them as ASCII art in a browser over WebSocket, with parallel MP3 audio via FFmpeg.
Target deployment is localhost or LAN demo. This is not a multi-tenant or
production-deployed service.

**Non-goals:** production authentication, multi-tenant support, external API integrations,
cloud deployment, persistent storage.

## 2. Language & Runtime Pinning

- **Python:** 3.11+ required (`target-version = "py311"` in `pyproject.toml`)
- **JavaScript:** ES2022, no transpile step, no bundler
- **Dependency management:** `requirements.txt` with `>=` lower bounds; a lock file
  is not required for a local single-user tool but is recommended if the project is
  shared or deployed to multiple environments

## 3. Import Discipline

- All imports must appear at the **top of the module** — never inside function bodies,
  class methods, or async handlers
- No inline imports in route functions (`audio_stream`, `websocket_endpoint`) or
  generator bodies
- **Exception:** the `if __name__ == "__main__":` guard block may contain imports that
  are used only for CLI execution (`argparse`, `threading`, etc.)
- Organize imports: stdlib first, then third-party, then local; separate groups with a
  blank line
- Use `ruff check .` with the `I` ruleset to enforce import ordering

## 4. Type Annotations

- Python functions must annotate parameter types and return types
  (e.g., `def build_queue(args) -> list[dict]:`)
- JavaScript: add JSDoc for key public functions in `app.js`
  (e.g., `buildCanvas`, `renderFrame`, `connectWebSocket`)

## 5. Naming Conventions

| Context | Convention | Examples |
|---------|-----------|---------|
| Python functions | `snake_case` | `build_queue`, `resolve_video_path`, `load_playlist` |
| Python variables | `snake_case` | `frame_index`, `start_time`, `pixel_send_buf` |
| Python classes | `PascalCase` | `VideoDecoder`, `AsciiMapper`, `TerminalRenderer` |
| Python module-level constants | `UPPER_SNAKE_CASE` | `ASCII_LOGO` |
| JavaScript functions | `camelCase` | `buildCanvas`, `renderFrame`, `connectWebSocket` |
| JavaScript variables | `camelCase` | `frameBuffer`, `targetFps`, `gridCols` |
| JavaScript module-level constants | `UPPER_SNAKE_CASE` | `MAX_FRAME_BUFFER` |

## 6. Error Handling

- Use explicit exception types — no bare `except:` clauses
- Surface all external dependency failures at startup with a clear log line:
  - FFmpeg: check `shutil.which("ffmpeg")` before starting the server
  - OpenCV: `cap.isOpened()` checked immediately after `cv2.VideoCapture(path)`
- No silent swallowing of errors in async handlers or generator `finally` blocks
- In `audio_generator`, check `process.returncode` after FFmpeg exits and log non-zero
  exit codes

## 7. Logging

- Prefer the `logging` module over `print()` for new code
- Use structured log levels: `DEBUG`, `INFO`, `WARNING`, `ERROR`
- Acceptable in existing code: `print()` with manual `[PLAYING]`, `[ERROR]`, `[DONE]`
  tags (pending logging refactor, deferred to L-6)
- Do not introduce new unstructured `print()` debug statements; use `logging.debug()`

## 8. Dead Code

- Variables assigned but never read must be removed
- No commented-out code blocks in the main branch
- No dead variable declarations — if `ruff check .` reports `F841` (local variable
  assigned but never used), remove that assignment
- `prefer-const` applies in JavaScript: `let` declarations that are never reassigned
  must be `const`

## 9. Async Discipline

- Inside any `async def` function, use `asyncio.get_running_loop()` — **never**
  `asyncio.get_event_loop()`
- `asyncio.get_event_loop()` in a running coroutine emits `DeprecationWarning` on
  Python 3.10–3.11 and raises `RuntimeError` on some Python 3.12 configurations
- Ruff's `UP` ruleset detects this pattern automatically

## 10. Performance Patterns

- Pre-allocate send buffers (`bytearray`) at connection setup time — do not allocate
  per-frame
- Pass pre-allocated `bytearray` directly to `websocket.send_bytes()` — wrapping in
  `bytes()` creates an unnecessary full-frame copy (~9 MB/s at 30 FPS, 302KB frames)
- Use `VideoDecoder.grab()` for FPS decimation — ~10× faster than double `read()`
- Use NumPy vectorized operations for intensity-to-character mapping; avoid Python-level
  per-pixel loops

## 11. Security Constraints

- No credentials, API keys, or tokens in source code — use environment variables
- Path inputs from users or config files must be validated before use; do not pass
  raw user-supplied strings to `os.path.exists()` or `cv2.VideoCapture()` without
  checking for path traversal
- No external font or CDN script links for local-only deployments

## 12. Quality Gates

The following commands must pass with zero errors before any change is merged or
declared complete:

```bash
# Python — lint
ruff check .

# Python — format check
ruff format --check .

# JavaScript — lint
npx eslint app.js

# Combined (after Makefile is in place)
make lint
```

Both commands must produce zero error output. Warnings that ruff emits for pre-existing
issues are expected until Sprint 2 fixes them.

## 13. Testing

- Place test files in `tests/` directory at the repo root
- Use `pytest` for Python unit tests
- Test at minimum: `VideoDecoder` read/release lifecycle, `AsciiMapper.convert()` with a
  synthetic NumPy frame, `build_queue()` with `SimpleNamespace` args
- No test runner is currently configured — see improvement backlog item D-1

---

*Generated 2026-06-12 from `engineering-baseline-gap.md` iteration 1 analysis.*
