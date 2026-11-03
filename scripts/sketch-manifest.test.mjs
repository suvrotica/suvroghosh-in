import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
	discoverSketchSources,
	assertCleanSketchSource,
	generateSketchArtifacts,
	renderSketchManifestModule,
	validateSketchMetadata
} from './lib/sketch-manifest.mjs';

function hash(value) {
	return createHash('sha256').update(value).digest('hex');
}

function cleanPngFixture(bytes) {
	const parts = [bytes.subarray(0, 8)];
	for (let offset = 8; offset + 12 <= bytes.length; ) {
		const length = bytes.readUInt32BE(offset) + 12;
		const type = bytes.toString('ascii', offset + 4, offset + 8);
		if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'].includes(type))
			parts.push(bytes.subarray(offset, offset + length));
		offset += length;
	}
	return Buffer.concat(parts);
}

function relativePaths(root, paths) {
	return paths.map((path) => relative(root, path).split(sep).join('/'));
}

async function temporaryDirectory(t) {
	const directory = await mkdtemp(join(tmpdir(), 'sketch-manifest-'));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
	});
	return directory;
}

test('discovers supported sketch sources deterministically and excludes generated assets', async (t) => {
	const sketchDirectory = await temporaryDirectory(t);
	await mkdir(join(sketchDirectory, '_generated', 'ignored'), { recursive: true });
	await mkdir(join(sketchDirectory, 'nested'), { recursive: true });
	await Promise.all([
		writeFile(join(sketchDirectory, 'b-tree.JPG'), 'source'),
		writeFile(join(sketchDirectory, 'A-river.png'), 'source'),
		writeFile(join(sketchDirectory, 'notes.json'), '{}'),
		writeFile(join(sketchDirectory, 'readme.txt'), 'not an image'),
		writeFile(join(sketchDirectory, 'nested', 'square.webp'), 'source'),
		writeFile(join(sketchDirectory, '_generated', 'ignored', 'thumbnail.webp'), 'derived')
	]);

	const first = await discoverSketchSources(sketchDirectory);
	const second = await discoverSketchSources(sketchDirectory);
	assert.deepEqual(relativePaths(sketchDirectory, first), [
		'A-river.png',
		'b-tree.JPG',
		'nested/square.webp'
	]);
	assert.deepEqual(first, second);
});

test('metadata fallbacks are factual and incomplete metadata remains flagged', () => {
	const fallback = validateSketchMetadata(undefined, {
		sourcePath: '/tmp/quiet_tree-study.PNG',
		orientation: 'portrait',
		sidecarExists: false
	});
	assert.deepEqual(fallback, {
		slug: 'quiet-tree-study',
		title: 'Quiet Tree Study',
		description: '',
		alt: '',
		date: null,
		medium: null,
		orientation: 'portrait',
		room: null,
		featured: false,
		needsMetadata: true,
		canvasMode: 'ink'
	});

	const complete = validateSketchMetadata(
		{
			slug: 'quiet-tree',
			title: 'Quiet Tree',
			description: 'A monochrome digital sketch of a tree.',
			alt: 'A spreading tree drawn in dark lines on a pale background.',
			date: '2024-07-24',
			medium: 'Digital sketch',
			orientation: 'landscape',
			room: 'opening-gallery',
			featured: true,
			canvasMode: 'original'
		},
		{
			sourcePath: '/tmp/quiet-tree.png',
			orientation: 'landscape',
			sidecarExists: true
		}
	);
	assert.equal(complete.needsMetadata, false);
	assert.equal(complete.canvasMode, 'original');
	assert.equal(complete.date, '2024-07-24');
});

test('metadata validation rejects ambiguous or structurally invalid values', () => {
	const context = {
		sourcePath: '/tmp/tree.png',
		orientation: 'landscape',
		sidecarExists: true
	};
	assert.throws(
		() => validateSketchMetadata({ title: 'Tree', alt: 'Tree.', date: '2024-02-30' }, context),
		/not a valid calendar date/
	);
	assert.throws(
		() => validateSketchMetadata({ title: 'Tree', alt: 'Tree.', orientation: 'portrait' }, context),
		/does not match the image orientation/
	);
	assert.throws(
		() => validateSketchMetadata({ slug: 'Not A Slug', title: 'Tree', alt: 'Tree.' }, context),
		/lower-case kebab-case/
	);
	assert.throws(
		() => validateSketchMetadata({ title: 'Tree', alt: 'Tree.', inventedDate: true }, context),
		/unknown metadata field/
	);
	assert.throws(
		() => validateSketchMetadata({ title: 'Tree', alt: 'Tree.', featured: 'yes' }, context),
		/must be a boolean/
	);
});

test('artifact generation is deterministic, conservative, and never rewrites the source', async (t) => {
	const root = await temporaryDirectory(t);
	const sketchDirectory = join(root, 'static', 'sketch');
	const cachePath = join(root, 'sketch-generation-manifest.json');
	await mkdir(sketchDirectory, { recursive: true });
	const sourcePath = join(sketchDirectory, 'quiet-landscape.png');
	const fixturePixels = await sharp({
		create: {
			width: 1200,
			height: 800,
			channels: 3,
			background: { r: 249, g: 248, b: 245 }
		}
	})
		.composite([
			{
				input: Buffer.from(
					'<svg width="1200" height="800"><path d="M120 620 Q420 100 1080 570" fill="none" stroke="#292724" stroke-width="5"/></svg>'
				)
			}
		])
		.raw()
		.toBuffer({ resolveWithObject: true });
	await writeFile(
		sourcePath,
		cleanPngFixture(await sharp(fixturePixels.data, { raw: fixturePixels.info }).png().toBuffer())
	);
	await writeFile(
		join(sketchDirectory, 'quiet-landscape.json'),
		`${JSON.stringify(
			{
				title: 'Quiet Landscape',
				description: 'A dark curved line across a pale field.',
				alt: 'A dark curved line rising and falling across a pale background.',
				medium: 'Digital sketch',
				orientation: 'landscape',
				canvasMode: 'ink'
			},
			null,
			2
		)}\n`
	);

	const sourceBefore = await readFile(sourcePath);
	const first = await generateSketchArtifacts({ sketchDirectory, cachePath });
	const firstModule = renderSketchManifestModule(first.manifest);
	const variantPaths = ['thumbnail', 'preview', 'museum', 'detail'].map((name) =>
		join(sketchDirectory, '_generated', 'quiet-landscape', `${name}.webp`)
	);
	const firstVariantHashes = await Promise.all(
		variantPaths.map(async (path) => hash(await readFile(path)))
	);

	assert.equal(first.changedVariants, 4);
	assert.equal(first.cachedSketches, 0);
	assert.equal(first.renderedVariants, 4);
	assert.equal(first.manifest.length, 1);
	assert.deepEqual(first.manifest[0].source, {
		src: `/sketch/quiet-landscape.png?v=${hash(sourceBefore).slice(0, 16)}`,
		width: 1200,
		height: 800,
		bytes: sourceBefore.length
	});
	assert.deepEqual(
		Object.fromEntries(
			Object.entries(first.manifest[0].variants).map(([name, variant]) => [
				name,
				[variant.width, variant.height]
			])
		),
		{
			thumbnail: [384, 256],
			preview: [896, 597],
			museum: [1200, 800],
			detail: [1200, 800]
		}
	);

	const second = await generateSketchArtifacts({ sketchDirectory, cachePath });
	const secondVariantHashes = await Promise.all(
		variantPaths.map(async (path) => hash(await readFile(path)))
	);
	assert.equal(second.changedVariants, 0);
	assert.equal(second.cachedSketches, 1);
	assert.equal(second.renderedVariants, 0);
	assert.deepEqual(second.manifest, first.manifest);
	assert.equal(renderSketchManifestModule(second.manifest), firstModule);
	assert.deepEqual(secondVariantHashes, firstVariantHashes);
	assert.ok((await readFile(sourcePath)).equals(sourceBefore));

	const verified = await generateSketchArtifacts({
		sketchDirectory,
		cachePath,
		verifyOnly: true
	});
	assert.equal(verified.changedVariants, 0);
	assert.equal(verified.cachedSketches, 1);
	assert.equal(verified.renderedVariants, 0);
	assert.deepEqual(verified.manifest, first.manifest);
	for (const [name, variant] of Object.entries(first.manifest[0].variants)) {
		const bytes = await readFile(
			join(sketchDirectory, '_generated', 'quiet-landscape', `${name}.webp`)
		);
		assert.ok(variant.src.endsWith(`?v=${hash(bytes).slice(0, 16)}`));
		const metadata = await sharp(bytes).metadata();
		assert.equal(metadata.exif, undefined);
		assert.equal(metadata.xmp, undefined);
		assert.equal(metadata.icc, undefined);
	}
});

test('append-only gallery order is preserved and invalid orders are rejected', () => {
	const context = { sourcePath: '/tmp/tree.png', orientation: 'portrait', sidecarExists: true };
	assert.equal(
		validateSketchMetadata({ title: 'Tree', alt: 'A tree.', galleryOrder: 81 }, context)
			.galleryOrder,
		81
	);
	for (const galleryOrder of [-1, 1.5, '81', Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => validateSketchMetadata({ galleryOrder }, context), /galleryOrder/);
	}
});

test('publication verification rejects embedded metadata and trailing application payloads', async () => {
	const clean = cleanPngFixture(
		await sharp({ create: { width: 16, height: 16, channels: 3, background: 'white' } })
			.png()
			.toBuffer()
	);
	assert.doesNotThrow(() => assertCleanSketchSource(clean, {}, 'clean.png'));
	assert.throws(
		() =>
			assertCleanSketchSource(
				Buffer.concat([clean, Buffer.from('private payload')]),
				{},
				'dirty.png'
			),
		/trailing PNG/
	);
	assert.throws(
		() => assertCleanSketchSource(clean, { exif: Buffer.from('private') }, 'dirty.png'),
		/embedded metadata/
	);
});

test('same artwork encoded in different formats is rejected before duplicate publication', async (t) => {
	const root = await temporaryDirectory(t);
	const image = sharp({ create: { width: 20, height: 30, channels: 3, background: '#112233' } });
	await writeFile(join(root, 'first.png'), cleanPngFixture(await image.clone().png().toBuffer()));
	await image.clone().webp({ lossless: true }).toFile(join(root, 'second.webp'));
	await assert.rejects(
		generateSketchArtifacts({ sketchDirectory: root }),
		/Duplicate sketch pixels/
	);
});
