import { DEFAULT_GENOME, normalizeGenome } from './genome';
import type {
	CreatureGenome,
	CreaturePreset,
	PaletteDefinition,
	PaletteId,
	PresetId,
	WorldId,
	WorldPreset
} from './types';

export const PALETTES: Readonly<Record<PaletteId, PaletteDefinition>> = Object.freeze({
	'ultraviolet-petrol': {
		id: 'ultraviolet-petrol',
		name: 'Ultraviolet petrol',
		background: [0.016, 0.012, 0.04],
		chamber: [0.04, 0.025, 0.075],
		shellA: [0.075, 0.035, 0.14],
		shellB: [0.58, 0.12, 0.84],
		membrane: [0.06, 0.32, 0.36],
		emission: [0.52, 0.96, 0.12],
		eye: [0.72, 1, 0.18],
		corrosion: [0.16, 0.46, 0.38]
	},
	'reactor-acid': {
		id: 'reactor-acid',
		name: 'Reactor acid',
		background: [0.018, 0.022, 0.014],
		chamber: [0.045, 0.06, 0.025],
		shellA: [0.02, 0.035, 0.018],
		shellB: [0.56, 0.9, 0.03],
		membrane: [0.95, 0.22, 0.025],
		emission: [0.85, 1, 0.08],
		eye: [1, 0.68, 0.08],
		corrosion: [0.32, 0.22, 0.025]
	},
	'cobalt-velvet': {
		id: 'cobalt-velvet',
		name: 'Cobalt velvet',
		background: [0.008, 0.014, 0.028],
		chamber: [0.018, 0.035, 0.075],
		shellA: [0.008, 0.012, 0.018],
		shellB: [0.04, 0.26, 0.68],
		membrane: [0.16, 0.05, 0.24],
		emission: [0.42, 0.18, 0.72],
		eye: [0.7, 0.25, 0.85],
		corrosion: [0.12, 0.22, 0.34]
	},
	'brine-frost': {
		id: 'brine-frost',
		name: 'Brine frost',
		background: [0.006, 0.018, 0.03],
		chamber: [0.02, 0.07, 0.1],
		shellA: [0.22, 0.38, 0.5],
		shellB: [0.62, 0.72, 0.92],
		membrane: [0.1, 0.28, 0.46],
		emission: [0.32, 0.92, 1],
		eye: [0.72, 0.92, 1],
		corrosion: [0.28, 0.42, 0.48]
	},
	'orbital-cyan': {
		id: 'orbital-cyan',
		name: 'Orbital cyan',
		background: [0.01, 0.014, 0.02],
		chamber: [0.035, 0.045, 0.055],
		shellA: [0.035, 0.065, 0.075],
		shellB: [0.05, 0.58, 0.68],
		membrane: [0.38, 0.02, 0.32],
		emission: [0.9, 0.08, 0.68],
		eye: [0.75, 0.95, 1],
		corrosion: [0.08, 0.42, 0.44]
	},
	'monsoon-tram': {
		id: 'monsoon-tram',
		name: 'Monsoon tram',
		background: [0.008, 0.018, 0.024],
		chamber: [0.018, 0.06, 0.078],
		shellA: [0.02, 0.09, 0.15],
		shellB: [0.05, 0.42, 0.68],
		membrane: [0.78, 0.1, 0.05],
		emission: [1, 0.48, 0.06],
		eye: [0.9, 0.14, 0.16],
		corrosion: [0.3, 0.12, 0.42]
	},
	'dune-gold': {
		id: 'dune-gold',
		name: 'Red dune gold',
		background: [0.045, 0.012, 0.012],
		chamber: [0.12, 0.025, 0.018],
		shellA: [0.16, 0.035, 0.018],
		shellB: [0.78, 0.42, 0.08],
		membrane: [0.08, 0.06, 0.22],
		emission: [1, 0.72, 0.22],
		eye: [0.92, 0.82, 0.5],
		corrosion: [0.52, 0.12, 0.04]
	},
	'ash-ember': {
		id: 'ash-ember',
		name: 'Ash and ember',
		background: [0.018, 0.017, 0.018],
		chamber: [0.055, 0.045, 0.04],
		shellA: [0.025, 0.027, 0.025],
		shellB: [0.23, 0.2, 0.18],
		membrane: [0.36, 0.055, 0.02],
		emission: [1, 0.24, 0.025],
		eye: [0.72, 0.94, 0.18],
		corrosion: [0.42, 0.22, 0.08]
	},
	'methane-lantern': {
		id: 'methane-lantern',
		name: 'Methane lantern',
		background: [0.038, 0.025, 0.012],
		chamber: [0.1, 0.07, 0.025],
		shellA: [0.03, 0.08, 0.1],
		shellB: [0.05, 0.42, 0.48],
		membrane: [0.2, 0.18, 0.08],
		emission: [0.45, 0.95, 0.98],
		eye: [0.62, 0.98, 1],
		corrosion: [0.24, 0.22, 0.1]
	},
	'high-contrast': {
		id: 'high-contrast',
		name: 'High contrast',
		background: [0, 0, 0],
		chamber: [0.03, 0.03, 0.03],
		shellA: [0.72, 0.72, 0.72],
		shellB: [1, 1, 1],
		membrane: [0.12, 0.12, 0.12],
		emission: [1, 0.92, 0],
		eye: [0, 1, 1],
		corrosion: [0.35, 0.35, 0.35]
	}
});

export const WORLD_PRESETS: readonly WorldPreset[] = Object.freeze([
	{
		id: 'terminator-line',
		name: 'Terminator Line',
		medium: 'atmosphere',
		gravity: 0.92,
		abrasion: 0.24,
		opacity: 0.18,
		temperature: 'hot',
		palette: 'ultraviolet-petrol',
		fiction: 'A narrow inhabited belt held between permanent glare and permanent night.',
		mechanism:
			'Lowers the body, spreads directional sensors and strengthens one-sided light response.'
	},
	{
		id: 'basalt-gravity-well',
		name: 'Basalt Gravity Well',
		medium: 'atmosphere',
		gravity: 1.42,
		abrasion: 0.62,
		opacity: 0.28,
		temperature: 'hot',
		palette: 'ash-ember',
		fiction: 'A high-gravity industrial world of volcanic flats and exhausted survey beacons.',
		mechanism: 'Shortens distal limbs, broadens the stance and thickens central armour.'
	},
	{
		id: 'methane-twilight',
		name: 'Methane Twilight',
		medium: 'atmosphere',
		gravity: 0.74,
		abrasion: 0.08,
		opacity: 0.74,
		temperature: 'cryogenic',
		palette: 'methane-lantern',
		fiction: 'A dim hydrocarbon moon described here only as speculative visual fiction.',
		mechanism: 'Slows gait, smooths armour and increases restrained sensory prominence.'
	},
	{
		id: 'brine-under-ice',
		name: 'Brine Under Ice',
		medium: 'dense-fluid',
		gravity: 0.66,
		abrasion: 0.05,
		opacity: 0.52,
		temperature: 'cold',
		palette: 'brine-frost',
		fiction: 'A dark saline cavity beneath an imagined frozen crust.',
		mechanism:
			'Shortens exposed bristles, smooths plates and biases appendages toward paddles and tails.'
	},
	{
		id: 'orbital-ruin',
		name: 'Orbital Ruin',
		medium: 'vacuum-fiction',
		gravity: 0.08,
		abrasion: 0.38,
		opacity: 0.04,
		temperature: 'cold',
		palette: 'orbital-cyan',
		fiction:
			'A maintenance organism remains attached to a dead habitat after its paperwork expires.',
		mechanism: 'Reduces the assumption of down, widens clamps and increases semi-radial stance.'
	},
	{
		id: 'ashfall-terrarium',
		name: 'Ashfall Terrarium',
		medium: 'atmosphere',
		gravity: 1.03,
		abrasion: 0.72,
		opacity: 0.68,
		temperature: 'hot',
		palette: 'ash-ember',
		fiction: 'A failed greenhouse held beneath a permanent particulate ceiling.',
		mechanism:
			'Protects joints with deeper overlap and concentrates bristles near sensory structures.'
	},
	{
		id: 'monsoon-megacity-2097',
		name: 'Monsoon Megacity 2097',
		medium: 'atmosphere',
		gravity: 1,
		abrasion: 0.34,
		opacity: 0.7,
		temperature: 'temperate',
		palette: 'monsoon-tram',
		fiction: 'A flooded maintenance corridor beneath an invented future Kolkata.',
		mechanism:
			'Widens wet-surface feet, lengthens drainage feelers and favours a low quick scuttle.'
	},
	{
		id: 'red-dune-cathedral',
		name: 'Red Dune Cathedral',
		medium: 'atmosphere',
		gravity: 0.86,
		abrasion: 0.9,
		opacity: 0.42,
		temperature: 'hot',
		palette: 'dune-gold',
		fiction: 'A wind-carved desert world of mineral arches and ultramarine shade.',
		mechanism: 'Broadens foot contact, protects eyes and streamlines dorsal ornament.'
	}
]);

function genome(preset: PresetId, overrides: Partial<CreatureGenome>): CreatureGenome {
	return normalizeGenome({ ...DEFAULT_GENOME, ...overrides, preset });
}

export const CREATURE_PRESETS: readonly CreaturePreset[] = Object.freeze([
	{
		id: 'glassback-knifemite',
		name: 'Glassback Knifemite',
		designation: 'XN-1847',
		description:
			'Eleven black-glass plates, four stalking pairs, grasping forelimbs and seven acid-green lenses.',
		reason:
			'The art-directed reference specimen demonstrates coherent xeno-bilateral construction.',
		genome: DEFAULT_GENOME
	},
	{
		id: 'reactor-mantis',
		name: 'Reactor Mantis',
		designation: 'RX-61-03',
		description: 'A compact six-legged insect discipline with inward-folding raptorial forelimbs.',
		reason: 'Shows how terrestrial constraints can remain severe and visually strange.',
		genome: genome('reactor-mantis', {
			seed: 'reactor-6103',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'terrestrial-insect',
			world: 'ashfall-terrarium',
			bodySegments: 8,
			bodyLength: 0.62,
			bodyWidth: 0.31,
			walkingLegPairs: 3,
			graspingPairs: 1,
			legLength: 0.72,
			eyeCount: 2,
			eyeLayout: 'lateral-compound',
			wingMode: 'folded',
			material: 'reactor-enamel',
			palette: 'reactor-acid',
			iridescence: 0.18,
			corrosion: 0.32,
			gait: 'tripod',
			cadence: 0.18,
			threatIntensity: 0.92
		})
	},
	{
		id: 'basalt-widow',
		name: 'Basalt Widow',
		designation: 'BW-4412',
		description:
			'A velvet-black arachnid discipline with eight low angular legs and a cobalt ridge.',
		reason: 'Separates arachnid organization and pedipalp-like structures from insect defaults.',
		genome: genome('basalt-widow', {
			seed: 'basalt-4412',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'terrestrial-arachnid',
			world: 'basalt-gravity-well',
			bodySegments: 7,
			bodyRegions: 2,
			bodyLength: 0.64,
			bodyWidth: 0.42,
			walkingLegPairs: 4,
			graspingPairs: 1,
			legLength: 0.7,
			legThickness: 0.17,
			eyeCount: 8,
			eyeLayout: 'clustered-lenses',
			antennaCount: 0,
			palpLength: 0.42,
			material: 'velvet-black',
			palette: 'cobalt-velvet',
			bristleDensity: 0.42,
			gait: 'arachnoid-scuttle',
			cadence: 0.34
		})
	},
	{
		id: 'brine-cathedral-centipede',
		name: 'Brine Cathedral Centipede',
		designation: 'BC-31-41',
		description:
			'A long translucent trunk whose paired paddles carry a restrained travelling wave.',
		reason: 'Demonstrates repeated myriapod modules under a dense-medium heuristic.',
		genome: genome('brine-cathedral-centipede', {
			seed: 'brine-3141',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'myriapod',
			world: 'brine-under-ice',
			worldInfluence: 0.9,
			bodySegments: 22,
			bodyRegions: 3,
			bodyLength: 1.04,
			bodyWidth: 0.2,
			walkingLegPairs: 15,
			legBones: 3,
			legLength: 0.34,
			legThickness: 0.08,
			eyeCount: 2,
			eyeLayout: 'frontal-pair',
			terminalModule: 'tail',
			material: 'translucent-brine',
			palette: 'brine-frost',
			bristleDensity: 0.03,
			membraneTranslucency: 0.78,
			gait: 'wave',
			cadence: 0.2
		})
	},
	{
		id: 'orbital-hull-mite',
		name: 'Orbital Hull Mite',
		designation: 'OH-07-04',
		description: 'An annular xeno form with eight clamp appendages and no privileged front.',
		reason: 'Exercises radial grammar, clamp gait and the weakest possible down direction.',
		genome: genome('orbital-hull-mite', {
			seed: 'hullmite-0704',
			discipline: 'xeno-license',
			bodyPlan: 'xeno-radial',
			world: 'orbital-ruin',
			worldInfluence: 0.96,
			bodySegments: 8,
			bodyRegions: 2,
			bodyLength: 0.58,
			bodyWidth: 0.52,
			axisCurvature: 0,
			walkingLegPairs: 4,
			legLength: 0.55,
			stanceWidth: 0.9,
			eyeCount: 0,
			eyeLayout: 'none',
			antennaCount: 0,
			terminalModule: 'none',
			material: 'oxidized-metal',
			palette: 'orbital-cyan',
			gait: 'clamp-crawl',
			cadence: 0.12
		})
	},
	{
		id: 'monsoon-drain-oracle',
		name: 'Monsoon Drain Oracle',
		designation: 'MD-20-97',
		description: 'A glossy low six-legged crawler with drainage feelers and vermilion joints.',
		reason: 'Makes the affectionate Kolkata world transform visible without caricature.',
		genome: genome('monsoon-drain-oracle', {
			seed: 'monsoon-2097',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'terrestrial-insect',
			world: 'monsoon-megacity-2097',
			bodySegments: 9,
			bodyLength: 0.76,
			bodyWidth: 0.36,
			walkingLegPairs: 3,
			legLength: 0.58,
			stanceWidth: 0.78,
			eyeCount: 4,
			eyeLayout: 'clustered-lenses',
			antennaLength: 1.05,
			material: 'iridescent-chitin',
			palette: 'monsoon-tram',
			roughness: 0.18,
			gait: 'skitter',
			cadence: 0.72
		})
	},
	{
		id: 'terminator-needlewalker',
		name: 'Terminator Needlewalker',
		designation: 'TN-66-52',
		description: 'A compact shell carried by long angular legs through a low horizontal light.',
		reason: 'Pushes IK near its reach limit while preserving a readable central body.',
		genome: genome('terminator-needlewalker', {
			seed: 'terminal-6652',
			bodyPlan: 'xeno-bilateral',
			world: 'terminator-line',
			bodySegments: 6,
			bodyLength: 0.52,
			bodyWidth: 0.23,
			walkingLegPairs: 4,
			legLength: 1.08,
			legThickness: 0.07,
			stanceWidth: 0.98,
			eyeCount: 5,
			eyeLayout: 'asymmetric-cluster',
			material: 'obsidian-iridescent',
			palette: 'ultraviolet-petrol',
			gait: 'stalk',
			cadence: 0.12
		})
	},
	{
		id: 'ashfall-scarab',
		name: 'Ashfall Scarab',
		designation: 'AS-19-37',
		description: 'A heavy terrestrial insect form with overlapping wing cases and ember seams.',
		reason: 'Tests compact powerful limbs, protected joints and folded wing roots.',
		genome: genome('ashfall-scarab', {
			seed: 'ashfall-1937',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'terrestrial-insect',
			world: 'ashfall-terrarium',
			bodySegments: 7,
			bodyLength: 0.64,
			bodyWidth: 0.48,
			walkingLegPairs: 3,
			legLength: 0.42,
			legThickness: 0.24,
			stanceWidth: 0.58,
			eyeCount: 2,
			eyeLayout: 'lateral-compound',
			wingMode: 'folded',
			material: 'oxidized-metal',
			palette: 'ash-ember',
			segmentOverlap: 0.46,
			corrosion: 0.52,
			gait: 'tripod',
			cadence: 0.28
		})
	},
	{
		id: 'methane-lantern-crawler',
		name: 'Methane Lantern Crawler',
		designation: 'ML-88-14',
		description: 'Smooth pale armour and broad sensory fans move slowly through an amber haze.',
		reason: 'Shows low-light visual bias without turning every surface into a lamp.',
		genome: genome('methane-lantern-crawler', {
			seed: 'methane-8814',
			bodyPlan: 'xeno-bilateral',
			world: 'methane-twilight',
			bodySegments: 9,
			bodyLength: 0.83,
			bodyWidth: 0.4,
			walkingLegPairs: 3,
			legLength: 0.5,
			eyeCount: 0,
			eyeLayout: 'none',
			antennaCount: 4,
			antennaLength: 0.84,
			terminalModule: 'fan',
			material: 'ceramic-bone',
			palette: 'methane-lantern',
			fluorescence: 0.55,
			eyeEmission: 0,
			gait: 'dormant',
			cadence: 0.08
		})
	},
	{
		id: 'red-dune-whipbeast',
		name: 'Red Dune Whipbeast',
		designation: 'RD-73-12',
		description: 'Sand-gold armour, grasping anterior limbs and long non-homologous sensory whips.',
		reason: 'Combines arachnid visual discipline with explicitly fictional sensory appendages.',
		genome: genome('red-dune-whipbeast', {
			seed: 'dune-7312',
			bodyPlan: 'xeno-bilateral',
			world: 'red-dune-cathedral',
			bodySegments: 8,
			bodyLength: 0.78,
			bodyWidth: 0.34,
			walkingLegPairs: 4,
			graspingPairs: 1,
			legLength: 0.72,
			antennaCount: 2,
			antennaLength: 1.12,
			palpLength: 0.52,
			eyeCount: 4,
			eyeLayout: 'dorsal-ocelli',
			material: 'ceramic-bone',
			palette: 'dune-gold',
			corrosion: 0.36,
			gait: 'arachnoid-scuttle',
			cadence: 0.3
		})
	},
	{
		id: 'frostglass-plate-crawler',
		name: 'Frostglass Plate Crawler',
		designation: 'FG-28-04',
		description: 'Broad overlapping trilobite-like armour conceals many inexpensive ventral limbs.',
		reason: 'Tests silhouette strength when appendages are mostly hidden beneath plates.',
		genome: genome('frostglass-plate-crawler', {
			seed: 'frost-2804',
			discipline: 'terrestrial-discipline',
			bodyPlan: 'armoured-crawler',
			world: 'brine-under-ice',
			bodySegments: 14,
			bodyLength: 0.92,
			bodyWidth: 0.55,
			walkingLegPairs: 10,
			legBones: 2,
			legLength: 0.28,
			legThickness: 0.1,
			eyeCount: 2,
			eyeLayout: 'dorsal-ocelli',
			material: 'translucent-brine',
			palette: 'brine-frost',
			shellExponent: 4.4,
			lateralFlare: 0.46,
			segmentOverlap: 0.48,
			gait: 'wave',
			cadence: 0.1
		})
	},
	{
		id: 'unfiled-specimen',
		name: 'Unfiled Specimen',
		designation: 'UF-00-13',
		description:
			'A controlled cross-family grammar with offset plates and an unfamiliar sensory row.',
		reason: 'Makes xeno-license asymmetry visible while retaining a connected attachment graph.',
		genome: genome('unfiled-specimen', {
			seed: 'unfiled-0013',
			discipline: 'xeno-license',
			bodyPlan: 'unclassified',
			world: 'orbital-ruin',
			worldInfluence: 0.54,
			bodySegments: 13,
			bodyRegions: 4,
			bodyLength: 0.9,
			bodyWidth: 0.3,
			walkingLegPairs: 5,
			graspingPairs: 1,
			legBones: 5,
			legLength: 0.66,
			symmetry: 0.58,
			asymmetry: 0.3,
			eyeCount: 11,
			eyeLayout: 'asymmetric-cluster',
			antennaCount: 3,
			terminalModule: 'lure',
			material: 'oxidized-metal',
			palette: 'orbital-cyan',
			gait: 'clamp-crawl',
			cadence: 0.24
		})
	}
]);

const presetMap = new Map(CREATURE_PRESETS.map((preset) => [preset.id, preset]));
const worldMap = new Map(WORLD_PRESETS.map((world) => [world.id, world]));

export function getCreaturePreset(id: PresetId): CreaturePreset {
	return presetMap.get(id) ?? CREATURE_PRESETS[0];
}

export function getWorldPreset(id: WorldId): WorldPreset {
	return worldMap.get(id) ?? WORLD_PRESETS[0];
}

export function getPalette(id: PaletteId): PaletteDefinition {
	return PALETTES[id] ?? PALETTES['ultraviolet-petrol'];
}

export function genomeForPreset(id: PresetId, seed?: string): CreatureGenome {
	const preset = getCreaturePreset(id);
	return seed ? normalizeGenome({ ...preset.genome, seed }, preset.genome) : preset.genome;
}
