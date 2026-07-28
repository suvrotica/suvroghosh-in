#!/usr/bin/env python3
"""Export a deterministic EPUB 3 production edition from compiled comic data."""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
from pathlib import Path
import re
import uuid
import zipfile
from typing import Any

from lettered_export import (
	LetteredExportAssets,
	lettered_jpeg_bytes,
	validate_lettered_assets,
)


ROOT = Path(__file__).resolve().parents[2]
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
BENGALI_TEXT = re.compile(
	r"[\u0980-\u09ff][\u0980-\u09ff\u200c\u200d]*(?:[ \u00a0]+[\u0980-\u09ff][\u0980-\u09ff\u200c\u200d]*)*"
)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Export an accessible EPUB 3 production edition of a compiled comic album."
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
	return parser.parse_args()


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
		else root / "output" / "epub" / f"{episode_dir.name}-production-edition.epub"
	)
	return episode_dir, compiled, output


def read_json(filename: Path) -> Any:
	with filename.open("r", encoding="utf-8") as handle:
		return json.load(handle)


def runtime_episode(value: Any) -> dict[str, Any]:
	if (
		isinstance(value, dict)
		and not isinstance(value.get("metadata"), dict)
		and isinstance(value.get("data"), dict)
	):
		value = value["data"]
	if not isinstance(value, dict) or not isinstance(value.get("metadata"), dict):
		raise ValueError("Compiled comic JSON must contain metadata and pages.")
	if not isinstance(value.get("pages"), list):
		raise ValueError("Compiled comic JSON must contain a pages array.")
	return value


def escaped(value: Any) -> str:
	return html.escape(str(value), quote=True)


def escaped_inline(value: Any) -> str:
	"""Escape text and identify Bengali runs for assistive-technology pronunciation."""
	value_escaped = escaped(value)
	return BENGALI_TEXT.sub(
		lambda match: (
			f'<span lang="bn" xml:lang="bn">{match.group(0)}</span>'
		),
		value_escaped,
	)


def xhtml_document(title: str, body: str, body_class: str = "") -> str:
	viewport = (
		"width=1200,height=1667"
		if "fixed-page" in body_class.split()
		else "width=device-width,initial-scale=1"
	)
	return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="{viewport}" />
	<title>{escaped(title)}</title>
	<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body class="{escaped(body_class)}">
{body}
</body>
</html>
"""


def resolve_art_path(value: str | None, episode_dir: Path, root: Path) -> Path | None:
	if not value:
		return None
	candidate = (
		root / "static" / value.lstrip("/")
		if value.startswith("/")
		else episode_dir / value
	)
	return candidate.resolve() if candidate.exists() and candidate.is_file() else None


def panel_markup(
	panel: dict[str, Any],
	character_names: dict[str, str],
	image_href: str | None,
) -> str:
	dialogue = "".join(
		f'<p class="dialogue"><strong>{escaped_inline(character_names.get(item.get("speaker", ""), item.get("speaker", "")))}:</strong> {escaped_inline(item.get("text", ""))}</p>'
		for item in sorted(panel.get("dialogue", []), key=lambda item: item.get("readingOrder", 0))
	)
	overlays = "".join(
		f'<p class="visible-text accessible-only"><strong>Visible text ({escaped(item.get("kind", "sign"))}):</strong> {escaped_inline(item.get("text", ""))}</p>'
		for item in panel.get("overlays", [])
	)
	visual_overlays = "".join(
		(
			f'<div class="visual-overlay overlay-{escaped(item.get("kind", "sign"))}" '
			f'style="left:{float(item.get("x", 0)) * 100:.4f}%;'
			f'top:{float(item.get("y", 0)) * 100:.4f}%;'
			f'width:{float(item.get("width", 0)) * 100:.4f}%;'
			f'height:{float(item.get("height", 0)) * 100:.4f}%;" '
			f'aria-hidden="true"><span>{escaped_inline(item.get("text", ""))}</span></div>'
		)
		for item in panel.get("overlays", [])
	)
	sounds = "".join(
		f'<p class="sound"><strong>Sound:</strong> {escaped_inline(effect.get("text", ""))}. {escaped_inline(effect.get("description", ""))}</p>'
		for effect in panel.get("soundEffects", [])
	)
	caption = (
		f'<p class="caption"><strong>Caption:</strong> {escaped_inline(panel["caption"])}</p>'
		if panel.get("caption")
		else ""
	)
	joke = (
		f'<p class="visual-detail"><strong>Visual detail:</strong> {escaped_inline(panel["visualJoke"])}</p>'
		if panel.get("visualJoke")
		else ""
	)
	visual = (
		f'<img src="{escaped(image_href)}" alt="{escaped(panel.get("accessibility", {}).get("alt", ""))}" />'
		if image_href
		else (
			f'<div class="placeholder" role="img" aria-label="{escaped(panel.get("accessibility", {}).get("alt", ""))}">'
			f'<span>{escaped(panel.get("id", ""))} · {escaped(panel.get("art", {}).get("status", "missing"))}</span>'
			f'<strong>{escaped(panel.get("camera", ""))}</strong>'
			f'<p>{escaped_inline(panel.get("action", ""))}</p>'
			"</div>"
		)
	)
	return f"""<section class="panel panel-{escaped(panel.get("size", "medium"))}" aria-labelledby="heading-{escaped(panel.get("id", ""))}">
	<h2 id="heading-{escaped(panel.get("id", ""))}">Panel {escaped(panel.get("panel", ""))}</h2>
	<div class="visual">{visual}{visual_overlays}</div>
	<div class="panel-text">
		<p class="description">{escaped_inline(panel.get("accessibility", {}).get("description", ""))}</p>
		{overlays}{caption}{dialogue}{sounds}{joke}
	</div>
</section>"""


def story_page_document(
	page: dict[str, Any],
	character_names: dict[str, str],
	image_hrefs: dict[str, str],
) -> str:
	panels = "\n".join(
		panel_markup(panel, character_names, image_hrefs.get(panel.get("id", "")))
		for panel in page.get("panels", [])
	)
	body = f"""<main class="story-page" aria-labelledby="page-heading">
	<header>
		<p>The Last Analog Town · The Efficiency Inspector</p>
		<h1 id="page-heading">Story page {escaped(page.get("page", ""))}: {escaped(page.get("title", ""))}</h1>
	</header>
	<div class="panel-grid panel-count-{len(page.get("panels", []))}">{panels}</div>
</main>"""
	return xhtml_document(f"Story page {page.get('page')}", body, "fixed-page")


def lettered_story_page_document(page: dict[str, Any], image_href: str) -> str:
	page_number = page.get("page", "")
	page_title = page.get("title", "")
	body = f"""<main class="lettered-image-page" aria-labelledby="page-heading">
	<img src="{escaped(image_href)}" alt="" aria-hidden="true" />
	<div class="accessible-only">
		<h1 id="page-heading">Story page {escaped(page_number)}: {escaped(page_title)}</h1>
		<p>The visual page contains deterministically composed comic panels and lettering.</p>
		<a href="transcript.xhtml#transcript-page-{escaped(page_number)}">Read the accessible transcript for this story page.</a>
	</div>
</main>"""
	return xhtml_document(f"Story page {page_number}", body, "fixed-page")


def transcript_document(
	metadata: dict[str, Any],
	pages: list[dict[str, Any]],
	character_names: dict[str, str],
) -> str:
	page_sections: list[str] = []
	for page in pages:
		panel_sections: list[str] = []
		for panel in page.get("panels", []):
			overlays = "".join(
				f'<p><strong>Visible text ({escaped(item.get("kind", "sign"))}):</strong> {escaped_inline(item.get("text", ""))}</p>'
				for item in panel.get("overlays", [])
			)
			dialogue = "".join(
				f"<p><strong>{escaped_inline(character_names.get(item.get('speaker', ''), item.get('speaker', '')))}:</strong> {escaped_inline(item.get('text', ''))}</p>"
				for item in sorted(
					panel.get("dialogue", []), key=lambda item: item.get("readingOrder", 0)
				)
			)
			sounds = "".join(
				f"<p><strong>Sound:</strong> {escaped_inline(effect.get('text', ''))}. {escaped_inline(effect.get('description', ''))}</p>"
				for effect in panel.get("soundEffects", [])
			)
			panel_sections.append(
				f"""<section aria-labelledby="transcript-{escaped(panel.get("id", ""))}">
	<h3 id="transcript-{escaped(panel.get("id", ""))}">Panel {escaped(panel.get("panel", ""))}</h3>
	<p>{escaped_inline(panel.get("accessibility", {}).get("description", ""))}</p>
	{overlays}
	{f'<p><strong>Caption:</strong> {escaped_inline(panel["caption"])}</p>' if panel.get("caption") else ""}
	{dialogue}{sounds}
	{f'<p><strong>Visual detail:</strong> {escaped_inline(panel["visualJoke"])}</p>' if panel.get("visualJoke") else ""}
</section>"""
			)
		page_sections.append(
			f"""<section aria-labelledby="transcript-page-{page["page"]}">
	<h2 id="transcript-page-{page["page"]}">Story page {page["page"]}: {escaped(page.get("title", ""))}</h2>
	{"".join(panel_sections)}
</section>"""
		)
	body = f"""<main class="transcript">
	<h1>{escaped(metadata["title"])}: complete accessible transcript</h1>
	<p>This text edition follows the exact story-page and panel reading order.</p>
	{"".join(page_sections)}
</main>"""
	return xhtml_document(f"{metadata['title']}: transcript", body, "reflowable")


def end_matter_document(front_matter: dict[str, Any]) -> str:
	end_matter = front_matter.get("productionEndMatter", {})
	heading = end_matter.get("heading") or "Production end matter"
	public_text = end_matter.get("publicEditionText") or (
		"This complete story remains an unpublished production edition until every publication gate passes."
	)
	rules_heading = end_matter.get("hybridRulesHeading") or "The binding operating conditions"
	rules = end_matter.get("hybridRules")
	rule_items = "".join(
		f"<li>{escaped(rule)}</li>" for rule in rules if isinstance(rule, str) and rule.strip()
	) if isinstance(rules, list) else ""
	second_album_promise = end_matter.get("secondAlbumPromise") or (
		"The story concludes here while Golmohar Junction remains open to further adventures."
	)
	gate = front_matter.get("publicationGate", {})
	gate_rows = [
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
	gate_items = "".join(
		f'<li class="gate-{"complete" if complete else "pending"}">'
		f'<strong>{"Complete" if complete else "Pending"}:</strong> {escaped(label)}</li>'
		for complete, label in gate_rows
	)
	body = f"""<main class="end-matter">
	<p class="kicker">After the story</p>
	<h1>{escaped(heading)}</h1>
	<p>{escaped(public_text)}</p>
	<h2>{escaped(rules_heading)}</h2>
	<ol>{rule_items}</ol>
	<p class="second-album-promise">{escaped(second_album_promise)}</p>
	<h2>Publication gates</h2>
	<ul class="publication-gates">
		{gate_items}
	</ul>
</main>"""
	return xhtml_document(str(heading), body, "reflowable")


def stylesheet() -> str:
	return """@page { margin: 0; }
html, body { margin: 0; padding: 0; color: #241f19; background: #fff9e9; }
body { font-family: Georgia, "Times New Roman", serif; }
.cover, .title-page { box-sizing: border-box; width: 1200px; height: 1667px; padding: 100px; overflow: hidden; }
.cover { display: flex; flex-direction: column; justify-content: flex-end; background: #315f72; color: #fff9e9; border-bottom: 240px solid #8e342d; }
.cover .kicker, .production-label { font: 700 22px/1.2 Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
.cover h1 { margin: 25px 0; font-size: 105px; line-height: .9; }
.cover h2 { margin: 0; font-size: 36px; }
.production-label { margin-top: 45px; padding: 22px; background: rgba(0,0,0,.5); }
.title-page h1 { font-size: 70px; line-height: 1; }
.title-page h2 { margin-top: 55px; border-bottom: 3px solid #241f19; font: 700 23px/1.3 Arial, sans-serif; text-transform: uppercase; }
.title-page p, .title-page li { font-size: 25px; line-height: 1.45; }
.fixed-page { width: 1200px; height: 1667px; overflow: hidden; }
.story-page { box-sizing: border-box; width: 1200px; height: 1667px; padding: 38px; }
.story-page > header { height: 75px; border-bottom: 3px solid #241f19; }
.story-page > header p { margin: 0; font: 700 13px/1.2 Arial, sans-serif; text-transform: uppercase; letter-spacing: .1em; }
.story-page > header h1 { margin: 7px 0 0; font-size: 27px; }
.panel-grid { display: grid; height: 1490px; margin-top: 20px; gap: 14px; }
.panel-count-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.panel-count-5 { grid-template-columns: 1fr 1fr; grid-template-rows: 1.15fr 1fr 1fr; }
.panel-count-5 .panel:first-child { grid-column: 1 / -1; }
.panel-count-6 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
.panel { position: relative; overflow: hidden; border: 3px solid #241f19; background: #315f72; color: white; }
.panel > h2 { position: absolute; z-index: 4; top: 8px; left: 10px; margin: 0; font: 700 13px/1 Arial, sans-serif; text-transform: uppercase; }
.visual { position: absolute; inset: 0; }
.visual img { width: 100%; height: 100%; object-fit: cover; }
.visual-overlay { position: absolute; z-index: 2; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid #241f19; border-radius: 3px; background: rgba(255,249,233,.96); padding: 3px; color: #241f19; font: 700 17px/1.08 Arial, sans-serif; text-align: center; white-space: pre-line; }
.visual-overlay.overlay-interface, .visual-overlay.overlay-system { border-color: #315f72; background: rgba(231,240,241,.97); font-family: monospace; }
.visual-overlay.overlay-report, .visual-overlay.overlay-document, .visual-overlay.overlay-document-conclusion, .visual-overlay.overlay-framed-document { background: rgba(255,253,247,.97); font-family: Georgia, serif; }
.visual-overlay.overlay-rule, .visual-overlay.overlay-rule-strip { background: rgba(247,237,204,.97); }
.placeholder { box-sizing: border-box; display: flex; height: 100%; flex-direction: column; justify-content: flex-end; padding: 25px; background: linear-gradient(145deg, rgba(255,255,255,.09), transparent 45%), #315f72; }
.placeholder span { font: 700 13px/1.2 Arial, sans-serif; text-transform: uppercase; }
.placeholder strong { margin-top: 8px; font-size: 18px; }
.placeholder p { margin: 10px 0 0; font-size: 20px; line-height: 1.25; }
.panel-text { position: absolute; z-index: 3; right: 14px; bottom: 14px; left: 14px; max-height: 45%; overflow: hidden; border-radius: 9px; background: rgba(255,253,245,.94); padding: 12px; color: #241f19; }
.panel-text p { margin: 3px 0; font: 16px/1.25 Arial, sans-serif; }
.panel-text .description { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.accessible-only { position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip: rect(0 0 0 0) !important; white-space: nowrap !important; }
.lettered-image-page { box-sizing: border-box; display: flex; width: 1200px; height: 1667px; align-items: center; justify-content: center; overflow: hidden; background: #fff9e9; }
.lettered-image-page > img { display: block; width: 100%; height: 100%; object-fit: contain; }
.lettered-cover-page { background: #241f19; }
.caption { background: #f1d996; padding: 4px; }
.sound { font-weight: 700; }
.reflowable { background: white; }
.transcript { max-width: 42em; margin: 0 auto; padding: 2em 1.25em; }
.transcript h1 { font-size: 2em; }
.transcript h2 { margin-top: 2.4em; border-bottom: 1px solid #b8aa90; padding-bottom: .3em; }
.transcript h3 { margin: 1.3em 0 .4em; font: 700 .85em/1.2 Arial, sans-serif; text-transform: uppercase; }
.transcript p { line-height: 1.55; }
.end-matter { max-width: 42em; margin: 0 auto; padding: 2em 1.25em; }
.end-matter h1 { font-size: 2.2em; line-height: 1.05; }
.end-matter h2 { margin-top: 2em; border-bottom: 1px solid #b8aa90; padding-bottom: .3em; }
.end-matter li, .end-matter p { line-height: 1.55; }
.end-matter li { margin-bottom: .55em; }
.second-album-promise { margin: 2em 0; border-left: .25em solid #8e342d; padding-left: 1em; font-style: italic; }
"""


def zip_info(name: str, compression: int) -> zipfile.ZipInfo:
	info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
	info.compress_type = compression
	info.external_attr = 0o644 << 16
	return info


def write_text(archive: zipfile.ZipFile, name: str, text: str, stored: bool = False) -> None:
	archive.writestr(
		zip_info(name, zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED),
		text.encode("utf-8"),
	)


def export_epub(args: argparse.Namespace) -> Path:
	episode_dir, compiled_path, output_path = episode_paths(args)
	if not compiled_path.exists():
		raise FileNotFoundError(
			f"Compiled episode not found: {compiled_path}. Run comic:compile first."
		)
	root = Path(args.root).resolve()
	episode = runtime_episode(read_json(compiled_path))
	metadata = episode["metadata"]
	pages = episode["pages"]
	front_matter = episode.get("frontMatter") or {}
	series_title = (
		episode.get("data", {}).get("series", {}).get("title")
		or "The Last Analog Town"
	)
	album_position = str(int(metadata.get("id", "1")))
	production_title = f'{metadata["title"]} — Unpublished Production Edition'
	production_description = (
		"Unpublished production edition: final approved artwork and named human review remain "
		f'pending. {metadata["description"]}'
	)
	if len(pages) != int(metadata["storyPageCount"]):
		raise ValueError("Compiled page count does not match episode metadata.")
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
		production_title = f'{metadata["title"]} - Lettered Production Edition'
		production_description = (
			"Hash-verified, deterministically lettered page edition. Publication remains "
			f'gated by final editorial review. {metadata["description"]}'
		)

	character_file = episode_dir.parents[1] / "data" / "characters.json"
	character_source = read_json(character_file) if character_file.exists() else {}
	characters = (
		character_source
		if isinstance(character_source, list)
		else character_source.get("characters", character_source.get("items", []))
	)
	character_names = {
		item.get("id", ""): item.get("name", item.get("id", "")) for item in characters
	}

	image_files: dict[str, tuple[Path, str]] = {}
	lettered_page_images: dict[int, tuple[Path, str]] = {}
	lettered_cover_image: tuple[Path, str] | None = None
	if lettered_assets:
		cover_media_type = mimetypes.guess_type(lettered_assets.cover_path.name)[0]
		if not cover_media_type or not cover_media_type.startswith("image/"):
			raise ValueError(
				f"EPUB cannot identify the lettered cover media type: {lettered_assets.cover_path}"
			)
		lettered_cover_image = (
			lettered_assets.cover_path,
			"images/cover.jpg",
		)
		for asset in lettered_assets.pages:
			media_type = mimetypes.guess_type(asset.image_path.name)[0]
			if not media_type or not media_type.startswith("image/"):
				raise ValueError(
					f"EPUB cannot identify the media type for lettered page {asset.page}: "
					f"{asset.image_path}"
				)
			lettered_page_images[asset.page] = (
				asset.image_path,
				f"images/page-{asset.page:03d}.jpg",
			)
	else:
		for page in pages:
			for panel in page.get("panels", []):
				art = panel.get("art", {})
				if art.get("status") != "final":
					continue
				source = resolve_art_path(art.get("final"), episode_dir, root)
				if not source:
					continue
				extension = source.suffix.lower() or ".bin"
				href = f"images/{panel['id']}{extension}"
				image_files[panel["id"]] = (source, href)

	identifier = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, metadata['canonicalPath'])}"
	page_items = "\n".join(
		f'<item id="page-{page["page"]:03d}" href="page-{page["page"]:03d}.xhtml" media-type="application/xhtml+xml" />'
		for page in pages
	)
	page_spine = "\n".join(
		f'<itemref idref="page-{page["page"]:03d}" />' for page in pages
	)
	if lettered_assets and lettered_cover_image:
		cover_source, cover_href = lettered_cover_image
		lettered_image_items = [
			f'<item id="cover-image" href="{escaped(cover_href)}" '
			'media-type="image/jpeg" '
			'properties="cover-image" />'
		]
		lettered_image_items.extend(
			f'<item id="page-image-{page_number:03d}" href="{escaped(href)}" '
			'media-type="image/jpeg" />'
			for page_number, (source, href) in sorted(lettered_page_images.items())
		)
		image_items = "\n".join(lettered_image_items)
	else:
		image_items = "\n".join(
			f'<item id="image-{escaped(panel_id)}" href="{escaped(href)}" media-type="{escaped(mimetypes.guess_type(source.name)[0] or "application/octet-stream")}" />'
			for panel_id, (source, href) in sorted(image_files.items())
		)
	package = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
	<dc:identifier id="book-id">{identifier}</dc:identifier>
	<dc:title id="book-title">{escaped(production_title)}</dc:title>
	<meta refines="#book-title" property="title-type">main</meta>
	<dc:creator>Suvro Ghosh</dc:creator>
	<dc:language>{escaped(metadata.get("language", "en"))}</dc:language>
	<dc:date>{escaped(metadata["date"])}</dc:date>
	<dc:subject>Comic</dc:subject>
	<dc:description>{escaped(production_description)}</dc:description>
	<meta property="belongs-to-collection" id="series">{escaped(series_title)}</meta>
	<meta refines="#series" property="collection-type">series</meta>
	<meta refines="#series" property="group-position">{escaped(album_position)}</meta>
	<meta property="dcterms:modified">{escaped(metadata["dateModified"])}T00:00:00Z</meta>
	<meta property="rendition:layout">pre-paginated</meta>
	<meta property="rendition:orientation">portrait</meta>
	<meta property="rendition:spread">auto</meta>
</metadata>
<manifest>
	<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
	<item id="styles" href="styles.css" media-type="text/css" />
	<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" />
	<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />
{page_items}
	<item id="end-matter" href="end-matter.xhtml" media-type="application/xhtml+xml" />
	<item id="transcript" href="transcript.xhtml" media-type="application/xhtml+xml" />
{image_items}
</manifest>
<spine page-progression-direction="ltr">
	<itemref idref="cover" />
	<itemref idref="title" />
{page_spine}
	<itemref idref="end-matter" properties="rendition:layout-reflowable" />
	<itemref idref="transcript" properties="rendition:layout-reflowable" />
</spine>
</package>
"""
	nav_links = "\n".join(
		f'<li><a href="page-{page["page"]:03d}.xhtml">Story page {page["page"]}: {escaped(page.get("title", ""))}</a></li>'
		for page in pages
	)
	nav = xhtml_document(
		"Contents",
		f"""<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc">
	<h1>Contents</h1>
	<ol>
		<li><a href="cover.xhtml">Cover</a></li>
		<li><a href="title.xhtml">Title and credits</a></li>
		{nav_links}
		<li><a href="end-matter.xhtml">Production end matter</a></li>
		<li><a href="transcript.xhtml">Complete accessible transcript</a></li>
	</ol>
</nav>""",
		"reflowable transcript",
	)
	if lettered_assets and lettered_cover_image:
		cover = xhtml_document(
			metadata["title"],
			f"""<main class="lettered-image-page lettered-cover-page" epub:type="cover">
	<img src="{escaped(lettered_cover_image[1])}" alt="{escaped(metadata.get("coverAlt", ""))}" />
</main>""",
			"fixed-page",
		)
	else:
		cover = xhtml_document(
			metadata["title"],
			f"""<main class="cover">
	<p class="kicker">The Last Analog Town · Album 001</p>
	<h1>{escaped(metadata["title"])}</h1>
	<h2>{escaped(metadata.get("subtitle", ""))}</h2>
	<p class="production-label">Unpublished production edition · {metadata["storyPageCount"]} complete story pages</p>
</main>""",
			"fixed-page",
		)
	credits = "".join(
		f"<li><strong>{escaped(item.get('role', ''))}:</strong> {escaped(item.get('name', ''))}</li>"
		for item in metadata.get("credits", [])
	)
	guidance = "".join(f"<li>{escaped(item)}</li>" for item in metadata.get("contentGuidance", []))
	production_status = (
		"This complete edition uses the current hash-verified, deterministically lettered "
		"cover and story-page renders. Publication remains gated by rights, language, cultural, "
		"accessibility, print, and named human review."
		if lettered_assets
		else (
			"This complete scripted edition uses contextual panels where final approved art is "
			"pending. Publication remains gated by art, rights, language, cultural, "
			"accessibility, print, and named human review."
		)
	)
	title_page = xhtml_document(
		"Title and credits",
		f"""<main class="title-page">
	<p class="kicker">Comic · The Last Analog Town</p>
	<h1>{escaped(metadata["title"])}</h1>
	<p>{escaped(metadata["description"])}</p>
	<h2>Credits</h2><ul>{credits}</ul>
	<h2>Content guidance</h2><ul>{guidance}</ul>
	<h2>Production status</h2>
	<p>{escaped(production_status)}</p>
</main>""",
		"fixed-page",
	)
	container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" />
	</rootfiles>
</container>
"""

	output_path.parent.mkdir(parents=True, exist_ok=True)
	temporary_path = output_path.with_suffix(f"{output_path.suffix}.{os.getpid()}.tmp")
	with zipfile.ZipFile(temporary_path, "w") as archive:
		write_text(archive, "mimetype", "application/epub+zip", stored=True)
		write_text(archive, "META-INF/container.xml", container)
		write_text(archive, "EPUB/package.opf", package)
		write_text(archive, "EPUB/styles.css", stylesheet())
		write_text(archive, "EPUB/nav.xhtml", nav)
		write_text(archive, "EPUB/cover.xhtml", cover)
		write_text(archive, "EPUB/title.xhtml", title_page)
		for page in pages:
			if lettered_assets:
				page_image = lettered_page_images[page["page"]]
				page_document = lettered_story_page_document(page, page_image[1])
			else:
				hrefs = {
					panel["id"]: image_files[panel["id"]][1]
					for panel in page.get("panels", [])
					if panel.get("id") in image_files
				}
				page_document = story_page_document(page, character_names, hrefs)
			write_text(
				archive,
				f"EPUB/page-{page['page']:03d}.xhtml",
				page_document,
			)
		write_text(
			archive,
			"EPUB/end-matter.xhtml",
			end_matter_document(front_matter),
		)
		write_text(
			archive,
			"EPUB/transcript.xhtml",
			transcript_document(metadata, pages, character_names),
		)
		if lettered_assets and lettered_cover_image:
			lettered_images = [lettered_cover_image, *lettered_page_images.values()]
			for source, href in lettered_images:
				archive.writestr(
					zip_info(f"EPUB/{href}", zipfile.ZIP_STORED),
					lettered_jpeg_bytes(
						source,
						quality=args.lettered_image_quality,
						max_width=args.lettered_image_max_width,
					),
				)
		else:
			for _panel_id, (source, href) in sorted(image_files.items()):
				archive.writestr(
					zip_info(f"EPUB/{href}", zipfile.ZIP_DEFLATED),
					source.read_bytes(),
				)
	os.replace(temporary_path, output_path)
	return output_path


def main() -> None:
	output = export_epub(parse_args())
	print(output)


if __name__ == "__main__":
	main()
