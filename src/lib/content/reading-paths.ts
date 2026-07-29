export type ReadingPathDefinition = {
	id: 'orientation' | 'healthcare' | 'science' | 'calcutta' | 'fiction';
	eyebrow: string;
	label: string;
	description: string;
	postSlugs: readonly string[];
};

export type ReadingPathSummary = Omit<ReadingPathDefinition, 'postSlugs'>;

export const readingPathDefinitions: readonly ReadingPathDefinition[] = [
	{
		id: 'orientation',
		eyebrow: 'Orientation',
		label: 'Begin with the voice',
		description:
			'Three essays about why this site exists, what its author notices, and how small things become a way of thinking.',
		postSlugs: [
			'why-i-write-what-i-write',
			'why-i-write-on-small-things',
			'welcome-to-suvroghosh-in'
		]
	},
	{
		id: 'healthcare',
		eyebrow: 'Healthcare IT',
		label: 'Healthcare systems from first principles',
		description:
			'Start with the human and institutional problems, then move into interoperability and information exchange.',
		postSlugs: [
			'why-read-a-healthcare-it-blog-in-the-age-of-ai',
			'fhir-the-universal-language-of-health-data',
			'hie-first-principles-openhie'
		]
	},
	{
		id: 'science',
		eyebrow: 'Science & mental models',
		label: 'Science without ceremonial fog',
		description:
			'Mathematics, probability, and uncertainty explained through queues, myths, and the structures beneath ordinary problems.',
		postSlugs: [
			'poisson-distribution-healthcare-it',
			'four-fundamental-subspaces',
			'randomness-chaos-complexity-calcutta'
		]
	},
	{
		id: 'calcutta',
		eyebrow: 'Place & memory',
		label: 'Calcutta, close up',
		description: 'Tea, schooling, heat, and the city as lived experience rather than scenery.',
		postSlugs: [
			'a-cup-of-cha-is-not-a-small-thing',
			'schooling-in-calcutta',
			'calcutta-summer-of-2026'
		]
	},
	{
		id: 'fiction',
		eyebrow: 'Short fiction',
		label: 'Fiction after dark',
		description:
			"Three unsettling stories in which Calcutta's streets, houses, and systems acquire lives of their own.",
		postSlugs: [
			'the-polished-ghost-of-banamali-lane',
			'asteroid-over-calcutta',
			'mallick-ghat-nessie'
		]
	}
];
