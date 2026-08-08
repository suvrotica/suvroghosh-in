/** Returns the last discrete sample at or before time, clamped to the available trace. */
export function sampleIndexAtOrBefore(
	times: ArrayLike<number> | null | undefined,
	time: number
): number {
	if (!times || times.length === 0 || Number.isNaN(time)) return 0;
	if (time < times[0]) return 0;

	let low = 0;
	let high = times.length;
	while (low < high) {
		const middle = low + Math.floor((high - low) / 2);
		if (times[middle] <= time) low = middle + 1;
		else high = middle;
	}

	return Math.max(0, Math.min(times.length - 1, low - 1));
}
