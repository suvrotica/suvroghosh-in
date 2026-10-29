import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
	stdin: {
		contents:
			"export { createExampleProject } from './src/lib/visualizations/mindmap-studio/example.ts'; export { createPublicSnapshot } from './src/lib/visualizations/mindmap-studio/exports.ts';",
		resolveDir: root,
		loader: 'ts'
	},
	bundle: true,
	platform: 'node',
	format: 'esm',
	write: false
});
const module = await import(
	`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
const snapshot = module.createPublicSnapshot(module.createExampleProject());
await mkdir(new URL('../src/lib/data/', import.meta.url), { recursive: true });
await writeFile(
	new URL('../src/lib/data/mindmap-studio-example.json', import.meta.url),
	JSON.stringify(snapshot, null, 2) + '\n'
);
console.log(
	`Prepared public example: ${snapshot.nodes.length} ideas; no source bodies, evidence excerpts or private notes.`
);
