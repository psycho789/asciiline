"""Pre-render a video to ASCLBIN static frame file."""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

from ascii_video_player2 import VideoDecoder
from ports.frame_encoder import select_encoder
from use_cases.video_geometry import get_video_dimensions, resolve_grid_size

ASCLBIN_MAGIC = b"ASCLBIN\x01"


def render_video_to_asclbin(
    video_path: str,
    output_path: str,
    *,
    cols: int = 280,
    rows: int = 0,
    render_mode: int = 3,
    pixel_mode: bool = False,
) -> Path:
    out = Path(output_path)
    vid_w, vid_h = get_video_dimensions(video_path)
    grid_cols, grid_rows = resolve_grid_size(
        cols,
        vid_w,
        vid_h,
        pixel_mode,
        aspect_preset="auto",
        rows_cfg=rows,
    )

    decoder = VideoDecoder(video_path, grid_cols, grid_rows, skip_gray=pixel_mode)
    encoder = select_encoder(pixel_mode, render_mode)
    encoder.prepare(grid_rows, grid_cols, render_mode, pixel_mode=pixel_mode)

    frames: list[bytes] = []
    frame_index = 0
    fps = float(decoder.fps)
    try:
        while True:
            gray, bgr = next(decoder)
            payload = encoder.encode(frame_index, gray, bgr)
            frame_bytes = payload.encode() if isinstance(payload, str) else bytes(payload)
            frames.append(frame_bytes)
            frame_index += 1
    except StopIteration:
        pass
    finally:
        decoder.release()

    with out.open("wb") as fh:
        fh.write(ASCLBIN_MAGIC)
        fh.write(struct.pack(">f", fps))
        fh.write(struct.pack(">III", grid_cols, grid_rows, render_mode))
        fh.write(struct.pack(">I", len(frames)))
        for frame in frames:
            fh.write(struct.pack(">I", len(frame)))
            fh.write(frame)

    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Render video to ASCLBIN static file")
    parser.add_argument("video", help="Input video path")
    parser.add_argument("output", help="Output .asclbin path")
    parser.add_argument("--cols", type=int, default=280)
    parser.add_argument("--rows", type=int, default=0)
    parser.add_argument("--mode", type=int, default=3, choices=[1, 2, 3, 4, 5, 6])
    parser.add_argument("--pixel", action="store_true")
    args = parser.parse_args(argv)
    path = render_video_to_asclbin(
        args.video,
        args.output,
        cols=args.cols,
        rows=args.rows,
        render_mode=args.mode,
        pixel_mode=args.pixel,
    )
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
