import { expect, test } from '@playwright/test';

test('résumé videos defer every remote player and support keyboard activation and focus', async ({
	page,
	context,
	baseURL
}) => {
	const remoteRequests: string[] = [];
	await context.route('**/*', (route) => {
		const url = route.request().url();
		if (new URL(url).origin !== baseURL) {
			remoteRequests.push(url);
			return route.abort();
		}
		return route.continue();
	});
	await page.goto('/resume');
	const buttons = page.getByRole('button', { name: /^Load YouTube video:/ });
	await expect(buttons).toHaveCount(3);
	await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
	expect(
		remoteRequests.filter((url) =>
			/youtube|ytimg|googlevideo|vercel-insights|vitals\.vercel/.test(url)
		)
	).toEqual([]);
	const title = (await buttons.first().getAttribute('aria-label'))?.replace(
		'Load YouTube video: ',
		''
	);
	await buttons.first().focus();
	await buttons.first().press('Enter');
	const player = page.locator('iframe[src*="youtube"]');
	await expect(player).toHaveCount(1);
	await expect(player).toHaveAttribute('title', title!);
	await expect(player).toBeFocused();
	await expect(buttons).toHaveCount(2);
	await expect(page.getByRole('link', { name: '(Watch on YouTube)', exact: true })).toHaveCount(3);
});

test('Writing offers ordinary topic links on a narrow screen without overflowing its new guide', async ({
	page,
	context,
	baseURL
}) => {
	await context.route('**/*', (route) =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
	);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/writing');
	const heading = page.getByRole('heading', { name: 'Follow a question', exact: true });
	await expect(heading).toBeVisible();
	await expect(page.locator('main a[href="/topics/healthcare-ai"]').first()).toBeVisible();
	await expect(
		page.locator('main a[href="/topics/interactive-mathematics"]').first()
	).toBeVisible();
	const box = await heading.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(391);
});

test('fresh rendered metadata and explanatory sources preserve the article canonical URLs', async ({
	request
}) => {
	const samples = [
		['brownian-motion-laboratory', 'Brownian Motion Simulator'],
		['how-a-scanner-sees-reconstructing-a-body-from-shadows', 'CT Reconstruction Simulator']
	];
	for (const [slug, title] of samples) {
		const path = `/blog/visualizations/${slug}`;
		const response = await request.get(path);
		expect(response.ok()).toBe(true);
		const html = await response.text();
		expect(html).toMatch(new RegExp(`<title>[^<]*${title}`));
		expect(html).toContain(`https://www.suvroghosh.in${path}`);
	}
	const article = await request.get('/blog/healthcare-it/hl7-vs-fhir-explained-simply');
	expect(await article.text()).toContain('https://fhir.hl7.org/fhir/comparison-v2.html');
	const sitemap = await request.get('/sitemap.xml');
	expect(await sitemap.text()).toContain('<loc>https://www.suvroghosh.in/notes</loc>');
});
