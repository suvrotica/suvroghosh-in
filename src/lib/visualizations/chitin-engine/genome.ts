import { normalizeSeed } from './seed';
import {
	CHITIN_SCHEMA_VERSION,
	type BodyPlanFamily,
	type CreatureGenome,
	type Discipline,
	type ExhibitState,
	type EyeLayout,
	type GaitFamily,
	type GenomeIssue,
	type GenomeValidationResult,
	type MaterialId,
	type PaletteId,
	type PresetId,
	type QualityLevel,
	type TerminalModule,
	type ViewMode,
	type WingMode,
	type WorldId
} from './types';

export type NumericGenomeKey = Exclude<
	{
		[K in keyof CreatureGenome]: CreatureGenome[K] extends number ? K : never;
	}[keyof CreatureGenome],
	'schemaVersion'
>;

export type NumericRange = Readonly<{
	min: number;
	max: number;
	step: number;
	integer?: boolean;
	label: string;
}>;

export const NUMERIC_RANGES = Object.freeze({
	worldInfluence: { min: 0, max: 1, step: 0.01, label: 'World influence' },
	bodySegments: { min: 4, max: 28, step: 1, integer: true, label: 'Body segments' },
	bodyRegions: { min: 2, max: 5, step: 1, integer: true, label: 'Body regions' },
	bodyLength: { min: 0.45, max: 1.15, step: 0.01, label: 'Body length' },
	bodyWidth: { min: 0.14, max: 0.62, step: 0.01, label: 'Body width' },
	headScale: { min: 0.42, max: 1.65, step: 0.01, label: 'Head scale' },
	centralScale: { min: 0.55, max: 1.55, step: 0.01, label: 'Central scale' },
	terminalScale: { min: 0.25, max: 1.4, step: 0.01, label: 'Terminal scale' },
	axisCurvature: { min: -0.45, max: 0.45, step: 0.01, label: 'Axis curvature' },
	lateralBend: { min: -0.35, max: 0.35, step: 0.01, label: 'Lateral bend' },
	dorsalArch: { min: -0.2, max: 0.35, step: 0.01, label: 'Dorsal arch' },
	taper: { min: 0, max: 0.8, step: 0.01, label: 'Taper' },
	compression: { min: 0, max: 0.55, step: 0.01, label: 'Compression' },
	segmentOverlap: { min: 0.02, max: 0.55, step: 0.01, label: 'Plate overlap' },
	membraneExposure: { min: 0.02, max: 0.45, step: 0.01, label: 'Membrane exposure' },
	symmetry: { min: 0, max: 1, step: 0.01, label: 'Symmetry' },
	asymmetry: { min: 0, max: 0.55, step: 0.01, label: 'Asymmetry' },
	shellExponent: { min: 1.15, max: 6, step: 0.05, label: 'Shell exponent' },
	lateralFlare: { min: 0, max: 0.55, step: 0.01, label: 'Lateral flare' },
	dorsalRidge: { min: 0, max: 1, step: 0.01, label: 'Dorsal ridge' },
	ridgeSharpness: { min: 0, max: 1, step: 0.01, label: 'Ridge sharpness' },
	serration: { min: 0, max: 0.55, step: 0.01, label: 'Serration' },
	spineDensity: { min: 0, max: 0.8, step: 0.01, label: 'Spine density' },
	walkingLegPairs: { min: 2, max: 18, step: 1, integer: true, label: 'Walking-leg pairs' },
	graspingPairs: { min: 0, max: 2, step: 1, integer: true, label: 'Grasping pairs' },
	legBones: { min: 2, max: 5, step: 1, integer: true, label: 'Bones per leg' },
	legLength: { min: 0.24, max: 1.15, step: 0.01, label: 'Leg length' },
	legThickness: { min: 0.05, max: 0.34, step: 0.01, label: 'Leg thickness' },
	stanceWidth: { min: 0.25, max: 1.15, step: 0.01, label: 'Stance width' },
	clawCount: { min: 0, max: 4, step: 1, integer: true, label: 'Claws' },
	eyeCount: { min: 0, max: 18, step: 1, integer: true, label: 'Visible eyes' },
	eyeScale: { min: 0.1, max: 0.75, step: 0.01, label: 'Eye scale' },
	eyeAsymmetry: { min: 0, max: 0.7, step: 0.01, label: 'Eye asymmetry' },
	antennaCount: { min: 0, max: 6, step: 1, integer: true, label: 'Sensory filaments' },
	antennaLength: { min: 0.12, max: 1.2, step: 0.01, label: 'Filament length' },
	palpLength: { min: 0, max: 0.75, step: 0.01, label: 'Palp length' },
	cellularScale: { min: 2.5, max: 18, step: 0.1, label: 'Cellular scale' },
	cellularContrast: { min: 0, max: 1, step: 0.01, label: 'Cellular contrast' },
	poreDensity: { min: 0, max: 0.8, step: 0.01, label: 'Pore density' },
	bristleDensity: { min: 0, max: 0.85, step: 0.01, label: 'Bristle density' },
	corrosion: { min: 0, max: 1, step: 0.01, label: 'Corrosion' },
	iridescence: { min: 0, max: 1, step: 0.01, label: 'Iridescence' },
	roughness: { min: 0.05, max: 0.95, step: 0.01, label: 'Roughness' },
	fluorescence: { min: 0, max: 1, step: 0.01, label: 'Fluorescence' },
	membraneTranslucency: { min: 0.05, max: 0.9, step: 0.01, label: 'Membrane translucency' },
	eyeEmission: { min: 0, max: 1, step: 0.01, label: 'Eye emission' },
	seamEmission: { min: 0, max: 1, step: 0.01, label: 'Seam emission' },
	cadence: { min: 0.04, max: 1.4, step: 0.01, label: 'Cadence' },
	stanceRatio: { min: 0.42, max: 0.88, step: 0.01, label: 'Stance duration' },
	swingHeight: { min: 0.02, max: 0.4, step: 0.01, label: 'Swing height' },
	bodyBob: { min: 0, max: 0.1, step: 0.002, label: 'Body bob' },
	idleMotion: { min: 0, max: 0.5, step: 0.01, label: 'Idle motion' },
	appendageLag: { min: 0.05, max: 0.98, step: 0.01, label: 'Appendage lag' },
	startle: { min: 0, max: 1, step: 0.01, label: 'Startle' },
	threatIntensity: { min: 0, max: 1, step: 0.01, label: 'Threat intensity' }
} satisfies Readonly<Record<NumericGenomeKey, NumericRange>>);

export const DEFAULT_GENOME: CreatureGenome = Object.freeze({
	schemaVersion: CHITIN_SCHEMA_VERSION,
	seed: 'glassback-1847',
	preset: 'glassback-knifemite',
	discipline: 'xeno-license',
	bodyPlan: 'xeno-bilateral',
	world: 'terminator-line',
	worldInfluence: 0.72,
	bodySegments: 11,
	bodyRegions: 3,
	bodyLength: 0.78,
	bodyWidth: 0.28,
	headScale: 0.82,
	centralScale: 1,
	terminalScale: 0.58,
	axisCurvature: 0.14,
	lateralBend: -0.04,
	dorsalArch: 0.1,
	taper: 0.34,
	compression: 0.12,
	segmentOverlap: 0.28,
	membraneExposure: 0.16,
	symmetry: 0.9,
	asymmetry: 0.08,
	shellExponent: 3.1,
	lateralFlare: 0.18,
	dorsalRidge: 0.46,
	ridgeSharpness: 0.58,
	serration: 0.16,
	spineDensity: 0.24,
	walkingLegPairs: 4,
	graspingPairs: 1,
	legBones: 4,
	legLength: 0.68,
	legThickness: 0.14,
	stanceWidth: 0.62,
	clawCount: 2,
	eyeCount: 7,
	eyeScale: 0.34,
	eyeAsymmetry: 0.18,
	eyeLayout: 'asymmetric-cluster',
	antennaCount: 2,
	antennaLength: 0.64,
	palpLength: 0.28,
	wingMode: 'none',
	terminalModule: 'split-cerci',
	material: 'obsidian-iridescent',
	cellularScale: 8.5,
	cellularContrast: 0.58,
	poreDensity: 0.24,
	bristleDensity: 0.18,
	corrosion: 0.08,
	iridescence: 0.76,
	roughness: 0.34,
	fluorescence: 0.28,
	membraneTranslucency: 0.42,
	palette: 'ultraviolet-petrol',
	eyeEmission: 0.62,
	seamEmission: 0.38,
	gait: 'stalk',
	cadence: 0.22,
	stanceRatio: 0.72,
	swingHeight: 0.16,
	bodyBob: 0.025,
	idleMotion: 0.1,
	appendageLag: 0.62,
	startle: 0.54,
	threatIntensity: 0.68
});

export const DEFAULT_EXHIBIT_STATE: ExhibitState = Object.freeze({
	genome: DEFAULT_GENOME,
	view: 'specimen',
	quality: 'auto',
	paused: false,
	cameraYaw: -0.1,
	cameraPitch: 0.12,
	cameraRoll: -0.05,
	scannerIntensity: 0.72,
	bloom: 0.42,
	grain: 0.035,
	chromaticFault: 0.025
});

const BODY_PLANS: readonly BodyPlanFamily[] = [
	'terrestrial-insect',
	'terrestrial-arachnid',
	'myriapod',
	'armoured-crawler',
	'xeno-bilateral',
	'xeno-radial',
	'unclassified'
];
const DISCIPLINES: readonly Discipline[] = ['terrestrial-discipline', 'xeno-license'];
const WORLDS: readonly WorldId[] = [
	'terminator-line',
	'basalt-gravity-well',
	'methane-twilight',
	'brine-under-ice',
	'orbital-ruin',
	'ashfall-terrarium',
	'monsoon-megacity-2097',
	'red-dune-cathedral'
];
const PRESETS: readonly PresetId[] = [
	'glassback-knifemite',
	'reactor-mantis',
	'basalt-widow',
	'brine-cathedral-centipede',
	'orbital-hull-mite',
	'monsoon-drain-oracle',
	'terminator-needlewalker',
	'ashfall-scarab',
	'methane-lantern-crawler',
	'red-dune-whipbeast',
	'frostglass-plate-crawler',
	'unfiled-specimen'
];
const EYE_LAYOUTS: readonly EyeLayout[] = [
	'frontal-pair',
	'lateral-compound',
	'clustered-lenses',
	'dorsal-ocelli',
	'asymmetric-cluster',
	'annular',
	'sensory-pits',
	'none'
];
const WING_MODES: readonly WingMode[] = ['none', 'folded', 'half-open', 'display', 'dormant'];
const TERMINAL_MODULES: readonly TerminalModule[] = [
	'none',
	'split-cerci',
	'tail',
	'fan',
	'stinger-form',
	'lure'
];
const MATERIALS: readonly MaterialId[] = [
	'obsidian-iridescent',
	'iridescent-chitin',
	'oxidized-metal',
	'ceramic-bone',
	'translucent-brine',
	'velvet-black',
	'reactor-enamel'
];
const PALETTES: readonly PaletteId[] = [
	'ultraviolet-petrol',
	'reactor-acid',
	'cobalt-velvet',
	'brine-frost',
	'orbital-cyan',
	'monsoon-tram',
	'dune-gold',
	'ash-ember',
	'methane-lantern',
	'high-contrast'
];
const GAITS: readonly GaitFamily[] = [
	'tripod',
	'arachnoid-scuttle',
	'wave',
	'stalk',
	'skitter',
	'clamp-crawl',
	'dormant'
];
export const VIEW_MODES: readonly ViewMode[] = [
	'specimen',
	'anatomy',
	'gait',
	'surface',
	'silhouette',
	'fluorescence',
	'depth'
];
export const QUALITY_LEVELS: readonly QualityLevel[] = ['auto', 'low', 'medium', 'high'];

function recordFrom(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function enumValue<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
	field: string,
	issues: GenomeIssue[]
): T {
	if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
	if (value !== undefined) issues.push({ field, message: `Unknown value; restored ${fallback}.` });
	return fallback;
}

function numericValue(
	value: unknown,
	key: NumericGenomeKey,
	fallback: number,
	issues: GenomeIssue[]
): number {
	const range: NumericRange = NUMERIC_RANGES[key];
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		if (value !== undefined) issues.push({ field: key, message: 'Expected a finite number.' });
		return fallback;
	}
	const rounded = range.integer ? Math.round(value) : value;
	const clamped = Math.max(range.min, Math.min(range.max, rounded));
	if (clamped !== value) {
		issues.push({ field: key, message: `Clamped to ${clamped}.` });
	}
	return clamped;
}

function terrestrialRepairs(genome: CreatureGenome, issues: GenomeIssue[]): CreatureGenome {
	let repaired = genome;
	if (genome.discipline === 'terrestrial-discipline') {
		if (
			!['terrestrial-insect', 'terrestrial-arachnid', 'myriapod', 'armoured-crawler'].includes(
				genome.bodyPlan
			)
		) {
			repaired = { ...repaired, bodyPlan: 'terrestrial-insect' };
			issues.push({
				field: 'bodyPlan',
				message: 'Terrestrial discipline restored an Earth-grounded family.'
			});
		}
	}

	if (repaired.bodyPlan === 'terrestrial-insect') {
		if (repaired.walkingLegPairs !== 3)
			issues.push({
				field: 'walkingLegPairs',
				message: 'Adult insect discipline uses three thoracic walking-leg pairs.'
			});
		repaired = {
			...repaired,
			walkingLegPairs: 3,
			antennaCount: Math.min(2, Math.max(2, repaired.antennaCount))
		};
	} else if (repaired.bodyPlan === 'terrestrial-arachnid') {
		if (
			repaired.walkingLegPairs !== 4 ||
			repaired.antennaCount !== 0 ||
			repaired.wingMode !== 'none'
		) {
			issues.push({
				field: 'bodyPlan',
				message:
					'Arachnid discipline restored four walking pairs, no ordinary antennae, and no wings.'
			});
		}
		repaired = {
			...repaired,
			walkingLegPairs: 4,
			antennaCount: 0,
			wingMode: 'none',
			graspingPairs: Math.min(1, Math.max(repaired.graspingPairs, repaired.palpLength > 0 ? 1 : 0))
		};
	} else if (repaired.bodyPlan === 'myriapod') {
		repaired = {
			...repaired,
			walkingLegPairs: Math.max(8, repaired.walkingLegPairs),
			bodySegments: Math.max(12, repaired.bodySegments),
			legBones: Math.min(3, repaired.legBones),
			wingMode: 'none'
		};
	} else if (repaired.bodyPlan === 'armoured-crawler') {
		repaired = {
			...repaired,
			walkingLegPairs: Math.max(6, repaired.walkingLegPairs),
			legBones: Math.min(3, repaired.legBones),
			wingMode: 'none'
		};
	}

	if (repaired.eyeCount === 0 && repaired.eyeLayout !== 'none') {
		repaired = { ...repaired, eyeLayout: 'none' };
	}
	if (repaired.eyeLayout === 'none' && repaired.eyeCount !== 0) {
		repaired = { ...repaired, eyeCount: 0 };
	}
	if (
		repaired.wingMode !== 'none' &&
		!['terrestrial-insect', 'xeno-bilateral', 'unclassified'].includes(repaired.bodyPlan)
	) {
		repaired = { ...repaired, wingMode: 'none' };
		issues.push({
			field: 'wingMode',
			message: 'Removed wings because this body graph has no compatible root.'
		});
	}
	return repaired;
}

export function validateGenome(
	value: unknown,
	fallback: CreatureGenome = DEFAULT_GENOME
): GenomeValidationResult {
	const source = recordFrom(value);
	const issues: GenomeIssue[] = [];
	if (source.schemaVersion !== undefined && source.schemaVersion !== CHITIN_SCHEMA_VERSION) {
		issues.push({
			field: 'schemaVersion',
			message: `Unsupported genome schema; restored version ${CHITIN_SCHEMA_VERSION}.`
		});
	}

	const numeric = <K extends NumericGenomeKey>(key: K): number =>
		numericValue(source[key], key, fallback[key], issues);
	let genome: CreatureGenome = {
		schemaVersion: CHITIN_SCHEMA_VERSION,
		seed: normalizeSeed(source.seed, fallback.seed),
		preset: enumValue(source.preset, PRESETS, fallback.preset, 'preset', issues),
		discipline: enumValue(
			source.discipline,
			DISCIPLINES,
			fallback.discipline,
			'discipline',
			issues
		),
		bodyPlan: enumValue(source.bodyPlan, BODY_PLANS, fallback.bodyPlan, 'bodyPlan', issues),
		world: enumValue(source.world, WORLDS, fallback.world, 'world', issues),
		worldInfluence: numeric('worldInfluence'),
		bodySegments: numeric('bodySegments'),
		bodyRegions: numeric('bodyRegions'),
		bodyLength: numeric('bodyLength'),
		bodyWidth: numeric('bodyWidth'),
		headScale: numeric('headScale'),
		centralScale: numeric('centralScale'),
		terminalScale: numeric('terminalScale'),
		axisCurvature: numeric('axisCurvature'),
		lateralBend: numeric('lateralBend'),
		dorsalArch: numeric('dorsalArch'),
		taper: numeric('taper'),
		compression: numeric('compression'),
		segmentOverlap: numeric('segmentOverlap'),
		membraneExposure: numeric('membraneExposure'),
		symmetry: numeric('symmetry'),
		asymmetry: numeric('asymmetry'),
		shellExponent: numeric('shellExponent'),
		lateralFlare: numeric('lateralFlare'),
		dorsalRidge: numeric('dorsalRidge'),
		ridgeSharpness: numeric('ridgeSharpness'),
		serration: numeric('serration'),
		spineDensity: numeric('spineDensity'),
		walkingLegPairs: numeric('walkingLegPairs'),
		graspingPairs: numeric('graspingPairs'),
		legBones: numeric('legBones'),
		legLength: numeric('legLength'),
		legThickness: numeric('legThickness'),
		stanceWidth: numeric('stanceWidth'),
		clawCount: numeric('clawCount'),
		eyeCount: numeric('eyeCount'),
		eyeScale: numeric('eyeScale'),
		eyeAsymmetry: numeric('eyeAsymmetry'),
		eyeLayout: enumValue(source.eyeLayout, EYE_LAYOUTS, fallback.eyeLayout, 'eyeLayout', issues),
		antennaCount: numeric('antennaCount'),
		antennaLength: numeric('antennaLength'),
		palpLength: numeric('palpLength'),
		wingMode: enumValue(source.wingMode, WING_MODES, fallback.wingMode, 'wingMode', issues),
		terminalModule: enumValue(
			source.terminalModule,
			TERMINAL_MODULES,
			fallback.terminalModule,
			'terminalModule',
			issues
		),
		material: enumValue(source.material, MATERIALS, fallback.material, 'material', issues),
		cellularScale: numeric('cellularScale'),
		cellularContrast: numeric('cellularContrast'),
		poreDensity: numeric('poreDensity'),
		bristleDensity: numeric('bristleDensity'),
		corrosion: numeric('corrosion'),
		iridescence: numeric('iridescence'),
		roughness: numeric('roughness'),
		fluorescence: numeric('fluorescence'),
		membraneTranslucency: numeric('membraneTranslucency'),
		palette: enumValue(source.palette, PALETTES, fallback.palette, 'palette', issues),
		eyeEmission: numeric('eyeEmission'),
		seamEmission: numeric('seamEmission'),
		gait: enumValue(source.gait, GAITS, fallback.gait, 'gait', issues),
		cadence: numeric('cadence'),
		stanceRatio: numeric('stanceRatio'),
		swingHeight: numeric('swingHeight'),
		bodyBob: numeric('bodyBob'),
		idleMotion: numeric('idleMotion'),
		appendageLag: numeric('appendageLag'),
		startle: numeric('startle'),
		threatIntensity: numeric('threatIntensity')
	};
	genome = terrestrialRepairs(genome, issues);
	return { genome: Object.freeze(genome), issues };
}

export function normalizeGenome(
	value: unknown,
	fallback: CreatureGenome = DEFAULT_GENOME
): CreatureGenome {
	return validateGenome(value, fallback).genome;
}

export function normalizeExhibitState(
	value: Partial<ExhibitState> & { genome?: unknown },
	fallback: ExhibitState = DEFAULT_EXHIBIT_STATE
): ExhibitState {
	const view = VIEW_MODES.includes(value.view as ViewMode)
		? (value.view as ViewMode)
		: fallback.view;
	const quality = QUALITY_LEVELS.includes(value.quality as QualityLevel)
		? (value.quality as QualityLevel)
		: fallback.quality;
	const finite = (candidate: unknown, backup: number, min: number, max: number) =>
		typeof candidate === 'number' && Number.isFinite(candidate)
			? Math.max(min, Math.min(max, candidate))
			: backup;
	return Object.freeze({
		genome: normalizeGenome(value.genome ?? fallback.genome, fallback.genome),
		view,
		quality,
		paused: typeof value.paused === 'boolean' ? value.paused : fallback.paused,
		cameraYaw: finite(value.cameraYaw, fallback.cameraYaw, -0.35, 0.35),
		cameraPitch: finite(value.cameraPitch, fallback.cameraPitch, -0.22, 0.22),
		cameraRoll: finite(value.cameraRoll, fallback.cameraRoll, -0.18, 0.18),
		scannerIntensity: finite(value.scannerIntensity, fallback.scannerIntensity, 0, 1),
		bloom: finite(value.bloom, fallback.bloom, 0, 0.8),
		grain: finite(value.grain, fallback.grain, 0, 0.12),
		chromaticFault: finite(value.chromaticFault, fallback.chromaticFault, 0, 0.08)
	});
}

export type GenomeFile = Readonly<{
	format: 'suvro-chitin-genome';
	version: 1;
	genome: CreatureGenome;
}>;

export function serializeGenome(genome: CreatureGenome): string {
	const payload: GenomeFile = {
		format: 'suvro-chitin-genome',
		version: 1,
		genome: normalizeGenome(genome)
	};
	return JSON.stringify(payload, null, 2);
}

export function parseGenomeJson(text: string): GenomeValidationResult {
	if (text.length > 64_000) {
		throw new Error('Genome JSON exceeds the 64 kB import limit.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		throw new Error('Genome JSON is malformed.');
	}
	const root = recordFrom(parsed);
	if (root.format !== 'suvro-chitin-genome' || root.version !== 1) {
		throw new Error('Unsupported Chitin Engine genome format or version.');
	}
	const nested = recordFrom(root.genome);
	if (nested.schemaVersion !== CHITIN_SCHEMA_VERSION) {
		throw new Error(`Unsupported genome schema version; expected ${CHITIN_SCHEMA_VERSION}.`);
	}
	return validateGenome(nested);
}
