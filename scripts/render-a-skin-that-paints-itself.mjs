import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	createReferenceConfig,
	createSkinConfig,
	DEFAULT_SETTINGS,
	fitReference,
	SHAPE_PRESETS,
	solveSkin
} from '../src/lib/visualizations/a-skin-that-paints-itself/model.ts';
import {
	PIGMENT_HALF_TRANSITION,
	PIGMENT_THRESHOLD,
	renderSkinField
} from '../src/lib/visualizations/a-skin-that-paints-itself/display.ts';

const root = new URL('../', import.meta.url);
const output = new URL('static/images/visualizations/a-skin-that-paints-itself/', root);
const directory = 'src/lib/visualizations/';
const sourceFiles = [
	...['model.ts', 'settings.ts', 'display.ts'].map(
		(name) => `${directory}a-skin-that-paints-itself/${name}`
	),
	...['engine.ts', 'presets.ts', 'types.ts'].map(
		(name) => `${directory}how-spots-and-stripes-form/${name}`
	),
	'scripts/render-a-skin-that-paints-itself.mjs'
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = createHash('sha256');
for (const path of sourceFiles) {
	const content = await readFile(new URL(path, root), 'utf8');
	source.update(path).update('\0').update(content.replace(/\r\n/g, '\n')).update('\0');
}
const sourceSha256 = source.digest('hex');
const dimensions = {
	'formed.png': [384, 200],
	'fitted.png': [384, 200],
	'poster.png': [1200, 500],
	'social.png': [1200, 630],
	'worked-example.png': [1200, 500],
	'taper.png': [1200, 500]
};

async function inspect(name, bytes) {
	const { data, info } = await sharp(bytes)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const [width, height] = dimensions[name];
	if (info.width !== width || info.height !== height || bytes.length > 550 * 1024) {
		throw new Error(
			`Unexpected dimensions or size: ${name} (${info.width}×${info.height}, ${bytes.length} bytes)`
		);
	}
	return { width, height, pixelSha256: sha(data) };
}

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(new URL('assets.json', output), 'utf8'));
	if (manifest.sourceSha256 !== sourceSha256)
		throw new Error('Skin comparison assets are stale. Run npm run skin-comparison:assets.');
	for (const name of Object.keys(dimensions)) {
		const record = await inspect(name, await readFile(new URL(name, output)));
		if (record.pixelSha256 !== manifest.files[name]?.pixelSha256)
			throw new Error(`Pixel hash mismatch: ${name}`);
	}
	console.log('Skin comparison: verified six computed images and their source manifest.');
	process.exit(0);
}

await mkdir(output, { recursive: true });
const config = createSkinConfig(DEFAULT_SETTINGS);
const reference = solveSkin(createReferenceConfig(config));
const straight = solveSkin(config);
const taper = solveSkin(createSkinConfig({ ...DEFAULT_SETTINGS, ...SHAPE_PRESETS.tapered }));
const fitted = fitReference(reference, straight.domain);
const fittedTaper = fitReference(reference, taper.domain);

function fieldHash({ u, v }, { mask }) {
	return sha(
		Buffer.concat([Buffer.from(u.buffer), Buffer.from(v.buffer), Buffer.from(mask.buffer)])
	);
}

function specimen(fields, domain, scale) {
	return sharp(Buffer.from(renderSkinField(fields, domain, 'pigment', scale)), {
		raw: { width: domain.nx * scale, height: domain.ny * scale, channels: 4 }
	})
		.png({ compressionLevel: 9 })
		.toBuffer();
}

const [
	formedSmall,
	fittedSmall,
	formedPlate,
	fittedPlate,
	taperPlate,
	fittedTaperPlate,
	broadPlate
] = await Promise.all([
	specimen(straight, straight.domain, 4),
	specimen(fitted, straight.domain, 4),
	specimen(straight, straight.domain, 5),
	specimen(fitted, straight.domain, 5),
	specimen(taper, taper.domain, 5),
	specimen(fittedTaper, taper.domain, 5),
	specimen(reference, reference.domain, 5)
]);

function card({ title, detail, left, right, labelLeft, labelRight, footer, social = false }) {
	const height = social ? 630 : 500;
	const top = social ? 176 : 130;
	const windowHeight = social ? 334 : 300;
	const imageTop = top + Math.round((windowHeight - 250) / 2) + (social ? 9 : 20);
	const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
		<rect width="1200" height="${height}" fill="#202525"/>
		<rect x="0" y="0" width="1200" height="5" fill="#b76435"/>
		<g font-family="Arial, sans-serif" fill="#eee9df">
		  <text x="38" y="${social ? 82 : 67}" font-size="${social ? 57 : 42}" font-weight="700">${title}</text>
		  <text x="40" y="${social ? 131 : 103}" font-size="${social ? 27 : 22}" fill="#cac8bd">${detail}</text>
		  <rect x="40" y="${top}" width="550" height="${windowHeight}" rx="11" fill="#101313" stroke="#454d4a"/>
		  <rect x="610" y="${top}" width="550" height="${windowHeight}" rx="11" fill="#101313" stroke="#454d4a"/>
		  <text x="60" y="${top + 36}" font-size="24" font-weight="600">${labelLeft}</text>
		  <text x="630" y="${top + 36}" font-size="24" font-weight="600">${labelRight}</text>
		  <text x="40" y="${social ? 573 : 472}" font-size="22" fill="#cac8bd">${footer}</text>
		</g>
	</svg>`;
	return sharp(Buffer.from(background))
		.composite([
			{ input: left, top: imageTop, left: 75 },
			{ input: right, top: imageTop, left: 645 }
		])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

const width = DEFAULT_SETTINGS.widthPercent;
const sameShape = {
	labelLeft: 'Formed on this shape',
	labelRight: 'Finished pattern fitted to this shape'
};
const [poster, social, example, taperFigure] = await Promise.all([
	card({
		...sameShape,
		title: 'One shape, two procedures',
		detail: `Straight strip · ${width}% of the reference width`,
		left: formedPlate,
		right: fittedPlate,
		footer: 'Same model, scale and observation time (t = 60).'
	}),
	card({
		...sameShape,
		title: 'A Skin That Paints Itself',
		detail: 'Does a pattern change when it has less room to form?',
		left: formedPlate,
		right: fittedPlate,
		footer: `Same rules. Same ${width}% strip. A different way to get there.`,
		social: true
	}),
	card({
		title: 'The same rules, with less room',
		detail: 'Each pattern develops inside its own boundary.',
		left: broadPlate,
		right: formedPlate,
		labelLeft: 'Broad patch · 100%',
		labelRight: `Narrow strip · ${width}%`,
		footer: 'Same length, seed and observation time (t = 60).'
	}),
	card({
		...sameShape,
		title: 'A patch that narrows',
		detail: 'Same stepped outline, with a wide end and a narrow tip.',
		left: taperPlate,
		right: fittedTaperPlate,
		footer: 'The fitted field is squeezed more near the tip. Both sources are at t = 60.'
	})
]);

const images = {
	'formed.png': formedSmall,
	'fitted.png': fittedSmall,
	'poster.png': poster,
	'social.png': social,
	'worked-example.png': example,
	'taper.png': taperFigure
};
const files = {};
for (const [name, bytes] of Object.entries(images)) {
	files[name] = await inspect(name, bytes);
	await writeFile(new URL(name, output), bytes);
}

const manifest = {
	sourceSha256,
	integrator: 'Heun / explicit RK2, five-point masked Laplacian, Float64',
	model: config.model,
	version: config.version,
	display: {
		mode: 'pigment',
		source: 'u',
		threshold: PIGMENT_THRESHOLD,
		halfTransition: PIGMENT_HALF_TRANSITION,
		mapping: 'Mask-aware bilinear scalar reconstruction; smoothstep from ivory to charcoal'
	},
	fitting:
		'x unchanged; y multiplied by reference width / actual stepped column width, relative to the transverse centreline; bilinear cell-centred samples with constant edge extension',
	reference: { config: reference.config, fieldSha256: fieldHash(reference, reference.domain) },
	straight: {
		config: straight.config,
		fieldSha256: fieldHash(straight, straight.domain),
		fittedSha256: fieldHash(fitted, straight.domain),
		files: ['formed.png', 'fitted.png', 'poster.png', 'social.png', 'worked-example.png']
	},
	taper: {
		config: taper.config,
		fieldSha256: fieldHash(taper, taper.domain),
		fittedSha256: fieldHash(fittedTaper, taper.domain),
		files: ['taper.png']
	},
	files
};
await writeFile(new URL('assets.json', output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Rendered six reproducible comparison images in ${fileURLToPath(output)}`);
