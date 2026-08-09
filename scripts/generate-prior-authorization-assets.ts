import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import {
	FHIR_BASELINE_EXPECTED,
	compilePriorAuthorizationScenario,
	stringifySyntheticFhirFixture
} from '../src/lib/visualizations/prior-authorization/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTER_PATH = path.join(
	ROOT,
	'static',
	'images',
	'visualizations',
	'prior-authorization-machine.png'
);
const FHIR_PATH = path.join(
	ROOT,
	'static',
	'data',
	'prior-authorization',
	'maya-lumbar-mri-fhir-r4.json'
);

const WIDTH = 1_600;
const HEIGHT = 900;
const DAY_MS = 86_400_000;

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function formatHumanWork(seconds: number): string {
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatMachine(ms: number): string {
	return ms >= 1_000 ? `${(ms / 1_000).toFixed(3)} s` : `${ms} ms`;
}

function renderMilestones(
	milestones: readonly { label: string; shortLabel: string; index: number }[],
	activeFill: string
): string {
	return milestones
		.map((milestone) => {
			const row = milestone.index < 6 ? 0 : 1;
			const column = milestone.index % 6;
			const x = 110 + column * 250;
			const y = 288 + row * 148;
			const words = milestone.shortLabel.split(' ');
			const firstLine = words.slice(0, Math.ceil(words.length / 2)).join(' ');
			const secondLine = words.slice(Math.ceil(words.length / 2)).join(' ');
			return `
				<g transform="translate(${x} ${y})">
					<circle cx="0" cy="0" r="24" fill="${activeFill}" stroke="#d7e8ef" stroke-width="2" />
					<text x="0" y="7" text-anchor="middle" class="step-number">${milestone.index + 1}</text>
					<text x="40" y="-4" class="step-label">${escapeXml(firstLine)}</text>
					${secondLine ? `<text x="40" y="18" class="step-label">${escapeXml(secondLine)}</text>` : ''}
				</g>`;
		})
		.join('');
}

function renderPosterSvg(): string {
	const portal = compilePriorAuthorizationScenario({ pathway: 'portal-fax', failureId: 'none' });
	const fhir = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled', failureId: 'none' });

	if (portal.case !== fhir.case || portal.policy !== fhir.policy) {
		throw new Error('Poster runs do not share the canonical immutable case and policy objects.');
	}
	if (fhir.clocks.patientElapsedMinutes !== FHIR_BASELINE_EXPECTED.patientElapsedMinutes) {
		throw new Error('FHIR poster run no longer compiles to exactly 15,840 minutes.');
	}
	const declared400ms = fhir.events.filter(
		(event) => event.machineProcessingMs === FHIR_BASELINE_EXPECTED.declaredTransactionMs
	);
	if (
		declared400ms.length !== 1 ||
		declared400ms[0]?.id !== FHIR_BASELINE_EXPECTED.declaredTransactionEventId
	) {
		throw new Error('FHIR poster run must contain exactly one declared 400-ms transaction.');
	}

	const portalDays = portal.clocks.patientElapsedMs / DAY_MS;
	const fhirDays = fhir.clocks.patientElapsedMs / DAY_MS;
	const maxDays = Math.max(portalDays, fhirDays);
	const barWidth = 1_050;
	const portalWidth = (portalDays / maxDays) * barWidth;
	const fhirWidth = (fhirDays / maxDays) * barWidth;
	const milestoneMarkup = renderMilestones(fhir.milestones, '#d98d68');

	return `<?xml version="1.0" encoding="UTF-8"?>
	<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
		<title id="title">The Prior Authorization Machine</title>
		<desc id="description">A fictional lumbar MRI request crosses twelve milestones. Portal and fax take eighteen modeled days; the FHIR-enabled counterfactual takes eleven modeled days while one declared transaction takes four hundred milliseconds.</desc>
		<defs>
			<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#07131c" />
				<stop offset="1" stop-color="#163243" />
			</linearGradient>
			<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
				<feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#02080d" flood-opacity="0.45" />
			</filter>
		</defs>
		<style>
			.title { font: 800 53px Arial, sans-serif; letter-spacing: -1.6px; fill: #f5f0e5; }
			.eyebrow { font: 700 17px Arial, sans-serif; letter-spacing: 4px; fill: #8fd4df; }
			.subtitle { font: 400 24px Georgia, serif; fill: #c7d9df; }
			.step-number { font: 800 20px Arial, sans-serif; fill: #07131c; }
			.step-label { font: 700 17px Arial, sans-serif; fill: #eef5f4; }
			.lane-label { font: 700 19px Arial, sans-serif; fill: #e6eff1; }
			.lane-value { font: 800 25px Arial, sans-serif; fill: #ffffff; }
			.card-label { font: 700 14px Arial, sans-serif; letter-spacing: 1.6px; fill: #9bb6bf; }
			.card-value { font: 800 27px Arial, sans-serif; fill: #f5f0e5; }
			.card-note { font: 400 15px Arial, sans-serif; fill: #afc5cb; }
			.footer { font: 700 21px Georgia, serif; fill: #f5e2c8; }
			.synthetic { font: 700 14px Arial, sans-serif; letter-spacing: 1.4px; fill: #f3b58c; }
		</style>
		<rect width="1600" height="900" fill="url(#background)" />
		<path d="M0 218 H1600" stroke="#6ca3b0" stroke-opacity="0.25" />
		<text x="76" y="66" class="eyebrow">THE PATIENT THROUGH THE MACHINE · PART 1 · WAIT</text>
		<text x="76" y="130" class="title">The Prior Authorization Machine</text>
		<text x="76" y="177" class="subtitle">A patient, an MRI, and the invisible decisions between them</text>
		<g transform="translate(1250 55)">
			<rect width="274" height="112" rx="18" fill="#0d222f" stroke="#d98d68" stroke-width="2" />
			<text x="22" y="31" class="synthetic">SYNTHETIC CASE</text>
			<text x="22" y="64" class="lane-value">Maya Sen</text>
			<text x="22" y="89" class="card-note">Non-urgent lumbar MRI · no PHI</text>
		</g>

		<path d="M120 288 H1470 M120 436 H1470" stroke="#c7d9df" stroke-opacity="0.18" stroke-width="4" stroke-linecap="round" />
		${milestoneMarkup}

		<g transform="translate(76 545)" filter="url(#shadow)">
			<rect width="1448" height="148" rx="22" fill="#0b202c" stroke="#597784" stroke-opacity="0.8" />
			<text x="30" y="39" class="lane-label">Portal + fax</text>
			<rect x="190" y="19" width="${barWidth}" height="28" rx="14" fill="#213b48" />
			<rect x="190" y="19" width="${portalWidth.toFixed(2)}" height="28" rx="14" fill="#d98d68" />
			<text x="1265" y="42" class="lane-value">${portalDays} days</text>
			<text x="30" y="101" class="lane-label">FHIR-enabled</text>
			<rect x="190" y="81" width="${barWidth}" height="28" rx="14" fill="#213b48" />
			<rect x="190" y="81" width="${fhirWidth.toFixed(2)}" height="28" rx="14" fill="#68bfaa" />
			<text x="1265" y="104" class="lane-value">${fhirDays} days</text>
			<text x="190" y="132" class="card-note">Same patient · same fictional policy · different plumbing</text>
		</g>

		<g transform="translate(76 718)">
			<g>
				<rect width="340" height="105" rx="18" fill="#102936" stroke="#4d6e7b" />
				<text x="22" y="29" class="card-label">PATIENT ELAPSED</text>
				<text x="22" y="64" class="card-value">18 days → 11 days</text>
				<text x="22" y="87" class="card-note">wall time through queues and scheduling</text>
			</g>
			<g transform="translate(365 0)">
				<rect width="340" height="105" rx="18" fill="#102936" stroke="#4d6e7b" />
				<text x="22" y="29" class="card-label">ACTIVE HUMAN WORK</text>
				<text x="22" y="64" class="card-value">${escapeXml(formatHumanWork(portal.clocks.activeHumanWorkSeconds))} → ${escapeXml(formatHumanWork(fhir.clocks.activeHumanWorkSeconds))}</text>
				<text x="22" y="87" class="card-note">declared hands-on effort across roles</text>
			</g>
			<g transform="translate(730 0)">
				<rect width="340" height="105" rx="18" fill="#102936" stroke="#4d6e7b" />
				<text x="22" y="29" class="card-label">AUTOMATED PROCESSING</text>
				<text x="22" y="64" class="card-value">${escapeXml(formatMachine(portal.clocks.automatedProcessingMs))} → ${escapeXml(formatMachine(fhir.clocks.automatedProcessingMs))}</text>
				<text x="22" y="87" class="card-note">independent of patient and staff clocks</text>
			</g>
			<g transform="translate(1095 0)">
				<rect width="353" height="105" rx="18" fill="#4b2b24" stroke="#d98d68" />
				<text x="22" y="29" class="card-label">ONE DECLARED EVENT</text>
				<text x="22" y="64" class="card-value">CRD · exactly 400 ms</text>
				<text x="22" y="87" class="card-note">authored fixture fact, not a benchmark</text>
			</g>
		</g>
		<text x="800" y="867" text-anchor="middle" class="footer">“In this fictional case, one transaction took 400 ms. The journey took 11 days.”</text>
	</svg>`;
}

async function generateAssets(): Promise<{ poster: Buffer; fhir: Buffer }> {
	const svg = renderPosterSvg();
	const poster = await sharp(Buffer.from(svg))
		.png({ compressionLevel: 9, palette: true, quality: 100 })
		.toBuffer();
	const fhir = Buffer.from(`${stringifySyntheticFhirFixture(2).trimEnd()}\n`, 'utf8');
	return { poster, fhir };
}

async function assertCurrent(filePath: string, expected: Buffer, label: string): Promise<void> {
	let actual: Buffer;
	try {
		actual = await readFile(filePath);
	} catch {
		throw new Error(`${label} is missing: ${filePath}`);
	}
	if (!actual.equals(expected)) {
		throw new Error(
			`${label} is stale: ${filePath}\nRun npm run prior-authorization:assets to regenerate it.`
		);
	}
}

async function main(): Promise<void> {
	const checkOnly = process.argv.includes('--check');
	const generated = await generateAssets();

	if (checkOnly) {
		await Promise.all([
			assertCurrent(POSTER_PATH, generated.poster, 'Prior-authorization poster'),
			assertCurrent(FHIR_PATH, generated.fhir, 'Synthetic FHIR download')
		]);
		console.log('Prior-authorization poster and synthetic FHIR download are current.');
		return;
	}

	await Promise.all([
		mkdir(path.dirname(POSTER_PATH), { recursive: true }),
		mkdir(path.dirname(FHIR_PATH), { recursive: true })
	]);
	await Promise.all([
		writeFile(POSTER_PATH, generated.poster),
		writeFile(FHIR_PATH, generated.fhir)
	]);
	console.log(`Generated ${POSTER_PATH}`);
	console.log(`Generated ${FHIR_PATH}`);
}

const isDirectExecution =
	process.argv[1] !== undefined &&
	pathToFileURL(path.resolve(process.argv[1])).href ===
		pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isDirectExecution) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
