import { createStreamRng, normalizeSeed } from './prng.ts';
import {
	DEFAULT_PAINTING_TIME,
	MAX_PAINTING_TIME,
	MIN_PAINTING_TIME,
	type DepositionPass,
	type PaintTimeline,
	type PassScheduleWindow,
	type ScheduledPrimitive
} from './types.ts';

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

export function buildPaintTimeline(
	depositionPasses: readonly DepositionPass[],
	seed: number,
	paintingTimeSeconds: number
): PaintTimeline {
	const safeSeed = normalizeSeed(seed);
	const safeTime = Number.isFinite(paintingTimeSeconds)
		? Math.round(paintingTimeSeconds)
		: DEFAULT_PAINTING_TIME;
	const durationSeconds = clamp(safeTime, MIN_PAINTING_TIME, MAX_PAINTING_TIME);
	const timelineRng = createStreamRng(safeSeed, 'timeline', 0);

	const passCount = depositionPasses.length;
	if (passCount === 0) {
		return {
			seed: safeSeed,
			durationSeconds,
			passWindows: [],
			primitives: []
		};
	}

	const passCosts = new Float64Array(passCount);
	let passCostSum = 0;

	for (let i = 0; i < passCount; i++) {
		const pass = depositionPasses[i]!;
		const n = pass.pointCount;
		let cost = 0;
		for (let k = 1; k < n; k++) {
			const ds = Math.max(0.5, pass.arcLength[k]! - pass.arcLength[k - 1]!);
			const spd = Math.max(0.22, pass.globalSpeedNorm[k]!);
			const dw = pass.dwell[k]!;
			cost += (ds / spd) * (1 + 0.55 * dw);
		}
		const jitter = 0.92 + 0.16 * timelineRng.next();
		const finalCost = Math.max(10, cost * jitter);
		passCosts[i] = finalCost;
		passCostSum += finalCost;
	}

	const meanPassCost = passCostSum / passCount;
	const gapCosts = new Float64Array(passCount);
	let gapCostSum = 0;

	for (let i = 1; i < passCount; i++) {
		const prev = depositionPasses[i - 1]!;
		const curr = depositionPasses[i]!;
		const isLayerBreak = curr.layerIndex > prev.layerIndex;
		const gap = isLayerBreak ? 0.24 * meanPassCost : 0.085 * meanPassCost;
		gapCosts[i] = gap;
		gapCostSum += gap;
	}

	const maxGapBudget = 0.26 * (passCostSum + gapCostSum);
	const gapScale = gapCostSum > maxGapBudget && gapCostSum > 0 ? maxGapBudget / gapCostSum : 1;
	const totalWeight = passCostSum + gapCostSum * gapScale;
	const totalRevealSpan = 0.985;

	const passWindows: PassScheduleWindow[] = [];
	const primitives: ScheduledPrimitive[] = [];

	let cursorWeight = 0;
	for (let i = 0; i < passCount; i++) {
		const pass = depositionPasses[i]!;
		if (i > 0) {
			cursorWeight += gapCosts[i]! * gapScale;
		}
		const startProgress = (cursorWeight / totalWeight) * totalRevealSpan;
		cursorWeight += passCosts[i]!;
		const endProgress = (cursorWeight / totalWeight) * totalRevealSpan;

		const n = pass.pointCount;
		const segCount = Math.max(0, n - 1);
		const segCumCosts = new Float64Array(segCount + 1);
		let segTotal = 0;
		for (let k = 1; k < n; k++) {
			const ds = Math.max(0.5, pass.arcLength[k]! - pass.arcLength[k - 1]!);
			const spd = Math.max(0.22, pass.globalSpeedNorm[k]!);
			const dw = pass.dwell[k]!;
			segTotal += (ds / spd) * (1 + 0.55 * dw);
			segCumCosts[k] = segTotal;
		}
		if (segTotal <= 0) segTotal = 1;

		const passSpan = Math.max(1e-5, endProgress - startProgress);
		const sampleRevealTime = (sampleIdx: number): number => {
			const clampedIdx = clamp(sampleIdx, 0, segCount);
			const frac = segCumCosts[clampedIdx]! / segTotal;
			return startProgress + frac * passSpan;
		};

		const passPrims: ScheduledPrimitive[] = [];
		for (let k = 0; k < segCount; k++) {
			const x0 = pass.x[k]!;
			const y0 = pass.y[k]!;
			const r0 = pass.halfWidth[k]!;
			const h0 = pass.thickness[k]!;
			const x1 = pass.x[k + 1]!;
			const y1 = pass.y[k + 1]!;
			const r1 = pass.halfWidth[k + 1]!;
			const h1 = pass.thickness[k + 1]!;
			const rMax = Math.max(r0, r1) + 2;
			const revealAt = sampleRevealTime(k + 1);
			passPrims.push({
				kind: 'segment',
				passOrderIndex: i,
				passIndex: pass.passIndex,
				layerIndex: pass.layerIndex,
				pigmentKey: pass.pigmentKey,
				revealAt,
				x0,
				y0,
				r0,
				h0,
				x1,
				y1,
				r1,
				h1,
				minX: Math.min(x0, x1) - rMax,
				minY: Math.min(y0, y1) - rMax,
				maxX: Math.max(x0, x1) + rMax,
				maxY: Math.max(y0, y1) + rMax
			});
		}

		for (const pool of pass.pools) {
			const rBound = pool.radius * (1 + pool.h2 + pool.h3) + 2;
			const revealAt = Math.min(endProgress, sampleRevealTime(pool.sampleIndex) + 1e-6);
			passPrims.push({
				kind: 'pool',
				passOrderIndex: i,
				passIndex: pass.passIndex,
				layerIndex: pass.layerIndex,
				pigmentKey: pass.pigmentKey,
				revealAt,
				x: pool.x,
				y: pool.y,
				radius: pool.radius,
				thickness: pool.thickness,
				lobeCount: pool.lobeCount,
				h2: pool.h2,
				h3: pool.h3,
				p2: pool.p2,
				p3: pool.p3,
				minX: pool.x - rBound,
				minY: pool.y - rBound,
				maxX: pool.x + rBound,
				maxY: pool.y + rBound
			});
		}

		for (const drop of pass.droplets) {
			const rBound = Math.max(drop.rx, drop.ry) * 1.15 + 2;
			const revealAt = Math.min(endProgress, sampleRevealTime(drop.sampleIndex) + 2e-6);
			passPrims.push({
				kind: 'droplet',
				passOrderIndex: i,
				passIndex: pass.passIndex,
				layerIndex: pass.layerIndex,
				pigmentKey: pass.pigmentKey,
				revealAt,
				x: drop.x,
				y: drop.y,
				rx: drop.rx,
				ry: drop.ry,
				cosA: drop.cosA,
				sinA: drop.sinA,
				thickness: drop.thickness,
				minX: drop.x - rBound,
				minY: drop.y - rBound,
				maxX: drop.x + rBound,
				maxY: drop.y + rBound
			});
		}

		// Sort primitives within pass by revealAt (preserving deterministic segment/pool/droplet order on ties)
		passPrims.sort((a, b) => a.revealAt - b.revealAt);

		// Frame-1 visibility guarantee for pass 0 (even at paintingTime = 20s, t = 0.015s -> p = 0.00075)
		if (i === 0 && passPrims.length > 0) {
			const earlyLimit = Math.min(6, passPrims.length);
			for (let m = 0; m < earlyLimit; m++) {
				const targetEarly = Math.min(passPrims[m]!.revealAt, 0.00005 * (m + 1));
				passPrims[m] = { ...passPrims[m]!, revealAt: targetEarly };
			}
			for (let m = 1; m < passPrims.length; m++) {
				if (passPrims[m]!.revealAt < passPrims[m - 1]!.revealAt) {
					passPrims[m] = { ...passPrims[m]!, revealAt: passPrims[m - 1]!.revealAt };
				}
			}
		}

		const primitiveStartIndex = primitives.length;
		for (const prim of passPrims) {
			primitives.push(prim);
		}
		const primitiveEndIndex = primitives.length;

		passWindows.push({
			passOrderIndex: i,
			passIndex: pass.passIndex,
			layerIndex: pass.layerIndex,
			pigmentKey: pass.pigmentKey,
			startProgress,
			endProgress,
			primitiveStartIndex,
			primitiveEndIndex
		});
	}

	return {
		seed: safeSeed,
		durationSeconds,
		passWindows,
		primitives
	};
}
