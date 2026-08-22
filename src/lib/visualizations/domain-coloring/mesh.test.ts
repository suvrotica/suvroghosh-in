import { describe, expect, it } from 'vitest';
import { parseExpression } from './expression';
import { createLandscapeMesh, type LandscapeMesh } from './mesh';
import { domainColoringPreset } from './presets';
import type { Complex } from './types';

function expectWellFormed(mesh: LandscapeMesh): void {
	const vertexCount = mesh.positions.length / 3;
	expect(Number.isInteger(vertexCount)).toBe(true);
	expect(mesh.domain).toHaveLength(vertexCount * 2);
	expect(mesh.indices.length % 3).toBe(0);
	expect(mesh.positions.every(Number.isFinite)).toBe(true);
	expect(mesh.domain.every(Number.isFinite)).toBe(true);

	for (const index of mesh.indices) {
		expect(Number.isInteger(index)).toBe(true);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(vertexCount);
	}

	for (let vertex = 0; vertex < vertexCount; vertex += 1) {
		expect(mesh.positions[vertex * 3]).toBe(mesh.domain[vertex * 2]);
		expect(mesh.positions[vertex * 3 + 2]).toBe(mesh.domain[vertex * 2 + 1]);
	}

	expect(vertexCount).toBeGreaterThanOrEqual(mesh.stats.drawnCells * 4);
	expect(vertexCount).toBeLessThanOrEqual(mesh.stats.drawnCells * 5);
	expect(mesh.indices.length).toBeGreaterThanOrEqual(mesh.stats.drawnCells * 6);
	expect(mesh.indices.length).toBeLessThanOrEqual(mesh.stats.drawnCells * 12);
	expect(
		mesh.stats.drawnCells +
			mesh.stats.invalidCells +
			mesh.stats.cutCells +
			mesh.stats.unresolvedCells
	).toBe(mesh.stats.baseCells + mesh.stats.refinedCells * 3);
}

function vertex(mesh: LandscapeMesh, index: number): Complex {
	return { re: mesh.domain[index * 2], im: mesh.domain[index * 2 + 1] };
}

function signedArea(a: Complex, b: Complex, point: Complex): number {
	return (b.re - a.re) * (point.im - a.im) - (b.im - a.im) * (point.re - a.re);
}

function triangleContains(point: Complex, a: Complex, b: Complex, c: Complex): boolean {
	const areas = [signedArea(a, b, point), signedArea(b, c, point), signedArea(c, a, point)];
	const epsilon = 1e-10;
	return !(areas.some((area) => area < -epsilon) && areas.some((area) => area > epsilon));
}

function edgeCrossesNegativeRealCut(a: Complex, b: Complex): boolean {
	const epsilon = 1e-8;
	if (!((a.im < -epsilon && b.im > epsilon) || (b.im < -epsilon && a.im > epsilon))) {
		return false;
	}
	const fraction = -a.im / (b.im - a.im);
	const intersectionRe = a.re + fraction * (b.re - a.re);
	return intersectionRe < -epsilon;
}

function triangleBridgesNegativeRealCut(a: Complex, b: Complex, c: Complex): boolean {
	return (
		edgeCrossesNegativeRealCut(a, b) ||
		edgeCrossesNegativeRealCut(b, c) ||
		edgeCrossesNegativeRealCut(c, a)
	);
}

describe('adaptive landscape mesh', () => {
	it('emits finite, index-valid clipped log2-magnitude geometry', () => {
		const preset = domainColoringPreset('identity')!;
		const mesh = createLandscapeMesh(
			parseExpression(preset.expression),
			preset.view,
			preset.height,
			'low',
			preset
		);

		expectWellFormed(mesh);
		expect(mesh.stats.baseCells).toBe(140);
		expect(mesh.stats.drawnCells).toBeGreaterThan(0);
		expect(mesh.stats.evaluations).toBeGreaterThan(0);
		expect(mesh.stats.evaluations).toBeLessThanOrEqual(12_000);
		const displayedCap = preset.height.logCap * preset.height.verticalScale;
		for (let vertexIndex = 0; vertexIndex < mesh.positions.length / 3; vertexIndex += 1) {
			expect(Math.abs(mesh.positions[vertexIndex * 3 + 1])).toBeLessThanOrEqual(
				displayedCap + 1e-6
			);
		}
	});

	it('terminates a known reciprocal pole at the labelled high cap', () => {
		const preset = domainColoringPreset('reciprocal')!;
		const mesh = createLandscapeMesh(
			parseExpression(preset.expression),
			preset.view,
			preset.height,
			'low',
			preset
		);

		expectWellFormed(mesh);
		const cap = preset.height.logCap * preset.height.verticalScale;
		expect(
			Math.max(...Array.from(mesh.positions).filter((_, index) => index % 3 === 1))
		).toBeCloseTo(cap, 6);
		const pole = { re: 0, im: 0 };
		const poleVertices = Array.from({ length: mesh.domain.length / 2 }, (_, index) => index).filter(
			(index) =>
				Math.hypot(vertex(mesh, index).re - pole.re, vertex(mesh, index).im - pole.im) < 1e-8
		);
		expect(poleVertices.length).toBeGreaterThan(0);
		for (const index of poleVertices) expect(mesh.positions[index * 3 + 1]).toBeCloseTo(cap, 6);
	});

	it('opens the negative-real cut for phase geometry without cutting magnitude geometry', () => {
		const preset = domainColoringPreset('square-root')!;
		const node = parseExpression(preset.expression);
		const phaseMesh = createLandscapeMesh(
			node,
			preset.view,
			{ ...preset.height, lens: 'phase' },
			'low',
			preset
		);
		const magnitudeMesh = createLandscapeMesh(
			node,
			preset.view,
			{ ...preset.height, lens: 'log-magnitude' },
			'low',
			preset
		);

		expectWellFormed(phaseMesh);
		expectWellFormed(magnitudeMesh);
		expect(phaseMesh.stats.cutCells).toBeGreaterThan(0);
		for (let offset = 0; offset < phaseMesh.indices.length; offset += 3) {
			const a = vertex(phaseMesh, phaseMesh.indices[offset]);
			const b = vertex(phaseMesh, phaseMesh.indices[offset + 1]);
			const c = vertex(phaseMesh, phaseMesh.indices[offset + 2]);
			expect(triangleBridgesNegativeRealCut(a, b, c)).toBe(false);
		}

		expect(magnitudeMesh.stats.cutCells).toBe(0);
		expect(magnitudeMesh.stats.drawnCells).toBeGreaterThan(0);
		const retainsNegativeAxis = Array.from({ length: magnitudeMesh.indices.length }, (_, offset) =>
			vertex(magnitudeMesh, magnitudeMesh.indices[offset])
		).some((point) => point.re < -1e-6 && Math.abs(point.im) < 1e-7);
		expect(retainsNegativeAxis).toBe(true);
	});

	it('keeps literal z^3 - 1 zeros at the labelled low cap in log-magnitude geometry', () => {
		const preset = domainColoringPreset('roots-of-unity')!;
		expect(preset.expression).toBe('z^3 - 1');
		const mesh = createLandscapeMesh(
			parseExpression(preset.expression),
			preset.view,
			preset.height,
			'medium',
			preset
		);
		const lowCap = -preset.height.logCap * preset.height.verticalScale;
		expect(
			Math.min(...Array.from(mesh.positions).filter((_, index) => index % 3 === 1))
		).toBeCloseTo(lowCap, 6);
	});

	it("does not triangulate the undefined principal phase through identity's zero", () => {
		const preset = domainColoringPreset('identity')!;
		const mesh = createLandscapeMesh(
			parseExpression(preset.expression),
			preset.view,
			{ ...preset.height, lens: 'phase' },
			'medium',
			preset
		);

		expectWellFormed(mesh);
		expect(mesh.stats.invalidCells).toBeGreaterThan(0);
		const zero = { re: 0, im: 0 };
		for (let offset = 0; offset < mesh.indices.length; offset += 3) {
			const a = vertex(mesh, mesh.indices[offset]);
			const b = vertex(mesh, mesh.indices[offset + 1]);
			const c = vertex(mesh, mesh.indices[offset + 2]);
			expect(triangleContains(zero, a, b, c)).toBe(false);
		}
	});

	it('splits the identity principal-phase seam without over-cutting continuous branch components', () => {
		const identity = domainColoringPreset('identity')!;
		const identityPhase = createLandscapeMesh(
			parseExpression(identity.expression),
			identity.view,
			{ ...identity.height, lens: 'phase' },
			'low',
			identity
		);
		expect(identityPhase.stats.cutCells).toBeGreaterThan(0);
		let largestTriangleJump = 0;
		for (let offset = 0; offset < identityPhase.indices.length; offset += 3) {
			const heights = [0, 1, 2].map(
				(index) => identityPhase.positions[identityPhase.indices[offset + index] * 3 + 1]
			);
			largestTriangleJump = Math.max(
				largestTriangleJump,
				Math.max(...heights) - Math.min(...heights)
			);
		}
		expect(largestTriangleJump).toBeLessThan(identity.height.verticalScale * 1.5);

		const logarithm = domainColoringPreset('logarithm')!;
		const node = parseExpression(logarithm.expression);
		const realMesh = createLandscapeMesh(
			node,
			logarithm.view,
			{ ...logarithm.height, lens: 'real' },
			'low',
			logarithm
		);
		const imaginaryMesh = createLandscapeMesh(
			node,
			logarithm.view,
			{ ...logarithm.height, lens: 'imaginary' },
			'low',
			logarithm
		);
		expect(realMesh.stats.cutCells).toBe(0);
		expect(imaginaryMesh.stats.cutCells).toBeGreaterThan(0);
	});
});
