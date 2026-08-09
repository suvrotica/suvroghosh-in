import {
	GENOME_GROUP_FIELDS,
	GENOME_GROUPS,
	genomeGroupChanged,
	normalizeMutationLocks,
	type MutableGenome
} from './genome-groups';
import {
	NUMERIC_RANGES,
	normalizeGenome,
	type NumericGenomeKey,
	type NumericRange
} from './genome';
import { createNamedStream, deterministicId, normalizeSeed } from './seed';
import type {
	BodyPlanFamily,
	CreatureGenome,
	EyeLayout,
	GaitFamily,
	GenomeGroup,
	MaterialId,
	MutationLocks,
	MutationResult,
	PaletteId,
	TerminalModule,
	WingMode,
	WorldId
} from './types';

export const DEFAULT_MUTATION_LOCKS: MutationLocks = normalizeMutationLocks();

const MATERIALS: readonly MaterialId[] = Object.freeze([
	'obsidian-iridescent',
	'iridescent-chitin',
	'oxidized-metal',
	'ceramic-bone',
	'translucent-brine',
	'velvet-black',
	'reactor-enamel'
]);
const PALETTES: readonly PaletteId[] = Object.freeze([
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
]);
const GAITS: readonly GaitFamily[] = Object.freeze([
	'tripod',
	'arachnoid-scuttle',
	'wave',
	'stalk',
	'skitter',
	'clamp-crawl',
	'dormant'
]);
const EYE_LAYOUTS: readonly EyeLayout[] = Object.freeze([
	'frontal-pair',
	'lateral-compound',
	'clustered-lenses',
	'dorsal-ocelli',
	'asymmetric-cluster',
	'annular',
	'sensory-pits'
]);
const TERMINALS: readonly TerminalModule[] = Object.freeze([
	'none',
	'split-cerci',
	'tail',
	'fan',
	'stinger-form',
	'lure'
]);
const WINGS: readonly WingMode[] = Object.freeze([
	'none',
	'folded',
	'half-open',
	'display',
	'dormant'
]);
const WORLDS: readonly WorldId[] = Object.freeze([
	'terminator-line',
	'basalt-gravity-well',
	'methane-twilight',
	'brine-under-ice',
	'orbital-ruin',
	'ashfall-terrarium',
	'monsoon-megacity-2097',
	'red-dune-cathedral'
]);

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function normalizedIndex(value: number): number {
	return Number.isFinite(value) ? clamp(Math.round(value), 0, 1_000_000_000) : 0;
}

function quantize(value: number, key: NumericGenomeKey): number {
	const range: NumericRange = NUMERIC_RANGES[key];
	const bounded = clamp(value, range.min, range.max);
	const stepped = range.min + Math.round((bounded - range.min) / range.step) * range.step;
	const rounded = range.integer ? Math.round(stepped) : Number(stepped.toFixed(6));
	return clamp(rounded, range.min, range.max);
}

function numericKeys(group: GenomeGroup): readonly NumericGenomeKey[] {
	return GENOME_GROUP_FIELDS[group].filter((key): key is NumericGenomeKey =>
		Object.prototype.hasOwnProperty.call(NUMERIC_RANGES, key)
	);
}

function setNumeric(genome: MutableGenome, key: NumericGenomeKey, value: number): void {
	(genome as unknown as Record<NumericGenomeKey, number>)[key] = value;
}

function mutateNumerics(
	genome: MutableGenome,
	parent: CreatureGenome,
	group: GenomeGroup,
	strength: number,
	namespace: string
): void {
	const stream = createNamedStream(parent.seed, namespace);
	for (const key of numericKeys(group)) {
		if (!stream.boolean(0.24 + strength * 0.62)) continue;
		const range: NumericRange = NUMERIC_RANGES[key];
		const radius = (range.max - range.min) * strength * (range.integer ? 0.22 : 0.16);
		let candidate = quantize(parent[key] + stream.float(-radius, radius), key);
		if (candidate === parent[key] && strength > 0) {
			const direction = stream.boolean() ? 1 : -1;
			candidate = quantize(parent[key] + direction * range.step, key);
		}
		setNumeric(genome, key, candidate);
	}
}

function pickDifferent<T>(
	values: readonly T[],
	current: T,
	streamSeed: string,
	namespace: string
): T {
	const alternatives = values.filter((value) => value !== current);
	if (alternatives.length === 0) return current;
	return createNamedStream(streamSeed, namespace).pick(alternatives);
}

function mutateCategoricals(
	genome: MutableGenome,
	parent: CreatureGenome,
	strength: number,
	locks: MutationLocks,
	namespace: string
): void {
	if (!locks.body && parent.discipline === 'xeno-license' && strength >= 0.72) {
		const stream = createNamedStream(parent.seed, `${namespace}:body-plan`);
		if (stream.boolean((strength - 0.65) * 0.7)) {
			let candidates: readonly BodyPlanFamily[] = ['xeno-bilateral', 'xeno-radial', 'unclassified'];
			if (locks.ornaments && parent.wingMode !== 'none') {
				candidates = ['xeno-bilateral', 'unclassified'];
			}
			genome.bodyPlan = pickDifferent(
				candidates,
				parent.bodyPlan,
				parent.seed,
				`${namespace}:body-choice`
			);
		}
	}

	if (!locks.senses && strength >= 0.28) {
		const stream = createNamedStream(parent.seed, `${namespace}:eye-layout:gate`);
		if (
			parent.eyeCount === 0 &&
			strength >= 0.6 &&
			(strength >= 0.85 || stream.boolean(strength))
		) {
			genome.eyeCount = stream.int(1, Math.max(1, Math.min(6, Math.round(2 + strength * 4))));
			genome.eyeLayout = stream.pick(EYE_LAYOUTS);
		} else if (parent.eyeCount > 0 && stream.boolean(strength * 0.48)) {
			genome.eyeLayout = pickDifferent(
				EYE_LAYOUTS,
				parent.eyeLayout,
				parent.seed,
				`${namespace}:eye-layout`
			);
		}
	}

	if (!locks.ornaments) {
		const stream = createNamedStream(parent.seed, `${namespace}:ornaments`);
		if (stream.boolean(strength * 0.42)) {
			genome.terminalModule = pickDifferent(
				TERMINALS,
				parent.terminalModule,
				parent.seed,
				`${namespace}:terminal`
			);
		} else if (
			strength >= 0.34 &&
			['terrestrial-insect', 'xeno-bilateral', 'unclassified'].includes(genome.bodyPlan) &&
			stream.boolean(strength * 0.36)
		) {
			genome.wingMode = pickDifferent(WINGS, parent.wingMode, parent.seed, `${namespace}:wing`);
		}
	}

	if (!locks.surface && strength >= 0.2) {
		const stream = createNamedStream(parent.seed, `${namespace}:material:gate`);
		if (stream.boolean(strength * 0.45)) {
			genome.material = pickDifferent(
				MATERIALS,
				parent.material,
				parent.seed,
				`${namespace}:material`
			);
		}
	}
	if (!locks.color && strength >= 0.18) {
		const stream = createNamedStream(parent.seed, `${namespace}:palette:gate`);
		if (stream.boolean(strength * 0.5)) {
			genome.palette = pickDifferent(PALETTES, parent.palette, parent.seed, `${namespace}:palette`);
		}
	}
	if (!locks.motion && strength >= 0.3) {
		const stream = createNamedStream(parent.seed, `${namespace}:gait:gate`);
		if (stream.boolean(strength * 0.4)) {
			genome.gait = pickDifferent(GAITS, parent.gait, parent.seed, `${namespace}:gait`);
		}
	}
	if (!locks.world && strength >= 0.62) {
		const stream = createNamedStream(parent.seed, `${namespace}:world:gate`);
		if (stream.boolean((strength - 0.45) * 0.45)) {
			genome.world = pickDifferent(WORLDS, parent.world, parent.seed, `${namespace}:world`);
		}
	}
}

function ensureOneMutation(
	genome: MutableGenome,
	parent: CreatureGenome,
	strength: number,
	locks: MutationLocks,
	namespace: string
): void {
	if (GENOME_GROUPS.some((group) => genomeGroupChanged(parent, genome, group))) return;
	const group = GENOME_GROUPS.find(
		(candidate) => !locks[candidate] && numericKeys(candidate).length > 0
	);
	if (!group) return;
	const keys = numericKeys(group);
	const stream = createNamedStream(parent.seed, `${namespace}:guaranteed-change`);
	const key = stream.pick(keys);
	const range: NumericRange = NUMERIC_RANGES[key];
	const direction = parent[key] + range.step <= range.max ? 1 : -1;
	const multiplier = Math.max(1, Math.round(strength * 4));
	setNumeric(genome, key, quantize(parent[key] + direction * range.step * multiplier, key));
}

/**
 * Mutates the procedural parameter genome without global history or entropy.
 * Replaying the same parent, index, strength, and lock mask returns the same child.
 */
export function mutateGenome(
	parentInput: CreatureGenome,
	mutationIndex: number,
	mutationStrength: number,
	lockInput: Partial<MutationLocks> = DEFAULT_MUTATION_LOCKS
): MutationResult {
	const parent = normalizeGenome(parentInput);
	const index = normalizedIndex(mutationIndex);
	const strength = clamp(Number.isFinite(mutationStrength) ? mutationStrength : 0, 0, 1);
	const locks = normalizeMutationLocks(lockInput);
	if (strength === 0 || GENOME_GROUPS.every((group) => locks[group])) {
		return Object.freeze({ genome: parent, index, changedGroups: Object.freeze([]) });
	}
	const lockMask = GENOME_GROUPS.map((group) => (locks[group] ? '1' : '0')).join('');
	const namespace = `mutation:${index}:${strength.toFixed(4)}:${lockMask}`;
	const childSeed = normalizeSeed(
		`m${index}-${deterministicId(parent.seed, namespace)}-${parent.seed}`
	);
	const mutable: MutableGenome = {
		...parent,
		seed: childSeed,
		preset: 'unfiled-specimen'
	};

	for (const group of GENOME_GROUPS) {
		if (!locks[group]) mutateNumerics(mutable, parent, group, strength, `${namespace}:${group}`);
	}
	mutateCategoricals(mutable, parent, strength, locks, namespace);
	ensureOneMutation(mutable, parent, strength, locks, namespace);

	const genome = normalizeGenome(mutable, parent);
	const changedGroups = Object.freeze(
		GENOME_GROUPS.filter((group) => !locks[group] && genomeGroupChanged(parent, genome, group))
	);
	return Object.freeze({ genome, index, changedGroups });
}
