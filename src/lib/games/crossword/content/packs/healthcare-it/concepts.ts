import type { HealthcareConcept } from './model';
import { resolveSources, type HealthcareSourceId } from './sources';

type ConceptDraft = {
	answer: string;
	displayAnswer?: string;
	clue: string;
	nudge: string;
	bridge: string;
	contrast: string;
	obvious: string;
	definition: string;
	why: string;
	example: string;
	confusion: string;
	related: string[];
	sourceIds: HealthcareSourceId[];
	tags: string[];
	freshness?: HealthcareConcept['learning']['freshness'];
	goDeeper?: string;
};

function defineConcept(id: string, draft: ConceptDraft): HealthcareConcept {
	const displayAnswer = draft.displayAnswer ?? draft.answer;
	const revealPosition = Math.floor((draft.answer.length - 1) / 2);
	return {
		id,
		answer: draft.answer,
		...(draft.displayAnswer ? { displayAnswer: draft.displayAnswer } : {}),
		clue: draft.clue,
		hints: [
			{ kind: 'nudge', text: draft.nudge },
			{ kind: 'plain-language', text: draft.bridge },
			{ kind: 'contrast', text: draft.contrast },
			{
				kind: 'letter',
				text: `Grid position ${revealPosition + 1} is ${draft.answer[revealPosition]}.`,
				revealPositions: [revealPosition]
			},
			{ kind: 'nearly-obvious', text: draft.obvious },
			{
				kind: 'reveal',
				text: `The answer is ${displayAnswer}. ${draft.definition}`,
				revealPositions: [...draft.answer].map((_, index) => index)
			}
		],
		learning: {
			definition: draft.definition,
			whyItMatters: draft.why,
			example: draft.example,
			commonConfusion: draft.confusion,
			related: draft.related,
			freshness: draft.freshness ?? 'stable',
			sources: resolveSources(draft.sourceIds),
			...(draft.goDeeper ? { goDeeper: draft.goDeeper } : {})
		},
		tags: draft.tags
	};
}

export const healthcareItConcepts: Record<string, HealthcareConcept> = {
	fhir: defineConcept('fhir', {
		answer: 'FHIR',
		clue: 'The exchange standard whose name sounds combustible; the implementation guide is usually less warm.',
		nudge: 'Think modern health-data exchange, not a fire inspection.',
		bridge:
			'It represents clinical and administrative information as modular units and supports familiar web exchange patterns.',
		contrast:
			'The older version-two family usually sends delimited event messages; this family is organized around reusable data units.',
		obvious: 'Its expansion is Fast Healthcare Interoperability Resources.',
		definition:
			"FHIR is HL7's standard for exchanging healthcare information electronically using modular resources and defined exchange mechanisms.",
		why: 'It gives implementers a shared data model and API vocabulary while still requiring concrete implementation agreements.',
		example:
			'A patient-facing application reads MedicationRequest and Observation resources from an authorized server.',
		confusion:
			'A base specification does not by itself make two implementations interoperable; profiles, terminology and workflow agreements still matter.',
		related: ['resource', 'profile', 'implementation guide', 'REST API'],
		sourceIds: ['fhirOverview'],
		freshness: 'version-sensitive',
		tags: [
			'interoperability',
			'api',
			'standard',
			'acronym',
			'expansion:Fast Healthcare Interoperability Resources'
		]
	}),
	resource: defineConcept('resource', {
		answer: 'RESOURCE',
		clue: 'A modular FHIR packet of meaning—not, despite the project plan, an infinitely available engineer.',
		nudge: 'Think of the basic exchangeable building block.',
		bridge:
			'It packages a recognizable healthcare concept with common metadata and a defined structure.',
		contrast:
			'A profile constrains one of these; an implementation guide assembles rules for a whole use case.',
		obvious: 'Patient, Observation and MedicationRequest are examples of this FHIR building block.',
		definition:
			'A FHIR resource is a modular information structure used to represent an identifiable healthcare concept.',
		why: 'Common building blocks allow different workflows to reuse consistent structures instead of inventing a new message model each time.',
		example:
			'An Observation can carry a laboratory result and link it to the patient, encounter and performer.',
		confusion: 'It is not automatically a database row or a complete clinical document.',
		related: ['FHIR', 'profile', 'reference', 'Bundle'],
		sourceIds: ['fhirOverview'],
		freshness: 'version-sensitive',
		tags: ['interoperability', 'fhir', 'data-model']
	}),
	profile: defineConcept('profile', {
		answer: 'PROFILE',
		clue: 'The constraints that tell a generous base resource which freedoms this project has cancelled.',
		nudge: 'Think conformance rules for a particular context.',
		bridge:
			'It narrows or extends a base information model so senders and receivers make the same local promises.',
		contrast:
			'It is one conformance artifact; an implementation guide packages a coherent set of artifacts and narrative.',
		obvious: 'In FHIR, this is a StructureDefinition whose derivation is constraint.',
		definition:
			'A FHIR profile defines constraints and extensions on a base resource or data type for a particular use.',
		why: 'The broad base standard permits many valid representations; agreed constraints make validation and exchange predictable.',
		example:
			'A national guide requires particular Patient identifiers and binds selected elements to named value sets.',
		confusion:
			'A profile does not replace the base resource and is not the same as a user account.',
		related: ['implementation guide', 'StructureDefinition', 'validation', 'value set'],
		sourceIds: ['fhirProfiling'],
		freshness: 'version-sensitive',
		tags: ['interoperability', 'fhir', 'conformance']
	}),
	loinc: defineConcept('loinc', {
		answer: 'LOINC',
		clue: 'The terminology trying to stop “glucose” entering the warehouse under forty-seven local aliases.',
		nudge: 'Think observations and measurements, not billing.',
		bridge:
			'It supplies standard identifiers for laboratory tests, clinical observations and documents.',
		contrast:
			'The broad clinical terminology covers findings and meanings; the drug vocabulary normalizes medicines; the disease classification groups conditions.',
		obvious: 'Its expansion begins Logical Observation Identifiers.',
		definition:
			'LOINC is a standard terminology for identifying laboratory tests, measurements, clinical observations and documents.',
		why: 'A shared observation identifier lets systems compare and aggregate results despite different local test names.',
		example:
			'Several hospitals map their local serum-glucose test names to the same standard observation concept.',
		confusion:
			'It usually identifies what was observed, not every possible coded result or clinical interpretation.',
		related: ['SNOMED CT', 'mapping', 'terminology service', 'Observation'],
		sourceIds: ['loinc'],
		freshness: 'version-sensitive',
		tags: [
			'terminology',
			'laboratory',
			'normalization',
			'acronym',
			'expansion:Logical Observation Identifiers Names and Codes'
		]
	}),
	mapping: defineConcept('mapping', {
		answer: 'MAPPING',
		clue: 'The work required when two code systems insist they meant approximately the same thing.',
		nudge: 'Think translation with declared semantics.',
		bridge:
			'It records a relationship between concepts or fields in different models so data can cross a boundary.',
		contrast:
			'Normalization chooses a common representation; this work must also preserve equivalence, narrower-than or broader-than relationships.',
		obvious: 'A ConceptMap is one FHIR artifact used to express this cross-system relationship.',
		definition:
			'Mapping relates concepts, codes or data elements in one system to corresponding elements in another.',
		why: 'Explicit relationships make transformations reviewable and expose places where meanings are not truly equivalent.',
		example:
			'A hospital documents how a local specimen code relates to a standard terminology concept.',
		confusion:
			'A map is not proof of exact semantic equivalence, and it must be versioned and governed.',
		related: ['ConceptMap', 'local code', 'normalization', 'semantic interoperability'],
		sourceIds: ['fhirTerminology', 'snomed'],
		freshness: 'version-sensitive',
		tags: ['terminology', 'interoperability', 'transformation']
	}),
	audit: defineConcept('audit', {
		answer: 'AUDIT',
		clue: 'The record that remembers who touched what after institutional memory develops a diplomatic illness.',
		nudge: 'Think accountable event history.',
		bridge:
			'It records security- or operations-relevant activity such as access, updates and policy decisions.',
		contrast:
			'Provenance explains how information came to be; this emphasizes events involving systems and actors.',
		obvious: 'FHIR names the event-focused resource AuditEvent.',
		definition:
			'An audit record captures events relevant to security, privacy, operations or accountability.',
		why: 'Reviewable event history supports incident investigation, access review and trustworthy operations.',
		example:
			'A log records which authenticated user viewed a chart, when, from which system and with what outcome.',
		confusion: 'It is not merely an application error log, nor is it identical to data provenance.',
		related: ['AuditEvent', 'audit trail', 'provenance', 'authorization'],
		sourceIds: ['fhirAuditEvent'],
		freshness: 'version-sensitive',
		tags: ['security', 'governance', 'interoperability']
	}),
	ehr: defineConcept('ehr', {
		answer: 'EHR',
		clue: 'The longitudinal record expected to follow a patient farther than one practice’s filing cabinet.',
		nudge: 'Think the broader electronic record across care settings.',
		bridge:
			'It brings together health information over time and is designed for authorized sharing and coordinated care.',
		contrast:
			'The more narrowly framed medical record is commonly described as centering on one organization or practice.',
		obvious: 'Its expansion is electronic health record.',
		definition:
			'An electronic health record is a longitudinal digital record intended to support care across providers and settings.',
		why: 'Care coordination depends on authorized users seeing relevant history rather than isolated snapshots.',
		example:
			'Medication, allergy, laboratory and encounter information follows a patient from primary care to a specialist.',
		confusion:
			'The boundary between this term and EMR varies in ordinary industry usage; treat the distinction as conceptual, not universal law.',
		related: ['EMR', 'interoperability', 'clinical workflow', 'HIE'],
		sourceIds: ['ehrAndHie', 'ehrBenefits'],
		freshness: 'jurisdiction-specific',
		tags: [
			'clinical-systems',
			'records',
			'workflow',
			'acronym',
			'expansion:Electronic Health Record'
		]
	}),
	emr: defineConcept('emr', {
		answer: 'EMR',
		clue: 'The electronic chart with a more local horizon, though marketing departments may dispute the border.',
		nudge: 'Think one organization’s digital clinical record.',
		bridge:
			'It commonly refers to information collected and used within a clinician office, practice or organization.',
		contrast: 'The broader record is designed to follow the patient across multiple care settings.',
		obvious: 'Its expansion is electronic medical record.',
		definition:
			'An electronic medical record commonly denotes a digital clinical record centered on one provider organization or practice.',
		why: 'The distinction highlights how a useful local chart can still leave continuity gaps across organizational boundaries.',
		example:
			'A practice tracks diagnoses, notes and preventive reminders inside its own clinical system.',
		confusion:
			'Industry usage is inconsistent, and many products use this label interchangeably with EHR.',
		related: ['EHR', 'clinical documentation', 'interoperability'],
		sourceIds: ['ehrAndHie'],
		freshness: 'jurisdiction-specific',
		tags: ['clinical-systems', 'records', 'acronym', 'expansion:Electronic Medical Record']
	}),
	adt: defineConcept('adt', {
		answer: 'ADT',
		clue: 'The HL7 message family for arrivals, departures and the administrative commotion between them.',
		nudge: 'Think patient movement and registration events.',
		bridge:
			'These messages commonly announce admissions, discharges, transfers and demographic changes to downstream systems.',
		contrast: 'An order message requests work; a result message reports what came back.',
		obvious: 'The three letters expand to Admit, Discharge, Transfer.',
		definition:
			'ADT is the HL7 v2 message family used for patient administration events such as admission, discharge, transfer and registration updates.',
		why: 'Many downstream systems need timely encounter and identity context before clinical results or orders make sense.',
		example:
			'An admission event creates or updates the encounter in the laboratory and radiology systems.',
		confusion:
			'It is a family of patient-administration events, not a single universal workflow or a clinical result.',
		related: ['HL7 v2', 'encounter', 'interface engine', 'patient identity'],
		sourceIds: ['hl7v2'],
		freshness: 'version-sensitive',
		tags: [
			'clinical-systems',
			'interoperability',
			'messaging',
			'acronym',
			'expansion:Admit Discharge Transfer'
		]
	}),
	cpoe: defineConcept('cpoe', {
		answer: 'CPOE',
		clue: 'Where clinicians enter orders directly, sparing handwriting but not implementation consequences.',
		nudge: 'Think electronic ordering at the point of care.',
		bridge:
			'It lets authorized clinicians place medication, test, procedure and referral orders directly into a computer system.',
		contrast:
			'Decision support may advise during ordering, but direct electronic order entry is the core function here.',
		obvious: 'The expansion is computerized provider order entry.',
		definition:
			'Computerized provider order entry is a system in which clinicians directly enter medical orders electronically for transmission to recipients.',
		why: 'Structured, legible orders can improve communication, but safe outcomes still depend on workflow, configuration and decision support.',
		example:
			'A clinician submits a laboratory order that routes electronically to the laboratory information system.',
		confusion:
			'Digitizing an order does not automatically make the order clinically appropriate or the workflow safe.',
		related: ['order', 'CDS', 'workflow', 'medication safety'],
		sourceIds: ['cpoe'],
		freshness: 'recommended-practice',
		tags: [
			'clinical-systems',
			'orders',
			'workflow',
			'acronym',
			'expansion:Computerized Provider Order Entry'
		]
	}),
	cds: defineConcept('cds', {
		answer: 'CDS',
		clue: 'The timely clinical nudge that should assist judgment rather than audition for its job.',
		nudge: 'Think useful knowledge delivered inside care work.',
		bridge:
			'It combines relevant knowledge and person-specific information at an appropriate point in a decision.',
		contrast:
			'It includes more than pop-up alerts: order sets, summaries, templates and contextual references can qualify.',
		obvious: 'The expansion is clinical decision support.',
		definition:
			'Clinical decision support provides organized, relevant information at appropriate times to improve health-related decisions.',
		why: 'Well-integrated support can reduce errors and cognitive burden; poorly fitted support can become ignored noise.',
		example:
			'During prescribing, a system presents a patient-specific renal dosing recommendation with its rationale.',
		confusion:
			'It supports rather than replaces clinical judgment, and it is not synonymous with alerts alone.',
		related: ['CPOE', 'workflow', 'alert fatigue', 'human review'],
		sourceIds: ['cds'],
		freshness: 'recommended-practice',
		tags: [
			'clinical-systems',
			'decision-support',
			'workflow',
			'acronym',
			'expansion:Clinical Decision Support'
		]
	}),
	workflow: defineConcept('workflow', {
		answer: 'WORKFLOW',
		clue: 'The real sequence of people and tasks that the tidy architecture diagram politely omitted.',
		nudge: 'Think work as actually performed over time.',
		bridge:
			'It is the ordered, branching movement of tasks, information and responsibility through a care process.',
		contrast:
			'A data model says what information looks like; this says how people and systems act on it.',
		obvious: 'Orders, verification, collection, result review and follow-up form one of these.',
		definition:
			'A clinical workflow is the sequence and coordination of tasks, decisions, information and roles involved in delivering care.',
		why: 'A technically correct system can fail if it adds friction, arrives at the wrong moment or loses responsibility between steps.',
		example:
			'A critical result moves from instrument verification to clinician notification, acknowledgement and documented follow-up.',
		confusion:
			'It is not just a screen sequence or a process diagram; interruptions, exceptions and human handoffs are part of it.',
		related: ['CPOE', 'CDS', 'routing', 'human factors'],
		sourceIds: ['cds', 'cpoe'],
		freshness: 'recommended-practice',
		tags: ['clinical-systems', 'workflow', 'architecture']
	}),
	snomedct: defineConcept('snomedct', {
		answer: 'SNOMEDCT',
		displayAnswer: 'SNOMED CT',
		clue: 'The broad clinical terminology built to represent meaning, not merely to make a billing column look official.',
		nudge: 'Think comprehensive clinical concepts and relationships.',
		bridge:
			'It represents clinically relevant information consistently using concepts, descriptions and semantic relationships.',
		contrast:
			'The observation vocabulary identifies tests and measurements; the disease classification organizes reporting categories.',
		obvious: 'Its familiar name ends with Clinical Terms.',
		definition:
			'SNOMED CT is a comprehensive clinical terminology for consistently representing clinical meanings in electronic health information.',
		why: 'Its concept model and relationships support detailed clinical recording, retrieval and reasoning across systems.',
		example:
			'A problem list records a specific clinical disorder using a stable concept identifier rather than free text alone.',
		confusion:
			'It is a terminology, not simply an ICD replacement or a flat list of billing codes.',
		related: ['LOINC', 'ICD', 'reference set', 'semantic interoperability'],
		sourceIds: ['snomed'],
		freshness: 'version-sensitive',
		tags: ['terminology', 'clinical-meaning', 'normalization']
	}),
	rxnorm: defineConcept('rxnorm', {
		answer: 'RXNORM',
		displayAnswer: 'RxNorm',
		clue: 'The U.S. vocabulary persuading drug names, strengths and dose forms to introduce themselves consistently.',
		nudge: 'Think normalized medication names.',
		bridge:
			'It supplies normalized names and identifiers for clinical drugs and links names used by other drug vocabularies.',
		contrast:
			'The observation vocabulary handles tests; the broad clinical terminology covers much more than medicines.',
		obvious: 'Its name begins with the common prescription abbreviation “Rx.”',
		definition:
			"RxNorm is the U.S. National Library of Medicine's normalized naming system for generic and branded clinical drugs.",
		why: 'Medication systems using different names can exchange drug information more consistently through shared concepts and links.',
		example:
			'Several source names resolve to a normalized concept containing ingredient, strength and dose form.',
		confusion:
			'It is U.S.-scoped and does not itself provide every pharmacy knowledge function such as interaction checking.',
		related: ['medication', 'terminology service', 'normalization', 'SNOMED CT'],
		sourceIds: ['rxnorm'],
		freshness: 'jurisdiction-specific',
		tags: ['terminology', 'medications', 'jurisdiction-us']
	}),
	icd: defineConcept('icd', {
		answer: 'ICD',
		clue: 'The WHO classification for organizing diseases and related health problems; not today’s invitation to memorize a code.',
		nudge: 'Think statistical classification of diseases.',
		bridge:
			'It groups health conditions into internationally maintained categories for reporting and analysis.',
		contrast:
			'A detailed clinical terminology is designed for expressive point-of-care meaning; this is primarily a classification.',
		obvious: 'The letters begin International Classification of Diseases.',
		definition:
			"ICD is the World Health Organization's international classification of diseases and related health problems.",
		why: 'Comparable classification supports mortality, morbidity, epidemiology and health-system reporting across places and time.',
		example:
			'A reporting system groups documented diagnoses into classification categories for population statistics.',
		confusion:
			"Its revisions and national modifications differ; do not treat one jurisdiction's billing use as the whole purpose.",
		related: ['SNOMED CT', 'classification', 'mapping', 'morbidity'],
		sourceIds: ['icd'],
		freshness: 'version-sensitive',
		tags: [
			'terminology',
			'classification',
			'reporting',
			'acronym',
			'expansion:International Classification of Diseases'
		]
	}),
	valueset: defineConcept('valueset', {
		answer: 'VALUESET',
		displayAnswer: 'VALUE SET',
		clue: 'The governed subset answering “which codes are allowed here?” before every code volunteers.',
		nudge: 'Think a context-specific selection of codes.',
		bridge: 'It identifies codes drawn from one or more code systems for use in a defined context.',
		contrast:
			'A code system defines codes and meanings; this selects which of them are permitted for a use.',
		obvious: 'FHIR represents it with the ValueSet resource.',
		definition:
			'A value set is a defined collection of codes selected from one or more code systems for a particular context.',
		why: 'Explicit selections make validation, data capture and quality measures more consistent and governable.',
		example:
			'A profile binds a field to the allowed encounter-type concepts for a particular exchange.',
		confusion:
			'It is not itself the source code system and an expansion is a point-in-time realization of its definition.',
		related: ['code system', 'binding', 'terminology service', 'profile'],
		sourceIds: ['fhirValueSet'],
		freshness: 'version-sensitive',
		tags: ['terminology', 'fhir', 'governance']
	}),
	cdisc: defineConcept('cdisc', {
		answer: 'CDISC',
		clue: 'The standards organization trying to make clinical research data arrive with fewer interpretive séances.',
		nudge: 'Think an ecosystem of clinical-research data standards.',
		bridge:
			'It publishes models and controlled terminology spanning data collection, tabulation and analysis.',
		contrast: 'One tabulation model is part of this wider standards family, not its synonym.',
		obvious: 'Its expansion begins Clinical Data Interchange Standards.',
		definition:
			'CDISC is the Clinical Data Interchange Standards Consortium, publisher of standards for clinical research data and processes.',
		why: 'Shared structures improve traceability, exchange, reuse and review across a study lifecycle.',
		example:
			'A sponsor aligns collection concepts, tabulation domains and analysis datasets using related foundational standards.',
		confusion:
			'It is an organization and standards family, not a single data model or software product.',
		related: ['SDTM', 'controlled terminology', 'clinical research', 'traceability'],
		sourceIds: ['cdiscFoundational'],
		freshness: 'version-sensitive',
		tags: [
			'research-data',
			'standards',
			'clinical-trials',
			'acronym',
			'expansion:Clinical Data Interchange Standards Consortium'
		]
	}),
	sdtm: defineConcept('sdtm', {
		answer: 'SDTM',
		clue: 'The tabulation model arranging study data so a reviewer need not excavate each sponsor’s private geology.',
		nudge: 'Think standardized clinical-study tabulations.',
		bridge:
			'It defines a general structure for organizing and formatting study data for exchange and review.',
		contrast:
			'Collection forms capture source-oriented data; analysis models prepare data for statistical analysis.',
		obvious: 'The expansion is Study Data Tabulation Model.',
		definition:
			"SDTM is CDISC's standard model for organizing and formatting clinical study data tabulations.",
		why: 'Predictable domains and variables support aggregation, review, reuse and regulatory submission workflows.',
		example:
			'Adverse events and laboratory observations are represented in standard domains with documented variables.',
		confusion:
			'It is not an electronic data-capture application and is not the same as an analysis dataset model.',
		related: ['CDISC', 'domain', 'controlled terminology', 'traceability'],
		sourceIds: ['sdtm'],
		freshness: 'version-sensitive',
		tags: [
			'research-data',
			'standards',
			'tabulation',
			'acronym',
			'expansion:Study Data Tabulation Model'
		]
	}),
	edc: defineConcept('edc', {
		answer: 'EDC',
		clue: 'The system collecting trial data electronically, because binders deserved a quieter retirement.',
		nudge: 'Think study data capture software.',
		bridge:
			'Sites enter or receive research data in this system, which applies edit checks and manages queries.',
		contrast:
			'A case-report form is the data-collection instrument; this is the system that hosts and manages it.',
		obvious: 'The expansion is electronic data capture.',
		definition:
			'Electronic data capture is the use of computerized systems to collect and manage clinical research data.',
		why: 'Structured capture, validation, audit history and query workflows improve the manageability and traceability of study data.',
		example:
			'A coordinator enters a visit measurement into an electronic case-report form and responds to a validation query.',
		confusion:
			'The capture system is not automatically the authoritative source for every datum and is not synonymous with SDTM.',
		related: ['eCRF', 'CDMS', 'edit check', 'source data'],
		sourceIds: ['cdiscFoundational', 'fdaSourceData'],
		freshness: 'version-sensitive',
		tags: [
			'research-data',
			'capture',
			'clinical-trials',
			'acronym',
			'expansion:Electronic Data Capture'
		]
	}),
	ecrf: defineConcept('ecrf', {
		answer: 'ECRF',
		displayAnswer: 'eCRF',
		clue: 'The electronic form where protocol questions become fields, checks and an impressive number of queries.',
		nudge: 'Think the digital case-report instrument.',
		bridge:
			'It is the structured form used to collect protocol-required information for each study participant.',
		contrast:
			'The capture platform hosts these forms; the tabulation model organizes downstream standardized datasets.',
		obvious: 'The letters expand to electronic case report form.',
		definition:
			'An eCRF is an electronic case report form used to capture protocol-specified data for a clinical study participant.',
		why: 'Well-designed forms connect protocol objectives to consistent data collection and downstream traceability.',
		example: 'A visit form captures vital signs, timing, units and required investigator review.',
		confusion:
			'It is not necessarily the original source record; the source may be an EHR, instrument or other system.',
		related: ['EDC', 'protocol', 'source data', 'visit'],
		sourceIds: ['cdiscFoundational', 'fdaSourceData'],
		freshness: 'jurisdiction-specific',
		tags: ['research-data', 'capture', 'forms', 'acronym', 'expansion:Electronic Case Report Form']
	}),
	protocol: defineConcept('protocol', {
		answer: 'PROTOCOL',
		clue: 'The study plan that decides what must happen before the database begins improvising.',
		nudge: 'Think the governing plan for a clinical investigation.',
		bridge:
			'It specifies objectives, design, methods, assessments, schedule and analysis expectations for a study.',
		contrast:
			'A visit is one scheduled unit of activity; this document defines the study as a whole.',
		obvious: 'Eligibility, endpoints and assessment schedules are all declared in this study plan.',
		definition:
			"A clinical study protocol is the governing plan that specifies the study's objectives, design, methods and required activities.",
		why: 'Data collection and validation rules must trace back to the questions and procedures the study was designed to address.',
		example:
			'The schedule of assessments determines which measurements are expected at baseline and later visits.',
		confusion: 'It is not merely a technical network protocol or the database specification.',
		related: ['subject', 'visit', 'eCRF', 'traceability'],
		sourceIds: ['cdiscFoundational'],
		freshness: 'version-sensitive',
		tags: ['research-data', 'clinical-trials', 'design']
	}),
	traceability: defineConcept('traceability', {
		answer: 'TRACEABILITY',
		clue: 'The evidence chain from collected value to submission result, preferably assembled before inspection week.',
		nudge: 'Think documented ancestry through the study-data lifecycle.',
		bridge:
			'It lets a reviewer follow a value, derivation or decision from its origin through transformations and outputs.',
		contrast:
			'An audit trail records events; this broader property connects source, transformations, rules and results.',
		obvious: 'The word begins with “trace”—the ability to follow something back.',
		definition:
			'Traceability is the ability to follow data and decisions from source through processing, derivation and reported result.',
		why: 'Reviewers need to understand where a result came from and whether each transformation was controlled and reproducible.',
		example:
			'An analysis value links to its derivation rule, standardized tabulation input and original collected measurement.',
		confusion:
			'A timestamped log alone does not establish full semantic or analytical traceability.',
		related: ['source data', 'lineage', 'audit trail', 'reproducibility'],
		sourceIds: ['cdiscFoundational', 'fdaSourceData'],
		freshness: 'recommended-practice',
		tags: ['research-data', 'governance', 'lineage']
	}),
	sql: defineConcept('sql', {
		answer: 'SQL',
		clue: 'The language used to ask a relational database a precise question, then discover the denominator was elsewhere.',
		nudge: 'Think tables, queries and set-oriented operations.',
		bridge: 'It defines, retrieves and changes data in relational database systems.',
		contrast:
			'A relational model describes how data is organized; this is the language commonly used to work with it.',
		obvious: 'The letters expand to Structured Query Language.',
		definition:
			'SQL is the standard family of languages used to define, query and manipulate data in relational database systems.',
		why: 'It remains central to clinical reporting, integration, quality checks and analytical pipelines.',
		example:
			'A query joins encounters to laboratory results, filters a date range and groups counts by facility.',
		confusion:
			'SQL is declarative and set-oriented; it is not a database product and vendor dialects differ.',
		related: ['relational model', 'join', 'transaction', 'warehouse'],
		sourceIds: ['postgresConcepts'],
		tags: [
			'data-engineering',
			'database',
			'query',
			'acronym',
			'expansion:Structured Query Language'
		]
	}),
	mumps: defineConcept('mumps', {
		answer: 'MUMPS',
		clue: 'A language and database technology with a disease for a name and an improbably long hospital afterlife.',
		nudge: 'Think hierarchical globals and legacy clinical systems.',
		bridge:
			'This older technology combines a programming language with persistent sparse multidimensional storage.',
		contrast:
			'A relational system centers on tables and declarative queries; this tradition stores hierarchical globals.',
		obvious: 'It is also known simply as M and underlies major VistA components.',
		definition:
			'MUMPS, commonly called M, is a programming language and database technology built around persistent hierarchical multidimensional arrays.',
		why: 'Long-lived clinical systems still depend on it, so modernization requires understanding its data and transactional behavior rather than merely translating syntax.',
		example:
			'A VistA application stores clinical and administrative data in persistent globals accessed by M routines.',
		confusion: 'It is not just a programming language bolted onto an ordinary relational database.',
		related: ['VistA', 'hierarchical model', 'global', 'migration'],
		sourceIds: ['vaVista'],
		tags: [
			'data-engineering',
			'legacy',
			'clinical-systems',
			'acronym',
			'expansion:Massachusetts General Hospital Utility Multi-Programming System'
		]
	}),
	relational: defineConcept('relational', {
		answer: 'RELATIONAL',
		clue: 'The model that puts data into tables and expects keys to prevent the family reunion becoming speculative.',
		nudge: 'Think rows, columns and relations.',
		bridge: 'It organizes data as named tables whose rows share defined columns and types.',
		contrast:
			'A hierarchical model follows parent-child paths; this model connects tables through values and constraints.',
		obvious: 'The R in RDBMS names this model.',
		definition:
			'The relational model represents data in relations, commonly implemented as tables of typed rows and columns.',
		why: 'Keys, constraints and set-based operations provide a disciplined basis for transactional and analytical systems.',
		example:
			'Encounter rows reference a patient table through a stable key rather than repeating the full patient record.',
		confusion:
			'A relation is a mathematical concept; table order is not inherent and object nesting is not its organizing principle.',
		related: ['SQL', 'key', 'constraint', 'hierarchical model'],
		sourceIds: ['postgresConcepts'],
		tags: ['data-engineering', 'database', 'data-model']
	}),
	etl: defineConcept('etl', {
		answer: 'ETL',
		clue: 'Move the data, wash its face, and find it a table: extract, transform, load.',
		nudge: 'Think a traditional data-integration sequence.',
		bridge:
			'Data is taken from sources, changed into the needed form and then written to a destination.',
		contrast:
			'In the sibling pattern, raw data is loaded before much of the transformation happens in the target platform.',
		obvious: 'The three steps are Extract, Transform, Load.',
		definition:
			'ETL is a pipeline pattern that extracts data from sources, transforms it and loads the result into a destination.',
		why: 'Explicit transformations can standardize, validate and reconcile source data before downstream use.',
		example:
			'Nightly jobs extract interface records, normalize identifiers and load dimensional warehouse tables.',
		confusion:
			'It is a pattern, not a guarantee of quality; transformation logic, lineage and failure handling still need governance.',
		related: ['ELT', 'pipeline', 'warehouse', 'lineage'],
		sourceIds: ['openLineage', 'postgresConcepts'],
		tags: [
			'data-engineering',
			'pipeline',
			'modernization',
			'acronym',
			'expansion:Extract Transform Load'
		]
	}),
	lineage: defineConcept('lineage', {
		answer: 'LINEAGE',
		clue: 'The route map showing how a dashboard number acquired its accent, surname and suspicious haircut.',
		nudge: 'Think data movement and transformation history.',
		bridge:
			'It records how datasets are produced, transformed and consumed across jobs and systems.',
		contrast:
			'Provenance can include agents and activities around one artifact; this term often emphasizes dataset and pipeline dependencies.',
		obvious: 'OpenLineage models datasets, jobs and runs to capture this metadata.',
		definition:
			'Data lineage describes the origins, transformations, movements and downstream uses of data through a system.',
		why: 'It supports impact analysis, debugging, trust and controlled change when pipelines become complicated.',
		example:
			'A metric links back through a warehouse view and transformation job to source encounter tables.',
		confusion:
			'A diagram drawn once is not operational lineage unless it stays connected to real versions and runs.',
		related: ['provenance', 'traceability', 'pipeline', 'observability'],
		sourceIds: ['openLineage', 'w3cProv'],
		tags: ['data-engineering', 'governance', 'pipeline']
	}),
	deduplication: defineConcept('deduplication', {
		answer: 'DEDUPLICATION',
		clue: 'The attempt to stop one person, order or event from enjoying several simultaneous careers in the warehouse.',
		nudge: 'Think identifying repeated records.',
		bridge:
			'It detects records that represent the same real-world entity or event and resolves them under governed rules.',
		contrast:
			'Validation checks conformance; reconciliation compares populations or totals; this specifically addresses repeats.',
		obvious: 'The word literally means removal or resolution of duplicates.',
		definition:
			'Deduplication is the process of detecting and resolving duplicate representations of the same entity or event.',
		why: 'Duplicates distort patient counts, measures, alerts and downstream workloads, but careless merging can combine different people.',
		example:
			'A pipeline flags two laboratory messages with the same source identifier and event timestamp for governed resolution.',
		confusion:
			'Matching similarity is evidence, not certainty; patient identity work requires conservative rules and review.',
		related: ['patient matching', 'reconciliation', 'data quality', 'identity'],
		sourceIds: ['nistStatistics', 'openLineage'],
		tags: ['data-engineering', 'data-quality', 'identity']
	}),
	measure: defineConcept('measure', {
		answer: 'MEASURE',
		clue: 'A defined quantity for judging performance; the definition is doing more work than the dashboard font.',
		nudge: 'Think a specified quantity, not a decorative KPI.',
		bridge:
			'It turns a question into a computable quantity with a defined population, logic and time period.',
		contrast: 'A dimension slices or groups observations; this is the quantity being calculated.',
		obvious: 'A rate often combines a numerator and a denominator to form one of these.',
		definition:
			'A measure is a precisely defined quantitative assessment derived from specified data, populations and rules.',
		why: 'Without explicit logic and populations, apparently comparable dashboard numbers can describe different realities.',
		example:
			'A readmission rate specifies eligible discharges, exclusions, follow-up period and counted outcomes.',
		confusion: 'A measure is not made valid merely by being countable or labelled a KPI.',
		related: ['denominator', 'cohort', 'dimension', 'validation'],
		sourceIds: ['ahrqMeasures'],
		tags: ['analytics', 'reporting', 'quality-measure']
	}),
	dimension: defineConcept('dimension', {
		answer: 'DIMENSION',
		clue: 'The axis used to slice a metric until the aggregate admits where the trouble lives.',
		nudge: 'Think a descriptive angle for grouping facts.',
		bridge:
			'It categorizes observations by attributes such as time, facility, service or patient group.',
		contrast:
			'A measure is aggregated quantity; this provides the categories by which that quantity is examined.',
		obvious: 'Date, facility and diagnosis group can each serve as this in a warehouse.',
		definition:
			'In analytics, a dimension is a descriptive attribute used to group, filter or label measured facts.',
		why: 'Useful dimensions reveal variation hidden by a single overall number and support reproducible slicing.',
		example: 'A result count is grouped by month, facility and specimen type.',
		confusion:
			'The term here is analytical, not the number of columns in a mathematical vector space.',
		related: ['measure', 'fact table', 'warehouse', 'stratification'],
		sourceIds: ['postgresConcepts', 'ahrqMeasures'],
		tags: ['analytics', 'warehouse', 'reporting']
	}),
	denominator: defineConcept('denominator', {
		answer: 'DENOMINATOR',
		clue: 'The population beneath the metric, often discovered only after the dashboard has reached the boardroom.',
		nudge: 'Think who was eligible to be counted.',
		bridge: 'It defines the population at risk or otherwise eligible for the rate being reported.',
		contrast:
			'The numerator counts qualifying outcomes; this sets the population against which they are interpreted.',
		obvious: 'In a fraction, this is the number below the line.',
		definition:
			'A denominator is the defined eligible population or quantity against which a numerator is compared in a rate or ratio.',
		why: 'Changes in eligibility, exclusions or data availability can move a rate even when the underlying outcomes do not change.',
		example:
			'A screening rate uses eligible adults with continuous enrollment as its population beneath the counted screenings.',
		confusion:
			'It is not always every patient in the database, and its exclusions are part of the metric definition.',
		related: ['numerator', 'measure', 'cohort', 'bias'],
		sourceIds: ['ahrqMeasures'],
		tags: ['analytics', 'statistics', 'quality-measure']
	}),
	cohort: defineConcept('cohort', {
		answer: 'COHORT',
		clue: 'A population defined by shared criteria, not everyone who happened to survive the JOIN.',
		nudge: 'Think an explicitly selected group.',
		bridge:
			'It is a group of people or records meeting defined inclusion, exclusion and time criteria.',
		contrast:
			'A denominator may be one use of such a group; the concept itself also supports studies and longitudinal analysis.',
		obvious: 'Researchers follow this kind of group over time in a cohort study.',
		definition:
			'A cohort is a group defined by shared characteristics, events or eligibility criteria for analysis or follow-up.',
		why: 'Transparent population logic makes results interpretable, reproducible and comparable.',
		example:
			'Adults with a new diagnosis during 2025 and twelve months of prior observable history form an analysis group.',
		confusion:
			'A table extract is not a defensible cohort until selection rules and time anchors are explicit.',
		related: ['denominator', 'eligibility', 'index date', 'selection bias'],
		sourceIds: ['nistStatistics', 'ahrqMeasures'],
		tags: ['analytics', 'statistics', 'population']
	}),
	missingness: defineConcept('missingness', {
		answer: 'MISSINGNESS',
		clue: 'The pattern of absent data that refuses to become harmless merely because NULL looks quiet.',
		nudge: 'Think why and where observations are absent.',
		bridge: 'It describes the amount, pattern and mechanism of data not observed in an analysis.',
		contrast:
			'A zero is an observed value; an absent value may mean not measured, not recorded, not applicable or unavailable.',
		obvious:
			'The term is formed from “missing” and names the condition or pattern of being absent.',
		definition:
			'Missingness is the occurrence and pattern of unobserved data, including the processes that caused values to be absent.',
		why: 'If absence relates to workflow, severity or access, complete-case analysis can produce biased conclusions.',
		example:
			'A laboratory value is absent more often for patients treated outside the connected network.',
		confusion:
			'Missing does not mean normal, zero or negative, and different absence mechanisms need different handling.',
		related: ['bias', 'data quality', 'imputation', 'cohort'],
		sourceIds: ['nistStatistics'],
		tags: ['analytics', 'statistics', 'data-quality']
	}),
	reproducibility: defineConcept('reproducibility', {
		answer: 'REPRODUCIBILITY',
		clue: 'The property allowing tomorrow’s analyst to obtain the result without summoning yesterday’s laptop.',
		nudge: 'Think repeatable results from documented inputs and methods.',
		bridge:
			'It requires enough preserved data, code, parameters and environment information to repeat an analysis.',
		contrast:
			'A result can be plausible once; this property asks whether the process can be run again and examined.',
		obvious: 'The word begins with “reproduce”—to produce again.',
		definition:
			'Reproducibility is the ability to obtain consistent results by repeating a documented analysis with its stated data and methods.',
		why: 'Healthcare reports influence decisions, so results should survive personnel changes, reruns and scrutiny.',
		example:
			'A versioned query, code list, data snapshot and parameter file regenerate the published quality table.',
		confusion: 'It is related to but not identical with independent replication using new data.',
		related: ['traceability', 'lineage', 'validation', 'version control'],
		sourceIds: ['nihReproducibility'],
		tags: ['analytics', 'research-data', 'governance']
	}),
	authentication: defineConcept('authentication', {
		answer: 'AUTHENTICATION',
		clue: 'The security step asking who you are before policy begins arguing about what you may do.',
		nudge: 'Think proving an identity.',
		bridge:
			'It establishes confidence that a user, system or device is the identity it claims to be.',
		contrast: 'The neighboring control decides permissions after identity has been established.',
		obvious: 'Passwords, passkeys and smart cards are factors used for this identity check.',
		definition:
			'Authentication is the process of verifying the claimed identity of a user, process, device or system.',
		why: 'Access decisions and accountable audit records depend on knowing which identity is acting.',
		example:
			'A clinician signs in with a passkey and a managed device before opening the clinical application.',
		confusion:
			'Successfully proving identity does not itself grant permission to every record or action.',
		related: ['authorization', 'identity', 'multifactor authentication', 'audit'],
		sourceIds: ['nistSecurity'],
		tags: ['security', 'identity', 'access-control']
	}),
	authorization: defineConcept('authorization', {
		answer: 'AUTHORIZATION',
		clue: 'The decision about what an established identity may do, after “but I logged in” has finished its speech.',
		nudge: 'Think permissions after identity.',
		bridge:
			'It determines whether an identified actor may perform a requested action on a particular resource.',
		contrast:
			'The preceding identity check establishes who is acting; this applies policy to the requested access.',
		obvious:
			'Role-, attribute- and policy-based access controls all implement this permission decision.',
		definition:
			'Authorization is the process of deciding and enforcing which actions an authenticated identity is permitted to perform.',
		why: 'Healthcare systems must limit access by role, purpose, context and policy rather than treating login as universal permission.',
		example: 'A scheduler may view appointment details but cannot sign a medication order.',
		confusion:
			'It is not synonymous with authentication or patient consent, though consent may inform policy.',
		related: ['authentication', 'least privilege', 'consent', 'access control'],
		sourceIds: ['nistSecurity'],
		tags: ['security', 'access-control', 'governance']
	}),
	leastprivilege: defineConcept('leastprivilege', {
		answer: 'LEASTPRIVILEGE',
		displayAnswer: 'LEAST PRIVILEGE',
		clue: 'The principle that gives each account enough access to work, not enough to found a small empire.',
		nudge: 'Think minimum permissions for the assigned task.',
		bridge:
			'Each person or process receives only the resources and authorizations necessary for its function.',
		contrast:
			'Minimum necessary is a U.S. privacy rule for uses and disclosures; this is a broader security design principle.',
		obvious: 'The two-word phrase begins “least” and ends with a synonym for access rights.',
		definition:
			'Least privilege is the security principle of granting only the minimum system resources and authorizations needed for a function.',
		why: 'Narrow permissions reduce accidental exposure and limit damage when an account or service is compromised.',
		example:
			'An interface service account can write inbound results to one queue but cannot browse the clinical database.',
		confusion:
			'It does not mean making legitimate work impossible; permissions must be sufficient, reviewed and time-bounded where appropriate.',
		related: ['authorization', 'role', 'minimum necessary', 'service account'],
		sourceIds: ['nistLeastPrivilege', 'hhsMinimumNecessary'],
		tags: ['security', 'access-control', 'governance'],
		freshness: 'recommended-practice'
	}),
	encryption: defineConcept('encryption', {
		answer: 'ENCRYPTION',
		clue: 'The transformation that makes data unreadable without the key; naming the backup “final2” does not qualify.',
		nudge: 'Think confidentiality through cryptographic transformation.',
		bridge:
			'It converts readable information into protected form using an algorithm and cryptographic key.',
		contrast:
			'Hashing is generally one-way; this protection is designed to be reversed with the proper key.',
		obvious: 'TLS applies it in transit, while storage systems can apply it at rest.',
		definition:
			'Encryption cryptographically transforms plaintext into ciphertext that can be recovered only with the appropriate key.',
		why: 'It helps protect health information if network traffic, devices or storage media are intercepted.',
		example:
			'A database volume uses managed keys at rest while interfaces use authenticated TLS in transit.',
		confusion:
			'It does not replace access control, key management, integrity checks or secure endpoint behavior.',
		related: ['key management', 'TLS', 'access control', 'integrity'],
		sourceIds: ['nistSecurity'],
		tags: ['security', 'privacy', 'cryptography'],
		freshness: 'recommended-practice'
	}),
	audittrail: defineConcept('audittrail', {
		answer: 'AUDITTRAIL',
		displayAnswer: 'AUDIT TRAIL',
		clue: 'The sequence of recorded actions that remains after “nobody changed it” enters the minutes.',
		nudge: 'Think chronological accountability evidence.',
		bridge: 'It preserves a reviewable history of access, changes, actors, times and outcomes.',
		contrast:
			'A single event is one record; this phrase emphasizes the connected history available for review.',
		obvious: 'It is the two-word phrase beginning with AUDIT and ending with what footsteps leave.',
		definition:
			'An audit trail is a chronological set of records that supports reconstruction and review of system activity.',
		why: 'Investigators and stewards need durable evidence of who did what, when and through which system.',
		example:
			'A research system retains old and new values, user identity, timestamp and reason for each correction.',
		confusion:
			'An audit trail should be protected from casual alteration and is not a substitute for active monitoring.',
		related: ['audit', 'AuditEvent', 'traceability', 'monitoring'],
		sourceIds: ['fhirAuditEvent', 'nistSecurity'],
		tags: ['security', 'governance', 'research-data']
	}),
	consent: defineConcept('consent', {
		answer: 'CONSENT',
		clue: 'The permissions and choices whose complexity does not disappear when reduced to one cheerful checkbox.',
		nudge: 'Think a person’s recorded choices about allowed activity.',
		bridge:
			'It captures agreement, refusal or conditions concerning care, participation or information use and disclosure.',
		contrast:
			"Authorization is the system's access decision; this may be one policy input and is shaped by purpose and jurisdiction.",
		obvious: 'FHIR has a resource with exactly this ordinary English name.',
		definition:
			"Consent is a person's agreement, refusal or directive concerning specified activities, uses or disclosures under applicable policy.",
		why: 'Systems must preserve scope, purpose, actors, time and withdrawal rather than flattening nuanced choices into a permanent flag.',
		example:
			'A research participant permits a defined secondary use for a stated period and later withdraws future permission.',
		confusion:
			'Consent requirements are jurisdiction- and purpose-specific, and consent alone does not determine every lawful access.',
		related: ['authorization', 'purpose of use', 'privacy', 'provenance'],
		sourceIds: ['fhirConsent', 'hhsMinimumNecessary'],
		tags: ['security', 'privacy', 'governance'],
		freshness: 'jurisdiction-specific'
	}),
	interfaceengine: defineConcept('interfaceengine', {
		answer: 'INTERFACEENGINE',
		displayAnswer: 'INTERFACE ENGINE',
		clue: 'The integration switchyard routing messages while every endpoint claims its dialect is nearly standard.',
		nudge: 'Think middleware between clinical systems.',
		bridge:
			'It receives, transforms, routes, monitors and retries exchanges among otherwise separate applications.',
		contrast:
			'An API exposes a callable boundary; this component coordinates many interfaces and operational flows.',
		obvious: 'The two-word answer joins INTERFACE with ENGINE.',
		definition:
			'An interface engine is integration middleware that routes, transforms and monitors messages between systems.',
		why: 'Centralized exchange operations can reduce point-to-point duplication and provide visibility, but can also become a critical bottleneck.',
		example:
			'The engine transforms an inbound HL7 v2 result, applies routing rules and delivers it to the EHR and warehouse.',
		confusion:
			'It does not create semantic agreement by itself; a successful message can still carry misunderstood data.',
		related: ['routing', 'HL7 v2', 'mapping', 'observability'],
		sourceIds: ['hl7v2', 'fhirOverview'],
		tags: ['interoperability', 'integration', 'architecture']
	}),
	patientmatching: defineConcept('patientmatching', {
		answer: 'PATIENTMATCHING',
		displayAnswer: 'PATIENT MATCHING',
		clue: 'The identity work deciding whether two records describe one person, without merging two people for tidiness.',
		nudge: 'Think linking records to the correct individual.',
		bridge:
			'It compares identifiers and demographic evidence to decide whether records refer to the same person.',
		contrast:
			'Deduplication is a broader data-quality process; this identity task has direct clinical safety consequences.',
		obvious: 'The answer is the two-word activity combining PATIENT with MATCHING.',
		definition:
			'Patient matching is the process of determining whether records from one or more systems refer to the same individual.',
		why: "False splits hide relevant history while false merges can put another person's information into care decisions.",
		example:
			'An HIE uses identifiers, names, birth dates and addresses with thresholds and manual review for uncertain cases.',
		confusion:
			'A probabilistic score is not identity truth; governance must handle uncertainty and correction.',
		related: ['identity', 'master patient index', 'deduplication', 'HIE'],
		sourceIds: ['ehrAndHie', 'nistStatistics'],
		tags: ['interoperability', 'identity', 'data-quality']
	}),
	providerdirectory: defineConcept('providerdirectory', {
		answer: 'PROVIDERDIRECTORY',
		displayAnswer: 'PROVIDER DIRECTORY',
		clue: 'The service answering who provides what, where and through which endpoint—assuming Tuesday’s update arrived.',
		nudge: 'Think discoverable practitioner and organization details.',
		bridge:
			'It publishes governed identities, roles, services, locations and electronic endpoints for participants in an exchange.',
		contrast:
			'Patient identity links records to a person receiving care; this directory identifies care organizations and professionals.',
		obvious: 'The two-word answer pairs PROVIDER with DIRECTORY.',
		definition:
			'A provider directory is a governed source of information about healthcare organizations, practitioners, roles, services, locations and endpoints.',
		why: 'Exchange, referrals and access control depend on current, unambiguous participant and endpoint information.',
		example:
			"A referral service looks up a specialist's organization, service location and secure messaging endpoint.",
		confusion:
			'A directory entry is not necessarily a credentialing decision, and stale records can misroute care information.',
		related: ['PractitionerRole', 'Organization', 'Endpoint', 'routing'],
		sourceIds: ['fhirOverview', 'ehrAndHie'],
		tags: ['interoperability', 'directory', 'identity']
	}),
	terminologyservice: defineConcept('terminologyservice', {
		answer: 'TERMINOLOGYSERVICE',
		displayAnswer: 'TERMINOLOGY SERVICE',
		clue: 'The component keeping code systems, value sets and mappings usable after the spreadsheet custodian retires.',
		nudge: 'Think operational vocabulary capabilities.',
		bridge:
			'It supports code lookup, validation, value-set expansion, translation and subsumption against managed terminology content.',
		contrast:
			'A code system supplies concepts; this service makes multiple terminologies and versions available to applications.',
		obvious:
			'FHIR defines operations such as code validation, value-set expansion and concept translation for this service.',
		definition:
			'A terminology service provides managed operations over code systems, value sets, mappings and their versions.',
		why: 'Central capabilities help applications validate and translate codes consistently instead of embedding stale lists everywhere.',
		example:
			'An interface validates whether an incoming code belongs to the value set required by a profile.',
		confusion:
			'The service does not decide clinical meaning or mapping policy on its own; content governance remains necessary.',
		related: ['value set', 'code system', 'mapping', 'validation'],
		sourceIds: ['fhirTerminologyService', 'fhirValueSet'],
		tags: ['interoperability', 'terminology', 'architecture']
	}),
	provenance: defineConcept('provenance', {
		answer: 'PROVENANCE',
		clue: 'The answer to “Where did this datum come from?” before everybody points at the interface engine.',
		nudge: 'Think origin, agents and transformations.',
		bridge:
			'It records entities, activities and responsible actors involved in producing or changing information.',
		contrast:
			'Audit records emphasize events and access; this emphasizes how a particular artifact came to be in its current state.',
		obvious: 'FHIR and W3C both use this ordinary word for origin metadata.',
		definition:
			'Provenance is information about the entities, activities and agents involved in producing, changing or delivering data.',
		why: 'Origin and transformation context support trust, authenticity, reproducibility and investigation.',
		example:
			'A derived observation identifies the source result, transformation activity, responsible system and recorded time.',
		confusion:
			'It overlaps with audit and lineage but is not interchangeable with every operational log.',
		related: ['AuditEvent', 'lineage', 'traceability', 'W3C PROV'],
		sourceIds: ['fhirProvenance', 'w3cProv'],
		tags: ['interoperability', 'governance', 'data-quality']
	}),
	routing: defineConcept('routing', {
		answer: 'ROUTING',
		clue: 'The rules deciding which system receives the message, a modest detail until every system receives it.',
		nudge: 'Think destination selection in an exchange.',
		bridge:
			'It uses message attributes, participants and workflow rules to choose one or more destinations.',
		contrast:
			'Transformation changes representation; this decides where the resulting information goes.',
		obvious: 'An interface engine applies these destination rules to route messages.',
		definition:
			'Routing is the controlled selection and delivery of data or messages to appropriate destinations.',
		why: 'Correct destinations, retries and failure queues are essential to reliable clinical handoffs.',
		example:
			'A laboratory result is sent to the ordering EHR and an analytics stream but not unrelated tenant systems.',
		confusion:
			'Successful transport does not prove correct patient identity, semantics or workflow completion.',
		related: ['interface engine', 'endpoint', 'workflow', 'observability'],
		sourceIds: ['hl7v2', 'fhirOverview'],
		tags: ['interoperability', 'integration', 'workflow']
	}),
	migration: defineConcept('migration', {
		answer: 'MIGRATION',
		clue: 'Moving data and capability to a new system without leaving meaning behind in the old building.',
		nudge: 'Think controlled movement between platforms.',
		bridge:
			'It transfers data, configuration and operational responsibility from a source environment to a target.',
		contrast:
			'An interface keeps systems exchanging; this transition aims to relocate or retire capability.',
		obvious: 'The term is also used when populations move from one place to another.',
		definition:
			'System migration is the controlled transfer of data and operational capability from one platform or environment to another.',
		why: 'Clinical history, semantics, identifiers and workflows must remain trustworthy while technology changes underneath them.',
		example:
			'A hospital maps legacy encounters, rehearses loads and verifies longitudinal charts before retiring the old platform.',
		confusion:
			'Copying rows is only one part; behavior, retention, interfaces, reconciliation and rollback all matter.',
		related: ['cutover', 'reconciliation', 'mapping', 'rollback'],
		sourceIds: ['w3cProv', 'nistSecurity'],
		tags: ['data-engineering', 'modernization', 'architecture'],
		freshness: 'recommended-practice'
	}),
	reconciliation: defineConcept('reconciliation', {
		answer: 'RECONCILIATION',
		clue: 'The comparison proving source and target agree before “close enough” becomes a clinical policy.',
		nudge: 'Think controlled comparison after movement or transformation.',
		bridge:
			'It compares records, counts, totals and exceptions across stages to explain differences.',
		contrast:
			'Validation checks rules and format; this compares two views of what should represent the same population or state.',
		obvious:
			'Accountants use the same word when two sets of records must be brought into agreement.',
		definition:
			'Data reconciliation compares source and target populations or states, accounts for expected transformations and resolves unexplained differences.',
		why: 'A technically successful load can still omit, duplicate or alter clinically important data.',
		example:
			'Teams compare counts by encounter type, key totals and sampled patient histories after each migration rehearsal.',
		confusion:
			'Matching total row counts is insufficient when records can be duplicated, dropped or semantically changed.',
		related: ['migration', 'validation', 'deduplication', 'data quality'],
		sourceIds: ['nistStatistics', 'w3cProv'],
		tags: ['data-engineering', 'modernization', 'data-quality'],
		freshness: 'recommended-practice'
	}),
	cutover: defineConcept('cutover', {
		answer: 'CUTOVER',
		clue: 'The planned moment operations move to the new system and every vague dependency applies for overtime.',
		nudge: 'Think transition of live responsibility.',
		bridge: 'It is the controlled change from the old production process or system to the new one.',
		contrast: 'Migration prepares and moves data; this is the operational switch in live use.',
		obvious: 'The word combines CUT with OVER: traffic is moved over to the replacement.',
		definition:
			'Cutover is the planned transition of live operations, users and interfaces from an old system to a replacement.',
		why: 'Sequencing, freeze windows, communications, verification and fallback determine whether the transition is safe.',
		example:
			'After a final incremental load, interfaces are redirected, priority workflows are verified and users enter the new EHR.',
		confusion:
			'Go-live is not a single technical switch; clinical operations and exception handling must be coordinated.',
		related: ['migration', 'rollback', 'parallel run', 'incremental load'],
		sourceIds: ['nistSecurity', 'openLineage'],
		tags: ['data-engineering', 'modernization', 'operations'],
		freshness: 'recommended-practice'
	}),
	rollback: defineConcept('rollback', {
		answer: 'ROLLBACK',
		clue: 'The rehearsed route back when the new production path proves more theoretical than advertised.',
		nudge: 'Think restoring a prior safe state.',
		bridge:
			'It reverses a deployment or transition when defined safety or operational thresholds are not met.',
		contrast:
			'Recovery restores service after failure; this specifically returns from a change to a prior known state.',
		obvious: 'The compound word begins with ROLL and ends with BACK.',
		definition:
			'Rollback is the controlled reversal of a change or cutover to a previously known operational state.',
		why: 'A credible exit path limits harm when validation reveals unacceptable defects after transition begins.',
		example:
			'A failed identity feed triggers a rehearsed reversal of interface routes and restoration of the old workflow.',
		confusion:
			'It may become impossible after new transactions diverge, so decision points and data handling must be designed in advance.',
		related: ['cutover', 'recovery', 'backup', 'validation'],
		sourceIds: ['nistSecurity'],
		tags: ['data-engineering', 'modernization', 'resilience'],
		freshness: 'recommended-practice'
	}),
	incrementalload: defineConcept('incrementalload', {
		answer: 'INCREMENTALLOAD',
		displayAnswer: 'INCREMENTAL LOAD',
		clue: 'A pipeline run that moves what changed, rather than reenacting the entire database every night.',
		nudge: 'Think change-only data movement.',
		bridge:
			'It processes records added or changed since a known checkpoint instead of reloading the full source.',
		contrast:
			'A full load rebuilds the target population; this depends on reliable change detection and checkpoints.',
		obvious: 'The two-word phrase joins INCREMENTAL with LOAD.',
		definition:
			'An incremental load transfers only data identified as new or changed since a defined prior state.',
		why: 'It reduces processing time and supports frequent updates, but missed changes can silently create stale targets.',
		example:
			'A pipeline reads source changes after the last committed watermark and advances it only after successful validation.',
		confusion:
			'A timestamp filter alone may miss late, corrected or deleted records; change semantics must be explicit.',
		related: ['watermark', 'change data capture', 'ETL', 'reconciliation'],
		sourceIds: ['openLineage'],
		tags: ['data-engineering', 'pipeline', 'modernization'],
		freshness: 'recommended-practice'
	}),
	observability: defineConcept('observability', {
		answer: 'OBSERVABILITY',
		clue: 'The evidence that lets operators infer why a pipeline is ill, rather than merely noting its silence.',
		nudge: 'Think understanding internal state from operational signals.',
		bridge:
			'It combines signals and context so teams can investigate system behavior, failures and data movement.',
		contrast:
			'Monitoring watches chosen conditions; this broader capability supports asking new questions about unexpected states.',
		obvious: 'Logs, metrics, traces, lineage and data-quality signals contribute to it.',
		definition:
			"Observability is the capability to understand a system's internal behavior and state from the evidence it emits.",
		why: 'Healthcare data failures can be partial and silent, so operators need context linking runs, datasets, errors and downstream impact.',
		example:
			'A delayed result feed is traced from source latency through queue depth to affected warehouse tables and dashboards.',
		confusion:
			'A pile of logs is not sufficient if signals lack correlation, ownership and actionable context.',
		related: ['monitoring', 'lineage', 'alerting', 'pipeline'],
		sourceIds: ['openLineage', 'nistSecurity'],
		tags: ['data-engineering', 'operations', 'modernization'],
		freshness: 'recommended-practice'
	}),
	structured: defineConcept('structured', {
		answer: 'STRUCTURED',
		clue: 'Data arranged to a defined schema, where the column at least admits what it believes it contains.',
		nudge: 'Think explicit fields and machine-readable organization.',
		bridge:
			'Values are organized according to a defined model, types and relationships that software can process consistently.',
		contrast:
			'Narrative text and images do not naturally arrive in fixed fields, even when they contain clinically rich meaning.',
		obvious: 'A coded laboratory result in defined fields is this kind of data.',
		definition:
			'Structured data is organized according to an explicit schema, with defined fields, types and relationships.',
		why: 'Reliable validation, search, aggregation and model evaluation are easier when meaning is represented explicitly.',
		example:
			'An observation carries a coded test, numeric value, unit, timestamp and subject in named fields.',
		confusion:
			'Structure does not guarantee correct meaning, complete capture or freedom from bias.',
		related: ['unstructured data', 'schema', 'terminology', 'validation'],
		sourceIds: ['fhirOverview', 'postgresConcepts'],
		tags: ['ai-readiness', 'data-model', 'data-quality']
	}),
	unstructured: defineConcept('unstructured', {
		answer: 'UNSTRUCTURED',
		clue: 'Clinically rich data that declined the invitation to fit into tidy columns.',
		nudge: 'Think narrative, image or audio without a fixed field model.',
		bridge:
			'Its meaning is carried primarily in free text or media rather than predefined machine-readable fields.',
		contrast:
			'Schema-bound records expose values and types directly; this form usually needs interpretation or extraction.',
		obvious: 'A dictated clinical note is a familiar example of this kind of data.',
		definition:
			'Unstructured data lacks a fixed field-level schema for most of its semantic content, as in narrative text, images or audio.',
		why: 'It contains important context but requires careful extraction, evaluation and provenance before automated downstream use.',
		example: 'A radiology narrative contains findings and uncertainty expressed in prose.',
		confusion:
			'It is not meaningless or patternless; the label describes representation, not clinical value.',
		related: ['structured data', 'natural language processing', 'provenance', 'human review'],
		sourceIds: ['fhirOverview', 'nistAiRmf'],
		tags: ['ai-readiness', 'data-model', 'clinical-text']
	}),
	drift: defineConcept('drift', {
		answer: 'DRIFT',
		clue: 'The change that makes yesterday’s model less reliable while its confidence display remains beautifully typeset.',
		nudge: 'Think change after deployment.',
		bridge:
			'The data, relationships or outcomes encountered in use move away from those used to develop and evaluate a model.',
		contrast:
			'Bias can exist from the start; this specifically emphasizes change over time or setting.',
		obvious: 'The word also describes gradual movement away from an original position.',
		definition:
			'Model or data drift is change over time in inputs, relationships, populations or performance relevant to an AI system.',
		why: 'Clinical workflows, coding, populations and treatments change, so initial evaluation does not guarantee continuing performance.',
		example:
			"A risk model's calibration worsens after a new testing policy changes which patients receive laboratory work.",
		confusion:
			'Not every performance change is statistical drift; pipeline bugs, policy changes and measurement shifts must be investigated.',
		related: ['monitoring', 'evaluation', 'calibration', 'data quality'],
		sourceIds: ['nistAiRmf'],
		tags: ['ai-readiness', 'monitoring', 'model-risk'],
		freshness: 'recommended-practice'
	}),
	evaluation: defineConcept('evaluation', {
		answer: 'EVALUATION',
		clue: 'The work of testing whether an AI system helps in its real workflow, beyond admiring one benchmark.',
		nudge: 'Think systematic assessment against intended use.',
		bridge:
			'It measures performance, limitations and impacts using defined criteria, representative data and deployment context.',
		contrast:
			'Validation can ask whether a system meets requirements; this broader assessment also examines utility, harms and tradeoffs.',
		obvious: 'NIST places measurement and assessment throughout the AI risk-management lifecycle.',
		definition:
			"AI evaluation is the systematic assessment of a system's performance, limitations, risks and impacts for its intended context.",
		why: 'Healthcare usefulness depends on populations, workflow, thresholds and consequences—not an isolated aggregate score.',
		example:
			'A study reports discrimination, calibration, subgroup behavior, clinician interaction and downstream safety outcomes.',
		confusion:
			'A single retrospective benchmark does not establish prospective clinical benefit or safe deployment.',
		related: ['validation', 'monitoring', 'drift', 'human review'],
		sourceIds: ['nistAiRmf', 'nistAiGen'],
		tags: ['ai-readiness', 'model-risk', 'validation'],
		freshness: 'recommended-practice'
	}),
	humanreview: defineConcept('humanreview', {
		answer: 'HUMANREVIEW',
		displayAnswer: 'HUMAN REVIEW',
		clue: 'The checkpoint where a person examines the system’s output—provided the workflow grants time and authority to disagree.',
		nudge: 'Think accountable oversight of automated output.',
		bridge:
			'A qualified person assesses an automated recommendation in context and can question, correct or stop its use.',
		contrast:
			'Merely showing output to a person is not meaningful oversight if the interface pressures automatic acceptance.',
		obvious: 'The two-word phrase pairs HUMAN with REVIEW.',
		definition:
			'Human review is an accountable process in which people assess automated outputs and can intervene before or during consequential use.',
		why: 'Clinical context, uncertainty and unusual cases may escape a model, but oversight works only with suitable information and authority.',
		example:
			'A clinician reviews extracted medication changes against the source note before they update the reconciled list.',
		confusion:
			'A nominal person “in the loop” does not neutralize automation bias or unsafe workflow design.',
		related: ['automation bias', 'explainability', 'workflow', 'evaluation'],
		sourceIds: ['nistAiRmf', 'nistAiGen'],
		tags: ['ai-readiness', 'human-factors', 'governance'],
		freshness: 'recommended-practice'
	}),
	dataleakage: defineConcept('dataleakage', {
		answer: 'DATALEAKAGE',
		displayAnswer: 'DATA LEAKAGE',
		clue: 'When model development accidentally learns from information unavailable at the decision point, then celebrates its foresight.',
		nudge: 'Think forbidden information crossing an analysis boundary.',
		bridge:
			'Training or evaluation receives information from the target, future or held-out data that would not be available in real use.',
		contrast:
			'A privacy breach exposes information to an unauthorized party; this statistical failure contaminates model development or testing.',
		obvious: 'The two-word answer joins DATA with LEAKAGE.',
		definition:
			'Data leakage occurs when model training or evaluation improperly uses information unavailable in the intended prediction setting or reserved split.',
		why: 'It creates misleadingly strong results that collapse when the model meets real prospective workflow.',
		example:
			'A readmission model includes a code recorded only after the readmission outcome has already occurred.',
		confusion:
			'The term here is about analytical contamination, though the same phrase is also used for security disclosure.',
		related: ['evaluation', 'temporal split', 'target leakage', 'reproducibility'],
		sourceIds: ['nistAiRmf', 'nistAiGen'],
		tags: ['ai-readiness', 'model-risk', 'data-quality'],
		freshness: 'recommended-practice'
	}),
	validation: defineConcept('validation', {
		answer: 'VALIDATION',
		clue: 'The evidence that data or a system meets defined requirements, rather than merely completing without an exception.',
		nudge: 'Think testing against stated rules and intended use.',
		bridge:
			'It checks structure, content, behavior or performance against explicit expectations and records the outcome.',
		contrast:
			'Verification asks whether something was built as specified; this often also asks whether it is fit for its intended use.',
		obvious:
			'FHIR conformance tools perform this against profiles, while migration teams do it against acceptance criteria.',
		definition:
			'Validation is the documented assessment that data, software or a process conforms to defined requirements and is suitable for its intended use.',
		why: 'Explicit acceptance criteria convert confidence from an opinion into reviewable evidence.',
		example:
			'A migration checks schema rules, referential integrity, population reconciliation and representative clinical workflows.',
		confusion:
			'Passing syntax checks does not establish semantic correctness, clinical safety or complete coverage.',
		related: ['profile', 'reconciliation', 'evaluation', 'data quality'],
		sourceIds: ['fhirProfiling', 'nistAiRmf', 'nistStatistics'],
		tags: ['data-engineering', 'analytics', 'ai-readiness'],
		freshness: 'recommended-practice'
	})
};
