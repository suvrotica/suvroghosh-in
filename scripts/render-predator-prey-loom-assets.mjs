import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	DEFAULT_INITIAL_STATE,
	DEFAULT_LOOM_PARAMETERS,
	FIXED_PREDATOR_MAX,
	FIXED_PREY_MAX,
	PREDATOR_PREY_LOOM_ENGINE_VERSION,
	WORKED_SETTINGS,
	analyzeEquilibrium,
	buildPhaseRibbonPaths,
	buildTimeSeriesPath,
	computeComparisonGrid,
	mapPhaseToScreen,
	mapTimeValueToScreen,
	simulatePredatorPreyLoom
} from '../src/lib/visualizations/the-predator-prey-loom/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'static', 'images', 'visualizations', 'the-predator-prey-loom');
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/the-predator-prey-loom/types.ts',
	'src/lib/visualizations/the-predator-prey-loom/presets.ts',
	'src/lib/visualizations/the-predator-prey-loom/model.ts',
	'src/lib/visualizations/the-predator-prey-loom/geometry.ts',
	'scripts/render-predator-prey-loom-assets.mjs'
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
	'poster.png': [1200, 750]
};

const sourceHash = await computeSourceHash();

if (checkMode) {
	const manifestPath = path.join(outputDir, 'assets.json');
	const calibrationPath = path.join(outputDir, 'calibration.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	const calibration = JSON.parse(await readFile(calibrationPath, 'utf8'));

	if (manifest.sourceHash !== sourceHash) {
		throw new Error(
			'The Predator-Prey Loom assets are stale relative to engine/script sources. Run npm run predator-prey-loom:assets.'
		);
	}
	if (calibration.engineVersion !== PREDATOR_PREY_LOOM_ENGINE_VERSION) {
		throw new Error('The Predator-Prey Loom calibration engineVersion mismatch.');
	}

	for (const [name, [expectedW, expectedH]] of Object.entries(expectedFiles)) {
		const bytes = await readFile(path.join(outputDir, name));
		if (bytes.length > 750 * 1024) {
			throw new Error(`The Predator-Prey Loom asset exceeds 750 KiB: ${name}`);
		}
		const meta = await sharp(bytes).metadata();
		if (meta.width !== expectedW || meta.height !== expectedH) {
			throw new Error(
				`The Predator-Prey Loom asset ${name} has dimensions ${meta.width}x${meta.height}; expected ${expectedW}x${expectedH}.`
			);
		}
		const actualHash = await rawPixelSha256(bytes);
		if (actualHash !== manifest.files[name]?.pixelSha256) {
			throw new Error(`The Predator-Prey Loom asset pixel hash mismatch: ${name}`);
		}
	}

	console.log(
		'The Predator–Prey Loom: verified social card, computed instrument poster, and calibration record.'
	);
	process.exit(0);
}

await mkdir(outputDir, { recursive: true });

const run15 = simulatePredatorPreyLoom({
	parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-1.5'].K }
});
const run30 = simulatePredatorPreyLoom({
	parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-3.0'].K }
});
const run40 = simulatePredatorPreyLoom({
	parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-4.0'].K }
});
const hopfThreshold = analyzeEquilibrium({
	...DEFAULT_LOOM_PARAMETERS,
	K: 7 / 3
});
const comparisonGrid = computeComparisonGrid();

const bounds = { maxPrey: FIXED_PREY_MAX, maxPredator: FIXED_PREDATOR_MAX };

// Build Poster SVG (1200 x 750): Phase portrait on top-left, 3 worked setting summaries on top-right, aligned time tracks below
const posterPhaseBox = { x: 100, y: 152, width: 620, height: 292 };
const posterRibbon30 = buildPhaseRibbonPaths(run30.samples, posterPhaseBox, bounds, {
	edgeOffsetPx: 2.4,
	arrowSpacingPx: 140
});
const posterRibbon15 = buildPhaseRibbonPaths(run15.samples, posterPhaseBox, bounds, {
	edgeOffsetPx: 0
});

const lag30 = run30.measuredLag;
const lagPreyPhasePt = mapPhaseToScreen(
	lag30.preyPeak.prey,
	lag30.preyPeak.predator,
	posterPhaseBox,
	bounds
);
const lagPredPhasePt = mapPhaseToScreen(
	lag30.predatorPeak.prey,
	lag30.predatorPeak.predator,
	posterPhaseBox,
	bounds
);

const posterPreyTrackBox = { x: 100, y: 508, width: 1040, height: 74 };
const posterPredTrackBox = { x: 100, y: 604, width: 1040, height: 74 };

const posterPreyPath = buildTimeSeriesPath(
	run30.samples,
	(s) => s.prey,
	run30.duration,
	bounds.maxPrey,
	posterPreyTrackBox
);
const posterPredPath = buildTimeSeriesPath(
	run30.samples,
	(s) => s.predator,
	run30.duration,
	bounds.maxPredator,
	posterPredTrackBox
);

const lagPreyTrackPt = mapTimeValueToScreen(
	lag30.preyPeak.time,
	lag30.preyPeak.prey,
	run30.duration,
	bounds.maxPrey,
	posterPreyTrackBox
);
const lagPredTrackPt = mapTimeValueToScreen(
	lag30.predatorPeak.time,
	lag30.predatorPeak.predator,
	run30.duration,
	bounds.maxPredator,
	posterPredTrackBox
);

const posterSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <rect width="1200" height="750" fill="#111518"/>
  <rect x="20" y="20" width="1160" height="710" rx="14" fill="#4D301C"/>
  <rect x="25" y="25" width="1150" height="700" rx="11" fill="#1C2327" stroke="#495A63" stroke-width="1.5"/>

  <!-- Header seam -->
  <rect x="46" y="44" width="1108" height="58" rx="9" fill="#10171A" stroke="#2E393F"/>
  <rect x="66" y="69" width="36" height="7" rx="3.5" fill="#FFB15C"/>
  <text x="116" y="79" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="21" font-weight="700">The Predator–Prey Loom · Rosenzweig–MacArthur Population Instrument</text>
  <rect x="960" y="55" width="174" height="36" rx="7" fill="#FFB15C"/>
  <text x="1047" y="78" text-anchor="middle" fill="#111518" font-family="Arial, sans-serif" font-size="14" font-weight="700">Play example</text>

  <!-- Phase Portrait Module -->
  <rect x="46" y="116" width="700" height="356" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="66" y="140" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="15" font-weight="700">Phase portrait: Each point records prey and predator populations at the same moment</text>

  <rect x="${posterPhaseBox.x}" y="${posterPhaseBox.y}" width="${posterPhaseBox.width}" height="${posterPhaseBox.height}" fill="none" stroke="#2E393F" stroke-width="1.4"/>
  <path d="${posterRibbon15.centrePath}" fill="none" stroke="#B4BFBC" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.48"/>
  <path d="${posterRibbon30.preyEdgePath}" fill="none" stroke="#6EE7B1" stroke-width="1.8" opacity="0.78"/>
  <path d="${posterRibbon30.predatorEdgePath}" fill="none" stroke="#FFB15C" stroke-width="1.8" opacity="0.78"/>
  <path d="${posterRibbon30.centrePath}" fill="none" stroke="#EDF1EE" stroke-width="2.1"/>

  <circle cx="${lagPreyPhasePt.x.toFixed(1)}" cy="${lagPreyPhasePt.y.toFixed(1)}" r="6" fill="#6EE7B1" stroke="#10171A" stroke-width="2"/>
  <text x="${(lagPreyPhasePt.x + 12).toFixed(1)}" y="${(lagPreyPhasePt.y + 4).toFixed(1)}" fill="#6EE7B1" font-family="Courier New, monospace" font-size="12" font-weight="700">Prey peak</text>

  <circle cx="${lagPredPhasePt.x.toFixed(1)}" cy="${lagPredPhasePt.y.toFixed(1)}" r="6" fill="#FFB15C" stroke="#10171A" stroke-width="2"/>
  <text x="${(lagPredPhasePt.x - 110).toFixed(1)}" y="${(lagPredPhasePt.y - 10).toFixed(1)}" fill="#FFB15C" font-family="Courier New, monospace" font-size="12" font-weight="700">Predator peak</text>

  <text x="${posterPhaseBox.x + posterPhaseBox.width / 2}" y="463" text-anchor="middle" fill="#B4BFBC" font-family="Arial, sans-serif" font-size="12.5">Right means more prey (0–3.6). Up means more predators (0–2.4). Follow the arrows to see what changes next.</text>

  <!-- Right-hand Regime Summary Module -->
  <rect x="762" y="116" width="392" height="356" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="782" y="144" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="16" font-weight="700">Worked settings &amp; enrichment threshold</text>
  <text x="782" y="168" fill="#B4BFBC" font-family="Courier New, monospace" font-size="12.5">r=1, h=1, e=0.5, m=0.2, a=1 · K_crit = 7/3 ≈ 2.33</text>

  <rect x="782" y="186" width="352" height="76" rx="8" fill="#1C2327" stroke="#6EE7B1" stroke-width="1.2"/>
  <text x="798" y="210" fill="#6EE7B1" font-family="Courier New, monospace" font-size="14" font-weight="700">K = 1.5 · Steady coexistence</text>
  <text x="798" y="232" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="13">These swings are shrinking towards steady</text>
  <text x="798" y="250" fill="#B4BFBC" font-family="Arial, sans-serif" font-size="12.5">populations (N* = 0.67, P* = 0.93).</text>

  <rect x="782" y="274" width="352" height="76" rx="8" fill="#1C2327" stroke="#FFB15C" stroke-width="1.5"/>
  <text x="798" y="298" fill="#FFB15C" font-family="Courier New, monospace" font-size="14" font-weight="700">K = 3.0 · Persistent oscillations</text>
  <text x="798" y="320" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="13">The populations are approaching a repeating</text>
  <text x="798" y="338" fill="#B4BFBC" font-family="Arial, sans-serif" font-size="12.5">cycle (lag +${lag30.lagTime.toFixed(2)} model-time units).</text>

  <rect x="782" y="362" width="352" height="90" rx="8" fill="#1C2327" stroke="#2E393F" stroke-width="1.2"/>
  <text x="798" y="386" fill="#FFB15C" font-family="Courier New, monospace" font-size="14" font-weight="700">K = 4.0 · Larger persistent swings</text>
  <text x="798" y="408" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="13">The prey population now falls much lower</text>
  <text x="798" y="426" fill="#B4BFBC" font-family="Arial, sans-serif" font-size="12.5">between peaks (trough N = ${run40.lateMinPrey.toFixed(2)} vs ${run30.lateMinPrey.toFixed(2)}).</text>

  <!-- Aligned Time-History Tracks -->
  <rect x="46" y="484" width="1108" height="222" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="66" y="502" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="14" font-weight="700">Aligned time-history strands (0 to 80 model-time units · Predators peak later)</text>

  <rect x="${posterPreyTrackBox.x}" y="${posterPreyTrackBox.y}" width="${posterPreyTrackBox.width}" height="${posterPreyTrackBox.height}" fill="none" stroke="#2E393F"/>
  <text x="${posterPreyTrackBox.x - 10}" y="${posterPreyTrackBox.y + 42}" text-anchor="end" fill="#6EE7B1" font-family="Courier New, monospace" font-size="12" font-weight="700">Prey</text>
  <path d="${posterPreyPath}" fill="none" stroke="#6EE7B1" stroke-width="2.4"/>

  <rect x="${posterPredTrackBox.x}" y="${posterPredTrackBox.y}" width="${posterPredTrackBox.width}" height="${posterPredTrackBox.height}" fill="none" stroke="#2E393F"/>
  <text x="${posterPredTrackBox.x - 10}" y="${posterPredTrackBox.y + 42}" text-anchor="end" fill="#FFB15C" font-family="Courier New, monospace" font-size="12" font-weight="700">Pred.</text>
  <path d="${posterPredPath}" fill="none" stroke="#FFB15C" stroke-width="2.4"/>

  <line x1="${lagPreyTrackPt.x.toFixed(1)}" y1="${posterPreyTrackBox.y}" x2="${lagPreyTrackPt.x.toFixed(1)}" y2="${posterPredTrackBox.y + posterPredTrackBox.height}" stroke="#6EE7B1" stroke-dasharray="3 3" stroke-width="1.4"/>
  <line x1="${lagPredTrackPt.x.toFixed(1)}" y1="${posterPreyTrackBox.y}" x2="${lagPredTrackPt.x.toFixed(1)}" y2="${posterPredTrackBox.y + posterPredTrackBox.height}" stroke="#FFB15C" stroke-dasharray="3 3" stroke-width="1.4"/>
  <circle cx="${lagPreyTrackPt.x.toFixed(1)}" cy="${lagPreyTrackPt.y.toFixed(1)}" r="5" fill="#6EE7B1"/>
  <circle cx="${lagPredTrackPt.x.toFixed(1)}" cy="${lagPredTrackPt.y.toFixed(1)}" r="5" fill="#FFB15C"/>
  <text x="${((lagPreyTrackPt.x + lagPredTrackPt.x) / 2 + 85).toFixed(1)}" y="596" text-anchor="middle" fill="#FFB15C" font-family="Courier New, monospace" font-size="12" font-weight="700">Predators peak later (+${lag30.lagTime.toFixed(2)} time units)</text>
</svg>
`);

const posterBuffer = await sharp(posterSvg)
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'poster.png'), posterBuffer);

// Build Social Card SVG (1200 x 630)
const socialPhaseBox15 = { x: 68, y: 214, width: 324, height: 260 };
const socialPhaseBox30 = { x: 438, y: 214, width: 324, height: 260 };
const socialPhaseBox40 = { x: 808, y: 214, width: 324, height: 260 };

const socialRib15 = buildPhaseRibbonPaths(run15.samples, socialPhaseBox15, bounds, {
	edgeOffsetPx: 2.0
});
const socialRib30 = buildPhaseRibbonPaths(run30.samples, socialPhaseBox30, bounds, {
	edgeOffsetPx: 2.0
});
const socialRib40 = buildPhaseRibbonPaths(run40.samples, socialPhaseBox40, bounds, {
	edgeOffsetPx: 2.0
});

const socialSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#111518"/>
  <rect x="20" y="20" width="1160" height="590" rx="14" fill="#1C2327" stroke="#495A63" stroke-width="1.5"/>

  <rect x="56" y="52" width="42" height="6" rx="3" fill="#FFB15C"/>
  <text x="112" y="61" fill="#FFB15C" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.2">INTERACTIVE POPULATION DYNAMICS &amp; PHASE PORTRAIT INSTRUMENT</text>

  <text x="56" y="116" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="46" font-weight="700">The Predator–Prey Loom</text>
  <text x="56" y="154" fill="#B4BFBC" font-family="Arial, sans-serif" font-size="20">Why predators peak after prey—and how extra food can destabilise steady coexistence into larger swings.</text>

  <!-- Panel 1: K = 1.5 -->
  <rect x="56" y="182" width="348" height="354" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="72" y="206" fill="#6EE7B1" font-family="Courier New, monospace" font-size="15" font-weight="700">1. Food K = 1.5 (Settles)</text>
  <rect x="${socialPhaseBox15.x}" y="${socialPhaseBox15.y}" width="${socialPhaseBox15.width}" height="${socialPhaseBox15.height}" fill="none" stroke="#263137"/>
  <path d="${socialRib15.preyEdgePath}" fill="none" stroke="#6EE7B1" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib15.predatorEdgePath}" fill="none" stroke="#FFB15C" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib15.centrePath}" fill="none" stroke="#EDF1EE" stroke-width="1.8"/>
  <text x="72" y="502" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="14" font-weight="700">Spirals into steady coexistence</text>
  <text x="72" y="522" fill="#B4BFBC" font-family="Courier New, monospace" font-size="12.5">K &lt; 7/3 · N* = 0.67, P* = 0.93</text>

  <!-- Panel 2: K = 3.0 -->
  <rect x="426" y="182" width="348" height="354" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="442" y="206" fill="#FFB15C" font-family="Courier New, monospace" font-size="15" font-weight="700">2. Food K = 3.0 (Cycles)</text>
  <rect x="${socialPhaseBox30.x}" y="${socialPhaseBox30.y}" width="${socialPhaseBox30.width}" height="${socialPhaseBox30.height}" fill="none" stroke="#263137"/>
  <path d="${socialRib30.preyEdgePath}" fill="none" stroke="#6EE7B1" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib30.predatorEdgePath}" fill="none" stroke="#FFB15C" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib30.centrePath}" fill="none" stroke="#EDF1EE" stroke-width="1.8"/>
  <text x="442" y="502" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="14" font-weight="700">Approaches a repeating loop</text>
  <text x="442" y="522" fill="#B4BFBC" font-family="Courier New, monospace" font-size="12.5">K &gt; 7/3 · Lag +${lag30.lagTime.toFixed(2)} time units</text>

  <!-- Panel 3: K = 4.0 -->
  <rect x="796" y="182" width="348" height="354" rx="10" fill="#10171A" stroke="#2E393F"/>
  <text x="812" y="206" fill="#FFB15C" font-family="Courier New, monospace" font-size="15" font-weight="700">3. Food K = 4.0 (Larger swings)</text>
  <rect x="${socialPhaseBox40.x}" y="${socialPhaseBox40.y}" width="${socialPhaseBox40.width}" height="${socialPhaseBox40.height}" fill="none" stroke="#263137"/>
  <path d="${socialRib40.preyEdgePath}" fill="none" stroke="#6EE7B1" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib40.predatorEdgePath}" fill="none" stroke="#FFB15C" stroke-width="1.5" opacity="0.7"/>
  <path d="${socialRib40.centrePath}" fill="none" stroke="#EDF1EE" stroke-width="1.8"/>
  <text x="812" y="502" fill="#EDF1EE" font-family="Arial, sans-serif" font-size="14" font-weight="700">Deeper troughs between peaks</text>
  <text x="812" y="522" fill="#B4BFBC" font-family="Courier New, monospace" font-size="12.5">Prey trough drops to ${run40.lateMinPrey.toFixed(2)}</text>

  <text x="56" y="576" fill="#B4BFBC" font-family="Courier New, monospace" font-size="14.5">dN/dt = rN(1 − N/K) − aNP/(1 + ahN)   ·   dP/dt = eaNP/(1 + ahN) − mP   ·   SUVROGHOSH.IN</text>
</svg>
`);

const socialBuffer = await sharp(socialSvg)
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'social.png'), socialBuffer);

const calibrationArtifact = {
	schemaVersion: 1,
	engineVersion: PREDATOR_PREY_LOOM_ENGINE_VERSION,
	startingConfiguration: {
		...DEFAULT_LOOM_PARAMETERS,
		...DEFAULT_INITIAL_STATE
	},
	hopfStabilityBoundary: {
		kCriticalExact: '7/3',
		kCriticalNumeric: Number(hopfThreshold.kCritical.toFixed(6)),
		equilibriumPrey: Number(hopfThreshold.equilibriumPrey.toFixed(6)),
		equilibriumPredator: Number(hopfThreshold.equilibriumPredator.toFixed(6)),
		jacobianTraceAtBoundary: Number(hopfThreshold.jacobianTrace.toFixed(12))
	},
	workedSettings: {
		'k-1.5': {
			K: 1.5,
			behaviourClass: run15.behaviourClass,
			computedHeadline: run15.computedHeadline,
			measuredLag: run15.measuredLag?.lagTime ?? null,
			lateMinPrey: Number(run15.lateMinPrey.toFixed(4)),
			lateMaxPrey: Number(run15.lateMaxPrey.toFixed(4))
		},
		'k-3.0': {
			K: 3.0,
			behaviourClass: run30.behaviourClass,
			computedHeadline: run30.computedHeadline,
			measuredLag: run30.measuredLag?.lagTime ?? null,
			lateMinPrey: Number(run30.lateMinPrey.toFixed(4)),
			lateMaxPrey: Number(run30.lateMaxPrey.toFixed(4))
		},
		'k-4.0': {
			K: 4.0,
			behaviourClass: run40.behaviourClass,
			computedHeadline: run40.computedHeadline,
			measuredLag: run40.measuredLag?.lagTime ?? null,
			lateMinPrey: Number(run40.lateMinPrey.toFixed(4)),
			lateMaxPrey: Number(run40.lateMaxPrey.toFixed(4))
		}
	},
	comparisonGrid: comparisonGrid.flat().map((c) => ({
		a: c.a,
		K: c.K,
		kCritical: Number(c.run.analysis.kCritical.toFixed(4)),
		isEquilibriumStable: c.run.analysis.isEquilibriumStable,
		behaviourClass: c.behaviourClass,
		badgeLabel: c.badgeLabel,
		lateMinPrey: Number(c.run.lateMinPrey.toFixed(4)),
		lateMaxPrey: Number(c.run.lateMaxPrey.toFixed(4))
	}))
};

await writeFile(
	path.join(outputDir, 'calibration.json'),
	`${JSON.stringify(calibrationArtifact, null, 2)}\n`
);

const manifestFiles = {
	'social.png': {
		width: 1200,
		height: 630,
		bytes: socialBuffer.length,
		pixelSha256: await rawPixelSha256(socialBuffer)
	},
	'poster.png': {
		width: 1200,
		height: 750,
		bytes: posterBuffer.length,
		pixelSha256: await rawPixelSha256(posterBuffer)
	}
};

await writeFile(
	path.join(outputDir, 'assets.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			engineVersion: PREDATOR_PREY_LOOM_ENGINE_VERSION,
			sourceHash,
			sources: sourceFiles,
			files: manifestFiles
		},
		null,
		2
	)}\n`
);

console.log(
	'The Predator–Prey Loom: generated social.png, poster.png, calibration.json, and assets.json.'
);
