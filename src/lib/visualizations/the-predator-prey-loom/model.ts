import {
	COMPARISON_A_VALUES,
	COMPARISON_K_VALUES,
	DEFAULT_COMPARISON_DURATION,
	DEFAULT_INITIAL_STATE,
	DEFAULT_LOOM_PARAMETERS,
	DEFAULT_SIMULATION_DURATION,
	DEFAULT_SOLVER_DT
} from './presets.ts';
import type {
	AnalyticalStabilityRegime,
	ComparisonBehaviourClass,
	ComparisonCellResult,
	DiscontinuousJumpMarker,
	EquilibriumAnalysis,
	InterventionSpec,
	LoomInitialState,
	LoomParameters,
	MeasuredPeakLag,
	PeakExtremum,
	SimulationRunResult,
	TimelineEventMarker,
	TrajectorySample
} from './types.ts';

export function evaluateDerivatives(
	prey: number,
	predator: number,
	params: LoomParameters
): { dPreyDt: number; dPredatorDt: number } {
	const { r, K, a, h, e, m } = params;
	const denom = 1 + a * h * prey;
	const functionalResponse = (a * prey * predator) / denom;
	const dPreyDt = r * prey * (1 - prey / K) - functionalResponse;
	const dPredatorDt = e * functionalResponse - m * predator;
	return { dPreyDt, dPredatorDt };
}

export function analyzeEquilibrium(params: LoomParameters): EquilibriumAnalysis {
	const { r, K, a, h, e, m } = params;
	const netConversion = e - m * h;
	if (netConversion <= 0 || a <= 0 || K <= 0) {
		return {
			kCritical: Number.POSITIVE_INFINITY,
			equilibriumPrey: Number.POSITIVE_INFINITY,
			equilibriumPredator: 0,
			coexistencePositive: false,
			jacobianTrace: -m,
			jacobianDeterminant: 0,
			eigenvalueReal: -m,
			eigenvalueImag: 0,
			isEquilibriumStable: true,
			enrichmentMargin: Number.NEGATIVE_INFINITY,
			regime: 'prey-only'
		};
	}

	const kCritical = (e + m * h) / (a * h * netConversion);
	const equilibriumPrey = m / (a * netConversion);
	const coexistencePositive = equilibriumPrey > 0 && equilibriumPrey < K;

	if (!coexistencePositive) {
		return {
			kCritical,
			equilibriumPrey,
			equilibriumPredator: 0,
			coexistencePositive: false,
			jacobianTrace: -r,
			jacobianDeterminant: 0,
			eigenvalueReal: -r,
			eigenvalueImag: 0,
			isEquilibriumStable: true,
			enrichmentMargin: K - kCritical,
			regime: 'prey-only'
		};
	}

	const denom = 1 + a * h * equilibriumPrey;
	const equilibriumPredator = (r / a) * (1 - equilibriumPrey / K) * denom;

	// Exact Jacobian at (N*, P*)
	const j11 = r * (1 - (2 * equilibriumPrey) / K) - (a * equilibriumPredator) / (denom * denom);
	const j12 = -(a * equilibriumPrey) / denom;
	const j21 = (e * a * equilibriumPredator) / (denom * denom);
	const j22 = 0;

	const jacobianTrace = j11 + j22;
	const jacobianDeterminant = j11 * j22 - j12 * j21;
	const discriminant = jacobianTrace * jacobianTrace - 4 * jacobianDeterminant;

	const eigenvalueReal = jacobianTrace / 2;
	const eigenvalueImag = discriminant < 0 ? Math.sqrt(-discriminant) / 2 : 0;
	const enrichmentMargin = K - kCritical;
	const eps = 1e-9;
	const isEquilibriumStable = jacobianTrace < -eps && jacobianDeterminant > 0;

	let regime: AnalyticalStabilityRegime;
	if (Math.abs(jacobianTrace) <= eps) {
		regime = 'hopf-neutral';
	} else if (jacobianTrace < 0) {
		regime = eigenvalueImag > 0 ? 'stable-spiral' : 'stable-node';
	} else {
		regime = eigenvalueImag > 0 ? 'unstable-spiral-cycle' : 'unstable-node-cycle';
	}

	return {
		kCritical,
		equilibriumPrey,
		equilibriumPredator,
		coexistencePositive,
		jacobianTrace,
		jacobianDeterminant,
		eigenvalueReal,
		eigenvalueImag,
		isEquilibriumStable,
		enrichmentMargin,
		regime
	};
}

export function rk4Step(
	prey: number,
	predator: number,
	dt: number,
	params: LoomParameters
): { nextPrey: number; nextPredator: number; valid: boolean; error: string | null } {
	if (!Number.isFinite(prey) || !Number.isFinite(predator) || prey <= 0 || predator <= 0) {
		return {
			nextPrey: prey,
			nextPredator: predator,
			valid: false,
			error: 'Initial step state is non-finite or non-positive.'
		};
	}

	const k1 = evaluateDerivatives(prey, predator, params);

	const n2 = prey + 0.5 * dt * k1.dPreyDt;
	const p2 = predator + 0.5 * dt * k1.dPredatorDt;
	if (!Number.isFinite(n2) || !Number.isFinite(p2) || n2 <= 0 || p2 <= 0) {
		return {
			nextPrey: n2,
			nextPredator: p2,
			valid: false,
			error: 'RK4 stage 2 encountered non-positive or non-finite population density.'
		};
	}
	const k2 = evaluateDerivatives(n2, p2, params);

	const n3 = prey + 0.5 * dt * k2.dPreyDt;
	const p3 = predator + 0.5 * dt * k2.dPredatorDt;
	if (!Number.isFinite(n3) || !Number.isFinite(p3) || n3 <= 0 || p3 <= 0) {
		return {
			nextPrey: n3,
			nextPredator: p3,
			valid: false,
			error: 'RK4 stage 3 encountered non-positive or non-finite population density.'
		};
	}
	const k3 = evaluateDerivatives(n3, p3, params);

	const n4 = prey + dt * k3.dPreyDt;
	const p4 = predator + dt * k3.dPredatorDt;
	if (!Number.isFinite(n4) || !Number.isFinite(p4) || n4 <= 0 || p4 <= 0) {
		return {
			nextPrey: n4,
			nextPredator: p4,
			valid: false,
			error: 'RK4 stage 4 encountered non-positive or non-finite population density.'
		};
	}
	const k4 = evaluateDerivatives(n4, p4, params);

	const nextPrey = prey + (dt / 6) * (k1.dPreyDt + 2 * k2.dPreyDt + 2 * k3.dPreyDt + k4.dPreyDt);
	const nextPredator =
		predator +
		(dt / 6) * (k1.dPredatorDt + 2 * k2.dPredatorDt + 2 * k3.dPredatorDt + k4.dPredatorDt);

	if (
		!Number.isFinite(nextPrey) ||
		!Number.isFinite(nextPredator) ||
		nextPrey <= 0 ||
		nextPredator <= 0
	) {
		return {
			nextPrey,
			nextPredator,
			valid: false,
			error: 'RK4 output step produced non-positive or non-finite population density.'
		};
	}

	return { nextPrey, nextPredator, valid: true, error: null };
}

function integrateInterval(
	startTime: number,
	endTime: number,
	startPrey: number,
	startPredator: number,
	params: LoomParameters,
	baseDt: number,
	segmentIndex: number
): {
	samples: TrajectorySample[];
	endPrey: number;
	endPredator: number;
	valid: boolean;
	error: string | null;
} {
	const samples: TrajectorySample[] = [];
	let t = startTime;
	let n = startPrey;
	let p = startPredator;

	const pushSample = (timeVal: number, preyVal: number, predVal: number) => {
		const deriv = evaluateDerivatives(preyVal, predVal, params);
		samples.push({
			time: Number(timeVal.toFixed(6)),
			prey: preyVal,
			predator: predVal,
			dPreyDt: deriv.dPreyDt,
			dPredatorDt: deriv.dPredatorDt,
			activeK: params.K,
			activeA: params.a,
			segmentIndex
		});
	};

	pushSample(t, n, p);

	const span = endTime - startTime;
	if (span <= 1e-9) {
		return { samples, endPrey: n, endPredator: p, valid: true, error: null };
	}

	const steps = Math.max(1, Math.ceil(span / baseDt - 1e-9));
	const stepDt = span / steps;

	for (let i = 1; i <= steps; i++) {
		const nextTime = i === steps ? endTime : startTime + i * stepDt;
		const actualDt = nextTime - t;
		const res = rk4Step(n, p, actualDt, params);
		if (!res.valid) {
			return {
				samples,
				endPrey: res.nextPrey,
				endPredator: res.nextPredator,
				valid: false,
				error: res.error
			};
		}
		t = nextTime;
		n = res.nextPrey;
		p = res.nextPredator;
		pushSample(t, n, p);
	}

	return { samples, endPrey: n, endPredator: p, valid: true, error: null };
}

export function detectLocalMaxima(
	samples: TrajectorySample[],
	accessor: (s: TrajectorySample) => number,
	minProminence = 0.002
): PeakExtremum[] {
	const peaks: PeakExtremum[] = [];
	if (samples.length < 3) return peaks;

	let minSinceLastPeak = accessor(samples[0]);

	for (let i = 1; i < samples.length - 1; i++) {
		const prev = samples[i - 1];
		const curr = samples[i];
		const next = samples[i + 1];

		if (curr.segmentIndex !== prev.segmentIndex || curr.segmentIndex !== next.segmentIndex) {
			minSinceLastPeak = accessor(curr);
			continue;
		}

		const vPrev = accessor(prev);
		const vCurr = accessor(curr);
		const vNext = accessor(next);

		if (vCurr < minSinceLastPeak) {
			minSinceLastPeak = vCurr;
		}

		if (vCurr > vPrev && vCurr >= vNext) {
			// Check prominence relative to surrounding window (up to 30 time units = 1500 steps)
			let leftMin = vCurr;
			for (let j = i - 1; j >= Math.max(0, i - 1500); j--) {
				if (samples[j].segmentIndex !== curr.segmentIndex) break;
				const vj = accessor(samples[j]);
				if (vj < leftMin) leftMin = vj;
				if (vj > vCurr) break;
			}
			let rightMin = vCurr;
			for (let j = i + 1; j <= Math.min(samples.length - 1, i + 1500); j++) {
				if (samples[j].segmentIndex !== curr.segmentIndex) break;
				const vj = accessor(samples[j]);
				if (vj < rightMin) rightMin = vj;
				if (vj > vCurr) break;
			}
			const prominence = Math.min(vCurr - leftMin, vCurr - rightMin);
			if (
				prominence >= minProminence ||
				(i < 450 && vCurr - vPrev > 0 && vCurr - rightMin >= minProminence)
			) {
				peaks.push({
					time: curr.time,
					value: vCurr,
					prey: curr.prey,
					predator: curr.predator,
					sampleIndex: i
				});
				minSinceLastPeak = vCurr;
			}
		}
	}

	return peaks;
}

export function findMeasuredPeakLag(
	preyPeaks: PeakExtremum[],
	predatorPeaks: PeakExtremum[]
): MeasuredPeakLag | null {
	if (preyPeaks.length === 0 || predatorPeaks.length === 0) return null;

	for (const preyPeak of preyPeaks) {
		const followingPredPeak = predatorPeaks.find(
			(pp) => pp.time > preyPeak.time + 0.4 && pp.time - preyPeak.time <= 18
		);
		if (followingPredPeak) {
			const lagTime = Number((followingPredPeak.time - preyPeak.time).toFixed(2));
			return {
				preyPeak,
				predatorPeak: followingPredPeak,
				lagTime,
				caption: 'Predators peak later.'
			};
		}
	}

	return null;
}

export function classifyTrajectoryBehaviour(
	analysis: EquilibriumAnalysis,
	samples: TrajectorySample[]
): ComparisonBehaviourClass {
	if (!analysis.isEquilibriumStable) {
		return 'persistent-cycle';
	}

	// Analytically stable: check whether the displayed run has settled or is still settling
	const n = samples.length;
	const lateStartIdx = Math.floor(n * 0.72);
	let lateMinN = Number.POSITIVE_INFINITY;
	let lateMaxN = Number.NEGATIVE_INFINITY;
	for (let i = lateStartIdx; i < n; i++) {
		const v = samples[i].prey;
		if (v < lateMinN) lateMinN = v;
		if (v > lateMaxN) lateMaxN = v;
	}
	const lateSpanN = lateMaxN - lateMinN;

	// If analytical trace is negative but late span still exceeds 0.18 (e.g. near Hopf boundary at a=0.75, K=3),
	// mark it as 'still-settling' so early transients are distinguished from persistent cycling.
	if (lateSpanN > 0.18 || Math.abs(analysis.eigenvalueReal) < 0.012) {
		return 'still-settling';
	}

	return 'settles';
}

export interface SimulatePredatorPreyOptions {
	parameters?: LoomParameters;
	initialState?: LoomInitialState;
	duration?: number;
	dt?: number;
	interventions?: InterventionSpec[];
}

export function simulatePredatorPreyLoom(
	options: SimulatePredatorPreyOptions = {}
): SimulationRunResult {
	const baseParams: LoomParameters = {
		...DEFAULT_LOOM_PARAMETERS,
		...(options.parameters ?? {})
	};
	const initialState: LoomInitialState = {
		...DEFAULT_INITIAL_STATE,
		...(options.initialState ?? {})
	};
	const duration = options.duration ?? DEFAULT_SIMULATION_DURATION;
	const dt = options.dt ?? DEFAULT_SOLVER_DT;
	const interventions = [...(options.interventions ?? [])].sort((a, b) => a.time - b.time);

	// Build knots across [0, duration]
	interface KnotAction {
		time: number;
		apply: (
			currentPrey: number,
			currentPred: number,
			currentParams: LoomParameters
		) => {
			nextPrey: number;
			nextPred: number;
			nextParams: LoomParameters;
			discontinuous: boolean;
			marker?: TimelineEventMarker;
			jump?: DiscontinuousJumpMarker;
		};
	}

	const actions: KnotAction[] = [];

	for (let idx = 0; idx < interventions.length; idx++) {
		const intv = interventions[idx];
		const tStart = Math.max(0, Math.min(duration, intv.time));

		if (intv.kind === 'food-pulse') {
			const pulseDuration = intv.duration ?? 10;
			const mult = intv.kMultiplier ?? 1.5;
			const tEnd = Math.min(duration, tStart + pulseDuration);

			actions.push({
				time: tStart,
				apply: (n, p, curParams) => {
					const previousK = curParams.K;
					const pulsedK = Number((previousK * mult).toFixed(4));
					const nextParams = { ...curParams, K: pulsedK };
					return {
						nextPrey: n,
						nextPred: p,
						nextParams,
						discontinuous: false,
						marker: {
							id: `pulse-start-${idx}`,
							time: tStart,
							endTime: tEnd,
							kind: 'food-pulse',
							label: `Food pulse starts (+50% K: ${previousK.toFixed(2)} → ${pulsedK.toFixed(2)} for ${pulseDuration} time units)`,
							shortLabel: '+50% food pulse starts',
							preyAtEvent: n,
							predatorAtEvent: p
						}
					};
				}
			});

			if (tEnd > tStart && tEnd <= duration) {
				actions.push({
					time: tEnd,
					apply: (n, p, curParams) => {
						const restoredK = Number((curParams.K / mult).toFixed(4));
						const nextParams = { ...curParams, K: restoredK };
						return {
							nextPrey: n,
							nextPred: p,
							nextParams,
							discontinuous: false,
							marker: {
								id: `pulse-end-${idx}`,
								time: tEnd,
								kind: 'pulse-end',
								label: `Food pulse ends (K restored to ${restoredK.toFixed(2)})`,
								shortLabel: 'Food pulse ends',
								preyAtEvent: n,
								predatorAtEvent: p
							}
						};
					}
				});
			}
		} else if (intv.kind === 'predator-removal') {
			const frac = intv.removalFraction ?? 0.25;
			actions.push({
				time: tStart,
				apply: (n, p, curParams) => {
					const nextPred = p * (1 - frac);
					const jump: DiscontinuousJumpMarker = {
						time: tStart,
						label: `Remove ${Math.round(frac * 100)}% of predators (${p.toFixed(2)} → ${nextPred.toFixed(2)})`,
						fromPrey: n,
						fromPredator: p,
						toPrey: n,
						toPredator: nextPred
					};
					return {
						nextPrey: n,
						nextPred,
						nextParams: { ...curParams },
						discontinuous: true,
						jump,
						marker: {
							id: `pred-remove-${idx}`,
							time: tStart,
							kind: 'predator-removal',
							label: jump.label,
							shortLabel: `−${Math.round(frac * 100)}% predators (jump)`,
							preyAtEvent: n,
							predatorAtEvent: nextPred,
							jump
						}
					};
				}
			});
		} else if (intv.kind === 'hunting-efficiency') {
			actions.push({
				time: tStart,
				apply: (n, p, curParams) => {
					const targetA = intv.targetA ?? curParams.a;
					const nextParams = { ...curParams, a: targetA };
					return {
						nextPrey: n,
						nextPred: p,
						nextParams,
						discontinuous: false,
						marker: {
							id: `hunt-${idx}`,
							time: tStart,
							kind: 'hunting-efficiency',
							label: `Hunting efficiency changed (a: ${curParams.a.toFixed(2)} → ${targetA.toFixed(2)})`,
							shortLabel: `a → ${targetA.toFixed(2)}`,
							preyAtEvent: n,
							predatorAtEvent: p
						}
					};
				}
			});
		} else if (intv.kind === 'sustained-food') {
			actions.push({
				time: tStart,
				apply: (n, p, curParams) => {
					const targetK = intv.targetK ?? curParams.K;
					const nextParams = { ...curParams, K: targetK };
					return {
						nextPrey: n,
						nextPred: p,
						nextParams,
						discontinuous: false,
						marker: {
							id: `food-${idx}`,
							time: tStart,
							kind: 'sustained-food',
							label: `Food available changed (K: ${curParams.K.toFixed(2)} → ${targetK.toFixed(2)})`,
							shortLabel: `K → ${targetK.toFixed(2)}`,
							preyAtEvent: n,
							predatorAtEvent: p
						}
					};
				}
			});
		} else if (intv.kind === 'restore-conditions') {
			actions.push({
				time: tStart,
				apply: (n, p, curParams) => {
					const targetK = intv.targetK ?? baseParams.K;
					const targetA = intv.targetA ?? baseParams.a;
					const nextParams = { ...curParams, K: targetK, a: targetA };
					return {
						nextPrey: n,
						nextPred: p,
						nextParams,
						discontinuous: false,
						marker: {
							id: `restore-${idx}`,
							time: tStart,
							kind: 'restore-conditions',
							label: `Restored earlier conditions (K = ${targetK.toFixed(2)}, a = ${targetA.toFixed(2)}) while retaining current populations`,
							shortLabel: `Restored K=${targetK.toFixed(2)}, a=${targetA.toFixed(2)}`,
							preyAtEvent: n,
							predatorAtEvent: p
						}
					};
				}
			});
		}
	}

	actions.sort((a, b) => a.time - b.time);

	const allSamples: TrajectorySample[] = [];
	const segments: TrajectorySample[][] = [[]];
	const eventMarkers: TimelineEventMarker[] = [];
	const jumpMarkers: DiscontinuousJumpMarker[] = [];

	let curTime = 0;
	let curPrey = initialState.N0;
	let curPred = initialState.P0;
	let curParams = { ...baseParams };
	let curSegmentIdx = 0;
	let numericalValid = true;
	let numericalError: string | null = null;

	// State immediately before the first primary intervention for "Without this change" comparison
	let baselineStateAtFirstIntervention: {
		time: number;
		prey: number;
		predator: number;
		params: LoomParameters;
	} | null = null;

	for (const action of actions) {
		if (action.time > curTime + 1e-9) {
			const segRes = integrateInterval(
				curTime,
				action.time,
				curPrey,
				curPred,
				curParams,
				dt,
				curSegmentIdx
			);
			if (!segRes.valid) {
				numericalValid = false;
				numericalError = segRes.error;
			}
			const chunk = segments[curSegmentIdx].length > 0 ? segRes.samples.slice(1) : segRes.samples;
			segments[curSegmentIdx].push(...chunk);
			allSamples.push(...chunk);
			curTime = action.time;
			curPrey = segRes.endPrey;
			curPred = segRes.endPredator;
		}

		if (!baselineStateAtFirstIntervention) {
			baselineStateAtFirstIntervention = {
				time: curTime,
				prey: curPrey,
				predator: curPred,
				params: { ...curParams }
			};
		}

		const applied = action.apply(curPrey, curPred, curParams);
		curPrey = applied.nextPrey;
		curPred = applied.nextPred;
		curParams = applied.nextParams;

		if (applied.marker) {
			eventMarkers.push(applied.marker);
		}
		if (applied.jump) {
			jumpMarkers.push(applied.jump);
		}
		if (applied.discontinuous) {
			curSegmentIdx += 1;
			segments.push([]);
		}
	}

	if (curTime < duration - 1e-9 || allSamples.length === 0) {
		const finalRes = integrateInterval(
			curTime,
			duration,
			curPrey,
			curPred,
			curParams,
			dt,
			curSegmentIdx
		);
		if (!finalRes.valid) {
			numericalValid = false;
			numericalError = finalRes.error;
		}
		const chunk = segments[curSegmentIdx].length > 0 ? finalRes.samples.slice(1) : finalRes.samples;
		segments[curSegmentIdx].push(...chunk);
		allSamples.push(...chunk);
	}

	// Calculate faint "Without this change" comparison from state & time immediately before the intervention
	let baselineComparisonSamples: TrajectorySample[] | null = null;
	let baselineStartTime: number | null = null;

	if (baselineStateAtFirstIntervention && baselineStateAtFirstIntervention.time < duration - 1e-6) {
		baselineStartTime = baselineStateAtFirstIntervention.time;
		const baseRes = integrateInterval(
			baselineStateAtFirstIntervention.time,
			duration,
			baselineStateAtFirstIntervention.prey,
			baselineStateAtFirstIntervention.predator,
			baselineStateAtFirstIntervention.params,
			dt,
			0
		);
		baselineComparisonSamples = baseRes.samples;
	}

	const preyPeaks = detectLocalMaxima(allSamples, (s) => s.prey);
	const predatorPeaks = detectLocalMaxima(allSamples, (s) => s.predator);
	const measuredLag = findMeasuredPeakLag(preyPeaks, predatorPeaks);

	let minPrey = Number.POSITIVE_INFINITY;
	let maxPrey = Number.NEGATIVE_INFINITY;
	let minPredator = Number.POSITIVE_INFINITY;
	let maxPredator = Number.NEGATIVE_INFINITY;

	const halfIdx = Math.floor(allSamples.length * 0.5);
	let lateMinPrey = Number.POSITIVE_INFINITY;
	let lateMaxPrey = Number.NEGATIVE_INFINITY;
	let lateMinPredator = Number.POSITIVE_INFINITY;
	let lateMaxPredator = Number.NEGATIVE_INFINITY;

	for (let i = 0; i < allSamples.length; i++) {
		const s = allSamples[i];
		if (s.prey < minPrey) minPrey = s.prey;
		if (s.prey > maxPrey) maxPrey = s.prey;
		if (s.predator < minPredator) minPredator = s.predator;
		if (s.predator > maxPredator) maxPredator = s.predator;

		if (i >= halfIdx) {
			if (s.prey < lateMinPrey) lateMinPrey = s.prey;
			if (s.prey > lateMaxPrey) lateMaxPrey = s.prey;
			if (s.predator < lateMinPredator) lateMinPredator = s.predator;
			if (s.predator > lateMaxPredator) lateMaxPredator = s.predator;
		}
	}

	const finalAnalysis = analyzeEquilibrium(curParams);
	const behaviourClass = classifyTrajectoryBehaviour(finalAnalysis, allSamples);

	let computedHeadline: string;
	let computedDetail: string;

	if (behaviourClass === 'settles') {
		computedHeadline = 'These swings are shrinking towards steady populations.';
		computedDetail = `With food available K = ${curParams.K.toFixed(2)} below the critical threshold K_crit = ${finalAnalysis.kCritical.toFixed(2)}, oscillations damp towards steady coexistence at N* = ${finalAnalysis.equilibriumPrey.toFixed(2)}, P* = ${finalAnalysis.equilibriumPredator.toFixed(2)}.`;
	} else if (behaviourClass === 'still-settling') {
		computedHeadline = 'These swings are shrinking towards steady populations.';
		computedDetail = `Because K = ${curParams.K.toFixed(2)} lies just below the stability boundary K_crit = ${finalAnalysis.kCritical.toFixed(2)}, the equilibrium is analytically stable, though convergence is slow so the displayed window is still settling.`;
	} else if (lateMinPrey < 0.06 || curParams.K >= 3.6) {
		computedHeadline = 'The prey population now falls much lower between peaks.';
		computedDetail = `The populations are approaching a repeating cycle with larger swings: prey peaks reach ${lateMaxPrey.toFixed(2)} and troughs drop to ${lateMinPrey.toFixed(2)} illustrative density units.`;
	} else {
		computedHeadline = 'The populations are approaching a repeating cycle.';
		computedDetail = `With K = ${curParams.K.toFixed(2)} above K_crit = ${finalAnalysis.kCritical.toFixed(2)}, the coexistence point is unstable and trajectories approach a stable repeating loop (N between ${lateMinPrey.toFixed(2)} and ${lateMaxPrey.toFixed(2)}).`;
	}

	const recoverySentence =
		'Returning to an earlier cycle means approaching the same orbit, possibly at a different point in its timing.';

	return {
		parameters: curParams,
		initialState,
		duration,
		dt,
		samples: allSamples,
		segments: segments.filter((seg) => seg.length > 0),
		baselineComparisonSamples,
		baselineStartTime,
		eventMarkers,
		jumpMarkers,
		preyPeaks,
		predatorPeaks,
		measuredLag,
		minPrey,
		maxPrey,
		minPredator,
		maxPredator,
		lateMinPrey,
		lateMaxPrey,
		lateMinPredator,
		lateMaxPredator,
		analysis: finalAnalysis,
		behaviourClass,
		computedHeadline,
		computedDetail,
		recoverySentence,
		numericalValid,
		numericalError
	};
}

export function sampleTrajectoryAtTime(
	samples: TrajectorySample[],
	targetTime: number
): TrajectorySample {
	if (samples.length === 0) {
		throw new Error('Cannot sample an empty trajectory.');
	}
	if (targetTime <= samples[0].time) return samples[0];
	if (targetTime >= samples[samples.length - 1].time) return samples[samples.length - 1];

	let lo = 0;
	let hi = samples.length - 1;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].time <= targetTime) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const s0 = samples[lo];
	const s1 = samples[hi];
	if (s0.segmentIndex !== s1.segmentIndex || Math.abs(s1.time - s0.time) < 1e-9) {
		return s1;
	}

	const alpha = (targetTime - s0.time) / (s1.time - s0.time);
	return {
		time: targetTime,
		prey: s0.prey + alpha * (s1.prey - s0.prey),
		predator: s0.predator + alpha * (s1.predator - s0.predator),
		dPreyDt: s0.dPreyDt + alpha * (s1.dPreyDt - s0.dPreyDt),
		dPredatorDt: s0.dPredatorDt + alpha * (s1.dPredatorDt - s0.dPredatorDt),
		activeK: s0.activeK,
		activeA: s0.activeA,
		segmentIndex: s0.segmentIndex
	};
}

export function computeComparisonGrid(
	duration = DEFAULT_COMPARISON_DURATION
): ComparisonCellResult[][] {
	const rows: ComparisonCellResult[][] = [];

	for (let rIdx = 0; rIdx < COMPARISON_A_VALUES.length; rIdx++) {
		const a = COMPARISON_A_VALUES[rIdx];
		const row: ComparisonCellResult[] = [];

		for (let cIdx = 0; cIdx < COMPARISON_K_VALUES.length; cIdx++) {
			const K = COMPARISON_K_VALUES[cIdx];
			const run = simulatePredatorPreyLoom({
				parameters: {
					...DEFAULT_LOOM_PARAMETERS,
					a,
					K
				},
				initialState: DEFAULT_INITIAL_STATE,
				duration
			});

			let badgeLabel: string;
			let stabilityNote: string;

			if (run.behaviourClass === 'settles') {
				badgeLabel = 'Settles to steady point';
				stabilityNote = `Stable equilibrium (K = ${K} < K_crit = ${run.analysis.kCritical.toFixed(2)}). Converges to N* = ${run.analysis.equilibriumPrey.toFixed(2)}, P* = ${run.analysis.equilibriumPredator.toFixed(2)}.`;
			} else if (run.behaviourClass === 'still-settling') {
				badgeLabel = 'Settles slowly (still settling)';
				stabilityNote = `Analytically stable (K = ${K} < K_crit = ${run.analysis.kCritical.toFixed(2)}), near stability boundary; oscillations are still settling at t = ${duration}.`;
			} else {
				badgeLabel = 'Keeps cycling (limit cycle)';
				stabilityNote = `Unstable equilibrium (K = ${K} > K_crit = ${run.analysis.kCritical.toFixed(2)}). Approaches repeating cycle (prey trough ${run.lateMinPrey.toFixed(2)}).`;
			}

			row.push({
				rowIndex: rIdx,
				colIndex: cIdx,
				a,
				K,
				run,
				behaviourClass: run.behaviourClass,
				badgeLabel,
				stabilityNote
			});
		}

		rows.push(row);
	}

	return rows;
}
