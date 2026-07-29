import { topicHeadquartersPath } from '$lib/content/topics';
import { hashStringToSeed } from '$lib/motion/seed';
import type { TopicHeadquartersSummary } from './types';

export const TOPIC_MAP_WIDTH = 960;
export const TOPIC_MAP_MIN_HEIGHT = 620;
export const TOPIC_MAP_MAX_PRINCIPAL_EDGES = 4;

const MAP_COLUMNS = 3;
const MAP_MARGIN_X = 24;
const MAP_MARGIN_Y = 46;
const TERRITORY_GAP_X = 18;
const TERRITORY_GAP_Y = 28;
const TERRITORY_WIDTH = 292;
const BASE_TERRITORY_HEIGHT = 250;
const TOPIC_NODE_FIRST_ROW_Y = 92;
const TOPIC_NODE_ROW_GAP = 68;
const TOPIC_NODE_BOTTOM_MARGIN = 24;

const KNOWN_GROUP_ORDER = [
	'Healthcare and technology',
	'AI and engineering',
	'Mathematics and science',
	'Mind and lived experience',
	'Calcutta and culture',
	'Writing, drawing, and making'
] as const;

const KNOWN_GROUP_INDEX = new Map<string, number>(
	KNOWN_GROUP_ORDER.map((group, index) => [group, index])
);

export type TopicMapImportance = 'major' | 'standard' | 'minor';

export type TopicMapTerritory = {
	id: string;
	label: string;
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	nodeSlugs: readonly string[];
};

export type TopicMapNode = {
	slug: string;
	href: string;
	title: string;
	label: string;
	labelLines: readonly string[];
	description: string;
	groupId: string;
	groupLabel: string;
	resourceCount: number;
	importance: TopicMapImportance;
	x: number;
	y: number;
	width: number;
	height: number;
	relatedNodeSlugs: readonly string[];
};

export type TopicMapDeclaration = {
	sourceSlug: string;
	targetSlug: string;
	sourceIndex: number;
};

export type TopicMapEdge = {
	id: string;
	sourceSlug: string;
	targetSlug: string;
	path: string;
	reciprocal: boolean;
	crossTerritory: boolean;
	principal: boolean;
	declarations: readonly TopicMapDeclaration[];
};

export type LivingTopicMapModel = {
	width: number;
	height: number;
	territories: readonly TopicMapTerritory[];
	nodes: readonly TopicMapNode[];
	edges: readonly TopicMapEdge[];
};

type MutableEdge = {
	id: string;
	sourceSlug: string;
	targetSlug: string;
	declarations: TopicMapDeclaration[];
};

function groupId(group: string) {
	return group
		.normalize('NFKC')
		.toLocaleLowerCase('en')
		.replace(/&/g, ' and ')
		.replace(/[’']/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-|-$/g, '');
}

function topicImportance(resourceCount: number): TopicMapImportance {
	if (resourceCount >= 24) return 'major';
	if (resourceCount >= 12) return 'standard';
	return 'minor';
}

export function wrapTopicMapLabel(label: string): readonly string[] {
	const words = label.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	const lines = ['', ''];
	for (const word of words) {
		const firstCandidate = lines[0] ? `${lines[0]} ${word}` : word;
		if (!lines[1] && (firstCandidate.length <= 18 || !lines[0])) {
			lines[0] = firstCandidate;
		} else {
			lines[1] = lines[1] ? `${lines[1]} ${word}` : word;
		}
	}

	return lines.filter(Boolean);
}

function territoryHeightForTopicCount(count: number) {
	if (count <= 2) return BASE_TERRITORY_HEIGHT;

	const rows = Math.ceil(count / 2);
	const lastRowCentre = TOPIC_NODE_FIRST_ROW_Y + (rows - 1) * TOPIC_NODE_ROW_GAP;
	return Math.max(BASE_TERRITORY_HEIGHT, lastRowCentre + 30 + TOPIC_NODE_BOTTOM_MARGIN);
}

function slotForNode(index: number, count: number, territoryHeight: number) {
	if (count === 1) return { x: 0.5, y: 0.58, width: 156, height: 76 };
	if (count === 2) {
		return index === 0
			? { x: 0.3, y: 0.42, width: 150, height: 72 }
			: { x: 0.7, y: 0.76, width: 150, height: 72 };
	}

	const columns = 2;
	const rows = Math.ceil(count / columns);
	const column = index % columns;
	const row = Math.floor(index / columns);
	const x = 0.26 + column * 0.48;
	const y =
		(TOPIC_NODE_FIRST_ROW_Y + Math.min(row, rows - 1) * TOPIC_NODE_ROW_GAP) / territoryHeight;

	return { x, y, width: 132, height: 60 };
}

function rounded(value: number) {
	return Math.round(value * 10) / 10;
}

function edgePath(source: TopicMapNode, target: TopicMapNode, id: string) {
	const deltaX = target.x - source.x;
	const deltaY = target.y - source.y;
	const length = Math.max(1, Math.hypot(deltaX, deltaY));
	const bendDirection = (hashStringToSeed(id) & 1) === 0 ? -1 : 1;
	const bend = (24 + (hashStringToSeed(`${id}:bend`) % 25)) * bendDirection;
	const midpointX = (source.x + target.x) / 2;
	const midpointY = (source.y + target.y) / 2;
	const controlX = midpointX + (-deltaY / length) * bend;
	const controlY = midpointY + (deltaX / length) * bend;

	return `M ${rounded(source.x)} ${rounded(source.y)} Q ${rounded(controlX)} ${rounded(
		controlY
	)} ${rounded(target.x)} ${rounded(target.y)}`;
}

function canonicalEdgeId(left: string, right: string) {
	return [left, right].sort((a, b) => a.localeCompare(b)).join('::');
}

export function buildTopicMapModel(
	inputTopics: readonly TopicHeadquartersSummary[]
): LivingTopicMapModel {
	const topics = [...inputTopics].sort((left, right) => left.slug.localeCompare(right.slug));
	const topicsBySlug = new Map<string, TopicHeadquartersSummary>();

	for (const topic of topics) {
		if (topicsBySlug.has(topic.slug)) {
			throw new Error(`Living Topic Map received duplicate topic slug "${topic.slug}".`);
		}
		topicsBySlug.set(topic.slug, topic);
	}

	const groupLabels = Array.from(new Set(topics.map((topic) => topic.group)));
	const unknownGroups = groupLabels
		.filter((group) => !KNOWN_GROUP_INDEX.has(group))
		.sort((left, right) => left.localeCompare(right));
	const unknownGroupIndex = new Map(
		unknownGroups.map((group, index) => [group, KNOWN_GROUP_ORDER.length + index])
	);
	const groupIds = new Map<string, string>();
	const labelsByGroupId = new Map<string, string>();

	for (const group of groupLabels) {
		const id = groupId(group);
		const existing = labelsByGroupId.get(id);
		if (existing && existing !== group) {
			throw new Error(
				`Living Topic Map group labels "${existing}" and "${group}" resolve to the same id "${id}".`
			);
		}
		groupIds.set(group, id);
		labelsByGroupId.set(id, group);
	}

	const territoryInputs = groupLabels
		.map((label) => {
			const territoryTopics = topics
				.filter((topic) => topic.group === label)
				.sort(
					(left, right) =>
						right.resourceCount - left.resourceCount ||
						left.title.localeCompare(right.title) ||
						left.slug.localeCompare(right.slug)
				);

			return {
				label,
				id: groupIds.get(label)!,
				index: KNOWN_GROUP_INDEX.get(label) ?? unknownGroupIndex.get(label)!,
				height: territoryHeightForTopicCount(territoryTopics.length),
				topics: territoryTopics
			};
		})
		.sort((left, right) => left.index - right.index || left.label.localeCompare(right.label));
	const maxTerritoryIndex = territoryInputs.reduce(
		(maximum, territory) => Math.max(maximum, territory.index),
		-1
	);
	const mapRows = Math.max(2, Math.ceil((maxTerritoryIndex + 1) / MAP_COLUMNS));
	const rowHeights = Array.from({ length: mapRows }, (_, row) =>
		Math.max(
			BASE_TERRITORY_HEIGHT,
			...territoryInputs
				.filter((territory) => Math.floor(territory.index / MAP_COLUMNS) === row)
				.map((territory) => territory.height)
		)
	);
	const contentHeight =
		MAP_MARGIN_Y * 2 +
		rowHeights.reduce((total, rowHeight) => total + rowHeight, 0) +
		(mapRows - 1) * TERRITORY_GAP_Y;
	const height = Math.max(TOPIC_MAP_MIN_HEIGHT, contentHeight);
	const verticalOffset = (height - contentHeight) / 2;
	const rowTops: number[] = [];
	let nextRowTop = verticalOffset + MAP_MARGIN_Y;
	for (const rowHeight of rowHeights) {
		rowTops.push(nextRowTop);
		nextRowTop += rowHeight + TERRITORY_GAP_Y;
	}
	const territories: TopicMapTerritory[] = [];
	const nodes: TopicMapNode[] = [];

	for (const territoryInput of territoryInputs) {
		const column = territoryInput.index % MAP_COLUMNS;
		const row = Math.floor(territoryInput.index / MAP_COLUMNS);
		const territoryX = MAP_MARGIN_X + column * (TERRITORY_WIDTH + TERRITORY_GAP_X);
		const territoryY = rowTops[row]!;
		const territoryNodes = territoryInput.topics.map((topic, index) => {
			const slot = slotForNode(index, territoryInput.topics.length, territoryInput.height);
			return {
				slug: topic.slug,
				href: topicHeadquartersPath(topic.slug),
				title: topic.title,
				label: topic.shortTitle,
				labelLines: wrapTopicMapLabel(topic.shortTitle),
				description: topic.description,
				groupId: territoryInput.id,
				groupLabel: territoryInput.label,
				resourceCount: topic.resourceCount,
				importance: topicImportance(topic.resourceCount),
				x: rounded(territoryX + TERRITORY_WIDTH * slot.x),
				y: rounded(territoryY + territoryInput.height * slot.y),
				width: slot.width,
				height: slot.height,
				relatedNodeSlugs: [] as string[]
			} satisfies TopicMapNode;
		});

		nodes.push(...territoryNodes);
		territories.push({
			id: territoryInput.id,
			label: territoryInput.label,
			index: territoryInput.index,
			x: territoryX,
			y: rounded(territoryY),
			width: TERRITORY_WIDTH,
			height: territoryInput.height,
			nodeSlugs: territoryNodes.map((node) => node.slug)
		});
	}

	const nodesBySlug = new Map(nodes.map((node) => [node.slug, node]));
	const mutableEdges = new Map<string, MutableEdge>();

	for (const topic of topics) {
		for (const [sourceIndex, targetSlug] of topic.relatedTopicSlugs.entries()) {
			if (targetSlug === topic.slug) {
				throw new Error(`Living Topic Map topic "${topic.slug}" cannot relate to itself.`);
			}
			if (!topicsBySlug.has(targetSlug)) {
				throw new Error(
					`Living Topic Map topic "${topic.slug}" references unknown topic "${targetSlug}".`
				);
			}

			const id = canonicalEdgeId(topic.slug, targetSlug);
			const existing = mutableEdges.get(id);
			const declaration = { sourceSlug: topic.slug, targetSlug, sourceIndex };
			if (existing) {
				existing.declarations.push(declaration);
			} else {
				const [sourceSlug, targetSlug] = id.split('::') as [string, string];
				mutableEdges.set(id, {
					id,
					sourceSlug,
					targetSlug,
					declarations: [declaration]
				});
			}
		}
	}

	const edgeDrafts = [...mutableEdges.values()]
		.sort((left, right) => left.id.localeCompare(right.id))
		.map((edge) => {
			const source = nodesBySlug.get(edge.sourceSlug)!;
			const target = nodesBySlug.get(edge.targetSlug)!;
			const declarationDirections = new Set(
				edge.declarations.map(
					(declaration) => `${declaration.sourceSlug}::${declaration.targetSlug}`
				)
			);
			const reciprocal =
				declarationDirections.has(`${edge.sourceSlug}::${edge.targetSlug}`) &&
				declarationDirections.has(`${edge.targetSlug}::${edge.sourceSlug}`);

			return {
				...edge,
				path: edgePath(source, target, edge.id),
				reciprocal,
				crossTerritory: source.groupId !== target.groupId,
				principal: false
			} satisfies TopicMapEdge;
		});
	const principalIds = new Set(
		[...edgeDrafts]
			.filter((edge) => edge.crossTerritory)
			.sort((left, right) => {
				const reciprocalDifference = Number(right.reciprocal) - Number(left.reciprocal);
				if (reciprocalDifference !== 0) return reciprocalDifference;
				const leftImportance =
					nodesBySlug.get(left.sourceSlug)!.resourceCount +
					nodesBySlug.get(left.targetSlug)!.resourceCount;
				const rightImportance =
					nodesBySlug.get(right.sourceSlug)!.resourceCount +
					nodesBySlug.get(right.targetSlug)!.resourceCount;
				return rightImportance - leftImportance || left.id.localeCompare(right.id);
			})
			.slice(0, TOPIC_MAP_MAX_PRINCIPAL_EDGES)
			.map((edge) => edge.id)
	);
	const edges = edgeDrafts.map((edge) => ({ ...edge, principal: principalIds.has(edge.id) }));
	const neighbours = new Map(nodes.map((node) => [node.slug, new Set<string>()]));

	for (const edge of edges) {
		neighbours.get(edge.sourceSlug)!.add(edge.targetSlug);
		neighbours.get(edge.targetSlug)!.add(edge.sourceSlug);
	}
	for (const node of nodes) {
		node.relatedNodeSlugs = [...neighbours.get(node.slug)!].sort((left, right) =>
			left.localeCompare(right)
		);
	}

	return {
		width: TOPIC_MAP_WIDTH,
		height,
		territories,
		nodes,
		edges
	};
}
