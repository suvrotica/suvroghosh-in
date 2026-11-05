export type ChannelId = 'rain' | 'fan' | 'city' | 'noise' | 'binaural';
export type NoiseColor = 'brown' | 'pink';
export type BinauralPresetId = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
export type StartingPresetId = 'reading' | 'work' | 'rest';
export type TimerMinutes = 0 | 15 | 30 | 60;

export interface ChannelDefinition {
	id: ChannelId;
	name: string;
	description: string;
	kind: 'recorded' | 'procedural' | 'binaural';
	assetUrl?: string;
	maxGain: number;
	defaultUnmuteLevel: number;
}

export interface BinauralFrequencyPreset {
	id: BinauralPresetId;
	label: string;
	differenceHz: number;
	note: string;
}

export interface ChannelMixState {
	level: number; // 0..100 integer control percentage
	muted: boolean;
	savedLevel: number; // 1..100 retained level for unmuting
}

export interface SoundboardMix {
	channels: Record<ChannelId, ChannelMixState>;
	noiseColor: NoiseColor;
	binauralDifferenceHz: number;
}

export interface StartingPreset {
	id: StartingPresetId;
	name: string;
	summary: string;
	mix: SoundboardMix;
}

export const BINAURAL_BASE_HZ = 220;
export const MIN_DIFFERENCE_HZ = 1;
export const MAX_DIFFERENCE_HZ = 40;
export const TIMER_OPTIONS: readonly TimerMinutes[] = [0, 15, 30, 60] as const;
export const TIMER_FADE_SECONDS = 10;
export const DEFAULT_MASTER_VOLUME = 0.6;

export const CHANNEL_IDS: readonly ChannelId[] = [
	'rain',
	'fan',
	'city',
	'noise',
	'binaural'
] as const;

export const CHANNEL_DEFINITIONS: Readonly<Record<ChannelId, ChannelDefinition>> = {
	rain: {
		id: 'rain',
		name: 'Rain',
		description: 'Steady rain against a window, without thunder',
		kind: 'recorded',
		assetUrl: '/audio/binaural-acoustic-soundboard/rain-window.wav',
		maxGain: 0.26,
		defaultUnmuteLevel: 30
	},
	fan: {
		id: 'fan',
		name: 'Fan',
		description: 'A gentle mechanical hum with soft airflow',
		kind: 'procedural',
		maxGain: 0.2,
		defaultUnmuteLevel: 20
	},
	city: {
		id: 'city',
		name: 'Distant city',
		description: 'A subdued wash of distant activity, without intelligible speech or sudden horns',
		kind: 'recorded',
		assetUrl: '/audio/binaural-acoustic-soundboard/distant-city.wav',
		maxGain: 0.18,
		defaultUnmuteLevel: 20
	},
	noise: {
		id: 'noise',
		name: 'Soft noise',
		description: 'A continuous background texture',
		kind: 'procedural',
		maxGain: 0.18,
		defaultUnmuteLevel: 15
	},
	binaural: {
		id: 'binaural',
		name: 'Binaural tones',
		description: 'A separate continuous tone in each ear',
		kind: 'binaural',
		maxGain: 0.12,
		defaultUnmuteLevel: 15
	}
};

export const BINAURAL_PRESETS: readonly BinauralFrequencyPreset[] = [
	{
		id: 'delta',
		label: 'Delta',
		differenceHz: 2,
		note: '2 Hz difference (220 Hz left / 222 Hz right)'
	},
	{
		id: 'theta',
		label: 'Theta',
		differenceHz: 6,
		note: '6 Hz difference (220 Hz left / 226 Hz right)'
	},
	{
		id: 'alpha',
		label: 'Alpha',
		differenceHz: 10,
		note: '10 Hz difference (220 Hz left / 230 Hz right)'
	},
	{
		id: 'beta',
		label: 'Beta',
		differenceHz: 20,
		note: '20 Hz difference (220 Hz left / 240 Hz right)'
	},
	{
		id: 'gamma',
		label: 'Gamma',
		differenceHz: 40,
		note: '40 Hz exploratory setting (220 Hz left / 260 Hz right)'
	}
] as const;

export const STARTING_PRESETS: Readonly<Record<StartingPresetId, StartingPreset>> = {
	reading: {
		id: 'reading',
		name: 'Reading',
		summary: 'Rain 30% · Fan 15% · Brown noise 10%',
		mix: {
			channels: {
				rain: { level: 30, muted: false, savedLevel: 30 },
				fan: { level: 15, muted: false, savedLevel: 15 },
				city: { level: 0, muted: false, savedLevel: 20 },
				noise: { level: 10, muted: false, savedLevel: 10 },
				binaural: { level: 0, muted: true, savedLevel: 15 }
			},
			noiseColor: 'brown',
			binauralDifferenceHz: 10
		}
	},
	work: {
		id: 'work',
		name: 'Work',
		summary: 'Fan 20% · Pink noise 20%',
		mix: {
			channels: {
				rain: { level: 0, muted: false, savedLevel: 30 },
				fan: { level: 20, muted: false, savedLevel: 20 },
				city: { level: 0, muted: false, savedLevel: 20 },
				noise: { level: 20, muted: false, savedLevel: 20 },
				binaural: { level: 0, muted: true, savedLevel: 15 }
			},
			noiseColor: 'pink',
			binauralDifferenceHz: 10
		}
	},
	rest: {
		id: 'rest',
		name: 'Rest',
		summary: 'Rain 15% · Brown noise 15%',
		mix: {
			channels: {
				rain: { level: 15, muted: false, savedLevel: 15 },
				fan: { level: 0, muted: false, savedLevel: 15 },
				city: { level: 0, muted: false, savedLevel: 20 },
				noise: { level: 15, muted: false, savedLevel: 15 },
				binaural: { level: 0, muted: true, savedLevel: 15 }
			},
			noiseColor: 'brown',
			binauralDifferenceHz: 10
		}
	}
};

export function clampLevel(value: unknown, fallback = 0): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.round(Math.min(100, Math.max(0, value)));
}

export function clampDifferenceHz(value: unknown, fallback = 10): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const clamped = Math.min(MAX_DIFFERENCE_HZ, Math.max(MIN_DIFFERENCE_HZ, value));
	return Math.round(clamped * 2) / 2;
}

export function clampMasterVolume(value: unknown, fallback = DEFAULT_MASTER_VOLUME): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(1, Math.max(0, value));
}

export function cloneMix(mix: SoundboardMix): SoundboardMix {
	return {
		channels: {
			rain: { ...mix.channels.rain },
			fan: { ...mix.channels.fan },
			city: { ...mix.channels.city },
			noise: { ...mix.channels.noise },
			binaural: { ...mix.channels.binaural }
		},
		noiseColor: mix.noiseColor,
		binauralDifferenceHz: mix.binauralDifferenceHz
	};
}

export function resolveBinauralFrequencies(
	differenceHz: number,
	baseHz = BINAURAL_BASE_HZ
): {
	baseHz: number;
	differenceHz: number;
	leftHz: number;
	rightHz: number;
	presetId: BinauralPresetId | null;
	presetLabel: string;
} {
	const diff = clampDifferenceHz(differenceHz);
	const leftHz = baseHz;
	const rightHz = Math.round((baseHz + diff) * 10) / 10;
	const preset = BINAURAL_PRESETS.find((item) => Math.abs(item.differenceHz - diff) < 0.01) ?? null;
	return {
		baseHz,
		differenceHz: diff,
		leftHz,
		rightHz,
		presetId: preset?.id ?? null,
		presetLabel: preset ? `${preset.label} (${diff} Hz)` : `Custom (${diff} Hz)`
	};
}

/**
 * Compute per-channel linear gain with conservative headroom so that all five
 * channels at 100% simultaneously cannot exceed 0.94 linear amplitude.
 */
export function channelLinearGain(channelId: ChannelId, level: number, muted: boolean): number {
	if (muted) return 0;
	const clamped = clampLevel(level, 0);
	if (clamped <= 0) return 0;
	const normalized = clamped / 100;
	const maxGain = CHANNEL_DEFINITIONS[channelId].maxGain;
	return Math.pow(normalized, 1.15) * maxGain;
}

export function maxCombinedLinearGain(): number {
	return CHANNEL_IDS.reduce(
		(sum, id) => sum + channelLinearGain(id, 100, false),
		0
	);
}

export function isChannelAudible(channel: ChannelMixState): boolean {
	return !channel.muted && channel.level > 0;
}

export function effectiveChannelLevel(channel: ChannelMixState): number {
	return channel.muted ? 0 : clampLevel(channel.level, 0);
}

/**
 * Two mixes are considered acoustically equivalent when every channel's audible
 * state (effective level and mute status), noise colour, and binaural frequency match.
 */
export function mixEquals(a: SoundboardMix, b: SoundboardMix): boolean {
	if (a.noiseColor !== b.noiseColor) return false;
	if (Math.abs(a.binauralDifferenceHz - b.binauralDifferenceHz) > 0.01) return false;
	for (const id of CHANNEL_IDS) {
		const ca = a.channels[id];
		const cb = b.channels[id];
		const aOff = ca.muted || ca.level === 0;
		const bOff = cb.muted || cb.level === 0;
		if (aOff && bOff && ca.muted === cb.muted && ca.level === cb.level) continue;
		if (ca.muted !== cb.muted || ca.level !== cb.level) return false;
	}
	return true;
}

export function matchingStartingPresetId(mix: SoundboardMix): StartingPresetId | null {
	for (const id of ['reading', 'work', 'rest'] as const) {
		if (mixEquals(mix, STARTING_PRESETS[id].mix)) return id;
	}
	return null;
}

/**
 * Update a channel's level fader while preserving its saved unmute level.
 * Moving a fader above 0% automatically unmutes the channel.
 */
export function updateChannelLevel(
	mix: SoundboardMix,
	channelId: ChannelId,
	nextLevel: number
): SoundboardMix {
	const clamped = clampLevel(nextLevel, 0);
	const prev = mix.channels[channelId];
	const nextSaved = clamped > 0 ? clamped : prev.savedLevel || CHANNEL_DEFINITIONS[channelId].defaultUnmuteLevel;
	const nextMuted = clamped > 0 ? false : prev.muted;
	return {
		...mix,
		channels: {
			...mix.channels,
			[channelId]: {
				level: clamped,
				muted: nextMuted,
				savedLevel: nextSaved
			}
		}
	};
}

/**
 * Toggle a channel's mute state while retaining its previous level so unmuting
 * restores the setting. If a channel was at 0% (Off) when unmuted, restore its
 * savedLevel (or defaultUnmuteLevel).
 */
export function toggleChannelMute(mix: SoundboardMix, channelId: ChannelId): SoundboardMix {
	const prev = mix.channels[channelId];
	const defaultLevel = CHANNEL_DEFINITIONS[channelId].defaultUnmuteLevel;
	if (prev.muted) {
		const restoredLevel = prev.level > 0 ? prev.level : prev.savedLevel > 0 ? prev.savedLevel : defaultLevel;
		return {
			...mix,
			channels: {
				...mix.channels,
				[channelId]: {
					level: restoredLevel,
					muted: false,
					savedLevel: restoredLevel
				}
			}
		};
	}
	const savedLevel = prev.level > 0 ? prev.level : prev.savedLevel > 0 ? prev.savedLevel : defaultLevel;
	return {
		...mix,
		channels: {
			...mix.channels,
			[channelId]: {
				level: prev.level,
				muted: true,
				savedLevel
			}
		}
	};
}

/**
 * Deterministic xorshift32 PRNG for procedural synthesis.
 */
function createSeededRng(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4294967296;
	};
}

/**
 * Apply an equal-power raised-cosine crossfade across a loop boundary so
 * sample[0] and sample[N-1] join without clicks or phase discontinuities.
 */
export function prepareSeamlessLoopChannels(
	rawChannels: Float32Array[],
	sampleRate: number,
	crossfadeSeconds = 0.8
): Float32Array[] {
	if (rawChannels.length === 0) return [];
	const totalLength = rawChannels[0].length;
	const fadeSamples = Math.min(
		Math.floor(totalLength * 0.25),
		Math.max(64, Math.round(crossfadeSeconds * sampleRate))
	);
	const outLength = totalLength - fadeSamples;
	return rawChannels.map((raw) => {
		const out = new Float32Array(outLength);
		for (let i = 0; i < outLength; i++) {
			if (i < fadeSamples) {
				const phase = (i / fadeSamples) * (Math.PI * 0.5);
				out[i] = raw[i] * Math.sin(phase) + raw[outLength + i] * Math.cos(phase);
			} else {
				out[i] = raw[i];
			}
		}
		return out;
	});
}

/**
 * Procedurally synthesize stereo decorrelated Brown or Pink noise with a seamless
 * equal-power loop boundary.
 */
export function synthesizeProceduralNoiseChannels(
	color: NoiseColor,
	sampleRate: number,
	durationSeconds = 6.5
): [Float32Array, Float32Array] {
	const fadeSeconds = 0.85;
	const rawLength = Math.max(2048, Math.round((durationSeconds + fadeSeconds) * sampleRate));
	const rng = createSeededRng(color === 'brown' ? 0x4252574e : 0x50494e4b);

	const buildChannel = (): Float32Array => {
		const raw = new Float32Array(rawLength);
		if (color === 'brown') {
			let last = 0;
			let lp = 0;
			for (let i = 0; i < rawLength; i++) {
				const white = rng() * 2 - 1;
				last = (last + 0.022 * white) / 1.022;
				lp = lp + 0.18 * (last - lp);
				raw[i] = lp * 3.1;
			}
		} else {
			let b0 = 0;
			let b1 = 0;
			let b2 = 0;
			let b3 = 0;
			let b4 = 0;
			let b5 = 0;
			let b6 = 0;
			let lp = 0;
			for (let i = 0; i < rawLength; i++) {
				const white = rng() * 2 - 1;
				b0 = 0.99886 * b0 + white * 0.0555179;
				b1 = 0.99332 * b1 + white * 0.0750759;
				b2 = 0.969 * b2 + white * 0.153852;
				b3 = 0.8665 * b3 + white * 0.3104856;
				b4 = 0.55 * b4 + white * 0.5329522;
				b5 = -0.7616 * b5 - white * 0.016898;
				const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.042;
				b6 = white * 0.115926;
				lp = lp + 0.32 * (pink - lp);
				raw[i] = lp;
			}
		}
		// Remove DC offset and normalize to 0.70 peak
		let mean = 0;
		for (let i = 0; i < rawLength; i++) mean += raw[i];
		mean /= rawLength;
		let peak = 1e-6;
		for (let i = 0; i < rawLength; i++) {
			raw[i] -= mean;
			const a = Math.abs(raw[i]);
			if (a > peak) peak = a;
		}
		const scale = 0.7 / peak;
		for (let i = 0; i < rawLength; i++) raw[i] *= scale;
		return raw;
	};

	const [left, right] = prepareSeamlessLoopChannels(
		[buildChannel(), buildChannel()],
		sampleRate,
		fadeSeconds
	);
	return [left, right];
}

/**
 * Procedurally synthesize stereo fan airflow + gentle mechanical motor hum with
 * a seamless equal-power loop boundary.
 */
export function synthesizeProceduralFanChannels(
	sampleRate: number,
	durationSeconds = 6.0
): [Float32Array, Float32Array] {
	const fadeSeconds = 0.8;
	const rawLength = Math.max(2048, Math.round((durationSeconds + fadeSeconds) * sampleRate));
	const fadeSamples = Math.round(fadeSeconds * sampleRate);
	const loopLength = rawLength - fadeSamples;
	const rng = createSeededRng(0x46414e31);

	const buildSide = (phaseOffset: number): Float32Array => {
		const raw = new Float32Array(rawLength);
		let lowState = 0;
		let bandState1 = 0;
		let bandState2 = 0;

		for (let i = 0; i < rawLength; i++) {
			const t = i / sampleRate;
			const loopAngle = (2 * Math.PI * (i % loopLength)) / loopLength;
			const white = rng() * 2 - 1;
			// Soft lowpass + resonant airflow body
			lowState += 0.035 * (white - lowState);
			bandState1 += 0.095 * (lowState - bandState1);
			bandState2 += 0.025 * (bandState1 - bandState2);
			const airflow = (bandState1 - bandState2) * 2.4 + lowState * 0.9;
			// Subtle blade-passage envelope locked to the loop period
			const bladeMod = 1 + 0.045 * Math.sin(loopAngle + phaseOffset);
			// Gentle mechanical motor hum (50 Hz fundamental + soft 100 Hz harmonic, integer cycles in 1s)
			const motorHum =
				0.085 * Math.sin(2 * Math.PI * 50 * t + phaseOffset * 0.3) +
				0.032 * Math.sin(2 * Math.PI * 100 * t + phaseOffset * 0.6) +
				0.012 * Math.sin(2 * Math.PI * 150 * t);

			raw[i] = airflow * bladeMod * 0.65 + motorHum;
		}

		let mean = 0;
		for (let i = 0; i < rawLength; i++) mean += raw[i];
		mean /= rawLength;
		let peak = 1e-6;
		for (let i = 0; i < rawLength; i++) {
			raw[i] -= mean;
			const a = Math.abs(raw[i]);
			if (a > peak) peak = a;
		}
		const scale = 0.68 / peak;
		for (let i = 0; i < rawLength; i++) raw[i] *= scale;
		return raw;
	};

	const [left, right] = prepareSeamlessLoopChannels(
		[buildSide(0), buildSide(1.1)],
		sampleRate,
		fadeSeconds
	);
	return [left, right];
}
