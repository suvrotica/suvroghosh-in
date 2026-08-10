import type { QualityMode } from '../settings';

export type QualityDeviceClass = 'desktop' | 'mobile';
export type EffectiveQualityTier = Exclude<QualityMode, 'auto'>;

export interface QualityHints {
	readonly width: number;
	readonly height: number;
	readonly devicePixelRatio: number;
	readonly hardwareConcurrency?: number;
	readonly deviceMemoryGb?: number;
	readonly saveData?: boolean;
	readonly coarsePointer?: boolean;
	readonly mobile?: boolean;
}

export interface QualityProfile {
	readonly requestedMode: QualityMode;
	readonly effectiveTier: EffectiveQualityTier;
	readonly deviceClass: QualityDeviceClass;
	readonly autoDegradationStage: number;
	readonly pixelRatio: number;
	readonly pixelRatioCap: number;
	readonly resolutionScale: number;
	readonly targetFps: 30 | 60;
	readonly drawCallBudget: number;
	readonly triangleBudget: number;
	readonly positionalAudioVoices: number;
	readonly distantCrowdDensity: number;
	readonly particleDensity: number;
	readonly minorPropDensity: number;
	readonly birdDensity: number;
	readonly postProcessing: 'full' | 'reduced' | 'off';
}

export interface QualityFrameSample {
	readonly frameMs: number;
	readonly deltaSeconds?: number;
	readonly drawCalls?: number;
	readonly triangles?: number;
}

export interface QualityAdjustment {
	readonly direction: 'degraded' | 'restored';
	readonly previousStage: number;
	readonly nextStage: number;
	readonly reason: 'frame-time' | 'render-budget' | 'recovered';
	readonly profile: QualityProfile;
}

export interface QualityManagerOptions {
	readonly pressureHoldSeconds?: number;
	readonly recoveryHoldSeconds?: number;
	readonly initialAutoStage?: number;
}

export interface QualityDebugSnapshot {
	readonly mode: QualityMode;
	readonly deviceClass: QualityDeviceClass;
	readonly stage: number;
	readonly smoothedFrameMs: number;
	readonly pressureSeconds: number;
	readonly recoverySeconds: number;
	readonly profile: QualityProfile;
}

export const AUTO_DEGRADATION_ORDER = Object.freeze([
	'resolution-86-percent',
	'resolution-72-percent',
	'distant-crowds',
	'particles',
	'minor-props',
	'birds',
	'post-processing'
] as const);

const MAX_AUTO_STAGE = AUTO_DEGRADATION_ORDER.length;

interface TierProfile {
	readonly pixelRatioCap: number;
	readonly drawCallBudget: number;
	readonly triangleBudget: number;
	readonly voices: number;
	readonly crowd: number;
	readonly particles: number;
	readonly props: number;
	readonly birds: number;
	readonly post: QualityProfile['postProcessing'];
}

const DESKTOP_TIERS: Readonly<Record<EffectiveQualityTier, TierProfile>> = {
	high: {
		pixelRatioCap: 1.5,
		drawCallBudget: 150,
		triangleBudget: 600_000,
		voices: 8,
		crowd: 1,
		particles: 1,
		props: 1,
		birds: 1,
		post: 'full'
	},
	balanced: {
		pixelRatioCap: 1.25,
		drawCallBudget: 120,
		triangleBudget: 420_000,
		voices: 6,
		crowd: 0.72,
		particles: 0.72,
		props: 0.78,
		birds: 0.72,
		post: 'reduced'
	},
	battery: {
		pixelRatioCap: 1,
		drawCallBudget: 80,
		triangleBudget: 220_000,
		voices: 4,
		crowd: 0.35,
		particles: 0.32,
		props: 0.45,
		birds: 0.35,
		post: 'off'
	}
};

const MOBILE_TIERS: Readonly<Record<EffectiveQualityTier, TierProfile>> = {
	high: {
		pixelRatioCap: 1.25,
		drawCallBudget: 90,
		triangleBudget: 220_000,
		voices: 4,
		crowd: 0.68,
		particles: 0.68,
		props: 0.72,
		birds: 0.62,
		post: 'reduced'
	},
	balanced: {
		pixelRatioCap: 1,
		drawCallBudget: 72,
		triangleBudget: 160_000,
		voices: 4,
		crowd: 0.48,
		particles: 0.48,
		props: 0.55,
		birds: 0.45,
		post: 'reduced'
	},
	battery: {
		pixelRatioCap: 0.85,
		drawCallBudget: 55,
		triangleBudget: 100_000,
		voices: 3,
		crowd: 0.22,
		particles: 0.2,
		props: 0.3,
		birds: 0.2,
		post: 'off'
	}
};

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function finitePositive(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function qualityDeviceClass(hints: QualityHints): QualityDeviceClass {
	if (hints.mobile !== undefined) return hints.mobile ? 'mobile' : 'desktop';
	const shortEdge = Math.min(finitePositive(hints.width, 1), finitePositive(hints.height, 1));
	return hints.coarsePointer === true || shortEdge <= 640 ? 'mobile' : 'desktop';
}

export function chooseAutoBaseTier(
	hints: QualityHints,
	deviceClass = qualityDeviceClass(hints)
): EffectiveQualityTier {
	if (
		hints.saveData === true ||
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 2) ||
		(hints.deviceMemoryGb !== undefined && hints.deviceMemoryGb <= 2)
	) {
		return 'battery';
	}
	if (deviceClass === 'mobile') return 'balanced';
	if (
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) ||
		(hints.deviceMemoryGb !== undefined && hints.deviceMemoryGb <= 4)
	) {
		return 'balanced';
	}
	return 'high';
}

function stagedFeatures(
	base: TierProfile,
	stage: number
): Pick<
	QualityProfile,
	| 'resolutionScale'
	| 'distantCrowdDensity'
	| 'particleDensity'
	| 'minorPropDensity'
	| 'birdDensity'
	| 'postProcessing'
> {
	const safeStage = Math.round(clamp(stage, 0, MAX_AUTO_STAGE));
	const resolutionScale = safeStage >= 2 ? 0.72 : safeStage >= 1 ? 0.86 : 1;
	return {
		resolutionScale,
		distantCrowdDensity: safeStage >= 3 ? 0 : base.crowd,
		particleDensity: safeStage >= 4 ? base.particles * 0.52 : base.particles,
		minorPropDensity: safeStage >= 5 ? base.props * 0.5 : base.props,
		birdDensity: safeStage >= 6 ? base.birds * 0.42 : base.birds,
		postProcessing: safeStage >= 7 ? 'off' : base.post
	};
}

export function qualityProfile(
	mode: QualityMode,
	hints: QualityHints,
	autoDegradationStage = 0
): QualityProfile {
	const deviceClass = qualityDeviceClass(hints);
	const effectiveTier = mode === 'auto' ? chooseAutoBaseTier(hints, deviceClass) : mode;
	const base = (deviceClass === 'mobile' ? MOBILE_TIERS : DESKTOP_TIERS)[effectiveTier];
	const stage = mode === 'auto' ? Math.round(clamp(autoDegradationStage, 0, MAX_AUTO_STAGE)) : 0;
	const features = stagedFeatures(base, stage);
	const density = finitePositive(hints.devicePixelRatio, 1);
	const pixelRatioCap = base.pixelRatioCap;
	return {
		requestedMode: mode,
		effectiveTier,
		deviceClass,
		autoDegradationStage: stage,
		pixelRatio: Math.min(density, pixelRatioCap * features.resolutionScale),
		pixelRatioCap,
		resolutionScale: features.resolutionScale,
		targetFps: deviceClass === 'mobile' ? 30 : 60,
		drawCallBudget: base.drawCallBudget,
		triangleBudget: base.triangleBudget,
		positionalAudioVoices: base.voices,
		distantCrowdDensity: features.distantCrowdDensity,
		particleDensity: features.particleDensity,
		minorPropDensity: features.minorPropDensity,
		birdDensity: features.birdDensity,
		postProcessing: features.postProcessing
	};
}

/** Browser-only hint collection is kept out of constructors so importing this file remains SSR-safe. */
export function qualityHintsFromBrowser(width: number, height: number): QualityHints {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return { width, height, devicePixelRatio: 1, mobile: false };
	}
	const browserNavigator = navigator as Navigator & {
		deviceMemory?: number;
		connection?: { saveData?: boolean };
	};
	return {
		width,
		height,
		devicePixelRatio: window.devicePixelRatio || 1,
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemoryGb: browserNavigator.deviceMemory,
		saveData: browserNavigator.connection?.saveData,
		coarsePointer: window.matchMedia?.('(pointer: coarse)').matches
	};
}

/**
 * Auto-quality controller with asymmetric time hysteresis. Pressure must persist before one
 * degradation step; recovery must remain substantially faster than target for much longer. This
 * prevents oscillation and always spends the first two steps on resolution.
 */
export class QualityManager {
	private mode: QualityMode;
	private readonly hints: QualityHints;
	private stage: number;
	private readonly pressureHoldSeconds: number;
	private readonly recoveryHoldSeconds: number;
	private smoothedFrameMs = 0;
	private pressureSeconds = 0;
	private recoverySeconds = 0;

	constructor(mode: QualityMode, hints: QualityHints, options: QualityManagerOptions = {}) {
		this.mode = mode;
		this.hints = { ...hints };
		this.stage =
			mode === 'auto' ? Math.round(clamp(options.initialAutoStage ?? 0, 0, MAX_AUTO_STAGE)) : 0;
		this.pressureHoldSeconds = finitePositive(options.pressureHoldSeconds ?? 1.25, 1.25);
		this.recoveryHoldSeconds = finitePositive(options.recoveryHoldSeconds ?? 6, 6);
	}

	get requestedMode(): QualityMode {
		return this.mode;
	}

	get autoDegradationStage(): number {
		return this.stage;
	}

	getProfile(): QualityProfile {
		return qualityProfile(this.mode, this.hints, this.stage);
	}

	setMode(mode: QualityMode): QualityProfile {
		if (this.mode !== mode) {
			this.mode = mode;
			this.stage = 0;
			this.resetHysteresis();
		}
		return this.getProfile();
	}

	update(sample: QualityFrameSample): QualityAdjustment | null {
		if (this.mode !== 'auto') return null;
		const frameMs = finitePositive(sample.frameMs, 0);
		if (frameMs <= 0) return null;
		const deltaSeconds = clamp(
			finitePositive(sample.deltaSeconds ?? frameMs / 1_000, frameMs / 1_000),
			1 / 240,
			0.25
		);
		const smoothing = 1 - Math.exp(-deltaSeconds / 0.35);
		this.smoothedFrameMs =
			this.smoothedFrameMs === 0
				? frameMs
				: this.smoothedFrameMs + (frameMs - this.smoothedFrameMs) * smoothing;

		const profile = this.getProfile();
		const targetFrameMs = 1_000 / profile.targetFps;
		const overRenderBudget =
			(sample.drawCalls !== undefined && sample.drawCalls > profile.drawCallBudget) ||
			(sample.triangles !== undefined && sample.triangles > profile.triangleBudget);
		const underPressure = this.smoothedFrameMs > targetFrameMs * 1.12 || overRenderBudget;
		const recovered =
			this.smoothedFrameMs < targetFrameMs * 0.82 &&
			(sample.drawCalls === undefined || sample.drawCalls < profile.drawCallBudget * 0.82) &&
			(sample.triangles === undefined || sample.triangles < profile.triangleBudget * 0.82);

		if (underPressure) {
			this.pressureSeconds += deltaSeconds;
			this.recoverySeconds = 0;
			if (this.pressureSeconds >= this.pressureHoldSeconds && this.stage < MAX_AUTO_STAGE) {
				const previousStage = this.stage;
				this.stage += 1;
				this.resetHysteresis(false);
				return {
					direction: 'degraded',
					previousStage,
					nextStage: this.stage,
					reason: overRenderBudget ? 'render-budget' : 'frame-time',
					profile: this.getProfile()
				};
			}
			return null;
		}

		this.pressureSeconds = 0;
		if (recovered && this.stage > 0) {
			this.recoverySeconds += deltaSeconds;
			if (this.recoverySeconds >= this.recoveryHoldSeconds) {
				const previousStage = this.stage;
				this.stage -= 1;
				this.resetHysteresis(false);
				return {
					direction: 'restored',
					previousStage,
					nextStage: this.stage,
					reason: 'recovered',
					profile: this.getProfile()
				};
			}
		} else {
			this.recoverySeconds = 0;
		}
		return null;
	}

	debugSnapshot(): QualityDebugSnapshot {
		return {
			mode: this.mode,
			deviceClass: qualityDeviceClass(this.hints),
			stage: this.stage,
			smoothedFrameMs: this.smoothedFrameMs,
			pressureSeconds: this.pressureSeconds,
			recoverySeconds: this.recoverySeconds,
			profile: this.getProfile()
		};
	}

	private resetHysteresis(resetAverage = true): void {
		this.pressureSeconds = 0;
		this.recoverySeconds = 0;
		if (resetAverage) this.smoothedFrameMs = 0;
	}
}
