#!/usr/bin/env node

import { generateDirectorReport, parseCliArgs } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/director.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--output PATH]

Write deterministic pacing, density, comedy-rhythm, continuity, and system-villainy findings.`
		)
	) {
		return;
	}
	const result = await generateDirectorReport({
		...episodeCliOptions(options),
		outputFile: outputPath(options)
	});
	process.stdout.write(
		`Director report: ${result.reportPath}\nFindings: ${result.findings.length}\nChanged: ${result.changed ? 1 : 0} file(s)\n`
	);
});
