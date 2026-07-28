#!/usr/bin/env node

import { parseCliArgs, renderPagePreviews } from './lib.mjs';
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
			`Usage: node scripts/comics/render-page-previews.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--pages 1,2] [--output PATH]

Render assembled SVG pages to portable PNG previews, embedding linked panel art in memory.`
		)
	) {
		return;
	}
	const result = await renderPagePreviews({
		...episodeCliOptions(options),
		pages: commaSeparatedIntegers(options.pages, '--pages'),
		outputDirectory: outputPath(options)
	});
	process.stdout.write(
		`Rendered ${result.manifest.entries.length} page preview(s) in ${result.outputDirectory}\nChanged: ${result.changed.length} file(s)\n`
	);
});
