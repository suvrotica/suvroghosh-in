import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const staticRoot = path.join(root, 'static');
const outputDirectory = path.join(staticRoot, 'images', 'resources');
const verifyOnly = process.argv.includes('--verify');

function escapeXml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function hashSlug(slug) {
	let hash = 2166136261;
	for (const character of slug) {
		hash ^= character.codePointAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function titleLines(title, limit = 27) {
	const words = title.split(/\s+/);
	const lines = [];
	let line = '';
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (candidate.length > limit && line) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines.slice(0, 4);
}

function lineTexture(width, height, accent, seed) {
	const horizontal = Array.from({ length: 7 }, (_, index) => {
		const y = 86 + index * 78 + (seed % 17);
		return `<path d="M42 ${y} H${width - 42}" stroke="${accent}" stroke-opacity="0.14" stroke-width="1"/>`;
	}).join('');
	const ticks = Array.from({ length: 11 }, (_, index) => {
		const x = 54 + index * Math.floor((width - 108) / 10);
		return `<path d="M${x} ${height - 62} v12" stroke="${accent}" stroke-opacity="0.4" stroke-width="2"/>`;
	}).join('');
	return `${horizontal}${ticks}`;
}

function motif(seed, accent, secondary) {
	const variant = seed % 4;
	if (variant === 0) {
		return `<g fill="none" stroke="${accent}" stroke-width="5" opacity="0.86">
			<circle cx="974" cy="218" r="92"/><circle cx="974" cy="218" r="48"/>
			<path d="M882 218H1066M974 126V310"/>
			<path d="M868 390c74-54 152-49 238 15" stroke="${secondary}" stroke-width="8"/>
		</g>`;
	}
	if (variant === 1) {
		return `<g fill="none" stroke="${accent}" stroke-width="5" opacity="0.86">
			<path d="M876 310 972 136l98 174Z"/><circle cx="972" cy="242" r="42"/>
			<path d="M854 396h236M890 422h166" stroke="${secondary}" stroke-width="8"/>
		</g>`;
	}
	if (variant === 2) {
		return `<g fill="none" stroke="${accent}" stroke-width="5" opacity="0.86">
			<rect x="864" y="130" width="212" height="212" rx="18"/>
			<path d="M896 185h148M896 236h112M896 287h132"/>
			<circle cx="1076" cy="396" r="38" stroke="${secondary}" stroke-width="8"/>
		</g>`;
	}
	return `<g fill="none" stroke="${accent}" stroke-width="5" opacity="0.86">
		<path d="M858 302c42-155 122-191 240-86-69 6-111 49-126 129-31-48-69-63-114-43Z"/>
		<path d="m900 402 48-34 42 20 64-52" stroke="${secondary}" stroke-width="8"/>
		<circle cx="1054" cy="336" r="12" fill="${secondary}" stroke="none"/>
	</g>`;
}

function resourceSvg({ title, kind, slug }) {
	const width = 1200;
	const height = 675;
	const seed = hashSlug(slug);
	const promptPalette = [
		['#efeadd', '#26231d', '#8c4b3d', '#3f6770'],
		['#e8e9e3', '#222620', '#4f6950', '#905b3d'],
		['#e9e5df', '#26221f', '#6e526f', '#476b73']
	];
	const listPalette = [
		['#ece7da', '#25221d', '#76552f', '#426770'],
		['#e7e8e0', '#23251f', '#4f6652', '#86504a'],
		['#ebe4dc', '#25211f', '#7b4b4b', '#47636e']
	];
	const palette = (kind === 'prompt' ? promptPalette : listPalette)[seed % 3];
	const [background, ink, accent, secondary] = palette;
	const lines = titleLines(title);
	const titleMarkup = lines
		.map(
			(line, index) =>
				`<text x="76" y="${235 + index * 72}" fill="${ink}" font-family="Arial, sans-serif" font-size="58" font-weight="700" letter-spacing="-1.4">${escapeXml(line)}</text>`
		)
		.join('');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
		<rect width="${width}" height="${height}" fill="${background}"/>
		${lineTexture(width, height, accent, seed)}
		<rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="18" fill="none" stroke="${ink}" stroke-opacity="0.42" stroke-width="2"/>
		<path d="M68 110H530" stroke="${accent}" stroke-width="8"/>
		<text x="76" y="92" fill="${accent}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">${kind === 'prompt' ? 'PROMPT' : 'WORD LIST'}</text>
		${titleMarkup}
		${motif(seed, accent, secondary)}
		<text x="76" y="610" fill="${ink}" fill-opacity="0.7" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">THE FIELD KIT · SUVROGHOSH.IN</text>
		<text x="1090" y="610" fill="${accent}" font-family="Arial, sans-serif" font-size="20" text-anchor="end">№ ${String((seed % 97) + 1).padStart(2, '0')}</text>
	</svg>`;
}

function fieldKitSvg() {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
		<rect width="1200" height="630" fill="#ebe6da"/>
		<g stroke="#342f28" stroke-opacity="0.13" stroke-width="1">
			${Array.from({ length: 12 }, (_, index) => `<path d="M0 ${45 + index * 48}H1200"/>`).join('')}
			${Array.from({ length: 22 }, (_, index) => `<path d="M${30 + index * 54} 0V630"/>`).join('')}
		</g>
		<rect x="34" y="34" width="1132" height="562" rx="22" fill="none" stroke="#27231e" stroke-width="3"/>
		<path d="M78 120H552" stroke="#8a4f3d" stroke-width="10"/>
		<text x="82" y="96" fill="#8a4f3d" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="6">RESOURCES</text>
		<text x="78" y="254" fill="#27231e" font-family="Arial, sans-serif" font-size="92" font-weight="700" letter-spacing="-3">The Field Kit</text>
		<text x="82" y="318" fill="#575047" font-family="Arial, sans-serif" font-size="28" font-weight="600" letter-spacing="2">PROMPTS · WORD LISTS · REFERENCE</text>
		<g transform="translate(770 100)">
			<rect x="0" y="42" width="286" height="340" rx="18" fill="#f6f2e8" stroke="#27231e" stroke-width="4" transform="rotate(-4 143 212)"/>
			<rect x="58" y="0" width="286" height="340" rx="18" fill="#e5ddd0" stroke="#45666e" stroke-width="5" transform="rotate(5 201 170)"/>
			<g fill="none" stroke="#8a4f3d" stroke-width="6">
				<circle cx="188" cy="119" r="54"/><path d="M134 119h108M188 65v108"/>
				<path d="M112 230h194M112 270h152M112 310h176"/>
			</g>
		</g>
		<text x="82" y="548" fill="#27231e" fill-opacity="0.72" font-family="Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="4">COPY · ADAPT · ANNOTATE · REUSE</text>
	</svg>`;
}

async function resourceDefinitions() {
	const definitions = [];
	for (const [directory, expectedKind] of [
		['prompts', 'prompt'],
		['lists', 'list']
	]) {
		const sourceDirectory = path.join(root, 'src', 'lib', directory);
		let files;
		try {
			files = (await fs.readdir(sourceDirectory)).filter((file) => file.endsWith('.md')).sort();
		} catch (error) {
			if (error?.code === 'ENOENT') continue;
			throw error;
		}

		for (const filename of files) {
			const source = await fs.readFile(path.join(sourceDirectory, filename), 'utf8');
			const metadata = parsePostFrontmatter(source, `${directory}/${filename}`);
			if (metadata.kind !== expectedKind || typeof metadata.title !== 'string') continue;
			if (
				typeof metadata.thumbnail !== 'string' ||
				!metadata.thumbnail.startsWith('/images/resources/') ||
				metadata.thumbnail === '/images/resources/field-kit.webp'
			) {
				continue;
			}
			definitions.push({
				title: metadata.title,
				kind: expectedKind,
				slug: filename.replace(/\.md$/, ''),
				output: path.join(staticRoot, metadata.thumbnail.slice(1))
			});
		}
	}
	return definitions;
}

async function verifyImage(file, expectedWidth, expectedHeight) {
	let metadata;
	try {
		metadata = await sharp(file).metadata();
	} catch {
		throw new Error(`${path.relative(root, file)} is missing or unreadable.`);
	}
	if (
		metadata.format !== 'webp' ||
		metadata.width !== expectedWidth ||
		metadata.height !== expectedHeight
	) {
		throw new Error(
			`${path.relative(root, file)} must be a ${expectedWidth}×${expectedHeight} WebP.`
		);
	}
}

await fs.mkdir(outputDirectory, { recursive: true });
const definitions = await resourceDefinitions();
const fieldKitOutput = path.join(outputDirectory, 'field-kit.webp');

if (verifyOnly) {
	await verifyImage(fieldKitOutput, 1200, 630);
	for (const definition of definitions) {
		await verifyImage(definition.output, 1200, 675);
	}
	console.log(`Resource images: verified ${definitions.length + 1} WebP assets.`);
} else {
	await sharp(Buffer.from(fieldKitSvg())).webp({ quality: 84, effort: 5 }).toFile(fieldKitOutput);
	for (const definition of definitions) {
		await fs.mkdir(path.dirname(definition.output), { recursive: true });
		await sharp(Buffer.from(resourceSvg(definition)))
			.webp({ quality: 84, effort: 5 })
			.toFile(definition.output);
	}
	console.log(`Resource images: generated ${definitions.length + 1} WebP assets.`);
}
