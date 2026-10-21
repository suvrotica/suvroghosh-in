import { mkdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import sharp from 'sharp';

// Use the same typed dataset and SVG composition that the reader exports.
// A feature-scoped resolver lets Node's type stripping read the same modules
// without starting Vite or disturbing an existing production build.
const featureRoot = new URL('../src/lib/visualizations/two-calendars/', import.meta.url).href;
const hook = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL?.startsWith(featureRoot) && /^\.\/[a-z-]+$/.test(specifier)) {
			return nextResolve(`${specifier}.ts`, context);
		}
		return nextResolve(specifier, context);
	}
});
try {
	const { events, connections, sources } = await import(`${featureRoot}data.ts`);
	const { pickComparison, createSelectionUrl } = await import(`${featureRoot}chronology.ts`);
	const { renderPostcardSvg } = await import(`${featureRoot}postcard.ts`);
	const selection = { year: 1947, connectionId: null, eventId: null };
	const comparison = pickComparison(events, connections, selection.year);
	const svg = renderPostcardSvg({
		...comparison,
		year: selection.year,
		sources,
		url: createSelectionUrl(
			'https://suvroghosh.in/blog/visualizations/two-calendars-one-life',
			selection
		)
	});
	const directory = 'static/images/visualizations/two-calendars';
	await mkdir(directory, { recursive: true });
	await mkdir('artifacts/two-calendars', { recursive: true });
	await writeFile(`${directory}/two-calendars-postcard.svg`, svg);
	await sharp(Buffer.from(svg)).png().toFile('artifacts/two-calendars/postcard-1947.png');
	await sharp(Buffer.from(svg))
		.resize(1200, 630, { fit: 'contain', background: '#f5f0e3' })
		.png()
		.toFile(`${directory}/two-calendars-social.png`);
	console.log(
		'Rendered the real 1947 comparison: postcard SVG, PNG sample and 1200×630 social preview.'
	);
} finally {
	hook.deregister();
}
