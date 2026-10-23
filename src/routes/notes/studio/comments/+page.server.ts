import { requireNotesOwner } from '$lib/server/notes/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// Page loads run independently of the parent layout during client navigation.
	await requireNotesOwner(event, true);
	// Private comment data is fetched through the independently authorised API.
	return {};
};
