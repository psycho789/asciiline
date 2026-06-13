# AGENTS — asciiline

> **Standards authority:** Read and apply repo [`CODING_STANDARDS.md`](CODING_STANDARDS.md) from the first step of every task. Do not duplicate architecture prose here — that file is the contract for boundaries, rewrite policy, and Definition of Done.

Use this file as shared guidance for AI agents and human contributors on the asciiline project (local video-to-ASCII streaming: FastAPI + OpenCV backend, WebSocket binary protocol, vanilla JS canvas client).

## Core Rule (Always On)

Always consider and apply the project's coding standards:
- from the very beginning of every task,
- at every step while writing or editing code,
- when creating plan documents,
- and during all forms of code analysis or review.

If standards are missing or unclear, pause and ask for clarification before making substantial changes.

## Asciiline Operational Gates

After Python edits, run:

```bash
make lint
# or individually:
ruff check .
ruff format --check .
```

After JavaScript edits:

```bash
npx eslint app.js client/*.js
```

After behavior changes, run tests:

```bash
make test
# or: pytest -q
```

Combined quality gate before completing work:

```bash
make lint && make test
```

Zero lint errors and passing tests are required before a task is done (see `CODING_STANDARDS.md` §9 and §12).

## WebSocket Protocol Contract

Do not change sender and receiver in separate stories — protocol changes must stay in sync across `stream_server.py` and `app.js`.

| Message | Format |
|---------|--------|
| INIT (text) | `INIT:<fps>:<mode>:<cols>:<rows>:<pixel>:<session_id>` — sent once per video; field 7 enables session-scoped `/audio?session=` |
| Binary frame | 4-byte big-endian unsigned index (`struct.pack(">I", frame_index)`) + payload |

Payload by mode:
- **Pixel mode:** raw BGR bytes (`rows * cols * 3`)
- **ASCII color modes (2–5):** `[char, R, G, B]` per pixel (`rows * cols * 4`)
- **B&W mode (1):** text frame with leading `frame_index` line (legacy text path)

Reference implementation: `use_cases/broadcast_hub.py` (encode-once fan-out), `use_cases/stream_session.py` INIT send, and `ports/frame_encoder.py` binary packing.

## Client Render Hot Path (color modes 2–5)

- **Atlas build**: `buildGlyphAtlas()` in `client/glyph_atlas.js` — one-time `fillText` per LUT entry when grid cell size changes.
- **Per frame**: decode binary `[char,R,G,B]` → stamp glyphs into `ImageData` → `putImageData` (main-thread fallback) or worker `postMessage` → `applyWorkerFrame`.
- **Selection UX**: `selectionBuffer` + `textDecoder.decode()` unchanged; invisible `#ascii-player` overlay for copy/select.
- **Fallback**: if `Worker` or `OffscreenCanvas` unavailable, `renderColorAsciiFrame()` runs on main thread (same compositor).
- **Do not** reintroduce per-cell `fillText` in `renderFrame` for modes 2–5.

## Key Files

| File | Role | ~Lines |
|------|------|--------|
| `stream_server.py` | Thin CLI entry + backward-compatible re-exports | ≤30 |
| `cli/server_main.py` | argparse, uvicorn bootstrap, interactive commands | — |
| `adapters/fastapi_routes.py` | `create_app()` factory, HTTP/WS routes | — |
| `adapters/ffmpeg_audio.py` | Async session-scoped FFmpeg audio (`/audio?session=`) with read timeout |
| `use_cases/broadcast_hub.py` | Shared decode + encode-once fan-out for multi-tab viewers |
| `use_cases/stream_session.py` | Per-connection pacing, queue advance, hub subscription |
| `use_cases/build_playlist.py` | `build_queue`, playlist/folder resolution | — |
| `ports/frame_encoder.py` | `FrameEncoder` port (pixel, B&W text, color binary) | — |
| `ascii_video_player2.py` | OpenCV decode + ASCII/pixel engine (`VideoDecoder`, `AsciiMapper`) | 352 |
| `client/glyph_atlas.js` | Glyph atlas builder + `compositeColorAsciiFrame` (shared main/worker) | — |
| `client/render_worker.js` | OffscreenCanvas worker: frame compositing off main thread | — |
| `app.js` | Browser client: WebSocket, jitter buffer, atlas/worker render | — |
| `dev.py` | Dev daemon: start/stop/watch server | 256 |
| `pyproject.toml` | Ruff config, `[project]` deps, pytest options | — |
| `Makefile` | `make lint`, `make test`, `make format` | — |

## Rewrite Posture

Before substantial changes, evaluate patch vs bounded rewrite per `CODING_STANDARDS.md` §7:
- Do **not** expand the `stream_server.py` god module with new cross-cutting logic.
- Prefer extracting bounded modules (encoder, session, playlist use case) when adding render modes, multi-client features, or live sources.
- Every new port or extension seam requires substitution tests per §9.

## Import Discipline

- Place imports at module top only.
- No inline imports in handlers or hot paths unless a documented circular-dependency exception exists.

## Async Rule

Inside coroutines, use `asyncio.get_running_loop()` — never `asyncio.get_event_loop()`.

## Observability

- Use the `logging` module for new Python server and daemon code.
- Do not add new `print()` debug paths in server modules (`adapters/`, `use_cases/`, `cli/`, `ports/`).

## Universal Working Principles

1. Start with intent
- Restate the goal, constraints, and expected output before implementation.
- Identify assumptions early; confirm unknowns instead of guessing.

2. Plan before large changes
- For multi-file or high-impact work, write a short plan first.
- Keep plans actionable: scope, approach, risks, and verification steps.

3. Keep changes minimal and focused
- Prefer the smallest change that solves the problem correctly.
- Avoid unrelated refactors unless explicitly requested.

4. Preserve readability
- Use clear names and simple control flow.
- Keep functions cohesive and avoid hidden side effects.
- Add concise comments only where logic is non-obvious.

5. Maintain consistency
- Follow existing architecture, patterns, and style in the repository.
- Keep imports, file structure, and naming conventions consistent.

6. Verify continuously
- Run relevant checks/tests after meaningful edits.
- Treat warnings and lint/type errors as actionable unless intentionally deferred.

7. Review with a critical lens
- Look for correctness, edge cases, regressions, and security concerns.
- Validate that output matches requirements, not just that code compiles.

8. Communicate clearly
- Explain what changed, why it changed, and how it was validated.
- Call out trade-offs, follow-ups, and any remaining risks.

## Planning and Analysis Expectations

When producing plans, specs, or analysis:
- Anchor recommendations to coding standards and current system constraints.
- Separate facts, assumptions, and proposals.
- Include risk assessment and concrete verification criteria.
- Prefer practical, testable next steps over generic advice.

## Safety and Quality Guardrails

- Do not introduce secrets, credentials, or sensitive data in code or docs.
- Favor secure defaults and explicit error handling.
- Keep behavior deterministic and avoid surprising implicit state.
- Document any intentional deviations from standards.

## Definition of Done

A task is complete when:
- Changes align with `CODING_STANDARDS.md` throughout,
- `make lint && make test` pass (or documented deviations),
- Behavior changes have tests under `tests/`,
- Architecture boundaries are preserved or improved,
- and outcomes, risks, and next steps are clearly communicated.
