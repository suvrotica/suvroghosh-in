import { dev } from '$app/environment';
import type {
	WithContext,
	WebSite,
	Person,
	BlogPosting,
	BreadcrumbList,
	CreativeWork
} from 'schema-dts';
import { slugifyCategory } from '$lib/content/categories';
import { substackLinks, xProfile } from '$lib/config/links';

export const siteTitle = 'Suvro Ghosh';
export const siteTitleLong =
	'Suvro Ghosh | Healthcare IT Architect & Clinical Data Systems Consultant';
export const siteDescription =
	'Healthcare IT architect and clinical data systems consultant based in Calcutta. Work spans HL7/FHIR interoperability, HIE, EHR data, SQL/ETL, clinical trial systems, and AI-ready healthcare data architecture. Also writes essays and satire on technology, illness, corruption, society, and Calcutta life.';

export const siteUrl = dev ? 'http://localhost:5173' : 'https://www.suvroghosh.in';

export const socialUrls = [
	substackLinks.profile,
	'https://www.youtube.com/@SuvroGhoshIN',
	'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
	xProfile.url
];

// A neutral, non-personal image for pages without their own social card. Keep this
// separate from Person.image: an illustration is not a portrait of the author.
export const defaultOgImage = `${siteUrl}/thumbnail/art-hie-first-principles-openhie.jpg`;
export const indexRobots =
	'index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1';

// Stable, absolute entity IDs shared by every page on the site. Pages reference these
// IDs instead of redefining the entities, so crawlers see one coherent graph.
export const personId = `${siteUrl}/#person`;
export const websiteId = `${siteUrl}/#website`;

export function absoluteUrl(pathOrUrl?: string) {
	if (!pathOrUrl) return undefined;
	if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
	return `${siteUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function blogPostUrl(category: string, slug: string) {
	return `${siteUrl}/blog/${slugifyCategory(category)}/${encodeURIComponent(slug)}`;
}

export const siteSEO = {
	title: siteTitleLong,
	description: siteDescription,
	canonicalUrl: siteUrl,
	ogImageUrl: defaultOgImage,
	ogImageAlt: 'Abstract illustration for Suvro Ghosh’s healthcare IT and writing portfolio',
	keywords: [
		'Suvro Ghosh',
		'Healthcare IT Architect',
		'Clinical Data Systems',
		'Healthcare Interoperability',
		'HL7',
		'FHIR',
		'HIE',
		'EHR',
		'EMR',
		'SQL',
		'ETL',
		'CDISC',
		'Clinical Data Architecture',
		'Health Informatics',
		'AI-Ready Healthcare Data',
		'Calcutta',
		'Essays',
		'Satire'
	]
};

export const personSchema: WithContext<Person> = {
	'@context': 'https://schema.org',
	'@type': 'Person',
	'@id': personId,
	name: 'Suvro Ghosh',
	url: siteUrl,
	description:
		'Healthcare IT architect and clinical data systems consultant in Calcutta, and an independent writer on technology, science, society, and ordinary life.',
	sameAs: socialUrls,
	jobTitle: ['Healthcare IT Architect', 'Clinical Data Systems Consultant'],
	knowsAbout: [
		'Healthcare interoperability',
		'HL7',
		'FHIR',
		'Health Information Exchange',
		'Clinical data systems',
		'Healthcare data architecture',
		'SQL and ETL',
		'Clinical trial systems',
		'Health informatics',
		'AI-ready healthcare data'
	]
};

export const websiteSchema: WithContext<WebSite> = {
	'@context': 'https://schema.org',
	'@type': 'WebSite',
	'@id': websiteId,
	name: siteTitle,
	url: siteUrl,
	description: siteDescription,
	publisher: {
		'@id': personId
	},
	inLanguage: 'en'
};

/**
 * Wrap page-specific schema entities together with the shared Person and WebSite
 * entities in a single `@graph`. Every page therefore emits the same stable
 * `#person` and `#website` definitions, so cross-page `@id` references always
 * resolve within the same document. Entities already carrying an `@context` are
 * inserted as-is; plain entity objects are left context-free because the graph
 * itself declares the context.
 */
export function withSiteGraph(pageEntities: unknown[] = []) {
	return {
		'@context': 'https://schema.org',
		'@graph': [personSchema, websiteSchema, ...pageEntities]
	};
}

export function blogPostingSchema(post: {
	title: string;
	description: string;
	date: string;
	dateModified?: string;
	thumbnail?: string;
	category: string;
	slug: string;
	canonicalUrl: string;
	tags?: string[];
	wordCount?: number;
}) {
	const schema: Record<string, unknown> = {
		'@type': 'BlogPosting',
		'@id': `${post.canonicalUrl}#blogposting`,
		headline: post.title,
		description: post.description,
		image: absoluteUrl(post.thumbnail) ?? defaultOgImage,
		datePublished: post.date,
		author: {
			'@id': personId
		},
		publisher: {
			'@id': personId
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': post.canonicalUrl
		},
		isPartOf: {
			'@id': websiteId
		},
		articleSection: post.category,
		genre: post.category,
		keywords: post.tags ?? [],
		isAccessibleForFree: true,
		inLanguage: 'en'
	};
	if (post.dateModified) {
		schema.dateModified = post.dateModified;
	}
	if (post.wordCount) {
		schema.wordCount = post.wordCount;
	}
	return schema as unknown as WithContext<BlogPosting>;
}

export function faqPageSchema(items: { question: string; answer: string }[], pageUrl: string) {
	return {
		'@type': 'FAQPage',
		'@id': `${pageUrl}#faq`,
		isPartOf: { '@id': pageUrl },
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer
			}
		})),
		inLanguage: 'en'
	};
}

export function collectionPageSchema(page: {
	name: string;
	description: string;
	url: string;
	about?: string;
	datePublished?: string;
	dateModified?: string;
}) {
	return {
		'@type': 'CollectionPage',
		'@id': page.url,
		name: page.name,
		description: page.description,
		url: page.url,
		isPartOf: { '@id': websiteId },
		about: page.about,
		...(page.datePublished ? { datePublished: page.datePublished } : {}),
		...(page.dateModified ? { dateModified: page.dateModified } : {}),
		inLanguage: 'en'
	};
}

export function itemListSchema(list: {
	name: string;
	url: string;
	items: { name: string; url: string; description?: string }[];
}) {
	return {
		'@type': 'ItemList',
		'@id': `${list.url}#reading-list`,
		name: list.name,
		itemListOrder: 'https://schema.org/ItemListOrderAscending',
		numberOfItems: list.items.length,
		itemListElement: list.items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			url: item.url,
			...(item.description ? { description: item.description } : {})
		}))
	};
}

export function resourceCreativeWorkSchema(resource: {
	title: string;
	description: string;
	canonicalUrl: string;
	date: string;
	dateModified?: string;
	thumbnail: string;
	tags: string[];
	language: 'en' | 'bn' | 'mixed';
	genre: 'Prompt' | 'Word List';
}) {
	return {
		'@type': 'CreativeWork',
		'@id': `${resource.canonicalUrl}#resource`,
		name: resource.title,
		description: resource.description,
		url: resource.canonicalUrl,
		creator: {
			'@id': personId
		},
		isPartOf: {
			'@id': websiteId
		},
		datePublished: resource.date,
		dateModified: resource.dateModified ?? resource.date,
		keywords: resource.tags,
		image: absoluteUrl(resource.thumbnail),
		inLanguage: resource.language === 'mixed' ? ['en', 'bn'] : resource.language,
		isAccessibleForFree: true,
		genre: resource.genre
	} as unknown as Omit<WithContext<CreativeWork>, '@context'>;
}

export function definedTermSetSchema(terms: {
	name: string;
	url: string;
	items: { term: string; definition: string; url?: string }[];
}) {
	return {
		'@type': 'DefinedTermSet',
		'@id': `${terms.url}#glossary`,
		name: terms.name,
		url: `${terms.url}#glossary`,
		hasDefinedTerm: terms.items.map((item) => ({
			'@type': 'DefinedTerm',
			name: item.term,
			description: item.definition,
			...(item.url ? { url: item.url } : {}),
			inDefinedTermSet: { '@id': `${terms.url}#glossary` }
		}))
	};
}

export function contactPageSchema(page: { name: string; description: string; url: string }) {
	return {
		'@type': 'ContactPage',
		'@id': page.url,
		name: page.name,
		description: page.description,
		url: page.url,
		isPartOf: { '@id': websiteId },
		mainEntity: {
			'@id': personId
		},
		inLanguage: 'en'
	};
}

export function profilePageSchema(page: { name: string; description: string; url: string }) {
	return {
		'@type': 'ProfilePage',
		'@id': page.url,
		name: page.name,
		description: page.description,
		url: page.url,
		isPartOf: { '@id': websiteId },
		mainEntity: {
			'@id': personId
		},
		inLanguage: 'en'
	};
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url
		}))
	} satisfies Omit<WithContext<BreadcrumbList>, '@context'>;
}

/**
 * @deprecated Prefer `withSiteGraph` so every page also emits the shared
 * Person and WebSite entities. This remains for backwards compatibility and
 * simply wraps the given entities in a bare `@graph`.
 */
export function schemaGraph(items: unknown[]) {
	return {
		'@context': 'https://schema.org',
		'@graph': items
	};
}
