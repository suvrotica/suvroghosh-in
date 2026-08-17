import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
	surfaceTextIssues,
	surfaceWordCount
} from '../src/lib/visualizations/barnum-lab/core/surface-text.ts';
import { SURFACE_AXIS_SOURCES_EN } from '../src/lib/visualizations/barnum-lab/data/surface-bank-source.en.ts';
import { EXTRA_SURFACE_FAMILIES_EN } from '../src/lib/visualizations/barnum-lab/data/surface-bank-extra-source.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
	here,
	'../src/lib/visualizations/barnum-lab/data/surface-sentences.en.generated.ts'
);

const baseForms = [
	{ id: 'you', render: (predicate: string) => `You ${predicate}.` },
	{ id: 'often-you', render: (predicate: string) => `Often you ${predicate}.` },
	{ id: 'you-often', render: (predicate: string) => `You often ${predicate}.` },
	{ id: 'you-sometimes', render: (predicate: string) => `You sometimes ${predicate}.` },
	{ id: 'at-times', render: (predicate: string) => `At times you ${predicate}.` }
] as const;
const conditionalForm = {
	id: 'sometimes-you',
	render: (predicate: string) => `Sometimes you ${predicate}.`
} as const;

const rainbowForms = [
	(a: string, b: string) => `You ${a}, but you ${b}.`,
	(a: string, b: string) => `Often you ${a}, yet you ${b}.`,
	(a: string, b: string) => `You ${a} and still ${b}.`,
	(a: string, b: string) => `You ${a} even though you ${b}.`
] as const;

interface GeneratedRecord {
	id: string;
	channel: 'surface-reading' | 'feedback-reading';
	text: string;
	mechanism: string;
	semanticFamilyId: string;
	axis: string;
	pole: string;
	breadth: 'broad' | 'medium';
	valence: 'positive' | 'mixed' | 'neutral';
	reviewStatus: 'surface-approved-v2';
	wordCount: number;
	opener: string;
	rainbowCompatibilityFamilyId?: string;
	claimBasis: { kind: 'unsupported-generic' };
}

interface GeneratedFeedbackRelation {
	sourceSentenceId: string;
	sourceRating: 'fits' | 'partly-fits';
	targetSentenceId: string;
	tactic: 'reinforce' | 'qualify';
	semanticFamilyId: string;
}

const records: GeneratedRecord[] = [];
const feedbackRecords: GeneratedRecord[] = [];
for (const axis of SURFACE_AXIS_SOURCES_EN) {
	const families = [
		...axis.families,
		...EXTRA_SURFACE_FAMILIES_EN[axis.axis].map((family) => ({
			...family,
			breadth:
				family.mechanism === 'broad-common-experience' ? ('broad' as const) : ('medium' as const),
			valence:
				family.mechanism === 'flattering-ambiguity' || family.mechanism === 'unused-potential'
					? ('positive' as const)
					: family.mechanism === 'broad-common-experience'
						? ('neutral' as const)
						: ('mixed' as const)
		}))
	];
	if (families.length !== 18)
		throw new Error(`${axis.axis} must have eighteen substantive families.`);
	for (const [familyIndex, family] of families.entries()) {
		for (const form of [baseForms[familyIndex % baseForms.length], conditionalForm]) {
			const text = form.render(family.predicate);
			records.push({
				id: `surface.${axis.axis}.${family.id}.${form.id}`,
				channel: 'surface-reading',
				text,
				mechanism: form.id === 'sometimes-you' ? 'conditional-escape' : family.mechanism,
				semanticFamilyId: `${axis.axis}.${family.id}`,
				axis: axis.axis,
				pole: family.pole,
				breadth: family.breadth,
				valence: family.valence,
				reviewStatus: 'surface-approved-v2',
				wordCount: surfaceWordCount(text),
				opener: form.id,
				claimBasis: { kind: 'unsupported-generic' }
			});
		}
		const feedbackText = `At times, you ${family.predicate}.`;
		feedbackRecords.push({
			id: `feedback.${axis.axis}.${family.id}`,
			channel: 'feedback-reading',
			text: feedbackText,
			mechanism: 'feedback-qualification',
			semanticFamilyId: `${axis.axis}.${family.id}`,
			axis: axis.axis,
			pole: family.pole,
			breadth: family.breadth,
			valence: family.valence,
			reviewStatus: 'surface-approved-v2',
			wordCount: surfaceWordCount(feedbackText),
			opener: 'at-times',
			claimBasis: { kind: 'unsupported-generic' }
		});
	}

	rainbowForms.forEach((render, index) => {
		const text = render(axis.rainbow.firstPredicate, axis.rainbow.secondPredicate);
		records.push({
			id: `surface.${axis.axis}.${axis.rainbow.id}.rainbow-${index + 1}`,
			channel: 'surface-reading',
			text,
			mechanism: 'rainbow-pair',
			semanticFamilyId: `${axis.axis}.${axis.rainbow.id}`,
			axis: axis.axis,
			pole: axis.rainbow.pole,
			breadth: 'broad',
			valence: 'mixed',
			reviewStatus: 'surface-approved-v2',
			wordCount: surfaceWordCount(text),
			opener: 'rainbow',
			rainbowCompatibilityFamilyId: `${axis.axis}.${axis.rainbow.id}`,
			claimBasis: { kind: 'unsupported-generic' }
		});
	});
	const rainbowFeedbackText = `At times you ${axis.rainbow.firstPredicate}, yet you ${axis.rainbow.secondPredicate}.`;
	feedbackRecords.push({
		id: `feedback.${axis.axis}.${axis.rainbow.id}`,
		channel: 'feedback-reading',
		text: rainbowFeedbackText,
		mechanism: 'feedback-qualification',
		semanticFamilyId: `${axis.axis}.${axis.rainbow.id}`,
		axis: axis.axis,
		pole: axis.rainbow.pole,
		breadth: 'broad',
		valence: 'mixed',
		reviewStatus: 'surface-approved-v2',
		wordCount: surfaceWordCount(rainbowFeedbackText),
		opener: 'at-times',
		rainbowCompatibilityFamilyId: `${axis.axis}.${axis.rainbow.id}`,
		claimBasis: { kind: 'unsupported-generic' }
	});
}

const allRecords = [...records, ...feedbackRecords];
const failures = allRecords.flatMap((record) =>
	surfaceTextIssues(record.text, {
		allowReviewedRainbowLength: record.mechanism === 'rainbow-pair'
	}).map((issue) => `${record.id}: ${issue}: ${record.text}`)
);
if (failures.length > 0) throw new Error(`Surface bank failed validation:\n${failures.join('\n')}`);
if (records.length !== 720)
	throw new Error(`Expected 720 complete lines; found ${records.length}.`);
if (feedbackRecords.length !== 342) {
	throw new Error(`Expected 342 feedback lines; found ${feedbackRecords.length}.`);
}
if (new Set(allRecords.map((record) => record.id)).size !== allRecords.length) {
	throw new Error('Surface bank contains duplicate IDs.');
}
if (new Set(records.map((record) => record.text)).size !== records.length) {
	throw new Error('Generic surface bank contains duplicate rendered lines.');
}

const feedbackRelations: GeneratedFeedbackRelation[] = [];
const genericByFamily = new Map<string, GeneratedRecord[]>();
for (const record of records) {
	const family = genericByFamily.get(record.semanticFamilyId) ?? [];
	family.push(record);
	genericByFamily.set(record.semanticFamilyId, family);
}
const feedbackByFamily = new Map(
	feedbackRecords.map((record) => [record.semanticFamilyId, record])
);
for (const [semanticFamilyId, family] of genericByFamily) {
	const target = feedbackByFamily.get(semanticFamilyId);
	if (!target) throw new Error(`${semanticFamilyId} lacks an approved feedback-reading sentence.`);
	for (const source of family) {
		feedbackRelations.push(
			{
				sourceSentenceId: source.id,
				sourceRating: 'fits',
				targetSentenceId: target.id,
				tactic: 'reinforce',
				semanticFamilyId
			},
			{
				sourceSentenceId: source.id,
				sourceRating: 'partly-fits',
				targetSentenceId: target.id,
				tactic: 'qualify',
				semanticFamilyId
			}
		);
	}
}

const canonical = JSON.stringify({
	generic: records,
	feedback: feedbackRecords,
	relations: feedbackRelations
});
const hash = createHash('sha256').update(canonical).digest('hex');
const renderEntries = (values: readonly GeneratedRecord[]) =>
	values
		.map((record) => {
			const { text, ...metadata } = record;
			return `\t{\n\t\t${Object.entries(metadata)
				.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
				.join(',\n\t\t')},\n\t\ttext: ${JSON.stringify(text)} as SurfaceText\n\t}`;
		})
		.join(',\n');
const entries = renderEntries(records);
const feedbackEntries = renderEntries(feedbackRecords);

const rawOutput = `/* This file is generated by scripts/generate-barnum-surface-bank.ts. */
import type { FeedbackRelation, SurfaceSentence, SurfaceText } from '../core/types';

export const SURFACE_SENTENCE_BANK_SHA256 = ${JSON.stringify(hash)} as const;
export const SURFACE_SENTENCES_EN = Object.freeze([
${entries}
]) satisfies readonly SurfaceSentence[];

export const FEEDBACK_SENTENCES_EN = Object.freeze([
${feedbackEntries}
]) satisfies readonly SurfaceSentence[];

export const SURFACE_SENTENCE_COUNT = SURFACE_SENTENCES_EN.length;
export const FEEDBACK_SENTENCE_COUNT = FEEDBACK_SENTENCES_EN.length;

export const FEEDBACK_RELATIONS_EN = Object.freeze(${JSON.stringify(feedbackRelations, null, 2)}) satisfies readonly FeedbackRelation[];
`;
const output = await format(rawOutput, {
	...(await resolveConfig(outputPath)),
	filepath: outputPath
});

if (process.argv.includes('--check')) {
	const existing = await readFile(outputPath, 'utf8').catch(() => '');
	if (existing !== output) {
		throw new Error('The committed Barnum v2 surface bank is stale. Regenerate it before release.');
	}
	console.log(
		`Barnum v2 surface bank current: ${records.length} generic + ${feedbackRecords.length} feedback lines (${hash.slice(0, 12)}).`
	);
} else {
	await writeFile(outputPath, output, 'utf8');
	console.log(
		`Wrote ${records.length} generic + ${feedbackRecords.length} feedback Barnum v2 lines (${hash.slice(0, 12)}).`
	);
}
