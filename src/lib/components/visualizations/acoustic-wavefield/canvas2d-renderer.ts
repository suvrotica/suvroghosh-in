import { renderPixelDensity } from '$lib/visualizations/webgl';
import {
	CELL_COUNT,
	GRID_NX,
	GRID_NY,
	MAT_ABSORBER,
	MAT_DIFFUSER,
	MAT_LENS,
	MAT_RESONATOR,
	MAT_WALL,
	type GridPoint,
	type SimulationState,
	type StudioTheme
} from '$lib/visualizations/acoustic-wavefield';

export interface Canvas2DRendererHandle {
	render: (state: SimulationState, theme: StudioTheme, highlightSweep?: boolean) => void;
	screenToGrid: (clientX: number, clientY: number) => GridPoint | null;
	gridToCanvas: (gx: number, gy: number) => { x: number; y: number };
	invalidateMaterial: () => void;
	resize: () => void;
	dispose: () => void;
}

const IS_LITTLE_ENDIAN = (() => {
	const buf = new ArrayBuffer(4);
	new Uint32Array(buf)[0] = 0x0a0b0c0d;
	return new Uint8Array(buf)[0] === 0x0d;
})();

function packRgb(r: number, g: number, b: number): number {
	const ri = r < 0 ? 0 : r > 255 ? 255 : r | 0;
	const gi = g < 0 ? 0 : g > 255 ? 255 : g | 0;
	const bi = b < 0 ? 0 : b > 255 ? 255 : b | 0;
	if (IS_LITTLE_ENDIAN) {
		return (0xff000000 | (bi << 16) | (gi << 8) | ri) >>> 0;
	}
	return ((ri << 24) | (gi << 16) | (bi << 8) | 0xff) >>> 0;
}

const TANH_LUT_MAX = 5.0;
const TANH_LUT_SIZE = 2049;
const TANH_LUT_MID = 1024;
const TANH_LUT_SCALE = TANH_LUT_MID / TANH_LUT_MAX;
const TANH_LUT = new Float32Array(TANH_LUT_SIZE);
for (let i = 0; i < TANH_LUT_SIZE; i++) {
	TANH_LUT[i] = Math.tanh((i - TANH_LUT_MID) / TANH_LUT_SCALE);
}

function fastTanh(x: number): number {
	if (x >= TANH_LUT_MAX) return 1;
	if (x <= -TANH_LUT_MAX) return -1;
	return TANH_LUT[(x * TANH_LUT_SCALE + TANH_LUT_MID + 0.5) | 0];
}

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Canvas2DRendererHandle {
	const ctx = canvas.getContext('2d');
	const offscreen = document.createElement('canvas');
	offscreen.width = GRID_NX;
	offscreen.height = GRID_NY;
	const offCtx = offscreen.getContext('2d');
	const imgData = offCtx ? offCtx.createImageData(GRID_NX, GRID_NY) : null;
	const buf32 = imgData ? new Uint32Array(imgData.data.buffer) : null;

	const staticR = new Uint8Array(CELL_COUNT);
	const staticG = new Uint8Array(CELL_COUNT);
	const staticB = new Uint8Array(CELL_COUNT);
	const staticBuf32 = new Uint32Array(CELL_COUNT);
	let materialDirty = true;
	let cachedTheme: StudioTheme | null = null;

	let widthCss = 1;
	let heightCss = 1;
	let dpr = 1;

	function invalidateMaterial(): void {
		materialDirty = true;
	}

	function rebuildStaticCache(material: Uint8Array, theme: StudioTheme): void {
		const isLight = theme === 'light';
		const floorR = isLight ? 243 : 14;
		const floorG = isLight ? 239 : 19;
		const floorB = isLight ? 230 : 28;

		for (let y = 0; y < GRID_NY; y++) {
			const row = y * GRID_NX;
			for (let x = 0; x < GRID_NX; x++) {
				const i = row + x;
				const mat = material[i];
				let r = floorR;
				let g = floorG;
				let b = floorB;

				if (mat === MAT_WALL) {
					const hatch = ((x + y) & 3) === 0 ? 10 : 0;
					if (isLight) {
						r = 52 + hatch;
						g = 61 + hatch;
						b = 74 + hatch;
					} else {
						r = 48 + hatch;
						g = 57 + hatch;
						b = 72 + hatch;
					}
				} else if (mat === MAT_ABSORBER) {
					const dot = ((x ^ y) & 1) === 0 ? 1 : -1;
					r = (isLight ? 168 : 42) + dot * 8;
					g = (isLight ? 142 : 34) + dot * 6;
					b = (isLight ? 114 : 32) + dot * 6;
				} else if (mat === MAT_LENS) {
					r = isLight ? 196 : 18;
					g = isLight ? 228 : 54;
					b = isLight ? 242 : 82;
				} else if (mat === MAT_DIFFUSER) {
					r = isLight ? 186 : 64;
					g = isLight ? 174 : 58;
					b = isLight ? 150 : 48;
				} else if (mat === MAT_RESONATOR) {
					r = isLight ? 226 : 68;
					g = isLight ? 192 : 48;
					b = isLight ? 142 : 24;
				}

				staticR[i] = r;
				staticG[i] = g;
				staticB[i] = b;
				staticBuf32[i] = packRgb(r, g, b);
			}
		}

		materialDirty = false;
		cachedTheme = theme;
	}

	function resize(): void {
		const rect = canvas.getBoundingClientRect();
		dpr = renderPixelDensity();
		widthCss = Math.max(1, rect.width);
		heightCss = Math.max(1, rect.height);
		const targetW = Math.max(1, Math.round(widthCss * dpr));
		const targetH = Math.max(1, Math.round(heightCss * dpr));
		if (canvas.width !== targetW || canvas.height !== targetH) {
			canvas.width = targetW;
			canvas.height = targetH;
		}
	}

	resize();

	function computeFitRect(): { x: number; y: number; w: number; h: number } {
		const aspectGrid = GRID_NX / GRID_NY;
		const aspectCanvas = widthCss / heightCss;
		if (aspectCanvas > aspectGrid) {
			const h = heightCss;
			const w = h * aspectGrid;
			return { x: (widthCss - w) * 0.5, y: 0, w, h };
		}
		const w = widthCss;
		const h = w / aspectGrid;
		return { x: 0, y: (heightCss - h) * 0.5, w, h };
	}

	function screenToGrid(clientX: number, clientY: number): GridPoint | null {
		const rect = canvas.getBoundingClientRect();
		const px = clientX - rect.left;
		const py = clientY - rect.top;
		const fit = computeFitRect();
		const gx = ((px - fit.x) / fit.w) * (GRID_NX - 1);
		const gy = ((py - fit.y) / fit.h) * (GRID_NY - 1);
		if (gx < 0 || gx > GRID_NX - 1 || gy < 0 || gy > GRID_NY - 1) {
			return {
				x: Math.max(2, Math.min(GRID_NX - 3, gx)),
				y: Math.max(2, Math.min(GRID_NY - 3, gy))
			};
		}
		return { x: gx, y: gy };
	}

	function gridToCanvas(gx: number, gy: number): { x: number; y: number } {
		const fit = computeFitRect();
		return {
			x: fit.x + (gx / (GRID_NX - 1)) * fit.w,
			y: fit.y + (gy / (GRID_NY - 1)) * fit.h
		};
	}

	function render(state: SimulationState, theme: StudioTheme): void {
		if (!ctx || !offCtx || !imgData || !buf32) return;

		if (materialDirty || cachedTheme !== theme) {
			rebuildStaticCache(state.material, theme);
		}

		const isLight = theme === 'light';
		const { p, material, eRms, eRef } = state;
		const scaleP = 4.2;
		const invERef = 1 / Math.max(eRef, 1e-6);
		const eThresh = 0.0025 / invERef;

		const posR = isLight ? 217 : 245;
		const posG = isLight ? 119 : 158;
		const posB = isLight ? 6 : 11;
		const negR = isLight ? 2 : 56;
		const negG = isLight ? 132 : 189;
		const negB = isLight ? 199 : 248;
		const glowScale = isLight ? 14 : 18;

		for (let i = 0; i < CELL_COUNT; i++) {
			if (material[i] === MAT_WALL) {
				buf32[i] = staticBuf32[i];
				continue;
			}

			const pv = p[i];
			const eVal = eRms[i];
			if (pv === 0 && eVal <= eThresh) {
				buf32[i] = staticBuf32[i];
				continue;
			}

			let r = staticR[i];
			let g = staticG[i];
			let b = staticB[i];

			const signed = fastTanh(pv * scaleP);
			if (signed >= 0) {
				r = r + (posR - r) * signed;
				g = g + (posG - g) * signed;
				b = b + (posB - b) * signed;
			} else {
				const a = -signed;
				r = r + (negR - r) * a;
				g = g + (negG - g) * a;
				b = b + (negB - b) * a;
			}

			if (eVal > eThresh) {
				const rmsNorm = Math.min(1, Math.sqrt(eVal * invERef));
				const gBoost = rmsNorm * glowScale;
				r = r + gBoost;
				g = g + gBoost * 0.9;
				b = b + gBoost * 0.7;
			}

			buf32[i] = packRgb(r + 0.5, g + 0.5, b + 0.5);
		}

		offCtx.putImageData(imgData, 0, 0);

		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.fillStyle = isLight ? '#ebe5d7' : '#0b0f15';
		ctx.fillRect(0, 0, widthCss, heightCss);

		const fit = computeFitRect();
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'low';
		ctx.drawImage(offscreen, fit.x, fit.y, fit.w, fit.h);

		// Subtle architectural meter grid (1 m = 16 cells)
		ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.1)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let gx = 16; gx < GRID_NX; gx += 16) {
			const cx = fit.x + (gx / (GRID_NX - 1)) * fit.w;
			ctx.moveTo(cx, fit.y);
			ctx.lineTo(cx, fit.y + fit.h);
		}
		for (let gy = 16; gy < GRID_NY; gy += 16) {
			const cy = fit.y + (gy / (GRID_NY - 1)) * fit.h;
			ctx.moveTo(fit.x, cy);
			ctx.lineTo(fit.x + fit.w, cy);
		}
		ctx.stroke();

		// Batched Chladni sand particles (1 draw call for all 2,000 grains)
		if (state.chladniEnabled) {
			ctx.fillStyle = isLight ? 'rgba(22, 28, 38, 0.85)' : 'rgba(243, 239, 227, 0.88)';
			const count = state.chladniX.length;
			const sxScale = fit.w / (GRID_NX - 1);
			const syScale = fit.h / (GRID_NY - 1);
			ctx.beginPath();
			for (let k = 0; k < count; k++) {
				const cx = fit.x + state.chladniX[k] * sxScale;
				const cy = fit.y + state.chladniY[k] * syScale;
				ctx.rect(cx - 0.9, cy - 0.9, 1.8, 1.8);
			}
			ctx.fill();
		}

		// Draw Emitter (S) and Listener (L) beacons
		const drawBeacon = (pt: GridPoint, label: string, color: string, ringColor: string) => {
			const pos = gridToCanvas(pt.x, pt.y);
			ctx.save();
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
			ctx.fillStyle = ringColor;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = color;
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(pos.x, pos.y, 7.5, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();

			ctx.fillStyle = '#0b1016';
			ctx.font = '700 10px ui-monospace, SFMono-Regular, monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(label, pos.x, pos.y + 0.5);
			ctx.restore();
		};

		drawBeacon(state.source, 'S', '#fb7185', 'rgba(251, 113, 133, 0.24)');
		drawBeacon(state.listener, 'L', '#34d399', 'rgba(52, 211, 153, 0.24)');

		ctx.restore();
	}

	function dispose(): void {
		// Nothing external to release
	}

	return {
		render,
		screenToGrid,
		gridToCanvas,
		invalidateMaterial,
		resize,
		dispose
	};
}
