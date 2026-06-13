def effective_fps(source_fps: float, max_fps: float = 60.0) -> tuple[float, int]:
    """Return (capped_fps, skip_n) for a source stream."""
    if source_fps > max_fps:
        skip_n = round(source_fps / max_fps)
        return source_fps / skip_n, skip_n
    return source_fps, 1
