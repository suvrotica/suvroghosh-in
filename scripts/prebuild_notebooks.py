from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "scripts" / "render_notebooks.py"
REQUIRED_MODULES = ("nbconvert", "nbformat")


def main() -> int:
	has_renderer = all(importlib.util.find_spec(module) is not None for module in REQUIRED_MODULES)
	command = [sys.executable, str(RENDERER)]

	if not has_renderer:
		command.append("--check")
		print(
			"Notebook rendering dependencies are unavailable; verifying committed HTML instead."
		)

	return subprocess.run(command, cwd=ROOT, check=False).returncode


if __name__ == "__main__":
	raise SystemExit(main())
