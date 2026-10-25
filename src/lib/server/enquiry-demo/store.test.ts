import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EnquiryStore, validateSubmission } from './store';

const start = Date.parse('2026-10-26T06:00:00.000Z');
const hour = 60 * 60 * 1000;
const temporaryRoot = realpathSync(tmpdir());
let directory: string;
let path: string;
let current: number;
let stores: EnquiryStore[];

function open() {
	const store = new EnquiryStore(path, () => current);
	if (!stores.length) {
		store.seed();
		// Retain the explicit staff/routing fixtures while testing new enquiries in isolation.
		store.db.exec('DELETE FROM demo_enquiries;');
	}
	stores.push(store);
	return store;
}

function input(overrides: Record<string, unknown> = {}) {
	return {
		submissionId: randomUUID(),
		name: 'Mira Example',
		email: 'mira@example.com',
		city: 'Kolkata',
		type: 'quotation',
		description: 'Please quote for repainting our fictional office meeting room.',
		jobReference: '',
		website: '',
		...overrides
	};
}

function save(store: EnquiryStore, overrides: Record<string, unknown> = {}) {
	return store.submit(input(overrides)).enquiry;
}

beforeEach(() => {
	directory = mkdtempSync(join(temporaryRoot, 'enquiry-demo-test-'));
	path = join(directory, 'enquiries.sqlite');
	current = start;
	stores = [];
});

afterEach(() => {
	for (const store of stores) {
		try {
			store.close();
		} catch {
			// A restart test deliberately closes a connection before reopening it.
		}
	}
	const cleanupTarget = realpathSync(directory);
	expect(dirname(cleanupTarget)).toBe(temporaryRoot);
	expect(basename(cleanupTarget).startsWith('enquiry-demo-test-')).toBe(true);
	rmSync(cleanupTarget, { recursive: true, force: true });
});

describe('enquiry validation and responsibility', () => {
	test('rejects missing fields, unbounded text, invalid email and unsupported choices', () => {
		for (const bad of [
			input({ name: '' }),
			input({ email: 'not-an-email' }),
			input({ city: 'London' }),
			input({ type: 'payment' }),
			input({ description: '' }),
			input({ description: 'x'.repeat(50_000) }),
			input({ website: 'spam.example.com' }),
			input({ submissionId: '' })
		]) {
			expect(Object.keys(validateSubmission(bad).errors).length).toBeGreaterThan(0);
		}
		expect(validateSubmission(input()).errors).toEqual({});
	});

	test('stores a quotation, owner, deadline and exactly one acknowledgement together', () => {
		const store = open();
		const enquiry = save(store);
		const detail = store.detail(enquiry.ref)!;
		expect(detail.ownerName).not.toBe('Office coordinator');
		expect(detail.fallback).toBe(false);
		expect(detail.ack.status).toBe('waiting');
		expect(detail.ack.to).toBe('mira@example.com');
		expect(Date.parse(detail.deadlineAt) - Date.parse(detail.createdAt)).toBe(4 * hour);
		expect(detail.history.length).toBeGreaterThanOrEqual(2);
		expect(detail.ack.body).toContain(enquiry.ref);
	});

	test('a message insert failure rolls the enquiry and its history back', () => {
		const store = open();
		store.db.exec(`CREATE TRIGGER reject_test_ack BEFORE INSERT ON demo_ack_jobs
			BEGIN SELECT RAISE(ABORT, 'test acknowledgement failure'); END;`);
		expect(() => save(store)).toThrow('test acknowledgement failure');
		expect(store.list()).toHaveLength(0);
		for (const table of ['demo_enquiries', 'demo_ack_jobs', 'demo_history']) {
			expect(store.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()!.count).toBe(0);
		}
		store.db.exec('DROP TRIGGER reject_test_ack;');
		expect(save(store).ackStatus).toBe('waiting');
	});

	test('routes both missing and unavailable coverage to the named coordinator queue', () => {
		const store = open();
		const combinations = ['Kolkata', 'Dubai'].flatMap((city) =>
			['quotation', 'existing-job', 'general'].map((type) => save(store, { city, type }))
		);
		const fallback = combinations.filter((enquiry) => enquiry.fallback);
		expect(fallback.length).toBeGreaterThanOrEqual(2);
		for (const enquiry of fallback) {
			expect(enquiry.ownerName).toBe('Office coordinator');
			expect(enquiry.fallbackReason).toBeTruthy();
		}
		expect(fallback.map((enquiry) => enquiry.fallbackReason).join(' ')).toMatch(/unavailable/i);
		expect(fallback.map((enquiry) => enquiry.fallbackReason).join(' ')).toMatch(
			/rule|coverage|matching/i
		);
	});

	test('replaying one identifier preserves its reference and rejects a changed payload', () => {
		const store = open();
		const submission = input();
		const first = store.submit(submission);
		const again = store.submit(submission);
		expect(again.duplicate).toBe(true);
		expect(again.enquiry.ref).toBe(first.enquiry.ref);
		expect(store.list()).toHaveLength(1);
		expect(() =>
			store.submit({ ...submission, description: 'A different request with the same key.' })
		).toThrow();
		expect(store.list()).toHaveLength(1);
		save(store);
		expect(store.list()).toHaveLength(2);
	});

	test('the fixed seed is repeatable and contains only reserved email addresses', () => {
		const store = open();
		store.seed();
		const first = store.list();
		expect(first).toHaveLength(30);
		expect(new Set(first.map((enquiry) => enquiry.city)).size).toBe(2);
		expect(new Set(first.map((enquiry) => enquiry.status)).size).toBe(3);
		expect(first.some((enquiry) => enquiry.fallback)).toBe(true);
		expect(first.some((enquiry) => enquiry.overdue)).toBe(true);
		expect(first.some((enquiry) => ['failed', 'needs-attention'].includes(enquiry.ackStatus))).toBe(
			true
		);
		for (const enquiry of first) {
			expect(enquiry.email).toMatch(/@example\.(?:com|org)$/);
			for (const event of store.detail(enquiry.ref)!.history) {
				expect(Date.parse(event.at)).toBeLessThanOrEqual(store.now());
			}
		}
		store.reset();
		expect(store.list()).toEqual(first);
		store.seed();
		expect(store.list()).toHaveLength(30);
	});

	test('an interrupted sample reset leaves previously committed work intact', () => {
		const store = open();
		const enquiry = save(store);
		store.update(enquiry.ref, { note: 'Preserve this committed fictional work.' }, 'Demo staff');
		store.sandbox({ advanceMinutes: 11, mode: 'always-fail' });
		const before = store.detail(enquiry.ref);
		store.db.exec(`CREATE TRIGGER interrupt_reset BEFORE INSERT ON demo_ack_jobs
			BEGIN SELECT RAISE(ABORT, 'test reset interruption'); END;`);
		expect(() => store.reset()).toThrow('test reset interruption');
		expect(store.detail(enquiry.ref)).toEqual(before);
		expect(store.settings().mode).toBe('always-fail');
		expect(store.settings().offsetMinutes).toBe(11);
	});
});

describe('first response, deadlines and reminders', () => {
	test('four elapsed hours are not overdue until the boundary has passed', () => {
		const store = open();
		const enquiry = save(store);
		current += 4 * hour;
		expect(store.detail(enquiry.ref)!.overdue).toBe(false);
		store.tick();
		expect(store.detail(enquiry.ref)!.reminders).toHaveLength(0);
		current += 1;
		expect(store.detail(enquiry.ref)!.overdue).toBe(true);
		store.tick();
		expect(store.detail(enquiry.ref)!.reminders).toHaveLength(1);
	});

	test('repeated worker passes and two connections create one reminder for an overdue event', () => {
		const store = open();
		const enquiry = save(store);
		store.sandbox({ advanceMinutes: 241 });
		const second = open();
		store.tick('worker-one');
		second.tick('worker-two');
		store.tick('worker-one');
		expect(store.detail(enquiry.ref)!.reminders).toHaveLength(1);
		expect(second.detail(enquiry.ref)!.overdue).toBe(true);
	});

	test('opening or progressing a job is not a response; recording contact preserves work status', () => {
		const store = open();
		const enquiry = save(store);
		store.sandbox({ advanceMinutes: 241 });
		store.detail(enquiry.ref);
		store.update(enquiry.ref, { status: 'in-progress' }, 'Demo staff');
		expect(store.detail(enquiry.ref)!.firstResponseAt).toBeNull();
		expect(store.detail(enquiry.ref)!.overdue).toBe(true);
		const responded = store.update(enquiry.ref, { recordResponse: true }, 'Demo staff');
		expect(responded.firstResponseBy).toBe('Demo staff');
		expect(responded.firstResponseAt).toBe(new Date(store.now()).toISOString());
		expect(responded.overdue).toBe(false);
		expect(responded.status).toBe('in-progress');
		const recordedAt = responded.firstResponseAt;
		store.sandbox({ advanceMinutes: 30 });
		store.update(enquiry.ref, { recordResponse: true }, 'Other staff');
		expect(store.detail(enquiry.ref)!.firstResponseAt).toBe(recordedAt);
		expect(store.detail(enquiry.ref)!.firstResponseBy).toBe('Demo staff');
		store.update(enquiry.ref, { status: 'resolved' }, 'Demo staff');
		expect(store.detail(enquiry.ref)!.status).toBe('resolved');
	});
});

describe('simulated acknowledgement recovery', () => {
	test('a failed acknowledgement keeps its enquiry and retries the same message after a delay', () => {
		const store = open();
		store.sandbox({ mode: 'fail-next' });
		const enquiry = save(store);
		const job = store.detail(enquiry.ref)!.ack.id;
		store.tick();
		const failed = store.detail(enquiry.ref)!;
		expect(failed.ack.status).toBe('failed');
		expect(failed.ack.attempts).toBe(1);
		expect(failed.ack.error).toBeTruthy();
		expect(Date.parse(failed.ack.nextRetryAt!)).toBeGreaterThan(store.now());
		store.tick();
		expect(store.detail(enquiry.ref)!.ack.attempts).toBe(1);
		store.sandbox({ advanceMinutes: 1 });
		store.tick();
		const recovered = store.detail(enquiry.ref)!;
		expect(recovered.ack.status).toBe('succeeded');
		expect(recovered.ack.attempts).toBe(2);
		expect(recovered.ack.id).toBe(job);
		expect(store.list()).toHaveLength(1);
	});

	test('automatic retries stop, then an authorized caller can retry the existing job manually', () => {
		const store = open();
		store.sandbox({ mode: 'always-fail' });
		const enquiry = save(store);
		const job = store.detail(enquiry.ref)!.ack.id;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			store.tick();
			store.sandbox({ advanceMinutes: 10 });
		}
		const exhausted = store.detail(enquiry.ref)!;
		expect(exhausted.ack.status).toBe('needs-attention');
		expect(exhausted.ack.attempts).toBe(3);
		expect(exhausted.ack.nextRetryAt).toBeNull();
		store.tick();
		expect(store.detail(enquiry.ref)!.ack.attempts).toBe(3);
		store.sandbox({ mode: 'succeed' });
		store.retry(enquiry.ref, 'Office coordinator');
		store.tick();
		expect(store.detail(enquiry.ref)!.ack.status).toBe('succeeded');
		expect(store.detail(enquiry.ref)!.ack.id).toBe(job);
		expect(store.list()).toHaveLength(1);
	});

	test('committed notes, work, clock and outstanding messages survive closing the database', () => {
		const store = open();
		const enquiry = save(store);
		store.update(
			enquiry.ref,
			{ status: 'in-progress', note: 'Called the fictional office manager.' },
			'Demo staff'
		);
		store.sandbox({ advanceMinutes: 17, mode: 'always-fail' });
		const before = store.detail(enquiry.ref)!;
		store.close();
		const restarted = open();
		expect(restarted.detail(enquiry.ref)).toEqual(before);
		expect(restarted.settings().mode).toBe('always-fail');
		expect(restarted.now()).toBe(start + 17 * 60_000);
		restarted.tick('restarted-worker');
		expect(restarted.detail(enquiry.ref)!.ack.status).toBe('failed');
	});

	test('two workers cannot claim or complete the same live message lease', () => {
		const first = open();
		const enquiry = save(first);
		const second = open();
		const claim = first.claim('worker-one')!;
		expect(claim.ref).toBe(enquiry.ref);
		expect(second.claim('worker-two')).toBeNull();
		expect(first.complete({ ...claim, token: 'wrong-token' })).toBe(false);
		expect(second.complete(claim)).toBe(true);
		expect(first.complete(claim)).toBe(false);
		expect(first.detail(enquiry.ref)!.ack.attempts).toBe(1);
	});

	test('an interrupted worker is recovered after its lease and its stale claim cannot finish', () => {
		const original = open();
		const enquiry = save(original);
		const claim = original.claim('stopped-worker')!;
		expect(original.detail(enquiry.ref)!.ack.status).toBe('processing');
		original.close();
		current += 60_001;
		const restarted = open();
		expect(restarted.tick('replacement-worker').recovered).toBe(1);
		expect(restarted.detail(enquiry.ref)!.ack.status).toBe('failed');
		expect(restarted.complete(claim)).toBe(false);
		current += 60_000;
		restarted.tick('replacement-worker');
		expect(restarted.detail(enquiry.ref)!.ack.status).toBe('succeeded');
		expect(restarted.detail(enquiry.ref)!.ack.attempts).toBe(2);
		expect(restarted.list()).toHaveLength(1);
		expect(
			restarted.detail(enquiry.ref)!.history.some((event) => event.kind === 'ack-recovered')
		).toBe(true);
	});
});
