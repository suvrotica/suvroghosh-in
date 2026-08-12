import { clamp } from './vector';

export interface BucklingModeParameters {
	mode: number;
	initialAmplitude: number;
	phase: number;
	mismatch: number;
	stiffness: number;
	saturation: number;
}

export interface BucklingModeState extends BucklingModeParameters {
	amplitude: number;
}

export interface DominantBucklingMode {
	mode: number;
	waveNumber: number;
	growthRate: number;
}

export function bucklingWaveNumber(mode: number, domainLength: number): number {
	const safeMode = Math.max(0, Math.min(4096, Math.round(Number.isFinite(mode) ? mode : 0)));
	if (safeMode === 0) return 0;
	const safeLength = Math.max(
		1e-6,
		Math.min(1e6, Math.abs(Number.isFinite(domainLength) ? domainLength : 1))
	);
	return (Math.PI * 2 * safeMode) / safeLength;
}

/**
 * Dimensionless periodic beam-on-foundation surrogate with normalized γ₀=1:
 * σₘ = ξkₘ² − Kkₘ⁴ − 1, where kₘ=2πm/L.
 */
export function bucklingGrowthRate(
	mode: number,
	domainLength: number,
	mismatch: number,
	stiffness: number
): number {
	const waveNumber = bucklingWaveNumber(mode, domainLength);
	const waveNumberSquared = waveNumber * waveNumber;
	const safeMismatch = clamp(Number.isFinite(mismatch) ? mismatch : 0, -1e6, 1e6);
	const safeStiffness = clamp(Number.isFinite(stiffness) ? stiffness : 1, 0, 1e6);
	return clamp(
		safeMismatch * waveNumberSquared - safeStiffness * waveNumberSquared * waveNumberSquared - 1,
		-1e12,
		1e12
	);
}

/** Deterministically select the fastest-growing resolved mode, preferring the lower mode on ties. */
export function selectDominantBucklingMode(
	maximumMode: number,
	domainLength: number,
	mismatch: number,
	stiffness: number
): DominantBucklingMode {
	const limit = Math.max(
		1,
		Math.min(4096, Math.floor(Number.isFinite(maximumMode) ? maximumMode : 1))
	);
	let selected: DominantBucklingMode = {
		mode: 1,
		waveNumber: bucklingWaveNumber(1, domainLength),
		growthRate: bucklingGrowthRate(1, domainLength, mismatch, stiffness)
	};
	for (let mode = 2; mode <= limit; mode += 1) {
		const growthRate = bucklingGrowthRate(mode, domainLength, mismatch, stiffness);
		if (growthRate > selected.growthRate) {
			selected = {
				mode,
				waveNumber: bucklingWaveNumber(mode, domainLength),
				growthRate
			};
		}
	}
	return selected;
}

/**
 * Exact finite update for da/dτ=σa−λa³ over a fixed interval. The sign of a seed
 * is preserved, stable modes decay, and growing modes approach sqrt(σ/λ).
 */
export function saturatedBucklingAmplitude(
	initialAmplitude: number,
	growthRate: number,
	saturation: number,
	deltaAge: number
): number {
	const sign = initialAmplitude < 0 ? -1 : 1;
	const initial = Math.min(1e6, Math.abs(Number.isFinite(initialAmplitude) ? initialAmplitude : 0));
	if (initial === 0) return 0;
	const sigma = clamp(Number.isFinite(growthRate) ? growthRate : -1, -1e12, 1e12);
	const lambda = Math.max(1e-12, Math.min(1e12, Number.isFinite(saturation) ? saturation : 1));
	const time = Math.max(0, Math.min(1e6, Number.isFinite(deltaAge) ? deltaAge : 0));
	const initialSquared = initial * initial;
	let squared: number;
	if (Math.abs(sigma) < 1e-12) {
		squared = initialSquared / (1 + 2 * lambda * initialSquared * time);
	} else if (sigma > 0) {
		const carryingSquared = sigma / lambda;
		const decay = Math.exp(Math.max(-745, -2 * sigma * time));
		const denominator = 1 + (carryingSquared / initialSquared - 1) * decay;
		squared = carryingSquared / Math.max(1e-300, denominator);
	} else {
		const exponential = Math.exp(Math.max(-745, 2 * sigma * time));
		const denominator = sigma + lambda * initialSquared * (exponential - 1);
		squared = (sigma * initialSquared * exponential) / denominator;
	}
	const amplitude = sign * Math.sqrt(Math.max(0, Math.min(1e12, squared)));
	return Number.isFinite(amplitude) ? amplitude : 0;
}

export function advanceBucklingMode(
	state: BucklingModeState,
	deltaAge: number,
	domainLength: number
): BucklingModeState {
	const sigma = bucklingGrowthRate(state.mode, domainLength, state.mismatch, state.stiffness);
	const amplitude = saturatedBucklingAmplitude(state.amplitude, sigma, state.saturation, deltaAge);
	return { ...state, amplitude };
}

export function evaluateBucklingModes(states: readonly BucklingModeState[], u: number): number {
	let height = 0;
	for (const state of states) {
		height += state.amplitude * Math.cos(Math.max(1, Math.round(state.mode)) * u + state.phase);
	}
	return height;
}
