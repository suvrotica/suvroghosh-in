from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path


REQUIRED_MODULES = {
	"wordcloud": "wordcloud",
	"PIL": "Pillow",
	"numpy": "numpy",
	"yaml": "PyYAML",
}


def missing_packages() -> list[str]:
	missing = []
	for module_name, package_name in REQUIRED_MODULES.items():
		if importlib.util.find_spec(module_name) is None:
			missing.append(package_name)
	return missing


def main() -> int:
	missing = missing_packages()
	if not missing:
		print("Word cloud Python dependencies already installed.")
		return 0

	requirements = Path(__file__).resolve().parents[1] / "requirements-wordcloud.txt"
	print(f"Installing missing word cloud Python dependencies: {', '.join(missing)}")
	subprocess.check_call(
		[
			sys.executable,
			"-m",
			"pip",
			"install",
			"--user",
			"-r",
			str(requirements),
		]
	)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
