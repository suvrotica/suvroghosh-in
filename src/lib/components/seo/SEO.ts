import { dev } from '$app/environment';
import type { WithContext, WebSite, Person } from 'schema-dts';

export const siteTitle = 'Suvro Ghosh';
export const siteTitleLong = 'Suvro Ghosh | Healthcare IT';
export const siteDescription = "Navigating the architecture of chaos. Notes on enterprise healthcare IT, data science, and philosophical pragmatism from Calcutta.";
;
export const siteUrl = dev ? 'http://localhost:5173' : 'https://suvroghosh.in';

export const socialUrls = [
	'https://github.com/suvroghosh',
	'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
];

export const siteSEO = {
    title: siteTitleLong,
    description: siteDescription,
    canonicalUrl: siteUrl,
    ogImageUrl: `${siteUrl}/images/photo.jpeg`,
    ogImageAlt: 'Suvro Ghosh Profile',
    keywords: [
        // Core Identity & Roles
        'Suvro Ghosh', 'Software Engineer', 'Senior Healthcare IT Architect', 'Data Scientist', 'Enterprise Architect',
        
        // Healthcare IT & Interoperability (High Value for Recruiters)
        'Healthcare IT', 'Health Informatics', 'HL7', 'FHIR', 'CDISC', 'Clinical Trials Data', 'Electronic Health Records', 'EHR', 'Health Information Exchange', 'HIE', 'Telemedicine Architecture',
        
        // Data Science & Engineering
        'Data Analytics', 'Machine Learning in Healthcare', 'Statistical Modeling', 'Database Engineering', 'SQL Server', 'Big Data', 'System Performance Optimization',
        
        // Philosophy & Geography
        'Tech Philosophy', 'Digital Garden', 'Calcutta', 'Kolkata', 'India', 'US Healthcare Systems', 'Gulf Digital Health',
        
        // Web Tech (Since you are building in modern SvelteKit)
        'SvelteKit', 'Web Architecture', 'Tech Blog'
    ]
};
export const personSchema: WithContext<Person> = {
	'@context': 'https://schema.org',
	'@type': 'Person',
	name: 'Suvro Ghosh',
	url: siteUrl,
	image: `${siteUrl}/images/IMG-20251202-WA0009.jpg`,
	sameAs: socialUrls,
	jobTitle: ['Software Engineer', 'Writer', 'Philosopher'],
	worksFor: {
		'@type': 'Organization',
		name: 'Self-Employed'
	},
    address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kolkata',
        addressRegion: 'West Bengal',
        addressCountry: 'India'
    }
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