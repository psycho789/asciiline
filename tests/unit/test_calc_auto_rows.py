from use_cases.video_geometry import calc_auto_rows


def test_ascii_mode_halves_height_ratio():
    rows = calc_auto_rows(cols=200, vid_w=1920, vid_h=1080, pixel_mode=False)
    assert rows == max(1, round(200 / (1920 / 1080) / 2))


def test_pixel_mode_square_cells():
    rows = calc_auto_rows(cols=100, vid_w=640, vid_h=480, pixel_mode=True)
    assert rows == max(1, round(100 / (640 / 480)))


def test_zero_height_uses_max_guard():
    rows = calc_auto_rows(cols=80, vid_w=640, vid_h=0, pixel_mode=False)
    assert rows == max(1, round(80 / (640 / 1) / 2))
