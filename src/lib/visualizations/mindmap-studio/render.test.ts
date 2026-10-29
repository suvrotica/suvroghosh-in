import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { graphSvg, layoutKnowledgeGraph, wrapNodeLabel } from './render';

describe('Mindmap Studio graph rendering', () => {
	it('lays out the complete example deterministically with no overlapping node cards', () => {
		const project = createExampleProject();
		const first = layoutKnowledgeGraph(project);
		const second = layoutKnowledgeGraph(project);
		expect(first.nodes).toHaveLength(project.nodes.length);
		expect(first.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
			second.nodes.map(({ id, x, y }) => ({ id, x, y }))
		);
		for (let i = 0; i < first.nodes.length; i++)
			for (let j = i + 1; j < first.nodes.length; j++) {
				const a = first.nodes[i],
					b = first.nodes[j];
				const overlap =
					Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
					Math.abs(a.y - b.y) < (a.height + b.height) / 2;
				expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
			}
		const ids = new Set(first.nodes.map((node) => node.id));
		for (const link of first.links) {
			expect(ids.has(link.from)).toBe(true);
			expect(ids.has(link.to)).toBe(true);
		}
		expect(first.links.filter((link) => link.semantic)).toHaveLength(project.edges.length);
	});

	it('exports complete bounds even after a card was dragged beyond the initial graph', () => {
		const project = createExampleProject();
		const layout = layoutKnowledgeGraph(project);
		layout.nodes[0].x = -5_000;
		layout.nodes[1].y = 7_000;
		const svg = graphSvg(project, layout);
		const bounds = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
		expect(Number(bounds?.[1])).toBeGreaterThan(5_000);
		expect(Number(bounds?.[2])).toBeGreaterThan(7_000);
		expect(svg).not.toContain('foreignObject');
	});

	it('escapes hostile labels and uses an explicit background for both themes', () => {
		const project = createExampleProject();
		project.title = '<script>alert("source")</script>';
		project.nodes[0].label = '<img src=x onerror=alert(1)>';
		const paper = graphSvg(project);
		expect(paper).not.toContain('<script>');
		expect(paper).not.toContain('<img');
		expect(paper).toContain('&lt;script&gt;');
		expect(paper).toContain('fill="#f7f2e7"');
		project.theme = 'night';
		expect(graphSvg(project)).toContain('fill="#202724"');
	});

	it('wraps long unbroken labels without dropping their text', () => {
		const input = 'A verylongunbrokenidentifierwithmanycharacters keeps its meaning';
		const lines = wrapNodeLabel(input, 18);
		expect(lines.every((line) => line.length <= 18)).toBe(true);
		expect(lines.join('').replaceAll(' ', '')).toBe(input.replaceAll(' ', ''));
	});
});
