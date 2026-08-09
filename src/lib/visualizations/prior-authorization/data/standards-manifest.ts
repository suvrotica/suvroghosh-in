export type StandardsManifestRow = Readonly<{
	id: 'rule-era' | 'current-reference';
	label: string;
	status: 'final-rule-recommendation-baseline' | 'published-hl7-reference';
	verifiedOn: '2026-08-09';
	fhir: 'R4';
	crd: string;
	dtr: string;
	pas: string;
	note: string;
	sources: readonly string[];
}>;

export const STANDARDS_VERIFIED_ON = '2026-08-09' as const;
export const STANDARDS_VERIFIED_LABEL = '9 August 2026' as const;

export const STANDARDS_MANIFEST = Object.freeze([
	Object.freeze({
		id: 'rule-era',
		label: 'CMS-0057-F rule-era baseline/recommendations',
		status: 'final-rule-recommendation-baseline',
		verifiedOn: STANDARDS_VERIFIED_ON,
		fhir: 'R4',
		crd: '2.0.1',
		dtr: '2.0.0',
		pas: '2.0.1',
		note: 'CMS-0057-F requires the FHIR-based API baseline and recommends these Da Vinci implementation-guide versions; it does not mandate CRD, DTR, and PAS by name.',
		sources: Object.freeze([
			'https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/standards-implementation-guides',
			'https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability'
		])
	}),
	Object.freeze({
		id: 'current-reference',
		label: 'Current published HL7 reference used to verify this essay',
		status: 'published-hl7-reference',
		verifiedOn: STANDARDS_VERIFIED_ON,
		fhir: 'R4',
		crd: '2.2.1',
		dtr: '2.2.0',
		pas: '2.2.1',
		note: 'These stable published guides were checked for workflow semantics; they are not presented as a CMS mandate by name.',
		sources: Object.freeze([
			'https://hl7.org/fhir/us/davinci-crd/2.2.1/',
			'https://hl7.org/fhir/us/davinci-dtr/2.2.0/',
			'https://hl7.org/fhir/us/davinci-pas/2.2.1/en/specification.html'
		])
	})
] as const satisfies readonly StandardsManifestRow[]);

export type ClaimLedgerEntry = Readonly<{
	id: string;
	claim: string;
	classification: 'final-rule' | 'proposed-rule' | 'ig-guidance' | 'model-assumption';
	verifiedOn: '2026-08-09';
	sources: readonly string[];
}>;

export const CLAIM_LEDGER = Object.freeze([
	Object.freeze({
		id: 'cms-api-dates',
		claim:
			'CMS API compliance dates begin primarily on 1 January 2027 and vary by payer type, rating period, or plan year.',
		classification: 'final-rule',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze([
			'https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f'
		])
	}),
	Object.freeze({
		id: 'guides-recommended-not-named-mandate',
		claim:
			'CMS-0057-F recommends applicable CRD, DTR, and PAS guides but does not mandate those implementation guides by name.',
		classification: 'final-rule',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze([
			'https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/standards-implementation-guides'
		])
	}),
	Object.freeze({
		id: 'pas-sync-pended-business',
		claim:
			'PAS $submit is synchronous; pended is a business result and a submitting client awaiting the final result uses the subscription pattern.',
		classification: 'ig-guidance',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze(['https://hl7.org/fhir/us/davinci-pas/2.2.1/en/specification.html'])
	}),
	Object.freeze({
		id: 'x12-enforcement-discretion',
		claim:
			'Under enforcement discretion, an all-FHIR electronic prior-authorization API workflow in scope may omit X12 278; this does not abolish X12 generally.',
		classification: 'final-rule',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze([
			'https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/hipaa-transaction-enforcement-discretion'
		])
	}),
	Object.freeze({
		id: 'cms-0062-p-proposed',
		claim:
			'CMS-0062-P remained a proposal on the verification date and is never blended into the final-rule baseline.',
		classification: 'proposed-rule',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze([
			'https://www.federalregister.gov/documents/2026/04/14/2026-07205/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-interoperability-standards'
		])
	}),
	Object.freeze({
		id: 'modeled-timings',
		claim:
			'The 400 ms transaction, eleven-day journey, and every comparative duration are fictional explanatory assumptions, not observed performance claims.',
		classification: 'model-assumption',
		verifiedOn: STANDARDS_VERIFIED_ON,
		sources: Object.freeze([])
	})
] as const satisfies readonly ClaimLedgerEntry[]);

export const STANDARD_REFERENCES = Object.freeze({
	'fhir-r4': 'https://hl7.org/fhir/R4/',
	'fhir-r4-service-request': 'https://hl7.org/fhir/R4/servicerequest.html',
	'fhir-r4-appointment': 'https://hl7.org/fhir/R4/appointment.html',
	'davinci-crd-2.2.1': 'https://hl7.org/fhir/us/davinci-crd/2.2.1/',
	'cds-hooks-order-sign': 'https://hl7.org/fhir/us/davinci-crd/2.2.1/hooks.html',
	'davinci-dtr-2.2.0': 'https://hl7.org/fhir/us/davinci-dtr/2.2.0/',
	'davinci-pas-2.2.1': 'https://hl7.org/fhir/us/davinci-pas/2.2.1/en/specification.html',
	'model-assumption-fictional-policy': '#scenario-assumptions',
	'model-assumption-portal-workflow': '#scenario-assumptions'
} as const);
