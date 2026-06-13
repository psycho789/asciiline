import cv2

# Visual width:height targets for the rendered grid (not the source file).
ASPECT_PRESETS: dict[str, float] = {
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "21:9": 21 / 9,
    "1:1": 1.0,
}


def get_video_dimensions(path: str) -> tuple[int, int]:
    """Quickly probe a video file to get (width, height) without decoding frames."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video file: {path!r}")
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return w, h


def calc_auto_rows(cols: int, vid_w: int, vid_h: int, pixel_mode: bool) -> int:
    """
    Calculate rows from video aspect ratio.
    ASCII mode: characters are ~2x taller than wide, so divide by 2.
    Pixel mode: cells are square (CSS stretches), no correction needed.
    """
    ratio = vid_w / max(vid_h, 1)
    if pixel_mode:
        return max(1, round(cols / ratio))
    return max(1, round(cols / ratio / 2))


def calc_rows_for_aspect(cols: int, visual_aspect: float, pixel_mode: bool) -> int:
    """
    Rows for a target on-screen aspect ratio (width / height).

    ASCII characters are roughly twice as tall as wide, so divide by 2 in text modes.
    """
    if pixel_mode:
        return max(1, round(cols / visual_aspect))
    return max(1, round(cols / visual_aspect / 2))


def resolve_grid_size(
    cols: int,
    vid_w: int,
    vid_h: int,
    pixel_mode: bool,
    *,
    aspect_preset: str = "auto",
    rows_cfg: int = 0,
) -> tuple[int, int]:
    """Resolve final grid cols/rows from queue defaults and client aspect preset."""
    if rows_cfg > 0:
        return cols, rows_cfg
    if aspect_preset == "auto":
        return cols, calc_auto_rows(cols, vid_w, vid_h, pixel_mode)
    visual_aspect = ASPECT_PRESETS.get(aspect_preset)
    if visual_aspect is None:
        return cols, calc_auto_rows(cols, vid_w, vid_h, pixel_mode)
    return cols, calc_rows_for_aspect(cols, visual_aspect, pixel_mode)
