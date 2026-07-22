import { readFileSync } from 'node:fs';

const POST_IMAGE_COMPONENT = /<(?:Pi|PostImage)\b/g;
const LOCAL_IMAGE_ROOTS = new Set(['images', 'photos', 'thumbnail']);

function decodePathSegments(value) {
	try {
		return value
			.split('/')
			.map((segment) => decodeURIComponent(segment))
			.join('/');
	} catch {
		return value;
	}
}

/**
 * Resolve a literal Pi/PostImage src to its key in image-optimization-manifest.json.
 * Relative component paths intentionally retain PostImage's /images/ convention.
 */
export function imageManifestKey(src) {
	const source = src.trim().split(/[?#]/, 1)[0];
	if (
		!source ||
		/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(source) ||
		source.startsWith('data:') ||
		source.startsWith('blob:')
	) {
		return null;
	}

	const publicPath = source.startsWith('/') ? source : `/images/${source}`;
	const segments = publicPath.split('/').filter(Boolean);
	if (segments.length < 2 || !LOCAL_IMAGE_ROOTS.has(segments[0]) || segments.includes('..')) {
		return null;
	}

	return `static/${decodePathSegments(segments.join('/'))}`;
}

export function literalAttribute(component, name) {
	const match = component.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`));
	return match ? match[2] : null;
}

function findComponentEnd(content, start) {
	let quote = '';
	let braces = 0;
	for (let index = start; index < content.length; index += 1) {
		const character = content[index];
		if (quote) {
			if (character === quote && content[index - 1] !== '\\') quote = '';
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === '{') braces += 1;
		else if (character === '}' && braces > 0) braces -= 1;
		else if (character === '>' && braces === 0) return index + 1;
	}
	return -1;
}

export function transformPostImageComponents(content, transform) {
	let output = '';
	let cursor = 0;
	POST_IMAGE_COMPONENT.lastIndex = 0;

	for (
		let match = POST_IMAGE_COMPONENT.exec(content);
		match;
		match = POST_IMAGE_COMPONENT.exec(content)
	) {
		const end = findComponentEnd(content, match.index);
		if (end < 0) break;

		const component = content.slice(match.index, end);
		output += content.slice(cursor, match.index) + transform(component, match.index);
		cursor = end;
		POST_IMAGE_COMPONENT.lastIndex = end;
	}

	return output + content.slice(cursor);
}

function positiveInteger(value) {
	return Number.isInteger(value) && value > 0 ? value : null;
}

function escapeAttribute(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function imageDimensions(entries, src) {
	const key = imageManifestKey(src);
	if (!key) return null;
	const entry = entries[key];
	const width = positiveInteger(entry?.width);
	const height = positiveInteger(entry?.height);
	return width && height ? { key, width, height } : null;
}

/**
 * Add intrinsic dimensions to literal local Pi/PostImage components at compile time.
 * Authored width/height props win, allowing deliberate overrides without changing the manifest.
 */
export function enrichPostImageMarkup(content, entries, { leadAlt = '' } = {}) {
	let imageIndex = 0;
	return transformPostImageComponents(content, (component) => {
		const isLeadImage = imageIndex === 0;
		imageIndex += 1;
		const attributes = [];
		if (isLeadImage && leadAlt.trim() && !/(?:^|\s)alt\s*=/.test(component)) {
			attributes.push(` alt="${escapeAttribute(leadAlt.trim())}"`);
		}
		if (isLeadImage && !/(?:^|\s)loading\s*=/.test(component)) {
			attributes.push(' loading="eager"');
		}
		if (isLeadImage && !/(?:^|\s)fetchpriority\s*=/.test(component)) {
			attributes.push(' fetchpriority="high"');
		}

		const src = literalAttribute(component, 'src');
		const dimensions = src ? imageDimensions(entries, src) : null;
		if (dimensions) {
			if (!/(?:^|\s)width\s*=/.test(component)) {
				attributes.push(` width={${dimensions.width}}`);
			}
			if (!/(?:^|\s)height\s*=/.test(component)) {
				attributes.push(` height={${dimensions.height}}`);
			}
		}
		if (attributes.length === 0) return component;

		const closing = component.endsWith('/>') ? '/>' : '>';
		return `${component.slice(0, -closing.length).trimEnd()}${attributes.join('')} ${closing}`;
	});
}

export function loadImageManifest(manifestUrl) {
	const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
	if (!manifest || typeof manifest.files !== 'object' || manifest.files === null) {
		throw new Error('Image optimisation manifest must contain a files object.');
	}
	return manifest.files;
}
