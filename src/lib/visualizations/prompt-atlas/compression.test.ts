import { describe, expect, it } from 'vitest';
import {
	prepareSemanticInput,
	SEMANTIC_EXCERPT_CODE_POINTS,
	splitSourceUnits
} from './compression';
import { analyzePrompt } from './analysis';
import { validateOntology } from './validation';
import { createSession, parseSession } from './session';
import { exportDiagramSvg, exportMarkdown } from './export';
import { projectOntology } from './projection';

describe('extractive semantic compression', () => {
	it('exports a lossless sentence/line partition for server-assigned evidence IDs', () => {
		const text = `🙂 First sentence.  Second line!\r\n\n${'字'.repeat(600)}\t`;
		const units = splitSourceUnits(text);
		expect(units.map((unit) => unit.text).join('')).toBe(text);
		expect(units[0].text).toBe('🙂 First sentence.  ');
		expect(units[1].text).toBe('Second line!\r\n\n');
		let end = 0;
		for (const unit of units) {
			expect(unit.start).toBe(end);
			expect(Array.from(unit.text).length).toBeLessThanOrEqual(512);
			expect(text.slice(unit.start, unit.start + unit.text.length)).toBe(unit.text);
			end += unit.text.length;
		}
		expect(splitSourceUnits('')).toEqual([]);
		expect(() => splitSourceUnits(text, 0)).toThrow('between 1 and 512');
	});
	it('preserves short prompts exactly without excerpt wrappers', () => {
		const text = 'Write a kind story.\nKeep it under 200 words.';
		const result = prepareSemanticInput(text);
		expect(result.prompt).toBe(text);
		expect(result.fragments).toBeUndefined();
		expect(result.compression).toMatchObject({
			applied: false,
			originalCodePoints: text.length,
			analysedCodePoints: text.length,
			omittedCodePoints: 0,
			duplicateCodePoints: 0
		});
	});
	it('retains exact ordered nonoverlapping excerpts and truthful counts deterministically', () => {
		const text = Array.from(
			{ length: 2200 },
			(_, index) => `Section ${index}: a robot considers a different garden in the rain.\n`
		).join('');
		const result = prepareSemanticInput(text);
		expect(result).toEqual(prepareSemanticInput(text));
		expect(result.compression.applied).toBe(true);
		expect(result.compression.analysedCodePoints).toBeLessThanOrEqual(SEMANTIC_EXCERPT_CODE_POINTS);
		let previousEnd = -1;
		let count = 0;
		for (const fragment of result.fragments!) {
			expect(fragment.start).toBeGreaterThanOrEqual(previousEnd);
			expect(text.slice(fragment.start, fragment.start + fragment.text.length)).toBe(fragment.text);
			previousEnd = fragment.start + fragment.text.length;
			count += Array.from(fragment.text).length;
		}
		expect(count).toBe(result.compression.analysedCodePoints);
		expect(result.compression.analysedCodePoints + result.compression.omittedCodePoints).toBe(
			Array.from(text).length
		);
		expect(result.fragments![0].start).toBe(0);
		expect(previousEnd).toBe(text.length);
		expect(
			result.fragments!.some(
				(fragment) => fragment.start > text.length * 0.45 && fragment.start < text.length * 0.55
			)
		).toBe(true);
	});
	it('deduplicates exact long repeats and prioritises constraints without inventing a summary', () => {
		const text = `Write a robot story.\n${'A repeated context paragraph for the garden.\n'.repeat(1600)}Never invent a billing system. If uncertain, preserve ambiguity.\nEnd with kindness.`;
		const result = prepareSemanticInput(text);
		expect(result.compression.duplicateCodePoints).toBeGreaterThan(0);
		expect(result.compression.duplicateCodePoints).toBeLessThanOrEqual(
			result.compression.omittedCodePoints
		);
		expect(new Set(result.fragments!.map((fragment) => fragment.text)).size).toBe(
			result.fragments!.length
		);
		expect(result.prompt).toContain('Never invent a billing system.');
		expect(result.prompt).toContain('partial coverage');
		expect(result.fragments!.every((fragment) => text.includes(fragment.text))).toBe(true);
	});
	it('deduplicates repeated sentences before packing excerpts and retains instruction evidence', () => {
		const task = 'Write a kind story for children about a floating gallery. ';
		const repeated = 'A visitor walks through the gallery. ';
		const constraint = 'Never invent a billing system.';
		const text = `${task}${repeated.repeat(2300)}${constraint}`;
		const result = prepareSemanticInput(text);
		const excerpts = result.fragments!.map((fragment) => fragment.text).join('\n');
		expect(excerpts.split(repeated).length - 1).toBe(1);
		expect(excerpts).toContain(task);
		expect(excerpts).toContain(constraint);
		expect(result.compression.duplicateCodePoints).toBe(2299 * repeated.length);
		expect(result.compression.analysedCodePoints).toBe(
			task.length + repeated.length + constraint.length
		);
		expect(result.compression.analysedCodePoints + result.compression.omittedCodePoints).toBe(
			text.length
		);
		for (const fragment of result.fragments!)
			expect(text.slice(fragment.start, fragment.start + fragment.text.length)).toBe(fragment.text);

		const ontology = analyzePrompt(text);
		for (const kind of ['task', 'audience', 'constraint']) {
			const node = ontology.nodes.find((candidate) => candidate.kind === kind);
			expect(node, `retained ${kind} instruction`).toBeDefined();
			expect(node!.evidence.length).toBeGreaterThan(0);
			for (const span of node!.evidence) expect(text.slice(span.start, span.end)).toBe(span.quote);
		}
	});
	it('coalesces touching unique units while keeping omitted repeats as source gaps', () => {
		const opening = 'Opening instruction.\r\n';
		const repeated = 'Repeat sentence.\r\n';
		const tail = 'Tail instruction.\r\n';
		const text = opening + repeated.repeat(30) + tail;
		const result = prepareSemanticInput(text, 128);
		expect(result.fragments).toEqual([
			{ id: 'fragment-1', start: 0, text: opening + repeated },
			{ id: 'fragment-2', start: text.indexOf(tail), text: tail }
		]);
		expect(result.compression.duplicateCodePoints).toBe(29 * repeated.length);
	});
	it('uses a 512-code-point fallback without splitting Unicode when sentences are absent', () => {
		const text = '🙂'.repeat(1200) + '終';
		const result = prepareSemanticInput(text, 700);
		for (const fragment of result.fragments!) {
			expect(Array.from(fragment.text).length).toBeLessThanOrEqual(512);
			expect(text.slice(fragment.start, fragment.start + fragment.text.length)).toBe(fragment.text);
			expect(fragment.start % 2).toBe(0);
			expect(fragment.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
		}
		expect(result.compression.duplicateCodePoints).toBe(512);
		expect(result.compression.analysedCodePoints).toBe(689);
	});
	it('keeps original Unicode offsets and highlights after local analysis of long prompts', () => {
		const text = `🙂 e\u0301\n${'Context about a robot gardener.\n'.repeat(1700)}Do not invent a database.\nWrite a kind ending.`;
		const ontology = analyzePrompt(text);
		expect(ontology.source.text).toBe(text);
		expect(ontology.compression?.applied).toBe(true);
		expect(ontology.issues.some((issue) => /partial coverage/i.test(issue.description))).toBe(true);
		for (const claim of [...ontology.nodes, ...ontology.relations, ...ontology.issues])
			for (const span of claim.evidence) expect(text.slice(span.start, span.end)).toBe(span.quote);
		expect(validateOntology(ontology)).toEqual(ontology);
	});
	it('preserves coverage and the original through sessions, SVG and Markdown', () => {
		const text = `Write a story.\n${'The garden waits in the rain.\n'.repeat(1400)}Never add a real billing system.`;
		const ontology = analyzePrompt(text);
		const session = parseSession(JSON.stringify(createSession(ontology, 'knowledge-graph')));
		expect(session.ontology.source.text).toBe(text);
		expect(session.ontology.compression).toEqual(ontology.compression);
		expect(exportMarkdown(ontology, 'mindmap')).toContain('Partial coverage.');
		expect(exportDiagramSvg(projectOntology(ontology, 'mindmap'))).toContain(
			'&quot;compression&quot;'
		);
	});
	it('rejects forged coverage metadata and retains a large safety ceiling', () => {
		const ontology = analyzePrompt('A thought.');
		ontology.compression = {
			applied: true,
			originalCodePoints: 100,
			analysedCodePoints: 10,
			omittedCodePoints: 90,
			duplicateCodePoints: 0,
			fragmentCount: 1
		};
		expect(() => validateOntology(ontology)).toThrow('coverage');
		expect(() => prepareSemanticInput('x'.repeat(200_001))).toThrow('200,000');
	});
	it('does not present a carried system boundary across omitted context as an explicit relation', () => {
		const text = `In the library system, a librarian can lend books.\n${Array.from({ length: 1000 }, (_, index) => `A quiet observation ${index} floats gently through the rain.\n`).join('')}A member can renew loans.`;
		const ontology = analyzePrompt(text);
		expect(ontology.compression?.applied).toBe(true);
		const goal = ontology.nodes.find(
			(node) => node.kind === 'action' && /renew loans/.test(node.label)
		);
		expect(goal).toBeDefined();
		const boundary = ontology.relations.find(
			(relation) => relation.kind === 'contains' && relation.to === goal!.id
		);
		expect(boundary).toMatchObject({ provenance: 'inferred' });
		expect(boundary?.rationale).toContain('compressed excerpts');
	});
});
