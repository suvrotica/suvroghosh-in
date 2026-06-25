/**
 * Reactive store that tracks the user's prefers-reduced-motion setting.
 * SSR-safe: returns `false` on the server.
 */
import { readable } from 'svelte/store';

export const prefersReducedMotion = readable(false, (set) => {
	if (typeof window === 'undefined' || !window.matchMedia) return;

	const query = window.matchMedia('(prefers-reduced-motion: reduce)');
	set(query.matches);

	const handler = (e: MediaQueryListEvent) => set(e.matches);
	query.addEventListener('change', handler);

	return () => query.removeEventListener('change', handler);
});