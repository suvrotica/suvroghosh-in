import { projectOntology, wrapLabel } from './projection';
import type { Diagram, DiagramEdge, DiagramNode, ModelId, PromptOntology } from './types';

export const diagramPalette = {
	ink: '#182e32',
	muted: '#536764',
	edge: '#79918a',
	paper: '#f4f2ea',
	instruction: '#e3ede6',
	subject: '#fffdf7',
	confirmed: '#6753a1',
	inferred: '#896131'
};

export function escapeXml(value: string): string {
	return value
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function edgePath(edge: DiagramEdge, model: ModelId): string {
	const [first, ...rest] = edge.points;
	if (!first) return '';
	if (model === 'mindmap' && rest.length === 1) {
		const end = rest[0];
		const middle = (first.x + end.x) / 2;
		return `M ${first.x} ${first.y} C ${middle} ${first.y}, ${middle} ${end.y}, ${end.x} ${end.y}`;
	}
	return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}`;
}

export function edgeLabelPoint(edge: DiagramEdge) {
	const first = edge.points[0] ?? { x: 0, y: 0 };
	const last = edge.points[edge.points.length - 1] ?? first;
	return edge.points.length > 2
		? { x: edge.points[1].x, y: edge.points[1].y - 9 }
		: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 - 10 };
}

export function nodeFill(node: DiagramNode): string {
	if (node.kind === 'root') return '#182e32';
	if (
		node.kind.startsWith('branch') ||
		['task', 'constraint', 'audience', 'output', 'example'].includes(node.kind)
	)
		return diagramPalette.instruction;
	if (node.kind === 'boundary') return '#eaece2';
	return diagramPalette.subject;
}

/** Safe SVG made only from bounded, validated diagram state; no HTML or external resources. */
export function exportDiagramSvg(diagram: Diagram): string {
	const analysisDescription =
		diagram.analysisMode === 'semantic' ? 'AI semantic analysis' : 'Local rules-based analysis';
	const out = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height + 76}" viewBox="0 0 ${diagram.width} ${diagram.height + 76}" role="img" aria-labelledby="atlas-title atlas-desc">`,
		`<title id="atlas-title">Prompt Atlas — ${escapeXml(diagram.title)}</title>`,
		`<desc id="atlas-desc">${analysisDescription}, ontology schema ${diagram.ontologySchemaVersion ?? 1}. Solid outlines: explicit information. Dashed outlines: inferred information. Thick purple outlines: user-confirmed information. Only supported relationships appear. ${escapeXml(diagram.notes.join(' '))} Unresolved issues are retained in the embedded metadata.</desc>`,
		`<metadata>${escapeXml(JSON.stringify({ application: 'Prompt Atlas', model: diagram.model, analysisMode: diagram.analysisMode ?? 'local', ...(diagram.analysisMetadata ? { analysisMetadata: diagram.analysisMetadata } : {}), ...(diagram.compression ? { compression: diagram.compression } : {}), ontologySchemaVersion: diagram.ontologySchemaVersion ?? 1, unresolvedIssues: diagram.unresolvedIssues ?? [], projectionNotes: diagram.notes }))}</metadata>`,
		`<rect width="100%" height="100%" fill="${diagramPalette.paper}"/>`,
		'<defs><marker id="atlas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L8 4 L0 8 Z" fill="#79918a"/></marker></defs>',
		`<text x="26" y="30" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="${diagramPalette.ink}">Prompt Atlas · ${escapeXml(diagram.title)}</text>`,
		'<g transform="translate(0 44)" font-family="system-ui, sans-serif" font-size="12">'
	];
	for (const boundary of diagram.nodes.filter((n) => n.kind === 'boundary')) {
		out.push(
			`<rect x="${boundary.x}" y="${boundary.y}" width="${boundary.width}" height="${boundary.height}" rx="10" fill="#eaece2" stroke="#79918a"/>`,
			`<text x="${boundary.x + 16}" y="${boundary.y + 28}" font-weight="700" fill="#182e32">${escapeXml(boundary.label)}</text>`
		);
	}
	if (diagram.model === 'sequence')
		for (const participant of diagram.nodes)
			out.push(
				`<path d="M${participant.x + participant.width / 2} ${participant.y + participant.height} V${diagram.height - 30}" stroke="#79918a" stroke-dasharray="5 5" fill="none"/>`
			);
	for (const edge of diagram.edges) {
		const location = edgeLabelPoint(edge);
		out.push(
			`<path d="${edgePath(edge, diagram.model)}" fill="none" stroke="${edge.provenance === 'user-confirmed' ? diagramPalette.confirmed : edge.provenance === 'inferred' ? diagramPalette.inferred : diagramPalette.edge}" stroke-width="${edge.provenance === 'user-confirmed' ? 3 : 1.7}"${edge.provenance === 'inferred' ? ' stroke-dasharray="6 4"' : ''}${['mindmap', 'usecase'].includes(diagram.model) ? '' : ' marker-end="url(#atlas-arrow)"'}/>`
		);
		if (edge.label)
			out.push(
				`<text x="${location.x}" y="${location.y}" text-anchor="middle" fill="#182e32" paint-order="stroke" stroke="#f4f2ea" stroke-width="5" stroke-linejoin="round">${wrapLabel(
					edge.label,
					38
				)
					.map(
						(label, index) =>
							`<tspan x="${location.x}" dy="${index ? 15 : 0}">${escapeXml(label)}</tspan>`
					)
					.join('')}</text>`
			);
	}
	for (const item of diagram.nodes.filter((n) => n.kind !== 'boundary')) {
		const { x, y, width, height } = item;
		const stroke =
			item.provenance === 'user-confirmed'
				? diagramPalette.confirmed
				: item.provenance === 'inferred'
					? diagramPalette.inferred
					: diagramPalette.edge;
		const outline = `fill="${nodeFill(item)}" stroke="${stroke}" stroke-width="${item.provenance === 'user-confirmed' ? 3 : 1.6}"${item.provenance === 'inferred' ? ' stroke-dasharray="5 4"' : ''}`;
		if (item.shape === 'diamond')
			out.push(
				`<polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" ${outline}/>`
			);
		else if (item.shape === 'ellipse')
			out.push(
				`<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${outline}/>`
			);
		else if (item.shape === 'actor') {
			out.push(
				`<g stroke="${stroke}" stroke-width="2" fill="none"><circle cx="${x + width / 2}" cy="${y + 15}" r="12"/><path d="M${x + width / 2} ${y + 27} v30 m-23 -16 h46 m-23 16 l-20 25 m20 -25 l20 25"/></g>`
			);
		} else
			out.push(
				`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${item.shape === 'rounded' ? 16 : 5}" ${outline}/>`
			);
		const labels = wrapLabel(item.label);
		const labelY =
			item.shape === 'actor'
				? y + 100
				: item.lines?.length
					? y + 24
					: y + height / 2 - ((labels.length - 1) * 17) / 2 + 4;
		out.push(
			`<text x="${x + width / 2}" y="${labelY}" text-anchor="middle" font-weight="600" fill="${item.kind === 'root' ? '#ffffff' : diagramPalette.ink}">${labels.map((label, index) => `<tspan x="${x + width / 2}" dy="${index ? 17 : 0}">${escapeXml(label)}</tspan>`).join('')}</text>`
		);
		if (item.lines?.length) {
			const dividerY = y + 32 + (labels.length - 1) * 17;
			out.push(`<path d="M${x} ${dividerY} h${width}" stroke="#79918a"/>`);
			item.lines.forEach((line, index) =>
				out.push(
					`<text x="${x + 12}" y="${dividerY + 23 + index * 18}" fill="#182e32" font-size="11">${escapeXml(line)}</text>`
				)
			);
		}
	}
	out.push(
		'</g>',
		`<text x="26" y="${diagram.height + 60}" fill="#536764" font-family="system-ui, sans-serif" font-size="11">Solid: explicit · Dashed: inferred · Purple: user-confirmed · ${escapeXml(diagram.model)}</text>`,
		'</svg>'
	);
	return out.join('\n');
}

export function exportMarkdown(ontology: PromptOntology, model: ModelId): string {
	const diagram = projectOntology(ontology, model);
	const safe = (value: string) =>
		value.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>#|])/g, '\\$1');
	return [
		`# Prompt Atlas: ${diagram.title}`,
		'',
		`Analysis mode: ${ontology.mode === 'semantic' ? 'AI semantic' : 'local rules'}. Ontology schema: ${ontology.schemaVersion}.${ontology.analysisMetadata ? ` Provider: ${safe(ontology.analysisMetadata.provider)}. Model: ${safe(ontology.analysisMetadata.model)}.` : ''}`,
		...(ontology.compression?.applied
			? [
					`Coverage: ${ontology.compression.analysedCodePoints} of ${ontology.compression.originalCodePoints} code points in ${ontology.compression.fragmentCount} exact excerpts; ${ontology.compression.omittedCodePoints} omitted, including ${ontology.compression.duplicateCodePoints} detected repeats. Partial coverage.`
				]
			: []),
		'',
		'## Items',
		'',
		...ontology.nodes.map(
			(n) =>
				`- ${safe(n.label)} — ${n.kind}; ${n.provenance}${n.attributes.length ? `. Attributes: ${n.attributes.map((a) => `${safe(a.name)}${a.dataType ? ` (${safe(a.dataType)})` : ''}${a.value ? `: ${safe(a.value)}` : ''}${a.primaryKey ? ' [primary key]' : ''}${a.unique ? ' [unique]' : ''}${a.foreignKey ? ` [references ${safe(a.foreignKey)}]` : ''} [${a.provenance}]`).join('; ')}` : ''}.`
		),
		'',
		'## Relationships',
		'',
		...ontology.relations.map(
			(r) =>
				`- ${safe(ontology.nodes.find((n) => n.id === r.from)?.label ?? r.from)} → ${safe(ontology.nodes.find((n) => n.id === r.to)?.label ?? r.to)}: ${safe(r.label)}${r.cardinality ? ` (${safe(r.cardinality)})` : ''} — ${r.provenance}.`
		),
		'',
		'## Unresolved issues',
		'',
		...ontology.issues.filter((i) => !i.resolved).map((i) => `- ${safe(i.description)}`),
		'',
		'## Projection notes',
		'',
		...diagram.notes.map((note) => `- ${safe(note)}`),
		''
	].join('\n');
}
