import type { InitialCondition, ProcessId, ProcessModel, Vector2 } from './types';
import {
	ActiveBrownianModel,
	activeBrownianTheory,
	type ActiveBrownianParameters
} from './models/active-brownian';
import {
	AnisotropicDiffusionModel,
	anisotropicDiffusionTheory,
	type AnisotropicDiffusionParameters
} from './models/anisotropic-diffusion';
import {
	BrownianBridgeModel,
	brownianBridgeTheory,
	type BrownianBridgeParameters
} from './models/brownian-bridge';
import {
	DriftDiffusionModel,
	driftDiffusionTheory,
	type DriftDiffusionParameters
} from './models/drift-diffusion';
import {
	FirstPassageModel,
	firstPassageDensity,
	firstPassageSurvival,
	type FirstPassageParameters
} from './models/first-passage';
import {
	FreeBrownianModel,
	freeBrownianTheory,
	type FreeBrownianParameters
} from './models/free-brownian';
import {
	GeometricBrownianModel,
	geometricBrownianTheory,
	type GeometricBrownianParameters
} from './models/geometric-brownian';
import { LevyFlightModel, levyFlightTheory, type LevyFlightParameters } from './models/levy-flight';
import {
	OrnsteinUhlenbeckModel,
	ornsteinUhlenbeckTheory,
	type OrnsteinUhlenbeckParameters
} from './models/ornstein-uhlenbeck';
import {
	PotentialDiffusionModel,
	potentialResolutionAdvice,
	type PotentialDiffusionParameters
} from './models/potential-diffusion';
import { RandomWalkModel, randomWalkTheory, type RandomWalkParameters } from './models/random-walk';
import {
	UnderdampedLangevinModel,
	underdampedLangevinTheory,
	type UnderdampedLangevinParameters
} from './models/underdamped-langevin';

export interface FractionalBrownianParameters {
	readonly hurst: number;
	readonly scale: number;
	readonly duration: number;
	readonly points: number;
	readonly trajectories: number;
}

export interface ProcessParameterMap {
	readonly 'random-walk': RandomWalkParameters;
	readonly 'free-brownian': FreeBrownianParameters;
	readonly 'drift-diffusion': DriftDiffusionParameters;
	readonly 'anisotropic-diffusion': AnisotropicDiffusionParameters;
	readonly 'ornstein-uhlenbeck': OrnsteinUhlenbeckParameters;
	readonly 'underdamped-langevin': UnderdampedLangevinParameters;
	readonly 'potential-diffusion': PotentialDiffusionParameters;
	readonly 'active-brownian': ActiveBrownianParameters;
	readonly 'brownian-bridge': BrownianBridgeParameters;
	readonly 'fractional-brownian': FractionalBrownianParameters;
	readonly 'geometric-brownian': GeometricBrownianParameters;
	readonly 'levy-flight': LevyFlightParameters;
	readonly 'first-passage': FirstPassageParameters;
}

export type RuntimeProcessId = Exclude<ProcessId, 'fractional-brownian'>;

export type DiagnosticId =
	| 'trajectory'
	| 'density'
	| 'position-distribution'
	| 'mean-square-displacement'
	| 'local-diffusion-exponent'
	| 'increment-distribution'
	| 'increment-autocorrelation'
	| 'position-autocorrelation'
	| 'velocity-distribution'
	| 'velocity-autocorrelation'
	| 'phase-space'
	| 'potential-energy'
	| 'well-occupancy'
	| 'first-passage-survival'
	| 'arrival-time-distribution'
	| 'robust-displacement'
	| 'log-value-distribution';

export interface TheoryRequest {
	readonly time: number;
	readonly initialCondition?: InitialCondition;
}

export interface TheoryPrediction {
	readonly mean?: Vector2;
	readonly variance?: Vector2;
	readonly covarianceXY?: number;
	readonly meanSquareDisplacement?: number;
	readonly survivalProbability?: number;
	readonly firstPassageDensity?: number;
	readonly finiteMeanSquareDisplacement: boolean;
	readonly notes?: readonly string[];
	readonly scalars?: Readonly<Record<string, number | null>>;
}

export interface ValidationIssue {
	readonly severity: 'error' | 'caution';
	readonly message: string;
}

export interface ParameterOption {
	readonly label: string;
	readonly value: string | number | boolean;
}

export interface ParameterControl<Parameters extends object> {
	readonly key: Extract<keyof Parameters, string>;
	readonly label: string;
	readonly kind: 'number' | 'integer' | 'angle' | 'boolean' | 'select' | 'obstacles';
	readonly unit?: string;
	readonly minimum?: number;
	readonly maximum?: number;
	readonly step?: number;
	readonly options?: readonly ParameterOption[];
}

export interface BaseModelDefinition<Parameters extends object> {
	readonly id: ProcessId;
	readonly label: string;
	readonly category:
		| 'core'
		| 'conditioned'
		| 'correlated'
		| 'active'
		| 'mathematical-cousin'
		| 'arrival';
	readonly dimensions: 1 | 2 | 'selectable';
	readonly description: string;
	readonly plainInterpretation: string;
	readonly equation: { readonly plain: string; readonly latex: string };
	readonly whatToWatch: string;
	readonly compatibleDiagnostics: readonly DiagnosticId[];
	readonly controls: readonly ParameterControl<Parameters>[];
	readonly defaultParameters: Readonly<Parameters>;
	readonly theory?: (parameters: Parameters, request: TheoryRequest) => TheoryPrediction;
	readonly validate: (parameters: Parameters, timestep?: number) => readonly ValidationIssue[];
}

export interface SteppableModelDefinition<
	Parameters extends object
> extends BaseModelDefinition<Parameters> {
	readonly trajectoryGenerator?: false;
	readonly create: (parameters: Parameters) => ProcessModel<Parameters>;
}

export interface TrajectoryGeneratorDefinition<
	Parameters extends object
> extends BaseModelDefinition<Parameters> {
	readonly trajectoryGenerator: true;
	/** Attached by the worker-backed fractional-path subsystem, never faked here. */
	readonly create?: never;
}

export type ModelDefinitionFor<Id extends ProcessId> = Id extends 'fractional-brownian'
	? TrajectoryGeneratorDefinition<ProcessParameterMap[Id]>
	: SteppableModelDefinition<ProcessParameterMap[Id]>;

export type ModelRegistry = { readonly [Id in ProcessId]: ModelDefinitionFor<Id> };

function validateByConstruction<Parameters extends object>(
	parameters: Parameters,
	construct: (parameters: Parameters) => unknown
): readonly ValidationIssue[] {
	try {
		construct(parameters);
		return [];
	} catch (error) {
		return [
			{
				severity: 'error',
				message: error instanceof Error ? error.message : 'The model parameters are invalid.'
			}
		];
	}
}

function validateFractional(parameters: FractionalBrownianParameters): readonly ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	if (!Number.isFinite(parameters.hurst) || parameters.hurst <= 0 || parameters.hurst >= 1) {
		issues.push({
			severity: 'error',
			message: 'Hurst exponent H must lie strictly between 0 and 1.'
		});
	}
	if (!Number.isFinite(parameters.scale) || parameters.scale <= 0) {
		issues.push({ severity: 'error', message: 'Fractional Brownian scale must be positive.' });
	}
	if (!Number.isFinite(parameters.duration) || parameters.duration <= 0) {
		issues.push({ severity: 'error', message: 'Fractional Brownian duration must be positive.' });
	}
	if (!Number.isSafeInteger(parameters.points) || parameters.points < 2) {
		issues.push({
			severity: 'error',
			message: 'Fractional Brownian paths need at least two points.'
		});
	}
	if (!Number.isSafeInteger(parameters.trajectories) || parameters.trajectories < 1) {
		issues.push({ severity: 'error', message: 'Trajectory count must be a positive integer.' });
	}
	return issues;
}

const initial = (request: TheoryRequest): InitialCondition =>
	request.initialCondition ?? { x: 0, y: 0, spread: 0 };

function theoryTime(request: TheoryRequest): number {
	if (!Number.isFinite(request.time) || request.time < 0) {
		throw new RangeError('Theory time must be finite and non-negative.');
	}
	return request.time;
}

export const MODEL_REGISTRY: ModelRegistry = {
	'random-walk': {
		id: 'random-walk',
		label: 'Discrete random walk',
		category: 'core',
		dimensions: 'selectable',
		description:
			'Fixed microscopic steps reveal how Brownian scaling emerges in a continuum limit.',
		plainInterpretation: 'A walker repeatedly chooses a new lattice direction or isotropic angle.',
		equation: { plain: 'D = l^2 / (2 d tau)', latex: 'D=\\ell^2/(2d\\tau)' },
		whatToWatch:
			'Shrink length and time together: the path looks smoother while its large-scale spread stays fixed.',
		compatibleDiagnostics: ['trajectory', 'position-distribution', 'mean-square-displacement'],
		controls: [
			{
				key: 'dimensions',
				label: 'Dimensions',
				kind: 'select',
				options: [
					{ label: '1D', value: 1 },
					{ label: '2D', value: 2 }
				]
			},
			{
				key: 'geometry',
				label: 'Step geometry',
				kind: 'select',
				options: [
					{ label: 'Square lattice', value: 'lattice' },
					{ label: 'Isotropic angle', value: 'isotropic' }
				]
			},
			{
				key: 'stepLength',
				label: 'Step length',
				kind: 'number',
				minimum: 0.001,
				unit: 'world units'
			},
			{ key: 'timePerStep', label: 'Time per step', kind: 'number', minimum: 0.000001, unit: 's' },
			{ key: 'coarseGraining', label: 'Coarse-graining', kind: 'integer', minimum: 1 }
		],
		defaultParameters: {
			dimensions: 2,
			geometry: 'lattice',
			stepLength: 0.4,
			timePerStep: 0.04,
			coarseGraining: 1
		},
		create: (parameters) => new RandomWalkModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new RandomWalkModel(value)),
		theory: (parameters, request) => {
			const prediction = randomWalkTheory(parameters, request.time);
			const initialVariance = initial(request).spread ** 2;
			return {
				variance: {
					x: initialVariance + prediction.variancePerAxis,
					y: parameters.dimensions === 2 ? initialVariance + prediction.variancePerAxis : 0
				},
				meanSquareDisplacement: prediction.msd,
				finiteMeanSquareDisplacement: true,
				scalars: { diffusion: prediction.diffusion }
			};
		}
	},
	'free-brownian': {
		id: 'free-brownian',
		label: 'Free Brownian diffusion',
		category: 'core',
		dimensions: 2,
		description: 'Independent Gaussian increments spread an overdamped particle cloud.',
		plainInterpretation:
			'There is no preferred direction, but the ensemble width follows an exact law.',
		equation: { plain: 'dX = sqrt(2D) dW', latex: 'd\\mathbf{x}=\\sqrt{2D}\\,d\\mathbf{W}' },
		whatToWatch: 'Cloud width grows like the square root of time while radial MSD grows as 4Dt.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'mean-square-displacement',
			'increment-distribution'
		],
		controls: [
			{
				key: 'diffusion',
				label: 'Diffusion coefficient',
				kind: 'number',
				minimum: 0,
				unit: 'unit²/s'
			}
		],
		defaultParameters: { diffusion: 0.7 },
		create: (parameters) => new FreeBrownianModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new FreeBrownianModel(value)),
		theory: (parameters, request) => {
			const prediction = freeBrownianTheory(parameters, request.time);
			const start = initial(request);
			return {
				mean: { x: start.x, y: start.y },
				variance: {
					x: start.spread ** 2 + prediction.varianceX,
					y: start.spread ** 2 + prediction.varianceY
				},
				meanSquareDisplacement: prediction.msd,
				finiteMeanSquareDisplacement: true
			};
		}
	},
	'drift-diffusion': {
		id: 'drift-diffusion',
		label: 'Drift–diffusion',
		category: 'core',
		dimensions: 2,
		description: 'A constant current translates the mean while Brownian noise broadens the cloud.',
		plainInterpretation:
			'The crowd travels together, but its random width is the same as in still fluid.',
		equation: {
			plain: 'dX = v dt + sqrt(2D) dW',
			latex: 'd\\mathbf{x}=\\mathbf{v}dt+\\sqrt{2D}\\,d\\mathbf{W}'
		},
		whatToWatch: 'Switch to the co-moving frame: drift disappears but diffusion remains.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'mean-square-displacement',
			'increment-distribution'
		],
		controls: [
			{ key: 'diffusion', label: 'Diffusion coefficient', kind: 'number', minimum: 0 },
			{ key: 'driftX', label: 'Horizontal drift', kind: 'number', unit: 'unit/s' },
			{ key: 'driftY', label: 'Vertical drift', kind: 'number', unit: 'unit/s' }
		],
		defaultParameters: { diffusion: 0.45, driftX: 0.8, driftY: 0.25 },
		create: (parameters) => new DriftDiffusionModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new DriftDiffusionModel(value)),
		theory: (parameters, request) => {
			const start = initial(request);
			const prediction = driftDiffusionTheory(parameters, request.time, start.x, start.y);
			return {
				mean: { x: prediction.meanX, y: prediction.meanY },
				variance: {
					x: start.spread ** 2 + prediction.varianceX,
					y: start.spread ** 2 + prediction.varianceY
				},
				meanSquareDisplacement: prediction.msdAboutOrigin,
				finiteMeanSquareDisplacement: true
			};
		}
	},
	'anisotropic-diffusion': {
		id: 'anisotropic-diffusion',
		label: 'Anisotropic diffusion',
		category: 'core',
		dimensions: 2,
		description:
			'A rotated positive-definite diffusion tensor stretches the cloud into an ellipse.',
		plainInterpretation:
			'Microscopic motion is easier along one material direction than the other.',
		equation: {
			plain: 'dX = sqrt(2) R diag(sqrt(D1),sqrt(D2)) dW',
			latex:
				'd\\mathbf{x}=\\sqrt{2}R(\\theta)\\operatorname{diag}(\\sqrt{D_1},\\sqrt{D_2})d\\mathbf{W}'
		},
		whatToWatch:
			'The covariance ellipse rotates with the material axes rather than the screen axes.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'mean-square-displacement'
		],
		controls: [
			{ key: 'majorDiffusion', label: 'Major-axis diffusion', kind: 'number', minimum: 0.000001 },
			{ key: 'minorDiffusion', label: 'Minor-axis diffusion', kind: 'number', minimum: 0.000001 },
			{ key: 'angle', label: 'Axis angle', kind: 'angle', unit: 'rad' }
		],
		defaultParameters: { majorDiffusion: 1.1, minorDiffusion: 0.16, angle: Math.PI / 6 },
		create: (parameters) => new AnisotropicDiffusionModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new AnisotropicDiffusionModel(value)),
		theory: (parameters, request) => {
			const prediction = anisotropicDiffusionTheory(parameters, request.time);
			const initialVariance = initial(request).spread ** 2;
			return {
				variance: {
					x: initialVariance + prediction.covarianceXX,
					y: initialVariance + prediction.covarianceYY
				},
				covarianceXY: prediction.covarianceXY,
				meanSquareDisplacement: prediction.msd,
				finiteMeanSquareDisplacement: true
			};
		}
	},
	'ornstein-uhlenbeck': {
		id: 'ornstein-uhlenbeck',
		label: 'Harmonic trap (OU)',
		category: 'core',
		dimensions: 2,
		description:
			'Linear restoring drift competes with thermal diffusion around a movable equilibrium.',
		plainInterpretation:
			'The farther the particle strays, the more strongly the idealized trap pulls it back.',
		equation: {
			plain: 'dX = -lambda(X-m)dt + sqrt(2D)dW',
			latex: 'd\\mathbf{x}=-\\lambda(\\mathbf{x}-\\mathbf{m})dt+\\sqrt{2D}d\\mathbf{W}'
		},
		whatToWatch: 'The mean relaxes exponentially and the variance saturates at D/lambda.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'mean-square-displacement',
			'position-autocorrelation'
		],
		controls: [
			{
				key: 'restoringRate',
				label: 'Restoring rate',
				kind: 'number',
				minimum: 0.000001,
				unit: '1/s'
			},
			{ key: 'diffusion', label: 'Diffusion coefficient', kind: 'number', minimum: 0 },
			{ key: 'equilibriumX', label: 'Trap centre x', kind: 'number' },
			{ key: 'equilibriumY', label: 'Trap centre y', kind: 'number' }
		],
		defaultParameters: { restoringRate: 1.2, diffusion: 0.55, equilibriumX: 0, equilibriumY: 0 },
		create: (parameters) => new OrnsteinUhlenbeckModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new OrnsteinUhlenbeckModel(value)),
		theory: (parameters, request) => {
			const start = initial(request);
			const prediction = ornsteinUhlenbeckTheory(parameters, request.time, start.x, start.y);
			const survivingInitialVariance =
				start.spread ** 2 * Math.exp(-2 * parameters.restoringRate * request.time);
			return {
				mean: { x: prediction.meanX, y: prediction.meanY },
				variance: {
					x: survivingInitialVariance + prediction.varianceX,
					y: survivingInitialVariance + prediction.varianceY
				},
				finiteMeanSquareDisplacement: true,
				scalars: {
					stationaryVariance: prediction.stationaryVariance,
					relaxationTime: prediction.relaxationTime
				}
			};
		}
	},
	'underdamped-langevin': {
		id: 'underdamped-langevin',
		label: 'Underdamped Langevin',
		category: 'core',
		dimensions: 2,
		description: 'Inertia preserves velocity briefly before drag and thermal forcing randomize it.',
		plainInterpretation:
			'A particle first travels almost straight, then forgets its velocity and diffuses.',
		equation: {
			plain: 'm dV = -gamma V dt + F dt + sqrt(2 gamma kBT) dW',
			latex:
				'm\\,d\\mathbf{v}=-\\gamma\\mathbf{v}dt+\\mathbf{F}dt+\\sqrt{2\\gamma k_BT}\\,d\\mathbf{W}'
		},
		whatToWatch: 'MSD crosses from a short-time t² law to a long-time t law.',
		compatibleDiagnostics: [
			'trajectory',
			'mean-square-displacement',
			'local-diffusion-exponent',
			'velocity-distribution',
			'velocity-autocorrelation',
			'phase-space'
		],
		controls: [
			{ key: 'mass', label: 'Mass', kind: 'number', minimum: 0.000001 },
			{ key: 'drag', label: 'Drag', kind: 'number', minimum: 0.000001 },
			{ key: 'thermalEnergy', label: 'Thermal energy kBT', kind: 'number', minimum: 0 },
			{ key: 'forceX', label: 'Horizontal force', kind: 'number' },
			{ key: 'forceY', label: 'Vertical force', kind: 'number' },
			{
				key: 'initialVelocity',
				label: 'Initial velocity',
				kind: 'select',
				options: [
					{ label: 'Equilibrium', value: 'equilibrium' },
					{ label: 'Zero', value: 'zero' }
				]
			}
		],
		defaultParameters: {
			mass: 1,
			drag: 2,
			thermalEnergy: 1,
			forceX: 0,
			forceY: 0,
			initialVelocity: 'equilibrium'
		},
		create: (parameters) => new UnderdampedLangevinModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new UnderdampedLangevinModel(value)),
		theory: (parameters, request) => {
			const prediction = underdampedLangevinTheory(parameters, request.time);
			return {
				meanSquareDisplacement: prediction.msd,
				finiteMeanSquareDisplacement: true,
				notes:
					parameters.forceX === 0 && parameters.forceY === 0
						? ['The displayed MSD theory is the free, force-free equilibrium curve.']
						: [
								'The ballistic-to-diffusive MSD curve excludes deterministic displacement from the selected constant force.'
							],
				scalars: {
					relaxationTime: prediction.relaxationTime,
					longTimeDiffusion: prediction.longTimeDiffusion,
					velocityVariance: prediction.velocityVariancePerAxis,
					velocityAutocorrelation: prediction.velocityAutocorrelationPerAxis
				}
			};
		}
	},
	'potential-diffusion': {
		id: 'potential-diffusion',
		label: 'Diffusion in a potential',
		category: 'core',
		dimensions: 2,
		description:
			'Overdamped thermal motion explores harmonic, double-well, corrugated, or tilted landscapes.',
		plainInterpretation: 'Noise pushes uphill occasionally; deterministic drift pulls downhill.',
		equation: {
			plain: 'dX = -mobility grad(U) dt + sqrt(2 mobility kBT) dW',
			latex: 'd\\mathbf{x}=-\\mu\\nabla U(\\mathbf{x})dt+\\sqrt{2\\mu k_BT}d\\mathbf{W}'
		},
		whatToWatch:
			'Barrier height relative to kBT controls whether well-to-well hops are rare or frequent.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'potential-energy',
			'well-occupancy'
		],
		controls: [
			{
				key: 'landscape',
				label: 'Landscape',
				kind: 'select',
				options: [
					{ label: 'Harmonic', value: 'harmonic' },
					{ label: 'Double well', value: 'double-well' },
					{ label: 'Periodic', value: 'periodic' },
					{ label: 'Tilted periodic', value: 'tilted-periodic' }
				]
			},
			{ key: 'mobility', label: 'Mobility', kind: 'number', minimum: 0.000001 },
			{ key: 'thermalEnergy', label: 'Thermal energy kBT', kind: 'number', minimum: 0 },
			{ key: 'stiffness', label: 'Harmonic stiffness', kind: 'number', minimum: 0 },
			{
				key: 'transverseStiffness',
				label: 'Transverse stiffness',
				kind: 'number',
				minimum: 0
			},
			{ key: 'barrierHeight', label: 'Barrier height', kind: 'number', minimum: 0 },
			{ key: 'wellSeparation', label: 'Well separation', kind: 'number', minimum: 0.000001 },
			{ key: 'period', label: 'Corrugation period', kind: 'number', minimum: 0.000001 },
			{ key: 'tilt', label: 'External tilt', kind: 'number' },
			{ key: 'obstacles', label: 'Excluded circles', kind: 'obstacles' }
		],
		defaultParameters: {
			landscape: 'double-well',
			mobility: 0.8,
			thermalEnergy: 0.65,
			centerX: 0,
			centerY: 0,
			stiffness: 1,
			transverseStiffness: 1.5,
			barrierHeight: 2.5,
			wellSeparation: 2,
			period: 2.5,
			tilt: 0,
			obstacles: []
		},
		create: (parameters) => new PotentialDiffusionModel(parameters),
		validate: (parameters, timestep) => {
			const issues = [
				...validateByConstruction(parameters, (value) => new PotentialDiffusionModel(value))
			];
			if (issues.length === 0 && timestep !== undefined) {
				const advice = potentialResolutionAdvice(parameters, timestep);
				if (advice.status !== 'good')
					issues.push({
						severity: advice.status === 'unsafe' ? 'error' : 'caution',
						message: advice.message
					});
			}
			return issues;
		},
		theory: () => ({
			finiteMeanSquareDisplacement: true,
			notes: [
				'At equilibrium the position density is proportional to exp[-U/(kBT)]. A static asymmetric landscape alone does not create a directed equilibrium ratchet current.'
			]
		})
	},
	'active-brownian': {
		id: 'active-brownian',
		label: 'Active Brownian particle',
		category: 'active',
		dimensions: 2,
		description:
			'An idealized microswimmer propels itself while rotational diffusion randomizes its heading.',
		plainInterpretation:
			'Short paths remember a heading; long paths look diffusive after that memory fades.',
		equation: {
			plain: 'dX = v0 u(theta)dt + sqrt(2D)dW; dtheta = sqrt(2Dr)dW',
			latex:
				'd\\mathbf{x}=v_0\\mathbf{u}(\\theta)dt+\\sqrt{2D}d\\mathbf{W},\\quad d\\theta=\\sqrt{2D_r}dW'
		},
		whatToWatch: 'Persistence length v0/Dr controls the straight-looking portion of a trajectory.',
		compatibleDiagnostics: [
			'trajectory',
			'mean-square-displacement',
			'local-diffusion-exponent',
			'increment-autocorrelation'
		],
		controls: [
			{ key: 'propulsionSpeed', label: 'Propulsion speed', kind: 'number', minimum: 0 },
			{
				key: 'translationalDiffusion',
				label: 'Translational diffusion',
				kind: 'number',
				minimum: 0
			},
			{ key: 'rotationalDiffusion', label: 'Rotational diffusion', kind: 'number', minimum: 0 },
			{ key: 'obstacles', label: 'Excluded circles', kind: 'obstacles' }
		],
		defaultParameters: {
			propulsionSpeed: 1.8,
			translationalDiffusion: 0.12,
			rotationalDiffusion: 0.7,
			obstacles: []
		},
		create: (parameters) => new ActiveBrownianModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new ActiveBrownianModel(value)),
		theory: (parameters, request) => {
			const prediction = activeBrownianTheory(parameters, request.time);
			return {
				meanSquareDisplacement: prediction.msd,
				finiteMeanSquareDisplacement: true,
				scalars: {
					effectiveDiffusion: prediction.effectiveDiffusion,
					persistenceTime: prediction.persistenceTime,
					persistenceLength: prediction.persistenceLength
				}
			};
		}
	},
	'brownian-bridge': {
		id: 'brownian-bridge',
		label: 'Brownian bridge',
		category: 'conditioned',
		dimensions: 2,
		description: 'Brownian motion conditioned to arrive at an exact endpoint at an appointed time.',
		plainInterpretation: 'The middle remains random even though both ends are fixed.',
		equation: {
			plain: 'a + (b-a)t/T + sqrt(2D)[W(t)-tW(T)/T]',
			latex:
				'\\mathbf{a}+(\\mathbf{b}-\\mathbf{a})t/T+\\sqrt{2D}[\\mathbf{W}(t)-(t/T)\\mathbf{W}(T)]'
		},
		whatToWatch:
			'The variance envelope is widest in the middle and pinches to zero at both endpoints.',
		compatibleDiagnostics: [
			'trajectory',
			'density',
			'position-distribution',
			'mean-square-displacement'
		],
		controls: [
			{ key: 'diffusion', label: 'Diffusion coefficient', kind: 'number', minimum: 0 },
			{ key: 'duration', label: 'Bridge duration', kind: 'number', minimum: 0.000001, unit: 's' },
			{ key: 'startX', label: 'Start x', kind: 'number' },
			{ key: 'startY', label: 'Start y', kind: 'number' },
			{ key: 'endX', label: 'End x', kind: 'number' },
			{ key: 'endY', label: 'End y', kind: 'number' }
		],
		defaultParameters: { diffusion: 0.8, startX: -3, startY: 0, endX: 3, endY: 0, duration: 4 },
		create: (parameters) => new BrownianBridgeModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new BrownianBridgeModel(value)),
		theory: (parameters, request) => {
			const prediction = brownianBridgeTheory(
				parameters,
				Math.min(request.time, parameters.duration)
			);
			return {
				mean: { x: prediction.meanX, y: prediction.meanY },
				variance: { x: prediction.varianceX, y: prediction.varianceY },
				finiteMeanSquareDisplacement: true
			};
		}
	},
	'fractional-brownian': {
		id: 'fractional-brownian',
		label: 'Fractional Brownian motion',
		category: 'correlated',
		dimensions: 2,
		description:
			'A non-Markovian Gaussian trajectory generator with correlated increments and Hurst exponent H.',
		plainInterpretation:
			'Past increments bias future increments to reverse, forget, or persist depending on H.',
		equation: {
			plain: 'E[(BH(t)-BH(s))^2] proportional to |t-s|^(2H)',
			latex: '\\mathbb{E}[(B_H(t)-B_H(s))^2]\\propto|t-s|^{2H}'
		},
		whatToWatch:
			'H below one half is antipersistent; H above one half is persistent; only H=1/2 has independent increments.',
		compatibleDiagnostics: [
			'trajectory',
			'mean-square-displacement',
			'local-diffusion-exponent',
			'increment-autocorrelation'
		],
		controls: [
			{
				key: 'hurst',
				label: 'Hurst exponent',
				kind: 'number',
				minimum: 0.05,
				maximum: 0.95,
				step: 0.01
			},
			{ key: 'scale', label: 'Scale', kind: 'number', minimum: 0.000001 },
			{ key: 'duration', label: 'Duration', kind: 'number', minimum: 0.000001 },
			{ key: 'points', label: 'Path points', kind: 'integer', minimum: 2 },
			{ key: 'trajectories', label: 'Trajectories', kind: 'integer', minimum: 1 }
		],
		defaultParameters: { hurst: 0.72, scale: 1, duration: 8, points: 1025, trajectories: 1 },
		trajectoryGenerator: true,
		validate: validateFractional,
		theory: (parameters, request) => {
			const time = theoryTime(request);
			return {
				meanSquareDisplacement: parameters.scale ** 2 * time ** (2 * parameters.hurst),
				finiteMeanSquareDisplacement: true,
				scalars: { msdExponent: 2 * parameters.hurst },
				notes: [
					'This mode generates a correlated path as a whole; it is not stepped as a Markov process.'
				]
			};
		}
	},
	'geometric-brownian': {
		id: 'geometric-brownian',
		label: 'Geometric Brownian motion',
		category: 'mathematical-cousin',
		dimensions: 1,
		description:
			'Multiplicative lognormal noise models positive growth, not a pollen-grain trajectory.',
		plainInterpretation:
			'Random changes scale with the current value, so paths stay positive and fan out asymmetrically.',
		equation: {
			plain: 'S(t+dt)=S exp[(mu-sigma^2/2)dt + sigma sqrt(dt) xi]',
			latex: 'S_{t+\\Delta t}=S_t\\exp[(\\mu-\\sigma^2/2)\\Delta t+\\sigma\\sqrt{\\Delta t}\\,\\xi]'
		},
		whatToWatch: 'The median and mean separate because the final distribution is lognormal.',
		compatibleDiagnostics: ['trajectory', 'position-distribution', 'log-value-distribution'],
		controls: [
			{ key: 'initialValue', label: 'Initial value', kind: 'number', minimum: 0.000001 },
			{ key: 'growthRate', label: 'Growth rate', kind: 'number' },
			{ key: 'volatility', label: 'Volatility', kind: 'number', minimum: 0 }
		],
		defaultParameters: { initialValue: 1, growthRate: 0.08, volatility: 0.35 },
		create: (parameters) => new GeometricBrownianModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new GeometricBrownianModel(value)),
		theory: (parameters, request) => {
			const prediction = geometricBrownianTheory(parameters, request.time);
			return {
				mean: { x: prediction.mean, y: 0 },
				variance: { x: prediction.variance, y: 0 },
				finiteMeanSquareDisplacement: true,
				scalars: {
					median: prediction.median,
					logMean: prediction.logMean,
					logVariance: prediction.logVariance
				}
			};
		}
	},
	'levy-flight': {
		id: 'levy-flight',
		label: 'Lévy flight',
		category: 'mathematical-cousin',
		dimensions: 'selectable',
		description:
			'Symmetric stable increments create mostly local moves punctuated by enormous jumps.',
		plainInterpretation:
			'Heavy tails make rare jumps much more important than they are in Gaussian diffusion.',
		equation: {
			plain: 'characteristic function exp(-|scale k|^alpha dt)',
			latex: '\\varphi(k)=\\exp[-t|c k|^\\alpha]'
		},
		whatToWatch:
			'For alpha below two, ordinary variance and MSD are undefined; use robust displacement summaries.',
		compatibleDiagnostics: ['trajectory', 'increment-distribution', 'robust-displacement'],
		controls: [
			{
				key: 'dimensions',
				label: 'Dimensions',
				kind: 'select',
				options: [
					{ label: '1D', value: 1 },
					{ label: '2D', value: 2 }
				]
			},
			{
				key: 'stability',
				label: 'Stability alpha',
				kind: 'number',
				minimum: 0.05,
				maximum: 2,
				step: 0.01
			},
			{ key: 'scale', label: 'Stable scale', kind: 'number', minimum: 0.000001 }
		],
		defaultParameters: { dimensions: 2, stability: 1.45, scale: 0.45 },
		create: (parameters) => new LevyFlightModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new LevyFlightModel(value)),
		theory: (parameters, request) => {
			const prediction = levyFlightTheory(parameters);
			const time = theoryTime(request);
			return {
				finiteMeanSquareDisplacement: prediction.finiteVariance,
				meanSquareDisplacement:
					prediction.gaussianMsdRate === null ? undefined : prediction.gaussianMsdRate * time,
				scalars: { selfSimilarityExponent: prediction.scalingExponent },
				notes: prediction.finiteVariance
					? ['At alpha=2 the stable law is Gaussian.']
					: ['No normal-diffusion MSD overlay is valid because the second moment diverges.']
			};
		}
	},
	'first-passage': {
		id: 'first-passage',
		label: 'First passage to a wall',
		category: 'arrival',
		dimensions: 1,
		description:
			'One-dimensional Brownian particles disappear when they first reach an absorbing wall.',
		plainInterpretation:
			'The experiment asks when each particle arrives, not where it is at a chosen time.',
		equation: {
			plain: 'S(t)=erf[x0/sqrt(4Dt)]',
			latex: 'S(t)=\\operatorname{erf}(x_0/\\sqrt{4Dt})'
		},
		whatToWatch:
			'The long tail leaves a slowly shrinking population of survivors far from the wall.',
		compatibleDiagnostics: ['trajectory', 'first-passage-survival', 'arrival-time-distribution'],
		controls: [
			{ key: 'diffusion', label: 'Diffusion coefficient', kind: 'number', minimum: 0 },
			{ key: 'wallX', label: 'Wall position', kind: 'number' },
			{ key: 'startDistance', label: 'Starting distance', kind: 'number', minimum: 0.000001 },
			{ key: 'bridgeCorrection', label: 'Within-step crossing correction', kind: 'boolean' }
		],
		defaultParameters: { diffusion: 1, wallX: 0, startDistance: 1, bridgeCorrection: true },
		create: (parameters) => new FirstPassageModel(parameters),
		validate: (parameters) =>
			validateByConstruction(parameters, (value) => new FirstPassageModel(value)),
		theory: (parameters, request) => ({
			survivalProbability: firstPassageSurvival(parameters, request.time),
			firstPassageDensity: firstPassageDensity(parameters, request.time),
			finiteMeanSquareDisplacement: true,
			notes: [
				'Bridge correction removes missed within-step crossings from sampled endpoints; reported event time within that step remains an estimate.'
			]
		})
	}
};

export function getModelDefinition<Id extends ProcessId>(id: Id): ModelRegistry[Id] {
	return MODEL_REGISTRY[id];
}

export function isSteppableDefinition<Parameters extends object>(
	definition: BaseModelDefinition<Parameters>
): definition is SteppableModelDefinition<Parameters> {
	return !('trajectoryGenerator' in definition && definition.trajectoryGenerator === true);
}
