import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, type SpacetimeState } from './spacetimeTypes';
import {
	applyPreset,
	decodeStateFromQuery,
	encodeStateToQuery,
	sanitizeState,
	setFlrwCurvature,
	SPACETIME_PRESETS
} from './spacetimeState';
import { SpacetimeStore } from './spacetimeStore.svelte';

afterEach(() => vi.unstubAllGlobals());

function customState(): SpacetimeState {
	const state = structuredClone(DEFAULT_STATE);
	Object.assign(state, {
		model: 'gravitational-wave',
		compare: true,
		compareModel: 'kerr',
		compareSplit: 0.377,
		quality: 'high',
		playing: false,
		simulationSpeed: 1.125,
		showLabels: false
	});
	Object.assign(state.params, {
		massSolar: 1234567,
		weakCompactness: 0.123456,
		weakExaggeration: 12.5,
		weakMode: 'physical',
		kerrSpin: 0.957,
		rnCharge: 1.12,
		omegaMatter: 0.23,
		omegaRadiation: 0.00123,
		omegaLambda: 0.56,
		hubble: 72.5,
		flrwTime: 1.234,
		flrwSpeed: 1.25,
		flrwView: 'proper',
		lambdaH0: 0.789,
		adSLength: 0.456,
		gwPolarization: 'cross',
		gwAmplitude: 0.734,
		gwFrequency: 1.234,
		gwPhase: 2.345,
		gwChirp: true,
		gwScale: 'physical',
		gwRing: false,
		gwArms: false,
		gwExaggeration: 3e22
	});
	Object.assign(state.observer, {
		distance: 6.125,
		azimuthDeg: 153.25,
		elevationDeg: -31.25,
		fieldOfViewDeg: 63.25,
		properTime: 12.345
	});
	for (const key of Object.keys(state.overlays) as (keyof typeof state.overlays)[]) {
		state.overlays[key] = !state.overlays[key];
	}
	Object.assign(state.sky, {
		starDensity: 0.275,
		galaxies: false,
		milkyWay: false,
		cmb: true,
		seed: 987654
	});
	Object.assign(state.disk, {
		innerRadius: 7.125,
		outerRadius: 22.5,
		temperature: 1.234,
		beaming: false
	});
	return sanitizeState(state);
}

describe('spacetime share state', () => {
	it('roundtrips every state field without silently changing physical modes or display settings', () => {
		const state = customState();
		expect(decodeStateFromQuery(encodeStateToQuery(state))).toEqual(state);
	});

	it('preserves the inactive comparison selection and divider', () => {
		const state = customState();
		state.compare = false;
		expect(decodeStateFromQuery(encodeStateToQuery(state))).toEqual(state);
	});

	it('continues to open older links where cmp alone enabled comparison', () => {
		const state = decodeStateFromQuery('?st=schwarzschild&cmp=kerr&spin=0.95&ov=1011000');
		expect(state.model).toBe('schwarzschild');
		expect(state.compare).toBe(true);
		expect(state.compareModel).toBe('kerr');
		expect(state.params.kerrSpin).toBe(0.95);
		expect(state.params.gwScale).toBe(DEFAULT_STATE.params.gwScale);
	});

	it('restores the animation clock alongside scene parameters in a copied link', () => {
		const store = new SpacetimeStore();
		store.update(customState());
		store.time = 123.456;
		vi.stubGlobal('window', { location: { search: `?${store.queryString()}` } });
		const restored = new SpacetimeStore();
		expect(restored.state).toEqual(store.state);
		expect(restored.time).toBe(123.456);
	});

	it.each([
		['NaN', 0],
		['Infinity', 0],
		['-3', 0],
		['1e99', 86400]
	])('bounds hand-edited animation time %s', (raw, expected) => {
		vi.stubGlobal('window', { location: { search: `?t=${raw}` } });
		expect(new SpacetimeStore().time).toBe(expected);
	});

	it('rejects malformed URL numbers and unknown modes without poisoning GPU uniforms', () => {
		const state = decodeStateFromQuery(
			'?st=unknown&q=unknown&d=&spin=NaN&gwa=Infinity&seed=-99&spd=1e99&gwr=invalid'
		);
		expect(state.observer.distance).toBe(DEFAULT_STATE.observer.distance);
		expect(state.params.kerrSpin).toBe(DEFAULT_STATE.params.kerrSpin);
		expect(state.params.gwAmplitude).toBe(DEFAULT_STATE.params.gwAmplitude);
		expect(state.sky.seed).toBe(1);
		expect(state.simulationSpeed).toBe(4);
		expect(state.model).toBe('minkowski');
		expect(state.quality).toBe('medium');
		expect(state.params.gwRing).toBe(DEFAULT_STATE.params.gwRing);
	});
});

describe('spacetime state invariants', () => {
	it('replaces nonfinite numbers throughout the state with bounded defaults', () => {
		const state = customState();
		state.params.gwAmplitude = Number.NaN;
		state.params.flrwSpeed = Number.POSITIVE_INFINITY;
		state.observer.distance = Number.NaN;
		state.observer.azimuthDeg = Number.POSITIVE_INFINITY;
		state.observer.properTime = Number.NaN;
		state.sky.starDensity = Number.NaN;
		state.disk.temperature = Number.NaN;
		state.compareSplit = Number.NaN;
		state.simulationSpeed = Number.NEGATIVE_INFINITY;
		const next = sanitizeState(state);
		const numbers = (value: unknown): number[] =>
			typeof value === 'number'
				? [value]
				: value && typeof value === 'object'
					? Object.values(value).flatMap(numbers)
					: [];
		expect(numbers(next).every(Number.isFinite)).toBe(true);
		expect(next.observer.distance).toBeGreaterThanOrEqual(2.1);
		expect(next.params.gwAmplitude).toBe(DEFAULT_STATE.params.gwAmplitude);
	});

	it('keeps the outer disk beyond its inner edge for slider and URL inputs', () => {
		const state = structuredClone(DEFAULT_STATE);
		state.disk.innerRadius = 12;
		state.disk.outerRadius = 4;
		const next = sanitizeState(state);
		expect(next.disk.outerRadius).toBeGreaterThan(next.disk.innerRadius);
		expect(decodeStateFromQuery('?di=12&do=4').disk).toEqual(next.disk);
	});

	it.each([-1, 0, 1] as const)(
		'normalizes a selected curvature k=%s and derives the same sign',
		(curvature) => {
			const state = structuredClone(DEFAULT_STATE);
			state.params = setFlrwCurvature(state.params, curvature);
			const next = sanitizeState(state);
			const total = next.params.omegaMatter + next.params.omegaRadiation + next.params.omegaLambda;
			expect(total).toBeCloseTo(curvature === -1 ? 0.75 : curvature === 1 ? 1.25 : 1, 12);
			expect(next.params.flrwCurvature).toBe(curvature);
		}
	);

	it('normalizes an empty or radiation-only density mix within the controls bounds', () => {
		for (const radiation of [0, 0.01]) {
			const state = structuredClone(DEFAULT_STATE);
			Object.assign(state.params, { omegaMatter: 0, omegaRadiation: radiation, omegaLambda: 0 });
			state.params = setFlrwCurvature(state.params, 1);
			const next = sanitizeState(state);
			expect(
				next.params.omegaMatter + next.params.omegaRadiation + next.params.omegaLambda
			).toBeCloseTo(1.25, 12);
			expect(next.params.omegaMatter).toBeLessThanOrEqual(1.2);
			expect(next.params.omegaRadiation).toBeLessThanOrEqual(0.01);
			expect(next.params.flrwCurvature).toBe(1);
		}
	});

	it('derives curvature from edited densities rather than retaining an inconsistent selector', () => {
		const state = structuredClone(DEFAULT_STATE);
		state.params.omegaMatter = 0.01;
		expect(sanitizeState(state).params.flrwCurvature).toBe(-1);
		state.params.omegaMatter = 1.1;
		expect(sanitizeState(state).params.flrwCurvature).toBe(1);
	});

	it('keeps all presets valid and outside the static Schwarzschild horizon', () => {
		for (const preset of SPACETIME_PRESETS) {
			const state = applyPreset(structuredClone(DEFAULT_STATE), preset.id);
			expect(state.observer.distance).toBeGreaterThanOrEqual(2.1);
			expect(state.disk.outerRadius).toBeGreaterThan(state.disk.innerRadius);
			expect(decodeStateFromQuery(encodeStateToQuery(state))).toEqual(state);
		}
	});

	it('resets simulation time, observer time, frame statistics and state together', () => {
		const store = new SpacetimeStore();
		store.update(customState());
		store.time = 123;
		store.fps = 17;
		store.reset();
		expect(store.state).toEqual(DEFAULT_STATE);
		expect(store.time).toBe(0);
		expect(store.state.observer.properTime).toBe(0);
		expect(store.fps).toBe(0);
	});

	it('starts a loaded preset at its initial epoch and preserves time for unknown presets', () => {
		const store = new SpacetimeStore();
		store.time = 123;
		store.fps = 17;
		store.setObserver('properTime', 12);
		store.loadPreset('unknown-preset');
		expect(store.time).toBe(123);
		store.loadPreset('expanding-cosmos');
		expect(store.state.model).toBe('flrw');
		expect(store.time).toBe(0);
		expect(store.state.observer.properTime).toBe(0);
		expect(store.fps).toBe(0);
	});
});
