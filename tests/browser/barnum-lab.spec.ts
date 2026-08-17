import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Browser,
	type Locator,
	type Page,
	type Request as PlaywrightRequest
} from '@playwright/test';

const articlePath = '/blog/visualizations/the-profile-that-knows-almost-nothing-about-you';
const stageLabels = [
	'Start with almost nothing',
	'Add four clues',
	'Watch the reading sharpen',
	'Feed the reader',
	'Lift the floorboards'
] as const;
const guidedStages = [
	'baseline',
	'four-clues',
	'apparent-sharpening',
	'feedback-and-counterfactual',
	'reveal'
] as const;

type RuntimeDiagnostics = {
	errors: string[];
	failedRequests: string[];
};

function lab(page: Page): Locator {
	return page.getByTestId('barnum-lab');
}

function ignorablePlatformRequest(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.pathname.startsWith('/_vercel/') ||
			parsed.pathname === '/service-worker.js' ||
			parsed.hostname === 'va.vercel-scripts.com' ||
			/(?:^|\/)favicon(?:\.|$)/iu.test(parsed.pathname)
		);
	} catch {
		return false;
	}
}

function observeRuntime(page: Page): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = { errors: [], failedRequests: [] };
	page.on('pageerror', (error) => diagnostics.errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const text = message.text();
		const hydrationWarning = /hydrat(?:e|ion|ing)|server-rendered html|mismatch/iu.test(text);
		if (message.type() !== 'error' && !hydrationWarning) return;
		if (/\/_vercel\/(?:insights|speed-insights)\//iu.test(text)) return;
		if (ignorablePlatformRequest(message.location().url || 'http://local.invalid/')) return;
		diagnostics.errors.push(`${message.type()}: ${text}`);
	});
	page.on('requestfailed', (request) => {
		if (ignorablePlatformRequest(request.url())) return;
		const reason = request.failure()?.errorText ?? 'unknown failure';
		if (reason === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
		diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
	});
	page.on('response', (response) => {
		if (response.status() < 400 || ignorablePlatformRequest(response.url())) return;
		diagnostics.failedRequests.push(
			`${response.request().method()} ${response.url()} — HTTP ${response.status()}`
		);
	});
	return diagnostics;
}

async function openLab(page: Page): Promise<Locator> {
	await page.route('https://va.vercel-scripts.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	expect(response?.ok()).toBe(true);
	const root = lab(page);
	await expect(root).toHaveCount(1);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(root.getByTestId('assumption-ledger')).toBeVisible();
	return root;
}

async function expectStep(root: Locator, step: number): Promise<void> {
	await expect(root).toHaveAttribute('data-stage', guidedStages[step - 1]);
	await expect(root.getByText(`Step ${step} of 5`, { exact: true })).toBeVisible();
	await expect(
		root
			.getByRole('navigation', { name: 'Demonstration progress' })
			.getByText(stageLabels[step - 1])
	).toBeAttached();
}

async function rateVisibleStatements(
	root: Locator,
	ratings: readonly ('does-not-fit' | 'partly-fits' | 'fits' | 'too-vague')[] = ['partly-fits']
): Promise<void> {
	const cards = root.locator('.reading-card:visible:has(fieldset.rating)');
	for (let index = 0; index < (await cards.count()); index += 1) {
		const card = cards.nth(index);
		const checked = card.locator('fieldset.rating input:checked');
		if ((await checked.count()) > 0) continue;
		await card.locator(`fieldset.rating input[value="${ratings[index % ratings.length]}"]`).check();
	}
}

async function continueGuided(root: Locator): Promise<void> {
	const control = root.getByTestId('barnum-continue');
	await expect(control).toBeEnabled();
	await control.click();
}

async function castAllLaterClaims(root: Locator): Promise<void> {
	const castClaims = root.locator('#barnum-cast-claims .reading-card');
	const castNext = root.getByTestId('barnum-cast-next');
	await expect(castClaims).toHaveCount(0);
	for (let count = 1; count <= 4; count += 1) {
		await castNext.click();
		await expect(castClaims).toHaveCount(count);
	}
	await expect(castNext).toHaveCount(0);
	await expect(root.getByText(/All four additional sealed claims have been cast/iu)).toBeVisible();
}

async function beginGuided(root: Locator): Promise<void> {
	await root.getByTestId('barnum-begin').click();
	await expectStep(root, 1);
}

async function advanceToReveal(root: Locator): Promise<void> {
	await beginGuided(root);
	await rateVisibleStatements(root, ['does-not-fit', 'too-vague', 'fits']);
	await continueGuided(root);

	await expectStep(root, 2);
	await root.locator('#barnum-country').selectOption('bangladesh');
	await root.locator('#barnum-city_context').selectOption('dhaka');
	await root.locator('#barnum-language').selectOption('english');
	await root.locator('#barnum-planning_style').selectOption('loose-plan');
	await continueGuided(root);

	await expectStep(root, 3);
	const echoCount = await root.locator('.reading-card[data-basis="direct-echo"]').count();
	expect(echoCount).toBeLessThanOrEqual(1);
	if (echoCount === 0) {
		await expect(root.getByText(/conflict.*sealed|sealed.*conflict/iu)).toBeVisible();
	}
	await expect(root.getByTestId('barnum-continue')).toBeDisabled();
	await castAllLaterClaims(root);
	await expect(root.getByTestId('barnum-continue')).toBeEnabled();
	await rateVisibleStatements(root, ['partly-fits', 'fits', 'does-not-fit']);
	await continueGuided(root);

	await expectStep(root, 4);
	await rateVisibleStatements(root, ['fits', 'partly-fits', 'too-vague']);
	const derivative = root.getByRole('button', {
		name: /Create (?:the )?(?:adaptive|feedback)|Use (?:my )?feedback/iu
	});
	if ((await derivative.count()) > 0 && (await derivative.first().isVisible())) {
		await derivative.first().click();
	}
	const counterfactual = root.getByRole('button', {
		name: /Change every demographic clue|Apply (?:the )?demographic counterfactual/iu
	});
	await expect(counterfactual).toBeVisible();
	await counterfactual.click();
	await expect(root.getByText(/100% semantic-ID overlap/iu)).toBeVisible();
	await continueGuided(root);

	await expectStep(root, 5);
}

async function storageSnapshot(page: Page) {
	return page.evaluate(async () => ({
		local: Object.fromEntries(
			Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
				.filter((key): key is string => key !== null)
				.map((key) => [key, localStorage.getItem(key)])
		),
		session: Object.fromEntries(
			Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
				.filter((key): key is string => key !== null)
				.map((key) => [key, sessionStorage.getItem(key)])
		),
		indexedDatabases:
			typeof indexedDB.databases === 'function'
				? (await indexedDB.databases()).map((database) => database.name ?? '')
				: []
	}));
}

async function expectNoSeriousAxeViolations(page: Page, state: string): Promise<void> {
	const accessibility = await new AxeBuilder({ page })
		.include('[data-testid="barnum-lab"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const seriousViolations = accessibility.violations.filter((violation) =>
		['serious', 'critical'].includes(violation.impact ?? '')
	);
	expect(seriousViolations, `${state} has serious or critical Axe violations`).toEqual([]);
}

async function assertNoJavaScriptFallback(browser: Browser, baseURL: string): Promise<void> {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		await expect(
			page.getByRole('heading', {
				level: 1,
				name: 'The Profile That Knows Almost Nothing About You',
				exact: true
			})
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'The reading, without the machinery', exact: true })
		).toBeVisible();
		await expect(page.getByText(/Fit is not distinctiveness\./iu).first()).toBeVisible();
		await expect(page.getByRole('heading', { name: 'The many-guesses model' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'A ten-question defence' })).toBeVisible();
		await expect(page.getByText(/uses no runtime AI or external API/iu)).toBeVisible();
		await expect(page.locator('a[href="https://doi.org/10.1037/h0059240"]').first()).toBeVisible();
	} finally {
		await context.close();
	}
}

test('SSR and no-JavaScript retain the ethical boundary, formula, field guide, and sources', async ({
	request,
	browser,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('The Profile That Knows Almost Nothing About You');
	expect(html).toContain('data-testid="barnum-lab"');
	expect(html).toContain('data-testid="assumption-ledger"');
	expect(html).toContain('The reading, without the machinery');
	expect(html).toContain('Fit is not distinctiveness.');
	expect(html).toContain('1 − (1 − <var>p</var>)<sup><var>n</var></sup>');
	expect(html).toContain('10.1037/h0059240');
	expect(html).toContain('10.2466/pr0.1985.57.2.367');
	expect(html).toContain('10.1177/00986283241240454');
	await assertNoJavaScriptFallback(browser, baseURL ?? 'http://127.0.0.1:4351');
});

test('the full assumption ledger precedes interaction and keeps all demo defaults unconfirmed', async ({
	page
}) => {
	const diagnostics = observeRuntime(page);
	const root = await openLab(page);
	await expect(root).toHaveAttribute('data-analytics', 'disabled');
	await expect(root).toHaveAttribute('data-no-track', 'true');
	const ledger = root.getByTestId('assumption-ledger');
	await expect(ledger.getByRole('heading', { name: 'Assumptions in play' })).toBeVisible();
	await expect(ledger.getByText('Current tab memory only', { exact: true })).toBeVisible();
	for (const [label, value] of [
		['Country', 'India'],
		['City or place context', 'Kolkata'],
		['Language(s) used most', 'Bengali + English']
	] as const) {
		const row = ledger.locator('.wide-ledger tbody tr').filter({ hasText: label });
		await expect(row).toContainText(value);
		await expect(row).toContainText(/demo default, not confirmed/iu);
	}
	for (const label of ['Age band', 'Gender']) {
		const row = ledger.locator('.wide-ledger tbody tr').filter({ hasText: label });
		await expect(row).toContainText('Prefer not to say');
		await expect(row).toContainText(/demo default, not confirmed/iu);
	}
	await expect(
		ledger.getByText(/does not know your character, motives, intelligence/iu)
	).toBeVisible();

	const order = await root.evaluate((element) => {
		const ledgerElement = element.querySelector('[data-testid="assumption-ledger"]');
		const firstControl = Array.from(
			element.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href]')
		).find((control) => !ledgerElement?.contains(control));
		return Boolean(
			ledgerElement &&
			firstControl &&
			ledgerElement.compareDocumentPosition(firstControl) & Node.DOCUMENT_POSITION_FOLLOWING
		);
	});
	expect(order, 'the complete ledger must come before the first lab control').toBe(true);

	await beginGuided(root);
	const progress = root.getByRole('navigation', { name: 'Demonstration progress' });
	await expect(progress.locator('li')).toHaveCount(5);
	for (const label of stageLabels) await expect(progress.getByText(label)).toBeAttached();
	await expect(root.getByTestId('barnum-reset')).toBeVisible();
	await root.getByTestId('barnum-reset').click();
	await expect(root.getByText(/No personality test\s+is being performed/iu)).toBeVisible();
	expect(diagnostics).toEqual({ errors: [], failedRequests: [] });
});

test('all five guided steps preserve ratings, expose direct echoes and retain misses in the audit', async ({
	page
}) => {
	const root = await openLab(page);
	await beginGuided(root);
	await expect(root.getByRole('button', { name: /Reveal the mechanism now/iu })).toBeVisible();
	await rateVisibleStatements(root, ['does-not-fit', 'too-vague', 'fits']);
	await continueGuided(root);

	await expectStep(root, 2);
	await root.getByTestId('barnum-back').click();
	await expectStep(root, 1);
	await expect(
		root.locator('.reading-card').first().locator('input[value="does-not-fit"]')
	).toBeChecked();
	await continueGuided(root);
	await expectStep(root, 2);
	await expect(root.locator('#barnum-country')).toHaveValue('india');
	await root.locator('#barnum-country').selectOption('bangladesh');
	await expect(root.locator('#barnum-city_context')).toHaveValue('');
	await expect(root.locator('#barnum-city_context option:checked')).toHaveText('No answer');
	const clearedCityRow = root
		.getByTestId('assumption-ledger')
		.locator('.wide-ledger tbody tr')
		.filter({ hasText: 'City or place context' });
	await expect(clearedCityRow).toHaveCount(1);
	await expect(clearedCityRow).toContainText('No answer');
	await expect(clearedCityRow).toContainText('Cleared after country changed');
	await expect(
		root.getByTestId('assumption-ledger').getByText('Kolkata', { exact: true })
	).toHaveCount(0);
	await root.locator('#barnum-planning_style').selectOption('loose-plan');
	await expect(
		root.getByTestId('assumption-ledger').getByText('Selected by you', { exact: true }).first()
	).toBeVisible();
	await expect(root.getByText(/stage prop, not probability/iu)).toBeVisible();
	await continueGuided(root);

	await expectStep(root, 3);
	const directEchoCount = await root.locator('.reading-card[data-basis="direct-echo"]').count();
	expect(directEchoCount).toBeLessThanOrEqual(1);
	if (directEchoCount === 0) {
		await expect(root.getByText(/conflict.*sealed|sealed.*conflict/iu)).toBeVisible();
	}
	await expect(root.getByTestId('barnum-continue')).toBeDisabled();
	await castAllLaterClaims(root);
	await expect(root.getByTestId('barnum-continue')).toBeEnabled();
	await rateVisibleStatements(root);
	await continueGuided(root);

	await expectStep(root, 4);
	await expect
		.poll(() =>
			root.locator('.reading-card[data-adaptation]:not([data-adaptation="sealed"])').count()
		)
		.toBeGreaterThan(0);
	await expect(root.getByText(/Feedback reuse/iu).first()).toBeVisible();
	await rateVisibleStatements(root, ['fits', 'partly-fits']);
	const derivative = root.getByRole('button', {
		name: /Create (?:the )?(?:adaptive|feedback)|Use (?:my )?feedback/iu
	});
	if ((await derivative.count()) > 0 && (await derivative.first().isVisible())) {
		await derivative.first().click();
	}
	await root
		.getByRole('button', {
			name: /Change every demographic clue|Apply (?:the )?demographic counterfactual/iu
		})
		.click();
	await expect(root.getByText(/100% semantic-ID overlap/iu)).toBeVisible();
	await continueGuided(root);

	await expectStep(root, 5);
	await expect(root.getByText(/The profile did not read your mind/iu)).toBeVisible();
	const audit = root.getByTestId('statement-audit');
	await audit.locator(':scope > summary').click();
	await expect(audit.getByText(/Current recorded judgment:\s*does not fit/iu)).toBeVisible();
	await expect(audit.getByText(/Current recorded judgment:\s*too vague/iu)).toBeVisible();
	await expect(audit.getByRole('heading', { name: 'Append-only event trail' })).toBeVisible();
	expect(
		await audit.getByText('Statement first shown', { exact: true }).count()
	).toBeGreaterThanOrEqual(7);
	const baselineTrace = audit.locator('.reading-card').first().locator('details.trace');
	await baselineTrace.locator(':scope > summary').click();
	await expect(
		baselineTrace.locator('dl > div').filter({ hasText: 'Presentation status' })
	).toContainText(/shown to the visitor as baseline/iu);
	await expect(
		baselineTrace.locator('dl > div').filter({ hasText: 'First presentation event' })
	).not.toContainText('None');
	if (directEchoCount > 0) await expect(audit.getByText(/direct echo/iu).first()).toBeVisible();
});

test('answers and ratings never enter requests, storage, cookies, analytics payloads, or the URL', async ({
	page,
	context
}) => {
	await page.addInitScript(() => {
		const audit = {
			beacons: [] as { url: string; data: string }[],
			forms: [] as string[],
			analytics: [] as string[]
		};
		Object.defineProperty(window, '__barnumPrivacyAudit', { value: audit });
		const originalBeacon = navigator.sendBeacon?.bind(navigator);
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: (url: string | URL, data?: BodyInit | null) => {
				audit.beacons.push({ url: String(url), data: String(data ?? '') });
				return originalBeacon ? originalBeacon(url, data) : true;
			}
		});
		const originalSubmit = HTMLFormElement.prototype.submit;
		HTMLFormElement.prototype.submit = function () {
			audit.forms.push(this.action);
			return originalSubmit.call(this);
		};
		for (const name of ['dataLayer', '_paq'] as const) {
			const existing = (window as unknown as Record<string, unknown>)[name];
			if (Array.isArray(existing)) {
				const originalPush = existing.push.bind(existing);
				existing.push = (...items: unknown[]) => {
					audit.analytics.push(JSON.stringify(items));
					return originalPush(...items);
				};
			}
		}
	});
	const root = await openLab(page);
	await page.waitForLoadState('load');
	await page.waitForTimeout(250);
	const initialUrl = page.url();
	const beforeStorage = await storageSnapshot(page);
	const beforeCookies = await context.cookies();
	const actionRequests: { method: string; url: string; body: string }[] = [];
	const recordRequest = (request: PlaywrightRequest) => {
		if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
			actionRequests.push({
				method: request.method(),
				url: request.url(),
				body: request.postData() ?? ''
			});
		}
	};
	page.on('request', recordRequest);

	await beginGuided(root);
	await rateVisibleStatements(root, ['too-vague']);
	await continueGuided(root);
	await root.locator('#barnum-country').selectOption('bangladesh');
	await root.locator('#barnum-city_context').selectOption('dhaka');
	await root.locator('#barnum-language').selectOption('english');
	await root.locator('#barnum-planning_style').selectOption('loose-plan');
	await expect(root.locator('#barnum-planning_style')).toHaveValue('loose-plan');
	await root.getByText('Add more harmless clues', { exact: true }).click();
	await root.locator('#barnum-age_band').selectOption('65-plus');
	await root.locator('#barnum-gender').selectOption('non-binary');
	await root.locator('#barnum-self_reported_device').selectOption('desktop');
	await root.locator('#barnum-preferred_shape').selectOption('triangle');
	await root.locator('#barnum-decision_pace').selectOption('usually-quick');

	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	await root.getByLabel('Show provenance', { exact: true }).check();
	await root.getByLabel('Feedback adaptation', { exact: true }).uncheck();
	await root.getByLabel('Surface context dressing', { exact: true }).uncheck();
	await root.locator('#open-statement-count').fill('15');
	const wordingControls = root.getByRole('group', { name: 'Wording', exact: true });
	await wordingControls.locator('select').nth(0).selectOption('high');
	await wordingControls.locator('select').nth(1).selectOption('moderate');
	await page.waitForTimeout(250);
	page.off('request', recordRequest);

	expect(page.url()).toBe(initialUrl);
	expect(await storageSnapshot(page)).toEqual(beforeStorage);
	expect(await context.cookies()).toEqual(beforeCookies);
	const audit = await page.evaluate(
		() =>
			(
				window as unknown as {
					__barnumPrivacyAudit: {
						beacons: { url: string; data: string }[];
						forms: string[];
						analytics: string[];
					};
				}
			).__barnumPrivacyAudit
	);
	expect(audit.forms).toEqual([]);
	const sentinels = [
		'bangladesh',
		'dhaka',
		'english',
		'loose-plan',
		'too-vague',
		'65-plus',
		'non-binary',
		'desktop',
		'triangle',
		'usually-quick',
		'moderate'
	];
	expect(
		actionRequests.filter(
			(request) =>
				!ignorablePlatformRequest(request.url) && !['GET', 'HEAD'].includes(request.method)
		),
		'local controls must not trigger state-changing requests'
	).toEqual([]);
	for (const outbound of [...actionRequests, ...audit.beacons]) {
		const serialized = JSON.stringify(outbound).toLocaleLowerCase('en');
		for (const sentinel of sentinels) {
			expect(serialized, `${sentinel} leaked through ${serialized}`).not.toContain(sentinel);
		}
	}
	for (const payload of audit.analytics) {
		for (const sentinel of sentinels)
			expect(payload.toLocaleLowerCase('en')).not.toContain(sentinel);
	}
});

test('reveal opens the comparison lab, honest probability model, provenance, and generic checklist', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					(window as unknown as { __barnumClipboard?: string }).__barnumClipboard = value;
				}
			}
		});
	});
	const root = await openLab(page);
	await advanceToReveal(root);
	const fitPanel = root.getByRole('heading', { name: 'Your fit judgments' }).locator('..');
	await expect(fitPanel).toContainText('not a personality-accuracy score');
	await root.getByLabel('Many people', { exact: true }).check();
	await expect(
		root.getByText(/Your estimated breadth — not measured population coverage/iu)
	).toBeVisible();
	await root.getByLabel('Distinctiveness numeric value').fill('2');
	await root.getByLabel('Distinctiveness numeric value').press('Tab');
	await expect(root.locator('output[for="barnum-distinctiveness"]')).toHaveText('2 / 5');
	await root.getByRole('button', { name: /Open the laboratory/iu }).click();
	await expect(
		root.getByRole('heading', { name: 'Three views of the same local machine' })
	).toBeVisible();
	await expect(root.getByTestId('barnum-checklist')).toHaveCount(1);
	await expect(root.getByTestId('barnum-copy-checklist')).toHaveCount(1);
	const namedExperiments = root.getByRole('group', {
		name: 'Named laboratory experiments'
	});
	await expect(namedExperiments.getByRole('button')).toHaveCount(4);
	for (const experiment of [
		'Same deck, different demographics',
		'One guess versus twelve',
		'Feedback off versus on',
		'Hedges off versus on'
	]) {
		await expect(
			namedExperiments.getByRole('button', { name: new RegExp(experiment, 'iu') })
		).toBeVisible();
	}
	for (const heading of ['Blind', 'Dressed', 'Adaptive']) {
		await expect(root.getByRole('heading', { name: heading, exact: true })).toBeVisible();
	}
	await expect(root.getByRole('heading', { name: 'Remove one trick at a time' })).toBeVisible();
	await root.getByText('Advanced controls', { exact: true }).click();
	await root.getByLabel('Show provenance', { exact: true }).check();
	const openAudit = root.getByTestId('barnum-open-audit').getByTestId('statement-audit');
	const originalEchoCount = await openAudit
		.locator('.reading-card[data-basis="direct-echo"]')
		.count();
	await root.getByTestId('barnum-self-report-counterfactual').click();
	const selfReportBranch = root.getByTestId('barnum-self-report-branch');
	await expect(
		selfReportBranch.getByRole('heading', {
			name: 'The answer changed; the guided echo was not overwritten'
		})
	).toBeVisible();
	await expect(selfReportBranch).toContainText('Original guided echo');
	await expect(selfReportBranch).toContainText('Current branch echo');
	await expect(selfReportBranch).toContainText(/sealed generic core\s+IDs remain unchanged/iu);
	await expect(selfReportBranch.locator('code').nth(1)).not.toHaveText(
		'compatibility-omitted reserved slot'
	);
	await expect
		.poll(() => openAudit.locator('.reading-card[data-basis="direct-echo"]').count())
		.toBe(originalEchoCount + 1);
	await expect(
		root.locator('.comparison .reading-card[data-basis="direct-echo"] .explanation').first()
	).toContainText(/Source: your answer to “How tightly do you plan\?”.*did not discover it/iu);
	await openAudit.locator(':scope > summary').click();
	await expect(openAudit.getByText(/planning_style = /iu).last()).toBeVisible();

	await root.getByRole('button', { name: /One guess versus twelve/iu }).click();
	await expect(root.getByTestId('barnum-many-guesses-experiment')).toContainText(
		/formulas and natural frequencies/iu
	);
	const probability = root.getByRole('heading', {
		name: 'The probability of throwing enough darts'
	});
	await expect(probability).toBeVisible();
	await root.getByLabel('Probability p numeric value').fill('0.25');
	await root.getByLabel('Probability p numeric value').press('Tab');
	await root.getByLabel('Number of claims numeric value').fill('4');
	await root.getByLabel('Number of claims numeric value').press('Tab');
	const oneVsTwelve = root.getByTestId('barnum-one-vs-twelve');
	await expect(
		oneVsTwelve.getByRole('heading', { name: /one claim versus twelve/iu })
	).toBeVisible();
	await expect(oneVsTwelve).toContainText('One claim');
	await expect(oneVsTwelve).toContainText('25.0%');
	await expect(oneVsTwelve).toContainText('Twelve claims');
	await expect(oneVsTwelve).toContainText('96.8%');
	await expect(root.locator('.probability .results')).toContainText('1.00');
	await expect(root.locator('.probability .results')).toContainText('68.4%');
	await expect(
		root.getByText(/Illustrative assumptions, not measured Barnum-effect rates/iu)
	).toBeVisible();
	await root.getByText('More probability controls', { exact: true }).click();
	await expect(
		root.getByText(/It is not the probability\s+that someone belongs to A/iu)
	).toBeVisible();

	const checklist = root.getByTestId('barnum-checklist');
	await expect(checklist.locator('li')).toHaveCount(10);
	await root.getByTestId('barnum-copy-checklist').click();
	await expect(checklist.getByRole('status')).toContainText(
		'contains no selections, ratings, or session data'
	);
	const copied = await page.evaluate(
		() => (window as unknown as { __barnumClipboard?: string }).__barnumClipboard ?? ''
	);
	expect(copied).toContain('A field guide for the next reading');
	expect(copied.split('\n')).toHaveLength(11);
	for (const privateValue of ['Bangladesh', 'Dhaka', 'English', 'Loose plan', 'too-vague']) {
		expect(copied).not.toContain(privateValue);
	}
});

test('a reproducibility code restores a deck after reset and reload, then regenerates for a new seed', async ({
	page
}) => {
	let root = await openLab(page);
	await beginGuided(root);
	const code = root.locator('.stage-heading code');
	await expect(root.locator('.stage-heading')).toContainText('Reproducibility code');
	await expect(code).toHaveText(/^BL1-G100-C100-[0-9A-F]{8}-[0-9A-F]{16}-[0-9A-F]{6}$/u);
	const originalCode = (await code.textContent()) ?? '';
	const originalSentences = await root.locator('.reading-card .sentence').allTextContents();
	expect(originalSentences).toHaveLength(3);
	await rateVisibleStatements(root, ['fits']);

	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	await root.getByTestId('barnum-reset').click();
	await root.getByRole('button', { name: 'Reset immediately', exact: true }).click();
	await expect(root).toHaveAttribute('data-stage', 'intro');
	await expect(root.locator('.live-region')).toContainText(
		'The lab discarded its current in-memory state.'
	);

	await page.reload({ waitUntil: 'domcontentloaded' });
	root = lab(page);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(root).toHaveAttribute('data-stage', 'intro');
	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	const replayInput = root.getByTestId('barnum-replay-code');
	await expect(replayInput).toHaveAccessibleName('Reproducibility code');
	await replayInput.fill(originalCode);
	await root.getByTestId('barnum-load-replay').click();
	await expect(root.locator('.replay-feedback[role="status"]')).toContainText(
		/Code valid.*before the current in-memory trail is cleared/iu
	);
	let replacementConfirmation = root.getByTestId('barnum-deck-replacement-confirmation');
	await expect(replacementConfirmation).toBeVisible();
	await expect(replacementConfirmation.getByRole('heading')).toBeFocused();
	await expect(replacementConfirmation).toContainText(
		/clears the current choices, ratings, branches, derivatives, and append-only audit/iu
	);
	await expect(replacementConfirmation).toContainText(
		/genuinely fresh Step 1.*no visitor actions are synthesized.*code itself contains no answers or ratings/iu
	);
	await expect(root).toHaveAttribute('data-stage', 'open-lab');
	await root.getByTestId('barnum-confirm-deck-replacement').click();
	await expect(replacementConfirmation).toHaveCount(0);
	await expectStep(root, 1);
	await expect(root.locator('.live-region')).toContainText(
		/opened its deck at Step 1 with a fresh in-memory audit trail.*prior choices, ratings, and branches were cleared/iu
	);
	await expect(code).toHaveText(originalCode);
	await expect
		.poll(() => root.locator('.reading-card .sentence').allTextContents())
		.toEqual(originalSentences);

	await root.getByTestId('barnum-reveal-now').click();
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	await root.getByRole('button', { name: 'Create a new seed', exact: true }).click();
	replacementConfirmation = root.getByTestId('barnum-deck-replacement-confirmation');
	await expect(replacementConfirmation).toBeVisible();
	await expect(replacementConfirmation.getByRole('heading')).toBeFocused();
	await expect(replacementConfirmation).toContainText(
		/Creating a new seed clears the current choices, ratings, branches, derivatives, and append-only audit/iu
	);
	await expect(replacementConfirmation).toContainText(
		/genuinely fresh Step 1.*no visitor actions are synthesized/iu
	);
	await expect(root.getByTestId('barnum-replay-code')).toHaveValue(originalCode);
	await root.getByTestId('barnum-confirm-deck-replacement').click();
	await expect(replacementConfirmation).toHaveCount(0);
	await expectStep(root, 1);
	await expect(root.locator('.live-region')).toContainText(
		/new deterministic deck opened at Step 1 with a fresh in-memory audit trail.*prior choices, ratings, and branches were cleared/iu
	);
	const regeneratedCode = (await code.textContent()) ?? '';
	expect(regeneratedCode).not.toBe(originalCode);
	await expect(code).toHaveText(regeneratedCode);
	await expect(root.locator('.reading-card .sentence')).toHaveCount(3);
});

test('reset, reload, route remount, and persisted page restoration cannot resurrect a session', async ({
	page
}) => {
	let root = await openLab(page);
	await beginGuided(root);
	await rateVisibleStatements(root, ['fits']);
	await continueGuided(root);
	await root.locator('#barnum-country').selectOption('bangladesh');
	await expect(root.getByTestId('assumption-ledger')).toContainText('Bangladesh');

	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	});
	await expect(
		root.getByRole('button', { name: /Begin (?:the )?(?:demonstration|experiment)/iu })
	).toBeVisible();
	await expect(root.getByTestId('assumption-ledger')).not.toContainText('Bangladesh');

	await beginGuided(root);
	await rateVisibleStatements(root, ['fits']);
	await page.reload({ waitUntil: 'domcontentloaded' });
	root = lab(page);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(
		root.getByRole('button', { name: /Begin (?:the )?(?:demonstration|experiment)/iu })
	).toBeVisible();

	await beginGuided(root);
	await page.goto('/blog/visualizations', { waitUntil: 'domcontentloaded' });
	await page.goBack({ waitUntil: 'domcontentloaded' });
	root = lab(page);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(
		root.getByRole('button', { name: /Begin (?:the )?(?:demonstration|experiment)/iu })
	).toBeVisible();
});

test('keyboard focus, Axe, reduced motion, and forced colours preserve the guided path', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const root = await openLab(page);
	const begin = root.getByRole('button', { name: /Begin (?:the )?(?:demonstration|experiment)/iu });
	await begin.focus();
	await page.keyboard.press('Enter');
	await expectStep(root, 1);
	await expect(root.locator('#guided-stage-heading')).toBeFocused();

	const firstRating = root.locator('.reading-card:visible fieldset.rating').first();
	const firstOption = firstRating.locator('input').first();
	await firstOption.focus();
	await page.keyboard.press('ArrowRight');
	await expect(firstRating.locator('input:checked')).toHaveValue('partly-fits');
	await rateVisibleStatements(root);

	const moving = await root.evaluate((element) => {
		const duration = (value: string): number =>
			Math.max(
				0,
				...value.split(',').map((part) => {
					const parsed = Number.parseFloat(part);
					return part.trim().endsWith('ms') ? parsed : parsed * 1000;
				})
			);
		return Array.from(element.querySelectorAll<HTMLElement>('*'))
			.filter((node) => node.getClientRects().length > 0)
			.map((node) => {
				const style = getComputedStyle(node);
				return {
					name: node.getAttribute('data-testid') ?? node.className ?? node.tagName,
					animation: duration(style.animationDuration),
					transition: duration(style.transitionDuration)
				};
			})
			.filter((entry) => entry.animation > 1 || entry.transition > 1);
	});
	expect(moving).toEqual([]);

	await expectNoSeriousAxeViolations(page, 'guided baseline in the light theme');

	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await firstRating.locator('input[value="fits"]').check();
	await expect(firstRating.locator('input[value="fits"]')).toBeChecked();
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);

	await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	const earlyRevealAudit = root.getByTestId('statement-audit');
	await earlyRevealAudit.locator(':scope > summary').click();
	await expect(
		earlyRevealAudit.getByText('Sealed statement not shown', { exact: true })
	).toHaveCount(4);
	const abandonedTrace = earlyRevealAudit.locator('.reading-card').nth(3).locator('details.trace');
	await abandonedTrace.locator(':scope > summary').click();
	await expect(
		abandonedTrace.locator('dl > div').filter({ hasText: 'Presentation status' })
	).toContainText(/sealed but not shown.*abandoned on early reveal/iu);
	await page.locator('#desktop-theme').selectOption('night');
	await expectNoSeriousAxeViolations(page, 'reveal in the night theme');
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	await expectNoSeriousAxeViolations(page, 'expanded open lab in the night theme');
	await page.locator('#desktop-theme').selectOption('light');
	await expectNoSeriousAxeViolations(page, 'expanded open lab in the light theme');
});

test('phone, short-landscape, tablet, and desktop layouts stay bounded and focus mode restores focus', async ({
	page,
	browser,
	baseURL
}, testInfo) => {
	await page.addInitScript(() => {
		Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
			configurable: true,
			get: () => false
		});
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	await page.emulateMedia({ reducedMotion: 'reduce' });
	let root = await openLab(page);
	for (const viewport of [
		{ width: 320, height: 800 },
		{ width: 375, height: 812 },
		{ width: 800, height: 360 },
		{ width: 768, height: 1024 },
		{ width: 1024, height: 768 },
		{ width: 1440, height: 900 }
	] as const) {
		await page.setViewportSize(viewport);
		root = lab(page);
		await root.scrollIntoViewIfNeeded();
		const geometry = await root.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			const shortControls = Array.from(
				element.querySelectorAll<HTMLElement>('button, select, summary')
			)
				.filter(
					(control) => control.getClientRects().length > 0 && !control.hasAttribute('disabled')
				)
				.map((control) => ({
					name:
						control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName,
					height: control.getBoundingClientRect().height
				}))
				.filter((control) => control.height < 43.5);
			return {
				left: bounds.left,
				right: bounds.right,
				viewportWidth: document.documentElement.clientWidth,
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				rootOverflow: element.scrollWidth - element.clientWidth,
				shortControls
			};
		});
		expect(geometry.left).toBeGreaterThanOrEqual(-1.5);
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1.5);
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.rootOverflow).toBeLessThanOrEqual(1);
		expect(geometry.shortControls).toEqual([]);
		if (viewport.width <= 375) {
			await expect(root.locator('.narrow-ledger')).toBeVisible();
			await expect(root.locator('.wide-ledger')).toBeHidden();
		}
		if (viewport.width === 800) {
			const sticky = await root
				.getByTestId('assumption-ledger')
				.evaluate((element) => getComputedStyle(element).position);
			expect(sticky).not.toBe('sticky');
		}
	}

	await page.setViewportSize({ width: 1440, height: 900 });
	const themeSelect = page.locator('#desktop-theme');
	await expect(themeSelect).toBeVisible();
	await expect(themeSelect).toBeEnabled();
	await themeSelect.selectOption('light');
	const lightTheme = await root.evaluate((element) => ({
		theme: document.documentElement.dataset.theme,
		background: getComputedStyle(element).backgroundColor,
		foreground: getComputedStyle(element).color
	}));
	expect(lightTheme.theme).toBe('light');
	await themeSelect.selectOption('night');
	const darkTheme = await root.evaluate((element) => ({
		theme: document.documentElement.dataset.theme,
		background: getComputedStyle(element).backgroundColor,
		foreground: getComputedStyle(element).color
	}));
	expect(darkTheme.theme).toBe('night');
	expect(darkTheme.background).not.toBe(lightTheme.background);
	expect(darkTheme.foreground).not.toBe(lightTheme.foreground);

	const devtools = await page.context().newCDPSession(page);
	await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
	expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeCloseTo(2, 1);
	await expect(root.getByTestId('barnum-begin')).toBeVisible();
	await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

	await page.setViewportSize({ width: 390, height: 844 });
	const trigger = root.getByTestId('barnum-fullscreen');
	await expect(trigger).toHaveAccessibleName('Open Barnum laboratory focus mode');
	await expect(trigger).toBeVisible();
	await trigger.click();
	await expect(root).toHaveAttribute('data-expanded', 'true');
	const exit = root.getByTestId('barnum-fullscreen');
	await expect(exit).toHaveAccessibleName('Exit Barnum laboratory focus mode');
	const focusGeometry = await root.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			position: getComputedStyle(element).position,
			top: bounds.top,
			left: bounds.left,
			right: bounds.right,
			width: document.documentElement.clientWidth,
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
	expect(focusGeometry.position).not.toBe('fixed');
	expect(focusGeometry.top).toBeGreaterThanOrEqual(-1);
	expect(focusGeometry.left).toBeCloseTo(0, 1);
	expect(focusGeometry.right).toBeCloseTo(focusGeometry.width, 1);
	expect(focusGeometry.documentOverflow).toBeLessThanOrEqual(1);
	await page.screenshot({
		animations: 'disabled',
		path: testInfo.outputPath('barnum-focus-mode-390x844.png')
	});
	await exit.click();
	await expect(root).toHaveAttribute('data-expanded', 'false');
	await expect(trigger).toBeFocused();

	const touchContext = await browser.newContext({
		baseURL: baseURL ?? 'http://127.0.0.1:4351',
		viewport: { width: 375, height: 812 },
		deviceScaleFactor: 2,
		hasTouch: true,
		isMobile: true,
		colorScheme: 'dark'
	});
	try {
		const touchPage = await touchContext.newPage();
		const touchRoot = await openLab(touchPage);
		expect(await touchPage.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
		await touchRoot.getByTestId('barnum-begin').tap();
		await expectStep(touchRoot, 1);
		expect(
			await touchPage.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBeLessThanOrEqual(1);
	} finally {
		await touchContext.close();
	}
});
