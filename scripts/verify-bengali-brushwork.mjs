import { build } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const feature = fileURLToPath(
	new URL('../src/lib/visualizations/bengali-impressionism/', import.meta.url)
);
const bundleOptions = {
	bundle: true,
	platform: 'browser',
	format: 'esm',
	write: false
};
const [studioBundle, workerBundle] = await Promise.all([
	build({
		...bundleOptions,
		stdin: {
			contents: `
				import * as brush from './brush';
				import * as scenes from './scene';
				import { DEFAULT_PAINT, outputSize } from './studio-state';
				import { PaintingTimeline } from './timeline';
				import { startExport } from './export-image';
				window.studio = { ...brush, ...scenes, DEFAULT_PAINT, outputSize, PaintingTimeline, startExport };
			`,
			resolveDir: feature
		}
	}),
	build({ ...bundleOptions, entryPoints: [join(feature, 'export.worker.ts')] })
]);
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
	headless: true
});

try {
	const page = await browser.newPage({ serviceWorkers: 'block' });
	const origin = 'https://brushwork.test';
	const assets = new Map([
		['/studio.js', studioBundle.outputFiles[0].text],
		['/export.worker.ts', workerBundle.outputFiles[0].text]
	]);
	await page.route(`${origin}/**`, (route) => {
		const pathname = new URL(route.request().url()).pathname;
		const source = assets.get(pathname);
		if (source) return route.fulfill({ contentType: 'text/javascript', body: source });
		return route.fulfill({
			contentType: 'text/html',
			body: '<!doctype html><title>Painting verifier</title><script type="module" src="/studio.js"></script>'
		});
	});
	await page.goto(origin);
	await page.waitForFunction(() => Boolean(window.studio));
	const report = await page.evaluate(async () => {
		const {
			DEFAULT_SEED,
			DEFAULT_PAINT,
			SCENE_FAMILIES,
			generateScene,
			prepareBrushwork,
			buildPainting,
			framePainting,
			renderPainting,
			outputSize,
			PaintingTimeline,
			startExport
		} = window.studio;

		function check(condition, message) {
			if (!condition) throw new Error(message);
		}

		function canvasFor(width, height) {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			return canvas;
		}

		function sameAnchors(first, second) {
			return (
				first.id === second.id &&
				first.x === second.x &&
				first.y === second.y &&
				first.angle === second.angle
			);
		}

		const counts = {};
		for (const family of Object.keys(SCENE_FAMILIES)) {
			const scene = generateScene(family, DEFAULT_SEED);
			const work = prepareBrushwork(scene);
			const before = JSON.stringify(scene);
			const again = prepareBrushwork(generateScene(family, DEFAULT_SEED));
			check(
				JSON.stringify(again.scene) === before,
				`${family} composition changed at the same seed`
			);
			check(
				JSON.stringify(again.candidates) === JSON.stringify(work.candidates),
				`${family} candidate list changed at the same seed`
			);
			check(
				JSON.stringify(generateScene(family, 'another-seed').shapes) !==
					JSON.stringify(scene.shapes),
				`${family} composition did not vary when seeded anew`
			);

			const base = buildPainting(work, DEFAULT_PAINT);
			const broad = buildPainting(work, { ...DEFAULT_PAINT, brushSize: 88 });
			const fine = buildPainting(work, { ...DEFAULT_PAINT, brushSize: 15 });
			const soft = buildPainting(work, { ...DEFAULT_PAINT, softness: 92 });
			const warm = buildPainting(work, { ...DEFAULT_PAINT, warmth: 90 });
			const smooth = buildPainting(work, { ...DEFAULT_PAINT, texture: 0 });
			const sparse = buildPainting(work, { ...DEFAULT_PAINT, density: 15 });
			const dense = buildPainting(work, { ...DEFAULT_PAINT, density: 100 });
			const preview = buildPainting(work, DEFAULT_PAINT, true);

			for (const painting of [broad, fine, soft, warm, smooth]) {
				check(
					painting.strokes.length === base.strokes.length &&
						painting.strokes.every((stroke, index) => sameAnchors(stroke, base.strokes[index])),
					`${family} brush settings moved or reordered a mark`
				);
			}
			check(
				broad.strokes.every((stroke, index) => stroke.width > fine.strokes[index].width),
				`${family} brush size did not enlarge its footprints`
			);
			check(
				soft.strokes.some((stroke, index) => stroke.width !== base.strokes[index].width) &&
					soft.strokes.some((stroke, index) => stroke.width === base.strokes[index].width),
				`${family} edge softness did not leave some interiors untouched`
			);
			check(
				warm.strokes.some((stroke, index) => stroke.color !== base.strokes[index].color),
				`${family} warmth left pigments unchanged`
			);
			check(
				smooth.strokes.every((stroke, index) => stroke.width === base.strokes[index].width) &&
					smooth.strokes.every((stroke) => !stroke.material.bristles),
				`${family} texture altered footprints or retained bristles at zero`
			);

			const denseById = new Map(dense.strokes.map((stroke) => [stroke.id, stroke]));
			check(denseById.size === dense.strokes.length, `${family} contains duplicate stroke IDs`);
			check(
				sparse.strokes.length < base.strokes.length &&
					base.strokes.length < dense.strokes.length &&
					sparse.strokes.every((stroke) => {
						const match = denseById.get(stroke.id);
						return (
							match &&
							sameAnchors(stroke, match) &&
							stroke.color === match.color &&
							stroke.width === match.width
						);
					}),
				`${family} density changed the retained marks`
			);
			check(
				preview.strokes.length < base.strokes.length &&
					preview.strokes.every((stroke) => !stroke.material.bristles),
				`${family} drag preview retained the costly material paths`
			);
			check(JSON.stringify(scene) === before, `${family} rendering mutated the scene`);

			for (const [width, height] of [
				[600, 400],
				[300, 650],
				[900, 290]
			]) {
				const frame = framePainting(scene, width / height);
				const canvas = canvasFor(width, height);
				renderPainting(canvas, base, frame);
				const transform = canvas.getContext('2d').getTransform();
				check(
					transform.a === transform.d && transform.b === 0 && transform.c === 0,
					`${family} distorted the painting at ${width}×${height}`
				);
				check(
					scene.focal.x >= frame.x &&
						scene.focal.x <= frame.x + frame.width &&
						scene.focal.y >= frame.y &&
						scene.focal.y <= frame.y + frame.height,
					`${family} cropped out its focal point at ${width}×${height}`
				);
				if (width !== 600) continue;
				const still = canvas.toDataURL();
				const timeline = new PaintingTimeline(canvas, base, frame);
				timeline.draw(0);
				const prepared = canvas.toDataURL();
				timeline.draw(0.4);
				const partial = canvas.toDataURL();
				check(
					partial !== prepared && partial !== still,
					`${family} never showed a partial painting`
				);
				timeline.draw(1);
				check(canvas.toDataURL() === still, `${family} completed animation differs from the still`);
				timeline.draw(0);
				check(canvas.toDataURL() === prepared, `${family} replay retained earlier strokes`);
				timeline.draw(0.14);
				timeline.draw(0.57);
				timeline.draw(0.91);
				timeline.draw(1);
				check(canvas.toDataURL() === still, `${family} ordinary playback differs from Finish now`);
			}
			counts[family] = {
				sparse: sparse.strokes.length,
				default: base.strokes.length,
				dense: dense.strokes.length
			};
		}

		const scene = generateScene('street', DEFAULT_SEED);
		const paint = buildPainting(prepareBrushwork(scene), DEFAULT_PAINT);
		const frame = framePainting(scene, 1.5);
		const request = { family: 'street', seed: DEFAULT_SEED, settings: DEFAULT_PAINT, frame };
		const exports = [];
		for (const longSide of [600, 2048, 4096]) {
			const { width, height } = outputSize(frame.width / frame.height, longSide);
			const task = startExport({ ...request, width, height });
			check(task, 'Offscreen export is unavailable in the test browser');
			const blob = await task.result;
			check(blob.type === 'image/png' && blob.size > 0, `Could not encode a ${longSide}-pixel PNG`);
			const decoded = await createImageBitmap(blob);
			check(
				decoded.width === width && decoded.height === height,
				'Exported PNG has the wrong dimensions'
			);
			exports.push([width, height]);
			if (longSide === 600) {
				const direct = canvasFor(width, height);
				renderPainting(direct, paint, frame);
				const fromWorker = canvasFor(width, height).getContext('2d');
				fromWorker.drawImage(decoded, 0, 0);
				const directPixels = direct.getContext('2d').getImageData(0, 0, width, height).data;
				const exportPixels = fromWorker.getImageData(0, 0, width, height).data;
				check(
					directPixels.every((value, index) => value === exportPixels[index]),
					'Worker export and direct Canvas pixels differ'
				);
			}
			decoded.close();
		}
		const canceled = startExport({ ...request, width: 600, height: 400 });
		const canceledWith = canceled.result.catch((error) => error.name);
		canceled.cancel();
		check((await canceledWith) === 'AbortError', 'Cancel left the export pending');
		return { counts, exports };
	});

	console.log(JSON.stringify(report, null, 2));
	console.log(
		'Verified seeded brushwork, uniform framing, direct/playback PNG parity, and export.'
	);
} finally {
	await browser.close();
}
