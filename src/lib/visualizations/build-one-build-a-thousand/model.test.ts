import { describe, expect, it } from 'vitest';
import {
	calculateWorkshop,
	countedBundles,
	DEFAULT_INPUT,
	normaliseInput,
	originalSetup,
	resetWorkshop
} from './model';

const input = (quantity: number) => ({ ...DEFAULT_INPUT, quantity });
describe('one-maker teaching model', () => {
	it('keeps all four specified worked examples exact', () => {
		expect(calculateWorkshop(input(1))).toMatchObject({ handsOnMinutes: 60, readyToSendDay: 1 });
		expect(calculateWorkshop(input(10)).handsOnMinutes).toBe(620);
		expect(calculateWorkshop({ ...input(10), cuttingGuide: true }).handsOnMinutes).toBe(630);
		expect(calculateWorkshop(input(1000))).toMatchObject({
			handsOnMinutes: 62000,
			workshopFixes: 100,
			deliveryProblems: 50,
			readyToSendDay: 153
		});
		expect(
			calculateWorkshop({
				quantity: 1000,
				cuttingGuide: true,
				instructions: true,
				protectivePackaging: true
			})
		).toMatchObject({
			handsOnMinutes: 41670,
			workshopFixes: 20,
			deliveryProblems: 10,
			readyToSendDay: 105
		});
	});
	it('places the stock boundary at twenty', () => {
		expect(calculateWorkshop(input(20)).materialWaitDays).toBe(0);
		expect(calculateWorkshop(input(21)).materialWaitDays).toBe(5);
	});
	it('uses floor rules at fix and delivery boundaries', () => {
		for (const [q, fixes] of [
			[9, 0],
			[10, 1]
		])
			expect(calculateWorkshop(input(q)).workshopFixes).toBe(fixes);
		for (const [q, fixes] of [
			[49, 0],
			[50, 1]
		])
			expect(calculateWorkshop({ ...input(q), instructions: true }).workshopFixes).toBe(fixes);
		for (const [q, count] of [
			[19, 0],
			[20, 1]
		])
			expect(calculateWorkshop(input(q)).deliveryProblems).toBe(count);
		for (const [q, count] of [
			[99, 0],
			[100, 1]
		])
			expect(calculateWorkshop({ ...input(q), protectivePackaging: true }).deliveryProblems).toBe(
				count
			);
	});
	it('keeps independent decisions confined to their stated consequences', () => {
		const base = calculateWorkshop(input(100));
		const packed = calculateWorkshop({ ...input(100), protectivePackaging: true });
		expect(packed.workshopFixes).toBe(base.workshopFixes);
		expect(packed.handsOnMinutes - base.handsOnMinutes).toBe(300);
		const instructed = calculateWorkshop({ ...input(100), instructions: true });
		expect(instructed.materialWaitDays).toBe(base.materialWaitDays);
		expect(instructed.deliveryProblems).toBe(base.deliveryProblems);
	});
	it('matches the original quantity and resets without shared mutable defaults', () => {
		expect(originalSetup({ ...input(621), cuttingGuide: true })).toEqual(
			calculateWorkshop(input(621))
		);
		const reset = resetWorkshop();
		reset.quantity = 8;
		expect(resetWorkshop()).toEqual(DEFAULT_INPUT);
	});
	it('rejects invalid model inputs and safely bounds UI numbers', () => {
		for (const q of [0, 1001, 1.5, NaN, Infinity, -1])
			expect(() => calculateWorkshop(input(q))).toThrow();
		expect(() => calculateWorkshop({ ...input(1), cuttingGuide: 'true' } as never)).toThrow();
		expect(normaliseInput({ quantity: NaN })).toEqual(DEFAULT_INPUT);
		expect(normaliseInput({ quantity: 1001 }).quantity).toBe(1000);
		expect(normaliseInput({ quantity: -7 }).quantity).toBe(1);
	});
	it('accounts exactly for every stand using bounded labelled bundles', () => {
		for (const q of [1, 10, 11, 21, 99, 100, 101, 999, 1000]) {
			const bundles = countedBundles(q);
			expect(bundles.reduce((sum, bundle) => sum + bundle.count, 0)).toBe(q);
			expect(bundles.length).toBeLessThanOrEqual(10);
		}
	});
	it('does not admit animation speed into the domain calculation', () => {
		const snapshot = calculateWorkshop(input(1000));
		for (const speed of [0, 0.5, 1, 2])
			expect(calculateWorkshop({ ...input(1000), speed } as never)).toEqual(snapshot);
	});
});
