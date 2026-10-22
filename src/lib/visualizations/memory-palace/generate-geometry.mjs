/**
 * A compact cutaway house figure, built at authoring time with the vendored MIT
 * Anatomy kit (Copyright (c) 2026 Ryan; scripts/lib/openhie-anatomy/LICENSE).
 *
 * Concept: a fixed walk from the garden gate to the terrace provides twelve
 * distinct retrieval locations. Only the active marker changes; the house does
 * not rearrange itself when the learning material changes.
 *
 * Purposeful parts: foundation/coping/path/tiles/steps; gate piers/caps/rails/
 * pickets/hinges/latch; veranda plinth/posts/caps/balusters/handrails; rear wall/
 * cornice/window sills/frames/shutters/louvres; table legs/apron/top/drawer/pull;
 * armchair feet/seat/arms/back/cushions; bookcase sides/shelves/back/books;
 * dining legs/apron/top/chairs/place settings; stove carcass/oven/knobs/hob/
 * burners/pot; stair risers/treads/newels/handrail; upper deck/supports/parapet;
 * desk legs/top/pigeonholes/notebook/lamp; terrace planters/soil/stems/leaves.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../../../../scripts/lib/openhie-anatomy/iso-kit.mjs';
import * as A from '../../../../scripts/lib/openhie-anatomy/audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, 'geometry.json');
const WIDTH = 900;
const HEIGHT = 680;
const P = k.fitProjection(
	[
		...k.boxCorners({ x: -18, y: 16, w: 296, d: 326 }, -7, 0),
		...k.boxCorners({ x: 0, y: 18, w: 260, d: 80 }, 0, 176)
	],
	WIDTH,
	HEIGHT,
	{ pad: 44, azimuth: 43, elevation: 43 }
);
const R = A.recorder(P);
const materials = {
	stone: ['#e9dfc9', '#b3a588', '#c3b495', '#cdbd9d', '#d9c9ad'],
	plaster: ['#f4e8cd', '#b7a78a', '#c8b797', '#d7c7a6', '#e6d6b6'],
	timber: ['#a97851', '#4e3b2d', '#614630', '#765239', '#8d6242'],
	green: ['#718a79', '#304f45', '#3a5c4f', '#496b59', '#597a65'],
	ink: ['#5d6760', '#25382f', '#304238', '#3c4c42', '#4b5b50'],
	clay: ['#cc906f', '#87513e', '#9b6048', '#ad7155', '#bd8063'],
	paper: ['#fff6de', '#ccbda0', '#d7c7aa', '#e5d6b8', '#f2e5ca'],
	gold: ['#d3b271', '#8b6b3f', '#9e7b49', '#b28e54', '#c29d60']
};
const round = (n) => Math.round(n * 10) / 10;
const point = (v) => k.iso(v, P).map(round);
const path = (points, closed = false) =>
	k.pathOf(
		points.map((v) => k.iso(v, P)),
		closed
	);
const line = (points, colour = '#8e7c5d', width = 0.75, close = false) =>
	`<path d="${path(points, close)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
function paint(paths, material, inner = '') {
	const ramp = materials[material];
	return `<path d="${paths.fill}" fill="${ramp[1]}"/>${paths.shades.map((d, i) => (d ? `<path d="${d}" fill="${ramp[i + 1]}"/>` : '')).join('')}<path d="${paths.top}" fill="${ramp[0]}"/>${inner}<path d="${paths.crease}${paths.bevel ?? ''}" fill="none" stroke="#655d4b" stroke-opacity=".36" stroke-width=".65"/><path d="${paths.outline}" fill="none" stroke="#4f5142" stroke-opacity=".76" stroke-width=".8" stroke-linejoin="round"/>`;
}
function slab(id, x, y, w, d, z, h, material = 'plaster', options = {}) {
	const { r = Math.min(0.5, w / 4, d / 4), inner = '', piece = id.split('.')[0] } = options;
	const plan = { x, y, w, d, r };
	R.put({
		id,
		name: id,
		piece,
		at: [x + w / 2, y + d / 2, z + h / 2],
		shapes: [R.solid(A.slab(plan, z, h, { name: id }, 3))],
		svg: `<g data-house-part="${id}">${paint(k.slabOf(plan, z, h, P, 3, Math.min(h / 5, 0.45)), material, inner)}</g>`
	});
}
function disc(id, x, y, radius, z, h, material = 'ink', inner = '') {
	R.put({
		id,
		name: id,
		piece: id.split('.')[0],
		at: [x, y, z + h / 2],
		shapes: [R.solid(A.cylinder(x, y, radius, z, h, { name: id }))],
		svg: `<g data-house-part="${id}">${paint(k.cylinder(x, y, radius, z, h, P, 28), material, inner)}</g>`
	});
}
function legs(prefix, x, y, w, d, z, height, material = 'timber') {
	[
		[x, y],
		[x + w - 3, y],
		[x, y + d - 3],
		[x + w - 3, y + d - 3]
	].forEach(([px, py], i) => slab(`${prefix}.leg-${i}`, px, py, 3, 3, z, height, material));
}
function floorLines(x, y, w, d, z, step = 15) {
	const strokes = [
		line(
			[
				[x, y, z],
				[x + w, y, z],
				[x + w, y + d, z],
				[x, y + d, z]
			],
			'#a99b7e',
			0.52,
			true
		)
	];
	for (let px = x; px <= x + w; px += step)
		strokes.push(
			line(
				[
					[px, y, z],
					[px, y + d, z]
				],
				'#a99b7e',
				0.52
			)
		);
	for (let py = y; py <= y + d; py += step)
		strokes.push(
			line(
				[
					[x, py, z],
					[x + w, py, z]
				],
				'#a99b7e',
				0.52
			)
		);
	return strokes.join('');
}

// Solid masonry and paving. Inlaid floor rules are surface decoration, never
// stand-in solids; furniture feet rest on the actual supporting floor.
slab('foundation.block', -18, 16, 296, 326, -7, 7, 'stone', { r: 4 });
slab('foundation.path', 105, 246, 50, 87, 0, 0.8, 'stone', {
	inner: floorLines(105, 246, 50, 87, 0.8, 10)
});
slab('ground.plinth', -3, 21, 266, 230, 0, 20, 'stone', { r: 1.5 });
slab('ground.coping', -5, 19, 270, 234, 20, 6, 'plaster', {
	r: 1.4,
	inner: floorLines(0, 24, 260, 191, 26, 20)
});
slab('veranda.tiles', 0, 215, 260, 32, 26, 0.1, 'paper', {
	inner: floorLines(0, 215, 260, 32, 26.1, 8)
});
for (let i = 0; i < 4; i++)
	slab(`steps.tread-${i}`, 105, 253 + i * 8, 50, 8, 0, 20 - i * 5, 'stone');

// Garden gate, with two masonry piers and individually supported iron pickets.
for (const [i, x] of [99, 158].entries()) {
	slab(`gate.pier-${i}`, x, 305, 8, 9, 0, 37, 'plaster');
	slab(`gate.cap-${i}`, x - 1, 304, 10, 11, 37, 3, 'stone');
}
for (const [side, x, w] of [
	['left', 25, 74],
	['right', 166, 76]
]) {
	for (const z of [10, 28]) slab(`fence.${side}-rail-${z}`, x, 306.5, w, 1.5, z, 2, 'green');
	for (let i = 0; i <= 8; i++)
		slab(`fence.${side}-picket-${i}`, x + (i * (w - 1.5)) / 8, 308, 1.5, 1.5, 0, 34, 'green');
}
for (const z of [8, 28]) slab(`gate.rail-${z}`, 108, 306, 49, 2, z, 2, 'green');
for (let i = 0; i < 8; i++) slab(`gate.picket-${i}`, 108 + i * 6.7, 308, 1.3, 2, 0, 35, 'green');
for (const z of [8, 28]) slab(`gate.hinge-${z}`, 106.5, 307, 1.5, 4, z, 3, 'gold');
slab('gate.latch', 151, 310, 6, 2, 19, 2, 'gold');

// Veranda balustrade leaves the central stair entrance open.
for (const [side, x, w] of [
	['left', 9, 88],
	['right', 163, 89]
]) {
	slab(`veranda.${side}-rail`, x, 244, w, 3, 49, 3, 'timber');
	slab(`veranda.${side}-base`, x, 244, w, 3, 26.1, 3, 'plaster');
	for (let i = 0; i <= 10; i++)
		slab(
			`veranda.${side}-baluster-${i}`,
			x + (i * (w - 2)) / 10,
			244.4,
			2,
			2,
			29.1,
			19.9,
			'plaster'
		);
}
for (const [i, x] of [4, 97, 158, 252].entries()) {
	slab(`veranda.post-${i}`, x, 242, 5, 7, 26.1, 29.9, 'plaster');
	slab(`veranda.cap-${i}`, x - 0.5, 241.5, 6, 8, 56, 2, 'stone');
}

// The rear wall and upper platform deliberately leave the main ground floor
// open. The two removed exterior faces form the cutaway, rather than glass.
slab('wall.lower-back', 0, 18, 260, 6, 26, 94, 'plaster');
slab('wall.upper-back', 0, 18, 260, 6, 124, 46, 'plaster');
slab('wall.cornice', -2, 16, 264, 10, 170, 4, 'stone');
slab('upper.deck', 0, 24, 260, 71, 120, 4, 'stone', { inner: floorLines(0, 24, 260, 71, 124, 14) });
for (const [i, x] of [4, 167].entries()) {
	slab(`upper.support-base-${i}`, x - 1, 86, 8, 8, 26, 3, 'plaster');
	slab(`upper.support-${i}`, x + 0.5, 87.5, 5, 5, 29, 88, 'plaster');
	slab(`upper.support-cap-${i}`, x - 1, 86, 8, 8, 117, 3, 'stone');
}
// Three shuttered windows are assembled against the wall, with slats bounded
// by real rails rather than decorative lines ending in empty plaster.
for (const [window, x] of [22, 109, 199].entries()) {
	slab(`window${window}.recess`, x, 24, 30, 1, 134, 25, 'ink');
	slab(`window${window}.sill`, x - 3, 24, 36, 6, 131, 3, 'stone');
	for (const dx of [-2, 30])
		slab(`window${window}.jamb-${dx}`, x + dx, 24, 2, 3, 134, 25, 'timber');
	slab(`window${window}.head`, x - 2, 24, 34, 3, 159, 2, 'timber');
	for (const [shutter, dx] of [0, 16].entries()) {
		for (const edge of [0, 13])
			slab(
				`window${window}.shutter${shutter}-edge-${edge}`,
				x + dx + edge,
				25,
				1.5,
				2,
				134,
				25,
				'green'
			);
		for (let j = 0; j < 7; j++)
			slab(
				`window${window}.shutter${shutter}-slat-${j}`,
				x + dx + 1.5,
				25,
				11.5,
				2,
				134 + j * 3.6,
				1.8,
				'green'
			);
	}
}

// Entrance table: fitted drawer, brass pull, and a shallow tray.
legs('entrance', 18, 185, 39, 18, 26, 22);
slab('entrance.apron', 18, 185, 39, 18, 48, 3, 'timber');
slab('entrance.top', 16, 183, 43, 22, 51, 2, 'timber', { r: 1 });
slab('entrance.drawer', 21, 203, 30, 0.8, 46, 4, 'timber');
slab('entrance.pull', 33, 203.8, 7, 1.2, 47, 1.2, 'gold');
slab('entrance.tray', 23, 188, 17, 9, 53, 0.6, 'gold', { r: 1.5 });

// Upholstered armchair with separate legs, cushion, arms, and piped back.
legs('armchair', 73, 146, 33, 33, 26, 8);
slab('armchair.base', 71, 144, 37, 36, 34, 8, 'green', { r: 2 });
slab('armchair.cushion', 77, 150, 25, 27, 42, 5, 'paper', { r: 2 });
for (const x of [71, 103]) slab(`armchair.arm-${x}`, x, 144, 5, 36, 42, 13, 'green', { r: 2 });
slab('armchair.back', 76, 144, 27, 5, 42, 28, 'green', { r: 1.6 });
slab('armchair.back-pad', 78, 149, 23, 2, 48, 18, 'paper', { r: 1.3 });

// Bookcase, including individual book spines and the shelves supporting them.
slab('bookcase.back', 15, 106, 40, 2, 26, 63, 'timber');
for (const x of [15, 53]) slab(`bookcase.side-${x}`, x, 108, 2, 13, 26, 63, 'timber');
for (let shelf = 0; shelf < 4; shelf++) {
	const z = 26 + shelf * 20;
	slab(`bookcase.shelf-${shelf}`, 17, 108, 36, 13, z, 2, 'timber');
	if (shelf < 3)
		for (let book = 0; book < 7; book++) {
			const h = 12 + ((book * 7 + shelf * 3) % 6);
			const x = 18 + book * 4.8;
			slab(
				`bookcase.book-${shelf}-${book}`,
				x,
				110,
				3.6,
				10,
				z + 2,
				h,
				['paper', 'green', 'clay', 'gold'][book % 4],
				{
					inner: line(
						[
							[x, 120, z + 5],
							[x + 3.6, 120, z + 5]
						],
						'#e3d4af',
						0.6
					)
				}
			);
		}
}
slab('bookcase.cap', 13, 104, 44, 19, 89, 2, 'timber');

// Dining table and two chairs stand clear of the walking route.
legs('dining', 129, 156, 48, 33, 26, 26);
slab('dining.apron', 129, 156, 48, 33, 48, 4, 'timber');
slab('dining.top', 126, 153, 54, 39, 52, 3, 'timber', { r: 2 });
slab('dining.runner', 144, 153, 15, 39, 55, 0.1, 'paper');
for (const [i, y] of [158, 183].entries()) {
	disc(`dining.plate-${i}`, 151.5, y, 5.2, 55.1, 0.5, 'paper');
	disc(`dining.cup-${i}`, 166, y, 2.3, 55, 3.8, 'green');
}
for (const [i, x] of [109, 185].entries()) {
	legs(`chair${i}`, x, 161, 14, 20, 26, 15);
	slab(`chair${i}.seat`, x - 1, 160, 16, 22, 41, 2, 'timber');
	slab(`chair${i}.back`, x + (i ? 12 : -1), 160, 3, 22, 43, 20, 'timber');
}

// Stove: a recognisable oven, two burners, control knobs, and a lidded pot.
legs('stove', 169, 103, 36, 29, 26, 5, 'ink');
slab('stove.body', 169, 103, 36, 29, 31, 28, 'paper');
slab('stove.hob', 168, 102, 38, 31, 59, 2, 'ink');
slab('stove.oven-frame', 172, 132, 30, 1, 34, 18, 'ink');
slab('stove.oven-glass', 176, 133, 22, 0.4, 37, 11, 'green');
slab('stove.oven-pull', 177, 133.4, 20, 1, 49, 1.3, 'gold');
for (const x of [176, 186, 196]) disc(`stove.knob-${x}`, x, 129, 1.4, 61, 1.4, 'gold');
for (const x of [178, 196]) {
	disc(`stove.burner-${x}`, x, 114, 5.2, 61, 0.5, 'ink');
	disc(`stove.ring-${x}`, x, 114, 3, 61.5, 0.4, 'gold');
}
disc('stove.pot', 178, 114, 5.5, 61.9, 7, 'clay');
disc('stove.lid', 178, 114, 6, 68.9, 0.8, 'clay');
disc('stove.lid-knob', 178, 114, 1.2, 69.7, 1.8, 'ink');

// Ten supported masonry steps rise to the upper landing. The open inner edge
// makes their ordering visible; a real newel anchors the short top handrail.
for (let i = 0; i < 10; i++) {
	const top = 124 - i * 9.8;
	slab(`stair.step-${i}`, 218, 95 + i * 9.5, 40, 9.5, 26, top - 26, 'stone', {
		inner: line(
			[
				[218, 95 + i * 9.5, top],
				[258, 95 + i * 9.5, top]
			],
			'#f8edcf',
			1
		)
	});
}
slab('landing.mat', 219, 65, 36, 25, 124, 0.1, 'green', {
	inner: floorLines(219, 65, 36, 25, 124.1, 5)
});
slab('landing.newel', 257, 87, 3, 8, 124, 24, 'timber');
slab('landing.rail', 257, 24, 3, 63, 146, 2, 'timber');
for (let i = 0; i < 7; i++)
	slab(`landing.baluster-${i}`, 257.5, 25 + i * 9, 2, 2, 124, 22, 'timber');

// Study desk: open pigeonholes, a notebook, and a small brass reading lamp.
legs('desk', 117, 40, 46, 26, 124, 23);
slab('desk.apron', 117, 40, 46, 26, 144, 3, 'timber');
slab('desk.top', 114, 37, 52, 32, 147, 2, 'timber', { r: 1 });
slab('desk.pigeon-base', 118, 38, 44, 7, 149, 1, 'timber');
for (const x of [118, 132, 147, 161]) slab(`desk.divider-${x}`, x, 38, 1, 7, 150, 8, 'timber');
slab('desk.pigeon-top', 118, 38, 44, 7, 158, 1, 'timber');
slab('desk.notebook', 132, 49, 18, 15, 149, 0.6, 'paper', {
	inner: line(
		[
			[141, 49, 149.6],
			[141, 64, 149.6]
		],
		'#b4a17d',
		0.7
	)
});
disc('desk.lamp-base', 156, 57, 3.5, 149, 1.3, 'gold');
disc('desk.lamp-stem', 156, 57, 0.7, 150.3, 10, 'gold');
disc('desk.lamp-shade', 156, 57, 4.1, 160.3, 2.8, 'green');

// Terrace parapet and clay planters; paired planar leaves are actual small
// solids, with every stem physically seated in a pot of soil.
slab('terrace.parapet', 0, 24, 4, 71, 124, 20, 'plaster');
slab('terrace.coping', -1, 24, 6, 72, 144, 2, 'stone');
for (const [i, [x, y, radius]] of [
	[18, 41, 5.5],
	[18, 77, 6.5],
	[75, 41, 5]
].entries()) {
	disc(`planter${i}.pot`, x, y, radius, 124, 9, 'clay');
	disc(`planter${i}.rim`, x, y, radius + 0.7, 133, 1.5, 'clay');
	disc(`planter${i}.soil`, x, y, radius - 0.7, 134.5, 0.1, 'timber');
	slab(`planter${i}.stem`, x - 0.6, y - 0.6, 1.2, 1.2, 134.6, 15, 'green');
	for (let j = 0; j < 3; j++) {
		const z = 139 + j * 3.5;
		slab(
			`planter${i}.leaf-left-${j}`,
			x - 6.5 + j * 0.5,
			y - 1.6,
			6.5 - j * 0.5,
			3.2,
			z,
			0.8,
			'green',
			{ r: 1.5 }
		);
		slab(`planter${i}.leaf-right-${j}`, x + 0.6, y - 1.6, 6 - j * 0.5, 3.2, z + 1, 0.8, 'green', {
			r: 1.5
		});
	}
}
slab('terrace.rug', 34, 43, 32, 35, 124, 0.1, 'paper', {
	inner: floorLines(34, 43, 32, 35, 124.1, 4)
});

const identifiers = new Set();
for (const part of R.items) {
	if (identifiers.has(part.id)) throw new Error(`Duplicate memory house part: ${part.id}`);
	identifiers.add(part.id);
}
// Exact overlapping surface depths determine painter order. No round pipework
// or moving assemblies exist in this architectural figure.
A.settle(R, P, { states: [0] });
R.items.sort((a, b) => a.key - b.key);
if (process.argv.includes('--audit')) {
	const result = A.depthOrder(R.settled.items, P, {
		overlaps: R.settled.overlaps,
		solved: R.settled.solved
	});
	if (result.problems.length || result.missing.length)
		throw new Error(`Memory house depth audit failed: ${JSON.stringify(result)}`);
	console.log(`Memory house depth audit passed: ${R.items.length} purposeful solids.`);
}

const locations = [
	['Garden gate', [131, 330, 12]],
	['Front steps', [131, 270, 21]],
	['Veranda', [72, 227, 35]],
	['Entrance table', [39, 190, 68]],
	['Armchair', [89, 163, 80]],
	['Bookshelf', [35, 115, 102]],
	['Dining table', [152, 173, 73]],
	['Stove', [188, 117, 84]],
	['Staircase', [240, 172, 64]],
	['Landing', [237, 75, 136]],
	['Study desk', [140, 57, 173]],
	['Terrace', [52, 62, 136]]
].map(([name, at]) => ({ name, at, point: point(at) }));
const route = k.pathOf(locations.map((location) => location.point));
const result = {
	width: WIDTH,
	height: HEIGHT,
	art: R.items.map((part) => part.svg).join(''),
	route,
	locations,
	metadata: {
		purposefulSolids: R.items.length,
		projection: P,
		generator: 'src/lib/visualizations/memory-palace/generate-geometry.mjs',
		license: 'MIT; Copyright (c) 2026 Ryan; scripts/lib/openhie-anatomy/LICENSE',
		depthSorted: true,
		architecture: 'Illustrative Calcutta house; twelve fixed loci across two levels.'
	}
};
const encoded = `${JSON.stringify(result)}\n`;
if (process.argv.includes('--check')) {
	if (readFileSync(OUTPUT, 'utf8').replace(/\r\n/gu, '\n') !== encoded)
		throw new Error('Memory house geometry is stale. Regenerate it.');
	console.log(`Memory house geometry current: ${R.items.length} solids and twelve landmarks.`);
} else {
	writeFileSync(OUTPUT, encoded);
	console.log(`Memory house geometry generated: ${R.items.length} solids and twelve landmarks.`);
}
