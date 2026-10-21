export type ScenarioId =
	| 'success'
	| 'ambiguous'
	| 'terminology'
	| 'denied'
	| 'outage'
	| 'duplicate';
export type ComponentId =
	| 'clinic'
	| 'iol'
	| 'client'
	| 'facility'
	| 'worker'
	| 'terminology'
	| 'shr'
	| 'lab'
	| 'hospital';
export type Lens = 'patient' | 'clinician' | 'architect';

export interface Settings {
	readonly identityKnown: boolean;
	readonly terminologyMapped: boolean;
	readonly authorized: boolean;
	readonly serviceAvailable: boolean;
}

export interface ScenarioDescription {
	readonly id: ScenarioId;
	readonly title: string;
	readonly description: string;
	readonly recovery: keyof Settings | null;
}

export interface ComponentDescription {
	readonly id: ComponentId;
	readonly title: string;
	readonly plain: string;
	readonly role: string;
	readonly limits: string;
	readonly metaphor: string;
}

export interface ClinicalEvent {
	readonly id: string;
	readonly kind: 'encounter' | 'lab-result';
	readonly title: string;
	readonly source: 'clinic' | 'lab';
	/** Authored time of the synthetic care or observation event. */
	readonly occurredAt: string;
	/** Authored time when the source system recorded that event. */
	readonly recordedAt: string;
	/** Authored teaching timestamp of a committed shared copy; null in local originals. */
	readonly exchangedAt: string | null;
	readonly patientLocalId: string;
	readonly patientExchangeId: string | null;
	readonly code: Readonly<{ system: string; code: string; display: string }>;
	readonly provenance: Readonly<{
		sourceRecordId: string;
		facilityId: string;
		workerId: string;
		originalCode: string;
		mapping: string | null;
	}>;
	readonly value: string | null;
}

export type SnapshotStatus =
	| 'ready'
	| 'working'
	| 'success'
	| 'blocked'
	| 'denied'
	| 'unavailable'
	| 'duplicate';
export type TransactionStatus =
	| 'not-sent'
	| 'sent'
	| 'accepted'
	| 'rejected'
	| 'persisted'
	| 'returned'
	| 'timeout'
	| 'deduplicated';

export interface IdentityState {
	readonly state: 'unresolved' | 'linked' | 'review';
	readonly clinicLocalId: string;
	readonly hospitalLocalId: string;
	readonly exchangeId: string | null;
}

export interface ExchangeEvent {
	readonly id: string;
	readonly requestId: string;
	readonly from: ComponentId;
	readonly to: ComponentId;
	readonly direction: 'request' | 'response';
	readonly status: TransactionStatus;
	readonly summary: string;
	readonly payload: Readonly<Record<string, unknown>> | null;
}

export interface Snapshot {
	readonly step: number;
	readonly chapter: 0 | 1 | 2 | 3;
	readonly activeComponent: ComponentId;
	readonly title: string;
	readonly explanation: string;
	readonly why: string;
	readonly changed: string;
	readonly nextAction: string;
	readonly patient: string;
	readonly clinician: string;
	readonly architect: string;
	readonly status: SnapshotStatus;
	readonly transactionStatus: TransactionStatus;
	readonly localEvents: readonly ClinicalEvent[];
	readonly sharedEvents: readonly ClinicalEvent[];
	/** Clinical data delivered to Hospital B by an authorized query only. */
	readonly returnedEvents: readonly ClinicalEvent[];
	readonly identity: IdentityState;
	readonly persistedCount: number;
	readonly duplicateCount: number;
	/** Current transaction payload; a denied query always has a null payload. */
	readonly payload: Readonly<Record<string, unknown>> | null;
	readonly trace: readonly ExchangeEvent[];
}

export interface Run {
	readonly id: string;
	readonly scenario: ScenarioId;
	readonly settings: Settings;
	readonly events: readonly ExchangeEvent[];
	readonly snapshots: readonly Snapshot[];
	readonly assumptions: readonly string[];
}
