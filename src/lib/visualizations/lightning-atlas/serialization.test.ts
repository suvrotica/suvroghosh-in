import { describe, expect, it } from 'vitest';
import { DEFAULT_ATLAS_STATE, terrainPreset } from './config';
import { replayJson, strikeLogCsv } from './exports';
import { generateLightningFlash } from './leader-generator';
import { parseAtlasState, serializeAtlasState } from './serialization';
import type { SerializableAtlasState } from './types';

function completeState(): SerializableAtlasState {
	return {
		...DEFAULT_ATLAS_STATE,
		seed: 'shared-coast',
		terrain: 'coastal-shelf',
		mode: 'study',
		displayMode: 'field-map',
		flashType: 'positive-cg',
		strikeScale: 'large',
		stormPosition: { x: 0.33, z: 0.66 },
		storm: {
			...DEFAULT_ATLAS_STATE.storm,
			cloudBaseMetres: terrainPreset('coastal-shelf').cloudBaseMetres,
			chargeStrength: 0.91
		},
		environment: {
			...DEFAULT_ATLAS_STATE.environment,
			surfaceWetness: terrainPreset('coastal-shelf').defaultWetness,
			windDirection: 12
		},
		observer: { x: 0.76, z: 0.18 },
		cameraPreset: 'wide',
		visibleLayers: ['field', 'charge', 'streamers'],
		selectedStrikeIndex: 4,
		placedFeatures: [
			{
				id: 'authored-id',
				kind: 'radio-mast',
				x: 0.520123456789,
				z: 0.481987654321,
				rotation: 25.125
			}
		],
		flashSafe: false,
		quality: 'high'
	};
}

describe('Lightning Atlas URL and export state', () => {
	it('uses the heroic Kalbaisakhi landing state while preserving legacy v1 presentation', () => {
		const landing = parseAtlasState('');
		expect(landing.terrain).toBe('kalbaisakhi-bengal');
		expect(landing.strikeScale).toBe('heroic');
		expect(landing.cameraPreset).toBe('hero');
		expect(parseAtlasState('?campaign=summer')).toEqual(landing);

		const legacy = parseAtlasState('?v=1&seed=legacy-link');
		expect(legacy.strikeScale).toBe('standard');
		expect(legacy.cameraPreset).toBe('overview');
		expect(parseAtlasState('?v=1&scale=unknown').strikeScale).toBe('standard');
		expect(parseAtlasState('?v=1&view=unknown').cameraPreset).toBe('overview');
		expect(parseAtlasState('?v=1&scale=heroic&view=hero').strikeScale).toBe('heroic');
		expect(parseAtlasState('?v=1&scale=heroic&view=hero').cameraPreset).toBe('hero');
		expect(parseAtlasState('?v=1&scale=large&view=wide').cameraPreset).toBe('wide');
	});

	it('reconstructs the complete pre-morphology v1 default from an old compact link', () => {
		expect(parseAtlasState('?v=1')).toEqual({
			version: 1,
			seed: 'monsoon-1975',
			terrain: 'monsoon-delta',
			mode: 'live',
			displayMode: 'night',
			flashType: 'storm-decides',
			strikeScale: 'standard',
			stormPosition: { x: 0.56, z: 0.43 },
			storm: {
				chargeStrength: 0.72,
				chargeSeparation: 0.58,
				branching: 0.62,
				leaderPersistence: 0.68,
				cloudBaseMetres: 980,
				lowerPositiveCharge: true
			},
			environment: {
				windSpeed: 12,
				windDirection: 245,
				rainIntensity: 0.72,
				visibility: 0.58,
				surfaceWetness: 0.82,
				conductivityProxy: 0.54,
				timeOfDay: 0.88
			},
			observer: { x: 0.18, z: 0.81 },
			cameraPreset: 'overview',
			visibleLayers: ['branches', 'streamers', 'ground-current'],
			selectedStrikeIndex: 0,
			placedFeatures: [],
			flashSafe: true,
			quality: 'auto'
		});
	});

	it('round-trips complete readable state without geometry payloads', () => {
		const original = completeState();
		const params = serializeAtlasState(original);
		expect(params.get('scale')).toBe('large');
		expect(params.get('view')).toBe('wide');
		const parsed = parseAtlasState(params);
		expect(parsed).toEqual(original);
		expect(params.toString()).not.toMatch(/segments|geometry|Float32Array/);
		expect(params.toString().length).toBeLessThan(1_000);
		const originalFlash = generateLightningFlash({ state: original, strikeIndex: 4 }).flash;
		const restoredFlash = generateLightningFlash({ state: parsed, strikeIndex: 4 }).flash;
		expect(restoredFlash.channelHash).toBe(originalFlash.channelHash);
		expect(restoredFlash.attachment).toEqual(originalFlash.attachment);
	});

	it('preserves an explicitly empty layer set and rejects unsupported URL versions', () => {
		const hidden = completeState();
		hidden.visibleLayers = [];
		expect(parseAtlasState(serializeAtlasState(hidden)).visibleLayers).toEqual([]);
		expect(serializeAtlasState(hidden).get('layers')).toBe('none');

		const unsupported = parseAtlasState('?v=99&seed=should-not-load&terrain=open-ocean');
		expect(unsupported).toEqual({
			...DEFAULT_ATLAS_STATE,
			stormPosition: { ...DEFAULT_ATLAS_STATE.stormPosition },
			storm: { ...DEFAULT_ATLAS_STATE.storm },
			environment: { ...DEFAULT_ATLAS_STATE.environment },
			observer: { ...DEFAULT_ATLAS_STATE.observer },
			visibleLayers: [...DEFAULT_ATLAS_STATE.visibleLayers],
			placedFeatures: []
		});
	});

	it('accepts raw query strings and preserves values that collide with another terrain default', () => {
		const raw = parseAtlasState('v=1&terrain=open-ocean&seed=raw-query&strike=999');
		expect(raw.terrain).toBe('open-ocean');
		expect(raw.seed).toBe('raw-query');
		expect(raw.selectedStrikeIndex).toBe(999);
		const absolute = parseAtlasState(
			'https://example.test/blog/visualizations/lightning-atlas?v=1&terrain=forest-basin&seed=absolute-url'
		);
		expect(absolute.terrain).toBe('forest-basin');
		expect(absolute.seed).toBe('absolute-url');

		const collision = completeState();
		collision.terrain = 'desert-escarpment';
		collision.storm.cloudBaseMetres = DEFAULT_ATLAS_STATE.storm.cloudBaseMetres;
		collision.environment.surfaceWetness = DEFAULT_ATLAS_STATE.environment.surfaceWetness;
		const params = serializeAtlasState(collision);
		expect(params.has('cloudBase')).toBe(true);
		expect(params.has('wetness')).toBe(true);
		const restored = parseAtlasState(params);
		expect(restored).toEqual(collision);
		expect(generateLightningFlash({ state: restored, strikeIndex: 4 }).flash.channelHash).toBe(
			generateLightningFlash({ state: collision, strikeIndex: 4 }).flash.channelHash
		);

		collision.storm.cloudBaseMetres = 2_010;
		expect(parseAtlasState(serializeAtlasState(collision))).toEqual(collision);
	});

	it('clamps invalid values, ignores unknown values, and bounds placements', () => {
		const features = Array.from({ length: 40 }, () => 'radio-mast@2@-1@999').join(';');
		const parsed = parseAtlasState(
			`?v=1&terrain=moon&charge=999&cloudBase=-2&stormX=NaN&mode=nonsense&unknown=yes&features=${features}`
		);
		expect(parsed.terrain).toBe('monsoon-delta');
		expect(parsed.storm.chargeStrength).toBe(1);
		expect(parsed.storm.cloudBaseMetres).toBe(450);
		expect(parsed.mode).toBe(DEFAULT_ATLAS_STATE.mode);
		expect(parsed.placedFeatures).toHaveLength(20);
		expect(parsed.placedFeatures.every((feature) => feature.x === 1 && feature.z === 0)).toBe(true);
	});

	it('deduplicates authored placement IDs while retaining every valid feature', () => {
		const parsed = parseAtlasState(
			'?v=1&features=radio-mast@0.2@0.3@0@same-id;wind-turbine@0.7@0.8@90@same-id'
		);
		expect(parsed.placedFeatures).toHaveLength(2);
		expect(new Set(parsed.placedFeatures.map((feature) => feature.id)).size).toBe(2);
		expect(parsed.placedFeatures[0].id).toBe('same-id');
		expect(parsed.placedFeatures[1].id).toMatch(/^same-id-1$/);
	});

	it('exports versioned replay JSON and correctly escaped CSV', () => {
		const state = completeState();
		const { flash } = generateLightningFlash({ state, strikeIndex: 4 });
		flash.attachment!.label = 'Tower, "North"';
		const unrelatedCurrentState = completeState();
		unrelatedCurrentState.seed = 'stale-control-state';
		unrelatedCurrentState.terrain = 'open-ocean';
		unrelatedCurrentState.storm.chargeStrength = 0.2;
		unrelatedCurrentState.displayMode = 'night';
		unrelatedCurrentState.cameraPreset = 'follow';
		unrelatedCurrentState.quality = 'low';
		unrelatedCurrentState.strikeScale = 'compact';
		unrelatedCurrentState.visibleLayers = ['contours'];
		unrelatedCurrentState.flashSafe = true;
		unrelatedCurrentState.environment.rainIntensity = 0.04;
		unrelatedCurrentState.environment.visibility = 0.31;
		unrelatedCurrentState.environment.timeOfDay = 0.92;
		const json = JSON.parse(replayJson(unrelatedCurrentState, flash));
		expect(json.schemaVersion).toBe(1);
		expect(json.configuration.seed).toBe(state.seed);
		expect(json.configuration.terrain).toBe(state.terrain);
		expect(json.configuration.storm.chargeStrength).toBe(state.storm.chargeStrength);
		expect(json.configuration.displayMode).toBe(unrelatedCurrentState.displayMode);
		expect(json.configuration.cameraPreset).toBe(unrelatedCurrentState.cameraPreset);
		expect(json.configuration.quality).toBe(unrelatedCurrentState.quality);
		expect(json.configuration.strikeScale).toBe(state.strikeScale);
		expect(json.configuration.visibleLayers).toEqual(unrelatedCurrentState.visibleLayers);
		expect(json.configuration.flashSafe).toBe(true);
		expect(json.configuration.environment.rainIntensity).toBe(0.04);
		expect(json.configuration.environment.visibility).toBe(0.31);
		expect(json.configuration.environment.timeOfDay).toBe(0.92);
		expect(json.configuration.environment.windSpeed).toBe(state.environment.windSpeed);
		expect(json.strike.channelHash).toBe(flash.channelHash);
		expect(json.strike.strikeScale).toBe(state.strikeScale);
		expect(json.strike.modelState.strikeScale).toBe(state.strikeScale);
		expect(
			generateLightningFlash({
				state: json.configuration,
				strikeIndex: json.configuration.selectedStrikeIndex
			}).flash.channelHash
		).toBe(flash.channelHash);
		const csv = strikeLogCsv([flash]);
		expect(csv).toContain('"Tower, ""North"""');
		expect(csv.split('\r\n')[0]).toContain('simulated_strike_scale');
		expect(csv.split('\r\n')[1].split(',')).toContain(flash.strikeScale);
		const headers = csv.split('\r\n')[0].split(',');
		expect(headers.every((header) => header === 'seed' || header.startsWith('simulated_'))).toBe(
			true
		);
		expect(csv.split('\r\n')).toHaveLength(2);
	});
});
