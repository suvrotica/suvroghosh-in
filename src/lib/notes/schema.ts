import { z } from 'zod';
import { NOTE_DOCUMENT_VERSION } from './model';

const finiteNumber = z.number().finite();
const worldCoordinate = finiteNumber.min(-10_000_000).max(10_000_000);
const boundedDimension = finiteNumber.min(0).max(32_768);
const colour = z
	.string()
	.regex(
		/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
		'Use a valid hexadecimal colour value.'
	);
const isoDate = z.string().datetime({ offset: true });

const inkPointSchema = z.object({
	x: worldCoordinate,
	y: worldCoordinate,
	pressure: finiteNumber.min(0).max(1),
	time: finiteNumber.min(0),
	tiltX: finiteNumber.min(-90).max(90).optional(),
	tiltY: finiteNumber.min(-90).max(90).optional(),
	twist: finiteNumber.min(0).max(359).optional(),
	tangentialPressure: finiteNumber.min(-1).max(1).optional(),
	altitudeAngle: finiteNumber
		.min(0)
		.max(Math.PI / 2)
		.optional(),
	azimuthAngle: finiteNumber
		.min(0)
		.max(Math.PI * 2)
		.optional()
});

const brushStyleSchema = z.object({
	color: colour,
	size: finiteNumber.min(0.25).max(256),
	opacity: finiteNumber.min(0.01).max(1),
	texture: finiteNumber.min(0).max(1),
	smoothing: finiteNumber.min(0).max(1),
	pressure: finiteNumber.min(0).max(1),
	pressureCurve: finiteNumber.min(0.25).max(3).default(1)
});

const baseObjectSchema = z.object({
	id: z.string().min(1).max(160),
	x: worldCoordinate,
	y: worldCoordinate,
	width: boundedDimension,
	height: boundedDimension,
	rotation: finiteNumber.min(-360_000).max(360_000),
	opacity: finiteNumber.min(0).max(1),
	locked: z.boolean(),
	hidden: z.boolean(),
	zIndex: z.number().int().min(-100_000).max(100_000),
	groupId: z.string().min(1).max(160).optional(),
	createdAt: isoDate,
	updatedAt: isoDate
});

const strokeObjectSchema = baseObjectSchema.extend({
	type: z.literal('stroke'),
	tool: z.enum(['charcoal', 'pencil', 'fountain', 'marker', 'highlighter']),
	points: z.array(inkPointSchema).min(1).max(100_000),
	sourceWidth: boundedDimension,
	sourceHeight: boundedDimension,
	style: brushStyleSchema
});

const shapeObjectSchema = baseObjectSchema.extend({
	type: z.literal('shape'),
	shape: z.enum(['line', 'arrow', 'rectangle', 'ellipse']),
	from: z.object({ x: finiteNumber, y: finiteNumber }),
	to: z.object({ x: finiteNumber, y: finiteNumber }),
	stroke: colour,
	fill: colour.optional(),
	strokeWidth: finiteNumber.min(0.25).max(256),
	dash: z.array(finiteNumber.min(0).max(10_000)).max(16).optional()
});

const textObjectSchema = baseObjectSchema.extend({
	type: z.literal('text'),
	text: z.string().max(50_000),
	color: colour,
	fontSize: finiteNumber.min(6).max(512),
	fontFamily: z.enum(['sans', 'serif', 'mono']),
	align: z.enum(['left', 'center', 'right'])
});

const stickyObjectSchema = baseObjectSchema.extend({
	type: z.literal('sticky'),
	text: z.string().max(20_000),
	color: colour,
	textColor: colour,
	fontSize: finiteNumber.min(6).max(256)
});

const imageObjectSchema = baseObjectSchema.extend({
	type: z.literal('image'),
	src: z
		.string()
		.min(1)
		.max(2_800_000)
		.refine(
			(value) =>
				/^data:image\/webp;base64,/i.test(value) ||
				/^\/api\/notes\/assets\/[0-9a-f-]{36}$/i.test(value) ||
				/^\/api\/public\/notes\/assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(value) ||
				/^https:\/\//i.test(value),
			'Image sources must be a sanitised embedded image, private asset, or HTTPS URL.'
		),
	alt: z.string().max(2_000),
	mimeType: z.string().max(128).optional()
});

const tileObjectSchema = baseObjectSchema.extend({
	type: z.literal('tile'),
	title: z.string().max(160),
	color: colour,
	borderColor: colour
});

export const canvasObjectSchema = z.discriminatedUnion('type', [
	strokeObjectSchema,
	shapeObjectSchema,
	textObjectSchema,
	stickyObjectSchema,
	imageObjectSchema,
	tileObjectSchema
]);

export const noteDocumentSchema = z
	.object({
		version: z.literal(NOTE_DOCUMENT_VERSION),
		id: z.string().min(1).max(160),
		title: z.string().min(1).max(240),
		background: z.enum(['blank', 'grid', 'dots', 'lined']),
		backgroundColor: colour,
		gridSize: finiteNumber.min(8).max(256),
		snapToGrid: z.boolean(),
		showGuides: z.boolean(),
		objects: z.array(canvasObjectSchema).max(20_000),
		viewport: z.object({
			x: worldCoordinate,
			y: worldCoordinate,
			zoom: finiteNumber.min(0.05).max(16)
		}),
		transcript: z.string().max(2_000_000),
		createdAt: isoDate,
		updatedAt: isoDate
	})
	.superRefine((document, context) => {
		const ids = new Set<string>();
		for (const [index, object] of document.objects.entries()) {
			if (ids.has(object.id)) {
				context.addIssue({
					code: 'custom',
					path: ['objects', index, 'id'],
					message: 'Canvas object identifiers must be unique.'
				});
			}
			ids.add(object.id);
		}
	});

export const noteMetadataInputSchema = z
	.object({
		title: z.string().trim().min(1).max(160),
		slug: z
			.string()
			.trim()
			.min(1)
			.max(180)
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
			.refine(
				(value) =>
					![
						'studio',
						'sign-in',
						'forgot-password',
						'reset-password',
						'auth',
						'sitemap',
						'rss'
					].includes(value),
				{
					message: 'That note address is reserved.'
				}
			),
		excerpt: z.string().trim().max(500).default(''),
		status: z.enum(['draft', 'scheduled', 'published', 'archived', 'private']),
		tags: z.array(z.string().trim().min(1).max(48)).max(20).default([]),
		category: z.string().trim().max(80).nullable().default(null),
		coverImageUrl: z.string().url().startsWith('https://').max(2_000).nullable().default(null),
		scheduledFor: z.string().datetime({ offset: true }).nullable().default(null),
		transcript: z.string().max(2_000_000).default(''),
		seoTitle: z.string().trim().max(70).nullable().default(null),
		seoDescription: z.string().trim().max(170).nullable().default(null),
		downloadsEnabled: z.boolean().default(false)
	})
	.superRefine((metadata, context) => {
		if (metadata.status !== 'scheduled') return;
		if (!metadata.scheduledFor) {
			context.addIssue({
				code: 'custom',
				path: ['scheduledFor'],
				message: 'Choose a publication date and time for a scheduled note.'
			});
			return;
		}
		if (new Date(metadata.scheduledFor).getTime() <= Date.now()) {
			context.addIssue({
				code: 'custom',
				path: ['scheduledFor'],
				message: 'The scheduled publication time must be in the future.'
			});
		}
	});

export const documentSaveInputSchema = z.object({
	revision: z.number().int().min(0),
	document: noteDocumentSchema
});

export const createNoteInputSchema = z.object({
	title: z.string().trim().min(1).max(160).default('Untitled note')
});

export type NoteMetadataInput = z.infer<typeof noteMetadataInputSchema>;
