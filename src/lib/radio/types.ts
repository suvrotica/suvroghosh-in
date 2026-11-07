import { z } from 'zod';

export const RADIO_LIMITS = {
	MAX_PARTICIPANTS_DEFAULT: 12,
	MAX_PARTICIPANTS_HARD_CAP: 12,
	MIN_PARTICIPANTS: 2,
	MAX_DIAL_CHANNELS: 12,
	MAX_ACTIVE_ROOMS_PER_HOST: 3,
	MAX_CONCURRENT_ROOMS_GLOBAL: 25,
	MAX_ROOM_NAME_LEN: 36,
	INVITATION_DEFAULT_TTL_HOURS: 24,
	INVITATION_MAX_TTL_HOURS: 168,
	ROOM_TOKEN_TTL_SECONDS: 900,
	PTT_LEASE_TTL_MS: 8_000,
	PTT_MAX_HOLD_MS: 45_000,
	HOST_RECONNECT_GRACE_MS: 180_000,
	MAX_JSON_BODY_BYTES: 16_384,
	REQUEST_TIMEOUT_MS: 5_000
} as const;

export type RadioMode = 'conversation' | 'radio';

export type RadioAccessPolicy = 'approval_required' | 'members_only';

export type RadioConnectionState =
	| 'offline'
	| 'standby'
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'error';

export type RadioMicState =
	| 'off'
	| 'listener'
	| 'muted'
	| 'transmitting'
	| 'ptt_ready'
	| 'busy';

export type ParticipantAdmissionStatus =
	| 'none'
	| 'pending_approval'
	| 'admitted'
	| 'denied'
	| 'removed';

export interface RadioUser {
	id: string;
	googleSub: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	authenticatedAt: string;
}

export interface RadioParticipant {
	userId: string;
	displayName: string;
	role: 'host' | 'participant';
	admissionStatus: ParticipantAdmissionStatus;
	isConnected: boolean;
	isListenerOnly: boolean;
	isMuted: boolean;
	isSpeaking: boolean;
	unmuteRequestedByHost: boolean;
	joinedAt: string;
	lastSeenAt: string;
}

export interface RadioPttLease {
	holderUserId: string | null;
	holderName: string | null;
	acquiredAt: string | null;
	expiresAt: string | null;
}

export interface RadioRoomSummary {
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
	activeParticipantCount: number;
	maxParticipants: number;
	activeSpeakerName: string | null;
	myAdmissionStatus: ParticipantAdmissionStatus;
	createdAt: string;
}

export interface RadioRoomDetail extends RadioRoomSummary {
	participants: RadioParticipant[];
	pendingApprovalParticipants: RadioParticipant[];
	explicitMemberEmails: string[];
	pttLease: RadioPttLease;
	myParticipant: RadioParticipant | null;
	activeInvitationId: string | null;
	activeInvitationExpiresAt: string | null;
	hostDisconnectedAt: string | null;
}

export interface InvitationPreview {
	valid: boolean;
	reason:
		| 'ok'
		| 'expired'
		| 'revoked'
		| 'room_ended'
		| 'room_locked'
		| 'room_full'
		| 'not_found';
	roomId: string | null;
	roomName: string | null;
	hostDisplayName: string | null;
	mode: RadioMode | null;
	accessPolicy: RadioAccessPolicy | null;
	isLocked: boolean;
	activeParticipantCount: number;
	maxParticipants: number;
	expiresAt: string | null;
}

export interface RadioMediaTokenResponse {
	transport: 'livekit' | 'loopback-webrtc';
	roomId: string;
	participantId: string;
	participantName: string;
	serverUrl: string | null;
	token: string;
	expiresAt: string;
	canPublish: boolean;
	iceServers: RTCIceServer[];
}

export interface RadioProviderStatus {
	googleOAuthConfigured: boolean;
	livekitConfigured: boolean;
	supabaseConfigured: boolean;
	loopbackFallbackAllowed: boolean;
	maxParticipantsPerRoom: number;
	maxConcurrentRoomsGlobal: number;
}

export interface RadioDeviceOption {
	deviceId: string;
	label: string;
	kind: 'audioinput' | 'audiooutput';
}

export interface RadioMediaErrorInfo {
	code:
		| 'permission_denied'
		| 'device_missing'
		| 'device_in_use'
		| 'playback_blocked'
		| 'insecure_context'
		| 'unknown';
	title: string;
	instruction: string;
}

// Strict server-side request validation schemas

export const CreateRoomSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, 'Room name must be at least 2 characters.')
			.max(RADIO_LIMITS.MAX_ROOM_NAME_LEN, 'Room name cannot exceed 36 characters.')
			.regex(
				/^[a-zA-Z0-9 _\-.'#&()]+$/,
				'Room name contains unsupported characters.'
			),
		mode: z.enum(['conversation', 'radio']).default('conversation'),
		accessPolicy: z.enum(['approval_required', 'members_only']).default('approval_required'),
		maxParticipants: z
			.number()
			.int()
			.min(RADIO_LIMITS.MIN_PARTICIPANTS)
			.max(RADIO_LIMITS.MAX_PARTICIPANTS_HARD_CAP)
			.default(RADIO_LIMITS.MAX_PARTICIPANTS_DEFAULT),
		explicitMemberEmails: z
			.array(z.string().trim().email().max(254))
			.max(24)
			.optional()
			.default([]),
		invitationExpiryHours: z
			.number()
			.int()
			.min(1)
			.max(RADIO_LIMITS.INVITATION_MAX_TTL_HOURS)
			.optional()
			.default(RADIO_LIMITS.INVITATION_DEFAULT_TTL_HOURS)
	})
	.strict();

export const JoinRoomSchema = z
	.object({
		action: z.enum([
			'request_join',
			'connect',
			'leave',
			'heartbeat',
			'set_mute',
			'acknowledge_unmute_request'
		]),
		inviteToken: z.string().trim().max(128).optional().nullable(),
		joinAsListener: z.boolean().optional().default(false),
		muted: z.boolean().optional(),
		isSpeaking: z.boolean().optional()
	})
	.strict();

export const PttActionSchema = z
	.object({
		action: z.enum(['acquire', 'heartbeat', 'release'])
	})
	.strict();

export const HostActionSchema = z
	.object({
		action: z.enum([
			'admit_participant',
			'deny_participant',
			'remove_participant',
			'mute_participant',
			'request_unmute',
			'set_locked',
			'set_access_policy',
			'set_mode',
			'add_explicit_member',
			'remove_explicit_member',
			'rotate_invitation',
			'revoke_invitations',
			'transfer_host',
			'end_room'
		]),
		targetUserId: z.string().trim().max(128).optional(),
		targetEmail: z.string().trim().email().max(254).optional(),
		isLocked: z.boolean().optional(),
		accessPolicy: z.enum(['approval_required', 'members_only']).optional(),
		mode: z.enum(['conversation', 'radio']).optional(),
		invitationExpiryHours: z
			.number()
			.int()
			.min(1)
			.max(RADIO_LIMITS.INVITATION_MAX_TTL_HOURS)
			.optional()
	})
	.strict();

export const PreviewInvitationSchema = z
	.object({
		inviteToken: z.string().trim().min(16).max(128)
	})
	.strict();

export const AbuseReportSchema = z
	.object({
		roomId: z.string().trim().min(3).max(96).optional().nullable(),
		targetUserId: z.string().trim().max(128).optional().nullable(),
		reason: z.enum([
			'harassment',
			'impersonation',
			'spam',
			'unauthorised_access',
			'privacy',
			'other'
		]),
		details: z.string().trim().min(5).max(600)
	})
	.strict();
