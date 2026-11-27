import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	ARTBOARDS,
	ARTBOARD_LIST,
	BOUNDS,
	COLOR_FIELD_GENERATOR_VERSION,
	COLOR_FIELD_STORAGE_KEY,
	CURATED_STUDY_SEEDS,
	DEFAULT_STATE,
	DEFAULT_VIEW_STATE,
	GROUND_BASE_RGB,
	KNOB_SPECS,
	PRESET_SPECS,
	ProgressiveColorFieldBuffer,
	SECONDARY_KNOB_SPECS,
	STUDIES,
	STUDY_BY_ID,
	applyPreset,
	buildPaintingModel,
	buildTimeline,
	chooseArtboardForViewport,
	clearStateFromStorage,
	computeExportDimensions,
	computeInspectCropRect,
	computeUniformStagePlacement,
	createDefaultState,
	createNextSeed,
	createRegionMaskContext,
	describePaintingAccessible,
	deserializeStateParams,
	evaluateRegionMask,
	evaluateRegionMaskFast,
	exportWholePainting,
	fbm2D,
	findMatchingPreset,
	formatExportFilename,
	linearToSrgbByte,
	linearToSrgbByteFast,
	loadStateFromStorage,
	measurePaintingMetrics,
	normalizeSeed,
	normalizeState,
	normalizeViewState,
	renderPaintingStill,
	renderWholePaintingRgba,
	saveStateToStorage,
	serializeStateQuery,
	setArtboard,
	smoothNoise2D,
	statesEqual,
	triggerBlobDownload,
	createStreamRng,
	type ColorFieldState,
	type PrngStreamName
} from './index.ts';

function bufferEq(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
	const va = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	const vb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
	return Buffer.compare(va, vb) === 0;
}

function parsePngBasic(bytes: Uint8Array): {
	width: number;
	height: number;
	rgba: Uint8Array;
} {
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	for (let i = 0; i < sig.length; i++) {
		expect(bytes[i]).toBe(sig[i]);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let pos = 8;
	let width = 0;
	let height = 0;
	const idatParts: Uint8Array[] = [];

	while (pos < bytes.length) {
		const len = view.getUint32(pos, false);
		const type = String.fromCharCode(
			bytes[pos + 4]!,
			bytes[pos + 5]!,
			bytes[pos + 6]!,
			bytes[pos + 7]!
		);
		const data = bytes.subarray(pos + 8, pos + 8 + len);
		if (type === 'IHDR') {
			const ihdrView = new DataView(data.buffer, data.byteOffset, data.byteLength);
			width = ihdrView.getUint32(0, false);
			height = ihdrView.getUint32(4, false);
		} else if (type === 'IDAT') {
			idatParts.push(data);
		} else if (type === 'IEND') {
			break;
		}
		pos += 12 + len;
	}

	const totalIdat = idatParts.reduce((acc, part) => acc + part.length, 0);
	const compressed = new Uint8Array(totalIdat);
	let offset = 0;
	for (const part of idatParts) {
		compressed.set(part, offset);
		offset += part.length;
	}

	const raw = inflateSync(compressed);
	const rowBytes = width * 4 + 1;
	expect(raw.length).toBe(rowBytes * height);

	const rgba = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		expect(raw[y * rowBytes]).toBe(0);
		rgba.set(raw.subarray(y * rowBytes + 1, (y + 1) * rowBytes), y * width * 4);
	}
	return { width, height, rgba };
}

describe('color-field-studio engine', () => {
	// 1. PRNG Determinism & Stream Isolation
	it('1. isolates PRNG streams, normalizes seeds, and keeps noise deterministic & bounded', () => {
		expect(normalizeSeed(normalizeSeed(729104))).toBe(729104);
		expect(normalizeSeed('729104')).toBe(729104);
		expect(normalizeSeed(0)).toBe(DEFAULT_STATE.seed);
		expect(normalizeSeed(-0)).toBe(DEFAULT_STATE.seed);
		expect(normalizeSeed(Number.NaN)).toBe(DEFAULT_STATE.seed);
		expect(normalizeSeed(Number.POSITIVE_INFINITY)).toBe(DEFAULT_STATE.seed);
		expect(normalizeSeed('')).toBe(DEFAULT_STATE.seed);
		expect(normalizeSeed('   ')).toBe(DEFAULT_STATE.seed);

		const textSeedA = normalizeSeed('rothko-two-areas');
		const textSeedB = normalizeSeed('rothko-two-areas');
		expect(textSeedA).toBe(textSeedB);
		expect(textSeedA).toBeGreaterThanOrEqual(1);
		expect(textSeedA).toBeLessThanOrEqual(999_999_999);

		const next1 = createNextSeed(DEFAULT_STATE.seed, 1);
		const next2 = createNextSeed(DEFAULT_STATE.seed, 2);
		expect(next1).toBeGreaterThanOrEqual(100_000);
		expect(next1).toBeLessThanOrEqual(999_999);
		expect(next1).not.toBe(DEFAULT_STATE.seed);
		expect(next1).not.toBe(next2);

		const streams: readonly PrngStreamName[] = [
			'composition',
			'pigment',
			'edges',
			'surface',
			'timeline'
		];
		const sequences = new Map<PrngStreamName, number[]>();
		for (const s of streams) {
			const rngA = createStreamRng(482917, s, 0);
			const rngB = createStreamRng(482917, s, 0);
			const seqA = Array.from({ length: 16 }, () => rngA.nextUint32());
			const seqB = Array.from({ length: 16 }, () => rngB.nextUint32());
			expect(seqA).toEqual(seqB);
			sequences.set(s, seqA);
		}
		for (let i = 0; i < streams.length; i++) {
			for (let j = i + 1; j < streams.length; j++) {
				expect(sequences.get(streams[i]!)!).not.toEqual(sequences.get(streams[j]!)!);
			}
		}

		for (let i = 0; i < 40; i++) {
			const n = smoothNoise2D(482917, i * 0.37 - 4.1, i * 0.51 + 2.3, i % 5, 'surface');
			const nSame = smoothNoise2D(482917, i * 0.37 - 4.1, i * 0.51 + 2.3, i % 5, 'surface');
			expect(n).toBe(nSame);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(1);

			const f = fbm2D(482917, i * 0.29, i * 0.43, 3, 2.05, 0.48, i % 4, 'edges');
			expect(f).toBeGreaterThanOrEqual(0);
			expect(f).toBeLessThan(1);
		}
	});

	// 2. State Normalization, Clamping, URL Round-Trips & Storage Safety
	it('2. normalizes state bounds, handles garbage URLs, and guards localStorage in Node', () => {
		const def: ColorFieldState = normalizeState();
		expect(def).toEqual(DEFAULT_STATE);
		expect(def.areaCount).toBe(3);
		expect(def.areaSize).toBe(62);
		expect(def.edgeSoftness).toBe(58);
		expect(def.transparency).toBe(52);
		expect(def.canvasTexture).toBe(55);
		expect(def.paintingTime).toBe(10);
		expect(def.artboard).toBe('landscape');
		expect(KNOB_SPECS.map((k) => k.key)).toEqual([
			'areaCount',
			'areaSize',
			'edgeSoftness',
			'transparency'
		]);
		expect(SECONDARY_KNOB_SPECS.map((k) => k.key)).toEqual(['canvasTexture', 'paintingTime']);

		const clamped = normalizeState({
			areaCount: -5,
			areaSize: 1,
			edgeSoftness: 200,
			transparency: 0,
			canvasTexture: 150,
			paintingTime: 50
		});
		expect(clamped.areaCount).toBe(BOUNDS.areaCount.min);
		expect(clamped.areaSize).toBe(BOUNDS.areaSize.min);
		expect(clamped.edgeSoftness).toBe(BOUNDS.edgeSoftness.max);
		expect(clamped.transparency).toBe(BOUNDS.transparency.min);
		expect(clamped.canvasTexture).toBe(BOUNDS.canvasTexture.max);
		expect(clamped.paintingTime).toBe(BOUNDS.paintingTime.max);

		const upperClamped = normalizeState({
			areaCount: 99,
			areaSize: 120,
			edgeSoftness: -1,
			transparency: 100,
			canvasTexture: -5,
			paintingTime: 1
		});
		expect(upperClamped.areaCount).toBe(6);
		expect(upperClamped.areaSize).toBe(90);
		expect(upperClamped.edgeSoftness).toBe(0);
		expect(upperClamped.transparency).toBe(95);
		expect(upperClamped.canvasTexture).toBe(0);
		expect(upperClamped.paintingTime).toBe(4);

		const rounded = normalizeState({
			areaCount: 4.6,
			areaSize: 50.4,
			edgeSoftness: 58.6,
			transparency: 24.5,
			paintingTime: 10.2
		});
		expect(rounded.areaCount).toBe(5);
		expect(rounded.areaSize).toBe(50);
		expect(rounded.edgeSoftness).toBe(59);
		expect(rounded.transparency).toBe(25);
		expect(rounded.paintingTime).toBe(10);

		const nanState = normalizeState({
			areaCount: Number.NaN,
			areaSize: Number.POSITIVE_INFINITY,
			edgeSoftness: Number.NEGATIVE_INFINITY,
			transparency: '' as unknown as number,
			canvasTexture: '   ' as unknown as number,
			paintingTime: 'abc' as unknown as number
		});
		expect(nanState).toEqual(DEFAULT_STATE);

		const customState = normalizeState({
			studyId: 'frankenthaler-wash',
			seed: 912345,
			areaCount: 4,
			areaSize: 75,
			edgeSoftness: 80,
			transparency: 68,
			canvasTexture: 70,
			paintingTime: 14,
			artboard: 'portrait'
		});
		const customView = normalizeViewState({
			mode: 'inspect',
			inspectZoom: 3.25,
			inspectCenterX: 0.421,
			inspectCenterY: 0.618
		});
		const query = serializeStateQuery(customState, {
			overlayView: 'article',
			viewState: customView
		});
		const parsed = deserializeStateParams(query);
		expect(statesEqual(parsed.state, customState)).toBe(true);
		expect(parsed.viewState).toEqual(customView);
		expect(parsed.initialOverlay).toBe('article');
		expect(parsed.hasExplicitState).toBe(true);
		expect(parsed.hasExplicitView).toBe(true);

		const articleOnly = deserializeStateParams('?view=article');
		expect(articleOnly.hasExplicitState).toBe(false);
		expect(articleOnly.initialOverlay).toBe('article');
		expect(articleOnly.viewState).toEqual(DEFAULT_VIEW_STATE);

		const fallbackState = normalizeState({
			studyId: 'cobalt-veil',
			seed: 777111,
			areaCount: 5,
			areaSize: 44,
			artboard: 'square'
		});
		const garbage = deserializeStateParams(
			'?areas=NaN&size=Infinity&edge=-Infinity&trans=&texture=%20%20&time=bad&study=unknown&artboard=tall&seed=0&junk=12345',
			fallbackState
		);
		expect(statesEqual(garbage.state, fallbackState)).toBe(true);

		// Clean Node localStorage safety
		expect(loadStateFromStorage()).toBeNull();
		expect(saveStateToStorage(customState)).toBe(false);
		expect(() => clearStateFromStorage()).not.toThrow();

		// Mocked localStorage validation & error handling
		const store = new Map<string, string>();
		const prevStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		try {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: {
					getItem: (k: string) => store.get(k) ?? null,
					setItem: (k: string, v: string) => {
						store.set(k, v);
					},
					removeItem: (k: string) => {
						store.delete(k);
					}
				}
			});

			expect(saveStateToStorage(customState)).toBe(true);
			const loaded = loadStateFromStorage();
			expect(loaded).not.toBeNull();
			expect(statesEqual(loaded!, customState)).toBe(true);

			store.set(COLOR_FIELD_STORAGE_KEY, '{bad json');
			expect(loadStateFromStorage()).toBeNull();
			store.set(COLOR_FIELD_STORAGE_KEY, '[]');
			expect(loadStateFromStorage()).toBeNull();
			store.set(COLOR_FIELD_STORAGE_KEY, 'null');
			expect(loadStateFromStorage()).toBeNull();
			store.set(
				COLOR_FIELD_STORAGE_KEY,
				JSON.stringify({ ...customState, generatorVersion: COLOR_FIELD_GENERATOR_VERSION + 1 })
			);
			expect(loadStateFromStorage()).toBeNull();

			clearStateFromStorage();
			expect(store.has(COLOR_FIELD_STORAGE_KEY)).toBe(false);

			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: {
					getItem: () => {
						throw new Error('SecurityError');
					},
					setItem: () => {
						throw new Error('QuotaExceededError');
					},
					removeItem: () => {
						throw new Error('SecurityError');
					}
				}
			});
			expect(saveStateToStorage(customState)).toBe(false);
			expect(loadStateFromStorage()).toBeNull();
			expect(() => clearStateFromStorage()).not.toThrow();
		} finally {
			if (prevStorage) {
				Object.defineProperty(globalThis, 'localStorage', prevStorage);
			} else {
				delete (globalThis as { localStorage?: unknown }).localStorage;
			}
		}
	});

	// 3. Studies & Presets
	it('3. builds deterministic distinct outputs for all curated STUDIES and presets', () => {
		expect(STUDIES.length).toBe(5);
		const buffers: Uint8ClampedArray[] = [];

		for (const study of STUDIES) {
			expect(STUDY_BY_ID[study.id]).toBe(study);
			const state = normalizeState({ studyId: study.id, seed: study.defaultSeed });
			const resA = renderPaintingStill(state, 360, 240);
			const resB = renderPaintingStill(state, 360, 240);
			expect(bufferEq(resA.rgba, resB.rgba)).toBe(true);
			buffers.push(resA.rgba);
		}

		for (let i = 0; i < buffers.length; i++) {
			for (let j = i + 1; j < buffers.length; j++) {
				expect(bufferEq(buffers[i]!, buffers[j]!)).toBe(false);
			}
		}

		const presetApplied = applyPreset(DEFAULT_STATE, PRESET_SPECS[0]!.id);
		expect(presetApplied.areaCount).toBe(PRESET_SPECS[0]!.parameters.areaCount);
		expect(findMatchingPreset(presetApplied)).toBe(PRESET_SPECS[0]!.id);

		const studyApplied = applyPreset(DEFAULT_STATE, 'cobalt-veil');
		expect(studyApplied.studyId).toBe('cobalt-veil');
		expect(studyApplied.seed).toBe(STUDY_BY_ID['cobalt-veil'].defaultSeed);
	});

	// 4. Core Control 1 — areaCount (2..6) + Prefix Invariance
	it('4. preserves earlier region geometry across areaCount 2..6 and changes pixel output', () => {
		const counts = [2, 3, 5, 6] as const;
		const models = counts.map((areaCount) =>
			buildPaintingModel(normalizeState({ areaCount, seed: 482917 }))
		);
		const renders = models.map(
			(model) => renderPaintingStill(model.state, 420, 280, { model }).rgba
		);
		const metrics = renders.map((rgba, idx) =>
			measurePaintingMetrics(rgba, 420, 280, models[idx]!)
		);

		for (let i = 0; i < counts.length; i++) {
			expect(models[i]!.regions.length).toBe(counts[i]);
			expect(metrics[i]!.activeRegionCount).toBe(counts[i]);
			// Prefix invariance: region 0 and 1 remain anchored at identical coordinates and pigments
			expect(models[i]!.regions[0]!.cx).toBe(models[0]!.regions[0]!.cx);
			expect(models[i]!.regions[0]!.cy).toBe(models[0]!.regions[0]!.cy);
			expect(models[i]!.regions[1]!.cx).toBe(models[0]!.regions[1]!.cx);
			expect(models[i]!.regions[1]!.cy).toBe(models[0]!.regions[1]!.cy);
			expect(models[i]!.regions[0]!.pigment.id).toBe(models[0]!.regions[0]!.pigment.id);
		}

		for (let i = 0; i < renders.length; i++) {
			for (let j = i + 1; j < renders.length; j++) {
				expect(bufferEq(renders[i]!, renders[j]!)).toBe(false);
			}
		}

		const populated2 = metrics[0]!.regionStats.filter((r) => r.pixelCount > 0).length;
		const populated6 = metrics[3]!.regionStats.filter((r) => r.pixelCount > 0).length;
		expect(populated6).toBeGreaterThan(populated2);
	});

	// 5. Core Control 2 — areaSize (25..90) + Center Invariance
	it('5. scales region footprints monotonically with areaSize while keeping centers invariant', () => {
		const sizes = [25, 62, 90] as const;
		const models = sizes.map((areaSize) =>
			buildPaintingModel(normalizeState({ areaSize, areaCount: 2, seed: 482917 }))
		);
		const renders = models.map(
			(model) => renderPaintingStill(model.state, 480, 320, { model }).rgba
		);
		const metrics = renders.map((rgba, idx) =>
			measurePaintingMetrics(rgba, 480, 320, models[idx]!)
		);

		expect(models[0]!.regions[0]!.cx).toBe(models[1]!.regions[0]!.cx);
		expect(models[1]!.regions[0]!.cx).toBe(models[2]!.regions[0]!.cx);
		expect(models[0]!.regions[0]!.cy).toBe(models[1]!.regions[0]!.cy);
		expect(models[1]!.regions[0]!.cy).toBe(models[2]!.regions[0]!.cy);

		expect(bufferEq(renders[0]!, renders[1]!)).toBe(false);
		expect(bufferEq(renders[1]!, renders[2]!)).toBe(false);
		expect(metrics[1]!.nonBackgroundFraction).toBeGreaterThan(metrics[0]!.nonBackgroundFraction);
		expect(metrics[2]!.nonBackgroundFraction).toBeGreaterThan(metrics[1]!.nonBackgroundFraction);
	});

	// 6. Core Control 3 — edgeSoftness (0..100)
	it('6. smoothly softens boundary gradients across edgeSoftness 0 -> 58 -> 100', () => {
		const softValues = [0, 58, 100] as const;
		const models = softValues.map((edgeSoftness) =>
			buildPaintingModel(
				normalizeState({ edgeSoftness, areaCount: 2, transparency: 25, seed: 482917 })
			)
		);
		const renders = models.map(
			(model) => renderPaintingStill(model.state, 600, 400, { model }).rgba
		);
		const metrics = renders.map((rgba, idx) =>
			measurePaintingMetrics(rgba, 600, 400, models[idx]!)
		);

		expect(bufferEq(renders[0]!, renders[1]!)).toBe(false);
		expect(bufferEq(renders[1]!, renders[2]!)).toBe(false);

		expect(metrics[0]!.meanBoundaryGradient).toBeGreaterThan(metrics[1]!.meanBoundaryGradient);
		expect(metrics[1]!.meanBoundaryGradient).toBeGreaterThan(metrics[2]!.meanBoundaryGradient);
		expect(metrics[2]!.edgeGradientSmoothness).toBeGreaterThan(metrics[1]!.edgeGradientSmoothness);
		expect(metrics[1]!.edgeGradientSmoothness).toBeGreaterThan(metrics[0]!.edgeGradientSmoothness);
		expect(metrics[0]!.sharpBoundaryFraction).toBeGreaterThan(metrics[2]!.sharpBoundaryFraction);
	});

	// 7. Core Control 4 — transparency (10..95) & Canvas Weave Visibility
	it('7. increases ground show-through and canvas weave visibility at higher transparency', () => {
		const transValues = [10, 52, 95] as const;
		const models = transValues.map((transparency) =>
			buildPaintingModel(
				normalizeState({ transparency, canvasTexture: 75, areaCount: 2, seed: 482917 })
			)
		);
		const renders = models.map(
			(model) => renderPaintingStill(model.state, 600, 400, { model }).rgba
		);
		const metrics = renders.map((rgba, idx) =>
			measurePaintingMetrics(rgba, 600, 400, models[idx]!)
		);

		expect(bufferEq(renders[0]!, renders[1]!)).toBe(false);
		expect(bufferEq(renders[1]!, renders[2]!)).toBe(false);

		// At high transparency (95), canvas weave shows through painted interiors more clearly than at 10
		expect(metrics[2]!.canvasWeaveVisibility).toBeGreaterThan(metrics[0]!.canvasWeaveVisibility);

		// At transparency 95, mean color sits closer to the warm ground base than at transparency 10
		const [bgR, bgG, bgB] = GROUND_BASE_RGB;
		const distLow = Math.hypot(
			metrics[0]!.meanR - bgR,
			metrics[0]!.meanG - bgG,
			metrics[0]!.meanB - bgB
		);
		const distHigh = Math.hypot(
			metrics[2]!.meanR - bgR,
			metrics[2]!.meanG - bgG,
			metrics[2]!.meanB - bgB
		);
		expect(distHigh).toBeLessThan(distLow);
	});

	// 8. Secondary Control 1 — canvasTexture (0..100)
	it('8. controls bare ground & under-glaze weave visibility cleanly across canvasTexture 0..100', () => {
		const bareFlatState = normalizeState({ canvasTexture: 0 });
		const bareFlatModel = buildPaintingModel(bareFlatState);
		const bareFlatRes = renderPaintingStill(bareFlatState, 300, 200, {
			model: bareFlatModel,
			maxProgress: 0
		});
		for (let i = 0; i < bareFlatRes.rgba.length; i += 4) {
			expect(bareFlatRes.rgba[i]).toBe(GROUND_BASE_RGB[0]);
			expect(bareFlatRes.rgba[i + 1]).toBe(GROUND_BASE_RGB[1]);
			expect(bareFlatRes.rgba[i + 2]).toBe(GROUND_BASE_RGB[2]);
			expect(bareFlatRes.rgba[i + 3]).toBe(255);
		}
		const bareFlatMetrics = measurePaintingMetrics(bareFlatRes.rgba, 300, 200, bareFlatModel);
		expect(bareFlatMetrics.groundWeaveVisibility).toBe(0);
		expect(bareFlatMetrics.paintedCoveragePct).toBe(0);

		const bareTexturedState = normalizeState({ canvasTexture: 100 });
		const bareTexturedModel = buildPaintingModel(bareTexturedState);
		const bareTexturedRes = renderPaintingStill(bareTexturedState, 600, 400, {
			model: bareTexturedModel,
			maxProgress: 0
		});
		const bareTexturedMetrics = measurePaintingMetrics(
			bareTexturedRes.rgba,
			600,
			400,
			bareTexturedModel
		);
		expect(bareTexturedMetrics.groundWeaveVisibility).toBeGreaterThan(0);
		expect(bareTexturedMetrics.paintedCoveragePct).toBe(0);

		const textures = [0, 55, 100] as const;
		const paintedMetrics = textures.map((canvasTexture) => {
			const s = normalizeState({ canvasTexture, transparency: 72 });
			const m = buildPaintingModel(s);
			const r = renderPaintingStill(s, 600, 400, { model: m });
			return measurePaintingMetrics(r.rgba, 600, 400, m);
		});
		expect(paintedMetrics[1]!.canvasWeaveVisibility).toBeGreaterThan(
			paintedMetrics[0]!.canvasWeaveVisibility
		);
		expect(paintedMetrics[2]!.canvasWeaveVisibility).toBeGreaterThan(
			paintedMetrics[1]!.canvasWeaveVisibility
		);
		expect(paintedMetrics[2]!.canvasWeaveVisibility).toBeLessThan(12);
	}, 15000);

	// 9. Secondary Control 2 — paintingTime (4..20)
	it('9. scales timeline durationSeconds without altering final pixel output', () => {
		const s4 = normalizeState({ paintingTime: 4 });
		const s10 = normalizeState({ paintingTime: 10 });
		const s20 = normalizeState({ paintingTime: 20 });

		const m4 = buildPaintingModel(s4);
		const m10 = buildPaintingModel(s10);
		const m20 = buildPaintingModel(s20);

		expect(buildTimeline(m4, 4).durationSeconds).toBe(4);
		expect(buildTimeline(m20, 20).durationSeconds).toBe(20);

		const r4 = renderPaintingStill(s4, 420, 280, { model: m4 }).rgba;
		const r10 = renderPaintingStill(s10, 420, 280, { model: m10 }).rgba;
		const r20 = renderPaintingStill(s20, 420, 280, { model: m20 }).rgba;

		expect(bufferEq(r4, r10)).toBe(true);
		expect(bufferEq(r10, r20)).toBe(true);
	});

	// 10. R2 Two-Area Sharp vs Soft/Translucent Reference Invariant
	it('10. satisfies R2 two-area sharp vs soft/translucent boundary and weave contrast invariants', () => {
		const stateSharp = normalizeState({
			studyId: 'rothko-nocturne',
			seed: 482917,
			areaCount: 2,
			areaSize: 60,
			edgeSoftness: 0,
			transparency: 12,
			canvasTexture: 60
		});
		const stateSoft = normalizeState({
			studyId: 'rothko-nocturne',
			seed: 482917,
			areaCount: 2,
			areaSize: 60,
			edgeSoftness: 75,
			transparency: 64,
			canvasTexture: 60
		});

		const modelSharp = buildPaintingModel(stateSharp);
		const modelSoft = buildPaintingModel(stateSoft);

		const resSharp = renderPaintingStill(stateSharp, 600, 400, { model: modelSharp });
		const resSoft = renderPaintingStill(stateSoft, 600, 400, { model: modelSoft });

		const metricsSharp = measurePaintingMetrics(resSharp.rgba, 600, 400, modelSharp);
		const metricsSoft = measurePaintingMetrics(resSoft.rgba, 600, 400, modelSoft);

		expect(metricsSharp.activeRegionCount).toBe(2);
		expect(metricsSoft.activeRegionCount).toBe(2);
		expect(metricsSharp.regionSeparation).toBeGreaterThan(20);
		expect(metricsSoft.regionSeparation).toBeGreaterThan(20);
		expect(metricsSharp.meanBoundaryGradient).toBeGreaterThan(
			metricsSoft.meanBoundaryGradient * 1.5
		);
		expect(metricsSoft.edgeGradientSmoothness).toBeGreaterThan(metricsSharp.edgeGradientSmoothness);
		expect(metricsSoft.canvasWeaveVisibility).toBeGreaterThan(metricsSharp.canvasWeaveVisibility);
	});

	// 11. Progressive Pass Evolution & 100% Still Parity
	it('11. guarantees frame-1 coverage, layered evolution, adversarial progress safety, and 100% still parity', () => {
		const state = normalizeState({ paintingTime: 20, seed: 482917 });
		const model = buildPaintingModel(state);
		const W = 420;
		const H = 280;

		const still = renderPaintingStill(state, W, H, { model });

		// Step-by-step progressive reveal
		const prog = new ProgressiveColorFieldBuffer(model, W, H);
		expect(prog.getPassCount()).toBe(model.timeline.passWindows.length);
		expect(prog.getProgress()).toBe(0);
		expect(prog.isComplete()).toBe(false);

		const bareGround = new Uint8ClampedArray(prog.getRgba());
		for (let i = 3; i < bareGround.length; i += 4) {
			expect(bareGround[i]).toBe(255);
		}

		// Frame-1 visibility even at paintingTime = 20s (t = 0.015s -> p = 0.00075)
		prog.advanceTo(0.015 / state.paintingTime);
		let changedFrame1 = 0;
		const frame1Pixels = prog.getRgba();
		for (let i = 0; i < frame1Pixels.length; i += 4) {
			if (
				frame1Pixels[i] !== bareGround[i] ||
				frame1Pixels[i + 1] !== bareGround[i + 1] ||
				frame1Pixels[i + 2] !== bareGround[i + 2]
			) {
				changedFrame1++;
			}
		}
		expect(changedFrame1).toBeGreaterThan(0);

		const snap15 = new Uint8ClampedArray(prog.renderUpTo(0.15));
		const snap40 = new Uint8ClampedArray(prog.renderUpTo(0.4));
		// Adversarial backward/NaN/Infinity progress must not regress or throw
		prog.advanceTo(0.2);
		prog.advanceTo(Number.NaN);
		prog.advanceTo(Number.NEGATIVE_INFINITY);
		expect(prog.getProgress()).toBeGreaterThanOrEqual(0.4);
		expect(bufferEq(prog.getRgba(), snap40)).toBe(true);

		const snap70 = new Uint8ClampedArray(prog.renderUpTo(0.7));
		const snap90 = new Uint8ClampedArray(prog.renderUpTo(0.9));

		expect(bufferEq(snap15, snap40)).toBe(false);
		expect(bufferEq(snap40, snap70)).toBe(false);
		expect(bufferEq(snap70, snap90)).toBe(false);

		prog.renderUpTo(1);
		expect(prog.isComplete()).toBe(true);
		expect(bufferEq(prog.getPixels(), still.rgba)).toBe(true);
		prog.dispose();

		// Pause mid-pass & finishAll parity
		const progFinish = new ProgressiveColorFieldBuffer(model, W, H);
		progFinish.advanceTo(0.37);
		progFinish.finishAll();
		expect(progFinish.isComplete()).toBe(true);
		expect(bufferEq(progFinish.getPixels(), still.rgba)).toBe(true);
		progFinish.dispose();

		// 60 small increments parity
		const prog60 = new ProgressiveColorFieldBuffer(model, W, H);
		for (let step = 1; step <= 60; step++) {
			prog60.advanceTo(step / 60);
		}
		expect(prog60.isComplete()).toBe(true);
		expect(bufferEq(prog60.getPixels(), still.rgba)).toBe(true);
		prog60.dispose();
	}, 15000);

	// 12. Export Parity, Artboard/Viewport Helpers, Crop Parity & Accessibility
	it('12. verifies PNG export IDAT parity, OOM fallback, viewport/crop helpers, and accessibility prose', async () => {
		const state = normalizeState({ studyId: 'frankenthaler-wash', seed: 619304 });
		const model = buildPaintingModel(state);
		const W = 360;
		const H = 240;

		const still = renderPaintingStill(state, W, H, { model });
		const whole = renderWholePaintingRgba(state, W, H, model);
		expect(bufferEq(whole.rgba, still.rgba)).toBe(true);
		expect(whole.pixels).toBe(whole.rgba);

		// Crop parity against full artboard render
		const crop = computeInspectCropRect(ARTBOARDS.landscape, 3.0, 0.5, 0.5, 1200, 800);
		const fullArt = renderPaintingStill(state, 1200, 800, { model });
		const cropArt = renderPaintingStill(state, Math.round(crop.width), Math.round(crop.height), {
			model,
			crop
		});
		const startX = Math.round(crop.x);
		const startY = Math.round(crop.y);
		let cropMatches = 0;
		let cropTotal = 0;
		for (let py = 2; py < cropArt.height - 2; py += 8) {
			for (let px = 2; px < cropArt.width - 2; px += 8) {
				const cOff = (py * cropArt.width + px) * 4;
				const fOff = ((startY + py) * fullArt.width + (startX + px)) * 4;
				if (
					Math.abs(cropArt.rgba[cOff]! - fullArt.rgba[fOff]!) <= 2 &&
					Math.abs(cropArt.rgba[cOff + 1]! - fullArt.rgba[fOff + 1]!) <= 2 &&
					Math.abs(cropArt.rgba[cOff + 2]! - fullArt.rgba[fOff + 2]!) <= 2
				) {
					cropMatches++;
				}
				cropTotal++;
			}
		}
		expect(cropTotal).toBeGreaterThan(100);
		expect(cropMatches / cropTotal).toBeGreaterThan(0.98);

		const dims2k = computeExportDimensions(1200, 800, 2048);
		expect(dims2k).toEqual({ width: 2048, height: 1365 });
		const dims4k = computeExportDimensions(960, 1080, 4096);
		expect(dims4k).toEqual({ width: 3641, height: 4096 });
		expect(computeExportDimensions(Number.NaN, -10, Number.NaN)).toEqual({
			width: 2048,
			height: 1365
		});

		const exported = await exportWholePainting(state, 512, { model });
		expect(exported.width).toBe(512);
		expect(exported.height).toBe(341);
		expect(exported.fallbackApplied).toBe(false);
		expect(exported.filename).toBe(formatExportFilename(state.studyId, state.seed, 512, 341));

		const pngBytes = new Uint8Array(await exported.blob.arrayBuffer());
		const parsed = parsePngBasic(pngBytes);
		expect(parsed.width).toBe(512);
		expect(parsed.height).toBe(341);
		const expectedRgba = renderWholePaintingRgba(state, 512, 341, model).rgba;
		expect(
			Buffer.compare(
				parsed.rgba,
				new Uint8Array(expectedRgba.buffer, expectedRgba.byteOffset, expectedRgba.byteLength)
			)
		).toBe(0);

		// [4096, 2048, 1280] OOM fallback verification
		const attemptedWidths: number[] = [];
		const fallbackResult = await exportWholePainting(state, 4096, {
			model,
			encodePng: async (rgba, width, height) => {
				attemptedWidths.push(width);
				if (width > 1280) {
					throw new Error('Simulated OOM');
				}
				return new Blob([new Uint8Array(rgba)], { type: `image/png;w=${width};h=${height}` });
			}
		});
		expect(attemptedWidths).toEqual([4096, 2048, 1280]);
		expect(fallbackResult.fallbackApplied).toBe(true);
		expect(fallbackResult.width).toBe(1280);

		expect(chooseArtboardForViewport(1440, 900).key).toBe('landscape');
		expect(chooseArtboardForViewport(900, 900).key).toBe('square');
		expect(chooseArtboardForViewport(390, 844).key).toBe('portrait');
		expect(chooseArtboardForViewport(Number.NaN, 0).key).toBe('landscape');

		const fitPlacement = computeUniformStagePlacement(1000, 800, 1200, 800, 'fit');
		expect(fitPlacement.cssWidth).toBeLessThanOrEqual(920);
		expect(fitPlacement.cssHeight).toBeLessThanOrEqual(736);
		const badPlacement = computeUniformStagePlacement(Number.NaN, -5, 0, Number.NaN, 'fill');
		expect(badPlacement.cssWidth).toBeGreaterThanOrEqual(1);
		expect(badPlacement.cssHeight).toBeGreaterThanOrEqual(1);

		const desc = describePaintingAccessible(state, model);
		expect(desc).toContain('Frankenthaler Wash');
		expect(desc).toContain(String(state.seed));
		expect(desc).toContain(`${state.areaCount} color areas`);
		expect(desc).toContain(`${state.edgeSoftness}% edge softness`);
		expect(desc).toContain(`${state.transparency}% paint transparency`);
		expect(desc).toContain('canvas');
	}, 60000);

	// 13. Regression: Zero Anisotropic Region Bounding-Box Clipping
	it('13. guarantees zero mask clipping outside region bounds across all studies, artboards, sizes, and softnesses', () => {
		const areaSizes = [25, 62, 90] as const;
		const softnesses = [0, 58, 82, 100] as const;

		for (const study of STUDIES) {
			for (const artboard of ARTBOARD_LIST) {
				for (const areaSize of areaSizes) {
					for (const edgeSoftness of softnesses) {
						const state = normalizeState({
							studyId: study.id,
							seed: study.defaultSeed,
							artboard: artboard.key,
							areaCount: 6,
							areaSize,
							edgeSoftness
						});
						const model = buildPaintingModel(state);
						const edgeLambda = Math.max(
							28,
							0.22 * Math.min(artboard.artboardWidth, artboard.artboardHeight)
						);
						const avgDxLogical = Math.max(1.5, artboard.artboardWidth / 240);
						const maxReach = edgeSoftness > 0 ? 1 + 0.045 * (edgeSoftness / 100) : 1;

						for (const region of model.regions) {
							if (region.minX > 2) {
								expect(
									evaluateRegionMask(
										region,
										region.minX - 2,
										region.cy,
										maxReach,
										edgeSoftness,
										avgDxLogical,
										state.seed,
										edgeLambda
									)
								).toBe(0);
							}
							if (region.maxX < artboard.artboardWidth - 2) {
								expect(
									evaluateRegionMask(
										region,
										region.maxX + 2,
										region.cy,
										maxReach,
										edgeSoftness,
										avgDxLogical,
										state.seed,
										edgeLambda
									)
								).toBe(0);
							}
							if (region.minY > 2) {
								expect(
									evaluateRegionMask(
										region,
										region.cx,
										region.minY - 2,
										maxReach,
										edgeSoftness,
										avgDxLogical,
										state.seed,
										edgeLambda
									)
								).toBe(0);
							}
							if (region.maxY < artboard.artboardHeight - 2) {
								expect(
									evaluateRegionMask(
										region,
										region.cx,
										region.maxY + 2,
										maxReach,
										edgeSoftness,
										avgDxLogical,
										state.seed,
										edgeLambda
									)
								).toBe(0);
							}
						}
					}
				}
			}
		}

		// Zero bounding-box clipping artifacts vs full-canvas bounds on DEFAULT_STATE & two-area-soft
		const parityStates = [DEFAULT_STATE, applyPreset(DEFAULT_STATE, 'two-area-soft')] as const;
		for (const state of parityStates) {
			const model = buildPaintingModel(state);
			const fullBoundsModel = {
				...model,
				regions: model.regions.map((r) => ({
					...r,
					minX: 0,
					minY: 0,
					maxX: state.artboardWidth,
					maxY: state.artboardHeight
				})),
				glazePasses: model.glazePasses.map((p) => ({
					...p,
					minX: 0,
					minY: 0,
					maxX: state.artboardWidth,
					maxY: state.artboardHeight
				})),
				timeline: {
					...model.timeline,
					primitives: model.timeline.primitives.map((s) => ({
						...s,
						minX: 0,
						minY: 0,
						maxX: state.artboardWidth,
						maxY: state.artboardHeight
					}))
				}
			};
			const normalRes = renderPaintingStill(state, 600, 400, { model });
			const fullRes = renderPaintingStill(state, 600, 400, { model: fullBoundsModel });
			expect(bufferEq(normalRes.rgba, fullRes.rgba)).toBe(true);
		}
	}, 20000);

	// 14. Regression: Frame-1 Coverage Across All Studies & Boundary/Truncated Metrics Safety
	it('14. ensures frame-1 pixel change across all studies and finite metrics on degenerate or truncated buffers', () => {
		for (const study of STUDIES) {
			const state = normalizeState({
				studyId: study.id,
				seed: study.defaultSeed,
				paintingTime: 20,
				areaSize: 25,
				edgeSoftness: 100
			});
			const model = buildPaintingModel(state);
			const buf = new ProgressiveColorFieldBuffer(model, 360, 240);
			const ground = new Uint8ClampedArray(buf.getRgba());
			buf.advanceTo(0.0008);
			const frame1 = buf.getRgba();
			let changed = 0;
			for (let i = 0; i < frame1.length; i += 4) {
				if (
					frame1[i] !== ground[i] ||
					frame1[i + 1] !== ground[i + 1] ||
					frame1[i + 2] !== ground[i + 2]
				) {
					changed++;
				}
			}
			expect(changed).toBeGreaterThan(0);

			buf.finishAll();
			const still = renderPaintingStill(state, 360, 240, { model });
			expect(bufferEq(buf.getPixels(), still.rgba)).toBe(true);
			buf.dispose();
		}

		// Measure metrics on tiny (1x1, 3x3, 3x50, 50x3) and truncated rgba buffers
		const baseModel = buildPaintingModel(DEFAULT_STATE);
		const cases: readonly { w: number; h: number; truncPixels?: number }[] = [
			{ w: 1, h: 1 },
			{ w: 3, h: 3 },
			{ w: 3, h: 50 },
			{ w: 50, h: 3 },
			{ w: 100, h: 100, truncPixels: 200 },
			{ w: 100, h: 100, truncPixels: 5050 }
		];
		for (const c of cases) {
			const rendered = renderPaintingStill(DEFAULT_STATE, c.w, c.h, { model: baseModel });
			const rgba =
				c.truncPixels !== undefined ? rendered.rgba.subarray(0, c.truncPixels * 4) : rendered.rgba;
			const metrics = measurePaintingMetrics(rgba, c.w, c.h, baseModel);
			for (const [, val] of Object.entries(metrics)) {
				if (typeof val === 'number') {
					expect(Number.isFinite(val)).toBe(true);
				}
			}
			for (const rs of metrics.regionStats) {
				expect(Number.isFinite(rs.meanR)).toBe(true);
				expect(Number.isFinite(rs.meanG)).toBe(true);
				expect(Number.isFinite(rs.meanB)).toBe(true);
				expect(Number.isFinite(rs.meanLuminance)).toBe(true);
				expect(Number.isFinite(rs.interiorWeaveEnergy)).toBe(true);
			}
		}
	}, 20000);

	// 15. Regression: computeInspectCropRect width/height input, resolveArtboardFromPartial, and ImageData guard
	it('15. widens computeInspectCropRect, reconciles explicit artboard dimensions, and guards missing ImageData on export', async () => {
		const cropFromDims = computeInspectCropRect(
			{ artboardWidth: 1200, artboardHeight: 800 },
			3.0,
			0.5,
			0.5,
			1200,
			800
		);
		const cropFromKey = computeInspectCropRect('landscape', 3.0, 0.5, 0.5, 1200, 800);
		expect(cropFromDims).toEqual(cropFromKey);

		const portraitFromSpreadDims = normalizeState({
			...DEFAULT_STATE,
			artboardWidth: 960,
			artboardHeight: 1080
		});
		expect(portraitFromSpreadDims.artboard).toBe('portrait');
		expect(portraitFromSpreadDims.artboardWidth).toBe(960);
		expect(portraitFromSpreadDims.artboardHeight).toBe(1080);

		const squareFromSpreadDims = normalizeState({
			...DEFAULT_STATE,
			artboardWidth: 1080,
			artboardHeight: 900
		});
		expect(squareFromSpreadDims.artboard).toBe('square');
		expect(squareFromSpreadDims.artboardWidth).toBe(1080);
		expect(squareFromSpreadDims.artboardHeight).toBe(900);

		const portraitExplicit = normalizeState({ artboard: 'portrait' });
		expect(portraitExplicit.artboard).toBe('portrait');
		expect(portraitExplicit.artboardWidth).toBe(960);

		const portraitOverDefault = normalizeState({ ...DEFAULT_STATE, artboard: 'portrait' });
		expect(portraitOverDefault.artboard).toBe('portrait');
		expect(portraitOverDefault.artboardWidth).toBe(960);

		// Simulate partial OffscreenCanvas environment without ImageData: must fall back cleanly to stored PNG
		const prevOffscreen = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
		const prevImageData = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
		try {
			Object.defineProperty(globalThis, 'OffscreenCanvas', {
				configurable: true,
				value: class MockOffscreenCanvas {
					getContext() {
						return { putImageData() {} };
					}
				}
			});
			Object.defineProperty(globalThis, 'ImageData', {
				configurable: true,
				value: undefined
			});
			const exported = await exportWholePainting(DEFAULT_STATE, 512);
			const parsed = parsePngBasic(new Uint8Array(await exported.blob.arrayBuffer()));
			expect(parsed.width).toBe(512);
			expect(parsed.height).toBe(341);
		} finally {
			if (prevOffscreen) {
				Object.defineProperty(globalThis, 'OffscreenCanvas', prevOffscreen);
			} else {
				delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
			}
			if (prevImageData) {
				Object.defineProperty(globalThis, 'ImageData', prevImageData);
			} else {
				delete (globalThis as { ImageData?: unknown }).ImageData;
			}
		}
	});

	// 16. Tier 5 Adversarial: PRNG, Helper Boundaries, ViewState Clamping & Storage Partial Corruption
	it('16. guards PRNG edge boundaries, createDefaultState, viewState clamping, and partial storage corruption', () => {
		const rng = createStreamRng(482917, 'composition', 0);
		expect(() => rng.pick([])).toThrow(/empty array/i);
		expect(rng.int(7, 3)).toBe(7);
		expect(rng.int(4, 4)).toBe(4);
		expect(normalizeSeed('1000000000')).toBe(1);
		expect(normalizeSeed('000')).toBe(DEFAULT_STATE.seed);
		const bigSeed = '99999999999999999999999999999999999999';
		expect(normalizeSeed(bigSeed)).toBe(normalizeSeed(bigSeed));

		const f0 = fbm2D(482917, 1.2, 2.3, 0);
		const f10 = fbm2D(482917, 1.2, 2.3, 10);
		expect(f0).toBeGreaterThanOrEqual(0);
		expect(f0).toBeLessThan(1);
		expect(f10).toBeGreaterThanOrEqual(0);
		expect(f10).toBeLessThan(1);

		expect(createDefaultState().artboard).toBe('landscape');
		expect(createDefaultState('portrait').artboard).toBe('portrait');
		expect(createDefaultState({ key: 'square' }).artboard).toBe('square');
		expect(createDefaultState({ artboardWidth: 390, artboardHeight: 844 }).artboard).toBe(
			'portrait'
		);
		expect(createDefaultState({ artboardWidth: -100, artboardHeight: 200 }).artboard).toBe(
			'landscape'
		);

		const clampedLow = normalizeViewState({
			mode: 'bogus' as unknown as 'fill',
			inspectZoom: 0.5,
			inspectCenterX: -1,
			inspectCenterY: 2
		});
		expect(clampedLow).toEqual({
			mode: 'fill',
			inspectZoom: 2.0,
			inspectCenterX: 0.25,
			inspectCenterY: 0.75
		});

		const clampedHigh = normalizeViewState({
			mode: 'inspect',
			inspectZoom: 12,
			inspectCenterX: 0,
			inspectCenterY: 1
		});
		expect(clampedHigh).toEqual({
			mode: 'inspect',
			inspectZoom: 5.0,
			inspectCenterX: 0.1,
			inspectCenterY: 0.9
		});

		const parsedTextSeed = deserializeStateParams('?seed=gallery-wall&vm=fit');
		expect(parsedTextSeed.state.seed).toBe(normalizeSeed('gallery-wall'));
		expect(parsedTextSeed.viewState.mode).toBe('fit');
		expect(parsedTextSeed.hasExplicitView).toBe(true);

		const portrait = normalizeState({ artboard: 'portrait' });
		const backLandscape = normalizeState({ ...portrait, artboard: 'landscape' }, portrait);
		expect(backLandscape.artboard).toBe('landscape');
		expect(backLandscape.artboardWidth).toBe(1200);

		const store = new Map<string, string>();
		const prevStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		try {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: {
					getItem: (k: string) => store.get(k) ?? null,
					setItem: (k: string, v: string) => {
						store.set(k, v);
					},
					removeItem: (k: string) => {
						store.delete(k);
					}
				}
			});
			store.set(
				COLOR_FIELD_STORAGE_KEY,
				JSON.stringify({
					generatorVersion: COLOR_FIELD_GENERATOR_VERSION,
					areaCount: 99,
					studyId: 'invalid-study',
					seed: 0
				})
			);
			const recovered = loadStateFromStorage();
			expect(recovered).not.toBeNull();
			expect(recovered!.areaCount).toBe(6);
			expect(recovered!.studyId).toBe('rothko-nocturne');
			expect(recovered!.seed).toBe(DEFAULT_STATE.seed);

			store.set(
				COLOR_FIELD_STORAGE_KEY,
				JSON.stringify({
					generatorVersion: COLOR_FIELD_GENERATOR_VERSION,
					version: COLOR_FIELD_GENERATOR_VERSION + 1
				})
			);
			expect(loadStateFromStorage()).toBeNull();

			store.set(COLOR_FIELD_STORAGE_KEY, JSON.stringify({ generatorVersion: '1' }));
			expect(loadStateFromStorage()).toBeNull();
		} finally {
			if (prevStorage) {
				Object.defineProperty(globalThis, 'localStorage', prevStorage);
			} else {
				delete (globalThis as { localStorage?: unknown }).localStorage;
			}
		}
	});

	// 17. Tier 5 Adversarial: Fast vs Slow Mask Parity, Empty Timeline, Mid-Timeline resizeArtboard & Out-of-Bounds Crop
	it('17. matches evaluateRegionMaskFast to evaluateRegionMask, handles empty timelines, and preserves mid-timeline resizeArtboard & crop parity', () => {
		const emptyTl = buildTimeline([], 10);
		expect(emptyTl.passWindows).toEqual([]);
		expect(emptyTl.primitives).toEqual([]);

		const state = normalizeState({
			studyId: 'cobalt-veil',
			seed: 3912847101,
			areaCount: 4,
			edgeSoftness: 75
		});
		const model = buildPaintingModel(state);
		const eNorm = state.edgeSoftness / 100;
		const edgeFactor = 0.04 * eNorm + 0.34 * Math.pow(eNorm, 1.55);
		const noiseFactor = 0.015 * eNorm + 0.11 * Math.pow(eNorm, 1.25);
		const edgeLambda = Math.max(28, 0.22 * Math.min(state.artboardWidth, state.artboardHeight));

		for (const pass of model.glazePasses.slice(0, 4)) {
			const ctx = createRegionMaskContext(
				pass.region,
				pass.coatReachScale,
				state.edgeSoftness,
				2,
				state.seed,
				edgeLambda,
				edgeFactor,
				noiseFactor
			);
			for (let i = 0; i <= 10; i++) {
				const lx = (i / 10) * state.artboardWidth;
				const ly = ((10 - i) / 10) * state.artboardHeight;
				const fast = evaluateRegionMaskFast(ctx, lx, ly);
				const slow = evaluateRegionMask(
					pass.region,
					lx,
					ly,
					pass.coatReachScale,
					state.edgeSoftness,
					2,
					state.seed,
					edgeLambda,
					edgeFactor,
					noiseFactor
				);
				expect(Math.abs(fast - slow)).toBeLessThan(1e-12);
			}
		}

		const buf = new ProgressiveColorFieldBuffer(model, 300, 200);
		buf.advanceTo(0.42);
		const pMid = buf.getProgress();
		buf.resizeArtboard(model, 600, 400);
		const stillMid = renderPaintingStill(state, 600, 400, { model, maxProgress: pMid });
		expect(bufferEq(buf.getPixels(), stillMid.rgba)).toBe(true);

		const portraitState = normalizeState({
			...state,
			artboard: 'portrait',
			artboardWidth: 960,
			artboardHeight: 1080
		});
		const portraitModel = buildPaintingModel(portraitState);
		buf.resizeArtboard(portraitModel, 480, 540);
		const stillPortMid = renderPaintingStill(portraitState, 480, 540, {
			model: portraitModel,
			maxProgress: buf.getProgress()
		});
		expect(bufferEq(buf.getPixels(), stillPortMid.rgba)).toBe(true);

		const crop = computeInspectCropRect('portrait', 3.0, 0.5, 0.5, 480, 540);
		buf.finishAll();
		buf.resizeArtboard(portraitModel, Math.round(crop.width), Math.round(crop.height), crop);
		const stillCrop = renderPaintingStill(
			portraitState,
			Math.round(crop.width),
			Math.round(crop.height),
			{ model: portraitModel, crop }
		);
		expect(bufferEq(buf.getPixels(), stillCrop.rgba)).toBe(true);
		buf.dispose();

		const outCrop = renderPaintingStill(state, 60, 40, {
			crop: { x: 5000, y: 5000, width: 100, height: 100 }
		});
		const bareCrop = renderPaintingStill(state, 60, 40, {
			crop: { x: 5000, y: 5000, width: 100, height: 100 },
			maxProgress: 0
		});
		expect(bufferEq(outCrop.rgba, bareCrop.rgba)).toBe(true);
	});

	// 18. Tier 5 Adversarial: All-Study Sharp/Soft Metric Invariants (incl. cobalt-veil 3912847101), Stale-Model Export & Accessibility Branches
	it('18. holds gradient/luma/weave invariants across all studies (including cobalt-veil 3912847101), bypasses stale export models, and covers export/accessibility fallbacks', async () => {
		for (const study of STUDIES) {
			const seed = study.id === 'cobalt-veil' ? 3912847101 : study.defaultSeed;
			const sSharp = normalizeState({
				studyId: study.id,
				seed,
				areaCount: 2,
				edgeSoftness: 5,
				transparency: 14
			});
			const sSoft = normalizeState({
				studyId: study.id,
				seed,
				areaCount: 2,
				edgeSoftness: 95,
				transparency: 80
			});
			const mSharp = buildPaintingModel(sSharp);
			const mSoft = buildPaintingModel(sSoft);
			const rSharp = renderPaintingStill(sSharp, 420, 280, { model: mSharp });
			const rSoft = renderPaintingStill(sSoft, 420, 280, { model: mSoft });
			const metSharp = measurePaintingMetrics(rSharp.rgba, 420, 280, mSharp);
			const metSoft = measurePaintingMetrics(rSoft.rgba, 420, 280, mSoft);

			expect(metSharp.meanBoundaryGradient).toBeGreaterThan(metSoft.meanBoundaryGradient);
			expect(metSharp.luminanceVariance).toBeGreaterThan(metSoft.luminanceVariance);
			expect(metSoft.canvasWeaveVisibility).toBeGreaterThan(metSharp.canvasWeaveVisibility);
			expect(metSharp.paintedCoveragePct).toBeGreaterThan(0);
			expect(metSoft.paintedCoveragePct).toBeGreaterThan(0);
			expect(metSharp.regionSeparation).toBeGreaterThan(0);
			expect(metSoft.regionSeparation).toBeGreaterThan(0);
		}

		const mDefault = buildPaintingModel(DEFAULT_STATE);
		const altState = normalizeState({ studyId: 'cobalt-veil', seed: 3912847101 });
		const wholeStale = renderWholePaintingRgba(altState, 120, 80, mDefault);
		const wholeFresh = renderWholePaintingRgba(altState, 120, 80);
		expect(bufferEq(wholeStale.rgba, wholeFresh.rgba)).toBe(true);
		expect(wholeStale.model.state.studyId).toBe('cobalt-veil');

		await expect(
			exportWholePainting(DEFAULT_STATE, 512, {
				encodePng: async () => {
					throw 'non-error';
				}
			})
		).rejects.toThrow(/Unable to allocate export canvas/);

		const attempts2k: number[] = [];
		const fb2k = await exportWholePainting(DEFAULT_STATE, 2048, {
			model: mDefault,
			encodePng: async (rgba, width) => {
				attempts2k.push(width);
				if (width > 1280) throw new Error('OOM');
				return new Blob([new Uint8Array(rgba)], { type: 'image/png' });
			}
		});
		expect(attempts2k).toEqual([2048, 1280]);
		expect(fb2k.fallbackApplied).toBe(true);
		expect(fb2k.width).toBe(1280);

		const flatState = normalizeState({ canvasTexture: 0, edgeSoftness: 100, transparency: 95 });
		const flatModel = buildPaintingModel(flatState);
		expect(
			describePaintingAccessible(flatState, {
				...flatModel,
				regions: flatModel.regions.slice(0, 1)
			})
		).toContain('flat untextured ground: 1 color areas');
		expect(
			describePaintingAccessible(flatState, {
				...flatModel,
				regions: []
			})
		).toMatch(/in layered studio pigments\.$/);

		const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
		const prevCreate = URL.createObjectURL;
		const prevRevoke = URL.revokeObjectURL;
		let clicked = false;
		try {
			URL.createObjectURL = () => 'blob:tier5';
			URL.revokeObjectURL = () => {};
			Object.defineProperty(globalThis, 'document', {
				configurable: true,
				value: {
					createElement: () => ({
						href: '',
						download: '',
						rel: '',
						style: { display: '' },
						click() {
							clicked = true;
						},
						remove() {}
					}),
					body: { appendChild() {} }
				}
			});
			triggerBlobDownload(new Blob(['png']), 'tier5.png');
			expect(clicked).toBe(true);
		} finally {
			URL.createObjectURL = prevCreate;
			URL.revokeObjectURL = prevRevoke;
			if (prevDoc) {
				Object.defineProperty(globalThis, 'document', prevDoc);
			} else {
				delete (globalThis as { document?: unknown }).document;
			}
		}
	});

	// 19. Tier 5 Hardening: setArtboard, Study Curated Seed URL Parity, Non-Finite sRGB Guards, ViewState Round-Trip, Seed Sign Parity & Smooth Inspect Zoom
	it('19. pins setArtboard, ?study= curated seed fallback, non-finite sRGB guards, 3-decimal viewState round-trip, negative seed parity, and monotonic inspect zoom', () => {
		const portrait = normalizeState({ artboard: 'portrait' });
		const switched = setArtboard(portrait, 'landscape');
		expect(switched.artboard).toBe('landscape');
		expect(switched.artboardWidth).toBe(1200);
		expect(switched.artboardHeight).toBe(800);
		expect(setArtboard(switched, 'square').artboardWidth).toBe(1080);

		const parsedStudyOnly = deserializeStateParams('?study=cobalt-veil');
		expect(parsedStudyOnly.state.studyId).toBe('cobalt-veil');
		expect(parsedStudyOnly.state.seed).toBe(CURATED_STUDY_SEEDS['cobalt-veil']);
		const parsedStudyExplicitSeed = deserializeStateParams('?study=cobalt-veil&seed=12345');
		expect(parsedStudyExplicitSeed.state.seed).toBe(12345);
		const parsedStudyWithFallback = deserializeStateParams('?study=cobalt-veil', { seed: 777111 });
		expect(parsedStudyWithFallback.state.seed).toBe(777111);

		expect(linearToSrgbByte(Number.NaN)).toBe(0);
		expect(linearToSrgbByte(Number.NEGATIVE_INFINITY)).toBe(0);
		expect(linearToSrgbByte(Number.POSITIVE_INFINITY)).toBe(255);
		expect(linearToSrgbByteFast(Number.NaN)).toBe(0);
		expect(linearToSrgbByteFast(Number.NEGATIVE_INFINITY)).toBe(0);
		expect(linearToSrgbByteFast(Number.POSITIVE_INFINITY)).toBe(255);

		const vs = normalizeViewState({
			mode: 'inspect',
			inspectZoom: 3.5,
			inspectCenterX: 0.4214,
			inspectCenterY: 0.6184
		});
		expect(vs.inspectCenterX).toBe(0.421);
		expect(vs.inspectCenterY).toBe(0.618);
		const roundTripped = deserializeStateParams(
			serializeStateQuery(DEFAULT_STATE, { viewState: vs })
		).viewState;
		expect(roundTripped).toEqual(vs);

		expect(normalizeSeed(-123)).toBe(123);
		expect(normalizeSeed('-123')).toBe(123);
		expect(normalizeSeed('-0')).toBe(DEFAULT_STATE.seed);

		let prevCrop = computeInspectCropRect('landscape', 2.0, 0.5, 0.5, 320, 710);
		for (const z of [2.5, 3.0, 3.5, 4.0, 4.5, 4.99, 5.0]) {
			const nextCrop = computeInspectCropRect('landscape', z, 0.5, 0.5, 320, 710);
			expect(nextCrop.width).toBeLessThanOrEqual(prevCrop.width + 1e-9);
			expect(nextCrop.height).toBeLessThanOrEqual(prevCrop.height + 1e-9);
			prevCrop = nextCrop;
		}

		const inspectViewports: ReadonlyArray<[number, number]> = [
			[320, 710],
			[320, 568],
			[390, 844],
			[740, 380],
			[1440, 900]
		];
		for (const artboard of ['landscape', 'square', 'portrait'] as const) {
			for (const [vpW, vpH] of inspectViewports) {
				const vpRatio = Math.min(2.6, Math.max(0.45, vpW / vpH));
				for (const z of [2.0, 2.5, 3.5, 4.99, 5.0]) {
					const crop = computeInspectCropRect(artboard, z, 0.5, 0.5, vpW, vpH);
					expect(Math.abs(crop.width / crop.height - vpRatio)).toBeLessThan(1e-6);
				}
			}
		}
	});
});
