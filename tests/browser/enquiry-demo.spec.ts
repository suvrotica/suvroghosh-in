import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const route = '/demos/customer-enquiries';
const api = `${route}/api`;
const password = process.env.ENQUIRY_DEMO_BROWSER_PASSWORD || 'browser-demo-password-2026';
const screenshotDirectory = resolve('artifacts/enquiry-demo');
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	pageErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
	expect(
		pageErrors.get(page) || [],
		'The demonstration should have no uncaught browser errors.'
	).toEqual([]);
});

async function ready(page: Page, view = '') {
	await page.goto(`${route}${view ? `?view=${view}` : ''}`, { waitUntil: 'domcontentloaded' });
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	await expect(page.getByRole('navigation', { name: 'Demonstration navigation' })).toBeVisible();
}

async function post(page: Page, payload: Record<string, unknown>) {
	const result = await page.request.post(api, {
		data: payload,
		headers: { origin: new URL(page.url()).origin }
	});
	if (!result.ok())
		throw new Error(
			`Demo request ${String(payload.action)} returned ${result.status()}: ${await result.text()}`
		);
	return await result.json();
}

async function detail(page: Page, reference: string) {
	const response = await page.request.get(`${api}?view=detail&ref=${reference}`);
	expect(response.ok()).toBe(true);
	return (await response.json()).enquiry;
}

async function signIn(page: Page) {
	await ready(page, 'login');
	await page.getByLabel('Staff password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in to staff desk', exact: true }).click();
	await expect(page.getByTestId('total-count')).toBeVisible();
}

async function customerSubmission(page: Page, description?: string) {
	await page.getByRole('link', { name: 'Customer form', exact: true }).click();
	await page.getByRole('button', { name: 'Fill with sample details', exact: true }).click();
	if (description)
		await page.getByLabel('Short description of the problem', { exact: true }).fill(description);
	await screenshot(page, '08-customer-form');
	await page.getByRole('button', { name: 'Save enquiry', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Your enquiry has been saved.', exact: true })
	).toBeVisible();
	const reference = (
		await page.getByTestId('receipt-reference').locator('strong').innerText()
	).trim();
	expect(reference).toMatch(/^EOS-\d{5,9}$/);
	return reference;
}

async function screenshot(page: Page, name: string) {
	for (const label of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name: label, exact: true });
		if (await button.isVisible()) await button.click();
	}
	mkdirSync(screenshotDirectory, { recursive: true });
	await page.screenshot({ path: resolve(screenshotDirectory, `${name}.png`), fullPage: true });
}

test('an unauthorized visitor cannot read enquiries or perform staff actions', async ({ page }) => {
	await ready(page);
	await expect(page.getByRole('heading', { name: /Stop losing/ })).toBeVisible();
	await expect(
		page.getByText('Demonstration only. Please use fictional details. No real emails are sent.', {
			exact: true
		})
	).toBeVisible();
	for (const query of ['?view=desk', '?view=detail&ref=EOS-00001']) {
		const response = await page.request.get(api + query);
		expect(response.status()).toBe(401);
		expect(response.headers()['cache-control']).toContain('no-store');
	}
	for (const action of ['update', 'retry', 'tick', 'sandbox', 'reset']) {
		const response = await page.request.post(api, {
			data: { action, reference: 'EOS-00001', status: 'resolved', confirmation: 'RESET DEMO' },
			headers: { origin: new URL(page.url()).origin }
		});
		expect(response.status()).toBe(401);
	}
	const foreign = await page.request.post(api, {
		data: { action: 'submit' },
		headers: { origin: 'https://unrelated.example' }
	});
	expect(foreign.status()).toBe(403);
	await screenshot(page, '01-introduction');
});

test('without JavaScript the login form posts safely and never places a password in a URL', async ({
	browser
}, testInfo) => {
	const context = await browser.newContext({
		baseURL: String(testInfo.project.use.baseURL),
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		await page.goto(`${route}?view=login`, { waitUntil: 'domcontentloaded' });
		await page.getByLabel('Staff password', { exact: true }).fill(password);
		const [response] = await Promise.all([
			page.waitForResponse(
				(result) => result.request().isNavigationRequest() && result.url().endsWith(api)
			),
			page.getByRole('button', { name: 'Sign in to staff desk', exact: true }).click()
		]);
		expect(response.request().method()).toBe('POST');
		expect(response.status()).toBe(415);
		expect(response.url()).not.toContain(password);
		expect(new URL(response.url()).search).toBe('');
		const staff = await context.request.get(`${api}?view=desk`);
		expect(staff.status()).toBe(401);
	} finally {
		await context.close();
	}
});

test('a customer enquiry is saved, assigned, handled and resolved with a separate contact record', async ({
	page
}) => {
	await signIn(page);
	await post(page, { action: 'reset', confirmation: 'RESET DEMO' });
	const reference = await customerSubmission(page);
	await screenshot(page, '02-customer-receipt');
	const saved = await detail(page, reference);
	expect(saved.ownerName).toBe('Mira Sen');
	expect(saved.status).toBe('new');
	expect(saved.firstResponseAt).toBeNull();
	expect(saved.ack.status).toBe('waiting');
	await page.getByRole('link', { name: 'Staff desk', exact: true }).click();
	await expect(page.getByTestId('total-count')).toHaveText('31');
	await screenshot(page, '09-staff-desk');
	await page.getByLabel('Find an enquiry', { exact: true }).fill(reference);
	await page.getByRole('link', { name: reference, exact: true }).click();
	await expect(page.getByTestId('ack-status')).toHaveText('Waiting to send');
	await page.getByLabel('Work status', { exact: true }).selectOption('in-progress');
	await page
		.getByLabel('Internal note (optional)', { exact: true })
		.fill('Fictional customer asked for a Tuesday maintenance visit.');
	await page.getByRole('button', { name: 'Save staff changes', exact: true }).click();
	await expect.poll(async () => (await detail(page, reference)).status).toBe('in-progress');
	expect((await detail(page, reference)).firstResponseAt).toBeNull();
	await page
		.getByRole('button', { name: 'Record that I contacted the customer', exact: true })
		.click();
	await expect(page.getByText('First response recorded', { exact: true })).toBeVisible();
	const responded = await detail(page, reference);
	expect(responded.firstResponseBy).toBe('Office coordinator');
	expect(responded.status).toBe('in-progress');
	await page.reload();
	await expect(
		page.getByText('Fictional customer asked for a Tuesday maintenance visit.', { exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Work status', { exact: true })).toHaveValue('in-progress');
	await screenshot(page, '03-staff-handling');
	await page.getByLabel('Work status', { exact: true }).selectOption('resolved');
	await page.getByRole('button', { name: 'Save staff changes', exact: true }).click();
	await expect.poll(async () => (await detail(page, reference)).status).toBe('resolved');
	await page.reload();
	await expect(page.getByLabel('Work status', { exact: true })).toHaveValue('resolved');
	await page.goto(`${route}?view=detail&ref=EOS-00002`);
	await expect(page.getByText('Office coordinator fallback', { exact: true })).toBeVisible();
	await expect(page.getByText(/Nadia Khan is unavailable/).first()).toBeVisible();
});

test('a failed acknowledgement recovers without a duplicate, and an overdue event creates one reminder', async ({
	page
}) => {
	await signIn(page);
	await post(page, { action: 'reset', confirmation: 'RESET DEMO' });
	await page.getByRole('link', { name: 'Demo controls', exact: true }).click();
	await page.getByRole('button', { name: 'Fail the next attempt', exact: true }).click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText(
		'next acknowledgement attempt will fail'
	);
	const reference = await customerSubmission(
		page,
		'Our fictional office meeting room needs maintenance after the lights stopped working.'
	);
	const jobId = (await detail(page, reference)).ack.id;
	await page.getByRole('link', { name: 'Demo controls', exact: true }).click();
	await page.getByRole('button', { name: 'Run one worker pass', exact: true }).click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText(
		'One worker pass completed'
	);
	await page.goto(`${route}?view=detail&ref=${reference}`);
	await expect(page.getByTestId('ack-status')).toContainText('Failed');
	expect((await detail(page, reference)).ack.attempts).toBe(1);
	await screenshot(page, '04-simulated-failure');
	await page.getByRole('button', { name: 'Retry acknowledgement', exact: true }).click();
	await expect(page.getByTestId('ack-status')).toHaveText('Waiting to send');
	await page.getByRole('link', { name: 'Demo controls', exact: true }).click();
	await page.getByRole('button', { name: 'Succeed in the simulation', exact: true }).click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText('will succeed');
	await page.getByRole('button', { name: 'Run one worker pass', exact: true }).click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText(
		'One worker pass completed'
	);
	await page.goto(`${route}?view=detail&ref=${reference}`);
	await expect(page.getByTestId('ack-status')).toHaveText('Simulated send succeeded');
	const recovered = await detail(page, reference);
	expect(recovered.ack.id).toBe(jobId);
	expect(recovered.ack.attempts).toBe(2);
	await page.reload();
	await expect(page.getByTestId('ack-status')).toHaveText('Simulated send succeeded');
	await screenshot(page, '05-simulated-recovery');
	await page.getByRole('link', { name: 'Demo controls', exact: true }).click();
	await page
		.getByRole('button', { name: 'Advance demo time by 4 hours 1 minute', exact: true })
		.click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText(
		'four hours and one minute'
	);
	await page.getByRole('button', { name: 'Run one worker pass', exact: true }).click();
	await expect(page.locator('.enquiry-demo').getByRole('status')).toContainText(
		'One worker pass completed'
	);
	await Promise.all([
		page.waitForResponse(
			(response) => response.url().endsWith(api) && response.request().method() === 'POST'
		),
		page.getByRole('button', { name: 'Run one worker pass', exact: true }).click()
	]);
	await page.goto(`${route}?view=detail&ref=${reference}`);
	await expect(page.getByTestId('overdue-warning')).toBeVisible();
	await expect(page.getByTestId('reminder-count')).toHaveText('Staff reminder: 1');
	await page.getByLabel('Work status', { exact: true }).selectOption('in-progress');
	await page.getByRole('button', { name: 'Save staff changes', exact: true }).click();
	await expect.poll(async () => (await detail(page, reference)).status).toBe('in-progress');
	await expect(page.getByTestId('overdue-warning')).toBeVisible();
	await screenshot(page, '06-overdue-reminder');
	await page
		.getByRole('button', { name: 'Record that I contacted the customer', exact: true })
		.click();
	await expect(page.getByTestId('overdue-warning')).toHaveCount(0);
	await expect(page.getByLabel('Work status', { exact: true })).toHaveValue('in-progress');
	await expect(page.getByTestId('reminder-count')).toHaveText('Staff reminder: 1');
	const counts = await page.request.get(`${api}?view=desk`);
	expect((await counts.json()).counts.total).toBe(31);
	await page.setViewportSize({ width: 390, height: 844 });
	await screenshot(page, '07-mobile-detail');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});
