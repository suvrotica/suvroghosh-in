import { getUmlDiagramMeta } from '../catalog';
import type { UmlDiagramType } from '../types';
import {
	parsePlantUml,
	type ParsedActivityNode,
	type ParsedPlantUmlDocument,
	type ParsedUmlNode,
	type ParsedUmlRelation
} from './parser';
import { escapeXml, sanitizeSvg } from './security';

export interface PlantUmlRenderResult {
	ok: boolean;
	svg?: string;
	width: number;
	height: number;
	parsed: ParsedPlantUmlDocument;
	error?: string;
	errorLine?: number;
}

function wrapText(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
	const clean = (text ?? '').trim();
	if (!clean) return [''];
	if (clean.length <= maxCharsPerLine) return [clean];

	const words = clean.split(/\s+/);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxCharsPerLine) {
			current = candidate;
		} else {
			if (current) {
				lines.push(current);
				if (lines.length >= maxLines - 1) {
					current = word;
				} else {
					current = word;
				}
			} else {
				lines.push(word.slice(0, maxCharsPerLine));
				current = word.slice(maxCharsPerLine);
			}
		}
	}
	if (current) {
		lines.push(current);
	}
	if (lines.length > maxLines) {
		const truncated = lines.slice(0, maxLines);
		truncated[maxLines - 1] =
			`${truncated[maxLines - 1].slice(0, Math.max(4, maxCharsPerLine - 1))}…`;
		return truncated;
	}
	return lines;
}

function renderSvgMarkers(): string {
	return `
	<defs>
		<style>
			.uml-svg-root {
				font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				color: var(--uml-ink, #1c2430);
			}
			.uml-bg { fill: var(--uml-canvas, #fcfbf8); }
			.uml-frame { fill: var(--uml-surface, #ffffff); stroke: var(--uml-border, #334155); stroke-width: 1.5; }
			.uml-header-band { fill: var(--uml-band, #f1f5f9); stroke: var(--uml-border, #334155); stroke-width: 1.5; }
			.uml-pkg-tab { fill: var(--uml-tab, #e2e8f0); stroke: var(--uml-border, #334155); stroke-width: 1.5; }
			.uml-node-3d-top { fill: var(--uml-3d-top, #e2e8f0); stroke: var(--uml-border, #334155); stroke-width: 1.4; }
			.uml-node-3d-side { fill: var(--uml-3d-side, #cbd5e1); stroke: var(--uml-border, #334155); stroke-width: 1.4; }
			.uml-accent-box { fill: var(--uml-accent-soft, #eff6ff); stroke: var(--uml-accent, #1d4ed8); stroke-width: 1.6; }
			.uml-note { fill: var(--uml-note-bg, #fef9c3); stroke: var(--uml-note-border, #ca8a04); stroke-width: 1.2; }
			.uml-title { font-size: 15px; font-weight: 700; fill: var(--uml-ink, #0f172a); }
			.uml-subtitle { font-size: 11px; font-weight: 600; fill: var(--uml-muted, #475569); }
			.uml-stereo { font-size: 10.5px; font-style: italic; fill: var(--uml-stereo, #475569); }
			.uml-name { font-size: 12.5px; font-weight: 700; fill: var(--uml-ink, #0f172a); }
			.uml-member { font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace; fill: var(--uml-ink-soft, #1e293b); }
			.uml-edge { stroke: var(--uml-edge, #334155); stroke-width: 1.5; fill: none; }
			.uml-edge-dashed { stroke: var(--uml-edge, #334155); stroke-width: 1.4; stroke-dasharray: 5 4; fill: none; }
			.uml-edge-label { font-size: 10.5px; fill: var(--uml-ink, #1e293b); font-weight: 500; }
			.uml-edge-pill { fill: var(--uml-canvas, #fcfbf8); fill-opacity: 0.92; }
			.uml-waveform { stroke: var(--uml-accent, #1d4ed8); stroke-width: 2.2; fill: none; }
			.uml-grid-line { stroke: var(--uml-grid, #cbd5e1); stroke-width: 1; stroke-dasharray: 3 3; }
		</style>
		<marker id="uml-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="#334155" stroke-width="1.6" />
		</marker>
		<marker id="uml-solid-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<polygon points="1,1.5 9,5 1,8.5" fill="#334155" />
		</marker>
		<marker id="uml-inherit" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
			<polygon points="1,1.5 11,6 1,10.5" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
		</marker>
		<marker id="uml-extension" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
			<polygon points="1,1.5 11,6 1,10.5" fill="#0f172a" stroke="#0f172a" stroke-width="1.2" />
		</marker>
		<marker id="uml-composition" viewBox="0 0 14 10" refX="1" refY="5" markerWidth="10" markerHeight="8" orient="auto">
			<polygon points="1,5 7,1.5 13,5 7,8.5" fill="#334155" stroke="#334155" stroke-width="1.2" />
		</marker>
		<marker id="uml-aggregation" viewBox="0 0 14 10" refX="1" refY="5" markerWidth="10" markerHeight="8" orient="auto">
			<polygon points="1,5 7,1.5 13,5 7,8.5" fill="#ffffff" stroke="#334155" stroke-width="1.4" />
		</marker>
	</defs>`;
}

interface BoxPosition {
	x: number;
	y: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
}

function connectBoxesEdge(
	from: BoxPosition,
	to: BoxPosition
): { x1: number; y1: number; x2: number; y2: number; mx: number; my: number } {
	const dx = to.cx - from.cx;
	const dy = to.cy - from.cy;

	let x1: number;
	let y1: number;
	let x2: number;
	let y2: number;

	if (Math.abs(dx) > Math.abs(dy) * 1.15) {
		if (dx >= 0) {
			x1 = from.x + from.w;
			x2 = to.x;
		} else {
			x1 = from.x;
			x2 = to.x + to.w;
		}
		y1 = from.cy;
		y2 = to.cy;
	} else {
		if (dy >= 0) {
			y1 = from.y + from.h;
			y2 = to.y;
		} else {
			y1 = from.y;
			y2 = to.y + to.h;
		}
		x1 = from.cx;
		x2 = to.cx;
	}

	return {
		x1,
		y1,
		x2,
		y2,
		mx: (x1 + x2) / 2,
		my: (y1 + y2) / 2
	};
}

function renderEdgeSvg(
	rel: ParsedUmlRelation,
	fromBox: BoxPosition,
	toBox: BoxPosition,
	idx: number
): string {
	const pts = connectBoxesEdge(fromBox, toBox);
	const isDashed =
		rel.kind === 'dependency' ||
		rel.kind === 'realization' ||
		rel.kind === 'return-message' ||
		rel.arrow.includes('..');

	let markerEnd = 'url(#uml-arrow)';
	let markerStart = '';
	if (rel.kind === 'inheritance' || rel.kind === 'realization') {
		markerEnd = 'url(#uml-inherit)';
	} else if (rel.kind === 'extension') {
		markerEnd = 'url(#uml-extension)';
	} else if (rel.kind === 'composition') {
		markerStart = 'url(#uml-composition)';
	} else if (rel.kind === 'aggregation') {
		markerStart = 'url(#uml-aggregation)';
	} else if (rel.kind === 'link' || rel.kind === 'lollipop') {
		markerEnd = '';
	}

	const labelParts: string[] = [];
	if (rel.stereotype) labelParts.push(`«${rel.stereotype}»`);
	if (rel.label) labelParts.push(rel.label);
	const fullLabel = labelParts.join(' ');

	const offsetY = idx % 2 === 0 ? -10 : 12;
	const labelX = pts.mx;
	const labelY = pts.my + offsetY;
	const pillW = Math.min(220, Math.max(44, fullLabel.length * 6.2 + 12));

	return `
		<g class="uml-relation" data-from="${escapeXml(rel.from)}" data-to="${escapeXml(rel.to)}">
			<line
				x1="${pts.x1.toFixed(1)}"
				y1="${pts.y1.toFixed(1)}"
				x2="${pts.x2.toFixed(1)}"
				y2="${pts.y2.toFixed(1)}"
				class="${isDashed ? 'uml-edge-dashed' : 'uml-edge'}"
				${markerStart ? `marker-start="${markerStart}"` : ''}
				${markerEnd ? `marker-end="${markerEnd}"` : ''}
			/>
			${
				rel.fromMultiplicity
					? `<text x="${(pts.x1 + (pts.x2 - pts.x1) * 0.14).toFixed(1)}" y="${(pts.y1 + (pts.y2 - pts.y1) * 0.14 - 6).toFixed(1)}" class="uml-stereo" text-anchor="middle">${escapeXml(rel.fromMultiplicity)}</text>`
					: ''
			}
			${
				rel.toMultiplicity
					? `<text x="${(pts.x1 + (pts.x2 - pts.x1) * 0.86).toFixed(1)}" y="${(pts.y1 + (pts.y2 - pts.y1) * 0.86 - 6).toFixed(1)}" class="uml-stereo" text-anchor="middle">${escapeXml(rel.toMultiplicity)}</text>`
					: ''
			}
			${
				fullLabel
					? `<rect x="${(labelX - pillW / 2).toFixed(1)}" y="${(labelY - 11).toFixed(1)}" width="${pillW.toFixed(1)}" height="16" rx="4" class="uml-edge-pill" />
					   <text x="${labelX.toFixed(1)}" y="${(labelY + 1).toFixed(1)}" class="uml-edge-label" text-anchor="middle">${escapeXml(fullLabel.slice(0, 38))}</text>`
					: ''
			}
		</g>
	`;
}

function renderClassOrObjectDiagram(
	doc: ParsedPlantUmlDocument,
	diagramType: 'class' | 'object' | 'profile',
	headerHeight: number
): { body: string; width: number; height: number } {
	const topNodes = doc.nodes.filter((n) => n.kind !== 'package' || doc.nodes.length <= 2);
	const nodes = topNodes.length > 0 ? topNodes : doc.nodes;

	const cols = nodes.length <= 2 ? nodes.length || 1 : nodes.length <= 4 ? 2 : 3;
	const colWidth = 260;
	const colGap = 72;
	const rowGap = 64;
	const marginX = 44;
	const startY = headerHeight + (diagramType === 'profile' ? 46 : 24);

	const positions = new Map<string, BoxPosition>();
	const nodeMarkup: string[] = [];

	// If profile diagram, sort metaclasses to row 0 and stereotypes below
	const orderedNodes =
		diagramType === 'profile'
			? [...nodes].sort((a, b) => {
					const aMeta = a.stereotype?.toLowerCase().includes('metaclass') ? 0 : 1;
					const bMeta = b.stereotype?.toLowerCase().includes('metaclass') ? 0 : 1;
					return aMeta - bMeta;
				})
			: nodes;

	let maxRowBottom = startY + 140;
	const rowHeights: number[] = [];

	orderedNodes.forEach((node, idx) => {
		const row = Math.floor(idx / cols);
		const memberCount =
			diagramType === 'object'
				? Math.max(1, node.slots.length + node.attributes.length)
				: Math.max(1, node.attributes.length) + Math.max(1, node.operations.length);
		const boxH = Math.max(96, 54 + memberCount * 18);
		rowHeights[row] = Math.max(rowHeights[row] ?? 0, boxH);
	});

	orderedNodes.forEach((node, idx) => {
		const col = idx % cols;
		const row = Math.floor(idx / cols);
		const priorRowsHeight = rowHeights.slice(0, row).reduce((acc, h) => acc + h + rowGap, 0);
		const x = marginX + col * (colWidth + colGap);
		const y = startY + priorRowsHeight;
		const w = colWidth;

		const attrs =
			diagramType === 'object' && node.slots.length > 0
				? node.slots.map((s) => `${s.key} = "${s.value}"`)
				: node.attributes.length > 0
					? node.attributes
					: node.descriptionLines;
		const ops = diagramType === 'object' ? [] : node.operations;

		const headerH = node.stereotype ? 42 : 30;
		const attrSectionH = Math.max(24, attrs.length * 18 + 8);
		const opSectionH = diagramType === 'object' ? 0 : Math.max(22, ops.length * 18 + 8);
		const h = headerH + attrSectionH + opSectionH;

		positions.set(node.id, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
		maxRowBottom = Math.max(maxRowBottom, y + h);

		const isObject = diagramType === 'object' || node.kind === 'object';
		const displayHeader =
			isObject && !node.label.includes(':') ? `${node.id} : ${node.label}` : node.label;

		nodeMarkup.push(`
			<g class="uml-classifier" data-node-id="${escapeXml(node.id)}">
				<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="uml-frame" />
				<rect x="${x}" y="${y}" width="${w}" height="${headerH}" rx="6" class="uml-header-band" />
				${
					node.stereotype
						? `<text x="${x + w / 2}" y="${y + 15}" class="uml-stereo" text-anchor="middle">«${escapeXml(node.stereotype)}»</text>`
						: ''
				}
				<text
					x="${x + w / 2}"
					y="${y + (node.stereotype ? 32 : 20)}"
					class="uml-name"
					text-anchor="middle"
					${isObject ? 'text-decoration="underline"' : ''}
				>${escapeXml(displayHeader.slice(0, 32))}</text>
				<line x1="${x}" y1="${y + headerH}" x2="${x + w}" y2="${y + headerH}" class="uml-edge" />
				${attrs
					.slice(0, 6)
					.map(
						(attr, aIdx) =>
							`<text x="${x + 10}" y="${y + headerH + 16 + aIdx * 18}" class="uml-member">${escapeXml(attr.slice(0, 34))}</text>`
					)
					.join('')}
				${
					diagramType !== 'object'
						? `<line x1="${x}" y1="${y + headerH + attrSectionH}" x2="${x + w}" y2="${y + headerH + attrSectionH}" class="uml-edge" />
						   ${ops
									.slice(0, 5)
									.map(
										(op, oIdx) =>
											`<text x="${x + 10}" y="${y + headerH + attrSectionH + 16 + oIdx * 18}" class="uml-member">${escapeXml(op.slice(0, 34))}</text>`
									)
									.join('')}`
						: ''
				}
			</g>
		`);
	});

	const edgeMarkup = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	let notesHeight = 0;
	let notesMarkup = '';
	if (doc.notes.length > 0) {
		const noteY = maxRowBottom + 24;
		notesHeight = 58;
		notesMarkup = doc.notes
			.slice(0, 2)
			.map((note, idx) => {
				const nx = marginX + idx * 340;
				return `
					<g class="uml-note-group">
						<rect x="${nx}" y="${noteY}" width="320" height="42" rx="4" class="uml-note" />
						<text x="${nx + 12}" y="${noteY + 17}" class="uml-stereo">{constraint / note}</text>
						<text x="${nx + 12}" y="${noteY + 32}" class="uml-member">${escapeXml(note.text.slice(0, 46))}</text>
					</g>
				`;
			})
			.join('');
	}

	const totalW = Math.max(680, marginX * 2 + cols * colWidth + (cols - 1) * colGap + 24);
	const totalH = maxRowBottom + notesHeight + 48;

	let profileOuterFrame = '';
	if (diagramType === 'profile') {
		const pkgNode = doc.nodes.find((n) => n.kind === 'package');
		const profileName = pkgNode?.label || doc.title || 'Domain Profile';
		profileOuterFrame = `
			<g class="uml-profile-container">
				<path d="M 24 ${headerHeight + 6} L 190 ${headerHeight + 6} L 204 ${headerHeight + 28} L 24 ${headerHeight + 28} Z" class="uml-pkg-tab" />
				<text x="34" y="${headerHeight + 21}" class="uml-subtitle">«profile» ${escapeXml(profileName.slice(0, 24))}</text>
				<rect x="24" y="${headerHeight + 28}" width="${totalW - 48}" height="${totalH - headerHeight - 44}" rx="6" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="6 4" />
			</g>
		`;
	}

	return {
		body: `${profileOuterFrame}${edgeMarkup}${nodeMarkup.join('')}${notesMarkup}`,
		width: totalW,
		height: totalH
	};
}

function renderPackageDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	let packages = doc.nodes.filter((n) => n.kind === 'package');
	if (packages.length === 0) {
		packages = doc.nodes.slice(0, 6);
	}
	const childrenByPkg = new Map<string, ParsedUmlNode[]>();
	for (const node of doc.nodes) {
		if (node.parentId) {
			const list = childrenByPkg.get(node.parentId) ?? [];
			list.push(node);
			childrenByPkg.set(node.parentId, list);
		}
	}

	const cols = packages.length <= 2 ? packages.length || 1 : 2;
	const pkgW = 300;
	const colGap = 80;
	const rowGap = 64;
	const marginX = 48;
	const startY = headerHeight + 28;

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];
	let maxBottom = startY + 160;

	packages.forEach((pkg, idx) => {
		const col = idx % cols;
		const row = Math.floor(idx / cols);
		const children = childrenByPkg.get(pkg.id) ?? [];
		const memberNames =
			children.length > 0
				? children.map((c) => c.label)
				: pkg.attributes.length > 0
					? pkg.attributes
					: ['Core classifiers'];
		const pkgH = Math.max(124, 58 + memberNames.length * 28);
		const x = marginX + col * (pkgW + colGap);
		const y = startY + row * (164 + rowGap);

		positions.set(pkg.id, {
			x,
			y: y + 22,
			w: pkgW,
			h: pkgH,
			cx: x + pkgW / 2,
			cy: y + 22 + pkgH / 2
		});
		for (const child of children) {
			positions.set(child.id, {
				x,
				y: y + 22,
				w: pkgW,
				h: pkgH,
				cx: x + pkgW / 2,
				cy: y + 22 + pkgH / 2
			});
		}
		maxBottom = Math.max(maxBottom, y + 22 + pkgH);

		markup.push(`
			<g class="uml-package" data-node-id="${escapeXml(pkg.id)}">
				<path d="M ${x} ${y} L ${x + 150} ${y} L ${x + 164} ${y + 22} L ${x} ${y + 22} Z" class="uml-pkg-tab" />
				<text x="${x + 10}" y="${y + 15}" class="uml-subtitle">${escapeXml(pkg.label.slice(0, 22))}</text>
				<rect x="${x}" y="${y + 22}" width="${pkgW}" height="${pkgH}" rx="5" class="uml-frame" />
				${
					pkg.stereotype
						? `<text x="${x + pkgW / 2}" y="${y + 40}" class="uml-stereo" text-anchor="middle">«${escapeXml(pkg.stereotype)}»</text>`
						: ''
				}
				${memberNames
					.slice(0, 4)
					.map(
						(member, mIdx) => `
						<rect x="${x + 18}" y="${y + 46 + mIdx * 28}" width="${pkgW - 36}" height="22" rx="4" class="uml-header-band" />
						<text x="${x + 28}" y="${y + 61 + mIdx * 28}" class="uml-member">${escapeXml(member.slice(0, 32))}</text>
					`
					)
					.join('')}
			</g>
		`);
	});

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox || fromBox === toBox) return '';
			return renderEdgeSvg({ ...rel, kind: 'dependency' }, fromBox, toBox, idx);
		})
		.join('');

	const totalW = Math.max(720, marginX * 2 + cols * pkgW + (cols - 1) * colGap);
	return {
		body: `${edges}${markup.join('')}`,
		width: totalW,
		height: maxBottom + 44
	};
}

function renderComponentDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const interfaces = doc.nodes.filter((n) => n.kind === 'interface');
	const components = doc.nodes.filter((n) => n.kind !== 'interface');

	const cols = components.length <= 2 ? components.length || 1 : 2;
	const compW = 240;
	const compH = 86;
	const colGap = 130;
	const rowGap = 78;
	const marginX = 56;
	const startY = headerHeight + 30;

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];
	let maxBottom = startY + 140;

	components.forEach((comp, idx) => {
		const col = idx % cols;
		const row = Math.floor(idx / cols);
		const x = marginX + col * (compW + colGap);
		const y = startY + row * (compH + rowGap);

		positions.set(comp.id, { x, y, w: compW, h: compH, cx: x + compW / 2, cy: y + compH / 2 });
		maxBottom = Math.max(maxBottom, y + compH);

		// Component box with UML component icon on top-right
		const iconX = x + compW - 28;
		const iconY = y + 10;
		markup.push(`
			<g class="uml-component" data-node-id="${escapeXml(comp.id)}">
				<rect x="${x}" y="${y}" width="${compW}" height="${compH}" rx="6" class="uml-frame" />
				<rect x="${iconX}" y="${iconY}" width="16" height="20" rx="2" class="uml-header-band" />
				<rect x="${iconX - 5}" y="${iconY + 3}" width="9" height="5" rx="1" class="uml-pkg-tab" />
				<rect x="${iconX - 5}" y="${iconY + 11}" width="9" height="5" rx="1" class="uml-pkg-tab" />
				<text x="${x + compW / 2 - 8}" y="${y + 26}" class="uml-stereo" text-anchor="middle">«${escapeXml(comp.stereotype || 'component')}»</text>
				<text x="${x + compW / 2 - 8}" y="${y + 48}" class="uml-name" text-anchor="middle">${escapeXml(comp.label.slice(0, 26))}</text>
				${
					comp.attributes[0]
						? `<text x="${x + compW / 2}" y="${y + 68}" class="uml-member" text-anchor="middle">${escapeXml(comp.attributes[0].slice(0, 30))}</text>`
						: ''
				}
			</g>
		`);
	});

	// Place interfaces in between or below components as lollipops/sockets
	interfaces.forEach((iface, idx) => {
		const row = Math.floor(idx / 2);
		const cx = marginX + compW + colGap / 2 + (idx % 2 === 0 ? 0 : 34);
		const cy = startY + 42 + row * (compH + rowGap);
		positions.set(iface.id, { x: cx - 10, y: cy - 10, w: 20, h: 20, cx, cy });
		maxBottom = Math.max(maxBottom, cy + 40);

		markup.push(`
			<g class="uml-interface" data-node-id="${escapeXml(iface.id)}">
				<circle cx="${cx}" cy="${cy}" r="8" class="uml-frame" />
				<path d="M ${cx - 12} ${cy - 10} A 13 13 0 0 1 ${cx - 12} ${cy + 10}" fill="none" stroke="#334155" stroke-width="1.5" />
				<text x="${cx}" y="${cy + 23}" class="uml-edge-label" text-anchor="middle">${escapeXml(iface.label.slice(0, 24))}</text>
			</g>
		`);
	});

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	const totalW = Math.max(720, marginX * 2 + cols * compW + (cols - 1) * colGap);
	return {
		body: `${edges}${markup.join('')}`,
		width: totalW,
		height: maxBottom + 48
	};
}

function renderCompositeStructureDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const portsIn = doc.nodes.filter((n) => n.kind === 'portin');
	const portsOut = doc.nodes.filter((n) => n.kind === 'portout');
	const containers = doc.nodes.filter(
		(n) => !n.parentId && n.kind !== 'portin' && n.kind !== 'portout'
	);
	const enclosing = containers[0];
	const parts = doc.nodes.filter(
		(n) => n.id !== enclosing?.id && n.kind !== 'portin' && n.kind !== 'portout'
	);
	const displayParts = parts.length > 0 ? parts : containers;

	const frameX = 88;
	const frameY = headerHeight + 24;
	const frameW = 580;
	const rows = Math.max(1, Math.ceil(displayParts.length / 2));
	const frameH = Math.max(220, 86 + rows * 108);

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];

	// Outer enclosing classifier frame
	const enclosingTitle = enclosing?.label || doc.title || 'Composite System Classifier';
	markup.push(`
		<g class="uml-composite-frame">
			<rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="8" class="uml-frame" />
			<rect x="${frameX}" y="${frameY}" width="${frameW}" height="38" rx="8" class="uml-header-band" />
			<text x="${frameX + frameW / 2}" y="${frameY + 15}" class="uml-stereo" text-anchor="middle">«composite structure»</text>
			<text x="${frameX + frameW / 2}" y="${frameY + 31}" class="uml-name" text-anchor="middle">${escapeXml(enclosingTitle.slice(0, 42))}</text>
		</g>
	`);

	// Left boundary ports (portin)
	const effectivePortsIn =
		portsIn.length > 0
			? portsIn
			: [
					{
						id: '__port_in__',
						label: 'ingressPort',
						kind: 'portin' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					}
				];

	effectivePortsIn.forEach((port, idx) => {
		const py = frameY + 74 + idx * 72;
		const px = frameX - 9;
		positions.set(port.id, { x: px, y: py, w: 18, h: 18, cx: px + 9, cy: py + 9 });
		markup.push(`
			<g class="uml-port" data-node-id="${escapeXml(port.id)}">
				<rect x="${px}" y="${py}" width="18" height="18" class="uml-accent-box" />
				<text x="${px - 8}" y="${py + 13}" class="uml-edge-label" text-anchor="end">${escapeXml(port.label.slice(0, 18))}</text>
			</g>
		`);
	});

	// Right boundary ports (portout)
	const effectivePortsOut =
		portsOut.length > 0
			? portsOut
			: [
					{
						id: '__port_out__',
						label: 'egressPort',
						kind: 'portout' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					}
				];

	effectivePortsOut.forEach((port, idx) => {
		const py = frameY + 74 + idx * 72;
		const px = frameX + frameW - 9;
		positions.set(port.id, { x: px, y: py, w: 18, h: 18, cx: px + 9, cy: py + 9 });
		markup.push(`
			<g class="uml-port" data-node-id="${escapeXml(port.id)}">
				<rect x="${px}" y="${py}" width="18" height="18" class="uml-accent-box" />
				<text x="${px + 26}" y="${py + 13}" class="uml-edge-label" text-anchor="start">${escapeXml(port.label.slice(0, 18))}</text>
			</g>
		`);
	});

	// Internal parts
	displayParts.forEach((part, idx) => {
		const col = idx % 2;
		const row = Math.floor(idx / 2);
		const pw = 216;
		const ph = 68;
		const px = frameX + 44 + col * (pw + 60);
		const py = frameY + 62 + row * 102;
		positions.set(part.id, { x: px, y: py, w: pw, h: ph, cx: px + pw / 2, cy: py + ph / 2 });

		const partLabel = part.label.includes(':') ? part.label : `${part.id} : ${part.label} [1]`;
		markup.push(`
			<g class="uml-internal-part" data-node-id="${escapeXml(part.id)}">
				<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="5" class="uml-accent-box" />
				<text x="${px + pw / 2}" y="${py + 22}" class="uml-stereo" text-anchor="middle">«${escapeXml(part.stereotype || 'part')}»</text>
				<text x="${px + pw / 2}" y="${py + 44}" class="uml-name" text-anchor="middle">${escapeXml(partLabel.slice(0, 28))}</text>
			</g>
		`);
	});

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	return {
		body: `${markup.join('')}${edges}`,
		width: frameX * 2 + frameW + 80,
		height: frameY + frameH + 44
	};
}

function renderDeploymentDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const topNodes = doc.nodes.filter((n) => !n.parentId && n.kind !== 'artifact');
	const execNodes = topNodes.length > 0 ? topNodes : doc.nodes;
	const artifactsByParent = new Map<string, ParsedUmlNode[]>();

	for (const node of doc.nodes) {
		if (node.parentId) {
			const list = artifactsByParent.get(node.parentId) ?? [];
			list.push(node);
			artifactsByParent.set(node.parentId, list);
		}
	}

	const cols = execNodes.length <= 2 ? execNodes.length || 1 : 2;
	const nodeW = 290;
	const colGap = 86;
	const rowGap = 72;
	const marginX = 52;
	const startY = headerHeight + 34;

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];
	let maxBottom = startY + 160;

	execNodes.forEach((execNode, idx) => {
		const col = idx % cols;
		const row = Math.floor(idx / cols);
		const children = artifactsByParent.get(execNode.id) ?? [];
		const artifactNames =
			children.length > 0
				? children.map((c) => c.label)
				: execNode.attributes.length > 0
					? execNode.attributes
					: [`${execNode.label.toLowerCase().replace(/\s+/g, '-')}.artifact`];
		const nodeH = Math.max(120, 58 + artifactNames.length * 32);
		const x = marginX + col * (nodeW + colGap);
		const y = startY + row * (154 + rowGap);
		const depth = 12;

		positions.set(execNode.id, { x, y, w: nodeW, h: nodeH, cx: x + nodeW / 2, cy: y + nodeH / 2 });
		for (const child of children) {
			positions.set(child.id, { x, y, w: nodeW, h: nodeH, cx: x + nodeW / 2, cy: y + nodeH / 2 });
		}
		maxBottom = Math.max(maxBottom, y + nodeH);

		// 3D cube bevel polygons + deployed artifacts
		markup.push(`
			<g class="uml-deployment-node" data-node-id="${escapeXml(execNode.id)}">
				<polygon points="${x},${y} ${x + depth},${y - depth} ${x + nodeW + depth},${y - depth} ${x + nodeW},${y}" class="uml-node-3d-top" />
				<polygon points="${x + nodeW},${y} ${x + nodeW + depth},${y - depth} ${x + nodeW + depth},${y + nodeH - depth} ${x + nodeW},${y + nodeH}" class="uml-node-3d-side" />
				<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" class="uml-frame" />
				<text x="${x + nodeW / 2}" y="${y + 18}" class="uml-stereo" text-anchor="middle">«${escapeXml(execNode.stereotype || execNode.kind || 'node')}»</text>
				<text x="${x + nodeW / 2}" y="${y + 36}" class="uml-name" text-anchor="middle" text-decoration="underline">${escapeXml(execNode.label.slice(0, 28))}</text>
				${artifactNames
					.slice(0, 3)
					.map((art, aIdx) => {
						const ay = y + 48 + aIdx * 32;
						return `
							<rect x="${x + 18}" y="${ay}" width="${nodeW - 36}" height="24" rx="4" class="uml-header-band" />
							<text x="${x + 28}" y="${ay + 16}" class="uml-member">📄 «artifact» ${escapeXml(art.slice(0, 26))}</text>
						`;
					})
					.join('')}
			</g>
		`);
	});

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox || fromBox === toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	const totalW = Math.max(720, marginX * 2 + cols * nodeW + (cols - 1) * colGap + 30);
	return {
		body: `${edges}${markup.join('')}`,
		width: totalW,
		height: maxBottom + 48
	};
}

function renderUseCaseDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const actors = doc.nodes.filter((n) => n.kind === 'actor');
	const boundaryNode = doc.nodes.find((n) => n.kind === 'rectangle' || n.kind === 'package');
	const useCases = doc.nodes.filter(
		(n) => n.kind === 'usecase' || (n.kind !== 'actor' && n.id !== boundaryNode?.id)
	);

	const effectiveActors =
		actors.length > 0
			? actors
			: [
					{
						id: 'Reader',
						label: 'Primary Actor',
						kind: 'actor' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					}
				];

	const boundaryX = 210;
	const boundaryY = headerHeight + 24;
	const boundaryW = 420;
	const ucGapY = 66;
	const boundaryH = Math.max(220, 68 + useCases.length * ucGapY);

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];

	// System boundary box
	const boundaryTitle = boundaryNode?.label || doc.title || 'Subject System Boundary';
	markup.push(`
		<g class="uml-system-boundary">
			<rect x="${boundaryX}" y="${boundaryY}" width="${boundaryW}" height="${boundaryH}" rx="8" class="uml-frame" />
			<rect x="${boundaryX}" y="${boundaryY}" width="${boundaryW}" height="32" rx="8" class="uml-header-band" />
			<text x="${boundaryX + boundaryW / 2}" y="${boundaryY + 21}" class="uml-name" text-anchor="middle">${escapeXml(boundaryTitle.slice(0, 38))}</text>
		</g>
	`);

	// Actors (stick figures) on left/right
	effectiveActors.forEach((actor, idx) => {
		const isRight = idx >= 2 && idx % 2 === 1;
		const ax = isRight ? boundaryX + boundaryW + 96 : 86;
		const ay = boundaryY + 64 + (isRight ? Math.floor((idx - 1) / 2) : idx) * 105;

		positions.set(actor.id, { x: ax - 24, y: ay - 22, w: 48, h: 68, cx: ax, cy: ay + 8 });

		markup.push(`
			<g class="uml-actor" data-node-id="${escapeXml(actor.id)}">
				<circle cx="${ax}" cy="${ay - 12}" r="10" class="uml-frame" />
				<line x1="${ax}" y1="${ay - 2}" x2="${ax}" y2="${ay + 22}" class="uml-edge" />
				<line x1="${ax - 16}" y1="${ay + 7}" x2="${ax + 16}" y2="${ay + 7}" class="uml-edge" />
				<line x1="${ax}" y1="${ay + 22}" x2="${ax - 14}" y2="${ay + 40}" class="uml-edge" />
				<line x1="${ax}" y1="${ay + 22}" x2="${ax + 14}" y2="${ay + 40}" class="uml-edge" />
				<text x="${ax}" y="${ay + 56}" class="uml-name" text-anchor="middle">${escapeXml(actor.label.slice(0, 22))}</text>
			</g>
		`);
	});

	// Use case ovals inside boundary
	useCases.forEach((uc, idx) => {
		const cx = boundaryX + boundaryW / 2;
		const cy = boundaryY + 72 + idx * ucGapY;
		const rx = 148;
		const ry = 24;
		positions.set(uc.id, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, cx, cy });

		markup.push(`
			<g class="uml-usecase" data-node-id="${escapeXml(uc.id)}">
				<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="uml-accent-box" />
				<text x="${cx}" y="${cy + 4}" class="uml-name" text-anchor="middle">${escapeXml(uc.label.slice(0, 34))}</text>
			</g>
		`);
	});

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox = positions.get(rel.from);
			const toBox = positions.get(rel.to);
			if (!fromBox || !toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	const hasRightActors = effectiveActors.length >= 3;
	const totalW = hasRightActors ? boundaryX + boundaryW + 190 : boundaryX + boundaryW + 64;
	return {
		body: `${markup.join('')}${edges}`,
		width: totalW,
		height: boundaryY + boundaryH + 48
	};
}

function renderActivityOrOverviewDiagram(
	doc: ParsedPlantUmlDocument,
	isOverview: boolean,
	headerHeight: number
): { body: string; width: number; height: number } {
	const items: ParsedActivityNode[] =
		doc.activityNodes.length > 0
			? doc.activityNodes
			: doc.nodes.map((n, i) => ({
					id: n.id || `step-${i}`,
					kind: isOverview ? 'ref-frame' : 'action',
					label: n.label,
					yesActions: [],
					noActions: [],
					forkBranches: [],
					subLines: n.descriptionLines
				}));

	const centerX = 370;
	let cursorY = headerHeight + 28;
	const markup: string[] = [];

	const drawArrowDown = (y1: number, y2: number, x = centerX, label?: string) => {
		markup.push(`
			<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="uml-edge" marker-end="url(#uml-arrow)" />
			${
				label
					? `<text x="${x + 8}" y="${(y1 + y2) / 2 + 3}" class="uml-edge-label">${escapeXml(label)}</text>`
					: ''
			}
		`);
	};

	items.forEach((item, idx) => {
		if (item.kind === 'start') {
			markup.push(`<circle cx="${centerX}" cy="${cursorY + 10}" r="10" fill="#0f172a" />`);
			if (idx < items.length - 1) {
				drawArrowDown(cursorY + 20, cursorY + 44);
			}
			cursorY += 44;
			return;
		}

		if (item.kind === 'stop') {
			markup.push(`
				<circle cx="${centerX}" cy="${cursorY + 12}" r="12" fill="none" stroke="#0f172a" stroke-width="2" />
				<circle cx="${centerX}" cy="${cursorY + 12}" r="7" fill="#0f172a" />
			`);
			cursorY += 36;
			return;
		}

		if (item.kind === 'decision') {
			const dw = 190;
			const dh = 48;
			const midY = cursorY + dh / 2;
			markup.push(`
				<g class="uml-decision">
					<polygon points="${centerX},${cursorY} ${centerX + dw / 2},${midY} ${centerX},${cursorY + dh} ${centerX - dw / 2},${midY}" class="uml-header-band" />
					<text x="${centerX}" y="${midY + 4}" class="uml-edge-label" text-anchor="middle">${escapeXml(item.label.slice(0, 26))}</text>
				</g>
			`);

			const branchY = cursorY + dh + 24;
			const leftX = centerX - 165;
			const rightX = centerX + 165;
			const yesText = item.yesActions[0] || 'Proceed primary path';
			const noText = item.noActions[0] || 'Alternative handling';

			markup.push(`
				<polyline points="${centerX - dw / 2},${midY} ${leftX},${midY} ${leftX},${branchY}" class="uml-edge" marker-end="url(#uml-arrow)" />
				<text x="${centerX - dw / 2 - 28}" y="${midY - 6}" class="uml-stereo">[${escapeXml(item.yesLabel || 'yes')}]</text>
				<rect x="${leftX - 115}" y="${branchY}" width="230" height="44" rx="${isOverview ? 4 : 18}" class="uml-frame" />
				<text x="${leftX}" y="${branchY + 26}" class="uml-name" text-anchor="middle">${escapeXml(yesText.slice(0, 28))}</text>

				<polyline points="${centerX + dw / 2},${midY} ${rightX},${midY} ${rightX},${branchY}" class="uml-edge" marker-end="url(#uml-arrow)" />
				<text x="${centerX + dw / 2 + 8}" y="${midY - 6}" class="uml-stereo">[${escapeXml(item.noLabel || 'no')}]</text>
				<rect x="${rightX - 115}" y="${branchY}" width="230" height="44" rx="${isOverview ? 4 : 18}" class="uml-frame" />
				<text x="${rightX}" y="${branchY + 26}" class="uml-name" text-anchor="middle">${escapeXml(noText.slice(0, 28))}</text>

				<polyline points="${leftX},${branchY + 44} ${leftX},${branchY + 68} ${centerX},${branchY + 68}" class="uml-edge" />
				<polyline points="${rightX},${branchY + 44} ${rightX},${branchY + 68} ${centerX},${branchY + 68}" class="uml-edge" />
			`);

			cursorY = branchY + 68;
			if (idx < items.length - 1) {
				drawArrowDown(cursorY, cursorY + 24);
				cursorY += 24;
			}
			return;
		}

		if (item.kind === 'fork') {
			const barW = 380;
			markup.push(
				`<rect x="${centerX - barW / 2}" y="${cursorY}" width="${barW}" height="6" rx="2" fill="#0f172a" />`
			);
			const branches = item.forkBranches.filter((b) => b.length > 0);
			const displayBranches =
				branches.length >= 2 ? branches.slice(0, 2) : [['Parallel Track A'], ['Parallel Track B']];
			const branchY = cursorY + 26;

			displayBranches.forEach((b, bIdx) => {
				const bx = bIdx === 0 ? centerX - 140 : centerX + 140;
				drawArrowDown(cursorY + 6, branchY, bx);
				markup.push(`
					<rect x="${bx - 115}" y="${branchY}" width="230" height="44" rx="16" class="uml-accent-box" />
					<text x="${bx}" y="${branchY + 26}" class="uml-name" text-anchor="middle">${escapeXml((b[0] || 'Task').slice(0, 28))}</text>
				`);
				drawArrowDown(branchY + 44, branchY + 68, bx);
			});

			markup.push(
				`<rect x="${centerX - barW / 2}" y="${branchY + 68}" width="${barW}" height="6" rx="2" fill="#0f172a" />`
			);
			cursorY = branchY + 74;
			if (idx < items.length - 1) {
				drawArrowDown(cursorY, cursorY + 24);
				cursorY += 24;
			}
			return;
		}

		// Standard action pill OR Interaction Overview `ref`/`sd` frame
		if (isOverview || item.kind === 'ref-frame') {
			const fw = 380;
			const subLines =
				item.subLines.length > 0 ? item.subLines.slice(0, 2) : ['lifelines exchange messages'];
			const fh = 52 + subLines.length * 18;
			const fx = centerX - fw / 2;
			const tag = item.stereotype || (/^sd\b/i.test(item.label) ? 'sd' : 'ref');
			const cleanTitle = item.label.replace(/^(ref|sd)\s*:\s*/i, '');

			markup.push(`
				<g class="uml-interaction-use-frame">
					<rect x="${fx}" y="${cursorY}" width="${fw}" height="${fh}" rx="4" class="uml-frame" />
					<polygon points="${fx},${cursorY} ${fx + 44},${cursorY} ${fx + 44},${cursorY + 14} ${fx + 34},${cursorY + 22} ${fx},${cursorY + 22}" class="uml-pkg-tab" />
					<text x="${fx + 8}" y="${cursorY + 15}" class="uml-subtitle">${escapeXml(tag)}</text>
					<text x="${fx + 56}" y="${cursorY + 17}" class="uml-name">${escapeXml(cleanTitle.slice(0, 38))}</text>
					<line x1="${fx}" y1="${cursorY + 24}" x2="${fx + fw}" y2="${cursorY + 24}" class="uml-edge" />
					${subLines
						.map(
							(line, lIdx) =>
								`<text x="${fx + 16}" y="${cursorY + 42 + lIdx * 18}" class="uml-member">${escapeXml(line.slice(0, 46))}</text>`
						)
						.join('')}
				</g>
			`);
			cursorY += fh;
		} else {
			const aw = 340;
			const lines = wrapText(item.label, 38, 2);
			const ah = 34 + (lines.length - 1) * 16;
			const ax = centerX - aw / 2;

			markup.push(`
				<g class="uml-action-node">
					<rect x="${ax}" y="${cursorY}" width="${aw}" height="${ah}" rx="18" class="uml-accent-box" />
					${
						item.partition
							? `<text x="${ax + 14}" y="${cursorY - 5}" class="uml-stereo">[${escapeXml(item.partition.slice(0, 24))}]</text>`
							: ''
					}
					${lines
						.map(
							(line, lIdx) =>
								`<text x="${centerX}" y="${cursorY + 21 + lIdx * 16}" class="uml-name" text-anchor="middle">${escapeXml(line)}</text>`
						)
						.join('')}
				</g>
			`);
			cursorY += ah;
		}

		if (idx < items.length - 1) {
			drawArrowDown(cursorY, cursorY + 26);
			cursorY += 26;
		}
	});

	return {
		body: markup.join(''),
		width: 740,
		height: cursorY + 44
	};
}

function renderStateMachineDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const states = doc.nodes;
	const cols = states.length <= 3 ? 1 : 2;
	const stateW = 280;
	const colGap = 100;
	const rowGap = 62;
	const marginX = cols === 1 ? 210 : 64;
	const startY = headerHeight + 56;

	const positions = new Map<string, BoxPosition>();
	const markup: string[] = [];
	let maxBottom = startY + 120;

	// Initial pseudostate [*]
	const initX = marginX + stateW / 2;
	const initY = headerHeight + 22;
	positions.set('[*]', { x: initX - 10, y: initY - 10, w: 20, h: 20, cx: initX, cy: initY });
	markup.push(`<circle cx="${initX}" cy="${initY}" r="9" fill="#0f172a" />`);

	states.forEach((st, idx) => {
		const col = idx % cols;
		const row = Math.floor(idx / cols);
		const details = [...st.descriptionLines, ...st.attributes];
		const sh = Math.max(64, 38 + Math.max(1, details.length) * 18);
		const x = marginX + col * (stateW + colGap);
		const y = startY + row * (86 + rowGap);

		positions.set(st.id, { x, y, w: stateW, h: sh, cx: x + stateW / 2, cy: y + sh / 2 });
		maxBottom = Math.max(maxBottom, y + sh);

		markup.push(`
			<g class="uml-state" data-node-id="${escapeXml(st.id)}">
				<rect x="${x}" y="${y}" width="${stateW}" height="${sh}" rx="14" class="uml-frame" />
				<rect x="${x}" y="${y}" width="${stateW}" height="30" rx="14" class="uml-header-band" />
				<text x="${x + stateW / 2}" y="${y + 20}" class="uml-name" text-anchor="middle">${escapeXml(st.label.slice(0, 30))}</text>
				<line x1="${x}" y1="${y + 30}" x2="${x + stateW}" y2="${y + 30}" class="uml-edge" />
				${(details.length > 0 ? details : ['do / maintain state invariant'])
					.slice(0, 3)
					.map(
						(line, lIdx) =>
							`<text x="${x + 12}" y="${y + 48 + lIdx * 18}" class="uml-member">${escapeXml(line.slice(0, 34))}</text>`
					)
					.join('')}
			</g>
		`);
	});

	// Final pseudostate if any relation targets [*]
	const hasFinal = doc.relations.some((r) => r.to === '[*]');
	const finalY = maxBottom + 36;
	if (hasFinal) {
		markup.push(`
			<circle cx="${initX}" cy="${finalY}" r="11" fill="none" stroke="#0f172a" stroke-width="2" />
			<circle cx="${initX}" cy="${finalY}" r="6" fill="#0f172a" />
		`);
		maxBottom = finalY + 20;
	}

	const edges = doc.relations
		.map((rel, idx) => {
			const fromBox =
				rel.from === '[*]'
					? { x: initX - 9, y: initY - 9, w: 18, h: 18, cx: initX, cy: initY }
					: positions.get(rel.from);
			const toBox =
				rel.to === '[*]'
					? { x: initX - 11, y: finalY - 11, w: 22, h: 22, cx: initX, cy: finalY }
					: positions.get(rel.to);
			if (!fromBox || !toBox) return '';
			return renderEdgeSvg(rel, fromBox, toBox, idx);
		})
		.join('');

	const totalW = Math.max(700, marginX * 2 + cols * stateW + (cols - 1) * colGap);
	return {
		body: `${edges}${markup.join('')}`,
		width: totalW,
		height: maxBottom + 44
	};
}

function renderSequenceDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const participants =
		doc.nodes.length > 0
			? doc.nodes
			: [
					{
						id: 'Source',
						label: 'Initiator',
						kind: 'participant' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					},
					{
						id: 'Target',
						label: 'Responder',
						kind: 'participant' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					}
				];

	const pGap = 185;
	const pW = 144;
	const pH = 40;
	const marginX = 48;
	const topY = headerHeight + 24;
	const msgStartY = topY + pH + 34;
	const msgGap = 44;

	const xById = new Map<string, number>();
	participants.forEach((p, idx) => {
		xById.set(p.id, marginX + pW / 2 + idx * pGap);
	});

	const messages = doc.relations;
	const bottomY = msgStartY + Math.max(1, messages.length) * msgGap + 24;
	const markup: string[] = [];

	// Lifelines & headers
	participants.forEach((p) => {
		const cx = xById.get(p.id) ?? marginX;
		const bx = cx - pW / 2;
		markup.push(`
			<g class="uml-lifeline" data-node-id="${escapeXml(p.id)}">
				<line x1="${cx}" y1="${topY + pH}" x2="${cx}" y2="${bottomY}" class="uml-edge-dashed" />
				<rect x="${bx}" y="${topY}" width="${pW}" height="${pH}" rx="5" class="uml-header-band" />
				<text x="${cx}" y="${topY + 24}" class="uml-name" text-anchor="middle">${escapeXml(p.label.slice(0, 18))}</text>
				<rect x="${cx - 5}" y="${msgStartY - 12}" width="10" height="${Math.max(28, bottomY - msgStartY - 8)}" rx="2" class="uml-accent-box" />
				<rect x="${bx}" y="${bottomY}" width="${pW}" height="${pH - 6}" rx="5" class="uml-header-band" />
				<text x="${cx}" y="${bottomY + 21}" class="uml-subtitle" text-anchor="middle">${escapeXml(p.label.slice(0, 18))}</text>
			</g>
		`);
	});

	// Messages
	messages.forEach((msg, idx) => {
		const y = msgStartY + idx * msgGap;
		const x1 = xById.get(msg.from) ?? marginX + pW / 2;
		const x2 = xById.get(msg.to) ?? marginX + pW / 2 + pGap;
		const isReturn = msg.kind === 'return-message' || msg.arrow.includes('-->');

		if (x1 === x2) {
			// Self message
			markup.push(`
				<path d="M ${x1 + 5} ${y - 6} L ${x1 + 42} ${y - 6} L ${x1 + 42} ${y + 12} L ${x1 + 6} ${y + 12}" class="uml-edge" marker-end="url(#uml-solid-arrow)" />
				<text x="${x1 + 48}" y="${y + 6}" class="uml-edge-label">${escapeXml((msg.label || 'self-check').slice(0, 32))}</text>
			`);
		} else {
			const midX = (x1 + x2) / 2;
			markup.push(`
				<g class="uml-seq-message">
					${
						msg.fragmentLabel
							? `<text x="${Math.min(x1, x2) + 8}" y="${y - 16}" class="uml-stereo">[${escapeXml(msg.fragmentLabel.slice(0, 28))}]</text>`
							: ''
					}
					<line
						x1="${x1}"
						y1="${y}"
						x2="${x2}"
						y2="${y}"
						class="${isReturn ? 'uml-edge-dashed' : 'uml-edge'}"
						marker-end="${isReturn ? 'url(#uml-arrow)' : 'url(#uml-solid-arrow)'}"
					/>
					<rect x="${midX - 95}" y="${y - 16}" width="190" height="14" rx="3" class="uml-edge-pill" />
					<text x="${midX}" y="${y - 5}" class="uml-edge-label" text-anchor="middle">${escapeXml(`${idx + 1}. ${(msg.label || 'message').slice(0, 28)}`)}</text>
				</g>
			`);
		}
	});

	const totalW = Math.max(680, marginX * 2 + participants.length * pGap);
	return {
		body: markup.join(''),
		width: totalW,
		height: bottomY + pH + 36
	};
}

function renderCommunicationDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const participants =
		doc.nodes.length > 0
			? doc.nodes
			: [
					{
						id: 'P1',
						label: ':Initiator',
						kind: 'agent' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					},
					{
						id: 'P2',
						label: ':Coordinator',
						kind: 'agent' as const,
						attributes: [],
						operations: [],
						slots: [],
						descriptionLines: []
					}
				];

	const totalW = 760;
	const totalH = Math.max(410, headerHeight + 340);
	const centerX = totalW / 2;
	const centerY = headerHeight + (totalH - headerHeight) / 2;
	const rx = 225;
	const ry = 115;

	const positions = new Map<string, BoxPosition>();
	const nodeMarkup: string[] = [];

	participants.forEach((p, idx) => {
		const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / Math.max(1, participants.length);
		const cx = participants.length === 1 ? centerX : centerX + Math.cos(angle) * rx;
		const cy = participants.length === 1 ? centerY : centerY + Math.sin(angle) * ry;
		const w = 168;
		const h = 50;
		const x = cx - w / 2;
		const y = cy - h / 2;

		positions.set(p.id, { x, y, w, h, cx, cy });
		const headerLabel = p.label.startsWith(':') ? p.label : `:${p.label}`;

		nodeMarkup.push(`
			<g class="uml-comm-participant" data-node-id="${escapeXml(p.id)}">
				<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="6" class="uml-accent-box" />
				<text x="${cx.toFixed(1)}" y="${(y + 20).toFixed(1)}" class="uml-stereo" text-anchor="middle">«participant»</text>
				<text x="${cx.toFixed(1)}" y="${(y + 38).toFixed(1)}" class="uml-name" text-anchor="middle" text-decoration="underline">${escapeXml(headerLabel.slice(0, 22))}</text>
			</g>
		`);
	});

	// Group messages by undirected participant pair so links show numbered messages along the link
	const pairMessages = new Map<string, { from: string; to: string; labels: string[] }>();
	doc.relations.forEach((rel, idx) => {
		const key = [rel.from, rel.to].sort().join('::');
		const existing = pairMessages.get(key) ?? { from: rel.from, to: rel.to, labels: [] };
		const numbered = /^\d+(\.\d+)*\s*:/.test(rel.label)
			? rel.label
			: `${idx + 1}: ${rel.label || 'exchange()'}`;
		existing.labels.push(`${numbered} →`);
		pairMessages.set(key, existing);
	});

	const linkMarkup: string[] = [];
	let pairIdx = 0;
	for (const [, group] of pairMessages.entries()) {
		const fromBox = positions.get(group.from);
		const toBox = positions.get(group.to);
		if (!fromBox || !toBox) continue;
		const pts = connectBoxesEdge(fromBox, toBox);
		const pillH = 18 * group.labels.length + 8;
		const pillW = 216;
		const offset = pairIdx % 2 === 0 ? -14 : 14;
		pairIdx += 1;

		linkMarkup.push(`
			<g class="uml-comm-link">
				<line x1="${pts.x1.toFixed(1)}" y1="${pts.y1.toFixed(1)}" x2="${pts.x2.toFixed(1)}" y2="${pts.y2.toFixed(1)}" class="uml-edge" />
				<rect x="${(pts.mx - pillW / 2).toFixed(1)}" y="${(pts.my - pillH / 2 + offset).toFixed(1)}" width="${pillW}" height="${pillH}" rx="4" class="uml-edge-pill" stroke="#cbd5e1" />
				${group.labels
					.slice(0, 3)
					.map(
						(lbl, lIdx) =>
							`<text x="${pts.mx.toFixed(1)}" y="${(pts.my - pillH / 2 + offset + 15 + lIdx * 17).toFixed(1)}" class="uml-member" text-anchor="middle">${escapeXml(lbl.slice(0, 32))}</text>`
					)
					.join('')}
			</g>
		`);
	}

	return {
		body: `${linkMarkup.join('')}${nodeMarkup.join('')}`,
		width: totalW,
		height: totalH
	};
}

function renderTimingDiagram(
	doc: ParsedPlantUmlDocument,
	headerHeight: number
): { body: string; width: number; height: number } {
	const tracks =
		doc.timingTracks.length > 0
			? doc.timingTracks
			: [
					{
						id: 'System',
						label: 'System Track',
						kind: 'robust' as const,
						states: ['Idle', 'Active', 'Completed'],
						events: [
							{ tick: '0', tickNumber: 0, state: 'Idle' },
							{ tick: '10', tickNumber: 10, state: 'Active' },
							{ tick: '25', tickNumber: 25, state: 'Completed' }
						]
					}
				];

	const rawTicks = doc.timingTicks.length > 0 ? doc.timingTicks : ['0', '10', '20', '30'];
	const sortedTicks = [...rawTicks].sort((a, b) => {
		const na = Number.parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
		const nb = Number.parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
		return na - nb;
	});

	const leftColW = 190;
	const plotX = leftColW + 24;
	const plotW = 480;
	const trackH = 92;
	const startY = headerHeight + 28;
	const markup: string[] = [];

	const tickX = (tick: string): number => {
		const idx = sortedTicks.indexOf(tick);
		const safeIdx = idx >= 0 ? idx : 0;
		const denom = Math.max(1, sortedTicks.length - 1);
		return plotX + (safeIdx / denom) * (plotW - 40);
	};

	tracks.forEach((track, tIdx) => {
		const ty = startY + tIdx * trackH;
		const states = track.states.length > 0 ? track.states.slice(0, 4) : ['Idle', 'Active'];
		const stateY = (st: string): number => {
			const sIdx = Math.max(0, states.indexOf(st));
			const step = (trackH - 28) / Math.max(1, states.length);
			return ty + trackH - 18 - sIdx * step;
		};

		// Track container & labels
		markup.push(`
			<g class="uml-timing-track" data-node-id="${escapeXml(track.id)}">
				<rect x="28" y="${ty}" width="${leftColW + plotW + 16}" height="${trackH - 8}" rx="5" class="uml-frame" />
				<rect x="28" y="${ty}" width="${leftColW - 10}" height="${trackH - 8}" rx="5" class="uml-header-band" />
				<text x="40" y="${ty + 22}" class="uml-name">${escapeXml(track.label.slice(0, 22))}</text>
				<text x="40" y="${ty + 38}" class="uml-stereo">«${track.kind}»</text>
				${states
					.map(
						(st) =>
							`<text x="${leftColW + 12}" y="${stateY(st) + 4}" class="uml-member" text-anchor="end">${escapeXml(st.slice(0, 12))}</text>
							 <line x1="${plotX}" y1="${stateY(st)}" x2="${plotX + plotW - 12}" y2="${stateY(st)}" class="uml-grid-line" />`
					)
					.join('')}
			</g>
		`);

		// Step waveform path
		const events =
			track.events.length > 0
				? track.events
				: [{ tick: sortedTicks[0] || '0', tickNumber: 0, state: states[0] }];
		const pathParts: string[] = [];
		for (let i = 0; i < events.length; i += 1) {
			const ev = events[i];
			const x = tickX(ev.tick);
			const y = stateY(ev.state);
			if (i === 0) {
				pathParts.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
			} else {
				const prevY = stateY(events[i - 1].state);
				pathParts.push(`L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`);
			}
			if (i === events.length - 1) {
				pathParts.push(`L ${(plotX + plotW - 16).toFixed(1)} ${y.toFixed(1)}`);
			}
		}
		markup.push(`<path d="${pathParts.join(' ')}" class="uml-waveform" />`);
	});

	// Bottom time axis & timing constraints
	const axisY = startY + tracks.length * trackH + 14;
	markup.push(`
		<g class="uml-time-axis">
			<line x1="${plotX}" y1="${axisY}" x2="${plotX + plotW}" y2="${axisY}" class="uml-edge" marker-end="url(#uml-arrow)" />
			<text x="${plotX + plotW + 8}" y="${axisY + 4}" class="uml-subtitle">Time (t)</text>
			${sortedTicks
				.map((t) => {
					const tx = tickX(t);
					return `
						<line x1="${tx.toFixed(1)}" y1="${startY}" x2="${tx.toFixed(1)}" y2="${axisY + 6}" class="uml-grid-line" />
						<line x1="${tx.toFixed(1)}" y1="${axisY - 4}" x2="${tx.toFixed(1)}" y2="${axisY + 5}" class="uml-edge" />
						<text x="${tx.toFixed(1)}" y="${axisY + 20}" class="uml-member" text-anchor="middle">@${escapeXml(t)}</text>
					`;
				})
				.join('')}
		</g>
	`);

	doc.timingConstraints.slice(0, 2).forEach((c, cIdx) => {
		const x1 = tickX(c.fromTick);
		const x2 = tickX(c.toTick);
		const cy = axisY + 38 + cIdx * 22;
		markup.push(`
			<g class="uml-timing-constraint">
				<line x1="${x1.toFixed(1)}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${cy}" class="uml-edge-dashed" marker-start="url(#uml-arrow)" marker-end="url(#uml-arrow)" />
				<text x="${((x1 + x2) / 2).toFixed(1)}" y="${cy - 5}" class="uml-edge-label" text-anchor="middle">${escapeXml(c.label)}</text>
			</g>
		`);
	});

	const totalH = axisY + (doc.timingConstraints.length > 0 ? 74 : 44);
	return {
		body: markup.join(''),
		width: leftColW + plotW + 80,
		height: totalH
	};
}

export function renderPlantUmlToSvg(
	sourceCode: string,
	diagramType: UmlDiagramType,
	options?: { titleOverride?: string; isConceptual?: boolean }
): PlantUmlRenderResult {
	const parsed = parsePlantUml(sourceCode, diagramType);

	if (!parsed.valid) {
		const firstErr = parsed.errors[0];
		return {
			ok: false,
			width: 0,
			height: 0,
			parsed,
			error: firstErr
				? `Line ${firstErr.line}: ${firstErr.message}`
				: 'PlantUML source failed validation.',
			errorLine: firstErr?.line
		};
	}

	const meta = getUmlDiagramMeta(diagramType);
	const displayTitle = options?.titleOverride || parsed.title || `${meta.label}`;
	const conceptualTag = options?.isConceptual ? ' · Conceptual UML Model' : '';
	const headerHeight = 56;

	let rendered: { body: string; width: number; height: number };
	switch (diagramType) {
		case 'class':
			rendered = renderClassOrObjectDiagram(parsed, 'class', headerHeight);
			break;
		case 'object':
			rendered = renderClassOrObjectDiagram(parsed, 'object', headerHeight);
			break;
		case 'profile':
			rendered = renderClassOrObjectDiagram(parsed, 'profile', headerHeight);
			break;
		case 'package':
			rendered = renderPackageDiagram(parsed, headerHeight);
			break;
		case 'component':
			rendered = renderComponentDiagram(parsed, headerHeight);
			break;
		case 'composite-structure':
			rendered = renderCompositeStructureDiagram(parsed, headerHeight);
			break;
		case 'deployment':
			rendered = renderDeploymentDiagram(parsed, headerHeight);
			break;
		case 'use-case':
			rendered = renderUseCaseDiagram(parsed, headerHeight);
			break;
		case 'activity':
			rendered = renderActivityOrOverviewDiagram(parsed, false, headerHeight);
			break;
		case 'interaction-overview':
			rendered = renderActivityOrOverviewDiagram(parsed, true, headerHeight);
			break;
		case 'state-machine':
			rendered = renderStateMachineDiagram(parsed, headerHeight);
			break;
		case 'sequence':
			rendered = renderSequenceDiagram(parsed, headerHeight);
			break;
		case 'communication':
			rendered = renderCommunicationDiagram(parsed, headerHeight);
			break;
		case 'timing':
			rendered = renderTimingDiagram(parsed, headerHeight);
			break;
	}

	const svgId = `uml-${diagramType}-${Math.abs(hashString(displayTitle + sourceCode.length))}`;
	const rawSvg = `<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 ${rendered.width} ${rendered.height}"
		width="${rendered.width}"
		height="${rendered.height}"
		role="img"
		aria-labelledby="${svgId}-title ${svgId}-desc"
		class="uml-svg-root"
		data-uml-type="${escapeXml(diagramType)}"
	>
		<title id="${svgId}-title">${escapeXml(displayTitle)} (${escapeXml(meta.label)})</title>
		<desc id="${svgId}-desc">${escapeXml(meta.summary)}${escapeXml(conceptualTag)}</desc>
		${renderSvgMarkers()}
		<rect x="0" y="0" width="${rendered.width}" height="${rendered.height}" rx="10" class="uml-bg" />
		<g class="uml-diagram-banner">
			<text x="24" y="26" class="uml-title">${escapeXml(displayTitle.slice(0, 68))}</text>
			<text x="24" y="44" class="uml-subtitle">${escapeXml(meta.familyBadge)} · ${escapeXml(meta.label)}${escapeXml(conceptualTag)}</text>
		</g>
		${rendered.body}
	</svg>`;

	return {
		ok: true,
		svg: sanitizeSvg(rawSvg),
		width: rendered.width,
		height: rendered.height,
		parsed
	};
}

function hashString(input: string): number {
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	return hash;
}
