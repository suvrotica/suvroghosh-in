import { evaluateGrowthLaw } from '../model/growth-law';
import type { ShellRecipe } from '../model/recipe-schema';
import {
	integrateLocalFrame,
	type LocalFrameOdeLaws,
	type LocalFrameOdeState
} from '../math/local-frame-ode';
import { TAU } from '../math/logarithmic-spiral';
import { cross3, normalize3 } from '../math/vector';
import { authoredTwistAngles } from './analytic-engine';
import type { GrowthFrame } from './ring-builder';
import type { MeshResolution } from './types';

function growthIntegral(recipe: ShellRecipe, samples = 256): number {
	let integral = 0;
	for (let index = 1; index < samples; index += 1) {
		const previousAge = (index - 1) / (samples - 1);
		const age = index / (samples - 1);
		integral +=
			((evaluateGrowthLaw(recipe.kinematics.growthRate, previousAge) +
				evaluateGrowthLaw(recipe.kinematics.growthRate, age)) /
				2) *
			(age - previousAge);
	}
	return integral;
}

export function buildAccretionGrowthFrames(
	recipe: ShellRecipe,
	resolution: MeshResolution
): GrowthFrame[] {
	const parameterSpan = recipe.coiling.turns * TAU;
	const handedness = recipe.coiling.handedness;
	const radialExpansion = Math.log(recipe.coiling.whorlExpansion) / TAU;
	const initialRadius =
		recipe.coiling.curve === 'logarithmic'
			? recipe.coiling.axisDistance * Math.exp(-radialExpansion * parameterSpan)
			: Math.max(
					recipe.coiling.axisDistance - recipe.coiling.archimedeanSpacing * parameterSpan,
					recipe.coiling.axisDistance * recipe.qualityIndependent.protoconchScale
				);
	const adultScale = recipe.aperture.scale * recipe.coiling.axisDistance;
	const initialScale = Math.max(
		1e-10,
		adultScale * Math.exp(-growthIntegral(recipe) * parameterSpan)
	);
	const tangent = normalize3({ x: 0, y: handedness, z: 0 });
	const e1 = { x: -1, y: 0, z: 0 };
	const e2 = normalize3(cross3(tangent, e1));
	const initialState: LocalFrameOdeState = {
		center: { x: initialRadius, y: 0, z: 0 },
		tangent,
		e1,
		e2,
		scale: initialScale
	};
	const handednessControl = (age: number): number =>
		Math.max(-1, Math.min(1, evaluateGrowthLaw(recipe.coiling.handednessLaw, age)));
	const laws: LocalFrameOdeLaws = {
		speed: (age) =>
			Math.max(1e-8, evaluateGrowthLaw(recipe.kinematics.speed, age)) *
			parameterSpan *
			recipe.coiling.axisDistance,
		growthRate: (age) => evaluateGrowthLaw(recipe.kinematics.growthRate, age) * parameterSpan,
		curvature1: (age) =>
			evaluateGrowthLaw(recipe.kinematics.curvature1, age) * parameterSpan * handednessControl(age),
		curvature2: (age) => evaluateGrowthLaw(recipe.kinematics.curvature2, age) * parameterSpan,
		twistRate: (age) => evaluateGrowthLaw(recipe.kinematics.twistRate, age) * parameterSpan
	};
	const samples = integrateLocalFrame(initialState, laws, resolution.growthRings);
	const twistAngles = authoredTwistAngles(recipe, resolution);
	return samples.map((sample, index) => ({
		age: sample.age,
		theta: -parameterSpan + sample.age * parameterSpan,
		center: sample.center,
		frame: { tangent: sample.tangent, e1: sample.e1, e2: sample.e2 },
		baseScale: sample.scale,
		authoredTwist: twistAngles[index]
	}));
}
