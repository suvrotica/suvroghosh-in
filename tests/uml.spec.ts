import { expect, test, type Page, type Locator } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const path = '/blog/visualizations/post-to-uml';
const article =
	'# Clinic exchange\n\nClinic uses Registry. Registry stores Record.\n\nFirst Clinic sends request to Registry. Then Registry sends receipt to Clinic.\n';
const studio = (page: Page) => page.locator('.uml-studio');
const card = (page: Page, type = 'class') => studio(page).locator(`[data-diagram-type="${type}"]`);
const input = (page: Page) =>
	studio(page).getByRole('textbox', { name: /Paste Plain Text or Markdown/ });
const generate = (page: Page) =>
	studio(page).getByRole('button', { name: 'Generate UML Diagrams', exact: true });
const errors = new WeakMap<Page, string[]>();

async function open(page: Page) {
	await page.goto(path);
	await expect(studio(page)).toBeVisible();
	await expect(generate(page)).toBeEnabled({ timeout: 60_000 });
	const privacyChoice = page.getByRole('button', { name: 'Keep videos paused', exact: true });
	if (await privacyChoice.isVisible()) {
		await privacyChoice.click();
		await page.getByRole('button', { name: 'Dismiss privacy confirmation', exact: true }).click();
	}
}
async function pasteAndGenerate(page: Page) {
	await input(page).fill(article);
	await studio(page)
		.getByRole('textbox', { name: 'Article / Document Title (optional)' })
		.fill('Clinic exchange');
	await generate(page).click();
	await expect(generate(page)).toBeEnabled({ timeout: 60_000 });
	await expect(card(page).getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
}
async function currentImage(diagram: Locator) {
	await diagram.getByRole('button', { name: 'Preview', exact: true }).click();
	const image = diagram.locator('.uml-rendered-image');
	await expect(image).toBeVisible();
	await expect
		.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
		.toBe(true);
	return image;
}

test.beforeEach(async ({ page, baseURL }) => {
	const origin = new URL(baseURL!).origin;
	const failures: string[] = [];
	errors.set(page, failures);
	page.on('pageerror', (error) => failures.push(error.message));
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
	await mkdir('.tmp/uml', { recursive: true });
});
test.afterEach(async ({ page }) => {
	expect(errors.get(page)).toEqual([]);
});

test('pasted article produces genuine local diagrams and keeps the generated article revision', async ({
	page
}) => {
	await open(page);
	await pasteAndGenerate(page);
	const image = await currentImage(card(page));
	await image.screenshot({ path: '.tmp/uml/figure.png' });
	const data = await image.getAttribute('src');
	expect(decodeURIComponent(data!)).toContain('Clinic');
	await expect(card(page)).toHaveAttribute('data-renderer-id', /@plantuml\/core/);
	await card(page)
		.getByRole('button', { name: /Evidence & Notes/ })
		.click();
	await expect(card(page).locator('.uml-evidence-pane')).toContainText('Clinic uses Registry');
	await input(page).fill('A new unpublished revision.');
	await expect(studio(page).getByText(/The input has changed/)).toBeVisible();
	await expect(studio(page).locator('.uml-reader-prose')).toContainText('Clinic uses Registry');
	await expect(studio(page).locator('.uml-reader-prose')).not.toContainText('new unpublished');
	await studio(page).screenshot({ path: '.tmp/uml/desktop.png' });
});

test('manual source updates require review and ZIP contents match the reviewed revision', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await open(page);
	await studio(page)
		.getByRole('combobox', { name: /Manual source example/ })
		.selectOption('class');
	page.once('dialog', (dialog) => dialog.accept());
	await studio(page).getByRole('button', { name: 'Load notation example', exact: true }).click();
	const diagram = card(page);
	await expect(diagram.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
	const source = diagram.getByRole('textbox', { name: /Editable PlantUML source/ });
	const edited = '@startuml\nclass "ReviewedRecord" as Record\n@enduml';
	await source.fill(edited);
	await expect(diagram.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
	await expect(
		diagram.getByRole('button', { name: 'Copy blog embed', exact: true })
	).toBeDisabled();
	await diagram
		.getByRole('textbox', { name: 'Published caption', exact: true })
		.fill('A manually reviewed record.');
	await diagram
		.getByRole('textbox', { name: 'Alternative text', exact: true })
		.fill('One class box labelled ReviewedRecord.');
	await diagram
		.getByRole('button', { name: "I reviewed this figure's metadata and evidence", exact: true })
		.click();
	await diagram.getByRole('button', { name: 'Copy blog embed', exact: true }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		'A manually reviewed record.'
	);
	const downloadPromise = page.waitForEvent('download');
	await studio(page)
		.getByRole('button', { name: 'Export Asset & Embed Bundle (.zip)', exact: true })
		.click();
	const download = await downloadPromise;
	const archive = unzipSync(new Uint8Array(await readFile((await download.path())!)));
	const manifest = JSON.parse(strFromU8(archive['manifest.json']));
	const entry = manifest.diagrams.find((item: { type: string }) => item.type === 'class');
	expect(entry.publicationReady).toBe(true);
	expect(entry.sourceRevision).toBe(entry.renderedSourceRevision);
	expect(strFromU8(archive[entry.pumlRepoPath])).toBe(edited);
	expect(strFromU8(archive[entry.svgRepoPath])).toContain('ReviewedRecord');
	expect(Array.from(archive[entry.pngRepoPath].slice(0, 8))).toEqual([
		137, 80, 78, 71, 13, 10, 26, 10
	]);
	expect(strFromU8(archive['embed-snippet.md'])).toContain(entry.svgPublicPath);
	const original = strFromU8(archive[manifest.originalSourcePath]);
	expect(strFromU8(archive[`${manifest.slug}-with-uml.md`]).startsWith(original)).toBe(true);
});

test('invalid and unsafe source retain the last preview but cannot be exported as current', async ({
	page
}) => {
	await open(page);
	await pasteAndGenerate(page);
	const diagram = card(page);
	await diagram.getByRole('button', { name: 'Source (.puml)', exact: true }).click();
	const source = diagram.getByRole('textbox', { name: /Editable PlantUML source/ });
	await source.fill('@startuml\n!include https://example.invalid/secrets\nclass Unsafe\n@enduml');
	await expect(diagram.locator('.uml-render-error-banner')).toContainText(/blocked|not allowed/i);
	await expect(source).toHaveValue(/!include/);
	await expect(diagram.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
	await diagram.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(
		diagram.getByText('Showing last successful source revision', { exact: true })
	).toBeVisible();
	await expect(diagram.locator('.uml-rendered-image')).toBeVisible();
});

test('all fourteen evaluations preserve successful figures and report insufficient evidence', async ({
	page
}) => {
	await open(page);
	await input(page).fill('Clinic uses Registry. Registry stores Record.');
	await studio(page)
		.getByRole('button', { name: /All 14 types/ })
		.click();
	await generate(page).click();
	await expect(generate(page)).toBeEnabled({ timeout: 60_000 });
	await expect(studio(page).locator('.uml-card')).toHaveCount(14);
	await expect(
		card(page, 'class').getByRole('button', { name: 'Download SVG', exact: true })
	).toBeEnabled();
	await expect(card(page, 'timing')).toContainText(/Needs more information|Not applicable/);
});

test('cancel aborts a delayed provider request and preserves existing results (mocked provider transport)', async ({
	page
}) => {
	let requested = false;
	await page.route('**/api/uml', async (route) => {
		if (route.request().method() === 'GET') {
			await route.fulfill({
				json: {
					posts: [],
					ai: {
						available: true,
						provider: 'Mock provider',
						model: 'test-only',
						reason: 'Transport fixture.',
						configurationSteps: []
					}
				}
			});
		} else {
			requested = true;
			await new Promise((resolve) => setTimeout(resolve, 2000));
			await route
				.fulfill({
					status: 503,
					json: { error: 'Late mocked failure must not replace cancellation.' }
				})
				.catch(() => {});
		}
	});
	await open(page);
	await pasteAndGenerate(page);
	await studio(page)
		.getByRole('radio', { name: /AI Provider/ })
		.check();
	await studio(page)
		.getByRole('checkbox', { name: /I consent to sending/ })
		.check();
	await generate(page).click();
	await expect.poll(() => requested).toBe(true);
	await studio(page).getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(
		studio(page).getByText('Cancelled pending work. Completed diagrams have been retained.')
	).toBeVisible();
	await expect(card(page).getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
	await expect(studio(page).locator('.uml-error-banner')).toHaveCount(0);
});

test('mobile dark mode keeps controls and figures readable without horizontal page overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ colorScheme: 'dark' });
	await open(page);
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await pasteAndGenerate(page);
	await currentImage(card(page));
	expect(
		await studio(page).evaluate((element) => element.getBoundingClientRect().width)
	).toBeLessThanOrEqual(390);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
	await card(page).scrollIntoViewIfNeeded();
	await page.screenshot({ path: '.tmp/uml/mobile-dark.png' });
});

test('a delayed post load cannot overwrite a title edited while it was loading', async ({
	page
}) => {
	let release: (() => void) | undefined;
	await page.route('**/api/uml', (route) =>
		route.fulfill({
			json: {
				posts: [
					{
						slug: 'delayed-post',
						title: 'Delayed post',
						categoryLabel: 'Writing',
						date: '2026-10-28',
						description: ''
					}
				],
				ai: {
					available: false,
					provider: 'Unconfigured',
					model: '',
					reason: 'Test uses local analysis.',
					configurationSteps: []
				}
			}
		})
	);
	await page.route('**/api/uml?post=*', async (route) => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		await route.fulfill({
			json: {
				post: {
					slug: 'delayed-post',
					title: 'Server title',
					markdown: 'Server article',
					date: '2026-10-28',
					categoryLabel: 'Writing'
				}
			}
		});
	});
	await open(page);
	await studio(page)
		.getByRole('combobox', { name: 'Select a published blog post to load' })
		.selectOption('delayed-post');
	await studio(page).getByRole('button', { name: 'Load Post Text', exact: true }).click();
	await expect.poll(() => Boolean(release)).toBe(true);
	const title = studio(page).getByRole('textbox', { name: 'Article / Document Title (optional)' });
	await title.fill('My newer title');
	release!();
	await expect(
		studio(page).getByRole('button', { name: 'Load Post Text', exact: true })
	).toBeEnabled();
	await expect(title).toHaveValue('My newer title');
	await expect(input(page)).not.toHaveValue('Server article');
});

test('unauthenticated API advertises unavailable AI and refuses provider generation', async ({
	request,
	baseURL
}) => {
	const status = await request.get('/api/uml');
	expect(status.status()).toBe(200);
	const body = await status.json();
	expect(body.ai.available).toBe(false);
	expect(Array.isArray(body.posts)).toBe(true);
	const response = await request.post('/api/uml', {
		headers: { origin: new URL(baseURL!).origin },
		data: {
			text: article,
			mode: 'recommended',
			detailLevel: 'simple',
			allowAssumptions: false,
			engine: 'ai',
			consent: true
		}
	});
	expect([401, 403, 503]).toContain(response.status());
	expect((await response.json()).result).toBeUndefined();
});
