import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
// Dev-only integrity probe: Vite serves the actual feature modules to a fresh
// browser context. This isolates persistent storage/worker recovery from page UI.
const origin = process.env.KNOWLEDGE_GAP_ATLAS_BASE_URL || 'http://127.0.0.1:4329';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
	throw new Error('Run this integrity probe only against a loopback Vite dev server.');
}
const outputIndex = process.argv.indexOf('--output');
const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
(async () => {
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
		headless: true
	});
	try {
		const context = await browser.newContext({ serviceWorkers: 'block' });
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(new URL('/robots.txt', origin).href, {
			waitUntil: 'domcontentloaded',
			timeout: 30000
		});
		const output = await page.evaluate(async () => {
			const storage = await import('/src/lib/visualizations/knowledge-gap-atlas/storage.ts');
			const exports = await import('/src/lib/visualizations/knowledge-gap-atlas/exports.ts');
			const { DEFAULT_SETTINGS } =
				await import('/src/lib/visualizations/knowledge-gap-atlas/types.ts');
			const { StreamingExtractor } =
				await import('/src/lib/visualizations/knowledge-gap-atlas/engine.ts');
			const project = await storage.createProject('Storage integrity probe');
			const started = performance.now();
			const text =
				'Tree canopy cools streets and shelters pedestrians. Indoor temperature changes with insulation and ventilation. Cooling protects public health. বাংলা শহর ভালো থাকে।\r\n'.repeat(
					50000
				);
			await storage.addSources(project.id, [
				{
					name: 'synthetic-integrity.txt',
					role: 'target',
					file: new File([text], 'synthetic-integrity.txt', { type: 'text/plain' })
				}
			]);
			const importedAt = performance.now();
			const [source] = await storage.listSources(project.id);
			const run = (cancel) =>
				new Promise((resolve, reject) => {
					const worker = new Worker('/src/lib/visualizations/knowledge-gap-atlas/atlas.worker.ts', {
						type: 'module'
					});
					const jobId = crypto.randomUUID();
					let sent = false;
					const timeout = setTimeout(() => {
						worker.terminate();
						reject(new Error('Worker timeout'));
					}, 90000);
					worker.onerror = (e) => {
						clearTimeout(timeout);
						worker.terminate();
						reject(new Error(e.message));
					};
					worker.onmessage = ({ data }) => {
						if (data.type === 'progress' && cancel && !sent && data.progress.words > 0) {
							sent = true;
							if (cancel === 'terminate') {
								worker.terminate();
								clearTimeout(timeout);
								resolve({ type: 'cancelled', forced: true });
								return;
							}
							worker.postMessage({ type: 'cancel', jobId });
						}
						if (['complete', 'cancelled', 'error'].includes(data.type)) {
							clearTimeout(timeout);
							worker.terminate();
							if (data.type === 'error') reject(new Error(data.message));
							else resolve(data);
						}
					};
					worker.postMessage({
						type: 'analyse',
						projectId: project.id,
						jobId,
						settings: DEFAULT_SETTINGS
					});
				});
			const paused = await run('terminate');
			if (paused.type !== 'cancelled') throw new Error('Cancellation was not acknowledged');
			const checkpoint = await storage.atlasDB().checkpoints.get(project.id);
			if (!checkpoint || checkpoint.chunkIndex < 1) throw new Error('No committed checkpoint');
			const completed = await run(false);
			const analysedAt = performance.now();
			if (completed.type !== 'complete') throw new Error('Resume failed');
			const extractor = new StreamingExtractor(source.id, DEFAULT_SETTINGS);
			let expectedWords = 0;
			const termCounts = new Map();
			const edgeCounts = new Map();
			for (const chunk of storage.splitText(text, 17001)) {
				const delta = extractor.push(chunk);
				expectedWords += delta.words;
				for (const t of delta.terms) termCounts.set(t.id, (termCounts.get(t.id) || 0) + t.count);
				for (const e of delta.edges) edgeCounts.set(e.id, (edgeCounts.get(e.id) || 0) + e.count);
			}
			const last = extractor.push('', true);
			expectedWords += last.words;
			for (const t of last.terms) termCounts.set(t.id, (termCounts.get(t.id) || 0) + t.count);
			for (const e of last.edges) edgeCounts.set(e.id, (edgeCounts.get(e.id) || 0) + e.count);
			const terms = await storage.atlasDB().terms.where('projectId').equals(project.id).toArray();
			const edges = await storage.atlasDB().edges.where('projectId').equals(project.id).toArray();
			if (completed.result.words !== expectedWords)
				throw new Error(`Wrong resumed words: ${completed.result.words} vs ${expectedWords}`);
			if (terms.some((t) => termCounts.get(t.id) !== t.count) || terms.length !== termCounts.size)
				throw new Error('Resumed term counts differ from clean extraction');
			if (edges.some((e) => edgeCounts.get(e.id) !== e.count) || edges.length !== edgeCounts.size)
				throw new Error('Resumed edge counts differ from clean extraction');
			for (const offset of [0, 16380, text.length - 5000]) {
				const p = await storage.readSourcePage(project.id, source.id, offset, 5000);
				if (p.text !== text.slice(offset, offset + 5000))
					throw new Error('Source paging lost text at ' + offset);
			}
			const saved = await storage.getProject(project.id);
			saved.questions.push({
				id: 'probe-q',
				text: 'What connects cooling and health?',
				note: 'Roundtrip check',
				status: 'investigate',
				evidence: completed.result.concepts[0].evidence
			});
			await storage.saveProject(saved);
			const parts = [];
			for await (const line of exports.projectRecords(project.id, true)) parts.push(line);
			const imported = await exports.importProject(
				new File(parts, 'probe.atlas.ndjson', { type: 'application/x-ndjson' })
			);
			if (imported.result.words !== expectedWords || imported.questions.length !== 1)
				throw new Error('Project metadata did not roundtrip');
			const [importedSource] = await storage.listSources(imported.id);
			const restored = await storage.readSourcePage(
				imported.id,
				importedSource.id,
				text.length - 5000,
				5000
			);
			if (restored.text !== text.slice(-5000)) throw new Error('Source text did not roundtrip');
			const proof = await storage.readEvidence(imported.id, imported.questions[0].evidence[0]);
			if (!proof.text) throw new Error('Remapped evidence missing');
			await storage.deleteProject(project.id);
			await storage.deleteProject(imported.id);
			return {
				bytes: source.bytes,
				words: expectedWords,
				pausedAfterWords: checkpoint.words,
				terms: terms.length,
				edges: edges.length,
				importMs: Math.round(importedAt - started),
				analysisIncludingPauseMs: Math.round(analysedAt - importedAt),
				totalProbeMs: Math.round(performance.now() - started),
				browser: navigator.userAgent,
				logicalProcessors: navigator.hardwareConcurrency,
				forcedTermination: paused.forced,
				cancelResume: 'exact',
				sourcePaging: 'exact',
				exportImport: 'exact',
				evidence: 'remapped',
				deleted: true
			};
		});
		const report = {
			measuredAt: new Date().toISOString(),
			limitations: [
				'Dev-only browser storage and worker integrity probe, not full app UI performance.',
				'Repeated mixed English/Bengali prose; does not establish high-vocabulary graph capacity.'
			],
			output,
			errors
		};
		if (outputFile) await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
		console.log(JSON.stringify(report, null, 2));
		if (errors.length) throw new Error('Browser errors occurred during the integrity probe.');
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
