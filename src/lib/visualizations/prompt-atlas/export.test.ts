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
	it('preserves semantic mode and provider metadata in SVG and Markdown', () => {
		const semantic: PromptOntology = {
			...ontology,
			mode: 'semantic',
			analysisMetadata: { provider: 'test-free-tier', model: 'test-model' }
		};
		const svg = exportDiagramSvg(projectOntology(semantic, 'mindmap'));
		expect(svg).toContain('AI semantic analysis');
		expect(svg).not.toContain('Local rules-based analysis');
		expect(svg).toContain('&quot;analysisMode&quot;:&quot;semantic&quot;');
		expect(svg).toContain('&quot;provider&quot;:&quot;test-free-tier&quot;');
		expect(svg).toContain('&quot;model&quot;:&quot;test-model&quot;');
		const markdown = exportMarkdown(semantic, 'mindmap');
		expect(markdown).toContain('Analysis mode: AI semantic.');
		expect(markdown).toContain('Provider: test-free-tier. Model: test-model.');
	});
});
