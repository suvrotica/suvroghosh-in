import { hashPassUnit, normalizeSeed } from './prng.ts';
import {
	DEFAULT_PAINTING_TIME,
	MAX_PAINTING_TIME,
	MIN_PAINTING_TIME,
	type GlazeCoatPass,
	type PaintingModel,
	type PaintingTimeline,
	type PassScheduleWindow,
	type ScheduledSwath
} from './types.ts';

export const SWATHS_PER_PASS = 64;

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

export type TimelineModelInput =
	| Pick<PaintingModel, 'glazePasses' | 'state'>
	| readonly GlazeCoatPass[];

function extractPassesAndSeed(input: TimelineModelInput): {
	readonly passes: readonly GlazeCoatPass[];
	readonly seed: number;
	readonly edgeSoftness: number;
} {
	if (Array.isArray(input)) {
		return {
			passes: input as readonly GlazeCoatPass[],
			seed: normalizeSeed(undefined),
			edgeSoftness: 58
		};
	}
	const model = input as Pick<PaintingModel, 'glazePasses' | 'state'>;
	return {
		passes: model.glazePasses,
		seed: normalizeSeed(model.state.seed),
		edgeSoftness: model.state.edgeSoftness
	};
}

export function buildTimeline(
	modelInput: TimelineModelInput,
	paintingTimeSeconds: number
): PaintingTimeline {
	const { passes, seed, edgeSoftness } = extractPassesAndSeed(modelInput);
	const safeTime = Number.isFinite(paintingTimeSeconds)
		? Math.round(paintingTimeSeconds)
		: DEFAULT_PAINTING_TIME;
	const durationSeconds = clamp(safeTime, MIN_PAINTING_TIME, MAX_PAINTING_TIME);

	const passCount = passes.length;
	if (passCount === 0) {
		return {
			seed,
			durationSeconds,
			passWindows: [],
			primitives: []
		};
	}

	const passCosts = new Float64Array(passCount);
	let passCostSum = 0;

	for (let i = 0; i < passCount; i++) {
		const pass = passes[i]!;
		const spanW = Math.max(20, pass.maxX - pass.minX);
		const spanH = Math.max(20, pass.maxY - pass.minY);
		const areaCost = Math.sqrt(spanW * spanH);
		const jitter = 0.92 + 0.16 * hashPassUnit(seed, 'timeline', i, 1);
		const cost = Math.max(10, areaCost * (0.7 + 0.65 * pass.coatWeight) * jitter);
		passCosts[i] = cost;
		passCostSum += cost;
	}

	const meanPassCost = passCostSum / passCount;
	const gapCosts = new Float64Array(passCount);
	let gapCostSum = 0;

	for (let i = 1; i < passCount; i++) {
		const prev = passes[i - 1]!;
		const curr = passes[i]!;
		const isCoatBreak = curr.coatIndex > prev.coatIndex;
		const gap = isCoatBreak ? 0.18 * meanPassCost : 0.08 * meanPassCost;
		gapCosts[i] = gap;
		gapCostSum += gap;
	}

	const maxGapBudget = 0.26 * (passCostSum + gapCostSum);
	const gapScale = gapCostSum > maxGapBudget && gapCostSum > 0 ? maxGapBudget / gapCostSum : 1;
	const totalWeight = passCostSum + gapCostSum * gapScale;
	const totalRevealSpan = 0.985;

	const passWindows: PassScheduleWindow[] = [];
	const primitives: ScheduledSwath[] = [];

	let cursorWeight = 0;
	for (let i = 0; i < passCount; i++) {
		const pass = passes[i]!;
		if (i > 0) {
			cursorWeight += gapCosts[i]! * gapScale;
		}
		const startProgress = (cursorWeight / totalWeight) * totalRevealSpan;
		cursorWeight += passCosts[i]!;
		const endProgress = (cursorWeight / totalWeight) * totalRevealSpan;

		const tiltRad = (hashPassUnit(seed, 'timeline', i, 2) - 0.5) * 0.65;
		const reverseSweep = (i & 1) === 1;
		const cosSweep = Math.cos(tiltRad);
		const sinSweep = Math.sin(tiltRad);

		const corners: readonly [number, number][] = [
			[pass.minX, pass.minY],
			[pass.maxX, pass.minY],
			[pass.minX, pass.maxY],
			[pass.maxX, pass.maxY]
		];
		let uBoxMin = Infinity;
		let uBoxMax = -Infinity;
		for (const [cx, cy] of corners) {
			const u = cx * cosSweep + cy * sinSweep;
			if (u < uBoxMin) uBoxMin = u;
			if (u > uBoxMax) uBoxMax = u;
		}

		let uMin = uBoxMin;
		let uMax = uBoxMax;
		let uCenter = 0.5 * (uBoxMin + uBoxMax);
		let halfCoreU = 0.5 * (uBoxMax - uBoxMin);

		if (pass.region) {
			const r = pass.region;
			const rx = Math.max(1, r.rx * pass.coatReachScale);
			const ry = Math.max(1, r.ry * pass.coatReachScale);
			uCenter = r.cx * cosSweep + r.cy * sinSweep;
			const cosProj = r.cosA * cosSweep + r.sinA * sinSweep;
			const sinProj = r.cosA * sinSweep - r.sinA * cosSweep;
			halfCoreU = Math.max(1, Math.hypot(rx * cosProj, ry * sinProj));

			// Compute outer padded ellipse projection along sweep axis so tilted regions don't waste swaths on empty bbox corners
			const e = clamp(edgeSoftness, 0, 100) / 100;
			const minR = Math.min(rx, ry);
			const wEdgeEst = 4.5 + minR * (0.04 * e + 0.34 * Math.pow(e, 1.55));
			const aNoiseEst = e === 0 ? 0 : minR * (0.015 * e + 0.11 * Math.pow(e, 1.25));
			const maxLobe = Math.min(1.35, 1 + r.h2 + r.h3);
			const guardScale = 1 + (wEdgeEst + aNoiseEst) / Math.max(1, minR);
			const effRx = rx * maxLobe * guardScale;
			const effRy = ry * maxLobe * guardScale;
			const halfOuterU = Math.max(1, Math.hypot(effRx * cosProj, effRy * sinProj));

			uMin = Math.max(uBoxMin, uCenter - halfOuterU);
			uMax = Math.min(uBoxMax, uCenter + halfOuterU);
			if (uMax <= uMin) {
				uMin = uBoxMin;
				uMax = uBoxMax;
			}
		}

		const thresholds = new Float64Array(SWATHS_PER_PASS + 1);
		thresholds[0] = Number.NEGATIVE_INFINITY;
		thresholds[SWATHS_PER_PASS] = Number.POSITIVE_INFINITY;
		const uSpan = Math.max(1e-3, uMax - uMin);
		for (let k = 1; k < SWATHS_PER_PASS; k++) {
			thresholds[k] = uMin + (k / SWATHS_PER_PASS) * uSpan;
		}

		const passSpan = Math.max(1e-5, endProgress - startProgress);
		const binOrder: number[] = [];
		if (i === 0 && pass.region) {
			const targetCoreU = uCenter - 0.6 * halfCoreU;
			let kStart = 0;
			for (let k = 0; k < SWATHS_PER_PASS - 3; k++) {
				if (thresholds[k + 1]! > targetCoreU) {
					kStart = k;
					break;
				}
			}
			// Reveal 3 thin core swaths first (frame-1 visible on all studies), then feather outward left, then sweep right
			const earlyCount = Math.min(3, SWATHS_PER_PASS - kStart);
			for (let j = 0; j < earlyCount; j++) {
				binOrder.push(kStart + j);
			}
			for (let k = kStart - 1; k >= 0; k--) {
				binOrder.push(k);
			}
			for (let k = kStart + earlyCount; k < SWATHS_PER_PASS; k++) {
				binOrder.push(k);
			}
		} else {
			for (let m = 0; m < SWATHS_PER_PASS; m++) {
				binOrder.push(reverseSweep ? SWATHS_PER_PASS - 1 - m : m);
			}
		}

		const passSwaths: ScheduledSwath[] = [];
		for (let m = 0; m < SWATHS_PER_PASS; m++) {
			const binIdx = binOrder[m]!;
			const frac = (m + 1) / SWATHS_PER_PASS;
			const revealAt = startProgress + frac * passSpan;
			passSwaths.push({
				passOrderIndex: i,
				coatIndex: pass.coatIndex,
				regionIndex: pass.regionIndex,
				swathIndex: m,
				revealAt,
				cosSweep,
				sinSweep,
				uMinBound: thresholds[binIdx]!,
				uMaxBound: thresholds[binIdx + 1]!,
				minX: pass.minX,
				minY: pass.minY,
				maxX: pass.maxX,
				maxY: pass.maxY,
				pass
			});
		}

		// Frame-1 visibility guarantee: first 3 core swaths of Pass 0 appear by p <= 0.00012
		if (i === 0 && passSwaths.length > 0) {
			const earlyLimit = Math.min(3, passSwaths.length);
			for (let m = 0; m < earlyLimit; m++) {
				const targetEarly = Math.min(passSwaths[m]!.revealAt, 0.00003 * (m + 1));
				passSwaths[m] = { ...passSwaths[m]!, revealAt: targetEarly };
			}
			for (let m = 1; m < passSwaths.length; m++) {
				if (passSwaths[m]!.revealAt < passSwaths[m - 1]!.revealAt) {
					passSwaths[m] = { ...passSwaths[m]!, revealAt: passSwaths[m - 1]!.revealAt };
				}
			}
		}

		const primitiveStartIndex = primitives.length;
		for (const swath of passSwaths) {
			primitives.push(swath);
		}
		const primitiveEndIndex = primitives.length;

		passWindows.push({
			passOrderIndex: i,
			coatIndex: pass.coatIndex,
			regionIndex: pass.regionIndex,
			startProgress,
			endProgress,
			primitiveStartIndex,
			primitiveEndIndex
		});
	}

	return {
		seed,
		durationSeconds,
		passWindows,
		primitives
	};
}
