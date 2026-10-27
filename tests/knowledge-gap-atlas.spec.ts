import { expect, test, type Download, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ANALYSIS_REVISION } from '../src/lib/visualizations/knowledge-gap-atlas/types';
import { EXAMPLES } from '../src/lib/visualizations/knowledge-gap-atlas/examples';
import type {
	AnalysisResult,
	AtlasProject,
	SourceRecord
} from '../src/lib/visualizations/knowledge-gap-atlas/types';

const articlePath = '/blog/visualizations/knowledge-gap-atlas';
const app = (page: Page) => page.getByTestId('atlas-app');
const errors = new WeakMap<Page, string[]>();

async function records<T>(page: Page, table: string): Promise<T[]> {
	return page.evaluate(
		(name) =>
			new Promise((resolve, reject) => {
				const opening = indexedDB.open('suvro-knowledge-gap-atlas');
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const database = opening.result;
					const request = database.transaction(name).objectStore(name).getAll();
					request.onsuccess = () => {
						database.close();
						resolve(request.result);
					};
					request.onerror = () => {
						database.close();
						reject(request.error);
					};
				};
			}),
		table
	) as Promise<T[]>;
}

async function latestResult(page: Page): Promise<AnalysisResult | undefined> {
	const projects = await records<AtlasProject>(page, 'projects');
	return projects
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.find((project) => project.result)?.result;
}

async function example(page: Page, id = 'city-heat'): Promise<void> {
	await app(page).getByTestId(`atlas-example-${id}`).click();
	await expect(app(page).getByTestId('atlas-map')).toBeVisible();
	await expect
		.poll(async () => (await latestResult(page))?.concepts.length ?? 0)
		.toBeGreaterThan(10);
}

async function downloadText(download: Download): Promise<string> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('No download stream was returned.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page, baseURL }) => {
	const origin = new URL(baseURL!).origin;
	const failures: string[] = [];
	errors.set(page, failures);
	page.on('pageerror', (error) => failures.push(error.message));
	// These local tests neither load external measurement/media nor contact providers.
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
	await page.goto(articlePath);
	await expect(app(page)).toBeVisible();
	// Resolve the site's first-visit privacy choice through its real controls.
	// Its bottom sheet intentionally covers mobile content until dismissed.
	const privacyChoice = page.getByRole('button', { name: 'Keep videos paused', exact: true });
	await expect(privacyChoice).toBeVisible();
	await privacyChoice.click();
	const confirmation = page.getByRole('button', {
		name: 'Dismiss privacy confirmation',
		exact: true
	});
	await expect(confirmation).toBeVisible();
	await confirmation.click();
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page)).toEqual([]);
});

test('example builds real communities and persists the complete source corpus', async ({
	page
}) => {
	await example(page);
	const result = (await latestResult(page))!;
	expect(result.topics.length).toBeGreaterThan(1);
	expect(result.edges.length).toBeGreaterThan(10);
	expect(result.findings.length).toBeGreaterThan(0);
	expect(
		result.concepts.some((concept) => ['their', 'there', 'the', 'they'].includes(concept.id))
	).toBe(false);
	const sources = await records<SourceRecord>(page, 'sources');
	expect(sources.length).toBeGreaterThan(1);
	for (const source of sources) {
		expect(source.status).toBe('complete');
		expect(source.processedBytes).toBe(source.bytes);
	}
	await page.reload();
	await expect(app(page)).toBeVisible();
	expect((await latestResult(page))?.words).toBe(result.words);
});

test('long mixed-format prose is fully processed, including the tail, without source upload', async ({
	page
}) => {
	test.setTimeout(180_000);
	const marker = 'KGA_PRIVATE_FIELDNOTE';
	const passages = [
		'The neighbourhood clinic opens before the first bus arrives. Older residents describe waiting in direct sunlight, while nurses record dehydration during the afternoon shift. Their accounts explain why a temperature average can miss the conditions along a walking route.',
		'A street tree offers shade only where its canopy reaches. The council records planting totals, but maintenance teams report dry soil, broken guards and roots confined by pavement. A useful cooling plan connects tree maintenance with the journeys that residents actually make.',
		'The housing survey separates a shaded street from a comfortable room. Metal roofs can retain heat after sunset. Tenants may avoid opening windows because of traffic noise or safety concerns. Night-time heat and daytime shade therefore require different observations.',
		'Research note: water access matters at the bus stop and inside the clinic. Drinking fountains need inspection, drainage and replacement parts. A funding proposal should identify who checks a broken fountain, rather than treating installation as the end of the project.',
		'Interview excerpt: “Our route changes when the market floods.” A drainage map can reveal where flood water interrupts a shaded footpath. The transport planner and the public health team should compare the same route, even when their budgets are recorded separately.',
		'Questions for revision: Which residents use each cooling centre? Can a person reach the entrance without climbing stairs? Are opening hours compatible with shift work? These are testable questions about access, not conclusions that can be inferred from a green area on a map.',
		'## Sources to check\n- Compare pavement measurements with clinic attendance.\n- Read the residents’ survey before selecting a new route.\n- Ask maintenance crews whether the water supply survives the dry season.\nThe reference list is provisional; several observations still need independent confirmation.'
	];
	const text = `${marker}\n\n${Array.from({ length: 900 }, (_, index) => passages[index % passages.length]).join('\n\n')}\n\nAt the end of this collection, mangrove restoration protects the estuary. Mangrove restoration belongs in the estuary discussion.`;
	expect(text.length).toBeGreaterThan(200_000);
	const leaks: string[] = [];
	page.on('request', (request) => {
		const payload = `${request.url()} ${request.postData() ?? ''}`;
		if (payload.includes(marker) || payload.includes('The neighbourhood clinic opens'))
			leaks.push(request.url());
	});
	await app(page)
		.getByRole('button', { name: /Map your material/ })
		.click();
	const input = app(page).getByTestId('atlas-paste');
	await expect(input).not.toHaveAttribute('maxlength');
	await input.fill(text);
	await app(page).getByTestId('atlas-build').click();
	await expect
		.poll(
			async () =>
				(await latestResult(page))?.sources.some((source) => source.chars === text.length),
			{ timeout: 150_000 }
		)
		.toBe(true);
	const result = (await latestResult(page))!;
	expect(result.words).toBeGreaterThan(30_000);
	// Independent lexical count for this controlled prose: includes stopwords and
	// preserves contractions/hyphenated words, rather than counting rendered nodes.
	const expectedWords =
		text.match(/[\p{L}\p{M}\p{N}]+(?:['’\-‐]+[\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;
	expect(result.words).toBe(expectedWords);
	expect(result.concepts.some((concept) => concept.id === 'mangrove')).toBe(true);
	expect(result.concepts.some((concept) => concept.id === 'their')).toBe(false);
	const sources = await records<SourceRecord>(page, 'sources');
	const source = sources.find((entry) => entry.chars === text.length)!;
	expect(source.status).toBe('complete');
	expect(source.processedBytes).toBe(Buffer.byteLength(text));
	const chunks = await records<{ sourceId: string; index: number; text: string }>(page, 'chunks');
	const recovered = chunks
		.filter((chunk) => chunk.sourceId === source.id)
		.sort((a, b) => a.index - b.index)
		.map((chunk) => chunk.text)
		.join('');
	expect(recovered).toBe(text);
	expect(leaks).toEqual([]);
	await expect(app(page).getByTestId('atlas-map')).toBeVisible();
});

test('evidence becomes an editable research question and round-trips in a portable project', async ({
	page
}, testInfo) => {
	await example(page);
	await app(page).getByTestId('atlas-view-concepts').click();
	await app(page).getByRole('table').locator('tbody button').first().click();
	const inspector = app(page).getByTestId('atlas-evidence');
	await expect(inspector).toBeVisible();
	await expect(inspector.locator('mark').first()).toHaveText(/\S/);
	await app(page).getByTestId('atlas-view-findings').click();
	await app(page).getByTestId('atlas-findings').getByRole('button').first().click();
	await expect(inspector.locator('mark').first()).toHaveText(/\S/);
	await app(page).getByTestId('atlas-question-save').click();
	await app(page).getByTestId('atlas-view-research').click();
	const question = app(page).getByRole('textbox', { name: 'Research question 1', exact: true });
	await expect(question).toHaveValue(/\S/);
	const customQuestion = 'Which walking routes connect shaded bus stops with community clinics?';
	await question.fill(customQuestion);
	await question.press('Tab');
	await app(page)
		.getByLabel('Notes for question 1', { exact: true })
		.fill('Check the route survey before revising the plan.');
	await app(page).getByLabel('Notes for question 1', { exact: true }).press('Tab');
	await app(page).getByLabel('Status for question 1', { exact: true }).selectOption('addressed');
	await expect
		.poll(async () => (await records<AtlasProject>(page, 'projects'))[0]?.questions[0]?.status)
		.toBe('addressed');
	await app(page).getByTestId('atlas-export').click();
	const reportPromise = page.waitForEvent('download');
	await app(page)
		.getByRole('button', { name: /Research report/ })
		.click();
	const report = await downloadText(await reportPromise);
	expect(report).toContain(customQuestion);
	expect(report).toContain('Check the route survey');
	expect(report).not.toContain(
		'Street trees can shade a pavement without cooling every home beside it.'
	);
	await app(page)
		.getByRole('checkbox', { name: /Include original source text/ })
		.check();
	// Exercise the supported downloadable fallback without opening an OS save picker.
	await page.evaluate(() =>
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
	);
	const projectDownloadPromise = page.waitForEvent('download');
	await app(page)
		.getByRole('button', { name: /Complete project/ })
		.click();
	const projectDownload = await projectDownloadPromise;
	const portable = await downloadText(projectDownload);
	expect(portable).toContain('Street trees can shade a pavement');
	const savedPath = testInfo.outputPath('roundtrip-atlas.ndjson');
	await projectDownload.saveAs(savedPath);
	const before = (await latestResult(page))!;
	await app(page).getByTestId('atlas-project-import').setInputFiles(savedPath);
	await expect.poll(async () => (await records<AtlasProject>(page, 'projects')).length).toBe(2);
	const projects = await records<AtlasProject>(page, 'projects');
	for (const project of projects) {
		expect(project.result?.words).toBe(before.words);
		expect(project.questions[0]?.text).toBe(customQuestion);
		expect(project.questions[0]?.status).toBe('addressed');
	}
	await app(page).getByTestId('atlas-view-research').click();
	await expect(
		app(page).getByRole('textbox', { name: 'Research question 1', exact: true })
	).toHaveValue(customQuestion);
	await app(page)
		.getByRole('button', { name: /Inspect evidence/ })
		.first()
		.click();
	await expect(app(page).getByTestId('atlas-evidence').locator('mark').first()).toHaveText(/\S/);
});

test('reference comparison uses both corpus roles', async ({ page }) => {
	await example(page, 'research-review');
	await app(page).getByTestId('atlas-view-compare').click();
	const result = (await latestResult(page))!;
	expect(result.sources.some((source) => source.role === 'target')).toBe(true);
	expect(result.sources.some((source) => source.role === 'reference')).toBe(true);
	expect(result.findings.some((finding) => finding.kind === 'coverage')).toBe(true);
	await app(page).locator('summary').filter({ hasText: 'Source-by-topic matrix' }).click();
	await expect(app(page).getByRole('table').first()).toBeVisible();
});

test('mobile workspace fits its viewport and keeps core views reachable', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await example(page);
	for (const view of ['concepts', 'findings', 'research', 'sources', 'map']) {
		const button = app(page).getByTestId(`atlas-view-${view}`);
		await button.click();
		await expect(button).toBeVisible();
	}
	const overflow = await app(page).evaluate(
		(element) => element.scrollWidth > element.clientWidth + 2
	);
	expect(overflow).toBe(false);
});

test('keyboard concept inspection exposes accessible evidence', async ({ page }) => {
	await example(page);
	await app(page).getByTestId('atlas-view-concepts').click();
	const concept = app(page).getByRole('table').locator('tbody button').first();
	await concept.focus();
	await concept.press('Enter');
	await expect(app(page).getByTestId('atlas-evidence').locator('mark').first()).toHaveText(/\S/);
	for (const theme of ['paper', 'night']) {
		if (theme === 'night') await app(page).getByRole('button', { name: 'Use night theme' }).click();
		const results = await new AxeBuilder({ page })
			.include('[data-testid="atlas-app"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(
			results.violations.map((violation) => ({
				id: violation.id,
				nodes: violation.nodes.map((node) => ({
					target: node.target,
					problem: node.failureSummary
				}))
			})),
			`${theme} theme accessibility`
		).toEqual([]);
	}
});

test('a ten-megabyte file pauses and resumes with every word and source character intact', async ({
	page
}) => {
	test.setTimeout(180_000);
	const paragraph =
		'Tree canopy cools streets and shelters pedestrians. Indoor temperature changes with insulation and ventilation. Cooling protects public health. বাংলা শহর ভালো থাকে।\r\n';
	const text = paragraph.repeat(50_000);
	expect(Buffer.byteLength(text)).toBe(10_000_000);
	const expectedWords =
		(paragraph.match(/[\p{L}\p{M}\p{N}]+(?:['’\-‐]+[\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0) * 50_000;
	await app(page)
		.getByRole('button', { name: /Map your material/ })
		.click();
	await app(page)
		.getByLabel('Add text files', { exact: true })
		.setInputFiles({
			name: 'large-mixed-language-notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from(text)
		});
	await expect(app(page).getByTestId('atlas-progress')).toContainText('Reading connections');
	await expect
		.poll(async () => {
			const checkpoints = await records<{ words: number }>(page, 'checkpoints');
			return checkpoints[0]?.words ?? 0;
		})
		.toBeGreaterThan(0);
	await app(page).getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(app(page).getByTestId('atlas-progress')).toHaveCount(0);
	const checkpoints = await records<{ words: number }>(page, 'checkpoints');
	expect(checkpoints[0]?.words).toBeGreaterThan(0);
	expect(checkpoints[0]?.words).toBeLessThan(expectedWords);
	await app(page).getByTestId('atlas-build').click();
	await expect
		.poll(async () => (await latestResult(page))?.words ?? 0, { timeout: 120_000 })
		.toBe(expectedWords);
	const sources = await records<SourceRecord>(page, 'sources');
	expect(sources[0]?.status).toBe('complete');
	expect(sources[0]?.chars).toBe(text.length);
	expect(sources[0]?.processedBytes).toBe(10_000_000);
	const chunks = await records<{ index: number; text: string }>(page, 'chunks');
	expect(
		chunks
			.sort((a, b) => a.index - b.index)
			.map((chunk) => chunk.text)
			.join('')
	).toBe(text);
	await expect(app(page).getByTestId('atlas-map')).toBeVisible();
});

test('analysis settings undo restores the committed window and rejects a blank value', async ({
	page
}) => {
	await example(page);
	const settingsButton = app(page).getByRole('button', { name: /^⚙ Settings$/ });
	await settingsButton.click();
	await app(page)
		.getByLabel(/^Word window/)
		.fill('7');
	const unapplied = app(page)
		.getByRole('status')
		.filter({ hasText: 'previous completed analysis' });
	await expect(unapplied).toBeVisible();
	await app(page)
		.getByRole('button', { name: /^Rebuild with these settings/ })
		.click();
	await expect.poll(async () => (await latestResult(page))?.settings.window).toBe(7);
	await expect(unapplied).toHaveCount(0);
	await settingsButton.click();
	await app(page).getByRole('button', { name: 'Undo analysis edit', exact: true }).click();
	await expect.poll(async () => (await latestResult(page))?.settings.window).toBe(5);
	await settingsButton.click();
	await app(page)
		.getByLabel(/^Word window/)
		.fill('');
	await app(page)
		.getByRole('button', { name: /^Rebuild with these settings/ })
		.click();
	await expect(app(page).getByRole('alert')).toContainText('Choose a whole-number word window');
	await expect(app(page).getByTestId('atlas-progress')).toHaveCount(0);
	expect((await latestResult(page))?.settings.window).toBe(5);
});

for (const scenario of [
	{
		id: 'meeting-handoff',
		question:
			'Who can authorise rollback, and which queue check must pass before the rollout expands?'
	},
	{
		id: 'product-feedback',
		question:
			'Can a worker recover an offline draft without creating a duplicate visit after reconnecting?'
	}
]) {
	test(`${scenario.id} practice guide supports a real comparison and portable research plan`, async ({
		page
	}, testInfo) => {
		const definition = EXAMPLES.find((entry) => entry.id === scenario.id)!;
		await example(page, scenario.id);
		const guide = app(page).getByTestId('atlas-practice-guide');
		await expect(guide).toContainText(definition.useCase!);
		await expect(guide).toContainText(definition.task!);
		await expect(guide.locator('li')).toHaveCount(3);
		await expect(guide).toContainText('illustrative writing');
		const before = (await latestResult(page))!;
		expect(before.analysisRevision).toBe(ANALYSIS_REVISION);
		expect(before.sources.filter((source) => source.role === 'target')).toHaveLength(1);
		expect(before.sources.filter((source) => source.role === 'reference')).toHaveLength(2);
		await app(page).getByTestId('atlas-view-compare').click();
		await expect(app(page).locator('.kga-comparison button').first()).toBeVisible();
		expect(before.concepts.some((concept) => concept.referenceCount > concept.targetCount)).toBe(
			true
		);
		await app(page).getByTestId('atlas-view-research').click();
		await app(page)
			.getByRole('textbox', { name: 'New research question', exact: true })
			.fill(scenario.question);
		await app(page)
			.getByRole('button', { name: /^Add question/ })
			.click();
		await expect(
			app(page).getByRole('textbox', { name: 'Research question 1', exact: true })
		).toHaveValue(scenario.question);
		await app(page).getByTestId('atlas-export').click();
		await app(page)
			.getByRole('checkbox', { name: /Include original source text/ })
			.check();
		await page.evaluate(() =>
			Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
		);
		const downloaded = page.waitForEvent('download');
		await app(page)
			.getByRole('button', { name: /Complete project/ })
			.click();
		const download = await downloaded;
		const portable = (await downloadText(download))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(portable.find((entry) => entry.type === 'atlas').project.exampleId).toBe(scenario.id);
		expect(portable.find((entry) => entry.type === 'result').result.analysisRevision).toBe(
			ANALYSIS_REVISION
		);
		const portablePath = testInfo.outputPath(`${scenario.id}.atlas.ndjson`);
		await download.saveAs(portablePath);
		await app(page).getByTestId('atlas-project-import').setInputFiles(portablePath);
		await expect.poll(async () => (await records<AtlasProject>(page, 'projects')).length).toBe(2);
		const projects = await records<AtlasProject>(page, 'projects');
		for (const project of projects) {
			expect(project.exampleId).toBe(scenario.id);
			expect(project.result?.analysisRevision).toBe(ANALYSIS_REVISION);
			expect(project.questions[0]?.text).toBe(scenario.question);
		}
		await expect(guide).toContainText(definition.task!);
		await page.reload();
		await app(page)
			.getByRole('button', { name: /^My atlases/ })
			.click();
		await app(page)
			.locator('.kga-project-list button')
			.filter({ hasText: definition.title })
			.first()
			.click();
		await expect(guide).toContainText(definition.useCase!);
		await guide.getByRole('button', { name: /Show guide/ }).click();
		await expect(guide.locator('li')).toHaveCount(3);
		if (scenario.id === 'meeting-handoff') {
			await app(page)
				.getByRole('button', { name: /^My atlases/ })
				.click();
			await app(page).getByRole('button', { name: 'Browse practice cases', exact: true }).click();
			await expect(app(page).getByTestId('atlas-example-product-feedback')).toBeVisible();
			expect((await records<AtlasProject>(page, 'projects')).length).toBe(2);
		}
	});
}

test('an older analysis offers an explicit update while preserving sources and saved questions', async ({
	page
}) => {
	await example(page, 'meeting-handoff');
	const question = 'Who confirms late-shift support before launch?';
	await app(page).getByTestId('atlas-view-research').click();
	await app(page)
		.getByRole('textbox', { name: 'New research question', exact: true })
		.fill(question);
	await app(page)
		.getByRole('button', { name: /^Add question/ })
		.click();
	await expect
		.poll(async () => (await records<AtlasProject>(page, 'projects'))[0]?.questions[0]?.text)
		.toBe(question);
	const before = (await latestResult(page))!;
	const sources = await records<SourceRecord>(page, 'sources');
	// Reproduce a persisted v1 project without the additive analysis revision field.
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const opening = indexedDB.open('suvro-knowledge-gap-atlas');
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const database = opening.result;
					const transaction = database.transaction('projects', 'readwrite');
					const store = transaction.objectStore('projects');
					const request = store.getAll();
					request.onsuccess = () => {
						for (const project of request.result) {
							delete project.result.analysisRevision;
							store.put(project);
						}
					};
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
					transaction.onerror = () => {
						database.close();
						reject(transaction.error);
					};
				};
			})
	);
	await page.reload();
	await app(page)
		.getByRole('button', { name: /^My atlases/ })
		.click();
	await app(page)
		.locator('.kga-project-list button')
		.filter({ hasText: 'The launch is agreed. Is the handoff ready?' })
		.first()
		.click();
	const update = app(page).getByTestId('atlas-update-analysis');
	await expect(update).toBeVisible();
	await update.click();
	await expect
		.poll(async () => (await latestResult(page))?.analysisRevision)
		.toBe(ANALYSIS_REVISION);
	await expect(update).toHaveCount(0);
	expect((await latestResult(page))?.words).toBe(before.words);
	expect(
		(await records<SourceRecord>(page, 'sources')).map((source) => [
			source.id,
			source.chars,
			source.bytes
		])
	).toEqual(sources.map((source) => [source.id, source.chars, source.bytes]));
	expect((await records<AtlasProject>(page, 'projects'))[0]?.questions[0]?.text).toBe(question);
	await app(page).getByTestId('atlas-view-research').click();
	await expect(
		app(page).getByRole('textbox', { name: 'Research question 1', exact: true })
	).toHaveValue(question);
});
