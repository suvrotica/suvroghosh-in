import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, PngImagePlugin

SPEC = importlib.util.spec_from_file_location('reconcile_sketches', Path(__file__).with_name('reconcile-sketches.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SketchReconciliationTests(unittest.TestCase):
    def test_deduplicates_pixels_strips_public_payload_and_preserves_originals(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, public = root / 'Original', root / 'public'
            source.mkdir()
            public.mkdir()
            first = Image.new('RGB', (24, 32), 'white')
            for y in range(10, 20):
                first.putpixel((12, y), (0, 0, 0))
            private = PngImagePlugin.PngInfo()
            private.add_text('Comment', 'Private source comment')
            first.save(source / 'one.png', pnginfo=private)
            first.save(source / 'same-art-different-bytes.png')
            first.save(public / 'existing.png', pnginfo=private)
            (public / 'existing.png').write_bytes((public / 'existing.png').read_bytes() + b'opaque application payload')
            second = Image.new('RGBA', (32, 24), (0, 128, 255, 128))
            second.save(source / 'two.png', pnginfo=private)
            originals = {p.name: p.read_bytes() for p in source.iterdir()}
            report = root / 'report.json'
            with contextlib.redirect_stdout(io.StringIO()):
                result = MODULE.reconcile(source, public, report, True, workers=1)
            self.assertEqual(result['summary']['canonicalArtworks'], 2)
            self.assertEqual(len(result['inputs']), 3)
            self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, originals)
            self.assertEqual(len(list(public.glob('*.webp'))), 1)
            self.assertEqual(MODULE.inspect(public / 'existing.png', 'existing')['trailingBytes'], 0)
            for p in [*public.glob('*.png'), *public.glob('*.webp')]:
                with Image.open(p) as clean:
                    self.assertFalse(set(clean.info) & {'exif', 'xmp', 'icc_profile', 'Comment'})
            self.assertEqual(MODULE.pixel_digest(MODULE.normalise(public / 'existing.png')), MODULE.pixel_digest(MODULE.normalise(source / 'one.png')))
            before = {p.name: p.read_bytes() for p in public.iterdir()}
            with contextlib.redirect_stdout(io.StringIO()):
                again = MODULE.reconcile(source, public, report, True, workers=1)
            self.assertEqual(again['summary']['canonicalArtworks'], 2)
            self.assertEqual(before, {p.name: p.read_bytes() for p in public.iterdir()})

    def test_dry_run_never_changes_source_or_public_assets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, public = root / 'Original', root / 'public'
            source.mkdir()
            public.mkdir()
            Image.new('RGB', (16, 16), 'red').save(source / 'new.png')
            with contextlib.redirect_stdout(io.StringIO()):
                result = MODULE.reconcile(source, public, root / 'report.json', False, workers=1)
            self.assertEqual(result['summary']['canonicalArtworks'], 1)
            self.assertEqual(list(public.iterdir()), [])
            self.assertFalse((root / 'report.json').exists())

    def test_visual_similarity_is_not_automatic_duplicate_evidence(self):
        records = [
            {'pixelSha256': 'a', 'differenceHash': '0', 'kind': 'input', 'filename': 'a.png'},
            {'pixelSha256': 'b', 'differenceHash': '0', 'kind': 'input', 'filename': 'b.png'},
        ]
        candidates = MODULE.find_candidates(records)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['status'], 'needs-visual-review')

    def test_cli_dry_run_writes_candidate_details_without_overwriting_applied_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, public = root / 'Original', root / 'static' / 'sketch'
            source.mkdir()
            public.mkdir(parents=True)
            (root / 'scripts').mkdir()
            Image.new('RGB', (16, 16), 'red').save(source / 'red.png')
            Image.new('RGB', (16, 16), 'blue').save(source / 'blue.png')
            applied_path = root / 'scripts' / 'sketch-import-report.json'
            applied_bytes = b'{"applied": true, "baselineExistingSources": []}\n'
            applied_path.write_bytes(applied_bytes)
            original_bytes = {p.name: p.read_bytes() for p in source.iterdir()}
            with patch.object(MODULE, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                MODULE.main(['--source', str(source)])
            audit_path = root / '.tmp' / 'sketch-import-audit.json'
            audit = json.loads(audit_path.read_text())
            self.assertFalse(audit['applied'])
            self.assertEqual(len(audit['inputs']), 2)
            self.assertEqual(audit['summary']['unreviewedPerceptualCandidates'], 1)
            candidate = audit['perceptualCandidates'][0]
            self.assertEqual(candidate['status'], 'needs-visual-review')
            self.assertEqual({candidate['left']['filename'], candidate['right']['filename']}, {'red.png', 'blue.png'})
            self.assertEqual(applied_path.read_bytes(), applied_bytes)
            self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, original_bytes)
            self.assertEqual(list(public.iterdir()), [])
            custom = root / 'review' / 'candidates.json'
            with patch.object(MODULE, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                MODULE.main(['--source', str(source), '--report', str(custom)])
            self.assertEqual(json.loads(custom.read_text()), audit)
            self.assertEqual(applied_path.read_bytes(), applied_bytes)

    def test_apply_preserves_unreviewed_candidate_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, public = root / 'Original', root / 'public'
            source.mkdir()
            public.mkdir()
            Image.new('RGB', (16, 16), 'red').save(source / 'red.png')
            Image.new('RGB', (16, 16), 'blue').save(source / 'blue.png')
            with contextlib.redirect_stdout(io.StringIO()) as log:
                report = MODULE.reconcile(source, public, root / 'report.json', True, workers=1)
            self.assertEqual(report['summary']['unreviewedPerceptualCandidates'], 1)
            self.assertEqual(report['perceptualCandidates'][0]['status'], 'needs-visual-review')
            self.assertIn('does not mark them reviewed', log.getvalue())

    def test_overlapping_source_and_public_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, 'separate and non-nested'):
                MODULE.reconcile(Path(temporary), Path(temporary), Path(temporary) / 'report.json', True)

    def test_orientation_is_baked_in_before_metadata_is_removed(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'oriented.png'
            source = Image.new('RGB', (12, 20), 'white')
            source.putpixel((0, 0), (255, 0, 0))
            exif = Image.Exif()
            exif[274] = 6
            source.save(path, exif=exif)
            normal = MODULE.normalise(path)
            self.assertEqual(normal.size, (20, 12))
            encoded = MODULE.encode_master(normal, '.webp')
            with Image.open(io.BytesIO(encoded)) as clean:
                self.assertEqual(clean.size, normal.size)
                self.assertFalse(clean.getexif())
                self.assertEqual(MODULE.pixel_digest(clean.convert('RGBA')), MODULE.pixel_digest(normal))


if __name__ == '__main__':
    unittest.main()
