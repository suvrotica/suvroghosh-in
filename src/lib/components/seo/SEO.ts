import { dev } from '$app/environment';
import type { WithContext, WebSite, Person, BlogPosting, BreadcrumbList } from 'schema-dts';
import { slugifyCategory } from '$lib/content/categories';
import { substackLinks } from '$lib/config/links';

export const siteTitle = 'Suvro Ghosh';
export const siteTitleLong =
	'Suvro Ghosh | Healthcare IT Architect & Clinical Data Systems Consultant';
export const siteDescription =
	'Healthcare IT architect and clinical data systems consultant based in Calcutta. Work spans HL7/FHIR interoperability, HIE, EHR data, SQL/ETL, clinical trial systems, and AI-ready healthcare data architecture. Also writes essays and satire on technology, illness, corruption, society, and Calcutta life.';

export const siteUrl = dev ? 'http://localhost:5173' : 'https://www.suvroghosh.in';

export const socialUrls = [
	substackLinks.profile,
	'https://www.youtube.com/@SuvroGhoshIN',
	'https://www.linkedin.com/in/suvro-ghosh-78a5aa278'
];

export const defaultOgImage = `${siteUrl}/images/IMG-20260427-WA0001.jpg`;
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
	ogImageAlt: 'Suvro Ghosh - Healthcare IT Architect & Clinical Data Systems Consultant',
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
	image: defaultOgImage,
	sameAs: socialUrls,
	jobTitle: ['Healthcare IT Architect', 'Clinical Data Systems Consultant']
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
		dateModified: post.dateModified ?? post.date,
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
		keywords: post.tags ?? [],
		inLanguage: 'en'
	};
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
}) {
	return {
		'@type': 'CollectionPage',
		'@id': page.url,
		name: page.name,
		description: page.description,
		url: page.url,
		isPartOf: { '@id': websiteId },
		about: page.about,
		inLanguage: 'en'
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
