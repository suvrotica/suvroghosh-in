import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REACTION_DIFFUSION_PRESETS } from './presets';
import { REACTION_DIFFUSION_ENGINE_VERSION } from './types';

type CalibrationRow = {
	id: string;
	label: string;
	setup: Record<string, unknown>;
	step: number;
	modelTime: number;
	metrics: { meanV: number; varianceV: number };
	fieldSha256: string;
};

const artifact = JSON.parse(
	readFileSync(
		new URL(
			'../../../../static/images/visualizations/reaction-diffusion/preset-calibration.json',
			import.meta.url
		),
		'utf8'
	)
) as { engineVersion: string; calibrations: CalibrationRow[] };

function numericalSetup(preset: (typeof REACTION_DIFFUSION_PRESETS)[number]) {
	const setup = { ...preset } as Record<string, unknown>;
	for (const key of [
		'id',
		'label',
		'description',
		'recommendedModelTime',
		'observationPrompt',
		'conditionalNote'
	]) {
		delete setup[key];
	}
	return setup;
}

describe('deterministically calibrated presets', () => {
	it('keeps one complete checksummed calibration row for every typed preset', () => {
		expect(artifact.engineVersion).toBe(REACTION_DIFFUSION_ENGINE_VERSION);
		expect(artifact.calibrations).toHaveLength(REACTION_DIFFUSION_PRESETS.length);
		expect(new Set(REACTION_DIFFUSION_PRESETS.map((preset) => preset.id)).size).toBe(
			REACTION_DIFFUSION_PRESETS.length
		);

		for (const preset of REACTION_DIFFUSION_PRESETS) {
			const calibration = artifact.calibrations.find((candidate) => candidate.id === preset.id);
			expect(calibration, preset.id).toBeDefined();
			expect(calibration?.label).toBe(preset.label);
			expect(calibration?.setup).toEqual(numericalSetup(preset));
			expect(calibration?.modelTime).toBe(preset.recommendedModelTime);
			expect(calibration?.step).toBe(Math.round(preset.recommendedModelTime / preset.timestep));
			expect(calibration?.fieldSha256).toMatch(/^[a-f0-9]{64}$/u);
			expect(preset.observationPrompt.length).toBeGreaterThan(24);
			expect(preset.conditionalNote).toMatch(/t = 1000|t = 1,000|deterministic/iu);
		}
	});

	it('uses extinction names only for quantitatively extinguished fields', () => {
		for (const id of ['collapse-to-feed', 'sparse-seed-extinction', 'channel-extinction']) {
			const calibration = artifact.calibrations.find((candidate) => candidate.id === id);
			expect(calibration?.metrics.meanV, id).toBeLessThan(1e-20);
			expect(calibration?.metrics.varianceV, id).toBeLessThan(1e-40);
		}
		for (const id of [
			'concentric-vessel-fronts',
			'seam-spanning-bands',
			'reservoir-loop-lattice'
		]) {
			const calibration = artifact.calibrations.find((candidate) => candidate.id === id);
			expect(calibration?.metrics.meanV, id).toBeGreaterThan(0.01);
			expect(calibration?.metrics.varianceV, id).toBeGreaterThan(0.001);
		}
	});
});
