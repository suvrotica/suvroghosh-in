import { describe, expect, it } from 'vitest';
import { compilePriorAuthorizationScenario } from '../engine/compile-scenario';
import { selectClockSeries } from '../engine/selectors';
import { createClockScales } from './scales';
import { createWorkflowLayout, WORKFLOW_TRANSITIONS } from './workflow-layout';

describe('prior-authorization visualization projections', () => {
	it('produces a stable finite hand-authored workflow with twelve nodes', () => {
		const first = createWorkflowLayout(1_080, 520);
		const second = createWorkflowLayout(1_080, 520);
		expect(second).toEqual(first);
		expect(first.nodes).toHaveLength(12);
		expect(first.edges).toHaveLength(WORKFLOW_TRANSITIONS.length);
		for (const node of first.nodes) {
			expect(Number.isFinite(node.x)).toBe(true);
			expect(Number.isFinite(node.y)).toBe(true);
		}
	});

	it('uses independent scales for independent clock units', () => {
		const run = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' });
		const scales = createClockScales(selectClockSeries(run), 600, 180);
		expect(scales.patientElapsed.domain[1]).toBe(run.clocks.patientElapsedMs);
		expect(scales.activeHumanWork.domain[1]).toBe(run.clocks.activeHumanWorkSeconds);
		expect(scales.automatedProcessing.domain[1]).toBe(run.clocks.automatedProcessingMs);
		expect(scales.patientElapsed.map(run.clocks.patientElapsedMs)).toBe(0);
	});
});
