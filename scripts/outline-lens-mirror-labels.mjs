import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import opentype from 'three/examples/jsm/libs/opentype.module.js';
import { createSampleSources } from './render-lens-mirror-samples.mjs';

// Authoring only: render complete illustration labels to static paths. The
// sample renderer and CI never load a font file or call this preparation step.
const fontIndex = process.argv.indexOf('--font-dir');
if (fontIndex < 0 || !process.argv[fontIndex + 1])
	throw new Error('Pass --font-dir with the licensed Arial Regular and Bold source files.');
const fontDirectory = path.resolve(process.argv[fontIndex + 1]);
const fonts = {};
const sourceFonts = {};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [style, file] of [
	['regular', 'arial.ttf'],
	['bold', 'arialbd.ttf']
]) {
	const bytes = await readFile(path.join(fontDirectory, file));
	const font = opentype.parse(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
	fonts[style] = font;
	sourceFonts[style] = {
		file,
		sha256: hash(bytes),
		family: font.names.fontFamily.en,
		version: font.names.version.en
	};
}

const labels = {};
createSampleSources((...labelArguments) => {
	const [, , value, size = 24, , extra = ''] = labelArguments;
	const style = extra.includes('font-weight="700"') ? 'bold' : 'regular';
	const letterSpacing = Number(extra.match(/letter-spacing="([^"]+)"/)?.[1] ?? 0);
	const anchor = extra.includes('text-anchor="middle"') ? 'middle' : 'start';
	const options = { kerning: true, script: 'latn', letterSpacing: letterSpacing / size };
	// SVG's default whitespace handling collapses the authored repeated spaces.
	const renderedText = value.replace(/\s+/gu, ' ');
	const advance = fonts[style].getAdvanceWidth(renderedText, size, options);
	const start = anchor === 'middle' ? -(advance - letterSpacing) / 2 : 0;
	labels[JSON.stringify([value, size, extra])] = {
		text: value,
		size,
		style,
		letterSpacing,
		anchor,
		path: fonts[style].getPath(renderedText, start, 0, size, options).toPathData(5)
	};
	return '';
});

const artwork = {
	formatVersion: 1,
	provenance: {
		description:
			'Finite complete outlined labels for the five Lens and Mirror Lab illustrations. No font file or reusable character alphabet is distributed.',
		sourceFonts,
		tool: 'OpenType.js 1.3.4 bundled with Three.js',
		precision: 5
	},
	labels
};
const destination = new URL('./artwork/lens-mirror-labels.json', import.meta.url);
if (process.argv.includes('--check')) {
	const existing = JSON.parse(await readFile(destination, 'utf8'));
	if (JSON.stringify(existing) !== JSON.stringify(artwork))
		throw new Error('Outlined labels differ; review the source fonts and illustration artwork.');
	console.log(`Verified ${Object.keys(labels).length} complete outlined labels.`);
} else {
	await writeFile(destination, JSON.stringify(artwork, null, 2) + '\n');
	console.log(
		`Prepared ${Object.keys(labels).length} complete labels; review samples before publishing.`
	);
}
