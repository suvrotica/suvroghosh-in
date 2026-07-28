#!/usr/bin/env node

import { parseCliArgs, requireCliOption, revisePrompt } from './lib.mjs';
import { episodeCliOptions, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/prompt-revise.mjs --panel p01-01 --note "Identified problem"
       [--variants 3] [--root PATH] [--series SLUG] [--episode ID|SLUG] [--episode-dir PATH]

Create a new immutable, bounded prompt-revision version (maximum five variants per call).
--reason is accepted as a backwards-compatible alias for --note.`
		)
	) {
		return;
	}
	const panel = requireCliOption(options, 'panel');
	const note = requireCliOption({ ...options, note: options.note ?? options.reason }, 'note');
	const result = await revisePrompt({
		...episodeCliOptions(options),
		panel,
		note,
		variants: options.variants
	});
	process.stdout.write(
		`Created prompt revision v${String(result.revision).padStart(3, '0')} for ${panel}: ${result.variants.length} variant(s)\nManifest: ${result.manifestPath}\n`
	);
});
