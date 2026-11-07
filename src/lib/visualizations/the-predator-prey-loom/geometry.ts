import type { TrajectorySample } from './types.ts';

export interface ViewportBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PhaseScaleBounds {
	maxPrey: number;
	maxPredator: number;
}

export interface ScreenPoint {
	x: number;
	y: number;
	time: number;
	prey: number;
	predator: number;
}

export interface DirectionArrowGlyph {
	x: number;
	y: number;
	angleDeg: number;
	time: number;
}

export interface RibbonSegmentPaths {
	centrePath: string;
	preyEdgePath: string;
	predatorEdgePath: string;
	arrows: DirectionArrowGlyph[];
}

export function mapPhaseToScreen(
	prey: number,
	predator: number,
	plotBox: ViewportBox,
	bounds: PhaseScaleBounds
): { x: number; y: number } {
	const nx = Math.max(0, Math.min(1.15, prey / bounds.maxPrey));
	const ny = Math.max(0, Math.min(1.15, predator / bounds.maxPredator));
	return {
		x: plotBox.x + nx * plotBox.width,
		y: plotBox.y + plotBox.height - ny * plotBox.height
	};
}

export function mapTimeValueToScreen(
	time: number,
	value: number,
	duration: number,
	maxValue: number,
	plotBox: ViewportBox
): { x: number; y: number } {
	const tx = Math.max(0, Math.min(1, time / Math.max(1e-6, duration)));
	const vy = Math.max(0, Math.min(1.15, value / Math.max(1e-6, maxValue)));
	return {
		x: plotBox.x + tx * plotBox.width,
		y: plotBox.y + plotBox.height - vy * plotBox.height
	};
}

function pointsToSvgPath(pts: Array<{ x: number; y: number }>): string {
	if (pts.length === 0) return '';
	const parts = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
	for (let i = 1; i < pts.length; i++) {
		parts.push(`L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`);
	}
	return parts.join(' ');
}

/**
 * Builds the phase-portrait centreline and two constant-display-width parallel edge paths
 * (one for the subtle mint-green prey edge, one for the subtle warm-amber predator edge),
 * plus sparse direction arrows along the trajectory.
 */
export function buildPhaseRibbonPaths(
	samples: TrajectorySample[],
	plotBox: ViewportBox,
	bounds: PhaseScaleBounds,
	options: {
		edgeOffsetPx?: number;
		arrowSpacingPx?: number;
		decimateEvery?: number;
	} = {}
): RibbonSegmentPaths {
	const edgeOffsetPx = options.edgeOffsetPx ?? 2.2;
	const arrowSpacingPx = options.arrowSpacingPx ?? 145;
	const decimateEvery = options.decimateEvery ?? 2;

	if (samples.length === 0) {
		return { centrePath: '', preyEdgePath: '', predatorEdgePath: '', arrows: [] };
	}

	const screenPts: ScreenPoint[] = [];
	for (let i = 0; i < samples.length; i += decimateEvery) {
		const s = samples[i];
		const pt = mapPhaseToScreen(s.prey, s.predator, plotBox, bounds);
		if (
			screenPts.length === 0 ||
			Math.hypot(
				pt.x - screenPts[screenPts.length - 1].x,
				pt.y - screenPts[screenPts.length - 1].y
			) >= 0.65 ||
			i === samples.length - 1
		) {
			screenPts.push({
				x: pt.x,
				y: pt.y,
				time: s.time,
				prey: s.prey,
				predator: s.predator
			});
		}
	}
	const lastSample = samples[samples.length - 1];
	const lastPt = mapPhaseToScreen(lastSample.prey, lastSample.predator, plotBox, bounds);
	if (screenPts.length === 0 || screenPts[screenPts.length - 1].time !== lastSample.time) {
		screenPts.push({
			x: lastPt.x,
			y: lastPt.y,
			time: lastSample.time,
			prey: lastSample.prey,
			predator: lastSample.predator
		});
	}

	if (screenPts.length === 1) {
		const p = screenPts[0];
		const dot = `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${(p.x + 0.1).toFixed(2)} ${p.y.toFixed(2)}`;
		return { centrePath: dot, preyEdgePath: dot, predatorEdgePath: dot, arrows: [] };
	}

	const leftPts: Array<{ x: number; y: number }> = [];
	const rightPts: Array<{ x: number; y: number }> = [];
	const arrows: DirectionArrowGlyph[] = [];
	let accumDist = 0;
	let nextArrowDist = arrowSpacingPx * 0.48;

	for (let i = 0; i < screenPts.length; i++) {
		const pPrev = screenPts[Math.max(0, i - 1)];
		const pNext = screenPts[Math.min(screenPts.length - 1, i + 1)];
		const dx = pNext.x - pPrev.x;
		const dy = pNext.y - pPrev.y;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;

		leftPts.push({
			x: screenPts[i].x + nx * edgeOffsetPx,
			y: screenPts[i].y + ny * edgeOffsetPx
		});
		rightPts.push({
			x: screenPts[i].x - nx * edgeOffsetPx,
			y: screenPts[i].y - ny * edgeOffsetPx
		});

		if (i > 0) {
			const stepDx = screenPts[i].x - screenPts[i - 1].x;
			const stepDy = screenPts[i].y - screenPts[i - 1].y;
			const stepLen = Math.hypot(stepDx, stepDy);
			accumDist += stepLen;
			if (accumDist >= nextArrowDist && stepLen > 0.35 && arrows.length < 7) {
				const angleDeg = (Math.atan2(stepDy, stepDx) * 180) / Math.PI;
				arrows.push({
					x: screenPts[i].x,
					y: screenPts[i].y,
					angleDeg,
					time: screenPts[i].time
				});
				nextArrowDist = accumDist + arrowSpacingPx;
			}
		}
	}

	return {
		centrePath: pointsToSvgPath(screenPts),
		preyEdgePath: pointsToSvgPath(leftPts),
		predatorEdgePath: pointsToSvgPath(rightPts),
		arrows
	};
}

export function buildTimeSeriesPath(
	samples: TrajectorySample[],
	accessor: (s: TrajectorySample) => number,
	duration: number,
	maxValue: number,
	plotBox: ViewportBox,
	decimateEvery = 2
): string {
	if (samples.length === 0) return '';
	const pts: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < samples.length; i += decimateEvery) {
		pts.push(
			mapTimeValueToScreen(samples[i].time, accessor(samples[i]), duration, maxValue, plotBox)
		);
	}
	const last = samples[samples.length - 1];
	pts.push(mapTimeValueToScreen(last.time, accessor(last), duration, maxValue, plotBox));
	return pointsToSvgPath(pts);
}
