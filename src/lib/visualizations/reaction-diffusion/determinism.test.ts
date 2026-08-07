import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import { ReactionDiffusionCpuEngine } from './engine';
import { createExperimentRecord } from './exports';
import { createInitialField } from './initial';
import { fieldsAreExactlyEqual, replayReactionDiffusion } from './replay';
import type { GrayScottSetup, Intervention } from './types';

const SETUP: GrayScottSetup = {
	...DEFAULT_REACTION_DIFFUSION_SETUP,
	gridSize: 32,
	domainWidth: 32,
	timestep: 0.25,
	seed: 'exact-replay-seed'
};

const EVENTS: readonly Intervention[] = [
	{
		schemaVersion: 1,
		sequence: 4,
		step: 3,
		kind: 'brush',
		tool: 'mixed-pulse',
		shape: 'soft-disk',
		target: 'both',
		from: [0.25, 0.3],
		to: [0.72, 0.67],
		radius: 0.045,
		strength: 0.16,
		falloff: 1.5
	},
	{
		schemaVersion: 1,
		sequence: 2,
		step: 1,
		kind: 'brush',
		tool: 'add-v',
		shape: 'hard-disk',
		target: 'both',
		from: [0.65, 0.35],
		to: [0.65, 0.35],
		radius: 0.08,
		strength: 0.1,
		falloff: 1
	}
];

describe('deterministic initialisation, replay, and reset', () => {
	it('10. creates bit-identical CPU initial arrays for identical setup and seed', () => {
		const ambientRandom = vi.spyOn(Math, 'random');
		const first = createInitialField(SETUP);
		const second = createInitialField({ ...SETUP });
		expect(first.u).toEqual(second.u);
		expect(first.v).toEqual(second.v);
		expect(first.mask).toEqual(second.mask);
		expect(ambientRandom).not.toHaveBeenCalled();
		ambientRandom.mockRestore();
	});

	it('11. replays the same ordered intervention log bit for bit', () => {
		const first = replayReactionDiffusion(SETUP, EVENTS, 12);
		const second = replayReactionDiffusion(SETUP, EVENTS, 12);
		expect(fieldsAreExactlyEqual(first, second)).toBe(true);
	});

	it('12. resets to the exact initial field and replays the same future', () => {
		const engine = new ReactionDiffusionCpuEngine(SETUP, { interventions: EVENTS });
		const initial = engine.snapshot();
		engine.step(12);
		const firstFinal = engine.snapshot();
		engine.reset();
		expect(engine.stepIndex).toBe(0);
		expect(fieldsAreExactlyEqual(engine.state, initial)).toBe(true);
		engine.step(12);
		expect(fieldsAreExactlyEqual(engine.state, firstFinal)).toBe(true);
	});

	it('13. keeps palette and host-theme choices outside the physics state', () => {
		const lightThemeEngine = new ReactionDiffusionCpuEngine(SETUP);
		const paperThemeEngine = new ReactionDiffusionCpuEngine(SETUP);
		lightThemeEngine.step(6);
		paperThemeEngine.step(6);
		const beforeExport = lightThemeEngine.snapshot();
		createExperimentRecord({
			setup: SETUP,
			state: lightThemeEngine.state,
			step: 6,
			palette: 'cividis'
		});
		createExperimentRecord({
			setup: SETUP,
			state: paperThemeEngine.state,
			step: 6,
			palette: 'high-contrast'
		});
		expect(fieldsAreExactlyEqual(lightThemeEngine.state, paperThemeEngine.state)).toBe(true);
		expect(fieldsAreExactlyEqual(lightThemeEngine.state, beforeExport)).toBe(true);
	});
});
