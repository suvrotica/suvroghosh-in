type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export type ReadingProgressScheduler = {
	schedule: () => void;
	stop: () => void;
};

export function createReadingProgressScheduler(
	measure: () => void,
	requestFrame: RequestFrame = requestAnimationFrame,
	cancelFrame: CancelFrame = cancelAnimationFrame
): ReadingProgressScheduler {
	let updateFrameId: number | null = null;
	let stopped = false;

	const runScheduledUpdate = () => {
		updateFrameId = null;
		if (!stopped) measure();
	};

	const schedule = () => {
		if (stopped || updateFrameId !== null) return;
		updateFrameId = requestFrame(runScheduledUpdate);
	};

	const stop = () => {
		stopped = true;
		if (updateFrameId !== null) cancelFrame(updateFrameId);
		updateFrameId = null;
	};

	return { schedule, stop };
}
