import { describe, expect, it } from 'vitest';
import {
	beginSourceEdit,
	contentRevision,
	hasCurrentRender,
	isPublicationReady,
	LatestOperation,
	mergeRenderedDiagram
} from './authoring';
import { renderedFixture } from './authoring-fixture';

describe('UML authoring revision boundaries', () => {
	it('invalidates current images immediately while preserving the last successful revision', () => {
		const before = renderedFixture();
		const after = beginSourceEdit(before, '@startuml\nclass "unfinished');
		expect(after.svg).toBeUndefined();
		expect(after.lastValidSvg).toBe(before.svg);
		expect(after.lastValidSourceCode).toBe(before.sourceCode);
		expect(after.sourceCode).toContain('unfinished');
		expect(after.metadataReviewRequired).toBe(true);
		expect(hasCurrentRender(after)).toBe(false);
		expect(isPublicationReady(after)).toBe(false);
	});

	it('requires source/image agreement and editorial review for publication', () => {
		const diagram = renderedFixture();
		expect(isPublicationReady(diagram)).toBe(true);
		expect(isPublicationReady({ ...diagram, sourceCode: `${diagram.sourceCode}\n' changed` })).toBe(
			false
		);
		expect(isPublicationReady({ ...diagram, metadataReviewRequired: true })).toBe(false);
		expect(isPublicationReady({ ...diagram, validationStatus: 'invalid' })).toBe(false);
	});

	it('prevents late non-abortable responses from replacing newer work, including after cancel', () => {
		const gate = new LatestOperation();
		const older = gate.start();
		const newer = gate.start();
		expect(older.signal.aborted).toBe(true);
		expect(older.isCurrent()).toBe(false);
		expect(newer.isCurrent()).toBe(true);
		gate.cancel();
		expect(newer.isCurrent()).toBe(false);
	});

	it('revision labels preserve meaningful whitespace and Unicode differences', () => {
		expect(contentRevision('বাংলা\r\n')).not.toBe(contentRevision('বাংলা\n'));
		expect(contentRevision('same')).toBe(contentRevision('same'));
	});

	it('merges a completed render without undoing newer caption, alt text, or review edits', () => {
		const submitted = renderedFixture();
		const current = {
			...submitted,
			caption: 'New caption',
			altText: 'New alt',
			metadataReviewRequired: true
		};
		const merged = mergeRenderedDiagram(
			current,
			{ ...submitted, svg: '<svg>new render</svg>' },
			submitted.sourceCode
		);
		expect(merged.caption).toBe('New caption');
		expect(merged.altText).toBe('New alt');
		expect(merged.metadataReviewRequired).toBe(true);
		expect(merged.svg).toBe('<svg>new render</svg>');
		const changedSource = { ...current, sourceCode: 'newer source' };
		expect(mergeRenderedDiagram(changedSource, submitted, submitted.sourceCode)).toBe(
			changedSource
		);
	});
});
