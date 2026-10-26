import { LONG_SENTENCE_WORDS, type AnatomyLayer, type EssayDocument } from './types';

export const SPECIMEN_WIDTH = 600;
export const SPECIMEN_HEIGHT = 760;
export const GEOMETRY_LIMITS = { organs: 96, ribs: 480, coils: 24, citations: 24, neuralEdges: 24 };

export interface SpecimenGeometry {
	width: number;
	height: number;
	bodyHeight: number;
	spine: string;
	outline: string;
	layers: Record<AnatomyLayer, string>;
	definitions: string;
	frame: string;
	omitted: { organs: number; ribs: number; coils: number; citations: number };
}

export const escapeXml = (value: string | number) =>
	String(value).replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!
	);
const n = (value: number) => Number(value.toFixed(2));
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const path = (d: string, className: string, extra = '') =>
	`<path d="${d}" class="${className}" ${extra}/>`;
const point = (x: number, y: number) => `${n(x)} ${n(y)}`;
const target = (sentence: string, paragraph: string) =>
	`data-sentence="${escapeXml(sentence)}" data-paragraph="${escapeXml(paragraph)}"`;

/** Fixed scales are shared across all specimens. Only the explicitly normalized view changes scale. */
export function buildSpecimen(document: EssayDocument, normalized = false): SpecimenGeometry {
	const paragraphs = document.paragraphs.slice(0, GEOMETRY_LIMITS.organs);
	const count = paragraphs.length;
	const words = document.measurements.words;
	const bodyHeight = clamp(180 + Math.sqrt(words) * 5.4 + Math.log2(count + 1) * 15, 195, 554);
	const top = 105 + (554 - bodyHeight) / 2;
	const bottom = top + bodyHeight;
	const variation = clamp(document.measurements.sentenceVariation || 0, 0, 60);
	const curl = 12 + variation * 0.5;
	const spineAt = (t: number) =>
		300 + Math.sin(t * Math.PI * 2 - 0.6) * curl + Math.sin(t * Math.PI) * 15;
	const key = `ea-${document.contentHash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'specimen'}`;
	const definitions = `<defs>
	<linearGradient id="${key}-tissue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ea-tissue-light,#f8f3e9)"/><stop offset=".44" stop-color="var(--ea-tissue,#e1d6ba)"/><stop offset="1" stop-color="var(--ea-tissue-shadow,#b9ad8b)"/></linearGradient>
	<linearGradient id="${key}-bone" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="var(--ea-bone-light,#fffdf5)"/><stop offset=".55" stop-color="var(--ea-bone,#d0c2a2)"/><stop offset="1" stop-color="var(--ea-bone-shadow,#918266)"/></linearGradient>
	<radialGradient id="${key}-pearl" cx=".3" cy=".25" r=".85"><stop stop-color="var(--ea-bone-light,#fffdf5)"/><stop offset=".7" stop-color="var(--ea-tissue,#e1d6ba)"/><stop offset="1" stop-color="var(--ea-bone-shadow,#918266)"/></radialGradient>
	<radialGradient id="${key}-membrane"><stop stop-color="var(--ea-tissue,#e1d6ba)" stop-opacity=".1"/><stop offset=".78" stop-color="var(--ea-tissue,#e1d6ba)" stop-opacity=".25"/><stop offset="1" stop-color="var(--ea-tissue-shadow,#b9ad8b)" stop-opacity=".55"/></radialGradient>
	</defs>`;
	const tissue: string[] = [],
		ribs: string[] = [],
		vessels: string[] = [],
		coils: string[] = [],
		neurons: string[] = [],
		citations: string[] = [];
	const centers = new Map<
		string,
		{ x: number; y: number; sx: number; rx: number; ry: number; side: number }
	>();
	const sentenceCenters = new Map<string, { x: number; y: number; sx: number; side: number }>();
	let ribCount = 0,
		coilCount = 0;
	const stride = bodyHeight / Math.max(2, count + 1);
	const left: { x: number; y: number }[] = [],
		right: { x: number; y: number }[] = [];
	for (let i = 0; i <= 26; i++) {
		const t = i / 26,
			y = top + t * bodyHeight,
			sx = spineAt(t);
		const localIndex = Math.min(count - 1, Math.floor(t * count));
		const localWords = paragraphs[Math.max(0, localIndex)]?.wordCount ?? 1;
		const envelope = Math.pow(Math.sin(Math.PI * t), 0.55);
		const width = (35 + Math.sqrt(localWords) * 6 + variation * 0.5) * envelope;
		left.push({ x: sx - Math.min(155, width), y });
		right.push({ x: sx + Math.min(155, width * (0.83 + 0.17 * Math.sin(t * 15))), y });
	}
	const contour = [...left, ...right.reverse()];
	// A midpoint quadratic envelope prevents jagged corners between paragraph-sized lobes.
	const outline = `M ${point((contour[0].x + contour[contour.length - 1].x) / 2, (contour[0].y + contour[contour.length - 1].y) / 2)} ${contour
		.map((p, i) => {
			const next = contour[(i + 1) % contour.length];
			return `Q ${point(p.x, p.y)} ${point((p.x + next.x) / 2, (p.y + next.y) / 2)}`;
		})
		.join(' ')} Z`;
	const spinePoints = Array.from({ length: 34 }, (_, i) =>
		point(spineAt(i / 33), top + (bodyHeight * i) / 33)
	);
	const spine = `M ${spinePoints.join(' L ')}`;
	for (const [index, paragraph] of paragraphs.entries()) {
		const t = (index + 1) / (count + 1),
			y = top + t * bodyHeight,
			sx = spineAt(t);
		const side = index % 2 === 0 ? -1 : 1;
		const rx = clamp(10 + Math.sqrt(paragraph.wordCount) * 6.2, 17, 102);
		const ry = clamp(
			Math.sqrt(paragraph.wordCount) * 1.8 + 4,
			9,
			Math.max(11, Math.min(36, stride * 1.32))
		);
		const x = sx + side * (rx * 0.61 + 8);
		centers.set(paragraph.id, { x, y, sx, rx, ry, side });
		const a = target(paragraph.sentences[0]?.id || '', paragraph.id);
		const body = `M ${point(sx + side * 3, y - ry * 0.25)} C ${point(x - side * rx * 0.15, y - ry * 1.5)} ${point(x + side * rx * 1.2, y - ry * 1.15)} ${point(x + side * rx, y + ry * 0.1)} C ${point(x + side * rx * 0.8, y + ry * 1.25)} ${point(x - side * rx * 0.4, y + ry * 1.1)} ${point(sx + side * 3, y + ry * 0.25)} Z`;
		const seam = `M ${point(sx + side * 8, y)} Q ${point(x + side * rx * 0.3, y - ry * 0.65)} ${point(x + side * rx * 0.87, y)}`;
		tissue.push(
			`<g class="ea-organ" ${a}><title>Paragraph ${index + 1}: ${paragraph.wordCount} words</title>${path(body, 'ea-organ-shadow', 'transform="translate(1.5 3)"')}${path(body, 'ea-organ-surface', `fill="url(#${key}-tissue)"`)}${path(seam, 'ea-organ-seam')}<circle cx="${n(sx + side * 5)}" cy="${n(y)}" r="2" fill="url(#${key}-pearl)"/></g>`
		);
		if (count <= 42 || index % Math.ceil(count / 32) === 0) {
			tissue.push(
				`<text x="${n(x + side * (rx + 10))}" y="${n(y + 3)}" class="ea-organ-number" text-anchor="${side < 0 ? 'end' : 'start'}">${String(index + 1).padStart(2, '0')}</text>`
			);
		}
		for (const [si, sentence] of paragraph.sentences.entries()) {
			const sy = y + ((si + 0.5) / paragraph.sentences.length - 0.5) * ry * 1.7;
			const reach = clamp(10 + Math.sqrt(sentence.wordCount) * 9, 17, 120);
			const ex = sx + side * reach;
			sentenceCenters.set(sentence.id, { x: ex, y: sy, sx, side });
			if (ribCount++ >= GEOMETRY_LIMITS.ribs) continue;
			const rib = `M ${point(sx + side * 4, sy)} C ${point(sx + side * reach * 0.3, sy - ry * 0.75)} ${point(sx + side * reach * 0.87, sy - ry * 0.8)} ${point(ex, sy + ry * 0.08)}`;
			const attr = target(sentence.id, paragraph.id);
			ribs.push(
				`<g class="ea-rib" ${attr}><title>Sentence ${ribCount}: ${sentence.wordCount} words</title>${path(rib, 'ea-rib-shadow')}${path(rib, 'ea-rib-bone', `stroke="url(#${key}-bone)"`)}${path(rib, 'ea-rib-light')}<circle cx="${n(ex)}" cy="${n(sy + ry * 0.08)}" r="1.3" fill="url(#${key}-pearl)"/>${path(rib, 'ea-hit')}</g>`
			);
			const depth = sentence.nesting === null ? 0 : Math.min(4, sentence.nesting);
			for (let d = 1; d <= depth; d++) {
				const vx = sx + side * (reach * 0.28 + d * 5),
					vy = sy - ry * (0.18 + d * 0.13);
				const endx = sx + side * (reach * 0.52 + d * 6),
					endy = sy - ry * (0.45 + d * 0.08);
				vessels.push(
					`<g class="ea-vessel" ${attr}>${path(`M ${point(sx, sy)} Q ${point(vx, sy - ry * 0.1)} ${point(vx, vy)} T ${point(endx, endy)}`, 'ea-vessel-line')}<circle cx="${n(endx)}" cy="${n(endy)}" r="1.1" class="ea-vessel-terminal"/></g>`
				);
			}
			if (sentence.wordCount > LONG_SENTENCE_WORDS && coilCount++ < GEOMETRY_LIMITS.coils) {
				const cx = sx + side * (reach * 0.58),
					cy = sy + 3;
				const loops = clamp(Math.floor(sentence.wordCount / 20), 2, 7);
				let coil = `M ${point(sx + side * 5, sy)}`;
				for (let l = 0; l < loops; l++) {
					const ly = cy + l * 3.8;
					coil += ` C ${point(cx + side * 22, ly - 10)} ${point(cx + side * 24, ly + 10)} ${point(cx - side * 7, ly + 6)} S ${point(cx - side * 25, ly + 13)} ${point(cx + side * 9, ly + 11)}`;
				}
				coils.push(
					`<g class="ea-coil" ${attr}><title>Long sentence: ${sentence.wordCount} words</title>${path(coil, 'ea-coil-shadow')}${path(coil, 'ea-coil-tube')}${path(coil, 'ea-coil-light')}${path(coil, 'ea-hit')}</g>`
				);
			}
		}
	}
	for (const [ci, citation] of document.citations.slice(0, GEOMETRY_LIMITS.citations).entries()) {
		const center = sentenceCenters.get(citation.sentenceId);
		if (!center) continue;
		const x = center.sx + center.side * (130 + (ci % 3) * 7),
			y = center.y;
		const d = `M ${point(center.sx, y)} Q ${point(x, y - 26)} ${point(x, y - 3)} L ${point(x, y + 6)}`;
		citations.push(
			`<g class="ea-citation" ${target(citation.sentenceId, citation.paragraphId)}><title>Reference ${escapeXml(citation.label)}</title>${path(d, 'ea-citation-shadow')}${path(d, 'ea-citation-bone', `stroke="url(#${key}-bone)"`)}<circle cx="${n(x)}" cy="${n(y + 6)}" r="3.6" class="ea-citation-joint"/>${path(d, 'ea-hit')}</g>`
		);
	}
	for (const [ci, cluster] of document.clusters.slice(0, 8).entries()) {
		const angle =
			-Math.PI * 0.93 + (ci * Math.PI * 1.86) / Math.max(1, document.clusters.length - 1);
		const cx = 300 + Math.cos(angle) * (30 + Math.sqrt(cluster.count) * 3.2),
			cy = top + 33 + Math.sin(angle) * 16;
		const radius = clamp(3 + Math.sqrt(cluster.count) * 1.45, 5, 14);
		const wordAttr = `data-cluster="${escapeXml(cluster.word)}"`;
		for (const occurrence of cluster.occurrences.slice(0, 3)) {
			const to = centers.get(occurrence.paragraphId);
			if (to)
				neurons.push(
					`<g class="ea-neural-edge" ${wordAttr}>${path(`M ${point(cx, cy)} C ${point(cx, cy + 40)} ${point(to.sx, to.y - 30)} ${point(to.sx, to.y)}`, 'ea-neural-fibre')}</g>`
				);
		}
		let satellites = '';
		for (let j = 0; j < Math.min(12, cluster.count); j++) {
			const a = j * 2.4,
				r = radius * (0.5 + j / 16);
			satellites += `<circle cx="${n(cx + Math.cos(a) * r)}" cy="${n(cy + Math.sin(a) * r)}" r="${n(1 + (j % 3) * 0.38)}" class="ea-neural-dot"/>`;
		}
		neurons.push(
			`<g class="ea-neural-cluster" ${wordAttr}><title>${escapeXml(cluster.word)}: ${cluster.count} occurrences</title><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="url(#${key}-pearl)" class="ea-neural-core"/>${satellites}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius + 6)}" class="ea-neural-hit"/></g>`
		);
	}
	// The terminal filament extends the same reading-order spine and is attached to its end.
	const terminal = `M ${point(spineAt(1), bottom)} C ${point(spineAt(1) + 14, bottom + 20)} ${point(spineAt(1) - 22, bottom + 27)} ${point(spineAt(1) - 9, bottom + 43)}`;
	const vertebrae = clamp(Math.round(bodyHeight / 11), 12, 48);
	const spineMarkup = `${path(outline, 'ea-membrane', `fill="url(#${key}-membrane)"`)}${path(spine, 'ea-spine-shadow')}${path(spine, 'ea-spine-bone', `stroke="url(#${key}-bone)"`)}${path(spine, 'ea-spine-light')}${path(terminal, 'ea-terminal')}${Array.from(
		{ length: vertebrae },
		(_, i) => {
			const t = i / (vertebrae - 1);
			return `<ellipse cx="${n(spineAt(t))}" cy="${n(top + bodyHeight * t)}" rx="4.8" ry="2.2" class="ea-vertebra" fill="url(#${key}-bone)"/>`;
		}
	).join('')}${path(spine, 'ea-flow')}`;
	const ruler = Array.from(
		{ length: 47 },
		(_, i) => `<path d="M 35 ${105 + i * 12} h ${i % 5 === 0 ? 11 : 5}" class="ea-ruler"/>`
	).join('');
	const frame = `<path d="M 28 60 V 28 H 60 M 540 28 H 572 V 60 M 28 700 V 732 H 60 M 540 732 H 572 V 700" class="ea-frame-corner"/>${ruler}<text x="35" y="82" class="ea-engraving">MORPHOLOGY / 01</text><text x="565" y="82" text-anchor="end" class="ea-engraving">${document.measurements.words.toLocaleString('en-GB')} WORDS</text><text x="35" y="700" class="ea-engraving">${count} CHAMBERS · ${document.measurements.sentences} RIBS</text><text x="565" y="700" text-anchor="end" class="ea-engraving">READING ORDER ↓</text><path d="M 215 720 H 385 M 215 716 V 724 M 249 718 V 722 M 283 718 V 722 M 317 718 V 722 M 351 718 V 722 M 385 716 V 724" class="ea-ruler"/><text x="300" y="744" text-anchor="middle" class="ea-scale-label">${normalized ? 'NORMALIZED SHAPE' : 'SHARED COMPRESSED SCALE'}</text>`;
	const bodyScale = normalized ? clamp(500 / bodyHeight, 0.85, 1.6) : 1;
	const transform =
		bodyScale === 1
			? ''
			: `transform="translate(${n(300 * (1 - bodyScale))} ${n(382 * (1 - bodyScale))}) scale(${n(bodyScale)})"`;
	const wrap = (content: string) => `<g ${transform}>${content}</g>`;
	return {
		width: SPECIMEN_WIDTH,
		height: SPECIMEN_HEIGHT,
		bodyHeight,
		spine: wrap(spineMarkup),
		outline,
		layers: {
			organs: wrap(tissue.join('')),
			ribs: wrap(ribs.join('')),
			vessels: wrap(vessels.join('')),
			neurons: wrap(neurons.join('')),
			citations: wrap(citations.join('')),
			coils: wrap(coils.join(''))
		},
		definitions,
		frame,
		omitted: {
			organs: Math.max(0, document.paragraphs.length - count),
			ribs: Math.max(0, document.measurements.sentences - Math.min(ribCount, GEOMETRY_LIMITS.ribs)),
			coils: Math.max(
				0,
				document.measurements.longSentences - Math.min(coilCount, GEOMETRY_LIMITS.coils)
			),
			citations: Math.max(0, document.citations.length - citations.length)
		}
	};
}

export function specimenInner(geometry: SpecimenGeometry): string {
	return `${geometry.definitions}${geometry.frame}<g class="ea-skeleton">${geometry.spine}</g>${(['organs', 'ribs', 'vessels', 'coils', 'citations', 'neurons'] as AnatomyLayer[]).map((layer) => `<g class="ea-layer ea-layer-${layer}" data-layer="${layer}">${geometry.layers[layer]}</g>`).join('')}`;
}
