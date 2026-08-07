import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import { ReactionDiffusionCpuEngine } from './engine';
import {
	createExperimentRecord,
	experimentMethodsText,
	experimentSummaryText,
	measurementsToCsv,
	parseExperimentRecord,
	serializeExperimentRecord,
	validateExperimentRecord
} from './exports';
import { decodeReactionDiffusionUrlState, encodeReactionDiffusionUrlState } from './url-state';
import type { GrayScottSetup, Intervention, MeasurementSample } from './types';

const SETUP: GrayScottSetup = {
	...DEFAULT_REACTION_DIFFUSION_SETUP,
	feed: 0.041,
	kill: 0.058,
	diffusionU: 0.12,
	diffusionV: 0.055,
	timestep: 0.2,
	gridSize: 32,
	domainWidth: 40,
	boundary: 'no-flux',
	maskPreset: 'annulus',
	initialCondition: 'ring',
	seed: 'share-state-Δ',
	integrator: 'euler'
};

const EVENT_A: Intervention = {
	schemaVersion: 1,
	sequence: 9,
	step: 4,
	kind: 'mask',
	active: false,
	from: [0.3, 0.4],
	to: [0.7, 0.4],
	radius: 0.03
};
const EVENT_B: Intervention = {
	schemaVersion: 1,
	sequence: 3,
	step: 4,
	kind: 'brush',
	tool: 'add-v',
	shape: 'hard-disk',
	target: 'both',
	from: [0.2, 0.2],
	to: [0.2, 0.2],
	radius: 0.05,
	strength: 0.2,
	falloff: 1
};
const EVENT_C: Intervention = {
	schemaVersion: 1,
	sequence: 7,
	step: 2,
	kind: 'mask',
	active: true,
	from: [0.5, 0.5],
	to: [0.5, 0.5],
	radius: 0.02
};

function sample(step: number): MeasurementSample {
	return {
		step,
		modelTime: step * SETUP.timestep,
		meanU: 0.8 - step * 0.001,
		meanV: 0.1 + step * 0.001,
		varianceV: 0.002,
		meanReactionRate: 0.008,
		minimumU: 0.2,
		maximumU: 1.1,
		minimumV: -0.01,
		maximumV: 0.62,
		activeCells: 500,
		dominantWavelength: step % 2 ? null : 12.5,
		residualU: 2e-15,
		residualV: -3e-15,
		comparisonDifference: null
	};
}

function record() {
	const engine = new ReactionDiffusionCpuEngine(SETUP, {
		interventions: [EVENT_A, EVENT_B, EVENT_C]
	});
	engine.step(6);
	return createExperimentRecord({
		setup: SETUP,
		state: engine.state,
		step: engine.stepIndex,
		interventions: [EVENT_A, EVENT_B, EVENT_C],
		history: [sample(0), sample(2), sample(4), sample(6)],
		displayMode: 'composite',
		palette: 'cividis'
	});
}

describe('versioned shared setup and experiment exports', () => {
	it('26. round-trips owned URL state while preserving unrelated query parameters', () => {
		const encoded = encodeReactionDiffusionUrlState(
			{
				setup: SETUP,
				displayMode: 'u-minus-v',
				palette: 'diverging',
				selectedPanel: 'stability'
			},
			new URLSearchParams('utm_source=observatory&lang=en&rd_old=left-alone')
		);
		expect(encoded.get('utm_source')).toBe('observatory');
		expect(encoded.get('lang')).toBe('en');
		expect(encoded.get('rd_old')).toBe('left-alone');
		expect(encoded.get('rd_panel')).toBe('diagnostics');
		const decoded = decodeReactionDiffusionUrlState(encoded);
		expect(decoded.issues).toEqual([]);
		expect(decoded.setup).toEqual(SETUP);
		expect(decoded.displayMode).toBe('u-minus-v');
		expect(decoded.palette).toBe('diverging');
		expect(decoded.selectedPanel).toBe('diagnostics');
	});

	it('27. falls back safely with a visible issue for invalid and future URL schemas', () => {
		const invalid = decodeReactionDiffusionUrlState(
			'?rd_v=1&rd_f=not-a-number&rd_boundary=teleport'
		);
		expect(invalid.setup.feed).toBe(DEFAULT_REACTION_DIFFUSION_SETUP.feed);
		expect(invalid.setup.boundary).toBe(DEFAULT_REACTION_DIFFUSION_SETUP.boundary);
		expect(invalid.issues.length).toBeGreaterThanOrEqual(2);

		const invalidPanel = decodeReactionDiffusionUrlState('?rd_v=1&rd_panel=invented-panel');
		expect(invalidPanel.selectedPanel).toBe('laboratory');
		expect(invalidPanel.issues).toContain(
			'The shared instrument panel was not recognised; the laboratory panel was restored.'
		);
		const legacyPanel = decodeReactionDiffusionUrlState('?rd_v=1&rd_panel=stability');
		expect(legacyPanel.selectedPanel).toBe('diagnostics');
		expect(legacyPanel.issues).toEqual([]);

		const future = decodeReactionDiffusionUrlState('?rd_v=999&rd_f=0.01');
		expect(future.unsupportedVersion).toBe(true);
		expect(future.setup).toEqual(DEFAULT_REACTION_DIFFUSION_SETUP);
		expect(future.issues[0]).toContain('unsupported schema');
	});

	it('28. produces JSON that validates against the internal experiment schema', () => {
		const original = record();
		const serialized = serializeExperimentRecord(original);
		const parsed = parseExperimentRecord(serialized);
		expect(validateExperimentRecord(parsed)).toMatchObject({ valid: true, issues: [] });
		expect(parsed).toEqual(original);
		expect(validateExperimentRecord({ ...parsed, model: 'invented-model' }).valid).toBe(false);
		expect(validateExperimentRecord({ ...parsed, measurements: {} }).valid).toBe(false);
		expect(
			validateExperimentRecord({
				...parsed,
				interventions: [{ ...EVENT_B, tool: 'teleport-chemistry' }]
			}).valid
		).toBe(false);
		expect(experimentSummaryText(parsed)).toContain('Mean U / V');
		expect(experimentMethodsText(parsed)).toContain('∂u/∂t');
	});

	it('29. emits stable CSV columns containing only finite numeric values or explicit empty nulls', () => {
		const csv = measurementsToCsv([sample(0), sample(1)]);
		const [header, ...rows] = csv.split('\n');
		expect(header).toBe(
			'step,modelTime,meanU,meanV,varianceV,meanReactionRate,minimumU,maximumU,minimumV,maximumV,activeCells,dominantWavelength,residualU,residualV,comparisonDifference'
		);
		expect(csv).not.toMatch(/NaN|Infinity/u);
		for (const row of rows) {
			for (const cell of row.split(',')) {
				if (cell !== '') expect(Number.isFinite(Number(cell))).toBe(true);
			}
		}
	});

	it('30. preserves canonical step-then-sequence event ordering through JSON serialization', () => {
		const parsed = parseExperimentRecord(serializeExperimentRecord(record()));
		expect(parsed.interventions.map(({ step, sequence }) => [step, sequence])).toEqual([
			[2, 7],
			[4, 3],
			[4, 9]
		]);
	});
});
