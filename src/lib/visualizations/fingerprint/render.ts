import { initiationAnchors, LENGTH, RADIUS, type Settings } from './config.ts';
import type { FingerprintFrame } from './protocol.ts';

export type View = 'print' | 'signal';
export const RENDER_WIDTH = 600;
export const RENDER_HEIGHT = 592;
export const SIGNAL_MAX = 22;
const PAPER = [229, 225, 214] as const;
const INK = [36, 40, 39] as const;
const SIGNAL_LOW = [31, 36, 64] as const;
const SIGNAL_MID = [56, 129, 130] as const;
const SIGNAL_HIGH = [251, 204, 117] as const;
const clamp = (x: number, low = 0, high = 1) => Math.min(high, Math.max(low, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => {
	const t = clamp(x);
	return t * t * (3 - 2 * t);
};

function sample(frame: FingerprintFrame, row: number, column: number): number {
	const x = clamp(column, 0, frame.columns - 1);
	const y = clamp(row, 0, frame.rows - 1);
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(frame.columns - 1, x0 + 1);
	const y1 = Math.min(frame.rows - 1, y0 + 1);
	const { field, columns } = frame;
	return mix(
		mix(field[y0 * columns + x0], field[y0 * columns + x1], x - x0),
		mix(field[y1 * columns + x0], field[y1 * columns + x1], x - x0),
		y - y0
	);
}

const SCALE = 0.58;
const BASE = 542;

function shade(u: number, edge: number, channel: number, view: View) {
	if (view === 'print') return mix(PAPER[channel], INK[channel], edge * smooth((u - 9.75) / 4.65));
	const t = clamp(u / SIGNAL_MAX) * 2;
	const color =
		t <= 1
			? mix(SIGNAL_LOW[channel], SIGNAL_MID[channel], t)
			: mix(SIGNAL_MID[channel], SIGNAL_HIGH[channel], t - 1);
	return mix(PAPER[channel], color, edge);
}

// A flattened angular view: angular distance is linear across each latitude.
// The display width follows its local radius and the vertical axis follows axial height.
// This retains the cap and avoids compressing all the outer ridges in a frontal projection.
export function rasterize(frame: FingerprintFrame, view: View): Uint8ClampedArray<ArrayBuffer> {
	const pixels = new Uint8ClampedArray(RENDER_WIDTH * RENDER_HEIGHT * 4);
	const { radius, length, columns, rows, capRows } = frame;
	const minX = Math.max(0, Math.floor(RENDER_WIDTH / 2 - radius * SCALE - 1));
	const maxX = Math.min(RENDER_WIDTH, Math.ceil(RENDER_WIDTH / 2 + radius * SCALE + 1));
	for (let y = 0, offset = 0; y < RENDER_HEIGHT; y++) {
		const centreHeight = (BASE - y - 0.5) / SCALE;
		const nearTip = centreHeight > length + radius * 0.86;
		const samples = nearTip ? 4 : 1;
		for (let x = 0; x < RENDER_WIDTH; x++, offset += 4) {
			pixels[offset] = PAPER[0];
			pixels[offset + 1] = PAPER[1];
			pixels[offset + 2] = PAPER[2];
			pixels[offset + 3] = 255;
			if (x < minX || x >= maxX || centreHeight > length + radius + 1 || centreHeight < -1)
				continue;
			let red = PAPER[0] * samples;
			let green = PAPER[1] * samples;
			let blue = PAPER[2] * samples;
			for (let index = 0; index < samples; index++) {
				const lateral = (x + 0.5 - RENDER_WIDTH / 2) / SCALE;
				// Subpixel integration at the cap tip, where the axial view compresses ridges.
				const height = centreHeight + (0.5 - (index + 0.5) / samples) / SCALE;
				// The very bottom bows a little so the crease is readable as an edge.
				const bow = 18 * (lateral / radius) ** 2;
				const z = height - bow * clamp(1 - height / 185);
				if (z < -1 || z > length + radius) continue;
				const angle = z > length ? Math.acos(clamp((z - length) / radius)) : Math.PI / 2;
				const half = radius * Math.sin(angle);
				const edge = clamp((half - Math.abs(lateral)) * SCALE + 0.5) * clamp(z * SCALE + 0.5);
				if (edge <= 0 || half <= 0) continue;
				const column = (columns * (lateral / half + 1)) / 2 - 0.5;
				const row =
					z > length
						? capRows * angle * (2 / Math.PI) - 0.5
						: capRows + (rows - capRows) * (1 - z / length) - 0.5;
				const u = sample(frame, row, column);
				red += shade(u, edge, 0, view) - PAPER[0];
				green += shade(u, edge, 1, view) - PAPER[1];
				blue += shade(u, edge, 2, view) - PAPER[2];
			}
			pixels[offset] = red / samples;
			pixels[offset + 1] = green / samples;
			pixels[offset + 2] = blue / samples;
		}
	}
	return pixels;
}

export function paint(canvas: HTMLCanvasElement, frame: FingerprintFrame, view: View): boolean {
	const ctx = canvas.getContext('2d');
	if (!ctx) return false;
	if (canvas.width !== RENDER_WIDTH) canvas.width = RENDER_WIDTH;
	if (canvas.height !== RENDER_HEIGHT) canvas.height = RENDER_HEIGHT;
	ctx.putImageData(new ImageData(rasterize(frame, view), RENDER_WIDTH, RENDER_HEIGHT), 0, 0);
	return true;
}

export async function saveImage(frame: FingerprintFrame, view: View): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = RENDER_WIDTH;
	canvas.height = RENDER_HEIGHT + 42;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas export is unavailable.');
	ctx.putImageData(new ImageData(rasterize(frame, view), RENDER_WIDTH, RENDER_HEIGHT), 0, 0);
	ctx.fillStyle = '#e5e1d6';
	ctx.fillRect(0, RENDER_HEIGHT, RENDER_WIDTH, 42);
	ctx.fillStyle = '#242827';
	ctx.font = '14px system-ui, sans-serif';
	ctx.textAlign = 'center';
	const name =
		view === 'print' ? 'Synthetic fingerprint' : 'Synthetic fingerprint · Activator signal';
	ctx.fillText(
		`${name} · Simulation time ${Math.round(frame.time)}`,
		RENDER_WIDTH / 2,
		RENDER_HEIGHT + 13
	);
	return new Promise((resolve, reject) =>
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('Image export could not finish.'));
		}, 'image/png')
	);
}

export type StartingRegion = { id: 'pad' | 'nail' | 'crease'; label: string; x: number; y: number };

export function startingRegions(settings: Settings, frame?: FingerprintFrame): StartingRegion[] {
	const radius = frame?.radius ?? RADIUS * settings.width;
	const length = frame?.length ?? LENGTH;
	const locate = (
		id: StartingRegion['id'],
		label: string,
		theta: number,
		z: number
	): StartingRegion => {
		const fraction = Math.sin(Math.acos(clamp((z - length) / radius)));
		const lateral = (radius * fraction * 2 * theta) / Math.PI;
		const bow = 18 * (lateral / radius) ** 2;
		const height = z >= 185 ? z : (z + bow) / (1 + bow / 185);
		return {
			id,
			label,
			x: 0.5 + (lateral * SCALE) / RENDER_WIDTH,
			y: (BASE - height * SCALE) / RENDER_HEIGHT
		};
	};
	const { nail, crease, pad } = initiationAnchors(settings);
	const regions = [
		locate('nail', 'Nail side', nail.theta, nail.z),
		locate('crease', 'Crease side', crease.theta, crease.z)
	];
	if (pad) regions.push(locate('pad', 'Pad', pad.theta, pad.z));
	return regions;
}
