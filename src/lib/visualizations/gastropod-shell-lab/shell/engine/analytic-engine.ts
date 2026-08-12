import { evaluateGrowthLaw } from '../model/growth-law';
import type { ShellRecipe } from '../model/recipe-schema';
import {
	evaluateAnalyticCenterline,
	type AnalyticCenterlineParameters
} from '../math/analytic-centerline';
import { TAU } from '../math/logarithmic-spiral';
import { buildRotationMinimizingFrames } from '../math/transported-frame';
import { clamp, normalize3, smoothstep, type Vec3 } from '../math/vector';
import type { MeshResolution } from './types';
import type { GrowthFrame } from './ring-builder';

function authoredTwistAngles(recipe: ShellRecipe, resolution: MeshResolution): Float64Array {
	const angles = new Float64Array(resolution.growthRings);
	angles[0] = recipe.twist.initialAngle;
	const thetaSpan = recipe.coiling.turns * TAU;
	for (let index = 1; index < resolution.growthRings; index += 1) {
		const previousAge = (index - 1) / (resolution.growthRings - 1);
		const age = index / (resolution.growthRings - 1);
		const previousRate = evaluateGrowthLaw(recipe.twist.rate, previousAge);
		const rate = evaluateGrowthLaw(recipe.twist.rate, age);
		angles[index] =
			angles[index - 1] + ((previousRate + rate) / 2) * (age - previousAge) * thetaSpan;
	}
	return angles;
}

export function buildAnalyticGrowthFrames(
	recipe: ShellRecipe,
	resolution: MeshResolution
): GrowthFrame[] {
	const thetaStart = -recipe.coiling.turns * TAU;
	const thetaEnd = 0;
	const parameters: AnalyticCenterlineParameters = {
		spiralFamily: recipe.coiling.curve,
		thetaStart,
		thetaEnd,
		adultRadius: recipe.coiling.axisDistance,
		minimumRadius: Math.max(
			recipe.coiling.axisDistance * recipe.qualityIndependent.apexEpsilon,
			1e-10
		),
		whorlExpansion: recipe.coiling.whorlExpansion,
		archimedeanSpacing: recipe.coiling.archimedeanSpacing,
		handedness: recipe.coiling.handedness,
		axialMode: recipe.coiling.axial.mode,
		risePerTurn: recipe.coiling.axial.risePerTurn,
		coneSpireRatio: recipe.coiling.axial.coneSpireRatio
	};
	const points: Vec3[] = [];
	const radii = new Float64Array(resolution.growthRings);
	const ages = new Float64Array(resolution.growthRings);
	const thetas = new Float64Array(resolution.growthRings);
	let azimuth = recipe.coiling.handedness * thetaStart;
	for (let index = 0; index < resolution.growthRings; index += 1) {
		const age = index / (resolution.growthRings - 1);
		const theta = thetaStart + (thetaEnd - thetaStart) * age;
		if (index > 0) {
			const previousAge = (index - 1) / (resolution.growthRings - 1);
			const handednessControl =
				(evaluateGrowthLaw(recipe.coiling.handednessLaw, previousAge) +
					evaluateGrowthLaw(recipe.coiling.handednessLaw, age)) /
				2;
			azimuth +=
				(recipe.coiling.handedness * clamp(handednessControl, -1, 1) * (thetaEnd - thetaStart)) /
				(resolution.growthRings - 1);
		}
		const evaluated = evaluateAnalyticCenterline(theta, parameters);
		const meanderArgument =
			TAU * recipe.coiling.meander.cycles * age + recipe.coiling.meander.phase;
		const radialFactor = Math.max(
			0.02,
			1 + recipe.coiling.meander.radialAmplitude * Math.sin(meanderArgument)
		);
		const radius = evaluated.radius * radialFactor;
		let z = evaluated.point.z;
		if (recipe.coiling.axial.mode === 'keyframed') {
			z = evaluateGrowthLaw(recipe.coiling.axial.keyframed, age);
		}
		z += recipe.coiling.meander.axialAmplitude * Math.sin(meanderArgument);
		points.push({ x: radius * Math.cos(azimuth), y: radius * Math.sin(azimuth), z });
		radii[index] = radius;
		ages[index] = age;
		thetas[index] = theta;
	}
	const transported = buildRotationMinimizingFrames(points, undefined, { x: 0, y: 0, z: 1 });
	const twistAngles = authoredTwistAngles(recipe, resolution);
	const apertureExpansion = recipe.aperture.scaleExponent;
	const adultScale = recipe.aperture.scale * recipe.coiling.axisDistance;
	const output: GrowthFrame[] = [];
	for (let index = 0; index < resolution.growthRings; index += 1) {
		const exponent = clamp(apertureExpansion * (thetas[index] - thetaEnd), -700, 700);
		const analyticScale = adultScale * Math.exp(exponent);
		const protoconchScale =
			adultScale *
			recipe.qualityIndependent.protoconchScale *
			(1 - smoothstep(0, Math.min(0.12, 1 / Math.max(1, recipe.coiling.turns)), ages[index]));
		output.push({
			age: ages[index],
			theta: thetas[index],
			center: points[index],
			frame: {
				tangent: normalize3(transported[index].tangent),
				e1: transported[index].e1,
				e2: transported[index].e2
			},
			// A short, smooth non-zero protoconch prevents a singular/underflowing apex.
			baseScale: Math.max(1e-10, Math.hypot(analyticScale, protoconchScale)),
			authoredTwist: twistAngles[index]
		});
	}
	return output;
}

export { authoredTwistAngles };
