import { describe, expect, it } from 'vitest';
import { DEFAULT_OREGONATOR_SETUP } from '../constants';
import {
	BZ_V2_CALIBRATION_MANIFEST,
	bzV2CalibrationById,
	bzV2CheckpointById,
	bzV2DisplayProfileById,
	bzV2PresetById,
	parseBZCalibrationManifestV2
} from './manifest';

const ZERO_SHA256 = '0'.repeat(64);

interface MutablePresetFixture extends Record<string, unknown> {
	id: string;
	setup: Record<string, unknown>;
	sourceSemantics: string;
	validationStatus: string;
	validationSummary: Record<string, unknown>;
	hero: boolean;
}

interface MutableCalibrationFixture extends Record<string, unknown> {
	presetId: string;
	status: string;
	setup: Record<string, unknown>;
	criteria: unknown[];
	convergence: unknown[];
	cpuGpuParity: Record<string, unknown>;
	displayIndependence: Record<string, unknown>;
}

interface MutableManifestFixture extends Record<string, unknown> {
	search: Record<string, unknown>;
	displayProfiles: Array<Record<string, unknown>>;
	presets: MutablePresetFixture[];
	calibrations: MutableCalibrationFixture[];
	checkpoints: Array<Record<string, unknown>>;
	assets: Array<Record<string, unknown>>;
	performance: Array<Record<string, unknown>>;
}

function publicFoundation(): MutableManifestFixture {
	return JSON.parse(
		JSON.stringify(BZ_V2_CALIBRATION_MANIFEST)
	) as unknown as MutableManifestFixture;
}

function candidateManifest(): MutableManifestFixture {
	const manifest = publicFoundation();
	manifest.assets = [];
	manifest.checkpoints = [];
	manifest.performance = [];
	const setup = {
		...DEFAULT_OREGONATOR_SETUP,
		parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters },
		gridSize: 2,
		initialCondition: 'central-pulse',
		seed: 'manifest-fixture'
	};
	const observationWindow = {
		startStep: 0,
		endStep: 2,
		startTime: 0,
		endTime: 2 * setup.timestep,
		sampleEverySteps: 1
	};
	manifest.displayProfiles = [
		{
			id: 'fixture-display',
			title: 'Fixture display',
			version: 'bz-display-linear-light-v2',
			style: 'scientific',
			palette: 'scientific',
			defaultView: 'u',
			rangeMode: 'fixed',
			ranges: {
				u: { minimum: 0, maximum: 1, units: 'dimensionless' }
			},
			phase: { centreU: 0.1, centreV: 0.2, scaleU: 1, scaleV: 1 },
			exposure: 1,
			bloom: 0,
			highlight: 1,
			saturation: 1,
			frontScale: 0.2,
			contrast: 1,
			gamma: 1,
			bloomThreshold: 0.52,
			bloomRadius: 0,
			ferroinMix: {
				recoveryWeight: 0.72,
				activatorLuminanceWeight: 0.28,
				gradientHighlightWeight: 0.4
			},
			luminousMix: { phaseWeight: 0.68, recoveryWeight: 0.32, frontWeight: 0.55 },
			interpolation: 'mask-aware-manual-bilinear',
			toneMap: 'aces-fitted',
			outputTransfer: 'srgb',
			disclosure: 'Fixed fixture range; display settings do not alter the state.'
		}
	];
	manifest.presets = [
		{
			schemaVersion: 2,
			id: 'fixture-preset',
			title: 'Fixture preset',
			shortDescription: 'A candidate used only to exercise the manifest contract.',
			model: setup.model,
			modelVersion: setup.modelVersion,
			equationsId: setup.equationsId,
			setup,
			initialCondition: setup.initialCondition,
			initialInterventions: [],
			sourceSemantics: 'finite-initial-perturbation',
			warmupPolicy: { kind: 'none', reason: 'The fixture begins at model step zero.' },
			optionalCheckpoint: null,
			displayProfileId: 'fixture-display',
			calibrationRecordId: 'fixture-calibration',
			validationStatus: 'candidate',
			validationSummary: {
				status: 'candidate',
				headline: 'No validation claim is made by the fixture.',
				passedCriteria: [],
				failedCriteria: [],
				measurements: {}
			},
			observationWindow,
			reproducibility: {
				seed: setup.seed,
				engineVersion: 'bz-heun-five-point-v2',
				setupChecksum: ZERO_SHA256,
				interventionLogChecksum: ZERO_SHA256,
				command: 'fixture-only'
			},
			articleClaimBoundary: 'Candidate fixture only; it is not a validated regime.',
			hero: false
		}
	];
	manifest.calibrations = [
		{
			id: 'fixture-calibration',
			presetId: 'fixture-preset',
			status: 'candidate',
			statusReason: 'This synthetic record exists only to test schema behaviour.',
			setup,
			interventions: [],
			observationWindow,
			sampledTimes: [0, setup.timestep, 2 * setup.timestep],
			metrics: {},
			criteria: [],
			convergence: [],
			cpuGpuParity: {
				status: 'not-measured',
				pass: false,
				reason: 'Not measured.',
				observables: []
			},
			displayIndependence: {
				stateChecksumBefore: ZERO_SHA256,
				stateChecksumAfter: ZERO_SHA256,
				pass: false
			},
			provenance: { generator: 'manifest.test.ts' }
		}
	];
	return manifest;
}

function measuredParity(): Record<string, unknown> {
	const numericalError = { maxAbsolute: 0, rms: 0, samples: 1 };
	const displayError = { maximumByteDifference: 0, meanByteDifference: 0, samples: 1 };
	return {
		status: 'measured',
		pass: true,
		evidencePath: '/data/bz-v2/gpu-parity.json',
		evidenceSha256: ZERO_SHA256,
		grid: 64,
		modelStep: 2,
		modelTime: 0.001,
		cpuPrecision: 'float64',
		gpuPrecision: 'float32',
		textureFormat: 'RGBA32F',
		scopeKind: 'implementation-and-display-64',
		scope: 'Measured fixture covering fixed-step implementation and display agreement at 64².',
		numericalCases: [
			{
				id: 'base-fixed-step-64',
				gridSize: 64,
				step: 2,
				modelTime: 0.001,
				error: numericalError,
				pass: true
			}
		],
		displayCases: [
			{ id: 'scientific-u', error: displayError, pass: true },
			{ id: 'luminous-publication', error: displayError, pass: true },
			{ id: 'ferroin-representative', error: displayError, pass: true },
			{ id: 'phase-spectrum', error: displayError, pass: true }
		],
		observables: [
			{
				name: 'fixture-observable',
				value: 0,
				tolerance: 0.01,
				samples: 1,
				pass: true
			}
		]
	};
}

describe('BZ V2 calibration manifest facade', () => {
	it('loads the exact generated public evidence manifest without fallback regimes', () => {
		expect(BZ_V2_CALIBRATION_MANIFEST).toMatchObject({
			schemaVersion: 2,
			engineVersion: 'bz-heun-five-point-v2',
			displayVersion: 'bz-display-linear-light-v2',
			search: { status: 'complete' }
		});
		expect(BZ_V2_CALIBRATION_MANIFEST.presets.map((preset) => preset.id)).toEqual([
			'classic-target-rings',
			'persistent-single-spiral',
			'spiral-garden'
		]);
		expect(BZ_V2_CALIBRATION_MANIFEST.calibrations).toHaveLength(3);
		expect(BZ_V2_CALIBRATION_MANIFEST.checkpoints).toHaveLength(3);
		expect(BZ_V2_CALIBRATION_MANIFEST.assets.length).toBeGreaterThanOrEqual(8);
		for (const preset of BZ_V2_CALIBRATION_MANIFEST.presets) {
			expect(preset.optionalCheckpoint).not.toBeNull();
			expect(preset.hero).toBe(preset.validationStatus === 'validated');
		}
		expect(BZ_V2_CALIBRATION_MANIFEST.articleClaims.validationBoundary).toMatch(/hero/iu);
		expect(bzV2PresetById('absent')).toBeNull();
		expect(bzV2CalibrationById('absent')).toBeNull();
		expect(bzV2CheckpointById('absent')).toBeNull();
		expect(bzV2DisplayProfileById('absent')).toBeNull();
	});

	it('returns a deeply frozen clone rather than trusting caller-owned objects', () => {
		const source = candidateManifest();
		const parsed = parseBZCalibrationManifestV2(source);
		expect(Object.isFrozen(parsed)).toBe(true);
		expect(Object.isFrozen(parsed.presets)).toBe(true);
		expect(Object.isFrozen(parsed.presets[0].setup)).toBe(true);
		source.presets[0].title = 'Mutated after validation';
		expect(parsed.presets[0].title).toBe('Fixture preset');
	});

	it('preserves and validates every renderer-affecting display-profile value', () => {
		const parsed = parseBZCalibrationManifestV2(candidateManifest());
		expect(parsed.displayProfiles[0]).toMatchObject({
			frontScale: 0.2,
			contrast: 1,
			gamma: 1,
			bloomThreshold: 0.52,
			bloomRadius: 0,
			ferroinMix: {
				recoveryWeight: 0.72,
				activatorLuminanceWeight: 0.28,
				gradientHighlightWeight: 0.4
			},
			luminousMix: { phaseWeight: 0.68, recoveryWeight: 0.32, frontWeight: 0.55 }
		});

		const invalid = candidateManifest();
		invalid.displayProfiles[0].bloomThreshold = 1.01;
		expect(() => parseBZCalibrationManifestV2(invalid)).toThrow(/bloom threshold/iu);
	});

	it('accepts only exact measured 30-second performance records', () => {
		const manifest = candidateManifest();
		manifest.performance = [
			{
				browser: 'Chromium test fixture',
				gpu: 'WebGL test fixture',
				stateGrid: 256,
				displayResolution: '1024×768 CSS pixels',
				durationSeconds: 30,
				medianFps: 59.5,
				medianStepsPerSecond: 180,
				telemetryHz: 3.3,
				fullStateReadbacks: 0,
				scientificTextureBytes: 2_097_152,
				displayTextureBytes: 4_194_304,
				notes: 'Measured fixture; not publication evidence.'
			}
		];
		const parsed = parseBZCalibrationManifestV2(manifest);
		expect(parsed.performance[0]).toEqual(manifest.performance[0]);

		const extraField = candidateManifest();
		extraField.performance = [{ ...manifest.performance[0], invented: true }];
		expect(() => parseBZCalibrationManifestV2(extraField)).toThrow(/schema/iu);

		const tooShort = candidateManifest();
		tooShort.performance = [{ ...manifest.performance[0], durationSeconds: 29.999 }];
		expect(() => parseBZCalibrationManifestV2(tooShort)).toThrow(/at least 30/iu);
	});

	it('rejects duplicate identities and inconsistent cross-references', () => {
		const duplicate = candidateManifest();
		duplicate.displayProfiles.push({ ...duplicate.displayProfiles[0] });
		expect(() => parseBZCalibrationManifestV2(duplicate)).toThrow(/duplicate id/iu);

		const inconsistent = candidateManifest();
		inconsistent.calibrations[0].setup = {
			...inconsistent.calibrations[0].setup,
			seed: 'a-competing-seed'
		};
		expect(() => parseBZCalibrationManifestV2(inconsistent)).toThrow(
			/duplicates calibration values inconsistently/iu
		);
	});

	it('does not permit a status-only promotion to validated', () => {
		const manifest = candidateManifest();
		manifest.search.status = 'complete';
		manifest.presets[0].validationStatus = 'validated';
		manifest.presets[0].validationSummary.status = 'validated';
		manifest.calibrations[0].status = 'validated';
		expect(() => parseBZCalibrationManifestV2(manifest)).toThrow(/cannot be promoted/iu);
	});

	it('requires the public checkpoint record to carry the binary provenance contract', () => {
		const manifest = candidateManifest();
		const setup = manifest.presets[0].setup;
		const descriptor = {
			id: 'fixture-checkpoint',
			version: 1,
			path: '/data/bz/checkpoints/fixture-checkpoint.bzcp',
			encoding: 'bzcp-f32le-v1',
			losslessForStoredRepresentation: true,
			width: setup.gridSize,
			height: setup.gridSize,
			modelStep: 2,
			modelTime: 2 * (setup.timestep as number),
			byteLength: 1_024,
			sha256: ZERO_SHA256,
			fieldSha256F64Reference: ZERO_SHA256,
			browserStateSha256: ZERO_SHA256,
			setupChecksum: ZERO_SHA256,
			interventionLogChecksum: ZERO_SHA256,
			engineVersion: 'bz-heun-five-point-v2',
			generatedBy: 'manifest.test.ts',
			generatedAt: '2026-08-08T00:00:00.000Z',
			sourcePresetId: 'fixture-preset',
			setup,
			seed: setup.seed,
			interventions: [],
			modelVersion: setup.modelVersion,
			equationsId: setup.equationsId,
			validationRecordId: 'fixture-calibration'
		};
		manifest.checkpoints = [descriptor];
		manifest.presets[0].warmupPolicy = {
			kind: 'checkpoint',
			checkpointId: descriptor.id,
			modelTime: descriptor.modelTime,
			genesisAvailable: true
		};
		manifest.presets[0].optionalCheckpoint = descriptor;
		const parsed = parseBZCalibrationManifestV2(manifest);
		expect(parsed.checkpoints[0]).toMatchObject({
			sourcePresetId: 'fixture-preset',
			validationRecordId: 'fixture-calibration',
			browserStateSha256: ZERO_SHA256,
			setup,
			interventions: []
		});

		const missingBrowserChecksum = candidateManifest();
		const invalidDescriptor = { ...descriptor, browserStateSha256: 'not-a-checksum' };
		missingBrowserChecksum.checkpoints = [invalidDescriptor];
		missingBrowserChecksum.presets[0].warmupPolicy = {
			kind: 'checkpoint',
			checkpointId: invalidDescriptor.id,
			modelTime: invalidDescriptor.modelTime,
			genesisAvailable: true
		};
		missingBrowserChecksum.presets[0].optionalCheckpoint = invalidDescriptor;
		expect(() => parseBZCalibrationManifestV2(missingBrowserChecksum)).toThrow(
			/browser Float32 checksum/iu
		);
	});

	it('accepts a non-hero validation only when every declared evidence gate passes', () => {
		const manifest = candidateManifest();
		manifest.search.status = 'complete';
		manifest.presets[0].validationStatus = 'validated';
		manifest.presets[0].validationSummary.status = 'validated';
		manifest.presets[0].validationSummary.passedCriteria = ['finite-state'];
		manifest.calibrations[0].status = 'validated';
		manifest.calibrations[0].criteria = [
			{
				id: 'finite-state',
				kind: 'validation',
				description: 'The declared observation window remained finite.',
				pass: true,
				evidence: { finite: true }
			}
		];
		manifest.calibrations[0].convergence = [
			{
				comparison: 'fixture-grid-pair',
				reference: 'fixture-reference',
				observable: 'fixture-observable',
				relativeDifference: 0,
				tolerance: 0.01,
				pass: true
			}
		];
		manifest.calibrations[0].cpuGpuParity = measuredParity();
		manifest.calibrations[0].displayIndependence.pass = true;
		const parsed = parseBZCalibrationManifestV2(manifest);
		expect(parsed.presets[0].validationStatus).toBe('validated');
	});

	it('requires a checkpoint and asset before a validated preset can become a hero', () => {
		const manifest = candidateManifest();
		manifest.search.status = 'complete';
		manifest.presets[0].validationStatus = 'validated';
		manifest.presets[0].validationSummary.status = 'validated';
		manifest.presets[0].hero = true;
		manifest.calibrations[0].status = 'validated';
		manifest.calibrations[0].criteria = [
			{
				id: 'finite-state',
				kind: 'validation',
				description: 'Finite state.',
				pass: true,
				evidence: {}
			}
		];
		manifest.calibrations[0].convergence = [
			{
				comparison: 'grid pair',
				reference: 'reference',
				observable: 'observable',
				relativeDifference: 0,
				tolerance: 0.01,
				pass: true
			}
		];
		manifest.calibrations[0].cpuGpuParity = measuredParity();
		manifest.calibrations[0].displayIndependence.pass = true;
		expect(() => parseBZCalibrationManifestV2(manifest)).toThrow(/hero checkpoint requirements/iu);
	});

	it('requires the exact authenticated checkpoint poster for every validated hero', () => {
		const manifest = publicFoundation();
		const hero = manifest.presets.find((preset) => preset.hero);
		expect(hero).toBeDefined();
		manifest.assets = manifest.assets.filter(
			(asset) => asset.id !== `bz-v2-${hero?.id}-checkpoint-poster`
		);
		expect(() => parseBZCalibrationManifestV2(manifest)).toThrow(
			/exact authenticated checkpoint poster/iu
		);
	});

	it('requires Classic Target Rings to disclose its repeated source semantics', () => {
		const manifest = candidateManifest();
		manifest.presets[0].id = 'classic-target-rings';
		manifest.calibrations[0].presetId = 'classic-target-rings';
		expect(() => parseBZCalibrationManifestV2(manifest)).toThrow(/repeated external source/iu);
	});

	it('rejects undeclared top-level fields instead of silently accepting another truth', () => {
		const manifest = publicFoundation();
		manifest.competingPresets = [];
		expect(() => parseBZCalibrationManifestV2(manifest)).toThrow(
			/does not match the V2 manifest schema/iu
		);
	});
});
