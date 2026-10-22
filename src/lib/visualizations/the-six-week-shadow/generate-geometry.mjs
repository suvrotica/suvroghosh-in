/**
 * Authoring-time, model-independent physical geometry. See feature document for
 * concept and parts plan. MIT Anatomy kit: Copyright (c) 2026 Ryan; repository
 * scripts/lib/openhie-anatomy/LICENSE. No skill path is used at build/runtime.
 * node src/lib/visualizations/the-six-week-shadow/generate-geometry.mjs [--check] [--preview]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../../../../scripts/lib/openhie-anatomy/iso-kit.mjs';
import * as A from '../../../../scripts/lib/openhie-anatomy/audit.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 1080,
	HEIGHT = 600;
const FLOOR = { x: -250, y: -120, w: 500, d: 260, r: 5 };
const P = k.fitProjection([...k.boxCorners(FLOOR, -15, 0), [-165, -65, 120]], WIDTH, HEIGHT, {
	pad: 45,
	azimuth: 55,
	elevation: 32
});
// Only the four actual rubber feet contact the ground; every other solid must
// reach them through real flush contacts recorded from the rendered geometry.
const R = A.recorder(P, { order: [], ground: (shape) => shape.name?.startsWith('foot-') });
const at = (p) => k.iso(p, P);
const L = (d, style = {}) => k.lineSvg(d, style);
const closed = (plan, z, inset = 2) =>
	L(k.planOutline(k.insetPlan(plan, inset), z, P), { tone: 'faint' });
function screws(plan, z, inset = 4) {
	return (
		L(
			k
				.corners(plan, inset)
				.map(([x, y]) => k.ring(x, y, 1.5, z, P, 16))
				.join(''),
			{ tone: 'lo' }
		) +
		k.dotsSvg(
			k.corners(plan, inset).map(([x, y]) => at([x, y, z])),
			{ size: 0.45 }
		)
	);
}
function slab(id, area, plan, z, height, { tone = 'mid', inner = '', ...style } = {}) {
	R.put({
		id,
		name: id,
		area,
		piece: area,
		at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + height / 2],
		move: [0, 0, 0],
		shapes: [R.solid(A.slab(plan, z, height, { name: id }, 8))],
		svg: k.solidSvg(k.slabOf(plan, z, height, P, 8, Math.min(0.6, height / 4)), {
			tone,
			inner,
			...style
		})
	});
}
function round(id, area, x, y, radius, z, height, { tone = 'mid', inner = '', ...style } = {}) {
	R.put({
		id,
		name: id,
		area,
		piece: area,
		at: [x, y, z + height / 2],
		move: [0, 0, 0],
		shapes: [R.solid(A.cylinder(x, y, radius, z, height, { name: id }))],
		svg: k.solidSvg(k.cylinder(x, y, radius, z, height, P, 64, Math.min(0.4, height / 4)), {
			tone,
			inner,
			...style
		})
	});
}
function box(id, area, x, y, w, d, z, height, tone = 'mid', inner = '') {
	slab(id, area, { x, y, w, d, r: Math.min(1.5, w / 5, d / 5) }, z, height, { tone, inner });
}
// Continuous, supported stage: a compact desk and two fitted foldout leaves.
for (const [i, [x, y]] of k.corners(FLOOR, 18).entries())
	round(`foot-${i}`, 'stage', x, y, 7, -15, 7, { tone: 'lo' });
for (const [i, [x, w]] of [
	[-250, 155],
	[-95, 170],
	[75, 175]
].entries()) {
	const plan = { x, y: -120, w, d: 260, r: 3 };
	slab(`floor-${i}`, 'stage', plan, -8, 8, {
		tone: i ? 'lo' : 'mid',
		inner: closed(plan, 0, 4) + screws(plan, 0, 10)
	});
}
for (const [i, x] of [-99, 71].entries())
	for (const [j, y] of [-118, 100].entries()) {
		box(`hinge-${i}-${j}`, 'stage', x, y, 8, 15, 0, 1, 'mid');
		round(`hinge-pin-${i}-${j}`, 'stage', x + 4, y + 7.5, 1.5, 1, 1, { tone: 'hi' });
	}
for (const [i, y] of [119, 130].entries())
	box(`front-rail-${i}`, 'stage', -236, y, 472, 3, 0, 3, 'mid');
for (const [i, x] of [-241, 236].entries())
	box(`rail-stop-${i}`, 'stage', x, 115, 5, 21, 0, 6, 'mid');
// Lamp: weighted foot, fitted stem, shade, diffuser and two alternate switch seats.
round('lamp-foot', 'lamp', -177, -61, 35, 0, 3, { tone: 'lo' });
round('lamp-base', 'lamp', -177, -61, 32, 3, 7, {
	tone: 'hi',
	inner: L(k.ring(-177, -61, 27, 10, P, 64), { tone: 'lo' })
});
round('lamp-base-inset', 'lamp', -177, -61, 25, 10, 0.8, { tone: 'hi' });
round('lamp-socket', 'lamp', -185, -65, 8, 10.8, 5, {
	tone: 'mid',
	inner: L(k.ring(-185, -65, 5, 15.8, P, 32), { tone: 'lo' })
});
round('lamp-stem', 'lamp', -185, -65, 3.5, 15.8, 67.2, { tone: 'hi' });
box('lamp-neck', 'lamp', -190, -71, 45, 12, 83, 6, 'mid');
round('lamp-shade-collar', 'lamp', -151, -65, 7, 89, 2, { tone: 'mid' });
round('lamp-shade', 'lamp', -151, -65, 25, 93, 21, {
	tone: 'hi',
	inner: L([98, 110].map((z) => k.sideArc(-151, -65, 25, z, P, 48)).join(''), { tone: 'faint' })
});
round('lamp-shade-cap', 'lamp', -151, -65, 26, 114, 2, {
	tone: 'hi',
	inner: L(k.ring(-151, -65, 21, 116, P, 64), { tone: 'lo' })
});
round('lamp-diffuser', 'lamp', -151, -65, 24, 91, 2, { tone: 'lo' });
round('old-button-seat', 'lamp', -144, -65, 5, 116, 1, { tone: 'mid' });
round('old-button', 'old-button', -144, -65, 3.5, 117, 2, { tone: 'hi', lit: true });
round('base-button-seat', 'lamp', -158, -61, 5, 10.8, 1, { tone: 'mid' });
round('base-button', 'base-button', -158, -61, 3.5, 11.8, 2, { tone: 'hi', lit: true });
for (const [i, [x, y]] of [
	[-196, -75],
	[-170, -83],
	[-198, -49],
	[-174, -39]
].entries())
	round(`lamp-fixing-${i}`, 'lamp', x, y, 1, 10, 0.8, { tone: 'mid' });
// Drawing clipped to its desk. Rule lines are printed marks, correctly free.
const drawing = { x: -230, y: 8, w: 104, d: 76, r: 1 };
slab('drawing-board', 'drawing', drawing, 0, 2, { tone: 'lo' });
slab('drawing-paper', 'drawing', { ...drawing, x: -226, y: 12, w: 96, d: 68 }, 2, 0.6, {
	tone: 'hi',
	inner:
		closed({ x: -211, y: 22, w: 36, d: 34, r: 1 }, 2.6, 0) +
		L(k.ring(-194, 39, 10, 2.6, P, 40), { tone: 'lo' }) +
		L([24, 30, 36, 42].map((y) => k.lineOnTop([-167, y], [-139, y], 2.6, P)).join(''), {
			tone: 'lo',
			free: true
		})
});
for (const [i, x] of [-226, -142].entries())
	box(`paper-clip-${i}`, 'drawing', x, 9, 12, 7, 2.6, 1.6, 'mid');
box('pencil-body', 'drawing', -239, 14, 4, 57, 0, 3, 'hi');
box('pencil-end', 'drawing', -239, 71, 4, 5, 0, 3, 'mid');
// Sample bench, with distinct top and feet; no floating sample.
box('sample-mount', 'sample', -98, -101, 67, 69, 0, 4, 'lo');
for (const [i, x] of [-94, -42].entries())
	box(`sample-cheek-${i}`, 'sample', x, -97, 7, 61, 4, 18, 'mid');
box('sample-worktop', 'sample', -98, -101, 67, 69, 22, 4, 'hi');
round('sample-base', 'sample', -64, -67, 22, 26, 5, {
	tone: 'hi',
	inner: L(k.ring(-64, -67, 17, 31, P, 48), { tone: 'lo' })
});
round('sample-opening', 'sample', -53, -64, 4, 31, 0.6, { tone: 'lo' });
for (const [i, x] of [-94, -40].entries())
	box(`sample-clamp-${i}`, 'sample', x, -76, 5, 18, 26, 5, 'mid');
// Crate and booking stop; open slats make the waiting object read as a tray.
box('supplier-mount', 'supplier', -14, -106, 74, 69, 0, 4, 'lo');
box('crate-bottom', 'supplier', -10, -101, 66, 58, 4, 3, 'hi');
for (const [i, y] of [-101, -47].entries())
	box(`crate-rail-${i}`, 'supplier', -10, y, 66, 4, 7, 25, 'mid');
for (const [i, x] of [-10, 21, 52].entries())
	box(`crate-slat-${i}`, 'supplier', x, -97, 4, 50, 7, 12, 'hi');
for (const [i, x] of [-10, 52].entries())
	box(`crate-post-${i}`, 'supplier', x, -101, 4, 58, 32, 3, 'hi');
box(
	'crate-lid',
	'supplier',
	-10,
	-101,
	66,
	58,
	35,
	3,
	'hi',
	closed({ x: -10, y: -101, w: 66, d: 58, r: 1 }, 38, 4)
);
box(
	'slot-ticket',
	'supplier',
	9,
	-88,
	30,
	24,
	38,
	0.6,
	'mid',
	L([0, 1, 2].map((i) => k.lineOnTop([14, -82 + i * 5], [34, -82 + i * 5], 38.6, P)).join(''), {
		tone: 'hi',
		free: true
	})
);
box('booking-stop', 'supplier', -12, -37, 72, 5, 4, 12, 'mid');
// Production fixture and a checked pilot on a separate raised platform.
box('production-mount', 'production', 82, -104, 83, 75, 0, 5, 'lo');
for (const [i, x] of [88, 150].entries())
	box(`fixture-foot-${i}`, 'production', x, -98, 9, 63, 5, 6, 'mid');
for (const [i, y] of [-93, -49].entries())
	box(`fixture-rail-${i}`, 'production', 88, y, 71, 5, 11, 5, 'hi');
for (const [i, x] of [92, 146].entries())
	box(`fixture-jaw-${i}`, 'production', x, -88, 9, 39, 16, 12, 'mid');
box('fixture-crosspiece', 'production', 92, -88, 63, 6, 28, 4, 'hi');
for (const [i, x] of [96, 151].entries())
	round(`fixture-fixing-${i}`, 'production', x, -85, 2, 32, 2, { tone: 'mid' });
round('pilot-base', 'production', 124, -67, 19, 16, 5, {
	tone: 'hi',
	inner: L(k.ring(124, -67, 14, 21, P, 40), { tone: 'lo' })
});
box('setup-insert', 'production', 106, -43, 35, 8, 5, 3, 'hi');
// Separate shelf for parallel documents: real cards rest in clips.
for (const [i, x] of [-99, 74].entries())
	box(`documents-cheek-${i}`, 'documents', x, 15, 6, 79, 0, 16, 'mid');
box('documents-shelf', 'documents', -99, 15, 179, 79, 16, 4, 'lo');
box('documents-backstop', 'documents', -99, 15, 179, 4, 20, 12, 'mid');
for (const [i, x] of [-89, -47, -5, 37].entries()) {
	const p = { x, y: 29, w: 33, d: 52, r: 1 };
	slab(`document-card-${i}`, i === 3 ? 'support' : 'documents', p, 20, 1, {
		tone: 'hi',
		inner:
			closed(p, 21, 3) +
			L(
				[0, 1, 2]
					.map((n) => k.lineOnTop([x + 7, 57 + n * 6], [x + 26, 57 + n * 6], 21, P))
					.join(''),
				{ tone: 'lo', free: true }
			)
	});
	box(`document-clip-${i}`, i === 3 ? 'support' : 'documents', x + 9, 26, 15, 7, 21, 2, 'mid');
}
// Packing insert, fitted parcel and two flush closed bands on a shelf.
box('packing-mount', 'packing', 110, 21, 115, 77, 0, 6, 'lo');
box('packing-shelf', 'packing', 110, 21, 115, 77, 6, 3, 'mid');
for (const [i, y] of [21, 94].entries())
	box(`packing-stop-${i}`, 'packing', 110, y, 115, 4, 9, 9, 'mid');
box(
	'packing-insert',
	'packing',
	118,
	31,
	38,
	53,
	9,
	3,
	'hi',
	closed({ x: 118, y: 31, w: 38, d: 53, r: 1 }, 12, 5)
);
box('parcel-body', 'packing', 165, 35, 49, 49, 9, 22, 'hi');
for (const [i, x] of [174, 198].entries())
	box(`parcel-band-${i}`, 'packing', x, 35, 3, 49, 31, 0.4, 'lo');
box(
	'release-card',
	'packing',
	169,
	45,
	34,
	23,
	31.4,
	0.5,
	'hi',
	L(k.lineOnTop([175, 56], [197, 56], 31.9, P), { tone: 'lo', free: true })
);
// Identity inlays support HTML numbered pins; engraving is a closed inset.
const anchors = {
	A: [-218, 90, 0],
	B: [-66, -23, 0],
	C: [3, -24, 0],
	D: [43, -24, 0],
	E: [124, -17, 0],
	F: [180, -31, 0],
	G: [180, -18, 0],
	H: [191, 106, 0],
	I: [-30, 103, 0],
	J: [55, 103, 0]
};
for (const [id, [x, y, z]] of Object.entries(anchors))
	box(`identity-${id}`, 'stage', x - 9, y - 5, 18, 10, z, 1, 'mid');

A.settle(R, P, { states: [0, 0.25, 0.5, 0.75, 1] });
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P, { frames: [0, 0.25, 0.5, 0.75, 1], apart: true });
if (process.exitCode) process.exit(process.exitCode);
const svg = R.items.map(({ id, area, svg }) => ({ id, area, svg }));
const geometry = {
	width: WIDTH,
	height: HEIGHT,
	parts: svg,
	crops: Object.fromEntries(
		['lamp', 'drawing', 'sample', 'supplier', 'production', 'documents', 'support', 'packing'].map(
			(area) => {
				const [x0, y0, x1, y1] = A.markupBox(
					svg
						.filter((part) => part.area === area)
						.map((part) => part.svg)
						.join('')
				);
				return [area, `${x0 - 12} ${y0 - 12} ${x1 - x0 + 24} ${y1 - y0 + 24}`];
			}
		)
	),
	partCount: R.solids.length,
	markers: Object.fromEntries(Object.entries(anchors).map(([id, p]) => [id, at(p)])),
	lampViewBox: '45 70 430 425',
	metadata: {
		generator: 'src/lib/visualizations/the-six-week-shadow/generate-geometry.mjs',
		kit: 'Anatomy — https://github.com/wheresryan22/anatomy',
		license: 'MIT; Copyright (c) 2026 Ryan',
		scope:
			'Static physical geometry. Model-derived time bands are rendered separately at one constant scale.'
	}
};
const encoded = JSON.stringify(geometry) + '\n';
const output = resolve(HERE, 'geometry.json');
if (process.argv.includes('--check')) {
	if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== encoded) {
		console.error('Shadow geometry is stale.');
		process.exitCode = 1;
	} else console.log(`Shadow geometry current: ${R.solids.length} purposeful solids.`);
} else {
	writeFileSync(output, encoded);
	console.log(`Shadow geometry generated: ${R.solids.length} purposeful solids.`);
}
if (process.argv.includes('--preview')) {
	const dir = resolve(HERE, '../../../../.codex-artifacts/the-six-week-shadow');
	mkdirSync(dir, { recursive: true });
	for (const theme of ['light', 'dark'])
		writeFileSync(
			resolve(dir, `geometry-${theme}.html`),
			`<!doctype html><html><head><meta charset="utf-8"><style>${k.ISO_CSS}body{margin:0;background:${theme === 'light' ? '#f8f5ee' : '#141617'}}svg{display:block;width:100%;height:auto}</style></head><body><div class="iso iso-plate" data-theme="${theme}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">${svg.map((p) => p.svg).join('')}</svg></div></body></html>`
		);
}
