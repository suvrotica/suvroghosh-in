from __future__ import annotations

import re
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "static" / "icon.svg"
APPLE_ICON = ROOT / "static" / "apple-touch-icon.png"
FAVICON = ROOT / "static" / "favicon.ico"
SUPERSAMPLING = 4


def local_name(tag: str) -> str:
	return tag.rsplit("}", 1)[-1]


def parse_view_box(root: Any) -> tuple[float, float, float, float]:
	values = [float(value) for value in root.attrib["viewBox"].replace(",", " ").split()]
	if len(values) != 4 or values[2] <= 0 or values[3] <= 0:
		raise ValueError("icon.svg requires a positive four-value viewBox")
	return values[0], values[1], values[2], values[3]


def path_polygon(path_data: str) -> list[tuple[float, float]]:
	tokens = re.findall(r"[MmHhVvLlZz]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)", path_data)
	points: list[tuple[float, float]] = []
	x = y = start_x = start_y = 0.0
	command = ""
	index = 0
	while index < len(tokens):
		token = tokens[index]
		if token.isalpha():
			command = token
			index += 1
			if command in "Zz":
				points.append((start_x, start_y))
				continue

		if command in "MmLl":
			if index + 1 >= len(tokens):
				raise ValueError("incomplete SVG path coordinate")
			next_x, next_y = float(tokens[index]), float(tokens[index + 1])
			index += 2
			if command.islower():
				next_x += x
				next_y += y
			x, y = next_x, next_y
			if not points:
				start_x, start_y = x, y
			points.append((x, y))
			if command in "Mm":
				command = "l" if command == "m" else "L"
		elif command in "Hh":
			next_x = float(tokens[index])
			index += 1
			x = x + next_x if command == "h" else next_x
			points.append((x, y))
		elif command in "Vv":
			next_y = float(tokens[index])
			index += 1
			y = y + next_y if command == "v" else next_y
			points.append((x, y))
		else:
			raise ValueError(f"unsupported SVG path command: {command or token}")
	return points


def render_icon(size: int) -> Image.Image:
	root = ElementTree.fromstring(SOURCE.read_bytes())
	view_x, view_y, view_width, view_height = parse_view_box(root)
	scale_x = size * SUPERSAMPLING / view_width
	scale_y = size * SUPERSAMPLING / view_height
	canvas_size = (size * SUPERSAMPLING, size * SUPERSAMPLING)
	image = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
	draw = ImageDraw.Draw(image)

	def point(x: float, y: float) -> tuple[float, float]:
		return ((x - view_x) * scale_x, (y - view_y) * scale_y)

	for element in root:
		tag = local_name(element.tag)
		fill = ImageColor.getrgb(element.attrib.get("fill", "#000000")) + (255,)
		if tag == "title":
			continue
		if tag == "rect":
			x = float(element.attrib.get("x", 0))
			y = float(element.attrib.get("y", 0))
			width = float(element.attrib["width"])
			height = float(element.attrib["height"])
			radius = float(element.attrib.get("rx", 0)) * min(scale_x, scale_y)
			draw.rounded_rectangle([point(x, y), point(x + width, y + height)], radius, fill=fill)
		elif tag == "circle":
			cx = float(element.attrib["cx"])
			cy = float(element.attrib["cy"])
			radius = float(element.attrib["r"])
			draw.ellipse([point(cx - radius, cy - radius), point(cx + radius, cy + radius)], fill=fill)
		elif tag == "path":
			draw.polygon([point(x, y) for x, y in path_polygon(element.attrib["d"])], fill=fill)
		else:
			raise ValueError(f"unsupported icon.svg element: {tag}")

	return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
	apple = render_icon(180)
	apple.save(APPLE_ICON, format="PNG", optimize=True, compress_level=9)

	favicon_sizes = (16, 32, 48)
	favicon_frames = [render_icon(size) for size in favicon_sizes]
	favicon_frames[-1].save(
		FAVICON,
		format="ICO",
		sizes=[(size, size) for size in favicon_sizes],
		append_images=favicon_frames[:-1],
	)
	print("Generated apple-touch-icon.png (180x180) and favicon.ico (16x16, 32x32, 48x48).")


if __name__ == "__main__":
	main()
