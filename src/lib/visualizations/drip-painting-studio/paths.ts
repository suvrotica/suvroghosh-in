import { createStreamRng, normalizeSeed } from './prng.ts';
import { STUDY_INDEX, STUDY_SPECS } from './studies.ts';
import {
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_LAYERS,
	DEFAULT_PASSES,
	DEFAULT_SWEEP,
	MAX_LAYERS,
	MAX_PASSES,
	MAX_SWEEP,
	MIN_LAYERS,
	MIN_PASSES,
	MIN_SWEEP,
	type CanonicalPass,
	type CanonicalPassTable,
	type GestureArchetype,
	type GestureWeights,
	type HubPoint,
	type PassPathPoint,
	type PigmentAffinityMap,
	type PigmentId,
	type StudyId,
	type SweptPass
} from './types.ts';

const MAX_CANONICAL_CACHE = 16;
const canonicalCache = new Map<string, CanonicalPassTable>();

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

function pickWeightedPigment(affinities: PigmentAffinityMap, roll: number): PigmentId {
	const entries = Object.entries(affinities) as [PigmentId, number][];
	let total = 0;
	for (const [, w] of entries) {
		total += w;
	}
	if (total <= 0 || entries.length === 0) return 'carbon-black';
	let acc = 0;
	const target = roll * total;
	for (const [id, w] of entries) {
		acc += w;
		if (target <= acc) return id;
	}
	return entries[entries.length - 1]![0];
}

function pickWeightedArchetype(weights: GestureWeights, roll: number): GestureArchetype {
	const entries: [GestureArchetype, number][] = [
		['orbital-loop', weights.orbital],
		['sweeping-arc', weights.arc],
		['whip-back', weights.whip],
		['veil-ribbon', weights.veil]
	];
	let total = 0;
	for (const [, w] of entries) total += Math.max(0, w);
	if (total <= 0) return 'orbital-loop';
	let acc = 0;
	const target = roll * total;
	for (const [kind, w] of entries) {
		acc += Math.max(0, w);
		if (target <= acc) return kind;
	}
	return 'orbital-loop';
}

function buildPassLayerAndPigmentSchedule(
	seed: number,
	study: StudyId
): { layers: (1 | 2 | 3 | 4 | 5 | 6)[]; pigments: PigmentId[] } {
	const studyIdx = STUDY_INDEX[study];
	const spec = STUDY_SPECS[study];
	const layersPoolRng = createStreamRng(seed, 'layers', studyIdx * 64 + 63);

	const layers: (1 | 2 | 3 | 4 | 5 | 6)[] = new Array(MAX_PASSES);

	// Passes 0..3 -> L1, L1, L2, L2 (Single Trail = 4 passes over L1..L2)
	layers[0] = 1;
	layers[1] = 1;
	layers[2] = 2;
	layers[3] = 2;

	// Passes 4..9 -> shuffled [1..6] covering all 6 strata by pass 10
	const pool4to9: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];
	for (let i = pool4to9.length - 1; i > 0; i--) {
		const j = layersPoolRng.int(0, i);
		const tmp = pool4to9[i]!;
		pool4to9[i] = pool4to9[j]!;
		pool4to9[j] = tmp;
	}
	for (let k = 0; k < 6; k++) {
		layers[4 + k] = pool4to9[k]!;
	}

	// Passes 10..17 -> shuffled [1, 2, 3, 3, 4, 4, 5, 6]
	const pool10to17: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 3, 4, 4, 5, 6];
	for (let i = pool10to17.length - 1; i > 0; i--) {
		const j = layersPoolRng.int(0, i);
		const tmp = pool10to17[i]!;
		pool10to17[i] = pool10to17[j]!;
		pool10to17[j] = tmp;
	}
	for (let k = 0; k < 8; k++) {
		layers[10 + k] = pool10to17[k]!;
	}

	// Passes 18..39 -> upper-strata weighted CDF drawn per pass
	const upperWeights: readonly [1 | 2 | 3 | 4 | 5 | 6, number][] = [
		[1, 0.05],
		[2, 0.09],
		[3, 0.16],
		[4, 0.22],
		[5, 0.24],
		[6, 0.24]
	];

	const pigments: PigmentId[] = new Array(MAX_PASSES);

	for (let p = 0; p < MAX_PASSES; p++) {
		const passLayerRng = createStreamRng(seed, 'layers', studyIdx * 64 + p);
		if (p >= 18) {
			const r = passLayerRng.next();
			let acc = 0;
			let chosen: 1 | 2 | 3 | 4 | 5 | 6 = 6;
			for (const [layerVal, weight] of upperWeights) {
				acc += weight;
				if (r <= acc) {
					chosen = layerVal;
					break;
				}
			}
			layers[p] = chosen;
		}
		const layerIdx = layers[p]!;
		pigments[p] = pickWeightedPigment(spec.layerAffinities[layerIdx], passLayerRng.next());
	}

	return { layers, pigments };
}

function evalCatmullRomCentripetal(
	p0x: number,
	p0y: number,
	p1x: number,
	p1y: number,
	p2x: number,
	p2y: number,
	p3x: number,
	p3y: number,
	tNorm: number
): { x: number; y: number } {
	const d01 = Math.max(1e-3, Math.hypot(p1x - p0x, p1y - p0y));
	const d12 = Math.max(1e-3, Math.hypot(p2x - p1x, p2y - p1y));
	const d23 = Math.max(1e-3, Math.hypot(p3x - p2x, p3y - p2y));

	const t0 = 0;
	const t1 = t0 + Math.sqrt(d01);
	const t2 = t1 + Math.sqrt(d12);
	const t3 = t2 + Math.sqrt(d23);

	const t = t1 + (t2 - t1) * tNorm;

	const lerpPt = (
		ax: number,
		ay: number,
		bx: number,
		by: number,
		ta: number,
		tb: number
	): [number, number] => {
		const denom = tb - ta;
		if (Math.abs(denom) < 1e-6) return [ax, ay];
		const w = (t - ta) / denom;
		return [ax + (bx - ax) * w, ay + (by - ay) * w];
	};

	const [a1x, a1y] = lerpPt(p0x, p0y, p1x, p1y, t0, t1);
	const [a2x, a2y] = lerpPt(p1x, p1y, p2x, p2y, t1, t2);
	const [a3x, a3y] = lerpPt(p2x, p2y, p3x, p3y, t2, t3);

	const [b1x, b1y] = lerpPt(a1x, a1y, a2x, a2y, t0, t2);
	const [b2x, b2y] = lerpPt(a2x, a2y, a3x, a3y, t1, t3);

	const [cx, cy] = lerpPt(b1x, b1y, b2x, b2y, t1, t2);
	return { x: cx, y: cy };
}

function generateControlAnchors(
	seed: number,
	study: StudyId,
	passIndex: number,
	layerIndex: 1 | 2 | 3 | 4 | 5 | 6,
	pigmentKey: PigmentId,
	archetype: GestureArchetype,
	hubs: readonly HubPoint[],
	width: number,
	height: number
): { qx: number[]; qy: number[]; rawSpeed: number[] } {
	const studyIdx = STUDY_INDEX[study];
	const spec = STUDY_SPECS[study];
	const kin = spec.kinematics;
	const rng = createStreamRng(seed, 'paths', studyIdx * 64 + passIndex);
	// Consume one roll to match archetype draw alignment
	void rng.next();

	const minDim = Math.min(width, height);
	const artScale = minDim / 800;

	const hubA = hubs[passIndex % hubs.length]!;
	const hubB = hubs[(passIndex + 1 + rng.int(0, Math.max(0, hubs.length - 1))) % hubs.length]!;

	const mEdge = 0.055 * minDim;
	const mBand = 0.095 * minDim;

	let anchorCount: number;
	if (archetype === 'orbital-loop') anchorCount = rng.int(36, 46);
	else if (archetype === 'sweeping-arc') anchorCount = rng.int(28, 36);
	else if (archetype === 'whip-back') anchorCount = rng.int(32, 42);
	else anchorCount = rng.int(30, 38);

	const qx: number[] = [];
	const qy: number[] = [];
	const rawSpeed: number[] = [];

	const dt = 1 / 11;
	const baseStep = 760 * kin.baseSpeedScale * artScale;

	let px = hubA.x + rng.range(-0.14, 0.14) * width;
	let py = hubA.y + rng.range(-0.14, 0.14) * height;
	let heading = rng.range(0, Math.PI * 2);

	if (archetype === 'sweeping-arc' || archetype === 'veil-ribbon') {
		const edgeSide = rng.int(0, 3);
		if (edgeSide === 0) {
			px = width * rng.range(0.09, 0.22);
			py = height * rng.range(0.16, 0.84);
			heading = rng.range(-0.55, 0.55);
		} else if (edgeSide === 1) {
			px = width * rng.range(0.78, 0.91);
			py = height * rng.range(0.16, 0.84);
			heading = Math.PI + rng.range(-0.55, 0.55);
		} else if (edgeSide === 2) {
			px = width * rng.range(0.16, 0.84);
			py = height * rng.range(0.09, 0.22);
			heading = Math.PI * 0.5 + rng.range(-0.55, 0.55);
		} else {
			px = width * rng.range(0.16, 0.84);
			py = height * rng.range(0.78, 0.91);
			heading = -Math.PI * 0.5 + rng.range(-0.55, 0.55);
		}
	}

	let vx = Math.cos(heading) * baseStep;
	let vy = Math.sin(heading) * baseStep;

	const swirlSign = rng.chance(0.5) ? 1 : -1;
	const kSpring = rng.range(1.4, 2.6);
	const kSwirl = rng.range(380, 580) * artScale * swirlSign;
	const w1 = rng.range(1.5, 2.9);
	const w2 = rng.range(3.1, 5.2);
	const p1 = rng.range(0, Math.PI * 2);
	const p2 = rng.range(0, Math.PI * 2);
	const amp1 = rng.range(280, 540) * artScale;
	const amp2 = rng.range(160, 340) * artScale;

	const whipTimes: number[] = [];
	const whipAngles: number[] = [];
	if (archetype === 'whip-back') {
		const count = rng.int(2, 3);
		for (let w = 0; w < count; w++) {
			whipTimes.push((w + 0.5 + rng.range(-0.18, 0.18)) / count);
			whipAngles.push(
				(rng.chance(0.5) ? 1 : -1) * rng.range(1.35, 2.45) * (0.6 + 0.5 * kin.whipSharpness)
			);
		}
	}
	let nextWhipIdx = 0;

	const arcTargetX =
		px < width * 0.5 ? width * rng.range(0.68, 0.91) : width * rng.range(0.09, 0.32);
	const arcTargetY =
		py < height * 0.5 ? height * rng.range(0.66, 0.89) : height * rng.range(0.11, 0.34);
	const arcBowing = rng.range(0.18, 0.38) * minDim * swirlSign;
	const veilCycles = rng.range(1.75, 3.0);
	const veilAmp = rng.range(0.18, 0.34) * minDim * swirlSign;

	const startX = px;
	const startY = py;

	// Extra veil boost for late whitewash coats
	const isLateWhitewash =
		layerIndex >= 5 &&
		pigmentKey === 'lime-whitewash' &&
		(study === 'pending-file' || study === 'public-works-tenders' || study === 'whitewash-record');
	const spanBoost = isLateWhitewash ? 1.16 : 1.0;

	for (let step = 0; step < anchorCount; step++) {
		const u = anchorCount > 1 ? step / (anchorCount - 1) : 0;
		const t = step * dt;

		if (archetype === 'sweeping-arc' || archetype === 'veil-ribbon') {
			const dxSpan = (arcTargetX - startX) * spanBoost;
			const dySpan = (arcTargetY - startY) * spanBoost;
			const spanLen = Math.max(1, Math.hypot(dxSpan, dySpan));
			const nx = -dySpan / spanLen;
			const ny = dxSpan / spanLen;
			const wave =
				archetype === 'sweeping-arc'
					? Math.sin(Math.PI * u) * arcBowing + Math.sin(Math.PI * 2 * u + p1) * arcBowing * 0.24
					: Math.sin(Math.PI * veilCycles * u + p1 * 0.3) * veilAmp +
						Math.sin(Math.PI * 0.85 * u) * veilAmp * 0.45;
			const targetX = startX + dxSpan * u + nx * wave;
			const targetY = startY + dySpan * u + ny * wave;
			const ax = (targetX - px) * 14 - vx * 1.1;
			const ay = (targetY - py) * 14 - vy * 1.1;
			vx = (vx + ax * dt) * 0.94;
			vy = (vy + ay * dt) * 0.94;
		} else {
			const targetHubX = hubA.x * (1 - u * 0.55) + hubB.x * (u * 0.55);
			const targetHubY = hubA.y * (1 - u * 0.55) + hubB.y * (u * 0.55);
			const dx = targetHubX - px;
			const dy = targetHubY - py;
			const dist = Math.hypot(dx, dy);
			const r0 = 72 * artScale;

			let ax = dx * kSpring - (dy / (dist + r0)) * kSwirl;
			let ay = dy * kSpring + (dx / (dist + r0)) * kSwirl;

			ax += amp1 * Math.sin(w1 * t + p1) + amp2 * Math.cos(w2 * t + p2);
			ay += amp1 * Math.cos(w1 * t + p2) - amp2 * Math.sin(w2 * t + p1);

			if (
				archetype === 'whip-back' &&
				nextWhipIdx < whipTimes.length &&
				u >= whipTimes[nextWhipIdx]!
			) {
				const angle = whipAngles[nextWhipIdx]!;
				const ca = Math.cos(angle);
				const sa = Math.sin(angle);
				const nvx = vx * ca - vy * sa;
				const nvy = vx * sa + vy * ca;
				vx = nvx * 1.24;
				vy = nvy * 1.24;
				nextWhipIdx++;
			}

			// Slow down when dwelling near hubs if study has strong stallStrength
			const nearHub = Math.exp(-(dist * dist) / (2 * Math.pow(130 * artScale, 2)));
			const drag = 0.985 - kin.stallStrength * 0.045 * nearHub;
			vx = (vx + ax * dt) * drag;
			vy = (vy + ay * dt) * drag;
		}

		// Soft boundary containment potential
		const kWall = 1850 * artScale;
		if (px < mEdge + mBand) {
			const ratio = clamp((mEdge + mBand - px) / mBand, 0, 1.5);
			vx += kWall * ratio * ratio * dt;
			if (vx < 0) vx *= 0.93;
		} else if (px > width - mEdge - mBand) {
			const ratio = clamp((px - (width - mEdge - mBand)) / mBand, 0, 1.5);
			vx -= kWall * ratio * ratio * dt;
			if (vx > 0) vx *= 0.93;
		}
		if (py < mEdge + mBand) {
			const ratio = clamp((mEdge + mBand - py) / mBand, 0, 1.5);
			vy += kWall * ratio * ratio * dt;
			if (vy < 0) vy *= 0.93;
		} else if (py > height - mEdge - mBand) {
			const ratio = clamp((py - (height - mEdge - mBand)) / mBand, 0, 1.5);
			vy -= kWall * ratio * ratio * dt;
			if (vy > 0) vy *= 0.93;
		}

		px = clamp(px + vx * dt, 8, width - 8);
		py = clamp(py + vy * dt, 8, height - 8);

		// Guard against identical consecutive points
		if (qx.length > 0) {
			const prevX = qx[qx.length - 1]!;
			const prevY = qy[qy.length - 1]!;
			if (Math.hypot(px - prevX, py - prevY) < 1.0) {
				px = clamp(px + Math.cos(heading) * 3.0, 8, width - 8);
				py = clamp(py + Math.sin(heading) * 3.0, 8, height - 8);
			}
		}

		qx.push(px);
		qy.push(py);
		rawSpeed.push(Math.hypot(vx, vy));
	}

	return { qx, qy, rawSpeed };
}

function buildCanonicalPass(
	seed: number,
	study: StudyId,
	passIndex: number,
	layerIndex: 1 | 2 | 3 | 4 | 5 | 6,
	pigmentKey: PigmentId,
	hubs: readonly HubPoint[],
	width: number,
	height: number
): CanonicalPass {
	const studyIdx = STUDY_INDEX[study];
	const spec = STUDY_SPECS[study];
	const kin = spec.kinematics;
	const rng = createStreamRng(seed, 'paths', studyIdx * 64 + passIndex);

	let archetype = pickWeightedArchetype(kin.gestureWeights, rng.next());
	if (
		layerIndex >= 5 &&
		pigmentKey === 'lime-whitewash' &&
		(study === 'pending-file' || study === 'public-works-tenders' || study === 'whitewash-record')
	) {
		archetype = passIndex % 2 === 0 ? 'veil-ribbon' : 'sweeping-arc';
	}

	const { qx, qy, rawSpeed } = generateControlAnchors(
		seed,
		study,
		passIndex,
		layerIndex,
		pigmentKey,
		archetype,
		hubs,
		width,
		height
	);

	const m = qx.length;
	let sumX = 0;
	let sumY = 0;
	for (let i = 0; i < m; i++) {
		sumX += qx[i]!;
		sumY += qy[i]!;
	}
	const anchorX = sumX / m;
	const anchorY = sumY / m;

	// Reflect endpoints for centripetal Catmull-Rom
	const extX = new Array<number>(m + 2);
	const extY = new Array<number>(m + 2);
	const extS = new Array<number>(m + 2);
	for (let i = 0; i < m; i++) {
		extX[i + 1] = qx[i]!;
		extY[i + 1] = qy[i]!;
		extS[i + 1] = rawSpeed[i]!;
	}
	extX[0] = clamp(2 * qx[0]! - qx[1]!, 4, width - 4);
	extY[0] = clamp(2 * qy[0]! - qy[1]!, 4, height - 4);
	extS[0] = rawSpeed[0]!;
	extX[m + 1] = clamp(2 * qx[m - 1]! - qx[m - 2]!, 4, width - 4);
	extY[m + 1] = clamp(2 * qy[m - 1]! - qy[m - 2]!, 4, height - 4);
	extS[m + 1] = rawSpeed[m - 1]!;

	// Dense sample
	const substeps = 16;
	const denseX: number[] = [];
	const denseY: number[] = [];
	const denseRawSpeed: number[] = [];
	const denseArc: number[] = [];

	let totalDenseArc = 0;
	for (let span = 0; span < m - 1; span++) {
		const p0x = extX[span]!;
		const p0y = extY[span]!;
		const p1x = extX[span + 1]!;
		const p1y = extY[span + 1]!;
		const p2x = extX[span + 2]!;
		const p2y = extY[span + 2]!;
		const p3x = extX[span + 3]!;
		const p3y = extY[span + 3]!;
		const s1 = extS[span + 1]!;
		const s2 = extS[span + 2]!;

		const stepsThisSpan = span === m - 2 ? substeps + 1 : substeps;
		for (let j = 0; j < stepsThisSpan; j++) {
			const u = j / substeps;
			const pt = evalCatmullRomCentripetal(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, u);
			const cx = clamp(pt.x, 6, width - 6);
			const cy = clamp(pt.y, 6, height - 6);
			if (denseX.length > 0) {
				totalDenseArc += Math.hypot(
					cx - denseX[denseX.length - 1]!,
					cy - denseY[denseY.length - 1]!
				);
			}
			denseX.push(cx);
			denseY.push(cy);
			denseRawSpeed.push(s1 + (s2 - s1) * u);
			denseArc.push(totalDenseArc);
		}
	}

	const minDim = Math.min(width, height);
	const artScale = minDim / 800;
	const targetSpacing = 8.5 * artScale;
	const pointCount = clamp(Math.round(totalDenseArc / Math.max(1, targetSpacing)), 80, 360);

	const x = new Float32Array(pointCount);
	const y = new Float32Array(pointCount);
	const arcLength = new Float32Array(pointCount);
	const baseSpeedInterp = new Float32Array(pointCount);

	let denseIdx = 0;
	for (let k = 0; k < pointCount; k++) {
		const targetS = pointCount > 1 ? (totalDenseArc * k) / (pointCount - 1) : 0;
		while (denseIdx < denseArc.length - 2 && denseArc[denseIdx + 1]! < targetS) {
			denseIdx++;
		}
		const s0 = denseArc[denseIdx]!;
		const s1 = denseArc[denseIdx + 1] ?? s0;
		const frac = s1 > s0 ? clamp((targetS - s0) / (s1 - s0), 0, 1) : 0;
		x[k] =
			denseX[denseIdx]! + ((denseX[denseIdx + 1] ?? denseX[denseIdx]!) - denseX[denseIdx]!) * frac;
		y[k] =
			denseY[denseIdx]! + ((denseY[denseIdx + 1] ?? denseY[denseIdx]!) - denseY[denseIdx]!) * frac;
		baseSpeedInterp[k] =
			denseRawSpeed[denseIdx]! +
			((denseRawSpeed[denseIdx + 1] ?? denseRawSpeed[denseIdx]!) - denseRawSpeed[denseIdx]!) * frac;
		arcLength[k] = targetS;
	}

	const tx = new Float32Array(pointCount);
	const ty = new Float32Array(pointCount);
	const signedCurvature = new Float32Array(pointCount);
	const speed = new Float32Array(pointCount);
	const globalSpeedNorm = new Float32Array(pointCount);
	const dwell = new Float32Array(pointCount);
	const vx = new Float32Array(pointCount);
	const vy = new Float32Array(pointCount);

	// Tangents
	for (let k = 0; k < pointCount; k++) {
		const prev = Math.max(0, k - 1);
		const next = Math.min(pointCount - 1, k + 1);
		const dx = x[next]! - x[prev]!;
		const dy = y[next]! - y[prev]!;
		const len = Math.hypot(dx, dy);
		if (len > 1e-6) {
			tx[k] = dx / len;
			ty[k] = dy / len;
		} else {
			tx[k] = k > 0 ? tx[k - 1]! : 1;
			ty[k] = k > 0 ? ty[k - 1]! : 0;
		}
	}

	// Smoothed signed curvature over centered 2-sample window
	const avgDs = pointCount > 1 ? totalDenseArc / (pointCount - 1) : 1;
	const rRef = 140 * artScale;
	const vRef = 460 * artScale;

	for (let k = 0; k < pointCount; k++) {
		const km = Math.max(0, k - 2);
		const kp = Math.min(pointCount - 1, k + 2);
		const stepSpan = Math.max(1, kp - km) * avgDs * 0.5;
		const xp = (x[kp]! - x[km]!) / (2 * stepSpan);
		const yp = (y[kp]! - y[km]!) / (2 * stepSpan);
		const xpp = (x[kp]! - 2 * x[k]! + x[km]!) / (stepSpan * stepSpan);
		const ypp = (y[kp]! - 2 * y[k]! + y[km]!) / (stepSpan * stepSpan);
		const denom = Math.pow(xp * xp + yp * yp, 1.5);
		const kappa = denom > 1e-6 ? (xp * ypp - yp * xpp) / denom : 0;
		signedCurvature[k] = clamp(
			kappa,
			-0.18 / Math.max(0.5, artScale),
			0.18 / Math.max(0.5, artScale)
		);

		// Velocity coupled to curvature drag + hub stall + entry/exit smoothness
		const u = pointCount > 1 ? k / (pointCount - 1) : 0;
		const rampIn = clamp(u / 0.07, 0, 1);
		const rampOut = clamp((1 - u) / 0.07, 0, 1);
		const smoothRamp =
			0.45 + 0.55 * (rampIn * rampIn * (3 - 2 * rampIn)) * (rampOut * rampOut * (3 - 2 * rampOut));

		let minHubDist = Infinity;
		for (const hub of hubs) {
			const d = Math.hypot(x[k]! - hub.x, y[k]! - hub.y);
			if (d < minHubDist) minHubDist = d;
		}
		const hubStall =
			1 -
			kin.stallStrength *
				0.52 *
				Math.exp(-(minHubDist * minHubDist) / (2 * Math.pow(110 * artScale, 2)));
		const curvDrag = 1 / (1 + 0.38 * Math.abs(signedCurvature[k]!) * rRef);

		const v = Math.max(18 * artScale, baseSpeedInterp[k]! * curvDrag * hubStall * smoothRamp);
		speed[k] = v;
		vx[k] = tx[k]! * v;
		vy[k] = ty[k]! * v;

		const vNorm = clamp(v / vRef, 0.05, 1.0);
		globalSpeedNorm[k] = vNorm;

		const curvNorm = Math.min(1, Math.abs(signedCurvature[k]!) * 95 * artScale);
		dwell[k] = clamp(Math.pow(1 - vNorm, 1.65) * (0.55 + 0.45 * curvNorm), 0, 1);
	}

	return {
		passIndex,
		layerIndex,
		pigmentKey,
		archetype,
		artboardWidth: width,
		artboardHeight: height,
		anchorX,
		anchorY,
		pointCount,
		totalArcLength: totalDenseArc,
		x,
		y,
		vx,
		vy,
		signedCurvature,
		tx,
		ty,
		speed,
		globalSpeedNorm,
		dwell,
		arcLength
	};
}

export function buildCanonicalPassTable(
	seed: number,
	study: StudyId,
	width: number,
	height: number
): CanonicalPassTable {
	const normalizedSeed = normalizeSeed(seed);
	const safeStudy: StudyId = Object.prototype.hasOwnProperty.call(STUDY_SPECS, study)
		? study
		: 'pending-file';
	const w =
		Number.isFinite(width) && width > 0 ? Math.max(200, Math.round(width)) : DEFAULT_ARTBOARD_WIDTH;
	const h =
		Number.isFinite(height) && height > 0
			? Math.max(200, Math.round(height))
			: DEFAULT_ARTBOARD_HEIGHT;
	const cacheKey = `${normalizedSeed}:${safeStudy}:${w}x${h}`;
	const cached = canonicalCache.get(cacheKey);
	if (cached) {
		// Refresh LRU order
		canonicalCache.delete(cacheKey);
		canonicalCache.set(cacheKey, cached);
		return cached;
	}

	const studyIdx = STUDY_INDEX[safeStudy];
	const spec = STUDY_SPECS[safeStudy];
	const kin = spec.kinematics;

	const hubsRng = createStreamRng(normalizedSeed, 'paths', studyIdx * 64 + 63);
	const hubCount = hubsRng.int(kin.hubCountRange[0], kin.hubCountRange[1]);
	const minDist = 0.18 * Math.min(w, h);
	const xMin = kin.hubInset * w;
	const xMax = (1 - kin.hubInset) * w;
	const yMin = kin.hubInset * h;
	const yMax = (1 - kin.hubInset) * h;

	const hubs: HubPoint[] = [];
	for (let i = 0; i < hubCount; i++) {
		let bestX = hubsRng.range(xMin, xMax);
		let bestY = hubsRng.range(yMin, yMax);
		let bestMinD = -1;

		for (let attempt = 0; attempt < 24; attempt++) {
			const cx = hubsRng.range(xMin, xMax);
			const cy = hubsRng.range(yMin, yMax);
			let nearest = Infinity;
			for (const existing of hubs) {
				const d = Math.hypot(cx - existing.x, cy - existing.y);
				if (d < nearest) nearest = d;
			}
			if (hubs.length === 0 || nearest >= minDist) {
				bestX = cx;
				bestY = cy;
				break;
			}
			if (nearest > bestMinD) {
				bestMinD = nearest;
				bestX = cx;
				bestY = cy;
			}
		}
		hubs.push({ x: bestX, y: bestY });
	}

	const { layers, pigments } = buildPassLayerAndPigmentSchedule(normalizedSeed, safeStudy);
	const passes: CanonicalPass[] = new Array(MAX_PASSES);

	for (let p = 0; p < MAX_PASSES; p++) {
		passes[p] = buildCanonicalPass(
			normalizedSeed,
			safeStudy,
			p,
			layers[p]!,
			pigments[p]!,
			hubs,
			w,
			h
		);
	}

	const table: CanonicalPassTable = {
		seed: normalizedSeed,
		study: safeStudy,
		artboardWidth: w,
		artboardHeight: h,
		hubs,
		passes
	};

	if (canonicalCache.size >= MAX_CANONICAL_CACHE) {
		const oldestKey = canonicalCache.keys().next().value;
		if (oldestKey !== undefined) canonicalCache.delete(oldestKey);
	}
	canonicalCache.set(cacheKey, table);
	return table;
}

/**
 * C1-smooth asymptotic soft containment: exact identity inside [minBound + pad, maxBound - pad],
 * smoothly compressing overshoot asymptotically into [minBound, maxBound] without hard clipping.
 */
function softContain(val: number, minBound: number, maxBound: number, pad: number): number {
	const innerMin = minBound + pad;
	const innerMax = maxBound - pad;
	if (val < innerMin) {
		const over = innerMin - val;
		return innerMin - (pad * over) / (pad + over);
	}
	if (val > innerMax) {
		const over = val - innerMax;
		return innerMax + (pad * over) / (pad + over);
	}
	return val;
}

export function applySweepWidth(
	input: CanonicalPassTable | readonly CanonicalPass[],
	sweepWidth: number,
	artboardWidth = 1200,
	artboardHeight = 800
): SweptPass[] {
	const passes = Array.isArray(input) ? input : (input as CanonicalPassTable).passes;
	const rawW = Array.isArray(input) ? artboardWidth : (input as CanonicalPassTable).artboardWidth;
	const rawH = Array.isArray(input) ? artboardHeight : (input as CanonicalPassTable).artboardHeight;
	const w = Number.isFinite(rawW) && rawW > 0 ? rawW : DEFAULT_ARTBOARD_WIDTH;
	const h = Number.isFinite(rawH) && rawH > 0 ? rawH : DEFAULT_ARTBOARD_HEIGHT;

	const safeSweep = Number.isFinite(sweepWidth) ? sweepWidth : DEFAULT_SWEEP;
	const clampedSweep = clamp(safeSweep, MIN_SWEEP, MAX_SWEEP);
	const scale = 0.32 + ((clampedSweep - MIN_SWEEP) / (MAX_SWEEP - MIN_SWEEP)) * 0.86;
	const minBound = 8;
	const maxBoundX = Math.max(minBound + 64, w - 8);
	const maxBoundY = Math.max(minBound + 64, h - 8);
	const pad = 28;

	return passes.map((pass): SweptPass => {
		const n = pass.pointCount;
		const sx = new Float32Array(n);
		const sy = new Float32Array(n);
		const stx = new Float32Array(n);
		const sty = new Float32Array(n);
		const svx = new Float32Array(n);
		const svy = new Float32Array(n);
		const sArc = new Float32Array(n);

		let accArc = 0;
		for (let k = 0; k < n; k++) {
			const rx = pass.anchorX + (pass.x[k]! - pass.anchorX) * scale;
			const ry = pass.anchorY + (pass.y[k]! - pass.anchorY) * scale;
			const cx = softContain(rx, minBound, maxBoundX, pad);
			const cy = softContain(ry, minBound, maxBoundY, pad);
			sx[k] = cx;
			sy[k] = cy;
			if (k > 0) {
				accArc += Math.hypot(cx - sx[k - 1]!, cy - sy[k - 1]!);
			}
			sArc[k] = accArc;
		}

		for (let k = 0; k < n; k++) {
			const prev = Math.max(0, k - 1);
			const next = Math.min(n - 1, k + 1);
			const dx = sx[next]! - sx[prev]!;
			const dy = sy[next]! - sy[prev]!;
			const len = Math.hypot(dx, dy);
			if (len > 1e-6) {
				stx[k] = dx / len;
				sty[k] = dy / len;
			} else {
				stx[k] = pass.tx[k]!;
				sty[k] = pass.ty[k]!;
			}
			const spd = pass.speed[k]!;
			svx[k] = stx[k]! * spd;
			svy[k] = sty[k]! * spd;
		}

		return {
			passIndex: pass.passIndex,
			layerIndex: pass.layerIndex,
			pigmentKey: pass.pigmentKey,
			archetype: pass.archetype,
			artboardWidth: pass.artboardWidth,
			artboardHeight: pass.artboardHeight,
			anchorX: pass.anchorX,
			anchorY: pass.anchorY,
			pointCount: n,
			totalArcLength: accArc,
			sweepWidth: clampedSweep,
			x: sx,
			y: sy,
			vx: svx,
			vy: svy,
			signedCurvature: pass.signedCurvature,
			tx: stx,
			ty: sty,
			speed: pass.speed,
			globalSpeedNorm: pass.globalSpeedNorm,
			dwell: pass.dwell,
			arcLength: sArc
		};
	});
}

export function selectActivePasses<
	T extends { readonly passIndex: number; readonly layerIndex: number }
>(passes: readonly T[], maxPasses: number, maxLayers: number): T[] {
	const safePasses = Number.isFinite(maxPasses) ? Math.round(maxPasses) : DEFAULT_PASSES;
	const safeLayers = Number.isFinite(maxLayers) ? Math.round(maxLayers) : DEFAULT_LAYERS;
	const pLimit = clamp(safePasses, MIN_PASSES, MAX_PASSES);
	const lLimit = clamp(safeLayers, MIN_LAYERS, MAX_LAYERS);
	return passes
		.filter((p) => p.passIndex < pLimit && p.layerIndex <= lLimit)
		.sort((a, b) => a.layerIndex - b.layerIndex || a.passIndex - b.passIndex);
}

export function getPassPathPoints(pass: CanonicalPass): PassPathPoint[] {
	const pts: PassPathPoint[] = new Array(pass.pointCount);
	for (let k = 0; k < pass.pointCount; k++) {
		pts[k] = {
			x: pass.x[k]!,
			y: pass.y[k]!,
			vx: pass.vx[k]!,
			vy: pass.vy[k]!,
			signedCurvature: pass.signedCurvature[k]!,
			tx: pass.tx[k]!,
			ty: pass.ty[k]!,
			speed: pass.speed[k]!,
			globalSpeedNorm: pass.globalSpeedNorm[k]!,
			dwell: pass.dwell[k]!,
			arcLength: pass.arcLength[k]!,
			anchorX: pass.anchorX,
			anchorY: pass.anchorY,
			layerIndex: pass.layerIndex,
			pigmentKey: pass.pigmentKey,
			passIndex: pass.passIndex
		};
	}
	return pts;
}
