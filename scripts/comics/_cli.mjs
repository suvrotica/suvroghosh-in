import path from 'node:path';

import { ComicToolError } from './lib.mjs';

export function episodeCliOptions(options) {
	return {
		root: options.root ? path.resolve(options.root) : process.cwd(),
		series: options.series ?? 'the-last-analog-town',
		episode: options.episode ?? '001',
		...(options['episode-dir']
			? { episodeDirectory: path.resolve(options.root ?? process.cwd(), options['episode-dir']) }
			: {})
	};
}

export function outputPath(options, key = 'output') {
	const value = options[key];
	return typeof value === 'string' && value.trim()
		? path.resolve(options.root ?? process.cwd(), value)
		: undefined;
}

export function commaSeparatedIntegers(value, label) {
	if (value === undefined) return undefined;
	const parsed = String(value)
		.split(',')
		.map((part) => Number(part.trim()));
	if (parsed.length === 0 || parsed.some((entry) => !Number.isInteger(entry) || entry <= 0)) {
		throw new ComicToolError(`${label} must be a comma-separated list of positive integers.`);
	}
	return [...new Set(parsed)];
}

export function printHelp(options, text) {
	if (!options.help) return false;
	process.stdout.write(`${text.trim()}\n`);
	return true;
}

export async function runCli(main) {
	try {
		await main();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		if (Array.isArray(error?.details)) {
			for (const detail of error.details) {
				const severity = String(detail.severity ?? 'error').toUpperCase();
				process.stderr.write(
					`${severity} ${detail.code ?? 'comic-tool'} ${detail.path ?? 'episode'}: ${detail.message ?? detail}\n`
				);
			}
		}
		process.exitCode = 1;
	}
}
