import {
	buildActiveRegions,
	buildCanonicalRegions,
	buildGlazePasses,
	computePaintingFocalPoint,
	createRegionMaskContext,
	evaluateRegionMaskFast,
	type RegionMaskContext
} from './fields.ts';
import { createStreamRng, normalizeSeed, smoothNoise2DFast, STREAM_SALTS } from './prng.ts';
import { normalizeState } from './state.ts';
import {
	describePaintingAccessible,
	linearToSrgbByteFast,
	srgbToLinear,
	STUDY_BY_ID
} from './studies.ts';
import { buildTimeline } from './timeline.ts';
import {
	BOUNDS,
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_CANVAS_TEXTURE,
	type ColorFieldState,
	type ColorRegion,
	type CropRect,
	type PaintingMetrics,
	type PaintingModel,
	type RegionMetricSummary,
	type ScheduledSwath,
	type StillRenderResult
} from './types.ts';

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

function sanitizeDimension(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.max(1, Math.round(value))
		: fallback;
}

function sanitizeCrop(
	crop: CropRect | undefined,
	artboardWidth: number,
	artboardHeight: number
): CropRect {
	if (!crop) {
		return { x: 0, y: 0, width: artboardWidth, height: artboardHeight };
	}
	return {
		x: Number.isFinite(crop.x) ? crop.x : 0,
		y: Number.isFinite(crop.y) ? crop.y : 0,
		width: Number.isFinite(crop.width) && crop.width > 0 ? crop.width : artboardWidth,
		height: Number.isFinite(crop.height) && crop.height > 0 ? crop.height : artboardHeight
	};
}

interface PixelBounds {
	minPx: number;
	minPy: number;
	maxPx: number;
	maxPy: number;
}

function createEmptyBounds(): PixelBounds {
	return {
		minPx: Infinity,
		minPy: Infinity,
		maxPx: -Infinity,
		maxPy: -Infinity
	};
}

function expandBounds(bounds: PixelBounds, x0: number, y0: number, x1: number, y1: number): void {
	if (x0 < bounds.minPx) bounds.minPx = x0;
	if (y0 < bounds.minPy) bounds.minPy = y0;
	if (x1 > bounds.maxPx) bounds.maxPx = x1;
	if (y1 > bounds.maxPy) bounds.maxPy = y1;
}

function isBoundsNonEmpty(bounds: PixelBounds): boolean {
	return bounds.minPx <= bounds.maxPx && bounds.minPy <= bounds.maxPy;
}

export function buildPaintingModel(stateInput: ColorFieldState): PaintingModel {
	const state = normalizeState(stateInput);
	const study = Object.prototype.hasOwnProperty.call(STUDY_BY_ID, state.studyId)
		? STUDY_BY_ID[state.studyId]
		: STUDY_BY_ID['rothko-nocturne'];

	const canonicalRegions = buildCanonicalRegions(
		state.seed,
		state.studyId,
		state.artboardWidth,
		state.artboardHeight
	);
	const regions = buildActiveRegions(canonicalRegions, state);
	const glazePasses = buildGlazePasses(regions, state);
	const timeline = buildTimeline({ glazePasses, state }, state.paintingTime);
	const focalPoint = computePaintingFocalPoint(regions, state.artboardWidth, state.artboardHeight);

	const draftModel: PaintingModel = {
		state,
		study,
		groundBaseRgb: study.groundBaseRgb,
		canonicalRegions,
		regions,
		glazePasses,
		timeline,
		focalPoint,
		description: ''
	};

	return {
		...draftModel,
		description: describePaintingAccessible(state, draftModel)
	};
}

class SurfaceRasterizer {
	readonly width: number;
	readonly height: number;
	readonly crop: CropRect;
	readonly seed: number;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly texAmount: number;
	readonly edgeSoftness: number;
	readonly edgeFactor: number;
	readonly noiseFactor: number;
	readonly transparencyNorm: number;
	readonly isSoakStain: boolean;
	readonly dxLogical: number;
	readonly dyLogical: number;
	readonly avgDxLogical: number;
	readonly edgeLambda: number;
	readonly washLambda: number;
	readonly groundBaseRgb: readonly [number, number, number];

	readonly groundWeave: Float32Array;
	readonly accumLinearRgb: Float32Array;
	readonly surfaceHeight: Float32Array;
	readonly pixels: Uint8ClampedArray;
	private readonly dirtyRowMinPx: Int32Array;
	private readonly dirtyRowMaxPx: Int32Array;
	private readonly maskCtxByPass = new Map<number, RegionMaskContext>();

	constructor(model: PaintingModel, width: number, height: number, crop: CropRect) {
		const artW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
		const artH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);
		const safeCrop = sanitizeCrop(crop, artW, artH);
		this.width = sanitizeDimension(width, artW);
		this.height = sanitizeDimension(height, artH);
		this.crop = safeCrop;
		this.seed = normalizeSeed(model.state.seed);
		this.artboardWidth = artW;
		this.artboardHeight = artH;
		this.texAmount = Number.isFinite(model.state.canvasTexture)
			? clamp(model.state.canvasTexture, BOUNDS.canvasTexture.min, BOUNDS.canvasTexture.max) / 100
			: DEFAULT_CANVAS_TEXTURE / 100;
		this.edgeSoftness = clamp(
			model.state.edgeSoftness,
			BOUNDS.edgeSoftness.min,
			BOUNDS.edgeSoftness.max
		);
		const eNorm = this.edgeSoftness / 100;
		this.edgeFactor = 0.04 * eNorm + 0.34 * Math.pow(eNorm, 1.55);
		this.noiseFactor = eNorm === 0 ? 0 : 0.015 * eNorm + 0.11 * Math.pow(eNorm, 1.25);
		this.transparencyNorm =
			clamp(model.state.transparency, BOUNDS.transparency.min, BOUNDS.transparency.max) / 100;
		this.isSoakStain = model.study.archetype === 'soak-stain';
		this.dxLogical = safeCrop.width / this.width;
		this.dyLogical = safeCrop.height / this.height;
		this.avgDxLogical = (this.dxLogical + this.dyLogical) * 0.5;
		const minDim = Math.min(artW, artH);
		this.edgeLambda = Math.max(28, 0.22 * minDim);
		this.washLambda = Math.max(36, 0.28 * minDim);
		this.groundBaseRgb = model.groundBaseRgb;

		const pixelCount = this.width * this.height;
		this.groundWeave = new Float32Array(pixelCount);
		this.accumLinearRgb = new Float32Array(pixelCount * 3);
		this.surfaceHeight = new Float32Array(pixelCount);
		this.pixels = new Uint8ClampedArray(pixelCount * 4);
		this.dirtyRowMinPx = new Int32Array(this.height);
		this.dirtyRowMaxPx = new Int32Array(this.height);

		this.renderGround();
		this.dirtyRowMinPx.fill(0);
		this.dirtyRowMaxPx.fill(this.width - 1);
		this.shadeRegion({ minPx: 0, minPy: 0, maxPx: this.width - 1, maxPy: this.height - 1 });
	}

	private renderGround(): void {
		const w = this.width;
		const h = this.height;
		const total = w * h;
		const baseLR = srgbToLinear(this.groundBaseRgb[0]);
		const baseLG = srgbToLinear(this.groundBaseRgb[1]);
		const baseLB = srgbToLinear(this.groundBaseRgb[2]);

		if (this.texAmount <= 0) {
			for (let i = 0; i < total; i++) {
				const off = i * 3;
				this.accumLinearRgb[off] = baseLR;
				this.accumLinearRgb[off + 1] = baseLG;
				this.accumLinearRgb[off + 2] = baseLB;
			}
			return;
		}

		const surfRng = createStreamRng(this.seed, 'surface', 0);
		const threadVarX = new Float32Array(1024);
		const threadVarY = new Float32Array(1024);
		for (let i = 0; i < 1024; i++) {
			threadVarX[i] = surfRng.signed() * 0.18;
			threadVarY[i] = surfRng.signed() * 0.18;
		}

		const minArt = Math.min(this.artboardWidth, this.artboardHeight);
		const threadPitch = minArt / 210;
		const weaveFreq = 1 / threadPitch;
		const nyquistAtten = clamp(1 - (this.avgDxLogical / threadPitch) * 0.65, 0.15, 1.0);
		const tex = this.texAmount;

		const txArr = new Int32Array(w);
		const wcXArr = new Float32Array(w);
		const lxArr = new Float64Array(w);
		for (let px = 0; px < w; px++) {
			const lx = this.crop.x + (px + 0.5) * this.dxLogical;
			lxArr[px] = lx;
			const wxPhase = lx * weaveFreq;
			const tx = Math.floor(wxPhase);
			const fx = wxPhase - tx;
			txArr[px] = tx;
			wcXArr[px] = (4 * fx * (1 - fx) - 2 / 3) * (1 + threadVarX[tx & 1023]!);
		}

		for (let py = 0; py < h; py++) {
			const ly = this.crop.y + (py + 0.5) * this.dyLogical;
			const wyPhase = ly * weaveFreq;
			const ty = Math.floor(wyPhase);
			const fy = wyPhase - ty;
			const wcY = (4 * fy * (1 - fy) - 2 / 3) * (1 + threadVarY[ty & 1023]!);

			for (let px = 0; px < w; px++) {
				const lx = lxArr[px]!;
				const tx = txArr[px]!;
				const wcX = wcXArr[px]!;

				const overWarp = ((tx + ty) & 1) === 0;
				const weaveRaw = overWarp ? wcX * 0.72 + wcY * 0.28 : wcY * 0.72 + wcX * 0.28;
				const mottle =
					(smoothNoise2DFast(this.seed, STREAM_SALTS.surface, lx / 96, ly / 96, 1) - 0.5) * 0.75 +
					(smoothNoise2DFast(this.seed, STREAM_SALTS.surface, lx / 19, ly / 19, 2) - 0.5) * 0.25;
				const gw = (weaveRaw * 0.78 * nyquistAtten + mottle * 0.35) * tex;

				const idx = py * w + px;
				const off = idx * 3;
				this.groundWeave[idx] = gw;
				this.surfaceHeight[idx] = gw * 0.22;
				this.accumLinearRgb[off] = clamp(baseLR * (1 + gw * 0.044), 0.005, 1);
				this.accumLinearRgb[off + 1] = clamp(baseLG * (1 + gw * 0.042), 0.005, 1);
				this.accumLinearRgb[off + 2] = clamp(baseLB * (1 + gw * 0.038), 0.005, 1);
			}
		}
	}

	private computePixelBox(
		minX: number,
		minY: number,
		maxX: number,
		maxY: number
	): PixelBounds | null {
		const pad = this.avgDxLogical * 1.5;
		const px0 = Math.max(0, Math.floor((minX - pad - this.crop.x) / this.dxLogical));
		const py0 = Math.max(0, Math.floor((minY - pad - this.crop.y) / this.dyLogical));
		const px1 = Math.min(this.width - 1, Math.ceil((maxX + pad - this.crop.x) / this.dxLogical));
		const py1 = Math.min(this.height - 1, Math.ceil((maxY + pad - this.crop.y) / this.dyLogical));
		if (px0 > px1 || py0 > py1) return null;
		return { minPx: px0, minPy: py0, maxPx: px1, maxPy: py1 };
	}

	rasterizeSwath(swath: ScheduledSwath, dirtyShadeBounds: PixelBounds): void {
		const box = this.computePixelBox(swath.minX, swath.minY, swath.maxX, swath.maxY);
		if (!box) return;

		const pass = swath.pass;
		const region = pass.region;
		const pig = region.pigment;
		const [lr, lg, lb] = pig.linearRgb;
		const [kr, kg, kb] = pig.absorption;
		const [dr, dg, db] = pig.shiftLinearRgb;

		const tau = this.transparencyNorm;
		const stainStrength = 1 - 0.72 * tau;
		const glazeRatio = 0.18 + 0.78 * tau;
		const bodyRatio = 1 - glazeRatio;
		const toothStrength = this.texAmount * (0.04 + 0.16 * tau);
		const edgeNorm = this.edgeSoftness / 100;
		const coatWeight = pass.coatWeight;
		const coatReach = pass.coatReachScale;

		const dKr = dr / Math.max(0.018, lr);
		const dKg = dg / Math.max(0.018, lg);
		const dKb = db / Math.max(0.018, lb);

		const w = this.width;
		const cosS = swath.cosSweep;
		const sinS = swath.sinSweep;
		const uMinB = swath.uMinBound;
		const uMaxB = swath.uMaxBound;
		const coatScaleMult = pass.coatIndex === 0 ? 1.0 : pass.coatIndex === 1 ? 0.56 : 0.34;
		const invWashScale = 1 / (this.washLambda * coatScaleMult);
		const washChannel = region.index * 17 + pass.coatIndex * 5 + 10;
		const invCosS = cosS > 1e-6 ? 1 / cosS : 0;
		const invDx = 1 / this.dxLogical;
		const edgeFactor = this.edgeFactor;
		const noiseFactor = this.noiseFactor;
		let maskCtx = this.maskCtxByPass.get(pass.passOrderIndex);
		if (!maskCtx) {
			maskCtx = createRegionMaskContext(
				region,
				coatReach,
				this.edgeSoftness,
				this.avgDxLogical,
				this.seed,
				this.edgeLambda,
				edgeFactor,
				noiseFactor
			);
			this.maskCtxByPass.set(pass.passOrderIndex, maskCtx);
		}

		let touchedMinPx = Infinity;
		let touchedMinPy = Infinity;
		let touchedMaxPx = -Infinity;
		let touchedMaxPy = -Infinity;
		const rowMinArr = this.dirtyRowMinPx;
		const rowMaxArr = this.dirtyRowMaxPx;

		for (let py = box.minPy; py <= box.maxPy; py++) {
			const ly = this.crop.y + (py + 0.5) * this.dyLogical;
			const lySin = ly * sinS;

			let rowPx0 = box.minPx;
			let rowPx1 = box.maxPx;
			if (invCosS > 0) {
				if (Number.isFinite(uMinB)) {
					const lxMin = (uMinB - lySin) * invCosS;
					rowPx0 = Math.max(rowPx0, Math.floor((lxMin - this.crop.x) * invDx - 0.5) - 1);
				}
				if (Number.isFinite(uMaxB)) {
					const lxMax = (uMaxB - lySin) * invCosS;
					rowPx1 = Math.min(rowPx1, Math.ceil((lxMax - this.crop.x) * invDx - 0.5) + 1);
				}
			}
			if (rowPx0 > rowPx1) continue;

			let rowTouchedMinPx = w;
			let rowTouchedMaxPx = -1;

			for (let px = rowPx0; px <= rowPx1; px++) {
				const lx = this.crop.x + (px + 0.5) * this.dxLogical;
				const u = lx * cosS + lySin;
				if (u < uMinB || u >= uMaxB) continue;

				const mu = evaluateRegionMaskFast(maskCtx, lx, ly);
				if (mu <= 0) continue;

				const idx = py * w + px;
				const off = idx * 3;
				const gw = this.groundWeave[idx]!;
				const toothFactor = 1 - toothStrength * gw;

				const washNoise =
					smoothNoise2DFast(
						this.seed,
						STREAM_SALTS.pigment,
						lx * invWashScale,
						ly * invWashScale,
						washChannel
					) - 0.5;
				const washDensity = 1 + washNoise * 0.24;

				const edgePool =
					this.isSoakStain && edgeNorm > 0 && mu < 1
						? 1 + 0.14 * Math.sin(Math.PI * mu) * edgeNorm * tau
						: 1;

				const dEff = mu * coatWeight * stainStrength * toothFactor * washDensity * edgePool;
				const alphaEff = dEff >= 1 ? 1 : dEff;

				const cLocR = clamp(lr + washNoise * dr, 0.018, 1);
				const cLocG = clamp(lg + washNoise * dg, 0.018, 1);
				const cLocB = clamp(lb + washNoise * db, 0.018, 1);

				const kLocR = Math.max(0.01, kr - washNoise * dKr);
				const kLocG = Math.max(0.01, kg - washNoise * dKg);
				const kLocB = Math.max(0.01, kb - washNoise * dKb);

				const uR = this.accumLinearRgb[off]!;
				const uG = this.accumLinearRgb[off + 1]!;
				const uB = this.accumLinearRgb[off + 2]!;

				const gR = uR * Math.exp(-kLocR * dEff);
				const gG = uG * Math.exp(-kLocG * dEff);
				const gB = uB * Math.exp(-kLocB * dEff);

				const bR = uR * (1 - alphaEff) + cLocR * alphaEff;
				const bG = uG * (1 - alphaEff) + cLocG * alphaEff;
				const bB = uB * (1 - alphaEff) + cLocB * alphaEff;

				this.accumLinearRgb[off] = glazeRatio * gR + bodyRatio * bR;
				this.accumLinearRgb[off + 1] = glazeRatio * gG + bodyRatio * bG;
				this.accumLinearRgb[off + 2] = glazeRatio * gB + bodyRatio * bB;

				this.surfaceHeight[idx] =
					this.surfaceHeight[idx]! * (1 - bodyRatio * alphaEff * 0.55) +
					mu * coatWeight * (1 - 0.6 * tau) * 0.03;

				if (px < rowTouchedMinPx) rowTouchedMinPx = px;
				if (px > rowTouchedMaxPx) rowTouchedMaxPx = px;
			}

			if (rowTouchedMinPx <= rowTouchedMaxPx) {
				if (rowTouchedMinPx < rowMinArr[py]!) rowMinArr[py] = rowTouchedMinPx;
				if (rowTouchedMaxPx > rowMaxArr[py]!) rowMaxArr[py] = rowTouchedMaxPx;
				if (rowTouchedMinPx < touchedMinPx) touchedMinPx = rowTouchedMinPx;
				if (rowTouchedMaxPx > touchedMaxPx) touchedMaxPx = rowTouchedMaxPx;
				if (py < touchedMinPy) touchedMinPy = py;
				if (py > touchedMaxPy) touchedMaxPy = py;
			}
		}

		if (touchedMinPx <= touchedMaxPx && touchedMinPy <= touchedMaxPy) {
			expandBounds(dirtyShadeBounds, touchedMinPx, touchedMinPy, touchedMaxPx, touchedMaxPy);
		}
	}

	shadeRegion(dirtyBounds: PixelBounds): void {
		if (!isBoundsNonEmpty(dirtyBounds)) return;
		const w = this.width;
		const h = this.height;
		const y0 = Math.max(0, dirtyBounds.minPy - 1);
		const y1 = Math.min(h - 1, dirtyBounds.maxPy + 1);
		const rowMinArr = this.dirtyRowMinPx;
		const rowMaxArr = this.dirtyRowMaxPx;

		const reliefScale = 0.1 * this.texAmount;

		for (let py = y0; py <= y1; py++) {
			const pyUp = py > 0 ? py - 1 : 0;
			const pyDn = py < h - 1 ? py + 1 : h - 1;
			let rx0 = rowMinArr[py]!;
			const upMin = rowMinArr[pyUp]!;
			const dnMin = rowMinArr[pyDn]!;
			if (upMin < rx0) rx0 = upMin;
			if (dnMin < rx0) rx0 = dnMin;
			let rx1 = rowMaxArr[py]!;
			const upMax = rowMaxArr[pyUp]!;
			const dnMax = rowMaxArr[pyDn]!;
			if (upMax > rx1) rx1 = upMax;
			if (dnMax > rx1) rx1 = dnMax;
			if (rx0 > rx1) continue;

			const x0 = rx0 > 1 ? rx0 - 1 : 0;
			const x1 = rx1 < w - 2 ? rx1 + 1 : w - 1;

			for (let px = x0; px <= x1; px++) {
				const idx = py * w + px;
				const off = idx * 3;
				let light = 1;
				if (reliefScale > 0) {
					const pxL = px > 0 ? px - 1 : 0;
					const pxR = px < w - 1 ? px + 1 : w - 1;
					const gx = this.surfaceHeight[py * w + pxR]! - this.surfaceHeight[py * w + pxL]!;
					const gy = this.surfaceHeight[pyDn * w + px]! - this.surfaceHeight[pyUp * w + px]!;
					light = clamp(1 + (gx * 0.45 + gy * 0.65) * reliefScale, 0.92, 1.08);
				}

				const pOff = idx * 4;
				this.pixels[pOff] = linearToSrgbByteFast(this.accumLinearRgb[off]! * light);
				this.pixels[pOff + 1] = linearToSrgbByteFast(this.accumLinearRgb[off + 1]! * light);
				this.pixels[pOff + 2] = linearToSrgbByteFast(this.accumLinearRgb[off + 2]! * light);
				this.pixels[pOff + 3] = 255;
			}
		}

		const resetStart = Math.max(0, dirtyBounds.minPy);
		const resetEnd = Math.min(h - 1, dirtyBounds.maxPy);
		for (let py = resetStart; py <= resetEnd; py++) {
			rowMinArr[py] = w;
			rowMaxArr[py] = -1;
		}
	}
}

export interface RenderPaintingStillOptions {
	readonly crop?: CropRect;
	readonly maxProgress?: number;
	readonly model?: PaintingModel;
}

export function renderPaintingStill(
	stateInput: ColorFieldState,
	width?: number,
	height?: number,
	options?: RenderPaintingStillOptions
): StillRenderResult {
	const state = normalizeState(stateInput);
	const model = options?.model ?? buildPaintingModel(state);
	const fallbackW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
	const fallbackH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);
	const w = sanitizeDimension(width, fallbackW);
	const h = sanitizeDimension(height, fallbackH);
	const crop = sanitizeCrop(options?.crop, fallbackW, fallbackH);

	const rasterizer = new SurfaceRasterizer(model, w, h, crop);
	const rawMaxProgress = options?.maxProgress;
	const maxProgress =
		rawMaxProgress === undefined
			? 1
			: Number.isFinite(rawMaxProgress)
				? rawMaxProgress
				: rawMaxProgress === Number.NEGATIVE_INFINITY
					? 0
					: 1;

	const primitives = model.timeline.primitives;
	const dirty = createEmptyBounds();

	if (maxProgress > 0) {
		for (let i = 0; i < primitives.length; i++) {
			const prim = primitives[i]!;
			if (maxProgress < 1 && prim.revealAt > maxProgress) break;
			rasterizer.rasterizeSwath(prim, dirty);
		}
		rasterizer.shadeRegion(dirty);
	}

	return {
		width: w,
		height: h,
		rgba: rasterizer.pixels
	};
}

export class ProgressiveColorFieldBuffer {
	width: number;
	height: number;
	crop: CropRect;
	pixels: Uint8ClampedArray;
	heightField: Float32Array;

	private model: PaintingModel;
	private rasterizer: SurfaceRasterizer;
	private primitives: readonly ScheduledSwath[];
	private cursor = 0;
	private currentProgress = 0;
	private backingCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

	constructor(
		model: PaintingModel,
		outWidth = model.state.artboardWidth,
		outHeight = model.state.artboardHeight,
		crop?: CropRect
	) {
		const fallbackW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
		const fallbackH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);
		this.model = model;
		this.width = sanitizeDimension(outWidth, fallbackW);
		this.height = sanitizeDimension(outHeight, fallbackH);
		this.crop = sanitizeCrop(crop, fallbackW, fallbackH);
		this.primitives = model.timeline.primitives;
		this.rasterizer = new SurfaceRasterizer(model, this.width, this.height, this.crop);
		this.pixels = this.rasterizer.pixels;
		this.heightField = this.rasterizer.surfaceHeight;
	}

	resizeArtboard(
		model: PaintingModel,
		outWidth = model.state.artboardWidth,
		outHeight = model.state.artboardHeight,
		crop?: CropRect
	): void {
		const prevModel = this.model;
		const prevCursor = this.cursor;
		const prevTotal = this.primitives.length;
		const prevProgress = this.currentProgress;
		const wasComplete = this.isComplete();
		const fallbackW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
		const fallbackH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);

		this.model = model;
		this.width = sanitizeDimension(outWidth, fallbackW);
		this.height = sanitizeDimension(outHeight, fallbackH);
		this.crop = sanitizeCrop(crop, fallbackW, fallbackH);
		this.primitives = model.timeline.primitives;
		this.rasterizer = new SurfaceRasterizer(model, this.width, this.height, this.crop);
		this.pixels = this.rasterizer.pixels;
		this.heightField = this.rasterizer.surfaceHeight;
		this.cursor = 0;
		this.currentProgress = 0;

		if (this.backingCanvas) {
			this.backingCanvas.width = this.width;
			this.backingCanvas.height = this.height;
		}

		if (wasComplete) {
			this.finishAll();
		} else if (prevCursor > 0 && model.timeline.primitives === prevModel.timeline.primitives) {
			this.advanceToCount(prevCursor);
			this.currentProgress = Math.max(this.currentProgress, prevProgress);
		} else if (prevProgress > 0) {
			this.advanceTo(prevProgress);
		} else if (prevCursor > 0 && prevTotal > 0) {
			this.advanceToCount(Math.round((prevCursor / prevTotal) * this.primitives.length));
		}
	}

	getProgress(): number {
		return this.currentProgress;
	}

	getPassCount(): number {
		return this.model.timeline.passWindows.length;
	}

	getRenderedCount(): number {
		return this.cursor;
	}

	getTotalCount(): number {
		return this.primitives.length;
	}

	isComplete(): boolean {
		return this.cursor >= this.primitives.length;
	}

	getPixels(): Uint8ClampedArray {
		return this.pixels;
	}

	getRgba(): Uint8ClampedArray {
		return this.pixels;
	}

	advanceToCount(targetCount: number): number {
		if (!Number.isFinite(targetCount)) {
			return this.cursor;
		}
		const clamped = Math.max(
			this.cursor,
			Math.min(this.primitives.length, Math.trunc(targetCount))
		);
		if (clamped === this.cursor) {
			return this.cursor;
		}

		const dirty = createEmptyBounds();
		for (let i = this.cursor; i < clamped; i++) {
			this.rasterizer.rasterizeSwath(this.primitives[i]!, dirty);
		}
		this.cursor = clamped;
		if (this.cursor >= this.primitives.length) {
			this.currentProgress = 1;
		} else if (this.cursor > 0) {
			const lastReveal = this.primitives[this.cursor - 1]?.revealAt;
			if (typeof lastReveal === 'number' && Number.isFinite(lastReveal)) {
				this.currentProgress = Math.max(this.currentProgress, Math.min(1, Math.max(0, lastReveal)));
			}
		}
		this.rasterizer.shadeRegion(dirty);
		return this.cursor;
	}

	advanceTo(progress: number): number {
		if (!Number.isFinite(progress)) {
			return this.cursor;
		}
		if (progress >= 1) {
			return this.finishAll();
		}
		if (progress <= 0) {
			return this.cursor;
		}
		this.currentProgress = Math.max(this.currentProgress, progress);

		let lo = this.cursor;
		let hi = this.primitives.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.primitives[mid]!.revealAt <= progress) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return this.advanceToCount(lo);
	}

	renderUpTo(progress: number): Uint8ClampedArray {
		this.advanceTo(progress);
		return this.pixels;
	}

	advanceToProgress(progress: number): number {
		return this.advanceTo(progress);
	}

	finishAll(): number {
		this.currentProgress = 1;
		return this.advanceToCount(this.primitives.length);
	}

	getCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
		if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
			return null;
		}
		if (!this.backingCanvas) {
			if (typeof document !== 'undefined') {
				const el = document.createElement('canvas');
				el.width = this.width;
				el.height = this.height;
				this.backingCanvas = el;
			} else {
				this.backingCanvas = new OffscreenCanvas(this.width, this.height);
			}
		}
		if (this.backingCanvas.width !== this.width || this.backingCanvas.height !== this.height) {
			this.backingCanvas.width = this.width;
			this.backingCanvas.height = this.height;
		}
		const ctx = this.backingCanvas.getContext('2d') as
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D
			| null;
		if (ctx && typeof ImageData !== 'undefined') {
			const copy = new Uint8ClampedArray(this.pixels.length);
			copy.set(this.pixels);
			ctx.putImageData(new ImageData(copy, this.width, this.height), 0, 0);
		}
		return this.backingCanvas;
	}

	dispose(): void {
		if (this.backingCanvas) {
			this.backingCanvas.width = 0;
			this.backingCanvas.height = 0;
			this.backingCanvas = null;
		}
	}
}

function pointNormalizedRadiusInRegion(region: ColorRegion, lx: number, ly: number): number {
	const dx = lx - region.cx;
	const dy = ly - region.cy;
	const u = dx * region.cosA + dy * region.sinA;
	const v = -dx * region.sinA + dy * region.cosA;
	const nx = u / Math.max(1, region.rx);
	const ny = v / Math.max(1, region.ry);
	const ax = Math.abs(nx);
	const ay = Math.abs(ny);
	let dSe: number;
	if (ax === 0 && ay === 0) {
		dSe = 0;
	} else {
		const p = region.exponent;
		dSe = Math.pow(Math.pow(ax, p) + Math.pow(ay, p), 1 / p);
	}
	if (region.h2 > 0 || region.h3 > 0) {
		const len = Math.hypot(nx, ny);
		if (len > 1e-6) {
			const ca = nx / len;
			const sa = ny / len;
			const c2 = ca * ca - sa * sa;
			const s2 = 2 * ca * sa;
			const c3 = c2 * ca - s2 * sa;
			const s3 = s2 * ca + c2 * sa;
			const lobe =
				1 +
				region.h2 * (c2 * region.cosP2 + s2 * region.sinP2) +
				region.h3 * (c3 * region.cosP3 + s3 * region.sinP3);
			return dSe / Math.max(0.65, Math.min(1.35, lobe));
		}
	}
	return dSe;
}

export function measurePaintingMetrics(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	model: PaintingModel
): PaintingMetrics {
	const w = sanitizeDimension(width, 1);
	const h = sanitizeDimension(height, 1);
	const totalPixels = Math.min(w * h, Math.floor(rgba.length / 4));
	const activeRegionCount = model.regions.length;

	if (totalPixels === 0 || w < 3 || h < 3) {
		return {
			width: w,
			height: h,
			totalPixels,
			activeRegionCount,
			meanR: 0,
			meanG: 0,
			meanB: 0,
			meanLuminance: 0,
			luminanceVariance: 0,
			luminanceStdDev: 0,
			colorVariance: 0,
			meanChroma: 0,
			nonBackgroundPixels: 0,
			nonBackgroundFraction: 0,
			paintedCoveragePct: 0,
			meanBoundaryGradient: 0,
			p95BoundaryGradient: 0,
			sharpBoundaryFraction: 0,
			edgeGradientSmoothness: 1,
			canvasWeaveVisibility: 0,
			groundWeaveVisibility: 0,
			pigmentVariationScore: 0,
			regionSeparation: 0,
			regionStats: model.regions.map((r) => ({
				regionIndex: r.index,
				pixelCount: 0,
				pixelFraction: 0,
				meanR: 0,
				meanG: 0,
				meanB: 0,
				meanLuminance: 0,
				interiorWeaveEnergy: 0
			}))
		};
	}

	const [bgR, bgG, bgB] = model.groundBaseRgb;
	const lum = new Float32Array(totalPixels);
	const isNonBg = new Uint8Array(totalPixels);
	const dominantRegion = new Int16Array(totalPixels);
	dominantRegion.fill(-1);

	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let sumR2 = 0;
	let sumG2 = 0;
	let sumB2 = 0;
	let sumL = 0;
	let sumL2 = 0;
	let sumChroma = 0;
	let nonBackgroundPixels = 0;

	const artW = model.state.artboardWidth;
	const artH = model.state.artboardHeight;
	const dxLog = artW / w;
	const dyLog = artH / h;

	const regCount = model.regions.length;
	const regPixCount = new Int32Array(regCount);
	const regSumR = new Float64Array(regCount);
	const regSumG = new Float64Array(regCount);
	const regSumB = new Float64Array(regCount);
	const regSumL = new Float64Array(regCount);
	const regWeaveSum = new Float64Array(regCount);
	const regWeaveCount = new Int32Array(regCount);

	for (let py = 0; py < h; py++) {
		const ly = (py + 0.5) * dyLog;
		for (let px = 0; px < w; px++) {
			const idx = py * w + px;
			if (idx >= totalPixels) break;
			const off = idx * 4;
			const r = rgba[off]!;
			const g = rgba[off + 1]!;
			const b = rgba[off + 2]!;
			const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			lum[idx] = l;

			sumR += r;
			sumG += g;
			sumB += b;
			sumR2 += r * r;
			sumG2 += g * g;
			sumB2 += b * b;
			sumL += l;
			sumL2 += l * l;
			sumChroma += Math.max(r, g, b) - Math.min(r, g, b);

			const nonBg = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB)) > 11 ? 1 : 0;
			isNonBg[idx] = nonBg;
			if (nonBg) {
				nonBackgroundPixels++;
			}

			const lx = (px + 0.5) * dxLog;
			let owner = -1;
			for (let k = regCount - 1; k >= 0; k--) {
				const reg = model.regions[k]!;
				if (lx < reg.minX || lx > reg.maxX || ly < reg.minY || ly > reg.maxY) continue;
				if (pointNormalizedRadiusInRegion(reg, lx, ly) <= 1.0) {
					owner = k;
					break;
				}
			}
			dominantRegion[idx] = owner;
			if (owner >= 0 && nonBg) {
				regPixCount[owner]!++;
				regSumR[owner]! += r;
				regSumG[owner]! += g;
				regSumB[owner]! += b;
				regSumL[owner]! += l;
			}
		}
	}

	const meanR = sumR / totalPixels;
	const meanG = sumG / totalPixels;
	const meanB = sumB / totalPixels;
	const meanLuminance = sumL / totalPixels;
	const luminanceVariance = Math.max(0, sumL2 / totalPixels - meanLuminance * meanLuminance);
	const luminanceStdDev = Math.sqrt(luminanceVariance);
	const varR = Math.max(0, sumR2 / totalPixels - meanR * meanR);
	const varG = Math.max(0, sumG2 / totalPixels - meanG * meanG);
	const varB = Math.max(0, sumB2 / totalPixels - meanB * meanB);
	const colorVariance = (varR + varG + varB) / 3;
	const meanChroma = sumChroma / totalPixels;
	const nonBackgroundFraction = nonBackgroundPixels / totalPixels;
	const paintedCoveragePct = nonBackgroundFraction * 100;

	// Macro-strided gradient for boundary detection and interior weave isolation
	const macroGrad = new Float32Array(totalPixels);
	let maxMacroGrad = 0;

	let paintedWeaveSum = 0;
	let paintedWeaveCount = 0;
	let groundWeaveSum = 0;
	let groundWeaveCount = 0;

	const completeRows = Math.floor(totalPixels / w);
	const stride = Math.max(1, Math.min(4, Math.floor(Math.min(w, Math.max(1, completeRows)) / 4)));
	const maxMacroPy = Math.min(h - stride, completeRows - stride);
	for (let py = stride; py < maxMacroPy; py++) {
		for (let px = stride; px < w - stride; px++) {
			const idx = py * w + px;
			const left = (py * w + (px - stride)) * 4;
			const right = (py * w + (px + stride)) * 4;
			const up = ((py - stride) * w + px) * 4;
			const down = ((py + stride) * w + px) * 4;

			const drx = rgba[right]! - rgba[left]!;
			const dgx = rgba[right + 1]! - rgba[left + 1]!;
			const dbx = rgba[right + 2]! - rgba[left + 2]!;
			const dry = rgba[down]! - rgba[up]!;
			const dgy = rgba[down + 1]! - rgba[up + 1]!;
			const dby = rgba[down + 2]! - rgba[up + 2]!;

			const mg = Math.hypot(drx, dgx, dbx) + Math.hypot(dry, dgy, dby);
			macroGrad[idx] = mg;
			if (mg > maxMacroGrad) maxMacroGrad = mg;

			const maxStep = Math.max(
				Math.abs(drx),
				Math.abs(dgx),
				Math.abs(dbx),
				Math.abs(dry),
				Math.abs(dgy),
				Math.abs(dby)
			);
			const lap = Math.abs(
				lum[idx]! - 0.25 * (lum[idx - 1]! + lum[idx + 1]! + lum[idx - w]! + lum[idx + w]!)
			);
			if (maxStep < 18) {
				if (isNonBg[idx]) {
					paintedWeaveSum += lap;
					paintedWeaveCount++;
					const owner = dominantRegion[idx]!;
					if (owner >= 0) {
						regWeaveSum[owner]! += lap;
						regWeaveCount[owner]!++;
					}
				} else {
					groundWeaveSum += lap;
					groundWeaveCount++;
				}
			}
		}
	}

	const boundaryGrads: number[] = [];
	let sharpBoundaryCount = 0;
	if (maxMacroGrad > 8) {
		const threshold = Math.max(6, 0.35 * maxMacroGrad);
		const maxGradPy = Math.min(h - 1, completeRows - 1);
		for (let py = 1; py < maxGradPy; py++) {
			for (let px = 1; px < w - 1; px++) {
				const idx = py * w + px;
				if (macroGrad[idx]! < threshold) continue;
				const lOff = (idx - 1) * 4;
				const rOff = (idx + 1) * 4;
				const uOff = (idx - w) * 4;
				const dOff = (idx + w) * 4;
				const cOff = idx * 4;

				const gxSq =
					(rgba[rOff]! - rgba[lOff]!) ** 2 +
					(rgba[rOff + 1]! - rgba[lOff + 1]!) ** 2 +
					(rgba[rOff + 2]! - rgba[lOff + 2]!) ** 2;
				const gySq =
					(rgba[dOff]! - rgba[uOff]!) ** 2 +
					(rgba[dOff + 1]! - rgba[uOff + 1]!) ** 2 +
					(rgba[dOff + 2]! - rgba[uOff + 2]!) ** 2;
				const g = 0.5 * Math.sqrt(gxSq + gySq);
				boundaryGrads.push(g);

				const stepX = Math.max(
					Math.abs(rgba[rOff]! - rgba[cOff]!),
					Math.abs(rgba[rOff + 1]! - rgba[cOff + 1]!),
					Math.abs(rgba[rOff + 2]! - rgba[cOff + 2]!)
				);
				const stepY = Math.max(
					Math.abs(rgba[dOff]! - rgba[cOff]!),
					Math.abs(rgba[dOff + 1]! - rgba[cOff + 1]!),
					Math.abs(rgba[dOff + 2]! - rgba[cOff + 2]!)
				);
				if (Math.max(stepX, stepY) > 16) {
					sharpBoundaryCount++;
				}
			}
		}
	}

	let meanBoundaryGradient = 0;
	let p95BoundaryGradient = 0;
	let sharpBoundaryFraction = 0;
	if (boundaryGrads.length > 0) {
		let gSum = 0;
		for (let i = 0; i < boundaryGrads.length; i++) gSum += boundaryGrads[i]!;
		meanBoundaryGradient = gSum / boundaryGrads.length;
		boundaryGrads.sort((a, b) => a - b);
		const p95Idx = Math.min(boundaryGrads.length - 1, Math.floor(boundaryGrads.length * 0.95));
		p95BoundaryGradient = boundaryGrads[p95Idx]!;
		sharpBoundaryFraction = sharpBoundaryCount / boundaryGrads.length;
	}
	const edgeGradientSmoothness = 1 / (1 + meanBoundaryGradient / 18);

	// Coarse 8x8 tile pigment variation within region interiors
	const tileSize = 8;
	const regionTileMeans: number[][] = Array.from({ length: regCount }, () => []);
	const maxTileY = Math.min(h, completeRows);
	for (let ty = 0; ty + tileSize <= maxTileY; ty += tileSize) {
		for (let tx = 0; tx + tileSize <= w; tx += tileSize) {
			const centerIdx = (ty + 4) * w + (tx + 4);
			const owner = dominantRegion[centerIdx]!;
			if (owner < 0 || !isNonBg[centerIdx]) continue;
			let uniform = true;
			let lSum = 0;
			let count = 0;
			for (let py = ty; py < ty + tileSize && uniform; py++) {
				for (let px = tx; px < tx + tileSize; px++) {
					const idx = py * w + px;
					if (dominantRegion[idx] !== owner || !isNonBg[idx] || macroGrad[idx]! > 18) {
						uniform = false;
						break;
					}
					lSum += lum[idx]!;
					count++;
				}
			}
			if (uniform && count === tileSize * tileSize) {
				regionTileMeans[owner]!.push(lSum / count);
			}
		}
	}

	let varScoreSum = 0;
	let varScoreRegions = 0;
	for (let r = 0; r < regCount; r++) {
		const tiles = regionTileMeans[r]!;
		if (tiles.length < 4) continue;
		let m = 0;
		for (const v of tiles) m += v;
		m /= tiles.length;
		let sq = 0;
		for (const v of tiles) sq += (v - m) * (v - m);
		varScoreSum += Math.sqrt(sq / tiles.length);
		varScoreRegions++;
	}
	const pigmentVariationScore = varScoreRegions > 0 ? varScoreSum / varScoreRegions : 0;

	const regionStats: RegionMetricSummary[] = [];
	const populatedRegions: RegionMetricSummary[] = [];
	for (let r = 0; r < regCount; r++) {
		const cnt = regPixCount[r]!;
		const summary: RegionMetricSummary = {
			regionIndex: model.regions[r]!.index,
			pixelCount: cnt,
			pixelFraction: cnt / totalPixels,
			meanR: cnt > 0 ? regSumR[r]! / cnt : 0,
			meanG: cnt > 0 ? regSumG[r]! / cnt : 0,
			meanB: cnt > 0 ? regSumB[r]! / cnt : 0,
			meanLuminance: cnt > 0 ? regSumL[r]! / cnt : 0,
			interiorWeaveEnergy: regWeaveCount[r]! > 0 ? regWeaveSum[r]! / regWeaveCount[r]! : 0
		};
		regionStats.push(summary);
		if (cnt > 0) populatedRegions.push(summary);
	}

	let sepSum = 0;
	let sepPairs = 0;
	for (let i = 0; i < populatedRegions.length; i++) {
		for (let j = i + 1; j < populatedRegions.length; j++) {
			const a = populatedRegions[i]!;
			const b = populatedRegions[j]!;
			sepSum += Math.hypot(a.meanR - b.meanR, a.meanG - b.meanG, a.meanB - b.meanB);
			sepPairs++;
		}
	}
	const regionSeparation = sepPairs > 0 ? sepSum / sepPairs : 0;

	return {
		width: w,
		height: h,
		totalPixels,
		activeRegionCount,
		meanR,
		meanG,
		meanB,
		meanLuminance,
		luminanceVariance,
		luminanceStdDev,
		colorVariance,
		meanChroma,
		nonBackgroundPixels,
		nonBackgroundFraction,
		paintedCoveragePct,
		meanBoundaryGradient,
		p95BoundaryGradient,
		sharpBoundaryFraction,
		edgeGradientSmoothness,
		canvasWeaveVisibility: paintedWeaveCount > 0 ? paintedWeaveSum / paintedWeaveCount : 0,
		groundWeaveVisibility: groundWeaveCount > 0 ? groundWeaveSum / groundWeaveCount : 0,
		pigmentVariationScore,
		regionSeparation,
		regionStats
	};
}
