export const categoryLabels: Record<string, string> = {
	'healthcare-it': 'Healthcare IT',
	'healthcare-ai': 'Healthcare AI',
	'public-health': 'Public Health',
	'ai-security': 'AI Security',
	'food-and-culture': 'Food and Culture',
	'history-of-science': 'History of Science',
	'useful-mental-models': 'Useful Mental Models',
	'systems-thinking': 'Systems Thinking',
	'mental-models': 'Mental Models',
	'political-economy': 'Political Economy',
	'natural-history': 'Natural History',
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