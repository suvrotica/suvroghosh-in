import { resolve } from 'node:path';
import {
	generateSketchArtifacts,
	renderSketchManifestModule,
	writeTextIfChanged
} from './lib/sketch-manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const sketchDirectory = resolve(root, 'static', 'sketch');
const cachePath = resolve(root, 'scripts', 'sketch-generation-manifest.json');
const manifestOutputPath = resolve(root, 'src', 'lib', 'generated', 'sketch-manifest.ts');
const verifyOnly =
	process.argv.includes('--verify') ||
	process.env.VERCEL === '1' ||
	process.env.IMAGE_OPTIMIZE_VERIFY_ONLY === '1' ||
	process.env.SKETCH_MANIFEST_VERIFY_ONLY === '1';

const { manifest, cachedSketches, renderedVariants, changedVariants, cacheChanged } =
	await generateSketchArtifacts({
		sketchDirectory,
		cachePath,
		verifyOnly
	});
const manifestChanged = await writeTextIfChanged(
	manifestOutputPath,
	renderSketchManifestModule(manifest),
	{
		label: 'Generated sketch manifest',
		verifyOnly
	}
);

console.log(
	`${verifyOnly ? 'Verified' : manifestChanged || cacheChanged || changedVariants > 0 ? 'Generated' : 'Checked'} ` +
		`sketch assets (${manifest.length} sketches, ${cachedSketches} cached, ` +
		`${renderedVariants} variants rendered, ${changedVariants} variant files changed).`
);
