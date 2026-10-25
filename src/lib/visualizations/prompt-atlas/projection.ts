import { rankModels, MODEL_CATALOG } from './models';
import type {
	Diagram,
	DiagramEdge,
	DiagramNode,
	ModelId,
	OntologyNode,
	OntologyRelation,
	PromptOntology
} from './types';

const PADDING = 52;
const NODE_WIDTH = 200;

export function wrapLabel(label: string, maxLength = 25): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of label.split(/\s+/)) {
		const chunks =
			word.length > maxLength ? (word.match(new RegExp(`.{1,${maxLength}}`, 'gu')) ?? []) : [word];
		for (const chunk of chunks) {
			if (line && line.length + chunk.length + 1 > maxLength) {
				lines.push(line);
				line = '';
			}
			line += `${line ? ' ' : ''}${chunk}`;
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

function node(
	source: OntologyNode,
	x: number,
	y: number,
	shape: DiagramNode['shape'] = 'box',
	lines?: string[]
): DiagramNode {
	return {
		id: source.id,
		sourceId: source.id,
		label: source.label,
		kind: source.kind,
		x,
		y,
		width: NODE_WIDTH,
		height: Math.max(
			shape === 'actor' ? 116 + (wrapLabel(source.label).length - 1) * 17 : 70,
			30 + wrapLabel(source.label).length * 17 + (lines?.length ?? 0) * 18
		),
		shape,
		lines,
		provenance: source.provenance
	};
}

function connection(relation: OntologyRelation, nodes: DiagramNode[]): DiagramEdge | undefined {
	const from = nodes.find((n) => n.id === relation.from);
	const to = nodes.find((n) => n.id === relation.to);
	if (!from || !to) return;
	let points: DiagramEdge['points'];
	if (from.id === to.id) {
		points = [
			{ x: from.x + from.width, y: from.y + 20 },
			{ x: from.x + from.width + 45, y: from.y + 20 },
			{ x: from.x + from.width + 45, y: from.y + from.height - 15 },
			{ x: from.x + from.width, y: from.y + from.height - 15 }
		];
	} else if (Math.abs(from.x - to.x) > 40) {
		const forwards = to.x >= from.x;
		points = [
			{ x: from.x + (forwards ? from.width : 0), y: from.y + from.height / 2 },
			{ x: to.x + (forwards ? 0 : to.width), y: to.y + to.height / 2 }
		];
	} else {
		const down = to.y >= from.y;
		points = [
			{ x: from.x + from.width / 2, y: from.y + (down ? from.height : 0) },
			{ x: to.x + to.width / 2, y: to.y + (down ? 0 : to.height) }
		];
	}
	return {
		id: relation.id,
		sourceId: relation.id,
		from: relation.from,
		to: relation.to,
		label: `${relation.label}${relation.guard && !relation.label.toLowerCase().includes(relation.guard.toLowerCase()) ? ` [${relation.guard}]` : ''}${relation.cardinality ? ` · ${relation.cardinality}` : ''}`,
		points,
		provenance: relation.provenance
	};
}

function finish(
	model: ModelId,
	nodes: DiagramNode[],
	edges: DiagramEdge[],
	notes: string[] = []
): Diagram {
	const edgePoints = edges.flatMap((edge) => edge.points);
	return {
		model,
		title: MODEL_CATALOG.find((entry) => entry.id === model)?.label ?? model,
		nodes,
		edges,
		notes,
		width: Math.max(
			720,
			...nodes.map((n) => n.x + n.width + PADDING),
			...edgePoints.map((point) => point.x + PADDING)
		),
		height: Math.max(
			360,
			...nodes.map((n) => n.y + n.height + PADDING),
			...edgePoints.map((point) => point.y + PADDING)
		)
	};
}

function mindmap(ontology: PromptOntology, collapsed: Set<string>): Diagram {
	const root: DiagramNode = {
		id: 'atlas-root',
		label: 'Your prompt',
		x: PADDING,
		y: PADDING,
		width: 170,
		height: 70,
		shape: 'rounded',
		kind: 'root',
		provenance: 'explicit'
	};
	const nodes: DiagramNode[] = [root];
	const edges: DiagramEdge[] = [];
	const order = [
		'task',
		'audience',
		'output',
		'constraint',
		'example',
		'actor',
		'system',
		'object',
		'concept',
		'table',
		'action',
		'state'
	];
	let y = PADDING;
	for (const kind of order) {
		const members = ontology.nodes.filter((n) => n.kind === kind);
		if (!members.length) continue;
		const branchId = `group:${kind}`;
		const branchY = y;
		const branch: DiagramNode = {
			id: branchId,
			label: `${collapsed.has(branchId) ? '+' : '−'} ${kind[0].toUpperCase()}${kind.slice(1)}${kind.endsWith('s') ? '' : 's'} (${members.length})`,
			x: 290,
			y: branchY,
			width: 170,
			height: 60,
			shape: 'rounded',
			kind: collapsed.has(branchId) ? 'branch-collapsed' : 'branch',
			provenance: 'inferred'
		};
		nodes.push(branch);
		edges.push({
			id: `root:${branchId}`,
			from: root.id,
			to: branchId,
			label: '',
			provenance: 'inferred',
			points: [
				{ x: root.x + root.width, y: root.y + root.height / 2 },
				{ x: branch.x, y: branch.y + branch.height / 2 }
			]
		});
		if (!collapsed.has(branchId)) {
			for (const member of members) {
				const child = node(member, 540, y, 'rounded');
				nodes.push(child);
				edges.push({
					id: `${branchId}:${member.id}`,
					from: branchId,
					to: member.id,
					label: '',
					provenance: member.provenance,
					points: [
						{ x: branch.x + branch.width, y: branch.y + branch.height / 2 },
						{ x: child.x, y: child.y + child.height / 2 }
					]
				});
				y += child.height + 20;
			}
		} else {
			y += 70;
		}
		y = Math.max(y, branchY + 90) + 20;
	}
	root.y = Math.max(PADDING, (y - root.height) / 2);
	for (const edge of edges.filter((e) => e.from === root.id))
		edge.points[0].y = root.y + root.height / 2;
	return finish('mindmap', nodes, edges, [
		'Branches organise the extracted roles. Cross-links remain available in the concept map and relationship inspector.',
		'Select a branch to collapse or expand it.'
	]);
}

function entityModel(ontology: PromptOntology, model: ModelId): Diagram {
	const sourceNodes = ontology.nodes.filter(
		(n) =>
			n.layer === 'subject' && ['actor', 'object', 'concept', 'system', 'table'].includes(n.kind)
	);
	const nodes: DiagramNode[] = [];
	let rowY = PADDING;
	for (let start = 0; start < sourceNodes.length; start += 3) {
		const row = sourceNodes.slice(start, start + 3).map((source, column) => {
			const lines =
				model === 'conceptual-er'
					? undefined
					: source.attributes.flatMap((attribute) => {
							const detail =
								model === 'physical' ? (attribute.dataType ?? 'type unspecified') : attribute.value;
							const flags = [
								attribute.primaryKey ? 'PK' : '',
								attribute.unique ? 'UNIQUE' : '',
								attribute.foreignKey ? `FK → ${attribute.foreignKey}` : ''
							]
								.filter(Boolean)
								.join(', ');
							return wrapLabel(
								`${attribute.name}${detail ? `: ${detail}` : ''}${flags ? ` [${flags}]` : ''}${attribute.provenance === 'inferred' ? ' [inferred]' : attribute.provenance === 'user-confirmed' ? ' [confirmed]' : ''}`,
								24
							);
						});
			return node(
				source,
				PADDING + column * 305,
				rowY,
				model === 'class' ? 'class' : model === 'conceptual-er' ? 'box' : 'table',
				lines
			);
		});
		nodes.push(...row);
		rowY += Math.max(100, ...row.map((n) => n.height)) + 95;
	}
	const edges = ontology.relations
		.filter((r) => ['association', 'owns', 'inheritance', 'contains'].includes(r.kind))
		.flatMap((r) => connection(r, nodes) ?? []);
	if (model === 'physical' || model === 'logical') {
		for (const source of sourceNodes)
			for (const attribute of source.attributes) {
				if (!attribute.foreignKey) continue;
				const targetName = attribute.foreignKey.split('.')[0].replace(/["`]/g, '').toLowerCase();
				const target = sourceNodes.find(
					(candidate) => candidate.label.replace(/["`]/g, '').toLowerCase() === targetName
				);
				if (!target) continue;
				const label = `${attribute.name} → ${attribute.foreignKey}`;
				// New analyses retain FKs as canonical ontology relationships. Keep
				// this fallback for older sessions and user-added column details only.
				if (
					ontology.relations.some(
						(relation) =>
							relation.from === source.id &&
							relation.to === target.id &&
							relation.kind === 'association' &&
							relation.label === label
					)
				)
					continue;
				const edge = connection(
					{
						id: `fk:${source.id}:${attribute.name}`,
						from: source.id,
						to: target.id,
						label,
						kind: 'association',
						provenance: attribute.provenance,
						evidence: attribute.evidence
					},
					nodes
				);
				if (edge) edges.push({ ...edge, sourceId: source.id });
			}
	}
	const notes = [
		model === 'conceptual-er'
			? 'Cardinalities appear only where supplied. An absent minimum or maximum remains unspecified.'
			: 'Only supported attributes and constraints are shown. Keys, types, methods, and inheritance are never filled in to complete the drawing.'
	];
	if (model === 'physical')
		notes.unshift(
			`Database target: ${ontology.databaseTarget ?? 'unspecified'}. This is a diagram; no SQL is executed.`
		);
	if (model === 'logical')
		notes.push(
			'This partial logical view preserves stated structure. It does not assert that the schema is normalised.'
		);
	return finish(model, nodes, edges, notes);
}

/** Grouping frames are layout aids; only original ontology relationships become edges. */
function knowledgeGraph(ontology: PromptOntology): Diagram {
	const groupOrder = [
		'task',
		'audience',
		'output',
		'constraint',
		'example',
		'actor',
		'system',
		'object',
		'concept',
		'table',
		'action',
		'state'
	];
	const groups = new Map<string, OntologyNode[]>();
	for (const item of ontology.nodes) {
		const key = `${item.layer}:${item.kind}`;
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	const ordered = [...groups.entries()].sort(([left], [right]) => {
		const [leftLayer, leftKind] = left.split(':');
		const [rightLayer, rightKind] = right.split(':');
		return (
			Number(leftLayer === 'subject') - Number(rightLayer === 'subject') ||
			groupOrder.indexOf(leftKind) - groupOrder.indexOf(rightKind)
		);
	});
	const projected: DiagramNode[] = [];
	let y = PADDING;
	for (let offset = 0; offset < ordered.length; offset += 3) {
		let rowHeight = 0;
		for (const [column, [key, members]] of ordered.slice(offset, offset + 3).entries()) {
			const [layer, kind] = key.split(':');
			const x = PADDING + column * 310;
			let memberY = y + 55;
			const items = members.map((member) => {
				const item = node(member, x + 25, memberY, 'rounded');
				memberY += item.height + 22;
				return item;
			});
			const height = memberY - y + 4;
			projected.push(
				{
					id: `kg-group:${layer}:${kind}`,
					label: `${layer === 'instruction' ? 'Prompt' : 'Subject'} / ${kind} · ${members.length}`,
					x,
					y,
					width: 250,
					height,
					shape: 'box',
					kind: 'boundary',
					provenance: 'inferred'
				},
				...items
			);
			rowHeight = Math.max(rowHeight, height);
		}
		y += rowHeight + 90;
	}
	const pairs = new Map<string, OntologyRelation[]>();
	for (const relation of ontology.relations) {
		const key = [relation.from, relation.to].sort().join(':');
		pairs.set(key, [...(pairs.get(key) ?? []), relation]);
	}
	const edges = ontology.relations.flatMap((relation) => {
		const edge = connection(relation, projected);
		if (!edge) return [];
		const parallel = pairs.get([relation.from, relation.to].sort().join(':'))!;
		if (parallel.length < 2) return [edge];
		const from = projected.find((item) => item.id === relation.from)!;
		const to = projected.find((item) => item.id === relation.to)!;
		const index = parallel.findIndex((item) => item.id === relation.id);
		const right = index % 2 === 0;
		const distance = 65 + Math.floor(index / 2) * 30;
		if (from.id !== to.id && Math.abs(from.x - to.x) >= Math.abs(from.y - to.y)) {
			const channelY = right
				? Math.max(from.y + from.height, to.y + to.height) + distance
				: Math.min(from.y, to.y) - distance;
			edge.points = [
				{ x: from.x + from.width / 2, y: from.y + (right ? from.height : 0) },
				{ x: (from.x + from.width / 2 + to.x + to.width / 2) / 2, y: channelY },
				{ x: to.x + to.width / 2, y: to.y + (right ? to.height : 0) }
			];
			return [edge];
		}
		const channelX = right
			? Math.max(from.x + from.width, to.x + to.width) + distance
			: Math.min(from.x, to.x) - distance;
		const fromY = from.y + (from.id === to.id ? 20 : from.height / 2);
		const toY = to.y + (from.id === to.id ? to.height - 15 : to.height / 2);
		edge.points = [
			{ x: from.x + (right ? from.width : 0), y: fromY },
			{ x: channelX, y: (fromY + toY) / 2 },
			{ x: to.x + (right ? to.width : 0), y: toY }
		];
		return [edge];
	});
	// Keep both side channels and their wrapped labels inside the canvas, and
	// centre compact graphs instead of pinning a single group to the left.
	const labelBounds = edges.map((edge) => {
		const first = edge.points[0];
		const last = edge.points[edge.points.length - 1];
		const x = edge.points.length > 2 ? edge.points[1].x : (first.x + last.x) / 2;
		const labelY = edge.points.length > 2 ? edge.points[1].y - 9 : (first.y + last.y) / 2 - 10;
		const lines = wrapLabel(edge.label, 38);
		const halfWidth = Math.max(0, ...lines.map((line) => line.length)) * 4;
		return {
			left: x - halfWidth,
			right: x + halfWidth,
			top: labelY - 12,
			bottom: labelY + (lines.length - 1) * 15 + 5
		};
	});
	const minX = Math.min(
		...projected.map((item) => item.x),
		...edges.flatMap((edge) => edge.points.map((point) => point.x)),
		...labelBounds.map((bound) => bound.left)
	);
	const maxX = Math.max(
		...projected.map((item) => item.x + item.width),
		...edges.flatMap((edge) => edge.points.map((point) => point.x)),
		...labelBounds.map((bound) => bound.right)
	);
	const width = Math.max(720, maxX - minX + PADDING * 2);
	const shift = (width - (maxX - minX)) / 2 - minX;
	const minY = Math.min(
		...projected.map((item) => item.y),
		...edges.flatMap((edge) => edge.points.map((point) => point.y)),
		...labelBounds.map((bound) => bound.top)
	);
	const maxY = Math.max(
		...projected.map((item) => item.y + item.height),
		...edges.flatMap((edge) => edge.points.map((point) => point.y)),
		...labelBounds.map((bound) => bound.bottom)
	);
	const height = Math.max(360, maxY - minY + PADDING * 2);
	const shiftY = (height - (maxY - minY)) / 2 - minY;
	for (const item of projected) {
		item.x += shift;
		item.y += shiftY;
	}
	for (const edge of edges)
		for (const point of edge.points) {
			point.x += shift;
			point.y += shiftY;
		}
	const result = finish('knowledge-graph', projected, edges, [
		'Every ontology item and relationship is retained, including cross-links, cycles and links between prompt instructions and subject matter.',
		'Frames group item types for reading. Frames do not assert additional semantic relationships.',
		'Use the evidence inspector to review each labelled relation; inferred connections remain visually distinct.'
	]);
	result.width = Math.max(result.width, width);
	result.height = Math.max(result.height, height);
	return result;
}

function sequence(ontology: PromptOntology): Diagram {
	const messages = ontology.relations
		.filter((r) => r.kind === 'message')
		.sort((a, b) => (a.evidence[0]?.start ?? 0) - (b.evidence[0]?.start ?? 0));
	const participantIds = new Set(messages.flatMap((r) => [r.from, r.to]));
	const nodes = ontology.nodes
		.filter((n) => participantIds.has(n.id))
		.map((source, index) => ({
			...node(source, PADDING + index * 290, PADDING, 'box'),
			kind: 'participant'
		}));
	const edges = messages.flatMap((message, index): DiagramEdge[] => {
		const from = nodes.find((n) => n.id === message.from);
		const to = nodes.find((n) => n.id === message.to);
		if (!from || !to) return [];
		const x = from.x + from.width / 2;
		const tx = to.x + to.width / 2;
		const y = 180 + index * 90;
		return [
			{
				id: message.id,
				sourceId: message.id,
				from: message.from,
				to: message.to,
				label: `${index + 1}. ${message.label}${message.guard ? ` [${message.guard}]` : ''}`,
				provenance: message.provenance,
				points:
					from.id === to.id
						? [
								{ x, y },
								{ x: x + 65, y },
								{ x: x + 65, y: y + 35 },
								{ x, y: y + 35 }
							]
						: [
								{ x, y },
								{ x: tx, y }
							]
			}
		];
	});
	const result = finish('sequence', nodes, edges, [
		'Messages are ordered by their source passages. This is not a measured timing diagram.'
	]);
	result.height = Math.max(result.height, 250 + messages.length * 90);
	return result;
}

function flowchart(ontology: PromptOntology): Diagram {
	const actions = ontology.nodes.filter((n) => n.kind === 'action');
	const actionIds = new Set(actions.map((n) => n.id));
	const controls = ontology.relations.filter((r) => ['dependency', 'condition'].includes(r.kind));
	const conditionIds = new Set(
		controls.filter((r) => !actionIds.has(r.from) && actionIds.has(r.to)).map((r) => r.from)
	);
	const sources = ontology.nodes.filter((n) => actionIds.has(n.id) || conditionIds.has(n.id));
	const sourceIds = new Set(sources.map((n) => n.id));
	const links = controls
		.filter((r) => sourceIds.has(r.from) && sourceIds.has(r.to))
		.map((r) => {
			if (r.kind !== 'condition' || !actionIds.has(r.from)) return r;
			const guardLink = controls.find(
				(candidate) =>
					candidate.to === r.to && conditionIds.has(candidate.from) && candidate.guard === r.guard
			);
			return guardLink ? { ...r, to: guardLink.from, label: '', guard: undefined } : r;
		});
	const ranks = new Map<string, number>();
	const indegrees = new Map(sources.map((n) => [n.id, links.filter((r) => r.to === n.id).length]));
	const queue = sources.filter((n) => indegrees.get(n.id) === 0).map((n) => n.id);
	for (const id of queue) ranks.set(id, 0);
	for (let index = 0; index < queue.length; index++) {
		const id = queue[index];
		for (const edge of links.filter((r) => r.from === id)) {
			ranks.set(edge.to, Math.max(ranks.get(edge.to) ?? 0, (ranks.get(id) ?? 0) + 1));
			indegrees.set(edge.to, (indegrees.get(edge.to) ?? 0) - 1);
			if (indegrees.get(edge.to) === 0) queue.push(edge.to);
		}
	}
	const cycleNodes = sources.filter((n) => !queue.includes(n.id));
	const lastRank = Math.max(0, ...ranks.values()) + 1;
	cycleNodes.forEach((n, index) => ranks.set(n.id, lastRank + index));
	const rows = new Map<number, OntologyNode[]>();
	for (const source of sources) {
		const rank = ranks.get(source.id) ?? 0;
		rows.set(rank, [...(rows.get(rank) ?? []), source]);
	}
	let y = PADDING;
	const nodes: DiagramNode[] = [];
	for (const [, row] of [...rows.entries()].sort(([a], [b]) => a - b)) {
		const rowNodes = row.map((source, column) => {
			const item = node(
				source,
				PADDING + (row.length === 1 ? 180 : column * 330),
				y,
				conditionIds.has(source.id) ? 'diamond' : 'box'
			);
			if (conditionIds.has(source.id)) {
				item.width = 250;
				item.height = Math.max(115, item.height);
				item.x -= 25;
			}
			return item;
		});
		nodes.push(...rowNodes);
		y += Math.max(...rowNodes.map((n) => n.height)) + 100;
	}
	return finish(
		'flowchart',
		nodes,
		links.flatMap((r) => connection(r, nodes) ?? []),
		[
			'Conditions are diamonds. Dashed links remain inferences. Missing branches remain unknown rather than receiving invented outcomes.',
			...(cycleNodes.length
				? [
						'A cycle prevents a single execution ordering; all cyclic actions remain visible with their original links.'
					]
				: [])
		]
	);
}

function usecase(ontology: PromptOntology): Diagram {
	const system = ontology.nodes.find((n) => n.kind === 'system');
	const actors = ontology.nodes.filter((n) => n.kind === 'actor');
	const links = ontology.relations.filter(
		(r) =>
			actors.some((n) => n.id === r.from) &&
			ontology.nodes.some((n) => n.id === r.to && n.kind === 'action')
	);
	const goalIds = new Set(links.map((r) => r.to));
	const goals = ontology.nodes.filter((n) => goalIds.has(n.id));
	const nodes = [
		...actors.map((n, i) => node(n, PADDING, 110 + i * 150, 'actor')),
		...goals.map((n, i) => node(n, 400, 120 + i * 130, 'ellipse'))
	];
	const boundary: DiagramNode = {
		id: 'system-boundary',
		sourceId: system?.id,
		label: system?.label ?? 'System boundary unspecified',
		x: 330,
		y: PADDING,
		width: 340,
		height: Math.max(220, goals.length * 130 + 75),
		shape: 'box',
		kind: 'boundary',
		provenance: system?.provenance ?? 'inferred'
	};
	nodes.unshift(boundary);
	return finish(
		'usecase',
		nodes,
		links.flatMap((r) => connection(r, nodes) ?? []),
		[
			'Goals are placed within the named system boundary; actor associations are not a sequence of execution.'
		]
	);
}

/** Pure projection: selecting another view never extracts or changes the ontology. */
function project(
	ontology: PromptOntology,
	model: ModelId,
	collapsedIds = new Set<string>()
): Diagram {
	const fit = rankModels(ontology).find((entry) => entry.id === model);
	if (!fit?.eligible) return finish(model, [], [], [fit?.reason ?? 'Unknown model.']);
	if (model === 'mindmap') return mindmap(ontology, collapsedIds);
	if (model === 'knowledge-graph') return knowledgeGraph(ontology);
	if (['conceptual-er', 'logical', 'physical', 'class'].includes(model))
		return entityModel(ontology, model);
	if (model === 'sequence') return sequence(ontology);
	if (model === 'usecase') return usecase(ontology);
	if (model === 'flowchart') return flowchart(ontology);
	const kinds = model === 'state' ? ['state'] : undefined;
	const sources = ontology.nodes.filter((n) =>
		kinds ? kinds.includes(n.kind) : n.layer === 'subject'
	);
	const nodes: DiagramNode[] = [];
	let y = PADDING;
	if (model === 'concept') {
		for (let start = 0; start < sources.length; start += 3) {
			const row = sources
				.slice(start, start + 3)
				.map((source, index) => node(source, PADDING + index * 305, y, 'rounded'));
			nodes.push(...row);
			y += Math.max(70, ...row.map((n) => n.height)) + 100;
		}
	} else {
		for (const source of sources) {
			const projected = node(source, PADDING + 180, y, model === 'state' ? 'rounded' : 'box');
			nodes.push(projected);
			y += projected.height + 110;
		}
	}
	const allowed = model === 'state' ? ['transition'] : undefined;
	const edges = ontology.relations
		.filter((r) => !allowed || allowed.includes(r.kind))
		.flatMap((r) => connection(r, nodes) ?? []);
	return finish(model, nodes, edges, [
		model === 'concept'
			? 'Connections preserve the extracted labels and direction; disconnected items remain visible.'
			: 'Transition labels preserve stated triggers and conditions. Unstated initial and final states remain unspecified.'
	]);
}

/** Every view derives from the same ontology and declares the information it leaves in the inspector. */
export function projectOntology(
	ontology: PromptOntology,
	model: ModelId,
	collapsedIds = new Set<string>()
): Diagram {
	const diagram = project(ontology, model, collapsedIds);
	diagram.analysisMode = ontology.mode;
	if (ontology.analysisMetadata) diagram.analysisMetadata = ontology.analysisMetadata;
	if (ontology.compression) diagram.compression = ontology.compression;
	diagram.ontologySchemaVersion = ontology.schemaVersion;
	diagram.unresolvedIssues = ontology.issues
		.filter((issue) => !issue.resolved)
		.map((issue) => issue.description);
	const displayed = new Set(diagram.nodes.map((n) => n.sourceId));
	const omitted = ontology.nodes.filter((n) => !displayed.has(n.id)).length;
	if (omitted && diagram.nodes.length)
		diagram.notes.push(
			`${omitted} other ontology items remain in the interpretation inspector; this view shows the structure relevant to ${diagram.title.toLowerCase()}.`
		);
	const attributes = ontology.nodes.reduce((sum, n) => sum + n.attributes.length, 0);
	if (attributes && !['logical', 'physical', 'class'].includes(model))
		diagram.notes.push(
			`${attributes} attributes remain available in the inspector and data/class views.`
		);
	return diagram;
}
