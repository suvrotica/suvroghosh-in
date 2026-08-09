import { MILESTONE_BY_ID, MILESTONE_DEFINITIONS } from './scenario-schema.ts';
import type {
	ClockSeriesPoint,
	Clocks,
	ComparisonRun,
	ComparisonSummary,
	CompiledRun,
	LedgerRow,
	MilestoneId,
	MilestoneState,
	PerspectiveId,
	WallTimeBreakdownItem,
	WallTimeCategory
} from './types.ts';

const WALL_LABELS: Readonly<Record<WallTimeCategory, string>> = Object.freeze({
	'queue-inbox': 'Queue and inbox time',
	'human-dependent-review': 'Human-dependent review window',
	'missing-information-loop': 'Missing-information loop',
	'message-transport': 'Message and transport delay',
	'external-scheduling': 'External scheduling',
	'automated-processing': 'Automated processing window'
});

export function selectClocksAtMilestone(
	run: CompiledRun,
	milestoneOrIndex: MilestoneId | number
): Clocks {
	const index =
		typeof milestoneOrIndex === 'number'
			? Math.max(0, Math.min(run.milestones.length - 1, Math.trunc(milestoneOrIndex)))
			: MILESTONE_BY_ID[milestoneOrIndex].index;
	return run.milestones[index]!.clocks;
}

export function selectClockSeries(run: CompiledRun): readonly ClockSeriesPoint[] {
	return run.milestones.map((milestone) => ({
		milestone: milestone.id,
		milestoneIndex: milestone.index,
		label: milestone.shortLabel,
		patientElapsedMs: milestone.clocks.patientElapsedMs,
		activeHumanWorkSeconds: milestone.clocks.activeHumanWorkSeconds,
		automatedProcessingMs: milestone.clocks.automatedProcessingMs
	}));
}

export function selectWallTimeBreakdown(run: CompiledRun): readonly WallTimeBreakdownItem[] {
	const totals = new Map<WallTimeCategory, number>();
	for (const segment of run.wallTimeSegments) {
		totals.set(segment.category, (totals.get(segment.category) ?? 0) + segment.durationMs);
	}
	return Object.entries(WALL_LABELS)
		.map(([category, label]) => ({
			category: category as WallTimeCategory,
			label,
			durationMs: totals.get(category as WallTimeCategory) ?? 0,
			fraction:
				run.clocks.patientElapsedMs === 0
					? 0
					: (totals.get(category as WallTimeCategory) ?? 0) / run.clocks.patientElapsedMs
		}))
		.filter((item) => item.durationMs > 0);
}

export function selectLedgerRows(
	run: CompiledRun,
	perspective: PerspectiveId = 'patient'
): readonly LedgerRow[] {
	const snapshots = new Map(
		run.clockSnapshots.map((snapshot) => [snapshot.eventId, snapshot.clocks])
	);
	return run.events.map((event) => {
		const clocks = snapshots.get(event.id)!;
		return {
			id: event.id,
			sequence: event.sequence,
			milestone: event.milestone,
			milestoneLabel: MILESTONE_BY_ID[event.milestone].label,
			actor: event.actorId,
			channel: event.channel,
			status: event.status,
			statusLabel: event.status.replaceAll('-', ' '),
			wallStartMs: event.wallStartMs,
			wallEndMs: event.wallEndMs,
			patientElapsedMs: clocks.patientElapsedMs,
			activeHumanWorkSeconds: clocks.activeHumanWorkSeconds,
			automatedProcessingMs: clocks.automatedProcessingMs,
			text:
				perspective === 'patient'
					? event.patientText
					: perspective === 'clinician'
						? event.clinicianText
						: event.architectText,
			technicalStatus: event.statuses.technical,
			businessStatus: event.statuses.business,
			authorizationStatus: event.statuses.authorization,
			standardRefs: event.standardRefs,
			resourceRefs: event.resourceRefs,
			evidenceRefs: event.evidenceRefs,
			...(event.causedByFailureId ? { causedByFailureId: event.causedByFailureId } : {})
		};
	});
}

export function selectMilestoneStates(
	run: CompiledRun,
	activeMilestoneOrIndex?: MilestoneId | number
): readonly MilestoneState[] {
	if (activeMilestoneOrIndex === undefined) return run.milestones;
	const activeIndex =
		typeof activeMilestoneOrIndex === 'number'
			? Math.max(0, Math.min(MILESTONE_DEFINITIONS.length - 1, Math.trunc(activeMilestoneOrIndex)))
			: MILESTONE_BY_ID[activeMilestoneOrIndex].index;
	return run.milestones.map((milestone) => {
		if (milestone.index === activeIndex) return { ...milestone, visitStatus: 'active' };
		if (milestone.index > activeIndex && milestone.visitStatus !== 'bypassed') {
			return { ...milestone, visitStatus: 'upcoming' };
		}
		return milestone;
	});
}

export function selectComparisonSummary(comparison: ComparisonRun): ComparisonSummary {
	const portal = comparison.portalFax.clocks;
	const fhir = comparison.fhirEnabled.clocks;
	return {
		patientElapsedDeltaMs: portal.patientElapsedMs - fhir.patientElapsedMs,
		activeHumanWorkDeltaSeconds: portal.activeHumanWorkSeconds - fhir.activeHumanWorkSeconds,
		automatedProcessingDeltaMs: portal.automatedProcessingMs - fhir.automatedProcessingMs,
		portalFax: portal,
		fhirEnabled: fhir,
		conclusion:
			'The electronic route moved information with less re-keying. It did not change the evidence requirement, the reviewer’s judgment, or the imaging calendar.'
	};
}
