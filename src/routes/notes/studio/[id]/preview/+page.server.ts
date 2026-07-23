import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNotesClient, requireNotesOwner } from '$lib/server/notes/auth';
import { getOwnerNote } from '$lib/server/notes/repository';

export const load: PageServerLoad = async (event) => {
	await requireNotesOwner(event, true);
	const note = await getOwnerNote(getNotesClient(event), event.params.id);
	if (!note) throw error(404, { message: 'Note not found.' });
	return { note };
};
