import { describe, expect, it, vi } from 'vitest';
import { DiffusionModel } from './diffusion';
import { WalkModel } from './walk';

const mass = (model: DiffusionModel) => model.values.reduce((sum, value) => sum + value, 0);

describe('Living Systems diffusion', () => {
	it('preserves mass, nonnegativity and decreasing variance at the maximum stable coefficient', () => {
		const model = new DiffusionModel('twin', 0.24);
		const initialMass = mass(model);
		const initialVariance = model.history[0];
		model.step(300);
		expect(mass(model)).toBeCloseTo(initialMass, 9);
		expect(Math.min(...model.values)).toBeGreaterThanOrEqual(0);
		expect(model.history.at(-1)).toBeLessThan(initialVariance);
		for (let i = 1; i < model.history.length; i++) {
			expect(model.history[i]).toBeLessThanOrEqual(model.history[i - 1] + 1e-12);
		}
	});

	it('has no flux across outer edges or an impermeable wall', () => {
		const model = new DiffusionModel('drop');
		model.values.fill(0);
		model.values[0] = 1;
		for (let y = 0; y < model.height; y++) model.obstacles[y * model.width + 3] = 1;
		model.step(200);
		expect(mass(model)).toBeCloseTo(1, 12);
		for (let y = 0; y < model.height; y++) {
			for (let x = 3; x < model.width; x++) expect(model.values[y * model.width + x]).toBe(0);
		}
	});

	it('displaces dye when a wall is painted, preserving the amount in the remaining fluid', () => {
		const model = new DiffusionModel('drop');
		const before = mass(model);
		model.paint(60, 42, 'obstacle', 5);
		expect(model.obstacles[42 * model.width + 60]).toBe(1);
		expect(mass(model)).toBeCloseTo(before, 10);
		model.step(30);
		expect(mass(model)).toBeCloseTo(before, 10);
		expect(Math.min(...model.values)).toBeGreaterThanOrEqual(0);
	});

	it('adds a continuous source only when explicitly enabled and resets it', () => {
		const model = new DiffusionModel('drop');
		const initialMass = mass(model);
		model.step(10);
		expect(mass(model)).toBeCloseTo(initialMass, 10);
		model.continuous = true;
		model.step(10);
		expect(mass(model)).toBeGreaterThan(initialMass);
		model.reset('band', Infinity);
		expect(model.continuous).toBe(false);
		expect(model.diffusivity).toBe(0.18);
		expect(model.steps).toBe(0);
	});

	it('updates the current chart observation when painting without inventing time steps', () => {
		const model = new DiffusionModel('drop');
		model.step(3);
		const historyLength = model.history.length;
		const previousHistory = model.history.slice(0, -1);
		const before = model.history.at(-1);
		model.paint(25, 25, 'paint', 6);
		model.paint(60, 42, 'obstacle', 3);
		expect(model.steps).toBe(3);
		expect(model.history).toHaveLength(historyLength);
		expect(model.history.slice(0, -1)).toEqual(previousHistory);
		expect(model.history.at(-1)).not.toBe(before);
		expect(model.history.at(-1)).toBe(model.stats()[2].value);
	});
});

describe('Living Systems random walk', () => {
	it('reproduces the same paths from the same seed independently of step batching', () => {
		const random = vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('Ambient randomness is forbidden');
		});
		try {
			const a = new WalkModel(1847, 'ensemble', 40);
			const b = new WalkModel(1847, 'ensemble', 40);
			a.step(150);
			for (let i = 0; i < 150; i++) b.step();
			expect(a.x).toEqual(b.x);
			expect(a.y).toEqual(b.y);
			expect(a.paths).toEqual(b.paths);
			expect(a.history).toEqual(b.history);
			expect(a.occupancy).toEqual(b.occupancy);
			a.reset(1847, 'ensemble', 40);
			a.step(150);
			expect(a.paths).toEqual(b.paths);
		} finally {
			random.mockRestore();
		}
	});

	it('takes exactly one cardinal unit step per walker and counts actual occupancy', () => {
		const model = new WalkModel(7, 'ensemble', 80);
		model.step();
		for (let i = 0; i < model.count; i++)
			expect(Math.abs(model.x[i]) + Math.abs(model.y[i])).toBe(1);
		expect(model.msd).toBe(1);
		expect(model.occupancy.reduce((sum, count) => sum + count, 0)).toBe(160);
	});

	it('uses unwrapped displacement even when positions have crossed the display boundary', () => {
		const model = new WalkModel(9, 'ensemble', 3);
		model.x.set([121, -241, 0]);
		model.y.set([85, 0, -169]);
		model.step();
		const measured = model.x.reduce((sum, x, i) => sum + x * x + model.y[i] ** 2, 0) / model.count;
		expect(model.msd).toBe(measured);
		expect(model.msd).toBeGreaterThan(10_000);
	});

	it('bounds populations and history while keeping the single-walker preset precise', () => {
		const model = new WalkModel(0, 'ensemble', 100_000);
		expect(model.count).toBe(600);
		model.reset(3, 'single', 600);
		expect(model.count).toBe(1);
		model.step(500);
		expect(model.paths[0]).toHaveLength(256);
		expect(model.history).toHaveLength(180);
		expect(model.steps).toBe(500);
		model.reset(3, 'ensemble', -20);
		expect(model.count).toBe(1);
	});
});
