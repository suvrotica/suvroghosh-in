import type { AnalysisResult, Association, Concept } from './types';

export const PALETTE = [
	'#28786f',
	'#b66042',
	'#6872a0',
	'#a57c2c',
	'#7c658c',
	'#508193',
	'#728443',
	'#a95b70'
];
export type MapNode = Concept & { x: number; y: number; r: number; colour: string };
export type MapIsland = {
	id: number;
	x: number;
	y: number;
	r: number;
	label: string;
	colour: string;
	count: number;
	width: number;
};

type MapFocus = {
	selected?: string;
	focused?: string[];
	search?: string;
	maxTopics?: number;
};

/** Display projection only. The analysis and the All concepts view remain complete. */
export function mapLayout(
	result: AnalysisResult,
	density: number,
	topic: number | null,
	pins: string[] = [],
	focus: MapFocus = {}
) {
	const requested = new Set([
		...(focus.selected ? [focus.selected] : []),
		...(focus.focused ?? [])
	]);
	const query = (focus.search ?? '').trim().toLocaleLowerCase();
	const pinned = new Set(pins);
	const matches = (node: Concept) =>
		Boolean(query && node.label.toLocaleLowerCase().includes(query));
	const ranked = [...result.concepts]
		.filter((n) => topic === null || n.community === topic || requested.has(n.id))
		.sort(
			(a, b) =>
				Number(requested.has(b.id)) - Number(requested.has(a.id)) ||
				Number(matches(b)) - Number(matches(a)) ||
				Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
				b.score - a.score ||
				a.id.localeCompare(b.id)
		);
	// Zero is the explicit All concepts option. A normal density larger than a small
	// corpus must still respect the responsive overview's topic budget.
	const all = density === 0;
	const groups = new Map<number, Concept[]>();
	for (const node of ranked) {
		const group = groups.get(node.community) ?? [];
		group.push(node);
		groups.set(node.community, group);
	}
	const topicRanks = [...groups].map(([id, nodes]) => ({
		id,
		requested: nodes.some((n) => requested.has(n.id)) || id === topic,
		matches: nodes.filter(matches).length,
		pins: nodes.filter((n) => pinned.has(n.id)).length,
		score: nodes.reduce((sum, n) => sum + n.score, 0)
	}));
	topicRanks.sort(
		(a, b) =>
			Number(b.requested) - Number(a.requested) ||
			b.matches - a.matches ||
			b.pins - a.pins ||
			b.score - a.score ||
			a.id - b.id
	);
	const topicBudget = all
		? topicRanks.length
		: Math.max(focus.maxTopics ?? 12, topicRanks.filter((t) => t.requested).length);
	const visibleTopics = new Set(topicRanks.slice(0, topicBudget).map((t) => t.id));
	const eligible = ranked.filter((n) => visibleTopics.has(n.community));
	const chosen: Concept[] = [];
	const included = new Set<string>();
	const budget = all
		? eligible.length
		: Math.max(Math.floor(density), eligible.filter((n) => requested.has(n.id)).length);
	const include = (node: Concept) => {
		if (included.has(node.id) || chosen.length >= budget) return;
		chosen.push(node);
		included.add(node.id);
	};
	// Explicit investigations, search hits and pins take precedence over the reading sample.
	for (const node of eligible)
		if (requested.has(node.id) || matches(node) || pinned.has(node.id)) include(node);
	// Reserve a small representative set for each island before filling by score. A large
	// dominant topic should not erase the remaining topics from a corpus overview.
	for (let depth = 0; depth < 3; depth++)
		for (const { id } of topicRanks) {
			const node = visibleTopics.has(id) ? groups.get(id)?.[depth] : undefined;
			if (node) include(node);
		}
	for (const node of eligible) include(node);
	const chosenGroups = new Map<number, Concept[]>();
	for (const node of chosen) {
		const group = chosenGroups.get(node.community) ?? [];
		group.push(node);
		chosenGroups.set(node.community, group);
	}
	const communities = result.topics.filter((t) => chosenGroups.has(t.id));
	const columns = Math.max(1, Math.round(Math.sqrt(communities.length * 1.45)));
	const rows = Math.max(1, Math.ceil(communities.length / columns));
	const cellWidth = 900 / columns;
	const cellHeight = 500 / rows;
	const islands: MapIsland[] = communities.map((t, i) => {
		const row = Math.floor(i / columns);
		const inRow = Math.min(columns, communities.length - row * columns);
		return {
			id: t.id,
			x: 500 + ((i % columns) - (inRow - 1) / 2) * cellWidth,
			y: 330 + (row - (rows - 1) / 2) * cellHeight,
			r:
				communities.length === 1
					? 210
					: Math.max(8, Math.min(150, cellWidth * 0.43 - 24, (cellHeight - 46) / 1.64 - 24)),
			label: t.label,
			colour: PALETTE[t.id % PALETTE.length],
			count: t.terms.length,
			width: cellWidth
		};
	});
	const maximum = chosen.reduce((max, n) => Math.max(max, n.score), 1);
	const nodes: MapNode[] = [];
	for (const island of islands) {
		const group = chosenGroups.get(island.id)!;
		// Keep many small nodes distinguishable in an island without inflating their contours.
		const radiusScale = Math.min(1, island.r / Math.max(30, Math.sqrt(group.length) * 12));
		group.forEach((node, i) => {
			const angle = i * 2.399963229728653 + island.id * 0.71;
			const distance = i === 0 ? 0 : Math.sqrt(i / Math.max(1, group.length - 1)) * island.r * 0.78;
			nodes.push({
				...node,
				x: island.x + Math.cos(angle) * distance,
				y: island.y + Math.sin(angle) * distance * 0.82,
				r: Math.max(0.45, (3.5 + Math.sqrt(node.score / maximum) * 8) * radiusScale),
				colour: island.colour
			});
		});
	}
	return {
		nodes,
		islands,
		total: ranked.length,
		totalTopics: groups.size,
		all,
		searchMatches: ranked.filter(matches).length,
		visibleMatches: chosen.filter(matches).length,
		outsideTopic: chosen.filter((node) => topic !== null && node.community !== topic).length
	};
}

export type MapLayout = ReturnType<typeof mapLayout>;

/** A maximum-weight spanning forest plus the strongest two links per node. Selected
 * nodes retain every eligible incident edge. This declutters the drawing, not the data. */
export function mapConnections(edges: Association[], nodes: MapNode[], highlighted = '') {
	const ids = new Set(nodes.map((n) => n.id));
	const eligible = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
	if (eligible.length <= nodes.length * 3)
		return { edges: eligible, total: eligible.length, eligible };
	const ranked = [...eligible].sort(
		(a, b) => b.weight - a.weight || b.count - a.count || a.id.localeCompare(b.id)
	);
	const parent = new Map(nodes.map((n) => [n.id, n.id]));
	const root = (id: string): string => {
		let current = id;
		while (parent.get(current) !== current) current = parent.get(current)!;
		while (id !== current) {
			const next = parent.get(id)!;
			parent.set(id, current);
			id = next;
		}
		return current;
	};
	const degree = new Map<string, number>();
	const shown: Association[] = [];
	for (const edge of ranked) {
		const a = root(edge.source),
			b = root(edge.target);
		const keep =
			a !== b || (degree.get(edge.source) ?? 0) < 2 || (degree.get(edge.target) ?? 0) < 2;
		if (a !== b) parent.set(a, b);
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
		if (keep) shown.push(edge);
	}
	return focusConnections({ edges: shown, total: eligible.length, eligible }, highlighted);
}

export function focusConnections(
	projection: { edges: Association[]; total: number; eligible: Association[] },
	highlighted: string
) {
	if (!highlighted || projection.edges.length === projection.total) return projection;
	const included = new Set(projection.edges.map((edge) => edge.id));
	return {
		...projection,
		edges: projection.edges.concat(
			projection.eligible.filter(
				(edge) =>
					(edge.source === highlighted || edge.target === highlighted) && !included.has(edge.id)
			)
		)
	};
}

export type LabelRect = { x: number; y: number; width: number; height: number };
export type MapLabel = LabelRect & {
	id: string;
	kind: 'topic' | 'concept';
	text: string;
	fontSize: number;
	weight: number;
	colour: string;
};
export function rectanglesOverlap(a: LabelRect, b: LabelRect, gap = 0) {
	return (
		a.x < b.x + b.width + gap &&
		a.x + a.width + gap > b.x &&
		a.y < b.y + b.height + gap &&
		a.y + a.height + gap > b.y
	);
}

/** Pure placement shared by Canvas and SVG. All bounds are in graph coordinates;
 * minimum screen-size fonts, alternate anchors and a spatial index avoid label piles. */
export function mapLabels(
	layout: MapLayout,
	measure: (text: string, fontSize: number, weight: number) => number,
	options: {
		scale?: number;
		zoom?: number;
		highlight?: string;
		focused?: string[];
		pins?: string[];
		search?: string;
		bounds?: LabelRect;
	} = {}
): MapLabel[] {
	const bounds = options.bounds ?? { x: 24, y: 65, width: 952, height: 555 };
	const screenScale = Math.max(0.05, (options.scale ?? 1) * (options.zoom ?? 1));
	const query = options.search?.trim().toLocaleLowerCase() ?? '';
	const focus = new Set(options.focused ?? []),
		pins = new Set(options.pins ?? []);
	const islandWidths = new Map(layout.islands.map((island) => [island.id, island.width]));
	const fontSize = 11 / screenScale;
	const candidates: {
		id: string;
		kind: 'topic' | 'concept';
		text: string;
		colour: string;
		priority: number;
		size: number;
		weight: number;
		maxWidth: number;
		anchors: { x: number; y: number }[];
		centered?: boolean;
	}[] = [];
	const fitText = (text: string, width: number, size: number, weight: number) => {
		// Labels are previews. Never measure a megabyte-long unbroken source token.
		const prefix = text.slice(0, 512);
		if (prefix.length === text.length && measure(prefix, size, weight) <= width) return prefix;
		const chars = Array.from(prefix);
		let low = 0,
			high = chars.length;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (measure(chars.slice(0, middle).join('') + '…', size, weight) <= width) low = middle;
			else high = middle - 1;
		}
		return low ? chars.slice(0, low).join('') + '…' : '';
	};
	for (const island of layout.islands) {
		candidates.push({
			id: `topic-${island.id}`,
			kind: 'topic',
			text: island.label.toLocaleUpperCase(),
			colour: island.colour,
			priority: 105,
			size: fontSize,
			weight: 600,
			maxWidth: Math.min(island.width - 22, bounds.width),
			anchors: [{ x: island.x, y: island.y - (island.r + 24) * 0.82 - fontSize - 10 }],
			centered: true
		});
	}
	const perTopic = new Map<number, number>();
	for (const node of layout.nodes) {
		const representative = (perTopic.get(node.community) ?? 0) < 3;
		perTopic.set(node.community, (perTopic.get(node.community) ?? 0) + 1);
		const active = node.id === options.highlight,
			focused = focus.has(node.id),
			match = Boolean(query && node.label.toLocaleLowerCase().includes(query));
		const priority = active
			? 120
			: focused
				? 110
				: match
					? 100
					: pins.has(node.id)
						? 90
						: representative
							? 60
							: 20;
		if (priority === 20 && (options.zoom ?? 1) < 1.65) continue;
		if (
			node.x < bounds.x ||
			node.x > bounds.x + bounds.width ||
			node.y < bounds.y ||
			node.y > bounds.y + bounds.height
		)
			continue;
		const size = active ? fontSize * 1.15 : fontSize,
			gap = node.r + 5 / screenScale;
		candidates.push({
			id: node.id,
			kind: 'concept',
			text: node.label,
			colour: node.colour,
			priority,
			size,
			weight: active || focused ? 600 : 400,
			maxWidth: Math.min(
				210 / screenScale,
				bounds.width * 0.55,
				(islandWidths.get(node.community) ?? bounds.width) * 0.8
			),
			anchors: [
				{ x: node.x + gap, y: node.y - size / 2 },
				{ x: node.x - gap, y: node.y - size / 2 },
				{ x: node.x, y: node.y - gap - size },
				{ x: node.x, y: node.y + gap }
			]
		});
	}
	candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
	const cellSize = Math.max(24, fontSize * 2),
		cells = new Map<string, LabelRect[]>();
	const cellKeys = (rect: LabelRect) => {
		const keys: string[] = [];
		for (
			let x = Math.floor((rect.x - 3) / cellSize);
			x <= Math.floor((rect.x + rect.width + 3) / cellSize);
			x++
		)
			for (
				let y = Math.floor((rect.y - 3) / cellSize);
				y <= Math.floor((rect.y + rect.height + 3) / cellSize);
				y++
			)
				keys.push(`${x},${y}`);
		return keys;
	};
	const labels: MapLabel[] = [];
	for (const candidate of candidates) {
		const text = fitText(candidate.text, candidate.maxWidth, candidate.size, candidate.weight);
		if (!text) continue;
		const width = measure(text, candidate.size, candidate.weight),
			height = candidate.size * 1.2;
		for (let i = 0; i < candidate.anchors.length; i++) {
			const anchor = candidate.anchors[i];
			let x = anchor.x - (candidate.centered || i > 1 ? width / 2 : i === 1 ? width : 0);
			let y = anchor.y;
			// Selected/finding labels stay readable even close to the viewport edge.
			if (candidate.priority >= 110) {
				x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width));
				y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height));
			}
			const rect = { x, y, width, height };
			if (
				x < bounds.x ||
				y < bounds.y ||
				x + width > bounds.x + bounds.width ||
				y + height > bounds.y + bounds.height
			)
				continue;
			const keys = cellKeys(rect);
			if (
				keys.some((key) => cells.get(key)?.some((r) => rectanglesOverlap(rect, r, 3 / screenScale)))
			)
				continue;
			labels.push({
				...rect,
				id: candidate.id,
				kind: candidate.kind,
				text,
				colour: candidate.colour,
				fontSize: candidate.size,
				weight: candidate.weight
			});
			for (const key of keys) {
				const rects = cells.get(key) ?? [];
				rects.push(rect);
				cells.set(key, rects);
			}
			break;
		}
	}
	return labels;
}
export function escapeXml(value: string) {
	return value.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
	);
}
export function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 15_000);
}
