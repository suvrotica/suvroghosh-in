export type SheetMesh = {
	positions: Float32Array;
	domain: Float32Array;
	values: Float32Array;
	sheetIndices: Int16Array;
	indices: Uint32Array;
	boundaryIndices: Uint32Array;
	finiteBoundaryIndices: Uint32Array;
	cutBoundaryIndices: Uint32Array;
	degree: number | null;
	connectedAcrossCut: boolean;
	boundaryDescription: string;
};

export type RootSheetOptions = {
	degree: 2 | 3;
	radialMax?: number;
	radialSegments?: number;
	angularSegmentsPerSheet?: number;
	allSheets?: boolean;
};

function rootValue(radius: number, theta: number, degree: number) {
	const scale = radius ** (1 / degree);
	return {
		re: scale * Math.cos(theta / degree),
		im: scale * Math.sin(theta / degree)
	};
}

/**
 * Connected polar continuation of sqrt/cuberoot. In all-sheet mode the angular
 * coordinate runs through every branch and the final cut edge is sewn back to
 * the first. The r=0 ring collapses at the finite branch point.
 */
export function createRootSheetMesh(options: RootSheetOptions): SheetMesh {
	const degree = options.degree;
	const allSheets = options.allSheets ?? true;
	const displayedSheets = allSheets ? degree : 1;
	const radialMax = options.radialMax ?? 3.5;
	const radialSegments = Math.max(4, Math.round(options.radialSegments ?? 32));
	const angularPerSheet = Math.max(12, Math.round(options.angularSegmentsPerSheet ?? 72));
	const angularSegments = angularPerSheet * displayedSheets;
	const angularVertices = allSheets ? angularSegments : angularSegments + 1;
	const vertexCount = (radialSegments + 1) * angularVertices;
	const positions = new Float32Array(vertexCount * 3);
	const domain = new Float32Array(vertexCount * 2);
	const values = new Float32Array(vertexCount * 2);
	const sheetIndices = new Int16Array(vertexCount);

	for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
		const radius = radialMax * (radialIndex / radialSegments) ** 1.35;
		for (let angularIndex = 0; angularIndex < angularVertices; angularIndex += 1) {
			const fraction = angularIndex / angularSegments;
			const theta = -Math.PI + fraction * Math.PI * 2 * displayedSheets;
			const z = { re: radius * Math.cos(theta), im: radius * Math.sin(theta) };
			const w = rootValue(radius, theta, degree);
			const vertex = radialIndex * angularVertices + angularIndex;
			positions[vertex * 3] = z.re;
			positions[vertex * 3 + 1] = w.re;
			positions[vertex * 3 + 2] = z.im;
			domain[vertex * 2] = z.re;
			domain[vertex * 2 + 1] = z.im;
			values[vertex * 2] = w.re;
			values[vertex * 2 + 1] = w.im;
			sheetIndices[vertex] = Math.min(
				displayedSheets - 1,
				Math.max(0, Math.floor((theta + Math.PI) / (Math.PI * 2)))
			);
		}
	}

	const indices: number[] = [];
	const angularCells = allSheets ? angularVertices : angularVertices - 1;
	for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
		for (let angularIndex = 0; angularIndex < angularCells; angularIndex += 1) {
			const nextAngular = allSheets ? (angularIndex + 1) % angularVertices : angularIndex + 1;
			const a = radialIndex * angularVertices + angularIndex;
			const b = radialIndex * angularVertices + nextAngular;
			const c = (radialIndex + 1) * angularVertices + angularIndex;
			const d = (radialIndex + 1) * angularVertices + nextAngular;
			indices.push(a, c, b, b, c, d);
		}
	}
	const finiteBoundaryIndices: number[] = [];
	const cutBoundaryIndices: number[] = [];
	const outerStart = radialSegments * angularVertices;
	const outerSegments = allSheets ? angularVertices : angularVertices - 1;
	for (let angularIndex = 0; angularIndex < outerSegments; angularIndex += 1) {
		finiteBoundaryIndices.push(
			outerStart + angularIndex,
			outerStart + (allSheets ? (angularIndex + 1) % angularVertices : angularIndex + 1)
		);
	}
	if (!allSheets) {
		for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
			cutBoundaryIndices.push(
				radialIndex * angularVertices,
				(radialIndex + 1) * angularVertices,
				radialIndex * angularVertices + angularVertices - 1,
				(radialIndex + 1) * angularVertices + angularVertices - 1
			);
		}
	}
	const boundaryIndices = [...finiteBoundaryIndices, ...cutBoundaryIndices];

	return {
		positions,
		domain,
		values,
		sheetIndices,
		indices: new Uint32Array(indices),
		boundaryIndices: new Uint32Array(boundaryIndices),
		finiteBoundaryIndices: new Uint32Array(finiteBoundaryIndices),
		cutBoundaryIndices: new Uint32Array(cutBoundaryIndices),
		degree,
		connectedAcrossCut: allSheets,
		boundaryDescription: allSheets
			? 'Outer radial edge is a finite visualization boundary; root sheets are sewn cyclically across the cut.'
			: 'The two principal-branch cut edges remain open to show the chosen single-valued branch.'
	};
}

export type LogSheetOptions = {
	sheetRange?: number;
	radialMin?: number;
	radialMax?: number;
	radialSegments?: number;
	angularSegmentsPerSheet?: number;
	allSheets?: boolean;
};

/** Finite helicoid window of log_k(z) = ln r + i(theta + 2πk). */
export function createLogSheetMesh(options: LogSheetOptions = {}): SheetMesh {
	const allSheets = options.allSheets ?? true;
	const sheetRange = Math.max(0, Math.min(5, Math.round(options.sheetRange ?? 2)));
	const firstSheet = allSheets ? -sheetRange : 0;
	const lastSheet = allSheets ? sheetRange : 0;
	const displayedSheets = lastSheet - firstSheet + 1;
	const radialMin = Math.max(0.001, options.radialMin ?? 0.12);
	const radialMax = Math.max(radialMin * 1.01, options.radialMax ?? 3.5);
	const radialSegments = Math.max(4, Math.round(options.radialSegments ?? 28));
	const angularPerSheet = Math.max(12, Math.round(options.angularSegmentsPerSheet ?? 60));
	const angularSegments = angularPerSheet * displayedSheets;
	const angularVertices = angularSegments + 1;
	const vertexCount = (radialSegments + 1) * angularVertices;
	const positions = new Float32Array(vertexCount * 3);
	const domain = new Float32Array(vertexCount * 2);
	const values = new Float32Array(vertexCount * 2);
	const sheetIndices = new Int16Array(vertexCount);
	const thetaStart = -Math.PI + firstSheet * Math.PI * 2;

	for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
		const radialFraction = radialIndex / radialSegments;
		const logRadius = Math.log(radialMin) + radialFraction * Math.log(radialMax / radialMin);
		const radius = Math.exp(logRadius);
		for (let angularIndex = 0; angularIndex < angularVertices; angularIndex += 1) {
			const theta = thetaStart + (angularIndex / angularSegments) * Math.PI * 2 * displayedSheets;
			const z = { re: radius * Math.cos(theta), im: radius * Math.sin(theta) };
			const vertex = radialIndex * angularVertices + angularIndex;
			positions[vertex * 3] = z.re;
			positions[vertex * 3 + 1] = theta / Math.PI;
			positions[vertex * 3 + 2] = z.im;
			domain[vertex * 2] = z.re;
			domain[vertex * 2 + 1] = z.im;
			values[vertex * 2] = logRadius;
			values[vertex * 2 + 1] = theta;
			sheetIndices[vertex] = Math.min(
				lastSheet,
				Math.max(firstSheet, Math.floor((theta + Math.PI) / (Math.PI * 2)))
			);
		}
	}

	const indices: number[] = [];
	for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
		for (let angularIndex = 0; angularIndex < angularSegments; angularIndex += 1) {
			const a = radialIndex * angularVertices + angularIndex;
			const b = a + 1;
			const c = (radialIndex + 1) * angularVertices + angularIndex;
			const d = c + 1;
			indices.push(a, c, b, b, c, d);
		}
	}
	const finiteBoundaryIndices: number[] = [];
	const cutBoundaryIndices: number[] = [];
	for (const radialIndex of [0, radialSegments]) {
		const start = radialIndex * angularVertices;
		for (let angularIndex = 0; angularIndex < angularSegments; angularIndex += 1) {
			finiteBoundaryIndices.push(start + angularIndex, start + angularIndex + 1);
		}
	}
	const angularBoundaryIndices = allSheets ? finiteBoundaryIndices : cutBoundaryIndices;
	for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
		angularBoundaryIndices.push(
			radialIndex * angularVertices,
			(radialIndex + 1) * angularVertices,
			radialIndex * angularVertices + angularSegments,
			(radialIndex + 1) * angularVertices + angularSegments
		);
	}
	const boundaryIndices = [...finiteBoundaryIndices, ...cutBoundaryIndices];

	return {
		positions,
		domain,
		values,
		sheetIndices,
		indices: new Uint32Array(indices),
		boundaryIndices: new Uint32Array(boundaryIndices),
		finiteBoundaryIndices: new Uint32Array(finiteBoundaryIndices),
		cutBoundaryIndices: new Uint32Array(cutBoundaryIndices),
		degree: null,
		connectedAcrossCut: allSheets,
		boundaryDescription: allSheets
			? 'The inner/outer radial edges and the lowest/highest displayed sheet edges are finite visualization boundaries; logarithm has infinitely many sheets.'
			: 'The inner/outer radial edges are finite visualization boundaries; the two principal-branch cut edges remain open.'
	};
}
