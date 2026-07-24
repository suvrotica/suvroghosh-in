import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';

export const SKETCH_SOURCE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.svg', '.webp']);
export const SKETCH_GENERATED_DIRECTORY = '_generated';
export const SKETCH_GENERATOR_VERSION = '2026-07-24.1';
export const SKETCH_VARIANTS = Object.freeze({
	thumbnail: { maxDimension: 480, quality: 88 },
	preview: { maxDimension: 960, quality: 91 },
	museum: { maxDimension: 1600, quality: 93 },
	detail: { maxDimension: 1920, quality: 95 }
});

const METADATA_FIELDS = new Set([
	'slug',
	'title',
	'description',
	'alt',
	'date',
	'medium',
	'orientation',
	'room',
	'featured',
	'canvasMode'
]);
const ORIENTATIONS = new Set(['portrait', 'landscape', 'square']);
const CANVAS_MODES = new Set(['ink', 'original']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_METADATA_LENGTH = Object.freeze({
	title: 160,
	description: 1200,
	alt: 500,
	medium: 160,
	room: 120
});

function toPosix(value) {
	return value.split(sep).join('/');
}

function compareText(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}

function assertString(value, field, sourcePath, { allowEmpty = true, maxLength } = {}) {
	if (typeof value !== 'string') {
		throw new Error(`${sourcePath}: metadata field "${field}" must be a string.`);
	}
	const normalized = value.trim();
	if (!allowEmpty && normalized.length === 0) {
		throw new Error(`${sourcePath}: metadata field "${field}" cannot be empty.`);
	}
	if (maxLength && normalized.length > maxLength) {
		throw new Error(`${sourcePath}: metadata field "${field}" exceeds ${maxLength} characters.`);
	}
	return normalized;
}

function optionalString(raw, field, sourcePath, options) {
	if (raw[field] === undefined) return undefined;
	return assertString(raw[field], field, sourcePath, options);
}

function validateDate(value, sourcePath) {
	if (value === null || value === undefined) return null;
	const normalized = assertString(value, 'date', sourcePath, { allowEmpty: false });
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		throw new Error(`${sourcePath}: metadata field "date" must use YYYY-MM-DD.`);
	}
	const parsed = new Date(`${normalized}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
		throw new Error(`${sourcePath}: metadata field "date" is not a valid calendar date.`);
	}
	return normalized;
}

function publicPath(basePath, relativePath) {
	const baseSegments = basePath.split('/').filter(Boolean);
	const relativeSegments = toPosix(relativePath).split('/').filter(Boolean);
	return `/${[...baseSegments, ...relativeSegments].map(encodeURIComponent).join('/')}`;
}

function sidecarPath(sourcePath) {
	return resolve(dirname(sourcePath), `${basename(sourcePath, extname(sourcePath))}.json`);
}

async function readSidecar(sourcePath) {
	const path = sidecarPath(sourcePath);
	try {
		const contents = await readFile(path, 'utf8');
		try {
			return {
				exists: true,
				hash: hashBytes(Buffer.from(contents, 'utf8')),
				path,
				value: JSON.parse(contents)
			};
		} catch (error) {
			throw new Error(
				`${path}: metadata is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	} catch (error) {
		if (error?.code === 'ENOENT') {
			return { exists: false, hash: null, path, value: undefined };
		}
		throw error;
	}
}

function orientedDimensions(metadata, sourcePath) {
	if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
		throw new Error(`${sourcePath}: Sharp could not determine positive intrinsic dimensions.`);
	}
	const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
	const width = swapsAxes ? metadata.height : metadata.width;
	const height = swapsAxes ? metadata.width : metadata.height;
	if (width <= 0 || height <= 0) {
		throw new Error(`${sourcePath}: Sharp reported invalid intrinsic dimensions.`);
	}
	return { width, height };
}

function hashBytes(value) {
	return createHash('sha256').update(value).digest('hex');
}

async function writeBufferIfChanged(path, contents, { label, verifyOnly }) {
	try {
		if ((await readFile(path)).equals(contents)) return false;
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (verifyOnly) {
		throw new Error(
			`${label} is missing or stale. Run \`npm run sketches:generate\` and commit the result.`
		);
	}

	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${process.pid}.${hashBytes(contents).slice(0, 12)}.tmp`;
	await writeFile(temporaryPath, contents);
	await rename(temporaryPath, path);
	return true;
}

export async function writeTextIfChanged(path, contents, options) {
	return writeBufferIfChanged(path, Buffer.from(contents, 'utf8'), options);
}

async function loadGenerationCache(cachePath) {
	if (!cachePath) return null;
	try {
		const value = JSON.parse(await readFile(cachePath, 'utf8'));
		if (!isPlainObject(value)) {
			throw new Error(`${cachePath}: sketch generation cache must be a JSON object.`);
		}
		return value;
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		if (error instanceof SyntaxError) {
			throw new Error(`${cachePath}: sketch generation cache is not valid JSON.`, {
				cause: error
			});
		}
		throw error;
	}
}

function generationSignature(publicBasePath) {
	return hashBytes(
		Buffer.from(
			JSON.stringify({
				generatorVersion: SKETCH_GENERATOR_VERSION,
				publicBasePath,
				sharpVersion: sharp.versions.sharp,
				variants: SKETCH_VARIANTS
			}),
			'utf8'
		)
	);
}

function compatibleCache(cache, signature) {
	return (
		isPlainObject(cache) &&
		cache.version === SKETCH_GENERATOR_VERSION &&
		cache.signature === signature &&
		isPlainObject(cache.sources)
	);
}

async function cachedEntryIsUsable({
	entry,
	sourceHash,
	sidecarHash,
	sourceRelativePath,
	absoluteSketchDirectory,
	publicBasePath
}) {
	if (
		!isPlainObject(entry) ||
		entry.sourceHash !== sourceHash ||
		entry.sidecarHash !== sidecarHash ||
		!isPlainObject(entry.item) ||
		!isPlainObject(entry.variantFiles)
	) {
		return false;
	}
	const { item } = entry;
	if (
		typeof item.slug !== 'string' ||
		!SLUG_PATTERN.test(item.slug) ||
		!isPlainObject(item.source) ||
		item.source.src !== publicPath(publicBasePath, sourceRelativePath) ||
		!isPlainObject(item.variants)
	) {
		return false;
	}

	for (const variantName of Object.keys(SKETCH_VARIANTS)) {
		const generatedRelativePath = `${SKETCH_GENERATED_DIRECTORY}/${item.slug}/${variantName}.webp`;
		const fileEntry = entry.variantFiles[variantName];
		const asset = item.variants[variantName];
		if (
			!isPlainObject(fileEntry) ||
			fileEntry.path !== generatedRelativePath ||
			typeof fileEntry.hash !== 'string' ||
			!isPlainObject(asset) ||
			asset.src !== publicPath(publicBasePath, generatedRelativePath) ||
			!Number.isInteger(asset.bytes)
		) {
			return false;
		}
		try {
			const contents = await readFile(resolve(absoluteSketchDirectory, generatedRelativePath));
			if (contents.length !== asset.bytes || hashBytes(contents) !== fileEntry.hash) return false;
		} catch (error) {
			if (error?.code === 'ENOENT') return false;
			throw error;
		}
	}
	return true;
}

export function slugFromFilename(sourcePath) {
	const stem = basename(sourcePath, extname(sourcePath));
	const slug = stem
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!slug) {
		throw new Error(`${sourcePath}: filename cannot produce a stable sketch slug.`);
	}
	return slug;
}

export function readableTitle(slug) {
	return slug
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export function orientationFromDimensions(width, height) {
	const ratio = width / height;
	if (ratio >= 0.95 && ratio <= 1.05) return 'square';
	return ratio > 1 ? 'landscape' : 'portrait';
}

export function validateSketchMetadata(
	value,
	{ sourcePath, orientation, sidecarExists = value !== undefined }
) {
	const fallbackSlug = slugFromFilename(sourcePath);
	if (value === undefined) {
		return {
			slug: fallbackSlug,
			title: readableTitle(fallbackSlug),
			description: '',
			alt: '',
			date: null,
			medium: null,
			orientation,
			room: null,
			featured: false,
			needsMetadata: true,
			canvasMode: 'ink'
		};
	}
	if (!isPlainObject(value)) {
		throw new Error(`${sourcePath}: sketch metadata must be a JSON object.`);
	}

	const unknownFields = Object.keys(value).filter((field) => !METADATA_FIELDS.has(field));
	if (unknownFields.length > 0) {
		throw new Error(
			`${sourcePath}: unknown metadata field${unknownFields.length === 1 ? '' : 's'} ${unknownFields
				.map((field) => `"${field}"`)
				.join(', ')}.`
		);
	}

	const slug =
		value.slug === undefined
			? fallbackSlug
			: assertString(value.slug, 'slug', sourcePath, { allowEmpty: false });
	if (!SLUG_PATTERN.test(slug)) {
		throw new Error(`${sourcePath}: metadata field "slug" must be lower-case kebab-case.`);
	}

	const authoredTitle = optionalString(value, 'title', sourcePath, {
		allowEmpty: false,
		maxLength: MAX_METADATA_LENGTH.title
	});
	const title = authoredTitle ?? readableTitle(slug);
	const description =
		optionalString(value, 'description', sourcePath, {
			maxLength: MAX_METADATA_LENGTH.description
		}) ?? '';
	const alt =
		optionalString(value, 'alt', sourcePath, {
			maxLength: MAX_METADATA_LENGTH.alt
		}) ?? '';
	const medium =
		value.medium === null
			? null
			: (optionalString(value, 'medium', sourcePath, {
					allowEmpty: false,
					maxLength: MAX_METADATA_LENGTH.medium
				}) ?? null);
	const room =
		value.room === null
			? null
			: (optionalString(value, 'room', sourcePath, {
					allowEmpty: false,
					maxLength: MAX_METADATA_LENGTH.room
				}) ?? null);

	if (value.orientation !== undefined) {
		const authoredOrientation = assertString(value.orientation, 'orientation', sourcePath, {
			allowEmpty: false
		});
		if (!ORIENTATIONS.has(authoredOrientation)) {
			throw new Error(
				`${sourcePath}: metadata field "orientation" must be portrait, landscape, or square.`
			);
		}
		if (authoredOrientation !== orientation) {
			throw new Error(
				`${sourcePath}: metadata orientation "${authoredOrientation}" does not match the image orientation "${orientation}".`
			);
		}
	}
	if (value.featured !== undefined && typeof value.featured !== 'boolean') {
		throw new Error(`${sourcePath}: metadata field "featured" must be a boolean.`);
	}
	const canvasMode =
		value.canvasMode === undefined
			? 'ink'
			: assertString(value.canvasMode, 'canvasMode', sourcePath, { allowEmpty: false });
	if (!CANVAS_MODES.has(canvasMode)) {
		throw new Error(
			`${sourcePath}: metadata field "canvasMode" must be either "ink" or "original".`
		);
	}

	return {
		slug,
		title,
		description,
		alt,
		date: validateDate(value.date, sourcePath),
		medium,
		orientation,
		room,
		featured: value.featured ?? false,
		needsMetadata: !sidecarExists || authoredTitle === undefined || alt.length === 0,
		canvasMode
	};
}

export async function discoverSketchSources(sketchDirectory) {
	const absoluteSketchDirectory = resolve(sketchDirectory);
	const generatedDirectory = resolve(absoluteSketchDirectory, SKETCH_GENERATED_DIRECTORY);
	const discovered = [];

	async function visit(directory) {
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch (error) {
			if (error?.code === 'ENOENT' && directory === absoluteSketchDirectory) return;
			throw error;
		}

		for (const entry of entries) {
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				if (path !== generatedDirectory) await visit(path);
			} else if (
				entry.isFile() &&
				SKETCH_SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())
			) {
				discovered.push(path);
			}
		}
	}

	await visit(absoluteSketchDirectory);
	discovered.sort((left, right) => {
		const leftPath = toPosix(relative(absoluteSketchDirectory, left)).toLowerCase();
		const rightPath = toPosix(relative(absoluteSketchDirectory, right)).toLowerCase();
		return compareText(leftPath, rightPath) || compareText(left, right);
	});
	return discovered;
}

async function createVariant(sourcePath, outputPath, config, writeOptions) {
	const { data, info } = await sharp(sourcePath, {
		animated: false,
		failOn: 'error'
	})
		.rotate()
		.resize({
			width: config.maxDimension,
			height: config.maxDimension,
			fit: 'inside',
			withoutEnlargement: true,
			kernel: sharp.kernel.lanczos3
		})
		.webp({
			preset: 'drawing',
			quality: config.quality,
			alphaQuality: 100,
			effort: 6,
			nearLossless: true,
			smartSubsample: false
		})
		.toBuffer({ resolveWithObject: true });

	if (!Number.isInteger(info.width) || !Number.isInteger(info.height)) {
		throw new Error(`${sourcePath}: Sharp did not report dimensions for ${outputPath}.`);
	}
	const changed = await writeBufferIfChanged(outputPath, data, writeOptions);
	return {
		changed,
		hash: hashBytes(data),
		asset: {
			width: info.width,
			height: info.height,
			bytes: data.length
		}
	};
}

export async function generateSketchArtifacts({
	sketchDirectory,
	cachePath,
	publicBasePath = '/sketch',
	verifyOnly = false
}) {
	const absoluteSketchDirectory = resolve(sketchDirectory);
	const sourcePaths = await discoverSketchSources(absoluteSketchDirectory);
	const signature = generationSignature(publicBasePath);
	const loadedCache = await loadGenerationCache(cachePath);
	const cache = compatibleCache(loadedCache, signature) ? loadedCache : null;
	if (verifyOnly && cachePath && !cache) {
		throw new Error(
			'Sketch generation cache is missing or stale. Run `npm run sketches:generate` and commit the result.'
		);
	}
	const nextCache = {
		version: SKETCH_GENERATOR_VERSION,
		signature,
		sources: {}
	};
	const manifest = [];
	const seenSlugs = new Map();
	let cachedSketches = 0;
	let renderedVariants = 0;
	let changedVariants = 0;

	for (const sourcePath of sourcePaths) {
		const sourceRelativePath = toPosix(relative(absoluteSketchDirectory, sourcePath));
		const sourceContents = await readFile(sourcePath);
		const sourceHash = hashBytes(sourceContents);
		const sidecar = await readSidecar(sourcePath);
		const cachedEntry = cache?.sources[sourceRelativePath];
		if (
			await cachedEntryIsUsable({
				entry: cachedEntry,
				sourceHash,
				sidecarHash: sidecar.hash,
				sourceRelativePath,
				absoluteSketchDirectory,
				publicBasePath
			})
		) {
			const previousSource = seenSlugs.get(cachedEntry.item.slug);
			if (previousSource) {
				throw new Error(
					`Duplicate sketch slug "${cachedEntry.item.slug}" for ${previousSource} and ${sourcePath}.`
				);
			}
			seenSlugs.set(cachedEntry.item.slug, sourcePath);
			manifest.push(cachedEntry.item);
			nextCache.sources[sourceRelativePath] = cachedEntry;
			cachedSketches += 1;
			continue;
		}
		if (verifyOnly) {
			throw new Error(
				`${sourceRelativePath}: generated sketch variants are missing or stale. Run \`npm run sketches:generate\` and commit the result.`
			);
		}

		const metadata = await sharp(sourcePath, { animated: false, failOn: 'error' }).metadata();
		const dimensions = orientedDimensions(metadata, sourcePath);
		const orientation = orientationFromDimensions(dimensions.width, dimensions.height);
		const sketchMetadata = validateSketchMetadata(sidecar.value, {
			sourcePath,
			orientation,
			sidecarExists: sidecar.exists
		});
		const previousSource = seenSlugs.get(sketchMetadata.slug);
		if (previousSource) {
			throw new Error(
				`Duplicate sketch slug "${sketchMetadata.slug}" for ${previousSource} and ${sourcePath}.`
			);
		}
		seenSlugs.set(sketchMetadata.slug, sourcePath);

		const variants = {};
		const variantFiles = {};
		for (const [variantName, config] of Object.entries(SKETCH_VARIANTS)) {
			const generatedRelativePath = `${SKETCH_GENERATED_DIRECTORY}/${sketchMetadata.slug}/${variantName}.webp`;
			const outputPath = resolve(absoluteSketchDirectory, generatedRelativePath);
			const result = await createVariant(sourcePath, outputPath, config, {
				label: `Sketch ${variantName} variant for ${sketchMetadata.slug}`,
				verifyOnly
			});
			if (result.changed) changedVariants += 1;
			renderedVariants += 1;
			variants[variantName] = {
				src: publicPath(publicBasePath, generatedRelativePath),
				...result.asset
			};
			variantFiles[variantName] = {
				path: generatedRelativePath,
				hash: result.hash
			};
		}

		const item = {
			...sketchMetadata,
			source: {
				src: publicPath(publicBasePath, sourceRelativePath),
				width: dimensions.width,
				height: dimensions.height,
				bytes: sourceContents.length
			},
			variants
		};
		manifest.push(item);
		nextCache.sources[sourceRelativePath] = {
			sourceHash,
			sidecarHash: sidecar.hash,
			item,
			variantFiles
		};
	}

	const cacheChanged = cachePath
		? await writeTextIfChanged(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`, {
				label: 'Sketch generation cache',
				verifyOnly
			})
		: false;
	return { manifest, cachedSketches, renderedVariants, changedVariants, cacheChanged };
}

export function renderSketchManifestModule(manifest) {
	return `// Generated by scripts/generate-sketch-manifest.mjs. Do not edit by hand.

import type { SketchArtwork } from '$lib/sketches/types';

export const sketchManifest = ${JSON.stringify(manifest, null, '\t')} as const satisfies readonly SketchArtwork[];
`;
}
