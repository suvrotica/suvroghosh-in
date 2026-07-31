import { describe, expect, it } from 'vitest';
import { CANONICAL_CITY_REPORT, canonicalReportSnapshot } from './canonicalReport';
import { DEFAULT_CITY_CONFIG } from './constants';
import { generateCity } from './generator';

describe('published no-JavaScript canonical report', () => {
	it('matches the deterministic v1 city exactly', () => {
		expect(canonicalReportSnapshot(generateCity(DEFAULT_CITY_CONFIG))).toEqual(
			CANONICAL_CITY_REPORT
		);
	});
});
