import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const article = '/blog/visualizations/spacetime-laboratory-einstein-equations';
const labSelector = '.spacetime-lab';
const models = [
	'minkowski',
	'weak-field',
	'schwarzschild',
	'kerr',
	'reissner-nordstrom',
	'flrw',
	'de-sitter',
	'anti-de-sitter',
	'gravitational-wave'
];

test('galaxy profiles remain continuous across source-cell boundaries', async ({ page }) => {
	const shaderRoot = 'src/lib/visualizations/spacetime-laboratory/shaders/';
	const vertex = readFileSync(`${shaderRoot}fullscreen.vert`, 'utf8');
	const fragment = `#version 300 es\n${readFileSync(`${shaderRoot}common.glsl`, 'utf8')}\n${readFileSync(`${shaderRoot}sky.glsl`, 'utf8')}\n
void main() {
	float pair = floor(gl_FragCoord.x / 2.0);
	float side = mod(floor(gl_FragCoord.x), 2.0) < 0.5 ? -1.0 : 1.0;
	float x = (pair - 6.0) / 7.0 + side * 0.00001;
	float angle = 2.0 * PI * gl_FragCoord.y / 512.0;
	float yz = sqrt(1.0 - x * x);
	outColor = vec4(skyColor(vec3(x, yz * sin(angle), yz * cos(angle)), 0.0, 0.0), 1.0);
}`;
	const result = await page.evaluate(
		({ vertex, fragment }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 26;
			canvas.height = 512;
			const gl = canvas.getContext('webgl2')!;
			const shader = (type: number, source: string) => {
				const compiled = gl.createShader(type)!;
				gl.shaderSource(compiled, source);
				gl.compileShader(compiled);
				if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
					throw new Error(gl.getShaderInfoLog(compiled) || 'Sky shader compilation failed');
				}
				return compiled;
			};
			const program = gl.createProgram()!;
			gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
			gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				throw new Error(gl.getProgramInfoLog(program) || 'Sky shader linking failed');
			}
			gl.useProgram(program);
			const buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
			const position = gl.getAttribLocation(program, 'a_position');
			gl.enableVertexAttribArray(position);
			gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			for (const [name, value] of Object.entries({
				u_seed: 1337,
				u_galaxies: 1,
				u_starDensity: 0,
				u_milkyway: 0,
				u_cmb: 0,
				u_reduced: 1
			})) {
				gl.uniform1f(gl.getUniformLocation(program, name), value);
			}
			gl.viewport(0, 0, 26, 512);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			const pixels = new Uint8Array(26 * 512 * 4);
			gl.readPixels(0, 0, 26, 512, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			let maximumJump = 0;
			let brightest = 0;
			// Each pair looks just to either side of one of 13 source-cell
			// boundaries; the rows sample 512 directions around each boundary.
			for (let row = 0; row < 512; row++) {
				for (let pair = 0; pair < 13; pair++) {
					const base = (row * 26 + pair * 2) * 4;
					for (let channel = 0; channel < 3; channel++) {
						maximumJump = Math.max(
							maximumJump,
							Math.abs(pixels[base + channel] - pixels[base + 4 + channel])
						);
						brightest = Math.max(brightest, pixels[base + channel], pixels[base + 4 + channel]);
					}
				}
			}
			const error = gl.getError();
			gl.getExtension('WEBGL_lose_context')?.loseContext();
			return { maximumJump, brightest, error };
		},
		{ vertex, fragment }
	);
	// Before neighboring-cell evaluation this deterministic grid jumped by
	// 226/255 at a clipped galaxy edge; the repaired field changes by 1/255.
	expect(result.maximumJump).toBeLessThanOrEqual(3);
	expect(result.brightest).toBeGreaterThan(50);
	expect(result.error).toBe(0);
});

async function openLab(page: Page, query = 'play=0&q=low') {
	await page.goto(`${article}?${query}`, { waitUntil: 'domcontentloaded' });
	const stage = page.locator(`${labSelector} .lab-canvas-frame`);
	await stage.scrollIntoViewIfNeeded();
	return stage;
}

async function pixels(page: Page) {
	return page.locator(`${labSelector} canvas`).evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		const gl = canvas.getContext('webgl2')!;
		const bytes = new Uint8Array(canvas.width * canvas.height * 4);
		gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
		let hash = 2166136261;
		const shades = new Set<number>();
		for (let i = 0; i < bytes.length; i += 4) {
			const rgb = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
			shades.add(rgb);
			hash = Math.imul(hash ^ rgb, 16777619);
		}
		return { hash: hash >>> 0, shades: shades.size, width: canvas.width, error: gl.getError() };
	});
}

async function countFrames(page: Page) {
	return page.evaluate(() => (window as unknown as { labFrames: number }).labFrames);
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as unknown as { labFrames: number };
		state.labFrames = 0;
		const original = WebGL2RenderingContext.prototype.drawArrays;
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			state.labFrames += 1;
			return original.apply(this, args);
		};
	});
});

test('all nine models compile and render in a software-compatible context', async ({
	page
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// The old parent probe would discard this otherwise usable context.
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			options?: unknown
		) {
			if ((options as WebGLContextAttributes)?.failIfMajorPerformanceCaveat) return null;
			return original.call(this, type as '2d', options as CanvasRenderingContext2DSettings);
		} as typeof original;
	});
	await openLab(page);
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
	const hashes = new Set<number>();
	for (const model of models) {
		const before = await countFrames(page);
		await page.getByLabel('Geometry / teaching model', { exact: true }).selectOption(model);
		await page.locator(`${labSelector} .lab-canvas-frame`).scrollIntoViewIfNeeded();
		if (model !== 'minkowski') await expect.poll(() => countFrames(page)).toBeGreaterThan(before);
		const frame = await pixels(page);
		expect(frame.error, model).toBe(0);
		expect(frame.width, model).toBeGreaterThan(100);
		expect(frame.shades, model).toBeGreaterThan(20);
		hashes.add(frame.hash);
		await page
			.locator(`${labSelector} .lab-canvas-frame`)
			.screenshot({ path: info.outputPath(`${model}.png`) });
	}
	expect(hashes.size).toBeGreaterThanOrEqual(8);
	expect(errors).toEqual([]);
});

test('paused, reduced-motion and offscreen scenes stop drawing, and controls redraw', async ({
	page
}) => {
	await openLab(page);
	await expect.poll(() => countFrames(page)).toBeGreaterThan(0);
	await page.waitForTimeout(300);
	const paused = await countFrames(page);
	await page.waitForTimeout(300);
	expect(await countFrames(page)).toBe(paused);
	await page.getByLabel('Geometry / teaching model', { exact: true }).selectOption('kerr');
	await page.locator(`${labSelector} .lab-canvas-frame`).scrollIntoViewIfNeeded();
	await expect.poll(() => countFrames(page)).toBeGreaterThan(paused);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.locator(`${labSelector} .lab-canvas-frame`).scrollIntoViewIfNeeded();
	const playing = await countFrames(page);
	await expect.poll(() => countFrames(page)).toBeGreaterThan(playing + 2);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(300);
	const offscreen = await countFrames(page);
	await page.waitForTimeout(300);
	expect(await countFrames(page)).toBe(offscreen);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.locator(`${labSelector} .lab-canvas-frame`).scrollIntoViewIfNeeded();
	await page.waitForTimeout(300);
	const reduced = await countFrames(page);
	await page.waitForTimeout(300);
	expect(await countFrames(page)).toBe(reduced);
});

test('graphics context loss reports the cause and retry produces a new frame', async ({ page }) => {
	await openLab(page);
	await expect.poll(() => countFrames(page)).toBeGreaterThan(0);
	await page.locator(`${labSelector} canvas`).evaluate((element) => {
		(element as HTMLCanvasElement)
			.getContext('webgl2')!
			.getExtension('WEBGL_lose_context')!
			.loseContext();
	});
	await expect(page.locator(labSelector)).toContainText('lost the WebGL graphics context');
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeDisabled();
	const before = await countFrames(page);
	await page.getByRole('button', { name: 'Retry visualization' }).click();
	await expect.poll(() => countFrames(page)).toBeGreaterThan(before);
	expect((await pixels(page)).error).toBe(0);
});

test('context creation and shader failures retain their specific diagnostics', async ({ page }) => {
	await page.addInitScript(() => {
		const original = WebGL2RenderingContext.prototype.shaderSource;
		WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
			return original.call(
				this,
				shader,
				source.includes('struct RayHit')
					? '#version 300 es\nTHIS_IS_A_TEST_COMPILATION_FAILURE'
					: source
			);
		};
	});
	await openLab(page);
	await expect(page.locator(labSelector)).toContainText('Spacetime renderer stopped');
	await expect(page.locator(labSelector)).toContainText('TEST_COMPILATION_FAILURE');
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeDisabled();
});

test('unavailable WebGL2 and the deliberate off switch retain readable fallback', async ({
	page
}) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			options?: unknown
		) {
			if (type === 'webgl2') return null;
			return original.call(this, type as '2d', options as CanvasRenderingContext2DSettings);
		} as typeof original;
	});
	await openLab(page);
	await expect(page.locator(labSelector)).toContainText('WebGL2 unavailable');
	await expect(page.locator(labSelector)).toContainText('Check browser graphics acceleration');
	await openLab(page, 'webgl=off');
	await expect(page.locator(labSelector)).toContainText('WebGL disabled by this link');
	await expect(page.locator(`${labSelector} canvas`)).toHaveCount(0);
	await expect(page.locator(`${labSelector} .equation-panel`)).toBeVisible();
});

test('keyboard shortcuts stay inside the focused viewport and PNG capture is valid', async ({
	page
}) => {
	const stage = await openLab(page);
	const distance = page.getByRole('slider', { name: /^Distance/ });
	const initial = await distance.inputValue();
	await page.locator('body').click({ position: { x: 2, y: 2 } });
	await page.keyboard.press('+');
	expect(await distance.inputValue()).toBe(initial);
	await stage.focus();
	await page.keyboard.press('+');
	expect(Number(await distance.inputValue())).toBe(Number(initial) - 0.5);
	await expect.poll(() => countFrames(page)).toBeGreaterThan(0);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save image', exact: true }).click();
	const stream = await (await downloadPromise).createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	expect([...Buffer.concat(chunks).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('portrait layout fits the viewport and its controls remain usable', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openLab(page);
	await expect.poll(() => countFrames(page)).toBeGreaterThan(0);
	const bounds = await page.locator(labSelector).boundingBox();
	expect(bounds!.x).toBeGreaterThanOrEqual(-1);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
	await page
		.getByLabel('Geometry / teaching model', { exact: true })
		.selectOption('gravitational-wave');
	await expect(page.locator(labSelector)).toContainText('Gravitational-wave');
});

test('Low quality still renders a captured central ray for the farthest observer', async ({
	page
}) => {
	await openLab(page, 'st=schwarzschild&d=40&play=0&q=low&cmb=1&ov=0000000');
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
	const sample = await page.locator(`${labSelector} canvas`).evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		const gl = canvas.getContext('webgl2')!;
		const center = new Uint8Array(4);
		const sky = new Uint8Array(4);
		gl.readPixels(
			Math.floor(canvas.width / 2),
			Math.floor(canvas.height / 2),
			1,
			1,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			center
		);
		gl.readPixels(5, canvas.height - 6, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sky);
		return { center: [...center.slice(0, 3)], sky: [...sky.slice(0, 3)], error: gl.getError() };
	});
	expect(sample.center).toEqual([0, 0, 0]);
	expect(Math.max(...sample.sky)).toBeGreaterThan(5);
	expect(sample.error).toBe(0);
});

test('zero-charge RN and Schwarzschild render the same rays in split comparison', async ({
	page
}) => {
	await openLab(
		page,
		'st=schwarzschild&cmp=reissner-nordstrom&compare=1&chg=0&play=0&q=low&ov=0000000'
	);
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
	const read = () =>
		page.locator(`${labSelector} canvas`).evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			const gl = canvas.getContext('webgl2')!;
			const pixels = new Uint8Array(canvas.width * canvas.height * 4);
			gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			let hash = 2166136261;
			for (let y = 0; y < canvas.height; y++)
				for (let x = 0; x < canvas.width; x++) {
					if (Math.abs(x - canvas.width / 2) < 3) continue;
					const i = 4 * (y * canvas.width + x);
					hash = Math.imul(
						hash ^ ((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]),
						16777619
					);
				}
			return hash >>> 0;
		});
	const split = await read();
	const before = await countFrames(page);
	await page.getByRole('checkbox', { name: 'Split-screen comparison', exact: true }).uncheck();
	await page.locator(`${labSelector} .lab-canvas-frame`).scrollIntoViewIfNeeded();
	await expect.poll(() => countFrames(page)).toBeGreaterThan(before);
	expect(await read()).toBe(split);
});

test('saving after editing an offscreen scene renders the current settings', async ({ page }) => {
	await openLab(page, 'st=gravitational-wave&play=0&q=low');
	await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
	const before = await pixels(page);
	await page.getByRole('button', { name: 'Save image', exact: true }).scrollIntoViewIfNeeded();
	const cmb = page.getByRole('checkbox', { name: 'Cosmic microwave background mode', exact: true });
	await cmb.check();
	const bounds = await page.locator(`${labSelector} .lab-canvas-frame`).boundingBox();
	expect(bounds!.y + bounds!.height).toBeLessThan(0);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save image', exact: true }).click();
	await downloadPromise;
	expect((await pixels(page)).hash).not.toBe(before.hash);
});
