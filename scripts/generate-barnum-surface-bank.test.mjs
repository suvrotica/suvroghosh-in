import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const artifactRoot = resolve(repositoryRoot, '.codex-artifacts');
const outputRelative = 'src/lib/visualizations/barnum-lab/data/surface-sentences.en.generated.ts';

function fixture(t) {
	mkdirSync(artifactRoot, { recursive: true });
	// Keep fixtures below the repository so the real generator can resolve Prettier
	// and its configuration without copying dependencies or changing the corpus.
	const root = mkdtempSync(resolve(artifactRoot, 'barnum-surface-bank-'));
	t.after(() => {
		assert.ok(root.startsWith(artifactRoot + sep), 'cleanup must stay inside the fixture root');
		rmSync(root, { recursive: true, force: true });
	});
	for (const relative of [
		'scripts/generate-barnum-surface-bank.ts',
		'src/lib/visualizations/barnum-lab/core/surface-text.ts',
		'src/lib/visualizations/barnum-lab/data/forbidden-corpus-topics.ts',
		'src/lib/visualizations/barnum-lab/data/surface-bank-source.en.ts',
		'src/lib/visualizations/barnum-lab/data/surface-bank-extra-source.en.ts'
	]) {
		const target = resolve(root, relative);
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(resolve(repositoryRoot, relative), target);
	}
	writeFileSync(resolve(root, 'package.json'), JSON.stringify({ type: 'module' }));
	const run = (...args) =>
		spawnSync(
			process.execPath,
			[
				'--experimental-strip-types',
				resolve(root, 'scripts/generate-barnum-surface-bank.ts'),
				...args
			],
			{
				cwd: repositoryRoot,
				encoding: 'utf8',
				timeout: 30_000
			}
		);
	const generated = run();
	assert.equal(generated.status, 0, generated.stderr);
	const outputPath = resolve(root, outputRelative);
	return { run, outputPath, canonical: readFileSync(outputPath, 'utf8') };
}

test('the actual surface-bank check accepts both LF and CRLF without rewriting either', (t) => {
	const { run, outputPath, canonical } = fixture(t);
	assert.ok(canonical.includes('\n'));
	assert.ok(!canonical.includes('\r'));
	for (const bytes of [canonical, canonical.replace(/\n/g, '\r\n')]) {
		writeFileSync(outputPath, bytes);
		const checked = run('--check');
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /surface bank current: 720 generic \+ 342 feedback lines/);
		assert.equal(readFileSync(outputPath, 'utf8'), bytes, 'check must remain read-only');
	}
});

test('the actual surface-bank check still rejects changed or missing generated output', (t) => {
	const { run, outputPath, canonical } = fixture(t);
	const stale = canonical.replace('You ', 'They ');
	assert.notEqual(stale, canonical, 'fixture must actually change a generated sentence');
	writeFileSync(outputPath, stale.replace(/\n/g, '\r\n'));
	const changed = run('--check');
	assert.notEqual(changed.status, 0);
	assert.match(changed.stderr, /committed Barnum v2 surface bank is stale/);
	assert.equal(readFileSync(outputPath, 'utf8'), stale.replace(/\n/g, '\r\n'));
	rmSync(outputPath);
	const missing = run('--check');
	assert.notEqual(missing.status, 0);
	assert.match(missing.stderr, /committed Barnum v2 surface bank is stale/);
});
