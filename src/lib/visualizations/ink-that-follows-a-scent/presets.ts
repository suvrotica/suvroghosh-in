import {
	DEFAULT_SOURCE_X,
	DEFAULT_SOURCE_Y,
	type PresetDefinition,
	type PresetId,
	type SimulationSettings
} from './types.ts';

export const DEFAULT_SETTINGS: SimulationSettings = {
	sensitivity: 1.2,
	randomWandering: 1.0,
	trailDuration: 14,
	brushSize: 22
};

export const PRESET_ORDER: PresetId[] = ['one-source', 'curved-line'];

export const INK_SCENT_PRESETS: Record<PresetId, PresetDefinition> = {
	'one-source': {
		id: 'one-source',
		label: 'One source',
		shortDescription:
			'A broad chemical source slightly right of centre with particles distributed across the canvas.',
		defaultSettings: { ...DEFAULT_SETTINGS },
		sourceActive: true,
		sourceX: DEFAULT_SOURCE_X,
		sourceY: DEFAULT_SOURCE_Y
	},
	'curved-line': {
		id: 'curved-line',
		label: 'Curved line',
		shortDescription:
			'An invisible curved chemical trail painted across the canvas. Particles gather towards its slopes.',
		defaultSettings: { ...DEFAULT_SETTINGS },
		sourceActive: false,
		sourceX: DEFAULT_SOURCE_X,
		sourceY: DEFAULT_SOURCE_Y
	}
};

export function clampSettings(partial: Partial<SimulationSettings>): SimulationSettings {
	const sensitivity =
		partial.sensitivity !== undefined
			? Math.min(2.5, Math.max(0.0, Number(partial.sensitivity)))
			: DEFAULT_SETTINGS.sensitivity;
	const randomWandering =
		partial.randomWandering !== undefined
			? Math.min(2.5, Math.max(0.2, Number(partial.randomWandering)))
			: DEFAULT_SETTINGS.randomWandering;
	const trailDuration =
		partial.trailDuration !== undefined
			? Math.min(30, Math.max(4, Number(partial.trailDuration)))
			: DEFAULT_SETTINGS.trailDuration;
	const brushSize =
		partial.brushSize !== undefined
			? Math.min(42, Math.max(8, Number(partial.brushSize)))
			: DEFAULT_SETTINGS.brushSize;

	return {
		sensitivity: Number(sensitivity.toFixed(2)),
		randomWandering: Number(randomWandering.toFixed(2)),
		trailDuration: Math.round(trailDuration),
		brushSize: Math.round(brushSize)
	};
}

/**
 * Generates the control points along the canonical "Curved line" preset S-curve
 * in logical [0, 256] x [0, 192] coordinates.
 */
export function buildCurvedLinePoints(samples = 84): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	for (let i = 0; i <= samples; i += 1) {
		const t = i / samples;
		const x = 34 + t * 188;
		const arch = Math.sin(t * Math.PI * 1.35 - 0.18);
		const y = 98 - arch * 44;
		points.push({ x, y });
	}
	return points;
}
