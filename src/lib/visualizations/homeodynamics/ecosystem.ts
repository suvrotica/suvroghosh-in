import type {
	EcosystemSample,
	Intervention,
	InterventionFork,
	LotkaVolterraParameters
} from './types';

type EcosystemState = Pick<EcosystemSample, 'sharks' | 'tuna'>;

export const ECOSYSTEM_PRESET: LotkaVolterraParameters = {
	delta: 0.4,
	p: 0.03,
	beta: 0.6,
	q: 0.04,
	sharks0: 20,
	tuna0: 40,
	dt: 0.01,
	duration: 30
};

export type SharkOvershoot = {
	index: number;
	time: number;
	interventionSharks: number;
	baselineSharks: number;
	excess: number;
};

export function coexistencePoint(
	parameters: Pick<LotkaVolterraParameters, 'beta' | 'q' | 'delta' | 'p'>
): EcosystemState {
	return {
		sharks: parameters.beta / parameters.q,
		tuna: parameters.delta / parameters.p
	};
}

export function ecosystemDerivatives(
	state: EcosystemState,
	parameters: Pick<LotkaVolterraParameters, 'beta' | 'q' | 'delta' | 'p'>
): EcosystemState {
	return {
		tuna: state.tuna * (parameters.beta - parameters.q * state.sharks),
		sharks: state.sharks * (-parameters.delta + parameters.p * state.tuna)
	};
}

function addScaled(base: EcosystemState, slope: EcosystemState, scale: number): EcosystemState {
	return {
		tuna: base.tuna + scale * slope.tuna,
		sharks: base.sharks + scale * slope.sharks
	};
}

export function rk4EcosystemStep(
	state: EcosystemState,
	parameters: Pick<LotkaVolterraParameters, 'beta' | 'q' | 'delta' | 'p'>,
	dt: number
): EcosystemState {
	const k1 = ecosystemDerivatives(state, parameters);
	const k2 = ecosystemDerivatives(addScaled(state, k1, dt / 2), parameters);
	const k3 = ecosystemDerivatives(addScaled(state, k2, dt / 2), parameters);
	const k4 = ecosystemDerivatives(addScaled(state, k3, dt), parameters);
	return {
		tuna: state.tuna + (dt * (k1.tuna + 2 * k2.tuna + 2 * k3.tuna + k4.tuna)) / 6,
		sharks: state.sharks + (dt * (k1.sharks + 2 * k2.sharks + 2 * k3.sharks + k4.sharks)) / 6
	};
}

function validateEcosystemParameters(parameters: LotkaVolterraParameters): void {
	for (const [name, value] of Object.entries(parameters)) {
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive finite number`);
		}
	}
}

export function simulateEcosystem(parameters: LotkaVolterraParameters): EcosystemSample[] {
	validateEcosystemParameters(parameters);
	const stepCount = Math.round(parameters.duration / parameters.dt);
	const samples: EcosystemSample[] = [{ t: 0, tuna: parameters.tuna0, sharks: parameters.sharks0 }];
	let state: EcosystemState = { tuna: parameters.tuna0, sharks: parameters.sharks0 };

	for (let index = 0; index < stepCount; index += 1) {
		state = rk4EcosystemStep(state, parameters, parameters.dt);
		if (!Number.isFinite(state.tuna) || !Number.isFinite(state.sharks)) {
			throw new Error(`Lotka–Volterra solver produced a non-finite state at step ${index + 1}`);
		}
		if (state.tuna <= 0 || state.sharks <= 0) {
			throw new Error(`Lotka–Volterra solver produced a non-positive state at step ${index + 1}`);
		}
		samples.push({ t: (index + 1) * parameters.dt, ...state });
	}

	return samples;
}

export function forkEcosystemIntervention(
	parameters: LotkaVolterraParameters,
	intervention: Intervention,
	baselineInput?: readonly EcosystemSample[]
): InterventionFork {
	const baseline = (baselineInput ?? simulateEcosystem(parameters)).map((sample) => ({
		...sample
	}));
	const interventionIndex = Math.round(intervention.time / parameters.dt);
	if (interventionIndex < 0 || interventionIndex >= baseline.length) {
		throw new RangeError('intervention time falls outside the simulation');
	}
	if (!Number.isFinite(intervention.amount) || intervention.amount <= 0) {
		throw new RangeError('intervention amount must be positive and finite');
	}

	const source = baseline[interventionIndex];
	const available = intervention.kind === 'sharks' ? source.sharks : source.tuna;
	if (available <= intervention.amount) {
		throw new RangeError(`cannot remove ${intervention.amount}; only ${available} remain`);
	}

	const branchState: EcosystemState = { tuna: source.tuna, sharks: source.sharks };
	branchState[intervention.kind] -= intervention.amount;
	const branch = baseline.slice(0, interventionIndex).map((sample) => ({ ...sample }));
	branch.push({ t: source.t, ...branchState });

	let state = branchState;
	for (let index = interventionIndex; index < baseline.length - 1; index += 1) {
		state = rk4EcosystemStep(state, parameters, parameters.dt);
		if (!Number.isFinite(state.tuna) || !Number.isFinite(state.sharks)) {
			throw new Error(`Intervention branch produced a non-finite state at step ${index + 1}`);
		}
		branch.push({ t: baseline[index + 1].t, ...state });
	}

	return { baseline, intervention: branch, interventionIndex };
}

export function findFirstSharkOvershoot(
	fork: InterventionFork,
	tolerance = 0.05
): SharkOvershoot | null {
	for (let index = fork.interventionIndex + 1; index < fork.intervention.length - 1; index += 1) {
		const previous = fork.intervention[index - 1];
		const current = fork.intervention[index];
		const next = fork.intervention[index + 1];
		const baseline = fork.baseline[index];
		if (
			current.sharks > previous.sharks &&
			current.sharks >= next.sharks &&
			current.sharks > baseline.sharks + tolerance
		) {
			return {
				index,
				time: current.t,
				interventionSharks: current.sharks,
				baselineSharks: baseline.sharks,
				excess: current.sharks - baseline.sharks
			};
		}
	}
	return null;
}

export function lotkaVolterraInvariant(
	state: EcosystemState,
	parameters: Pick<LotkaVolterraParameters, 'p' | 'delta' | 'q' | 'beta'>
): number {
	if (state.tuna <= 0 || state.sharks <= 0) return Number.NaN;
	return (
		parameters.p * state.tuna -
		parameters.delta * Math.log(state.tuna) +
		parameters.q * state.sharks -
		parameters.beta * Math.log(state.sharks)
	);
}

export function downsampleEcosystem(
	samples: readonly EcosystemSample[],
	maximumPoints = 1_000
): EcosystemSample[] {
	if (samples.length <= maximumPoints) return samples.map((sample) => ({ ...sample }));
	const stride = Math.ceil(samples.length / maximumPoints);
	const output = samples
		.filter((_, index) => index % stride === 0)
		.map((sample) => ({ ...sample }));
	const finalSample = samples.at(-1)!;
	if (output.at(-1)?.t !== finalSample.t) output.push({ ...finalSample });
	return output;
}
