import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';
import { specimenAllowlist } from '../src/lib/visualizations/anatomy-of-an-essay/allowlist.ts';
import type {
	EssayDocument,
	SpecimenEntry
} from '../src/lib/visualizations/anatomy-of-an-essay/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feature = resolve(root, 'src/lib/visualizations/anatomy-of-an-essay');
const featureUrl = new URL('../src/lib/visualizations/anatomy-of-an-essay/', import.meta.url).href;
const contentUrl = new URL('../src/lib/content/', import.meta.url).href;
const artDirectory = 'static/images/visualizations/anatomy-of-an-essay';
const modelsDirectory = 'static/essay-anatomy';
const generatedDirectory = 'src/lib/visualizations/anatomy-of-an-essay/generated';
const manifestPath = `${artDirectory}/manifest.json`;
const args = process.argv.slice(2);
const check = args.includes('--check');
const prune = args.includes('--prune');
const rerender = args.includes('--rerender');
const asOfIndex = args.indexOf('--as-of');
const asOf =
	asOfIndex >= 0
		? args[asOfIndex + 1]
		: new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Kolkata',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(new Date());
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--as-of') {
		i++;
		continue;
	}
	if (!['--check', '--write', '--prune', '--rerender'].includes(args[i]))
		throw new Error(`Unknown argument: ${args[i]}`);
}
if (check && (prune || rerender || args.includes('--write')))
	throw new Error('--check cannot be combined with write, prune or rerender.');
if (!validDate(asOf)) throw new Error('--as-of must be a real YYYY-MM-DD calendar date.');

function validDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const timestamp = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === value;
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonicalText = (value: string) => value.replace(/\r\n?/g, '\n');
const readSource = async (path: string) => canonicalText(await readFile(path, 'utf8'));
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const get = async (path: string) =>
	readFile(resolve(root, path)).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});

interface ManifestEntry {
	signature: string;
	sourceSha256: string;
	contentHash: string;
	files: Record<string, string>;
}
interface Manifest {
	schemaVersion: 1;
	rendererSha256: string;
	specimens: Record<string, ManifestEntry>;
	files: Record<string, string>;
	rasters: Record<string, RasterReceipt>;
}
interface RasterReceipt {
	inputSvgSha256: string;
	pixelSha256: string;
	width: number;
	height: number;
	rasterizer: string;
}

// Match the feature's Vite extension resolution for Node's native type stripping.
const hook = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			(context.parentURL?.startsWith(featureUrl) || context.parentURL?.startsWith(contentUrl)) &&
			/^\.\.?\/[\w/-]+$/.test(specifier)
		) {
			return nextResolve(`${specifier}.ts`, context);
		}
		return nextResolve(specifier, context);
	}
});

try {
	const { analyzeEssay } = await import(`${featureUrl}model.ts`);
	const { renderPortrait } = await import(`${featureUrl}render.ts`);
	const { postPath, isRedirectedPostSlug } = await import(`${contentUrl}posts.ts`);
	const engineFiles = (await readdir(feature))
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.sort();
	const engineSignature = hash(
		(await readSource(fileURLToPath(import.meta.url))) +
			(await readSource(resolve(root, 'src/lib/content/posts.ts'))) +
			(await readSource(resolve(root, 'src/lib/content/categories.ts'))) +
			(
				await Promise.all(
					engineFiles.map(async (file) => `${file}\n${await readSource(resolve(feature, file))}`)
				)
			).join('\n')
	);
	const oldBytes = await get(manifestPath);
	let old: Manifest | null = null;
	if (oldBytes) {
		try {
			const candidate = JSON.parse(oldBytes.toString()) as Partial<Manifest>;
			if (
				candidate.schemaVersion === 1 &&
				candidate.specimens &&
				typeof candidate.specimens === 'object' &&
				!Array.isArray(candidate.specimens)
			)
				old = candidate as Manifest;
		} catch {
			// A damaged cache is a miss. Raster provenance is validated separately below.
		}
	}
	const output = new Map<string, Buffer>();
	const manifest: Manifest = {
		schemaVersion: 1,
		rendererSha256: engineSignature,
		specimens: {},
		files: {},
		rasters: {}
	};
	const catalog: SpecimenEntry[] = [];
	let defaultDocument: EssayDocument | null = null;
	let cached = 0;

	for (const allowed of specimenAllowlist) {
		if (!/^[a-z0-9][a-z0-9-]+$/.test(allowed.id))
			throw new Error(`Unsafe specimen identifier: ${allowed.id}`);
		const source = await readSource(resolve(root, 'src/lib/posts', `${allowed.id}.md`));
		const metadata = parsePostFrontmatter(source, allowed.id) as Record<string, unknown>;
		if (
			metadata.published !== true ||
			!validDate(metadata.date) ||
			metadata.date > asOf ||
			metadata.redirect ||
			isRedirectedPostSlug(allowed.id)
		) {
			throw new Error(`${allowed.id} is not an explicitly published, due, non-redirect article.`);
		}
		if (typeof metadata.title !== 'string' || typeof metadata.category !== 'string')
			throw new Error(`${allowed.id} is missing a title or category.`);
		const url = postPath({ category: metadata.category, slug: allowed.id });
		const modelPath = `${modelsDirectory}/${allowed.id}.json`;
		const portraitPath = `${artDirectory}/portraits/${allowed.id}.svg`;
		const signature = hash(`${engineSignature}\n${source}\n${json(allowed)}`);
		const previous = old?.specimens[allowed.id];
		let document: EssayDocument;
		let files: Record<string, string>;
		const canReuse =
			!check &&
			previous?.signature === signature &&
			previous.files &&
			typeof previous.files === 'object' &&
			!Array.isArray(previous.files) &&
			Object.keys(previous.files).length === 2 &&
			Object.keys(previous.files).every((path) => path === modelPath || path === portraitPath) &&
			(
				await Promise.all(
					Object.entries(previous.files).map(async ([path, digest]) => {
						const bytes = await get(path);
						return bytes !== null && hash(bytes) === digest;
					})
				)
			).every(Boolean);
		let cachedDocument: EssayDocument | null = null;
		if (canReuse) {
			try {
				const candidate = JSON.parse((await get(modelPath))!.toString()) as EssayDocument;
				if (
					candidate.schemaVersion === 1 &&
					candidate.id === allowed.id &&
					candidate.title === metadata.title &&
					candidate.contentHash === hash(source) &&
					candidate.canonicalUrl === `https://www.suvroghosh.in${url}` &&
					Array.isArray(candidate.paragraphs) &&
					candidate.measurements &&
					Array.isArray(candidate.clusters)
				)
					cachedDocument = candidate;
			} catch {
				// Corrupt model data is regenerated from the public source instead of propagated.
			}
		}
		if (cachedDocument) {
			document = cachedDocument;
			files = previous!.files;
			cached++;
		} else {
			document = analyzeEssay(source, {
				id: allowed.id,
				title: metadata.title,
				author: typeof metadata.author === 'string' ? metadata.author : 'Suvro Ghosh',
				canonicalUrl: `https://www.suvroghosh.in${url}`,
				format: 'markdown'
			});
			const values = [
				[modelPath, Buffer.from(json(document))],
				[portraitPath, Buffer.from(renderPortrait(document, { width: 720, height: 900 }))]
			] as const;
			files = Object.fromEntries(
				values.map(([path, bytes]) => {
					output.set(path, bytes);
					return [path, hash(bytes)];
				})
			);
		}
		manifest.specimens[allowed.id] = {
			signature,
			sourceSha256: hash(source),
			contentHash: document.contentHash,
			files
		};
		catalog.push({
			id: allowed.id,
			title: document.title,
			label: allowed.label,
			url,
			modelUrl: `/essay-anatomy/${allowed.id}.json`,
			portrait: `/images/visualizations/anatomy-of-an-essay/portraits/${allowed.id}.svg`,
			measurements: document.measurements
		});
		defaultDocument ??= document;
	}
	if (!defaultDocument) throw new Error('At least one specimen must be allowlisted.');
	output.set(
		`${generatedDirectory}/catalog.ts`,
		Buffer.from(
			`// Generated by scripts/generate-essay-anatomy.ts.\nimport type { SpecimenEntry } from '../types';\n\nexport const specimens: SpecimenEntry[] = ${JSON.stringify(catalog, null, '\t')};\n`
		)
	);
	// Only one default model is available to SSR; other essays are fetched on selection.
	output.set(`${generatedDirectory}/default.json`, Buffer.from(json(defaultDocument)));
	const poster = renderPortrait(defaultDocument, { width: 960, height: 1200 });
	const social = renderPortrait(defaultDocument, { width: 1200, height: 630, social: true });
	output.set(`${artDirectory}/poster.svg`, Buffer.from(poster));
	for (const [path, svg, width, height] of [
		[`${artDirectory}/poster.png`, poster, 960, 1200],
		[`${artDirectory}/social.png`, social, 1200, 630]
	] as const) {
		const existing = await get(path);
		const receipt = old?.rasters?.[path];
		let verified = false;
		if (existing && receipt && receipt.inputSvgSha256 === hash(svg)) {
			try {
				const metadata = await sharp(existing).metadata();
				const pixels = await sharp(existing).ensureAlpha().raw().toBuffer();
				verified =
					metadata.width === width &&
					metadata.height === height &&
					receipt.width === width &&
					receipt.height === height &&
					typeof receipt.rasterizer === 'string' &&
					hash(pixels) === receipt.pixelSha256;
			} catch {
				// A damaged raster is rebuilt in write mode and rejected in check mode.
			}
		}
		if (check && !verified)
			throw new Error(
				`Anatomy raster provenance is missing, damaged or stale: ${path}. Run npm run essay-anatomy:generate.`
			);
		if (verified && !rerender) {
			output.set(path, existing!);
			manifest.rasters[path] = receipt!;
		} else {
			const bytes = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
			output.set(path, bytes);
			manifest.rasters[path] = {
				inputSvgSha256: hash(svg),
				pixelSha256: hash(await sharp(bytes).ensureAlpha().raw().toBuffer()),
				width,
				height,
				rasterizer: `sharp ${sharp.versions.sharp} / librsvg ${sharp.versions.rsvg} / ${process.platform}; system serif and monospace fonts`
			};
		}
	}
	for (const [path, bytes] of output) {
		if (!manifest.rasters[path]) manifest.files[path] = hash(bytes);
	}
	for (const entry of Object.values(manifest.specimens)) Object.assign(manifest.files, entry.files);
	manifest.files = Object.fromEntries(
		Object.entries(manifest.files).sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0
		)
	);
	output.set(manifestPath, Buffer.from(json(manifest)));
	const expected = new Set([
		...Object.keys(manifest.files),
		...Object.keys(manifest.rasters),
		manifestPath
	]);
	const managedDirectories = [
		{ directory: modelsDirectory, suffix: /\.json$/ },
		{ directory: `${artDirectory}/portraits`, suffix: /\.svg$/ },
		{ directory: artDirectory, suffix: /\.(json|svg|png)$/ },
		{ directory: generatedDirectory, suffix: /\.(json|ts)$/ }
	];
	const stale: string[] = [];
	for (const { directory, suffix } of managedDirectories) {
		for (const entry of await readdir(resolve(root, directory), { withFileTypes: true }).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === 'ENOENT') return [];
				throw error;
			}
		)) {
			const path = `${directory}/${entry.name}`;
			if (entry.isFile() && suffix.test(entry.name) && !expected.has(path)) stale.push(path);
		}
	}
	if (stale.length && !prune)
		throw new Error(
			`Stale anatomy outputs: ${stale.join(', ')}. Review the allowlist, then use --write --prune.`
		);
	let changed = 0;
	const mismatches: string[] = [];
	for (const [path, bytes] of output) {
		const existing = await get(path);
		if (existing?.equals(bytes)) continue;
		if (check) {
			mismatches.push(path);
			continue;
		}
		await mkdir(dirname(resolve(root, path)), { recursive: true });
		await writeFile(resolve(root, path), bytes);
		changed++;
	}
	if (check && mismatches.length)
		throw new Error(
			`Anatomy outputs are missing or stale: ${mismatches.join(', ')}. Run npm run essay-anatomy:generate.`
		);
	// Each target is a single enumerated regular file in one of the fixed managed folders.
	for (const path of stale) await unlink(resolve(root, path));
	console.log(
		check
			? `Essay anatomy: ${catalog.length} regenerated models/SVGs and raster pixels/provenance verified.`
			: `Essay anatomy: ${catalog.length} specimens; ${cached} cached models; ${changed} files updated; ${stale.length} stale files removed.`
	);
} finally {
	hook.deregister();
}
