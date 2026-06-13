"""
ascii_video_player2.py
======================
Core video decode and ASCII mapping for streaming and terminal playback.

  - VideoDecoder : Produces (gray, color) frame pairs from video.
  - AsciiMapper  : Gray matrix -> ASCII character + ANSI True Color code.

Dependencies:
    pip install opencv-python numpy
"""

import logging
import os
from typing import ClassVar

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Enable ANSI color codes on PowerShell/CMD (Windows):
os.system("")


# ─────────────────────────────────────────────
#  MODULE 1 ─ VideoDecoder
# ─────────────────────────────────────────────
class VideoDecoder:
    """
    Opens the video file and yields (gray, bgr) pair for each frame.

    For color rendering, both gray (for character selection) and
    original BGR (for color sampling) matrices are needed.
    Both undergo the same resize operation -> size consistency guaranteed.
    """

    def __init__(self, path: str, cols: int, rows: int, skip_gray: bool = False) -> None:
        self._cap = cv2.VideoCapture(path)
        if not self._cap.isOpened():
            raise FileNotFoundError(f"Could not open video file: {path!r}")

        self.fps: float = self._cap.get(cv2.CAP_PROP_FPS) or 24.0
        self.frame_count: int = int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.vid_w: int = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.vid_h: int = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._size: tuple = (cols, rows)
        self._skip_gray: bool = skip_gray

    def __iter__(self):
        return self

    def __next__(self) -> tuple[np.ndarray, np.ndarray]:
        """
        :return: (gray[H,W] uint8,  bgr[H,W,3] uint8)
                 gray is None when skip_gray=True (pixel mode optimization)
        """
        ok, frame = self._cap.read()
        if not ok:
            raise StopIteration

        small = cv2.resize(frame, self._size, interpolation=cv2.INTER_AREA)
        if self._skip_gray:
            return None, small
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        return gray, small  # small = downscaled BGR frame

    def release(self):
        self._cap.release()

    def __enter__(self) -> "VideoDecoder":
        return self

    def __exit__(self, *_: object) -> None:
        self.release()

    def grab(self) -> bool:
        """Advance the video by one frame WITHOUT decoding (nearly free).
        Used by stream_server for FPS decimation of high-FPS sources."""
        return self._cap.grab()

    def __del__(self):
        self.release()


# ─────────────────────────────────────────────
#  MODULE 2 ─ AsciiMapper
# ─────────────────────────────────────────────
class AsciiMapper:
    """
    Converts Gray + BGR matrix into a string of ASCII characters
    colored with ANSI True Color codes.

    ── True Color ANSI Format ─────────────────────────────────────────────
      \033[38;2;R;G;Bm{character}\033[0m
      └─ foreground color ───────┘

    ── Color Quantization (Performance Optimization) ───────────────────────
      Instead of generating a separate escape code for every pixel, color values
      are downsampled to 6-bit (>> 2 << 2, 64 levels/channel).
      This allows consecutive pixels with the same color to share a single escape code
      -> reduces string size and stdout.write overhead.
      There is no visually perceptible loss of color (16M -> ~262K colors).

    ── RLE (Run-Length Encoding) ───────────────────────────────────────────
      The escape code is not repeated for consecutive characters of the same color;
      a new code is appended only when the color changes.
      This provides a 40-60% reduction in string size for a typical frame.
    """

    DEFAULT_PALETTE: ClassVar[list[str]] = list(
        " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@"
    )

    # ANSI reset + carriage return
    _RESET = "\033[0m"

    def __init__(self, palette: list[str] | None = None, quantize_bits: int = 0) -> None:
        """
        :param palette:       Character list (None -> 93 level default)
        :param quantize_bits: Right bit shift amount for color quantization.
                              2 -> 64 levels/channel (fast),
                              0 -> full 8-bit (highest quality, default).
        """
        p = palette or self.DEFAULT_PALETTE
        self._n = len(p)
        self._lut = np.array(p, dtype="U1")
        self._qb = quantize_bits  # quantization bit shift amount

    @property
    def palette_size(self) -> int:
        """Number of characters in the palette."""
        return self._n

    def char_lut_bytes(self) -> np.ndarray:
        """Uint8 ndarray of ASCII ordinals for each palette character."""
        return np.array([ord(c) for c in self._lut], dtype=np.uint8)

    def convert(self, gray: np.ndarray, bgr: np.ndarray) -> str:
        """
        For each pixel:
          1. Gray value -> ASCII character (intensity LUT)
          2. BGR color  -> ANSI True Color escape code (quantized + RLE)

        :param gray: shape=(H,W)   uint8 gray matrix
        :param bgr:  shape=(H,W,3) uint8 BGR color matrix
        :return: Colored ASCII string ready to be written directly to the terminal
        """
        H, W = gray.shape

        # ── Step 1: Pixel intensity -> character index ──────────────────
        indices = np.floor_divide(gray, max(1, 256 // self._n))
        np.clip(indices, 0, self._n - 1, out=indices)
        char_matrix = self._lut[indices]  # shape=(H,W), dtype='U1'

        # ── Step 2: Color quantization ────────────────────────────────────
        # BGR -> RGB order (ANSI code is in R,G,B order)
        rgb = bgr[:, :, ::-1]  # BGR -> RGB view, no copy

        if self._qb > 0:
            # Zero out the lower bits -> reduce color precision, increase speed
            qb = self._qb
            rgb = (rgb >> qb) << qb  # e.g., qb=2: 0b11111100 masking

        # ── Step 3: RLE and colored string construction ─────────────────────
        # Since RLE cannot be done with pure NumPy, this part uses a Python loop.
        # However, the escape code is only written when the color changes per row;
        # loop overhead is minimized for repeated colors.
        lines = []
        prev_r = prev_g = prev_b = -1  # previous color (first pixel is always different)

        for row_idx in range(H):
            row_chars = char_matrix[row_idx]  # shape=(W,) char array
            row_colors = rgb[row_idx]  # shape=(W,3) uint8 array
            buf = []

            for col_idx in range(W):
                r, g, b = (
                    int(row_colors[col_idx, 0]),
                    int(row_colors[col_idx, 1]),
                    int(row_colors[col_idx, 2]),
                )

                # RLE: only add a new escape code if the color changes
                if r != prev_r or g != prev_g or b != prev_b:
                    buf.append(f"\033[38;2;{r};{g};{b}m")
                    prev_r, prev_g, prev_b = r, g, b

                buf.append(row_chars[col_idx])

            lines.append("".join(buf))

        return self._RESET + "\n".join(lines) + self._RESET


if __name__ == "__main__":
    import argparse
    import sys

    from cli.terminal_renderer import TerminalRenderer

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(
        description="True Color ANSI ASCII video player — zero flicker"
    )
    parser.add_argument("video", help="Path to video file (MP4, AVI, MKV ...)")
    parser.add_argument("--palette", default=None, help="Custom character palette, space-separated")
    parser.add_argument(
        "-q",
        "--quality",
        type=int,
        choices=[0, 1, 2, 3],
        default=0,
        help="Color quality: 0=max quality, 3=max speed (default: 0)",
    )
    parser.add_argument(
        "-c",
        "--cols",
        type=int,
        default=0,
        help="Fixed grid width. If 0, auto-fits to terminal (default: 0)",
    )
    args = parser.parse_args()

    custom_palette = args.palette.split() if args.palette else None

    try:
        renderer = TerminalRenderer(
            path=args.video,
            palette=custom_palette,
            quantize_bits=args.quality,
            cols=args.cols,
        )
        renderer.play()
    except FileNotFoundError as e:
        logger.error("[Error] %s", e)
        sys.exit(1)
