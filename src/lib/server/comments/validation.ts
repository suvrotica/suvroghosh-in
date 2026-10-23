import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { COMMENT_STATUSES } from '$lib/comments/types';

export const commentId = z.string().uuid();
export const postSlug = z
	.string()
	.min(1)
	.max(180)
	.regex(/^[a-z0-9_-]+$/);
function hasControlCharacters(value: string, allowLineWhitespace = false) {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code === 127 || (code < 32 && !(allowLineWhitespace && [9, 10, 13].includes(code)));
	});
}
const body = z
	.string()
	.trim()
	.min(1)
	.max(3000)
	.refine((value) => !hasControlCharacters(value, true));
const name = z
	.string()
	.trim()
	.min(1)
	.max(60)
	.refine((value) => !hasControlCharacters(value));

export const guestSubmission = z
	.object({
		postSlug,
		parentId: commentId.nullable(),
		name,
		body,
		submissionId: commentId,
		website: z.string().max(200).default('')
	})
	.strict();

export const ownerMutation = z.discriminatedUnion('action', [
	z
		.object({ action: z.literal('moderate'), id: commentId, status: z.enum(COMMENT_STATUSES) })
		.strict(),
	z.object({ action: z.literal('read'), id: commentId }).strict(),
	z
		.object({ action: z.literal('reply'), parentId: commentId, body, submissionId: commentId })
		.strict()
]);

export function parsePage(value: string | null) {
	if (value === null) return 1;
	if (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 5000)
		throw error(400, 'Choose a valid comments page.');
	return Number(value);
}

export function parsePost(value: string | null) {
	const result = postSlug.safeParse(value);
	if (!result.success) throw error(400, 'Choose a valid article.');
	return result.data;
}
