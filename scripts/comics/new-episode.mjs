#!/usr/bin/env node

import path from 'node:path';

import { parseCliArgs, requireCliOption, scaffoldEpisode } from './lib.mjs';
import { printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/new-episode.mjs --title "Album title" [--root PATH]
       [--series SLUG] [--id 002] [--slug SLUG] [--date YYYY-MM-DD] [--story-pages 62]

Create a non-destructive unpublished Comic-category production scaffold outside the public static tree.`
		)
	) {
		return;
	}
	const title = requireCliOption(
		options,
		'title',
		'node scripts/comics/new-episode.mjs --title "Album title"'
	);
	const result = await scaffoldEpisode({
		root: path.resolve(options.root ?? process.cwd()),
		title,
		series: options.series,
		id: options.id,
		slug: options.slug,
		date: options.date,
		storyPageCount: options['story-pages']
	});
	process.stdout.write(
		`Created Comic episode ${result.metadata.id}: ${result.episodeDirectory}\nFiles: ${result.created.length}\n`
	);
});
