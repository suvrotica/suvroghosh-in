/// <reference lib="webworker" />
import { END_TIME } from './config.ts';
import type { FingerprintFrame, WorkerReply, WorkerRequest } from './protocol.ts';
import { FingerprintSolver } from './solver.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let job: { id: number; solver: FingerprintSolver; active: boolean; lastFrame: number } | undefined;
let queued: ReturnType<typeof setTimeout> | undefined;

function reply(message: WorkerReply, transfer: Transferable[] = []) {
	scope.postMessage(message, transfer);
}

function stopQueued() {
	if (queued !== undefined) clearTimeout(queued);
	queued = undefined;
}

function sendFrame(current: NonNullable<typeof job>, complete: boolean) {
	const field = current.solver.frame();
	const { columns, rows, capRows, radius, length } = current.solver.mesh;
	const frame: FingerprintFrame = {
		columns,
		rows,
		capRows,
		radius,
		length,
		time: current.solver.time,
		field
	};
	if (field.some((value) => !Number.isFinite(value) || value < 0)) {
		throw new Error('Invalid activator field');
	}
	current.lastFrame = performance.now();
	reply({ type: 'frame', id: current.id, frame, complete }, [field.buffer]);
}

function fail(id: number) {
	job = undefined;
	reply({
		type: 'error',
		id,
		message: 'This experiment could not finish. Try replaying or resetting.'
	});
}

function schedule() {
	if (job?.active && queued === undefined) queued = setTimeout(run, 0);
}

function run() {
	queued = undefined;
	const current = job;
	if (!current?.active) return;
	try {
		const deadline = performance.now() + 14;
		do {
			current.solver.advance(1);
		} while (current.solver.time < END_TIME - 1e-8 && performance.now() < deadline);
		const complete = current.solver.time >= END_TIME - 1e-8;
		if (complete || performance.now() - current.lastFrame >= 83) sendFrame(current, complete);
		if (complete) job = undefined;
		else schedule();
	} catch {
		fail(current.id);
	}
}

scope.addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
	if (data.type === 'start') {
		stopQueued();
		try {
			job = {
				id: data.id,
				solver: new FingerprintSolver(data.settings),
				active: data.active,
				lastFrame: 0
			};
			sendFrame(job, false);
			schedule();
		} catch {
			fail(data.id);
		}
	} else if (job?.id === data.id) {
		job.active = data.active;
		if (job.active) schedule();
		else stopQueued();
	}
});
