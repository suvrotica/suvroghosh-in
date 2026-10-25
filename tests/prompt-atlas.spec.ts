import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const articlePath = '/blog/visualizations/prompt-atlas';
const storageKey = 'suvro-prompt-atlas-session-v1';
const atlas = (page: Page): Locator => page.getByTestId('prompt-atlas');
const editor = (page: Page): Locator =>
	atlas(page).getByLabel('English prompt text', { exact: true });
const diagram = (page: Page): Locator => atlas(page).getByTestId('atlas-diagram');
const selector = (page: Page): Locator =>
	atlas(page).getByLabel('View this prompt as', { exact: true });
const pageErrors = new WeakMap<Page, string[]>();

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
	await expect(atlas(page)).toContainText('A semantic AI provider is not configured');
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
			name: 'Include original prompt in JSON (enables restoring)',
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
