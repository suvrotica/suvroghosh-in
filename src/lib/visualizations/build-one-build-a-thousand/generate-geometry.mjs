/** Build-time Anatomy geometry. MIT kit: scripts/lib/openhie-anatomy/LICENSE. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../../../../scripts/lib/openhie-anatomy/iso-kit.mjs';
import * as A from '../../../../scripts/lib/openhie-anatomy/audit.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const P = k.fitProjection(
	[...k.boxCorners({ x: -210, y: -105, w: 455, d: 235 }, -76, 8), [-10, -5, 83]],
	1100,
	650,
	{ pad: 35, azimuth: 43, elevation: 31 }
);
const R = A.recorder(P, { order: ['back', 'lip'] });
const L = (path, style = {}) => k.lineSvg(path, style);
const fine = (v) => Math.round(v * 1000) / 1000;
function slab(id, area, x, y, w, d, z, h, options = {}) {
	const plan = { x, y, w, d, r: options.r ?? 0.8 };
	const { piece = area, tone = 'mid', move = [0, 0, 0], inner = '', ...rest } = options;
	const shape = R.solid(A.slab(plan, z, h, { name: id }, 6));
	R.put({
		id,
		name: id,
		component: area,
		piece,
		at: [x + w / 2, y + d / 2, z + h / 2],
		move,
		shapes: [shape],
		svg: k.solidSvg(k.slabOf(plan, z, h, P, 6, Math.min(0.7, h / 4)), { tone, inner, ...rest })
	});
}
function bolt(id, area, x, y, z) {
	const shape = R.solid(A.cylinder(x, y, 1.8, z, 1, { name: id }));
	R.put({
		id,
		name: id,
		component: area,
		piece: area,
		at: [x, y, z + 0.5],
		move: [0, 0, 0],
		shapes: [shape],
		svg: k.solidSvg(k.cylinder(x, y, 1.8, z, 1, P, 24, 0.2), { tone: 'lo' })
	});
}
function tray(area, x, y, w, d, z) {
	slab(`${area}.floor`, area, x, y, w, d, z, 3, { tone: 'lo', r: 2 });
	slab(`${area}.back`, area, x, y, w, 2, z + 3, 8);
	slab(`${area}.front`, area, x, y + d - 2, w, 2, z + 3, 8);
	slab(`${area}.left`, area, x, y + 2, 2, d - 4, z + 3, 8);
	slab(`${area}.right`, area, x + w - 2, y + 2, 2, d - 4, z + 3, 8);
	for (const [i, xx] of [x + w * 0.3, x + w * 0.7].entries())
		slab(`${area}.handle-mount-${i}`, area, xx, y + d, 3, 6, z + 3, 3);
	slab(`${area}.handle`, area, x + w * 0.3, y + d + 6, w * 0.4 + 3, 3, z + 3, 3, { tone: 'hi' });
}

// Bench, real supported legs, stretchers, sockets and top.
for (const [i, [x, y]] of [
	[-92, -52],
	[78, -52],
	[-92, 55],
	[78, 55]
].entries()) {
	slab(`bench.foot-${i}`, 'bench', x - 2, y - 2, 17, 17, -76, 4, { tone: 'lo', r: 2 });
	slab(`bench.leg-${i}`, 'bench', x, y, 13, 13, -72, 64, { tone: 'mid' });
	slab(`bench.socket-${i}`, 'bench', x - 2, y - 2, 17, 17, -8, 8, { tone: 'lo' });
}
slab('bench.rear-stretcher', 'bench', -79, -50, 157, 7, -48, 9);
slab('bench.front-stretcher', 'bench', -79, 57, 157, 7, -48, 9);
slab('bench.left-cheek', 'bench', -105, -60, 6, 120, -5, 5);
slab('bench.right-cheek', 'bench', 99, -60, 6, 120, -5, 5);
slab('bench.top', 'bench', -105, -65, 210, 135, 0, 8, {
	tone: 'mid',
	r: 3,
	inner: L(k.planOutline(k.insetPlan({ x: -105, y: -65, w: 210, d: 135, r: 3 }, 3), 8, P), {
		tone: 'faint'
	})
});
for (const [i, [x, y]] of [
	[-99, -59],
	[99, -59],
	[-99, 64],
	[99, 64]
].entries())
	bolt(`bench.top-screw-${i}`, 'bench', x, y, 8);

// Cutting mat, guide rail, mounted end stops and thumb clamps.
slab('cutting.mat', 'cutting', -91, -48, 58, 85, 8, 1, { tone: 'lo' });
slab('cutting.guide-rail', 'cutting', -88, -45, 5, 79, 9, 3, { tone: 'hi' });
for (const [i, y] of [-45, 28].entries())
	slab(`cutting.rail-stop-${i}`, 'cutting', -88, y, 22, 4, 12, 5);
for (const [i, y] of [-29, 12].entries()) {
	slab(`cutting.clamp-${i}`, 'cutting', -96, y, 8, 7, 9, 5);
	bolt(`cutting.clamp-knob-${i}`, 'cutting', -92, y + 3.5, 14);
}
slab('cutting.guide-shoulder-1', 'cutting', -74, -28, 27, 3, 9, 5, { tone: 'hi' });
slab('cutting.guide-shoulder-2', 'cutting', -74, 12, 27, 3, 9, 5, { tone: 'hi' });
slab('cutting.sanding-block', 'cutting', -68, 42, 25, 15, 8, 7, { tone: 'hi', r: 2 });
slab('cutting.abrasive', 'cutting', -68, 42, 25, 15, 15, 1, { tone: 'lo', r: 2 });
slab('cutting.square-long', 'cutting', -27, 54, 43, 4, 8, 1, { tone: 'lo' });
slab('cutting.square-short', 'cutting', -27, 58, 4, 10, 8, 1, { tone: 'lo' });

// The same three-piece wooden stand. The only moving parts travel over clear bench.
slab('stand.base', 'stand', -21, -12, 42, 38, 8, 5, { tone: 'hi', r: 1.8 });
slab('stand.rear-staging-pad', 'cutting', -17, -43, 34, 31, 8, 5, { tone: 'lo' });
slab('stand.front-staging-pad', 'cutting', -17, 26, 34, 22, 8, 5, { tone: 'lo' });
slab('stand.back', 'stand', -17, -9, 34, 6, 13, 38, {
	tone: 'hi',
	piece: 'back',
	move: [0, -34, 0]
});
slab('stand.lip', 'stand', -17, 17, 34, 6, 13, 10, { tone: 'hi', piece: 'lip', move: [0, 25, 0] });
slab('phone.body', 'phone', -13, -3, 26, 5, 23, 47, { tone: 'lo', r: 2 });
slab('phone.screen', 'phone', -10, 2, 20, 0.5, 28, 35, { tone: 'hi', r: 1 });

// Fitted stock drawer and full-length under-bench runners.
for (const [i, y] of [-33, 20].entries()) {
	slab(`material.runner-${i}`, 'material', -205, y, 125, 4, -9, 3, { tone: 'lo' });
	slab(`material.runner-hanger-${i}`, 'material', -84, y, 4, 4, -6, 6, { tone: 'lo' });
}
tray('material', -205, -46, 90, 80, -6);
for (let i = 0; i < 6; i++)
	slab(`material.stock-${i}`, 'stock', -197, -35 + i * 9, 72, 6, -3, 4, { tone: 'hi' });
slab('material.rack-stop', 'material', -201, -37, 3, 60, -3, 6);

// Front assembly tray, supported on long runners rather than floating.
for (const [i, x] of [30, 72].entries()) {
	slab(`assembly.runner-${i}`, 'assembly', x, 55, 4, 70, -9, 3, { tone: 'lo' });
	slab(`assembly.runner-hanger-${i}`, 'assembly', x, 60, 4, 4, -6, 6, { tone: 'lo' });
}
tray('assembly', 23, 76, 70, 50, -6);
slab('assembly.instructions', 'instructions', 29, 82, 32, 34, -3, 1, {
	tone: 'hi',
	inner: L(
		[0, 1, 2, 3].map((i) => k.lineOnTop([33, 89 + i * 5], [56, 89 + i * 5], -2, P)).join(''),
		{ tone: 'faint', free: true }
	)
});
slab('assembly.clip-left', 'instructions', 29, 82, 3, 5, -2, 1, { tone: 'lo' });
slab('assembly.clip-right', 'instructions', 58, 82, 3, 5, -2, 1, { tone: 'lo' });
slab('assembly.sample-base', 'assembly', 66, 89, 18, 18, -3, 3, { tone: 'hi' });
slab('assembly.sample-back', 'assembly', 68, 90, 14, 3, 0, 18, { tone: 'hi' });
slab('assembly.sample-lip', 'assembly', 68, 103, 14, 3, 0, 4, { tone: 'hi' });
slab('assembly.fix-block', 'fixes', 69, 113, 15, 6, -3, 3, { tone: 'lo' });

// Packing extension, underside brackets and fitted parcels.
for (const [i, y] of [-30, 43].entries()) {
	slab(`packing.runner-${i}`, 'packing', 92, y, 119, 5, -9, 3, { tone: 'lo' });
	slab(`packing.runner-hanger-${i}`, 'packing', 92, y, 4, 5, -6, 6, { tone: 'lo' });
}
tray('packing', 114, -35, 100, 85, -6);
slab('packing.mat', 'packing', 120, -27, 87, 67, -3, 1, { tone: 'lo' });
for (const [i, [x, y]] of [
	[125, -20],
	[166, -20],
	[125, 13],
	[166, 13]
].entries()) {
	slab(`packing.parcel-${i}`, 'parcel', x, y, 31, 24, -2, 13, { tone: 'hi' });
	slab(`packing.lid-${i}`, 'parcel', x - 0.5, y - 0.5, 32, 25, 11, 2, { tone: 'mid' });
}
slab('packing.liner', 'protection', 200, -23, 8, 58, -2, 3, { tone: 'hi' });
slab('packing.stop', 'packing', 118, 40, 55, 3, -2, 4);

// Customer-side shelf, separate from work completed at the maker's bench.
for (const [i, x] of [150, 225].entries())
	slab(`customer.foot-${i}`, 'customer', x, -102, 9, 29, -76, 73, { tone: 'lo' });
slab('customer.shelf-bracket', 'customer', 105, -64, 40, 10, -3, 6, { tone: 'lo' });
slab('customer.shelf', 'customer', 145, -105, 94, 51, -3, 6, { tone: 'mid', r: 2 });
slab('customer.parcel', 'customer', 177, -98, 34, 24, 3, 16, { tone: 'hi' });
slab('customer.lid', 'customer', 176.5, -98.5, 35, 25, 19, 2, { tone: 'mid' });

// Three small examples stand for labelled bundles; they never claim to be 1,000 individuals.
for (const [i, x] of [31, 53, 75].entries()) {
	slab(`repeat.${i}.base`, 'repeat', x, -47, 17, 18, 8, 3, { tone: 'hi' });
	slab(`repeat.${i}.back`, 'repeat', x + 2, -45, 13, 3, 11, 19, { tone: 'hi' });
	slab(`repeat.${i}.lip`, 'repeat', x + 2, -33, 13, 3, 11, 5, { tone: 'hi' });
}

const states = [0, 0.25, 0.5, 0.75, 1];
A.settle(R, P, { states });
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P, { frames: Array.from({ length: 21 }, (_, i) => i / 20), apart: true });
if (process.exitCode) process.exit(process.exitCode);
const geometry = {
	width: 1100,
	height: 650,
	partCount: R.solids.length,
	parts: [
		{
			id: 'bench.halo',
			area: 'bench',
			piece: 'bench',
			svg: `<path class="iso-halo" d="${k.haloOf({ x: -105, y: -65, w: 210, d: 135, r: 3 }, -76, 6, P)}"/>`,
			move: [0, 0]
		},
		...R.items.map((p) => ({
			id: p.id,
			area: p.component,
			piece: p.piece,
			svg: p.svg,
			move: k.axisVector(P, p.move).map(fine)
		}))
	],
	markers: Object.fromEntries(
		Object.entries({
			cutting: [-65, -5, 25],
			material: [-161, -5, 9],
			assembly: [56, 100, 25],
			packing: [162, 3, 25],
			customer: [194, -85, 32]
		}).map(([id, pt]) => [id, k.iso(pt, P).map(fine)])
	),
	crops: {
		overview: '0 0 1100 650',
		cutting: '210 105 560 410',
		material: '0 100 620 460',
		assembly: '330 220 570 420',
		packing: '470 50 620 460',
		customer: '470 0 630 460'
	},
	metadata: {
		generator: 'src/lib/visualizations/build-one-build-a-thousand/generate-geometry.mjs',
		kit: 'Anatomy — https://github.com/wheresryan22/anatomy',
		license: 'MIT; Copyright (c) 2026 Ryan',
		model:
			'Static explanatory geometry. All totals are derived by model.ts; fit differences are illustrations, not dimensional measurements.'
	}
};
const output = JSON.stringify(geometry) + '\n';
if (process.argv.includes('--check')) {
	if (readFileSync(join(DIR, 'geometry.json'), 'utf8').replace(/\r\n/gu, '\n') !== output)
		throw Error('Workshop geometry is stale.');
} else writeFileSync(join(DIR, 'geometry.json'), output);
if (process.argv.includes('--preview'))
	for (const theme of ['light', 'dark'])
		for (const [pose, amount] of [
			['assembled', 0],
			['intermediate', 0.5],
			['separated', 1]
		]) {
			const previewDir = join(DIR, '../../../../.codex-artifacts/build-one-geometry');
			mkdirSync(previewDir, { recursive: true });
			writeFileSync(
				join(previewDir, `geometry-${theme}-${pose}.html`),
				`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Workshop geometry</title><style>${k.ISO_CSS}body{margin:0;background:${theme === 'light' ? '#f3eee4' : '#1d2525'}}svg{width:1100px;max-width:100%;height:auto}</style></head><body><div class="iso" data-theme="${theme}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 650">${geometry.parts
					.filter((p) => p.area !== 'phone' || amount === 0)
					.map(
						(p) =>
							`<g transform="translate(${p.move[0] * amount} ${p.move[1] * amount})">${p.svg}</g>`
					)
					.join('')}</svg></div></body></html>`
			);
		}
console.log(
	`Workshop geometry current: ${geometry.partCount} purposeful solids. ${process.argv.includes('--audit') ? 'Audited closed, open and intermediate poses.' : 'Use --audit for physical verification.'}`
);
