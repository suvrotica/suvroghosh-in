import { buildDepositionPasses } from './deposition.ts';
import { applySweepWidth, buildCanonicalPassTable, selectActivePasses } from './paths.ts';
import { createStreamRng, normalizeSeed, smoothNoise2D } from './prng.ts';
import { normalizeState } from './state.ts';
import { computePaintingFocalPoint, describePaintingAccessible } from './studies.ts';
import { buildPaintTimeline } from './timeline.ts';
import {
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_TEXTURE,
	GROUND_BASE_RGB,
	PALETTE,
	type CropRect,
	type DripPaintingState,
	type PaintingMetrics,
	type PaintingModel,
	type PigmentId,
	type ScheduledPrimitive
} from './types.ts';

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

function clampByte(v: number): number {
	return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
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

function unionBounds(target: PixelBounds, source: PixelBounds): void {
	if (source.minPx <= source.maxPx && source.minPy <= source.maxPy) {
		expandBounds(target, source.minPx, source.minPy, source.maxPx, source.maxPy);
	}
}

function isBoundsNonEmpty(bounds: PixelBounds): boolean {
	return bounds.minPx <= bounds.maxPx && bounds.minPy <= bounds.maxPy;
}

export function buildPaintingModel(state: DripPaintingState): PaintingModel {
	const normalizedState = normalizeState(state);

	const canonicalTable = buildCanonicalPassTable(
		normalizedState.seed,
		normalizedState.study,
		normalizedState.artboardWidth,
		normalizedState.artboardHeight
	);

	const activeCanonical = selectActivePasses(
		canonicalTable.passes,
		normalizedState.passes,
		normalizedState.paintLayers
	);

	const sweptPasses = applySweepWidth(
		activeCanonical,
		normalizedState.sweepWidth,
		normalizedState.artboardWidth,
		normalizedState.artboardHeight
	);

	const depositionPasses = buildDepositionPasses(
		sweptPasses,
		normalizedState.seed,
		normalizedState.study,
		normalizedState.paintFlow,
		normalizedState.artboardWidth,
		normalizedState.artboardHeight
	);

	const timeline = buildPaintTimeline(
		depositionPasses,
		normalizedState.seed,
		normalizedState.paintingTime
	);

	const focalPoint = computePaintingFocalPoint(
		depositionPasses,
		normalizedState.artboardWidth,
		normalizedState.artboardHeight
	);

	const draftModel: PaintingModel = {
		state: normalizedState,
		canonicalTable,
		sweptPasses,
		depositionPasses,
		timeline,
		focalPoint,
		description: ''
	};

	return {
		...draftModel,
		description: describePaintingAccessible(normalizedState, draftModel)
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
	readonly dxLogical: number;
	readonly dyLogical: number;
	readonly avgDxLogical: number;
	readonly feather: number;

	readonly settledRgb: Uint8Array;
	readonly settledHeight: Float32Array;
	readonly settledSheen: Float32Array;
	readonly passCov: Float32Array;
	readonly passThick: Float32Array;
	readonly heightField: Float32Array;
	readonly pixels: Uint8ClampedArray;

	activePassOrderIndex = -1;
	activePassPigment: PigmentId = 'carbon-black';
	activePassBounds: PixelBounds = createEmptyBounds();

	constructor(
		model: PaintingModel,
		width: number,
		height: number,
		crop: CropRect,
		externalPixels?: Uint8ClampedArray
	) {
		const artW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
		const artH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);
		const safeCrop = sanitizeCrop(crop, artW, artH);
		this.width = sanitizeDimension(width, artW);
		this.height = sanitizeDimension(height, artH);
		this.crop = safeCrop;
		this.seed = normalizeSeed(model.state.seed);
		this.artboardWidth = artW;
		this.artboardHeight = artH;
		this.texAmount = Number.isFinite(model.state.paintTexture)
			? clamp(model.state.paintTexture, 0, 100) / 100
			: DEFAULT_TEXTURE / 100;
		this.dxLogical = safeCrop.width / this.width;
		this.dyLogical = safeCrop.height / this.height;
		this.avgDxLogical = (this.dxLogical + this.dyLogical) * 0.5;
		this.feather = Math.max(0.25, 0.85 * this.avgDxLogical);

		const pixelCount = this.width * this.height;
		this.settledRgb = new Uint8Array(pixelCount * 3);
		this.settledHeight = new Float32Array(pixelCount);
		this.settledSheen = new Float32Array(pixelCount);
		this.passCov = new Float32Array(pixelCount);
		this.passThick = new Float32Array(pixelCount);
		this.heightField = new Float32Array(pixelCount);
		this.pixels =
			externalPixels && externalPixels.length >= pixelCount * 4
				? externalPixels
				: new Uint8ClampedArray(pixelCount * 4);

		this.renderGround();
		this.shadeRegion({ minPx: 0, minPy: 0, maxPx: this.width - 1, maxPy: this.height - 1 });
	}

	private renderGround(): void {
		const w = this.width;
		const h = this.height;
		const total = w * h;
		const [baseR, baseG, baseB] = GROUND_BASE_RGB;

		if (this.texAmount <= 0) {
			for (let i = 0; i < total; i++) {
				const off = i * 3;
				this.settledRgb[off] = baseR;
				this.settledRgb[off + 1] = baseG;
				this.settledRgb[off + 2] = baseB;
				this.settledHeight[i] = 0;
				this.settledSheen[i] = 0;
			}
			return;
		}

		const surfRng = createStreamRng(this.seed, 'surface', 0);
		const threadVarX = new Float32Array(1024);
		const threadVarY = new Float32Array(1024);
		for (let i = 0; i < 1024; i++) {
			threadVarX[i] = surfRng.signed() * 0.16;
			threadVarY[i] = surfRng.signed() * 0.16;
		}

		const weaveFreq = 190 / Math.min(this.artboardWidth, this.artboardHeight);
		const tex = this.texAmount;

		for (let py = 0; py < h; py++) {
			const ly = this.crop.y + (py + 0.5) * this.dyLogical;
			const wyPhase = ly * weaveFreq;
			const ty = Math.floor(wyPhase);
			const fy = wyPhase - ty;
			const wcY = (Math.sin(fy * Math.PI) - 0.62) * (1 + threadVarY[ty & 1023]!);

			for (let px = 0; px < w; px++) {
				const lx = this.crop.x + (px + 0.5) * this.dxLogical;
				const wxPhase = lx * weaveFreq;
				const tx = Math.floor(wxPhase);
				const fx = wxPhase - tx;
				const wcX = (Math.sin(fx * Math.PI) - 0.62) * (1 + threadVarX[tx & 1023]!);

				const overWarp = ((tx + ty) & 1) === 0;
				const weaveRaw = overWarp ? wcX * 0.72 + wcY * 0.28 : wcY * 0.72 + wcX * 0.28;
				const mottle = smoothNoise2D(this.seed, lx / 110, ly / 110, 1, 'surface') - 0.5;
				const tone = (weaveRaw * 6.8 + mottle * 7.2) * tex;

				const idx = py * w + px;
				const off = idx * 3;
				this.settledRgb[off] = clampByte(baseR + tone);
				this.settledRgb[off + 1] = clampByte(baseG + tone * 0.97);
				this.settledRgb[off + 2] = clampByte(baseB + tone * 0.9);
				this.settledHeight[idx] = weaveRaw * 0.22 * tex;
				this.settledSheen[idx] = 0.02 * tex;
			}
		}
	}

	private computePixelBox(
		minX: number,
		minY: number,
		maxX: number,
		maxY: number
	): PixelBounds | null {
		const pad = this.feather * 1.6 + 0.6;
		const px0 = Math.max(0, Math.floor((minX - pad - this.crop.x) / this.dxLogical));
		const py0 = Math.max(0, Math.floor((minY - pad - this.crop.y) / this.dyLogical));
		const px1 = Math.min(this.width - 1, Math.ceil((maxX + pad - this.crop.x) / this.dxLogical));
		const py1 = Math.min(this.height - 1, Math.ceil((maxY + pad - this.crop.y) / this.dyLogical));
		if (px0 > px1 || py0 > py1) return null;
		return { minPx: px0, minPy: py0, maxPx: px1, maxPy: py1 };
	}

	rasterizePrimitive(prim: ScheduledPrimitive, dirtyShadeBounds: PixelBounds): void {
		if (prim.passOrderIndex !== this.activePassOrderIndex) {
			if (this.activePassOrderIndex !== -1) {
				this.commitActivePass(dirtyShadeBounds);
			}
			this.activePassOrderIndex = prim.passOrderIndex;
			this.activePassPigment = prim.pigmentKey;
			this.activePassBounds = createEmptyBounds();
		}

		const box = this.computePixelBox(prim.minX, prim.minY, prim.maxX, prim.maxY);
		if (!box) return;

		const w = this.width;
		const feather = this.feather;
		const tex = this.texAmount;

		if (prim.kind === 'segment') {
			const segDx = prim.x1 - prim.x0;
			const segDy = prim.y1 - prim.y0;
			const lenSq = segDx * segDx + segDy * segDy;
			const invLenSq = lenSq > 1e-6 ? 1 / lenSq : 0;
			const maxTooth = 0.22 * tex;
			const halfFeather = 0.5 * feather;
			const invFeather = 1 / feather;

			for (let py = box.minPy; py <= box.maxPy; py++) {
				const ly = this.crop.y + (py + 0.5) * this.dyLogical;
				const dy0 = ly - prim.y0;
				for (let px = box.minPx; px <= box.maxPx; px++) {
					const lx = this.crop.x + (px + 0.5) * this.dxLogical;
					const dx0 = lx - prim.x0;
					const t = invLenSq > 0 ? clamp((dx0 * segDx + dy0 * segDy) * invLenSq, 0, 1) : 0;
					const cx = prim.x0 + t * segDx;
					const cy = prim.y0 + t * segDy;
					const r = prim.r0 + (prim.r1 - prim.r0) * t;
					const outerBound = r + maxTooth + halfFeather;
					const rx = lx - cx;
					const ry = ly - cy;
					const distSq = rx * rx + ry * ry;
					if (distSq >= outerBound * outerBound) continue;

					const dist = Math.sqrt(distSq);
					let cov: number;
					if (dist <= r - maxTooth - halfFeather) {
						cov = 1;
					} else {
						const edgeTooth =
							tex > 0
								? (smoothNoise2D(this.seed, lx * 0.35, ly * 0.35, 3, 'surface') - 0.5) * 0.44 * tex
								: 0;
						cov = clamp(0.5 - (dist - (r + edgeTooth)) * invFeather, 0, 1);
					}
					if (cov > 0) {
						const hVal = prim.h0 + (prim.h1 - prim.h0) * t;
						const idx = py * w + px;
						if (cov > this.passCov[idx]!) this.passCov[idx] = cov;
						const uRad = dist < r ? dist / Math.max(0.2, r) : 1;
						const dome = Math.sqrt(Math.max(0, 1 - 0.55 * uRad * uRad));
						const thickVal = hVal * (0.35 + 0.65 * dome);
						if (thickVal > this.passThick[idx]!) this.passThick[idx] = thickVal;
					}
				}
			}
		} else if (prim.kind === 'pool') {
			const maxTooth = 0.24 * tex;
			const halfFeather = 0.5 * feather;
			const invFeather = 1 / feather;
			const maxLobeRadius = prim.radius * (1 + prim.h2 + prim.h3) + maxTooth + halfFeather;
			const maxLobeRadiusSq = maxLobeRadius * maxLobeRadius;

			for (let py = box.minPy; py <= box.maxPy; py++) {
				const ly = this.crop.y + (py + 0.5) * this.dyLogical;
				const dy = ly - prim.y;
				const dySq = dy * dy;
				for (let px = box.minPx; px <= box.maxPx; px++) {
					const lx = this.crop.x + (px + 0.5) * this.dxLogical;
					const dx = lx - prim.x;
					const distSq = dx * dx + dySq;
					if (distSq >= maxLobeRadiusSq) continue;

					const dist = Math.sqrt(distSq);
					const theta = Math.atan2(dy, dx);
					const lobeScale =
						1 +
						prim.h2 * Math.cos(2 * theta + prim.p2) +
						(prim.lobeCount === 3 ? prim.h3 * Math.cos(3 * theta + prim.p3) : 0);
					const rBase = prim.radius * lobeScale;
					if (dist >= rBase + maxTooth + halfFeather) continue;

					let cov: number;
					if (dist <= rBase - maxTooth - halfFeather) {
						cov = 1;
					} else {
						const edgeTooth =
							tex > 0
								? (smoothNoise2D(this.seed, lx * 0.35, ly * 0.35, 3, 'surface') - 0.5) * 0.48 * tex
								: 0;
						cov = clamp(0.5 - (dist - (rBase + edgeTooth)) * invFeather, 0, 1);
					}
					if (cov > 0) {
						const idx = py * w + px;
						if (cov > this.passCov[idx]!) this.passCov[idx] = cov;
						const uRad = clamp(dist / Math.max(0.5, rBase), 0, 1);
						const dome =
							Math.sqrt(Math.max(0, 1 - 0.45 * uRad * uRad)) +
							0.14 * Math.exp(-Math.pow((uRad - 0.84) / 0.14, 2));
						const thickVal = prim.thickness * (0.42 + 0.58 * dome);
						if (thickVal > this.passThick[idx]!) this.passThick[idx] = thickVal;
					}
				}
			}
		} else {
			const invFeather = 1 / feather;
			const minR = Math.min(prim.rx, prim.ry);
			const invRy = 1 / Math.max(0.15, prim.ry);
			for (let py = box.minPy; py <= box.maxPy; py++) {
				const ly = this.crop.y + (py + 0.5) * this.dyLogical;
				const dy = ly - prim.y;
				for (let px = box.minPx; px <= box.maxPx; px++) {
					const lx = this.crop.x + (px + 0.5) * this.dxLogical;
					const dx = lx - prim.x;
					const uLocal = dx * prim.cosA + dy * prim.sinA;
					const vLocal = -dx * prim.sinA + dy * prim.cosA;
					const rxEff = prim.rx * (1 + 0.08 * clamp(uLocal / Math.max(0.2, prim.rx), -1, 1));
					const uy = vLocal * invRy;
					const ux = uLocal / Math.max(0.15, rxEff);
					const normDistSq = ux * ux + uy * uy;
					if (normDistSq > 4) continue;
					const normDist = Math.sqrt(normDistSq);
					const signedDist = (normDist - 1) * minR;
					const cov = clamp(0.5 - signedDist * invFeather, 0, 1);
					if (cov > 0) {
						const idx = py * w + px;
						if (cov > this.passCov[idx]!) this.passCov[idx] = cov;
						const dome = Math.sqrt(Math.max(0, 1 - 0.55 * Math.min(1, normDistSq)));
						const thickVal = prim.thickness * (0.38 + 0.62 * dome);
						if (thickVal > this.passThick[idx]!) this.passThick[idx] = thickVal;
					}
				}
			}
		}

		unionBounds(this.activePassBounds, box);
		unionBounds(dirtyShadeBounds, box);
	}

	commitActivePass(dirtyShadeBounds?: PixelBounds): void {
		if (this.activePassOrderIndex === -1 || !isBoundsNonEmpty(this.activePassBounds)) {
			this.activePassOrderIndex = -1;
			this.activePassBounds = createEmptyBounds();
			return;
		}

		const pig = PALETTE[this.activePassPigment];
		const w = this.width;
		const { minPx, minPy, maxPx, maxPy } = this.activePassBounds;
		const conformalKeep = 0.72;

		for (let py = minPy; py <= maxPy; py++) {
			for (let px = minPx; px <= maxPx; px++) {
				const idx = py * w + px;
				const cov = this.passCov[idx]!;
				if (cov > 0) {
					const alpha = cov * pig.opacity;
					const invAlpha = 1 - alpha;
					const off = idx * 3;
					this.settledRgb[off] = clampByte(this.settledRgb[off]! * invAlpha + pig.r * alpha);
					this.settledRgb[off + 1] = clampByte(
						this.settledRgb[off + 1]! * invAlpha + pig.g * alpha
					);
					this.settledRgb[off + 2] = clampByte(
						this.settledRgb[off + 2]! * invAlpha + pig.b * alpha
					);

					const oldH = this.settledHeight[idx]!;
					this.settledHeight[idx] =
						alpha * (oldH * conformalKeep + this.passThick[idx]!) + invAlpha * oldH;
					this.settledSheen[idx] = this.settledSheen[idx]! * invAlpha + pig.sheen * alpha;
					this.passCov[idx] = 0;
					this.passThick[idx] = 0;
				}
			}
		}

		if (dirtyShadeBounds) {
			unionBounds(dirtyShadeBounds, this.activePassBounds);
		}
		this.activePassOrderIndex = -1;
		this.activePassBounds = createEmptyBounds();
	}

	shadeRegion(bounds: PixelBounds): void {
		if (!isBoundsNonEmpty(bounds)) return;

		const w = this.width;
		const h = this.height;
		const sx0 = Math.max(0, bounds.minPx - 1);
		const sy0 = Math.max(0, bounds.minPy - 1);
		const sx1 = Math.min(w - 1, bounds.maxPx + 1);
		const sy1 = Math.min(h - 1, bounds.maxPy + 1);

		const hx0 = Math.max(0, sx0 - 1);
		const hy0 = Math.max(0, sy0 - 1);
		const hx1 = Math.min(w - 1, sx1 + 1);
		const hy1 = Math.min(h - 1, sy1 + 1);

		const hasActivePass = this.activePassOrderIndex !== -1;
		const activePig = PALETTE[this.activePassPigment];
		const conformalKeep = 0.72;

		for (let py = hy0; py <= hy1; py++) {
			for (let px = hx0; px <= hx1; px++) {
				const idx = py * w + px;
				const cov = hasActivePass ? this.passCov[idx]! : 0;
				if (cov > 0) {
					const alpha = cov * activePig.opacity;
					const oldH = this.settledHeight[idx]!;
					this.heightField[idx] =
						alpha * (oldH * conformalKeep + this.passThick[idx]!) + (1 - alpha) * oldH;
				} else {
					this.heightField[idx] = this.settledHeight[idx]!;
				}
			}
		}

		const tex = this.texAmount;
		const lxLight = -0.56;
		const lyLight = -0.64;
		const lzLight = 0.524;
		const hxLight = -0.315;
		const hyLight = -0.36;
		const hzLight = 0.878;

		const invTwoDx = 1 / (2 * Math.max(0.28, this.dxLogical));
		const invTwoDy = 1 / (2 * Math.max(0.28, this.dyLogical));
		const reliefScale = 1.65;
		const flatSatinBase = Math.pow(hzLight, 5) * 4.5 * tex;

		for (let py = sy0; py <= sy1; py++) {
			const pyM = py > 0 ? py - 1 : 0;
			const pyP = py < h - 1 ? py + 1 : h - 1;
			const rowOffset = py * w;
			const rowM = pyM * w;
			const rowP = pyP * w;

			for (let px = sx0; px <= sx1; px++) {
				const pxM = px > 0 ? px - 1 : 0;
				const pxP = px < w - 1 ? px + 1 : w - 1;
				const idx = rowOffset + px;
				const off3 = idx * 3;
				const off4 = idx * 4;

				let r = this.settledRgb[off3]!;
				let g = this.settledRgb[off3 + 1]!;
				let b = this.settledRgb[off3 + 2]!;
				let sheen = this.settledSheen[idx]!;

				const cov = hasActivePass ? this.passCov[idx]! : 0;
				if (cov > 0) {
					const alpha = cov * activePig.opacity;
					const invAlpha = 1 - alpha;
					r = r * invAlpha + activePig.r * alpha;
					g = g * invAlpha + activePig.g * alpha;
					b = b * invAlpha + activePig.b * alpha;
					sheen = sheen * invAlpha + activePig.sheen * alpha;
				}

				if (tex <= 0) {
					this.pixels[off4] = clampByte(r);
					this.pixels[off4 + 1] = clampByte(g);
					this.pixels[off4 + 2] = clampByte(b);
					this.pixels[off4 + 3] = 255;
					continue;
				}

				const gradX = this.heightField[rowOffset + pxP]! - this.heightField[rowOffset + pxM]!;
				const gradY = this.heightField[rowP + px]! - this.heightField[rowM + px]!;

				if (Math.abs(gradX) < 1e-4 && Math.abs(gradY) < 1e-4) {
					const satin = sheen * flatSatinBase;
					this.pixels[off4] = clampByte(r + satin);
					this.pixels[off4 + 1] = clampByte(g + satin * 0.97);
					this.pixels[off4 + 2] = clampByte(b + satin * 0.92);
					this.pixels[off4 + 3] = 255;
					continue;
				}

				const dhx = clamp(gradX * invTwoDx * reliefScale, -0.55, 0.55);
				const dhy = clamp(gradY * invTwoDy * reliefScale, -0.55, 0.55);

				const invLen = 1 / Math.sqrt(dhx * dhx + dhy * dhy + 1);
				const nx = -dhx * invLen;
				const ny = -dhy * invLen;
				const nz = invLen;

				const ndotl = nx * lxLight + ny * lyLight + nz * lzLight;
				const diffuseDelta = (ndotl - lzLight) * 26 * tex;

				const ndoth = Math.max(0, nx * hxLight + ny * hyLight + nz * hzLight);
				const ndoth2 = ndoth * ndoth;
				const satin = ndoth2 * ndoth2 * ndoth * sheen * 4.5 * tex;

				this.pixels[off4] = clampByte(r + diffuseDelta + satin);
				this.pixels[off4 + 1] = clampByte(g + diffuseDelta * 0.98 + satin * 0.97);
				this.pixels[off4 + 2] = clampByte(b + diffuseDelta * 0.94 + satin * 0.92);
				this.pixels[off4 + 3] = 255;
			}
		}
	}
}

export interface RenderPaintingStillOptions {
	readonly crop?: CropRect;
	readonly width?: number;
	readonly height?: number;
	readonly maxProgress?: number;
	readonly maxLayerIndex?: number;
}

export interface SurfaceBufferTarget {
	readonly pixels: Uint8ClampedArray;
	readonly heightField?: Float32Array;
	readonly width: number;
	readonly height: number;
}

export interface Canvas2DLikeTarget {
	readonly width: number;
	readonly height: number;
	getContext(contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

export type StillRenderTarget =
	| Uint8ClampedArray
	| SurfaceBufferTarget
	| Canvas2DLikeTarget
	| null
	| undefined;

function isCanvasTarget(target: StillRenderTarget): target is Canvas2DLikeTarget {
	return (
		typeof target === 'object' &&
		target !== null &&
		'getContext' in target &&
		typeof (target as Canvas2DLikeTarget).getContext === 'function'
	);
}

function isSurfaceBufferTarget(target: StillRenderTarget): target is SurfaceBufferTarget {
	return (
		typeof target === 'object' &&
		target !== null &&
		'pixels' in target &&
		(target as SurfaceBufferTarget).pixels instanceof Uint8ClampedArray
	);
}

export function renderPaintingStill(
	targetCanvasOrBuffer: StillRenderTarget,
	model: PaintingModel,
	options?: RenderPaintingStillOptions
): Uint8ClampedArray {
	const fallbackW = sanitizeDimension(model.state.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
	const fallbackH = sanitizeDimension(model.state.artboardHeight, DEFAULT_ARTBOARD_HEIGHT);
	const targetWidth =
		options?.width ??
		(isSurfaceBufferTarget(targetCanvasOrBuffer) || isCanvasTarget(targetCanvasOrBuffer)
			? targetCanvasOrBuffer.width
			: fallbackW);
	const targetHeight =
		options?.height ??
		(isSurfaceBufferTarget(targetCanvasOrBuffer) || isCanvasTarget(targetCanvasOrBuffer)
			? targetCanvasOrBuffer.height
			: fallbackH);

	const w = sanitizeDimension(targetWidth, fallbackW);
	const h = sanitizeDimension(targetHeight, fallbackH);
	const crop = sanitizeCrop(options?.crop, fallbackW, fallbackH);

	const externalPixels =
		targetCanvasOrBuffer instanceof Uint8ClampedArray
			? targetCanvasOrBuffer
			: isSurfaceBufferTarget(targetCanvasOrBuffer)
				? targetCanvasOrBuffer.pixels
				: undefined;

	const rasterizer = new SurfaceRasterizer(model, w, h, crop, externalPixels);
	const rawMaxProgress = options?.maxProgress;
	const maxProgress =
		rawMaxProgress === undefined
			? 1
			: Number.isFinite(rawMaxProgress)
				? rawMaxProgress
				: rawMaxProgress === Number.NEGATIVE_INFINITY
					? 0
					: 1;
	const rawMaxLayer = options?.maxLayerIndex;
	const maxLayerIndex = rawMaxLayer !== undefined && Number.isFinite(rawMaxLayer) ? rawMaxLayer : 6;
	const primitives = model.timeline.primitives;
	const dirty = createEmptyBounds();

	if (maxProgress > 0) {
		for (let i = 0; i < primitives.length; i++) {
			const prim = primitives[i]!;
			if (maxProgress < 1 && prim.revealAt > maxProgress) break;
			if (prim.layerIndex > maxLayerIndex) continue;
			rasterizer.rasterizePrimitive(prim, dirty);
		}
		rasterizer.commitActivePass(dirty);
		rasterizer.shadeRegion(dirty);
	}

	if (isSurfaceBufferTarget(targetCanvasOrBuffer) && targetCanvasOrBuffer.heightField) {
		targetCanvasOrBuffer.heightField.set(rasterizer.heightField);
	}

	if (isCanvasTarget(targetCanvasOrBuffer)) {
		const ctx = targetCanvasOrBuffer.getContext('2d');
		if (ctx && typeof ImageData !== 'undefined') {
			const copy = new Uint8ClampedArray(rasterizer.pixels.length);
			copy.set(rasterizer.pixels);
			ctx.putImageData(new ImageData(copy, w, h), 0, 0);
		}
	}

	return rasterizer.pixels;
}

export class ProgressiveDripBuffer {
	width: number;
	height: number;
	crop: CropRect;
	pixels: Uint8ClampedArray;
	heightField: Float32Array;

	private model: PaintingModel;
	private rasterizer: SurfaceRasterizer;
	private primitives: readonly ScheduledPrimitive[];
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
		this.heightField = this.rasterizer.heightField;
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
		this.heightField = this.rasterizer.heightField;
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

	getRenderedCount(): number {
		return this.cursor;
	}

	getTotalCount(): number {
		return this.primitives.length;
	}

	getProgress(): number {
		return this.currentProgress;
	}

	isComplete(): boolean {
		return this.cursor >= this.primitives.length;
	}

	getPixels(): Uint8ClampedArray {
		return this.pixels;
	}

	getHeightField(): Float32Array {
		return this.heightField;
	}

	advanceToCount(targetCount: number): number {
		if (!Number.isFinite(targetCount)) {
			return this.cursor;
		}
		const clamped = Math.max(
			this.cursor,
			Math.min(this.primitives.length, Math.trunc(targetCount))
		);
		if (
			clamped === this.cursor &&
			!(clamped === this.primitives.length && this.rasterizer.activePassOrderIndex !== -1)
		) {
			return this.cursor;
		}

		const dirty = createEmptyBounds();
		for (let i = this.cursor; i < clamped; i++) {
			this.rasterizer.rasterizePrimitive(this.primitives[i]!, dirty);
		}
		this.cursor = clamped;
		if (this.cursor >= this.primitives.length) {
			this.rasterizer.commitActivePass(dirty);
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
}

export function measurePaintingMetrics(
	model: PaintingModel,
	outWidth = 600,
	outHeight = 400
): PaintingMetrics {
	const w = sanitizeDimension(outWidth, 600);
	const h = sanitizeDimension(outHeight, 400);
	const totalPixels = w * h;

	const groundRgba = new Uint8ClampedArray(totalPixels * 4);
	const groundHeight = new Float32Array(totalPixels);
	renderPaintingStill(
		{ pixels: groundRgba, heightField: groundHeight, width: w, height: h },
		model,
		{ width: w, height: h, maxProgress: 0 }
	);

	const finalRgba = new Uint8ClampedArray(totalPixels * 4);
	const finalHeight = new Float32Array(totalPixels);
	renderPaintingStill({ pixels: finalRgba, heightField: finalHeight, width: w, height: h }, model, {
		width: w,
		height: h,
		maxProgress: 1
	});

	let coveredPixels = 0;
	let heightSum = 0;
	let maxHeight = 0;

	for (let i = 0; i < totalPixels; i++) {
		const off = i * 4;
		const dr = Math.abs(finalRgba[off]! - groundRgba[off]!);
		const dg = Math.abs(finalRgba[off + 1]! - groundRgba[off + 1]!);
		const db = Math.abs(finalRgba[off + 2]! - groundRgba[off + 2]!);
		const dh = Math.abs(finalHeight[i]! - groundHeight[i]!);
		if (dh > 0.08 || Math.max(dr, dg, db) > 5) {
			coveredPixels++;
		}
		const hv = finalHeight[i]!;
		heightSum += hv;
		if (hv > maxHeight) maxHeight = hv;
	}

	let poolCount = 0;
	let dropletCount = 0;
	const pigmentMass: Record<PigmentId, number> = {
		'carbon-black': 0,
		'file-tape-red': 0,
		'ledger-ochre': 0,
		'carbon-indigo': 0,
		'road-tar-umber': 0,
		'lime-whitewash': 0
	};
	let totalMass = 0;

	for (const pass of model.depositionPasses) {
		poolCount += pass.pools.length;
		dropletCount += pass.droplets.length;
		let meanHalf = 0;
		for (let k = 0; k < pass.pointCount; k++) meanHalf += pass.halfWidth[k]!;
		meanHalf = pass.pointCount > 0 ? meanHalf / pass.pointCount : 1;
		let mass = pass.totalArcLength * meanHalf;
		for (const p of pass.pools) mass += p.radius * p.radius * 0.4;
		pigmentMass[pass.pigmentKey] += mass;
		totalMass += mass;
	}

	const pigmentShares: Record<PigmentId, number> = {
		'carbon-black': totalMass > 0 ? pigmentMass['carbon-black'] / totalMass : 0,
		'file-tape-red': totalMass > 0 ? pigmentMass['file-tape-red'] / totalMass : 0,
		'ledger-ochre': totalMass > 0 ? pigmentMass['ledger-ochre'] / totalMass : 0,
		'carbon-indigo': totalMass > 0 ? pigmentMass['carbon-indigo'] / totalMass : 0,
		'road-tar-umber': totalMass > 0 ? pigmentMass['road-tar-umber'] / totalMass : 0,
		'lime-whitewash': totalMass > 0 ? pigmentMass['lime-whitewash'] / totalMass : 0
	};

	return {
		totalPixels,
		coveredPixels,
		coveragePct: (coveredPixels / totalPixels) * 100,
		meanHeight: heightSum / totalPixels,
		maxHeight,
		poolCount,
		dropletCount,
		pigmentShares
	};
}
