import {
	CHANNEL_DEFINITIONS,
	CHANNEL_IDS,
	DEFAULT_MASTER_VOLUME,
	STARTING_PRESETS,
	clampDifferenceHz,
	clampLevel,
	clampMasterVolume,
	cloneMix,
	type ChannelId,
	type ChannelMixState,
	type NoiseColor,
	type SoundboardMix
} from './sounds';

export const SOUNDBOARD_STORAGE_KEY = 'binaural-acoustic-soundboard:v1';
export const SOUNDBOARD_STORAGE_VERSION = 1;
export const MAX_SAVED_MIXES = 24;
export const MAX_MIX_NAME_LENGTH = 40;

export interface SavedSoundboardMix {
	id: string;
	name: string;
	mix: SoundboardMix;
	updatedAt: number;
}

export interface MasterVolumePreference {
	volume: number;
	muted: boolean;
}

export interface SoundboardStorageRecord {
	version: 1;
	master: MasterVolumePreference;
	savedMixes: SavedSoundboardMix[];
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function sanitizeMixName(raw: unknown, fallback = 'Custom mix'): string {
	if (typeof raw !== 'string') return fallback;
	const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MIX_NAME_LENGTH);
	return trimmed.length > 0 ? trimmed : fallback;
}

function parseChannelState(
	raw: unknown,
	channelId: ChannelId,
	fallback: ChannelMixState
): ChannelMixState {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ...fallback };
	}
	const record = raw as Record<string, unknown>;
	const level = clampLevel(record.level, fallback.level);
	const muted = typeof record.muted === 'boolean' ? record.muted : fallback.muted;
	const defaultUnmute = CHANNEL_DEFINITIONS[channelId].defaultUnmuteLevel;
	const rawSaved = clampLevel(
		record.savedLevel,
		level > 0 ? level : fallback.savedLevel || defaultUnmute
	);
	const savedLevel = rawSaved > 0 ? rawSaved : defaultUnmute;
	return { level, muted, savedLevel };
}

export function parseStoredMix(raw: unknown): SoundboardMix | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	if (!record.channels || typeof record.channels !== 'object' || Array.isArray(record.channels)) {
		return null;
	}
	const rawChannels = record.channels as Record<string, unknown>;
	const fallbackMix = STARTING_PRESETS.reading.mix;
	const channels = {} as Record<ChannelId, ChannelMixState>;
	for (const id of CHANNEL_IDS) {
		if (!(id in rawChannels)) return null;
		channels[id] = parseChannelState(rawChannels[id], id, fallbackMix.channels[id]);
	}
	const noiseColor: NoiseColor =
		record.noiseColor === 'pink' ? 'pink' : record.noiseColor === 'brown' ? 'brown' : 'brown';
	const binauralDifferenceHz = clampDifferenceHz(
		record.binauralDifferenceHz,
		fallbackMix.binauralDifferenceHz
	);
	return {
		channels,
		noiseColor,
		binauralDifferenceHz
	};
}

function parseSavedMixEntry(raw: unknown): SavedSoundboardMix | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(record.id)) return null;
	if (typeof record.name !== 'string' || record.name.trim().length === 0) return null;
	const mix = parseStoredMix(record.mix);
	if (!mix) return null;
	const updatedAt =
		typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt > 0
			? Math.round(record.updatedAt)
			: 0;
	return {
		id: record.id,
		name: sanitizeMixName(record.name),
		mix,
		updatedAt
	};
}

export function parseSoundboardStorage(rawJson: string | null): SoundboardStorageRecord {
	const defaultRecord: SoundboardStorageRecord = {
		version: SOUNDBOARD_STORAGE_VERSION,
		master: {
			volume: DEFAULT_MASTER_VOLUME,
			muted: false
		},
		savedMixes: []
	};
	if (!rawJson || typeof rawJson !== 'string') return defaultRecord;

	try {
		const parsed = JSON.parse(rawJson);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultRecord;
		const data = parsed as Record<string, unknown>;
		if (data.version !== SOUNDBOARD_STORAGE_VERSION) return defaultRecord;

		let volume = DEFAULT_MASTER_VOLUME;
		let muted = false;
		if (data.master && typeof data.master === 'object' && !Array.isArray(data.master)) {
			const masterObj = data.master as Record<string, unknown>;
			volume = clampMasterVolume(masterObj.volume, DEFAULT_MASTER_VOLUME);
			if (typeof masterObj.muted === 'boolean') muted = masterObj.muted;
		}

		const savedMixes: SavedSoundboardMix[] = [];
		const seenIds = new Set<string>();
		if (Array.isArray(data.savedMixes)) {
			for (const item of data.savedMixes) {
				if (savedMixes.length >= MAX_SAVED_MIXES) break;
				const valid = parseSavedMixEntry(item);
				if (valid && !seenIds.has(valid.id)) {
					seenIds.add(valid.id);
					savedMixes.push(valid);
				}
			}
		}

		// Deliberately ignore any stored playback status, sleep timer, or deadline fields.
		return {
			version: SOUNDBOARD_STORAGE_VERSION,
			master: { volume, muted },
			savedMixes
		};
	} catch {
		return defaultRecord;
	}
}

export function loadSoundboardStorage(
	storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): { record: SoundboardStorageRecord; available: boolean } {
	if (!storage) {
		return {
			record: parseSoundboardStorage(null),
			available: false
		};
	}
	try {
		const raw = storage.getItem(SOUNDBOARD_STORAGE_KEY);
		return {
			record: parseSoundboardStorage(raw),
			available: true
		};
	} catch {
		return {
			record: parseSoundboardStorage(null),
			available: false
		};
	}
}

export function saveSoundboardStorage(
	record: SoundboardStorageRecord,
	storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): boolean {
	if (!storage) return false;
	try {
		const sanitized: SoundboardStorageRecord = {
			version: SOUNDBOARD_STORAGE_VERSION,
			master: {
				volume: clampMasterVolume(record.master.volume, DEFAULT_MASTER_VOLUME),
				muted: Boolean(record.master.muted)
			},
			savedMixes: record.savedMixes.slice(0, MAX_SAVED_MIXES).map((entry) => ({
				id: entry.id,
				name: sanitizeMixName(entry.name),
				mix: cloneMix(entry.mix),
				updatedAt: entry.updatedAt
			}))
		};
		storage.setItem(SOUNDBOARD_STORAGE_KEY, JSON.stringify(sanitized));
		return true;
	} catch {
		return false;
	}
}

export function createSavedMix(
	name: string,
	mix: SoundboardMix,
	now = Date.now(),
	id = `mix_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
): SavedSoundboardMix {
	return {
		id: id.replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || `mix_${now}`,
		name: sanitizeMixName(name),
		mix: cloneMix(mix),
		updatedAt: now
	};
}
