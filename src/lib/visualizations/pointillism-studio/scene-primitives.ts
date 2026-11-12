import { smoothNoise2D, type SeededRng } from './prng.ts';
import {
	SURFACE_CATEGORY_INDEX,
	type FocalArea,
	type SceneFields,
	type SceneFigure,
	type SurfaceCategory
} from './types.ts';

export type RgbTuple = readonly [number, number, number];

export function clampByte(v: number): number {
	return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function lerpRgb(c1: RgbTuple, c2: RgbTuple, t: number): RgbTuple {
	const u = Math.max(0, Math.min(1, t));
	return [
		clampByte(c1[0] + (c2[0] - c1[0]) * u),
		clampByte(c1[1] + (c2[1] - c1[1]) * u),
		clampByte(c1[2] + (c2[2] - c1[2]) * u)
	];
}

export function scaleRgb(c: RgbTuple, factor: number, coolShift = 0): RgbTuple {
	return [
		clampByte(c[0] * factor - coolShift * 10),
		clampByte(c[1] * factor - coolShift * 3),
		clampByte(c[2] * factor + coolShift * 12)
	];
}

function quantizeAngle(rad: number): number {
	let a = rad % Math.PI;
	if (a < 0) a += Math.PI;
	return Math.max(0, Math.min(255, Math.round((a / Math.PI) * 255)));
}

export class FieldBuilder {
	readonly fieldWidth: number;
	readonly fieldHeight: number;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly scaleX: number;
	readonly scaleY: number;

	readonly rgb: Uint8Array;
	readonly depth: Float32Array;
	readonly objectId: Uint16Array;
	readonly category: Uint8Array;
	readonly lit: Uint8Array;
	readonly tangentAngle: Uint8Array;
	readonly anisotropy: Uint8Array;

	private nextObjectId = 2;

	constructor(artboardWidth: number, artboardHeight: number) {
		this.artboardWidth = artboardWidth;
		this.artboardHeight = artboardHeight;
		const maxFieldSide = 600;
		const longest = Math.max(artboardWidth, artboardHeight);
		const ratio = maxFieldSide / longest;
		this.fieldWidth = Math.max(160, Math.round(artboardWidth * ratio));
		this.fieldHeight = Math.max(120, Math.round(artboardHeight * ratio));
		this.scaleX = this.fieldWidth / artboardWidth;
		this.scaleY = this.fieldHeight / artboardHeight;

		const total = this.fieldWidth * this.fieldHeight;
		this.rgb = new Uint8Array(total * 3);
		this.depth = new Float32Array(total);
		this.depth.fill(1.0);
		this.objectId = new Uint16Array(total);
		this.objectId.fill(1);
		this.category = new Uint8Array(total);
		this.lit = new Uint8Array(total);
		this.lit.fill(210);
		this.tangentAngle = new Uint8Array(total);
		this.anisotropy = new Uint8Array(total);
	}

	allocId(): number {
		const id = this.nextObjectId;
		this.nextObjectId = Math.min(65530, this.nextObjectId + 1);
		return id;
	}

	setPixel(
		fx: number,
		fy: number,
		d: number,
		id: number,
		cat: SurfaceCategory,
		color: RgbTuple,
		litVal: number,
		angleRad = 0,
		aniso = 0.15
	): void {
		if (fx < 0 || fx >= this.fieldWidth || fy < 0 || fy >= this.fieldHeight) return;
		const idx = fy * this.fieldWidth + fx;
		if (d > this.depth[idx]! + 1e-5) return;
		this.depth[idx] = d;
		this.objectId[idx] = id;
		this.category[idx] = SURFACE_CATEGORY_INDEX[cat];
		this.lit[idx] = clampByte(litVal * 255);
		this.tangentAngle[idx] = quantizeAngle(angleRad);
		this.anisotropy[idx] = clampByte(aniso * 255);
		const c3 = idx * 3;
		this.rgb[c3] = color[0];
		this.rgb[c3 + 1] = color[1];
		this.rgb[c3 + 2] = color[2];
	}

	fillSkyGradient(
		zenithRgb: RgbTuple,
		horizonRgb: RgbTuple,
		horizonYNorm: number,
		seed: number
	): void {
		const skyId = this.allocId();
		const hLimit = Math.max(0.2, horizonYNorm);
		for (let fy = 0; fy < this.fieldHeight; fy++) {
			const yn = fy / Math.max(1, this.fieldHeight - 1);
			const t = Math.min(1, Math.pow(Math.max(0, yn / hLimit), 0.85));
			const rowColor = lerpRgb(zenithRgb, horizonRgb, t);
			for (let fx = 0; fx < this.fieldWidth; fx++) {
				const xn = fx / Math.max(1, this.fieldWidth - 1);
				const haze = (smoothNoise2D(seed, xn * 5.5, yn * 4.2, 1) - 0.5) * 8;
				this.setPixel(
					fx,
					fy,
					0.995,
					skyId,
					'sky',
					[
						clampByte(rowColor[0] + haze),
						clampByte(rowColor[1] + haze * 0.9),
						clampByte(rowColor[2] + haze * 0.6)
					],
					0.92,
					0,
					0.1
				);
			}
		}
	}

	drawCloudBank(
		cx: number,
		cy: number,
		rx: number,
		ry: number,
		litRgb: RgbTuple,
		shadeRgb: RgbTuple,
		lightDirX: number,
		rng: SeededRng
	): void {
		const id = this.allocId();
		const puffs = 5;
		for (let i = 0; i < puffs; i++) {
			const u = (i / (puffs - 1)) * 2 - 1;
			const px = cx + u * rx * 0.68;
			const py = cy + Math.abs(u) * ry * 0.22 + rng.signed() * ry * 0.12;
			const prx = rx * (0.46 - Math.abs(u) * 0.14);
			const pry = ry * (0.68 - Math.abs(u) * 0.18);
			this.fillShadedEllipse(px, py, prx, pry, 0.985, id, 'cloud', litRgb, shadeRgb, lightDirX, -0.5, 0.88, 0, 0.22);
		}
	}

	fillPolygon(
		points: readonly (readonly [number, number])[],
		opts: {
			depthTop: number;
			depthBottom?: number;
			id?: number;
			category: SurfaceCategory;
			colorTop: RgbTuple;
			colorBottom?: RgbTuple;
			lit?: number;
			angleRad?: number;
			anisotropy?: number;
			noiseSeed?: number;
			noiseAmount?: number;
		}
	): number {
		if (points.length < 3) return 0;
		const id = opts.id ?? this.allocId();
		let minY = Infinity;
		let maxY = -Infinity;
		for (const p of points) {
			if (p[1] < minY) minY = p[1];
			if (p[1] > maxY) maxY = p[1];
		}

		const fyStart = Math.max(0, Math.floor(minY * this.scaleY));
		const fyEnd = Math.min(this.fieldHeight - 1, Math.ceil(maxY * this.scaleY));
		const dBot = opts.depthBottom ?? opts.depthTop;
		const cBot = opts.colorBottom ?? opts.colorTop;
		const litVal = opts.lit ?? 0.78;
		const angleRad = opts.angleRad ?? 0;
		const aniso = opts.anisotropy ?? 0.18;
		const noiseAmp = opts.noiseAmount ?? 0;
		const noiseSeed = opts.noiseSeed ?? 17;

		const intersections: number[] = [];
		for (let fy = fyStart; fy <= fyEnd; fy++) {
			const ly = (fy + 0.5) / this.scaleY;
			const vt = maxY > minY + 1e-3 ? Math.max(0, Math.min(1, (ly - minY) / (maxY - minY))) : 0;
			const rowDepth = lerp(opts.depthTop, dBot, vt);
			const baseColor = lerpRgb(opts.colorTop, cBot, vt);

			intersections.length = 0;
			for (let i = 0; i < points.length; i++) {
				const p1 = points[i]!;
				const p2 = points[(i + 1) % points.length]!;
				if ((p1[1] <= ly && p2[1] > ly) || (p2[1] <= ly && p1[1] > ly)) {
					const t = (ly - p1[1]) / (p2[1] - p1[1]);
					intersections.push(p1[0] + t * (p2[0] - p1[0]));
				}
			}
			intersections.sort((a, b) => a - b);

			for (let k = 0; k + 1 < intersections.length; k += 2) {
				const fxStart = Math.max(0, Math.floor(intersections[k]! * this.scaleX));
				const fxEnd = Math.min(this.fieldWidth - 1, Math.ceil(intersections[k + 1]! * this.scaleX));
				for (let fx = fxStart; fx <= fxEnd; fx++) {
					const lx = (fx + 0.5) / this.scaleX;
					if ( lx < intersections[k]! - 0.5 / this.scaleX || lx > intersections[k + 1]! + 0.5 / this.scaleX ) {
						continue;
					}
					let col = baseColor;
					if (noiseAmp > 0) {
						const n = (smoothNoise2D(noiseSeed, lx * 0.035, ly * 0.035, 2) - 0.5) * 2 * noiseAmp;
						col = [clampByte(col[0] + n), clampByte(col[1] + n * 0.92), clampByte(col[2] + n * 0.8)];
					}
					this.setPixel(fx, fy, rowDepth, id, opts.category, col, litVal, angleRad, aniso);
				}
			}
		}
		return id;
	}

	fillShadedEllipse(
		cx: number,
		cy: number,
		rx: number,
		ry: number,
		depth: number,
		id: number,
		cat: SurfaceCategory,
		litColor: RgbTuple,
		shadeColor: RgbTuple,
		lightDirX: number,
		lightDirY = -0.65,
		litBase = 0.75,
		angleRad = 0,
		aniso = 0.16
	): void {
		if (rx <= 0.2 || ry <= 0.2) return;
		const fx0 = Math.max(0, Math.floor((cx - rx) * this.scaleX));
		const fx1 = Math.min(this.fieldWidth - 1, Math.ceil((cx + rx) * this.scaleX));
		const fy0 = Math.max(0, Math.floor((cy - ry) * this.scaleY));
		const fy1 = Math.min(this.fieldHeight - 1, Math.ceil((cy + ry) * this.scaleY));
		const normLen = Math.hypot(lightDirX, lightDirY) || 1;
		const lxDir = lightDirX / normLen;
		const lyDir = lightDirY / normLen;

		for (let fy = fy0; fy <= fy1; fy++) {
			const ly = (fy + 0.5) / this.scaleY;
			const dy = (ly - cy) / ry;
			if (Math.abs(dy) > 1) continue;
			for (let fx = fx0; fx <= fx1; fx++) {
				const lx = (fx + 0.5) / this.scaleX;
				const dx = (lx - cx) / rx;
				const r2 = dx * dx + dy * dy;
				if (r2 > 1) continue;
				const illumination = Math.max(0, Math.min(1, 0.52 + 0.48 * (dx * lxDir + dy * lyDir)));
				const col = lerpRgb(shadeColor, litColor, illumination);
				this.setPixel(
					fx,
					fy,
					depth,
					id,
					cat,
					col,
					litBase * (0.55 + 0.45 * illumination),
					angleRad,
					aniso
				);
			}
		}
	}

	fillCapsule(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius: number,
		depth: number,
		id: number,
		cat: SurfaceCategory,
		litColor: RgbTuple,
		shadeColor?: RgbTuple,
		lightDirX = -0.6,
		litVal = 0.74,
		aniso = 0.42
	): void {
		const minX = Math.min(x0, x1) - radius;
		const maxX = Math.max(x0, x1) + radius;
		const minY = Math.min(y0, y1) - radius;
		const maxY = Math.max(y0, y1) + radius;
		const fx0 = Math.max(0, Math.floor(minX * this.scaleX));
		const fx1 = Math.min(this.fieldWidth - 1, Math.ceil(maxX * this.scaleX));
		const fy0 = Math.max(0, Math.floor(minY * this.scaleY));
		const fy1 = Math.min(this.fieldHeight - 1, Math.ceil(maxY * this.scaleY));

		const vx = x1 - x0;
		const vy = y1 - y0;
		const len2 = vx * vx + vy * vy;
		const angle = Math.atan2(vy, vx);
		const nx = len2 > 1e-4 ? -vy / Math.sqrt(len2) : 1;
		const ny = len2 > 1e-4 ? vx / Math.sqrt(len2) : 0;
		const r2 = radius * radius;
		const dark = shadeColor ?? scaleRgb(litColor, 0.78, 0.35);

		for (let fy = fy0; fy <= fy1; fy++) {
			const ly = (fy + 0.5) / this.scaleY;
			for (let fx = fx0; fx <= fx1; fx++) {
				const lx = (fx + 0.5) / this.scaleX;
				const t =
					len2 > 1e-4 ? Math.max(0, Math.min(1, ((lx - x0) * vx + (ly - y0) * vy) / len2)) : 0;
				const px = x0 + vx * t;
				const py = y0 + vy * t;
				const dx = lx - px;
				const dy = ly - py;
				const d2 = dx * dx + dy * dy;
				if (d2 > r2) continue;
				const side = radius > 0.2 ? (dx * nx + dy * ny) / radius : 0;
				const lightDot = Math.max(0, Math.min(1, 0.55 + 0.45 * side * Math.sign(lightDirX || 1)));
				const col = lerpRgb(dark, litColor, lightDot);
				this.setPixel(fx, fy, depth, id, cat, col, litVal * (0.7 + 0.3 * lightDot), angle, aniso);
			}
		}
	}

	strokeRing(
		cx: number,
		cy: number,
		radius: number,
		thickness: number,
		depth: number,
		id: number,
		cat: SurfaceCategory,
		color: RgbTuple,
		litVal = 0.65
	): void {
		const outer = radius + thickness * 0.5;
		const inner = Math.max(0, radius - thickness * 0.5);
		const outer2 = outer * outer;
		const inner2 = inner * inner;
		const fx0 = Math.max(0, Math.floor((cx - outer) * this.scaleX));
		const fx1 = Math.min(this.fieldWidth - 1, Math.ceil((cx + outer) * this.scaleX));
		const fy0 = Math.max(0, Math.floor((cy - outer) * this.scaleY));
		const fy1 = Math.min(this.fieldHeight - 1, Math.ceil((cy + outer) * this.scaleY));

		for (let fy = fy0; fy <= fy1; fy++) {
			const ly = (fy + 0.5) / this.scaleY;
			for (let fx = fx0; fx <= fx1; fx++) {
				const lx = (fx + 0.5) / this.scaleX;
				const dx = lx - cx;
				const dy = ly - cy;
				const d2 = dx * dx + dy * dy;
				if (d2 < inner2 || d2 > outer2) continue;
				const tangent = Math.atan2(dx, -dy);
				this.setPixel(fx, fy, depth, id, cat, color, litVal, tangent, 0.45);
			}
		}
	}

	/**
	 * Casts cool-shifted daylight shadow onto ground, limestone, paths, and walls.
	 */
	applyGroundShadowEllipse(
		cx: number,
		cy: number,
		rx: number,
		ry: number,
		minSurfaceDepth: number,
		strength = 0.32
	): void {
		const fx0 = Math.max(0, Math.floor((cx - rx) * this.scaleX));
		const fx1 = Math.min(this.fieldWidth - 1, Math.ceil((cx + rx) * this.scaleX));
		const fy0 = Math.max(0, Math.floor((cy - ry) * this.scaleY));
		const fy1 = Math.min(this.fieldHeight - 1, Math.ceil((cy + ry) * this.scaleY));

		const groundCats = new Set<number>([
			SURFACE_CATEGORY_INDEX.terrain,
			SURFACE_CATEGORY_INDEX.limestone,
			SURFACE_CATEGORY_INDEX.path,
			SURFACE_CATEGORY_INDEX.wall,
			SURFACE_CATEGORY_INDEX.furniture
		]);

		for (let fy = fy0; fy <= fy1; fy++) {
			const ly = (fy + 0.5) / this.scaleY;
			const dy = (ly - cy) / ry;
			if (Math.abs(dy) > 1) continue;
			for (let fx = fx0; fx <= fx1; fx++) {
				const lx = (fx + 0.5) / this.scaleX;
				const dx = (lx - cx) / rx;
				const r2 = dx * dx + dy * dy;
				if (r2 > 1) continue;
				const idx = fy * this.fieldWidth + fx;
				if (this.depth[idx]! < minSurfaceDepth - 0.04) continue;
				if (!groundCats.has(this.category[idx]!)) continue;

				const falloff = Math.pow(1 - r2, 0.55);
				const atten = 1 - strength * falloff;
				const c3 = idx * 3;
				this.rgb[c3] = clampByte(this.rgb[c3]! * (atten - 0.04 * falloff));
				this.rgb[c3 + 1] = clampByte(this.rgb[c3 + 1]! * (atten - 0.01 * falloff));
				this.rgb[c3 + 2] = clampByte(this.rgb[c3 + 2]! * (atten + 0.055 * falloff));
				this.lit[idx] = clampByte(this.lit[idx]! * (1 - 0.48 * falloff));
			}
		}
	}

	/**
	 * Draws researched Texas tree species (live oak, bald cypress, pecan, Ashe juniper, crape myrtle).
	 */
	drawTree(opts: {
		species: 'live-oak' | 'bald-cypress' | 'pecan' | 'ashe-juniper' | 'crape-myrtle';
		baseX: number;
		baseY: number;
		height: number;
		canopyWidth: number;
		depth: number;
		lightDirX: number;
		rng: SeededRng;
		castGroundShadow?: boolean;
	}): void {
		const { species, baseX, baseY, height, canopyWidth, depth, lightDirX, rng } = opts;
		const trunkId = this.allocId();
		const canopyId = this.allocId();

		if (opts.castGroundShadow !== false) {
			const shadowOffsetX = -lightDirX * canopyWidth * 0.24;
			this.applyGroundShadowEllipse(
				baseX + shadowOffsetX,
				baseY + height * 0.03,
				canopyWidth * 0.56,
				Math.max(14, canopyWidth * 0.16),
				depth - 0.02,
				0.3
			);
		}

		if (species === 'bald-cypress') {
			// Fluted buttressed reddish-grey trunk beside water + feathered horizontal tiers
			const trunkLit: RgbTuple = [122, 102, 88];
			const trunkShade: RgbTuple = [74, 62, 58];
			const topY = baseY - height * 0.78;
			const buttressW = Math.max(8, height * 0.055);
			this.fillPolygon(
				[
					[baseX - buttressW * 1.45, baseY + 2],
					[baseX + buttressW * 1.45, baseY + 2],
					[baseX + buttressW * 0.55, baseY - height * 0.18],
					[baseX - buttressW * 0.55, baseY - height * 0.18]
				],
				{
					depthTop: depth + 0.004,
					id: trunkId,
					category: 'trunk',
					colorTop: trunkLit,
					colorBottom: trunkShade,
					lit: 0.55,
					angleRad: Math.PI * 0.5,
					anisotropy: 0.55
				}
			);
			this.fillCapsule(
				baseX,
				baseY - height * 0.14,
				baseX + rng.signed() * 5,
				topY,
				buttressW * 0.55,
				depth + 0.004,
				trunkId,
				'trunk',
				trunkLit,
				trunkShade,
				lightDirX,
				0.58,
				0.55
			);

			const tiers = 7;
			const litFoliage: RgbTuple = [126, 158, 92];
			const midFoliage: RgbTuple = [82, 118, 76];
			const shadeFoliage: RgbTuple = [46, 76, 66];
			for (let t = 0; t < tiers; t++) {
				const u = t / (tiers - 1);
				const cy = baseY - height * (0.34 + u * 0.58);
				const w = canopyWidth * (0.52 * (1 - u * 0.62) + 0.12);
				const h = height * (0.085 - u * 0.025);
				const ox = rng.signed() * w * 0.14;
				this.fillShadedEllipse(
					baseX + ox,
					cy + h * 0.28,
					w * 0.96,
					h * 1.05,
					depth + 0.002,
					canopyId,
					'foliage',
					midFoliage,
					shadeFoliage,
					lightDirX,
					-0.5,
					0.52,
					0,
					0.32
				);
				this.fillShadedEllipse(
					baseX + ox + lightDirX * w * 0.14,
					cy - h * 0.15,
					w * 0.78,
					h * 0.85,
					depth,
					canopyId,
					'foliage',
					litFoliage,
					midFoliage,
					lightDirX,
					-0.65,
					0.84,
					0,
					0.28
				);
			}
			return;
		}

		if (species === 'ashe-juniper') {
			// Low multi-stemmed grey bark + compact blue-cedar / juniper-green dome
			const trunkLit: RgbTuple = [116, 108, 100];
			const trunkShade: RgbTuple = [70, 66, 66];
			const stemTopY = baseY - height * 0.42;
			for (let s = -1; s <= 1; s++) {
				this.fillCapsule(
					baseX + s * 4,
					baseY,
					baseX + s * canopyWidth * 0.18,
					stemTopY,
					Math.max(3, height * 0.032),
					depth + 0.004,
					trunkId,
					'trunk',
					trunkLit,
					trunkShade,
					lightDirX,
					0.5,
					0.45
				);
			}
			const litJuniper: RgbTuple = [96, 128, 92];
			const shadeJuniper: RgbTuple = [44, 72, 66];
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
				const dist = (i === 5 ? 0 : 0.26) * canopyWidth;
				const cx = baseX + Math.cos(a) * dist;
				const cy = baseY - height * 0.54 + Math.sin(a) * height * 0.14;
				this.fillShadedEllipse(
					cx,
					cy,
					canopyWidth * rng.range(0.28, 0.38),
					height * rng.range(0.24, 0.32),
					depth + (i === 5 ? -0.001 : 0.001),
					canopyId,
					'foliage',
					litJuniper,
					shadeJuniper,
					lightDirX,
					-0.65,
					0.72,
					0,
					0.16
				);
			}
			return;
		}

		if (species === 'crape-myrtle') {
			const trunkLit: RgbTuple = [158, 138, 118];
			const trunkShade: RgbTuple = [104, 88, 78];
			const crownY = baseY - height * 0.68;
			for (let s = -1; s <= 1; s++) {
				this.fillCapsule(
					baseX + s * 2.5,
					baseY,
					baseX + s * canopyWidth * 0.22,
					crownY,
					Math.max(2.6, height * 0.022),
					depth + 0.004,
					trunkId,
					'trunk',
					trunkLit,
					trunkShade,
					lightDirX,
					0.68,
					0.55
				);
			}
			const litLeaf: RgbTuple = [122, 156, 86];
			const shadeLeaf: RgbTuple = [62, 94, 64];
			const blossomChoices: readonly RgbTuple[] = [
				[216, 118, 134],
				[232, 224, 218],
				[188, 134, 188]
			];
			const blossom = rng.pick(blossomChoices);
			for (let i = 0; i < 5; i++) {
				const u = (i / 4) * 2 - 1;
				const cx = baseX + u * canopyWidth * 0.3;
				const cy = crownY - (1 - u * u) * height * 0.16;
				this.fillShadedEllipse(
					cx,
					cy,
					canopyWidth * 0.26,
					height * 0.18,
					depth + 0.001,
					canopyId,
					'foliage',
					litLeaf,
					shadeLeaf,
					lightDirX,
					-0.6,
					0.78
				);
				this.fillShadedEllipse(
					cx + lightDirX * 5,
					cy - height * 0.06,
					canopyWidth * 0.15,
					height * 0.1,
					depth,
					canopyId,
					'foliage',
					blossom,
					lerpRgb(blossom, shadeLeaf, 0.45),
					lightDirX,
					-0.7,
					0.88
				);
			}
			return;
		}

		// Live oak (broad gnarled limbs) or Pecan (tall airy crown)
		const isOak = species === 'live-oak';
		const trunkLit: RgbTuple = isOak ? [108, 96, 84] : [118, 104, 88];
		const trunkShade: RgbTuple = isOak ? [62, 54, 52] : [72, 64, 58];
		const forkY = baseY - height * (isOak ? 0.36 : 0.48);
		const trunkR = Math.max(4.5, height * (isOak ? 0.052 : 0.04));

		this.fillCapsule(
			baseX,
			baseY + 2,
			baseX + rng.signed() * 6,
			forkY,
			trunkR,
			depth + 0.005,
			trunkId,
			'trunk',
			trunkLit,
			trunkShade,
			lightDirX,
			0.56,
			0.52
		);

		const branches = isOak ? [-0.75, -0.22, 0.28, 0.78] : [-0.48, 0.0, 0.48];
		for (const b of branches) {
			const bx = baseX + b * canopyWidth * 0.38;
			const by = baseY - height * (isOak ? 0.58 + (1 - Math.abs(b)) * 0.14 : 0.74);
			this.fillCapsule(
				baseX,
				forkY,
				bx,
				by,
				trunkR * 0.56,
				depth + 0.004,
				trunkId,
				'trunk',
				trunkLit,
				trunkShade,
				lightDirX,
				0.5,
				0.48
			);
		}

		const litCrown: RgbTuple = isOak ? [132, 162, 84] : [142, 174, 92];
		const midCrown: RgbTuple = isOak ? [78, 114, 68] : [90, 128, 72];
		const deepCrown: RgbTuple = isOak ? [42, 68, 58] : [50, 80, 62];

		const clusterCount = isOak ? 9 : 8;
		for (let i = 0; i < clusterCount; i++) {
			const u = (i / (clusterCount - 1)) * 2 - 1;
			const arch = 1 - u * u * 0.72;
			const cx = baseX + u * canopyWidth * 0.42 + rng.signed() * canopyWidth * 0.05;
			const cy =
				baseY -
				height * (isOak ? 0.54 + arch * 0.24 : 0.62 + arch * 0.26) +
				rng.signed() * height * 0.03;
			const rx = canopyWidth * (isOak ? 0.24 : 0.21) * (0.85 + arch * 0.25);
			const ry = height * (isOak ? 0.17 : 0.19) * (0.85 + arch * 0.2);

			// Cool shadow underside first
			this.fillShadedEllipse(
				cx - lightDirX * rx * 0.14,
				cy + ry * 0.26,
				rx * 0.98,
				ry * 0.92,
				depth + 0.002,
				canopyId,
				'foliage',
				midCrown,
				deepCrown,
				lightDirX,
				-0.45,
				0.46,
				0,
				0.18
			);
			// Sunlit upper leaf mass
			this.fillShadedEllipse(
				cx + lightDirX * rx * 0.16,
				cy - ry * 0.14,
				rx * 0.86,
				ry * 0.82,
				depth,
				canopyId,
				'foliage',
				litCrown,
				midCrown,
				lightDirX,
				-0.75,
				0.86,
				0,
				0.18
			);
		}
	}

	/**
	 * Renders a grounded contemporary human figure with understated distant detail and clear silhouette.
	 */
	drawFigure(fig: SceneFigure, lightDirX: number): void {
		const h = fig.height;
		const x = fig.footX;
		const y = fig.footY;
		const d = fig.depth;
		const dir = fig.facing;
		const litFactor = fig.inShade ? 0.56 : 0.86;
		const shirtLit = fig.inShade ? scaleRgb(fig.shirtRgb, 0.84, 0.28) : fig.shirtRgb;
		const shirtShade = scaleRgb(shirtLit, 0.72, 0.35);
		const lowerLit = fig.inShade ? scaleRgb(fig.lowerRgb, 0.84, 0.25) : fig.lowerRgb;
		const lowerShade = scaleRgb(lowerLit, 0.72, 0.32);
		const skinLit = fig.inShade ? scaleRgb(fig.skinRgb, 0.86, 0.18) : fig.skinRgb;
		const skinShade = scaleRgb(skinLit, 0.78, 0.2);

		const shirtId = this.allocId();
		const lowerId = this.allocId();
		const skinId = this.allocId();
		const hairId = this.allocId();
		const propId = this.allocId();

		// Ground contact shadow anchored directly beneath feet/wheels
		this.applyGroundShadowEllipse(
			x - lightDirX * h * 0.1,
			y + h * 0.02,
			h * (fig.pose === 'cycling' ? 0.42 : 0.24),
			Math.max(3.5, h * 0.065),
			d - 0.02,
			fig.inShade ? 0.2 : 0.36
		);

		if (fig.pose === 'cycling') {
			const wheelR = h * 0.19;
			const wheelY = y - wheelR;
			const rearX = x - dir * h * 0.23;
			const frontX = x + dir * h * 0.24;
			const frameRgb: RgbTuple = fig.accentRgb;
			// Wheels touching the path
			this.strokeRing(rearX, wheelY, wheelR, Math.max(2.2, h * 0.028), d + 0.003, propId, 'prop', [54, 58, 64], 0.52);
			this.strokeRing(frontX, wheelY, wheelR, Math.max(2.2, h * 0.028), d + 0.003, propId, 'prop', [54, 58, 64], 0.52);
			// Bicycle diamond frame & handlebars
			const crankX = x - dir * h * 0.02;
			const crankY = wheelY + wheelR * 0.1;
			const seatX = x - dir * h * 0.1;
			const seatY = y - h * 0.48;
			const stemX = x + dir * h * 0.17;
			const stemY = y - h * 0.56;
			const tubeR = Math.max(1.8, h * 0.022);
			this.fillCapsule(rearX, wheelY, crankX, crankY, tubeR, d + 0.002, propId, 'prop', frameRgb, undefined, lightDirX, litFactor);
			this.fillCapsule(crankX, crankY, seatX, seatY, tubeR, d + 0.002, propId, 'prop', frameRgb, undefined, lightDirX, litFactor);
			this.fillCapsule(seatX, seatY, stemX, stemY, tubeR, d + 0.002, propId, 'prop', frameRgb, undefined, lightDirX, litFactor);
			this.fillCapsule(crankX, crankY, stemX, stemY, tubeR, d + 0.002, propId, 'prop', frameRgb, undefined, lightDirX, litFactor);
			this.fillCapsule(frontX, wheelY, stemX, stemY, tubeR, d + 0.002, propId, 'prop', frameRgb, undefined, lightDirX, litFactor);

			// Cyclist legs, leaning torso, arms to handlebars, head
			const hipX = seatX;
			const hipY = seatY - h * 0.03;
			const shoulderX = x + dir * h * 0.05;
			const shoulderY = y - h * 0.74;
			this.fillCapsule(hipX, hipY, x + dir * h * 0.06, y - h * 0.28, h * 0.055, d + 0.001, lowerId, 'person-cloth', lowerLit, lowerShade, lightDirX, litFactor);
			this.fillCapsule(x + dir * h * 0.06, y - h * 0.28, crankX + dir * h * 0.04, crankY - h * 0.04, h * 0.045, d + 0.001, lowerId, 'person-cloth', lowerLit, lowerShade, lightDirX, litFactor);
			this.fillCapsule(hipX, hipY, shoulderX, shoulderY, h * 0.088, d, shirtId, 'person-cloth', shirtLit, shirtShade, lightDirX, litFactor);
			this.fillCapsule(shoulderX, shoulderY, stemX, stemY - h * 0.02, h * 0.04, d - 0.001, skinId, 'person-skin', skinLit, skinShade, lightDirX, litFactor);

			const headX = shoulderX + dir * h * 0.04;
			const headY = shoulderY - h * 0.11;
			this.fillShadedEllipse(headX, headY, h * 0.068, h * 0.075, d - 0.001, skinId, 'person-skin', skinLit, skinShade, lightDirX, -0.6, litFactor);
			this.fillShadedEllipse(headX - dir * h * 0.01, headY - h * 0.035, h * 0.078, h * 0.052, d - 0.002, hairId, 'person-hair', fig.accentRgb, scaleRgb(fig.accentRgb, 0.7, 0.2), lightDirX, -0.7, litFactor);
			return;
		}

		if (fig.pose === 'sitting') {
			// Seated on bench, porch chair, stone ledge, or picnic blanket; feet meet ground at (x, y)
			const seatY = y - h * 0.34;
			const seatX = x - dir * h * 0.1;
			const kneeX = x + dir * h * 0.08;
			const kneeY = seatY + h * 0.03;
			const shoulderX = seatX - dir * h * 0.02;
			const shoulderY = seatY - h * 0.3;

			// Legs from hip to knee to ground
			this.fillCapsule(seatX, seatY, kneeX, kneeY, h * 0.065, d + 0.001, lowerId, 'person-cloth', lowerLit, lowerShade, lightDirX, litFactor);
			this.fillCapsule(kneeX, kneeY, x, y - h * 0.03, h * 0.052, d + 0.001, lowerId, 'person-cloth', lowerLit, lowerShade, lightDirX, litFactor);
			this.fillCapsule(x - h * 0.02, y - h * 0.025, x + dir * h * 0.06, y - h * 0.015, h * 0.038, d + 0.001, hairId, 'person-hair', [58, 52, 50], undefined, lightDirX, litFactor * 0.8);

			// Torso
			this.fillCapsule(seatX, seatY, shoulderX, shoulderY, h * 0.095, d, shirtId, 'person-cloth', shirtLit, shirtShade, lightDirX, litFactor);

			// Arms & optional book/cup
			const handX = seatX + dir * h * 0.13;
			const handY = seatY - h * 0.11;
			this.fillCapsule(shoulderX, shoulderY + h * 0.03, handX, handY, h * 0.042, d - 0.001, shirtId, 'person-cloth', shirtLit, shirtShade, lightDirX, litFactor);
			if (fig.propKind === 'book') {
				this.fillPolygon(
					[
						[handX - h * 0.04, handY - h * 0.05],
						[handX + dir * h * 0.09, handY - h * 0.07],
						[handX + dir * h * 0.1, handY + h * 0.03],
						[handX - h * 0.03, handY + h * 0.04]
					],
					{
						depthTop: d - 0.002,
						id: propId,
						category: 'prop',
						colorTop: [238, 230, 210],
						colorBottom: [196, 184, 164],
						lit: litFactor
					}
				);
			}

			const headX = shoulderX + dir * h * 0.02;
			const headY = shoulderY - h * 0.115;
			this.fillShadedEllipse(headX, headY, h * 0.07, h * 0.078, d - 0.001, skinId, 'person-skin', skinLit, skinShade, lightDirX, -0.6, litFactor);
			this.fillShadedEllipse(headX - dir * h * 0.012, headY - h * 0.032, h * 0.074, h * 0.058, d - 0.002, hairId, 'person-hair', fig.hairRgb, scaleRgb(fig.hairRgb, 0.72, 0.2), lightDirX, -0.7, litFactor);
			return;
		}

		// Upright poses: walking, standing, carrying, leaning
		const stride = fig.pose === 'walking' || fig.pose === 'carrying' ? h * 0.085 : h * 0.032;
		const leanX = fig.pose === 'leaning' ? dir * h * 0.06 : 0;
		const hipX = x;
		const hipY = y - h * 0.46;
		const shoulderX = x + leanX;
		const shoulderY = y - h * 0.77;

		// Back leg & front leg meeting ground surface cleanly
		const backFootX = x - dir * stride;
		const frontFootX = x + dir * stride;
		this.fillCapsule(hipX - dir * h * 0.02, hipY, backFootX, y - h * 0.025, h * 0.052, d + 0.002, lowerId, 'person-cloth', scaleRgb(lowerLit, 0.88, 0.15), lowerShade, lightDirX, litFactor * 0.92);
		this.fillCapsule(hipX + dir * h * 0.02, hipY, frontFootX, y - h * 0.025, h * 0.055, d + 0.001, lowerId, 'person-cloth', lowerLit, lowerShade, lightDirX, litFactor);
		// Shoes
		this.fillCapsule(backFootX - h * 0.02, y - h * 0.02, backFootX + dir * h * 0.045, y - h * 0.015, h * 0.03, d + 0.002, hairId, 'person-hair', [62, 54, 50], undefined, lightDirX, litFactor * 0.8);
		this.fillCapsule(frontFootX - h * 0.02, y - h * 0.02, frontFootX + dir * h * 0.048, y - h * 0.015, h * 0.032, d + 0.001, hairId, 'person-hair', [54, 48, 46], undefined, lightDirX, litFactor * 0.85);

		// Torso / shirt
		this.fillCapsule(hipX, hipY + h * 0.02, shoulderX, shoulderY, h * 0.096, d, shirtId, 'person-cloth', shirtLit, shirtShade, lightDirX, litFactor);

		// Arms + attached props
		const handX =
			fig.pose === 'leaning'
				? shoulderX + dir * h * 0.14
				: fig.pose === 'carrying'
					? shoulderX + dir * h * 0.08
					: shoulderX + dir * h * 0.07;
		const handY =
			fig.pose === 'leaning'
				? y - h * 0.54
				: fig.pose === 'carrying'
					? y - h * 0.5
					: y - h * 0.52;

		this.fillCapsule(shoulderX, shoulderY + h * 0.03, handX, handY, h * 0.042, d - 0.001, shirtId, 'person-cloth', shirtLit, shirtShade, lightDirX, litFactor);
		this.fillShadedEllipse(handX, handY, h * 0.03, h * 0.03, d - 0.001, skinId, 'person-skin', skinLit, skinShade, lightDirX, -0.5, litFactor);

		if (fig.propKind === 'groceries' || fig.propKind === 'bag') {
			const bagW = h * 0.1;
			const bagH = h * 0.15;
			const bx = handX - bagW * 0.35;
			const by = handY + h * 0.01;
			this.fillPolygon(
				[
					[bx, by],
					[bx + bagW, by],
					[bx + bagW * 1.08, by + bagH],
					[bx - bagW * 0.08, by + bagH]
				],
				{
					depthTop: d - 0.002,
					id: propId,
					category: 'prop',
					colorTop: fig.accentRgb,
					colorBottom: scaleRgb(fig.accentRgb, 0.76, 0.22),
					lit: litFactor
				}
			);
			if (fig.propKind === 'groceries') {
				// Leafy greens peeking out of grocery bag
				this.fillShadedEllipse(
					bx + bagW * 0.5,
					by - h * 0.015,
					bagW * 0.36,
					h * 0.035,
					d - 0.0025,
					propId,
					'foliage',
					[104, 152, 78],
					[64, 102, 58],
					lightDirX,
					-0.6,
					litFactor
				);
			}
		} else if (fig.propKind === 'crate') {
			const cw = h * 0.16;
			const ch = h * 0.1;
			const cx0 = handX;
			const cy0 = handY - ch * 0.4;
			this.fillPolygon(
				[
					[cx0, cy0],
					[cx0 + cw, cy0],
					[cx0 + cw, cy0 + ch],
					[cx0, cy0 + ch]
				],
				{
					depthTop: d - 0.002,
					id: propId,
					category: 'prop',
					colorTop: [198, 154, 102],
					colorBottom: [148, 110, 68],
					lit: litFactor
				}
			);
		}

		// Head & hair / sun hat (kept understated so distant faces never turn unstable)
		const headX = shoulderX + dir * h * 0.015;
		const headY = shoulderY - h * 0.11;
		this.fillShadedEllipse(headX, headY, h * 0.068, h * 0.076, d - 0.001, skinId, 'person-skin', skinLit, skinShade, lightDirX, -0.6, litFactor);
		this.fillShadedEllipse(
			headX - dir * h * 0.012,
			headY - h * 0.035,
			h * 0.074,
			h * 0.056,
			d - 0.002,
			hairId,
			'person-hair',
			fig.hairRgb,
			scaleRgb(fig.hairRgb, 0.72, 0.2),
			lightDirX,
			-0.7,
			litFactor
		);
	}

	/**
	 * Reflects actual rendered objects above the water bank into water pixels below,
	 * creating authentic neighboring color bands for trees, bridges, walls, and walkers.
	 */
	applyWaterReflections(opts: {
		waterBodyRgb: RgbTuple;
		waterDeepRgb: RgbTuple;
		sunShimmerRgb: RgbTuple;
		seed: number;
		reflectivity?: number;
	}): void {
		const waterCat = SURFACE_CATEGORY_INDEX.water;
		const snapshot = new Uint8Array(this.rgb);
		const refl = opts.reflectivity ?? 0.52;

		for (let fx = 0; fx < this.fieldWidth; fx++) {
			// Find water spans in this column so curved channels and bridges reflect accurately
			let fy = 0;
			while (fy < this.fieldHeight) {
				const idxStart = fy * this.fieldWidth + fx;
				if (this.category[idxStart] !== waterCat) {
					fy++;
					continue;
				}
				const bankFy = fy;
				let endFy = fy;
				while (
					endFy + 1 < this.fieldHeight &&
					this.category[(endFy + 1) * this.fieldWidth + fx] === waterCat
				) {
					endFy++;
				}

				const spanLen = Math.max(1, endFy - bankFy + 1);
				for (let wy = bankFy; wy <= endFy; wy++) {
					const distFromBank = wy - bankFy;
					const vNorm = distFromBank / spanLen;
					const ripple =
						(smoothNoise2D(opts.seed, fx * 0.09, wy * 0.28, 9) - 0.5) * 6;
					const srcFy = Math.max(
						0,
						Math.min(this.fieldHeight - 1, Math.round(bankFy - 1 - distFromBank * 0.92 + ripple))
					);
					const srcFx = Math.max(
						0,
						Math.min(
							this.fieldWidth - 1,
							Math.round(fx + (smoothNoise2D(opts.seed, fx * 0.08, wy * 0.35, 10) - 0.5) * 5)
						)
					);

					const srcIdx3 = (srcFy * this.fieldWidth + srcFx) * 3;
					const reflR = snapshot[srcIdx3]!;
					const reflG = snapshot[srcIdx3 + 1]!;
					const reflB = snapshot[srcIdx3 + 2]!;

					const waterBase = lerpRgb(opts.waterBodyRgb, opts.waterDeepRgb, vNorm);
					const localRefl = refl * (1 - vNorm * 0.25);

					let outR = lerp(waterBase[0], reflR * 0.94, localRefl);
					let outG = lerp(waterBase[1], reflG * 0.97, localRefl);
					let outB = lerp(waterBase[2], reflB * 1.02, localRefl);

					// Broken sunlit horizontal water shimmer bands
					const shimmerWave = smoothNoise2D(opts.seed, fx * 0.055, wy * 0.42, 11);
					if (shimmerWave > 0.68 && (wy + fx) % 3 !== 0) {
						const sAmt = Math.min(0.45, (shimmerWave - 0.68) * 1.35);
						outR = lerp(outR, opts.sunShimmerRgb[0], sAmt);
						outG = lerp(outG, opts.sunShimmerRgb[1], sAmt);
						outB = lerp(outB, opts.sunShimmerRgb[2], sAmt);
					}

					const wIdx = wy * this.fieldWidth + fx;
					const w3 = wIdx * 3;
					this.rgb[w3] = clampByte(outR);
					this.rgb[w3 + 1] = clampByte(outG);
					this.rgb[w3 + 2] = clampByte(outB);
					// Horizontal band alignment in water
					this.tangentAngle[wIdx] = 0;
					this.anisotropy[wIdx] = clampByte(0.56 * 255);
					this.lit[wIdx] = clampByte((0.48 + shimmerWave * 0.42) * 255);
				}

				fy = endFy + 1;
			}
		}
	}

	finalize(focalArea: FocalArea): SceneFields {
		const w = this.fieldWidth;
		const h = this.fieldHeight;
		const total = w * h;
		const boundary = new Float32Array(total);
		const importance = new Float32Array(total);
		const minNeighborDepth = new Float32Array(total);

		const personCats = new Set<number>([
			SURFACE_CATEGORY_INDEX['person-cloth'],
			SURFACE_CATEGORY_INDEX['person-skin'],
			SURFACE_CATEGORY_INDEX['person-hair'],
			SURFACE_CATEGORY_INDEX.prop
		]);
		const detailCats = new Set<number>([
			SURFACE_CATEGORY_INDEX.structure,
			SURFACE_CATEGORY_INDEX.furniture,
			SURFACE_CATEGORY_INDEX.stall,
			SURFACE_CATEGORY_INDEX.sign
		]);
		const quietCats = new Set<number>([
			SURFACE_CATEGORY_INDEX.sky,
			SURFACE_CATEGORY_INDEX.cloud,
			SURFACE_CATEGORY_INDEX['distant-hill']
		]);

		const fxFocal = focalArea.x * w;
		const fyFocal = focalArea.y * h;
		const rFocal = Math.max(12, focalArea.radius * Math.min(w, h));
		const rFocal2 = rFocal * rFocal;

		for (let fy = 0; fy < h; fy++) {
			for (let fx = 0; fx < w; fx++) {
				const idx = fy * w + fx;
				const myObj = this.objectId[idx]!;
				const myDepth = this.depth[idx]!;
				const myCat = this.category[idx]!;
				const c3 = idx * 3;
				const myLum =
					0.299 * this.rgb[c3]! + 0.587 * this.rgb[c3 + 1]! + 0.114 * this.rgb[c3 + 2]!;

				let diffObj = 0;
				let maxLumDiff = 0;
				let minD = myDepth;

				for (let oy = -2; oy <= 2; oy++) {
					const ny = fy + oy;
					if (ny < 0 || ny >= h) continue;
					for (let ox = -2; ox <= 2; ox++) {
						const nx = fx + ox;
						if (nx < 0 || nx >= w) continue;
						const nIdx = ny * w + nx;
						const nd = this.depth[nIdx]!;
						if (nd < minD) minD = nd;
						if (Math.abs(ox) <= 1 && Math.abs(oy) <= 1) {
							if (this.objectId[nIdx] !== myObj) diffObj++;
							const nc3 = nIdx * 3;
							const nLum =
								0.299 * this.rgb[nc3]! +
								0.587 * this.rgb[nc3 + 1]! +
								0.114 * this.rgb[nc3 + 2]!;
							const ld = Math.abs(nLum - myLum) / 255;
							if (ld > maxLumDiff) maxLumDiff = ld;
						}
					}
				}

				const bScore = Math.min(1, (diffObj > 0 ? 0.55 + diffObj * 0.08 : 0) + maxLumDiff * 0.85);
				boundary[idx] = bScore;
				minNeighborDepth[idx] = minD;

				let imp = 0.85;
				if (personCats.has(myCat)) imp = 2.25;
				else if (detailCats.has(myCat)) imp = 1.48;
				else if (myCat === SURFACE_CATEGORY_INDEX.water) imp = 1.15;
				else if (myCat === SURFACE_CATEGORY_INDEX.foliage) imp = 1.08;
				else if (quietCats.has(myCat)) imp = 0.62;

				// Boost silhouettes and crisp light-dark edges
				imp += bScore * 0.72;

				// Focal region boost
				const dfx = fx - fxFocal;
				const dfy = fy - fyFocal;
				const d2 = dfx * dfx + dfy * dfy;
				if (d2 < rFocal2) {
					imp += (1 - d2 / rFocal2) * 0.65;
				}

				// Foreground gently denser than far distance
				imp *= 0.86 + (1 - myDepth) * 0.28;

				importance[idx] = Math.max(0.45, Math.min(2.85, imp));
			}
		}

		return {
			fieldWidth: w,
			fieldHeight: h,
			artboardWidth: this.artboardWidth,
			artboardHeight: this.artboardHeight,
			rgb: this.rgb,
			depth: this.depth,
			objectId: this.objectId,
			category: this.category,
			lit: this.lit,
			tangentAngle: this.tangentAngle,
			anisotropy: this.anisotropy,
			boundary,
			importance,
			minNeighborDepth
		};
	}
}
