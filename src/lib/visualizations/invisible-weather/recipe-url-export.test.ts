import { describe, expect, it } from 'vitest';
import {
	boundedExportDimensions,
	createExportPlan,
	createJsonExport,
	exportFilename,
	sanitizeFilename,
	serializeJsonExport,
	validateJsonExport
} from './export';
import { deriveSubseed } from './hash';
import { createExhibitionRecipe, normalizeGalleryState, stateForPreset } from './recipes';
import {
	buildInvisibleWeatherShareUrl,
	parseInvisibleWeatherState,
	serializeInvisibleWeatherState
} from './url-state';

describe('Invisible Weather recipes', () => {
	it('repeats recipe hashes and geometry independently of viewport and selection', () => {
		const state = stateForPreset('monsoon-ledger', 'same-weather');
		const first = createExhibitionRecipe(state);
		const second = createExhibitionRecipe({ ...state, selectedArtwork: 7 });
		expect(second.recipeHash).toBe(first.recipeHash);
		expect(second.artworks).toEqual(first.artworks);
		expect(createExhibitionRecipe(state).recipeHash).toBe(first.recipeHash);
		expect(
			first.artworks.every((artwork) => artwork.field.seed === first.artworks[0].field.seed)
		).toBe(true);
	});

	it('changes hashes for structural controls and derives sub-seeds from layout and field family', () => {
		const state = stateForPreset('monsoon-ledger', 'structure');
		const base = createExhibitionRecipe(state);
		const warped = createExhibitionRecipe({ ...state, warpStrength: state.warpStrength + 0.1 });
		const otherLayout = createExhibitionRecipe({ ...state, layout: 'quiet-grid' });
		expect(warped.recipeHash).not.toBe(base.recipeHash);
		expect(otherLayout.recipeHash).not.toBe(base.recipeHash);
		expect(otherLayout.artworks[0].seed).not.toBe(base.artworks[0].seed);
		const first = base.artworks[0];
		expect(first.seed).toBe(
			deriveSubseed(
				state.seed,
				`v${state.version}:${state.layout}:${state.noiseMode}-depth-${first.field.depth}-${first.angleMode}-${first.threshold.mode}:artwork-1`
			)
		);
		expect(base.artworks.every((artwork) => artwork.pathCount > 0)).toBe(true);
	});

	it('curates a shared default weather into mixed local instruments and a coherent mask subset', () => {
		const recipe = createExhibitionRecipe(stateForPreset('monsoon-ledger', 'mixed-instruments'));
		expect(new Set(recipe.artworks.map((artwork) => artwork.field.seed)).size).toBe(1);
		expect(new Set(recipe.artworks.map((artwork) => artwork.secondaryField?.seed)).size).toBe(1);
		expect(recipe.artworks[0].secondaryField?.seed).not.toBe(recipe.artworks[0].field.seed);
		const angleModes = new Set(recipe.artworks.map((artwork) => artwork.angleMode));
		expect(angleModes.has('free')).toBe(true);
		expect(angleModes.has('diagonal')).toBe(true);
		expect(
			new Set(recipe.artworks.map((artwork) => artwork.field.depth)).size
		).toBeGreaterThanOrEqual(3);
		expect(
			new Set(recipe.artworks.map((artwork) => artwork.threshold.mode)).size
		).toBeGreaterThanOrEqual(3);
		expect(new Set(recipe.artworks.map((artwork) => artwork.mask)).size).toBeLessThanOrEqual(5);
		expect(new Set(recipe.artworks.map((artwork) => artwork.mask)).size).toBeLessThan(
			recipe.artworkCount
		);
		expect(
			new Set(recipe.artworks.map((artwork) => JSON.stringify(artwork.secondaryTransform))).size
		).toBeGreaterThan(1);
	});

	it('respects explicit studio overrides while presets provide local variation', () => {
		const state = stateForPreset('monsoon-ledger', 'studio-override');
		const recipe = createExhibitionRecipe({
			...state,
			angleMode: 'orthogonal',
			depth: 1,
			thresholdMode: 'off'
		});
		expect(recipe.artworks.every((artwork) => artwork.angleMode === 'orthogonal')).toBe(true);
		expect(recipe.artworks.every((artwork) => artwork.field.depth === 1)).toBe(true);
		expect(recipe.artworks.every((artwork) => artwork.threshold.mode === 'off')).toBe(true);
		expect(recipe.artworks.every((artwork) => artwork.secondaryInk === undefined)).toBe(true);
	});

	it('uses motion speed only as playback state, not as field morphology', () => {
		const state = stateForPreset('monsoon-ledger', 'one-morphology');
		const slow = createExhibitionRecipe({ ...state, speed: 0.25 });
		const fast = createExhibitionRecipe({ ...state, speed: 3.5 });
		expect(fast.artworks).toEqual(slow.artworks);
		expect(slow.artworks.every((artwork) => artwork.speed === 1)).toBe(true);
		expect(slow.artworks.every((artwork) => artwork.field.timeScale === 0.06)).toBe(true);
	});

	it('keeps the seven named presets faithful to their defining constraints', () => {
		const quiet = stateForPreset('nine-quiet-rooms');
		expect(quiet).toMatchObject({ depth: 2, layout: 'quiet-grid', artworkCount: 9, dualInk: true });
		const river = stateForPreset('river-between-walls');
		expect(river).toMatchObject({ thresholdMode: 'river', dualInk: true });
		const monsoon = stateForPreset('monsoon-ledger');
		expect(monsoon).toMatchObject({ motion: 'migrate', speed: 0.55 });
		const salon = stateForPreset('salon-after-closing');
		expect(salon).toMatchObject({ layout: 'salon-wall', paletteId: 'night-museum' });
		const silences = stateForPreset('three-large-silences');
		expect(silences).toMatchObject({ layout: 'triptych', artworkCount: 3, pathDensity: 0.52 });
	});

	it('clamps every gallery control and coerces triptychs to exactly three works', () => {
		const normalized = normalizeGalleryState({
			...stateForPreset('monsoon-ledger'),
			layout: 'triptych',
			artworkCount: 99,
			frequency: Number.POSITIVE_INFINITY,
			multiplier: -4,
			turns: 99,
			strokeWidth: 0,
			grain: -1,
			shadow: 9,
			speed: Number.NaN
		});
		expect(normalized.artworkCount).toBe(3);
		expect(normalized.frequency).toBe(stateForPreset('monsoon-ledger').frequency);
		expect(normalized.multiplier).toBe(0.25);
		expect(normalized.turns).toBe(8);
		expect(normalized.strokeWidth).toBe(0.25);
		expect(normalized.grain).toBe(0);
		expect(normalized.shadow).toBe(1);
		expect(Number.isFinite(normalized.speed)).toBe(true);
	});
});

describe('Invisible Weather versioned URL state', () => {
	it('round-trips the complete curator state while preserving unrelated parameters', () => {
		const state = normalizeGalleryState({
			...stateForPreset('cabinet-of-crosswinds', 'url-weather'),
			artworkCount: 15,
			frequency: 2.345,
			warpStrength: 0.77,
			softness: 0.63,
			thresholdWidth: 0.071,
			phase: 12.5,
			frozenPhase: 12.5,
			selectedArtwork: 11,
			pathDensity: 1.4,
			pathLength: 73,
			multiplier: 1.7,
			turns: 2.4,
			strokeWidth: 1.3,
			dualInk: false,
			grain: 0.44,
			shadow: 0.71,
			frameFamily: 'oxidised-brass',
			orientation: 'portrait',
			speed: 1.6
		});
		const params = serializeInvisibleWeatherState(state, '?campaign=monsoon&ref=gallery');
		expect(params.get('campaign')).toBe('monsoon');
		expect(params.get('ref')).toBe('gallery');
		const parsed = parseInvisibleWeatherState(params);
		expect(parsed.issues).toEqual([]);
		expect(parsed.state).toEqual(state);
		expect(
			buildInvisibleWeatherShareUrl('https://example.test/exhibit?campaign=a', state)
		).toContain('campaign=a');
	});

	it('omits preset defaults without changing reconstruction and clamps hostile values', () => {
		const preset = stateForPreset('three-large-silences');
		const compact = serializeInvisibleWeatherState(preset);
		expect(compact.has('iw_count')).toBe(false);
		expect(parseInvisibleWeatherState(compact).state).toEqual(preset);
		const invalid = parseInvisibleWeatherState(
			'?iw_v=1&iw_layout=banana&iw_count=999&iw_depth=-5&iw_freq=NaN&iw_angle=north&iw_orientation=square&iw_dual=perhaps'
		);
		expect(invalid.state.artworkCount).toBe(15);
		expect(invalid.state.depth).toBe(1);
		expect(invalid.issues.length).toBeGreaterThanOrEqual(6);
		expect(parseInvisibleWeatherState('?iw_v=99&iw_seed=ignored').unsupportedVersion).toBe(true);
	});

	it('serializes phase only for frozen shares and ignores orphaned live phases', () => {
		const moving = { ...stateForPreset('monsoon-ledger', 'moving-phase'), phase: 8.25 };
		const movingParams = serializeInvisibleWeatherState(moving);
		expect(movingParams.has('iw_phase')).toBe(false);
		expect(movingParams.has('iw_frozen')).toBe(false);
		const orphaned = parseInvisibleWeatherState(
			'?iw_v=1&iw_seed=moving-phase&iw_preset=monsoon-ledger&iw_phase=8.25'
		);
		expect(orphaned.state.phase).toBe(0);
		expect(orphaned.issues.some((issue) => issue.parameter === 'iw_phase')).toBe(true);
		const frozen = { ...moving, frozenPhase: 8.25 };
		const frozenParams = serializeInvisibleWeatherState(frozen);
		expect(frozenParams.get('iw_phase')).toBe('8.25');
		expect(frozenParams.get('iw_frozen')).toBe('8.25');
		expect(parseInvisibleWeatherState(frozenParams).state).toEqual(frozen);
	});
});

describe('Invisible Weather exports', () => {
	it('bounds dimensions, scale, and total allocation', () => {
		const dimensions = boundedExportDimensions(100_000, 100_000, 100);
		expect(dimensions.width).toBeLessThanOrEqual(8_192);
		expect(dimensions.height).toBeLessThanOrEqual(8_192);
		expect(dimensions.pixelCount).toBeLessThanOrEqual(24_000_000);
		const recipe = createExhibitionRecipe(stateForPreset('monsoon-ledger'));
		const plan = createExportPlan(recipe, { orientation: 'portrait', scale: 2 });
		expect(plan.height).toBeGreaterThan(plan.width);
		expect(plan.filename).toMatch(/\.png$/u);
	});

	it('creates safe filenames and schema-valid deterministic JSON', () => {
		const state = stateForPreset('monsoon-ledger', 'json-weather');
		const recipe = createExhibitionRecipe(state);
		expect(sanitizeFilename('../CON?.png')).not.toContain('..');
		expect(exportFilename(recipe, 'json')).toMatch(/\.json$/u);
		const record = createJsonExport(state, recipe);
		expect(validateJsonExport(record)).toBe(true);
		expect(validateJsonExport({ ...record, schemaVersion: 99 })).toBe(false);
		expect(JSON.parse(serializeJsonExport(state, recipe))).toEqual(record);
	});
});
