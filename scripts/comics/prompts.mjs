#!/usr/bin/env node

import { generatePrompts, parseCliArgs } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/prompts.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--output PATH]

Generate one deterministic, lettering-free art prompt per validated canonical panel plus a hash manifest.`
		)
	) {
		return;
	}
	const result = await generatePrompts({
		...episodeCliOptions(options),
		outputDirectory: outputPath(options)
	});
	process.stdout.write(
		`Generated ${result.manifest.entries.length} prompt(s) in ${result.promptsDirectory}\nChanged: ${result.changed.length} file(s)\n`
	);
});
