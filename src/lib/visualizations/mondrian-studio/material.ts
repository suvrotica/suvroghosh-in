import { deriveStream, normalizeSeed } from './prng.ts';
import { chooseRegionBrushOrientation } from './timeline.ts';
import {
	MONDRIAN_PALETTE,
	type BoundarySegment,
	type ColorAssignment,
	type LayoutModel,
	type PaintTimeline,
	type RegionColorKey,
	type SplitOrientation
} from './types.ts';

export interface PreparedPainting {
	readonly width: number;
	readonly height: number;
	readonly seed: number;
	readonly paintTexture: number;
	readonly groundRgba: Uint8ClampedArray;
	readonly coat1Rgba: Uint8ClampedArray;
	readonly finishedRgba: Uint8ClampedArray;
	/** Per-pixel Coat 1 arrival progress in [0, 1]. */
	readonly coat1At: Float32Array;
	/** Per-pixel Coat 2 arrival progress in [0, 1]. */
	readonly coat2At: Float32Array;
	/** Per-pixel black boundary arrival progress in [0, 1], or 2.0 if not a boundary pixel. */
	readonly lineAt: Float32Array;
	/** Shaded Coat 2 panel pixel underneath a black boundary before the line stroke arrives. */
	readonly underLinePacked32: Uint32Array;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
	return value < 0 ? 0 : value > 255 ? 255 : (value + 0.5) | 0;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

const NOISE_SIZE = 256;
const NOISE_MASK = NOISE_SIZE - 1;

interface SeedNoiseTables {
	readonly lowFreq: Float32Array;
	readonly bristleTable: Float32Array;
	readonly threadVarX: Float32Array;
	readonly threadVarY: Float32Array;
}

const noiseCache = new Map<number, SeedNoiseTables>();
const MAX_NOISE_CACHE = 24;

function getSeedNoiseTables(seed: number): SeedNoiseTables {
	const normalized = normalizeSeed(seed);
	const existing = noiseCache.get(normalized);
	if (existing) return existing;

	const rng = deriveStream(normalized, 'material', 'tables');
	const raw = new Float32Array(NOISE_SIZE * NOISE_SIZE);
	for (let i = 0; i < raw.length; i++) {
		raw[i] = rng.next() * 2 - 1;
	}

	// Separable box-blur passes create a smooth seamless 256x256 value field for pigment variation.
	const temp = new Float32Array(NOISE_SIZE * NOISE_SIZE);
	const lowFreq = new Float32Array(NOISE_SIZE * NOISE_SIZE);
	const radius = 6;
	const norm = 1 / (radius * 2 + 1);

	for (let y = 0; y < NOISE_SIZE; y++) {
		const row = y * NOISE_SIZE;
		for (let x = 0; x < NOISE_SIZE; x++) {
			let sum = 0;
			for (let dx = -radius; dx <= radius; dx++) {
				sum += raw[row + ((x + dx) & NOISE_MASK)]!;
			}
			temp[row + x] = sum * norm;
		}
	}
	for (let y = 0; y < NOISE_SIZE; y++) {
		for (let x = 0; x < NOISE_SIZE; x++) {
			let sum = 0;
			for (let dy = -radius; dy <= radius; dy++) {
				sum += temp[((y + dy) & NOISE_MASK) * NOISE_SIZE + x]!;
			}
			lowFreq[y * NOISE_SIZE + x] = clamp(sum * norm * 2.6, -1, 1);
		}
	}

	// 1D multi-harmonic bristle filament profile (2048 entries, periodic) for crisp hair tracks.
	const bristleLen = 2048;
	const bristleRaw = new Float32Array(bristleLen);
	for (let i = 0; i < bristleLen; i++) {
		bristleRaw[i] = rng.next() * 2 - 1;
	}
	const bristleTable = new Float32Array(bristleLen);
	for (let i = 0; i < bristleLen; i++) {
		const prev = bristleRaw[(i - 1 + bristleLen) & 2047]!;
		const curr = bristleRaw[i]!;
		const next = bristleRaw[(i + 1) & 2047]!;
		const fine = curr * 0.58 + (prev + next) * 0.21;
		const clump =
			(bristleRaw[(i - 3 + bristleLen) & 2047]! +
				bristleRaw[(i + 3) & 2047]! +
				curr * 2) *
			0.25;
		bristleTable[i] = clamp(fine * 0.72 + clump * 0.55, -1, 1);
	}

	const threadVarX = new Float32Array(1024);
	const threadVarY = new Float32Array(1024);
	for (let i = 0; i < 1024; i++) {
		threadVarX[i] = rng.range(-0.22, 0.22);
		threadVarY[i] = rng.range(-0.22, 0.22);
	}

	const tables: SeedNoiseTables = { lowFreq, bristleTable, threadVarX, threadVarY };
	if (noiseCache.size >= MAX_NOISE_CACHE) {
		const oldest = noiseCache.keys().next().value;
		if (oldest !== undefined) noiseCache.delete(oldest);
	}
	noiseCache.set(normalized, tables);
	return tables;
}

function sampleSmoothNoise(table: Float32Array, fx: number, fy: number): number {
	const sx = ((fx % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
	const sy = ((fy % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
	const x0 = sx | 0;
	const y0 = sy | 0;
	const tx = sx - x0;
	const ty = sy - y0;
	const x1 = (x0 + 1) & NOISE_MASK;
	const y1 = (y0 + 1) & NOISE_MASK;
	const a = table[y0 * NOISE_SIZE + x0]!;
	const b = table[y0 * NOISE_SIZE + x1]!;
	const c = table[y1 * NOISE_SIZE + x0]!;
	const d = table[y1 * NOISE_SIZE + x1]!;
	const ab = a + (b - a) * tx;
	const cd = c + (d - c) * tx;
	return ab + (cd - ab) * ty;
}

function sampleBristle(bristleTable: Float32Array, pos: number): number {
	const wrapped = ((pos % 2048) + 2048) % 2048;
	const i0 = wrapped | 0;
	const frac = wrapped - i0;
	const a = bristleTable[i0]!;
	const b = bristleTable[(i0 + 1) & 2047]!;
	return a + (b - a) * frac;
}

interface RegionMaterialParams {
	readonly colorKey: RegionColorKey;
	readonly baseR: number;
	readonly baseG: number;
	readonly baseB: number;
	readonly orientation: SplitOrientation;
	readonly passPitch: number;
	readonly passPhase: number;
	readonly bristleScale: number;
	readonly bristleOffset: number;
	readonly noiseOffsetX: number;
	readonly noiseOffsetY: number;
	readonly strength: number;
	readonly sheen: number;
	readonly coat1Start: number;
	readonly coat1Span: number;
	readonly coat1Dir: 1 | -1;
	readonly coat2Start: number;
	readonly coat2Span: number;
	readonly coat2Dir: 1 | -1;
	readonly axisStart: number;
	readonly axisInvLen: number;
}

interface BoundaryPixelBox {
	readonly boundary: BoundarySegment;
	readonly orientation: SplitOrientation;
	readonly px0: number;
	readonly px1: number;
	readonly py0: number;
	readonly py1: number;
	readonly centerCoordNorm: number;
	readonly halfThickNorm: number;
	readonly startNormExt: number;
	readonly endNormExt: number;
	readonly bristleOffset: number;
	readonly noiseOffset: number;
	readonly startProgress: number;
	readonly spanProgress: number;
	readonly direction: 1 | -1;
}

function findPerpendicularTouch(
	seg: BoundarySegment,
	endpoint: number,
	all: readonly BoundarySegment[],
	perpHalfThickness: number
): number {
	const EPS = 1e-4;
	// Do not extend past outer canvas border [0, 1].
	if (endpoint <= EPS || endpoint >= 1 - EPS) return 0;
	for (const other of all) {
		if (other.orientation === seg.orientation) continue;
		if (
			Math.abs(other.coord - endpoint) <= EPS &&
			seg.coord >= other.start - EPS &&
			seg.coord <= other.end + EPS
		) {
			return perpHalfThickness * 0.92;
		}
	}
	return 0;
}

/**
 * Prepares the deterministic canvas ground, brush/pigment material fields, shallow
 * paint-ridge shading, and per-pixel reveal timestamps in stable painting coordinates.
 */
export function prepareMaterial(params: {
	layout: LayoutModel;
	colors: ColorAssignment;
	timeline: PaintTimeline;
	paintTexture: number;
	width: number;
	height: number;
}): PreparedPainting {
	const width = Math.max(1, Math.round(params.width));
	const height = Math.max(1, Math.round(params.height));
	const totalPixels = width * height;
	const seed = normalizeSeed(params.layout.seed);
	const texPct = clamp(params.paintTexture, 0, 100);
	const texAmount = texPct / 100;

	const groundRgba = new Uint8ClampedArray(totalPixels * 4);
	const coat1Rgba = new Uint8ClampedArray(totalPixels * 4);
	const finishedRgba = new Uint8ClampedArray(totalPixels * 4);
	const coat1At = new Float32Array(totalPixels);
	const coat2At = new Float32Array(totalPixels);
	const lineAt = new Float32Array(totalPixels);
	lineAt.fill(2.0);
	const underLinePacked32 = new Uint32Array(totalPixels);

	const aspect = width / height;
	const shortSidePx = Math.min(width, height);
	const metricScaleX = aspect >= 1 ? aspect : 1;
	const metricScaleY = aspect >= 1 ? 1 : 1 / aspect;

	const tables = getSeedNoiseTables(seed);
	const matOrientRng = deriveStream(seed, 'material', 'orientations');
	const matRegionRng = deriveStream(seed, 'material', 'regions');
	const matLineRng = deriveStream(seed, 'material', 'lines');

	// Map timeline passes by regionId and boundaryId.
	const coat1PassMap = new Map<string, { start: number; end: number; dir: 1 | -1 }>();
	const coat2PassMap = new Map<string, { start: number; end: number; dir: 1 | -1 }>();
	for (const rp of params.timeline.regionPasses) {
		if (rp.coat === 1) {
			coat1PassMap.set(rp.regionId, {
				start: rp.startProgress,
				end: rp.endProgress,
				dir: rp.direction
			});
		} else {
			coat2PassMap.set(rp.regionId, {
				start: rp.startProgress,
				end: rp.endProgress,
				dir: rp.direction
			});
		}
	}

	const linePassMap = new Map<string, { start: number; end: number; dir: 1 | -1 }>();
	for (const bp of params.timeline.boundaryPasses) {
		linePassMap.set(bp.boundaryId, {
			start: bp.startProgress,
			end: bp.endProgress,
			dir: bp.direction
		});
	}

	const regionMaterials: RegionMaterialParams[] = params.colors.regions.map((r) => {
		const orientSub = matOrientRng.fork(r.id);
		const tie = orientSub.int(0, 1);
		const orientation = chooseRegionBrushOrientation(r.width, r.height, aspect, tie);
		const regRng = matRegionRng.fork(r.id);
		const pal = MONDRIAN_PALETTE[r.color];
		const isWhite = r.color === 'warm-white';

		const c1 = coat1PassMap.get(r.id) ?? { start: 0.02, end: 0.3, dir: 1 as const };
		const c2 = coat2PassMap.get(r.id) ?? { start: 0.25, end: 0.58, dir: 1 as const };

		const axisStart = orientation === 'horizontal' ? r.x0 : r.y0;
		const axisLen = Math.max(1e-4, orientation === 'horizontal' ? r.width : r.height);

		return {
			colorKey: r.color,
			baseR: pal.r,
			baseG: pal.g,
			baseB: pal.b,
			orientation,
			passPitch: regRng.range(0.072, 0.125),
			passPhase: regRng.range(0, 1),
			bristleScale: regRng.range(430, 540),
			bristleOffset: regRng.range(0, 2048),
			noiseOffsetX: regRng.range(0, 256),
			noiseOffsetY: regRng.range(0, 256),
			// White oil areas receive deliberate brushwork while staying luminous and clean.
			strength: isWhite ? 0.78 : 1.0,
			sheen: isWhite ? 0.24 : r.color === 'yellow' ? 0.28 : 0.42,
			coat1Start: c1.start,
			coat1Span: Math.max(0.02, c1.end - c1.start),
			coat1Dir: c1.dir,
			coat2Start: c2.start,
			coat2Span: Math.max(0.02, c2.end - c2.start),
			coat2Dir: c2.dir,
			axisStart,
			axisInvLen: 1 / axisLen
		};
	});

	// Precompute 1D canvas weave coordinates along X and Y in stable painting coordinates.
	const weaveFreq = 265;
	const weaveVisibility =
		texAmount === 0 ? 0 : clamp((shortSidePx / weaveFreq - 0.85) / 1.45, 0.28, 1.0);

	const mxArr = new Float32Array(width);
	const uArr = new Float32Array(width);
	const warpCrown = new Float32Array(width);
	const warpThreadIdx = new Int32Array(width);
	for (let x = 0; x < width; x++) {
		const u = (x + 0.5) / width;
		const mx = u * metricScaleX;
		uArr[x] = u;
		mxArr[x] = mx;
		const wx = mx * weaveFreq;
		const tx = wx | 0;
		warpThreadIdx[x] = tx;
		const frac = wx - tx;
		const crown = Math.sin(frac * Math.PI);
		warpCrown[x] = (crown - 0.62) * (1 + tables.threadVarX[tx & 1023]!);
	}

	const myArr = new Float32Array(height);
	const vArr = new Float32Array(height);
	const weftCrown = new Float32Array(height);
	const weftThreadIdx = new Int32Array(height);
	for (let y = 0; y < height; y++) {
		const v = (y + 0.5) / height;
		const my = v * metricScaleY;
		vArr[y] = v;
		myArr[y] = my;
		const wy = my * weaveFreq;
		const ty = wy | 0;
		weftThreadIdx[y] = ty;
		const frac = wy - ty;
		const crown = Math.sin(frac * Math.PI);
		weftCrown[y] = (crown - 0.62) * (1 + tables.threadVarY[ty & 1023]!);
	}

	// Rasterize panel index per pixel (strictly clipped to region interior).
	const regionIndexMap = new Uint16Array(totalPixels);
	for (let idx = 0; idx < params.colors.regions.length; idx++) {
		const r = params.colors.regions[idx]!;
		const xStart = idx === 0 || r.x0 <= 1e-6 ? 0 : clamp(Math.floor(r.x0 * width), 0, width);
		const xEnd = r.x1 >= 1 - 1e-6 ? width : clamp(Math.ceil(r.x1 * width), xStart, width);
		const yStart = idx === 0 || r.y0 <= 1e-6 ? 0 : clamp(Math.floor(r.y0 * height), 0, height);
		const yEnd = r.y1 >= 1 - 1e-6 ? height : clamp(Math.ceil(r.y1 * height), yStart, height);

		for (let y = yStart; y < yEnd; y++) {
			const v = vArr[y]!;
			if (v < r.y0 - 1e-7 || v > r.y1 + 1e-7) continue;
			const rowOff = y * width;
			for (let x = xStart; x < xEnd; x++) {
				const u = uArr[x]!;
				if (u >= r.x0 - 1e-7 && u <= r.x1 + 1e-7) {
					regionIndexMap[rowOff + x] = idx;
				}
			}
		}
	}

	// Prepared warm linen ground tone (derived from quiet-gray #D8D5CC + warm sizing).
	const groundBaseR = 223;
	const groundBaseG = 219;
	const groundBaseB = 208;

	// Height field for finished paint surface so finite-difference lighting uses one unified relief.
	const heightField = texAmount > 0 ? new Float32Array(totalPixels) : null;
	const sheenField = texAmount > 0 ? new Float32Array(totalPixels) : null;
	const baseRgbBuffer = new Uint8Array(totalPixels * 3);

	for (let y = 0; y < height; y++) {
		const v = vArr[y]!;
		const my = myArr[y]!;
		const ty = weftThreadIdx[y]!;
		const wcY = weftCrown[y]!;
		const rowOff = y * width;

		for (let x = 0; x < width; x++) {
			const pIdx = rowOff + x;
			const p4 = pIdx * 4;
			const p3 = pIdx * 3;
			const u = uArr[x]!;
			const mx = mxArr[x]!;
			const tx = warpThreadIdx[x]!;
			const wcX = warpCrown[x]!;

			const overWarp = ((tx + ty) & 1) === 0;
			const weaveRaw = (overWarp ? wcX * 0.72 + wcY * 0.28 : wcY * 0.72 + wcX * 0.28) * weaveVisibility;

			// Ground pixel (warm sized linen before oil passes arrive).
			const groundGrain = sampleSmoothNoise(tables.lowFreq, mx * 36 + 17, my * 36 + 53);
			const gShade = (weaveRaw * 7.5 + groundGrain * 3.2) * (0.35 + 0.65 * texAmount);
			const gR = clampByte(groundBaseR + gShade);
			const gG = clampByte(groundBaseG + gShade * 0.98);
			const gB = clampByte(groundBaseB + gShade * 0.94);
			groundRgba[p4] = gR;
			groundRgba[p4 + 1] = gG;
			groundRgba[p4 + 2] = gB;
			groundRgba[p4 + 3] = 255;

			const regIdx = regionIndexMap[pIdx]!;
			const rm = regionMaterials[regIdx]!;

			const alongNorm =
				rm.orientation === 'horizontal'
					? clamp((u - rm.axisStart) * rm.axisInvLen, 0, 1)
					: clamp((v - rm.axisStart) * rm.axisInvLen, 0, 1);
			const alongMetric = rm.orientation === 'horizontal' ? mx : my;
			const transMetric = rm.orientation === 'horizontal' ? my : mx;

			// Broad overlapping brush pass ribbon across the transverse axis.
			const ribbonPos = transMetric / rm.passPitch + rm.passPhase;
			const ribbonIdx = Math.floor(ribbonPos);
			const ribbonFrac = ribbonPos - ribbonIdx;
			// Overlap ridge peaks near 0 and 1 where two flat-brush passes overlap.
			const edgeProx = 1 - Math.min(ribbonFrac, 1 - ribbonFrac) * 2;
			const passOverlapRidge = edgeProx * edgeProx * 0.55;

			// Slight natural waviness along the stroke so bristles are hand-pulled, not laser-ruled.
			const strokeWaver =
				sampleSmoothNoise(
					tables.lowFreq,
					alongMetric * 14 + rm.noiseOffsetX,
					transMetric * 14 + rm.noiseOffsetY
				) * 0.0024;
			const bristleCoord = (transMetric + strokeWaver) * rm.bristleScale + rm.bristleOffset + (ribbonIdx & 7) * 37;
			const bristleTrack = sampleBristle(tables.bristleTable, bristleCoord);
			const alongMod =
				0.72 +
				0.28 *
					sampleSmoothNoise(
						tables.lowFreq,
						alongMetric * 9.5 + rm.noiseOffsetY,
						transMetric * 32 + rm.noiseOffsetX
					);
			const bristleGroove = bristleTrack * alongMod;

			// Deterministic per-pixel reveal progress with ragged bristle leading edge & ribbon stagger.
			const sweepCoord1 = rm.coat1Dir === 1 ? alongNorm : 1 - alongNorm;
			const sweepCoord2 = rm.coat2Dir === 1 ? alongNorm : 1 - alongNorm;
			const ribbonJitter = (((ribbonIdx * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.14;
			const leadBristleJitter = bristleTrack * 0.055;

			const localT1 = clamp(sweepCoord1 * 0.84 + 0.08 + ribbonJitter + leadBristleJitter, 0, 1);
			const localT2 = clamp(sweepCoord2 * 0.86 + 0.07 - ribbonJitter * 0.6 + leadBristleJitter * 0.7, 0, 1);
			coat1At[pIdx] = rm.coat1Start + localT1 * rm.coat1Span;
			coat2At[pIdx] = Math.max(coat1At[pIdx] + 0.012, rm.coat2Start + localT2 * rm.coat2Span);

			if (texAmount === 0) {
				baseRgbBuffer[p3] = rm.baseR;
				baseRgbBuffer[p3 + 1] = rm.baseG;
				baseRgbBuffer[p3 + 2] = rm.baseB;

				// Even with 0% surface texture, Coat 1 during playback builds from ~74% over warm linen.
				coat1Rgba[p4] = clampByte(gR + (rm.baseR - gR) * 0.76);
				coat1Rgba[p4 + 1] = clampByte(gG + (rm.baseG - gG) * 0.76);
				coat1Rgba[p4 + 2] = clampByte(gB + (rm.baseB - gB) * 0.76);
				coat1Rgba[p4 + 3] = 255;
				continue;
			}

			// Low-frequency pigment coverage & tone variation (strictly pigment-true, zero secondary hues).
			const lowPigment = sampleSmoothNoise(
				tables.lowFreq,
				mx * 22 + rm.noiseOffsetX,
				my * 22 + rm.noiseOffsetY
			);
			const medPigment = sampleSmoothNoise(
				tables.lowFreq,
				mx * 58 + rm.noiseOffsetY * 0.7,
				my * 58 + rm.noiseOffsetX * 0.7
			);
			const toneDelta = (lowPigment * 0.68 + medPigment * 0.32) * texAmount * rm.strength;

			let rCol = rm.baseR;
			let gCol = rm.baseG;
			let bCol = rm.baseB;

			if (rm.colorKey === 'warm-white') {
				// Subtle titanium/warm-ivory oil body variation while staying brighter than controls.
				rCol += toneDelta * 5.2 + bristleGroove * texAmount * 2.1;
				gCol += toneDelta * 4.9 + bristleGroove * texAmount * 2.0;
				bCol += toneDelta * 4.1 + bristleGroove * texAmount * 1.7;
			} else if (rm.colorKey === 'red') {
				rCol += toneDelta * 9.5 + bristleGroove * texAmount * 4.2;
				gCol += toneDelta * 4.2 + bristleGroove * texAmount * 1.8;
				bCol += toneDelta * 3.4 + bristleGroove * texAmount * 1.5;
			} else if (rm.colorKey === 'yellow') {
				rCol += toneDelta * 8.0 + bristleGroove * texAmount * 3.5;
				gCol += toneDelta * 7.2 + bristleGroove * texAmount * 3.1;
				bCol += toneDelta * 3.6 + bristleGroove * texAmount * 1.4;
			} else {
				// Blue
				rCol += toneDelta * 3.5 + bristleGroove * texAmount * 1.6;
				gCol += toneDelta * 5.8 + bristleGroove * texAmount * 2.5;
				bCol += toneDelta * 10.5 + bristleGroove * texAmount * 4.4;
			}

			baseRgbBuffer[p3] = clampByte(rCol);
			baseRgbBuffer[p3 + 1] = clampByte(gCol);
			baseRgbBuffer[p3 + 2] = clampByte(bCol);

			// Coat 1 shows streaky partial coverage over the linen ground before Coat 2 seals it.
			const coat1Cov = clamp(0.68 + bristleGroove * 0.16 + passOverlapRidge * 0.12, 0.46, 0.9);
			coat1Rgba[p4] = clampByte(gR + (rCol - gR) * coat1Cov);
			coat1Rgba[p4 + 1] = clampByte(gG + (gCol - gG) * coat1Cov);
			coat1Rgba[p4 + 2] = clampByte(gB + (bCol - gB) * coat1Cov);
			coat1Rgba[p4 + 3] = 255;

			heightField![pIdx] =
				(weaveRaw * 0.42 + passOverlapRidge * 0.66 + bristleGroove * 0.62) *
				texAmount *
				rm.strength;
			sheenField![pIdx] = rm.sheen;
		}
	}

	// Prepare shared black boundaries once into a unified mask so crossings and T-junctions
	// never accumulate double alpha seams or leave corner notches.
	const halfThickX = params.layout.lineThicknessX * 0.5;
	const halfThickY = params.layout.lineThicknessY * 0.5;
	const blackPal = MONDRIAN_PALETTE['near-black'];

	const lineBoxes: BoundaryPixelBox[] = params.layout.boundaries.map((b) => {
		const sub = matLineRng.fork(b.id);
		const bp = linePassMap.get(b.id) ?? { start: 0.68, end: 0.94, dir: 1 as const };
		const perpHalf = b.orientation === 'horizontal' ? halfThickX : halfThickY;
		const startExt = findPerpendicularTouch(b, b.start, params.layout.boundaries, perpHalf);
		const endExt = findPerpendicularTouch(b, b.end, params.layout.boundaries, perpHalf);
		const startNormExt = clamp(b.start - startExt, 0, 1);
		const endNormExt = clamp(b.end + endExt, 0, 1);

		const marginX = halfThickX * 1.25 + 2 / width;
		const marginY = halfThickY * 1.25 + 2 / height;

		if (b.orientation === 'horizontal') {
			return {
				boundary: b,
				orientation: 'horizontal',
				px0: clamp(Math.floor((startNormExt - 1 / width) * width), 0, width),
				px1: clamp(Math.ceil((endNormExt + 1 / width) * width), 0, width),
				py0: clamp(Math.floor((b.coord - marginY) * height), 0, height),
				py1: clamp(Math.ceil((b.coord + marginY) * height), 0, height),
				centerCoordNorm: b.coord,
				halfThickNorm: halfThickY,
				startNormExt,
				endNormExt,
				bristleOffset: sub.range(0, 2048),
				noiseOffset: sub.range(0, 256),
				startProgress: bp.start,
				spanProgress: Math.max(0.02, bp.end - bp.start),
				direction: bp.dir
			};
		}

		return {
			boundary: b,
			orientation: 'vertical',
			px0: clamp(Math.floor((b.coord - marginX) * width), 0, width),
			px1: clamp(Math.ceil((b.coord + marginX) * width), 0, width),
			py0: clamp(Math.floor((startNormExt - 1 / height) * height), 0, height),
			py1: clamp(Math.ceil((endNormExt + 1 / height) * height), 0, height),
			centerCoordNorm: b.coord,
			halfThickNorm: halfThickX,
			startNormExt,
			endNormExt,
			bristleOffset: sub.range(0, 2048),
			noiseOffset: sub.range(0, 256),
			startProgress: bp.start,
			spanProgress: Math.max(0.02, bp.end - bp.start),
			direction: bp.dir
		};
	});

	// Coverage buffer ensures shared boundaries and crossings blend cleanly into the surface once.
	const lineCoverage = new Float32Array(totalPixels);
	const lineToneBuf = new Float32Array(totalPixels);
	const lineHeightBuf = texAmount > 0 ? new Float32Array(totalPixels) : null;

	for (const box of lineBoxes) {
		const axisLen = Math.max(1e-4, box.endNormExt - box.startNormExt);
		const invAxisLen = 1 / axisLen;
		const pxSoftNorm =
			box.orientation === 'horizontal' ? 0.65 / height : 0.65 / width;

		for (let y = box.py0; y < box.py1; y++) {
			const v = vArr[y]!;
			const my = myArr[y]!;
			const rowOff = y * width;

			for (let x = box.px0; x < box.px1; x++) {
				const u = uArr[x]!;
				const mx = mxArr[x]!;
				const pIdx = rowOff + x;

				const alongNorm = box.orientation === 'horizontal' ? u : v;
				if (alongNorm < box.startNormExt || alongNorm > box.endNormExt) continue;

				const alongMetric = box.orientation === 'horizontal' ? mx : my;
				const transMetric = box.orientation === 'horizontal' ? my : mx;
				const perpDistNorm = Math.abs(
					(box.orientation === 'horizontal' ? v : u) - box.centerCoordNorm
				);

				// Very small edge micro-irregularity keeping overall line unmistakably straight.
				let effectiveHalf = box.halfThickNorm;
				if (texAmount > 0) {
					const edgeWave = sampleSmoothNoise(
						tables.lowFreq,
						alongMetric * 88 + box.noiseOffset,
						box.noiseOffset * 1.7
					);
					const maxJitter = Math.min(box.halfThickNorm * 0.085, 0.00052 * (box.orientation === 'horizontal' ? metricScaleY : metricScaleX));
					effectiveHalf += edgeWave * maxJitter * texAmount;
				}

				if (perpDistNorm > effectiveHalf + pxSoftNorm) continue;

				const cov =
					texAmount === 0 && pxSoftNorm > 0
						? 1 - smoothstep(effectiveHalf - pxSoftNorm * 0.5, effectiveHalf + pxSoftNorm * 0.5, perpDistNorm)
						: 1 - smoothstep(effectiveHalf - pxSoftNorm * 0.6, effectiveHalf + pxSoftNorm * 0.6, perpDistNorm);
				if (cov <= 0.002) continue;

				const bristle =
					texAmount > 0
						? sampleBristle(
								tables.bristleTable,
								transMetric * 560 + box.bristleOffset
							)
						: 0;
				const alongTex =
					texAmount > 0
						? sampleSmoothNoise(
								tables.lowFreq,
								alongMetric * 28 + box.noiseOffset,
								transMetric * 90 + box.noiseOffset
							)
						: 0;

				const relEdge = clamp(perpDistNorm / Math.max(1e-5, effectiveHalf), 0, 1);
				const edgeBead = relEdge > 0.72 ? (relEdge - 0.72) * 1.15 : 0;

				const localFrac = clamp((alongNorm - box.startNormExt) * invAxisLen, 0, 1);
				const sweepFrac = box.direction === 1 ? localFrac : 1 - localFrac;
				const tipJitter = bristle * 0.035 * texAmount;
				const arrival = box.startProgress + clamp(sweepFrac * 0.92 + 0.04 + tipJitter, 0, 1) * box.spanProgress;

				// Max coverage without double-darkening crossings; later stroke lays its directional bristle on top.
				if (cov >= lineCoverage[pIdx]! - 0.02) {
					lineCoverage[pIdx] = Math.max(lineCoverage[pIdx]!, cov);
					lineToneBuf[pIdx] = (alongTex * 3.8 + bristle * 3.2) * texAmount;
					if (lineHeightBuf) {
						const weaveHere =
							(((warpThreadIdx[x]! + weftThreadIdx[y]!) & 1) === 0
								? warpCrown[x]!
								: weftCrown[y]!) *
							weaveVisibility *
							0.2;
						lineHeightBuf[pIdx] = (weaveHere + bristle * 0.44 + edgeBead * 0.38 + 0.22) * texAmount;
					}
					if (arrival < lineAt[pIdx]!) {
						lineAt[pIdx] = arrival;
					}
				}
			}
		}
	}

	// Capture shaded Coat 2 panel pixels beneath boundary strokes so future black lines never
	// show a premature ghost before the boundary brush pass sweeps across them.
	const gradScale = clamp(shortSidePx / 900, 0.65, 1.55) * 0.85;
	const lx = -0.58;
	const ly = -0.66;
	const lz = 0.48;
	const hx = -0.34;
	const hy = -0.39;
	const hz = 0.855;

	for (let y = 0; y < height; y++) {
		const row = y * width;
		const yPrev = y > 0 ? y - 1 : 0;
		const yNext = y + 1 < height ? y + 1 : height - 1;
		const rowPrev = yPrev * width;
		const rowNext = yNext * width;
		for (let x = 0; x < width; x++) {
			const pIdx = row + x;
			if (lineCoverage[pIdx]! <= 0) continue;
			const p3 = pIdx * 3;
			if (texAmount === 0 || !heightField || !sheenField) {
				const r = baseRgbBuffer[p3]!;
				const g = baseRgbBuffer[p3 + 1]!;
				const b = baseRgbBuffer[p3 + 2]!;
				underLinePacked32[pIdx] = (255 << 24) | (b << 16) | (g << 8) | r;
			} else {
				const xPrev = x > 0 ? x - 1 : 0;
				const xNext = x + 1 < width ? x + 1 : width - 1;
				const dhx = clamp((heightField[row + xNext]! - heightField[row + xPrev]!) * gradScale, -0.45, 0.45);
				const dhy = clamp((heightField[rowNext + x]! - heightField[rowPrev + x]!) * gradScale, -0.45, 0.45);
				const nx = -dhx;
				const ny = -dhy;
				const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);
				const diffuseDelta = ((nx * lx + ny * ly + lz) * invLen - lz) * 33;
				const ndoth = Math.max(0, (nx * hx + ny * hy + hz) * invLen);
				const spec = Math.pow(ndoth, 18) * sheenField[pIdx]! * 13 * texAmount;
				const r = clampByte(baseRgbBuffer[p3]! + diffuseDelta + spec);
				const g = clampByte(baseRgbBuffer[p3 + 1]! + diffuseDelta * 0.98 + spec * 0.97);
				const b = clampByte(baseRgbBuffer[p3 + 2]! + diffuseDelta * 0.94 + spec * 0.92);
				underLinePacked32[pIdx] = (255 << 24) | (b << 16) | (g << 8) | r;
			}
		}
	}

	// Composite black boundary base color and height into the unified finished buffers.
	for (let pIdx = 0; pIdx < totalPixels; pIdx++) {
		const cov = lineCoverage[pIdx]!;
		if (cov <= 0) continue;
		const p3 = pIdx * 3;
		const tone = lineToneBuf[pIdx]!;
		const lR = clamp(blackPal.r + tone, 8, 46);
		const lG = clamp(blackPal.g + tone, 8, 46);
		const lB = clamp(blackPal.b + tone * 0.95, 6, 44);

		baseRgbBuffer[p3] = clampByte(baseRgbBuffer[p3]! + (lR - baseRgbBuffer[p3]!) * cov);
		baseRgbBuffer[p3 + 1] = clampByte(baseRgbBuffer[p3 + 1]! + (lG - baseRgbBuffer[p3 + 1]!) * cov);
		baseRgbBuffer[p3 + 2] = clampByte(baseRgbBuffer[p3 + 2]! + (lB - baseRgbBuffer[p3 + 2]!) * cov);

		if (heightField && sheenField && lineHeightBuf) {
			heightField[pIdx] = heightField[pIdx]! * (1 - cov) + lineHeightBuf[pIdx]! * cov;
			sheenField[pIdx] = sheenField[pIdx]! * (1 - cov) + 0.52 * cov;
		}
	}

	// Final surface lighting pass (single fixed top-left raking gallery light).
	if (texAmount === 0 || !heightField || !sheenField) {
		for (let pIdx = 0; pIdx < totalPixels; pIdx++) {
			const p3 = pIdx * 3;
			const p4 = pIdx * 4;
			finishedRgba[p4] = baseRgbBuffer[p3]!;
			finishedRgba[p4 + 1] = baseRgbBuffer[p3 + 1]!;
			finishedRgba[p4 + 2] = baseRgbBuffer[p3 + 2]!;
			finishedRgba[p4 + 3] = 255;
		}
	} else {
		for (let y = 0; y < height; y++) {
			const yPrev = y > 0 ? y - 1 : 0;
			const yNext = y + 1 < height ? y + 1 : height - 1;
			const row = y * width;
			const rowPrev = yPrev * width;
			const rowNext = yNext * width;

			for (let x = 0; x < width; x++) {
				const xPrev = x > 0 ? x - 1 : 0;
				const xNext = x + 1 < width ? x + 1 : width - 1;
				const pIdx = row + x;
				const p3 = pIdx * 3;
				const p4 = pIdx * 4;

				const dhx = clamp((heightField[row + xNext]! - heightField[row + xPrev]!) * gradScale, -0.45, 0.45);
				const dhy = clamp((heightField[rowNext + x]! - heightField[rowPrev + x]!) * gradScale, -0.45, 0.45);

				const nx = -dhx;
				const ny = -dhy;
				const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);
				const ndotl = (nx * lx + ny * ly + lz) * invLen;
				const baseNdotl = lz;
				const diffuseDelta = (ndotl - baseNdotl) * 33;

				const ndoth = Math.max(0, (nx * hx + ny * hy + hz) * invLen);
				const spec = Math.pow(ndoth, 18) * sheenField[pIdx]! * 13 * texAmount;

				finishedRgba[p4] = clampByte(baseRgbBuffer[p3]! + diffuseDelta + spec);
				finishedRgba[p4 + 1] = clampByte(baseRgbBuffer[p3 + 1]! + diffuseDelta * 0.98 + spec * 0.97);
				finishedRgba[p4 + 2] = clampByte(baseRgbBuffer[p3 + 2]! + diffuseDelta * 0.94 + spec * 0.92);
				finishedRgba[p4 + 3] = 255;
			}
		}
	}

	return {
		width,
		height,
		seed,
		paintTexture: texPct,
		groundRgba,
		coat1Rgba,
		finishedRgba,
		coat1At,
		coat2At,
		lineAt,
		underLinePacked32
	};
}

/**
 * Renders the prepared painting at normalized timeline progress in [0, 1] into targetRgba.
 * At progress >= 1, copies finishedRgba directly so still preview, Finish now, completed
 * playback, and export agree bit-for-bit at identical dimensions.
 */
export function renderPainting(
	prepared: PreparedPainting,
	progress: number,
	targetRgba?: Uint8ClampedArray
): Uint8ClampedArray {
	const out = targetRgba ?? new Uint8ClampedArray(prepared.finishedRgba.length);
	if (progress >= 1) {
		out.set(prepared.finishedRgba);
		return out;
	}
	if (progress <= 0) {
		out.set(prepared.groundRgba);
		return out;
	}

	const out32 = new Uint32Array(out.buffer, out.byteOffset, prepared.width * prepared.height);
	const ground32 = new Uint32Array(
		prepared.groundRgba.buffer,
		prepared.groundRgba.byteOffset,
		prepared.width * prepared.height
	);
	const coat132 = new Uint32Array(
		prepared.coat1Rgba.buffer,
		prepared.coat1Rgba.byteOffset,
		prepared.width * prepared.height
	);
	const fin32 = new Uint32Array(
		prepared.finishedRgba.buffer,
		prepared.finishedRgba.byteOffset,
		prepared.width * prepared.height
	);

	const { coat1At, coat2At, lineAt, underLinePacked32 } = prepared;
	const n = prepared.width * prepared.height;
	const soft = 0.014;

	for (let i = 0; i < n; i++) {
		const lAt = lineAt[i]!;
		const c2 = coat2At[i]!;
		const c1 = coat1At[i]!;

		if (lAt > 1.0) {
			if (progress >= c2 + soft) {
				out32[i] = fin32[i]!;
			} else if (progress < c1) {
				out32[i] = ground32[i]!;
			} else if (progress < c1 + soft) {
				out32[i] = blendPacked(ground32[i]!, coat132[i]!, (progress - c1) / soft);
			} else if (progress < c2) {
				out32[i] = coat132[i]!;
			} else {
				out32[i] = blendPacked(coat132[i]!, fin32[i]!, (progress - c2) / soft);
			}
			continue;
		}

		if (progress >= lAt + soft && progress >= c2 + soft) {
			out32[i] = fin32[i]!;
			continue;
		}

		let panelPixel: number;
		if (progress < c1) {
			panelPixel = ground32[i]!;
		} else if (progress < c1 + soft) {
			panelPixel = blendPacked(ground32[i]!, coat132[i]!, (progress - c1) / soft);
		} else if (progress < c2) {
			panelPixel = coat132[i]!;
		} else if (progress < c2 + soft) {
			panelPixel = blendPacked(coat132[i]!, underLinePacked32[i]!, (progress - c2) / soft);
		} else {
			panelPixel = underLinePacked32[i]!;
		}

		if (progress <= lAt) {
			out32[i] = panelPixel;
		} else {
			out32[i] = blendPacked(panelPixel, fin32[i]!, clamp((progress - lAt) / soft, 0, 1));
		}
	}

	return out;
}

function blendPacked(a: number, b: number, t: number): number {
	const w = (t * 256) | 0;
	const inv = 256 - w;
	const r = (((a & 0xff) * inv + (b & 0xff) * w) >> 8) & 0xff;
	const g = ((((a >>> 8) & 0xff) * inv + ((b >>> 8) & 0xff) * w) >> 8) & 0xff;
	const bl = ((((a >>> 16) & 0xff) * inv + ((b >>> 16) & 0xff) * w) >> 8) & 0xff;
	return (255 << 24) | (bl << 16) | (g << 8) | r;
}

export function computeExportDimensions(
	longSidePx: number,
	aspectRatio: number
): { width: number; height: number } {
	const clampedLong = clamp(Math.round(longSidePx), 256, 4096);
	const safeAspect = clamp(Number.isFinite(aspectRatio) ? aspectRatio : 1.5, 0.15, 6.5);
	if (safeAspect >= 1) {
		const width = clampedLong;
		const height = Math.max(64, Math.round(clampedLong / safeAspect));
		return { width, height };
	}
	const height = clampedLong;
	const width = Math.max(64, Math.round(clampedLong * safeAspect));
	return { width, height };
}
