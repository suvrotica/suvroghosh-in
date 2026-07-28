#!/usr/bin/env node

import { exportWeb, parseCliArgs } from './lib.mjs';
import {
	commaSeparatedIntegers,
	episodeCliOptions,
	outputPath,
	printHelp,
	runCli
} from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/export-web.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--output PATH] [--widths 640,1280]

Create content-hashed WebP/AVIF raster derivatives in a staging directory without modifying source art.
Missing or non-raster art receives an explicitly labelled contextual SVG placeholder.`
		)
	) {
		return;
	}
	const result = await exportWeb({
		...episodeCliOptions(options),
		outputDirectory: outputPath(options),
		widths: commaSeparatedIntegers(options.widths, '--widths')
	});
	const assets = result.manifest.entries.reduce((total, entry) => total + entry.assets.length, 0);
	process.stdout.write(
		`Web export: ${result.outputDirectory}\nPanels: ${result.manifest.entries.length}; raster assets: ${assets}\nChanged: ${result.changed.length} file(s)\n`
	);
});
