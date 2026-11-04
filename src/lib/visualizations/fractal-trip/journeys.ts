import {
	FAMILIES,
	MAX_SPAN,
	iterate2D,
	minimumSpan,
	normalizeState,
	pointAt,
	type FractalState
} from './model';

export const JOURNEY_DURATION_SECONDS = 96;
const SAMPLE_ITERATIONS = 180;
const SEARCH_SIDE = 7;

type JourneyView = Pick<
	FractalState,
	'centerRe' | 'centerIm' | 'span' | 'rotation' | 'yaw' | 'pitch' | 'distance'
>;
export interface JourneyDetail {
	distinctOutcomes: number;
	iterationSpread: number;
	unresolvedFraction: number;
	interesting: boolean;
}
export interface JourneyPlan {
	family: FractalState['family'];
	kind: '2d' | '3d';
	duration: number;
	start: JourneyView;
	focus: JourneyView;
	overview: JourneyView | null;
	detail: JourneyDetail | null;
	/** A deterministic work receipt, never an unbounded search. */
	samples: number;
}

type Probe = { outcome: number; iterations: number; unresolved: boolean };
function probe(state: FractalState, x: number, y: number, aspect: number): Probe {
	const result = iterate2D(state, pointAt(state, x, y, aspect), SAMPLE_ITERATIONS);
	return {
		outcome: result.converged ? 2 + (result.rootIndex ?? 0) : result.escaped ? 1 : 0,
		iterations: result.iterations,
		unresolved: !result.escaped && !result.converged
	};
}

function describe(probes: readonly Probe[]): JourneyDetail {
	const outcomes = new Set(probes.map(({ outcome }) => outcome));
	const minimum = Math.min(...probes.map(({ iterations }) => iterations));
	const maximum = Math.max(...probes.map(({ iterations }) => iterations));
	return {
		distinctOutcomes: outcomes.size,
		iterationSpread: maximum - minimum,
		unresolvedFraction: probes.filter(({ unresolved }) => unresolved).length / probes.length,
		interesting:
			outcomes.size > 1 || (probes.some(({ outcome }) => outcome !== 0) && maximum - minimum >= 5)
	};
}

/** Finite orbit variation is evidence of an interesting frame, not proof of membership. */
export function inspectJourneyView(state: FractalState, aspect = 1): JourneyDetail {
	const probes: Probe[] = [];
	for (let y = 0; y < 5; y++) {
		for (let x = 0; x < 5; x++) probes.push(probe(state, (x + 0.5) / 5, (y + 0.5) / 5, aspect));
	}
	return describe(probes);
}

function view(state: FractalState): JourneyView {
	return {
		centerRe: state.centerRe,
		centerIm: state.centerIm,
		span: state.span,
		rotation: state.rotation,
		yaw: state.yaw,
		pitch: state.pitch,
		distance: state.distance
	};
}

function wholeView(state: FractalState): FractalState {
	if (state.family === 'newton') {
		const centerRe = state.roots.reduce((sum, root) => sum + root.re, 0) / state.roots.length;
		const centerIm = state.roots.reduce((sum, root) => sum + root.im, 0) / state.roots.length;
		const radius = Math.max(
			...state.roots.map((root) => Math.hypot(root.re - centerRe, root.im - centerIm))
		);
		return normalizeState({
			...state,
			centerRe,
			centerIm,
			span: Math.max(2, radius * 3.5),
			rotation: 0
		});
	}
	return normalizeState({
		...state,
		centerRe:
			state.family === 'burning-ship'
				? -0.45
				: state.family === 'mandelbrot' && state.power === 2
					? -0.5
					: 0,
		centerIm: state.family === 'burning-ship' ? -0.5 : 0,
		span: 3.6,
		rotation: 0
	});
}

function locateFocus(
	state: FractalState,
	aspect: number
): { state: FractalState; detail: JourneyDetail; samples: number } {
	const grid: Probe[] = [];
	let samples = 0;
	for (let y = 0; y < SEARCH_SIDE; y++) {
		for (let x = 0; x < SEARCH_SIDE; x++) {
			grid.push(probe(state, x / (SEARCH_SIDE - 1), y / (SEARCH_SIDE - 1), aspect));
			samples++;
		}
	}
	const candidates: { x: number; y: number; score: number }[] = [];
	for (let y = 0; y < SEARCH_SIDE - 1; y++) {
		for (let x = 0; x < SEARCH_SIDE - 1; x++) {
			const corners = [
				grid[y * SEARCH_SIDE + x],
				grid[y * SEARCH_SIDE + x + 1],
				grid[(y + 1) * SEARCH_SIDE + x],
				grid[(y + 1) * SEARCH_SIDE + x + 1]
			];
			const detail = describe(corners);
			// Prefer a real change of escape/basin status, with a small centre tie-break.
			const score =
				(detail.distinctOutcomes - 1) * 200 +
				detail.iterationSpread -
				Math.hypot(x - 2.5, y - 2.5) * 0.5;
			candidates.push({
				x: (x + 0.5) / (SEARCH_SIDE - 1),
				y: (y + 0.5) / (SEARCH_SIDE - 1),
				score
			});
		}
	}
	candidates.sort((a, b) => b.score - a.score);
	let selected = state;
	let detail = inspectJourneyView(state, aspect);
	samples += 25;
	for (const candidate of candidates.slice(0, 3)) {
		const centre = pointAt(state, candidate.x, candidate.y, aspect);
		let test = normalizeState({
			...state,
			centerRe: centre.re,
			centerIm: centre.im,
			span: Math.max(state.span * 0.26, minimumSpan(state, 1080) * 1.6)
		});
		let testDetail = inspectJourneyView(test, aspect);
		samples += 25;
		if (!testDetail.interesting) continue;
		selected = test;
		detail = testDetail;
		// At most two extra steps. Keep the last independently sampled, varied view.
		for (let depth = 0; depth < 2; depth++) {
			test = normalizeState({
				...test,
				span: Math.max(test.span * 0.5, minimumSpan(test, 1080) * 1.6)
			});
			testDetail = inspectJourneyView(test, aspect);
			samples += 25;
			if (!testDetail.interesting) break;
			selected = test;
			detail = testDetail;
		}
		break;
	}
	return { state: selected, detail, samples };
}

/**
 * Plan once when playback begins or equation settings change. Search is bounded
 * to at most 398 CPU probes; animation itself performs no orbit search.
 */
export function createJourney(input: FractalState, aspect: number): JourneyPlan {
	const state = normalizeState(input);
	const ratio = Number.isFinite(aspect) ? Math.max(0.25, Math.min(4, aspect)) : 1;
	const kind = FAMILIES.find(({ id }) => id === state.family)?.kind ?? '2d';
	const start = view(state);
	if (kind === '3d') {
		const safeDistance = state.family === 'mandelbox' ? 4.6 : 3.1;
		return {
			family: state.family,
			kind,
			duration: JOURNEY_DURATION_SECONDS,
			start,
			focus: {
				...start,
				yaw: start.yaw + 1.3,
				pitch: Math.max(-0.65, Math.min(0.65, start.pitch + 0.22)),
				distance: Math.max(safeDistance, start.distance * 0.86)
			},
			overview: null,
			detail: null,
			samples: 0
		};
	}
	let result = locateFocus(state, ratio);
	let samples = result.samples;
	let overview: JourneyView | null = null;
	if (!result.detail.interesting) {
		const whole = wholeView(state);
		result = locateFocus(whole, ratio);
		samples += result.samples;
		// A broad stop allows a blank or extreme user view to travel gently to detail.
		overview = view(
			normalizeState({
				...whole,
				centerRe: (state.centerRe + result.state.centerRe) / 2,
				centerIm: (state.centerIm + result.state.centerIm) / 2,
				span: Math.min(
					MAX_SPAN,
					Math.max(
						whole.span,
						state.span,
						(Math.abs(state.centerRe - result.state.centerRe) * 1.5) / ratio,
						Math.abs(state.centerIm - result.state.centerIm) * 1.5
					)
				)
			})
		);
	}
	return {
		family: state.family,
		kind,
		duration: JOURNEY_DURATION_SECONDS,
		start,
		focus: view(result.state),
		overview,
		detail: result.detail,
		samples
	};
}

function mix(a: number, b: number, amount: number): number {
	return a + (b - a) * amount;
}

function between(start: JourneyView, end: JourneyView, progress: number): JourneyView {
	const amount = (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, progress)))) / 2;
	return {
		centerRe: mix(start.centerRe, end.centerRe, amount),
		centerIm: mix(start.centerIm, end.centerIm, amount),
		span: Math.exp(mix(Math.log(start.span), Math.log(end.span), amount)),
		rotation: mix(start.rotation, end.rotation, amount),
		yaw: mix(start.yaw, end.yaw, amount),
		pitch: mix(start.pitch, end.pitch, amount),
		distance: Math.exp(mix(Math.log(start.distance), Math.log(end.distance), amount))
	};
}

/** elapsedSeconds is the caller's speed-adjusted playback clock; pausing freezes it. */
export function sampleJourney(
	plan: JourneyPlan,
	elapsedSeconds: number,
	current: FractalState
): FractalState {
	if (current.family !== plan.family) return normalizeState(current);
	const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
	const phase = (elapsed % plan.duration) / plan.duration;
	const leg = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
	let next: JourneyView;
	if (leg === 0) next = { ...plan.start };
	else if (plan.overview) {
		next =
			leg < 0.38
				? between(plan.start, plan.overview, leg / 0.38)
				: between(plan.overview, plan.focus, (leg - 0.38) / 0.62);
	} else next = between(plan.start, plan.focus, leg);
	return normalizeState({ ...current, ...next });
}
