import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'extensions/listening-room');
const unpacked = path.join(root, '.tmp/listening-room-extension');
const download = path.join(root, 'static/downloads/listening-room-extension.zip');
const files = {};
for (const name of await readdir(source)) {
	if (!/\.(js|json|html|md)$/.test(name) || name.endsWith('.test.mjs')) continue;
	files[name] = new TextEncoder().encode(
		(await readFile(path.join(source, name), 'utf8')).replace(/\r\n/g, '\n')
	);
}
const dsp = await readFile(path.join(root, 'src/lib/visualizations/listening-room/dsp.ts'), 'utf8');
files['dsp.js'] = new TextEncoder().encode(
	ts.transpileModule(dsp, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ES2022,
			newLine: ts.NewLineKind.LineFeed
		}
	}).outputText
);
await mkdir(unpacked, { recursive: true });
await mkdir(path.dirname(download), { recursive: true });
await Promise.all(
	Object.entries(files).map(([name, bytes]) => writeFile(path.join(unpacked, name), bytes))
);
// Fixed timestamps keep rebuilding an unchanged extension deterministic.
const archive = Object.fromEntries(
	Object.entries(files)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, bytes]) => [name, [bytes, { mtime: new Date('2026-11-02T00:00:00Z') }]])
);
await writeFile(download, zipSync(archive, { level: 9 }));
console.log(`Listening Room extension: ${download}\nUnpacked developer build: ${unpacked}`);
