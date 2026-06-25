import { dev } from '$app/environment';
import type { WithContext, WebSite, Person, BlogPosting, BreadcrumbList } from 'schema-dts';

export const siteTitle = 'Suvro Ghosh';
export const siteTitleLong =
	'Suvro Ghosh | Healthcare IT Architect & Clinical Data Systems Consultant';
export const siteDescription =
	'Healthcare IT architect and clinical data systems consultant based in Calcutta. Work spans HL7/FHIR interoperability, HIE, EHR data, SQL/ETL, clinical trial systems, and AI-ready healthcare data architecture. Also writes essays and satire on technology, illness, corruption, society, and Calcutta life.';

export const siteUrl = dev ? 'http://localhost:5173' : 'https://www.suvroghosh.in';

export const socialUrls = [
	'https://www.youtube.com/@SuvroGhoshIN',
	'https://www.linkedin.com/in/suvro-ghosh-78a5aa278'
];

export const defaultOgImage = `${siteUrl}/images/IMG-20260427-WA0001.jpg`;

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
	'@id': `${siteUrl}/#person`,
	name: 'Suvro Ghosh',
	url: siteUrl,
	image: defaultOgImage,
	sameAs: socialUrls,
	jobTitle: ['Healthcare IT Architect', 'Clinical Data Systems Consultant']
};

export const websiteSchema: WithContext<WebSite> = {
	'@context': 'https://schema.org',
	'@type': 'WebSite',
	name: siteTitle,
	url: siteUrl,
	description: siteDescription,
	publisher: {
		'@id': `${siteUrl}/#person`
	},
	inLanguage: 'en-US'
};

export function blogPostingSchema(post: {
	title: string;
	description: string;
	date: string;
	dateModified?: string;
	thumbnail?: string;
	category: string;
	slug: string;
	canonicalUrl: string;
	wordCount?: number;
}) {
	const schema: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: post.title,
		description: post.description,
		image: post.thumbnail ? `${siteUrl}${post.thumbnail}` : defaultOgImage,
		datePublished: post.date,
		dateModified: post.dateModified ?? post.date,
		author: {
			'@type': 'Person',
			'@id': `${siteUrl}/#person`,
			name: 'Suvro Ghosh',
			url: siteUrl
		},
		publisher: {
			'@type': 'Person',
			'@id': `${siteUrl}/#person`,
			name: 'Suvro Ghosh'
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': post.canonicalUrl
		},
		articleSection: post.category,
		inLanguage: 'en'
	};
	if (post.wordCount) {
		schema.wordCount = post.wordCount;
	}
	return schema as unknown as WithContext<BlogPosting>;
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url
		}))
	} satisfies WithContext<BreadcrumbList>;
}
