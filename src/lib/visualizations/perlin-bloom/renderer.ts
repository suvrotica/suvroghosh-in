import type { BloomGeometry, BloomPalette, FlowerConfig, PetalGeometry, Point2D } from './types';

const TAU = Math.PI * 2;
const parsedColourCache = new Map<string, readonly [number, number, number]>();

export type NoiseSampler = (x: number, y: number, z: number) => number;

export type RenderQuality = Readonly<{
	name: 'low' | 'high';
	petalStride: number;
	veinStride: number;
	interference: boolean;
	pollenCount: number;
	backgroundPoints: number;
	glowScale: number;
	glowBlur: number;
}>;

export type BloomPointer = Readonly<{
	x: number;
	y: number;
	active: boolean;
}>;

export type BloomPulse = Readonly<{
	x: number;
	y: number;
	startedAt: number;
	strength: number;
}>;

export type CanvasSurface = Readonly<{
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
}>;

export type BloomLayerSet = Readonly<{
	background: CanvasSurface;
	instrument: CanvasSurface;
	body: CanvasSurface;
	light: CanvasSurface;
	glow: CanvasSurface;
	particles: CanvasSurface;
}>;

export type BloomFrame = Readonly<{
	config: FlowerConfig;
	palette: BloomPalette;
	geometry: BloomGeometry;
	width: number;
	height: number;
	time: number;
	pointer: BloomPointer;
	pulses: readonly BloomPulse[];
	quality: RenderQuality;
	noise: NoiseSampler;
	particleSeed: number;
	redrawBackground: boolean;
	debug?: boolean;
	fps?: number;
	frameTime?: number;
}>;

export type BloomRenderStats = Readonly<{
	ruptureCount: number;
	deformedPointCount: number;
}>;

type SceneMetrics = Readonly<{
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	scale: number;
	boxHalfSize: number;
}>;

type DynamicPetal = {
	geometry: PetalGeometry;
	centerX: Float32Array;
	centerY: Float32Array;
	normalX: Float32Array;
	normalY: Float32Array;
	halfWidth: Float32Array;
	leftX: Float32Array;
	leftY: Float32Array;
	rightX: Float32Array;
	rightY: Float32Array;
	field: Float32Array;
	distance: Float32Array;
};

type Rupture = { x: number; y: number; intensity: number; petalIndex: number };

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function mix(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = clamp((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function fract(value: number): number {
	return value - Math.floor(value);
}

function uintHash(seed: number, index: number, channel: number): number {
	let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 7, 0x85ebca6b)) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
	value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
	return (value ^ (value >>> 16)) >>> 0;
}

function hashUnit(seed: number, index: number, channel: number): number {
	return uintHash(seed, index, channel) / 0x1_0000_0000;
}

function parseHex(colour: string): readonly [number, number, number] {
	const cached = parsedColourCache.get(colour);
	if (cached) return cached;
	const value = colour.trim().replace(/^#/u, '');
	let parsed: readonly [number, number, number];
	if (/^[0-9a-f]{3}$/iu.test(value)) {
		parsed = [
			Number.parseInt(value[0] + value[0], 16),
			Number.parseInt(value[1] + value[1], 16),
			Number.parseInt(value[2] + value[2], 16)
		];
	} else if (/^[0-9a-f]{6}$/iu.test(value)) {
		parsed = [
			Number.parseInt(value.slice(0, 2), 16),
			Number.parseInt(value.slice(2, 4), 16),
			Number.parseInt(value.slice(4, 6), 16)
		];
	} else {
		parsed = [255, 255, 255];
	}
	parsedColourCache.set(colour, parsed);
	return parsed;
}

function alphaColour(colour: string, alpha: number): string {
	const [red, green, blue] = parseHex(colour);
	return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha)})`;
}

function mixColour(left: string, right: string, amount: number, alpha = 1): string {
	const a = parseHex(left);
	const b = parseHex(right);
	const t = clamp(amount);
	return `rgba(${Math.round(mix(a[0], b[0], t))}, ${Math.round(mix(a[1], b[1], t))}, ${Math.round(mix(a[2], b[2], t))}, ${clamp(alpha)})`;
}

function resetSurface(surface: CanvasSurface): CanvasRenderingContext2D {
	const context = surface.context;
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.globalAlpha = 1;
	context.globalCompositeOperation = 'source-over';
	context.filter = 'none';
	context.shadowBlur = 0;
	context.shadowColor = 'transparent';
	context.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
	context.lineCap = 'round';
	context.lineJoin = 'round';
	return context;
}

function sceneMetrics(width: number, height: number, config: Readonly<FlowerConfig>): SceneMetrics {
	const shortest = Math.max(1, Math.min(width, height));
	return {
		width,
		height,
		centerX: width * 0.5,
		centerY: height * 0.505,
		scale: shortest * 0.76,
		boxHalfSize: config.boxSize
	};
}

function toCanvasX(metrics: SceneMetrics, value: number): number {
	return metrics.centerX + value * metrics.scale;
}

function toCanvasY(metrics: SceneMetrics, value: number): number {
	return metrics.centerY + value * metrics.scale;
}

function pointerToLocal(pointer: BloomPointer, metrics: SceneMetrics): Point2D {
	return {
		x: (pointer.x * metrics.width - metrics.centerX) / metrics.scale,
		y: (pointer.y * metrics.height - metrics.centerY) / metrics.scale
	};
}

function boundaryResponse(config: Readonly<FlowerConfig>, distance: number): number {
	if (!config.boundaryPhysics) return 0;
	const pressureBand = 1 - smoothstep(0.012, 0.14, Math.abs(distance));
	const released = smoothstep(config.ruptureThreshold, config.ruptureThreshold + 0.16, distance);
	return clamp(Math.max(pressureBand, released * 0.72));
}

function strongestBoundaryResponse(
	petal: Readonly<DynamicPetal>,
	config: Readonly<FlowerConfig>
): number {
	let strongest = 0;
	const stride = Math.max(1, Math.floor(petal.distance.length / 12));
	for (let index = 0; index < petal.distance.length; index += stride) {
		strongest = Math.max(strongest, boundaryResponse(config, petal.distance[index]));
	}
	return strongest;
}

function traceSmoothPoints(
	context: CanvasRenderingContext2D,
	xs: ArrayLike<number>,
	ys: ArrayLike<number>,
	metrics: SceneMetrics,
	start: number,
	end: number,
	stride = 1,
	reverse = false
): void {
	const direction = reverse ? -Math.max(1, stride) : Math.max(1, stride);
	let index = reverse ? end : start;
	const stop = reverse ? start : end;
	context.moveTo(toCanvasX(metrics, xs[index]), toCanvasY(metrics, ys[index]));
	while (reverse ? index > stop : index < stop) {
		const next = reverse ? Math.max(stop, index + direction) : Math.min(stop, index + direction);
		const nextX = toCanvasX(metrics, xs[next]);
		const nextY = toCanvasY(metrics, ys[next]);
		if (next === stop) {
			context.lineTo(nextX, nextY);
		} else {
			const after = reverse ? Math.max(stop, next + direction) : Math.min(stop, next + direction);
			const afterX = toCanvasX(metrics, xs[after]);
			const afterY = toCanvasY(metrics, ys[after]);
			context.quadraticCurveTo(nextX, nextY, (nextX + afterX) * 0.5, (nextY + afterY) * 0.5);
		}
		index = next;
	}
}

function traceRibbon(
	context: CanvasRenderingContext2D,
	petal: DynamicPetal,
	metrics: SceneMetrics,
	stride: number,
	widthScale = 1
): void {
	const last = petal.centerX.length - 1;
	context.beginPath();
	if (widthScale === 1) {
		traceSmoothPoints(context, petal.leftX, petal.leftY, metrics, 0, last, stride);
		traceSmoothPoints(context, petal.rightX, petal.rightY, metrics, 0, last, stride, true);
	} else {
		const firstLeftX = petal.centerX[0] + petal.normalX[0] * petal.halfWidth[0] * widthScale;
		const firstLeftY = petal.centerY[0] + petal.normalY[0] * petal.halfWidth[0] * widthScale;
		context.moveTo(toCanvasX(metrics, firstLeftX), toCanvasY(metrics, firstLeftY));
		for (let index = stride; index <= last; index += stride) {
			const sample = Math.min(last, index);
			context.lineTo(
				toCanvasX(
					metrics,
					petal.centerX[sample] + petal.normalX[sample] * petal.halfWidth[sample] * widthScale
				),
				toCanvasY(
					metrics,
					petal.centerY[sample] + petal.normalY[sample] * petal.halfWidth[sample] * widthScale
				)
			);
		}
		for (let index = last; index >= 0; index -= stride) {
			const sample = Math.max(0, index);
			context.lineTo(
				toCanvasX(
					metrics,
					petal.centerX[sample] - petal.normalX[sample] * petal.halfWidth[sample] * widthScale
				),
				toCanvasY(
					metrics,
					petal.centerY[sample] - petal.normalY[sample] * petal.halfWidth[sample] * widthScale
				)
			);
		}
	}
	context.closePath();
}

function drawBackground(frame: BloomFrame, surface: CanvasSurface): void {
	const context = resetSurface(surface);
	const { width, height, palette, particleSeed, quality, config, noise } = frame;
	const diagonal = context.createLinearGradient(0, 0, width, height);
	diagonal.addColorStop(0, palette.background[0]);
	diagonal.addColorStop(0.52, palette.background[1]);
	diagonal.addColorStop(1, palette.background[2]);
	context.fillStyle = diagonal;
	context.fillRect(0, 0, width, height);

	const aura = context.createRadialGradient(
		width * 0.5,
		height * 0.5,
		0,
		width * 0.5,
		height * 0.5,
		Math.max(width, height) * 0.72
	);
	aura.addColorStop(0, alphaColour(palette.membranes[0], 0.115));
	aura.addColorStop(0.42, alphaColour(palette.membranes[1], 0.035));
	aura.addColorStop(1, 'rgba(0, 0, 0, 0.46)');
	context.fillStyle = aura;
	context.fillRect(0, 0, width, height);

	context.globalCompositeOperation = 'screen';
	for (let index = 0; index < quality.backgroundPoints; index += 1) {
		const x = hashUnit(particleSeed, index, 1) * width;
		const y = hashUnit(particleSeed, index, 2) * height;
		const field = noise(
			(x / Math.max(1, width)) * 1.3 + 11,
			(y / Math.max(1, height)) * 1.3 + 19,
			7
		);
		const radius = 0.35 + hashUnit(particleSeed, index, 3) * 1.25;
		context.fillStyle = alphaColour(
			index % 4 === 0 ? palette.accent : palette.edge,
			0.025 + field * 0.075
		);
		context.beginPath();
		context.arc(x, y, radius, 0, TAU);
		context.fill();
	}

	if (config.grain > 0) {
		const grainCount = Math.round(config.grain * quality.backgroundPoints * 19);
		context.globalCompositeOperation = 'overlay';
		context.fillStyle = 'rgba(255, 255, 255, 0.07)';
		for (let index = 0; index < grainCount; index += 1) {
			const x = hashUnit(particleSeed, index, 13) * width;
			const y = hashUnit(particleSeed, index, 14) * height;
			context.fillRect(x, y, 0.45 + hashUnit(particleSeed, index, 15), 0.45);
		}
	}
	context.globalCompositeOperation = 'source-over';
}

function drawAnatomyField(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics
): void {
	const steps = frame.quality.name === 'low' ? 15 : 25;
	const extent = 0.72;
	const cell = (extent * 2) / steps;
	for (let row = 0; row < steps; row += 1) {
		for (let column = 0; column < steps; column += 1) {
			const x = -extent + (column + 0.5) * cell;
			const y = -extent + (row + 0.5) * cell;
			const distance = Math.max(Math.abs(x), Math.abs(y)) - frame.config.boxSize;
			const wall = 1 - smoothstep(0, 0.13, Math.abs(distance));
			if (wall < 0.025) continue;
			context.fillStyle = alphaColour(
				distance > 0 ? frame.palette.rupture : frame.palette.box,
				wall * (distance > 0 ? 0.06 : 0.035)
			);
			context.fillRect(
				toCanvasX(metrics, x - cell * 0.48),
				toCanvasY(metrics, y - cell * 0.48),
				cell * metrics.scale * 0.96,
				cell * metrics.scale * 0.96
			);
		}
	}
	context.strokeStyle = alphaColour(frame.palette.box, 0.12);
	context.lineWidth = 0.65;
	context.setLineDash([2, 8]);
	for (let whorl = 0; whorl < frame.config.whorls; whorl += 1) {
		const radius = mix(0.1, 0.49, (whorl + 1) / frame.config.whorls);
		context.beginPath();
		context.arc(metrics.centerX, metrics.centerY, radius * metrics.scale, 0, TAU);
		context.stroke();
	}
	context.setLineDash([]);
}

function drawInstrument(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics,
	ruptures: readonly Rupture[]
): void {
	if (frame.config.view === 'anatomy') drawAnatomyField(context, frame, metrics);
	if (!frame.config.boxVisible || frame.config.boxOpacity <= 0) return;
	const half = frame.config.boxSize * metrics.scale;
	const left = metrics.centerX - half;
	const top = metrics.centerY - half;
	const size = half * 2;
	const rear = Math.max(7, metrics.scale * 0.035);
	const opacity = frame.config.boxOpacity;

	context.lineWidth = Math.max(0.7, metrics.scale * 0.00145);
	context.strokeStyle = alphaColour(frame.palette.box, opacity * 0.2);
	context.strokeRect(left + rear, top - rear, size, size);
	context.beginPath();
	for (const [x, y] of [
		[left, top],
		[left + size, top],
		[left + size, top + size],
		[left, top + size]
	] as const) {
		context.moveTo(x, y);
		context.lineTo(x + rear, y - rear);
	}
	context.stroke();

	context.strokeStyle = alphaColour(frame.palette.box, opacity * 0.12);
	context.lineWidth = 0.55;
	for (let division = 1; division < 4; division += 1) {
		const offset = (size * division) / 4;
		context.beginPath();
		context.moveTo(left + offset, top);
		context.lineTo(left + offset, top + size);
		context.moveTo(left, top + offset);
		context.lineTo(left + size, top + offset);
		context.stroke();
	}

	context.strokeStyle = alphaColour(frame.palette.box, opacity * 0.78);
	context.shadowColor = alphaColour(frame.palette.box, opacity * 0.6);
	context.shadowBlur = 7;
	context.lineWidth = Math.max(0.9, metrics.scale * 0.002);
	context.strokeRect(left, top, size, size);
	context.shadowBlur = 0;

	const notch = Math.max(5, metrics.scale * 0.018);
	context.strokeStyle = alphaColour(frame.palette.box, opacity * 0.9);
	context.lineWidth = Math.max(1, metrics.scale * 0.0024);
	for (const [x, y, sx, sy] of [
		[left, top, 1, 1],
		[left + size, top, -1, 1],
		[left + size, top + size, -1, -1],
		[left, top + size, 1, -1]
	] as const) {
		context.beginPath();
		context.moveTo(x + sx * notch * 1.8, y);
		context.lineTo(x, y);
		context.lineTo(x, y + sy * notch * 1.8);
		context.stroke();
	}

	for (const rupture of ruptures) {
		const x = toCanvasX(metrics, rupture.x);
		const y = toCanvasY(metrics, rupture.y);
		const radius = metrics.scale * (0.014 + 0.032 * rupture.intensity);
		const halo = context.createRadialGradient(x, y, 0, x, y, radius);
		halo.addColorStop(0, alphaColour(frame.palette.rupture, 0.42 * opacity));
		halo.addColorStop(1, alphaColour(frame.palette.rupture, 0));
		context.fillStyle = halo;
		context.beginPath();
		context.arc(x, y, radius, 0, TAU);
		context.fill();
	}
}

function drawPetalBodies(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics,
	petals: readonly DynamicPetal[]
): void {
	// Geometry is stored inner-to-outer, so reverse iteration paints the outer whorls first without
	// allocating and sorting a new array every frame.
	for (let petalIndex = petals.length - 1; petalIndex >= 0; petalIndex -= 1) {
		const petal = petals[petalIndex];
		const whorlPhase =
			frame.config.whorls <= 1 ? 1 : petal.geometry.whorlIndex / (frame.config.whorls - 1);
		const bodyColour = frame.palette.membranes[petal.geometry.whorlIndex % 3];
		const nextColour = frame.palette.membranes[(petal.geometry.whorlIndex + 1) % 3];
		const depthAlpha = mix(1.08, 0.66, whorlPhase);
		const middle = Math.floor(petal.field.length * 0.56);
		const field = petal.field[middle] ?? 0.5;
		const boundary = strongestBoundaryResponse(petal, frame.config);
		const breathing = frame.config.motionEnabled
			? Math.sin(
					frame.time * 0.72 - petal.geometry.whorlIndex * 0.16 + petal.geometry.index * 0.013
				)
			: 0;
		const opacityPhase = (0.86 + field * 0.25) * (1 + breathing * frame.config.breath * 0.18);
		traceRibbon(context, petal, metrics, frame.quality.petalStride);
		context.fillStyle = mixColour(
			bodyColour,
			nextColour,
			clamp(0.12 + 0.24 * whorlPhase + (field - 0.5) * 0.2),
			frame.config.membraneOpacity * 0.36 * depthAlpha * opacityPhase
		);
		context.fill();
		if (boundary > 0.025) {
			traceRibbon(context, petal, metrics, frame.quality.petalStride, 0.92);
			context.fillStyle = alphaColour(
				frame.palette.rupture,
				frame.config.membraneOpacity * boundary * 0.075
			);
			context.fill();
		}

		traceRibbon(context, petal, metrics, frame.quality.petalStride, 0.72);
		context.fillStyle = alphaColour(
			nextColour,
			frame.config.membraneOpacity * (0.1 + (1 - whorlPhase) * 0.06) * opacityPhase
		);
		context.fill();

		traceRibbon(context, petal, metrics, frame.quality.petalStride, 0.42);
		context.fillStyle = alphaColour(
			frame.palette.edge,
			frame.config.membraneOpacity * (0.025 + (1 - whorlPhase) * 0.025)
		);
		context.fill();
	}
}

function traceSide(
	context: CanvasRenderingContext2D,
	xs: ArrayLike<number>,
	ys: ArrayLike<number>,
	metrics: SceneMetrics,
	stride: number
): void {
	const last = xs.length - 1;
	context.beginPath();
	traceSmoothPoints(context, xs, ys, metrics, 0, last, stride);
	context.stroke();
}

function drawPetalLight(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics,
	petals: readonly DynamicPetal[]
): void {
	const pointer = pointerToLocal(frame.pointer, metrics);
	for (const petal of petals) {
		const whorlPhase =
			frame.config.whorls <= 1 ? 1 : petal.geometry.whorlIndex / (frame.config.whorls - 1);
		const breathing = frame.config.motionEnabled
			? Math.sin(frame.time * 0.72 - petal.geometry.whorlIndex * 0.16 + 0.34)
			: 0;
		const lightBreath = 1 + breathing * frame.config.breath * 0.28;
		context.lineWidth = Math.max(0.45, metrics.scale * mix(0.0016, 0.0025, whorlPhase));
		context.strokeStyle = alphaColour(
			frame.palette.edge,
			(0.16 + frame.config.veinBrightness * (0.16 + whorlPhase * 0.17)) * lightBreath
		);
		traceSide(context, petal.leftX, petal.leftY, metrics, frame.quality.petalStride);
		context.strokeStyle = alphaColour(
			frame.palette.accent,
			0.08 + frame.config.veinBrightness * 0.13
		);
		traceSide(context, petal.rightX, petal.rightY, metrics, frame.quality.petalStride);

		const last = Math.max(1, Math.floor((petal.centerX.length - 1) * 0.93));
		context.beginPath();
		traceSmoothPoints(
			context,
			petal.centerX,
			petal.centerY,
			metrics,
			0,
			last,
			frame.quality.petalStride
		);
		context.strokeStyle = alphaColour(
			frame.palette.vein,
			(0.24 + 0.38 * (1 - whorlPhase * 0.35)) * frame.config.veinBrightness * lightBreath
		);
		context.lineWidth = Math.max(0.45, metrics.scale * 0.00135);
		context.stroke();

		const branchStride = Math.max(
			frame.quality.veinStride,
			Math.round(petal.centerX.length / (frame.quality.name === 'low' ? 5 : 9))
		);
		for (let index = branchStride; index < last - branchStride / 2; index += branchStride) {
			const field = petal.field[index];
			const wallLight = boundaryResponse(frame.config, petal.distance[index]);
			const side = (index / branchStride + petal.geometry.index) % 2 < 1 ? -1 : 1;
			const reach = clamp(0.52 + field * 0.34, 0.38, 0.9);
			const startX = toCanvasX(metrics, petal.centerX[index]);
			const startY = toCanvasY(metrics, petal.centerY[index]);
			const endX = toCanvasX(
				metrics,
				petal.centerX[index] + petal.normalX[index] * petal.halfWidth[index] * reach * side
			);
			const endY = toCanvasY(
				metrics,
				petal.centerY[index] + petal.normalY[index] * petal.halfWidth[index] * reach * side
			);
			const tangentX = petal.geometry.tangents[index]?.x ?? 0;
			const tangentY = petal.geometry.tangents[index]?.y ?? 0;
			context.beginPath();
			context.moveTo(startX, startY);
			context.quadraticCurveTo(
				mix(startX, endX, 0.45) + tangentX * metrics.scale * 0.012 * (field - 0.5),
				mix(startY, endY, 0.45) + tangentY * metrics.scale * 0.012 * (field - 0.5),
				endX,
				endY
			);
			context.strokeStyle = alphaColour(
				wallLight > 0.45 ? frame.palette.rupture : frame.palette.vein,
				frame.config.veinBrightness * (0.1 + field * 0.18 + wallLight * 0.22)
			);
			context.lineWidth = Math.max(0.32, metrics.scale * 0.00072);
			context.stroke();
		}

		const accentStride = Math.max(2, frame.quality.petalStride * 2);
		for (let index = accentStride; index <= last; index += accentStride) {
			const previous = Math.max(0, index - accentStride);
			const wallLight = Math.max(
				boundaryResponse(frame.config, petal.distance[previous]),
				boundaryResponse(frame.config, petal.distance[index])
			);
			const dx = petal.centerX[index] - pointer.x;
			const dy = petal.centerY[index] - pointer.y;
			const pointerLight = frame.pointer.active
				? Math.exp(-(dx * dx + dy * dy) * 8) * frame.config.pointerInfluence
				: 0;
			const intensity = clamp(wallLight * 0.72 + pointerLight * 0.5);
			if (intensity < 0.025) continue;
			const outside = petal.distance[index] > frame.config.ruptureThreshold;
			context.strokeStyle = alphaColour(
				outside ? frame.palette.rupture : frame.palette.accent,
				0.08 + intensity * 0.55
			);
			context.lineWidth = Math.max(0.45, metrics.scale * (0.0009 + intensity * 0.0012));
			context.beginPath();
			context.moveTo(
				toCanvasX(metrics, petal.leftX[previous]),
				toCanvasY(metrics, petal.leftY[previous])
			);
			context.lineTo(
				toCanvasX(metrics, petal.leftX[index]),
				toCanvasY(metrics, petal.leftY[index])
			);
			context.moveTo(
				toCanvasX(metrics, petal.centerX[previous]),
				toCanvasY(metrics, petal.centerY[previous])
			);
			context.lineTo(
				toCanvasX(metrics, petal.centerX[index]),
				toCanvasY(metrics, petal.centerY[index])
			);
			context.stroke();
			if (outside && intensity > 0.3) {
				context.strokeStyle = alphaColour(frame.palette.edge, intensity * 0.22);
				context.beginPath();
				context.moveTo(
					toCanvasX(metrics, petal.rightX[previous]) + 1.2,
					toCanvasY(metrics, petal.rightY[previous]) - 0.7
				);
				context.lineTo(
					toCanvasX(metrics, petal.rightX[index]) + 1.2,
					toCanvasY(metrics, petal.rightY[index]) - 0.7
				);
				context.stroke();
			}
		}

		if (frame.config.tipStyle === 'split' || frame.config.tipStyle === 'filamented') {
			const start = Math.max(0, last - Math.max(2, frame.quality.petalStride * 2));
			const extension = frame.config.tipStyle === 'filamented' ? 0.038 : 0.018;
			const spread = frame.config.tipStyle === 'split' ? 0.014 : 0.006;
			context.strokeStyle = alphaColour(
				frame.palette.edge,
				0.3 + frame.config.veinBrightness * 0.35
			);
			context.lineWidth = Math.max(0.4, metrics.scale * 0.0008);
			for (const side of [-1, 1] as const) {
				context.beginPath();
				context.moveTo(
					toCanvasX(metrics, petal.centerX[start]),
					toCanvasY(metrics, petal.centerY[start])
				);
				context.lineTo(
					toCanvasX(
						metrics,
						petal.centerX[last] +
							petal.geometry.tangents[last].x * extension +
							petal.normalX[last] * spread * side
					),
					toCanvasY(
						metrics,
						petal.centerY[last] +
							petal.geometry.tangents[last].y * extension +
							petal.normalY[last] * spread * side
					)
				);
				context.stroke();
			}
		}

		if (frame.quality.interference) {
			context.lineWidth = Math.max(0.3, metrics.scale * 0.00045);
			for (let index = 5; index < last; index += 7) {
				const wallLight = boundaryResponse(frame.config, petal.distance[index]);
				if (petal.field[index] < 0.43 && wallLight < 0.08) continue;
				context.strokeStyle = alphaColour(
					wallLight > 0.38 ? frame.palette.rupture : frame.palette.accent,
					0.04 + wallLight * 0.19
				);
				context.beginPath();
				context.moveTo(
					toCanvasX(metrics, petal.leftX[index]),
					toCanvasY(metrics, petal.leftY[index])
				);
				context.quadraticCurveTo(
					toCanvasX(metrics, petal.centerX[index + 1] ?? petal.centerX[index]),
					toCanvasY(metrics, petal.centerY[index + 1] ?? petal.centerY[index]),
					toCanvasX(metrics, petal.rightX[index]),
					toCanvasY(metrics, petal.rightY[index])
				);
				context.stroke();
			}
		}
	}
}

function drawCore(
	body: CanvasRenderingContext2D,
	light: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics
): void {
	const pulse = 0.5 + 0.5 * Math.sin(frame.time * 1.25 + 0.4);
	const radius = metrics.scale * (0.044 + pulse * frame.config.breath * 0.009);
	const cavity = body.createRadialGradient(
		metrics.centerX - radius * 0.16,
		metrics.centerY - radius * 0.18,
		radius * 0.04,
		metrics.centerX,
		metrics.centerY,
		radius
	);
	cavity.addColorStop(0, frame.palette.core[0]);
	cavity.addColorStop(0.22, alphaColour(frame.palette.core[1], 0.88));
	cavity.addColorStop(0.67, alphaColour(frame.palette.membranes[0], 0.56));
	cavity.addColorStop(1, alphaColour(frame.palette.background[0], 0.96));
	body.fillStyle = cavity;
	body.beginPath();
	body.arc(metrics.centerX, metrics.centerY, radius, 0, TAU);
	body.fill();

	body.strokeStyle = alphaColour(frame.palette.core[0], 0.23 + pulse * 0.12);
	body.lineWidth = Math.max(0.6, metrics.scale * 0.0012);
	for (let ring = 1; ring <= 3; ring += 1) {
		body.beginPath();
		body.arc(metrics.centerX, metrics.centerY, radius * (0.35 + ring * 0.22), 0, TAU);
		body.stroke();
	}

	light.globalCompositeOperation = 'lighter';
	const nodes = frame.quality.name === 'low' ? 18 : 30;
	for (let index = 0; index < nodes; index += 1) {
		const fraction = (index + 0.5) / nodes;
		const angle = index * 2.399963229728653 + frame.time * frame.config.rotation * 0.2;
		const spiralRadius = radius * Math.sqrt(fraction) * 0.88;
		const x = metrics.centerX + Math.cos(angle) * spiralRadius;
		const y = metrics.centerY + Math.sin(angle) * spiralRadius;
		light.fillStyle = alphaColour(
			index % 3 === 0 ? frame.palette.accent : frame.palette.core[0],
			0.36 + (1 - fraction) * 0.48
		);
		light.beginPath();
		light.arc(x, y, Math.max(0.65, metrics.scale * (0.0012 + 0.0012 * (1 - fraction))), 0, TAU);
		light.fill();
	}

	const stamens = frame.quality.name === 'low' ? 10 : 18;
	for (let index = 0; index < stamens; index += 1) {
		const angle = (index / stamens) * TAU + (index % 2) * 0.13;
		const lag = Math.sin(frame.time * 0.72 - 0.55 + index * 0.41) * frame.config.breath;
		const reach = radius * (1.25 + (index % 4) * 0.13);
		const startX = metrics.centerX + Math.cos(angle) * radius * 0.48;
		const startY = metrics.centerY + Math.sin(angle) * radius * 0.48;
		const endAngle = angle + 0.16 * Math.sin(index * 1.7) + lag * 0.15;
		const endX = metrics.centerX + Math.cos(endAngle) * reach;
		const endY = metrics.centerY + Math.sin(endAngle) * reach;
		light.strokeStyle = alphaColour(frame.palette.vein, 0.28 + frame.config.veinBrightness * 0.28);
		light.lineWidth = Math.max(0.35, metrics.scale * 0.00075);
		light.beginPath();
		light.moveTo(startX, startY);
		light.quadraticCurveTo(
			metrics.centerX + Math.cos(angle + 0.25) * reach * 0.72,
			metrics.centerY + Math.sin(angle + 0.25) * reach * 0.72,
			endX,
			endY
		);
		light.stroke();
		light.fillStyle = alphaColour(frame.palette.pollen, 0.8);
		light.beginPath();
		light.arc(endX, endY, Math.max(0.7, metrics.scale * 0.00145), 0, TAU);
		light.fill();
	}
	light.globalCompositeOperation = 'source-over';
}

function drawAnatomyStructure(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics,
	petals: readonly DynamicPetal[]
): void {
	if (frame.config.view !== 'anatomy') return;
	context.save();
	context.setLineDash([3, 5]);
	context.lineWidth = 0.65;
	for (const petal of petals) {
		const last = petal.centerX.length - 1;
		context.strokeStyle = alphaColour(frame.palette.box, 0.42);
		context.beginPath();
		traceSmoothPoints(context, petal.centerX, petal.centerY, metrics, 0, last, 2);
		context.stroke();
		context.setLineDash([]);
		for (let index = 4; index < last; index += Math.max(7, Math.floor(last / 5))) {
			const length = petal.halfWidth[index] * 0.8 + 0.012;
			context.beginPath();
			context.moveTo(
				toCanvasX(metrics, petal.centerX[index]),
				toCanvasY(metrics, petal.centerY[index])
			);
			context.lineTo(
				toCanvasX(metrics, petal.centerX[index] + petal.normalX[index] * length),
				toCanvasY(metrics, petal.centerY[index] + petal.normalY[index] * length)
			);
			context.strokeStyle = alphaColour(frame.palette.accent, 0.36);
			context.stroke();

			const vectorAngle = (petal.field[index] - 0.5) * Math.PI;
			context.beginPath();
			context.moveTo(
				toCanvasX(metrics, petal.centerX[index]),
				toCanvasY(metrics, petal.centerY[index])
			);
			context.lineTo(
				toCanvasX(metrics, petal.centerX[index] + Math.cos(vectorAngle) * 0.025),
				toCanvasY(metrics, petal.centerY[index] + Math.sin(vectorAngle) * 0.025)
			);
			context.strokeStyle = alphaColour(frame.palette.rupture, 0.4);
			context.stroke();
		}
		context.setLineDash([3, 5]);
	}
	context.restore();
}

function drawParticles(
	context: CanvasRenderingContext2D,
	frame: BloomFrame,
	metrics: SceneMetrics,
	ruptures: readonly Rupture[]
): void {
	const motionScale = frame.config.motionEnabled ? 1 : 0;
	const count = Math.round(frame.quality.pollenCount * frame.config.pollen);
	const pointer = pointerToLocal(frame.pointer, metrics);
	context.globalCompositeOperation = 'lighter';
	for (let index = 0; index < count; index += 1) {
		const phase = hashUnit(frame.particleSeed, index, 21);
		const age = fract(
			phase + frame.time * motionScale * (0.018 + hashUnit(frame.particleSeed, index, 22) * 0.022)
		);
		const baseAngle = hashUnit(frame.particleSeed, index, 23) * TAU;
		const radial = 0.055 + age * (0.2 + hashUnit(frame.particleSeed, index, 24) * 0.42);
		const flow = frame.noise(
			Math.cos(baseAngle) * 0.8 + 41,
			Math.sin(baseAngle) * 0.8 + 17,
			frame.time * frame.config.noiseDrift + index * 0.013
		);
		const angle =
			baseAngle + (flow - 0.5) * 2.1 + age * (hashUnit(frame.particleSeed, index, 25) - 0.5);
		let x = Math.cos(angle) * radial;
		let y = Math.sin(angle) * radial;
		if (frame.pointer.active && frame.config.pointerInfluence > 0) {
			const dx = x - pointer.x;
			const dy = y - pointer.y;
			const distance = Math.max(0.02, Math.hypot(dx, dy));
			const force = frame.config.pointerInfluence * Math.exp(-distance * distance * 9) * 0.045;
			x += (dx / distance) * force;
			y += (dy / distance) * force;
		}
		for (const pulse of frame.pulses) {
			const pulseAge = frame.time - pulse.startedAt;
			if (pulseAge < 0 || pulseAge > 1.4) continue;
			const pulseLocalX = (pulse.x * metrics.width - metrics.centerX) / metrics.scale;
			const pulseLocalY = (pulse.y * metrics.height - metrics.centerY) / metrics.scale;
			const dx = x - pulseLocalX;
			const dy = y - pulseLocalY;
			const distance = Math.max(0.02, Math.hypot(dx, dy));
			const force = (1 - pulseAge / 1.4) * pulse.strength * Math.exp(-distance * 5) * 0.055;
			x += (dx / distance) * force;
			y += (dy / distance) * force;
		}
		const opacity =
			Math.sin(Math.PI * age) ** 2 * (0.16 + 0.5 * hashUnit(frame.particleSeed, index, 26));
		const size = metrics.scale * (0.0007 + hashUnit(frame.particleSeed, index, 27) * 0.0013);
		context.fillStyle = alphaColour(
			index % 5 === 0 ? frame.palette.accent : frame.palette.pollen,
			opacity
		);
		context.beginPath();
		context.arc(toCanvasX(metrics, x), toCanvasY(metrics, y), Math.max(0.45, size), 0, TAU);
		context.fill();
	}

	for (let ruptureIndex = 0; ruptureIndex < ruptures.length; ruptureIndex += 1) {
		const rupture = ruptures[ruptureIndex];
		for (let spark = 0; spark < (frame.quality.name === 'low' ? 1 : 3); spark += 1) {
			const phase = hashUnit(frame.particleSeed, rupture.petalIndex * 7 + spark, 44);
			const flicker = 0.35 + 0.65 * Math.sin(frame.time * 2.4 + phase * TAU) ** 2;
			const angle = phase * TAU + frame.time * 0.12;
			const radius = 0.007 + 0.018 * hashUnit(frame.particleSeed, spark, 45);
			context.fillStyle = alphaColour(frame.palette.rupture, flicker * rupture.intensity * 0.55);
			context.beginPath();
			context.arc(
				toCanvasX(metrics, rupture.x + Math.cos(angle) * radius),
				toCanvasY(metrics, rupture.y + Math.sin(angle) * radius),
				Math.max(0.55, metrics.scale * 0.001),
				0,
				TAU
			);
			context.fill();
		}
	}
	context.globalCompositeOperation = 'source-over';
}

function prepareGlow(frame: BloomFrame, layers: BloomLayerSet): void {
	const context = resetSurface(layers.glow);
	context.globalCompositeOperation = 'lighter';
	context.globalAlpha = 0.82;
	context.drawImage(
		layers.light.canvas,
		0,
		0,
		layers.light.canvas.width,
		layers.light.canvas.height,
		0,
		0,
		layers.glow.canvas.width,
		layers.glow.canvas.height
	);
	context.globalAlpha = 0.52;
	context.drawImage(
		layers.particles.canvas,
		0,
		0,
		layers.particles.canvas.width,
		layers.particles.canvas.height,
		0,
		0,
		layers.glow.canvas.width,
		layers.glow.canvas.height
	);
	context.globalCompositeOperation = 'source-over';
}

function compositeFrame(
	target: CanvasRenderingContext2D,
	frame: BloomFrame,
	layers: BloomLayerSet
): void {
	const persistence = frame.redrawBackground
		? 0
		: clamp(frame.config.trails * (frame.config.motionEnabled ? 0.72 : 0), 0, 0.78);
	target.save();
	target.setTransform(1, 0, 0, 1, 0, 0);
	target.globalCompositeOperation = 'source-over';
	target.filter = 'none';
	if (persistence <= 0) target.clearRect(0, 0, frame.width, frame.height);
	// An opaque background drawn with partial alpha is a bounded, allocation-free feedback fade:
	// the previous luminous frame survives briefly, while dark structure is restored immediately.
	target.globalAlpha = 1 - persistence;
	target.drawImage(layers.background.canvas, 0, 0, frame.width, frame.height);
	target.globalAlpha = 1;

	if (frame.config.glow > 0) {
		target.globalCompositeOperation = 'screen';
		target.globalAlpha = frame.config.glow * 0.55;
		target.filter = `blur(${Math.max(1, frame.quality.glowBlur * frame.config.glow)}px)`;
		target.drawImage(layers.glow.canvas, 0, 0, frame.width, frame.height);
		target.filter = 'none';
	}

	target.globalAlpha = 1;
	target.globalCompositeOperation = 'source-over';
	target.drawImage(layers.instrument.canvas, 0, 0, frame.width, frame.height);
	target.drawImage(layers.body.canvas, 0, 0, frame.width, frame.height);
	target.globalCompositeOperation = 'screen';
	target.drawImage(layers.light.canvas, 0, 0, frame.width, frame.height);
	if (frame.config.glow > 0) {
		target.globalCompositeOperation = 'lighter';
		target.globalAlpha = frame.config.glow * 0.18;
		target.drawImage(layers.glow.canvas, 0, 0, frame.width, frame.height);
	}
	target.globalAlpha = 1;
	target.drawImage(layers.particles.canvas, 0, 0, frame.width, frame.height);

	const vignette = target.createRadialGradient(
		frame.width * 0.5,
		frame.height * 0.5,
		Math.min(frame.width, frame.height) * 0.22,
		frame.width * 0.5,
		frame.height * 0.5,
		Math.max(frame.width, frame.height) * 0.73
	);
	vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
	vignette.addColorStop(0.72, 'rgba(0, 0, 0, 0.08)');
	vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
	target.globalCompositeOperation = 'source-over';
	target.fillStyle = vignette;
	target.fillRect(0, 0, frame.width, frame.height);

	if (frame.debug) {
		target.fillStyle = 'rgba(2, 5, 12, 0.82)';
		target.fillRect(10, 10, 166, 44);
		target.fillStyle = frame.palette.box;
		target.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
		target.textBaseline = 'top';
		target.fillText(`FPS ${(frame.fps ?? 0).toFixed(1)}`, 18, 17);
		target.fillText(`FRAME ${(frame.frameTime ?? 0).toFixed(2)} ms`, 18, 34);
	}
	target.restore();
}

/**
 * Shared live/export renderer. Geometry is immutable; only fixed-size typed-array workspaces are
 * mutated per frame so animation does not create a new flower or a stream of point objects.
 */
export class PerlinBloomRenderer {
	private geometry: BloomGeometry;
	private petals: DynamicPetal[];
	private readonly ruptures: Rupture[] = [];

	constructor(geometry: BloomGeometry) {
		this.geometry = geometry;
		this.petals = this.createPetals(geometry);
	}

	setGeometry(geometry: BloomGeometry): void {
		if (geometry === this.geometry) return;
		this.geometry = geometry;
		this.petals = this.createPetals(geometry);
	}

	private createPetals(geometry: BloomGeometry): DynamicPetal[] {
		return geometry.petals.map((petal) => {
			const length = petal.centerline.length;
			return {
				geometry: petal,
				centerX: new Float32Array(length),
				centerY: new Float32Array(length),
				normalX: new Float32Array(length),
				normalY: new Float32Array(length),
				halfWidth: new Float32Array(length),
				leftX: new Float32Array(length),
				leftY: new Float32Array(length),
				rightX: new Float32Array(length),
				rightY: new Float32Array(length),
				field: new Float32Array(length),
				distance: new Float32Array(length)
			};
		});
	}

	private deform(frame: BloomFrame, metrics: SceneMetrics): void {
		const config = frame.config;
		const ruptureThreshold = config.ruptureThreshold;
		const pointer = pointerToLocal(frame.pointer, metrics);
		const drift = frame.config.motionEnabled ? frame.time * config.noiseDrift : 0;
		const globalRotation = frame.config.motionEnabled ? frame.time * config.rotation : 0;
		this.ruptures.length = 0;

		for (const dynamic of this.petals) {
			const petal = dynamic.geometry;
			const length = petal.centerline.length;
			const outer = config.whorls <= 1 ? 1 : petal.whorlIndex / (config.whorls - 1);
			const susceptibility = 0.34 + outer * 0.66;
			const offset = petal.index * 0.173 + petal.whorlIndex * 1.137;
			const breathField =
				frame.noise(Math.cos(petal.angle) * 0.7 + 67.2, Math.sin(petal.angle) * 0.7 - 31.4, 4.8) *
					2 -
				1;
			const breathPhase =
				frame.time * 0.72 - petal.whorlIndex * 0.16 + petal.index * 0.013 + breathField * 0.48;
			for (let index = 0; index < length; index += 1) {
				const u = length <= 1 ? 0 : index / (length - 1);
				const tip = smoothstep(0.04, 1, u);
				const base = petal.centerline[index];
				const normal = petal.normals[index];
				const sx = base.x * config.noiseScale;
				const sy = base.y * config.noiseScale;
				const qx = frame.noise(sx + 13.71 + offset, sy + 2.19, drift + 5.3);
				const qy = frame.noise(sx - 7.33, sy + 17.89 + offset, drift + 11.7);
				const warpedX = sx + config.domainWarp * (qx * 2 - 1);
				const warpedY = sy + config.domainWarp * (qy * 2 - 1);
				const field = frame.noise(warpedX + 31.1, warpedY - 23.7, drift + offset * 0.09);
				const fold = frame.noise(warpedX - 5.8, warpedY + 41.2, drift + 29.4) * 2 - 1;
				dynamic.field[index] = field;

				const breath = frame.config.motionEnabled
					? 1 + Math.sin(breathPhase) * config.breath * (0.018 + outer * 0.025)
					: 1;
				const reachField =
					frame.noise(sx * 0.46 + 83.1, sy * 0.46 - 52.7, drift * 0.35 + offset * 0.04) * 2 - 1;
				const noisyReach = 1 + reachField * config.noiseStrength * susceptibility * tip * 0.055;
				let x = base.x * breath * noisyReach;
				let y = base.y * breath * noisyReach;
				const localAngle =
					globalRotation +
					fold * config.noiseStrength * config.domainWarp * tip * tip * 0.22 +
					(qx - qy) * config.domainWarp * tip * 0.035;
				const cosine = Math.cos(localAngle);
				const sine = Math.sin(localAngle);
				const rotatedX = x * cosine - y * sine;
				const rotatedY = x * sine + y * cosine;
				x = rotatedX + normal.x * fold * config.noiseStrength * susceptibility * tip * 0.12;
				y = rotatedY + normal.y * fold * config.noiseStrength * susceptibility * tip * 0.12;

				if (frame.pointer.active && config.pointerInfluence > 0) {
					const dx = x - pointer.x;
					const dy = y - pointer.y;
					const distance = Math.max(0.018, Math.hypot(dx, dy));
					const falloff = Math.exp(-distance * distance * 5.8) * tip * tip;
					const force = config.pointerInfluence * susceptibility * falloff * 0.052;
					x += (dx / distance) * force;
					y += (dy / distance) * force;
				}

				for (const pulse of frame.pulses) {
					const age = frame.time - pulse.startedAt;
					if (age < 0 || age > 1.5) continue;
					const px = (pulse.x * metrics.width - metrics.centerX) / metrics.scale;
					const py = (pulse.y * metrics.height - metrics.centerY) / metrics.scale;
					const dx = x - px;
					const dy = y - py;
					const distance = Math.max(0.02, Math.hypot(dx, dy));
					const wave = Math.exp(-Math.abs(distance - age * 0.31) * 18) * (1 - age / 1.5);
					const force = wave * pulse.strength * susceptibility * tip * 0.038;
					x += (dx / distance) * force;
					y += (dy / distance) * force;
				}

				let distance = Math.max(Math.abs(x), Math.abs(y)) - config.boxSize;
				let boundaryCompression = 0;
				if (config.boundaryPhysics) {
					const nearWall = 1 - smoothstep(0.015, 0.15, Math.abs(distance));
					const outside = smoothstep(
						ruptureThreshold,
						ruptureThreshold + 0.12 + config.breakout * 0.04,
						distance
					);
					const pressureBreath = frame.config.motionEnabled
						? 1 + Math.sin(breathPhase + 0.42) * config.breath * 0.24
						: 1;
					const held =
						nearWall *
						(1 - outside) *
						config.constraint *
						(1 - config.breakout * 0.38) *
						pressureBreath;
					boundaryCompression = clamp(held, 0, 0.82);
					const wallIsX = Math.abs(x) >= Math.abs(y);
					const wallSign = Math.sign(wallIsX ? x : y) || 1;
					const press = held * (0.017 + 0.036 * tip * susceptibility);
					if (wallIsX) {
						x -= wallSign * press;
						y += fold * held * 0.018;
					} else {
						y -= wallSign * press;
						x -= fold * held * 0.018;
					}
					const release =
						smoothstep(ruptureThreshold, ruptureThreshold + 0.15, distance) * config.breakout * tip;
					if (release > 0) {
						const releaseAngle = fold * release * (0.035 + Math.abs(config.curl) * 0.08);
						const releaseCosine = Math.cos(releaseAngle);
						const releaseSine = Math.sin(releaseAngle);
						const releasedX = x * releaseCosine - y * releaseSine;
						y = x * releaseSine + y * releaseCosine;
						x = releasedX;
					}
					distance = Math.max(Math.abs(x), Math.abs(y)) - config.boxSize;
				}

				dynamic.centerX[index] = x;
				dynamic.centerY[index] = y;
				dynamic.distance[index] = distance;
				const widthNoise = 0.84 + field * 0.29;
				dynamic.halfWidth[index] =
					petal.halfWidths[index] * widthNoise * (1 - boundaryCompression * 0.34);
			}

			for (let index = 0; index < length; index += 1) {
				const before = Math.max(0, index - 1);
				const after = Math.min(length - 1, index + 1);
				const tx = dynamic.centerX[after] - dynamic.centerX[before];
				const ty = dynamic.centerY[after] - dynamic.centerY[before];
				const tangentLength = Math.max(1e-8, Math.hypot(tx, ty));
				const nx = -ty / tangentLength;
				const ny = tx / tangentLength;
				dynamic.normalX[index] = nx;
				dynamic.normalY[index] = ny;
				const width = dynamic.halfWidth[index];
				dynamic.leftX[index] = dynamic.centerX[index] + nx * width;
				dynamic.leftY[index] = dynamic.centerY[index] + ny * width;
				dynamic.rightX[index] = dynamic.centerX[index] - nx * width;
				dynamic.rightY[index] = dynamic.centerY[index] - ny * width;
			}

			for (let index = 1; index < length; index += 1) {
				const previous = dynamic.distance[index - 1];
				const current = dynamic.distance[index];
				const previousRupture = previous - ruptureThreshold;
				const currentRupture = current - ruptureThreshold;
				if (
					(previousRupture <= 0 && currentRupture > 0) ||
					(previousRupture > 0 && currentRupture <= 0)
				) {
					const amount =
						Math.abs(previousRupture) /
						Math.max(1e-8, Math.abs(previousRupture) + Math.abs(currentRupture));
					this.ruptures.push({
						x: mix(dynamic.centerX[index - 1], dynamic.centerX[index], amount),
						y: mix(dynamic.centerY[index - 1], dynamic.centerY[index], amount),
						intensity: clamp(0.42 + config.breakout * 0.4 + dynamic.field[index] * 0.18),
						petalIndex: petal.index
					});
				}
			}
		}
	}

	render(
		target: CanvasRenderingContext2D,
		layers: BloomLayerSet,
		frame: BloomFrame
	): BloomRenderStats {
		if (frame.geometry !== this.geometry) this.setGeometry(frame.geometry);
		const metrics = sceneMetrics(frame.width, frame.height, frame.config);
		this.deform(frame, metrics);
		if (frame.redrawBackground) drawBackground(frame, layers.background);

		const instrument = resetSurface(layers.instrument);
		const body = resetSurface(layers.body);
		const light = resetSurface(layers.light);
		const particles = resetSurface(layers.particles);
		drawInstrument(instrument, frame, metrics, this.ruptures);
		drawPetalBodies(body, frame, metrics, this.petals);
		drawPetalLight(light, frame, metrics, this.petals);
		drawCore(body, light, frame, metrics);
		drawAnatomyStructure(instrument, frame, metrics, this.petals);
		drawParticles(particles, frame, metrics, this.ruptures);
		prepareGlow(frame, layers);
		compositeFrame(target, frame, layers);

		let deformedPointCount = 0;
		for (const petal of this.petals) deformedPointCount += petal.centerX.length;
		return { ruptureCount: this.ruptures.length, deformedPointCount };
	}
}
