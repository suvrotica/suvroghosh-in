import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({
	root: repositoryRoot,
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false }
});

try {
	const { auditBarnumCorpus } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/corpus-validation.ts'
	);
	const { CORPUS_MANIFEST_HASH } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/data/corpus-manifest.ts'
	);
	const { CORPUS_VERSION, ENGINE_VERSION } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/version.ts'
	);
	const outputPath = fileURLToPath(
		new URL('../src/lib/visualizations/barnum-lab/data/corpus-audit.v1.json', import.meta.url)
	);
	const artifact =
		JSON.stringify(
			{
				corpusVersion: CORPUS_VERSION,
				engineVersion: ENGINE_VERSION,
				manifestHash: CORPUS_MANIFEST_HASH,
				...auditBarnumCorpus()
			},
			null,
			'\t'
		) + '\n';

	if (process.argv.includes('--check')) {
		const existingArtifact = existsSync(outputPath)
			? readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n')
			: undefined;
		if (existingArtifact !== artifact) {
			console.error('Barnum corpus audit artifact is stale. Run npm run barnum-lab:audit:write.');
			process.exitCode = 1;
		} else {
			console.log('Barnum corpus audit artifact is current.');
		}
	} else {
		writeFileSync(outputPath, artifact, 'utf8');
		console.log('Wrote ' + outputPath);
	}
} finally {
	await vite.close();
}
