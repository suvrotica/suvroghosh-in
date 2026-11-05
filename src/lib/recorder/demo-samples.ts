import { analyzeAudioBuffer } from './dsp';
import { buildWaveformSummary } from './editor';
import { encodePcmWav } from './mp4-encoder';
import { commitCompletedRecording, computeSha256Hex } from './storage';
import {
	createDefaultEditRecipe,
	type RecordingMetadata,
	type RecordingMode
} from './types';

/**
 * Generates the signature worked-example recording:
 * "Speech recorded beside a running ceiling/desk fan with 50 Hz mains hum, a quiet mid-section,
 * and untrimmed leading/trailing fan noise."
 */
export function synthesizeSpeechBesideRunningFan(options?: {
	durationSec?: number;
	sampleRate?: number;
}): {
	channelData: Float32Array[];
	sampleRate: number;
	recommendedTrimStartSec: number;
	recommendedTrimEndSec: number;
} {
	const sampleRate = options?.sampleRate ?? 48000;
	const durationSec = options?.durationSec ?? 12.0;
	const numSamples = Math.round(durationSec * sampleRate);
	const samples = new Float32Array(numSamples);

	const leadMarginSec = Math.min(1.4, durationSec * 0.12);
	const tailMarginSec = Math.min(1.4, durationSec * 0.12);
	const speechStartSec = leadMarginSec;
	const speechEndSec = Math.max(speechStartSec + 1.0, durationSec - tailMarginSec);

	// Deterministic PRNG (Mulberry32) so tests and listening comparisons are 100% reproducible
	let seed = 0x53555652;
	const rand = (): number => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
	};

	// Pink/brown fan turbulence filter states
	let b0 = 0;
	let b1 = 0;
	let b2 = 0;
	let phaseF0 = 0;

	// Spoken syllable cadence table: [relStart, relEnd, pitchHz, f1Hz, f2Hz, gain, sibilantBoost]
	const phrases: [number, number, number, number, number, number, number][] = [
		// Phrase 1: Normal conversational volume ("Recording ten minutes of notes beside a running fan...")
		[0.0, 0.22, 132, 520, 1480, 0.48, 0.12],
		[0.24, 0.48, 144, 660, 1180, 0.52, 0.04],
		[0.52, 0.78, 138, 440, 1920, 0.5, 0.22], // sibilant 's'
		[0.82, 1.12, 126, 580, 1320, 0.46, 0.05],
		[1.18, 1.48, 120, 490, 1080, 0.44, 0.18],
		// Pause (1.48 - 2.25) -> fan noise clearly audible
		// Phrase 2: Quiet aside ("...and this part was spoken further from the microphone...")
		[2.25, 2.55, 128, 510, 1550, 0.17, 0.06],
		[2.58, 2.92, 135, 610, 1380, 0.18, 0.15],
		[2.96, 3.35, 130, 460, 1750, 0.16, 0.05],
		[3.4, 3.82, 122, 540, 1250, 0.17, 0.12],
		// Pause (3.82 - 4.55)
		// Phrase 3: Clear closing sentence ("...let us clean up the noise, trim the ends, and export an MP4.")
		[4.55, 4.9, 148, 640, 1420, 0.54, 0.24],
		[4.95, 5.32, 142, 530, 1860, 0.51, 0.08],
		[5.38, 5.8, 134, 480, 1520, 0.49, 0.19],
		[5.85, 6.35, 125, 600, 1220, 0.47, 0.06],
		[6.42, 6.95, 118, 450, 1120, 0.45, 0.14]
	];
	const cycleDuration = 7.4;

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;

		// 1. Steady background running fan noise (airflow + blade pass + desk rumble)
		const white = rand() * 2;
		b0 = 0.992 * b0 + white * 0.045;
		b1 = 0.965 * b1 + white * 0.065;
		b2 = 0.84 * b2 + white * 0.085;
		const fanAirflow = (b0 + b1 + b2) * 0.042;
		const fanRumble =
			0.024 * Math.sin(2 * Math.PI * 34 * t) +
			0.016 * Math.sin(2 * Math.PI * 72 * t + 0.7);

		// 2. 50 Hz electrical mains hum + harmonics (common in ceiling fans & laptop chargers)
		const mainsHum =
			0.022 * Math.sin(2 * Math.PI * 50 * t) +
			0.011 * Math.sin(2 * Math.PI * 100 * t + 0.3) +
			0.006 * Math.sin(2 * Math.PI * 150 * t + 1.1);

		// 3. Spoken voice signal between speechStartSec and speechEndSec
		let voice = 0;
		if (t >= speechStartSec && t <= speechEndSec) {
			const relT = (t - speechStartSec) % cycleDuration;
			for (let p = 0; p < phrases.length; p++) {
				const [pStart, pEnd, f0Base, f1, f2, amp, sib] = phrases[p];
				if (relT >= pStart && relT <= pEnd) {
					const localT = (relT - pStart) / Math.max(0.01, pEnd - pStart);
					// Smooth syllable envelope
					const env = Math.sin(Math.PI * localT) * Math.min(1, localT * 8) * Math.min(1, (1 - localT) * 6);
					const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.4 * t);
					const f0 = f0Base * (1 - 0.06 * localT) * vibrato;
					phaseF0 += (2 * Math.PI * f0) / sampleRate;

					const h1 = Math.sin(phaseF0);
					const h2 = 0.55 * Math.sin(2 * phaseF0 + 0.2);
					const h3 = 0.35 * Math.sin(3 * phaseF0 + 0.5);
					const formant1 = 0.65 * Math.sin(2 * Math.PI * f1 * t);
					const formant2 = 0.4 * Math.sin(2 * Math.PI * f2 * t);
					const formant3 = 0.18 * Math.sin(2 * Math.PI * 2650 * t);

					// Sibilant burst at start/end of syllable
					const sibEnv = localT < 0.22 ? Math.sin((Math.PI * localT) / 0.22) : 0;
					const sibilance =
						sib *
						sibEnv *
						(Math.sin(2 * Math.PI * 5950 * t) + 0.7 * Math.sin(2 * Math.PI * 6650 * t)) *
						(0.5 + white);

					voice = amp * env * (0.42 * (h1 + h2 + h3) + 0.38 * (formant1 + formant2 + formant3)) + sibilance;
					break;
				}
			}
		}

		samples[i] = Math.max(-0.98, Math.min(0.98, voice + fanAirflow + fanRumble + mainsHum));
	}

	return {
		channelData: [samples],
		sampleRate,
		recommendedTrimStartSec: Number(leadMarginSec.toFixed(2)),
		recommendedTrimEndSec: Number(speechEndSec.toFixed(2))
	};
}

/**
 * Generates an acoustic guitar/piano rehearsal sample for Music mode testing.
 */
export function synthesizeMusicRehearsalSample(sampleRate = 48000, durationSec = 6.0): {
	channelData: Float32Array[];
	sampleRate: number;
} {
	const numSamples = Math.round(durationSec * sampleRate);
	const left = new Float32Array(numSamples);
	const right = new Float32Array(numSamples);
	const chordNotes = [220.0, 277.18, 329.63, 440.0]; // A major warm acoustic voicing

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		const barT = t % 2.0;
		const env = Math.exp(-barT * 1.45) * Math.min(1, barT * 120);
		let sigL = 0;
		let sigR = 0;
		for (let n = 0; n < chordNotes.length; n++) {
			const f = chordNotes[n];
			const noteDelay = n * 0.035;
			if (barT >= noteDelay) {
				const nt = barT - noteDelay;
				const nEnv = Math.exp(-nt * (1.2 + n * 0.25));
				const tone =
					Math.sin(2 * Math.PI * f * nt) +
					0.4 * Math.sin(4 * Math.PI * f * nt) +
					0.15 * Math.sin(6 * Math.PI * f * nt);
				sigL += tone * nEnv * (0.22 - n * 0.02);
				sigR += tone * nEnv * (0.16 + n * 0.02);
			}
		}
		const roomFloor = 0.004 * Math.sin(2 * Math.PI * 190 * t);
		left[i] = Math.max(-0.95, Math.min(0.95, sigL * env + roomFloor));
		right[i] = Math.max(-0.95, Math.min(0.95, sigR * env + roomFloor));
	}

	return { channelData: [left, right], sampleRate };
}

/**
 * Loads the worked example ("Speech beside a running fan") into the local library and returns its metadata.
 */
export async function createWorkedExampleRecording(
	mode: RecordingMode = 'speech'
): Promise<{
	metadata: RecordingMetadata;
	channelData: Float32Array[];
	recommendedTrimStartSec: number;
	recommendedTrimEndSec: number;
}> {
	const sample =
		mode === 'music'
			? {
					...synthesizeMusicRehearsalSample(48000, 8.0),
					recommendedTrimStartSec: 0.4,
					recommendedTrimEndSec: 7.6
				}
			: synthesizeSpeechBesideRunningFan({ durationSec: 12.0, sampleRate: 48000 });

	const wavBytes = encodePcmWav(sample.channelData, sample.sampleRate);
	const durationSec = Number((sample.channelData[0].length / sample.sampleRate).toFixed(2));
	const waveform = buildWaveformSummary(sample.channelData, sample.sampleRate, 360);
	const initialMeasure = analyzeAudioBuffer(sample.channelData, sample.sampleRate);
	const id = `rec_fan_demo_${Date.now()}`;

	const recipe = createDefaultEditRecipe(durationSec, mode);

	const baseMetadata: Omit<RecordingMetadata, 'status' | 'originalSha256' | 'storageBackend'> = {
		id,
		title:
			mode === 'speech'
				? 'Voice Note Beside Running Fan (Worked Example)'
				: mode === 'music'
					? 'Acoustic Studio Idea (Stereo Demo)'
					: 'Calcutta Monsoon Courtyard Ambience',
		notes:
			mode === 'speech'
				? 'Recorded beside a running fan with 50 Hz mains hum, a quiet middle remark, and 1.4s leading/trailing fan noise. Click "Improve sound", adjust trim handles, and export MP4.'
				: 'Sample stereo recording for testing Music & Ambience dynamics preservation.',
		tags: mode === 'speech' ? ['speech', 'fan-noise', 'worked-example'] : [mode, 'demo'],
		favourite: true,
		mode,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		deletedAt: null,
		durationSec,
		capturedMs: durationSec * 1000,
		pausedMs: 0,
		interruptionCount: 0,
		interruptionGapMs: 0,
		sampleRate: sample.sampleRate,
		channels: (sample.channelData.length === 2 ? 2 : 1) as 1 | 2,
		originalMimeType: 'audio/wav',
		originalExtension: 'wav',
		originalByteLength: wavBytes.byteLength,
		chunkCount: 1,
		committedChunkCount: 1,
		recoveredFromCrash: false,
		lastRecoverableSec: durationSec,
		bookmarks: [
			{
				id: 'bm-fan-start',
				timeSec: sample.recommendedTrimStartSec,
				label: 'Speech begins'
			},
			{
				id: 'bm-quiet-phrase',
				timeSec: 3.7,
				label: 'Quiet aside'
			},
			{
				id: 'bm-speech-end',
				timeSec: sample.recommendedTrimEndSec,
				label: 'Speech ends'
			}
		],
		waveform,
		analysis: {
			before: initialMeasure,
			after: initialMeasure,
			summary: 'Original unedited capture beside running fan.',
			changeNotes: [
				`Detected ${initialMeasure.noiseFloorDbfs.toFixed(1)} dBFS background noise floor${initialMeasure.humFrequencyHz ? ` and ${initialMeasure.humFrequencyHz} Hz mains hum` : ''}.`
			]
		},
		recipe
	};

	let metadata: RecordingMetadata;
	try {
		metadata = await commitCompletedRecording({
			metadata: baseMetadata,
			originalBytes: wavBytes,
			pcmChannels: sample.channelData
		});
	} catch {
		metadata = {
			...baseMetadata,
			status: 'error',
			originalSha256: await computeSha256Hex(wavBytes),
			storageBackend: 'indexeddb'
		};
	}

	return {
		metadata,
		channelData: sample.channelData,
		recommendedTrimStartSec: sample.recommendedTrimStartSec,
		recommendedTrimEndSec: sample.recommendedTrimEndSec
	};
}
