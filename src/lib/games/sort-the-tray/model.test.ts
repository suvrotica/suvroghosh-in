import { describe, expect, it } from 'vitest';
import { newTray, place, restore } from './model';

describe('Sort the Tray state', () => {
	it('allows each object only once in its own dish without changing progress for mismatches', () => {
		const state = newTray();
		expect(state.objects).toHaveLength(6);
		expect(new Set(state.objects.map((object) => object.id)).size).toBe(6);
		for (const object of state.objects) {
			const before = [...state.sorted];
			expect(place(state, object.id, object.type === 'coin' ? 'stone' : 'coin')).toBe(false);
			expect(state.sorted).toEqual(before);
			expect(place(state, object.id, object.type)).toBe(true);
			expect(place(state, object.id, object.type)).toBe(false);
		}
		expect(state.sorted).toHaveLength(6);
		expect(place(state, 999, 'coin')).toBe(false);
	});

	it('restores partial and completed trays including their order and preferences', () => {
		const state = newTray();
		state.sound = true;
		state.reduceMotion = true;
		for (const object of state.objects) {
			place(state, object.id, object.type);
			expect(restore(JSON.stringify(state))).toEqual(state);
		}
	});

	it('rejects malformed, excessive and incompatible saves', () => {
		const state = newTray();
		const invalid = [
			null,
			'{',
			'[]',
			'x'.repeat(5000),
			JSON.stringify({ ...state, version: 2 }),
			JSON.stringify({ ...state, objects: [...state.objects.slice(1), state.objects[1]] }),
			JSON.stringify({ ...state, sorted: [0, 0] }),
			JSON.stringify({ ...state, sorted: [8] }),
			JSON.stringify({
				...state,
				objects: state.objects.map((object) => ({ ...object, type: '<script>' }))
			})
		];
		for (const raw of invalid) expect(restore(raw)).toBe(null);
		const clean = restore(
			JSON.stringify({ ...state, sound: 'yes', reduceMotion: 'yes', extra: 'ignored' })
		);
		expect(clean?.sound).toBe(false);
		expect(clean?.reduceMotion).toBe(false);
		expect(clean).not.toHaveProperty('extra');
	});
});
