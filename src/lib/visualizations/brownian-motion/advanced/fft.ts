/**
 * In-place radix-2 Cooley–Tukey FFT.
 *
 * The forward transform uses exp(-2πik/n). The inverse uses exp(+2πik/n)
 * and divides every output by n. Keeping the convention here explicit matters:
 * the Davies–Harte generator relies on these exact normalisation factors.
 */
export function fftInPlace(real: Float64Array, imaginary: Float64Array, inverse = false): void {
	const length = real.length;
	if (imaginary.length !== length) {
		throw new RangeError('FFT real and imaginary arrays must have the same length.');
	}
	if (!isPowerOfTwo(length)) {
		throw new RangeError('The radix-2 FFT length must be a positive power of two.');
	}

	bitReversePermutation(real, imaginary);

	for (let blockLength = 2; blockLength <= length; blockLength *= 2) {
		const angle = ((inverse ? 2 : -2) * Math.PI) / blockLength;
		const rootReal = Math.cos(angle);
		const rootImaginary = Math.sin(angle);
		const halfLength = blockLength / 2;

		for (let blockStart = 0; blockStart < length; blockStart += blockLength) {
			let twiddleReal = 1;
			let twiddleImaginary = 0;
			for (let offset = 0; offset < halfLength; offset += 1) {
				const evenIndex = blockStart + offset;
				const oddIndex = evenIndex + halfLength;
				const oddReal = twiddleReal * real[oddIndex] - twiddleImaginary * imaginary[oddIndex];
				const oddImaginary = twiddleReal * imaginary[oddIndex] + twiddleImaginary * real[oddIndex];
				const evenReal = real[evenIndex];
				const evenImaginary = imaginary[evenIndex];

				real[evenIndex] = evenReal + oddReal;
				imaginary[evenIndex] = evenImaginary + oddImaginary;
				real[oddIndex] = evenReal - oddReal;
				imaginary[oddIndex] = evenImaginary - oddImaginary;

				const nextTwiddleReal = twiddleReal * rootReal - twiddleImaginary * rootImaginary;
				twiddleImaginary = twiddleReal * rootImaginary + twiddleImaginary * rootReal;
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

export function isPowerOfTwo(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0 && Math.log2(value) % 1 === 0;
}

export function nextPowerOfTwo(value: number): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError('A next-power-of-two input must be a positive safe integer.');
	}
	const exponent = Math.ceil(Math.log2(value));
	if (exponent > 30) {
		throw new RangeError('The requested FFT length exceeds the supported typed-array range.');
	}
	return 2 ** exponent;
}

function bitReversePermutation(real: Float64Array, imaginary: Float64Array): void {
	let reversed = 0;
	for (let index = 1; index < real.length; index += 1) {
		let bit = real.length / 2;
		while (reversed >= bit) {
			reversed -= bit;
			bit /= 2;
		}
		reversed += bit;
		if (index >= reversed) continue;
		[real[index], real[reversed]] = [real[reversed], real[index]];
		[imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
	}
}
