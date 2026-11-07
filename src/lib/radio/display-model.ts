import type {
	RadioConnectionState,
	RadioMicState,
	RadioMode,
	RadioRoomSummary
} from './types';
import { RADIO_LIMITS } from './types';

export interface AmberScreenInput {
	isAuthenticated: boolean;
	connectionState: RadioConnectionState;
	selectedRoomName: string | null;
	selectedChannelSlot: number;
	participantCount: number;
	maxParticipants: number;
	mode: RadioMode;
	micState: RadioMicState;
	activeSpeakerName: string | null;
	isSelfSpeaking: boolean;
	isRoomLocked: boolean;
}

export interface AmberScreenLines {
	line1: string;
	line2: string;
	line3: string;
	line4: string;
	line5: string;
}

function truncateScreenText(value: string, maxLen: number): string {
	const cleaned = value.trim().toUpperCase();
	if (cleaned.length <= maxLen) return cleaned;
	return `${cleaned.slice(0, maxLen - 1)}…`;
}

/**
 * Formats the concise 5-line readout for the amber screen.
 * Example:
 * COMM-LINK [CONNECTED]
 * ROOM: EVENING CHAT
 * PEOPLE: 05
 * MIC: MUTED
 * SPEAKING: MAYA
 *
 * Never invents fake battery percentages or fake signal bars.
 */
export function formatAmberScreenLines(input: AmberScreenInput): AmberScreenLines {
	let statusTag = 'OFFLINE';

	if (!input.isAuthenticated) {
		statusTag = 'SIGN IN';
	} else if (input.connectionState === 'connected') {
		statusTag = input.isRoomLocked ? 'LOCKED' : 'CONNECTED';
	} else if (input.connectionState === 'connecting') {
		statusTag = 'CONNECTING';
	} else if (input.connectionState === 'reconnecting') {
		statusTag = 'RECONNECT';
	} else if (input.connectionState === 'error') {
		statusTag = 'ALERT';
	} else if (input.selectedRoomName) {
		statusTag = 'SELECTED';
	} else {
		statusTag = 'READY';
	}

	const line1 = `COMM-LINK [${statusTag}]`;

	const slotFormatted = String(
		Math.min(
			RADIO_LIMITS.MAX_DIAL_CHANNELS,
			Math.max(1, Math.round(input.selectedChannelSlot || 1))
		)
	).padStart(2, '0');

	const roomLabel = input.selectedRoomName
		? truncateScreenText(input.selectedRoomName, 16)
		: `CH-${slotFormatted} EMPTY`;
	const line2 = `ROOM: ${roomLabel}`;

	const countFormatted = String(Math.max(0, Math.round(input.participantCount))).padStart(2, '0');
	const line3 = `PEOPLE: ${countFormatted}`;

	let micLabel = 'OFF';
	if (input.connectionState === 'connected') {
		switch (input.micState) {
			case 'listener':
				micLabel = 'LISTENING';
				break;
			case 'muted':
				micLabel = 'MUTED';
				break;
			case 'ptt_ready':
				micLabel = 'HOLD PTT';
				break;
			case 'transmitting':
				micLabel = 'TRANSMITTING';
				break;
			case 'busy':
				micLabel = 'CHANNEL BUSY';
				break;
			default:
				micLabel = 'OFF';
		}
	} else if (!input.isAuthenticated) {
		micLabel = 'SIGN IN REQ';
	} else {
		micLabel = 'STANDBY';
	}
	const line4 = `MIC: ${micLabel}`;

	let speakerLabel = 'NONE';
	if (input.connectionState === 'connected') {
		if (input.isSelfSpeaking || input.micState === 'transmitting') {
			speakerLabel = "YOU'RE SPEAKING";
		} else if (input.micState === 'busy' && input.activeSpeakerName) {
			speakerLabel = truncateScreenText(input.activeSpeakerName, 14);
		} else if (input.activeSpeakerName) {
			speakerLabel = truncateScreenText(input.activeSpeakerName, 14);
		}
	} else {
		speakerLabel = input.mode === 'radio' ? 'MODE: RADIO' : 'MODE: CONV';
	}
	const line5 = `SPEAKING: ${speakerLabel}`;

	return { line1, line2, line3, line4, line5 };
}

export interface DialChannelSlot {
	slot: number;
	label: string;
	room: RadioRoomSummary | null;
}

/**
 * Maps the user's authorised rooms onto the 12 physical dial positions (1..12).
 * Never exposes rooms the user is not authorised to access.
 */
export function mapRoomsToDialChannels(rooms: readonly RadioRoomSummary[]): DialChannelSlot[] {
	const slots: DialChannelSlot[] = [];
	for (let i = 1; i <= RADIO_LIMITS.MAX_DIAL_CHANNELS; i++) {
		const assigned = rooms.find((r) => r.channelSlot === i) ?? rooms[i - 1] ?? null;
		const deduplicated =
			assigned && !slots.some((existing) => existing.room?.id === assigned.id)
				? assigned
				: null;
		slots.push({
			slot: i,
			label: String(i),
			room: deduplicated
		});
	}
	return slots;
}

/**
 * Calculates the visual rotation angle in degrees for a 1..12 channel dial.
 * Slot 1 starts at -60 deg (approx 10 o'clock), incrementing by 30 deg per slot.
 */
export function dialAngleForSlot(slot: number): number {
	const clamped = Math.min(12, Math.max(1, Math.round(slot)));
	return -60 + (clamped - 1) * 30;
}

export function formatPttActionLabel(params: {
	isConnected: boolean;
	mode: RadioMode;
	micState: RadioMicState;
	pttLatchMode: boolean;
}): string {
	if (!params.isConnected) {
		return 'Join Room First';
	}
	if (params.micState === 'listener') {
		return 'Enable Mic to Speak';
	}
	if (params.mode === 'conversation') {
		return params.micState === 'transmitting' ? 'Mute' : 'Unmute';
	}
	if (params.micState === 'transmitting') {
		return params.pttLatchMode ? 'Tap to Stop' : 'Release to Stop';
	}
	if (params.micState === 'busy') {
		return 'Channel Busy';
	}
	return params.pttLatchMode ? 'Tap to Speak' : 'Hold to Speak';
}
