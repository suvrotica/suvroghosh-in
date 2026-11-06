import { buildCurvedLinePoints, INK_SCENT_PRESETS } from './presets.ts';
import {
	DEFAULT_SOURCE_AMPLITUDE,
	DEFAULT_SOURCE_SIGMA,
	DEFAULT_SOURCE_X,
	DEFAULT_SOURCE_Y,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	type ChemicalFieldSnapshot,
	type PresetId
} from './types.ts';

export class ChemicalField {
	readonly width: number;
	readonly height: number;
	readonly paintedGrid: Float32Array;
	readonly sourceEraseGrid: Float32Array;
	readonly combinedGrid: Float32Array;
	readonly gradX: Float32Array;
	readonly gradY: Float32Array;
	private readonly scratchGrid: Float32Array;

	sourceActive: boolean;
	sourceX: number;
	sourceY: number;
	sourceSigma: number;
	sourceAmplitude: number;
	maxConcentration: number;

	constructor(width = LOGICAL_WIDTH, height = LOGICAL_HEIGHT) {
		this.width = width;
		this.height = height;
		const size = width * height;
		this.paintedGrid = new Float32Array(size);
		this.sourceEraseGrid = new Float32Array(size);
		this.combinedGrid = new Float32Array(size);
		this.gradX = new Float32Array(size);
		this.gradY = new Float32Array(size);
		this.scratchGrid = new Float32Array(size);

		this.sourceActive = true;
		this.sourceX = DEFAULT_SOURCE_X;
		this.sourceY = DEFAULT_SOURCE_Y;
		this.sourceSigma = DEFAULT_SOURCE_SIGMA;
		this.sourceAmplitude = DEFAULT_SOURCE_AMPLITUDE;
		this.maxConcentration = 0;

		this.loadPreset('one-source');
	}

	loadPreset(presetId: PresetId): void {
		const preset = INK_SCENT_PRESETS[presetId];
		this.paintedGrid.fill(0);
		this.sourceEraseGrid.fill(0);
		this.sourceActive = preset.sourceActive;
		this.sourceX = preset.sourceX;
		this.sourceY = preset.sourceY;
		this.sourceSigma = DEFAULT_SOURCE_SIGMA;
		this.sourceAmplitude = DEFAULT_SOURCE_AMPLITUDE;

		if (presetId === 'curved-line') {
			const points = buildCurvedLinePoints(96);
			const w = this.width;
			const h = this.height;
			const sigma = 24;
			const invTwoSigmaSq = 1 / (2 * sigma * sigma);

			for (let y = 0; y < h; y += 1) {
				const cy = y + 0.5;
				const rowOffset = y * w;
				for (let x = 0; x < w; x += 1) {
					const cx = x + 0.5;
					let minDistSq = Infinity;
					for (let k = 0; k < points.length; k += 1) {
						const dx = cx - points[k].x;
						const dy = cy - points[k].y;
						const dSq = dx * dx + dy * dy;
						if (dSq < minDistSq) minDistSq = dSq;
					}
					const value = 0.88 * Math.exp(-minDistSq * invTwoSigmaSq);
					this.paintedGrid[rowOffset + x] = value > 0.002 ? value : 0;
				}
			}
		}

		this.recomputeCombinedAndGradients();
	}

	/**
	 * Removes all painted chemical and disables any active source contribution.
	 */
	clearChemical(): void {
		this.paintedGrid.fill(0);
		this.sourceEraseGrid.fill(0);
		this.sourceActive = false;
		this.combinedGrid.fill(0);
		this.gradX.fill(0);
		this.gradY.fill(0);
		this.maxConcentration = 0;
	}

	/**
	 * Sets the entire chemical landscape to a constant value in [0, 1].
	 * Used by verification checks to confirm spatially uniform fields produce zero gradient drift.
	 */
	setUniformConcentration(value: number): void {
		const clamped = Math.min(1, Math.max(0, value));
		this.paintedGrid.fill(clamped);
		this.sourceEraseGrid.fill(0);
		this.sourceActive = false;
		this.recomputeCombinedAndGradients();
	}

	/**
	 * Moves the broad chemical source immediately without leaving a wake in paintedGrid.
	 */
	moveSource(x: number, y: number): void {
		this.sourceX = Math.min(this.width - 1, Math.max(1, x));
		this.sourceY = Math.min(this.height - 1, Math.max(1, y));
		this.sourceActive = true;
		this.sourceEraseGrid.fill(0);
		this.recomputeCombinedAndGradients();
	}

	/**
	 * Paints chemical along a segment from (x0, y0) to (x1, y1) with a soft radial brush
	 * and smooths the affected region so gradients remain continuous.
	 */
	paintStroke(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius: number,
		strength = 0.28
	): void {
		const clampedRadius = Math.max(6, Math.min(56, radius));
		const outerRadius = clampedRadius * 1.45;
		const dist = Math.hypot(x1 - x0, y1 - y0);
		const stepDist = Math.max(1.5, clampedRadius * 0.22);
		const steps = Math.max(1, Math.ceil(dist / stepDist));
		const perStampStrength = strength / Math.sqrt(Math.max(1, steps * 0.45));

		let minX = this.width - 1;
		let maxX = 0;
		let minY = this.height - 1;
		let maxY = 0;

		for (let s = 0; s <= steps; s += 1) {
			const t = steps === 0 ? 0 : s / steps;
			const cx = x0 + (x1 - x0) * t;
			const cy = y0 + (y1 - y0) * t;

			const xStart = Math.max(0, Math.floor(cx - outerRadius));
			const xEnd = Math.min(this.width - 1, Math.ceil(cx + outerRadius));
			const yStart = Math.max(0, Math.floor(cy - outerRadius));
			const yEnd = Math.min(this.height - 1, Math.ceil(cy + outerRadius));

			if (xStart < minX) minX = xStart;
			if (xEnd > maxX) maxX = xEnd;
			if (yStart < minY) minY = yStart;
			if (yEnd > maxY) maxY = yEnd;

			const invOuterSq = 1 / (outerRadius * outerRadius);

			for (let y = yStart; y <= yEnd; y += 1) {
				const dy = y + 0.5 - cy;
				const dySq = dy * dy;
				const rowOffset = y * this.width;
				for (let x = xStart; x <= xEnd; x += 1) {
					const dx = x + 0.5 - cx;
					const rSq = dx * dx + dySq;
					const normSq = rSq * invOuterSq;
					if (normSq >= 1) continue;
					const w = (1 - normSq) * (1 - normSq);
					const idx = rowOffset + x;
					const current = this.paintedGrid[idx];
					const deposit = perStampStrength * w * (1 - 0.55 * current);
					this.paintedGrid[idx] = Math.min(1, current + deposit);
					if (this.sourceEraseGrid[idx] > 0) {
						this.sourceEraseGrid[idx] = Math.max(0, this.sourceEraseGrid[idx] - w * 0.5);
					}
				}
			}
		}

		if (minX <= maxX && minY <= maxY) {
			this.smoothPaintedRegion(
				Math.max(0, minX - 2),
				Math.min(this.width - 1, maxX + 2),
				Math.max(0, minY - 2),
				Math.min(this.height - 1, maxY + 2)
			);
		}
		this.recomputeCombinedAndGradients();
	}

	/**
	 * Erases chemical locally along a segment from (x0, y0) to (x1, y1).
	 */
	eraseStroke(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius: number,
		strength = 0.45
	): void {
		const clampedRadius = Math.max(6, Math.min(56, radius));
		const outerRadius = clampedRadius * 1.35;
		const dist = Math.hypot(x1 - x0, y1 - y0);
		const stepDist = Math.max(1.5, clampedRadius * 0.22);
		const steps = Math.max(1, Math.ceil(dist / stepDist));

		for (let s = 0; s <= steps; s += 1) {
			const t = steps === 0 ? 0 : s / steps;
			const cx = x0 + (x1 - x0) * t;
			const cy = y0 + (y1 - y0) * t;

			const xStart = Math.max(0, Math.floor(cx - outerRadius));
			const xEnd = Math.min(this.width - 1, Math.ceil(cx + outerRadius));
			const yStart = Math.max(0, Math.floor(cy - outerRadius));
			const yEnd = Math.min(this.height - 1, Math.ceil(cy + outerRadius));
			const invOuterSq = 1 / (outerRadius * outerRadius);

			for (let y = yStart; y <= yEnd; y += 1) {
				const dy = y + 0.5 - cy;
				const dySq = dy * dy;
				const rowOffset = y * this.width;
				for (let x = xStart; x <= xEnd; x += 1) {
					const dx = x + 0.5 - cx;
					const normSq = (dx * dx + dySq) * invOuterSq;
					if (normSq >= 1) continue;
					const w = (1 - normSq) * (1 - normSq);
					const idx = rowOffset + x;
					const nextVal = this.paintedGrid[idx] * (1 - strength * w) - 0.08 * strength * w;
					this.paintedGrid[idx] = nextVal > 0.001 ? nextVal : 0;
					if (this.sourceActive) {
						this.sourceEraseGrid[idx] = Math.min(1, this.sourceEraseGrid[idx] + strength * w);
					}
				}
			}
		}

		this.recomputeCombinedAndGradients();
	}

	private smoothPaintedRegion(x0: number, x1: number, y0: number, y1: number): void {
		const w = this.width;
		const h = this.height;
		for (let y = y0; y <= y1; y += 1) {
			const rowOffset = y * w;
			for (let x = x0; x <= x1; x += 1) {
				this.scratchGrid[rowOffset + x] = this.paintedGrid[rowOffset + x];
			}
		}

		for (let y = y0; y <= y1; y += 1) {
			const ym = Math.max(y0, Math.max(0, y - 1)) * w;
			const yc = y * w;
			const yp = Math.min(y1, Math.min(h - 1, y + 1)) * w;
			for (let x = x0; x <= x1; x += 1) {
				const xm = Math.max(x0, Math.max(0, x - 1));
				const xp = Math.min(x1, Math.min(w - 1, x + 1));
				const avg =
					0.36 * this.scratchGrid[yc + x] +
					0.12 *
						(this.scratchGrid[yc + xm] +
							this.scratchGrid[yc + xp] +
							this.scratchGrid[ym + x] +
							this.scratchGrid[yp + x]) +
					0.04 *
						(this.scratchGrid[ym + xm] +
							this.scratchGrid[ym + xp] +
							this.scratchGrid[yp + xm] +
							this.scratchGrid[yp + xp]);
				this.paintedGrid[yc + x] = Math.min(1, Math.max(0, avg));
			}
		}
	}

	recomputeCombinedAndGradients(): void {
		const w = this.width;
		const h = this.height;
		const invTwoSigmaSq = 1 / (2 * this.sourceSigma * this.sourceSigma);
		const srcAmp = this.sourceActive ? this.sourceAmplitude : 0;
		const sx = this.sourceX;
		const sy = this.sourceY;

		let maxC = 0;

		for (let y = 0; y < h; y += 1) {
			const cy = y + 0.5;
			const dy = cy - sy;
			const dySq = dy * dy;
			const rowOffset = y * w;

			for (let x = 0; x < w; x += 1) {
				const idx = rowOffset + x;
				let srcVal = 0;
				if (srcAmp > 0) {
					const dx = x + 0.5 - sx;
					const rSq = dx * dx + dySq;
					srcVal = srcAmp * Math.exp(-rSq * invTwoSigmaSq) * (1 - this.sourceEraseGrid[idx]);
				}
				const combined = Math.min(1, this.paintedGrid[idx] + srcVal);
				this.combinedGrid[idx] = combined;
				if (combined > maxC) maxC = combined;
			}
		}

		this.maxConcentration = maxC;

		for (let y = 0; y < h; y += 1) {
			const ym = Math.max(0, y - 1);
			const yp = Math.min(h - 1, y + 1);
			const invDy = yp > ym ? 1 / (yp - ym) : 0;
			const rowOffset = y * w;
			const rowM = ym * w;
			const rowP = yp * w;

			for (let x = 0; x < w; x += 1) {
				const xm = Math.max(0, x - 1);
				const xp = Math.min(w - 1, x + 1);
				const invDx = xp > xm ? 1 / (xp - xm) : 0;
				const idx = rowOffset + x;

				this.gradX[idx] =
					(this.combinedGrid[rowOffset + xp] - this.combinedGrid[rowOffset + xm]) * invDx;
				this.gradY[idx] = (this.combinedGrid[rowP + x] - this.combinedGrid[rowM + x]) * invDy;
			}
		}
	}

	/**
	 * Bilinearly interpolates C(x, y) on the fixed [0, 1] scale.
	 */
	sampleConcentration(x: number, y: number): number {
		const gx = Math.min(this.width - 1.0001, Math.max(0, x - 0.5));
		const gy = Math.min(this.height - 1.0001, Math.max(0, y - 0.5));
		const x0 = gx | 0;
		const y0 = gy | 0;
		const x1 = Math.min(this.width - 1, x0 + 1);
		const y1 = Math.min(this.height - 1, y0 + 1);
		const fx = gx - x0;
		const fy = gy - y0;

		const row0 = y0 * this.width;
		const row1 = y1 * this.width;

		const c00 = this.combinedGrid[row0 + x0];
		const c10 = this.combinedGrid[row0 + x1];
		const c01 = this.combinedGrid[row1 + x0];
		const c11 = this.combinedGrid[row1 + x1];

		const top = c00 + (c10 - c00) * fx;
		const bottom = c01 + (c11 - c01) * fx;
		return top + (bottom - top) * fy;
	}

	/**
	 * Bilinearly interpolates the local gradient (dC/dx, dC/dy) at (x, y)
	 * into out[0] and out[1] without allocating an object.
	 */
	sampleGradientInto(x: number, y: number, out: Float32Array): void {
		const gx = Math.min(this.width - 1.0001, Math.max(0, x - 0.5));
		const gy = Math.min(this.height - 1.0001, Math.max(0, y - 0.5));
		const x0 = gx | 0;
		const y0 = gy | 0;
		const x1 = Math.min(this.width - 1, x0 + 1);
		const y1 = Math.min(this.height - 1, y0 + 1);
		const fx = gx - x0;
		const fy = gy - y0;

		const row0 = y0 * this.width;
		const row1 = y1 * this.width;

		const gx00 = this.gradX[row0 + x0];
		const gx10 = this.gradX[row0 + x1];
		const gx01 = this.gradX[row1 + x0];
		const gx11 = this.gradX[row1 + x1];

		const gy00 = this.gradY[row0 + x0];
		const gy10 = this.gradY[row0 + x1];
		const gy01 = this.gradY[row1 + x0];
		const gy11 = this.gradY[row1 + x1];

		const topX = gx00 + (gx10 - gx00) * fx;
		const botX = gx01 + (gx11 - gx01) * fx;
		out[0] = topX + (botX - topX) * fy;

		const topY = gy00 + (gy10 - gy00) * fx;
		const botY = gy01 + (gy11 - gy01) * fx;
		out[1] = topY + (botY - topY) * fy;
	}

	cloneFrom(other: ChemicalField): void {
		this.paintedGrid.set(other.paintedGrid);
		this.sourceEraseGrid.set(other.sourceEraseGrid);
		this.combinedGrid.set(other.combinedGrid);
		this.gradX.set(other.gradX);
		this.gradY.set(other.gradY);
		this.sourceActive = other.sourceActive;
		this.sourceX = other.sourceX;
		this.sourceY = other.sourceY;
		this.sourceSigma = other.sourceSigma;
		this.sourceAmplitude = other.sourceAmplitude;
		this.maxConcentration = other.maxConcentration;
	}

	snapshot(): ChemicalFieldSnapshot {
		return {
			width: this.width,
			height: this.height,
			combinedGrid: new Float32Array(this.combinedGrid),
			paintedGrid: new Float32Array(this.paintedGrid),
			gradX: new Float32Array(this.gradX),
			gradY: new Float32Array(this.gradY),
			sourceActive: this.sourceActive,
			sourceX: this.sourceX,
			sourceY: this.sourceY,
			maxConcentration: this.maxConcentration
		};
	}
}
