import type {
	BZCalibrationManifestV2,
	BZPresetV2,
	BZV2HeroId,
	BZV2Layer
} from '$lib/visualizations/bz/v2-types';
import type {
	BZFieldMetrics,
	BZIntervention,
	BZPalette,
	BZSetup,
	BZViewMode
} from '$lib/visualizations/bz/types';

export type BZV2RunOrigin = 'checkpoint' | 'genesis';
export type BZV2SessionEngine = 'gpu-f16' | 'gpu-f32' | 'cpu-f64';

export interface BZV2LiveFrameSummary {
	readonly step: number;
	readonly modelTime: number;
	readonly engine: BZV2SessionEngine;
	readonly metrics: Readonly<BZFieldMetrics>;
}

/**
 * Small, read-only hand-off between Gallery, Laboratory and Proof. It deliberately
 * omits the full numerical arrays so a normal UI update cannot become a field readback.
 */
export interface BZV2SharedSessionSnapshot {
	readonly heroId: BZV2HeroId;
	readonly presetId: string | null;
	readonly validationStatus: BZPresetV2['validationStatus'] | 'missing';
	readonly runOrigin: BZV2RunOrigin;
	readonly running: boolean;
	readonly ready: boolean;
	readonly busy: boolean;
	readonly failure: boolean;
	readonly latestFrame: Readonly<BZV2LiveFrameSummary> | null;
}

export interface BZV2SessionFrameLike {
	readonly step: number;
	readonly modelTime: number;
	readonly engine: BZV2SessionEngine;
	readonly metrics: Readonly<BZFieldMetrics>;
}

/** Replay/export hand-off. A full field is available only through the separate explicit snapshot action. */
export interface BZV2ReproducibleRunState {
	readonly title: string;
	readonly presetId: BZV2HeroId;
	readonly calibrationRecordId: string;
	readonly checkpointId: string | null;
	readonly runOrigin: BZV2RunOrigin;
	readonly setup: Readonly<BZSetup>;
	readonly step: number;
	readonly interventions: readonly Readonly<BZIntervention>[];
	readonly display: {
		readonly view: BZViewMode;
		readonly palette: BZPalette;
		readonly profileId: string;
	};
}

export function createBZV2SharedSessionSnapshot(input: {
	readonly heroId: BZV2HeroId;
	readonly preset: Readonly<BZPresetV2> | null;
	readonly runOrigin: BZV2RunOrigin;
	readonly running: boolean;
	readonly ready: boolean;
	readonly busy: boolean;
	readonly failure: boolean;
	readonly latestFrame: Readonly<BZV2SessionFrameLike> | null;
}): BZV2SharedSessionSnapshot {
	return {
		heroId: input.heroId,
		presetId: input.preset?.id ?? null,
		validationStatus: input.preset?.validationStatus ?? 'missing',
		runOrigin: input.runOrigin,
		running: input.running,
		ready: input.ready,
		busy: input.busy,
		failure: input.failure,
		latestFrame: input.latestFrame
			? {
					step: input.latestFrame.step,
					modelTime: input.latestFrame.modelTime,
					engine: input.latestFrame.engine,
					metrics: input.latestFrame.metrics
				}
			: null
	};
}

export interface BZV2HeroSlot {
	readonly id: BZV2HeroId;
	readonly title: string;
	readonly shortTitle: string;
	readonly criterion: string;
}

/** The public Gallery has exactly these three slots, in this stable order. */
export const BZ_V2_HERO_SLOTS: readonly BZV2HeroSlot[] = Object.freeze([
	{
		id: 'classic-target-rings',
		title: 'Classic Target Rings',
		shortTitle: 'Target rings',
		criterion: 'Requires a declared repeating source and at least three measured outward fronts.'
	},
	{
		id: 'persistent-single-spiral',
		title: 'Persistent Single Spiral',
		shortTitle: 'Single spiral',
		criterion: 'Requires one tracked phase core and at least three measured rotations.'
	},
	{
		id: 'spiral-garden',
		title: 'Spiral Garden',
		shortTitle: 'Spiral garden',
		criterion:
			'Requires at least three persistent, wall-clear phase cores over the declared window.'
	}
]);

export const BZ_V2_LAYERS: readonly {
	readonly id: BZV2Layer;
	readonly label: string;
	readonly description: string;
}[] = Object.freeze([
	{
		id: 'gallery',
		label: 'Gallery',
		description: 'Three calibrated patterns and compact playback.'
	},
	{
		id: 'laboratory',
		label: 'Laboratory',
		description: 'Parameters, instruments and field views.'
	},
	{ id: 'proof', label: 'Proof', description: 'Validation, provenance and numerical evidence.' }
]);

export function bzV2HeroPreset(
	manifest: Readonly<BZCalibrationManifestV2>,
	id: BZV2HeroId
): Readonly<BZPresetV2> | null {
	return manifest.presets.find((preset) => preset.hero && preset.id === id) ?? null;
}

export function hasCompleteValidatedBZV2HeroSet(
	manifest: Readonly<BZCalibrationManifestV2>
): boolean {
	return BZ_V2_HERO_SLOTS.every(
		(slot) => bzV2HeroPreset(manifest, slot.id)?.validationStatus === 'validated'
	);
}

export function bzV2HeroStatusLabel(preset: Readonly<BZPresetV2> | null): string {
	if (!preset) return 'Awaiting manifest record';
	if (preset.validationStatus === 'validated') return 'Validated';
	if (preset.validationStatus === 'rejected') return 'Rejected';
	return 'Candidate';
}
