import type { Catalogue } from '$lib/visualizations/videos-i-like/types';
import { MAX_PLAYLIST_PAGES, PLAYLIST_BATCH_SIZE, type GalleryQuery } from './service';

export function parseGalleryQuery(value: unknown, catalogue: Catalogue): GalleryQuery | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	if (Object.keys(input).length === 0) return {};
	if (Object.keys(input).length === 1 && typeof input.batch === 'number') {
		const batchCount = Math.ceil(
			catalogue.entries.filter((entry) => entry.kind === 'playlist').length / PLAYLIST_BATCH_SIZE
		);
		return Number.isInteger(input.batch) && input.batch >= 0 && input.batch < batchCount
			? { batch: input.batch }
			: null;
	}
	if (
		Object.keys(input).length !== 2 ||
		typeof input.playlistKey !== 'string' ||
		typeof input.page !== 'number' ||
		!Number.isInteger(input.page) ||
		input.page < 1 ||
		input.page >= MAX_PLAYLIST_PAGES
	)
		return null;
	if (
		!catalogue.entries.some((entry) => entry.kind === 'playlist' && entry.key === input.playlistKey)
	)
		return null;
	return { playlistKey: input.playlistKey, page: input.page };
}

/** Match the established production-only geography trust boundary; never infer from server location. */
export function viewerCountry(
	headers: Headers,
	url: URL,
	environment: Record<string, string | undefined>
): string | undefined {
	if (
		environment.VERCEL !== '1' ||
		environment.VERCEL_ENV !== 'production' ||
		url.origin !== 'https://www.suvroghosh.in'
	)
		return undefined;
	const country = headers.get('x-vercel-ip-country');
	return country && /^[A-Z]{2}$/.test(country) ? country : undefined;
}
