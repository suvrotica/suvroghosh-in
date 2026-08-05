import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
	buildBiasLayout,
	DEFAULT_EMBEDDING_SEED,
	DEFAULT_REGION_PINS
} from '../src/lib/visualizations/bias-archipelago/bias-terrain.ts';
import type {
	BiasDataBundle,
	BiasLayout
} from '../src/lib/visualizations/bias-archipelago/bias-types.ts';
import {
	assertValidBiasData,
	DEFAULT_BIAS_DATA_DIRECTORY,
	loadBiasData,
	vocabularyLabelMap
} from './validate-bias-data.ts';

export interface GenerateBiasLayoutOptions {
	dataDirectory?: string;
	seed?: string;
}

export async function generateBiasLayout(
	options: GenerateBiasLayoutOptions = {}
): Promise<BiasLayout> {
	const dataDirectory = options.dataDirectory ?? DEFAULT_BIAS_DATA_DIRECTORY;
	const unvalidated = await loadBiasData(dataDirectory);
	assertValidBiasData(unvalidated);
	const data: BiasDataBundle = unvalidated;
	const formationForFamily = Object.fromEntries(
		data.vocabulary.families.flatMap((value) =>
			typeof value === 'object' && typeof value.formation === 'string'
				? [[value.id, value.formation]]
				: []
		)
	);

	return buildBiasLayout(data.biases, {
		seed: options.seed ?? DEFAULT_EMBEDDING_SEED,
		pins: DEFAULT_REGION_PINS,
		familyLabels: vocabularyLabelMap(data.vocabulary.families),
		formationForFamily,
		formationLabels: vocabularyLabelMap(data.vocabulary.formations)
	});
}

export async function serializeBiasLayout(layout: BiasLayout): Promise<string> {
	const projectConfig = await resolveConfig(
		fileURLToPath(new URL('../package.json', import.meta.url))
	);
	return format(JSON.stringify(layout), { ...projectConfig, parser: 'json' });
}

async function main(): Promise<void> {
	const checkOnly = process.argv.includes('--check');
	const directoryArgument = process.argv.find((argument) => argument.startsWith('--data-dir='));
	const seedArgument = process.argv.find((argument) => argument.startsWith('--seed='));
	const dataDirectory = directoryArgument
		? path.resolve(directoryArgument.slice('--data-dir='.length))
		: DEFAULT_BIAS_DATA_DIRECTORY;
	const seed = seedArgument?.slice('--seed='.length) || DEFAULT_EMBEDDING_SEED;
	const outputPath = path.join(dataDirectory, 'layout.generated.json');
	const serialized = await serializeBiasLayout(await generateBiasLayout({ dataDirectory, seed }));

	if (checkOnly) {
		let existing: string;
		try {
			existing = await readFile(outputPath, 'utf8');
		} catch {
			throw new Error(`Generated layout is missing: ${outputPath}`);
		}
		if (existing !== serialized) {
			throw new Error(
				`Generated layout is stale: ${outputPath}\nRun node --experimental-strip-types scripts/generate-bias-layout.ts.`
			);
		}
		console.log(`Bias Archipelago layout is current: ${outputPath}`);
		return;
	}

	await writeFile(outputPath, serialized, 'utf8');
	console.log(`Generated deterministic Bias Archipelago layout: ${outputPath}`);
}

const isDirectExecution =
	process.argv[1] !== undefined &&
	pathToFileURL(path.resolve(process.argv[1])).href ===
		pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isDirectExecution) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
