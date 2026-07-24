import { describe, expect, it } from 'vitest';
import { splitMuseumTitleLines } from './museum-materials';

const measureByCharacter = (text: string) => text.length;

describe('museum text surfaces', () => {
	it('keeps a short title on one line', () => {
		expect(splitMuseumTitleLines('Pink Bird', 20, measureByCharacter)).toEqual(['Pink Bird']);
	});

	it('balances a long title over no more than two complete lines', () => {
		const title = 'Small Bird with Raised Wings';
		const lines = splitMuseumTitleLines(title, 17, measureByCharacter);

		expect(lines).toHaveLength(2);
		expect(lines.join(' ')).toBe(title);
		expect(Math.max(...lines.map(measureByCharacter))).toBeLessThanOrEqual(17);
	});

	it('normalizes surrounding and repeated whitespace', () => {
		const lines = splitMuseumTitleLines('  Clustered   Houses and Boats ', 18, measureByCharacter);

		expect(lines.join(' ')).toBe('Clustered Houses and Boats');
		expect(lines).toHaveLength(2);
	});

	it('provides a readable fallback for an empty title', () => {
		expect(splitMuseumTitleLines('   ', 20, measureByCharacter)).toEqual(['Untitled']);
	});
});
