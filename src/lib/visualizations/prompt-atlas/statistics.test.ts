import { describe, expect, it, vi } from 'vitest';
import { countText } from './statistics';

describe('unmodified prompt statistics', () => {
	it('counts empty text and spaces exactly', () => {
		expect(countText('')).toEqual({
			characters: 0,
			withoutWhitespace: 0,
			words: 0,
			lines: 0,
			codePoints: 0,
			codeUnits: 0,
			bytes: 0
		});
		expect(countText('Hello world!').characters).toBe(12);
		expect(countText('  a  ').characters).toBe(5);
		expect(countText('  a  ').withoutWhitespace).toBe(1);
	});
	it('keeps line breaks and distinguishes graphemes from code points and offsets', () => {
		expect(countText('Hi\nthere')).toMatchObject({ characters: 8, lines: 2, words: 2 });
		expect(countText('e\u0301')).toMatchObject({
			characters: 1,
			codePoints: 2,
			codeUnits: 2,
			bytes: 3
		});
		expect(countText('👨‍👩‍👧‍👦')).toMatchObject({ characters: 1, codePoints: 7, codeUnits: 11 });
		expect(countText('🇮🇳👍🏽')).toMatchObject({ characters: 2, codePoints: 4 });
	});
	it('has an explicit older-browser fallback for combining and joined emoji', () => {
		const segmenter = Intl.Segmenter;
		vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
		try {
			expect(countText('e\u0301👨‍👩‍👧‍👦🇮🇳👍🏽\r\n').characters).toBe(5);
		} finally {
			vi.unstubAllGlobals();
			expect(Intl.Segmenter).toBe(segmenter);
		}
	});
});
