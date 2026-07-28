#!/usr/bin/env node

import { parseCliArgs, renderLetteredCover } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/render-cover.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--output PATH]

Compose the final text-free cover art with deterministic album, creator, billboard, and production lettering.`
		)
	) {
		return;
	}
	const result = await renderLetteredCover({
		...episodeCliOptions(options),
		outputFile: outputPath(options)
	});
	process.stdout.write(
		`Lettered cover: ${result.outputFile}\n${result.width}x${result.height}; ${result.bytes} bytes; SHA-256 ${result.sha256}\nChanged: ${result.changed ? 1 : 0} file(s)\n`
	);
});
