#!/usr/bin/env node

import path from 'node:path';

import { ComicToolError, parseCliArgs, sha256, writeFileIfChanged } from './lib.mjs';
import { printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/reference-board.mjs --inputs FILE,FILE [--columns 2]
       --output FILE [--cell-width 1536] [--cell-height 1024]

Create an unlabelled lossless reference board for image-generation calls with attachment limits.`
		)
	) {
		return;
	}
	const inputs = String(options.inputs ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
		.map((value) => path.resolve(value));
	if (inputs.length === 0) {
		throw new ComicToolError('--inputs must name at least one raster file.');
	}
	if (!options.output) {
		throw new ComicToolError('--output is required.');
	}
	const columns = Number(options.columns ?? 2);
	const cellWidth = Number(options['cell-width'] ?? 1536);
	const cellHeight = Number(options['cell-height'] ?? 1024);
	for (const [label, value] of [
		['--columns', columns],
		['--cell-width', cellWidth],
		['--cell-height', cellHeight]
	]) {
		if (!Number.isInteger(value) || value <= 0) {
			throw new ComicToolError(`${label} must be a positive integer.`);
		}
	}
	let sharp;
	try {
		({ default: sharp } = await import('sharp'));
	} catch (error) {
		throw new ComicToolError(
			`Sharp is required for reference boards: ${error instanceof Error ? error.message : error}`
		);
	}
	const composites = [];
	for (const [index, filename] of inputs.entries()) {
		const input = await sharp(filename, { animated: false, failOn: 'error' })
			.resize(cellWidth, cellHeight, {
				fit: 'contain',
				background: { r: 247, g: 240, b: 223, alpha: 1 }
			})
			.png()
			.toBuffer();
		composites.push({
			input,
			left: (index % columns) * cellWidth,
			top: Math.floor(index / columns) * cellHeight
		});
	}
	const rows = Math.ceil(inputs.length / columns);
	const board = await sharp({
		create: {
			width: columns * cellWidth,
			height: rows * cellHeight,
			channels: 4,
			background: { r: 247, g: 240, b: 223, alpha: 1 }
		}
	})
		.composite(composites)
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	const outputFile = path.resolve(String(options.output));
	const changed = await writeFileIfChanged(outputFile, board);
	process.stdout.write(
		`Reference board: ${outputFile}\n${columns * cellWidth}x${rows * cellHeight}; SHA-256 ${sha256(board)}\nChanged: ${changed ? 1 : 0} file(s)\n`
	);
});
