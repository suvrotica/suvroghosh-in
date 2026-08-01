import { createFamilyDefaultState, getFamilyDefinition, isFractalFamily } from './families';
import {
	cloneCustomMapRecipe,
	customMapSupportsDistanceEstimate,
	normalizeCustomMapRecipe
} from './custom-map';
import {
	LSYSTEM_MAX_GENERATIONS,
	LSYSTEM_MAX_SEGMENTS,
	LSYSTEM_MAX_SYMBOLS,
	estimateLSystem,
	validateLSystemDefinition
} from './lsystem';
import {
	getPalette,
	isHexColor,
	isPaletteId,
	normalizeHexColor,
	validatePaletteStops
} from './palettes';
import { validateIFSTransforms } from './recursive';
import {
	FRACTAL_STATE_VERSION,
	type ColoringMode,
	type ComplexValue,
	type DensityState,
	type FractalFamily,
	type FractalPlane,
	type FractalViewState,
	type LSystemState,
	type OrbitTrapKind,
	type OrbitTrapState,
	type PolynomialState,
	type PrecisionMode,
	type RenderQuality,
	type StateIssue,
	type StateValidationResult
} from './types';
import { MAX_VIEW_SPAN_Y, MIN_VIEW_SPAN_Y } from './viewport';

export const MAX_STATE_QUERY_LENGTH = 30_000;
export const MAX_LOCAL_STATE_LENGTH = 100_000;
export const MAX_STATE_ITERATIONS = 20_000;
export const MAX_POLYNOMIAL_DEGREE = 8;
export const MAX_DENSITY_SAMPLES = 10_000_000;

const COLORING_MODES = new Set<ColoringMode>([
	'binary',
	'bands',
	'smooth',
	'histogram',
	'distance',
	'orbit-trap',
	'root-basin',
	'density'
]);
const PLANES = new Set<FractalPlane>([
	'parameter',
	'dynamical',
	'basin',
	'density',
	'construction'
]);
const RENDER_QUALITIES = new Set<RenderQuality>(['battery', 'draft', 'balanced', 'high']);
const PRECISION_MODES = new Set<PrecisionMode>(['auto', 'float', 'double-single']);
const TRAP_KINDS = new Set<OrbitTrapKind>(['point', 'line', 'circle', 'cross', 'grid']);

export function cloneFractalState(state: FractalViewState): FractalViewState {
	return {
		...state,
		center: { ...state.center },
		centerDecimal: state.centerDecimal ? { ...state.centerDecimal } : undefined,
		juliaC: { ...state.juliaC },
		juliaCDecimal: state.juliaCDecimal ? { ...state.juliaCDecimal } : undefined,
		phoenixP: { ...state.phoenixP },
		phoenixPrevious: { ...state.phoenixPrevious },
		customPalette: state.customPalette?.map((stop) => ({ ...stop })),
		orbitTrap: state.orbitTrap
			? { ...state.orbitTrap, position: { ...state.orbitTrap.position } }
			: undefined,
		polynomial: state.polynomial
			? {
					coefficients: state.polynomial.coefficients.map((coefficient) => ({
						...coefficient
					}))
				}
			: undefined,
		customMap: state.customMap ? cloneCustomMapRecipe(state.customMap) : undefined,
		ifs: state.ifs
			? {
					colorBy: state.ifs.colorBy,
					transforms: state.ifs.transforms.map((transform) => ({ ...transform }))
				}
			: undefined,
		lSystem: state.lSystem ? { ...state.lSystem, rules: { ...state.lSystem.rules } } : undefined,
		density: state.density
			? {
					...state.density,
					iterationBands: state.density.iterationBands.map((band) => [...band] as [number, number])
				}
			: undefined
	};
}

export function normalizeFractalState(
	input: unknown,
	fallbackFamily: FractalFamily = 'mandelbrot'
): StateValidationResult {
	const issues: StateIssue[] = [];
	let migrated = false;
	let candidate = input;

	if (isLegacyState(candidate)) {
		candidate = migrateLegacyState(candidate);
		migrated = true;
		issues.push({
			path: 'version',
			value: 0,
			message: 'Legacy Fractal Atlas state was migrated to schema version 1.',
			severity: 'warning'
		});
	}

	if (!isRecord(candidate)) {
		return {
			state: createFamilyDefaultState(fallbackFamily),
			issues: [
				...issues,
				{
					path: '',
					value: candidate,
					message: 'Fractal state must be an object; safe defaults were restored.',
					severity: 'error'
				}
			],
			unsupportedVersion: false,
			migrated
		};
	}

	const version = candidate.version;
	if (
		version !== undefined &&
		(typeof version !== 'number' || !Number.isInteger(version) || version !== FRACTAL_STATE_VERSION)
	) {
		return {
			state: createFamilyDefaultState(fallbackFamily),
			issues: [
				...issues,
				{
					path: 'version',
					value: version,
					message: `State schema version ${String(version)} is unsupported; version ${FRACTAL_STATE_VERSION} defaults were restored.`,
					severity: 'error'
				}
			],
			unsupportedVersion: true,
			migrated
		};
	}

	const family = isFractalFamily(candidate.family) ? candidate.family : fallbackFamily;
	if (candidate.family !== undefined && !isFractalFamily(candidate.family)) {
		issues.push(
			issue('family', candidate.family, 'Unknown family; Mandelbrot defaults were used.')
		);
	}
	const state = createFamilyDefaultState(family);
	const supportedPlanes = getFamilyDefinition(family).supportedPlanes;

	if (candidate.plane !== undefined) {
		if (
			typeof candidate.plane === 'string' &&
			PLANES.has(candidate.plane as FractalPlane) &&
			supportedPlanes.includes(candidate.plane as FractalPlane)
		) {
			state.plane = candidate.plane as FractalPlane;
		} else {
			issues.push(
				issue('plane', candidate.plane, `Unsupported plane for ${family}; its default was used.`)
			);
		}
	}

	state.center = readComplex(candidate.center, state.center, 'center', issues);
	state.centerDecimal = readDecimalComplex(
		candidate.centerDecimal,
		{
			re: preciseNumber(state.center.re),
			im: preciseNumber(state.center.im)
		},
		'centerDecimal',
		issues
	);
	state.center = {
		re: Number(state.centerDecimal.re),
		im: Number(state.centerDecimal.im)
	};
	state.juliaC = readComplex(candidate.juliaC, state.juliaC, 'juliaC', issues);
	state.juliaCDecimal = readDecimalComplex(
		candidate.juliaCDecimal,
		{
			re: preciseNumber(state.juliaC.re),
			im: preciseNumber(state.juliaC.im)
		},
		'juliaCDecimal',
		issues
	);
	state.juliaC = {
		re: Number(state.juliaCDecimal.re),
		im: Number(state.juliaCDecimal.im)
	};
	state.phoenixP = readComplex(candidate.phoenixP, state.phoenixP, 'phoenixP', issues);
	state.phoenixPrevious = readComplex(
		candidate.phoenixPrevious,
		state.phoenixPrevious,
		'phoenixPrevious',
		issues
	);
	state.newtonRelaxation = readNumber(
		candidate.newtonRelaxation,
		state.newtonRelaxation,
		0.05,
		2,
		'newtonRelaxation',
		issues
	);
	state.spanY = readPositiveSpan(
		candidate.spanY,
		state.spanY,
		MIN_VIEW_SPAN_Y,
		MAX_VIEW_SPAN_Y,
		'spanY',
		issues
	);
	state.rotation = normalizeAngle(
		readNumber(candidate.rotation, state.rotation, -1e9, 1e9, 'rotation', issues)
	);
	state.maxIterations = readInteger(
		candidate.maxIterations,
		state.maxIterations,
		1,
		MAX_STATE_ITERATIONS,
		'maxIterations',
		issues
	);
	state.bailout = readNumber(
		candidate.bailout,
		state.bailout,
		1 + Number.EPSILON,
		1e12,
		'bailout',
		issues
	);
	state.exponent = readInteger(candidate.exponent, state.exponent, 2, 12, 'exponent', issues);
	state.paletteOffset = readNumber(
		candidate.paletteOffset,
		state.paletteOffset,
		-128,
		128,
		'paletteOffset',
		issues
	);
	state.paletteCycles = readNumber(
		candidate.paletteCycles,
		state.paletteCycles,
		0.05,
		128,
		'paletteCycles',
		issues
	);
	state.distanceLightAngle = normalizeAngle(
		readNumber(
			candidate.distanceLightAngle,
			state.distanceLightAngle ?? -Math.PI / 4,
			-1e9,
			1e9,
			'distanceLightAngle',
			issues
		)
	);
	state.distanceLightStrength = readNumber(
		candidate.distanceLightStrength,
		state.distanceLightStrength ?? 0.72,
		0,
		1,
		'distanceLightStrength',
		issues
	);
	state.convergenceTolerance = readNumber(
		candidate.convergenceTolerance,
		state.convergenceTolerance,
		1e-15,
		1,
		'convergenceTolerance',
		issues
	);

	if (candidate.coloring !== undefined) {
		if (
			typeof candidate.coloring === 'string' &&
			COLORING_MODES.has(candidate.coloring as ColoringMode)
		) {
			state.coloring = candidate.coloring as ColoringMode;
		} else
			issues.push(
				issue('coloring', candidate.coloring, 'Unknown colouring mode; the default was used.')
			);
	}
	if (candidate.paletteId !== undefined) {
		if (isPaletteId(candidate.paletteId)) state.paletteId = candidate.paletteId;
		else
			issues.push(
				issue('paletteId', candidate.paletteId, 'Unknown palette; Observatory was used.')
			);
	}
	if (candidate.interiorColor !== undefined) {
		if (isHexColor(candidate.interiorColor)) {
			state.interiorColor = normalizeHexColor(candidate.interiorColor);
		} else {
			issues.push(
				issue(
					'interiorColor',
					candidate.interiorColor,
					'Interior colour must be a six-digit hex colour.'
				)
			);
		}
	}

	if (candidate.customPalette !== undefined) {
		const validated = validatePaletteStops(
			candidate.customPalette,
			getPalette(state.paletteId).stops
		);
		state.customPalette = validated.stops;
		for (const message of validated.issues) {
			issues.push(issue('customPalette', candidate.customPalette, message));
		}
	}

	if (candidate.orbitTrap !== undefined) {
		state.orbitTrap = normalizeOrbitTrap(candidate.orbitTrap, state.orbitTrap!, issues);
	}
	if (candidate.polynomial !== undefined) {
		state.polynomial = normalizePolynomial(
			candidate.polynomial,
			state.polynomial ?? createFamilyDefaultState('newton').polynomial!,
			issues
		);
	}
	if (candidate.customMap !== undefined) {
		const normalized = normalizeCustomMapRecipe(
			candidate.customMap,
			state.customMap ?? cloneCustomMapRecipe()
		);
		state.customMap = normalized.recipe;
		for (const customIssue of normalized.issues) {
			issues.push(issue(customIssue.path, customIssue.value, customIssue.message));
		}
	}
	if (candidate.ifs !== undefined) {
		state.ifs = normalizeIFS(
			candidate.ifs,
			state.ifs ?? createFamilyDefaultState('barnsley-fern').ifs!,
			issues
		);
	}
	if (candidate.lSystem !== undefined) {
		state.lSystem = normalizeLSystem(
			candidate.lSystem,
			state.lSystem ?? createFamilyDefaultState('l-system').lSystem!,
			issues
		);
	}
	if (candidate.density !== undefined) {
		state.density = normalizeDensity(
			candidate.density,
			state.density ?? createFamilyDefaultState('buddhabrot').density!,
			issues
		);
	}

	state.seed = readInteger(candidate.seed, state.seed, 0, 0xffffffff, 'seed', issues) >>> 0;
	state.flipY = readBoolean(candidate.flipY, state.flipY, 'flipY', issues);
	state.analyticInteriorTests = readBoolean(
		candidate.analyticInteriorTests,
		state.analyticInteriorTests,
		'analyticInteriorTests',
		issues
	);

	if (candidate.renderQuality !== undefined) {
		if (
			typeof candidate.renderQuality === 'string' &&
			RENDER_QUALITIES.has(candidate.renderQuality as RenderQuality)
		) {
			state.renderQuality = candidate.renderQuality as RenderQuality;
		} else {
			issues.push(
				issue(
					'renderQuality',
					candidate.renderQuality,
					'Unknown render quality; Balanced was used.'
				)
			);
		}
	}
	if (candidate.precisionMode !== undefined) {
		if (
			typeof candidate.precisionMode === 'string' &&
			PRECISION_MODES.has(candidate.precisionMode as PrecisionMode)
		) {
			state.precisionMode = candidate.precisionMode as PrecisionMode;
		} else {
			issues.push(
				issue('precisionMode', candidate.precisionMode, 'Unknown precision mode; Auto was used.')
			);
		}
	}
	if (
		state.family === 'custom-map' &&
		state.coloring === 'distance' &&
		!customMapSupportsDistanceEstimate(
			state.customMap ?? cloneCustomMapRecipe(),
			state.plane === 'parameter' ? 'parameter' : 'dynamical'
		)
	) {
		state.coloring = 'smooth';
		issues.push(
			issue(
				'coloring',
				candidate.coloring,
				'Distance colouring requires a holomorphic custom recipe with a pixel-varying orbit; Smooth escape was used.'
			)
		);
	}

	return {
		state,
		issues,
		unsupportedVersion: false,
		migrated
	};
}

export function serializeFractalState(input: FractalViewState): URLSearchParams {
	const state = normalizeFractalState(input).state;
	const params = new URLSearchParams();
	params.set('v', String(FRACTAL_STATE_VERSION));
	params.set('f', state.family);
	params.set('p', state.plane);
	params.set('x', preciseNumber(state.center.re));
	params.set('y', preciseNumber(state.center.im));
	params.set('xd', state.centerDecimal?.re ?? preciseNumber(state.center.re));
	params.set('yd', state.centerDecimal?.im ?? preciseNumber(state.center.im));
	params.set('s', preciseNumber(state.spanY));
	if (state.rotation !== 0) params.set('r', preciseNumber(state.rotation));
	params.set('it', String(state.maxIterations));
	params.set('b', preciseNumber(state.bailout));
	if (state.exponent !== 2 || state.family === 'multibrot') params.set('d', String(state.exponent));
	params.set('jr', preciseNumber(state.juliaC.re));
	params.set('ji', preciseNumber(state.juliaC.im));
	params.set('jrd', state.juliaCDecimal?.re ?? preciseNumber(state.juliaC.re));
	params.set('jid', state.juliaCDecimal?.im ?? preciseNumber(state.juliaC.im));
	if (state.family === 'phoenix' || state.phoenixP.re !== -0.5 || state.phoenixP.im !== 0) {
		params.set('pr', preciseNumber(state.phoenixP.re));
		params.set('pi', preciseNumber(state.phoenixP.im));
	}
	if (
		state.family === 'phoenix' ||
		state.phoenixPrevious.re !== 0 ||
		state.phoenixPrevious.im !== 0
	) {
		params.set('pzr', preciseNumber(state.phoenixPrevious.re));
		params.set('pzi', preciseNumber(state.phoenixPrevious.im));
	}
	if (state.family === 'newton' || state.newtonRelaxation !== 1) {
		params.set('lam', preciseNumber(state.newtonRelaxation));
	}
	params.set('col', state.coloring);
	params.set('pal', state.paletteId);
	if (state.paletteOffset !== 0) params.set('po', preciseNumber(state.paletteOffset));
	if (state.paletteCycles !== 1) params.set('pc', preciseNumber(state.paletteCycles));
	if ((state.distanceLightAngle ?? -Math.PI / 4) !== -Math.PI / 4) {
		params.set('dla', preciseNumber(state.distanceLightAngle ?? -Math.PI / 4));
	}
	if ((state.distanceLightStrength ?? 0.72) !== 0.72) {
		params.set('dls', preciseNumber(state.distanceLightStrength ?? 0.72));
	}
	params.set('inside', state.interiorColor);
	params.set('seed', String(state.seed));
	params.set('q', state.renderQuality);
	params.set('prec', state.precisionMode);
	if (state.flipY) params.set('flip', '1');
	if (!state.analyticInteriorTests) params.set('analytic', '0');
	params.set('tol', preciseNumber(state.convergenceTolerance));

	if (state.customPalette) params.set('stops', compactJson(state.customPalette));
	if (state.orbitTrap) params.set('trap', compactJson(state.orbitTrap));
	if (state.polynomial) params.set('poly', compactJson(state.polynomial));
	if (state.customMap) params.set('map', compactJson(state.customMap));
	if (state.ifs) params.set('ifs', compactJson(state.ifs));
	if (state.lSystem) params.set('ls', compactJson(state.lSystem));
	if (state.density) params.set('density', compactJson(state.density));
	return params;
}

export function parseFractalState(
	source: URLSearchParams | string,
	fallbackFamily: FractalFamily = 'mandelbrot'
): StateValidationResult {
	const serialized = typeof source === 'string' ? source.replace(/^\?/u, '') : source.toString();
	if (serialized.length > MAX_STATE_QUERY_LENGTH) {
		const result = normalizeFractalState(createFamilyDefaultState(fallbackFamily), fallbackFamily);
		result.issues.push({
			path: '',
			value: `${serialized.length} characters`,
			message: `The state query exceeds the ${MAX_STATE_QUERY_LENGTH.toLocaleString('en')} character safety limit.`,
			severity: 'error'
		});
		return result;
	}
	const params = typeof source === 'string' ? new URLSearchParams(serialized) : source;
	const candidate: Record<string, unknown> = {
		version: numericParameter(params, 'v') ?? FRACTAL_STATE_VERSION,
		family: params.get('f') ?? fallbackFamily
	};
	assignString(params, 'p', candidate, 'plane');
	assignComplex(params, 'x', 'y', candidate, 'center');
	assignDecimalComplex(params, 'xd', 'yd', candidate, 'centerDecimal');
	assignNumber(params, 's', candidate, 'spanY');
	assignNumber(params, 'r', candidate, 'rotation');
	assignNumber(params, 'it', candidate, 'maxIterations');
	assignNumber(params, 'b', candidate, 'bailout');
	assignNumber(params, 'd', candidate, 'exponent');
	assignComplex(params, 'jr', 'ji', candidate, 'juliaC');
	assignDecimalComplex(params, 'jrd', 'jid', candidate, 'juliaCDecimal');
	assignComplex(params, 'pr', 'pi', candidate, 'phoenixP');
	assignComplex(params, 'pzr', 'pzi', candidate, 'phoenixPrevious');
	assignNumber(params, 'lam', candidate, 'newtonRelaxation');
	assignString(params, 'col', candidate, 'coloring');
	assignString(params, 'pal', candidate, 'paletteId');
	assignNumber(params, 'po', candidate, 'paletteOffset');
	assignNumber(params, 'pc', candidate, 'paletteCycles');
	assignNumber(params, 'dla', candidate, 'distanceLightAngle');
	assignNumber(params, 'dls', candidate, 'distanceLightStrength');
	assignString(params, 'inside', candidate, 'interiorColor');
	assignNumber(params, 'seed', candidate, 'seed');
	assignString(params, 'q', candidate, 'renderQuality');
	assignString(params, 'prec', candidate, 'precisionMode');
	assignBoolean(params, 'flip', candidate, 'flipY');
	assignBoolean(params, 'analytic', candidate, 'analyticInteriorTests');
	assignNumber(params, 'tol', candidate, 'convergenceTolerance');
	assignJson(params, 'stops', candidate, 'customPalette');
	assignJson(params, 'trap', candidate, 'orbitTrap');
	assignJson(params, 'poly', candidate, 'polynomial');
	assignJson(params, 'map', candidate, 'customMap');
	assignJson(params, 'ifs', candidate, 'ifs');
	assignJson(params, 'ls', candidate, 'lSystem');
	assignJson(params, 'density', candidate, 'density');
	return normalizeFractalState(candidate, fallbackFamily);
}

export function serializeLocalState(input: FractalViewState): string {
	return JSON.stringify(normalizeFractalState(input).state);
}

export function parseLocalState(
	source: string,
	fallbackFamily: FractalFamily = 'mandelbrot'
): StateValidationResult {
	if (typeof source !== 'string' || source.length > MAX_LOCAL_STATE_LENGTH) {
		const result = normalizeFractalState(createFamilyDefaultState(fallbackFamily), fallbackFamily);
		result.issues.push({
			path: '',
			value: typeof source === 'string' ? `${source.length} characters` : typeof source,
			message: `Local state exceeds the ${MAX_LOCAL_STATE_LENGTH.toLocaleString('en')} character safety limit.`,
			severity: 'error'
		});
		return result;
	}
	try {
		return normalizeFractalState(JSON.parse(source), fallbackFamily);
	} catch {
		const result = normalizeFractalState(createFamilyDefaultState(fallbackFamily), fallbackFamily);
		result.issues.push({
			path: '',
			value: source.slice(0, 80),
			message: 'Local state is not valid JSON; safe defaults were restored.',
			severity: 'error'
		});
		return result;
	}
}

export function changeStateFamily(
	input: FractalViewState,
	family: FractalFamily,
	options: { preserveViewport?: boolean; preservePalette?: boolean } = {}
): FractalViewState {
	const next = createFamilyDefaultState(family);
	if (options.preserveViewport) {
		next.center = { ...input.center };
		next.centerDecimal = input.centerDecimal ? { ...input.centerDecimal } : undefined;
		next.spanY = input.spanY;
		next.rotation = input.rotation;
	}
	if (options.preservePalette) {
		next.paletteId = input.paletteId;
		next.paletteOffset = input.paletteOffset;
		next.paletteCycles = input.paletteCycles;
		next.distanceLightAngle = input.distanceLightAngle;
		next.distanceLightStrength = input.distanceLightStrength;
		next.customPalette = input.customPalette?.map((stop) => ({ ...stop }));
	}
	return next;
}

function normalizeOrbitTrap(
	value: unknown,
	fallback: OrbitTrapState,
	issues: StateIssue[]
): OrbitTrapState {
	if (!isRecord(value)) {
		issues.push(issue('orbitTrap', value, 'Orbit trap must be an object; its default was used.'));
		return { ...fallback, position: { ...fallback.position } };
	}
	const trap = { ...fallback, position: { ...fallback.position } };
	if (typeof value.kind === 'string' && TRAP_KINDS.has(value.kind as OrbitTrapKind)) {
		trap.kind = value.kind as OrbitTrapKind;
	} else if (value.kind !== undefined) {
		issues.push(issue('orbitTrap.kind', value.kind, 'Unknown orbit-trap geometry.'));
	}
	trap.position = readComplex(value.position, trap.position, 'orbitTrap.position', issues);
	trap.radius = readNumber(value.radius, trap.radius, 0, 1e6, 'orbitTrap.radius', issues);
	trap.spacing = readNumber(
		value.spacing,
		trap.spacing,
		Number.EPSILON,
		1e6,
		'orbitTrap.spacing',
		issues
	);
	trap.rotation = normalizeAngle(
		readNumber(value.rotation, trap.rotation, -1e9, 1e9, 'orbitTrap.rotation', issues)
	);
	trap.mix = readNumber(value.mix, trap.mix, 0, 1, 'orbitTrap.mix', issues);
	return trap;
}

function normalizePolynomial(
	value: unknown,
	fallback: PolynomialState,
	issues: StateIssue[]
): PolynomialState {
	if (!isRecord(value) || !Array.isArray(value.coefficients)) {
		issues.push(issue('polynomial', value, 'Polynomial coefficients must be a structured array.'));
		return clonePolynomial(fallback);
	}
	const coefficients = value.coefficients;
	if (coefficients.length < 2 || coefficients.length > MAX_POLYNOMIAL_DEGREE + 1) {
		issues.push(
			issue(
				'polynomial.coefficients',
				coefficients.length,
				`Polynomial degree must remain between 1 and ${MAX_POLYNOMIAL_DEGREE}.`
			)
		);
		return clonePolynomial(fallback);
	}
	const normalized: ComplexValue[] = [];
	for (const [index, coefficient] of coefficients.entries()) {
		const parsed = strictComplex(coefficient);
		if (!parsed || Math.abs(parsed.re) > 1e6 || Math.abs(parsed.im) > 1e6) {
			issues.push(
				issue(
					`polynomial.coefficients.${index}`,
					coefficient,
					'Polynomial coefficient must be finite and bounded.'
				)
			);
			return clonePolynomial(fallback);
		}
		normalized.push(parsed);
	}
	if (normalized[0].re === 0 && normalized[0].im === 0) {
		issues.push(
			issue('polynomial.coefficients.0', normalized[0], 'The leading coefficient cannot be zero.')
		);
		return clonePolynomial(fallback);
	}
	return { coefficients: normalized };
}

function normalizeIFS(
	value: unknown,
	fallback: NonNullable<FractalViewState['ifs']>,
	issues: StateIssue[]
): NonNullable<FractalViewState['ifs']> {
	if (!isRecord(value)) {
		issues.push(issue('ifs', value, 'IFS state must be an object; the fern defaults were used.'));
		return {
			colorBy: fallback.colorBy,
			transforms: fallback.transforms.map((transform) => ({ ...transform }))
		};
	}
	const validated = validateIFSTransforms(value.transforms, fallback.transforms);
	for (const message of validated.issues) {
		issues.push(issue('ifs.transforms', value.transforms, message));
	}
	const colorBy =
		value.colorBy === 'age' || value.colorBy === 'transform' ? value.colorBy : fallback.colorBy;
	if (value.colorBy !== undefined && value.colorBy !== 'age' && value.colorBy !== 'transform') {
		issues.push(issue('ifs.colorBy', value.colorBy, 'IFS colour mode must be transform or age.'));
	}
	return { transforms: validated.transforms, colorBy };
}

function normalizeLSystem(
	value: unknown,
	fallback: LSystemState,
	issues: StateIssue[]
): LSystemState {
	if (!isRecord(value)) {
		issues.push(
			issue('lSystem', value, 'L-system state must be an object; the Koch default was used.')
		);
		return cloneLSystem(fallback);
	}
	const validation = validateLSystemDefinition(value);
	if (!validation.valid || !validation.definition) {
		for (const message of validation.issues) issues.push(issue('lSystem', value, message));
		return cloneLSystem(fallback);
	}
	const requestedGeneration = readInteger(
		value.generations,
		fallback.generations,
		0,
		LSYSTEM_MAX_GENERATIONS,
		'lSystem.generations',
		issues
	);
	let generations = requestedGeneration;
	for (; generations >= 0; generations -= 1) {
		const estimate = estimateLSystem(validation.definition, generations, {
			maxSymbols: LSYSTEM_MAX_SYMBOLS,
			maxSegments: LSYSTEM_MAX_SEGMENTS
		});
		if (!estimate.exceedsSymbolLimit && !estimate.exceedsSegmentLimit) break;
	}
	if (generations !== requestedGeneration) {
		issues.push(
			issue(
				'lSystem.generations',
				requestedGeneration,
				`Generation was reduced to ${generations} to respect symbol and segment limits.`
			)
		);
	}
	return {
		presetId:
			typeof value.presetId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value.presetId)
				? value.presetId
				: 'custom',
		...validation.definition,
		generations,
		lineWidth: readNumber(
			value.lineWidth,
			fallback.lineWidth,
			0.1,
			32,
			'lSystem.lineWidth',
			issues
		),
		colorByDepth: readBoolean(
			value.colorByDepth,
			fallback.colorByDepth,
			'lSystem.colorByDepth',
			issues
		)
	};
}

function normalizeDensity(
	value: unknown,
	fallback: DensityState,
	issues: StateIssue[]
): DensityState {
	if (!isRecord(value)) {
		issues.push(
			issue('density', value, 'Density state must be an object; safe defaults were used.')
		);
		return cloneDensity(fallback);
	}
	const density: DensityState = {
		targetSamples: readInteger(
			value.targetSamples,
			fallback.targetSamples,
			1,
			MAX_DENSITY_SAMPLES,
			'density.targetSamples',
			issues
		),
		exposure: readNumber(value.exposure, fallback.exposure, 0, 64, 'density.exposure', issues),
		gamma: readNumber(value.gamma, fallback.gamma, 0.05, 8, 'density.gamma', issues),
		iterationBands: cloneDensity(fallback).iterationBands
	};
	if (value.iterationBands !== undefined) {
		if (
			!Array.isArray(value.iterationBands) ||
			value.iterationBands.length < 1 ||
			value.iterationBands.length > 4
		) {
			issues.push(
				issue(
					'density.iterationBands',
					value.iterationBands,
					'Density requires 1–4 bounded iteration bands.'
				)
			);
		} else {
			const bands: [number, number][] = [];
			for (const [index, band] of value.iterationBands.entries()) {
				if (!Array.isArray(band) || band.length !== 2) {
					issues.push(
						issue(
							`density.iterationBands.${index}`,
							band,
							'Iteration band must contain two numbers.'
						)
					);
					continue;
				}
				const minimum = finiteNumber(band[0]);
				const maximum = finiteNumber(band[1]);
				if (
					minimum === null ||
					maximum === null ||
					minimum < 0 ||
					maximum <= minimum ||
					maximum > MAX_STATE_ITERATIONS
				) {
					issues.push(
						issue(`density.iterationBands.${index}`, band, 'Iteration band is invalid or unsafe.')
					);
					continue;
				}
				bands.push([Math.floor(minimum), Math.floor(maximum)]);
			}
			if (bands.length > 0) density.iterationBands = bands;
		}
	}
	return density;
}

function readComplex(
	value: unknown,
	fallback: ComplexValue,
	path: string,
	issues: StateIssue[]
): ComplexValue {
	if (value === undefined) return { ...fallback };
	const parsed = strictComplex(value);
	if (!parsed) {
		issues.push(
			issue(path, value, 'Complex value must contain finite real and imaginary numbers.')
		);
		return { ...fallback };
	}
	return parsed;
}

function readDecimalComplex(
	value: unknown,
	fallback: { re: string; im: string },
	path: string,
	issues: StateIssue[]
) {
	if (value === undefined) return { ...fallback };
	if (!isRecord(value)) {
		issues.push(issue(path, value, 'Deep centre must contain decimal-string coordinates.'));
		return { ...fallback };
	}
	const re = decimalCoordinate(value.re);
	const im = decimalCoordinate(value.im);
	if (re === null || im === null) {
		issues.push(
			issue(path, value, 'Deep centre coordinates must be finite decimal strings of safe length.')
		);
		return { ...fallback };
	}
	return { re, im };
}

function decimalCoordinate(value: unknown) {
	if (
		typeof value !== 'string' ||
		value.length < 1 ||
		value.length > 160 ||
		!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)
	) {
		return null;
	}
	const numeric = Number(value);
	return Number.isFinite(numeric) ? value : null;
}

function strictComplex(value: unknown): ComplexValue | null {
	if (!isRecord(value)) return null;
	const re = finiteNumber(value.re);
	const im = finiteNumber(value.im);
	return re === null || im === null ? null : { re, im };
}

function readNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: StateIssue[]
): number {
	if (value === undefined) return fallback;
	const parsed = finiteNumber(value);
	if (parsed === null) {
		issues.push(issue(path, value, 'Value must be a finite number; the default was used.'));
		return fallback;
	}
	const clamped = Math.min(maximum, Math.max(minimum, parsed));
	if (clamped !== parsed) {
		issues.push(issue(path, value, `Value was clamped to the safe range ${minimum}–${maximum}.`));
	}
	return clamped;
}

function readPositiveSpan(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: StateIssue[]
): number {
	if (value === undefined) return fallback;
	const parsed = finiteNumber(value);
	if (parsed === null || parsed <= 0) {
		issues.push(issue(path, value, 'Viewport span must be positive; the family default was used.'));
		return fallback;
	}
	return readNumber(parsed, fallback, minimum, maximum, path, issues);
}

function readInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: StateIssue[]
): number {
	const parsed = readNumber(value, fallback, minimum, maximum, path, issues);
	const integer = Math.floor(parsed);
	if (value !== undefined && integer !== parsed) {
		issues.push(issue(path, value, 'Value was rounded down to an integer.'));
	}
	return integer;
}

function readBoolean(
	value: unknown,
	fallback: boolean,
	path: string,
	issues: StateIssue[]
): boolean {
	if (value === undefined) return fallback;
	if (typeof value === 'boolean') return value;
	issues.push(issue(path, value, 'Value must be true or false; the default was used.'));
	return fallback;
}

function issue(path: string, value: unknown, message: string): StateIssue {
	return { path, value, message, severity: 'warning' };
}

function isLegacyState(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	return (
		value.version === 0 ||
		(value.version === undefined && 'familyId' in value && 'viewport' in value)
	);
}

function migrateLegacyState(value: Record<string, unknown>): Record<string, unknown> {
	const viewport = isRecord(value.viewport) ? value.viewport : {};
	const calculation = isRecord(value.calculation) ? value.calculation : {};
	const colour = isRecord(value.colour) ? value.colour : {};
	const display = isRecord(value.display) ? value.display : {};
	return {
		version: FRACTAL_STATE_VERSION,
		family: value.familyId,
		plane: value.plane,
		center: {
			re: numericValue(viewport.centerRe),
			im: numericValue(viewport.centerIm)
		},
		spanY: numericValue(viewport.spanY ?? viewport.width),
		rotation: numericValue(viewport.rotation),
		juliaC: isRecord(value.juliaC)
			? { re: numericValue(value.juliaC.re), im: numericValue(value.juliaC.im) }
			: undefined,
		maxIterations: calculation.maxIterations,
		bailout: calculation.bailout,
		analyticInteriorTests: calculation.analyticInteriorTests,
		precisionMode: calculation.precisionMode,
		coloring: colour.method,
		paletteId: colour.paletteId,
		customPalette: colour.paletteStops,
		paletteOffset: colour.offset,
		paletteCycles: colour.cycles,
		interiorColor: colour.interior,
		renderQuality: display.renderQuality,
		seed: value.seed,
		polynomial: value.polynomial,
		density: value.density
	};
}

function numericValue(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string' || value.length > 64 || value.trim() === '') return undefined;
	const trimmed = value.trim();
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(trimmed)) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function assignString(
	params: URLSearchParams,
	key: string,
	target: Record<string, unknown>,
	property: string
): void {
	const value = params.get(key);
	if (value !== null) target[property] = value;
}

function assignNumber(
	params: URLSearchParams,
	key: string,
	target: Record<string, unknown>,
	property: string
): void {
	const raw = params.get(key);
	if (raw !== null) target[property] = numericValue(raw) ?? raw;
}

function assignComplex(
	params: URLSearchParams,
	reKey: string,
	imKey: string,
	target: Record<string, unknown>,
	property: string
): void {
	const rawRe = params.get(reKey);
	const rawIm = params.get(imKey);
	if (rawRe === null && rawIm === null) return;
	target[property] = {
		re: rawRe === null ? 0 : (numericValue(rawRe) ?? rawRe),
		im: rawIm === null ? 0 : (numericValue(rawIm) ?? rawIm)
	};
}

function assignDecimalComplex(
	params: URLSearchParams,
	reKey: string,
	imKey: string,
	target: Record<string, unknown>,
	property: string
): void {
	const rawRe = params.get(reKey);
	const rawIm = params.get(imKey);
	if (rawRe === null && rawIm === null) return;
	target[property] = {
		re: rawRe ?? '0',
		im: rawIm ?? '0'
	};
}

function assignBoolean(
	params: URLSearchParams,
	key: string,
	target: Record<string, unknown>,
	property: string
): void {
	const raw = params.get(key);
	if (raw === null) return;
	target[property] =
		raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : raw;
}

function assignJson(
	params: URLSearchParams,
	key: string,
	target: Record<string, unknown>,
	property: string
): void {
	const raw = params.get(key);
	if (raw === null) return;
	if (raw.length > MAX_LOCAL_STATE_LENGTH) {
		target[property] = raw;
		return;
	}
	try {
		target[property] = JSON.parse(raw);
	} catch {
		target[property] = raw;
	}
}

function numericParameter(params: URLSearchParams, key: string): number | null {
	const raw = params.get(key);
	if (raw === null) return null;
	return numericValue(raw) ?? Number.NaN;
}

function compactJson(value: unknown): string {
	return JSON.stringify(value);
}

function preciseNumber(value: number): string {
	if (!Number.isFinite(value)) return '0';
	return Object.is(value, -0) ? '0' : value.toString();
}

function normalizeAngle(value: number): number {
	if (value >= -Math.PI && value <= Math.PI) return Object.is(value, -0) ? 0 : value;
	const turn = Math.PI * 2;
	return ((((value + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function clonePolynomial(polynomial: PolynomialState): PolynomialState {
	return {
		coefficients: polynomial.coefficients.map((coefficient) => ({ ...coefficient }))
	};
}

function cloneLSystem(state: LSystemState): LSystemState {
	return { ...state, rules: { ...state.rules } };
}

function cloneDensity(state: DensityState): DensityState {
	return {
		...state,
		iterationBands: state.iterationBands.map((band) => [...band] as [number, number])
	};
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
