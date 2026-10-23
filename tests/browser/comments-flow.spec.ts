import { expect, test } from '@playwright/test';

const slug = 'hl7-vs-fhir-explained-simply';
const article = `/blog/healthcare-it/${slug}`;
const bridge = 'http://127.0.0.1:54329';

test('reader → private queue → approval → author reply → hidden thread → restoration', async ({
	browser,
	request,
	baseURL
}) => {
	await request.post(`${bridge}/__test/reset`);
	const readerContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
	const ownerContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
	try {
		const { cookie } = await (await request.get(`${bridge}/__test/session`)).json();
		await ownerContext.addCookies([cookie]);
		for (const context of [readerContext, ownerContext])
			await context.route('**/*', (route) =>
				new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
			);
		const reader = await readerContext.newPage();
		await reader.goto(article);
		const comments = reader.locator('#comments');
		await comments.scrollIntoViewIfNeeded();
		const form = comments.getByRole('form', { name: 'Leave a comment', exact: true });
		await form.getByLabel('Display name', { exact: true }).fill('Reader flow');
		await form
			.getByLabel('Your comment', { exact: true })
			.fill('Can this work between two independent browsers?');
		await form.getByRole('button', { name: 'Send for approval', exact: true }).click();
		await expect(form.getByRole('status')).toContainText('awaiting approval');
		await expect(
			comments.getByText('Can this work between two independent browsers?', { exact: true })
		).toHaveCount(0);
		const beforeApproval = await (
			await readerContext.request.get(`/api/comments?post=${slug}`)
		).json();
		expect(beforeApproval.commentCount).toBe(0);
		expect((await readerContext.request.get('/api/notes/comments?export=1')).status()).toBe(401);

		const owner = await ownerContext.newPage();
		await owner.goto('/notes/studio/comments');
		await expect(owner.getByRole('heading', { name: 'Comments', exact: true })).toBeVisible();
		const root = owner.getByRole('article', { name: 'Comment by Reader flow', exact: true });
		await expect(root).toContainText('Unread');
		await expect(owner.getByRole('navigation', { name: 'Owner workspace' })).toContainText('1');
		await root.getByRole('button', { name: 'Approve', exact: true }).click();
		await expect(root).toHaveCount(0);
		await owner.getByRole('button', { name: 'Approved', exact: true }).click();
		await expect(root).toBeVisible();
		await expect(root.getByText('Unread', { exact: true })).toHaveCount(0);
		await comments.getByRole('button', { name: 'Refresh comments', exact: true }).click();
		await expect(
			comments.getByText('Can this work between two independent browsers?', { exact: true })
		).toBeVisible();

		await root.getByRole('button', { name: 'Reply as author', exact: true }).click();
		await root
			.getByLabel('Your author reply', { exact: true })
			.fill('Yes. This reply was published by the authenticated site owner.');
		await root.getByRole('button', { name: 'Publish reply', exact: true }).click();
		await expect(
			owner.getByRole('status').filter({ hasText: 'Your author reply is published.' })
		).toBeVisible();
		await comments.getByRole('button', { name: 'Refresh comments', exact: true }).click();
		await comments.getByRole('button', { name: /View 1 reply/ }).click();
		await expect(
			comments.getByText('Yes. This reply was published by the authenticated site owner.', {
				exact: true
			})
		).toBeVisible();
		await expect(comments.getByText('Author', { exact: true })).toHaveCount(1);

		const published = await (await readerContext.request.get(`/api/comments?post=${slug}`)).json();
		const rootId = published.comments[0].id;
		expect(published.commentCount).toBe(2);
		await root.getByRole('button', { name: 'Hide thread', exact: true }).click();
		await expect(root).toHaveCount(0);
		await comments.getByRole('button', { name: 'Refresh comments', exact: true }).click();
		await expect(
			comments.getByText('Can this work between two independent browsers?', { exact: true })
		).toHaveCount(0);
		await expect(
			comments.getByText('Yes. This reply was published by the authenticated site owner.', {
				exact: true
			})
		).toHaveCount(0);
		const hiddenReplies = await readerContext.request.get(
			`/api/comments?post=${slug}&parent=${rootId}`
		);
		expect(await hiddenReplies.json()).toMatchObject({ comments: [], total: 0, commentCount: 0 });
		expect(hiddenReplies.headers()['cache-control']).toContain('no-store');

		await owner.getByRole('button', { name: 'Hidden', exact: true }).click();
		await expect(root).toBeVisible();
		await root.getByRole('button', { name: 'Restore as approved', exact: true }).click();
		await expect(root).toHaveCount(0);
		await comments.getByRole('button', { name: 'Refresh comments', exact: true }).click();
		await comments.getByRole('button', { name: /View 1 reply/ }).click();
		await expect(
			comments.getByText('Yes. This reply was published by the authenticated site owner.', {
				exact: true
			})
		).toBeVisible();

		await owner.getByRole('button', { name: 'All comments', exact: true }).click();
		await expect(root).toBeVisible();
		const exported = await ownerContext.request.get('/api/notes/comments?status=all&export=1');
		expect(exported.status()).toBe(200);
		expect(exported.headers()['content-disposition']).toContain('attachment');
		expect(exported.headers()['cache-control']).toContain('private');
		expect((await exported.json()).comments).toHaveLength(2);
		await owner.screenshot({ path: '.codex-artifacts/comments-admin-desktop.png', fullPage: true });
		await reader.screenshot({
			path: '.codex-artifacts/comments-reader-desktop.png',
			fullPage: true
		});
		await owner.setViewportSize({ width: 390, height: 844 });
		await expect(root).toBeVisible();
		await owner.screenshot({ path: '.codex-artifacts/comments-admin-mobile.png', fullPage: true });
	} finally {
		await readerContext.close();
		await ownerContext.close();
	}
});
