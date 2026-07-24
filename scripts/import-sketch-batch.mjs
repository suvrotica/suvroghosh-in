import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';
import { discoverSketchSources, slugFromFilename } from './lib/sketch-manifest.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sketchDirectory = resolve(repositoryRoot, 'static', 'sketch');

function argument(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}

function requiredString(value, field, filename) {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${filename}: catalog field "${field}" must be a non-empty string.`);
	}
	return value.trim();
}

function hashBytes(contents) {
	return createHash('sha256').update(contents).digest('hex');
}

function orientedDimensions(metadata, filename) {
	if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
		throw new Error(`${filename}: Sharp could not determine image dimensions.`);
	}
	const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
	return swapsAxes
		? { width: metadata.height, height: metadata.width }
		: { width: metadata.width, height: metadata.height };
}

function orientationFromDimensions(width, height) {
	const ratio = width / height;
	if (ratio >= 0.95 && ratio <= 1.05) return 'square';
	return ratio > 1 ? 'landscape' : 'portrait';
}

async function existingSlugs(batchFilenames) {
	const slugs = new Set();
	for (const sourcePath of await discoverSketchSources(sketchDirectory)) {
		if (batchFilenames.has(basename(sourcePath).toLowerCase())) continue;
		const sidecarPath = sourcePath.slice(0, -extname(sourcePath).length) + '.json';
		try {
			const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
			slugs.add(
				isPlainObject(sidecar) && typeof sidecar.slug === 'string'
					? sidecar.slug
					: slugFromFilename(sourcePath)
			);
		} catch (error) {
			if (error?.code === 'ENOENT') {
				slugs.add(slugFromFilename(sourcePath));
				continue;
			}
			throw error;
		}
	}
	return slugs;
}

const sourceArgument = argument('--source');
const catalogArgument = argument('--catalog');
if (!sourceArgument || !catalogArgument) {
	throw new Error(
		'Usage: node scripts/import-sketch-batch.mjs --source <directory> --catalog <catalog.json>'
	);
}

const sourceDirectory = resolve(sourceArgument);
const catalogPath = resolve(catalogArgument);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (!isPlainObject(catalog) || catalog.version !== 1 || !Array.isArray(catalog.items)) {
	throw new Error(`${catalogPath}: expected a version 1 catalog with an items array.`);
}

const sourceEntries = (await readdir(sourceDirectory, { withFileTypes: true }))
	.filter((entry) => entry.isFile())
	.map((entry) => entry.name)
	.sort((left, right) => left.localeCompare(right, 'en'));
const catalogFilenames = new Set();
for (const rawItem of catalog.items) {
	if (!isPlainObject(rawItem)) throw new Error(`${catalogPath}: every item must be an object.`);
	const filename = requiredString(rawItem.filename, 'filename', catalogPath);
	if (basename(filename) !== filename || extname(filename).toLowerCase() !== '.png') {
		throw new Error(`${filename}: filename must be a top-level PNG basename.`);
	}
	const key = filename.toLowerCase();
	if (catalogFilenames.has(key)) throw new Error(`${filename}: duplicate catalog filename.`);
	catalogFilenames.add(key);
}

if (
	sourceEntries.length !== catalog.items.length ||
	sourceEntries.some((filename) => !catalogFilenames.has(filename.toLowerCase()))
) {
	throw new Error(
		`${catalogPath}: catalog must account for every file in ${sourceDirectory} exactly once.`
	);
}

const usedSlugs = await existingSlugs(catalogFilenames);
const imported = [];
for (const rawItem of catalog.items) {
	const filename = requiredString(rawItem.filename, 'filename', catalogPath);
	const title = requiredString(rawItem.title, 'title', filename);
	const description = requiredString(rawItem.description, 'description', filename);
	const alt =
		rawItem.alt === undefined ? description : requiredString(rawItem.alt, 'alt', filename);
	const expectedOrientation = requiredString(rawItem.orientation, 'orientation', filename);
	const canvasMode = requiredString(rawItem.canvasMode, 'canvasMode', filename);
	if (!['portrait', 'landscape', 'square'].includes(expectedOrientation)) {
		throw new Error(`${filename}: unsupported catalog orientation "${expectedOrientation}".`);
	}
	if (!['ink', 'original'].includes(canvasMode)) {
		throw new Error(`${filename}: unsupported canvasMode "${canvasMode}".`);
	}

	const sourcePath = resolve(sourceDirectory, filename);
	const destinationPath = resolve(sketchDirectory, filename);
	const sourceContents = await readFile(sourcePath);
	const sourceHash = hashBytes(sourceContents);
	let destinationContents;
	try {
		destinationContents = await readFile(destinationPath);
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (destinationContents) {
		if (hashBytes(destinationContents) !== sourceHash) {
			throw new Error(`${filename}: repository copy exists with different bytes.`);
		}
	} else {
		await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
		const copiedContents = await readFile(destinationPath);
		if (hashBytes(copiedContents) !== sourceHash) {
			throw new Error(`${filename}: repository copy failed its SHA-256 verification.`);
		}
	}

	const dimensions = orientedDimensions(
		await sharp(sourcePath, { animated: false, failOn: 'error' }).metadata(),
		filename
	);
	const actualOrientation = orientationFromDimensions(dimensions.width, dimensions.height);
	if (actualOrientation !== expectedOrientation) {
		throw new Error(
			`${filename}: catalog orientation "${expectedOrientation}" does not match "${actualOrientation}".`
		);
	}

	const baseSlug = slugFromFilename(`${title}.png`);
	const sourceStem = basename(filename, extname(filename));
	const slug = usedSlugs.has(baseSlug) ? `${baseSlug}-${sourceStem.slice(0, 8)}` : baseSlug;
	if (usedSlugs.has(slug)) throw new Error(`${filename}: could not create a unique slug.`);
	usedSlugs.add(slug);

	const sidecar = {
		slug,
		title,
		description,
		alt,
		date: null,
		medium: 'Digital sketch',
		room: null,
		featured: false,
		canvasMode
	};
	const sidecarPath = resolve(sketchDirectory, `${sourceStem}.json`);
	const renderedSidecar = `${JSON.stringify(sidecar, null, 2)}\n`;
	let currentSidecar;
	try {
		currentSidecar = await readFile(sidecarPath, 'utf8');
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (currentSidecar !== undefined) {
		if (currentSidecar !== renderedSidecar) {
			throw new Error(`${filename}: repository sidecar exists with different metadata.`);
		}
	} else {
		await writeFile(sidecarPath, renderedSidecar, { encoding: 'utf8', flag: 'wx' });
	}

	imported.push({ filename, slug, sha256: sourceHash });
}

console.log(
	`Imported and verified ${imported.length} sketches from batch ${catalog.batch ?? 'unknown'}.`
);
for (const item of imported) {
	console.log(`${item.filename}\t${item.slug}\t${item.sha256}`);
}
