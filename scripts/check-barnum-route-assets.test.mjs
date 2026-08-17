import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	BARNUM_ROUTE_ASSET_BUDGET,
	BARNUM_RUNTIME_ENTRY,
	BARNUM_SHELL_ENTRY,
	auditBarnumLazyBoundary,
	auditBarnumRouteAssets
} from './check-barnum-route-assets.mjs';

function fixture() {
	const clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'barnum-route-assets-'));
	const files = {
		'_app/nodes/barnum.js': 'export const route = "barnum";',
		'_app/posts/barnum.js': 'export const post = "local";',
		'_app/runtime/barnum.js': 'export const runtime = "activation only";',
		'_app/chunks/shared.js': 'export const shared = true;',
		'_app/assets/barnum.css': '.barnum{display:block}'
	};
	for (const [file, contents] of Object.entries(files)) {
		const absolutePath = path.join(clientRoot, file);
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
		fs.writeFileSync(absolutePath, contents);
	}
	const manifest = {
		'.svelte-kit/generated/client-optimized/nodes/15.js': {
			file: '_app/nodes/generic.js',
			dynamicImports: ['_barnum-post.js', 'src/lib/posts/double-pendulum-chaos.md']
		},
		'.svelte-kit/generated/client-optimized/nodes/16.js': {
			file: '_app/nodes/barnum.js',
			imports: ['_shared.js'],
			dynamicImports: ['_barnum-post.js']
		},
		'_barnum-post.js': {
			file: '_app/posts/barnum.js',
			imports: ['_shared.js'],
			dynamicImports: [BARNUM_RUNTIME_ENTRY],
			css: ['_app/assets/barnum.css']
		},
		[BARNUM_RUNTIME_ENTRY]: {
			file: '_app/runtime/barnum.js',
			isDynamicEntry: true
		},
		'_shared.js': { file: '_app/chunks/shared.js' }
	};
	return { clientRoot, manifest };
}

test('the route audit chooses the one-post literal route and counts each static asset once', (t) => {
	const { clientRoot, manifest } = fixture();
	t.after(() => fs.rmSync(clientRoot, { recursive: true, force: true }));
	const report = auditBarnumRouteAssets({ manifest, clientRoot });
	assert.equal(report.routeEntry, '.svelte-kit/generated/client-optimized/nodes/16.js');
	assert.equal(report.postEntry, '_barnum-post.js');
	assert.equal(report.totals.assetCount, 4);
	assert.deepEqual(report.forbiddenAssets, []);
	assert.deepEqual(report.budgetFailures, []);
	assert.ok(report.totals.cssRawBytes < BARNUM_ROUTE_ASSET_BUDGET.cssRawBytes);
});

test('the route audit reports unrelated named assets and deterministic budget excesses', (t) => {
	const { clientRoot, manifest } = fixture();
	t.after(() => fs.rmSync(clientRoot, { recursive: true, force: true }));
	const unrelated = '_app/assets/double-pendulum-chaos.css';
	fs.writeFileSync(
		path.join(clientRoot, unrelated),
		'x'.repeat(BARNUM_ROUTE_ASSET_BUDGET.cssRawBytes + 1)
	);
	manifest['_barnum-post.js'].css.push(unrelated);

	const report = auditBarnumRouteAssets({ manifest, clientRoot });
	assert.deepEqual(
		report.forbiddenAssets.map(({ file }) => file),
		[unrelated]
	);
	assert.ok(
		report.budgetFailures.some(({ metric }) => metric === 'cssRawBytes'),
		'raw CSS budget must fail independently of compression'
	);
});

test('the intro shell keeps the generated Barnum corpus behind the activation boundary', () => {
	const accepted = auditBarnumLazyBoundary({
		shellSource: fs.readFileSync(path.resolve(BARNUM_SHELL_ENTRY), 'utf8')
	});
	assert.deepEqual(accepted.failures, []);

	const rejected = auditBarnumLazyBoundary({
		shellSource: `
			import BarnumLabRuntime from './BarnumLabRuntime.svelte';
			import { createInitialLabState } from '..';
			import { SURFACE_SENTENCES } from '../data/surface-sentences.en.generated';
		`
	});
	assert.ok(rejected.failures.some((failure) => failure.includes('awaited dynamic import')));
	assert.ok(
		rejected.failures.some((failure) => failure.includes('must not be a static value import'))
	);
	assert.ok(rejected.failures.some((failure) => failure.endsWith(': ..')));
	assert.ok(rejected.failures.some((failure) => failure.includes('surface-sentences')));
});
