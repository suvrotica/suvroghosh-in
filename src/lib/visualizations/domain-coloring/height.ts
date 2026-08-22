import { argument, complex, evaluateExpressionDiagnostic, magnitude, subtract } from './complex';
import type {
	Complex,
	BranchCut,
	ComplexFeature,
	DomainColoringPreset,
	EvaluationDiagnostic,
	ExpressionNode,
	HeightSample,
	HeightSettings,
	ProbeResult
} from './types';

export const LOG_TWO = Math.LN2;

function formatHeightParameter(value: number): string {
	if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
		return value.toExponential(3).replace(/\.0+(?=e)/, '');
	}
	return Number(value.toFixed(4)).toString();
}

/**
 * Describe the selected vertical transform without evaluating the expression at an arbitrary
 * point. Keeping this definition settings-only prevents a zero, pole, or domain error at a
 * convenient probe point from changing the legend or accessible view description.
 */
export function heightDefinition(settings: HeightSettings): string {
	const scale = formatHeightParameter(settings.verticalScale);
	if (settings.lens === 'flat') return 'h(z) = 0';
	if (settings.lens === 'phase') {
		return `hθ(z) = sθ · Arg f(z) / π, with sθ = ${scale}`;
	}
	if (settings.lens === 'log-magnitude') {
		const cap = formatHeightParameter(settings.logCap);
		const transform = settings.compression === 'asinh' ? 'asinh(log₂|f(z)|)' : 'log₂|f(z)|';
		return `hL(z) = sL · clip(${transform}, −K, K), with sL = ${scale} and K = ${cap}`;
	}

	const component = settings.lens === 'real' ? 'Re f(z)' : 'Im f(z)';
	const componentScale = formatHeightParameter(settings.componentScale);
	const componentCap = formatHeightParameter(settings.componentCap);
	return `t = ${component}; Qₐ(t) = sgn(t) log₂(1 + |t|/a); hᴄ(z) = sᴄ · clip(Qₐ(t), −Kᴄ, Kᴄ), with a = ${componentScale}, sᴄ = ${scale}, and Kᴄ = ${componentCap}`;
}

export function signedSymlog(value: number, scale: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return Number.NaN;
	return Math.sign(value) * Math.log2(1 + Math.abs(value) / scale);
}

function clipped(value: number, cap: number) {
	if (value > cap) return { value: cap, clipped: 'high' as const };
	if (value < -cap) return { value: -cap, clipped: 'low' as const };
	return { value, clipped: 'none' as const };
}

export function sampleHeight(
	evaluation: EvaluationDiagnostic,
	settings: HeightSettings
): HeightSample {
	const formula = heightDefinition(settings);
	const { value, status } = evaluation;
	if (settings.lens === 'flat') {
		return { raw: 0, displayed: 0, clipped: 'none', label: 'Flat input plane', formula };
	}

	if (settings.lens === 'log-magnitude') {
		if (status === 'pole') {
			return {
				raw: null,
				displayed: settings.verticalScale * settings.logCap,
				clipped: 'high',
				label: 'Log magnitude (pole limit)',
				formula
			};
		}
		if (status === 'zero') {
			return {
				raw: null,
				displayed: -settings.verticalScale * settings.logCap,
				clipped: 'low',
				label: 'Log magnitude (zero limit)',
				formula
			};
		}
		const radius = magnitude(value);
		if (!Number.isFinite(radius) || radius <= 0) {
			return {
				raw: radius === 0 ? Number.NEGATIVE_INFINITY : null,
				displayed: radius === 0 ? -settings.verticalScale * settings.logCap : null,
				clipped: radius === 0 ? 'low' : 'none',
				label: 'Log magnitude',
				formula
			};
		}
		const raw = Math.log2(radius);
		const transformed = settings.compression === 'asinh' ? Math.asinh(raw) : raw;
		const display = clipped(transformed, settings.logCap);
		return {
			raw,
			displayed: settings.verticalScale * display.value,
			clipped: display.clipped,
			label: settings.compression === 'asinh' ? 'Compressed log magnitude' : 'Log magnitude',
			formula
		};
	}

	if (
		status === 'undefined' ||
		status === 'indeterminate' ||
		!Number.isFinite(value.re + value.im)
	) {
		return {
			raw: null,
			displayed: null,
			clipped: 'none',
			label:
				settings.lens === 'real'
					? 'Real output'
					: settings.lens === 'imaginary'
						? 'Imaginary output'
						: 'Principal phase',
			formula
		};
	}

	if (settings.lens === 'phase') {
		if (status === 'zero' || status === 'zero-like' || magnitude(value) === 0) {
			return {
				raw: null,
				displayed: null,
				clipped: 'none',
				label: 'Principal phase (undefined at zero)',
				formula
			};
		}
		const raw = argument(value);
		return {
			raw,
			displayed: settings.verticalScale * (raw / Math.PI),
			clipped: 'none',
			label: 'Principal phase',
			formula
		};
	}

	const component = settings.lens === 'real' ? value.re : value.im;
	const raw = signedSymlog(component, settings.componentScale);
	const display = clipped(raw, settings.componentCap);
	return {
		raw: component,
		displayed: settings.verticalScale * display.value,
		clipped: display.clipped,
		label: settings.lens === 'real' ? 'Real output' : 'Imaginary output',
		formula
	};
}

function closestFeature(z: Complex, features: readonly ComplexFeature[], tolerance: number) {
	let closest: ComplexFeature | null = null;
	let distance = Number.POSITIVE_INFINITY;
	for (const feature of features) {
		const next = Math.hypot(z.re - feature.z.re, z.im - feature.z.im);
		if (next < distance && next <= tolerance) {
			closest = feature;
			distance = next;
		}
	}
	return closest;
}

function pointSegmentDistance(point: Complex, from: Complex, to: Complex) {
	const dx = to.re - from.re;
	const dy = to.im - from.im;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(point.re - from.re, point.im - from.im);
	const projection = Math.max(
		0,
		Math.min(1, ((point.re - from.re) * dx + (point.im - from.im) * dy) / lengthSquared)
	);
	return Math.hypot(point.re - (from.re + projection * dx), point.im - (from.im + projection * dy));
}

function nearBranchCut(z: Complex, cuts: readonly BranchCut[] | undefined, tolerance: number) {
	return Boolean(
		cuts?.some((cut) => {
			if (cut.kind === 'real-preimage') return Math.abs(cut.test(z)) <= tolerance;
			if (cut.kind === 'segment') return pointSegmentDistance(z, cut.from, cut.to) <= tolerance;
			const length = Math.hypot(cut.direction.re, cut.direction.im);
			if (length === 0) return false;
			const unit = { re: cut.direction.re / length, im: cut.direction.im / length };
			const offset = { re: z.re - cut.origin.re, im: z.im - cut.origin.im };
			const along = offset.re * unit.re + offset.im * unit.im;
			const perpendicular = Math.abs(offset.re * unit.im - offset.im * unit.re);
			return along >= -tolerance && perpendicular <= tolerance;
		})
	);
}

export function numericalDerivative(node: ExpressionNode, z: Complex, step = 1e-5): Complex | null {
	const plus = evaluateExpressionDiagnostic(node, complex(z.re + step, z.im));
	const minus = evaluateExpressionDiagnostic(node, complex(z.re - step, z.im));
	if (plus.status === 'undefined' || plus.status === 'indeterminate') return null;
	if (minus.status === 'undefined' || minus.status === 'indeterminate') return null;
	const difference = subtract(plus.value, minus.value);
	const derivative = complex(difference.re / (2 * step), difference.im / (2 * step));
	return Number.isFinite(derivative.re) && Number.isFinite(derivative.im) ? derivative : null;
}

export function probeExpression(
	node: ExpressionNode,
	z: Complex,
	settings: HeightSettings,
	preset?: DomainColoringPreset,
	visibleFeatures: readonly ComplexFeature[] = preset?.features ?? [],
	featureTolerance = 1e-3
): ProbeResult {
	const evaluation = evaluateExpressionDiagnostic(node, z);
	const nearFeature = closestFeature(z, visibleFeatures, featureTolerance);
	const featureDistance = nearFeature
		? Math.hypot(z.re - nearFeature.z.re, z.im - nearFeature.z.im)
		: Number.POSITIVE_INFINITY;
	const exactFeature =
		nearFeature && featureDistance <= Math.max(1e-10, featureTolerance * 1e-6) ? nearFeature : null;
	let status = evaluation.status;
	let statusDetail = evaluation.reason ?? 'Finite numerical sample.';

	if (exactFeature?.kind === 'zero') {
		status = 'zero';
		statusDetail = `${exactFeature.label}; log magnitude tends to −∞.`;
	} else if (exactFeature?.kind === 'pole') {
		status = 'pole';
		statusDetail = `${exactFeature.label}; log magnitude tends to +∞.`;
	} else if (nearFeature?.kind === 'zero' || nearFeature?.kind === 'pole') {
		statusDetail = `Near ${nearFeature.label}; this finite sample is not promoted to the exact limiting value. ${statusDetail}`;
	} else if (nearFeature) {
		statusDetail = `${nearFeature.label}. ${nearFeature.note ?? ''}`.trim();
	} else if (evaluation.status === 'zero-like') {
		statusDetail = preset
			? 'Numerically zero at this sample.'
			: 'Numerically zero-like; not a proof of a zero.';
	}

	const semanticEvaluation = { ...evaluation, status };
	const modulus = Number.isFinite(magnitude(evaluation.value)) ? magnitude(evaluation.value) : null;
	const phase = modulus !== null && modulus > 0 ? argument(evaluation.value) : null;
	const logMagnitude = modulus !== null && modulus > 0 ? Math.log2(modulus) : null;
	const cutNearby = nearBranchCut(z, preset?.cuts, featureTolerance);
	const singularFeatureNearby = Boolean(
		nearFeature && ['pole', 'branch-point', 'essential'].includes(nearFeature.kind)
	);
	const derivative =
		preset?.holomorphic && !cutNearby && !singularFeatureNearby
			? numericalDerivative(node, z, Math.max(1e-7, featureTolerance * 0.05))
			: null;
	if (preset?.holomorphic && cutNearby && !nearFeature) {
		statusDetail = `${statusDetail} Numerical derivative suppressed near the chosen branch cut.`;
	}
	const localScale = derivative ? magnitude(derivative) : null;
	const localRotation =
		derivative && localScale !== null && localScale > 1e-10 ? argument(derivative) : null;

	return {
		z,
		value: evaluation.value,
		status,
		statusDetail,
		modulus,
		phase,
		phaseDegrees: phase === null ? null : (phase * 180) / Math.PI,
		logMagnitude,
		height: sampleHeight(semanticEvaluation, settings),
		derivative,
		localScale,
		localRotation,
		nearFeature
	};
}
