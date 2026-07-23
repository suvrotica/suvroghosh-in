import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createNotesAdminClient, createNotesPublicClient } from '$lib/server/notes/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ params, request }) => {
	if (!UUID.test(params.publicationId) || !UUID.test(params.assetId)) {
		throw error(404, { message: 'Not found' });
	}
	const publicClient = createNotesPublicClient();
	const adminClient = createNotesAdminClient();
	if (!publicClient || !adminClient) {
		throw error(503, { message: 'Published image delivery is not configured.' });
	}

	// This query is intentionally made with the anonymous client: RLS makes an inactive
	// or revoked snapshot indistinguishable from a missing one.
	const { data: publication } = await publicClient
		.from('note_publications')
		.select('id')
		.eq('id', params.publicationId)
		.not('activated_at', 'is', null)
		.is('revoked_at', null)
		.maybeSingle();
	if (!publication) throw error(404, { message: 'Not found' });

	const { data: reference } = await adminClient
		.from('note_publication_assets')
		.select('asset_id')
		.eq('publication_id', params.publicationId)
		.eq('asset_id', params.assetId)
		.maybeSingle();
	if (!reference) throw error(404, { message: 'Not found' });

	const { data: asset } = await adminClient
		.from('note_assets')
		.select('private_path,mime_type,byte_size,content_sha256')
		.eq('id', params.assetId)
		.maybeSingle();
	if (!asset) throw error(404, { message: 'Not found' });

	const etag = `"sha256-${String(asset.content_sha256)}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}
	const { data: blob, error: downloadError } = await adminClient.storage
		.from('notes-private')
		.download(String(asset.private_path));
	if (downloadError || !blob) throw error(404, { message: 'Not found' });
	return new Response(blob, {
		headers: {
			'content-type': 'image/webp',
			'content-length': String(blob.size),
			'cache-control': 'public, max-age=60, s-maxage=60, must-revalidate',
			etag,
			'x-content-type-options': 'nosniff'
		}
	});
};
