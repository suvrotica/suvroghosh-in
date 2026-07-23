import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentSaveInputSchema } from '$lib/notes/schema';
import { assertSameOrigin, getNotesClient, requireNotesOwner } from '$lib/server/notes/auth';
import { saveOwnerDocument } from '$lib/server/notes/repository';
import { getOwnerNote } from '$lib/server/notes/repository';

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

export const GET: RequestHandler = async (event) => {
	await requireNotesOwner(event);
	const note = await getOwnerNote(getNotesClient(event), event.params.id);
	if (!note) throw error(404, { message: 'Not found' });
	return json(
		{ revision: note.revision, document: note.document },
		{ headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } }
	);
};

export const PATCH: RequestHandler = async (event) => {
	assertSameOrigin(event);
	await requireNotesOwner(event);
	const idempotencyKey = event.request.headers.get('x-idempotency-key') ?? '';
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			idempotencyKey
		)
	) {
		throw error(400, { message: 'An idempotency key is required.' });
	}
	const declaredLength = Number(event.request.headers.get('content-length') ?? '0');
	if (declaredLength > MAX_REQUEST_BYTES) {
		throw error(413, { message: 'This autosave is larger than the supported request limit.' });
	}
	const body = await event.request.text();
	if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
		throw error(413, { message: 'This autosave is larger than the supported request limit.' });
	}
	let input: unknown;
	try {
		input = JSON.parse(body);
	} catch {
		throw error(400, { message: 'The autosave body is not valid JSON.' });
	}
	const parsed = documentSaveInputSchema.safeParse(input);
	if (!parsed.success) {
		throw error(400, {
			message: parsed.error.issues[0]?.message ?? 'The note document is invalid.'
		});
	}
	if (parsed.data.document.id !== event.params.id) {
		throw error(400, { message: 'The document identifier does not match the note.' });
	}
	const revision = await saveOwnerDocument(
		getNotesClient(event),
		event.params.id,
		parsed.data.revision,
		{ ...parsed.data.document, transcript: '' },
		idempotencyKey
	);
	if (revision === null) {
		return json(
			{ code: 'revision_conflict', message: 'The cloud note changed in another session.' },
			{ status: 409 }
		);
	}
	return json(
		{ revision },
		{ headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } }
	);
};
