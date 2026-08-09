import { MILESTONE_DEFINITIONS } from '../engine/scenario-schema.ts';
import type { ActorLane, MilestoneId } from '../engine/types.ts';

export type WorkflowNode = Readonly<{
	id: MilestoneId;
	index: number;
	label: string;
	actorLane: ActorLane;
	x: number;
	y: number;
}>;

export type WorkflowEdge = Readonly<{
	id: string;
	from: MilestoneId;
	to: MilestoneId;
	branch: 'primary' | 'optional-more-information' | 'bypass';
	path: string;
}>;

export type WorkflowLayout = Readonly<{
	width: number;
	height: number;
	nodes: readonly WorkflowNode[];
	edges: readonly WorkflowEdge[];
	lanes: readonly Readonly<{ id: ActorLane; label: string; y: number }>[];
}>;

export const WORKFLOW_TRANSITIONS = Object.freeze([
	['mri-ordered', 'coverage-checked', 'primary'],
	['coverage-checked', 'documentation-received', 'primary'],
	['documentation-received', 'evidence-gathered', 'primary'],
	['evidence-gathered', 'human-review-completed', 'primary'],
	['human-review-completed', 'request-submitted', 'primary'],
	['request-submitted', 'request-technically-received', 'primary'],
	['request-technically-received', 'payer-review', 'primary'],
	['payer-review', 'more-information-requested', 'optional-more-information'],
	['more-information-requested', 'request-supplemented', 'optional-more-information'],
	['request-supplemented', 'decision-issued', 'optional-more-information'],
	['payer-review', 'decision-issued', 'bypass'],
	['decision-issued', 'scheduled-and-scan-received', 'primary']
] as const satisfies readonly (readonly [MilestoneId, MilestoneId, WorkflowEdge['branch']])[]);

export const OPTIONAL_ARCHITECT_BRANCH = Object.freeze({
	id: 'optional-x12-intermediary',
	label: 'Optional FHIR + X12 intermediary branch',
	from: 'request-submitted' as MilestoneId,
	to: 'request-technically-received' as MilestoneId,
	description:
		'Shown only in Architect view. Enforcement discretion permits the modeled all-FHIR path; X12 is neither erased nor compulsory in every implementation.'
});

const LANE_LABELS: Readonly<Record<ActorLane, string>> = Object.freeze({
	'patient-clinician': 'Patient and clinician',
	'ehr-workflow': 'EHR and workflow application',
	'payer-intermediary': 'Payer and intermediary',
	'imaging-scheduling': 'Imaging and scheduling'
});

const LANE_IDS = Object.keys(LANE_LABELS) as ActorLane[];

function bezierPath(from: WorkflowNode, to: WorkflowNode): string {
	const controlX = (from.x + to.x) / 2;
	return `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${to.x} ${to.y}`;
}

export function createWorkflowLayout(width = 1_080, height = 520): WorkflowLayout {
	const safeWidth = Math.max(640, Math.round(width));
	const safeHeight = Math.max(420, Math.round(height));
	const marginX = Math.max(54, safeWidth * 0.06);
	const marginY = Math.max(54, safeHeight * 0.12);
	const laneStep = (safeHeight - 2 * marginY) / (LANE_IDS.length - 1);
	const laneY = Object.fromEntries(
		LANE_IDS.map((lane, index) => [lane, marginY + index * laneStep])
	) as Record<ActorLane, number>;
	const columnStep = (safeWidth - 2 * marginX) / (MILESTONE_DEFINITIONS.length - 1);
	const nodes = MILESTONE_DEFINITIONS.map((definition) => ({
		id: definition.id,
		index: definition.index,
		label: definition.shortLabel,
		actorLane: definition.actorLane,
		x: marginX + definition.index * columnStep,
		y: laneY[definition.actorLane]
	}));
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const edges = WORKFLOW_TRANSITIONS.map(([from, to, branch]) => ({
		id: `${from}--${to}`,
		from,
		to,
		branch,
		path: bezierPath(nodeById.get(from)!, nodeById.get(to)!)
	}));
	return {
		width: safeWidth,
		height: safeHeight,
		nodes,
		edges,
		lanes: LANE_IDS.map((id) => ({ id, label: LANE_LABELS[id], y: laneY[id] }))
	};
}
