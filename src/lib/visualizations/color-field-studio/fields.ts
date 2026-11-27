import { createStreamRng, normalizeSeed, smoothNoise2DFast, STREAM_SALTS } from './prng.ts';
import { STUDY_BY_ID } from './studies.ts';
import {
	BOUNDS,
	MAX_AREA_COUNT,
	type CanonicalRegion,
	type ColorFieldState,
	type ColorRegion,
	type GlazeCoatPass,
	type PigmentSwatch,
	type StudyArchetype,
	type StudyId
} from './types.ts';

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

export function computeAreaSizeScale(areaSize: number): number {
	const safe = Number.isFinite(areaSize)
		? clamp(areaSize, BOUNDS.areaSize.min, BOUNDS.areaSize.max)
		: BOUNDS.areaSize.defaultValue;
	const norm = (safe - BOUNDS.areaSize.min) / (BOUNDS.areaSize.max - BOUNDS.areaSize.min);
	return 0.42 + Math.pow(norm, 0.92) * 0.96;
}

export function computeMaxEdgePad(
	rx: number,
	ry: number,
	edgeSoftness: number,
	avgDxLogical = 1
): { wEdge: number; aNoise: number } {
	const e = clamp(edgeSoftness, 0, 100) / 100;
	const minR = Math.max(1, Math.min(rx, ry));
	const wAa = Math.max(0.75, 0.9 * avgDxLogical);
	const wEdge = wAa + minR * (0.04 * e + 0.34 * Math.pow(e, 1.55));
	const aNoise = e === 0 ? 0 : minR * (0.015 * e + 0.11 * Math.pow(e, 1.25));
	return { wEdge, aNoise };
}

function rgbDistance(
	a: readonly [number, number, number],
	b: readonly [number, number, number]
): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function assignRegionPigments(seed: number, palette: readonly PigmentSwatch[]): PigmentSwatch[] {
	const rng = createStreamRng(seed, 'pigment', 0);
	const indices = palette.map((_, idx) => idx);
	for (let i = indices.length - 1; i > 0; i--) {
		const j = rng.int(0, i);
		const tmp = indices[i]!;
		indices[i] = indices[j]!;
		indices[j] = tmp;
	}

	// Ensure regions 0 and 1 (the two-area core pair) always have clear chromatic/tonal separation.
	const firstIdx = indices[0]!;
	const secondIdx = indices[1]!;
	if (rgbDistance(palette[firstIdx]!.rgb, palette[secondIdx]!.rgb) < 68) {
		let bestPos = 1;
		let bestDist = rgbDistance(palette[firstIdx]!.rgb, palette[secondIdx]!.rgb);
		for (let k = 2; k < indices.length; k++) {
			const d = rgbDistance(palette[firstIdx]!.rgb, palette[indices[k]!]!.rgb);
			if (d > bestDist) {
				bestDist = d;
				bestPos = k;
			}
		}
		if (bestPos !== 1) {
			const tmp = indices[1]!;
			indices[1] = indices[bestPos]!;
			indices[bestPos] = tmp;
		}
	}

	return indices.map((idx) => palette[idx]!);
}

interface RegionTemplate {
	readonly cxNorm: number;
	readonly cyNorm: number;
	readonly cxJitter: number;
	readonly cyJitter: number;
	readonly rxNorm: number;
	readonly ryNorm: number;
	readonly minExp: number;
	readonly maxExp: number;
	readonly maxTiltDeg: number;
}

const STACKED_TEMPLATES: readonly RegionTemplate[] = [
	{
		cxNorm: 0.5,
		cyNorm: 0.335,
		cxJitter: 0.018,
		cyJitter: 0.012,
		rxNorm: 0.36,
		ryNorm: 0.14,
		minExp: 6,
		maxExp: 8,
		maxTiltDeg: 1.8
	},
	{
		cxNorm: 0.5,
		cyNorm: 0.665,
		cxJitter: 0.018,
		cyJitter: 0.012,
		rxNorm: 0.36,
		ryNorm: 0.14,
		minExp: 6,
		maxExp: 8,
		maxTiltDeg: 1.8
	},
	{
		cxNorm: 0.5,
		cyNorm: 0.5,
		cxJitter: 0.022,
		cyJitter: 0.016,
		rxNorm: 0.31,
		ryNorm: 0.085,
		minExp: 6,
		maxExp: 6,
		maxTiltDeg: 2.0
	},
	{
		cxNorm: 0.5,
		cyNorm: 0.16,
		cxJitter: 0.024,
		cyJitter: 0.015,
		rxNorm: 0.33,
		ryNorm: 0.072,
		minExp: 4,
		maxExp: 6,
		maxTiltDeg: 2.2
	},
	{
		cxNorm: 0.5,
		cyNorm: 0.84,
		cxJitter: 0.024,
		cyJitter: 0.015,
		rxNorm: 0.34,
		ryNorm: 0.075,
		minExp: 6,
		maxExp: 8,
		maxTiltDeg: 2.0
	},
	{
		cxNorm: 0.49,
		cyNorm: 0.36,
		cxJitter: 0.04,
		cyJitter: 0.03,
		rxNorm: 0.22,
		ryNorm: 0.085,
		minExp: 4,
		maxExp: 6,
		maxTiltDeg: 2.5
	}
] as const;

const SOAK_STAIN_TEMPLATES: readonly RegionTemplate[] = [
	{
		cxNorm: 0.38,
		cyNorm: 0.42,
		cxJitter: 0.03,
		cyJitter: 0.03,
		rxNorm: 0.25,
		ryNorm: 0.21,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 28
	},
	{
		cxNorm: 0.63,
		cyNorm: 0.58,
		cxJitter: 0.03,
		cyJitter: 0.03,
		rxNorm: 0.25,
		ryNorm: 0.21,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 28
	},
	{
		cxNorm: 0.5,
		cyNorm: 0.5,
		cxJitter: 0.035,
		cyJitter: 0.03,
		rxNorm: 0.24,
		ryNorm: 0.17,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 32
	},
	{
		cxNorm: 0.66,
		cyNorm: 0.28,
		cxJitter: 0.035,
		cyJitter: 0.03,
		rxNorm: 0.21,
		ryNorm: 0.16,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 34
	},
	{
		cxNorm: 0.32,
		cyNorm: 0.72,
		cxJitter: 0.035,
		cyJitter: 0.03,
		rxNorm: 0.22,
		ryNorm: 0.16,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 34
	},
	{
		cxNorm: 0.49,
		cyNorm: 0.35,
		cxJitter: 0.04,
		cyJitter: 0.035,
		rxNorm: 0.18,
		ryNorm: 0.14,
		minExp: 2,
		maxExp: 2,
		maxTiltDeg: 36
	}
] as const;

export function buildCanonicalRegions(
	seed: number,
	studyId: StudyId,
	artboardWidth: number,
	artboardHeight: number
): readonly CanonicalRegion[] {
	const safeSeed = normalizeSeed(seed);
	const study = Object.prototype.hasOwnProperty.call(STUDY_BY_ID, studyId)
		? STUDY_BY_ID[studyId]
		: STUDY_BY_ID['rothko-nocturne'];
	const archetype: StudyArchetype = study.archetype;
	const templates = archetype === 'soak-stain' ? SOAK_STAIN_TEMPLATES : STACKED_TEMPLATES;
	const compRng = createStreamRng(safeSeed, 'composition', 0);
	const pigments = assignRegionPigments(safeSeed, study.palette);

	const regions: CanonicalRegion[] = [];
	for (let i = 0; i < MAX_AREA_COUNT; i++) {
		const tpl = templates[i]!;
		const cx = (tpl.cxNorm + compRng.signed() * tpl.cxJitter) * artboardWidth;
		const cy = (tpl.cyNorm + compRng.signed() * tpl.cyJitter) * artboardHeight;
		const rxScaleJitter = 0.94 + compRng.next() * 0.12;
		const ryScaleJitter = 0.94 + compRng.next() * 0.12;
		const baseRx = tpl.rxNorm * artboardWidth * rxScaleJitter;
		const baseRy = tpl.ryNorm * artboardHeight * ryScaleJitter;
		const isSoak = archetype === 'soak-stain';
		const exponent = isSoak
			? 2
			: tpl.maxExp <= tpl.minExp
				? tpl.minExp
				: compRng.chance(0.5)
					? tpl.minExp
					: tpl.maxExp;
		const angle = (compRng.signed() * tpl.maxTiltDeg * Math.PI) / 180;
		const h2 = isSoak ? compRng.range(0.06, 0.15) : 0;
		const h3 = isSoak ? compRng.range(0.04, 0.1) : 0;
		const p2 = compRng.range(0, Math.PI * 2);
		const p3 = compRng.range(0, Math.PI * 2);

		regions.push({
			index: i,
			cx,
			cy,
			baseRx,
			baseRy,
			exponent,
			angle,
			cosA: Math.cos(angle),
			sinA: Math.sin(angle),
			h2,
			h3,
			cosP2: Math.cos(p2),
			sinP2: Math.sin(p2),
			cosP3: Math.cos(p3),
			sinP3: Math.sin(p3),
			pigment: pigments[i % pigments.length]!
		});
	}

	return regions;
}

export function buildActiveRegions(
	canonicalRegions: readonly CanonicalRegion[],
	state: ColorFieldState
): readonly ColorRegion[] {
	const count = clamp(Math.round(state.areaCount), BOUNDS.areaCount.min, BOUNDS.areaCount.max);
	const sizeScale = computeAreaSizeScale(state.areaSize);
	const maxCoatReach = state.edgeSoftness > 0 ? 1 + 0.045 * (state.edgeSoftness / 100) : 1;
	const conservativeAvgDx = Math.max(1.5, state.artboardWidth / 240);

	return canonicalRegions.slice(0, count).map((canon) => {
		const rx = canon.baseRx * sizeScale;
		const ry = canon.baseRy * sizeScale;
		const scaledRx = rx * maxCoatReach;
		const scaledRy = ry * maxCoatReach;
		const maxLobe = Math.min(1.35, 1 + canon.h2 + canon.h3);
		const { wEdge, aNoise } = computeMaxEdgePad(
			scaledRx,
			scaledRy,
			state.edgeSoftness,
			conservativeAvgDx
		);
		const guardScale = 1 + (wEdge + aNoise) / Math.max(1, Math.min(scaledRx, scaledRy));
		const effRx = scaledRx * maxLobe * guardScale;
		const effRy = scaledRy * maxLobe * guardScale;
		const halfW = Math.abs(effRx * canon.cosA) + Math.abs(effRy * canon.sinA) + 4;
		const halfH = Math.abs(effRx * canon.sinA) + Math.abs(effRy * canon.cosA) + 4;

		return {
			...canon,
			rx,
			ry,
			minX: Math.max(0, canon.cx - halfW),
			minY: Math.max(0, canon.cy - halfH),
			maxX: Math.min(state.artboardWidth, canon.cx + halfW),
			maxY: Math.min(state.artboardHeight, canon.cy + halfH)
		};
	});
}

const COAT_WEIGHTS: readonly [number, number, number] = [0.42, 0.36, 0.22];

export function buildGlazePasses(
	regions: readonly ColorRegion[],
	state: ColorFieldState
): readonly GlazeCoatPass[] {
	const e = clamp(state.edgeSoftness, 0, 100) / 100;
	const reachScales: readonly [number, number, number] =
		e > 0 ? [1 + 0.045 * e, 1.0, 1 - 0.045 * e] : [1.0, 1.0, 1.0];

	const passes: GlazeCoatPass[] = [];
	let orderIdx = 0;

	for (let coatIndex = 0; coatIndex < COAT_WEIGHTS.length; coatIndex++) {
		const coatWeight = COAT_WEIGHTS[coatIndex]!;
		const coatReachScale = reachScales[coatIndex]!;
		for (let rIdx = 0; rIdx < regions.length; rIdx++) {
			const region = regions[rIdx]!;
			passes.push({
				passOrderIndex: orderIdx++,
				coatIndex,
				regionIndex: region.index,
				region,
				coatWeight,
				coatReachScale,
				minX: region.minX,
				minY: region.minY,
				maxX: region.maxX,
				maxY: region.maxY
			});
		}
	}

	return passes;
}

const FBM3_INV_NORM = 1 / 1.7104;
const EDGE_STREAM_SALT = STREAM_SALTS.edges;

export interface RegionMaskContext {
	readonly cx: number;
	readonly cy: number;
	readonly cosA: number;
	readonly sinA: number;
	readonly invRx: number;
	readonly invRy: number;
	readonly minR: number;
	readonly exponent: number;
	readonly hasLobes: boolean;
	readonly h2: number;
	readonly h3: number;
	readonly cosP2: number;
	readonly sinP2: number;
	readonly cosP3: number;
	readonly sinP3: number;
	readonly outerLimSq: number;
	readonly innerLimSq: number;
	readonly canQuickInner: boolean;
	readonly outerBound: number;
	readonly innerBound: number;
	readonly wEdge: number;
	readonly inv2wEdge: number;
	readonly aNoise: number;
	readonly guard: number;
	readonly guardNorm: number;
	readonly invEdgeLambda: number;
	readonly normalizedSeed: number;
	readonly regionIndex: number;
}

export function createRegionMaskContext(
	region: ColorRegion,
	coatReachScale: number,
	edgeSoftness: number,
	avgDxLogical: number,
	normalizedSeed: number,
	edgeLambda: number,
	edgeFactor: number,
	noiseFactor: number
): RegionMaskContext {
	const rx = Math.max(1, region.rx * coatReachScale);
	const ry = Math.max(1, region.ry * coatReachScale);
	const minR = rx < ry ? rx : ry;
	const wAa = Math.max(0.75, 0.9 * avgDxLogical);
	const wEdge = wAa + minR * edgeFactor;
	const aNoise = minR * noiseFactor;
	const guard = wEdge + aNoise;
	const guardNorm = guard / minR;
	const hasLobes = region.h2 > 0 || region.h3 > 0;
	const maxLobe = hasLobes ? Math.min(1.35, 1 + region.h2 + region.h3) : 1;
	const minLobe = hasLobes ? Math.max(0.65, 1 - region.h2 - region.h3) : 1;
	const outerLim = maxLobe * (1 + guardNorm);
	const innerLim = guardNorm < 1 ? minLobe * (1 - guardNorm) : 0;

	return {
		cx: region.cx,
		cy: region.cy,
		cosA: region.cosA,
		sinA: region.sinA,
		invRx: 1 / rx,
		invRy: 1 / ry,
		minR,
		exponent: region.exponent,
		hasLobes,
		h2: region.h2,
		h3: region.h3,
		cosP2: region.cosP2,
		sinP2: region.sinP2,
		cosP3: region.cosP3,
		sinP3: region.sinP3,
		outerLimSq: outerLim * outerLim,
		innerLimSq: innerLim * innerLim,
		canQuickInner: guardNorm < 1,
		outerBound: outerLim,
		innerBound: (hasLobes ? 0.65 : 1) * (1 - guardNorm),
		wEdge,
		inv2wEdge: 1 / (2 * wEdge),
		aNoise,
		guard,
		guardNorm,
		invEdgeLambda: 1 / edgeLambda,
		normalizedSeed,
		regionIndex: region.index
	};
}

export function evaluateRegionMaskFast(ctx: RegionMaskContext, lx: number, ly: number): number {
	const dx = lx - ctx.cx;
	const dy = ly - ctx.cy;
	const u = dx * ctx.cosA + dy * ctx.sinA;
	const v = -dx * ctx.sinA + dy * ctx.cosA;

	const nx = u * ctx.invRx;
	const ny = v * ctx.invRy;
	const ax = nx < 0 ? -nx : nx;
	const ay = ny < 0 ? -ny : ny;

	if (ax > ctx.outerBound || ay > ctx.outerBound) return 0;

	let dSe: number;
	const p = ctx.exponent;
	if (p === 2) {
		const dSeSq = ax * ax + ay * ay;
		if (dSeSq > ctx.outerLimSq) return 0;
		if (ctx.canQuickInner && dSeSq < ctx.innerLimSq) return 1;
		dSe = dSeSq === 0 ? 0 : Math.sqrt(dSeSq);
	} else {
		if (ax + ay < ctx.innerBound) return 1;
		const maxA = ax > ay ? ax : ay;
		if (!ctx.hasLobes && maxA * 1.19 < 1 - ctx.guardNorm) return 1;
		if (ax === 0 && ay === 0) {
			dSe = 0;
		} else if (p === 4) {
			const ax2 = ax * ax;
			const ay2 = ay * ay;
			dSe = Math.sqrt(Math.sqrt(ax2 * ax2 + ay2 * ay2));
		} else if (p === 6) {
			const ax2 = ax * ax;
			const ay2 = ay * ay;
			dSe = Math.sqrt(Math.cbrt(ax2 * ax2 * ax2 + ay2 * ay2 * ay2));
		} else if (p === 8) {
			const ax2 = ax * ax;
			const ax4 = ax2 * ax2;
			const ay2 = ay * ay;
			const ay4 = ay2 * ay2;
			dSe = Math.sqrt(Math.sqrt(Math.sqrt(ax4 * ax4 + ay4 * ay4)));
		} else {
			dSe = Math.pow(Math.pow(ax, p) + Math.pow(ay, p), 1 / p);
		}
	}

	let dNorm = dSe;
	if (ctx.hasLobes && dSe > 1e-6) {
		const invLen = p === 2 ? 1 / dSe : 1 / Math.hypot(nx, ny);
		const ca = nx * invLen;
		const sa = ny * invLen;
		const c2 = ca * ca - sa * sa;
		const s2 = 2 * ca * sa;
		const c3 = c2 * ca - s2 * sa;
		const s3 = s2 * ca + c2 * sa;
		const lobe =
			1 + ctx.h2 * (c2 * ctx.cosP2 + s2 * ctx.sinP2) + ctx.h3 * (c3 * ctx.cosP3 + s3 * ctx.sinP3);
		dNorm = dSe / (lobe < 0.65 ? 0.65 : lobe > 1.35 ? 1.35 : lobe);
	}

	const sRaw = (dNorm - 1) * ctx.minR;
	if (sRaw > ctx.guard) return 0;
	if (sRaw < -ctx.guard) return 1;

	let sEff = sRaw;
	if (ctx.aNoise > 0) {
		const ex = lx * ctx.invEdgeLambda;
		const ey = ly * ctx.invEdgeLambda;
		const ch = ctx.regionIndex;
		const n0 = smoothNoise2DFast(ctx.normalizedSeed, EDGE_STREAM_SALT, ex, ey, ch);
		const n1 = smoothNoise2DFast(
			ctx.normalizedSeed,
			EDGE_STREAM_SALT,
			ex * 2.05,
			ey * 2.05,
			ch + 31
		);
		const n2 = smoothNoise2DFast(
			ctx.normalizedSeed,
			EDGE_STREAM_SALT,
			ex * 4.2025,
			ey * 4.2025,
			ch + 62
		);
		const n = (n0 + 0.48 * n1 + 0.2304 * n2) * FBM3_INV_NORM;
		sEff = sRaw + (n - 0.5) * 2 * ctx.aNoise;
	}

	const rawT = (ctx.wEdge - sEff) * ctx.inv2wEdge;
	const t = rawT <= 0 ? 0 : rawT >= 1 ? 1 : rawT;
	return t * t * t * (10 + t * (-15 + 6 * t));
}

export function evaluateRegionMask(
	region: ColorRegion,
	lx: number,
	ly: number,
	coatReachScale: number,
	edgeSoftness: number,
	avgDxLogical: number,
	seed: number,
	edgeLambda: number,
	precomputedEdgeFactor?: number,
	precomputedNoiseFactor?: number
): number {
	const dx = lx - region.cx;
	const dy = ly - region.cy;
	const u = dx * region.cosA + dy * region.sinA;
	const v = -dx * region.sinA + dy * region.cosA;

	const rx = Math.max(1, region.rx * coatReachScale);
	const ry = Math.max(1, region.ry * coatReachScale);
	const nx = u / rx;
	const ny = v / ry;

	const ax = nx < 0 ? -nx : nx;
	const ay = ny < 0 ? -ny : ny;
	const minR = rx < ry ? rx : ry;
	let edgeFactor = precomputedEdgeFactor;
	let noiseFactor = precomputedNoiseFactor;
	if (edgeFactor === undefined || noiseFactor === undefined) {
		const e = clamp(edgeSoftness, 0, 100) / 100;
		edgeFactor = 0.04 * e + 0.34 * Math.pow(e, 1.55);
		noiseFactor = e === 0 ? 0 : 0.015 * e + 0.11 * Math.pow(e, 1.25);
	}
	const wAa = Math.max(0.75, 0.9 * avgDxLogical);
	const wEdge = wAa + minR * edgeFactor;
	const aNoise = minR * noiseFactor;
	const guard = wEdge + aNoise;
	const guardNorm = guard / minR;

	const hasLobes = region.h2 > 0 || region.h3 > 0;
	const maxLobe = hasLobes ? Math.min(1.35, 1 + region.h2 + region.h3) : 1;
	const outerLim = maxLobe * (1 + guardNorm);
	if (ax > outerLim || ay > outerLim) return 0;

	let dSe: number;
	const p = region.exponent;
	if (p === 2) {
		const dSeSq = ax * ax + ay * ay;
		if (dSeSq > outerLim * outerLim) return 0;
		if (guardNorm < 1) {
			const minLobe = hasLobes ? Math.max(0.65, 1 - region.h2 - region.h3) : 1;
			const innerLim = minLobe * (1 - guardNorm);
			if (dSeSq < innerLim * innerLim) return 1;
		}
		dSe = dSeSq === 0 ? 0 : Math.sqrt(dSeSq);
	} else {
		if (ax + ay < (hasLobes ? 0.65 : 1) * (1 - guardNorm)) return 1;
		const maxA = ax > ay ? ax : ay;
		if (!hasLobes && maxA * 1.19 < 1 - guardNorm) return 1;
		if (ax === 0 && ay === 0) {
			dSe = 0;
		} else if (p === 4) {
			const ax2 = ax * ax;
			const ay2 = ay * ay;
			dSe = Math.sqrt(Math.sqrt(ax2 * ax2 + ay2 * ay2));
		} else if (p === 6) {
			const ax2 = ax * ax;
			const ay2 = ay * ay;
			dSe = Math.sqrt(Math.cbrt(ax2 * ax2 * ax2 + ay2 * ay2 * ay2));
		} else if (p === 8) {
			const ax2 = ax * ax;
			const ax4 = ax2 * ax2;
			const ay2 = ay * ay;
			const ay4 = ay2 * ay2;
			dSe = Math.sqrt(Math.sqrt(Math.sqrt(ax4 * ax4 + ay4 * ay4)));
		} else {
			dSe = Math.pow(Math.pow(ax, p) + Math.pow(ay, p), 1 / p);
		}
	}

	let dNorm = dSe;
	if (hasLobes && dSe > 1e-6) {
		const invLen = p === 2 ? 1 / dSe : 1 / Math.hypot(nx, ny);
		const ca = nx * invLen;
		const sa = ny * invLen;
		const c2 = ca * ca - sa * sa;
		const s2 = 2 * ca * sa;
		const c3 = c2 * ca - s2 * sa;
		const s3 = s2 * ca + c2 * sa;
		const lobe =
			1 +
			region.h2 * (c2 * region.cosP2 + s2 * region.sinP2) +
			region.h3 * (c3 * region.cosP3 + s3 * region.sinP3);
		dNorm = dSe / (lobe < 0.65 ? 0.65 : lobe > 1.35 ? 1.35 : lobe);
	}

	const sRaw = (dNorm - 1) * minR;

	if (sRaw > guard) return 0;
	if (sRaw < -guard) return 1;

	let sEff = sRaw;
	if (aNoise > 0) {
		const normSeed = normalizeSeed(seed);
		const ex = lx / edgeLambda;
		const ey = ly / edgeLambda;
		const ch = region.index;
		const n0 = smoothNoise2DFast(normSeed, EDGE_STREAM_SALT, ex, ey, ch);
		const n1 = smoothNoise2DFast(normSeed, EDGE_STREAM_SALT, ex * 2.05, ey * 2.05, ch + 31);
		const n2 = smoothNoise2DFast(normSeed, EDGE_STREAM_SALT, ex * 4.2025, ey * 4.2025, ch + 62);
		const n = (n0 + 0.48 * n1 + 0.2304 * n2) * FBM3_INV_NORM;
		sEff = sRaw + (n - 0.5) * 2 * aNoise;
	}

	const rawT = (wEdge - sEff) / (2 * wEdge);
	const t = rawT <= 0 ? 0 : rawT >= 1 ? 1 : rawT;
	return t * t * t * (10 + t * (-15 + 6 * t));
}

export function computePaintingFocalPoint(
	regions: readonly ColorRegion[],
	artboardWidth: number,
	artboardHeight: number
): { readonly x: number; readonly y: number } {
	if (regions.length === 0 || artboardWidth <= 0 || artboardHeight <= 0) {
		return { x: 0.5, y: 0.5 };
	}

	let weightSum = 0;
	let wx = 0;
	let wy = 0;
	for (const r of regions) {
		const w = r.rx * r.ry;
		wx += r.cx * w;
		wy += r.cy * w;
		weightSum += w;
	}

	if (!Number.isFinite(weightSum) || weightSum <= 0) {
		return { x: 0.5, y: 0.5 };
	}

	return {
		x: Number(clamp(wx / weightSum / artboardWidth, 0.18, 0.82).toFixed(4)),
		y: Number(clamp(wy / weightSum / artboardHeight, 0.18, 0.82).toFixed(4))
	};
}
