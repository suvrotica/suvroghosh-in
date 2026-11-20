import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	CURATED_DEFAULT_SEED,
	CURATED_STUDY_SEEDS,
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_DRIP_STATE,
	DEFAULT_VIEW_STATE,
	DRIP_GENERATOR_VERSION,
	DRIP_STORAGE_KEY,
	EXPERIMENT_CONFIG,
	GROUND_BASE_RGB,
	MAX_LAYERS,
	MAX_PASSES,
	PALETTE,
	PRESET_SPECS,
	ProgressiveDripBuffer,
	STUDY_LIST,
	applyPreset,
	applySweepWidth,
	buildCanonicalPassTable,
	buildDepositionPasses,
	buildPaintTimeline,
	buildPaintingModel,
	chooseArtboardForViewport,
	clearStateFromStorage,
	computeExportDimensions,
	computeInspectCropRect,
	computePaintingFocalPoint,
	computeUniformStagePlacement,
	createDefaultState,
	createNextSeed,
	createStreamRng,
	describePaintingAccessible,
	deserializeStateParams,
	exportWholePainting,
	findMatchingPreset,
	formatExportFilename,
	getPassPathPoints,
	hashMarkSigned,
	hashMarkUnit,
	hashPassSigned,
	hashPassUnit,
	loadStateFromStorage,
	measurePaintingMetrics,
	normalizeSeed,
	normalizeState,
	normalizeViewState,
	renderPaintingStill,
	renderWholePaintingRgba,
	saveStateToStorage,
	selectActivePasses,
	serializeStateParams,
	smoothNoise2D,
	type DripPaintingState,
	type PigmentId,
	type StudyId
} from './index.ts';

function bufferEq(a: ArrayBufferView, b: ArrayBufferView): boolean {
	return (
		Buffer.compare(
			Buffer.from(a.buffer, a.byteOffset, a.byteLength),
			Buffer.from(b.buffer, b.byteOffset, b.byteLength)
		) === 0
	);
}

describe('drip-painting-studio pure deterministic engine', () => {
	// 1. PRNG isolation & cross-study determinism
	it('enforces seed normalization, 5-stream PRNG isolation, and cross-study determinism', () => {
		expect(normalizeSeed(729104)).toBe(729104);
		expect(normalizeSeed('729104')).toBe(729104);
		expect(normalizeSeed(0)).toBe(CURATED_DEFAULT_SEED);
		expect(normalizeSeed(Number.NaN)).toBe(CURATED_DEFAULT_SEED);
		expect(normalizeSeed('pending-file-study')).toBe(normalizeSeed('pending-file-study'));
		expect(normalizeSeed(normalizeSeed('pending-file-study'))).toBe(
			normalizeSeed('pending-file-study')
		);
		expect(createDefaultState()).toEqual(DEFAULT_DRIP_STATE);

		const next1 = createNextSeed(729104, 1);
		const next2 = createNextSeed(729104, 2);
		expect(next1).toBeGreaterThanOrEqual(100_000);
		expect(next1).toBeLessThanOrEqual(999_999);
		expect(next1).not.toBe(729104);
		expect(next2).not.toBe(next1);

		const streams = ['paths', 'layers', 'flow', 'surface', 'timeline'] as const;
		const samples = streams.map((stream) => {
			const r1 = createStreamRng(729104, stream, 0);
			const r2 = createStreamRng(729104, stream, 0);
			const seq1 = [r1.nextUint32(), r1.nextUint32(), r1.nextUint32()];
			const seq2 = [r2.nextUint32(), r2.nextUint32(), r2.nextUint32()];
			expect(seq1).toEqual(seq2);
			return seq1.join(',');
		});
		expect(new Set(samples).size).toBe(5);

		for (const spec of STUDY_LIST) {
			const state = normalizeState({
				study: spec.id,
				seed: CURATED_STUDY_SEEDS[spec.id]
			});
			const modelA = buildPaintingModel(state);
			const modelB = buildPaintingModel({ ...state });
			expect(modelA.description).toBe(modelB.description);
			expect(modelA.focalPoint).toEqual(modelB.focalPoint);

			const rgbaA = new Uint8ClampedArray(300 * 200 * 4);
			const heightA = new Float32Array(300 * 200);
			const rgbaB = new Uint8ClampedArray(300 * 200 * 4);
			const heightB = new Float32Array(300 * 200);

			renderPaintingStill(
				{ pixels: rgbaA, heightField: heightA, width: 300, height: 200 },
				modelA,
				{
					width: 300,
					height: 200
				}
			);
			renderPaintingStill(
				{ pixels: rgbaB, heightField: heightB, width: 300, height: 200 },
				modelB,
				{
					width: 300,
					height: 200
				}
			);

			expect(bufferEq(rgbaA, rgbaB)).toBe(true);
			expect(bufferEq(heightA, heightB)).toBe(true);
		}
	});

	// 2. Mandatory path-flow invariance (Paint flow 10..100)
	it('maintains byte-identical path geometry, velocities, curvatures, and layers across Paint flow 10..100%', () => {
		const flows = [10, 20, 45, 80, 100];

		for (const spec of STUDY_LIST) {
			const seed = CURATED_STUDY_SEEDS[spec.id];
			const models = flows.map((paintFlow) =>
				buildPaintingModel(
					normalizeState({
						study: spec.id,
						seed,
						passes: MAX_PASSES,
						paintLayers: MAX_LAYERS,
						paintFlow
					})
				)
			);

			const base = models[0]!;
			expect(base.depositionPasses.length).toBe(MAX_PASSES);

			for (let m = 1; m < models.length; m++) {
				const cand = models[m]!;
				expect(cand.depositionPasses.length).toBe(base.depositionPasses.length);
				for (let i = 0; i < base.depositionPasses.length; i++) {
					const pa = base.depositionPasses[i]!;
					const pb = cand.depositionPasses[i]!;
					expect(pb.passIndex).toBe(pa.passIndex);
					expect(pb.layerIndex).toBe(pa.layerIndex);
					expect(pb.pigmentKey).toBe(pa.pigmentKey);
					expect(pb.anchorX).toBe(pa.anchorX);
					expect(pb.anchorY).toBe(pa.anchorY);
					expect(bufferEq(pb.x, pa.x)).toBe(true);
					expect(bufferEq(pb.y, pa.y)).toBe(true);
					expect(bufferEq(pb.vx, pa.vx)).toBe(true);
					expect(bufferEq(pb.vy, pa.vy)).toBe(true);
					expect(bufferEq(pb.signedCurvature, pa.signedCurvature)).toBe(true);
					expect(bufferEq(pb.tx, pa.tx)).toBe(true);
					expect(bufferEq(pb.ty, pa.ty)).toBe(true);
					expect(bufferEq(pb.speed, pa.speed)).toBe(true);
					expect(bufferEq(pb.globalSpeedNorm, pa.globalSpeedNorm)).toBe(true);
					expect(bufferEq(pb.dwell, pa.dwell)).toBe(true);
					expect(bufferEq(pb.arcLength, pa.arcLength)).toBe(true);
				}
			}

			// Verify getPassPathPoints exposes all required path point attributes
			const pts20 = getPassPathPoints(models[1]!.depositionPasses[0]!);
			const pts80 = getPassPathPoints(models[3]!.depositionPasses[0]!);
			expect(pts20.length).toBe(pts80.length);
			for (let k = 0; k < pts20.length; k++) {
				expect(pts20[k]!.x).toBe(pts80[k]!.x);
				expect(pts20[k]!.y).toBe(pts80[k]!.y);
				expect(pts20[k]!.vx).toBe(pts80[k]!.vx);
				expect(pts20[k]!.vy).toBe(pts80[k]!.vy);
				expect(pts20[k]!.signedCurvature).toBe(pts80[k]!.signedCurvature);
				expect(pts20[k]!.layerIndex).toBe(pts80[k]!.layerIndex);
			}

			// Verify Paint flow 80% increases ribbon width, droplets, and pooling vs 20%
			const thin = models[1]!;
			const heavy = models[3]!;
			let meanW20 = 0;
			let meanW80 = 0;
			let drops20 = 0;
			let drops80 = 0;
			let poolArea20 = 0;
			let poolArea80 = 0;
			for (let i = 0; i < thin.depositionPasses.length; i++) {
				const a = thin.depositionPasses[i]!;
				const b = heavy.depositionPasses[i]!;
				for (let k = 0; k < a.pointCount; k++) {
					meanW20 += a.halfWidth[k]!;
					meanW80 += b.halfWidth[k]!;
				}
				drops20 += a.droplets.length;
				drops80 += b.droplets.length;
				for (const p of a.pools) poolArea20 += p.radius * p.radius;
				for (const p of b.pools) poolArea80 += p.radius * p.radius;
			}
			expect(meanW80).toBeGreaterThan(meanW20);
			expect(drops80).toBeGreaterThan(drops20);
			expect(poolArea80).toBeGreaterThan(poolArea20);
		}
	});

	// 3. Strict prefix invariance (Passes 4..40)
	it('preserves strict prefix invariance across Passes 4..40 and renders all 4 passes in Single Trail', () => {
		const counts = [4, 10, 18, 28, 40];
		const models = counts.map((passes) =>
			buildPaintingModel(
				normalizeState({
					study: 'pending-file',
					seed: CURATED_DEFAULT_SEED,
					passes,
					paintLayers: MAX_LAYERS
				})
			)
		);

		for (let idx = 0; idx < counts.length - 1; idx++) {
			const low = models[idx]!;
			const high = models[counts.length - 1]!;
			const lowMap = new Map(low.depositionPasses.map((p) => [p.passIndex, p]));
			const highSubset = high.depositionPasses.filter((p) => p.passIndex < counts[idx]!);
			expect(highSubset.length).toBe(low.depositionPasses.length);

			for (let i = 0; i < highSubset.length; i++) {
				const hPass = highSubset[i]!;
				const lPass = lowMap.get(hPass.passIndex)!;
				expect(lPass).toBeDefined();
				expect(lPass.layerIndex).toBe(hPass.layerIndex);
				expect(lPass.pigmentKey).toBe(hPass.pigmentKey);
				expect(bufferEq(lPass.x, hPass.x)).toBe(true);
				expect(bufferEq(lPass.y, hPass.y)).toBe(true);
				expect(bufferEq(lPass.halfWidth, hPass.halfWidth)).toBe(true);
				expect(lPass.pools).toEqual(hPass.pools);
				expect(lPass.droplets).toEqual(hPass.droplets);
			}
		}

		// Decreasing 40 -> 18 -> 4 recovers identical prefix
		const recovered4 = buildPaintingModel(
			normalizeState({
				study: 'pending-file',
				seed: CURATED_DEFAULT_SEED,
				passes: 4,
				paintLayers: MAX_LAYERS
			})
		);
		expect(recovered4.depositionPasses.map((p) => p.passIndex)).toEqual(
			models[0]!.depositionPasses.map((p) => p.passIndex)
		);

		// Single Trail preset (passes: 4, paintLayers: 2) renders all 4 passes across L1..L2
		const singleTrail = buildPaintingModel(applyPreset(createDefaultState(), 'single-trail'));
		expect(singleTrail.depositionPasses.length).toBe(4);
		expect(singleTrail.depositionPasses.every((p) => p.layerIndex <= 2)).toBe(true);
	});

	// 4. Lower-layer bit-for-bit invariance (Paint layers 2..6)
	it('maintains pass-to-layer distribution and bit-for-bit lower-layer invariance across Paint layers 2..6', () => {
		const table = buildCanonicalPassTable(CURATED_DEFAULT_SEED, 'pending-file', 1200, 800);
		expect(table.passes.slice(0, 4).every((p) => p.layerIndex <= 2)).toBe(true);
		expect(new Set(table.passes.slice(4, 10).map((p) => p.layerIndex)).size).toBe(6);

		const counts18 = [0, 0, 0, 0, 0, 0];
		for (let i = 0; i < 18; i++) counts18[table.passes[i]!.layerIndex - 1]!++;
		expect(counts18).toEqual([4, 4, 3, 3, 2, 2]);

		const modelL6 = buildPaintingModel(
			normalizeState({
				study: 'pending-file',
				seed: CURATED_DEFAULT_SEED,
				passes: 30,
				paintLayers: 6
			})
		);

		for (const lowLayers of [2, 3, 4, 5]) {
			const modelLow = buildPaintingModel(
				normalizeState({
					study: 'pending-file',
					seed: CURATED_DEFAULT_SEED,
					passes: 30,
					paintLayers: lowLayers
				})
			);

			const rgbaLow = new Uint8ClampedArray(300 * 200 * 4);
			const heightLow = new Float32Array(300 * 200);
			renderPaintingStill(
				{ pixels: rgbaLow, heightField: heightLow, width: 300, height: 200 },
				modelLow,
				{ width: 300, height: 200 }
			);

			const rgbaFiltered = new Uint8ClampedArray(300 * 200 * 4);
			const heightFiltered = new Float32Array(300 * 200);
			renderPaintingStill(
				{ pixels: rgbaFiltered, heightField: heightFiltered, width: 300, height: 200 },
				modelL6,
				{ width: 300, height: 200, maxLayerIndex: lowLayers }
			);

			expect(bufferEq(rgbaLow, rgbaFiltered)).toBe(true);
			expect(bufferEq(heightLow, heightFiltered)).toBe(true);
		}
	});

	// 5. Geometry & pigment invariance (Paint texture & Painting time)
	it('keeps geometry and pigment RGB invariant across Paint texture and Painting time', () => {
		const m0 = buildPaintingModel(normalizeState({ paintTexture: 0, paintingTime: 4 }));
		const m50 = buildPaintingModel(normalizeState({ paintTexture: 50, paintingTime: 10 }));
		const m100 = buildPaintingModel(normalizeState({ paintTexture: 100, paintingTime: 20 }));

		expect(m0.timeline.durationSeconds).toBe(4);
		expect(m50.timeline.durationSeconds).toBe(10);
		expect(m100.timeline.durationSeconds).toBe(20);

		for (let i = 0; i < m50.depositionPasses.length; i++) {
			const a = m0.depositionPasses[i]!;
			const b = m50.depositionPasses[i]!;
			const c = m100.depositionPasses[i]!;
			expect(a.pigmentKey).toBe(b.pigmentKey);
			expect(b.pigmentKey).toBe(c.pigmentKey);
			expect(bufferEq(a.x, b.x)).toBe(true);
			expect(bufferEq(a.y, b.y)).toBe(true);
			expect(bufferEq(b.x, c.x)).toBe(true);
			expect(bufferEq(b.y, c.y)).toBe(true);
			expect(a.pools).toEqual(b.pools);
			expect(a.droplets).toEqual(b.droplets);
		}

		// Painting time leaves final pixels bit-identical and buildPaintTimeline schedules directly
		const directDep = buildDepositionPasses(
			applySweepWidth(
				buildCanonicalPassTable(CURATED_DEFAULT_SEED, 'pending-file', 1200, 800),
				68
			).slice(0, 8),
			CURATED_DEFAULT_SEED,
			'pending-file',
			45
		);
		const directTimeline = buildPaintTimeline(directDep, CURATED_DEFAULT_SEED, 12);
		expect(directTimeline.durationSeconds).toBe(12);
		expect(directTimeline.primitives.length).toBeGreaterThan(0);

		const mTime4 = buildPaintingModel(normalizeState({ paintTexture: 50, paintingTime: 4 }));
		const mTime20 = buildPaintingModel(normalizeState({ paintTexture: 50, paintingTime: 20 }));
		const px4 = renderPaintingStill(null, mTime4, { width: 300, height: 200 });
		const px20 = renderPaintingStill(null, mTime20, { width: 300, height: 200 });
		expect(bufferEq(px4, px20)).toBe(true);

		// At paintTexture = 0, bare ground is exact flat GROUND_BASE_RGB with zero relief
		const flatGround = new Uint8ClampedArray(120 * 80 * 4);
		const flatHeight = new Float32Array(120 * 80);
		renderPaintingStill(
			{ pixels: flatGround, heightField: flatHeight, width: 120, height: 80 },
			m0,
			{ width: 120, height: 80, maxProgress: 0 }
		);
		for (let i = 0; i < 120 * 80; i++) {
			expect(flatGround[i * 4]).toBe(GROUND_BASE_RGB[0]);
			expect(flatGround[i * 4 + 1]).toBe(GROUND_BASE_RGB[1]);
			expect(flatGround[i * 4 + 2]).toBe(GROUND_BASE_RGB[2]);
			expect(flatGround[i * 4 + 3]).toBe(255);
			expect(flatHeight[i]).toBe(0);
		}

		// Texture 100 exhibits ground weave & relief contrast vs flat Texture 0
		const texGround = new Uint8ClampedArray(120 * 80 * 4);
		const texHeight = new Float32Array(120 * 80);
		renderPaintingStill(
			{ pixels: texGround, heightField: texHeight, width: 120, height: 80 },
			m100,
			{ width: 120, height: 80, maxProgress: 0 }
		);
		let groundDiffs = 0;
		for (let i = 0; i < 120 * 80; i++) {
			if (texGround[i * 4] !== GROUND_BASE_RGB[0] || Math.abs(texHeight[i]!) > 1e-4) {
				groundDiffs++;
			}
		}
		expect(groundDiffs).toBeGreaterThan(1000);
	});

	// 6. Sweep width scaling (20..100%)
	it('scales lateral spread smoothly around stable anchors with zero PRNG consumption', () => {
		const table = buildCanonicalPassTable(CURATED_DEFAULT_SEED, 'pending-file', 1200, 800);
		const sweeps = [20, 45, 68, 100];
		const sweptSets = sweeps.map((sw) => applySweepWidth(table, sw));

		let prevSpread = -1;
		for (let sIdx = 0; sIdx < sweptSets.length; sIdx++) {
			const swept = sweptSets[sIdx]!;
			expect(swept.length).toBe(MAX_PASSES);

			let spreadSum = 0;
			let pointSum = 0;
			let minX = Infinity;
			let maxX = -Infinity;
			let minY = Infinity;
			let maxY = -Infinity;
			for (let i = 0; i < swept.length; i++) {
				const pass = swept[i]!;
				const canonical = table.passes[i]!;
				expect(pass.anchorX).toBe(canonical.anchorX);
				expect(pass.anchorY).toBe(canonical.anchorY);
				expect(pass.layerIndex).toBe(canonical.layerIndex);
				expect(pass.pigmentKey).toBe(canonical.pigmentKey);

				for (let k = 0; k < pass.pointCount; k++) {
					const x = pass.x[k]!;
					const y = pass.y[k]!;
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
					spreadSum += Math.hypot(x - pass.anchorX, y - pass.anchorY);
					pointSum++;
				}
			}
			expect(minX).toBeGreaterThanOrEqual(8);
			expect(maxX).toBeLessThanOrEqual(1192);
			expect(minY).toBeGreaterThanOrEqual(8);
			expect(maxY).toBeLessThanOrEqual(792);
			const meanSpread = spreadSum / pointSum;
			expect(meanSpread).toBeGreaterThan(prevSpread);
			prevSpread = meanSpread;
		}
	});

	// 7. Pixel-exact parity, frame-1 visible strokes, opaque ground & zero glare
	it(
		'guarantees pixel-exact parity across still, progressive, Finish now, and export with frame-1 strokes and matte relief',
		{ timeout: 15000 },
		() => {
			const state = normalizeState({ paintingTime: 20 });
			const model = buildPaintingModel(state);
			const W = 600;
			const H = 400;

			const stillPixels = renderPaintingStill(null, model, { width: W, height: H });
			const exportResult = renderWholePaintingRgba(state, W, H, model);
			expect(bufferEq(stillPixels, exportResult.pixels)).toBe(true);

			// Stepped progressive playback
			const stepBuf = new ProgressiveDripBuffer(model, W, H);
			expect(stepBuf.getCanvas()).toBeNull(); // Node headless safety
			const groundSnapshot = new Uint8ClampedArray(stepBuf.getPixels());

			// Frame 1 at t = 0.015s for paintingTime = 20s (progress = 0.00075)
			const frame1Progress = 0.015 / 20;
			stepBuf.advanceTo(frame1Progress);
			let frame1Changed = 0;
			for (let i = 0; i < W * H; i++) {
				if (
					stepBuf.pixels[i * 4] !== groundSnapshot[i * 4] ||
					stepBuf.pixels[i * 4 + 1] !== groundSnapshot[i * 4 + 1] ||
					stepBuf.pixels[i * 4 + 2] !== groundSnapshot[i * 4 + 2]
				) {
					frame1Changed++;
				}
			}
			expect(frame1Changed).toBeGreaterThan(50);

			for (const p of [0.15, 0.35, 0.6, 0.85, 1.0]) {
				stepBuf.advanceTo(p);
			}
			expect(stepBuf.isComplete()).toBe(true);
			expect(stepBuf.getRenderedCount()).toBe(stepBuf.getTotalCount());
			expect(bufferEq(stillPixels, stepBuf.getPixels())).toBe(true);

			// Pause mid-way then Finish now
			const finishBuf = new ProgressiveDripBuffer(model, W, H);
			finishBuf.advanceTo(0.37);
			expect(finishBuf.isComplete()).toBe(false);
			finishBuf.finishAll();
			expect(finishBuf.isComplete()).toBe(true);
			expect(bufferEq(stillPixels, finishBuf.getPixels())).toBe(true);

			// Opaque ground (alpha === 255) everywhere
			for (let i = 0; i < W * H; i++) {
				expect(stillPixels[i * 4 + 3]).toBe(255);
			}

			// Zero bright specular white glare on dark marks (Whitewash & Record L1..L2 dark foundation)
			const darkModel = buildPaintingModel(
				normalizeState({
					study: 'whitewash-record',
					seed: CURATED_STUDY_SEEDS['whitewash-record'],
					paintLayers: 2,
					passes: 12,
					paintFlow: 70,
					paintTexture: 100
				})
			);
			const darkPixels = renderPaintingStill(null, darkModel, { width: 300, height: 200 });
			let darkMarkPixels = 0;
			for (let i = 0; i < 300 * 200; i++) {
				const r = darkPixels[i * 4]!;
				const g = darkPixels[i * 4 + 1]!;
				const b = darkPixels[i * 4 + 2]!;
				if (r < 120 && g < 120 && b < 120) {
					darkMarkPixels++;
				}
				// Even on raw ground (#E4DBCA), max channel remains matte (< 252)
				expect(Math.max(r, g, b)).toBeLessThan(252);
			}
			expect(darkMarkPixels).toBeGreaterThan(1000);
		}
	);

	// 8. Presets, URL/localStorage round-trip, accessible description & view helpers
	it('handles presets, URL/localStorage round-trips, accessible summaries, and viewport geometry helpers', () => {
		const customSeed = 884213;
		const customState = normalizeState({ seed: customSeed, study: 'counter-middleman' });

		for (const preset of PRESET_SPECS) {
			const applied = applyPreset(customState, preset.id);
			expect(applied.seed).toBe(customSeed);
			expect(applied.study).toBe('counter-middleman');
			expect(findMatchingPreset(applied)).toBe(preset.id);
		}

		const nonMatching = normalizeState({ passes: 19, paintFlow: 47 });
		expect(findMatchingPreset(nonMatching)).toBeNull();

		const inspectView = {
			mode: 'inspect' as const,
			inspectZoom: 3.75,
			inspectCenterX: 0.42,
			inspectCenterY: 0.61
		};
		const params = serializeStateParams(appliedStateForUrl(), {
			overlayView: 'article',
			viewState: inspectView
		});
		const parsed = deserializeStateParams(params);
		expect(parsed.hasExplicitState).toBe(true);
		expect(parsed.hasExplicitView).toBe(true);
		expect(parsed.initialOverlay).toBe('article');
		expect(parsed.state.study).toBe('public-works-tenders');
		expect(parsed.state.seed).toBe(551209);
		expect(parsed.state.passes).toBe(28);
		expect(parsed.viewState.mode).toBe('inspect');
		expect(parsed.viewState.inspectZoom).toBe(3.75);

		// Fallback & garbage sanitization
		const garbage = deserializeStateParams('?p=999&pf=-50&sw=abc&pl=99&st=invalid', {
			seed: 441122
		});
		expect(garbage.state.version).toBe(DRIP_GENERATOR_VERSION);
		expect(garbage.state.passes).toBe(MAX_PASSES);
		expect(garbage.state.paintFlow).toBe(10);
		expect(garbage.state.paintLayers).toBe(MAX_LAYERS);
		expect(garbage.state.study).toBe('pending-file');
		expect(garbage.state.seed).toBe(441122);

		// localStorage round-trip & safe error fallback
		const store = new Map<string, string>();
		const originalStorage = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: (k: string) => store.get(k) ?? null,
				setItem: (k: string, v: string) => store.set(k, v),
				removeItem: (k: string) => store.delete(k)
			}
		});
		try {
			expect(saveStateToStorage(parsed.state)).toBe(true);
			expect(loadStateFromStorage()).toEqual(parsed.state);
			store.set('drip-painting-studio.state.v1', '{broken-json');
			expect(loadStateFromStorage()).toBeNull();
			clearStateFromStorage();
			expect(loadStateFromStorage()).toBeNull();
		} finally {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: originalStorage
			});
		}

		// Accessible description
		const model = buildPaintingModel(parsed.state);
		const desc = describePaintingAccessible(parsed.state, model);
		expect(desc).toContain('Public Works & Tenders');
		expect(desc).toContain('551209');
		expect(desc).toContain(`${model.depositionPasses.length} passes`);

		// Viewport helpers
		expect(chooseArtboardForViewport(390, 844)).toEqual({
			artboardWidth: 960,
			artboardHeight: 1080
		});
		expect(chooseArtboardForViewport(1024, 1000)).toEqual({
			artboardWidth: 1080,
			artboardHeight: 900
		});
		expect(chooseArtboardForViewport(1440, 900)).toEqual({
			artboardWidth: 1200,
			artboardHeight: 800
		});

		const placement = computeUniformStagePlacement(1440, 900, 1200, 800, 'fit');
		expect(placement.cssWidth / placement.cssHeight).toBeCloseTo(1.5, 2);

		const crop = computeInspectCropRect(
			{ artboardWidth: 1200, artboardHeight: 800 },
			3.5,
			0.99,
			0.01,
			1200,
			800
		);
		expect(crop.x).toBeGreaterThanOrEqual(0);
		expect(crop.y).toBeGreaterThanOrEqual(0);
		expect(crop.x + crop.width).toBeLessThanOrEqual(1200.001);
		expect(crop.y + crop.height).toBeLessThanOrEqual(800.001);
	});

	// 9. PNG Export checks
	it(
		'computes export dimensions, encodes headless PNGs, and triggers [4096, 2048, 1280] fallback on OOM',
		{ timeout: 30000 },
		async () => {
			expect(computeExportDimensions(1200, 800, 2048)).toEqual({ width: 2048, height: 1365 });
			expect(computeExportDimensions(1200, 800, 4096)).toEqual({ width: 4096, height: 2731 });
			expect(computeExportDimensions(960, 1080, 2048)).toEqual({ width: 1820, height: 2048 });
			expect(formatExportFilename('pending-file', 729104, 2048, 1365)).toBe(
				'drip-painting-pending-file-seed-729104-2048x1365.png'
			);

			const state = createDefaultState();
			const res2048 = await exportWholePainting(state, 2048);
			expect(res2048.width).toBe(2048);
			expect(res2048.height).toBe(1365);
			expect(res2048.fallbackApplied).toBe(false);
			expect(res2048.filename).toBe('drip-painting-pending-file-seed-729104-2048x1365.png');

			const bytes = new Uint8Array(await res2048.blob.arrayBuffer());
			expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
			const ihdrView = new DataView(bytes.buffer, bytes.byteOffset + 16, 8);
			expect(ihdrView.getUint32(0, false)).toBe(2048);
			expect(ihdrView.getUint32(4, false)).toBe(1365);

			// Simulate OOM at 4096 -> fallback to 2048
			const oom4096 = await exportWholePainting(state, 4096, {
				encodePng: async (_rgba, w, h) => {
					if (w > 2048 || h > 2048) throw new Error('Simulated 4096 OOM');
					return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
				}
			});
			expect(oom4096.fallbackApplied).toBe(true);
			expect(oom4096.width).toBe(2048);
			expect(oom4096.height).toBe(1365);
			expect(oom4096.statusMessage).toContain('4096×2731');
			expect(oom4096.statusMessage).toContain('2048×1365');

			// Simulate OOM at 4096 and 2048 -> fallback to 1280
			const oom2048 = await exportWholePainting(state, 4096, {
				encodePng: async (_rgba, w, h) => {
					if (w > 1280 || h > 1280) throw new Error('Simulated 2048 OOM');
					return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
				}
			});
			expect(oom2048.fallbackApplied).toBe(true);
			expect(oom2048.width).toBe(1280);
			expect(oom2048.height).toBe(853);
		}
	);

	// 10. Curated seed & visual experiment quantitative verification
	it('verifies CURATED_DEFAULT_SEED, all 4 study seeds, and Thin/Heavy/Buried EXPERIMENT_CONFIG metrics', () => {
		const W = 600;
		const H = 400;

		// Default Pending File composition check
		const defState = createDefaultState();
		const defModel = buildPaintingModel(defState);
		const defMetrics = measurePaintingMetrics(defModel, W, H);
		expect(defMetrics.coveragePct).toBeGreaterThanOrEqual(30);
		expect(defMetrics.coveragePct).toBeLessThanOrEqual(65);
		expect(defMetrics.poolCount).toBeGreaterThanOrEqual(2);
		expect(defMetrics.dropletCount).toBeGreaterThanOrEqual(20);
		for (const pig of [
			'carbon-black',
			'file-tape-red',
			'ledger-ochre',
			'lime-whitewash'
		] as const satisfies readonly PigmentId[]) {
			expect(defMetrics.pigmentShares[pig]).toBeGreaterThan(0.05);
		}

		// 3-Step Visual Experiment: Thin (20%) vs Heavy (80%) vs Buried (36 passes, 6 layers)
		const thinM = measurePaintingMetrics(buildPaintingModel(EXPERIMENT_CONFIG.thin), W, H);
		const heavyM = measurePaintingMetrics(buildPaintingModel(EXPERIMENT_CONFIG.heavy), W, H);
		const buriedModel = buildPaintingModel(EXPERIMENT_CONFIG.buried);
		const buriedM = measurePaintingMetrics(buriedModel, W, H);

		expect(thinM.coveragePct).toBeGreaterThan(0);
		expect(thinM.coveragePct).toBeLessThanOrEqual(50);
		expect(heavyM.coveragePct - thinM.coveragePct).toBeGreaterThanOrEqual(10);
		expect(buriedM.coveragePct).toBeGreaterThanOrEqual(58);
		expect(buriedM.coveragePct).toBeGreaterThan(heavyM.coveragePct);

		expect(thinM.meanHeight).toBeGreaterThan(0);
		expect(heavyM.meanHeight).toBeGreaterThan(thinM.meanHeight);
		expect(buriedM.meanHeight).toBeGreaterThan(heavyM.meanHeight);
		expect(heavyM.maxHeight).toBeGreaterThan(thinM.maxHeight * 1.35);

		expect(thinM.dropletCount).toBeGreaterThan(0);
		expect(heavyM.dropletCount).toBeGreaterThan(thinM.dropletCount);

		// Buried ridge relief: L5..6 whitewash over L1..2 dark strokes stays physically raised vs bare cloth
		const n = W * H;
		const gRgba = new Uint8ClampedArray(n * 4);
		const l12Rgba = new Uint8ClampedArray(n * 4);
		const l14Rgba = new Uint8ClampedArray(n * 4);
		const fullRgba = new Uint8ClampedArray(n * 4);
		const fullHeight = new Float32Array(n);

		renderPaintingStill({ pixels: gRgba, width: W, height: H }, buriedModel, {
			width: W,
			height: H,
			maxProgress: 0
		});
		renderPaintingStill({ pixels: l12Rgba, width: W, height: H }, buriedModel, {
			width: W,
			height: H,
			maxLayerIndex: 2
		});
		renderPaintingStill({ pixels: l14Rgba, width: W, height: H }, buriedModel, {
			width: W,
			height: H,
			maxLayerIndex: 4
		});
		renderPaintingStill(
			{ pixels: fullRgba, heightField: fullHeight, width: W, height: H },
			buriedModel,
			{ width: W, height: H }
		);

		let overDarkSum = 0;
		let overDarkCount = 0;
		let overBareSum = 0;
		let overBareCount = 0;
		for (let i = 0; i < n; i++) {
			const o = i * 4;
			const isL56 =
				Math.max(
					Math.abs(fullRgba[o]! - l14Rgba[o]!),
					Math.abs(fullRgba[o + 1]! - l14Rgba[o + 1]!),
					Math.abs(fullRgba[o + 2]! - l14Rgba[o + 2]!)
				) > 12;
			if (!isL56) continue;
			const isL12Dark =
				Math.max(
					Math.abs(l12Rgba[o]! - gRgba[o]!),
					Math.abs(l12Rgba[o + 1]! - gRgba[o + 1]!),
					Math.abs(l12Rgba[o + 2]! - gRgba[o + 2]!)
				) > 20;
			const isBareBefore =
				Math.max(
					Math.abs(l14Rgba[o]! - gRgba[o]!),
					Math.abs(l14Rgba[o + 1]! - gRgba[o + 1]!),
					Math.abs(l14Rgba[o + 2]! - gRgba[o + 2]!)
				) <= 5;
			if (isL12Dark) {
				overDarkSum += fullHeight[i]!;
				overDarkCount++;
			} else if (isBareBefore) {
				overBareSum += fullHeight[i]!;
				overBareCount++;
			}
		}
		expect(overDarkCount).toBeGreaterThan(100);
		expect(overBareCount).toBeGreaterThan(100);
		expect(overDarkSum / overDarkCount).toBeGreaterThan(overBareSum / overBareCount);

		// Study-character metrics across all 4 studies
		const studyMetrics = new Map<StudyId, ReturnType<typeof measurePaintingMetrics>>();
		for (const spec of STUDY_LIST) {
			const st = normalizeState({
				study: spec.id,
				seed: CURATED_STUDY_SEEDS[spec.id]
			});
			const m = measurePaintingMetrics(buildPaintingModel(st), W, H);
			expect(m.coveragePct).toBeGreaterThan(15);
			expect(m.meanHeight).toBeGreaterThan(0.05);
			expect(m.dropletCount).toBeGreaterThan(20);
			studyMetrics.set(spec.id, m);
		}
		expect(studyMetrics.get('counter-middleman')!.dropletCount).toBeGreaterThan(
			studyMetrics.get('public-works-tenders')!.dropletCount
		);

		// Palette hex sanity check
		expect(PALETTE['carbon-black'].hex).toBe('#1C1B1A');
		expect(PALETTE['file-tape-red'].hex).toBe('#A8342A');
		expect(PALETTE['ledger-ochre'].hex).toBe('#B8873D');
		expect(PALETTE['carbon-indigo'].hex).toBe('#29435C');
		expect(PALETTE['road-tar-umber'].hex).toBe('#594638');
		expect(PALETTE['lime-whitewash'].hex).toBe('#E6DFD1');
	});

	// 11. TG-1: canonicalCache 16-entry LRU eviction, hit refresh, and byte-identical recomputation
	it('enforces 16-entry LRU eviction, hit refresh, and byte-identical recomputation in buildCanonicalPassTable', () => {
		const baseSeeds = Array.from({ length: 16 }, (_, i) => 900_000 + i);
		const tables = baseSeeds.map((s) => buildCanonicalPassTable(s, 'pending-file', 1200, 800));

		// Cache hit on 900000 refreshes it to MRU
		expect(buildCanonicalPassTable(900_000, 'pending-file', 1200, 800)).toBe(tables[0]);

		// Inserting 900016 evicts 900001 (the LRU entry) while keeping 900000
		buildCanonicalPassTable(900_016, 'pending-file', 1200, 800);
		expect(buildCanonicalPassTable(900_000, 'pending-file', 1200, 800)).toBe(tables[0]);

		const recomputed900001 = buildCanonicalPassTable(900_001, 'pending-file', 1200, 800);
		expect(recomputed900001).not.toBe(tables[1]);
		expect(bufferEq(recomputed900001.passes[0]!.x, tables[1]!.passes[0]!.x)).toBe(true);
		expect(bufferEq(recomputed900001.passes[0]!.y, tables[1]!.passes[0]!.y)).toBe(true);
		expect(bufferEq(recomputed900001.passes[39]!.arcLength, tables[1]!.passes[39]!.arcLength)).toBe(
			true
		);

		// Normalized seed alias (0 -> CURATED_DEFAULT_SEED) shares the same cache entry without duplicates
		const zeroSeedTable = buildCanonicalPassTable(0, 'pending-file', 1200, 800);
		const defaultSeedTable = buildCanonicalPassTable(
			CURATED_DEFAULT_SEED,
			'pending-file',
			1200,
			800
		);
		expect(zeroSeedTable).toBe(defaultSeedTable);
		expect(zeroSeedTable.seed).toBe(CURATED_DEFAULT_SEED);
	});

	// 12. TG-2: 4-Study x 3-Artboard x Min/Max extreme bounds matrix (24 combinations)
	it(
		'verifies all 24 Study x Artboard x Min/Max combinations for bounds, frame-1 visibility, and pixel parity',
		{ timeout: 30000 },
		() => {
			const artboards = [
				{ artboardWidth: 1200, artboardHeight: 800 },
				{ artboardWidth: 1080, artboardHeight: 900 },
				{ artboardWidth: 960, artboardHeight: 1080 }
			] as const;

			const extremes = [
				{
					label: 'min',
					passes: 4,
					paintFlow: 10,
					sweepWidth: 20,
					paintLayers: 2,
					paintTexture: 0,
					paintingTime: 4
				},
				{
					label: 'max',
					passes: 40,
					paintFlow: 100,
					sweepWidth: 100,
					paintLayers: 6,
					paintTexture: 100,
					paintingTime: 20
				}
			] as const;

			for (const spec of STUDY_LIST) {
				for (const ab of artboards) {
					for (const ext of extremes) {
						const state = normalizeState({
							study: spec.id,
							seed: CURATED_STUDY_SEEDS[spec.id],
							...ab,
							passes: ext.passes,
							paintFlow: ext.paintFlow,
							sweepWidth: ext.sweepWidth,
							paintLayers: ext.paintLayers,
							paintTexture: ext.paintTexture,
							paintingTime: ext.paintingTime
						});
						const model = buildPaintingModel(state);
						expect(model.depositionPasses.length).toBeGreaterThan(0);

						for (const pass of model.depositionPasses) {
							for (let k = 0; k < pass.pointCount; k++) {
								const x = pass.x[k]!;
								const y = pass.y[k]!;
								expect(Number.isFinite(x)).toBe(true);
								expect(Number.isFinite(y)).toBe(true);
								expect(Number.isFinite(pass.halfWidth[k]!)).toBe(true);
								expect(Number.isFinite(pass.thickness[k]!)).toBe(true);
								expect(x).toBeGreaterThanOrEqual(8);
								expect(x).toBeLessThanOrEqual(ab.artboardWidth - 8);
								expect(y).toBeGreaterThanOrEqual(8);
								expect(y).toBeLessThanOrEqual(ab.artboardHeight - 8);
							}
						}

						let prevReveal = -1;
						for (const prim of model.timeline.primitives) {
							expect(Number.isFinite(prim.revealAt)).toBe(true);
							expect(prim.revealAt).toBeGreaterThanOrEqual(prevReveal);
							expect(prim.revealAt).toBeLessThanOrEqual(0.985 + 1e-9);
							prevReveal = prim.revealAt;
						}

						const w = 150;
						const h = 150;
						const stillPixels = renderPaintingStill(null, model, { width: w, height: h });
						const prog = new ProgressiveDripBuffer(model, w, h);
						const groundSnap = new Uint8ClampedArray(prog.getPixels());
						prog.advanceTo(0.015 / state.paintingTime);
						let changed = 0;
						const afterFrame1 = prog.getPixels();
						for (let i = 0; i < w * h; i++) {
							if (
								afterFrame1[i * 4] !== groundSnap[i * 4] ||
								afterFrame1[i * 4 + 1] !== groundSnap[i * 4 + 1] ||
								afterFrame1[i * 4 + 2] !== groundSnap[i * 4 + 2]
							) {
								changed++;
							}
						}
						expect(changed).toBeGreaterThan(0);

						prog.finishAll();
						expect(bufferEq(stillPixels, prog.getPixels())).toBe(true);
					}
				}
			}
		}
	);

	// 13. TG-3 & AB-2: PNG zlib.inflateSync pixel parity, OOM chains, OffscreenCanvas mock, NaN export guards
	it(
		'verifies stored-block PNG zlib pixel parity, OOM fallback chains, OffscreenCanvas fallback, and NaN export guards',
		{ timeout: 30000 },
		async () => {
			const state = createDefaultState();
			const res2048 = await exportWholePainting(state, 2048);
			const bytes = new Uint8Array(await res2048.blob.arrayBuffer());
			expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

			const idatParts: Uint8Array[] = [];
			let offset = 8;
			while (offset + 12 <= bytes.length) {
				const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
				const len = view.getUint32(0, false);
				const type = String.fromCharCode(
					bytes[offset + 4]!,
					bytes[offset + 5]!,
					bytes[offset + 6]!,
					bytes[offset + 7]!
				);
				const data = bytes.subarray(offset + 8, offset + 8 + len);
				if (type === 'IDAT') idatParts.push(data);
				offset += 12 + len;
				if (type === 'IEND') break;
			}
			expect(idatParts.length).toBeGreaterThanOrEqual(1);

			const idatConcat = Buffer.concat(idatParts.map((p) => Buffer.from(p)));
			const inflated = inflateSync(idatConcat);
			const expected = renderWholePaintingRgba(state, 2048, 1365);
			const rowBytes = 2048 * 4 + 1;
			expect(inflated.length).toBe(rowBytes * 1365);

			let mismatches = 0;
			for (let y = 0; y < 1365; y++) {
				const rowStart = y * rowBytes;
				if (inflated[rowStart] !== 0) mismatches++;
				const srcStart = y * 2048 * 4;
				for (let x = 0; x < 2048 * 4; x++) {
					if (inflated[rowStart + 1 + x] !== expected.pixels[srcStart + x]) {
						mismatches++;
					}
				}
			}
			expect(mismatches).toBe(0);

			// 2048 -> 1280 OOM fallback
			const oom2048To1280 = await exportWholePainting(state, 2048, {
				encodePng: async (_rgba, w, h) => {
					if (w > 1280 || h > 1280) throw new Error('Simulated 2048 OOM');
					return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
				}
			});
			expect(oom2048To1280.fallbackApplied).toBe(true);
			expect(oom2048To1280.width).toBe(1280);
			expect(oom2048To1280.height).toBe(853);

			// All-3-resolutions [4096, 2048, 1280] OOM propagates last error
			await expect(
				exportWholePainting(state, 4096, {
					encodePng: async (_rgba, w) => {
						throw new Error(`OOM at ${w}`);
					}
				})
			).rejects.toThrow('OOM at 1280');

			// OffscreenCanvas mock fallback from 4096 -> 2048
			const origOffscreen = globalThis.OffscreenCanvas;
			const origImageData = globalThis.ImageData;
			class MockImageData {
				data: Uint8ClampedArray;
				width: number;
				height: number;
				constructor(data: Uint8ClampedArray, width: number, height: number) {
					this.data = data;
					this.width = width;
					this.height = height;
				}
			}
			class MockOffscreenCanvas {
				width: number;
				height: number;
				constructor(width: number, height: number) {
					this.width = width;
					this.height = height;
				}
				getContext() {
					return {
						putImageData: () => {}
					};
				}
				async convertToBlob() {
					if (this.width > 2048 || this.height > 2048) {
						throw new Error('OffscreenCanvas 4096 OOM');
					}
					return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
				}
			}
			Object.defineProperty(globalThis, 'OffscreenCanvas', {
				configurable: true,
				value: MockOffscreenCanvas
			});
			Object.defineProperty(globalThis, 'ImageData', {
				configurable: true,
				value: MockImageData
			});
			try {
				const offscreenRes = await exportWholePainting(state, 4096);
				expect(offscreenRes.fallbackApplied).toBe(true);
				expect(offscreenRes.width).toBe(2048);
				expect(offscreenRes.height).toBe(1365);
			} finally {
				Object.defineProperty(globalThis, 'OffscreenCanvas', {
					configurable: true,
					value: origOffscreen
				});
				Object.defineProperty(globalThis, 'ImageData', {
					configurable: true,
					value: origImageData
				});
			}

			// AB-2: NaN / non-positive guards in computeExportDimensions, renderWholePaintingRgba, exportWholePainting
			expect(computeExportDimensions(Number.NaN, Number.NaN, Number.NaN)).toEqual({
				width: 2048,
				height: 1365
			});
			expect(computeExportDimensions(0, -100, 2048)).toEqual({ width: 2048, height: 1365 });
			expect(computeExportDimensions(1200, 800, Number.POSITIVE_INFINITY)).toEqual({
				width: 4096,
				height: 2731
			});
			expect(computeExportDimensions(1200, 800, Number.NEGATIVE_INFINITY)).toEqual({
				width: 256,
				height: 171
			});

			const nanRgba = renderWholePaintingRgba(state, Number.NaN, Number.NaN);
			expect(nanRgba.width).toBe(DEFAULT_ARTBOARD_WIDTH);
			expect(nanRgba.height).toBe(DEFAULT_ARTBOARD_HEIGHT);
			expect(nanRgba.pixels.length).toBe(DEFAULT_ARTBOARD_WIDTH * DEFAULT_ARTBOARD_HEIGHT * 4);

			const nanExport = await exportWholePainting(state, Number.NaN);
			expect(nanExport.width).toBe(2048);
			expect(nanExport.height).toBe(1365);
			expect(nanExport.fallbackApplied).toBe(false);
		}
	);

	// 14. TG-4, AB-1, AB-5: Adversarial storage, URL fallback, viewState, and viewport geometry edge cases
	it('enforces storage validation (AB-1), URL fallback preservation (AB-5), and adversarial state/geometry guards (TG-4)', () => {
		// AB-5: invalid explicit URL params preserve caller fallback fields
		const fallback = {
			study: 'counter-middleman' as const,
			seed: 111222,
			passes: 30,
			paintFlow: 80,
			sweepWidth: 75,
			paintLayers: 5,
			paintTexture: 65,
			paintingTime: 16,
			artboardWidth: 960,
			artboardHeight: 1080
		};
		const invalidUrl = deserializeStateParams(
			'?st=invalid&p=notanumber&pf=NaN&sw=&pl=bad&pt=xyz&t=Infinity&aw=bad&ah=NaN&s=0',
			fallback
		);
		expect(invalidUrl.hasExplicitState).toBe(true);
		expect(invalidUrl.state).toEqual({
			version: DRIP_GENERATOR_VERSION,
			...fallback
		});

		const clampedDimUrl = deserializeStateParams('?ah=0', fallback);
		expect(clampedDimUrl.state.artboardHeight).toBe(600);

		const mixedUrl = deserializeStateParams('?st=invalid&p=25', fallback);
		expect(mixedUrl.state.study).toBe('counter-middleman');
		expect(mixedUrl.state.passes).toBe(25);
		expect(mixedUrl.state.paintFlow).toBe(80);
		expect(mixedUrl.state.seed).toBe(111222);

		// TG-4: oversized 120 KB and malformed query strings
		const oversizedQuery = `?st=pending-file&junk=${'a'.repeat(120_000)}&p=22`;
		const oversizedParsed = deserializeStateParams(oversizedQuery);
		expect(oversizedParsed.state.passes).toBe(22);

		const malformedParsed = deserializeStateParams('???&&&=123&st=%ZZinvalid&s=&p=12.7&pf=abc');
		expect(malformedParsed.state.study).toBe('pending-file');
		expect(malformedParsed.state.passes).toBe(13);
		expect(malformedParsed.state.paintFlow).toBe(DEFAULT_DRIP_STATE.paintFlow);

		// TG-4: normalizeViewState edge inputs
		expect(
			normalizeViewState({
				mode: 'zoom' as unknown as 'fill',
				inspectZoom: Number.NaN,
				inspectCenterX: Number.POSITIVE_INFINITY,
				inspectCenterY: Number.NEGATIVE_INFINITY
			})
		).toEqual(DEFAULT_VIEW_STATE);

		// TG-4: computeUniformStagePlacement & computeInspectCropRect adversarial inputs
		const safeStage = computeUniformStagePlacement(0, -100, Number.NaN, Number.POSITIVE_INFINITY);
		expect(Number.isFinite(safeStage.cssWidth)).toBe(true);
		expect(Number.isFinite(safeStage.cssHeight)).toBe(true);
		expect(Number.isFinite(safeStage.scale)).toBe(true);
		expect(safeStage.cssWidth).toBeGreaterThan(0);
		expect(safeStage.cssHeight).toBeGreaterThan(0);

		const safeCrop = computeInspectCropRect(
			{ artboardWidth: Number.NaN, artboardHeight: 0 },
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.NaN,
			0
		);
		expect(Number.isFinite(safeCrop.x)).toBe(true);
		expect(Number.isFinite(safeCrop.y)).toBe(true);
		expect(Number.isFinite(safeCrop.width)).toBe(true);
		expect(Number.isFinite(safeCrop.height)).toBe(true);
		expect(safeCrop.width).toBeGreaterThan(0);
		expect(safeCrop.height).toBeGreaterThan(0);
		expect(safeCrop.x).toBeGreaterThanOrEqual(0);
		expect(safeCrop.y).toBeGreaterThanOrEqual(0);
		expect(safeCrop.x + safeCrop.width).toBeLessThanOrEqual(DEFAULT_ARTBOARD_WIDTH + 0.001);
		expect(safeCrop.y + safeCrop.height).toBeLessThanOrEqual(DEFAULT_ARTBOARD_HEIGHT + 0.001);

		// AB-1 & TG-4: localStorage array/version/error handling
		const store = new Map<string, string>();
		const originalStorage = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: (k: string) => store.get(k) ?? null,
				setItem: (k: string, v: string) => store.set(k, v),
				removeItem: (k: string) => store.delete(k)
			}
		});
		try {
			store.set(DRIP_STORAGE_KEY, '[]');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, '[1,2,3]');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, 'null');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, '{"version":2,"study":"counter-middleman","seed":123456}');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, '{"version":"1","study":"counter-middleman","seed":123456}');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, '{"study":"counter-middleman","seed":123456}');
			expect(loadStateFromStorage()).toBeNull();
			store.set(DRIP_STORAGE_KEY, '{"version":1,"study":"counter-middleman","seed":123456}');
			const loaded = loadStateFromStorage();
			expect(loaded).not.toBeNull();
			expect(loaded!.study).toBe('counter-middleman');
			expect(loaded!.seed).toBe(123456);

			// QuotaExceededError & SecurityError
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: {
					getItem: () => {
						throw new DOMException('Blocked', 'SecurityError');
					},
					setItem: () => {
						throw new DOMException('Full', 'QuotaExceededError');
					},
					removeItem: () => {
						throw new DOMException('Blocked', 'SecurityError');
					}
				}
			});
			expect(saveStateToStorage(DEFAULT_DRIP_STATE)).toBe(false);
			expect(loadStateFromStorage()).toBeNull();
			expect(() => clearStateFromStorage()).not.toThrow();
		} finally {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: originalStorage
			});
		}
	});

	// 15. TG-5, AB-3, AB-4: ProgressiveDripBuffer seek/resize/NaN guards, direct engine NaN guards, empty inputs & PRNG helpers
	it('handles ProgressiveDripBuffer seek/resize/NaN guards (AB-3), direct API NaN guards (AB-4), empty inputs, and PRNG helpers (TG-5)', () => {
		const model = buildPaintingModel(DEFAULT_DRIP_STATE);

		// AB-4: direct engine calls with NaN / invalid inputs
		const dirtyModel = buildPaintingModel({
			...DEFAULT_DRIP_STATE,
			study: 'invalid-study' as unknown as StudyId,
			seed: Number.NaN,
			passes: Number.NaN,
			paintFlow: Number.NaN,
			sweepWidth: Number.NaN,
			paintLayers: Number.NaN,
			paintTexture: Number.NaN,
			paintingTime: Number.NaN,
			artboardWidth: Number.NaN,
			artboardHeight: Number.NaN
		});
		expect(dirtyModel.state).toEqual(DEFAULT_DRIP_STATE);
		expect(dirtyModel.depositionPasses.length).toBe(model.depositionPasses.length);
		expect(dirtyModel.timeline.durationSeconds).toBe(DEFAULT_DRIP_STATE.paintingTime);

		const nanTable = buildCanonicalPassTable(Number.NaN, 'invalid' as StudyId, Number.NaN, -50);
		expect(nanTable.seed).toBe(CURATED_DEFAULT_SEED);
		expect(nanTable.study).toBe('pending-file');
		expect(nanTable.artboardWidth).toBe(DEFAULT_ARTBOARD_WIDTH);
		expect(nanTable.artboardHeight).toBe(DEFAULT_ARTBOARD_HEIGHT);
		expect(nanTable.passes[0]!.pointCount).toBeGreaterThan(0);

		const nanActive = selectActivePasses(nanTable.passes, Number.NaN, Number.NaN);
		expect(nanActive.length).toBe(model.depositionPasses.length);
		const nanSwept = applySweepWidth(nanTable, Number.NaN);
		expect(nanSwept[0]!.sweepWidth).toBe(DEFAULT_DRIP_STATE.sweepWidth);
		const nanDep = buildDepositionPasses(nanSwept, Number.NaN, 'invalid' as StudyId, Number.NaN);
		expect(nanDep[0]!.paintFlow).toBe(DEFAULT_DRIP_STATE.paintFlow);
		const nanTimeline = buildPaintTimeline(nanDep, Number.NaN, Number.NaN);
		expect(nanTimeline.seed).toBe(CURATED_DEFAULT_SEED);
		expect(nanTimeline.durationSeconds).toBe(DEFAULT_DRIP_STATE.paintingTime);

		const nanStill = renderPaintingStill(null, model, {
			width: Number.NaN,
			height: Number.NaN,
			maxProgress: Number.NaN,
			crop: { x: Number.NaN, y: 0, width: Number.NaN, height: 100 }
		});
		expect(nanStill.length).toBe(DEFAULT_ARTBOARD_WIDTH * DEFAULT_ARTBOARD_HEIGHT * 4);
		expect(nanStill[0]! + nanStill[1]! + nanStill[2]!).toBeGreaterThan(0);

		const nanMetrics = measurePaintingMetrics(model, Number.NaN, Number.NaN);
		expect(nanMetrics.totalPixels).toBe(600 * 400);
		expect(Number.isFinite(nanMetrics.coveragePct)).toBe(true);
		expect(nanMetrics.coveragePct).toBeGreaterThan(0);

		// TG-5: Uint8ClampedArray direct render target
		const directArr = new Uint8ClampedArray(120 * 80 * 4);
		const retArr = renderPaintingStill(directArr, model, { width: 120, height: 80 });
		expect(retArr).toBe(directArr);
		expect(directArr[3]).toBe(255);

		// AB-3 & TG-5: ProgressiveDripBuffer constructor NaN, seek, resizeArtboard, advanceToCount
		const nanBuf = new ProgressiveDripBuffer(model, Number.NaN, Number.NaN);
		expect(nanBuf.width).toBe(DEFAULT_ARTBOARD_WIDTH);
		expect(nanBuf.height).toBe(DEFAULT_ARTBOARD_HEIGHT);
		expect(nanBuf.getPixels().length).toBe(DEFAULT_ARTBOARD_WIDTH * DEFAULT_ARTBOARD_HEIGHT * 4);

		const buf = new ProgressiveDripBuffer(model, 240, 160);
		expect(buf.advanceTo(-1)).toBe(0);
		expect(buf.getProgress()).toBe(0);

		const countAt04 = buf.advanceTo(0.4);
		expect(countAt04).toBeGreaterThan(0);
		expect(buf.advanceTo(Number.NaN)).toBe(countAt04);
		expect(buf.getProgress()).toBe(0.4);
		expect(buf.advanceTo(Number.POSITIVE_INFINITY)).toBe(countAt04);
		expect(buf.advanceTo(0.2)).toBe(countAt04);
		expect(buf.getProgress()).toBe(0.4);

		buf.resizeArtboard(model, 160, 100);
		expect(buf.width).toBe(160);
		expect(buf.height).toBe(100);
		expect(buf.getRenderedCount()).toBe(countAt04);
		expect(buf.getProgress()).toBe(0.4);

		// advanceToCount NaN guard & resizeArtboard preservation
		const countBuf = new ProgressiveDripBuffer(model, 240, 160);
		expect(countBuf.advanceToCount(50)).toBe(50);
		expect(countBuf.advanceToCount(Number.NaN)).toBe(50);
		expect(countBuf.advanceToCount(Number.POSITIVE_INFINITY)).toBe(50);
		expect(countBuf.getRenderedCount()).toBe(50);
		countBuf.resizeArtboard(model, 160, 100);
		expect(countBuf.getRenderedCount()).toBe(50);
		expect(countBuf.advanceToCount(60)).toBe(60);
		countBuf.resizeArtboard(model, Number.NaN, Number.NaN);
		expect(countBuf.width).toBe(DEFAULT_ARTBOARD_WIDTH);
		expect(countBuf.height).toBe(DEFAULT_ARTBOARD_HEIGHT);
		expect(countBuf.getRenderedCount()).toBe(60);

		expect(buf.advanceTo(2.5)).toBe(buf.getTotalCount());
		expect(buf.isComplete()).toBe(true);

		// TG-5: getCanvas() with mocked OffscreenCanvas & ImageData
		const origOffscreen = globalThis.OffscreenCanvas;
		const origImageData = globalThis.ImageData;
		let putCalls = 0;
		Object.defineProperty(globalThis, 'ImageData', {
			configurable: true,
			value: class {
				constructor(
					public data: Uint8ClampedArray,
					public width: number,
					public height: number
				) {}
			}
		});
		Object.defineProperty(globalThis, 'OffscreenCanvas', {
			configurable: true,
			value: class {
				constructor(
					public width: number,
					public height: number
				) {}
				getContext() {
					return {
						putImageData: () => {
							putCalls++;
						}
					};
				}
			}
		});
		try {
			const canvas = buf.getCanvas();
			expect(canvas).not.toBeNull();
			expect(putCalls).toBe(1);
		} finally {
			Object.defineProperty(globalThis, 'OffscreenCanvas', {
				configurable: true,
				value: origOffscreen
			});
			Object.defineProperty(globalThis, 'ImageData', {
				configurable: true,
				value: origImageData
			});
		}

		// TG-5: empty inputs & PRNG helpers
		expect(buildDepositionPasses([], 729104, 'pending-file', 45)).toEqual([]);
		expect(buildPaintTimeline([], 729104, 10)).toEqual({
			seed: 729104,
			durationSeconds: 10,
			passWindows: [],
			primitives: []
		});
		expect(computePaintingFocalPoint([], 1200, 800)).toEqual({ x: 0.5, y: 0.5 });

		const rng = createStreamRng(729104, 'paths', 0);
		expect(() => rng.pick([])).toThrow('SeededRng.pick called with an empty array.');

		const pUnit = hashPassUnit(729104, 'flow', 3, 2);
		const pSigned = hashPassSigned(729104, 'flow', 3, 2);
		const mUnit = hashMarkUnit(729104, 'surface', 3, 7, 1);
		const mSigned = hashMarkSigned(729104, 'surface', 3, 7, 1);
		const noiseA = smoothNoise2D(729104, 12.34, 56.78, 1, 'surface');
		const noiseB = smoothNoise2D(729104, 12.34, 56.78, 1, 'surface');

		expect(pUnit).toBe(hashPassUnit(729104, 'flow', 3, 2));
		expect(pUnit).toBeGreaterThanOrEqual(0);
		expect(pUnit).toBeLessThan(1);
		expect(pSigned).toBeCloseTo(pUnit * 2 - 1, 12);
		expect(mUnit).toBeGreaterThanOrEqual(0);
		expect(mUnit).toBeLessThan(1);
		expect(mSigned).toBeCloseTo(mUnit * 2 - 1, 12);
		expect(noiseA).toBe(noiseB);
		expect(noiseA).toBeGreaterThanOrEqual(0);
		expect(noiseA).toBeLessThan(1);
	});
});

function appliedStateForUrl(): DripPaintingState {
	return normalizeState({
		study: 'public-works-tenders',
		seed: 551209,
		passes: 28,
		paintFlow: 66,
		sweepWidth: 80,
		paintLayers: 5,
		paintTexture: 60,
		paintingTime: 14,
		artboardWidth: 1200,
		artboardHeight: 800
	});
}
