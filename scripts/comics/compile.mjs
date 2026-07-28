#!/usr/bin/env node

import {
	ComicToolError,
	compileEpisode,
	loadEpisodeSources,
	parseCliArgs,
	validateEpisode
} from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/compile.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--compiled PATH] [--transcript PATH] [--lettering PATH]

Compile canonical page YAML and data records into deterministic episode JSON, a dialogue
transcript, and a panel-positioned lettering manifest.`
		)
	) {
		return;
	}
	const episodeOptions = episodeCliOptions(options);
	const sources = await loadEpisodeSources(episodeOptions);
	const validation = await validateEpisode({
		sources,
		requireTranscript: false,
		checkCompiled: false,
		checkPromptManifest: false,
		requirePromptsForArt: false,
		reportMissingPromptManifest: false
	});
	if (!validation.valid) {
		throw new ComicToolError(
			`Compilation stopped: ${validation.errors.length} canonical-source error(s).`,
			validation.errors
		);
	}
	const result = await compileEpisode({
		sources,
		compiledPath: outputPath(options, 'compiled'),
		transcriptFile: outputPath(options, 'transcript'),
		letteringManifestPath: outputPath(options, 'lettering')
	});
	process.stdout.write(
		`Compiled ${result.compiled.pages.length} page(s) to ${result.compiledPath}\nTranscript: ${result.transcriptPath}\nLettering manifest: ${result.letteringManifestPath}\nChanged: ${result.changed.length} file(s)\n`
	);
});
