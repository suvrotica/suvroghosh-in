import type { AnalysisResult, Concept } from './types';

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
};
export function mapLayout(
	result: AnalysisResult,
	density: number,
	topic: number | null,
	pins: string[] = [],
	focus: { selected?: string; focused?: string[]; search?: string } = {}
) {
	const requested = new Set([
		...(focus.selected ? [focus.selected] : []),
		...(focus.focused ?? [])
	]);
	const query = (focus.search ?? '').trim().toLocaleLowerCase();
	const matches = (node: Concept) =>
		Boolean(query && node.label.toLocaleLowerCase().includes(query));
	const ranked = [...result.concepts]
		.filter((n) => topic === null || n.community === topic || requested.has(n.id))
		.sort(
			(a, b) =>
				Number(requested.has(b.id)) - Number(requested.has(a.id)) ||
				Number(matches(b)) - Number(matches(a)) ||
				Number(pins.includes(b.id)) - Number(pins.includes(a.id)) ||
				b.score - a.score ||
				a.id.localeCompare(b.id)
		);
	const chosen = ranked.slice(
		0,
		Math.max(density, ranked.filter((node) => requested.has(node.id)).length)
	);
	const communities = result.topics.filter((t) => chosen.some((n) => n.community === t.id));
	const columns = Math.max(1, Math.ceil(Math.sqrt(communities.length * 1.4)));
	const rows = Math.max(1, Math.ceil(communities.length / columns));
	const cellWidth = 880 / columns;
	const cellHeight = 520 / rows;
	const islands: MapIsland[] = communities.map((t, i) => {
		const row = Math.floor(i / columns);
		const inRow = Math.min(columns, communities.length - row * columns);
		return {
			id: t.id,
			x: 500 + ((i % columns) - (inRow - 1) / 2) * cellWidth,
			y: 330 + (row - (rows - 1) / 2) * cellHeight,
			r:
				communities.length === 1
					? 190
					: Math.min(
							115,
							cellWidth * 0.36,
							cellHeight * 0.4,
							45 + Math.sqrt(chosen.filter((n) => n.community === t.id).length) * 12
						),
			label: t.label,
			colour: PALETTE[t.id % PALETTE.length],
			count: t.terms.length
		};
	});
	const maximum = Math.max(1, ...chosen.map((n) => n.score));
	const nodes: MapNode[] = [];
	for (const island of islands) {
		const group = chosen.filter((n) => n.community === island.id);
		group.forEach((node, i) => {
			const angle = i * 2.399963229728653 + island.id * 0.71;
			const distance = i === 0 ? 0 : Math.sqrt(i / Math.max(1, group.length - 1)) * island.r * 0.78;
			nodes.push({
				...node,
				x: island.x + Math.cos(angle) * distance,
				y: island.y + Math.sin(angle) * distance * 0.82,
				r: 3.5 + Math.sqrt(node.score / maximum) * 9,
				colour: island.colour
			});
		});
	}
	return {
		nodes,
		islands,
		total: ranked.length,
		outsideTopic: chosen.filter((node) => topic !== null && node.community !== topic).length
	};
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
