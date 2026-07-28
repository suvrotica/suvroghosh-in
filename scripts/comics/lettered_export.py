#!/usr/bin/env python3
"""Fail-closed validation for final, deterministically lettered comic exports."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
from typing import Any

from PIL import Image, ImageOps


SHA256 = re.compile(r"^[0-9a-f]{64}$")
PREVIEW_FORMAT = "suvroghosh-comic-page-previews"
PREVIEW_FORMAT_VERSION = 1


@dataclass(frozen=True)
class LetteredPageAsset:
	page: int
	image_path: Path
	image_sha256: str
	image_bytes: int
	source_path: Path
	source_sha256: str


@dataclass(frozen=True)
class LetteredExportAssets:
	cover_path: Path
	manifest_path: Path
	source_digest: str
	lettering_digest: str
	pages: tuple[LetteredPageAsset, ...]


def lettered_jpeg_bytes(
	filename: Path,
	*,
	quality: int = 90,
	max_width: int = 1600,
) -> bytes:
	"""Encode a deterministic, full-colour JPEG payload for book containers.

	The validated PNG remains canonical. PDF and EPUB containers receive a compact derivative so
	a complete album does not balloon into hundreds of megabytes. Subsampling is disabled to keep
	small deterministic lettering crisp.
	"""
	if quality < 70 or quality > 95:
		raise ValueError("Lettered JPEG quality must be between 70 and 95.")
	if max_width < 800 or max_width > 4000:
		raise ValueError("Lettered JPEG max width must be between 800 and 4000 pixels.")
	with Image.open(filename) as opened:
		image = ImageOps.exif_transpose(opened)
		if image.width > max_width:
			target_height = max(1, round(image.height * (max_width / image.width)))
			image = image.resize(
				(max_width, target_height),
				Image.Resampling.LANCZOS,
			)
		if image.mode in {"RGBA", "LA"} or (
			image.mode == "P" and "transparency" in image.info
		):
			alpha_image = image.convert("RGBA")
			background = Image.new("RGBA", alpha_image.size, (255, 249, 233, 255))
			background.alpha_composite(alpha_image)
			image = background.convert("RGB")
		else:
			image = image.convert("RGB")
		payload = BytesIO()
		image.save(
			payload,
			format="JPEG",
			quality=quality,
			subsampling=0,
			optimize=True,
			progressive=False,
		)
		return payload.getvalue()


def _load_json(filename: Path) -> Any:
	try:
		with filename.open("r", encoding="utf-8") as handle:
			return json.load(handle)
	except json.JSONDecodeError as error:
		raise ValueError(f"Invalid JSON in lettered-page manifest {filename}: {error}") from error


def _sha256_and_size(filename: Path) -> tuple[str, int]:
	digest = hashlib.sha256()
	size = 0
	with filename.open("rb") as handle:
		while chunk := handle.read(1024 * 1024):
			digest.update(chunk)
			size += len(chunk)
	return digest.hexdigest(), size


def _require_sha256(value: Any, label: str) -> str:
	if not isinstance(value, str) or not SHA256.fullmatch(value):
		raise ValueError(f"{label} must be a lowercase SHA-256 digest.")
	return value


def _episode_asset(episode_dir: Path, value: Any, label: str) -> Path:
	if not isinstance(value, str) or not value.strip():
		raise ValueError(f"{label} must be a non-empty episode-relative path.")
	relative = Path(value)
	if relative.is_absolute() or relative.drive:
		raise ValueError(f"{label} must stay inside the episode directory: {value}")
	resolved = (episode_dir / relative).resolve()
	try:
		resolved.relative_to(episode_dir)
	except ValueError as error:
		raise ValueError(f"{label} escapes the episode directory: {value}") from error
	if not resolved.is_file():
		raise FileNotFoundError(f"{label} not found: {resolved}")
	return resolved


def _require_raster(filename: Path, label: str) -> None:
	with filename.open("rb") as handle:
		header = handle.read(16)
	if header.startswith(b"\x89PNG\r\n\x1a\n"):
		return
	if header.startswith(b"\xff\xd8\xff"):
		return
	if header.startswith((b"GIF87a", b"GIF89a")):
		return
	if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
		return
	raise ValueError(f"{label} is not a supported raster image: {filename}")


def validate_lettered_assets(
	*,
	episode_dir: Path,
	compiled: dict[str, Any],
	manifest_path: Path,
	cover_path: Path,
) -> LetteredExportAssets:
	"""Validate the complete page-preview snapshot before a final export is opened."""

	episode_dir = episode_dir.resolve()
	manifest_path = manifest_path.resolve()
	cover_path = cover_path.resolve()
	metadata = compiled.get("metadata")
	pages = compiled.get("pages")
	if not isinstance(metadata, dict) or not isinstance(pages, list):
		raise ValueError("Compiled comic JSON must contain metadata and pages.")

	try:
		expected_count = int(metadata["storyPageCount"])
	except (KeyError, TypeError, ValueError) as error:
		raise ValueError("Compiled metadata.storyPageCount must be a positive integer.") from error
	if expected_count < 1:
		raise ValueError("Compiled metadata.storyPageCount must be a positive integer.")
	compiled_numbers = [page.get("page") for page in pages if isinstance(page, dict)]
	expected_numbers = list(range(1, expected_count + 1))
	if len(pages) != expected_count or compiled_numbers != expected_numbers:
		raise ValueError(
			"Compiled story pages must be the exact ordered range "
			f"1-{expected_count}; found {compiled_numbers}."
		)

	source_digest = _require_sha256(compiled.get("sourceDigest"), "Compiled sourceDigest")
	lettering_digest = _require_sha256(
		compiled.get("letteringDigest"), "Compiled letteringDigest"
	)
	if not manifest_path.is_file():
		raise FileNotFoundError(
			f"Lettered-page preview manifest not found: {manifest_path}. "
			"Render the complete album before exporting."
		)
	manifest = _load_json(manifest_path)
	if not isinstance(manifest, dict):
		raise ValueError("Lettered-page preview manifest must be a JSON object.")
	if manifest.get("format") != PREVIEW_FORMAT:
		raise ValueError(
			f"Unexpected preview manifest format: {manifest.get('format')!r}; "
			f"expected {PREVIEW_FORMAT!r}."
		)
	if manifest.get("formatVersion") != PREVIEW_FORMAT_VERSION:
		raise ValueError(
			f"Unexpected preview manifest version: {manifest.get('formatVersion')!r}; "
			f"expected {PREVIEW_FORMAT_VERSION}."
		)
	if str(manifest.get("episodeId", "")) != str(metadata.get("id", "")):
		raise ValueError("Preview manifest episodeId does not match compiled metadata.")
	if manifest.get("sourceDigest") != source_digest:
		raise ValueError(
			"Preview manifest sourceDigest is stale; render all lettered pages again."
		)
	if manifest.get("letteringDigest") != lettering_digest:
		raise ValueError(
			"Preview manifest letteringDigest is stale; render all lettered pages again."
		)

	entries = manifest.get("entries")
	if not isinstance(entries, list):
		raise ValueError("Preview manifest entries must be an array.")
	entry_numbers = [
		entry.get("page") if isinstance(entry, dict) else None for entry in entries
	]
	if len(entries) != expected_count or entry_numbers != expected_numbers:
		raise ValueError(
			"Preview manifest must contain the exact ordered page set "
			f"1-{expected_count}; found {entry_numbers}."
		)

	validated_pages: list[LetteredPageAsset] = []
	for expected_page, entry in zip(expected_numbers, entries, strict=True):
		if not isinstance(entry, dict):
			raise ValueError(f"Preview manifest page {expected_page} entry must be an object.")
		image_path = _episode_asset(
			episode_dir, entry.get("file"), f"Preview page {expected_page} file"
		)
		_require_raster(image_path, f"Preview page {expected_page}")
		expected_image_sha = _require_sha256(
			entry.get("sha256"), f"Preview page {expected_page} sha256"
		)
		expected_image_bytes = entry.get("bytes")
		if (
			not isinstance(expected_image_bytes, int)
			or isinstance(expected_image_bytes, bool)
			or expected_image_bytes < 1
		):
			raise ValueError(f"Preview page {expected_page} bytes must be a positive integer.")
		actual_image_sha, actual_image_bytes = _sha256_and_size(image_path)
		if actual_image_bytes != expected_image_bytes:
			raise ValueError(
				f"Preview page {expected_page} byte size is stale or tampered: "
				f"manifest {expected_image_bytes}, file {actual_image_bytes}."
			)
		if actual_image_sha != expected_image_sha:
			raise ValueError(
				f"Preview page {expected_page} SHA-256 is stale or tampered."
			)

		source_path = _episode_asset(
			episode_dir, entry.get("source"), f"Preview page {expected_page} source"
		)
		expected_source_sha = _require_sha256(
			entry.get("sourceSha256"), f"Preview page {expected_page} sourceSha256"
		)
		actual_source_sha, _actual_source_bytes = _sha256_and_size(source_path)
		if actual_source_sha != expected_source_sha:
			raise ValueError(
				f"Preview page {expected_page} source SHA-256 is stale or tampered."
			)
		validated_pages.append(
			LetteredPageAsset(
				page=expected_page,
				image_path=image_path,
				image_sha256=actual_image_sha,
				image_bytes=actual_image_bytes,
				source_path=source_path,
				source_sha256=actual_source_sha,
			)
		)

	try:
		cover_path.relative_to(episode_dir)
	except ValueError as error:
		raise ValueError(f"Lettered cover must stay inside the episode directory: {cover_path}") from error
	if not cover_path.is_file():
		raise FileNotFoundError(f"Final lettered cover not found: {cover_path}")
	if cover_path.stat().st_size < 1:
		raise ValueError(f"Final lettered cover is empty: {cover_path}")
	_require_raster(cover_path, "Final lettered cover")

	return LetteredExportAssets(
		cover_path=cover_path,
		manifest_path=manifest_path,
		source_digest=source_digest,
		lettering_digest=lettering_digest,
		pages=tuple(validated_pages),
	)
