import { describe, expect, it } from 'vitest';
import {
	REQUIRED_RELATION_PAIRS,
	REQUIRED_SCENARIO_IDS,
	validateBiasData
} from '../../../../scripts/validate-bias-data';
import {
	EVIDENCE_STATUSES,
	RELATION_STRENGTHS,
	RELATION_TYPES,
	type Bias,
	type BiasDataBundle,
	type BiasRelation,
	type BiasScenario
} from './bias-types';

const REQUIRED_BIAS_IDS = [...new Set(REQUIRED_RELATION_PAIRS.flat())];

function title(id: string): string {
	return id
		.split('-')
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(' ');
}

function bias(id: string, index: number): Bias {
	return {
		id,
		name: title(id),
		aliases: [],
		definition: `${title(id)} is a complete fixture definition for validation.`,
		example: `A street-level example for ${title(id)}.`,
		mechanisms: ['finite-attention'],
		tasks: ['estimating'],
		triggers: ['uncertainty'],
		targets: ['probability'],
		manifestations: ['selective-judgement'],
		temporalStage: ['before-decision'],
		scale: ['individual'],
		conditions: ['uncertainty'],
		lineages: [{ tradition: 'judgement-and-decision-making', weight: 1 }],
		evidenceNote: 'This fixture has a qualitative evidence note.',
		evidenceStatus: 'well-established',
		firstAssociatedYear: 1900 + (index % 100),
		canonicalSources: [`https://example.org/sources/${id}`],
		family: 'finite-attention'
	};
}

function relation(source: string, target: string): BiasRelation {
	return {
		source,
		target,
		type: 'shared-mechanism',
		strength: 'moderate',
		explanation: `${title(source)} and ${title(target)} share a documented functional mechanism.`,
		sourceIds: [`https://example.org/relations/${source}/${target}`]
	};
}

function scenario(id: string, biasId: string): BiasScenario {
	return {
		id,
		title: title(id),
		introduction: `A guided introduction for ${title(id)}.`,
		steps: [
			{
				biasIds: [biasId],
				text: `The guided narrative highlights ${title(biasId)}.`
			}
		],
		interpretation:
			'A coalition of pressures can shape the decision; the sequence does not claim deterministic causation.',
		sourceIds: [`https://example.org/scenarios/${id}`]
	};
}

function validBundle(): BiasDataBundle {
	const fillerCount = 80 - REQUIRED_BIAS_IDS.length;
	const ids = [
		...REQUIRED_BIAS_IDS,
		...Array.from(
			{ length: fillerCount },
			(_, index) => `fixture-bias-${String(index + 1).padStart(2, '0')}`
		)
	];
	return {
		biases: ids.map(bias),
		relations: REQUIRED_RELATION_PAIRS.map(([source, target]) => relation(source, target)),
		vocabulary: {
			formations: [
				{
					id: 'finite-attention',
					label: 'Finite attention',
					colour: '#496f78',
					symbol: 'diamond',
					description: 'Attention is finite.'
				}
			],
			families: [
				{
					id: 'finite-attention',
					label: 'Finite attention',
					colour: '#496f78',
					symbol: 'diamond'
				}
			],
			mechanisms: [
				{
					id: 'finite-attention',
					label: 'Finite attention',
					colour: '#496f78',
					symbol: 'diamond'
				}
			],
			tasks: ['estimating'],
			triggers: ['uncertainty'],
			targets: ['probability'],
			manifestations: ['selective-judgement'],
			temporalStages: ['before-decision'],
			scales: ['individual'],
			conditions: ['uncertainty'],
			evidenceStatuses: [...EVIDENCE_STATUSES],
			relationTypes: [...RELATION_TYPES],
			relationStrengths: [...RELATION_STRENGTHS]
		},
		lineages: [
			{
				id: 'judgement-and-decision-making',
				label: 'Judgement and decision-making',
				description: 'Research on judgement and choice.',
				colour: '#496f78',
				symbol: 'diamond'
			}
		],
		scenarios: REQUIRED_SCENARIO_IDS.map((id, index) => scenario(id, ids[index]))
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function messages(bundle: unknown): string {
	return validateBiasData(bundle)
		.issues.map((issue) => `${issue.path}: ${issue.message}`)
		.join('\n');
}

describe('Bias Archipelago data validation', () => {
	it('accepts a complete 80-record corpus with controlled vocabularies and required stories', () => {
		const report = validateBiasData(validBundle());
		expect(report).toMatchObject({
			valid: true,
			issues: [],
			counts: { biases: 80, relations: 6, scenarios: 4 }
		});
	});

	it('enforces the 80–100 record release scope', () => {
		const tooSmall = validBundle();
		tooSmall.biases.pop();
		expect(messages(tooSmall)).toMatch(/biases: must contain 80–100 records; found 79/);

		const tooLarge = validBundle();
		for (let index = 80; index < 101; index += 1) {
			tooLarge.biases.push(bias(`extra-bias-${index}`, index));
		}
		expect(messages(tooLarge)).toMatch(/biases: must contain 80–100 records; found 101/);
	});

	it('rejects missing fields, bad IDs, unknown vocabulary, source URLs, and evidence enums', () => {
		const broken = clone(validBundle());
		const first = broken.biases[0] as unknown as Record<string, unknown>;
		delete first.definition;
		first.id = 'Not A Slug';
		first.mechanisms = ['invented-mechanism'];
		first.evidenceStatus = 'scientifically-certain';
		first.canonicalSources = ['http://example.org/not-https'];
		const output = messages(broken);

		expect(output).toMatch(/biases\[0\]\.definition/);
		expect(output).toMatch(/biases\[0\]\.id: must use lowercase kebab-case/);
		expect(output).toMatch(/unknown mechanisms value "invented-mechanism"/);
		expect(output).toMatch(/evidenceStatus: must be one of/);
		expect(output).toMatch(/canonicalSources\[0\]: must be an absolute https:\/\/ URL/);
	});

	it('requires explained, sourced relations with real endpoints and all six named pairs', () => {
		const broken = clone(validBundle());
		broken.relations[0].target = 'missing-bias';
		broken.relations[0].explanation = 'Too short.';
		broken.relations[0].sourceIds = [];
		const output = messages(broken);

		expect(output).toMatch(/relations\[0\]\.target: unknown bias endpoint "missing-bias"/);
		expect(output).toMatch(/relations\[0\]\.explanation/);
		expect(output).toMatch(/relations\[0\]\.sourceIds: must contain at least 1 item/);
		expect(output).toMatch(
			/missing required explained pair confirmation-bias ↔ motivated-reasoning/
		);
	});

	it('requires all guided scenarios, valid bias references, causal caveats, and https sources', () => {
		const broken = clone(validBundle());
		broken.scenarios.pop();
		broken.scenarios[0].steps[0].biasIds = ['missing-bias'];
		broken.scenarios[0].interpretation = '';
		broken.scenarios[0].sourceIds = ['citation-1'];
		const output = messages(broken);

		expect(output).toMatch(/scenarios: must contain at least 4 guided scenarios/);
		expect(output).toMatch(/missing required guided scenario "objective-observer"/);
		expect(output).toMatch(/biasIds\[0\]: unknown bias endpoint "missing-bias"/);
		expect(output).toMatch(/interpretation/);
		expect(output).toMatch(/sourceIds\[0\]: must be an absolute https:\/\/ URL/);
	});
});
