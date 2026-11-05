export type RecordingMode = 'speech' | 'music' | 'ambience';

export type RecorderState =
	| 'ready'
	| 'requesting-permission'
	| 'testing-mic'
	| 'countdown'
	| 'recording'
	| 'paused'
	| 'saving'
	| 'saved'
	| 'interrupted'
	| 'error';

export type RecorderView = 'record' | 'edit' | 'library';

export type ExportFormat = 'mp4-audio' | 'm4a-audio' | 'mp4-video' | 'original' | 'wav';

export type ExportPresetId =
	| 'compact-speech'
	| 'standard-speech'
	| 'music-stereo'
	| 'high-music-stereo';

export interface RecordingModeSpec {
	id: RecordingMode;
	label: string;
	subtitle: string;
	captureExplanation: string;
	defaultChannels: 1 | 2;
	defaultPreset: ExportPresetId;
	requestMinimalCaptureProcessing: boolean;
}

export const RECORDING_MODES: Record<RecordingMode, RecordingModeSpec> = {
	speech: {
		id: 'speech',
		label: 'Speech',
		subtitle: 'Voice notes, narration, interviews, and spoken ideas.',
		captureExplanation:
			'Requests clean mono capture without stacking aggressive browser auto-gain, then targets fan noise, sub-80 Hz rumble, 50/60 Hz mains hum, sibilance, and uneven voice volume.',
		defaultChannels: 1,
		defaultPreset: 'standard-speech',
		requestMinimalCaptureProcessing: true
	},
	music: {
		id: 'music',
		label: 'Music',
		subtitle: 'Singing, instruments, and rehearsals.',
		captureExplanation:
			'Requests minimal capture processing and stereo input where supported. Preserves musical dynamics, harmonic overtones, and stereo width without speech isolation.',
		defaultChannels: 2,
		defaultPreset: 'music-stereo',
		requestMinimalCaptureProcessing: true
	},
	ambience: {
		id: 'ambience',
		label: 'Ambience',
		subtitle: 'Environmental sound.',
		captureExplanation:
			'Requests minimal capture processing and stereo capture. Gently tames sub-40 Hz wind/handling rumble while preserving room tone and spatial texture.',
		defaultChannels: 2,
		defaultPreset: 'music-stereo',
		requestMinimalCaptureProcessing: true
	}
};

export interface ExportPresetSpec {
	id: ExportPresetId;
	label: string;
	bitrateKbps: 64 | 96 | 192 | 256;
	channels: 1 | 2;
	approxTenMinMb: number;
	description: string;
}

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPresetSpec> = {
	'compact-speech': {
		id: 'compact-speech',
		label: '64 kbps, mono — Smaller voice file',
		bitrateKbps: 64,
		channels: 1,
		approxTenMinMb: 4.8,
		description: '~4.8 MB per 10 min • Ideal for long lectures and quick messaging.'
	},
	'standard-speech': {
		id: 'standard-speech',
		label: '96 kbps, mono — Default for clear speech',
		bitrateKbps: 96,
		channels: 1,
		approxTenMinMb: 7.2,
		description: '~7.2 MB per 10 min • Clear, natural voice quality with small file size.'
	},
	'music-stereo': {
		id: 'music-stereo',
		label: '192 kbps, stereo — Music & Ambience',
		bitrateKbps: 192,
		channels: 2,
		approxTenMinMb: 14.4,
		description: '~14.4 MB per 10 min • Full stereo imaging for instruments and field recordings.'
	},
	'high-music-stereo': {
		id: 'high-music-stereo',
		label: '256 kbps, stereo — Higher-quality music',
		bitrateKbps: 256,
		channels: 2,
		approxTenMinMb: 19.2,
		description: '~19.2 MB per 10 min • High-bitrate stereo AAC for detailed acoustic sessions.'
	}
};

export interface MicrophoneDeviceOption {
	deviceId: string;
	label: string;
	groupId: string;
	isDefault: boolean;
}

export interface CaptureTrackDiagnostics {
	deviceId: string;
	label: string;
	sampleRate: number;
	channelCount: number;
	echoCancellation: boolean;
	noiseSuppression: boolean;
	autoGainControl: boolean;
	latencyMs: number | null;
}

export interface RecorderBookmark {
	id: string;
	timeSec: number;
	label: string;
}

export interface WaveformSummary {
	bucketCount: number;
	peaks: number[];
	rms: number[];
	peakDbfs: number;
	rmsDbfs: number;
}

export interface AudioMeasurement {
	durationSec: number;
	integratedLufs: number;
	rmsDbfs: number;
	peakDbfs: number;
	noiseFloorDbfs: number;
	crestFactorDb: number;
	humFrequencyHz: 50 | 60 | null;
	humLevelDbfs: number;
	rumbleLevelDbfs: number;
	sibilanceRatio: number;
	clippedSamples: number;
	silenceRatio: number;
}

export interface EnhancementAnalysisResult {
	before: AudioMeasurement;
	after: AudioMeasurement;
	summary: string;
	changeNotes: string[];
}

export interface EnhancementSettings {
	enabled: boolean;
	amount: number; // 0..100
	engine: 'dsp' | 'neural';
	mode: RecordingMode;
	noiseReduction: number; // 0..100
	voiceClarity: number; // 0..100
	harshness: number; // 0..100
	volumeConsistency: number; // 0..100
	humRemoval: boolean;
	echoReduction: boolean;
	deClick: boolean;
	clipRepair: boolean;
}

export interface EditSegment {
	id: string;
	sourceRecordingId?: string;
	sourceStartSec: number;
	sourceEndSec: number;
	gainDb: number;
}

export interface SilenceInterval {
	startSec: number;
	endSec: number;
	originalDurationSec: number;
	shortenedDurationSec: number;
}

export interface SilenceReductionSettings {
	enabled: boolean;
	previewed: boolean;
	thresholdDbfs: number;
	minSilenceMs: number;
	keepPauseMs: number;
	detectedIntervals: SilenceInterval[];
}

export interface EditRecipe {
	trimStartSec: number;
	trimEndSec: number;
	segments: EditSegment[];
	fadeInSec: number;
	fadeOutSec: number;
	clipGainDb: number;
	loopSelection: boolean;
	selectionStartSec: number | null;
	selectionEndSec: number | null;
	silenceReduction: SilenceReductionSettings;
	enhancement: EnhancementSettings;
	undoStack: string[];
	redoStack: string[];
}

export interface RecordingMetadata {
	id: string;
	title: string;
	notes: string;
	tags: string[];
	favourite: boolean;
	mode: RecordingMode;
	createdAt: number;
	updatedAt: number;
	deletedAt: number | null;
	status: 'recording' | 'saving' | 'saved' | 'interrupted' | 'error';
	durationSec: number;
	capturedMs: number;
	pausedMs: number;
	interruptionCount: number;
	interruptionGapMs: number;
	sampleRate: number;
	channels: 1 | 2;
	originalMimeType: string;
	originalExtension: string;
	originalByteLength: number;
	originalSha256: string;
	storageBackend: 'opfs' | 'indexeddb';
	chunkCount: number;
	committedChunkCount: number;
	recoveredFromCrash: boolean;
	lastRecoverableSec: number;
	bookmarks: RecorderBookmark[];
	waveform: WaveformSummary;
	analysis: EnhancementAnalysisResult | null;
	recipe: EditRecipe;
}

export interface RecordedChunkRecord {
	key: string;
	sessionId: string;
	recordingId: string;
	index: number;
	timestampMs: number;
	capturedDurationMs: number;
	byteLength: number;
	mimeType: string;
	sha256: string;
	committed: boolean;
	bytes?: Uint8Array;
}

export interface ActiveRecordingSessionJournal {
	sessionId: string;
	recordingId: string;
	tabId: string;
	title: string;
	mode: RecordingMode;
	startedAt: number;
	lastHeartbeatAt: number;
	capturedDurationMs: number;
	pausedDurationMs: number;
	interruptionCount: number;
	interruptionGapMs: number;
	sampleRate: number;
	channels: 1 | 2;
	mimeType: string;
	chunkCount: number;
	committedChunkCount: number;
	status: 'recording' | 'paused' | 'saving' | 'interrupted';
	gapEvents: { timestampMs: number; durationMs: number; reason: string }[];
}

export interface StorageStatusSummary {
	backend: 'opfs' | 'indexeddb';
	persisted: boolean;
	usedBytes: number;
	quotaBytes: number;
	usageRatio: number;
	isLowQuota: boolean;
	isCriticalQuota: boolean;
}

export interface Mp4InspectionResult {
	valid: boolean;
	container: 'mp4' | 'm4a' | 'wav' | 'webm' | 'ogg' | 'unknown';
	majorBrand: string;
	compatibleBrands: string[];
	topLevelBoxes: string[];
	hasAudio: boolean;
	hasVideo: boolean;
	hasAudioTrack: boolean;
	hasVideoTrack: boolean;
	audioCodec: string | null;
	videoCodec: string | null;
	channels: number;
	sampleRate: number;
	durationSec: number;
	seekable: boolean;
	sampleCount: number;
	byteLength: number;
	errors: string[];
}

export interface ExportResult {
	blob: Blob;
	filename: string;
	mimeType: string;
	format: ExportFormat;
	presetId: ExportPresetId;
	estimatedBytes: number;
	actualBytes: number;
	durationSec: number;
	encoderPath: 'webcodecs' | 'aac-ts-iso' | 'pcm-wav' | 'original-remux';
	inspection: Mp4InspectionResult;
}

export interface NeuralModelSpec {
	id: string;
	name: string;
	version: string;
	sizeBytes: number;
	assetPath: string;
}

export const NEURAL_SPEECH_MODEL: NeuralModelSpec = {
	id: 'suvro-speech-gru-v1',
	name: 'Bark-GRU Local Speech Enhancer v1',
	version: '1.0.0',
	sizeBytes: 147_456, // 144 KB binary weights
	assetPath: '/downloads/recorder-neural-speech-v1.bin'
};

export interface NeuralModelStatus extends NeuralModelSpec {
	state: 'not-downloaded' | 'downloading' | 'ready' | 'error';
	cachedBytes: number;
	errorMessage?: string;
}

export function createDefaultEnhancementSettings(
	mode: RecordingMode = 'speech'
): EnhancementSettings {
	if (mode === 'music') {
		return {
			enabled: false,
			amount: 48,
			engine: 'dsp',
			mode: 'music',
			noiseReduction: 30,
			voiceClarity: 35,
			harshness: 30,
			volumeConsistency: 40,
			humRemoval: true,
			echoReduction: false,
			deClick: false,
			clipRepair: true
		};
	}
	if (mode === 'ambience') {
		return {
			enabled: false,
			amount: 40,
			engine: 'dsp',
			mode: 'ambience',
			noiseReduction: 25,
			voiceClarity: 20,
			harshness: 25,
			volumeConsistency: 30,
			humRemoval: true,
			echoReduction: false,
			deClick: false,
			clipRepair: true
		};
	}
	return {
		enabled: false,
		amount: 68,
		engine: 'dsp',
		mode: 'speech',
		noiseReduction: 72,
		voiceClarity: 64,
		harshness: 52,
		volumeConsistency: 68,
		humRemoval: true,
		echoReduction: false,
		deClick: false,
		clipRepair: true
	};
}

export function createDefaultEditRecipe(
	durationSec: number,
	mode: RecordingMode = 'speech'
): EditRecipe {
	const safeDur = Number(Math.max(0.05, Number.isFinite(durationSec) ? durationSec : 0.05).toFixed(3));
	return {
		trimStartSec: 0,
		trimEndSec: safeDur,
		segments: [
			{
				id: 'seg-0',
				sourceStartSec: 0,
				sourceEndSec: safeDur,
				gainDb: 0
			}
		],
		fadeInSec: 0,
		fadeOutSec: 0,
		clipGainDb: 0,
		loopSelection: false,
		selectionStartSec: null,
		selectionEndSec: null,
		silenceReduction: {
			enabled: false,
			previewed: false,
			thresholdDbfs: -42,
			minSilenceMs: 650,
			keepPauseMs: 250,
			detectedIntervals: []
		},
		enhancement: createDefaultEnhancementSettings(mode),
		undoStack: [],
		redoStack: []
	};
}
