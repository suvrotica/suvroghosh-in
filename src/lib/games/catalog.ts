export const CALCUTTA_FOOTPATH_SLUG = 'calcutta-footpath-simulator-ekdom-side-diye-jaan';

export type GameCatalogEntry = {
	slug: string;
	title: string;
	shortTitle: string;
	description: string;
	cover: string;
	socialCover: string;
	coverAlt: string;
	inputs: readonly string[];
	duration: string;
	compatibility: readonly string[];
	status: 'New' | 'Experimental' | 'Complete';
};

export const gamesCatalog: readonly GameCatalogEntry[] = [
	{
		slug: CALCUTTA_FOOTPATH_SLUG,
		title: 'Calcutta Footpath Simulator: Ekdom Side Diye Jaan',
		shortTitle: 'Calcutta Footpath Simulator',
		description:
			'A full-screen Calcutta survival game where potholes, drains, cows, motorbikes, hawkers, snacks, and municipal entropy sabotage one ordinary walk.',
		cover: '/images/games/calcutta-footpath-simulator-cover.svg',
		socialCover: '/images/games/calcutta-footpath-simulator-cover.png',
		coverAlt:
			'A hand-painted Calcutta pavement crowded by a cow, a motorbike, pedestrians, puddles, a tea stall, and one worried walker',
		inputs: ['Keyboard', 'Touch', 'Gamepad'],
		duration: '3–7 minutes',
		compatibility: ['Desktop', 'Mobile', 'Tablet'],
		status: 'New'
	}
];

export function gamePath(slug: string) {
	return `/blog/games/${encodeURIComponent(slug)}`;
}

export function gameBySlug(slug: string) {
	return gamesCatalog.find((game) => game.slug === slug);
}
