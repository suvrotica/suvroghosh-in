import type { AudioExportProgress, SonicEvent, SoundWorldId } from './contracts';
import { createOrchestraMasterGraph } from './graph-builder';
import { safeSoundWorld, soundWorldPatch } from './patches';
import {
	AUDIO_INITIAL_VOLUME,
	AUDIO_MAX_OFFLINE_SECONDS,
	abortError,
	clamp,
	safeDuration,
	safeMasterVolume,
	throwIfAborted
} from './safety';
import { OrchestraVoicePool, scheduleSonicEvent } from './voices';

export type OfflineAudioContextFactory = (
	channels: number,
	length: number,
	sampleRate: number
) => OfflineAudioContext;

export type OfflineRenderOptions = Readonly<{
	events: readonly SonicEvent[];
	seed?: string | number;
	soundWorld?: SoundWorldId;
	durationSeconds?: number;
	sampleRate?: number;
	channels?: 1 | 2;
	volume?: number;
	signal?: AbortSignal;
	onProgress?: (progress: AudioExportProgress) => void;
	contextFactory?: OfflineAudioContextFactory;
}>;

export type OfflineRenderResult = Readonly<{
	buffer: AudioBuffer;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
	soundWorld: SoundWorldId;
	scheduledEvents: number;
}>;

type IndexedEvent = Readonly<{ event: SonicEvent; originalIndex: number }>;

function eventTime(event: SonicEvent): number {
	return Number.isFinite(event.time) ? Math.max(0, event.time) : 0;
}

function sortedEvents(events: readonly SonicEvent[]): IndexedEvent[] {
	return events
		.map((event, originalIndex) => ({ event, originalIndex }))
		.sort(
			(first, second) =>
				eventTime(first.event) - eventTime(second.event) ||
				String(first.event.id).localeCompare(String(second.event.id)) ||
				first.originalIndex - second.originalIndex
		);
}

function inferredDuration(events: readonly IndexedEvent[], releaseSeconds: number): number {
	let lastEnd = 0.25;
	for (const { event } of events) {
		lastEnd = Math.max(
			lastEnd,
			eventTime(event) + safeDuration(event.duration ?? releaseSeconds, releaseSeconds)
		);
	}
	return lastEnd + Math.max(0.2, releaseSeconds * 0.65);
}

function browserOfflineContextFactory(
	channels: number,
	length: number,
	sampleRate: number
): OfflineAudioContext {
	if (typeof OfflineAudioContext === 'undefined') {
		throw new Error('Offline Web Audio rendering is unavailable in this browser.');
	}
	return new OfflineAudioContext(channels, length, sampleRate);
}

function progress(
	callback: OfflineRenderOptions['onProgress'],
	stage: 'preparing' | 'rendering',
	stageProgress: number,
	message: string
): void {
	callback?.({ stage, progress: clamp(stageProgress, 0, 1), message });
}

function nextTask(): Promise<void> {
	return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function startRenderingWithCancellation(
	context: OfflineAudioContext,
	signal?: AbortSignal
): Promise<AudioBuffer> {
	if (!signal) return context.startRendering();
	return new Promise<AudioBuffer>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener('abort', handleAbort);
			callback();
		};
		const handleAbort = () => finish(() => reject(abortError()));
		signal.addEventListener('abort', handleAbort, { once: true });
		if (signal.aborted) {
			handleAbort();
			return;
		}
		context.startRendering().then(
			(buffer) => finish(() => resolve(buffer)),
			(error: unknown) => finish(() => reject(error))
		);
	});
}

/**
 * Renders through the exact graph and event-to-voice path used by the real-time engine.
 * Construction of OfflineAudioContext is deliberately deferred until this function is called.
 */
export async function renderOrchestraOffline(
	options: OfflineRenderOptions
): Promise<OfflineRenderResult> {
	throwIfAborted(options.signal);
	const events = sortedEvents(options.events);
	const world = safeSoundWorld(options.soundWorld);
	const patch = soundWorldPatch(world);
	const sampleRate = Math.round(clamp(options.sampleRate ?? 48_000, 8_000, 96_000));
	const channels = options.channels === 1 ? 1 : 2;
	const requestedDuration =
		options.durationSeconds ?? inferredDuration(events, patch.releaseSeconds);
	const durationSeconds = clamp(requestedDuration, 0.25, AUDIO_MAX_OFFLINE_SECONDS);
	const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
	const factory = options.contextFactory ?? browserOfflineContextFactory;
	progress(options.onProgress, 'preparing', 0, 'Preparing deterministic score');

	const context = factory(channels, frameCount, sampleRate);
	const graph = createOrchestraMasterGraph(
		context,
		safeMasterVolume(options.volume ?? AUDIO_INITIAL_VOLUME),
		patch
	);
	const voices = new OrchestraVoicePool(context, graph.destination);
	let scheduledEvents = 0;

	try {
		const batchSize = 32;
		for (let start = 0; start < events.length; start += batchSize) {
			throwIfAborted(options.signal);
			const end = Math.min(events.length, start + batchSize);
			for (let index = start; index < end; index += 1) {
				const indexed = events[index];
				const at = eventTime(indexed.event);
				if (at >= durationSeconds) continue;
				scheduleSonicEvent(
					voices,
					indexed.event,
					patch,
					options.seed ?? 'langford-1847',
					at,
					indexed.originalIndex
				);
				scheduledEvents += 1;
			}
			progress(
				options.onProgress,
				'preparing',
				events.length === 0 ? 0.3 : (end / events.length) * 0.3,
				`Preparing voices ${end}/${events.length}`
			);
			await nextTask();
		}

		throwIfAborted(options.signal);
		progress(options.onProgress, 'rendering', 0, 'Rendering audio');
		const buffer = await startRenderingWithCancellation(context, options.signal);
		throwIfAborted(options.signal);
		progress(options.onProgress, 'rendering', 1, 'Audio render complete');
		return {
			buffer,
			durationSeconds: buffer.duration,
			sampleRate: buffer.sampleRate,
			channels: buffer.numberOfChannels,
			soundWorld: world,
			scheduledEvents
		};
	} catch (error) {
		if (options.signal?.aborted) {
			graph.emergencySilence(context.currentTime);
			voices.emergencyStop(context.currentTime);
		}
		throw error;
	} finally {
		voices.dispose();
		graph.dispose();
	}
}
