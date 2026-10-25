import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/through-a-different-glass';
const laboratory = (page: Page) => page.getByTestId('lens-mirror-lab');

async function ready(page: Page, query = '') {
	await page.goto(articlePath + query, { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	await expect(lab).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 });
	return lab;
}

async function canvasPng(canvas: Locator) {
	const data = await canvas.evaluate((element) =>
		(element as HTMLCanvasElement).toDataURL('image/png')
	);
	expect(data).toMatch(/^data:image\/png;base64,/u);
	return Buffer.from(data.split(',')[1], 'base64');
}

async function canvasFingerprint(canvas: Locator) {
	return (await canvasPng(canvas)).toString('base64');
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function uploadFixture() {
	return sharp({
		create: { width: 160, height: 110, channels: 4, background: '#19a898' }
	})
		.composite([
			{
				input: Buffer.from(
					'<svg width="160" height="110"><path d="M10 10H130V90H10Z" fill="none" stroke="#102a36" stroke-width="10"/><circle cx="48" cy="50" r="19" fill="#f1cf61"/><path d="M100 20V82M100 20L130 45" stroke="white" stroke-width="9"/></svg>'
				)
			}
		])
		.png()
		.toBuffer();
}

test('the article renders its lab and original optics explanation on the server', async ({
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Through a Different Glass');
	expect(html).toContain('id="lens-mirror-lab"');
	expect(html).toContain('Original');
	expect(html).toContain('/images/visualizations/through-a-different-glass/');
});

test('desktop lab uses the available viewport and retains its editorial serif title', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await ready(page);
	const shell = page.locator('#lens-mirror-lab');
	const bounds = await shell.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.width).toBeGreaterThan(1100);
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1441);
	const titleFont = await shell
		.getByRole('heading', { level: 1 })
		.evaluate((element) => getComputedStyle(element).fontFamily);
	expect(titleFont).toMatch(/Newsreader|Georgia|(?:^|,\s*)serif(?:,|$)/iu);
});

test('lens presets produce distinct rendered images while the original stays unchanged', async ({
	page
}) => {
	const lab = await ready(page);
	const original = lab.getByTestId('original-canvas');
	const output = lab.getByTestId('distorted-canvas');
	const reference = await canvasFingerprint(original);
	const stats = await sharp(await canvasPng(output)).stats();
	expect(
		stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0)
	).toBeGreaterThan(20);
	const fingerprints = new Set<string>();
	for (const name of [
		'Barrel distortion',
		'Pincushion distortion',
		'Moustache distortion',
		'Equidistant fisheye',
		'Tangential distortion'
	]) {
		const previous = await canvasFingerprint(output);
		const button = lab.getByRole('button', { name, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		if (name !== 'Barrel distortion')
			await expect.poll(() => canvasFingerprint(output)).not.toBe(previous);
		await expect.poll(() => canvasFingerprint(output)).not.toBe(reference);
		fingerprints.add(await canvasFingerprint(output));
		expect(await canvasFingerprint(original)).toBe(reference);
	}
	expect(fingerprints.size).toBe(5);
});

test('mirror effects remain distinct and explicitly disclose their approximation', async ({
	page
}) => {
	const lab = await ready(page);
	const output = lab.getByTestId('distorted-canvas');
	const fingerprints = new Set<string>();
	for (const name of [
		'Flat mirror',
		'Convex appearance',
		'Concave appearance',
		'Cylindrical appearance',
		'Funhouse mirror'
	]) {
		const previous = await canvasFingerprint(output);
		const button = lab.getByRole('button', { name, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		if (name !== 'Flat mirror') await expect(lab).toContainText(/2D.*approximation/iu);
		await expect.poll(() => canvasFingerprint(output)).not.toBe(previous);
		fingerprints.add(await canvasFingerprint(output));
	}
	expect(fingerprints.size).toBe(5);
});

test('identity reproduces the source and a flat mirror reverses it exactly once', async ({
	page
}) => {
	const lab = await ready(page);
	const original = lab.getByTestId('original-canvas');
	const output = lab.getByTestId('distorted-canvas');
	const normalised = async (image: Buffer, mirrored = false) => {
		const pipeline = sharp(image);
		if (mirrored) pipeline.flop();
		return pipeline.resize(160, 120, { fit: 'fill' }).removeAlpha().raw().toBuffer();
	};
	const meanDifference = (a: Buffer, b: Buffer) =>
		a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
	const reference = await normalised(await canvasPng(original));
	const previous = await canvasFingerprint(output);
	await lab.getByRole('button', { name: 'Original', exact: true }).click();
	await expect.poll(() => canvasFingerprint(output)).not.toBe(previous);
	expect(meanDifference(reference, await normalised(await canvasPng(output)))).toBeLessThan(4);
	const identity = await canvasFingerprint(output);
	await lab.getByRole('button', { name: 'Flat mirror', exact: true }).click();
	await expect.poll(() => canvasFingerprint(output)).not.toBe(identity);
	const mirrored = await normalised(await canvasPng(original), true);
	expect(meanDifference(mirrored, await normalised(await canvasPng(output)))).toBeLessThan(4);
});

test('keyboard and numeric inputs update output, and reset restores the selected preset', async ({
	page
}) => {
	const lab = await ready(page);
	const output = lab.getByTestId('distorted-canvas');
	const original = await canvasFingerprint(lab.getByTestId('original-canvas'));
	const baseline = await canvasFingerprint(output);
	const strength = lab.getByRole('slider', { name: 'Strength', exact: true });
	await strength.focus();
	await strength.press('ArrowRight');
	await expect.poll(() => canvasFingerprint(output)).not.toBe(baseline);
	const centre = lab.getByRole('spinbutton', { name: /Centre X/iu });
	await centre.fill('0.7');
	await centre.press('Tab');
	await expect.poll(() => canvasFingerprint(output)).not.toBe(baseline);
	expect(await canvasFingerprint(lab.getByTestId('original-canvas'))).toBe(original);
	await lab.getByRole('button', { name: 'Reset effect', exact: true }).click();
	await expect.poll(() => canvasFingerprint(output)).toBe(baseline);
});

test('sequential decimal and negative coefficient entry preserves the intended values', async ({
	page
}) => {
	const lab = await ready(page);
	const strength = lab.getByRole('spinbutton', { name: 'Strength value', exact: true });
	await strength.fill('');
	await strength.pressSequentially('.37');
	await strength.press('Tab');
	await expect(lab.getByRole('slider', { name: 'Strength', exact: true })).toHaveValue('0.37');
	await expect(strength).toHaveValue('0.37');
	await lab.locator('summary').filter({ hasText: 'Advanced lens coefficients' }).click();
	await lab.getByRole('checkbox', { name: 'Use custom coefficients', exact: true }).check();
	const output = lab.getByTestId('distorted-canvas');
	const previous = await canvasFingerprint(output);
	const tangential = lab.getByRole('spinbutton', { name: 'Coefficient p1', exact: true });
	await tangential.fill('');
	await tangential.pressSequentially('-0.03');
	await tangential.press('Tab');
	await expect(tangential).toHaveValue('-0.03');
	await expect.poll(() => canvasFingerprint(output)).not.toBe(previous);
});

test('all built-in images load and the divider works on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const lab = await ready(page);
	const fingerprints = new Set<string>();
	for (const name of ['Calibration', 'Architecture', 'Portrait', 'Corridor', 'Type & colour']) {
		const button = lab.getByRole('button', { name, exact: true });
		const previous = await canvasFingerprint(lab.getByTestId('original-canvas'));
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		if (name !== 'Calibration') {
			await expect
				.poll(() => canvasFingerprint(lab.getByTestId('original-canvas')))
				.not.toBe(previous);
		}
		fingerprints.add(await canvasFingerprint(lab.getByTestId('original-canvas')));
	}
	expect(fingerprints.size).toBe(5);
	await lab.getByRole('button', { name: 'Divider', exact: true }).click();
	const divider = lab.getByRole('slider', { name: /comparison|divider/iu });
	await expect(divider).toBeVisible();
	const before = await divider.inputValue();
	await divider.focus();
	await divider.press('ArrowRight');
	await expect(divider).not.toHaveValue(before);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
});

test('local image loading is private and failed replacements retain the working image', async ({
	page
}) => {
	const lab = await ready(page);
	const leakEvidence: string[] = [];
	const fixture = await uploadFixture();
	page.on('request', (request) => {
		const content = `${request.url()} ${request.postData() ?? ''}`;
		const body = request.postDataBuffer();
		if (
			/private-lens-upload|data:image\//iu.test(content) ||
			content.includes(fixture.toString('base64')) ||
			body?.includes(fixture)
		)
			leakEvidence.push(`${request.method()} ${request.url()}`);
	});
	const file = lab.getByLabel('Choose an image', { exact: true });
	const beforeUpload = await canvasFingerprint(lab.getByTestId('original-canvas'));
	await file.setInputFiles({
		name: 'private-lens-upload.png',
		mimeType: 'image/png',
		buffer: fixture
	});
	await expect(lab).toContainText(/160\s*[×x]\s*110/u);
	await expect
		.poll(() => canvasFingerprint(lab.getByTestId('original-canvas')))
		.not.toBe(beforeUpload);
	const uploaded = await canvasFingerprint(lab.getByTestId('original-canvas'));
	await file.setInputFiles({
		name: 'corrupt.png',
		mimeType: 'image/png',
		buffer: Buffer.from('not an image')
	});
	await expect(lab.getByRole('status')).toContainText(
		/invalid|unsupported|could not|corrupt|recognis/iu
	);
	expect(await canvasFingerprint(lab.getByTestId('original-canvas'))).toBe(uploaded);
	await file.setInputFiles({
		name: 'too-large.png',
		mimeType: 'image/png',
		buffer: Buffer.alloc(10_000_001)
	});
	await expect(lab.getByRole('status')).toContainText(/10\s*MB|size|large/iu);
	expect(await canvasFingerprint(lab.getByTestId('original-canvas'))).toBe(uploaded);
	const excessiveDimensions = Buffer.from(await uploadFixture());
	excessiveDimensions.writeUInt32BE(9000, 16);
	await file.setInputFiles({
		name: 'excessive-dimensions.png',
		mimeType: 'image/png',
		buffer: excessiveDimensions
	});
	await expect(lab.getByRole('status')).toContainText(/8192|dimension|limit|large/iu);
	expect(await canvasFingerprint(lab.getByTestId('original-canvas'))).toBe(uploaded);
	expect(leakEvidence).toEqual([]);
});

test('JPEG and static WebP uploads prepare their actual image dimensions', async ({ page }) => {
	const lab = await ready(page);
	const input = lab.getByLabel('Choose an image', { exact: true });
	const fixture = await uploadFixture();
	for (const [name, mimeType, buffer] of [
		['local-image.jpg', 'image/jpeg', await sharp(fixture).jpeg({ quality: 92 }).toBuffer()],
		['local-image.webp', 'image/webp', await sharp(fixture).webp({ lossless: true }).toBuffer()]
	] as const) {
		await input.setInputFiles({ name, mimeType, buffer });
		await expect(lab.getByRole('status')).toContainText('Your image is ready');
		await expect(lab).toContainText(/160\s*[×x]\s*110/u);
		for (const id of ['original-canvas', 'distorted-canvas']) {
			await expect
				.poll(() =>
					lab.getByTestId(id).evaluate((element) => {
						const canvas = element as HTMLCanvasElement;
						return [canvas.width, canvas.height];
					})
				)
				.toEqual([160, 110]);
		}
	}
});

test('JPEG EXIF orientation prepares and displays both panes in portrait aspect', async ({
	page
}) => {
	const lab = await ready(page);
	const oriented = await sharp(await uploadFixture())
		.withMetadata({ orientation: 6 })
		.jpeg({ quality: 92 })
		.toBuffer();
	const metadata = await sharp(oriented).metadata();
	expect([metadata.width, metadata.height, metadata.orientation]).toEqual([160, 110, 6]);
	await lab.getByLabel('Choose an image', { exact: true }).setInputFiles({
		name: 'oriented-portrait.jpg',
		mimeType: 'image/jpeg',
		buffer: oriented
	});
	await expect(lab.getByRole('status')).toContainText('Your image is ready');
	await expect(lab).toContainText(/110\s*[×x]\s*160/u);
	for (const id of ['original-canvas', 'distorted-canvas']) {
		const canvas = lab.getByTestId(id);
		await expect
			.poll(() =>
				canvas.evaluate((element) => {
					const image = element as HTMLCanvasElement;
					return [image.width, image.height];
				})
			)
			.toEqual([110, 160]);
		const bounds = await canvas.boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.width / bounds!.height).toBeCloseTo(110 / 160, 2);
	}
});

test('PNG downloads contain the current image and the comparison contains both panes', async ({
	page
}) => {
	const lab = await ready(page);
	const [single] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: 'Download image', exact: true }).click()
	]);
	expect(await single.failure()).toBeNull();
	expect(single.suggestedFilename()).toMatch(/\.png$/u);
	const output = await sharp(await downloadBytes(single)).metadata();
	expect(output.format).toBe('png');
	expect(output.width).toBeGreaterThan(100);
	const [comparison] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: 'Download comparison', exact: true }).click()
	]);
	const sideBySide = await sharp(await downloadBytes(comparison)).metadata();
	expect(sideBySide.format).toBe('png');
	expect(sideBySide.width).toBeGreaterThan(output.width!);
});

test('shared built-in settings reproduce the effect and cannot contain a local image', async ({
	page
}) => {
	const lab = await ready(page);
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await lab.getByRole('button', { name: 'Portrait', exact: true }).click();
	await lab.getByRole('button', { name: 'Pincushion distortion', exact: true }).click();
	await lab.getByRole('button', { name: 'Copy settings link', exact: true }).click();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	const parsed = new URL(link);
	expect(parsed.pathname).toBe(articlePath);
	expect(link).not.toMatch(/data:|blob:|\.png|upload/iu);
	await page.goto(link, { waitUntil: 'domcontentloaded' });
	await expect(laboratory(page)).toHaveAttribute('data-render-state', 'ready');
	await expect(
		laboratory(page).getByRole('button', { name: 'Pincushion distortion', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(
		laboratory(page).getByRole('button', { name: 'Portrait', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
});

test('the deterministic no-WebGL path preserves a labelled fallback and the article', async ({
	page
}) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab).toHaveAttribute('data-render-state', 'fallback');
	await expect(lab).toContainText(/WebGL.*unavailable|interactive rendering.*unavailable/iu);
	await expect(lab.locator('img').first()).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'A straight line takes a bend', exact: true })
	).toBeVisible();
});
