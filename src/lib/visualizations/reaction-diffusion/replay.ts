import { ReactionDiffusionCpuEngine } from './engine';
import type { BrushTarget, FieldState, GrayScottSetup, Intervention } from './types';

export function createReplayEngine(
	setup: Readonly<GrayScottSetup>,
	interventions: readonly Readonly<Intervention>[],
	target: BrushTarget = 'both'
): ReactionDiffusionCpuEngine {
	return new ReactionDiffusionCpuEngine(setup, { interventions, target });
}

export function replayReactionDiffusion(
	setup: Readonly<GrayScottSetup>,
	interventions: readonly Readonly<Intervention>[],
	steps: number,
	target: BrushTarget = 'both'
): FieldState {
	const engine = createReplayEngine(setup, interventions, target);
	engine.step(steps);
	return engine.snapshot();
}

export function fieldsAreExactlyEqual(a: Readonly<FieldState>, b: Readonly<FieldState>): boolean {
	if (a.size !== b.size || a.u.length !== b.u.length || a.v.length !== b.v.length) return false;
	for (let index = 0; index < a.u.length; index += 1) {
		if (a.u[index] !== b.u[index] || a.v[index] !== b.v[index] || a.mask[index] !== b.mask[index]) {
			return false;
		}
	}
	return true;
}
