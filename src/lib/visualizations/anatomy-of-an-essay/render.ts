import { buildSpecimen, escapeXml, specimenInner } from './geometry';
import type { EssayDocument } from './types';

/** Shared styling for the interactive specimen and its self-contained vector export. */
export const SPECIMEN_STYLES = `
.ea-svg { color:var(--ea-ink,#393c32); overflow:visible; }
.ea-svg path,.ea-svg circle,.ea-svg ellipse { vector-effect:non-scaling-stroke; }
.ea-svg .ea-layer { transition:transform .65s cubic-bezier(.2,.7,.2,1),opacity .3s; }
.ea-svg .ea-frame-corner { fill:none;stroke:currentColor;stroke-width:1;opacity:.35; }
.ea-svg .ea-ruler { fill:none;stroke:currentColor;stroke-width:.65;opacity:.28; }
.ea-svg text { font-family:'IBM Plex Mono',monospace;fill:currentColor; }
.ea-svg .ea-engraving { font-size:8px;letter-spacing:1.3px;fill:var(--ea-muted,#62695e); }
.ea-svg .ea-scale-label { font-size:7px;letter-spacing:1.4px;fill:var(--ea-muted,#62695e); }
.ea-svg .ea-organ-number { font-size:6.8px;fill:var(--ea-muted,#62695e); }
.ea-svg .ea-membrane { stroke:var(--ea-ink,#393c32);stroke-width:.6;stroke-opacity:.3; }
.ea-svg .ea-organ-shadow { fill:var(--ea-ink,#393c32);opacity:.12;stroke:none; }
.ea-svg .ea-organ-surface { stroke:var(--ea-ink,#393c32);stroke-width:.65;stroke-opacity:.5; }
.ea-svg .ea-organ-seam { fill:none;stroke:var(--ea-bone-light,#fffdf5);stroke-width:.65;stroke-opacity:.85; }
.ea-svg .ea-organ { transition:opacity .25s; }
.ea-svg .ea-organ.is-active .ea-organ-surface { fill:var(--ea-accent,#a04f36);fill-opacity:.63;stroke:var(--ea-accent,#a04f36);stroke-width:1.5; }
.ea-svg .ea-rib-shadow { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:4.2;stroke-opacity:.21; }
.ea-svg .ea-rib-bone { fill:none;stroke-width:2.8;stroke-linecap:round; }
.ea-svg .ea-rib-light { fill:none;stroke:var(--ea-bone-light,#fffdf5);stroke-width:.6;stroke-linecap:round;stroke-opacity:.78; }
.ea-svg .ea-rib.is-active .ea-rib-bone { stroke:var(--ea-accent,#a04f36); }
.ea-svg .is-selected .ea-rib-bone,.ea-svg .is-preview .ea-rib-bone { stroke:var(--ea-accent,#a04f36);stroke-width:4; }
.ea-svg .is-selected .ea-rib-light { stroke:var(--ea-bone-light,#fffdf5);stroke-width:1; }
.ea-svg .ea-spine-shadow { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:10;stroke-opacity:.25;stroke-linecap:round; }
.ea-svg .ea-spine-bone { fill:none;stroke-width:7;stroke-linecap:round; }
.ea-svg .ea-spine-light { fill:none;stroke:var(--ea-bone-light,#fffdf5);stroke-width:1;stroke-opacity:.8; }
.ea-svg .ea-vertebra { stroke:var(--ea-ink,#393c32);stroke-width:.55;stroke-opacity:.65; }
.ea-svg .ea-terminal { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:.8;stroke-opacity:.6; }
.ea-svg .ea-vessel-line { fill:none;stroke:var(--ea-accent,#a04f36);stroke-width:.7;stroke-opacity:.48; }
.ea-svg .ea-vessel-terminal { fill:var(--ea-accent,#a04f36);opacity:.55; }
.ea-svg .ea-vessel.is-selected .ea-vessel-line,.ea-svg .ea-vessel.is-preview .ea-vessel-line { stroke-width:1.7;stroke-opacity:1; }
.ea-svg .ea-coil-shadow { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:4.3;stroke-opacity:.25;stroke-linejoin:round; }
.ea-svg .ea-coil-tube { fill:none;stroke:var(--ea-coil,#998473);stroke-width:2.7;stroke-linecap:round; }
.ea-svg .ea-coil-light { fill:none;stroke:var(--ea-bone-light,#fffdf5);stroke-width:.65;stroke-opacity:.75; }
.ea-svg .ea-coil.is-selected .ea-coil-tube,.ea-svg .ea-coil.is-preview .ea-coil-tube { stroke:var(--ea-accent,#a04f36);stroke-width:4; }
.ea-svg .ea-citation-shadow { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:4;stroke-opacity:.25; }
.ea-svg .ea-citation-bone { fill:none;stroke-width:2.6; }
.ea-svg .ea-citation-joint { fill:var(--ea-paper,#f4f0e5);stroke:var(--ea-ink,#393c32);stroke-width:1; }
.ea-svg .ea-neural-fibre { fill:none;stroke:var(--ea-ink,#393c32);stroke-width:.55;stroke-opacity:.17; }
.ea-svg .ea-neural-core { stroke:var(--ea-ink,#393c32);stroke-width:.6;stroke-opacity:.55; }
.ea-svg .ea-neural-dot { fill:var(--ea-ink,#393c32);opacity:.65; }
.ea-svg .ea-neural-hit { fill:transparent;stroke:none; }
.ea-svg .ea-hit { fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke; }
.ea-svg [data-sentence],.ea-svg [data-cluster] { cursor:pointer; }
.ea-svg .ea-flow { fill:none;stroke:var(--ea-accent,#a04f36);stroke-width:2.4;stroke-dasharray:1 25;stroke-linecap:round;opacity:0; }
.ea-specimen.is-playing .ea-flow { opacity:.6;animation:ea-flow 5s linear infinite; }
.ea-specimen.is-dissected .ea-layer-organs { transform:translateX(-38px); }
.ea-specimen.is-dissected .ea-layer-ribs { transform:translateX(14px); }
.ea-specimen.is-dissected .ea-layer-vessels { transform:translate(33px,-9px); }
.ea-specimen.is-dissected .ea-layer-coils { transform:translate(-18px,18px); }
.ea-specimen.is-dissected .ea-layer-citations { transform:translateX(36px); }
.ea-specimen.is-dissected .ea-layer-neurons { transform:translateY(-21px); }
@keyframes ea-flow { to { stroke-dashoffset:-104; } }
@media(prefers-reduced-motion:reduce) { .ea-svg .ea-layer { transition:none; } .ea-specimen.is-playing .ea-flow { animation:none;opacity:0; } }
`;

export interface PortraitOptions {
	width?: number;
	height?: number;
	social?: boolean;
	dark?: boolean;
}

function wrapTitle(title: string, length: number) {
	const lines: string[] = [];
	let line = '';
	for (const word of title.split(/\s+/)) {
		if (line && (line + ' ' + word).length > length) {
			lines.push(line);
			line = '';
		}
		line += (line ? ' ' : '') + word;
	}
	if (line) lines.push(line);
	return lines
		.slice(0, 5)
		.map((value, index, all) =>
			index === 4 && all.length === 5 ? value.slice(0, length - 1) + '…' : value
		);
}

/** The exact same geometry as the interactive experience, frozen without transient selection. */
export function renderPortrait(document: EssayDocument, options: PortraitOptions = {}): string {
	const social = options.social ?? false;
	const width = options.width ?? (social ? 1200 : 960);
	const height = options.height ?? (social ? 630 : 1200);
	const paper = options.dark ? '#20251f' : '#f3f0e5';
	const ink = options.dark ? '#e7e2cf' : '#353b30';
	const theme = options.dark
		? '--ea-paper:#20251f;--ea-ink:#e7e2cf;--ea-tissue-light:#77755f;--ea-tissue:#51543e;--ea-tissue-shadow:#282c23;--ea-bone-light:#d6d0b5;--ea-bone:#a29c80;--ea-bone-shadow:#65644c;--ea-coil:#9d8b74;'
		: '';
	const geometry = buildSpecimen(document);
	const body = specimenInner(geometry);
	const title = escapeXml(document.title);
	const subtitle = document.canonicalUrl
		? escapeXml(document.canonicalUrl.replace(/^https?:\/\//, ''))
		: 'PRIVATE SPECIMEN · GENERATED LOCALLY';
	const lines = wrapTitle(document.title, social ? 26 : 48);
	const titleMarkup = lines
		.map(
			(line, i) =>
				`<tspan x="${social ? 64 : 40}" dy="${i ? (social ? 46 : 23) : 0}">${escapeXml(line)}</tspan>`
		)
		.join('');
	const artwork = social
		? `<text x="64" y="75" class="portrait-kicker">THE ANATOMY OF AN ESSAY</text><text x="64" y="175" class="portrait-title social-title">${titleMarkup}</text><text x="64" y="470" class="portrait-kicker">${document.measurements.words.toLocaleString('en-GB')} WORDS / ${document.measurements.paragraphs} ORGANS</text><text x="64" y="505" class="portrait-subtitle">A portrait grown from the structure of a text.</text><g transform="translate(630 -15) scale(.84)" class="ea-svg">${body}</g><text x="64" y="587" class="portrait-credit">${subtitle}</text>`
		: `<text x="40" y="45" class="portrait-kicker">THE ANATOMY OF AN ESSAY</text><g transform="translate(0 40)" class="ea-svg">${body}</g><text x="40" y="830" class="portrait-title">${titleMarkup}</text><text x="40" y="${850 + (lines.length - 1) * 23}" class="portrait-credit">${escapeXml(document.author || 'Private specimen')} · ${document.measurements.words.toLocaleString('en-GB')} words</text><text x="40" y="${874 + (lines.length - 1) * 23}" class="portrait-credit">${subtitle}</text>`;
	const logicalHeight = 900 + (lines.length - 1) * 23;
	const logicalWidth = (logicalHeight * width) / height;
	const viewBox = social ? '0 0 1200 630' : `0 0 ${logicalWidth} ${logicalHeight}`;
	const centeredArtwork = social
		? artwork
		: `<g transform="translate(${(logicalWidth - 600) / 2} 0)">${artwork}</g>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-label="${title}: a structural essay portrait"><title>${title}</title><desc>Paragraphs form chambers, sentences form ribs, repeated words form neural clusters. Analysis ${document.analysisVersion}; morphology ${document.morphologyVersion}; content ${escapeXml(document.contentHash)}.</desc><style>:root{--ea-paper:${paper};--ea-ink:${ink};--ea-accent:#a3553c;${theme}}${SPECIMEN_STYLES}.portrait-kicker{font:11px monospace;letter-spacing:2px;fill:${ink}}.portrait-title{font:21px Georgia,serif;fill:${ink}}.social-title{font-size:42px}.portrait-subtitle{font:19px Georgia,serif;fill:${ink}}.portrait-credit{font:8px monospace;fill:${ink};opacity:.7}</style><rect x="0" y="0" width="${social ? 1200 : logicalWidth}" height="${social ? 630 : logicalHeight}" fill="${paper}"/>${centeredArtwork}</svg>`;
}
