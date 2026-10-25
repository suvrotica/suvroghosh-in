import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { usePausedMediaPreference } from '../helpers/privacy-choice';

const route = '/demos/customer-enquiries';
const api = `${route}/api`;
const bridge = 'http://127.0.0.1:54331';
const captures = resolve('artifacts/enquiry-demo');
type Sandbox = { scopeKey: string; expiresAt: string };

async function post(context: BrowserContext, origin: string, body: Record<string, unknown>) {
	const response = await context.request.post(api, { data: body, headers: { origin } });
	expect(
		response.ok(),
		`Public demo action ${String(body.action)} returned ${response.status()}.`
	).toBe(true);
	return response.json();
}

async function data(context: BrowserContext, view = 'desk', reference?: string) {
	const response = await context.request.get(
		`${api}?view=${view}${reference ? `&ref=${reference}` : ''}`
	);
	expect(response.ok()).toBe(true);
	expect(response.headers()['cache-control']).toContain('no-store');
	return response.json();
}

function actionResponse(page: Page, action: string) {
	return page.waitForResponse((response) => {
		if (!response.url().endsWith(api) || response.request().method() !== 'POST') return false;
		try {
			return response.request().postDataJSON().action === action;
		} catch {
			return false;
		}
	});
}

async function start(page: Page): Promise<Sandbox> {
	const created = actionResponse(page, 'start');
	await page.goto(`${route}?view=customer`, { waitUntil: 'domcontentloaded' });
	const response = await created;
	expect(response.ok()).toBe(true);
	const { sandbox } = await response.json();
	expect(sandbox.scopeKey).toMatch(/^[a-f0-9]{64}$/);
	await expect(page.getByTestId('private-workspace-notice')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Fill with sample details', exact: true })
	).toBeVisible();
	return sandbox;
}

async function enterStaff(page: Page) {
	await page.getByRole('link', { name: 'Staff desk', exact: true }).click();
	await expect(page.getByLabel('Staff password', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Open my demonstration staff desk', exact: true }).click();
	await expect(page.getByTestId('total-count')).toBeVisible();
}

async function submit(page: Page, description: string) {
	await page.getByRole('link', { name: 'Customer form', exact: true }).click();
	await page.getByRole('button', { name: 'Fill with sample details', exact: true }).click();
	await page.getByLabel('Short description of the problem', { exact: true }).fill(description);
	const committed = actionResponse(page, 'submit');
	await page.getByRole('button', { name: 'Save enquiry', exact: true }).click();
	const response = await committed;
	expect(response.ok()).toBe(true);
	const receipt = await response.json();
	await expect(
		page.getByRole('heading', { name: 'Your enquiry has been saved.', exact: true })
	).toBeVisible();
	return { ...receipt, input: response.request().postDataJSON() };
}

async function capture(page: Page, name: string) {
	for (const label of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name: label, exact: true });
		if (await button.isVisible()) await button.click();
	}
	mkdirSync(captures, { recursive: true });
	await page.screenshot({ path: resolve(captures, `${name}.png`), fullPage: true });
}

test('two visitors own separate saved enquiries, staff sessions, message settings, clocks and reset histories', async ({
	browser,
	baseURL,
	request
}) => {
	const origin = baseURL!;
	const contexts = await Promise.all(
		[0, 1, 2].map(() => browser.newContext({ baseURL, serviceWorkers: 'block' }))
	);
	const [visitorA, visitorB, outsider] = contexts;
	const errors: string[] = [];
	try {
		for (const context of contexts) await usePausedMediaPreference(context);
		for (const action of ['update', 'retry', 'tick', 'sandbox', 'reset']) {
			const denied = await outsider.request.post(api, {
				headers: { origin },
				data: { action, reference: 'EOS-00001', confirmation: 'RESET DEMO' }
			});
			expect(denied.status()).toBe(410);
		}
		const [pageA, pageB] = await Promise.all([visitorA.newPage(), visitorB.newPage()]);
		for (const page of [pageA, pageB]) page.on('pageerror', (error) => errors.push(error.message));
		const scopeA = await start(pageA);
		const scopeB = await start(pageB);
		expect(scopeA.scopeKey).not.toBe(scopeB.scopeKey);
		const cookiesA = await visitorA.cookies();
		const cookieA = cookiesA.find((cookie) => cookie.name === 'enquiry_demo_workspace')!;
		expect(cookieA.httpOnly).toBe(true);
		expect(cookieA.sameSite).toBe('Strict');
		expect(cookieA.path).toBe(route);
		const beforeStaff = await visitorA.request.get(`${api}?view=desk`);
		expect(beforeStaff.status()).toBe(403);
		await outsider.addCookies([
			{
				name: cookieA.name,
				value: 'f'.repeat(64),
				domain: '127.0.0.1',
				path: route,
				httpOnly: true,
				sameSite: 'Strict'
			}
		]);
		expect((await outsider.request.get(`${api}?view=desk`)).status()).toBe(410);
		const aDescription = 'Only visitor A requested a fictional meeting-room repair.';
		const a = await submit(pageA, aDescription);
		await enterStaff(pageA);
		await enterStaff(pageB);
		expect((await data(visitorA)).counts.total).toBe(31);
		expect((await data(visitorB)).counts.total).toBe(30);
		expect((await visitorB.request.get(`${api}?view=detail&ref=${a.reference}`)).status()).toBe(
			404
		);
		const aHash = createHash('sha256').update(cookieA.value).digest('hex');
		const crossAttempt = await visitorB.request.post(api, {
			headers: { origin },
			data: {
				action: 'update',
				reference: a.reference,
				status: 'resolved',
				sessionHash: aHash,
				scopeKey: scopeA.scopeKey
			}
		});
		expect(crossAttempt.status()).toBe(404);
		expect((await data(visitorA, 'detail', a.reference)).enquiry.status).toBe('new');
		const bDescription = 'Only visitor B requested a fictional desk-light repair.';
		const b = await post(visitorB, origin, { ...a.input, description: bDescription });
		expect(b.reference).toBe(a.reference);
		expect(b.duplicate).toBe(false);
		const beforeB = (await data(visitorB, 'detail', b.reference)).enquiry;
		await post(visitorA, origin, { action: 'sandbox', mode: 'always-fail', advanceMinutes: 241 });
		await post(visitorA, origin, {
			action: 'update',
			reference: a.reference,
			note: 'A private fictional note for visitor A.',
			status: 'in-progress'
		});
		await post(visitorA, origin, { action: 'tick' });
		await post(visitorA, origin, { action: 'tick' });
		const aDetail = (await data(visitorA, 'detail', a.reference)).enquiry;
		expect(aDetail.ackStatus).toBe('failed');
		expect(aDetail.reminders).toHaveLength(1);
		expect(
			aDetail.history.some((item: { message: string }) => item.message.includes('visitor A.'))
		).toBe(true);
		expect((await data(visitorB, 'detail', b.reference)).enquiry).toEqual(beforeB);
		const bDesk = await data(visitorB);
		expect(bDesk.settings.mode).toBe('succeed');
		expect(bDesk.settings.offsetMinutes).toBe(0);
		await post(visitorB, origin, { action: 'tick' });
		expect((await data(visitorB, 'detail', b.reference)).enquiry.ackStatus).toBe('succeeded');
		await pageA.goto(`${route}?view=detail&ref=${a.reference}`);
		await expect(pageA.getByTestId('overdue-warning')).toBeVisible();
		await capture(pageA, 'public-owned-staff');
		await pageA.reload();
		await expect(pageA.getByText(aDescription, { exact: true })).toBeVisible();
		const bBeforeReset = (await data(visitorB, 'detail', b.reference)).enquiry;
		await pageA.getByRole('link', { name: 'Demo controls', exact: true }).click();
		await expect(pageA.getByText(/Other visitors’ examples are unaffected/)).toBeVisible();
		await pageA.getByLabel('Type RESET DEMO to confirm', { exact: true }).fill('RESET DEMO');
		await pageA.getByRole('button', { name: 'Reset sample data', exact: true }).click();
		await expect(pageA.locator('.enquiry-demo').getByRole('status')).toContainText('restored');
		expect((await data(visitorA)).counts.total).toBe(30);
		expect((await data(visitorB, 'detail', b.reference)).enquiry).toEqual(bBeforeReset);
		const activeReceipt = await submit(
			pageA,
			'A fictional enquiry created just before its temporary workspace ends.'
		);
		await pageA.goto(`${route}?view=detail&ref=${activeReceipt.reference}`);
		await expect(
			pageA.getByRole('button', { name: 'Save staff changes', exact: true })
		).toBeVisible();
		const expired = await request.post(`${bridge}/__test/expire`, {
			data: { scopeKey: scopeA.scopeKey }
		});
		expect(expired.ok()).toBe(true);
		await pageA.getByRole('button', { name: 'Save staff changes', exact: true }).click();
		await expect(
			pageA.getByRole('button', { name: 'Start a fresh demonstration', exact: true })
		).toBeVisible();
		expect((await visitorA.request.get(`${api}?view=desk`)).status()).toBe(410);
		const fresh = actionResponse(pageA, 'start');
		await pageA.getByRole('button', { name: 'Start a fresh demonstration', exact: true }).click();
		const newScope = (await (await fresh).json()).sandbox;
		expect(newScope.scopeKey).not.toBe(scopeA.scopeKey);
		await expect(
			pageA.getByRole('button', { name: 'Fill with sample details', exact: true })
		).toBeVisible();
		const keys = await pageA.evaluate(() => Object.keys(sessionStorage));
		expect(keys.some((key) => key.startsWith(`enquiry-demo:${scopeA.scopeKey}:`))).toBe(false);
		expect(keys.some((key) => key.startsWith(`enquiry-demo:${newScope.scopeKey}:`))).toBe(true);
		await pageA.goto(`${route}?view=receipt&ref=${activeReceipt.reference}`);
		await expect(
			pageA.getByRole('heading', { name: 'Your enquiry has been saved.', exact: true })
		).toHaveCount(0);
		await enterStaff(pageA);
		await expect(pageA.getByTestId('total-count')).toHaveText('30');
		await capture(pageA, 'public-fresh-workspace');
		expect((await data(visitorB, 'detail', b.reference)).enquiry).toEqual(bBeforeReset);
		expect(errors).toEqual([]);
	} finally {
		for (const context of contexts) await context.close();
	}
});

test('a server-rendered page does not create a visitor workspace or expose a shared staff password', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		await usePausedMediaPreference(context);
		const page = await context.newPage();
		const response = await page.goto(`${route}?view=login`, { waitUntil: 'domcontentloaded' });
		expect(response!.status()).toBe(200);
		expect(response!.headers()['cache-control']).toContain('no-store');
		await expect(page.getByLabel('Staff password', { exact: true })).toHaveCount(0);
		await expect(
			page.getByRole('button', { name: 'Open my demonstration staff desk', exact: true })
		).toBeVisible();
		expect(
			(await context.cookies()).filter((cookie) => cookie.name === 'enquiry_demo_workspace')
		).toHaveLength(0);
	} finally {
		await context.close();
	}
});
