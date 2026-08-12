export { generateShell, generateShellAtAge } from './generate';
export { ringPrefixAtAge, ringPositionPrefix, visibleRingCountAtAge } from './history';
export { buildAnalyticGrowthFrames } from './analytic-engine';
export { buildAccretionGrowthFrames } from './accretion-engine';
export { buildRingHistory, apertureParametersFromRecipe } from './ring-builder';
export {
	BALANCED_RESOLUTION,
	FIXED_TEST_RESOLUTION,
	PREVIEW_RESOLUTION,
	type GenerateOptions,
	type GenerationDiagnostics,
	type MeshResolution,
	type RingHistory,
	type RingPrefix,
	type ShellClassification,
	type ShellEngineInput,
	type ShellGenerationResult,
	type ShellIntersectionAssessment
} from './types';
export type { MeshPacket, MeshDiagnostics, TopologyReport, Bounds3 } from '../mesh/types';
