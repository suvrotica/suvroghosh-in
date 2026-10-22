import { describe, expect, it } from 'vitest';
import { CONCEPT_EXAMPLE, WORD_EXAMPLE, WATER_CYCLE_TEXT } from './examples';
import {
	MAX_INPUT,
	MAX_LABEL,
	MAX_UNITS,
	LOCI_PER_ROUTE,
	LANDMARKS,
	createAttempts,
	detectDelimiter,
	exportStudySheet,
	gradeWord,
	invalidateAttempts,
	normaliseAnswer,
	parseInput,
	practiceResults,
	recordAttempt,
	suggestFragments,
	weakUnits
} from './model';

describe('material preparation', () => {
	it('preserves repeated occurrences, order, punctuation and Unicode in a word list', () => {
		const units = parseInput('চাঁদ, café, চাঁদ, 🦋, key!', 'words', 'comma');
		expect(units.map((unit) => unit.label)).toEqual(['চাঁদ', 'café', 'চাঁদ', '🦋', 'key!']);
		expect(new Set(units.map((unit) => unit.id)).size).toBe(5);
		expect(units.map((unit) => unit.locus)).toEqual([0, 1, 2, 3, 4]);
		expect(units[0].source).toBe('চাঁদ');
	});

	it('uses explicit delimiters for phrases and treats commas deterministically in auto mode', () => {
		expect(detectDelimiter('solar energy, water vapour\ncloud')).toBe('comma');
		expect(detectDelimiter('solar energy\nwater vapour')).toBe('newline');
		expect(detectDelimiter('sun cloud rain')).toBe('space');
		expect(parseInput('solar energy, water vapour', 'words').map((unit) => unit.label)).toEqual([
			'solar energy',
			'water vapour'
		]);
		expect(
			parseInput('solar energy\r\nwater vapour\n', 'words', 'newline').map((unit) => unit.label)
		).toEqual(['solar energy', 'water vapour']);
		expect(parseInput('solar energy\twater', 'words', 'space').map((unit) => unit.label)).toEqual([
			'solar',
			'energy',
			'water'
		]);
	});

	it('keeps source fragments exact, including qualifications and negation', () => {
		const text =
			'Not every cloud produces rain; particles must grow sufficiently. Some water enters the ground!';
		const units = parseInput(text, 'concepts');
		expect(units.map((unit) => unit.source)).toEqual([
			'Not every cloud produces rain;',
			'particles must grow sufficiently.',
			'Some water enters the ground!'
		]);
		for (const unit of units) {
			expect(text.includes(unit.source)).toBe(true);
			expect(unit.meaning).toBe(unit.source);
			expect(unit.scene).toBe('');
			expect(unit.relationship).toBe('');
		}
		expect(suggestFragments('A sentence without ending punctuation')).toEqual([
			'A sentence without ending punctuation'
		]);
	});

	it('rejects empty, delimiter-only and over-limit input rather than silently truncating', () => {
		expect(() => parseInput(' \n\t ', 'words')).toThrow('Add a word list');
		expect(() => parseInput(',,,', 'words', 'comma')).toThrow('No items');
		expect(() => parseInput('!!!', 'concepts')).toThrow('No items');
		expect(() => parseInput('x'.repeat(MAX_INPUT + 1), 'words')).toThrow(
			'Nothing has been discarded'
		);
		expect(() =>
			parseInput(Array.from({ length: MAX_UNITS + 1 }, () => 'word').join(','), 'words')
		).toThrow('at most 48 units');
		expect(parseInput('x'.repeat(MAX_LABEL), 'words')).toHaveLength(1);
	});

	it('rejects word targets longer than the answerable label limit without losing source material', () => {
		expect(() => parseInput('x'.repeat(MAX_LABEL + 1), 'words')).toThrow('at most 600 characters');
		expect(() => parseInput('x'.repeat(MAX_LABEL + 1), 'words')).toThrow(
			'nothing has been discarded'
		);
		const source = 'x'.repeat(MAX_INPUT);
		const [unit] = parseInput(source, 'concepts');
		expect(unit.source).toBe(source);
		expect(unit.meaning).toBe(source);
		expect(unit.label).toHaveLength(MAX_LABEL);
		expect(unit.label.endsWith('…')).toBe(true);
		const emojiSource = '🦋'.repeat(MAX_INPUT / 2);
		const [emojiUnit] = parseInput(emojiSource, 'concepts');
		expect(emojiUnit.label.length).toBeLessThanOrEqual(MAX_LABEL);
		expect(emojiUnit.label).toBe('🦋'.repeat(299) + '…');
		expect(emojiUnit.source).toBe(emojiSource);
	});

	it('accounts for every unit across all four separate practice batches', () => {
		const units = parseInput(
			Array.from({ length: MAX_UNITS }, (_, index) => `word ${index + 1}`).join(','),
			'words'
		);
		expect(units).toHaveLength(MAX_UNITS);
		expect(new Set(units.map((unit) => unit.locus)).size).toBe(MAX_UNITS);
		expect(units[12].locus).toBe(12);
		expect(Math.floor(units[12].locus / LOCI_PER_ROUTE)).toBe(1);
		expect(LANDMARKS[units[12].locus % LOCI_PER_ROUTE].name).toBe('Gate');
		expect(units.at(-1)?.locus).toBe(47);
		expect(LANDMARKS).toHaveLength(LOCI_PER_ROUTE);
	});
});

describe('recall and occurrence identities', () => {
	it('matches only after documented case, whitespace and canonical Unicode normalisation', () => {
		expect(normaliseAnswer('  WATER\n vapour ')).toBe('water vapour');
		expect(gradeWord(' CAFE\u0301 ', 'café')).toBe(true);
		expect(gradeWord('  solar\tenergy ', 'solar energy')).toBe(true);
		expect(gradeWord('cafe', 'café')).toBe(false);
		expect(gradeWord('key', 'key!')).toBe(false);
		expect(gradeWord('', '')).toBe(false);
		expect(gradeWord('rain', 'precipitation')).toBe(false);
	});

	it('records repeated targets independently and leaves caller-owned attempts immutable', () => {
		const units = parseInput('key,key', 'words');
		const initial = createAttempts(units);
		const changed = recordAttempt(initial, units[1].id, {
			answer: 'key',
			submitted: true,
			result: 'remembered'
		});
		expect(changed[0].result).toBeNull();
		expect(changed[1].result).toBe('remembered');
		expect(initial[1].result).toBeNull();
		expect(recordAttempt(changed, 'missing', { result: 'missed' })).toEqual(changed);
	});

	it('separates unaided attempts, hinted answers and reveals before submission', () => {
		const units = parseInput('sun,cloud,rain,ocean', 'words');
		let attempts = createAttempts(units);
		attempts = recordAttempt(attempts, units[0].id, {
			answer: 'sun',
			submitted: true,
			revealed: true,
			result: 'remembered'
		});
		attempts = recordAttempt(attempts, units[1].id, {
			answer: 'cloud',
			submitted: true,
			hinted: true,
			result: 'remembered'
		});
		attempts = recordAttempt(attempts, units[2].id, { revealed: true, result: 'partial' });
		expect(practiceResults(attempts)).toEqual({
			total: 4,
			attempted: 3,
			remembered: 2,
			partial: 1,
			missed: 0,
			unassisted: 1,
			hinted: 1,
			revealed: 2
		});
	});

	it('clears stale practice only for changed units and preserves original loci on retries', () => {
		const units = parseInput('sun,cloud,rain,ocean', 'words');
		let attempts = createAttempts(units);
		attempts = recordAttempt(attempts, units[1].id, {
			answer: 'mist',
			submitted: true,
			hinted: true,
			revealed: true,
			result: 'partial'
		});
		attempts = recordAttempt(attempts, units[3].id, {
			answer: 'lake',
			submitted: true,
			result: 'missed'
		});
		const retry = weakUnits(units, attempts);
		expect(retry.map((unit) => unit.locus)).toEqual([1, 3]);
		expect(retry.map((unit) => unit.id)).toEqual([units[1].id, units[3].id]);
		retry[0].scene = 'A new association';
		expect(units[1].scene).toBe('');
		const invalidated = invalidateAttempts(attempts, [units[1].id]);
		expect(invalidated[1]).toEqual({
			unitId: units[1].id,
			answer: '',
			submitted: false,
			hinted: false,
			revealed: false,
			result: null
		});
		expect(invalidated[3].result).toBe('missed');
		expect(attempts[1].result).toBe('partial');
		expect(
			createAttempts(units).every((attempt) => attempt.result === null && attempt.answer === '')
		).toBe(true);
	});
});

describe('authored examples and study export', () => {
	it('keeps the published concrete words, scenes and landmark order aligned', () => {
		expect(WORD_EXAMPLE.units.map((unit) => unit.label)).toEqual([
			'umbrella',
			'mango',
			'bicycle',
			'candle',
			'elephant',
			'violin',
			'key',
			'ocean',
			'clock',
			'butterfly'
		]);
		expect(parseInput(WORD_EXAMPLE.text, 'words').map((unit) => unit.label)).toEqual(
			WORD_EXAMPLE.units.map((unit) => unit.label)
		);
		expect(
			WORD_EXAMPLE.units.every((unit, index) => unit.locus === index && unit.scene && unit.why)
		).toBe(true);
	});

	it('retains exact source references and alternative water paths in the authored concept cards', () => {
		expect(CONCEPT_EXAMPLE.text).toBe(WATER_CYCLE_TEXT);
		expect(CONCEPT_EXAMPLE.units).toHaveLength(7);
		for (const unit of CONCEPT_EXAMPLE.units)
			expect(WATER_CYCLE_TEXT.includes(unit.source)).toBe(true);
		expect(CONCEPT_EXAMPLE.units[1].meaning).toContain('cools enough');
		expect(CONCEPT_EXAMPLE.units[3].meaning).toContain('grow sufficiently');
		expect(CONCEPT_EXAMPLE.units[4].relationship).toContain('alternatives');
		expect(CONCEPT_EXAMPLE.units[5].relationship).toContain('alternative');
		expect(CONCEPT_EXAMPLE.units[6].relationship).toContain('does not mean all infiltrated');
	});

	it('exports all material in locus order with explicit batches and inert user HTML', () => {
		const units = parseInput('<script>alert(1)</script>,sun', 'words');
		units[0].locus = 13;
		units[0].scene = 'A <b>strange</b> scene';
		units[0].why = 'A memorable association';
		units[0].relationship = 'Comes before the next unit';
		const sheet = exportStudySheet(units, 'words');
		expect(sheet).toContain('Batch 2, 2. Front steps');
		expect(sheet.indexOf('Target: sun')).toBeLessThan(sheet.indexOf('Target: &lt;script&gt;'));
		expect(sheet).not.toContain('<script>');
		expect(sheet).toContain('Scene: A &lt;b&gt;strange&lt;/b&gt; scene');
		expect(sheet).toContain('Why it reminds me: A memorable association');
		expect(sheet).toContain('Relationship: Comes before the next unit');
		expect(exportStudySheet(CONCEPT_EXAMPLE.units, 'concepts')).toContain(
			'meaning, not exact wording'
		);
		expect(exportStudySheet([], 'words')).toContain('# My memory palace');
	});
});
