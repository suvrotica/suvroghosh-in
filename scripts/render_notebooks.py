from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
NOTEBOOKS_DIR = ROOT / "src" / "lib" / "notebooks"
OUTPUT_DIR = ROOT / "static" / "notebooks"
RENDERER_VERSION = "2026-07-18.2"
HASH_PATTERN = re.compile(r"source-sha256: ([0-9a-f]{64})")
RENDERER_PATTERN = re.compile(r"renderer: ([0-9-]+\.[0-9]+)")

EMBED_STYLES = """
<style id="suvro-notebook-embed-styles">
	:root {
		color-scheme: only light;
		--jp-layout-color0: #ffffff;
		--jp-layout-color1: #fafafa;
		--jp-layout-color2: #f5f5f5;
		--jp-layout-color3: #e5e5e5;
		--jp-layout-color4: #d4d4d4;
		--jp-content-font-color0: #171717;
		--jp-content-font-color1: #262626;
		--jp-content-font-color2: #525252;
		--jp-content-font-color3: #737373;
		--jp-cell-editor-background: #f5f5f5;
		--jp-border-color0: #a3a3a3;
		--jp-border-color1: #d4d4d4;
		--jp-border-color2: #e5e5e5;
		--jp-border-color3: #f5f5f5;
		--jp-rendermime-table-row-background: #ffffff;
		--jp-rendermime-table-row-hover-background: #f5f5f5;
	}
	html { scroll-behavior: smooth; background: #ffffff; }
	body {
		margin: 0;
		padding: 1.25rem clamp(0.75rem, 3vw, 2rem) 2rem;
		background: #ffffff !important;
		color: #262626 !important;
		font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}
	.jp-Notebook { padding: 0 !important; }
	.jp-Cell {
		margin: 0 0 1.25rem !important;
		border: 1px solid #d4d4d4;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #ffffff !important;
		color: #262626 !important;
	}
	.jp-MarkdownCell { border-color: transparent; }
	.jp-InputArea, .jp-OutputArea-child { padding: 0.75rem !important; }
	.jp-InputArea, .jp-InputArea-editor { background: #f5f5f5 !important; }
	.jp-InputArea-editor { border: 0 !important; color: #171717 !important; }
	.jp-OutputArea, .jp-OutputArea-child, .jp-OutputArea-output {
		background: #ffffff !important;
		color: #171717 !important;
	}
	.jp-RenderedHTMLCommon { color: inherit !important; }
	.jp-RenderedHTMLCommon h1, .jp-RenderedHTMLCommon h2, .jp-RenderedHTMLCommon h3 {
		color: #171717 !important;
	}
	.jp-RenderedHTMLCommon p, .jp-RenderedHTMLCommon li { line-height: 1.7; }
	.jp-RenderedHTMLCommon code {
		background: #f5f5f5 !important;
		color: #171717 !important;
	}
	.jp-RenderedHTMLCommon table { font-size: 0.9rem; color: #171717 !important; }
	.jp-RenderedHTMLCommon th, .jp-RenderedHTMLCommon td {
		background: #ffffff !important;
		color: #171717 !important;
	}
	.jp-OutputArea-output pre { white-space: pre-wrap !important; color: #171717 !important; }
</style>
""".strip()


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Render Mojo-flavoured Jupyter notebooks to isolated, embeddable HTML."
	)
	parser.add_argument(
		"--check",
		action="store_true",
		help="Verify that every notebook has up-to-date generated HTML without importing nbconvert.",
	)
	return parser.parse_args()


def source_hash(path: Path) -> str:
	return hashlib.sha256(path.read_bytes()).hexdigest()


def notebook_files() -> list[Path]:
	if not NOTEBOOKS_DIR.exists():
		return []
	return sorted(NOTEBOOKS_DIR.glob("*.ipynb"))


def validate_notebook_shape(path: Path, notebook: dict[str, Any]) -> None:
	cells = notebook.get("cells")
	if not isinstance(cells, list) or not cells:
		raise ValueError(f"{path.name}: notebook must contain at least one cell.")

	mojo_cells = [
		cell
		for cell in cells
		if cell.get("cell_type") == "code"
		and "".join(cell.get("source", [])).lstrip().startswith("%%mojo")
	]
	if not mojo_cells:
		raise ValueError(f"{path.name}: expected at least one code cell beginning with %%mojo.")

	kernel_name = notebook.get("metadata", {}).get("kernelspec", {}).get("name")
	if kernel_name != "python3":
		raise ValueError(
			f"{path.name}: Mojo notebooks must use the Python kernel so mojo.notebook can register %%mojo."
		)


def generated_marker(path: Path) -> str:
	return (
		f"<!-- Generated from src/lib/notebooks/{path.name}; "
		f"source-sha256: {source_hash(path)}; renderer: {RENDERER_VERSION}. -->"
	)


def verify_outputs() -> int:
	problems: list[str] = []
	files = notebook_files()

	for path in files:
		try:
			notebook = json.loads(path.read_text(encoding="utf-8"))
			validate_notebook_shape(path, notebook)
		except (json.JSONDecodeError, ValueError) as exc:
			problems.append(str(exc))
			continue

		output_path = OUTPUT_DIR / f"{path.stem}.html"
		if not output_path.exists():
			problems.append(f"{path.name}: missing generated HTML at {output_path.relative_to(ROOT)}.")
			continue

		header = output_path.read_text(encoding="utf-8")[:512]
		match = HASH_PATTERN.search(header)
		renderer_match = RENDERER_PATTERN.search(header)
		if not match:
			problems.append(f"{output_path.name}: missing source hash marker.")
		elif match.group(1) != source_hash(path):
			problems.append(f"{output_path.name}: generated HTML is stale; run npm run notebooks:render.")
		if not renderer_match:
			problems.append(f"{output_path.name}: missing renderer version marker.")
		elif renderer_match.group(1) != RENDERER_VERSION:
			problems.append(
				f"{output_path.name}: rendered with {renderer_match.group(1)}, expected {RENDERER_VERSION}; "
				"run npm run notebooks:render."
			)

	if problems:
		print(f"Notebook verification failed with {len(problems)} issue(s):", file=sys.stderr)
		for problem in problems:
			print(f"- {problem}", file=sys.stderr)
		return 1

	print(f"Notebook verification passed: {len(files)} source notebook(s) are rendered.")
	return 0


def render_outputs() -> int:
	try:
		import nbformat
		from nbconvert import HTMLExporter
	except ImportError as exc:
		raise SystemExit(
			"Missing notebook rendering dependencies. Run: npm run notebooks:install"
		) from exc

	OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
	files = notebook_files()

	for path in files:
		notebook = nbformat.read(path, as_version=4)
		validate_notebook_shape(path, notebook)

		exporter = HTMLExporter(template_name="lab")
		exporter.exclude_input_prompt = True
		exporter.exclude_output_prompt = True
		exporter.embed_images = True
		body, _ = exporter.from_notebook_node(
			notebook,
			resources={"metadata": {"name": path.stem}},
		)
		body = body.replace("</head>", f"{EMBED_STYLES}\n</head>", 1)
		body = f"{generated_marker(path)}\n{body}"

		output_path = OUTPUT_DIR / f"{path.stem}.html"
		output_path.write_text(body, encoding="utf-8", newline="\n")
		print(f"Rendered {path.relative_to(ROOT)} -> {output_path.relative_to(ROOT)}")

	return verify_outputs()


def main() -> int:
	args = parse_args()
	return verify_outputs() if args.check else render_outputs()


if __name__ == "__main__":
	raise SystemExit(main())
