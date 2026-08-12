import { clamp, smoothstep } from '../math/vector';
import {
	finiteBandLimit,
	gaussianPulse,
	hashUnit,
	ornamentEnvelope,
	periodicAngleDistance
} from './common';
import type { HierarchyConfiguration, OrnamentContext, OrnamentSignal } from './types';

export interface HierarchyPeak {
	phase: number;
	width: number;
	amplitude: number;
	level: number;
	onsetAge: number;
}

export interface PreparedHierarchy {
	peaks: readonly HierarchyPeak[];
	/** Aperture-only Gaussian sums, one typed profile per finite level. */
	levelProfiles: readonly Float64Array[];
}

/**
 * Build a finite, deterministic multilevel hierarchy. Successive levels occupy
 * progressively finer aperture phases and activate later; this is not an explicit
 * gap-threshold insertion solver. The hard depth cap prevents true fractality.
 */
export function buildFiniteHierarchy(
	configuration: HierarchyConfiguration,
	seed: number,
	apertureSamples: number
): HierarchyPeak[] {
	const depth = Math.min(6, Math.max(0, Math.floor(configuration.depth)));
	if (depth === 0) return [];
	const maximumPeaks = finiteBandLimit(2 ** depth, apertureSamples);
	const peaks: HierarchyPeak[] = [];
	for (let level = 0; level < depth; level += 1) {
		const count = Math.min(2 ** level, maximumPeaks);
		if (count <= 0) break;
		const levelScale = configuration.parentChildScale ** level;
		for (let index = 0; index < count; index += 1) {
			const basePhase = ((index + 0.5) / count) * Math.PI * 2;
			const jitter =
				(hashUnit(seed, level * 4099 + index) - 0.5) *
				configuration.insertionBias *
				((Math.PI * 2) / count) *
				0.7;
			peaks.push({
				phase: basePhase + jitter,
				width: Math.max(0.004, 0.11 * levelScale),
				amplitude: levelScale,
				level,
				onsetAge: level === 0 ? 0 : level / (depth + 0.5)
			});
		}
	}
	return peaks;
}

export function prepareFiniteHierarchy(
	configuration: HierarchyConfiguration,
	seed: number,
	apertureSamples: number
): PreparedHierarchy {
	const peaks = buildFiniteHierarchy(configuration, seed, apertureSamples);
	const levelProfiles = Array.from(
		{ length: Math.min(6, Math.max(0, Math.floor(configuration.depth))) },
		() => new Float64Array(apertureSamples)
	);
	for (const peak of peaks) {
		const profile = levelProfiles[peak.level];
		for (let sample = 0; sample < apertureSamples; sample += 1) {
			const u = (sample / apertureSamples) * Math.PI * 2;
			const distance = periodicAngleDistance(u, peak.phase) / (Math.PI * 2);
			profile[sample] += peak.amplitude * gaussianPulse(distance, peak.width);
		}
	}
	return { peaks, levelProfiles };
}

export function evaluateHierarchy(
	configuration: HierarchyConfiguration,
	context: OrnamentContext,
	prepared?: PreparedHierarchy
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	if (envelope === 0 || configuration.amplitude === 0 || configuration.depth === 0) {
		return { normalized: 0, displacement: 0 };
	}
	let normalized = 0;
	if (prepared && context.apertureIndex !== undefined) {
		for (let level = 0; level < prepared.levelProfiles.length; level += 1) {
			const onsetAge = level === 0 ? 0 : level / (prepared.levelProfiles.length + 0.5);
			const activation = smoothstep(onsetAge, Math.min(1, onsetAge + 0.12), context.age);
			normalized += activation * prepared.levelProfiles[level][context.apertureIndex];
		}
	} else {
		const peaks =
			prepared?.peaks ?? buildFiniteHierarchy(configuration, context.seed, context.apertureSamples);
		for (const peak of peaks) {
			const activation = smoothstep(peak.onsetAge, Math.min(1, peak.onsetAge + 0.12), context.age);
			const distance = periodicAngleDistance(context.u, peak.phase) / (Math.PI * 2);
			normalized += activation * peak.amplitude * gaussianPulse(distance, peak.width);
		}
	}
	normalized = clamp(normalized, 0, 3);
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
