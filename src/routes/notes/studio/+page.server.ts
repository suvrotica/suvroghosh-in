import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	archiveOwnerNote,
	createOwnerNote,
	deleteOwnerNote,
	duplicateOwnerNote,
	listOwnerNotes
} from '$lib/server/notes/repository';
import {
	assertSameOrigin,
	getNotesClient,
	requireFreshNotesOwner,
	requireNotesOwner
} from '$lib/server/notes/auth';

export const load: PageServerLoad = async (event) => {
	await requireNotesOwner(event, true);
	const query = event.url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const status = event.url.searchParams.get('status')?.slice(0, 20) ?? 'all';
	const requestedSort = event.url.searchParams.get('sort');
	const sort =
		requestedSort === 'updated-asc' ||
		requestedSort === 'title-asc' ||
		requestedSort === 'title-desc'
			? requestedSort
			: 'updated-desc';
	const page = Math.max(1, Number.parseInt(event.url.searchParams.get('page') ?? '1', 10) || 1);
	return {
		...(await listOwnerNotes(getNotesClient(event), { query, status, sort, page })),
		query,
		status,
		sort
	};
};

export const actions: Actions = {
	create: async (event) => {
		assertSameOrigin(event);
		const owner = await requireNotesOwner(event);
		const form = await event.request.formData();
		const title = String(form.get('title') ?? 'Untitled note')
			.trim()
			.slice(0, 160);
		if (!title) return fail(400, { message: 'Give the note a title.' });
		const id = await createOwnerNote(getNotesClient(event), owner.id, title);
		throw redirect(303, `/notes/studio/${id}`);
	},
	duplicate: async (event) => {
		assertSameOrigin(event);
		const owner = await requireNotesOwner(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const duplicateId = await duplicateOwnerNote(getNotesClient(event), owner.id, id);
		throw redirect(303, `/notes/studio/${duplicateId}`);
	},
	archive: async (event) => {
		assertSameOrigin(event);
		await requireFreshNotesOwner(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		await archiveOwnerNote(getNotesClient(event), id);
		return { message: 'Note archived.' };
	},
	delete: async (event) => {
		assertSameOrigin(event);
		await requireFreshNotesOwner(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		await deleteOwnerNote(getNotesClient(event), id);
		return { message: 'Note permanently deleted.', deletedNoteId: id };
	},
	signout: async (event) => {
		assertSameOrigin(event);
		await requireNotesOwner(event);
		await getNotesClient(event).auth.signOut({ scope: 'local' });
		throw redirect(303, '/notes/sign-in');
	}
};
