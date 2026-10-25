import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicWorkspaces } from './public-workspaces';
import type {
	PublicRepository,
	PublicWorkspace,
	WorkspaceCreate,
	WorkspacePatch
} from './public-repository';

const firstHash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const firstScope = '1'.repeat(64);
const secondScope = '2'.repeat(64);
const hour = 3_600_000;
let now: number;

class MemoryRepository implements PublicRepository {
	rows = new Map<string, PublicWorkspace>();
	conflicts = 0;
	casCalls = 0;
	alwaysConflict = false;
	onConflict?: (workspace: PublicWorkspace) => Promise<void>;

	async create(input: WorkspaceCreate) {
		if (this.rows.has(input.sessionHash)) return null;
		const row = { ...structuredClone(input), version: 1 };
		this.rows.set(input.sessionHash, row);
		return structuredClone(row);
	}
	async load(hash: string) {
		const row = this.rows.get(hash);
		return row ? structuredClone(row) : null;
	}
	async cas(hash: string, version: number, patch: WorkspacePatch) {
		this.casCalls += 1;
		const row = this.rows.get(hash);
		if (!row || row.version !== version || this.alwaysConflict) return null;
		if (this.conflicts > 0) {
			this.conflicts -= 1;
			if (this.onConflict) await this.onConflict(row);
			row.version += 1;
			return null;
		}
		const updated = { ...row, ...structuredClone(patch), version: row.version + 1 };
		this.rows.set(hash, updated);
		return structuredClone(updated);
	}
	async due(limit = 20) {
		return [...this.rows.values()]
			.filter(
				(row) =>
					Date.parse(row.expiresAt) > now && row.nextDueAt && Date.parse(row.nextDueAt) <= now
			)
			.slice(0, limit)
			.map((row) => structuredClone(row));
	}
	async removeExpired() {
		let removed = 0;
		for (const [hash, row] of this.rows) {
			if (Date.parse(row.expiresAt) <= now) {
				this.rows.delete(hash);
				removed += 1;
			}
		}
		return removed;
	}
}

const submission = (
	description = 'Please quote for our fictional first office maintenance visit.'
) => ({
	submissionId: 'same-submission-identifier',
	name: 'Example Visitor',
	email: 'visitor@example.org',
	city: 'Kolkata',
	type: 'quotation',
	description,
	jobReference: '',
	website: ''
});

beforeEach(() => {
	now = Date.parse('2026-10-26T09:00:00.000Z');
});

async function setup() {
	const repository = new MemoryRepository();
	const service = new PublicWorkspaces(repository, () => now);
	await service.create(firstHash, firstScope, '4'.repeat(64));
	await service.create(secondHash, secondScope, '4'.repeat(64));
	return { repository, service };
}

async function grantStaff(service: PublicWorkspaces, hash: string) {
	await service.run(hash, () => null, { staffUntil: new Date(now + hour).toISOString() });
}

describe('public visitor workspace isolation', () => {
	test('different visitor capabilities seed independent data and may reuse a submission identifier', async () => {
		const { service } = await setup();
		const first = await service.run(firstHash, (store) =>
			store.submit(submission('A fictional request belonging only to visitor A.'))
		);
		const ref = first.result.enquiry.ref;
		expect((await service.read(secondHash, (store) => store.detail(ref))).result).toBeNull();
		const second = await service.run(secondHash, (store) =>
			store.submit(submission('A different fictional request belonging only to visitor B.'))
		);
		expect(second.result.enquiry.ref).toBe(ref);
		expect(second.result.duplicate).toBe(false);
		const again = await service.run(firstHash, (store) =>
			store.submit(submission('A fictional request belonging only to visitor A.'))
		);
		expect(again.result.duplicate).toBe(true);
		for (const [hash, text] of [
			[firstHash, 'visitor A'],
			[secondHash, 'visitor B']
		] as const) {
			const result = await service.read(hash, (store) => ({
				detail: store.detail(ref),
				counts: store.dashboard()
			}));
			expect(result.result.detail!.description).toContain(text);
			expect(result.result.counts.total).toBe(31);
		}
	});

	test('staff access must be granted separately and is limited by the real clock', async () => {
		const { service } = await setup();
		await expect(
			service.read(firstHash, (store) => store.dashboard(), { requireStaff: true })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			service.run(firstHash, (store) => store.reset(), { requireStaff: true })
		).rejects.toMatchObject({ status: 403 });
		await grantStaff(service, firstHash);
		expect(
			(await service.read(firstHash, (store) => store.dashboard(), { requireStaff: true })).result
				.total
		).toBe(30);
		await expect(
			service.read(secondHash, (store) => store.dashboard(), { requireStaff: true })
		).rejects.toMatchObject({ status: 403 });
		now += hour;
		await expect(
			service.run(firstHash, (store) => store.reset(), { requireStaff: true })
		).rejects.toMatchObject({ status: 403 });
	});

	test('a missing, forged or expired capability cannot read or mutate a workspace', async () => {
		const { repository, service } = await setup();
		const before = structuredClone(repository.rows.get(firstHash));
		for (const hash of ['', 'not-a-capability', 'f'.repeat(64)]) {
			await expect(service.read(hash, (store) => store.list())).rejects.toBeTruthy();
			await expect(service.run(hash, (store) => store.reset())).rejects.toBeTruthy();
		}
		expect(repository.rows.get(firstHash)).toEqual(before);
		now = Date.parse(repository.rows.get(firstHash)!.expiresAt);
		await expect(service.read(firstHash, (store) => store.list())).rejects.toMatchObject({
			status: 410
		});
		await expect(service.run(firstHash, (store) => store.reset())).rejects.toMatchObject({
			status: 410
		});
	});

	test('clock, failures, message previews, notes, history and reminders stay in their owner scope', async () => {
		const { service } = await setup();
		await grantStaff(service, firstHash);
		await grantStaff(service, secondHash);
		const a = await service.run(firstHash, (store) =>
			store.submit(submission('Private fictional maintenance request from workspace A.'))
		);
		const b = await service.run(secondHash, (store) =>
			store.submit(submission('Private fictional maintenance request from workspace B.'))
		);
		const ref = a.result.enquiry.ref;
		expect(b.result.enquiry.ref).toBe(ref);
		const beforeB = (
			await service.read(secondHash, (store) => ({
				detail: store.detail(ref),
				settings: store.settings()
			}))
		).result;
		await service.run(
			firstHash,
			(store) => {
				store.sandbox({ mode: 'always-fail', advanceMinutes: 241 });
				store.update(
					ref,
					{ note: 'Only A can see this fictional note.', status: 'in-progress' },
					'A demo staff'
				);
				store.tick('workspace-a-worker');
				store.tick('workspace-a-worker');
			},
			{ requireStaff: true }
		);
		const afterA = (
			await service.read(firstHash, (store) => ({
				detail: store.detail(ref),
				settings: store.settings()
			}))
		).result;
		expect(afterA.settings.mode).toBe('always-fail');
		expect(afterA.settings.offsetMinutes).toBe(241);
		expect(afterA.detail!.ackStatus).toBe('failed');
		expect(afterA.detail!.reminders).toHaveLength(1);
		expect(afterA.detail!.history.some((item) => item.message.includes('Only A'))).toBe(true);
		expect(
			(
				await service.read(secondHash, (store) => ({
					detail: store.detail(ref),
					settings: store.settings()
				}))
			).result
		).toEqual(beforeB);
		await service.run(secondHash, (store) => store.tick('workspace-b-worker'), {
			requireStaff: true
		});
		expect((await service.read(secondHash, (store) => store.detail(ref))).result!.ackStatus).toBe(
			'succeeded'
		);
	});

	test('reset replaces only its visitor data and cannot extend expiry or affect another staff session', async () => {
		const { repository, service } = await setup();
		await grantStaff(service, firstHash);
		await grantStaff(service, secondHash);
		await service.run(firstHash, (store) => store.submit(submission()));
		await service.run(secondHash, (store) => {
			store.submit(submission('This fictional request must survive another visitor resetting.'));
			store.sandbox({ mode: 'fail-next', advanceMinutes: 57 });
		});
		const beforeB = structuredClone(repository.rows.get(secondHash));
		const expiry = repository.rows.get(firstHash)!.expiresAt;
		await service.run(
			firstHash,
			(store) => {
				store.sandbox({ advanceMinutes: 1440 });
				store.reset();
			},
			{ requireStaff: true }
		);
		expect(repository.rows.get(secondHash)).toEqual(beforeB);
		expect(repository.rows.get(firstHash)!.expiresAt).toBe(expiry);
		expect((await service.read(firstHash, (store) => store.dashboard())).result.total).toBe(30);
	});
});

describe('durable public snapshots and optimistic concurrency', () => {
	test('an abort during a delayed repository load prevents read callbacks, mutation callbacks and CAS writes', async () => {
		const { repository } = await setup();
		const row = await repository.load(firstHash);
		let release!: (value: PublicWorkspace | null) => void;
		const pending = new Promise<PublicWorkspace | null>((resolve) => {
			release = resolve;
		});
		vi.spyOn(repository, 'load').mockImplementation(() => pending);
		const controller = new AbortController();
		const service = new PublicWorkspaces(repository, () => now, controller.signal);
		const readCallback = vi.fn(() => 'must not render');
		const writeCallback = vi.fn(() => 'must not commit');
		const read = expect(service.read(firstHash, readCallback)).rejects.toMatchObject({
			status: 408
		});
		const write = expect(service.run(firstHash, writeCallback)).rejects.toMatchObject({
			status: 408
		});
		controller.abort();
		release(row);
		await Promise.all([read, write]);
		expect(readCallback).not.toHaveBeenCalled();
		expect(writeCallback).not.toHaveBeenCalled();
		expect(repository.casCalls).toBe(0);
	});

	test('a new coordinator instance reads committed data and worker claims from the repository', async () => {
		const { repository, service } = await setup();
		const saved = await service.run(firstHash, (store) => store.submit(submission()));
		const claim = await service.run(firstHash, (store) => store.claim('worker-one'));
		expect(claim.result!.ref).toBe(saved.result.enquiry.ref);
		const restarted = new PublicWorkspaces(repository, () => now);
		expect(
			(await restarted.run(firstHash, (store) => store.claim('worker-two'))).result
		).toBeNull();
		await restarted.run(secondHash, (store) =>
			store.submit(submission('A fictional message independently owned by visitor B.'))
		);
		const secondClaim = (
			await restarted.run(secondHash, (store) => store.claim('workspace-b-worker'))
		).result!;
		expect(secondClaim.id).toBe(claim.result!.id);
		expect(secondClaim.token).not.toBe(claim.result!.token);
		expect((await restarted.run(secondHash, (store) => store.complete(claim.result!))).result).toBe(
			false
		);
		expect(
			(await restarted.read(secondHash, (store) => store.detail(secondClaim.ref))).result!.ackStatus
		).toBe('processing');
		expect((await restarted.run(secondHash, (store) => store.complete(secondClaim))).result).toBe(
			true
		);
		now += 60_001;
		await restarted.run(firstHash, (store) => store.tick('replacement-worker'));
		expect((await restarted.run(firstHash, (store) => store.complete(claim.result!))).result).toBe(
			false
		);
		now += 60_000;
		await restarted.run(firstHash, (store) => store.tick('replacement-worker'));
		const recovered = (
			await restarted.read(firstHash, (store) => store.detail(saved.result.enquiry.ref))
		).result!;
		expect(recovered.ackStatus).toBe('succeeded');
		expect(recovered.attempts).toBe(2);
	});

	test('a CAS conflict replays a pure operation against the latest committed snapshot', async () => {
		const { repository, service } = await setup();
		const saved = await service.run(firstHash, (store) => store.submit(submission()));
		const parallel = new PublicWorkspaces(repository, () => now);
		repository.conflicts = 1;
		repository.onConflict = async () => {
			repository.onConflict = undefined;
			await parallel.run(firstHash, (store) =>
				store.update(
					saved.result.enquiry.ref,
					{ note: 'A concurrent committed note.' },
					'Second request'
				)
			);
		};
		await service.run(firstHash, (store) =>
			store.update(saved.result.enquiry.ref, { status: 'in-progress' }, 'First request')
		);
		const detail = (
			await service.read(firstHash, (store) => store.detail(saved.result.enquiry.ref))
		).result!;
		expect(detail.status).toBe('in-progress');
		expect(
			detail.history.filter((item) => item.message === 'A concurrent committed note.')
		).toHaveLength(1);
	});

	test('bounded CAS conflicts fail without overwriting committed data', async () => {
		const { repository, service } = await setup();
		const before = structuredClone(repository.rows.get(firstHash));
		repository.alwaysConflict = true;
		const attempts = repository.casCalls;
		await expect(service.run(firstHash, (store) => store.reset())).rejects.toMatchObject({
			status: 409
		});
		expect(repository.casCalls - attempts).toBe(4);
		expect(repository.rows.get(firstHash)).toEqual(before);
	});

	test('expiry cleanup removes only ended workspaces and a fresh scope cannot reuse their data', async () => {
		const { repository, service } = await setup();
		await service.run(firstHash, (store) => store.submit(submission()));
		repository.rows.get(firstHash)!.expiresAt = new Date(now - 1).toISOString();
		expect(await repository.removeExpired()).toBe(1);
		expect(repository.rows.has(secondHash)).toBe(true);
		await service.create('c'.repeat(64), '3'.repeat(64), '5'.repeat(64));
		expect((await service.read('c'.repeat(64), (store) => store.dashboard())).result.total).toBe(
			30
		);
		await expect(service.read(firstHash, (store) => store.list())).rejects.toMatchObject({
			status: 410
		});
	});
});
