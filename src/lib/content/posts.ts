import { slugifyCategory } from './categories';

export type BlogPostMetadata = {
	title: string;
	seoTitle?: string;
	description: string;
	date: string;
	dateModified?: string;
	category: string;
	tags: string[];
	pinnedTags?: string[];
	series?: string[];
	seriesId?: string;
	seriesPart?: number;
	seriesChapter?: string;
	published: boolean;
	thumbnail?: string;
	thumbnailAlt?: string;
	mediaReviewed?: boolean;
	color?: string;
	author?: string;
	readingTime?: string;
	notebook?: string;
	status?: string;
	inPlainEnglish?: string;
	keyTerms?: string[];
	faq?: { question: string; answer: string }[];
	interactiveFirst?: boolean;
	immersiveLead?: boolean;
	rawThoughtLayout?: string;
	headings?: PostHeading[];
};

export type PostHeading = {
	id: string;
	text: string;
	level: number;
};

export type EssayInkFamily =
	| 'site'
	| 'red'
	| 'amber'
	| 'green'
	| 'blue'
	| 'violet'
	| 'brown'
	| 'neutral';

const editorialInkFamilies: readonly [RegExp, EssayInkFamily][] = [
	[/red|blood|crimson|oxblood|maroon|ember/, 'red'],
	[/amber|orange|copper|rust|burnt|saffron|mustard|ochre|tamarind|gold/, 'amber'],
	[/green|emerald|moss|river/, 'green'],
	[/blue|indigo|midnight/, 'blue'],
	[/violet|purple|ultraviolet/, 'violet'],
	[/brown/, 'brown'],
	[/slate|ash|silver|zinc|stone|gr[ae]y|charcoal|black|muted|bone/, 'neutral']
];

function hexInkFamily(value: string): EssayInkFamily | null {
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
	if (!match) return null;

	const expanded =
		match[1].length === 3
			? match[1]
					.split('')
					.map((digit) => digit + digit)
					.join('')
			: match[1];
	const [red, green, blue] = expanded
		.match(/.{2}/g)!
		.map((part) => Number.parseInt(part, 16) / 255);
	const maximum = Math.max(red, green, blue);
	const minimum = Math.min(red, green, blue);
	const chroma = maximum - minimum;
	if (chroma < 0.12) return 'neutral';

	let hue: number;
	if (maximum === red) hue = ((green - blue) / chroma) % 6;
	else if (maximum === green) hue = (blue - red) / chroma + 2;
	else hue = (red - green) / chroma + 4;
	hue = (hue * 60 + 360) % 360;

	if (hue < 15 || hue >= 345) return 'red';
	if (hue < 65) return maximum < 0.58 ? 'brown' : 'amber';
	if (hue < 170) return 'green';
	if (hue < 250) return 'blue';
	if (hue < 330) return 'violet';
	return 'red';
}

/** Convert free-form editorial colours into a contrast-normalized theme family. */
export function sanitizeEssayInk(value: string | null | undefined) {
	const normalized = value?.trim().toLocaleLowerCase('en') ?? '';
	return (
		hexInkFamily(normalized) ??
		editorialInkFamilies.find(([pattern]) => pattern.test(normalized))?.[1] ??
		'site'
	);
}

export type BlogPostSummary = BlogPostMetadata & {
	slug: string;
	categorySlug?: string;
	categoryLabel?: string;
	sectionSlug?: string;
	sectionLabel?: string;
};

export const postPathAliases: Record<string, string> = {
	'artificial-intelligence/ai-meaningful-work-and-the-trust-collapse':
		'/blog/artificial-intelligence/ai-meaningful-work-trust-collapse',
	'career/intro': '/blog/career/the-new-mantra',
	'healthcare-it/arrow_uncertainty_medical_care_healthcare_it':
		'/blog/economics/kenneth-arrow-medical-care',
	'healthcare-it/confounding-factors':
		'/blog/healthcare-it/confounding-factors-healthcare-it-analytics',
	'healthcare-it/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'career/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'personal/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'healthcare-it/fhir-for-a-curious-student-in-calcutta':
		'/blog/healthcare-it/fhir-the-universal-language-of-health-data',
	'healthcare-it/hie-from-first-principles': '/blog/healthcare-it/hie-first-principles-openhie',
	'healthcare-it/latent-space-healthcare-data':
		'/blog/healthcare-it/latent-space-in-healthcare-data',
	'healthcare-it/the-trolley-problem-is-already-hiding-in-healthcare':
		'/blog/healthcare-it/trolley-problem-healthcare-it',
	'healthcare-it/how-va-healthcare-data-systems-work':
		'/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql',
	'personal-essay/trapezoid-for-my-mother': '/blog/personal-essay/a-trapezoid-in-low-light'
};

const redirectedPostSlugs = new Set(
	Object.keys(postPathAliases).map((sourcePath) => sourcePath.split('/').slice(1).join('/'))
);

export function isPublishedPost(
	post: Partial<BlogPostMetadata> | null | undefined
): post is Partial<BlogPostMetadata> {
	return post != null && post.published !== false;
}

export function redirectedPostPath(category: string, slug: string) {
	return postPathAliases[`${slugifyCategory(category)}/${slug}`];
}

export function isRedirectedPostSlug(slug: string | null | undefined) {
	return slug != null && redirectedPostSlugs.has(slug);
}

export function isIndexablePost(
	metadata: Partial<BlogPostMetadata> | null | undefined,
	slug: string | null | undefined
) {
	return isPublishedPost(metadata) && !isRedirectedPostSlug(slug);
}

export function validatePublishedPostMetadata(
	metadata: Partial<BlogPostMetadata> | null | undefined,
	source = 'post'
) {
	if (!isPublishedPost(metadata)) return;
	if (
		metadata.rawThoughtLayout !== undefined &&
		(typeof metadata.rawThoughtLayout !== 'string' ||
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.rawThoughtLayout))
	) {
		throw new Error(`${source} has an invalid rawThoughtLayout; use a lowercase hyphenated slug.`);
	}

	const missing = ['title', 'description', 'date', 'category'].filter((field) => {
		const value = metadata[field as keyof BlogPostMetadata];
		return typeof value !== 'string' || value.trim() === '';
	});

	if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) {
		missing.push('tags');
	}

	if (missing.length > 0) {
		throw new Error(`${source} is published but missing required metadata: ${missing.join(', ')}`);
	}
}

export function postPath(post: { category: string; slug: string }) {
	return `/blog/${slugifyCategory(post.category)}/${encodeURIComponent(post.slug)}`;
}

export function tagSearchPath(tag: string) {
	return `/blog?tag=${encodeURIComponent(tag)}`;
}
