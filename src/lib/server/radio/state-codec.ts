import { z } from 'zod';
import { createRadioStoreState, type RadioStoreState } from './store';

export const RADIO_STATE_MAX_BYTES = 4 * 1024 * 1024;
const DAY = 86_400_000;
const id = z.string().min(1).max(256);
const timestamp = z
	.string()
	.max(40)
	.refine((value) => Number.isFinite(Date.parse(value)));
const user = z.object({
	id,
	googleSub: id,
	email: z.string().max(320),
	displayName: z.string().max(48),
	avatarUrl: z.string().max(2048).nullable(),
	authenticatedAt: timestamp
});
const participant = z
	.object({
		userId: id,
		displayName: z.string().max(48),
		email: z.string().max(320),
		role: z.enum(['host', 'participant']),
		admissionStatus: z.enum(['none', 'pending_approval', 'admitted', 'denied', 'removed']),
		isConnected: z.boolean(),
		isListenerOnly: z.boolean(),
		isMuted: z.boolean(),
		isSpeaking: z.boolean(),
		unmuteRequestedByHost: z.boolean(),
		joinedAt: timestamp,
		lastSeenAt: timestamp,
		usedInvitationId: id.nullable(),
		hostMuted: z.boolean().optional(),
		mediaTokenNotBeforeMs: z.number().finite().optional(),
		mediaTokenIssuedAtMs: z.number().finite().optional()
	})
	.passthrough();
const room = z
	.object({
		id,
		slug: z.string().max(80),
		channelSlot: z.number().int().min(1).max(12),
		name: z.string().max(36),
		hostUserId: id,
		hostDisplayName: z.string().max(48),
		mode: z.enum(['conversation', 'radio']),
		accessPolicy: z.enum(['approval_required', 'members_only']),
		isLocked: z.boolean(),
		isEnded: z.boolean(),
		maxParticipants: z.number().int().min(2).max(12),
		explicitMemberEmails: z.array(z.string().max(320)).max(128),
		participants: z.array(participant).max(128),
		pttLease: z.object({
			holderUserId: id.nullable(),
			holderName: z.string().max(48).nullable(),
			acquiredAtMs: z.number().finite().nullable(),
			expiresAtMs: z.number().finite().nullable()
		}),
		activeInvitationId: id.nullable(),
		hostDisconnectedAtMs: z.number().finite().nullable(),
		createdAt: timestamp,
		updatedAt: timestamp,
		cleanupRetryAtMs: z.number().finite().optional()
	})
	.passthrough();
const invitation = z.object({
	id,
	roomId: id,
	tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
	createdByUserId: id,
	createdAt: timestamp,
	expiresAt: timestamp,
	revokedAt: timestamp.nullable(),
	maxUses: z.number().int().nonnegative().nullable(),
	useCount: z.number().int().nonnegative()
});
const report = z.object({
	id,
	reporterUserId: id,
	roomId: id.nullable(),
	targetUserId: id.nullable(),
	reason: z.string().max(64),
	details: z.string().max(4000),
	createdAt: timestamp
});
const snapshotSchema = z
	.object({
		schemaVersion: z.literal(1),
		accounts: z.array(user).max(2000),
		rooms: z.array(room).max(25),
		invitations: z.array(invitation).max(500),
		abuseReports: z.array(report).max(1000),
		revokedAccounts: z.array(z.tuple([id, z.number().finite()])).max(10000)
	})
	.strict();

export type RadioSnapshot = z.infer<typeof snapshotSchema>;
export interface ExpiredRadioRoom {
	id: string;
	issuedParticipantIds: string[];
	maxParticipants: number;
}

export function encodeRadioState(state: RadioStoreState): RadioSnapshot {
	const snapshot = snapshotSchema.parse({
		schemaVersion: 1,
		accounts: Array.from(state.accountsById.values()),
		rooms: Array.from(state.roomsById.values(), (entry) => ({
			...entry,
			explicitMemberEmails: Array.from(entry.explicitMemberEmails),
			participants: Array.from(entry.participants.values())
		})),
		invitations: Array.from(state.invitationsById.values()),
		abuseReports: state.abuseReports,
		revokedAccounts: Array.from(state.revokedAccounts.entries())
	});
	if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > RADIO_STATE_MAX_BYTES) {
		throw new Error('Radio state capacity reached.');
	}
	return snapshot;
}

export function decodeRadioState(value: unknown): RadioStoreState {
	if (Buffer.byteLength(JSON.stringify(value), 'utf8') > RADIO_STATE_MAX_BYTES) {
		throw new Error('Radio state exceeds its storage bound.');
	}
	const snapshot = snapshotSchema.parse(value);
	const state = createRadioStoreState();
	for (const entry of snapshot.accounts) state.accountsById.set(entry.id, entry);
	for (const entry of snapshot.rooms) {
		state.roomsById.set(entry.id, {
			...entry,
			explicitMemberEmails: new Set(entry.explicitMemberEmails),
			participants: new Map(entry.participants.map((member) => [member.userId, member]))
		});
	}
	for (const entry of snapshot.invitations) {
		if (!state.roomsById.has(entry.roomId)) continue;
		state.invitationsById.set(entry.id, entry);
		state.invitationsByHash.set(entry.tokenHash, entry);
	}
	state.abuseReports = snapshot.abuseReports;
	state.revokedAccounts = new Map(snapshot.revokedAccounts);
	return state;
}

/** Bounded retention never removes a denial tombstone while its room remains usable. */
export function pruneRadioState(state: RadioStoreState, now = Date.now()): ExpiredRadioRoom[] {
	const expiredRooms: ExpiredRadioRoom[] = [];
	for (const [roomId, entry] of state.roomsById) {
		if (entry.isEnded || now - Date.parse(entry.createdAt) >= DAY) {
			entry.isEnded = true;
			if ((entry.cleanupRetryAtMs ?? 0) > now || expiredRooms.length >= 3) continue;
			expiredRooms.push({
				id: roomId,
				issuedParticipantIds: Array.from(entry.participants.values())
					.filter(
						(member) =>
							member.mediaTokenIssuedAtMs !== undefined &&
							member.mediaTokenIssuedAtMs >= (member.mediaTokenNotBeforeMs ?? 0)
					)
					.map((member) => member.userId),
				maxParticipants: entry.maxParticipants
			});
		}
	}
	for (const [inviteId, entry] of state.invitationsById) {
		if (
			entry.revokedAt ||
			Date.parse(entry.expiresAt) <= now ||
			!state.roomsById.has(entry.roomId) ||
			state.roomsById.get(entry.roomId)?.isEnded
		) {
			state.invitationsById.delete(inviteId);
			state.invitationsByHash.delete(entry.tokenHash);
		}
	}
	for (const [accountId, entry] of state.accountsById) {
		if (now - Date.parse(entry.authenticatedAt) >= 30 * DAY) state.accountsById.delete(accountId);
	}
	// Session cookies last seven days. Keep a further full day of revocation margin.
	for (const [accountId, cutoff] of state.revokedAccounts) {
		if (now - cutoff >= 8 * DAY) state.revokedAccounts.delete(accountId);
	}
	state.abuseReports = state.abuseReports.filter(
		(entry) => now - Date.parse(entry.createdAt) < 30 * DAY
	);
	return expiredRooms;
}
