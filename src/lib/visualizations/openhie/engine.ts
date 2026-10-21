import { ASSUMPTIONS, DEFAULT_SETTINGS, MODEL_VERSION, SCENARIOS } from './catalog';
import type {
	ClinicalEvent,
	ComponentId,
	ExchangeEvent,
	IdentityState,
	Run,
	ScenarioId,
	Settings,
	Snapshot,
	TransactionStatus
} from './types';

const EXCHANGE_PATIENT = 'urn:example:synthetic:patient:asha';
const TEACHING_CODES = 'https://example.org/openhie/teaching-codes';
const CLINIC_PATIENT = 'urn:example:synthetic:clinic-a:patient-1';
const LAB_PATIENT = 'urn:example:synthetic:lab:patient-7';
const HOSPITAL_PATIENT = 'urn:example:synthetic:hospital-b:patient-42';

const ENCOUNTER: ClinicalEvent = {
	id: 'urn:example:synthetic:clinic-a:encounter-1',
	kind: 'encounter',
	title: 'Clinic A encounter',
	source: 'clinic',
	occurredAt: '2026-01-12T09:00:00Z',
	recordedAt: '2026-01-12T09:02:00Z',
	exchangedAt: null,
	patientLocalId: CLINIC_PATIENT,
	patientExchangeId: null,
	code: {
		system: 'https://example.org/clinic-a/codes',
		code: 'LOCAL-VISIT',
		display: 'Teaching outpatient encounter'
	},
	provenance: {
		sourceRecordId: 'urn:example:synthetic:clinic-a:encounter-1',
		facilityId: 'urn:example:synthetic:facility:clinic-a',
		workerId: 'urn:example:synthetic:worker:clinician-a',
		originalCode: 'LOCAL-VISIT',
		mapping: null
	},
	value: null
};

const LAB_RESULT: ClinicalEvent = {
	id: 'urn:example:synthetic:lab:observation-1',
	kind: 'lab-result',
	title: 'Laboratory teaching result',
	source: 'lab',
	occurredAt: '2026-01-12T13:00:00Z',
	recordedAt: '2026-01-12T13:15:00Z',
	exchangedAt: null,
	patientLocalId: LAB_PATIENT,
	patientExchangeId: null,
	code: {
		system: 'https://example.org/lab/codes',
		code: 'LOCAL-HB',
		display: 'Teaching haemoglobin measurement'
	},
	provenance: {
		sourceRecordId: 'urn:example:synthetic:lab:observation-1',
		facilityId: 'urn:example:synthetic:facility:lab',
		workerId: 'urn:example:synthetic:worker:lab-worker',
		originalCode: 'LOCAL-HB',
		mapping: null
	},
	value: '13.2 g/dL — synthetic value; no clinical interpretation'
};

const SCENARIO_SETTINGS: Record<ScenarioId, Partial<Settings>> = {
	success: {},
	ambiguous: { identityKnown: false },
	terminology: { terminologyMapped: false },
	denied: { authorized: false },
	outage: { serviceAvailable: false },
	duplicate: {}
};

/** Accept actual booleans only; unknown keys, strings and malformed values are ignored. */
export function normalizeSettings(value: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
	const input =
		value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return Object.freeze({
		identityKnown:
			typeof input.identityKnown === 'boolean' ? input.identityKnown : fallback.identityKnown,
		terminologyMapped:
			typeof input.terminologyMapped === 'boolean'
				? input.terminologyMapped
				: fallback.terminologyMapped,
		authorized: typeof input.authorized === 'boolean' ? input.authorized : fallback.authorized,
		serviceAvailable:
			typeof input.serviceAvailable === 'boolean'
				? input.serviceAvailable
				: fallback.serviceAvailable
	});
}

function freeze<T>(value: T): T {
	if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}

function normalizeClinical(record: ClinicalEvent, code: string, mapping: string): ClinicalEvent {
	return {
		...record,
		patientExchangeId: EXCHANGE_PATIENT,
		exchangedAt: record.kind === 'encounter' ? '2026-01-12T09:03:00Z' : '2026-01-12T13:16:00Z',
		code: { ...record.code, system: TEACHING_CODES, code },
		provenance: { ...record.provenance, mapping }
	};
}

type Frame = Omit<
	Snapshot,
	| 'step'
	| 'localEvents'
	| 'sharedEvents'
	| 'returnedEvents'
	| 'identity'
	| 'persistedCount'
	| 'duplicateCount'
	| 'trace'
>;

/**
 * Compile the same small case through explicit gates. Settings change a gate,
 * never the original patient, source evidence or a previously completed event.
 * No wall-clock, randomness, renderer state or browser global enters this model.
 */
export function compileRun(scenarioId: ScenarioId = 'success', overrides?: Partial<Settings>): Run {
	const scenario = SCENARIOS.find((item) => item.id === scenarioId)?.id ?? 'success';
	const settings = normalizeSettings(overrides, normalizeSettings(SCENARIO_SETTINGS[scenario]));
	const events: ExchangeEvent[] = [];
	const snapshots: Snapshot[] = [];
	let localEvents: ClinicalEvent[] = [ENCOUNTER];
	let sharedEvents: ClinicalEvent[] = [];
	let returnedEvents: ClinicalEvent[] = [];
	let duplicateCount = 0;
	let identity: IdentityState = {
		state: 'unresolved',
		clinicLocalId: CLINIC_PATIENT,
		hospitalLocalId: HOSPITAL_PATIENT,
		exchangeId: null
	};
	const requestCounts = new Map<string, number>();

	function exchange(
		requestId: string,
		from: ComponentId,
		to: ComponentId,
		direction: ExchangeEvent['direction'],
		status: TransactionStatus,
		summary: string,
		payload: ExchangeEvent['payload'] = null
	) {
		const sequence = (requestCounts.get(requestId) ?? 0) + 1;
		requestCounts.set(requestId, sequence);
		events.push({
			id: `${requestId}:${sequence}`,
			requestId,
			from,
			to,
			direction,
			status,
			summary,
			payload
		});
	}

	function frame(copy: Frame) {
		snapshots.push({
			...copy,
			step: snapshots.length,
			localEvents: [...localEvents],
			sharedEvents: [...sharedEvents],
			returnedEvents: [...returnedEvents],
			identity: { ...identity },
			persistedCount: sharedEvents.length,
			duplicateCount,
			trace: [...events]
		});
	}

	function finish(): Run {
		return freeze({
			id: `${MODEL_VERSION}:${scenario}:${Object.values(settings).map(Boolean).map(Number).join('')}`,
			scenario,
			settings,
			events,
			snapshots,
			assumptions: ASSUMPTIONS
		});
	}

	function persist(record: ClinicalEvent): boolean {
		if (sharedEvents.some((existing) => existing.id === record.id)) {
			duplicateCount += 1;
			return false;
		}
		sharedEvents = [...sharedEvents, record];
		return true;
	}

	frame({
		chapter: 0,
		activeComponent: 'clinic',
		title: 'The information already exists.',
		explanation:
			'Asha has an encounter in Clinic A’s register. At Hospital B, that is still a surprisingly weak form of existence.',
		why: 'The source system owns the original. Sharing begins with an identifiable record, not an animated arrow.',
		changed: 'One local encounter exists. Nothing has entered the shared clinical record.',
		nextAction: 'Resolve Clinic A’s patient identifier through the Client Registry.',
		patient: 'You have told one clinic your story. The next clinic cannot yet see it.',
		clinician: 'The encounter is saved locally; there is no shared clinical copy.',
		architect:
			'The source record retains its local patient ID, original code, author, facility and timestamp.',
		status: 'ready',
		transactionStatus: 'not-sent',
		payload: { sourceRecord: ENCOUNTER }
	});

	exchange(
		'identity-clinic',
		'clinic',
		'iol',
		'request',
		'sent',
		'Resolve the source patient identifier.',
		{ patientLocalId: CLINIC_PATIENT }
	);
	exchange(
		'identity-clinic',
		'iol',
		'client',
		'request',
		'sent',
		'Query the declared patient-identity fixture.',
		{ patientLocalId: CLINIC_PATIENT }
	);
	frame({
		chapter: 0,
		activeComponent: 'client',
		title: 'Whose record is this?',
		explanation:
			'A local number is useful at the desk that issued it. The exchange needs an explicit link to the person.',
		why: 'Clinical information attached to the wrong identity can be more dangerous than missing information.',
		changed: 'An identity query has been sent. No clinical data has been shared.',
		nextAction: 'Inspect the Client Registry response.',
		patient: 'The systems are checking that they are talking about the same person.',
		clinician: 'Wait for identity resolution before associating shared clinical content.',
		architect:
			'Clinic A → IOL → Client Registry. This query resolves identifiers; it does not retrieve a chart.',
		status: 'working',
		transactionStatus: 'sent',
		payload: { patientLocalId: CLINIC_PATIENT }
	});

	if (!settings.identityKnown) {
		identity = { ...identity, state: 'review' };
		exchange(
			'identity-clinic',
			'client',
			'iol',
			'response',
			'rejected',
			'Two declared candidates; evidence is insufficient.',
			{ issue: 'identity-review-required', candidateCount: 2 }
		);
		exchange(
			'identity-clinic',
			'iol',
			'clinic',
			'response',
			'rejected',
			'Do not associate clinical records until identity is reviewed.',
			{ issue: 'identity-review-required' }
		);
		frame({
			chapter: 0,
			activeComponent: 'client',
			title: 'A useful stop.',
			explanation:
				'Two possible people remain. The model refuses to turn uncertainty into a confident line on the diagram.',
			why: 'A match needs evidence and accountable review. Similar-looking names are not permission to merge.',
			changed:
				'Identity is marked for review. The exchange ID stays unresolved and the shared record remains empty.',
			nextAction:
				'Review the source identity evidence, then mark the identity link as confirmed and replay this gate.',
			patient:
				'Your local record is safe. Staff need to resolve an identity discrepancy before sharing it.',
			clinician: 'A human reconciliation task is required; no clinical association was made.',
			architect:
				'The fixture declares ambiguous candidates. No probabilistic score is computed and no merge is performed.',
			status: 'blocked',
			transactionStatus: 'rejected',
			payload: { issue: 'identity-review-required', candidateCount: 2 }
		});
		return finish();
	}

	identity = { ...identity, state: 'linked', exchangeId: EXCHANGE_PATIENT };
	exchange(
		'identity-clinic',
		'client',
		'iol',
		'response',
		'returned',
		'Return the confirmed exchange identity.',
		{ patientLocalId: CLINIC_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	);
	exchange(
		'identity-clinic',
		'iol',
		'clinic',
		'response',
		'returned',
		'Return the identity link to Clinic A.',
		{ patientLocalId: CLINIC_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	);
	frame({
		chapter: 0,
		activeComponent: 'client',
		title: 'One person. More than one number.',
		explanation:
			'Clinic A’s number now has an explicit link to an exchange identity. No clinical history travelled with that answer.',
		why: 'Identity linkage and clinical exchange are separate responsibilities.',
		changed: 'The identity link exists. The encounter is still local.',
		nextAction: 'Submit the encounter through the Interoperability Layer.',
		patient: 'The exchange can identify you. Your encounter has not yet been shared.',
		clinician: 'Use the confirmed exchange identity when submitting the encounter.',
		architect:
			'Client Registry response supplies a governed identifier link, not a clinical record.',
		status: 'success',
		transactionStatus: 'returned',
		payload: { ...identity }
	});

	exchange(
		'encounter-save',
		'clinic',
		'iol',
		'request',
		'sent',
		'Submit the original encounter with its identity reference.',
		{ clinicalRecord: ENCOUNTER, patientExchangeId: EXCHANGE_PATIENT }
	);
	frame({
		chapter: 1,
		activeComponent: 'iol',
		title: 'Received is not saved.',
		explanation:
			'The dispatch desk has the envelope. It still has work to do before anything belongs in the shared record.',
		why: 'Routing, authentication, configured access rules and audit belong at the exchange boundary.',
		changed:
			'The trusted Clinic A submission has entered the IOL. The shared record is still empty.',
		nextAction:
			'Resolve the source facility and health-worker references, then validate the teaching code.',
		patient:
			'The information is being prepared for sharing. It is not available at the next clinic yet.',
		clinician: 'A received message is not a persistence acknowledgement.',
		architect:
			'System authentication is assumed valid for the curated Clinic A fixture. Author identity is checked separately.',
		status: 'working',
		transactionStatus: 'accepted',
		payload: { clinicalRecord: ENCOUNTER, patientExchangeId: EXCHANGE_PATIENT }
	});

	for (const registry of ['facility', 'worker'] as const) {
		const ref =
			registry === 'facility' ? ENCOUNTER.provenance.facilityId : ENCOUNTER.provenance.workerId;
		exchange(
			`encounter-${registry}`,
			'iol',
			registry,
			'request',
			'sent',
			`Resolve the declared source ${registry} reference.`,
			{ reference: ref }
		);
		exchange(
			`encounter-${registry}`,
			registry,
			'iol',
			'response',
			'returned',
			`Confirm the curated ${registry} identity.`,
			{ reference: ref, verified: true }
		);
		frame({
			chapter: 1,
			activeComponent: registry,
			title: registry === 'facility' ? 'Where did the care happen?' : 'Who recorded it?',
			explanation:
				registry === 'facility'
					? 'The facility reference survives the journey as a known place, rather than a free-text name somebody must guess.'
					: 'The worker reference identifies the source author. A staff directory is still not the key to every chart.',
			why:
				registry === 'facility'
					? 'Source context matters when another clinician evaluates the record.'
					: 'Workforce identity, system authentication and record-access permission answer different questions.',
			changed: `The source ${registry} reference is confirmed against a curated teaching fixture.`,
			nextAction:
				registry === 'facility'
					? 'Resolve the source health-worker reference.'
					: 'Validate the encounter code against the teaching vocabulary.',
			patient: 'The shared record will retain where the information came from and who recorded it.',
			clinician: 'The original author and organisation remain traceable.',
			architect: `IOL → ${registry} registry → IOL. This is reference resolution, not an extra clinical record or an appointment promise.`,
			status: 'working',
			transactionStatus: 'returned',
			payload: { reference: ref, verified: true }
		});
	}

	exchange(
		'encounter-code',
		'iol',
		'terminology',
		'request',
		'sent',
		'Validate the declared encounter teaching code.',
		{ code: ENCOUNTER.code }
	);
	exchange(
		'encounter-code',
		'terminology',
		'iol',
		'response',
		'returned',
		'Apply the curated encounter mapping.',
		{ sourceCode: 'LOCAL-VISIT', targetCode: 'visit', mapping: 'teaching-map-v1' }
	);
	const normalizedEncounter = normalizeClinical(
		ENCOUNTER,
		'visit',
		'teaching-map-v1:LOCAL-VISIT→visit'
	);
	exchange('encounter-save', 'iol', 'shr', 'request', 'sent', 'Save the normalized encounter.', {
		clinicalRecord: normalizedEncounter
	});
	if (!settings.serviceAvailable) {
		exchange(
			'encounter-save',
			'shr',
			'iol',
			'response',
			'timeout',
			'Shared-record service did not acknowledge the write.',
			{ issue: 'service-unavailable', durableEventKey: normalizedEncounter.id }
		);
		exchange(
			'encounter-save',
			'iol',
			'clinic',
			'response',
			'timeout',
			'No persistence is confirmed; retain the source and retry safely.',
			{ issue: 'persistence-unconfirmed', durableEventKey: normalizedEncounter.id }
		);
		frame({
			chapter: 1,
			activeComponent: 'shr',
			title: 'The cupboard does not answer.',
			explanation:
				'The source record remains at Clinic A. The exchange has no persistence acknowledgement and refuses to paint one green.',
			why: 'A real timeout may leave the outcome unknown. This selected fixture models a service unavailable before its write commits.',
			changed: 'The source is retained; this fixture has committed no shared encounter.',
			nextAction:
				'Restore service, reconcile an unknown outcome in a real system, and retry with the same durable event key.',
			patient:
				'Your encounter has not disappeared. It is not yet confirmed available to the next clinic.',
			clinician:
				'Keep the local original and its event key. Do not tell Hospital B that sharing is complete.',
			architect:
				'The demo injects failure before persistence. It does not claim every timed-out real request was rolled back.',
			status: 'unavailable',
			transactionStatus: 'timeout',
			payload: { issue: 'persistence-unconfirmed', durableEventKey: normalizedEncounter.id }
		});
		return finish();
	}

	persist(normalizedEncounter);
	exchange(
		'encounter-save',
		'shr',
		'iol',
		'response',
		'persisted',
		'Acknowledge the committed encounter.',
		{ eventKey: normalizedEncounter.id, persisted: true }
	);
	exchange(
		'encounter-save',
		'iol',
		'clinic',
		'response',
		'persisted',
		'Return the persistence acknowledgement to Clinic A.',
		{ eventKey: normalizedEncounter.id, persisted: true }
	);
	frame({
		chapter: 1,
		activeComponent: 'shr',
		title: 'A shared copy, with its history attached.',
		explanation:
			'The encounter now belongs to the shared clinical subset. Its source record is still at Clinic A.',
		why: 'Normalization changes shared identifiers and codes while preserving the original context and provenance.',
		changed: 'One normalized encounter is committed and acknowledged.',
		nextAction: 'Add a laboratory result from a second source system.',
		patient: 'An authorized next clinic can request this shared encounter.',
		clinician: 'The source and shared copy retain the same durable event key and recorded time.',
		architect:
			'Patient identity and clinical content are separate stores. This SHR contains a subset, not every source-chart field.',
		status: 'success',
		transactionStatus: 'persisted',
		payload: { clinicalRecord: normalizedEncounter }
	});

	localEvents = [...localEvents, LAB_RESULT];
	frame({
		chapter: 2,
		activeComponent: 'lab',
		title: 'Another desk. Another vocabulary.',
		explanation:
			'The laboratory has a result, a local patient number and a code of its own. The exchange must keep the meaning intact.',
		why: 'A valid-looking number without its person, unit, source and code is not a useful shared observation.',
		changed: 'A second local event exists. The SHR still has only the encounter.',
		nextAction:
			'Resolve the laboratory’s patient identifier and inspect its configured code mapping.',
		patient:
			'Your result exists at the laboratory. Hospital B cannot yet retrieve it from this shared record.',
		clinician:
			'The lab value is synthetic and carries no interpretation or treatment recommendation.',
		architect:
			'This is a simplified result-save teaching step. The order, specimen, Task and notification workflow are outside scope.',
		status: 'ready',
		transactionStatus: 'not-sent',
		payload: { sourceRecord: LAB_RESULT }
	});
	exchange('lab-save', 'lab', 'iol', 'request', 'sent', 'Submit the source laboratory result.', {
		clinicalRecord: LAB_RESULT
	});
	exchange(
		'identity-lab',
		'iol',
		'client',
		'request',
		'sent',
		'Resolve the curated laboratory-local patient identifier.',
		{ patientLocalId: LAB_PATIENT }
	);
	exchange(
		'identity-lab',
		'client',
		'iol',
		'response',
		'returned',
		'The lab identifier links to the same declared patient.',
		{ patientLocalId: LAB_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	);
	exchange(
		'lab-code',
		'iol',
		'terminology',
		'request',
		'sent',
		'Look up the governed laboratory teaching-code mapping.',
		{ code: LAB_RESULT.code }
	);
	frame({
		chapter: 2,
		activeComponent: 'terminology',
		title: 'The dictionary needs an agreement.',
		explanation:
			'The patient link is known. The local code still needs a checked, versioned meaning before the result enters the shared vocabulary.',
		why: 'Transport does not establish clinical equivalence. A similar label is not a governed mapping.',
		changed:
			'The lab identity is resolved and a code-translation request is pending. The result is still local.',
		nextAction: 'Inspect the mapping response.',
		patient:
			'The systems are checking what the laboratory’s label means before sharing the number.',
		clinician: 'Do not treat an unmapped local code as an established shared clinical concept.',
		architect:
			'The fictional mapping table uses an example.org vocabulary. No LOINC or SNOMED equivalence is inferred.',
		status: 'working',
		transactionStatus: 'sent',
		payload: { localCode: LAB_RESULT.code, vocabulary: TEACHING_CODES }
	});
	if (!settings.terminologyMapped) {
		exchange(
			'lab-code',
			'terminology',
			'iol',
			'response',
			'rejected',
			'No approved mapping exists for this local code.',
			{ issue: 'mapping-required', localCode: 'LOCAL-HB' }
		);
		exchange(
			'lab-save',
			'iol',
			'lab',
			'response',
			'rejected',
			'Hold the result for terminology review; do not guess.',
			{ issue: 'mapping-required' }
		);
		frame({
			chapter: 2,
			activeComponent: 'terminology',
			title: 'The number can wait. Its meaning cannot be guessed.',
			explanation:
				'The local result remains intact. The exchange holds that result while the already shared encounter stays available.',
			why: 'A technical success carrying an unagreed code would conceal the problem instead of solving it.',
			changed: 'The encounter remains shared. The lab result has not been committed to the SHR.',
			nextAction:
				'Review and approve the teaching-code mapping, then resubmit the original source event.',
			patient:
				'Your encounter is shared. The lab result needs a terminology review before it can join it.',
			clinician: 'A terminology steward must check the code, unit and intended meaning.',
			architect:
				'The mapping gate prevents this clinical write. It does not delete the source result or roll back the earlier encounter.',
			status: 'blocked',
			transactionStatus: 'rejected',
			payload: { issue: 'mapping-required', localCode: 'LOCAL-HB' }
		});
		return finish();
	}
	exchange(
		'lab-code',
		'terminology',
		'iol',
		'response',
		'returned',
		'Return the approved fictional lab mapping.',
		{ sourceCode: 'LOCAL-HB', targetCode: 'hb', mapping: 'teaching-map-v1' }
	);
	const normalizedLab = normalizeClinical(LAB_RESULT, 'hb', 'teaching-map-v1:LOCAL-HB→hb');
	exchange(
		'lab-save',
		'iol',
		'shr',
		'request',
		'sent',
		'Save the normalized laboratory result with source provenance.',
		{ clinicalRecord: normalizedLab }
	);
	persist(normalizedLab);
	exchange(
		'lab-save',
		'shr',
		'iol',
		'response',
		'persisted',
		'Acknowledge the committed laboratory result.',
		{ eventKey: normalizedLab.id, persisted: true }
	);
	exchange(
		'lab-save',
		'iol',
		'lab',
		'response',
		'persisted',
		'Return the persistence acknowledgement to the laboratory.',
		{ eventKey: normalizedLab.id, persisted: true }
	);
	frame({
		chapter: 2,
		activeComponent: 'shr',
		title: 'The result joins the encounter.',
		explanation:
			'Two sources now contribute two clinical events to the same patient’s shared subset. Their original contexts remain visible.',
		why: 'Joining records should preserve provenance, not wash away where the facts came from.',
		changed:
			'Two unique clinical events are committed. The local result is retained with its original code.',
		nextAction:
			scenario === 'duplicate'
				? 'Replay the same lab submission using its original durable event key.'
				: 'Follow Asha to Hospital B.',
		patient: 'An authorized next clinic can now request the encounter and the lab result.',
		clinician:
			'The shared result includes the source, time, value, unit and explicit teaching-code mapping.',
		architect:
			'One normalized lab event was appended. This is a clinical subset, not an automatic copy of the whole laboratory database.',
		status: 'success',
		transactionStatus: 'persisted',
		payload: { clinicalRecord: normalizedLab }
	});

	if (scenario === 'duplicate') {
		exchange(
			'lab-retry',
			'lab',
			'iol',
			'request',
			'sent',
			'Replay the original source event using the same durable key.',
			{ clinicalRecord: normalizedLab, durableEventKey: normalizedLab.id }
		);
		exchange(
			'lab-retry',
			'iol',
			'shr',
			'request',
			'sent',
			'Check and apply the original durable event key.',
			{ clinicalRecord: normalizedLab, durableEventKey: normalizedLab.id }
		);
		const inserted = persist(normalizedLab);
		const resultStatus: TransactionStatus = inserted ? 'persisted' : 'deduplicated';
		exchange(
			'lab-retry',
			'shr',
			'iol',
			'response',
			resultStatus,
			inserted
				? 'Commit a previously unseen event.'
				: 'Return the existing event without a second clinical result.',
			{ eventKey: normalizedLab.id, duplicate: !inserted }
		);
		exchange(
			'lab-retry',
			'iol',
			'lab',
			'response',
			resultStatus,
			'Return the durable event outcome.',
			{ eventKey: normalizedLab.id, duplicate: !inserted }
		);
		frame({
			chapter: 2,
			activeComponent: 'shr',
			title: 'The same envelope is still the same event.',
			explanation:
				'A second delivery arrives with the original source key. The selected duplicate guard returns the existing result.',
			why: 'Safe recovery needs durable identity for the clinical event as well as the patient.',
			changed: `${sharedEvents.length} unique events remain; ${duplicateCount} duplicate submission was recognized.`,
			nextAction: 'Query the shared subset from Hospital B.',
			patient: 'Your laboratory result is not counted twice because the message travelled twice.',
			clinician: 'One clinical result remains, with the original source event key.',
			architect:
				'This explicit idempotency policy belongs to the demo. It is not an automatic guarantee of every OpenHIE implementation.',
			status: inserted ? 'success' : 'duplicate',
			transactionStatus: resultStatus,
			payload: { eventKey: normalizedLab.id, duplicate: !inserted }
		});
	}

	exchange(
		'identity-hospital',
		'hospital',
		'iol',
		'request',
		'sent',
		'Resolve Hospital B’s local patient identifier.',
		{ patientLocalId: HOSPITAL_PATIENT }
	);
	exchange(
		'identity-hospital',
		'iol',
		'client',
		'request',
		'sent',
		'Query the confirmed hospital-to-exchange identity fixture.',
		{ patientLocalId: HOSPITAL_PATIENT }
	);
	exchange(
		'identity-hospital',
		'client',
		'iol',
		'response',
		'returned',
		'Resolve Hospital B’s identifier to the same person.',
		{ patientLocalId: HOSPITAL_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	);
	exchange(
		'identity-hospital',
		'iol',
		'hospital',
		'response',
		'returned',
		'Return the identity link without clinical content.',
		{ patientLocalId: HOSPITAL_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	);
	frame({
		chapter: 3,
		activeComponent: 'hospital',
		title: 'At the next desk.',
		explanation:
			'Hospital B has another local number for Asha. The identity index connects it to the same person. Access is a separate question.',
		why: 'Knowing which person a record describes does not grant permission to read that record.',
		changed:
			'Hospital B has the exchange identity. No clinical payload has been delivered to Hospital B.',
		nextAction: 'Request the available shared clinical subset under the configured access policy.',
		patient: 'The next clinic can identify you. It still needs permission to see the information.',
		clinician: 'Patient identity is resolved; do not infer that chart access has been granted.',
		architect:
			'Identity query response contains identifiers only. The clinical query will be checked separately by the IOL.',
		status: 'working',
		transactionStatus: 'returned',
		payload: { patientLocalId: HOSPITAL_PATIENT, patientExchangeId: EXCHANGE_PATIENT }
	});
	exchange(
		'clinical-query',
		'hospital',
		'iol',
		'request',
		'sent',
		'Request the available shared clinical subset.',
		{ patientExchangeId: EXCHANGE_PATIENT, purpose: 'synthetic-direct-care' }
	);
	if (!settings.authorized) {
		exchange(
			'clinical-query',
			'iol',
			'hospital',
			'response',
			'rejected',
			'Configured clinical access policy denies the request; no clinical payload.',
			null
		);
		frame({
			chapter: 3,
			activeComponent: 'iol',
			title: 'The door stays shut.',
			explanation:
				'The patient identity is known. This requester’s configured permission is insufficient. No clinical query reaches the SHR.',
			why: 'Interoperability includes appropriate refusal. Finding data is not permission to disclose it.',
			changed:
				'Hospital B receives no clinical payload. The shared records remain stored and unchanged.',
			nextAction:
				'Review the legitimate access basis and configured policy; retry only after authorization is established.',
			patient: 'The requester has not been allowed to read your shared clinical information.',
			clinician:
				'An access denial is not an empty clinical record and not evidence that the patient has no history.',
			architect:
				'The IOL denies the clinical request before the SHR query. The response payload is null; no clinical events are returned.',
			status: 'denied',
			transactionStatus: 'rejected',
			payload: null
		});
		return finish();
	}
	exchange(
		'clinical-query',
		'iol',
		'shr',
		'request',
		'sent',
		'Forward the authorized query for this exchange identity.',
		{ patientExchangeId: EXCHANGE_PATIENT }
	);
	returnedEvents = sharedEvents.filter(
		(record) => record.patientExchangeId === identity.exchangeId
	);
	exchange(
		'clinical-query',
		'shr',
		'iol',
		'response',
		'returned',
		'Return the matching shared clinical subset.',
		{ patientExchangeId: EXCHANGE_PATIENT, clinicalEvents: [...returnedEvents] }
	);
	exchange(
		'clinical-query',
		'iol',
		'hospital',
		'response',
		'returned',
		'Deliver the authorized clinical response to Hospital B.',
		{ patientExchangeId: EXCHANGE_PATIENT, clinicalEvents: [...returnedEvents] }
	);
	frame({
		chapter: 3,
		activeComponent: 'hospital',
		title: 'The patient can stop being the courier.',
		explanation:
			'Hospital B receives the available encounter and lab result with their source history. The patient did not have to recreate them.',
		why: 'Useful exchange preserves identity, meaning, permission and context until the information reaches the next point of care.',
		changed: `${returnedEvents.length} shared clinical events were returned to the authorized requester.`,
		nextAction:
			'Inspect the provenance, change a failure condition, or replay the same journey through another lens.',
		patient:
			'The next clinic can inspect the available shared encounter and result. This model makes no claim about a clinical decision.',
		clinician:
			'Review source, time, code and context before using the result. Shared information does not remove clinical responsibility.',
		architect:
			'The returned subset is selected from persisted state using the resolved exchange identity; it is not a separate hardcoded success payload.',
		status: 'success',
		transactionStatus: 'returned',
		payload: { patientExchangeId: EXCHANGE_PATIENT, clinicalEvents: [...returnedEvents] }
	});
	return finish();
}
