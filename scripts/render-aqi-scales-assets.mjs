import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	ALL_PRESET_COMPARISONS,
	AQI_EXPLAINER_ENGINE_VERSION,
	DEFAULT_PM25_PRESET,
	INDIA_CPCB_PM25_BANDS,
	PERSISTENT_SCALE_NOTE,
	SHARED_CONCENTRATION_STRIP_MAX,
	SOURCES_CHECKED_DATE,
	US_EPA_PM25_BANDS,
	comparePm25Preset
} from '../src/lib/visualizations/why-two-aqi-apps-show-different-numbers/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'why-two-aqi-apps-show-different-numbers';
const outputDir = path.join(root, 'static', 'images', 'visualizations', slug);
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	`src/lib/visualizations/${slug}/model.ts`,
	`src/lib/visualizations/${slug}/index.ts`,
	'scripts/render-aqi-scales-assets.mjs'
];

async function computeSourceHash() {
	const hash = createHash('sha256');
	for (const rel of sourceFiles) {
		const text = (await readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');
		hash.update(rel).update('\0').update(text).update('\0');
	}
	return hash.digest('hex');
}

async function rawPixelSha256(pngBytes) {
	const raw = await sharp(pngBytes).ensureAlpha().raw().toBuffer();
	return createHash('sha256').update(raw).digest('hex');
}

const expectedFiles = {
	'social.png': [1200, 630],
	'default-comparison.png': [1200, 750]
};

const sourceHash = await computeSourceHash();

if (checkMode) {
	const manifestPath = path.join(outputDir, 'assets.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

	if (manifest.sourceHash !== sourceHash) {
		throw new Error(
			'AQI Scales assets are stale relative to model/script sources. Run npm run aqi-scales:assets.'
		);
	}
	if (manifest.engineVersion !== AQI_EXPLAINER_ENGINE_VERSION) {
		throw new Error('AQI Scales assets engineVersion mismatch.');
	}

	for (const [name, [expectedW, expectedH]] of Object.entries(expectedFiles)) {
		const bytes = await readFile(path.join(outputDir, name));
		if (bytes.length > 750 * 1024) {
			throw new Error(`AQI Scales asset exceeds 750 KiB: ${name}`);
		}
		const meta = await sharp(bytes).metadata();
		if (meta.width !== expectedW || meta.height !== expectedH) {
			throw new Error(
				`AQI Scales asset ${name} has dimensions ${meta.width}x${meta.height}; expected ${expectedW}x${expectedH}.`
			);
		}
		const actualHash = await rawPixelSha256(bytes);
		if (actualHash !== manifest.files[name]?.pixelSha256) {
			throw new Error(`AQI Scales asset pixel hash mismatch: ${name}`);
		}
	}

	console.log(
		'Why two AQI apps show different numbers: verified social.png, default-comparison.png, and assets.json.'
	);
	process.exit(0);
}

await mkdir(outputDir, { recursive: true });

const defaultComparison = comparePm25Preset(DEFAULT_PM25_PRESET);

const bandFill = {
	good: '#DCEFE2',
	satisfactory: '#E4F0D5',
	moderate: '#FAEFD2',
	usg: '#FBE3CE',
	unhealthy: '#FADAD6',
	poor: '#F8DFD2',
	'very-poor': '#EED9EC',
	severe: '#E7D4D8'
};

function renderBandStripRects(bands, y, left, width) {
	let prev = 0;
	const parts = [];
	for (const band of bands) {
		if (prev >= SHARED_CONCENTRATION_STRIP_MAX) break;
		const end = Math.min(SHARED_CONCENTRATION_STRIP_MAX, band.concHigh);
		const x = left + (prev / SHARED_CONCENTRATION_STRIP_MAX) * width;
		const w = ((end - prev) / SHARED_CONCENTRATION_STRIP_MAX) * width;
		parts.push(
			`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="28" fill="${bandFill[band.accentToken]}" stroke="#8D806B" stroke-width="1"/>`
		);
		if (band.concHigh < SHARED_CONCENTRATION_STRIP_MAX) {
			parts.push(
				`<text x="${(x + w - 9).toFixed(1)}" y="${y + 19}" text-anchor="end" fill="#1E1B16" font-family="Arial, sans-serif" font-size="12" font-weight="700">${band.indexHigh}</text>`
			);
		}
		prev = end;
	}
	return parts.join('\n  ');
}

// 1. Build default-comparison.png (1200 x 750) — editorial warm-paper figure with units, 24-h window & PM2.5 qualification
const stripLeft = 236;
const stripWidth = 880;
const markerX =
	stripLeft + (defaultComparison.concentrationUgM3 / SHARED_CONCENTRATION_STRIP_MAX) * stripWidth;

const presetSummaryCells = ALL_PRESET_COMPARISONS.map((row, idx) => {
	const x = 64 + idx * 272;
	const active = row.concentrationUgM3 === DEFAULT_PM25_PRESET;
	return `
  <rect x="${x}" y="592" width="256" height="84" rx="8" fill="${active ? '#FFFFFF' : '#F2ECE0'}" stroke="${active ? '#1A4D6E' : '#C9BFA9'}" stroke-width="${active ? '2' : '1.2'}"/>
  <text x="${x + 16}" y="618" fill="#1E1B16" font-family="Arial, sans-serif" font-size="15" font-weight="700">${row.concentrationUgM3} µg/m³ (24-hr PM2.5)</text>
  <text x="${x + 16}" y="642" fill="#3A5F20" font-family="Arial, sans-serif" font-size="13.5" font-weight="700">India: ${row.india.subIndex} — ${row.india.category}</text>
  <text x="${x + 16}" y="663" fill="#992319" font-family="Arial, sans-serif" font-size="13.5" font-weight="700">US: ${row.us.subIndex} — ${row.us.category}</text>`;
}).join('\n');

const comparisonSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <rect width="1200" height="750" fill="#FAF7F0"/>
  <rect x="24" y="24" width="1152" height="702" rx="16" fill="#FAF7F0" stroke="#C9BFA9" stroke-width="1.5"/>
  <rect x="24" y="24" width="1152" height="6" rx="3" fill="#1A4D6E"/>

  <!-- Header -->
  <text x="64" y="68" fill="#534B3E" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1.4">CONTROLLED SCALE COMPARISON · PM2.5 SUB-INDEX ONLY</text>
  <text x="64" y="108" fill="#1E1B16" font-family="Arial, sans-serif" font-size="34" font-weight="700">Why two AQI apps show different numbers</text>
  <text x="64" y="138" fill="#534B3E" font-family="Arial, sans-serif" font-size="17">Shared input: PM2.5 = ${defaultComparison.concentrationUgM3} µg/m³ (micrograms of fine-particle material per cubic metre of air), averaged over the same 24 hours</text>

  <!-- Two Side-by-Side Result Cards -->
  <rect x="64" y="162" width="520" height="196" rx="12" fill="#FFFFFF" stroke="#C9BFA9" stroke-width="1.5"/>
  <rect x="64" y="162" width="8" height="196" rx="4" fill="#497523"/>
  <text x="94" y="196" fill="#1E1B16" font-family="Arial, sans-serif" font-size="20" font-weight="700">India CPCB</text>
  <text x="94" y="219" fill="#534B3E" font-family="Arial, sans-serif" font-size="14">Same input: ${defaultComparison.concentrationUgM3} µg/m³ · same 24-hour average</text>
  <text x="94" y="250" fill="#534B3E" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="0.8">AQI SCORE FOR PM2.5</text>
  <text x="94" y="308" fill="#1E1B16" font-family="Arial, sans-serif" font-size="56" font-weight="700">${defaultComparison.india.subIndex}</text>
  <rect x="208" y="272" width="154" height="36" rx="18" fill="#E4F0D5" stroke="#497523" stroke-width="1.4"/>
  <text x="285" y="295" text-anchor="middle" fill="#1E1B16" font-family="Arial, sans-serif" font-size="16" font-weight="700">${defaultComparison.india.category}</text>
  <text x="94" y="340" fill="#534B3E" font-family="Arial, sans-serif" font-size="13.5">CPCB 31–60 µg/m³ band (index 51–100) · PM2.5 score only</text>

  <rect x="616" y="162" width="520" height="196" rx="12" fill="#FFFFFF" stroke="#C9BFA9" stroke-width="1.5"/>
  <rect x="616" y="162" width="8" height="196" rx="4" fill="#A6261B"/>
  <text x="646" y="196" fill="#1E1B16" font-family="Arial, sans-serif" font-size="20" font-weight="700">Current US EPA</text>
  <text x="646" y="219" fill="#534B3E" font-family="Arial, sans-serif" font-size="14">Same input: ${defaultComparison.concentrationUgM3} µg/m³ · same 24-hour average</text>
  <text x="646" y="250" fill="#534B3E" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="0.8">AQI SCORE FOR PM2.5</text>
  <text x="646" y="308" fill="#1E1B16" font-family="Arial, sans-serif" font-size="56" font-weight="700">${defaultComparison.us.subIndex}</text>
  <rect x="760" y="272" width="142" height="36" rx="18" fill="#FADAD6" stroke="#A6261B" stroke-width="1.4"/>
  <text x="831" y="295" text-anchor="middle" fill="#1E1B16" font-family="Arial, sans-serif" font-size="16" font-weight="700">${defaultComparison.us.category}</text>
  <text x="646" y="340" fill="#534B3E" font-family="Arial, sans-serif" font-size="13.5">EPA 55.5–125.4 µg/m³ band (index 151–200) · PM2.5 score only</text>

  <!-- Shared Concentration Axis Strip -->
  <rect x="64" y="376" width="1072" height="156" rx="10" fill="#FFFFFF" stroke="#C9BFA9" stroke-width="1.2"/>
  <text x="84" y="403" fill="#1E1B16" font-family="Arial, sans-serif" font-size="14.5" font-weight="700">Shared 24-hour PM2.5 concentration axis (0 to 130 µg/m³ — band top scores shown)</text>

  <text x="84" y="438" fill="#1E1B16" font-family="Arial, sans-serif" font-size="14" font-weight="700">India CPCB</text>
  ${renderBandStripRects(INDIA_CPCB_PM25_BANDS, 418, stripLeft, stripWidth)}

  <text x="84" y="482" fill="#1E1B16" font-family="Arial, sans-serif" font-size="14" font-weight="700">Current US EPA</text>
  ${renderBandStripRects(US_EPA_PM25_BANDS, 462, stripLeft, stripWidth)}

  <line x1="${stripLeft}" y1="500" x2="${stripLeft + stripWidth}" y2="500" stroke="#534B3E" stroke-width="1.2"/>
  ${[0, 30, 60, 90, 120]
		.map((tick) => {
			const tx = stripLeft + (tick / SHARED_CONCENTRATION_STRIP_MAX) * stripWidth;
			return `<line x1="${tx.toFixed(1)}" y1="500" x2="${tx.toFixed(1)}" y2="506" stroke="#534B3E" stroke-width="1.2"/>
  <text x="${tx.toFixed(1)}" y="521" text-anchor="middle" fill="#534B3E" font-family="Arial, sans-serif" font-size="12.5" font-weight="700">${tick}${tick === 120 ? ' µg/m³' : ''}</text>`;
		})
		.join('\n  ')}

  <line x1="${markerX.toFixed(1)}" y1="410" x2="${markerX.toFixed(1)}" y2="500" stroke="#1E1B16" stroke-width="2.8"/>
  <circle cx="${markerX.toFixed(1)}" cy="432" r="5.5" fill="#1E1B16" stroke="#FFFFFF" stroke-width="2"/>
  <circle cx="${markerX.toFixed(1)}" cy="476" r="5.5" fill="#1E1B16" stroke="#FFFFFF" stroke-width="2"/>

  <!-- Key Takeaway Banner -->
  <rect x="64" y="544" width="1072" height="36" rx="6" fill="#F2ECE0"/>
  <text x="82" y="567" fill="#1E1B16" font-family="Arial, sans-serif" font-size="15" font-weight="700">${defaultComparison.dynamicNote} ${PERSISTENT_SCALE_NOTE}</text>

  <!-- Four Verified Presets Row (showing the ordering reversal at 90 & 120) -->
  ${presetSummaryCells}

  <!-- Qualification Footer -->
  <text x="64" y="704" fill="#534B3E" font-family="Arial, sans-serif" font-size="13">Qualification: Scores above are for 24-hour PM2.5 alone; another monitored pollutant can set the overall AQI. Sources checked ${SOURCES_CHECKED_DATE} · suvroghosh.in</text>
</svg>
`);

const comparisonBuffer = await sharp(comparisonSvg)
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'default-comparison.png'), comparisonBuffer);

// 2. Build social.png (1200 x 630) — crisp OpenGraph & gallery card
const socialSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#15181C"/>
  <rect x="22" y="22" width="1156" height="586" rx="16" fill="#1D2228" stroke="#38414C" stroke-width="1.5"/>
  <rect x="58" y="54" width="44" height="6" rx="3" fill="#7EC4E8"/>
  <text x="116" y="63" fill="#7EC4E8" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.2">INTERACTIVE EXPLAINER · SAME 24-HOUR PM2.5 INPUT</text>

  <text x="58" y="116" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="44" font-weight="700">Why two AQI apps show different numbers</text>
  <text x="58" y="154" fill="#C2BCB0" font-family="Arial, sans-serif" font-size="20">Shared measurement: 60 µg/m³ of PM2.5 over the same 24 hours (PM2.5 sub-index only)</text>

  <!-- Left Card: India CPCB -->
  <rect x="58" y="184" width="522" height="274" rx="12" fill="#15181C" stroke="#38414C" stroke-width="1.5"/>
  <rect x="58" y="184" width="8" height="274" rx="4" fill="#86C94D"/>
  <text x="90" y="224" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="24" font-weight="700">India CPCB</text>
  <text x="90" y="252" fill="#C2BCB0" font-family="Arial, sans-serif" font-size="16">60 µg/m³ · same 24-hour average · PM2.5 score</text>
  <text x="90" y="352" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="84" font-weight="700">${defaultComparison.india.subIndex}</text>
  <rect x="262" y="304" width="176" height="44" rx="22" fill="#26391B" stroke="#86C94D" stroke-width="1.5"/>
  <text x="350" y="332" text-anchor="middle" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="20" font-weight="700">${defaultComparison.india.category}</text>
  <text x="90" y="416" fill="#C2BCB0" font-family="Arial, sans-serif" font-size="16">At 90 µg/m³, ordering reverses: India 200 vs US 175</text>

  <!-- Right Card: Current US EPA -->
  <rect x="620" y="184" width="522" height="274" rx="12" fill="#15181C" stroke="#38414C" stroke-width="1.5"/>
  <rect x="620" y="184" width="8" height="274" rx="4" fill="#F0756A"/>
  <text x="652" y="224" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="24" font-weight="700">Current US EPA</text>
  <text x="652" y="252" fill="#C2BCB0" font-family="Arial, sans-serif" font-size="16">60 µg/m³ · same 24-hour average · PM2.5 score</text>
  <text x="652" y="352" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="84" font-weight="700">${defaultComparison.us.subIndex}</text>
  <rect x="824" y="304" width="164" height="44" rx="22" fill="#421E1C" stroke="#F0756A" stroke-width="1.5"/>
  <text x="906" y="332" text-anchor="middle" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="20" font-weight="700">${defaultComparison.us.category}</text>
  <text x="652" y="416" fill="#C2BCB0" font-family="Arial, sans-serif" font-size="16">At 120 µg/m³: India 300 (Poor) vs US 196 (Unhealthy)</text>

  <!-- Bottom Takeaway -->
  <rect x="58" y="476" width="1084" height="66" rx="10" fill="#242B33" stroke="#38414C"/>
  <text x="82" y="503" fill="#F1EEE8" font-family="Arial, sans-serif" font-size="17" font-weight="700">${defaultComparison.dynamicNote}</text>
  <text x="82" y="528" fill="#7EC4E8" font-family="Arial, sans-serif" font-size="16" font-weight="700">${PERSISTENT_SCALE_NOTE}</text>

  <text x="58" y="576" fill="#C2BCB0" font-family="Courier New, monospace" font-size="14.5">PM2.5 SCORE ONLY (HIGHEST POLLUTANT SETS OVERALL AQI)   ·   CPCB &amp; EPA BANDS   ·   SUVROGHOSH.IN</text>
</svg>
`);

const socialBuffer = await sharp(socialSvg)
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'social.png'), socialBuffer);

const manifestFiles = {
	'social.png': {
		width: 1200,
		height: 630,
		bytes: socialBuffer.length,
		pixelSha256: await rawPixelSha256(socialBuffer)
	},
	'default-comparison.png': {
		width: 1200,
		height: 750,
		bytes: comparisonBuffer.length,
		pixelSha256: await rawPixelSha256(comparisonBuffer)
	}
};

await writeFile(
	path.join(outputDir, 'assets.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			engineVersion: AQI_EXPLAINER_ENGINE_VERSION,
			sourcesCheckedDate: SOURCES_CHECKED_DATE,
			sourceHash,
			sources: sourceFiles,
			files: manifestFiles
		},
		null,
		2
	)}\n`
);

console.log(
	'Why two AQI apps show different numbers: generated social.png, default-comparison.png, and assets.json.'
);
