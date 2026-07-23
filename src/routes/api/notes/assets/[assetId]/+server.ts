import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNotesClient, requireNotesOwner } from '$lib/server/notes/auth';

export const GET: RequestHandler = async (event) => {
	await requireNotesOwner(event);
	const client = getNotesClient(event);
	const { data: asset, error: queryError } = await client
		.from('note_assets')
		.select('private_path,mime_type')
		.eq('id', event.params.assetId)
		.maybeSingle();
	if (queryError || !asset) throw error(404, { message: 'Not found' });
	const { data, error: downloadError } = await client.storage
		.from('notes-private')
		.download(asset.private_path as string);
	if (downloadError || !data) throw error(404, { message: 'Not found' });
	return new Response(data, {
		headers: {
			'content-type': String(asset.mime_type ?? 'application/octet-stream'),
			'content-length': String(data.size),
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
