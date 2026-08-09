import { hashString32 } from './seeded-noise';
import { clamp } from './safety';

export const CONDUCTING_MAX_MASTER_PAN = 0.22;
export const CONDUCTING_MAX_TONE_GAIN_DB = 3.5;
export const CONDUCTING_MIN_EVENT_KEEP_RATIO = 0.55;

export type ConductingState = Readonly<{
	horizontal: number;
	vertical: number;
	active: boolean;
}>;

export type ConductingTargets = Readonly<{
	pan: number;
	toneGainDb: number;
	eventKeepRatio: number;
}>;

export const INACTIVE_CONDUCTING_STATE: ConductingState = Object.freeze({
	horizontal: 0,
	vertical: 0,
	active: false
});

export function sanitizeConductingState(
	horizontal: number,
	vertical: number,
	active: boolean
): ConductingState {
	if (!active) return INACTIVE_CONDUCTING_STATE;
	return Object.freeze({
		horizontal: clamp(Number.isFinite(horizontal) ? horizontal : 0, -1, 1),
		vertical: clamp(Number.isFinite(vertical) ? vertical : 0, -1, 1),
		active: true
	});
}

export function conductingTargets(state: ConductingState): ConductingTargets {
	if (!state.active) return { pan: 0, toneGainDb: 0, eventKeepRatio: 1 };
	return {
		pan: state.horizontal * CONDUCTING_MAX_MASTER_PAN,
		toneGainDb: state.vertical * CONDUCTING_MAX_TONE_GAIN_DB,
		// Downward movement makes the performance darker and sparser. Upward movement may brighten
		// the existing score, but never adds events beyond the canonical score's density ceiling.
		eventKeepRatio:
			state.vertical < 0 ? 1 - -state.vertical * (1 - CONDUCTING_MIN_EVENT_KEEP_RATIO) : 1
	};
}

/** Deterministic ephemeral thinning; it reads event identity and never edits or reorders the score. */
export function conductingKeepsEvent(
	eventId: string | number,
	eventIndex: number,
	state: ConductingState
): boolean {
	const keepRatio = conductingTargets(state).eventKeepRatio;
	if (keepRatio >= 1) return true;
	const unit = hashString32(`conducting|${eventId}|${eventIndex}`) / 4_294_967_296;
	return unit < keepRatio;
}
