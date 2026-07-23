import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSameOrigin, getNotesClient, requireNotesOwner } from '$lib/server/notes/auth';
import { getOwnerNote } from '$lib/server/notes/repository';
import { validatePreparedWebp } from '$lib/server/notes/images';

export const POST: RequestHandler = async (event) => {
	assertSameOrigin(event);
	const owner = await requireNotesOwner(event);
	const declaredLength = Number(event.request.headers.get('content-length') ?? '0');
	if (declaredLength > 3 * 1024 * 1024) {
		throw error(413, { message: 'The image upload request is too large.' });
	}
	const client = getNotesClient(event);
	const note = await getOwnerNote(client, event.params.id);
	if (!note) throw error(404, { message: 'Not found' });
	const { data: existingAssets, error: quotaError } = await client
		.from('note_assets')
		.select('byte_size')
		.eq('note_id', note.id)
		.limit(251);
	if (quotaError) throw error(503, { message: 'The image quota could not be checked.' });
	const existingBytes = (existingAssets ?? []).reduce(
		(total, asset) => total + Number(asset.byte_size),
		0
	);
	if ((existingAssets?.length ?? 0) >= 250 || existingBytes >= 200 * 1024 * 1024) {
		throw error(413, {
			message: 'This note has reached its private image quota (250 images or 200 MB).'
		});
	}
	const form = await event.request.formData();
	const file = form.get('file');
	const alt = String(form.get('alt') ?? '')
		.trim()
		.slice(0, 2_000);
	if (!(file instanceof File)) throw error(400, { message: 'Choose an image to upload.' });
	const { bytes, width, height } = await validatePreparedWebp(file);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const contentSha256 = [...new Uint8Array(digest)]
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
	const assetId = crypto.randomUUID();
	const storagePath = `${owner.id}/${note.id}/${assetId}.webp`;
	const { error: uploadError } = await client.storage
		.from('notes-private')
		.upload(storagePath, bytes, {
			contentType: 'image/webp',
			cacheControl: '0',
			upsert: false
		});
	if (uploadError) throw error(503, { message: 'Private image storage is unavailable.' });
	const { error: metadataError } = await client.from('note_assets').insert({
		id: assetId,
		note_id: note.id,
		owner_id: owner.id,
		private_path: storagePath,
		mime_type: 'image/webp',
		byte_size: bytes.byteLength,
		width,
		height,
		content_sha256: contentSha256,
		alt
	});
	if (metadataError) {
		await client.storage.from('notes-private').remove([storagePath]);
		throw error(500, { message: 'The image metadata could not be saved.' });
	}
	return json(
		{ assetId, src: `/api/notes/assets/${assetId}`, width, height, alt },
		{ status: 201, headers: { 'cache-control': 'private, no-store' } }
	);
};
