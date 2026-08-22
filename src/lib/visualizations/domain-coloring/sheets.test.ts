import { describe, expect, it } from 'vitest';
import { createLogSheetMesh, createRootSheetMesh, type SheetMesh } from './sheets';

function expectWellFormed(mesh: SheetMesh): void {
	const vertexCount = mesh.positions.length / 3;
	expect(Number.isInteger(vertexCount)).toBe(true);
	expect(mesh.domain).toHaveLength(vertexCount * 2);
	expect(mesh.values).toHaveLength(vertexCount * 2);
	expect(mesh.sheetIndices).toHaveLength(vertexCount);
	expect(mesh.indices.length % 3).toBe(0);
	expect(mesh.boundaryIndices.length % 2).toBe(0);
	expect(mesh.boundaryIndices.length).toBeGreaterThan(0);
	expect(mesh.finiteBoundaryIndices.length % 2).toBe(0);
	expect(mesh.cutBoundaryIndices.length % 2).toBe(0);
	expect(mesh.boundaryIndices).toEqual(
		new Uint32Array([...mesh.finiteBoundaryIndices, ...mesh.cutBoundaryIndices])
	);
	expect(mesh.positions.every(Number.isFinite)).toBe(true);
	expect(mesh.domain.every(Number.isFinite)).toBe(true);
	expect(mesh.values.every(Number.isFinite)).toBe(true);
	expect(mesh.sheetIndices.every(Number.isFinite)).toBe(true);

	for (const index of mesh.indices) {
		expect(Number.isInteger(index)).toBe(true);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(vertexCount);
	}
	for (const index of [
		...mesh.boundaryIndices,
		...mesh.finiteBoundaryIndices,
		...mesh.cutBoundaryIndices
	]) {
		expect(Number.isInteger(index)).toBe(true);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(vertexCount);
	}

	for (let vertex = 0; vertex < vertexCount; vertex += 1) {
		expect(mesh.positions[vertex * 3]).toBe(mesh.domain[vertex * 2]);
		expect(mesh.positions[vertex * 3 + 2]).toBe(mesh.domain[vertex * 2 + 1]);
	}
}

function triangleHasAngularPair(
	mesh: SheetMesh,
	angularVertices: number,
	first: number,
	second: number
): boolean {
	for (let offset = 0; offset < mesh.indices.length; offset += 3) {
		const residues = [
			mesh.indices[offset] % angularVertices,
			mesh.indices[offset + 1] % angularVertices,
			mesh.indices[offset + 2] % angularVertices
		];
		if (residues.includes(first) && residues.includes(second)) return true;
	}
	return false;
}

function expectRootEquation(mesh: SheetMesh, degree: 2 | 3): void {
	const vertexCount = mesh.positions.length / 3;
	for (let vertex = 0; vertex < vertexCount; vertex += 1) {
		const zRe = mesh.domain[vertex * 2];
		const zIm = mesh.domain[vertex * 2 + 1];
		const wRe = mesh.values[vertex * 2];
		const wIm = mesh.values[vertex * 2 + 1];
		const squareRe = wRe * wRe - wIm * wIm;
		const squareIm = 2 * wRe * wIm;
		const powerRe = degree === 2 ? squareRe : squareRe * wRe - squareIm * wIm;
		const powerIm = degree === 2 ? squareIm : squareRe * wIm + squareIm * wRe;
		expect(Math.hypot(powerRe - zRe, powerIm - zIm)).toBeLessThan(2e-5);
	}
}

describe('curated root sheet meshes', () => {
	it.each([
		{ degree: 2 as const, sheets: [0, 1] },
		{ degree: 3 as const, sheets: [0, 1, 2] }
	])(
		'constructs finite connected degree-$degree continuations satisfying w^n = z',
		({ degree, sheets }) => {
			const mesh = createRootSheetMesh({
				degree,
				radialMax: 2.5,
				radialSegments: 4,
				angularSegmentsPerSheet: 12,
				allSheets: true
			});

			expectWellFormed(mesh);
			expectRootEquation(mesh, degree);
			expect(mesh.degree).toBe(degree);
			expect(mesh.connectedAcrossCut).toBe(true);
			expect(mesh.finiteBoundaryIndices.length).toBeGreaterThan(0);
			expect(mesh.cutBoundaryIndices).toHaveLength(0);
			expect([...new Set(mesh.sheetIndices)]).toEqual(sheets);
			expect(mesh.boundaryDescription).toContain('finite visualization boundary');
			expect(mesh.boundaryDescription).toContain('sewn cyclically');

			const angularVertices = 12 * degree;
			expect(triangleHasAngularPair(mesh, angularVertices, 0, angularVertices - 1)).toBe(true);

			// The cyclic seam identifies the omitted terminal edge with the first
			// edge: their continued z and w values agree at every radial level.
			for (let radial = 0; radial <= 4; radial += 1) {
				const first = radial * angularVertices;
				const radius = Math.hypot(mesh.domain[first * 2], mesh.domain[first * 2 + 1]);
				const terminalTheta = -Math.PI + Math.PI * 2 * degree;
				const rootRadius = radius ** (1 / degree);
				expect(mesh.domain[first * 2]).toBeCloseTo(radius * Math.cos(terminalTheta), 5);
				expect(mesh.domain[first * 2 + 1]).toBeCloseTo(radius * Math.sin(terminalTheta), 5);
				expect(mesh.values[first * 2]).toBeCloseTo(
					rootRadius * Math.cos(terminalTheta / degree),
					5
				);
				expect(mesh.values[first * 2 + 1]).toBeCloseTo(
					rootRadius * Math.sin(terminalTheta / degree),
					5
				);
			}

			// The finite branch point collapses the complete innermost ring to z = w = 0.
			for (let angular = 0; angular < angularVertices; angular += 1) {
				expect(Math.abs(mesh.domain[angular * 2])).toBeLessThan(1e-12);
				expect(Math.abs(mesh.domain[angular * 2 + 1])).toBeLessThan(1e-12);
				expect(Math.abs(mesh.values[angular * 2])).toBeLessThan(1e-12);
				expect(Math.abs(mesh.values[angular * 2 + 1])).toBeLessThan(1e-12);
			}
		}
	);

	it('leaves the two cut edges open for a single principal root branch', () => {
		const mesh = createRootSheetMesh({
			degree: 2,
			radialSegments: 4,
			angularSegmentsPerSheet: 12,
			allSheets: false
		});

		expectWellFormed(mesh);
		expectRootEquation(mesh, 2);
		expect(mesh.connectedAcrossCut).toBe(false);
		expect(mesh.finiteBoundaryIndices.length).toBeGreaterThan(0);
		expect(mesh.cutBoundaryIndices.length).toBeGreaterThan(0);
		expect([...new Set(mesh.sheetIndices)]).toEqual([0]);
		expect(mesh.boundaryDescription).toContain('cut edges remain open');
		expect(triangleHasAngularPair(mesh, 13, 0, 12)).toBe(false);
	});
});

describe('curated logarithm sheet mesh', () => {
	it('forms one continuous finite helicoid window while retaining its true open boundaries', () => {
		const mesh = createLogSheetMesh({
			sheetRange: 1,
			radialMin: 0.2,
			radialMax: 2,
			radialSegments: 4,
			angularSegmentsPerSheet: 12,
			allSheets: true
		});
		const angularPerSheet = 12;
		const angularVertices = 37;

		expectWellFormed(mesh);
		expect(mesh.degree).toBeNull();
		expect(mesh.connectedAcrossCut).toBe(true);
		expect(mesh.finiteBoundaryIndices.length).toBeGreaterThan(0);
		expect(mesh.cutBoundaryIndices).toHaveLength(0);
		expect([...new Set(mesh.sheetIndices)]).toEqual([-1, 0, 1]);
		expect(mesh.boundaryDescription).toContain('finite visualization boundaries');
		expect(mesh.boundaryDescription).toContain('lowest/highest displayed sheet edges');
		expect(mesh.boundaryDescription).toContain('infinitely many sheets');

		// exp(log r + i theta) returns the domain point at every sampled vertex.
		for (let vertex = 0; vertex < mesh.sheetIndices.length; vertex += 1) {
			const logRadius = mesh.values[vertex * 2];
			const theta = mesh.values[vertex * 2 + 1];
			const radius = Math.exp(logRadius);
			const reconstructedRe = radius * Math.cos(theta);
			const reconstructedIm = radius * Math.sin(theta);
			expect(
				Math.hypot(
					reconstructedRe - mesh.domain[vertex * 2],
					reconstructedIm - mesh.domain[vertex * 2 + 1]
				)
			).toBeLessThan(2e-5);
		}

		// Successive turns occupy the same punctured domain but differ by 2 pi in log value.
		for (let radial = 0; radial <= 4; radial += 1) {
			const row = radial * angularVertices;
			for (let turn = 0; turn < 3; turn += 1) {
				const first = row + turn * angularPerSheet;
				const next = first + angularPerSheet;
				expect(mesh.domain[next * 2]).toBeCloseTo(mesh.domain[first * 2], 5);
				expect(mesh.domain[next * 2 + 1]).toBeCloseTo(mesh.domain[first * 2 + 1], 5);
				expect(mesh.values[next * 2]).toBeCloseTo(mesh.values[first * 2], 6);
				expect(mesh.values[next * 2 + 1] - mesh.values[first * 2 + 1]).toBeCloseTo(Math.PI * 2, 5);
			}
		}

		const crossesSheetBoundary = Array.from({ length: mesh.indices.length / 3 }, (_, triangle) => {
			const offset = triangle * 3;
			return (
				new Set([
					mesh.sheetIndices[mesh.indices[offset]],
					mesh.sheetIndices[mesh.indices[offset + 1]],
					mesh.sheetIndices[mesh.indices[offset + 2]]
				]).size > 1
			);
		}).some(Boolean);
		expect(crossesSheetBoundary).toBe(true);

		// The finite window is not falsely closed from its highest turn back to its lowest.
		expect(triangleHasAngularPair(mesh, angularVertices, 0, angularVertices - 1)).toBe(false);
	});

	it('keeps the principal logarithm strip open and single-sheeted', () => {
		const mesh = createLogSheetMesh({
			sheetRange: 4,
			radialSegments: 4,
			angularSegmentsPerSheet: 12,
			allSheets: false
		});

		expectWellFormed(mesh);
		expect(mesh.connectedAcrossCut).toBe(false);
		expect(mesh.finiteBoundaryIndices.length).toBeGreaterThan(0);
		expect(mesh.cutBoundaryIndices.length).toBeGreaterThan(0);
		expect(mesh.boundaryDescription).toContain('principal-branch cut edges remain open');
		expect([...new Set(mesh.sheetIndices)]).toEqual([0]);
		expect(triangleHasAngularPair(mesh, 13, 0, 12)).toBe(false);
	});
});
