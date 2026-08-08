import { describe, expect, it } from 'vitest';
import {
	DEFAULT_NUCLEUS_URL_STATE,
	MAX_NUCLEUS_QUERY_LENGTH,
	parseNucleusUrlState,
	serializeNucleusUrlState
} from './url-state';

describe('Weather Inside the Nucleus URL state', () => {
	it('round-trips a validated versioned share state and preserves unrelated parameters', () => {
		const state = {
			...DEFAULT_NUCLEUS_URL_STATE,
			scenario: 'contact' as const,
			seed: 4_294_967_295,
			contact: 0.875,
			view: 'locus' as const,
			time: 18.25,
			renderer: '2d' as const
		};
		const serialized = serializeNucleusUrlState(state, new URLSearchParams('ref=essay'));
		expect(serialized.get('ref')).toBe('essay');
		expect(serialized.get('nucleus_v')).toBe('1');
		expect(serialized.get('nucleus_model')).toBeTruthy();
		expect(parseNucleusUrlState(serialized).state).toEqual(state);
	});

	it('omits documented defaults except the reconstructive version, model, and seed', () => {
		const serialized = serializeNucleusUrlState(DEFAULT_NUCLEUS_URL_STATE);
		expect([...serialized.keys()].sort()).toEqual(['nucleus_model', 'nucleus_v', 'seed']);
	});

	it('clamps safe finite numbers and rejects hostile or unknown values', () => {
		const parsed = parseNucleusUrlState(
			'?nucleus_v=1&seed=-19&signal=Infinity&duration=900&block=NaN&affinity=-1&contact=4&view=nowhere&renderer=webgpu&hypothesis=magic'
		);
		expect(parsed.state).toMatchObject({
			seed: 0,
			signal: DEFAULT_NUCLEUS_URL_STATE.signal,
			duration: 60,
			block: DEFAULT_NUCLEUS_URL_STATE.block,
			affinity: 0.05,
			contact: 1,
			view: DEFAULT_NUCLEUS_URL_STATE.view
		});
		expect(parsed.state.renderer).toBeUndefined();
		expect(parsed.state.hypothesis).toBeUndefined();
		expect(parsed.issues.length).toBeGreaterThanOrEqual(8);
	});

	it('safely resets unsupported or oversized versions', () => {
		expect(parseNucleusUrlState('?nucleus_v=900&seed=2').unsupportedVersion).toBe(true);
		const oversized = parseNucleusUrlState(`?${'x'.repeat(MAX_NUCLEUS_QUERY_LENGTH + 1)}`);
		expect(oversized.state).toEqual(DEFAULT_NUCLEUS_URL_STATE);
		expect(oversized.issues).toHaveLength(1);
	});

	it('does not apply state authored for a different scientific model', () => {
		const parsed = parseNucleusUrlState(
			'?nucleus_v=1&nucleus_model=weather-inside-nucleus-0.9.0&scenario=contact&seed=99&contact=1&time=42'
		);
		expect(parsed.state).toEqual(DEFAULT_NUCLEUS_URL_STATE);
		expect(parsed.issues).toEqual([expect.objectContaining({ key: 'nucleus_model' })]);
	});
});
