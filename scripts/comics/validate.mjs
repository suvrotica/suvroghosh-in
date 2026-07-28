#!/usr/bin/env node

import path from 'node:path';

import {
	formatValidationReport,
	loadEpisodeSources,
	parseCliArgs,
	validateEpisode,
	validationConsoleSummary,
	writeFileIfChanged
} from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/validate.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--output PATH] [--no-report]

Validate metadata, 62 canonical page files, references, balloons, prompts, transcript, compiled JSON,
art provenance paths, accessibility text, continuity basics, and publication gates.`
		)
	) {
		return;
	}
	const sources = await loadEpisodeSources(episodeCliOptions(options));
	const result = await validateEpisode({ sources });
	if (!options['no-report']) {
		const reportPath =
			outputPath(options) ?? path.join(sources.episodeDirectory, 'reports', 'validation.md');
		await writeFileIfChanged(reportPath, formatValidationReport(result));
		process.stdout.write(`Report: ${reportPath}\n`);
	}
	process.stdout.write(`${validationConsoleSummary(result)}\n`);
	if (!result.valid) process.exitCode = 1;
});
