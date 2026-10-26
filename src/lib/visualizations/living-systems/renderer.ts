import { LifeModel } from './life';
import { AntModel } from './ant';
import { DiffusionModel } from './diffusion';
import { WalkModel } from './walk';
import { cellSize, type Camera, type Mode } from './presentation';

export interface Models {
	life: LifeModel;
	ant: AntModel;
	diffusion: DiffusionModel;
	walk: WalkModel;
}
export interface DrawOptions {
	grid: boolean;
	trails: number;
	heatmap: boolean;
	cursor: { x: number; y: number; radius: number } | null;
}
const wrap = (value: number, length: number) => ((value % length) + length) % length;
const WALK_COLOURS = ['#e5c77a', '#a1d9c3', '#f0967b', '#8ebdd8', '#d3a7cd', '#c4cf99'];
const LIFE_COLOURS = ['#fb9d7c', '#f5c683', '#d1d8a2', '#a3ceb2', '#6dac9b', '#4b877f'];

/** One per-mount painter; the small raster is shared only by this instance's fields. */
export function createPainter() {
	const raster = document.createElement('canvas');
	raster.width = 120;
	raster.height = 84;
	const rasterContext = raster.getContext('2d');
	if (!rasterContext) throw new Error('Canvas 2D is unavailable.');
	const pixels = rasterContext.createImageData(120, 84);
	return (
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		models: Models,
		mode: Mode,
		camera: Camera,
		options: DrawOptions
	) => {
		const scale = cellSize(width, height, camera);
		const ox = width / 2 - camera.x * scale;
		const oy = height / 2 - camera.y * scale;
		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = '#142426';
		ctx.fillRect(0, 0, width, height);
		const minX = Math.floor(-ox / scale),
			maxX = Math.ceil((width - ox) / scale);
		const minY = Math.floor(-oy / scale),
			maxY = Math.ceil((height - oy) / scale);
		// Subdued registration dots keep the field legible without competing with its state.
		const spacing = scale >= 5 ? 5 : 10;
		ctx.fillStyle = '#8ab9a51b';
		for (let y = Math.floor(minY / spacing) * spacing; y <= maxY; y += spacing)
			for (let x = Math.floor(minX / spacing) * spacing; x <= maxX; x += spacing)
				ctx.fillRect(ox + x * scale, oy + y * scale, 1, 1);

		ctx.save();
		if (mode !== 'ant') {
			ctx.beginPath();
			ctx.rect(ox, oy, 120 * scale, 84 * scale);
			ctx.clip();
		}
		if (mode === 'life') {
			const { cells, ages } = models.life;
			const inset = scale > 3 ? Math.min(0.65, scale * 0.1) : 0;
			for (let y = Math.max(0, minY); y < Math.min(84, maxY + 1); y++) {
				for (let x = Math.max(0, minX); x < Math.min(120, maxX + 1); x++) {
					const i = y * 120 + x;
					if (!cells[i]) continue;
					ctx.fillStyle = LIFE_COLOURS[Math.min(5, Math.floor(Math.log2(Math.max(1, ages[i]))))];
					ctx.fillRect(
						ox + x * scale + inset,
						oy + y * scale + inset,
						scale - inset * 2,
						scale - inset * 2
					);
				}
			}
		} else if (mode === 'ant') {
			ctx.fillStyle = '#dfc783';
			for (const key of models.ant.black) {
				const comma = key.indexOf(',');
				const x = Number(key.slice(0, comma)),
					y = Number(key.slice(comma + 1));
				if (x < minX || x > maxX || y < minY || y > maxY) continue;
				ctx.fillRect(
					ox + x * scale + 0.3,
					oy + y * scale + 0.3,
					Math.max(0.5, scale - 0.6),
					Math.max(0.5, scale - 0.6)
				);
			}
			const ant = models.ant;
			const x = ox + (ant.x + 0.5) * scale,
				y = oy + (ant.y + 0.5) * scale;
			ctx.translate(x, y);
			ctx.rotate((ant.direction * Math.PI) / 2);
			const radius = Math.max(5, Math.min(13, scale * 0.8));
			ctx.fillStyle = '#ef8d71';
			ctx.strokeStyle = '#142426';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, -radius);
			ctx.lineTo(radius * 0.7, radius * 0.7);
			ctx.lineTo(0, radius * 0.3);
			ctx.lineTo(-radius * 0.7, radius * 0.7);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		} else if (mode === 'diffusion' || options.heatmap) {
			const data = mode === 'diffusion' ? models.diffusion.values : models.walk.occupancy;
			let max = 1;
			if (mode === 'walk') for (const value of data) max = Math.max(max, value);
			for (let i = 0; i < data.length; i++) {
				const v =
					mode === 'diffusion' ? Math.min(1, data[i] / 4) : Math.log1p(data[i]) / Math.log1p(max);
				// A fixed concentration scale: deep teal through sea glass to warm pigment.
				const t = Math.sqrt(Math.max(0, v));
				const p = i * 4;
				pixels.data[p] = Math.round(20 + 223 * t ** 1.6);
				pixels.data[p + 1] = Math.round(36 + 169 * Math.sin(t * Math.PI * 0.72));
				pixels.data[p + 2] = Math.round(38 + 148 * Math.sin(t * Math.PI));
				pixels.data[p + 3] = 255;
				if (mode === 'diffusion' && models.diffusion.obstacles[i]) {
					pixels.data[p] = 176;
					pixels.data[p + 1] = 170;
					pixels.data[p + 2] = 146;
				}
			}
			rasterContext.putImageData(pixels, 0, 0);
			ctx.imageSmoothingEnabled = mode === 'diffusion';
			ctx.drawImage(raster, ox, oy, 120 * scale, 84 * scale);
		}

		if (mode === 'walk') {
			const walk = models.walk;
			if (options.trails > 0) {
				ctx.globalAlpha = options.heatmap ? 0.3 : 0.4;
				ctx.lineWidth = walk.count === 1 ? 2 : 0.8;
				for (let i = 0; i < walk.count; i++) {
					ctx.strokeStyle = WALK_COLOURS[i % WALK_COLOURS.length];
					ctx.beginPath();
					const path = walk.paths[i];
					let lastX = -1000,
						lastY = -1000;
					for (let j = Math.max(0, path.length - options.trails); j < path.length; j++) {
						const x = wrap(path[j][0] + 60, 120) + 0.5,
							y = wrap(path[j][1] + 42, 84) + 0.5;
						if (Math.abs(x - lastX) > 60 || Math.abs(y - lastY) > 42)
							ctx.moveTo(ox + x * scale, oy + y * scale);
						else ctx.lineTo(ox + x * scale, oy + y * scale);
						lastX = x;
						lastY = y;
					}
					ctx.stroke();
				}
			}
			ctx.globalAlpha = 1;
			for (let i = 0; i < walk.count; i++) {
				ctx.fillStyle = WALK_COLOURS[i % WALK_COLOURS.length];
				ctx.beginPath();
				ctx.arc(
					ox + (wrap(walk.x[i] + 60, 120) + 0.5) * scale,
					oy + (wrap(walk.y[i] + 42, 84) + 0.5) * scale,
					walk.count === 1 ? 4.5 : 2,
					0,
					Math.PI * 2
				);
				ctx.fill();
			}
			ctx.strokeStyle = '#f5eee1';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(ox + 60.5 * scale, oy + 42.5 * scale, 7, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.restore();

		if (options.grid && scale >= 5) {
			ctx.strokeStyle = '#adc5b712';
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			for (let x = minX; x <= maxX; x++) {
				ctx.moveTo(ox + x * scale, 0);
				ctx.lineTo(ox + x * scale, height);
			}
			for (let y = minY; y <= maxY; y++) {
				ctx.moveTo(0, oy + y * scale);
				ctx.lineTo(width, oy + y * scale);
			}
			ctx.stroke();
		}
		if (mode !== 'ant') {
			ctx.strokeStyle = '#bacfb63b';
			ctx.lineWidth = 1;
			ctx.strokeRect(ox + 0.5, oy + 0.5, 120 * scale - 1, 84 * scale - 1);
		}
		if (options.cursor) {
			ctx.strokeStyle = '#f6ecda';
			ctx.setLineDash([3, 4]);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(
				ox + (options.cursor.x + 0.5) * scale,
				oy + (options.cursor.y + 0.5) * scale,
				Math.max(5, options.cursor.radius * scale),
				0,
				Math.PI * 2
			);
			ctx.stroke();
			ctx.setLineDash([]);
		}
	};
}
