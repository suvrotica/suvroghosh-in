import { beforeEach, describe, expect, it } from 'vitest';
import {
	dialAngleForSlot,
	formatAmberScreenLines,
	formatPttActionLabel,
	mapRoomsToDialChannels
} from './display-model';
import {
	buildAudioCaptureConstraints,
	classifyMediaError,
	stopMediaStreamTracks
} from './audio-devices';
import {
	acquirePttLease,
	connectParticipant,
	createRadioRoom,
	deleteUserAccountData,
	getRoomDetailForUser,
	isAccountRevoked,
	leaveRoom,
	listAuthorisedRoomsForUser,
	performHostAction,
	previewInvitation,
	releasePttLease,
	requestRoomJoin,
	resetRadioStoreForTests,
	setParticipantMute,
	submitAbuseReport
} from '$lib/server/radio/store';
import type { RadioUser } from './types';

function makeUser(index: number, customName?: string): RadioUser {
	return {
		id: `usr_test_${index}`,
		googleSub: `google_sub_${index}`,
		email: `user${index}@example.com`,
		displayName: customName ?? `Operator ${index}`,
		avatarUrl: null,
		authenticatedAt: new Date().toISOString()
	};
}

describe('COMM-LINK display model & audio constraints', () => {
	it('formats the concise 5-line amber screen readout from real state without fake battery/signal bars', () => {
		const lines = formatAmberScreenLines({
			isAuthenticated: true,
			connectionState: 'connected',
			selectedRoomName: 'EVENING CHAT',
			selectedChannelSlot: 1,
			participantCount: 5,
			maxParticipants: 12,
			mode: 'conversation',
			micState: 'muted',
			activeSpeakerName: 'Maya',
			isSelfSpeaking: false,
			isRoomLocked: false
		});

		expect(lines).toEqual({
			line1: 'COMM-LINK [CONNECTED]',
			line2: 'ROOM: EVENING CHAT',
			line3: 'PEOPLE: 05',
			line4: 'MIC: MUTED',
			line5: 'SPEAKING: MAYA'
		});
	});

	it('shows YOU\'RE SPEAKING and CHANNEL BUSY accurately in Radio (PTT) mode', () => {
		const selfTx = formatAmberScreenLines({
			isAuthenticated: true,
			connectionState: 'connected',
			selectedRoomName: 'FIELD OPS',
			selectedChannelSlot: 2,
			participantCount: 4,
			maxParticipants: 12,
			mode: 'radio',
			micState: 'transmitting',
			activeSpeakerName: 'Suvro',
			isSelfSpeaking: true,
			isRoomLocked: false
		});
		expect(selfTx.line4).toBe('MIC: TRANSMITTING');
		expect(selfTx.line5).toBe("SPEAKING: YOU'RE SPEAKING");

		const busy = formatAmberScreenLines({
			isAuthenticated: true,
			connectionState: 'connected',
			selectedRoomName: 'FIELD OPS',
			selectedChannelSlot: 2,
			participantCount: 4,
			maxParticipants: 12,
			mode: 'radio',
			micState: 'busy',
			activeSpeakerName: 'Arjun',
			isSelfSpeaking: false,
			isRoomLocked: false
		});
		expect(busy.line4).toBe('MIC: CHANNEL BUSY');
		expect(busy.line5).toBe('SPEAKING: ARJUN');
	});

	it('maps authorised rooms to 12 rotary dial slots and computes dial angles', () => {
		const slots = mapRoomsToDialChannels([]);
		expect(slots).toHaveLength(12);
		expect(dialAngleForSlot(1)).toBe(-60);
		expect(dialAngleForSlot(3)).toBe(0);
		expect(dialAngleForSlot(12)).toBe(270);

		expect(
			formatPttActionLabel({
				isConnected: true,
				mode: 'conversation',
				micState: 'muted',
				pttLatchMode: false
			})
		).toBe('Unmute');
	});

	it('enforces audio-only getUserMedia constraints (video: false) and classifies media errors', () => {
		const constraints = buildAudioCaptureConstraints('mic-123');
		expect(constraints.video).toBe(false);
		expect(constraints.audio).toEqual({
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			channelCount: 1,
			deviceId: { exact: 'mic-123' }
		});

		const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
		expect(classifyMediaError(denied).code).toBe('permission_denied');

		const missing = Object.assign(new Error('No device'), { name: 'NotFoundError' });
		expect(classifyMediaError(missing).code).toBe('device_missing');

		let stoppedCount = 0;
		const fakeStream = {
			getTracks: () => [
				{ stop: () => (stoppedCount += 1) },
				{ stop: () => (stoppedCount += 1) }
			]
		} as unknown as MediaStream;
		stopMediaStreamTracks(fakeStream);
		expect(stoppedCount).toBe(2);
	});
});

describe('COMM-LINK room authorisation, 12-person capacity, PTT leases, and host controls', () => {
	beforeEach(() => {
		resetRadioStoreForTests();
	});

	it('supports 2-person and 12-person group rooms while enforcing the 12-person capacity limit', async () => {
		const host = makeUser(1, 'Suvro');
		const created = await createRadioRoom({
			host,
			name: 'Evening Chat',
			mode: 'conversation',
			accessPolicy: 'approval_required',
			maxParticipants: 12
		});

		await connectParticipant({
			roomId: created.room.id,
			user: host,
			joinAsListener: false
		});

		// Join 11 more friends via the invitation token (total = 12 participants including host)
		for (let i = 2; i <= 12; i++) {
			const friend = makeUser(i, `Friend ${i}`);
			const joinRes = await requestRoomJoin({
				roomId: created.room.id,
				user: friend,
				inviteToken: created.inviteToken,
				joinAsListener: i === 12 // 12th participant joins as listener-only
			});
			expect(joinRes.ok).toBe(true);
			expect(joinRes.status).toBe('admitted');

			const connRes = await connectParticipant({
				roomId: created.room.id,
				user: friend,
				joinAsListener: i === 12
			});
			expect(connRes.ok).toBe(true);
			// Every participant joins muted by default
			expect(connRes.room?.myParticipant?.isMuted).toBe(true);
		}

		const detailAt12 = getRoomDetailForUser(created.room.id, host.id, host.email);
		expect(detailAt12?.activeParticipantCount).toBe(12);

		// 13th participant must be rejected by the 12-person room capacity limit
		const user13 = makeUser(13, 'Extra Person');
		const join13 = await requestRoomJoin({
			roomId: created.room.id,
			user: user13,
			inviteToken: created.inviteToken,
			joinAsListener: false
		});
		expect(join13.ok).toBe(false);
		expect(join13.error).toContain('12-participant limit');
	});

	it('isolates room visibility in SCAN and blocks unauthorised users, expired/revoked invites, and locked rooms', async () => {
		const host = makeUser(1, 'Host');
		const outsider = makeUser(2, 'Outsider');
		const invited = makeUser(3, 'Invited Friend');

		const created = await createRadioRoom({
			host,
			name: 'Private Strategy Room',
			mode: 'conversation',
			accessPolicy: 'members_only',
			explicitMemberEmails: [invited.email]
		});

		// Outsider signed in with Google cannot see the room in SCAN or read its detail
		expect(listAuthorisedRoomsForUser(outsider.id, outsider.email)).toHaveLength(0);
		expect(getRoomDetailForUser(created.room.id, outsider.id, outsider.email)).toBeNull();

		// Outsider attempting to join a members_only room even with a link is rejected
		const outsiderJoin = await requestRoomJoin({
			roomId: created.room.id,
			user: outsider,
			inviteToken: created.inviteToken
		});
		expect(outsiderJoin.ok).toBe(false);

		// Permitted member email can see and join
		expect(listAuthorisedRoomsForUser(invited.id, invited.email)).toHaveLength(1);
		const invitedJoin = await requestRoomJoin({
			roomId: created.room.id,
			user: invited,
			inviteToken: created.inviteToken
		});
		expect(invitedJoin.ok).toBe(true);

		// Revoking invitations invalidates the invite token immediately
		await performHostAction({
			roomId: created.room.id,
			actorUserId: host.id,
			payload: { action: 'revoke_invitations' }
		});
		const previewRevoked = previewInvitation(created.inviteToken);
		expect(previewRevoked.valid).toBe(false);
		expect(previewRevoked.reason).toBe('revoked');

		// Locking the room blocks new entries
		await performHostAction({
			roomId: created.room.id,
			actorUserId: host.id,
			payload: { action: 'set_locked', isLocked: true }
		});
		const user4 = makeUser(4, 'Latecomer');
		const lockedJoin = await requestRoomJoin({
			roomId: created.room.id,
			user: user4,
			inviteToken: null
		});
		expect(lockedJoin.ok).toBe(false);
		expect(lockedJoin.error).toContain('locked');
	});

	it('enforces single-speaker PTT leases in Radio mode and rejects competing requests fairly', async () => {
		const host = makeUser(1, 'Host');
		const maya = makeUser(2, 'Maya');
		const arjun = makeUser(3, 'Arjun');
		const listener = makeUser(4, 'Listener');

		const created = await createRadioRoom({
			host,
			name: 'Walkie Channel',
			mode: 'radio',
			accessPolicy: 'approval_required'
		});

		for (const u of [host, maya, arjun]) {
			await requestRoomJoin({
				roomId: created.room.id,
				user: u,
				inviteToken: created.inviteToken,
				joinAsListener: false
			});
			await connectParticipant({
				roomId: created.room.id,
				user: u,
				joinAsListener: false
			});
		}

		// Listener joins without mic
		await requestRoomJoin({
			roomId: created.room.id,
			user: listener,
			inviteToken: created.inviteToken,
			joinAsListener: true
		});
		await connectParticipant({
			roomId: created.room.id,
			user: listener,
			joinAsListener: true
		});

		// Listener cannot acquire PTT lease
		const listenerPtt = await acquirePttLease(created.room.id, listener.id);
		expect(listenerPtt.ok).toBe(false);

		// Maya presses PTT and acquires the speaking turn
		const mayaPtt = await acquirePttLease(created.room.id, maya.id);
		expect(mayaPtt.ok).toBe(true);
		expect(mayaPtt.room?.pttLease.holderUserId).toBe(maya.id);
		expect(mayaPtt.room?.pttLease.holderName).toBe('Maya');

		// Arjun presses PTT simultaneously while Maya is speaking -> Channel busy
		const arjunCompeting = await acquirePttLease(created.room.id, arjun.id);
		expect(arjunCompeting.ok).toBe(false);
		expect(arjunCompeting.busy).toBe(true);
		expect(arjunCompeting.speakerName).toBe('Maya');

		// Maya releases PTT -> Arjun can now acquire the speaking turn
		await releasePttLease(created.room.id, maya.id);
		const arjunAfterRelease = await acquirePttLease(created.room.id, arjun.id);
		expect(arjunAfterRelease.ok).toBe(true);
		expect(arjunAfterRelease.room?.pttLease.holderUserId).toBe(arjun.id);

		// Disconnecting Arjun automatically releases his PTT lease so mic is never stuck open
		await leaveRoom(created.room.id, arjun.id);
		const roomAfterLeave = getRoomDetailForUser(created.room.id, host.id, host.email);
		expect(roomAfterLeave?.pttLease.holderUserId).toBeNull();
	});

	it('enforces host moderation (mute, ask to unmute without activating mic, remove & block re-entry)', async () => {
		const host = makeUser(1, 'Host');
		const guest = makeUser(2, 'Guest');

		const created = await createRadioRoom({
			host,
			name: 'Moderation Test',
			mode: 'conversation',
			accessPolicy: 'approval_required'
		});

		await connectParticipant({ roomId: created.room.id, user: host, joinAsListener: false });
		await requestRoomJoin({
			roomId: created.room.id,
			user: guest,
			inviteToken: created.inviteToken
		});
		await connectParticipant({ roomId: created.room.id, user: guest, joinAsListener: false });

		// Guest unmutes in conversation mode
		await setParticipantMute(created.room.id, guest.id, false);
		let detail = getRoomDetailForUser(created.room.id, host.id, host.email);
		expect(detail?.participants.find((p) => p.userId === guest.id)?.isMuted).toBe(false);

		// Guest cannot perform host actions
		const unauthorizedHostAttempt = await performHostAction({
			roomId: created.room.id,
			actorUserId: guest.id,
			payload: { action: 'end_room' }
		});
		expect(unauthorizedHostAttempt.ok).toBe(false);

		// Host mutes guest
		await performHostAction({
			roomId: created.room.id,
			actorUserId: host.id,
			payload: { action: 'mute_participant', targetUserId: guest.id }
		});
		detail = getRoomDetailForUser(created.room.id, host.id, host.email);
		expect(detail?.participants.find((p) => p.userId === guest.id)?.isMuted).toBe(true);

		// Host asks guest to unmute -> sets flag but NEVER remotely activates guest's microphone
		await performHostAction({
			roomId: created.room.id,
			actorUserId: host.id,
			payload: { action: 'request_unmute', targetUserId: guest.id }
		});
		detail = getRoomDetailForUser(created.room.id, guest.id, guest.email);
		expect(detail?.myParticipant?.unmuteRequestedByHost).toBe(true);
		expect(detail?.myParticipant?.isMuted).toBe(true);

		// Host removes guest -> disconnects guest and prevents re-entry with the same invitation
		await performHostAction({
			roomId: created.room.id,
			actorUserId: host.id,
			payload: { action: 'remove_participant', targetUserId: guest.id }
		});
		const rejoinAttempt = await requestRoomJoin({
			roomId: created.room.id,
			user: guest,
			inviteToken: created.inviteToken
		});
		expect(rejoinAttempt.ok).toBe(false);
		expect(rejoinAttempt.status).toBe('removed');
	});

	it('supports account deletion and abuse reporting', async () => {
		const host = makeUser(1, 'Host To Delete');
		const created = await createRadioRoom({
			host,
			name: 'Ephemeral Room',
			mode: 'conversation',
			accessPolicy: 'approval_required'
		});

		const report = await submitAbuseReport({
			reporterUserId: host.id,
			roomId: created.room.id,
			targetUserId: null,
			reason: 'spam',
			details: 'Automated test abuse report.'
		});
		expect(report.id).toMatch(/^rep_/);

		const deleted = await deleteUserAccountData(host.id);
		expect(deleted.deletedRooms).toBe(1);
		expect(isAccountRevoked(host.id)).toBe(true);
		expect(previewInvitation(created.inviteToken).valid).toBe(false);
	});
});
