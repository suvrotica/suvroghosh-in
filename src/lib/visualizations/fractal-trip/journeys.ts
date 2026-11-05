import {
	FAMILIES,
	MAX_SPAN,
	SCENES_3D,
	anglesFromDirection,
	cameraBasis,
	checkCameraClearance,
	estimateDistance3D,
	iterate2D,
	minimumSpan,
	normalizeState,
	pointAt,
	scenePreset,
	sceneToState,
	type FractalState,
	type Scene3DId,
	type Vec3,
	type Waypoint3D
} from './model';

export const JOURNEY_DURATION_SECONDS = 96;
const SAMPLE_ITERATIONS = 180;
const SEARCH_SIDE = 7;
const ARC_TABLE_STEPS = 128;

type JourneyView = Pick<
	FractalState,
	| 'centerRe'
	| 'centerIm'
	| 'span'
	| 'rotation'
	| 'yaw'
	| 'pitch'
	| 'roll'
	| 'fov'
	| 'distance'
	| 'cameraPos'
>;

export interface JourneyDetail {
	distinctOutcomes: number;
	iterationSpread: number;
	unresolvedFraction: number;
	interesting: boolean;
}

export interface JourneyPlan {
	family: FractalState['family'];
	sceneId: Scene3DId | null;
	kind: '2d' | '3d';
	duration: number;
	start: JourneyView;
	focus: JourneyView;
	overview: JourneyView | null;
	detail: JourneyDetail | null;
	waypoints: readonly Waypoint3D[];
	arcLengths: readonly number[];
	totalLength: number;
	minClearance: number;
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
		roll: state.roll,
		fov: state.fov,
		distance: state.distance,
		cameraPos: [...state.cameraPos]
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

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, f: number): number {
	const f2 = f * f;
	const f3 = f2 * f;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * f +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * f3)
	);
}

/** Evaluate a closed Catmull-Rom spline of 3D camera waypoints at u in [0, 1). */
export function sampleSpline3D(
	waypoints: readonly Waypoint3D[],
	u: number
): {
	position: [number, number, number];
	target: [number, number, number];
	roll: number;
	fov: number;
} {
	const n = waypoints.length;
	if (n === 0) {
		return { position: [0, 0, 3], target: [0, 0, 0], roll: 0, fov: 54 };
	}
	if (n === 1) {
		const wp = waypoints[0];
		return {
			position: [wp.position[0], wp.position[1], wp.position[2]],
			target: [wp.target[0], wp.target[1], wp.target[2]],
			roll: wp.roll ?? 0,
			fov: wp.fov ?? 54
		};
	}
	const wrapped = ((u % 1) + 1) % 1;
	const scaled = wrapped * n;
	const idx = Math.floor(scaled) % n;
	const frac = scaled - Math.floor(scaled);
	const w0 = waypoints[(idx - 1 + n) % n];
	const w1 = waypoints[idx];
	const w2 = waypoints[(idx + 1) % n];
	const w3 = waypoints[(idx + 2) % n];

	const position: [number, number, number] = [
		catmullRomScalar(w0.position[0], w1.position[0], w2.position[0], w3.position[0], frac),
		catmullRomScalar(w0.position[1], w1.position[1], w2.position[1], w3.position[1], frac),
		catmullRomScalar(w0.position[2], w1.position[2], w2.position[2], w3.position[2], frac)
	];
	const target: [number, number, number] = [
		catmullRomScalar(w0.target[0], w1.target[0], w2.target[0], w3.target[0], frac),
		catmullRomScalar(w0.target[1], w1.target[1], w2.target[1], w3.target[1], frac),
		catmullRomScalar(w0.target[2], w1.target[2], w2.target[2], w3.target[2], frac)
	];
	const roll = catmullRomScalar(w0.roll ?? 0, w1.roll ?? 0, w2.roll ?? 0, w3.roll ?? 0, frac);
	const fov = catmullRomScalar(w0.fov ?? 54, w1.fov ?? 54, w2.fov ?? 54, w3.fov ?? 54, frac);
	return { position, target, roll, fov };
}

function buildArcLengthTable(waypoints: readonly Waypoint3D[]): {
	arcLengths: number[];
	totalLength: number;
} {
	const arcLengths: number[] = [0];
	let total = 0;
	let prev = sampleSpline3D(waypoints, 0).position;
	for (let i = 1; i <= ARC_TABLE_STEPS; i++) {
		const curr = sampleSpline3D(waypoints, i / ARC_TABLE_STEPS).position;
		total += Math.hypot(curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]);
		arcLengths.push(total);
		prev = curr;
	}
	return { arcLengths, totalLength: Math.max(total, 1e-5) };
}

function parameterForArcPhase(
	arcLengths: readonly number[],
	totalLength: number,
	phase: number
): number {
	const clamped = ((phase % 1) + 1) % 1;
	if (clamped <= 0 || arcLengths.length < 2) return 0;
	const targetDist = clamped * totalLength;
	let low = 0;
	let high = arcLengths.length - 1;
	while (low < high - 1) {
		const mid = (low + high) >> 1;
		if (arcLengths[mid] <= targetDist) low = mid;
		else high = mid;
	}
	const segmentStart = arcLengths[low];
	const segmentLength = Math.max(arcLengths[high] - segmentStart, 1e-8);
	const segmentFrac = (targetDist - segmentStart) / segmentLength;
	return (low + segmentFrac) / (arcLengths.length - 1);
}

function ensureSafeWaypoint(state: FractalState, wp: Waypoint3D, minClearance: number): Waypoint3D {
	let pos: [number, number, number] = [wp.position[0], wp.position[1], wp.position[2]];
	for (let attempt = 0; attempt < 8; attempt++) {
		const check = estimateDistance3D(state, pos);
		if (check.escaped && check.distance >= minClearance) break;
		const r = Math.hypot(pos[0], pos[1], pos[2]) || 1;
		const push = Math.max(0.06, minClearance - check.distance + 0.04);
		pos = [
			pos[0] + (pos[0] / r) * push,
			pos[1] + (pos[1] / r) * push,
			pos[2] + (pos[2] / r) * push
		];
	}
	return {
		position: pos,
		target: wp.target,
		roll: wp.roll ?? 0,
		fov: wp.fov ?? state.fov
	};
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
		const fallbackSceneId: Scene3DId =
			state.sceneId && scenePreset(state.sceneId).family === state.family
				? state.sceneId
				: state.family === 'mandelbox'
					? 'folded-cathedral'
					: state.bulbJulia
						? 'alien-garden'
						: 'copper-reef';
		const preset = scenePreset(fallbackSceneId);
		const basis = cameraBasis(state);
		const startWaypoint: Waypoint3D = {
			position: [...basis.position],
			target: [
				basis.position[0] + basis.forward[0],
				basis.position[1] + basis.forward[1],
				basis.position[2] + basis.forward[2]
			],
			roll: state.roll,
			fov: state.fov
		};

		const minClearance = preset.qualityLimits.minClearance;
		const baseWaypoints = preset.path.map((wp, idx) =>
			idx === 0 ? startWaypoint : ensureSafeWaypoint(state, wp, minClearance)
		);
		const { arcLengths, totalLength } = buildArcLengthTable(baseWaypoints);
		const midPose = sampleSpline3D(baseWaypoints, 0.5);
		const midAngles = anglesFromDirection([
			midPose.target[0] - midPose.position[0],
			midPose.target[1] - midPose.position[1],
			midPose.target[2] - midPose.position[2]
		]);

		let actualMinClearance = Infinity;
		for (let i = 0; i < 16; i++) {
			const samplePose = sampleSpline3D(baseWaypoints, i / 16);
			const d = estimateDistance3D(state, samplePose.position).distance;
			actualMinClearance = Math.min(actualMinClearance, d);
		}

		return {
			family: state.family,
			sceneId: state.sceneId ?? fallbackSceneId,
			kind,
			duration: preset.duration,
			start,
			focus: {
				...start,
				yaw: midAngles.yaw,
				pitch: midAngles.pitch,
				roll: midPose.roll,
				fov: midPose.fov,
				cameraPos: midPose.position
			},
			overview: null,
			detail: null,
			waypoints: baseWaypoints,
			arcLengths,
			totalLength,
			minClearance: Number.isFinite(actualMinClearance) ? actualMinClearance : minClearance,
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
		sceneId: null,
		kind,
		duration: JOURNEY_DURATION_SECONDS,
		start,
		focus: view(result.state),
		overview,
		detail: result.detail,
		waypoints: [],
		arcLengths: [],
		totalLength: 0,
		minClearance: 0,
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
		roll: mix(start.roll, end.roll, amount),
		fov: mix(start.fov, end.fov, amount),
		distance: Math.exp(mix(Math.log(start.distance), Math.log(end.distance), amount)),
		cameraPos: [
			mix(start.cameraPos[0], end.cameraPos[0], amount),
			mix(start.cameraPos[1], end.cameraPos[1], amount),
			mix(start.cameraPos[2], end.cameraPos[2], amount)
		]
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

	if (plan.kind === '3d' && plan.waypoints.length >= 2) {
		if (phase === 0) {
			return normalizeState({ ...current, ...plan.start });
		}
		const u = parameterForArcPhase(plan.arcLengths, plan.totalLength, phase);
		const sampled = sampleSpline3D(plan.waypoints, u);
		const dir: Vec3 = [
			sampled.target[0] - sampled.position[0],
			sampled.target[1] - sampled.position[1],
			sampled.target[2] - sampled.position[2]
		];
		const { yaw, pitch } = anglesFromDirection(dir);
		return normalizeState({
			...current,
			yaw,
			pitch,
			roll: sampled.roll,
			fov: sampled.fov,
			cameraPos: sampled.position,
			cameraMode: 'free'
		});
	}

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

/** Advance to the next or previous curated 3D scene in continuous tour mode. */
export function nextTourSceneId(currentId: Scene3DId | null, step: 1 | -1 = 1): Scene3DId {
	const index = SCENES_3D.findIndex((scene) => scene.id === currentId);
	if (index === -1) return SCENES_3D[0].id;
	return SCENES_3D[(index + step + SCENES_3D.length) % SCENES_3D.length].id;
}

/** Validate a 3D scene's entire spline path and near-plane frustum against the CPU distance estimator. */
export function validateJourney3D(
	sceneId: Scene3DId,
	samples = 64,
	aspect = 16 / 9
): {
	valid: boolean;
	minClearance: number;
	maxClearance: number;
	minHitFraction: number;
	depthSpread: number;
} {
	const state = sceneToState(sceneId);
	const plan = createJourney(state, aspect);
	let minClearance = Infinity;
	let maxClearance = 0;
	let minHitFraction = 1;
	let maxSpread = 0;
	let allClear = true;

	for (let i = 0; i < samples; i++) {
		const t = (i / samples) * plan.duration;
		const frameState = sampleJourney(plan, t, state);
		const check = checkCameraClearance(frameState, aspect);
		minClearance = Math.min(minClearance, check.minDistance);
		maxClearance = Math.max(maxClearance, check.minDistance);
		if (!check.clear) allClear = false;

		const basis = cameraBasis(frameState);
		const hits: number[] = [];
		for (let gy = -1; gy <= 1; gy++) {
			for (let gx = -1; gx <= 1; gx++) {
				const sx = gx * 0.55 * aspect;
				const sy = gy * 0.55;
				const dx = basis.forward[0] * basis.fovScale + basis.right[0] * sx + basis.up[0] * sy;
				const dy = basis.forward[1] * basis.fovScale + basis.right[1] * sx + basis.up[1] * sy;
				const dz = basis.forward[2] * basis.fovScale + basis.right[2] * sx + basis.up[2] * sy;
				const dLen = Math.hypot(dx, dy, dz) || 1;
				const dir: Vec3 = [dx / dLen, dy / dLen, dz / dLen];
				let travel = 0;
				for (let s = 0; s < 84; s++) {
					const pt: Vec3 = [
						basis.position[0] + dir[0] * travel,
						basis.position[1] + dir[1] * travel,
						basis.position[2] + dir[2] * travel
					];
					const de = estimateDistance3D(frameState, pt, 14).distance;
					const eps = Math.max(0.00025, (travel * 1.0) / 720);
					if (de < eps) {
						hits.push(travel);
						break;
					}
					travel += Math.max(de * 0.68, eps * 0.35);
					if (travel > 16) break;
				}
			}
		}
		minHitFraction = Math.min(minHitFraction, hits.length / 9);
		if (hits.length >= 2) {
			maxSpread = Math.max(maxSpread, Math.max(...hits) - Math.min(...hits));
		}
	}

	return {
		valid: allClear && minClearance >= 0.035 && minHitFraction >= 0.5 && maxSpread >= 0.4,
		minClearance,
		maxClearance,
		minHitFraction,
		depthSpread: maxSpread
	};
}
