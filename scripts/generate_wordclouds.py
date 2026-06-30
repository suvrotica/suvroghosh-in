from __future__ import annotations

import argparse
import hashlib
import html
import json
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
	from wordcloud import STOPWORDS, WordCloud
except ImportError as exc:  # pragma: no cover - exercised before dependencies are installed.
	raise SystemExit(
		"Missing Python dependency 'wordcloud'. Run: python -m pip install -r requirements-wordcloud.txt"
	) from exc

try:
	import yaml
except ImportError:  # pragma: no cover - PyYAML is listed, but the script can still clean text.
	yaml = None


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "src" / "lib" / "posts"
OUTPUT_DIR = ROOT / "static" / "wordcloud"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
GENERATOR_VERSION = "2026-07-01.1"
MAX_WORDS = 130

TECHNICAL_DISPLAY = {
	"abv": "ABV",
	"ai": "AI",
	"api": "API",
	"apis": "APIs",
	"aws": "AWS",
	"cds": "CDS",
	"cpu": "CPU",
	"css": "CSS",
	"csv": "CSV",
	"db": "DB",
	"docker": "Docker",
	"ehr": "EHR",
	"ehrdatabase": "EHR",
	"elasticnet": "ElasticNet",
	"etl": "ETL",
	"fhir": "FHIR",
	"gan": "GAN",
	"gdp": "GDP",
	"gdpr": "GDPR",
	"gpu": "GPU",
	"hipaa": "HIPAA",
	"hl7": "HL7",
	"html": "HTML",
	"http": "HTTP",
	"https": "HTTPS",
	"icd": "ICD",
	"json": "JSON",
	"llm": "LLM",
	"llms": "LLMs",
	"loinc": "LOINC",
	"ml": "ML",
	"mlops": "MLOps",
	"mumps": "MUMPS",
	"nlp": "NLP",
	"oauth": "OAuth",
	"pacs": "PACS",
	"pm10": "PM10",
	"pm25": "PM2.5",
	"rest": "REST",
	"rim": "RIM",
	"rims": "RIMs",
	"snomed": "SNOMED",
	"sql": "SQL",
	"ui": "UI",
	"uml": "UML",
	"url": "URL",
	"urls": "URLs",
	"va": "VA",
	"vae": "VAE",
	"xml": "XML",
}

CUSTOM_STOPWORDS = {
	*STOPWORDS,
	"also",
	"another",
	"around",
	"back",
	"became",
	"become",
	"blog",
	"body",
	"calcutta",
	"category",
	"chapter",
	"city",
	"come",
	"comes",
	"could",
	"day",
	"description",
	"did",
	"does",
	"done",
	"engineering",
	"essay",
	"felt",
	"going",
	"good",
	"got",
	"image",
	"inside",
	"knew",
	"know",
	"kolkata",
	"left",
	"life",
	"look",
	"looked",
	"made",
	"make",
	"makes",
	"markdown",
	"may",
	"might",
	"must",
	"new",
	"old",
	"one",
	"people",
	"post",
	"published",
	"really",
	"right",
	"said",
	"says",
	"see",
	"something",
	"still",
	"suvro",
	"suvroghosh",
	"tag",
	"tags",
	"thing",
	"things",
	"thumbnail",
	"title",
	"told",
	"took",
	"two",
	"video",
	"want",
	"wanted",
	"way",
	"well",
	"went",
	"will",
	"without",
	"word",
	"words",
	"would",
}

PALETTE = [
	"#d9c89e",
	"#c7d7b5",
	"#9fc9c5",
	"#d6a79f",
	"#b6c3dd",
	"#e0b879",
	"#a9b7a3",
	"#d5d2c2",
	"#c49a6c",
	"#8fb7d0",
	"#d88988",
]


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Generate static SVG word clouds for blog posts.")
	parser.add_argument("--force", action="store_true", help="Regenerate all word clouds.")
	parser.add_argument("--max-words", type=int, default=MAX_WORDS, help="Maximum words per cloud.")
	return parser.parse_args()


def load_manifest() -> dict[str, Any]:
	if not MANIFEST_PATH.exists():
		return {"version": GENERATOR_VERSION, "posts": {}}

	try:
		with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
			data = json.load(handle)
	except (json.JSONDecodeError, OSError):
		return {"version": GENERATOR_VERSION, "posts": {}}

	if not isinstance(data, dict):
		return {"version": GENERATOR_VERSION, "posts": {}}
	data.setdefault("posts", {})
	return data


def save_manifest(manifest: dict[str, Any]) -> None:
	manifest["version"] = GENERATOR_VERSION
	manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()
	MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")


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


def split_frontmatter(raw_text: str) -> tuple[dict[str, Any], str]:
	if not raw_text.startswith("---"):
		return {}, raw_text

	match = re.match(r"\A---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n)?(.*)\Z", raw_text, re.DOTALL)
	if not match:
		return {}, raw_text

	frontmatter_text, body = match.groups()
	if yaml is None:
		return {}, body

	try:
		metadata = yaml.safe_load(frontmatter_text) or {}
	except yaml.YAMLError:
		metadata = {}

	return metadata if isinstance(metadata, dict) else {}, body


def strip_markdown_noise(body: str) -> str:
	text = body
	text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
	text = re.sub(r"~~~.*?~~~", " ", text, flags=re.DOTALL)
	text = re.sub(r"(?m)^\s*import\s+.+?;?\s*$", " ", text)
	text = re.sub(r"(?m)^\s*export\s+.+?;?\s*$", " ", text)
	text = re.sub(r"<script\b.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
	text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
	text = re.sub(r"<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?/>", " ", text)
	text = re.sub(r"<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?>.*?</[A-Z][A-Za-z0-9_.:-]*>", " ", text, flags=re.DOTALL)
	text = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", text)
	text = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", text)
	text = re.sub(r"https?://\S+|www\.\S+", " ", text)
	text = re.sub(r"\b\S+\.(?:jpg|jpeg|png|gif|webp|svg|mp3|mp4|webm|pdf|avif)\b", " ", text, flags=re.IGNORECASE)
	text = re.sub(r"<[^>]+>", " ", text)
	text = html.unescape(text)
	text = re.sub(r"`([^`]*)`", r"\1", text)
	text = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", " ", text)
	text = re.sub(r"(?m)^\s{0,3}>\s?", " ", text)
	text = re.sub(r"(?m)^\s*[-*+]\s+", " ", text)
	text = re.sub(r"(?m)^\s*\d+[.)]\s+", " ", text)
	text = text.replace("&nbsp;", " ")
	return text


def normalize_token(token: str) -> str | None:
	raw = token.strip("._-'/")
	if len(raw) < 2:
		return None

	key = raw.lower().replace(".", "")
	key = re.sub(r"[^a-z0-9]+", "", key)

	if not key or key.isdigit() or len(key) < 2:
		return None
	if key in CUSTOM_STOPWORDS:
		return None
	if len(key) == 2 and key not in TECHNICAL_DISPLAY:
		return None

	return key


def display_word(key: str, originals: Counter[str]) -> str:
	if key in TECHNICAL_DISPLAY:
		return TECHNICAL_DISPLAY[key]

	if originals:
		word, _ = originals.most_common(1)[0]
		if word.isupper() and 2 < len(word) <= 8:
			return word

	return key.capitalize()


def frequencies_from_body(body: str, max_words: int) -> dict[str, int]:
	cleaned = strip_markdown_noise(body)
	tokens = re.findall(r"[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*", cleaned)
	counts: Counter[str] = Counter()
	originals: defaultdict[str, Counter[str]] = defaultdict(Counter)

	for token in tokens:
		key = normalize_token(token)
		if key is None:
			continue
		counts[key] += 1
		originals[key][token.strip("._-'/")] += 1

	top_items = counts.most_common(max_words)
	return {display_word(key, originals[key]): count for key, count in top_items}


def color_func(*_: Any, random_state: random.Random | None = None, **__: Any) -> str:
	rng = random_state or random
	return rng.choice(PALETTE)


def polish_svg(svg: str, title: str, description: str) -> str:
	svg = re.sub(r"<\?xml[^>]*>\s*", "", svg, count=1)
	svg = svg.replace(
		"<svg ",
		f'<svg role="img" aria-label="{html.escape(title, quote=True)}" ',
		1,
	)

	accessibility = (
		f"<title>{html.escape(title)}</title>"
		f"<desc>{html.escape(description)}</desc>"
	)
	glow = (
		"<defs>"
		'<filter id="wordGlow" x="-20%" y="-20%" width="140%" height="140%">'
		'<feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#d8c7a1" flood-opacity="0.18"/>'
		"</filter>"
		"</defs>"
		'<style><![CDATA[text { filter: url(#wordGlow); paint-order: stroke fill; stroke: rgba(16,17,20,.34); stroke-width: .9px; }]]></style>'
	)

	return svg.replace(">", f">{accessibility}{glow}", 1)


def generate_svg(frequencies: dict[str, int], seed: int, title: str) -> str:
	cloud = WordCloud(
		width=1280,
		height=720,
		background_color="#101114",
		mode="RGBA",
		max_words=len(frequencies),
		min_font_size=8,
		max_font_size=118,
		font_step=1,
		prefer_horizontal=0.88,
		relative_scaling=0.55,
		collocations=False,
		margin=8,
		color_func=color_func,
		random_state=seed,
	)
	cloud.generate_from_frequencies(frequencies)
	svg = cloud.to_svg(embed_font=False)
	return polish_svg(svg, title, "Static build-time word cloud generated from the article body.")


def main() -> int:
	args = parse_args()
	OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
	manifest = load_manifest()
	manifest_posts = manifest.setdefault("posts", {})
	seen: defaultdict[str, int] = defaultdict(int)

	scanned = generated = skipped = failed = 0
	markdown_files = sorted(POSTS_DIR.glob("*.md"))

	for markdown_path in markdown_files:
		scanned += 1
		slug = output_slug(markdown_path, seen)
		output_path = OUTPUT_DIR / f"{slug}.svg"

		try:
			raw_text = markdown_path.read_text(encoding="utf-8")
			metadata, body = split_frontmatter(raw_text)
			content_hash = source_hash(raw_text)
			source_modified = datetime.fromtimestamp(markdown_path.stat().st_mtime, timezone.utc).isoformat()
			manifest_entry = manifest_posts.get(slug, {})

			if (
				not args.force
				and output_path.exists()
				and manifest_entry.get("sourceHash") == content_hash
				and manifest_entry.get("generatorVersion") == GENERATOR_VERSION
			):
				skipped += 1
				continue

			frequencies = frequencies_from_body(body, args.max_words)
			if len(frequencies) < 8:
				raise ValueError("not enough usable words after cleaning")

			seed = int(hashlib.sha256(slug.encode("utf-8")).hexdigest()[:8], 16)
			title = str(metadata.get("title") or markdown_path.stem)
			svg = generate_svg(frequencies, seed, title)
			output_path.write_text(svg, encoding="utf-8")

			manifest_posts[slug] = {
				"source": markdown_path.relative_to(ROOT).as_posix(),
				"sourceHash": content_hash,
				"sourceModified": source_modified,
				"output": output_path.relative_to(ROOT).as_posix(),
				"generatedAt": datetime.now(timezone.utc).isoformat(),
				"generatorVersion": GENERATOR_VERSION,
				"wordCount": len(frequencies),
				"topWords": list(frequencies.keys())[:12],
			}
			generated += 1
		except Exception as exc:  # noqa: BLE001 - keep processing the rest of the blog.
			failed += 1
			print(f"Warning: failed to generate word cloud for {markdown_path.name}: {exc}", file=sys.stderr)

	save_manifest(manifest)
	print(
		f"Word clouds: scanned {scanned}, generated {generated}, skipped {skipped}, failed {failed}."
	)
	return 1 if failed else 0


if __name__ == "__main__":
	raise SystemExit(main())
