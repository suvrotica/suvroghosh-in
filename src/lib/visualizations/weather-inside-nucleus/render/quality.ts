import type { NucleusQualityChoice, NucleusQualityTier } from './types';

export type NucleusQualityProfile = Readonly<{
	tier: NucleusQualityTier;
	dprCap: number;
	/** WebGL context-creation hint. MSAA cannot be toggled after the context exists. */
	antialias: boolean;
	territorySamples: number;
	signalSamples: number;
	rnaPoolSize: number;
	shaderDetail: 0 | 1 | 2;
}>;

export type NucleusQualityHints = Readonly<{
	width: number;
	height: number;
	devicePixelRatio: number;
	hardwareConcurrency?: number;
	deviceMemory?: number;
	saveData?: boolean;
}>;

export const NUCLEUS_QUALITY_PROFILES = {
	low: {
		tier: 'low',
		dprCap: 1,
		antialias: false,
		territorySamples: 900,
		signalSamples: 96,
		rnaPoolSize: 64,
		shaderDetail: 0
	},
	medium: {
		tier: 'medium',
		dprCap: 1.25,
		antialias: true,
		territorySamples: 2_400,
		signalSamples: 192,
		rnaPoolSize: 128,
		shaderDetail: 1
	},
	high: {
		tier: 'high',
		dprCap: 1.5,
		antialias: true,
		territorySamples: 4_800,
		signalSamples: 320,
		rnaPoolSize: 256,
		shaderDetail: 2
	}
} as const satisfies Record<NucleusQualityTier, NucleusQualityProfile>;

export function qualityProfile(tier: NucleusQualityTier): NucleusQualityProfile {
	return NUCLEUS_QUALITY_PROFILES[tier];
}

export function qualityHintsFromBrowser(canvas: HTMLCanvasElement): NucleusQualityHints {
	const navigatorWithHints = navigator as Navigator & {
		deviceMemory?: number;
		connection?: { saveData?: boolean };
	};
	return {
		width: Math.max(1, Math.round(canvas.clientWidth || window.innerWidth)),
		height: Math.max(1, Math.round(canvas.clientHeight || window.innerHeight)),
		devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemory: navigatorWithHints.deviceMemory,
		saveData: navigatorWithHints.connection?.saveData
	};
}

export function chooseInitialQuality(
	choice: NucleusQualityChoice,
	hints: NucleusQualityHints
): NucleusQualityTier {
	if (choice !== 'auto') return choice;

	const shortEdge = Math.min(hints.width, hints.height);
	const constrained =
		hints.saveData === true ||
		shortEdge <= 640 ||
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) ||
		(hints.deviceMemory !== undefined && hints.deviceMemory <= 4);
	if (constrained) return 'low';

	const generous =
		hints.width >= 1_100 &&
		hints.height >= 700 &&
		(hints.hardwareConcurrency === undefined || hints.hardwareConcurrency >= 8) &&
		(hints.deviceMemory === undefined || hints.deviceMemory >= 8) &&
		hints.devicePixelRatio <= 2.5;
	return generous ? 'high' : 'medium';
}

/**
 * Hysteretic auto-quality choice. Call only after a representative frame window; explicit quality
 * choices never reach this helper.
 */
export function adaptQuality(
	current: NucleusQualityTier,
	averageFrameMs: number,
	hints: NucleusQualityHints
): NucleusQualityTier {
	if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 0) return current;
	if (averageFrameMs >= 30) return 'low';
	if (averageFrameMs >= 21 && current === 'high') return 'medium';

	const constrained = chooseInitialQuality('auto', hints) === 'low';
	if (constrained) return current === 'high' ? 'medium' : current;
	if (averageFrameMs <= 14.5 && current === 'low') return 'medium';
	if (averageFrameMs <= 15.5 && current === 'medium') return 'high';
	return current;
}

export function cappedPixelRatio(devicePixelRatio: number, tier: NucleusQualityTier): number {
	const density = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
	return Math.min(density, qualityProfile(tier).dprCap);
}
