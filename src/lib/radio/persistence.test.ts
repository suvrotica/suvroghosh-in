import { describe, expect, it, vi } from 'vitest';
import type { RadioUser } from './types';
import {
	createRadioStoreState,
	createRadioRoom,
	listAuthorisedRoomsForUser,
	previewInvitation,
	requestRoomJoin,
	performHostAction,
	upsertRadioAccount,
	deleteUserAccountData,
	isAccountRevoked,
	submitAbuseReport
} from '$lib/server/radio/store';
import {
	expireStaleRoomConnections,
	runRadioTransaction,
	type RadioPersistenceBackend
} from '$lib/server/radio/persistence';
import { removeRemoteParticipantFromSfu } from '$lib/server/radio/livekit';
import { currentRadioState, registerRadioRollback } from '$lib/server/radio/state-context';
import {
	decodeRadioState,
	encodeRadioState,
	pruneRadioState,
	type RadioSnapshot
} from '$lib/server/radio/state-codec';

vi.mock('$lib/server/radio/livekit', () => ({
	closeRemoteRoomOnSfu: vi.fn(async () => undefined),
	removeRemoteParticipantFromSfu: vi.fn(async () => Date.now()),
	setRemoteParticipantPublishPermission: vi.fn(async () => undefined)
}));

const makeUser = (number: number): RadioUser => ({
	id: `usr_${number}`,
	googleSub: `sub_${number}`,
	email: `user${number}@example.com`,
	displayName: `User ${number}`,
	avatarUrl: null,
	authenticatedAt: new Date(Date.now() - 1000).toISOString()
});

/** Two client objects share only committed bytes, like separate server workers. */
function databaseFixture() {
	let snapshot = encodeRadioState(createRadioStoreState());
	let version = 0;
	let owner: string | null = null;
	let refuseCommit = false;
	const client = (): RadioPersistenceBackend => ({
		async acquire(nextOwner) {
			if (owner) return null;
			owner = nextOwner;
			return { version, snapshot: structuredClone(snapshot) };
		},
		async commit(expectedOwner, expectedVersion, nextSnapshot) {
			if (refuseCommit || owner !== expectedOwner || version !== expectedVersion) return false;
			snapshot = structuredClone(nextSnapshot);
			version += 1;
			owner = null;
			return true;
		},
		async release(expectedOwner) {
			if (owner === expectedOwner) owner = null;
		}
	});
	return {
		client,
		read: () => structuredClone(snapshot),
		rejectCommit: () => {
			refuseCommit = true;
		}
	};
}

describe('COMM-LINK durable request state', () => {
	it('keeps a stale capacity reservation until its issued media identity is revoked', async () => {
		const db = databaseFixture(),
			host = makeUser(1);
		const created = await runRadioTransaction(db.client(), async () => {
			const result = await createRadioRoom({
				host,
				name: 'Stale connection',
				mode: 'conversation',
				accessPolicy: 'approval_required'
			});
			const member = currentRadioState().roomsById.get(result.room.id)!.participants.get(host.id)!;
			member.isConnected = true;
			member.lastSeenAt = new Date(Date.now() - 91_000).toISOString();
			member.mediaTokenIssuedAtMs = Date.now() - 120_000;
			return result;
		});
		vi.mocked(removeRemoteParticipantFromSfu).mockRejectedValueOnce(
			new Error('provider unavailable')
		);
		await expect(
			runRadioTransaction(db.client(), () => expireStaleRoomConnections(created.room.id))
		).rejects.toThrow('provider unavailable');
		expect(db.read().rooms[0].participants[0].isConnected).toBe(true);
		await runRadioTransaction(db.client(), () => expireStaleRoomConnections(created.room.id));
		expect(db.read().rooms[0].participants[0].isConnected).toBe(false);
		expect(db.read().rooms[0].participants[0].mediaTokenNotBeforeMs).toBeGreaterThan(0);
	});

	it('restores invites and admission across fresh workers, retaining removal tombstones', async () => {
		const db = databaseFixture();
		const host = makeUser(1),
			guest = makeUser(2);
		const created = await runRadioTransaction(db.client(), () =>
			createRadioRoom({
				host,
				name: 'Across workers',
				mode: 'conversation',
				accessPolicy: 'approval_required'
			})
		);
		await runRadioTransaction(db.client(), async () => {
			expect(previewInvitation(created.inviteToken).valid).toBe(true);
			expect(listAuthorisedRoomsForUser(guest.id, guest.email)).toHaveLength(0);
			const joined = await requestRoomJoin({
				roomId: created.room.id,
				user: guest,
				inviteToken: created.inviteToken,
				requireHostApproval: true
			});
			expect(joined.status).toBe('pending_approval');
		});
		await runRadioTransaction(db.client(), async () => {
			expect(
				currentRadioState().roomsById.get(created.room.id)?.participants.get(guest.id)
					?.admissionStatus
			).toBe('pending_approval');
			await performHostAction({
				roomId: created.room.id,
				actorUserId: host.id,
				payload: { action: 'remove_participant', targetUserId: guest.id }
			});
		});
		await runRadioTransaction(db.client(), async () => {
			const denied = await requestRoomJoin({
				roomId: created.room.id,
				user: guest,
				inviteToken: created.inviteToken
			});
			expect(denied.ok).toBe(false);
			expect(denied.status).toBe('removed');
		});
	});

	it('serializes concurrent workers so the per-host room limit cannot be exceeded', async () => {
		const db = databaseFixture(),
			host = makeUser(1);
		const outcomes = await Promise.allSettled(
			Array.from({ length: 4 }, (_, index) =>
				runRadioTransaction(db.client(), () =>
					createRadioRoom({
						host,
						name: `Room ${index}`,
						mode: 'conversation',
						accessPolicy: 'approval_required'
					})
				)
			)
		);
		expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(3);
		expect(db.read().rooms).toHaveLength(3);
	});

	it('rolls back failed responses and compensates grants when a fenced commit is refused', async () => {
		const db = databaseFixture(),
			host = makeUser(1);
		await runRadioTransaction(
			db.client(),
			async () => {
				await upsertRadioAccount(host);
				return new Response(null, { status: 400 });
			},
			{ shouldCommit: (result) => result.ok }
		);
		expect(db.read().accounts).toHaveLength(0);
		const revoke = vi.fn(async () => undefined);
		db.rejectCommit();
		await expect(
			runRadioTransaction(db.client(), async () => {
				await upsertRadioAccount(host);
				registerRadioRollback(revoke);
			})
		).rejects.toThrow('fencing');
		expect(revoke).toHaveBeenCalledOnce();
		expect(db.read().accounts).toHaveLength(0);
	});

	it('keeps deletion revocations effective against old cookies after a fresh sign-in', async () => {
		const db = databaseFixture(),
			user = makeUser(1);
		await runRadioTransaction(db.client(), async () => {
			await upsertRadioAccount(user);
			await deleteUserAccountData(user.id);
		});
		const cutoff = db.read().revokedAccounts[0][1];
		const newUser = { ...user, authenticatedAt: new Date(cutoff + 10).toISOString() };
		await runRadioTransaction(db.client(), async () => {
			expect(isAccountRevoked(user.id, user.authenticatedAt)).toBe(true);
			expect(isAccountRevoked(newUser.id, newUser.authenticatedAt)).toBe(false);
			await upsertRadioAccount(newUser);
		});
		await runRadioTransaction(db.client(), async () => {
			expect(isAccountRevoked(user.id, user.authenticatedAt)).toBe(true);
		});
	});

	it('persists reports, bounds retention, and never restores expired room access', async () => {
		const db = databaseFixture(),
			host = makeUser(1);
		const created = await runRadioTransaction(db.client(), async () => {
			await submitAbuseReport({
				reporterUserId: host.id,
				reason: 'privacy',
				details: 'Please check access.'
			});
			return createRadioRoom({
				host,
				name: 'Expires',
				mode: 'conversation',
				accessPolicy: 'approval_required'
			});
		});
		expect(db.read().abuseReports).toHaveLength(1);
		const state = decodeRadioState(db.read());
		pruneRadioState(state, Date.now() + 86_400_100);
		const restored = decodeRadioState(encodeRadioState(state));
		expect(restored.roomsById.get(created.room.id)?.isEnded).toBe(true);
		expect(restored.invitationsByHash.size).toBe(0);
		expect(restored.abuseReports).toHaveLength(1);
		pruneRadioState(restored, Date.now() + 31 * 86_400_000);
		expect(restored.abuseReports).toHaveLength(0);
	});

	it('rejects malformed/oversized state before a request can authorize a room', () => {
		const valid = encodeRadioState(createRadioStoreState());
		expect(() => decodeRadioState({ ...valid, schemaVersion: 2 })).toThrow();
		expect(() => decodeRadioState({ ...valid, unexpected: true })).toThrow();
		const large = {
			...valid,
			accounts: Array.from({ length: 2001 }, (_, i) => makeUser(i))
		} satisfies RadioSnapshot;
		expect(() => decodeRadioState(large)).toThrow();
	});
});
