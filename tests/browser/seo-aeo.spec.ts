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

test.describe('reader-facing article FAQs', () => {
	// The answer text and navigation must survive without hydration or app code.
	test.use({ javaScriptEnabled: false });
	const samples = [
		{ name: 'standard', path: '/blog/healthcare-it/hie-first-principles-openhie', faq: true },
		{ name: 'deferred', path: '/blog/visualizations/brownian-motion-laboratory', faq: true },
		{
			name: 'bespoke',
			path: '/blog/healthcare-it/why-read-a-healthcare-it-blog-in-the-age-of-ai',
			faq: true
		},
		{
			name: 'without FAQ',
			path: '/blog/artificial-intelligence/the-magnificent-plumbing-department-of-artificial-intelligence',
			faq: false
		}
	];
	for (const width of [1440, 390]) {
		for (const sample of samples) {
			test(`${sample.name} at ${width}px preserves visible questions, answers and canonical`, async ({
				page,
				context,
				baseURL
			}) => {
				await context.route('**/*', (route) =>
					new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
				);
				await page.setViewportSize({ width, height: 1000 });
				await page.goto(sample.path);
				await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
					'href',
					`https://www.suvroghosh.in${sample.path}`
				);
				const graphs = (
					await page.locator('script[type="application/ld+json"]').allTextContents()
				).map((text) => JSON.parse(text));
				const faqPages = graphs
					.flatMap((graph) => graph['@graph'] ?? [graph])
					.filter((node) => node['@type'] === 'FAQPage');
				const items = page.locator('article [data-article-faq] [data-faq-item]');
				if (!sample.faq) {
					expect(faqPages).toHaveLength(0);
					await expect(items).toHaveCount(0);
					return;
				}
				expect(faqPages).toHaveLength(1);
				const questions = faqPages[0].mainEntity as {
					name: string;
					acceptedAnswer: { text: string };
				}[];
				expect(questions.length).toBeGreaterThan(0);
				await expect(items).toHaveCount(questions.length);
				for (const [index, question] of questions.entries()) {
					const item = items.nth(index);
					const visibleQuestion = item.locator('[data-faq-question]');
					const visibleAnswer = item.locator('[data-faq-answer]');
					await expect(visibleQuestion).toBeVisible();
					await expect(visibleQuestion).toHaveText(question.name);
					await expect(visibleAnswer).toBeVisible();
					await expect(visibleAnswer).toHaveText(question.acceptedAnswer.text);
					const box = await item.boundingBox();
					expect(box).not.toBeNull();
					expect(box!.x).toBeGreaterThanOrEqual(0);
					expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
				}
				if (sample.name === 'deferred') {
					await expect(page.locator('#faq [data-article-faq]')).toHaveCount(1);
					await expect(page.locator('#answer-summary')).toHaveCount(0);
				}
			});
		}
	}
});
