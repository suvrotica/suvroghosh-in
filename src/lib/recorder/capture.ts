import { analyzeAudioBuffer, linearToDb } from './dsp';
import { buildWaveformSummary } from './editor';
import { encodePcmWav } from './mp4-encoder';
import {
	commitCompletedRecording,
	saveSessionJournal,
	writeRecordingChunk
} from './storage';
import {
	createDefaultEditRecipe,
	RECORDING_MODES,
	type ActiveRecordingSessionJournal,
	type CaptureTrackDiagnostics,
	type MicrophoneDeviceOption,
	type RecorderBookmark,
	type RecorderState,
	type RecordingMetadata,
	type RecordingMode
} from './types';

const LOCK_CHANNEL_NAME = 'suvro-recorder-session-v1';
const TAB_ID =
	typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function getCurrentTabId(): string {
	return TAB_ID;
}

export function formatCaptureError(err: unknown): {
	code: 'permission-denied' | 'no-microphone' | 'device-busy' | 'unsupported' | 'unknown';
	title: string;
	message: string;
	recoveryHint: string;
} {
	const name = err instanceof DOMException || err instanceof Error ? err.name : '';
	const rawMsg = err instanceof Error ? err.message : String(err ?? '');

	if (
		name === 'NotAllowedError' ||
		name === 'PermissionDeniedError' ||
		/permission|denied|not allowed/i.test(rawMsg)
	) {
		return {
			code: 'permission-denied',
			title: 'Microphone access was blocked',
			message: 'The browser declined microphone permission for this page.',
			recoveryHint:
				'Allow microphone access in your browser address bar settings, then click Record or Test microphone again — or load the built-in Worked Example or import an existing audio file.'
		};
	}

	if (
		name === 'NotFoundError' ||
		name === 'DevicesNotFoundError' ||
		/not found|no device/i.test(rawMsg)
	) {
		return {
			code: 'no-microphone',
			title: 'No microphone detected',
			message: 'No audio input device was reported by your system.',
			recoveryHint:
				'Connect a USB, headset, or built-in microphone and click Refresh devices, or import an existing recording to edit and enhance.'
		};
	}

	if (name === 'NotReadableError' || name === 'TrackStartError' || /in use|busy/i.test(rawMsg)) {
		return {
			code: 'device-busy',
			title: 'Microphone is busy or unavailable',
			message: 'Another application or browser tab is exclusively using this microphone.',
			recoveryHint:
				'Close other calls or recording apps, select a different input device, and try again.'
		};
	}

	if (
		typeof navigator === 'undefined' ||
		!navigator.mediaDevices ||
		typeof navigator.mediaDevices.getUserMedia !== 'function'
	) {
		return {
			code: 'unsupported',
			title: 'Browser capture API unavailable',
			message: 'This browser context does not expose navigator.mediaDevices.getUserMedia.',
			recoveryHint:
				'Open Recorder over HTTPS (or localhost) in a modern browser, or import an existing audio file.'
		};
	}

	return {
		code: 'unknown',
		title: 'Could not start microphone capture',
		message: rawMsg || 'An unexpected audio capture error occurred.',
		recoveryHint: 'Check your microphone connection and browser permissions, then try again.'
	};
}

/**
 * Enumerates audio input devices WITHOUT requesting getUserMedia.
 * Safe to call after permission has already been granted or to check device count.
 */
export async function enumerateAudioInputsSafe(): Promise<MicrophoneDeviceOption[]> {
	if (
		typeof navigator === 'undefined' ||
		!navigator.mediaDevices ||
		typeof navigator.mediaDevices.enumerateDevices !== 'function'
	) {
		return [];
	}
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const inputs = devices.filter((d) => d.kind === 'audioinput');
		return inputs.map((d, idx) => ({
			deviceId: d.deviceId || `default-${idx}`,
			label: d.label || `Microphone ${idx + 1}`,
			groupId: d.groupId || '',
			isDefault: d.deviceId === 'default' || idx === 0
		}));
	} catch {
		return [];
	}
}

export function buildAudioConstraints(options: {
	deviceId?: string;
	mode: RecordingMode;
	channels: 1 | 2;
}): MediaTrackConstraints {
	const modeSpec = RECORDING_MODES[options.mode];
	const constraints: MediaTrackConstraints = {
		channelCount: { ideal: options.channels },
		sampleRate: { ideal: 48000 },
		echoCancellation: { ideal: modeSpec.requestMinimalCaptureProcessing ? false : false },
		noiseSuppression: { ideal: false },
		autoGainControl: { ideal: false }
	};
	if (options.deviceId && options.deviceId !== 'default' && options.deviceId !== 'default-0') {
		constraints.deviceId = { exact: options.deviceId };
	}
	return constraints;
}

export function inspectMediaStreamTrack(
	track: MediaStreamTrack,
	fallbackChannels: 1 | 2,
	fallbackRate = 48000
): CaptureTrackDiagnostics {
	const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
	return {
		deviceId: settings.deviceId || 'default',
		label: track.label || 'System Microphone',
		sampleRate: settings.sampleRate || fallbackRate,
		channelCount: settings.channelCount || fallbackChannels,
		echoCancellation: Boolean(settings.echoCancellation),
		noiseSuppression: Boolean(settings.noiseSuppression),
		autoGainControl: Boolean(settings.autoGainControl),
		latencyMs:
			typeof (settings as { latency?: number }).latency === 'number'
				? Math.round(((settings as { latency?: number }).latency ?? 0) * 1000)
				: null
	};
}

export interface LiveMeterSnapshot {
	rmsDbfs: number;
	peakDbfs: number;
	clipping: boolean;
	waveformColumnPeak: number;
}

export interface RecorderSessionCallbacks {
	onStateChange: (state: RecorderState) => void;
	onMeterUpdate: (meter: LiveMeterSnapshot) => void;
	onTimerUpdate: (timing: {
		capturedMs: number;
		pausedMs: number;
		interruptionGapMs: number;
		committedChunks: number;
		committedBytes: number;
	}) => void;
	onDiagnostics: (diag: CaptureTrackDiagnostics) => void;
	onError: (err: ReturnType<typeof formatCaptureError>) => void;
	onInterruption: (reason: string) => void;
}

/**
 * Manages microphone testing, active recording, incremental chunk persistence,
 * wake lock, cross-tab session locking, and bounded-memory waveform accumulation.
 */
export class RecorderCaptureController {
	private state: RecorderState = 'ready';
	private isTransitioning = false;
	private stream: MediaStream | null = null;
	private audioCtx: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private monitorGainNode: GainNode | null = null;
	private wakeLockSentinel: WakeLockSentinel | null = null;
	private lockChannel: BroadcastChannel | null = null;
	private otherTabRecording = false;

	private sessionId = '';
	private recordingId = '';
	private title = 'New Recording';
	private mode: RecordingMode = 'speech';
	private requestedChannels: 1 | 2 = 1;
	private sampleRate = 48000;
	private startedAt = 0;
	private capturedMs = 0;
	private pausedMs = 0;
	private lastPauseStartedAt: number | null = null;
	private interruptionCount = 0;
	private interruptionGapMs = 0;
	private lastInterruptionAt: number | null = null;
	private gapEvents: { timestampMs: number; durationMs: number; reason: string }[] = [];
	private bookmarks: RecorderBookmark[] = [];

	// Incremental chunk accumulator (flushes every ~1.5s so memory stays strictly bounded)
	private pendingPcmCh0: Float32Array[] = [];
	private pendingPcmCh1: Float32Array[] = [];
	private pendingSampleCount = 0;
	private chunkIndex = 0;
	private committedChunkCount = 0;
	private committedByteLength = 0;
	private pendingFlushPromises: Promise<void>[] = [];

	// Bounded full-session downsample / PCM store for immediate local editing after Stop and save
	private sessionChunksCh0: Float32Array[] = [];
	private sessionChunksCh1: Float32Array[] = [];
	private totalCapturedSamples = 0;
	private rollingWaveformPeaks: number[] = [];
	private rollingWaveformRms: number[] = [];

	private timerInterval: ReturnType<typeof setInterval> | null = null;
	private countdownTimeout: ReturnType<typeof setTimeout> | null = null;
	private callbacks: RecorderSessionCallbacks;

	constructor(callbacks: RecorderSessionCallbacks) {
		this.callbacks = callbacks;
		this.setupCrossTabLock();
	}

	private setupCrossTabLock(): void {
		if (typeof BroadcastChannel === 'undefined') return;
		try {
			this.lockChannel = new BroadcastChannel(LOCK_CHANNEL_NAME);
			this.lockChannel.onmessage = (ev) => {
				const msg = ev.data as { type?: string; tabId?: string };
				if (!msg || msg.tabId === TAB_ID) return;
				if (msg.type === 'SESSION_ACTIVE') {
					this.otherTabRecording = true;
				} else if (msg.type === 'SESSION_RELEASED') {
					this.otherTabRecording = false;
				} else if (
					msg.type === 'QUERY_ACTIVE' &&
					(this.state === 'recording' || this.state === 'paused')
				) {
					this.lockChannel?.postMessage({ type: 'SESSION_ACTIVE', tabId: TAB_ID });
				}
			};
			this.lockChannel.postMessage({ type: 'QUERY_ACTIVE', tabId: TAB_ID });
		} catch {
			// BroadcastChannel optional
		}
	}

	public getState(): RecorderState {
		return this.state;
	}

	public isAnotherTabRecording(): boolean {
		return this.otherTabRecording;
	}

	private setState(next: RecorderState): void {
		this.state = next;
		this.callbacks.onStateChange(next);
	}

	public setLiveMonitoring(enabled: boolean): void {
		if (this.monitorGainNode && this.audioCtx) {
			this.monitorGainNode.gain.setTargetAtTime(
				enabled ? 0.7 : 0,
				this.audioCtx.currentTime,
				0.015
			);
		}
	}

	/**
	 * Starts a non-recording live microphone level test.
	 * Requests getUserMedia only when the user explicitly clicks "Test microphone".
	 */
	public async startMicrophoneTest(options: {
		deviceId?: string;
		mode: RecordingMode;
		channels: 1 | 2;
	}): Promise<MicrophoneDeviceOption[]> {
		if (this.isTransitioning) return [];
		if (this.state === 'recording' || this.state === 'paused' || this.state === 'saving') {
			return enumerateAudioInputsSafe();
		}

		this.isTransitioning = true;
		this.setState('requesting-permission');

		try {
			await this.releaseHardwareResources();
			const stream = await this.acquireStream(options);
			this.stream = stream;

			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const audioCtx = new AudioCtx({ sampleRate: 48000 });
			this.audioCtx = audioCtx;
			if (audioCtx.state === 'suspended') {
				await audioCtx.resume();
			}

			const track = stream.getAudioTracks()[0];
			const diag = inspectMediaStreamTrack(track, options.channels, audioCtx.sampleRate);
			this.callbacks.onDiagnostics(diag);

			const source = audioCtx.createMediaStreamSource(stream);
			const processor = audioCtx.createScriptProcessor(2048, options.channels, options.channels);
			const muteGain = audioCtx.createGain();
			muteGain.gain.value = 0;

			processor.onaudioprocess = (event) => {
				if (this.state !== 'testing-mic') return;
				const input0 = event.inputBuffer.getChannelData(0);
				let sumSq = 0;
				let peak = 0;
				for (let i = 0; i < input0.length; i++) {
					const v = Math.abs(input0[i]);
					if (v > peak) peak = v;
					sumSq += v * v;
				}
				const rms = Math.sqrt(sumSq / input0.length);
				this.callbacks.onMeterUpdate({
					rmsDbfs: Math.max(-96, linearToDb(rms)),
					peakDbfs: Math.max(-96, linearToDb(peak)),
					clipping: peak >= 0.99,
					waveformColumnPeak: Math.min(1, peak)
				});
			};

			source.connect(processor);
			processor.connect(muteGain);
			muteGain.connect(audioCtx.destination);

			this.sourceNode = source;
			this.processorNode = processor;
			this.monitorGainNode = muteGain;
			this.setState('testing-mic');
			return await enumerateAudioInputsSafe();
		} catch (err) {
			this.setState('error');
			this.callbacks.onError(formatCaptureError(err));
			return [];
		} finally {
			this.isTransitioning = false;
		}
	}

	public async stopMicrophoneTest(): Promise<void> {
		if (this.state !== 'testing-mic') return;
		await this.releaseHardwareResources();
		this.setState('ready');
	}

	private async acquireStream(options: {
		deviceId?: string;
		mode: RecordingMode;
		channels: 1 | 2;
	}): Promise<MediaStream> {
		const primaryConstraints = buildAudioConstraints(options);
		try {
			return await navigator.mediaDevices.getUserMedia({ audio: primaryConstraints, video: false });
		} catch (err) {
			const name = err instanceof DOMException || err instanceof Error ? err.name : '';
			if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
				return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			}
			throw err;
		}
	}

	/**
	 * Starts a new recording session with optional 3-second countdown, incremental persistence,
	 * wake lock, and cross-tab session protection.
	 */
	public async startRecording(options: {
		title: string;
		mode: RecordingMode;
		channels: 1 | 2;
		deviceId?: string;
		countdownSec?: number;
		monitoring?: boolean;
	}): Promise<boolean> {
		if (
			this.isTransitioning ||
			this.state === 'recording' ||
			this.state === 'paused' ||
			this.state === 'saving' ||
			this.state === 'countdown'
		) {
			return false;
		}

		if (this.otherTabRecording) {
			this.callbacks.onError({
				code: 'device-busy',
				title: 'Recording active in another tab',
				message:
					'Another Recorder tab is currently recording. Starting a second session could corrupt local storage.',
				recoveryHint: 'Stop the recording in the other browser tab before starting a new one here.'
			});
			return false;
		}

		this.isTransitioning = true;
		this.setState('requesting-permission');

		try {
			await this.releaseHardwareResources();
			const stream = await this.acquireStream(options);
			this.stream = stream;

			// Optional 3-second countdown before capturing samples
			if (options.countdownSec && options.countdownSec > 0) {
				this.setState('countdown');
				await new Promise<void>((resolve) => {
					this.countdownTimeout = setTimeout(resolve, options.countdownSec! * 1000);
				});
			}

			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const audioCtx = new AudioCtx({ sampleRate: 48000 });
			this.audioCtx = audioCtx;
			if (audioCtx.state === 'suspended') {
				await audioCtx.resume();
			}

			const track = stream.getAudioTracks()[0];
			const diag = inspectMediaStreamTrack(track, options.channels, audioCtx.sampleRate);
			this.callbacks.onDiagnostics(diag);

			this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
			this.recordingId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
			this.title = options.title.trim() || `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
			this.mode = options.mode;
			this.requestedChannels = options.channels;
			this.sampleRate = audioCtx.sampleRate || 48000;
			this.startedAt = Date.now();
			this.capturedMs = 0;
			this.pausedMs = 0;
			this.lastPauseStartedAt = null;
			this.interruptionCount = 0;
			this.interruptionGapMs = 0;
			this.lastInterruptionAt = null;
			this.gapEvents = [];
			this.bookmarks = [];

			this.pendingPcmCh0 = [];
			this.pendingPcmCh1 = [];
			this.pendingSampleCount = 0;
			this.chunkIndex = 0;
			this.committedChunkCount = 0;
			this.committedByteLength = 0;
			this.pendingFlushPromises = [];
			this.sessionChunksCh0 = [];
			this.sessionChunksCh1 = [];
			this.totalCapturedSamples = 0;
			this.rollingWaveformPeaks = [];
			this.rollingWaveformRms = [];

			// Listen for unexpected microphone disconnection or OS audio interruption
			track.onended = () => {
				if (this.state === 'recording' || this.state === 'paused') {
					this.handleUnexpectedInterruption('Microphone disconnected or interrupted by system audio.');
				}
			};
			track.onmute = () => {
				if (this.state === 'recording') {
					this.lastInterruptionAt = Date.now();
					this.interruptionCount++;
					this.callbacks.onInterruption(
						'Audio input muted temporarily by system (such as an incoming call or device switch).'
					);
				}
			};
			track.onunmute = () => {
				if (this.lastInterruptionAt !== null) {
					const gap = Math.max(0, Date.now() - this.lastInterruptionAt);
					this.interruptionGapMs += gap;
					this.gapEvents.push({
						timestampMs: this.lastInterruptionAt,
						durationMs: gap,
						reason: 'Temporary track mute'
					});
					this.lastInterruptionAt = null;
				}
			};

			const source = audioCtx.createMediaStreamSource(stream);
			const processor = audioCtx.createScriptProcessor(4096, options.channels, options.channels);
			const monitorGain = audioCtx.createGain();
			monitorGain.gain.value = options.monitoring ? 0.7 : 0;

			processor.onaudioprocess = (event) => {
				if (this.state !== 'recording') return;
				const in0 = new Float32Array(event.inputBuffer.getChannelData(0));
				const in1 =
					options.channels === 2 && event.inputBuffer.numberOfChannels > 1
						? new Float32Array(event.inputBuffer.getChannelData(1))
						: in0;

				let sumSq = 0;
				let peak = 0;
				for (let i = 0; i < in0.length; i++) {
					const v = Math.abs(in0[i]);
					if (v > peak) peak = v;
					sumSq += v * v;
				}
				const rms = Math.sqrt(sumSq / in0.length);

				this.rollingWaveformPeaks.push(Number(Math.min(1, peak).toFixed(4)));
				this.rollingWaveformRms.push(Number(Math.min(1, rms).toFixed(4)));
				if (this.rollingWaveformPeaks.length > 640) {
					// Compact adjacent pairs so array stays bounded <= 640 numbers regardless of duration
					const compactedPeaks: number[] = [];
					const compactedRms: number[] = [];
					for (let i = 0; i < this.rollingWaveformPeaks.length; i += 2) {
						const pA = this.rollingWaveformPeaks[i];
						const pB = this.rollingWaveformPeaks[i + 1] ?? pA;
						compactedPeaks.push(Math.max(pA, pB));
						const rA = this.rollingWaveformRms[i];
						const rB = this.rollingWaveformRms[i + 1] ?? rA;
						compactedRms.push(0.5 * (rA + rB));
					}
					this.rollingWaveformPeaks = compactedPeaks;
					this.rollingWaveformRms = compactedRms;
				}

				this.pendingPcmCh0.push(in0);
				if (options.channels === 2) {
					this.pendingPcmCh1.push(in1);
				}
				this.sessionChunksCh0.push(in0);
				if (options.channels === 2) {
					this.sessionChunksCh1.push(in1);
				}

				this.pendingSampleCount += in0.length;
				this.totalCapturedSamples += in0.length;
				this.capturedMs = Math.round((this.totalCapturedSamples / this.sampleRate) * 1000);

				this.callbacks.onMeterUpdate({
					rmsDbfs: Math.max(-96, linearToDb(rms)),
					peakDbfs: Math.max(-96, linearToDb(peak)),
					clipping: peak >= 0.99,
					waveformColumnPeak: Math.min(1, peak)
				});

				// Flush incremental chunk every ~1.5 seconds of captured audio
				if (this.pendingSampleCount >= this.sampleRate * 1.5) {
					this.flushIncrementalChunk();
				}
			};

			source.connect(processor);
			processor.connect(monitorGain);
			monitorGain.connect(audioCtx.destination);

			this.sourceNode = source;
			this.processorNode = processor;
			this.monitorGainNode = monitorGain;

			await this.acquireWakeLock();
			this.lockChannel?.postMessage({ type: 'SESSION_ACTIVE', tabId: TAB_ID });

			await this.persistJournal('recording');
			this.startHeartbeatTimer();
			this.setState('recording');
			return true;
		} catch (err) {
			await this.releaseHardwareResources();
			this.setState('error');
			this.callbacks.onError(formatCaptureError(err));
			return false;
		} finally {
			this.isTransitioning = false;
		}
	}

	public pauseRecording(): void {
		if (this.state !== 'recording') return;
		this.lastPauseStartedAt = Date.now();
		this.flushIncrementalChunk();
		this.setState('paused');
		void this.persistJournal('paused');
	}

	public resumeRecording(): void {
		if (this.state !== 'paused') return;
		if (this.lastPauseStartedAt !== null) {
			this.pausedMs += Math.max(0, Date.now() - this.lastPauseStartedAt);
			this.lastPauseStartedAt = null;
		}
		this.setState('recording');
		void this.persistJournal('recording');
	}

	public addBookmark(label?: string): RecorderBookmark | null {
		if (this.state !== 'recording' && this.state !== 'paused') return null;
		const timeSec = Number((this.capturedMs / 1000).toFixed(2));
		const bm: RecorderBookmark = {
			id: `bm_${Date.now()}_${this.bookmarks.length + 1}`,
			timeSec,
			label: label?.trim() || `Marker ${this.bookmarks.length + 1}`
		};
		this.bookmarks = [...this.bookmarks, bm];
		return bm;
	}

	public getBookmarks(): RecorderBookmark[] {
		return this.bookmarks;
	}

	private flushIncrementalChunk(): void {
		if (this.pendingSampleCount === 0) return;
		const count = this.pendingSampleCount;
		const ch0 = new Float32Array(count);
		let offset = 0;
		for (const part of this.pendingPcmCh0) {
			ch0.set(part, offset);
			offset += part.length;
		}
		const channels: Float32Array[] = [ch0];
		if (this.requestedChannels === 2 && this.pendingPcmCh1.length > 0) {
			const ch1 = new Float32Array(count);
			let off1 = 0;
			for (const part of this.pendingPcmCh1) {
				ch1.set(part, off1);
				off1 += part.length;
			}
			channels.push(ch1);
		}

		this.pendingPcmCh0 = [];
		this.pendingPcmCh1 = [];
		this.pendingSampleCount = 0;

		const idx = this.chunkIndex++;
		const capturedDurationMs = Math.round((count / this.sampleRate) * 1000);
		const chunkWavBytes = encodePcmWav(channels, this.sampleRate);

		const promise = writeRecordingChunk({
			sessionId: this.sessionId,
			recordingId: this.recordingId,
			index: idx,
			bytes: chunkWavBytes,
			mimeType: 'audio/wav',
			capturedDurationMs
		})
			.then((rec) => {
				this.committedChunkCount++;
				this.committedByteLength += rec.byteLength;
				return this.persistJournal(this.state === 'paused' ? 'paused' : 'recording');
			})
			.catch((err) => {
				this.callbacks.onError(formatCaptureError(err));
			});

		this.pendingFlushPromises.push(promise);
	}

	private async persistJournal(
		status: ActiveRecordingSessionJournal['status']
	): Promise<void> {
		if (!this.sessionId) return;
		const journal: ActiveRecordingSessionJournal = {
			sessionId: this.sessionId,
			recordingId: this.recordingId,
			tabId: TAB_ID,
			title: this.title,
			mode: this.mode,
			startedAt: this.startedAt,
			lastHeartbeatAt: Date.now(),
			capturedDurationMs: this.capturedMs,
			pausedDurationMs: this.pausedMs,
			interruptionCount: this.interruptionCount,
			interruptionGapMs: this.interruptionGapMs,
			sampleRate: this.sampleRate,
			channels: this.requestedChannels,
			mimeType: 'audio/wav',
			chunkCount: this.chunkIndex,
			committedChunkCount: this.committedChunkCount,
			status,
			gapEvents: this.gapEvents
		};
		await saveSessionJournal(journal);
	}

	private startHeartbeatTimer(): void {
		this.stopHeartbeatTimer();
		this.timerInterval = setInterval(() => {
			if (this.state === 'recording' || this.state === 'paused') {
				const livePaused =
					this.lastPauseStartedAt !== null
						? this.pausedMs + (Date.now() - this.lastPauseStartedAt)
						: this.pausedMs;
				this.callbacks.onTimerUpdate({
					capturedMs: this.capturedMs,
					pausedMs: livePaused,
					interruptionGapMs: this.interruptionGapMs,
					committedChunks: this.committedChunkCount,
					committedBytes: this.committedByteLength
				});
				void this.persistJournal(this.state === 'paused' ? 'paused' : 'recording');
			}
		}, 250);
	}

	private stopHeartbeatTimer(): void {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		if (this.countdownTimeout) {
			clearTimeout(this.countdownTimeout);
			this.countdownTimeout = null;
		}
	}

	private handleUnexpectedInterruption(reason: string): void {
		this.interruptionCount++;
		this.flushIncrementalChunk();
		this.setState('interrupted');
		void this.persistJournal('interrupted');
		this.callbacks.onInterruption(reason);
	}

	/**
	 * Stops recording, flushes all remaining audio buffers, commits the immutable original to
	 * storage, and marks the recording "Saved" only after durable storage verification succeeds.
	 */
	public async stopAndSave(customTitle?: string): Promise<{
		metadata: RecordingMetadata;
		channelData: Float32Array[];
	} | null> {
		if (
			this.isTransitioning ||
			(this.state !== 'recording' && this.state !== 'paused' && this.state !== 'interrupted')
		) {
			return null;
		}

		this.isTransitioning = true;
		this.stopHeartbeatTimer();
		if (this.lastPauseStartedAt !== null) {
			this.pausedMs += Math.max(0, Date.now() - this.lastPauseStartedAt);
			this.lastPauseStartedAt = null;
		}

		this.setState('saving');

		try {
			// Flush any final audio samples before stopping tracks
			this.flushIncrementalChunk();
			await Promise.all(this.pendingFlushPromises);

			await this.releaseHardwareResources();
			this.lockChannel?.postMessage({ type: 'SESSION_RELEASED', tabId: TAB_ID });

			// Assemble full captured PCM channels (guaranteeing at least 0.25s if stopped immediately)
			const minSamples = Math.max(this.totalCapturedSamples, Math.round(this.sampleRate * 0.25));
			const fullCh0 = new Float32Array(minSamples);
			let off0 = 0;
			for (const chunk of this.sessionChunksCh0) {
				fullCh0.set(chunk, off0);
				off0 += chunk.length;
			}
			const fullChannels: Float32Array[] = [fullCh0];
			if (this.requestedChannels === 2 && this.sessionChunksCh1.length > 0) {
				const fullCh1 = new Float32Array(minSamples);
				let off1 = 0;
				for (const chunk of this.sessionChunksCh1) {
					fullCh1.set(chunk, off1);
					off1 += chunk.length;
				}
				fullChannels.push(fullCh1);
			}

			const originalWavBytes = encodePcmWav(fullChannels, this.sampleRate);
			const durationSec = Number((minSamples / this.sampleRate).toFixed(2));
			const waveform = buildWaveformSummary(fullChannels, this.sampleRate, 360);
			const initialMeasure = analyzeAudioBuffer(fullChannels, this.sampleRate);
			const finalTitle = (customTitle ?? this.title).trim() || 'New Recording';

			const metadata = await commitCompletedRecording({
				metadata: {
					id: this.recordingId,
					title: finalTitle,
					notes:
						this.interruptionCount > 0
							? `Captured with ${this.interruptionCount} system interruption(s) (${Math.round(this.interruptionGapMs)} ms total gap).`
							: '',
					tags: [this.mode],
					favourite: false,
					mode: this.mode,
					createdAt: this.startedAt || Date.now(),
					updatedAt: Date.now(),
					deletedAt: null,
					durationSec,
					capturedMs: Math.round(durationSec * 1000),
					pausedMs: this.pausedMs,
					interruptionCount: this.interruptionCount,
					interruptionGapMs: this.interruptionGapMs,
					sampleRate: this.sampleRate,
					channels: this.requestedChannels,
					originalMimeType: 'audio/wav',
					originalExtension: 'wav',
					originalByteLength: originalWavBytes.byteLength,
					chunkCount: Math.max(1, this.chunkIndex),
					committedChunkCount: Math.max(1, this.committedChunkCount),
					recoveredFromCrash: false,
					lastRecoverableSec: durationSec,
					bookmarks: this.bookmarks,
					waveform,
					analysis: {
						before: initialMeasure,
						after: initialMeasure,
						summary: 'Original recording committed to device storage.',
						changeNotes: ['Ready for automatic sound improvement.']
					},
					recipe: createDefaultEditRecipe(durationSec, this.mode)
				},
				originalBytes: originalWavBytes,
				pcmChannels: fullChannels,
				sessionId: this.sessionId
			});

			// Clear session memory buffers now that data is committed to storage
			this.sessionChunksCh0 = [];
			this.sessionChunksCh1 = [];
			this.setState('saved');
			return { metadata, channelData: fullChannels };
		} catch (err) {
			this.setState('error');
			this.callbacks.onError(formatCaptureError(err));
			return null;
		} finally {
			this.isTransitioning = false;
		}
	}

	private async acquireWakeLock(): Promise<void> {
		if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock) {
			try {
				this.wakeLockSentinel = await navigator.wakeLock.request('screen');
			} catch {
				this.wakeLockSentinel = null;
			}
		}
	}

	public async releaseHardwareResources(): Promise<void> {
		this.stopHeartbeatTimer();
		if (this.wakeLockSentinel) {
			try {
				await this.wakeLockSentinel.release();
			} catch {
				// Ignore
			}
			this.wakeLockSentinel = null;
		}
		if (this.processorNode) {
			try {
				this.processorNode.onaudioprocess = null;
				this.processorNode.disconnect();
			} catch {
				// Ignore
			}
			this.processorNode = null;
		}
		if (this.sourceNode) {
			try {
				this.sourceNode.disconnect();
			} catch {
				// Ignore
			}
			this.sourceNode = null;
		}
		if (this.monitorGainNode) {
			try {
				this.monitorGainNode.disconnect();
			} catch {
				// Ignore
			}
			this.monitorGainNode = null;
		}
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				try {
					track.onended = null;
					track.onmute = null;
					track.onunmute = null;
					track.stop();
				} catch {
					// Ignore
				}
			}
			this.stream = null;
		}
		if (this.audioCtx) {
			try {
				await this.audioCtx.close();
			} catch {
				// Ignore
			}
			this.audioCtx = null;
		}
	}

	public async destroy(): Promise<void> {
		await this.releaseHardwareResources();
		if (this.lockChannel) {
			try {
				this.lockChannel.postMessage({ type: 'SESSION_RELEASED', tabId: TAB_ID });
				this.lockChannel.close();
			} catch {
				// Ignore
			}
			this.lockChannel = null;
		}
	}
}

/**
 * Decodes an imported user audio file (WAV, MP3, M4A, MP4, AAC, OGG, FLAC, WebM)
 * using Web Audio API `decodeAudioData` and commits it to the local library.
 */
export async function importExternalAudioFile(file: File, mode: RecordingMode = 'speech'): Promise<{
	metadata: RecordingMetadata;
	channelData: Float32Array[];
}> {
	const arrayBuffer = await file.arrayBuffer();
	if (arrayBuffer.byteLength < 16) {
		throw new Error('The selected file is empty or too small to contain valid audio.');
	}

	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const audioCtx = new AudioCtx({ sampleRate: 48000 });

	try {
		const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
		const channelsCount = (decoded.numberOfChannels >= 2 ? 2 : 1) as 1 | 2;
		const channelData: Float32Array[] = [new Float32Array(decoded.getChannelData(0))];
		if (channelsCount === 2) {
			channelData.push(new Float32Array(decoded.getChannelData(1)));
		}

		const sampleRate = decoded.sampleRate || 48000;
		const durationSec = Number((decoded.length / sampleRate).toFixed(2));
		const waveform = buildWaveformSummary(channelData, sampleRate, 360);
		const measure = analyzeAudioBuffer(channelData, sampleRate);
		const id = `rec_import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
		const extMatch = file.name.match(/\.([a-z0-9]+)$/i);
		const ext = extMatch ? extMatch[1].toLowerCase() : 'wav';
		const cleanTitle = file.name.replace(/\.[^.]+$/, '') || 'Imported Recording';

		const metadata = await commitCompletedRecording({
			metadata: {
				id,
				title: cleanTitle,
				notes: `Imported from ${file.name} (${(file.size / 1024).toFixed(1)} KB).`,
				tags: ['imported', mode],
				favourite: false,
				mode,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: null,
				durationSec,
				capturedMs: Math.round(durationSec * 1000),
				pausedMs: 0,
				interruptionCount: 0,
				interruptionGapMs: 0,
				sampleRate,
				channels: channelsCount,
				originalMimeType: file.type || 'audio/wav',
				originalExtension: ext,
				originalByteLength: arrayBuffer.byteLength,
				chunkCount: 1,
				committedChunkCount: 1,
				recoveredFromCrash: false,
				lastRecoverableSec: durationSec,
				bookmarks: [],
				waveform,
				analysis: {
					before: measure,
					after: measure,
					summary: 'Imported original audio file.',
					changeNotes: ['Ready for sound improvement and trimming.']
				},
				recipe: createDefaultEditRecipe(durationSec, mode)
			},
			originalBytes: new Uint8Array(arrayBuffer),
			pcmChannels: channelData
		});

		return { metadata, channelData };
	} catch {
		throw new Error(
			`Could not decode "${file.name}". Please choose a standard audio format supported by your browser (WAV, MP4/M4A, MP3, AAC, OGG, or FLAC).`
		);
	} finally {
		try {
			await audioCtx.close();
		} catch {
			// Ignore
		}
	}
}
