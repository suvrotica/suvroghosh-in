export const METRIC_LIMITS = {
	stamina: { minimum: 0, maximum: 100 },
	morale: { minimum: 0, maximum: 100 },
	reflex: { minimum: 0.5, maximum: 1.5 },
	distance: { minimum: 0, maximum: Number.POSITIVE_INFINITY }
} as const;

export interface PlayerMetrics {
	stamina: number;
	morale: number;
	reflex: number;
	distance: number;
}

export type MetricDelta = Partial<PlayerMetrics>;

export interface MetricTick {
	deltaMs: number;
	moving?: boolean;
	dashing?: boolean;
	squeezing?: boolean;
	weather?: 'dry' | 'rain' | 'post-rain';
	heatIntensity?: number;
	staminaDrainMultiplier?: number;
}

const DEFAULT_METRICS: PlayerMetrics = {
	stamina: 100,
	morale: 82,
	reflex: 1,
	distance: 0
};

export function clamp(value: number, minimum: number, maximum: number): number {
	if (Number.isNaN(value)) return minimum;
	return Math.max(minimum, Math.min(maximum, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createPlayerMetrics(overrides: MetricDelta = {}): PlayerMetrics {
	return {
		stamina: clamp(
			finiteOr(overrides.stamina, DEFAULT_METRICS.stamina),
			METRIC_LIMITS.stamina.minimum,
			METRIC_LIMITS.stamina.maximum
		),
		morale: clamp(
			finiteOr(overrides.morale, DEFAULT_METRICS.morale),
			METRIC_LIMITS.morale.minimum,
			METRIC_LIMITS.morale.maximum
		),
		reflex: clamp(
			finiteOr(overrides.reflex, DEFAULT_METRICS.reflex),
			METRIC_LIMITS.reflex.minimum,
			METRIC_LIMITS.reflex.maximum
		),
		distance: Math.max(0, finiteOr(overrides.distance, DEFAULT_METRICS.distance))
	};
}

export function applyMetricDelta(metrics: PlayerMetrics, delta: MetricDelta): PlayerMetrics {
	return createPlayerMetrics({
		stamina: metrics.stamina + finiteOr(delta.stamina, 0),
		morale: metrics.morale + finiteOr(delta.morale, 0),
		reflex: metrics.reflex + finiteOr(delta.reflex, 0),
		distance: metrics.distance + finiteOr(delta.distance, 0)
	});
}

export function advanceMetrics(metrics: PlayerMetrics, tick: MetricTick): PlayerMetrics {
	const deltaSeconds = Math.max(0, finiteOr(tick.deltaMs, 0)) / 1000;
	const heat = clamp(finiteOr(tick.heatIntensity, 0.45), 0, 1);
	const weatherMultiplier =
		tick.weather === 'rain' ? 1.08 : tick.weather === 'post-rain' ? 1.04 : 1;
	const drainMultiplier = Math.max(0, finiteOr(tick.staminaDrainMultiplier, 1));

	let staminaPerSecond = 0;
	if (tick.moving) staminaPerSecond += 0.38 + heat * 0.2;
	else staminaPerSecond -= 1.25;
	if (tick.dashing) staminaPerSecond += 4.8;
	if (tick.squeezing) staminaPerSecond += 1.4;

	const staminaDelta =
		staminaPerSecond < 0
			? -staminaPerSecond * deltaSeconds
			: -staminaPerSecond * weatherMultiplier * drainMultiplier * deltaSeconds;

	return applyMetricDelta(metrics, { stamina: staminaDelta });
}

export function isExhausted(metrics: PlayerMetrics): boolean {
	return metrics.stamina <= METRIC_LIMITS.stamina.minimum;
}

export function hasLostMorale(metrics: PlayerMetrics): boolean {
	return metrics.morale <= METRIC_LIMITS.morale.minimum;
}
