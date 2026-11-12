import { describe, expect, it } from 'vitest';
import {
	applyPreset,
	assignColors,
	buildCompositionModel,
	buildPaintTimeline,
	computeExportDimensions,
	DEFAULT_MONDRIAN_STATE,
	deserializeStateParams,
	generateLayout,
	INITIAL_CURATED_SEED,
	MONDRIAN_PALETTE,
	normalizeState,
	prepareMaterial,
	renderPainting,
	serializeStateQuery
} from './index.ts';

describe('Mondrian Studio deterministic composition & material model', () => {
	it('reproduces identical geometry, colors, timeline, and pixel buffers for identical inputs', () => {
		const stateA = normalizeState({
			seed: INITIAL_CURATED_SEED,
			panels: 14,
			unevenSpacing: 65,
			colorArea: 28,
			lineWidth: 0.7,
			paintTexture: 40,
			paintingTime: 8,
			colorEmphasis: 'balanced',
			aspectRatio: 1.5
		});
		const stateB = normalizeState({ ...stateA });

		const modelA = buildCompositionModel(stateA);
		const modelB = buildCompositionModel(stateB);
		expect(modelA.layout).toEqual(modelB.layout);
		expect(modelA.colors).toEqual(modelB.colors);
		expect(modelA.description).toBe(modelB.description);

		const tlA = buildPaintTimeline(modelA.layout, modelA.colors, stateA.paintingTime);
		const tlB = buildPaintTimeline(modelB.layout, modelB.colors, stateB.paintingTime);
		expect(tlA).toEqual(tlB);

		const prepA = prepareMaterial({
			layout: modelA.layout,
			colors: modelA.colors,
			timeline: tlA,
			paintTexture: stateA.paintTexture,
			width: 360,
			height: 240
		});
		const prepB = prepareMaterial({
			layout: modelB.layout,
			colors: modelB.colors,
			timeline: tlB,
			paintTexture: stateB.paintTexture,
			width: 360,
			height: 240
		});

		expect(Buffer.compare(Buffer.from(prepA.finishedRgba), Buffer.from(prepB.finishedRgba))).toBe(0);
	});

	it('adds divisions when Panels increases and recovers the exact earlier subdivision when decreased', () => {
		const layout9 = generateLayout({
			seed: INITIAL_CURATED_SEED,
			panels: 9,
			unevenSpacing: 65,
			aspectRatio: 1.5,
			lineWidth: 0.7
		});
		const layout24 = generateLayout({
			seed: INITIAL_CURATED_SEED,
			panels: 24,
			unevenSpacing: 65,
			aspectRatio: 1.5,
			lineWidth: 0.7
		});
		const layout9Recovered = generateLayout({
			seed: INITIAL_CURATED_SEED,
			panels: 9,
			unevenSpacing: 65,
			aspectRatio: 1.5,
			lineWidth: 0.7
		});

		expect(layout9.regions).toHaveLength(9);
		expect(layout24.regions).toHaveLength(24);
		expect(layout9Recovered.regions).toEqual(layout9.regions);
		expect(layout9Recovered.boundaries).toEqual(layout9.boundaries);
	});

	it('keeps the full Uneven spacing (0-100%), Panels (6-30), and Line width (0.25-1.5%) ranges geometrically valid with positive interiors', () => {
		const seeds = [INITIAL_CURATED_SEED, 314159, 604817, 842159];
		const spacings = [0, 35, 65, 100];
		const panelCounts = [6, 14, 30];
		const ratios = [0.46, 1.0, 1.5, 2.35];

		for (const seed of seeds) {
			for (const panels of panelCounts) {
				for (const unevenSpacing of spacings) {
					for (const aspectRatio of ratios) {
						const layout = generateLayout({
							seed,
							panels,
							unevenSpacing,
							aspectRatio,
							lineWidth: 1.5
						});

						expect(layout.regions).toHaveLength(panels);
						const sumArea = layout.regions.reduce((s, r) => s + r.area, 0);
						expect(sumArea).toBeCloseTo(1.0, 5);

						for (const r of layout.regions) {
							expect(r.width).toBeGreaterThan(0);
							expect(r.height).toBeGreaterThan(0);
							// Visible interior after subtracting half-line-thickness on both sides must remain positive.
							const interiorW = r.width - layout.lineThicknessX;
							const interiorH = r.height - layout.lineThicknessY;
							expect(interiorW).toBeGreaterThan(0.002);
							expect(interiorH).toBeGreaterThan(0.002);
						}
					}
				}

				// Verify region IDs remain stable across Uneven spacing changes on the same seed & panel count.
				const idsAt0 = generateLayout({
					seed,
					panels,
					unevenSpacing: 0,
					aspectRatio: 1.5,
					lineWidth: 0.7
				}).regions.map((r) => r.id);
				const idsAt100 = generateLayout({
					seed,
					panels,
					unevenSpacing: 100,
					aspectRatio: 1.5,
					lineWidth: 0.7
				}).regions.map((r) => r.id);
				expect(idsAt0).toEqual(idsAt100);
			}
		}
	});

	it('isolates random streams so Paint texture, Line width, and Painting time never alter layout or color assignment', () => {
		const base = buildCompositionModel(
			normalizeState({
				seed: INITIAL_CURATED_SEED,
				paintTexture: 40,
				lineWidth: 0.7,
				paintingTime: 8
			})
		);
		const changedSurface = buildCompositionModel(
			normalizeState({
				seed: INITIAL_CURATED_SEED,
				paintTexture: 95,
				lineWidth: 1.45,
				paintingTime: 16
			})
		);

		expect(changedSurface.layout.regions).toEqual(base.layout.regions);
		expect(changedSurface.colors.colorByRegionId).toEqual(base.colors.colorByRegionId);
		expect(changedSurface.colors.actualColorAreaPct).toBe(base.colors.actualColorAreaPct);

		const changedEmphasis = buildCompositionModel(
			normalizeState({
				seed: INITIAL_CURATED_SEED,
				colorArea: 42,
				colorEmphasis: 'red'
			})
		);
		expect(changedEmphasis.layout.regions).toEqual(base.layout.regions);
		expect(changedEmphasis.layout.boundaries).toEqual(base.layout.boundaries);
	});

	it('merges collinear shared boundary segments so no boundary edge is duplicated', () => {
		const layout = generateLayout({
			seed: INITIAL_CURATED_SEED,
			panels: 24,
			unevenSpacing: 65,
			aspectRatio: 1.5,
			lineWidth: 0.7
		});

		for (let i = 0; i < layout.boundaries.length; i++) {
			for (let j = i + 1; j < layout.boundaries.length; j++) {
				const a = layout.boundaries[i]!;
				const b = layout.boundaries[j]!;
				if (a.orientation === b.orientation && Math.abs(a.coord - b.coord) < 1e-4) {
					const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
					expect(overlap).toBeLessThanOrEqual(1e-5);
				}
			}
		}
	});

	it('follows the pre-boundary normalized Color area convention, supports 0%, and verifies the worked experiment steps', () => {
		const bw = buildCompositionModel(
			normalizeState({ seed: INITIAL_CURATED_SEED, colorArea: 0 })
		);
		expect(bw.colors.actualColorAreaPct).toBe(0);
		expect(bw.colors.regions.every((r) => r.color === 'warm-white')).toBe(true);
		expect(bw.description).toContain('no primary color blocks');

		const step30 = buildCompositionModel(
			normalizeState({ seed: INITIAL_CURATED_SEED, panels: 14, unevenSpacing: 65, colorArea: 30, aspectRatio: 1.5 })
		);
		const step15 = buildCompositionModel(
			normalizeState({ seed: INITIAL_CURATED_SEED, panels: 14, unevenSpacing: 65, colorArea: 15, aspectRatio: 1.5 })
		);

		expect(step30.colors.actualColorAreaPct).toBe(30.5);
		expect(step15.colors.actualColorAreaPct).toBe(15.9);

		// Surviving colored panels at 15% retain their exact primary hue from 30%.
		for (const r of step15.colors.regions) {
			if (r.color !== 'warm-white') {
				expect(step30.colors.colorByRegionId[r.id]).toBe(r.color);
			}
		}

		// Presets preserve the current seed.
		const customSeedState = normalizeState({ ...DEFAULT_MONDRIAN_STATE, seed: 777333 });
		expect(applyPreset(customSeedState, 'dense').seed).toBe(777333);
		expect(applyPreset(customSeedState, 'spare').seed).toBe(777333);
	});

	it('agrees pixel-for-pixel between finishedRgba, completed playback (progress = 1.0), and settled reveal, and renders flat colors at 0% texture', () => {
		const state = normalizeState({
			seed: INITIAL_CURATED_SEED,
			paintTexture: 0,
			aspectRatio: 1.5
		});
		const model = buildCompositionModel(state);
		const timeline = buildPaintTimeline(model.layout, model.colors, state.paintingTime);
		const prepared = prepareMaterial({
			layout: model.layout,
			colors: model.colors,
			timeline,
			paintTexture: 0,
			width: 300,
			height: 200
		});

		const atZero = renderPainting(prepared, 0);
		const atMid = renderPainting(prepared, 0.45);
		const atSettle = renderPainting(prepared, 0.99);
		const atDone = renderPainting(prepared, 1.0);

		expect(Buffer.compare(Buffer.from(atDone), Buffer.from(prepared.finishedRgba))).toBe(0);
		expect(Buffer.compare(Buffer.from(atSettle), Buffer.from(prepared.finishedRgba))).toBe(0);
		expect(Buffer.compare(Buffer.from(atZero), Buffer.from(atDone))).not.toBe(0);
		expect(Buffer.compare(Buffer.from(atMid), Buffer.from(atZero))).not.toBe(0);

		// Sample interior center of largest warm-white region at 0% texture: must match exact #F3EFE3.
		const largestWhite = model.colors.regions
			.filter((r) => r.color === 'warm-white')
			.sort((a, b) => b.area - a.area)[0]!;
		const cx = Math.floor(((largestWhite.x0 + largestWhite.x1) * 0.5) * 300);
		const cy = Math.floor(((largestWhite.y0 + largestWhite.y1) * 0.5) * 200);
		const pOff = (cy * 300 + cx) * 4;
		expect(atDone[pOff]).toBe(MONDRIAN_PALETTE['warm-white'].r);
		expect(atDone[pOff + 1]).toBe(MONDRIAN_PALETTE['warm-white'].g);
		expect(atDone[pOff + 2]).toBe(MONDRIAN_PALETTE['warm-white'].b);
		expect(atDone[pOff + 3]).toBe(255);
	});

	it('round-trips URL query serialization and computes clean export dimensions', () => {
		const original = normalizeState({
			seed: 554433,
			panels: 19,
			unevenSpacing: 78,
			colorArea: 22,
			lineWidth: 0.95,
			paintTexture: 62,
			paintingTime: 11,
			colorEmphasis: 'red',
			aspectRatio: 1.7778
		});
		const query = serializeStateQuery(original, { view: 'article' });
		const parsed = deserializeStateParams(query);

		expect(parsed.hasExplicitState).toBe(true);
		expect(parsed.initialView).toBe('article');
		expect(parsed.savedAspectRatio).toBeCloseTo(1.778, 3);
		expect(parsed.state.seed).toBe(554433);
		expect(parsed.state.panels).toBe(19);
		expect(parsed.state.colorEmphasis).toBe('red');

		expect(computeExportDimensions(2048, 1.6)).toEqual({ width: 2048, height: 1280 });
		expect(computeExportDimensions(4096, 0.5)).toEqual({ width: 2048, height: 4096 });
	});
});
