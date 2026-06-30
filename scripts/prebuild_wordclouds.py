from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "src" / "lib" / "posts"
OUTPUT_DIR = ROOT / "static" / "wordcloud"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
GENERATOR_VERSION = "2026-07-01.1"
REQUIRED_MODULES = ("wordcloud", "PIL", "numpy", "yaml")


def missing_modules() -> list[str]:
	return [module for module in REQUIRED_MODULES if importlib.util.find_spec(module) is None]


def source_hash(text: str) -> str:
	return hashlib.sha256((GENERATOR_VERSION + "\n" + text).encode("utf-8")).hexdigest()


def output_slug(markdown_path: Path, seen: dict[str, int]) -> str:
	candidate = re.sub(r"[^A-Za-z0-9_-]+", "-", markdown_path.stem).strip("-")
	if not candidate:
		candidate = "post"

	seen[candidate] += 1
	if seen[candidate] == 1:
		return candidate

	parent = re.sub(r"[^A-Za-z0-9_-]+", "-", markdown_path.parent.name).strip("-")
	return f"{parent}-{candidate}-{seen[candidate]}"


def verify_committed_wordclouds() -> int:
	if not MANIFEST_PATH.exists():
		print("Word cloud manifest is missing: static/wordcloud/manifest.json", file=sys.stderr)
		return 1

	try:
		manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
	except json.JSONDecodeError as exc:
		print(f"Word cloud manifest is invalid JSON: {exc}", file=sys.stderr)
		return 1

	manifest_posts = manifest.get("posts", {})
	seen: defaultdict[str, int] = defaultdict(int)
	scanned = verified = 0
	problems: list[str] = []

	for markdown_path in sorted(POSTS_DIR.glob("*.md")):
		scanned += 1
		slug = output_slug(markdown_path, seen)
		output_path = OUTPUT_DIR / f"{slug}.svg"
		entry = manifest_posts.get(slug)
		raw_text = markdown_path.read_text(encoding="utf-8")
		current_hash = source_hash(raw_text)

		if not output_path.exists():
			problems.append(f"{slug}: missing {output_path.relative_to(ROOT).as_posix()}")
			continue

		if not isinstance(entry, dict):
			problems.append(f"{slug}: missing manifest entry")
			continue

		if entry.get("sourceHash") != current_hash:
			problems.append(f"{slug}: stale manifest hash")
			continue

		if entry.get("generatorVersion") != GENERATOR_VERSION:
			problems.append(f"{slug}: stale generator version")
			continue

		verified += 1

	if problems:
		print(
			"Word cloud assets are missing or stale, and this build environment cannot generate them.",
			file=sys.stderr,
		)
		for problem in problems[:12]:
			print(f" - {problem}", file=sys.stderr)
		if len(problems) > 12:
			print(f" - ...and {len(problems) - 12} more", file=sys.stderr)
		print(
			"Run `npm run wordclouds:install && npm run wordclouds`, commit static/wordcloud, then redeploy.",
			file=sys.stderr,
		)
		return 1

	print(
		f"Word clouds: verified {verified}/{scanned} committed SVGs; generation skipped in this environment."
	)
	return 0


def main() -> int:
	missing = missing_modules()
	if os.environ.get("VERCEL") == "1" or os.environ.get("WORDCLOUD_VERIFY_ONLY") == "1":
		if missing:
			print(f"Word cloud Python dependencies unavailable: {', '.join(missing)}.")
		else:
			print("Word cloud generation skipped on Vercel; verifying committed SVGs instead.")
		return verify_committed_wordclouds()

	if not missing:
		return subprocess.call([sys.executable, str(ROOT / "scripts" / "generate_wordclouds.py")])

	if os.environ.get("CI"):
		print(f"Word cloud Python dependencies unavailable: {', '.join(missing)}.")
		return verify_committed_wordclouds()

	print(f"Missing word cloud Python dependencies: {', '.join(missing)}.", file=sys.stderr)
	print("Run `npm run wordclouds:install` before building locally.", file=sys.stderr)
	return 1


if __name__ == "__main__":
	raise SystemExit(main())
