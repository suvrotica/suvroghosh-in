/** A probability-density histogram: bin areas sum to one, independent of sample count. */
export function spectralDensityHistogram(
	values: readonly number[],
	domain: readonly [number, number],
	binCount: number
): readonly number[] {
	if (!Number.isSafeInteger(binCount) || binCount < 1 || !(domain[1] > domain[0])) {
		throw new RangeError('A density histogram needs a positive bin count and increasing domain.');
	}
	const finite = values.filter(Number.isFinite);
	const density = Array.from({ length: binCount }, () => 0);
	if (finite.length === 0) return density;
	const binWidth = (domain[1] - domain[0]) / binCount;
	for (const value of finite) {
		if (value < domain[0] || value > domain[1]) continue;
		const index = Math.min(binCount - 1, Math.floor((value - domain[0]) / binWidth));
		density[index] += 1;
	}
	return density.map((count) => count / (finite.length * binWidth));
}
