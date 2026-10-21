import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	createNarrationQuota,
	NarrationQuotaError,
	nextPacificMidnight,
	pacificDateKey
} from './lib/narration-quota.mjs';
import { GoogleTTSError } from './lib/google-tts.mjs';

async function fixture(t, options = {}) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-quota-test-'));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	let current = Date.parse(options.at ?? '2026-10-21T12:00:00.000Z');
	const waits = [];
	const progress = [];
	const stateFile = path.join(directory, 'quota.json');
	const settings = {
		stateFile,
		now: () => current,
		sleep: async (milliseconds) => {
			waits.push(milliseconds);
			current += milliseconds;
		},
		onProgress: (event) => progress.push(event),
		...options
	};
	delete settings.at;
	return {
		stateFile,
		waits,
		progress,
		settings,
		quota: createNarrationQuota(settings),
		setTime: (value) => {
			current = typeof value === 'string' ? Date.parse(value) : value;
		},
		getTime: () => current
	};
}

test('Pacific dates and next resets honor standard time, daylight time and DST transitions', () => {
	assert.equal(pacificDateKey(Date.parse('2026-10-21T06:59:59.999Z')), '2026-10-20');
	assert.equal(pacificDateKey(Date.parse('2026-10-21T07:00:00.000Z')), '2026-10-21');
	assert.equal(
		nextPacificMidnight(Date.parse('2026-01-12T12:00:00Z')),
		Date.parse('2026-01-13T08:00:00Z')
	);
	assert.equal(
		nextPacificMidnight(Date.parse('2026-07-12T12:00:00Z')),
		Date.parse('2026-07-13T07:00:00Z')
	);
	const spring = Date.parse('2026-03-08T08:00:00Z');
	const autumn = Date.parse('2026-11-01T07:00:00Z');
	assert.equal(nextPacificMidnight(spring) - spring, 23 * 60 * 60 * 1000);
	assert.equal(nextPacificMidnight(autumn) - autumn, 25 * 60 * 60 * 1000);
	assert.equal(
		nextPacificMidnight(Date.parse('2026-10-21T06:59:59.999Z')),
		Date.parse('2026-10-21T07:00:00Z')
	);
});

test('configuration forbids raising the verified daily cap or reducing request spacing', async (t) => {
	const f = await fixture(t);
	for (const dailyLimit of [0, 11, 2.5, NaN])
		assert.throws(() => createNarrationQuota({ ...f.settings, dailyLimit }), { code: 'CONFIG' });
	for (const minIntervalMs of [0, 64_999, 65_000.5, Infinity])
		assert.throws(() => createNarrationQuota({ ...f.settings, minIntervalMs }), { code: 'CONFIG' });
	assert.throws(() => createNarrationQuota({ ...f.settings, stateFile: 'quota.json' }), {
		code: 'CONFIG'
	});
	assert.throws(() => createNarrationQuota({ ...f.settings, initialUsed: 1 }), { code: 'CONFIG' });
	assert.throws(
		() => createNarrationQuota({ ...f.settings, initialUsed: 1, initialUsedDate: '2026-02-30' }),
		{ code: 'CONFIG' }
	);
});

test('reservations are durable before transport, count failed attempts, and pace waits in bounded increments', async (t) => {
	const f = await fixture(t, { dailyLimit: 3 });
	const first = await f.quota.beforeRequest();
	assert.equal(first.used, 1);
	assert.equal(JSON.parse(await fs.readFile(f.stateFile, 'utf8')).used, 1);
	// An unsuccessful provider call has no refund; the next reservation still starts from one.
	const second = await f.quota.beforeRequest();
	assert.equal(second.used, 2);
	assert.equal(second.lastRequestAt - first.lastRequestAt, 65_000);
	assert.deepEqual(f.waits, [60_000, 5_000]);
	await f.quota.beforeRequest();
	await assert.rejects(f.quota.beforeRequest(), (error) => {
		assert.ok(error instanceof NarrationQuotaError);
		assert.ok(error instanceof GoogleTTSError);
		assert.equal(error.code, 'DAILY_LIMIT');
		assert.equal(error.nextResetAt, Date.parse('2026-10-22T07:00:00Z'));
		assert.match(error.message, /2026-10-22T07:00:00.000Z/);
		return true;
	});
	assert.equal((await f.quota.inspect()).used, 3);
	assert.ok(f.progress.every((event) => !JSON.stringify(event).includes('api-key')));
});

test('restarts preserve spacing and usage, and do not reseed an existing ledger', async (t) => {
	const f = await fixture(t, { initialUsed: 1, initialUsedDate: '2026-10-21' });
	assert.equal((await f.quota.inspect()).used, 1);
	await f.quota.beforeRequest();
	const restarted = createNarrationQuota({ ...f.settings, initialUsed: 9 });
	assert.equal((await restarted.inspect()).used, 2);
	await restarted.beforeRequest();
	assert.equal((await restarted.inspect()).used, 3);
	assert.deepEqual(f.waits, [60_000, 5_000]);
});

test('verified initial usage applies only on its Pacific date and preserves its provenance', async (t) => {
	const f = await fixture(t, { initialUsed: 1, initialUsedDate: '2026-10-20' });
	assert.equal((await f.quota.inspect()).used, 0);
	const state = JSON.parse(await fs.readFile(f.stateFile, 'utf8'));
	assert.deepEqual(state.initialUsage, { day: '2026-10-20', used: 1 });
	const createdAt = state.createdAt;
	await f.quota.beforeRequest();
	f.setTime('2026-10-22T07:00:00.000Z');
	assert.equal((await f.quota.inspect()).used, 0);
	const tomorrow = JSON.parse(await fs.readFile(f.stateFile, 'utf8'));
	assert.equal(tomorrow.createdAt, createdAt);
	assert.deepEqual(tomorrow.initialUsage, state.initialUsage);
});

test('day rollover resets the count while retaining cross-midnight spacing', async (t) => {
	const f = await fixture(t, { at: '2026-10-22T06:59:30Z', dailyLimit: 1 });
	await f.quota.beforeRequest();
	f.setTime('2026-10-22T07:00:00Z');
	const status = await f.quota.inspect();
	assert.equal(status.day, '2026-10-22');
	assert.equal(status.used, 0);
	await f.quota.beforeRequest();
	assert.deepEqual(f.waits, [35_000]);
	assert.equal((await f.quota.inspect()).used, 1);
});

test('429 blocks further attempts until the next Pacific day and survives a restart', async (t) => {
	const f = await fixture(t);
	await f.quota.beforeRequest();
	const blocked = await f.quota.markQuota();
	assert.equal(blocked.blockedUntil, Date.parse('2026-10-22T07:00:00Z'));
	const restarted = createNarrationQuota(f.settings);
	await assert.rejects(restarted.beforeRequest(), { code: 'QUOTA_BLOCKED' });
	assert.equal((await restarted.inspect()).used, 1);
	assert.deepEqual(f.waits, []);
	f.setTime('2026-10-22T07:00:00Z');
	assert.equal((await restarted.inspect()).blockedUntil, null);
	await restarted.beforeRequest();
	assert.equal((await restarted.inspect()).used, 1);
});

test('malformed and inconsistent saved states fail closed without overwriting them', async (t) => {
	const f = await fixture(t);
	await f.quota.inspect();
	const valid = JSON.parse(await fs.readFile(f.stateFile, 'utf8'));
	const invalid = [
		'{',
		'null',
		'[]',
		JSON.stringify({ ...valid, version: 2 }),
		JSON.stringify({ ...valid, used: -1 }),
		JSON.stringify({ ...valid, used: 11 }),
		JSON.stringify({ ...valid, updatedAt: 'yesterday' }),
		JSON.stringify({ ...valid, day: '2026-02-30' }),
		JSON.stringify({ ...valid, blockedUntil: valid.updatedAt + 1 }),
		JSON.stringify({ ...valid, lastRequestAt: valid.updatedAt + 1 }),
		JSON.stringify({ ...valid, initialUsage: { day: valid.day, used: 1 }, used: 0 })
	];
	for (const content of invalid) {
		await fs.writeFile(f.stateFile, content);
		await assert.rejects(f.quota.beforeRequest(), { code: 'STATE' });
		assert.equal(await fs.readFile(f.stateFile, 'utf8'), content);
	}
	assert.deepEqual(f.waits, []);
});

test('a backwards clock cannot reset or erase recorded usage', async (t) => {
	const f = await fixture(t);
	await f.quota.beforeRequest();
	f.setTime(f.getTime() - 1);
	await assert.rejects(f.quota.beforeRequest(), { code: 'STATE' });
	assert.equal(JSON.parse(await fs.readFile(f.stateFile, 'utf8')).used, 1);
});

test('persistence failures prevent a provider reservation', async (t) => {
	const f = await fixture(t);
	await fs.mkdir(f.stateFile);
	await assert.rejects(f.quota.beforeRequest(), { code: 'STATE' });
	assert.deepEqual(f.waits, []);
});
