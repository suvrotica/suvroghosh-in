from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIRECTORIES = (
	ROOT / "static" / "images",
	ROOT / "static" / "photos",
	ROOT / "static" / "thumbnail",
)
MANIFEST_PATH = ROOT / "scripts" / "image-optimization-manifest.json"
OPTIMIZER_VERSION = "2026-07-18.1"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
JPEG_QUALITY_STEPS = (76, 78, 80, 82, 84, 86)
MIN_PSNR_DB = 36.0
MAX_DIMENSION = 1920
MIN_SAVINGS_RATIO = 0.005
MIN_SAVINGS_BYTES = 1024


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description=(
			"Incrementally optimise images in static/images, static/photos, and static/thumbnail."
		)
	)
	parser.add_argument(
		"--force", action="store_true", help="Reanalyse files even when their manifest hashes match."
	)
	parser.add_argument(
		"--verify",
		action="store_true",
		help="Verify committed files against the manifest without changing them.",
	)
	return parser.parse_args()


def relative_path(path: Path) -> str:
	return path.relative_to(ROOT).as_posix()


def sha256_bytes(value: bytes) -> str:
	return hashlib.sha256(value).hexdigest()


def format_mib(value: int) -> str:
	return f"{value / 1024 / 1024:.2f} MiB"


def scan_images() -> list[Path]:
	return sorted(
		path
		for directory in MEDIA_DIRECTORIES
		if directory.exists()
		for path in directory.rglob("*")
		if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
	)


def load_manifest() -> dict[str, Any]:
	if not MANIFEST_PATH.exists():
		return {"version": OPTIMIZER_VERSION, "files": {}}

	try:
		manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
	except (json.JSONDecodeError, OSError) as exc:
		raise RuntimeError(f"Image optimisation manifest is invalid: {exc}") from exc

	if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), dict):
		raise RuntimeError("Image optimisation manifest must contain a files object.")
	return manifest


def write_atomic(path: Path, value: bytes) -> None:
	path.parent.mkdir(parents=True, exist_ok=True)
	file_descriptor, temporary_name = tempfile.mkstemp(
		prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
	)
	try:
		with os.fdopen(file_descriptor, "wb") as temporary_file:
			temporary_file.write(value)
			temporary_file.flush()
			os.fsync(temporary_file.fileno())
		for attempt in range(8):
			try:
				os.replace(temporary_name, path)
				break
			except PermissionError:
				if attempt == 7:
					raise
				time.sleep(0.05 * (attempt + 1))
	finally:
		if os.path.exists(temporary_name):
			os.unlink(temporary_name)


def save_manifest(manifest: dict[str, Any]) -> None:
	manifest["version"] = OPTIMIZER_VERSION
	manifest["settings"] = {
		"jpegQualitySteps": list(JPEG_QUALITY_STEPS),
		"maxDimension": MAX_DIMENSION,
		"minimumPsnrDb": MIN_PSNR_DB,
		"minimumSavingsRatio": MIN_SAVINGS_RATIO,
	}
	encoded = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
	if MANIFEST_PATH.exists() and MANIFEST_PATH.read_bytes() == encoded:
		return
	write_atomic(MANIFEST_PATH, encoded)


def calculate_psnr(original: Any, candidate_bytes: bytes) -> float:
	from PIL import Image, ImageChops, ImageStat

	with Image.open(io.BytesIO(candidate_bytes)) as candidate:
		candidate.load()
		difference = ImageChops.difference(original.convert("RGB"), candidate.convert("RGB"))
		rms = ImageStat.Stat(difference).rms
	mean_squared_error = sum(channel * channel for channel in rms) / len(rms)
	if mean_squared_error == 0:
		return math.inf
	return 10 * math.log10((255 * 255) / mean_squared_error)


def resized_copy(image: Any) -> tuple[Any, bool]:
	from PIL import Image

	if max(image.size) <= MAX_DIMENSION:
		return image.copy(), False

	working = image.copy()
	working.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
	return working, True


def optimise_jpeg(source: Any) -> tuple[bytes, dict[str, Any]]:
	from PIL import ImageOps

	oriented = ImageOps.exif_transpose(source)
	working, resized = resized_copy(oriented.convert("RGB"))
	icc_profile = source.info.get("icc_profile")
	selected_bytes = b""
	selected_quality = JPEG_QUALITY_STEPS[-1]
	selected_psnr = 0.0

	for quality in JPEG_QUALITY_STEPS:
		output = io.BytesIO()
		options: dict[str, Any] = {
			"format": "JPEG",
			"quality": quality,
			"optimize": True,
			"progressive": True,
			"subsampling": "4:2:0",
		}
		if icc_profile:
			options["icc_profile"] = icc_profile
		working.save(output, **options)
		selected_bytes = output.getvalue()
		selected_quality = quality
		selected_psnr = calculate_psnr(working, selected_bytes)
		if selected_psnr >= MIN_PSNR_DB:
			break

	return selected_bytes, {
		"quality": selected_quality,
		"psnrDb": round(selected_psnr, 2),
		"resized": resized,
		"width": working.width,
		"height": working.height,
	}


def optimise_png(source: Any) -> tuple[bytes, dict[str, Any]]:
	from PIL import ImageOps

	working, resized = resized_copy(ImageOps.exif_transpose(source))
	output = io.BytesIO()
	options: dict[str, Any] = {"format": "PNG", "optimize": True, "compress_level": 9}
	if source.info.get("icc_profile"):
		options["icc_profile"] = source.info["icc_profile"]
	if "transparency" in source.info:
		options["transparency"] = source.info["transparency"]
	working.save(output, **options)
	return output.getvalue(), {
		"lossless": True,
		"resized": resized,
		"width": working.width,
		"height": working.height,
	}


def optimise_webp(source: Any) -> tuple[bytes, dict[str, Any]]:
	from PIL import ImageOps

	working, resized = resized_copy(ImageOps.exif_transpose(source))
	icc_profile = source.info.get("icc_profile")
	has_alpha = "A" in working.getbands()

	if has_alpha:
		output = io.BytesIO()
		options: dict[str, Any] = {
			"format": "WEBP",
			"lossless": True,
			"method": 6,
			"exact": True,
		}
		if icc_profile:
			options["icc_profile"] = icc_profile
		working.save(output, **options)
		return output.getvalue(), {
			"lossless": True,
			"resized": resized,
			"width": working.width,
			"height": working.height,
		}

	baseline = working.convert("RGB")
	selected_bytes = b""
	selected_quality = JPEG_QUALITY_STEPS[-1]
	selected_psnr = 0.0
	for quality in JPEG_QUALITY_STEPS:
		output = io.BytesIO()
		options = {"format": "WEBP", "quality": quality, "method": 6}
		if icc_profile:
			options["icc_profile"] = icc_profile
		baseline.save(output, **options)
		selected_bytes = output.getvalue()
		selected_quality = quality
		selected_psnr = calculate_psnr(baseline, selected_bytes)
		if selected_psnr >= MIN_PSNR_DB:
			break

	return selected_bytes, {
		"quality": selected_quality,
		"psnrDb": round(selected_psnr, 2),
		"resized": resized,
		"width": baseline.width,
		"height": baseline.height,
	}


def optimise_file(path: Path, original_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
	from PIL import Image

	with Image.open(io.BytesIO(original_bytes)) as source:
		source.load()
		original_width, original_height = source.size
		image_format = (source.format or path.suffix.removeprefix(".")).upper()
		if getattr(source, "is_animated", False):
			return original_bytes, {
				"format": image_format,
				"reason": "animated image retained",
				"width": original_width,
				"height": original_height,
			}

		if image_format == "JPEG":
			candidate, details = optimise_jpeg(source)
		elif image_format == "PNG":
			candidate, details = optimise_png(source)
		elif image_format == "WEBP":
			candidate, details = optimise_webp(source)
		else:
			return original_bytes, {
				"format": image_format,
				"reason": "unsupported image format retained",
				"width": original_width,
				"height": original_height,
			}

	minimum_savings = max(MIN_SAVINGS_BYTES, round(len(original_bytes) * MIN_SAVINGS_RATIO))
	resized = bool(details.get("resized"))
	should_replace = len(candidate) <= len(original_bytes) - minimum_savings
	if resized and len(candidate) < len(original_bytes):
		should_replace = True

	return (candidate if should_replace else original_bytes), {
		"format": image_format,
		"originalWidth": original_width,
		"originalHeight": original_height,
		"optimized": should_replace,
		**details,
	}


def verify_manifest() -> int:
	try:
		manifest = load_manifest()
	except RuntimeError as exc:
		print(str(exc), file=sys.stderr)
		return 1

	files = scan_images()
	entries = manifest.get("files", {})
	problems: list[str] = []
	if manifest.get("version") != OPTIMIZER_VERSION:
		problems.append("manifest uses an outdated optimizer version")

	for path in files:
		key = relative_path(path)
		entry = entries.get(key)
		if not isinstance(entry, dict):
			problems.append(f"{key}: missing manifest entry")
			continue
		if entry.get("optimizerVersion") != OPTIMIZER_VERSION:
			problems.append(f"{key}: stale optimizer version")
			continue
		if entry.get("outputHash") != sha256_bytes(path.read_bytes()):
			problems.append(f"{key}: file changed since optimization")

	if problems:
		print("Image assets are missing or stale in the optimisation manifest.", file=sys.stderr)
		for problem in problems[:12]:
			print(f" - {problem}", file=sys.stderr)
		if len(problems) > 12:
			print(f" - ...and {len(problems) - 12} more", file=sys.stderr)
		print(
			"Run `npm run images:install && npm run images:optimize`, commit the images and manifest, then redeploy.",
			file=sys.stderr,
		)
		return 1

	print(f"Images: verified {len(files)} committed optimized assets; generation skipped.")
	return 0


def optimise_all(force: bool) -> int:
	try:
		manifest = load_manifest()
	except RuntimeError as exc:
		print(str(exc), file=sys.stderr)
		return 1

	entries: dict[str, Any] = manifest.setdefault("files", {})
	files = scan_images()
	current_paths = {relative_path(path) for path in files}
	total_before = sum(path.stat().st_size for path in files)
	analyzed = optimized = retained = skipped = 0

	for index, path in enumerate(files, start=1):
		key = relative_path(path)
		original_bytes = path.read_bytes()
		current_hash = sha256_bytes(original_bytes)
		cached = entries.get(key)
		if (
			not force
			and isinstance(cached, dict)
			and cached.get("optimizerVersion") == OPTIMIZER_VERSION
			and cached.get("outputHash") == current_hash
		):
			skipped += 1
			continue

		try:
			output_bytes, details = optimise_file(path, original_bytes)
		except Exception as exc:
			print(f"Image optimisation failed for {key}: {exc}", file=sys.stderr)
			return 1

		analyzed += 1
		if output_bytes != original_bytes:
			write_atomic(path, output_bytes)
			optimized += 1
		else:
			retained += 1

		entries[key] = {
			"optimizerVersion": OPTIMIZER_VERSION,
			"sourceHash": current_hash,
			"outputHash": sha256_bytes(output_bytes),
			"sourceBytes": len(original_bytes),
			"outputBytes": len(output_bytes),
			**details,
		}
		# Persist each completed file so an interrupted first run cannot recompress it on restart.
		save_manifest(manifest)

		if index % 50 == 0:
			print(f"Images: checked {index}/{len(files)}...", flush=True)

	for stale_path in set(entries) - current_paths:
		del entries[stale_path]

	save_manifest(manifest)
	total_after = sum(path.stat().st_size for path in files)
	saved = total_before - total_after
	percentage = (saved / total_before * 100) if total_before else 0
	print(
		f"Images: scanned {len(files)}, analysed {analyzed}, optimized {optimized}, "
		f"retained {retained}, skipped {skipped}; {format_mib(total_before)} -> "
		f"{format_mib(total_after)} ({format_mib(saved)} saved, {percentage:.1f}%)."
	)
	return 0


def main() -> int:
	args = parse_args()
	verify_only = (
		args.verify
		or os.environ.get("VERCEL") == "1"
		or os.environ.get("IMAGE_OPTIMIZE_VERIFY_ONLY") == "1"
	)
	if verify_only:
		return verify_manifest()

	if importlib.util.find_spec("PIL") is None:
		if os.environ.get("CI"):
			return verify_manifest()
		print("Pillow is required for image optimisation.", file=sys.stderr)
		print("Run `npm run images:install` and try again.", file=sys.stderr)
		return 1

	return optimise_all(args.force)


if __name__ == "__main__":
	raise SystemExit(main())
