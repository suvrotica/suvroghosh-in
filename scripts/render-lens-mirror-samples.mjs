import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/through-a-different-glass');
const labelArtwork = JSON.parse(
	await readFile(new URL('./artwork/lens-mirror-labels.json', import.meta.url), 'utf8')
);
const width = 1400;
const height = 1000;
const ink = '#243936';
const muted = '#6d8079';
const paper = '#f0eee5';
const teal = '#207f77';
const amber = '#cb7951';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function text(x, y, value, size = 24, fill = ink, extra = '') {
	const label = labelArtwork.labels[JSON.stringify([value, size, extra])];
	if (!label) throw new Error(`Missing reviewed lens-lab label artwork: ${value}`);
	return `<path fill="${fill}" transform="translate(${x} ${y})" d="${label.path}"/>`;
}

function svg(body, background = paper) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`;
}

function calibration(text) {
	let body = '';
	for (let x = 0; x <= width; x += 50) {
		body += `<path d="M${x} 0V1000" stroke="${x % 200 === 0 ? '#7b9d92' : '#c2cfc5'}" stroke-width="${x % 200 === 0 ? 2 : 1}"/>`;
	}
	for (let y = 0; y <= height; y += 50) {
		body += `<path d="M0 ${y}H1400" stroke="${y % 200 === 0 ? '#7b9d92' : '#c2cfc5'}" stroke-width="${y % 200 === 0 ? 2 : 1}"/>`;
	}
	for (const radius of [100, 200, 300, 400])
		body += `<circle cx="700" cy="500" r="${radius}" fill="none" stroke="${teal}" stroke-width="3"/>`;
	body += `<rect x="100" y="100" width="1200" height="800" fill="none" stroke="${ink}" stroke-width="4"/><path d="M700 80V920M80 500H1320" stroke="${ink}" stroke-width="2" stroke-dasharray="12 10"/><circle cx="700" cy="500" r="7" fill="${ink}"/>`;
	for (let row = 1; row <= 4; row++)
		for (let column = 1; column <= 6; column++) {
			const x = column * 200,
				y = row * 200;
			body += `<circle cx="${x}" cy="${y}" r="5" fill="${ink}"/>${text(x + 10, y - 10, `${column}.${row}`, 19, muted)}`;
		}
	body += `<rect x="108" y="108" width="300" height="72" rx="2" fill="${paper}"/>${text(128, 151, 'OPTICAL FIELD / 01', 26, ink, 'letter-spacing="2"')}`;
	body += `<circle cx="200" cy="800" r="34" fill="${teal}"/><rect x="1164" y="766" width="68" height="68" fill="${amber}"/><path d="M1120 210H1220L1185 175M1220 210L1185 245" fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="square"/>${text(1040, 290, 'R', 95, ink, 'font-weight="700"')}`;
	body += `<rect x="470" y="918" width="460" height="58" fill="${paper}"/>${text(700, 955, 'STRAIGHT LINES · TRUE CIRCLES', 22, ink, 'text-anchor="middle" letter-spacing="2"')}`;
	return svg(body);
}

function facade(text) {
	let body = `<rect y="765" width="1400" height="235" fill="#d7d9cc"/><rect x="155" y="135" width="1090" height="710" fill="#dfc5a3" stroke="${ink}" stroke-width="8"/><rect x="130" y="106" width="1140" height="45" fill="${ink}"/><rect x="130" y="819" width="1140" height="38" fill="${ink}"/><rect x="115" y="870" width="1170" height="22" fill="#b4bcb1"/>`;
	for (let y = 180; y < 820; y += 48)
		body += `<path d="M160 ${y}H1240" stroke="#c4a889" stroke-width="2"/>`;
	for (let row = 0; row < 3; row++)
		for (let column = 0; column < 6; column++) {
			const x = 205 + column * 172,
				y = 202 + row * 190;
			body += `<rect x="${x - 9}" y="${y - 10}" width="123" height="156" fill="#f5e7d2"/><rect x="${x}" y="${y}" width="105" height="136" fill="#385b56" stroke="${ink}" stroke-width="5"/><rect x="${x + 7}" y="${y + 7}" width="40" height="54" fill="#759891"/><rect x="${x + 57}" y="${y + 7}" width="40" height="54" fill="#9db3a7"/><rect x="${x + 7}" y="${y + 73}" width="40" height="56" fill="#618a82"/><rect x="${x + 57}" y="${y + 73}" width="40" height="56" fill="#87a69c"/><path d="M${x + 52} ${y}V${y + 136}M${x} ${y + 67}H${x + 105}" stroke="#d7d6be" stroke-width="6"/><rect x="${x - 14}" y="${y + 139}" width="133" height="12" fill="${ink}"/>`;
		}
	body += `<rect x="490" y="734" width="420" height="60" fill="${paper}" stroke="${ink}" stroke-width="2"/>${text(700, 773, 'THE STRAIGHT-EDGE HOUSE', 24, ink, 'text-anchor="middle" letter-spacing="2"')}`;
	for (const x of [74, 1326])
		body += `<path d="M${x} 730V918" stroke="${ink}" stroke-width="8"/><circle cx="${x}" cy="713" r="24" fill="${amber}" stroke="${ink}" stroke-width="5"/>`;
	body += `${text(700, 962, 'FACADE / REPEATED VERTICALS AND HORIZONTALS', 22, muted, 'text-anchor="middle" letter-spacing="2"')}`;
	return svg(body, '#e9eee6');
}

function portrait(text) {
	let body = `<path d="M200 0V1000M400 0V1000M600 0V1000M800 0V1000M1000 0V1000M1200 0V1000" stroke="#c9d4c9" stroke-width="2"/><circle cx="700" cy="462" r="373" fill="#d8e2d5"/><circle cx="700" cy="462" r="335" fill="none" stroke="#b8cabf" stroke-width="2"/><path d="M342 1000Q355 795 542 750L858 750Q1048 790 1060 1000" fill="${teal}" stroke="${ink}" stroke-width="7"/><path d="M600 670V798Q700 865 800 798V670" fill="#d69b78" stroke="${ink}" stroke-width="6"/><path d="M555 765L700 907L845 765M700 907V1000" fill="none" stroke="#a4d0bc" stroke-width="7"/><path d="M470 472Q420 140 695 128Q1005 140 930 504L883 682Q850 784 700 795Q535 775 500 653Z" fill="#283d37"/><ellipse cx="478" cy="501" rx="42" ry="68" fill="#e2ad88" stroke="${ink}" stroke-width="5"/><ellipse cx="922" cy="501" rx="42" ry="68" fill="#e2ad88" stroke="${ink}" stroke-width="5"/><path d="M499 355Q535 233 680 250Q811 207 898 365L880 606Q851 741 702 756Q552 741 519 606Z" fill="#e6b68f" stroke="${ink}" stroke-width="6"/><path d="M498 354Q528 196 714 211Q895 201 911 399Q822 359 796 287Q634 383 498 354Z" fill="#283d37"/><path d="M537 435Q585 403 638 428M762 427Q811 403 859 438" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"/><path d="M540 483Q586 445 637 482Q588 510 540 483M762 482Q813 445 859 483Q809 510 762 482" fill="#fff6df" stroke="${ink}" stroke-width="5"/><ellipse cx="593" cy="480" rx="14" ry="21" fill="${ink}"/><ellipse cx="807" cy="480" rx="14" ry="21" fill="${ink}"/><circle cx="598" cy="473" r="4" fill="#fff"/><circle cx="812" cy="473" r="4" fill="#fff"/><path d="M707 487L678 576Q703 594 729 578" fill="none" stroke="#9d664f" stroke-width="6" stroke-linecap="round"/><path d="M615 635Q701 686 786 633Q705 728 615 635" fill="#a85f50" stroke="#814d43" stroke-width="4"/><path d="M626 642Q703 666 774 641" fill="none" stroke="#f7dfc5" stroke-width="13"/><ellipse cx="566" cy="562" rx="39" ry="18" fill="#d89278" opacity=".6"/><ellipse cx="836" cy="562" rx="39" ry="18" fill="#d89278" opacity=".6"/><circle cx="885" cy="570" r="13" fill="${amber}" stroke="${ink}" stroke-width="4"/><path d="M461 952H532" stroke="#aad0bf" stroke-width="5"/>${text(480, 921, 'R', 43, '#d9e7d2', 'font-weight="700"')}`;
	body += `${text(94, 93, 'PORTRAIT STUDY', 26, ink, 'letter-spacing="3"')}${text(94, 132, 'ILLUSTRATED SAMPLE / 03', 18, muted, 'letter-spacing="2"')}`;
	return svg(body, '#e9ede3');
}

function corridor(text) {
	let body = `<path d="M0 0H1400L850 350H550Z" fill="#e4e6db"/><path d="M0 0L550 350V650L0 1000Z" fill="#b7c8bc"/><path d="M1400 0L850 350V650L1400 1000Z" fill="#91afa0"/><path d="M0 1000L550 650H850L1400 1000Z" fill="#d5c5a8"/><rect x="550" y="350" width="300" height="300" fill="#e3dfc9" stroke="${ink}" stroke-width="5"/><rect x="633" y="417" width="134" height="233" fill="${ink}"/><rect x="649" y="434" width="102" height="216" fill="#99bdb0"/><path d="M700 434V650" stroke="${ink}" stroke-width="4"/>`;
	for (const ratio of [0.12, 0.35, 0.55, 0.72, 0.86]) {
		const lx = 550 * ratio,
			rx = 1400 - 550 * ratio,
			top = 350 * ratio,
			bottom = 1000 - 350 * ratio;
		body += `<path d="M${lx} ${top}H${rx}V${bottom}H${lx}Z" fill="none" stroke="${ink}" stroke-width="${7 - ratio * 4}"/>`;
		body += `<path d="M${lx} ${top + (bottom - top) * 0.17}L550 400M${rx} ${top + (bottom - top) * 0.17}L850 400" stroke="#e7e8d8" stroke-width="7"/>`;
	}
	for (let x = -1000; x < 2400; x += 210)
		body += `<path d="M${x} 1000L700 500" stroke="#8b8e7b" stroke-width="2"/>`;
	for (const y of [700, 765, 850, 950])
		body += `<path d="M0 ${y}H1400" stroke="#8b8e7b" stroke-width="3"/>`;
	for (const [x, y, w, h] of [
		[95, 245, 142, 299],
		[330, 345, 72, 196],
		[469, 402, 36, 131],
		[1163, 245, 142, 299],
		[998, 345, 72, 196],
		[895, 402, 36, 131]
	])
		body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e1dec6" stroke="${ink}" stroke-width="5"/><path d="M${x + w / 2} ${y}V${y + h}" stroke="${ink}" stroke-width="3"/>`;
	body += `<path d="M610 60H790L755 135H645Z" fill="#faf6df" stroke="${ink}" stroke-width="4"/><path d="M655 220H745L730 253H670Z" fill="#faf6df" stroke="${ink}" stroke-width="3"/>${text(700, 980, 'THE LONG GALLERY · PERSPECTIVE IS ALREADY PRESENT', 21, ink, 'text-anchor="middle" letter-spacing="2"')}`;
	return svg(body);
}

function typography(text) {
	let body = `<rect x="65" y="65" width="1270" height="870" fill="none" stroke="${ink}" stroke-width="4"/>${text(105, 124, 'THE IMAGE / 05', 25, muted, 'letter-spacing="4"')}${text(105, 290, 'READ THIS', 138, ink, 'font-weight="700" letter-spacing="-5"')}${text(105, 436, 'RIGHT WAY →', 135, teal, 'font-weight="700" letter-spacing="-6"')}<path d="M107 490H1293" stroke="${ink}" stroke-width="3"/>${text(105, 568, 'R  F  2  7  9', 65, ink, 'font-weight="700" letter-spacing="10"')}${text(105, 627, 'Asymmetry makes reflection visible.', 31, muted)}`;
	const colours = [ink, teal, '#76a38e', '#d6dec8', '#e5bb70', amber, '#a65e4e', '#f7f1dc'];
	for (const [index, colour] of colours.entries()) {
		const x = 107 + index * 148;
		body += `<rect x="${x}" y="691" width="135" height="126" fill="${colour}" stroke="${ink}" stroke-width="1"/>${text(x + 67, 853, String(index + 1).padStart(2, '0'), 20, muted, 'text-anchor="middle"')}`;
	}
	body += `${text(107, 901, 'COLOUR · LETTERFORMS · HANDEDNESS', 22, muted, 'letter-spacing="3"')}`;
	return svg(body);
}

export function createSampleSources(renderText = text) {
	return {
		calibration: calibration(renderText),
		facade: facade(renderText),
		portrait: portrait(renderText),
		corridor: corridor(renderText),
		typography: typography(renderText)
	};
}

export async function renderSamples({ outputDirectory = directory, checking = false } = {}) {
	const samples = createSampleSources();
	const manifest = {
		width,
		height,
		authorship:
			'Original procedural SVG illustrations created for the Lens and Mirror Lab. No third-party source images.',
		labelArtworkSha256: hash(JSON.stringify(labelArtwork)),
		samples: {}
	};
	if (!checking) await mkdir(outputDirectory, { recursive: true });
	for (const [id, source] of Object.entries(samples)) {
		const bytes = await sharp(Buffer.from(source))
			.png({ compressionLevel: 9, palette: false })
			.toBuffer();
		const pixelHash = hash(await sharp(bytes).ensureAlpha().raw().toBuffer());
		manifest.samples[id] = { file: `${id}.png`, svgHash: hash(source), pixelHash };
		if (checking) {
			const existing = await readFile(path.join(outputDirectory, `${id}.png`));
			const metadata = await sharp(existing).metadata();
			if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height)
				throw new Error(`${id}.png has an unexpected format or dimensions.`);
			if (hash(await sharp(existing).ensureAlpha().raw().toBuffer()) !== pixelHash)
				throw new Error(`${id}.png differs from its procedural source.`);
		} else {
			await writeFile(path.join(outputDirectory, `${id}.png`), bytes);
		}
	}
	if (checking) {
		const recorded = JSON.parse(await readFile(path.join(outputDirectory, 'samples.json'), 'utf8'));
		if (JSON.stringify(recorded) !== JSON.stringify(manifest))
			throw new Error(
				'Lens-lab sample source or label provenance changed; review and regenerate samples.'
			);
	} else {
		await writeFile(
			path.join(outputDirectory, 'samples.json'),
			JSON.stringify(manifest, null, 2) + '\n'
		);
	}
	return manifest;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	const checking = process.argv.includes('--check');
	const manifest = await renderSamples({ checking });
	console.log(
		`${checking ? 'Verified' : 'Generated'} ${Object.keys(manifest.samples).length} original lens-lab samples (${width} × ${height}).`
	);
}
