import { describe, expect, it } from 'vitest';
import { exportDiagramSvg, exportMarkdown } from './export';
import { projectOntology } from './projection';
import type { PromptOntology } from './types';

const ontology: PromptOntology = {
	schemaVersion: 1,
	source: { text: 'secret original text', revision: 'test' },
	mode: 'local',
	language: 'en',
	nodes: [
		{
			id: 'safe',
			label: '<script>alert("x")</script> & text',
			kind: 'concept',
			layer: 'subject',
			evidence: [],
			provenance: 'inferred',
			attributes: []
		}
	],
	relations: [],
	issues: [{ id: 'issue', kind: 'ambiguity', description: 'Meaning uncertain', evidence: [] }]
};

describe('safe portable exports', () => {
	it('serialises source labels as escaped SVG text with no external resources', () => {
		const svg = exportDiagramSvg(projectOntology(ontology, 'mindmap'));
		expect(svg).toContain('&lt;script&gt;');
		expect(svg).not.toContain('<script>');
		expect(svg).not.toContain('foreignObject');
		expect(svg).not.toContain('href=');
		expect(svg).not.toContain('secret original text');
		expect(svg).toContain('stroke-dasharray');
	});
	it('retains provenance and unresolved issues in Markdown without copying original source', () => {
		const markdown = exportMarkdown(ontology, 'mindmap');
		expect(markdown).toContain('Analysis mode: local rules');
		expect(markdown).toContain('inferred');
		expect(markdown).toContain('Meaning uncertain');
		expect(markdown).not.toContain('secret original text');
		expect(markdown).toContain('\\<script\\>');
	});
	it('retains analysis mode, schema and unresolved issues in safe SVG metadata', () => {
		const svg = exportDiagramSvg(projectOntology(ontology, 'mindmap'));
		expect(svg).toContain('<metadata>');
		expect(svg).toContain('&quot;analysisMode&quot;:&quot;local&quot;');
		expect(svg).toContain('&quot;ontologySchemaVersion&quot;:1');
		expect(svg).toContain('Meaning uncertain');
	});
});
