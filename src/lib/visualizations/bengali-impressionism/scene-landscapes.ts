import { figure, shadow } from './scene-figures';
import {
	mix,
	rgb,
	sky,
	tree,
	type Colour,
	type Composition,
	type Point,
	type Random
} from './scene-geometry';

const water = { material: 'water', angle: 0, detail: 0.28 } as const;
const earth = { material: 'earth', detail: 0.48, angle: -0.16 } as const;
const stone = { material: 'stone', angle: 0.28, detail: 0.56 } as const;
const plant = { material: 'plant', angle: -0.91, detail: 0.78 } as const;
const wood = { material: 'wood', angle: 0, detail: 0.73 } as const;
const riverPalette = ['657d84', '7b8f92', 'a6aaa2', 'bdbaab', 'c6c1ab', 'd9cdb0'].map(rgb);
const grassPalette = ['586b4d', '6c8054', '8a8f57', 'a3a268', 'b1a974', 'c0ae74'].map(rgb);

function ripple(
	c: Composition,
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	pigment: Colour,
	depth: number,
	opacity: number
) {
	c.poly(
		id,
		[
			[x - width * 0.51, y + height * 0.42],
			[x - width * 0.23, y - height * 0.31],
			[x + width * 0.31, y - height * 0.39],
			[x + width * 0.52, y + height * 0.08],
			[x + width * 0.14, y + height * 0.6]
		],
		pigment,
		{ ...water, depth, opacity, detail: 0.6 }
	);
}

function reeds(
	c: Composition,
	id: string,
	x: number,
	y: number,
	size: number,
	rng: Random,
	depth: number
) {
	for (let i = 0; i < 8; i += 1) {
		const rise = size * rng.between(0.32, 1.09);
		const spread = size * rng.between(-0.46, 0.42);
		const start: Point = [x + rng.between(-0.17, 0.18) * size, y + rng.between(-0.07, 0.07) * size];
		const end: Point = [x + spread, y - rise];
		const pigment = rng.choose(grassPalette);
		c.poly(
			id,
			[
				start,
				[start[0] + size * 0.058, start[1] + 1],
				[(start[0] + end[0]) * 0.5 + size * 0.042, y - rise * 0.59],
				end,
				[(start[0] + end[0]) * 0.5 - size * 0.024, y - rise * 0.51]
			],
			pigment,
			{ ...plant, depth, angle: Math.atan2(end[1] - start[1], end[0] - start[0]), light: 0.46 }
		);
	}
}

function distantBank(c: Composition, horizon: number, rng: Random) {
	const points: Point[] = [[0, horizon + 16]];
	for (let i = 0; i <= 48; i += 1) {
		const crest = horizon - 12 - Math.sin(i * 0.21 + 0.8) * 7 - rng.between(0, 19);
		points.push([i * 25, crest]);
	}
	points.push([1200, horizon + 15]);
	c.poly('far-bank', points, rgb('87948b'), { ...plant, angle: -0.1, depth: 0.05, detail: 0.2 });
	for (let i = 0; i < 54; i += 1) {
		const x = i * 23;
		const y = horizon - rng.between(4, 20);
		c.ellipse(
			'far-bank',
			x,
			y,
			rng.between(4, 31),
			rng.between(3, 9),
			rng.choose([rgb('8f9d91'), rgb('a5a99a'), rgb('798b82')]),
			{ ...plant, depth: 0.04, opacity: 0.8, detail: 0.16 }
		);
	}
	for (let i = 0; i < 12; i += 1) {
		const x = rng.between(4, 1191);
		const h = rng.between(5, 20);
		const w = rng.between(7, 31);
		c.rect(
			'far-bank',
			x,
			horizon - h,
			w,
			h,
			rng.choose([rgb('aaa79c'), rgb('c2b49a'), rgb('bcb9ae')]),
			{ material: 'plaster', detail: 0.24, depth: 0.05, light: 0.25 }
		);
		c.line('far-bank', [x - 1, horizon - h], [x + w + 2, horizon - h + 1], 2, rgb('898d84'), {
			...wood,
			depth: 0.05
		});
	}
}

function boat(
	c: Composition,
	id: string,
	x: number,
	y: number,
	scale: number,
	passenger: boolean,
	rng: Random
) {
	const pt = (dx: number, dy: number): Point => [x + dx * scale, y + dy * scale];
	const attrs = { ...wood, depth: Math.min(0.75, scale * 0.58) };
	const hull = rgb('515d62');
	const woodPaint = rgb('87715a');
	for (let i = 0; i < 24; i += 1) {
		const row = i / 24;
		const dx = rng.between(-89, 82) * (1 - row * 0.47);
		const pigment = mix(row < 0.36 ? hull : woodPaint, riverPalette[2], 0.23 + row * 0.65);
		ripple(
			c,
			`${id}-reflection`,
			x + dx * scale,
			y + (3 + row * 56) * scale,
			rng.between(5, 61) * scale * (1 - row * 0.5),
			rng.between(1, 6) * scale,
			pigment,
			attrs.depth,
			0.59 - row * 0.27
		);
	}
	c.poly(
		id,
		[
			pt(-105, -19),
			pt(-66, -15),
			pt(18, -17),
			pt(86, -24),
			pt(108, -35),
			pt(93, -12),
			pt(69, -4),
			pt(13, 3),
			pt(-47, 0),
			pt(-79, -7)
		],
		hull,
		attrs
	);
	c.poly(
		id,
		[
			pt(-102, -19),
			pt(-59, -23),
			pt(36, -26),
			pt(88, -29),
			pt(105, -35),
			pt(83, -22),
			pt(26, -16),
			pt(-59, -14)
		],
		rgb('a1896b'),
		attrs
	);
	c.poly(
		id,
		[pt(-76, -20), pt(-38, -22), pt(48, -25), pt(78, -27), pt(63, -22), pt(-53, -16)],
		rgb('635b51'),
		attrs
	);
	for (const dx of [-52, -21, 17, 51]) {
		c.line(id, pt(dx, -23), pt(dx + 9, -16), 3 * scale, rgb('ae8f68'), attrs);
	}
	if (passenger) {
		c.line(id, pt(-30, -30.5), pt(18, -30.5), 4.3 * scale, rgb('7c6957'), attrs);
		const [fx, fy] = pt(-12, -13);
		figure(
			c,
			{
				id: `${id}-passenger`,
				x: fx,
				y: fy,
				height: 45 * scale,
				pose: 'sit',
				surface: id,
				activity: 'sitting in the boat'
			},
			{
				shirt: rgb('a9b1a0'),
				trousers: rgb('6f6d72'),
				skin: rgb('9b7258'),
				direction: 1,
				depth: attrs.depth
			}
		);
	}
	c.poly(
		id,
		[
			pt(-92, -15),
			pt(-52, -11),
			pt(16, -12),
			pt(72, -17),
			pt(97, -28),
			pt(87, -14),
			pt(69, -9),
			pt(14, -4),
			pt(-46, -5),
			pt(-76, -9)
		],
		rgb('a2795f'),
		{ ...attrs, light: 0.39 }
	);
	c.line(id, pt(-67, -6), pt(77, -10), 2.9 * scale, rgb('59666c'), attrs);
	c.line(id, pt(52, -22), pt(89, -68), 2.6 * scale, rgb('9a7e5d'), { ...attrs, angle: -1.04 });
	c.line(id, pt(90, -67), pt(99, -79), 4.5 * scale, rgb('b59c76'), attrs);
}

export function landing(c: Composition, composition: Random, placement: Random) {
	const horizon = composition.between(284, 321);
	const overcast = composition.value() > 0.63;
	const weather = overcast ? 'soft overcast light' : 'clear daylight';
	sky(c, horizon, overcast, composition);
	distantBank(c, horizon, placement);
	c.gradient('river', 0, horizon + 6, 1200, 805 - horizon, rgb('adb1a5'), rgb('728790'), water);
	for (let i = 0; i < 175; i += 1) {
		const y = composition.between(horizon + 7, 805);
		const depth = (y - horizon) / (800 - horizon);
		const x = composition.between(-30, 1229);
		const lightLane = Math.abs(x - 783) < 192 + depth * 107;
		ripple(
			c,
			'river',
			x,
			y,
			composition.between(14, 142) * (0.42 + depth * 0.83),
			composition.between(1.3, 5.2) * (0.28 + depth),
			composition.choose(lightLane ? riverPalette.slice(2) : riverPalette.slice(0, 4)),
			depth,
			composition.between(0.3, 0.69)
		);
	}
	const farBoat = placement.value() > 0.44;
	if (farBoat)
		boat(
			c,
			'far-boat',
			placement.between(931, 1090),
			placement.between(366, 393),
			0.42,
			false,
			placement
		);
	const boatX = placement.between(633, 731);
	const boatY = placement.between(518, 563);
	const passenger = placement.value() > 0.58;
	boat(c, 'moored-boat', boatX, boatY, placement.between(0.79, 0.96), passenger, placement);
	const slope = composition.between(0.27, 0.37);
	const bankY = composition.between(434, 464);
	const edge = (x: number, rise: number) => bankY + x * slope + rise;
	const step = (id: string, start: number, end: number, color: Colour, detail = 0.42) =>
		c.poly(
			id,
			[
				[0, edge(0, start)],
				[1200, edge(1200, start)],
				[1200, edge(1200, end)],
				[0, edge(0, end)]
			],
			color,
			{ ...stone, detail, angle: Math.atan(slope), depth: 0.59 + start / 780, light: 0.38 }
		);
	const stairColors = ['b1a28b', 'cbb894', 'bcaa90', 'd0b998', 'bdab94', 'd4bd9e'].map(rgb);
	for (let i = 0; i < stairColors.length; i += 1) {
		const level = i * 37;
		step(`step-${i}`, level, level + 10, rgb('958979'), 0.78);
		step(`step-${i}`, level + 10, level + 14, rgb('ddc9a8'), 0.72);
		step(`step-${i}`, level + 14, level + 37, stairColors[i]);
		for (let j = 0; j < 11; j += 1) {
			const x = composition.between(-17, 1180);
			const y = edge(x, level + composition.between(17, 33));
			const length = composition.between(8, 59);
			c.line(
				`step-${i}`,
				[x, y],
				[x + length, y + length * slope],
				composition.between(0.8, 2.9),
				mix(stairColors[i], composition.choose([rgb('8e8579'), rgb('e6ceb0')]), 0.55),
				{ ...stone, opacity: 0.48 }
			);
		}
	}
	step('upper-landing', 222, 460, rgb('b8aa97'));
	for (const [i, x] of [placement.between(229, 272), placement.between(527, 574)].entries()) {
		const y = edge(x, 17);
		c.line(`mooring-${i}`, [x - 2, y], [x + 4, y - 61], 10, rgb('7b6e5d'), {
			...wood,
			angle: -1.5
		});
		c.line(`mooring-${i}`, [x - 4, y - 7], [x + 1, y - 57], 3, rgb('a99874'), {
			...wood,
			light: 0.54
		});
		if (i === 1) {
			const mid: Point = [(x + boatX) * 0.5 - 15, (y + boatY) * 0.5 - 9];
			c.line('mooring-rope', [x + 2, y - 34], mid, 1.4, rgb('807662'), wood);
			c.line('mooring-rope', mid, [boatX - 78, boatY - 14], 1.2, rgb('807662'), wood);
		}
	}
	for (const [i, x] of [74, 149, 339].entries()) {
		reeds(c, `step-reeds-${i}`, x, edge(x, 2), placement.between(13, 37), placement, 0.53);
	}
	const x = placement.between(503, 580);
	const y = edge(x, 56);
	const tall = placement.between(105, 126);
	shadow(c, 'waiter-shadow', x, y, 112, overcast ? 0.19 : 0.42);
	figure(
		c,
		{
			id: 'waiter',
			x,
			y,
			height: tall,
			pose: 'stand',
			surface: 'step-1',
			activity: 'waiting on a step'
		},
		{
			shirt: rgb('b68956'),
			trousers: rgb('4d606c'),
			skin: rgb('a5765b'),
			direction: 1,
			depth: 0.73
		}
	);
	const seatedX = placement.between(307, 366);
	const seatedY = edge(seatedX, 142);
	const seatY = edge(seatedX, 111);
	const seatDetail = { ...stone, depth: 0.72, detail: 0.77, light: -0.55 };
	c.line(
		'step-3',
		[seatedX - 29, seatY - 10],
		[seatedX + 34, seatY - 10 + slope * 63],
		6,
		rgb('85796d'),
		seatDetail
	);
	c.ellipse(
		'seated-shadow',
		seatedX + 9,
		seatY - 2,
		21,
		3.3,
		rgb('79736a'),
		{ ...seatDetail, opacity: 0.77 },
		Math.atan(slope)
	);
	shadow(c, 'seated-shadow', seatedX + 17, seatedY, 55, 0.32);
	figure(
		c,
		{
			id: 'seated-visitor',
			x: seatedX,
			y: seatedY,
			height: 85,
			pose: 'sit',
			surface: 'step-2',
			activity: 'sitting on a step'
		},
		{
			shirt: rgb('7d9795'),
			trousers: rgb('766365'),
			skin: rgb('a57556'),
			direction: 1,
			depth: 0.68
		}
	);
	return {
		horizon,
		vanishing: [790, horizon] as const,
		focal: { x: (x + boatX) / 2, y: y - tall * 0.52, radius: 144 },
		weather,
		description: `A Hooghly-side landing in ${weather}. One person waits on the sloping steps and another sits. A wooden boat${passenger ? ' with a seated passenger' : ''} is moored beside the steps, ${farBoat ? 'with another boat farther out and a low opposite bank' : 'with a low opposite bank'} across the river.`
	};
}

function fieldHouse(c: Composition, id: string, x: number, y: number, size: number, color: Colour) {
	const pt = (dx: number, dy: number): Point => [x + dx * size, y + dy * size];
	const walls = { material: 'plaster', detail: 0.58, depth: 0.24, angle: Math.PI / 2 } as const;
	c.poly(id, [pt(-51, -43), pt(42, -49), pt(42, -5), pt(-51, 0)], color, walls);
	c.poly(
		id,
		[pt(42, -49), pt(75, -39), pt(75, -8), pt(42, -5)],
		mix(color, rgb('6f6f64'), 0.42),
		walls
	);
	c.poly(
		id,
		[pt(-57, -42), pt(-31, -72), pt(49, -72), pt(82, -39), pt(36, -51)],
		rgb('8e6b54'),
		wood
	);
	c.poly(id, [pt(-56, -43), pt(-31, -71), pt(49, -71), pt(36, -51)], rgb('ad7c5e'), {
		...wood,
		light: 0.43
	});
	c.line(id, pt(-30, -71), pt(49, -71), 3.6 * size, rgb('c19a73'), wood);
	for (const dx of [-39, -28, -18, -6, 6, 19, 31, 44]) {
		c.line(id, pt(dx + 13, -68), pt(dx, -48), size * 1.6, rgb('95735c'), wood);
	}
	c.poly(id, [pt(-9, -33), pt(10, -35), pt(10, -4), pt(-9, -3)], rgb('625b52'), wood);
	c.poly(id, [pt(-41, -32), pt(-24, -33), pt(-24, -16), pt(-41, -16)], rgb('6a7466'), wood);
}

export function pond(c: Composition, composition: Random, placement: Random) {
	const horizon = composition.between(247, 286);
	const overcast = composition.value() < 0.22;
	const weather = overcast ? 'soft overcast light' : 'clear daylight';
	const waterY = horizon + composition.between(103, 124);
	sky(c, horizon, overcast, composition);
	distantBank(c, horizon, placement);
	c.gradient('fields', 0, horizon + 7, 1200, 805 - horizon, rgb('a4a476'), rgb('958d57'), earth);
	for (let i = 0; i < 6; i += 1) {
		const y = horizon + 7 + i * 18;
		const middle = 709 - i * 82 + composition.between(-25, 24);
		c.poly(
			'fields',
			[
				[0, y],
				[middle, y - 4],
				[1200, y + 13],
				[1200, y + 30],
				[middle - 18, y + 15],
				[0, y + 25]
			],
			grassPalette[(i + 2) % grassPalette.length],
			{ ...earth, depth: 0.21, opacity: 0.8 }
		);
		for (let j = 0; j < 18; j += 1) {
			const x = composition.between(0, 1200);
			const top = y + composition.between(1, 14);
			c.line(
				'cultivation-rows',
				[x, top],
				[x + composition.between(13, 74), top + composition.between(0, 4)],
				composition.between(0.7, 2.8),
				rgb(i % 2 ? 'c5b57b' : '737e5a'),
				{ ...earth, opacity: 0.58 }
			);
		}
	}
	const houseX = placement.between(258, 337);
	fieldHouse(c, 'field-house', houseX, horizon + 85, 0.85, rgb('c4b490'));
	fieldHouse(c, 'field-outbuilding', houseX + 134, horizon + 73, 0.51, rgb('b4a485'));
	const farTrees = [
		{ x: placement.between(491, 552), w: 142, h: 154 },
		{ x: placement.between(779, 897), w: 115, h: 133 },
		{ x: placement.between(1006, 1085), w: 116, h: 124 }
	];
	for (const [i, item] of farTrees.entries()) {
		tree(c, `field-tree-${i}`, item.x, waterY + 6, item.h, item.w, 0.28, placement);
	}
	const pondCenter = composition.between(693, 747);
	const pondRows = [
		{ y: waterY, left: pondCenter - 304, right: pondCenter + 250 },
		{ y: waterY + 47, left: pondCenter - 368, right: pondCenter + 344 },
		{ y: waterY + 105, left: pondCenter - 384, right: pondCenter + 397 },
		{ y: waterY + 168, left: pondCenter - 316, right: pondCenter + 435 },
		{ y: waterY + 229, left: pondCenter - 251, right: pondCenter + 498 },
		{ y: waterY + 280, left: pondCenter - 113, right: pondCenter + 576 }
	];
	for (let i = 0; i < pondRows.length - 1; i += 1) {
		const top = pondRows[i];
		const bottom = pondRows[i + 1];
		const steps = 8;
		const bank = (amount: number): [number, number, number] => [
			top.left + (bottom.left - top.left) * amount,
			top.right + (bottom.right - top.right) * amount,
			top.y + (bottom.y - top.y) * amount
		];
		for (let step = 0; step < steps; step += 1) {
			const [lx, rx, y] = bank(step / steps);
			const [ln, rn, yn] = bank((step + 1) / steps);
			const t = (i + step / steps) / (pondRows.length - 1);
			c.poly(
				'pond-water',
				[
					[lx, y],
					[rx, y],
					[rn, yn + 0.5],
					[ln, yn + 0.5]
				],
				mix(rgb('a7aca1'), rgb('667e79'), t),
				{ ...water, depth: 0.24 + t * 0.46, light: 0.26 }
			);
		}
		for (let j = 0; j < 34; j += 1) {
			const t = composition.between(0.03, 0.97);
			const [lx, rx, y] = bank(t);
			const w = composition.between(13, 93) * (0.56 + i * 0.12);
			const x = composition.between(lx + w / 2, rx - w / 2);
			const tree = farTrees.find(
				(item) => i < 3 && Math.abs(x - item.x) < item.w * (0.52 - i * 0.12)
			);
			const pigment = tree
				? composition.choose([rgb('71816a'), rgb('859075'), rgb('a1a385')])
				: composition.choose(riverPalette.slice(1));
			ripple(
				c,
				tree ? 'tree-reflections' : 'pond-water',
				x,
				y,
				w,
				composition.between(1.1, 4.5),
				pigment,
				0.38 + i * 0.08,
				composition.between(0.42, 0.74)
			);
		}
	}
	const pathX = composition.between(489, 552);
	const pathY = waterY + 241;
	const path: Point[] = [
		[0, 800],
		[141, 705],
		[286, 651],
		[pathX - 32, pathY - 17],
		[597, waterY + 249],
		[841, waterY + 286],
		[1200, waterY + 288],
		[1200, waterY + 317],
		[849, waterY + 325],
		[656, waterY + 310],
		[pathX + 4, pathY + 31],
		[310, 706],
		[230, 755],
		[200, 800]
	];
	c.poly('bank-path', path, rgb('b9a77f'), { ...earth, depth: 0.78, light: 0.53 });
	c.line('bank-path', [15, 790], [192, 699], 5.2, rgb('d0bc8c'), { ...earth, opacity: 0.6 });
	c.line('bank-path', [230, 687], [pathX - 16, pathY - 11], 4.9, rgb('d0bc8c'), {
		...earth,
		opacity: 0.6
	});
	for (let i = 0; i < 15; i += 1) {
		const t = i / 14;
		const x = 617 + t * 599;
		reeds(
			c,
			`bank-grass-${i}`,
			x,
			waterY + 251 + t * 35,
			placement.between(7, 27),
			placement,
			0.71
		);
	}
	for (let i = 0; i < 17; i += 1) {
		const t = i / 16;
		const x = 5 + t * 346;
		reeds(c, `foreground-grass-${i}`, x, 803 - t * 68, placement.between(20, 65), placement, 0.95);
	}
	const foregroundX = placement.between(103, 176);
	tree(
		c,
		'near-tree',
		foregroundX,
		766,
		placement.between(393, 454),
		placement.between(187, 236),
		0.94,
		placement
	);
	const y = pathY + 12;
	const walkerHeight = placement.between(100, 122);
	shadow(c, 'bank-walker-shadow', pathX, y, 110, overcast ? 0.21 : 0.43);
	figure(
		c,
		{
			id: 'bank-walker',
			x: pathX,
			y,
			height: walkerHeight,
			pose: 'walk',
			surface: 'bank-path',
			activity: 'walking along the pond bank'
		},
		{
			shirt: rgb('98718a'),
			trousers: rgb('c5b69b'),
			skin: rgb('a97957'),
			direction: 1,
			depth: 0.78,
			prop: 'bag',
			hem: 16
		}
	);
	return {
		horizon,
		vanishing: [736, horizon] as const,
		focal: { x: pathX + 53, y: y - walkerHeight * 0.52, radius: 139 },
		weather,
		description: `A person with a bag walks along a pond bank in ${weather}. Trees stand beside cultivated strips and two small buildings, with broken green reflections on the water.`
	};
}
