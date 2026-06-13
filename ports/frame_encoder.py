import struct
from typing import Protocol

import numpy as np

from ascii_video_player2 import AsciiMapper

QUANTIZE_BITS = {5: 0, 4: 2, 3: 3, 2: 5}


class FrameEncoder(Protocol):
    def prepare(self, rows: int, cols: int, render_mode: int) -> None: ...

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
        render_mode: int,
        pixel_mode: bool,
        rows: int,
        cols: int,
    ) -> bytes | str: ...


class PixelEncoder:
    def __init__(self) -> None:
        self._send_buf: bytearray | None = None

    def prepare(self, rows: int, cols: int, render_mode: int) -> None:
        self._send_buf = bytearray(4 + rows * cols * 3)

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
        render_mode: int,
        pixel_mode: bool,
        rows: int,
        cols: int,
    ) -> bytes:
        assert self._send_buf is not None
        struct.pack_into(">I", self._send_buf, 0, frame_index)
        self._send_buf[4:] = bgr.tobytes()
        return bytes(self._send_buf)


class BwTextEncoder:
    def __init__(self, mapper: AsciiMapper | None = None) -> None:
        self._mapper = mapper or AsciiMapper()

    def prepare(self, rows: int, cols: int, render_mode: int) -> None:
        pass

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
        render_mode: int,
        pixel_mode: bool,
        rows: int,
        cols: int,
    ) -> str:
        assert gray is not None
        indices = np.floor_divide(gray, max(1, 256 // self._mapper._n))
        np.clip(indices, 0, self._mapper._n - 1, out=indices)
        char_matrix = self._mapper._lut[indices]
        lines = ["".join(row) for row in char_matrix]
        return f"{frame_index}\n" + "\n".join(lines)


class ColorBinaryEncoder:
    def __init__(self, mapper: AsciiMapper | None = None) -> None:
        self._mapper = mapper or AsciiMapper()
        self._char_byte_lut = np.array([ord(c) for c in self._mapper._lut], dtype=np.uint8)
        self._frame_buf: np.ndarray | None = None
        self._send_buf: bytearray | None = None

    def prepare(self, rows: int, cols: int, render_mode: int) -> None:
        self._frame_buf = np.empty((rows, cols, 4), dtype=np.uint8)
        self._send_buf = bytearray(4 + rows * cols * 4)

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
        render_mode: int,
        pixel_mode: bool,
        rows: int,
        cols: int,
    ) -> bytes:
        assert gray is not None
        assert self._frame_buf is not None
        assert self._send_buf is not None
        qb = QUANTIZE_BITS.get(render_mode, 0)
        indices = np.floor_divide(gray, max(1, 256 // self._mapper._n))
        np.clip(indices, 0, self._mapper._n - 1, out=indices)
        char_codes = self._char_byte_lut[indices]
        rgb = bgr[:, :, ::-1]
        if qb > 0:
            rgb = (rgb >> qb) << qb
        self._frame_buf[:, :, 0] = char_codes
        self._frame_buf[:, :, 1:] = rgb
        struct.pack_into(">I", self._send_buf, 0, frame_index)
        self._send_buf[4:] = self._frame_buf.tobytes()
        return bytes(self._send_buf)


def select_encoder(
    pixel_mode: bool, render_mode: int, mapper: AsciiMapper | None = None
) -> FrameEncoder:
    if pixel_mode:
        return PixelEncoder()
    if render_mode == 1:
        return BwTextEncoder(mapper)
    return ColorBinaryEncoder(mapper)
