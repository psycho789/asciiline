#!/usr/bin/env python3
"""Render LLM-authored epilogue scene to MP4 for jubeilunch_extended.mp4 splice."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH = 320
HEIGHT = 240
FPS = 30
FRAMES_DIR = Path("/tmp/scene_frames")
OUTPUT_MP4 = Path("/tmp/generated_scene.mp4")

# Contextual epilogue based on vision analysis of jubeilunch.mp4:
# Ninja Scroll-style ronin on a wooden bridge, onigiri lunch, storm finale.
SCENE = [
    {
        "duration": 3,
        "lines": [
            "",
            "[ END OF TRANSMISSION ]",
            "",
            "the bridge holds",
        ],
    },
    {
        "duration": 4,
        "lines": [
            "     ___________",
            "    /           \\",
            "===|===|===|===|===",
            "   |   |   |   |   |",
            "   |~~~|~~~|~~~|~~~|",
            "        | | |",
            "     lone ronin",
        ],
    },
    {
        "duration": 4,
        "lines": [
            "",
            "  .---.",
            " /     \\",
            "|  ONI  |",
            " \\  GIRI /",
            "  '---'",
            "",
            "lunch on the bridge",
        ],
    },
    {
        "duration": 4,
        "lines": [
            "",
            "storm clouds roll in",
            "the scroll stays behind",
            "",
            "he walks on anyway",
        ],
    },
    {
        "duration": 3,
        "lines": [
            "",
            "jubei lunch",
            "— 2026 —",
            "",
            "rendered by",
            "ASCILINE ENGINE",
        ],
    },
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
        "/System/Library/Fonts/Courier.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "C:/Windows/Fonts/consola.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_frame(lines: list[str]) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), color=(0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = load_font(14)
    line_height = 18
    total_height = len(lines) * line_height
    y_start = max(8, (HEIGHT - total_height) // 2)

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        text_w = bbox[2] - bbox[0]
        x = max(4, (WIDTH - text_w) // 2)
        y = y_start + i * line_height
        draw.text((x, y), line, fill=(235, 235, 235), font=font)

    return img


def render_frames() -> int:
    if FRAMES_DIR.exists():
        shutil.rmtree(FRAMES_DIR)
    FRAMES_DIR.mkdir(parents=True)

    frame_idx = 0
    for segment in SCENE:
        img = draw_frame(segment["lines"])
        count = int(segment["duration"] * FPS)
        for _ in range(count):
            frame_idx += 1
            img.save(FRAMES_DIR / f"frame_{frame_idx:04d}.png")

    return frame_idx


def encode_video(frame_count: int) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-r",
        str(FPS),
        "-i",
        str(FRAMES_DIR / "frame_%04d.png"),
        "-frames:v",
        str(frame_count),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(OUTPUT_MP4),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    frame_count = render_frames()
    print(f"Rendered {frame_count} frames to {FRAMES_DIR}")
    encode_video(frame_count)
    print(f"Encoded {OUTPUT_MP4}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
