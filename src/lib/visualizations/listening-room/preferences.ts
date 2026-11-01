import { normalizeAudioSettings, type AudioSettings } from './dsp';

// Keep the original key so existing sound settings migrate in place.
export const PREFERENCES_KEY = 'suvroghosh:listening-room:v1';

export interface ListeningPreferences {
	v: 2;
	settings: AudioSettings;
	mode: 'youtube' | 'file';
	muted: boolean;
	advanced: boolean;
	repeat: 'off' | 'one' | 'all';
	shuffle: boolean;
}

export function normalizePreferences(value: unknown): ListeningPreferences {
	const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const input = candidate.v === 1 || candidate.v === 2 ? candidate : {};
	return {
		v: 2,
		settings: normalizeAudioSettings(input.settings),
		mode: input.mode === 'file' ? 'file' : 'youtube',
		muted: input.muted === true,
		advanced: input.advanced === true,
		repeat: input.repeat === 'all' || input.repeat === 'one' ? input.repeat : 'off',
		shuffle: input.shuffle === true
	};
}
