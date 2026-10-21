import { describe, expect, it } from 'vitest';
import { createPageviewLedger } from './pageviews';

describe('consented pageview ledger', () => {
	it('counts initial consent once, without counting repeated effects or re-granting', () => {
		const ledger = createPageviewLedger();
		ledger.navigate('/writing');
		expect(ledger.take(false)).toBeNull();
		expect(ledger.take(true)).toBe('/writing');
		ledger.navigate('/writing');
		expect(ledger.take(true)).toBeNull();
		expect(ledger.take(false)).toBeNull();
		expect(ledger.take(true)).toBeNull();
	});
	it('counts completed pathname visits, including returning to a page', () => {
		const ledger = createPageviewLedger();
		for (const path of ['/writing', '/about', '/writing']) {
			ledger.navigate(path);
			expect(ledger.take(true)).toBe(path);
			expect(ledger.take(true)).toBeNull();
		}
	});
	it('records only the current page when consent is granted after navigation', () => {
		const ledger = createPageviewLedger();
		ledger.navigate('/writing');
		expect(ledger.take(false)).toBeNull();
		ledger.navigate('/about');
		expect(ledger.take(true)).toBe('/about');
	});
});
