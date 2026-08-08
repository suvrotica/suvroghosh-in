import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'static', 'images', 'weather-inside-the-nucleus.png');

function territoryPoints(cx, cy, radiusX, radiusY, count, phase) {
	return Array.from({ length: count }, (_, index) => {
		const angle = phase + index * 2.399963229728653;
		const radial = Math.sqrt((index + 0.5) / count);
		const x = cx + Math.cos(angle) * radiusX * radial;
		const y = cy + Math.sin(angle) * radiusY * radial;
		const opacity = 0.1 + ((index * 17) % 11) / 70;
		const radius = 0.8 + ((index * 13) % 7) / 5;
		return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="#a6a0d2" fill-opacity="${opacity.toFixed(3)}"/>`;
	}).join('');
}

function svg() {
	return `<?xml version="1.0" encoding="UTF-8"?>
	<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
		<title id="title">Weather Inside the Nucleus</title>
		<desc id="description">An extracellular ligand meets a membrane receptor while a cyan activity path reaches a violet nucleus. Inside, a magenta enhancer and amber promoter draw near without guaranteeing transcription.</desc>
		<defs>
			<radialGradient id="background" cx="0.72" cy="0.45" r="0.78"><stop offset="0" stop-color="#17183b"/><stop offset="0.53" stop-color="#080a1c"/><stop offset="1" stop-color="#03040c"/></radialGradient>
			<radialGradient id="nucleus" cx="0.38" cy="0.34" r="0.72"><stop offset="0" stop-color="#403b73" stop-opacity="0.62"/><stop offset="0.63" stop-color="#17162f" stop-opacity="0.84"/><stop offset="1" stop-color="#090914" stop-opacity="0.98"/></radialGradient>
			<linearGradient id="signal" x1="0" x2="1"><stop offset="0" stop-color="#6ce5ff"/><stop offset="1" stop-color="#6ce5ff" stop-opacity="0"/></linearGradient>
			<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
		</defs>
		<rect width="1200" height="630" fill="url(#background)"/>
		<path d="M0 630 V0 H185 C286 102 305 236 272 365 C246 466 170 553 73 630 Z" fill="#18243a" fill-opacity="0.27" stroke="#7887a5" stroke-opacity="0.22" stroke-width="2"/>
		<path d="M249 18 C294 146 304 265 278 382 C263 451 232 518 184 590" fill="none" stroke="#9eacc4" stroke-opacity="0.72" stroke-width="7"/>
		<path d="M262 15 C307 146 317 267 291 385 C276 455 245 521 197 596" fill="none" stroke="#4a5874" stroke-opacity="0.8" stroke-width="3"/>
		<g filter="url(#glow)"><path d="M180 194 l17 -11 18 9 -5 20 -21 4 -13 -11 Z" fill="#d8f8ff" stroke="#6ce5ff" stroke-width="3"/><circle cx="194" cy="199" r="31" fill="none" stroke="#6ce5ff" stroke-opacity="0.2"/></g>
		<path d="M236 209 C259 216 270 235 271 256 M292 256 C305 272 312 288 317 307" fill="none" stroke="#ffd166" stroke-width="8" stroke-linecap="round"/>
		<path d="M315 300 C398 278 449 324 528 305 C584 291 617 266 676 265" fill="none" stroke="#6ce5ff" stroke-opacity="0.14" stroke-width="36" stroke-linecap="round"/>
		<path d="M315 300 C398 278 449 324 528 305 C584 291 617 266 676 265" fill="none" stroke="url(#signal)" stroke-width="7" stroke-linecap="round" stroke-dasharray="12 12"/>
		<ellipse cx="866" cy="322" rx="296" ry="254" fill="url(#nucleus)" stroke="#b5afe7" stroke-opacity="0.76" stroke-width="3"/>
		<ellipse cx="866" cy="322" rx="282" ry="240" fill="none" stroke="#77719e" stroke-opacity="0.52" stroke-width="2" stroke-dasharray="2 11"/>
		<g>${territoryPoints(771, 235, 142, 104, 48, 0.3)}${territoryPoints(984, 222, 126, 108, 42, 1.1)}${territoryPoints(760, 429, 130, 102, 38, 2.2)}</g>
		<path d="M666 390 C714 330 764 404 807 353 C848 305 889 391 930 340 C973 288 1024 365 1066 318" fill="none" stroke="#aaa7c8" stroke-opacity="0.64" stroke-width="8" stroke-linecap="round"/>
		<path d="M666 390 C714 330 764 404 807 353 C848 305 889 391 930 340 C973 288 1024 365 1066 318" fill="none" stroke="#15162e" stroke-opacity="0.78" stroke-width="2" stroke-dasharray="3 10"/>
		<g filter="url(#glow)"><path d="M789 357 l-27 40 h54 Z" fill="#ed62d0" stroke="#ffd8f4" stroke-width="3"/><rect x="926" y="316" width="44" height="44" rx="8" fill="#241f2a" stroke="#ffd166" stroke-width="7"/><circle cx="948" cy="338" r="6" fill="#ffd166"/></g>
		<path d="M817 376 Q866 315 920 338" fill="none" stroke="#d5b8ff" stroke-opacity="0.75" stroke-width="4" stroke-linecap="round" stroke-dasharray="3 12"/>
		<path d="M817 382 Q868 340 920 348" fill="none" stroke="#ed62d0" stroke-opacity="0.21" stroke-width="18" stroke-linecap="round"/>
		<g filter="url(#glow)" fill="#f7fbff"><circle cx="988" cy="308" r="7"/><rect x="1000" y="330" width="12" height="12" rx="3" transform="rotate(18 1006 336)"/><circle cx="985" cy="370" r="5"/></g>
		<rect x="0" y="0" width="1200" height="630" fill="#050712" fill-opacity="0.18"/>
		<path d="M41 36 H1159" stroke="#6ce5ff" stroke-opacity="0.42"/>
		<text x="43" y="73" fill="#75def5" font-family="Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="3.1">AN INTERACTIVE MODEL OF SIGNAL, SPACE AND CHANCE</text>
		<text x="39" y="144" fill="#f6f2ff" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="700" letter-spacing="-1.2">Weather Inside the Nucleus</text>
		<text x="43" y="184" fill="#c9c7da" font-family="Arial, sans-serif" font-size="26" font-weight="500">A signal arrives. A gene hesitates.</text>
		<g transform="translate(43 545)"><rect width="485" height="47" rx="5" fill="#070917" fill-opacity="0.86" stroke="#8a88ad" stroke-opacity="0.45"/><text x="16" y="20" fill="#e4e1f0" font-family="Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1.4">SYNTHETIC DEMONSTRATION LOCUS · MODEL TIME</text><text x="16" y="37" fill="#9f9cb2" font-family="Arial, sans-serif" font-size="10">contact changes propensity; it never commands transcription</text></g>
		<text x="1156" y="587" text-anchor="end" fill="#f0eaf8" font-family="Georgia, 'Times New Roman', serif" font-size="20" font-weight="700">SuvroGhosh.IN</text>
		<rect x="12" y="12" width="1176" height="606" fill="none" stroke="#9a97b6" stroke-opacity="0.22"/>
	</svg>`;
}

async function main() {
	await mkdir(path.dirname(OUTPUT), { recursive: true });
	const result = await sharp(Buffer.from(svg()))
		.png({ palette: true, colors: 128, compressionLevel: 9, effort: 10, dither: 0 })
		.toFile(OUTPUT);
	if (result.width !== WIDTH || result.height !== HEIGHT) {
		throw new Error(
			`Poster dimensions were ${result.width}×${result.height}; expected ${WIDTH}×${HEIGHT}.`
		);
	}
	if (result.size >= 150 * 1024) {
		throw new Error(`Poster is ${result.size} bytes; the first-paint target is below 150 kB.`);
	}
	const digest = createHash('sha256')
		.update(await readFile(OUTPUT))
		.digest('hex');
	console.log(
		`Rendered ${path.relative(ROOT, OUTPUT)} (${result.width}×${result.height}, ${result.size} bytes, sha256 ${digest}).`
	);
}

await main();
