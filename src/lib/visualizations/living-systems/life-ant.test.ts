import { describe, expect, it } from 'vitest';
import { AntModel } from './ant';
import { LifeModel } from './life';

function emptyLife(boundary: 'wrap' | 'finite' = 'finite') {
	return new LifeModel(1847, 'soup', 0, boundary);
}

function setCells(model: LifeModel, points: readonly (readonly [number, number])[]) {
	for (const [x, y] of points) model.paint(x, y, 'paint', 0);
}

describe('Conway B3/S23 model', () => {
	it('keeps a block stable and ages its survivors without mutating a prior buffer', () => {
		const model = emptyLife();
		setCells(model, [
			[20, 20],
			[21, 20],
			[20, 21],
			[21, 21]
		]);
		const initial = model.cells.slice();
		model.step(10);
		expect(model.cells).toEqual(initial);
		expect(model.steps).toBe(10);
		expect(model.ages[20 * model.width + 20]).toBe(11);
		expect(model.stats()[1].value).toBe(4);
	});

	it('rotates a blinker after one generation and restores it after two', () => {
		const model = emptyLife();
		setCells(model, [
			[30, 30],
			[31, 30],
			[32, 30]
		]);
		const initial = model.cells.slice();
		model.step();
		expect(model.cells[29 * model.width + 31]).toBe(1);
		expect(model.cells[30 * model.width + 30]).toBe(0);
		expect(model.stats()[1].value).toBe(3);
		model.step();
		expect(model.cells).toEqual(initial);
	});

	it('updates all cells simultaneously so an isolated cell dies and three neighbours give birth', () => {
		const model = emptyLife();
		setCells(model, [
			[5, 5],
			[20, 20],
			[21, 20],
			[22, 20]
		]);
		model.step();
		expect(model.cells[5 * model.width + 5]).toBe(0);
		expect(model.cells[19 * model.width + 21]).toBe(1);
	});

	it('distinguishes the wrapping seam from dead finite boundaries', () => {
		const finite = emptyLife('finite');
		const torus = emptyLife('wrap');
		const points = [
			[119, 30],
			[0, 30],
			[1, 30]
		] as const;
		setCells(finite, points);
		setCells(torus, points);
		finite.step();
		torus.step();
		expect(torus.cells[29 * torus.width]).toBe(1);
		expect(finite.cells[29 * finite.width]).toBe(0);
		expect(torus.stats()[1].value).toBe(3);
		expect(finite.stats()[1].value).toBe(0);
	});

	it('uses the canonical 48-cell, period-three pulsar', () => {
		const model = new LifeModel(1, 'pulsar');
		const initial = model.cells.slice();
		expect(model.stats()[1].value).toBe(48);
		model.step(3);
		expect(model.cells).toEqual(initial);
	});

	it('uses a 36-cell Gosper gun which emits a glider after its first period', () => {
		const model = new LifeModel(1, 'gun');
		expect(model.stats()[1].value).toBe(36);
		model.step(30);
		expect(model.stats()[1].value).toBe(41);
	});

	it('replays seeded soup and resets age, generation and history', () => {
		const first = new LifeModel(291, 'soup', 0.27);
		const second = new LifeModel(291, 'soup', 0.27);
		first.step(4);
		second.step(4);
		expect(first.cells).toEqual(second.cells);
		first.reset(291, 'soup', 0.27, 'wrap');
		expect(first.steps).toBe(0);
		expect(first.history).toHaveLength(1);
		expect(first.cells).toEqual(new LifeModel(291, 'soup', 0.27).cells);
	});

	it('bounds its history and stamps without advancing a generation', () => {
		const model = emptyLife();
		model.paint(40, 40, 'stamp', 0, 'glider');
		expect(model.steps).toBe(0);
		expect(model.stats()[1].value).toBe(5);
		model.step(200);
		expect(model.history).toHaveLength(180);
	});
});

describe('Langton ant white-right / black-left lattice', () => {
	it('matches the first six independently specified turns and flips', () => {
		const model = new AntModel();
		const expected = [
			[1, 0, 1, 1],
			[1, 1, 2, 2],
			[0, 1, 3, 3],
			[0, 0, 0, 4],
			[-1, 0, 3, 3],
			[-1, -1, 0, 4]
		];
		for (const [x, y, direction, black] of expected) {
			model.step();
			expect([model.x, model.y, model.direction, model.black.size]).toEqual([
				x,
				y,
				direction,
				black
			]);
		}
		expect(model.visited.size).toBe(5);
	});

	it('pre-rolls the highway preset through the actual classic rules', () => {
		const highway = new AntModel('highway');
		const classic = new AntModel();
		classic.step(11_000);
		expect(highway.steps).toBe(11_000);
		expect([highway.x, highway.y, highway.direction]).toEqual([
			classic.x,
			classic.y,
			classic.direction
		]);
		expect(highway.black).toEqual(classic.black);
		expect(highway.visited).toEqual(classic.visited);
	});

	it('tracks unbounded lattice coordinates and reset clears the experiment', () => {
		const model = new AntModel('highway');
		model.step(40_000);
		expect(Math.max(Math.abs(model.x), Math.abs(model.y))).toBeGreaterThan(120);
		expect(model.history).toHaveLength(180);
		model.reset('classic');
		expect(model.steps).toBe(0);
		expect(model.black.size).toBe(0);
		expect(model.visited.size).toBe(0);
		expect([model.x, model.y, model.direction]).toEqual([0, 0, 0]);
	});

	it('stops at its disclosed million-step budget and ignores invalid counts', () => {
		const model = new AntModel();
		model.steps = model.maxSteps - 2;
		model.step(10);
		expect(model.steps).toBe(model.maxSteps);
		expect(model.exhausted).toBe(true);
		const state = [model.x, model.y, model.direction];
		model.step(10);
		model.step(Number.NaN);
		expect([model.x, model.y, model.direction]).toEqual(state);
	});
});
