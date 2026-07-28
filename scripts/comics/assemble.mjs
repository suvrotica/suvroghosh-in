#!/usr/bin/env node

import { assemblePages, parseCliArgs } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/assemble.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--output PATH]

Assemble deterministic working SVG pages with programmatic balloons and contextual art placeholders.`
		)
	) {
		return;
	}
	const result = await assemblePages({
		...episodeCliOptions(options),
		outputDirectory: outputPath(options)
	});
	process.stdout.write(
		`Assembled ${result.manifest.entries.length} SVG page(s) in ${result.outputDirectory}\nChanged: ${result.changed.length} file(s)\n`
	);
});
