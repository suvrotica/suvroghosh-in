import { hashMarkSigned, hashMarkUnit } from './prng.ts';
import type { ColoredMark, ScheduledMark } from './types.ts';

/**
 * Maps Dot size (0..100, default 40) to logical semi-minor dab radius on a 1200x800 artboard.
 * Preserves every mark's exact center (x, y) while scaling its footprint.
 */
export function computeLogicalBaseRadius(dotSize: number): number {
	const t = Math.max(0, Math.min(100, dotSize)) / 100;
	// 0% -> 2.15 logical units; 40% (default) -> 4.25 logical units; 72% -> 6.65; 100% -> 9.2
	return 2.15 + Math.pow(t, 1.18) * 7.05;
}

/**
 * Assigns each active mark to one of 4 coherent painting passes and builds a single
 * deterministic compositing + reveal schedule:
 * - Pass 0 [0.010, 0.250]: Broadly distributed composition skeleton across the entire artboard.
 * - Pass 1 [0.250, 0.560]: Midground & background forms (including any background marks near closer silhouettes).
 * - Pass 2 [0.560, 0.865]: Foreground people, garments, props, water reflections, and crisp boundaries.
 * - Pass 3 [0.865, 0.985]: Final sunlit accents, foliage highlights, and focal details.
 *
 * Because `revealAt` is strictly non-decreasing along the final compositing order,
 * progressive playback, Pause/Resume, Finish now, still previews, and high-resolution PNG
 * exports produce the exact same overlapping mark order.
 */
export function buildPaintSchedule(
	coloredMarks: readonly ColoredMark[],
	seed: number,
	dotSize: number
): ScheduledMark[] {
	const baseRadius = computeLogicalBaseRadius(dotSize);
	const count = coloredMarks.length;

	const keyed = new Array<{
		pass: 0 | 1 | 2 | 3;
		withinPassOrder: number;
		depthTie: number;
		colored: ColoredMark;
	}>(count);

	for (let i = 0; i < count; i++) {
		const cm = coloredMarks[i]!;
		const cand = cm.candidate;
		const id = cand.id;
		const revealRand = hashMarkUnit(seed, 'reveal', id, 0);
		const passSelector = hashMarkUnit(seed, 'reveal', id, 1);

		const isNearCloserForeground = cand.depth - cand.minNeighborDepth > 0.04;
		const isFigureOrProp = cand.categoryIndex >= 15;
		const isForegroundStructure =
			(cand.categoryIndex === 9 || cand.categoryIndex === 12 || cand.categoryIndex === 13) &&
			cand.depth < 0.45;
		const isBrightAccent =
			cand.lit > 0.83 &&
			(cand.isFocalRegion || cand.boundary > 0.38 || cand.categoryIndex === 5 || cand.categoryIndex === 10) &&
			!isNearCloserForeground;

		let pass: 0 | 1 | 2 | 3;
		if (isNearCloserForeground) {
			// Background marks adjacent to closer foreground figures/structures always paint in early passes
			// so foreground silhouettes composite cleanly on top without sticker clipping!
			pass = passSelector < 0.35 ? 0 : 1;
		} else if (isFigureOrProp || isForegroundStructure) {
			// Early sparse figure anchors (~16% interior marks) let people start emerging early;
			// main figure body & crisp silhouette edges land in Pass 2 & Pass 3.
			if (cand.boundary < 0.25 && passSelector < 0.16) {
				pass = 1;
			} else if (isBrightAccent && passSelector > 0.72) {
				pass = 3;
			} else {
				pass = 2;
			}
		} else if (isBrightAccent && passSelector > 0.78) {
			pass = 3;
		} else if (cand.boundary > 0.42 && !isNearCloserForeground) {
			pass = passSelector < 0.25 ? 1 : 2;
		} else {
			// General sky, trees, water, walls, terrain, paths distributed across Passes 0, 1, 2
			if (i < count * 0.22 && passSelector < 0.72) {
				pass = 0;
			} else if (passSelector < 0.64) {
				pass = 1;
			} else {
				pass = 2;
			}
		}

		// Within Pass 2, bias slightly back-to-front while keeping whole-canvas spatial distribution
		const withinPassOrder =
			pass === 2 ? (1 - cand.depth) * 0.28 + revealRand * 0.72 : revealRand;

		keyed[i] = {
			pass,
			withinPassOrder,
			depthTie: 1 - cand.depth,
			colored: cm
		};
	}

	keyed.sort(
		(a, b) =>
			a.pass - b.pass ||
			a.withinPassOrder - b.withinPassOrder ||
			a.depthTie - b.depthTie ||
			a.colored.candidate.id - b.colored.candidate.id
	);

	const passRanges: readonly (readonly [number, number])[] = [
		[0.01, 0.25],
		[0.25, 0.56],
		[0.56, 0.865],
		[0.865, 0.985]
	];

	const passCounts = [0, 0, 0, 0];
	for (const item of keyed) passCounts[item.pass]!++;
	const passSeen = [0, 0, 0, 0];

	const scheduled = new Array<ScheduledMark>(count);
	for (let idx = 0; idx < count; idx++) {
		const item = keyed[idx]!;
		const p = item.pass;
		const localIdx = passSeen[p]!++;
		const pTotal = Math.max(1, passCounts[p]!);
		const [t0, t1] = passRanges[p]!;
		const frac = (localIdx + 0.5) / pTotal;
		const revealAt = t0 + (t1 - t0) * frac;

		const cm = item.colored;
		const cand = cm.candidate;
		const id = cand.id;

		const ry = Math.max(0.95, baseRadius * cand.baseRadiusFactor);
		const rx = Math.max(ry, ry * cand.aspect);
		const cosA = Math.cos(cand.angleRad);
		const sinA = Math.sin(cand.angleRad);

		// Deterministic surface texture parameters from isolated 'texture' PRNG stream
		const edgeH1 = hashMarkSigned(seed, 'texture', id, 0) * 0.11;
		const edgeH2 = hashMarkSigned(seed, 'texture', id, 1) * 0.085;
		const edgeH3 = hashMarkSigned(seed, 'texture', id, 2) * 0.055;
		const edgePhase1 = hashMarkUnit(seed, 'texture', id, 3) * Math.PI * 2;
		const edgePhase2 = hashMarkUnit(seed, 'texture', id, 4) * Math.PI * 2;
		const bristlePhase = hashMarkUnit(seed, 'texture', id, 5) * Math.PI * 2;
		const opacityBase = 0.935 + hashMarkUnit(seed, 'texture', id, 6) * 0.055;
		const impasto = 0.65 + hashMarkUnit(seed, 'texture', id, 7) * 0.55;

		scheduled[idx] = {
			id,
			x: cand.x,
			y: cand.y,
			rx,
			ry,
			cosA,
			sinA,
			r: cm.r,
			g: cm.g,
			b: cm.b,
			rimR: cm.rimR,
			rimG: cm.rimG,
			rimB: cm.rimB,
			depth: cand.depth,
			minNeighborDepth: cand.minNeighborDepth,
			objectId: cand.objectId,
			pass: p,
			revealAt,
			edgeH1,
			edgeH2,
			edgeH3,
			edgePhase1,
			edgePhase2,
			bristlePhase,
			opacityBase,
			impasto
		};
	}

	return scheduled;
}
