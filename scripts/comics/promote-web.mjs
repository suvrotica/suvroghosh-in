#!/usr/bin/env node

import { ComicToolError, parseCliArgs, promoteWebAssets } from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/promote-web.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--input PATH] [--confirm]

Verify a complete current web-export staging manifest and plan content-addressed WebP promotion.
This command is a dry run unless the bare --confirm flag is present. It does not publish or deploy.`
		)
	) {
		return;
	}
	if (options.confirm !== undefined && options.confirm !== true) {
		throw new ComicToolError('--confirm is a bare flag and does not accept a value.');
	}
	const result = await promoteWebAssets({
		...episodeCliOptions(options),
		inputDirectory: outputPath(options, 'input'),
		confirm: options.confirm === true
	});
	const mode = result.confirmed ? 'confirmed' : 'dry run';
	process.stdout.write(
		[
			`Web asset promotion ${mode}: ${result.inputDirectory}`,
			`Verified final panels: ${result.panelCount}; already present: ${result.existingCount}; ${result.confirmed ? 'copied' : 'would copy'}: ${result.confirmed ? result.copied.length : result.copyCount}`,
			`Runtime map: ${result.runtimeMapPath}${result.confirmed ? '' : ' (not written)'}`,
			result.confirmed
				? `Changed: ${result.changed.length} file(s)`
				: 'No files written. Re-run with --confirm after reviewing this plan.'
		].join('\n') + '\n'
	);
});
