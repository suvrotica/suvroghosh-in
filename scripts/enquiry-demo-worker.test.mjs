import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EnquiryStore } from '../src/lib/server/enquiry-demo/store.ts';

const worker = fileURLToPath(new URL('./enquiry-demo-worker.mjs', import.meta.url));

test('independent worker processes recover a stopped claim and reuse the saved enquiry and message', () => {
	const temporaryRoot = realpathSync(tmpdir());
	const directory = mkdtempSync(join(temporaryRoot, 'enquiry-demo-worker-'));
	const path = join(directory, 'worker.sqlite');
	const run = (...args) => {
		const child = spawnSync(process.execPath, [worker, ...args], {
			env: { ...process.env, ENQUIRY_DEMO_DB: path },
			encoding: 'utf8',
			timeout: 10_000
		});
		assert.equal(child.status, 0, child.stderr || child.error?.message);
		return child.stdout;
	};
	let store;
	try {
		store = new EnquiryStore(path);
		const { enquiry } = store.submit({
			submissionId: randomUUID(),
			name: 'Worker Example',
			email: 'worker@example.org',
			city: 'Dubai',
			type: 'quotation',
			description: 'Please quote for routine maintenance at our fictional office.'
		});
		const originalJob = store.detail(enquiry.ref).ack.id;
		store.close();
		store = undefined;

		assert.match(run('--crash-after-claim'), /Stopped after claiming/);
		store = new EnquiryStore(path);
		assert.equal(store.detail(enquiry.ref).ack.status, 'processing');
		store.sandbox({ advanceMinutes: 2 });
		store.close();
		store = undefined;

		assert.match(run('--once'), /"recovered":1/);
		store = new EnquiryStore(path);
		assert.equal(store.detail(enquiry.ref).ack.status, 'failed');
		assert.equal(store.detail(enquiry.ref).ack.attempts, 1);
		store.sandbox({ advanceMinutes: 1 });
		store.close();
		store = undefined;

		assert.match(run('--once'), /"processed":1/);
		store = new EnquiryStore(path);
		const recovered = store.detail(enquiry.ref);
		assert.equal(recovered.ack.status, 'succeeded');
		assert.equal(recovered.ack.attempts, 2);
		assert.equal(recovered.ack.id, originalJob);
		assert.equal(store.list().length, 1);
		assert.ok(recovered.history.some((event) => event.kind === 'ack-recovered'));
	} finally {
		store?.close();
		const cleanupTarget = realpathSync(directory);
		assert.equal(dirname(cleanupTarget), temporaryRoot);
		assert.ok(basename(cleanupTarget).startsWith('enquiry-demo-worker-'));
		rmSync(cleanupTarget, { recursive: true, force: true });
	}
});
