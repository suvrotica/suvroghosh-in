import { argument, evaluateExpressionDiagnostic, magnitude } from './complex';
import type {
	BranchCut,
	DomainBounds,
	DomainColoringPreset,
	ExpressionNode,
	LoopGeometry
} from './types';

export type WindingResult =
	| {
			ok: true;
			winding: number;
			integer: number;
			samples: number;
			minimumModulus: number;
			interpretation: 'zeros-minus-poles' | 'output-winding';
			detail: string;
	  }
	| {
			ok: false;
			reason:
				| 'outside-domain'
				| 'invalid-sample'
				| 'near-zero'
				| 'branch-cut'
				| 'under-resolved'
				| 'not-stable';
			detail: string;
			samples: number;
	  };

export type WindingOptions = {
	minimumSamples?: number;
	maximumSamples?: number;
	minimumModulus?: number;
	stabilityTolerance?: number;
	continuityTolerance?: number;
	maximumPhaseStep?: number;
	bounds?: DomainBounds;
	preset?: DomainColoringPreset;
};

const pointOnLoop = (loop: LoopGeometry, angle: number) => ({
	re: loop.center.re + loop.radius * Math.cos(angle),
	im: loop.center.im + loop.radius * Math.sin(angle)
});

function loopInsideBounds(loop: LoopGeometry, bounds: DomainBounds) {
	return (
		loop.center.re - loop.radius >= bounds.minRe &&
		loop.center.re + loop.radius <= bounds.maxRe &&
		loop.center.im - loop.radius >= bounds.minIm &&
		loop.center.im + loop.radius <= bounds.maxIm
	);
}

function cross(a: { re: number; im: number }, b: { re: number; im: number }) {
	return a.re * b.im - a.im * b.re;
}

function segmentIntersection(
	a: { re: number; im: number },
	b: { re: number; im: number },
	c: { re: number; im: number },
	d: { re: number; im: number }
) {
	const r = { re: b.re - a.re, im: b.im - a.im };
	const s = { re: d.re - c.re, im: d.im - c.im };
	const denominator = cross(r, s);
	if (Math.abs(denominator) < 1e-12) return false;
	const ca = { re: c.re - a.re, im: c.im - a.im };
	const t = cross(ca, s) / denominator;
	const u = cross(ca, r) / denominator;
	return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function segmentCrossesCut(
	a: { re: number; im: number },
	b: { re: number; im: number },
	cut: BranchCut
) {
	if (cut.kind === 'segment') return segmentIntersection(a, b, cut.from, cut.to);
	if (cut.kind === 'ray') {
		const distance = 1e7;
		return segmentIntersection(a, b, cut.origin, {
			re: cut.origin.re + cut.direction.re * distance,
			im: cut.origin.im + cut.direction.im * distance
		});
	}
	const fa = cut.test(a);
	const fb = cut.test(b);
	return Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0;
}

function wrappedIncrement(from: number, to: number) {
	return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function integerLiteral(node: ExpressionNode): number | null {
	if (node.kind === 'number' && Number.isInteger(node.value)) return node.value;
	if (
		node.kind === 'unary' &&
		node.operator === '-' &&
		node.value.kind === 'number' &&
		Number.isInteger(node.value.value)
	) {
		return -node.value.value;
	}
	return null;
}

/** Conservative degree/order bound for explicit rational algebraic ASTs. */
function algebraicWindingBound(node: ExpressionNode): number | null {
	if (node.kind === 'number') return 0;
	if (node.kind === 'constant') return node.name === 'z' ? 1 : 0;
	if (node.kind === 'unary') return algebraicWindingBound(node.value);
	if (node.kind === 'call') {
		return node.name === 'abs' || node.name === 'conj'
			? algebraicWindingBound(node.argument)
			: null;
	}
	const left = algebraicWindingBound(node.left);
	const right = algebraicWindingBound(node.right);
	if (node.operator === '^') {
		const exponent = integerLiteral(node.right);
		if (left === null || exponent === null) return null;
		return left * Math.abs(exponent);
	}
	if (left === null || right === null) return null;
	return node.operator === '+' || node.operator === '-' ? Math.max(left, right) : left + right;
}

/**
 * Recursively subdivide a coarse interval, then compare each finest tested
 * phase chord with its actual midpoint. The leaf test combines phase-
 * unwrapping disagreement with scale-normalised output-chord deviation.
 */
function recursiveMidpointError(
	phases: readonly number[],
	values: readonly { re: number; im: number }[],
	start: number,
	end: number
): number {
	if (end - start < 2 || (end - start) % 2 !== 0) return 0;
	const midpoint = (start + end) / 2;
	if (end - start > 2) {
		return Math.max(
			recursiveMidpointError(phases, values, start, midpoint),
			recursiveMidpointError(phases, values, midpoint, end)
		);
	}
	const coarse = wrappedIncrement(phases[start], phases[end]);
	const refined =
		wrappedIncrement(phases[start], phases[midpoint]) +
		wrappedIncrement(phases[midpoint], phases[end]);
	const chordMidpoint = {
		re: (values[start].re + values[end].re) / 2,
		im: (values[start].im + values[end].im) / 2
	};
	const scale = Math.max(
		magnitude(values[start]),
		magnitude(values[midpoint]),
		magnitude(values[end]),
		1e-12
	);
	const chordError =
		Math.hypot(values[midpoint].re - chordMidpoint.re, values[midpoint].im - chordMidpoint.im) /
		scale;
	return Math.max(Math.abs(refined - coarse), chordError);
}

function midpointContinuityError(
	phases: readonly number[],
	values: readonly { re: number; im: number }[],
	samples: number
) {
	let error = 0;
	let start = 0;
	while (start < samples) {
		let block = Math.min(16, samples - start);
		while (block > 1 && (block & (block - 1)) !== 0) block -= 1;
		error = Math.max(error, recursiveMidpointError(phases, values, start, start + block));
		start += block;
	}
	return error;
}

type WindingFailure = Extract<WindingResult, { ok: false }>;

type GridAnalysis = {
	ok: true;
	winding: number;
	minimumModulus: number;
	largestStep: number;
	continuityError: number;
};

function analyseGrid(
	node: ExpressionNode,
	loop: LoopGeometry,
	samples: number,
	preset: DomainColoringPreset | undefined,
	minimumModulus: number
): GridAnalysis | WindingFailure {
	const phases: number[] = [];
	const values: { re: number; im: number }[] = [];
	let closest = Number.POSITIVE_INFINITY;
	let previousPoint = pointOnLoop(loop, 0);
	for (let index = 0; index <= samples; index += 1) {
		const point = pointOnLoop(loop, (index / samples) * Math.PI * 2);
		if (index > 0 && preset?.cuts?.some((cut) => segmentCrossesCut(previousPoint, point, cut))) {
			return {
				ok: false,
				reason: 'branch-cut',
				detail: 'The loop crosses a principal-value cut, so this sampled branch is discontinuous.',
				samples
			};
		}
		const evaluation = evaluateExpressionDiagnostic(node, point);
		if (evaluation.status === 'undefined' || evaluation.status === 'indeterminate') {
			return {
				ok: false,
				reason: 'invalid-sample',
				detail: 'At least one loop sample is undefined or indeterminate.',
				samples
			};
		}
		const radius = magnitude(evaluation.value);
		if (!Number.isFinite(radius)) {
			return {
				ok: false,
				reason: 'invalid-sample',
				detail: 'At least one loop sample overflowed the stable numerical range.',
				samples
			};
		}
		closest = Math.min(closest, radius);
		phases.push(argument(evaluation.value));
		values.push(evaluation.value);
		previousPoint = point;
	}
	if (closest <= minimumModulus) {
		return {
			ok: false,
			reason: 'near-zero',
			detail: 'The sampled output approaches zero too closely for a reliable phase winding.',
			samples
		};
	}
	let phaseChange = 0;
	let largestStep = 0;
	for (let index = 0; index < phases.length - 1; index += 1) {
		const increment = wrappedIncrement(phases[index], phases[index + 1]);
		largestStep = Math.max(largestStep, Math.abs(increment));
		phaseChange += increment;
	}
	return {
		ok: true,
		winding: phaseChange / (Math.PI * 2),
		minimumModulus: closest,
		largestStep,
		continuityError: midpointContinuityError(phases, values, samples)
	};
}

export function estimateWinding(
	node: ExpressionNode,
	loop: LoopGeometry,
	options: WindingOptions = {}
): WindingResult {
	const minimumSamples = Math.max(16, options.minimumSamples ?? 64);
	const maximumSamples = Math.max(minimumSamples, options.maximumSamples ?? 4_096);
	const minimumModulus = options.minimumModulus ?? 1e-6;
	const stabilityTolerance = options.stabilityTolerance ?? 2e-3;
	const continuityTolerance = options.continuityTolerance ?? 0.1;
	const maximumPhaseStep = options.maximumPhaseStep ?? Math.PI / 3;
	const explicitBound = algebraicWindingBound(node);
	const chordPhaseLimit = Math.acos(Math.max(-1, Math.min(1, 1 - continuityTolerance)));
	const resolvableExplicitBound = Math.floor(
		(maximumSamples * Math.min(maximumPhaseStep, chordPhaseLimit)) / (Math.PI * 2)
	);
	if (explicitBound !== null && explicitBound > resolvableExplicitBound) {
		return {
			ok: false,
			reason: 'under-resolved',
			detail: `The expression's explicit algebraic winding bound (${explicitBound}) exceeds the safe sampling budget (${resolvableExplicitBound}); no integer is reported.`,
			samples: 0
		};
	}
	if (options.bounds && !loopInsideBounds(loop, options.bounds)) {
		return {
			ok: false,
			reason: 'outside-domain',
			detail: 'The complete loop must stay inside the evaluated domain.',
			samples: 0
		};
	}

	let previous: number | null = null;
	let stablePasses = 0;
	let lastSamples = 0;
	for (let samples = minimumSamples; samples <= maximumSamples; samples *= 2) {
		lastSamples = samples;
		const primary = analyseGrid(node, loop, samples, options.preset, minimumModulus);
		if (!primary.ok) return primary;
		// N and N + 1 are coprime. Requiring both grids to agree breaks the
		// exact dyadic alias that can make z^(2^m) look constant on every
		// midpoint/doubling grid up to the budget.
		const audit = analyseGrid(node, loop, samples + 1, options.preset, minimumModulus);
		if (!audit.ok) return audit;
		const largestStep = Math.max(primary.largestStep, audit.largestStep);
		const continuityError = Math.max(primary.continuityError, audit.continuityError);
		const gridDisagreement = Math.abs(primary.winding - audit.winding);
		if (
			(largestStep > maximumPhaseStep ||
				continuityError > continuityTolerance ||
				gridDisagreement > stabilityTolerance) &&
			samples * 2 > maximumSamples
		) {
			return {
				ok: false,
				reason: 'under-resolved',
				detail:
					gridDisagreement > stabilityTolerance
						? 'The doubled grid and its coprime audit grid still disagree at the evaluation budget.'
						: continuityError > continuityTolerance
							? 'Recursive midpoint checks still expose missed phase continuity at the evaluation budget.'
							: 'Successive output phases still turn too far between samples at the evaluation budget.',
				samples
			};
		}
		const winding = primary.winding;
		const continuitySafe =
			largestStep <= maximumPhaseStep &&
			continuityError <= continuityTolerance &&
			gridDisagreement <= stabilityTolerance;
		if (continuitySafe && previous !== null && Math.abs(winding - previous) <= stabilityTolerance) {
			stablePasses += 1;
		} else stablePasses = 0;
		if (stablePasses >= 1 && continuitySafe) {
			const trustedClass = new Set([
				'entire',
				'polynomial',
				'meromorphic',
				'removable-extension'
			]).has(options.preset?.mathematicalClass ?? '');
			const rounded = Math.round(winding);
			const integer = Object.is(rounded, -0) ? 0 : rounded;
			return {
				ok: true,
				winding,
				integer,
				samples,
				minimumModulus: Math.min(primary.minimumModulus, audit.minimumModulus),
				interpretation: trustedClass ? 'zeros-minus-poles' : 'output-winding',
				detail: trustedClass
					? `Converged numerical estimate: N − P = ${integer} for this counterclockwise loop, after recursive midpoint and coprime-grid checks.`
					: `Converged output-curve winding estimate: ${integer} after recursive midpoint and coprime-grid checks; no meromorphic N − P claim is made.`
			};
		}
		previous = winding;
	}
	return {
		ok: false,
		reason: 'not-stable',
		detail: 'Successive sample doublings did not stabilise within the evaluation budget.',
		samples: lastSamples
	};
}
