export interface DopplerVector3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface DopplerAudioParam {
	readonly value?: number;
	setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
}

export interface DopplerSourceOptions {
	readonly speedOfSoundMps?: number;
	readonly maximumClosingSpeedMps?: number;
	readonly minimumRate?: number;
	readonly maximumRate?: number;
	/** Web Audio time constant. The brief calls for restrained 50–80 ms smoothing. */
	readonly smoothingSeconds?: number;
}

export interface DopplerSnapshot {
	readonly distanceM: number;
	readonly closingSpeedMps: number;
	readonly targetRate: number;
	readonly smoothedRate: number;
	readonly direction: 'approaching' | 'neutral' | 'receding';
}

export const DOPPLER_MIN_RATE = 0.92;
export const DOPPLER_MAX_RATE = 1.08;
export const DOPPLER_MAX_CLOSING_SPEED_MPS = 45;
export const DOPPLER_SPEED_OF_SOUND_MPS = 343;
export const DOPPLER_SMOOTHING_SECONDS = 0.065;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function finitePositive(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function dopplerDistance(left: DopplerVector3, right: DopplerVector3): number {
	return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

/** Positive closing speed means approaching; negative means receding. */
export function closingSpeedFromDistances(
	previousDistanceM: number,
	currentDistanceM: number,
	deltaSeconds: number,
	maximumMagnitudeMps = DOPPLER_MAX_CLOSING_SPEED_MPS
): number {
	if (
		!Number.isFinite(previousDistanceM) ||
		!Number.isFinite(currentDistanceM) ||
		!Number.isFinite(deltaSeconds) ||
		deltaSeconds <= 0
	) {
		return 0;
	}
	const maximum = finitePositive(maximumMagnitudeMps, DOPPLER_MAX_CLOSING_SPEED_MPS);
	return clamp((previousDistanceM - currentDistanceM) / deltaSeconds, -maximum, maximum);
}

/** Manual restrained Doppler from the project brief, hard-clamped to 0.92–1.08 by default. */
export function dopplerRateForClosingSpeed(
	closingSpeedMps: number,
	options: DopplerSourceOptions = {}
): number {
	if (!Number.isFinite(closingSpeedMps)) return 1;
	const speedOfSound = finitePositive(options.speedOfSoundMps ?? 343, 343);
	const maximumClosing = finitePositive(
		options.maximumClosingSpeedMps ?? DOPPLER_MAX_CLOSING_SPEED_MPS,
		DOPPLER_MAX_CLOSING_SPEED_MPS
	);
	const minimumRate = finitePositive(options.minimumRate ?? DOPPLER_MIN_RATE, DOPPLER_MIN_RATE);
	const maximumRate = Math.max(
		minimumRate,
		finitePositive(options.maximumRate ?? DOPPLER_MAX_RATE, DOPPLER_MAX_RATE)
	);
	const closing = clamp(closingSpeedMps, -maximumClosing, maximumClosing);
	const denominator = Math.max(speedOfSound * 0.25, speedOfSound - closing);
	return clamp(speedOfSound / denominator, minimumRate, maximumRate);
}

export function dopplerRateFromDistances(
	previousDistanceM: number,
	currentDistanceM: number,
	deltaSeconds: number,
	options: DopplerSourceOptions = {}
): number {
	return dopplerRateForClosingSpeed(
		closingSpeedFromDistances(
			previousDistanceM,
			currentDistanceM,
			deltaSeconds,
			options.maximumClosingSpeedMps
		),
		options
	);
}

/** Frame-rate-independent exponential smoothing matching an AudioParam time constant. */
export function smoothDopplerRate(
	currentRate: number,
	targetRate: number,
	deltaSeconds: number,
	timeConstantSeconds = DOPPLER_SMOOTHING_SECONDS
): number {
	const current = Number.isFinite(currentRate) ? currentRate : 1;
	const target = Number.isFinite(targetRate) ? targetRate : 1;
	if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
	const timeConstant = finitePositive(timeConstantSeconds, DOPPLER_SMOOTHING_SECONDS);
	const amount = 1 - Math.exp(-deltaSeconds / timeConstant);
	return current + (target - current) * amount;
}

/** State holder for one bus, tram, train, bell or ferry source. Do not use it on voices/city beds. */
export class DopplerSource {
	private readonly options: Required<DopplerSourceOptions>;
	private previousDistanceM: number | null = null;
	private rate = 1;
	private snapshot: DopplerSnapshot = {
		distanceM: Number.POSITIVE_INFINITY,
		closingSpeedMps: 0,
		targetRate: 1,
		smoothedRate: 1,
		direction: 'neutral'
	};

	constructor(options: DopplerSourceOptions = {}) {
		const minimumRate = finitePositive(options.minimumRate ?? DOPPLER_MIN_RATE, DOPPLER_MIN_RATE);
		this.options = {
			speedOfSoundMps: finitePositive(
				options.speedOfSoundMps ?? DOPPLER_SPEED_OF_SOUND_MPS,
				DOPPLER_SPEED_OF_SOUND_MPS
			),
			maximumClosingSpeedMps: finitePositive(
				options.maximumClosingSpeedMps ?? DOPPLER_MAX_CLOSING_SPEED_MPS,
				DOPPLER_MAX_CLOSING_SPEED_MPS
			),
			minimumRate,
			maximumRate: Math.max(
				minimumRate,
				finitePositive(options.maximumRate ?? DOPPLER_MAX_RATE, DOPPLER_MAX_RATE)
			),
			smoothingSeconds: clamp(
				finitePositive(options.smoothingSeconds ?? DOPPLER_SMOOTHING_SECONDS, 0.065),
				0.05,
				0.08
			)
		};
	}

	update(distanceM: number, deltaSeconds: number): DopplerSnapshot {
		const distance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
		const closingSpeedMps =
			this.previousDistanceM === null
				? 0
				: closingSpeedFromDistances(
						this.previousDistanceM,
						distance,
						deltaSeconds,
						this.options.maximumClosingSpeedMps
					);
		const targetRate = dopplerRateForClosingSpeed(closingSpeedMps, this.options);
		this.rate = clamp(
			smoothDopplerRate(this.rate, targetRate, deltaSeconds, this.options.smoothingSeconds),
			this.options.minimumRate,
			this.options.maximumRate
		);
		this.previousDistanceM = distance;
		this.snapshot = {
			distanceM: distance,
			closingSpeedMps,
			targetRate,
			smoothedRate: this.rate,
			direction:
				closingSpeedMps > 0.01 ? 'approaching' : closingSpeedMps < -0.01 ? 'receding' : 'neutral'
		};
		return this.snapshot;
	}

	updatePositions(
		sourcePosition: DopplerVector3,
		listenerPosition: DopplerVector3,
		deltaSeconds: number
	): DopplerSnapshot {
		return this.update(dopplerDistance(sourcePosition, listenerPosition), deltaSeconds);
	}

	/** Applies the target with the same 50–80 ms smoothing in Web Audio's own clock domain. */
	applyTo(parameter: DopplerAudioParam, audioTimeSeconds: number): number {
		parameter.setTargetAtTime(
			this.snapshot.targetRate,
			Math.max(0, Number.isFinite(audioTimeSeconds) ? audioTimeSeconds : 0),
			this.options.smoothingSeconds
		);
		return this.snapshot.targetRate;
	}

	getSnapshot(): DopplerSnapshot {
		return { ...this.snapshot };
	}

	reset(distanceM?: number): void {
		this.previousDistanceM = Number.isFinite(distanceM) ? Math.max(0, Number(distanceM)) : null;
		this.rate = 1;
		this.snapshot = {
			distanceM: this.previousDistanceM ?? Number.POSITIVE_INFINITY,
			closingSpeedMps: 0,
			targetRate: 1,
			smoothedRate: 1,
			direction: 'neutral'
		};
	}
}
