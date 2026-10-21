import { normalizeSettings, MAX_TIME } from './engine';
import { MODEL_VERSION } from './presets';
import type { Replay, Settings } from './types';

const MAX_LENGTH = 6000;
const record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
function validSettings(value: unknown): value is Settings {
	if (!record(value)) return false;
	const normalized = normalizeSettings(value as unknown as Settings);
	return Object.keys(normalized).every((key) => value[key] === normalized[key as keyof Settings]);
}
/** An ASCII-only bounded URL component; no environment-dependent base64 APIs. */
export function encodeReplay(replay: Replay): string {
	const value: Replay = {
		version: MODEL_VERSION,
		settings: normalizeSettings(replay.settings),
		baseline: replay.baseline ? normalizeSettings(replay.baseline) : null,
		time: Math.min(MAX_TIME, Math.max(0, replay.time))
	};
	return encodeURIComponent(JSON.stringify(value));
}
export function decodeReplay(input: string): Replay | null {
	if (!input || input.length > MAX_LENGTH) return null;
	try {
		const value: unknown = JSON.parse(input.startsWith('{') ? input : decodeURIComponent(input));
		if (
			!record(value) ||
			value.version !== MODEL_VERSION ||
			!validSettings(value.settings) ||
			!(value.baseline === null || validSettings(value.baseline)) ||
			typeof value.time !== 'number' ||
			!Number.isFinite(value.time) ||
			value.time < 0 ||
			value.time > MAX_TIME
		)
			return null;
		return {
			version: MODEL_VERSION,
			settings: normalizeSettings(value.settings),
			baseline: value.baseline === null ? null : normalizeSettings(value.baseline),
			time: value.time
		};
	} catch {
		return null;
	}
}
