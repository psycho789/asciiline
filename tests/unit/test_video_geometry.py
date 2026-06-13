from use_cases.stream_prefs import clamp_cols, normalize_aspect_preset, parse_stream_prefs
from use_cases.video_geometry import (
    calc_auto_rows,
    calc_rows_for_aspect,
    resolve_grid_size,
)


def test_calc_rows_for_aspect_ascii_16_9():
    rows = calc_rows_for_aspect(cols=160, visual_aspect=16 / 9, pixel_mode=False)
    assert rows == max(1, round(160 / (16 / 9) / 2))


def test_calc_rows_for_aspect_pixel_16_9():
    rows = calc_rows_for_aspect(cols=160, visual_aspect=16 / 9, pixel_mode=True)
    assert rows == max(1, round(160 / (16 / 9)))


def test_resolve_grid_size_auto_matches_calc_auto_rows():
    resolved_cols, rows = resolve_grid_size(200, 1920, 1080, pixel_mode=False, aspect_preset="auto")
    assert resolved_cols == 200
    assert rows == calc_auto_rows(200, 1920, 1080, pixel_mode=False)


def test_resolve_grid_size_forced_21_9():
    cols, rows = resolve_grid_size(220, 1920, 1080, pixel_mode=False, aspect_preset="21:9")
    assert cols == 220
    assert rows == calc_rows_for_aspect(220, 21 / 9, pixel_mode=False)


def test_resolve_grid_size_explicit_rows_override():
    cols, rows = resolve_grid_size(
        200, 1920, 1080, pixel_mode=False, aspect_preset="16:9", rows_cfg=90
    )
    assert cols == 200
    assert rows == 90


def test_parse_stream_prefs_clamps_cols():
    prefs = parse_stream_prefs(9999, "bogus")
    assert prefs.cols == 800
    assert prefs.aspect == "auto"


def test_normalize_aspect_preset_invalid():
    assert normalize_aspect_preset("2:1") == "auto"


def test_clamp_cols_none():
    assert clamp_cols(None) is None
