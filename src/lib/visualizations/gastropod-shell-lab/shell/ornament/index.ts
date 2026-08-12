import type { OrnamentConfiguration } from '../model/recipe-schema';
import { clamp } from '../math/vector';
import {
	bucklingGrowthRate,
	evaluateBucklingModes,
	saturatedBucklingAmplitude,
	type BucklingModeState
} from '../math/buckling-surrogate';
import { boundRadialDisplacement, finiteBandLimit, ornamentEnvelope } from './common';
import { evaluateCords } from './cords';
import { evaluateHierarchy, prepareFiniteHierarchy, type PreparedHierarchy } from './hierarchy';
import { evaluateImperfection } from './imperfection';
import { evaluateNodules } from './nodules';
import { evaluateRibs } from './ribs';
import { evaluateSpines } from './spines';
import type { OrnamentContext, OrnamentEvaluation } from './types';
import { evaluateVarices } from './varices';

export interface PreparedOrnament {
	/** Seeded finite hierarchy shared by every vertex in one generated shell. */
	hierarchy: PreparedHierarchy;
}

export function prepareOrnament(
	configuration: OrnamentConfiguration,
	seed: number,
	apertureSamples: number
): PreparedOrnament {
	return {
		hierarchy:
			configuration.hierarchy.enabled &&
			configuration.hierarchy.amplitude !== 0 &&
			configuration.hierarchy.depth > 0
				? prepareFiniteHierarchy(configuration.hierarchy, seed, apertureSamples)
				: { peaks: [], levelProfiles: [] }
	};
}

function evaluateBuckling(
	configuration: OrnamentConfiguration['buckling'],
	context: OrnamentContext
): { displacement: number; proxy: number } {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	const mode = finiteBandLimit(configuration.mode, context.apertureSamples);
	if (envelope === 0 || configuration.amplitude === 0 || mode === 0) {
		return { displacement: 0, proxy: 0 };
	}
	// Documented dimensionless beam surrogate: k=2πm/L and σ=ξk²−Kk⁴−1 (γ₀=1).
	const mismatch = Math.max(0, configuration.mismatchProxy);
	const stiffness = Math.max(1e-8, configuration.stiffnessProxy);
	const growth = bucklingGrowthRate(mode, configuration.domainLength, mismatch, stiffness);
	// A small deterministic imperfection seed grows or decays without changing sign.
	// λ=max(1,σ) keeps the normalized modal equilibrium finite and no greater than one.
	const normalizedAmplitude = saturatedBucklingAmplitude(
		0.01,
		growth,
		Math.max(1, growth),
		context.age
	);
	const ageAmplitude = configuration.amplitude * normalizedAmplitude;
	const states: BucklingModeState[] = [
		{
			mode,
			initialAmplitude: 0,
			amplitude: ageAmplitude,
			phase: 0,
			mismatch,
			stiffness,
			saturation: Math.max(1, growth)
		}
	];
	const field = evaluateBucklingModes(states, context.u);
	return {
		displacement: envelope * field,
		proxy: clamp(Math.max(0, growth) * Math.abs(field), 0, 1e6)
	};
}

export function evaluateOrnament(
	configuration: OrnamentConfiguration,
	context: OrnamentContext,
	prepared?: PreparedOrnament
): OrnamentEvaluation {
	const ribs = evaluateRibs(configuration.ribs, context);
	const cords = evaluateCords(configuration.cords, context);
	const nodules = evaluateNodules(
		configuration.nodules,
		context,
		ribs.normalized,
		cords.normalized
	);
	const varices = evaluateVarices(configuration.varices, context);
	const spines = evaluateSpines(configuration.spines, configuration.varices, context);
	const buckling = evaluateBuckling(configuration.buckling, context);
	const hierarchy = evaluateHierarchy(configuration.hierarchy, context, prepared?.hierarchy);
	const imperfection = evaluateImperfection(configuration.imperfection, context);
	const components = {
		ribs: ribs.displacement,
		cords: cords.displacement,
		nodules: nodules.displacement,
		varices: varices.displacement,
		spines: spines.displacement,
		buckling: buckling.displacement,
		hierarchy: hierarchy.displacement,
		imperfection: imperfection.displacement
	};
	const radialDisplacement = boundRadialDisplacement(
		Object.values(components).reduce((sum, value) => sum + value, 0)
	);
	return { radialDisplacement, instabilityProxy: buckling.proxy, components };
}

export function ornamentIsZero(configuration: OrnamentConfiguration): boolean {
	return (
		(!configuration.ribs.enabled || configuration.ribs.amplitude === 0) &&
		(!configuration.cords.enabled || configuration.cords.amplitude === 0) &&
		(!configuration.nodules.enabled || configuration.nodules.amplitude === 0) &&
		(!configuration.varices.enabled || configuration.varices.amplitude === 0) &&
		(!configuration.spines.enabled || configuration.spines.length === 0) &&
		(!configuration.buckling.enabled || configuration.buckling.amplitude === 0) &&
		(!configuration.hierarchy.enabled || configuration.hierarchy.amplitude === 0) &&
		(!configuration.imperfection.enabled || configuration.imperfection.amplitude === 0)
	);
}

export type { OrnamentContext, OrnamentEvaluation, OrnamentSignal } from './types';
export { buildFiniteHierarchy } from './hierarchy';
export { evaluateRibs } from './ribs';
export { evaluateCords } from './cords';
export { evaluateNodules } from './nodules';
export { evaluateVarices } from './varices';
export { evaluateSpines } from './spines';
export { evaluateImperfection } from './imperfection';
