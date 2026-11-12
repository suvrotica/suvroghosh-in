import { chair, figure, shadow } from './scene-figures';
import {
	mix,
	plant,
	rgb,
	sky,
	tree,
	type Colour,
	type Composition,
	type Point,
	type Random
} from './scene-geometry';

const plaster = { material: 'plaster', angle: Math.PI / 2, detail: 0.42 } as const;
const wood = { material: 'wood', angle: Math.PI / 2, detail: 0.8 } as const;
const stone = { material: 'stone', angle: -0.14, detail: 0.43 } as const;
const linen = { material: 'cloth', angle: Math.PI / 2, detail: 0.73 } as const;

function doorway(
	c: Composition,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	colour: Colour,
	closed: boolean
) {
	const top = y - h;
	const shaded = mix(colour, rgb('4a5660'), 0.31);
	c.rect(id, x - 9, top - 9, w + 18, h + 12, rgb('a88b75'), plaster);
	c.rect(id, x - 4, top - 3, w + 8, h + 8, rgb('655f65'), wood);
	c.rect(id, x, top, w, h + 2, rgb('424a55'), { ...wood, light: -0.77 });
	c.poly(
		id,
		[
			[x + 5, top + 7],
			[x + w * 0.44, top + 23],
			[x + w * 0.44, y - 13],
			[x + 5, y - 2]
		],
		colour,
		wood
	);
	c.poly(
		id,
		[
			[x + w * 0.65, top + 21],
			[x + w - 4, top + 6],
			[x + w - 4, y - 4],
			[x + w * 0.65, y - 16]
		],
		shaded,
		wood
	);
	for (const y0 of [top + 18, top + h * 0.5, y - 15]) {
		c.line(id, [x + 7, y0], [x + w * 0.4, y0 + 2], 3, mix(colour, rgb('b5ac88'), 0.23), wood);
	}
	if (closed) {
		c.rect(id, x + w * 0.39, top + 7, w * 0.25, h - 10, shaded, wood);
		c.line(id, [x + w * 0.53, top + 6], [x + w * 0.53, y - 3], 3, rgb('5b655d'), wood);
		c.ellipse(id, x + w * 0.57, top + h * 0.55, 4.2, 3.2, rgb('bcab79'), {
			material: 'metal',
			detail: 0.9
		});
	} else {
		c.rect(id, x + w * 0.44, y - h * 0.18, w * 0.21, h * 0.18, rgb('807567'), stone);
		c.rect(id, x + w * 0.56, top + h * 0.18, w * 0.075, h * 0.27, rgb('7d8482'), {
			material: 'glass',
			detail: 0.56
		});
	}
	c.poly(
		id,
		[
			[x - 12, y + 2],
			[x + w + 13, y + 2],
			[x + w + 18, y + 13],
			[x - 16, y + 13]
		],
		rgb('bda894'),
		stone
	);
	c.line(id, [x - 16, y + 14], [x + w + 18, y + 14], 3, rgb('7d716d'), stone);
}

function window(c: Composition, id: string, x: number, y: number, w: number, h: number) {
	c.rect(id, x - 8, y - 8, w + 16, h + 14, rgb('d0ab85'), plaster);
	c.rect(id, x, y, w, h, rgb('555956'), wood);
	c.rect(id, x + 5, y + 6, w * 0.34, h - 9, rgb('738784'), wood);
	c.rect(id, x + w * 0.57, y + 6, w * 0.36, h - 9, rgb('667a75'), wood);
	for (let i = 0; i < 5; i += 1) {
		const row = y + 11 + (i * h) / 6;
		c.line(id, [x + 5, row], [x + w * 0.37, row + 1], 1.5, rgb('a0a090'), wood);
		c.line(id, [x + w * 0.58, row], [x + w - 5, row - 1], 1.5, rgb('8f9488'), wood);
	}
	c.line(id, [x - 11, y + h + 2], [x + w + 12, y + h + 2], 4, rgb('e0ba91'), plaster);
}

export function courtyard(c: Composition, composition: Random, placement: Random) {
	const horizon = 361;
	const weather = 'afternoon light';
	sky(c, horizon, false, composition);
	const roofEdge = composition.between(177, 203);
	const openAt = composition.between(782, 866);
	const floorY = composition.between(539, 561);
	const wall = composition.choose([rgb('bc9581'), rgb('c3a18a'), rgb('b89b8a')]);
	const palewall = mix(wall, rgb('efd6a6'), 0.64);
	const wallShadow = mix(wall, rgb('7c7483'), 0.29);
	const verandafloor = rgb('a78c7c');
	const doorColour = composition.choose([rgb('607c78'), rgb('6b8279'), rgb('7e7566')]);
	c.poly(
		'right-garden',
		[
			[openAt - 8, 351],
			[1200, 305],
			[1200, 620],
			[openAt - 36, 592]
		],
		rgb('b9a978'),
		stone
	);
	for (let i = 0; i < 3; i += 1) {
		tree(
			c,
			`outside-tree-${i}`,
			856 + 129 * i + placement.between(-26, 22),
			583 - i * 6,
			placement.between(284, 345),
			placement.between(145, 183),
			0.41,
			placement
		);
	}
	c.poly(
		'garden-wall',
		[
			[openAt - 5, 438],
			[1200, 367],
			[1200, 532],
			[openAt - 8, 565]
		],
		palewall,
		{ ...plaster, light: 0.72 }
	);
	c.poly(
		'garden-wall',
		[
			[openAt - 3, 429],
			[1200, 357],
			[1200, 368],
			[openAt - 5, 441]
		],
		rgb('cfab84'),
		{ ...plaster, light: 0.62 }
	);
	c.poly(
		'garden-wall',
		[
			[openAt - 6, 530],
			[1200, 487],
			[1200, 532],
			[openAt - 8, 565]
		],
		mix(palewall, wallShadow, 0.53),
		plaster
	);
	c.gradient('courtyard-floor', 0, floorY - 5, 1200, 805 - floorY, rgb('d2b78f'), rgb('c3a183'), {
		...stone,
		depth: 0.69,
		light: 0.5
	});
	c.poly(
		'courtyard-floor',
		[
			[0, floorY - 8],
			[openAt + 8, floorY - 10],
			[openAt - 117, 687],
			[0, 765]
		],
		verandafloor,
		{ ...stone, light: -0.45 }
	);
	c.poly(
		'courtyard-floor',
		[
			[0, floorY + 5],
			[openAt + 4, floorY - 11],
			[openAt - 14, floorY + 16],
			[0, floorY + 102]
		],
		rgb('9f877b'),
		{ ...stone, light: -0.52 }
	);
	c.poly(
		'court-light',
		[
			[openAt + 18, floorY + 5],
			[1200, floorY - 10],
			[1200, 803],
			[405, 803],
			[openAt - 97, 690],
			[openAt - 75, 631]
		],
		rgb('e3c59c'),
		{ ...stone, opacity: 0.68, light: 0.79 }
	);
	for (let i = 0; i < 60; i += 1) {
		const x = composition.between(0, 1200);
		const y = composition.between(floorY + 7, 799);
		const shade = x < 880 - (y - floorY) * 1.8;
		const length = composition.between(8, 73) * (0.57 + (y - floorY) / 250);
		c.line(
			'courtyard-floor',
			[x, y],
			[x + length, y + composition.between(-2.8, 0.6)],
			composition.between(1, 4.8),
			shade ? rgb('ac9188') : rgb('c6a881'),
			{ ...stone, opacity: 0.49 }
		);
	}
	c.poly(
		'back-wall',
		[
			[0, roofEdge - 41],
			[openAt + 37, roofEdge + 5],
			[openAt + 37, floorY - 6],
			[0, floorY + 9]
		],
		wall,
		{ ...plaster, light: -0.23 }
	);
	c.poly(
		'back-wall',
		[
			[0, roofEdge - 14],
			[openAt + 36, roofEdge + 19],
			[openAt + 36, roofEdge + 68],
			[0, roofEdge + 75]
		],
		wallShadow,
		{ ...plaster, light: -0.42 }
	);
	c.poly(
		'back-wall',
		[
			[0, floorY - 33],
			[openAt + 36, floorY - 29],
			[openAt + 37, floorY - 5],
			[0, floorY + 8]
		],
		mix(wall, rgb('7d6e6c'), 0.52),
		plaster
	);
	for (let i = 0; i < 43; i += 1) {
		const x = composition.between(0, openAt + 18);
		const y = composition.between(roofEdge + 96, floorY - 36);
		c.ellipse(
			'back-wall',
			x,
			y,
			composition.between(5, 34),
			composition.between(5, 18),
			mix(wall, i % 2 ? palewall : wallShadow, 0.45),
			{ ...plaster, opacity: 0.63 },
			0.12
		);
	}
	const openingX = composition.between(459, 509);
	doorway(c, 'open-doorway', openingX, floorY + 1, 143, 221, doorColour, false);
	doorway(c, 'shuttered-doorway', 57, floorY + 4, 124, 190, doorColour, true);
	window(c, 'shuttered-window', 289, floorY - 169, 97, 117);
	const columnX = openAt - 73;
	c.poly(
		'veranda-column',
		[
			[columnX - 17, roofEdge + 34],
			[columnX + 16, roofEdge + 34],
			[columnX + 15, floorY + 25],
			[columnX - 16, floorY + 25]
		],
		wallShadow,
		{ ...plaster, detail: 0.82 }
	);
	c.poly(
		'veranda-column',
		[
			[columnX + 4, roofEdge + 34],
			[columnX + 18, roofEdge + 34],
			[columnX + 17, floorY + 27],
			[columnX + 3, floorY + 28]
		],
		palewall,
		{ ...plaster, detail: 0.82, light: 0.67 }
	);
	c.rect('veranda-column', columnX - 21, floorY + 22, 43, 15, rgb('b09a82'), stone);
	c.rect('veranda-column', columnX - 20, roofEdge + 36, 42, 10, rgb('9d796b'), stone);
	const roof: Point[] = [
		[0, roofEdge - 76],
		[openAt + 24, roofEdge + 3],
		[openAt + 36, roofEdge + 25],
		[0, roofEdge + 7]
	];
	c.poly('veranda-roof', roof, rgb('aa7b62'), { material: 'stone', angle: 0.11, detail: 0.52 });
	c.poly(
		'veranda-roof',
		[
			[0, roofEdge + 7],
			[openAt + 36, roofEdge + 25],
			[openAt + 26, roofEdge + 49],
			[0, roofEdge + 44]
		],
		rgb('69636a'),
		wood
	);
	for (let i = 0; i < 27; i += 1) {
		const t = i / 27;
		const x = t * (openAt + 25);
		c.line(
			'veranda-roof',
			[x, roofEdge - 73 + t * 77],
			[x + 12, roofEdge + 6 + t * 18],
			3.2,
			mix(rgb('b38a6e'), rgb('d0a17e'), composition.value()),
			{ material: 'stone', detail: 0.68 }
		);
		c.line(
			'veranda-roof',
			[x + 12, roofEdge + 13 + t * 18],
			[x + 16, roofEdge + 36 + t * 12],
			2.9,
			rgb('84756d'),
			wood
		);
	}
	c.line('veranda-roof', [0, roofEdge + 10], [openAt + 37, roofEdge + 27], 6, rgb('b6957c'), {
		...wood,
		angle: 0.017
	});
	c.line('veranda-roof', [0, roofEdge + 44], [openAt + 26, roofEdge + 48], 3, rgb('75665f'), {
		...wood,
		angle: 0.02
	});
	const clothlineY = floorY - 114;
	c.line(
		'clothesline',
		[openAt + 35, clothlineY + 1],
		[1200, clothlineY - 30],
		1.9,
		rgb('786c5d'),
		wood
	);
	for (const [i, pigment] of [rgb('b57970'), rgb('e1c69d'), rgb('79928b')].entries()) {
		const x = openAt + 89 + i * 77;
		const y = clothlineY - 6 - i * 6;
		c.poly(
			'drying-clothes',
			[
				[x, y],
				[x + 51, y - 3],
				[x + 52, y + 58 + 4 * i],
				[x + 4, y + 57 + i * 4]
			],
			pigment,
			{ ...linen, light: 0.55 }
		);
		c.line(
			'drying-clothes',
			[x + 38, y + 1],
			[x + 42, y + 58 + i * 4],
			6.2,
			mix(pigment, rgb('837977'), 0.28),
			linen
		);
	}
	plant(c, 'plant-by-door', openingX + 177, floorY + 29, 54, 0.69, placement);
	plant(c, 'sunlit-pot', openAt + 67, floorY + 115, 101, 0.86, placement);
	plant(c, 'small-sunlit-pot', openAt + 144, floorY + 121, 59, 0.88, placement);
	plant(c, 'foreground-pot', placement.between(91, 160), 716, 86, 0.94, placement);
	const bucketX = openingX - 38;
	const bucketY = floorY + 21;
	c.poly(
		'bucket',
		[
			[bucketX - 13, bucketY - 23],
			[bucketX + 15, bucketY - 23],
			[bucketX + 10, bucketY],
			[bucketX - 9, bucketY]
		],
		rgb('7e8b89'),
		{ material: 'metal', angle: Math.PI / 2, detail: 0.88 }
	);
	c.ellipse('bucket', bucketX + 1, bucketY - 23, 14, 4, rgb('545d62'), {
		material: 'metal',
		detail: 0.9
	});
	const carry = placement.value() > 0.7;
	const readerX = placement.between(535, 596);
	const readerY = floorY + 99;
	const readerHeight = placement.between(119, 135);
	const chairX = readerX + 109;
	const chairY = readerY - 33;
	shadow(c, 'empty-chair-shadow', chairX, chairY, 57, 0.24);
	chair(c, 'empty-chair', chairX, chairY, 112, rgb('877765'), -1, 0.77);
	shadow(c, 'reader-shadow', readerX, readerY, 79, 0.26);
	chair(c, 'reader-chair', readerX, readerY, readerHeight, rgb('97775c'), 1, 0.81);
	figure(
		c,
		{
			id: 'reader',
			x: readerX,
			y: readerY,
			height: readerHeight,
			pose: 'sit',
			surface: 'reader-chair',
			activity: 'reading on the veranda'
		},
		{
			shirt: rgb('7f9a92'),
			trousers: rgb('5c555e'),
			skin: rgb('a67858'),
			direction: 1,
			depth: 0.81,
			prop: 'book'
		}
	);
	if (carry) {
		const x = placement.between(355, 406);
		const y = readerY + 37;
		shadow(c, 'bowl-carrier-shadow', x, y, 92, 0.31);
		figure(
			c,
			{
				id: 'bowl-carrier',
				x,
				y,
				height: 127,
				pose: 'carry',
				surface: 'courtyard-floor',
				activity: 'carrying a bowl across the floor'
			},
			{
				shirt: rgb('bd856d'),
				trousers: rgb('5f646c'),
				skin: rgb('aa785c'),
				direction: 1,
				depth: 0.89,
				prop: 'bowl'
			}
		);
	}
	return {
		horizon,
		vanishing: [openAt, horizon] as const,
		focal: { x: readerX + 39, y: readerY - 74, radius: 133 },
		weather,
		description: `A person reads in a chair on a shaded veranda in afternoon light. A second chair faces them beside an open doorway. Potted plants and a line of drying clothes catch the sun.${carry ? ' A person carries a bowl across the courtyard.' : ''}`
	};
}
