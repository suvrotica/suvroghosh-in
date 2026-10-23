import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline } from '$lib/server/http/body';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import { getNotesClient } from '$lib/server/notes/auth';
import { getPublishedPost, getPublishedPosts } from '$lib/server/content/posts';
import type { AdminComment, CommentPage, CommentStatus, PublicComment } from '$lib/comments/types';
import { commentAddress } from './http';

export function publishedCommentPost(slug: string) {
	const post = getPublishedPost(slug);
	if (!post) throw error(404, 'This article is not available for comments.');
	return post;
}

function adminClient() {
	const client = createNotesAdminClient();
	if (!client) throw error(503, 'Comments storage is not configured.');
	return client;
}

export async function commentsRpc<T>(
	client: SupabaseClient,
	name: string,
	parameters: Record<string, unknown> = {}
): Promise<T> {
	const result = await withDeadline(
		async (signal) => await client.rpc(name, parameters).abortSignal(signal),
		5000
	);
	if (result.error) {
		if (result.error.code === '23505')
			throw error(
				409,
				'This submission has already been used. Edit the reply before trying again.'
			);
		if (result.error.code === '22023') throw error(400, 'Invalid comment request.');
		if (result.error.code === '42501')
			throw error(403, 'You do not have permission to manage comments.');
		throw error(503, 'Comments storage is temporarily unavailable.');
	}
	return result.data as T;
}

// Explicitly project public fields so moderation metadata can never be serialized accidentally.
function publicComment(row: PublicComment): PublicComment {
	return {
		id: row.id,
		parent_id: row.parent_id,
		display_name: row.display_name,
		body: row.body,
		is_author: row.is_author,
		created_at: row.created_at,
		reply_count: row.reply_count
	};
}

export async function listPublicComments(
	slug: string,
	parent: string | null,
	page: number
): Promise<CommentPage> {
	publishedCommentPost(slug);
	const result = await commentsRpc<Omit<CommentPage, 'page' | 'pageSize'>>(
		adminClient(),
		'get_post_comments',
		{
			p_post_slug: slug,
			p_parent_id: parent,
			p_page: page
		}
	);
	return {
		comments: result.comments.map(publicComment),
		total: result.total,
		commentCount: result.commentCount,
		page,
		pageSize: 20
	};
}

export async function commentRateKey(event: RequestEvent) {
	if (!env.NOTES_RATE_LIMIT_SALT || env.NOTES_RATE_LIMIT_SALT.length < 32)
		throw error(503, 'Secure comment submission is not configured.');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(env.NOTES_RATE_LIMIT_SALT),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	// Daily rotation; the database keeps only short-lived abuse counters, never the address.
	const value = `post-comments:${new Date().toISOString().slice(0, 10)}:${commentAddress(event)}`;
	const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function submitGuestComment(
	input: {
		postSlug: string;
		parentId: string | null;
		name: string;
		body: string;
		submissionId: string;
	},
	rateKey: string
) {
	publishedCommentPost(input.postSlug);
	return commentsRpc<string>(adminClient(), 'submit_post_comment', {
		p_post_slug: input.postSlug,
		p_parent_id: input.parentId,
		p_display_name: input.name,
		p_body: input.body,
		p_submission_id: input.submissionId,
		p_rate_key: rateKey
	});
}

export async function moderationCounts(event: RequestEvent) {
	return commentsRpc<{ pending: number; unread: number }>(
		getNotesClient(event),
		'get_comment_moderation_counts'
	);
}

export async function moderationQueue(
	event: RequestEvent,
	status: CommentStatus | 'all',
	slug: string | null,
	page: number
) {
	if (slug) publishedCommentPost(slug);
	const result = await commentsRpc<{
		comments: AdminComment[];
		total: number;
		pending: number;
		unread: number;
	}>(getNotesClient(event), 'get_comment_moderation_queue', {
		p_status: status,
		p_post_slug: slug,
		p_page: page
	});
	return {
		...result,
		page,
		pageSize: 20,
		articles: getPublishedPosts().map((post) => ({
			slug: post.slug,
			title: post.title,
			href: `/blog/${post.categorySlug}/${post.slug}`
		}))
	};
}

export async function moderateComment(
	event: RequestEvent,
	id: string,
	status: CommentStatus | null,
	markRead = true
) {
	return commentsRpc<string>(getNotesClient(event), 'moderate_post_comment', {
		p_id: id,
		p_status: status,
		p_mark_read: markRead
	});
}

export async function replyToComment(
	event: RequestEvent,
	parentId: string,
	body: string,
	submissionId: string
) {
	return commentsRpc<string>(getNotesClient(event), 'reply_to_post_comment', {
		p_parent_id: parentId,
		p_body: body,
		p_submission_id: submissionId
	});
}
