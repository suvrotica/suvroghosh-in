import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Locator,
	type Page,
	type Request as PlaywrightRequest
} from '@playwright/test';

const articlePath = '/blog/visualizations/the-profile-that-knows-almost-nothing-about-you';
const stageLabels = [
	'First impression',
	'A few clues',
	'Your reading',
	'One more pass',
	'How it worked'
] as const;
const forbiddenBeforeReveal = [
	'stage dressing',
	'sealed claim',
	'direct echo',
	'feedback reuse',
	'semantic ID',
	'reproducibility code',
	'From your answer',
	'Using only that selection',
	'stage prop',
	'not probability'
] as const;
const unrelatedAssetMarkers = [
	'artificial-life',
	'belousov-zhabotinsky',
	'brownian-motion',
	'domain-coloring',
	'double-pendulum',
	'fertilization-calcium',
	'gradient-descent',
	'hello-fragment',
	'hello-observable',
	'living-aperture',
	'monte-carlo',
	'neuron-zoo',
	'ray-marching',
	'reaction-diffusion',
	'spacetime-laboratory',
	'static-equilibrium',
	'weather-inside-the-nucleus'
] as const;

type RuntimeDiagnostics = { errors: string[]; failedRequests: string[] };
type RatingChoice = 'does-not-fit' | 'partly-fits' | 'fits' | 'too-vague';
type RequestRecord = {
	method: string;
	url: string;
	body: string;
	headers: Record<string, string>;
};
type PrivacyAudit = {
	beacons: Array<{ url: string; body: string }>;
	fetches: Array<{ url: string; body: string }>;
	xhrs: Array<{ method: string; url: string; body: string }>;
	forms: string[];
	clientErrors: string[];
	storageWrites: Array<{ storage: string; operation: string; key: string; value: string }>;
	indexedDbCalls: Array<{ operation: string; name: string }>;
	historyCalls: Array<{ operation: string; state: string; url: string }>;
	cookieWrites: string[];
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

async function expectStep(
	root: Locator,
	step: number,
	label = stageLabels[step - 1]
): Promise<void> {
	await expect(root.locator('.stage-heading > p')).toHaveText(`Step ${step} of 5`);
	const progress = root.getByRole('navigation', { name: 'Demonstration progress' });
	await expect(progress.getByText(label, { exact: true })).toBeAttached();
	await expect(progress.locator('li.current')).toContainText(label);
	await expect(root.locator('#guided-stage-heading')).toHaveText(label);
}

async function expectHeadingBelowHeader(page: Page, root: Locator): Promise<void> {
	const heading = root
		.locator('#guided-stage-heading:visible, #barnum-open-heading:visible')
		.first();
	await expect(heading).toBeFocused();
	const siteHeader = page.locator('.site-shell > header.sticky').first();
	const [headingBounds, headerBounds] = await Promise.all([
		heading.boundingBox(),
		siteHeader.boundingBox()
	]);
	expect(headingBounds, 'the current stage heading must have layout geometry').not.toBeNull();
	expect(headerBounds, 'the sticky site header must have layout geometry').not.toBeNull();
	expect(headingBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height + 12);
}

async function expectNoForbiddenCopy(root: Locator): Promise<void> {
	const text = (await root.innerText()).toLocaleLowerCase('en');
	for (const phrase of forbiddenBeforeReveal) {
		expect(text, `pre-reveal copy leaked “${phrase}”`).not.toContain(
			phrase.toLocaleLowerCase('en')
		);
	}
}

async function continueGuided(root: Locator): Promise<void> {
	const control = root.getByTestId('barnum-continue');
	await expect(control).toBeEnabled();
	await control.click();
	// Stage actions deliberately ignore duplicate activations for 180 ms.
	await root.page().waitForTimeout(190);
}

async function setRangeValue(root: Locator, selector: string, value: number): Promise<void> {
	await root.locator(selector).evaluate((element, nextValue) => {
		const input = element as HTMLInputElement;
		input.value = String(nextValue);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}

async function beginGuided(root: Locator): Promise<void> {
	await root.getByTestId('barnum-begin').click();
	await expectStep(root, 1);
	await expect(root.getByTestId('barnum-current-baseline')).toBeVisible();
	// The component's duplicate-activation guard lasts 180 ms.
	await root.page().waitForTimeout(190);
}

async function completeBaseline(
	root: Locator,
	ratings: readonly (RatingChoice | undefined)[] = [],
	inspect?: (card: Locator, index: number) => Promise<void>
): Promise<string[]> {
	const sentences: string[] = [];
	for (let index = 0; index < 3; index += 1) {
		const current = root.getByTestId('barnum-current-baseline');
		const card = current.locator('.reading-card');
		await expect(root.locator('.reading-card:visible')).toHaveCount(1);
		await expect(card.locator('header > p')).toHaveText(`Line ${index + 1} of 3`);
		if (index === 0) {
			await expect(root.getByTestId('barnum-baseline-history')).toHaveCount(0);
		} else {
			await expect(root.getByTestId('barnum-baseline-history').locator('li')).toHaveCount(index);
		}
		if (inspect) await inspect(card, index);
		sentences.push((await card.locator('.sentence').innerText()).trim());
		const rating = ratings[index];
		if (rating && (await card.locator('fieldset.rating input:checked').count()) === 0) {
			const ratingInput = card.locator(`fieldset.rating input[value="${rating}"]`);
			await card.locator(`fieldset.rating label:has(input[value="${rating}"])`).click();
			await expect(ratingInput).toBeChecked();
		}
		if (index === 2) break;

		const next = root.getByTestId('barnum-next-statement');
		await expect(next).toHaveText('Next statement');
		await next.click();
		await expect(current).toBeFocused();
		await expect(card.locator('header > p')).toHaveText(`Line ${index + 2} of 3`);
		await root.page().waitForTimeout(190);
	}
	await expect(root.getByTestId('barnum-next-statement')).toHaveCount(0);
	await expect(root.getByTestId('barnum-continue')).toBeVisible();
	return sentences;
}

async function chooseGuidedClues(root: Locator): Promise<void> {
	await root.locator('#barnum-country').selectOption('bangladesh');
	await root.locator('#barnum-city_context').selectOption('dhaka');
	await root.locator('#barnum-language').selectOption('english');
	await root.locator('#barnum-planning_style').selectOption('loose-plan');
}

async function advanceToStepThree(root: Locator): Promise<void> {
	await beginGuided(root);
	await completeBaseline(root, ['fits', 'partly-fits', 'does-not-fit']);
	await continueGuided(root);
	await expectStep(root, 2);
	await chooseGuidedClues(root);
	await continueGuided(root);
	await expectStep(root, 3);
}

async function rateWholeReading(root: Locator): Promise<void> {
	const group = root.getByTestId('barnum-whole-reading-rating');
	await expect(group).toBeVisible();
	const radios = group.locator('input[type="radio"]');
	const count = await radios.count();
	expect(count).toBeGreaterThan(0);
	await radios.nth(Math.min(4, count - 1)).check();
}

async function advanceToReveal(root: Locator): Promise<void> {
	await advanceToStepThree(root);
	await rateWholeReading(root);
	await continueGuided(root);
	await expectStep(root, 4);
	const counterfactual = root.getByRole('button', { name: 'Change several surface clues' });
	if ((await counterfactual.count()) > 0) await counterfactual.click();
	await continueGuided(root);
	await expectStep(root, 5);
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
				: [],
		cookie: document.cookie,
		historyState: JSON.stringify(history.state),
		url: location.href,
		referrer: document.referrer
	}));
}

async function installPrivacyAudit(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const audit: PrivacyAudit = {
			beacons: [],
			fetches: [],
			xhrs: [],
			forms: [],
			clientErrors: [],
			storageWrites: [],
			indexedDbCalls: [],
			historyCalls: [],
			cookieWrites: []
		};
		Object.defineProperty(window, '__barnumPrivacyAudit', { value: audit });
		const bodyText = (value: unknown) => {
			if (value === undefined || value === null) return '';
			if (typeof value === 'string') return value;
			if (value instanceof URLSearchParams) return value.toString();
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		};
		window.addEventListener('error', (event) => audit.clientErrors.push(event.message));
		window.addEventListener('unhandledrejection', (event) =>
			audit.clientErrors.push(bodyText(event.reason))
		);
		if (typeof window.reportError === 'function') {
			const originalReportError = window.reportError.bind(window);
			window.reportError = (error: unknown) => {
				audit.clientErrors.push(bodyText(error));
				originalReportError(error);
			};
		}

		const originalFetch = window.fetch.bind(window);
		window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			audit.fetches.push({
				url: input instanceof Request ? input.url : String(input),
				body: bodyText(init?.body)
			});
			return originalFetch(input, init);
		}) as typeof window.fetch;

		const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
		const originalOpen = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function (
			method: string,
			url: string | URL,
			...rest: unknown[]
		) {
			xhrMeta.set(this, { method, url: String(url) });
			return originalOpen.call(this, method, String(url), ...(rest as [boolean, string?, string?]));
		};
		const originalSend = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
			const meta = xhrMeta.get(this) ?? { method: 'GET', url: '' };
			audit.xhrs.push({ ...meta, body: bodyText(body) });
			return originalSend.call(this, body as XMLHttpRequestBodyInit | null | undefined);
		};

		const originalBeacon = navigator.sendBeacon?.bind(navigator);
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: (url: string | URL, data?: BodyInit | null) => {
				audit.beacons.push({ url: String(url), body: bodyText(data) });
				return originalBeacon ? originalBeacon(url, data) : true;
			}
		});

		const originalSubmit = HTMLFormElement.prototype.submit;
		HTMLFormElement.prototype.submit = function () {
			audit.forms.push(this.action);
			return originalSubmit.call(this);
		};

		for (const operation of ['setItem', 'removeItem', 'clear'] as const) {
			const original = Storage.prototype[operation];
			Storage.prototype[operation] = function (...args: string[]) {
				audit.storageWrites.push({
					storage: this === localStorage ? 'localStorage' : 'sessionStorage',
					operation,
					key: args[0] ?? '',
					value: args[1] ?? ''
				});
				return (original as (...values: string[]) => void).apply(this, args);
			};
		}

		const originalIndexedDbOpen = IDBFactory.prototype.open;
		IDBFactory.prototype.open = function (name: string, version?: number): IDBOpenDBRequest {
			audit.indexedDbCalls.push({ operation: 'open', name });
			return version === undefined
				? originalIndexedDbOpen.call(this, name)
				: originalIndexedDbOpen.call(this, name, version);
		};
		const originalIndexedDbDelete = IDBFactory.prototype.deleteDatabase;
		IDBFactory.prototype.deleteDatabase = function (name: string): IDBOpenDBRequest {
			audit.indexedDbCalls.push({ operation: 'deleteDatabase', name });
			return originalIndexedDbDelete.call(this, name);
		};

		for (const operation of ['pushState', 'replaceState'] as const) {
			const original = History.prototype[operation];
			History.prototype[operation] = function (
				state: unknown,
				unused: string,
				url?: string | URL | null
			) {
				audit.historyCalls.push({
					operation,
					state: bodyText(state),
					url: url === undefined || url === null ? '' : String(url)
				});
				return original.call(this, state, unused, url);
			};
		}

		const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
		if (cookie?.get && cookie.set) {
			Object.defineProperty(Document.prototype, 'cookie', {
				configurable: true,
				get: cookie.get,
				set(value: string) {
					audit.cookieWrites.push(value);
					cookie.set?.call(this, value);
				}
			});
		}
	});
}

async function installNetworkPrivacyGuard(page: Page, records: RequestRecord[]): Promise<void> {
	await page.route('**/*', async (route) => {
		const request = route.request();
		records.push(recordRequest(request));
		if (ignorablePlatformRequest(request.url())) {
			await route.abort('blockedbyclient');
			return;
		}
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
			await route.abort('blockedbyclient');
			return;
		}
		await route.continue();
	});
}

async function resetPrivacyAudit(page: Page): Promise<void> {
	await page.evaluate(() => {
		const audit = (window as unknown as { __barnumPrivacyAudit: PrivacyAudit })
			.__barnumPrivacyAudit;
		for (const value of Object.values(audit)) value.length = 0;
	});
}

async function readPrivacyAudit(page: Page): Promise<PrivacyAudit> {
	return page.evaluate(
		() => (window as unknown as { __barnumPrivacyAudit: PrivacyAudit }).__barnumPrivacyAudit
	);
}

function recordRequest(request: PlaywrightRequest): RequestRecord {
	return {
		method: request.method(),
		url: request.url(),
		body: request.postData() ?? '',
		headers: request.headers()
	};
}

async function expectNoSensitiveLeak(
	records: readonly unknown[],
	sensitiveValues: readonly string[]
): Promise<void> {
	const serialized = JSON.stringify(records).toLocaleLowerCase('en');
	for (const value of sensitiveValues.filter((candidate) => candidate.trim().length >= 4)) {
		expect(serialized, `lab value leaked: ${value}`).not.toContain(value.toLocaleLowerCase('en'));
	}
}

async function visibleControlCount(root: Locator): Promise<number> {
	return root.locator('button, input, select, textarea, summary').evaluateAll(
		(nodes) =>
			nodes.filter((node) => {
				const style = getComputedStyle(node);
				return (
					(node as HTMLElement).getClientRects().length > 0 &&
					style.display !== 'none' &&
					style.visibility !== 'hidden'
				);
			}).length
	);
}

test('SSR, no-JavaScript, and generated HTML keep the explanation useful and route assets isolated', async ({
	request,
	browser,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('The Profile That Knows Almost Nothing About You');
	expect(html).toContain('data-testid="barnum-lab"');
	expect(html).toContain('data-barnum-critical');
	expect(html).toContain('How the reading works');
	expect(html).toContain('1 − (1 − <var>p</var>)<sup><var>n</var></sup>');

	const linkTags = html.match(/<link\b[^>]*>/giu) ?? [];
	const routeAssets = linkTags
		.map((tag) => ({
			rel: tag.match(/\brel=["']([^"']+)["']/iu)?.[1] ?? '',
			href: tag.match(/\bhref=["']([^"']+)["']/iu)?.[1] ?? ''
		}))
		.filter(({ rel }) => rel === 'stylesheet' || rel === 'modulepreload');
	const serializedAssets = JSON.stringify(routeAssets).toLocaleLowerCase('en');
	const serializedAssetTags = (html.match(/<(?:link|script)\b[^>]*>/giu) ?? [])
		.join('\n')
		.toLocaleLowerCase('en');
	expect(serializedAssetTags).not.toMatch(
		/<link\b[^>]*rel=["']preload["'][^>]*(?:roboto|courier-prime)|<link\b[^>]*(?:roboto|courier-prime)[^>]*rel=["']preload["']/iu
	);
	for (const marker of unrelatedAssetMarkers) {
		expect(serializedAssets, `unrelated ${marker} asset was linked`).not.toContain(marker);
		expect(
			serializedAssetTags,
			`production-served HTML mentioned unrelated ${marker} assets`
		).not.toContain(marker);
	}
	expect(routeAssets.filter(({ rel }) => rel === 'stylesheet').length).toBeLessThanOrEqual(6);
	expect(routeAssets.filter(({ rel }) => rel === 'modulepreload').length).toBeLessThanOrEqual(36);

	const context = await browser.newContext({
		baseURL: baseURL ?? 'http://127.0.0.1:4351',
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	try {
		const page = await context.newPage();
		const navigation = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(navigation?.ok()).toBe(true);
		const root = lab(page);
		await expect(root).toHaveAttribute('data-ready', 'false');
		await expect(root.locator('.noscript-poster')).toBeVisible();
		await expect(root.locator('.noscript-poster')).toContainText(
			/interactive\s+demonstration\s+needs JavaScript/iu
		);
		expect(await visibleControlCount(root)).toBe(0);
		await expect(page.getByRole('heading', { name: 'The many-guesses model' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'A ten-question defence' })).toBeVisible();
		await expect(page.getByText(/uses no runtime AI or external API/iu)).toBeVisible();
	} finally {
		await context.close();
	}
});

test('@cross-browser plain first impressions remain semantic, private, and focus-safe', async ({
	page
}) => {
	await installPrivacyAudit(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const requests: RequestRecord[] = [];
	const root = await openLab(page);
	await resetPrivacyAudit(page);
	await installNetworkPrivacyGuard(page, requests);
	const before = await storageSnapshot(page);

	await beginGuided(root);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);
	const baselineSentences = await completeBaseline(
		root,
		['fits', 'partly-fits', 'does-not-fit'],
		async (card, index) => {
			const sentence = (await card.locator('.sentence').innerText()).trim();
			expect(sentence.split(/\s+/u).length).toBeLessThanOrEqual(24);
			await expect(card.locator('.segmented')).toHaveCount(0);
			const snapshot = await card.locator('.sentence').ariaSnapshot();
			expect(snapshot.split(sentence).length - 1).toBe(1);
			const rating = card.locator('fieldset.rating');
			await expect(rating.locator('legend')).toHaveText(
				`How well does Line ${index + 1} of 3 fit?`
			);
			const sentenceId = await card.locator('.sentence').getAttribute('id');
			expect(sentenceId).toBeTruthy();
			await expect(rating.locator('input').first()).toHaveAttribute(
				'aria-describedby',
				sentenceId!
			);
		}
	);
	await continueGuided(root);
	await expectStep(root, 2);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);

	const after = await storageSnapshot(page);
	expect(after).toEqual(before);
	const audit = await readPrivacyAudit(page);
	expect(audit.clientErrors).toEqual([]);
	expect(audit.storageWrites).toEqual([]);
	expect(audit.indexedDbCalls).toEqual([]);
	expect(audit.historyCalls).toEqual([]);
	expect(audit.cookieWrites).toEqual([]);
	await expectNoSensitiveLeak(
		[...requests, audit],
		['fits', 'surface-autonomy', 'Line 1 of 3', ...baselineSentences]
	);
	for (const request of requests.filter(({ method }) => !['GET', 'HEAD'].includes(method))) {
		expect(ignorablePlatformRequest(request.url)).toBe(true);
	}
});

test('the compact opening and all five stages use truthful CTAs, plain readings, and exact focus geometry', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const diagnostics = observeRuntime(page);
	const root = await openLab(page);
	await root.evaluate((element) => element.scrollIntoView({ block: 'start' }));
	const openingGeometry = await root.evaluate((element) => {
		const lab = element.getBoundingClientRect();
		const ledger = element
			.querySelector('[data-testid="assumption-ledger"]')
			?.getBoundingClientRect();
		const begin = element.querySelector('[data-testid="barnum-begin"]')?.getBoundingClientRect();
		return {
			ledgerHeight: ledger?.height ?? Infinity,
			beginBottomFromLabTop: (begin?.bottom ?? Infinity) - lab.top
		};
	});
	expect(openingGeometry.ledgerHeight).toBeLessThanOrEqual(120);
	expect(openingGeometry.beginBottomFromLabTop).toBeLessThanOrEqual(768);
	await expect(root.getByTestId('assumption-ledger')).toContainText('India');
	await expect(root.getByTestId('assumption-ledger')).toContainText('Kolkata');
	await expect(root.getByTestId('assumption-ledger')).toContainText('Bengali + English');
	await expect(root.getByText('3–4 minute interactive', { exact: true })).toBeVisible();

	await beginGuided(root);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);
	await expect(root.getByTestId('barnum-next-statement')).toHaveText('Next statement');
	await completeBaseline(root);
	const cta = root.getByTestId('barnum-continue');
	await expect(cta).toHaveText('Continue without rating');
	await root.getByTestId('barnum-current-baseline').locator('input[value="fits"]').check();
	await expect(cta).toHaveText('Continue with these ratings');

	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	await root.getByRole('button', { name: 'Replay same sealed deck' }).click();
	await expectStep(root, 1);
	await root.page().waitForTimeout(190);
	await completeBaseline(root, ['fits', 'partly-fits', 'does-not-fit']);
	await expect(cta).toHaveText('Continue');
	await continueGuided(root);

	await expectStep(root, 2);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);
	await chooseGuidedClues(root);
	await continueGuided(root);

	await expectStep(root, 3);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);
	await expect(root.getByTestId('barnum-continue')).toHaveText(
		'Continue without an overall rating'
	);
	for (const card of await root.locator('.reading-card:visible').all()) {
		await expect(card.locator('header > span')).toHaveText('Reading');
		await expect(card.locator('.segmented')).toHaveCount(0);
	}
	await rateWholeReading(root);
	await expect(root.getByTestId('barnum-continue')).toHaveText('Continue to the next step');
	await continueGuided(root);

	await expectStep(root, 4);
	await expectHeadingBelowHeader(page, root);
	await expectNoForbiddenCopy(root);
	await expect(root.getByText(/Feedback reuse|FEEDBACK REUSE/iu)).toHaveCount(0);
	await root.getByRole('button', { name: 'Change several surface clues' }).click();
	await expect(
		root.getByRole('heading', { name: /Same seven readings, in the same order/iu })
	).toBeVisible();
	await continueGuided(root);

	await expectStep(root, 5);
	await expectHeadingBelowHeader(page, root);
	await expect(root.getByText(/The profile did not read your mind/iu)).toBeVisible();
	await expect(
		root.getByRole('heading', { name: 'Where the shown lines came from' })
	).toBeVisible();
	await expect(root.locator('#barnum-xrays .explanation').first()).toBeVisible();
	await expect(
		root.getByRole('heading', { name: 'Original misses and “too vague” judgments' })
	).toBeVisible();
	const xray = root.locator('.reading-card:visible:has(.segmented)').first();
	await expect(xray).toBeVisible();
	const accessibleSentence = (await xray.locator('.sentence .sr-only').innerText()).trim();
	const xraySnapshot = await xray.locator('.sentence').ariaSnapshot();
	expect(xraySnapshot.split(accessibleSentence).length - 1).toBe(1);
	expect(diagnostics).toEqual({ errors: [], failedRequests: [] });
});

test('every lab action stays in current-tab memory and cannot leak through network, storage, URL, referrer, or history', async ({
	page,
	context
}) => {
	await installPrivacyAudit(page);
	const requests: RequestRecord[] = [];
	const root = await openLab(page);
	await page.waitForLoadState('load');
	await resetPrivacyAudit(page);
	await installNetworkPrivacyGuard(page, requests);
	const before = await storageSnapshot(page);
	const beforeCookies = await context.cookies();

	await beginGuided(root);
	const initialStatements = await completeBaseline(root, ['too-vague', 'fits', 'partly-fits']);
	await continueGuided(root);
	await chooseGuidedClues(root);
	await continueGuided(root);
	await rateWholeReading(root);
	await continueGuided(root);
	await root.getByRole('button', { name: 'Change several surface clues' }).click();
	await continueGuided(root);
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	const replayCode = await root.getByTestId('barnum-replay-code').inputValue();
	const auditIds = await root
		.locator('[data-event-id], [data-statement-id]')
		.evaluateAll((nodes) =>
			nodes.flatMap((node) => [
				node.getAttribute('data-event-id') ?? '',
				node.getAttribute('data-statement-id') ?? ''
			])
		);
	await root.getByTestId('barnum-toggle-showProvenance').check();
	await root.getByLabel('Feedback adaptation', { exact: true }).uncheck();
	await root.getByRole('button', { name: 'Replay same sealed deck' }).click();
	await root.getByTestId('barnum-reveal-now').click();
	await root.getByTestId('barnum-reset').click();
	await expect(root.getByTestId('barnum-begin')).toBeVisible();

	const after = await storageSnapshot(page);
	expect(after).toEqual(before);
	expect(await context.cookies()).toEqual(beforeCookies);
	const audit = await readPrivacyAudit(page);
	expect(audit.forms).toEqual([]);
	expect(audit.clientErrors).toEqual([]);
	expect(audit.storageWrites).toEqual([]);
	expect(audit.indexedDbCalls).toEqual([]);
	expect(audit.historyCalls).toEqual([]);
	expect(audit.cookieWrites).toEqual([]);
	for (const request of requests.filter(({ method }) => !['GET', 'HEAD'].includes(method))) {
		expect(ignorablePlatformRequest(request.url), `${request.method} ${request.url}`).toBe(true);
	}
	await expectNoSensitiveLeak(
		[requests, audit, await context.cookies(), after],
		[
			'bangladesh',
			'dhaka',
			'english',
			'loose-plan',
			'too-vague',
			'fits',
			replayCode,
			...initialStatements,
			...auditIds
		]
	);
});

test('early reveal and replay report only real events and clear every branch except the sealed deck identity', async ({
	page
}) => {
	const root = await openLab(page);
	await beginGuided(root);
	const originalSentences = await root.locator('.reading-card:visible .sentence').allInnerTexts();
	await root.locator('.reading-card:visible').first().locator('input[value="fits"]').check();
	await root.getByTestId('barnum-next-statement').click();
	await expect(root.getByTestId('barnum-current-baseline')).toBeFocused();
	await expect(
		root.getByTestId('barnum-current-baseline').locator('.reading-card header > p')
	).toHaveText('Line 2 of 3');
	await root.page().waitForTimeout(190);
	await root.getByTestId('barnum-reveal-now').click();
	await expectStep(root, 5);
	const summary = root.getByTestId('barnum-reveal-summary');
	await expect(summary).toContainText('2 original lines were shown');
	await expect(summary).toContainText('5 prepared original lines were not shown');
	await expect(root.getByText(/One line reworded an answer you gave/iu)).toHaveCount(0);
	await expect(root.getByText(/selected because of earlier ratings/iu)).toHaveCount(0);
	await expect(root.locator('.reading-card[data-basis="direct-echo"]')).toHaveCount(0);
	await expect(root.locator('#barnum-xrays .reading-card')).toHaveCount(2);

	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	const replayInput = root.getByTestId('barnum-replay-code');
	await replayInput.fill('BL1-G100-C100-00000000-0000000000000000-000000');
	await root.getByTestId('barnum-load-replay').click();
	await expect(root.getByTestId('barnum-replay-feedback')).toContainText(
		/incompatible|version|invalid/iu
	);
	await expect(root.locator('[aria-live]')).toHaveCount(1);
	await expect(root.getByTestId('barnum-live-region')).toContainText(
		/incompatible|version|invalid/iu
	);

	await root.getByRole('button', { name: 'Replay same sealed deck' }).click();
	await expectStep(root, 1);
	expect(await root.locator('.reading-card:visible .sentence').allInnerTexts()).toEqual(
		originalSentences
	);
	await expect(root.locator('.reading-card:visible input:checked')).toHaveCount(0);
	await expect(root.locator('#barnum-country')).toHaveCount(0);
	await expect(root.getByTestId('assumption-ledger')).not.toContainText('Bangladesh');
});

test('counterfactual, hedge, probability, and X-ray experiments isolate what they claim', async ({
	page
}) => {
	const root = await openLab(page);
	await advanceToReveal(root);
	await root.getByTestId('barnum-open-lab').click();

	const counterfactual = root.locator('.counterfactual');
	await expect(
		counterfactual.getByRole('heading', { name: /Same seven readings, in the same order/iu })
	).toBeVisible();
	const changeRows = counterfactual.locator('tbody tr');
	expect(await changeRows.count()).toBeGreaterThan(0);
	for (const row of await changeRows.all()) {
		const cells = await row.locator('th, td').allInnerTexts();
		expect(cells[1]).not.toBe(cells[2]);
	}

	await root.getByTestId('barnum-experiment-hedges').click();
	const hedge = root.getByTestId('barnum-hedge-experiment');
	await expect(hedge).toHaveAttribute('data-pair-id', /.+/u);
	await expect(hedge).toHaveAttribute('data-core-id', /.+/u);
	const plain = (await hedge.locator('[data-treatment="plain"] p').innerText()).trim();
	const hedged = (await hedge.locator('[data-treatment="hedged"] p').innerText()).trim();
	expect(hedged).toBe(`At times, ${plain.charAt(0).toLocaleLowerCase('en')}${plain.slice(1)}`);
	await hedge.getByText('Technical equality check', { exact: true }).click();
	await expect(hedge.getByText(/on both sides/iu)).toBeVisible();

	await root.getByTestId('barnum-experiment-many-guesses').click();
	await setRangeValue(root, '#barnum-p', 0.25);
	await setRangeValue(root, '#barnum-n', 4);
	const comparison = root.getByTestId('barnum-one-vs-many');
	await expect(comparison.getByRole('heading')).toContainText('one claim versus 4 claims');
	await expect(comparison).not.toContainText('Twelve claims');
	await expect(root.getByTestId('barnum-probability-results')).toContainText('1.00');
	await expect(root.getByTestId('barnum-probability-results')).toContainText('68.4%');
	await root.getByText('More probability controls', { exact: true }).click();
	await setRangeValue(root, '#barnum-k', 5);
	await expect(root.getByTestId('barnum-k-impossible')).toContainText(
		'Impossible because k is greater than n; probability 0.'
	);
	await expect(
		root.getByText(/independent claims with the same acceptance probability/iu)
	).toBeVisible();
});

test('reload, route remount, back-forward restoration, and a replacement tab cannot resurrect state', async ({
	page,
	context
}) => {
	let root = await openLab(page);
	await beginGuided(root);
	await completeBaseline(root, ['fits', 'partly-fits', 'does-not-fit']);
	await continueGuided(root);
	await root.locator('#barnum-country').selectOption('bangladesh');

	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	});
	await expect(root.getByTestId('barnum-begin')).toBeVisible();
	await expect(root.getByTestId('assumption-ledger')).not.toContainText('Bangladesh');

	await beginGuided(root);
	await page.reload({ waitUntil: 'domcontentloaded' });
	root = lab(page);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(root.getByTestId('barnum-begin')).toBeVisible();

	await beginGuided(root);
	await page.goto('/blog/visualizations', { waitUntil: 'domcontentloaded' });
	await page.goBack({ waitUntil: 'domcontentloaded' });
	root = lab(page);
	await expect(root).toHaveAttribute('data-ready', 'true');
	await expect(root.getByTestId('barnum-begin')).toBeVisible();

	const restored = await context.newPage();
	await restored.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(lab(restored)).toHaveAttribute('data-stage', 'intro');
	await restored.close();
});

test('@cross-browser full screen or honest expansion restores focus and keeps the stage heading clear', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const root = await openLab(page);
	const trigger = root.getByTestId('barnum-fullscreen');
	const initialName = await trigger.getAttribute('aria-label');
	expect(initialName).toMatch(
		/Open Barnum laboratory full screen|Expand Barnum laboratory in the page/u
	);
	await trigger.click();
	await expect(root).toHaveAttribute('data-expanded', 'true');
	const exit = root.getByTestId('barnum-fullscreen');
	await expect(exit).toHaveAccessibleName(
		/Exit Barnum laboratory full screen|Collapse Barnum laboratory/u
	);
	await exit.click();
	await expect(root).toHaveAttribute('data-expanded', 'false');
	await expect(trigger).toBeFocused();

	await beginGuided(root);
	await expectHeadingBelowHeader(page, root);
	await root.getByTestId('barnum-reveal-now').click();
	await expectHeadingBelowHeader(page, root);
});

test('responsive, zoomed, reduced-motion, forced-colour, keyboard, and Axe views remain operable', async ({
	page
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
	await expectNoSeriousAxeViolations(page, 'compact introduction');

	for (const viewport of [
		{ width: 320, height: 800 },
		{ width: 375, height: 812 },
		{ width: 768, height: 1024 },
		{ width: 800, height: 360 },
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
	}

	await page.setViewportSize({ width: 320, height: 800 });
	await root.getByTestId('barnum-begin').click();
	const mobileActions = root.locator('.guided-actions');
	await expect(mobileActions).toBeVisible();
	expect(
		await mobileActions.evaluate((element) => element.getBoundingClientRect().height)
	).toBeLessThanOrEqual(100);
	await expect(root.getByTestId('barnum-next-statement')).toBeVisible();
	await expect(root.getByTestId('barnum-reveal-now')).toBeVisible();

	const firstRating = root.locator('.reading-card:visible fieldset.rating').first();
	await firstRating.locator('input').first().focus();
	await page.keyboard.press('ArrowRight');
	await expect(firstRating.locator('input:checked')).toHaveValue('partly-fits');
	await expectNoSeriousAxeViolations(page, 'keyboard-rated first impression');

	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await firstRating.locator('input[value="fits"]').check();
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });

	await page.setViewportSize({ width: 1440, height: 900 });
	const devtools = await page.context().newCDPSession(page);
	await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
	expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeCloseTo(2, 1);
	await expect(root.getByTestId('barnum-reveal-now')).toBeVisible();
	await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

	await root.getByTestId('barnum-reveal-now').click();
	await expectNoSeriousAxeViolations(page, 'immediate reveal');
	await root.getByTestId('barnum-open-lab').click();
	await root.getByText('Advanced controls', { exact: true }).click();
	await expectNoSeriousAxeViolations(page, 'expanded open laboratory');

	const expand = root.getByTestId('barnum-fullscreen');
	await expect(expand).toHaveAccessibleName('Expand Barnum laboratory in the page');
	await expand.click();
	await expect(root).toHaveAttribute('data-expanded', 'true');
	await page.screenshot({
		animations: 'disabled',
		path: testInfo.outputPath('barnum-expanded-1440x900.png')
	});
	await root.getByTestId('barnum-fullscreen').click();
	await expect(expand).toBeFocused();
});
