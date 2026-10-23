/** Build-time Anatomy Hero. MIT kit: scripts/lib/openhie-anatomy/LICENSE. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../../../../scripts/lib/openhie-anatomy/iso-kit.mjs';
import * as A from '../../../../scripts/lib/openhie-anatomy/audit.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const WIDTH = 1100;
const HEIGHT = 720;
const BASE = { x: -172, y: -105, w: 344, d: 220, r: 7 };
const P = k.fitProjection(
	[
		...k.boxCorners(BASE, -17, 25),
		...k.boxCorners({ x: 84, y: -91, w: 69, d: 64 }, 8, 83),
		[-137, 68, 77]
	],
	WIDTH,
	HEIGHT,
	{ pad: 55, azimuth: 43, elevation: 37 }
);
const R = A.recorder(P);
const L = (path, style = {}) => k.lineSvg(path, style);
const fine = (value) => Math.round(value * 1000) / 1000;
const screen = (point) => k.iso(point, P).map(fine);
const trace = (points) => k.pathOf(points.map((point) => k.iso(point, P)));

function slab(id, area, x, y, w, d, z, h, options = {}) {
	const plan = { x, y, w, d, r: options.r ?? 0.7 };
	const { tone = 'mid', inner = '', ground = false, ...style } = options;
	const shape = R.solid(A.slab(plan, z, h, { name: id, ground }, 6));
	R.put({
		id,
		name: id,
		area,
		piece: area,
		at: [x + w / 2, y + d / 2, z + h / 2],
		shapes: [shape],
		svg: k.solidSvg(k.slabOf(plan, z, h, P, 6, Math.min(0.7, h / 4)), { tone, inner, ...style })
	});
	return shape;
}

function cylinder(id, area, x, y, r, z, h, { tone = 'lo', inner = '', ground = false } = {}) {
	const shape = R.solid(A.cylinder(x, y, r, z, h, { name: id, ground }));
	R.put({
		id,
		name: id,
		area,
		piece: area,
		at: [x, y, z + h / 2],
		shapes: [shape],
		svg: k.solidSvg(k.cylinder(x, y, r, z, h, P, 28, Math.min(0.35, h / 4)), { tone, inner })
	});
	return shape;
}

function screw(id, area, x, y, z, radius = 1.6) {
	return cylinder(id, area, x, y, radius, z, 0.8, {
		inner: L(k.ring(x, y, radius * 0.55, z + 0.8, P, 16), { tone: 'faint' })
	});
}

// One coherent fixture: feet, plate, fasteners and a real front ruler strip.
for (const [i, [x, y]] of [
	[-150, -82],
	[150, -82],
	[-150, 91],
	[150, 91]
].entries()) {
	cylinder(`bench.foot-flange-${i}`, 'bench', x, y, 8, -17, 2.4, { ground: true });
	cylinder(`bench.foot-${i}`, 'bench', x, y, 6, -14.6, 8.6);
}
slab('bench.plate', 'bench', BASE.x, BASE.y, BASE.w, BASE.d, -6, 14, {
	tone: 'mid',
	r: BASE.r,
	inner: L(k.planOutline(k.insetPlan(BASE, 4), 8, P, 6), { tone: 'faint' })
});
for (const [i, [x, y]] of [
	[-162, -95],
	[162, -95],
	[-162, 105],
	[162, 105]
].entries())
	screw(`bench.corner-screw-${i}`, 'bench', x, y, 8);
slab('bench.engraved-plate', 'bench', 85, 94, 58, 11, 8, 0.8, {
	tone: 'lo',
	inner: L(
		[0, 1]
			.map((i) => k.lineOnTop([90, 97.5 + i * 3], [128 - i * 7, 97.5 + i * 3], 8.8, P))
			.join(''),
		{ tone: 'lo', free: true }
	)
});
const frontScale = { x: -151, y: 105, w: 213, d: 5.5, r: 0.7 };
const frontTicks = k.topTicks(
	frontScale.x + 4,
	frontScale.x + frontScale.w - 4,
	5,
	5,
	frontScale.y,
	8.8,
	[2.2, 3.7],
	P
);
slab('bench.front-scale', 'bench', frontScale.x, frontScale.y, frontScale.w, frontScale.d, 8, 0.8, {
	tone: 'lo',
	inner: L(frontTicks.minor, { tone: 'faint' }) + L(frontTicks.major, { tone: 'mid' })
});

// A fitted card catalogue: the name lookup is separate from carrying a page.
slab('address.floor', 'address', -151, -87, 65, 57, 8, 3, { tone: 'lo', r: 2 });
slab('address.left-cheek', 'address', -151, -87, 3, 57, 11, 16);
slab('address.right-cheek', 'address', -89, -87, 3, 57, 11, 16);
slab('address.back', 'address', -148, -87, 59, 3, 11, 31);
slab('address.retaining-lip', 'address', -148, -33, 59, 3, 11, 10);
for (let i = 0; i < 6; i++) {
	const y = -79 + i * 7;
	const h = 29 - i * 2.5;
	slab(`address.card-${i}`, 'address', -145, y, 53, 1.8, 11, h, {
		tone: 'hi',
		r: 0.4,
		inner: L(
			[0, 1]
				.map((j) =>
					trace([
						[-140, y + 1.8, 11 + h - 5 - j * 3],
						[-108 + j * 8, y + 1.8, 11 + h - 5 - j * 3]
					])
				)
				.join(''),
			{ tone: 'faint', free: true }
		)
	});
	slab(`address.tab-${i}`, 'address', -141 + (i % 3) * 15, y, 11, 1.8, 11 + h, 3, {
		tone: 'hi',
		r: 0.4
	});
}
for (const [i, x] of [-132, -108].entries())
	slab(`address.pull-mount-${i}`, 'address', x, -30, 3, 5, 13, 3, { tone: 'lo' });
slab('address.pull-bar', 'address', -132, -25, 27, 3, 13, 3, { tone: 'hi' });

// Two keyed couplings. Their joining faces touch; their cheeks carry the lock.
for (const [i, x] of [-62, -5].entries()) {
	const area = 'coupling';
	slab(`coupling.bed-${i}`, area, x, -78, 47, 38, 8, 3, { tone: 'lo', r: 2 });
	slab(`coupling.rear-cheek-${i}`, area, x + 3, -76, 41, 3, 11, 15);
	slab(`coupling.front-cheek-${i}`, area, x + 3, -45, 41, 3, 11, 15);
	slab(`coupling.plug-left-${i}`, area, x + 4, -69, 19.5, 20, 11, 10, {
		tone: 'hi',
		r: 1.3,
		inner: L(k.sideSeam({ x: x + 4, y: -69, w: 19.5, d: 20, r: 1.3 }, 16, P, 6), { tone: 'faint' })
	});
	slab(`coupling.plug-right-${i}`, area, x + 23.5, -69, 19.5, 20, 11, 10, { tone: 'hi', r: 1.3 });
	slab(`coupling.lock-bridge-${i}`, area, x + 19.5, -76, 8, 34, 26, 2.5, { tone: 'mid' });
	cylinder(`coupling.lock-knob-${i}`, area, x + 23.5, -59, 4.2, 28.5, 3.3, {
		tone: 'hi',
		inner: L(k.knurl(x + 23.5, -59, 4.2, 28.5, 31.8, 22, P), { tone: 'lo' })
	});
	for (const [j, [xx, yy]] of [
		[x + 1.5, -75.5],
		[x + 45.5, -75.5],
		[x + 1.5, -42.5],
		[x + 45.5, -42.5]
	].entries())
		screw(`coupling.bed-screw-${i}-${j}`, area, xx, yy, 11, 1);
}

// Twin channels. The response-token route is the near channel, moving right to left.
for (const [i, y] of [-9, 14].entries()) {
	slab(`transport.floor-${i}`, 'transport', -65, y, 213, 14, 8, 2, { tone: 'lo', r: 1.2 });
	slab(`transport.rear-guide-${i}`, 'transport', -65, y, 213, 2, 10, 4.5, { tone: 'mid' });
	slab(`transport.front-guide-${i}`, 'transport', -65, y + 12, 213, 2, 10, 4.5, { tone: 'mid' });
	slab(`transport.stop-left-${i}`, 'transport', -65, y + 2, 3, 10, 10, 4.5);
	slab(`transport.stop-right-${i}`, 'transport', 145, y + 2, 3, 10, 10, 4.5);
	const strip = { x: -58, y: y + 2, w: 198, d: 2, r: 0.2 };
	const ticks = k.topTicks(strip.x + 2, strip.x + strip.w - 2, 5, 5, strip.y, 10.5, [0.8, 1.5], P);
	slab(`transport.ruler-${i}`, 'transport', strip.x, strip.y, strip.w, strip.d, 10, 0.5, {
		tone: 'lo',
		inner: L(ticks.minor, { tone: 'faint' }) + L(ticks.major, { tone: 'lo' })
	});
	for (const [j, xx] of [-63.5, 146.5].entries())
		screw(`transport.stop-screw-${i}-${j}`, 'transport', xx, y + 7, 14.5, 1.1);
}

// Four open receiving trays and four actual cards. Runtime reveals each received range.
const bufferWorld = [];
for (let i = 0; i < 4; i++) {
	const x = -35 + i * 25;
	slab(`buffer.floor-${i}`, 'buffer', x, 55, 21, 37, 8, 3, { tone: 'lo', r: 1.4 });
	slab(`buffer.left-rail-${i}`, 'buffer', x, 55, 2, 37, 11, 5);
	slab(`buffer.right-rail-${i}`, 'buffer', x + 19, 55, 2, 37, 11, 5);
	slab(`buffer.rear-stop-${i}`, 'buffer', x + 2, 55, 17, 2, 11, 7);
	slab(`buffer.front-lip-${i}`, 'buffer', x + 2, 90, 17, 2, 11, 3);
	screw(`buffer.lip-screw-${i}`, 'buffer', x + 10.5, 91, 14, 0.7);
	const card = { x: x + 4, y: 62, w: 13, d: 22, r: 0.7 };
	slab(`buffer.card-${i}`, 'buffer', card.x, card.y, card.w, card.d, 11, 1.2, {
		tone: 'hi',
		inner: L(
			[0, 1, 2]
				.map((j) => k.lineOnTop([card.x + 2, 67 + j * 4.3], [card.x + 11, 67 + j * 4.3], 12.2, P))
				.join(''),
			{ tone: 'faint', free: true }
		)
	});
	bufferWorld.push([x + 10.5, 73, 12.2]);
}

// Open server rack, two work drawers, and a supported listening socket.
slab('server.plinth', 'server', 84, -91, 69, 64, 8, 4, { tone: 'lo', r: 2 });
for (const [i, [x, y]] of [
	[84, -91],
	[149, -91],
	[84, -31],
	[149, -31]
].entries())
	slab(`server.post-${i}`, 'server', x, y, 4, 4, 12, 67, { tone: 'mid' });
slab('server.far-cheek', 'server', 149, -87, 4, 56, 12, 67, {
	inner:
		L(k.sideSeam({ x: 149, y: -87, w: 4, d: 56, r: 0.7 }, 70, P, 6), { tone: 'faint' }) +
		L(
			Array.from({ length: 8 }, (_, i) => {
				const z = 23 + i * 5.2;
				return k.pathOf(
					[
						[153, -77, z],
						[153, -43, z],
						[153, -43, z + 1.5],
						[153, -77, z + 1.5]
					].map((point) => k.iso(point, P)),
					true
				);
			}).join(''),
			{ tone: 'faint' }
		)
});
for (const [i, z] of [33, 61].entries())
	slab(`server.rear-tie-${i}`, 'server', 88, -91, 61, 4, z, 4);
for (const [i, z] of [23, 46].entries()) {
	slab(`server.shelf-${i}`, 'server', 88, -87, 61, 56, z, 3, { tone: 'lo' });
	slab(`server.drawer-${i}`, 'server', 92, -82, 52, 38, z + 3, 2.5, { tone: 'hi', r: 1.2 });
	slab(`server.drawer-face-${i}`, 'server', 92, -44, 52, 3, z + 3, 12, {
		tone: 'hi',
		inner: L(
			trace([
				[97, -41, z + 11],
				[116, -41, z + 11]
			]),
			{ tone: 'faint', free: true }
		)
	});
	for (const [j, x] of [122, 137].entries())
		slab(`server.pull-mount-${i}-${j}`, 'server', x, -41, 2.5, 4, z + 7, 2.5, { tone: 'lo' });
	slab(`server.pull-bar-${i}`, 'server', 122, -37, 17.5, 2.5, z + 7, 2.5, { tone: 'mid' });
}
slab('server.cap', 'server', 84, -91, 69, 64, 79, 3.5, {
	tone: 'mid',
	r: 1.2,
	inner: L(
		Array.from({ length: 8 }, (_, i) =>
			k.planOutline({ x: 94, y: -80 + i * 5.8, w: 48, d: 2, r: 0.9 }, 82.5, P, 4)
		).join(''),
		{ tone: 'faint' }
	)
});
for (const [i, [x, y]] of [
	[88, -87],
	[149, -87],
	[88, -31],
	[149, -31]
].entries())
	screw(`server.cap-screw-${i}`, 'server', x, y, 82.5, 1.2);
slab('server.listener-bed', 'server', 104, -24, 31, 12, 8, 3, { tone: 'lo', r: 1 });
slab('server.listener-body', 'server', 108, -22, 23, 8, 11, 8, {
	tone: 'hi',
	r: 1,
	inner: L(k.planOutline({ x: 112, y: -19, w: 15, d: 5, r: 0.7 }, 19, P, 4), { tone: 'lo' })
});
slab('server.listener-key', 'server', 117.5, -17.5, 4, 2, 19, 1.2, { tone: 'hi', r: 0.3 });

// Browser easel. Its page is a real sheet held between the lip and two top clips.
slab('browser.base', 'browser', -151, 48, 66, 50, 8, 4, { tone: 'lo', r: 2 });
for (const [i, x] of [-145, -91].entries())
	screw(`browser.base-screw-${i}`, 'browser', x, 91, 12, 1.2);
for (const [i, x] of [-145, -94].entries())
	slab(`browser.post-${i}`, 'browser', x, 55, 4, 7, 12, 62, { tone: 'mid' });
slab('browser.backing', 'browser', -145, 62, 55, 3, 16, 58, { tone: 'mid', r: 1.1 });
slab('browser.retaining-lip', 'browser', -148, 65, 61, 7, 12, 4, { tone: 'hi', r: 1 });
slab('browser.page', 'browser', -141, 65, 47, 0.7, 19, 50, { tone: 'hi', r: 0.6 });
for (const [i, x] of [-139, -102].entries())
	slab(`browser.clip-${i}`, 'browser', x, 65, 4, 1.7, 69, 3, { tone: 'lo' });
slab('browser.page-title', 'browser', -136, 65.7, 32, 0.3, 60, 2.5, { tone: 'lo', r: 0.2 });
slab('browser.page-image', 'browser', -136, 65.7, 35, 0.3, 40, 15, {
	tone: 'lo',
	r: 0.3,
	inner: L(
		trace([
			[-136, 66, 43],
			[-122, 66, 50],
			[-114, 66, 44],
			[-101, 66, 51]
		]),
		{ tone: 'faint' }
	)
});
for (let i = 0; i < 4; i++)
	slab(
		`browser.page-copy-${i}`,
		'browser',
		-136,
		65.7,
		35 - (i === 3 ? 10 : 0),
		0.3,
		25 + i * 3,
		0.7,
		{ tone: 'lo', r: 0.1 }
	);

// Static assemblies are checked using their actual solids, not broad stand-ins.
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P);
if (process.exitCode) process.exit(process.exitCode);

// Token route: a 12 × 6 × 4 body fits strictly inside the near channel's guides.
// This bounds check is independent of screen projection; it is not a per-frame dynamic audit.
const tokenRange = { x: [-53, 133], y: 21, z: 10, w: 12, d: 6, h: 4 };
if (
	tokenRange.x[0] - 6 < -62 ||
	tokenRange.x[1] + 6 > 145 ||
	tokenRange.y - 3 <= 16 ||
	tokenRange.y + 3 >= 26 ||
	tokenRange.z !== 10
)
	throw new Error('Response token must remain supported within its clear channel.');
const tokenAnchor = k.iso([0, tokenRange.y, tokenRange.z], P);
const tokenBody = k.solidSvg(k.slabOf({ x: -6, y: 18, w: 12, d: 6, r: 0.8 }, 10, 4, P, 6, 0.5), {
	tone: 'hi',
	lit: true
});
const geometry = {
	width: WIDTH,
	height: HEIGHT,
	partCount: R.solids.length,
	parts: [
		{
			id: 'bench.halo',
			area: 'bench',
			svg: `<path class="iso-halo" d="${k.haloOf(BASE, -17, 10, P)}"/>`
		},
		...R.items.map((part) => ({ id: part.id, area: part.area, svg: part.svg }))
	],
	markers: Object.fromEntries(
		Object.entries({
			address: [-117, -55, 43],
			coupling: [-11, -58, 32],
			transport: [36, 20, 15],
			buffer: [12, 74, 19],
			server: [119, -56, 83],
			browser: [-118, 65, 75]
		}).map(([id, point]) => [id, screen(point)])
	),
	crops: {
		overview: '0 0 1100 720',
		address: '255 30 450 390',
		coupling: '410 130 450 390',
		transport: '330 210 550 420',
		buffer: '230 285 450 390',
		server: '600 150 450 440',
		browser: '70 90 450 440'
	},
	token: {
		svg: `<g transform="translate(${-tokenAnchor[0]} ${-tokenAnchor[1]})">${tokenBody}</g>`,
		anchor: [0, 0],
		worldSize: [12, 6, 4]
	},
	tokenOccluderIds: ['transport.front-guide-1'],
	responsePath: [screen([133, 21, 10]), screen([-53, 21, 10])],
	requestPath: [screen([-53, -2, 10]), screen([133, -2, 10])],
	bufferSlots: bufferWorld.map(screen),
	projection: P,
	metadata: {
		generator: 'src/lib/visualizations/between-a-click-and-a-page/generate-geometry.mjs',
		kit: 'Anatomy — https://github.com/wheresryan22/anatomy',
		license: 'MIT; Copyright (c) 2026 Ryan',
		model:
			'A physical teaching metaphor; the static mechanism is audited. Token route bounds are checked separately. No dedicated internet path, packet size or network timing is implied by physical dimensions.'
	}
};
const output = `${JSON.stringify(geometry)}\n`;
if (process.argv.includes('--check')) {
	if (readFileSync(join(DIR, 'geometry.json'), 'utf8').replace(/\r\n/gu, '\n') !== output)
		throw new Error('HTTP instrument geometry is stale.');
} else writeFileSync(join(DIR, 'geometry.json'), output);
if (process.argv.includes('--preview')) {
	const previewDir = join(DIR, '../../../../.codex-artifacts/http-geometry');
	mkdirSync(previewDir, { recursive: true });
	for (const theme of ['light', 'dark'])
		writeFileSync(
			join(previewDir, `geometry-${theme}.html`),
			`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTTP dispatch instrument</title><style>${k.ISO_CSS}body{margin:0;background:${theme === 'light' ? '#f6f2e9' : '#1d2525'}}svg{display:block;width:1100px;max-width:100%;height:auto}</style></head><body><main class="iso" data-theme="${theme}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="A tabletop dispatch instrument with a card index, two fitted couplings, twin guide channels, four receiving trays, a cutaway server rack and a document easel.">${geometry.parts.map((part) => `<g data-part="${part.id}" data-area="${part.area}">${part.svg}</g>`).join('')}</svg></main></body></html>`
		);
}
console.log(
	`HTTP instrument geometry current: ${geometry.partCount} purposeful solids. ${process.argv.includes('--audit') ? 'Static geometry audited; straight token route bounds checked.' : 'Use --audit for static physical verification.'}`
);
