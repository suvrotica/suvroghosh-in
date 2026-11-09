import {
	createReferenceConfig,
	createSkinConfig,
	fitReference,
	referenceKey,
	SkinSolver,
	type SkinSettings,
	type SkinSnapshot
} from './model.ts';
import type { SkinReplayFrame, SkinRequest, SkinResponse, SkinResult } from './protocol.ts';

interface Job {
	generation: number;
	settings: SkinSettings;
	referenceId: string;
	referenceSolver: SkinSolver | null;
	target: SkinSolver;
	frames: SkinReplayFrame[];
	frameStep: number;
	nextFrame: number;
}

// One immutable, worker-owned reference. Never send or transfer its buffers to the UI.
let reference: { id: string; snapshot: SkinSnapshot } | null = null;
let current: Job | null = null;
let generation = 0;
let active = false;
let pendingTick = false;

function send(message: SkinResponse, transfer: Transferable[] = []): void {
	self.postMessage(message, { transfer });
}

function replayFrame(solver: SkinSolver): SkinReplayFrame {
	const { u, v, modelTime } = solver.snapshot();
	return { u, v, modelTime };
}

function queueTick(): void {
	if (!current || !active || pendingTick) return;
	pendingTick = true;
	setTimeout(tick, 0);
}

function tick(): void {
	pendingTick = false;
	const job = current;
	if (!job || !active) return;
	try {
		// Yield to pause, cancel and replacement messages between short batches.
		const deadline = performance.now() + 12;
		do {
			if (job.referenceSolver) {
				const solver = job.referenceSolver;
				solver.step(Math.min(24, solver.totalSteps - solver.stepIndex));
				if (solver.stepIndex === solver.totalSteps) {
					reference = { id: job.referenceId, snapshot: solver.snapshot() };
					job.referenceSolver = null;
				}
			} else {
				const stop = Math.min(job.nextFrame, job.target.totalSteps);
				job.target.step(Math.min(24, stop - job.target.stepIndex));
				if (job.target.stepIndex === job.target.totalSteps) {
					const { domain, u, v, modelTime } = job.target.snapshot();
					if (!reference || reference.id !== job.referenceId) throw new Error('Missing reference');
					const result: SkinResult = {
						settings: job.settings,
						domain,
						formed: { u, v },
						fitted: fitReference(reference.snapshot, domain),
						frames: job.frames,
						observationTime: modelTime
					};
					const buffers = [result.formed, result.fitted, ...result.frames].flatMap(({ u, v }) => [
						u.buffer as ArrayBuffer,
						v.buffer as ArrayBuffer
					]);
					current = null;
					send({ type: 'result', generation: job.generation, result }, buffers);
					return;
				}
				if (job.target.stepIndex === job.nextFrame) {
					job.frames.push(replayFrame(job.target));
					job.nextFrame += job.frameStep;
				}
			}
		} while (performance.now() < deadline);
		queueTick();
	} catch {
		current = null;
		send({ type: 'error', generation: job.generation });
	}
}

self.addEventListener('message', ({ data }: MessageEvent<SkinRequest>) => {
	if (data.type === 'active') {
		active = data.active;
		queueTick();
		return;
	}
	if (data.generation <= generation) return;
	generation = data.generation;
	current = null;
	if (data.type === 'cancel') return;
	try {
		const config = createSkinConfig(data.settings);
		const referenceId = referenceKey(config);
		const target = new SkinSolver(config);
		const frameStep = Math.max(1, Math.round(target.totalSteps / 30));
		current = {
			generation,
			settings: data.settings,
			referenceId,
			referenceSolver:
				reference?.id === referenceId ? null : new SkinSolver(createReferenceConfig(config)),
			target,
			frames: [replayFrame(target)],
			frameStep,
			nextFrame: frameStep
		};
		queueTick();
	} catch {
		send({ type: 'error', generation });
	}
});
