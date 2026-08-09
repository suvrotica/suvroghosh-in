import {
	FHIR_BASELINE_EXPECTED,
	MILESTONE_DEFINITIONS,
	PORTAL_FAX_BASELINE_EXPECTED
} from './scenario-schema.ts';
import type { ComparisonRun, CompiledRun, SimulationEvent } from './types.ts';

export function deepFreeze<T>(value: T): Readonly<T> {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value as Readonly<T>;
}

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`Prior-authorization invariant failed: ${message}`);
}

function eventSortsBefore(left: SimulationEvent, right: SimulationEvent): boolean {
	if (left.wallStartMs !== right.wallStartMs) return left.wallStartMs < right.wallStartMs;
	return left.sequence < right.sequence;
}

export function assertCompiledRun(run: CompiledRun): void {
	invariant(run.milestones.length === 12, 'the public machine must contain exactly 12 states');
	invariant(
		run.milestones.every((milestone, index) => milestone.id === MILESTONE_DEFINITIONS[index]?.id),
		'the public milestone order must remain canonical'
	);
	invariant(run.events.length > 0, 'a compiled run must contain events');
	invariant(run.wallTimeSegments.length > 0, 'a compiled run must explain wall time');

	for (const [index, event] of run.events.entries()) {
		invariant(event.sequence === index + 1, `event ${event.id} has an unstable sequence`);
		invariant(Number.isInteger(event.wallStartMs), `event ${event.id} start is not integer ms`);
		invariant(Number.isInteger(event.wallEndMs), `event ${event.id} end is not integer ms`);
		invariant(
			Number.isInteger(event.staffEffortSeconds),
			`event ${event.id} effort is not integer seconds`
		);
		invariant(
			Number.isInteger(event.machineProcessingMs),
			`event ${event.id} processing is not integer ms`
		);
		invariant(event.wallStartMs >= 0, `event ${event.id} starts before Day 0`);
		invariant(event.wallEndMs >= event.wallStartMs, `event ${event.id} has negative wall duration`);
		invariant(event.staffEffortSeconds >= 0, `event ${event.id} has negative human work`);
		invariant(event.machineProcessingMs >= 0, `event ${event.id} has negative machine work`);
		if (index > 0) {
			invariant(
				eventSortsBefore(run.events[index - 1]!, event),
				`event ${event.id} is not stably ordered by modeled time and sequence`
			);
		}
	}

	let wallCursor = 0;
	for (const segment of run.wallTimeSegments) {
		invariant(
			Number.isInteger(segment.wallStartMs),
			`wall segment ${segment.id} start is not integer ms`
		);
		invariant(
			Number.isInteger(segment.wallEndMs),
			`wall segment ${segment.id} end is not integer ms`
		);
		invariant(segment.durationMs >= 0, `wall segment ${segment.id} has negative duration`);
		invariant(
			segment.wallStartMs === wallCursor,
			`wall segment ${segment.id} leaves a gap or overlap`
		);
		invariant(
			segment.wallEndMs - segment.wallStartMs === segment.durationMs,
			`wall segment ${segment.id} duration does not match its boundaries`
		);
		wallCursor = segment.wallEndMs;
	}
	invariant(
		wallCursor === run.clocks.patientElapsedMs,
		'wall-time segments must cover the complete patient elapsed span exactly'
	);

	const humanTotal = run.events.reduce((sum, event) => sum + event.staffEffortSeconds, 0);
	const machineTotal = run.events.reduce((sum, event) => sum + event.machineProcessingMs, 0);
	const patientTotal = Math.max(...run.events.map((event) => event.wallEndMs));
	invariant(
		humanTotal === run.clocks.activeHumanWorkSeconds,
		'human-work clock must sum event work'
	);
	invariant(
		machineTotal === run.clocks.automatedProcessingMs,
		'machine clock must sum event processing'
	);
	invariant(
		patientTotal === run.clocks.patientElapsedMs,
		'patient clock must equal the ledger wall end'
	);
	invariant(
		run.clockSnapshots.every(
			(snapshot, index) =>
				index === 0 ||
				(snapshot.clocks.patientElapsedMs >=
					run.clockSnapshots[index - 1]!.clocks.patientElapsedMs &&
					snapshot.clocks.activeHumanWorkSeconds >=
						run.clockSnapshots[index - 1]!.clocks.activeHumanWorkSeconds &&
					snapshot.clocks.automatedProcessingMs >=
						run.clockSnapshots[index - 1]!.clocks.automatedProcessingMs)
		),
		'all three clocks must be monotonic'
	);

	const attempts = run.events.map((event) => event.attempt);
	invariant(
		Math.max(...attempts) <= 2,
		'version 1 permits at most one additional-information cycle'
	);
	const completedSchedule = run.events.find(
		(event) => event.milestone === 'scheduled-and-scan-received' && event.status === 'completed'
	);
	if (completedSchedule) {
		const priorApproval = run.events.find(
			(event) =>
				event.milestone === 'decision-issued' && event.statuses.authorization === 'approved'
		);
		invariant(Boolean(priorApproval), 'a completed authorized scan requires a prior approval');
		invariant(
			priorApproval!.wallEndMs <= completedSchedule.wallStartMs,
			'scheduling as authorized cannot begin before approval'
		);
	}
	if (run.finalOutcome === 'expired') {
		invariant(
			run.statuses.authorization === 'expired',
			'expiry must invalidate authorization state'
		);
		invariant(
			!run.events.some(
				(event) => event.milestone === 'scheduled-and-scan-received' && event.status === 'completed'
			),
			'an expired run cannot report a completed scan'
		);
	}
	if (run.finalOutcome === 'denied') {
		invariant(
			run.statuses.technical === 'accepted',
			'business denial follows technical acceptance here'
		);
		invariant(run.statuses.business === 'denied', 'denied outcome requires denied business state');
		invariant(
			run.statuses.authorization === 'denied',
			'denied outcome requires denied authorization'
		);
		invariant(
			run.events.some(
				(event) =>
					event.milestone === 'more-information-requested' && event.status === 'needs-information'
			),
			'the clinical-insufficiency path must visibly pend for more information'
		);
		invariant(
			run.events.some((event) => event.milestone === 'request-supplemented' && event.attempt === 2),
			'the clinical-insufficiency path must contain one supplement/resubmission'
		);
	}
	invariant(
		run.finalOutcome === run.failure.expectedOutcome,
		`failure ${run.failure.id} did not reach its declared outcome`
	);

	if (run.input.pathway === 'fhir-enabled' && run.input.failureId === 'none') {
		invariant(
			run.clocks.patientElapsedMs === FHIR_BASELINE_EXPECTED.patientElapsedMs,
			'FHIR baseline must be exactly 11 modeled days'
		);
		invariant(
			run.clocks.patientElapsedMinutes === FHIR_BASELINE_EXPECTED.patientElapsedMinutes,
			'FHIR baseline must be exactly 15,840 modeled minutes'
		);
		invariant(
			run.clocks.activeHumanWorkSeconds === FHIR_BASELINE_EXPECTED.activeHumanWorkSeconds,
			'FHIR baseline human-work total drifted'
		);
		invariant(
			run.clocks.automatedProcessingMs === FHIR_BASELINE_EXPECTED.automatedProcessingMs,
			'FHIR baseline machine-processing total drifted'
		);
		const declaredTransaction = run.events.find(
			(event) => event.id === FHIR_BASELINE_EXPECTED.declaredTransactionEventId
		);
		invariant(Boolean(declaredTransaction), 'declared 400 ms FHIR transaction is missing');
		invariant(
			declaredTransaction!.machineProcessingMs === FHIR_BASELINE_EXPECTED.declaredTransactionMs,
			'declared FHIR transaction must be exactly 400 ms'
		);
	}
	if (run.input.pathway === 'portal-fax' && run.input.failureId === 'none') {
		invariant(
			run.clocks.patientElapsedMs === PORTAL_FAX_BASELINE_EXPECTED.patientElapsedMs,
			'portal/fax baseline elapsed total drifted'
		);
		invariant(
			run.clocks.activeHumanWorkSeconds === PORTAL_FAX_BASELINE_EXPECTED.activeHumanWorkSeconds,
			'portal/fax baseline human-work total drifted'
		);
		invariant(
			run.clocks.automatedProcessingMs === PORTAL_FAX_BASELINE_EXPECTED.automatedProcessingMs,
			'portal/fax baseline machine-processing total drifted'
		);
	}
}

export function assertComparisonRun(comparison: ComparisonRun): void {
	invariant(
		comparison.portalFax.case === comparison.fhirEnabled.case,
		'counterfactual pathways must share the same immutable case object'
	);
	invariant(
		comparison.portalFax.policy === comparison.fhirEnabled.policy,
		'counterfactual pathways must share the same immutable policy object'
	);
	invariant(Object.isFrozen(comparison.portalFax.case), 'the shared case must be immutable');
	invariant(Object.isFrozen(comparison.portalFax.policy), 'the shared policy must be immutable');
	invariant(
		comparison.portalFax.case.imagingCapacity === comparison.fhirEnabled.case.imagingCapacity,
		'counterfactual pathways must share the appointment-capacity assumptions'
	);
}
