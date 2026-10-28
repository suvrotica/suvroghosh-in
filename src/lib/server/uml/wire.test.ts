import { describe, expect, it } from 'vitest';
import { extractSharedUmlModel } from '$lib/visualizations/post-to-uml/extractor';
import {
	ALL_UML_DIAGRAM_TYPES,
	type UmlGenerationRequest
} from '$lib/visualizations/post-to-uml/types';
import { normalizeUmlAiOutput } from './wire';

const request: UmlGenerationRequest = {
	text: 'The Client sends a request to the Server.',
	title: 'Request flow',
	mode: 'selected',
	selectedTypes: ['sequence'],
	detailLevel: 'simple',
	allowAssumptions: false,
	engine: 'ai'
};
const model = extractSharedUmlModel(request.text, {
	title: request.title,
	allowAssumptions: false
});
const figure = {
	type: 'sequence',
	generationStatus: 'generated',
	statusReason: '',
	title: 'Request flow',
	explanation: 'Shows the request described in the article.',
	sourceCode: '@startuml\nClient -> Server: request\n@enduml',
	caption: 'The Client sends a request to the Server.',
	altText: 'A request from Client to Server.',
	isConceptual: false,
	assumptions: [],
	missingInformation: [],
	supportingReferences: [
		{ paragraphIndex: model.paragraphs[0].index, quote: request.text, elementLabel: 'request' }
	]
};
const response = (diagrams: unknown[] = [figure]) => ({
	recommendedTypes: ['sequence'],
	recommendationRationale: 'The article describes one directed message.',
	diagrams
});

describe('AI UML response boundary', () => {
	it('preserves complete source without pretending a browser render succeeded', () => {
		const result = normalizeUmlAiOutput(response(), request, model, 'Mock provider');
		expect(result.diagrams[0]).toMatchObject({
			sourceCode: figure.sourceCode,
			provenance: 'ai',
			generationStatus: 'generated',
			validationStatus: 'skipped',
			renderStatus: 'not_rendered'
		});
		expect(result.diagrams[0].svg).toBeUndefined();
	});

	it('returns all fourteen evaluations without substituting local generated figures', () => {
		const result = normalizeUmlAiOutput(
			response(),
			{ ...request, mode: 'all14' },
			model,
			'Mock provider'
		);
		expect(result.diagrams.map((d) => d.type)).toEqual([...ALL_UML_DIAGRAM_TYPES]);
		expect(result.diagrams.filter((d) => d.generationStatus === 'generated')).toHaveLength(1);
		for (const missing of result.diagrams.filter((d) => d.type !== 'sequence')) {
			expect(missing.generationStatus).toBe('failed');
			expect(missing.sourceCode).toBe('');
			expect(missing.statusReason).toContain('omitted');
		}
	});

	it('retains valid siblings when a requested entry is malformed or duplicated', () => {
		const selected = { ...request, selectedTypes: ['sequence', 'class'] as const };
		const result = normalizeUmlAiOutput(
			response([figure, { type: 'class' }]),
			{ ...selected, selectedTypes: [...selected.selectedTypes] },
			model,
			'Mock'
		);
		expect(result.diagrams.map((d) => d.generationStatus)).toEqual(['generated', 'failed']);
		const duplicate = normalizeUmlAiOutput(response([figure, figure]), request, model, 'Mock');
		expect(duplicate.diagrams[0].statusReason).toContain('duplicate');
	});

	it.each([
		{
			supportingReferences: [
				{ paragraphIndex: 1, quote: 'An invented quotation.', elementLabel: 'claim' }
			]
		},
		{ supportingReferences: [{ paragraphIndex: 999, quote: request.text, elementLabel: 'claim' }] },
		{ supportingReferences: [] },
		{ assumptions: ['The server uses Kubernetes.'] },
		{ sourceCode: '' },
		{ sourceCode: '```plantuml\n@startuml\nA -> B\n@enduml\n```' },
		{ sourceCode: '@startuml\n!include https://evil.example/source\nA -> B\n@enduml' }
	])('rejects ungrounded, incomplete, or unsafe output %#', (override) => {
		const result = normalizeUmlAiOutput(
			response([{ ...figure, ...override }]),
			request,
			model,
			'Mock'
		);
		expect(result.diagrams[0].generationStatus).toBe('failed');
		expect(result.diagrams[0].svg).toBeUndefined();
	});

	it('makes enabled illustrative assumptions visible in the caption', () => {
		const result = normalizeUmlAiOutput(
			response([{ ...figure, assumptions: ['The reply is illustrative.'] }]),
			{ ...request, allowAssumptions: true },
			model,
			'Mock'
		);
		expect(result.diagrams[0].caption).toContain(
			'Illustrative assumptions: The reply is illustrative.'
		);
	});

	it('allows an honest empty recommendation instead of forcing a diagram', () => {
		const result = normalizeUmlAiOutput(
			{
				recommendedTypes: [],
				recommendationRationale: 'This paragraph has no supported system or process.',
				diagrams: []
			},
			{ ...request, mode: 'recommended' },
			model,
			'Mock'
		);
		expect(result.diagrams).toEqual([]);
	});
});
