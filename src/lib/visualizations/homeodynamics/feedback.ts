import type { FeedbackParameters, FeedbackPreset, FeedbackPresetId, FeedbackSample } from './types';

const FEEDBACK_BASE = {
	a: 2,
	b: 1,
	K: 1,
	n: 4,
	perturbation: 0.6,
	perturbationTime: 5,
	dt: 0.01,
	duration: 125
} as const;

export const FEEDBACK_HOPF_THRESHOLD = Math.acos(-0.5) / Math.sqrt(3);

export const FEEDBACK_PRESETS: Record<FeedbackPresetId, FeedbackPreset> = {
	monotonic: {
		id: 'monotonic',
		label: 'Monotonic return',
		description: 'No delay: the perturbed value returns directly to the fixed point.',
		parameters: { ...FEEDBACK_BASE, delay: 0 }
	},
	damped: {
		id: 'damped',
		label: 'Damped ringing',
		description: 'Delay below the transition: overshoot fades back toward the fixed point.',
		parameters: { ...FEEDBACK_BASE, delay: 1.1 }
	},
	sustained: {
		id: 'sustained',
		label: 'Sustained oscillation',
		description:
			'Delay above the transition: the fixed point loses stability and a bounded rhythm persists.',
		parameters: { ...FEEDBACK_BASE, delay: 1.4 }
	}
};

export type FeedbackRegimeMetrics = {
	classification: FeedbackPresetId | 'unclassified';
	crossings: number;
	previousRange: number;
	finalRange: number;
	finalError: number;
	finiteAndPositive: boolean;
};

export function feedbackEquilibrium(parameters: FeedbackParameters): number {
	const residual = (x: number) =>
		parameters.a / (1 + Math.pow(x / parameters.K, parameters.n)) - parameters.b * x;
	let low = 0;
	let high = parameters.a / parameters.b;

	for (let iteration = 0; iteration < 96; iteration += 1) {
		const middle = (low + high) / 2;
		if (residual(middle) > 0) low = middle;
		else high = middle;
	}

	return (low + high) / 2;
}

export function feedbackRate(
	current: number,
	delayed: number,
	parameters: FeedbackParameters
): number {
	return (
		parameters.a / (1 + Math.pow(delayed / parameters.K, parameters.n)) - parameters.b * current
	);
}

export function historyAt(
	queryTime: number,
	values: Float64Array,
	maxKnownIndex: number,
	dt: number,
	equilibrium: number
): number {
	const timeEpsilon = dt * 1e-9;
	if (queryTime < -timeEpsilon) return equilibrium;
	if (Math.abs(queryTime) <= timeEpsilon) return values[0];

	const position = queryTime / dt;
	const nearest = Math.round(position);
	if (Math.abs(position - nearest) <= 1e-10) {
		if (nearest > maxKnownIndex) throw new Error('History query entered the future');
		return values[nearest];
	}

	const left = Math.floor(position);
	const right = left + 1;
	if (left < 0) return equilibrium;
	if (right > maxKnownIndex) throw new Error('History query entered the future');

	const fraction = position - left;
	return values[left] + fraction * (values[right] - values[left]);
}

function ordinaryRk4Step(current: number, parameters: FeedbackParameters): number {
	const derivative = (value: number) => feedbackRate(value, value, parameters);
	const k1 = derivative(current);
	const k2 = derivative(current + (parameters.dt * k1) / 2);
	const k3 = derivative(current + (parameters.dt * k2) / 2);
	const k4 = derivative(current + parameters.dt * k3);
	return current + (parameters.dt * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
}

function delayedRk4Step(
	current: number,
	time: number,
	index: number,
	values: Float64Array,
	equilibrium: number,
	parameters: FeedbackParameters
): number {
	const { delay, dt } = parameters;
	const k1 = feedbackRate(
		current,
		historyAt(time - delay, values, index, dt, equilibrium),
		parameters
	);
	const k2 = feedbackRate(
		current + (dt * k1) / 2,
		historyAt(time + dt / 2 - delay, values, index, dt, equilibrium),
		parameters
	);
	const k3 = feedbackRate(
		current + (dt * k2) / 2,
		historyAt(time + dt / 2 - delay, values, index, dt, equilibrium),
		parameters
	);
	const k4 = feedbackRate(
		current + dt * k3,
		historyAt(time + dt - delay, values, index, dt, equilibrium),
		parameters
	);
	return current + (dt * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
}

function validateFeedbackParameters(parameters: FeedbackParameters): void {
	for (const [name, value] of Object.entries(parameters)) {
		if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
	}
	if (parameters.a <= 0 || parameters.b <= 0 || parameters.K <= 0 || parameters.n <= 0) {
		throw new RangeError('a, b, K and n must be positive');
	}
	if (parameters.delay < 0 || parameters.perturbationTime < 0 || parameters.duration <= 0) {
		throw new RangeError(
			'delay and perturbationTime cannot be negative; duration must be positive'
		);
	}
	if (parameters.dt <= 0) throw new RangeError('dt must be positive');
	if (parameters.delay > 0 && parameters.delay < parameters.dt) {
		throw new RangeError('positive delay must be at least one integration step');
	}
	if (parameters.perturbationTime > parameters.duration) {
		throw new RangeError('perturbationTime must fall inside the simulation');
	}
}

export function simulateFeedback(parameters: FeedbackParameters): FeedbackSample[] {
	validateFeedbackParameters(parameters);
	const equilibrium = feedbackEquilibrium(parameters);
	if (equilibrium + parameters.perturbation <= 0) {
		throw new RangeError('perturbation would create a non-positive state');
	}

	const stepCount = Math.round(parameters.duration / parameters.dt);
	const perturbationIndex = Math.round(parameters.perturbationTime / parameters.dt);
	const values = new Float64Array(stepCount + 1);
	values[0] = equilibrium;

	for (let index = 0; index < stepCount; index += 1) {
		if (index === perturbationIndex) values[index] += parameters.perturbation;
		const current = values[index];
		const time = index * parameters.dt;
		const next =
			parameters.delay === 0
				? ordinaryRk4Step(current, parameters)
				: delayedRk4Step(current, time, index, values, equilibrium, parameters);
		if (!Number.isFinite(next) || next <= 0) {
			throw new Error(`Feedback solver produced an invalid state at t=${time + parameters.dt}`);
		}
		values[index + 1] = next;
	}
	if (perturbationIndex === stepCount) values[stepCount] += parameters.perturbation;

	return Array.from(values, (x, index) => {
		const t = index * parameters.dt;
		const delayed =
			parameters.delay === 0
				? x
				: historyAt(t - parameters.delay, values, stepCount, parameters.dt, equilibrium);
		return { t, x, delayed };
	});
}

function rangeBetween(samples: readonly FeedbackSample[], start: number, end: number): number {
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (const sample of samples) {
		if (sample.t < start || sample.t > end) continue;
		minimum = Math.min(minimum, sample.x);
		maximum = Math.max(maximum, sample.x);
	}
	return maximum - minimum;
}

export function classifyFeedbackRegime(
	samples: readonly FeedbackSample[],
	parameters: FeedbackParameters
): FeedbackRegimeMetrics {
	const equilibrium = feedbackEquilibrium(parameters);
	const relative = samples.filter((sample) => sample.t >= parameters.perturbationTime);
	const deadband = 1e-4;
	let previousSign = 0;
	let crossings = 0;
	let monotonicError = true;
	let previousError = Number.POSITIVE_INFINITY;

	for (const sample of relative) {
		const error = sample.x - equilibrium;
		const absoluteError = Math.abs(error);
		const sign = absoluteError <= deadband ? 0 : Math.sign(error);
		if (sign !== 0 && previousSign !== 0 && sign !== previousSign) crossings += 1;
		if (sign !== 0) previousSign = sign;
		if (absoluteError > previousError + 1e-10) monotonicError = false;
		previousError = absoluteError;
	}

	const previousRange = rangeBetween(
		samples,
		parameters.perturbationTime + 60,
		parameters.perturbationTime + 90
	);
	const finalRange = rangeBetween(
		samples,
		parameters.perturbationTime + 90,
		parameters.perturbationTime + 120
	);
	const finalError = Math.abs(relative.at(-1)!.x - equilibrium);
	const finiteAndPositive = relative.every((sample) => Number.isFinite(sample.x) && sample.x > 0);

	let classification: FeedbackRegimeMetrics['classification'] = 'unclassified';
	if (crossings === 0 && monotonicError && finalError < 1e-6) classification = 'monotonic';
	else if (
		crossings >= 4 &&
		finalRange < previousRange * 0.5 &&
		finalError < 0.01 &&
		finiteAndPositive
	) {
		classification = 'damped';
	} else if (
		finalRange > 0.1 &&
		finalRange / previousRange >= 0.9 &&
		finalRange / previousRange <= 1.1 &&
		finiteAndPositive
	) {
		const finalQuarterStart = parameters.perturbationTime + 90;
		let tailPreviousSign = 0;
		let tailCrossings = 0;
		for (const sample of samples) {
			if (sample.t < finalQuarterStart) continue;
			const error = sample.x - equilibrium;
			const sign = Math.abs(error) <= deadband ? 0 : Math.sign(error);
			if (sign !== 0 && tailPreviousSign !== 0 && sign !== tailPreviousSign) tailCrossings += 1;
			if (sign !== 0) tailPreviousSign = sign;
		}
		if (tailCrossings >= 6) classification = 'sustained';
	}

	return { classification, crossings, previousRange, finalRange, finalError, finiteAndPositive };
}

export function downsampleFeedback(
	samples: readonly FeedbackSample[],
	maximumPoints = 1_000
): FeedbackSample[] {
	if (samples.length <= maximumPoints) return samples.map((sample) => ({ ...sample }));
	const stride = Math.ceil(samples.length / maximumPoints);
	const output = samples
		.filter((_, index) => index % stride === 0)
		.map((sample) => ({ ...sample }));
	const finalSample = samples.at(-1)!;
	if (output.at(-1)?.t !== finalSample.t) output.push({ ...finalSample });
	return output;
}
