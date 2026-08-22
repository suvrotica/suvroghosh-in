import { evaluateExpressionDiagnostic } from './complex';
import { sampleHeight } from './height';
import type {
	BranchCut,
	Complex,
	ComplexFeature,
	DomainColoringPreset,
	EvaluationDiagnostic,
	ExpressionNode,
	HeightSettings,
	RenderQuality,
	Viewport
} from './types';
import { viewportBounds } from './viewport';

export type LandscapeMesh = {
	positions: Float32Array;
	domain: Float32Array;
	indices: Uint32Array;
	stats: {
		baseCells: number;
		drawnCells: number;
		refinedCells: number;
		invalidCells: number;
		cutCells: number;
		unresolvedCells: number;
		evaluations: number;
	};
};

const QUALITY: Record<RenderQuality, { x: number; y: number; depth: number; budget: number }> = {
	low: { x: 14, y: 10, depth: 1, budget: 12_000 },
	medium: { x: 24, y: 16, depth: 1, budget: 30_000 },
	high: { x: 34, y: 22, depth: 2, budget: 90_000 }
};

type Sample = {
	z: Complex;
	evaluation: EvaluationDiagnostic;
	height: number | null;
};

function orientation(a: Complex, b: Complex, c: Complex) {
	return (b.re - a.re) * (c.im - a.im) - (b.im - a.im) * (c.re - a.re);
}

function crossVectors(a: Complex, b: Complex) {
	return a.re * b.im - a.im * b.re;
}

function segmentsMeet(a: Complex, b: Complex, c: Complex, d: Complex) {
	const o1 = orientation(a, b, c);
	const o2 = orientation(a, b, d);
	const o3 = orientation(c, d, a);
	const o4 = orientation(c, d, b);
	const epsilon = 1e-12;
	const onSegment = (point: Complex, from: Complex, to: Complex) =>
		Math.abs(orientation(from, to, point)) <= epsilon &&
		point.re >= Math.min(from.re, to.re) - epsilon &&
		point.re <= Math.max(from.re, to.re) + epsilon &&
		point.im >= Math.min(from.im, to.im) - epsilon &&
		point.im <= Math.max(from.im, to.im) + epsilon;
	const opposite = (left: number, right: number) =>
		(left > epsilon && right < -epsilon) || (left < -epsilon && right > epsilon);
	if (opposite(o1, o2) && opposite(o3, o4)) return true;
	return (
		(Math.abs(o1) <= epsilon && onSegment(c, a, b)) ||
		(Math.abs(o2) <= epsilon && onSegment(d, a, b)) ||
		(Math.abs(o3) <= epsilon && onSegment(a, c, d)) ||
		(Math.abs(o4) <= epsilon && onSegment(b, c, d))
	);
}

function cutCrossesCell(
	cut: BranchCut,
	minRe: number,
	maxRe: number,
	minIm: number,
	maxIm: number
) {
	const corners = [
		{ re: minRe, im: minIm },
		{ re: maxRe, im: minIm },
		{ re: maxRe, im: maxIm },
		{ re: minRe, im: maxIm }
	];
	if (cut.kind === 'real-preimage') {
		const values = corners.map(cut.test).filter(Number.isFinite);
		return values.length === corners.length && Math.min(...values) <= 0 && Math.max(...values) >= 0;
	}
	const from = cut.kind === 'segment' ? cut.from : cut.origin;
	const to =
		cut.kind === 'segment'
			? cut.to
			: {
					re: cut.origin.re + cut.direction.re * 1e7,
					im: cut.origin.im + cut.direction.im * 1e7
				};
	const inside = (point: Complex) =>
		point.re >= minRe && point.re <= maxRe && point.im >= minIm && point.im <= maxIm;
	return (
		inside(from) ||
		(cut.kind === 'segment' && inside(to)) ||
		corners.some((corner, index) => segmentsMeet(corner, corners[(index + 1) % 4], from, to))
	);
}

type CutProbe = { point: Complex; normal: Complex };

function insideCell(point: Complex, minRe: number, maxRe: number, minIm: number, maxIm: number) {
	const epsilon = Math.max(maxRe - minRe, maxIm - minIm) * 1e-9;
	return (
		point.re >= minRe - epsilon &&
		point.re <= maxRe + epsilon &&
		point.im >= minIm - epsilon &&
		point.im <= maxIm + epsilon
	);
}

function deduplicatedPoints(points: readonly Complex[]) {
	const result: Complex[] = [];
	for (const point of points) {
		if (
			result.some(
				(candidate) => Math.hypot(point.re - candidate.re, point.im - candidate.im) < 1e-9
			)
		)
			continue;
		result.push(point);
	}
	return result;
}

function straightCutProbe(
	cut: Extract<BranchCut, { kind: 'ray' | 'segment' }>,
	minRe: number,
	maxRe: number,
	minIm: number,
	maxIm: number
): CutProbe | null {
	const origin = cut.kind === 'segment' ? cut.from : cut.origin;
	const direction =
		cut.kind === 'segment'
			? { re: cut.to.re - cut.from.re, im: cut.to.im - cut.from.im }
			: cut.direction;
	const length = Math.hypot(direction.re, direction.im);
	if (length < 1e-12) return null;
	const corners: Complex[] = [
		{ re: minRe, im: minIm },
		{ re: maxRe, im: minIm },
		{ re: maxRe, im: maxIm },
		{ re: minRe, im: maxIm }
	];
	const candidates: Complex[] = [];
	if (insideCell(origin, minRe, maxRe, minIm, maxIm)) candidates.push(origin);
	if (cut.kind === 'segment' && insideCell(cut.to, minRe, maxRe, minIm, maxIm))
		candidates.push(cut.to);
	for (let index = 0; index < corners.length; index += 1) {
		const edgeStart = corners[index];
		const edgeEnd = corners[(index + 1) % corners.length];
		const edge = { re: edgeEnd.re - edgeStart.re, im: edgeEnd.im - edgeStart.im };
		const denominator = crossVectors(direction, edge);
		if (Math.abs(denominator) < 1e-12) continue;
		const offset = { re: edgeStart.re - origin.re, im: edgeStart.im - origin.im };
		const alongCut = crossVectors(offset, edge) / denominator;
		const alongEdge = crossVectors(offset, direction) / denominator;
		const onCut =
			cut.kind === 'segment' ? alongCut >= -1e-10 && alongCut <= 1 + 1e-10 : alongCut >= -1e-10;
		if (!onCut || alongEdge < -1e-10 || alongEdge > 1 + 1e-10) continue;
		candidates.push({
			re: origin.re + alongCut * direction.re,
			im: origin.im + alongCut * direction.im
		});
	}
	const points = deduplicatedPoints(candidates);
	// A lone endpoint merely touches the cell; no triangle crosses the cut there.
	if (points.length < 2) return null;
	const point = points.reduce(
		(sum, candidate) => ({
			re: sum.re + candidate.re / points.length,
			im: sum.im + candidate.im / points.length
		}),
		{ re: 0, im: 0 }
	);
	return {
		point,
		normal: { re: -direction.im / length, im: direction.re / length }
	};
}

function implicitCutProbe(
	cut: Extract<BranchCut, { kind: 'real-preimage' }>,
	minRe: number,
	maxRe: number,
	minIm: number,
	maxIm: number
): CutProbe | null {
	const corners: Complex[] = [
		{ re: minRe, im: minIm },
		{ re: maxRe, im: minIm },
		{ re: maxRe, im: maxIm },
		{ re: minRe, im: maxIm }
	];
	const candidates: Complex[] = [];
	for (let index = 0; index < corners.length; index += 1) {
		const from = corners[index];
		const to = corners[(index + 1) % corners.length];
		const fromValue = cut.test(from);
		const toValue = cut.test(to);
		if (!Number.isFinite(fromValue) || !Number.isFinite(toValue)) continue;
		if (Math.abs(fromValue) < 1e-12) candidates.push(from);
		if (fromValue * toValue < 0) {
			const fraction = fromValue / (fromValue - toValue);
			candidates.push({
				re: from.re + fraction * (to.re - from.re),
				im: from.im + fraction * (to.im - from.im)
			});
		}
	}
	const points = deduplicatedPoints(candidates);
	if (points.length === 0) return null;
	const point = points.reduce(
		(sum, candidate) => ({
			re: sum.re + candidate.re / points.length,
			im: sum.im + candidate.im / points.length
		}),
		{ re: 0, im: 0 }
	);
	const step = Math.max(1e-8, Math.min(maxRe - minRe, maxIm - minIm) * 1e-4);
	const gradient = {
		re:
			(cut.test({ re: point.re + step, im: point.im }) -
				cut.test({ re: point.re - step, im: point.im })) /
			(2 * step),
		im:
			(cut.test({ re: point.re, im: point.im + step }) -
				cut.test({ re: point.re, im: point.im - step })) /
			(2 * step)
	};
	const length = Math.hypot(gradient.re, gradient.im);
	if (!Number.isFinite(length) || length < 1e-12) return null;
	return { point, normal: { re: gradient.re / length, im: gradient.im / length } };
}

function cutProbe(cut: BranchCut, minRe: number, maxRe: number, minIm: number, maxIm: number) {
	return cut.kind === 'real-preimage'
		? implicitCutProbe(cut, minRe, maxRe, minIm, maxIm)
		: straightCutProbe(cut, minRe, maxRe, minIm, maxIm);
}

function roomAlong(
	point: Complex,
	direction: Complex,
	minRe: number,
	maxRe: number,
	minIm: number,
	maxIm: number
) {
	let room = Number.POSITIVE_INFINITY;
	if (direction.re > 1e-12) room = Math.min(room, (maxRe - point.re) / direction.re);
	if (direction.re < -1e-12) room = Math.min(room, (minRe - point.re) / direction.re);
	if (direction.im > 1e-12) room = Math.min(room, (maxIm - point.im) / direction.im);
	if (direction.im < -1e-12) room = Math.min(room, (minIm - point.im) / direction.im);
	return Math.max(0, room);
}

function semanticEvaluation(
	sample: Sample,
	features: readonly ComplexFeature[],
	tolerance: number
): EvaluationDiagnostic {
	for (const feature of features) {
		if (Math.hypot(sample.z.re - feature.z.re, sample.z.im - feature.z.im) > tolerance) continue;
		if (feature.kind === 'zero') return { ...sample.evaluation, status: 'zero' };
		if (feature.kind === 'pole') return { ...sample.evaluation, status: 'pole' };
	}
	return sample.evaluation;
}

export function createLandscapeMesh(
	node: ExpressionNode,
	viewport: Viewport,
	heightSettings: HeightSettings,
	quality: RenderQuality,
	preset?: DomainColoringPreset
): LandscapeMesh {
	const config = QUALITY[quality];
	const bounds = viewportBounds(viewport);
	const positions: number[] = [];
	const domain: number[] = [];
	const indices: number[] = [];
	const cache = new Map<string, Sample>();
	const knownFeatures = [
		...(preset?.features ?? []),
		...(preset?.featureFamilies?.flatMap((family) => family.generate(bounds, 64)) ?? [])
	];
	const featureTolerance = Math.max(viewport.spanRe, viewport.spanIm) * 1e-10;
	const limitingFeatures = knownFeatures.filter(
		(feature) => feature.kind === 'zero' || feature.kind === 'pole'
	);
	const stats = {
		baseCells: config.x * config.y,
		drawnCells: 0,
		refinedCells: 0,
		invalidCells: 0,
		cutCells: 0,
		unresolvedCells: 0,
		evaluations: 0
	};

	const getSample = (re: number, im: number) => {
		const key = `${re.toPrecision(14)},${im.toPrecision(14)}`;
		const cached = cache.get(key);
		if (cached) return cached;
		const z = { re, im };
		const rawEvaluation = evaluateExpressionDiagnostic(node, z);
		const rawSample: Sample = { z, evaluation: rawEvaluation, height: null };
		const evaluation = semanticEvaluation(rawSample, knownFeatures, featureTolerance);
		const sample: Sample = { z, evaluation, height: null };
		const height = sampleHeight(evaluation, heightSettings).displayed;
		sample.height = Number.isFinite(height) ? height : null;
		cache.set(key, sample);
		stats.evaluations += 1;
		return sample;
	};

	const emitCell = (minRe: number, maxRe: number, minIm: number, maxIm: number, depth: number) => {
		if (stats.evaluations >= config.budget) {
			stats.unresolvedCells += 1;
			return;
		}
		const featureLimit =
			heightSettings.lens === 'log-magnitude'
				? limitingFeatures.find(
						(feature) =>
							feature.z.re >= minRe - featureTolerance &&
							feature.z.re <= maxRe + featureTolerance &&
							feature.z.im >= minIm - featureTolerance &&
							feature.z.im <= maxIm + featureTolerance
					)
				: undefined;
		const a = getSample(minRe, minIm);
		const b = getSample(maxRe, minIm);
		const c = getSample(minRe, maxIm);
		const d = getSample(maxRe, maxIm);
		const centre = getSample((minRe + maxRe) / 2, (minIm + maxIm) / 2);
		const samples = [a, b, c, d, centre];
		if (samples.some((sample) => sample.height === null)) {
			stats.invalidCells += 1;
			return;
		}
		const cornerHeights = [a.height!, b.height!, c.height!, d.height!];
		const bilinearCentre = cornerHeights.reduce((sum, value) => sum + value, 0) / 4;
		const interpolationError = Math.abs(centre.height! - bilinearCentre);
		const range = Math.max(...cornerHeights) - Math.min(...cornerHeights);
		const tolerance = Math.max(0.16, heightSettings.verticalScale * 0.22);
		const phaseValues =
			heightSettings.lens === 'phase'
				? samples
						.filter(
							(sample) => Math.hypot(sample.evaluation.value.re, sample.evaluation.value.im) > 1e-12
						)
						.map((sample) => Math.atan2(sample.evaluation.value.im, sample.evaluation.value.re))
				: [];
		const crossesPhaseSeam =
			phaseValues.length > 1 && Math.max(...phaseValues) - Math.min(...phaseValues) > Math.PI;
		const declaredDiscontinuity =
			heightSettings.lens !== 'flat' &&
			Boolean(
				preset?.cuts?.some((cut) => {
					if (!cutCrossesCell(cut, minRe, maxRe, minIm, maxIm)) return false;
					const probe = cutProbe(cut, minRe, maxRe, minIm, maxIm);
					if (!probe) return false;
					const baseOffset = Math.min(maxRe - minRe, maxIm - minIm) * 0.08;
					const plusRoom = roomAlong(probe.point, probe.normal, minRe, maxRe, minIm, maxIm);
					const reverse = { re: -probe.normal.re, im: -probe.normal.im };
					const minusRoom = roomAlong(probe.point, reverse, minRe, maxRe, minIm, maxIm);
					const probeHeights: number[] = [];
					const onCut = getSample(probe.point.re, probe.point.im).height;
					if (onCut !== null) probeHeights.push(onCut);
					for (const [direction, room] of [
						[probe.normal, plusRoom],
						[reverse, minusRoom]
					] as const) {
						const offset = Math.min(baseOffset, room * 0.45);
						if (offset <= Math.min(maxRe - minRe, maxIm - minIm) * 1e-6) continue;
						const height = getSample(
							probe.point.re + direction.re * offset,
							probe.point.im + direction.im * offset
						).height;
						if (height !== null) probeHeights.push(height);
					}
					return (
						probeHeights.length > 1 &&
						Math.max(...probeHeights) - Math.min(...probeHeights) >
							Math.max(0.08, heightSettings.verticalScale * 0.18)
					);
				})
			);
		const discontinuity = crossesPhaseSeam || declaredDiscontinuity;
		const sampledLimit =
			heightSettings.lens === 'log-magnitude'
				? samples.find((sample) => ['zero', 'zero-like', 'pole'].includes(sample.evaluation.status))
				: undefined;
		const limitPoint = featureLimit?.z ?? sampledLimit?.z;
		if (
			(discontinuity || interpolationError > tolerance || range > tolerance * 5 || limitPoint) &&
			depth < config.depth
		) {
			stats.refinedCells += 1;
			const midRe = (minRe + maxRe) / 2;
			const midIm = (minIm + maxIm) / 2;
			emitCell(minRe, midRe, minIm, midIm, depth + 1);
			emitCell(midRe, maxRe, minIm, midIm, depth + 1);
			emitCell(minRe, midRe, midIm, maxIm, depth + 1);
			emitCell(midRe, maxRe, midIm, maxIm, depth + 1);
			return;
		}
		if (discontinuity) {
			stats.cutCells += 1;
			return;
		}
		if ((interpolationError > tolerance * 3 || range > tolerance * 12) && !limitPoint) {
			stats.unresolvedCells += 1;
			return;
		}
		const first = positions.length / 3;
		const corners = [a, b, c, d];
		for (const sample of corners) {
			positions.push(sample.z.re, sample.height!, sample.z.im);
			domain.push(sample.z.re, sample.z.im);
		}
		const limitAtCorner =
			limitPoint &&
			corners.some(
				(sample) =>
					Math.hypot(sample.z.re - limitPoint.re, sample.z.im - limitPoint.im) <= featureTolerance
			);
		if (limitPoint && !limitAtCorner) {
			const limit = getSample(limitPoint.re, limitPoint.im);
			if (limit.height === null) {
				stats.invalidCells += 1;
				positions.splice(first * 3);
				domain.splice(first * 2);
				return;
			}
			const centreIndex = first + 4;
			positions.push(limit.z.re, limit.height, limit.z.im);
			domain.push(limit.z.re, limit.z.im);
			indices.push(
				centreIndex,
				first,
				first + 1,
				centreIndex,
				first + 1,
				first + 3,
				centreIndex,
				first + 3,
				first + 2,
				centreIndex,
				first + 2,
				first
			);
		} else {
			indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
		}
		stats.drawnCells += 1;
	};

	for (let y = 0; y < config.y; y += 1) {
		const minIm = bounds.minIm + (y / config.y) * viewport.spanIm;
		const maxIm = bounds.minIm + ((y + 1) / config.y) * viewport.spanIm;
		for (let x = 0; x < config.x; x += 1) {
			const minRe = bounds.minRe + (x / config.x) * viewport.spanRe;
			const maxRe = bounds.minRe + ((x + 1) / config.x) * viewport.spanRe;
			emitCell(minRe, maxRe, minIm, maxIm, 0);
		}
	}

	return {
		positions: new Float32Array(positions),
		domain: new Float32Array(domain),
		indices: new Uint32Array(indices),
		stats
	};
}
