import { createServer } from 'vite';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// This benchmark isolates extraction and global analysis. It does not measure
// IndexedDB, browser ingestion, canvas frame rate, or a browser memory envelope.
const args = process.argv.slice(2);
const sizesAt = args.indexOf('--sizes');
const sizes = (sizesAt >= 0 ? args[sizesAt + 1] : '10000,100000,1000000').split(',').map(Number);
if (sizes.some((size) => !Number.isSafeInteger(size) || size <= 0)) {
	throw new Error('--sizes requires positive safe integer word counts.');
}
const outputAt = args.indexOf('--output');
const output = outputAt >= 0 ? args[outputAt + 1] : undefined;
const server = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	optimizeDeps: { noDiscovery: true },
	esbuild: { tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'ESNext' } } }
});
try {
	const { StreamingExtractor, mergeAggregates, analyseAggregates } = await server.ssrLoadModule(
		'/src/lib/visualizations/knowledge-gap-atlas/engine.ts'
	);
	const { DEFAULT_SETTINGS } = await server.ssrLoadModule(
		'/src/lib/visualizations/knowledge-gap-atlas/types.ts'
	);
	const fixtures = [
		'Urban trees provide shade beside walking routes and shaded routes improve neighbourhood access.',
		'Heat exposure affects older residents while community clinics track heat symptoms and access.',
		'Transport planning connects walking routes with clinics and buses serve neighbourhood residents.',
		'Library gardens support community learning and garden workshops teach residents about urban trees.'
	];
	const vocabulary = fixtures.join(' ').split(/\s+/u);
	const results = [];
	const cases = sizes.map((requestedWords) => ({
		requestedWords,
		shape: 'repeated-prose',
		vocabularySize: vocabulary.length
	}));
	cases.push({ requestedWords: 100000, shape: 'varied-vocabulary', vocabularySize: 5000 });
	const alphabeticId = (n) => {
		let value = '';
		do {
			value = String.fromCharCode(97 + (n % 26)) + value;
			n = Math.floor(n / 26) - 1;
		} while (n >= 0);
		return value;
	};
	for (const { requestedWords, shape, vocabularySize } of cases) {
		const extractor = new StreamingExtractor('benchmark-source', DEFAULT_SETTINGS);
		const terms = new Map();
		const edges = new Map();
		let words = 0;
		let chars = 0;
		let bytes = 0;
		let peakRss = process.memoryUsage().rss;
		const before = process.memoryUsage();
		const start = performance.now();
		const absorb = (delta) => {
			words += delta.words;
			for (const term of delta.terms) terms.set(term.id, mergeAggregates(terms.get(term.id), term));
			for (const edge of delta.edges) edges.set(edge.id, mergeAggregates(edges.get(edge.id), edge));
			peakRss = Math.max(peakRss, process.memoryUsage().rss);
		};
		for (let written = 0; written < requestedWords; ) {
			const count = Math.min(4096, requestedWords - written);
			const chunk =
				Array.from({ length: count }, (_, i) => {
					const at = written + i;
					return shape === 'repeated-prose'
						? vocabulary[at % vocabulary.length]
						: `concept${alphabeticId(at % vocabularySize)}${at % 12 === 11 ? '.' : ''}`;
				}).join(' ') + ' ';
			chars += chunk.length;
			bytes += Buffer.byteLength(chunk);
			absorb(extractor.push(chunk));
			written += count;
		}
		absorb(extractor.push('', true));
		const extractedAt = performance.now();
		const result = analyseAggregates(
			[...terms.values()],
			[...edges.values()],
			[
				{
					id: 'benchmark-source',
					projectId: 'benchmark',
					name: shape,
					role: 'target',
					bytes,
					chars,
					words,
					processedBytes: bytes,
					status: 'complete'
				}
			],
			DEFAULT_SETTINGS
		);
		const done = performance.now();
		peakRss = Math.max(peakRss, process.memoryUsage().rss);
		results.push({
			shape,
			requestedWords,
			countedWords: words,
			bytes,
			extractionMs: Math.round(extractedAt - start),
			graphMs: Math.round(done - extractedAt),
			totalMs: Math.round(done - start),
			uniqueTerms: terms.size,
			uniquePairs: edges.size,
			analysedConcepts: result.concepts.length,
			analysedEdges: result.edges.length,
			topics: result.topics.length,
			findings: result.findings.length,
			processRssBeforeMiB: +(before.rss / 1048576).toFixed(1),
			peakObservedProcessRssMiB: +(peakRss / 1048576).toFixed(1)
		});
	}
	const report = {
		measuredAt: new Date().toISOString(),
		node: process.version,
		platform: `${os.platform()} ${os.release()} ${os.arch()}`,
		cpu: os.cpus()[0]?.model ?? 'unavailable',
		logicalProcessors: os.cpus().length,
		systemMemoryGiB: +(os.totalmem() / 1073741824).toFixed(1),
		settings: DEFAULT_SETTINGS,
		limitations: [
			'Node/Vite engine microbenchmark, not browser end-to-end performance.',
			'Repeated vocabulary measures text throughput, not large-vocabulary graph capacity.',
			'RSS includes the Vite runtime and sampling does not establish exact peak memory.',
			'Test sizes are fixtures, not application input limits.'
		],
		results
	};
	if (output) {
		await mkdir(path.dirname(path.resolve(output)), { recursive: true });
		await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
	}
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
	await server.close();
}
