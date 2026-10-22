import type { MemoryUnit } from './model';

export interface PalaceExample {
	text: string;
	units: MemoryUnit[];
}

const wordScenes = [
	[
		'umbrella',
		'An enormous umbrella springs open and lifts the iron gate into the rain.',
		'The gate rises because the umbrella opens; its shape and action cue umbrella.',
		'umbrella'
	],
	[
		'mango',
		'A giant mango bursts, sending sticky orange juice down all three front steps.',
		'The familiar fruit, colour and sticky juice connect mango to the steps.',
		'fruit'
	],
	[
		'bicycle',
		'A bell-ringing bicycle circles the veranda posts without a rider.',
		'The wheels circle the posts and the bell gives the bicycle a second cue.',
		'wheel'
	],
	[
		'candle',
		'A towering candle drips warm wax over the round entrance table.',
		'A flame and dripping wax distinguish candle from a lamp.',
		'flame'
	],
	[
		'elephant',
		'A tiny elephant sinks into the armchair and trumpets from its cushion.',
		'The small animal still has its distinctive trunk and trumpet call.',
		'animal'
	],
	[
		'violin',
		'The books sprout violin strings, and the bookshelf bows them into a tune.',
		'The bow and strings point to violin, rather than music in general.',
		'music'
	],
	[
		'key',
		'A golden key turns in the dining table, winding the whole table like a toy.',
		'The turning key is the object that makes the table move.',
		'key'
	],
	[
		'ocean',
		'A blue ocean surges out of the stove, washing its rings with salty waves.',
		'The stove holds a vast salty ocean, not a small pot of water.',
		'water'
	],
	[
		'clock',
		'The staircase becomes a giant clock, ticking loudly with every step.',
		'The ticking staircase and clock face cue the target at the stairs.',
		'clock'
	],
	[
		'butterfly',
		'An enormous butterfly fans the landing window with its patterned wings.',
		'The paired patterned wings identify the butterfly at the landing.',
		'wings'
	]
] as const;

export const WORD_EXAMPLE: PalaceExample = {
	text: wordScenes.map(([word]) => word).join(', '),
	units: wordScenes.map(([label, scene, why, prop], index) => ({
		id: `word-${index + 1}`,
		label,
		meaning: label,
		source: label,
		scene,
		why,
		prop,
		relationship: '',
		locus: index
	}))
};

export const WATER_CYCLE_TEXT =
	'The Sun supplies energy that turns liquid water into water vapour through evaporation. When moist air cools enough, water vapour condenses into tiny droplets; clouds contain these droplets or ice crystals. When cloud particles grow sufficiently, water falls as precipitation. Some water infiltrates the ground, while some flows over the surface as runoff, returning water towards rivers and the ocean.';

const conceptCards: Omit<MemoryUnit, 'id' | 'locus'>[] = [
	{
		label: 'Solar energy and evaporation',
		meaning: 'The Sun supplies energy for liquid water to become water vapour through evaporation.',
		source:
			'The Sun supplies energy that turns liquid water into water vapour through evaporation.',
		scene:
			'A Sun-shaped lantern warms a puddle on the gate; invisible water vapour is represented by rising arrows.',
		why: 'The Sun lantern supplies the energy. The puddle is liquid water; arrows stand for the invisible vapour.',
		prop: 'sun',
		relationship:
			'Supplies energy for evaporation; the next card concerns what happens when moist air cools.'
	},
	{
		label: 'Cooling and condensation',
		meaning: 'When moist air cools enough, water vapour condenses into tiny liquid droplets.',
		source: 'When moist air cools enough, water vapour condenses into tiny droplets;',
		scene:
			'A cold mirror on the steps beads with tiny droplets only when a cooling dial reaches its marked threshold.',
		why: 'The dial preserves the condition "cools enough"; beads cue liquid droplets rather than invisible vapour.',
		prop: 'droplet',
		relationship:
			'Cooling enough is the condition for condensation in this example; it is not a claim that any cooling forms a cloud.'
	},
	{
		label: 'What clouds contain',
		meaning: 'Clouds contain tiny water droplets or ice crystals.',
		source: 'clouds contain these droplets or ice crystals.',
		scene:
			'The cloud-shaped veranda awning holds tiny glass droplets and ice crystals, rather than a bag of invisible vapour.',
		why: 'The visible glass beads and crystals preserve the distinction between a cloud and invisible water vapour.',
		prop: 'cloud',
		relationship:
			'Describes cloud contents associated with condensation; it does not claim every cloud contains both phases.'
	},
	{
		label: 'Precipitation',
		meaning: 'When cloud particles grow sufficiently, water falls as precipitation.',
		source: 'When cloud particles grow sufficiently, water falls as precipitation.',
		scene:
			'Droplets and ice pieces grow in a basket on the entrance table until its weighted flap opens and they fall.',
		why: 'The growing pieces and opening flap cue the growth condition, followed by falling precipitation.',
		prop: 'rain',
		relationship:
			'Particle growth precedes falling in this simplified account; clouds do not all immediately produce precipitation.'
	},
	{
		label: 'Infiltration',
		meaning: 'Some water enters the ground through infiltration.',
		source: 'Some water infiltrates the ground,',
		scene: 'Some water sinks through a soil-coloured sponge armchair into the ground beneath it.',
		why: 'The sponge lets some water enter the ground. "Some" matters: infiltration is not the only path.',
		prop: 'ground',
		relationship:
			'One possible path after precipitation, alongside surface runoff; the two cards are alternatives, not successive stages.'
	},
	{
		label: 'Surface runoff',
		meaning: 'Some water flows over the surface as runoff.',
		source: 'while some flows over the surface as runoff,',
		scene:
			'A different stream runs down a sloping gutter across the bookshelf surface, without entering the shelves.',
		why: 'The separate gutter stays on the surface, distinguishing runoff from infiltration into the sponge-ground.',
		prop: 'stream',
		relationship:
			'An alternative to infiltration, not something that only occurs after it; leads towards rivers and the ocean.'
	},
	{
		label: 'Return towards rivers and ocean',
		meaning: 'Surface runoff returns water towards rivers and the ocean.',
		source: 'returning water towards rivers and the ocean.',
		scene:
			'The surface stream follows a blue river ribbon across the dining table towards an ocean-shaped bowl.',
		why: 'The ribbon connects the runoff stream to rivers and the ocean; it is a route cue, not a complete hydrological model.',
		prop: 'water',
		relationship:
			'Follows the surface-runoff branch. It does not mean all infiltrated water immediately returns to the ocean.'
	}
];

export const CONCEPT_EXAMPLE: PalaceExample = {
	text: WATER_CYCLE_TEXT,
	units: conceptCards.map((card, index) => ({ ...card, id: `concept-${index + 1}`, locus: index }))
};
