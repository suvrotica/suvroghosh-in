import { generateCandidateHierarchy, computeActiveMarkCount } from './sampling.ts';
import { assignMarkColors } from './palette.ts';
import { buildSceneModel, describeSceneAccessible } from './scene.ts';
import { buildPaintSchedule } from './timeline.ts';
import { mix32 } from './prng.ts';
import type {
	CropRect,
	PaintingModel,
	PointillismState,
	SceneModel,
	ScheduledMark
} from './types.ts';

function fastParabolicSin(phaseCycles: number): number {
	let frac = phaseCycles - Math.floor(phaseCycles);
	if (frac < 0) frac += 1;
	if (frac < 0.5) {
		return 16 * frac * (0.5 - frac);
	}
	const u = frac - 0.5;
	return -16 * u * (0.5 - u);
}

function hashGridCorner(seed: number, cx: number, cy: number, channel: number): number {
	const h = mix32(
		(seed ^
			Math.imul(cx, 0x27d4eb2d) ^
			Math.imul(cy, 0x165667b1) ^
			Math.imul(channel + 7, 0x9e3779b9)) >>>
			0
	);
	return h / 4294967296;
}

/**
 * Renders a quiet, fully covered primed linen ground in logical painting coordinates.
 * Contains subtle tonal warmth and canvas weave, never hidden scene forms.
 */
export function renderCanvasGround(
	pixels: Uint8ClampedArray,
	outWidth: number,
	outHeight: number,
	crop: CropRect,
	scene: SceneModel,
	paintTexture: number
): void {
	const texNorm = Math.max(0, Math.min(100, paintTexture)) / 100;
	const weaveAmp = 1.4 + texNorm * 4.4;
	const mottleAmp = 3.2 + texNorm * 3.0;

	const invScaleX = crop.width / Math.max(1, outWidth);
	const invScaleY = crop.height / Math.max(1, outHeight);
	const artH = Math.max(1, scene.artboardHeight);
	const seed = scene.seed;

	const [warmR, warmG, warmB] = scene.groundSkyWarmthRgb;
	const [earthR, earthG, earthB] = scene.groundTintRgb;

	// Precompute X logical positions, coarse noise interpolation, and linen warp profile
	const lxArr = new Float64Array(outWidth);
	const warpArr = new Float32Array(outWidth);
	const xiArr = new Int32Array(outWidth);
	const uxArr = new Float32Array(outWidth);

	for (let px = 0; px < outWidth; px++) {
		const lx = crop.x + (px + 0.5) * invScaleX;
		lxArr[px] = lx;
		const nx = lx / 118;
		const xi = Math.floor(nx);
		const xf = nx - xi;
		xiArr[px] = xi;
		uxArr[px] = xf * xf * (3 - 2 * xf);

		const w1 = fastParabolicSin(lx / 3.25 + 0.13);
		const w2 = fastParabolicSin(lx / 7.9 + 0.41);
		warpArr[px] = (w1 * 0.68 + w2 * 0.32) * weaveAmp;
	}

	for (let py = 0; py < outHeight; py++) {
		const ly = crop.y + (py + 0.5) * invScaleY;
		const vertT = Math.max(0, Math.min(1, ly / artH));

		const baseR = warmR + (earthR - warmR) * vertT;
		const baseG = warmG + (earthG - warmG) * vertT;
		const baseB = warmB + (earthB - warmB) * vertT;

		const ny = ly / 118;
		const yi = Math.floor(ny);
		const yf = ny - yi;
		const vy = yf * yf * (3 - 2 * yf);

		const h1 = fastParabolicSin(ly / 3.4 + 0.29);
		const h2 = fastParabolicSin(ly / 8.3 + 0.67);
		const weft = (h1 * 0.68 + h2 * 0.32) * weaveAmp * 0.88;

		let cachedXi = -2147483648;
		let col0 = 0;
		let col1 = 0;

		let idx = py * outWidth * 4;
		for (let px = 0; px < outWidth; px++) {
			const xi = xiArr[px]!;
			if (xi !== cachedXi) {
				cachedXi = xi;
				const n00 = hashGridCorner(seed, xi, yi, 1);
				const n10 = hashGridCorner(seed, xi + 1, yi, 1);
				const n01 = hashGridCorner(seed, xi, yi + 1, 1);
				const n11 = hashGridCorner(seed, xi + 1, yi + 1, 1);
				col0 = n00 + (n01 - n00) * vy;
				col1 = n10 + (n11 - n10) * vy;
			}
			const mottle = (col0 + (col1 - col0) * uxArr[px]! - 0.5) * 2 * mottleAmp;
			// Interleaved linen crossing relief
			const threadDelta = (warpArr[px]! + weft) * 0.52 + mottle;

			const r = Math.max(0, Math.min(255, Math.round(baseR + threadDelta)));
			const g = Math.max(0, Math.min(255, Math.round(baseG + threadDelta * 0.96)));
			const b = Math.max(0, Math.min(255, Math.round(baseB + threadDelta * 0.88)));

			pixels[idx] = r;
			pixels[idx + 1] = g;
			pixels[idx + 2] = b;
			pixels[idx + 3] = 255;
			idx += 4;
		}
	}
}

/**
 * Stamps a single matte oil-paint dab in logical painting coordinates onto an RGBA pixel buffer.
 * Uses irregular 3-harmonic polar contour, subtle intra-dab pigment shift, restrained bristle
 * relief, and matte directional top-left raking light without glossy highlights.
 */
export function stampDab(
	pixels: Uint8ClampedArray,
	outWidth: number,
	outHeight: number,
	crop: CropRect,
	mark: ScheduledMark,
	paintTexture: number
): void {
	const scaleX = outWidth / crop.width;
	const scaleY = outHeight / crop.height;
	const scaleAvg = 0.5 * (scaleX + scaleY);

	const texNorm = Math.max(0, Math.min(100, paintTexture)) / 100;
	const contourStrength = 0.25 + texNorm * 0.95;

	const maxLogicalR = Math.max(mark.rx, mark.ry) * (1 + 0.26 * contourStrength) + 1.35 / scaleAvg;

	if (
		mark.x + maxLogicalR < crop.x ||
		mark.x - maxLogicalR > crop.x + crop.width ||
		mark.y + maxLogicalR < crop.y ||
		mark.y - maxLogicalR > crop.y + crop.height
	) {
		return;
	}

	const minPx = Math.max(0, Math.floor((mark.x - maxLogicalR - crop.x) * scaleX));
	const maxPx = Math.min(outWidth - 1, Math.ceil((mark.x + maxLogicalR - crop.x) * scaleX));
	const minPy = Math.max(0, Math.floor((mark.y - maxLogicalR - crop.y) * scaleY));
	const maxPy = Math.min(outHeight - 1, Math.ceil((mark.y + maxLogicalR - crop.y) * scaleY));

	if (minPx > maxPx || minPy > maxPy) return;

	const invScaleX = 1 / scaleX;
	const invScaleY = 1 / scaleY;
	const invRx = 1 / Math.max(0.45, mark.rx);
	const invRy = 1 / Math.max(0.45, mark.ry);

	// Soft oil-edge anti-aliasing width in normalized dab radius units (~1.1 output pixels)
	const featherNorm = Math.min(0.38, Math.max(0.035, 1.12 / (Math.min(mark.rx, mark.ry) * scaleAvg)));

	const cosP1 = Math.cos(mark.edgePhase1);
	const sinP1 = Math.sin(mark.edgePhase1);
	const cosP2 = Math.cos(mark.edgePhase2);
	const sinP2 = Math.sin(mark.edgePhase2);

	const h1 = mark.edgeH1 * contourStrength;
	const h2 = mark.edgeH2 * contourStrength;
	const h3 = mark.edgeH3 * contourStrength;

	const bristleAmp = texNorm * 6.8 * mark.impasto;
	const reliefAmp = (2.2 + texNorm * 6.5) * mark.impasto;
	const bristleCycleOffset = mark.bristlePhase / (Math.PI * 2);

	// Light direction in dab-local (u, v) frame from upper-left (-0.68, -0.73)
	const lightLocalU = -0.68 * mark.cosA - 0.73 * mark.sinA;
	const lightLocalV = 0.68 * mark.sinA - 0.73 * mark.cosA;

	const cosA = mark.cosA;
	const sinA = mark.sinA;
	const baseOpacity = mark.opacityBase;

	const centerR = mark.r;
	const centerG = mark.g;
	const centerB = mark.b;
	const deltaRimR = mark.rimR - centerR;
	const deltaRimG = mark.rimG - centerG;
	const deltaRimB = mark.rimB - centerB;

	for (let py = minPy; py <= maxPy; py++) {
		const ly = crop.y + (py + 0.5) * invScaleY;
		const dy = ly - mark.y;
		const rowOffset = py * outWidth * 4;

		for (let px = minPx; px <= maxPx; px++) {
			const lx = crop.x + (px + 0.5) * invScaleX;
			const dx = lx - mark.x;

			const u = (dx * cosA + dy * sinA) * invRx;
			const v = (-dx * sinA + dy * cosA) * invRy;
			const r2 = u * u + v * v;
			if (r2 > 1.65) continue;

			const rNorm = Math.sqrt(r2);
			let contourR = 1.0;
			if (rNorm > 1e-5) {
				const ca = u / rNorm;
				const sa = v / rNorm;
				const c2 = ca * ca - sa * sa;
				const s2 = 2 * ca * sa;
				const c3 = ca * c2 - sa * s2;
				const s3 = sa * c2 + ca * s2;

				const term1 = h1 * (ca * cosP1 - sa * sinP1);
				const term2 = h2 * (c2 * cosP2 - s2 * sinP2);
				const term3 = h3 * (c3 * cosP1 + s3 * sinP1);
				contourR = 1.0 + term1 + term2 + term3;
			}

			const outerEdge = contourR + featherNorm * 0.5;
			if (rNorm >= outerEdge) continue;

			const innerEdge = contourR - featherNorm * 0.5;
			let edgeCoverage = 1.0;
			if (rNorm > innerEdge) {
				const t = (outerEdge - rNorm) / Math.max(1e-5, featherNorm);
				edgeCoverage = t * t * (3 - 2 * t);
			}

			const alpha = baseOpacity * edgeCoverage;
			if (alpha <= 0.004) continue;

			// Intra-dab pigment variation (unmixed oil body toward rim + slight longitudinal shift)
			const radialFrac = Math.min(1, rNorm / Math.max(0.5, contourR));
			const rimMix = Math.max(0, Math.min(1, radialFrac * radialFrac * 0.72 + (u * 0.5 + 0.5) * 0.28));

			// Subtle directional bristle micro-grooves along stroke axis + matte impasto shoulder relief
			const bristleWave = fastParabolicSin(v * 1.65 + bristleCycleOffset) * bristleAmp * (1 - radialFrac * 0.35);
			const slopeRelief = (u * lightLocalU + v * lightLocalV) * radialFrac * reliefAmp;
			const totalToneShift = bristleWave + slopeRelief;

			const dabR = centerR + deltaRimR * rimMix + totalToneShift;
			const dabG = centerG + deltaRimG * rimMix + totalToneShift * 0.97;
			const dabB = centerB + deltaRimB * rimMix + totalToneShift * 0.92;

			const idx = rowOffset + px * 4;
			const invAlpha = 1 - alpha;

			const outR = pixels[idx]! * invAlpha + dabR * alpha;
			const outG = pixels[idx + 1]! * invAlpha + dabG * alpha;
			const outB = pixels[idx + 2]! * invAlpha + dabB * alpha;

			pixels[idx] = outR <= 0 ? 0 : outR >= 255 ? 255 : Math.round(outR);
			pixels[idx + 1] = outG <= 0 ? 0 : outG >= 255 ? 255 : Math.round(outG);
			pixels[idx + 2] = outB <= 0 ? 0 : outB >= 255 ? 255 : Math.round(outB);
			pixels[idx + 3] = 255;
		}
	}
}

/**
 * Builds the complete deterministic PaintingModel from a normalized PointillismState.
 * Reuses cached SceneModel and CandidateHierarchy whenever seed, sceneFamily, and artboard
 * dimensions are unchanged, so painting knobs never rebuild or reroll the underlying scene.
 */
export function buildPaintingModel(state: PointillismState): PaintingModel {
	const scene = buildSceneModel(
		state.seed,
		state.sceneFamily,
		state.artboardWidth,
		state.artboardHeight
	);
	const hierarchy = generateCandidateHierarchy(scene);
	const activeCount = computeActiveMarkCount(hierarchy.candidates.length, state.dotSpacing);
	const coloredMarks = assignMarkColors(
		hierarchy.candidates,
		activeCount,
		state.seed,
		state.paletteContrast,
		state.colorVariation
	);
	const scheduledMarks = buildPaintSchedule(coloredMarks, state.seed, state.dotSize);
	const description = describeSceneAccessible(scene, scheduledMarks.length);

	return {
		state,
		scene,
		hierarchy,
		activeCount,
		scheduledMarks,
		description
	};
}

/**
 * Renders any logical crop (either the entire artboard or an Inspect-dots close-up)
 * from the exact same ScheduledMark[] population and logical canvas ground.
 */
export function renderPaintingCrop(
	model: PaintingModel,
	crop: CropRect,
	outWidth: number,
	outHeight: number,
	maxMarks = model.scheduledMarks.length
): Uint8ClampedArray {
	const w = Math.max(1, Math.round(outWidth));
	const h = Math.max(1, Math.round(outHeight));
	const pixels = new Uint8ClampedArray(w * h * 4);

	renderCanvasGround(pixels, w, h, crop, model.scene, model.state.paintTexture);

	const limit = Math.max(0, Math.min(maxMarks, model.scheduledMarks.length));
	const marks = model.scheduledMarks;
	const tex = model.state.paintTexture;

	for (let i = 0; i < limit; i++) {
		stampDab(pixels, w, h, crop, marks[i]!, tex);
	}

	return pixels;
}

/**
 * Incremental buffer used during progressive playback so Pause, Resume, Finish now,
 * and natural completion stamp the exact same marks in the exact same order as still renders
 * and offscreen exports.
 */
export class ProgressivePaintingBuffer {
	readonly width: number;
	readonly height: number;
	readonly crop: CropRect;
	readonly pixels: Uint8ClampedArray;
	private readonly marks: readonly ScheduledMark[];
	private readonly paintTexture: number;
	private cursor = 0;

	constructor(model: PaintingModel, outWidth: number, outHeight: number, crop?: CropRect) {
		this.width = Math.max(1, Math.round(outWidth));
		this.height = Math.max(1, Math.round(outHeight));
		this.crop = crop ?? {
			x: 0,
			y: 0,
			width: model.state.artboardWidth,
			height: model.state.artboardHeight
		};
		this.pixels = new Uint8ClampedArray(this.width * this.height * 4);
		this.marks = model.scheduledMarks;
		this.paintTexture = model.state.paintTexture;

		renderCanvasGround(
			this.pixels,
			this.width,
			this.height,
			this.crop,
			model.scene,
			this.paintTexture
		);
	}

	getRenderedCount(): number {
		return this.cursor;
	}

	getTotalCount(): number {
		return this.marks.length;
	}

	isComplete(): boolean {
		return this.cursor >= this.marks.length;
	}

	advanceToCount(targetCount: number): number {
		const clamped = Math.max(this.cursor, Math.min(this.marks.length, Math.trunc(targetCount)));
		for (let i = this.cursor; i < clamped; i++) {
			stampDab(this.pixels, this.width, this.height, this.crop, this.marks[i]!, this.paintTexture);
		}
		this.cursor = clamped;
		return this.cursor;
	}

	advanceToProgress(progress: number): number {
		if (progress >= 1) {
			return this.finishAll();
		}
		if (progress <= 0) {
			return this.cursor;
		}
		// Binary search first mark with revealAt > progress
		let lo = this.cursor;
		let hi = this.marks.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.marks[mid]!.revealAt <= progress) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return this.advanceToCount(lo);
	}

	finishAll(): number {
		return this.advanceToCount(this.marks.length);
	}
}
