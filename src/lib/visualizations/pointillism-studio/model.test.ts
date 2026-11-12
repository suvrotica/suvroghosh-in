import { describe, expect, it } from 'vitest';
import {
	buildPaintingModel,
	computeActiveMarkCount,
	computeExportDimensions,
	computeInspectCropRect,
	computeUniformStagePlacement,
	CURATED_SCENE_SEEDS,
	DEFAULT_POINTILLISM_STATE,
	deserializeStateParams,
	INITIAL_CURATED_SEED,
	normalizeSeed,
	normalizeState,
	ProgressivePaintingBuffer,
	renderPaintingCrop,
	renderWholePaintingRgba,
	SCENE_FAMILIES,
	serializeStateQuery
} from './index.ts';

function rgbToLuma(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbHueSpreadDeg(r: number, g: number, b: number): number {
	const rf = r / 255;
	const gf = g / 255;
	const bf = b / 255;
	const max = Math.max(rf, gf, bf);
	const min = Math.min(rf, gf, bf);
	const d = max - min;
	if (d < 1e-5) return 0;
	let h = 0;
	if (max === rf) h = ((gf - bf) / d) % 6;
	else if (max === gf) h = (bf - rf) / d + 2;
	else h = (rf - gf) / d + 4;
	h *= 60;
	if (h < 0) h += 360;
	return h;
}

describe('Pointillism Studio domain engine', () => {
	it('keeps normalizeSeed strictly idempotent and deterministic', () => {
		expect(normalizeSeed(418206)).toBe(418206);
		expect(normalizeSeed(normalizeSeed(418206))).toBe(418206);
		expect(normalizeSeed('418206')).toBe(418206);
		expect(normalizeSeed('san-antonio-river')).toBe(normalizeSeed('san-antonio-river'));
	});

	it('preserves exact scene geometry, people, and fields across all painting controls', () => {
		const base = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			seed: INITIAL_CURATED_SEED,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const altered = normalizeState({
			...base,
			dotSize: 82,
			dotSpacing: 76,
			paletteContrast: 88,
			colorVariation: 91,
			paintTexture: 95,
			paintingTime: 18
		});

		const mBase = buildPaintingModel(base);
		const mAltered = buildPaintingModel(altered);

		expect(mAltered.scene.summary).toEqual(mBase.scene.summary);
		expect(mAltered.scene.figures).toEqual(mBase.scene.figures);
		expect(mAltered.scene.focalArea).toEqual(mBase.scene.focalArea);
		expect(Array.from(mAltered.scene.fields.objectId)).toEqual(
			Array.from(mBase.scene.fields.objectId)
		);
		expect(Array.from(mAltered.scene.fields.depth)).toEqual(Array.from(mBase.scene.fields.depth));
		expect(Array.from(mAltered.scene.fields.rgb)).toEqual(Array.from(mBase.scene.fields.rgb));
	});

	it('scales mark footprints around fixed centers when Dot size changes', () => {
		const smallState = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			dotSize: 18,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const largeState = normalizeState({
			...smallState,
			dotSize: 78
		});

		const smallModel = buildPaintingModel(smallState);
		const largeModel = buildPaintingModel(largeState);

		expect(largeModel.activeCount).toBe(smallModel.activeCount);
		expect(largeModel.scheduledMarks.length).toBe(smallModel.scheduledMarks.length);

		for (let i = 0; i < smallModel.scheduledMarks.length; i++) {
			const a = smallModel.scheduledMarks[i]!;
			const b = largeModel.scheduledMarks[i]!;
			expect(b.id).toBe(a.id);
			expect(b.x).toBe(a.x);
			expect(b.y).toBe(a.y);
			expect(b.rx).toBeGreaterThan(a.rx);
			expect(b.ry).toBeGreaterThan(a.ry);
		}
	});

	it('uses strict prefix subsets from a stable candidate hierarchy when Dot spacing changes', () => {
		const tightState = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			dotSpacing: 20,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const openState = normalizeState({
			...tightState,
			dotSpacing: 72
		});

		const tightModel = buildPaintingModel(tightState);
		const openModel = buildPaintingModel(openState);

		expect(openModel.hierarchy.candidates.length).toBe(tightModel.hierarchy.candidates.length);
		expect(openModel.activeCount).toBeLessThan(tightModel.activeCount);
		expect(openModel.activeCount).toBe(
			computeActiveMarkCount(openModel.hierarchy.candidates.length, 72)
		);

		const tightById = new Map(tightModel.scheduledMarks.map((m) => [m.id, m]));
		for (const retained of openModel.scheduledMarks) {
			const match = tightById.get(retained.id);
			expect(match).toBeDefined();
			expect(retained.x).toBe(match!.x);
			expect(retained.y).toBe(match!.y);
			expect(retained.r).toBe(match!.r);
			expect(retained.g).toBe(match!.g);
			expect(retained.b).toBe(match!.b);
			expect(retained.rx).toBe(match!.rx);
			expect(retained.ry).toBe(match!.ry);
			expect(retained.edgeH1).toBe(match!.edgeH1);
			expect(retained.bristlePhase).toBe(match!.bristlePhase);
		}
	});

	it('separates Palette contrast (light-dark spread) from Color variation (neighboring hue spread)', () => {
		const base = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			paletteContrast: 15,
			colorVariation: 10,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const highContrast = normalizeState({ ...base, paletteContrast: 90 });
		const highVariation = normalizeState({ ...base, colorVariation: 92 });

		const mLow = buildPaintingModel(base);
		const mHighContrast = buildPaintingModel(highContrast);
		const mHighVar = buildPaintingModel(highVariation);

		const categoryById = new Map(mLow.hierarchy.candidates.map((c) => [c.id, c.categoryIndex]));

		const lumaStd = (marks: typeof mLow.scheduledMarks) => {
			const lumas = marks.map((m) => rgbToLuma(m.r, m.g, m.b));
			const mean = lumas.reduce((acc, v) => acc + v, 0) / lumas.length;
			const variance = lumas.reduce((acc, v) => acc + (v - mean) ** 2, 0) / lumas.length;
			return Math.sqrt(variance);
		};

		const canopyHueSpread = (marks: typeof mLow.scheduledMarks) => {
			// Category 10 = foliage-cypress, 11 = foliage-oak (from SURFACE_CATEGORIES)
			const foliageMarks = marks.filter((m) => {
				const cat = categoryById.get(m.id);
				return cat === 10 || cat === 11;
			});
			expect(foliageMarks.length).toBeGreaterThan(40);
			const hues = foliageMarks.map((m) => rgbHueSpreadDeg(m.r, m.g, m.b));
			const mean = hues.reduce((acc, v) => acc + v, 0) / hues.length;
			const variance = hues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / hues.length;
			return Math.sqrt(variance);
		};

		expect(lumaStd(mHighContrast.scheduledMarks)).toBeGreaterThan(
			lumaStd(mLow.scheduledMarks) * 1.18
		);
		expect(canopyHueSpread(mHighVar.scheduledMarks)).toBeGreaterThan(
			canopyHueSpread(mLow.scheduledMarks) * 1.35
		);
	});

	it('renders a clean primed canvas ground with zero hidden scene silhouettes beneath the marks', () => {
		const state = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const model = buildPaintingModel(state);
		const crop = { x: 0, y: 0, width: 640, height: 600 };
		const bareGround = renderPaintingCrop(model, crop, 640, 600, 0);

		let boundaryChecks = 0;
		let maxNeighborDiff = 0;
		const objIds = model.scene.fields.objectId;

		for (let y = 20; y < 580; y++) {
			for (let x = 20; x < 620; x++) {
				const idx = y * 640 + x;
				if (objIds[idx] !== objIds[idx + 1]) {
					boundaryChecks++;
					const p0 = idx * 4;
					const p1 = (idx + 1) * 4;
					const diff =
						Math.abs(bareGround[p0]! - bareGround[p1]!) +
						Math.abs(bareGround[p0 + 1]! - bareGround[p1 + 1]!) +
						Math.abs(bareGround[p0 + 2]! - bareGround[p1 + 2]!);
					if (diff > maxNeighborDiff) maxNeighborDiff = diff;
				}
			}
		}

		expect(boundaryChecks).toBeGreaterThan(200);
		// Smooth linen weave has tiny adjacent channel differences, never sharp scene silhouettes.
		expect(maxNeighborDiff).toBeLessThanOrEqual(24);
	});

	it('grounds figures across all four scene families and guards foreground silhouettes from background overpainting', () => {
		for (const family of SCENE_FAMILIES) {
			const state = normalizeState({
				...DEFAULT_POINTILLISM_STATE,
				sceneFamily: family.id,
				seed: CURATED_SCENE_SEEDS[family.id],
				artboardWidth: 800,
				artboardHeight: 600
			});
			const model = buildPaintingModel(state);
			expect(model.scene.figures.length).toBeGreaterThanOrEqual(1);

			for (const person of model.scene.figures) {
				expect(person.footX).toBeGreaterThan(20);
				expect(person.footX).toBeLessThan(780);
				expect(person.footY).toBeGreaterThan(200);
				expect(person.footY).toBeLessThan(598);
				expect(person.height).toBeGreaterThan(35);
			}

			// Background marks flagged near closer foreground silhouettes (depth - minNeighborDepth > 0.04)
			// must be scheduled in Pass 0 or Pass 1 before foreground silhouettes in Pass 2 / Pass 3.
			for (const mark of model.scheduledMarks) {
				if (mark.depth - mark.minNeighborDepth > 0.04) {
					expect(mark.pass).toBeLessThanOrEqual(1);
				}
			}
		}

		// Verify Hill Country seasonal gating: spring-bloom appears on explicit seeds rather than every seed.
		const seasons = new Set<string>();
		for (let s = 1; s <= 24; s++) {
			const hc = buildPaintingModel(
				normalizeState({
					...DEFAULT_POINTILLISM_STATE,
					sceneFamily: 'hill-country-creek',
					seed: 793400 + s,
					artboardWidth: 640,
					artboardHeight: 600
				})
			);
			seasons.add(hc.scene.summary.season);
		}
		expect(seasons.has('warm-daylight')).toBe(true);
		expect(seasons.has('spring-bloom')).toBe(true);
	});

	it('guarantees pixel-exact parity across progressive playback, Pause/Resume, Finish now, still render, and export', () => {
		const state = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			artboardWidth: 640,
			artboardHeight: 600
		});
		const model = buildPaintingModel(state);
		const fullCrop = { x: 0, y: 0, width: 640, height: 600 };

		const directStill = renderPaintingCrop(model, fullCrop, 640, 600);

		const stepped = new ProgressivePaintingBuffer(model, 640, 600, fullCrop);
		for (const p of [0.05, 0.18, 0.31, 0.48, 0.64, 0.81, 0.94, 1.0]) {
			stepped.advanceToProgress(p);
		}
		expect(stepped.isComplete()).toBe(true);
		expect(Buffer.compare(Buffer.from(stepped.pixels), Buffer.from(directStill))).toBe(0);

		const pauseFinish = new ProgressivePaintingBuffer(model, 640, 600, fullCrop);
		pauseFinish.advanceToProgress(0.37);
		expect(pauseFinish.isComplete()).toBe(false);
		pauseFinish.finishAll();
		expect(Buffer.compare(Buffer.from(pauseFinish.pixels), Buffer.from(directStill))).toBe(0);

		const exported = renderWholePaintingRgba(state, 640, model);
		expect(exported.width).toBe(640);
		expect(exported.height).toBe(600);
		expect(Buffer.compare(Buffer.from(exported.pixels), Buffer.from(directStill))).toBe(0);
	});

	it('preserves URL serialization, Inspect crop bounds, uniform resize scaling, and export aspect ratios', () => {
		const state = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			sceneFamily: 'neighborhood-street',
			seed: 529314,
			dotSize: 55,
			dotSpacing: 42,
			paletteContrast: 52,
			colorVariation: 61,
			paintTexture: 48,
			paintingTime: 12,
			artboardWidth: 1200,
			artboardHeight: 800
		});
		const query = serializeStateQuery(state, {
			viewState: {
				mode: 'inspect',
				inspectZoom: 3.4,
				inspectCenterX: 0.292,
				inspectCenterY: 0.688
			},
			overlayView: 'article'
		});
		const parsed = deserializeStateParams(query);
		expect(parsed.state).toEqual(state);
		expect(parsed.viewState.mode).toBe('inspect');
		expect(parsed.viewState.inspectZoom).toBeCloseTo(3.4, 2);
		expect(parsed.initialOverlay).toBe('article');

		const crop = computeInspectCropRect(1200, 800, parsed.viewState, 960, 640);
		expect(crop.x).toBeGreaterThanOrEqual(0);
		expect(crop.y).toBeGreaterThanOrEqual(0);
		expect(crop.x + crop.width).toBeLessThanOrEqual(1200);
		expect(crop.y + crop.height).toBeLessThanOrEqual(800);

		const fitPlacement = computeUniformStagePlacement(1200, 800, 390, 844, 'fit');
		expect(fitPlacement.cssWidth / fitPlacement.cssHeight).toBeCloseTo(1.5, 2);

		const dims2048 = computeExportDimensions(1200, 800, 2048);
		expect(dims2048).toEqual({ width: 2048, height: 1365 });
	});
});
