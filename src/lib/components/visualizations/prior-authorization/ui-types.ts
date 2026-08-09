export type UiPathwayId = 'portal-fax' | 'fhir-enabled';

export type UiPerspectiveId = 'patient' | 'clinician' | 'architect';

export type UiPlaybackStatus = 'ready' | 'playing' | 'paused' | 'complete' | 'error';

export type UiStepStatus =
	| 'upcoming'
	| 'completed'
	| 'active'
	| 'bypassed'
	| 'failed'
	| 'pended'
	| 'expired';

export interface UiClockSnapshot {
	patientElapsedMinutes: number;
	humanWorkSeconds: number;
	automatedProcessingMs: number;
	providerWorkSeconds?: number;
	payerWorkSeconds?: number;
	schedulingWorkSeconds?: number;
}

export interface UiJourneyStep {
	id: string;
	index: number;
	label: string;
	shortLabel: string;
	actor: string;
	lane: string;
	status: UiStepStatus;
	patientText: string;
	clinicianText: string;
	architectText: string;
	clock: UiClockSnapshot;
	channel?: string;
	technicalStatus?: string;
	businessStatus?: string;
	authorizationStatus?: string;
	finalOutcome?: string;
	staffEffortSeconds: number;
	machineProcessingMs: number;
	standardRefs: string[];
	resourceRefs: string[];
	evidenceRefs: string[];
	causedByFailureId?: string;
}

export interface UiLedgerRow {
	id: string;
	sequence: number;
	stepIndex: number;
	milestone: string;
	actor: string;
	channel: string;
	kind: string;
	status: string;
	wallStartMinute: number;
	wallEndMinute: number;
	staffEffortSeconds: number;
	machineProcessingMs: number;
	patientText: string;
	clinicianText: string;
	architectText: string;
	technicalStatus?: string;
	businessStatus?: string;
	authorizationStatus?: string;
	finalOutcome?: string;
	resourceRefs: string[];
	standardRefs: string[];
	causedByFailureId?: string;
}

export interface UiWallSegment {
	id: string;
	label: string;
	category:
		| 'queue'
		| 'human-review'
		| 'missing-information'
		| 'transport'
		| 'scheduling'
		| 'automated';
	startMinute: number;
	endMinute: number;
	durationMinutes: number;
}

export interface UiCumulativePoint {
	stepIndex: number;
	label: string;
	patientElapsedMinutes: number;
	humanWorkSeconds: number;
	automatedProcessingMs: number;
}

export interface UiAssumption {
	id: string;
	label: string;
	detail: string;
	value?: string;
}

export interface UiFailure {
	id: string;
	label: string;
	shortLabel: string;
	triggerLabel: string;
	whatBroke: string;
	systemResponse: string;
	patientConsequence: string;
	nextAction: string;
	expectedOutcome: string;
	technicalStatus: string;
	businessStatus: string;
	authorizationStatus: string;
	affectsBothPathways: boolean;
}

export interface UiRun {
	pathway: UiPathwayId;
	pathwayLabel: string;
	failureId: string;
	outcome: string;
	authorizationStatus: string;
	identifiers: {
		patient: string;
		coverage: string;
		coveragePatientReference: string;
		serviceRequest: string;
	};
	steps: UiJourneyStep[];
	ledger: UiLedgerRow[];
	clock: UiClockSnapshot;
	wallSegments: UiWallSegment[];
	cumulative: UiCumulativePoint[];
	assumptions: UiAssumption[];
	transaction400msEventId?: string;
	highlightTransactionMs?: number;
}

export interface UiShareState {
	pathway: UiPathwayId;
	failureId: string;
	stepIndex: number;
	perspective: UiPerspectiveId;
	view: 'journey' | 'compare';
}
