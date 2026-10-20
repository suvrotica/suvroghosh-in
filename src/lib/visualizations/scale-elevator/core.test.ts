import { describe, expect, it } from 'vitest';
import {
	DEFAULT_STATE,
	FLOORS,
	SCENARIOS,
	TOUR_DURATION,
	encodeState,
	evaluateModel,
	floorAt,
	normaliseState,
	parseState,
	readingFor,
	tourProgress,
	tissueSupply
} from './core';
import type { ElevatorState } from './types';

const at = (progress: number, overrides: Partial<ElevatorState> = {}): ElevatorState => ({
	...DEFAULT_STATE,
	progress,
	...overrides
});
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

it('keeps the authored tissue field consistent across reading, distance and perfusion', () => {
	expect(tissueSupply(0, 1)).toBe(1);
	expect(tissueSupply(2.4, 1)).toBeLessThan(tissueSupply(0.8, 1));
	expect(tissueSupply(0.8, 2)).toBeCloseTo(2 * tissueSupply(0.8, 1));
	expect(tissueSupply(Infinity, NaN)).toBe(0);
	const input = at(4, { selected: 3 });
	expect(readingFor(4, input, evaluateModel(input)).primary.value).toBeCloseTo(
		tissueSupply(2.4, 1)
	);
});

it('holds authored organ demand fixed while perfusion changes the delivery balance', () => {
	const baseline = evaluateModel(at(5));
	const reduced = evaluateModel(at(5, { control: 0 }));
	expect(baseline.regionalDemand).toEqual([12, 10, 9, 8]);
	expect(reduced.regionalDemand).toEqual(baseline.regionalDemand);
	expect(reduced.regionalDelivery[0]).toBeLessThan(reduced.regionalDemand[0]);
	expect(reduced.regionalDelivery.slice(1)).toEqual(baseline.regionalDelivery.slice(1));
	expect(evaluateModel(at(5, { scenario: 'haemoglobin' })).regionalDemand).toEqual(
		baseline.regionalDemand
	);
});

describe('Scale Elevator registry and navigation', () => {
	it('defines the eleven stops with meaningful measurement contracts', () => {
		expect(FLOORS.map((floor) => floor.id)).toEqual([
			'ion',
			'molecule',
			'membrane',
			'cell',
			'tissue',
			'organ',
			'person',
			'bed',
			'ward',
			'hospital',
			'city'
		]);
		for (const floor of FLOORS) {
			for (const text of [
				floor.question,
				floor.extent,
				floor.quantity,
				floor.denominator,
				floor.interval,
				floor.support,
				floor.basis,
				floor.transition
			])
				expect(text.length).toBeGreaterThan(3);
			expect(floor.unit.length).toBeGreaterThan(0);
			expect(floor.metres).toBeGreaterThan(0);
		}
		expect(SCENARIOS.map((scenario) => scenario.id)).toEqual([
			'baseline',
			'haemoglobin',
			'flow',
			'demand'
		]);
	});
	it('bounds jumps and can navigate in both directions', () => {
		expect(floorAt(-12)).toBe(0);
		expect(floorAt(99)).toBe(10);
		for (let floor = 0; floor < 11; floor++) {
			expect(floorAt(floor, floor - 1)).toBe(floor);
			expect(floorAt(floor, floor + 1)).toBe(floor);
		}
	});
	it('keeps a selected floor stable around midpoint boundaries', () => {
		expect(floorAt(4.52, 4)).toBe(4);
		expect(floorAt(4.48, 5)).toBe(5);
		expect(floorAt(4.55, 4)).toBe(5);
		expect(floorAt(4.45, 5)).toBe(4);
		expect(floorAt(Number.NaN, 4)).toBe(0);
		expect(floorAt(2.4, Number.POSITIVE_INFINITY)).toBe(2);
	});
	it('runs a monotonic 52-second tour, holding at every stop', () => {
		expect(TOUR_DURATION).toBe(52);
		for (let floor = 0; floor <= 10; floor++) {
			expect(tourProgress(floor * 5)).toBe(floor);
			expect(tourProgress(floor * 5 + 1.5)).toBe(floor);
		}
		let previous = 0;
		for (let second = 0; second <= 52; second += 0.125) {
			const progress = tourProgress(second);
			expect(progress).toBeGreaterThanOrEqual(previous);
			expect(progress).toBeLessThanOrEqual(10);
			previous = progress;
		}
		expect(tourProgress(52)).toBe(10);
		expect(tourProgress(-3)).toBe(0);
		expect(tourProgress(Number.NaN)).toBe(0);
	});
});

describe('validated share state', () => {
	it('round trips exact finite state and preserves zero-valued controls', () => {
		const state = at(4.125, { control: 0, selected: 0, seed: 123, scenario: 'flow' });
		expect(parseState(encodeState(state))).toEqual(state);
		expect(
			parseState('?se-scale=0&se-control=0&se-selected=0&se-seed=1&se-scenario=baseline')
		).toEqual(at(0, { control: 0, selected: 0, seed: 1 }));
	});
	it('rejects missing, empty, nonfinite and malformed values without coercing them to zero', () => {
		expect(parseState('')).toEqual(DEFAULT_STATE);
		expect(parseState('?se-scale=&se-control=&se-seed=&se-selected=&se-scenario=oops')).toEqual(
			DEFAULT_STATE
		);
		expect(parseState('?se-scale=Infinity&se-control=NaN&se-seed=1e309&se-selected=hello')).toEqual(
			DEFAULT_STATE
		);
		expect(
			normaliseState({
				progress: Number.NaN,
				control: Number.POSITIVE_INFINITY,
				seed: Number.NEGATIVE_INFINITY
			})
		).toEqual(DEFAULT_STATE);
	});
	it('bounds all accepted inputs and prevents invalid scenarios or selector values', () => {
		expect(
			parseState('?se-scale=-20&se-control=999&se-selected=2.8&se-seed=0&se-scenario=haemoglobin')
		).toEqual(at(0, { control: 1, selected: 3, seed: 1, scenario: 'haemoglobin' }));
		expect(parseState('?se-scale=999&se-control=-1&se-selected=999&se-seed=999999999999')).toEqual(
			at(10, { control: 0, selected: 35, seed: 2147483646 })
		);
	});
});

describe('scientific quantity and scenario separation', () => {
	it('converts saturation percent and litres of blood explicitly', () => {
		const model = evaluateModel(at(6));
		expect(model.saturation).toBe(98);
		expect(model.content).toBeCloseTo(1.34 * 15 * 0.98 + 0.003 * 100, 10);
		expect(model.content).toBeCloseTo(19.998, 10);
		expect(model.delivery).toBeCloseTo(999.9, 10);
	});
	it('same saturation with less haemoglobin reduces content and delivery, not source draw', () => {
		const baseline = evaluateModel(at(6));
		const changed = evaluateModel(at(6, { scenario: 'haemoglobin' }));
		expect(changed.saturation).toBe(baseline.saturation);
		expect(changed.partialPressure).toBe(baseline.partialPressure);
		expect(changed.cardiacOutput).toBe(baseline.cardiacOutput);
		expect(changed.haemoglobin).toBe(8);
		expect(changed.content).toBeCloseTo(10.8056, 8);
		expect(changed.delivery).toBeLessThan(baseline.delivery);
		expect(changed.bedDemands).toEqual(baseline.bedDemands);
		expect(changed.trace).toEqual(baseline.trace);
	});
	it('same content with less flow reduces delivery in the declared ratio', () => {
		const baseline = evaluateModel(at(6));
		const changed = evaluateModel(at(6, { scenario: 'flow' }));
		expect(changed.content).toBe(baseline.content);
		expect(changed.haemoglobin).toBe(baseline.haemoglobin);
		expect(changed.cardiacOutput).toBe(3);
		expect(changed.delivery / baseline.delivery).toBeCloseTo(0.6, 10);
		expect(changed.bedDemands).toEqual(baseline.bedDemands);
	});
	it('same occupied beds can have larger gas demand without changing patient physiology', () => {
		const baseline = evaluateModel(at(9));
		const changed = evaluateModel(at(9, { scenario: 'demand' }));
		expect(changed.bedDemands).toHaveLength(36);
		expect(changed.hospitalDemand / baseline.hospitalDemand).toBeCloseTo(1.8, 10);
		expect(changed.cityDemand / baseline.cityDemand).toBeCloseTo(1.8, 10);
		expect(changed.saturation).toBe(baseline.saturation);
		expect(changed.delivery).toBe(baseline.delivery);
		expect(changed.hospitalCapacity).toBe(baseline.hospitalCapacity);
	});
	it('early-floor knobs use distinct illustrative models and never alter service demand', () => {
		expect(evaluateModel(at(0, { control: 0 })).occupancy).toBe(0);
		expect(evaluateModel(at(0, { control: 1 })).occupancy).toBe(1);
		expect(evaluateModel(at(1, { control: 0 })).occupancy).toBeLessThan(
			evaluateModel(at(1, { control: 1 })).occupancy
		);
		expect(evaluateModel(at(2, { control: 1 })).flux).toBeCloseTo(1.85);
		expect(evaluateModel(at(3, { control: 0 })).uptake).toBeCloseTo(0.4);
		expect(evaluateModel(at(4, { control: 0 })).perfusion).toBeCloseTo(0.35);
		const model = evaluateModel(at(2, { control: 1 }));
		expect(model.hospitalDemand).toBe(evaluateModel(at(2, { control: 0 })).hospitalDemand);
		expect(model.delivery).toBe(evaluateModel(at(2, { control: 0 })).delivery);
	});
	it('changes only the inspected organ region when local perfusion changes', () => {
		const reference = evaluateModel(at(5, { control: 0.5, selected: 2 }));
		const reduced = evaluateModel(at(5, { control: 0, selected: 2 }));
		for (let region = 0; region < 4; region++) {
			if (region === 2)
				expect(reduced.regionalDelivery[region] / reference.regionalDelivery[region]).toBeCloseTo(
					0.3,
					10
				);
			else expect(reduced.regionalDelivery[region]).toBe(reference.regionalDelivery[region]);
		}
		expect(reduced.delivery).toBe(reference.delivery);
	});
	it('generates deterministic synthetic traces, bounded quality, and inspectable minutes', () => {
		const model = evaluateModel(at(7));
		expect(model).toEqual(evaluateModel(at(7)));
		expect(model.trace).not.toEqual(evaluateModel(at(7, { seed: 9123 })).trace);
		for (const point of model.trace) {
			expect(point.quality).toBeGreaterThanOrEqual(0);
			expect(point.quality).toBeLessThanOrEqual(1);
			expect(point.saturation).toBeGreaterThan(95);
			expect(point.saturation).toBeLessThanOrEqual(100);
		}
		expect(readingFor(7, at(7, { control: 0 }), model).primary.label).toContain('minute 0');
		expect(readingFor(7, at(7, { control: 1 }), model).primary.label).toContain('minute 11');
	});
	it('keeps every floor reading explicit about units, model basis, and scenario scope', () => {
		for (const scenario of SCENARIOS) {
			for (let floor = 0; floor < 11; floor++) {
				const state = at(floor, { scenario: scenario.id });
				const reading = readingFor(floor, state, evaluateModel(state));
				expect(reading.primary.label.length).toBeGreaterThan(3);
				expect(reading.primary.unit.length).toBeGreaterThan(0);
				expect(reading.insight.length).toBeGreaterThan(30);
				expect(reading.effect.length).toBeGreaterThan(30);
			}
		}
	});
});

describe('compatible gas aggregation and capacity invariants', () => {
	it('sums twelve source draws per ward and three equal-occupancy wards per hospital', () => {
		const model = evaluateModel(at(8));
		expect(model.wardDemands).toEqual([52, 77, 113]);
		expect(model.hospitalDemand).toBe(242);
		expect(model.cityDemand).toBe(726);
		for (let ward = 0; ward < 3; ward++)
			expect(model.wardDemands[ward]).toBe(sum(model.bedDemands.slice(ward * 12, ward * 12 + 12)));
		for (const selected of [0, 12, 24, 35]) {
			const reading = readingFor(8, at(8, { selected }), model);
			expect(reading.primary.value).toBe(model.wardDemands[Math.floor(selected / 12)]);
			expect(reading.secondary[1].value).toBe(model.bedDemands[selected]);
		}
	});
	it('conserves gas and obeys branch/source/demand limits over scenarios and controls', () => {
		for (const scenario of SCENARIOS) {
			for (let control = 0; control <= 1; control += 0.05) {
				for (const floor of [8, 9, 10]) {
					const model = evaluateModel(at(floor, { control, scenario: scenario.id }));
					expect(model.hospitalAllocated).toBeCloseTo(sum(model.wardAllocated), 10);
					expect(model.hospitalAllocated).toBeLessThanOrEqual(model.hospitalCapacity + 1e-10);
					expect(model.hospitalAllocated).toBeLessThanOrEqual(model.hospitalDemand + 1e-10);
					expect(model.unmet + model.hospitalAllocated).toBeCloseTo(model.hospitalDemand, 10);
					for (let ward = 0; ward < 3; ward++) {
						expect(model.wardAllocated[ward]).toBeGreaterThanOrEqual(0);
						expect(model.wardAllocated[ward]).toBeLessThanOrEqual(
							model.wardCapacities[ward] + 1e-10
						);
						expect(model.wardAllocated[ward]).toBeLessThanOrEqual(model.wardDemands[ward] + 1e-10);
					}
				}
			}
		}
	});
	it('demonstrates unmet demand despite sufficient nominal source capacity', () => {
		const model = evaluateModel(at(9));
		expect(model.hospitalCapacity).toBeGreaterThan(model.hospitalDemand);
		expect(model.unmet).toBe(23);
		expect(model.wardAllocated[2]).toBe(90);
		const improved = evaluateModel(at(9, { control: 1 }));
		expect(improved.unmet).toBe(0);
	});
	it('uses net reserve draw, handles nondepleting stock, and never divides by zero', () => {
		const model = evaluateModel(at(10));
		expect(model.reserveHours).toBeCloseTo(240000 / (726 - 650) / 60, 10);
		expect(evaluateModel(at(10, { control: 1 })).reserveHours).toBeNull();
		expect(evaluateModel(at(10, { control: 726 / 1300 })).reserveHours).toBeNull();
		expect(evaluateModel(at(10, { control: 0 })).reserveHours).toBeCloseTo(240000 / 726 / 60, 10);
	});
	it('sanitises nonfinite input before it can contaminate model arithmetic', () => {
		const model = evaluateModel({
			progress: Number.NaN,
			scenario: 'baseline',
			control: Number.POSITIVE_INFINITY,
			selected: Number.NaN,
			seed: Number.NaN
		});
		expect(model).toEqual(evaluateModel(DEFAULT_STATE));
		for (const value of Object.values(model))
			if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
	});
});
