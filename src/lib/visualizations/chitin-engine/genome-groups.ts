import type { CreatureGenome, GenomeGroup, MutationLocks } from './types';

export type MutableGenome = { -readonly [Key in keyof CreatureGenome]: CreatureGenome[Key] };
export type GroupedGenomeKey = Exclude<keyof CreatureGenome, 'schemaVersion' | 'seed' | 'preset'>;

export const GENOME_GROUPS: readonly GenomeGroup[] = Object.freeze([
	'body',
	'armour',
	'limbs',
	'senses',
	'ornaments',
	'surface',
	'motion',
	'color',
	'world'
]);

export const GENOME_GROUP_FIELDS = Object.freeze({
	body: Object.freeze([
		'discipline',
		'bodyPlan',
		'bodySegments',
		'bodyRegions',
		'bodyLength',
		'bodyWidth',
		'headScale',
		'centralScale',
		'terminalScale',
		'axisCurvature',
		'lateralBend',
		'dorsalArch',
		'taper',
		'compression',
		'segmentOverlap',
		'membraneExposure',
		'symmetry',
		'asymmetry'
	] as const),
	armour: Object.freeze([
		'shellExponent',
		'lateralFlare',
		'dorsalRidge',
		'ridgeSharpness',
		'serration',
		'spineDensity'
	] as const),
	limbs: Object.freeze([
		'walkingLegPairs',
		'graspingPairs',
		'legBones',
		'legLength',
		'legThickness',
		'stanceWidth',
		'clawCount'
	] as const),
	senses: Object.freeze([
		'eyeCount',
		'eyeScale',
		'eyeAsymmetry',
		'eyeLayout',
		'antennaCount',
		'antennaLength',
		'palpLength'
	] as const),
	ornaments: Object.freeze(['wingMode', 'terminalModule'] as const),
	surface: Object.freeze([
		'material',
		'cellularScale',
		'cellularContrast',
		'poreDensity',
		'bristleDensity',
		'corrosion',
		'roughness',
		'membraneTranslucency'
	] as const),
	motion: Object.freeze([
		'gait',
		'cadence',
		'stanceRatio',
		'swingHeight',
		'bodyBob',
		'idleMotion',
		'appendageLag',
		'startle',
		'threatIntensity'
	] as const),
	color: Object.freeze([
		'iridescence',
		'fluorescence',
		'palette',
		'eyeEmission',
		'seamEmission'
	] as const),
	world: Object.freeze(['world', 'worldInfluence'] as const)
} satisfies Readonly<Record<GenomeGroup, readonly GroupedGenomeKey[]>>);

export const UNLOCKED_MUTATION_GROUPS: MutationLocks = Object.freeze({
	body: false,
	armour: false,
	limbs: false,
	senses: false,
	ornaments: false,
	surface: false,
	motion: false,
	color: false,
	world: false
});

export function normalizeMutationLocks(locks?: Partial<MutationLocks>): MutationLocks {
	return Object.freeze(
		Object.fromEntries(
			GENOME_GROUPS.map((group) => [group, locks?.[group] === true])
		) as unknown as Record<GenomeGroup, boolean>
	);
}

export function copyGenomeGroup(
	target: MutableGenome,
	source: CreatureGenome,
	group: GenomeGroup
): void {
	const writable = target as unknown as Record<string, unknown>;
	for (const key of GENOME_GROUP_FIELDS[group]) writable[key] = source[key];
}

export function genomeGroupChanged(
	left: CreatureGenome,
	right: CreatureGenome,
	group: GenomeGroup
): boolean {
	return GENOME_GROUP_FIELDS[group].some((key) => left[key] !== right[key]);
}
