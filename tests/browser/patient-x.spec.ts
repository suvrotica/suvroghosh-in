import { mkdir, readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/patient-x-depression-bipolar';
const measureIds = ['phq9', 'asrm', 'who5'] as const;
type MeasureId = (typeof measureIds)[number];
type ExportPatient = {
	seed: number;
	synthetic: boolean;
	patient: string;
	assessments: {
		id: string;
		week: number;
		date: string;
		measures: Record<
			MeasureId,
			{
				answers: number[];
				rawTotal: number;
				total: number;
				windowStart: string;
				windowEnd: string;
			}
		>;
	}[];
};

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
	// Vite's loopback production preview does not provide Vercel's hosted
	// analytics proxy. Only that script is a no-op; all feature traffic and
	// every other console/page error retain their normal assertions.
	if (baseURL && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
		await page.route('**/_vercel/insights/script.js', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/javascript',
				body: '/* local preview analytics stub */'
			})
		);
	}
	const errors: string[] = [];
	browserErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`);
	});
});
test.afterEach(async ({ page }) => {
	expect(browserErrors.get(page) ?? [], 'browser console and page errors').toEqual([]);
});

async function ready(page: Page) {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	for (const name of ['Keep videos paused', 'Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	const shell = page.locator('[data-patient-x]');
	await expect(shell).toBeVisible();
	await expect(shell.getByLabel('Look at a check-in')).toHaveValue('3');
	await page.evaluate(() => document.fonts.ready);
	await expect
		.poll(() => shell.evaluate((node) => getComputedStyle(node).borderTopWidth))
		.toBe('2px');
	await expect(shell.locator('.score-line')).toHaveCount(3);
	for (const line of await shell.locator('.score-line').all()) {
		expect(await line.evaluate((node) => getComputedStyle(node).stroke)).not.toBe('none');
	}
	return shell;
}

async function reveal(shell: Locator, className: string) {
	const details = shell.locator(`details.${className}`);
	if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open))) {
		await details.locator('summary').click();
	}
	return details;
}

async function exportText(page: Page, shell: Locator, format: 'JSON' | 'CSV') {
	await reveal(shell, 'method-details');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		shell.getByRole('button', { name: `Download ${format}`, exact: true }).click()
	]);
	expect(download.suggestedFilename()).toMatch(
		new RegExp(`^patient-x-fictional-\\d+\\.${format.toLowerCase()}$`)
	);
	expect(await download.failure()).toBeNull();
	const file = await download.path();
	expect(file).not.toBeNull();
	return readFile(file!, 'utf8');
}

async function exportedPatient(page: Page, shell: Locator): Promise<ExportPatient> {
	return JSON.parse(await exportText(page, shell, 'JSON')) as ExportPatient;
}

async function expectSelected(shell: Locator, patient: ExportPatient, index: number) {
	const assessment = patient.assessments[index];
	await expect(shell.getByLabel('Look at a check-in')).toHaveValue(String(index));
	await expect(shell.locator('.observation .eyebrow')).toContainText(`Week ${assessment.week}`);
	await expect(shell.locator('.answers summary')).toContainText(`Week ${assessment.week}`);
	for (const id of measureIds) {
		const response = assessment.measures[id];
		const track = shell.locator(`.measure-track.${id}`);
		await expect(track.locator('.score strong')).toHaveText(String(response.total));
		await expect(track.locator('svg title')).toContainText(
			`Selected week ${assessment.week}: ${response.total}`
		);
		const controls = track.locator('.point-controls button');
		await expect(track.locator('.point-controls button[aria-pressed="true"]')).toHaveCount(1);
		await expect(controls.nth(index)).toHaveAttribute('aria-pressed', 'true');
		const answers = await shell
			.locator(`.answer-group.${id} .answer-label strong`)
			.allTextContents();
		expect(answers.map((answer) => Number.parseInt(answer, 10))).toEqual(response.answers);
	}
	await expect(shell.locator('.answer-group li')).toHaveCount(19);
	await expect(shell.locator('.scatter title')).toContainText(
		`week ${assessment.week} highlighted`
	);
	await expect(shell.locator('.scatter circle.scatter-selected')).toHaveCount(1);
	const selectedDot = shell.locator('.scatter circle.scatter-selected');
	const datedDot = shell.locator('.scatter circle:not(.scatter-selected)').nth(index);
	for (const axis of ['cx', 'cy']) {
		await expect(selectedDot).toHaveAttribute(axis, (await datedDot.getAttribute(axis))!);
	}
	await expect(shell.locator('.week-buttons button').nth(index)).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(shell.locator('tbody tr.table-selected')).toHaveCount(3);
}

test('SSR retains the article, native score ranges and generated answers without JavaScript', async ({
	browser,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Patient X is a fictional adult');
	expect(html).toContain('What the scores leave out');
	expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
	expect(html).toContain('A person can be doing more and still be doing badly');
	expect(html).toContain('not a diagnostic map');
	const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
	try {
		const page = await context.newPage();
		await page.goto(response.url());
		const shell = page.locator('[data-patient-x]');
		await expect(shell.locator('.measure-track')).toHaveCount(3);
		for (const [id, maximum] of [
			['phq9', 27],
			['asrm', 20],
			['who5', 100]
		] as const) {
			await expect(shell.locator(`.measure-track.${id} .score`)).toContainText(`/ ${maximum}`);
			await expect(shell.locator(`.measure-track.${id} svg`)).toBeVisible();
		}
		await reveal(shell, 'answers');
		await expect(shell.locator('.answer-group li')).toHaveCount(19);
	} finally {
		await context.close();
	}
});

test('a shared selection synchronises scores, answer rows, narrative, table and scatter', async ({
	page
}) => {
	const shell = await ready(page);
	const patient = await exportedPatient(page, shell);
	await reveal(shell, 'answers');
	await reveal(shell, 'scatter-details');
	await reveal(shell, 'data-details');
	for (const index of [0, 5, 2]) {
		await shell.getByLabel('Look at a check-in').selectOption(String(index));
		await expectSelected(shell, patient, index);
	}
	await shell.locator('.week-buttons').getByRole('button', { name: 'Week 8', exact: true }).click();
	await expectSelected(shell, patient, 3);
});

test('a new fictional example changes the data and keeps every view on that same example', async ({
	page
}) => {
	const shell = await ready(page);
	const before = await exportedPatient(page, shell);
	const oldLines = await shell
		.locator('.score-line')
		.evaluateAll((lines) => lines.map((line) => line.getAttribute('points')));
	await reveal(shell, 'answers');
	await reveal(shell, 'scatter-details');
	await shell.getByRole('button', { name: 'New fictional example', exact: true }).click();
	const after = await exportedPatient(page, shell);
	expect(after.seed).not.toBe(before.seed);
	expect(after.assessments).not.toEqual(before.assessments);
	const newLines = await shell
		.locator('.score-line')
		.evaluateAll((lines) => lines.map((line) => line.getAttribute('points')));
	expect(newLines).not.toEqual(oldLines);
	await expectSelected(shell, after, 3);
	for (let index = 0; index < after.assessments.length; index++) {
		await shell.getByLabel('Look at a check-in').selectOption(String(index));
		await expectSelected(shell, after, index);
	}
});

test('JSON and CSV preserve all answers, computed totals and questionnaire windows', async ({
	page
}) => {
	const shell = await ready(page);
	const patient = await exportedPatient(page, shell);
	expect(patient.patient).toBe('Patient X');
	expect(patient.synthetic).toBe(true);
	expect(patient.assessments).toHaveLength(6);
	const csv = await exportText(page, shell, 'CSV');
	const csvRows = csv
		.split(/\r?\n/u)
		.map((line) =>
			[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/gu)].map((match) => match[1].replaceAll('""', '"'))
		);
	const headers = csvRows.shift()!;
	const rows = csvRows.map((cells) =>
		Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
	);
	expect(rows).toHaveLength(114);
	for (const assessment of patient.assessments) {
		for (const [id, name, count, maximum, recall] of [
			['phq9', 'PHQ-9', 9, 3, 14],
			['asrm', 'ASRM', 5, 4, 7],
			['who5', 'WHO-5', 5, 5, 14]
		] as const) {
			const response = assessment.measures[id];
			expect(response.answers).toHaveLength(count);
			for (const answer of response.answers) {
				expect(Number.isInteger(answer)).toBe(true);
				expect(answer).toBeGreaterThanOrEqual(0);
				expect(answer).toBeLessThanOrEqual(maximum);
			}
			const sum = response.answers.reduce((total, answer) => total + answer, 0);
			expect(response.rawTotal).toBe(sum);
			expect(response.total).toBe(sum * (id === 'who5' ? 4 : 1));
			expect(
				(Date.parse(response.windowEnd) - Date.parse(response.windowStart)) / 86400000 + 1
			).toBe(recall);
			const matching = rows.filter(
				(row) => row.assessment_id === assessment.id && row.measure === name
			);
			expect(matching.map((row) => Number(row.answer))).toEqual(response.answers);
			for (const row of matching) {
				expect(Number(row.total)).toBe(response.total);
				expect(Number(row.raw_total)).toBe(sum);
				expect(row.window_start).toBe(response.windowStart);
				expect(row.window_end).toBe(response.windowEnd);
				expect(row.synthetic).toBe('true');
			}
		}
	}
});

test('keyboard controls reveal the explanation and select dates without hover', async ({
	page
}) => {
	const shell = await ready(page);
	const select = shell.getByLabel('Look at a check-in');
	await select.focus();
	await select.press('Home');
	await select.press('Enter');
	await expect(select).toHaveValue('0');
	await expect(shell.locator('.observation')).toContainText('This is the first check-in');
	await select.press('ArrowDown');
	await select.press('Enter');
	await expect(select).toHaveValue('1');
	const point = shell.locator('.measure-track.phq9 .point-controls button').nth(4);
	await point.focus();
	await expect(point).toBeFocused();
	await point.press('Enter');
	await expect(select).toHaveValue('4');
	const summary = shell.locator('.answers summary');
	await summary.focus();
	await summary.press('Enter');
	await expect(shell.locator('.answer-group.phq9')).toBeVisible();
	await expect(shell.locator('.answers')).toHaveAttribute('open', '');
});

test('desktop and dark themes show readable content and capture the working example', async ({
	page
}) => {
	const shell = await ready(page);
	await page.evaluate(() => {
		document.documentElement.classList.remove('dark');
		document.documentElement.dataset.theme = 'paper';
	});
	await mkdir('.tmp', { recursive: true });
	await shell.screenshot({ path: '.tmp/patient-x-desktop.png' });
	const light = await shell.evaluate((node) => ({
		background: getComputedStyle(node).backgroundColor,
		color: getComputedStyle(node).color
	}));
	await page.evaluate(() => {
		document.documentElement.classList.add('dark');
		document.documentElement.dataset.theme = 'night';
	});
	const dark = await shell.evaluate((node) => ({
		background: getComputedStyle(node).backgroundColor,
		color: getComputedStyle(node).color
	}));
	expect(dark.background).not.toBe(light.background);
	expect(dark.color).not.toBe(light.color);
	expect(dark.color).not.toBe(dark.background);
	await expect(
		shell.getByRole('button', { name: 'New fictional example', exact: true })
	).toBeVisible();
	await shell.screenshot({ path: '.tmp/patient-x-dark.png' });
});

test('the first graph is visible on the opening desktop and mobile screens', async ({ page }) => {
	for (const viewport of [
		{ width: 1440, height: 1100 },
		{ width: 375, height: 812 }
	]) {
		await page.setViewportSize(viewport);
		const shell = await ready(page);
		const graph = shell.locator('.measure-track svg').first();
		await expect(graph).toBeVisible();
		const box = await graph.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.y, `first graph at ${viewport.width}px wide`).toBeLessThan(viewport.height - 50);
		const visibleHeight = Math.max(
			0,
			Math.min(box!.y + box!.height, viewport.height) - Math.max(box!.y, 0)
		);
		expect(visibleHeight).toBeGreaterThanOrEqual(50);
		expect(box!.width).toBeGreaterThan(200);
	}
});

test('375px mobile keeps controls usable and contains overflow with all details open', async ({
	page
}) => {
	await page.setViewportSize({ width: 375, height: 812 });
	const shell = await ready(page);
	for (const control of [
		shell.getByLabel('Look at a check-in'),
		shell.getByRole('button', { name: 'New fictional example', exact: true })
	]) {
		const box = await control.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.height).toBeGreaterThanOrEqual(44);
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(375);
	}
	await shell.getByLabel('Look at a check-in').selectOption('5');
	await expect(shell.locator('.observation .eyebrow')).toContainText('Week 12');
	await mkdir('.tmp', { recursive: true });
	await shell.screenshot({ path: '.tmp/patient-x-mobile.png' });
	for (const name of ['answers', 'scatter-details', 'data-details', 'method-details'])
		await reveal(shell, name);
	const overflow = await page.evaluate(
		() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
	await expect(shell.locator('.answer-group li')).toHaveCount(19);
	await expect(shell.locator('.scatter')).toBeVisible();
	await expect(shell.getByRole('button', { name: 'Download JSON', exact: true })).toBeVisible();
	const table = shell.locator('.table-scroll');
	await table.focus();
	await table.press('ArrowRight');
	await expect.poll(() => table.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
});
