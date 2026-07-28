#!/usr/bin/env node

import { generateCulturalReview, parseCliArgs } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/cultural-review.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--output PATH]

Write deterministic cultural-risk findings and the mandatory human Bengali/signage/local-context checklist.`
		)
	) {
		return;
	}
	const result = await generateCulturalReview({
		...episodeCliOptions(options),
		outputFile: outputPath(options)
	});
	process.stdout.write(
		`Cultural review: ${result.reportPath}\nFindings: ${result.findings.length}\nChanged: ${result.changed ? 1 : 0} file(s)\n`
	);
});
