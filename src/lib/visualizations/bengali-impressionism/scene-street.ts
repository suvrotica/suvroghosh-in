import { figure, shadow } from './scene-figures';
import {
	mix,
	rgb,
	sky,
	tree,
	type Attributes,
	type Colour,
	type Composition,
	type Point,
	type Random
} from './scene-geometry';

const plaster = { material: 'plaster', angle: Math.PI / 2, detail: 0.42 } as const;
const timber = { material: 'wood', detail: 0.8, angle: Math.PI / 2 } as const;
const iron = { material: 'metal', detail: 0.76, angle: Math.PI / 2 } as const;
const paving = { material: 'stone', detail: 0.28 } as const;
const cloth = { material: 'cloth', detail: 0.86, angle: -0.11 } as const;
const sunlight = rgb('f8dfac');
const coolShade = rgb('69637a');

function frontage(
	c: Composition,
	side: -1 | 1,
	index: number,
	at: (t: number) => Point,
	from: number,
	to: number,
	height: number,
	pigment: Colour,
	rng: Random
) {
	const id = `${side < 0 ? 'west' : 'east'}-frontage-${index}`;
	const dark = mix(pigment, coolShade, side < 0 ? 0.41 : 0.51);
	const light = mix(pigment, sunlight, side < 0 ? 0.48 : 0.18);
	const shade = mix(pigment, rgb('404b57'), 0.67);
	const depth = 1 - from * 0.81;
	const baseLight = side < 0 ? 0.61 : -0.36;
	const pt = (u: number, v: number): Point => {
		const t = from + (to - from) * u;
		const [x, ground] = at(t);
		return [x, ground - v * height * (1 - t * 0.85)];
	};
	const panel = (
		u: number,
		v: number,
		w: number,
		h: number,
		color: Colour,
		a: Attributes = plaster
	) =>
		c.poly(id, [pt(u, v), pt(u + w, v), pt(u + w, v + h), pt(u, v + h)], color, {
			depth,
			light: baseLight,
			...a
		});
	const line = (
		u0: number,
		v0: number,
		u1: number,
		v1: number,
		w: number,
		color: Colour,
		a: Attributes
	) =>
		c.line(id, pt(u0, v0), pt(u1, v1), w * (1 - from * 0.81), color, {
			depth,
			light: baseLight,
			...a
		});
	panel(0, 0, 1, 1.013, pigment);
	panel(0.02, 0.018, 0.088, 0.989, dark);
	panel(0.1, 0.025, 0.037, 0.975, light);
	panel(0.904, 0.025, 0.031, 0.97, light);
	panel(0.942, 0.018, 0.056, 0.99, dark);
	panel(0, 0, 1, 0.073, mix(pigment, shade, 0.42));
	for (const floor of [0.306, 0.622, 0.938]) {
		panel(0.05, floor - 0.031, 0.9, 0.033, dark);
		panel(-0.014, floor, 1.027, 0.012, light);
		panel(0.08, floor + 0.017, 0.82, 0.015, mix(pigment, light, 0.56));
	}
	panel(-0.012, 0.995, 1.025, 0.022, light);
	panel(0, 1.009, 1, 0.011, shade);
	if (index === 1 || (index < 3 && rng.value() > 0.47)) {
		panel(0.14, 1.01, 0.55, 0.1, mix(pigment, light, 0.66));
		panel(0.12, 1.112, 0.6, 0.013, dark);
		panel(0.16, 1.04, 0.5, 0.013, light);
	}
	for (const level of [0.36, 0.69]) {
		const shutters = mix(
			rng.choose([rgb('526b69'), rgb('526877'), rgb('796952'), rgb('557b72')]),
			pigment,
			0.13
		);
		for (const u of [0.22, 0.57]) {
			panel(u - 0.035, level - 0.012, 0.295, 0.234, light);
			panel(u, level, 0.226, 0.214, shade, timber);
			panel(u + 0.016, level + 0.013, 0.07, 0.174, shutters, timber);
			panel(u + 0.145, level + 0.012, 0.063, 0.175, mix(shutters, light, 0.16), timber);
			panel(u + 0.095, level + 0.106, 0.05, 0.066, mix(shade, rgb('a1a493'), 0.28), {
				material: 'glass',
				detail: 0.68
			});
			panel(u - 0.047, level - 0.023, 0.31, 0.01, light);
			if (index < 3) {
				for (const slot of [0.041, 0.073, 0.105, 0.137]) {
					line(
						u + 0.02,
						level + slot,
						u + 0.079,
						level + slot,
						1.2,
						mix(shutters, shade, 0.4),
						timber
					);
				}
			}
		}
	}
	if (index < 4) {
		const level = 0.33 + (index === 1 ? 0.31 : 0);
		panel(0.135, level - 0.047, 0.75, 0.043, dark);
		panel(0.12, level - 0.011, 0.77, 0.014, light);
		for (let n = 0; n < 9; n += 1) {
			const u = 0.145 + n * 0.087;
			line(u, level, u + 0.005, level + 0.082, 1.9, shade, iron);
		}
		line(0.13, level + 0.082, 0.86, level + 0.082, 2.5, mix(shade, light, 0.26), {
			...iron,
			angle: 0
		});
	}
	panel(0.17, 0.031, 0.29, 0.244, dark);
	panel(0.194, 0.042, 0.24, 0.222, shade, timber);
	panel(0.218, 0.045, 0.067, 0.203, mix(shade, pigment, 0.23), timber);
	panel(0.53, 0.045, 0.33, 0.212, mix(shade, rgb('aab3a8'), 0.31), timber);
	panel(0.56, 0.105, 0.27, 0.131, mix(shade, pigment, 0.38), { material: 'glass', detail: 0.75 });
	panel(0.15, 0.022, 0.34, 0.01, mix(pigment, light, 0.35));
	panel(0.155, 0.263, 0.727, 0.023, dark);
	if (index < 4) {
		const a = pt(0.17, 0.29);
		const b = pt(0.85, 0.29);
		const spread = (to - from) * 116 * -side;
		const frontA: Point = [a[0] + spread, a[1] + 12 * depth];
		const frontB: Point = [b[0] + spread, b[1] + 11 * depth];
		const awning =
			index === 1 ? rgb('527772') : rng.choose([rgb('9d644f'), rgb('7b8573'), rgb('a48861')]);
		c.poly(id, [a, b, frontB, frontA], awning, { ...cloth, depth, light: baseLight * 0.76 });
		c.line(id, frontA, frontB, 6 * depth, mix(awning, shade, 0.35), { ...cloth, depth });
	}
	if (index < 3) {
		for (let i = 0; i < 18; i += 1) {
			const u = rng.between(0.1, 0.86);
			const v = rng.between(0.05, 0.92);
			const p = pt(u, v);
			const w = rng.between(2, 9) * depth;
			if ((v > 0.3 && v < 0.61) || v > 0.645) {
				const border = u < 0.16 || u > 0.87 || (u > 0.465 && u < 0.54);
				if (!border) continue;
			}
			c.ellipse(
				id,
				p[0],
				p[1],
				w,
				w * rng.between(0.8, 1.8),
				mix(pigment, i % 3 ? light : dark, 0.29),
				{ ...plaster, depth, opacity: 0.53, light: baseLight },
				0.12
			);
		}
	}
}

function market(
	c: Composition,
	x: number,
	y: number,
	rng: Random,
	customer: boolean,
	overcast: boolean
) {
	const id = 'produce-stall';
	const shade = { material: 'wood', detail: 0.89, depth: 0.73 } as const;
	const greens = ['4b6650', '6f8150', '889555', 'a8a162', 'c0ac66'].map(rgb);
	shadow(c, 'stall-shadow', x, y + 13, 132, overcast ? 0.18 : 0.46);
	for (const pole of [-45, 50]) {
		c.line(id, [x + pole, y - 115], [x + pole + 3, y + 11], 3.3, rgb('6f604e'), shade);
	}
	const canopy = [
		[x - 60, y - 122],
		[x + 43, y - 134],
		[x + 66, y - 101],
		[x - 48, y - 86]
	] as const;
	c.poly(id, canopy, rgb('a66454'), cloth);
	for (let i = 0; i < 7; i += 1) {
		const u = i / 7;
		const v = u + 0.043;
		c.poly(
			id,
			[
				[x - 59 + u * 102, y - 122 - u * 12],
				[x - 59 + v * 102, y - 122 - v * 12],
				[x - 48 + v * 114, y - 86 - v * 15],
				[x - 48 + u * 114, y - 86 - u * 15]
			],
			rgb('dbb486'),
			{ ...cloth, light: 0.6 }
		);
	}
	c.poly(
		id,
		[
			[x - 48, y - 86],
			[x + 66, y - 101],
			[x + 65, y - 91],
			[x - 48, y - 77]
		],
		rgb('8d5149'),
		cloth
	);
	figure(
		c,
		{
			id: 'vendor',
			x: x + 13,
			y: y - 12,
			height: 78,
			pose: 'lean',
			surface: 'left-pavement',
			activity: 'arranging vegetables'
		},
		{
			shirt: rgb('d5ccaa'),
			trousers: rgb('656977'),
			skin: rgb('a37559'),
			direction: -1,
			depth: 0.69
		}
	);
	for (const leg of [-37, 38]) {
		c.line(id, [x + leg, y - 34], [x + leg - 3, y + 13], 5.8, rgb('65554a'), shade);
		c.line(id, [x + leg - 4, y - 34], [x + leg - 7, y + 10], 2.3, rgb('a58061'), shade);
	}
	c.poly(
		id,
		[
			[x - 47, y - 35],
			[x + 38, y - 42],
			[x + 61, y - 24],
			[x - 40, y - 14]
		],
		rgb('b99568'),
		shade
	);
	c.poly(
		id,
		[
			[x - 41, y - 14],
			[x + 61, y - 24],
			[x + 59, y - 12],
			[x - 40, y - 3]
		],
		rgb('90674e'),
		shade
	);
	for (let group = 0; group < 3; group += 1) {
		const gx = x - 24 + group * 29;
		const gy = y - 29 - group * 3.4;
		c.ellipse(id, gx, gy + 3, 17, 8, rgb('6b6a4d'), shade);
		for (let i = 0; i < 12; i += 1) {
			const dx = rng.between(-12, 12);
			const dy = rng.between(-6, 5);
			const angle = rng.between(-1.3, 0.22);
			c.ellipse(
				id,
				gx + dx,
				gy + dy,
				rng.between(2.5, 5.6),
				rng.between(1.7, 3.3),
				group === 2 && i % 2 ? rgb('ad754d') : rng.choose(greens),
				{ material: 'plant', detail: 0.99, depth: 0.74, angle },
				angle
			);
		}
	}
	if (customer) {
		shadow(c, 'stall-customer-shadow', x - 50, y + 29, 57, 0.38);
		figure(
			c,
			{
				id: 'stall-customer',
				x: x - 50,
				y: y + 29,
				height: 89,
				pose: 'stand',
				surface: 'left-pavement',
				activity: 'waiting beside the stall'
			},
			{
				shirt: rgb('668485'),
				trousers: rgb('b0a184'),
				skin: rgb('ab7453'),
				direction: 1,
				depth: 0.76
			}
		);
	}
}

export function street(c: Composition, composition: Random, placement: Random, opening: boolean) {
	const horizon = opening ? 355 : composition.between(331, 388);
	const vanishingX = opening ? 623 : composition.between(572, 670);
	const weather = opening
		? 'clear daylight'
		: composition.choose(['clear daylight', 'soft overcast light', 'daylight after rain']);
	const overcast = weather === 'soft overcast light';
	const wet = weather === 'daylight after rain';
	sky(c, horizon, overcast, composition);
	const road = rgb(wet ? '9b9c9d' : overcast ? 'b8afa4' : 'c0ab91');
	c.gradient(
		'lane',
		0,
		horizon - 8,
		1200,
		817 - horizon,
		mix(road, rgb('b6b8ac'), 0.32),
		mix(road, rgb('ada3a0'), 0.49),
		paving
	);
	c.poly(
		'lane',
		[
			[vanishingX, horizon],
			[vanishingX + 38, horizon + 2],
			[1080, 800],
			[411, 800],
			[565, 474]
		],
		mix(road, rgb('ead5ad'), overcast ? 0.1 : 0.34),
		{ ...paving, light: 0.53, angle: -0.76, opacity: 0.83 }
	);
	const rightShadow = [
		[vanishingX + 44, horizon + 12],
		[1078, 534],
		[1200, 543],
		[1200, 800],
		[780, 800],
		[817, 706],
		[757, 642],
		[731, 602],
		[696, 576],
		[728, 540]
	] as const;
	c.poly('lane-shadow', rightShadow, rgb(wet ? '767e90' : '898c9b'), {
		...paving,
		angle: 0.69,
		light: -0.76,
		opacity: overcast ? 0.51 : 0.83
	});
	const leftAt = (t: number): Point => [
		-128 + (vanishingX + 99) * t,
		653 + (horizon + 12 - 653) * t
	];
	const rightAt = (t: number): Point => [
		1284 + (vanishingX + 53 - 1284) * t,
		734 + (horizon + 13 - 734) * t
	];
	c.poly(
		'left-pavement',
		[
			[-55, 586],
			[vanishingX - 22, horizon + 8],
			[vanishingX - 15, horizon + 29],
			[324, 767],
			[0, 822]
		],
		rgb('a89479'),
		{ ...paving, angle: -0.77, detail: 0.46 }
	);
	c.poly(
		'left-pavement',
		[
			[-55, 586],
			[vanishingX - 22, horizon + 8],
			[vanishingX - 20, horizon + 24],
			[315, 753],
			[0, 807]
		],
		rgb('ceba99'),
		{ ...paving, angle: -0.76, light: 0.57 }
	);
	c.poly(
		'right-pavement',
		[
			[vanishingX + 35, horizon + 10],
			[1200, 673],
			[1200, 800],
			[1110, 800],
			[vanishingX + 19, horizon + 18]
		],
		rgb('8f9091'),
		{ ...paving, angle: 0.71, light: -0.44 }
	);
	for (let i = 0; i < 47; i += 1) {
		const y = composition.between(horizon + 13, 812);
		const depth = (y - horizon) / (800 - horizon);
		const x = composition.between(vanishingX - 472 * depth, vanishingX + 640 * depth);
		const w = composition.between(2, 84) * depth;
		const shade = x > vanishingX + 216 * depth;
		const pigment = mix(
			shade ? rgb('878c99') : road,
			shade ? rgb('b5acaa') : rgb('e0cca7'),
			composition.between(0.07, 0.56)
		);
		c.ellipse(
			'lane',
			x,
			y,
			w,
			w * composition.between(0.045, 0.22),
			pigment,
			{ ...paving, depth, angle: wet ? 0.03 : (x - vanishingX) / 1110, opacity: 0.37 },
			wet ? 0.018 : 0.08
		);
	}
	if (wet) {
		for (let i = 0; i < 26; i += 1) {
			const y = placement.between(435, 797);
			const x = vanishingX + placement.between(-0.5, 1.12) * (y - horizon);
			c.ellipse(
				'rain-reflection',
				x,
				y,
				placement.between(8, 39),
				placement.between(0.8, 4.5),
				placement.choose([rgb('bec6c4'), rgb('bda395'), rgb('7a8993')]),
				{ ...paving, opacity: 0.68, angle: 0 }
			);
		}
	}
	for (const [i, x] of [
		vanishingX - 48,
		vanishingX - 7,
		vanishingX + 36,
		vanishingX + 86
	].entries()) {
		tree(
			c,
			`distant-tree-${i}`,
			x,
			horizon + 32,
			placement.between(91, 148),
			placement.between(56, 91),
			0.22,
			placement
		);
	}
	for (const side of [-1, 1] as const) {
		const boundaries = [
			0,
			composition.between(0.33, 0.37),
			composition.between(0.55, 0.62),
			composition.between(0.7, 0.76),
			composition.between(0.84, 0.88),
			0.94,
			1
		];
		const palette = (
			side === -1
				? ['d9b477', 'b9826d', 'd9ba8e', 'c9c3a2', 'b39a83', 'b2afa2']
				: ['8f9b94', 'b6a9a0', '99a59f', 'b2a99b', 'b4b0a5', 'aaab9f']
		).map(rgb);
		for (let i = boundaries.length - 2; i >= 0; i -= 1) {
			const height = composition.between(435, 616) * (i < 2 ? 1 : 0.92);
			const pigment = mix(
				palette[i],
				overcast ? rgb('a6a5a4') : palette[(i + 2) % palette.length],
				composition.between(0.07, 0.23)
			);
			frontage(
				c,
				side,
				i,
				side === -1 ? leftAt : rightAt,
				boundaries[i],
				boundaries[i + 1],
				height,
				pigment,
				c.colours
			);
		}
	}
	const treeLeft = opening || placement.value() > 0.35;
	const treeX = treeLeft ? placement.between(116, 195) : placement.between(970, 1090);
	const treeY = treeLeft ? placement.between(520, 565) : placement.between(601, 649);
	shadow(c, 'canopy-shadow', treeX - 17, treeY + 8, 176, overcast ? 0.17 : 0.33);
	tree(
		c,
		'pavement-tree',
		treeX,
		treeY,
		placement.between(303, 372),
		placement.between(188, 250),
		0.74,
		placement
	);
	const farX = vanishingX + 33;
	const farY = horizon + 89;
	shadow(c, 'lane-traveller-shadow', farX, farY, 31, 0.24);
	const bystanderPose = !opening && placement.value() > 0.66 ? 'cycle' : 'walk';
	figure(
		c,
		{
			id: 'lane-traveller',
			x: farX,
			y: farY,
			height: 53,
			pose: bystanderPose,
			surface: 'lane',
			activity: bystanderPose === 'cycle' ? 'cycling along the lane' : 'walking along the lane'
		},
		{
			shirt: rgb('7a8792'),
			trousers: rgb('777178'),
			skin: rgb('a47d63'),
			direction: -1,
			depth: 0.34
		}
	);
	const sy = opening ? 536 : placement.between(506, 561);
	const curb = (y: number) =>
		vanishingX - 20 + ((335 - vanishingX) * (y - horizon - 24)) / (729 - horizon);
	const sx = Math.min(
		opening ? 476 : vanishingX + placement.between(-153, -109),
		curb(sy - 12) - 20
	);
	const customer = !opening && placement.value() > 0.61;
	market(c, sx, sy, placement, customer, overcast);
	const x = opening ? 608 : vanishingX + placement.between(-42, 56);
	const y = opening ? 644 : placement.between(600, 669);
	const walkingHeight = opening ? 138 : placement.between(126, 154);
	const shirt = opening
		? rgb('bd6656')
		: placement.choose([rgb('bd6656'), rgb('769293'), rgb('b58d64'), rgb('929176')]);
	shadow(c, 'bag-carrier-shadow', x, y, 116, overcast ? 0.19 : 0.51);
	figure(
		c,
		{
			id: 'bag-carrier',
			x,
			y,
			height: walkingHeight,
			pose: 'walk',
			surface: 'lane',
			activity: 'walking with a shopping bag'
		},
		{ shirt, trousers: rgb('484b5b'), skin: rgb('b27c58'), direction: 1, depth: 0.86, prop: 'bag' }
	);
	return {
		horizon,
		vanishing: [vanishingX, horizon] as const,
		focal: { x: (sx + x * 2) / 3, y: y - walkingHeight * 0.51, radius: 134 },
		weather,
		description: `A Calcutta lane in ${weather}, with receding plaster shopfronts, balcony rails and a pavement tree. A pedestrian with a shopping bag passes a vendor arranging vegetables under an awning.${customer ? ' A customer waits at the stall.' : ''} Farther down the lane, someone is ${bystanderPose === 'cycle' ? 'cycling' : 'walking'}.`
	};
}
