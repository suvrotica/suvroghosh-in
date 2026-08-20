import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const articlePath = '/blog/healthcare-it/why-read-a-healthcare-it-blog-in-the-age-of-ai';
const canonicalUrl = `https://www.suvroghosh.in${articlePath}`;
const articleTitle = 'Why You Still Want to Read a Healthcare IT Blog in the Age of AI.';
const articleDescription =
	'Why practitioner-written healthcare IT analysis still matters amid AI-generated noise, vendor jargon, and systems that resist generic answers.';
const folioSelector = '[data-thought-folio="healthcare-human-margin"]';
const readingRegionSelector = '[data-article-reading-region]';
const retiredHumanFontPattern =
	/(?:newsreader|barlow(?:[\s_-]*condensed)?|ibm[\s_-]*plex[\s_-]*mono)/iu;
const humanOnlyFontPattern =
	/(?:newsreader|barlow(?:[\s_-]*condensed)?|ibm[\s_-]*plex[\s_-]*mono|human[\s_-]*margin[\s_-]*source[\s_-]*serif|source-serif-4-latin-wght-normal)/iu;
const wordCloudGeneratorVersion = '2026-07-13.1';
const slug = 'why-read-a-healthcare-it-blog-in-the-age-of-ai';

const legacyArticleImages = [
	'/thumbnail/art-why-read-a-healthcare-it-blog-in-the-age-of-ai.jpg',
	'/photos/Compress_20260626_135253_3863.jpg'
] as const;

const canonicalHeadings = [
	{ text: 'The Uncomfortable Premise', id: 'the-uncomfortable-premise' },
	{ text: 'Who Is Involved?', id: 'who-is-involved' },
	{ text: 'What Is This, Exactly?', id: 'what-is-this-exactly' },
	{ text: 'When Did This Become Significant?', id: 'when-did-this-become-significant' },
	{ text: 'Where Does This Apply?', id: 'where-does-this-apply' },
	{ text: 'Why Does This Matter?', id: 'why-does-this-matter' },
	{ text: 'How Does This Work?', id: 'how-does-this-work' },
	{
		text: 'Which Technologies, Systems, Methods, and Discoveries Make This Possible?',
		id: 'which-technologies-systems-methods-and-discoveries-make-this-possible'
	},
	{ text: 'The Bigger Picture', id: 'the-bigger-picture' }
] as const;

const viewportMatrix = [
	{ width: 320, height: 568, mode: 'stacked', minimumBodyPx: 17 },
	{ width: 320, height: 240, mode: 'stacked', minimumBodyPx: 17 },
	{ width: 390, height: 844, mode: 'stacked', minimumBodyPx: 17 },
	{ width: 390, height: 300, mode: 'stacked', minimumBodyPx: 17 },
	{ width: 768, height: 1_024, mode: 'stacked', minimumBodyPx: 18 },
	{ width: 768, height: 600, mode: 'stacked', minimumBodyPx: 18 },
	{ width: 1_024, height: 1_366, mode: 'stacked', minimumBodyPx: 18 },
	{ width: 1_024, height: 768, mode: 'paired', minimumBodyPx: 18 },
	{ width: 1_440, height: 1_920, mode: 'stacked', minimumBodyPx: 18 },
	{ width: 1_440, height: 900, mode: 'paired', minimumBodyPx: 18 },
	{ width: 959, height: 900, mode: 'stacked', minimumBodyPx: 18 },
	{ width: 960, height: 900, mode: 'paired', minimumBodyPx: 18 },
	{ width: 961, height: 900, mode: 'paired', minimumBodyPx: 18 },
	{ width: 960, height: 1_200, mode: 'stacked', minimumBodyPx: 18 }
] as const;

const bodyArt = [
	{
		path: '/images/thought-folios/healthcare-human-margin/cover-service-panel.jpg',
		alt: 'A healthcare systems practitioner traces a cable through an open hospital service panel.',
		width: 1_536,
		height: 1_024,
		loading: 'eager',
		fetchPriority: 'high'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/uncomfortable-premise-handoff.jpg',
		alt: 'A practitioner pauses beside a dark clinical workstation and an open technical cabinet in a quiet hospital corridor.',
		width: 1_536,
		height: 1_024,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/stakeholders-layered.jpg',
		alt: 'A nurse, a systems technician, and a patient occupy connected layers of a clinical workflow.',
		width: 1_000,
		height: 1_250,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/map-territory-drift.jpg',
		alt: 'A clinical trace drifts away from the older map beneath it.',
		width: 1_500,
		height: 750,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/ai-convergence.jpg',
		alt: 'Older and contemporary clinical computing equipment share the same working room.',
		width: 1_600,
		height: 900,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/rural-image-transfer.jpg',
		alt: 'A rural clinic workstation receives a medical image through modest network equipment.',
		width: 1_440,
		height: 1_080,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/genetics-workbench.jpg',
		alt: 'An anonymized genetics workbench combines laboratory materials and family-study notes.',
		width: 1_440,
		height: 1_080,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/corridor-network-cabinet.jpg',
		alt: 'An open network cabinet reveals the infrastructure behind a quiet hospital corridor.',
		width: 1_440,
		height: 1_080,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/adversarial-clinical-film.jpg',
		alt: 'Clinical film and paper traces show subtle corruption beside a locked server cabinet.',
		width: 1_536,
		height: 1_024,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/method-tea-notebook.jpg',
		alt: 'Milky tea and pencil-marked working papers sit beside an unbranded technical manual.',
		width: 1_440,
		height: 1_080,
		loading: 'lazy',
		fetchPriority: 'auto'
	},
	{
		path: '/images/thought-folios/healthcare-human-margin/not-there-yet.jpg',
		alt: 'An open service door breaks the quiet of a hospital passage before dawn.',
		width: 1_600,
		height: 800,
		loading: 'lazy',
		fetchPriority: 'auto'
	}
] as const;

type RuntimeDiagnostics = {
	consoleErrors: string[];
	pageErrors: string[];
	failedRequests: string[];
};

type FontRecord = {
	url: string;
	status: number;
	mime: string;
	bytes: number;
};

type LayoutShiftSample = {
	startTime: number;
	value: number;
	sources: string[];
};

type FontLoadWindow = {
	start: number;
	end: number;
};

function normalizeText(value: string): string {
	return value.replace(/\s+/gu, ' ').trim();
}

function normalizeSpeechText(value: string): string {
	return normalizeText(value.replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"'));
}

function maximumClsSessionWindow(samples: LayoutShiftSample[]): number {
	const ordered = [...samples].sort((left, right) => left.startTime - right.startTime);
	let maximum = 0;
	let current = 0;
	let windowStart = 0;
	let previous = 0;

	for (const sample of ordered) {
		if (
			current === 0 ||
			sample.startTime - previous > 1_000 ||
			sample.startTime - windowStart > 5_000
		) {
			current = sample.value;
			windowStart = sample.startTime;
		} else {
			current += sample.value;
		}
		previous = sample.startTime;
		maximum = Math.max(maximum, current);
	}

	return maximum;
}

function isIgnorablePlatformUrl(value: string): boolean {
	try {
		const pathname = new URL(value, 'http://local.invalid').pathname;
		return pathname.startsWith('/_vercel/') || /(?:^|\/)favicon(?:\.|$)/iu.test(pathname);
	} catch {
		return false;
	}
}

function isIgnorablePlatformConsoleMessage(value: string): boolean {
	return /\/_vercel\/(?:insights|speed-insights)\/script\.js/iu.test(value);
}

function observeRuntime(page: Page): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = {
		consoleErrors: [],
		pageErrors: [],
		failedRequests: []
	};

	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		if (isIgnorablePlatformUrl(message.location().url)) return;
		if (isIgnorablePlatformConsoleMessage(message.text())) return;
		diagnostics.consoleErrors.push(message.text());
	});
	page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
	page.on('requestfailed', (request) => {
		if (isIgnorablePlatformUrl(request.url())) return;
		if (request.isNavigationRequest() && request.failure()?.errorText === 'net::ERR_ABORTED')
			return;
		diagnostics.failedRequests.push(
			`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`
		);
	});
	page.on('response', (response) => {
		if (response.status() < 400 || isIgnorablePlatformUrl(response.url())) return;
		diagnostics.failedRequests.push(
			`${response.request().method()} ${response.url()} — HTTP ${response.status()}`
		);
	});

	return diagnostics;
}

async function openArticle(page: Page): Promise<void> {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.locator(folioSelector)).toHaveCount(1);
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

async function expectNoRuntimeErrors(diagnostics: RuntimeDiagnostics): Promise<void> {
	expect(diagnostics.consoleErrors).toEqual([]);
	expect(diagnostics.pageErrors).toEqual([]);
	expect(diagnostics.failedRequests).toEqual([]);
}

async function auditLayout(
	page: Page,
	minimumBodyPx: number,
	checkOverlap = false
): Promise<{
	documentOverflow: number;
	rootOverflow: number;
	spreads: Array<{
		id: string;
		sides: Array<string | null>;
		leftTop: number;
		leftBottom: number;
		leftRight: number;
		rightTop: number;
		rightLeft: number;
	}>;
	undersizedBody: string[];
	outOfLeaf: string[];
	clippedContent: string[];
	overlaps: string[];
}> {
	return page.locator(folioSelector).evaluate(
		(root, { bodyMinimum, detectOverlap }) => {
			const normalise = (value: string) => value.replace(/\s+/gu, ' ').trim();
			const describe = (element: Element) => {
				const html = element as HTMLElement;
				return `${element.tagName.toLowerCase()}${html.id ? `#${html.id}` : ''}${
					html.classList.length ? `.${Array.from(html.classList).slice(0, 2).join('.')}` : ''
				}`;
			};
			const visible = (element: Element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					style.display !== 'none' &&
					style.visibility !== 'hidden' &&
					Number(style.opacity) > 0 &&
					rect.width > 0 &&
					rect.height > 0
				);
			};

			const spreads = Array.from(root.querySelectorAll<HTMLElement>('.thought-spread')).map(
				(spread, index) => {
					const leaves = Array.from(
						spread.querySelectorAll<HTMLElement>(':scope > .thought-spread__leaves > .thought-leaf')
					);
					const left = leaves[0]?.getBoundingClientRect();
					const right = leaves[1]?.getBoundingClientRect();
					return {
						id: spread.id || `spread-${index + 1}`,
						sides: leaves.map((leaf) => leaf.getAttribute('data-side')),
						leftTop: left?.top ?? Number.NaN,
						leftBottom: left?.bottom ?? Number.NaN,
						leftRight: left?.right ?? Number.NaN,
						rightTop: right?.top ?? Number.NaN,
						rightLeft: right?.left ?? Number.NaN
					};
				}
			);

			const readingRegion = root.querySelector('[data-article-reading-region]');
			const bodyNodes = readingRegion
				? Array.from(readingRegion.querySelectorAll<HTMLElement>('p, li')).filter(
						(element) => visible(element) && !element.closest('[data-tts-exclude], .no-read')
					)
				: [];
			const undersizedBody = bodyNodes
				.filter(
					(element) => Number.parseFloat(getComputedStyle(element).fontSize) < bodyMinimum - 0.05
				)
				.map(
					(element) =>
						`${describe(element)}=${getComputedStyle(element).fontSize}: ${normalise(
							element.textContent ?? ''
						).slice(0, 70)}`
				);

			const critical = Array.from(
				root.querySelectorAll<HTMLElement>(
					'h1, h2, blockquote, figure, img, button, [role="button"]'
				)
			).filter(visible);
			const outOfLeaf = critical.flatMap((element) => {
				const leaf = element.closest<HTMLElement>('.thought-leaf');
				if (!leaf) return [];
				const rect = element.getBoundingClientRect();
				const leafRect = leaf.getBoundingClientRect();
				const exceeds =
					rect.left < leafRect.left - 1 ||
					rect.right > leafRect.right + 1 ||
					rect.top < leafRect.top - 1 ||
					rect.bottom > leafRect.bottom + 1;
				return exceeds ? [`${describe(element)} exceeds ${describe(leaf)}`] : [];
			});

			const meaningful = Array.from(
				root.querySelectorAll<HTMLElement>(
					'h1, h2, h3, h4, p, li, blockquote, figure, img, button, a[href]'
				)
			).filter(visible);
			const clippedContent = meaningful.flatMap((element) => {
				const chain: HTMLElement[] = [];
				let ancestor = element.parentElement;
				while (ancestor && root.contains(ancestor)) {
					chain.push(ancestor);
					if (ancestor.matches('.thought-leaf')) break;
					ancestor = ancestor.parentElement;
				}
				const clippingAncestor = chain.find((candidate) => {
					const style = getComputedStyle(candidate);
					const clipsX = /hidden|clip/u.test(style.overflowX);
					const clipsY = /hidden|clip/u.test(style.overflowY);
					return (
						(clipsX && candidate.scrollWidth > candidate.clientWidth + 2) ||
						(clipsY && candidate.scrollHeight > candidate.clientHeight + 2)
					);
				});
				return clippingAncestor
					? [`${describe(element)} is clipped by ${describe(clippingAncestor)}`]
					: [];
			});

			const overlaps: string[] = [];
			if (detectOverlap) {
				const candidates = Array.from(
					root.querySelectorAll<HTMLElement>('h1, h2, h3, p, li, blockquote, figure')
				).filter((element) => visible(element) && !element.closest('[data-tts-exclude]'));
				for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
					const first = candidates[firstIndex];
					const firstLeaf = first.closest('.thought-leaf');
					const firstRect = first.getBoundingClientRect();
					for (
						let secondIndex = firstIndex + 1;
						secondIndex < candidates.length;
						secondIndex += 1
					) {
						const second = candidates[secondIndex];
						if (second.closest('.thought-leaf') !== firstLeaf) continue;
						if (first.contains(second) || second.contains(first)) continue;
						const secondRect = second.getBoundingClientRect();
						const intersectionWidth =
							Math.min(firstRect.right, secondRect.right) -
							Math.max(firstRect.left, secondRect.left);
						const intersectionHeight =
							Math.min(firstRect.bottom, secondRect.bottom) -
							Math.max(firstRect.top, secondRect.top);
						if (intersectionWidth > 2 && intersectionHeight > 2) {
							overlaps.push(`${describe(first)} overlaps ${describe(second)}`);
						}
					}
				}
			}

			const documentElement = document.documentElement;
			const rootElement = root as HTMLElement;
			return {
				documentOverflow: documentElement.scrollWidth - documentElement.clientWidth,
				rootOverflow: rootElement.scrollWidth - rootElement.clientWidth,
				spreads,
				undersizedBody,
				outOfLeaf,
				clippedContent,
				overlaps
			};
		},
		{ bodyMinimum: minimumBodyPx, detectOverlap: checkOverlap }
	);
}

function assertLayoutAudit(
	audit: Awaited<ReturnType<typeof auditLayout>>,
	mode: 'paired' | 'stacked'
): void {
	expect(audit.documentOverflow, 'document horizontal overflow in CSS px').toBeLessThanOrEqual(1);
	expect(audit.rootOverflow, 'folio horizontal overflow in CSS px').toBeLessThanOrEqual(1);
	expect(audit.spreads.length, 'the folio must contain measured spreads').toBeGreaterThan(0);
	expect(audit.undersizedBody).toEqual([]);
	expect(audit.outOfLeaf).toEqual([]);
	expect(audit.clippedContent).toEqual([]);
	expect(audit.overlaps).toEqual([]);

	for (const spread of audit.spreads) {
		expect(spread.sides, `${spread.id} must have exactly two direct leaves in DOM order`).toEqual([
			'left',
			'right'
		]);
		if (mode === 'paired') {
			expect(
				Math.abs(spread.leftTop - spread.rightTop),
				`${spread.id} paired leaf top delta`
			).toBeLessThanOrEqual(2);
			expect(
				spread.rightLeft - spread.leftRight,
				`${spread.id} protected gutter`
			).toBeGreaterThanOrEqual(24);
		} else {
			expect(
				spread.rightTop,
				`${spread.id} right leaf starts after left leaf`
			).toBeGreaterThanOrEqual(spread.leftBottom - 1);
		}
	}
}

function expectedSpeechFromMarkdown(markdown: string): string {
	const normalizedNewlines = markdown.replace(/\r\n?/gu, '\n');
	const body = normalizedNewlines.replace(/^---[\s\S]*?\n---\s*\n/u, '');
	const prose = body
		.replace(/<!--[\s\S]*?-->/gu, ' ')
		.replace(/<ThoughtArt\b[\s\S]*?\/>/gu, ' ')
		.replace(/<\/?(?:ThoughtSpread|ThoughtLeaf)\b[^>]*>/gu, ' ')
		.replace(/^\s*[-*_]{3,}\s*$/gmu, ' ')
		.replace(/^\s{0,3}#{1,6}\s+/gmu, '')
		.replace(/^\s{0,3}>\s?/gmu, '')
		.replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
		.replace(/<[^>]+>/gu, ' ')
		.replace(/&nbsp;/gu, ' ')
		.replace(/&amp;/gu, '&')
		.replace(/&quot;/gu, '"')
		.replace(/&#39;|&apos;/gu, "'")
		.replace(/[`*_~]/gu, '');
	return normalizeSpeechText(`${articleTitle} ${prose}`);
}

function collectFontResponses(page: Page): Array<Promise<FontRecord>> {
	const records: Array<Promise<FontRecord>> = [];
	page.on('response', (response) => {
		if (
			response.request().resourceType() !== 'font' &&
			!/\.woff2?(?:$|\?)/iu.test(response.url())
		) {
			return;
		}
		records.push(
			response
				.body()
				.then((body) => ({
					url: response.url(),
					status: response.status(),
					mime: response.headers()['content-type'] ?? '',
					bytes: body.byteLength
				}))
				.catch(() => ({
					url: response.url(),
					status: response.status(),
					mime: response.headers()['content-type'] ?? '',
					bytes: Number(response.headers()['content-length'] ?? 0)
				}))
		);
	});
	return records;
}

async function loadedFontFamilies(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Array.from(document.fonts)
			.filter((face) => face.status === 'loaded')
			.map((face) => face.family.replace(/["']/gu, ''))
	);
}

async function expectStaticImage(
	request: APIRequestContext,
	path: string,
	expectedMime: RegExp
): Promise<void> {
	const response = await request.get(path);
	expect(response.status(), path).toBe(200);
	expect(response.headers()['content-type'] ?? '', path).toMatch(expectedMime);
	expect((await response.body()).byteLength, path).toBeGreaterThan(1_000);
}

test.describe('Human Margin responsive folio contract', () => {
	for (const viewport of viewportMatrix) {
		test(`${viewport.width}x${viewport.height} is ${viewport.mode}, ordered, unclipped and readable`, async ({
			page
		}) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openArticle(page);
			const audit = await auditLayout(page, viewport.minimumBodyPx);
			assertLayoutAudit(audit, viewport.mode);
		});
	}

	test('959/960/961 landscape transition has no padding or type cliff', async ({ page }) => {
		const samples: Array<{
			width: number;
			body: number;
			heading: number;
			inlinePadding: number;
		}> = [];

		for (const width of [959, 960, 961]) {
			await page.setViewportSize({ width, height: 900 });
			await openArticle(page);
			samples.push(
				await page.locator(folioSelector).evaluate((root, sampleWidth) => {
					const paragraph = Array.from(
						root.querySelectorAll<HTMLElement>('[data-article-reading-region] p')
					).find((element) => !element.closest('[data-tts-exclude]'));
					const heading = root.querySelector<HTMLElement>('[data-article-reading-region] h2');
					const leaf = root.querySelector<HTMLElement>('.thought-leaf');
					if (!paragraph || !heading || !leaf) throw new Error('Missing folio typography sample');
					const leafStyle = getComputedStyle(leaf);
					return {
						width: sampleWidth,
						body: Number.parseFloat(getComputedStyle(paragraph).fontSize),
						heading: Number.parseFloat(getComputedStyle(heading).fontSize),
						inlinePadding:
							Number.parseFloat(leafStyle.paddingLeft) + Number.parseFloat(leafStyle.paddingRight)
					};
				}, width)
			);
		}

		for (let index = 1; index < samples.length; index += 1) {
			const before = samples[index - 1];
			const after = samples[index];
			expect(
				Math.abs(after.body - before.body),
				`${before.width}→${after.width} body type`
			).toBeLessThanOrEqual(2);
			expect(
				Math.max(after.heading, before.heading) / Math.min(after.heading, before.heading),
				`${before.width}→${after.width} heading ratio`
			).toBeLessThanOrEqual(1.45);
			expect(
				Math.max(after.inlinePadding, before.inlinePadding) /
					Math.min(after.inlinePadding, before.inlinePadding),
				`${before.width}→${after.width} leaf-padding ratio`
			).toBeLessThanOrEqual(1.6);
		}
	});

	test('cover preserves its four authored line groups at paired widths', async ({ page }) => {
		for (const viewport of [
			{ width: 960, height: 900 },
			{ width: 961, height: 900 },
			{ width: 1_024, height: 768 },
			{ width: 1_440, height: 900 }
		]) {
			await page.setViewportSize(viewport);
			await openArticle(page);
			const title = await page.locator('.hm-cover-title').evaluate((heading) => ({
				clientWidth: (heading as HTMLElement).clientWidth,
				scrollWidth: (heading as HTMLElement).scrollWidth,
				lines: Array.from(heading.querySelectorAll('span')).map((line) => {
					const range = document.createRange();
					range.selectNodeContents(line);
					return {
						text: line.textContent?.trim() ?? '',
						fragments: range.getClientRects().length
					};
				})
			}));

			expect(title.lines.map(({ text }) => text)).toEqual([
				'Why You Still Want',
				'to Read a',
				'Healthcare IT Blog',
				'in the Age of AI.'
			]);
			expect(
				title.lines.every(({ fragments }) => fragments === 1),
				`${viewport.width}px`
			).toBe(true);
			expect(title.scrollWidth, `${viewport.width}px title overflow`).toBeLessThanOrEqual(
				title.clientWidth + 1
			);
		}
	});

	test('technology ledger keeps one 01–07 sequence in portrait and paired layouts', async ({
		page
	}) => {
		for (const viewport of [
			{ width: 390, height: 844 },
			{ width: 1_440, height: 900 }
		]) {
			await page.setViewportSize(viewport);
			await openArticle(page);
			const numbers = await page
				.locator(
					'#technology-stack .thought-leaf[data-side="left"] p:not(:first-of-type), #technology-stack .thought-leaf[data-side="right"] p:not(:last-of-type)'
				)
				.evaluateAll((entries) =>
					entries.map((entry) =>
						getComputedStyle(entry, '::before').content.replaceAll(/["']/gu, '')
					)
				);
			expect(numbers, `${viewport.width}x${viewport.height}`).toEqual([
				'01',
				'02',
				'03',
				'04',
				'05',
				'06',
				'07'
			]);
		}
	});

	test('canonical body spreads retain book width and paired leaves retain readable measure', async ({
		page
	}) => {
		for (const viewport of [
			{ label: 'portrait-390x844', width: 390, height: 844, checkLeafMeasure: false },
			{ label: 'paired-1440x900', width: 1_440, height: 900, checkLeafMeasure: true }
		]) {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openArticle(page);
			const geometry = await page.locator(folioSelector).evaluate((root) => {
				const book = root.querySelector<HTMLElement>('.hm-book');
				const reading = root.querySelector<HTMLElement>('.hm-reading');
				if (!book || !reading) throw new Error('Missing Human Margin book or reading deck');

				const bookWidth = book.getBoundingClientRect().width;
				const readingWidth = reading.getBoundingClientRect().width;
				const bodySpreads = Array.from(
					reading.querySelectorAll<HTMLElement>(':scope > .thought-spread')
				);
				const spreads = bodySpreads.map((spread) => ({
					id: spread.id,
					width: spread.getBoundingClientRect().width
				}));

				const leafMeasures = bodySpreads.flatMap((spread) =>
					Array.from(
						spread.querySelectorAll<HTMLElement>(':scope > .thought-spread__leaves > .thought-leaf')
					).map((leaf) => {
						const canonicalParagraphs = Array.from(leaf.querySelectorAll<HTMLElement>('p')).filter(
							(element) => !element.closest('[data-tts-exclude], .no-read')
						);
						const paragraph = canonicalParagraphs.reduce<HTMLElement | undefined>(
							(smallest, element) => {
								if (!smallest) return element;
								return Number.parseFloat(getComputedStyle(element).fontSize) <
									Number.parseFloat(getComputedStyle(smallest).fontSize)
									? element
									: smallest;
							},
							undefined
						);
						if (!paragraph) {
							return {
								spread: spread.id,
								side: leaf.dataset.side ?? '',
								paragraphWidth: 0,
								fortyTwoCh: Number.POSITIVE_INFINITY
							};
						}

						const style = getComputedStyle(paragraph);
						const probe = document.createElement('span');
						probe.setAttribute('aria-hidden', 'true');
						Object.assign(probe.style, {
							position: 'fixed',
							visibility: 'hidden',
							pointerEvents: 'none',
							width: '42ch',
							padding: '0',
							border: '0',
							fontFamily: style.fontFamily,
							fontSize: style.fontSize,
							fontStyle: style.fontStyle,
							fontWeight: style.fontWeight,
							fontStretch: style.fontStretch
						});
						document.body.append(probe);
						const fortyTwoCh = probe.getBoundingClientRect().width;
						probe.remove();
						return {
							spread: spread.id,
							side: leaf.dataset.side ?? '',
							paragraphWidth: paragraph.getBoundingClientRect().width,
							fortyTwoCh
						};
					})
				);

				return { bookWidth, readingWidth, spreads, leafMeasures };
			});

			expect(geometry.spreads.length, `${viewport.label} canonical spread count`).toBe(12);
			expect(
				Math.abs(geometry.readingWidth - geometry.bookWidth),
				`${viewport.label} reading deck/book width delta`
			).toBeLessThanOrEqual(1);
			for (const spread of geometry.spreads) {
				expect(
					Math.abs(spread.width - geometry.bookWidth),
					`${viewport.label} #${spread.id} spread/book width delta`
				).toBeLessThanOrEqual(1);
			}

			if (viewport.checkLeafMeasure) {
				expect(
					geometry.leafMeasures.length,
					'twelve paired spreads expose twenty-four leaves'
				).toBe(24);
				for (const measure of geometry.leafMeasures) {
					expect(
						measure.paragraphWidth,
						`${measure.spread} ${measure.side} first paragraph width`
					).toBeGreaterThanOrEqual(360);
					expect(
						measure.paragraphWidth,
						`${measure.spread} ${measure.side} first paragraph must retain at least a 42ch measure (${measure.fortyTwoCh}px)`
					).toBeGreaterThanOrEqual(measure.fortyTwoCh - 1);
				}
			}
		}
	});

	test('WCAG text spacing does not clip or overlap at portrait and paired widths', async ({
		page
	}) => {
		for (const viewport of [
			{ width: 390, height: 844, mode: 'stacked' as const, minimumBodyPx: 17 },
			{ width: 1_440, height: 900, mode: 'paired' as const, minimumBodyPx: 18 }
		]) {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openArticle(page);
			await page.addStyleTag({
				content: `
					${folioSelector}, ${folioSelector} *:not(svg):not(svg *) {
						line-height: 1.5 !important;
						letter-spacing: 0.12em !important;
						word-spacing: 0.16em !important;
					}
					${folioSelector} p { margin-block-end: 2em !important; }
				`
			});
			const audit = await auditLayout(page, viewport.minimumBodyPx, true);
			assertLayoutAudit(audit, viewport.mode);
		}
	});

	test('200% and 400% CSS-pixel reflow have one-dimensional scrolling', async ({
		browser
	}, testInfo) => {
		const baseURL = String(testInfo.project.use.baseURL);
		for (const zoomProxy of [
			{ label: '200%', viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 },
			{ label: '400%', viewport: { width: 320, height: 568 }, deviceScaleFactor: 4 }
		]) {
			const context = await browser.newContext({
				baseURL,
				viewport: zoomProxy.viewport,
				deviceScaleFactor: zoomProxy.deviceScaleFactor
			});
			const page = await context.newPage();
			await openArticle(page);
			const audit = await auditLayout(page, 17);
			assertLayoutAudit(audit, 'stacked');
			expect(await page.evaluate(() => window.devicePixelRatio), zoomProxy.label).toBe(
				zoomProxy.deviceScaleFactor
			);
			await context.close();
		}
	});
});

test.describe('Human Margin semantics, controls and extraction', () => {
	test('has one exact H1, nine canonical H2 anchors, unique IDs and semantic landmarks', async ({
		page
	}) => {
		await openArticle(page);
		const h1 = page.getByRole('heading', { level: 1 });
		await expect(h1).toHaveCount(1);
		const semanticH1 = normalizeText((await h1.textContent()) ?? '');
		expect(semanticH1).toBe(articleTitle);
		expect(semanticH1.endsWith('.')).toBe(true);
		await expect(h1).toHaveCSS('text-transform', 'none');

		await expect(page.locator('main')).toHaveCount(1);
		await expect(page.locator('article')).toHaveCount(1);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toHaveCount(1);
		await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
		await expect(
			page.locator(`${folioSelector} nav[aria-label="Breadcrumb"] a[href="/blog"]`)
		).toHaveCount(1);

		const renderedHeadings = await page
			.locator(`${folioSelector} ${readingRegionSelector} h2`)
			.evaluateAll((elements) =>
				elements
					.filter((element) => !element.closest('[data-tts-exclude], .no-read'))
					.map((element) => ({
						text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim(),
						id: element.id
					}))
			);
		expect(renderedHeadings).toEqual(canonicalHeadings);

		for (const heading of canonicalHeadings) {
			await expect(page.locator(`#${heading.id}`)).toHaveCount(1);
			expect(
				await page.locator(`${folioSelector} a[href="#${heading.id}"]`).count(),
				`${heading.id} is reachable from folio navigation`
			).toBeGreaterThanOrEqual(1);
		}

		const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
			const counts = new Map<string, number>();
			for (const element of elements) counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
			return Array.from(counts.entries())
				.filter(([, count]) => count > 1)
				.map(([id, count]) => `${id} (${count})`);
		});
		expect(duplicateIds).toEqual([]);

		const firstContentsLink = page.locator(
			`${folioSelector} .hm-contents a[href="#${canonicalHeadings[0].id}"]`
		);
		await firstContentsLink.click();
		await expect(page).toHaveURL(new RegExp(`#${canonicalHeadings[0].id}$`, 'u'));
		await expect(page.locator(`#${canonicalHeadings[0].id}`)).toBeVisible();
	});

	test('direct leaf DOM order is also keyboard/read order and controls retain names and targets', async ({
		page
	}) => {
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.addInitScript(() => {
			window.print = () => {
				document.documentElement.dataset.testPrintInvoked = 'true';
			};
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await openArticle(page);
		await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: /Listen to article/u })).toBeVisible();

		const leafOrders = await page
			.locator(`${folioSelector} .thought-spread`)
			.evaluateAll((spreads) =>
				spreads.map((spread) =>
					Array.from(
						spread.querySelectorAll(':scope > .thought-spread__leaves > .thought-leaf')
					).map((leaf) => leaf.getAttribute('data-side'))
				)
			);
		for (const order of leafOrders) expect(order).toEqual(['left', 'right']);
		const focusOrderAudit = await page
			.locator(`${folioSelector} .thought-spread`)
			.evaluateAll((spreads) =>
				spreads.map((spread) => {
					const focusables = Array.from(
						spread.querySelectorAll<HTMLElement>(
							'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]'
						)
					).filter((element) => element.tabIndex >= 0);
					return {
						positiveTabindex: focusables
							.filter((element) => element.tabIndex > 0)
							.map((element) => `${element.tagName}:${element.tabIndex}`),
						sides: focusables.map((element) =>
							element.closest('.thought-leaf')?.getAttribute('data-side')
						)
					};
				})
			);
		for (const spread of focusOrderAudit) {
			expect(spread.positiveTabindex).toEqual([]);
			const firstRight = spread.sides.indexOf('right');
			if (firstRight >= 0) expect(spread.sides.slice(firstRight)).not.toContain('left');
		}

		const controls = page.locator(
			`${folioSelector} button, ${folioSelector} [role="button"], ${folioSelector} input, ${folioSelector} select, ${folioSelector} summary`
		);
		const visibleControls = controls.filter({ visible: true });
		expect(await visibleControls.count()).toBeGreaterThanOrEqual(3);
		for (let index = 0; index < (await visibleControls.count()); index += 1) {
			const control = visibleControls.nth(index);
			await expect(control).toHaveAccessibleName(/\S/u);
			const box = await control.boundingBox();
			expect(box, `control ${index} has a box`).not.toBeNull();
			expect(box?.width ?? 0, `control ${index} width`).toBeGreaterThanOrEqual(43.5);
			expect(box?.height ?? 0, `control ${index} height`).toBeGreaterThanOrEqual(43.5);
		}

		const copy = page.getByRole('button', { name: 'Copy link', exact: true });
		await expect(copy).toHaveCount(1);
		await copy.click();
		await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toHaveCount(1);

		const print = page.getByRole('button', { name: 'Print', exact: true });
		await expect(print).toHaveCount(1);
		await print.click();
		await expect(page.locator('html')).toHaveAttribute('data-test-print-invoked', 'true');

		const listen = page.locator('section[aria-label="Audio article"] > button');
		await expect(listen).toHaveCount(1);
		await expect(listen).toHaveAccessibleName(/Listen to article/u);
		await listen.click();
		await expect(listen).toHaveAccessibleName(/(?:Pause|Resume|Continue) article audio/u);
		const stop = page.getByRole('button', { name: 'Stop', exact: true });
		if (await stop.isVisible()) await stop.click();
	});

	test('TTS clone extraction equals canonical Markdown once and excludes folio furniture', async ({
		page
	}) => {
		const markdown = await readFile(
			resolve('src/lib/posts/why-read-a-healthcare-it-blog-in-the-age-of-ai.md'),
			'utf8'
		);
		const expectedSpeech = expectedSpeechFromMarkdown(markdown);
		await openArticle(page);

		const extractedSpeech = await page.locator(folioSelector).evaluate((root) => {
			const articleBody =
				root.querySelector<HTMLElement>('[data-article-reading-region]') ??
				root.querySelector<HTMLElement>('.prose');
			if (!articleBody) throw new Error('No article reading region');
			const clone = articleBody.cloneNode(true) as HTMLElement;
			clone
				.querySelectorAll(
					[
						'[data-tts-exclude]',
						'.no-read',
						'button',
						'nav',
						'aside',
						'audio',
						'video',
						'iframe',
						'script',
						'style',
						'noscript',
						'pre',
						'code',
						'kbd',
						'samp',
						'svg'
					].join(', ')
				)
				.forEach((element) => element.remove());
			return (clone.innerText || clone.textContent || '').replace(/\s+/gu, ' ').trim();
		});

		const normalizedExtractedSpeech = normalizeSpeechText(extractedSpeech);
		expect(normalizedExtractedSpeech).toBe(expectedSpeech);
		for (const excludedText of [
			'cover-service-panel',
			'stakeholders-layered',
			'Contents /',
			'Keep, print, or pass it on',
			'Copy link',
			'Listen to article',
			'Word Cloud',
			'Social-human-margin'
		]) {
			expect(normalizedExtractedSpeech).not.toContain(excludedText);
		}
		for (const marker of [
			articleTitle,
			"You don't know what you don't know.",
			'the technology of human thought',
			'That is why you still want to read a blog.',
			'P.S. If you have real, authentic questions',
			'References:'
		]) {
			expect(normalizedExtractedSpeech.split(marker).length - 1, marker).toBe(1);
		}
	});

	test('SSR/no-JS response keeps canonical prose and heading markers', async ({
		browser
	}, testInfo) => {
		const context = await browser.newContext({
			baseURL: String(testInfo.project.use.baseURL),
			javaScriptEnabled: false,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.locator(folioSelector)).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(articleTitle);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'You don’t know what you don’t know.'
		);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'The AI does not understand this. It cannot. That is why you still want to read a blog.'
		);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'P.S. If you have real, authentic questions'
		);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'References:'
		);
		const canonicalH2s = await page
			.locator(`${folioSelector} ${readingRegionSelector} h2`)
			.evaluateAll((elements) =>
				elements
					.filter((element) => !element.closest('[data-tts-exclude], .no-read'))
					.map((element) => element.textContent?.trim())
			);
		expect(canonicalH2s).toEqual(canonicalHeadings.map(({ text }) => text));
		await context.close();
	});

	test('automated WCAG A/AA rules pass within the folio', async ({ page }) => {
		await openArticle(page);
		const themeColours = await page.locator(folioSelector).evaluate((root) => ({
			coverDeck: getComputedStyle(root.querySelector<HTMLElement>('.hm-cover-deck')!).color,
			paperBody: getComputedStyle(
				root.querySelector<HTMLElement>(
					'#why-corruption-attack-surface .thought-leaf[data-side="left"] p'
				)!
			).color,
			coalBody: getComputedStyle(
				root.querySelector<HTMLElement>(
					'#why-corruption-attack-surface .thought-leaf[data-side="right"] p'
				)!
			).color
		}));
		expect(themeColours.coverDeck).toBe('rgb(36, 37, 34)');
		expect(themeColours.paperBody).toBe('rgb(36, 37, 34)');
		expect(themeColours.coalBody).toBe('rgb(228, 224, 215)');
		const results = await new AxeBuilder({ page })
			.include(folioSelector)
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe('Human Margin images, fonts and runtime isolation', () => {
	test('the body-art images have exact paths, authored alts, intrinsic dimensions and loading policy', async ({
		page,
		request
	}) => {
		const requestedUrls: string[] = [];
		page.on('request', (request) => requestedUrls.push(request.url()));
		await openArticle(page);

		const images = page.locator(
			`${folioSelector} img[src*="/images/thought-folios/healthcare-human-margin/"]`
		);
		await expect(images).toHaveCount(bodyArt.length);
		const ssrResponse = await request.get(articlePath);
		expect(ssrResponse.ok()).toBe(true);
		const ssrMarkup = await ssrResponse.text();
		expect(ssrMarkup.match(/data-responsive-image/gu)?.length ?? 0).toBe(bodyArt.length);
		expect(ssrMarkup.match(/sizes="\(orientation: portrait\)/gu)?.length ?? 0).toBe(
			bodyArt.length * 2
		);
		const responsiveSources = page.locator(`${folioSelector} source[data-responsive-image]`);
		const survivingSourceCount = await responsiveSources.count();
		expect(survivingSourceCount).toBeLessThanOrEqual(bodyArt.length);
		for (let index = 0; index < survivingSourceCount; index += 1) {
			await expect(responsiveSources.nth(index)).toHaveAttribute(
				'sizes',
				/\(orientation: portrait\)/u
			);
		}

		for (let index = 0; index < bodyArt.length; index += 1) {
			const expectedImage = bodyArt[index];
			const image = images.nth(index);
			await expect(image).toHaveAttribute('src', expectedImage.path);
			await expect(image).toHaveAttribute('alt', expectedImage.alt);
			await expect(image).toHaveAttribute('width', String(expectedImage.width));
			await expect(image).toHaveAttribute('height', String(expectedImage.height));
			await expect(image).toHaveAttribute('decoding', 'async');
			const policy = await image.evaluate((element: HTMLImageElement) => ({
				loading: element.loading,
				fetchPriority: element.fetchPriority || 'auto',
				sizes: element.getAttribute('sizes')
			}));
			expect(policy.loading, expectedImage.path).toBe(expectedImage.loading);
			expect(policy.fetchPriority, expectedImage.path).toBe(expectedImage.fetchPriority);
			expect(policy.sizes, `${expectedImage.path} responsive sizes`).toContain(
				'(orientation: portrait)'
			);

			await image.scrollIntoViewIfNeeded();
			await expect
				.poll(() =>
					image.evaluate(
						(element: HTMLImageElement) => element.complete && element.naturalWidth > 0
					)
				)
				.toBe(true);
			await image.evaluate(async (element: HTMLImageElement) => {
				try {
					await element.decode();
				} catch {
					// `complete && naturalWidth > 0` above is the authoritative decode fallback.
				}
			});
			const caption = image.locator('xpath=ancestor::figure[1]/figcaption');
			if ((await caption.count()) > 0) {
				const captionText = normalizeText(await caption.innerText());
				expect(captionText, `${expectedImage.path} caption must add context`).not.toBe(
					expectedImage.alt
				);
				const captionFontSize = await caption.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).fontSize)
				);
				expect(captionFontSize, `${expectedImage.path} caption size`).toBeGreaterThanOrEqual(15);
			}
			await expectStaticImage(request, expectedImage.path, /^image\/jpeg\b/iu);
		}

		const highPriority = await images.evaluateAll((elements) =>
			elements
				.filter((element) => (element as HTMLImageElement).fetchPriority === 'high')
				.map((element) => element.getAttribute('src'))
		);
		expect(highPriority).toEqual([bodyArt[0].path]);
		for (const legacyPath of legacyArticleImages) {
			expect(
				requestedUrls.some((url) => new URL(url).pathname === legacyPath),
				legacyPath
			).toBe(false);
		}
	});

	test('legacy lead and tea paths are absent from SSR, DOM, metadata, CSS URLs and resources', async ({
		page,
		request
	}) => {
		const response = await request.get(articlePath);
		expect(response.ok()).toBe(true);
		const ssrHtml = await response.text();
		await openArticle(page);
		const renderedHtml = await page.content();
		const resourceUrls = await page.evaluate(() =>
			performance.getEntriesByType('resource').map((entry) => entry.name)
		);
		const cssText = await page.evaluate(() => {
			const chunks: string[] = [];
			for (const sheet of Array.from(document.styleSheets)) {
				try {
					for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
				} catch {
					// Cross-origin sheets cannot contribute a same-origin article asset path.
				}
			}
			return chunks.join('\n');
		});

		for (const legacyPath of legacyArticleImages) {
			expect(ssrHtml, `SSR excludes ${legacyPath}`).not.toContain(legacyPath);
			expect(renderedHtml, `DOM excludes ${legacyPath}`).not.toContain(legacyPath);
			expect(cssText, `CSS excludes ${legacyPath}`).not.toContain(legacyPath);
			expect(
				resourceUrls.some((url) => new URL(url).pathname === legacyPath),
				legacyPath
			).toBe(false);
		}
	});

	test('folio fonts load successfully within five requests and 200 KiB, with at most two preloads', async ({
		page
	}) => {
		const fontResponses = collectFontResponses(page);
		await openArticle(page);
		await page.locator(`${folioSelector} .thought-spread`).last().scrollIntoViewIfNeeded();
		await page.evaluate(async () => {
			await document.fonts.ready;
		});

		const families = await loadedFontFamilies(page);
		for (const family of ['Source Serif 4 Variable', 'Roboto Variable']) {
			expect(
				families.some((candidate) =>
					candidate.toLocaleLowerCase('en').includes(family.toLowerCase())
				),
				`${family} is loaded`
			).toBe(true);
		}

		const typeRoles = await page.locator(folioSelector).evaluate((root) => {
			const family = (selector: string) => {
				const element = root.querySelector<HTMLElement>(selector);
				if (!element) throw new Error(`Missing typography role: ${selector}`);
				return getComputedStyle(element).fontFamily;
			};
			return {
				cover: family('.hm-cover-title'),
				author: family('#about-the-author h2'),
				wordCloud: family('.hm-word-cloud h2'),
				module: family('.hm-module-title'),
				rail: family('.thought-spread__rail span')
			};
		});
		expect(typeRoles.cover).toContain('Source Serif 4 Variable');
		expect(typeRoles.author).toContain('Source Serif 4 Variable');
		expect(typeRoles.wordCloud).toContain('Roboto Variable');
		expect(typeRoles.module).toContain('Roboto Variable');
		expect(typeRoles.rail).toContain('Roboto Variable');

		const records = Array.from(
			new Map((await Promise.all(fontResponses)).map((record) => [record.url, record])).values()
		);
		const retiredHumanRecords = records.filter((record) =>
			retiredHumanFontPattern.test(decodeURIComponent(record.url))
		);
		expect(retiredHumanRecords, 'retired dossier fonts must not load').toEqual([]);
		expect(records.length, records.map(({ url }) => url).join('\n')).toBeGreaterThanOrEqual(2);
		expect(records.length, records.map(({ url }) => url).join('\n')).toBeLessThanOrEqual(5);
		for (const record of records) {
			expect(record.status, record.url).toBe(200);
			expect(record.mime, record.url).toMatch(/(?:font|woff|octet-stream)/iu);
			expect(record.bytes, record.url).toBeGreaterThan(0);
		}
		expect(records.reduce((total, record) => total + record.bytes, 0)).toBeLessThanOrEqual(
			200 * 1_024
		);

		const preloads = await page
			.locator('link[rel="preload"][as="font"]')
			.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
		expect(preloads.length, preloads.join('\n')).toBeLessThanOrEqual(2);
	});

	test('initial-load CLS stays below 0.10 total and 0.05 during font swaps', async ({
		browser
	}, testInfo) => {
		test.setTimeout(150_000);
		const baseURL = String(testInfo.project.use.baseURL);

		for (const viewport of [
			{ label: 'portrait-390x844', width: 390, height: 844 },
			{ label: 'paired-1440x900', width: 1_440, height: 900 }
		]) {
			const context = await browser.newContext({
				baseURL,
				viewport: { width: viewport.width, height: viewport.height }
			});
			const page = await context.newPage();
			await page.addInitScript(() => {
				type BrowserClsState = {
					supported: boolean;
					createdAt: number;
					lastShiftAt: number;
					activeFontWindow: number | null;
					fontWindows: Array<{ start: number; end: number | null }>;
					shifts: Array<{ startTime: number; value: number; sources: string[] }>;
				};
				type AuditedWindow = Window & { __humanMarginClsAudit?: BrowserClsState };
				type LayoutShiftEntry = PerformanceEntry & {
					value: number;
					hadRecentInput: boolean;
					sources?: Array<{ node?: Node | null }>;
				};

				const supported = PerformanceObserver.supportedEntryTypes.includes('layout-shift');
				const now = performance.now();
				const state: BrowserClsState = {
					supported,
					createdAt: now,
					lastShiftAt: now,
					activeFontWindow: null,
					fontWindows: [],
					shifts: []
				};
				(window as AuditedWindow).__humanMarginClsAudit = state;

				const beginFontWindow = () => {
					if (state.activeFontWindow !== null) return;
					state.fontWindows.push({ start: performance.now(), end: null });
					state.activeFontWindow = state.fontWindows.length - 1;
				};
				const endFontWindow = () => {
					if (state.activeFontWindow === null) return;
					state.fontWindows[state.activeFontWindow].end = performance.now();
					state.activeFontWindow = null;
				};

				document.fonts.addEventListener('loading', beginFontWindow);
				document.fonts.addEventListener('loadingdone', endFontWindow);
				document.fonts.addEventListener('loadingerror', endFontWindow);
				if (document.fonts.status === 'loading') beginFontWindow();

				if (!supported) return;
				new PerformanceObserver((list) => {
					for (const performanceEntry of list.getEntries()) {
						const entry = performanceEntry as LayoutShiftEntry;
						if (entry.hadRecentInput) continue;
						const sources = (entry.sources ?? []).map(({ node }) => {
							const element = node instanceof Element ? node : node?.parentElement;
							if (!element) return 'unknown';
							const html = element as HTMLElement;
							return `${element.tagName.toLowerCase()}${html.id ? `#${html.id}` : ''}${
								html.classList.length ? `.${Array.from(html.classList).slice(0, 2).join('.')}` : ''
							}`;
						});
						state.shifts.push({
							startTime: entry.startTime,
							value: entry.value,
							sources
						});
						state.lastShiftAt = performance.now();
					}
				}).observe({ type: 'layout-shift', buffered: true });
			});

			await openArticle(page);
			const cover = page.locator(`${folioSelector} img[fetchpriority="high"]`);
			await expect
				.poll(() =>
					cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
				)
				.toBe(true);
			await page.evaluate(
				() =>
					new Promise<void>((resolveFrames) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolveFrames()))
					)
			);
			await expect
				.poll(
					() =>
						page.evaluate(() => {
							type BrowserClsState = { createdAt: number; lastShiftAt: number };
							const state = (window as Window & { __humanMarginClsAudit?: BrowserClsState })
								.__humanMarginClsAudit;
							if (!state || document.fonts.status !== 'loaded') return false;
							return performance.now() - Math.max(state.createdAt, state.lastShiftAt) >= 1_100;
						}),
					{ timeout: 15_000, intervals: [100, 250, 500] }
				)
				.toBe(true);

			const audit = await page.evaluate(() => {
				type BrowserClsState = {
					supported: boolean;
					activeFontWindow: number | null;
					fontWindows: Array<{ start: number; end: number | null }>;
					shifts: Array<{ startTime: number; value: number; sources: string[] }>;
				};
				const state = (window as Window & { __humanMarginClsAudit?: BrowserClsState })
					.__humanMarginClsAudit;
				if (!state) throw new Error('The pre-navigation CLS observer was not installed');
				const now = performance.now();
				return {
					supported: state.supported,
					fontWindows: state.fontWindows.map(({ start, end }) => ({
						start,
						end: end ?? now
					})),
					fontCompletions: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
						.filter((entry) => /\.woff2?(?:$|\?)/iu.test(entry.name) && entry.responseEnd > 0)
						.map((entry) => ({ url: entry.name, responseEnd: entry.responseEnd })),
					shifts: state.shifts
				};
			});
			expect(audit.supported, `${viewport.label} Layout Instability API support`).toBe(true);
			expect(
				audit.fontCompletions.length,
				`${viewport.label} must expose same-origin font resource timings for attribution`
			).toBeGreaterThan(0);

			const totalCls = maximumClsSessionWindow(audit.shifts);
			const fontSwapWindows: FontLoadWindow[] = [
				...audit.fontCompletions.map(({ responseEnd }) => ({
					start: responseEnd - 100,
					end: responseEnd + 300
				})),
				...audit.fontWindows.map(({ end }) => ({ start: end - 100, end: end + 300 }))
			];
			const typographyShifts = audit.shifts.filter((sample) =>
				fontSwapWindows.some(
					(window) => sample.startTime >= window.start && sample.startTime <= window.end
				)
			);
			const typographyCls = maximumClsSessionWindow(typographyShifts);
			const diagnostics = JSON.stringify(
				{
					viewport: viewport.label,
					totalCls,
					typographyCls,
					fontWindows: audit.fontWindows,
					fontCompletions: audit.fontCompletions,
					shifts: audit.shifts
				},
				null,
				2
			);
			expect(totalCls, diagnostics).toBeLessThan(0.1);
			expect(typographyCls, diagnostics).toBeLessThan(0.05);
			await context.close();
		}
	});

	test('ordinary healthcare and essay routes do not load or preload Human Margin fonts', async ({
		browser
	}, testInfo) => {
		test.setTimeout(150_000);
		const ordinaryRoutes = [
			'/blog/healthcare-it/fhir-the-universal-language-of-health-data',
			'/blog/essay/a-cup-of-cha-is-not-a-small-thing'
		] as const;
		const baseURL = String(testInfo.project.use.baseURL);

		for (const route of ordinaryRoutes) {
			const context = await browser.newContext({
				baseURL,
				viewport: { width: 1_440, height: 900 }
			});
			const page = await context.newPage();
			const fontResponses = collectFontResponses(page);
			await page.goto(route, { waitUntil: 'domcontentloaded' });
			await expect(page.locator('.site-shell')).toHaveCount(1);
			await expect(page.locator('.article-shell')).toHaveCount(1);
			await expect(page.locator(folioSelector)).toHaveCount(0);
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
			await expect(page.locator('.site-shell header').first()).toBeVisible();
			await expect(page.locator('.site-shell footer').first()).toBeVisible();
			await page.evaluate(async () => {
				await document.fonts.ready;
			});

			const records = await Promise.all(fontResponses);
			expect(
				records.filter((record) => humanOnlyFontPattern.test(decodeURIComponent(record.url))),
				route
			).toEqual([]);
			const families = await loadedFontFamilies(page);
			expect(
				families.filter((family) => humanOnlyFontPattern.test(family)),
				route
			).toEqual([]);
			const ordinaryPreloadHrefs = await page
				.locator('link[rel="preload"][as="font"]')
				.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
			const preloadLeak = ordinaryPreloadHrefs.filter((href) =>
				humanOnlyFontPattern.test(decodeURIComponent(href))
			);
			expect(preloadLeak, route).toEqual([]);

			for (const viewport of [
				{ label: '390x844', width: 390, height: 844 },
				{ label: '1440x900', width: 1_440, height: 900 }
			]) {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth - document.documentElement.clientWidth
					),
					`${route} at ${viewport.label}`
				).toBeLessThanOrEqual(1);
				const name = `ordinary-${
					route.includes('/healthcare-it/') ? 'healthcare' : 'essay'
				}-${viewport.label}`;
				const screenshotPath = testInfo.outputPath(`${name}.png`);
				await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
				await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
			}
			await context.close();
		}
	});

	test('client navigation removes the folio stylesheet and restores the ordinary article shell', async ({
		page
	}) => {
		const ordinaryPath = '/blog/healthcare-it/fhir-the-universal-language-of-health-data';
		await openArticle(page);
		await page.evaluate((href) => {
			const link = document.createElement('a');
			link.href = href;
			link.textContent = 'Open ordinary article';
			link.dataset.testOrdinaryNavigation = 'true';
			document.body.append(link);
		}, ordinaryPath);
		await page.locator('[data-test-ordinary-navigation]').click();
		await expect(page).toHaveURL(new RegExp(`${ordinaryPath}$`, 'u'));
		await expect(page.locator(folioSelector)).toHaveCount(0);
		await expect(page.locator('.article-shell')).toHaveCount(1);
		await expect(page.locator('.site-shell header').first()).toBeVisible();
		await expect(page.locator('.site-shell footer').first()).toBeVisible();
		await expect(
			page.locator('link[rel="stylesheet"][href*="healthcare-human-margin"]')
		).toHaveCount(0);
		const ordinaryPreloadHrefs = await page
			.locator('link[rel="preload"][as="font"]')
			.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
		expect(
			ordinaryPreloadHrefs.filter((href) => humanOnlyFontPattern.test(decodeURIComponent(href)))
		).toEqual([]);
		const ordinaryFamilies = await page
			.locator('.article-shell h1, .article-shell .article-prose p')
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontFamily));
		expect(ordinaryFamilies.length).toBeGreaterThan(1);
		expect(ordinaryFamilies.join(' ')).not.toMatch(humanOnlyFontPattern);
	});

	test('canonical prose remains usable when all web-font requests are blocked', async ({
		page
	}) => {
		await page.route('**/*', async (route) => {
			if (
				route.request().resourceType() === 'font' ||
				/\.woff2?(?:$|\?)/iu.test(route.request().url())
			) {
				await route.abort('blockedbyclient');
				return;
			}
			await route.continue();
		});
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.locator(folioSelector)).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'That is why you still want to read a blog.'
		);
		const audit = await auditLayout(page, 18);
		assertLayoutAudit(audit, 'paired');
	});

	test('full route produces no console errors, page errors or unexpected failed resources', async ({
		page
	}) => {
		const diagnostics = observeRuntime(page);
		await openArticle(page);
		for (const spread of await page.locator(`${folioSelector} .thought-spread`).all()) {
			await spread.scrollIntoViewIfNeeded();
		}
		await expectNoRuntimeErrors(diagnostics);
	});
});

test.describe('Human Margin SEO and discoverability', () => {
	test('visible Updated date matches frontmatter, raw SSR, Open Graph and BlogPosting', async ({
		page,
		request
	}) => {
		const markdown = await readFile(
			resolve('src/lib/posts/why-read-a-healthcare-it-blog-in-the-age-of-ai.md'),
			'utf8'
		);
		const frontmatterModifiedDate = markdown.match(
			/^dateModified:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/mu
		)?.[1];
		expect(frontmatterModifiedDate, 'frontmatter dateModified').toBe('2026-08-17');
		const expectedModifiedDate = frontmatterModifiedDate ?? '';
		await openArticle(page);

		const updatedPair = page.locator(`${folioSelector} .hm-cover-meta .hm-date-pair`);
		const updatedTime = updatedPair.locator('time');
		await expect(updatedPair).toHaveCount(1);
		await expect(updatedPair).toBeVisible();
		await expect(updatedPair).toHaveText(/^Updated\s+17 Aug 2026$/u);
		await expect(updatedTime).toHaveCount(1);
		await expect(updatedTime).toBeVisible();
		await expect(updatedTime).toHaveAttribute('datetime', expectedModifiedDate);

		const response = await request.get(articlePath);
		expect(response.ok()).toBe(true);
		const ssrHtml = (await response.text()).replace(/<!--[\s\S]*?-->/gu, '');
		const rawVisibleDates = Array.from(
			ssrHtml.matchAll(/Updated\s*<time\b[^>]*\bdatetime\s*=\s*(["'])(.*?)\1/giu),
			(match) => match[2]
		);
		expect(rawVisibleDates, 'discoverability validator-compatible visible Updated dates').toEqual([
			expectedModifiedDate
		]);

		await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
			'content',
			expectedModifiedDate
		);
		const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
		const entities = jsonLd.flatMap((value) => {
			const graph = JSON.parse(value) as Record<string, unknown>;
			return Array.isArray(graph['@graph'])
				? (graph['@graph'] as Array<Record<string, unknown>>)
				: [graph];
		});
		const posting = entities.find((entity) => entity['@type'] === 'BlogPosting');
		expect(posting?.dateModified).toBe(expectedModifiedDate);
	});

	test('canonical, social metadata and JSON-LD agree on the article and dedicated 1200x630 image', async ({
		page,
		request
	}) => {
		await openArticle(page);
		const socialImage = 'https://www.suvroghosh.in/thumbnail/social-human-margin.jpg';
		const socialAlt =
			'A human hand pauses a clinical data card at the edge of an opaque healthcare system.';

		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl);
		expect(await page.title()).toBe(`${articleTitle} | Suvro Ghosh`);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			articleDescription
		);
		await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/iu);
		await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
		await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalUrl);
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
			'content',
			`${articleTitle} | Suvro Ghosh`
		);
		await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
			'content',
			articleDescription
		);
		await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', socialImage);
		await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
			'content',
			'1200'
		);
		await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
			'content',
			'630'
		);
		await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
			'content',
			socialAlt
		);
		await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
			'content',
			'summary_large_image'
		);
		await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
			'content',
			`${articleTitle} | Suvro Ghosh`
		);
		await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
			'content',
			socialImage
		);
		await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
			'content',
			socialAlt
		);
		await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute(
			'content',
			'2026-06-26'
		);
		await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
			'content',
			'2026-08-17'
		);

		const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
		const graphs = jsonLd.map((value) => JSON.parse(value) as Record<string, unknown>);
		const entities = graphs.flatMap((graph) =>
			Array.isArray(graph['@graph']) ? (graph['@graph'] as Array<Record<string, unknown>>) : [graph]
		);
		const posting = entities.find((entity) => entity['@type'] === 'BlogPosting');
		expect(posting, 'BlogPosting entity').toBeTruthy();
		expect(posting?.headline).toBe(articleTitle);
		expect(posting?.description).toBe(articleDescription);
		expect(posting?.image).toBe(socialImage);
		expect(posting?.datePublished).toBe('2026-06-26');
		expect(posting?.dateModified).toBe('2026-08-17');
		expect(posting?.['@id']).toBe(`${canonicalUrl}#blogposting`);
		expect((posting?.mainEntityOfPage as Record<string, unknown>)?.['@id']).toBe(canonicalUrl);
		const authorId = (posting?.author as Record<string, unknown>)?.['@id'];
		const author = entities.find((entity) => entity['@id'] === authorId);
		expect(author?.name).toBe('Suvro Ghosh');

		await expectStaticImage(request, '/thumbnail/social-human-margin.jpg', /^image\/jpeg\b/iu);
	});

	test('sitemap, Pagefind and word-cloud artifacts expose canonical prose without folio wrappers', async ({
		page,
		request
	}) => {
		test.setTimeout(150_000);
		const sitemapResponse = await request.get('/sitemap.xml');
		expect(sitemapResponse.ok()).toBe(true);
		expect(sitemapResponse.headers()['content-type'] ?? '').toMatch(/(?:xml|text\/plain)/iu);
		const sitemap = await sitemapResponse.text();
		expect(sitemap).toContain(`<loc>${canonicalUrl}</loc>`);

		const manifestResponse = await request.get('/wordcloud/manifest.json');
		expect(manifestResponse.ok()).toBe(true);
		const manifest = (await manifestResponse.json()) as {
			version: string;
			posts: Record<
				string,
				{ sourceHash: string; generatorVersion: string; output: string; topWords: string[] }
			>;
		};
		const rawMarkdown = (
			await readFile(
				resolve('src/lib/posts/why-read-a-healthcare-it-blog-in-the-age-of-ai.md'),
				'utf8'
			)
		).replace(/\r\n?/gu, '\n');
		const articleBody = rawMarkdown.replace(/^---[\s\S]*?\n---\s*\n/u, '');
		const sourceHash = createHash('sha256')
			.update(`${wordCloudGeneratorVersion}\n${articleBody}`, 'utf8')
			.digest('hex');
		const wordCloudEntry = manifest.posts[slug];
		expect(manifest.version).toBe(wordCloudGeneratorVersion);
		expect(wordCloudEntry, slug).toBeTruthy();
		expect(wordCloudEntry.generatorVersion).toBe(wordCloudGeneratorVersion);
		expect(wordCloudEntry.sourceHash).toBe(sourceHash);
		expect(wordCloudEntry.output).toBe(`static/wordcloud/${slug}.svg`);
		expect(wordCloudEntry.topWords.length).toBeGreaterThan(0);
		for (const forbiddenToken of [
			'ThoughtSpread',
			'ThoughtLeaf',
			'ThoughtArt',
			'cover-service-panel'
		]) {
			expect(wordCloudEntry.topWords.join(' ')).not.toContain(forbiddenToken);
		}

		const wordCloudResponse = await request.get(`/wordcloud/${slug}.svg`);
		expect(wordCloudResponse.status()).toBe(200);
		expect(wordCloudResponse.headers()['content-type'] ?? '').toMatch(/image\/svg\+xml/iu);
		const svg = await wordCloudResponse.text();
		expect(svg).not.toMatch(/Thought(?:Spread|Leaf|Art)|cover-service-panel/iu);

		await openArticle(page);
		const cloudImage = page.locator(`${folioSelector} img[src$="/wordcloud/${slug}.svg"]`);
		await expect(cloudImage).toHaveCount(1);
		await cloudImage.scrollIntoViewIfNeeded();
		await expect
			.poll(() => cloudImage.evaluate((image: HTMLImageElement) => image.naturalWidth > 0))
			.toBe(true);

		const pagefindResult = await page.evaluate(
			async ({ targetPath, query }) => {
				const moduleUrl = new URL('/pagefind/pagefind.js', window.location.origin).href;
				const pagefind = (await import(moduleUrl)) as {
					init: () => Promise<void>;
					search: (term: string) => Promise<{
						results: Array<{ data: () => Promise<Record<string, unknown>> }>;
					}>;
				};
				await pagefind.init();
				const search = await pagefind.search(query);
				const records = await Promise.all(
					search.results.slice(0, 20).map((result) => result.data())
				);
				return records.find((record) => {
					const url = typeof record.url === 'string' ? record.url : '';
					return new URL(url, window.location.origin).pathname === targetPath;
				});
			},
			{ targetPath: articlePath, query: 'carnival barker healthcare AI' }
		);
		expect(pagefindResult, 'Pagefind target result').toBeTruthy();
		expect(normalizeText(JSON.stringify(pagefindResult))).not.toMatch(
			/Thought(?:Spread|Leaf|Art)|cover-service-panel/iu
		);
	});

	test('RSS full-prose inclusion is not falsely asserted under the current feed contract', async () => {
		test.skip(
			true,
			'Current rss.xml deliberately emits only the newest 25 metadata summaries; this older essay is outside that slice and RSS has no canonical full-prose field. Sitemap, no-JS SSR, Pagefind and word-cloud checks are the reliable discoverability evidence.'
		);
	});
});

test.describe('Human Margin alternate media and evidence', () => {
	test('reduced motion removes active movement, smooth scrolling and hidden reveal states', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openArticle(page);
		const state = await page.locator(folioSelector).evaluate((root) => {
			const runningAnimations = root
				.getAnimations({ subtree: true })
				.filter((animation) => {
					const timing = animation.effect?.getComputedTiming();
					return animation.playState === 'running' && Number(timing?.duration ?? 0) > 1;
				})
				.map((animation) => String(animation.effect?.getComputedTiming().duration));
			const hiddenMeaningful = Array.from(
				root.querySelectorAll<HTMLElement>(
					'[data-article-reading-region] h1, [data-article-reading-region] h2, [data-article-reading-region] p, [data-article-reading-region] li, [data-article-reading-region] figure'
				)
			)
				.filter((element) => !element.closest('[data-tts-exclude], .no-read'))
				.filter((element) => {
					const style = getComputedStyle(element);
					return (
						style.display === 'none' ||
						style.visibility === 'hidden' ||
						Number(style.opacity) < 0.99
					);
				})
				.map((element) => `${element.tagName.toLowerCase()}#${element.id}`);
			return {
				runningAnimations,
				hiddenMeaningful,
				htmlScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
				bodyScrollBehavior: getComputedStyle(document.body).scrollBehavior,
				rootScrollBehavior: getComputedStyle(root).scrollBehavior
			};
		});
		expect(state.runningAnimations).toEqual([]);
		expect(state.hiddenMeaningful).toEqual([]);
		expect(state.htmlScrollBehavior).not.toBe('smooth');
		expect(state.bodyScrollBehavior).not.toBe('smooth');
		expect(state.rootScrollBehavior).not.toBe('smooth');
	});

	test('forced colours removes paper effects and leaves links/rules/focus identifiable', async ({
		page
	}) => {
		await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
		await openArticle(page);
		const forcedColourAudit = await page.locator(folioSelector).evaluate((root) => {
			const effectOffenders: string[] = [];
			for (const element of [
				root,
				...Array.from(root.querySelectorAll('.thought-spread, .thought-leaf'))
			]) {
				for (const pseudo of [null, '::before', '::after'] as const) {
					const style = getComputedStyle(element, pseudo);
					if (style.backgroundImage !== 'none') {
						effectOffenders.push(
							`${(element as HTMLElement).id || element.className || element.tagName}${pseudo ?? ''}: ${style.backgroundImage}`
						);
					}
				}
			}
			const unidentifiedLinks = Array.from(root.querySelectorAll<HTMLElement>('a[href]'))
				.filter((link) => {
					const rect = link.getBoundingClientRect();
					const style = getComputedStyle(link);
					if (rect.width === 0 || rect.height === 0 || style.display === 'none') return false;
					const underlined = style.textDecorationLine.includes('underline');
					const ruled =
						style.borderBottomStyle !== 'none' && Number.parseFloat(style.borderBottomWidth) > 0;
					return !underlined && !ruled;
				})
				.map((link) => (link.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 80));
			return { effectOffenders, unidentifiedLinks };
		});
		expect(forcedColourAudit.effectOffenders).toEqual([]);
		expect(forcedColourAudit.unidentifiedLinks).toEqual([]);

		const copyLink = page.getByRole('button', { name: 'Copy link', exact: true });
		let reachedCopyLink = false;
		for (let index = 0; index < 40; index += 1) {
			await page.keyboard.press('Tab');
			if (await copyLink.evaluate((element) => element === document.activeElement)) {
				reachedCopyLink = true;
				break;
			}
		}
		expect(reachedCopyLink, 'Copy link is reachable in the real keyboard order').toBe(true);
		await expect(copyLink).toBeFocused();
		expect(await copyLink.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
		const focusStyle = await copyLink.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				outlineStyle: style.outlineStyle,
				outlineWidth: Number.parseFloat(style.outlineWidth),
				boxShadow: style.boxShadow
			};
		});
		expect(
			(focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth >= 1) ||
				focusStyle.boxShadow !== 'none'
		).toBe(true);
	});

	test('print media linearises leaves and emits inspectable A4 and US Letter PDFs', async ({
		page
	}, testInfo) => {
		test.setTimeout(180_000);
		await openArticle(page);
		await page.evaluate(() => {
			type PrintAuditWindow = Window & { __humanMarginPrintInvoked?: boolean };
			window.print = () => {
				(window as PrintAuditWindow).__humanMarginPrintInvoked = true;
			};
		});
		await page.getByRole('button', { name: 'Print', exact: true }).click();
		await expect
			.poll(() =>
				page.evaluate((expectedImageCount) => {
					type PrintAuditWindow = Window & { __humanMarginPrintInvoked?: boolean };
					const images = Array.from(
						document.querySelectorAll<HTMLImageElement>(
							'[data-thought-folio="healthcare-human-margin"] .thought-art img'
						)
					);
					return (
						(window as PrintAuditWindow).__humanMarginPrintInvoked === true &&
						images.length === expectedImageCount &&
						images.every((image) => image.complete && image.naturalWidth > 0)
					);
				}, bodyArt.length)
			)
			.toBe(true);
		await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
		const printAudit = await page.locator(folioSelector).evaluate((root) => {
			const visible = (element: Element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					style.display !== 'none' &&
					style.visibility !== 'hidden' &&
					rect.width > 0 &&
					rect.height > 0
				);
			};
			const spreadFailures = Array.from(
				root.querySelectorAll<HTMLElement>('.thought-spread')
			).flatMap((spread, index) => {
				const leaves = Array.from(
					spread.querySelectorAll<HTMLElement>(':scope > .thought-spread__leaves > .thought-leaf')
				);
				if (leaves.length !== 2) return [`spread ${index + 1} has ${leaves.length} leaves`];
				const left = leaves[0].getBoundingClientRect();
				const right = leaves[1].getBoundingClientRect();
				return right.top >= left.bottom - 1
					? []
					: [`${spread.id || `spread-${index + 1}`} remains paired in print`];
			});
			const bodyMetrics = Array.from(
				root.querySelectorAll<HTMLElement>(
					'[data-article-reading-region] p, [data-article-reading-region] li'
				)
			)
				.filter((element) => visible(element) && !element.closest('[data-tts-exclude]'))
				.map((element) => {
					const style = getComputedStyle(element);
					const fontSize = Number.parseFloat(style.fontSize);
					return { fontSize, leading: Number.parseFloat(style.lineHeight) / fontSize };
				});
			const visibleInteractive = Array.from(
				root.querySelectorAll<HTMLElement>('button, .article-actions, .reading-progress-bar')
			)
				.filter(visible)
				.map((element) => element.className || element.tagName);
			const darkOrTexturedLeaves = Array.from(root.querySelectorAll<HTMLElement>('.thought-leaf'))
				.filter((leaf) => {
					const style = getComputedStyle(leaf);
					const rgb = style.backgroundColor.match(/\d+(?:\.\d+)?/gu)?.map(Number) ?? [];
					const luminance = rgb.length >= 3 ? (rgb[0] + rgb[1] + rgb[2]) / (3 * 255) : 1;
					return style.backgroundImage !== 'none' || luminance < 0.82;
				})
				.map((leaf) => leaf.closest('.thought-spread')?.id || leaf.className);
			const hiddenCaptions = Array.from(root.querySelectorAll('figcaption'))
				.filter((caption) => !visible(caption))
				.map((caption) => caption.textContent?.trim());
			const forcedBodyPageBreaks = Array.from(
				root.querySelectorAll<HTMLElement>('.hm-reading > .thought-spread')
			)
				.filter((spread) => getComputedStyle(spread).breakAfter === 'page')
				.map((spread) => spread.id);
			const nonBlockReadingFlow = Array.from(
				root.querySelectorAll<HTMLElement>(
					'.hm-reading .thought-leaf, .hm-reading .thought-leaf__content'
				)
			)
				.filter((element) => getComputedStyle(element).display !== 'block')
				.map((element) => element.className);
			const coverBreakAfter = getComputedStyle(
				root.querySelector<HTMLElement>('.hm-cover') ?? root
			).breakAfter;
			const printRouteLink = root.querySelector<HTMLElement>('.hm-print-route a[href]');
			const printRouteAfterContent = printRouteLink
				? getComputedStyle(printRouteLink, '::after').content
				: 'missing';
			return {
				spreadFailures,
				bodyMetrics,
				visibleInteractive,
				darkOrTexturedLeaves,
				hiddenCaptions,
				forcedBodyPageBreaks,
				nonBlockReadingFlow,
				coverBreakAfter,
				printRouteAfterContent,
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});
		expect(printAudit.spreadFailures).toEqual([]);
		expect(printAudit.bodyMetrics.length).toBeGreaterThan(0);
		expect(
			printAudit.bodyMetrics.filter(({ fontSize }) => fontSize < 14 || fontSize > 16.5)
		).toEqual([]);
		expect(printAudit.bodyMetrics.filter(({ leading }) => leading < 1.44)).toEqual([]);
		expect(printAudit.visibleInteractive).toEqual([]);
		expect(printAudit.darkOrTexturedLeaves).toEqual([]);
		expect(printAudit.hiddenCaptions).toEqual([]);
		expect(printAudit.forcedBodyPageBreaks).toEqual([]);
		expect(printAudit.nonBlockReadingFlow).toEqual([]);
		expect(printAudit.coverBreakAfter).toBe('page');
		expect(['none', '""']).toContain(printAudit.printRouteAfterContent);
		expect(printAudit.documentOverflow).toBeLessThanOrEqual(1);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.locator(`${folioSelector} .hm-print-route`)).toContainText(articlePath);
		await expect(page.locator(`${folioSelector} .hm-print-route a`)).toHaveAttribute(
			'href',
			articlePath
		);
		await expect(page.locator(`${folioSelector} ${readingRegionSelector}`)).toContainText(
			'References:'
		);

		for (const format of ['A4', 'Letter'] as const) {
			const pdfPath = testInfo.outputPath(`human-margin-${format.toLowerCase()}.pdf`);
			const pdf = await page.pdf({
				path: pdfPath,
				format,
				printBackground: false,
				preferCSSPageSize: false,
				margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
			});
			expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
			expect(pdf.byteLength).toBeGreaterThan(20_000);
			await testInfo.attach(`Human Margin print — ${format}`, {
				path: pdfPath,
				contentType: 'application/pdf'
			});
		}
	});

	test('captures every spread at portrait and paired review sizes', async ({ page }, testInfo) => {
		test.setTimeout(300_000);
		for (const viewport of [
			{ label: 'portrait-390x844', width: 390, height: 844 },
			{ label: 'paired-1440x900', width: 1_440, height: 900 }
		]) {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openArticle(page);
			await page.addStyleTag({
				content: '.hm-skip-link, .reading-progress-bar { display: none !important; }'
			});
			const spreads = page.locator(`${folioSelector} .thought-spread`);
			const count = await spreads.count();
			expect(count).toBeGreaterThan(0);
			for (let index = 0; index < count; index += 1) {
				const spread = spreads.nth(index);
				await spread.scrollIntoViewIfNeeded();
				for (const image of await spread.locator('img').all()) {
					await expect
						.poll(() =>
							image.evaluate(
								(element: HTMLImageElement) => element.complete && element.naturalWidth > 0
							)
						)
						.toBe(true);
				}
				const rawId =
					(await spread.getAttribute('id')) || `spread-${String(index + 1).padStart(2, '0')}`;
				const id = rawId.replace(/[^a-z0-9_-]+/giu, '-');
				const name = `human-margin-${viewport.label}-${String(index + 1).padStart(2, '0')}-${id}`;
				const screenshotPath = testInfo.outputPath(`${name}.png`);
				await spread.screenshot({
					path: screenshotPath,
					animations: 'disabled',
					caret: 'hide'
				});
				await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
			}
		}
	});
});
