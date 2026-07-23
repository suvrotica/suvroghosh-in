import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPublishedNoteMetadata, listPublishedNotes } from '$lib/server/notes/repository';
import { demoPublishedNote } from '$lib/notes/demo';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const note = await getPublishedNoteMetadata(params.slug);
	if (!note) throw error(404, { message: 'This handwritten note is not published.' });
	const { notes } = await listPublishedNotes('', 1, 6);
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate' });
	return {
		note,
		related: notes.filter((candidate) => candidate.id !== note.id).slice(0, 3),
		initialDocument: note.id === demoPublishedNote.id ? demoPublishedNote.document : null
	};
};
