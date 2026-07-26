function isPowerOfTwo(value: number): boolean {
	return value > 0 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
	if (!Number.isFinite(value) || value < 1) {
		throw new RangeError('FFT length request must be finite and positive.');
	}
	let result = 1;
	while (result < Math.ceil(value)) {
		result *= 2;
		if (result > 2 ** 30) throw new RangeError('Requested FFT is too large.');
	}
	return result;
}

/**
 * In-place radix-2 Cooley–Tukey complex FFT.
 *
 * Forward transforms use exp(-i 2πkn/N). Inverse transforms use the opposite
 * sign and divide both arrays by N.
 */
export function fft(real: Float64Array, imaginary: Float64Array, inverse = false): void {
	const length = real.length;
	if (imaginary.length !== length) {
		throw new RangeError('FFT real and imaginary arrays must have equal lengths.');
	}
	if (!isPowerOfTwo(length)) {
		throw new RangeError('FFT array length must be a non-zero power of two.');
	}

	for (let source = 1, target = 0; source < length; source += 1) {
		let bit = length >> 1;
		for (; target & bit; bit >>= 1) target ^= bit;
		target ^= bit;
		if (source >= target) continue;
		[real[source], real[target]] = [real[target], real[source]];
		[imaginary[source], imaginary[target]] = [imaginary[target], imaginary[source]];
	}

	for (let blockSize = 2; blockSize <= length; blockSize *= 2) {
		const angle = ((inverse ? 2 : -2) * Math.PI) / blockSize;
		const blockCosine = Math.cos(angle);
		const blockSine = Math.sin(angle);
		for (let blockStart = 0; blockStart < length; blockStart += blockSize) {
			let twiddleReal = 1;
			let twiddleImaginary = 0;
			const half = blockSize >> 1;
			for (let offset = 0; offset < half; offset += 1) {
				const evenIndex = blockStart + offset;
				const oddIndex = evenIndex + half;
				const oddReal = real[oddIndex] * twiddleReal - imaginary[oddIndex] * twiddleImaginary;
				const oddImaginary = real[oddIndex] * twiddleImaginary + imaginary[oddIndex] * twiddleReal;
				const evenReal = real[evenIndex];
				const evenImaginary = imaginary[evenIndex];
				real[evenIndex] = evenReal + oddReal;
				imaginary[evenIndex] = evenImaginary + oddImaginary;
				real[oddIndex] = evenReal - oddReal;
				imaginary[oddIndex] = evenImaginary - oddImaginary;

				const nextTwiddleReal = twiddleReal * blockCosine - twiddleImaginary * blockSine;
				twiddleImaginary = twiddleReal * blockSine + twiddleImaginary * blockCosine;
				twiddleReal = nextTwiddleReal;
			}
		}
	}

	if (inverse) {
		for (let index = 0; index < length; index += 1) {
			real[index] /= length;
			imaginary[index] /= length;
		}
	}
}
