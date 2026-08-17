import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const BARNUM_POST_ENTRY = 'src/lib/posts/the-profile-that-knows-almost-nothing-about-you.md';
export const BARNUM_SHELL_ENTRY = 'src/lib/visualizations/barnum-lab/components/BarnumLab.svelte';
export const BARNUM_RUNTIME_SPECIFIER = './BarnumLabRuntime.svelte';
export const BARNUM_RUNTIME_ENTRY =
	'src/lib/visualizations/barnum-lab/components/BarnumLabRuntime.svelte';

// The activation-only corpus/runtime must stay outside this initial static closure.
// These ceilings leave normal chunk-hash variation while catching an eager corpus import,
// accidental duplication, or a return to the all-post route glob.
export const BARNUM_ROUTE_ASSET_BUDGET = Object.freeze({
	cssRawBytes: 110 * 1024,
	cssGzipBytes: 24 * 1024,
	jsRawBytes: 320 * 1024,
	jsGzipBytes: 110 * 1024,
	assetCount: 31
});

export const FORBIDDEN_ROUTE_ASSET_MARKERS = Object.freeze([
	'artificial-life',
	'belousov-zhabotinsky',
	'brownian-motion',
	'domain-coloring',
	'double-pendulum',
	'fertilization-calcium',
	'gradient-descent',
	'hello-fragment',
	'hello-observable',
	'living-aperture',
	'monte-carlo',
	'neuron-zoo',
	'ray-marching',
	'reaction-diffusion',
	'spacetime-laboratory',
	'static-equilibrium',
	'weather-inside-the-nucleus'
]);

function isJavaScript(file) {
	return /\.m?js$/iu.test(file);
}

function isStylesheet(file) {
	return /\.css$/iu.test(file);
}

export function auditBarnumLazyBoundary({ shellSource }) {
	const failures = [];
	const staticValueImports = [
		...shellSource.matchAll(/^\s*import\s+(?!type\b)[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;/gmu)
	].map((match) => match[1]);
	const runtimeImport = `await import('${BARNUM_RUNTIME_SPECIFIER}')`;

	if (!shellSource.includes(runtimeImport)) {
		failures.push(
			'The intro shell must load BarnumLabRuntime.svelte with an awaited dynamic import.'
		);
	}
	if (staticValueImports.includes(BARNUM_RUNTIME_SPECIFIER)) {
		failures.push('BarnumLabRuntime.svelte must not be a static value import of the intro shell.');
	}

	for (const source of staticValueImports) {
		if (
			source === '..' ||
			source.startsWith('../core') ||
			source.startsWith('../data') ||
			source.includes('/generated/') ||
			source.includes('surface-bank') ||
			source.includes('surface-sentences')
		) {
			failures.push(`The intro shell has a forbidden eager Barnum data/runtime import: ${source}`);
		}
	}

	return { staticValueImports, failures };
}

function collectStaticClosure(manifest, entryKeys) {
	const visitedEntries = new Set();
	const files = new Set();

	function visit(entryKey) {
		if (visitedEntries.has(entryKey)) return;
		visitedEntries.add(entryKey);
		const entry = manifest[entryKey];
		if (!entry) throw new Error(`Missing Vite manifest entry ${entryKey}`);
		if (entry.file) files.add(entry.file);
		for (const stylesheet of entry.css ?? []) files.add(stylesheet);
		for (const importedEntry of entry.imports ?? []) visit(importedEntry);
	}

	for (const entryKey of entryKeys) visit(entryKey);
	return { entryKeys: [...visitedEntries].sort(), files: [...files].sort() };
}

function findBarnumPostEntry(manifest) {
	if (manifest[BARNUM_POST_ENTRY]) return BARNUM_POST_ENTRY;

	// Vite inserts an anonymous facade when a Markdown module owns a nested
	// dynamic import. Resolve that facade through the unique Barnum runtime edge
	// instead of depending on its content-hashed private key.
	const facadeCandidates = Object.entries(manifest)
		.filter(([, entry]) => (entry.dynamicImports ?? []).includes(BARNUM_RUNTIME_ENTRY))
		.map(([entryKey]) => entryKey)
		.sort((left, right) => left.localeCompare(right, 'en'));
	if (facadeCandidates.length !== 1) {
		throw new Error(
			`Expected exactly one Barnum post entry or runtime facade; found ${facadeCandidates.length}: ${JSON.stringify(facadeCandidates)}`
		);
	}
	return facadeCandidates[0];
}

function findLiteralBarnumRouteEntry(manifest, postEntry) {
	const candidates = Object.entries(manifest)
		.filter(
			([entryKey, entry]) =>
				entryKey.includes('generated/client-optimized/nodes/') &&
				(entry.dynamicImports ?? []).includes(postEntry)
		)
		.map(([entryKey, entry]) => ({
			entryKey,
			dynamicImportCount: entry.dynamicImports?.length ?? 0
		}))
		.sort(
			(left, right) =>
				left.dynamicImportCount - right.dynamicImportCount ||
				left.entryKey.localeCompare(right.entryKey, 'en')
		);

	const literalCandidates = candidates.filter(({ dynamicImportCount }) => dynamicImportCount === 1);
	if (literalCandidates.length !== 1) {
		throw new Error(
			`Expected exactly one literal Barnum route entry; found ${literalCandidates.length}. Candidates: ${JSON.stringify(candidates)}`
		);
	}
	return literalCandidates[0].entryKey;
}

export function auditBarnumRouteAssets({ manifest, clientRoot }) {
	if (!manifest[BARNUM_RUNTIME_ENTRY]) {
		throw new Error(
			`Barnum runtime entry is missing from the Vite manifest: ${BARNUM_RUNTIME_ENTRY}`
		);
	}

	const postEntry = findBarnumPostEntry(manifest);
	const routeEntry = findLiteralBarnumRouteEntry(manifest, postEntry);
	const closure = collectStaticClosure(manifest, [routeEntry, postEntry]);
	const totals = {
		cssRawBytes: 0,
		cssGzipBytes: 0,
		jsRawBytes: 0,
		jsGzipBytes: 0,
		assetCount: closure.files.length
	};
	const assets = [];

	for (const file of closure.files) {
		const absolutePath = path.join(clientRoot, file);
		if (!fs.existsSync(absolutePath)) throw new Error(`Built route asset is missing: ${file}`);
		const bytes = fs.readFileSync(absolutePath);
		const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
		const kind = isStylesheet(file) ? 'css' : isJavaScript(file) ? 'js' : 'other';
		if (kind === 'css') {
			totals.cssRawBytes += bytes.byteLength;
			totals.cssGzipBytes += gzipBytes;
		} else if (kind === 'js') {
			totals.jsRawBytes += bytes.byteLength;
			totals.jsGzipBytes += gzipBytes;
		}
		assets.push({ file, kind, rawBytes: bytes.byteLength, gzipBytes });
	}

	const forbiddenAssets = assets.filter(({ file }) => {
		const normalized = file.toLocaleLowerCase('en');
		return FORBIDDEN_ROUTE_ASSET_MARKERS.some((marker) => normalized.includes(marker));
	});
	const budgetFailures = Object.entries(BARNUM_ROUTE_ASSET_BUDGET)
		.filter(([metric, limit]) => totals[metric] > limit)
		.map(([metric, limit]) => ({ metric, actual: totals[metric], limit }));

	return {
		routeEntry,
		postEntry,
		sourcePostEntry: BARNUM_POST_ENTRY,
		totals,
		budget: BARNUM_ROUTE_ASSET_BUDGET,
		forbiddenAssets,
		budgetFailures,
		assets
	};
}

export function runBarnumRouteAssetAudit({
	manifestPath = path.resolve('.svelte-kit/output/client/.vite/manifest.json'),
	shellPath = path.resolve(BARNUM_SHELL_ENTRY)
} = {}) {
	if (!fs.existsSync(manifestPath)) {
		throw new Error(
			`Built client manifest not found at ${manifestPath}. Run npm run build:site first.`
		);
	}
	const clientRoot = path.resolve(path.dirname(manifestPath), '..');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	if (!fs.existsSync(shellPath)) throw new Error(`Barnum intro shell is missing: ${shellPath}`);
	const report = auditBarnumRouteAssets({ manifest, clientRoot });
	const lazyBoundary = auditBarnumLazyBoundary({ shellSource: fs.readFileSync(shellPath, 'utf8') });
	return { ...report, lazyBoundary };
}

function main() {
	const report = runBarnumRouteAssetAudit();
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	if (
		report.forbiddenAssets.length > 0 ||
		report.budgetFailures.length > 0 ||
		report.lazyBoundary.failures.length > 0
	) {
		process.exitCode = 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
