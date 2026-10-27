import { describe, expect, it } from 'vitest';
import { selectEvidencePassages } from './evidence';

describe('evidence reading locations', () => {
	it('replaces repetitive overlapping snippets with distinct passages and another source', () => {
		const refs = [
			{ sourceId: 'report', start: 597, end: 644 },
			{ sourceId: 'report', start: 604, end: 644 },
			{ sourceId: 'report', start: 634, end: 666 },
			{ sourceId: 'report', start: 1400, end: 1420 },
			{ sourceId: 'notes', start: 600, end: 640 }
		];
		expect(selectEvidencePassages(refs)).toEqual([refs[0], refs[4], refs[3]]);
		expect(refs).toHaveLength(5);
	});
	it('preserves source diversity at the preview limit and accepts an empty finding', () => {
		const refs = Array.from({ length: 10 }, (_, i) => ({
			sourceId: `source-${i}`,
			start: 0,
			end: 10
		}));
		expect(selectEvidencePassages(refs)).toEqual(refs.slice(0, 6));
		expect(selectEvidencePassages([])).toEqual([]);
	});
});
