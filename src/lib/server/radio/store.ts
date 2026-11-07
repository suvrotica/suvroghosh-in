import crypto from 'node:crypto';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import {
	RADIO_LIMITS,
	type InvitationPreview,
	type ParticipantAdmissionStatus,
	type RadioAccessPolicy,
	type RadioMode,
	type RadioParticipant,
	type RadioPttLease,
	type RadioRoomDetail,
	type RadioRoomSummary,
	type RadioUser
} from '$lib/radio/types';
import {
	closeRemoteRoomOnSfu,
	removeRemoteParticipantFromSfu,
	setRemoteParticipantPublishPermission
} from './livekit';

interface StoredInvitation {
	id: string;
	roomId: string;
	tokenHash: string;
	createdByUserId: string;
	createdAt: string;
	expiresAt: string;
	revokedAt: string | null;
	maxUses: number | null;
	useCount: number;
}

interface StoredParticipant extends RadioParticipant {
	email: string;
	usedInvitationId: string | null;
}

interface StoredRoom {
	id: string;
	slug: string;
	channelSlot: number;
	name: string;
	hostUserId: string;
	hostDisplayName: string;
	mode: RadioMode;
	accessPolicy: RadioAccessPolicy;
	isLocked: boolean;
	isEnded: boolean;
	maxParticipants: number;
	explicitMemberEmails: Set<string>;
	participants: Map<string, StoredParticipant>;
	pttLease: {
		holderUserId: string | null;
		holderName: string | null;
		acquiredAtMs: number | null;
		expiresAtMs: number | null;
	};
	activeInvitationId: string | null;
	hostDisconnectedAtMs: number | null;
	createdAt: string;
	updatedAt: string;
}

export interface StoredAbuseReport {
	id: string;
	reporterUserId: string;
	roomId: string | null;
	targetUserId: string | null;
	reason: string;
	details: string;
	createdAt: string;
}

const accountsById = new Map<string, RadioUser>();
const roomsById = new Map<string, StoredRoom>();
const invitationsByHash = new Map<string, StoredInvitation>();
const invitationsById = new Map<string, StoredInvitation>();
const abuseReports: StoredAbuseReport[] = [];
const revokedAccountIds = new Set<string>();

function sha256Hex(input: string): string {
	return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function generateUnguessableInviteToken(): string {
	return crypto.randomBytes(24).toString('base64url');
}

function slugifyRoomName(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 24);
	const suffix = crypto.randomBytes(3).toString('hex');
	return `${base || 'channel'}-${suffix}`;
}

async function syncRoomToSupabase(room: StoredRoom): Promise<void> {
	const sb = createNotesAdminClient();
	if (!sb) return;
	try {
		await sb.from('comm_link_rooms').upsert(
			{
				id: room.id,
				slug: room.slug,
				name: room.name,
				host_user_id: room.hostUserId,
				host_display_name: room.hostDisplayName,
				mode: room.mode,
				access_policy: room.accessPolicy,
				is_locked: room.isLocked,
				is_ended: room.isEnded,
				max_participants: room.maxParticipants,
				explicit_member_emails: Array.from(room.explicitMemberEmails),
				created_at: room.createdAt,
				updated_at: room.updatedAt
			},
			{ onConflict: 'id' }
		);
	} catch {
		// Non-blocking persistence sync
	}
}

export async function upsertRadioAccount(user: RadioUser): Promise<void> {
	revokedAccountIds.delete(user.id);
	accountsById.set(user.id, user);
	const sb = createNotesAdminClient();
	if (!sb) return;
	try {
		await sb.from('comm_link_accounts').upsert(
			{
				id: user.id,
				google_sub: user.googleSub,
				email: user.email,
				display_name: user.displayName,
				avatar_url: user.avatarUrl,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'id' }
		);
	} catch {
		// Non-blocking persistence sync
	}
}

export function isAccountRevoked(userId: string): boolean {
	return revokedAccountIds.has(userId);
}

function pruneExpiredPttLease(room: StoredRoom, nowMs = Date.now()): void {
	if (!room.pttLease.holderUserId || !room.pttLease.expiresAtMs) return;
	const holder = room.participants.get(room.pttLease.holderUserId);
	const holdDuration = room.pttLease.acquiredAtMs ? nowMs - room.pttLease.acquiredAtMs : 0;

	if (
		nowMs >= room.pttLease.expiresAtMs ||
		holdDuration >= RADIO_LIMITS.PTT_MAX_HOLD_MS ||
		!holder ||
		!holder.isConnected ||
		holder.admissionStatus !== 'admitted' ||
		holder.isListenerOnly
	) {
		const prevUserId = room.pttLease.holderUserId;
		if (holder) {
			holder.isSpeaking = false;
			holder.isMuted = true;
		}
		room.pttLease = {
			holderUserId: null,
			holderName: null,
			acquiredAtMs: null,
			expiresAtMs: null
		};
		if (room.mode === 'radio' && prevUserId) {
			void setRemoteParticipantPublishPermission(room.id, prevUserId, false);
		}
	}
}

function checkHostReconnectWindow(room: StoredRoom, nowMs = Date.now()): void {
	if (room.isEnded || room.hostDisconnectedAtMs === null) return;
	const hostParticipant = room.participants.get(room.hostUserId);
	if (hostParticipant?.isConnected) {
		room.hostDisconnectedAtMs = null;
		return;
	}

	if (nowMs - room.hostDisconnectedAtMs >= RADIO_LIMITS.HOST_RECONNECT_GRACE_MS) {
		// Transfer host to earliest joined connected admitted participant, or end room if empty
		const nextHost = Array.from(room.participants.values())
			.filter(
				(p) =>
					p.userId !== room.hostUserId &&
					p.admissionStatus === 'admitted' &&
					p.isConnected
			)
			.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];

		if (nextHost) {
			if (hostParticipant) hostParticipant.role = 'participant';
			nextHost.role = 'host';
			room.hostUserId = nextHost.userId;
			room.hostDisplayName = nextHost.displayName;
			room.hostDisconnectedAtMs = null;
			room.updatedAt = new Date(nowMs).toISOString();
		} else {
			room.isEnded = true;
			room.hostDisconnectedAtMs = null;
			room.updatedAt = new Date(nowMs).toISOString();
			void closeRemoteRoomOnSfu(room.id);
		}
	}
}

function countConnectedParticipants(room: StoredRoom): number {
	let count = 0;
	for (const p of room.participants.values()) {
		if (p.admissionStatus === 'admitted' && p.isConnected) {
			count += 1;
		}
	}
	return count;
}

function resolveActiveSpeakerName(room: StoredRoom): string | null {
	pruneExpiredPttLease(room);
	if (room.mode === 'radio') {
		return room.pttLease.holderName;
	}
	for (const p of room.participants.values()) {
		if (p.admissionStatus === 'admitted' && p.isConnected && !p.isMuted && p.isSpeaking) {
			return p.displayName;
		}
	}
	return null;
}

function toRoomSummary(
	room: StoredRoom,
	userId: string,
	channelSlotOverride?: number
): RadioRoomSummary {
	pruneExpiredPttLease(room);
	checkHostReconnectWindow(room);
	const me = room.participants.get(userId);
	return {
		id: room.id,
		slug: room.slug,
		channelSlot: channelSlotOverride ?? room.channelSlot,
		name: room.name,
		hostUserId: room.hostUserId,
		hostDisplayName: room.hostDisplayName,
		mode: room.mode,
		accessPolicy: room.accessPolicy,
		isLocked: room.isLocked,
		isEnded: room.isEnded,
		activeParticipantCount: countConnectedParticipants(room),
		maxParticipants: room.maxParticipants,
		activeSpeakerName: resolveActiveSpeakerName(room),
		myAdmissionStatus: me?.admissionStatus ?? 'none',
		createdAt: room.createdAt
	};
}

function toRoomDetail(room: StoredRoom, userId: string): RadioRoomDetail {
	const summary = toRoomSummary(room, userId);
	const admittedList: RadioParticipant[] = [];
	const pendingList: RadioParticipant[] = [];

	for (const p of room.participants.values()) {
		const pub: RadioParticipant = {
			userId: p.userId,
			displayName: p.displayName,
			role: p.role,
			admissionStatus: p.admissionStatus,
			isConnected: p.isConnected,
			isListenerOnly: p.isListenerOnly,
			isMuted: p.isMuted,
			isSpeaking: p.isSpeaking,
			unmuteRequestedByHost: p.unmuteRequestedByHost,
			joinedAt: p.joinedAt,
			lastSeenAt: p.lastSeenAt
		};
		if (p.admissionStatus === 'admitted' && p.isConnected) {
			admittedList.push(pub);
		} else if (p.admissionStatus === 'pending_approval') {
			pendingList.push(pub);
		}
	}

	const pttLease: RadioPttLease = {
		holderUserId: room.pttLease.holderUserId,
		holderName: room.pttLease.holderName,
		acquiredAt: room.pttLease.acquiredAtMs
			? new Date(room.pttLease.acquiredAtMs).toISOString()
			: null,
		expiresAt: room.pttLease.expiresAtMs
			? new Date(room.pttLease.expiresAtMs).toISOString()
			: null
	};

	const activeInv = room.activeInvitationId
		? invitationsById.get(room.activeInvitationId) ?? null
		: null;

	const me = room.participants.get(userId);

	return {
		...summary,
		participants: admittedList,
		pendingApprovalParticipants: room.hostUserId === userId ? pendingList : [],
		explicitMemberEmails:
			room.hostUserId === userId ? Array.from(room.explicitMemberEmails) : [],
		pttLease,
		myParticipant: me
			? {
					userId: me.userId,
					displayName: me.displayName,
					role: me.role,
					admissionStatus: me.admissionStatus,
					isConnected: me.isConnected,
					isListenerOnly: me.isListenerOnly,
					isMuted: me.isMuted,
					isSpeaking: me.isSpeaking,
					unmuteRequestedByHost: me.unmuteRequestedByHost,
					joinedAt: me.joinedAt,
					lastSeenAt: me.lastSeenAt
				}
			: null,
		activeInvitationId: activeInv && !activeInv.revokedAt ? activeInv.id : null,
		activeInvitationExpiresAt:
			activeInv && !activeInv.revokedAt ? activeInv.expiresAt : null,
		hostDisconnectedAt: room.hostDisconnectedAtMs
			? new Date(room.hostDisconnectedAtMs).toISOString()
			: null
	};
}

export function isUserPermittedToSeeRoom(
	room: StoredRoom,
	userId: string,
	userEmail: string
): boolean {
	if (room.isEnded) return false;
	if (room.hostUserId === userId) return true;
	const member = room.participants.get(userId);
	if (
		member &&
		(member.admissionStatus === 'admitted' || member.admissionStatus === 'pending_approval')
	) {
		return true;
	}
	if (userEmail && room.explicitMemberEmails.has(userEmail.toLowerCase())) {
		if (!member || member.admissionStatus !== 'removed') {
			return true;
		}
	}
	return false;
}

/**
 * Returns only the rooms the signed-in user is authorised to access.
 * SCAN and the channel-selection dial never reveal private rooms to unauthorised users.
 */
export function listAuthorisedRoomsForUser(
	userId: string,
	userEmail: string
): RadioRoomSummary[] {
	const result: RadioRoomSummary[] = [];
	let slotCounter = 1;

	const sortedRooms = Array.from(roomsById.values()).sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt)
	);

	for (const room of sortedRooms) {
		checkHostReconnectWindow(room);
		if (!isUserPermittedToSeeRoom(room, userId, userEmail)) continue;
		const slot = Math.min(RADIO_LIMITS.MAX_DIAL_CHANNELS, slotCounter);
		result.push(toRoomSummary(room, userId, slot));
		slotCounter += 1;
		if (result.length >= RADIO_LIMITS.MAX_DIAL_CHANNELS) break;
	}

	return result;
}

export function getRoomDetailForUser(
	roomId: string,
	userId: string,
	userEmail: string
): RadioRoomDetail | null {
	const room = roomsById.get(roomId);
	if (!room) return null;
	checkHostReconnectWindow(room);
	if (!isUserPermittedToSeeRoom(room, userId, userEmail)) return null;
	return toRoomDetail(room, userId);
}

function createInvitationForRoom(
	room: StoredRoom,
	actorUserId: string,
	ttlHours: number = RADIO_LIMITS.INVITATION_DEFAULT_TTL_HOURS
): { rawToken: string; invitation: StoredInvitation } {
	// Revoke previous active invitation if rotating
	if (room.activeInvitationId) {
		const prev = invitationsById.get(room.activeInvitationId);
		if (prev && !prev.revokedAt) {
			prev.revokedAt = new Date().toISOString();
		}
	}

	const rawToken = generateUnguessableInviteToken();
	const tokenHash = sha256Hex(rawToken);
	const now = new Date();
	const expiresAt = new Date(
		now.getTime() +
			Math.min(RADIO_LIMITS.INVITATION_MAX_TTL_HOURS, Math.max(1, ttlHours)) *
				3600 *
				1000
	).toISOString();

	const invitation: StoredInvitation = {
		id: `inv_${crypto.randomBytes(8).toString('hex')}`,
		roomId: room.id,
		tokenHash,
		createdByUserId: actorUserId,
		createdAt: now.toISOString(),
		expiresAt,
		revokedAt: null,
		maxUses: null,
		useCount: 0
	};

	invitationsByHash.set(tokenHash, invitation);
	invitationsById.set(invitation.id, invitation);
	room.activeInvitationId = invitation.id;

	return { rawToken, invitation };
}

export async function createRadioRoom(params: {
	host: RadioUser;
	name: string;
	mode: RadioMode;
	accessPolicy: RadioAccessPolicy;
	maxParticipants?: number;
	explicitMemberEmails?: string[];
	invitationExpiryHours?: number;
}): Promise<{
	room: RadioRoomDetail;
	inviteToken: string;
}> {
	const activeRoomsGlobal = Array.from(roomsById.values()).filter((r) => !r.isEnded);
	if (activeRoomsGlobal.length >= RADIO_LIMITS.MAX_CONCURRENT_ROOMS_GLOBAL) {
		throw new Error(
			`Active room capacity (${RADIO_LIMITS.MAX_CONCURRENT_ROOMS_GLOBAL} concurrent rooms) reached. End an unused room first.`
		);
	}

	const activeHostRooms = activeRoomsGlobal.filter((r) => r.hostUserId === params.host.id);
	if (activeHostRooms.length >= RADIO_LIMITS.MAX_ACTIVE_ROOMS_PER_HOST) {
		throw new Error(
			`You already have ${RADIO_LIMITS.MAX_ACTIVE_ROOMS_PER_HOST} active rooms. End one before creating another.`
		);
	}

	const nowIso = new Date().toISOString();
	const roomId = `rm_${crypto.randomBytes(8).toString('hex')}`;
	const slug = slugifyRoomName(params.name);
	const maxParticipants = Math.min(
		RADIO_LIMITS.MAX_PARTICIPANTS_HARD_CAP,
		Math.max(
			RADIO_LIMITS.MIN_PARTICIPANTS,
			params.maxParticipants ?? RADIO_LIMITS.MAX_PARTICIPANTS_DEFAULT
		)
	);

	const explicitEmails = new Set<string>(
		(params.explicitMemberEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)
	);
	explicitEmails.add(params.host.email.toLowerCase());

	const hostParticipant: StoredParticipant = {
		userId: params.host.id,
		displayName: params.host.displayName,
		email: params.host.email.toLowerCase(),
		role: 'host',
		admissionStatus: 'admitted',
		isConnected: false,
		isListenerOnly: false,
		isMuted: true,
		isSpeaking: false,
		unmuteRequestedByHost: false,
		usedInvitationId: null,
		joinedAt: nowIso,
		lastSeenAt: nowIso
	};

	const participants = new Map<string, StoredParticipant>();
	participants.set(params.host.id, hostParticipant);

	const room: StoredRoom = {
		id: roomId,
		slug,
		channelSlot: Math.min(RADIO_LIMITS.MAX_DIAL_CHANNELS, activeHostRooms.length + 1),
		name: params.name.trim(),
		hostUserId: params.host.id,
		hostDisplayName: params.host.displayName,
		mode: params.mode,
		accessPolicy: params.accessPolicy,
		isLocked: false,
		isEnded: false,
		maxParticipants,
		explicitMemberEmails: explicitEmails,
		participants,
		pttLease: {
			holderUserId: null,
			holderName: null,
			acquiredAtMs: null,
			expiresAtMs: null
		},
		activeInvitationId: null,
		hostDisconnectedAtMs: null,
		createdAt: nowIso,
		updatedAt: nowIso
	};

	const { rawToken } = createInvitationForRoom(
		room,
		params.host.id,
		params.invitationExpiryHours ?? RADIO_LIMITS.INVITATION_DEFAULT_TTL_HOURS
	);

	roomsById.set(room.id, room);
	await syncRoomToSupabase(room);

	return {
		room: toRoomDetail(room, params.host.id),
		inviteToken: rawToken
	};
}

export function previewInvitation(rawToken: string): InvitationPreview {
	const tokenHash = sha256Hex(rawToken.trim());
	const inv = invitationsByHash.get(tokenHash);
	if (!inv) {
		return {
			valid: false,
			reason: 'not_found',
			roomId: null,
			roomName: null,
			hostDisplayName: null,
			mode: null,
			accessPolicy: null,
			isLocked: false,
			activeParticipantCount: 0,
			maxParticipants: RADIO_LIMITS.MAX_PARTICIPANTS_DEFAULT,
			expiresAt: null
		};
	}

	const room = roomsById.get(inv.roomId);
	if (!room || room.isEnded) {
		return {
			valid: false,
			reason: 'room_ended',
			roomId: room?.id ?? null,
			roomName: room?.name ?? null,
			hostDisplayName: room?.hostDisplayName ?? null,
			mode: room?.mode ?? null,
			accessPolicy: room?.accessPolicy ?? null,
			isLocked: room?.isLocked ?? false,
			activeParticipantCount: 0,
			maxParticipants: room?.maxParticipants ?? RADIO_LIMITS.MAX_PARTICIPANTS_DEFAULT,
			expiresAt: inv.expiresAt
		};
	}

	if (inv.revokedAt) {
		return {
			valid: false,
			reason: 'revoked',
			roomId: room.id,
			roomName: room.name,
			hostDisplayName: room.hostDisplayName,
			mode: room.mode,
			accessPolicy: room.accessPolicy,
			isLocked: room.isLocked,
			activeParticipantCount: countConnectedParticipants(room),
			maxParticipants: room.maxParticipants,
			expiresAt: inv.expiresAt
		};
	}

	if (new Date(inv.expiresAt).getTime() <= Date.now()) {
		return {
			valid: false,
			reason: 'expired',
			roomId: room.id,
			roomName: room.name,
			hostDisplayName: room.hostDisplayName,
			mode: room.mode,
			accessPolicy: room.accessPolicy,
			isLocked: room.isLocked,
			activeParticipantCount: countConnectedParticipants(room),
			maxParticipants: room.maxParticipants,
			expiresAt: inv.expiresAt
		};
	}

	const connectedCount = countConnectedParticipants(room);
	if (room.isLocked) {
		return {
			valid: false,
			reason: 'room_locked',
			roomId: room.id,
			roomName: room.name,
			hostDisplayName: room.hostDisplayName,
			mode: room.mode,
			accessPolicy: room.accessPolicy,
			isLocked: true,
			activeParticipantCount: connectedCount,
			maxParticipants: room.maxParticipants,
			expiresAt: inv.expiresAt
		};
	}

	if (connectedCount >= room.maxParticipants) {
		return {
			valid: false,
			reason: 'room_full',
			roomId: room.id,
			roomName: room.name,
			hostDisplayName: room.hostDisplayName,
			mode: room.mode,
			accessPolicy: room.accessPolicy,
			isLocked: room.isLocked,
			activeParticipantCount: connectedCount,
			maxParticipants: room.maxParticipants,
			expiresAt: inv.expiresAt
		};
	}

	return {
		valid: true,
		reason: 'ok',
		roomId: room.id,
		roomName: room.name,
		hostDisplayName: room.hostDisplayName,
		mode: room.mode,
		accessPolicy: room.accessPolicy,
		isLocked: room.isLocked,
		activeParticipantCount: connectedCount,
		maxParticipants: room.maxParticipants,
		expiresAt: inv.expiresAt
	};
}

export async function requestRoomJoin(params: {
	roomId: string;
	user: RadioUser;
	inviteToken?: string | null;
	joinAsListener?: boolean;
}): Promise<{
	ok: boolean;
	status: ParticipantAdmissionStatus;
	error?: string;
	room: RadioRoomDetail | null;
}> {
	const room = roomsById.get(params.roomId);
	if (!room || room.isEnded) {
		return {
			ok: false,
			status: 'none',
			error: 'This room has ended or does not exist.',
			room: null
		};
	}

	checkHostReconnectWindow(room);

	const existing = room.participants.get(params.user.id);
	// Removed participants cannot rejoin with the same invitation unless re-admitted by the host
	if (existing?.admissionStatus === 'removed') {
		return {
			ok: false,
			status: 'removed',
			error: 'You were removed from this room by the host and cannot rejoin without host re-admission.',
			room: null
		};
	}

	if (existing?.admissionStatus === 'denied') {
		return {
			ok: false,
			status: 'denied',
			error: 'Admission to this room was declined by the host.',
			room: null
		};
	}

	// Host is always admitted
	if (room.hostUserId === params.user.id) {
		if (existing) {
			existing.admissionStatus = 'admitted';
			existing.lastSeenAt = new Date().toISOString();
		}
		return {
			ok: true,
			status: 'admitted',
			room: toRoomDetail(room, params.user.id)
		};
	}

	if (room.isLocked && existing?.admissionStatus !== 'admitted') {
		return {
			ok: false,
			status: existing?.admissionStatus ?? 'none',
			error: 'Room is currently locked by the host. New participants cannot enter.',
			room: null
		};
	}

	const connectedCount = countConnectedParticipants(room);
	if (
		connectedCount >= room.maxParticipants &&
		!(existing?.admissionStatus === 'admitted' && existing.isConnected)
	) {
		return {
			ok: false,
			status: existing?.admissionStatus ?? 'none',
			error: `Room has reached its ${room.maxParticipants}-participant limit.`,
			room: null
		};
	}

	const emailLower = params.user.email.toLowerCase();
	const isExplicitMember = room.explicitMemberEmails.has(emailLower);

	let validInvitation: StoredInvitation | null = null;
	if (params.inviteToken) {
		const tokenHash = sha256Hex(params.inviteToken.trim());
		const inv = invitationsByHash.get(tokenHash);
		if (!inv || inv.roomId !== room.id) {
			return {
				ok: false,
				status: 'none',
				error: 'Invalid invitation link for this room.',
				room: null
			};
		}
		if (inv.revokedAt) {
			return {
				ok: false,
				status: 'none',
				error: 'This invitation link has been revoked by the host.',
				room: null
			};
		}
		if (new Date(inv.expiresAt).getTime() <= Date.now()) {
			return {
				ok: false,
				status: 'none',
				error: 'This invitation link has expired.',
				room: null
			};
		}
		validInvitation = inv;
	}

	let nextStatus: ParticipantAdmissionStatus = existing?.admissionStatus ?? 'none';

	if (nextStatus !== 'admitted') {
		if (room.accessPolicy === 'members_only') {
			if (!isExplicitMember) {
				return {
					ok: false,
					status: 'none',
					error: 'This room is restricted to its explicit member list.',
					room: null
				};
			}
			nextStatus = 'admitted';
		} else {
			// approval_required policy:
			// An explicit member or bearer of an active, unrevoked host invitation is admitted;
			// otherwise the user is placed in pending_approval for explicit host admission.
			if (isExplicitMember || validInvitation) {
				nextStatus = 'admitted';
				if (validInvitation) {
					validInvitation.useCount += 1;
				}
			} else {
				nextStatus = 'pending_approval';
			}
		}
	}

	const nowIso = new Date().toISOString();
	const participant: StoredParticipant = {
		userId: params.user.id,
		displayName: params.user.displayName,
		email: emailLower,
		role: room.hostUserId === params.user.id ? 'host' : 'participant',
		admissionStatus: nextStatus,
		isConnected: existing?.isConnected ?? false,
		isListenerOnly: params.joinAsListener ?? existing?.isListenerOnly ?? false,
		// Always join muted by default
		isMuted: true,
		isSpeaking: false,
		unmuteRequestedByHost: false,
		usedInvitationId: validInvitation?.id ?? existing?.usedInvitationId ?? null,
		joinedAt: existing?.joinedAt ?? nowIso,
		lastSeenAt: nowIso
	};

	room.participants.set(params.user.id, participant);
	room.updatedAt = nowIso;
	await syncRoomToSupabase(room);

	return {
		ok: true,
		status: nextStatus,
		room: toRoomDetail(room, params.user.id)
	};
}

export async function connectParticipant(params: {
	roomId: string;
	user: RadioUser;
	joinAsListener: boolean;
}): Promise<{
	ok: boolean;
	error?: string;
	room: RadioRoomDetail | null;
}> {
	const room = roomsById.get(params.roomId);
	if (!room || room.isEnded) {
		return { ok: false, error: 'Room has ended.', room: null };
	}

	checkHostReconnectWindow(room);

	const member = room.participants.get(params.user.id);
	if (!member || member.admissionStatus !== 'admitted') {
		return {
			ok: false,
			error: 'You do not have permission to enter this room.',
			room: null
		};
	}

	const connectedCount = countConnectedParticipants(room);
	if (!member.isConnected && connectedCount >= room.maxParticipants) {
		return {
			ok: false,
			error: `Room is full (${room.maxParticipants} participants maximum).`,
			room: null
		};
	}

	const nowIso = new Date().toISOString();
	member.isConnected = true;
	member.isListenerOnly = params.joinAsListener;
	// Join muted by default on every connection/reconnection
	member.isMuted = true;
	member.isSpeaking = false;
	member.lastSeenAt = nowIso;

	if (room.hostUserId === params.user.id) {
		room.hostDisconnectedAtMs = null;
	}

	room.updatedAt = nowIso;
	await syncRoomToSupabase(room);

	return {
		ok: true,
		room: toRoomDetail(room, params.user.id)
	};
}

export async function leaveRoom(
	roomId: string,
	userId: string
): Promise<{ ok: boolean; room: RadioRoomDetail | null }> {
	const room = roomsById.get(roomId);
	if (!room) return { ok: true, room: null };

	const member = room.participants.get(userId);
	if (member) {
		member.isConnected = false;
		member.isMuted = true;
		member.isSpeaking = false;
		member.lastSeenAt = new Date().toISOString();
	}

	if (room.pttLease.holderUserId === userId) {
		room.pttLease = {
			holderUserId: null,
			holderName: null,
			acquiredAtMs: null,
			expiresAtMs: null
		};
	}

	if (room.hostUserId === userId && !room.isEnded) {
		if (countConnectedParticipants(room) > 0) {
			room.hostDisconnectedAtMs = Date.now();
		} else {
			room.hostDisconnectedAtMs = null;
		}
	}

	room.updatedAt = new Date().toISOString();
	await syncRoomToSupabase(room);

	return {
		ok: true,
		room: isUserPermittedToSeeRoom(room, userId, member?.email ?? '')
			? toRoomDetail(room, userId)
			: null
	};
}

export async function disconnectUserFromAllRooms(userId: string): Promise<void> {
	for (const room of roomsById.values()) {
		if (room.participants.has(userId)) {
			await leaveRoom(room.id, userId);
		}
	}
}

export async function setParticipantMute(
	roomId: string,
	userId: string,
	muted: boolean
): Promise<{ ok: boolean; error?: string; room: RadioRoomDetail | null }> {
	const room = roomsById.get(roomId);
	if (!room || room.isEnded) {
		return { ok: false, error: 'Room has ended.', room: null };
	}

	const member = room.participants.get(userId);
	if (!member || member.admissionStatus !== 'admitted' || !member.isConnected) {
		return { ok: false, error: 'Not connected to this room.', room: null };
	}

	if (!muted && member.isListenerOnly) {
		return {
			ok: false,
			error: 'Microphone is not enabled in listener-only mode.',
			room: toRoomDetail(room, userId)
		};
	}

	if (room.mode === 'radio' && !muted) {
		return {
			ok: false,
			error: 'Room is in Radio (Push-to-Talk) mode. Hold PTT to transmit.',
			room: toRoomDetail(room, userId)
		};
	}

	member.isMuted = muted;
	if (muted) {
		member.isSpeaking = false;
	} else {
		member.unmuteRequestedByHost = false;
	}
	member.lastSeenAt = new Date().toISOString();

	return {
		ok: true,
		room: toRoomDetail(room, userId)
	};
}

export function heartbeatParticipant(
	roomId: string,
	userId: string,
	isSpeaking: boolean
): { ok: boolean; error?: string; room: RadioRoomDetail | null } {
	const room = roomsById.get(roomId);
	if (!room || room.isEnded) {
		return { ok: false, error: 'Room has ended.', room: null };
	}

	pruneExpiredPttLease(room);
	checkHostReconnectWindow(room);

	const member = room.participants.get(userId);
	if (!member || member.admissionStatus !== 'admitted') {
		return {
			ok: false,
			error: 'You are no longer an admitted participant in this room.',
			room: null
		};
	}

	member.lastSeenAt = new Date().toISOString();
	if (room.mode === 'conversation') {
		member.isSpeaking = !member.isMuted && !member.isListenerOnly && isSpeaking;
	} else {
		member.isSpeaking = room.pttLease.holderUserId === userId;
	}

	return {
		ok: true,
		room: toRoomDetail(room, userId)
	};
}

export function acknowledgeUnmuteRequest(
	roomId: string,
	userId: string
): { ok: boolean; room: RadioRoomDetail | null } {
	const room = roomsById.get(roomId);
	if (!room) return { ok: false, room: null };
	const member = room.participants.get(userId);
	if (member) {
		member.unmuteRequestedByHost = false;
	}
	return { ok: true, room: toRoomDetail(room, userId) };
}

/**
 * Coordinates the single-speaker lease in Radio (Push-to-Talk) mode on the server.
 * Handles simultaneous requests deterministically and updates SFU publish permissions.
 */
export async function acquirePttLease(
	roomId: string,
	userId: string
): Promise<{
	ok: boolean;
	busy: boolean;
	speakerId: string | null;
	speakerName: string | null;
	error?: string;
	room: RadioRoomDetail | null;
}> {
	const room = roomsById.get(roomId);
	if (!room || room.isEnded) {
		return {
			ok: false,
			busy: false,
			speakerId: null,
			speakerName: null,
			error: 'Room has ended.',
			room: null
		};
	}

	const nowMs = Date.now();
	pruneExpiredPttLease(room, nowMs);

	const member = room.participants.get(userId);
	if (!member || member.admissionStatus !== 'admitted' || !member.isConnected) {
		return {
			ok: false,
			busy: false,
			speakerId: null,
			speakerName: null,
			error: 'You must be connected to the room to transmit.',
			room: null
		};
	}

	if (member.isListenerOnly) {
		return {
			ok: false,
			busy: false,
			speakerId: null,
			speakerName: null,
			error: 'Enable microphone permission before using Push-to-Talk.',
			room: toRoomDetail(room, userId)
		};
	}

	if (
		room.pttLease.holderUserId &&
		room.pttLease.holderUserId !== userId &&
		room.pttLease.expiresAtMs &&
		room.pttLease.expiresAtMs > nowMs
	) {
		return {
			ok: false,
			busy: true,
			speakerId: room.pttLease.holderUserId,
			speakerName: room.pttLease.holderName,
			error: `Channel busy: ${room.pttLease.holderName} is speaking.`,
			room: toRoomDetail(room, userId)
		};
	}

	const acquiredAtMs =
		room.pttLease.holderUserId === userId && room.pttLease.acquiredAtMs
			? room.pttLease.acquiredAtMs
			: nowMs;

	room.pttLease = {
		holderUserId: userId,
		holderName: member.displayName,
		acquiredAtMs,
		expiresAtMs: nowMs + RADIO_LIMITS.PTT_LEASE_TTL_MS
	};

	for (const p of room.participants.values()) {
		if (p.userId === userId) {
			p.isMuted = false;
			p.isSpeaking = true;
		} else if (room.mode === 'radio') {
			p.isMuted = true;
			p.isSpeaking = false;
		}
	}

	await setRemoteParticipantPublishPermission(room.id, userId, true);

	return {
		ok: true,
		busy: false,
		speakerId: userId,
		speakerName: member.displayName,
		room: toRoomDetail(room, userId)
	};
}

export function heartbeatPttLease(
	roomId: string,
	userId: string
): {
	ok: boolean;
	room: RadioRoomDetail | null;
} {
	const room = roomsById.get(roomId);
	if (!room || room.isEnded) return { ok: false, room: null };

	const nowMs = Date.now();
	pruneExpiredPttLease(room, nowMs);

	if (room.pttLease.holderUserId !== userId) {
		return { ok: false, room: toRoomDetail(room, userId) };
	}

	room.pttLease.expiresAtMs = nowMs + RADIO_LIMITS.PTT_LEASE_TTL_MS;
	const member = room.participants.get(userId);
	if (member) {
		member.lastSeenAt = new Date(nowMs).toISOString();
		member.isSpeaking = true;
		member.isMuted = false;
	}

	return { ok: true, room: toRoomDetail(room, userId) };
}

export async function releasePttLease(
	roomId: string,
	userId: string
): Promise<{
	ok: boolean;
	room: RadioRoomDetail | null;
}> {
	const room = roomsById.get(roomId);
	if (!room) return { ok: false, room: null };

	const member = room.participants.get(userId);
	if (member) {
		member.isSpeaking = false;
		if (room.mode === 'radio') {
			member.isMuted = true;
		}
	}

	if (room.pttLease.holderUserId === userId) {
		room.pttLease = {
			holderUserId: null,
			holderName: null,
			acquiredAtMs: null,
			expiresAtMs: null
		};
		await setRemoteParticipantPublishPermission(room.id, userId, false);
	}

	return { ok: true, room: toRoomDetail(room, userId) };
}

export async function performHostAction(params: {
	roomId: string;
	actorUserId: string;
	payload: {
		action:
			| 'admit_participant'
			| 'deny_participant'
			| 'remove_participant'
			| 'mute_participant'
			| 'request_unmute'
			| 'set_locked'
			| 'set_access_policy'
			| 'set_mode'
			| 'add_explicit_member'
			| 'remove_explicit_member'
			| 'rotate_invitation'
			| 'revoke_invitations'
			| 'transfer_host'
			| 'end_room';
		targetUserId?: string;
		targetEmail?: string;
		isLocked?: boolean;
		accessPolicy?: RadioAccessPolicy;
		mode?: RadioMode;
		invitationExpiryHours?: number;
	};
}): Promise<{
	ok: boolean;
	error?: string;
	inviteToken?: string;
	room: RadioRoomDetail | null;
}> {
	const room = roomsById.get(params.roomId);
	if (!room || room.isEnded) {
		return { ok: false, error: 'Room has ended or does not exist.', room: null };
	}

	// Enforce host role on the server — never trust client state
	if (room.hostUserId !== params.actorUserId) {
		return {
			ok: false,
			error: 'Only the room host can perform this action.',
			room: null
		};
	}

	const { action, targetUserId, targetEmail } = params.payload;
	const nowIso = new Date().toISOString();

	switch (action) {
		case 'admit_participant': {
			if (!targetUserId) {
				return { ok: false, error: 'Missing target participant.', room: null };
			}
			const target = room.participants.get(targetUserId);
			if (!target) {
				return { ok: false, error: 'Participant not found.', room: null };
			}
			target.admissionStatus = 'admitted';
			target.isMuted = true;
			target.lastSeenAt = nowIso;
			break;
		}
		case 'deny_participant': {
			if (!targetUserId) {
				return { ok: false, error: 'Missing target participant.', room: null };
			}
			const target = room.participants.get(targetUserId);
			if (target && target.userId !== room.hostUserId) {
				target.admissionStatus = 'denied';
				target.isConnected = false;
			}
			break;
		}
		case 'remove_participant': {
			if (!targetUserId || targetUserId === room.hostUserId) {
				return { ok: false, error: 'Invalid participant removal target.', room: null };
			}
			const target = room.participants.get(targetUserId);
			if (target) {
				target.admissionStatus = 'removed';
				target.isConnected = false;
				target.isMuted = true;
				target.isSpeaking = false;
				room.explicitMemberEmails.delete(target.email);
			}
			if (room.pttLease.holderUserId === targetUserId) {
				room.pttLease = {
					holderUserId: null,
					holderName: null,
					acquiredAtMs: null,
					expiresAtMs: null
				};
			}
			await removeRemoteParticipantFromSfu(room.id, targetUserId);
			break;
		}
		case 'mute_participant': {
			if (!targetUserId) {
				return { ok: false, error: 'Missing target participant.', room: null };
			}
			const target = room.participants.get(targetUserId);
			if (target) {
				target.isMuted = true;
				target.isSpeaking = false;
			}
			if (room.pttLease.holderUserId === targetUserId) {
				room.pttLease = {
					holderUserId: null,
					holderName: null,
					acquiredAtMs: null,
					expiresAtMs: null
				};
				await setRemoteParticipantPublishPermission(room.id, targetUserId, false);
			}
			break;
		}
		case 'request_unmute': {
			// Request that a participant unmute WITHOUT remotely activating their microphone
			if (!targetUserId) {
				return { ok: false, error: 'Missing target participant.', room: null };
			}
			const target = room.participants.get(targetUserId);
			if (target && target.admissionStatus === 'admitted') {
				target.unmuteRequestedByHost = true;
			}
			break;
		}
		case 'set_locked': {
			room.isLocked = Boolean(params.payload.isLocked);
			break;
		}
		case 'set_access_policy': {
			if (params.payload.accessPolicy) {
				room.accessPolicy = params.payload.accessPolicy;
			}
			break;
		}
		case 'set_mode': {
			if (params.payload.mode && params.payload.mode !== room.mode) {
				room.mode = params.payload.mode;
				room.pttLease = {
					holderUserId: null,
					holderName: null,
					acquiredAtMs: null,
					expiresAtMs: null
				};
				if (room.mode === 'radio') {
					for (const p of room.participants.values()) {
						p.isMuted = true;
						p.isSpeaking = false;
						void setRemoteParticipantPublishPermission(room.id, p.userId, false);
					}
				} else {
					for (const p of room.participants.values()) {
						if (p.admissionStatus === 'admitted' && !p.isListenerOnly) {
							void setRemoteParticipantPublishPermission(room.id, p.userId, true);
						}
					}
				}
			}
			break;
		}
		case 'add_explicit_member': {
			if (!targetEmail) {
				return { ok: false, error: 'Provide a valid Google account email.', room: null };
			}
			room.explicitMemberEmails.add(targetEmail.trim().toLowerCase());
			break;
		}
		case 'remove_explicit_member': {
			if (!targetEmail) {
				return { ok: false, error: 'Provide an email to remove.', room: null };
			}
			const cleaned = targetEmail.trim().toLowerCase();
			const hostAcc = accountsById.get(room.hostUserId);
			if (hostAcc?.email.toLowerCase() !== cleaned) {
				room.explicitMemberEmails.delete(cleaned);
			}
			break;
		}
		case 'rotate_invitation': {
			const { rawToken } = createInvitationForRoom(
				room,
				params.actorUserId,
				params.payload.invitationExpiryHours ?? RADIO_LIMITS.INVITATION_DEFAULT_TTL_HOURS
			);
			room.updatedAt = nowIso;
			await syncRoomToSupabase(room);
			return {
				ok: true,
				inviteToken: rawToken,
				room: toRoomDetail(room, params.actorUserId)
			};
		}
		case 'revoke_invitations': {
			for (const inv of invitationsById.values()) {
				if (inv.roomId === room.id && !inv.revokedAt) {
					inv.revokedAt = nowIso;
				}
			}
			room.activeInvitationId = null;
			break;
		}
		case 'transfer_host': {
			if (!targetUserId || targetUserId === room.hostUserId) {
				return { ok: false, error: 'Select another connected participant.', room: null };
			}
			const nextHost = room.participants.get(targetUserId);
			if (!nextHost || nextHost.admissionStatus !== 'admitted') {
				return { ok: false, error: 'Target participant is not admitted.', room: null };
			}
			const currentHost = room.participants.get(room.hostUserId);
			if (currentHost) currentHost.role = 'participant';
			nextHost.role = 'host';
			room.hostUserId = nextHost.userId;
			room.hostDisplayName = nextHost.displayName;
			break;
		}
		case 'end_room': {
			room.isEnded = true;
			room.pttLease = {
				holderUserId: null,
				holderName: null,
				acquiredAtMs: null,
				expiresAtMs: null
			};
			for (const p of room.participants.values()) {
				p.isConnected = false;
				p.isMuted = true;
				p.isSpeaking = false;
			}
			for (const inv of invitationsById.values()) {
				if (inv.roomId === room.id && !inv.revokedAt) {
					inv.revokedAt = nowIso;
				}
			}
			room.activeInvitationId = null;
			await closeRemoteRoomOnSfu(room.id);
			break;
		}
	}

	room.updatedAt = nowIso;
	await syncRoomToSupabase(room);

	return {
		ok: true,
		room: room.isEnded ? null : toRoomDetail(room, params.actorUserId)
	};
}

export async function deleteUserAccountData(userId: string): Promise<{
	deletedRooms: number;
	removedMemberships: number;
}> {
	revokedAccountIds.add(userId);
	accountsById.delete(userId);

	let deletedRooms = 0;
	let removedMemberships = 0;
	const nowIso = new Date().toISOString();

	for (const [roomId, room] of roomsById.entries()) {
		if (room.hostUserId === userId) {
			room.isEnded = true;
			for (const inv of invitationsById.values()) {
				if (inv.roomId === roomId) {
					inv.revokedAt = nowIso;
					invitationsByHash.delete(inv.tokenHash);
					invitationsById.delete(inv.id);
				}
			}
			await closeRemoteRoomOnSfu(roomId);
			roomsById.delete(roomId);
			deletedRooms += 1;
		} else if (room.participants.has(userId)) {
			room.participants.delete(userId);
			if (room.pttLease.holderUserId === userId) {
				room.pttLease = {
					holderUserId: null,
					holderName: null,
					acquiredAtMs: null,
					expiresAtMs: null
				};
			}
			await removeRemoteParticipantFromSfu(roomId, userId);
			removedMemberships += 1;
		}
	}

	const sb = createNotesAdminClient();
	if (sb) {
		try {
			await sb.from('comm_link_rooms').delete().eq('host_user_id', userId);
			await sb.from('comm_link_accounts').delete().eq('id', userId);
		} catch {
			// Ignore if tables are not provisioned in local test env
		}
	}

	return { deletedRooms, removedMemberships };
}

export async function submitAbuseReport(params: {
	reporterUserId: string;
	roomId?: string | null;
	targetUserId?: string | null;
	reason: string;
	details: string;
}): Promise<StoredAbuseReport> {
	const report: StoredAbuseReport = {
		id: `rep_${crypto.randomBytes(8).toString('hex')}`,
		reporterUserId: params.reporterUserId,
		roomId: params.roomId ?? null,
		targetUserId: params.targetUserId ?? null,
		reason: params.reason,
		details: params.details,
		createdAt: new Date().toISOString()
	};
	abuseReports.push(report);

	const sb = createNotesAdminClient();
	if (sb) {
		try {
			await sb.from('comm_link_abuse_reports').insert({
				id: report.id,
				reporter_user_id: report.reporterUserId,
				room_id: report.roomId,
				target_user_id: report.targetUserId,
				reason: report.reason,
				details: report.details,
				created_at: report.createdAt
			});
		} catch {
			// Ignore
		}
	}

	return report;
}

export function resetRadioStoreForTests(): void {
	accountsById.clear();
	roomsById.clear();
	invitationsByHash.clear();
	invitationsById.clear();
	abuseReports.length = 0;
	revokedAccountIds.clear();
}
