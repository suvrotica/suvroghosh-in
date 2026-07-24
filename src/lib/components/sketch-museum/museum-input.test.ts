import { describe, expect, it } from 'vitest';
import { isMuseumMovementKey, shouldHandleMuseumMovementKey } from './museum-input';

describe('museum keyboard input', () => {
	it('recognises only the movement controls', () => {
		expect(isMuseumMovementKey('W')).toBe(true);
		expect(isMuseumMovementKey('ArrowLeft')).toBe(true);
		expect(isMuseumMovementKey('Enter')).toBe(false);
	});

	it('handles movement only while focus is in the museum', () => {
		expect(shouldHandleMuseumMovementKey('w', { insideMuseum: true, typingTarget: false })).toBe(
			true
		);
		expect(
			shouldHandleMuseumMovementKey('ArrowDown', {
				insideMuseum: false,
				typingTarget: false
			})
		).toBe(false);
	});

	it('does not capture movement keys from a typing control', () => {
		expect(shouldHandleMuseumMovementKey('a', { insideMuseum: true, typingTarget: true })).toBe(
			false
		);
	});
});
