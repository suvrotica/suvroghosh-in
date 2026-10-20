from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from scripts import prebuild_notebooks, render_notebooks


class NotebookPreparationTests(unittest.TestCase):
	def setUp(self) -> None:
		self.temporary_directory = tempfile.TemporaryDirectory()
		self.addCleanup(self.temporary_directory.cleanup)
		self.root = Path(self.temporary_directory.name)
		self.sources = self.root / "src" / "lib" / "notebooks"
		self.outputs = self.root / "static" / "notebooks"
		self.sources.mkdir(parents=True)
		self.outputs.mkdir(parents=True)
		self.rendered: list[str] = []
		self.stack = ExitStack()
		self.addCleanup(self.stack.close)
		self.stack.enter_context(patch.object(render_notebooks, "ROOT", self.root))
		self.stack.enter_context(patch.object(render_notebooks, "NOTEBOOKS_DIR", self.sources))
		self.stack.enter_context(patch.object(render_notebooks, "OUTPUT_DIR", self.outputs))
		self.stdout = io.StringIO()
		self.stderr = io.StringIO()
		self.stack.enter_context(redirect_stdout(self.stdout))
		self.stack.enter_context(redirect_stderr(self.stderr))

	def create_source(self, name: str, message: str = "initial") -> Path:
		path = self.sources / f"{name}.ipynb"
		path.write_text(
			json.dumps(
				{
					"cells": [{"cell_type": "code", "source": [f'%%mojo\nprint("{message}")\n']}],
					"metadata": {"kernelspec": {"name": "python3"}},
					"nbformat": 4,
					"nbformat_minor": 5,
				}
			),
			encoding="utf-8",
		)
		return path

	def create_output(self, source: Path) -> Path:
		path = self.outputs / f"{source.stem}.html"
		path.write_text(
			f"{render_notebooks.generated_marker(source)}\n<html><head></head><body>committed</body></html>",
			encoding="utf-8",
		)
		fixed_time = 1_700_000_000_000_000_000
		os.utime(path, ns=(fixed_time, fixed_time))
		return path

	def mock_renderer_modules(self) -> None:
		nbformat = types.ModuleType("nbformat")
		nbformat.read = lambda path, as_version: json.loads(Path(path).read_text(encoding="utf-8"))
		nbconvert = types.ModuleType("nbconvert")
		rendered = self.rendered

		class FakeHTMLExporter:
			def __init__(self, template_name: str) -> None:
				if template_name != "lab":
					raise AssertionError("Notebook renderer must retain its existing lab template.")

			def from_notebook_node(self, notebook, resources):
				name = resources["metadata"]["name"]
				rendered.append(name)
				return f"<html><head></head><body>rendered {name}</body></html>", {}

		nbconvert.HTMLExporter = FakeHTMLExporter
		self.stack.enter_context(patch.dict(sys.modules, {"nbformat": nbformat, "nbconvert": nbconvert}))

	def run_renderer_command(self, command, **kwargs):
		if command[-1] == "--check":
			stdout = io.StringIO()
			stderr = io.StringIO()
			with redirect_stdout(stdout), redirect_stderr(stderr):
				returncode = render_notebooks.verify_outputs()
			return subprocess.CompletedProcess(command, returncode, stdout.getvalue(), stderr.getvalue())
		self.assertEqual(command[-1], "--changed-only")
		return subprocess.CompletedProcess(command, render_notebooks.render_outputs(changed_only=True))

	def test_fresh_preparation_keeps_output_bytes_and_mtime_without_renderer_dependencies(self) -> None:
		output = self.create_output(self.create_source("fresh"))
		before = (output.read_bytes(), output.stat().st_mtime_ns)
		with patch.object(prebuild_notebooks.subprocess, "run", side_effect=self.run_renderer_command) as run:
			with patch.object(prebuild_notebooks.importlib.util, "find_spec") as find_spec:
				self.assertEqual(prebuild_notebooks.main(), 0)
				find_spec.assert_not_called()
		self.assertEqual(run.call_count, 1)
		self.assertEqual((output.read_bytes(), output.stat().st_mtime_ns), before)
		self.assertIn("Notebook verification passed", self.stdout.getvalue())

	def test_changed_only_skips_fresh_output_without_importing_renderer(self) -> None:
		output = self.create_output(self.create_source("fresh"))
		before = (output.read_bytes(), output.stat().st_mtime_ns)
		with patch.dict(sys.modules, {"nbformat": None, "nbconvert": None}):
			self.assertEqual(render_notebooks.render_outputs(changed_only=True), 0)
		self.assertEqual((output.read_bytes(), output.stat().st_mtime_ns), before)

	def test_changed_source_renders_only_that_notebook(self) -> None:
		fresh_output = self.create_output(self.create_source("fresh"))
		before = (fresh_output.read_bytes(), fresh_output.stat().st_mtime_ns)
		changed_source = self.create_source("changed")
		self.create_output(changed_source)
		self.create_source("changed", message="revised")
		self.mock_renderer_modules()
		with patch.object(prebuild_notebooks.subprocess, "run", side_effect=self.run_renderer_command) as run:
			with patch.object(prebuild_notebooks.importlib.util, "find_spec", return_value=object()):
				self.assertEqual(prebuild_notebooks.main(), 0)
		self.assertEqual(run.call_count, 2)
		self.assertEqual(self.rendered, ["changed"])
		self.assertEqual((fresh_output.read_bytes(), fresh_output.stat().st_mtime_ns), before)
		self.assertEqual(render_notebooks.verify_outputs(), 0)

	def test_missing_output_is_rendered(self) -> None:
		self.create_source("missing")
		self.mock_renderer_modules()
		self.assertEqual(render_notebooks.render_outputs(changed_only=True), 0)
		self.assertEqual(self.rendered, ["missing"])
		self.assertTrue((self.outputs / "missing.html").exists())

	def test_renderer_version_mismatch_is_rendered(self) -> None:
		output = self.create_output(self.create_source("old-version"))
		output.write_text(
			output.read_text(encoding="utf-8").replace(render_notebooks.RENDERER_VERSION, "2000-01-01.1"),
			encoding="utf-8",
		)
		self.mock_renderer_modules()
		self.assertEqual(render_notebooks.render_outputs(changed_only=True), 0)
		self.assertEqual(self.rendered, ["old-version"])
		self.assertIn(render_notebooks.RENDERER_VERSION, output.read_text(encoding="utf-8"))

	def test_missing_hash_marker_is_rendered(self) -> None:
		output = self.create_output(self.create_source("missing-marker"))
		output.write_text("<html><head></head><body>unmarked</body></html>", encoding="utf-8")
		self.mock_renderer_modules()
		self.assertEqual(render_notebooks.render_outputs(changed_only=True), 0)
		self.assertEqual(self.rendered, ["missing-marker"])

	def test_missing_dependencies_fail_for_stale_output_without_modifying_it(self) -> None:
		source = self.create_source("stale")
		output = self.create_output(source)
		before = (output.read_bytes(), output.stat().st_mtime_ns)
		self.create_source("stale", message="revised")
		with patch.object(prebuild_notebooks.subprocess, "run", side_effect=self.run_renderer_command) as run:
			with patch.object(prebuild_notebooks.importlib.util, "find_spec", return_value=None):
				self.assertNotEqual(prebuild_notebooks.main(), 0)
		self.assertEqual(run.call_count, 1)
		self.assertEqual((output.read_bytes(), output.stat().st_mtime_ns), before)
		self.assertIn("generated HTML is stale", self.stderr.getvalue())
		self.assertIn("rendering dependencies are unavailable", self.stderr.getvalue())

	def test_invalid_source_fails_before_rendering_other_notebooks(self) -> None:
		self.create_source("missing")
		invalid = self.sources / "invalid.ipynb"
		invalid.write_text(json.dumps({"cells": []}), encoding="utf-8")
		self.mock_renderer_modules()
		self.assertNotEqual(render_notebooks.render_outputs(changed_only=True), 0)
		self.assertEqual(self.rendered, [])
		self.assertFalse((self.outputs / "missing.html").exists())
		self.assertIn("notebook must contain at least one cell", self.stderr.getvalue())

	def test_invalid_json_does_not_pass_preparation_without_dependencies(self) -> None:
		(self.sources / "invalid.ipynb").write_text("{", encoding="utf-8")
		with patch.object(prebuild_notebooks.subprocess, "run", side_effect=self.run_renderer_command):
			with patch.object(prebuild_notebooks.importlib.util, "find_spec", return_value=None):
				self.assertNotEqual(prebuild_notebooks.main(), 0)
		self.assertIn("invalid.ipynb", self.stderr.getvalue())

	def test_malformed_notebook_shapes_fail_verification(self) -> None:
		invalid = self.sources / "invalid.ipynb"
		for notebook in (
			[],
			{"cells": [None]},
			{"cells": [{"cell_type": "code", "source": [None]}]},
			{"cells": [{"cell_type": "code", "source": "print(1)"}]},
			{"cells": [{"cell_type": "code", "source": "%%mojo"}], "metadata": []},
		):
			with self.subTest(notebook=notebook):
				invalid.write_text(json.dumps(notebook), encoding="utf-8")
				self.assertNotEqual(render_notebooks.verify_outputs(), 0)

	def test_explicit_full_render_refreshes_current_output(self) -> None:
		output = self.create_output(self.create_source("fresh"))
		before = output.read_bytes()
		self.mock_renderer_modules()
		self.assertEqual(render_notebooks.render_outputs(), 0)
		self.assertEqual(self.rendered, ["fresh"])
		self.assertNotEqual(output.read_bytes(), before)

	def test_check_and_changed_only_cli_modes_are_exclusive(self) -> None:
		with patch.object(sys, "argv", ["render_notebooks.py", "--check", "--changed-only"]):
			with self.assertRaises(SystemExit) as error:
				render_notebooks.parse_args()
		self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
	unittest.main()
