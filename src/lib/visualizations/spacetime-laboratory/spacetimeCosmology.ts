import type { SpacetimeParameters } from './spacetimeTypes';

/**
 * Homogeneous FLRW background, with a = 1 at the laboratory's reference epoch.
 * Time τ = H₀ Δt. The density parameters obey Ωk = 1 − Ωm − Ωr − ΩΛ.
 *
 * We integrate a″ = −Ωm/(2a²) − Ωr/a³ + ΩΛ a with a(0) = a′(0) = 1.
 * This is the acceleration form of the Friedmann equations; unlike taking only
 * the positive square root of H² it also follows a closed model's turnaround.
 * The accompanying constraint is a′² = Ωm/a + Ωr/a² + Ωk + ΩΛ a².
 * See David Tong, Cosmology, §1.3:
 * https://www.damtp.cam.ac.uk/user/tong/cosmo/cosmohtml/S1.html
 */
export type FlrwDensities = Pick<
	SpacetimeParameters,
	'omegaMatter' | 'omegaRadiation' | 'omegaLambda'
>;

export type FlrwPhase = 'expanding' | 'contracting' | 'crunch' | 'display-limit';

export interface FlrwSolution {
	scaleFactor: number;
	/** da/d(H₀t), with sign retained through a turnaround. */
	expansionRate: number;
	/** H₀ Δt reached by the finite integrator. */
	hubbleTime: number;
	phase: FlrwPhase;
}

export const FLRW_VISUAL_HUBBLE_RATE = 0.04;
export const FLRW_MIN_SCALE_FACTOR = 1e-4;
export const FLRW_MAX_SCALE_FACTOR = 1e4;
const MAX_HUBBLE_TIME = 128;
const MAX_STEPS = 32_768;
const MPC_KM = 3.085_677_581_491_367e19;
const SECONDS_PER_GYR = 365.25 * 86_400 * 1e9;

function nonnegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function flrwCurvatureDensity(densities: FlrwDensities): number {
	return (
		1 -
		nonnegative(densities.omegaMatter) -
		nonnegative(densities.omegaRadiation) -
		nonnegative(densities.omegaLambda)
	);
}

export function flrwCurvatureSign(densities: FlrwDensities): -1 | 0 | 1 {
	const omegaK = flrwCurvatureDensity(densities);
	return Math.abs(omegaK) < 1e-8 ? 0 : omegaK > 0 ? -1 : 1;
}

export function flrwScaleFactorAt(hubbleTime: number, densities: FlrwDensities): FlrwSolution {
	const target = Math.min(MAX_HUBBLE_TIME, nonnegative(hubbleTime));
	const matter = nonnegative(densities.omegaMatter);
	const radiation = nonnegative(densities.omegaRadiation);
	const lambda = nonnegative(densities.omegaLambda);
	const acceleration = (a: number) => {
		const safeA = Math.max(a, FLRW_MIN_SCALE_FACTOR / 2);
		return -matter / (2 * safeA * safeA) - radiation / safeA ** 3 + lambda * safeA;
	};
	let a = 1;
	let velocity = 1;
	let time = 0;
	let steps = 0;
	while (time < target && steps++ < MAX_STEPS) {
		// Resolve the approach to the crunch without ever evaluating at a = 0.
		const step = Math.min(target - time, 1 / 64, (0.04 * a) / Math.max(Math.abs(velocity), 1e-6));
		const k1a = velocity;
		const k1v = acceleration(a);
		const k2a = velocity + (step * k1v) / 2;
		const k2v = acceleration(a + (step * k1a) / 2);
		const k3a = velocity + (step * k2v) / 2;
		const k3v = acceleration(a + (step * k2a) / 2);
		const k4a = velocity + step * k3v;
		const k4v = acceleration(a + step * k3a);
		a += (step * (k1a + 2 * k2a + 2 * k3a + k4a)) / 6;
		velocity += (step * (k1v + 2 * k2v + 2 * k3v + k4v)) / 6;
		time += step;
		if (a <= FLRW_MIN_SCALE_FACTOR) {
			return {
				scaleFactor: FLRW_MIN_SCALE_FACTOR,
				expansionRate: velocity,
				hubbleTime: time,
				phase: 'crunch'
			};
		}
		if (!Number.isFinite(a) || a >= FLRW_MAX_SCALE_FACTOR) {
			return {
				scaleFactor: FLRW_MAX_SCALE_FACTOR,
				expansionRate: Number.isFinite(velocity) ? velocity : 0,
				hubbleTime: time,
				phase: 'display-limit'
			};
		}
	}
	return {
		scaleFactor: a,
		expansionRate: velocity,
		hubbleTime: time,
		phase:
			hubbleTime > MAX_HUBBLE_TIME || steps >= MAX_STEPS
				? 'display-limit'
				: velocity < 0
					? 'contracting'
					: 'expanding'
	};
}

/** Seconds are a labelled presentation clock, mapped to cosmological time. */
export function flrwHubbleTime(params: SpacetimeParameters, elapsedSeconds: number): number {
	return (
		((nonnegative(params.flrwTime) +
			FLRW_VISUAL_HUBBLE_RATE * nonnegative(elapsedSeconds) * nonnegative(params.flrwSpeed)) *
			nonnegative(params.hubble)) /
		70
	);
}

export function flrwSnapshot(params: SpacetimeParameters, elapsedSeconds: number) {
	const solution = flrwScaleFactorAt(flrwHubbleTime(params, elapsedSeconds), params);
	const hubblePerSecond = nonnegative(params.hubble) / MPC_KM;
	return {
		...solution,
		/** An explicit reference emission epoch, not an inferred source distance. */
		emittedScaleFactor: 1,
		redshift: solution.scaleFactor - 1,
		elapsedGyr: hubblePerSecond > 0 ? solution.hubbleTime / hubblePerSecond / SECONDS_PER_GYR : 0,
		omegaCurvature: flrwCurvatureDensity(params),
		curvature: flrwCurvatureSign(params)
	};
}
