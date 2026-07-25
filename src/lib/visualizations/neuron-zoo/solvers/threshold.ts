/**
 * Returns the fraction of a fixed step at which an upward linear crossing occurs.
 * Null means there is no upward crossing under the strict previous < threshold,
 * next >= threshold convention.
 */
export function upwardCrossingFraction(
	previous: number,
	next: number,
	threshold: number
): number | null {
	if (
		!Number.isFinite(previous) ||
		!Number.isFinite(next) ||
		!Number.isFinite(threshold) ||
		previous >= threshold ||
		next < threshold ||
		next <= previous
	) {
		return null;
	}
	return Math.min(1, Math.max(0, (threshold - previous) / (next - previous)));
}

export function upwardCrossingTime(
	previous: number,
	next: number,
	threshold: number,
	stepStartMs: number,
	dtMs: number
): number | null {
	const fraction = upwardCrossingFraction(previous, next, threshold);
	return fraction === null ? null : stepStartMs + fraction * dtMs;
}

/**
 * Exact crossing time for x(t)=asymptote+(initial-asymptote)exp(-t/tau).
 */
export function exponentialThresholdCrossingTime(
	initial: number,
	asymptote: number,
	threshold: number,
	tau: number,
	maximumTime: number
): number | null {
	if (
		!Number.isFinite(initial) ||
		!Number.isFinite(asymptote) ||
		!Number.isFinite(threshold) ||
		!Number.isFinite(tau) ||
		!Number.isFinite(maximumTime) ||
		tau <= 0 ||
		maximumTime < 0 ||
		initial >= threshold ||
		asymptote <= threshold
	) {
		return null;
	}
	const ratio = (threshold - asymptote) / (initial - asymptote);
	if (!(ratio > 0 && ratio <= 1)) return null;
	const time = -tau * Math.log(ratio);
	return time <= maximumTime + Number.EPSILON ? Math.max(0, time) : null;
}
