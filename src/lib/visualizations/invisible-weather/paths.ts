import { fieldAngle, sampleField } from './field';
import { maskContains } from './masks';
import { SeededRandom } from './prng';
import { quantizeAngle } from './quantization';
import { classifyThreshold } from './thresholds';
import type { ArtworkRecipe, GeneratedPath, MutablePoint, Point } from './types';

export type VectorField = (x: number, y: number) => Point;
export type IntegrationBounds = Readonly<{
	minimumX: number;
	maximumX: number;
	minimumY: number;
	maximumY: number;
}>;

export type PathIntegrationOptions = Readonly<{
	stepSize: number;
	maxSteps: number;
	direction?: 1 | -1;
	bounds?: IntegrationBounds;
	contains?: (x: number, y: number) => boolean;
}>;

export function rk2Step(
	field: VectorField,
	point: Point,
	stepSize: number,
	direction: 1 | -1 = 1
): MutablePoint {
	const step = Math.max(1e-5, Math.min(0.2, Math.abs(stepSize))) * direction;
	const first = field(point.x, point.y);
	const midpoint = { x: point.x + first.x * step * 0.5, y: point.y + first.y * step * 0.5 };
	const second = field(midpoint.x, midpoint.y);
	return { x: point.x + second.x * step, y: point.y + second.y * step };
}

export function generateFlowPath(
	field: VectorField,
	start: Point,
	options: PathIntegrationOptions
): Point[] {
	const bounds = options.bounds ?? { minimumX: 0, maximumX: 1, minimumY: 0, maximumY: 1 };
	const maxSteps = Math.max(1, Math.min(512, Math.round(options.maxSteps)));
	const points: Point[] = [{ x: start.x, y: start.y }];
	for (let index = 0; index < maxSteps; index += 1) {
		const next = rk2Step(field, points[points.length - 1], options.stepSize, options.direction);
		if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) break;
		if (
			next.x < bounds.minimumX ||
			next.x > bounds.maximumX ||
			next.y < bounds.minimumY ||
			next.y > bounds.maximumY ||
			(options.contains && !options.contains(next.x, next.y))
		) {
			break;
		}
		points.push(next);
	}
	return points;
}

function transformedCoordinates(
	transform: ArtworkRecipe['localTransform'],
	x: number,
	y: number
): Point {
	let localX = (x - 0.5 - transform.offsetX) / transform.scaleX;
	const localY = (y - 0.5 - transform.offsetY) / transform.scaleY;
	if (transform.mirrorX) localX *= -1;
	const cosine = Math.cos(-transform.rotation);
	const sine = Math.sin(-transform.rotation);
	return {
		x: localX * cosine - localY * sine + 0.5,
		y: localX * sine + localY * cosine + 0.5
	};
}

export function artworkVectorField(artwork: ArtworkRecipe, phase = 0): VectorField {
	return (x, y) => {
		const local = transformedCoordinates(artwork.localTransform, x, y);
		const raw = fieldAngle(
			local.x,
			local.y,
			phase + artwork.phaseOffset,
			artwork.field,
			artwork.turns
		);
		const angle = quantizeAngle(raw, artwork.angleMode, {
			x: local.x,
			y: local.y,
			softness: artwork.softness
		});
		return { x: Math.cos(angle), y: Math.sin(angle) };
	};
}

export function sampleSecondaryField(
	artwork: ArtworkRecipe,
	x: number,
	y: number,
	phase = 0
): number {
	const field = artwork.secondaryField ?? {
		...artwork.field,
		seed: `${artwork.field.seed}:secondary`
	};
	const transform = artwork.secondaryTransform ?? artwork.localTransform;
	const local = transformedCoordinates(transform, x, y);
	return sampleField(local.x, local.y, phase + artwork.phaseOffset, field);
}

function thresholdAtPoint(artwork: ArtworkRecipe, point: Point, phase: number) {
	const value = sampleSecondaryField(artwork, point.x, point.y, phase);
	const nearby = sampleSecondaryField(artwork, point.x + 0.018, point.y - 0.013, phase);
	return classifyThreshold(value, artwork.threshold, nearby);
}

function jitteredLattice(seed: string, requested: number): Point[] {
	const random = new SeededRandom(`${seed}:jittered-lattice`);
	const side = Math.max(3, Math.ceil(Math.sqrt(requested * 6)));
	const candidates: Point[] = [];
	for (let row = 0; row < side; row += 1) {
		for (let column = 0; column < side; column += 1) {
			candidates.push({
				x: (column + random.float(0.18, 0.82)) / side,
				y: (row + random.float(0.18, 0.82)) / side
			});
		}
	}
	return random.shuffle(candidates);
}

function secondarySegments(
	artwork: ArtworkRecipe,
	points: readonly Point[],
	phase: number,
	maximumSegments = 2
): ReadonlyArray<Readonly<{ points: readonly Point[]; weight: number }>> {
	if (!artwork.dualInk || !artwork.secondaryInk || artwork.threshold.mode === 'off') return [];
	const segments: Array<{ points: Point[]; weight: number }> = [];
	let active: Point[] = [];
	let strongestWeight = 0;
	const flush = () => {
		if (active.length >= 2 && segments.length < maximumSegments) {
			segments.push({ points: active, weight: strongestWeight });
		}
		active = [];
		strongestWeight = 0;
	};
	for (const point of points) {
		const classification = thresholdAtPoint(artwork, point, phase);
		if (classification.selected) {
			active.push(point);
			strongestWeight = Math.max(strongestWeight, classification.weight);
		} else {
			flush();
			if (segments.length >= maximumSegments) break;
		}
	}
	flush();
	return segments;
}

export function generateArtworkPaths(
	artwork: ArtworkRecipe,
	options: Readonly<{ phase?: number; maxPaths?: number }> = {}
): GeneratedPath[] {
	const phase = options.phase ?? 0;
	const requested = Math.max(
		1,
		Math.min(artwork.pathCount, Math.round(options.maxPaths ?? artwork.pathCount))
	);
	const random = new SeededRandom(`${artwork.seed}:paths`);
	const vector = artworkVectorField(artwork, phase);
	const contains = (x: number, y: number) => maskContains(artwork.mask, x, y, { phase });
	const primaryPaths: GeneratedPath[] = [];
	const secondaryPaths: GeneratedPath[] = [];
	const candidates = jitteredLattice(artwork.seed, requested);
	let attempts = 0;
	while (primaryPaths.length < requested && attempts < requested * 40) {
		const candidate = candidates[attempts];
		attempts += 1;
		const start = candidate ?? {
			x: random.float(0.025, 0.975),
			y: random.float(0.025, 0.975)
		};
		if (!contains(start.x, start.y)) continue;
		const direction = random.boolean() ? 1 : -1;
		const points = generateFlowPath(vector, start, {
			stepSize: 0.0065 / Math.max(0.35, artwork.multiplier),
			maxSteps: artwork.pathLength,
			direction,
			contains
		});
		if (points.length < 2) continue;
		primaryPaths.push({
			points,
			ink: 'primary',
			alpha: artwork.threshold.mode === 'off' ? 0.82 : 0.62,
			width: artwork.lineWidth * random.float(0.72, 1.22)
		});
		if (secondaryPaths.length < requested) {
			for (const segment of secondarySegments(artwork, points, phase)) {
				if (secondaryPaths.length >= requested) break;
				secondaryPaths.push({
					points: segment.points,
					ink: 'secondary',
					alpha: 0.64 + segment.weight * 0.28,
					width: artwork.lineWidth * random.float(0.94, 1.34)
				});
			}
		}
	}
	return [...primaryPaths, ...secondaryPaths];
}
