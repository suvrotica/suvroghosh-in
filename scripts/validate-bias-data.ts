import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	EVIDENCE_STATUSES,
	RELATION_STRENGTHS,
	RELATION_TYPES,
	type BiasDataBundle,
	type BiasVocabulary,
	type VocabularyValue
} from '../src/lib/visualizations/bias-archipelago/bias-types.ts';

type UnknownRecord = Record<string, unknown>;
type VocabularyKey = keyof BiasVocabulary;

export interface BiasDataValidationIssue {
	path: string;
	message: string;
}

export interface BiasDataValidationReport {
	valid: boolean;
	issues: BiasDataValidationIssue[];
	counts: {
		biases: number;
		relations: number;
		scenarios: number;
	};
}

export const REQUIRED_RELATION_PAIRS = [
	['confirmation-bias', 'motivated-reasoning'],
	['hindsight-bias', 'outcome-bias'],
	['mere-exposure-effect', 'illusory-truth-effect'],
	['sunk-cost-effect', 'escalation-of-commitment'],
	['hot-hand-belief', 'gamblers-fallacy'],
	['fundamental-attribution-error', 'actor-observer-asymmetry']
] as const;

export const REQUIRED_SCENARIO_IDS = [
	'project-that-refuses-to-die',
	'agreeable-headline',
	'pattern-in-six-coin-tosses',
	'objective-observer'
] as const;

const VOCABULARY_KEYS: VocabularyKey[] = [
	'formations',
	'families',
	'mechanisms',
	'tasks',
	'triggers',
	'targets',
	'manifestations',
	'temporalStages',
	'scales',
	'conditions',
	'evidenceStatuses',
	'relationTypes',
	'relationStrengths'
];

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pairKey(left: string, right: string): string {
	return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function isHttpsUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' && Boolean(parsed.hostname);
	} catch {
		return false;
	}
}

export function vocabularyValueId(value: VocabularyValue): string {
	return typeof value === 'string' ? value : value.id;
}

export function vocabularyLabelMap(values: readonly VocabularyValue[]): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const value of values) {
		const id = vocabularyValueId(value);
		labels[id] = typeof value === 'string' ? value : (value.label ?? value.name ?? value.id);
	}
	return labels;
}

export function validateBiasData(input: unknown): BiasDataValidationReport {
	const issues: BiasDataValidationIssue[] = [];
	const add = (issuePath: string, message: string): void => {
		issues.push({ path: issuePath, message });
	};
	const requiredString = (
		container: UnknownRecord,
		key: string,
		issuePath: string,
		minimumLength = 1
	): string | undefined => {
		const value = container[key];
		if (typeof value !== 'string' || value.trim().length < minimumLength) {
			add(issuePath, `must be a non-blank string of at least ${minimumLength} character(s)`);
			return undefined;
		}
		return value.trim();
	};
	const aliasedString = (
		container: UnknownRecord,
		keys: readonly string[],
		issuePath: string
	): string | undefined => {
		for (const key of keys) {
			const value = container[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		add(issuePath, `must provide one of ${keys.join(' or ')} as a non-blank string`);
		return undefined;
	};
	const stringArray = (
		container: UnknownRecord,
		key: string,
		issuePath: string,
		minimumLength: number
	): string[] => {
		const value = container[key];
		if (!Array.isArray(value)) {
			add(issuePath, 'must be an array');
			return [];
		}
		if (value.length < minimumLength) {
			add(issuePath, `must contain at least ${minimumLength} item(s)`);
		}
		const result: string[] = [];
		const seen = new Set<string>();
		for (let index = 0; index < value.length; index += 1) {
			const item = value[index];
			if (typeof item !== 'string' || !item.trim()) {
				add(`${issuePath}[${index}]`, 'must be a non-blank string');
				continue;
			}
			const normalized = item.trim();
			if (seen.has(normalized))
				add(`${issuePath}[${index}]`, `duplicates ${JSON.stringify(normalized)}`);
			seen.add(normalized);
			result.push(normalized);
		}
		return result;
	};
	const urlArray = (
		container: UnknownRecord,
		key: string,
		issuePath: string,
		minimumLength = 1
	): string[] => {
		const values = stringArray(container, key, issuePath, minimumLength);
		for (let index = 0; index < values.length; index += 1) {
			if (!isHttpsUrl(values[index]))
				add(`${issuePath}[${index}]`, 'must be an absolute https:// URL');
		}
		return values;
	};

	if (!isRecord(input)) {
		add('$', 'must be an object containing the five Bias Archipelago datasets');
		return {
			valid: false,
			issues,
			counts: { biases: 0, relations: 0, scenarios: 0 }
		};
	}

	const vocabularySets = {} as Record<VocabularyKey, Set<string>>;
	const rawVocabulary = input.vocabulary;
	if (!isRecord(rawVocabulary)) {
		add('vocabulary', 'must be the object loaded from mechanisms.json');
		for (const key of VOCABULARY_KEYS) vocabularySets[key] = new Set();
	} else {
		for (const key of VOCABULARY_KEYS) {
			const rawValues = rawVocabulary[key];
			const ids = new Set<string>();
			vocabularySets[key] = ids;
			if (!Array.isArray(rawValues) || rawValues.length === 0) {
				add(`vocabulary.${key}`, 'must be a non-empty array');
				continue;
			}
			for (let index = 0; index < rawValues.length; index += 1) {
				const value = rawValues[index];
				const itemPath = `vocabulary.${key}[${index}]`;
				let id: string | undefined;
				if (typeof value === 'string') {
					id = value.trim();
					if (!id) add(itemPath, 'must be a non-blank vocabulary ID');
				} else if (isRecord(value)) {
					id = requiredString(value, 'id', `${itemPath}.id`);
					aliasedString(value, ['label', 'name'], `${itemPath}.label`);
					if (
						value.description !== undefined &&
						(typeof value.description !== 'string' || !value.description.trim())
					) {
						add(`${itemPath}.description`, 'must be a non-blank string when present');
					}
				} else {
					add(itemPath, 'must be a string ID or an { id, name, description } object');
				}
				if (!id) continue;
				if (!ID_PATTERN.test(id)) add(itemPath, 'ID must use lowercase kebab-case');
				if (ids.has(id)) add(itemPath, `duplicates vocabulary ID ${JSON.stringify(id)}`);
				ids.add(id);
			}
		}
	}

	for (const status of EVIDENCE_STATUSES) {
		if (!vocabularySets.evidenceStatuses.has(status)) {
			add('vocabulary.evidenceStatuses', `is missing required value ${JSON.stringify(status)}`);
		}
	}
	for (const type of RELATION_TYPES) {
		if (!vocabularySets.relationTypes.has(type)) {
			add('vocabulary.relationTypes', `is missing required value ${JSON.stringify(type)}`);
		}
	}
	for (const strength of RELATION_STRENGTHS) {
		if (!vocabularySets.relationStrengths.has(strength)) {
			add('vocabulary.relationStrengths', `is missing required value ${JSON.stringify(strength)}`);
		}
	}

	const lineageIds = new Set<string>();
	const rawLineages = input.lineages;
	if (!Array.isArray(rawLineages) || rawLineages.length === 0) {
		add('lineages', 'must be a non-empty array');
	} else {
		for (let index = 0; index < rawLineages.length; index += 1) {
			const value = rawLineages[index];
			const itemPath = `lineages[${index}]`;
			if (!isRecord(value)) {
				add(itemPath, 'must be an object');
				continue;
			}
			const id = requiredString(value, 'id', `${itemPath}.id`);
			aliasedString(value, ['label', 'name'], `${itemPath}.label`);
			requiredString(value, 'description', `${itemPath}.description`);
			aliasedString(value, ['colour', 'color'], `${itemPath}.colour`);
			requiredString(value, 'symbol', `${itemPath}.symbol`);
			if (!id) continue;
			if (!ID_PATTERN.test(id)) add(`${itemPath}.id`, 'must use lowercase kebab-case');
			if (lineageIds.has(id)) add(`${itemPath}.id`, `duplicates lineage ID ${JSON.stringify(id)}`);
			lineageIds.add(id);
		}
	}

	const rawBiases = input.biases;
	const biases = Array.isArray(rawBiases) ? rawBiases : [];
	if (!Array.isArray(rawBiases)) add('biases', 'must be an array');
	if (biases.length < 80 || biases.length > 100) {
		add('biases', `must contain 80–100 records; found ${biases.length}`);
	}
	const biasIds = new Set<string>();
	const biasNames = new Set<string>();
	const evidenceStatusSet = new Set<string>(EVIDENCE_STATUSES);
	const controlledArrays: Array<[string, VocabularyKey]> = [
		['mechanisms', 'mechanisms'],
		['tasks', 'tasks'],
		['triggers', 'triggers'],
		['targets', 'targets'],
		['manifestations', 'manifestations'],
		['temporalStage', 'temporalStages'],
		['scale', 'scales'],
		['conditions', 'conditions']
	];

	for (let index = 0; index < biases.length; index += 1) {
		const value = biases[index];
		const itemPath = `biases[${index}]`;
		if (!isRecord(value)) {
			add(itemPath, 'must be an object');
			continue;
		}
		const id = requiredString(value, 'id', `${itemPath}.id`);
		const name = requiredString(value, 'name', `${itemPath}.name`);
		stringArray(value, 'aliases', `${itemPath}.aliases`, 0);
		requiredString(value, 'definition', `${itemPath}.definition`);
		requiredString(value, 'example', `${itemPath}.example`);
		for (const [field, vocabularyKey] of controlledArrays) {
			const values = stringArray(value, field, `${itemPath}.${field}`, 1);
			for (let itemIndex = 0; itemIndex < values.length; itemIndex += 1) {
				if (!vocabularySets[vocabularyKey].has(values[itemIndex])) {
					add(
						`${itemPath}.${field}[${itemIndex}]`,
						`unknown ${vocabularyKey} value ${JSON.stringify(values[itemIndex])}`
					);
				}
			}
		}

		const family = requiredString(value, 'family', `${itemPath}.family`);
		if (family && !vocabularySets.families.has(family)) {
			add(`${itemPath}.family`, `unknown family ${JSON.stringify(family)}`);
		}
		const evidenceStatus = requiredString(value, 'evidenceStatus', `${itemPath}.evidenceStatus`);
		if (evidenceStatus && !evidenceStatusSet.has(evidenceStatus)) {
			add(`${itemPath}.evidenceStatus`, `must be one of ${EVIDENCE_STATUSES.join(', ')}`);
		}
		requiredString(value, 'evidenceNote', `${itemPath}.evidenceNote`);
		urlArray(value, 'canonicalSources', `${itemPath}.canonicalSources`);

		if (value.firstAssociatedYear !== undefined) {
			if (
				typeof value.firstAssociatedYear !== 'number' ||
				!Number.isInteger(value.firstAssociatedYear) ||
				value.firstAssociatedYear < 1800 ||
				value.firstAssociatedYear > 2100
			) {
				add(`${itemPath}.firstAssociatedYear`, 'must be an integer from 1800 through 2100');
			}
		}

		if (!Array.isArray(value.lineages) || value.lineages.length === 0) {
			add(`${itemPath}.lineages`, 'must be a non-empty array');
		} else {
			const traditions = new Set<string>();
			for (let lineageIndex = 0; lineageIndex < value.lineages.length; lineageIndex += 1) {
				const lineage = value.lineages[lineageIndex];
				const lineagePath = `${itemPath}.lineages[${lineageIndex}]`;
				if (!isRecord(lineage)) {
					add(lineagePath, 'must be an object');
					continue;
				}
				const tradition = requiredString(lineage, 'tradition', `${lineagePath}.tradition`);
				if (tradition) {
					if (!lineageIds.has(tradition)) {
						add(`${lineagePath}.tradition`, `unknown lineage ${JSON.stringify(tradition)}`);
					}
					if (traditions.has(tradition)) {
						add(`${lineagePath}.tradition`, `duplicates lineage ${JSON.stringify(tradition)}`);
					}
					traditions.add(tradition);
				}
				if (
					typeof lineage.weight !== 'number' ||
					!Number.isFinite(lineage.weight) ||
					lineage.weight <= 0 ||
					lineage.weight > 1
				) {
					add(`${lineagePath}.weight`, 'must be a finite number in (0, 1]');
				}
				if (
					lineage.note !== undefined &&
					(typeof lineage.note !== 'string' || !lineage.note.trim())
				) {
					add(`${lineagePath}.note`, 'must be a non-blank string when present');
				}
			}
		}

		if (id) {
			if (!ID_PATTERN.test(id)) add(`${itemPath}.id`, 'must use lowercase kebab-case');
			if (biasIds.has(id)) add(`${itemPath}.id`, `duplicates bias ID ${JSON.stringify(id)}`);
			biasIds.add(id);
		}
		if (name) {
			const normalizedName = name.toLocaleLowerCase('en');
			if (biasNames.has(normalizedName))
				add(`${itemPath}.name`, `duplicates bias name ${JSON.stringify(name)}`);
			biasNames.add(normalizedName);
		}
	}

	const rawRelations = input.relations;
	const relations = Array.isArray(rawRelations) ? rawRelations : [];
	if (!Array.isArray(rawRelations)) add('relations', 'must be an array');
	const presentPairs = new Set<string>();
	const relationTypeSet = new Set<string>(RELATION_TYPES);
	const relationStrengthSet = new Set<string>(RELATION_STRENGTHS);
	for (let index = 0; index < relations.length; index += 1) {
		const value = relations[index];
		const itemPath = `relations[${index}]`;
		if (!isRecord(value)) {
			add(itemPath, 'must be an object');
			continue;
		}
		const source = requiredString(value, 'source', `${itemPath}.source`);
		const target = requiredString(value, 'target', `${itemPath}.target`);
		const type = requiredString(value, 'type', `${itemPath}.type`);
		const strength = requiredString(value, 'strength', `${itemPath}.strength`);
		requiredString(value, 'explanation', `${itemPath}.explanation`, 20);
		urlArray(value, 'sourceIds', `${itemPath}.sourceIds`);
		if (source && !biasIds.has(source))
			add(`${itemPath}.source`, `unknown bias endpoint ${JSON.stringify(source)}`);
		if (target && !biasIds.has(target))
			add(`${itemPath}.target`, `unknown bias endpoint ${JSON.stringify(target)}`);
		if (source && target) {
			if (source === target) add(itemPath, 'relation endpoints must be different biases');
			presentPairs.add(pairKey(source, target));
		}
		if (type && !relationTypeSet.has(type)) {
			add(`${itemPath}.type`, `must be one of ${RELATION_TYPES.join(', ')}`);
		}
		if (strength && !relationStrengthSet.has(strength)) {
			add(`${itemPath}.strength`, `must be one of ${RELATION_STRENGTHS.join(', ')}`);
		}
	}
	for (const [source, target] of REQUIRED_RELATION_PAIRS) {
		if (!presentPairs.has(pairKey(source, target))) {
			add('relations', `is missing required explained pair ${source} ↔ ${target}`);
		}
	}

	const rawScenarios = input.scenarios;
	const scenarios = Array.isArray(rawScenarios) ? rawScenarios : [];
	if (!Array.isArray(rawScenarios)) add('scenarios', 'must be an array');
	if (scenarios.length < REQUIRED_SCENARIO_IDS.length) {
		add('scenarios', `must contain at least ${REQUIRED_SCENARIO_IDS.length} guided scenarios`);
	}
	const scenarioIds = new Set<string>();
	for (let index = 0; index < scenarios.length; index += 1) {
		const value = scenarios[index];
		const itemPath = `scenarios[${index}]`;
		if (!isRecord(value)) {
			add(itemPath, 'must be an object');
			continue;
		}
		const id = requiredString(value, 'id', `${itemPath}.id`);
		requiredString(value, 'title', `${itemPath}.title`);
		requiredString(value, 'introduction', `${itemPath}.introduction`);
		requiredString(value, 'interpretation', `${itemPath}.interpretation`);
		if (value.sourceIds !== undefined) urlArray(value, 'sourceIds', `${itemPath}.sourceIds`);
		if (id) {
			if (!ID_PATTERN.test(id)) add(`${itemPath}.id`, 'must use lowercase kebab-case');
			if (scenarioIds.has(id))
				add(`${itemPath}.id`, `duplicates scenario ID ${JSON.stringify(id)}`);
			scenarioIds.add(id);
		}

		if (!Array.isArray(value.steps) || value.steps.length === 0) {
			add(`${itemPath}.steps`, 'must be a non-empty array');
		} else {
			for (let stepIndex = 0; stepIndex < value.steps.length; stepIndex += 1) {
				const step = value.steps[stepIndex];
				const stepPath = `${itemPath}.steps[${stepIndex}]`;
				if (!isRecord(step)) {
					add(stepPath, 'must be an object');
					continue;
				}
				const stepBiasIds = stringArray(step, 'biasIds', `${stepPath}.biasIds`, 1);
				requiredString(step, 'text', `${stepPath}.text`);
				for (let biasIndex = 0; biasIndex < stepBiasIds.length; biasIndex += 1) {
					if (!biasIds.has(stepBiasIds[biasIndex])) {
						add(
							`${stepPath}.biasIds[${biasIndex}]`,
							`unknown bias endpoint ${JSON.stringify(stepBiasIds[biasIndex])}`
						);
					}
				}
			}
		}
	}
	for (const requiredId of REQUIRED_SCENARIO_IDS) {
		if (!scenarioIds.has(requiredId)) {
			add('scenarios', `is missing required guided scenario ${JSON.stringify(requiredId)}`);
		}
	}

	return {
		valid: issues.length === 0,
		issues,
		counts: { biases: biases.length, relations: relations.length, scenarios: scenarios.length }
	};
}

export function assertValidBiasData(input: unknown): asserts input is BiasDataBundle {
	const report = validateBiasData(input);
	if (report.valid) return;
	throw new Error(formatBiasDataValidationReport(report));
}

export function formatBiasDataValidationReport(report: BiasDataValidationReport): string {
	if (report.valid) {
		return `Bias Archipelago data is valid (${report.counts.biases} biases, ${report.counts.relations} relations, ${report.counts.scenarios} scenarios).`;
	}
	return [
		`Bias Archipelago data validation failed with ${report.issues.length} issue(s):`,
		...report.issues.map((issue) => `- ${issue.path}: ${issue.message}`)
	].join('\n');
}

export const DEFAULT_BIAS_DATA_DIRECTORY = fileURLToPath(
	new URL('../src/lib/data/bias-archipelago/', import.meta.url)
);

async function readJson(filePath: string): Promise<unknown> {
	return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

export async function loadBiasData(directory = DEFAULT_BIAS_DATA_DIRECTORY): Promise<unknown> {
	const [biases, relations, vocabulary, lineages, scenarios] = await Promise.all([
		readJson(path.join(directory, 'biases.json')),
		readJson(path.join(directory, 'relations.json')),
		readJson(path.join(directory, 'mechanisms.json')),
		readJson(path.join(directory, 'lineages.json')),
		readJson(path.join(directory, 'scenarios.json'))
	]);
	return { biases, relations, vocabulary, lineages, scenarios };
}

async function main(): Promise<void> {
	const directoryArgument = process.argv.find((argument) => argument.startsWith('--data-dir='));
	const directory = directoryArgument
		? path.resolve(directoryArgument.slice('--data-dir='.length))
		: DEFAULT_BIAS_DATA_DIRECTORY;
	const data = await loadBiasData(directory);
	const report = validateBiasData(data);
	const output = formatBiasDataValidationReport(report);
	if (report.valid) console.log(output);
	else {
		console.error(output);
		process.exitCode = 1;
	}
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
