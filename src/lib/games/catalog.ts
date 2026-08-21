export const CALCUTTA_FOOTPATH_SLUG = 'calcutta-footpath-simulator-ekdom-side-diye-jaan';
export const KAGOJER_DANA_SLUG = 'kagojer-dana-a-paper-plane-through-calcutta';
export const HEALTHCARE_IT_CROSSWORD_SLUG = 'healthcare-it-crossword-systems-rounds';
export const LUDO_SAAP_LUDO_SLUG = 'ludo-and-saap-ludo';

export const GAME_EXPERIENCES = [
	'period-board-games',
	'healthcare-it-crossword',
	'kagojer-dana',
	'calcutta-footpath'
] as const;

export type GameExperience = (typeof GAME_EXPERIENCES)[number];

export type GameSlug =
	| typeof LUDO_SAAP_LUDO_SLUG
	| typeof HEALTHCARE_IT_CROSSWORD_SLUG
	| typeof KAGOJER_DANA_SLUG
	| typeof CALCUTTA_FOOTPATH_SLUG;

export type GameCatalogEntry = {
	slug: GameSlug;
	experience: GameExperience;
	title: string;
	shortTitle: string;
	description: string;
	kind: string;
	cardEyebrow: string;
	actionLabel: string;
	cover: string;
	socialCover: string;
	coverAlt: string;
	inputs: readonly string[];
	duration: string;
	durationLabel: string;
	compatibility: readonly string[];
	keywords: readonly string[];
	shell: 'immersive' | 'site';
	status: 'New' | 'Experimental' | 'Complete';
};

export const gamesCatalog: readonly GameCatalogEntry[] = [
	{
		slug: LUDO_SAAP_LUDO_SLUG,
		experience: 'period-board-games',
		title: 'Ludo & Saap-Ludo',
		shortTitle: 'Ludo & Saap-Ludo',
		description: 'A cheap folding board, one die, and three opponents with all afternoon to play.',
		kind: 'Traditional board games',
		cardEyebrow: 'Two cardboard faces, one patient afternoon',
		actionLabel: 'Open the board',
		cover: '/images/games/ludo-and-saap-ludo-cover.svg',
		socialCover: '/images/games/ludo-and-saap-ludo-social.png',
		coverAlt:
			'An original worn-paper folding board showing a square Ludo face beside a numbered snakes and ladders face',
		inputs: ['Keyboard', 'Touch', 'Screen reader controls'],
		duration: '20–90+ minutes',
		durationLabel: 'One match',
		compatibility: ['Desktop', 'Mobile', 'Tablet'],
		keywords: [
			'Ludo',
			'Snakes and Ladders',
			'Saap Ludo',
			'Bengali board games',
			'Calcutta game',
			'Kolkata nostalgia'
		],
		shell: 'site',
		status: 'New'
	},
	{
		slug: HEALTHCARE_IT_CROSSWORD_SLUG,
		experience: 'healthcare-it-crossword',
		title: 'The Healthcare IT Crossword: Systems Rounds',
		shortTitle: 'Healthcare IT Crossword',
		description:
			'A progressively hinted healthcare IT crossword for refreshing interoperability, clinical systems, terminology, data, governance, analytics, and responsible AI.',
		kind: 'Educational crossword',
		cardEyebrow: 'A patient, progressively hinted learning game',
		actionLabel: 'Start a round',
		cover: '/images/games/healthcare-it-crossword-systems-rounds-cover.webp',
		socialCover: '/images/games/healthcare-it-crossword-systems-rounds-social.png',
		coverAlt:
			'An editorial cream-and-black field sheet for The Healthcare IT Crossword, with FHIR, LOINC, ETL, AUDIT and SQL written into the grid',
		inputs: ['Keyboard', 'Touch', 'Accessible clue list'],
		duration: '3–15+ minutes',
		durationLabel: 'One round',
		compatibility: ['Desktop', 'Mobile', 'Tablet'],
		keywords: [
			'Healthcare IT crossword',
			'Healthcare interoperability',
			'Clinical data',
			'Healthcare AI',
			'Learning game'
		],
		shell: 'site',
		status: 'New'
	},
	{
		slug: KAGOJER_DANA_SLUG,
		experience: 'kagojer-dana',
		title: 'Kagojer Dana: A Paper Plane Through Calcutta',
		shortTitle: 'Kagojer Dana',
		description:
			'An unpowered paper-plane flight through a charcoal Calcutta assembled by memory, crosswind, rooftops, river air, and borrowed lift.',
		kind: 'Flight game',
		cardEyebrow: 'A charcoal flight through an impossible city',
		actionLabel: 'Take flight',
		cover: '/images/games/kagojer-dana-poster.webp',
		socialCover: '/images/games/kagojer-dana-social.png',
		coverAlt:
			'A folded notebook-paper plane gliding above a charcoal North Calcutta lane toward the cantilever trusses of Howrah Bridge',
		inputs: ['Keyboard', 'One touch field', 'Optional gamepad'],
		duration: '6–10 minutes',
		durationLabel: 'One flight',
		compatibility: ['Desktop', 'Landscape mobile', 'Tablet'],
		keywords: ['Calcutta game', 'Kolkata game', 'Paper plane game', 'Flight game'],
		shell: 'immersive',
		status: 'New'
	},
	{
		slug: CALCUTTA_FOOTPATH_SLUG,
		experience: 'calcutta-footpath',
		title: 'Calcutta Footpath Simulator: Ekdom Side Diye Jaan',
		shortTitle: 'Calcutta Footpath Simulator',
		description:
			'A three-dimensional North Calcutta walking game of branching lanes, spatial traffic, tea stops, rain, and the art of taking another route.',
		kind: 'Walking simulation',
		cardEyebrow: 'A municipal survival game',
		actionLabel: 'Play now',
		cover: '/images/games/calcutta-footpath-simulator-cover.svg',
		socialCover: '/images/games/calcutta-footpath-simulator-cover.png',
		coverAlt:
			'A hand-painted Calcutta pavement crowded by a cow, a motorbike, pedestrians, puddles, a tea stall, and one worried walker',
		inputs: ['Click or tap', 'Arrow keys', 'Optional gamepad'],
		duration: '3–7 minutes',
		durationLabel: 'One walk',
		compatibility: ['Desktop', 'Mobile', 'Tablet'],
		keywords: ['Calcutta game', 'Kolkata game', 'Walking game', 'City simulation'],
		shell: 'immersive',
		status: 'New'
	}
];

export function gamePath(slug: string) {
	return `/blog/games/${encodeURIComponent(slug)}`;
}

export function gameBySlug(slug: string) {
	return gamesCatalog.find((game) => game.slug === slug);
}
