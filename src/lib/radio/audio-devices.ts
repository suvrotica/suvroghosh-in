import type { RadioDeviceOption, RadioMediaErrorInfo } from './types';

export const MICROPHONE_PRE_PROMPT_EXPLANATION =
	'Allow microphone access so people in this room can hear you when you unmute.';

/**
 * Builds strict audio-only capture constraints with video explicitly disabled.
 * Enables echo cancellation, noise suppression, and automatic gain control.
 */
export function buildAudioCaptureConstraints(deviceId?: string): MediaStreamConstraints {
	const audioConstraints: MediaTrackConstraints = {
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: true,
		channelCount: 1
	};

	if (deviceId && deviceId !== 'default') {
		audioConstraints.deviceId = { exact: deviceId };
	}

	return {
		audio: audioConstraints,
		video: false
	};
}

/**
 * Classifies browser MediaDevices / WebAudio errors into short, actionable instructions.
 */
export function classifyMediaError(err: unknown): RadioMediaErrorInfo {
	const name =
		err && typeof err === 'object' && 'name' in err && typeof err.name === 'string'
			? err.name
			: '';
	const message =
		err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
			? err.message
			: '';

	if (
		typeof window !== 'undefined' &&
		!window.isSecureContext &&
		window.location.hostname !== 'localhost' &&
		window.location.hostname !== '127.0.0.1'
	) {
		return {
			code: 'insecure_context',
			title: 'HTTPS Required for Microphone',
			instruction:
				'Open COMM-LINK over HTTPS to enable microphone capture, or join as a listener.'
		};
	}

	if (
		name === 'NotAllowedError' ||
		name === 'PermissionDeniedError' ||
		name === 'SecurityError' ||
		/denied|not allowed|permission/i.test(message)
	) {
		return {
			code: 'permission_denied',
			title: 'Microphone Permission Denied',
			instruction:
				'Click the site permissions icon in your browser address bar, set Microphone to Allow, then press Enable Microphone again — or join listening only.'
		};
	}

	if (
		name === 'NotFoundError' ||
		name === 'DevicesNotFoundError' ||
		/not found|no device|requested device/i.test(message)
	) {
		return {
			code: 'device_missing',
			title: 'No Microphone Detected',
			instruction:
				'Connect a headset or microphone and try again, or join the room in listening-only mode.'
		};
	}

	if (
		name === 'NotReadableError' ||
		name === 'TrackStartError' ||
		name === 'AbortError' ||
		/in use|could not start|hardware/i.test(message)
	) {
		return {
			code: 'device_in_use',
			title: 'Microphone Unavailable',
			instruction:
				'Another application may be using your microphone exclusively. Close other audio apps or choose a different microphone in Settings.'
		};
	}

	return {
		code: 'unknown',
		title: 'Microphone Could Not Start',
		instruction:
			'Check your microphone connection and browser permissions, or join as a listener without a microphone.'
	};
}

export async function enumerateAudioDevices(): Promise<{
	inputs: RadioDeviceOption[];
	outputs: RadioDeviceOption[];
}> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
		return { inputs: [], outputs: [] };
	}

	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const inputs: RadioDeviceOption[] = [];
		const outputs: RadioDeviceOption[] = [];
		let inIdx = 1;
		let outIdx = 1;

		for (const dev of devices) {
			if (dev.kind === 'audioinput') {
				inputs.push({
					deviceId: dev.deviceId || `input-${inIdx}`,
					label: dev.label || `Microphone ${inIdx}`,
					kind: 'audioinput'
				});
				inIdx += 1;
			} else if (dev.kind === 'audiooutput') {
				outputs.push({
					deviceId: dev.deviceId || `output-${outIdx}`,
					label: dev.label || `Speaker / Headset ${outIdx}`,
					kind: 'audiooutput'
				});
				outIdx += 1;
			}
		}

		return { inputs, outputs };
	} catch {
		return { inputs: [], outputs: [] };
	}
}

export function isSinkIdSupported(): boolean {
	if (typeof HTMLMediaElement === 'undefined') return false;
	return 'setSinkId' in HTMLMediaElement.prototype;
}

/**
 * Explicitly requests audio-only microphone permission after a user gesture.
 * Never requests camera access (`video: false`).
 */
export async function requestMicrophonePermissionStream(
	deviceId?: string
): Promise<{ stream: MediaStream | null; error: RadioMediaErrorInfo | null }> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
		return {
			stream: null,
			error: {
				code: 'device_missing',
				title: 'Microphone API Unavailable',
				instruction:
					'This browser does not expose audio capture here. You can still join as a listener.'
			}
		};
	}

	try {
		const constraints = buildAudioCaptureConstraints(deviceId);
		const stream = await navigator.mediaDevices.getUserMedia(constraints);
		// Defensive invariant: immediately stop and remove any unexpected video tracks
		for (const videoTrack of stream.getVideoTracks()) {
			videoTrack.stop();
			stream.removeTrack(videoTrack);
		}
		return { stream, error: null };
	} catch (err) {
		return { stream: null, error: classifyMediaError(err) };
	}
}

/**
 * Stops and releases all tracks on a MediaStream.
 */
export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
	if (!stream) return;
	for (const track of stream.getTracks()) {
		try {
			track.enabled = false;
			track.stop();
		} catch {
			// Ignore already-stopped tracks
		}
	}
}

export interface LocalMicTester {
	stop: () => void;
}

/**
 * Starts a strictly local microphone level meter.
 * Audio stays inside a local AnalyserNode and is NEVER connected to any WebRTC peer,
 * room transport, or even destination speaker (to prevent feedback loops).
 */
export async function startLocalMicTester(
	deviceId: string | undefined,
	onLevel: (normalizedRms: number) => void
): Promise<{ tester: LocalMicTester | null; error: RadioMediaErrorInfo | null }> {
	const { stream, error } = await requestMicrophonePermissionStream(deviceId);
	if (error || !stream) {
		return { tester: null, error };
	}

	let audioCtx: AudioContext | null = null;
	let rafId: number | null = null;
	let stopped = false;

	try {
		const AudioContextCtor =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		audioCtx = new AudioContextCtor();
		const source = audioCtx.createMediaStreamSource(stream);
		const analyser = audioCtx.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = 0.6;
		source.connect(analyser);

		const samples = new Float32Array(analyser.fftSize);
		const tick = () => {
			if (stopped) return;
			analyser.getFloatTimeDomainData(samples);
			let sumSq = 0;
			for (let i = 0; i < samples.length; i++) {
				sumSq += samples[i] * samples[i];
			}
			const rms = Math.sqrt(sumSq / samples.length);
			const scaled = Math.min(1, rms * 4.5);
			onLevel(scaled);
			rafId = window.requestAnimationFrame(tick);
		};
		rafId = window.requestAnimationFrame(tick);
	} catch {
		stopMediaStreamTracks(stream);
		return {
			tester: null,
			error: {
				code: 'unknown',
				title: 'Audio Meter Error',
				instruction: 'Could not initialize the local audio meter.'
			}
		};
	}

	return {
		tester: {
			stop: () => {
				stopped = true;
				if (rafId !== null && typeof window !== 'undefined') {
					window.cancelAnimationFrame(rafId);
				}
				stopMediaStreamTracks(stream);
				if (audioCtx && audioCtx.state !== 'closed') {
					void audioCtx.close().catch(() => {});
				}
				onLevel(0);
			}
		},
		error: null
	};
}
