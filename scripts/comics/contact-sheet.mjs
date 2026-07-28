#!/usr/bin/env node

import { generateContactSheet, parseCliArgs } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/contact-sheet.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--output PATH]

Generate an offline production contact sheet with contextual placeholders for missing art.`
		)
	) {
		return;
	}
	const result = await generateContactSheet({
		...episodeCliOptions(options),
		outputFile: outputPath(options)
	});
	process.stdout.write(
		`Contact sheet: ${result.outputFile}\nChanged: ${result.changed ? 1 : 0} file(s)\n`
	);
});
