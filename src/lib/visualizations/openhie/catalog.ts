import type { ComponentDescription, ScenarioDescription, Settings } from './types';

export const MODEL_VERSION = 'openhie-teaching-v1';

export const SOURCES = Object.freeze([
	Object.freeze({
		title: 'OpenHIE architecture',
		url: 'https://guides.ohie.org/arch-spec/architecture-specification/overview-of-the-architecture'
	}),
	Object.freeze({
		title: 'Client Registry',
		url: 'https://guides.ohie.org/arch-spec/openhie-component-specifications-1/client-registry'
	}),
	Object.freeze({
		title: 'Interoperability Layer',
		url: 'https://guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-interoperability-layer-iol'
	}),
	Object.freeze({
		title: 'Shared Health Record',
		url: 'https://guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-shared-health-record-shr'
	}),
	Object.freeze({
		title: 'Save patient-level clinical data',
		url: 'https://guides.ohie.org/arch-spec/introduction/shared-health-record/save-patient-level-clinical-data-workflow'
	}),
	Object.freeze({
		title: 'Query patient-level clinical data',
		url: 'https://guides.ohie.org/arch-spec/introduction/shared-health-record/query-patient-level-clinical-data-workflow'
	})
]);

export const DEFAULT_SETTINGS: Settings = Object.freeze({
	identityKnown: true,
	terminologyMapped: true,
	authorized: true,
	serviceAvailable: true
});

export const SCENARIOS: readonly ScenarioDescription[] = Object.freeze(
	(
		[
			{
				id: 'success',
				title: 'The ordinary journey',
				description:
					'One patient, two local identifiers, and a report that reaches the next clinic.',
				recovery: null
			},
			{
				id: 'ambiguous',
				title: 'Two possible people',
				description:
					'Identity evidence is insufficient. The model stops the link for human review.',
				recovery: 'identityKnown'
			},
			{
				id: 'terminology',
				title: 'A code without an agreement',
				description: 'The lab result exists, but its local code has no governed shared mapping.',
				recovery: 'terminologyMapped'
			},
			{
				id: 'denied',
				title: 'The wrong permission',
				description:
					'Hospital B can identify the patient but is not authorized to read the shared clinical record.',
				recovery: 'authorized'
			},
			{
				id: 'outage',
				title: 'The cupboard is unavailable',
				description:
					'The shared-record service cannot acknowledge a write. The source keeps its original.',
				recovery: 'serviceAvailable'
			},
			{
				id: 'duplicate',
				title: 'The same envelope, again',
				description:
					'A lab submission is replayed with its original durable event key. One clinical result remains.',
				recovery: null
			}
		] satisfies ScenarioDescription[]
	).map((item) => Object.freeze(item))
);

export const COMPONENTS: readonly ComponentDescription[] = Object.freeze(
	(
		[
			{
				id: 'clinic',
				title: 'Clinic A',
				plain: 'Where the first encounter is recorded.',
				role: 'A point-of-service system owns the original encounter and its local patient identifier.',
				limits: 'A local identifier is not automatically meaningful at another institution.',
				metaphor: 'The first desk and its own register.'
			},
			{
				id: 'iol',
				title: 'Interoperability Layer',
				plain: 'The controlled entrance and message coordinator.',
				role: 'Routes exchanges, authenticates trusted systems, applies configured authorization, and records an audit trail.',
				limits:
					'It cannot manufacture missing facts or turn an uncertain identity into a safe match.',
				metaphor: 'The dispatch desk, with a door and a ledger.'
			},
			{
				id: 'client',
				title: 'Client Registry',
				plain: 'Which local identities refer to this person?',
				role: 'Maintains demographics, patient identifiers and their governed linkage across systems.',
				limits:
					'This is identity infrastructure, not the patient’s clinical record. The demo uses declared matches, not a probabilistic algorithm.',
				metaphor: 'An index connecting the names on different registers.'
			},
			{
				id: 'facility',
				title: 'Facility Registry',
				plain: 'Which place delivered the service?',
				role: 'Resolves the source facility to a shared facility identity.',
				limits:
					'Identifying a facility does not promise a free bed, appointment or referral acceptance.',
				metaphor: 'A directory of places, not their calendars.'
			},
			{
				id: 'worker',
				title: 'Health Worker Registry',
				plain: 'Who recorded the care?',
				role: 'Resolves the source health worker to a shared workforce identity.',
				limits:
					'A workforce identity is distinct from a login, access token or permission to read a particular chart.',
				metaphor: 'The staff directory, not the keys to every room.'
			},
			{
				id: 'terminology',
				title: 'Terminology Service',
				plain: 'Do these codes carry the agreed meaning?',
				role: 'Validates teaching codes and applies the explicitly configured local-to-shared lab-code mapping.',
				limits:
					'A mapping is a governed agreement. The service does not infer clinical equivalence from similar-looking text.',
				metaphor: 'A checked dictionary, with the edition written on it.'
			},
			{
				id: 'shr',
				title: 'Shared Health Record',
				plain: 'The shared clinical subset that authorized systems can retrieve.',
				role: 'Stores the normalized encounter and lab result with source identity, time and provenance.',
				limits:
					'A shared subset is not a complete copy of every source chart, an analytics warehouse, or proof that care occurred.',
				metaphor: 'A shared reference cupboard, with labels that survive the journey.'
			},
			{
				id: 'lab',
				title: 'Laboratory',
				plain: 'Where the result is originally recorded.',
				role: 'Submits one synthetic laboratory observation using its own patient and code identifiers.',
				limits:
					'This teaching model omits the complete lab order, specimen, Task and status workflow.',
				metaphor: 'A second desk with a different form.'
			},
			{
				id: 'hospital',
				title: 'Hospital B',
				plain: 'Where the patient needs the information next.',
				role: 'Resolves its local patient identity and requests the available shared clinical data through the IOL.',
				limits:
					'Finding an identity does not grant access. An empty or denied response is not a normal clinical result.',
				metaphor: 'The next desk, which should not require the patient to become the courier.'
			}
		] satisfies ComponentDescription[]
	).map((item) => Object.freeze(item))
);

export const ASSUMPTIONS: readonly string[] = Object.freeze([
	'Every person, organisation, identifier, event and timestamp is synthetic. No patient data is entered or fetched.',
	'This is a deterministic explanatory model of selected identity, clinical-save and clinical-query exchanges, not an OpenHIE deployment or conformance test.',
	'Every exchange crosses the IOL. A workflow uses the services it needs; the diagram is not a compulsory serial tour through every registry.',
	'Identity resolution is a declared teaching decision. Ambiguous candidates require manual review; no matching probability or clinical inference is calculated.',
	'Facility and worker assertions are curated fixtures. Workforce identification is distinct from system authentication and record-access authorization.',
	'Clinical codes use an explicitly fictional teaching vocabulary. The displayed mapping illustrates a governed agreement, not a claim of real clinical equivalence.',
	'The lab step is a clinical-result submission, not a complete order, specimen, Task, status, notification or referral implementation.',
	'Authentication, authorization and consent-related policy are simplified to configured gates. Consent is not presented as a mandatory additional OpenHIE component.',
	'The duplicate guard is a selected demo policy using a stable source event key. OpenHIE alone does not guarantee idempotency for every implementation.',
	'Occurred, source-recorded and exchanged times are distinct authored timestamps. They are not measured latency, patient waiting time or promised performance. Playback speed changes presentation only.'
]);
