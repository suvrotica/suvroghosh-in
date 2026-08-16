import { describe, expect, it } from 'vitest';
import { EVIDENCE_KIND_LABELS, RHYTHM_EVIDENCE, hasValidEvidenceClassification } from './evidence';
import { rhythmSeriesFor } from './rhythms';

describe('rhythm evidence ledger', () => {
	it('uses only the declared evidence classifications', () => {
		expect(Object.keys(EVIDENCE_KIND_LABELS)).toEqual([
			'authoritative-range',
			'measured-summary',
			'derived-conversion',
			'model-derived'
		]);
		for (const datum of RHYTHM_EVIDENCE) {
			expect(hasValidEvidenceClassification(datum.kind)).toBe(true);
			for (const supportKind of datum.supportKinds ?? []) {
				expect(hasValidEvidenceClassification(supportKind)).toBe(true);
			}
		}
	});

	it('attaches an HTTPS source and limitations to every datum', () => {
		for (const datum of RHYTHM_EVIDENCE) {
			expect(() => new URL(datum.sourceUrl)).not.toThrow();
			expect(datum.sourceUrl.startsWith('https://')).toBe(true);
			for (const source of datum.additionalSources ?? []) {
				expect(() => new URL(source.url)).not.toThrow();
				expect(source.url.startsWith('https://')).toBe(true);
			}
			expect(datum.limitations.length).toBeGreaterThan(0);
		}
	});

	it('does not misclassify fitted daily cortisol profile points as raw measurements', () => {
		expect(rhythmSeriesFor('24h').find((series) => series.id === 'core-temperature')?.kind).toBe(
			'model-derived'
		);
		expect(RHYTHM_EVIDENCE.find((datum) => datum.id === 'core-temperature')?.kind).toBe(
			'measured-summary'
		);
		expect(RHYTHM_EVIDENCE.find((datum) => datum.id === 'daily-cortisol')?.kind).toBe(
			'model-derived'
		);
		expect(RHYTHM_EVIDENCE.find((datum) => datum.id === 'daily-cortisol')?.sourceLabel).toContain(
			'Dmitrieva'
		);
	});

	it('keeps every drawn curve distinct from each claim that supports its numbers', () => {
		const byId = new Map(RHYTHM_EVIDENCE.map((datum) => [datum.id, datum]));
		expect(byId.get('heartbeat')?.supportKinds).toEqual([
			'derived-conversion',
			'authoritative-range'
		]);
		expect(byId.get('breathing')?.supportKinds).toEqual([
			'derived-conversion',
			'authoritative-range'
		]);
		expect(byId.get('glucose-insulin')?.kind).toBe('measured-summary');
		expect(byId.get('core-temperature')?.kind).toBe('measured-summary');
		expect(byId.get('daily-pressure')?.kind).toBe('measured-summary');

		for (const window of ['20s', '2h', '24h'] as const) {
			for (const series of rhythmSeriesFor(window)) {
				expect(series.kind).toBe('model-derived');
			}
		}
	});
});
