import { hashKey, randomStream as seededValue } from './brush-random';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export const SCENE_FAMILIES = {
	street: 'Calcutta street',
	landing: 'Hooghly-side landing',
	courtyard: 'Courtyard and veranda',
	pond: 'Pond, path, and fields'
} as const;

export type SceneFamily = keyof typeof SCENE_FAMILIES;
export type Point = readonly [number, number];
export type Colour = readonly [number, number, number];
export type Material =
	| 'sky'
	| 'water'
	| 'earth'
	| 'plant'
	| 'plaster'
	| 'wood'
	| 'metal'
	| 'cloth'
	| 'skin'
	| 'glass'
	| 'stone';

export interface SceneShape {
	id: string;
	objectId: string;
	points: readonly Point[];
	color: Colour;
	material: Material;
	angle: number;
	detail: number;
	depth: number;
	light: number;
	opacity: number;
}

export interface Scene {
	family: SceneFamily;
	seed: string;
	width: typeof WORLD_WIDTH;
	height: typeof WORLD_HEIGHT;
	horizon: number;
	vanishing: Point;
	focal: { x: number; y: number; radius: number };
	light: { x: number; y: number; weather: string };
	shapes: SceneShape[];
	figures: FigurePlacement[];
	description: string;
}

export type Pose = 'walk' | 'stand' | 'sit' | 'cycle' | 'carry' | 'lean';
export interface FigurePlacement {
	id: string;
	x: number;
	y: number;
	height: number;
	pose: Pose;
	surface: string;
	activity: string;
}

export interface Random {
	value: () => number;
	between: (minimum: number, maximum: number) => number;
	choose: <T>(values: readonly T[]) => T;
}

export function randomStream(key: string): Random {
	const value = seededValue(hashKey(key));
	return {
		value,
		between: (minimum, maximum) => minimum + (maximum - minimum) * value(),
		choose: (values) => values[Math.floor(value() * values.length)]
	};
}

export function rgb(hex: string): Colour {
	const value = Number.parseInt(hex, 16);
	return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

export function mix(a: Colour, b: Colour, amount: number): Colour {
	return [
		a[0] + (b[0] - a[0]) * amount,
		a[1] + (b[1] - a[1]) * amount,
		a[2] + (b[2] - a[2]) * amount
	];
}

export type Attributes = Partial<Omit<SceneShape, 'id' | 'objectId' | 'points' | 'color'>>;

export class Composition {
	readonly shapes: SceneShape[] = [];
	readonly figures: FigurePlacement[] = [];
	readonly colours: Random;
	private readonly counts = new Map<string, number>();

	constructor(seed: string) {
		this.colours = randomStream(`${seed}/surface-colour`);
	}

	poly(objectId: string, points: readonly Point[], color: Colour, attributes: Attributes = {}) {
		const count = this.counts.get(objectId) ?? 0;
		this.counts.set(objectId, count + 1);
		this.shapes.push({
			id: `${objectId}/${count}`,
			objectId,
			points,
			color,
			material: 'stone',
			angle: 0,
			detail: 0.45,
			depth: 0.55,
			light: 0,
			opacity: 1,
			...attributes
		});
	}

	rect(id: string, x: number, y: number, w: number, h: number, color: Colour, a?: Attributes) {
		this.poly(
			id,
			[
				[x, y],
				[x + w, y],
				[x + w, y + h],
				[x, y + h]
			],
			color,
			a
		);
	}

	ellipse(
		id: string,
		x: number,
		y: number,
		rx: number,
		ry: number,
		color: Colour,
		a?: Attributes,
		rotation = 0
	) {
		const points: Point[] = [];
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		const segments = Math.ceil(Math.min(22, 10 + Math.max(rx, ry) / 10));
		for (let i = 0; i < segments; i += 1) {
			const angle = (i / segments) * Math.PI * 2;
			const localX = Math.cos(angle) * rx;
			const localY = Math.sin(angle) * ry;
			points.push([x + cos * localX - sin * localY, y + sin * localX + cos * localY]);
		}
		this.poly(id, points, color, a);
	}

	line(id: string, start: Point, end: Point, width: number, color: Colour, a?: Attributes) {
		const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
		const x = (Math.sin(angle) * width) / 2;
		const y = (Math.cos(angle) * width) / 2;
		this.poly(
			id,
			[
				[start[0] + x, start[1] - y],
				[end[0] + x, end[1] - y],
				[end[0] - x, end[1] + y],
				[start[0] - x, start[1] + y]
			],
			color,
			{ angle, ...a }
		);
	}

	gradient(
		id: string,
		x: number,
		y: number,
		w: number,
		h: number,
		top: Colour,
		bottom: Colour,
		a: Attributes
	) {
		const count = 22;
		for (let i = 0; i < count; i += 1) {
			const start = y + (i / count) * h;
			this.rect(id, x, start, w, h / count + 1, mix(top, bottom, i / (count - 1)), a);
		}
	}
}

export function sky(c: Composition, horizon: number, overcast: boolean, rng: Random) {
	const skyAttrs = { material: 'sky', detail: 0.04, depth: 0, light: 0.7 } as const;
	c.gradient(
		'sky',
		0,
		0,
		WORLD_WIDTH,
		horizon + 55,
		rgb(overcast ? '9da9b3' : '83a7b5'),
		rgb(overcast ? 'dbd9c9' : 'ebdbb6'),
		skyAttrs
	);
	for (let i = 0; i < 11; i += 1) {
		const x = rng.between(-40, WORLD_WIDTH);
		const y = rng.between(38, horizon - 16);
		const w = rng.between(54, 206);
		const h = rng.between(3, 16);
		c.poly(
			'sky',
			[
				[x - w, y + h * 0.4],
				[x - w * 0.56, y - h * 0.4],
				[x - w * 0.09, y - h],
				[x + w * 0.49, y - h * 0.55],
				[x + w, y + h * 0.05],
				[x + w * 0.46, y + h * 0.63],
				[x - w * 0.12, y + h]
			],
			rgb(overcast ? 'd9d4ca' : 'efe5ce'),
			{ ...skyAttrs, opacity: rng.between(0.2, 0.42), angle: -0.016 }
		);
	}
}

const treeColours = ['485947', '56664c', '63734d', '728055', '87925a', '9e9f61', 'b5ac6d'].map(rgb);

export function tree(
	c: Composition,
	id: string,
	x: number,
	y: number,
	height: number,
	width: number,
	depth: number,
	rng: Random
) {
	const canopy = { material: 'plant', detail: 0.68, depth, angle: -0.78 } as const;
	const wood = { material: 'wood', detail: 0.55, depth, angle: Math.PI / 2, light: -0.55 } as const;
	const bend = rng.between(-0.15, 0.16) * width;
	const trunk = Math.max(1.8, height * rng.between(0.033, 0.057));
	const root: Point = [x, y];
	const fork: Point = [x + bend, y - height * 0.49];
	c.poly(
		id,
		[
			[x - trunk, y],
			[x - trunk * 0.47 + bend, fork[1]],
			[x + bend * 1.5, y - height * 0.81],
			[x + trunk * 0.29 + bend * 1.5, y - height * 0.79],
			[x + trunk * 0.56 + bend, fork[1]],
			[x + trunk * 0.78, y]
		],
		rgb('655b4b'),
		wood
	);
	c.line(
		id,
		[root[0] - trunk * 0.41, root[1]],
		[fork[0] - trunk * 0.26, fork[1]],
		trunk * 0.27,
		rgb('93826a'),
		{ ...wood, light: 0.36 }
	);
	const clusters: { x: number; y: number; w: number; h: number }[] = [];
	for (let i = 0; i < 7; i += 1) {
		const t = (i - 3) / 3;
		const branch: Point = [
			x + width * (t * 0.36 + rng.between(-0.09, 0.09)) + bend,
			y - height * (0.91 - Math.abs(t) * 0.24 + rng.between(-0.1, 0.11))
		];
		c.line(
			id,
			[x + bend * 0.8, fork[1] + height * rng.between(-0.13, 0.13)],
			branch,
			trunk * rng.between(0.16, 0.47),
			rgb('6e634c'),
			wood
		);
		clusters.push({
			x: branch[0],
			y: branch[1],
			w: width * rng.between(0.14, 0.28),
			h: height * rng.between(0.09, 0.19)
		});
	}
	for (const [index, cluster] of clusters.entries()) {
		c.ellipse(
			id,
			cluster.x,
			cluster.y,
			cluster.w,
			cluster.h,
			treeColours[index % 3],
			canopy,
			rng.between(-0.7, 0.5)
		);
	}
	for (const cluster of clusters) {
		for (let i = 0; i < 11; i += 1) {
			const dx = rng.between(-0.76, 0.78);
			const dy = rng.between(-0.73, 0.65) * (1 - Math.abs(dx) * 0.27);
			const lit = dx < -0.02 && dy < 0.1;
			c.ellipse(
				id,
				cluster.x + dx * cluster.w,
				cluster.y + dy * cluster.h,
				cluster.w * rng.between(0.16, 0.53),
				cluster.h * rng.between(0.17, 0.46),
				rng.choose(lit ? treeColours.slice(3) : treeColours.slice(1, 5)),
				{ ...canopy, light: lit ? 0.58 : -0.34, angle: rng.between(-1.22, -0.48) },
				rng.between(-0.8, 0.5)
			);
		}
	}
}

export function plant(
	c: Composition,
	id: string,
	x: number,
	y: number,
	size: number,
	depth: number,
	rng: Random
) {
	const terracotta = { material: 'earth', depth, detail: 0.8 } as const;
	c.poly(
		id,
		[
			[x - size * 0.24, y - size * 0.3],
			[x + size * 0.24, y - size * 0.3],
			[x + size * 0.14, y],
			[x - size * 0.15, y]
		],
		rgb('a8674d'),
		terracotta
	);
	c.ellipse(id, x, y - size * 0.28, size * 0.25, size * 0.059, rgb('63483e'), terracotta);
	c.line(
		id,
		[x - size * 0.19, y - size * 0.245],
		[x - size * 0.12, y - size * 0.028],
		size * 0.056,
		rgb('cb8d67'),
		{ ...terracotta, light: 0.5 }
	);
	for (let i = 0; i < 10; i += 1) {
		const dx = rng.between(-0.52, 0.52) * size;
		const dy = -rng.between(0.47, 1.07) * size;
		const angle = Math.atan2(dy, dx);
		c.line(id, [x, y - size * 0.28], [x + dx, y + dy], size * 0.018, rgb('777f54'), {
			material: 'plant',
			depth
		});
		c.ellipse(
			id,
			x + dx,
			y + dy,
			size * rng.between(0.13, 0.27),
			size * rng.between(0.045, 0.095),
			rng.choose(treeColours),
			{ material: 'plant', depth, angle, detail: 0.88 },
			angle
		);
	}
}
