import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	DEFAULT_BATCH_REPETITIONS,
	DEFAULT_BRIDGE_A_ID,
	DEFAULT_BRIDGE_B_ID,
	DEFAULT_CITY_SEED,
	DEFAULT_EPIDEMIC_PARAMETERS,
	DEFAULT_INITIAL_INFECTED_REGION_ID,
	DEFAULT_VACCINE_BUDGET,
	EPIDEMIC_MOSAIC_ENGINE_VERSION,
	INITIAL_INFECTIONS,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	compareBridgeScenarios,
	compareVaccinationStrategies,
	computePolygonPopulationBands,
	generateCityNetwork,
	runBatchComparison,
	sampleCityStateAtTime
} from '../src/lib/visualizations/the-epidemic-mosaic/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'static', 'images', 'visualizations', 'the-epidemic-mosaic');
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/the-epidemic-mosaic/types.ts',
	'src/lib/visualizations/the-epidemic-mosaic/random.ts',
	'src/lib/visualizations/the-epidemic-mosaic/city.ts',
	'src/lib/visualizations/the-epidemic-mosaic/vaccination.ts',
	'src/lib/visualizations/the-epidemic-mosaic/model.ts',
	'scripts/render-epidemic-mosaic-assets.mjs'
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
	'poster.png': [1200, 750],
	'experiment-bridge.png': [600, 420],
	'experiment-vaccination.png': [600, 420]
};

const sourceHash = await computeSourceHash();

if (checkMode) {
	const manifestPath = path.join(outputDir, 'assets.json');
	const calibrationPath = path.join(outputDir, 'calibration.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	const calibration = JSON.parse(await readFile(calibrationPath, 'utf8'));

	if (manifest.sourceHash !== sourceHash) {
		throw new Error(
			'The Epidemic Mosaic assets are stale relative to engine/script sources. Run npm run epidemic-mosaic:assets.'
		);
	}
	if (calibration.engineVersion !== EPIDEMIC_MOSAIC_ENGINE_VERSION) {
		throw new Error('The Epidemic Mosaic calibration engineVersion mismatch.');
	}
	if (!calibration.bridgeExperiment || !calibration.vaccinationExperiment) {
		throw new Error('The Epidemic Mosaic calibration record must include both experiments.');
	}

	for (const [name, [expectedW, expectedH]] of Object.entries(expectedFiles)) {
		const bytes = await readFile(path.join(outputDir, name));
		if (bytes.length > 750 * 1024) {
			throw new Error(`The Epidemic Mosaic asset exceeds 750 KiB: ${name}`);
		}
		const meta = await sharp(bytes).metadata();
		if (meta.width !== expectedW || meta.height !== expectedH) {
			throw new Error(
				`The Epidemic Mosaic asset ${name} has dimensions ${meta.width}x${meta.height}; expected ${expectedW}x${expectedH}.`
			);
		}
		const actualHash = await rawPixelSha256(bytes);
		if (actualHash !== manifest.files[name]?.pixelSha256) {
			throw new Error(`The Epidemic Mosaic asset pixel hash mismatch: ${name}`);
		}
	}

	console.log(
		'The Epidemic Mosaic: verified social card, computed comparison poster, 2 experiment reference plates, and calibration record.'
	);
	process.exit(0);
}

await mkdir(outputDir, { recursive: true });

const city = generateCityNetwork(DEFAULT_CITY_SEED);
const defaultBridge = { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID };

const bridgePair = compareBridgeScenarios({
	city,
	bridge: defaultBridge,
	parameters: DEFAULT_EPIDEMIC_PARAMETERS,
	initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
	initialInfections: INITIAL_INFECTIONS
});

const vaccinationSet = compareVaccinationStrategies({
	city,
	bridge: defaultBridge,
	vaccineBudget: DEFAULT_VACCINE_BUDGET,
	parameters: DEFAULT_EPIDEMIC_PARAMETERS,
	initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
	initialInfections: INITIAL_INFECTIONS
});

const bridgeBatch = runBatchComparison({
	city,
	experimentMode: 'bridge',
	bridge: defaultBridge,
	parameters: DEFAULT_EPIDEMIC_PARAMETERS,
	repetitions: DEFAULT_BATCH_REPETITIONS
});

const vaccinationBatch = runBatchComparison({
	city,
	experimentMode: 'vaccination',
	bridge: defaultBridge,
	vaccineBudget: DEFAULT_VACCINE_BUDGET,
	parameters: DEFAULT_EPIDEMIC_PARAMETERS,
	repetitions: DEFAULT_BATCH_REPETITIONS
});

function bandFill(compartment) {
	switch (compartment) {
		case 'S':
			return '#3E5463';
		case 'V':
			return 'url(#vaccinated-hatch)';
		case 'R':
			return '#3B9B8E';
		case 'I':
			return '#E8832A';
		default:
			return '#3E5463';
	}
}

function renderCityGroupSvg(sampledState, edges, options = {}) {
	const { showProposedBridge = false } = options;
	const parts = [];

	parts.push(
		`<rect x="0" y="0" width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" rx="8" fill="#0D1113" stroke="#28343B" stroke-width="1.5"/>`
	);

	for (let i = 0; i < city.regions.length; i++) {
		const region = city.regions[i];
		const counts = sampledState.regionCounts[i];
		const bands = computePolygonPopulationBands(region, counts);
		parts.push(`<path d="${region.svgPath}" fill="#25333D"/>`);
		for (const band of bands) {
			parts.push(`<path d="${band.svgPath}" fill="${bandFill(band.compartment)}"/>`);
		}
		parts.push(
			`<path d="${region.svgPath}" fill="none" stroke="#101416" stroke-width="1.4" stroke-linejoin="round"/>`
		);
	}

	for (const [p1, p2] of city.communitySeamSegments) {
		parts.push(
			`<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#090C0E" stroke-width="4" stroke-linecap="round"/>`
		);
		parts.push(
			`<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#758892" stroke-width="1.4" stroke-dasharray="4 4" stroke-linecap="round"/>`
		);
	}

	for (const edge of edges) {
		const src = city.regions[edge.sourceIndex];
		const tgt = city.regions[edge.targetIndex];
		parts.push(
			`<line x1="${src.centroid[0]}" y1="${src.centroid[1]}" x2="${tgt.centroid[0]}" y2="${tgt.centroid[1]}" stroke="#0A0E11" stroke-width="${edge.isBridge ? 5.2 : 2.6}" stroke-linecap="round" opacity="0.88"/>`
		);
		parts.push(
			`<line x1="${src.centroid[0]}" y1="${src.centroid[1]}" x2="${tgt.centroid[0]}" y2="${tgt.centroid[1]}" stroke="${edge.isBridge ? '#FFAA4C' : '#DAE4E8'}" stroke-opacity="${edge.isBridge ? '1' : '0.46'}" stroke-width="${edge.isBridge ? 2.9 : 1.25}" stroke-linecap="round"/>`
		);
	}

	if (showProposedBridge) {
		const regA = city.regionById.get(DEFAULT_BRIDGE_A_ID);
		const regB = city.regionById.get(DEFAULT_BRIDGE_B_ID);
		parts.push(
			`<line x1="${regA.centroid[0]}" y1="${regA.centroid[1]}" x2="${regB.centroid[0]}" y2="${regB.centroid[1]}" stroke="#101416" stroke-width="4.4" stroke-dasharray="6 5" stroke-linecap="round"/>`
		);
		parts.push(
			`<line x1="${regA.centroid[0]}" y1="${regA.centroid[1]}" x2="${regB.centroid[0]}" y2="${regB.centroid[1]}" stroke="#FFAA4C" stroke-width="2.2" stroke-dasharray="6 5" stroke-linecap="round" opacity="0.8"/>`
		);
	}

	for (const region of city.regions) {
		const isSpecial =
			region.id === DEFAULT_INITIAL_INFECTED_REGION_ID ||
			region.id === DEFAULT_BRIDGE_A_ID ||
			region.id === DEFAULT_BRIDGE_B_ID;
		parts.push(
			`<circle cx="${region.centroid[0]}" cy="${region.centroid[1]}" r="${isSpecial ? 4.2 : 2.8}" fill="${region.id === DEFAULT_INITIAL_INFECTED_REGION_ID ? '#FFAA4C' : isSpecial ? '#F3F1E9' : '#182227'}" stroke="#0D1113" stroke-width="1.3"/>`
		);
	}

	return parts.join('\n');
}

async function renderCityPlatePng(sampledState, edges, width, height, options = {}) {
	const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" viewBox="0 0 ${LOGICAL_WIDTH} ${LOGICAL_HEIGHT}">
  <defs>
    <pattern id="vaccinated-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="8" height="8" fill="#8B72BE"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="#E4DAF6" stroke-width="3.2"/>
    </pattern>
  </defs>
  ${renderCityGroupSvg(sampledState, edges, options)}
</svg>
`);
	return sharp(svg)
		.resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
		.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
		.toBuffer();
}

const snapshotDay = 58;
const withoutDay58 = sampleCityStateAtTime(bridgePair.withoutBridge, snapshotDay);
const withDay58 = sampleCityStateAtTime(bridgePair.withBridge, snapshotDay);
const vaccBridgeDay58 = sampleCityStateAtTime(
	vaccinationSet.results['around-the-bridge'],
	snapshotDay
);

const generatedBuffers = new Map();

// 1. experiment-bridge.png (600 x 420)
const bridgePlateBuf = await renderCityPlatePng(
	withDay58,
	bridgePair.withBridgeEdges,
	600,
	420
);
await writeFile(path.join(outputDir, 'experiment-bridge.png'), bridgePlateBuf);
generatedBuffers.set('experiment-bridge.png', bridgePlateBuf);

// 2. experiment-vaccination.png (600 x 420)
const vaccPlateBuf = await renderCityPlatePng(
	vaccBridgeDay58,
	vaccinationSet.edges,
	600,
	420
);
await writeFile(path.join(outputDir, 'experiment-vaccination.png'), vaccPlateBuf);
generatedBuffers.set('experiment-vaccination.png', vaccPlateBuf);

// 3. poster.png (1200 x 750)
const posterLeftPlate = await renderCityPlatePng(
	withoutDay58,
	bridgePair.withoutBridgeEdges,
	520,
	364,
	{ showProposedBridge: true }
);
const posterRightPlate = await renderCityPlatePng(
	withDay58,
	bridgePair.withBridgeEdges,
	520,
	364
);

const posterSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <rect width="1200" height="750" fill="#101416"/>
  <rect x="20" y="20" width="1160" height="710" rx="14" fill="#1C2327" stroke="#2F3A40" stroke-width="1.5"/>

  <!-- Top instrument header -->
  <rect x="44" y="42" width="1112" height="56" rx="9" fill="#14191C" stroke="#2F3A40"/>
  <circle cx="70" cy="70" r="6" fill="#FFAA4C"/>
  <text x="90" y="76" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="19" font-weight="700">The Epidemic Mosaic · Two communities, one bridge (Day ${snapshotDay}.0, seed 2026)</text>
  <rect x="938" y="53" width="198" height="34" rx="7" fill="#E8832A"/>
  <text x="1037" y="75" text-anchor="middle" fill="#101416" font-family="Arial, sans-serif" font-size="14" font-weight="700">Run comparison</text>

  <text x="46" y="126" fill="#BAC4C8" font-family="Arial, sans-serif" font-size="15">36 Voronoi regions · 100 people per region (3,600 total) · 5 initial infections in A5 · Market Cross · Area-proportional compartment bands</text>

  <!-- Left card: Without bridge -->
  <rect x="44" y="144" width="544" height="432" rx="10" fill="#14191C" stroke="#2F3A40"/>
  <text x="62" y="174" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="17" font-weight="700">Without bridge</text>
  <text x="570" y="174" text-anchor="end" fill="#7EC8E3" font-family="Courier New, monospace" font-size="14" font-weight="700">Comm. B infected: 0 / 1,800</text>

  <!-- Right card: With one bridge -->
  <rect x="612" y="144" width="544" height="432" rx="10" fill="#14191C" stroke="#2F3A40"/>
  <text x="630" y="174" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="17" font-weight="700">With one bridge (A6 ↔ B3)</text>
  <text x="1138" y="174" text-anchor="end" fill="#FFAA4C" font-family="Courier New, monospace" font-size="14" font-weight="700">Comm. B infected: ${bridgePair.withBridge.communityBInfectedByEnd} by day 120</text>

  <!-- Bottom summary & legend deck -->
  <rect x="44" y="594" width="1112" height="114" rx="10" fill="#14191C" stroke="#2F3A40"/>
  <text x="64" y="624" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="16" font-weight="700">Outcome summary across 120 days (single run &amp; 20-run batch median)</text>

  <text x="64" y="654" fill="#BAC4C8" font-family="Courier New, monospace" font-size="13.5">Without bridge:  1,611 infected (peak 358) · 20-run median 1,646.5 (Comm. B: 0/20)</text>
  <text x="64" y="680" fill="#FFAA4C" font-family="Courier New, monospace" font-size="13.5">With one bridge: 3,315 infected (peak 648) · 20-run median 3,302.0 (Comm. B: 18/20)</text>

  <!-- Swatches -->
  <rect x="860" y="616" width="14" height="14" rx="3" fill="#3E5463"/>
  <text x="882" y="628" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="13">Susceptible (S)</text>
  <rect x="1005" y="616" width="14" height="14" rx="3" fill="#E8832A"/>
  <text x="1027" y="628" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="13">Infectious (I)</text>
  <rect x="860" y="646" width="14" height="14" rx="3" fill="#3B9B8E"/>
  <text x="882" y="658" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="13">Recovered (R)</text>
  <rect x="1005" y="646" width="14" height="14" rx="3" fill="#A992D4"/>
  <text x="1027" y="658" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="13">Vaccinated (V)</text>
</svg>
`);

const posterBuffer = await sharp(posterSvg)
	.composite([
		{ input: posterLeftPlate, left: 56, top: 192 },
		{ input: posterRightPlate, left: 624, top: 192 }
	])
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'poster.png'), posterBuffer);
generatedBuffers.set('poster.png', posterBuffer);

// 4. social.png (1200 x 630)
const socialLeft = await renderCityPlatePng(
	withoutDay58,
	bridgePair.withoutBridgeEdges,
	340,
	238,
	{ showProposedBridge: true }
);
const socialMid = await renderCityPlatePng(
	withDay58,
	bridgePair.withBridgeEdges,
	340,
	238
);
const socialRight = await renderCityPlatePng(
	vaccBridgeDay58,
	vaccinationSet.edges,
	340,
	238
);

const socialSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#101416"/>
  <rect x="20" y="20" width="1160" height="590" rx="14" fill="#1C2327" stroke="#2F3A40" stroke-width="1.5"/>

  <rect x="56" y="54" width="38" height="6" rx="3" fill="#E8832A"/>
  <text x="108" y="63" fill="#FFAA4C" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.3">INTERACTIVE NETWORK EPIDEMIOLOGY &amp; VACCINATION LAB</text>

  <text x="56" y="118" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="46" font-weight="700">The Epidemic Mosaic</text>
  <text x="56" y="156" fill="#BAC4C8" font-family="Arial, sans-serif" font-size="20">Two communities. One infection. Add a connection and see what changes.</text>

  <rect x="56" y="186" width="356" height="332" rx="9" fill="#14191C" stroke="#2F3A40"/>
  <text x="72" y="472" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="17" font-weight="700">1. Without bridge</text>
  <text x="72" y="496" fill="#7EC8E3" font-family="Courier New, monospace" font-size="14">1,611 infected · Comm. B: 0</text>

  <rect x="422" y="186" width="356" height="332" rx="9" fill="#14191C" stroke="#2F3A40"/>
  <text x="438" y="472" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="17" font-weight="700">2. With one bridge (A6 ↔ B3)</text>
  <text x="438" y="496" fill="#FFAA4C" font-family="Courier New, monospace" font-size="14">3,315 infected · Comm. B: 1,680</text>

  <rect x="788" y="186" width="356" height="332" rx="9" fill="#14191C" stroke="#2F3A40"/>
  <text x="804" y="472" fill="#F3F1E9" font-family="Arial, sans-serif" font-size="17" font-weight="700">3. 540 doses around bridge</text>
  <text x="804" y="496" fill="#4CE0B3" font-family="Courier New, monospace" font-size="14">1,452 infected · Comm. B: 0</text>

  <text x="56" y="566" fill="#BAC4C8" font-family="Courier New, monospace" font-size="15">λ_i = β_local(I_i/N_i) + β_link Σ w_ij(I_j/N_j)   ·   36 Voronoi regions   ·   SUVROGHOSH.IN</text>
</svg>
`);

const socialBuffer = await sharp(socialSvg)
	.composite([
		{ input: socialLeft, left: 64, top: 200 },
		{ input: socialMid, left: 430, top: 200 },
		{ input: socialRight, left: 796, top: 200 }
	])
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'social.png'), socialBuffer);
generatedBuffers.set('social.png', socialBuffer);

const calibrationArtifact = {
	schemaVersion: 1,
	engineVersion: EPIDEMIC_MOSAIC_ENGINE_VERSION,
	city: {
		citySeed: DEFAULT_CITY_SEED,
		logicalWidth: LOGICAL_WIDTH,
		logicalHeight: LOGICAL_HEIGHT,
		totalRegions: city.regions.length,
		populationPerRegion: 100,
		totalPopulation: 3600,
		initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
		initialInfections: INITIAL_INFECTIONS,
		defaultBridge,
		baseEdgeCount: city.baseEdges.length,
		exampleTouchingDisconnectedPair: city.exampleTouchingDisconnectedPair,
		exampleDistantConnectedPair: city.exampleDistantConnectedPair
	},
	parameters: DEFAULT_EPIDEMIC_PARAMETERS,
	bridgeExperiment: {
		singleRun: {
			withoutBridge: {
				totalInfectedByEnd: bridgePair.withoutBridge.totalInfectedByEnd,
				peakInfectious: bridgePair.withoutBridge.peakInfectious,
				peakInfectiousDay: Number(bridgePair.withoutBridge.peakInfectiousDay.toFixed(2)),
				communityBReached: bridgePair.withoutBridge.communityBReached,
				communityBInfectedByEnd: bridgePair.withoutBridge.communityBInfectedByEnd
			},
			withBridge: {
				totalInfectedByEnd: bridgePair.withBridge.totalInfectedByEnd,
				peakInfectious: bridgePair.withBridge.peakInfectious,
				peakInfectiousDay: Number(bridgePair.withBridge.peakInfectiousDay.toFixed(2)),
				communityBReached: bridgePair.withBridge.communityBReached,
				communityBInfectedByEnd: bridgePair.withBridge.communityBInfectedByEnd
			}
		},
		batch20: bridgeBatch.scenarios.map((s) => ({
			scenarioId: s.scenarioId,
			scenarioLabel: s.scenarioLabel,
			repetitions: s.repetitions,
			medianInfectedByEnd: s.medianInfectedByEnd,
			minInfectedByEnd: s.minInfectedByEnd,
			maxInfectedByEnd: s.maxInfectedByEnd,
			medianPeakInfectious: s.medianPeakInfectious,
			communityBReachedCount: s.communityBReachedCount,
			earlyExtinctionCount: s.earlyExtinctionCount
		}))
	},
	vaccinationExperiment: {
		vaccineBudget: DEFAULT_VACCINE_BUDGET,
		singleRun: Object.fromEntries(
			Object.entries(vaccinationSet.results).map(([k, v]) => [
				k,
				{
					totalInfectedByEnd: v.totalInfectedByEnd,
					peakInfectious: v.peakInfectious,
					peakInfectiousDay: Number(v.peakInfectiousDay.toFixed(2)),
					communityBReached: v.communityBReached,
					communityBInfectedByEnd: v.communityBInfectedByEnd
				}
			])
		),
		batch20: vaccinationBatch.scenarios.map((s) => ({
			scenarioId: s.scenarioId,
			scenarioLabel: s.scenarioLabel,
			repetitions: s.repetitions,
			medianInfectedByEnd: s.medianInfectedByEnd,
			minInfectedByEnd: s.minInfectedByEnd,
			maxInfectedByEnd: s.maxInfectedByEnd,
			medianPeakInfectious: s.medianPeakInfectious,
			communityBReachedCount: s.communityBReachedCount,
			earlyExtinctionCount: s.earlyExtinctionCount
		}))
	}
};

await writeFile(
	path.join(outputDir, 'calibration.json'),
	`${JSON.stringify(calibrationArtifact, null, 2)}\n`
);

const manifestFiles = {};
for (const [name, [width, height]] of Object.entries(expectedFiles)) {
	const buf = generatedBuffers.get(name);
	manifestFiles[name] = {
		width,
		height,
		bytes: buf.length,
		pixelSha256: await rawPixelSha256(buf)
	};
}

await writeFile(
	path.join(outputDir, 'assets.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			engineVersion: EPIDEMIC_MOSAIC_ENGINE_VERSION,
			sourceHash,
			sources: sourceFiles,
			files: manifestFiles
		},
		null,
		2
	)}\n`
);

console.log(
	'The Epidemic Mosaic: generated social.png, poster.png, 2 experiment reference plates, calibration.json, and assets.json.'
);
