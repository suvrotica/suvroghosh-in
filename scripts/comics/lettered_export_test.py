#!/usr/bin/env python3
"""Focused regression tests for fail-closed lettered PDF/EPUB exports."""

from __future__ import annotations

import binascii
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile
import zlib

from lettered_export import validate_lettered_assets


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]


def sha256(data: bytes) -> str:
	return hashlib.sha256(data).hexdigest()


def png_bytes(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
	def chunk(kind: bytes, payload: bytes) -> bytes:
		checksum = binascii.crc32(kind + payload) & 0xFFFFFFFF
		return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)

	row = bytes([0]) + bytes(rgb) * width
	pixels = row * height
	return (
		b"\x89PNG\r\n\x1a\n"
		+ chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
		+ chunk(b"IDAT", zlib.compress(pixels))
		+ chunk(b"IEND", b"")
	)


def usable_pdftoppm() -> tuple[Path | None, str]:
	"""Find a working Poppler binary, bypassing broken bundled Windows wrappers."""
	discovered = shutil.which("pdftoppm")
	if not discovered:
		return None, "pdftoppm is not on PATH"
	discovered_path = Path(discovered).resolve()
	candidates: list[Path] = []
	if discovered_path.suffix.lower() in {".cmd", ".bat"}:
		for parent in discovered_path.parents:
			candidates.extend(
				[
					parent / "native" / "poppler" / "Library" / "bin" / "pdftoppm.exe",
					parent / "Library" / "bin" / "pdftoppm.exe",
				]
			)
	candidates.append(discovered_path)
	failures: list[str] = []
	seen: set[Path] = set()
	for candidate in candidates:
		candidate = candidate.resolve()
		if candidate in seen or not candidate.is_file():
			continue
		seen.add(candidate)
		probe = subprocess.run(
			[str(candidate), "-v"],
			capture_output=True,
			text=True,
			check=False,
		)
		if probe.returncode == 0:
			return candidate, ""
		detail = (probe.stderr or probe.stdout).strip().replace("\n", " ")
		failures.append(f"{candidate} exited {probe.returncode}: {detail}")
	return None, "; ".join(failures) or f"no runnable binary found near {discovered_path}"


class LetteredExportTest(unittest.TestCase):
	def setUp(self) -> None:
		self.temporary = tempfile.TemporaryDirectory(prefix="comic-lettered-export-")
		self.root = Path(self.temporary.name)
		self.episode_dir = (
			self.root
			/ "src"
			/ "lib"
			/ "comics"
			/ "fixture-town"
			/ "episodes"
			/ "001-fixture-album"
		)
		self.compiled_path = self.episode_dir / "generated" / "episode.json"
		self.manifest_path = self.episode_dir / "pages" / "previews" / "manifest.json"
		self.cover_path = (
			self.episode_dir / "panels" / "approved" / "cover__lettered__r1.png"
		)
		self.compiled = {
			"format": "suvroghosh-comic-compiled",
			"formatVersion": 1,
			"sourceDigest": "a" * 64,
			"letteringDigest": "b" * 64,
			"metadata": {
				"id": "001",
				"title": "Fixture Album",
				"subtitle": "A deterministic test",
				"description": "A small fixture for final lettered export tests.",
				"storyPageCount": 2,
				"canonicalPath": "/blog/comic/fixture-town/fixture-album",
				"language": "en",
				"date": "2026-07-28",
				"dateModified": "2026-07-28",
				"tags": ["Comic"],
				"credits": [{"role": "Test author", "name": "Fixture Runner"}],
				"contentGuidance": ["Technological satire"],
				"coverAlt": "A tiny coloured fixture cover.",
			},
			"pages": [
				{"page": 1, "title": "First fixture page", "panels": []},
				{"page": 2, "title": "Second fixture page", "panels": []},
			],
			"frontMatter": {},
		}
		self._write_json(self.compiled_path, self.compiled)
		self.cover_path.parent.mkdir(parents=True, exist_ok=True)
		self.cover_path.write_bytes(png_bytes(8, 11, (142, 52, 45)))

		entries = []
		for page in (1, 2):
			image_relative = Path("pages") / "previews" / f"page-{page:03d}.png"
			source_relative = Path("pages") / "working" / f"page-{page:03d}.svg"
			image_data = png_bytes(8, 12, (49, 95 + page, 114))
			source_data = f"<svg><title>Fixture page {page}</title></svg>\n".encode()
			image_path = self.episode_dir / image_relative
			source_path = self.episode_dir / source_relative
			image_path.parent.mkdir(parents=True, exist_ok=True)
			source_path.parent.mkdir(parents=True, exist_ok=True)
			image_path.write_bytes(image_data)
			source_path.write_bytes(source_data)
			entries.append(
				{
					"page": page,
					"file": image_relative.as_posix(),
					"bytes": len(image_data),
					"sha256": sha256(image_data),
					"source": source_relative.as_posix(),
					"sourceSha256": sha256(source_data),
				}
			)
		self.manifest = {
			"format": "suvroghosh-comic-page-previews",
			"formatVersion": 1,
			"episodeId": "001",
			"sourceDigest": self.compiled["sourceDigest"],
			"letteringDigest": self.compiled["letteringDigest"],
			"entries": entries,
		}
		self._write_json(self.manifest_path, self.manifest)

	def tearDown(self) -> None:
		self.temporary.cleanup()

	@staticmethod
	def _write_json(filename: Path, value: object) -> None:
		filename.parent.mkdir(parents=True, exist_ok=True)
		filename.write_text(
			json.dumps(value, indent=2, sort_keys=True) + "\n",
			encoding="utf-8",
		)

	def validate(self):
		return validate_lettered_assets(
			episode_dir=self.episode_dir,
			compiled=self.compiled,
			manifest_path=self.manifest_path,
			cover_path=self.cover_path,
		)

	def test_valid_manifest_requires_complete_ordered_snapshot(self) -> None:
		assets = self.validate()
		self.assertEqual([asset.page for asset in assets.pages], [1, 2])
		self.assertEqual(assets.cover_path, self.cover_path.resolve())

	def test_missing_manifest_fails_closed(self) -> None:
		self.manifest_path.unlink()
		with self.assertRaisesRegex(FileNotFoundError, "preview manifest not found"):
			self.validate()

	def test_stale_source_digest_fails_closed(self) -> None:
		self.manifest["sourceDigest"] = "c" * 64
		self._write_json(self.manifest_path, self.manifest)
		with self.assertRaisesRegex(ValueError, "sourceDigest is stale"):
			self.validate()

	def test_subset_manifest_fails_closed(self) -> None:
		self.manifest["entries"] = self.manifest["entries"][:1]
		self._write_json(self.manifest_path, self.manifest)
		with self.assertRaisesRegex(ValueError, "exact ordered page set"):
			self.validate()

	def test_tampered_manifest_hash_and_page_size_fail_closed(self) -> None:
		self.manifest["entries"][0]["sha256"] = "d" * 64
		self._write_json(self.manifest_path, self.manifest)
		with self.assertRaisesRegex(ValueError, "SHA-256 is stale or tampered"):
			self.validate()

		self.manifest["entries"][0]["sha256"] = sha256(
			(self.episode_dir / self.manifest["entries"][0]["file"]).read_bytes()
		)
		self.manifest["entries"][0]["bytes"] += 1
		self._write_json(self.manifest_path, self.manifest)
		with self.assertRaisesRegex(ValueError, "byte size is stale or tampered"):
			self.validate()

	def exporter_command(self, script: str, output: Path) -> list[str]:
		return [
			sys.executable,
			str(SCRIPT_DIR / script),
			"--root",
			str(self.root),
			"--episode-dir",
			str(self.episode_dir),
			"--compiled",
			str(self.compiled_path),
			"--output",
			str(output),
			"--lettered-pages",
			"--preview-manifest",
			str(self.manifest_path),
			"--cover",
			str(self.cover_path),
		]

	def test_epub_contains_real_cover_and_every_lettered_page(self) -> None:
		output = self.root / "output" / "fixture-lettered.epub"
		subprocess.run(
			self.exporter_command("export_epub.py", output),
			check=True,
			capture_output=True,
			text=True,
		)
		with zipfile.ZipFile(output) as archive:
			names = archive.namelist()
			self.assertEqual(names[0], "mimetype")
			self.assertEqual(
				{name for name in names if name.startswith("EPUB/images/")},
				{
					"EPUB/images/cover.jpg",
					"EPUB/images/page-001.jpg",
					"EPUB/images/page-002.jpg",
				},
			)
			package = archive.read("EPUB/package.opf").decode()
			self.assertIn('properties="cover-image"', package)
			self.assertIn('id="page-image-001"', package)
			self.assertIn('id="page-image-002"', package)
			self.assertIn("images/cover.jpg", archive.read("EPUB/cover.xhtml").decode())
			first_page = archive.read("EPUB/page-001.xhtml").decode()
			self.assertIn("images/page-001.jpg", first_page)
			self.assertIn("transcript.xhtml#transcript-page-1", first_page)
			self.assertNotIn("placeholder", first_page)
			self.assertIn("transcript-page-2", archive.read("EPUB/transcript.xhtml").decode())

	def test_lettered_export_never_falls_back_when_manifest_is_stale(self) -> None:
		self.manifest["letteringDigest"] = "e" * 64
		self._write_json(self.manifest_path, self.manifest)
		output = self.root / "output" / "must-not-exist.epub"
		result = subprocess.run(
			self.exporter_command("export_epub.py", output),
			check=False,
			capture_output=True,
			text=True,
		)
		self.assertNotEqual(result.returncode, 0)
		self.assertIn("letteringDigest is stale", result.stderr)
		self.assertFalse(output.exists())

	def test_pdf_contains_cover_and_every_lettered_page_when_dependencies_exist(self) -> None:
		try:
			import reportlab  # noqa: F401
			from pypdf import PdfReader
		except ImportError as error:
			self.skipTest(f"PDF verification dependency unavailable: {error}")

		output = self.root / "output" / "fixture-lettered.pdf"
		subprocess.run(
			self.exporter_command("export_pdf.py", output),
			check=True,
			capture_output=True,
			text=True,
		)
		reader = PdfReader(output)
		self.assertEqual(len(reader.pages), 5)
		image_objects = 0
		for page in reader.pages:
			resources = page.get("/Resources") or {}
			xobjects = resources.get("/XObject") or {}
			for value in xobjects.values():
				if value.get_object().get("/Subtype") == "/Image":
					image_objects += 1
		self.assertGreaterEqual(image_objects, 3)

		renderer, renderer_error = usable_pdftoppm()
		if not renderer:
			warnings.warn(
				f"PDF raster assertion not run: {renderer_error}",
				RuntimeWarning,
				stacklevel=2,
			)
			return
		render_prefix = self.root / "rendered-fixture"
		subprocess.run(
			[str(renderer), "-f", "1", "-singlefile", "-png", str(output), str(render_prefix)],
			check=True,
			capture_output=True,
		)
		self.assertTrue(render_prefix.with_suffix(".png").is_file())


if __name__ == "__main__":
	unittest.main(verbosity=2)
