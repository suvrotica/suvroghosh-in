/**
 * Specimen cabinet: authoring-time geometry using the repository's existing MIT
 * Anatomy kit (Copyright (c) 2026 Ryan; scripts/lib/openhie-anatomy/LICENSE).
 * The same convex shape produces both artwork and audit input. No browser kit.
 * Drawers slide 66 units while retaining 27 units of fitted rail engagement.
 * node src/lib/visualizations/the-museum-of-almost/generate-geometry.mjs --audit
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../../../../scripts/lib/openhie-anatomy/iso-kit.mjs';
import * as A from '../../../../scripts/lib/openhie-anatomy/audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const OUTPUT = join(HERE, 'geometry.json');
const WIDTH = 800;
const HEIGHT = 610;
const IDS = ['lamp', 'recorder', 'planter', 'page'];
const TRAVEL = 66;
const P = k.fitProjection(
	[
		...k.boxCorners({ x: -108, y: -26, w: 216, d: 112 }, 0, 154),
		...k.boxCorners({ x: -106, y: 165, w: 212, d: 52 }, 0, 35)
	],
	WIDTH,
	HEIGHT,
	{ pad: 38, azimuth: 62, elevation: 28 }
);
const R = A.recorder(P);
const L = (d, options = {}) => k.lineSvg(d, options);
const point = (v) => k.iso(v, P);
function slab(id, piece, x, y, w, d, z, h, options = {}) {
	const {
		tone = 'mid',
		r = Math.min(0.7, w / 5, d / 5),
		inner = '',
		part = '',
		...style
	} = options;
	const plan = { x, y, w, d, r };
	R.put({
		id,
		name: id,
		piece,
		part,
		at: [x + w / 2, y + d / 2, z + h / 2],
		move: IDS.includes(piece) ? [0, TRAVEL, 0] : [0, 0, 0],
		shapes: [R.solid(A.slab(plan, z, h, { name: id }, 4))],
		svg: k.solidSvg(k.slabOf(plan, z, h, P, 4, Math.min(h / 4, 0.5)), { tone, inner, ...style })
	});
}
function disc(id, piece, x, y, radius, z, h, options = {}) {
	const { part = '', ...style } = options;
	R.put({
		id,
		name: id,
		piece,
		part,
		at: [x, y, z + h / 2],
		move: IDS.includes(piece) ? [0, TRAVEL, 0] : [0, 0, 0],
		shapes: [R.solid(A.cylinder(x, y, radius, z, h, { name: id }))],
		svg: k.solidSvg(k.cylinder(x, y, radius, z, h, P, 40, Math.min(h / 4, 0.4)), style)
	});
}
function rules(x, y, w, z) {
	return L(
		[0, 3, 6]
			.map((step, i) => k.lineOnTop([x, y + step], [x + w - i * 5, y + step], z, P))
			.join(''),
		{ tone: 'lo', free: true }
	);
}
function labelOnFront(x, y, z, w) {
	return L([0, 2.5].map((step) => k.segment([x, y, z + step], [x + w, y, z + step], P)).join(''), {
		tone: 'lo',
		free: true
	});
}
function capFasteners() {
	const points = [
		[-98, -16],
		[98, -16],
		[-98, 80],
		[98, 80]
	];
	return (
		L(points.map(([x, y]) => k.ring(x, y, 1.2, 154, P, 16)).join(''), { tone: 'lo' }) +
		k.dotsSvg(
			points.map(([x, y]) => point([x, y, 154])),
			{ size: 0.4, tone: 'mid' }
		)
	);
}

// Feet are the actual floor contacts. Everything else has a path to them.
for (const [i, [x, y]] of [
	[-98, -16],
	[88, -16],
	[-98, 67],
	[88, 67]
].entries())
	slab(`stand.foot-${i}`, 'case', x, y, 10, 10, 0, 8, { tone: 'lo' });
slab('case.plinth', 'case', -108, -26, 216, 116, 8, 8, { r: 2, tone: 'lo' });
slab('case.back', 'case', -102, -24, 204, 6, 16, 132, { tone: 'lo' });
slab('case.left', 'case', -102, -18, 6, 102, 16, 132);
slab('case.right', 'case', 96, -18, 6, 102, 16, 132);
slab('case.cap', 'case', -108, -26, 216, 116, 148, 6, {
	tone: 'hi',
	r: 1.8,
	inner: capFasteners()
});

for (let i = 0; i < IDS.length; i++) {
	const id = IDS[i];
	const z = 20 + (3 - i) * 32;
	for (const [side, x] of [
		['left', -96],
		['right', 88]
	]) {
		slab(`case.${id}-${side}-rail`, 'case', x, -18, 8, 96, z - 3, 3, { tone: 'lo' });
		slab(`case.${id}-${side}-stop`, 'case', x, -18, 8, 3, z, 4, { tone: 'hi' });
	}
	// Bottom meets rails; walls, rear and front meet the bottom without sinking.
	slab(`${id}.bottom`, id, -91, -15, 182, 93, z, 3, { tone: 'hi' });
	slab(`${id}.left`, id, -91, -15, 3, 93, z + 3, 22);
	slab(`${id}.right`, id, 88, -15, 3, 93, z + 3, 22);
	slab(`${id}.rear`, id, -88, -15, 176, 3, z + 3, 22, { tone: 'lo' });
	slab(`${id}.front`, id, -94, 78, 188, 6, z, 27, { tone: 'hi', r: 0.8 });
	slab(`${id}.liner`, id, -88, -12, 176, 90, z + 3, 0.35, { tone: 'hi', r: 0.1 });
	for (const [side, x] of [
		['left', -22],
		['right', 18]
	])
		slab(`${id}.handle-${side}`, id, x, 84, 4, 5, z + 9, 5, { tone: 'lo' });
	slab(`${id}.handle`, id, -22, 89, 44, 3, z + 9, 5, { tone: 'mid', r: 1 });
	slab(`${id}.label-holder`, id, -72, 84, 36, 0.7, z + 9, 12, {
		tone: 'lo',
		r: 0.1,
		inner: labelOnFront(-69, 84.71, z + 13, 28)
	});
	// A tabbed record card sits flat in its own area of the liner.
	slab(`${id}.record`, id, 39, 20, 39, 45, z + 3.35, 0.35, {
		tone: 'hi',
		inner: rules(43, 25, 28, z + 3.7)
	});
	slab(`${id}.record-tab`, id, 43, 15, 16, 5, z + 3.35, 0.35, { tone: 'hi' });
	const top = z + 3.35;
	if (id === 'lamp') {
		// Flat-pack lamp laid in its tray: shade, mast, base and connector pieces.
		disc('lamp.shade', id, -51, 8, 16, top, 6, { tone: 'hi' });
		disc('lamp.shade-inset', id, -51, 8, 12, top + 6, 0.7, { tone: 'lo' });
		slab('lamp.mast', id, -28, -1, 8, 62, top, 3, { tone: 'hi' });
		slab('lamp.base', id, -76, 36, 35, 31, top, 3, { tone: 'hi', r: 3 });
		slab('lamp.connector-a', id, -10, 14, 17, 14, top, 6, { tone: 'hi', part: 'lamp-connector' });
		slab('lamp.connector-b', id, 10, 14, 17, 14, top, 6, { tone: 'hi', part: 'lamp-connector' });
		slab('lamp.contact-a', id, -5, 18, 7, 6, top + 6, 1, { tone: 'lo', part: 'lamp-connector' });
		slab('lamp.contact-b', id, 15, 18, 7, 6, top + 6, 1, { tone: 'lo', part: 'lamp-connector' });
	}
	if (id === 'recorder') {
		slab('recorder.body', id, -65, -2, 65, 69, top, 9, { tone: 'hi', r: 4 });
		slab('recorder.screen', id, -55, 9, 45, 18, top + 9, 0.5, { tone: 'lo', r: 1 });
		for (let j = 0; j < 3; j++)
			disc(`recorder.control-${j}`, id, -44 + j * 10, 43, 3, top + 9, 1.5, {
				tone: 'mid',
				part: 'recorder-controls'
			});
		slab('recorder.grille', id, -55, 1, 45, 4, top + 9, 0.5, { tone: 'lo', r: 1 });
	}
	if (id === 'planter') {
		slab('planter.object-bottom', id, -69, 0, 62, 58, top, 3, { tone: 'hi', r: 2 });
		slab('planter.object-back', id, -66, 0, 56, 3, top + 3, 14, { tone: 'hi' });
		slab('planter.object-left', id, -69, 0, 3, 58, top + 3, 14, { tone: 'mid' });
		slab('planter.object-right', id, -10, 0, 3, 58, top + 3, 14, { tone: 'mid' });
		slab('planter.object-front', id, -66, 55, 56, 3, top + 3, 14, {
			tone: 'hi',
			part: 'planter-seam'
		});
		slab('planter.seam', id, -66, 58, 1.2, 0.3, top + 3, 14, {
			tone: 'lo',
			part: 'planter-seam',
			r: 0.05
		});
		disc('planter.water-mark', id, -65, 64, 2.3, top, 0.05, { tone: 'lo', part: 'planter-seam' });
	}
	if (id === 'page') {
		slab('page.frame', id, -75, -3, 81, 74, top, 3, { tone: 'lo', r: 2 });
		slab('page.paper', id, -71, 1, 73, 66, top + 3, 0.5, {
			tone: 'hi',
			inner: rules(-65, 13, 58, top + 3.5)
		});
		slab('page.offer', id, -64, 31, 59, 15, top + 3.5, 0.3, { tone: 'mid', r: 0.2 });
		slab('page.purchase', id, -53, 51, 37, 8, top + 3.5, 0.6, {
			tone: 'hi',
			part: 'page-purchase',
			r: 1
		});
	}
}

// Shallow supported inspection bench, parked clear of every drawer's travel.
for (const [i, [x, y]] of [
	[-95, 169],
	[85, 169],
	[-95, 204],
	[85, 204]
].entries())
	slab(`stand.bench-foot-${i}`, 'bench', x, y, 10, 10, 0, 26, { tone: 'lo' });
slab('bench.top', 'bench', -106, 165, 212, 52, 26, 5, { tone: 'hi', r: 2 });
slab('bench.paper', 'bench', -92, 172, 184, 37, 31, 0.4, {
	tone: 'hi',
	inner: rules(48, 177, 33, 31.4)
});

// These IDs key both Svelte's each block and owned moving DOM refs. A collision
// would prevent the runtime from mounting even when all shapes are valid.
const partIds = new Set();
for (const part of R.items) {
	if (partIds.has(part.id)) throw new Error(`Duplicate Museum geometry part ID: ${part.id}`);
	partIds.add(part.id);
}

const states = [
	0,
	...IDS.flatMap((id) => Array.from({ length: 13 }, (_, i) => ({ shares: { [id]: i / 12 } })))
];
A.settle(R, P, { states });
R.items.sort((a, b) => a.key - b.key);
const audit = A.auditOrExit(R, P, {
	argv: process.argv.includes('--check') ? [...process.argv, '--audit'] : process.argv,
	frames: states,
	apart: false
});
if (process.exitCode) process.exit(process.exitCode);

const offset = k.axisVector(P, [0, TRAVEL, 0]);
const mobileBoxes = Object.fromEntries(
	IDS.map((id, i) => {
		const z = 20 + (3 - i) * 32;
		const points = k.boxCorners({ x: -98, y: -16, w: 196, d: 110 }, z, z + 28).map(point);
		const minX = Math.min(...points.map((p) => p[0])) - 15;
		const minY = Math.min(...points.map((p) => p[1])) - 12;
		return [
			id,
			`${minX} ${minY} ${Math.max(...points.map((p) => p[0])) - minX + 15} ${Math.max(...points.map((p) => p[1])) - minY + 12}`
		];
	})
);
const result = {
	width: WIDTH,
	height: HEIGHT,
	offset,
	mobileBoxes,
	parts: R.items.map(({ id, piece, part, svg }) => ({ id, piece, part, svg })),
	metadata: {
		count: R.solids.length,
		generator: 'src/lib/visualizations/the-museum-of-almost/generate-geometry.mjs',
		license: 'MIT; Copyright (c) 2026 Ryan; scripts/lib/openhie-anatomy/LICENSE',
		travel: TRAVEL,
		railEngagementAtOpen: 27,
		auditedPoses: states.length,
		geometryAudit: audit ? A.failures(audit) : null
	}
};
const encoded = `${JSON.stringify(result)}\n`;
if (process.argv.includes('--check')) {
	if (readFileSync(OUTPUT, 'utf8').replace(/\r\n/gu, '\n') !== encoded) {
		// Audit execution is a receipt, not part of deterministic artwork metadata.
		const previous = JSON.parse(readFileSync(OUTPUT, 'utf8'));
		previous.metadata.geometryAudit = result.metadata.geometryAudit;
		if (JSON.stringify(previous) !== JSON.stringify(result))
			throw new Error('Museum geometry is stale; regenerate it.');
	}
	console.log(
		`Museum geometry current: ${R.solids.length} purposeful solids; ${states.length} poses.`
	);
} else {
	writeFileSync(OUTPUT, encoded);
	console.log(`Museum geometry generated: ${R.solids.length} purposeful solids.`);
}
if (process.argv.includes('--preview')) {
	const folder = join(ROOT, '.codex-artifacts/museum-geometry');
	mkdirSync(folder, { recursive: true });
	for (const id of ['closed', ...IDS]) {
		const body = result.parts
			.map(
				(part) =>
					`<g transform="translate(${part.piece === id ? offset.join(' ') : '0 0'})">${part.svg}</g>`
			)
			.join('');
		writeFileSync(
			join(folder, `${id}.html`),
			`<!doctype html><html lang="en"><meta charset="utf-8"><title>Museum cabinet ${id}</title><style>${k.ISO_CSS}body{margin:0;background:#f5f0e5}.iso-plate{width:800px;max-width:100%;margin:auto}svg{width:100%;height:auto}</style><main class="iso iso-plate" data-theme="light"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><title>Fictional specimen cabinet</title>${body}</svg></main></html>`
		);
	}
}
