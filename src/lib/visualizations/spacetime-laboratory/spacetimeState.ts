import {
	DEFAULT_PARAMETERS,
	DEFAULT_STATE,
	SPACETIME_MODELS,
	type SpacetimeModel,
	type SpacetimeParameters,
	type SpacetimePreset,
	type SpacetimeState
} from './spacetimeTypes';
import {
	EXTREMAL_SPIN,
	OBSERVER_MAX_RADIUS_RS,
	OBSERVER_MIN_RADIUS_RS,
	clamp
} from './spacetimeMath';

export const SPACETIME_PRESETS: readonly SpacetimePreset[] = [
	{
		id: 'einstein-ring',
		label: 'Einstein ring',
		description: 'Observer, black hole, and a bright galaxy aligned to form a full ring.',
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
				omegaMatter: 0.31,
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
		if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
			record[key] = clamp(record[key], min, max);
		}
	}
	if (![-1, 0, 1].includes(next.flrwCurvature)) next.flrwCurvature = 0;
	if (next.flrwView !== 'comoving' && next.flrwView !== 'proper') next.flrwView = 'comoving';
	if (next.gwPolarization !== 'plus' && next.gwPolarization !== 'cross')
		next.gwPolarization = 'plus';
	if (next.weakMode !== 'physical' && next.weakMode !== 'exaggerated')
		next.weakMode = 'exaggerated';
	if (next.gwScale !== 'physical' && next.gwScale !== 'exaggerated') next.gwScale = 'exaggerated';
	return next;
}

export function sanitizeState(state: SpacetimeState): SpacetimeState {
	return {
		...state,
		model: isSpacetimeModel(state.model) ? state.model : 'minkowski',
		compareModel: isSpacetimeModel(state.compareModel) ? state.compareModel : 'schwarzschild',
		compareSplit: clamp(state.compareSplit, 0.15, 0.85),
		params: clampParameters(state.params),
		observer: {
			distance: clamp(state.observer.distance, OBSERVER_MIN_RADIUS_RS, OBSERVER_MAX_RADIUS_RS),
			azimuthDeg: ((state.observer.azimuthDeg % 360) + 360) % 360,
			elevationDeg: clamp(state.observer.elevationDeg, -85, 85),
			fieldOfViewDeg: clamp(state.observer.fieldOfViewDeg, 20, 110),
			properTime: Math.max(0, state.observer.properTime)
		},
		sky: {
			starDensity: clamp(state.sky.starDensity, 0, 2),
			galaxies: Boolean(state.sky.galaxies),
			milkyWay: Boolean(state.sky.milkyWay),
			cmb: Boolean(state.sky.cmb),
			seed: Math.floor(clamp(state.sky.seed, 1, 999_999))
		},
		disk: {
			innerRadius: clamp(state.disk.innerRadius, 1.6, 12),
			outerRadius: clamp(state.disk.outerRadius, 4, 30),
			temperature: clamp(state.disk.temperature, 0.4, 2),
			beaming: Boolean(state.disk.beaming)
		},
		simulationSpeed: clamp(state.simulationSpeed, 0.05, 4)
	};
}

/**
 * Encode the interactive state into URL search params. The codec is deliberately
 * compact and forgiving: unknown values fall back to the defaults so a stale or
 * hand-edited link still opens a sane universe.
 */
export function encodeStateToQuery(state: SpacetimeState): string {
	const params = new URLSearchParams();
	params.set('st', state.model);
	if (state.compare) {
		params.set('cmp', state.compareModel);
		params.set('split', state.compareSplit.toFixed(2));
	}
	params.set('q', state.quality);
	params.set('d', state.observer.distance.toFixed(2));
	params.set('az', String(Math.round(state.observer.azimuthDeg)));
	params.set('el', String(Math.round(state.observer.elevationDeg)));
	params.set('fov', String(Math.round(state.observer.fieldOfViewDeg)));
	params.set('spd', state.simulationSpeed.toFixed(2));

	const p = state.params;
	params.set('m', String(p.massSolar));
	params.set('wk', p.weakCompactness.toFixed(3));
	params.set('wx', String(p.weakExaggeration));
	params.set('spin', p.kerrSpin.toFixed(3));
	params.set('chg', p.rnCharge.toFixed(3));
	params.set('k', String(p.flrwCurvature));
	params.set('om', p.omegaMatter.toFixed(3));
	params.set('orad', p.omegaRadiation.toExponential(1));
	params.set('ol', p.omegaLambda.toFixed(3));
	params.set('h0', String(p.hubble));
	params.set('ft', p.flrwTime.toFixed(2));
	params.set('fv', p.flrwView === 'proper' ? '1' : '0');
	params.set('lh', p.lambdaH0.toFixed(2));
	params.set('al', p.adSLength.toFixed(2));
	params.set('gwp', p.gwPolarization === 'cross' ? '1' : '0');
	params.set('gwa', p.gwAmplitude.toFixed(2));
	params.set('gwf', p.gwFrequency.toFixed(2));
	params.set('gwc', p.gwChirp ? '1' : '0');
	params.set('gwr', p.gwRing ? '1' : '0');

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
	params.set('seed', String(state.sky.seed));
	params.set('di', state.disk.innerRadius.toFixed(1));
	params.set('do', state.disk.outerRadius.toFixed(1));
	params.set('dt', state.disk.temperature.toFixed(2));
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
	const quality = params.get('q');
	if (quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'research') {
		state.quality = quality;
	}

	const numeric = (key: string, fallback: number) => {
		const raw = params.get(key);
		if (raw === null) return fallback;
		const value = Number(raw);
		return Number.isFinite(value) ? value : fallback;
	};

	state.compareSplit = numeric('split', state.compareSplit);
	state.observer.distance = numeric('d', state.observer.distance);
	state.observer.azimuthDeg = numeric('az', state.observer.azimuthDeg);
	state.observer.elevationDeg = numeric('el', state.observer.elevationDeg);
	state.observer.fieldOfViewDeg = numeric('fov', state.observer.fieldOfViewDeg);
	state.simulationSpeed = numeric('spd', state.simulationSpeed);

	state.params.massSolar = numeric('m', state.params.massSolar);
	state.params.weakCompactness = numeric('wk', state.params.weakCompactness);
	state.params.weakExaggeration = numeric('wx', state.params.weakExaggeration);
	state.params.kerrSpin = numeric('spin', state.params.kerrSpin);
	state.params.rnCharge = numeric('chg', state.params.rnCharge);
	state.params.flrwCurvature = Math.round(numeric('k', 0)) as -1 | 0 | 1;
	state.params.omegaMatter = numeric('om', state.params.omegaMatter);
	state.params.omegaRadiation = numeric('orad', state.params.omegaRadiation);
	state.params.omegaLambda = numeric('ol', state.params.omegaLambda);
	state.params.hubble = numeric('h0', state.params.hubble);
	state.params.flrwTime = numeric('ft', state.params.flrwTime);
	state.params.flrwView = params.get('fv') === '1' ? 'proper' : 'comoving';
	state.params.lambdaH0 = numeric('lh', state.params.lambdaH0);
	state.params.adSLength = numeric('al', state.params.adSLength);
	state.params.gwPolarization = params.get('gwp') === '1' ? 'cross' : 'plus';
	state.params.gwAmplitude = numeric('gwa', state.params.gwAmplitude);
	state.params.gwFrequency = numeric('gwf', state.params.gwFrequency);
	state.params.gwChirp = params.get('gwc') === '1';
	state.params.gwRing = params.get('gwr') !== '0';

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

	state.sky.seed = numeric('seed', state.sky.seed);
	state.disk.innerRadius = numeric('di', state.disk.innerRadius);
	state.disk.outerRadius = numeric('do', state.disk.outerRadius);
	state.disk.temperature = numeric('dt', state.disk.temperature);

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
