export interface UmlSampleArticle {
	id: string;
	slug: string;
	title: string;
	category: string;
	summary: string;
	markdown: string;
}

export const CURATED_UML_SAMPLES: readonly UmlSampleArticle[] = [
	{
		id: 'openhie-exchange',
		slug: 'openhie-immunization-exchange',
		title: 'How a Rural Immunization Record Crosses a National Health Exchange',
		category: 'Health Systems & Architecture',
		summary:
			'Full-spectrum example with classes, concrete instance IDs, deployment nodes, actor workflows, and SLA timings.',
		markdown: `## Point-of-Care Capture at the Rural Clinic

When an Auxiliary Nurse Midwife records a measles-rubella dose on a clinic tablet (instance \`ENC-402\` at facility \`PHC-KOL-19\`), the PointOfCareApp writes an encrypted FHIR Encounter bundle into a local SQLite queue. Even when cellular connectivity drops, the local queue preserves the signed payload until network reachability returns.

## Mediation and Identity Resolution

Within 5 seconds of reconnection, the ClinicTablet establishes a mutual-TLS channel with the OpenHIMGateway hosted in the NationalExchangeCluster. The InteroperabilityMediator validates the clinic certificate and queries the ClientRegistry using the patient's health identifier (\`HID-8841-22\`) to resolve the canonical Master Patient Index record.

## Persistence and District Surveillance

If the ClientRegistry confirms a unique demographic match within 12 seconds, the InteroperabilityMediator executes two actions in parallel: it commits the verified encounter to the SharedHealthRecord database and increments the DistrictSurveillanceService coverage counter. Otherwise, if the identity check returns an ambiguous match, the encounter transitions to the Quarantined state for manual reconciliation by a DistrictHealthOfficer within 24 hours.`
	},
	{
		id: 'prior-authorization-machine',
		slug: 'the-prior-authorization-machine',
		title: 'The Prior Authorization Machine: How Clinical Necessity Becomes Bureaucratic Friction',
		category: 'Essays & Policy',
		summary:
			'Conceptual policy & workflow essay—supports conceptual Class, Activity, State Machine, and Sequence views, while honestly reporting missing timing/deployment data.',
		markdown: `## The Clinical Request and the Payer Boundary

A treating Physician diagnoses a patient and submits a PriorAuthorizationRequest for a specialized treatment protocol. Rather than flowing directly to care delivery, the request enters the PayerReviewBoundary, where an AutomatedRulesEngine screens the submission against proprietary UtilizationPolicy criteria.

## Triage, Denial Loops, and Peer-to-Peer Escalation

If the AutomatedRulesEngine finds every policy code satisfied, the PriorAuthorizationRequest transitions from Submitted to Approved. However, when a documentation nuance is missing, the request enters PendingDenial and triggers an administrative rejection notice back to the ClinicStaff.

## The Appeal Burden

To contest a denial, the Physician must request a PeerToPeerReview with a PayerMedicalDirector. The Physician presents clinical evidence from the PatientChart, while the PayerMedicalDirector evaluates whether an exception override applies before issuing a FinalDetermination.`
	},
	{
		id: 'anatomy-of-an-essay',
		slug: 'anatomy-of-an-essay',
		title: 'Anatomy of an Essay: Claims, Counterarguments, and Evidence',
		category: 'Writing & Epistemology',
		summary:
			'Purely conceptual humanities text demonstrating how conceptual UML models rhetorical structure without pretending to be software architecture.',
		markdown: `## The Central Thesis and Supporting Grounds

Every persuasive Essay opens with a GoverningThesis that frames a contested question for the Reader. To sustain that claim, the Author constructs EvidenceClusters—empirical observations, historical primary sources, or formal deductions—that link directly to the GoverningThesis.

## Engaging the Counterargument

A resilient argument does not ignore objections. When a Counterargument challenges an underlying assumption, the Author introduces a QualificationBridge that either narrows the scope of the GoverningThesis or demonstrates why the objection fails under scrutiny.

## Synthesis and Resolution

Finally, the ConclusionSection synthesizes the refined claim with its supporting grounds, leaving the Reader with a coherent conceptual model rather than an unexamined slogan.`
	}
] as const;
