import { expect, test, type Page } from '@playwright/test';
import type { CommentPage, PublicComment } from '../../src/lib/comments/types';
import { usePausedMediaPreference } from '../helpers/privacy-choice';

const standardArticle = '/blog/healthcare-it/hl7-vs-fhir-explained-simply';
const articleSlug = 'hl7-vs-fhir-explained-simply';
const threadId = 'a78d103e-fd30-4412-b7ee-8d2c2aa1a131';
const replyId = 'd091d7b6-3de3-4b2e-9d38-9e5bdbbb1773';

function comment(overrides: Partial<PublicComment> = {}): PublicComment {
	return {
		id: threadId,
		parent_id: null,
		display_name: 'A reader',
		body: 'A published observation about this article.',
		is_author: false,
		created_at: '2026-10-23T08:30:00Z',
		reply_count: 0,
		...overrides
	};
}

function commentPage(
	comments: PublicComment[] = [],
	overrides: Partial<CommentPage> = {}
): CommentPage {
	return {
		comments,
		total: comments.length,
		commentCount: comments.length,
		page: 1,
		pageSize: 20,
		...overrides
	};
}

async function openComments(page: Page, path = standardArticle) {
	await page.goto(path);
	const comments = page.locator('#comments');
	await expect(comments).toHaveCount(1);
	await comments.scrollIntoViewIfNeeded();
	await expect(comments.getByRole('form', { name: 'Leave a comment', exact: true })).toBeVisible();
	return comments;
}

test.beforeEach(async ({ context, baseURL }) => {
	await usePausedMediaPreference(context);
	// Browser fixtures never contact Supabase, analytics, embeds or any other remote provider.
	await context.route('**/*', (route) =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
	);
});

test('comments load on approach, and a pending submission stays out of the public conversation', async ({
	page
}) => {
	let reads = 0;
	let ownerChecks = 0;
	const submissions: Record<string, unknown>[] = [];
	await page.route('**/api/notes/comments*', async (route) => {
		ownerChecks += 1;
		await route.fulfill({ status: 401, json: { message: 'Sign in required.' } });
	});
	await page.route('**/api/comments*', async (route) => {
		if (route.request().method() === 'POST') {
			submissions.push(route.request().postDataJSON());
			await route.fulfill({ status: 202, json: { status: 'pending' } });
		} else {
			reads += 1;
			await route.fulfill({ json: commentPage() });
		}
	});
	await page.goto(standardArticle);
	const comments = page.locator('#comments');
	await expect(comments.getByRole('button', { name: 'Load comments', exact: true })).toBeVisible();
	expect(reads).toBe(0);
	await comments.scrollIntoViewIfNeeded();
	await expect(comments.getByText('Start the conversation.', { exact: true })).toBeVisible();
	expect(reads).toBe(1);
	const form = comments.getByRole('form', { name: 'Leave a comment', exact: true });
	await form.getByLabel('Display name', { exact: true }).fill('Mira');
	await form.getByLabel('Your comment', { exact: true }).fill('A new thought awaiting approval.');
	await form.getByRole('button', { name: 'Send for approval', exact: true }).click();
	await expect(form.getByRole('status').filter({ hasText: 'awaiting approval' })).toBeVisible();
	await expect(form.getByLabel('Your comment', { exact: true })).toHaveValue('');
	await expect(comments.getByRole('list', { name: 'Published comments' })).toHaveCount(0);
	await expect(comments.getByText('A new thought awaiting approval.', { exact: true })).toHaveCount(
		0
	);
	await expect(comments.getByRole('heading', { name: 'Comments 0', exact: true })).toBeVisible();
	expect(submissions).toHaveLength(1);
	expect(submissions[0]).toMatchObject({
		postSlug: articleSlug,
		parentId: null,
		name: 'Mira',
		body: 'A new thought awaiting approval.',
		website: ''
	});
	expect(submissions[0].submissionId).toMatch(/^[0-9a-f-]{36}$/);
	expect(ownerChecks).toBe(0);
});

test('failed submissions preserve the text and retry key; editing creates a new key', async ({
	page
}) => {
	const submissions: Record<string, unknown>[] = [];
	await page.route('**/api/comments*', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.fulfill({ json: commentPage() });
			return;
		}
		submissions.push(route.request().postDataJSON());
		await route.fulfill(
			submissions.length < 3
				? { status: 503, json: { message: 'The moderation queue is temporarily unavailable.' } }
				: { status: 202, json: { status: 'pending' } }
		);
	});
	const comments = await openComments(page);
	const form = comments.getByRole('form', { name: 'Leave a comment', exact: true });
	const body = form.getByLabel('Your comment', { exact: true });
	await form.getByLabel('Display name', { exact: true }).fill('Ananya');
	await body.fill('Please retain this text if the connection fails.');
	await form.getByRole('button', { name: 'Send for approval', exact: true }).click();
	await expect(form.getByRole('alert')).toHaveText(
		'The moderation queue is temporarily unavailable.'
	);
	await expect(body).toHaveValue('Please retain this text if the connection fails.');
	await form.getByRole('button', { name: 'Send for approval', exact: true }).click();
	await expect.poll(() => submissions.length).toBe(2);
	await expect(form.getByRole('alert')).toBeVisible();
	expect(submissions[1].submissionId).toBe(submissions[0].submissionId);
	await body.fill('Please retain this text if the connection fails. Here is an edit.');
	await form.getByRole('button', { name: 'Send for approval', exact: true }).click();
	await expect(form.getByRole('status')).toContainText('awaiting approval');
	expect(submissions).toHaveLength(3);
	expect(submissions[2].submissionId).not.toBe(submissions[0].submissionId);
	await expect(body).toHaveValue('');
});

test('threads render safe plain text, server-labelled author replies, and moderated reader replies', async ({
	page
}) => {
	const unsafeText = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
	const submissions: Record<string, unknown>[] = [];
	await page.route('**/api/comments*', async (route) => {
		const request = route.request();
		if (request.method() === 'POST') {
			submissions.push(request.postDataJSON());
			await route.fulfill({ status: 202, json: { status: 'pending' } });
			return;
		}
		const url = new URL(request.url());
		if (url.searchParams.get('parent')) {
			const currentPage = Number(url.searchParams.get('page'));
			await route.fulfill({
				json: commentPage(
					[
						comment({
							id: currentPage === 1 ? replyId : '5e664328-c01e-4356-8546-6be9e8a5bff5',
							parent_id: threadId,
							display_name: currentPage === 1 ? 'Suvro Ghosh' : 'Another reader',
							body:
								currentPage === 1 ? 'Thank you. Here is the author’s reply.' : 'A second reply.',
							is_author: currentPage === 1
						})
					],
					{ total: 2, commentCount: 3, page: currentPage, pageSize: 1 }
				)
			});
		} else {
			await route.fulfill({
				json: commentPage([comment({ body: unsafeText, reply_count: 2 })], { commentCount: 3 })
			});
		}
	});
	const comments = await openComments(page);
	await expect(comments.getByText(unsafeText, { exact: true })).toBeVisible();
	await expect(comments.locator('img, script, iframe')).toHaveCount(0);
	await comments.getByRole('button', { name: /View 2 replies/ }).click();
	await expect(
		comments.getByText('Thank you. Here is the author’s reply.', { exact: true })
	).toBeVisible();
	await expect(comments.getByText('Author', { exact: true })).toHaveCount(1);
	await comments.getByRole('button', { name: 'Load more replies', exact: true }).click();
	await expect(comments.getByText('A second reply.', { exact: true })).toBeVisible();
	await expect(
		comments.getByRole('button', { name: 'Load more replies', exact: true })
	).toHaveCount(0);
	await comments.screenshot({ path: '.codex-artifacts/comments-thread-desktop.png' });
	await comments.getByRole('button', { name: 'Reply to A reader', exact: true }).click();
	const replyForm = comments.getByRole('form', { name: 'Leave a reply', exact: true });
	await replyForm.getByLabel('Display name', { exact: true }).fill('Mira');
	await replyForm
		.getByLabel('Your reply', { exact: true })
		.fill('A reply still awaiting approval.');
	await replyForm.getByRole('button', { name: 'Send for approval', exact: true }).click();
	await expect(replyForm.getByRole('status')).toContainText('awaiting approval');
	expect(submissions[0]).toMatchObject({
		parentId: threadId,
		body: 'A reply still awaiting approval.'
	});
	await expect(comments.getByText('A reply still awaiting approval.', { exact: true })).toHaveCount(
		0
	);
	await comments.getByRole('button', { name: /Hide 2 replies/ }).click();
	await expect(
		comments.getByText('Thank you. Here is the author’s reply.', { exact: true })
	).toHaveCount(0);
});

test('pagination and refresh reflect the current approved conversation', async ({ page }) => {
	let hidden = false;
	await page.route('**/api/comments*', async (route) => {
		const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'));
		await route.fulfill({
			json: hidden
				? commentPage()
				: commentPage(
						[
							comment({
								id: requestedPage === 1 ? threadId : replyId,
								body: requestedPage === 1 ? 'The first page thread.' : 'The second page thread.'
							})
						],
						{ total: 2, commentCount: 2, page: requestedPage, pageSize: 1 }
					)
		});
	});
	const comments = await openComments(page);
	await expect(comments.getByText('The first page thread.', { exact: true })).toBeVisible();
	const pagination = comments.getByRole('navigation', { name: 'Comment pages' });
	await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();
	await pagination.getByRole('button', { name: 'Next page' }).click();
	await expect(comments.getByText('The second page thread.', { exact: true })).toBeVisible();
	await expect(comments.getByText('The first page thread.', { exact: true })).toHaveCount(0);
	await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled();
	hidden = true;
	await comments.getByRole('button', { name: 'Refresh comments', exact: true }).click();
	await expect(comments.getByText('The second page thread.', { exact: true })).toHaveCount(0);
	await expect(comments.getByRole('heading', { name: 'Comments 0', exact: true })).toBeVisible();
	await expect(comments.getByText('Start the conversation.', { exact: true })).toBeVisible();
});

for (const [layout, path] of [
	[
		'plumbing folio',
		'/blog/artificial-intelligence/the-magnificent-plumbing-department-of-artificial-intelligence'
	],
	['healthcare folio', '/blog/healthcare-it/why-read-a-healthcare-it-blog-in-the-age-of-ai']
]) {
	test(`${layout} renders exactly one functional comments section`, async ({ page }) => {
		await page.route('**/api/comments*', (route) => route.fulfill({ json: commentPage() }));
		const comments = await openComments(page, path);
		await expect(comments.getByText('Start the conversation.', { exact: true })).toBeVisible();
		await expect(page.locator('#comments')).toHaveCount(1);
	});
}

test('the mobile conversation and long plain-text replies stay within the viewport', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route('**/api/comments*', (route) =>
		route.fulfill({
			json: commentPage([
				comment({ display_name: 'A'.repeat(60), body: 'Unbroken'.repeat(375), reply_count: 1 })
			])
		})
	);
	const comments = await openComments(page);
	await expect(comments.getByText('A'.repeat(60), { exact: true })).toBeVisible();
	await comments.getByRole('button', { name: /^Reply to/ }).click();
	const overflow = await comments.evaluate((section) => {
		const width = document.documentElement.clientWidth;
		return Array.from(section.querySelectorAll<HTMLElement>('*'))
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				return rect.width > 0 && (rect.left < -1 || rect.right > width + 1);
			})
			.map((element) => element.tagName + '.' + element.className);
	});
	expect(overflow).toEqual([]);
});

test('the moderation board redirects anonymous readers to the existing owner sign-in', async ({
	page
}) => {
	await page.goto('/notes/studio/comments');
	await expect(page).toHaveURL(/\/notes\/sign-in(?:\?|$)/);
	await expect(page.getByRole('heading', { name: 'Notes studio', exact: true })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Sign in to the studio', exact: true })
	).toBeVisible();
});
