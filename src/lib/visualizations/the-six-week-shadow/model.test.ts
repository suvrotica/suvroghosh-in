import { describe, expect, it } from 'vitest';
import { compileScenario, DEFAULT_SETTINGS, scheduleTasks, shadowBands, type Task } from './model';
import { decodeSettings, encodeSettings } from './url-state';
const fixture = (id: string, dependencies: string[], durationWorkingDays = 1): Task => ({
	id,
	dependencies,
	durationWorkingDays,
	effortPersonDays: 1,
	kind: 'work',
	label: id,
	description: id
});
describe('fictional shadow schedule', () => {
	it('computes the thirty-day batch and five-day prototype from task data', () => {
		expect(compileScenario(DEFAULT_SETTINGS)).toMatchObject({
			elapsedWorkingDays: 30,
			activeEffortPersonDays: 20
		});
		expect(compileScenario({ ...DEFAULT_SETTINGS, scenario: 'prototype' })).toMatchObject({
			elapsedWorkingDays: 5,
			activeEffortPersonDays: 5
		});
	});
	it('removes wait duration without removing effort or branches', () => {
		const run = compileScenario({ ...DEFAULT_SETTINGS, supplierWait: 0, productionWait: 0 });
		expect(run.elapsedWorkingDays).toBe(15);
		expect(run.activeEffortPersonDays).toBe(20);
		expect(run.tasks.find((task) => task.id === 'I')).toMatchObject({ start: 5, finish: 8 });
		expect(run.tasks.find((task) => task.id === 'J')).toMatchObject({ start: 11, finish: 13 });
		expect(shadowBands(run).reduce((sum, task) => sum + task.durationWorkingDays, 0)).toBe(15);
	});
	it('lets a longer parallel branch control release and chooses ties deterministically', () => {
		const tasks = [
			fixture('root', []),
			fixture('main', ['root'], 3),
			fixture('parallel', ['root'], 8),
			fixture('release', ['main', 'parallel'])
		];
		expect(scheduleTasks(tasks, 'release').controllingPath).toEqual([
			'root',
			'parallel',
			'release'
		]);
		expect(scheduleTasks(tasks, 'release').elapsedWorkingDays).toBe(10);
		tasks[2] = fixture('parallel', ['root'], 3);
		expect(scheduleTasks(tasks, 'release').controllingPath).toEqual(['root', 'main', 'release']);
	});
	it('rejects missing references, cycles, duplicate IDs and invalid values', () => {
		for (const tasks of [
			[fixture('a', ['missing'])],
			[fixture('a', ['b']), fixture('b', ['a'])],
			[fixture('a', []), fixture('a', [])],
			[fixture('a', [], -1)],
			[fixture('a', [], Infinity)],
			[{ ...fixture('a', []), effortPersonDays: NaN }]
		])
			expect(() => scheduleTasks(tasks, 'a')).toThrow();
	});
	it('validates all wait bounds and preserves no-change meaning', () => {
		for (const value of [-1, 21, NaN, 1.5])
			expect(() => compileScenario({ ...DEFAULT_SETTINGS, supplierWait: value })).toThrow();
		for (const value of [-1, 16, Infinity, 1.5])
			expect(() => compileScenario({ ...DEFAULT_SETTINGS, productionWait: value })).toThrow();
		expect(compileScenario({ ...DEFAULT_SETTINGS, changed: false }).tasks).toEqual([]);
		expect(
			compileScenario({ ...DEFAULT_SETTINGS, supplierWait: 20, productionWait: 15 })
				.elapsedWorkingDays
		).toBe(50);
	});
	it('restores defaults and allowlists versioned URL settings', () => {
		expect(decodeSettings(`?${encodeSettings(DEFAULT_SETTINGS)}`)).toEqual(DEFAULT_SETTINGS);
		expect(decodeSettings('?shadow=1.1.p.0.15')).toEqual({
			changed: true,
			scenario: 'prototype',
			supplierWait: 0,
			productionWait: 15
		});
		for (const invalid of [
			'2.1.b.10.5',
			'1.1.b.21.5',
			'1.1.x.0.0',
			'<script>',
			'1.1.b.-1.0',
			'1.1.b.1.1&shadow=1.1.b.0.0'
		])
			expect(decodeSettings(`?shadow=${invalid}`)).toEqual(DEFAULT_SETTINGS);
		expect(decodeSettings('?unrelated=one')).toBeNull();
		expect(decodeSettings('x'.repeat(513))).toBeNull();
	});
});
