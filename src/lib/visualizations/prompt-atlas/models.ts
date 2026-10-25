import type { ModelFit, ModelId, PromptOntology } from './types';

type CatalogEntry = Pick<ModelFit, 'id' | 'label' | 'family' | 'level' | 'description'>;

/** A closed catalog: abstraction level and notation remain separate axes. */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
	{
		id: 'mindmap',
		label: 'Mind map',
		family: 'Hierarchy',
		level: 'Overview',
		description: 'A branching outline of the request, its subjects, and its constraints.'
	},
	{
		id: 'concept',
		label: 'Concept map',
		family: 'Semantic graph',
		level: 'Conceptual',
		description: 'Labelled relationships, including cross-links, without forcing a tree.'
	},
	{
		id: 'flowchart',
		label: 'Flowchart',
		family: 'Activity',
		level: 'Behaviour',
		description: 'Actions, dependencies, and stated conditions. Dashed links remain inferences.'
	},
	{
		id: 'conceptual-er',
		label: 'Conceptual ER',
		family: 'Data model',
		level: 'Conceptual',
		description: 'Domain entities and their stated relationships or cardinalities.'
	},
	{
		id: 'logical',
		label: 'Logical data model',
		family: 'Data model',
		level: 'Logical',
		description: 'Entities and supported attributes; missing identifiers remain unspecified.'
	},
	{
		id: 'physical',
		label: 'Physical database',
		family: 'Data model',
		level: 'Physical',
		description:
			'Database-specific tables, types, and constraints explicitly supplied in the prompt.'
	},
	{
		id: 'class',
		label: 'UML class',
		family: 'UML structure',
		level: 'Conceptual / design',
		description: 'Classes, attributes, and structural associations supported by the analysis.'
	},
	{
		id: 'sequence',
		label: 'UML sequence',
		family: 'UML behaviour',
		level: 'Interactions',
		description: 'Participants and supported messages in their stated source order.'
	},
	{
		id: 'state',
		label: 'UML state',
		family: 'UML behaviour',
		level: 'State changes',
		description: 'Named states and supported transitions, triggers, and guards.'
	},
	{
		id: 'usecase',
		label: 'UML use case',
		family: 'UML behaviour',
		level: 'System goals',
		description: 'Actors, goals, and a stated system boundary.'
	}
];

export function rankModels(ontology: PromptOntology): ModelFit[] {
	const { nodes, relations } = ontology;
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const subjects = nodes.filter((n) => n.layer === 'subject');
	const subjectIds = new Set(subjects.map((node) => node.id));
	const conceptLinks = relations.filter(
		(relation) => subjectIds.has(relation.from) && subjectIds.has(relation.to)
	);
	const entities = subjects.filter((n) =>
		['actor', 'object', 'concept', 'system', 'table'].includes(n.kind)
	);
	const entityIds = new Set(entities.map((n) => n.id));
	const structural = relations.filter(
		(r) =>
			entityIds.has(r.from) &&
			entityIds.has(r.to) &&
			['association', 'owns', 'inheritance', 'contains'].includes(r.kind)
	);
	const actions = nodes.filter((n) => n.kind === 'action');
	const controls = relations.filter((r) => {
		const from = byId.get(r.from);
		const to = byId.get(r.to);
		return (
			to?.kind === 'action' &&
			((r.kind === 'dependency' && from?.kind === 'action') ||
				(r.kind === 'condition' && (from?.kind === 'action' || from?.kind === 'concept')))
		);
	});
	const participants = new Set(
		subjects
			.filter((node) => ['actor', 'system', 'object', 'table'].includes(node.kind))
			.map((node) => node.id)
	);
	const messages = relations.filter(
		(r) => r.kind === 'message' && participants.has(r.from) && participants.has(r.to)
	);
	const transitions = relations.filter(
		(r) =>
			r.kind === 'transition' &&
			byId.get(r.from)?.kind === 'state' &&
			byId.get(r.to)?.kind === 'state'
	);
	const attributed = entities.filter((n) => n.attributes.length > 0);
	const physical = entities.filter((n) => n.attributes.some((a) => a.dataType?.trim()));
	const systems = subjects.filter((n) => n.kind === 'system');
	const actors = subjects.filter((n) => n.kind === 'actor');
	const goalLinks = relations.filter((r) => {
		const from = byId.get(r.from);
		const to = byId.get(r.to);
		return (
			r.kind === 'association' &&
			from?.kind === 'actor' &&
			to?.kind === 'action' &&
			relations.some(
				(boundary) =>
					boundary.kind === 'contains' &&
					byId.get(boundary.from)?.kind === 'system' &&
					boundary.to === r.to
			)
		);
	});
	const decisions: Record<ModelId, { eligible: boolean; score: number; reason: string }> = {
		mindmap: {
			eligible: nodes.length > 0,
			score: 58,
			reason: nodes.length
				? `Organises ${nodes.length} extracted items by their roles in the prompt.`
				: 'Enter and analyse a prompt to create its branches.'
		},
		concept: {
			eligible: subjects.length > 0,
			score: 48 + Math.min(30, conceptLinks.length * 4),
			reason: subjects.length
				? `Shows ${subjects.length} subject items and ${conceptLinks.length} supported subject connections.`
				: 'Needs at least one extracted subject concept.'
		},
		flowchart: {
			eligible: actions.length > 0 && controls.length > 0,
			score: 72 + Math.min(20, controls.length * 3),
			reason:
				actions.length && controls.length
					? `The analysis has ${actions.length} actions and ${controls.length} dependency or condition links.`
					: 'Needs actions and an ordering or condition; a list of actions alone does not establish a flow.'
		},
		'conceptual-er': {
			eligible: entities.length >= 2 && structural.length > 0,
			score: 74 + Math.min(18, structural.length * 3),
			reason: structural.length
				? `${entities.length} entities have ${structural.length} structural relationships; unspecified cardinalities stay unknown.`
				: 'Needs at least two domain entities and a structural relationship.'
		},
		logical: {
			eligible: attributed.length > 0,
			score: 77 + Math.min(15, attributed.length * 3),
			reason: attributed.length
				? `${attributed.length} entities have attributes. Unspecified keys and normalisation choices remain open.`
				: 'Needs entities with explicitly supplied attributes.'
		},
		physical: {
			eligible: Boolean(ontology.databaseTarget?.trim()) && physical.length > 0,
			score: 96,
			reason:
				ontology.databaseTarget?.trim() && physical.length
					? `The prompt names ${ontology.databaseTarget} and supplies column-level types. Unspecified storage details remain open.`
					: 'Needs a database target and explicit column types. Add details to the prompt and analyse again.'
		},
		class: {
			eligible: entities.length > 0 && (attributed.length > 0 || structural.length > 0),
			score: 73 + Math.min(15, attributed.length * 2 + structural.length * 2),
			reason:
				attributed.length || structural.length
					? 'Entities have supported attributes or structural associations. Methods and inheritance are shown only when stated.'
					: 'Needs class-like entities with attributes or structural associations.'
		},
		sequence: {
			eligible: messages.length > 0,
			score: 89 + Math.min(8, messages.length),
			reason: messages.length
				? `${messages.length} sender-to-recipient messages support an interaction view; vertical order follows the source.`
				: 'Needs explicit messages between named participants.'
		},
		state: {
			eligible: transitions.length > 0,
			score: 94,
			reason: transitions.length
				? `${transitions.length} stated transitions connect named states.`
				: 'Needs named states and explicit transitions or triggers.'
		},
		usecase: {
			eligible: systems.length > 0 && actors.length > 0 && goalLinks.length > 0,
			score: 80,
			reason:
				systems.length && actors.length && goalLinks.length
					? 'Actors have goals explicitly included in a named system boundary.'
					: 'Needs actor-to-goal associations and a named system explicitly containing those goals.'
		}
	};
	const flowIds = new Set([
		...actions.map((node) => node.id),
		...controls.flatMap((relation) => [relation.from, relation.to])
	]);
	const messageIds = new Set(messages.flatMap((relation) => [relation.from, relation.to]));
	const stateIds = new Set(nodes.filter((node) => node.kind === 'state').map((node) => node.id));
	const goalIds = new Set(goalLinks.map((relation) => relation.to));
	const usecaseIds = new Set([
		...actors.map((node) => node.id),
		...systems.map((node) => node.id),
		...goalIds
	]);
	const linksByModel: Record<ModelId, typeof relations> = {
		mindmap: relations,
		concept: conceptLinks,
		flowchart: controls,
		'conceptual-er': structural,
		logical: structural,
		physical: structural,
		class: structural,
		sequence: messages,
		state: transitions,
		usecase: [
			...goalLinks,
			...relations.filter(
				(relation) =>
					relation.kind === 'contains' && usecaseIds.has(relation.from) && goalIds.has(relation.to)
			)
		]
	};
	const idsByModel: Record<ModelId, Set<string>> = {
		mindmap: new Set(nodes.map((node) => node.id)),
		concept: subjectIds,
		flowchart: flowIds,
		'conceptual-er': entityIds,
		logical: entityIds,
		physical: entityIds,
		class: entityIds,
		sequence: messageIds,
		state: stateIds,
		usecase: usecaseIds
	};
	const allAttributes = attributed.flatMap((node) => node.attributes);
	const missingIdentifiers = attributed.length
		? attributed.filter(
				(node) =>
					!node.attributes.some(
						(attribute) =>
							attribute.primaryKey ||
							attribute.unique ||
							/^(?:id|identifier)$/i.test(attribute.name)
					)
			).length / attributed.length
		: 0;
	const missingTypes = allAttributes.length
		? allAttributes.filter((attribute) => !attribute.dataType?.trim()).length / allAttributes.length
		: 0;
	const linkedActionIds = new Set(controls.flatMap((relation) => [relation.from, relation.to]));
	const unlinkedActions = actions.length
		? actions.filter((node) => !linkedActionIds.has(node.id)).length / actions.length
		: 0;
	return MODEL_CATALOG.map((entry) => {
		const fit = decisions[entry.id];
		if (!fit.eligible) return { ...entry, ...fit, score: 0 };
		const relevantNodes = nodes.filter((node) => idsByModel[entry.id].has(node.id));
		const relevantClaims = [
			...relevantNodes,
			...linksByModel[entry.id],
			...(['logical', 'physical', 'class'].includes(entry.id)
				? relevantNodes.flatMap((node) => node.attributes)
				: [])
		];
		const omittedPenalty = nodes.length
			? Math.round((1 - relevantNodes.length / nodes.length) * 12)
			: 0;
		const inferredPenalty = relevantClaims.length
			? Math.round(
					(relevantClaims.filter((claim) => claim.provenance === 'inferred').length /
						relevantClaims.length) *
						24
				)
			: 0;
		const missingPenalty =
			entry.id === 'physical'
				? Math.round(missingTypes * 14 + missingIdentifiers * 8)
				: entry.id === 'logical'
					? Math.round(missingIdentifiers * 12)
					: entry.id === 'flowchart'
						? Math.round(unlinkedActions * 12)
						: 0;
		const penalties = [
			omittedPenalty ? `${omittedPenalty} points for omitted prompt items` : '',
			inferredPenalty ? `${inferredPenalty} points for inferred structure` : '',
			missingPenalty ? `${missingPenalty} points for missing model details` : ''
		].filter(Boolean);
		return {
			...entry,
			...fit,
			score: Math.max(
				1,
				Math.min(100, fit.score - omittedPenalty - inferredPenalty - missingPenalty)
			),
			reason: `${fit.reason}${penalties.length ? ` Fit adjusted: ${penalties.join('; ')}.` : ''}`
		};
	}).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}
