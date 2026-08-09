import { getAttractorDefinition, isAttractorId } from '../model/registry';
import { getSoundWorldPatch } from '../score/musical-worlds';
import type {
	AttractorId,
	CoreGenerationResult,
	GenerationProgress,
	OrchestraSnapshot,
	SonicEvent as CoreSonicEvent
} from '../types';
import {
	DEFAULT_ORCHESTRA_SNAPSHOT,
	parseOrchestraUrlState,
	serializeOrchestraUrlState
} from '../url-state';
import type { OrchestraWorkerClient, WorkerGenerateOptions } from '../worker/client';
import { StrangeAttractorAudioEngine } from './audio-engine';
import type { SonicEvent, SoundWorldId } from './contracts';
import { safeSoundWorld } from './patches';
import { abortError } from './safety';

export const PORTRAIT_STOP_EVENT = 'sa:portrait-stop' as const;
export const PORTRAIT_POINT_COUNT = 4_096;
export const PORTRAIT_DURATION_SECONDS = 15;

export type PortraitCompositionOptions = Readonly<{
	/** A validated shared snapshot is preferred so portrait and desktop produce the same score. */
	snapshot?: OrchestraSnapshot;
	attractorId?: string;
	soundWorld?: string;
	onProgress?: (progress: GenerationProgress) => void;
}>;

export type PortraitCompositionHandle = Readonly<{
	engine: StrangeAttractorAudioEngine;
	events: readonly SonicEvent[];
	scoreHash: string;
	snapshot: OrchestraSnapshot;
	soundWorld: SoundWorldId;
	stop(): Promise<void>;
	dispose(): Promise<void>;
}>;

export type PortraitScoreResult = Pick<CoreGenerationResult, 'score' | 'scoreHash' | 'snapshot'>;

export type PortraitScoreClient = Pick<
	OrchestraWorkerClient,
	'generate' | 'cancel' | 'dispose' | 'subscribeProgress'
>;

export const PORTRAIT_GENERATION_OPTIONS: Readonly<WorkerGenerateOptions> = Object.freeze({
	pointCount: PORTRAIT_POINT_COUNT,
	mobile: true,
	durationSeconds: PORTRAIT_DURATION_SECONDS
});

/** Builds a validated-core-compatible snapshot for the selected portrait instrument. */
export function createPortraitSnapshot({
	snapshot,
	attractorId,
	soundWorld
}: Pick<PortraitCompositionOptions, 'snapshot' | 'attractorId' | 'soundWorld'>): OrchestraSnapshot {
	const base = snapshot
		? parseOrchestraUrlState(serializeOrchestraUrlState(snapshot)).state
		: DEFAULT_ORCHESTRA_SNAPSHOT;
	const requestedAttractor = attractorId ?? base.attractorId;
	const safeAttractor: AttractorId = isAttractorId(requestedAttractor)
		? requestedAttractor
		: DEFAULT_ORCHESTRA_SNAPSHOT.attractorId;
	const definition = getAttractorDefinition(safeAttractor);
	return {
		...base,
		attractorId: safeAttractor,
		soundWorld: safeSoundWorld(soundWorld ?? base.soundWorld),
		stableStepSize: definition.stepSize ?? 1
	};
}

/** The returned events are the core Worker's exact score objects, without portrait-side synthesis. */
export async function requestPortraitCoreScore(
	client: PortraitScoreClient,
	snapshot: OrchestraSnapshot
): Promise<PortraitScoreResult> {
	const result = await client.generate(snapshot, PORTRAIT_GENERATION_OPTIONS);
	return {
		snapshot: result.snapshot,
		score: result.score,
		scoreHash: result.scoreHash
	};
}

function asAudioScore(score: readonly CoreSonicEvent[]): readonly SonicEvent[] {
	// Core SonicEvent is structurally accepted by the audio boundary. No derived fields are added.
	return score;
}

let activePortrait: PortraitCompositionHandle | null = null;

/**
 * Explicit portrait activation boundary.
 *
 * engine.start() is invoked before this function yields or starts core generation. That preserves
 * the originating user gesture while the bounded Worker builds the real causal score.
 */
export function startPortraitComposition(
	options: PortraitCompositionOptions
): Promise<PortraitCompositionHandle> {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return Promise.reject(new Error('Portrait composition can start only in a browser.'));
	}

	// Stop the previous composition immediately, but do not await its short release ramp: awaiting
	// here would lose the browser's transient user-activation token before constructing AudioContext.
	if (activePortrait) void activePortrait.stop();

	const { onProgress } = options;
	const snapshot = createPortraitSnapshot(options);
	const world = snapshot.soundWorld;
	const engine = new StrangeAttractorAudioEngine({
		seed: snapshot.masterSeed,
		soundWorld: world,
		voiceCap: getSoundWorldPatch(world).mobile.maximumVoices
	});
	// Calling the async method executes its AudioContext construction synchronously up to its first
	// await. Keep this call before Worker creation, subscriptions, or any other asynchronous boundary.
	const audioStarted = engine.start();

	let worker: PortraitScoreClient | null = null;
	let events: readonly SonicEvent[] = [];
	let scoreHash = '';
	let stopped = false;
	let unsubscribeProgress: (() => void) | null = null;
	const stopListener = () => void handle.stop();

	const stop = async (): Promise<void> => {
		if (stopped) return;
		stopped = true;
		window.removeEventListener(PORTRAIT_STOP_EVENT, stopListener);
		document.removeEventListener(PORTRAIT_STOP_EVENT, stopListener);
		unsubscribeProgress?.();
		unsubscribeProgress = null;
		if (worker) {
			try {
				worker.cancel();
			} catch {
				// The Worker may already have completed or disposed during route teardown.
			}
			worker.dispose();
			worker = null;
		}
		engine.emergencySilence();
		await new Promise((resolve) => globalThis.setTimeout(resolve, 12));
		await engine.dispose();
		if (activePortrait === handle) activePortrait = null;
	};

	const handle: PortraitCompositionHandle = {
		engine,
		get events() {
			return events;
		},
		get scoreHash() {
			return scoreHash;
		},
		snapshot,
		soundWorld: world,
		stop,
		dispose: stop
	};
	window.addEventListener(PORTRAIT_STOP_EVENT, stopListener);
	document.addEventListener(PORTRAIT_STOP_EVENT, stopListener);
	activePortrait = handle;

	// The scientific fallback and diagnostics are intentionally fetched only after the click. The
	// AudioContext has already been constructed synchronously above, so this lazy import preserves
	// browser activation while keeping the portrait's initial payload free of desktop computation.
	const scoreRequested = import('../worker/client').then(({ createOrchestraWorkerClient }) => {
		if (stopped) throw abortError('Portrait score generation was cancelled.');
		const client = createOrchestraWorkerClient();
		worker = client;
		if (onProgress) unsubscribeProgress = client.subscribeProgress(onProgress);
		return requestPortraitCoreScore(client, snapshot);
	});
	return Promise.all([audioStarted, scoreRequested])
		.then(([, result]) => {
			if (stopped) throw abortError('Portrait score generation was cancelled.');
			events = asAudioScore(result.score);
			scoreHash = result.scoreHash;
			// Set the exact core score and restart its scheduler at score time zero. Neither the core
			// snapshot nor any SonicEvent is modified by the portrait performance layer.
			engine.setScore(events, result.snapshot.masterSeed);
			engine.seek(0);
			return handle;
		})
		.catch(async (error: unknown) => {
			const wasStopped = stopped;
			if (!stopped) await stop();
			if (wasStopped) throw abortError('Portrait score generation was cancelled.');
			throw error;
		})
		.finally(() => {
			unsubscribeProgress?.();
			unsubscribeProgress = null;
			if (worker) {
				worker.dispose();
				worker = null;
			}
		});
}
