import { evaluateGrowthLaw } from '../model/growth-law';
import type { ShellRecipe } from '../model/recipe-schema';
import {
	aperturePointInWorld,
	sampleAperturePoint,
	tiltApertureFrame,
	validateApertureProfile,
	type ApertureParameters,
	type ApertureProfile,
	type ApertureValidation
} from '../math/aperture';
import { twistFrame, type LocalFrame } from '../math/transported-frame';
import { computeBounds } from '../mesh/diagnostics';
import { evaluateOrnament, ornamentIsZero, prepareOrnament } from '../ornament';
import type { Vec3 } from '../math/vector';
import type { MeshResolution, RingHistory } from './types';

export interface GrowthFrame {
	age: number;
	theta: number;
	center: Vec3;
	frame: LocalFrame;
	baseScale: number;
	authoredTwist?: number;
}

export interface RingBuildResult {
	history: RingHistory;
	apertureValidation: ApertureValidation;
	ringRadii: number[];
}

function profileFromRecipe(recipe: ShellRecipe): ApertureProfile {
	const aperture = recipe.aperture;
	switch (aperture.profile) {
		case 'circle':
			return { kind: 'circle' };
		case 'ellipse':
			return { kind: 'ellipse' };
		case 'superellipse':
			return { kind: 'superellipse', exponent: aperture.superellipseExponent };
		case 'rounded-polygon':
			return {
				kind: 'rounded-polygon',
				sides: aperture.polygonSides,
				roundness: aperture.cornerRoundness
			};
		case 'fourier':
			return {
				kind: 'fourier',
				terms: aperture.fourier.map((term) => ({
					harmonic: term.harmonic,
					cosine: term.cos,
					sine: term.sin
				}))
			};
		case 'lobed':
			return { kind: 'lobed', lobes: aperture.lobes, amplitude: aperture.lobeAmplitude };
		case 'drawn':
			return {
				kind: 'drawn',
				points: aperture.drawnProfile.map((point) => ({ u: point.angle, radius: point.radius }))
			};
	}
}

export function apertureParametersFromRecipe(recipe: ShellRecipe): ApertureParameters {
	return {
		profile: profileFromRecipe(recipe),
		width: 1,
		height: recipe.aperture.aspectRatio,
		rotation: recipe.aperture.rotation
	};
}

function normalizeHistory(
	rawPositions: Float64Array,
	rawCenters: Float64Array,
	rawScales: Float64Array,
	targetScale: number,
	normalize: boolean
): { positions: Float32Array; centers: Float64Array; scales: Float64Array } {
	const bounds = computeBounds(rawPositions);
	const factor = normalize && bounds.diagonal > 1e-12 ? targetScale / bounds.diagonal : 1;
	const center = normalize ? bounds.center : [0, 0, 0];
	const positions = new Float32Array(rawPositions.length);
	for (let offset = 0; offset < rawPositions.length; offset += 3) {
		positions[offset] = (rawPositions[offset] - center[0]) * factor;
		positions[offset + 1] = (rawPositions[offset + 1] - center[1]) * factor;
		positions[offset + 2] = (rawPositions[offset + 2] - center[2]) * factor;
	}
	const centers = new Float64Array(rawCenters.length);
	for (let offset = 0; offset < rawCenters.length; offset += 3) {
		centers[offset] = (rawCenters[offset] - center[0]) * factor;
		centers[offset + 1] = (rawCenters[offset + 1] - center[1]) * factor;
		centers[offset + 2] = (rawCenters[offset + 2] - center[2]) * factor;
	}
	const scales = new Float64Array(rawScales.length);
	for (let index = 0; index < rawScales.length; index += 1)
		scales[index] = rawScales[index] * factor;
	return { positions, centers, scales };
}

export function buildRingHistory(
	recipe: ShellRecipe,
	frames: readonly GrowthFrame[],
	resolution: MeshResolution,
	normalize: boolean
): RingBuildResult {
	if (frames.length !== resolution.growthRings) {
		throw new RangeError('Growth-frame count must match the requested ring resolution.');
	}
	const apertureParameters = apertureParametersFromRecipe(recipe);
	const apertureValidation = validateApertureProfile(
		apertureParameters,
		resolution.apertureSamples
	);
	const sampledApertureParameters: ApertureParameters = apertureValidation.valid
		? apertureParameters
		: { ...apertureParameters, profile: { kind: 'circle' } };
	const apertureAngles = new Float64Array(resolution.apertureSamples);
	const aperturePoints = Array.from({ length: resolution.apertureSamples }, (_, sample) => {
		const u = (sample / resolution.apertureSamples) * Math.PI * 2;
		apertureAngles[sample] = u;
		const point = sampleAperturePoint(sampledApertureParameters, u);
		return { ...point, x: point.x + recipe.aperture.eccentricity };
	});
	const rawPositions = new Float64Array(resolution.growthRings * resolution.apertureSamples * 3);
	const instabilityProxy = new Float32Array(resolution.growthRings * resolution.apertureSamples);
	const centers = new Float64Array(resolution.growthRings * 3);
	const scales = new Float64Array(resolution.growthRings);
	const ages = new Float64Array(resolution.growthRings);
	const thetas = new Float64Array(resolution.growthRings);
	const tangents = new Float64Array(resolution.growthRings * 3);
	const frameE1 = new Float64Array(resolution.growthRings * 3);
	const frameE2 = new Float64Array(resolution.growthRings * 3);
	const ringRadii = new Array<number>(resolution.growthRings).fill(0);
	const preparedOrnament = prepareOrnament(
		recipe.ornament,
		recipe.seed,
		resolution.apertureSamples
	);
	const hasStructuralOrnament = !ornamentIsZero(recipe.ornament);
	for (let ring = 0; ring < frames.length; ring += 1) {
		const growthFrame = frames[ring];
		const authored = growthFrame.authoredTwist
			? twistFrame(growthFrame.frame, growthFrame.authoredTwist)
			: growthFrame.frame;
		const frame = tiltApertureFrame(authored, recipe.aperture.tilt);
		const scaleModulation = Math.max(
			0.02,
			evaluateGrowthLaw(recipe.aperture.scaleModulation, growthFrame.age)
		);
		const lipFlare = Math.max(
			0.02,
			1 + evaluateGrowthLaw(recipe.aperture.lipFlare, growthFrame.age)
		);
		const scale = Math.max(1e-10, growthFrame.baseScale * scaleModulation * lipFlare);
		const vectorOffset = ring * 3;
		centers[vectorOffset] = growthFrame.center.x;
		centers[vectorOffset + 1] = growthFrame.center.y;
		centers[vectorOffset + 2] = growthFrame.center.z;
		tangents[vectorOffset] = frame.tangent.x;
		tangents[vectorOffset + 1] = frame.tangent.y;
		tangents[vectorOffset + 2] = frame.tangent.z;
		frameE1[vectorOffset] = frame.e1.x;
		frameE1[vectorOffset + 1] = frame.e1.y;
		frameE1[vectorOffset + 2] = frame.e1.z;
		frameE2[vectorOffset] = frame.e2.x;
		frameE2[vectorOffset + 1] = frame.e2.y;
		frameE2[vectorOffset + 2] = frame.e2.z;
		scales[ring] = scale;
		ages[ring] = growthFrame.age;
		thetas[ring] = growthFrame.theta;
		for (let sample = 0; sample < resolution.apertureSamples; sample += 1) {
			const eccentricPoint = aperturePoints[sample];
			const ornament = hasStructuralOrnament
				? evaluateOrnament(
						recipe.ornament,
						{
							age: growthFrame.age,
							theta: growthFrame.theta,
							totalTurns: recipe.coiling.turns,
							u: apertureAngles[sample],
							apertureIndex: sample,
							apertureSamples: resolution.apertureSamples,
							growthSamples: resolution.growthRings,
							seed: recipe.seed
						},
						preparedOrnament
					)
				: undefined;
			const point = aperturePointInWorld(
				growthFrame.center,
				frame,
				eccentricPoint,
				scale,
				ornament?.radialDisplacement ?? 0
			);
			const vertex = ring * resolution.apertureSamples + sample;
			const positionOffset = vertex * 3;
			rawPositions[positionOffset] = point.x;
			rawPositions[positionOffset + 1] = point.y;
			rawPositions[positionOffset + 2] = point.z;
			instabilityProxy[vertex] = ornament?.instabilityProxy ?? 0;
			ringRadii[ring] = Math.max(
				ringRadii[ring],
				Math.hypot(
					point.x - growthFrame.center.x,
					point.y - growthFrame.center.y,
					point.z - growthFrame.center.z
				)
			);
		}
	}
	const normalized = normalizeHistory(
		rawPositions,
		centers,
		scales,
		recipe.qualityIndependent.normalizationScale,
		normalize
	);
	const originalBounds = computeBounds(rawPositions);
	const normalizationFactor =
		normalize && originalBounds.diagonal > 1e-12
			? recipe.qualityIndependent.normalizationScale / originalBounds.diagonal
			: 1;
	for (let index = 0; index < ringRadii.length; index += 1) ringRadii[index] *= normalizationFactor;
	return {
		history: {
			ringCount: resolution.growthRings,
			samplesPerRing: resolution.apertureSamples,
			centers: normalized.centers,
			scales: normalized.scales,
			ages,
			thetas,
			tangents,
			frameE1,
			frameE2,
			ringPositions: normalized.positions,
			instabilityProxy
		},
		apertureValidation,
		ringRadii
	};
}
