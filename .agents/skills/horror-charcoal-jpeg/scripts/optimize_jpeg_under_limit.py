#!/usr/bin/env python3
"""
Optimize an input image into a real JPEG under a target size.

Designed for Codex skills on Windows projects:
    py optimize_jpeg_under_limit.py --input input.png --output static/images/output.jpg --max-kb 500

Requires Pillow:
    py -m pip install pillow
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path
from typing import Iterable, Tuple

try:
    from PIL import Image, ImageOps
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install it with: py -m pip install pillow"
    ) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert/compress an image to a JPEG under a requested file-size limit."
    )
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output .jpg path")
    parser.add_argument("--max-kb", type=int, default=500, help="Maximum size in kB; default 500")
    parser.add_argument(
        "--min-quality", type=int, default=50, help="Lowest JPEG quality allowed before resizing"
    )
    parser.add_argument(
        "--max-quality", type=int, default=92, help="Highest JPEG quality to try"
    )
    parser.add_argument(
        "--min-long-edge",
        type=int,
        default=768,
        help="Smallest longest-edge dimension to try before final fallback",
    )
    parser.add_argument(
        "--grayscale",
        action="store_true",
        help="Convert to grayscale before RGB JPEG save. Useful for charcoal art.",
    )
    return parser.parse_args()


def normalize_output_path(path: Path) -> Path:
    if path.suffix.lower() not in {".jpg", ".jpeg"}:
        path = path.with_suffix(".jpg")
    if path.suffix.lower() == ".jpeg":
        path = path.with_suffix(".jpg")
    return path


def load_image(path: Path, grayscale: bool) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"Input image not found: {path}")
    image = Image.open(path)
    image = ImageOps.exif_transpose(image)

    # Flatten alpha/transparency onto platinum-white canvas.
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (245, 245, 242, 255))
        image = Image.alpha_composite(background, rgba).convert("RGB")
    elif grayscale:
        image = image.convert("L").convert("RGB")
    else:
        image = image.convert("RGB")

    if grayscale and image.mode != "RGB":
        image = image.convert("RGB")
    elif grayscale:
        image = image.convert("L").convert("RGB")

    return image


def save_to_bytes(image: Image.Image, quality: int) -> bytes:
    buffer = io.BytesIO()
    image.save(
        buffer,
        format="JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
        subsampling=0,
    )
    return buffer.getvalue()


def resize_to_long_edge(image: Image.Image, long_edge: int) -> Image.Image:
    width, height = image.size
    current_long = max(width, height)
    if current_long <= long_edge:
        return image.copy()
    scale = long_edge / current_long
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def candidate_edges(original_long: int, min_long_edge: int) -> Iterable[int]:
    preferred = [2400, 2048, 1920, 1800, 1600, 1440, 1280, 1152, 1024, 960, 900, 768]
    yielded: list[int] = []
    for edge in preferred:
        if edge <= original_long and edge >= min_long_edge:
            yielded.append(edge)
            yield edge
    if not yielded:
        yield min(original_long, min_long_edge)


def choose_best_jpeg(
    image: Image.Image,
    max_bytes: int,
    min_quality: int,
    max_quality: int,
    min_long_edge: int,
) -> Tuple[bytes, int, Tuple[int, int]]:
    original_long = max(image.size)
    best_under: tuple[bytes, int, Tuple[int, int]] | None = None
    smallest_over: tuple[bytes, int, Tuple[int, int]] | None = None

    for edge in candidate_edges(original_long, min_long_edge):
        resized = resize_to_long_edge(image, edge)

        # Binary search for the highest quality that fits at this size.
        low = min_quality
        high = max_quality
        local_best: tuple[bytes, int, Tuple[int, int]] | None = None

        while low <= high:
            quality = (low + high) // 2
            data = save_to_bytes(resized, quality)
            candidate = (data, quality, resized.size)

            if len(data) <= max_bytes:
                local_best = candidate
                low = quality + 1
            else:
                if smallest_over is None or len(data) < len(smallest_over[0]):
                    smallest_over = candidate
                high = quality - 1

        if local_best is not None:
            if best_under is None or local_best[1] > best_under[1] or local_best[2][0] * local_best[2][1] > best_under[2][0] * best_under[2][1]:
                best_under = local_best
            # First fitting edge is usually the largest acceptable dimension; return it.
            return local_best

    if best_under is not None:
        return best_under

    # Final fallback: keep shrinking below min_long_edge if absolutely needed.
    edge = min_long_edge
    while edge >= 320:
        resized = resize_to_long_edge(image, edge)
        data = save_to_bytes(resized, min_quality)
        if len(data) <= max_bytes:
            return data, min_quality, resized.size
        if smallest_over is None or len(data) < len(smallest_over[0]):
            smallest_over = (data, min_quality, resized.size)
        edge = int(edge * 0.9)

    if smallest_over is not None:
        return smallest_over

    raise RuntimeError("Could not produce a JPEG candidate.")


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = normalize_output_path(Path(args.output).expanduser()).resolve()
    max_bytes = args.max_kb * 1024

    if args.min_quality < 1 or args.max_quality > 100 or args.min_quality > args.max_quality:
        raise SystemExit("Invalid quality range.")

    image = load_image(input_path, grayscale=args.grayscale)
    data, quality, dimensions = choose_best_jpeg(
        image=image,
        max_bytes=max_bytes,
        min_quality=args.min_quality,
        max_quality=args.max_quality,
        min_long_edge=args.min_long_edge,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(data)

    size = output_path.stat().st_size
    status = "OK" if size <= max_bytes else "OVER_LIMIT"
    print(f"{status}: {output_path}")
    print(f"Size: {size} bytes / limit {max_bytes} bytes")
    print(f"Dimensions: {dimensions[0]}x{dimensions[1]}")
    print(f"JPEG quality: {quality}")

    return 0 if size <= max_bytes else 2


if __name__ == "__main__":
    raise SystemExit(main())
