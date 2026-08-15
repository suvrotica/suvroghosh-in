export const RAY_MARCHING_STAGE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type RayMarchingStageId = (typeof RAY_MARCHING_STAGE_IDS)[number];

export type RayMarchingExperienceMode = 'explore' | 'build';

export const RAY_MARCHING_DEBUG_VIEWS = [
	'beauty',
	'march-cost',
	'normals',
	'distance-bands'
] as const;

export type RayMarchingDebugView = (typeof RAY_MARCHING_DEBUG_VIEWS)[number];

export const RAY_MARCHING_PALETTES = ['cathedral', 'blue-hour', 'amber-archive'] as const;

export type RayMarchingPalette = (typeof RAY_MARCHING_PALETTES)[number];

export const RAY_MARCHING_QUALITY_TIERS = ['high', 'balanced', 'saver'] as const;

export type RayMarchingQualityTier = (typeof RAY_MARCHING_QUALITY_TIERS)[number];

export type RayMarchingQualityChoice = 'auto' | RayMarchingQualityTier;

export type RayMarchingCamera = Readonly<{
	yaw: number;
	pitch: number;
}>;

/**
 * The stage content lives in stages.ts. This shared shape lets the host and tests consume that
 * content without coupling the pure state helpers to the authored explanations.
 */
export type RayMarchingStageDefinition = Readonly<{
	id: RayMarchingStageId;
	title: string;
	summary: string;
	explanation: string;
	sourceFilename: string;
	sourceExcerpt: string;
}>;

export type RayMarchingSceneSettings = Readonly<{
	stage: RayMarchingStageId;
	mode: RayMarchingExperienceMode;
	camera: RayMarchingCamera;
	palette: RayMarchingPalette;
	quality: RayMarchingQualityChoice;
	debugView: RayMarchingDebugView;
	fogAmount: number;
	pulseSpeed: number;
	focalLength: number;
}>;

export type RayMarchingExperienceState = RayMarchingSceneSettings &
	Readonly<{
		playing: boolean;
		/** Incrementing this asks the renderer clock to return to deterministic time zero. */
		elapsedRevision: number;
		/** Incrementing this clears a pulse without serialising its age. */
		pulseRevision: number;
	}>;

export type RayMarchingShareState = Readonly<{
	scene: 'cathedral';
	stage: RayMarchingStageId;
	debugView: RayMarchingDebugView;
	palette: RayMarchingPalette;
	yaw: number;
	pitch: number;
}>;
