import {
	expect,
	test,
	type APIRequestContext,
	type Download,
	type Locator,
	type Page,
	type TestInfo
} from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/belousov-zhabotinsky-laboratory';
const articleTitle = 'The Clock That Escaped Into Space: A Belousov–Zhabotinsky Laboratory';
const grayScottPath = '/blog/visualizations/reaction-diffusion-atlas';
const grayScottTitle = 'The Chemistry That Draws Without a Hand: A Reaction–Diffusion Atlas';
const heroIds = ['classic-target-rings', 'persistent-single-spiral', 'spiral-garden'] as const;
const heroTitles = {
	'classic-target-rings': 'Classic Target Rings',
	'persistent-single-spiral': 'Persistent Single Spiral',
	'spiral-garden': 'Spiral Garden'
} as const;
const diagnostics = new WeakMap<Page, string[]>();

type HeroId = (typeof heroIds)[number];
type JsonRecord = Record<string, unknown>;
type ManifestHero = {
	id: HeroId;
	title: string;
	hero: boolean;
	displayProfileId: string;
	calibrationRecordId: string;
	validationStatus: string;
	setup: JsonRecord & {
		gridSize: number;
		seed: string;
		initialCondition: string;
		timestep: number;
	};
	initialInterventions: JsonRecord[];
	optionalCheckpoint: {
		id: string;
		path: string;
		modelStep: number;
		modelTime: number;
	};
};
type ManifestAsset = {
	id: string;
	path: string;
	width: number;
	height: number;
	presetId: string;
};
type BZManifest = {
	schemaVersion: number;
	engineVersion: string;
	displayVersion: string;
	search: { status: string };
	presets: ManifestHero[];
	assets: ManifestAsset[];
	checkpoints: JsonRecord[];
};
type LaboratoryExperimentExport = {
	schemaVersion: number;
	engineVersion: string;
	title: string;
	setup: JsonRecord;
	step: number;
	interventions: JsonRecord[];
	display: { view: string; palette: string };
};
type GalleryExperimentExport = {
	schemaVersion: 2;
	kind: 'bz-v2-experiment-record';
	engineVersion: string;
	displayVersion: string;
	title: string;
	exportedAt: string;
	runOrigin: 'checkpoint' | 'genesis';
	modelTime: number;
	presetId: HeroId;
	calibrationRecordId: string;
	validationStatus: string;
	appearanceStatus: 'manifest-profile' | 'custom-appearance';
	setup: JsonRecord;
	checkpointId: string | null;
	step: number;
	interventions: JsonRecord[];
	activeTerms: { reaction: boolean; diffusion: boolean };
	display: { view: string; palette: string; profileId: string };
};

function collectRuntimeDiagnostics(page: Page) {
	const messages: string[] = [];
	const ignoredUrl = (url: string) => /\/_vercel\/|favicon/iu.test(url);
	page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (ignoredUrl(source)) return;
		messages.push(`console error: ${message.text()}`);
	});
	page.on('requestfailed', (request) => {
		const failure = request.failure()?.errorText ?? 'unknown transport failure';
		if (ignoredUrl(request.url()) || /ERR_ABORTED|NS_BINDING_ABORTED/iu.test(failure)) return;
		messages.push(`request failed: ${request.method()} ${request.url()} (${failure})`);
	});
	page.on('response', (response) => {
		if (response.status() < 400 || ignoredUrl(response.url())) return;
		messages.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
	});
	return messages;
}

function experience(page: Page) {
	return page.getByTestId('bz-v2-experience');
}

function gallery(page: Page) {
	return page.getByTestId('bz-v2-gallery');
}

function laboratory(page: Page) {
	return page.getByTestId('bz-laboratory');
}

function proof(page: Page) {
	return page.getByTestId('bz-v2-proof');
}

function modeTab(page: Page, name: 'Gallery' | 'Laboratory' | 'Proof') {
	return experience(page).getByRole('tab', { name: new RegExp(`^${name}`, 'u') });
}

async function readManifest(request: APIRequestContext): Promise<BZManifest> {
	const response = await request.get('/data/bz-v2-calibration.json');
	if (!response.ok()) throw new Error(`V2 manifest returned HTTP ${response.status()}.`);
	return (await response.json()) as BZManifest;
}

function manifestHero(manifest: BZManifest, id: HeroId): ManifestHero {
	const preset = manifest.presets.find((entry) => entry.id === id);
	if (!preset) throw new Error(`Manifest is missing ${id}.`);
	return preset;
}

function manifestHeroPlateAsset(manifest: BZManifest, id: HeroId): ManifestAsset {
	const asset = manifest.assets.find((entry) => entry.id === `bz-v2-${id}-plate`);
	if (!asset) throw new Error(`Manifest is missing the ${id} presentation plate.`);
	return asset;
}

function manifestHeroCheckpointPoster(manifest: BZManifest, id: HeroId): ManifestAsset {
	const asset = manifest.assets.find((entry) => entry.id === `bz-v2-${id}-checkpoint-poster`);
	if (!asset) throw new Error(`Manifest is missing the ${id} square checkpoint poster.`);
	return asset;
}

async function waitForGallery(page: Page) {
	const root = experience(page);
	await expect(root).toBeVisible();
	await expect(modeTab(page, 'Gallery')).toHaveAttribute('aria-selected', 'true');
	const exhibit = gallery(page);
	await expect(exhibit).toBeVisible();
	await exhibit.scrollIntoViewIfNeeded();
	await expect(exhibit.locator('.hero-card')).toHaveCount(3);
	return exhibit;
}

async function waitForGalleryReady(page: Page) {
	const exhibit = await waitForGallery(page);
	await expect(exhibit.getByTestId('bz-stage')).toBeVisible({ timeout: 60_000 });
	await expect(exhibit.getByLabel('Display style')).toBeEnabled({ timeout: 60_000 });
	await expect(exhibit.locator('.stage-shell .engine-line')).toContainText(
		/RGBA(?:16|32)F|CPU reference|Float64/iu,
		{ timeout: 60_000 }
	);
	return exhibit;
}

async function waitForLaboratory(page: Page) {
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab.locator('.engine-line')).toContainText(
		/RGBA(?:16|32)F|CPU reference|Float64/iu,
		{
			timeout: 60_000
		}
	);
	return lab;
}

async function readGalleryStep(page: Page) {
	const text = await gallery(page)
		.locator('dl[aria-label="Current numerical frame"] > div')
		.filter({ hasText: /^Step/iu })
		.locator('dd')
		.innerText();
	return Number(text.replace(/[^0-9]/gu, ''));
}

async function readLaboratoryStep(page: Page) {
	const text = await laboratory(page).locator('.hud span').first().innerText();
	return Number(text.replace(/[^0-9]/gu, ''));
}

async function downloadBytes(download: Download) {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function attachNonFlatScreenshot(
	testInfo: TestInfo,
	name: string,
	locator: Locator
): Promise<string> {
	const bytes = await locator.screenshot({ animations: 'disabled' });
	await testInfo.attach(name, { body: bytes, contentType: 'image/png' });
	const image = sharp(bytes);
	const metadata = await image.metadata();
	expect(metadata.width ?? 0).toBeGreaterThan(240);
	expect(metadata.height ?? 0).toBeGreaterThan(240);
	const statistics = await image.stats();
	expect(
		Math.max(...statistics.channels.slice(0, 3).map((channel) => channel.stdev))
	).toBeGreaterThan(6);
	return createHash('sha256').update(bytes).digest('hex');
}

async function assertNoDuplicateIds(page: Page) {
	const duplicateIds = await page.evaluate(() => {
		const counts = new Map<string, number>();
		for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
			counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
		}
		return [...counts.entries()].filter(([, count]) => count > 1);
	});
	expect(duplicateIds).toEqual([]);
}

async function installClipboardCapture(page: Page) {
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText(value: string) {
					(window as Window & { __bzCopiedUrl?: string }).__bzCopiedUrl = value;
					return Promise.resolve();
				}
			}
		});
	});
}

async function exportLaboratoryExperimentJson(page: Page): Promise<LaboratoryExperimentExport> {
	const downloadPromise = page.waitForEvent('download');
	await laboratory(page).getByRole('button', { name: 'Experiment JSON' }).click();
	return JSON.parse(
		(await downloadBytes(await downloadPromise)).toString('utf8')
	) as LaboratoryExperimentExport;
}

async function exportGalleryExperimentJson(page: Page): Promise<GalleryExperimentExport> {
	const actions = gallery(page).locator('details.share-actions');
	if ((await actions.getAttribute('open')) === null) await actions.locator('summary').click();
	const downloadPromise = page.waitForEvent('download');
	await actions.getByRole('button', { name: 'Experiment JSON' }).click();
	return JSON.parse(
		(await downloadBytes(await downloadPromise)).toString('utf8')
	) as GalleryExperimentExport;
}

test.beforeEach(({ page }) => diagnostics.set(page, collectRuntimeDiagnostics(page)));
test.afterEach(({ page }) => expect(diagnostics.get(page) ?? []).toEqual([]));

test('the ordinary route opens on a mature, validated V2 Gallery', async ({
	page,
	request
}, testInfo) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain(
		'/images/visualizations/belousov-zhabotinsky/v2/bz-v2-visualization-card.png'
	);
	expect(html).toContain('One field, two views');
	expect(html).toContain('How arithmetic can counterfeit chemistry');

	const manifest = await readManifest(request);
	expect(manifest.schemaVersion).toBe(2);
	expect(manifest.search.status).toBe('complete');
	expect(manifest.engineVersion).toContain('heun');
	expect(manifest.displayVersion).toContain('linear-light');
	expect(
		manifest.presets.filter((preset) => preset.hero && preset.validationStatus === 'validated')
	).toHaveLength(3);
	expect(manifest.checkpoints).toHaveLength(3);
	for (const id of heroIds) {
		expect(manifestHero(manifest, id).optionalCheckpoint).toBeTruthy();
		const plate = manifestHeroPlateAsset(manifest, id);
		expect(plate.width).toBeGreaterThanOrEqual(1_800);
		expect(plate.height).toBeGreaterThanOrEqual(1_200);
		const checkpointPoster = manifestHeroCheckpointPoster(manifest, id);
		expect(checkpointPoster.width).toBe(1_200);
		expect(checkpointPoster.height).toBe(1_200);
	}

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	const exhibit = await waitForGallery(page);
	await expect(exhibit.getByRole('button', { name: /Classic Target Rings/iu })).toBeVisible();
	const defaultCard = exhibit.getByRole('button', { name: /Persistent Single Spiral/iu });
	await expect(defaultCard).toHaveAttribute('aria-pressed', 'true');
	await expect(defaultCard.locator('img.card-preview')).toHaveAttribute(
		'src',
		manifestHeroCheckpointPoster(manifest, 'persistent-single-spiral').path
	);
	await expect(exhibit.getByRole('button', { name: /Spiral Garden/iu })).toBeVisible();

	const matureImage = exhibit.locator('.dish-host img').first();
	await expect(matureImage).toBeVisible({ timeout: 5_000 });
	await expect(matureImage).toHaveAttribute(
		'src',
		manifestHeroCheckpointPoster(manifest, 'persistent-single-spiral').path
	);
	await expect
		.poll(() => matureImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
		.toBe(1200);
	await attachNonFlatScreenshot(
		testInfo,
		'v2-default-mature-startup',
		exhibit.locator('.dish-host')
	);

	await waitForGalleryReady(page);
	await expect(exhibit.getByTestId('bz-stage').locator('img.poster')).toHaveAttribute(
		'src',
		manifestHeroCheckpointPoster(manifest, 'persistent-single-spiral').path
	);
	await expect(exhibit.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
	const liveStep = await readGalleryStep(page);
	await expect.poll(() => readGalleryStep(page)).toBeGreaterThan(liveStep);
	await exhibit.getByRole('button', { name: 'Pause', exact: true }).click();
	await attachNonFlatScreenshot(
		testInfo,
		'v2-default-live-checkpoint',
		exhibit.locator('.dish-host')
	);
	await expect(experience(page)).toHaveAttribute('data-layer', 'gallery');
	await expect(page.locator('#bz-v2-panel-gallery')).toBeVisible();
	await expect(page.locator('#bz-v2-panel-laboratory')).toBeHidden();
	await expect(page.locator('#bz-v2-panel-proof')).toBeHidden();

	const bounds = await experience(page).evaluate((element) => {
		const box = element.getBoundingClientRect();
		return { left: box.left, right: box.right, width: window.innerWidth };
	});
	expect(bounds.left).toBeGreaterThanOrEqual(0);
	expect(bounds.right).toBeLessThanOrEqual(bounds.width);
	await assertNoDuplicateIds(page);
});

test('all three mature heroes load and Gallery state survives Laboratory and Proof', async ({
	page,
	request
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const manifest = await readManifest(request);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	let exhibit = await waitForGalleryReady(page);

	for (const id of heroIds) {
		const preset = manifestHero(manifest, id);
		const asset = manifestHeroCheckpointPoster(manifest, id);
		const card = exhibit.getByRole('button', { name: new RegExp(heroTitles[id], 'iu') });
		await expect(card.locator('img.card-preview')).toHaveAttribute('src', asset.path);
		if ((await card.getAttribute('aria-pressed')) !== 'true') await card.click();
		await expect(card).toHaveAttribute('aria-pressed', 'true');
		await expect
			.poll(() => readGalleryStep(page), { timeout: 60_000 })
			.toBe(preset.optionalCheckpoint.modelStep);
		await expect(exhibit.getByTestId('bz-stage').locator('img.poster')).toHaveAttribute(
			'src',
			asset.path
		);
		await expect(exhibit.locator('.dish-status')).toContainText('Mature checkpoint');
		await attachNonFlatScreenshot(testInfo, `v2-${id}`, exhibit.locator('.dish-host'));
	}

	const garden = manifestHero(manifest, 'spiral-garden');
	await exhibit.getByRole('button', { name: 'Replay genesis' }).click();
	await expect(exhibit.locator('.dish-status')).toContainText('Genesis replay');
	await expect.poll(() => readGalleryStep(page), { timeout: 60_000 }).toBe(0);
	await exhibit.getByRole('button', { name: 'Return to mature checkpoint' }).click();
	await expect(exhibit.locator('.dish-status')).toContainText('Mature checkpoint');
	await expect
		.poll(() => readGalleryStep(page), { timeout: 60_000 })
		.toBe(garden.optionalCheckpoint.modelStep);

	const galleryStage = exhibit.getByTestId('bz-stage');
	await galleryStage.evaluate((element) => element.setAttribute('data-session-probe', 'preserved'));
	const gardenStep = await readGalleryStep(page);

	await modeTab(page, 'Proof').click();
	await expect(proof(page)).toBeVisible();
	await expect(
		proof(page).locator('.live-session').getByRole('heading', { name: 'Spiral Garden' })
	).toBeVisible();
	await expect(proof(page).locator('.live-session')).toContainText('checkpoint');
	await expect(page.locator('#bz-v2-panel-gallery')).toBeHidden();
	await expect(galleryStage).toHaveAttribute('data-session-probe', 'preserved');

	await modeTab(page, 'Laboratory').click();
	const lab = await waitForLaboratory(page);
	await expect(experience(page).locator('.handoff-note')).toContainText('Spiral Garden');
	await expect(lab.getByTestId('bz-preset')).toHaveValue('custom');
	await expect(galleryStage).toHaveAttribute('data-session-probe', 'preserved');

	await modeTab(page, 'Gallery').click();
	exhibit = await waitForGallery(page);
	await expect(exhibit.getByTestId('bz-stage')).toHaveAttribute('data-session-probe', 'preserved');
	expect(await readGalleryStep(page)).toBe(gardenStep);
});

test('display styles change presentation without resetting the mature numerical state', async ({
	page
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const exhibit = await waitForGalleryReady(page);
	const stage = exhibit.getByTestId('bz-stage');
	await stage.evaluate((element) => element.setAttribute('data-display-session', 'same-state'));
	const checkpointStep = await readGalleryStep(page);
	const style = exhibit.getByLabel('Display style');
	const digests: string[] = [];

	for (const [value, name] of [
		['raw-u', 'raw-u'],
		['ferroin', 'ferroin-representative'],
		['luminous', 'luminous-phase'],
		['phase', 'phase-spectrum']
	] as const) {
		await style.selectOption(value);
		await expect(style).toHaveValue(value);
		await page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		);
		await expect(stage).toHaveAttribute('data-display-session', 'same-state');
		expect(await readGalleryStep(page)).toBe(checkpointStep);
		digests.push(
			await attachNonFlatScreenshot(testInfo, `v2-display-${name}`, exhibit.locator('.dish-host'))
		);
	}

	expect(new Set(digests).size).toBe(digests.length);
	await expect(exhibit.locator('.dish-status')).toContainText('Mature checkpoint');
});

test('V2 Gallery export, Laboratory handoff, URL, JSON and PNG preserve the target source schedule', async ({
	page,
	request
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const manifest = await readManifest(request);
	const target = manifestHero(manifest, 'classic-target-rings');
	expect(target.initialInterventions.length).toBeGreaterThan(0);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const exhibit = await waitForGalleryReady(page);
	await exhibit.getByRole('button', { name: /Classic Target Rings/iu }).click();
	await expect
		.poll(() => readGalleryStep(page), { timeout: 60_000 })
		.toBe(target.optionalCheckpoint.modelStep);

	const galleryRecord = await exportGalleryExperimentJson(page);
	expect(galleryRecord.schemaVersion).toBe(2);
	expect(galleryRecord.kind).toBe('bz-v2-experiment-record');
	expect(galleryRecord.engineVersion).toBe(manifest.engineVersion);
	expect(galleryRecord.displayVersion).toBe(manifest.displayVersion);
	expect(galleryRecord.title).toContain('Classic Target Rings');
	expect(Number.isNaN(Date.parse(galleryRecord.exportedAt))).toBe(false);
	expect(galleryRecord.runOrigin).toBe('checkpoint');
	expect(galleryRecord.modelTime).toBeCloseTo(target.optionalCheckpoint.modelTime, 12);
	expect(galleryRecord.presetId).toBe(target.id);
	expect(galleryRecord.calibrationRecordId).toBe(target.calibrationRecordId);
	expect(galleryRecord.validationStatus).toBe(target.validationStatus);
	expect(galleryRecord.appearanceStatus).toBe('manifest-profile');
	expect(galleryRecord.checkpointId).toBe(target.optionalCheckpoint.id);
	expect(galleryRecord.step).toBe(target.optionalCheckpoint.modelStep);
	expect(galleryRecord.setup).toEqual(target.setup);
	expect(galleryRecord.interventions).toEqual(target.initialInterventions);
	expect(galleryRecord.activeTerms).toEqual({ reaction: true, diffusion: true });
	expect(galleryRecord.display.profileId).toBe(target.displayProfileId);

	await exhibit.getByRole('button', { name: 'Open laboratory' }).click();
	const lab = await waitForLaboratory(page);
	await expect(modeTab(page, 'Laboratory')).toHaveAttribute('aria-selected', 'true');
	await expect(lab.getByTestId('bz-preset')).toHaveValue('custom');
	await expect(experience(page).locator('.handoff-note')).toContainText(
		/Classic Target Rings.*1 declared intervention/isu
	);
	await expect(lab.getByTestId('bz-status')).toContainText(/Reduced motion is preferred/iu);
	await expect.poll(() => readLaboratoryStep(page)).toBe(0);

	await lab.getByRole('tab', { name: 'Save' }).click();
	const record = await exportLaboratoryExperimentJson(page);
	expect(record.schemaVersion).toBe(1);
	expect(record.engineVersion).toContain('heun');
	expect(record.title).toContain('Classic Target Rings');
	expect(record.setup).toEqual(target.setup);
	expect(record.step).toBe(0);
	expect(record.interventions).toEqual(target.initialInterventions);

	const pngDownloadPromise = page.waitForEvent('download');
	await lab.getByRole('button', { name: 'Field PNG' }).click();
	const png = await downloadBytes(await pngDownloadPromise);
	const pngImage = sharp(png);
	const pngMetadata = await pngImage.metadata();
	expect(pngMetadata.format).toBe('png');
	expect(pngMetadata.width).toBe(1200);
	expect(pngMetadata.height).toBe(1200);
	const pngStats = await pngImage.stats();
	expect(
		Math.max(...pngStats.channels.slice(0, 3).map((channel) => channel.stdev))
	).toBeGreaterThan(6);

	await installClipboardCapture(page);
	await lab.getByRole('button', { name: 'Copy setup URL' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window as Window & { __bzCopiedUrl?: string }).__bzCopiedUrl ?? '')
		)
		.toContain('bz_v=1');
	const copiedUrl = await page.evaluate(
		() => (window as Window & { __bzCopiedUrl?: string }).__bzCopiedUrl ?? ''
	);
	const parameters = new URL(copiedUrl).searchParams;
	expect(parameters.get('bz_n')).toBe(String(target.setup.gridSize));
	expect(parameters.get('bz_seed')).toBe(target.setup.seed);
	expect(parameters.get('bz_initial')).toBe(target.setup.initialCondition);
	expect(parameters.get('bz_events')).toBeTruthy();
	expect(parameters.get('bz_log')).not.toBe('omitted');

	await page.goto(copiedUrl, { waitUntil: 'domcontentloaded' });
	await expect(experience(page)).toBeVisible();
	await modeTab(page, 'Laboratory').click();
	const restoredLab = await waitForLaboratory(page);
	await expect(restoredLab.getByTestId('bz-status')).toContainText(
		/restored from the address|opened with the disclosures/iu
	);
	await expect.poll(() => readLaboratoryStep(page)).toBe(0);
	await restoredLab.getByRole('tab', { name: 'Save' }).click();
	const restored = await exportLaboratoryExperimentJson(page);
	expect(restored.setup).toEqual(target.setup);
	expect(restored.interventions).toEqual(target.initialInterventions);
	expect(restored.step).toBe(record.step);
});

test('reduced-motion no-WebGL startup keeps the mature poster, Play and single-step', async ({
	page,
	request
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const manifest = await readManifest(request);
	const spiral = manifestHero(manifest, 'persistent-single-spiral');
	const spiralAsset = manifestHeroCheckpointPoster(manifest, 'persistent-single-spiral');
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const exhibit = await waitForGallery(page);
	await expect(exhibit).toHaveAttribute('data-motion', 'still');
	const immediatePoster = exhibit.locator('.dish-host img').first();
	await expect(immediatePoster).toBeVisible({ timeout: 5_000 });
	await expect(immediatePoster).toHaveAttribute('src', spiralAsset.path);

	await waitForGalleryReady(page);
	const engineLine = exhibit.locator('.stage-shell .engine-line');
	await expect(engineLine).toContainText(/WebGL computation was disabled.*Float64/isu);
	await expect(engineLine).toContainText('256 × 256');
	await expect(engineLine).not.toContainText('reduced from');
	await expect(exhibit.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await expect(exhibit.getByRole('button', { name: 'Step', exact: true })).toBeEnabled();
	await expect.poll(() => readGalleryStep(page)).toBe(spiral.optionalCheckpoint.modelStep);

	await attachNonFlatScreenshot(
		testInfo,
		'v2-reduced-motion-no-webgl',
		exhibit.locator('.dish-host')
	);
	await exhibit.getByRole('button', { name: 'Step', exact: true }).click();
	await expect.poll(() => readGalleryStep(page)).toBe(spiral.optionalCheckpoint.modelStep + 1);
});

test('mobile Gallery stays in bounds and its tabs remain keyboard-accessible', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const exhibit = await waitForGalleryReady(page);
	const geometry = await experience(page).evaluate((element) => {
		const box = element.getBoundingClientRect();
		return {
			left: box.left,
			right: box.right,
			viewport: window.innerWidth,
			documentOverflow: document.documentElement.scrollWidth - window.innerWidth
		};
	});
	expect(geometry.left).toBeGreaterThanOrEqual(0);
	expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);

	const cards = exhibit.locator('.hero-card');
	const firstCard = await cards.nth(0).boundingBox();
	const secondCard = await cards.nth(1).boundingBox();
	expect(firstCard).not.toBeNull();
	expect(secondCard).not.toBeNull();
	expect(secondCard!.y).toBeGreaterThan(firstCard!.y + firstCard!.height - 2);
	await expect(exhibit.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await expect(exhibit.getByRole('button', { name: 'Step', exact: true })).toBeEnabled();

	const tabs = experience(page).getByRole('tab');
	await expect(tabs).toHaveCount(3);
	for (const name of ['Gallery', 'Laboratory', 'Proof'] as const) {
		const tab = modeTab(page, name);
		const controlledId = await tab.getAttribute('aria-controls');
		expect(controlledId).toBeTruthy();
		await expect(page.locator(`#${controlledId}`)).toHaveCount(1);
		await expect(page.locator(`#${controlledId}`)).toHaveAttribute('role', 'tabpanel');
	}

	await exhibit.scrollIntoViewIfNeeded();
	const mobileScreenshot = await page.screenshot({ animations: 'disabled' });
	await testInfo.attach('v2-mobile-gallery', { body: mobileScreenshot, contentType: 'image/png' });

	const galleryTab = modeTab(page, 'Gallery');
	await galleryTab.focus();
	await galleryTab.press('ArrowRight');
	await expect(modeTab(page, 'Laboratory')).toBeFocused();
	await expect(modeTab(page, 'Laboratory')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#bz-v2-panel-laboratory')).toBeVisible();
	await modeTab(page, 'Laboratory').press('End');
	await expect(modeTab(page, 'Proof')).toBeFocused();
	await expect(modeTab(page, 'Proof')).toHaveAttribute('aria-selected', 'true');
	await expect(proof(page)).toBeVisible();
	await assertNoDuplicateIds(page);
});

test('the original Gray–Scott Reaction–Diffusion Atlas remains intact', async ({
	page,
	request
}) => {
	const response = await request.get(grayScottPath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(grayScottTitle);
	expect(html).toContain('/images/reaction-diffusion-atlas.png');
	expect(html).toContain('Six things to notice before touching every knob');

	await page.goto(grayScottPath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: grayScottTitle })).toHaveCount(1);
	await expect(page.locator('#reaction-diffusion-observatory')).toBeVisible();
	await expect(page.getByText('Gray–Scott model · fixed-step scientific instrument')).toBeVisible();
	await expect(page.locator('#reaction-diffusion-observatory .field-stack')).toBeVisible();
	await expect(page.getByTestId('bz-v2-experience')).toHaveCount(0);
	await assertNoDuplicateIds(page);
});
