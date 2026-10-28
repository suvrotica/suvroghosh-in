import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '$lib/notes/model';

const mocked = vi.hoisted(() => ({
	getOwnerNote: vi.fn(),
	saveOwnerDocument: vi.fn(),
	validatePreparedWebp: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: { NOTES_OWNER_USER_ID: 'owner' } }));
vi.mock('./supabase', () => ({
	notesBackendConfigured: () => true,
	createNotesServerClient: () => null,
	resolveNotesUser: () => null
}));
vi.mock('./repository', () => mocked);
vi.mock('./images', () => ({ validatePreparedWebp: mocked.validatePreparedWebp }));
import { PATCH } from '../../../routes/api/notes/[id]/document/+server';
import { POST } from '../../../routes/api/notes/[id]/assets/+server';

const noteId = '10000000-0000-4000-8000-000000000001';
const key = '10000000-0000-4000-8000-000000000002';
const documentBody = () =>
	JSON.stringify({ revision: 3, document: createEmptyDocument('Note', noteId) });

type MutationKind = 'document' | 'assets';
type MutationEvent<Kind extends MutationKind> = Kind extends 'document'
	? Parameters<typeof PATCH>[0]
	: Parameters<typeof POST>[0];

function invokeMutation(kind: MutationKind, event: MutationEvent<MutationKind>) {
	return kind === 'document'
		? PATCH(event as MutationEvent<'document'>)
		: POST(event as MutationEvent<'assets'>);
}

function fixture<Kind extends MutationKind>(
	body: BodyInit,
	kind: Kind,
	headers: Record<string, string> = {}
) {
	const request = new Request(`https://site.example/api/notes/${noteId}/${kind}`, {
		method: kind === 'document' ? 'PATCH' : 'POST',
		headers: {
			origin: 'https://site.example',
			...(kind === 'document'
				? { 'content-type': 'application/json', 'x-idempotency-key': key }
				: {}),
			...headers
		},
		body,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	});
	const upload = vi.fn().mockResolvedValue({ error: null });
	const insert = vi.fn().mockResolvedValue({ error: null });
	const remove = vi.fn().mockResolvedValue({ error: null });
	const from = vi.fn(() => ({
		select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
		insert
	}));
	const event = {
		request,
		url: new URL(request.url),
		params: { id: noteId },
		locals: {
			user: { id: 'owner' },
			supabase: { from, storage: { from: () => ({ upload, remove }) }, auth: { signOut: vi.fn() } }
		}
	} as unknown as MutationEvent<Kind>;
	return { event, from, upload, insert };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocked.getOwnerNote.mockResolvedValue({ id: noteId });
	mocked.saveOwnerDocument.mockResolvedValue(4);
	mocked.validatePreparedWebp.mockResolvedValue({
		bytes: new Uint8Array([1, 2, 3]),
		width: 4,
		height: 5
	});
});
afterEach(() => vi.useRealTimers());

describe('Notes mutation request boundaries', () => {
	it.each(['document', 'assets'] as const)(
		'rejects a streamed oversized %s body before persistence',
		async (kind) => {
			const cancel = vi.fn();
			const max = (kind === 'document' ? 4 : 3) * 1024 * 1024;
			const body = new ReadableStream({
				start: (controller) => controller.enqueue(new Uint8Array(max + 1)),
				cancel
			});
			const { event, from, upload } = fixture(body, kind, {
				'content-length': '1',
				'content-type':
					kind === 'document' ? 'application/json' : 'multipart/form-data; boundary=sample'
			});
			await expect(invokeMutation(kind, event)).rejects.toMatchObject({
				status: 413
			});
			expect(cancel).toHaveBeenCalled();
			expect(from).not.toHaveBeenCalled();
			expect(upload).not.toHaveBeenCalled();
			expect(mocked.saveOwnerDocument).not.toHaveBeenCalled();
		}
	);

	it.each(['document', 'assets'] as const)(
		'cancels a stalled %s input after ten seconds',
		async (kind) => {
			vi.useFakeTimers();
			const cancel = vi.fn();
			const { event } = fixture(new ReadableStream({ cancel }), kind, {
				'content-type':
					kind === 'document' ? 'application/json' : 'multipart/form-data; boundary=sample'
			});
			const result = expect(invokeMutation(kind, event)).rejects.toMatchObject({
				status: 408
			});
			await vi.advanceTimersByTimeAsync(10_001);
			await result;
			expect(cancel).toHaveBeenCalled();
			expect(mocked.saveOwnerDocument).not.toHaveBeenCalled();
		}
	);

	it('preserves valid autosave, idempotency, revision conflict and private response headers', async () => {
		const { event } = fixture(documentBody(), 'document');
		const response = await PATCH(event);
		expect(await response.json()).toEqual({ revision: 4 });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocked.saveOwnerDocument).toHaveBeenCalledWith(
			expect.anything(),
			noteId,
			3,
			expect.objectContaining({ id: noteId, transcript: '' }),
			key
		);
		mocked.saveOwnerDocument.mockResolvedValue(null);
		const conflict = await PATCH(fixture(documentBody(), 'document').event);
		expect(conflict.status).toBe(409);
	});

	it.each(['null', '[]', '{', '"note"'])('rejects malformed document body %s', async (body) => {
		await expect(PATCH(fixture(body, 'document').event)).rejects.toMatchObject({ status: 400 });
		expect(mocked.saveOwnerDocument).not.toHaveBeenCalled();
	});

	it('rejects invalid UTF-8, wrong media type and missing idempotency keys', async () => {
		await expect(PATCH(fixture(new Uint8Array([255]), 'document').event)).rejects.toMatchObject({
			status: 400
		});
		await expect(
			PATCH(fixture(documentBody(), 'document', { 'content-type': 'text/plain' }).event)
		).rejects.toMatchObject({ status: 415 });
		await expect(
			PATCH(fixture(documentBody(), 'document', { 'x-idempotency-key': '' }).event)
		).rejects.toMatchObject({ status: 400 });
	});

	it('preserves multipart WebP validation and private storage on a valid upload', async () => {
		const form = new FormData();
		form.set(
			'file',
			new File([new Uint8Array([1, 2, 3])], 'prepared.webp', { type: 'image/webp' })
		);
		form.set('alt', ' A useful image description ');
		const { event, upload, insert } = fixture(form, 'assets');
		const response = await POST(event);
		expect(response.status).toBe(201);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.json()).toMatchObject({
			width: 4,
			height: 5,
			alt: 'A useful image description'
		});
		expect(mocked.validatePreparedWebp).toHaveBeenCalledWith(expect.any(File));
		expect(upload).toHaveBeenCalledWith(
			expect.stringMatching(/^owner\//),
			new Uint8Array([1, 2, 3]),
			expect.objectContaining({ contentType: 'image/webp', upsert: false })
		);
		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({ owner_id: 'owner', note_id: noteId })
		);
	});

	it('rejects malformed multipart and unsupported media types', async () => {
		await expect(
			POST(fixture('broken', 'assets', { 'content-type': 'multipart/form-data' }).event)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			POST(fixture('{}', 'assets', { 'content-type': 'application/json' }).event)
		).rejects.toMatchObject({ status: 415 });
		expect(mocked.getOwnerNote).not.toHaveBeenCalled();
	});

	it('does not let Fetch Metadata override a conflicting Origin or bypass owner authentication', async () => {
		await expect(
			PATCH(
				fixture(documentBody(), 'document', {
					origin: 'https://evil.example',
					'sec-fetch-site': 'same-origin'
				}).event
			)
		).rejects.toMatchObject({ status: 403 });
		const { event } = fixture(documentBody(), 'document');
		event.locals.user = null;
		await expect(PATCH(event)).rejects.toMatchObject({ status: 401 });
		expect(mocked.saveOwnerDocument).not.toHaveBeenCalled();
	});
});
