import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const articlePath = '/blog/visualizations/a-place-for-every-idea';
const artifacts = 'artifacts/memory-palace/browser';
const palace = (page: Page): Locator => page.locator('[data-memory-palace]');
const runtime = (page: Page): Locator => palace(page).locator('[data-memory-ready="true"]');
const panel = (page: Page): Locator => runtime(page).locator('.mp-panel');
const wordAnswer = (page: Page): Locator =>
	panel(page).getByRole('textbox', { name: 'Which word or phrase belongs here?', exact: true });

test.beforeEach(async ({ page, baseURL }) => {
	const origin = new URL(baseURL!).origin;
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
});

async function ready(page: Page): Promise<void> {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await palace(page).scrollIntoViewIfNeeded();
	await expect(runtime(page)).toBeVisible();
	const rejectOptional = page.getByRole('button', { name: 'Reject optional', exact: true });
	if (await rejectOptional.isVisible()) await rejectOptional.click();
}

async function confirmUnits(page: Page): Promise<void> {
	await panel(page)
		.getByRole('checkbox', { name: /I have reviewed the units/u })
		.check();
	await panel(page)
		.getByRole('button', { name: 'Confirm units and make scenes', exact: true })
		.click();
	await expect(
		panel(page).getByRole('textbox', { name: 'Your memorable scene', exact: true })
	).toBeVisible();
}

async function examplePractice(page: Page, mode: 'words' | 'concepts' = 'words'): Promise<void> {
	await ready(page);
	await panel(page)
		.getByRole('button', {
			name: mode === 'words' ? 'Try the word list' : 'Try the concept paragraph',
			exact: true
		})
		.click();
	await confirmUnits(page);
	await panel(page).getByRole('button', { name: 'Walk my route', exact: true }).click();
	await panel(page)
		.getByRole('button', { name: /^Practise recall/u })
		.click();
}

async function endPractice(page: Page): Promise<void> {
	await panel(page).getByRole('button', { name: 'End practice and review', exact: true }).click();
	await expect(
		panel(page).getByRole('heading', { name: 'Your walk, remembered.', exact: true })
	).toBeVisible();
}

async function expectScore(page: Page, remembered: number, unassisted: number): Promise<void> {
	await expect(panel(page).locator('.mp-results > div').nth(0).locator('strong')).toHaveText(
		String(remembered)
	);
	await expect(panel(page).locator('.mp-results > div').nth(2).locator('strong')).toHaveText(
		String(unassisted)
	);
}

async function assertNoOverflow(page: Page): Promise<void> {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
		.toBe(true);
	const bounds = await palace(page).evaluate((element) => {
		const rect = element.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			width: innerWidth,
			overflow: element.scrollWidth - element.clientWidth
		};
	});
	expect(bounds.left).toBeGreaterThanOrEqual(-1);
	expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
	expect(bounds.overflow).toBeLessThanOrEqual(1);
}

async function downloadText(download: Download): Promise<string> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not provide the study sheet download.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks).toString('utf8');
}

test('word practice hides targets, distinguishes hints and preserves original locations on retry', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await examplePractice(page);
	await expect(runtime(page)).not.toContainText('umbrella');
	await expect(runtime(page).getByRole('heading', { name: 'umbrella', exact: true })).toHaveCount(
		0
	);
	await expect(runtime(page).locator('.palace-scene-token')).toHaveCount(0);
	await wordAnswer(page).fill(' UMBRELLA ');
	await panel(page).getByRole('button', { name: 'Record my answer', exact: true }).click();
	await expect(panel(page)).toContainText('Matched this occurrence at this position.');
	await expect(wordAnswer(page)).toBeDisabled();
	await panel(page).getByRole('button', { name: 'Next location', exact: true }).click();
	await expect(panel(page)).toContainText('original route position 2');
	await expect(runtime(page)).not.toContainText('mango');
	await panel(page).getByRole('button', { name: 'Give me a scene hint', exact: true }).click();
	await expect(panel(page)).toContainText('SCENE HINT · ASSISTED');
	await expect(runtime(page).locator('.palace-scene-token')).toHaveCount(1);
	await wordAnswer(page).fill('orange');
	await panel(page).getByRole('button', { name: 'Record my answer', exact: true }).click();
	await expect(panel(page)).toContainText('The wording did not match this position.');
	await endPractice(page);
	await expectScore(page, 1, 1);
	const second = panel(page).locator('.mp-review-list article').nth(1);
	await expect(second).toContainText('2 · Front steps · missed');
	await expect(second).toContainText('Scene hint: used');
	await panel(page)
		.getByRole('button', { name: 'Practise weak or skipped items', exact: true })
		.click();
	await expect(panel(page)).toContainText('original route position 2');
	await expect(runtime(page)).not.toContainText('mango');
	expect(failures).toEqual([]);
});

test('revealing before answering cannot be scored as unassisted word recall', async ({ page }) => {
	await examplePractice(page);
	await panel(page).getByRole('button', { name: 'Reveal the target', exact: true }).click();
	await expect(panel(page)).toContainText('Target revealed before a checked answer.');
	await expect(wordAnswer(page)).toBeDisabled();
	await expect(
		panel(page).getByRole('button', { name: 'Record my answer', exact: true })
	).toBeDisabled();
	await endPractice(page);
	await expectScore(page, 0, 0);
	await expect(panel(page).locator('.mp-review-list article').first()).toContainText(
		'unrated / skipped'
	);
	await expect(panel(page).locator('.mp-review-list article').first()).toContainText(
		'Target: revealed'
	);
});

test('concept recall commits an answer before feedback and uses human self-assessment', async ({
	page
}) => {
	await examplePractice(page, 'concepts');
	const answer = panel(page).getByRole('textbox', {
		name: 'Explain the idea and its important relationships.',
		exact: true
	});
	await expect(runtime(page)).not.toContainText('Solar energy and evaporation');
	await answer.fill('Energy from the Sun allows liquid water to become invisible water vapour.');
	await panel(page).getByRole('button', { name: 'Record my answer', exact: true }).click();
	await expect(answer).toBeDisabled();
	await expect(runtime(page)).not.toContainText('Solar energy and evaporation');
	await expect(panel(page).getByRole('button', { name: 'Remembered', exact: true })).toHaveCount(0);
	await panel(page).getByRole('button', { name: 'Reveal the target', exact: true }).click();
	await expect(panel(page)).toContainText('Solar energy and evaporation');
	await expect(panel(page)).toContainText('Relationship / condition:');
	await panel(page).getByRole('button', { name: 'Remembered', exact: true }).click();
	await endPractice(page);
	await expectScore(page, 1, 1);
	await expect(panel(page)).toContainText('Concept ratings are your own assessment');
	await panel(page).getByRole('button', { name: 'Try this batch again', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Reveal the target', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Remembered', exact: true }).click();
	await endPractice(page);
	await expectScore(page, 1, 0);
});

test('preparation preserves duplicate phrases and source text, rejects overflow, and edits units accessibly', async ({
	page
}) => {
	await ready(page);
	const source = panel(page).getByRole('textbox', { name: 'Original material', exact: true });
	const tooMany = Array.from({ length: 49 }, (_, index) => `word ${index}`).join(', ');
	await source.fill(tooMany);
	await panel(page).getByRole('button', { name: 'Suggest a breakdown', exact: true }).click();
	await expect(panel(page).getByRole('alert')).toContainText('at most 48 units');
	await expect(source).toHaveValue(tooMany);
	const sourceText = 'solar energy, solar energy, চাঁদ';
	await source.fill(sourceText);
	await panel(page).getByRole('button', { name: 'Suggest a breakdown', exact: true }).click();
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(3);
	await expect(panel(page).locator('.mp-unit-list button').nth(1)).toHaveText('2solar energy');
	await expect(source).toHaveValue(sourceText);
	await panel(page).getByRole('textbox', { name: 'Unit label', exact: true }).fill('');
	await panel(page)
		.getByRole('checkbox', { name: /I have reviewed the units/u })
		.check();
	await expect(
		panel(page).getByRole('button', { name: 'Confirm units and make scenes', exact: true })
	).toBeDisabled();
	await panel(page).getByRole('textbox', { name: 'Unit label', exact: true }).fill('solar energy');
	await panel(page)
		.getByRole('textbox', { name: 'Split into units using |', exact: true })
		.fill('solar | energy');
	await panel(page).getByRole('button', { name: 'Split this unit', exact: true }).click();
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(4);
	await panel(page).getByRole('button', { name: 'Group with next', exact: true }).click();
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(3);
	await expect(panel(page).getByRole('textbox', { name: 'Unit label', exact: true })).toHaveValue(
		'solar + energy'
	);
	await panel(page).getByRole('button', { name: 'Move later', exact: true }).click();
	await expect(panel(page).locator('.mp-unit-list button').first()).toHaveText('1solar energy');
	await expect(source).toHaveValue(sourceText);
	await confirmUnits(page);
	for (let index = 0; index < 3; index++) {
		await panel(page)
			.getByRole('textbox', { name: 'Your memorable scene', exact: true })
			.fill(`My personally chosen scene ${index + 1}`);
		if (index < 2)
			await panel(page).getByRole('button', { name: 'Next unit', exact: true }).click();
	}
	await panel(page).getByRole('button', { name: 'Walk my route', exact: true }).click();
	const downloaded = page.waitForEvent('download');
	await panel(page).getByRole('button', { name: 'Download study sheet', exact: true }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toBe('my-memory-palace.md');
	const sheet = await downloadText(download);
	expect(sheet).toContain('Target: solar energy');
	expect(sheet).toContain('Target: solar + energy');
	expect(sheet).toContain('Target: চাঁদ');
	expect(sheet).toContain('My personally chosen scene 3');
});

test('over-limit pasted text remains intact until the reader shortens it', async ({ page }) => {
	await ready(page);
	const source = panel(page).getByRole('textbox', { name: 'Original material', exact: true });
	const overLimit = 'x'.repeat(6001);
	await source.fill(overLimit);
	await expect(source).toHaveValue(overLimit);
	await panel(page).getByRole('button', { name: 'Suggest a breakdown', exact: true }).click();
	await expect(panel(page).getByRole('alert')).toContainText('Nothing has been discarded');
	await expect(source).toHaveValue(overLimit);
});

test('manual concept passages use the current source and clearing removes learner material', async ({
	page
}) => {
	await ready(page);
	await panel(page).getByRole('button', { name: 'Try the concept paragraph', exact: true }).click();
	const source = panel(page).getByRole('textbox', { name: 'Original material', exact: true });
	await source.evaluate((element) => {
		const textarea = element as HTMLTextAreaElement;
		textarea.setSelectionRange(0, 7);
		textarea.dispatchEvent(new Event('select', { bubbles: true }));
	});
	await source.fill(
		'Only if the air cools enough does condensation occur. Not every cloud produces rain.'
	);
	await panel(page)
		.getByRole('button', { name: 'Add selected passage as a unit', exact: true })
		.click();
	await expect(panel(page).getByRole('alert')).toContainText('Select a passage');
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(0);
	await source.evaluate((element) => {
		const textarea = element as HTMLTextAreaElement;
		textarea.setSelectionRange(0, textarea.value.indexOf('.') + 1);
		textarea.dispatchEvent(new Event('select', { bubbles: true }));
	});
	await panel(page)
		.getByRole('button', { name: 'Add selected passage as a unit', exact: true })
		.click();
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(1);
	await expect(
		panel(page).getByRole('textbox', { name: 'What this idea means', exact: true })
	).toHaveValue('Only if the air cools enough does condensation occur.');
	await runtime(page)
		.getByRole('button', { name: 'Clear session and start over', exact: true })
		.click();
	await expect(source).toHaveValue('');
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(0);
	await expect(panel(page).getByRole('status')).toContainText('Session cleared');
	await source.fill('x'.repeat(6001));
	await source.evaluate((element) => {
		const textarea = element as HTMLTextAreaElement;
		textarea.setSelectionRange(0, 10);
		textarea.dispatchEvent(new Event('select', { bubbles: true }));
	});
	await panel(page)
		.getByRole('button', { name: 'Add selected passage as a unit', exact: true })
		.click();
	await expect(panel(page).getByRole('alert')).toContainText('Nothing has been discarded');
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(0);
});

test('grouping retains both concept relationships and rejects labels that cannot fit', async ({
	page
}) => {
	await ready(page);
	await panel(page).getByRole('button', { name: 'Try the concept paragraph', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Group with next', exact: true }).click();
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(6);
	await confirmUnits(page);
	await expect(panel(page).locator('.mp-target')).toContainText('Supplies energy for evaporation');
	await expect(panel(page).locator('.mp-target')).toContainText('Cooling enough is the condition');
	await panel(page).getByRole('button', { name: 'Edit units and source', exact: true }).click();
	await panel(page).getByRole('textbox', { name: 'Unit label', exact: true }).fill('a'.repeat(400));
	await panel(page).locator('.mp-unit-list button').nth(1).click();
	await panel(page).getByRole('textbox', { name: 'Unit label', exact: true }).fill('b'.repeat(400));
	await panel(page).locator('.mp-unit-list button').first().click();
	await panel(page).getByRole('button', { name: 'Group with next', exact: true }).click();
	await expect(panel(page).getByRole('alert')).toContainText('both units are still intact');
	await expect(panel(page).locator('.mp-unit-list button')).toHaveCount(6);
});

test('editing an association clears prior scores before the next practice session', async ({
	page
}) => {
	await examplePractice(page);
	await wordAnswer(page).fill('umbrella');
	await panel(page).getByRole('button', { name: 'Record my answer', exact: true }).click();
	await endPractice(page);
	await expectScore(page, 1, 1);
	await panel(page).getByRole('button', { name: 'Revise associations', exact: true }).click();
	await panel(page)
		.getByRole('textbox', { name: 'Your memorable scene', exact: true })
		.fill('A folded umbrella pushes the gate sideways, ringing its bell.');
	await expect(panel(page).getByRole('status')).toContainText(
		'previous practice results were cleared'
	);
	await panel(page).getByRole('button', { name: 'Walk my route', exact: true }).click();
	await panel(page)
		.getByRole('button', { name: /^Practise recall/u })
		.click();
	await endPractice(page);
	await expectScore(page, 0, 0);
});

test('a second practice batch retains its global position while using the fixed house route', async ({
	page
}) => {
	await ready(page);
	await panel(page)
		.getByRole('textbox', { name: 'Original material', exact: true })
		.fill(Array.from({ length: 13 }, (_, index) => `word ${index + 1}`).join(', '));
	await panel(page).getByRole('button', { name: 'Suggest a breakdown', exact: true }).click();
	await confirmUnits(page);
	for (let index = 0; index < 13; index++) {
		await panel(page)
			.getByRole('textbox', { name: 'Your memorable scene', exact: true })
			.fill(`A personally meaningful scene for word ${index + 1}.`);
		if (index < 12)
			await panel(page).getByRole('button', { name: 'Next unit', exact: true }).click();
	}
	await panel(page).getByRole('button', { name: 'Walk my route', exact: true }).click();
	await runtime(page)
		.getByRole('combobox', { name: 'Practice batch', exact: true })
		.selectOption('1');
	await expect(panel(page)).toContainText('word 13');
	await panel(page).getByRole('button', { name: 'Practise recall · batch 2', exact: true }).click();
	await expect(panel(page)).toContainText('Attempt 1 of 1 · original route position 13');
	await expect(runtime(page)).not.toContainText('word 13');
	await wordAnswer(page).fill('word 13');
	await panel(page).getByRole('button', { name: 'Record my answer', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Finish and review', exact: true }).click();
	await expectScore(page, 1, 1);
	await panel(page).getByRole('button', { name: 'Try this batch again', exact: true }).click();
	await expect(panel(page)).toContainText('original route position 13');
});

test('the house supports keyboard route learning and fits wide and narrow reduced-motion screens', async ({
	page
}) => {
	await ready(page);
	await mkdir(artifacts, { recursive: true });
	await runtime(page).getByRole('button', { name: 'Location 12: Terrace', exact: true }).click();
	await expect(runtime(page).locator('.mp-route-lesson h3')).toHaveText('Terrace');
	await panel(page).locator('.mp-unit-list button').first().click();
	await expect(runtime(page).locator('.mp-route-lesson h3')).toHaveText('Gate');
	await runtime(page).getByRole('button', { name: 'Next landmark', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(runtime(page).locator('.mp-route-lesson h3')).toHaveText('Front steps');
	await expect(
		runtime(page).getByRole('button', { name: 'Location 2: Front steps', exact: true })
	).toHaveAttribute('aria-current', 'step');
	for (const width of [1440, 390, 360]) {
		await page.setViewportSize({ width, height: width === 1440 ? 1100 : 1000 });
		await palace(page).scrollIntoViewIfNeeded();
		await assertNoOverflow(page);
		await expect(
			runtime(page).getByRole('button', { name: 'Next landmark', exact: true })
		).toBeVisible();
		await palace(page).screenshot({
			path: `${artifacts}/${width === 1440 ? 'desktop' : `mobile-${width}`}.png`
		});
	}
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect
		.poll(() =>
			runtime(page)
				.locator('.palace-marker')
				.first()
				.evaluate((element) => getComputedStyle(element).transitionDuration)
		)
		.toBe('0s');
});

test('concept study and recall hints fit desktop and mobile with accessible hidden answers', async ({
	page
}) => {
	await ready(page);
	await mkdir(artifacts, { recursive: true });
	await panel(page).getByRole('button', { name: 'Try the concept paragraph', exact: true }).click();
	await confirmUnits(page);
	await panel(page).getByRole('button', { name: 'Walk my route', exact: true }).click();
	const audits: { phase: string; width: number; violations: unknown[] }[] = [];
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: width === 1440 ? 1100 : 1000 });
		await assertNoOverflow(page);
		await palace(page).screenshot({ path: `${artifacts}/concept-study-${width}.png` });
		const audit = await new AxeBuilder({ page }).include('[data-memory-palace]').analyze();
		audits.push({ phase: 'study', width, violations: audit.violations });
	}
	await panel(page)
		.getByRole('button', { name: /^Practise recall/u })
		.click();
	await expect(runtime(page)).not.toContainText('Solar energy and evaporation');
	await expect(runtime(page)).not.toContainText('Sun-shaped lantern');
	await expect(runtime(page).locator('.mp-target, .mp-scene, .mp-hint, .mp-edit-card')).toHaveCount(
		0
	);
	const beforeHint = await runtime(page).ariaSnapshot();
	expect(beforeHint).not.toContain('Solar energy and evaporation');
	expect(beforeHint).not.toContain('Sun-shaped lantern');
	await panel(page).getByRole('button', { name: 'Give me a scene hint', exact: true }).click();
	await expect(panel(page)).toContainText('Sun-shaped lantern');
	await expect(
		runtime(page).getByRole('heading', { name: 'Solar energy and evaporation', exact: true })
	).toHaveCount(0);
	await expect(runtime(page)).not.toContainText('Supplies energy for evaporation; the next card');
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: width === 1440 ? 1100 : 1000 });
		await assertNoOverflow(page);
		await palace(page).screenshot({ path: `${artifacts}/concept-hint-${width}.png` });
		const audit = await new AxeBuilder({ page }).include('[data-memory-palace]').analyze();
		audits.push({ phase: 'recall-hint', width, violations: audit.violations });
	}
	await writeFile(`${artifacts}/accessibility.json`, JSON.stringify(audits, null, 2));
	const serious = audits
		.flatMap((audit) => audit.violations)
		.filter((violation) => {
			const impact = (violation as { impact?: string }).impact;
			return impact === 'critical' || impact === 'serious';
		});
	expect(serious).toEqual([]);
});

test('the article and fixed route stay readable without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block',
		viewport: { width: 390, height: 844 }
	});
	try {
		const origin = new URL(baseURL!).origin;
		await context.route('**/*', (route) => {
			const url = new URL(route.request().url());
			return url.origin === origin || !['http:', 'https:'].includes(url.protocol)
				? route.continue()
				: route.abort('blockedbyclient');
		});
		const page = await context.newPage();
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		// Chromium's script-disabled automation does not consistently expose noscript
		// descendants through DOM text. Verify this fallback in the delivered HTML.
		expect(await response!.text()).toContain('The house above is a static illustration');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('A Place for Every Idea');
		await expect(runtime(page)).toHaveCount(0);
		const staticHouse = palace(page).getByRole('img', {
			name: 'A Calcutta house with twelve numbered landmarks, from its garden gate to its roof terrace',
			exact: true
		});
		await expect(staticHouse).toBeVisible();
		await expect(staticHouse).toHaveAttribute(
			'src',
			'/images/visualizations/memory-palace/social.png'
		);
		await expect
			.poll(() => staticHouse.evaluate((element) => (element as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		await expect(page.locator('.article-prose')).toContainText(
			'staircase, landing, study desk, terrace'
		);
		await expect(page.getByRole('heading', { name: /ten words/iu })).toBeVisible();
		await assertNoOverflow(page);
	} finally {
		await context.close();
	}
});
