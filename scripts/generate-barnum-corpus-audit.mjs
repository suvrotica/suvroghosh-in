import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { createServer } from 'vite';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = fileURLToPath(
	new URL('../src/lib/visualizations/barnum-lab/data/surface-audit.v2.json', import.meta.url)
);
const vite = await createServer({
	root: repositoryRoot,
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false }
});

try {
	const { buildSurfaceAudit } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/surface-audit.ts'
	);
	const { canonicalCorpusManifest } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/data/corpus-manifest.ts'
	);
	const report = buildSurfaceAudit(1_000);
	const rawArtifact =
		JSON.stringify(
			{
				...report,
				corpusManifestSha256: createHash('sha256')
					.update(canonicalCorpusManifest(), 'utf8')
					.digest('hex')
			},
			null,
			'\t'
		) + '\n';
	const artifact = await format(rawArtifact, {
		...(await resolveConfig(outputPath)),
		filepath: outputPath
	});
	const collisions = report.representativeSampling.collisions;
	const collisionCount =
		collisions.emptyDeckCount +
		collisions.duplicateIdPairCount +
		collisions.duplicateFamilyPairCount +
		collisions.nearDuplicatePairCount +
		collisions.openerLimitViolationCount +
		collisions.crossAxisRainbowCount;
	const releaseFailures = [
		...(report.hardFailures.length > 0
			? [`${report.hardFailures.length} hard surface failures`]
			: []),
		...(report.representativeSampling.uniqueRenderedLineCount < 600
			? [
					`only ${report.representativeSampling.uniqueRenderedLineCount} unique representative lines`
				]
			: []),
		...(report.representativeSampling.maximumSingleLineShare > 0.02
			? [`top line share ${report.representativeSampling.maximumSingleLineShare} exceeds 0.02`]
			: []),
		...(collisionCount > 0 ? [`${collisionCount} representative collisions`] : [])
	];

	if (process.argv.includes('--check')) {
		const existingArtifact = existsSync(outputPath)
			? readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n')
			: undefined;
		if (existingArtifact !== artifact) {
			console.error('Barnum surface audit artifact is stale. Run npm run barnum-lab:audit:write.');
			process.exitCode = 1;
		} else if (releaseFailures.length > 0) {
			console.error(`Barnum surface audit failed: ${releaseFailures.join('; ')}.`);
			process.exitCode = 1;
		} else {
			console.log(
				`Barnum surface audit is current: ${report.representativeSampling.uniqueRenderedLineCount} unique lines, ${report.readability.exceptionCount} documented readability exceptions.`
			);
		}
	} else {
		writeFileSync(outputPath, artifact, 'utf8');
		console.log(`Wrote deterministic Barnum surface audit to ${outputPath}.`);
		if (releaseFailures.length > 0) {
			console.error(`Barnum surface audit failed: ${releaseFailures.join('; ')}.`);
			process.exitCode = 1;
		}
	}
} finally {
	await vite.close();
}
