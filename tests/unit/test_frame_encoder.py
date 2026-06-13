import struct

import numpy as np
import pytest

from ascii_video_player2 import AsciiMapper
from ports.frame_encoder import (
    QUANTIZE_BITS,
    BwTextEncoder,
    ColorBinaryEncoder,
    DeltaColorEncoder,
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
    assert QUANTIZE_BITS == {5: 0, 4: 2, 3: 3, 2: 5, 6: 0}


def test_ascii_mapper_palette_size():
    mapper = AsciiMapper()
    assert mapper.palette_size == len(AsciiMapper.DEFAULT_PALETTE)


def test_ascii_mapper_char_lut_bytes():
    mapper = AsciiMapper()
    lut = mapper.char_lut_bytes()
    assert lut.dtype == np.uint8
    assert len(lut) == mapper.palette_size


def test_pixel_encoder_header_and_payload_length(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = PixelEncoder()
    enc.prepare(rows, cols, render_mode=5, pixel_mode=True)
    payload = enc.encode(42, None, bgr_2x2)
    assert struct.unpack(">I", payload[:4]) == (42,)
    assert len(payload) == 4 + rows * cols * 3
    assert payload[4:] == bgr_2x2.tobytes()


def test_color_binary_encoder_mode3(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = ColorBinaryEncoder()
    enc.prepare(rows, cols, render_mode=3)
    payload = enc.encode(7, gray_2x2, bgr_2x2)
    assert struct.unpack(">I", payload[:4]) == (7,)
    assert len(payload) == 4 + rows * cols * 4


def test_color_binary_quantization_mode2(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = ColorBinaryEncoder()
    enc.prepare(rows, cols, render_mode=2)
    payload = enc.encode(1, gray_2x2, bgr_2x2)
    assert len(payload) == 4 + rows * cols * 4
    cell = payload[4:8]
    assert cell[1] & 0x1F == 0
    assert cell[2] & 0x1F == 0
    assert cell[3] & 0x1F == 0


def test_bw_text_encoder_binary_format(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = BwTextEncoder()
    enc.prepare(rows, cols, render_mode=1)
    payload = enc.encode(3, gray_2x2, bgr_2x2)
    assert isinstance(payload, bytes)
    assert struct.unpack(">I", payload[:4]) == (3,)
    assert len(payload) == 4 + rows * cols


def test_color_binary_modes_4_and_5(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    for mode in (4, 5):
        enc = ColorBinaryEncoder()
        enc.prepare(rows, cols, render_mode=mode)
        payload = enc.encode(0, gray_2x2, bgr_2x2)
        assert len(payload) == 4 + rows * cols * 4


def test_delta_encoder_first_frame_is_iframe(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = DeltaColorEncoder(i_frame_interval=60)
    enc.prepare(rows, cols, render_mode=6)
    payload = enc.encode(0, gray_2x2, bgr_2x2)
    assert payload[4] == 0x00
    assert len(payload) == 5 + rows * cols * 4


def test_delta_encoder_unchanged_frame_small(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = DeltaColorEncoder(i_frame_interval=60)
    enc.prepare(rows, cols, render_mode=6)
    enc.encode(0, gray_2x2, bgr_2x2)
    delta = enc.encode(1, gray_2x2, bgr_2x2)
    assert delta[4] == 0x01
    changed = struct.unpack(">I", delta[5:9])[0]
    assert changed == 0
    assert len(delta) == 9


def test_delta_encoder_iframe_every_interval(gray_2x2, bgr_2x2):
    rows, cols = 2, 2
    enc = DeltaColorEncoder(i_frame_interval=3)
    enc.prepare(rows, cols, render_mode=6)
    types = []
    for i in range(5):
        payload = enc.encode(i, gray_2x2, bgr_2x2)
        types.append(payload[4])
    assert types[0] == 0x00
    assert 0x00 in types[1:]
