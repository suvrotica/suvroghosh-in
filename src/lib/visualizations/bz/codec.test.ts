import { describe, expect, it } from 'vitest';
import {
	BZ_ENGINE_VERSION,
	BZ_MAX_URL_INTERVENTIONS,
	BZ_SCHEMA_VERSION,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP,
	createBZExperimentRecord,
	decodeBZExperimentJSON,
	decodeBZUrlState,
	encodeBZExperimentJSON,
	encodeBZUrlState,
	encodeBZUrlStateDetailed
} from './index';
import type { BZIntervention, BZUrlState } from './types';

const event: BZIntervention = {
	schemaVersion: BZ_SCHEMA_VERSION,
	sequence: 0,
	step: 12,
	kind: 'excite',
	center: [0.25, 0.75],
	radius: 0.04,
	amount: 0.35
};

function state(model: 'oregonator' | 'schnakenberg' = 'oregonator'): BZUrlState {
	const setup =
		model === 'oregonator'
			? {
					...DEFAULT_OREGONATOR_SETUP,
					parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters },
					gridSize: 96,
					seed: 'url-seed'
				}
			: {
					...DEFAULT_SCHNAKENBERG_SETUP,
					parameters: { ...DEFAULT_SCHNAKENBERG_SETUP.parameters },
					gridSize: 96,
					seed: 'url-seed'
				};
	return {
		setup,
		presetId: model === 'oregonator' ? 'broken-front-spiral' : 'diffusion-driven-spots',
		step: 1_234,
		interventions: [event],
		activeTerms:
			model === 'oregonator'
				? { reaction: true, diffusion: false }
				: { reaction: false, diffusion: true },
		display: { palette: model === 'oregonator' ? 'ferroin' : 'scientific', view: 'net-u' }
	};
}

describe('versioned readable BZ URL state', () => {
	it('round-trips both model schemas, display state, step, and interventions', () => {
		for (const model of ['oregonator', 'schnakenberg'] as const) {
			const original = state(model);
			const encoded = encodeBZUrlState(original, 'foreign=preserved');
			expect(encoded.get('foreign')).toBe('preserved');
			expect(encoded.get('bz_model')).toBe(model);
			expect(encoded.get('bz_dt')).toBe(original.setup.timestep.toString());
			expect(encoded.get('bz_terms')).toBe(model === 'oregonator' ? 'reaction' : 'diffusion');
			const decoded = decodeBZUrlState(encoded);
			expect(decoded.issues).toEqual([]);
			expect(decoded.unsupportedVersion).toBe(false);
			expect(decoded.interventionsOmitted).toBe(false);
			expect(decoded.state).toEqual(original);
		}
	});

	it('omits an oversized URL intervention log and reports the loss of exact replay', () => {
		const events = Array.from({ length: BZ_MAX_URL_INTERVENTIONS + 1 }, (_, sequence) => ({
			...event,
			sequence,
			step: sequence
		}));
		const result = encodeBZUrlStateDetailed({ ...state(), interventions: events });
		expect(result.interventionsOmitted).toBe(true);
		expect(result.params.has('bz_events')).toBe(false);
		expect(result.params.get('bz_log')).toBe('omitted');
		expect(result.issues.join(' ')).toMatch(/JSON/u);
		const decoded = decodeBZUrlState(result.params);
		expect(decoded.interventionsOmitted).toBe(true);
		expect(decoded.state.interventions).toEqual([]);
	});

	it('falls back defensively for unsupported versions and impossible values', () => {
		const unsupported = decodeBZUrlState('bz_v=999&bz_model=schnakenberg&bz_a=0.2');
		expect(unsupported.unsupportedVersion).toBe(true);
		expect(unsupported.state.setup).toEqual(DEFAULT_OREGONATOR_SETUP);

		const invalid = decodeBZUrlState(
			'bz_v=1&bz_model=oregonator&bz_epsilon=-2&bz_q=nope&bz_boundary=periodic&bz_geometry=circular-dish&bz_step=-4'
		);
		expect(invalid.unsupportedVersion).toBe(false);
		expect(invalid.issues.length).toBeGreaterThan(2);
		expect(invalid.state.setup.geometry).toBe('square');
		expect(invalid.state.step).toBe(0);
	});
});

describe('experiment JSON codec', () => {
	it('round-trips a complete readable experiment record', () => {
		const urlState = state('schnakenberg');
		const record = createBZExperimentRecord({
			title: 'Controlled Turing comparison',
			setup: urlState.setup,
			step: urlState.step,
			interventions: urlState.interventions,
			activeTerms: urlState.activeTerms,
			display: urlState.display,
			numericalWarnings: ['Candidate nonlinear morphology has not yet been field-calibrated.'],
			exportedAt: '2026-08-08T12:00:00.000Z'
		});
		const json = encodeBZExperimentJSON(record);
		expect(json).toContain('"engineVersion": "bz-heun-five-point-f64-v1"');
		expect(json).toContain('"equationsId": "schnakenberg-2v-dimensionless"');
		expect(json).toContain('"interventions"');
		const decoded = decodeBZExperimentJSON(json);
		expect(decoded).toEqual(record);
		expect(decoded.schemaVersion).toBe(BZ_SCHEMA_VERSION);
		expect(decoded.engineVersion).toBe(BZ_ENGINE_VERSION);
		expect(decoded.modelTime).toBe(decoded.step * decoded.timestep);
		expect(decoded.activeTerms).toEqual(urlState.activeTerms);

		const legacy = JSON.parse(json) as Record<string, unknown>;
		delete legacy.activeTerms;
		expect(decodeBZExperimentJSON(JSON.stringify(legacy)).activeTerms).toEqual({
			reaction: true,
			diffusion: true
		});
	});

	it('rejects inconsistent redundant metadata instead of silently coercing it', () => {
		const record = createBZExperimentRecord({
			title: 'Tamper test',
			setup: state().setup,
			step: 100,
			interventions: [event],
			exportedAt: '2026-08-08T12:00:00.000Z'
		});
		const parsed = JSON.parse(encodeBZExperimentJSON(record)) as Record<string, unknown>;
		parsed.modelTime = 999;
		expect(() => decodeBZExperimentJSON(JSON.stringify(parsed))).toThrow(/model time/u);
		parsed.modelTime = record.modelTime;
		parsed.engineVersion = 'unknown-engine';
		expect(() => decodeBZExperimentJSON(JSON.stringify(parsed))).toThrow(/engine version/u);
	});
});
