export type ScenarioId = 'maya-lumbar-mri-v1';

export type PathwayId = 'portal-fax' | 'fhir-enabled';

export type PublicFailureId =
	| 'identity-mismatch'
	| 'narrative-only'
	| 'clinically-insufficient'
	| 'authorization-expired';

export type FailureId = 'none' | PublicFailureId;

export type PerspectiveId = 'patient' | 'clinician' | 'architect';

export type ComparisonMode = PathwayId | 'compare';

export type MilestoneId =
	| 'mri-ordered'
	| 'coverage-checked'
	| 'documentation-received'
	| 'evidence-gathered'
	| 'human-review-completed'
	| 'request-submitted'
	| 'request-technically-received'
	| 'payer-review'
	| 'more-information-requested'
	| 'request-supplemented'
	| 'decision-issued'
	| 'scheduled-and-scan-received';

export type ActorId =
	| 'maya'
	| 'ordering-clinician'
	| 'authorization-specialist'
	| 'ehr-workflow'
	| 'payer-service'
	| 'payer-reviewer'
	| 'imaging-scheduler';

export type ActorLane =
	| 'patient-clinician'
	| 'ehr-workflow'
	| 'payer-intermediary'
	| 'imaging-scheduling';

export type EventChannel =
	| 'human'
	| 'portal'
	| 'fax'
	| 'phone'
	| 'cds-hooks'
	| 'fhir'
	| 'subscription'
	| 'internal';

export type EventKind =
	| 'queue'
	| 'human-work'
	| 'machine-processing'
	| 'transfer'
	| 'decision'
	| 'state-change';

export type EventStatus =
	| 'waiting'
	| 'completed'
	| 'failed'
	| 'needs-information'
	| 'pended'
	| 'expired';

export type TechnicalStatus = 'not-submitted' | 'sent' | 'accepted' | 'rejected' | 'not-applicable';

export type BusinessStatus =
	| 'not-started'
	| 'received'
	| 'pended'
	| 'approved'
	| 'denied'
	| 'closed'
	| 'not-applicable';

export type AuthorizationStatus =
	| 'not-requested'
	| 'requested'
	| 'pending'
	| 'approved'
	| 'denied'
	| 'expired';

export type FinalOutcome =
	| 'scan-completed'
	| 'denied'
	| 'expired'
	| 'technical-failure'
	| 'outcome-unknown';

export type WallTimeCategory =
	| 'queue-inbox'
	| 'human-dependent-review'
	| 'missing-information-loop'
	| 'message-transport'
	| 'external-scheduling'
	| 'automated-processing';

export type MilestoneVisitStatus =
	| 'upcoming'
	| 'completed'
	| 'active'
	| 'bypassed'
	| 'failed'
	| 'pended'
	| 'expired';

export type EvidenceRequirement = Readonly<{
	id: string;
	label: string;
	description: string;
	sourceMode: 'structured' | 'narrative' | 'human-attestation';
	resourceRefs: readonly string[];
	fictional: true;
}>;

export type SyntheticCase = Readonly<{
	id: ScenarioId;
	version: '1.0.0';
	synthetic: true;
	syntheticNotice: string;
	patient: Readonly<{
		id: 'urn:example:synthetic:maya-sen';
		name: 'Maya Sen';
		synthetic: true;
	}>;
	coverage: Readonly<{
		id: 'urn:example:synthetic:coverage:maya-sen';
		payerName: 'Example Health Plan (fictional)';
		status: 'active';
		patientReference: 'urn:example:synthetic:maya-sen';
	}>;
	request: Readonly<{
		id: 'urn:example:synthetic:service-request:lumbar-mri';
		resourceType: 'ServiceRequest';
		description: 'Non-urgent outpatient lumbar MRI';
		urgency: 'routine';
	}>;
	evidence: readonly EvidenceRequirement[];
	imagingCapacity: Readonly<{
		model: 'shared-discrete-appointment-slots';
		availableDayOffsets: readonly number[];
		description: string;
	}>;
}>;

export type FictionalPolicy = Readonly<{
	id: 'fictional-lumbar-imaging-evidence-policy-v1';
	version: '1.0.0';
	fictional: true;
	name: 'Example lumbar imaging evidence rule';
	nonDrugMedicalService: true;
	authorizationValidityDays: 14;
	requirements: readonly EvidenceRequirement[];
	decisionRule: string;
	limitations: readonly string[];
}>;

export type PathwayDefinition = Readonly<{
	id: PathwayId;
	label: string;
	description: string;
	baselineElapsedMinutes: number;
	assumptions: readonly string[];
	optionalX12Branch: boolean;
}>;

export type FailureDefinition = Readonly<{
	id: FailureId;
	public: boolean;
	label: string;
	shortLabel: string;
	description: string;
	triggerMilestone: MilestoneId | null;
	affectedRefs: readonly string[];
	technicalStatus: TechnicalStatus;
	businessStatus: BusinessStatus;
	authorizationStatus: AuthorizationStatus;
	patientConsequence: string;
	nextAction: string;
	expectedOutcome: FinalOutcome;
	pathways: readonly PathwayId[];
}>;

export type StatusSnapshot = Readonly<{
	technical: TechnicalStatus;
	business: BusinessStatus;
	authorization: AuthorizationStatus;
	finalOutcome: FinalOutcome | null;
}>;

export type SimulationEvent = Readonly<{
	id: string;
	sequence: number;
	pathway: PathwayId;
	milestone: MilestoneId;
	actorId: ActorId;
	actorLane: ActorLane;
	channel: EventChannel;
	kind: EventKind;
	wallStartMs: number;
	wallEndMs: number;
	staffEffortSeconds: number;
	machineProcessingMs: number;
	status: EventStatus;
	attempt: 1 | 2;
	statuses: StatusSnapshot;
	causedByFailureId?: PublicFailureId;
	patientText: string;
	clinicianText: string;
	architectText: string;
	standardRefs: readonly string[];
	resourceRefs: readonly string[];
	evidenceRefs: readonly string[];
	assumption: boolean;
}>;

export type EventBlueprint = Omit<SimulationEvent, 'sequence' | 'pathway'> &
	Readonly<{ order: number }>;

export type WallTimeSegment = Readonly<{
	id: string;
	pathway: PathwayId;
	category: WallTimeCategory;
	label: string;
	wallStartMs: number;
	wallEndMs: number;
	durationMs: number;
	actorLane: ActorLane;
	causedByFailureId?: PublicFailureId;
	assumption: true;
}>;

export type Clocks = Readonly<{
	patientElapsedMs: number;
	patientElapsedMinutes: number;
	activeHumanWorkSeconds: number;
	automatedProcessingMs: number;
	humanWorkByActor: Readonly<Record<ActorId, number>>;
}>;

export type ClockSnapshot = Readonly<{
	eventId: string;
	milestone: MilestoneId;
	clocks: Clocks;
}>;

export type MilestoneDefinition = Readonly<{
	id: MilestoneId;
	index: number;
	label: string;
	shortLabel: string;
	description: string;
	actorLane: ActorLane;
	optionalBranch: boolean;
}>;

export type MilestoneState = MilestoneDefinition &
	Readonly<{
		visitStatus: MilestoneVisitStatus;
		visited: boolean;
		firstEventId: string | null;
		lastEventId: string | null;
		clocks: Clocks;
		consequence: string;
	}>;

export type FailureImpact = Readonly<{
	failureId: PublicFailureId;
	triggerMilestone: MilestoneId;
	rewindMilestone: MilestoneId;
	commonEventPrefixLength: number;
	affectedEventIds: readonly string[];
	patientConsequence: string;
	nextAction: string;
}>;

export type ScenarioInput = Readonly<{
	scenarioId?: ScenarioId;
	pathway: PathwayId;
	failureId?: FailureId;
}>;

export type CompiledRun = Readonly<{
	scenarioVersion: '1.0.0';
	input: Readonly<Required<ScenarioInput>>;
	case: SyntheticCase;
	policy: FictionalPolicy;
	pathway: PathwayDefinition;
	failure: FailureDefinition;
	events: readonly SimulationEvent[];
	wallTimeSegments: readonly WallTimeSegment[];
	clocks: Clocks;
	clockSnapshots: readonly ClockSnapshot[];
	milestones: readonly MilestoneState[];
	visitedMilestones: readonly MilestoneId[];
	statuses: StatusSnapshot;
	finalOutcome: FinalOutcome;
	failureImpact: FailureImpact | null;
	evidenceRefs: readonly string[];
	resourceRefs: readonly string[];
	fhirFixtureIds: readonly string[];
	assumptions: readonly string[];
}>;

export type ComparisonRun = Readonly<{
	failureId: FailureId;
	portalFax: CompiledRun;
	fhirEnabled: CompiledRun;
}>;

export type LedgerRow = Readonly<{
	id: string;
	sequence: number;
	milestone: MilestoneId;
	milestoneLabel: string;
	actor: ActorId;
	channel: EventChannel;
	status: EventStatus;
	statusLabel: string;
	wallStartMs: number;
	wallEndMs: number;
	patientElapsedMs: number;
	activeHumanWorkSeconds: number;
	automatedProcessingMs: number;
	text: string;
	technicalStatus: TechnicalStatus;
	businessStatus: BusinessStatus;
	authorizationStatus: AuthorizationStatus;
	standardRefs: readonly string[];
	resourceRefs: readonly string[];
	evidenceRefs: readonly string[];
	causedByFailureId?: PublicFailureId;
}>;

export type ClockSeriesPoint = Readonly<{
	milestone: MilestoneId;
	milestoneIndex: number;
	label: string;
	patientElapsedMs: number;
	activeHumanWorkSeconds: number;
	automatedProcessingMs: number;
}>;

export type WallTimeBreakdownItem = Readonly<{
	category: WallTimeCategory;
	label: string;
	durationMs: number;
	fraction: number;
}>;

export type ComparisonSummary = Readonly<{
	patientElapsedDeltaMs: number;
	activeHumanWorkDeltaSeconds: number;
	automatedProcessingDeltaMs: number;
	portalFax: Clocks;
	fhirEnabled: Clocks;
	conclusion: string;
}>;
