import struct

import numpy as np
import pytest

from ports.frame_encoder import (
    QUANTIZE_BITS,
    BwTextEncoder,
    ColorBinaryEncoder,
    PixelEncoder,
)


@pytest.fixture
def gray_2x2() -> np.ndarray:
    return np.array([[0, 64], [128, 255]], dtype=np.uint8)


@pytest.fixture
def bgr_2x2() -> np.ndarray:
    return np.array(
        [[[10, 20, 30], [40, 50, 60]], [[70, 80, 90], [100, 110, 120]]],
        dtype=np.uint8,
    )


def test_quantize_bits_table():
    assert QUANTIZE_BITS == {5: 0, 4: 2, 3: 3, 2: 5}


def test_pixel_encoder_header_and_payload_length(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = PixelEncoder()
    enc.prepare(rows, cols, render_mode=5)
    payload = enc.encode(42, None, bgr_2x2, 5, True, rows, cols)
    assert struct.unpack(">I", payload[:4]) == (42,)
    assert len(payload) == 4 + rows * cols * 3
    assert payload[4:] == bgr_2x2.tobytes()


def test_color_binary_encoder_mode3(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = ColorBinaryEncoder()
    enc.prepare(rows, cols, render_mode=3)
    payload = enc.encode(7, gray_2x2, bgr_2x2, 3, False, rows, cols)
    assert struct.unpack(">I", payload[:4]) == (7,)
    assert len(payload) == 4 + rows * cols * 4


def test_color_binary_quantization_mode2(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = ColorBinaryEncoder()
    enc.prepare(rows, cols, render_mode=2)
    payload = enc.encode(1, gray_2x2, bgr_2x2, 2, False, rows, cols)
    assert len(payload) == 4 + rows * cols * 4
    # RGB channels quantized with qb=5: low 5 bits cleared
    cell = payload[4:8]
    assert cell[1] & 0x1F == 0
    assert cell[2] & 0x1F == 0
    assert cell[3] & 0x1F == 0


def test_bw_text_encoder_format(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = BwTextEncoder()
    enc.prepare(rows, cols, render_mode=1)
    text = enc.encode(3, gray_2x2, bgr_2x2, 1, False, rows, cols)
    assert text.startswith("3\n")
    lines = text.split("\n")
    assert len(lines) == 1 + rows


def test_color_binary_modes_4_and_5(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    for mode in (4, 5):
        enc = ColorBinaryEncoder()
        enc.prepare(rows, cols, render_mode=mode)
        payload = enc.encode(0, gray_2x2, bgr_2x2, mode, False, rows, cols)
        assert len(payload) == 4 + rows * cols * 4
