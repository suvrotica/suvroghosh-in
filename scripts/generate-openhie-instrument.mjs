/**
 * OpenHIE's controlled exchange as a mounted desktop instrument.
 *
 * Bounded Anatomy Figure: the front carriage indicates which responsibility is
 * being inspected, while the healthcare state remains in the pure TS engine.
 * The carriage's supported travel is a presentation metaphor, not a packet's
 * physical trajectory or network latency.
 *
 * Purposeful solids: plinth/feet, guide rails/stops, indexing drum/cassettes,
 * four archive drawers/frame/handles, routing turntable, terminology wheel and
 * checking press, facility/worker index cards, three source/destination trays,
 * carriage, its envelope and two model-counted shared-record cards. Every solid is recorded from the same shape that
 * produces its SVG; no proxy boxes silence the geometry audit.
 *
 * Anatomy kit: Copyright (c) 2026 Ryan; MIT, see lib/openhie-anatomy/LICENSE.
 * node scripts/generate-openhie-instrument.mjs --audit [--check] [--preview]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from './lib/openhie-anatomy/iso-kit.mjs';
import * as A from './lib/openhie-anatomy/audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'src/lib/visualizations/openhie/instrument.json');
const WIDTH = 1000;
const HEIGHT = 620;
const PLINTH = { x: -230, y: -145, w: 460, d: 315, r: 14 };
const CARRIAGE_START = -199;
const CARRIAGE_END = 176;
const TRAVEL = CARRIAGE_END - CARRIAGE_START;

const P = k.fitProjection(
	[
		...k.boxCorners(PLINTH, -16, 0),
		...k.boxCorners({ x: 55, y: -125, w: 110, d: 70 }, 0, 85),
		[-140, -55, 57]
	],
	WIDTH,
	HEIGHT,
	{ pad: 44, azimuth: 42, elevation: 32 }
);

const R = A.recorder(P, { order: ['request'] });
const at = (point) => k.iso(point, P);
const L = (d, style = {}) => k.lineSvg(d, style);
const D = (points, style = {}) => k.dotsSvg(points.map(at), style);
const fine = (value) => Math.round(value * 1000) / 1000;

function screws(plan, z, inset = 5) {
	const points = k.corners(plan, inset);
	return (
		L(points.map(([x, y]) => k.ring(x, y, 1.9, z, P, 16)).join(''), { tone: 'lo' }) +
		D(
			points.map(([x, y]) => [x, y, z]),
			{ size: 0.6, tone: 'mid' }
		)
	);
}

function slab(
	id,
	component,
	plan,
	z,
	height,
	{ tone = 'mid', inner = '', move = null, recordIndex = undefined, ...style } = {}
) {
	const shape = R.solid(A.slab(plan, z, height, { name: id }, 8));
	return R.put({
		name: id,
		id,
		component,
		recordIndex,
		piece: move ? 'request' : component,
		at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + height / 2],
		move: move ?? [0, 0, 0],
		shapes: [shape],
		svg: k.solidSvg(k.slabOf(plan, z, height, P, 8, Math.min(0.8, height / 4)), {
			tone,
			inner,
			...style
		})
	});
}

function cylinder(
	id,
	component,
	x,
	y,
	radius,
	z,
	height,
	{ tone = 'mid', inner = '', ...style } = {}
) {
	const shape = R.solid(A.cylinder(x, y, radius, z, height, { name: id }));
	return R.put({
		name: id,
		id,
		component,
		piece: component,
		at: [x, y, z + height / 2],
		shapes: [shape],
		svg: k.solidSvg(k.cylinder(x, y, radius, z, height, P, 64, Math.min(0.6, height / 4)), {
			tone,
			inner,
			...style
		})
	});
}

function insetRim(plan, z, inset = 3) {
	return L(k.planOutline(k.insetPlan(plan, inset), z, P), { tone: 'faint' });
}

function dialMarks(x, y, radius, z, count = 40) {
	const ticks = k.radialTicks(x, y, radius - 2, count, 5, z, [2.2, 4], P);
	return (
		L([radius - 2, radius - 4.2, radius - 6].map((r) => k.ring(x, y, r, z, P, 64)).join(''), {
			tone: 'lo'
		}) +
		L(ticks.minor, { tone: 'lo' }) +
		L(ticks.major, { tone: 'mid' })
	);
}

// Base: four rubber feet, bevelled steel plinth, an inset border and fixing heads.
for (const [index, [x, y]] of k.corners(PLINTH, 24).entries()) {
	cylinder(`stand.foot-${index + 1}`, 'base', x, y, 8, -16, 6, { tone: 'lo' });
}
slab('stand.plinth', 'base', PLINTH, -10, 10, {
	tone: 'lo',
	inner: insetRim(PLINTH, 0, 5) + screws(PLINTH, 0, 14)
});

// A paired, continuous guideway supports the request envelope at every position.
for (const [index, y] of [132, 151].entries()) {
	const plan = { x: -205, y, w: 410, d: 3, r: 1 };
	slab(`stand.guide-${index + 1}`, 'base', plan, 0, 5, {
		tone: 'mid',
		inner: L(k.lineOnTop([-205, y + 1.5], [205, y + 1.5], 5, P), { tone: 'faint' })
	});
}
for (const [index, x] of [-211, 205].entries()) {
	const plan = { x, y: 128, w: 6, d: 30, r: 1.4 };
	slab(`stand.stop-${index + 1}`, 'base', plan, 0, 10, {
		inner: screws(plan, 10, 2)
	});
}

// Client Registry: a rotary indexing drum, with paired physical guide cassettes.
const INDEX_BASE = { x: -183, y: -93, w: 86, d: 80, r: 5 };
slab('client.mount', 'client', INDEX_BASE, 0, 6, {
	inner: insetRim(INDEX_BASE, 6) + screws(INDEX_BASE, 6)
});
cylinder('client.lower-flange', 'client', -140, -55, 34, 6, 5, {
	inner: L(k.ring(-140, -55, 31.5, 11, P, 64), { tone: 'lo' })
});
cylinder('client.indexing-drum', 'client', -140, -55, 30, 11, 35, {
	tone: 'hi',
	inner:
		L([19, 28, 37].map((z) => k.sideArc(-140, -55, 30, z, P, 40)).join(''), {
			tone: 'lo'
		}) + L(k.knurl(-140, -55, 30, 11, 46, 40, P, 0.7), { tone: 'faint' })
});
cylinder('client.upper-flange', 'client', -140, -55, 34, 46, 4, {
	tone: 'hi',
	inner: dialMarks(-140, -55, 34, 50, 40)
});
cylinder('client.selector', 'client', -140, -55, 8, 50, 7, {
	tone: 'hi',
	inner: L(k.ring(-140, -55, 5.5, 57, P, 32), { tone: 'lo' })
});
for (const [index, x] of [-183, -105].entries()) {
	const plan = { x, y: -89, w: 8, d: 60, r: 1.3 };
	slab(`client.cassette-${index + 1}`, 'client', plan, 6, 28, {
		inner: insetRim(plan, 34, 2) + screws(plan, 34, 2.5)
	});
}

// The shared record is an archive with supported drawers, a back and two cheeks.
const ARCHIVE_BASE = { x: 55, y: -125, w: 110, d: 70, r: 4 };
slab('shr.mount', 'shr', ARCHIVE_BASE, 0, 6, {
	inner: insetRim(ARCHIVE_BASE, 6) + screws(ARCHIVE_BASE, 6)
});
for (const [index, x] of [55, 159].entries()) {
	const outerX = x + 6;
	const panel = [
		[outerX, -117, 14],
		[outerX, -63, 14],
		[outerX, -63, 72],
		[outerX, -117, 72]
	];
	const panelScrews = [-114, -66].flatMap((y) => [18, 68].map((z) => [outerX, y, z]));
	slab(`shr.cheek-${index + 1}`, 'shr', { x, y: -125, w: 6, d: 70, r: 1 }, 6, 74, {
		inner:
			index === 1
				? L(k.pathOf(panel.map(at), true), { tone: 'faint' }) +
					D(panelScrews, { tone: 'lo', size: 0.6 })
				: ''
	});
}
slab('shr.spine', 'shr', { x: 61, y: -125, w: 98, d: 6, r: 1 }, 6, 74);
for (let index = 0; index < 4; index += 1) {
	const z = 6 + index * 18;
	const plan = { x: 61, y: -119, w: 98, d: 58, r: 1.3 };
	slab(`shr.drawer-${index + 1}`, 'shr', plan, z, 8, {
		tone: 'hi',
		inner: insetRim(plan, z + 8, 3)
	});
	slab(`shr.pull-${index + 1}`, 'shr', { x: 96, y: -61, w: 28, d: 4, r: 1 }, z + 2, 3, {
		inner: insetRim({ x: 96, y: -61, w: 28, d: 4, r: 1 }, z + 5, 1)
	});
}
slab('shr.lid', 'shr', ARCHIVE_BASE, 80, 5, {
	inner: insetRim(ARCHIVE_BASE, 85) + screws(ARCHIVE_BASE, 85)
});

// Clinical copies are model-driven: the UI reveals copy N only after N unique
// events are committed. Card 1 rests on the archive lid; card 2 rests wholly on
// card 1, so every visible state (zero, one or two) remains physically supported.
for (let index = 1; index <= 2; index += 1) {
	const card =
		index === 1 ? { x: 72, y: -113, w: 76, d: 44, r: 1 } : { x: 75, y: -111, w: 70, d: 40, r: 1 };
	const z = 84 + index;
	const rules = Array.from({ length: 3 }, (_, rule) =>
		k.lineOnTop(
			[card.x + 6, card.y + 9 + rule * 7],
			[card.x + card.w - 8, card.y + 9 + rule * 7],
			z + 1,
			P
		)
	).join('');
	slab(`shr.record-${index}`, 'shr', card, z, 1, {
		recordIndex: index,
		tone: 'hi',
		inner: insetRim(card, z + 1, 3) + L(rules, { tone: 'lo', free: true })
	});
}

// IOL: a supported routing turntable with an index ring, bridge and hub.
cylinder('iol.pedestal', 'iol', -10, 0, 28, 0, 12, { tone: 'mid' });
cylinder('iol.bearing', 'iol', -10, 0, 42, 12, 8, {
	inner: L(k.sideArc(-10, 0, 42, 16, P, 48), { tone: 'faint' })
});
cylinder('iol.turntable', 'iol', -10, 0, 38, 20, 4, {
	tone: 'hi',
	inner: dialMarks(-10, 0, 38, 24, 48)
});
slab('iol.bridge', 'iol', { x: -15, y: -32, w: 10, d: 64, r: 2 }, 24, 3, {
	tone: 'hi',
	inner: screws({ x: -15, y: -32, w: 10, d: 64, r: 2 }, 27, 3)
});
cylinder('iol.hub', 'iol', -10, 0, 8, 27, 6, {
	tone: 'hi',
	inner: L(k.ring(-10, 0, 5, 33, P, 32), { tone: 'lo' })
});

// Terminology: a versioned reference wheel beneath a physical checking press.
const TERM_BASE = { x: 70, y: 0, w: 100, d: 90, r: 5 };
slab('terminology.mount', 'terminology', TERM_BASE, 0, 6, {
	inner: insetRim(TERM_BASE, 6) + screws(TERM_BASE, 6)
});
cylinder('terminology.bearing', 'terminology', 115, 45, 34, 6, 8, { tone: 'mid' });
cylinder('terminology.reference-wheel', 'terminology', 115, 45, 30, 14, 5, {
	tone: 'hi',
	inner: dialMarks(115, 45, 30, 19, 32)
});
cylinder('terminology.hub', 'terminology', 115, 45, 7, 19, 4, {
	inner: L(k.ring(115, 45, 4.5, 23, P, 28), { tone: 'lo' })
});
cylinder('terminology.press-post', 'terminology', 160, 45, 5, 6, 28, {
	inner: L(k.sideArc(160, 45, 5, 13, P, 24), { tone: 'faint' })
});
slab('terminology.press-head', 'terminology', { x: 135, y: 40, w: 30, d: 10, r: 2 }, 34, 6, {
	inner: insetRim({ x: 135, y: 40, w: 30, d: 10, r: 2 }, 40, 2)
});
cylinder('terminology.checking-pin', 'terminology', 142, 45, 3, 19, 15, {
	tone: 'hi',
	inner: L(k.sideArc(142, 45, 3, 24, P, 24), { tone: 'faint' })
});

// Facility/worker directories are separate, small card indexes, not access keys.
for (const [component, x] of [
	['facility', -48],
	['worker', -15]
]) {
	const plan = { x, y: -115, w: 27, d: 55, r: 2 };
	slab(`${component}.index-strip`, component, plan, 0, 5, {
		inner: insetRim(plan, 5, 2.4)
	});
	for (let index = 0; index < 3; index += 1) {
		const card = { x: x + 3, y: -108 + index * 15, w: 21, d: 3, r: 0.6 };
		const front = card.y + card.d;
		const window = [
			[x + 6, front, 9],
			[x + 21, front, 9],
			[x + 21, front, 14],
			[x + 6, front, 14]
		];
		slab(`${component}.card-${index + 1}`, component, card, 5, 13, {
			tone: 'hi',
			inner: L(k.pathOf(window.map(at), true), { tone: 'faint' })
		});
	}
}

// Source/destination trays retain their original paperwork on the same plinth.
function tray(component, plan) {
	slab(`${component}.tray-floor`, component, plan, 0, 5, {
		inner: insetRim(plan, 5, 3)
	});
	slab(
		`${component}.tray-left`,
		component,
		{ x: plan.x, y: plan.y, w: 3, d: plan.d, r: 0.8 },
		5,
		8
	);
	slab(
		`${component}.tray-right`,
		component,
		{ x: plan.x + plan.w - 3, y: plan.y, w: 3, d: plan.d, r: 0.8 },
		5,
		8
	);
	slab(
		`${component}.tray-back`,
		component,
		{ x: plan.x + 3, y: plan.y, w: plan.w - 6, d: 3, r: 0.8 },
		5,
		8
	);
	for (let index = 0; index < 2; index += 1) {
		const paper = { x: plan.x + 6, y: plan.y + 6 + index, w: plan.w - 12, d: plan.d - 12, r: 0.6 };
		const z = 5 + index;
		const rules = Array.from({ length: 3 }, (_, rule) =>
			k.lineOnTop(
				[paper.x + 4, paper.y + 6 + rule * 5],
				[paper.x + paper.w - 5, paper.y + 6 + rule * 5],
				z + 1,
				P
			)
		).join('');
		slab(`${component}.source-card-${index + 1}`, component, paper, z, 1, {
			tone: 'hi',
			inner: L(rules, { tone: 'faint', free: true })
		});
	}
}
tray('clinic', { x: -215, y: 40, w: 65, d: 65, r: 3 });
tray('lab', { x: -113, y: 70, w: 65, d: 45, r: 3 });
tray('hospital', { x: 180, y: 20, w: 40, d: 70, r: 3 });

// The one moving assembly is a carriage riding two actual, continuous guides.
const carriagePlan = { x: CARRIAGE_START, y: 129, w: 24, d: 25, r: 2 };
slab('request.carriage', 'base', carriagePlan, 5, 4, {
	move: [TRAVEL, 0, 0],
	tone: 'hi',
	inner: screws(carriagePlan, 9, 3)
});
const envelopePlan = { x: CARRIAGE_START + 3, y: 133, w: 18, d: 16, r: 0.7 };
const envelopeFlap = k.onTop(
	[
		[envelopePlan.x, envelopePlan.y],
		[envelopePlan.x + 9, envelopePlan.y + 8],
		[envelopePlan.x + 18, envelopePlan.y]
	],
	10.5,
	P
);
slab('request.envelope', 'base', envelopePlan, 9, 1.5, {
	move: [TRAVEL, 0, 0],
	tone: 'hi',
	lit: true,
	inner: L(envelopeFlap, { tone: 'mid' })
});

// Every key is solved from the recorded shapes. No hand-tuned depth bias.
const states = [0, 0.25, 0.5, 0.75, 1];
A.settle(R, P, { states });
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P, {
	frames: Array.from({ length: 61 }, (_, index) => index / 60),
	apart: true
});
if (process.exitCode) process.exit(process.exitCode);

const carriageItems = R.items.filter((part) => part.piece === 'request');
const stationaryItems = R.items.filter((part) => part.piece !== 'request');
const positions = Object.fromEntries(
	Object.entries({
		clinic: -199,
		client: -150,
		facility: -106,
		worker: -60,
		iol: -15,
		lab: 34,
		terminology: 83,
		shr: 130,
		hospital: 176
	}).map(([component, x]) => [component, k.axisVector(P, [x - CARRIAGE_START, 0, 0]).map(fine)])
);

const markers = Object.fromEntries(
	Object.entries({
		clinic: [-184, 72, 26],
		client: [-140, -55, 76],
		facility: [-34.5, -96, 33],
		worker: [-1.5, -96, 33],
		iol: [-10, 0, 50],
		lab: [-80.5, 92, 26],
		terminology: [115, 45, 55],
		shr: [110, -90, 103],
		hospital: [200, 55, 28]
	}).map(([component, point]) => [component, at(point).map(fine)])
);

const shadow = `<path class="iso-halo" d="${k.haloOf(k.insetPlan(PLINTH, 5), -16, 1, P)}"/>`;
const document = {
	width: WIDTH,
	height: HEIGHT,
	parts: [
		{ id: 'stand.shadow', component: 'base', svg: shadow },
		...stationaryItems.map(({ id, component, svg, recordIndex }) => ({
			id,
			component,
			svg,
			...(recordIndex === undefined ? {} : { recordIndex })
		}))
	],
	carriage: { svg: carriageItems.map(({ svg }) => svg).join(''), positions },
	markers,
	partCount: R.solids.length,
	metadata: {
		generator: 'scripts/generate-openhie-instrument.mjs',
		kit: 'Anatomy — https://github.com/wheresryan22/anatomy',
		license: 'MIT; Copyright (c) 2026 Ryan',
		model: 'Static explanatory geometry; clinical state is owned by the OpenHIE TypeScript engine.'
	}
};
const encoded = `${JSON.stringify(document)}\n`;
if (process.argv.includes('--check')) {
	if (readFileSync(OUTPUT, 'utf8').replace(/\r\n/gu, '\n') !== encoded) {
		console.error('OpenHIE instrument geometry is stale; run its generator.');
		process.exitCode = 1;
	} else {
		console.log(`OpenHIE instrument is current: ${R.solids.length} purposeful solids.`);
	}
} else {
	mkdirSync(dirname(OUTPUT), { recursive: true });
	writeFileSync(OUTPUT, encoded);
	console.log(`OpenHIE instrument generated: ${R.solids.length} purposeful solids.`);
}

if (process.argv.includes('--preview')) {
	const previewPath = join(ROOT, '.codex-artifacts/openhie-geometry/openhie-instrument.html');
	mkdirSync(dirname(previewPath), { recursive: true });
	const body = document.parts.map(({ svg }) => svg).join('') + document.carriage.svg;
	for (const theme of ['light', 'dark']) {
		const target = theme === 'light' ? previewPath : previewPath.replace('.html', '-dark.html');
		writeFileSync(
			target,
			`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OpenHIE instrument geometry</title><style>${k.ISO_CSS}\nbody{margin:0;background:${theme === 'light' ? '#f8f5ee' : '#141617'}}.iso{max-width:1000px;margin:20px auto}.iso-stage{width:100%;height:auto}</style></head><body><main class="iso" data-theme="${theme}"><div class="iso-stage"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Mounted exchange instrument with indexing drum, archive, routing turntable, reference wheel, trays and an envelope carriage">${body}</svg></div></main></body></html>`
		);
	}
	console.log(
		'Geometry previews: .codex-artifacts/openhie-geometry/openhie-instrument{,-dark}.html'
	);
}
