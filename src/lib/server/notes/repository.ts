import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import {
	createEmptyDocument,
	type EditableNote,
	type NoteDocument,
	type NoteSummary,
	type PublishedNote
} from '$lib/notes/model';
import { demoPublishedNote } from '$lib/notes/demo';
import type { NoteMetadataInput } from '$lib/notes/schema';
import { createNotesPublicClient } from './supabase';

type NoteRow = {
	id: string;
	title: string;
	slug: string;
	excerpt: string;
	status: NoteSummary['status'];
	tags: string[] | null;
	category: string | null;
	cover_image_url: string | null;
	published_at: string | null;
	scheduled_for: string | null;
	updated_at: string;
	revision: number;
	downloads_enabled: boolean;
	document?: NoteDocument;
	transcript?: string;
	seo_title?: string | null;
	seo_description?: string | null;
};

type PublicationRow = {
	id: string;
	note_id: string;
	title: string;
	slug: string;
	excerpt: string;
	tags: string[] | null;
	category: string | null;
	cover_image_url: string | null;
	published_at: string;
	source_revision: number;
	downloads_enabled: boolean;
	document?: NoteDocument;
	transcript: string;
	seo_title: string | null;
	seo_description: string | null;
};

type AssetRow = {
	id: string;
	note_id: string;
	owner_id: string;
	private_path: string;
	mime_type: string;
	byte_size: number;
	width: number;
	height: number;
	content_sha256: string;
	alt: string;
};

function toSummary(row: NoteRow): NoteSummary {
	return {
		id: row.id,
		title: row.title,
		slug: row.slug,
		excerpt: row.excerpt,
		status: row.status,
		tags: row.tags ?? [],
		category: row.category,
		coverImageUrl: row.cover_image_url,
		publishedAt: row.published_at,
		scheduledFor: row.scheduled_for,
		updatedAt: row.updated_at,
		revision: Number(row.revision),
		downloadsEnabled: row.downloads_enabled
	};
}

function publicationToSummary(row: PublicationRow): NoteSummary {
	return {
		id: row.note_id,
		snapshotId: row.id,
		title: row.title,
		slug: row.slug,
		excerpt: row.excerpt,
		status: 'published',
		tags: row.tags ?? [],
		category: row.category,
		coverImageUrl: row.cover_image_url,
		publishedAt: row.published_at,
		scheduledFor: null,
		updatedAt: row.published_at,
		revision: Number(row.source_revision),
		downloadsEnabled: row.downloads_enabled
	};
}

export function slugifyNoteTitle(title: string) {
	return (
		title
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 150) || 'untitled-note'
	);
}

function sanitiseSearchQuery(query: string) {
	return query
		.trim()
		.replace(/[^\p{L}\p{N}\s-]/gu, ' ')
		.replace(/\s+/g, ' ')
		.slice(0, 100);
}

export async function listPublishedNotes(query = '', page = 1, pageSize = 12) {
	const client = createNotesPublicClient();
	if (!client) {
		const matches =
			!query ||
			`${demoPublishedNote.title} ${demoPublishedNote.excerpt} ${demoPublishedNote.tags.join(' ')}`
				.toLowerCase()
				.includes(query.toLowerCase());
		return { notes: matches ? [demoPublishedNote] : [], total: matches ? 1 : 0 };
	}
	const safePageSize = Math.min(1_000, Math.max(1, pageSize));
	const start = Math.max(0, (Math.max(1, page) - 1) * safePageSize);
	let request = client
		.from('note_publications')
		.select(
			'id,note_id,title,slug,excerpt,tags,category,cover_image_url,published_at,source_revision,downloads_enabled',
			{ count: 'exact' }
		)
		.not('activated_at', 'is', null)
		.is('revoked_at', null)
		.order('published_at', { ascending: false })
		.range(start, start + safePageSize - 1);
	const safeQuery = sanitiseSearchQuery(query);
	if (safeQuery) {
		request = request.textSearch('search_vector', safeQuery, {
			config: 'english',
			type: 'websearch'
		});
	}
	const { data, error: queryError, count } = await request;
	if (queryError) throw error(503, { message: 'Published notes are temporarily unavailable.' });
	return {
		notes: ((data ?? []) as PublicationRow[]).map(publicationToSummary),
		total: count ?? 0
	};
}

export async function getPublishedNoteMetadata(slug: string) {
	const client = createNotesPublicClient();
	if (!client) return slug === demoPublishedNote.slug ? demoPublishedNote : null;
	const { data, error: queryError } = await client
		.from('note_publications')
		.select(
			'id,note_id,title,slug,excerpt,tags,category,cover_image_url,published_at,source_revision,downloads_enabled,transcript,seo_title,seo_description'
		)
		.eq('slug', slug)
		.not('activated_at', 'is', null)
		.is('revoked_at', null)
		.maybeSingle();
	if (queryError) throw error(503, { message: 'This note is temporarily unavailable.' });
	if (!data) return null;
	const row = data as PublicationRow;
	return {
		...publicationToSummary(row),
		transcript: row.transcript,
		seoTitle: row.seo_title,
		seoDescription: row.seo_description
	};
}

export async function getPublishedNoteDocument(slug: string) {
	const client = createNotesPublicClient();
	if (!client) return slug === demoPublishedNote.slug ? demoPublishedNote : null;
	const { data, error: queryError } = await client
		.from('note_publications')
		.select(
			'id,note_id,title,slug,excerpt,tags,category,cover_image_url,published_at,source_revision,downloads_enabled,document,transcript,seo_title,seo_description'
		)
		.eq('slug', slug)
		.not('activated_at', 'is', null)
		.is('revoked_at', null)
		.maybeSingle();
	if (queryError) throw error(503, { message: 'This note is temporarily unavailable.' });
	if (!data) return null;
	const row = data as PublicationRow;
	return {
		...publicationToSummary(row),
		document: row.document!,
		transcript: row.transcript,
		seoTitle: row.seo_title,
		seoDescription: row.seo_description
	} satisfies PublishedNote;
}

export async function listOwnerNotes(
	client: SupabaseClient,
	options: {
		query?: string;
		status?: string;
		sort?: 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
		page?: number;
		pageSize?: number;
	} = {}
) {
	const page = Math.max(1, options.page ?? 1);
	const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
	const start = (page - 1) * pageSize;
	let request = client
		.from('notes')
		.select(
			'id,title,slug,excerpt,status,tags,category,cover_image_url,published_at,scheduled_for,updated_at,revision,downloads_enabled',
			{ count: 'exact' }
		)
		.is('deleted_at', null)
		.order(options.sort?.startsWith('title-') ? 'title' : 'updated_at', {
			ascending: options.sort?.endsWith('-asc') ?? false
		})
		.order('id', { ascending: true })
		.range(start, start + pageSize - 1);
	if (options.status && options.status !== 'all') request = request.eq('status', options.status);
	const safeQuery = sanitiseSearchQuery(options.query ?? '');
	if (safeQuery) {
		request = request.or(`title.ilike.%${safeQuery}%,excerpt.ilike.%${safeQuery}%`);
	}
	const { data, error: queryError, count } = await request;
	if (queryError) throw error(500, { message: 'The notes dashboard could not be loaded.' });
	return { notes: ((data ?? []) as NoteRow[]).map(toSummary), total: count ?? 0, page, pageSize };
}

export async function getOwnerNote(client: SupabaseClient, id: string) {
	const { data, error: queryError } = await client
		.from('notes')
		.select(
			'id,title,slug,excerpt,status,tags,category,cover_image_url,published_at,scheduled_for,updated_at,revision,downloads_enabled,document,transcript,seo_title,seo_description'
		)
		.eq('id', id)
		.is('deleted_at', null)
		.maybeSingle();
	if (queryError) throw error(500, { message: 'The note could not be loaded.' });
	if (!data) return null;
	const row = data as NoteRow;
	const transcript = row.transcript ?? '';
	return {
		...toSummary(row),
		document: { ...row.document!, title: row.title, transcript },
		transcript,
		seoTitle: row.seo_title ?? null,
		seoDescription: row.seo_description ?? null
	} satisfies EditableNote;
}

export async function listOwnerNoteVersions(client: SupabaseClient, id: string, limit = 20) {
	const { data, error: queryError } = await client
		.from('note_versions')
		.select('id,revision,kind,created_at,metadata')
		.eq('note_id', id)
		.order('created_at', { ascending: false })
		.limit(Math.min(100, Math.max(1, limit)));
	if (queryError) throw error(500, { message: 'Version history could not be loaded.' });
	return (data ?? []).map((version) => ({
		id: String(version.id),
		revision: Number(version.revision),
		kind: String(version.kind),
		createdAt: String(version.created_at),
		metadata: version.metadata as Record<string, unknown>
	}));
}

export async function restoreOwnerNoteVersion(
	client: SupabaseClient,
	id: string,
	versionId: string,
	expectedRevision: number
) {
	const { data, error: restoreError } = await client.rpc('restore_note_version', {
		p_note_id: id,
		p_version_id: versionId,
		p_expected_revision: expectedRevision
	});
	if (restoreError) {
		if (restoreError.code === '40001' || restoreError.message.includes('revision_conflict')) {
			throw error(409, { message: 'The note changed before that version could be restored.' });
		}
		throw error(500, { message: 'That version could not be restored.' });
	}
	const result = Array.isArray(data) ? data[0] : data;
	return Number((result as { revision: number } | null)?.revision ?? expectedRevision);
}

export async function createOwnerNote(client: SupabaseClient, ownerId: string, title: string) {
	const id = crypto.randomUUID();
	const baseSlug = slugifyNoteTitle(title);
	const document = createEmptyDocument(title, id);
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const slug =
			attempt === 0 ? baseSlug : `${baseSlug}-${String(crypto.randomUUID()).slice(0, 6)}`;
		const { data, error: insertError } = await client
			.from('notes')
			.insert({ id, owner_id: ownerId, title, slug, document, transcript: '' })
			.select('id')
			.single();
		if (!insertError && data) return data.id as string;
		if (insertError?.code !== '23505') {
			throw error(500, { message: 'The note could not be created.' });
		}
	}
	throw error(409, { message: 'A unique note address could not be created.' });
}

export async function saveOwnerDocument(
	client: SupabaseClient,
	id: string,
	expectedRevision: number,
	document: NoteDocument,
	idempotencyKey: string
) {
	const { data, error: saveError } = await client.rpc('save_note_document', {
		p_note_id: id,
		p_expected_revision: expectedRevision,
		p_document: document,
		p_idempotency_key: idempotencyKey
	});
	if (saveError) {
		if (saveError.code === '40001' || saveError.message.includes('revision_conflict')) return null;
		throw error(500, { message: 'The note could not be saved to the cloud.' });
	}
	const result = Array.isArray(data) ? data[0] : data;
	return result ? Number((result as { revision: number }).revision) : null;
}

async function preparePublicationDocument(
	client: SupabaseClient,
	note: EditableNote,
	publicationId: string
) {
	const document = structuredClone(note.document);
	document.transcript = '';
	const assetIds = new Set<string>();
	for (const object of document.objects) {
		if (object.type !== 'image') continue;
		if (!object.alt.trim()) {
			throw error(422, {
				message: 'Add a meaningful text alternative to every image before publishing.'
			});
		}
		const match = object.src.match(/^\/api\/notes\/assets\/([0-9a-f-]{36})$/i);
		if (!match) {
			throw error(422, {
				message:
					'Every published image must be uploaded to this note. Reinsert embedded or external images before publishing.'
			});
		}
		const assetId = match[1];
		const { data: asset, error: assetError } = await client
			.from('note_assets')
			.select('id')
			.eq('id', assetId)
			.eq('note_id', note.id)
			.maybeSingle();
		if (assetError || !asset) {
			throw error(422, { message: 'A private image referenced by this note is missing.' });
		}
		assetIds.add(assetId);
		object.src = `/api/public/notes/assets/${publicationId}/${assetId}`;
	}
	return { document, assetIds: [...assetIds] };
}

function throwPublicationError(
	operation: 'publishing' | 'scheduling',
	cause: { code?: string; message: string }
) {
	if (cause.code === '40001' || cause.message.includes('revision_conflict')) {
		throw error(409, {
			message: `The canvas changed while ${operation}. Wait for “Saved to cloud”, then try again.`
		});
	}
	if (cause.code === '23505' || cause.message.includes('publication_slug_conflict')) {
		throw error(409, {
			message:
				'That public note address is still used by another live or scheduled edition. Choose a different slug or unpublish the conflicting note first.'
		});
	}
	throw error(500, { message: `The note details saved, but ${operation} failed.` });
}

export async function updateOwnerNoteMetadata(
	client: SupabaseClient,
	id: string,
	input: NoteMetadataInput
) {
	const { error: updateError } = await client
		.from('notes')
		.update({
			title: input.title,
			slug: input.slug,
			excerpt: input.excerpt,
			tags: input.tags,
			category: input.category,
			cover_image_url: input.coverImageUrl,
			transcript: input.transcript,
			seo_title: input.seoTitle,
			seo_description: input.seoDescription,
			downloads_enabled: input.downloadsEnabled
		})
		.eq('id', id);
	if (updateError) {
		if (updateError.code === '23505') {
			throw error(409, { message: 'That note address is already in use.' });
		}
		throw error(500, { message: 'The note details could not be saved.' });
	}

	if (input.status === 'published' || input.status === 'scheduled') {
		const current = await getOwnerNote(client, id);
		if (!current) throw error(404, { message: 'Not found' });
		const publicationId = crypto.randomUUID();
		const prepared = await preparePublicationDocument(client, current, publicationId);
		if (input.status === 'published') {
			const { error: publishError } = await client.rpc('publish_note', {
				p_note_id: id,
				p_expected_revision: current.revision,
				p_publication_id: publicationId,
				p_published_document: prepared.document,
				p_asset_ids: prepared.assetIds
			});
			if (publishError) throwPublicationError('publishing', publishError);
		} else {
			const { error: scheduleError } = await client.rpc('schedule_note', {
				p_note_id: id,
				p_expected_revision: current.revision,
				p_publication_id: publicationId,
				p_published_document: prepared.document,
				p_asset_ids: prepared.assetIds,
				p_scheduled_for: input.scheduledFor
			});
			if (scheduleError) throwPublicationError('scheduling', scheduleError);
		}
		return;
	}

	const { error: unpublishError } = await client.rpc('unpublish_note', {
		p_note_id: id,
		p_next_status: input.status
	});
	if (unpublishError) {
		throw error(500, {
			message: 'The note details saved, but the private-state transition failed.'
		});
	}
}

async function clonePrivateAssets(
	client: SupabaseClient,
	ownerId: string,
	sourceNoteId: string,
	duplicateNoteId: string,
	document: NoteDocument
) {
	const cloned = structuredClone(document);
	const references = cloned.objects
		.filter((object) => object.type === 'image')
		.map((object) => ({
			object,
			match: object.src.match(/^\/api\/notes\/assets\/([0-9a-f-]{36})$/i)
		}))
		.filter((entry): entry is typeof entry & { match: RegExpMatchArray } => Boolean(entry.match));
	const sourceIds = [...new Set(references.map((entry) => entry.match[1]))];
	if (sourceIds.length === 0) return { document: cloned, storagePaths: [] as string[] };

	const { data, error: queryError } = await client
		.from('note_assets')
		.select('id,note_id,owner_id,private_path,mime_type,byte_size,width,height,content_sha256,alt')
		.eq('note_id', sourceNoteId)
		.in('id', sourceIds);
	if (queryError || (data?.length ?? 0) !== sourceIds.length) {
		throw error(422, { message: 'One or more source images could not be duplicated.' });
	}

	const mapping = new Map<string, string>();
	const storagePaths: string[] = [];
	try {
		for (const asset of data as AssetRow[]) {
			const { data: blob, error: downloadError } = await client.storage
				.from('notes-private')
				.download(asset.private_path);
			if (downloadError || !blob) throw new Error('download_failed');
			const duplicateAssetId = crypto.randomUUID();
			const storagePath = `${ownerId}/${duplicateNoteId}/${duplicateAssetId}.webp`;
			const { error: uploadError } = await client.storage
				.from('notes-private')
				.upload(storagePath, blob, {
					contentType: 'image/webp',
					cacheControl: '0',
					upsert: false
				});
			if (uploadError) throw new Error('upload_failed');
			storagePaths.push(storagePath);
			const { error: metadataError } = await client.from('note_assets').insert({
				id: duplicateAssetId,
				note_id: duplicateNoteId,
				owner_id: ownerId,
				private_path: storagePath,
				mime_type: asset.mime_type,
				byte_size: asset.byte_size,
				width: asset.width,
				height: asset.height,
				content_sha256: asset.content_sha256,
				alt: asset.alt
			});
			if (metadataError) throw new Error('metadata_failed');
			mapping.set(asset.id, duplicateAssetId);
		}
	} catch {
		if (storagePaths.length > 0) await client.storage.from('notes-private').remove(storagePaths);
		await client.from('note_assets').delete().eq('note_id', duplicateNoteId);
		throw error(503, {
			message: 'The note was created, but its private images could not be copied.'
		});
	}

	for (const { object, match } of references) {
		const duplicateAssetId = mapping.get(match[1]);
		if (!duplicateAssetId) {
			throw error(500, { message: 'The duplicate image manifest is incomplete.' });
		}
		object.src = `/api/notes/assets/${duplicateAssetId}`;
	}
	return { document: cloned, storagePaths };
}

export async function duplicateOwnerNote(client: SupabaseClient, ownerId: string, id: string) {
	const source = await getOwnerNote(client, id);
	if (!source) throw error(404, { message: 'Not found' });
	const title = `${source.title} (copy)`;
	const duplicateId = await createOwnerNote(client, ownerId, title);
	const duplicate = await getOwnerNote(client, duplicateId);
	if (!duplicate) throw error(500, { message: 'The duplicate could not be loaded.' });
	const cloned = await clonePrivateAssets(client, ownerId, source.id, duplicateId, source.document);
	const revision = await saveOwnerDocument(
		client,
		duplicateId,
		duplicate.revision,
		{ ...cloned.document, id: duplicateId, title, updatedAt: new Date().toISOString() },
		crypto.randomUUID()
	);
	if (revision === null) {
		if (cloned.storagePaths.length > 0) {
			await client.storage.from('notes-private').remove(cloned.storagePaths);
		}
		throw error(409, { message: 'The duplicate changed before it could be initialised.' });
	}
	const { error: metadataError } = await client
		.from('notes')
		.update({
			excerpt: source.excerpt,
			tags: source.tags,
			category: source.category,
			cover_image_url: source.coverImageUrl,
			transcript: source.transcript,
			seo_title: source.seoTitle,
			seo_description: source.seoDescription,
			downloads_enabled: source.downloadsEnabled
		})
		.eq('id', duplicateId);
	if (metadataError) throw error(500, { message: 'The duplicate metadata could not be copied.' });
	return duplicateId;
}

export async function archiveOwnerNote(client: SupabaseClient, id: string) {
	const { error: archiveError } = await client.rpc('archive_note', { p_note_id: id });
	if (archiveError) throw error(500, { message: 'The note could not be archived.' });
}

export async function deleteOwnerNote(client: SupabaseClient, id: string) {
	const { data: assets, error: assetError } = await client
		.from('note_assets')
		.select('private_path')
		.eq('note_id', id);
	if (assetError)
		throw error(500, { message: 'The note assets could not be prepared for deletion.' });
	const { error: deleteError } = await client.rpc('delete_note', { p_note_id: id });
	if (deleteError) throw error(500, { message: 'The note could not be deleted.' });
	const paths = (assets ?? []).map((asset) => String(asset.private_path));
	if (paths.length > 0) {
		// The database deletion is authoritative. Failed blob cleanup is safe (private and
		// unreachable) and can be retried by the documented orphan-cleanup operation.
		await client.storage.from('notes-private').remove(paths);
	}
}
