import { DEFAULT_TIMESTEP } from './integrators';
import {
	cloneState,
	type AtlasConfiguration,
	type PendulumConfiguration,
	type PendulumParameters,
	type PendulumPresetId,
	type PendulumState
} from './types';

export interface PendulumPreset {
	id: PendulumPresetId;
	label: string;
	description: string;
	state: PendulumState;
	parameters: PendulumParameters;
	timestep: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

export const DEFAULT_PARAMETERS: Readonly<PendulumParameters> = Object.freeze({
	m1: 1,
	m2: 1,
	l1: 1,
	l2: 1,
	g: 9.81
});

export const PENDULUM_PRESETS: readonly Readonly<PendulumPreset>[] = Object.freeze([
	{
		id: 'polite-oscillator',
		label: 'The Polite Oscillator',
		description: 'Small nearby angles produce restrained, almost regular motion.',
		state: { theta1: degrees(15), omega1: 0, theta2: degrees(12), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS },
		timestep: DEFAULT_TIMESTEP
	},
	{
		id: 'classic-chaos',
		label: 'Classic Chaos',
		description: 'A high-energy release whose nearby futures part after an observable delay.',
		state: { theta1: degrees(120), omega1: 0, theta2: degrees(-10), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS },
		timestep: DEFAULT_TIMESTEP
	},
	{
		id: 'over-the-top',
		label: 'Over the Top',
		description: 'A near-inverted release with an added push encourages full rotations.',
		state: { theta1: degrees(170), omega1: 0.8, theta2: degrees(95), omega2: -0.35 },
		parameters: { ...DEFAULT_PARAMETERS },
		timestep: 1 / 360
	},
	{
		id: 'heavy-passenger',
		label: 'Heavy Passenger',
		description: 'A much heavier lower mass makes the coupling visibly lopsided.',
		state: { theta1: degrees(110), omega1: 0, theta2: degrees(-20), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS, m1: 0.7, m2: 3.2 },
		timestep: 1 / 360
	},
	{
		id: 'moon-workshop',
		label: 'Moon Workshop',
		description: 'Lunar gravity stretches the same deterministic argument over a slower clock.',
		state: { theta1: degrees(135), omega1: 0, theta2: degrees(-15), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS, g: 1.62 },
		timestep: DEFAULT_TIMESTEP
	},
	{
		id: 'knife-edge',
		label: 'Knife Edge',
		description: 'A finely balanced high-energy release near a qualitative change in motion.',
		state: { theta1: degrees(179.2), omega1: 0, theta2: degrees(0.6), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS, l2: 0.82 },
		timestep: 1 / 480
	},
	{
		id: 'custom',
		label: 'Make Your Own',
		description: 'Preserves the values currently on the instrument.',
		state: { theta1: degrees(120), omega1: 0, theta2: degrees(-10), omega2: 0 },
		parameters: { ...DEFAULT_PARAMETERS },
		timestep: DEFAULT_TIMESTEP
	}
]);

export const DEFAULT_PRESET_ID: PendulumPresetId = 'classic-chaos';

const PRESET_BY_ID = new Map(PENDULUM_PRESETS.map((preset) => [preset.id, preset]));

export function isPresetId(value: unknown): value is PendulumPresetId {
	return typeof value === 'string' && PRESET_BY_ID.has(value as PendulumPresetId);
}

export function getPreset(id: PendulumPresetId = DEFAULT_PRESET_ID): Readonly<PendulumPreset> {
	return PRESET_BY_ID.get(id) ?? PRESET_BY_ID.get(DEFAULT_PRESET_ID)!;
}

export function createDefaultAtlasConfiguration(): AtlasConfiguration {
	return {
		theta1Min: -Math.PI,
		theta1Max: Math.PI,
		theta2Min: -Math.PI,
		theta2Max: Math.PI,
		resolution: 144,
		fixedOmega1: 0,
		fixedOmega2: 0,
		perturbationDimension: 'theta1',
		perturbationMagnitude: 1e-7,
		divergenceThreshold: 0.1,
		timeCap: 10,
		timestep: 1 / 120
	};
}

export function configurationFromPreset(
	id: PendulumPresetId = DEFAULT_PRESET_ID
): PendulumConfiguration {
	const preset = getPreset(id);
	return {
		mode: 'lab',
		preset: preset.id,
		initialState: cloneState(preset.state),
		parameters: { ...preset.parameters },
		integrator: 'rk4',
		timestep: preset.timestep,
		speed: 1,
		trailLength: 2_400,
		perturbationDimension: 'theta1',
		perturbationMagnitude: 1e-7,
		atlas: createDefaultAtlasConfiguration()
	};
}

export function createDefaultConfiguration(): PendulumConfiguration {
	return configurationFromPreset(DEFAULT_PRESET_ID);
}

export function applyPreset(
	configuration: Readonly<PendulumConfiguration>,
	id: PendulumPresetId
): PendulumConfiguration {
	if (id === 'custom') {
		return {
			...configuration,
			preset: 'custom',
			initialState: cloneState(configuration.initialState),
			parameters: { ...configuration.parameters },
			atlas: { ...configuration.atlas }
		};
	}
	const preset = getPreset(id);
	return {
		...configuration,
		preset: preset.id,
		initialState: cloneState(preset.state),
		parameters: { ...preset.parameters },
		timestep: preset.timestep,
		atlas: {
			...configuration.atlas,
			fixedOmega1: preset.state.omega1,
			fixedOmega2: preset.state.omega2,
			selectedTheta1: undefined,
			selectedTheta2: undefined
		}
	};
}
