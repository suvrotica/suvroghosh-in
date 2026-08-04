import { moveParticleBy } from '../boundaries';
import type {
	ParticleArrays,
	ProcessInitializationContext,
	ProcessModel,
	ProcessStepContext
} from '../types';
import {
	assertFiniteParticle,
	finite,
	initializeGaussianCloud,
	nonNegative,
	positive,
	validateStepContext
} from './model-utils';
import {
	resolveCircularObstacleMove,
	type CircleObstacle,
	validateCircleObstacle
} from './obstacles';

export type PotentialLandscape = 'harmonic' | 'double-well' | 'periodic' | 'tilted-periodic';

/** Parameters that completely define the conservative energy field U(x, y). */
export interface PotentialFieldParameters {
	readonly landscape: PotentialLandscape;
	readonly centerX: number;
	readonly centerY: number;
	readonly stiffness: number;
	readonly transverseStiffness: number;
	readonly barrierHeight: number;
	readonly wellSeparation: number;
	readonly period: number;
	readonly tilt: number;
}

export interface PotentialDiffusionParameters extends PotentialFieldParameters {
	readonly mobility: number;
	readonly thermalEnergy: number;
	readonly obstacles: readonly CircleObstacle[];
}

export interface PotentialGradient {
	readonly x: number;
	readonly y: number;
}

export interface NumericalResolutionAdvice {
	readonly dimensionlessCurvatureStep: number;
	readonly status: 'good' | 'caution' | 'unsafe';
	readonly message: string;
}

function potentialEnergyFromOffset(
	parameters: Readonly<PotentialFieldParameters>,
	dx: number,
	dy: number
): number {
	if (parameters.landscape === 'harmonic') {
		return 0.5 * parameters.stiffness * (dx * dx + dy * dy);
	}
	if (parameters.landscape === 'double-well') {
		const scaled = dx / parameters.wellSeparation;
		const shape = scaled * scaled - 1;
		return (
			parameters.barrierHeight * shape * shape + 0.5 * parameters.transverseStiffness * dy * dy
		);
	}

	const waveNumber = (2 * Math.PI) / parameters.period;
	const periodicPotential = 0.5 * parameters.barrierHeight * (1 - Math.cos(waveNumber * dx));
	return (
		periodicPotential +
		0.5 * parameters.transverseStiffness * dy * dy -
		(parameters.landscape === 'tilted-periodic' ? parameters.tilt * dx : 0)
	);
}

const ENERGY = 'potential-diffusion:energy';
const WELL = 'potential-diffusion:well';
const TRANSITIONS = 'potential-diffusion:transitions';

function validateLandscape(value: PotentialLandscape): PotentialLandscape {
	if (
		value !== 'harmonic' &&
		value !== 'double-well' &&
		value !== 'periodic' &&
		value !== 'tilted-periodic'
	) {
		throw new RangeError('Unknown potential landscape.');
	}
	return value;
}

function validatedParameters(
	parameters: PotentialDiffusionParameters
): Readonly<PotentialDiffusionParameters> {
	if (!Array.isArray(parameters.obstacles)) throw new RangeError('Obstacles must be an array.');
	return Object.freeze({
		landscape: validateLandscape(parameters.landscape),
		mobility: positive(parameters.mobility, 'Mobility'),
		thermalEnergy: nonNegative(parameters.thermalEnergy, 'Thermal energy'),
		centerX: finite(parameters.centerX, 'Potential centre x'),
		centerY: finite(parameters.centerY, 'Potential centre y'),
		stiffness: nonNegative(parameters.stiffness, 'Potential stiffness'),
		transverseStiffness: nonNegative(parameters.transverseStiffness, 'Transverse stiffness'),
		barrierHeight: nonNegative(parameters.barrierHeight, 'Barrier height'),
		wellSeparation: positive(parameters.wellSeparation, 'Well separation'),
		period: positive(parameters.period, 'Potential period'),
		tilt: finite(parameters.tilt, 'Potential tilt'),
		obstacles: Object.freeze(parameters.obstacles.map(validateCircleObstacle))
	});
}

export function potentialAndGradient(
	parameters: Readonly<PotentialFieldParameters>,
	x: number,
	y: number
): { potential: number; gradient: PotentialGradient } {
	finite(x, 'Potential evaluation x');
	finite(y, 'Potential evaluation y');
	const dx = x - parameters.centerX;
	const dy = y - parameters.centerY;
	if (parameters.landscape === 'harmonic') {
		return {
			potential: potentialEnergyFromOffset(parameters, dx, dy),
			gradient: { x: parameters.stiffness * dx, y: parameters.stiffness * dy }
		};
	}
	if (parameters.landscape === 'double-well') {
		const scaled = dx / parameters.wellSeparation;
		const shape = scaled * scaled - 1;
		return {
			potential: potentialEnergyFromOffset(parameters, dx, dy),
			gradient: {
				x:
					(4 * parameters.barrierHeight * dx * shape) /
					(parameters.wellSeparation * parameters.wellSeparation),
				y: parameters.transverseStiffness * dy
			}
		};
	}

	const waveNumber = (2 * Math.PI) / parameters.period;
	const phase = waveNumber * dx;
	const periodicGradient = 0.5 * parameters.barrierHeight * waveNumber * Math.sin(phase);
	const tilted = parameters.landscape === 'tilted-periodic';
	return {
		potential: potentialEnergyFromOffset(parameters, dx, dy),
		gradient: {
			x: periodicGradient - (tilted ? parameters.tilt : 0),
			y: parameters.transverseStiffness * dy
		}
	};
}

/** Evaluate the same conservative energy U(x, y) used by the simulation, without computing force. */
export function potentialEnergy(
	parameters: Readonly<PotentialFieldParameters>,
	x: number,
	y: number
): number {
	finite(x, 'Potential evaluation x');
	finite(y, 'Potential evaluation y');
	return potentialEnergyFromOffset(parameters, x - parameters.centerX, y - parameters.centerY);
}

export function potentialResolutionAdvice(
	parameters: PotentialDiffusionParameters,
	timestep: number,
	x = parameters.centerX
): NumericalResolutionAdvice {
	positive(timestep, 'Potential-diffusion timestep');
	const checked = validatedParameters(parameters);
	let longitudinalCurvature = checked.stiffness;
	if (checked.landscape === 'double-well') {
		const scaled = (x - checked.centerX) / checked.wellSeparation;
		longitudinalCurvature = Math.abs(
			(4 * checked.barrierHeight * (3 * scaled * scaled - 1)) /
				(checked.wellSeparation * checked.wellSeparation)
		);
	} else if (checked.landscape === 'periodic' || checked.landscape === 'tilted-periodic') {
		longitudinalCurvature = 0.5 * checked.barrierHeight * ((2 * Math.PI) / checked.period) ** 2;
	}
	const value =
		checked.mobility * Math.max(longitudinalCurvature, checked.transverseStiffness) * timestep;
	if (value > 1) {
		return {
			dimensionlessCurvatureStep: value,
			status: 'unsafe',
			message: 'The deterministic potential relaxation is under-resolved; reduce the timestep.'
		};
	}
	if (value > 0.2) {
		return {
			dimensionlessCurvatureStep: value,
			status: 'caution',
			message: 'Potential relaxation is only coarsely resolved at this timestep.'
		};
	}
	return {
		dimensionlessCurvatureStep: value,
		status: 'good',
		message: 'The local deterministic potential relaxation is well resolved.'
	};
}

/** Euler--Maruyama overdamped diffusion in a conservative energy landscape. */
export class PotentialDiffusionModel implements ProcessModel<PotentialDiffusionParameters> {
	readonly id = 'potential-diffusion';
	readonly dimensions = 2;
	readonly parameters: Readonly<PotentialDiffusionParameters>;

	constructor(parameters: PotentialDiffusionParameters) {
		this.parameters = validatedParameters(parameters);
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
		state.modelData[ENERGY] = new Float64Array(state.count);
		state.modelData[WELL] = new Int32Array(state.count);
		state.modelData[TRANSITIONS] = new Uint32Array(state.count);
		const energy = state.modelData[ENERGY] as Float64Array;
		const well = state.modelData[WELL] as Int32Array;
		for (let index = 0; index < state.count; index += 1) {
			const excluded = resolveCircularObstacleMove(
				state.x[index],
				state.y[index],
				0,
				0,
				this.parameters.obstacles
			);
			if (excluded.collided) {
				moveParticleBy(state, index, excluded.deltaX, excluded.deltaY, context.boundary);
				state.originX[index] = state.x[index];
				state.originY[index] = state.y[index];
				state.originUnwrappedX[index] = state.unwrappedX[index];
				state.originUnwrappedY[index] = state.unwrappedY[index];
			}
			energy[index] = potentialAndGradient(
				this.parameters,
				state.x[index],
				state.y[index]
			).potential;
			well[index] = state.x[index] < this.parameters.centerX ? -1 : 1;
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Potential diffusion');
		const { mobility, thermalEnergy, obstacles } = this.parameters;
		const sigma = Math.sqrt(2 * mobility * thermalEnergy * context.timestep);
		const noiseX = context.random.normal(`${this.id}:motion-x`);
		const noiseY = context.random.normal(`${this.id}:motion-y`);
		const energy = state.modelData[ENERGY];
		const well = state.modelData[WELL];
		const transitions = state.modelData[TRANSITIONS];
		if (
			!(energy instanceof Float64Array) ||
			!(well instanceof Int32Array) ||
			!(transitions instanceof Uint32Array)
		) {
			throw new Error('Potential-diffusion metrics arrays were not initialized.');
		}

		for (let index = 0; index < state.count; index += 1) {
			const randomX = noiseX.next();
			const randomY = noiseY.next();
			if (state.alive[index] === 0) continue;
			const { gradient } = potentialAndGradient(this.parameters, state.x[index], state.y[index]);
			const proposedX = -mobility * gradient.x * context.timestep + sigma * randomX;
			const proposedY = -mobility * gradient.y * context.timestep + sigma * randomY;
			const resolved = resolveCircularObstacleMove(
				state.x[index],
				state.y[index],
				proposedX,
				proposedY,
				obstacles
			);
			moveParticleBy(state, index, resolved.deltaX, resolved.deltaY, context.boundary);
			const current = potentialAndGradient(this.parameters, state.x[index], state.y[index]);
			energy[index] = current.potential;
			const nextWell = state.x[index] < this.parameters.centerX ? -1 : 1;
			if (this.parameters.landscape === 'double-well' && nextWell !== well[index]) {
				transitions[index] += 1;
			}
			well[index] = nextWell;
			assertFiniteParticle(state, index, 'Potential diffusion');
		}
	}
}

export function boltzmannWeight(
	parameters: PotentialDiffusionParameters,
	x: number,
	y: number
): number {
	const checked = validatedParameters(parameters);
	if (checked.thermalEnergy === 0) {
		return potentialAndGradient(checked, x, y).potential === 0 ? 1 : 0;
	}
	return Math.exp(-potentialAndGradient(checked, x, y).potential / checked.thermalEnergy);
}
