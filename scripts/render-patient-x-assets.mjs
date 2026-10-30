import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	generatePatient,
	patientToCsv,
	patientToJson,
	MEASURES,
	MEASURE_ORDER
} from '../src/lib/visualizations/patient-x/model.ts';

const root = new URL('../', import.meta.url);
const imageDir = new URL('static/images/visualizations/patient-x/', root);
const dataDir = new URL('static/data/patient-x/', root);
const check = process.argv.includes('--check');
const data = generatePatient();
const colours = { phq9: '#a64b3b', asrm: '#82602b', who5: '#286a73' };
const labels = {
	phq9: 'Depressive symptoms',
	asrm: 'Elevated mood &amp; activity',
	who5: 'Reported well-being'
};
const charts = MEASURE_ORDER.map((id, index) => {
	const measure = MEASURES[id];
	const top = 110 + index * 142;
	const bottom = top + 96;
	const points = data.assessments.map((assessment, i) => ({
		x: 640 + i * 94,
		y: bottom - (assessment.measures[id].total / measure.scoreMax) * 66,
		value: assessment.measures[id].total,
		week: assessment.week
	}));
	return `<g font-family="Arial,sans-serif">
	<text x="640" y="${top}" font-size="21" font-weight="600" fill="#263534">${labels[id]}</text>
	<text x="1110" y="${top}" text-anchor="end" font-size="17" fill="#5d6866">${measure.name} · 0–${measure.scoreMax}</text>
	<line x1="640" y1="${bottom}" x2="1110" y2="${bottom}" stroke="#c4ccc6"/>
	<polyline points="${points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${colours[id]}" stroke-width="3"/>
	${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${colours[id]}"/><text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="18" fill="${colours[id]}">${p.value}</text>`).join('')}
	${index === 2 ? points.map((p) => `<text x="${p.x}" y="${bottom + 28}" text-anchor="middle" font-size="16" fill="#5d6866">W${p.week}</text>`).join('') : ''}
	</g>`;
}).join('');
const svg =
	`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f8f6f0"/>
<path d="M64 58H1136" stroke="#263534" stroke-width="2"/>
<g font-family="Arial,sans-serif" fill="#263534">
<text x="64" y="108" font-size="19" letter-spacing="1.5">PATIENT X · FICTIONAL DATA</text>
<text x="60" y="205" font-size="57" font-weight="700">What the scores</text>
<text x="60" y="274" font-size="57" font-weight="700">leave out.</text>
<text x="64" y="342" font-size="25">Depression and bipolar disorder</text>
<text x="64" y="383" font-size="22" fill="#5d6866">Three questionnaires. Twelve weeks.</text>
<text x="64" y="421" font-size="22" fill="#5d6866">See the answers behind the graphs.</text>
<path d="M590 100V515" stroke="#c4ccc6"/>
<text x="64" y="574" font-size="18" fill="#5d6866">An educational walkthrough. These charts cannot diagnose a person.</text>
<text x="1136" y="574" text-anchor="end" font-size="18">SUVROGHOSH.IN</text>
</g>${charts}</svg>`.replace(/[\t ]+$/gm, '');

const files = [
	[new URL('social.svg', imageDir), svg],
	[new URL('example.json', dataDir), patientToJson(data) + '\n'],
	[new URL('example.csv', dataDir), patientToCsv(data) + '\r\n']
];
if (check) {
	for (const [url, expected] of files) {
		if ((await readFile(url, 'utf8')) !== expected)
			throw new Error(`Patient X generated asset is stale: ${fileURLToPath(url)}`);
	}
	const png = await sharp(fileURLToPath(new URL('social.png', imageDir))).metadata();
	if (png.width !== 1200 || png.height !== 630 || png.format !== 'png')
		throw new Error('Patient X social card must be a 1200 × 630 PNG.');
	console.log('Patient X: synthetic JSON/CSV, chart source and social card verified.');
} else {
	await mkdir(imageDir, { recursive: true });
	await mkdir(dataDir, { recursive: true });
	for (const [url, contents] of files) await writeFile(url, contents);
	await sharp(Buffer.from(svg))
		.png()
		.toFile(fileURLToPath(new URL('social.png', imageDir)));
	console.log('Patient X: wrote synthetic JSON/CSV and data-derived social card.');
}
