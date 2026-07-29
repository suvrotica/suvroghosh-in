import { describe, expect, it } from 'vitest';
import { isViewTransitionRoute, resolveRouteMotion, shouldUseViewTransition } from './route-biomes';
import type { RouteMotionConfig } from './types';

describe('route motion mapping', () => {
	it.each<[string, RouteMotionConfig]>([
		['/', { biome: 'home', intensity: 'standard', ambient: 'animated' }],
		['/start-here', { biome: 'home', intensity: 'quiet', ambient: 'animated' }],
		['/writing', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/blog', { biome: 'writing', intensity: 'quiet', ambient: 'animated' }],
		['/blog/archive/2026', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/blog/archive/2026/07', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/blog/personal-essay', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/blog/topics', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/blog/topics/healthcare', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/topics', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/topics/healthcare', { biome: 'writing', intensity: 'standard', ambient: 'animated' }],
		['/topics/calcutta', { biome: 'calcutta', intensity: 'standard', ambient: 'animated' }],
		['/blog/calcutta', { biome: 'calcutta', intensity: 'standard', ambient: 'animated' }],
		['/blog/calcutta-life', { biome: 'calcutta', intensity: 'standard', ambient: 'animated' }],
		['/blog/topics/kolkata', { biome: 'calcutta', intensity: 'standard', ambient: 'animated' }],
		[
			'/blog/personal-essay/an-ordinary-article',
			{ biome: 'quiet', intensity: 'header-only', ambient: 'static', scope: 'header' }
		],
		['/projects', { biome: 'healthcare', intensity: 'quiet', ambient: 'animated' }],
		['/consulting', { biome: 'healthcare', intensity: 'standard', ambient: 'animated' }],
		['/healthcare-it-gulf', { biome: 'healthcare', intensity: 'quiet', ambient: 'animated' }],
		['/resume', { biome: 'healthcare', intensity: 'minimal', ambient: 'static', scope: 'header' }],
		['/notes', { biome: 'notes', intensity: 'quiet', ambient: 'animated' }],
		['/notes/sign-in', { biome: 'notes', intensity: 'quiet', ambient: 'animated' }],
		['/contact', { biome: 'quiet', intensity: 'minimal', ambient: 'animated' }]
	])('maps %s deterministically', (pathname, expected) => {
		expect(resolveRouteMotion(pathname)).toEqual(expected);
		expect(resolveRouteMotion(`${pathname === '/' ? '' : pathname}/?preview=1#heading`)).toEqual(
			expected
		);
	});

	it('uses safe metadata only to refine indexes or opt out', () => {
		expect(resolveRouteMotion('/blog/city', { category: 'Calcutta' }).biome).toBe('calcutta');
		expect(resolveRouteMotion('/blog/city', { category: 'Calcutta Life' }).biome).toBe('calcutta');
		expect(resolveRouteMotion('/topics/city', { topic: 'Kolkata' }).biome).toBe('calcutta');
		expect(resolveRouteMotion('/blog/calcutta/an-article', { category: 'Calcutta' })).toEqual({
			biome: 'quiet',
			intensity: 'header-only',
			ambient: 'static',
			scope: 'header'
		});
		expect(resolveRouteMotion('/projects', { ownsAnimationLoop: true }).biome).toBe('off');
		expect(resolveRouteMotion('/', { specialShell: true }).biome).toBe('off');
	});
});

describe('special-route exclusions', () => {
	it.each([
		'/notes/a-public-note',
		'/notes/studio',
		'/notes/studio/note-id',
		'/blog/games',
		'/blog/games/calcutta-footpath-simulator-ekdom-side-diye-jaan',
		'/blog/visualizations/monte-carlo',
		'/images/sketches'
	])('turns off the global atmosphere on %s', (pathname) => {
		expect(resolveRouteMotion(pathname)).toEqual({
			biome: 'off',
			intensity: 'off',
			ambient: 'off'
		});
		expect(isViewTransitionRoute(pathname)).toBe(false);
	});

	it('keeps the visualization index lab-themed but non-running', () => {
		expect(resolveRouteMotion('/blog/visualizations')).toEqual({
			biome: 'lab',
			intensity: 'standard',
			ambient: 'static'
		});
		expect(isViewTransitionRoute('/blog/visualizations')).toBe(false);
	});

	it.each([
		'/start-here-now',
		'/blog/gamesmanship',
		'/blog/visualizations-extra',
		'/images/sketches-old',
		'/healthcare-it-gulf-coast'
	])('does not use route-prefix false positives for %s', (pathname) => {
		expect(resolveRouteMotion(pathname).biome).not.toBe('off');
	});
});

describe('view-transition eligibility', () => {
	it('allows ordinary route changes with motion enabled', () => {
		expect(shouldUseViewTransition('/', '/writing', 'gentle')).toBe(true);
		expect(shouldUseViewTransition('/projects', '/contact', 'alive')).toBe(true);
	});

	it('skips still, same-document, specialist, and loop-owning routes', () => {
		expect(shouldUseViewTransition('/', '/writing', 'still')).toBe(false);
		expect(shouldUseViewTransition('/writing#top', '/writing#archive', 'alive')).toBe(false);
		expect(shouldUseViewTransition('/', '/blog/games', 'alive')).toBe(false);
		expect(shouldUseViewTransition('/blog/visualizations', '/writing', 'alive')).toBe(false);
		expect(shouldUseViewTransition('/writing', '/resume', 'alive')).toBe(false);
		expect(
			shouldUseViewTransition('/writing', '/blog/personal-essay/an-ordinary-article', 'alive')
		).toBe(false);
	});
});
