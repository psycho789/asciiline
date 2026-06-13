import pytest

from ports.frame_encoder import register_encoder, select_encoder


def test_select_encoder_all_valid_combinations() -> None:
    combos = [
        (True, 2),
        (True, 3),
        (True, 4),
        (True, 5),
        (False, 1),
        (False, 2),
        (False, 3),
        (False, 4),
        (False, 5),
        (False, 6),
    ]
    for pixel_mode, render_mode in combos:
        enc = select_encoder(pixel_mode, render_mode)
        assert enc is not None


def test_select_encoder_raises_for_unknown() -> None:
    with pytest.raises(ValueError, match="No encoder registered"):
        select_encoder(False, 99)


def test_register_encoder_makes_new_type_selectable() -> None:
    class FakeEncoder:
        def prepare(self, rows, cols, render_mode, pixel_mode=False) -> None:
            pass

        def encode(self, frame_index, gray, bgr):
            return b""

    register_encoder(False, 99, lambda _mapper: FakeEncoder())
    enc = select_encoder(False, 99)
    assert isinstance(enc, FakeEncoder)


def test_register_encoder_does_not_affect_other_entries() -> None:
    before_5 = type(select_encoder(False, 5))
    before_2 = type(select_encoder(False, 2))

    class FakeEncoder:
        def prepare(self, rows, cols, render_mode, pixel_mode=False) -> None:
            pass

        def encode(self, frame_index, gray, bgr):
            return b""

    register_encoder(False, 99, lambda _mapper: FakeEncoder())

    assert type(select_encoder(False, 5)) is before_5
    assert type(select_encoder(False, 2)) is before_2
    assert type(select_encoder(False, 6)) is not FakeEncoder
