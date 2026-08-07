export type FixedWorkSlice = {
	carry: number;
	work: number;
};

/**
 * Convert elapsed wall time into an integer number of fixed model steps.
 *
 * The returned work count is independent of display refresh rate. Catch-up is
 * deliberately bounded so a suspended or badly delayed frame cannot create a
 * long main-thread/GPU burst when rendering resumes.
 */
export function scheduleFixedWork(
	carry: number,
	elapsedSeconds: number,
	workPerSecond: number,
	maximumWorkPerSlice = 16,
	maximumCarry = maximumWorkPerSlice * 2
): FixedWorkSlice {
	if (
		!Number.isFinite(carry) ||
		!Number.isFinite(elapsedSeconds) ||
		!Number.isFinite(workPerSecond) ||
		!Number.isInteger(maximumWorkPerSlice) ||
		maximumWorkPerSlice < 1 ||
		!Number.isFinite(maximumCarry) ||
		maximumCarry < maximumWorkPerSlice
	) {
		throw new Error('Fixed-work scheduling requires finite, positive bounds.');
	}

	const elapsed = Math.min(0.1, Math.max(0, elapsedSeconds));
	const pending = Math.min(maximumCarry, Math.max(0, carry) + elapsed * Math.max(0, workPerSecond));
	const work = Math.min(maximumWorkPerSlice, Math.floor(pending + 1e-9));
	return { carry: pending - work, work };
}
