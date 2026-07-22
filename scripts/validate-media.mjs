import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const postsRoot = path.join(sourceRoot, 'lib', 'posts');
const staticRoot = path.join(root, 'static');
const mediaDirectories = ['images', 'photos', 'thumbnail', 'videos', 'audio'];
const sourceExtensions = new Set(['.md', '.svx', '.svelte', '.ts', '.js', '.mjs', '.css', '.html']);
const mediaExtensions = new Set([
	'.avif',
	'.gif',
	'.jpeg',
	'.jpg',
	'.m4a',
	'.mp3',
	'.mp4',
	'.ogg',
	'.png',
	'.svg',
	'.vtt',
	'.wav',
	'.webm',
	'.webp'
]);
const imageBudget = 750 * 1024;
const videoBudget = 15 * 1024 * 1024;
const deep = process.argv.includes('--deep');
const verbose = process.argv.includes('--verbose');

function walk(directory) {
	if (!fs.existsSync(directory)) return [];

	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(fullPath) : [fullPath];
	});
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function publicPath(file) {
	return `/${toPosix(path.relative(staticRoot, file))}`;
}

function formatMiB(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function isMediaPath(value) {
	return mediaExtensions.has(path.extname(value).toLowerCase());
}

function normalizeReference(value) {
	return value.trim().split(/[?#]/, 1)[0];
}

function lineNumber(text, index) {
	return text.slice(0, index).split('\n').length;
}

function literalAttribute(component, name) {
	const match = component.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`));
	return match ? match[2] : null;
}

function validateReviewedMedia(file, text, reviewErrors) {
	let metadata;
	try {
		metadata = parsePostFrontmatter(text, toPosix(path.relative(root, file)));
	} catch {
		// validate:content owns frontmatter syntax errors. Avoid reporting the same defect twice here.
		return null;
	}
	if (metadata.mediaReviewed !== true) return null;

	const source = toPosix(path.relative(root, file));
	if (typeof metadata.thumbnailAlt !== 'string' || metadata.thumbnailAlt.trim() === '') {
		reviewErrors.push(`${source}: mediaReviewed posts require a non-empty authored thumbnailAlt.`);
	}

	const imageComponent = /<(Pi|PostImage)\b[\s\S]*?>/g;
	let reviewedImageCount = 0;
	for (const match of text.matchAll(imageComponent)) {
		reviewedImageCount += 1;
		const line = lineNumber(text, match.index);
		const alt = literalAttribute(match[0], 'alt');
		if (alt === null) {
			reviewErrors.push(
				`${source}:${line}: mediaReviewed image requires an explicit authored alt; use alt="" only when the image is decorative.`
			);
			continue;
		}
		if (alt === '') continue;
		if (alt.trim() === '') {
			reviewErrors.push(
				`${source}:${line}: decorative image alt must be exactly alt=""; whitespace is not a valid authored alternative.`
			);
			continue;
		}

		const caption = literalAttribute(match[0], 'caption');
		if (caption === null || caption.trim() === '') {
			reviewErrors.push(
				`${source}:${line}: meaningful mediaReviewed image requires a non-empty authored caption.`
			);
		}
	}
	return reviewedImageCount;
}

function addReference(references, value, source) {
	const reference = normalizeReference(value);
	if (!reference.startsWith('/') || !isMediaPath(reference)) return;

	const sources = references.get(reference) ?? new Set();
	sources.add(toPosix(path.relative(root, source)));
	references.set(reference, sources);
}

function extractReferences(file, references, text = fs.readFileSync(file, 'utf8')) {
	const quotedPath = /(["'])(\/(?:images|photos|thumbnail|videos|audio)\/[^"'`\r\n]+?)\1/g;
	const markdownPath = /\]\((\/(?:images|photos|thumbnail|videos|audio)\/[^)\s]+)\)/g;
	const component = /<(Pi|PostImage|Vid|PostVideo)\b[\s\S]*?>/g;

	for (const match of text.matchAll(quotedPath)) addReference(references, match[2], file);
	for (const match of text.matchAll(markdownPath)) addReference(references, match[1], file);

	for (const match of text.matchAll(component)) {
		const src = match[0].match(/\bsrc\s*=\s*(["'])(.*?)\1/);
		if (!src || /^(?:https?:)?\/\//.test(src[2])) continue;

		const value = src[2].startsWith('/')
			? src[2]
			: `/${match[1] === 'Pi' || match[1] === 'PostImage' ? 'images' : 'videos'}/${src[2]}`;
		addReference(references, value, file);
	}
}

function sha256(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const sourceFiles = walk(sourceRoot).filter(
	(file) =>
		sourceExtensions.has(path.extname(file)) &&
		!toPosix(path.relative(sourceRoot, file)).startsWith('lib/SavedPosts/')
);
const references = new Map();
const mediaReviewErrors = [];
let reviewedPostCount = 0;
let reviewedImageCount = 0;

for (const file of sourceFiles) {
	const text = fs.readFileSync(file, 'utf8');
	extractReferences(file, references, text);
	if (path.dirname(file) === postsRoot && path.extname(file) === '.md') {
		const reviewedImages = validateReviewedMedia(file, text, mediaReviewErrors);
		if (reviewedImages != null) {
			reviewedPostCount += 1;
			reviewedImageCount += reviewedImages;
		}
	}
}

const mediaFiles = mediaDirectories.flatMap((directory) => walk(path.join(staticRoot, directory)));
const assets = new Map(mediaFiles.map((file) => [publicPath(file), file]));
const assetsByLowercasePath = new Map(
	Array.from(assets.keys(), (assetPath) => [assetPath.toLowerCase(), assetPath])
);
const errors = [...mediaReviewErrors];

for (const [reference, sources] of references) {
	if (assets.has(reference)) continue;

	const caseMatch = assetsByLowercasePath.get(reference.toLowerCase());
	const locations = Array.from(sources).join(', ');
	if (caseMatch) {
		errors.push(`${reference} has incorrect letter case; use ${caseMatch} (${locations})`);
	} else {
		errors.push(`${reference} does not exist (${locations})`);
	}
}

const unreferenced = Array.from(assets.entries()).filter(
	([assetPath]) => !references.has(assetPath)
);
const unreferencedBytes = unreferenced.reduce(
	(total, [, file]) => total + fs.statSync(file).size,
	0
);
const oversizedImages = mediaFiles.filter((file) => {
	const extension = path.extname(file).toLowerCase();
	return (
		['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(extension) &&
		fs.statSync(file).size > imageBudget
	);
});
const oversizedVideos = mediaFiles.filter(
	(file) =>
		['.mp4', '.webm'].includes(path.extname(file).toLowerCase()) &&
		fs.statSync(file).size > videoBudget
);

if (deep) {
	const filesBySize = new Map();
	for (const file of mediaFiles) {
		const size = fs.statSync(file).size;
		const matches = filesBySize.get(size) ?? [];
		matches.push(file);
		filesBySize.set(size, matches);
	}

	const duplicates = [];
	for (const sameSizeFiles of filesBySize.values()) {
		if (sameSizeFiles.length < 2) continue;

		const filesByHash = new Map();
		for (const file of sameSizeFiles) {
			const hash = sha256(file);
			const matches = filesByHash.get(hash) ?? [];
			matches.push(file);
			filesByHash.set(hash, matches);
		}
		duplicates.push(...Array.from(filesByHash.values()).filter((files) => files.length > 1));
	}

	if (duplicates.length > 0) {
		console.warn(`Exact duplicate groups: ${duplicates.length}`);
		for (const files of duplicates) console.warn(`- ${files.map(publicPath).join(', ')}`);
	} else {
		console.log('Exact duplicate groups: 0');
	}
}

if (verbose && unreferenced.length > 0) {
	console.warn('Unreferenced media candidates:');
	for (const [assetPath, file] of unreferenced) {
		console.warn(`- ${assetPath} (${formatMiB(fs.statSync(file).size)})`);
	}
}

if (oversizedImages.length > 0) {
	console.warn(
		`Images above the ${formatMiB(imageBudget)} review budget: ${oversizedImages.length}`
	);
}
if (oversizedVideos.length > 0) {
	console.warn(
		`Videos above the ${formatMiB(videoBudget)} review budget: ${oversizedVideos.length}`
	);
}

if (errors.length > 0) {
	console.error(`Media validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`Media validation passed: ${references.size} references checked against ${assets.size} assets; ` +
		`${unreferenced.length} unreferenced candidate(s) (${formatMiB(unreferencedBytes)}); ` +
		`${reviewedPostCount} media-reviewed post(s) with ${reviewedImageCount} Pi/PostImage embed(s) audited.`
);
