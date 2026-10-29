import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';
import { jsPDF } from 'jspdf';

const path = '/blog/visualizations/mindmap-studio';
const app = (page: Page) => page.getByTestId('mindmap-studio');
const errors = new WeakMap<Page, string[]>();

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('Download did not return a readable stream.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function exportFile(page: Page, label: string): Promise<Download> {
	const menu = app(page).locator('details.export-menu');
	if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
	const download = page.waitForEvent('download');
	await menu.getByRole('button', { name: label, exact: true }).click();
	const result = await download;
	if ((await menu.getAttribute('open')) !== null) await menu.locator('summary').click();
	return result;
}

test.beforeEach(async ({ page }) => {
	errors.set(page, []);
	page.on('pageerror', (error) => errors.get(page)!.push(error.message));
	await page.route('**/api/mindmap-studio', async (route) => {
		if (route.request().method() === 'GET')
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					available: false,
					reason: 'AI disabled in browser tests; local analysis is available.'
				})
			});
		else await route.continue();
	});
	await page.goto(path);
	await expect(app(page)).toBeVisible();
	await app(page).scrollIntoViewIfNeeded();
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(43);
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page)).toEqual([]);
});

test('mind map opens evidence, edits with undo, adds ideas and restores a local save', async ({
	page
}, testInfo) => {
	await app(page).screenshot({ path: testInfo.outputPath('mindmap-desktop.png') });
	await app(page).locator('[data-studio-node="notice"]').click();
	const inspector = app(page).getByRole('complementary', { name: 'Idea inspector' });
	await expect(inspector.getByLabel('Idea', { exact: true })).toHaveValue('Begin with curiosity');
	await inspector.locator('.evidence-card').first().click();
	const evidence = app(page).getByRole('dialog', { name: 'Source passage' });
	await expect(evidence.locator('mark')).toContainText('A useful inquiry starts with a question');
	await evidence.getByRole('button', { name: 'Close source passage' }).click();
	await inspector.getByLabel('Idea', { exact: true }).fill('Curiosity comes first');
	await inspector.getByRole('button', { name: 'Save idea', exact: true }).click();
	await expect(app(page).locator('[data-studio-node="notice"]')).toHaveText(
		'Curiosity comes first'
	);
	await app(page).getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(inspector.getByLabel('Idea', { exact: true })).toHaveValue('Begin with curiosity');
	await inspector.getByRole('button', { name: '+ Child idea', exact: true }).click();
	await inspector.getByLabel('Idea', { exact: true }).fill('A question worth keeping');
	await inspector.getByRole('button', { name: 'Save idea', exact: true }).click();
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(44);
	await expect(app(page).locator('.save-status')).toHaveText('Saved on this device');
	await page.reload();
	await expect(app(page).locator('.save-status')).toHaveText('Restored from this device');
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(44);
	const previousTheme = await app(page).getAttribute('data-studio-theme');
	await app(page).getByRole('button', { name: 'Toggle canvas theme' }).click();
	await expect(app(page)).toHaveAttribute(
		'data-studio-theme',
		previousTheme === 'night' ? 'paper' : 'night'
	);
	await app(page).screenshot({ path: testInfo.outputPath('mindmap-night.png') });
});

test('source workflow builds an exact-passage outline and JSON round trips its evidence', async ({
	page
}) => {
	await app(page).getByRole('button', { name: '+ New', exact: true }).click();
	const sources = app(page).getByRole('region', { name: 'Source workspace' });
	await sources.getByLabel('Source title', { exact: true }).fill('A garden study');
	await sources
		.getByLabel('Text to analyse', { exact: true })
		.fill(
			'# Observations\n\nThe shaded garden retained moisture longer than the exposed garden. Both plots received the same amount of water.\n\n# Limitations\n\nThe observation covered only one week. Soil composition was not measured, so the study does not establish a causal mechanism.'
		);
	await sources.getByRole('button', { name: 'Create local outline →', exact: true }).click();
	await expect(app(page).locator('.studio-message')).toContainText('Local outline ready');
	await expect(app(page).locator('.mode-tag')).toHaveText('Local extractive outline');
	const file = await exportFile(page, 'Editable project · JSON');
	const bytes = await downloadBytes(file);
	const project = JSON.parse(bytes.toString());
	expect(project.sources[0].title).toBe('A garden study');
	expect(project.generation.mode).toBe('local');
	for (const node of project.nodes)
		for (const evidence of node.evidence) {
			const source = project.sources.find((item: { id: string }) => item.id === evidence.sourceId);
			expect(source.text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
		}
	await app(page).getByRole('button', { name: '+ New', exact: true }).click();
	await app(page)
		.locator('input[type="file"][accept=".json"]')
		.setInputFiles({ name: 'garden.mindmap.json', mimeType: 'application/json', buffer: bytes });
	await expect(app(page).locator('.studio-message')).toContainText('Project restored');
	await expect(app(page).getByLabel('Project title', { exact: true })).toHaveValue(project.title);
	await app(page).getByRole('button', { name: 'Analysis', exact: true }).click();
	await expect(app(page).locator('.analysis-view')).toContainText('An extractive reading outline');
});

test('graph preserves concepts, filters relationships, inspects connections and exports real graphics', async ({
	page
}, testInfo) => {
	await app(page).getByRole('button', { name: 'Knowledge graph', exact: true }).click();
	const graph = app(page).getByTestId('studio-knowledge-graph');
	await expect(graph.locator('[data-node]')).toHaveCount(43);
	await expect(graph.locator('[data-edge]').first()).toBeVisible();
	await app(page).screenshot({ path: testInfo.outputPath('knowledge-graph-desktop.png') });
	await graph.locator('[data-edge]').first().click();
	await expect(
		app(page)
			.getByRole('complementary', { name: 'Idea inspector' })
			.getByRole('heading', { name: 'Source support', exact: true })
	).toBeVisible();
	await app(page).getByRole('button', { name: 'Close inspector' }).click();
	await graph.getByLabel('Filter graph relationships').selectOption('supports');
	for (const text of await graph.locator('[data-edge] text').allTextContents())
		expect(text).toBe('supports');
	await graph.getByLabel('Filter graph relationships').selectOption('all');
	await graph.getByLabel('Filter graph evidence').selectOption('explicit');
	for (const label of await graph
		.locator('[data-node]')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))))
		expect(label).toContain('. explicit.');
	await graph.getByLabel('Filter graph evidence').selectOption('all');
	const vector = await downloadBytes(await exportFile(page, 'Vector image · SVG'));
	expect(vector.toString()).toContain('<svg');
	expect(vector.toString()).not.toContain('<script');
	expect(vector.toString()).toContain('knowledge graph');
	const raster = await downloadBytes(await exportFile(page, 'Map image · PNG'));
	expect(raster.subarray(1, 4).toString()).toBe('PNG');
	const metadata = await sharp(raster).metadata();
	expect(metadata.width).toBeGreaterThan(500);
	expect(metadata.height).toBeGreaterThan(400);
	const statistics = await sharp(raster).stats();
	expect(statistics.channels[0].stdev).toBeGreaterThan(5);
});

test('mind-map image export includes the actual branches and labels', async ({ page }) => {
	const raster = await downloadBytes(await exportFile(page, 'Map image · PNG'));
	expect(raster.subarray(1, 4).toString()).toBe('PNG');
	const metadata = await sharp(raster).metadata();
	expect(metadata.width).toBeGreaterThan(500);
	expect(metadata.height).toBeGreaterThan(300);
	const statistics = await sharp(raster).stats();
	expect(statistics.channels[0].stdev).toBeGreaterThan(5);
});

test('native canvas rename and collapse preserve source metadata and canonical ideas', async ({
	page
}) => {
	const node = app(page).locator('[data-studio-node="notice-2"]');
	await node.press('F2');
	await app(page).locator('#input-box').fill('State a useful purpose');
	await app(page).locator('#input-box').press('Enter');
	await expect(node).toHaveText('State a useful purpose');
	const inspector = app(page).getByRole('complementary', { name: 'Idea inspector' });
	await expect(inspector.getByLabel('Idea', { exact: true })).toHaveValue('State a useful purpose');
	await app(page).getByRole('button', { name: 'Close inspector' }).click();
	await app(page)
		.getByRole('button', { name: 'Collapse Begin with curiosity', exact: true })
		.click();
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(37);
	const project = JSON.parse(
		(await downloadBytes(await exportFile(page, 'Editable project · JSON'))).toString()
	);
	expect(project.nodes).toHaveLength(43);
	const renamed = project.nodes.find((item: { id: string }) => item.id === 'notice-2');
	expect(renamed.label).toBe('State a useful purpose');
	expect(renamed.status).toBe('inferred');
	expect(renamed.reviewed).toBe(false);
	expect(renamed.evidence.length).toBeGreaterThan(0);
	expect(project.nodes.find((item: { id: string }) => item.id === 'notice').collapsed).toBe(true);
	await app(page).getByRole('button', { name: 'Expand Begin with curiosity', exact: true }).click();
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(43);
});

test('published figure retains a complete text outline and opens a readonly map and graph', async ({
	page
}) => {
	const figure = page.locator('figure.mindmap-figure');
	await expect(figure).toHaveCount(1);
	await expect(figure.locator('.text-outline ol li')).toHaveCount(43);
	await expect(figure.locator('[data-studio-node]')).toHaveCount(0);
	await figure.getByText('Read the complete text outline', { exact: true }).click();
	await expect(figure.locator('.text-outline')).toContainText('Begin with curiosity');
	await expect(figure.locator('.source-warning')).toContainText('omits original source bodies');
	await figure.getByRole('button', { name: 'Explore this map', exact: true }).click();
	await expect(figure.locator('[data-studio-node]')).toHaveCount(43);
	await figure.getByRole('button', { name: 'Collapse Begin with curiosity', exact: true }).click();
	await expect(figure.locator('[data-studio-node]')).toHaveCount(37);
	await figure
		.getByRole('button', { name: 'Expand Begin with curiosity', exact: true })
		.press('Enter');
	await expect(figure.locator('[data-studio-node]')).toHaveCount(43);
	const idea = figure.locator('[data-studio-node="notice"]');
	await idea.press('Enter');
	await expect(figure.getByRole('complementary', { name: 'Selected idea' })).toContainText(
		'Begin with curiosity'
	);
	await idea.press('F2');
	await expect(figure.locator('#input-box')).toHaveCount(0);
	await expect(idea).toHaveText('Begin with curiosity');
	await figure.getByRole('button', { name: 'Knowledge graph', exact: true }).click();
	await expect(figure.locator('[data-node]')).toHaveCount(43);
	await figure.locator('[data-edge]').first().press('Enter');
	await expect(figure.getByRole('complementary', { name: 'Selected relationship' })).toBeVisible();
	await figure.getByRole('button', { name: 'Close interactive view', exact: true }).click();
	await expect(figure.getByRole('button', { name: 'Explore this map', exact: true })).toBeVisible();
});

test('an inaccessible link never produces fabricated analysis', async ({ page }) => {
	await app(page).getByRole('button', { name: '+ New', exact: true }).click();
	const sources = app(page).getByRole('region', { name: 'Source workspace' });
	await sources.getByRole('combobox', { name: 'Source type', exact: true }).selectOption('url');
	await sources
		.getByLabel('Original link', { exact: false })
		.fill('https://example.com/unavailable-video');
	await sources.getByRole('button', { name: 'Create local outline →', exact: true }).click();
	await expect(sources.getByRole('alert')).toContainText('Add its transcript or article text');
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(1);
});

test('PDF import reads the selected physical pages and a blank PDF preserves the editor', async ({
	page
}) => {
	await app(page).getByRole('button', { name: '+ New', exact: true }).click();
	const sources = app(page).getByRole('region', { name: 'Source workspace' });
	await sources.getByText('PDF page selection', { exact: true }).click();
	await sources.getByLabel('First page', { exact: true }).fill('2');
	await sources.getByLabel('Last page', { exact: true }).fill('2');
	const pdf = new jsPDF();
	pdf.text('Page one is outside the requested scope.', 20, 30);
	pdf.addPage();
	pdf.text('Page two examines how careful observation supports learning.', 20, 30);
	const upload = sources.locator('input[type="file"]');
	await upload.setInputFiles({
		name: 'selected-pages.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(pdf.output('arraybuffer'))
	});
	const editor = sources.getByLabel('Text to analyse', { exact: true });
	await expect(editor).toHaveValue(/\[PDF page 2\]/);
	await expect(editor).toHaveValue(/Page two examines/);
	await expect(editor).not.toHaveValue(/Page one/);
	const extracted = await editor.inputValue();
	const blank = new jsPDF();
	blank.addPage();
	await upload.setInputFiles({
		name: 'blank-scan.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(blank.output('arraybuffer'))
	});
	await expect(sources.getByRole('alert')).toContainText('no readable text');
	await expect(editor).toHaveValue(extracted);
	await expect(sources.getByLabel('Source title', { exact: true })).toHaveValue('selected-pages');
	await sources.getByRole('button', { name: 'Create local outline →', exact: true }).click();
	await expect(app(page).locator('.studio-message')).toContainText('Local outline ready');
	const project = JSON.parse(
		(await downloadBytes(await exportFile(page, 'Editable project · JSON'))).toString()
	);
	expect(project.sources[0].kind).toBe('pdf');
	expect(project.sources[0].text).toContain('Page two examines');
	expect(project.sources[0].text).not.toContain('Page one');
});

test('SRT source selection includes only complete cues inside the requested timestamps', async ({
	page
}) => {
	await app(page).getByRole('button', { name: '+ New', exact: true }).click();
	const sources = app(page).getByRole('region', { name: 'Source workspace' });
	await sources.locator('input[type="file"]').setInputFiles({
		name: 'field-notes.srt',
		mimeType: 'text/plain',
		buffer: Buffer.from(
			'1\n00:00:01,000 --> 00:00:05,000\nExcluded introduction about other topics.\n\n2\n00:00:10,000 --> 00:00:15,000\nThe selected passage describes careful observation and evidence.\n\n3\n00:00:20,000 --> 00:00:25,000\nExcluded conclusion after the selected period.'
		)
	});
	await expect(sources.getByRole('combobox', { name: 'Source type', exact: true })).toHaveValue(
		'transcript'
	);
	await sources.getByLabel('From timestamp', { exact: true }).fill('00:00:09');
	await sources.getByLabel('To timestamp', { exact: true }).fill('00:00:16');
	await sources.getByRole('button', { name: 'Create local outline →', exact: true }).click();
	await expect(app(page).locator('.studio-message')).toContainText('Local outline ready');
	const project = JSON.parse(
		(await downloadBytes(await exportFile(page, 'Editable project · JSON'))).toString()
	);
	expect(project.sources[0].text).toContain('The selected passage');
	expect(project.sources[0].text).not.toContain('Excluded');
	expect(project.sources[0].scope).toContain('00:00:09–00:00:16');
	for (const node of project.nodes)
		for (const evidence of node.evidence)
			expect(project.sources[0].text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
});

test('phone layout offers accessible outline, inspection and both canvases without page overflow', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await app(page).getByRole('button', { name: 'Outline', exact: true }).click();
	await app(page)
		.locator('.outline-row button')
		.filter({ hasText: 'Begin with curiosity' })
		.click();
	await expect(app(page).getByRole('complementary', { name: 'Idea inspector' })).toBeVisible();
	await app(page).getByRole('button', { name: 'Close inspector' }).click();
	await app(page).getByRole('button', { name: 'Mind map', exact: true }).click();
	await expect(app(page).locator('[data-studio-node]')).toHaveCount(43);
	expect(
		Number.parseInt(await app(page).getByLabel('Mind-map zoom level').innerText(), 10)
	).toBeGreaterThanOrEqual(55);
	await app(page).screenshot({ path: testInfo.outputPath('mindmap-phone.png') });
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth + 2
	);
	expect(overflow).toBe(false);
	await app(page).getByRole('button', { name: 'Knowledge graph', exact: true }).click();
	await app(page).screenshot({ path: testInfo.outputPath('knowledge-graph-phone.png') });
	await expect(app(page).getByTestId('studio-knowledge-graph')).toBeVisible();
	const graph = app(page).getByTestId('studio-knowledge-graph');
	const closeView = (await graph.locator('svg').getAttribute('viewBox'))!.split(' ').map(Number);
	expect(closeView[2]).toBeLessThan(1000);
	await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
	const overview = (await graph.locator('svg').getAttribute('viewBox'))!.split(' ').map(Number);
	expect(overview[2]).toBeGreaterThan(closeView[2]);
});
