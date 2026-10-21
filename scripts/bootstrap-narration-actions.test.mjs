import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapNarrationActions } from './bootstrap-narration-actions.mjs';

test('an existing state branch aborts before any secret, variable or encryption-key mutation', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-guard-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const calls = [];
	const gh = (args) => {
		calls.push(args);
		if (args[1] === 'repos/suvrotica/suvroghosh-in')
			return JSON.stringify({ private: false, id: 1201239670, default_branch: 'main' });
		return '';
	};
	await assert.rejects(bootstrapNarrationActions({ root, env: {}, gh }), /already configured/);
	assert(calls.every((args) => args[0] === 'api'));
	await assert.rejects(
		fs.access(path.join(root, '.codex-artifacts/narration-state-key')),
		/ENOENT/
	);
});

test('an orphaned checkpoint release also preserves existing secrets instead of resetting state', async () => {
	const calls = [];
	const gh = (args) => {
		calls.push(args);
		if (args[1] === 'repos/suvrotica/suvroghosh-in')
			return JSON.stringify({ private: false, id: 1201239670, default_branch: 'main' });
		if (args[1].includes('/git/ref/')) {
			const error = new Error('not found');
			error.stderr = Buffer.from('gh: Not Found (HTTP 404)');
			throw error;
		}
		return '';
	};
	await assert.rejects(bootstrapNarrationActions({ env: {}, gh }), /already configured/);
	assert(calls.every((args) => args[0] === 'api'));
});

test('authorization failures and hosted invocation cannot be mistaken for a missing state branch', async () => {
	let calls = 0;
	const gh = (args) => {
		calls++;
		if (args[1] === 'repos/suvrotica/suvroghosh-in')
			return JSON.stringify({ private: false, id: 1201239670, default_branch: 'main' });
		const error = new Error('unauthorized');
		error.stderr = Buffer.from('gh: Unauthorized (HTTP 401)');
		throw error;
	};
	await assert.rejects(bootstrapNarrationActions({ env: {}, gh }), /unauthorized/);
	assert.equal(calls, 2);
	calls = 0;
	await assert.rejects(
		bootstrapNarrationActions({ env: { GITHUB_ACTIONS: 'true' }, gh }),
		/cannot bootstrap/
	);
	assert.equal(calls, 0);
});
