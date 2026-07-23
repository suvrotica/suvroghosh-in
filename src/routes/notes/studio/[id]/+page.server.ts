import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { noteMetadataInputSchema } from '$lib/notes/schema';
import {
	archiveOwnerNote,
	deleteOwnerNote,
	duplicateOwnerNote,
	getOwnerNote,
	listOwnerNoteVersions,
	restoreOwnerNoteVersion,
	updateOwnerNoteMetadata
} from '$lib/server/notes/repository';
import {
	assertSameOrigin,
	getNotesClient,
	requireFreshNotesOwner,
	requireNotesOwner
} from '$lib/server/notes/auth';

export const load: PageServerLoad = async (event) => {
	await requireNotesOwner(event, true);
	const note = await getOwnerNote(getNotesClient(event), event.params.id);
	if (!note) throw error(404, { message: 'Note not found.' });
	return {
		note,
		versions: await listOwnerNoteVersions(getNotesClient(event), event.params.id)
	};
};

export const actions: Actions = {
	metadata: async (event) => {
		assertSameOrigin(event);
		await requireNotesOwner(event);
		const form = await event.request.formData();
		const status = String(form.get('status') ?? 'draft');
		const existing = await getOwnerNote(getNotesClient(event), event.params.id);
		if (
			status === 'published' ||
			status === 'scheduled' ||
			existing?.status === 'published' ||
			existing?.status === 'scheduled'
		) {
			await requireFreshNotesOwner(event);
		}
		const scheduledValue = String(form.get('scheduledFor') ?? '').trim();
		const scheduledDate = scheduledValue ? new Date(scheduledValue) : null;
		if (status === 'scheduled' && (!scheduledDate || Number.isNaN(scheduledDate.getTime()))) {
			return fail(400, { message: 'Choose a valid future publication date and time.' });
		}
		const parsed = noteMetadataInputSchema.safeParse({
			title: String(form.get('title') ?? ''),
			slug: String(form.get('slug') ?? ''),
			excerpt: String(form.get('excerpt') ?? ''),
			status,
			tags: String(form.get('tags') ?? '')
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean),
			category: String(form.get('category') ?? '').trim() || null,
			coverImageUrl: String(form.get('coverImageUrl') ?? '').trim() || null,
			scheduledFor: status === 'scheduled' && scheduledDate ? scheduledDate.toISOString() : null,
			transcript: String(form.get('transcript') ?? ''),
			seoTitle: String(form.get('seoTitle') ?? '').trim() || null,
			seoDescription: String(form.get('seoDescription') ?? '').trim() || null,
			downloadsEnabled: form.get('downloadsEnabled') === 'on'
		});
		if (!parsed.success) {
			return fail(400, {
				message: parsed.error.issues[0]?.message ?? 'Check the note details and try again.'
			});
		}
		await updateOwnerNoteMetadata(getNotesClient(event), event.params.id, parsed.data);
		return {
			message:
				parsed.data.status === 'published'
					? 'Published an immutable snapshot of the current saved canvas.'
					: parsed.data.status === 'scheduled'
						? 'Scheduled a frozen snapshot. Later draft edits will not alter it.'
						: 'Note details saved.'
		};
	},
	duplicate: async (event) => {
		assertSameOrigin(event);
		const owner = await requireNotesOwner(event);
		const id = await duplicateOwnerNote(getNotesClient(event), owner.id, event.params.id);
		throw redirect(303, `/notes/studio/${id}`);
	},
	restore: async (event) => {
		assertSameOrigin(event);
		await requireFreshNotesOwner(event);
		const form = await event.request.formData();
		const versionId = String(form.get('versionId') ?? '');
		const expectedRevision = Number(form.get('expectedRevision'));
		if (
			!/^[0-9a-f-]{36}$/i.test(versionId) ||
			!Number.isSafeInteger(expectedRevision) ||
			expectedRevision < 0
		) {
			return fail(400, { message: 'The selected version is invalid.' });
		}
		await restoreOwnerNoteVersion(
			getNotesClient(event),
			event.params.id,
			versionId,
			expectedRevision
		);
		throw redirect(303, `/notes/studio/${event.params.id}`);
	},
	archive: async (event) => {
		assertSameOrigin(event);
		await requireFreshNotesOwner(event);
		await archiveOwnerNote(getNotesClient(event), event.params.id);
		throw redirect(303, '/notes/studio');
	},
	delete: async (event) => {
		assertSameOrigin(event);
		await requireFreshNotesOwner(event);
		await deleteOwnerNote(getNotesClient(event), event.params.id);
		throw redirect(303, '/notes/studio');
	}
};
