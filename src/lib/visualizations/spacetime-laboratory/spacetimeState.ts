import {
	DEFAULT_PARAMETERS,
	DEFAULT_STATE,
	QUALITY_PRESETS,
	SPACETIME_MODELS,
	type SpacetimeModel,
	type SpacetimeParameters,
	type SpacetimePreset,
	type SpacetimeState
} from './spacetimeTypes';
import {
	EXTREMAL_SPIN,
	OBSERVER_MAX_RADIUS_M,
	OBSERVER_MIN_RADIUS_M,
	clamp
} from './spacetimeMath';
import { flrwCurvatureSign } from './spacetimeCosmology';

export const SPACETIME_PRESETS: readonly SpacetimePreset[] = [
	{
		id: 'einstein-ring',
		label: 'Einstein ring',
		description: 'A near-axis Schwarzschild view for exploring lensing of the seeded sky.',
		state: {
			model: 'schwarzschild',
			observer: { distance: 9, azimuthDeg: 90, elevationDeg: 4, fieldOfViewDeg: 42, properTime: 0 },
			overlays: { ...DEFAULT_STATE.overlays, photonSphere: true, labels: true }
		}
	},
	{
		id: 'shadow-closeup',
		label: 'Edge of the shadow',
		description: 'Close Schwarzschild orbit with photon sphere, ISCO, and redshift map visible.',
		state: {
			model: 'schwarzschild',
			observer: {
				distance: 3.1,
				azimuthDeg: 90,
				elevationDeg: 16,
				fieldOfViewDeg: 60,
				properTime: 0
			},
			overlays: {
				...DEFAULT_STATE.overlays,
				photonSphere: true,
				isco: true,
				redshiftMap: true
			}
		}
	},
	{
		id: 'kerr-ergosphere',
		label: 'Kerr ergosphere',
		description: 'Near-extremal spin with the ergosphere overlay and strong frame dragging.',
		state: {
			model: 'kerr',
			params: { ...DEFAULT_PARAMETERS, kerrSpin: 0.97 },
			overlays: { ...DEFAULT_STATE.overlays, ergosphere: true, photonSphere: true }
		}
	},
	{
		id: 'spin-comparison',
		label: 'Static versus rotating',
		description: 'Split-screen: Schwarzschild against near-extremal Kerr, same camera and sky.',
		state: {
			model: 'schwarzschild',
			compare: true,
			compareModel: 'kerr',
			params: { ...DEFAULT_PARAMETERS, kerrSpin: 0.95 }
		}
	},
	{
		id: 'newton-to-einstein',
		label: 'Weak to strong lensing',
		description: 'Split-screen comparing the Newtonian weak-field limit with full Schwarzschild.',
		state: {
			model: 'weak-field',
			compare: true,
			compareModel: 'schwarzschild',
			params: { ...DEFAULT_PARAMETERS, weakCompactness: 0.14, weakExaggeration: 2 }
		}
	},
	{
		id: 'expanding-cosmos',
		label: 'Expanding cosmos',
		description: 'Flat FLRW universe with matter and dark energy; watch the comoving grid grow.',
		state: {
			model: 'flrw',
			params: {
				...DEFAULT_PARAMETERS,
				flrwCurvature: 0,
				omegaMatter: 0.30991,
				omegaLambda: 0.69,
				flrwSpeed: 0.4
			},
			sky: { ...DEFAULT_STATE.sky, milkyWay: false, galaxies: true, starDensity: 0.7 }
		}
	},
	{
		id: 'de-sitter-horizon',
		label: 'de Sitter horizon',
		description: 'Positive cosmological constant with the cosmological event horizon marked.',
		state: { model: 'de-sitter', params: { ...DEFAULT_PARAMETERS, lambdaH0: 0.6 } }
	},
	{
		id: 'gw150914-style',
		label: 'Inspiral chirp',
		description: 'Chirp waveform with a test-particle ring and interferometer arms.',
		state: {
			model: 'gravitational-wave',
			params: {
				...DEFAULT_PARAMETERS,
				gwChirp: true,
				gwRing: true,
				gwArms: true,
				gwPolarization: 'plus'
			}
		}
	},
	{
		id: 'flat-control',
		label: 'The control universe',
		description: 'Everything off: Minkowski spacetime with a regular grid and honest clocks.',
		state: {
			model: 'minkowski',
			compare: false,
			overlays: { ...DEFAULT_STATE.overlays, grid: true, labels: true }
		}
	}
];

export function isSpacetimeModel(value: string): value is SpacetimeModel {
	return (SPACETIME_MODELS as readonly string[]).includes(value);
}

const NUMERIC_PARAM_LIMITS: Record<string, readonly [number, number]> = {
	massSolar: [1, 1e8],
	weakCompactness: [0, 0.35],
	weakExaggeration: [1, 20],
	kerrSpin: [0, EXTREMAL_SPIN],
	rnCharge: [0, 1.2],
	omegaMatter: [0, 1.2],
	omegaRadiation: [0, 0.01],
	omegaLambda: [0, 1.5],
	hubble: [20, 120],
	flrwTime: [0, 4],
	flrwSpeed: [0, 2],
	lambdaH0: [0, 1],
	adSLength: [0.2, 1],
	gwAmplitude: [0, 1],
	gwFrequency: [0.05, 2],
	gwPhase: [0, Math.PI * 2],
	gwExaggeration: [1, 1e24]
};

function clampParameters(params: SpacetimeParameters): SpacetimeParameters {
	const next = { ...params };
	for (const [key, [min, max]] of Object.entries(NUMERIC_PARAM_LIMITS)) {
		const record = next as unknown as Record<string, number>;
		const defaults = DEFAULT_PARAMETERS as unknown as Record<string, number>;
		record[key] = finiteClamp(record[key], min, max, defaults[key]);
	}
	next.flrwCurvature = flrwCurvatureSign(next);
	if (next.flrwView !== 'comoving' && next.flrwView !== 'proper') next.flrwView = 'comoving';
	if (next.gwPolarization !== 'plus' && next.gwPolarization !== 'cross')
		next.gwPolarization = 'plus';
	if (next.weakMode !== 'physical' && next.weakMode !== 'exaggerated')
		next.weakMode = 'exaggerated';
	if (next.gwScale !== 'physical' && next.gwScale !== 'exaggerated') next.gwScale = 'exaggerated';
	for (const key of ['gwChirp', 'gwRing', 'gwArms'] as const) {
		next[key] = booleanValue(next[key], DEFAULT_PARAMETERS[key]);
	}
	return next;
}

/** Keep curvature selection consistent with the Friedmann density closure. */
export function setFlrwCurvature(
	params: SpacetimeParameters,
	curvature: -1 | 0 | 1
): SpacetimeParameters {
	const targetTotal = curvature === -1 ? 0.75 : curvature === 1 ? 1.25 : 1;
	const total = params.omegaMatter + params.omegaRadiation + params.omegaLambda;
	const factor = total > 0 ? targetTotal / total : 0;
	const omegaRadiation = Math.min(0.01, params.omegaRadiation * factor);
	const nonRadiation = targetTotal - omegaRadiation;
	const matterAndLambda = params.omegaMatter + params.omegaLambda;
	const omegaMatter = Math.min(
		1.2,
		matterAndLambda > 0 ? (nonRadiation * params.omegaMatter) / matterAndLambda : nonRadiation
	);
	return {
		...params,
		omegaMatter,
		omegaRadiation,
		omegaLambda: nonRadiation - omegaMatter,
		flrwCurvature: curvature
	};
}

function finiteClamp(value: number, min: number, max: number, fallback: number): number {
	return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function booleanValue(value: boolean, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeState(state: SpacetimeState): SpacetimeState {
	const defaults = DEFAULT_STATE;
	const innerRadius = finiteClamp(state.disk.innerRadius, 1.6, 12, defaults.disk.innerRadius);
	const outerRadius = Math.max(
		innerRadius + 0.1,
		finiteClamp(state.disk.outerRadius, 4, 30, defaults.disk.outerRadius)
	);
	const azimuth = Number.isFinite(state.observer.azimuthDeg)
		? state.observer.azimuthDeg
		: defaults.observer.azimuthDeg;
	const overlays = { ...defaults.overlays };
	for (const key of Object.keys(overlays) as (keyof typeof overlays)[]) {
		overlays[key] = booleanValue(state.overlays[key], defaults.overlays[key]);
	}
	return {
		...state,
		model: isSpacetimeModel(state.model) ? state.model : 'minkowski',
		compareModel: isSpacetimeModel(state.compareModel) ? state.compareModel : 'schwarzschild',
		compare: booleanValue(state.compare, defaults.compare),
		compareSplit: finiteClamp(state.compareSplit, 0.15, 0.85, defaults.compareSplit),
		params: clampParameters(state.params),
		observer: {
			distance: finiteClamp(
				state.observer.distance,
				OBSERVER_MIN_RADIUS_M,
				OBSERVER_MAX_RADIUS_M,
				defaults.observer.distance
			),
			azimuthDeg: ((azimuth % 360) + 360) % 360,
			elevationDeg: finiteClamp(
				state.observer.elevationDeg,
				-85,
				85,
				defaults.observer.elevationDeg
			),
			fieldOfViewDeg: finiteClamp(
				state.observer.fieldOfViewDeg,
				20,
				110,
				defaults.observer.fieldOfViewDeg
			),
			properTime: finiteClamp(state.observer.properTime, 0, Number.MAX_VALUE, 0)
		},
		overlays,
		sky: {
			starDensity: finiteClamp(state.sky.starDensity, 0, 2, defaults.sky.starDensity),
			galaxies: booleanValue(state.sky.galaxies, defaults.sky.galaxies),
			milkyWay: booleanValue(state.sky.milkyWay, defaults.sky.milkyWay),
			cmb: booleanValue(state.sky.cmb, defaults.sky.cmb),
			seed: Math.floor(finiteClamp(state.sky.seed, 1, 999_999, defaults.sky.seed))
		},
		disk: {
			innerRadius,
			outerRadius,
			temperature: finiteClamp(state.disk.temperature, 0.4, 2, defaults.disk.temperature),
			beaming: booleanValue(state.disk.beaming, defaults.disk.beaming)
		},
		quality: Object.hasOwn(QUALITY_PRESETS, state.quality) ? state.quality : defaults.quality,
		playing: booleanValue(state.playing, defaults.playing),
		simulationSpeed: finiteClamp(state.simulationSpeed, 0.05, 4, defaults.simulationSpeed),
		showLabels: booleanValue(state.showLabels, defaults.showLabels)
	};
}

/**
 * Encode the interactive state into URL search params. The codec is deliberately
 * compact and forgiving: unknown values fall back to the defaults so a stale or
 * hand-edited link still opens a sane universe.
 */
export function encodeStateToQuery(state: SpacetimeState): string {
	state = sanitizeState(state);
	const params = new URLSearchParams();
	params.set('st', state.model);
	params.set('cmp', state.compareModel);
	params.set('compare', state.compare ? '1' : '0');
	params.set('q', state.quality);
	params.set('split', String(state.compareSplit));
	params.set('d', String(state.observer.distance));
	params.set('az', String(state.observer.azimuthDeg));
	params.set('el', String(state.observer.elevationDeg));
	params.set('fov', String(state.observer.fieldOfViewDeg));
	params.set('tau', String(state.observer.properTime));
	params.set('spd', String(state.simulationSpeed));
	params.set('play', state.playing ? '1' : '0');
	params.set('labels', state.showLabels ? '1' : '0');

	const p = state.params;
	params.set('m', String(p.massSolar));
	params.set('wk', String(p.weakCompactness));
	params.set('wx', String(p.weakExaggeration));
	params.set('wm', p.weakMode === 'physical' ? '1' : '0');
	params.set('spin', String(p.kerrSpin));
	params.set('chg', String(p.rnCharge));
	params.set('k', String(p.flrwCurvature));
	params.set('om', String(p.omegaMatter));
	params.set('orad', String(p.omegaRadiation));
	params.set('ol', String(p.omegaLambda));
	params.set('h0', String(p.hubble));
	params.set('ft', String(p.flrwTime));
	params.set('fs', String(p.flrwSpeed));
	params.set('fv', p.flrwView === 'proper' ? '1' : '0');
	params.set('lh', String(p.lambdaH0));
	params.set('al', String(p.adSLength));
	params.set('gwp', p.gwPolarization === 'cross' ? '1' : '0');
	params.set('gwa', String(p.gwAmplitude));
	params.set('gwf', String(p.gwFrequency));
	params.set('gwph', String(p.gwPhase));
	params.set('gwc', p.gwChirp ? '1' : '0');
	params.set('gwr', p.gwRing ? '1' : '0');
	params.set('gwar', p.gwArms ? '1' : '0');
	params.set('gws', p.gwScale === 'physical' ? '1' : '0');
	params.set('gwx', String(p.gwExaggeration));

	const overlayBits = [
		state.overlays.grid,
		state.overlays.photonPaths,
		state.overlays.horizon,
		state.overlays.photonSphere,
		state.overlays.isco,
		state.overlays.ergosphere,
		state.overlays.redshiftMap
	];
	params.set('ov', overlayBits.map((bit) => (bit ? '1' : '0')).join(''));
	params.set('ovl', state.overlays.labels ? '1' : '0');
	params.set('seed', String(state.sky.seed));
	params.set('stars', String(state.sky.starDensity));
	params.set('gal', state.sky.galaxies ? '1' : '0');
	params.set('mw', state.sky.milkyWay ? '1' : '0');
	params.set('cmb', state.sky.cmb ? '1' : '0');
	params.set('di', String(state.disk.innerRadius));
	params.set('do', String(state.disk.outerRadius));
	params.set('dt', String(state.disk.temperature));
	params.set('beam', state.disk.beaming ? '1' : '0');
	return params.toString();
}

export function decodeStateFromQuery(search: string): SpacetimeState {
	const params = new URLSearchParams(search);
	const state: SpacetimeState = structuredClone(DEFAULT_STATE);

	const model = params.get('st');
	if (model && isSpacetimeModel(model)) state.model = model;
	const compareModel = params.get('cmp');
	if (compareModel && isSpacetimeModel(compareModel)) {
		state.compare = true;
		state.compareModel = compareModel;
	}
	if (params.get('compare') === '0') state.compare = false;
	const quality = params.get('q');
	if (quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'research') {
		state.quality = quality;
	}

	const numeric = (key: string, fallback: number) => {
		const raw = params.get(key);
		if (raw === null || raw.trim() === '') return fallback;
		const value = Number(raw);
		return Number.isFinite(value) ? value : fallback;
	};
	const boolean = (key: string, fallback: boolean) => {
		const raw = params.get(key);
		return raw === '1' ? true : raw === '0' ? false : fallback;
	};

	state.compareSplit = numeric('split', state.compareSplit);
	state.observer.distance = numeric('d', state.observer.distance);
	state.observer.azimuthDeg = numeric('az', state.observer.azimuthDeg);
	state.observer.elevationDeg = numeric('el', state.observer.elevationDeg);
	state.observer.fieldOfViewDeg = numeric('fov', state.observer.fieldOfViewDeg);
	state.observer.properTime = numeric('tau', state.observer.properTime);
	state.simulationSpeed = numeric('spd', state.simulationSpeed);
	state.playing = boolean('play', state.playing);
	state.showLabels = boolean('labels', state.showLabels);

	state.params.massSolar = numeric('m', state.params.massSolar);
	state.params.weakCompactness = numeric('wk', state.params.weakCompactness);
	state.params.weakExaggeration = numeric('wx', state.params.weakExaggeration);
	state.params.weakMode = boolean('wm', false) ? 'physical' : 'exaggerated';
	state.params.kerrSpin = numeric('spin', state.params.kerrSpin);
	state.params.rnCharge = numeric('chg', state.params.rnCharge);
	state.params.flrwCurvature = Math.round(numeric('k', 0)) as -1 | 0 | 1;
	state.params.omegaMatter = numeric('om', state.params.omegaMatter);
	state.params.omegaRadiation = numeric('orad', state.params.omegaRadiation);
	state.params.omegaLambda = numeric('ol', state.params.omegaLambda);
	if (params.has('k') && !['om', 'orad', 'ol'].some((key) => params.has(key))) {
		state.params = setFlrwCurvature(state.params, state.params.flrwCurvature);
	}
	state.params.hubble = numeric('h0', state.params.hubble);
	state.params.flrwTime = numeric('ft', state.params.flrwTime);
	state.params.flrwSpeed = numeric('fs', state.params.flrwSpeed);
	state.params.flrwView = params.get('fv') === '1' ? 'proper' : 'comoving';
	state.params.lambdaH0 = numeric('lh', state.params.lambdaH0);
	state.params.adSLength = numeric('al', state.params.adSLength);
	state.params.gwPolarization = params.get('gwp') === '1' ? 'cross' : 'plus';
	state.params.gwAmplitude = numeric('gwa', state.params.gwAmplitude);
	state.params.gwFrequency = numeric('gwf', state.params.gwFrequency);
	state.params.gwPhase = numeric('gwph', state.params.gwPhase);
	state.params.gwChirp = boolean('gwc', state.params.gwChirp);
	state.params.gwRing = boolean('gwr', state.params.gwRing);
	state.params.gwArms = boolean('gwar', state.params.gwArms);
	state.params.gwScale = boolean('gws', false) ? 'physical' : 'exaggerated';
	state.params.gwExaggeration = numeric('gwx', state.params.gwExaggeration);

	const overlayBits = params.get('ov');
	if (overlayBits && /^[01]{7}$/.test(overlayBits)) {
		state.overlays.grid = overlayBits[0] === '1';
		state.overlays.photonPaths = overlayBits[1] === '1';
		state.overlays.horizon = overlayBits[2] === '1';
		state.overlays.photonSphere = overlayBits[3] === '1';
		state.overlays.isco = overlayBits[4] === '1';
		state.overlays.ergosphere = overlayBits[5] === '1';
		state.overlays.redshiftMap = overlayBits[6] === '1';
	}
	state.overlays.labels = boolean('ovl', state.overlays.labels);

	state.sky.seed = numeric('seed', state.sky.seed);
	state.sky.starDensity = numeric('stars', state.sky.starDensity);
	state.sky.galaxies = boolean('gal', state.sky.galaxies);
	state.sky.milkyWay = boolean('mw', state.sky.milkyWay);
	state.sky.cmb = boolean('cmb', state.sky.cmb);
	state.disk.innerRadius = numeric('di', state.disk.innerRadius);
	state.disk.outerRadius = numeric('do', state.disk.outerRadius);
	state.disk.temperature = numeric('dt', state.disk.temperature);
	state.disk.beaming = boolean('beam', state.disk.beaming);

	return sanitizeState(state);
}

export function applyPreset(current: SpacetimeState, presetId: string): SpacetimeState {
	const preset = SPACETIME_PRESETS.find((candidate) => candidate.id === presetId);
	if (!preset) return current;
	const patch = preset.state;
	return sanitizeState({
		...current,
		...patch,
		model: patch.model ?? current.model,
		params: { ...current.params, ...(patch.params ?? {}) },
		observer: { ...current.observer, ...(patch.observer ?? {}) },
		overlays: { ...current.overlays, ...(patch.overlays ?? {}) },
		sky: { ...current.sky, ...(patch.sky ?? {}) },
		disk: { ...current.disk, ...(patch.disk ?? {}) }
	});
}
