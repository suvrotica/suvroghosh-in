import { describe, expect, it } from 'vitest';
import { interventionFragmentSource } from './gpu/shaders';
import { applyIntervention } from './interventions';
import type { BrushIntervention, FieldState } from './types';

function uniformField(size: number, u = 0.8, v = 0.1): FieldState {
	return {
		size,
		u: new Float64Array(size * size).fill(u),
		v: new Float64Array(size * size).fill(v),
		mask: new Uint8Array(size * size).fill(1)
	};
}

function addVEvent(overrides: Partial<BrushIntervention> = {}): BrushIntervention {
	return {
		schemaVersion: 1,
		sequence: 0,
		step: 0,
		kind: 'brush',
		tool: 'add-v',
		shape: 'soft-disk',
		target: 'both',
		from: [0.525, 0.525],
		to: [0.525, 0.525],
		radius: 0.2,
		strength: 0.4,
		falloff: 2,
		...overrides
	};
}

function applyCentreTool(tool: BrushIntervention['tool']): readonly [number, number] {
	const state = uniformField(20, 0.6, 0.3);
	const index = 10 * state.size + 10;
	applyIntervention(state, addVEvent({ tool, strength: 0.2 }));
	return [state.u[index], state.v[index]];
}

describe('canonical brush interventions', () => {
	it('consumes U one-for-one while adding V at the centre of the Add V brush', () => {
		const state = uniformField(20);
		const index = 10 * state.size + 10;
		applyIntervention(state, addVEvent());
		expect(state.u[index]).toBeCloseTo(0.4, 14);
		expect(state.v[index]).toBeCloseTo(0.5, 14);
		expect(state.u[index] + state.v[index]).toBeCloseTo(0.9, 14);
	});

	it('uses the deterministic soft-disk power falloff for both concentration changes', () => {
		const state = uniformField(20);
		const centre = 10 * state.size + 10;
		const halfRadius = 10 * state.size + 12;
		const outside = 10 * state.size + 19;
		applyIntervention(state, addVEvent());

		// Column 12 is half a radius from column 10. With falloff 2, weight=(1−1/2)²=1/4.
		expect(state.u[centre] - state.u[halfRadius]).toBeCloseTo(-0.3, 14);
		expect(state.v[centre] - state.v[halfRadius]).toBeCloseTo(0.3, 14);
		expect(state.u[halfRadius]).toBeCloseTo(0.7, 14);
		expect(state.v[halfRadius]).toBeCloseTo(0.2, 14);
		expect(state.u[outside]).toBe(0.8);
		expect(state.v[outside]).toBe(0.1);
	});

	it('makes Add U a reverse dilution transfer and keeps Mixed Pulse chemically distinct', () => {
		const addV = applyCentreTool('add-v');
		const addU = applyCentreTool('add-u');
		const mixed = applyCentreTool('mixed-pulse');

		expect(addV[0]).toBeCloseTo(0.4, 14);
		expect(addV[1]).toBeCloseTo(0.5, 14);
		expect(addU[0]).toBeCloseTo(0.8, 14);
		expect(addU[1]).toBeCloseTo(0.1, 14);
		expect(mixed[0]).toBeCloseTo(0.7, 14);
		expect(mixed[1]).toBeCloseTo(0.4, 14);
		expect(mixed).not.toEqual(addV);
		expect(mixed).not.toEqual(addU);
	});

	it('keeps GPU normalized geometry and Add V transfer semantics aligned with the CPU contract', () => {
		expect(interventionFragmentSource).toContain(
			'vec2 point = (vec2(coordinate) + 0.5) / float(uGridSize);'
		);
		expect(interventionFragmentSource).toContain(
			'return pow(1.0 - distanceValue / uRadius, exponentValue);'
		);
		expect(interventionFragmentSource).toMatch(
			/if \(uTool == 0\) \{[\s\S]*?value\.r -= amount;[\s\S]*?value\.g \+= amount;/u
		);
		expect(interventionFragmentSource).toMatch(
			/uTool == 1[\s\S]*?value\.r \+= amount;[\s\S]*?value\.g -= amount;/u
		);
		expect(interventionFragmentSource).toMatch(
			/uTool == 2[\s\S]*?value\.r \+= 0\.5 \* amount;[\s\S]*?value\.g \+= 0\.5 \* amount;/u
		);
	});
});
