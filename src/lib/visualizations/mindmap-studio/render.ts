import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	randomLcg
} from 'd3';
import type { SimulationNodeDatum } from 'd3';
import type { StudioProject, StudioNode, StudioEdge } from './types';

export const BRANCH_COLOURS = [
	'#3f7364',
	'#9a603f',
	'#4f7191',
	'#897335',
	'#8b5f7e',
	'#536f70',
	'#9a5757',
	'#657549'
];
export const NIGHT_BRANCH_COLOURS = [
	'#9cc8b7',
	'#dfb194',
	'#abc7e4',
	'#dfce90',
	'#d4afd0',
	'#9ac7c8',
	'#e1aaaa',
	'#bdcc9b'
];
export type CanvasCommand = {
	type: 'fit' | 'zoom-in' | 'zoom-out' | 'export-png' | 'export-svg';
	serial: number;
};
export type GraphNode = SimulationNodeDatum & {
	id: string;
	node: StudioNode;
	colour: string;
	group: string;
	x: number;
	y: number;
	width: number;
	height: number;
	lines: string[];
	targetX: number;
	targetY: number;
};
export type GraphLink = {
	id: string;
	from: string;
	to: string;
	label: string;
	status: StudioNode['status'];
	semantic: boolean;
	edge?: StudioEdge;
};
export type GraphLayout = { nodes: GraphNode[]; links: GraphLink[]; width: number; height: number };

export function wrapNodeLabel(label: string, maxCharacters = 24): string[] {
	const words = label.trim().split(/\s+/u);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		if (line && `${line} ${word}`.length > maxCharacters) {
			lines.push(line);
			line = '';
		}
		if (word.length > maxCharacters) {
			if (line) {
				lines.push(line);
				line = '';
			}
			for (let offset = 0; offset < word.length; offset += maxCharacters)
				lines.push(word.slice(offset, offset + maxCharacters));
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(line);
	return lines.length ? lines : ['Untitled'];
}

export function branchColours(project: StudioProject): Map<string, string> {
	const palette = project.theme === 'night' ? NIGHT_BRANCH_COLOURS : BRANCH_COLOURS;
	const colours = new Map<string, string>([[project.rootId, palette[0]]]);
	const children = new Map<string, StudioNode[]>();
	for (const node of project.nodes)
		if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
	const walk = (id: string, colour: string) => {
		colours.set(id, colour);
		for (const child of children.get(id) ?? []) walk(child.id, colour);
	};
	(children.get(project.rootId) ?? []).forEach((node, i) =>
		walk(node.id, palette[i % palette.length])
	);
	return colours;
}

/** A finite, seeded layout: physics never continues while someone is reading. */
export function layoutKnowledgeGraph(project: StudioProject): GraphLayout {
	const colours = branchColours(project);
	const lookup = new Map(project.nodes.map((node) => [node.id, node]));
	const branches = project.nodes.filter((node) => node.parentId === project.rootId);
	const branchIndex = new Map(branches.map((node, index) => [node.id, index]));
	const groupOf = (node: StudioNode): string => {
		let current = node;
		for (let count = 0; count < project.nodes.length; count++) {
			if (!current.parentId || current.parentId === project.rootId) return current.id;
			const parent = lookup.get(current.parentId);
			if (!parent) return current.id;
			current = parent;
		}
		return node.id;
	};
	const radius = Math.max(270, Math.sqrt(project.nodes.length) * 57);
	const nodes: GraphNode[] = project.nodes.map((node, index) => {
		const group = groupOf(node);
		const angle =
			((branchIndex.get(group) ?? 0) / Math.max(branches.length, 1)) * Math.PI * 2 - Math.PI / 2;
		const root = node.id === project.rootId;
		const lines = wrapNodeLabel(node.label, root ? 23 : 25);
		const targetX = root ? 0 : Math.cos(angle) * radius;
		const targetY = root ? 0 : Math.sin(angle) * radius * 0.76;
		return {
			id: node.id,
			node,
			colour: colours.get(node.id) ?? BRANCH_COLOURS[0],
			group,
			x: targetX + Math.cos(index * 2.399) * 140,
			y: targetY + Math.sin(index * 2.399) * 140,
			width: root ? 228 : 206,
			height: Math.max(76, lines.length * 21 + 38),
			lines,
			targetX,
			targetY,
			...(root ? { fx: 0, fy: 0 } : {})
		};
	});
	const links: GraphLink[] = [
		...project.nodes
			.filter((node) => node.parentId && lookup.has(node.parentId))
			.map((node) => ({
				id: `hierarchy:${node.id}`,
				from: node.parentId!,
				to: node.id,
				label: '',
				status: 'explicit' as const,
				semantic: false
			})),
		...project.edges
			.filter((edge) => lookup.has(edge.from) && lookup.has(edge.to))
			.map((edge) => ({
				id: edge.id,
				from: edge.from,
				to: edge.to,
				label: edge.type.replaceAll('_', ' '),
				status: edge.status,
				semantic: true,
				edge
			}))
	];
	const simulationLinks = links.map((link) => ({
		source: link.from,
		target: link.to,
		semantic: link.semantic
	}));
	const simulation = forceSimulation(nodes)
		.randomSource(randomLcg(0.4321))
		.force('charge', forceManyBody().strength(-120))
		.force(
			'link',
			forceLink<GraphNode, (typeof simulationLinks)[number]>(simulationLinks)
				.id((node) => node.id)
				.distance((link) => (link.semantic ? 280 : 180))
				.strength((link) => (link.semantic ? 0.045 : 0.2))
		)
		.force(
			'collision',
			forceCollide<GraphNode>()
				.radius((node) => node.height / 2 + 16)
				.iterations(3)
		)
		.force('x', forceX<GraphNode>((node) => node.targetX).strength(0.08))
		.force('y', forceY<GraphNode>((node) => node.targetY).strength(0.1))
		.force('centre', forceCenter(0, 0))
		.stop();
	for (let tick = 0; tick < 180; tick++) simulation.tick();
	simulation.stop();
	// Resolve rectangular corner collisions without allowing jitter or a live simulation.
	for (let iteration = 0; iteration < 50; iteration++) {
		for (let a = 0; a < nodes.length; a++)
			for (let b = a + 1; b < nodes.length; b++) {
				const first = nodes[a],
					second = nodes[b];
				const dx = second.x - first.x,
					dy = second.y - first.y;
				const overlapX = (first.width + second.width) / 2 + 30 - Math.abs(dx);
				const overlapY = (first.height + second.height) / 2 + 30 - Math.abs(dy);
				if (overlapX <= 0 || overlapY <= 0) continue;
				// Wide screens need a landscape composition; card height alone otherwise
				// makes the collision solver stack every cluster into a narrow column.
				if (overlapX / 2.8 < overlapY) {
					const step = (Math.sign(dx || 1) * overlapX) / 2;
					first.x -= step;
					second.x += step;
				} else {
					const step = (Math.sign(dy || 1) * overlapY) / 2;
					first.y -= step;
					second.y += step;
				}
			}
	}
	const minX = Math.min(...nodes.map((node) => node.x - node.width / 2), 0) - 90;
	const minY = Math.min(...nodes.map((node) => node.y - node.height / 2), 0) - 100;
	const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2), 0) + 90;
	const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2), 0) + 100;
	for (const node of nodes) {
		node.x -= minX;
		node.y -= minY;
	}
	return { nodes, links, width: maxX - minX, height: maxY - minY };
}

export function graphConnection(
	from: GraphNode,
	to: GraphNode,
	semantic: boolean
): { path: string; x: number; y: number } {
	const dx = to.x - from.x,
		dy = to.y - from.y;
	const firstScale =
		1 / Math.max(Math.abs(dx) / (from.width / 2 + 6), Math.abs(dy) / (from.height / 2 + 6), 1);
	const secondScale =
		1 / Math.max(Math.abs(dx) / (to.width / 2 + 8), Math.abs(dy) / (to.height / 2 + 8), 1);
	const x1 = from.x + dx * firstScale,
		y1 = from.y + dy * firstScale;
	const x2 = to.x - dx * secondScale,
		y2 = to.y - dy * secondScale;
	const length = Math.max(1, Math.hypot(dx, dy));
	const bend = semantic ? Math.min(58, length * 0.12) : 0;
	const cx = (x1 + x2) / 2 - (dy / length) * bend,
		cy = (y1 + y2) / 2 + (dx / length) * bend;
	return {
		path: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`,
		x: (x1 + 2 * cx + x2) / 4,
		y: (y1 + 2 * cy + y2) / 4
	};
}

export function escapeSvg(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!
	);
}

export function graphSvg(project: StudioProject, layout = layoutKnowledgeGraph(project)): string {
	// A reader may have dragged cards beyond the original bounds. Export the complete composition.
	const minX = Math.min(...layout.nodes.map((node) => node.x - node.width / 2)) - 65;
	const minY = Math.min(...layout.nodes.map((node) => node.y - node.height / 2)) - 65;
	const maxX = Math.max(...layout.nodes.map((node) => node.x + node.width / 2)) + 65;
	const maxY = Math.max(...layout.nodes.map((node) => node.y + node.height / 2)) + 65;
	layout = {
		...layout,
		width: maxX - minX,
		height: maxY - minY,
		nodes: layout.nodes.map((node) => ({ ...node, x: node.x - minX, y: node.y - minY }))
	};
	const dark = project.theme === 'night';
	const paper = dark ? '#202724' : '#f7f2e7',
		surface = dark ? '#29342f' : '#fdfaf3',
		ink = dark ? '#f2ecdf' : '#2b241c',
		muted = dark ? '#c1c6bc' : '#655e52';
	const lookup = new Map(layout.nodes.map((node) => [node.id, node]));
	const paths = layout.links
		.map((link) => {
			const from = lookup.get(link.from),
				to = lookup.get(link.to);
			if (!from || !to) return '';
			const geometry = graphConnection(from, to, link.semantic);
			return `<path d="${geometry.path}" stroke="${link.semantic ? from.colour : dark ? '#536157' : '#cec8ba'}" stroke-width="${link.semantic ? 2 : 1.4}" fill="none" ${link.semantic ? 'marker-end="url(#arrow)"' : ''} ${link.status !== 'explicit' ? `stroke-dasharray="${link.status === 'inferred' ? '7 5' : '2 5'}"` : ''}/>${link.semantic ? `<rect x="${geometry.x - link.label.length * 3.6 - 8}" y="${geometry.y - 11}" width="${link.label.length * 7.2 + 16}" height="22" rx="7" fill="${paper}"/><text x="${geometry.x}" y="${geometry.y + 4}" text-anchor="middle" fill="${muted}" font-size="12">${escapeSvg(link.label)}</text>` : ''}`;
		})
		.join('');
	const cards = layout.nodes
		.map((item) => {
			const root = item.id === project.rootId;
			const fill = root ? (dark ? '#4b7664' : '#355f50') : surface;
			return `<g transform="translate(${item.x - item.width / 2} ${item.y - item.height / 2})"><rect width="${item.width}" height="${item.height}" rx="${root ? 18 : 12}" fill="${fill}" stroke="${item.colour}" stroke-width="${root ? 2 : 1.2}" ${item.node.status !== 'explicit' ? 'stroke-dasharray="5 4"' : ''}/><rect x="0" y="17" width="3" height="${item.height - 34}" rx="1.5" fill="${item.colour}"/><text x="16" y="20" font-size="10" letter-spacing="1.3" fill="${root ? '#e4eee6' : muted}">${escapeSvg(root ? 'CENTRAL IDEA' : item.node.category.toUpperCase().slice(0, 24))}</text>${item.lines.map((line, index) => `<text x="16" y="${42 + index * 21}" font-size="16" font-weight="${root ? 600 : 500}" fill="${root ? '#fffaf0' : ink}">${escapeSvg(line)}</text>`).join('')}</g>`;
		})
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(layout.width)}" height="${Math.ceil(layout.height + 75)}" viewBox="0 0 ${layout.width} ${layout.height + 75}" font-family="Arial, sans-serif"><title>${escapeSvg(project.title)} — knowledge graph</title><rect width="100%" height="100%" fill="${paper}"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="${muted}"/></marker></defs><text x="36" y="42" font-size="24" fill="${ink}">${escapeSvg(project.title)}</text><text x="36" y="65" font-size="12" fill="${muted}">Mindmap Studio · solid: explicit · dashed: inferred · dotted: speculative</text><g transform="translate(0 75)">${paths}${cards}</g></svg>`;
}

export function downloadCanvasBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canvasFilename(title: string, suffix: string): string {
	return `${
		title
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.trim()
			.replace(/\s+/g, '-')
			.slice(0, 80) || 'mindmap-studio'
	}-${suffix}`;
}

export async function downloadSvgPng(svg: string, filename: string): Promise<void> {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('The image could not be rendered. Try SVG export.'));
			image.src = url;
		});
		const ratio = Math.min(
			2,
			8192 / Math.max(image.width, image.height),
			Math.sqrt(24_000_000 / (image.width * image.height))
		);
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(image.width * ratio);
		canvas.height = Math.ceil(image.height * ratio);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Image export is unavailable in this browser.');
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		if (!blob) throw new Error('Image export failed. Try SVG export.');
		downloadCanvasBlob(blob, filename);
	} finally {
		URL.revokeObjectURL(url);
	}
}
