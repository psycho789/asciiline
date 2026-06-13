import struct
from collections.abc import Callable
from typing import Protocol

import numpy as np

from ascii_video_player2 import AsciiMapper

QUANTIZE_BITS = {5: 0, 4: 2, 3: 3, 2: 5, 6: 0}

EncoderFactory = Callable[[AsciiMapper | None], "FrameEncoder"]

_ENCODER_FACTORIES: dict[tuple[bool, int], EncoderFactory] = {
    (True, 2): lambda mapper: PixelEncoder(),
    (True, 3): lambda mapper: PixelEncoder(),
    (True, 4): lambda mapper: PixelEncoder(),
    (True, 5): lambda mapper: PixelEncoder(),
    (False, 1): lambda mapper: BwTextEncoder(mapper),
    (False, 2): lambda mapper: ColorBinaryEncoder(mapper),
    (False, 3): lambda mapper: ColorBinaryEncoder(mapper),
    (False, 4): lambda mapper: ColorBinaryEncoder(mapper),
    (False, 5): lambda mapper: ColorBinaryEncoder(mapper),
}


class FrameEncoder(Protocol):
    def prepare(self, rows: int, cols: int, render_mode: int, pixel_mode: bool = False) -> None: ...

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
    ) -> bytes | str: ...


class PixelEncoder:
    def __init__(self) -> None:
        self._send_buf: bytearray | None = None
        self._rows = 0
        self._cols = 0
        self._render_mode = 0
        self._pixel_mode = False

    def prepare(self, rows: int, cols: int, render_mode: int, pixel_mode: bool = False) -> None:
        self._rows = rows
        self._cols = cols
        self._render_mode = render_mode
        self._pixel_mode = pixel_mode
        self._send_buf = bytearray(4 + rows * cols * 3)

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
    ) -> bytes:
        assert self._send_buf is not None
        struct.pack_into(">I", self._send_buf, 0, frame_index)
        self._send_buf[4:] = bgr.tobytes()
        return bytes(self._send_buf)


class BwTextEncoder:
    def __init__(self, mapper: AsciiMapper | None = None) -> None:
        self._mapper = mapper or AsciiMapper()
        self._char_byte_lut = self._mapper.char_lut_bytes()
        self._rows = 0
        self._cols = 0
        self._render_mode = 0
        self._pixel_mode = False

    def prepare(self, rows: int, cols: int, render_mode: int, pixel_mode: bool = False) -> None:
        self._rows = rows
        self._cols = cols
        self._render_mode = render_mode
        self._pixel_mode = pixel_mode

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
    ) -> bytes:
        assert gray is not None
        palette_size = self._mapper.palette_size
        indices = np.floor_divide(gray, max(1, 256 // palette_size))
        np.clip(indices, 0, palette_size - 1, out=indices)
        char_codes = self._char_byte_lut[indices]
        buf = bytearray(4 + self._rows * self._cols)
        struct.pack_into(">I", buf, 0, frame_index)
        buf[4:] = char_codes.tobytes()
        return bytes(buf)


class ColorBinaryEncoder:
    def __init__(self, mapper: AsciiMapper | None = None) -> None:
        self._mapper = mapper or AsciiMapper()
        self._char_byte_lut = self._mapper.char_lut_bytes()
        self._frame_buf: np.ndarray | None = None
        self._send_arr: np.ndarray | None = None
        self._body_view: np.ndarray | None = None
        self._rows = 0
        self._cols = 0
        self._render_mode = 0
        self._pixel_mode = False

    def prepare(self, rows: int, cols: int, render_mode: int, pixel_mode: bool = False) -> None:
        self._rows = rows
        self._cols = cols
        self._render_mode = render_mode
        self._pixel_mode = pixel_mode
        self._frame_buf = np.empty((rows, cols, 4), dtype=np.uint8)
        self._send_arr = np.empty(4 + rows * cols * 4, dtype=np.uint8)
        self._body_view = self._send_arr[4:].reshape(rows, cols, 4)

    def _build_frame_buf(self, gray: np.ndarray, bgr: np.ndarray) -> None:
        assert self._frame_buf is not None
        qb = QUANTIZE_BITS.get(self._render_mode, 0)
        palette_size = self._mapper.palette_size
        indices = np.floor_divide(gray, max(1, 256 // palette_size))
        np.clip(indices, 0, palette_size - 1, out=indices)
        char_codes = self._char_byte_lut[indices]
        rgb = bgr[:, :, ::-1]
        if qb > 0:
            rgb = (rgb >> qb) << qb
        self._frame_buf[:, :, 0] = char_codes
        self._frame_buf[:, :, 1:] = rgb

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
    ) -> bytes:
        assert gray is not None
        assert self._frame_buf is not None
        assert self._send_arr is not None
        assert self._body_view is not None
        self._build_frame_buf(gray, bgr)
        struct.pack_into(">I", self._send_arr, 0, frame_index)
        np.copyto(self._body_view, self._frame_buf)
        return bytes(self._send_arr)


class DeltaColorEncoder:
    def __init__(self, mapper: AsciiMapper | None = None, i_frame_interval: int = 60) -> None:
        self._mapper = mapper or AsciiMapper()
        self._char_byte_lut = self._mapper.char_lut_bytes()
        self._i_frame_interval = i_frame_interval
        self._frame_buf: np.ndarray | None = None
        self._prev_buf: np.ndarray | None = None
        self._rows = 0
        self._cols = 0
        self._render_mode = 6
        self._pixel_mode = False
        self._i_frame_counter = 0

    def prepare(self, rows: int, cols: int, render_mode: int, pixel_mode: bool = False) -> None:
        self._rows = rows
        self._cols = cols
        self._render_mode = render_mode
        self._pixel_mode = pixel_mode
        self._frame_buf = np.empty((rows, cols, 4), dtype=np.uint8)
        self._prev_buf = np.zeros((rows, cols, 4), dtype=np.uint8)
        self._i_frame_counter = 0

    def _build_frame_buf(self, gray: np.ndarray, bgr: np.ndarray) -> None:
        assert self._frame_buf is not None
        qb = QUANTIZE_BITS.get(self._render_mode, 0)
        palette_size = self._mapper.palette_size
        indices = np.floor_divide(gray, max(1, 256 // palette_size))
        np.clip(indices, 0, palette_size - 1, out=indices)
        char_codes = self._char_byte_lut[indices]
        rgb = bgr[:, :, ::-1]
        if qb > 0:
            rgb = (rgb >> qb) << qb
        self._frame_buf[:, :, 0] = char_codes
        self._frame_buf[:, :, 1:] = rgb

    def _encode_iframe(self, frame_index: int) -> bytes:
        assert self._frame_buf is not None
        buf = bytearray(5 + self._rows * self._cols * 4)
        struct.pack_into(">I", buf, 0, frame_index)
        buf[4] = 0x00
        buf[5:] = self._frame_buf.tobytes()
        return bytes(buf)

    def _encode_delta(self, frame_index: int, changed_flat: np.ndarray) -> bytes:
        assert self._frame_buf is not None
        count = int(changed_flat.size)
        buf = bytearray(9 + count * 6)
        struct.pack_into(">I", buf, 0, frame_index)
        buf[4] = 0x01
        struct.pack_into(">I", buf, 5, count)
        flat = self._frame_buf.reshape(-1, 4)
        off = 9
        for idx in changed_flat:
            cell = flat[int(idx)]
            struct.pack_into(">H", buf, off, int(idx))
            buf[off + 2 : off + 6] = cell.tobytes()
            off += 6
        return bytes(buf)

    def encode(
        self,
        frame_index: int,
        gray: np.ndarray | None,
        bgr: np.ndarray,
    ) -> bytes:
        assert gray is not None
        assert self._frame_buf is not None
        assert self._prev_buf is not None
        self._build_frame_buf(gray, bgr)
        self._i_frame_counter -= 1
        if self._i_frame_counter <= 0:
            self._i_frame_counter = self._i_frame_interval
            np.copyto(self._prev_buf, self._frame_buf)
            return self._encode_iframe(frame_index)
        diff_mask = np.any(self._frame_buf != self._prev_buf, axis=-1)
        changed_flat = np.flatnonzero(diff_mask.ravel())
        np.copyto(self._prev_buf, self._frame_buf)
        return self._encode_delta(frame_index, changed_flat)


def select_encoder(
    pixel_mode: bool,
    render_mode: int,
    mapper: AsciiMapper | None = None,
) -> FrameEncoder:
    factory = _ENCODER_FACTORIES.get((pixel_mode, render_mode))
    if factory is None:
        raise ValueError(
            f"No encoder registered for pixel_mode={pixel_mode}, render_mode={render_mode}"
        )
    return factory(mapper)


def register_encoder(
    pixel_mode: bool,
    render_mode: int,
    factory: EncoderFactory,
) -> None:
    """Register a new encoder factory. Called once at application startup."""
    _ENCODER_FACTORIES[(pixel_mode, render_mode)] = factory


register_encoder(False, 6, lambda mapper: DeltaColorEncoder(mapper, i_frame_interval=60))
