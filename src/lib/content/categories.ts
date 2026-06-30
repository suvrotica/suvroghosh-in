export const categoryLabels: Record<string, string> = {
	'healthcare-it': 'Healthcare IT',
	'healthcare-ai': 'Healthcare AI',
	'healthcare-science': 'Healthcare Science',
	'healthcare-systems': 'Healthcare Systems',
	'public-health': 'Public Health',
	'ai-economy': 'AI Economy',
	'ai-economics': 'AI Economics',
	'ai-security': 'AI Security',
	'calcutta-life': 'Calcutta Life',
	'audio-technology': 'Audio Technology',
	'politics-and-society': 'Politics and Society',
	'health-and-society': 'Health and Society',
	'food-and-culture': 'Food and Culture',
	'philosophy-and-ai': 'Philosophy and AI',
	food: 'Food',
	climate: 'Climate',
	ideas: 'Ideas',
	career: 'Career',
	education: 'Education',
	knowledge: 'Knowledge',
	energy: 'Energy',
	statistics: 'Statistics',
	'ai-education': 'AI Education',
	'science-essay': 'Science Essay',
	'science-and-healthcare-it': 'Science and Healthcare IT',
	'history-of-science': 'History of Science',
	'useful-mental-models': 'Useful Mental Models',
	'systems-thinking': 'Systems Thinking',
	'mental-models': 'Mental Models',
	'technology-and-society': 'Technology and Society',
	'political-economy': 'Political Economy',
	'natural-history': 'Natural History',
	neuroscience: 'Neuroscience',
	'personal-science': 'Personal Science',
	'work-migration-india': 'Work, Migration, India'
};

export function slugifyCategory(category = 'uncategorized') {
	return category
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function categoryLabel(category = 'uncategorized') {
	const slug = slugifyCategory(category);
	return categoryLabels[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
