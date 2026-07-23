import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublishedNoteDocument } from '$lib/server/notes/repository';

export const GET: RequestHandler = async ({ params, request, setHeaders }) => {
	const note = await getPublishedNoteDocument(params.slug);
	if (!note) throw error(404, { message: 'This handwritten note is not published.' });
	const etag = `"ink-note-${note.snapshotId ?? `${note.id}-${note.revision}`}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}
	setHeaders({
		etag,
		'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate'
	});
	return json({ revision: note.revision, document: note.document });
};
