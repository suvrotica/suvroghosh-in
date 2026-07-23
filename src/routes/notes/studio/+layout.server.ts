import type { LayoutServerLoad } from './$types';
import { requireNotesOwner } from '$lib/server/notes/auth';

export const load: LayoutServerLoad = async (event) => {
	const user = await requireNotesOwner(event, true);
	event.setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	return { ownerEmail: user.email ?? 'Site owner' };
};
