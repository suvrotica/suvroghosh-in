import { normalizeGenome } from './genome';
import { getWorldPreset } from './presets';
import type { CreatureGenome } from './types';

function mix(base: number, target: number, amount: number): number {
	return base + (target - base) * amount;
}

function scaled(base: number, factor: number, amount: number): number {
	return base * mix(1, factor, amount);
}

/**
 * World transforms are speculative art-direction heuristics applied to the phenotype input.
 * They are deliberately separate from the stored genome and are not evolutionary predictions.
 */
export function applyWorldTransform(base: CreatureGenome): CreatureGenome {
	const amount = Math.max(0, Math.min(1, base.worldInfluence));
	if (amount === 0) return base;
	let derived: CreatureGenome = { ...base };

	switch (base.world) {
		case 'terminator-line':
			derived = {
				...derived,
				bodyWidth: scaled(base.bodyWidth, 1.06, amount),
				dorsalArch: scaled(base.dorsalArch, 0.72, amount),
				stanceWidth: scaled(base.stanceWidth, 1.08, amount),
				antennaLength: scaled(base.antennaLength, 1.08, amount),
				fluorescence: mix(base.fluorescence, Math.max(base.fluorescence, 0.34), amount),
				asymmetry: mix(base.asymmetry, Math.min(0.32, base.asymmetry + 0.08), amount)
			};
			break;
		case 'basalt-gravity-well':
			derived = {
				...derived,
				bodyWidth: scaled(base.bodyWidth, 1.18, amount),
				dorsalArch: scaled(base.dorsalArch, 0.48, amount),
				compression: mix(base.compression, Math.max(base.compression, 0.28), amount),
				legLength: scaled(base.legLength, 0.72, amount),
				legThickness: scaled(base.legThickness, 1.34, amount),
				stanceWidth: scaled(base.stanceWidth, 1.16, amount),
				segmentOverlap: mix(base.segmentOverlap, Math.max(base.segmentOverlap, 0.38), amount),
				corrosion: mix(base.corrosion, Math.max(base.corrosion, 0.32), amount)
			};
			break;
		case 'methane-twilight':
			derived = {
				...derived,
				legLength: scaled(base.legLength, 0.9, amount),
				antennaLength: scaled(base.antennaLength, 1.24, amount),
				serration: scaled(base.serration, 0.35, amount),
				spineDensity: scaled(base.spineDensity, 0.4, amount),
				roughness: mix(base.roughness, Math.max(0.42, base.roughness), amount),
				cadence: scaled(base.cadence, 0.48, amount),
				fluorescence: mix(base.fluorescence, Math.max(0.24, base.fluorescence), amount)
			};
			break;
		case 'brine-under-ice':
			derived = {
				...derived,
				bodyLength: scaled(base.bodyLength, 1.06, amount),
				bodyWidth: scaled(base.bodyWidth, 0.94, amount),
				legLength: scaled(base.legLength, 0.88, amount),
				antennaLength: scaled(base.antennaLength, 1.3, amount),
				serration: scaled(base.serration, 0.28, amount),
				spineDensity: scaled(base.spineDensity, 0.25, amount),
				bristleDensity: scaled(base.bristleDensity, 0.2, amount),
				membraneTranslucency: mix(
					base.membraneTranslucency,
					Math.max(0.7, base.membraneTranslucency),
					amount
				),
				cadence: scaled(base.cadence, 0.56, amount),
				terminalModule:
					amount > 0.72 && base.terminalModule === 'none' ? 'tail' : base.terminalModule
			};
			break;
		case 'orbital-ruin':
			derived = {
				...derived,
				bodyWidth: scaled(base.bodyWidth, 1.08, amount),
				legLength: scaled(base.legLength, 1.16, amount),
				stanceWidth: scaled(base.stanceWidth, 1.28, amount),
				dorsalArch: scaled(base.dorsalArch, 0.7, amount),
				cadence: scaled(base.cadence, 0.46, amount),
				gait: amount > 0.64 ? 'clamp-crawl' : base.gait,
				corrosion: mix(base.corrosion, Math.max(base.corrosion, 0.3), amount)
			};
			break;
		case 'ashfall-terrarium':
			derived = {
				...derived,
				segmentOverlap: mix(base.segmentOverlap, Math.max(base.segmentOverlap, 0.46), amount),
				membraneExposure: scaled(base.membraneExposure, 0.62, amount),
				legThickness: scaled(base.legThickness, 1.12, amount),
				bristleDensity: scaled(base.bristleDensity, 1.2, amount),
				corrosion: mix(base.corrosion, Math.max(base.corrosion, 0.48), amount),
				roughness: mix(base.roughness, Math.max(base.roughness, 0.58), amount)
			};
			break;
		case 'monsoon-megacity-2097':
			derived = {
				...derived,
				bodyWidth: scaled(base.bodyWidth, 1.04, amount),
				legLength: scaled(base.legLength, 0.92, amount),
				stanceWidth: scaled(base.stanceWidth, 1.2, amount),
				antennaLength: scaled(base.antennaLength, 1.28, amount),
				roughness: scaled(base.roughness, 0.58, amount),
				cadence: scaled(base.cadence, 1.28, amount),
				gait: amount > 0.72 && base.gait !== 'wave' ? 'skitter' : base.gait
			};
			break;
		case 'red-dune-cathedral':
			derived = {
				...derived,
				stanceWidth: scaled(base.stanceWidth, 1.24, amount),
				legThickness: scaled(base.legThickness, 1.1, amount),
				antennaLength: scaled(base.antennaLength, 0.82, amount),
				eyeScale: scaled(base.eyeScale, 0.78, amount),
				serration: scaled(base.serration, 0.62, amount),
				segmentOverlap: mix(base.segmentOverlap, Math.max(base.segmentOverlap, 0.32), amount),
				corrosion: mix(base.corrosion, Math.max(base.corrosion, 0.42), amount)
			};
			break;
	}

	const world = getWorldPreset(base.world);
	if (amount >= 0.36) derived = { ...derived, palette: world.palette };
	return normalizeGenome(derived, base);
}

export function describeWorldTransform(base: CreatureGenome): readonly string[] {
	if (base.worldInfluence <= 0)
		return ['World influence is zero; the base genome is shown unchanged.'];
	switch (base.world) {
		case 'basalt-gravity-well':
			return [
				'shorter distal leg reach',
				'wider stance',
				'thicker proximal joints',
				'lower shell profile'
			];
		case 'brine-under-ice':
			return [
				'smoother plate edges',
				'fewer exposed bristles',
				'longer sensory filaments',
				'slower dense-medium gait'
			];
		case 'orbital-ruin':
			return [
				'broader clamp stance',
				'less permanent down bias',
				'slower reattachment gait',
				'stronger oxidized wear'
			];
		case 'terminator-line':
			return [
				'lower body',
				'directional sensory emphasis',
				'wider lateral contrast',
				'slightly stronger asymmetry'
			];
		default:
			return [getWorldPreset(base.world).mechanism];
	}
}
