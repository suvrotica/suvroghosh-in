import { fieldEdge, fieldPixel, rasterizeScene, type PaintFields } from './brush-fields';
import { clamp, hashKey, randomStream } from './brush-random';
import {
	applyLinen,
	getPaintContext,
	makeStrokeMaterial,
	pigmentColor,
	type PaintCanvas,
	type PaintContext,
	type Pigment,
	type StrokeMaterial
} from './material';
import type { Scene, SceneShape } from './scene-geometry';

export interface PaintSettings {
	brushSize: number;
	density: number;
	warmth: number;
	softness: number;
	texture: number;
}

export interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface StrokeCandidate {
	id: string;
	x: number;
	y: number;
	angle: number;
	length: number;
	width: number;
	bend: number;
	focus: number;
	edge: number;
	pixel: number;
	threshold: number;
	materialKey: number;
	pigmentKey: number;
	order: number;
	tier: number;
	guide: boolean;
}

interface FormGuide {
	length: number;
	width: number;
	angle: number;
}

export interface Brushwork {
	scene: Scene;
	fields: PaintFields;
	candidates: StrokeCandidate[];
}

export interface PaintStroke {
	id: string;
	x: number;
	y: number;
	angle: number;
	length: number;
	width: number;
	bend: number;
	color: string;
	material: StrokeMaterial;
}

export interface Painting {
	strokes: PaintStroke[];
	texture: number;
}

interface StrokeProfile {
	elongation: number;
	angleVariation: number;
	curve: number;
	colorVariation: number;
}

const PROFILES: Record<SceneShape['material'], StrokeProfile> = {
	sky: { elongation: 1.66, angleVariation: 0.29, curve: 0.48, colorVariation: 0.6 },
	water: { elongation: 2.32, angleVariation: 0.07, curve: 0.31, colorVariation: 0.88 },
	earth: { elongation: 1.19, angleVariation: 0.39, curve: 0.51, colorVariation: 1 },
	plant: { elongation: 0.86, angleVariation: 0.83, curve: 0.85, colorVariation: 1.2 },
	plaster: { elongation: 1.24, angleVariation: 0.13, curve: 0.32, colorVariation: 0.79 },
	wood: { elongation: 1.57, angleVariation: 0.21, curve: 0.42, colorVariation: 0.88 },
	metal: { elongation: 1.44, angleVariation: 0.12, curve: 0.28, colorVariation: 0.75 },
	cloth: { elongation: 1.22, angleVariation: 0.38, curve: 0.85, colorVariation: 0.94 },
	skin: { elongation: 0.94, angleVariation: 0.29, curve: 0.69, colorVariation: 0.71 },
	glass: { elongation: 1.35, angleVariation: 0.14, curve: 0.28, colorVariation: 0.71 },
	stone: { elongation: 1.42, angleVariation: 0.18, curve: 0.41, colorVariation: 0.88 }
};

const WARM_RESPONSE: Record<SceneShape['material'], number> = {
	sky: 0.8,
	water: 0.71,
	earth: 0.96,
	plant: 0.74,
	plaster: 1.09,
	wood: 0.91,
	metal: 0.82,
	cloth: 0.81,
	skin: 0.65,
	glass: 0.79,
	stone: 1
};

function mixAngles(angle: number, other: number, weight: number): number {
	const difference = other - angle;
	return angle + 0.5 * Math.atan2(Math.sin(difference * 2), Math.cos(difference * 2)) * weight;
}

export function prepareBrushwork(scene: Scene): Brushwork {
	const fields = rasterizeScene(scene);
	const candidates: StrokeCandidate[] = [];
	const seed = `${scene.family}/${scene.seed}`;
	const position = hashKey(`${seed}/stroke placement`);
	const pigment = hashKey(`${seed}/pigment and material`);
	const order = hashKey(`${seed}/painting order`);

	function add(x: number, y: number, tier: number, id: string, guide?: FormGuide) {
		const key = hashKey(id);
		const random = randomStream(position ^ key);
		const pigmentKey = pigment ^ key;
		const pixel = fieldPixel(fields, x, y);
		const surface = scene.shapes[fields.surfaces[pixel]];
		const focus = clamp(
			1 - Math.hypot(x - scene.focal.x, (y - scene.focal.y) * 1.08) / (scene.focal.radius * 1.95)
		);
		const detail = surface?.detail ?? 0.2;
		const edge = fieldEdge(fields, x, y, tier === 2 ? 4.5 : 8);
		const near = surface?.depth ?? 0;
		const profile = PROFILES[surface?.material ?? 'earth'];
		const figure = surface?.material === 'cloth' || surface?.material === 'skin';
		const threshold = random();
		const guideStrength =
			surface?.material === 'water'
				? 0
				: edge.strength * (tier === 0 ? 0.74 : figure ? 0.47 : 0.68);
		const angle =
			(guide?.angle ?? mixAngles(surface?.angle ?? 0, edge.tangent, guideStrength)) +
			(random() - 0.5) * profile.angleVariation * (guide ? 0.43 : tier === 0 ? 1.58 : 1);
		const strokeWidth = guide
			? guide.width
			: tier === 0
				? 48 + random() * 23
				: tier === 1
					? 10 + random() * 8 + (1 - detail) * 2.6
					: 2.1 + random() * 4.1;
		const length = guide?.length ?? strokeWidth * profile.elongation * (0.91 + random() * 0.92);
		const bend = (random() - 0.5) * profile.curve;

		// A few describing marks survive at the sparsest setting. Everywhere else
		// density admits candidates in a fixed hierarchy without moving them.
		const retention = guide
			? threshold * (figure ? 0.26 : 0.63) - detail * 0.19 - focus * 0.11
			: tier === 0
				? 0
				: tier === 1
					? threshold * 1.32 - 0.18 - focus * 0.2 - detail * 0.16 - near * 0.1
					: threshold * 1.35 +
						0.19 -
						detail * 0.26 -
						focus * 0.23 -
						edge.strength * 0.22 -
						Number(figure) * 0.24;

		const stagger = randomStream(order ^ key)();
		const locality = ((y / scene.height) * 0.65 + (x / scene.width) * 0.35) * 0.84;
		candidates.push({
			id,
			x,
			y,
			angle,
			length,
			width: strokeWidth,
			bend,
			focus,
			edge: edge.strength,
			pixel,
			threshold: retention,
			materialKey: (pigmentKey + 0x9e3779b9) >>> 0,
			pigmentKey,
			order: tier * 0.84 + locality + stagger * 0.11 + (guide ? 0.12 : 0),
			tier,
			guide: Boolean(guide)
		});
	}

	for (const [tier, spacing] of [25, 13, 11].entries()) {
		const random = randomStream(position ^ hashKey(`pass/${tier}`));
		for (let row = 0; row * spacing < scene.height; row += 1) {
			for (let column = 0; column * spacing < scene.width; column += 1) {
				const x = Math.min(scene.width - 0.01, (column + 0.5 + (random() - 0.5) * 0.83) * spacing);
				const y = Math.min(scene.height - 0.01, (row + 0.5 + (random() - 0.5) * 0.83) * spacing);
				if (tier === 2) {
					const sample = scene.shapes[fields.surfaces[fieldPixel(fields, x, y)]];
					const distance = Math.hypot(x - scene.focal.x, y - scene.focal.y);
					const edge = fieldEdge(fields, x, y, 4);
					if (
						distance > scene.focal.radius * 1.53 &&
						(sample?.detail ?? 0) < 0.57 &&
						edge.strength < 0.32
					)
						continue;
					if (distance > scene.focal.radius * 0.94 && edge.strength < 0.18 && random() < 0.48)
						continue;
				}
				add(x, y, tier, `${tier}/${row}/${column}`);
			}
		}
	}

	// A narrow visible form may sit between grid points. Guide a few marks down
	// its long axis so a trouser leg or the edge of a shutter keeps its direction.
	scene.shapes.forEach((shape, index) => {
		if (shape.detail < 0.57 || shape.points.length < 3 || shape.opacity < 0.55) return;
		if (shape.material === 'plant' || shape.material === 'sky') return;
		const pointCount = shape.points.length;
		let centerX = 0;
		let centerY = 0;
		for (const [x, y] of shape.points) {
			centerX += x / pointCount;
			centerY += y / pointCount;
		}
		let xx = 0;
		let xy = 0;
		let yy = 0;
		for (const [x, y] of shape.points) {
			xx += (x - centerX) ** 2;
			xy += (x - centerX) * (y - centerY);
			yy += (y - centerY) ** 2;
		}
		const angle = Math.atan2(2 * xy, xx - yy) / 2;
		const tx = Math.cos(angle);
		const ty = Math.sin(angle);
		const projections = shape.points.map(([x, y]) => (x - centerX) * tx + (y - centerY) * ty);
		const across = shape.points.map(([x, y]) => -(x - centerX) * ty + (y - centerY) * tx);
		const start = Math.min(...projections);
		const span = Math.max(...projections) - start;
		const breadth = Math.max(...across) - Math.min(...across);
		if (span < 2.6 || breadth < 0.7 || breadth > 58) return;

		const count = clamp(Math.ceil(span / (shape.depth > 0.63 ? 16 : 21)), 1, 14);
		const channels = breadth > 17 ? [-0.24, 0.22] : [0];
		for (let i = 0; i < count; i += 1) {
			const length = span / count;
			const along = start + (i + 0.5) * length;
			for (const [band, offset] of channels.entries()) {
				for (const shift of [offset, offset - 0.18, offset + 0.18]) {
					const x = centerX + along * tx - breadth * shift * ty;
					const y = centerY + along * ty + breadth * shift * tx;
					if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) continue;
					if (fields.surfaces[fieldPixel(fields, x, y)] !== index) continue;
					add(x, y, 2, `form/${shape.id}/${i}/${band}`, {
						angle,
						length: Math.max(2.7, length * 1.3),
						width: clamp(breadth * (channels.length === 1 ? 0.91 : 0.48), 0.9, 14)
					});
					break;
				}
			}
		}
	});
	candidates.sort((a, b) => a.order - b.order);
	return { scene, fields, candidates };
}

function samplePigment(
	work: Brushwork,
	candidate: StrokeCandidate,
	length: number,
	width: number,
	softness: number
): Pigment {
	const { fields } = work;
	const centerOffset = candidate.pixel * 3;
	const centerGroup = fields.groups[fields.surfaces[candidate.pixel]];
	const centerRed = fields.colors[centerOffset];
	const centerGreen = fields.colors[centerOffset + 1];
	const centerBlue = fields.colors[centerOffset + 2];
	const coarse = candidate.tier === 0;
	let weightSum = coarse ? 1.65 : candidate.guide ? 3.2 : 2.25;
	let red = centerRed * weightSum;
	let green = centerGreen * weightSum;
	let blue = centerBlue * weightSum;
	const tangentX = Math.cos(candidate.angle);
	const tangentY = Math.sin(candidate.angle);
	const radius = length * (coarse ? 0.23 : 0.25);
	const cross = width * (coarse ? 0.33 : 0.32);
	for (const [along, across] of [
		[1, 0],
		[-1, 0],
		[0.35, 1],
		[-0.35, -1],
		[-0.35, 1],
		[0.35, -1]
	]) {
		const pixel = fieldPixel(
			fields,
			candidate.x + tangentX * radius * along - tangentY * cross * across,
			candidate.y + tangentY * radius * along + tangentX * cross * across
		);
		const offset = pixel * 3;
		const colorChange = Math.hypot(
			fields.colors[offset] - centerRed,
			fields.colors[offset + 1] - centerGreen,
			fields.colors[offset + 2] - centerBlue
		);
		const boundary = centerGroup !== fields.groups[fields.surfaces[pixel]] || colorChange > 33;
		const weight =
			(1 - clamp((colorChange - 12) / 128) * (coarse ? 0.33 : 0.58)) *
			(boundary ? (coarse ? 0.55 + softness * 0.3 : 0.12 + softness * 0.64) : 1);
		red += fields.colors[offset] * weight;
		green += fields.colors[offset + 1] * weight;
		blue += fields.colors[offset + 2] * weight;
		weightSum += weight;
	}

	return [red / weightSum, green / weightSum, blue / weightSum];
}

export function buildPainting(work: Brushwork, settings: PaintSettings, preview = false): Painting {
	const size = clamp(settings.brushSize / 100);
	const density = clamp(settings.density / 100);
	const warmth = clamp(settings.warmth / 100) * 2 - 1;
	const softness = clamp(settings.softness / 100);
	const texture = clamp(settings.texture / 100);
	const strokes: PaintStroke[] = [];

	for (const candidate of work.candidates) {
		if (candidate.threshold > density) continue;
		if (preview && candidate.tier === 2 && !candidate.guide && candidate.materialKey % 3 === 0)
			continue;
		const surface = work.scene.shapes[work.fields.surfaces[candidate.pixel]];
		const material = surface?.material ?? 'earth';
		const light = (1 + (surface?.light ?? 0)) / 2;
		const sizeFactor = candidate.guide
			? 0.77 + size * 0.51 + 0.27 * Math.max(0, size - 0.45)
			: candidate.tier === 0
				? 0.86 + size * 0.41
				: 0.71 + size * 0.84 + 0.55 * Math.max(0, size - 0.45);
		const edgeFactor = 1 + candidate.edge * (softness * 0.67 - 0.37);
		const length =
			candidate.length * sizeFactor * (candidate.tier === 0 ? 1 - candidate.edge * 0.17 : 1);
		const width =
			candidate.width *
			sizeFactor *
			(candidate.tier === 0 ? 1 - candidate.edge * 0.35 : edgeFactor);
		const bend = candidate.bend * width;
		const sampled = samplePigment(work, candidate, length, width, softness);
		const random = randomStream(candidate.pigmentKey);
		const variation = PROFILES[material].colorVariation * (candidate.tier === 0 ? 8.5 : 16);
		const coherentColor =
			Math.sin(candidate.x * 0.059 + candidate.y * 0.031) *
			Math.sin(candidate.y * 0.077 - candidate.x * 0.034);
		const tone = ((random() - 0.49) * 0.93 + coherentColor * 0.49) * variation;
		const hue = (random() - 0.5) * variation;
		const warm = warmth * WARM_RESPONSE[material] * (0.39 + light * 0.61);
		const saturation = material === 'cloth' || material === 'plant' ? 1.05 : 1.014;
		const neutral = sampled[0] * 0.24 + sampled[1] * 0.67 + sampled[2] * 0.09;
		const color: Pigment = [
			neutral + (sampled[0] - neutral) * saturation + tone + hue * 0.69 + warm * 19,
			neutral + (sampled[1] - neutral) * saturation + tone + hue * 0.11 + warm * 3,
			neutral + (sampled[2] - neutral) * saturation + tone - hue * 0.69 - warm * 22
		];
		const opacity = candidate.guide
			? 0.77 + random() * 0.18
			: candidate.tier === 0
				? 0.88 + random() * 0.11
				: clamp(
						0.55 +
							random() * 0.32 +
							candidate.focus * 0.08 +
							candidate.edge * (0.12 - softness * 0.19)
					);
		strokes.push({
			id: candidate.id,
			x: candidate.x,
			y: candidate.y,
			angle: candidate.angle,
			length,
			width,
			bend,
			color: pigmentColor(color, opacity),
			material: makeStrokeMaterial(
				candidate.materialKey,
				length,
				width,
				bend,
				texture,
				color,
				light,
				preview ? 0 : candidate.tier === 0 ? 0.32 : 0.58 + candidate.focus * 0.38
			)
		});
	}

	return { strokes, texture };
}

export function framePainting(scene: Scene, aspect: number): Frame {
	const ratio = Math.max(0.05, aspect);
	const worldRatio = scene.width / scene.height;
	const width = ratio < worldRatio ? scene.height * ratio : scene.width;
	const height = ratio > worldRatio ? scene.width / ratio : scene.height;
	return {
		x: clamp(scene.focal.x - width * 0.5, 0, scene.width - width),
		y: clamp(scene.focal.y - height * 0.58, 0, scene.height - height),
		width,
		height
	};
}

export function transformToFrame(context: PaintContext, frame: Frame): void {
	const width = context.canvas.width;
	const height = context.canvas.height;
	const scale = Math.max(width / frame.width, height / frame.height);
	context.setTransform(
		scale,
		0,
		0,
		scale,
		(width - frame.width * scale) * 0.5 - frame.x * scale,
		(height - frame.height * scale) * 0.5 - frame.y * scale
	);
}

export function prepareCanvas(context: PaintContext, frame: Frame): void {
	context.resetTransform();
	context.fillStyle = '#d3c3a5';
	context.fillRect(0, 0, context.canvas.width, context.canvas.height);
	transformToFrame(context, frame);
}

export function paintStroke(context: PaintContext, stroke: PaintStroke, progress = 1): void {
	if (progress <= 0) return;
	context.save();
	context.translate(stroke.x, stroke.y);
	context.rotate(stroke.angle);
	if (progress < 1) {
		const span = stroke.length * 1.04;
		const halfHeight = stroke.width + Math.abs(stroke.bend);
		context.beginPath();
		context.rect(-span / 2, -halfHeight, span * progress, halfHeight * 2);
		context.clip();
	}
	context.fillStyle = stroke.color;
	context.fill(stroke.material.fill);
	if (stroke.material.bristles && stroke.material.ridge) {
		context.lineCap = 'round';
		context.lineWidth = clamp(stroke.width * 0.064, 0.4, 1.02);
		context.strokeStyle = stroke.material.shadow;
		context.stroke(stroke.material.bristles);
		context.lineWidth = clamp(stroke.width * 0.082, 0.5, 1.35);
		context.strokeStyle = stroke.material.highlight;
		context.stroke(stroke.material.ridge);
	}
	context.restore();
}

export function paintSurface(context: PaintContext, painting: Painting, frame: Frame): void {
	applyLinen(
		context,
		frame.x - 2,
		frame.y - 2,
		frame.width + 4,
		frame.height + 4,
		painting.texture * 0.37
	);
}

export function strokeIntersectsFrame(stroke: PaintStroke, frame: Frame): boolean {
	const radius = Math.hypot(stroke.length, stroke.width) * 0.6 + Math.abs(stroke.bend) + 2;
	return (
		stroke.x + radius >= frame.x &&
		stroke.x - radius <= frame.x + frame.width &&
		stroke.y + radius >= frame.y &&
		stroke.y - radius <= frame.y + frame.height
	);
}

export function renderPainting(canvas: PaintCanvas, painting: Painting, frame: Frame): void {
	const context = getPaintContext(canvas);
	if (!context) return;
	prepareCanvas(context, frame);
	for (const stroke of painting.strokes) {
		if (strokeIntersectsFrame(stroke, frame)) paintStroke(context, stroke);
	}
	paintSurface(context, painting, frame);
}
