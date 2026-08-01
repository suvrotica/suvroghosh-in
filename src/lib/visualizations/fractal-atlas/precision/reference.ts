import Decimal from 'decimal.js';
import { splitDoubleSingle } from './double-single';
import {
	PRECISION_LIMITS,
	type PrecisionReferenceConfig,
	type PrecisionReferenceResult
} from './protocol';

type D = Decimal;
type DecimalPair = { re: D; im: D };
type DecimalOrbit = {
	point: DecimalPair;
	values: DecimalPair[];
	validLength: number;
};

export class PrecisionCalculationCancelledError extends Error {
	override readonly name = 'PrecisionCalculationCancelledError';
}

export interface PrecisionCalculationHooks {
	shouldCancel?: () => boolean;
	yieldControl?: () => Promise<void>;
	onProgress?: (phase: 'calculating' | 'diagnosing' | 'rebasing', progress: number) => void;
}

const DIAGNOSTIC_COORDINATES = [
	[0.08, 0.08],
	[0.5, 0.08],
	[0.92, 0.08],
	[0.08, 0.5],
	[0.5, 0.5],
	[0.92, 0.5],
	[0.08, 0.92],
	[0.5, 0.92],
	[0.92, 0.92]
] as const;

function now() {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function assertActive(hooks: PrecisionCalculationHooks) {
	if (hooks.shouldCancel?.()) throw new PrecisionCalculationCancelledError();
}

async function cooperativeYield(hooks: PrecisionCalculationHooks) {
	assertActive(hooks);
	await hooks.yieldControl?.();
	assertActive(hooks);
}

function splitInto(target: Float32Array, offset: number, re: number, im: number) {
	const real = splitDoubleSingle(re);
	const imaginary = splitDoubleSingle(im);
	target[offset] = real.hi;
	target[offset + 1] = imaginary.hi;
	target[offset + 2] = real.lo;
	target[offset + 3] = imaginary.lo;
}

function complexSquareAdd(value: DecimalPair, c: DecimalPair): DecimalPair {
	const reSquared = value.re.times(value.re);
	const imSquared = value.im.times(value.im);
	return {
		re: reSquared.minus(imSquared).plus(c.re),
		im: value.re.times(value.im).times(2).plus(c.im)
	};
}

function viewportPoint(
	config: PrecisionReferenceConfig,
	DecimalType: typeof Decimal,
	normalizedX: number,
	normalizedY: number
): DecimalPair {
	const span = new DecimalType(config.spanY);
	const aspect = new DecimalType(config.width).div(config.height);
	const localX = new DecimalType(normalizedX).minus(0.5).times(span).times(aspect);
	let localY = new DecimalType(normalizedY).minus(0.5).times(span);
	if (config.flipY) localY = localY.negated();
	const angle = new DecimalType(config.rotation);
	const cosine = angle.cos();
	const sine = angle.sin();
	return {
		re: new DecimalType(config.centerRe).plus(localX.times(cosine)).minus(localY.times(sine)),
		im: new DecimalType(config.centerIm).plus(localX.times(sine)).plus(localY.times(cosine))
	};
}

async function calculateGrid(
	config: PrecisionReferenceConfig,
	gridSize: number,
	hooks: PrecisionCalculationHooks,
	phase: 'calculating' | 'rebasing'
) {
	const DecimalType = Decimal.clone({
		precision: config.precisionDigits,
		rounding: Decimal.ROUND_HALF_EVEN,
		toExpNeg: -1_000_000,
		toExpPos: 1_000_000
	});
	const orbits: DecimalOrbit[] = [];
	const bailoutSquared = new DecimalType(config.bailout).times(config.bailout);
	const juliaC = {
		re: new DecimalType(config.juliaRe),
		im: new DecimalType(config.juliaIm)
	};
	const tileCount = gridSize * gridSize;

	for (let tileY = 0; tileY < gridSize; tileY += 1) {
		for (let tileX = 0; tileX < gridSize; tileX += 1) {
			assertActive(hooks);
			const point = viewportPoint(
				config,
				DecimalType,
				(tileX + 0.5) / gridSize,
				(tileY + 0.5) / gridSize
			);
			const c = config.family === 'mandelbrot' ? point : juliaC;
			let z =
				config.family === 'mandelbrot'
					? { re: new DecimalType(0), im: new DecimalType(0) }
					: { re: point.re, im: point.im };
			const values: DecimalPair[] = [{ re: z.re, im: z.im }];
			let validLength = 1;
			for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
				z = complexSquareAdd(z, c);
				values.push(z);
				validLength = values.length;
				const magnitudeSquared = z.re.times(z.re).plus(z.im.times(z.im));
				if (magnitudeSquared.greaterThan(bailoutSquared)) break;
				if ((iteration & 31) === 31) {
					hooks.onProgress?.(phase, (orbits.length + iteration / config.maxIterations) / tileCount);
					await cooperativeYield(hooks);
				}
			}
			orbits.push({ point, values, validLength });
			hooks.onProgress?.(phase, orbits.length / tileCount);
			await cooperativeYield(hooks);
		}
	}
	return { DecimalType, orbits };
}

function tileIndexForSample(x: number, y: number, gridSize: number) {
	const tileX = Math.min(gridSize - 1, Math.max(0, Math.floor(x * gridSize)));
	const tileY = Math.min(gridSize - 1, Math.max(0, Math.floor(y * gridSize)));
	return tileY * gridSize + tileX;
}

async function diagnoseGrid(
	config: PrecisionReferenceConfig,
	gridSize: number,
	DecimalType: typeof Decimal,
	orbits: readonly DecimalOrbit[],
	hooks: PrecisionCalculationHooks
) {
	const bailoutSquared = config.bailout * config.bailout;
	const juliaC = {
		re: new DecimalType(config.juliaRe),
		im: new DecimalType(config.juliaIm)
	};
	let glitches = 0;

	for (let sampleIndex = 0; sampleIndex < DIAGNOSTIC_COORDINATES.length; sampleIndex += 1) {
		assertActive(hooks);
		const [normalizedX, normalizedY] = DIAGNOSTIC_COORDINATES[sampleIndex];
		const tileIndex = tileIndexForSample(normalizedX, normalizedY, gridSize);
		const reference = orbits[tileIndex];
		const point = viewportPoint(config, DecimalType, normalizedX, normalizedY);
		const c = config.family === 'mandelbrot' ? point : juliaC;
		let direct =
			config.family === 'mandelbrot'
				? { re: new DecimalType(0), im: new DecimalType(0) }
				: { re: point.re, im: point.im };
		let deltaRe =
			config.family === 'mandelbrot' ? 0 : point.re.minus(reference.point.re).toNumber();
		let deltaIm =
			config.family === 'mandelbrot' ? 0 : point.im.minus(reference.point.im).toNumber();
		const deltaCRe =
			config.family === 'mandelbrot' ? point.re.minus(reference.point.re).toNumber() : 0;
		const deltaCIm =
			config.family === 'mandelbrot' ? point.im.minus(reference.point.im).toNumber() : 0;
		let sampleGlitched = false;
		let directEscape = -1;
		let perturbEscape = -1;

		for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
			direct = complexSquareAdd(direct, c);
			const directRe = direct.re.toNumber();
			const directIm = direct.im.toNumber();
			const directMagnitudeSquared = directRe * directRe + directIm * directIm;
			if (directMagnitudeSquared > bailoutSquared && directEscape < 0) {
				directEscape = iteration + 1;
			}

			if (iteration + 1 >= reference.validLength) {
				if (directEscape < 0) sampleGlitched = true;
				break;
			}
			const referenceBefore = reference.values[iteration];
			const referenceAfter = reference.values[iteration + 1];
			const refRe = referenceBefore.re.toNumber();
			const refIm = referenceBefore.im.toNumber();
			const twiceProductRe = 2 * (refRe * deltaRe - refIm * deltaIm);
			const twiceProductIm = 2 * (refRe * deltaIm + refIm * deltaRe);
			const deltaSquaredRe = deltaRe * deltaRe - deltaIm * deltaIm;
			const deltaSquaredIm = 2 * deltaRe * deltaIm;
			deltaRe = twiceProductRe + deltaSquaredRe + deltaCRe;
			deltaIm = twiceProductIm + deltaSquaredIm + deltaCIm;
			const perturbRe = referenceAfter.re.toNumber() + deltaRe;
			const perturbIm = referenceAfter.im.toNumber() + deltaIm;
			const perturbMagnitudeSquared = perturbRe * perturbRe + perturbIm * perturbIm;
			if (perturbMagnitudeSquared > bailoutSquared && perturbEscape < 0) {
				perturbEscape = iteration + 1;
			}

			const scale = Math.max(1, Math.hypot(directRe, directIm));
			const discrepancy = Math.hypot(perturbRe - directRe, perturbIm - directIm);
			const deltaMagnitude = Math.hypot(deltaRe, deltaIm);
			const referenceMagnitude = Math.hypot(
				referenceAfter.re.toNumber(),
				referenceAfter.im.toNumber()
			);
			const cancellationGlitch =
				Math.hypot(perturbRe, perturbIm) < referenceMagnitude * 1e-6 &&
				deltaMagnitude > referenceMagnitude * 0.5;
			if (!Number.isFinite(discrepancy) || discrepancy > scale * 2e-8 || cancellationGlitch) {
				sampleGlitched = true;
				break;
			}
			if (directEscape >= 0 || perturbEscape >= 0) {
				if (directEscape !== perturbEscape) sampleGlitched = true;
				break;
			}
			if ((iteration & 63) === 63) await cooperativeYield(hooks);
		}
		if (sampleGlitched) glitches += 1;
		hooks.onProgress?.('diagnosing', (sampleIndex + 1) / DIAGNOSTIC_COORDINATES.length);
		await cooperativeYield(hooks);
	}
	return glitches;
}

function packResult(
	config: PrecisionReferenceConfig,
	gridSize: number,
	orbits: readonly DecimalOrbit[],
	glitchesBeforeRebase: number,
	glitchesAfterRebase: number,
	rebased: boolean,
	startedAt: number
): PrecisionReferenceResult {
	const orbitLength = config.maxIterations + 1;
	const tileCount = gridSize * gridSize;
	const orbit = new Float32Array(tileCount * orbitLength * 4);
	const referencePoints = new Float32Array(tileCount * 4);
	const referenceLengths = new Uint16Array(tileCount);

	for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
		const reference = orbits[tileIndex];
		splitInto(
			referencePoints,
			tileIndex * 4,
			reference.point.re.toNumber(),
			reference.point.im.toNumber()
		);
		referenceLengths[tileIndex] = Math.min(orbitLength, reference.validLength);
		for (let iteration = 0; iteration < reference.values.length; iteration += 1) {
			const value = reference.values[iteration];
			splitInto(
				orbit,
				(tileIndex * orbitLength + iteration) * 4,
				value.re.toNumber(),
				value.im.toNumber()
			);
		}
	}

	return {
		family: config.family,
		precisionDigits: config.precisionDigits,
		maxIterations: config.maxIterations,
		orbitLength,
		gridSize,
		orbit,
		referencePoints,
		referenceLengths,
		diagnosticSamples: DIAGNOSTIC_COORDINATES.length,
		glitchesBeforeRebase,
		glitchesAfterRebase,
		rebased,
		calculationMilliseconds: Math.max(0, now() - startedAt)
	};
}

/**
 * Builds the arbitrary-precision reference orbit and validates perturbation on
 * a bounded diagnostic sample. A failed single-reference diagnostic triggers a
 * 4×4 tile rebase; remaining bad samples are reported and the shader marks
 * invalidity caught by its bounded checks instead of substituting a collapsed
 * direct orbit.
 */
export async function calculatePrecisionReference(
	config: PrecisionReferenceConfig,
	hooks: PrecisionCalculationHooks = {}
): Promise<PrecisionReferenceResult> {
	if (
		config.precisionDigits < PRECISION_LIMITS.minDecimalDigits ||
		config.precisionDigits > PRECISION_LIMITS.maxDecimalDigits
	) {
		throw new Error('Reference-orbit precision is outside the bounded decimal range.');
	}
	const startedAt = now();
	const initial = await calculateGrid(config, 1, hooks, 'calculating');
	const glitchesBeforeRebase = await diagnoseGrid(
		config,
		1,
		initial.DecimalType,
		initial.orbits,
		hooks
	);
	if (glitchesBeforeRebase === 0) {
		return packResult(config, 1, initial.orbits, 0, 0, false, startedAt);
	}

	hooks.onProgress?.('rebasing', 0);
	const rebased = await calculateGrid(config, PRECISION_LIMITS.maxReferenceGrid, hooks, 'rebasing');
	const glitchesAfterRebase = await diagnoseGrid(
		config,
		PRECISION_LIMITS.maxReferenceGrid,
		rebased.DecimalType,
		rebased.orbits,
		hooks
	);
	return packResult(
		config,
		PRECISION_LIMITS.maxReferenceGrid,
		rebased.orbits,
		glitchesBeforeRebase,
		glitchesAfterRebase,
		true,
		startedAt
	);
}
