import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexRobots, siteUrl } from '$lib/components/seo/SEO';
import { demoPublishedNote } from '$lib/notes/demo';
import { load } from '../../../routes/notes/+page.server';
import { listPublishedNotes } from './repository';

const mocks = vi.hoisted(() => ({ createNotesPublicClient: vi.fn() }));

vi.mock('./supabase', () => ({ createNotesPublicClient: mocks.createNotesPublicClient }));

const publication = {
	id: '00000000-0000-4000-8000-000000000001',
	note_id: '00000000-0000-4000-8000-000000000002',
	title: 'Published field note',
	slug: 'published-field-note',
	excerpt: 'The visible publication snapshot.',
	tags: ['Field notes'],
	category: 'Notebook',
	cover_image_url: null,
	published_at: '2026-10-21T00:00:00Z',
	source_revision: 2,
	downloads_enabled: false
};

function backend(body: unknown, status = 200, total = 1) {
	const fetch = vi.fn<typeof globalThis.fetch>(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: {
					'content-type': 'application/json',
					'content-range': `*/${total}`,
					'retry-after': '0'
				}
			})
	);
	const client = createClient('https://notes.invalid', 'test-publishable-key', {
		auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
		global: { fetch }
	});
	mocks.createNotesPublicClient.mockReturnValue(client);
	return fetch;
}

function loadShelf(path: string) {
	const setHeaders = vi.fn();
	return load({
		url: new URL(path, 'https://www.suvroghosh.in'),
		setHeaders
	} as unknown as Parameters<typeof load>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.createNotesPublicClient.mockReturnValue(null);
});

describe('published Notes pagination', () => {
	it('keeps the demo first page available and rejects later demo pages', async () => {
		await expect(listPublishedNotes()).resolves.toMatchObject({
			notes: [{ id: demoPublishedNote.id }],
			total: 1
		});
		await expect(listPublishedNotes('', 2)).rejects.toMatchObject({ status: 404 });
	});

	it('allows an empty first-page search without inventing later demo pages', async () => {
		await expect(listPublishedNotes('no-matching-demo-note')).resolves.toEqual({
			notes: [],
			total: 0
		});
		await expect(listPublishedNotes('no-matching-demo-note', 2)).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 404 for a real Supabase out-of-range response on a later page', async () => {
		const fetch = backend(
			{ code: 'PGRST103', message: 'Requested range not satisfiable', details: '', hint: null },
			416
		);
		await expect(listPublishedNotes('', 2)).rejects.toMatchObject({ status: 404 });
		const url = new URL(String(fetch.mock.calls[0]?.[0]));
		expect(url.searchParams.get('offset')).toBe('12');
		expect(url.searchParams.get('limit')).toBe('12');
		expect(url.searchParams.get('activated_at')).toBe('not.is.null');
		expect(url.searchParams.get('revoked_at')).toBe('is.null');
	});

	it.each([
		{ page: Number.MAX_SAFE_INTEGER, pageSize: 12 },
		{ page: Math.floor(Number.MAX_SAFE_INTEGER / 12) + 1, pageSize: 12 },
		{ page: Number.MAX_SAFE_INTEGER, pageSize: 1_000 }
	])(
		'rejects an unsafe range before fetching: page $page, size $pageSize',
		async ({ page, pageSize }) => {
			const fetch = backend([publication]);
			await expect(listPublishedNotes('', page, pageSize)).rejects.toMatchObject({ status: 404 });
			expect(fetch).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ status: 503, code: 'PGRST000' },
		{ status: 500, code: 'PGRST103' },
		{ status: 416, code: 'UNEXPECTED' }
	])('preserves backend failure status for $status/$code', async ({ status, code }) => {
		backend({ code, message: 'Backend failed', details: '', hint: null }, status);
		await expect(listPublishedNotes('', 2)).rejects.toMatchObject({ status: 503 });
	});

	it('does not reinterpret a first-page upstream range error as a missing page', async () => {
		backend({ code: 'PGRST103', message: 'Backend range failed' }, 416);
		await expect(listPublishedNotes()).rejects.toMatchObject({ status: 503 });
	});

	it('treats successful empty later pages as missing while keeping an empty shelf available', async () => {
		backend([], 200, 0);
		await expect(listPublishedNotes()).resolves.toEqual({ notes: [], total: 0 });
		await expect(listPublishedNotes('', 2)).rejects.toMatchObject({ status: 404 });
	});
});

describe('public Notes search metadata', () => {
	it('preserves the first-page title and description', async () => {
		await expect(loadShelf('/notes')).resolves.toMatchObject({
			page: 1,
			seo: {
				title: 'Handwritten Notes | Suvro Ghosh',
				description:
					'Handwritten field notes, diagrams, marginalia, and visual thinking by Suvro Ghosh.',
				canonicalUrl: `${siteUrl}/notes`,
				robots: indexRobots
			}
		});
	});

	it('gives a legitimate second page its own canonical and title', async () => {
		backend([publication], 200, 13);
		await expect(loadShelf('/notes?page=2')).resolves.toMatchObject({
			page: 2,
			total: 13,
			seo: {
				title: 'Handwritten Notes — Page 2 | Suvro Ghosh',
				canonicalUrl: `${siteUrl}/notes?page=2`,
				robots: indexRobots
			}
		});
	});

	it('noindexes filtered results and keeps the unfiltered shelf as their canonical', async () => {
		backend([publication], 200, 13);
		await expect(loadShelf('/notes?q=field&page=2')).resolves.toMatchObject({
			query: 'field',
			page: 2,
			seo: {
				title: 'Handwritten Notes | Suvro Ghosh',
				canonicalUrl: `${siteUrl}/notes`,
				robots: 'noindex,follow'
			}
		});
	});

	it('does not accept partially numeric page parameters as later pages', async () => {
		await expect(loadShelf('/notes?page=2garbage')).resolves.toMatchObject({
			page: 1,
			seo: { canonicalUrl: `${siteUrl}/notes` }
		});
	});

	it('rejects a safe page parameter whose computed range is unsafe without fetching', async () => {
		const fetch = backend([publication]);
		await expect(loadShelf(`/notes?page=${Number.MAX_SAFE_INTEGER}`)).rejects.toMatchObject({
			status: 404
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('propagates missing page and service errors from the repository', async () => {
		await expect(loadShelf('/notes?page=2')).rejects.toMatchObject({ status: 404 });
		backend({ code: 'PGRST000', message: 'Backend unavailable' }, 503);
		await expect(loadShelf('/notes')).rejects.toMatchObject({ status: 503 });
	});
});
