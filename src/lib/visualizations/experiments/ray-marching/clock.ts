export const RAY_MARCHING_MAX_DELTA_MS = 50;
export const RAY_MARCHING_SHADER_TIME_WRAP_SECONDS = 600;

export type RayMarchingClock = Readonly<{
	/** Wrapped, precision-safe time sent to the fragment shader. */
	elapsedSeconds: number;
	wrapCount: number;
	lastTimestampMs: number | null;
	playing: boolean;
	suspended: boolean;
	revision: number;
}>;

export type CreateRayMarchingClockOptions = Readonly<{
	elapsedSeconds?: number;
	wrapCount?: number;
	playing?: boolean;
	suspended?: boolean;
	revision?: number;
}>;

function finiteNonNegative(value: number | undefined, fallback = 0): number {
	return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function createRayMarchingClock(
	options: CreateRayMarchingClockOptions = {}
): RayMarchingClock {
	const suppliedElapsed = finiteNonNegative(options.elapsedSeconds);
	const wrapsFromElapsed = Math.floor(suppliedElapsed / RAY_MARCHING_SHADER_TIME_WRAP_SECONDS);
	return Object.freeze({
		elapsedSeconds: suppliedElapsed % RAY_MARCHING_SHADER_TIME_WRAP_SECONDS,
		wrapCount: Math.floor(finiteNonNegative(options.wrapCount)) + wrapsFromElapsed,
		lastTimestampMs: null,
		playing: options.playing ?? true,
		suspended: options.suspended ?? false,
		revision: Math.floor(finiteNonNegative(options.revision))
	});
}

export function tickRayMarchingClock(
	state: RayMarchingClock,
	timestampMs: number
): RayMarchingClock {
	if (!Number.isFinite(timestampMs) || timestampMs < 0) return state;
	if (!state.playing || state.suspended) {
		return state.lastTimestampMs === null
			? state
			: Object.freeze({ ...state, lastTimestampMs: null });
	}
	if (state.lastTimestampMs === null || timestampMs < state.lastTimestampMs) {
		return Object.freeze({ ...state, lastTimestampMs: timestampMs });
	}

	const deltaMs = Math.min(RAY_MARCHING_MAX_DELTA_MS, timestampMs - state.lastTimestampMs);
	const unwrapped = state.elapsedSeconds + deltaMs / 1_000;
	const additionalWraps = Math.floor(unwrapped / RAY_MARCHING_SHADER_TIME_WRAP_SECONDS);
	return Object.freeze({
		...state,
		elapsedSeconds: unwrapped % RAY_MARCHING_SHADER_TIME_WRAP_SECONDS,
		wrapCount: state.wrapCount + additionalWraps,
		lastTimestampMs: timestampMs
	});
}

export function setRayMarchingClockPlaying(
	state: RayMarchingClock,
	playing: boolean
): RayMarchingClock {
	if (playing === state.playing) return state;
	return Object.freeze({ ...state, playing, lastTimestampMs: null });
}

export function setRayMarchingClockSuspended(
	state: RayMarchingClock,
	suspended: boolean
): RayMarchingClock {
	if (suspended === state.suspended) return state;
	return Object.freeze({ ...state, suspended, lastTimestampMs: null });
}

export function resetRayMarchingClock(
	state: RayMarchingClock,
	options: { playing?: boolean } = {}
): RayMarchingClock {
	return Object.freeze({
		elapsedSeconds: 0,
		wrapCount: 0,
		lastTimestampMs: null,
		playing: options.playing ?? state.playing,
		suspended: false,
		revision: state.revision + 1
	});
}
