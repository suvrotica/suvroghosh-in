#!/usr/bin/env python3
"""Create the print-review edition of a compiled comic album.

Canonical story data remains YAML. This exporter draws final raster panels when they exist and
otherwise prints contextual production panels containing the locked action and dialogue. It never
silently substitutes blank boxes for missing art.
"""

from __future__ import annotations

import argparse
from io import BytesIO
import json
import math
import os
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from lettered_export import (
	LetteredExportAssets,
	lettered_jpeg_bytes,
	validate_lettered_assets,
)


ROOT = Path(__file__).resolve().parents[2]
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 28
INK = HexColor("#241F19")
PAPER = HexColor("#FFF9E9")
MUNICIPAL_RED = HexColor("#8E342D")
GRID_BLUE = HexColor("#315F72")
CAPTION = HexColor("#F1D996")
MUTED = HexColor("#6F6557")
RULE = HexColor("#B8AA90")
PLACEHOLDER_PALETTES = (
	("#315F72", "#E9C563"),
	("#49624A", "#D8C8A6"),
	("#8E342D", "#F1D996"),
	("#5D6A70", "#D9C7A6"),
)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Export a print-friendly comic production PDF with contextual missing-art panels."
	)
	parser.add_argument("--root", default=str(ROOT))
	parser.add_argument("--series", default="the-last-analog-town")
	parser.add_argument("--episode", default="001-the-efficiency-inspector")
	parser.add_argument("--episode-dir")
	parser.add_argument("--compiled")
	parser.add_argument("--output")
	parser.add_argument(
		"--lettered-pages",
		action="store_true",
		help=(
			"Export only from a complete, current, hash-verified lettered-page preview "
			"manifest and the final lettered cover. Validation failures stop the export."
		),
	)
	parser.add_argument(
		"--preview-manifest",
		help="Override the lettered-page preview manifest path (used with --lettered-pages).",
	)
	parser.add_argument(
		"--cover",
		help="Override the final lettered cover path (used with --lettered-pages).",
	)
	parser.add_argument(
		"--lettered-image-quality",
		type=int,
		default=90,
		help="JPEG quality for embedded lettered pages (70-95; default: 90).",
	)
	parser.add_argument(
		"--lettered-image-max-width",
		type=int,
		default=1600,
		help="Maximum embedded lettered-page width in pixels (default: 1600).",
	)
	parser.add_argument(
		"--include-transcript",
		action="store_true",
		help="Append the complete accessible text transcript after the production end matter.",
	)
	return parser.parse_args()


def load_json(filename: Path) -> Any:
	with filename.open("r", encoding="utf-8") as handle:
		return json.load(handle)


def resolve_from_root(root: Path, value: str) -> Path:
	candidate = Path(value)
	return candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()


def resolve_episode_directory(root: Path, series: str, selector: str) -> Path:
	episodes_dir = root / "src" / "lib" / "comics" / series / "episodes"
	direct = episodes_dir / selector
	if (direct / "episode.yaml").is_file():
		return direct.resolve()
	if not episodes_dir.is_dir():
		raise FileNotFoundError(f"Comic episodes directory not found: {episodes_dir}")
	matches = sorted(
		entry
		for entry in episodes_dir.iterdir()
		if entry.is_dir()
		and (entry.name.startswith(f"{selector}-") or entry.name.endswith(f"-{selector}"))
		and (entry / "episode.yaml").is_file()
	)
	if len(matches) != 1:
		detail = ", ".join(entry.name for entry in matches) or "none"
		raise FileNotFoundError(
			f'Comic episode selector "{selector}" matched {len(matches)} directories under '
			f"{episodes_dir}: {detail}"
		)
	return matches[0].resolve()


def episode_paths(args: argparse.Namespace) -> tuple[Path, Path, Path]:
	root = Path(args.root).resolve()
	episode_dir = (
		resolve_from_root(root, args.episode_dir)
		if args.episode_dir
		else resolve_episode_directory(root, args.series, args.episode)
	)
	compiled = (
		resolve_from_root(root, args.compiled)
		if args.compiled
		else episode_dir / "generated" / "episode.json"
	)
	output = (
		resolve_from_root(root, args.output)
		if args.output
		else root / "output" / "pdf" / f"{episode_dir.name}-production-edition.pdf"
	)
	return episode_dir, compiled, output


def runtime_episode(compiled: Any) -> dict[str, Any]:
	if (
		isinstance(compiled, dict)
		and not isinstance(compiled.get("metadata"), dict)
		and isinstance(compiled.get("data"), dict)
	):
		compiled = compiled["data"]
	if not isinstance(compiled, dict) or not isinstance(compiled.get("metadata"), dict):
		raise ValueError("Compiled comic JSON must contain runtime-compatible metadata and pages.")
	if not isinstance(compiled.get("pages"), list):
		raise ValueError("Compiled comic JSON must contain a pages array.")
	return compiled


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
	words = str(text).replace("\n", " \n ").split()
	lines: list[str] = []
	current = ""
	for word in words:
		if word == "\n":
			if current:
				lines.append(current)
				current = ""
			continue
		candidate = f"{current} {word}".strip()
		if current and stringWidth(candidate, font, size) > width:
			lines.append(current)
			current = word
		else:
			current = candidate
	if current:
		lines.append(current)
	return lines


def elide_to_width(text: str, font: str, size: float, width: float) -> str:
	"""Fit one metadata line without cutting a word or character name in half."""
	value = str(text).strip()
	if stringWidth(value, font, size) <= width:
		return value
	ellipsis = "…"
	words = value.split()
	while words:
		candidate = f"{' '.join(words)}{ellipsis}"
		if stringWidth(candidate, font, size) <= width:
			return candidate
		words.pop()
	return ellipsis if stringWidth(ellipsis, font, size) <= width else ""


def draw_wrapped(
	canvas: Canvas,
	text: str,
	x: float,
	y: float,
	width: float,
	font: str,
	size: float,
	leading: float,
	color: Color = INK,
	max_lines: int | None = None,
) -> float:
	lines = wrap_text(text, font, size, width)
	if max_lines is not None and len(lines) > max_lines:
		lines = lines[:max_lines]
		last = lines[-1]
		while last and stringWidth(f"{last}…", font, size) > width:
			last = last[:-1]
		lines[-1] = f"{last.rstrip()}…"
	canvas.setFillColor(color)
	canvas.setFont(font, size)
	for line in lines:
		canvas.drawString(x, y, line)
		y -= leading
	return y


def draw_centered_wrapped(
	canvas: Canvas,
	text: str,
	x: float,
	y: float,
	width: float,
	font: str,
	size: float,
	leading: float,
	color: Color = INK,
) -> float:
	canvas.setFillColor(color)
	canvas.setFont(font, size)
	for line in wrap_text(text, font, size, width):
		canvas.drawCentredString(x + width / 2, y, line)
		y -= leading
	return y


def draw_cover(canvas: Canvas, metadata: dict[str, Any], panel_count: int) -> None:
	canvas.setFillColor(GRID_BLUE)
	canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.saveState()
	canvas.translate(-90, 20)
	canvas.rotate(18)
	canvas.rect(0, 0, PAGE_WIDTH * 0.72, PAGE_HEIGHT * 0.38, fill=1, stroke=0)
	canvas.restoreState()
	canvas.setFillColor(HexColor("#E9C563"))
	canvas.saveState()
	canvas.translate(PAGE_WIDTH * 0.62, PAGE_HEIGHT * 0.68)
	canvas.rotate(-22)
	canvas.rect(0, 0, PAGE_WIDTH * 0.56, PAGE_HEIGHT * 0.32, fill=1, stroke=0)
	canvas.restoreState()

	canvas.setFillColor(white)
	canvas.setFont("Helvetica-Bold", 9)
	canvas.drawString(42, PAGE_HEIGHT - 50, "THE LAST ANALOG TOWN  •  ALBUM 001")
	canvas.setFont("Times-Bold", 44)
	y = PAGE_HEIGHT - 155
	for line in wrap_text(metadata["title"], "Times-Bold", 44, PAGE_WIDTH - 84):
		canvas.drawString(42, y, line)
		y -= 43
	canvas.setFont("Times-Roman", 17)
	canvas.drawString(44, y - 2, metadata.get("subtitle", ""))

	canvas.setFillColor(Color(0.08, 0.09, 0.09, alpha=0.88))
	canvas.roundRect(42, 55, PAGE_WIDTH - 84, 96, 6, fill=1, stroke=0)
	canvas.setFillColor(white)
	canvas.setFont("Helvetica-Bold", 9)
	canvas.drawString(56, 128, "UNPUBLISHED PRODUCTION EDITION")
	canvas.setFont("Helvetica", 8.2)
	canvas.drawString(
		56,
		111,
		"Contextual panel cards appear wherever approved final artwork is still missing.",
	)
	canvas.drawString(
		56,
		96,
		f"{metadata['storyPageCount']} story pages  •  {panel_count} scripted panels  •  complete dialogue",
	)
	canvas.drawString(56, 81, "Final publication remains gated by art, rights, language, cultural, and human review.")
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawRightString(PAGE_WIDTH - 56, 65, "COMIC  •  GOLMOHAR JUNCTION")
	canvas.showPage()


def draw_title_material(
	canvas: Canvas,
	metadata: dict[str, Any],
	series_data: dict[str, Any] | None,
	characters: list[dict[str, Any]],
) -> None:
	canvas.setFillColor(PAPER)
	canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.rect(0, PAGE_HEIGHT - 16, PAGE_WIDTH, 16, fill=1, stroke=0)
	canvas.setFillColor(INK)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, PAGE_HEIGHT - 44, "TITLE, CREDITS & READING NOTES")
	canvas.setFont("Times-Bold", 28)
	canvas.drawString(MARGIN, PAGE_HEIGHT - 82, metadata["title"])
	y = draw_wrapped(
		canvas,
		metadata["description"],
		MARGIN,
		PAGE_HEIGHT - 110,
		PAGE_WIDTH - 2 * MARGIN,
		"Times-Roman",
		11,
		14,
	)
	y -= 8
	canvas.setStrokeColor(RULE)
	canvas.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
	y -= 22

	canvas.setFont("Helvetica-Bold", 8)
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.drawString(MARGIN, y, "CREDITS")
	y -= 16
	for credit in metadata.get("credits", []):
		canvas.setFillColor(MUTED)
		canvas.setFont("Helvetica-Bold", 7.5)
		canvas.drawString(MARGIN, y, str(credit.get("role", "")).upper())
		canvas.setFillColor(INK)
		canvas.setFont("Times-Bold", 10)
		canvas.drawString(MARGIN + 150, y, str(credit.get("name", "")))
		y -= 15

	y -= 8
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, y, "CONTENT GUIDANCE")
	y -= 15
	canvas.setFillColor(INK)
	for item in metadata.get("contentGuidance", []):
		y = draw_wrapped(
			canvas,
			f"• {item}",
			MARGIN,
			y,
			PAGE_WIDTH - 2 * MARGIN,
			"Helvetica",
			8.2,
			11,
		)

	y -= 7
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, y, "PRINCIPAL CAST")
	y -= 15
	for character in characters[:6]:
		role = character.get("role") or character.get("narrativeFunction") or ""
		canvas.setFillColor(INK)
		canvas.setFont("Helvetica-Bold", 8)
		canvas.drawString(MARGIN, y, character.get("name", character.get("id", "")))
		y = draw_wrapped(
			canvas,
			role,
			MARGIN + 118,
			y,
			PAGE_WIDTH - 2 * MARGIN - 118,
			"Helvetica",
			7.4,
			9.2,
			MUTED,
			max_lines=2,
		)
		y -= 4

	fiction_note = (
		series_data.get("setting", {}).get("notRealPlaceStatement")
		if series_data
		else "Golmohar Junction is wholly fictional and is not a renamed real municipality."
	)
	canvas.setStrokeColor(RULE)
	canvas.line(MARGIN, 87, PAGE_WIDTH - MARGIN, 87)
	draw_wrapped(
		canvas,
		f"Fictional-setting note: {fiction_note}",
		MARGIN,
		72,
		PAGE_WIDTH - 2 * MARGIN,
		"Helvetica",
		7.4,
		9.5,
		MUTED,
		max_lines=4,
	)
	canvas.setFont("Helvetica", 7)
	canvas.drawRightString(PAGE_WIDTH - MARGIN, 24, "Cover and this page are outside the 62 story pages.")
	canvas.showPage()


def panel_grid(count: int, x: float, y: float, width: float, height: float) -> list[tuple[float, float, float, float]]:
	gutter = 7
	if count == 4:
		columns, rows = 2, 2
		return [
			(
				x + column * (width + gutter) / columns,
				y + (rows - 1 - row) * (height + gutter) / rows,
				(width - gutter) / columns,
				(height - gutter) / rows,
			)
			for row in range(rows)
			for column in range(columns)
		]
	if count == 5:
		lead_height = (height - gutter) * 0.38
		lower_height = height - lead_height - gutter
		boxes = [(x, y + lower_height + gutter, width, lead_height)]
		boxes.extend(
			[
				(
					x + column * (width + gutter) / 2,
					y + (1 - row) * (lower_height + gutter) / 2,
					(width - gutter) / 2,
					(lower_height - gutter) / 2,
				)
				for row in range(2)
				for column in range(2)
			]
		)
		return boxes
	if count == 6:
		columns, rows = 2, 3
		return [
			(
				x + column * (width + gutter) / columns,
				y + (rows - 1 - row) * (height + gutter) / rows,
				(width - gutter) / columns,
				(height - 2 * gutter) / rows,
			)
			for row in range(rows)
			for column in range(columns)
		]
	columns = 3 if count > 6 else 2
	rows = math.ceil(count / columns)
	return [
		(
			x + column * (width + gutter) / columns,
			y + (rows - 1 - row) * (height + gutter) / rows,
			(width - (columns - 1) * gutter) / columns,
			(height - (rows - 1) * gutter) / rows,
		)
		for row in range(rows)
		for column in range(columns)
	][:count]


def resolve_art_path(
	art_value: str | None, episode_dir: Path, root: Path
) -> Path | None:
	if not art_value:
		return None
	if art_value.startswith("/"):
		candidate = root / "static" / art_value.lstrip("/")
	else:
		candidate = episode_dir / art_value
	return candidate.resolve() if candidate.exists() else None


def draw_image_cover(canvas: Canvas, filename: Path, x: float, y: float, width: float, height: float) -> None:
	reader = ImageReader(str(filename))
	image_width, image_height = reader.getSize()
	scale = max(width / image_width, height / image_height)
	draw_width = image_width * scale
	draw_height = image_height * scale
	canvas.saveState()
	clip = canvas.beginPath()
	clip.rect(x, y, width, height)
	canvas.clipPath(clip, stroke=0, fill=0)
	canvas.drawImage(
		reader,
		x + (width - draw_width) / 2,
		y + (height - draw_height) / 2,
		draw_width,
		draw_height,
		mask="auto",
	)
	canvas.restoreState()


def draw_lettered_page(
	canvas: Canvas,
	filename: Path,
	*,
	jpeg_quality: int,
	max_width: int,
) -> None:
	"""Draw one complete raster page without clipping any deterministic lettering."""
	canvas.setFillColor(PAPER)
	canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
	reader = ImageReader(
		BytesIO(
			lettered_jpeg_bytes(
				filename,
				quality=jpeg_quality,
				max_width=max_width,
			)
		)
	)
	image_width, image_height = reader.getSize()
	if image_width <= 0 or image_height <= 0:
		raise ValueError(f"Lettered page has invalid dimensions: {filename}")
	scale = min(PAGE_WIDTH / image_width, PAGE_HEIGHT / image_height)
	draw_width = image_width * scale
	draw_height = image_height * scale
	canvas.drawImage(
		reader,
		(PAGE_WIDTH - draw_width) / 2,
		(PAGE_HEIGHT - draw_height) / 2,
		draw_width,
		draw_height,
		mask="auto",
	)
	canvas.showPage()


def draw_deterministic_overlays(
	canvas: Canvas,
	panel: dict[str, Any],
	x: float,
	y: float,
	width: float,
	height: float,
) -> None:
	for overlay in panel.get("overlays", []):
		ox = x + float(overlay.get("x", 0)) * width
		ow = float(overlay.get("width", 0)) * width
		oh = float(overlay.get("height", 0)) * height
		oy = y + (1 - float(overlay.get("y", 0)) - float(overlay.get("height", 0))) * height
		if ow <= 0 or oh <= 0:
			continue
		kind = str(overlay.get("kind", "sign"))
		text = str(overlay.get("text", ""))
		if overlay.get("language") in {"bn", "mixed"} and not overlay.get("publicationAllowed"):
			text = "[BENGALI LETTERING PENDING REVIEW]"
		fill = (
			HexColor("#E7F0F1")
			if "interface" in kind or "system" in kind
			else HexColor("#FFFDF7")
			if "report" in kind or "document" in kind
			else HexColor("#F7EDCC")
		)
		canvas.saveState()
		clip = canvas.beginPath()
		clip.rect(ox, oy, ow, oh)
		canvas.clipPath(clip, stroke=0, fill=0)
		canvas.setFillColor(fill)
		canvas.setStrokeColor(INK)
		canvas.setLineWidth(0.7)
		canvas.roundRect(ox, oy, ow, oh, 1.5, fill=1, stroke=1)
		font_size = max(4.0, min(10.0, oh * 0.34))
		lines = wrap_text(text, "Helvetica-Bold", font_size, max(1, ow - 6))
		while font_size > 4 and len(lines) * font_size * 1.12 > oh - 4:
			font_size -= 0.5
			lines = wrap_text(text, "Helvetica-Bold", font_size, max(1, ow - 6))
		leading = font_size * 1.12
		baseline = oy + (oh + len(lines) * leading) / 2 - font_size
		canvas.setFillColor(INK)
		canvas.setFont("Helvetica-Bold", font_size)
		for line in lines:
			canvas.drawCentredString(ox + ow / 2, baseline, line)
			baseline -= leading
		canvas.restoreState()


def dialogue_lines(panel: dict[str, Any], character_names: dict[str, str]) -> Iterable[str]:
	for dialogue in sorted(panel.get("dialogue", []), key=lambda item: item.get("readingOrder", 0)):
		speaker = character_names.get(dialogue.get("speaker", ""), dialogue.get("speaker", ""))
		yield f"{speaker}: {dialogue.get('text', '')}"


def draw_panel(
	canvas: Canvas,
	panel: dict[str, Any],
	box: tuple[float, float, float, float],
	page_number: int,
	character_names: dict[str, str],
	episode_dir: Path,
	root: Path,
) -> None:
	x, y, width, height = box
	canvas.setStrokeColor(INK)
	canvas.setLineWidth(1.6)
	canvas.setFillColor(PAPER)
	canvas.rect(x, y, width, height, fill=1, stroke=1)
	padding = 7
	status = str(panel.get("art", {}).get("status", "missing"))
	final_path = (
		resolve_art_path(panel.get("art", {}).get("final"), episode_dir, root)
		if status == "final"
		else None
	)

	if final_path:
		draw_image_cover(canvas, final_path, x + 1, y + 1, width - 2, height - 2)
		canvas.setFillColor(Color(0, 0, 0, alpha=0.72))
		canvas.rect(x + 1, y + height - 19, width - 2, 18, fill=1, stroke=0)
		canvas.setFillColor(white)
	else:
		palette = PLACEHOLDER_PALETTES[(page_number + panel.get("panel", 1)) % len(PLACEHOLDER_PALETTES)]
		canvas.setFillColor(HexColor(palette[0]))
		canvas.rect(x + 1, y + 1, width - 2, height - 2, fill=1, stroke=0)
		canvas.setFillColor(Color(1, 1, 1, alpha=0.07))
		canvas.saveState()
		canvas.translate(x + width * 0.55, y - height * 0.05)
		canvas.rotate(22)
		canvas.rect(0, 0, width * 0.6, height * 1.4, fill=1, stroke=0)
		canvas.restoreState()
		canvas.setFillColor(HexColor(palette[1]))

	canvas.setFont("Helvetica-Bold", 6.4)
	canvas.drawString(x + padding, y + height - 13, f"{panel.get('id')}  •  {status.upper()}")
	canvas.setFont("Helvetica", 5.8)
	camera = str(panel.get("camera", ""))
	canvas.drawRightString(
		x + width - padding,
		y + height - 13,
		elide_to_width(camera, "Helvetica", 5.8, width * 0.48),
	)

	content_top = y + height - 26
	canvas.setFillColor(white if not final_path else CAPTION)
	canvas.setFont("Helvetica-Bold", 5.8)
	visible_characters = [
		character_names.get(item.get("id", ""), item.get("id", ""))
		for item in panel.get("characters", [])
	]
	character_line = ", ".join(visible_characters) if visible_characters else "Environment"
	canvas.drawString(
		x + padding,
		content_top,
		elide_to_width(character_line, "Helvetica-Bold", 5.8, width - 2 * padding),
	)
	content_top -= 11

	action_size = 7 if height > 190 else 6.1
	action_leading = action_size + 1.5
	action_color = white if not final_path else INK
	if final_path:
		canvas.setFillColor(Color(1, 0.98, 0.91, alpha=0.91))
		canvas.roundRect(
			x + padding - 3,
			max(y + padding, content_top - 55),
			width - 2 * padding + 6,
			60,
			4,
			fill=1,
			stroke=0,
		)
	content_top = draw_wrapped(
		canvas,
		panel.get("action", ""),
		x + padding,
		content_top,
		width - 2 * padding,
		"Times-Bold",
		action_size,
		action_leading,
		action_color,
		max_lines=4 if height > 170 else 3,
	)
	content_top -= 4

	dialogue = list(dialogue_lines(panel, character_names))
	dialogue_size = 6.3 if height > 165 else 5.7
	for line in dialogue:
		if content_top < y + padding + 14:
			break
		lines = wrap_text(line, "Helvetica", dialogue_size, width - 2 * padding - 8)
		required_height = len(lines) * (dialogue_size + 1.2) + 7
		if content_top - required_height < y + padding:
			break
		canvas.setFillColor(Color(1, 1, 1, alpha=0.9))
		canvas.roundRect(
			x + padding,
			content_top - required_height + 3,
			width - 2 * padding,
			required_height,
			5,
			fill=1,
			stroke=0,
		)
		content_top = draw_wrapped(
			canvas,
			line,
			x + padding + 4,
			content_top - 4,
			width - 2 * padding - 8,
			"Helvetica",
			dialogue_size,
			dialogue_size + 1.2,
			INK,
		)
		content_top -= 4

	effects = panel.get("soundEffects", [])
	if effects:
		canvas.setFillColor(CAPTION)
		canvas.setFont("Helvetica-BoldOblique", 7)
		canvas.drawRightString(
			x + width - padding,
			y + padding,
			" · ".join(str(effect.get("text", "")) for effect in effects)[:36],
		)
	draw_deterministic_overlays(canvas, panel, x, y, width, height)


def draw_story_page(
	canvas: Canvas,
	page: dict[str, Any],
	metadata: dict[str, Any],
	character_names: dict[str, str],
	episode_dir: Path,
	root: Path,
) -> None:
	canvas.setFillColor(PAPER)
	canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
	canvas.setFillColor(INK)
	canvas.setFont("Helvetica-Bold", 6.8)
	canvas.drawString(MARGIN, PAGE_HEIGHT - 21, "THE LAST ANALOG TOWN  •  THE EFFICIENCY INSPECTOR")
	canvas.drawRightString(
		PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 21, f"STORY PAGE {page['page']} / {metadata['storyPageCount']}"
	)
	canvas.setStrokeColor(RULE)
	canvas.line(MARGIN, PAGE_HEIGHT - 27, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 27)

	canvas.setFont("Times-Bold", 13)
	canvas.drawString(MARGIN, PAGE_HEIGHT - 44, page.get("title", f"Page {page['page']}"))
	canvas.setFont("Helvetica", 6.5)
	canvas.setFillColor(MUTED)
	canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 43, str(page.get("time", "")))

	panel_area_y = 31
	panel_area_height = PAGE_HEIGHT - 85
	boxes = panel_grid(
		len(page.get("panels", [])),
		MARGIN,
		panel_area_y,
		PAGE_WIDTH - 2 * MARGIN,
		panel_area_height,
	)
	for panel, box in zip(page.get("panels", []), boxes, strict=True):
		draw_panel(
			canvas,
			panel,
			box,
			page["page"],
			character_names,
			episode_dir,
			root,
		)
	canvas.setFillColor(MUTED)
	canvas.setFont("Helvetica", 5.5)
	canvas.drawString(MARGIN, 17, f"Layout: {page.get('layout', '')}"[:120])
	canvas.showPage()


def draw_end_matter(
	canvas: Canvas,
	metadata: dict[str, Any],
	front_matter: dict[str, Any],
) -> None:
	end_matter = front_matter.get("productionEndMatter", {})
	heading = end_matter.get("heading") or "A complete story; an unfinished art gate"
	public_text = end_matter.get("publicEditionText") or (
		"This production edition contains the final structured story, dialogue, continuity, "
		"accessibility descriptions, and contextual art state for every panel."
	)
	rules_heading = end_matter.get("hybridRulesHeading") or "The binding operating conditions"
	rules = end_matter.get("hybridRules") or []
	second_album_promise = end_matter.get("secondAlbumPromise") or (
		"The story concludes here while Golmohar Junction remains open to further adventures."
	)
	canvas.setFillColor(PAPER)
	canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.rect(0, PAGE_HEIGHT - 16, PAGE_WIDTH, 16, fill=1, stroke=0)
	canvas.setFillColor(INK)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, PAGE_HEIGHT - 45, "PRODUCTION END MATTER")
	y = draw_wrapped(
		canvas,
		heading,
		MARGIN,
		PAGE_HEIGHT - 78,
		PAGE_WIDTH - 2 * MARGIN,
		"Times-Bold",
		25,
		28,
	)
	y -= 15
	y = draw_wrapped(
		canvas,
		public_text,
		MARGIN,
		y,
		PAGE_WIDTH - 2 * MARGIN,
		"Times-Roman",
		10,
		13,
	)
	y -= 14
	canvas.setStrokeColor(RULE)
	canvas.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
	y -= 21
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, y, str(rules_heading).upper())
	y -= 16
	for index, rule in enumerate(rules, start=1):
		y = draw_wrapped(
			canvas,
			f"{index}.  {rule}",
			MARGIN,
			y,
			PAGE_WIDTH - 2 * MARGIN,
			"Helvetica",
			7.5,
			9.5,
		)
		y -= 2.5
	y -= 6
	canvas.setFillColor(INK)
	y = draw_wrapped(
		canvas,
		second_album_promise,
		MARGIN,
		y,
		PAGE_WIDTH - 2 * MARGIN,
		"Times-Italic",
		9,
		12,
	)
	y -= 12
	canvas.setStrokeColor(RULE)
	canvas.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
	y -= 19
	canvas.setFillColor(MUNICIPAL_RED)
	canvas.setFont("Helvetica-Bold", 8)
	canvas.drawString(MARGIN, y, "PUBLICATION GATES")
	y -= 15
	gate = front_matter.get("publicationGate", {})
	gate_items = [
		(
			bool(gate.get("allPanelsFinal")),
			"Every story panel has approved final art at print resolution.",
		),
		(
			all(
				bool(gate.get(field))
				for field in ("coverApproved", "dialogueApproved", "letteringApproved")
			),
			"Cover, dialogue, and final lettering have production approval.",
		),
		(
			bool(gate.get("allRightsRecorded")),
			"Every imported or generated asset has completed rights review.",
		),
		(
			bool(gate.get("bengaliReviewed")) and bool(gate.get("culturalReviewApproved")),
			"Named Bengali-language and cultural reviews are approved.",
		),
		(
			bool(gate.get("accessibilityApproved"))
			and bool(gate.get("responsiveReaderApproved")),
			"Accessibility and responsive-reader reviews are approved.",
		),
		(
			bool(gate.get("printApproved")) and bool(gate.get("epubApproved")),
			"Print and EPUB editions have named human approval.",
		),
		(
			bool(gate.get("finalEditorApproved")),
			"A named human editor has approved publication.",
		),
	]
	for complete, item in gate_items:
		y = draw_wrapped(
			canvas,
			f"[{'X' if complete else ' '}]  {item}",
			MARGIN,
			y,
			PAGE_WIDTH - 2 * MARGIN,
			"Helvetica",
			7.2,
			9.2,
		)
		y -= 2
	canvas.setFillColor(INK)
	canvas.setFont("Times-Bold", 15)
	canvas.drawString(MARGIN, 63, "End of Album One")
	canvas.setFont("Helvetica", 7.5)
	canvas.drawString(MARGIN, 46, f"Category: Comic  •  {metadata['storyPageCount']} story pages")
	canvas.drawString(MARGIN, 33, f"Canonical route: {metadata['canonicalPath']}")
	canvas.showPage()


def draw_transcript(
	canvas: Canvas,
	metadata: dict[str, Any],
	pages: list[dict[str, Any]],
	character_names: dict[str, str],
) -> None:
	page_number = 0
	y = 0.0

	def new_page() -> None:
		nonlocal page_number, y
		if page_number:
			canvas.showPage()
		page_number += 1
		canvas.setFillColor(PAPER)
		canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
		canvas.setFillColor(INK)
		canvas.setFont("Helvetica-Bold", 7)
		canvas.drawString(MARGIN, PAGE_HEIGHT - 24, f"{metadata['title'].upper()}  •  ACCESSIBLE TRANSCRIPT")
		canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 24, f"APPENDIX {page_number}")
		y = PAGE_HEIGHT - 48

	new_page()
	for page in pages:
		if y < 110:
			new_page()
		canvas.setFillColor(MUNICIPAL_RED)
		canvas.setFont("Times-Bold", 14)
		canvas.drawString(MARGIN, y, f"Story page {page['page']}: {page.get('title', '')}")
		y -= 18
		for panel in page.get("panels", []):
			blocks = [
				(f"Panel {panel.get('panel')}", "Helvetica-Bold", 8),
				(panel.get("accessibility", {}).get("description", ""), "Times-Roman", 8.5),
			]
			blocks.extend(
				(
					f"Visible text ({overlay.get('kind', 'sign')}): {overlay.get('text', '')}",
					"Helvetica",
					8,
				)
				for overlay in panel.get("overlays", [])
			)
			if panel.get("caption"):
				blocks.append((f"Caption: {panel['caption']}", "Helvetica", 8))
			blocks.extend((line, "Helvetica", 8) for line in dialogue_lines(panel, character_names))
			for effect in panel.get("soundEffects", []):
				blocks.append(
					(
						f"Sound: {effect.get('text', '')}. {effect.get('description', '')}",
						"Helvetica",
						8,
					)
				)
			if panel.get("visualJoke"):
				blocks.append((f"Visual detail: {panel['visualJoke']}", "Helvetica-Oblique", 8))
			for text, font, size in blocks:
				lines = wrap_text(text, font, size, PAGE_WIDTH - 2 * MARGIN)
				required = len(lines) * (size + 2)
				if y - required < 36:
					new_page()
				y = draw_wrapped(
					canvas,
					text,
					MARGIN,
					y,
					PAGE_WIDTH - 2 * MARGIN,
					font,
					size,
					size + 2,
				)
				y -= 3
			y -= 6
	canvas.showPage()


def export_pdf(args: argparse.Namespace) -> Path:
	episode_dir, compiled_path, output_path = episode_paths(args)
	if not compiled_path.exists():
		raise FileNotFoundError(
			f"Compiled episode not found: {compiled_path}. Run comic:compile first."
		)
	root = Path(args.root).resolve()
	episode = runtime_episode(load_json(compiled_path))
	metadata = episode["metadata"]
	pages = episode["pages"]
	if len(pages) != int(metadata["storyPageCount"]):
		raise ValueError(
			f"Compiled page count {len(pages)} does not match metadata {metadata['storyPageCount']}."
		)
	lettered_assets: LetteredExportAssets | None = None
	if args.lettered_pages:
		manifest_path = (
			resolve_from_root(root, args.preview_manifest)
			if args.preview_manifest
			else episode_dir / "pages" / "previews" / "manifest.json"
		)
		cover_path = (
			resolve_from_root(root, args.cover)
			if args.cover
			else episode_dir / "panels" / "approved" / "cover__lettered__r1.png"
		)
		lettered_assets = validate_lettered_assets(
			episode_dir=episode_dir,
			compiled=episode,
			manifest_path=manifest_path,
			cover_path=cover_path,
		)
	series_data_path = episode_dir.parents[1] / "data" / "series.json"
	characters_path = episode_dir.parents[1] / "data" / "characters.json"
	series_data = load_json(series_data_path) if series_data_path.exists() else None
	characters_source = load_json(characters_path) if characters_path.exists() else {}
	characters = (
		characters_source
		if isinstance(characters_source, list)
		else characters_source.get("characters", characters_source.get("items", []))
	)
	character_names = {
		character.get("id", ""): character.get("name", character.get("id", ""))
		for character in characters
	}
	panel_count = sum(len(page.get("panels", [])) for page in pages)

	output_path.parent.mkdir(parents=True, exist_ok=True)
	temporary_path = output_path.with_suffix(f"{output_path.suffix}.{os.getpid()}.tmp")
	canvas = Canvas(
		str(temporary_path),
		pagesize=A4,
		pageCompression=1,
		invariant=1,
	)
	canvas.setTitle(metadata["title"])
	canvas.setAuthor("Suvro Ghosh")
	canvas.setSubject(
		"The Last Analog Town - hash-verified lettered-page production edition"
		if lettered_assets
		else "The Last Analog Town - unpublished comic production edition"
	)
	canvas.setKeywords(", ".join(metadata.get("tags", [])))

	if lettered_assets:
		draw_lettered_page(
			canvas,
			lettered_assets.cover_path,
			jpeg_quality=args.lettered_image_quality,
			max_width=args.lettered_image_max_width,
		)
	else:
		draw_cover(canvas, metadata, panel_count)
	draw_title_material(canvas, metadata, series_data, characters)
	if lettered_assets:
		for page_asset in lettered_assets.pages:
			draw_lettered_page(
				canvas,
				page_asset.image_path,
				jpeg_quality=args.lettered_image_quality,
				max_width=args.lettered_image_max_width,
			)
	else:
		for page in pages:
			draw_story_page(
				canvas,
				page,
				metadata,
				character_names,
				episode_dir,
				root,
			)
	draw_end_matter(canvas, metadata, episode.get("frontMatter") or {})
	if args.include_transcript:
		draw_transcript(canvas, metadata, pages, character_names)
	canvas.save()
	os.replace(temporary_path, output_path)
	return output_path


def main() -> None:
	args = parse_args()
	output = export_pdf(args)
	print(output)


if __name__ == "__main__":
	main()
