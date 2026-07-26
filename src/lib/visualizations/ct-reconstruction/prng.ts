/** Compact deterministic 32-bit pseudo-random stream for reproducible experiments. */
export class Mulberry32 {
	private state: number;
	private spareNormal: number | null = null;

	constructor(seed: number) {
		this.state = normalizeSeed(seed);
	}

	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}

	normal(): number {
		if (this.spareNormal !== null) {
			const value = this.spareNormal;
			this.spareNormal = null;
			return value;
		}
		const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, this.next())));
		const angle = Math.PI * 2 * this.next();
		this.spareNormal = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	}
}

export function normalizeSeed(seed: number): number {
	if (!Number.isFinite(seed)) return 0;
	return Math.floor(seed) >>> 0;
}

/** Mix a root seed with stable integer coordinates without allocating strings. */
export function mixSeed(seed: number, ...coordinates: number[]): number {
	let value = normalizeSeed(seed) ^ 0x9e3779b9;
	for (const coordinate of coordinates) {
		let part = normalizeSeed(coordinate);
		part = Math.imul(part ^ (part >>> 16), 0x21f0aaad);
		part = Math.imul(part ^ (part >>> 15), 0x735a2d97);
		part ^= part >>> 15;
		value ^= part;
		value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
	}
	return (value ^ (value >>> 13)) >>> 0;
}

function logFactorial(value: number): number {
	if (value < 2) return 0;
	if (value < 32) {
		let total = 0;
		for (let factor = 2; factor <= value; factor += 1) total += Math.log(factor);
		return total;
	}
	const shifted = value + 1;
	const inverse = 1 / shifted;
	return (
		(shifted - 0.5) * Math.log(shifted) -
		shifted +
		0.5 * Math.log(2 * Math.PI) +
		inverse / 12 -
		inverse ** 3 / 360
	);
}

/**
 * Exact inversion for small means and transformed rejection for larger means.
 * The latter is Hörmann-style rejection rather than a rounded normal shortcut.
 */
export function samplePoisson(lambda: number, random: Mulberry32): number {
	if (!Number.isFinite(lambda) || lambda < 0) {
		throw new RangeError('Poisson mean must be finite and non-negative.');
	}
	if (lambda === 0) return 0;
	if (lambda < 30) {
		const limit = Math.exp(-lambda);
		let product = 1;
		let count = 0;
		do {
			count += 1;
			product *= random.next();
		} while (product > limit);
		return count - 1;
	}

	const beta = Math.PI / Math.sqrt(3 * lambda);
	const alpha = beta * lambda;
	const constant = 0.767 - 3.36 / lambda;
	const logConstant = Math.log(constant) - lambda - Math.log(beta);
	for (;;) {
		const uniform = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, random.next()));
		const logistic = (alpha - Math.log((1 - uniform) / uniform)) / beta;
		const candidate = Math.floor(logistic + 0.5);
		if (candidate < 0) continue;
		const acceptance = Math.max(Number.EPSILON, random.next());
		const exponent = alpha - beta * logistic;
		const logLogisticDensity =
			exponent - 2 * Math.log1p(Math.exp(Math.min(700, exponent))) + Math.log(acceptance);
		const logPoissonProbability =
			logConstant + candidate * Math.log(lambda) - logFactorial(candidate);
		if (logLogisticDensity <= logPoissonProbability) return candidate;
	}
}
