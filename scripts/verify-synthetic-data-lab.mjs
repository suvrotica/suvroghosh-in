import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { unzipSync, strFromU8 } from 'fflate';
import {
	defaultConfig,
	loadPreset,
	presetDefinitions
} from '../src/lib/synthetic-data-lab/presets.ts';

const origin = process.env.SYNTHETIC_LAB_VERIFY_URL || 'http://127.0.0.1:5175';
const page = await fetch(`${origin}/tools/synthetic-data-lab`);
assert.equal(page.status, 200);
const cookie = page.headers
	.getSetCookie()
	.map((value) => value.split(';')[0])
	.join('; ');
assert.ok(cookie.includes('synthetic-lab-owner='), 'SSR establishes the private owner session');
await page.arrayBuffer();
const api = `${origin}/api/synthetic-data-lab/`;
async function call(path, body) {
	let response;
	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetch(api + path, {
			method: body === undefined ? 'GET' : 'POST',
			headers: {
				Cookie: cookie,
				Origin: origin,
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {})
		});
		if (response.status !== 429 || (body !== undefined && path !== 'preview') || attempt === 2)
			break;
		await response.arrayBuffer();
		await new Promise((resolve) =>
			setTimeout(
				resolve,
				Math.min(5, Math.max(1, Number(response.headers.get('retry-after')) || 1)) * 1000
			)
		);
	}
	if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
	return response;
}
const report = { origin, checked_at: new Date().toISOString(), presets: [], checks: [] };
const capabilities = await (await call('capabilities')).json();
assert.ok(capabilities.distributions.length >= 31);
assert.equal(capabilities.factor_coverage.length, 423);
for (const preset of presetDefinitions) {
	const config = loadPreset(preset.id);
	config.rows = Math.min(config.rows, 1000);
	if (config.event.enabled) config.event.count = 1000;
	const start = performance.now();
	const result = await (await call('preview', { config })).json();
	assert.ok(result.row_count > 0, `${preset.id} generated observations`);
	assert.ok(result.columns.length > 0);
	assert.ok(
		result.validation.every((check) => check.status !== 'fail'),
		JSON.stringify(result.validation)
	);
	assert.equal(result.ground_truth, undefined, 'ordinary result excludes diagnostic truth');
	if (config.domain?.type === 'relational') assert.ok(result.tables.children.row_count > 0);
	if (config.domain?.type === 'graph') assert.ok(result.tables.edges.row_count > 0);
	if (config.domain?.type === 'survival') assert.ok(result.domain.kaplan_meier.length > 1);
	report.presets.push({
		id: preset.id,
		rows: result.row_count,
		columns: result.columns.length,
		milliseconds: Math.round(performance.now() - start)
	});
	console.log(`Verified ${preset.id}: ${result.row_count} rows.`);
}
const normal = defaultConfig();
normal.rows = 1000;
normal.variables = [normal.variables[0]];
normal.outcome.task = 'none';
const before = await (await call('preview', { config: normal })).json();
normal.variables[0].parameters.mean = 3;
const after = await (await call('preview', { config: normal })).json();
assert.ok(Math.abs(after.stats.feature_x.mean - before.stats.feature_x.mean - 3) < 1e-10);
assert.ok(Math.abs(after.stats.feature_x.std - before.stats.feature_x.std) < 1e-10);
report.checks.push(
	'Changing mean shifts the same seeded realization by exactly three without changing spread.'
);
let job = await (
	await call('jobs', { config: normal, idempotency_key: 'verification-normal-v1' })
).json();
for (
	let attempt = 0;
	attempt < 100 && !['completed', 'failed', 'cancelled'].includes(job.status);
	attempt++
) {
	await new Promise((resolve) => setTimeout(resolve, 150));
	job = await (await call(`jobs/${job.job_id}`)).json();
}
assert.equal(job.status, 'completed', job.error);
const resultId = job.result_id;
const firstCSV = new Uint8Array(
	await (await call(`results/${resultId}/download?format=csv`)).arrayBuffer()
);
const secondCSV = new Uint8Array(
	await (await call(`results/${resultId}/download?format=csv`)).arrayBuffer()
);
assert.deepEqual(firstCSV, secondCSV, 'downloads preserve one immutable result');
assert.equal(new TextDecoder().decode(firstCSV).trimEnd().split('\n').length, 1001);
const zip = new Uint8Array(
	await (await call(`results/${resultId}/download?format=zip&truth=true`)).arrayBuffer()
);
const files = unzipSync(zip);
assert.deepEqual(files['dataset.csv'], firstCSV);
assert.ok(files['validation_report.json']);
assert.ok(files['generation_manifest.json']);
assert.equal(JSON.parse(strFromU8(files['configuration.json'])).seed, normal.seed);
report.checks.push(
	'Completed job, repeat CSV bytes, CSV row count, ZIP dataset identity, configuration and validation/provenance artifacts.'
);
await mkdir(new URL('../.codex-artifacts/synthetic-data-lab/', import.meta.url), {
	recursive: true
});
await writeFile(
	new URL('../.codex-artifacts/synthetic-data-lab/example.csv', import.meta.url),
	firstCSV
);
await writeFile(
	new URL('../.codex-artifacts/synthetic-data-lab/example-bundle.zip', import.meta.url),
	zip
);
await writeFile(
	new URL('../.codex-artifacts/synthetic-data-lab/http-verification.json', import.meta.url),
	JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
