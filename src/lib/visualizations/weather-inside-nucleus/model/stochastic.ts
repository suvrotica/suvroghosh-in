import { SeededRandom, type RandomSource } from '$lib/utils/seeded-random';

export const UINT32_MAX = 0xffff_ffff;

export interface ModelRandomStreams {
	contact: SeededRandom;
	promoter: SeededRandom;
	initiation: SeededRandom;
	degradation: SeededRandom;
}

export function validateUint32Seed(seed: number): number {
	if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
		throw new RangeError('A model seed must be an unsigned 32-bit integer.');
	}
	return seed >>> 0;
}

export function createModelRandomStreams(seed: number): ModelRandomStreams {
	const normalized = validateUint32Seed(seed);
	const root = new SeededRandom(normalized);
	return {
		contact: root.fork('weather-inside-nucleus:contact'),
		promoter: root.fork('weather-inside-nucleus:promoter'),
		initiation: root.fork('weather-inside-nucleus:initiation'),
		degradation: root.fork('weather-inside-nucleus:degradation')
	};
}

export function samplePoisson(mean: number, random: RandomSource): number {
	if (!Number.isFinite(mean) || mean < 0) {
		throw new RangeError('A Poisson mean must be finite and non-negative.');
	}
	if (mean === 0) return 0;
	if (mean < 30) {
		const limit = Math.exp(-mean);
		let product = 1;
		let count = 0;
		do {
			count += 1;
			product *= checkedUniform(random);
		} while (product > limit);
		return count - 1;
	}

	// Hörmann-style transformed rejection avoids the inaccurate rounded-normal
	// shortcut at larger means.
	const beta = Math.PI / Math.sqrt(3 * mean);
	const alpha = beta * mean;
	const constant = 0.767 - 3.36 / mean;
	const logConstant = Math.log(constant) - mean - Math.log(beta);
	for (;;) {
		const uniform = openUniform(random);
		const logistic = (alpha - Math.log((1 - uniform) / uniform)) / beta;
		const candidate = Math.floor(logistic + 0.5);
		if (candidate < 0) continue;
		const acceptance = openUniform(random);
		const exponent = alpha - beta * logistic;
		const logLogisticDensity =
			exponent - 2 * Math.log1p(Math.exp(Math.min(700, exponent))) + Math.log(acceptance);
		const logPoissonProbability =
			logConstant + candidate * Math.log(mean) - logFactorial(candidate);
		if (logLogisticDensity <= logPoissonProbability) return candidate;
	}
}

export function sampleBinomial(trials: number, probability: number, random: RandomSource): number {
	if (!Number.isSafeInteger(trials) || trials < 0) {
		throw new RangeError('Binomial trials must be a non-negative safe integer.');
	}
	if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
		throw new RangeError('A binomial probability must be finite and within [0, 1].');
	}
	if (trials === 0 || probability === 0) return 0;
	if (probability === 1) return trials;

	// Counts in this reduced model are deliberately small. Direct Bernoulli
	// sampling is exact, deterministic, and cheaper than a complicated
	// approximation in the supported parameter range.
	let successes = 0;
	for (let trial = 0; trial < trials; trial += 1) {
		if (checkedUniform(random) < probability) successes += 1;
	}
	return successes;
}

export function openUniform(random: RandomSource): number {
	const value = checkedUniform(random);
	return Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, value));
}

export function checkedUniform(random: RandomSource): number {
	const value = random.next();
	if (!Number.isFinite(value) || value < 0 || value >= 1) {
		throw new RangeError('A random source must return finite values in [0, 1).');
	}
	return value;
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
