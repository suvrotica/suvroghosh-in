import type { NoteDocument, PublishedNote, StrokeObject, TextObject } from './model';

const createdAt = '2026-07-23T04:00:00.000Z';

const titleObject: TextObject = {
	id: 'demo_title',
	type: 'text',
	x: -310,
	y: -190,
	width: 620,
	height: 78,
	rotation: -1.2,
	opacity: 1,
	locked: false,
	hidden: false,
	zIndex: 1,
	createdAt,
	updatedAt: createdAt,
	text: 'Notes from the margin',
	color: '#2b241c',
	fontSize: 48,
	fontFamily: 'serif',
	align: 'center'
};

function stroke(
	id: string,
	points: Array<[number, number, number]>,
	color: string,
	size: number,
	zIndex: number
): StrokeObject {
	const minX = Math.min(...points.map(([x]) => x));
	const minY = Math.min(...points.map(([, y]) => y));
	const maxX = Math.max(...points.map(([x]) => x));
	const maxY = Math.max(...points.map(([, y]) => y));
	return {
		id,
		type: 'stroke',
		tool: 'charcoal',
		x: minX,
		y: minY,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY),
		sourceWidth: Math.max(1, maxX - minX),
		sourceHeight: Math.max(1, maxY - minY),
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex,
		createdAt,
		updatedAt: createdAt,
		points: points.map(([x, y, pressure], index) => ({
			x: x - minX,
			y: y - minY,
			pressure,
			time: index * 16
		})),
		style: {
			color,
			size,
			opacity: 0.82,
			texture: 0.7,
			smoothing: 0.72,
			pressure: 0.8,
			pressureCurve: 0.72
		}
	};
}

const underline = stroke(
	'demo_underline',
	[
		[-220, -98, 0.25],
		[-120, -92, 0.55],
		[-15, -95, 0.72],
		[95, -89, 0.62],
		[220, -96, 0.32]
	],
	'#6b342c',
	7,
	2
);

const loop = stroke(
	'demo_loop',
	[
		[-210, 20, 0.3],
		[-160, -5, 0.52],
		[-105, 10, 0.7],
		[-92, 55, 0.8],
		[-135, 85, 0.68],
		[-185, 67, 0.45],
		[-190, 28, 0.35],
		[-145, 18, 0.55],
		[-70, 45, 0.72],
		[5, 78, 0.65],
		[85, 60, 0.55],
		[150, 15, 0.42],
		[210, 30, 0.3]
	],
	'#2f4a43',
	12,
	3
);

const bodyObject: TextObject = {
	id: 'demo_body',
	type: 'text',
	x: -280,
	y: 130,
	width: 560,
	height: 160,
	rotation: 0.8,
	opacity: 0.94,
	locked: false,
	hidden: false,
	zIndex: 4,
	createdAt,
	updatedAt: createdAt,
	text: 'An infinite page is useful because thought rarely arrives in rectangles.',
	color: '#3f3a31',
	fontSize: 28,
	fontFamily: 'serif',
	align: 'center'
};

export const demoDocument: NoteDocument = {
	version: 1,
	id: 'demo-margin',
	title: 'Notes from the margin',
	background: 'dots',
	backgroundColor: '#fbf7ec',
	gridSize: 28,
	snapToGrid: false,
	showGuides: true,
	objects: [titleObject, underline, loop, bodyObject],
	viewport: { x: 0, y: 0, zoom: 1 },
	transcript:
		'Notes from the margin. An infinite page is useful because thought rarely arrives in rectangles.',
	createdAt,
	updatedAt: createdAt
};

export const demoPublishedNote: PublishedNote = {
	id: 'demo-margin',
	title: 'Notes from the margin',
	slug: 'notes-from-the-margin',
	excerpt: 'A small field note about giving thought room to move.',
	status: 'published',
	tags: ['field notes', 'handwriting'],
	category: 'Notebook',
	coverImageUrl: null,
	publishedAt: createdAt,
	scheduledFor: null,
	updatedAt: createdAt,
	revision: 1,
	downloadsEnabled: true,
	document: demoDocument,
	transcript: demoDocument.transcript,
	seoTitle: null,
	seoDescription: null
};
