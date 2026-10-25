import { expect, test, type Download, type Locator, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MAX_CODE_POINTS, type PromptOntology } from '../src/lib/visualizations/prompt-atlas/types';

const articlePath = '/blog/visualizations/prompt-atlas';
const storageKey = 'suvro-prompt-atlas-session-v1';
const atlas = (page: Page): Locator => page.getByTestId('prompt-atlas');
const editor = (page: Page): Locator =>
	atlas(page).getByLabel('English prompt text', { exact: true });
const diagram = (page: Page): Locator => atlas(page).getByTestId('atlas-diagram');
const selector = (page: Page): Locator =>
	atlas(page).getByLabel('View this prompt as', { exact: true });
const pageErrors = new WeakMap<Page, string[]>();
const semanticProvider = 'Vercel AI Gateway / NVIDIA';
const semanticModel = 'nvidia/nemotron-3.5-lightning-free';
const semanticText = 'The moon invoices Tuesday. Tuesday disputes the moon.';
const unobscuredCapture = { style: '.site-header { visibility: hidden !important; }' };
const semanticConfig = {
	available: true,
	provider: semanticProvider,
	model: semanticModel,
	reason: null,
	freeOnly: true,
	maxCodePoints: MAX_CODE_POINTS,
	timeoutMs: 65_000
};
const aiRadio = (page: Page): Locator =>
	atlas(page).getByRole('radio', { name: /AI semantic analysis/ });
const aiConsent = (page: Page): Locator =>
	atlas(page).getByRole('checkbox', {
		name: 'Send this prompt to the displayed AI provider for this analysis',
		exact: true
	});

function semanticOntology(source = semanticText): PromptOntology {
	const firstMoon = source.indexOf('moon');
	const firstTuesday = source.indexOf('Tuesday');
	const secondSentence = source.indexOf('Tuesday disputes');
	const evidence = (start: number, end: number) => [
		{ start, end, quote: source.slice(start, end) }
	];
	return {
		schemaVersion: 1,
		source: { text: source, revision: 'semantic-fixture-1' },
		mode: 'semantic',
		analysisMetadata: { provider: semanticProvider, model: semanticModel },
		language: 'en',
		nodes: [
			{
				id: 'moon',
				label: 'moon',
				kind: 'concept',
				layer: 'subject',
				provenance: 'explicit',
				evidence: evidence(firstMoon, firstMoon + 4),
				attributes: []
			},
			{
				id: 'tuesday',
				label: 'Tuesday',
				kind: 'concept',
				layer: 'subject',
				provenance: 'explicit',
				evidence: evidence(firstTuesday, firstTuesday + 7),
				attributes: []
			}
		],
		relations: [
			{
				id: 'invoices',
				from: 'moon',
				to: 'tuesday',
				label: 'invoices',
				kind: 'association',
				provenance: 'explicit',
				evidence: evidence(0, secondSentence - 1)
			},
			{
				id: 'disputes',
				from: 'tuesday',
				to: 'moon',
				label: 'disputes',
				kind: 'association',
				provenance: 'explicit',
				evidence: evidence(secondSentence, source.length)
			}
		],
		issues: [
			{
				id: 'metaphor',
				kind: 'ambiguity',
				description: 'These subjects may be metaphorical; no billing database is implied.',
				evidence: evidence(0, source.length),
				alternatives: ['Keep the literal wording', 'Treat this as a creative metaphor']
			}
		]
	};
}

async function mockSemantic(
	page: Page,
	options: {
		config?: Record<string, unknown>;
		respond?: (route: Route) => Promise<void>;
	} = {}
): Promise<{ posts: unknown[] }> {
	const posts: unknown[] = [];
	await page.route('**/api/prompt-atlas', async (route) => {
		if (route.request().method() === 'GET') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(options.config ?? semanticConfig)
			});
			return;
		}
		posts.push(route.request().postDataJSON());
		if (options.respond) await options.respond(route);
		else
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ontology: semanticOntology() })
			});
	});
	return { posts };
}

async function requestSemantic(page: Page, text = semanticText): Promise<void> {
	await editor(page).fill(text);
	await aiRadio(page).check();
	await expect(atlas(page).getByTestId('semantic-options')).toContainText(semanticModel);
	await aiConsent(page).check();
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).click();
}

test.beforeEach(async ({ page, baseURL }) => {
	const origin = new URL(baseURL!).origin;
	const failures: string[] = [];
	pageErrors.set(page, failures);
	page.on('pageerror', (error) => failures.push(error.message));
	// Keep these checks local and prevent optional media/measurement requests.
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
	// Browser tests never contact an actual semantic provider or spend credits.
	await page.route('**/api/prompt-atlas', (route) =>
		route.fulfill({
			status: route.request().method() === 'GET' ? 200 : 503,
			contentType: 'application/json',
			body: JSON.stringify(
				route.request().method() === 'GET'
					? {
							...semanticConfig,
							available: false,
							reason: 'AI is unavailable in this local test. Local analysis is ready.'
						}
					: { error: 'Unexpected unmocked semantic analysis request.', code: 'test_blocked' }
			)
		})
	);
});

test.afterEach(async ({ page }) => {
	expect(pageErrors.get(page) ?? []).toEqual([]);
});

async function ready(page: Page): Promise<void> {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(atlas(page)).toBeVisible();
	await page
		.getByRole('button', {
			name: 'Dismiss privacy notice without choosing',
			exact: true
		})
		.click();
	await expect(editor(page)).toBeVisible();
}

async function analyze(page: Page, text: string): Promise<void> {
	await editor(page).fill(text);
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).click();
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).locator('.atlas-notice')).toContainText('Analysis ready');
	await expect(atlas(page).getByRole('alert')).toHaveCount(0);
}

async function specimen(page: Page, label: string): Promise<void> {
	await atlas(page).getByRole('button', { name: label, exact: true }).click();
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).locator('.atlas-notice')).toContainText('Analysis ready');
}

async function choose(page: Page, model: string): Promise<void> {
	await selector(page).selectOption(model);
	await expect(diagram(page)).toHaveAttribute('data-model', model);
	await expect(diagram(page).locator('.ontology-node').first()).toBeVisible();
}

async function downloadText(download: Download): Promise<string> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not provide the exported file.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks).toString('utf8');
}

async function exportText(page: Page, button: RegExp): Promise<string> {
	const download = page.waitForEvent('download');
	await atlas(page).getByRole('button', { name: button }).click();
	return downloadText(await download);
}

async function expectNoOverflow(page: Page): Promise<void> {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
		.toBe(true);
	const box = await atlas(page).evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			left: bounds.left,
			right: bounds.right,
			viewport: innerWidth,
			overflow: element.scrollWidth - element.clientWidth
		};
	});
	expect(box.left).toBeGreaterThanOrEqual(-1);
	expect(box.right).toBeLessThanOrEqual(box.viewport + 1);
	expect(box.overflow).toBeLessThanOrEqual(1);
}

async function deferGraphDigest(page: Page): Promise<void> {
	await page.evaluate(() => {
		const state = { started: 0, completed: 0, releases: [] as (() => void)[] };
		(window as unknown as { __atlasDigest: typeof state }).__atlasDigest = state;
		const original = crypto.subtle.digest.bind(crypto.subtle);
		crypto.subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
			state.started += 1;
			await new Promise<void>((resolve) => state.releases.push(resolve));
			const value = await original(...args);
			state.completed += 1;
			return value;
		};
	});
}

async function releaseGraphDigest(page: Page): Promise<void> {
	await page.evaluate(() => {
		const state = (window as unknown as { __atlasDigest: { releases: (() => void)[] } })
			.__atlasDigest;
		state.releases.forEach((release) => release());
	});
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(
						window as unknown as {
							__atlasDigest: { completed: number };
						}
					).__atlasDigest.completed
			)
		)
		.toBe(1);
}

test('counts exact editor text, Unicode graphemes and limits before analysis', async ({ page }) => {
	await ready(page);
	await expect(atlas(page).getByTestId('character-count')).toHaveText('0');
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	await expect(diagram(page)).toHaveCount(0);
	await editor(page).fill('Hello world!');
	await expect(atlas(page).getByTestId('character-count')).toHaveText('12');
	await editor(page).fill('e\u0301👨‍👩‍👧‍👦\nA');
	await expect(atlas(page).getByTestId('character-count')).toHaveText('4');
	await atlas(page).locator('summary').filter({ hasText: 'More text statistics' }).click();
	const stats = atlas(page).locator('.atlas-stats');
	await expect(
		stats
			.locator('div')
			.filter({ has: page.locator('dt', { hasText: /^Unicode code points$/ }) })
			.locator('dd')
	).toHaveText('11');
	await expect(
		stats
			.locator('div')
			.filter({ has: page.locator('dt', { hasText: /^UTF-16 units$/ }) })
			.locator('dd')
	).toHaveText('15');
	await editor(page).fill('A'.repeat(20_001));
	await expect(atlas(page).getByTestId('character-count')).toHaveText('20,001');
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeEnabled();
	await editor(page).fill('A'.repeat(MAX_CODE_POINTS + 1));
	await expect(atlas(page).getByTestId('character-count')).toHaveText(
		(MAX_CODE_POINTS + 1).toLocaleString('en-GB')
	);
	await expect(atlas(page)).toContainText('Analysis limit reached');
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
});

test('analyzes in a worker without sending prompt content over HTTP and gives an actual mind map', async ({
	page
}) => {
	await ready(page);
	const secret = 'atlas-private-fixture-3924';
	const transmitted: string[] = [];
	page.on('request', (request) => {
		if ((request.url() + (request.postData() ?? '')).includes(secret))
			transmitted.push(request.url());
	});
	await analyze(
		page,
		`Write a kind bedtime story about a robot gardener. Use a warm tone. Include ${secret}.`
	);
	await expect(diagram(page).locator('[data-atlas-select^="group:"]').first()).toBeVisible();
	await expect(atlas(page).locator('.atlas-scroll-list')).toContainText('robot gardener');
	await expect(atlas(page)).toContainText('AI semantic analysis is optional');
	await choose(page, 'concept');
	await choose(page, 'mindmap');
	expect(transmitted).toEqual([]);
	expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
	await expect(selector(page).locator('option[value="physical"]')).toBeDisabled();
});

for (const fixture of [
	{ example: 'An order workflow', models: ['flowchart'] },
	{ example: 'A publishing lifecycle', models: ['state'] },
	{ example: 'A domain model', models: ['conceptual-er', 'logical', 'class'] },
	{ example: 'A physical schema', models: ['physical'] },
	{ example: 'An exchange', models: ['sequence'] },
	{ example: 'A system and its users', models: ['usecase'] }
]) {
	test(`renders supported models for ${fixture.example}`, async ({ page }) => {
		await ready(page);
		await specimen(page, fixture.example);
		const original = await editor(page).inputValue();
		for (const model of fixture.models) {
			await choose(page, model);
			await expect(editor(page)).toHaveValue(original);
		}
		if (fixture.models.includes('sequence')) {
			await expect(diagram(page).locator('.lifeline')).toHaveCount(3);
			await expect(diagram(page).locator('.relation')).toHaveCount(4);
		}
		if (fixture.models.includes('physical')) {
			await expect(diagram(page)).toContainText('UUID');
			await expect(diagram(page)).toContainText('email');
		}
		if (fixture.models.includes('usecase')) {
			await expect(diagram(page).locator('.system-boundary')).toHaveCount(1);
		}
		await choose(page, 'mindmap');
	});
}

test('follows source evidence and retains a correction across model changes', async ({ page }) => {
	await ready(page);
	await specimen(page, 'A creative brief');
	await atlas(page).screenshot({ path: '.codex-artifacts/prompt-atlas-desktop-full.png' });
	await atlas(page).evaluate((element) =>
		window.scrollTo(0, Math.max(0, element.getBoundingClientRect().top + scrollY - 90))
	);
	await page.screenshot({ path: '.codex-artifacts/prompt-atlas-desktop.png' });
	const firstItem = atlas(page).locator('.atlas-scroll-list button').first();
	await firstItem.click();
	const detail = atlas(page).locator('.atlas-detail');
	await expect(detail.locator('mark').first()).toBeVisible();
	const selectedText = await editor(page).evaluate((element: HTMLTextAreaElement) =>
		element.value.slice(element.selectionStart, element.selectionEnd)
	);
	expect(selectedText.length).toBeGreaterThan(0);
	await detail.getByLabel('Label', { exact: true }).fill('Reviewed library intent');
	await detail.getByLabel('Label', { exact: true }).press('Tab');
	await expect(detail.locator('.atlas-provenance').first()).toHaveText('Confirmed by you');
	await choose(page, 'concept');
	await choose(page, 'mindmap');
	await expect(detail.getByLabel('Label', { exact: true })).toHaveValue('Reviewed library intent');
	await expect(atlas(page).locator('.atlas-scroll-list')).toContainText('Reviewed library intent');
	const report = JSON.parse(await exportText(page, /Export JSON report/));
	expect(
		report.nodes.some(
			(node: { label: string; provenance: string }) =>
				node.label === 'Reviewed library intent' && node.provenance === 'user-confirmed'
		)
	).toBe(true);
});

test('flags contradictions and freezes corrections and exports when the prompt changes', async ({
	page
}) => {
	await ready(page);
	await specimen(page, 'An uncertain brief');
	await expect(atlas(page).locator('.atlas-issues')).toContainText('contradiction');
	await expect(atlas(page).locator('.atlas-issues')).toContainText('100');
	await expect(atlas(page).locator('.atlas-issues')).toContainText('50');
	await expect(atlas(page).locator('.atlas-issues')).toContainText('ambigui');
	await editor(page).fill('This is a revised prompt.');
	await expect(atlas(page)).toContainText('Your prompt has changed.');
	await expect(selector(page)).toBeDisabled();
	for (const label of [
		/Export SVG/,
		/Export Markdown/,
		/Export JSON report/,
		/Export graph JSON-LD/,
		/Save session on this device/
	]) {
		await expect(atlas(page).getByRole('button', { name: label })).toBeDisabled();
	}
	await expect(atlas(page).getByLabel('New item', { exact: true })).toBeDisabled();
	await analyze(page, 'This is a revised prompt.');
	await expect(atlas(page).getByRole('button', { name: /Export SVG/ })).toBeEnabled();
});

test('starts a new interpretation with clear search and correction fields', async ({ page }) => {
	await ready(page);
	await specimen(page, 'A creative brief');
	await atlas(page).getByLabel('Search items', { exact: true }).fill('missing-old-search');
	await expect(atlas(page).locator('.atlas-scroll-list')).toContainText('No matching items');
	const supply = atlas(page).locator('.atlas-add-detail');
	await supply.getByLabel('New item', { exact: true }).fill('Unsaved old detail');
	await supply.getByRole('combobox', { name: 'Item type', exact: true }).selectOption('action');
	await supply.locator('summary').filter({ hasText: 'Connect two items' }).click();
	await supply.getByRole('combobox', { name: 'From', exact: true }).selectOption({ index: 1 });
	await supply.getByRole('combobox', { name: 'To', exact: true }).selectOption({ index: 1 });
	await supply.getByLabel('Relationship', { exact: true }).fill('old relationship');
	await supply.getByRole('combobox', { name: 'Type', exact: true }).selectOption('message');
	await analyze(page, 'Users can own many projects; each project has one owner.');
	await expect(atlas(page).getByLabel('Search items', { exact: true })).toHaveValue('');
	await expect(atlas(page).locator('.atlas-scroll-list')).not.toContainText('No matching items');
	await expect(supply.getByLabel('New item', { exact: true })).toHaveValue('');
	await expect(supply.getByRole('combobox', { name: 'Item type', exact: true })).toHaveValue(
		'concept'
	);
	const connectionSummary = supply.locator('summary').filter({ hasText: 'Connect two items' });
	if ((await connectionSummary.locator('..').getAttribute('open')) === null)
		await connectionSummary.click();
	await expect(supply.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('');
	await expect(supply.getByRole('combobox', { name: 'To', exact: true })).toHaveValue('');
	await expect(supply.getByLabel('Relationship', { exact: true })).toHaveValue('relates to');
	await expect(supply.getByRole('combobox', { name: 'Type', exact: true })).toHaveValue(
		'association'
	);
});

test('records confirmed attribute edits and can remove a user-added attribute', async ({
	page
}) => {
	await ready(page);
	await specimen(page, 'A physical schema');
	await atlas(page)
		.locator('.atlas-scroll-list button')
		.filter({
			has: page.locator('strong', { hasText: /^projects$/i })
		})
		.click();
	const detail = atlas(page).locator('.atlas-detail');
	const attributes = detail.locator('.atlas-attribute');
	const before = await attributes.count();
	await detail.getByRole('button', { name: 'Add attribute', exact: true }).click();
	await expect(attributes).toHaveCount(before + 1);
	const added = attributes.last();
	await added.getByLabel('Name', { exact: true }).fill('owner_hint');
	await added.getByLabel('Name', { exact: true }).press('Tab');
	await added.getByLabel('Data type', { exact: true }).fill('UUID');
	await added.getByLabel('Data type', { exact: true }).press('Tab');
	await added.getByLabel('Foreign key reference', { exact: true }).fill('users.id');
	await added.getByLabel('Foreign key reference', { exact: true }).press('Tab');
	await expect(added.locator('.atlas-provenance')).toHaveText('Confirmed by you');
	await choose(page, 'physical');
	const report = JSON.parse(await exportText(page, /Export JSON report/));
	const changedAttribute = report.nodes
		.flatMap((node: { attributes: Record<string, unknown>[] }) => node.attributes)
		.find((attribute: Record<string, unknown>) => attribute.name === 'owner_hint');
	expect(changedAttribute).toMatchObject({
		dataType: 'UUID',
		foreignKey: 'users.id',
		provenance: 'user-confirmed'
	});
	await added.getByRole('button', { name: 'Remove attribute', exact: true }).click();
	await expect(attributes).toHaveCount(before);
	expect(
		await detail
			.getByLabel('Name', { exact: true })
			.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
	).not.toContain('owner_hint');
});

test('saves only on request, restores corrections and deletes the saved session', async ({
	page
}) => {
	await ready(page);
	await specimen(page, 'A domain model');
	await atlas(page).locator('.atlas-scroll-list button').first().click();
	await atlas(page)
		.locator('.atlas-detail')
		.getByLabel('Label', { exact: true })
		.fill('Confirmed project owner');
	await atlas(page).locator('.atlas-detail').getByLabel('Label', { exact: true }).press('Tab');
	await choose(page, 'conceptual-er');
	const original = await editor(page).inputValue();
	expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
	await atlas(page)
		.getByRole('button', { name: 'Save session on this device', exact: true })
		.click();
	const saved = await page.evaluate((key) => localStorage.getItem(key), storageKey);
	expect(saved).not.toBeNull();
	expect(JSON.parse(saved!).ontology.source.text).toBe(original);
	await atlas(page).getByRole('button', { name: 'Clear', exact: true }).click();
	await expect(editor(page)).toHaveValue('');
	await atlas(page).getByRole('button', { name: 'Restore saved', exact: true }).click();
	await expect(editor(page)).toHaveValue(original);
	await expect(diagram(page)).toHaveAttribute('data-model', 'conceptual-er');
	await expect(atlas(page).locator('.atlas-scroll-list')).toContainText('Confirmed project owner');
	await atlas(page)
		.getByRole('button', { name: 'Forget saved session', exact: true })
		.first()
		.click();
	expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
	await expect(atlas(page).getByRole('button', { name: 'Restore saved', exact: true })).toHaveCount(
		0
	);
});

test('exports safe SVG and source-optional JSON, and validates imported reports and sessions', async ({
	page
}) => {
	await ready(page);
	await analyze(
		page,
		'Write a story about <script>window.__atlasPwned=1</script>. Use plain text.'
	);
	const sourceText = await editor(page).inputValue();
	const svg = await exportText(page, /Export SVG/);
	expect(svg).toContain('<svg');
	expect(svg).not.toMatch(/<script[\s>]|<foreignObject[\s>]/i);
	const svgState = await page.evaluate((value) => {
		const doc = new DOMParser().parseFromString(value, 'image/svg+xml');
		return {
			parseErrors: doc.querySelectorAll('parsererror').length,
			scripts: doc.querySelectorAll('script, foreignObject').length,
			externalLinks: Array.from(doc.querySelectorAll('[href], [src]')).filter((element) =>
				/^(?:https?:|javascript:|data:)/i.test(
					element.getAttribute('href') ?? element.getAttribute('src') ?? ''
				)
			).length,
			executed: Boolean((window as unknown as Record<string, unknown>).__atlasPwned)
		};
	}, svg);
	expect(svgState).toEqual({ parseErrors: 0, scripts: 0, externalLinks: 0, executed: false });
	const reportText = await exportText(page, /Export JSON report/);
	const report = JSON.parse(reportText);
	expect(report.format).toBe('prompt-atlas-report');
	expect(report.sourceIncluded).toBe(false);
	expect(report).not.toHaveProperty('ontology');
	expect(report.nodes.every((node: { evidence: unknown[] }) => node.evidence.length === 0)).toBe(
		true
	);
	const input = atlas(page).getByLabel('Import Prompt Atlas session', { exact: true });
	await input.setInputFiles({
		name: 'report.json',
		mimeType: 'application/json',
		buffer: Buffer.from(reportText)
	});
	await expect(atlas(page).getByRole('alert')).toContainText(
		'report without source text cannot be restored'
	);
	await expect(editor(page)).toHaveValue(sourceText);
	await input.setInputFiles({
		name: 'broken.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{broken')
	});
	await expect(atlas(page).getByRole('alert')).toBeVisible();
	await expect(editor(page)).toHaveValue(sourceText);
	await atlas(page)
		.getByRole('checkbox', {
			name: 'Include original prompt and evidence in JSON exports',
			exact: true
		})
		.check();
	const sessionText = await exportText(page, /Export JSON session/);
	const session = JSON.parse(sessionText);
	expect(session.format).toBe('prompt-atlas-session');
	expect(session.ontology.source.text).toBe(sourceText);
	await atlas(page).getByRole('button', { name: 'Clear', exact: true }).click();
	await input.setInputFiles({
		name: 'session.json',
		mimeType: 'application/json',
		buffer: Buffer.from(sessionText)
	});
	await expect(editor(page)).toHaveValue(sourceText);
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).getByRole('alert')).toHaveCount(0);
});

test('both Viz and Apps expose the same canonical application and sitemap has one article entry', async ({
	page,
	request
}) => {
	for (const collection of ['/blog/apps', '/blog/visualizations']) {
		await page.goto(collection, { waitUntil: 'domcontentloaded' });
		const links = page.locator(`a[href="${articlePath}"]`);
		await expect(links.first()).toBeVisible();
		expect(await links.count()).toBeGreaterThan(0);
	}
	await page.goto('/blog/apps', { waitUntil: 'domcontentloaded' });
	await page.getByRole('link', { name: /^Open app/ }).click();
	await expect(page).toHaveURL(new RegExp(`${articlePath}$`));
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		`https://www.suvroghosh.in${articlePath}`
	);
	const sitemap = await request.get('/sitemap.xml');
	expect(sitemap.ok()).toBe(true);
	const xml = await sitemap.text();
	expect(xml.split(`<loc>https://www.suvroghosh.in${articlePath}</loc>`).length - 1).toBe(1);
	expect(xml).toContain('<loc>https://www.suvroghosh.in/blog/apps</loc>');
	expect(xml).not.toContain('/blog/apps/prompt-atlas');
});

test('supports keyboard analysis, diagram controls and a narrow mobile workflow without overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await ready(page);
	await expectNoOverflow(page);
	await editor(page).fill('Write a kind bedtime story about a robot gardener.');
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expectNoOverflow(page);
	const svg = diagram(page).getByRole('application');
	await svg.focus();
	await page.keyboard.press('+');
	await expect(diagram(page).getByRole('status', { name: 'Zoom level' })).toHaveText('120%');
	await page.keyboard.press('0');
	await expect(diagram(page).getByRole('status', { name: 'Zoom level' })).toHaveText('100%');
	const branch = diagram(page)
		.getByRole('button', { name: /Activate to collapse or expand this branch/ })
		.first();
	const before = await diagram(page).locator('.ontology-node').count();
	await branch.focus();
	await page.keyboard.press('Enter');
	await expect.poll(() => diagram(page).locator('.ontology-node').count()).toBeLessThan(before);
	await expectNoOverflow(page);
	await choose(page, 'concept');
	await expectNoOverflow(page);
	await atlas(page).screenshot({ path: '.codex-artifacts/prompt-atlas-mobile-full.png' });
	await atlas(page).evaluate((element) =>
		window.scrollTo(0, Math.max(0, element.getBoundingClientRect().top + scrollY - 80))
	);
	await page.screenshot({ path: '.codex-artifacts/prompt-atlas-mobile.png' });
	const accessibility = await new AxeBuilder({ page })
		.include('[data-testid="prompt-atlas"]')
		.analyze();
	expect(
		accessibility.violations.filter((violation) =>
			['critical', 'serious'].includes(violation.impact ?? '')
		)
	).toEqual([]);
});

test('AI requires fresh consent and an explicit request; semantic views and exports reuse the result', async ({
	page
}) => {
	const { posts } = await mockSemantic(page);
	await ready(page);
	await expect(atlas(page).getByRole('radio', { name: /Local analysis/ })).toBeChecked();
	await editor(page).fill(semanticText);
	await aiRadio(page).check();
	await expect(atlas(page).getByTestId('semantic-options')).toContainText(
		'NVIDIA may retain prompts and responses for model improvement'
	);
	await expect(atlas(page).getByTestId('semantic-options')).toContainText(semanticModel);
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	expect(posts).toEqual([]);
	await aiConsent(page).check();
	await editor(page).fill(semanticText + ' ');
	await expect(aiConsent(page)).not.toBeChecked();
	await editor(page).fill(semanticText);
	expect(posts).toEqual([]);
	await aiConsent(page).check();
	await atlas(page)
		.getByTestId('semantic-options')
		.screenshot({
			path: '.codex-artifacts/prompt-atlas-ai-consent-desktop.png',
			...unobscuredCapture
		});
	await page.setViewportSize({ width: 360, height: 800 });
	await expectNoOverflow(page);
	await atlas(page)
		.getByTestId('semantic-options')
		.screenshot({
			path: '.codex-artifacts/prompt-atlas-ai-consent-mobile.png',
			...unobscuredCapture
		});
	await page.setViewportSize({ width: 1440, height: 1000 });
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).click();
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('AI · semantic');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText(semanticModel);
	expect(posts).toEqual([{ text: semanticText, consent: true }]);
	await expect(aiConsent(page)).not.toBeChecked();
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	await choose(page, 'concept');
	await expect(diagram(page).locator('.relation')).toHaveCount(2);
	await choose(page, 'conceptual-er');
	await choose(page, 'knowledge-graph');
	const relationLabels = diagram(page).locator('.edge-label');
	const firstLabel = await relationLabels.nth(0).boundingBox();
	const secondLabel = await relationLabels.nth(1).boundingBox();
	expect(firstLabel).not.toBeNull();
	expect(secondLabel).not.toBeNull();
	expect(
		Math.abs(firstLabel!.x - secondLabel!.x) + Math.abs(firstLabel!.y - secondLabel!.y)
	).toBeGreaterThan(20);
	await diagram(page).screenshot({
		path: '.codex-artifacts/prompt-atlas-ai-knowledge-graph-desktop.png',
		...unobscuredCapture
	});
	await choose(page, 'mindmap');
	expect(posts).toHaveLength(1);
	const report = JSON.parse(await exportText(page, /Export JSON report/));
	expect(report.analysisMode).toBe('semantic');
	expect(report.analysisMetadata).toEqual({ provider: semanticProvider, model: semanticModel });
	await atlas(page)
		.getByRole('checkbox', {
			name: 'Include original prompt and evidence in JSON exports',
			exact: true
		})
		.check();
	const sessionText = await exportText(page, /Export JSON session/);
	await atlas(page).getByRole('button', { name: 'Clear', exact: true }).click();
	await atlas(page)
		.getByLabel('Import Prompt Atlas session', { exact: true })
		.setInputFiles({
			name: 'semantic-session.json',
			mimeType: 'application/json',
			buffer: Buffer.from(sessionText)
		});
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('AI · semantic');
	await expect(editor(page)).toHaveValue(semanticText);
	await expect(aiConsent(page)).not.toBeChecked();
	expect(posts).toHaveLength(1);
});

test('loading examples in AI mode never sends a previously approved prompt', async ({ page }) => {
	const { posts } = await mockSemantic(page);
	await ready(page);
	await editor(page).fill(semanticText);
	await aiRadio(page).check();
	await aiConsent(page).check();
	await atlas(page).getByRole('button', { name: 'A creative brief', exact: true }).click();
	await expect(editor(page)).toHaveValue(/robot gardener/);
	await expect(atlas(page).locator('.atlas-notice')).toContainText('Example loaded');
	await expect(aiConsent(page)).not.toBeChecked();
	await expect(diagram(page)).toHaveCount(0);
	expect(posts).toEqual([]);
});

test('a six-second availability probe enables AI while local analysis remains usable', async ({
	page
}) => {
	let releaseConfig = () => {};
	let markConfigStarted = () => {};
	const configGate = new Promise<void>((resolve) => {
		releaseConfig = resolve;
	});
	const configStarted = new Promise<void>((resolve) => {
		markConfigStarted = resolve;
	});
	let posts = 0;
	await page.route('**/api/prompt-atlas', async (route) => {
		if (route.request().method() === 'GET') {
			markConfigStarted();
			await configGate;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(semanticConfig)
			});
		} else {
			posts += 1;
			await route.abort('blockedbyclient');
		}
	});
	await page.clock.install();
	await ready(page);
	await configStarted;
	await analyze(page, 'Write a kind story about a robot gardener.');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('Local · rules-based');
	await aiRadio(page).check();
	const options = atlas(page).getByTestId('semantic-options');
	await expect(options.locator('.atlas-ai-availability')).toContainText('Checking AI availability');
	await expect(aiConsent(page)).toBeDisabled();
	await page.clock.fastForward(6000);
	releaseConfig();
	await expect(options.locator('.atlas-ai-availability')).toContainText(
		'AI is available within the configured free-credit limits.'
	);
	await expect(options).toContainText(semanticProvider);
	await expect(options).toContainText(semanticModel);
	await expect(options).toContainText(
		'NVIDIA may retain prompts and responses for model improvement'
	);
	await expect(aiConsent(page)).toBeEnabled();
	await expect(aiConsent(page)).not.toBeChecked();
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('Local · rules-based');
	expect(posts).toBe(0);
});

test('an availability probe times out after twelve seconds without enabling AI or blocking local analysis', async ({
	page
}) => {
	await ready(page);
	await editor(page).fill(semanticText);
	await aiRadio(page).check();
	let releaseConfig = () => {};
	let markConfigStarted = () => {};
	const configGate = new Promise<void>((resolve) => {
		releaseConfig = resolve;
	});
	const configStarted = new Promise<void>((resolve) => {
		markConfigStarted = resolve;
	});
	let posts = 0;
	await page.route('**/api/prompt-atlas', async (route) => {
		if (route.request().method() === 'GET') {
			markConfigStarted();
			await configGate;
			await route
				.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(semanticConfig)
				})
				.catch(() => {});
		} else {
			posts += 1;
			await route.abort('blockedbyclient');
		}
	});
	const clockStart = new Date('2026-10-25T12:00:00Z');
	await page.clock.install({ time: clockStart });
	await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
	await atlas(page).getByRole('button', { name: 'Check AI availability', exact: true }).click();
	await configStarted;
	const availability = atlas(page)
		.getByTestId('semantic-options')
		.locator('.atlas-ai-availability');
	await page.clock.fastForward(11_999);
	await expect(availability).toContainText('Checking AI availability');
	await page.clock.fastForward(1);
	await expect(availability).toContainText(
		'AI availability did not respond in time. Local analysis is ready to use.'
	);
	releaseConfig();
	await expect(aiConsent(page)).toBeDisabled();
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	await page.clock.resume();
	await atlas(page).getByRole('button', { name: 'Analyze locally instead', exact: true }).click();
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('Local · rules-based');
	expect(posts).toBe(0);
});

test('unavailable or unverified free-only AI stays blocked and local fallback is explicit', async ({
	page
}) => {
	const { posts } = await mockSemantic(page, {
		config: {
			...semanticConfig,
			available: false,
			reason: 'Free model or credits are unavailable.'
		}
	});
	await ready(page);
	await editor(page).fill('Write a story about a robot gardener.');
	await aiRadio(page).check();
	await expect(atlas(page).getByTestId('semantic-options')).toContainText(
		'Free model or credits are unavailable.'
	);
	await expect(aiConsent(page)).toBeDisabled();
	await expect(
		atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true })
	).toBeDisabled();
	await expect(diagram(page)).toHaveCount(0);
	expect(posts).toEqual([]);
	await atlas(page).getByRole('button', { name: 'Analyze locally instead', exact: true }).click();
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('Local · rules-based');
	expect(posts).toEqual([]);
});

test('a configuration that allows paid fallback cannot enable AI', async ({ page }) => {
	const { posts } = await mockSemantic(page, { config: { ...semanticConfig, freeOnly: false } });
	await ready(page);
	await editor(page).fill(semanticText);
	await aiRadio(page).check();
	await expect(atlas(page).getByTestId('semantic-options')).toContainText(
		'did not confirm the free-credits-only configuration'
	);
	await expect(aiConsent(page)).toBeDisabled();
	expect(posts).toEqual([]);
});

for (const failure of [
	{
		name: 'quota',
		status: 429,
		error: 'The free-credit request allowance has been reached.',
		code: 'quota_exhausted',
		retryAfterSeconds: 60
	},
	{
		name: 'provider unavailable',
		status: 503,
		error: 'The approved free model is unavailable. No paid fallback was used.',
		code: 'provider_unavailable'
	}
]) {
	test(`AI ${failure.name} stops without automatic local or provider fallback`, async ({
		page
	}) => {
		const { posts } = await mockSemantic(page, {
			respond: (route) =>
				route.fulfill({
					status: failure.status,
					contentType: 'application/json',
					body: JSON.stringify(failure)
				})
		});
		await ready(page);
		await requestSemantic(page);
		await expect(atlas(page).getByRole('alert')).toContainText(failure.error);
		await expect(diagram(page)).toHaveCount(0);
		await expect(aiRadio(page)).toBeChecked();
		await expect(aiConsent(page)).not.toBeChecked();
		expect(posts).toHaveLength(1);
		await atlas(page).getByRole('button', { name: 'Analyze locally instead', exact: true }).click();
		await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
		await expect(atlas(page).getByTestId('analysis-provenance')).toContainText(
			'Local · rules-based'
		);
		expect(posts).toHaveLength(1);
	});
}

test('AI cancellation and input edits discard delayed responses and require new consent', async ({
	page
}) => {
	const releases: (() => void)[] = [];
	const finished: Promise<void>[] = [];
	const { posts } = await mockSemantic(page, {
		respond: async (route) => {
			let finish!: () => void;
			finished.push(
				new Promise<void>((resolve) => {
					finish = resolve;
				})
			);
			await new Promise<void>((resolve) => releases.push(resolve));
			await route
				.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ontology: semanticOntology() })
				})
				.catch(() => {});
			finish();
		}
	});
	await ready(page);
	await requestSemantic(page);
	await expect.poll(() => posts.length).toBe(1);
	await atlas(page).getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(aiConsent(page)).not.toBeChecked();
	releases[0]();
	await finished[0];
	await expect(diagram(page)).toHaveCount(0);
	await expect(atlas(page).locator('.atlas-notice')).toContainText('Analysis cancelled');
	await aiConsent(page).check();
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).click();
	await expect.poll(() => posts.length).toBe(2);
	await editor(page).fill('A different prompt now.');
	releases[1]();
	await finished[1];
	await expect(editor(page)).toHaveValue('A different prompt now.');
	await expect(aiConsent(page)).not.toBeChecked();
	await expect(diagram(page)).toHaveCount(0);
});

test('AI enforces its deadline and ignores a result that arrives afterwards', async ({ page }) => {
	let release!: () => void;
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const { posts } = await mockSemantic(page, {
		respond: async (route) => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			await route
				.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ontology: semanticOntology() })
				})
				.catch(() => {});
			finish();
		}
	});
	await ready(page);
	await page.clock.install();
	await requestSemantic(page);
	await expect.poll(() => posts.length).toBe(1);
	await page.clock.fastForward(65_001);
	await expect(atlas(page).getByRole('alert')).toContainText('65-second deadline');
	await expect(aiConsent(page)).not.toBeChecked();
	release();
	await finished;
	await expect(diagram(page)).toHaveCount(0);
	await expect(aiRadio(page)).toBeChecked();
	expect(posts).toHaveLength(1);
});

for (const mismatch of ['model', 'source', 'mode'] as const) {
	test(`AI rejects a mismatched ${mismatch} without applying it`, async ({ page }) => {
		const changed = semanticOntology();
		if (mismatch === 'model')
			changed.analysisMetadata = { provider: semanticProvider, model: 'unapproved-model' };
		if (mismatch === 'source') changed.source.text += ' Extra text.';
		if (mismatch === 'mode') changed.mode = 'local';
		const { posts } = await mockSemantic(page, {
			respond: (route) =>
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ontology: changed })
				})
		});
		await ready(page);
		await requestSemantic(page);
		await expect(atlas(page).getByRole('alert')).toContainText(
			mismatch === 'model'
				? 'changed from the one you approved'
				: 'did not match this prompt and analysis mode'
		);
		await expect(diagram(page)).toHaveCount(0);
		expect(posts).toHaveLength(1);
	});
}

test('knowledge graph retains all ontology items and exports source-optional JSON-LD', async ({
	page
}) => {
	await ready(page);
	await specimen(page, 'A creative brief');
	const count = await atlas(page).locator('.atlas-scroll-list button').count();
	await choose(page, 'knowledge-graph');
	await expect(diagram(page).locator('.ontology-node')).toHaveCount(count);
	await diagram(page).screenshot({
		path: '.codex-artifacts/prompt-atlas-knowledge-graph-desktop.png',
		...unobscuredCapture
	});
	await page.setViewportSize({ width: 360, height: 800 });
	await expectNoOverflow(page);
	await diagram(page).screenshot({
		path: '.codex-artifacts/prompt-atlas-knowledge-graph-mobile.png',
		...unobscuredCapture
	});
	await page.setViewportSize({ width: 1440, height: 1000 });
	const text = await exportText(page, /Export graph JSON-LD/);
	const graph = JSON.parse(text);
	expect(graph['@context'].schema).toBe('https://schema.org/');
	const records: Record<string, unknown>[] = graph['@graph'];
	expect(records[0].sourceIncluded).toBe(false);
	expect(records[0]).not.toHaveProperty('sourceText');
	expect(records.filter((record) => record['@type'] === 'schema:Thing')).toHaveLength(count);
	for (const record of records) {
		expect(record).not.toHaveProperty('evidence');
	}
	expect(records.some((record) => record.provenance === 'explicit')).toBe(true);
	await atlas(page)
		.getByRole('checkbox', {
			name: 'Include original prompt and evidence in JSON exports',
			exact: true
		})
		.check();
	const full = JSON.parse(await exportText(page, /Export graph JSON-LD/));
	expect(full['@graph'][0].sourceText).toBe(await editor(page).inputValue());
	expect(
		full['@graph'].some((record: Record<string, unknown>) => record.provenance === 'explicit')
	).toBe(true);
});

test('long semantic prompts preserve the full source and show compressed-reading coverage', async ({
	page
}) => {
	const text = semanticText + '\n' + 'Keep the supplied source available.\n'.repeat(1500);
	const ontology = semanticOntology(text);
	const original = Array.from(text).length;
	ontology.compression = {
		originalCodePoints: original,
		analysedCodePoints: 2000,
		omittedCodePoints: original - 2000,
		duplicateCodePoints: 0,
		fragmentCount: 2,
		applied: true
	};
	const { posts } = await mockSemantic(page, {
		respond: (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ontology })
			})
	});
	await ready(page);
	await requestSemantic(page, text);
	await expect(diagram(page)).toHaveAttribute('data-model', 'mindmap');
	await expect(editor(page)).toHaveValue(text);
	await expect(atlas(page).getByTestId('character-count')).toHaveText(
		text.length.toLocaleString('en-GB')
	);
	await expect(atlas(page).getByTestId('source-coverage')).toContainText(
		original.toLocaleString('en-GB')
	);
	await expect(atlas(page).getByTestId('source-coverage')).toContainText('partial reading');
	await expect(atlas(page).getByTestId('source-coverage')).toContainText('2 source excerpts');
	await choose(page, 'knowledge-graph');
	expect(posts).toEqual([{ text, consent: true }]);
	const report = JSON.parse(await exportText(page, /Export JSON report/));
	expect(report.compression).toEqual(ontology.compression);
});

test('local analysis accepts a prompt over 20k and reports its compressed source coverage', async ({
	page
}) => {
	const text = 'Write a kind story about a robot gardener.\n' + 'Use a warm tone.\n'.repeat(1800);
	await ready(page);
	await analyze(page, text);
	await expect(editor(page)).toHaveValue(text);
	await expect(atlas(page).getByTestId('character-count')).toHaveText(
		text.length.toLocaleString('en-GB')
	);
	await expect(atlas(page).getByTestId('source-coverage')).toContainText('Compressed reading');
	await expect(atlas(page).getByTestId('source-coverage')).toContainText('deduplicated');
	const report = JSON.parse(await exportText(page, /Export JSON report/));
	expect(report.analysisMode).toBe('local');
	expect(report.compression.originalCodePoints).toBe(Array.from(text).length);
	expect(report.compression.applied).toBe(true);
	expect(report.compression.duplicateCodePoints).toBeGreaterThan(0);
	await choose(page, 'knowledge-graph');
});

for (const mutation of ['prompt', 'correction', 'source choice', 'model', 'navigation'] as const) {
	test(`pending graph export is discarded after ${mutation} changes`, async ({ page }) => {
		await ready(page);
		await specimen(page, 'A creative brief');
		await choose(page, 'knowledge-graph');
		if (mutation === 'correction')
			await atlas(page).locator('.atlas-scroll-list button').first().click();
		const sourceChoice = atlas(page).getByRole('checkbox', {
			name: 'Include original prompt and evidence in JSON exports',
			exact: true
		});
		if (mutation === 'source choice') await sourceChoice.check();
		await deferGraphDigest(page);
		await atlas(page)
			.getByRole('button', { name: /Export graph JSON-LD/ })
			.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								__atlasDigest: { started: number };
							}
						).__atlasDigest.started
				)
			)
			.toBe(1);
		if (mutation === 'prompt') await editor(page).fill('A revised source prompt.');
		if (mutation === 'correction') {
			const label = atlas(page).locator('.atlas-detail').getByLabel('Label', { exact: true });
			await label.fill('A correction made during export');
			await label.press('Tab');
		}
		if (mutation === 'source choice') await sourceChoice.uncheck();
		if (mutation === 'model') await choose(page, 'concept');
		if (mutation === 'navigation') {
			await atlas(page).getByRole('link', { name: 'Apps', exact: true }).click();
			await expect(page).toHaveURL(/\/blog\/apps$/);
		}
		const unexpectedDownload = page.waitForEvent('download', { timeout: 500 }).then(
			() => true,
			() => false
		);
		await releaseGraphDigest(page);
		expect(await unexpectedDownload).toBe(false);
	});
}

test('a confirmed correction cancels pending AI analysis and survives its late response', async ({
	page
}) => {
	let release!: () => void;
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const { posts } = await mockSemantic(page, {
		respond: async (route) => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			await route
				.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ontology: semanticOntology() })
				})
				.catch(() => {});
			finish();
		}
	});
	await ready(page);
	await analyze(page, semanticText);
	await atlas(page).locator('.atlas-scroll-list button').first().click();
	await aiRadio(page).check();
	await aiConsent(page).check();
	await atlas(page).getByRole('button', { name: 'Analyze prompt', exact: true }).click();
	await expect.poll(() => posts.length).toBe(1);
	const label = atlas(page).locator('.atlas-detail').getByLabel('Label', { exact: true });
	await expect(label).toBeEnabled();
	await label.fill('User correction while AI waits');
	await label.press('Tab');
	await expect(atlas(page).locator('.atlas-notice')).toContainText(
		'cancelled to keep your correction'
	);
	await expect(atlas(page).getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
	release();
	await finished;
	await expect(label).toHaveValue('User correction while AI waits');
	await expect(atlas(page).getByTestId('analysis-provenance')).toContainText('Local · rules-based');
	await expect(aiConsent(page)).not.toBeChecked();
});
