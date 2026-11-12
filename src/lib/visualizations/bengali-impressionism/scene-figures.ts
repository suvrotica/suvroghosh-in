import {
	mix,
	rgb,
	type Attributes,
	type Colour,
	type Composition,
	type FigurePlacement,
	type Point
} from './scene-geometry';

interface Costume {
	shirt: Colour;
	trousers: Colour;
	skin: Colour;
	direction: -1 | 1;
	depth: number;
	hem?: number;
	prop?: 'bag' | 'book' | 'bowl';
}

const hair = rgb('352f36');
const shoe = rgb('3e393d');
const warm = rgb('f4cd9a');
const shade = rgb('384054');

export function shadow(
	c: Composition,
	id: string,
	x: number,
	y: number,
	span: number,
	opacity: number
) {
	c.poly(
		id,
		[
			[x - span * 0.21, y + 2],
			[x + span * 0.66, y - span * 0.18],
			[x + span * 1.06, y - span * 0.1],
			[x + span * 0.27, y + span * 0.097]
		],
		rgb('535568'),
		{ opacity, detail: 0.24, angle: -0.15, light: -0.74 }
	);
}

export function chair(
	c: Composition,
	id: string,
	x: number,
	y: number,
	height: number,
	color: Colour,
	direction: -1 | 1,
	depth: number
) {
	const s = height / 100;
	const pt = (dx: number, dy: number): Point => [x + dx * s * direction, y + dy * s];
	const base = { material: 'wood', detail: 0.83, depth } as const;
	const dim = mix(color, shade, 0.33);
	const bright = mix(color, warm, 0.25);
	c.line(id, pt(-17, -72), pt(-20, -2), 4 * s, dim, base);
	c.line(id, pt(-9, -76), pt(-11, -9), 4 * s, dim, base);
	c.poly(id, [pt(-19, -73), pt(-10, -76), pt(-8, -52), pt(-18, -50)], color, base);
	c.line(id, pt(-19, -70), pt(-11, -73), 2.7 * s, bright, base);
	c.line(id, pt(12, -37), pt(15, -7), 4 * s, dim, base);
	c.line(id, pt(16, -32), pt(18, 0), 4.5 * s, color, base);
	c.poly(id, [pt(-18, -39), pt(-9, -44), pt(13, -42), pt(19, -34), pt(-17, -34)], color, base);
	c.line(id, pt(-16, -35), pt(18, -35), 2.7 * s, bright, base);
}

export function figure(c: Composition, placement: FigurePlacement, costume: Costume) {
	c.figures.push(placement);
	const { x, y, height, id, pose } = placement;
	const { shirt, trousers, skin, direction, depth, prop, hem = 0 } = costume;
	const scale = height / 100;
	const pt = (dx: number, dy: number): Point => [x + dx * scale * direction, y + dy * scale];
	const cloth = { material: 'cloth', detail: 1, depth, angle: -1.29 } as const;
	const body = { material: 'skin', detail: 1, depth } as const;
	const object = { material: 'metal', detail: 0.84, depth } as const;
	const darkShirt = mix(shirt, shade, 0.31);
	const brightShirt = mix(shirt, warm, 0.26);
	const dimSkin = mix(skin, shade, 0.27);
	const brightSkin = mix(skin, warm, 0.28);
	const trousersLight = mix(trousers, warm, 0.16);
	const line = (start: Point, end: Point, width: number, color: Colour, a: Attributes = cloth) =>
		c.line(id, pt(...start), pt(...end), width * scale, color, a);
	const poly = (points: Point[], color: Colour, a: Attributes = cloth) =>
		c.poly(
			id,
			points.map(([dx, dy]) => pt(dx, dy)),
			color,
			a
		);
	const oval = (
		dx: number,
		dy: number,
		rx: number,
		ry: number,
		color: Colour,
		a: Attributes = body,
		angle = 0
	) => {
		const [px, py] = pt(dx, dy);
		c.ellipse(id, px, py, rx * scale, ry * scale, color, a, angle * direction);
	};
	const seated = pose === 'sit';
	const cycling = pose === 'cycle';
	const inclined = pose === 'lean' || cycling;
	const hipY = seated ? -39 : cycling ? -49 : -47;
	const shoulderY = seated ? -69 : cycling ? -77 : -81;
	const headX = inclined ? (cycling ? 19 : 15) : seated ? 7 : 5;
	const shoulderX = inclined ? 9 : seated ? 5 : 1;
	const headY = shoulderY - 11;

	if (cycling) {
		for (const wheelX of [-24, 28]) {
			const rim = (a: number, radius: number): Point => [
				wheelX + Math.cos(a) * radius,
				-15 + Math.sin(a) * radius
			];
			for (let segment = 0; segment < 16; segment += 1) {
				const a = (segment * Math.PI) / 8;
				const b = a + Math.PI / 8;
				poly(
					[rim(a, 15), rim(b, 15), rim(b, 12.6), rim(a, 12.6)],
					rgb(segment < 7 ? '54535a' : '686670'),
					object
				);
			}
			line([wheelX, -27], [wheelX, -3], 0.76, rgb('656873'), object);
			line([wheelX - 12, -15], [wheelX + 12, -15], 0.76, rgb('656873'), object);
		}
		line([-24, -15], [-8, -48], 3.1, rgb('667c79'), object);
		line([-8, -48], [24, -40], 3.3, rgb('667c79'), object);
		line([24, -40], [3, -17], 3.4, rgb('667c79'), object);
		line([-24, -15], [3, -17], 2.9, rgb('5a6b6c'), object);
		line([-8, -48], [3, -17], 3, rgb('6f8b83'), object);
		line([28, -15], [23, -51], 3.1, rgb('5e6b6f'), object);
		line([23, -51], [29, -55], 2.8, rgb('777776'), object);
		line([-13, -49], [-3, -49], 3.6, shoe, object);
	}

	const stride = pose === 'walk' || pose === 'carry';
	const rearFoot: Point = seated
		? [21, -2]
		: cycling
			? [4, -18]
			: stride
				? [-16, -2.8]
				: [-8, -1.5];
	const frontFoot: Point = seated
		? [27, -1.3]
		: cycling
			? [9, -12]
			: stride
				? [19, -1.6]
				: [9, -1.5];
	const rearKnee: Point = seated ? [20, -34] : cycling ? [10, -37] : stride ? [-9, -22] : [-6, -25];
	const frontKnee: Point = seated ? [27, -31] : cycling ? [20, -36] : stride ? [9, -23] : [6, -22];
	line([-7, hipY], rearKnee, 10.6, mix(trousers, shade, 0.31));
	line(rearKnee, rearFoot, 6.9, mix(trousers, shade, 0.31));
	line([rearFoot[0] - 3, rearFoot[1]], [rearFoot[0] + 6, rearFoot[1]], 3.3, shoe);
	line([5, hipY], frontKnee, 12, trousers);
	line(frontKnee, frontFoot, 8.7, trousers);
	line(
		[frontKnee[0] - 2.8, frontKnee[1]],
		[frontFoot[0] - 1.8, frontFoot[1] - 3],
		2.4,
		trousersLight
	);
	line([frontFoot[0] - 3, frontFoot[1]], [frontFoot[0] + 6, frontFoot[1]], 3.6, shoe);

	if (inclined) {
		line([shoulderX - 7, shoulderY + 4], [shoulderX + 3, shoulderY + 17], 7.5, darkShirt);
		line([shoulderX + 3, shoulderY + 17], [shoulderX + 15, shoulderY + 22], 4.8, dimSkin, body);
	} else {
		line([shoulderX + 9, shoulderY + 4], [shoulderX + 15, shoulderY + 17], 7.5, darkShirt);
		line(
			[shoulderX + 15, shoulderY + 17],
			[shoulderX + (stride ? 20 : 14), shoulderY + 28],
			5.2,
			dimSkin,
			body
		);
	}
	poly(
		[
			[shoulderX - 12, shoulderY + 3],
			[shoulderX - 6, shoulderY - 3],
			[shoulderX + 10, shoulderY - 1],
			[shoulderX + 14, shoulderY + 8],
			[9 + hem * 0.23, hipY + 3 + hem],
			[-12 - hem * 0.23, hipY + 2 + hem * 0.91],
			[shoulderX - 14, shoulderY + 13]
		],
		shirt
	);
	poly(
		[
			[shoulderX + 4, shoulderY + 1],
			[shoulderX + 11, shoulderY + 3],
			[9 + hem * 0.23, hipY + 3 + hem],
			[2, hipY - 1 + hem],
			[shoulderX + 3, shoulderY + 14]
		],
		darkShirt
	);
	poly(
		[
			[shoulderX - 10, shoulderY + 3],
			[shoulderX - 3, shoulderY + 1],
			[shoulderX - 2, shoulderY + 15],
			[-7 - hem * 0.18, hipY - 2 + hem * 0.88],
			[-10 - hem * 0.18, hipY - 4 + hem * 0.88]
		],
		brightShirt,
		{ ...cloth, light: 0.59 }
	);
	line([headX - 2, headY + 7], [headX - 2, shoulderY + 1], 6.4, dimSkin, body);
	oval(headX - 1.8, headY - 0.4, 7.6, 9.3, hair, cloth, 0.22);
	poly(
		[
			[headX - 2, headY - 6.5],
			[headX + 4.5, headY - 6.4],
			[headX + 7.4, headY - 1.6],
			[headX + 8.7, headY + 1],
			[headX + 6.3, headY + 2.4],
			[headX + 5, headY + 6.5],
			[headX - 0.7, headY + 7.5],
			[headX - 3.4, headY + 2]
		],
		skin,
		body
	);
	oval(headX + 1.9, headY - 3, 3.3, 2.4, brightSkin, { ...body, light: 0.56 }, -0.15);
	poly(
		[
			[headX - 7, headY - 4],
			[headX - 4.8, headY - 8.5],
			[headX + 1.6, headY - 9.5],
			[headX + 5.5, headY - 6.7],
			[headX - 1.5, headY - 5.2],
			[headX - 4.6, headY + 4.4]
		],
		hair
	);
	const elbow: Point = [shoulderX - 12, shoulderY + 17];
	const hand: Point = seated
		? [shoulderX + 18, shoulderY + 20]
		: inclined
			? [shoulderX + (cycling ? 19 : 21), shoulderY + (cycling ? 24 : 27)]
			: prop === 'bowl'
				? [shoulderX + 16, shoulderY + 24]
				: [shoulderX - (stride ? 17 : 13), shoulderY + 30];
	line([shoulderX - 11, shoulderY + 6], elbow, 8.5, shirt);
	line(elbow, hand, 4.9, skin, body);
	oval(hand[0], hand[1], 3.15, 2.5, skin);

	if (prop === 'bag') {
		const [hx, hy] = hand;
		line([hx, hy], [hx - 5, hy + 11], 1.7, rgb('8e8467'));
		line([hx, hy], [hx + 7, hy + 10], 1.5, rgb('c1ac78'));
		poly(
			[
				[hx - 6, hy + 9],
				[hx + 8, hy + 9],
				[hx + 10, hy + 26],
				[hx + 2, hy + 29],
				[hx - 8, hy + 25]
			],
			rgb('e0bb73')
		);
		poly(
			[
				[hx - 6, hy + 10],
				[hx - 3, hy + 12],
				[hx - 2, hy + 27],
				[hx - 8, hy + 25]
			],
			rgb('a78e63')
		);
	}
	if (prop === 'book') {
		poly(
			[
				[14, shoulderY + 17],
				[23, shoulderY + 16],
				[31, shoulderY + 21],
				[20, shoulderY + 24]
			],
			rgb('e1d0ae')
		);
		line([23, shoulderY + 16.7], [24, shoulderY + 22.6], 0.8, rgb('9f8470'));
		line([20, shoulderY + 24], [31, shoulderY + 21], 1.4, rgb('a35d4c'));
	}
	if (prop === 'bowl') {
		oval(hand[0] + 2, hand[1], 10, 5, rgb('b59673'), object);
		oval(hand[0] + 2, hand[1] - 2.1, 9, 3.3, rgb('686765'), object);
		line([hand[0] - 5, hand[1] - 2.3], [hand[0] + 4, hand[1] - 4.1], 1.1, rgb('d0b891'), object);
	}
}
