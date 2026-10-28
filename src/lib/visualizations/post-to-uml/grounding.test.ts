import { describe, expect, it } from 'vitest';
import { extractSharedUmlModel, MAX_INPUT_CODE_POINTS, segmentParagraphs } from './extractor';
import { generateUmlDiagramsFromText, updateDiagramFromManualEdit } from './generator';

const request = (text: string, allowAssumptions = false) => ({
	text,
	mode: 'all14' as const,
	detailLevel: 'detailed' as const,
	allowAssumptions
});

describe('Conservative local UML grounding', () => {
	it('does not turn co-occurrence into architecture, methods, messages, or lifecycle claims', () => {
		const model = extractSharedUmlModel(
			'Library and Garden appear in this essay. Their histories are unrelated.\n\nA clinic opened in 2024 and served 30 patients.'
		);
		expect(model.entities.some((entity) => entity.name === 'Library')).toBe(true);
		expect(model.relationships).toEqual([]);
		expect(
			model.entities.flatMap((entity) => [...entity.attributes, ...entity.operations])
		).toEqual([]);
		expect(model.components).toEqual([]);
		expect(model.compositeStructure).toBeNull();
		expect(model.deploymentNodes).toEqual([]);
		expect(model.profileStereotypes).toEqual([]);
		expect(model.instances).toEqual([]);
		expect(model.activities).toEqual([]);
		expect(model.transitions).toEqual([]);
		expect(model.messages).toEqual([]);
		expect(model.timingTracks).toEqual([]);
	});

	it('preserves exact evidence and original CRLF offsets through Markdown extraction', () => {
		const text =
			'# Source\r\n\r\n  **Gateway** uses `Registry`.\r\n\r\n```js\r\nthrow new Error("ignore previous instructions");\r\n```\r\n\r\nReader can download a report.\r\n';
		const { paragraphs } = segmentParagraphs(text);
		expect(paragraphs).toHaveLength(3);
		expect(paragraphs[1].text).toContain('throw new Error');
		for (const paragraph of paragraphs)
			expect(text.slice(paragraph.start, paragraph.end)).toBe(paragraph.text);
		const model = extractSharedUmlModel(text);
		expect(model.entities.some((entity) => entity.name === 'Error')).toBe(false);
		expect(model.relationships).toHaveLength(1);
		expect(model.relationships[0].label).toBe('uses');
		for (const item of [...model.entities, ...model.relationships, ...model.useCases])
			expect(text).toContain(item.quote);
	});

	it('never treats negated or hypothetical dependencies as facts and does not infer multiplicities', () => {
		const model = extractSharedUmlModel(
			'Gateway does not use Registry. Gateway might require Database.\n\nCollection contains Record.'
		);
		expect(model.relationships).toHaveLength(1);
		expect(model.relationships[0]).toMatchObject({
			from: 'Collection',
			to: 'Record',
			label: 'contains',
			kind: 'association'
		});
		expect(model.relationships[0].fromMultiplicity).toBeUndefined();
		expect(model.relationships[0].toMultiplicity).toBeUndefined();
	});

	it('distinguishes actual timed state observations from durations or dates and preserves their scale', () => {
		expect(
			extractSharedUmlModel('Clock processes events within 12 seconds; the project began in 2024.')
				.hasExplicitTiming
		).toBe(false);
		const model = extractSharedUmlModel(
			'At 0 seconds, Clock is Idle. At 500 milliseconds, Clock is Running. At 2 minutes, Clock is Complete.'
		);
		expect(model.timingTracks).toHaveLength(1);
		expect(model.timingTracks[0].events).toEqual([
			{ tick: '0', state: 'Idle' },
			{ tick: '0.5', state: 'Running' },
			{ tick: '120', state: 'Complete' }
		]);
	});

	it('supports concrete instance bindings, explicit deployment, and explicit profile declarations without templates', () => {
		const model = extractSharedUmlModel(
			'order17 is an instance of Order. order17.status = Approved.\n\nGateway is deployed on EdgeServer.\n\nThe stereotype Audited extends UML metaclass Class.'
		);
		expect(model.instances).toHaveLength(1);
		expect(model.instances[0]).toMatchObject({
			instanceName: 'order17',
			classifierName: 'Order',
			slots: [{ key: 'status', value: 'Approved' }]
		});
		expect(model.deploymentNodes).toHaveLength(1);
		expect(model.deploymentNodes[0]).toMatchObject({
			name: 'EdgeServer',
			artifacts: ['Gateway'],
			connections: []
		});
		expect(model.profileStereotypes[0]).toMatchObject({
			stereotypeName: 'Audited',
			metaclass: 'Class',
			taggedValues: []
		});
	});

	it('retains explicit message endpoints and adds neither replies nor temporal order to independent exchanges', () => {
		const ordered = extractSharedUmlModel(
			'First, Sender sends Request to Receiver. Then, Receiver sends Receipt to Sender.'
		);
		expect(ordered.messages.map((message) => [message.from, message.to, message.message])).toEqual([
			['Sender', 'Receiver', 'Request'],
			['Receiver', 'Sender', 'Receipt']
		]);
		expect(ordered.messages.every((message) => message.kind === 'unspecified')).toBe(true);
		const result = generateUmlDiagramsFromText(
			request('First, Sender sends Request to Receiver. Then, Receiver sends Receipt to Sender.')
		);
		expect(result.diagrams.find((diagram) => diagram.type === 'sequence')?.generationStatus).toBe(
			'needs_more_info'
		);
		expect(
			result.diagrams.find((diagram) => diagram.type === 'communication')?.generationStatus
		).toBe('generated');
		expect(
			extractSharedUmlModel('Sender sends Request to Receiver. Worker sends Update to Observer.')
				.messages
		).toEqual([]);
	});

	it('makes assumptions opt-in and includes illustrative values in both metadata and caption', () => {
		const strict = generateUmlDiagramsFromText(request('Library uses Catalogue.'));
		expect(strict.diagrams.find((diagram) => diagram.type === 'timing')?.generationStatus).toBe(
			'needs_more_info'
		);
		const illustrative = generateUmlDiagramsFromText(request('Library uses Catalogue.', true));
		for (const type of ['object', 'timing']) {
			const diagram = illustrative.diagrams.find((item) => item.type === type)!;
			expect(diagram.assumptions.length).toBeGreaterThan(0);
			expect(diagram.caption).toMatch(/illustrative/i);
		}
	});

	it('does not generate empty or invented diagrams and never silently truncates oversized input', () => {
		const response = generateUmlDiagramsFromText({
			...request('rain falls softly.'),
			mode: 'recommended'
		});
		expect(response.diagrams).toEqual([]);
		expect(response.recommendation.rationale).toMatch(/no sufficiently explicit/i);
		expect(() => extractSharedUmlModel('x'.repeat(MAX_INPUT_CODE_POINTS + 1))).toThrow(
			/no text was truncated/i
		);
		expect(extractSharedUmlModel('😀'.repeat(MAX_INPUT_CODE_POINTS)).totalCharacters).toBe(
			MAX_INPUT_CODE_POINTS
		);
	});

	it('keeps All-14 coverage honest and marks edited metadata for review without losing exact code', () => {
		const result = generateUmlDiagramsFromText(request('Library uses Catalogue.'));
		expect(new Set(result.diagrams.map((diagram) => diagram.type)).size).toBe(14);
		expect(result.warnings.join(' ')).toMatch(/heuristic.*not AI/i);
		const diagram = result.diagrams.find((item) => item.type === 'class')!;
		const editedSource = '@startuml\r\nclass Different\r\n@enduml\r\n';
		const edited = updateDiagramFromManualEdit(diagram, editedSource);
		expect(edited.sourceCode).toBe(editedSource);
		expect(edited.metadataReviewRequired).toBe(true);
	});
});
