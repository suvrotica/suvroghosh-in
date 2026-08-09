import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	STANDARDS_MANIFEST,
	STANDARDS_VERIFIED_ON
} from '../../src/lib/visualizations/prior-authorization/data/standards-manifest';

const articlePath = '/blog/visualizations/the-prior-authorization-machine';
const articleTitle =
	'The Prior Authorization Machine: a patient, an MRI, and the invisible decisions between them';
const dayMs = 86_400_000;

const milestoneIds = [
	'mri-ordered',
	'coverage-checked',
	'documentation-received',
	'evidence-gathered',
	'human-review-completed',
	'request-submitted',
	'request-technically-received',
	'payer-review',
	'more-information-requested',
	'request-supplemented',
	'decision-issued',
	'scheduled-and-scan-received'
] as const;

const baselines = [
	{
		pathway: 'portal-fax',
		label: 'Portal and fax',
		patientMs: 25_920 * 60_000,
		humanSeconds: 9_360,
		machineMs: 1_630
	},
	{
		pathway: 'fhir-enabled',
		label: 'FHIR-enabled',
		patientMs: 15_840 * 60_000,
		humanSeconds: 3_840,
		machineMs: 2_880
	}
] as const;

const failures = [
	{
		id: 'identity-mismatch',
		label: 'Identity',
		patientDays: { 'portal-fax': 20, 'fhir-enabled': 13 },
		rewindStep: 2,
		technicalStatus: 'not-submitted',
		businessStatus: 'not-started',
		authorizationStatus: 'not-requested',
		finalAuthorizationStatus: 'approved',
		finalOutcome: 'scan-completed',
		consequence: 'miss an earlier appointment slot'
	},
	{
		id: 'narrative-only',
		label: 'Narrative only',
		patientDays: { 'portal-fax': 22, 'fhir-enabled': 14 },
		rewindStep: 3,
		technicalStatus: 'not-submitted',
		businessStatus: 'not-started',
		authorizationStatus: 'not-requested',
		finalAuthorizationStatus: 'approved',
		finalOutcome: 'scan-completed',
		consequence: 'Manual source recovery'
	},
	{
		id: 'clinically-insufficient',
		label: 'Insufficient evidence',
		patientDays: { 'portal-fax': 16, 'fhir-enabled': 8 },
		rewindStep: 6,
		technicalStatus: 'accepted',
		businessStatus: 'denied',
		authorizationStatus: 'denied',
		finalAuthorizationStatus: 'denied',
		finalOutcome: 'denied',
		consequence: 'request is then denied'
	},
	{
		id: 'authorization-expired',
		label: 'Expired',
		patientDays: { 'portal-fax': 30, 'fhir-enabled': 20 },
		rewindStep: 10,
		technicalStatus: 'accepted',
		businessStatus: 'closed',
		authorizationStatus: 'expired',
		finalAuthorizationStatus: 'expired',
		finalOutcome: 'expired',
		consequence: 'does not receive the scan'
	}
] as const;

type RuntimeDiagnostics = {
	errors: string[];
	failedRequests: string[];
};

type RuntimeDiagnosticOptions = {
	allowNoJavaScriptAssetCsp?: boolean;
};

const diagnosticsByPage = new WeakMap<Page, RuntimeDiagnostics>();

function experience(page: Page): Locator {
	return page.getByTestId('prior-authorization-machine');
}

function ignorablePlatformRequest(url: string): boolean {
	const pathname = new URL(url).pathname;
	return pathname.startsWith('/_vercel/') || /(?:^|\/)favicon(?:\.|$)/iu.test(pathname);
}

function observeRuntime(
	page: Page,
	{ allowNoJavaScriptAssetCsp = false }: RuntimeDiagnosticOptions = {}
): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = { errors: [], failedRequests: [] };

	page.on('pageerror', (error) => diagnostics.errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const text = message.text();
		const isHydrationWarning = /hydrat(?:e|ion|ing)|server-rendered html/iu.test(text);
		if (message.type() !== 'error' && !isHydrationWarning) return;
		if (/\/_vercel\/(?:insights|speed-insights)\//iu.test(text)) return;
		if (ignorablePlatformRequest(message.location().url || 'http://local.invalid/')) return;
		diagnostics.errors.push(`${message.type()}: ${text}`);
	});
	page.on('requestfailed', (request) => {
		if (ignorablePlatformRequest(request.url())) return;
		const reason = request.failure()?.errorText ?? 'unknown failure';
		if (
			allowNoJavaScriptAssetCsp &&
			reason === 'csp' &&
			new URL(request.url()).pathname.startsWith('/_app/')
		)
			return;
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

function normalizedText(value: string): string {
	return value.replace(/\s+/gu, ' ').trim();
}

async function selectRadio(scope: Locator, name: string | RegExp): Promise<Locator> {
	const radio = scope.getByRole('radio', {
		name,
		exact: typeof name === 'string'
	});
	const label = radio.locator('xpath=ancestor::label[1]');
	await expect(label).toHaveCount(1);
	await label.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
	await label.click();
	await expect(radio).toBeChecked();
	return radio;
}

async function selectPathway(scope: Locator, label: string): Promise<void> {
	await selectRadio(scope, new RegExp(`^${label}`, 'u'));
}

async function selectTheme(
	page: Page,
	theme: 'paper' | 'light' | 'night' | 'high-contrast'
): Promise<void> {
	const controls = page.getByLabel('Colour theme', { exact: true });
	let control = controls.filter({ visible: true }).first();
	const mobileMenu = page.locator('header details').filter({ hasText: 'Navigation menu' }).first();
	if ((await control.count()) === 0) {
		await mobileMenu.locator('summary').click();
		await expect(mobileMenu).toHaveAttribute('open', '');
		control = page.getByLabel('Appearance', { exact: true }).filter({ visible: true }).first();
	}
	await expect(control).toBeVisible();
	await expect(control).toBeEnabled();
	await control.selectOption(theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	if ((await mobileMenu.getAttribute('open')) !== null) {
		await mobileMenu.locator('summary').click();
		await expect(mobileMenu).not.toHaveAttribute('open', '');
	}
}

async function enterStage(
	page: Page,
	pathway: 'portal-fax' | 'fhir-enabled' = 'portal-fax'
): Promise<Locator> {
	const viewport = page.viewportSize();
	if (!viewport || viewport.width < 768 || viewport.height < 608) {
		await page.setViewportSize({ width: 1_280, height: 800 });
	}

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-experience', 'static');
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await expect(root).toHaveAttribute('data-eligibility', 'wide-stage');
	await selectPathway(
		root.getByTestId('pathway-selector'),
		pathway === 'portal-fax' ? 'Portal and fax' : 'FHIR-enabled'
	);
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();

	const stage = root.getByTestId('machine-stage');
	await expect(stage).toBeVisible({ timeout: 30_000 });
	await expect(root).toHaveAttribute('data-experience', 'interactive');
	await expect(stage).toHaveAttribute('data-path', pathway);
	return stage;
}

async function setStep(stage: Locator, step: number): Promise<void> {
	const scrubber = stage.locator('#pa-milestone-scrubber');
	await scrubber.evaluate((element, value) => {
		const input = element as HTMLInputElement;
		input.value = String(value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, step);
	await expect(stage).toHaveAttribute('data-step', String(step));
}

async function assertExactClocks(
	stage: Locator,
	values: { patientMs: number; humanSeconds: number; machineMs: number }
): Promise<void> {
	// These are authored ledger equalities. Screenshot and runtime tolerances never apply here.
	await expect(stage).toHaveAttribute('data-clock-patient-ms', String(values.patientMs));
	await expect(stage).toHaveAttribute('data-clock-human-seconds', String(values.humanSeconds));
	await expect(stage).toHaveAttribute('data-clock-machine-ms', String(values.machineMs));
}

async function assertNoRuntimeDiagnostics(diagnostics: RuntimeDiagnostics): Promise<void> {
	expect(diagnostics.errors).toEqual([]);
	expect(diagnostics.failedRequests).toEqual([]);
}

test.beforeEach(({ page }) => {
	diagnosticsByPage.set(page, observeRuntime(page));
});

test.afterEach(async ({ page }) => {
	await assertNoRuntimeDiagnostics(
		diagnosticsByPage.get(page) ?? { errors: [], failedRequests: [] }
	);
});

test('SSR has one exact H1, the static poster and text journey, but no interactive stage', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html.match(/<h1\b/gu)).toHaveLength(1);
	expect(html).toContain('data-testid="prior-authorization-poster"');
	expect(html).toContain('data-testid="compact-journey"');
	expect(html).toContain('data-hydrated="false"');
	for (const row of STANDARDS_MANIFEST) {
		expect(html).toContain(`data-manifest-row="${row.id}" data-verified-on="${row.verifiedOn}"`);
	}
	expect(html).not.toContain('data-testid="machine-stage"');
	expect(html).not.toContain('<canvas');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	const heading = root.getByRole('heading', { level: 1 });
	await expect(heading).toHaveCount(1);
	expect(normalizedText(await heading.innerText())).toBe(articleTitle);
	await expect(root.getByTestId('prior-authorization-poster')).toBeVisible();
	await expect(root.getByTestId('compact-journey')).toBeVisible();
	await expect(root.getByTestId('machine-stage')).toHaveCount(0);
	await expect(root).toHaveAttribute('data-experience', 'static');
	const manifest = page.locator('.standards-manifest');
	await expect(manifest.locator('time')).toHaveAttribute('datetime', STANDARDS_VERIFIED_ON);
	for (const row of STANDARDS_MANIFEST) {
		const rendered = manifest.locator(`[data-manifest-row="${row.id}"]`);
		await expect(rendered).toHaveAttribute('data-verified-on', row.verifiedOn);
		expect(normalizedText(await rendered.innerText())).toContain(
			`${row.label} ${row.fhir} ${row.crd} ${row.dtr} ${row.pas}`
		);
	}
});

test('the canonical public machine exposes exactly twelve unique milestones', async ({ page }) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const compact = experience(page).getByTestId('compact-journey');
	const staticIds = await compact
		.locator('[data-milestone-id]')
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('data-milestone-id'))
		);
	expect(staticIds).toEqual(milestoneIds);
	expect(new Set(staticIds).size).toBe(12);

	const stage = await enterStage(page);
	const graphIds = await stage
		.locator('svg [data-milestone-id]')
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('data-milestone-id'))
		);
	expect(graphIds).toEqual(milestoneIds);
	expect(new Set(graphIds).size).toBe(12);
});

test('Begin reveals complete manual controls whose actions preserve deterministic state', async ({
	page
}) => {
	await page.setViewportSize({ width: 1_440, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	const heroClocks = root.locator('.hero .clock-panel');
	await expect(heroClocks).toHaveAttribute('data-clock-patient-ms', '0');
	await expect(heroClocks).toHaveAttribute('data-clock-human-seconds', '0');
	await expect(heroClocks).toHaveAttribute('data-clock-machine-ms', '0');
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await expect(root).toHaveAttribute('data-eligibility', 'wide-stage');
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();

	const stage = root.getByTestId('machine-stage');
	await expect(stage).toBeVisible({ timeout: 30_000 });
	for (const label of [
		'Previous',
		'Play',
		'Next',
		'Replay current step',
		'Replay journey',
		'Reset'
	]) {
		await expect(stage.getByRole('button', { name: label, exact: true })).toBeVisible();
	}
	await expect(stage.locator('#pa-milestone-scrubber')).toBeVisible();
	for (const speed of ['0.5×', '1×', '1.5×']) {
		await expect(stage.getByRole('radio', { name: speed, exact: true })).toBeVisible();
	}

	await stage.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '1');
	const clocksAtStepTwo = {
		patient: await stage.getAttribute('data-clock-patient-ms'),
		human: await stage.getAttribute('data-clock-human-seconds'),
		machine: await stage.getAttribute('data-clock-machine-ms')
	};
	for (const speed of ['0.5×', '1.5×']) {
		await selectRadio(stage, speed);
		await expect(stage).toHaveAttribute('data-clock-patient-ms', clocksAtStepTwo.patient ?? '');
		await expect(stage).toHaveAttribute('data-clock-human-seconds', clocksAtStepTwo.human ?? '');
		await expect(stage).toHaveAttribute('data-clock-machine-ms', clocksAtStepTwo.machine ?? '');
	}
	await stage.getByRole('button', { name: 'Replay current step', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '1');
	await expect(stage.locator('.stage-status')).toContainText(
		'Replaying milestone 2: Coverage requirements checked.'
	);
	await stage.getByRole('button', { name: 'Replay journey', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '0');
	await expect(stage).toHaveAttribute('data-playback', 'playing');
	await expect(stage.locator('.sr-live')).toContainText('MRI ordered');
	await stage.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'paused');
	await stage.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '1');
	await stage.getByRole('button', { name: 'Previous', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '0');
	await stage.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'playing');
	await stage.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'paused');
	await stage.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(root).toHaveAttribute('data-step', '0');
	await expect(root).toHaveAttribute('data-failure', 'none');
	await expect(root).toHaveAttribute('data-view', 'journey');
});

for (const baseline of baselines) {
	test(`${baseline.label} baseline lands on its exact ledger totals`, async ({ page }) => {
		const stage = await enterStage(page, baseline.pathway);
		await setStep(stage, 11);
		await assertExactClocks(stage, baseline);
		const culmination = stage.getByTestId('journey-culmination');
		expect(normalizedText(await culmination.innerText())).toContain(
			'In this fictional case, one transaction took 400 ms. The journey took 11 days.'
		);
		if (baseline.pathway === 'portal-fax') {
			await expect(culmination).toContainText('selected portal/fax baseline took 18 days');
		}
		await expect(stage.getByTestId('event-ledger')).toContainText('exact fixture values');

		if (baseline.pathway === 'fhir-enabled') {
			const ledger = stage.getByTestId('event-ledger');
			await ledger.locator('summary').click();
			await expect(ledger.getByRole('row').filter({ hasText: '400 ms' })).toHaveCount(1);
		}
	});
}

test('baseline progression skips unvisited optional branches in manual and timed playback', async ({
	page
}) => {
	test.setTimeout(90_000);
	const stage = await enterStage(page, 'fhir-enabled');
	await setStep(stage, 7);
	await stage.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '10');
	await stage.getByRole('button', { name: 'Previous', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '7');

	await setStep(stage, 8);
	await expect(
		stage.locator('.workflow-figure .node-bypassed[data-milestone-id="more-information-requested"]')
	).toBeVisible();
	await expect(stage.locator('.inspector')).toContainText(/optional branch was not visited/iu);
	await expect(stage.locator('.workflow-figure .token')).toHaveCount(0);
	await stage.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '10');
	await expect(stage).toHaveAttribute('data-playback', 'playing');
	await stage.getByRole('button', { name: 'Pause', exact: true }).click();

	await setStep(stage, 7);
	await selectRadio(stage, '1.5×');
	await stage.evaluate((element) => {
		const seen = [Number(element.getAttribute('data-step'))];
		const observer = new MutationObserver(() => {
			seen.push(Number(element.getAttribute('data-step')));
		});
		observer.observe(element, { attributes: true, attributeFilter: ['data-step'] });
		const state = window as Window & {
			__paSeenSteps?: number[];
			__paStepObserver?: MutationObserver;
		};
		state.__paSeenSteps = seen;
		state.__paStepObserver = observer;
	});
	await stage.getByRole('button', { name: 'Replay journey', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'complete', { timeout: 35_000 });
	const seenSteps = await page.evaluate(() => {
		const state = window as Window & {
			__paSeenSteps?: number[];
			__paStepObserver?: MutationObserver;
		};
		state.__paStepObserver?.disconnect();
		return state.__paSeenSteps ?? [];
	});
	expect(seenSteps).toContain(10);
	expect(seenSteps).toContain(11);
	expect(seenSteps).not.toContain(8);
	expect(seenSteps).not.toContain(9);
});

test('compact baseline navigation retains bypass truth during manual inspection', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	const compact = root.getByTestId('compact-journey');
	await compact.getByRole('button', { name: 'FHIR-enabled', exact: true }).click();
	await compact.locator('[data-milestone-id="payer-review"] button').click();
	await expect(compact).toHaveAttribute('data-step', '7');
	await compact.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(compact).toHaveAttribute('data-step', '10');
	await compact.getByRole('button', { name: 'Previous', exact: true }).click();
	await expect(compact).toHaveAttribute('data-step', '7');

	for (const [index, milestone] of [
		[8, 'more-information-requested'],
		[9, 'request-supplemented']
	] as const) {
		const card = compact.locator(`[data-milestone-id="${milestone}"]`);
		await expect(card).toHaveClass(/status-bypassed/u);
		await card.locator('button').click();
		await expect(compact).toHaveAttribute('data-step', String(index));
		await expect(card).toHaveClass(/status-bypassed/u);
	}
});

test('clinically insufficient playback terminates at denial and leaves scheduling unvisited', async ({
	page
}) => {
	const stage = await enterStage(page, 'fhir-enabled');
	await stage.locator('[data-failure-id="clinically-insufficient"]').click();
	await setStep(stage, 9);
	await stage.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '10');
	await expect(stage).toHaveAttribute('data-playback', 'complete');
	await expect(stage.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await expect(stage.getByTestId('journey-culmination')).toContainText(
		'Selected exception culmination'
	);
	await expect(
		stage.locator(
			'.workflow-figure .node-bypassed[data-milestone-id="scheduled-and-scan-received"]'
		)
	).toBeVisible();

	await setStep(stage, 11);
	await expect(stage).toHaveAttribute('data-authorization-status', 'denied');
	await expect(stage).toHaveAttribute('data-final-outcome', 'denied');
	await expect(stage.locator('.inspector')).toContainText(/branch was not visited/iu);
	await expect(stage.locator('.workflow-figure .token')).toHaveCount(0);
	await stage.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '10');
	await expect(stage).toHaveAttribute('data-playback', 'complete');
});

test('scenario assumptions expose exact wall segments separately from UI tolerances', async ({
	page
}) => {
	const stage = await enterStage(page, 'fhir-enabled');
	await stage.locator('[data-failure-id="clinically-insufficient"]').click();
	const assumptions = experience(page).getByTestId('scenario-assumptions');
	await assumptions.locator('summary').click();
	await expect(
		assumptions.getByText('Exact inside this synthetic case—not empirical estimates')
	).toBeVisible();
	await expect(assumptions).toContainText(
		'FHIR-enabled baseline journey ends after exactly 11 modeled days'
	);
	await expect(assumptions).toContainText('400 ms');
	await expect(assumptions.locator('.exact')).toContainText('Baseline compiled totals: 1 h 4 min');
	await expect(assumptions.locator('.exact')).toContainText('2.88 s automated processing');
	await expect(assumptions.getByText('The counterfactual comparison').locator('..')).toContainText(
		'16 days versus 8 days'
	);
	await expect(assumptions).toContainText('Rendering may have tolerances; bookkeeping does not');

	const groups = assumptions.locator('.segment-group');
	await expect(groups).toHaveCount(2);
	for (const [index, current] of [
		{ label: 'Portal and fax clinically-insufficient path', patientMs: 16 * dayMs },
		{ label: 'FHIR-enabled clinically-insufficient path', patientMs: 8 * dayMs }
	].entries()) {
		const group = groups.nth(index);
		await expect(group.locator('[data-wall-category]')).not.toHaveCount(0);
		const totalMs = await group
			.locator('[data-duration-ms]')
			.evaluateAll((segments) =>
				segments.reduce(
					(total, segment) => total + Number(segment.getAttribute('data-duration-ms')),
					0
				)
			);
		expect(totalMs, `${current.label} authored wall segments`).toBe(current.patientMs);
	}
});

test('comparison aligns both pathways without changing their exact totals', async ({ page }) => {
	const stage = await enterStage(page);
	await setStep(stage, 7);
	await stage.getByRole('button', { name: 'Compare pathways', exact: true }).click();
	await expect(stage).toHaveAttribute('data-view', 'compare');
	await expect(stage).toHaveAttribute('data-step', '7');

	const comparison = stage.getByTestId('pathway-comparison');
	await expect(comparison).toBeVisible();
	await expect(comparison).toContainText('Same patient. Same policy. Different plumbing.');
	const clocks = comparison.locator('.clock-panel');
	await expect(clocks).toHaveCount(2);
	await expect(clocks.nth(0)).toHaveAttribute('data-clock-patient-ms', String(18 * dayMs));
	await expect(clocks.nth(1)).toHaveAttribute('data-clock-patient-ms', String(11 * dayMs));
	await expect(comparison.locator('[data-compare-milestone]')).toHaveCount(12);
	await expect(comparison.locator('[data-patient-delta-minutes]')).toHaveAttribute(
		'data-patient-delta-minutes',
		'10080'
	);
	await expect(comparison.locator('[data-human-delta-seconds]')).toHaveAttribute(
		'data-human-delta-seconds',
		'5520'
	);
	await expect(comparison.locator('[data-machine-delta-ms]')).toHaveAttribute(
		'data-machine-delta-ms',
		'1250'
	);
	const roleTable = comparison
		.getByRole('region', { name: 'Human work by role and pathway' })
		.getByRole('table');
	await expect(roleTable).toBeVisible();
	await expect(roleTable.getByRole('row')).toHaveCount(4);
});

for (const failure of failures) {
	test(`failure fixture ${failure.id} recompiles the ledger and exposes its consequence`, async ({
		page
	}) => {
		const stage = await enterStage(page, 'fhir-enabled');
		await setStep(stage, 10);
		await stage.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(stage).toHaveAttribute('data-playback', 'playing');
		await stage.locator(`[data-failure-id="${failure.id}"]`).click();
		await expect(stage).toHaveAttribute('data-failure', failure.id);
		await expect(stage).toHaveAttribute('data-playback', 'paused');
		await expect(stage).toHaveAttribute('data-step', String(failure.rewindStep));

		const inspector = stage.locator(`[data-selected-failure="${failure.id}"]`);
		await expect(inspector).toBeVisible();
		await expect(inspector).toContainText(failure.technicalStatus);
		await expect(inspector).toContainText(failure.businessStatus);
		await expect(inspector).toHaveAttribute(
			'data-authorization-status',
			failure.authorizationStatus
		);
		await expect(inspector).toHaveAttribute('data-final-outcome', failure.finalOutcome);
		await expect(inspector).toContainText(failure.consequence);

		await setStep(stage, 11);
		await expect(stage).toHaveAttribute(
			'data-clock-patient-ms',
			String(failure.patientDays['fhir-enabled'] * dayMs)
		);
		const ledger = stage.getByTestId('event-ledger');
		await ledger.locator('summary').click();
		await expect(ledger).toContainText(`Caused by: ${failure.id}`);

		if (failure.id === 'clinically-insufficient') {
			await expect(stage).toHaveAttribute('data-authorization-status', 'denied');
			await expect(stage).toHaveAttribute('data-final-outcome', 'denied');
			await expect(
				ledger
					.getByRole('row')
					.filter({ hasText: /pended/iu })
					.first()
			).toBeVisible();
			await expect(
				ledger
					.getByRole('row')
					.filter({ hasText: /denied/iu })
					.first()
			).toBeVisible();
			await selectRadio(stage, 'Architect');
			await setStep(stage, 10);
			const eventInspector = stage.locator('.inspector');
			await expect(eventInspector).toContainText('ClaimResponse/pas-denied');
			await expect(eventInspector).toContainText(/accepted/iu);
			await expect(eventInspector).toContainText(/denied/iu);
			await eventInspector.locator('details.fixture > summary').click();
			await expect(eventInspector.locator('pre')).toContainText('"resourceType": "ClaimResponse"');
			await expect(eventInspector.locator('pre')).toContainText('"id": "pas-denied"');
			await expect(eventInspector.locator('pre')).toContainText('"outcome": "complete"');
		}
		if (failure.id === 'authorization-expired') {
			await expect(
				ledger
					.getByRole('row')
					.filter({ hasText: /expired/iu })
					.first()
			).toBeVisible();
		}
	});
}

test('canonical copied URL restores path, view, failure, step and perspective after reload', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const stage = await enterStage(page, 'fhir-enabled');
	await stage.locator('[data-failure-id="identity-mismatch"]').click();
	await setStep(stage, 7);
	await selectRadio(stage, 'Architect');
	await stage.getByRole('button', { name: 'Compare pathways', exact: true }).click();
	await page.evaluate(() => {
		const polluted = new URL(window.location.href);
		polluted.searchParams.set('patient', 'Maya Sen');
		polluted.searchParams.set('token', 'must-not-survive');
		history.replaceState(history.state, '', polluted);
	});
	await stage.getByRole('button', { name: 'Copy this view', exact: true }).click();
	await expect(stage).toContainText('Canonical view URL copied.');

	const copied = await page.evaluate(() => navigator.clipboard.readText());
	const copiedUrl = new URL(copied);
	expect(copiedUrl.pathname).toBe(articlePath);
	const expectedSearch =
		'pa_v=1&path=fhir-enabled&view=compare&failure=identity-mismatch&step=7&perspective=architect';
	expect(copiedUrl.searchParams.toString()).toBe(expectedSearch);
	expect(new URL(page.url()).searchParams.toString()).toBe(expectedSearch);

	await page.reload({ waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-path', 'fhir-enabled');
	await expect(root).toHaveAttribute('data-failure', 'identity-mismatch');
	await expect(root).toHaveAttribute('data-step', '7');
	await expect(root).toHaveAttribute('data-perspective', 'architect');
	await expect(root).toHaveAttribute('data-view', 'compare');
	const restoredStage = root.getByTestId('machine-stage');
	if ((await restoredStage.count()) === 0) {
		await expect(root).toHaveAttribute('data-hydrated', 'true');
		await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	}
	await expect(root.getByTestId('machine-stage')).toHaveAttribute('data-step', '7');
});

test('both pathways and all four failures reproduce exactly after reload', async ({ page }) => {
	for (const baseline of baselines) {
		for (const failure of failures) {
			const source = new URLSearchParams({
				pa_v: '1',
				path: baseline.pathway,
				view: 'journey',
				failure: failure.id,
				step: '11',
				perspective: 'architect',
				patient: 'must-not-be-shared',
				token: 'must-not-be-shared'
			});
			await page.goto(`${articlePath}?${source}`, { waitUntil: 'domcontentloaded' });

			const root = experience(page);
			await expect(root).toHaveAttribute('data-hydrated', 'true');
			await expect(root).toHaveAttribute('data-path', baseline.pathway);
			await expect(root).toHaveAttribute('data-view', 'journey');
			await expect(root).toHaveAttribute('data-failure', failure.id);
			await expect(root).toHaveAttribute('data-step', '11');
			await expect(root).toHaveAttribute('data-perspective', 'architect');
			await expect(root).toHaveAttribute(
				'data-authorization-status',
				failure.finalAuthorizationStatus
			);
			await expect(root).toHaveAttribute('data-final-outcome', failure.finalOutcome);
			await expect(root).toHaveAttribute(
				'data-clock-patient-ms',
				String(failure.patientDays[baseline.pathway] * dayMs)
			);

			const canonical = new URLSearchParams({ pa_v: '1' });
			if (baseline.pathway !== 'portal-fax') canonical.set('path', baseline.pathway);
			canonical.set('failure', failure.id);
			canonical.set('step', '11');
			canonical.set('perspective', 'architect');
			await expect
				.poll(() => new URL(page.url()).searchParams.toString())
				.toBe(canonical.toString());

			await page.reload({ waitUntil: 'domcontentloaded' });
			const restored = experience(page);
			await expect(restored).toHaveAttribute('data-hydrated', 'true');
			await expect(restored).toHaveAttribute('data-path', baseline.pathway);
			await expect(restored).toHaveAttribute('data-failure', failure.id);
			await expect(restored).toHaveAttribute('data-step', '11');
			await expect(restored).toHaveAttribute('data-perspective', 'architect');
			await expect(restored).toHaveAttribute(
				'data-authorization-status',
				failure.finalAuthorizationStatus
			);
			await expect(restored).toHaveAttribute('data-final-outcome', failure.finalOutcome);
			await expect(restored).toHaveAttribute(
				'data-clock-patient-ms',
				String(failure.patientDays[baseline.pathway] * dayMs)
			);
		}
	}
});

test('perspective changes annotations but not clocks, and pathway switching preserves milestone', async ({
	page
}) => {
	const stage = await enterStage(page);
	await setStep(stage, 7);
	const before = {
		patient: await stage.getAttribute('data-clock-patient-ms'),
		human: await stage.getAttribute('data-clock-human-seconds'),
		machine: await stage.getAttribute('data-clock-machine-ms')
	};
	const patientText = await stage.locator('.inspector .narrative').innerText();

	await selectRadio(stage, 'Clinician');
	await expect(stage).toHaveAttribute('data-perspective', 'clinician');
	expect(await stage.locator('.inspector .narrative').innerText()).not.toBe(patientText);
	await expect(stage).toHaveAttribute('data-clock-patient-ms', before.patient ?? '');
	await expect(stage).toHaveAttribute('data-clock-human-seconds', before.human ?? '');
	await expect(stage).toHaveAttribute('data-clock-machine-ms', before.machine ?? '');

	await selectRadio(stage, 'Architect');
	await expect(stage).toHaveAttribute('data-perspective', 'architect');
	await expect(stage).toHaveAttribute('data-clock-patient-ms', before.patient ?? '');
	await selectPathway(stage.getByTestId('pathway-selector'), 'FHIR-enabled');
	await expect(stage).toHaveAttribute('data-path', 'fhir-enabled');
	await expect(stage).toHaveAttribute('data-step', '7');
});

test('reduced motion is a stable, manual route with autoplay and tweening disabled', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const stage = await enterStage(page, 'fhir-enabled');
	await expect(stage).toHaveAttribute('data-motion-policy', 'stable-states');
	await expect(stage.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
	await expect(stage.getByText(/Reduced motion is active/iu)).toBeVisible();
	const clockBefore = await stage.getAttribute('data-clock-patient-ms');
	await page.waitForTimeout(450);
	expect(await stage.getAttribute('data-clock-patient-ms')).toBe(clockBefore);
	await stage.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(stage).toHaveAttribute('data-step', '1');
	const token = stage.locator('.workflow-figure .token');
	await expect(token).toHaveCount(1);
	const transitionSeconds = await token.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).transitionDuration)
	);
	expect(transitionSeconds * 1_000).toBeLessThanOrEqual(0.011);
});

test('portrait uses the compact journey without instantiating the wide stage', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	const compact = root.getByTestId('compact-journey');
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await expect(root).toHaveAttribute('data-started', 'false');
	await expect(compact).toHaveAttribute('data-started', 'false');
	await expect(compact).toBeVisible();
	await expect(root.getByTestId('prior-authorization-poster')).toBeVisible();
	await expect(root.getByTestId('machine-stage')).toHaveCount(0);
	await expect(compact.locator('[data-milestone-id]')).toHaveCount(12);
	await expect(compact.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await expect(compact.getByRole('button', { name: 'FHIR-enabled', exact: true })).toBeDisabled();
	await expect(compact.getByRole('radio', { name: 'Architect', exact: true })).toBeDisabled();
	await expect(compact.locator('[data-failure-id="identity-mismatch"]')).toBeDisabled();
	await expect(compact.locator('[data-milestone-id="coverage-checked"] button')).toBeDisabled();
	await expect(
		root.locator('.hero').getByRole('radio', { name: /^Portal and fax/u })
	).toBeEnabled();
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	await expect(root).toHaveAttribute('data-started', 'true');
	await expect(compact).toHaveAttribute('data-started', 'true');
	await expect(compact.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
	await expect(compact.getByRole('button', { name: 'FHIR-enabled', exact: true })).toBeEnabled();
	await expect(compact.getByRole('radio', { name: 'Architect', exact: true })).toBeEnabled();
	await expect(compact.locator('[data-failure-id="identity-mismatch"]')).toBeEnabled();
	await expect(compact.locator('[data-milestone-id="coverage-checked"] button')).toBeEnabled();
	await compact.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(compact).toHaveAttribute('data-step', '1');
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('tablets reveal a stacked full stage while a 200% zoom proxy remains compact', async ({
	page
}) => {
	for (const viewport of [
		{ name: '1024×768 landscape tablet', width: 1_024, height: 768 },
		{ name: '768×1024 portrait tablet', width: 768, height: 1_024 }
	]) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		const root = experience(page);
		await expect(root, viewport.name).toHaveAttribute('data-hydrated', 'true');
		await expect(root, viewport.name).toHaveAttribute('data-eligibility', 'wide-stage');
		await expect(root.getByTestId('compact-journey'), viewport.name).toBeVisible();
		await expect(root.getByTestId('machine-stage'), viewport.name).toHaveCount(0);
		await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();

		const stage = root.getByTestId('machine-stage');
		await expect(stage, viewport.name).toBeVisible({ timeout: 30_000 });
		await expect(stage, viewport.name).toHaveAttribute('data-layout', 'stacked');
		await setStep(stage, 7);
		const clockLayout = await stage
			.locator('.clock-panel')
			.first()
			.evaluate((panel) => {
				const panelBox = panel.getBoundingClientRect();
				const cells = [...panel.querySelectorAll<HTMLElement>('.clock')];
				const boxes = cells.map((cell) => cell.getBoundingClientRect());
				const overlapCount = boxes.flatMap((left, index) =>
					boxes.slice(index + 1).filter((right) => {
						const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
						const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
						return horizontal > 1 && vertical > 1;
					})
				).length;
				return {
					overlapCount,
					contained: boxes.every(
						(box) => box.left >= panelBox.left - 1 && box.right <= panelBox.right + 1
					),
					cellOverflow: cells.map((cell) => cell.scrollWidth - cell.clientWidth),
					readoutOverflow: [...panel.querySelectorAll<HTMLElement>('dd > data')].map(
						(readout) => readout.scrollWidth - readout.clientWidth
					)
				};
			});
		expect(clockLayout.overlapCount, `${viewport.name} clock overlap`).toBe(0);
		expect(clockLayout.contained, `${viewport.name} clocks within panel`).toBe(true);
		expect(
			Math.max(...clockLayout.cellOverflow),
			`${viewport.name} clock content overflow`
		).toBeLessThanOrEqual(1);
		expect(
			Math.max(...clockLayout.readoutOverflow),
			`${viewport.name} exact clock readout truncation`
		).toBeLessThanOrEqual(1);
		const layout = await stage.evaluate((element) => {
			const grid = element.querySelector<HTMLElement>('.machine-grid')?.getBoundingClientRect();
			const graph = element.querySelector<HTMLElement>('.workflow-figure')?.getBoundingClientRect();
			const inspector = element.querySelector<HTMLElement>('.inspector')?.getBoundingClientRect();
			if (!grid || !graph || !inspector) return null;
			return {
				gridWidth: grid.width,
				graphWidth: graph.width,
				graphBottom: graph.bottom,
				inspectorWidth: inspector.width,
				inspectorTop: inspector.top,
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				stageOverflow: element.scrollWidth - element.clientWidth
			};
		});
		expect(layout, `${viewport.name} layout`).not.toBeNull();
		expect(
			layout?.inspectorTop ?? 0,
			`${viewport.name} inspector follows graph`
		).toBeGreaterThanOrEqual((layout?.graphBottom ?? 0) - 1);
		expect(
			Math.abs((layout?.graphWidth ?? 0) - (layout?.gridWidth ?? 0)),
			`${viewport.name} graph is full width`
		).toBeLessThanOrEqual(2);
		expect(
			Math.abs((layout?.inspectorWidth ?? 0) - (layout?.gridWidth ?? 0)),
			`${viewport.name} inspector is full width`
		).toBeLessThanOrEqual(2);
		expect(layout?.documentOverflow, `${viewport.name} document`).toBeLessThanOrEqual(1);
		expect(layout?.stageOverflow, `${viewport.name} feature`).toBeLessThanOrEqual(1);
	}

	// A 1440-pixel device viewport at 200% browser zoom exposes about 720 CSS pixels.
	await page.setViewportSize({ width: 720, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await expect(root).toHaveAttribute('data-eligibility', 'compact-route');
	await expect(root).toHaveAttribute('data-started', 'false');
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	const compact = root.getByTestId('compact-journey');
	await expect(root).toHaveAttribute('data-started', 'true');
	await expect(compact).toHaveAttribute('data-started', 'true');
	await expect(compact).toBeVisible();
	await expect(root.getByTestId('machine-stage')).toHaveCount(0);
	const zoomGeometry = await root.evaluate((element) => {
		const ledgerViewport = element.querySelector<HTMLElement>('.table-wrap');
		const rootBox = element.getBoundingClientRect();
		const ledgerBox = ledgerViewport?.getBoundingClientRect();
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			ledgerContained:
				Boolean(ledgerBox) &&
				(ledgerBox?.left ?? 0) >= rootBox.left - 1 &&
				(ledgerBox?.right ?? 0) <= rootBox.right + 1,
			ledgerScrollsInternally: Boolean(
				ledgerViewport &&
				getComputedStyle(ledgerViewport).overflowX === 'auto' &&
				ledgerViewport.scrollWidth > ledgerViewport.clientWidth
			)
		};
	});
	expect(zoomGeometry.documentOverflow, '200% zoom proxy document').toBeLessThanOrEqual(1);
	expect(zoomGeometry.ledgerContained, '200% zoom proxy ledger viewport').toBe(true);
	expect(zoomGeometry.ledgerScrollsInternally, 'wide ledger remains independently scrollable').toBe(
		true
	);
});

test('paper, light, night, high-contrast and forced-colour modes retain boundaries', async ({
	page
}) => {
	const stage = await enterStage(page, 'fhir-enabled');
	await setStep(stage, 7);

	for (const theme of ['paper', 'light', 'night', 'high-contrast']) {
		await selectTheme(page, theme as 'paper' | 'light' | 'night' | 'high-contrast');
		const boundary = await stage.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				background: style.backgroundColor,
				border: style.borderTopColor,
				borderWidth: Number.parseFloat(style.borderTopWidth),
				foreground: style.color
			};
		});
		expect(boundary.borderWidth, `${theme} stage border`).toBeGreaterThanOrEqual(1);
		expect(boundary.border, `${theme} boundary colour`).not.toBe(boundary.background);
		expect(boundary.foreground, `${theme} foreground`).not.toBe(boundary.background);
	}

	await page.emulateMedia({ forcedColors: 'active' });
	await expect(experience(page)).toHaveClass(/high-contrast/u);
	await expect(stage.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
});

test('the no-JavaScript phone route retains the exact title, poster, journey and failures', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	const diagnostics = observeRuntime(page, { allowNoJavaScriptAssetCsp: true });
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		const heading = page.getByRole('heading', { level: 1 });
		await expect(heading).toHaveCount(1);
		expect(normalizedText(await heading.innerText())).toBe(articleTitle);
		await expect(page.getByTestId('prior-authorization-poster')).toBeVisible();
		await expect(page.getByTestId('compact-journey')).toBeVisible();
		await expect(page.getByTestId('machine-stage')).toHaveCount(0);
		const poster = page.getByTestId('prior-authorization-poster');
		const root = experience(page);
		await expect(root).toHaveAttribute('data-hydrated', 'false');
		await expect(root).toHaveAttribute('data-started', 'false');
		await expect(page.getByTestId('compact-journey')).toHaveAttribute('data-started', 'false');
		await expect(poster.getByText('18 days', { exact: true }).first()).toBeVisible();
		await expect(poster.getByText('11 days', { exact: true }).first()).toBeVisible();
		await expect(poster).toContainText('exactly 400 ms');
		const noScriptRoute = page.locator('.no-script-route');
		await expect(noScriptRoute).toBeVisible();
		await expect(noScriptRoute).toContainText('18 days patient elapsed');
		await expect(noScriptRoute).toContainText('11 days patient elapsed');
		await expect(noScriptRoute).toContainText('exactly 400 ms');
		await expect(noScriptRoute.locator('ol > li')).toHaveCount(12);
		const compact = page.getByTestId('compact-journey');
		for (const failure of failures) {
			await expect(
				compact.getByRole('button', { name: new RegExp(`^${failure.label}\\b`, 'u') })
			).toBeVisible();
			await expect(noScriptRoute).toContainText(failure.consequence);
		}
		await expect(
			root.getByRole('button', { name: 'Begin the journey', exact: true })
		).toBeDisabled();
		await expect(
			root.locator('.hero').getByRole('radio', { name: /^Portal and fax/u })
		).toBeDisabled();
		await expect(compact.getByRole('button', { name: 'FHIR-enabled', exact: true })).toBeDisabled();
		await expect(compact.getByRole('radio', { name: 'Patient', exact: true })).toBeDisabled();
		await expect(compact.locator('[data-failure-id="identity-mismatch"]')).toBeDisabled();
		await expect(compact.locator('[data-milestone-id="coverage-checked"] button')).toBeDisabled();
		await expect(compact.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
		await assertNoRuntimeDiagnostics(diagnostics);
	} finally {
		await context.close();
	}
});

test('the compact accessibility tree has a coherent reading order', async ({ page }) => {
	test.info().annotations.push({
		type: 'test limitation',
		description:
			'This inspects Chromium’s accessibility tree; it is not a manual NVDA, JAWS or VoiceOver session.'
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	const ariaTree = await root.ariaSnapshot();
	const readingOrder = [
		articleTitle,
		'Choose a pathway',
		'Begin the journey',
		'Follow Maya without the wide diagram',
		'Compact journey milestones',
		'What broke?',
		'Authoritative event ledger'
	];
	let previousIndex = -1;
	for (const text of readingOrder) {
		const index = ariaTree.indexOf(text);
		expect(index, `accessibility tree contains “${text}”`).toBeGreaterThan(-1);
		expect(index, `“${text}” follows the prior landmark/control`).toBeGreaterThan(previousIndex);
		previousIndex = index;
	}
});

test('a touch-capable phone can operate compact controls with 44px targets', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	const diagnostics = observeRuntime(page);
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		const root = experience(page);
		await expect(root).toHaveAttribute('data-hydrated', 'true');
		await expect(root).toHaveAttribute('data-eligibility', 'compact-route');
		await expect(root).toHaveAttribute('data-started', 'false');
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

		const compact = root.getByTestId('compact-journey');
		await root.getByRole('button', { name: 'Begin the journey', exact: true }).tap();
		await expect(root).toHaveAttribute('data-started', 'true');
		await expect(compact).toHaveAttribute('data-started', 'true');
		const pathway = compact.getByRole('button', { name: 'FHIR-enabled', exact: true });
		const failure = compact.locator('[data-failure-id="identity-mismatch"]');
		const milestone = compact.locator('[data-milestone-id="coverage-checked"] button');
		const next = compact.getByRole('button', { name: 'Next', exact: true });
		for (const [name, target] of [
			['pathway', pathway],
			['failure', failure],
			['milestone', milestone],
			['next', next]
		] as const) {
			const size = await target.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return { width: rect.width, height: rect.height };
			});
			expect(size.width, `${name} touch-target width`).toBeGreaterThanOrEqual(44);
			expect(size.height, `${name} touch-target height`).toBeGreaterThanOrEqual(44);
		}

		await pathway.tap();
		await expect(root).toHaveAttribute('data-path', 'fhir-enabled');
		await failure.tap();
		await expect(root).toHaveAttribute('data-failure', 'identity-mismatch');
		await next.tap();
		await expect(compact).toHaveAttribute('data-step', '1');
		await assertNoRuntimeDiagnostics(diagnostics);
	} finally {
		await context.close();
	}
});

test('phone Architect view exposes the canonical denied fixture and download', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	const compact = root.getByTestId('compact-journey');
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	await expect(compact).toHaveAttribute('data-started', 'true');
	await compact.getByRole('button', { name: 'FHIR-enabled', exact: true }).click();
	await selectRadio(compact, 'Architect');
	await compact.locator('[data-failure-id="clinically-insufficient"]').click();
	await compact.locator('[data-milestone-id="decision-issued"] button').click();

	const inspector = compact.locator('.inspector');
	await expect(inspector).toHaveAttribute('data-authorization-status', 'denied');
	await expect(inspector).toHaveAttribute('data-final-outcome', 'denied');
	await expect(inspector).toContainText('ClaimResponse/pas-denied');
	await inspector.locator('details.fixture > summary').click();
	await expect(inspector.locator('pre')).toContainText('"id": "pas-denied"');
	const download = inspector.getByRole('link', { name: 'Download full synthetic fixture' });
	await expect(download).toHaveAttribute(
		'href',
		'/data/prior-authorization/maya-lumbar-mri-fhir-r4.json'
	);
	await expect(download).toHaveAttribute('download', '');
});

test('keyboard alone begins and completes the journey while stage shortcuts remain scoped', async ({
	page
}) => {
	await page.setViewportSize({ width: 1_440, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	const begin = root.getByRole('button', { name: 'Begin the journey', exact: true });
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await expect(root).toHaveAttribute('data-eligibility', 'wide-stage');
	await begin.focus();
	await page.keyboard.press('Enter');
	const stage = root.getByTestId('machine-stage');
	await expect(stage).toBeVisible({ timeout: 30_000 });
	await stage.focus();
	await page.keyboard.press('ArrowRight');
	await expect(stage).toHaveAttribute('data-step', '1');
	await page.keyboard.press('End');
	await expect(stage).toHaveAttribute('data-step', '11');
	await assertExactClocks(stage, baselines[0]);
	await page.keyboard.press('Home');
	await expect(stage).toHaveAttribute('data-step', '0');
	await page.keyboard.press('r');
	await expect(stage).toHaveAttribute('data-step', '0');
});

test('hidden and offscreen stages pause without advancing ledger facts', async ({ page }) => {
	const stage = await enterStage(page);
	await setStep(stage, 2);
	await stage.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'playing');
	const beforeHidden = {
		step: await stage.getAttribute('data-step'),
		patient: await stage.getAttribute('data-clock-patient-ms')
	};
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(stage).toHaveAttribute('data-playback', 'paused');
	await expect(stage).toContainText('Paused while this document was hidden.');
	await page.waitForTimeout(350);
	await expect(stage).toHaveAttribute('data-step', beforeHidden.step ?? '');
	await expect(stage).toHaveAttribute('data-clock-patient-ms', beforeHidden.patient ?? '');

	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await stage.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(stage).toHaveAttribute('data-playback', 'playing');
	await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' }));
	await expect(stage).toHaveAttribute('data-playback', 'paused');
	await expect(stage).toContainText('Paused because the stage moved offscreen.');
});

test('fullscreen enters and Escape exits when the browser exposes the API', async ({ page }) => {
	const stage = await enterStage(page);
	const fullScreen = stage.getByRole('button', { name: 'Full screen', exact: true });
	if ((await fullScreen.count()) === 0) {
		test.info().annotations.push({
			type: 'browser capability',
			description: 'Headless Chromium did not expose the Fullscreen API.'
		});
		return;
	}

	await fullScreen.click();
	await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
	await page.keyboard.press('Escape');
	await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
	await expect(stage).toHaveAttribute('data-playback', 'paused');
});

test('feature-scoped axe checks pass for static and interactive routes', async ({ page }) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const staticResults = await new AxeBuilder({ page })
		.include('[data-testid="prior-authorization-machine"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(staticResults.violations).toEqual([]);

	const stage = await enterStage(page, 'fhir-enabled');
	await setStep(stage, 6);
	const interactiveResults = await new AxeBuilder({ page })
		.include('[data-testid="prior-authorization-machine"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(interactiveResults.violations).toEqual([]);
});

test('visual regression: 1440 cold open, active state, comparison and 1280 loop', async ({
	page
}) => {
	// The config's declared 1.2% pixel allowance covers raster variation only, never ledger facts.
	await page.setViewportSize({ width: 1_440, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(experience(page)).toHaveAttribute('data-hydrated', 'true');
	await selectTheme(page, 'paper');
	await expect(page).toHaveScreenshot('prior-authorization-1440-paper-cold-open.png');

	const wideStage = await enterStage(page, 'fhir-enabled');
	await selectTheme(page, 'paper');
	await setStep(wideStage, 6);
	await selectRadio(wideStage, 'Architect');
	await expect(page).toHaveScreenshot('prior-authorization-1440-paper-technical-receipt.png');
	await setStep(wideStage, 11);
	await wideStage.getByRole('button', { name: 'Compare pathways', exact: true }).click();
	await expect(page).toHaveScreenshot('prior-authorization-1440-paper-completed-comparison.png');

	await wideStage.getByRole('button', { name: 'Return to machine', exact: true }).click();
	await page.setViewportSize({ width: 1_280, height: 720 });
	await selectTheme(page, 'high-contrast');
	await wideStage.locator('[data-failure-id="clinically-insufficient"]').click();
	await setStep(wideStage, 8);
	await expect(page).toHaveScreenshot(
		'prior-authorization-1280-high-contrast-additional-information.png'
	);
});

test('visual regression: tablet, reduced-motion, forced-colour and zoom states', async ({
	page
}) => {
	await page.setViewportSize({ width: 1_024, height: 768 });
	const landscapeTablet = await enterStage(page, 'fhir-enabled');
	await selectTheme(page, 'night');
	await landscapeTablet.locator('[data-failure-id="clinically-insufficient"]').click();
	await selectRadio(landscapeTablet, 'Architect');
	await setStep(landscapeTablet, 10);
	await expect(page).toHaveScreenshot('prior-authorization-1024-night-denial.png');

	await page.emulateMedia({ forcedColors: 'active' });
	await expect(experience(page)).toHaveClass(/high-contrast/u);
	await expect(page).toHaveScreenshot('prior-authorization-1024-forced-colour-denial.png');

	await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 768, height: 1_024 });
	const portraitTablet = await enterStage(page, 'fhir-enabled');
	await selectTheme(page, 'light');
	await expect(portraitTablet).toHaveAttribute('data-motion-policy', 'stable-states');
	await setStep(portraitTablet, 7);
	await expect(page).toHaveScreenshot('prior-authorization-768-light-reduced-motion.png');

	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 720, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const compact = experience(page).getByTestId('compact-journey');
	await expect(experience(page)).toHaveAttribute('data-hydrated', 'true');
	await expect(experience(page)).toHaveAttribute('data-started', 'false');
	await expect(compact).toBeVisible();
	await experience(page).getByRole('button', { name: 'Begin the journey', exact: true }).click();
	await expect(compact).toHaveAttribute('data-started', 'true');
	await compact.getByRole('button', { name: 'FHIR-enabled', exact: true }).click();
	await compact.locator('[data-failure-id="narrative-only"]').click();
	await expect(page).toHaveScreenshot('prior-authorization-720-zoom-proxy.png');
});

test('visual regression: 390 portrait compact expiry', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-hydrated', 'true');
	await selectTheme(page, 'paper');
	const compact = root.getByTestId('compact-journey');
	await expect(compact).toBeVisible();
	await expect(root).toHaveAttribute('data-started', 'false');
	await root.getByRole('button', { name: 'Begin the journey', exact: true }).click();
	await expect(compact).toHaveAttribute('data-started', 'true');
	await compact.getByRole('button', { name: 'FHIR-enabled', exact: true }).click();
	await compact.locator('[data-failure-id="authorization-expired"]').click();
	await compact.locator('[data-milestone-id="scheduled-and-scan-received"] button').click();
	await expect(page).toHaveScreenshot('prior-authorization-390-paper-expired.png');
});
