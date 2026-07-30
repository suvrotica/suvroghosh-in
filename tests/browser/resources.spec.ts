import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const siteUrl = 'https://www.suvroghosh.in';
const indexPath = '/resources';
const promptPath = '/resources/prompts/scientific-visualization-prompts';
const listPath = '/resources/lists/bengali-emotional-vocabulary';
const expectedTitle = 'Useful Prompts, Word Lists, Templates and Reference Guides';
const expectedDescription =
	'A practical collection of reusable prompts, word lists, checklists, templates and compact reference material.';

const publishedResourcePaths = [
	'/resources/prompts/codex-desktop-implementation-prompts',
	'/resources/prompts/scientific-visualization-prompts',
	'/resources/prompts/bengali-songwriting-prompts',
	'/resources/prompts/image-restoration-prompts',
	'/resources/prompts/healthcare-architecture-prompts',
	'/resources/prompts/research-and-verification-prompts',
	'/resources/prompts/editing-prompts',
	'/resources/prompts/essay-development-prompts',
	'/resources/lists/calcutta-sensory-vocabulary',
	'/resources/lists/bengali-emotional-vocabulary',
	'/resources/lists/alternatives-to-overused-ai-language',
	'/resources/lists/medical-verbs',
	'/resources/lists/architectural-verbs',
	'/resources/lists/satirical-insults-by-intensity',
	'/resources/lists/words-for-decay-rain-heat-and-bureaucracy',
	'/resources/lists/contemporary-kolkata-bengali-expressions',
	'/resources/lists/mathematics-verbs-and-metaphors',
	'/resources/lists/better-replacements-for-corporate-sludge'
] as const;

function copyPayload(directory: 'prompts' | 'lists', slug: string) {
	const source = fs
		.readFileSync(path.join(process.cwd(), 'src', 'lib', directory, `${slug}.md`), 'utf8')
		.replace(/\r\n?/g, '\n');
	const startMarker = '<!-- resource-copy:start -->';
	const endMarker = '<!-- resource-copy:end -->';
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker);
	if (start < 0 || end <= start)
		throw new Error(`${slug}: invalid copy markers in browser fixture.`);

	return source
		.slice(source.indexOf('\n', start + startMarker.length) + 1, end)
		.split('\n')
		.filter((line, index, lines) => {
			const firstContent = lines.findIndex((candidate) => candidate.trim());
			const lastContent = lines.findLastIndex((candidate) => candidate.trim());
			return index >= firstContent && index <= lastContent;
		})
		.join('\n');
}

function countOccurrences(source: string, needle: string) {
	return source.split(needle).length - 1;
}

async function canonical(page: Page) {
	return page.locator('link[rel="canonical"]').getAttribute('href');
}

function resourceCard(page: Page, panel: '#prompts' | '#word-lists', title: string) {
	return page.locator(`${panel} [data-resource-card]`).filter({
		has: page.getByRole('heading', { level: 3, name: title, exact: true })
	});
}

async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
}

async function installClipboardCapture(page: Page, mode: 'clipboard' | 'fallback' | 'failure') {
	await page.addInitScript((copyMode) => {
		const testWindow = window as Window & { __fieldKitCopiedText?: string };
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					if (copyMode !== 'clipboard') throw new Error('Mock clipboard rejection');
					testWindow.__fieldKitCopiedText = value;
				}
			}
		});
		Object.defineProperty(document, 'execCommand', {
			configurable: true,
			value: (command: string) => {
				if (copyMode === 'failure' || command !== 'copy') return false;
				const active = document.activeElement;
				testWindow.__fieldKitCopiedText = active instanceof HTMLTextAreaElement ? active.value : '';
				return true;
			}
		});
	}, mode);
}

test('the index is fully rendered with exact metadata and the complete launch catalogue', async ({
	page,
	request
}) => {
	const response = await request.get(indexPath);
	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain('data-resource-panel="prompts"');
	expect(html).toContain('data-resource-panel="lists"');
	expect(countOccurrences(html, 'data-resource-kind="prompts"')).toBe(8);
	expect(countOccurrences(html, 'data-resource-kind="lists"')).toBe(10);

	await page.goto(indexPath);
	await expect(
		page.getByRole('heading', { level: 1, name: 'The Field Kit', exact: true })
	).toHaveCount(1);
	await expect(page).toHaveTitle(expectedTitle);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute(
		'content',
		expectedDescription
	);
	expect(await canonical(page)).toBe(`${siteUrl}${indexPath}`);
	await expect(page.locator('#prompts [data-resource-card]')).toHaveCount(8);
	await expect(page.locator('#word-lists [data-resource-card]')).toHaveCount(10);
	await expect(page.locator('#prompts-tab')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#word-lists-tab')).toHaveAttribute('aria-selected', 'false');
	await expect(page.locator('#prompts')).toBeVisible();
	await expect(page.locator('#word-lists')).toBeHidden();
});

test('tabs, hash history, keyboard navigation, and local search stay accessible and canonical', async ({
	page
}) => {
	await page.goto(`${indexPath}#word-lists`);
	const promptTab = page.locator('#prompts-tab');
	const listTab = page.locator('#word-lists-tab');
	const search = page.getByRole('searchbox');

	await expect(listTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#word-lists')).toBeVisible();

	await promptTab.focus();
	await page.keyboard.press('ArrowRight');
	await expect(listTab).toBeFocused();
	await expect(listTab).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Home');
	await expect(promptTab).toBeFocused();
	await expect(promptTab).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('End');
	await expect(listTab).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(promptTab).toBeFocused();
	await expect(page).toHaveURL(/#prompts$/);

	await listTab.click();
	await promptTab.click();
	await page.goBack();
	await expect(listTab).toHaveAttribute('aria-selected', 'true');
	await page.goBack();
	await expect(promptTab).toHaveAttribute('aria-selected', 'true');

	await search.fill('Scientific Visualization');
	await expect(page.locator('#prompts [data-resource-card]')).toHaveCount(1);
	await expect(
		page.locator('#prompts [data-resource-card]').getByRole('heading', {
			level: 3,
			name: 'Scientific Visualization Prompts'
		})
	).toBeVisible();

	await search.fill('Clinical safety');
	await expect(page.locator('#prompts [data-resource-card]')).toHaveCount(1);
	await expect(
		page.locator('#prompts [data-resource-card]').getByRole('heading', {
			level: 3,
			name: 'Healthcare Architecture Prompts'
		})
	).toBeVisible();

	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(page.locator('#prompts [data-resource-card]')).toHaveCount(8);
	await search.fill('a phrase that cannot match this catalogue');
	await expect(page.locator('#prompts [data-no-results]')).toBeVisible();
	await expect(page.locator('#prompts [data-no-results]')).toContainText('No prompts matched');
	await expect(page.locator('#prompts [data-no-results]')).toHaveAttribute('aria-live', 'polite');
	expect(await canonical(page)).toBe(`${siteUrl}${indexPath}`);

	await page.reload();
	await expect(search).toHaveValue('a phrase that cannot match this catalogue');
	await expect(page.locator('#prompts [data-no-results]')).toBeVisible();
});

test('every card exposes the required independent links and controls', async ({ page }) => {
	await page.goto(indexPath);
	const cards = page.locator('[data-resource-card]');
	await expect(cards).toHaveCount(18);
	expect(
		await cards.evaluateAll((elements) =>
			elements.every((card) => {
				const tagList = card.querySelector('ul[aria-label$=" tags"]');
				const relatedHeading = [...card.querySelectorAll('h4')].find(
					(heading) => heading.textContent?.trim() === 'Related resources'
				);
				return Boolean(
					card.querySelector('img[alt][width][height]') &&
					card.querySelector('h3 > a[href^="/resources/"]') &&
					card.querySelector('h3')?.textContent?.trim() &&
					card.querySelector('p')?.textContent?.trim() &&
					tagList?.querySelectorAll('li').length &&
					card.textContent?.match(/\d+\s+\S+/) &&
					relatedHeading &&
					relatedHeading.parentElement?.querySelectorAll('a[href^="/resources/"]').length &&
					card.querySelector('button[data-copy-button]')
				);
			})
		)
	).toBe(true);
	await expect(page.locator('a button, button a')).toHaveCount(0);

	const scientificCard = resourceCard(page, '#prompts', 'Scientific Visualization Prompts');
	const titleLink = scientificCard.getByRole('heading', { level: 3 }).getByRole('link');
	await expect(titleLink).toHaveAttribute('href', promptPath);
	await titleLink.click();
	await expect(page).toHaveURL(new RegExp(`${promptPath}$`));
});

test('prompt copy uses the exact raw region, reports success, and resets independently', async ({
	page
}) => {
	await installClipboardCapture(page, 'clipboard');
	await page.goto(indexPath);
	const card = resourceCard(page, '#prompts', 'Scientific Visualization Prompts');
	const button = card.locator('[data-copy-button]');
	await button.click();

	await expect(button).toContainText('Copied');
	expect(
		await page.evaluate(
			() => (window as Window & { __fieldKitCopiedText?: string }).__fieldKitCopiedText
		)
	).toBe(copyPayload('prompts', 'scientific-visualization-prompts'));
	await expect(
		resourceCard(page, '#prompts', 'Codex Desktop Implementation Prompts').locator(
			'[data-copy-button]'
		)
	).toContainText('Copy prompt');
	await expect(button).toContainText('Copy prompt', { timeout: 4_000 });
});

test('the selection fallback preserves Bengali Unicode and line breaks', async ({ page }) => {
	await installClipboardCapture(page, 'fallback');
	await page.goto(`${indexPath}#word-lists`);
	const card = resourceCard(page, '#word-lists', 'Bengali Emotional Vocabulary');
	const button = card.locator('[data-copy-button]');
	await button.click();

	const copied = await page.evaluate(
		() => (window as Window & { __fieldKitCopiedText?: string }).__fieldKitCopiedText
	);
	expect(copied).toBe(copyPayload('lists', 'bengali-emotional-vocabulary'));
	expect(copied).toContain('অভিমান');
	expect(copied).toContain('\n\n## ');
	await expect(button).toContainText('Copied');
});

test('clipboard and fallback failure never claim false success', async ({ page }) => {
	await installClipboardCapture(page, 'failure');
	await page.goto(indexPath);
	const button = resourceCard(page, '#prompts', 'Scientific Visualization Prompts').locator(
		'[data-copy-button]'
	);
	await button.click();
	await expect(button).toContainText('Copy failed');
	await expect(button).toHaveAttribute('data-state', 'failed');
	await expect(button.locator('xpath=..').locator('[data-copy-status]')).toContainText(
		'could not be copied'
	);
});

for (const route of [promptPath, listPath]) {
	test(`${route} renders its detail contract and structured data`, async ({ page }) => {
		const response = await page.goto(route);
		expect(response?.status()).toBe(200);
		await expect(page.locator('main h1')).toHaveCount(1);
		await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
		await expect(page.locator('[data-resource-detail] [data-copy-button]')).toHaveCount(1);
		expect(await canonical(page)).toBe(`${siteUrl}${route}`);

		const graph = await page.locator('script[type="application/ld+json"]').evaluate((script) => {
			const parsed = JSON.parse(script.textContent ?? '{}');
			return Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
		});
		expect(
			graph.filter((node: { '@type'?: string }) => node['@type'] === 'CreativeWork')
		).toHaveLength(1);
		expect(
			graph.filter((node: { '@type'?: string }) => node['@type'] === 'BreadcrumbList')
		).toHaveLength(1);

		const related = page
			.getByRole('heading', { level: 2, name: 'Related resources' })
			.locator('xpath=..');
		await expect(related.getByRole('link')).toHaveCount(4);
		const relatedHrefs = await related
			.getByRole('link')
			.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
		expect(relatedHrefs).not.toContain(route);
	});
}

test('unknown and unpublished resource routes return 404', async ({ request }) => {
	expect((await request.get('/resources/prompts/unknown-resource')).status()).toBe(404);
	expect((await request.get('/resources/prompts/private-authoring-fixture')).status()).toBe(404);
});

test('the 320-pixel layout keeps cards, tags, copy controls, and header within the viewport', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 760 });
	await page.goto(indexPath);
	await expectNoHorizontalOverflow(page);

	const firstCard = page.locator('#prompts [data-resource-card]').nth(0);
	const secondCard = page.locator('#prompts [data-resource-card]').nth(1);
	const [firstBox, secondBox] = await Promise.all([
		firstCard.boundingBox(),
		secondCard.boundingBox()
	]);
	expect(firstBox).not.toBeNull();
	expect(secondBox).not.toBeNull();
	expect(Math.abs((firstBox?.x ?? 0) - (secondBox?.x ?? 1))).toBeLessThanOrEqual(1);
	expect(secondBox?.y ?? 0).toBeGreaterThan((firstBox?.y ?? 0) + (firstBox?.height ?? 0));

	const copyBox = await firstCard.locator('[data-copy-button]').boundingBox();
	expect(copyBox?.height ?? 0).toBeGreaterThanOrEqual(44);
	expect(
		await firstCard
			.locator('ul[aria-label$=" tags"] li')
			.evaluateAll((tags) => tags.every((tag) => tag.scrollWidth <= tag.clientWidth + 1))
	).toBe(true);

	const menu = page.locator('header details');
	await expect(menu.locator(':scope > summary')).toBeVisible();
	await menu.locator(':scope > summary').click();
	await expect(
		page
			.getByRole('navigation', { name: 'Mobile and tablet navigation' })
			.getByRole('link', { name: 'Field Kit' })
	).toBeVisible();
	await expectNoHorizontalOverflow(page);
});

test('without JavaScript both catalogue sections and their hash destinations remain available', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();
	try {
		await page.goto(`${indexPath}#word-lists`);
		await expect(page.locator('#prompts')).toBeVisible();
		await expect(page.locator('#word-lists')).toBeVisible();
		await expect(page.locator('a[href="#prompts"]')).toHaveCount(1);
		await expect(page.locator('a[href="#word-lists"]')).toHaveCount(1);
		expect(await page.evaluate(() => window.location.hash)).toBe('#word-lists');
		const targetTop = await page
			.locator('#word-lists')
			.evaluate((target) => Math.abs(target.getBoundingClientRect().top));
		expect(targetTop).toBeLessThan(160);
	} finally {
		await context.close();
	}
});

test('the sitemap contains exactly the published Field Kit URLs', async ({ request }) => {
	const response = await request.get('/sitemap.xml');
	expect(response.status()).toBe(200);
	const xml = await response.text();

	expect(countOccurrences(xml, `<loc>${siteUrl}${indexPath}</loc>`)).toBe(1);
	for (const route of publishedResourcePaths) {
		expect(countOccurrences(xml, `<loc>${siteUrl}${route}</loc>`)).toBe(1);
	}
	expect(countOccurrences(xml, `${siteUrl}/resources/`)).toBe(18);
	expect(xml).not.toContain('private-authoring-fixture');
});

test('existing writing, blog search, and Pagefind result boundaries remain intact', async ({
	page,
	request
}) => {
	expect((await request.get('/writing')).status()).toBe(200);
	expect((await request.get('/blog')).status()).toBe(200);

	await page.goto('/blog?search=FHIR');
	await expect(page.getByRole('heading', { level: 1, name: 'All Posts' })).toBeVisible();
	await expect(page.getByRole('searchbox', { name: 'Search all writing' })).toHaveValue('FHIR');
	await expect(page.getByRole('heading', { level: 2, name: 'Search results' })).toBeVisible();
	await expect(page.getByText('Searching…', { exact: true })).toHaveCount(0, { timeout: 15_000 });
	await expect(page.locator('a[href^="/resources/"]')).toHaveCount(0);

	const searchBuilder = fs.readFileSync(
		path.join(process.cwd(), 'scripts', 'build-search-index.mjs'),
		'utf8'
	);
	expect(searchBuilder).not.toContain("src', 'lib', 'prompts");
	expect(searchBuilder).not.toContain("src', 'lib', 'lists");
});
