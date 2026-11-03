"""Reconcile a local sketch export without modifying it; publish clean lossless masters.

Pillow is already used by the site's image build. Run with --apply to write publication
copies. Perceptual candidates are reported, never silently discarded. Optional reviewed
equivalences use pixel hashes so filename changes cannot silently change a decision.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import struct

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
VERSION = 1


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalise(path: Path) -> Image.Image:
    with Image.open(path) as source:
        if getattr(source, 'n_frames', 1) != 1:
            raise ValueError(f'Animated source requires explicit review: {path.name}')
        image = ImageOps.exif_transpose(source)
        if source.info.get('icc_profile'):
            alpha = image.getchannel('A') if 'A' in image.getbands() else None
            image = ImageCms.profileToProfile(
                image.convert('RGB'), ImageCms.ImageCmsProfile(io.BytesIO(source.info['icc_profile'])),
                ImageCms.createProfile('sRGB'), outputMode='RGB'
            )
            if alpha is not None:
                image.putalpha(alpha)
        return image.convert('RGBA')


def pixel_digest(image: Image.Image) -> str:
    return digest(f'{image.width}x{image.height}:'.encode() + image.tobytes())


def difference_hash(image: Image.Image) -> int:
    grey = image.convert('L')
    horizontal = list(grey.resize((9, 8), Image.Resampling.LANCZOS).tobytes())
    vertical = list(grey.resize((8, 9), Image.Resampling.LANCZOS).tobytes())
    bits = [horizontal[y * 9 + x] > horizontal[y * 9 + x + 1] for y in range(8) for x in range(8)]
    bits += [vertical[y * 8 + x] > vertical[(y + 1) * 8 + x] for y in range(8) for x in range(8)]
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return value


def inspect(path: Path, kind: str, cached: dict | None = None) -> dict:
    raw = path.read_bytes()
    source_hash = digest(raw)
    fields = ('pixelSha256', 'width', 'height', 'differenceHash', 'embeddedMetadata', 'trailingBytes')
    if cached and cached.get('sha256') == source_hash and all(key in cached for key in fields):
        return {**{key: cached[key] for key in fields}, 'kind': kind, 'filename': path.name, 'sha256': source_hash, 'bytes': len(raw)}
    image = normalise(path)
    with Image.open(path) as original:
        metadata = sorted(k for k in original.info if k in {'exif', 'xmp', 'icc_profile', 'comment', 'text'})
    trailing = 0
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        position = 8
        while position + 12 <= len(raw):
            length = struct.unpack('>I', raw[position:position + 4])[0]
            chunk = raw[position + 4:position + 8]
            position += length + 12
            if chunk == b'IEND':
                trailing = len(raw) - position
                break
    return {
        'kind': kind, 'filename': path.name, 'sha256': source_hash,
        'pixelSha256': pixel_digest(image), 'width': image.width, 'height': image.height,
        'bytes': len(raw), 'differenceHash': f'{difference_hash(image):032x}',
        'embeddedMetadata': metadata, 'trailingBytes': trailing,
    }


def encode_master(image: Image.Image, extension: str) -> bytes:
    # A fresh pixel object prevents info/EXIF/XMP/profile propagation. Colour and
    # orientation have already been baked into pixels by normalise().
    clean = Image.frombytes('RGBA', image.size, image.tobytes())
    if clean.getextrema()[3] == (255, 255):
        clean = clean.convert('RGB')
    output = io.BytesIO()
    if extension.lower() == '.png':
        clean.save(output, format='PNG', optimize=True)
    elif extension.lower() == '.webp':
        clean.save(output, format='WEBP', lossless=True, quality=90, method=4, exact=True)
    else:
        raise ValueError(f'Lossless publication master must be PNG or WebP: {extension}')
    return output.getvalue()


def write_changed(path: Path, contents: bytes) -> bool:
    if path.exists() and path.read_bytes() == contents:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(contents)
    temporary.replace(path)
    return True


def find_candidates(records: list[dict]) -> list[dict]:
    unique = {}
    for record in records:
        unique.setdefault(record['pixelSha256'], record)
    items = list(unique.values())
    result = []
    for index, left in enumerate(items):
        for right in items[index + 1:]:
            distance = (int(left['differenceHash'], 16) ^ int(right['differenceHash'], 16)).bit_count()
            # Conservative retrieval, not a merge rule. Also finds differently sized
            # copies. Cropped/rotated/reworked versions still require visual review.
            if distance <= 12:
                result.append({
                    'left': {'kind': left['kind'], 'filename': left['filename'], 'pixelSha256': left['pixelSha256']},
                    'right': {'kind': right['kind'], 'filename': right['filename'], 'pixelSha256': right['pixelSha256']},
                    'distance': distance, 'status': 'needs-visual-review',
                })
    return sorted(result, key=lambda pair: (pair['distance'], pair['left']['filename'], pair['right']['filename']))


def reconcile(source: Path, repository: Path, report_path: Path, apply: bool, review_path: Path | None = None, workers: int = 4, audit_output: Path | None = None) -> dict:
    source, repository = source.resolve(), repository.resolve()
    if source == repository or source in repository.parents or repository in source.parents:
        raise ValueError('Source and publication folders must be separate and non-nested.')
    if not source.is_dir() or not repository.is_dir():
        raise ValueError('Both source and publication directories must exist.')
    output_path = report_path if apply else audit_output
    if output_path is not None:
        resolved_output = output_path.resolve()
        if source in resolved_output.parents or repository in resolved_output.parents:
            raise ValueError('Report output must stay outside source originals and public image directories.')
    local_paths = sorted(path for path in source.rglob('*') if path.is_file() and path.suffix.lower() in EXTENSIONS)
    input_paths_by_name = {path.name: path for path in local_paths}
    if len({p.name.casefold() for p in local_paths}) != len(local_paths):
        raise ValueError('Repeated basenames in nested source folders require explicit naming review.')
    existing_paths = sorted(path for path in repository.iterdir() if path.is_file() and path.suffix.lower() in EXTENSIONS)
    if any(path.suffix.lower() not in {'.png', '.webp'} for path in existing_paths):
        raise ValueError('Existing non-PNG/WebP masters require an explicit URL-preserving lossless migration.')
    previous = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {}
    previous_inputs = {record['filename']: record for record in previous.get('inputs', [])}
    previous_masters = {record['filename']: record for record in previous.get('publicMasters', [])}
    jobs = [(p, 'existing', previous_masters.get(p.name)) for p in existing_paths] + [(p, 'input', previous_inputs.get(p.name)) for p in local_paths]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        records = list(pool.map(lambda item: inspect(*item), jobs))
    existing = records[:len(existing_paths)]
    inputs = records[len(existing_paths):]
    baseline = previous.get('baselineExistingSources', [record['filename'] for record in existing])
    original_inputs = {record['filename']: record for record in previous.get('inputs', [])}
    canonical = {}
    for record in existing:
        if record['pixelSha256'] in canonical:
            raise ValueError('Existing artwork duplicates require explicit slug-preserving review.')
        canonical[record['pixelSha256']] = record

    reviewed = json.loads(review_path.read_text(encoding='utf-8')) if review_path and review_path.exists() else {'equivalences': []}
    aliases = {}
    known = {record['pixelSha256'] for record in records}
    for decision in reviewed.get('equivalences', []):
        duplicate, keep = decision['duplicatePixelSha256'], decision['keepPixelSha256']
        if duplicate not in known or keep not in known or duplicate == keep or not decision.get('reason'):
            raise ValueError('Reviewed equivalence must identify two current pixel hashes and a reason.')
        if duplicate in canonical:
            raise ValueError('Review cannot remove an existing public artwork/slug automatically.')
        aliases[duplicate] = keep
    def representative(key):
        visited = set()
        while key in aliases:
            if key in visited:
                raise ValueError('Cycle in reviewed equivalences.')
            visited.add(key)
            key = aliases[key]
        return key

    input_by_hash = {record['pixelSha256']: record for record in reversed(inputs)}
    planned = []
    for record in inputs:
        key = representative(record['pixelSha256'])
        if key in canonical:
            continue
        chosen = input_by_hash[key]
        filename = f"sketch-{key[:16]}.webp"
        if (repository / filename).exists():
            raise ValueError(f'Unexpected canonical filename collision: {filename}')
        canonical[key] = {**chosen, 'filename': filename, 'sourceFilename': chosen['filename']}
        planned.append(canonical[key])

    writes = 0
    if apply:
        def publish(job):
            path, destination = job
            before = normalise(path)
            encoded = encode_master(before, destination.suffix)
            with Image.open(io.BytesIO(encoded)) as candidate:
                if pixel_digest(candidate.convert('RGBA')) != pixel_digest(before):
                    raise ValueError(f'Lossless verification failed: {destination.name}')
            return int(write_changed(destination, encoded))
        unchanged_masters = {record['filename'] for record in existing if previous_masters.get(record['filename'], {}).get('sha256') == record['sha256']}
        publish_jobs = [(p, p) for p in existing_paths if p.name not in unchanged_masters] + [(input_paths_by_name[record['sourceFilename']], repository / record['filename']) for record in planned]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for changed in pool.map(publish, publish_jobs):
                writes += changed
        sidecars = []
        for record in existing:
            path = repository / (Path(record['filename']).stem + '.json')
            value = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
            sidecars.append((path, value))
        next_order = max((value.get('galleryOrder', -1) for _, value in sidecars), default=-1) + 1
        for path, value in sorted(sidecars, key=lambda pair: (not pair[1].get('featured', False), pair[1].get('slug', pair[0].stem))):
            if 'galleryOrder' not in value:
                value['galleryOrder'] = next_order
                next_order += 1
                write_changed(path, (json.dumps(value, indent=2) + '\n').encode())
        next_number = len(existing) + 1
        for record in planned:
            sidecar = repository / (Path(record['filename']).stem + '.json')
            number = next_number
            next_number += 1
            # Untitled works are deliberately marked incomplete via empty alt; no
            # subject, date, medium history, or artist intention is guessed.
            metadata = {
                'slug': Path(record['filename']).stem, 'title': f'Sketch {number:04d}',
                'description': '', 'alt': '', 'date': None, 'medium': 'Digital sketch',
                'room': None, 'featured': False, 'canvasMode': 'original', 'galleryOrder': next_order,
            }
            next_order += 1
            if not sidecar.exists():
                write_changed(sidecar, (json.dumps(metadata, indent=2) + '\n').encode())

    input_report = []
    for record in inputs:
        key = representative(record['pixelSha256'])
        selected = canonical[key]
        prior = original_inputs.get(record['filename'], {})
        action = prior.get('action') if prior.get('sha256') == record['sha256'] else None
        if not action:
            action = 'already-present' if selected['filename'] in baseline else ('included' if selected.get('sourceFilename') == record['filename'] else 'duplicate-of-included')
            if key != record['pixelSha256']:
                action = 'reviewed-duplicate'
        input_report.append({**record, 'action': action, 'canonicalSource': selected['filename'], 'match': 'reviewed-visual-equivalence' if key != record['pixelSha256'] else 'normalised-pixel-equality'})
    candidates = find_candidates(records)
    distinct = {frozenset((d['leftPixelSha256'], d['rightPixelSha256'])): d['reason'] for d in reviewed.get('distinct', [])}
    for pair in candidates:
        if representative(pair['left']['pixelSha256']) == representative(pair['right']['pixelSha256']):
            pair['status'] = 'reviewed-equivalent'
        elif frozenset((pair['left']['pixelSha256'], pair['right']['pixelSha256'])) in distinct:
            pair['status'] = 'reviewed-distinct'
            pair['reason'] = distinct[frozenset((pair['left']['pixelSha256'], pair['right']['pixelSha256']))]
    output_records = []
    if apply:
        for record in canonical.values():
            path = repository / record['filename']
            output_records.append({
                'filename': path.name, 'sha256': digest(path.read_bytes()), 'bytes': path.stat().st_size,
                **{key: record[key] for key in ('pixelSha256', 'width', 'height', 'differenceHash')},
                'embeddedMetadata': [], 'trailingBytes': 0,
            })
    report = {
        'version': VERSION, 'sourceFolder': source.name, 'applied': apply,
        'baselineExistingSources': baseline,
        'summary': {
            'inputFiles': len(inputs), 'inputBytes': sum(r['bytes'] for r in inputs),
            'distinctInputFileHashes': len({r['sha256'] for r in inputs}),
            'distinctInputPixelHashes': len({r['pixelSha256'] for r in inputs}),
            'baselineExistingArtworks': len(baseline), 'canonicalArtworks': len(canonical),
            'publicMasterBytes': sum(r['bytes'] for r in output_records),
            'perceptualCandidates': len(candidates),
            'unreviewedPerceptualCandidates': sum(p['status'] == 'needs-visual-review' for p in candidates),
        },
        'limits': 'Exact equality is enforced. Difference-hash candidates are not proof of duplicates; crops, rotations and reworked drawings require visual review. Untitled imports have intentionally incomplete editorial descriptions.',
        'inputs': input_report, 'publicMasters': output_records, 'perceptualCandidates': candidates,
    }
    if output_path is not None:
        write_changed(output_path, (json.dumps(report, indent=2) + '\n').encode())
    print(json.dumps({**report['summary'], 'masterFilesChangedThisRun': writes, 'applied': apply}, indent=2), flush=True)
    if output_path is not None:
        print(f"{'Applied' if apply else 'Audit'} report: {output_path.resolve()}", flush=True)
    if report['summary']['unreviewedPerceptualCandidates']:
        print('Visual review is still required for the candidate pairs marked needs-visual-review; applying an import does not mark them reviewed.', flush=True)
    return report


def main(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--repository', type=Path, default=ROOT / 'static' / 'sketch')
    parser.add_argument('--report', type=Path, help='Report output. Defaults to .tmp/sketch-import-audit.json for a dry run, or scripts/sketch-import-report.json with --apply. A dry run overwrites the applied report only if explicitly pointed there.')
    parser.add_argument('--review', type=Path, default=ROOT / 'scripts' / 'sketch-duplicate-review.json')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 9))
    args = parser.parse_args(argv)
    applied_report = ROOT / 'scripts' / 'sketch-import-report.json'
    report_path = (args.report or applied_report) if args.apply else applied_report
    audit_output = None if args.apply else (args.report or ROOT / '.tmp' / 'sketch-import-audit.json')
    return reconcile(args.source, args.repository, report_path, args.apply, args.review, args.workers, audit_output)


if __name__ == '__main__':
    main()
