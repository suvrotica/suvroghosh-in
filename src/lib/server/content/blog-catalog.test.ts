import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BLOG_CATALOG_MAX_BYTES,
	BLOG_CATALOG_MAX_ITEMS,
	createPublicBlogCatalog,
	serializePublicBlogCatalog
} from './blog-catalog';
import { GET, prerender } from '../../../routes/feeds/blog-catalog.v1.json/+server';

const registry = vi.hoisted(() => ({ getPublishedPosts: vi.fn() }));
vi.mock('$lib/server/content/posts', () => registry);

const now = new Date('2026-10-25T00:00:00.000Z');
const post = (overrides: Record<string, unknown> = {}) => ({
	title: 'HIE from First Principles',
	description: 'The original source description.',
	date: '2026-04-21',
	category: 'Healthcare IT',
	tags: ['Healthcare', 'Interoperability'],
	published: true,
	slug: 'hie-first-principles-openhie',
	...overrides
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('public blog metadata catalog', () => {
	it('projects only explicit public fields and preserves source prose metadata exactly', () => {
		const source = post({
			title: 'FHIR & the Clerk: “A title”',
			description: 'An exact description — with punctuation.',
			dateModified: '2026-10-22',
			author: 'DO_NOT_EXPORT_AUTHOR',
			body: 'DO_NOT_EXPORT_BODY',
			thumbnail: '/images/DO_NOT_EXPORT_THUMBNAIL.jpg',
			faq: ['DO_NOT_EXPORT_FAQ']
		});
		const catalog = createPublicBlogCatalog([source], now);
		expect(catalog.items).toEqual([
			{
				id: 'suvroghosh.in:hie-first-principles-openhie',
				slug: source.slug,
				canonicalUrl: 'https://www.suvroghosh.in/blog/healthcare-it/hie-first-principles-openhie',
				title: source.title,
				description: source.description,
				publishedAt: source.date,
				modifiedAt: '2026-10-22',
				category: { slug: 'healthcare-it', label: 'Healthcare IT' },
				tags: source.tags
			}
		]);
		expect(JSON.stringify(catalog)).not.toContain('DO_NOT_EXPORT');
		expect(catalog.generatedAt).toBe(now.toISOString());
		expect(catalog.revision).toMatch(/^[a-f0-9]{64}$/);
	});

	it('excludes drafts, missing or string publication flags, invalid dates and future dates', () => {
		const invalid = [false, undefined, 'true'].map((published) => post({ published }));
		const dates = ['2026-02-30', '2026-02-29', 'invalid', '2026-10-26', '2026-10-25T00:00:00Z'];
		const catalog = createPublicBlogCatalog(
			[...invalid, ...dates.map((date) => post({ date })), post({ date: '2026-10-25' })],
			now
		);
		expect(catalog.items).toHaveLength(1);
		expect(catalog.items[0].publishedAt).toBe('2026-10-25');
		expect(createPublicBlogCatalog([post({ date: '2024-02-29' })], now).items).toHaveLength(1);
	});

	it('uses the UTC export day rather than the local offset and omits missing modification dates', () => {
		const before = new Date('2026-10-25T01:00:00+05:30');
		expect(createPublicBlogCatalog([post({ date: '2026-10-25' })], before).items).toHaveLength(0);
		expect(createPublicBlogCatalog([post()], now).items[0]).not.toHaveProperty('modifiedAt');
	});

	it('keeps older evergreen posts beyond RSS limits and sorts without mutating input', () => {
		const sources = [
			post(),
			...Array.from({ length: 30 }, (_, index) =>
				post({
					slug: `newer-${String(index).padStart(2, '0')}`,
					date: '2026-10-20'
				})
			)
		];
		const original = sources.slice();
		const catalog = createPublicBlogCatalog(sources, now);
		expect(catalog.items).toHaveLength(31);
		expect(catalog.items.at(-1)?.slug).toBe('hie-first-principles-openhie');
		expect(catalog.items[0].slug).toBe('newer-00');
		expect(sources).toEqual(original);
	});

	it('normalizes source categories while retaining IDs across category changes', () => {
		const original = createPublicBlogCatalog([post({ slug: 'VA_Data-2026' })], now).items[0];
		const renamed = createPublicBlogCatalog(
			[post({ slug: 'VA_Data-2026', category: 'Healthcare AI' })],
			now
		).items[0];
		expect(renamed.id).toBe(original.id);
		expect(renamed.canonicalUrl).toBe('https://www.suvroghosh.in/blog/healthcare-ai/VA_Data-2026');
	});

	it('revisions bind normalized metadata, not generation time or source order', () => {
		const sources = [post(), post({ slug: 'second', date: '2026-04-20' })];
		const catalog = createPublicBlogCatalog(sources, now);
		const later = createPublicBlogCatalog(sources.toReversed(), new Date('2026-10-25T01:00:00Z'));
		expect(catalog.revision).toBe(later.revision);
		expect(catalog.generatedAt).not.toBe(later.generatedAt);
		expect(createPublicBlogCatalog([post({ title: 'Updated title' })], now).revision).not.toBe(
			catalog.revision
		);
		expect(catalog.revision).toBe(
			createHash('sha256').update(JSON.stringify(catalog.items)).digest('hex')
		);
	});

	it.each([
		{ slug: '../escape' },
		{ slug: 'nested/slug' },
		{ slug: 'with?query' },
		{ slug: 'a'.repeat(201) },
		{ category: '!!!' },
		{ category: 'a'.repeat(129) },
		{ title: 'a'.repeat(241) },
		{ title: ' Surrounding whitespace ' },
		{ title: 'control\u0000character' },
		{ description: 'a'.repeat(1201) },
		{ tags: ['a'.repeat(81)] },
		{ tags: Array.from({ length: 21 }, () => 'tag') },
		{ tags: ['control\ncharacter'] },
		{ tags: null },
		{ dateModified: '2026-02-30' },
		{ dateModified: '2026-04-20' },
		{ dateModified: '2026-10-26' }
	])('fails closed for malformed eligible metadata: %j', (overrides) => {
		expect(() => createPublicBlogCatalog([post(overrides)], now)).toThrow();
	});

	it('rejects duplicate source identities, oversized input and invalid generation time', () => {
		expect(() => createPublicBlogCatalog([post(), post()], now)).toThrow(/duplicate/);
		expect(() =>
			createPublicBlogCatalog(
				Array.from({ length: BLOG_CATALOG_MAX_ITEMS + 1 }, () => post()),
				now
			)
		).toThrow(/item limit/);
		expect(() => createPublicBlogCatalog([], new Date(NaN))).toThrow(/export time/);
	});

	it('bounds serialized UTF-8 bytes and hashes the actual response for a strong ETag', () => {
		const catalog = createPublicBlogCatalog([post()], now);
		const serialized = serializePublicBlogCatalog(catalog);
		expect(serialized.etag).toBe(`"${createHash('sha256').update(serialized.body).digest('hex')}"`);
		expect(serialized.etag).not.toBe(`"${catalog.revision}"`);
		const oversized = {
			...catalog,
			items: Array.from({ length: 1000 }, () => ({
				...catalog.items[0],
				description: 'অ'.repeat(BLOG_CATALOG_MAX_BYTES / 1000)
			}))
		};
		expect(() => serializePublicBlogCatalog(oversized)).toThrow(/byte limit/);
	});
});

describe('prerendered catalog endpoint', () => {
	it('returns bounded JSON with static caching and no article body or image fields', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		registry.getPublishedPosts.mockReturnValue([post({ body: 'DO_NOT_EXPORT' })]);
		const response = GET();
		expect(prerender).toBe(true);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/);
		const body = await response.text();
		expect(body).not.toContain('DO_NOT_EXPORT');
		expect(JSON.parse(body)).toEqual(createPublicBlogCatalog([post()], now));
	});
});
