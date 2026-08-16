import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreferencesState } from './preferences-state.svelte';

function stubWindow(saved: string | null, setItem = vi.fn()): void {
	vi.stubGlobal('window', {
		matchMedia: vi.fn(() => ({ matches: true })),
		localStorage: {
			getItem: vi.fn(() => saved),
			setItem
		}
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('PreferencesState', () => {
	it('ignores valid JSON with invalid enum and overlay values', () => {
		stubWindow(
			JSON.stringify({
				quality: 'cinematic',
				projection: 'fish-eye',
				theme: 'neon',
				highContrast: 'yes',
				reducedMotion: 'no',
				overlays: { axis: 'yes', centerline: true, invented: true }
			})
		);
		const preferences = new PreferencesState();

		preferences.load();

		expect(preferences.quality).toBe('auto');
		expect(preferences.projection).toBe('perspective');
		expect(preferences.theme).toBe('dark');
		expect(preferences.highContrast).toBe(false);
		expect(preferences.reducedMotion).toBe(true);
		expect(preferences.overlays.axis).toBe(true);
		expect(preferences.overlays.centerline).toBe(true);
		expect('invented' in preferences.overlays).toBe(false);
	});

	it('keeps storage failures non-fatal on load and save', () => {
		const storageError = new DOMException('Storage unavailable', 'SecurityError');
		vi.stubGlobal('window', {
			matchMedia: vi.fn(() => ({ matches: false })),
			localStorage: {
				getItem: vi.fn(() => {
					throw storageError;
				}),
				setItem: vi.fn(() => {
					throw storageError;
				})
			}
		});
		const preferences = new PreferencesState();

		expect(() => preferences.load()).not.toThrow();
		expect(() => preferences.save()).not.toThrow();
	});
});
