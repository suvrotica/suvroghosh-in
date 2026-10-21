import type { PageServerLoad } from './$types';
import { indexRobots, siteUrl } from '$lib/components/seo/SEO';
import { parsePageNumber } from '$lib/content/pagination';
import { listPublishedNotes } from '$lib/server/notes/repository';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const query = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const page = parsePageNumber(url.searchParams.get('page'));
	const result = await listPublishedNotes(query, page, 12);
	setHeaders({
		'cache-control': query ? 'public, max-age=0, must-revalidate' : 'public, max-age=60'
	});
	return {
		...result,
		query,
		page,
		pageSize: 12,
		seo: {
			title: `Handwritten Notes${!query && page > 1 ? ` — Page ${page}` : ''} | Suvro Ghosh`,
			description: query
				? 'Filtered archive of handwritten notes by Suvro Ghosh.'
				: `Handwritten field notes, diagrams, marginalia, and visual thinking by Suvro Ghosh${page > 1 ? `, page ${page}` : ''}.`,
			canonicalUrl: !query && page > 1 ? `${siteUrl}/notes?page=${page}` : `${siteUrl}/notes`,
			robots: query ? 'noindex,follow' : indexRobots
		}
	};
};
