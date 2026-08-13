import type { LearningSource, KnowledgeFreshness } from '$lib/games/crossword/types';
import { HEALTHCARE_IT_REVIEWED_AT } from './model';

function source(
	title: string,
	url: string,
	publisher: string,
	knowledgeKind: KnowledgeFreshness,
	note?: string
): LearningSource {
	const categoryNote = `Knowledge category: ${knowledgeKind.replaceAll('-', ' ')}.`;
	return {
		title,
		url,
		publisher,
		accessedOrReviewed: HEALTHCARE_IT_REVIEWED_AT,
		note: note ? `${note} ${categoryNote}` : categoryNote
	};
}

/**
 * Primary and standards-publisher references used by the pack. Entries receive
 * resolved copies of these records so the exported pack remains serializable.
 */
export const healthcareItSources = {
	fhirOverview: source(
		'FHIR overview',
		'https://hl7.org/fhir/overview.html',
		'HL7 International',
		'version-sensitive',
		'Concepts are stable; examples should be checked against the named FHIR release.'
	),
	fhirProfiling: source(
		'Profiling FHIR',
		'https://hl7.org/fhir/profiling.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirValueSet: source(
		'FHIR ValueSet resource',
		'https://hl7.org/fhir/valueset.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirTerminology: source(
		'Using Codes in FHIR',
		'https://hl7.org/fhir/terminologies.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirTerminologyService: source(
		'FHIR terminology service',
		'https://hl7.org/fhir/terminology-service.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirProvenance: source(
		'FHIR Provenance resource',
		'https://hl7.org/fhir/provenance.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirAuditEvent: source(
		'FHIR AuditEvent resource',
		'https://hl7.org/fhir/auditevent.html',
		'HL7 International',
		'version-sensitive'
	),
	fhirConsent: source(
		'FHIR Consent resource',
		'https://hl7.org/fhir/consent.html',
		'HL7 International',
		'version-sensitive'
	),
	hl7v2: source(
		'HL7 Version 2 Product Suite',
		'https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185',
		'HL7 International',
		'version-sensitive'
	),
	ehrAndHie: source(
		'Health IT and HIE frequently asked questions',
		'https://healthit.gov/health-it-basics/hit-hie-faqs/',
		'Office of the National Coordinator for Health Information Technology',
		'jurisdiction-specific',
		'U.S. examples; the EHR/EMR distinction is presented as educational guidance, not a universal legal definition.'
	),
	ehrBenefits: source(
		'Electronic health records and their benefits',
		'https://healthit.gov/health-it-basics/benefits-ehrs/',
		'Office of the National Coordinator for Health Information Technology',
		'jurisdiction-specific'
	),
	cds: source(
		'Clinical decision support',
		'https://healthit.gov/clinical-quality-and-safety/clinical-decision-support/',
		'Office of the National Coordinator for Health Information Technology',
		'recommended-practice'
	),
	cpoe: source(
		'Computerized Provider Order Entry',
		'https://psnet.ahrq.gov/primer/computerized-provider-order-entry',
		'Agency for Healthcare Research and Quality',
		'recommended-practice'
	),
	snomed: source(
		'SNOMED CT Starter Guide',
		'https://docs.snomed.org/snomed-ct-practical-guides/snomed-ct-starter-guide',
		'SNOMED International',
		'version-sensitive'
	),
	loinc: source(
		"LOINC Users' Guide",
		'https://loinc.org/kb/users-guide/',
		'Regenstrief Institute',
		'version-sensitive'
	),
	rxnorm: source(
		'RxNorm overview',
		'https://www.nlm.nih.gov/research/umls/rxnorm/overview.html',
		'U.S. National Library of Medicine',
		'version-sensitive',
		'RxNorm scope is U.S.-specific and its content is updated frequently.'
	),
	icd: source(
		'International Classification of Diseases',
		'https://www.who.int/standards/classifications/classification-of-diseases',
		'World Health Organization',
		'version-sensitive'
	),
	cdiscFoundational: source(
		'CDISC Foundational Standards',
		'https://www.cdisc.org/standards/foundational',
		'Clinical Data Interchange Standards Consortium',
		'version-sensitive'
	),
	sdtm: source(
		'Study Data Tabulation Model',
		'https://www.cdisc.org/standards/foundational/sdtm',
		'Clinical Data Interchange Standards Consortium',
		'version-sensitive'
	),
	fdaSourceData: source(
		'Electronic Source Data in Clinical Investigations',
		'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/electronic-source-data-clinical-investigations',
		'U.S. Food and Drug Administration',
		'jurisdiction-specific'
	),
	postgresConcepts: source(
		'PostgreSQL tutorial: concepts',
		'https://www.postgresql.org/docs/current/tutorial-concepts.html',
		'PostgreSQL Global Development Group',
		'stable',
		'Used for relational-model and SQL concepts, not PostgreSQL-specific trivia.'
	),
	vaVista: source(
		'VistA monograph',
		'https://www.voa.va.gov/DocumentView.aspx?DocumentID=3851',
		'U.S. Department of Veterans Affairs',
		'stable',
		'Historical primary source for M/MUMPS in a long-lived clinical system.'
	),
	w3cProv: source(
		'PROV overview',
		'https://www.w3.org/TR/prov-overview/',
		'World Wide Web Consortium',
		'stable'
	),
	openLineage: source(
		'About OpenLineage',
		'https://openlineage.io/docs/',
		'OpenLineage project',
		'recommended-practice'
	),
	nistStatistics: source(
		'NIST/SEMATECH e-Handbook of Statistical Methods',
		'https://www.itl.nist.gov/div898/handbook/',
		'National Institute of Standards and Technology',
		'stable'
	),
	ahrqMeasures: source(
		'AHRQ Quality Indicators',
		'https://qualityindicators.ahrq.gov/',
		'Agency for Healthcare Research and Quality',
		'jurisdiction-specific'
	),
	nihReproducibility: source(
		'Enhancing reproducibility through rigor and transparency',
		'https://www.grants.nih.gov/policy-and-compliance/policy-topics/reproducibility',
		'U.S. National Institutes of Health',
		'recommended-practice'
	),
	nistLeastPrivilege: source(
		'Least privilege — CSRC glossary',
		'https://csrc.nist.gov/glossary/term/least_privilege',
		'National Institute of Standards and Technology',
		'stable'
	),
	nistSecurity: source(
		'Security and Privacy Controls for Information Systems and Organizations (SP 800-53 Rev. 5)',
		'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final',
		'National Institute of Standards and Technology',
		'recommended-practice'
	),
	hhsMinimumNecessary: source(
		'Minimum Necessary Requirement',
		'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html',
		'U.S. Department of Health and Human Services',
		'jurisdiction-specific'
	),
	nistAiRmf: source(
		'Artificial Intelligence Risk Management Framework',
		'https://www.nist.gov/itl/ai-risk-management-framework',
		'National Institute of Standards and Technology',
		'recommended-practice',
		'The AI RMF is voluntary and is being revised; use it as risk-management guidance, not a compliance claim.'
	),
	nistAiGen: source(
		'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile',
		'https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence',
		'National Institute of Standards and Technology',
		'recommended-practice'
	)
} as const satisfies Record<string, LearningSource>;

export type HealthcareSourceId = keyof typeof healthcareItSources;

export function resolveSources(ids: readonly HealthcareSourceId[]): LearningSource[] {
	return ids.map((id) => ({ ...healthcareItSources[id] }));
}
