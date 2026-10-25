import { labOwner } from '$lib/server/synthetic-data-lab/proxy';
import type { PageServerLoad } from './$types';

export const prerender = false;
export const load: PageServerLoad = ({ cookies, url, setHeaders }) => {
	labOwner(cookies, url.protocol === 'https:');
	setHeaders({ 'Cache-Control': 'private, no-store' });
	return {};
};
