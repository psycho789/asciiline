from __future__ import annotations

from dataclasses import dataclass

COLS_MIN = 80
COLS_MAX = 800

VALID_ASPECT_PRESETS = frozenset({"auto", "16:9", "4:3", "21:9", "1:1"})


@dataclass(frozen=True, slots=True)
class StreamPrefs:
    """Per-connection overrides from the browser (WebSocket query params)."""

    cols: int | None = None
    aspect: str = "auto"


def normalize_aspect_preset(value: str) -> str:
    if value in VALID_ASPECT_PRESETS:
        return value
    return "auto"


def clamp_cols(value: int | None) -> int | None:
    if value is None:
        return None
    return max(COLS_MIN, min(COLS_MAX, value))


def parse_stream_prefs(cols: int | None, aspect: str) -> StreamPrefs:
    return StreamPrefs(cols=clamp_cols(cols), aspect=normalize_aspect_preset(aspect))
