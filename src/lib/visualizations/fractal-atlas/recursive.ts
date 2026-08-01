import { SeededRandom } from '../artificial-life/seededRandom';
import type { AffineTransform, IFSPoint, Point2D, Triangle } from './types';

export const MAX_IFS_POINTS = 1_000_000;
export const MAX_IFS_TRANSFORMS = 16;
export const MAX_SIERPINSKI_TRIANGLES = 250_000;

export const BARNSLEY_FERN_TRANSFORMS: readonly AffineTransform[] = Object.freeze([
	{
		id: 'stem',
		label: 'Stem',
		a: 0,
		b: 0,
		c: 0,
		d: 0.16,
		e: 0,
		f: 0,
		probability: 0.01,
		color: '#9A7B45'
	},
	{
		id: 'successive-leaflets',
		label: 'Successive leaflets',
		a: 0.85,
		b: 0.04,
		c: -0.04,
		d: 0.85,
		e: 0,
		f: 1.6,
		probability: 0.85,
		color: '#668E4E'
	},
	{
		id: 'left-leaflet',
		label: 'Left leaflet',
		a: 0.2,
		b: -0.26,
		c: 0.23,
		d: 0.22,
		e: 0,
		f: 1.6,
		probability: 0.07,
		color: '#8DB36B'
	},
	{
		id: 'right-leaflet',
		label: 'Right leaflet',
		a: -0.15,
		b: 0.28,
		c: 0.26,
		d: 0.24,
		e: 0,
		f: 0.44,
		probability: 0.07,
		color: '#B8C98B'
	}
]);

export const DEFAULT_SIERPINSKI_VERTICES: readonly [Point2D, Point2D, Point2D] = Object.freeze([
	{ x: 0, y: -1 },
	{ x: -Math.sqrt(3) / 2, y: 0.5 },
	{ x: Math.sqrt(3) / 2, y: 0.5 }
]);

export interface IFSValidationResult {
	transforms: AffineTransform[];
	issues: string[];
}

export function applyAffineTransform(point: Point2D, transform: AffineTransform): Point2D {
	return {
		x: transform.a * point.x + transform.b * point.y + transform.e,
		y: transform.c * point.x + transform.d * point.y + transform.f
	};
}

/**
 * Validate a small transform table and normalise positive probabilities to one.
 * Invalid entries are rejected rather than silently converted into executable input.
 */
export function validateIFSTransforms(
	value: unknown,
	fallback: readonly AffineTransform[] = BARNSLEY_FERN_TRANSFORMS
): IFSValidationResult {
	const issues: string[] = [];
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IFS_TRANSFORMS) {
		return {
			transforms: fallback.map((transform) => ({ ...transform })),
			issues: [`IFS tables require 1–${MAX_IFS_TRANSFORMS} transforms.`]
		};
	}

	const transforms: AffineTransform[] = [];
	for (const [index, candidate] of value.entries()) {
		if (!isRecord(candidate)) {
			issues.push(`IFS transform ${index + 1} is not an object.`);
			continue;
		}
		const numbers = ['a', 'b', 'c', 'd', 'e', 'f', 'probability'] as const;
		if (
			numbers.some(
				(field) =>
					typeof candidate[field] !== 'number' ||
					!Number.isFinite(candidate[field]) ||
					Math.abs(candidate[field]) > 1e6
			)
		) {
			issues.push(`IFS transform ${index + 1} contains a non-finite or unsafe coefficient.`);
			continue;
		}
		if ((candidate.probability as number) < 0) {
			issues.push(`IFS transform ${index + 1} has a negative probability.`);
			continue;
		}
		const id =
			typeof candidate.id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/u.test(candidate.id)
				? candidate.id
				: `transform-${index + 1}`;
		const label =
			typeof candidate.label === 'string' && candidate.label.trim().length <= 80
				? candidate.label.trim() || `Transform ${index + 1}`
				: `Transform ${index + 1}`;
		const color =
			typeof candidate.color === 'string' && /^#[\da-f]{6}$/iu.test(candidate.color)
				? candidate.color.toUpperCase()
				: undefined;
		transforms.push({
			id,
			label,
			a: candidate.a as number,
			b: candidate.b as number,
			c: candidate.c as number,
			d: candidate.d as number,
			e: candidate.e as number,
			f: candidate.f as number,
			probability: candidate.probability as number,
			color
		});
	}

	const totalProbability = transforms.reduce(
		(total, transform) => total + transform.probability,
		0
	);
	if (transforms.length === 0 || !Number.isFinite(totalProbability) || totalProbability <= 0) {
		issues.push(
			'IFS probabilities must contain a positive finite total; the fallback was restored.'
		);
		return {
			transforms: fallback.map((transform) => ({ ...transform })),
			issues
		};
	}
	if (Math.abs(totalProbability - 1) > 1e-12) {
		issues.push('IFS probabilities were normalised to a total of one.');
	}
	return {
		transforms: transforms.map((transform) => ({
			...transform,
			probability: transform.probability / totalProbability
		})),
		issues
	};
}

export function iterateIFS(
	transforms: readonly AffineTransform[],
	iterations: number,
	seed: string | number,
	start: Point2D = { x: 0, y: 0 }
): IFSPoint[] {
	const validated = validateIFSTransforms(transforms);
	const safeIterations = clampInteger(iterations, 0, MAX_IFS_POINTS, 0);
	const random = new SeededRandom(seed);
	const cumulative: number[] = [];
	let total = 0;
	for (const transform of validated.transforms) {
		total += transform.probability;
		cumulative.push(total);
	}
	cumulative[cumulative.length - 1] = 1;

	let point = {
		x: finiteOr(start.x, 0),
		y: finiteOr(start.y, 0)
	};
	const points: IFSPoint[] = [];
	for (let iteration = 0; iteration < safeIterations; iteration += 1) {
		const sample = random.next();
		let transformIndex = cumulative.findIndex((threshold) => sample < threshold);
		if (transformIndex < 0) transformIndex = cumulative.length - 1;
		point = applyAffineTransform(point, validated.transforms[transformIndex]);
		if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
			throw new RangeError('The IFS escaped finite coordinate bounds.');
		}
		points.push({ ...point, iteration: iteration + 1, transformIndex });
	}
	return points;
}

export function generateBarnsleyFern(
	iterations: number,
	seed: string | number,
	start: Point2D = { x: 0, y: 0 }
): IFSPoint[] {
	return iterateIFS(BARNSLEY_FERN_TRANSFORMS, iterations, seed, start);
}

export function sierpinskiChaosGame(
	iterations: number,
	seed: string | number,
	options: {
		start?: Point2D;
		vertices?: readonly [Point2D, Point2D, Point2D];
		burnIn?: number;
	} = {}
): IFSPoint[] {
	const safeIterations = clampInteger(iterations, 0, MAX_IFS_POINTS, 0);
	const burnIn = clampInteger(options.burnIn ?? 8, 0, 10_000, 8);
	const vertices = options.vertices ?? DEFAULT_SIERPINSKI_VERTICES;
	if (vertices.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y))) {
		throw new RangeError('Sierpiński vertices must contain finite coordinates.');
	}
	const random = new SeededRandom(seed);
	let point = { ...(options.start ?? centroid(vertices)) };
	const points: IFSPoint[] = [];
	for (let iteration = 0; iteration < safeIterations + burnIn; iteration += 1) {
		const vertexIndex = random.integer(0, 2);
		const vertex = vertices[vertexIndex];
		point = midpoint(point, vertex);
		if (iteration >= burnIn) {
			points.push({
				...point,
				iteration: iteration - burnIn + 1,
				transformIndex: vertexIndex
			});
		}
	}
	return points;
}

/**
 * Return the retained triangles after recursive central-triangle removal.
 * The number of returned triangles is exactly 3^generation.
 */
export function recursiveSierpinskiTriangles(
	generation: number,
	initial: Triangle = {
		a: DEFAULT_SIERPINSKI_VERTICES[0],
		b: DEFAULT_SIERPINSKI_VERTICES[1],
		c: DEFAULT_SIERPINSKI_VERTICES[2]
	}
): Triangle[] {
	const safeGeneration = clampInteger(generation, 0, 12, 0);
	const expected = 3 ** safeGeneration;
	if (expected > MAX_SIERPINSKI_TRIANGLES) {
		throw new RangeError(
			`Generation ${safeGeneration} would exceed the ${MAX_SIERPINSKI_TRIANGLES.toLocaleString('en')} triangle limit.`
		);
	}
	validateTriangle(initial);
	let triangles: Triangle[] = [cloneTriangle(initial)];
	for (let depth = 0; depth < safeGeneration; depth += 1) {
		const next: Triangle[] = [];
		for (const triangle of triangles) {
			const ab = midpoint(triangle.a, triangle.b);
			const bc = midpoint(triangle.b, triangle.c);
			const ca = midpoint(triangle.c, triangle.a);
			next.push(
				{ a: { ...triangle.a }, b: ab, c: ca },
				{ a: ab, b: { ...triangle.b }, c: bc },
				{ a: ca, b: bc, c: { ...triangle.c } }
			);
		}
		triangles = next;
	}
	return triangles;
}

export function midpoint(left: Point2D, right: Point2D): Point2D {
	return {
		x: (left.x + right.x) / 2,
		y: (left.y + right.y) / 2
	};
}

function centroid(points: readonly [Point2D, Point2D, Point2D]): Point2D {
	return {
		x: (points[0].x + points[1].x + points[2].x) / 3,
		y: (points[0].y + points[1].y + points[2].y) / 3
	};
}

function validateTriangle(triangle: Triangle): void {
	for (const point of [triangle.a, triangle.b, triangle.c]) {
		if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
			throw new RangeError('Sierpiński triangles require finite coordinates.');
		}
	}
}

function cloneTriangle(triangle: Triangle): Triangle {
	return {
		a: { ...triangle.a },
		b: { ...triangle.b },
		c: { ...triangle.c }
	};
}

function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
