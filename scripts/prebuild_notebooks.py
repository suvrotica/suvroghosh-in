from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "scripts" / "render_notebooks.py"
REQUIRED_MODULES = ("nbconvert", "nbformat")


def main() -> int:
	verification = subprocess.run(
		[sys.executable, str(RENDERER), "--check"],
		cwd=ROOT,
		check=False,
		capture_output=True,
		text=True,
	)
	if verification.returncode == 0:
		print(verification.stdout, end="")
		return 0

	has_renderer = all(importlib.util.find_spec(module) is not None for module in REQUIRED_MODULES)
	if not has_renderer:
		print(verification.stdout, end="")
		print(verification.stderr, end="", file=sys.stderr)
		print(
			"Notebook HTML is missing, stale, or invalid, and rendering dependencies are unavailable. "
			"Run `npm run notebooks:install && npm run notebooks:prepare` and commit the results.",
			file=sys.stderr,
		)
		return verification.returncode

	return subprocess.run(
		[sys.executable, str(RENDERER), "--changed-only"], cwd=ROOT, check=False
	).returncode


if __name__ == "__main__":
	raise SystemExit(main())
