import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, type NoteStatus } from '$lib/notes/model';

vi.mock('$env/dynamic/private', () => ({
	env: { NOTES_OWNER_USER_ID: '00000000-0000-0000-0000-000000000001' }
}));
vi.mock('./supabase', () => ({
	notesBackendConfigured: () => true,
	createNotesPublicClient: () => null,
	createNotesServerClient: () => null,
	resolveNotesUser: () => null
}));

// Exercise the real action, owner/freshness checks and repository together. Only the
// Supabase transport is replaced; these tests do not establish deployed SQL/RLS behavior.
import { actions } from '../../../routes/notes/studio/[id]/+page.server';

type MetadataEvent = Parameters<(typeof actions)['metadata']>[0];
const ownerId = '00000000-0000-0000-0000-000000000001';
const noteId = '00000000-0000-0000-0000-000000000002';
const privateStates = ['draft', 'private', 'archived'] as const;

function fixture(status: NoteStatus, fresh = false) {
	const document = createEmptyDocument('Original title', noteId);
	document.transcript = 'Canvas transcript';
	const row = {
		id: noteId,
		title: 'Original title',
		slug: 'original-title',
		excerpt: '',
		status,
		tags: [],
		category: null,
		cover_image_url: null,
		published_at: null,
		scheduled_for: null as string | null,
		updated_at: new Date().toISOString(),
		revision: 7,
		downloads_enabled: false,
		document,
		transcript: 'Original transcript',
		seo_title: null,
		seo_description: null,
		deleted_at: null as string | null
	};
	const publications = [
		{ activated: true, revoked: status !== 'published', title: 'Existing live snapshot' },
		{ activated: false, revoked: status !== 'scheduled', title: 'Existing pending snapshot' }
	];
	const events: string[] = [];
	const state = {
		beforeUpdate: null as (() => void) | null,
		transitionError: null as { code: string; message: string } | null
	};
	const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
		events.push(name);
		if (name === 'note_session_is_fresh') return { data: fresh, error: null };
		if (!fresh)
			return { data: null, error: { code: '42501', message: 'reauthentication_required' } };
		if (state.transitionError) return { data: null, error: state.transitionError };
		if (name === 'unpublish_note') {
			row.status = args.p_next_status as NoteStatus;
			row.scheduled_for = null;
			for (const publication of publications) publication.revoked = true;
		}
		return { data: null, error: null };
	});
	const from = vi.fn((table: string) => {
		expect(table).toBe('notes');
		const conditions: Array<[string, unknown]> = [];
		let patch: Record<string, unknown> | null = null;
		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				conditions.push([column, value]);
				return query;
			},
			is: (column: string, value: unknown) => {
				conditions.push([column, value]);
				return query;
			},
			update: (value: Record<string, unknown>) => {
				patch = value;
				return query;
			},
			maybeSingle: async () => {
				if (patch) state.beforeUpdate?.();
				const matches = conditions.every(
					([column, value]) => row[column as keyof typeof row] === value
				);
				if (!matches) return { data: null, error: null };
				if (patch) {
					events.push('metadata-update');
					Object.assign(row, patch);
				} else events.push('note-read');
				return { data: structuredClone(row), error: null };
			}
		};
		return query;
	});
	const client = { from, rpc } as unknown as SupabaseClient;
	const submit = (nextStatus: NoteStatus) => {
		const body = new URLSearchParams({
			title: 'Updated title',
			slug: 'updated-title',
			status: nextStatus,
			transcript: 'Updated transcript',
			scheduledFor: new Date(Date.now() + 86_400_000).toISOString()
		});
		const event = {
			params: { id: noteId },
			locals: { user: { id: ownerId }, supabase: client },
			url: new URL(`https://example.test/notes/studio/${noteId}`),
			request: new Request(`https://example.test/notes/studio/${noteId}`, {
				method: 'POST',
				headers: { origin: 'https://example.test' },
				body
			})
		} as unknown as MetadataEvent;
		return actions.metadata(event);
	};
	return { row, document, publications, events, state, rpc, submit };
}

describe('note metadata persistence and freshness', () => {
	it.each(privateStates)(
		'saves unchanged %s metadata with an older valid owner session',
		async (status) => {
			const f = fixture(status);
			const snapshots = structuredClone(f.publications);
			await expect(f.submit(status)).resolves.toEqual({ message: 'Note details saved.' });
			expect(f.row.title).toBe('Updated title');
			expect(f.row.status).toBe(status);
			expect(f.events).toEqual(['note-read', 'metadata-update']);
			expect(f.rpc).not.toHaveBeenCalled();
			expect(f.publications).toEqual(snapshots);
		}
	);

	it.each(
		privateStates.flatMap((from) =>
			privateStates.filter((to) => to !== from).map((to) => [from, to] as const)
		)
	)('rejects stale %s-to-%s transitions before metadata is written', async (from, to) => {
		const f = fixture(from);
		await expect(f.submit(to)).rejects.toMatchObject({ status: 401 });
		expect(f.row.title).toBe('Original title');
		expect(f.row.status).toBe(from);
		expect(f.events).toEqual(['note-read', 'note_session_is_fresh']);
	});

	it.each([
		['draft', 'published'],
		['draft', 'scheduled'],
		['published', 'published'],
		['scheduled', 'scheduled'],
		['published', 'draft'],
		['scheduled', 'private'],
		['published', 'archived'],
		['scheduled', 'archived']
	] as const)('retains freshness for %s-to-%s publication operations', async (from, to) => {
		const f = fixture(from);
		await expect(f.submit(to)).rejects.toMatchObject({ status: 401 });
		expect(f.row.title).toBe('Original title');
		expect(f.events).toEqual(['note-read', 'note_session_is_fresh']);
	});

	it.each([
		['draft', 'private'],
		['private', 'archived'],
		['archived', 'draft'],
		['published', 'draft'],
		['scheduled', 'private']
	] as const)('uses the revocation RPC for a fresh %s-to-%s transition', async (from, to) => {
		const f = fixture(from, true);
		await f.submit(to);
		expect(f.events).toEqual([
			'note-read',
			'note_session_is_fresh',
			'metadata-update',
			'unpublish_note'
		]);
		expect(f.rpc).toHaveBeenLastCalledWith('unpublish_note', {
			p_note_id: noteId,
			p_next_status: to
		});
		expect(f.row.status).toBe(to);
		expect(f.publications.every((publication) => publication.revoked)).toBe(true);
	});

	it.each(['published', 'scheduled'] as const)(
		'still creates %s editions through revision-protected RPCs',
		async (status) => {
			const f = fixture(status, true);
			const originalDocument = structuredClone(f.document);
			await f.submit(status);
			const operation = status === 'published' ? 'publish_note' : 'schedule_note';
			expect(f.rpc).toHaveBeenLastCalledWith(
				operation,
				expect.objectContaining({
					p_note_id: noteId,
					p_expected_revision: 7,
					p_published_document: expect.objectContaining({ title: 'Updated title', transcript: '' }),
					p_asset_ids: []
				})
			);
			expect(f.document).toEqual(originalDocument);
			expect(f.events.indexOf('note_session_is_fresh')).toBeLessThan(
				f.events.indexOf('metadata-update')
			);
		}
	);

	it.each(['status change', 'deletion'] as const)(
		'rejects a concurrent %s before metadata is written',
		async (change) => {
			const f = fixture('draft');
			f.state.beforeUpdate = () => {
				if (change === 'status change') f.row.status = 'published';
				else f.row.deleted_at = new Date().toISOString();
			};
			await expect(f.submit('draft')).rejects.toMatchObject({ status: 409 });
			expect(f.row.title).toBe('Original title');
			expect(f.rpc).not.toHaveBeenCalled();
		}
	);

	it('preserves publication conflict errors and reports the remaining non-atomic save boundary', async () => {
		const f = fixture('draft', true);
		const snapshots = structuredClone(f.publications);
		f.state.transitionError = { code: '40001', message: 'revision_conflict' };
		await expect(f.submit('published')).rejects.toMatchObject({ status: 409 });
		expect(f.row.title).toBe('Updated title');
		expect(f.row.status).toBe('draft');
		expect(f.publications).toEqual(snapshots);
	});
});
