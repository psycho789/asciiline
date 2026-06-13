"""Terminal CLI renderer for ASCII video playback."""

from __future__ import annotations

import logging
import shutil
import sys
import time

from ascii_video_player2 import AsciiMapper, VideoDecoder

logger = logging.getLogger(__name__)


class TerminalRenderer:
    """
    Manages the flow: VideoDecoder -> AsciiMapper -> stdout.

    Additional features (colored version):
      - Sets terminal background to black initially (\\033[40m)
      - Resets color with \\033[0m at the end of each frame
    """

    _CURSOR_HOME = "\033[H"
    _HIDE_CURSOR = "\033[?25l"
    _SHOW_CURSOR = "\033[?25h"
    _DISABLE_WRAP = "\033[?7l"
    _ENABLE_WRAP = "\033[?7h"
    _BLACK_BG = "\033[40m"
    _RESET_ALL = "\033[0m"
    _CLEAR_SCREEN = "\033[2J"

    CHAR_RATIO = 0.45

    def __init__(
        self,
        path: str,
        palette: list[str] | None = None,
        quantize_bits: int = 0,
        cols: int = 0,
    ) -> None:
        _probe = VideoDecoder(path, 2, 2)
        vid_w, vid_h = _probe.vid_w, _probe.vid_h
        src_fps = _probe.fps
        _probe.release()

        term = shutil.get_terminal_size(fallback=(220, 50))
        t_cols = term.columns
        t_lines = term.lines - 2

        orientation = "portrait" if vid_h > vid_w else "landscape"
        aspect = vid_h / vid_w

        if cols > 0:
            rows = max(1, int(cols * aspect * self.CHAR_RATIO))
        else:
            safe_cols = min(t_cols, 160)

            if orientation == "landscape":
                cols = safe_cols
                rows = max(1, int(cols * aspect * self.CHAR_RATIO))
                if rows > t_lines:
                    rows = t_lines
                    cols = max(1, int(rows / (aspect * self.CHAR_RATIO)))
            else:
                rows = t_lines
                cols = max(1, int(rows / (aspect * self.CHAR_RATIO)))
                if cols > safe_cols:
                    cols = safe_cols
                    rows = max(1, int(cols * aspect * self.CHAR_RATIO))

        self._pad_y = max(0, (t_lines - rows) // 2)
        self._pad_x = " " * max(0, (t_cols - cols) // 2)

        logger.info(self._CLEAR_SCREEN)
        logger.info(
            "\033[1m[ASCII Player — True Color]\033[0m\n"
            "  Orientation : %s\n"
            "  Video       : %sx%s\n"
            "  ASCII       : %sx%s characters\n"
            "  FPS         : %.1f\n"
            "  Quantization: %s levels/channel\n"
            "  Exit        : Ctrl+C",
            orientation.upper(),
            vid_w,
            vid_h,
            cols,
            rows,
            src_fps,
            2 ** (8 - quantize_bits),
        )
        time.sleep(2.0)

        self._decoder = VideoDecoder(path, cols, rows)
        self._mapper = AsciiMapper(palette, quantize_bits)
        self._fps = self._decoder.fps
        self._frame_t = 1.0 / self._fps

    def play(self) -> None:
        stdout = sys.stdout

        stdout.write(self._DISABLE_WRAP + self._HIDE_CURSOR + self._BLACK_BG)
        stdout.flush()

        try:
            for gray_frame, bgr_frame in self._decoder:
                t0 = time.perf_counter()

                ascii_frame = self._mapper.convert(gray_frame, bgr_frame)

                if self._pad_x:
                    ascii_frame = self._pad_x + ascii_frame.replace("\n", "\n" + self._pad_x)
                if self._pad_y > 0:
                    ascii_frame = ("\n" * self._pad_y) + ascii_frame

                stdout.write(self._CURSOR_HOME + ascii_frame)
                stdout.flush()

                wait = self._frame_t - (time.perf_counter() - t0)
                if wait > 0:
                    time.sleep(wait)

        except KeyboardInterrupt:
            pass

        finally:
            stdout.write(self._ENABLE_WRAP + self._SHOW_CURSOR + self._RESET_ALL + "\n")
            stdout.flush()
            self._decoder.release()
