import type { PageServerLoad } from './$types';
import { listPublishedNotes } from '$lib/server/notes/repository';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const query = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const result = await listPublishedNotes(query, page, 12);
	setHeaders({
		'cache-control': query ? 'public, max-age=0, must-revalidate' : 'public, max-age=60'
	});
	return { ...result, query, page, pageSize: 12 };
};
