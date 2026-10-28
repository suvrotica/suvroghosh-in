import assert from 'node:assert/strict';
import test from 'node:test';
import {
	checkCsp,
	checkDeploymentHeaders,
	checkSourceBoundary,
	checkWorkflow
} from './security-policy.mjs';

const pinned = 'a'.repeat(40);
function trustedGate() {
	return {
		on: { pull_request_target: {} },
		permissions: { contents: 'read' },
		jobs: {
			architecture: {
				steps: [
					{
						uses: `actions/checkout@${pinned}`,
						with: { ref: '${{ github.event.pull_request.base.sha }}', 'persist-credentials': false }
					},
					{ run: 'node scripts/check-architecture.mjs' }
				]
			}
		}
	};
}

test('checks actual CSP values and rejects executable script exceptions', () => {
	const config = {
		kit: {
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'https://va.vercel-scripts.com'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		}
	};
	assert.deepEqual(checkCsp(config), []);
	for (const extra of ['unsafe-inline', 'unsafe-eval', '*', 'https://unreviewed.example']) {
		const changed = structuredClone(config);
		changed.kit.csp.directives['script-src'].push(extra);
		assert.equal(checkCsp(changed).length, 1);
	}
	const changed = structuredClone(config);
	delete changed.kit.csp.directives['frame-ancestors'];
	assert.equal(checkCsp(changed).length, 1);
});

test('deployment-wide headers cannot be satisfied by a single-route rule', () => {
	const rule = {
		source: '/(.*)',
		headers: [
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'X-Content-Type-Options', value: 'nosniff' },
			{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
			{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
		]
	};
	assert.deepEqual(checkDeploymentHeaders({ headers: [rule] }), []);
	assert.equal(checkDeploymentHeaders({ headers: [{ ...rule, source: '/one-page' }] }).length, 4);
});

test('detects private imports in universal, dynamic, relative and Svelte modules', () => {
	for (const [path, source] of [
		['src/routes/+page.ts', "import { key } from '$env/static/private'"],
		['src/lib/helper.ts', "export { secret } from './server/secret'"],
		['src/lib/helper.ts', "const x = import('$lib/server/notes/supabase')"],
		['src/lib/helper.js', "const x = require('./private.server.js')"],
		[
			'src/routes/+page.svelte',
			'<script lang="ts">import { env } from \'$env/dynamic/private\';</script><p>Example</p>'
		],
		['src/routes/+page.ts', 'const secret = process.env.API_KEY']
	])
		assert.equal(checkSourceBoundary(path, source).length, 1, path);
});

test('allows server modules, public env, erased type imports and inert text', () => {
	for (const [path, source] of [
		['src/routes/+page.server.ts', "import { env } from '$env/dynamic/private'"],
		['src/routes/api/example/+server.ts', "import { env } from '$env/dynamic/private'"],
		['src/lib/server/task.ts', 'const secret = process.env.API_KEY'],
		['src/routes/+page.ts', "import { PUBLIC_FLAG } from '$env/static/public'"],
		['src/lib/helper.ts', "import type { Client } from './server/client'"],
		['src/lib/helper.ts', "export { type Client } from './server/client'"],
		['src/lib/helper.ts', '// import secret from "$env/static/private"'],
		['src/routes/+page.svelte', '<p>process.env.API_KEY</p>']
	])
		assert.deepEqual(checkSourceBoundary(path, source), [], path);
});

test('rejects movable action tags and persisted credentials', () => {
	const workflow = {
		on: 'pull_request',
		permissions: { contents: 'read' },
		jobs: { test: { steps: [{ uses: 'actions/checkout@v4' }] } }
	};
	assert.equal(checkWorkflow('.github/workflows/test.yml', workflow).length, 2);
	workflow.jobs.test.steps[0] = {
		uses: `actions/checkout@${pinned}`,
		with: { 'persist-credentials': false }
	};
	assert.deepEqual(checkWorkflow('.github/workflows/test.yml', workflow), []);
});

test('protects the trusted-base event from PR-head execution and added privileges', () => {
	const file = '.github/workflows/architecture.yml';
	assert.deepEqual(checkWorkflow(file, trustedGate()), []);
	for (const change of [
		(gate) => {
			gate.jobs.architecture.steps[0].with.ref = '${{ github.event.pull_request.head.sha }}';
		},
		(gate) => {
			gate.jobs.architecture.permissions = { contents: 'write' };
		},
		(gate) => {
			gate.jobs.architecture.env = { TOKEN: '${{ secrets.PROVIDER_KEY }}' };
		},
		(gate) => {
			gate.jobs.architecture.steps.push({ run: 'npm install && npm test' });
		},
		(gate) => {
			gate.jobs.architecture.steps.push({ run: "git('checkout', head)" });
		},
		(gate) => {
			gate.jobs.architecture.steps.push({ run: 'git checkout refs/pull/1/head' });
		},
		(gate) => {
			gate.jobs.architecture.steps.push({ run: 'echo "${{ github.event.pull_request.title }}"' });
		}
	]) {
		const gate = trustedGate();
		change(gate);
		assert.ok(checkWorkflow(file, gate).length > 0);
	}
});
