<script lang="ts">
	import {
		finitePoint,
		pointX,
		pointY,
		type Eigensystem,
		type HistoryRecord,
		type PointLike,
		type ProfilePoint
	} from './types';

	type AuxiliaryVector = {
		readonly label: string;
		readonly vector: PointLike;
		readonly kind?: 'memory' | 'reference' | 'estimate';
	};

	type UncertaintyFanEntry =
		| PointLike
		| {
				readonly active?: PointLike;
				readonly gradient?: PointLike;
				readonly label?: string;
		  };

	type Props = {
		record: HistoryRecord | null;
		/** Destination of record.update. Supplying this avoids making assumptions about history-row layout. */
		nextPoint?: PointLike | null;
		/** Raw loss at nextPoint, if a completed result exists. */
		nextLoss?: number | null;
		eigensystem?: Eigensystem | null;
		profile?: readonly ProfilePoint[];
		profileDirectionLabel?: string;
		parameterLabels?: readonly [string, string];
		auxiliaryVectors?: readonly AuxiliaryVector[];
		/** Caller-computed, deterministic gradient estimates. No random samples are made here. */
		uncertaintyFan?: readonly UncertaintyFanEntry[];
		gradientEstimateLabel?: string;
		referenceGradientLabel?: string;
		/** Offset of the accepted result on the supplied directional profile. Inferred from update norm. */
		profileChosenAlpha?: number | null;
		/** Offset of the step origin on the supplied directional profile. Defaults to zero. */
		profileStartAlpha?: number | null;
		/** Full-gradient norm at or below this value permits stationary-point wording. */
		stationaryGradientTolerance?: number;
		showTangentPlane?: boolean;
		showProfile?: boolean;
	};

	let {
		record,
		nextPoint = null,
		nextLoss = null,
		eigensystem = null,
		profile = [],
		profileDirectionLabel = 'actual update direction',
		parameterLabels = ['θ₁', 'θ₂'],
		auxiliaryVectors = [],
		uncertaintyFan = [],
		gradientEstimateLabel,
		referenceGradientLabel = 'Full-data/reference gradient ∇L',
		profileChosenAlpha,
		profileStartAlpha,
		stationaryGradientTolerance = 1e-7,
		showTangentPlane = true,
		showProfile = true
	}: Props = $props();

	const uid = $props.id();
	const centre = { x: 190, y: 136 };
	const vectorRadius = 92;

	type UnknownMap = Record<string, unknown>;

	function magnitude(vector: PointLike | null | undefined): number {
		return vector && finitePoint(vector) ? Math.hypot(pointX(vector), pointY(vector)) : 0;
	}

	function negate(vector: PointLike | null | undefined): PointLike | null {
		return vector && finitePoint(vector) ? [-pointX(vector), -pointY(vector)] : null;
	}

	function pointFromUnknown(value: unknown): PointLike | null {
		if (Array.isArray(value)) {
			return value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
				? ([Number(value[0]), Number(value[1])] as const)
				: null;
		}
		if (value && typeof value === 'object') {
			const candidate = value as UnknownMap;
			return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
				? { x: Number(candidate.x), y: Number(candidate.y) }
				: null;
		}
		return null;
	}

	function mapFromUnknown(value: unknown): UnknownMap | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as UnknownMap)
			: null;
	}

	function fanGradient(entry: UncertaintyFanEntry): PointLike | null {
		const direct = pointFromUnknown(entry);
		if (direct) return direct;
		const wrapper = mapFromUnknown(entry);
		return pointFromUnknown(wrapper?.active) ?? pointFromUnknown(wrapper?.gradient);
	}

	let activeGradient = $derived(
		record?.gradient && finitePoint(record.gradient) ? record.gradient : null
	);
	let referenceGradient = $derived(
		record?.fullGradient && finitePoint(record.fullGradient) ? record.fullGradient : null
	);
	let negativeActiveGradient = $derived(negate(activeGradient));
	let negativeReferenceGradient = $derived(negate(referenceGradient));
	let deterministicFan = $derived(
		uncertaintyFan.map(fanGradient).filter((point): point is PointLike => point !== null)
	);

	function isScaleStatistic(label: string): boolean {
		return /square|variance|second moment|denominator|precondition|scale state/i.test(label);
	}

	function optimizerStateIteration(): number | null {
		for (const source of [
			mapFromUnknown(record?.optimizerDiagnostics),
			mapFromUnknown(record?.optimizerState)
		]) {
			const iteration = source?.iteration;
			if (typeof iteration === 'number' && Number.isSafeInteger(iteration) && iteration >= 0) {
				return iteration;
			}
		}
		return record ? record.iteration + 1 : null;
	}

	function timeAlignedOptimizerLabel(label: string): string {
		const iteration = optimizerStateIteration();
		if (iteration === null) return label;
		const transition =
			iteration === 0
				? 'at the initial state θ[0]'
				: `after update ${iteration} (θ[${iteration - 1}] → θ[${iteration}])`;
		if (/momentum velocity/i.test(label)) return `Momentum velocity v[${iteration}] ${transition}`;
		if (/adam bias-corrected first moment/i.test(label))
			return `Adam bias-corrected first moment m̂[${iteration}] ${transition}`;
		if (/adam first moment/i.test(label)) return `Adam first moment m[${iteration}] ${transition}`;
		if (/rmsprop effective direction/i.test(label))
			return iteration === 0
				? 'RMSProp effective direction at the initial state'
				: `RMSProp effective direction for update ${iteration} (θ[${iteration - 1}] → θ[${iteration}])`;
		if (/rmsprop.*square|squared-gradient state/i.test(label))
			return `RMSProp squared-gradient state s[${iteration}] ${transition}`;
		if (/adam bias-corrected second moment/i.test(label))
			return `Adam bias-corrected second moment v̂[${iteration}] ${transition}`;
		if (/adam second moment/i.test(label))
			return `Adam second moment v[${iteration}] ${transition}`;
		return label;
	}

	function automaticOptimizerVectors(): readonly AuxiliaryVector[] {
		const diagnostics = mapFromUnknown(record?.optimizerDiagnostics);
		const state = mapFromUnknown(record?.optimizerState);
		const sources = [diagnostics, state].filter((source): source is UnknownMap => source !== null);
		const vectors: AuxiliaryVector[] = [];
		const add = (
			label: string,
			key: string,
			kind: NonNullable<AuxiliaryVector['kind']> = 'memory'
		) => {
			for (const source of sources) {
				const vector = pointFromUnknown(source[key]);
				if (vector) {
					vectors.push({ label, vector, kind });
					return;
				}
			}
		};
		add('Momentum velocity', 'velocity');
		add('Adam first moment', 'firstMoment');
		add('Adam bias-corrected first moment', 'biasCorrectedFirstMoment', 'estimate');
		const optimizer = diagnostics?.optimizer;
		if (optimizer === 'rmsprop') {
			add('RMSProp effective direction', 'effectiveDirection', 'estimate');
		}
		return vectors;
	}

	function mergedAuxiliaryVectors(): readonly AuxiliaryVector[] {
		const merged: AuxiliaryVector[] = [];
		const labels: string[] = [];
		for (const vector of [...auxiliaryVectors, ...automaticOptimizerVectors()]) {
			if (!finitePoint(vector.vector)) continue;
			const alignedVector = { ...vector, label: timeAlignedOptimizerLabel(vector.label) };
			const key = alignedVector.label.toLocaleLowerCase('en');
			if (labels.includes(key)) continue;
			labels.push(key);
			merged.push(alignedVector);
		}
		return merged;
	}

	let optimizerVectors = $derived(mergedAuxiliaryVectors());
	let plottableOptimizerVectors = $derived(
		optimizerVectors.filter((vector) => !isScaleStatistic(vector.label))
	);
	let optimizerStatistics = $derived.by(() => {
		const diagnostics = mapFromUnknown(record?.optimizerDiagnostics);
		const state = mapFromUnknown(record?.optimizerState);
		const sources = [diagnostics, state].filter((source): source is UnknownMap => source !== null);
		const statistics: AuxiliaryVector[] = optimizerVectors.filter((vector) =>
			isScaleStatistic(vector.label)
		);
		const labels = statistics.map((item) => item.label.toLocaleLowerCase('en'));
		const add = (label: string, key: string) => {
			const alignedLabel = timeAlignedOptimizerLabel(label);
			if (labels.includes(alignedLabel.toLocaleLowerCase('en'))) return;
			for (const source of sources) {
				const vector = pointFromUnknown(source[key]);
				if (vector) {
					statistics.push({ label: alignedLabel, vector, kind: 'estimate' });
					labels.push(alignedLabel.toLocaleLowerCase('en'));
					return;
				}
			}
		};
		add('RMSProp squared-gradient state', 'accumulatedSquares');
		add('Adam second moment', 'secondMoment');
		add('Adam bias-corrected second moment', 'biasCorrectedSecondMoment');
		return statistics;
	});

	let vectorMaximum = $derived(
		Math.max(
			magnitude(activeGradient),
			magnitude(referenceGradient),
			magnitude(record?.update),
			...plottableOptimizerVectors.map((vector) => magnitude(vector.vector)),
			...deterministicFan.map(magnitude),
			Number.EPSILON
		)
	);

	function visualVector(vector: PointLike | null | undefined): { x: number; y: number } {
		const norm = magnitude(vector);
		if (!vector || !finitePoint(vector) || norm === 0) return { x: 0, y: 0 };
		const length = Math.max(8, vectorRadius * Math.sqrt(norm / vectorMaximum));
		return { x: (pointX(vector) / norm) * length, y: (-pointY(vector) / norm) * length };
	}

	function directionVector(vector: PointLike, length = 64): { x: number; y: number } {
		const norm = magnitude(vector);
		if (norm === 0) return { x: 0, y: 0 };
		return { x: (pointX(vector) / norm) * length, y: (-pointY(vector) / norm) * length };
	}

	function format(value: number | null | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
		if (value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001)) {
			return value.toExponential(4);
		}
		return value.toLocaleString('en-IN', { maximumFractionDigits: 6 });
	}

	function vectorLabel(vector: PointLike | null | undefined): string {
		if (!vector || !finitePoint(vector)) return '—';
		return `[${format(pointX(vector))}, ${format(pointY(vector))}]`;
	}

	type HessianDefiniteness =
		| 'positive-definite'
		| 'negative-definite'
		| 'indefinite'
		| 'positive-semidefinite'
		| 'negative-semidefinite'
		| 'degenerate';

	function classifyCurvature(): {
		label: string;
		accessible: string;
		definiteness: HessianDefiniteness | 'unavailable';
		stationary: boolean;
	} {
		if (!eigensystem) {
			return {
				label: 'Curvature unavailable',
				accessible:
					'No reliable Hessian is available, so neither local curvature nor stationary-point type is classified.',
				definiteness: 'unavailable',
				stationary: false
			};
		}
		const [first, second] = eigensystem.values;
		const eigenTolerance = Math.max(1e-12, Math.max(Math.abs(first), Math.abs(second)) * 1e-9);
		let definiteness: HessianDefiniteness;
		if (first > eigenTolerance && second > eigenTolerance) definiteness = 'positive-definite';
		else if (first < -eigenTolerance && second < -eigenTolerance)
			definiteness = 'negative-definite';
		else if (
			(first > eigenTolerance && second < -eigenTolerance) ||
			(first < -eigenTolerance && second > eigenTolerance)
		)
			definiteness = 'indefinite';
		else if (
			first >= -eigenTolerance &&
			second >= -eigenTolerance &&
			(first > eigenTolerance || second > eigenTolerance)
		)
			definiteness = 'positive-semidefinite';
		else if (
			first <= eigenTolerance &&
			second <= eigenTolerance &&
			(first < -eigenTolerance || second < -eigenTolerance)
		)
			definiteness = 'negative-semidefinite';
		else definiteness = 'degenerate';

		const configuredTolerance =
			Number.isFinite(stationaryGradientTolerance) && stationaryGradientTolerance > 0
				? stationaryGradientTolerance
				: 1e-7;
		const referenceNorm = referenceGradient ? magnitude(referenceGradient) : null;
		const stationary = referenceNorm !== null && referenceNorm <= configuredTolerance;
		const definitenessText = definiteness.replace('-', ' ');

		if (stationary) {
			const gradientEvidence = `The full/reference gradient norm is ${format(referenceNorm)}, at or below the near-stationary tolerance ${format(configuredTolerance)}.`;
			if (definiteness === 'positive-definite') {
				return {
					label: 'Stationary minimum-like point',
					accessible: `${gradientEvidence} The Hessian is positive definite, which is locally consistent with a strict minimum.`,
					definiteness,
					stationary
				};
			}
			if (definiteness === 'negative-definite') {
				return {
					label: 'Stationary maximum-like point',
					accessible: `${gradientEvidence} The Hessian is negative definite, which is locally consistent with a strict maximum.`,
					definiteness,
					stationary
				};
			}
			if (definiteness === 'indefinite') {
				return {
					label: 'Stationary saddle point',
					accessible: `${gradientEvidence} The Hessian is indefinite, with upward and downward curvature directions, which is locally consistent with a saddle.`,
					definiteness,
					stationary
				};
			}
			return {
				label: 'Stationary; Hessian inconclusive',
				accessible: `${gradientEvidence} The Hessian is ${definitenessText}, so second-order information alone does not settle the stationary-point type.`,
				definiteness,
				stationary
			};
		}

		const label =
			definiteness === 'positive-definite'
				? 'Positive-definite curvature'
				: definiteness === 'negative-definite'
					? 'Negative-definite curvature'
					: definiteness === 'indefinite'
						? 'Indefinite curvature'
						: definiteness === 'positive-semidefinite'
							? 'Positive-semidefinite curvature'
							: definiteness === 'negative-semidefinite'
								? 'Negative-semidefinite curvature'
								: 'Degenerate curvature';
		const gradientEvidence =
			referenceNorm === null
				? 'No full/reference gradient was supplied, so no stationary-point type is inferred.'
				: `The full/reference gradient norm is ${format(referenceNorm)}, above the near-stationary tolerance ${format(configuredTolerance)}, so this is a curvature classification rather than a stationary-point claim.`;
		return {
			label,
			accessible: `The Hessian is ${definitenessText}. ${gradientEvidence}`,
			definiteness,
			stationary
		};
	}

	let curvatureReading = $derived(classifyCurvature());

	function eigenAngle(vector: PointLike): number {
		return (Math.atan2(pointY(vector), pointX(vector)) * 180) / Math.PI;
	}

	function eigenRadius(value: number): number {
		const finite = Math.max(1e-8, Math.abs(value));
		return Math.max(25, Math.min(76, 58 / Math.sqrt(finite)));
	}

	function saddleAsymptotes(): readonly [string, string] {
		if (!eigensystem || eigensystem.values[0] * eigensystem.values[1] >= 0) return ['', ''];
		const slope = Math.sqrt(
			Math.abs(eigensystem.values[0]) / Math.max(1e-12, Math.abs(eigensystem.values[1]))
		);
		const xLimit = Math.min(70, 70 / Math.max(1, slope));
		const yLimit = slope * xLimit;
		return [
			`M ${-xLimit} ${-yLimit} L ${xLimit} ${yLimit}`,
			`M ${-xLimit} ${yLimit} L ${xLimit} ${-yLimit}`
		];
	}

	function gradientComparison() {
		if (!activeGradient || !referenceGradient) return null;
		const ax = pointX(activeGradient);
		const ay = pointY(activeGradient);
		const rx = pointX(referenceGradient);
		const ry = pointY(referenceGradient);
		const activeNorm = Math.hypot(ax, ay);
		const referenceNorm = Math.hypot(rx, ry);
		const magnitudeError = Math.hypot(ax - rx, ay - ry);
		const angleDegrees =
			activeNorm === 0 || referenceNorm === 0
				? null
				: (Math.acos(
						Math.max(
							-1,
							Math.min(
								1,
								(ax / activeNorm) * (rx / referenceNorm) + (ay / activeNorm) * (ry / referenceNorm)
							)
						)
					) *
						180) /
					Math.PI;
		return {
			activeNorm,
			referenceNorm,
			magnitudeError,
			relativeError: referenceNorm === 0 ? null : magnitudeError / referenceNorm,
			angleDegrees,
			coincident: magnitudeError <= Math.max(1e-12, 1e-10 * Math.max(activeNorm, referenceNorm, 1))
		};
	}

	let comparison = $derived(gradientComparison());
	let resolvedGradientEstimateLabel = $derived(
		gradientEstimateLabel ??
			(record?.batchIndices
				? `Active minibatch gradient ĝ (rows ${record.batchIndices.map((index) => index + 1).join(', ')})`
				: comparison && !comparison.coincident
					? 'Active stochastic gradient estimate ĝ'
					: 'Active gradient ∇L')
	);

	function tangentGeometry(vector: PointLike | null) {
		if (!vector || !finitePoint(vector)) return null;
		const gx = pointX(vector);
		const gy = pointY(vector);
		const scale = Math.max(Math.abs(gx), Math.abs(gy), Number.EPSILON);
		const project = (dx: number, dy: number) => {
			const z = (gx * dx + gy * dy) / scale;
			return {
				x: 214 + dx * 45 + dy * 17,
				y: 50 - dy * 12 - z * 10
			};
		};
		const corners = [project(-1, -1), project(1, -1), project(1, 1), project(-1, 1)];
		const xAxis = [project(-1, 0), project(1, 0)];
		const yAxis = [project(0, -1), project(0, 1)];
		return {
			polygon: corners.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
			xAxis,
			yAxis,
			origin: project(0, 0)
		};
	}

	let tangentGradient = $derived(referenceGradient ?? activeGradient);
	let tangentPlane = $derived(tangentGeometry(tangentGradient));

	function profileBounds() {
		let xMin = Number.POSITIVE_INFINITY;
		let xMax = Number.NEGATIVE_INFINITY;
		let yMin = Number.POSITIVE_INFINITY;
		let yMax = Number.NEGATIVE_INFINITY;
		for (const point of profile) {
			if (!Number.isFinite(point.alpha) || !Number.isFinite(point.loss)) continue;
			xMin = Math.min(xMin, point.alpha);
			xMax = Math.max(xMax, point.alpha);
			yMin = Math.min(yMin, point.loss);
			yMax = Math.max(yMax, point.loss);
		}
		if (!Number.isFinite(xMin)) [xMin, xMax] = [-1, 1];
		if (!Number.isFinite(yMin)) [yMin, yMax] = [0, 1];
		if (xMin === xMax) xMax = xMin + 1;
		if (yMin === yMax) yMax = yMin + Math.max(1, Math.abs(yMin) * 0.1);
		const padding = (yMax - yMin) * 0.08;
		return { xMin, xMax, yMin: yMin - padding, yMax: yMax + padding };
	}

	let profileRange = $derived(profileBounds());
	let chosenAlpha = $derived(
		profileChosenAlpha === undefined
			? record?.update && finitePoint(record.update)
				? magnitude(record.update)
				: null
			: profileChosenAlpha
	);
	let startAlpha = $derived(profileStartAlpha === undefined ? 0 : profileStartAlpha);

	function profileX(value: number): number {
		return 48 + ((value - profileRange.xMin) / (profileRange.xMax - profileRange.xMin)) * 354;
	}

	function profileY(value: number): number {
		return 142 - ((value - profileRange.yMin) / (profileRange.yMax - profileRange.yMin)) * 112;
	}

	function finiteProfilePoints(): readonly ProfilePoint[] {
		return profile
			.filter((point) => Number.isFinite(point.alpha) && Number.isFinite(point.loss))
			.slice()
			.sort((left, right) => left.alpha - right.alpha);
	}

	let validProfile = $derived(finiteProfilePoints());

	function profilePath(): string {
		return validProfile
			.map(
				(point, index) =>
					`${index === 0 ? 'M' : 'L'}${profileX(point.alpha).toFixed(2)},${profileY(point.loss).toFixed(2)}`
			)
			.join(' ');
	}

	function profileLossAt(alpha: number | null): number | null {
		if (alpha === null || validProfile.length === 0) return null;
		if (alpha < validProfile[0].alpha || alpha > validProfile.at(-1)!.alpha) return null;
		for (let index = 0; index < validProfile.length; index += 1) {
			const point = validProfile[index];
			if (point.alpha === alpha) return point.loss;
			const next = validProfile[index + 1];
			if (!next || next.alpha < alpha) continue;
			const fraction = (alpha - point.alpha) / Math.max(Number.EPSILON, next.alpha - point.alpha);
			return point.loss + (next.loss - point.loss) * fraction;
		}
		return null;
	}

	let profileOriginLoss = $derived(
		record && Number.isFinite(record.loss) ? record.loss : profileLossAt(0)
	);
	let profileStartLoss = $derived(profileLossAt(startAlpha));
	let profileChosenLoss = $derived(
		typeof nextLoss === 'number' && Number.isFinite(nextLoss) && chosenAlpha !== null
			? nextLoss
			: profileLossAt(chosenAlpha)
	);
	let bestProfilePoint = $derived.by(() => {
		let best: ProfilePoint | null = null;
		for (const point of validProfile) {
			if (!best || point.loss < best.loss) best = point;
		}
		return best;
	});
	let bestForwardProfilePoint = $derived.by(() => {
		if (chosenAlpha === null) return null;
		const origin = startAlpha ?? 0;
		const direction = Math.sign(chosenAlpha - origin) || 1;
		let best: ProfilePoint | null = null;
		for (const point of validProfile) {
			if ((point.alpha - origin) * direction < -Number.EPSILON) continue;
			if (!best || point.loss < best.loss) best = point;
		}
		return best;
	});

	function stepAssessment() {
		if (chosenAlpha === null || !bestProfilePoint || !bestForwardProfilePoint) {
			return {
				kind: 'unavailable',
				title: 'Step comparison unavailable',
				text: 'A completed update and a finite directional profile are needed.'
			};
		}
		const direction = Math.sign(chosenAlpha - (startAlpha ?? 0)) || 1;
		const spacing =
			validProfile.length > 1
				? Math.abs(validProfile.at(-1)!.alpha - validProfile[0].alpha) / (validProfile.length - 1)
				: 0;
		const tolerance = Math.max(
			spacing * 1.5,
			Math.abs(chosenAlpha - (startAlpha ?? 0)) * 0.08,
			(profileRange.xMax - profileRange.xMin) * 0.01
		);
		const origin = startAlpha ?? 0;
		const globalBestIsOpposite = (bestProfilePoint.alpha - origin) * direction < -tolerance;
		if (
			globalBestIsOpposite &&
			profileChosenLoss !== null &&
			profileStartLoss !== null &&
			profileChosenLoss > profileStartLoss
		) {
			return {
				kind: 'wrong-way',
				title: 'Update climbs in this slice',
				text: 'The accepted update raises sampled loss while lower displayed values lie on the opposite half of the profile. Optimizer memory or local nonconvexity can point away from the local descent half-ray.'
			};
		}
		const signedGap = (bestForwardProfilePoint.alpha - chosenAlpha) * direction;
		const edge =
			bestForwardProfilePoint === validProfile[0] ||
			bestForwardProfilePoint === validProfile.at(-1);
		const qualifier = edge
			? ' The best sample lies at the edge of this window, so widen the profile before treating it as a line-search optimum.'
			: ' The comparison is with the best displayed sample, not an exact line search.';
		if (signedGap > tolerance) {
			return {
				kind: 'under',
				title: 'Undershoot in this slice',
				text: `The accepted result stops before the best sampled point along the chosen direction.${qualifier}`
			};
		}
		if (signedGap < -tolerance) {
			return {
				kind: 'over',
				title: 'Overshoot in this slice',
				text: `The accepted result passes the best sampled point along the chosen direction.${qualifier}`
			};
		}
		return {
			kind: 'near',
			title: 'Near the best sampled point',
			text: `The accepted result lands within the sampling tolerance of this slice’s lowest displayed point.${qualifier}`
		};
	}

	let assessment = $derived(stepAssessment());
	let activeGradientVector = $derived(visualVector(negativeActiveGradient));
	let referenceGradientVector = $derived(visualVector(negativeReferenceGradient));
	let updateVector = $derived(visualVector(record?.update));
	let resolvedNextPoint = $derived(
		nextPoint && finitePoint(nextPoint)
			? nextPoint
			: record?.theta && record.update && finitePoint(record.theta) && finitePoint(record.update)
				? ([
						pointX(record.theta) + pointX(record.update),
						pointY(record.theta) + pointY(record.update)
					] as const)
				: null
	);
</script>

<section
	class="microscope"
	data-testid="gradient-step-microscope"
	aria-labelledby={`${uid}-heading`}
>
	<header>
		<div>
			<p class="eyebrow">Step microscope</p>
			<h3 id={`${uid}-heading`}>{record ? `Iteration ${record.iteration}` : 'No step selected'}</h3>
		</div>
		<p class="classification" aria-label={curvatureReading.accessible}>
			{curvatureReading.label}
		</p>
	</header>

	{#if record}
		<dl class="metric-strip">
			<div>
				<dt>Current raw loss</dt>
				<dd>{format(record.loss)}</dd>
			</div>
			<div>
				<dt>Result raw loss</dt>
				<dd>{format(nextLoss)}</dd>
			</div>
			<div>
				<dt>∥gradient used∥</dt>
				<dd>{format(record.gradientNorm)}</dd>
			</div>
			<div>
				<dt>∥accepted update∥</dt>
				<dd>{format(record.stepNorm)}</dd>
			</div>
			<div>
				<dt>Current θ</dt>
				<dd>{vectorLabel(record.theta)}</dd>
			</div>
			<div>
				<dt>Result θ</dt>
				<dd>{vectorLabel(resolvedNextPoint)}</dd>
			</div>
		</dl>
	{/if}

	<div class="microscope-grid">
		<div class="vector-panel">
			<h4>Local directions, state and curvature</h4>
			<svg
				viewBox="0 0 380 280"
				role="img"
				aria-labelledby={`${uid}-vectors-title ${uid}-vectors-desc`}
			>
				<title id={`${uid}-vectors-title`}
					>Descent directions, accepted update, optimiser state, and Hessian eigenvectors</title
				>
				<desc id={`${uid}-vectors-desc`}>
					Gradient arrows point downhill: minus the active estimate and minus the full reference.
					The gold arrow is the realised parameter displacement and its endpoint is the supplied
					result. Vector lengths are square-root compressed; optimiser memory arrows retain their
					raw sign. {curvatureReading.accessible}
				</desc>
				<defs>
					<marker
						id={`${uid}-gradient-arrow`}
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="gradient-fill" />
					</marker>
					<marker
						id={`${uid}-reference-arrow`}
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="reference-fill" />
					</marker>
					<marker
						id={`${uid}-update-arrow`}
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="update-fill" />
					</marker>
					<marker
						id={`${uid}-eigen-arrow`}
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"
					>
						<path d="M0,0 L7,3.5 L0,7 z" class="eigen-fill" />
					</marker>
					<marker
						id={`${uid}-state-arrow`}
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"
					>
						<path d="M0,0 L7,3.5 L0,7 z" class="state-fill" />
					</marker>
				</defs>
				<line class="axis" x1="25" x2="355" y1={centre.y} y2={centre.y} />
				<line class="axis" x1={centre.x} x2={centre.x} y1="16" y2="255" />
				<text class="axis-label" x="350" y={centre.y - 8}>{parameterLabels[0]}</text>
				<text class="axis-label" x={centre.x + 8} y="23">{parameterLabels[1]}</text>

				{#if eigensystem}
					{@const firstVector = directionVector(eigensystem.vectors[0])}
					{@const secondVector = directionVector(eigensystem.vectors[1])}
					{#if eigensystem.values[0] * eigensystem.values[1] >= 0}
						<ellipse
							class="curvature-ellipse"
							cx={centre.x}
							cy={centre.y}
							rx={eigenRadius(eigensystem.values[0])}
							ry={eigenRadius(eigensystem.values[1])}
							transform={`rotate(${-eigenAngle(eigensystem.vectors[0])} ${centre.x} ${centre.y})`}
						/>
					{:else}
						{@const asymptotes = saddleAsymptotes()}
						<g
							transform={`translate(${centre.x} ${centre.y}) rotate(${-eigenAngle(eigensystem.vectors[0])})`}
						>
							<path class="saddle-asymptote" d={asymptotes[0]} />
							<path class="saddle-asymptote" d={asymptotes[1]} />
						</g>
					{/if}
					<line
						class="eigen-vector first"
						x1={centre.x - firstVector.x}
						y1={centre.y - firstVector.y}
						x2={centre.x + firstVector.x}
						y2={centre.y + firstVector.y}
						marker-end={`url(#${uid}-eigen-arrow)`}
					/>
					<line
						class="eigen-vector second"
						x1={centre.x - secondVector.x}
						y1={centre.y - secondVector.y}
						x2={centre.x + secondVector.x}
						y2={centre.y + secondVector.y}
						marker-end={`url(#${uid}-eigen-arrow)`}
					/>
				{/if}

				{#each deterministicFan as fan, index (`fan-${index}`)}
					{@const vector = visualVector(negate(fan))}
					<line
						class="uncertainty-vector"
						x1={centre.x}
						y1={centre.y}
						x2={centre.x + vector.x}
						y2={centre.y + vector.y}
					/>
				{/each}

				{#if negativeReferenceGradient}
					<line
						class="reference-gradient-vector"
						x1={centre.x}
						y1={centre.y}
						x2={centre.x + referenceGradientVector.x}
						y2={centre.y + referenceGradientVector.y}
						marker-end={`url(#${uid}-reference-arrow)`}
					/>
					<text
						class="vector-symbol reference-symbol"
						x={centre.x + referenceGradientVector.x + 5}
						y={centre.y + referenceGradientVector.y - 5}>−∇L</text
					>
				{/if}
				{#if negativeActiveGradient}
					<line
						class="gradient-vector"
						x1={centre.x}
						y1={centre.y}
						x2={centre.x + activeGradientVector.x}
						y2={centre.y + activeGradientVector.y}
						marker-end={`url(#${uid}-gradient-arrow)`}
					/>
					<text
						class="vector-symbol gradient-symbol"
						x={centre.x + activeGradientVector.x + 5}
						y={centre.y + activeGradientVector.y + 11}>−ĝ</text
					>
				{/if}
				{#each plottableOptimizerVectors as auxiliary, index (`${auxiliary.label}-${index}`)}
					{@const vector = visualVector(auxiliary.vector)}
					<line
						class={`auxiliary-vector ${auxiliary.kind ?? 'memory'}`}
						x1={centre.x}
						y1={centre.y}
						x2={centre.x + vector.x}
						y2={centre.y + vector.y}
						marker-end={`url(#${uid}-state-arrow)`}
					/>
				{/each}
				{#if record?.update && finitePoint(record.update)}
					<line
						class="update-vector"
						x1={centre.x}
						y1={centre.y}
						x2={centre.x + updateVector.x}
						y2={centre.y + updateVector.y}
						marker-end={`url(#${uid}-update-arrow)`}
					/>
					<circle
						class="result-ring"
						cx={centre.x + updateVector.x}
						cy={centre.y + updateVector.y}
						r="6.5"
					/>
					<text
						class="vector-symbol result-symbol"
						x={centre.x + updateVector.x + 7}
						y={centre.y + updateVector.y - 7}>θ{record.iteration + 1} result</text
					>
				{/if}
				<circle class="beacon" cx={centre.x} cy={centre.y} r="4.5" />
				<text class="origin-symbol" x={centre.x + 7} y={centre.y - 7}
					>θ{record?.iteration ?? 0}</text
				>
			</svg>
			<p class="compression-note">
				Arrow directions and signs are literal; lengths are √-compressed separately for display. The
				result ring is the endpoint of the accepted Δθ.
			</p>

			{#if showTangentPlane && tangentPlane}
				<div class="tangent-cue">
					<div>
						<strong>Local tangent plane</strong>
						<span>T(δ) = L(θ) + ∇L(θ) · δ</span>
					</div>
					<svg
						viewBox="0 0 300 100"
						role="img"
						aria-label={`Local tangent-plane cue from the ${referenceGradient ? 'full reference gradient' : 'active gradient estimate'}`}
					>
						<polygon class="tangent-plane" points={tangentPlane.polygon} />
						<line
							class="tangent-axis"
							x1={tangentPlane.xAxis[0].x}
							y1={tangentPlane.xAxis[0].y}
							x2={tangentPlane.xAxis[1].x}
							y2={tangentPlane.xAxis[1].y}
						/>
						<line
							class="tangent-axis"
							x1={tangentPlane.yAxis[0].x}
							y1={tangentPlane.yAxis[0].y}
							x2={tangentPlane.yAxis[1].x}
							y2={tangentPlane.yAxis[1].y}
						/>
						<circle
							class="tangent-origin"
							cx={tangentPlane.origin.x}
							cy={tangentPlane.origin.y}
							r="3"
						/>
						<text class="tangent-label" x="8" y="88"
							>Tilt uses {referenceGradient ? 'full ∇L' : 'active ĝ'}; height normalised for
							display.</text
						>
					</svg>
				</div>
			{/if}

			<dl class="vector-values">
				<div>
					<dt>{resolvedGradientEstimateLabel}</dt>
					<dd>{vectorLabel(activeGradient)}</dd>
				</div>
				<div>
					<dt>{referenceGradientLabel}</dt>
					<dd>{vectorLabel(referenceGradient)}</dd>
				</div>
				<div>
					<dt>Negative active gradient −ĝ</dt>
					<dd>{vectorLabel(negativeActiveGradient)}</dd>
				</div>
				<div>
					<dt>Accepted update Δθ</dt>
					<dd>{vectorLabel(record?.update)}</dd>
				</div>
				{#each plottableOptimizerVectors as auxiliary (auxiliary.label)}
					<div>
						<dt>{auxiliary.label}</dt>
						<dd>{vectorLabel(auxiliary.vector)}</dd>
					</div>
				{/each}
				{#each optimizerStatistics as statistic (statistic.label)}
					<div>
						<dt>
							{statistic.label}
							<span class="not-arrow">(componentwise state; not drawn as a direction)</span>
						</dt>
						<dd>{vectorLabel(statistic.vector)}</dd>
					</div>
				{/each}
			</dl>

			{#if comparison}
				<div class="gradient-audit" class:coincident={comparison.coincident}>
					<p>
						<strong
							>{comparison.coincident
								? 'Estimate and reference coincide'
								: 'Estimate versus full reference'}</strong
						>
					</p>
					<dl>
						<div>
							<dt>Angular error</dt>
							<dd>
								{comparison.angleDegrees === null
									? 'undefined at zero norm'
									: `${format(comparison.angleDegrees)}°`}
							</dd>
						</div>
						<div>
							<dt>Magnitude error ∥ĝ − ∇L∥₂</dt>
							<dd>{format(comparison.magnitudeError)}</dd>
						</div>
						<div>
							<dt>Relative vector error</dt>
							<dd>
								{comparison.relativeError === null
									? 'undefined (reference norm is zero)'
									: `${format(comparison.relativeError * 100)}%`}
							</dd>
						</div>
					</dl>
				</div>
			{/if}
			{#if deterministicFan.length > 0}
				<p class="fan-note">
					The faint fan contains {deterministicFan.length} caller-supplied deterministic gradient estimates,
					drawn as downhill directions. It is not a confidence interval.
				</p>
			{/if}
		</div>

		{#if showProfile}
			<div class="profile-panel">
				<h4>One-dimensional loss profile</h4>
				<svg
					viewBox="0 0 430 180"
					role="img"
					aria-labelledby={`${uid}-profile-title ${uid}-profile-desc`}
				>
					<title id={`${uid}-profile-title`}>Loss along the {profileDirectionLabel}</title>
					<desc id={`${uid}-profile-desc`}>
						Raw loss sampled along one parameter-space line. The plot identifies alpha zero, the
						accepted result, and the lowest sampled point; the lowest sample is not claimed to be an
						exact line-search optimum.
					</desc>
					<line class="axis" x1="48" x2="402" y1="142" y2="142" />
					<line class="axis" x1="48" x2="48" y1="30" y2="142" />
					{#if profileRange.xMin <= 0 && profileRange.xMax >= 0}
						<line class="zero-line" x1={profileX(0)} x2={profileX(0)} y1="30" y2="142" />
					{/if}
					<path class="profile-line" d={profilePath()} />
					{#if profileOriginLoss !== null}
						<circle
							class="profile-origin"
							cx={profileX(0)}
							cy={profileY(profileOriginLoss)}
							r="7"
						/>
					{/if}
					{#if startAlpha !== null && profileStartLoss !== null && startAlpha !== 0}
						<rect
							class="profile-start"
							x={profileX(startAlpha) - 3.5}
							y={profileY(profileStartLoss) - 3.5}
							width="7"
							height="7"
						/>
					{/if}
					{#if chosenAlpha !== null && profileChosenLoss !== null && chosenAlpha >= profileRange.xMin && chosenAlpha <= profileRange.xMax}
						<line
							class="chosen-line"
							x1={profileX(chosenAlpha)}
							x2={profileX(chosenAlpha)}
							y1="30"
							y2="142"
						/>
						<rect
							class="profile-chosen"
							x={profileX(chosenAlpha) - 4}
							y={profileY(profileChosenLoss) - 4}
							width="8"
							height="8"
							transform={`rotate(45 ${profileX(chosenAlpha)} ${profileY(profileChosenLoss)})`}
						/>
					{/if}
					{#if bestProfilePoint}
						<circle
							class="profile-best"
							cx={profileX(bestProfilePoint.alpha)}
							cy={profileY(bestProfilePoint.loss)}
							r="5"
						/>
					{/if}
					<text class="tick" x="48" y="160">{format(profileRange.xMin)}</text>
					<text class="tick" x="402" y="160" text-anchor="end">{format(profileRange.xMax)}</text>
					<text class="tick" x="42" y="34" text-anchor="end">{format(profileRange.yMax)}</text>
					<text class="tick" x="42" y="146" text-anchor="end">{format(profileRange.yMin)}</text>
					<text class="axis-label" x="225" y="177" text-anchor="middle"
						>α along {profileDirectionLabel}</text
					>
				</svg>
				<div class="profile-legend" aria-label="Directional profile markers">
					<span class="origin-key">α = 0 · step origin</span>
					<span class="chosen-key">accepted result · α {format(chosenAlpha)}</span>
					<span class="best-key">best sample · α {format(bestProfilePoint?.alpha)}</span>
				</div>
				<div class="step-reading" data-assessment={assessment.kind}>
					<strong>{assessment.title}</strong>
					<p>{assessment.text}</p>
				</div>
				<dl class="eigen-values">
					<div>
						<dt>λ₁</dt>
						<dd>{format(eigensystem?.values[0])}</dd>
					</div>
					<div>
						<dt>λ₂</dt>
						<dd>{format(eigensystem?.values[1])}</dd>
					</div>
					<div>
						<dt>Local reading</dt>
						<dd>{curvatureReading.label}</dd>
					</div>
				</dl>
				<p class="curvature-explanation">{curvatureReading.accessible}</p>
				{#if eigensystem}
					<p class="caution">
						The Hessian and tangent plane describe only the neighbourhood of this step. They are not
						a map of the entire landscape.
					</p>
				{:else}
					<p class="caution">
						This landscape has not supplied a reliable Hessian at the selected step.
					</p>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.microscope {
		min-width: 0;
		border-top: 1px solid #414641;
		background: #121615;
		padding: clamp(0.85rem, 2vw, 1.25rem);
		color: #e9e2d5;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		color: #c79a52;
		font: 700 0.64rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h3,
	h4 {
		margin: 0;
		font-family: var(--font-sans, sans-serif);
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.8rem;
		letter-spacing: 0.02em;
	}

	.classification {
		margin: 0;
		border: 1px solid #535b55;
		padding: 0.35rem 0.5rem;
		color: #c9c2b5;
		font: 0.68rem/1.3 var(--font-mono, monospace);
	}

	.metric-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		margin: 0.85rem 0 0;
		background: #38403b;
	}

	.metric-strip > div {
		min-width: 0;
		background: #171c1a;
		padding: 0.65rem;
	}

	.metric-strip dt,
	.metric-strip dd {
		display: block;
	}

	.metric-strip dt {
		color: #9f9b92;
		font: 0.62rem/1.2 var(--font-mono, monospace);
		text-transform: uppercase;
	}

	.metric-strip dd {
		overflow: hidden;
		margin-top: 0.28rem;
		color: #eee7d9;
		font: 0.78rem/1.25 var(--font-mono, monospace);
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.microscope-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
		gap: 1.25rem;
		margin-top: 1rem;
	}

	.vector-panel,
	.profile-panel {
		min-width: 0;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 0.45rem;
		background: #0c100f;
	}

	.axis {
		fill: none;
		stroke: #39403c;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.axis-label,
	.tick,
	.vector-symbol,
	.origin-symbol {
		fill: #aaa498;
		font:
			10px ui-monospace,
			monospace;
	}

	.vector-symbol,
	.origin-symbol {
		paint-order: stroke;
		stroke: #0c100f;
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.gradient-vector {
		stroke: #d78b6c;
		stroke-width: 2.5;
	}

	.gradient-fill,
	.gradient-symbol {
		fill: #d78b6c;
	}

	.reference-gradient-vector {
		stroke: #83c7be;
		stroke-width: 2.1;
		stroke-dasharray: 5 4;
	}

	.reference-fill,
	.reference-symbol {
		fill: #83c7be;
	}

	.uncertainty-vector {
		stroke: #d78b6c;
		stroke-width: 1.1;
		opacity: 0.23;
	}

	.update-vector {
		stroke: #e7bd68;
		stroke-width: 3;
	}

	.update-fill,
	.result-symbol {
		fill: #e7bd68;
	}

	.result-ring {
		fill: #0c100f;
		stroke: #e7bd68;
		stroke-width: 2.2;
	}

	.eigen-vector {
		stroke: #75b9b0;
		stroke-width: 1.3;
		stroke-dasharray: 5 4;
	}

	.eigen-vector.second {
		stroke: #b69bd3;
	}

	.eigen-fill {
		fill: #75b9b0;
	}

	.curvature-ellipse {
		fill: rgb(117 185 176 / 7%);
		stroke: #75b9b0;
		stroke-width: 1.4;
		vector-effect: non-scaling-stroke;
	}

	.saddle-asymptote {
		fill: none;
		stroke: #d78b6c;
		stroke-width: 1.3;
		stroke-dasharray: 5 4;
		vector-effect: non-scaling-stroke;
	}

	.auxiliary-vector {
		stroke: #b69bd3;
		stroke-width: 1.6;
		stroke-dasharray: 3 4;
	}

	.auxiliary-vector.reference {
		stroke: #9cb9ae;
	}

	.auxiliary-vector.estimate {
		stroke: #8fa6cb;
	}

	.state-fill {
		fill: #b69bd3;
	}

	.beacon {
		fill: #f1eadb;
		stroke: #0c100f;
		stroke-width: 1.5;
	}

	.compression-note,
	.caution,
	.curvature-explanation,
	.fan-note {
		margin: 0.45rem 0 0;
		color: #aaa498;
		font: 0.68rem/1.45 var(--font-mono, monospace);
	}

	.tangent-cue {
		display: grid;
		grid-template-columns: minmax(8rem, 0.55fr) minmax(12rem, 1fr);
		align-items: center;
		gap: 0.65rem;
		margin-top: 0.65rem;
		border: 1px solid #343a37;
		background: #0d1110;
		padding: 0.55rem;
	}

	.tangent-cue strong,
	.tangent-cue span {
		display: block;
	}

	.tangent-cue strong {
		font: 700 0.68rem/1.3 var(--font-mono, monospace);
	}

	.tangent-cue span {
		margin-top: 0.25rem;
		color: #aaa498;
		font: 0.62rem/1.35 var(--font-mono, monospace);
	}

	.tangent-cue svg {
		margin: 0;
	}

	.tangent-plane {
		fill: rgb(117 185 176 / 15%);
		stroke: #75b9b0;
		stroke-width: 1.2;
	}

	.tangent-axis {
		stroke: #95aaa4;
		stroke-width: 0.8;
		stroke-dasharray: 3 3;
	}

	.tangent-origin {
		fill: #f1eadb;
	}

	.tangent-label {
		fill: #8f978f;
		font:
			9px ui-monospace,
			monospace;
	}

	.vector-values,
	.eigen-values,
	.gradient-audit dl {
		margin: 0.7rem 0 0;
		font: 0.7rem/1.4 var(--font-mono, monospace);
	}

	.vector-values div,
	.eigen-values div,
	.gradient-audit dl div {
		display: grid;
		grid-template-columns: minmax(7rem, 0.9fr) minmax(0, 1.1fr);
		gap: 0.75rem;
		border-top: 1px solid #343a37;
		padding: 0.38rem 0;
	}

	dt {
		color: #aaa498;
	}

	dd {
		min-width: 0;
		margin: 0;
		color: #e4ddcf;
		text-align: right;
	}

	.not-arrow {
		color: #81877f;
		font-size: 0.61rem;
	}

	.gradient-audit {
		margin-top: 0.7rem;
		border-left: 3px solid #d78b6c;
		background: #171c1a;
		padding: 0.55rem 0.7rem;
	}

	.gradient-audit.coincident {
		border-left-color: #75b9b0;
	}

	.gradient-audit p {
		margin: 0;
		font: 0.69rem/1.35 var(--font-mono, monospace);
	}

	.gradient-audit dl {
		margin-top: 0.35rem;
	}

	.zero-line,
	.chosen-line {
		stroke: #74786f;
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}

	.chosen-line {
		stroke: #e7bd68;
	}

	.profile-line {
		fill: none;
		stroke: #d5b26a;
		stroke-width: 2.2;
		vector-effect: non-scaling-stroke;
	}

	.profile-origin {
		fill: none;
		stroke: #83c7be;
		stroke-width: 1.7;
	}

	.profile-start {
		fill: #83c7be;
	}

	.profile-chosen {
		fill: #e7bd68;
		stroke: #111514;
		stroke-width: 1;
	}

	.profile-best {
		fill: #b69bd3;
		stroke: #111514;
		stroke-width: 1.2;
	}

	.profile-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		margin-top: 0.5rem;
		color: #aaa498;
		font: 0.63rem/1.35 var(--font-mono, monospace);
	}

	.profile-legend span::before {
		display: inline-block;
		width: 0.48rem;
		height: 0.48rem;
		margin-right: 0.32rem;
		border: 1px solid currentColor;
		content: '';
		vertical-align: -0.05rem;
	}

	.origin-key {
		color: #83c7be;
	}

	.chosen-key {
		color: #e7bd68;
	}

	.best-key {
		color: #b69bd3;
	}

	.step-reading {
		margin-top: 0.7rem;
		border: 1px solid #414741;
		border-left: 3px solid #858b84;
		background: #171c1a;
		padding: 0.65rem;
	}

	.step-reading[data-assessment='under'] {
		border-left-color: #75b9b0;
	}

	.step-reading[data-assessment='near'] {
		border-left-color: #9ebd76;
	}

	.step-reading[data-assessment='over'] {
		border-left-color: #d78b6c;
	}

	.step-reading strong {
		font: 700 0.72rem/1.3 var(--font-mono, monospace);
	}

	.step-reading p {
		margin: 0.25rem 0 0;
		color: #aaa498;
		font: 0.67rem/1.45 var(--font-mono, monospace);
	}

	@media (max-width: 52rem) {
		.microscope-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 38rem) {
		.metric-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.tangent-cue {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 32rem) {
		header {
			display: block;
		}

		.classification {
			width: fit-content;
			margin-top: 0.5rem;
		}

		.metric-strip {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.microscope,
		svg,
		.tangent-cue,
		.gradient-audit,
		.step-reading {
			background: Canvas;
			color: CanvasText;
		}

		.gradient-vector,
		.reference-gradient-vector,
		.update-vector,
		.eigen-vector,
		.curvature-ellipse,
		.saddle-asymptote,
		.profile-line,
		.axis,
		.zero-line,
		.chosen-line,
		.tangent-plane,
		.tangent-axis {
			stroke: CanvasText;
		}
	}
</style>
