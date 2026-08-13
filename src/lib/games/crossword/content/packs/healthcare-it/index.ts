import { CROSSWORD_PACK_SCHEMA_VERSION, type CrosswordPack } from '$lib/games/crossword/types';
import { healthcareItPuzzles } from './puzzles';

export { healthcareItConcepts } from './concepts';
export { healthcareItPuzzles } from './puzzles';
export { healthcareItSources } from './sources';

export const healthcareItPack = {
	schemaVersion: CROSSWORD_PACK_SCHEMA_VERSION,
	id: 'healthcare-it',
	title: 'The Healthcare IT Crossword: Systems Rounds',
	description:
		'Thirteen sourced rounds for refreshing interoperability, clinical systems, terminology, research data, engineering, analytics, governance and responsible AI.',
	topics: [
		{
			id: 'interoperability-hie',
			title: 'Interoperability and HIE',
			shortTitle: 'Interoperability',
			description:
				'Messages, resources, profiles, identity, directories, terminology, consent, provenance and exchange architecture.'
		},
		{
			id: 'ehr-clinical-systems',
			title: 'EHR and clinical systems',
			shortTitle: 'Clinical systems',
			description:
				'Records, patient movement, orders, decision support, documentation and real clinical workflow.'
		},
		{
			id: 'clinical-terminology',
			title: 'Clinical terminology',
			shortTitle: 'Terminology',
			description:
				'What major vocabularies are for, how they differ, and why mappings and value sets matter.'
		},
		{
			id: 'clinical-research-data',
			title: 'Clinical and research data',
			shortTitle: 'Research data',
			description:
				'Protocols, electronic capture, CDISC standards, study tabulations and traceability.'
		},
		{
			id: 'data-engineering-modernization',
			title: 'Data engineering and modernization',
			shortTitle: 'Modernization',
			description:
				'SQL, legacy data models, pipelines, lineage, migration, reconciliation and operational evidence.'
		},
		{
			id: 'analytics-statistics-reporting',
			title: 'Analytics, statistics and reporting',
			shortTitle: 'Analytics',
			description: 'Measures, dimensions, populations, missing data and reproducible reporting.'
		},
		{
			id: 'security-privacy-governance',
			title: 'Security, privacy and governance',
			shortTitle: 'Governance',
			description:
				'Identity, permission, least privilege, encryption, consent and durable accountability.'
		},
		{
			id: 'ai-readiness-modernization',
			title: 'AI readiness and responsible modernization',
			shortTitle: 'AI readiness',
			description: 'Data shape, leakage, drift, evaluation, human review and workflow integration.'
		},
		{
			id: 'mixed-systems',
			title: 'Mixed systems round',
			shortTitle: 'Mixed systems',
			description:
				'A career-refresh path across handoffs, meanings, populations, controls and consequences.'
		}
	],
	levels: [
		{
			id: 'refresh',
			title: 'Refresh',
			description:
				'Direct definitions, familiar contexts, generous crossings and early teaching support.'
		},
		{
			id: 'working',
			title: 'Working Knowledge',
			description:
				'Mechanisms, useful comparisons and scenarios drawn from ordinary professional work.'
		},
		{
			id: 'architect',
			title: 'Architect',
			description:
				'Boundaries, consequences, failure modes and tradeoffs rather than obscure vocabulary.'
		},
		{
			id: 'adaptive',
			title: 'Adaptive Mix',
			description:
				'Begins around working knowledge and lets review history shape what returns next.'
		}
	],
	puzzles: healthcareItPuzzles,
	theme: {
		accent: '#8a4b2a',
		accentSoft: '#d7aa78',
		gridPaper: '#f2e7cf',
		illustration: '/images/games/healthcare-it-crossword-systems-rounds-cover.webp'
	}
} satisfies CrosswordPack;

export default healthcareItPack;
