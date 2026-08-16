import { classifyShellRecipe, validateRecipeSemantics } from '../model/validate';
import { diagnoseMesh } from '../mesh/diagnostics';
import { estimateRingIntersections, type RingSphere } from '../mesh/intersections';
import { tessellateRingHistory } from '../mesh/tessellate';
import { buildAccretionGrowthFrames } from './accretion-engine';
import { buildAnalyticGrowthFrames } from './analytic-engine';
import { ringPrefixAtAge } from './history';
import { buildRingHistory } from './ring-builder';
import {
	PREVIEW_RESOLUTION,
	type GenerateOptions,
	type MeshResolution,
	type ShellClassification,
	type ShellEngineInput,
	type ShellGenerationResult,
	type ShellIntersectionAssessment
} from './types';

function resolvedResolution(resolution: Partial<MeshResolution>): MeshResolution {
	const growthRings = Math.max(
		2,
		Math.min(4096, Math.floor(resolution.growthRings ?? PREVIEW_RESOLUTION.growthRings))
	);
	const apertureSamples = Math.max(
		3,
		Math.min(512, Math.floor(resolution.apertureSamples ?? PREVIEW_RESOLUTION.apertureSamples))
	);
	return { growthRings, apertureSamples };
}

function classify(recipe: ShellEngineInput): ShellClassification {
	const modelClassification = classifyShellRecipe(recipe);
	const engine = recipe.engine;
	const curve: ShellClassification['curve'] =
		engine === 'accretion'
			? 'local-kinematic'
			: recipe.coiling.curve === 'archimedean'
				? 'archimedean'
				: 'logarithmic';
	const radialApertureSimilarity: ShellClassification['radialApertureSimilarity'] =
		modelClassification.similarity === 'exact-self-similar' ||
		modelClassification.similarity === 'top-view-self-similar'
			? 'exact-geometric-similarity'
			: modelClassification.similarity === 'allometric'
				? 'allometric'
				: 'not-applicable';
	const spatialSimilarity: ShellClassification['spatialSimilarity'] =
		engine === 'accretion'
			? 'local-kinematic'
			: modelClassification.similarity === 'exact-self-similar'
				? 'strict-underlying-base-law'
				: modelClassification.similarity === 'top-view-self-similar'
					? 'top-view-only'
					: 'not-self-similar';
	return {
		engine,
		curve,
		radialApertureSimilarity,
		spatialSimilarity,
		similarity: modelClassification.similarity,
		label: modelClassification.label,
		reason: modelClassification.reason,
		appliesTo: modelClassification.appliesTo,
		strictlySelfSimilarIn3d: modelClassification.strictlySelfSimilarIn3d,
		finiteRenderedShellStrictlySimilar: modelClassification.finiteRenderedShellStrictlySimilar
	};
}

function aliasingWarnings(recipe: ShellEngineInput, resolution: MeshResolution): string[] {
	const warnings: string[] = [];
	const maximumGrowthCycles = Math.floor(resolution.growthRings / 2) - 1;
	if (
		recipe.ornament.ribs.enabled &&
		recipe.ornament.ribs.amplitude !== 0 &&
		recipe.ornament.ribs.countPerTurn * recipe.coiling.turns > maximumGrowthCycles
	) {
		warnings.push('Rib frequency was band-limited to the growth-ring resolution.');
	}
	if (
		recipe.ornament.varices.enabled &&
		recipe.ornament.varices.amplitude !== 0 &&
		recipe.ornament.varices.countPerTurn * recipe.coiling.turns > maximumGrowthCycles
	) {
		warnings.push('Varix frequency was band-limited to the growth-ring resolution.');
	}
	const maximumApertureMode = Math.floor(resolution.apertureSamples / 2) - 1;
	if (
		(recipe.ornament.cords.enabled &&
			recipe.ornament.cords.amplitude !== 0 &&
			recipe.ornament.cords.count > maximumApertureMode) ||
		(recipe.ornament.spines.enabled &&
			recipe.ornament.spines.length !== 0 &&
			recipe.ornament.spines.countAroundAperture > maximumApertureMode) ||
		(recipe.ornament.buckling.enabled &&
			recipe.ornament.buckling.amplitude !== 0 &&
			recipe.ornament.buckling.mode > maximumApertureMode)
	) {
		warnings.push('Around-aperture ornament was band-limited to the aperture resolution.');
	}
	return warnings;
}

export function generateShell(
	input: ShellEngineInput,
	resolution: Partial<MeshResolution> = {},
	options: GenerateOptions = {}
): ShellGenerationResult {
	const semanticDiagnostics = validateRecipeSemantics(input);
	const numericalErrors = semanticDiagnostics.filter(
		(diagnostic) =>
			diagnostic.severity === 'error' &&
			(diagnostic.code === 'growth-law-numerical-range' ||
				diagnostic.code === 'kinematic-growth-overflow-risk')
	);
	if (numericalErrors.length > 0) {
		throw new RangeError(
			`Recipe cannot be generated with finite geometry: ${numericalErrors.map(({ path }) => path).join(', ')}.`
		);
	}
	const fixedResolution = resolvedResolution(resolution);
	const frames =
		input.engine === 'analytic'
			? buildAnalyticGrowthFrames(input, fixedResolution)
			: buildAccretionGrowthFrames(input, fixedResolution);
	const rings = buildRingHistory(input, frames, fixedResolution, options.normalize ?? true);
	const capApex = options.capApex ?? true;
	const mesh = tessellateRingHistory({
		ringPositions: rings.history.ringPositions,
		ringCount: rings.history.ringCount,
		samplesPerRing: rings.history.samplesPerRing,
		capApex
	});
	const meshDiagnostics = diagnoseMesh(mesh, capApex ? 1 : 2);
	const spheres: RingSphere[] = [];
	for (let ring = 0; ring < rings.history.ringCount; ring += 1) {
		const offset = ring * 3;
		spheres.push({
			x: rings.history.centers[offset],
			y: rings.history.centers[offset + 1],
			z: rings.history.centers[offset + 2],
			radius: rings.ringRadii[ring]
		});
	}
	const ringEnvelopeEstimate = estimateRingIntersections(
		spheres,
		Math.max(
			3,
			Math.ceil(((fixedResolution.growthRings - 1) / Math.max(0.25, input.coiling.turns)) * 1.25)
		)
	);
	const parameterOverlapRisk = semanticDiagnostics.some(
		(diagnostic) => diagnostic.code === 'self-intersection-likely'
	);
	// Ring envelopes overlap in many ordinary enveloping body whorls. Treat them
	// as a likely surface risk only when an independent parameter-domain heuristic
	// agrees with the nonlocal broad-phase candidate.
	const intersectionEstimate: ShellIntersectionAssessment = {
		...ringEnvelopeEstimate,
		envelopeCandidatePairCount: ringEnvelopeEstimate.pairCount,
		envelopeCandidateFound: ringEnvelopeEstimate.likely,
		parameterRisk: parameterOverlapRisk,
		likely: ringEnvelopeEstimate.likely && parameterOverlapRisk
	};
	const errors = [
		...semanticDiagnostics
			.filter(({ severity }) => severity === 'error')
			.map(({ message }) => message),
		...rings.apertureValidation.errors,
		...meshDiagnostics.errors
	];
	const warnings = [
		...semanticDiagnostics
			.filter(({ severity }) => severity !== 'error')
			.map(({ message }) => message),
		...aliasingWarnings(input, fixedResolution),
		...meshDiagnostics.warnings
	];
	if (!rings.apertureValidation.valid) {
		warnings.push('The invalid aperture was replaced by a finite circular fallback mesh.');
	}
	if (intersectionEstimate.likely) {
		warnings.push(
			'A conservative ring-envelope broad phase found possible overlap beyond the excluded local growth neighbourhood; this is not proof of surface self-intersection.'
		);
	}
	const diagnostics = {
		valid: errors.length === 0,
		errors,
		warnings,
		aperture: rings.apertureValidation,
		mesh: meshDiagnostics,
		intersectionEstimate
	};
	return {
		mesh,
		history: rings.history,
		diagnostics,
		classification: classify(input),
		reveal: ringPrefixAtAge(rings.history, mesh, options.age ?? 1),
		resolution: fixedResolution
	};
}

export function generateShellAtAge(
	input: ShellEngineInput,
	age: number,
	resolution: Partial<MeshResolution> = {},
	options: Omit<GenerateOptions, 'age'> = {}
): ShellGenerationResult {
	return generateShell(input, resolution, { ...options, age });
}
