export interface DecimatedTrace {
	timeMs: Float64Array;
	values: Float64Array;
	sourceIndices: Uint32Array;
}

function validateTrace(
	timeMs: ArrayLike<number>,
	values: ArrayLike<number>,
	pixelWidth: number
): number {
	if (timeMs.length !== values.length) throw new RangeError('Trace time and value lengths differ.');
	if (!Number.isFinite(pixelWidth) || pixelWidth < 1) {
		throw new RangeError('Trace pixel width must be at least one.');
	}
	let previous = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < timeMs.length; index += 1) {
		const time = timeMs[index];
		const value = values[index];
		if (!Number.isFinite(time) || !Number.isFinite(value)) {
			throw new RangeError('Trace samples must be finite.');
		}
		if (time < previous) throw new RangeError('Trace times must be nondecreasing.');
		previous = time;
	}
	return Math.max(1, Math.floor(pixelWidth));
}

export function minMaxEnvelopeIndices(
	timeMs: ArrayLike<number>,
	values: ArrayLike<number>,
	pixelWidth: number
): Uint32Array {
	const width = validateTrace(timeMs, values, pixelWidth);
	const count = values.length;
	if (count === 0) return new Uint32Array();
	if (count <= width * 2) return Uint32Array.from({ length: count }, (_, index) => index);

	const firstTime = timeMs[0];
	const lastTime = timeMs[count - 1];
	const span = lastTime - firstTime;
	const selected = new Set<number>([0, count - 1]);
	const minima = new Int32Array(width);
	const maxima = new Int32Array(width);
	minima.fill(-1);
	maxima.fill(-1);

	for (let index = 0; index < count; index += 1) {
		const bucket =
			span === 0
				? Math.min(width - 1, Math.floor((index * width) / count))
				: Math.min(width - 1, Math.floor(((timeMs[index] - firstTime) / span) * width));
		const minIndex = minima[bucket];
		const maxIndex = maxima[bucket];
		if (minIndex < 0 || values[index] < values[minIndex]) minima[bucket] = index;
		if (maxIndex < 0 || values[index] > values[maxIndex]) maxima[bucket] = index;
	}

	for (let bucket = 0; bucket < width; bucket += 1) {
		if (minima[bucket] >= 0) selected.add(minima[bucket]);
		if (maxima[bucket] >= 0) selected.add(maxima[bucket]);
	}
	return Uint32Array.from([...selected].sort((left, right) => left - right));
}

export function minMaxEnvelope(
	timeMs: ArrayLike<number>,
	values: ArrayLike<number>,
	pixelWidth: number
): DecimatedTrace {
	const sourceIndices = minMaxEnvelopeIndices(timeMs, values, pixelWidth);
	const times = new Float64Array(sourceIndices.length);
	const resultValues = new Float64Array(sourceIndices.length);
	for (let outputIndex = 0; outputIndex < sourceIndices.length; outputIndex += 1) {
		const sourceIndex = sourceIndices[outputIndex];
		times[outputIndex] = timeMs[sourceIndex];
		resultValues[outputIndex] = values[sourceIndex];
	}
	return { timeMs: times, values: resultValues, sourceIndices };
}

export interface DecimatedTraceFamily {
	timeMs: Float64Array;
	channels: Record<string, Float64Array>;
	sourceIndices: Uint32Array;
}

/**
 * Union the envelope indices from every channel so synchronized multi-trace
 * plots retain each channel's narrow extrema on one shared time axis.
 */
export function minMaxEnvelopeFamily(
	timeMs: ArrayLike<number>,
	channels: Readonly<Record<string, ArrayLike<number>>>,
	pixelWidth: number
): DecimatedTraceFamily {
	const selected = new Set<number>();
	const names = Object.keys(channels).sort();
	if (names.length === 0) {
		return { timeMs: new Float64Array(), channels: {}, sourceIndices: new Uint32Array() };
	}
	for (const name of names) {
		for (const index of minMaxEnvelopeIndices(timeMs, channels[name], pixelWidth))
			selected.add(index);
	}
	const sourceIndices = Uint32Array.from([...selected].sort((left, right) => left - right));
	const times = new Float64Array(sourceIndices.length);
	const output: Record<string, Float64Array> = {};
	for (const name of names) output[name] = new Float64Array(sourceIndices.length);
	for (let outputIndex = 0; outputIndex < sourceIndices.length; outputIndex += 1) {
		const sourceIndex = sourceIndices[outputIndex];
		times[outputIndex] = timeMs[sourceIndex];
		for (const name of names) output[name][outputIndex] = channels[name][sourceIndex];
	}
	return { timeMs: times, channels: output, sourceIndices };
}
