import { dev } from '$app/environment';
import type { WithContext, WebSite, Person, BlogPosting, BreadcrumbList } from 'schema-dts';

export const siteTitle = 'Suvro Ghosh';
export const siteTitleLong = 'Suvro Ghosh | Healthcare IT Architect & AI Specialist';
export const siteDescription = "Senior Healthcare IT Architect and former Health-Tech Founder bridging legacy clinical data and Applied AI. Notes on enterprise healthcare architecture, interoperability, and semantic data substrates.";

// Phase 0 Fix: Canonical domain resolution
export const siteUrl = dev ? 'http://localhost:5173' : 'https://www.suvroghosh.in';

export const socialUrls = [
    'https://github.com/suvrotica', // Fixed GitHub URI entity
    'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
];

// Phase 0 Fix: Correct missing Open Graph fallback
export const defaultOgImage = `${siteUrl}/images/IMG-20260427-WA0001.jpg`;

export const siteSEO = {
    title: siteTitleLong,
    description: siteDescription,
    canonicalUrl: siteUrl,
    ogImageUrl: defaultOgImage,
    ogImageAlt: 'Suvro Ghosh - Senior Healthcare IT Architect',
    keywords: [
        'Suvro Ghosh', 'Healthcare IT Architect', 'AI Specialist',
        'Applied AI in Healthcare', 'Enterprise Architecture', 'Healthcare Interoperability',
        'HL7', 'FHIR R4/R5', 'CDISC', 'Clinical Data Semantics', 'EHR Data Substrates', 'HIE', 'CTMS',
        'RAG', 'Agentic Workflows'
    ]
};

// Phase 0 Fix: Provide ID for entity cross-referencing
export const personSchema: WithContext<Person> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${siteUrl}/#person`,
    name: 'Suvro Ghosh',
    url: siteUrl,
    image: defaultOgImage,
    sameAs: socialUrls,
    jobTitle: ['Senior Healthcare IT Architect', 'Technical Founder', 'AI Data Specialist']
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

// Phase 0 Fix: Dynamic BlogPosting Schema Generator
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

// BreadcrumbList Schema Generator
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