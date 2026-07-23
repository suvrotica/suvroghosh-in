import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type ImageObject } from './model';
import { noteDocumentSchema, noteMetadataInputSchema } from './schema';

const timestamp = '2026-07-23T12:00:00.000Z';

function image(src: string): ImageObject {
	return {
		id: 'image-1',
		type: 'image',
		src,
		alt: 'A notebook',
		mimeType: 'image/webp',
		x: 10,
		y: 20,
		width: 320,
		height: 180,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex: 1,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

function metadata(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Studio note',
		slug: 'studio-note',
		excerpt: '',
		status: 'draft',
		tags: [],
		category: null,
		coverImageUrl: null,
		scheduledFor: null,
		transcript: '',
		seoTitle: null,
		seoDescription: null,
		downloadsEnabled: false,
		...overrides
	};
}

describe('note schemas', () => {
	it('accepts an empty versioned document', () => {
		expect(noteDocumentSchema.safeParse(createEmptyDocument('Valid', 'note-valid')).success).toBe(
			true
		);
	});

	it.each([
		'data:image/webp;base64,UklGRg==',
		'/api/notes/assets/13c18eec-9c2a-4e2a-9fbb-e5792f420895',
		'https://cdn.example.com/notebook.webp'
	])('accepts a safe image source: %s', (src) => {
		const note = createEmptyDocument('Image', 'note-image');
		note.objects = [image(src)];
		expect(noteDocumentSchema.safeParse(note).success).toBe(true);
	});

	it.each([
		'data:image/svg+xml,<svg onload=alert(1)>',
		'data:image/png;base64,AAAA',
		'http://cdn.example.com/image.webp',
		'javascript:alert(1)'
	])('rejects an unsafe or unsanitised image source: %s', (src) => {
		const note = createEmptyDocument('Unsafe image', 'note-unsafe-image');
		note.objects = [image(src)];
		expect(noteDocumentSchema.safeParse(note).success).toBe(false);
	});

	it('rejects non-finite and extreme world coordinates', () => {
		const note = createEmptyDocument('Unsafe geometry', 'note-unsafe-geometry');
		note.objects = [image('https://cdn.example.com/image.webp')];
		note.objects[0].x = Number.POSITIVE_INFINITY;
		expect(noteDocumentSchema.safeParse(note).success).toBe(false);
		note.objects[0].x = 10_000_001;
		expect(noteDocumentSchema.safeParse(note).success).toBe(false);
	});

	it('rejects duplicate canvas object identifiers', () => {
		const note = createEmptyDocument('Duplicate objects', 'note-duplicate-objects');
		note.objects = [
			image('https://cdn.example.com/first.webp'),
			{ ...image('https://cdn.example.com/second.webp'), x: 400 }
		];
		const result = noteDocumentSchema.safeParse(note);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toContainEqual(
				expect.objectContaining({
					path: ['objects', 1, 'id'],
					message: 'Canvas object identifiers must be unique.'
				})
			);
		}
	});

	it('defaults pressureCurve for documents created before that brush setting existed', () => {
		const note = createEmptyDocument('Legacy pressure', 'note-legacy-pressure');
		const parsed = noteDocumentSchema.parse({
			...note,
			objects: [
				{
					id: 'stroke-1',
					type: 'stroke',
					tool: 'charcoal',
					points: [{ x: 0, y: 0, pressure: 0.5, time: 0 }],
					sourceWidth: 10,
					sourceHeight: 10,
					style: {
						color: '#2b241c',
						size: 8,
						opacity: 0.82,
						texture: 0.72,
						smoothing: 0.62,
						pressure: 0.78
					},
					x: 0,
					y: 0,
					width: 10,
					height: 10,
					rotation: 0,
					opacity: 1,
					locked: false,
					hidden: false,
					zIndex: 0,
					createdAt: timestamp,
					updatedAt: timestamp
				}
			]
		});

		const stroke = parsed.objects[0];
		expect(stroke.type).toBe('stroke');
		if (stroke.type === 'stroke') expect(stroke.style.pressureCurve).toBe(1);
	});

	it('requires scheduled notes to use a future timestamp', () => {
		expect(
			noteMetadataInputSchema.safeParse(
				metadata({
					status: 'scheduled',
					scheduledFor: new Date(Date.now() - 60_000).toISOString()
				})
			).success
		).toBe(false);
		expect(
			noteMetadataInputSchema.safeParse(
				metadata({
					status: 'scheduled',
					scheduledFor: new Date(Date.now() + 60_000).toISOString()
				})
			).success
		).toBe(true);
	});

	it.each(['studio', 'sign-in', 'forgot-password', 'reset-password', 'auth', 'sitemap', 'rss'])(
		'reserves the %s route slug',
		(slug) => {
			expect(
				noteMetadataInputSchema.safeParse(metadata({ title: 'Route collision', slug })).success
			).toBe(false);
		}
	);

	it('accepts a non-reserved slug containing a route word', () => {
		expect(
			noteMetadataInputSchema.safeParse(metadata({ title: 'Studio notes', slug: 'studio-notes' }))
				.success
		).toBe(true);
	});
});
