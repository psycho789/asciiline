import cv2


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
