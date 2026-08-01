import {
	FRACTAL_STATE_VERSION,
	type ComplexValue,
	type EscapeTimeFamily,
	type FamilyDefinition,
	type FamilyDefaults,
	type FractalFamily,
	type FractalViewState
} from './types';
import { cloneCustomMapRecipe, DEFAULT_CUSTOM_MAP_RECIPE } from './custom-map';

const ZERO: ComplexValue = { re: 0, im: 0 };
const DEFAULT_JULIA_C: ComplexValue = { re: -0.8, im: 0.156 };

function defaults(overrides: Partial<FamilyDefaults> = {}): FamilyDefaults {
	const result: FamilyDefaults = {
		plane: 'parameter',
		viewport: { center: { re: -0.5, im: 0 }, spanY: 2.8, rotation: 0 },
		maxIterations: 300,
		bailout: 2,
		exponent: 2,
		juliaC: { ...DEFAULT_JULIA_C },
		phoenixP: { re: -0.5, im: 0 },
		phoenixPrevious: { ...ZERO },
		newtonRelaxation: 1,
		coloring: 'smooth',
		paletteId: 'observatory',
		...overrides
	};
	result.juliaCDecimal = overrides.juliaCDecimal
		? { ...overrides.juliaCDecimal }
		: { re: result.juliaC.re.toString(), im: result.juliaC.im.toString() };
	return result;
}

const BARNSLEY_TRANSFORMS = [
	{
		id: 'stem',
		label: 'Stem',
		a: 0,
		b: 0,
		c: 0,
		d: 0.16,
		e: 0,
		f: 0,
		probability: 0.01
	},
	{
		id: 'successive-leaflets',
		label: 'Successive leaflets',
		a: 0.85,
		b: 0.04,
		c: -0.04,
		d: 0.85,
		e: 0,
		f: 1.6,
		probability: 0.85
	},
	{
		id: 'left-leaflet',
		label: 'Left leaflet',
		a: 0.2,
		b: -0.26,
		c: 0.23,
		d: 0.22,
		e: 0,
		f: 1.6,
		probability: 0.07
	},
	{
		id: 'right-leaflet',
		label: 'Right leaflet',
		a: -0.15,
		b: 0.28,
		c: 0.26,
		d: 0.24,
		e: 0,
		f: 0.44,
		probability: 0.07
	}
] satisfies NonNullable<FamilyDefaults['ifs']>['transforms'];

export const FAMILY_REGISTRY = [
	{
		id: 'mandelbrot',
		supportedPlanes: ['parameter'],
		defaults: defaults(),
		passport: {
			name: 'Mandelbrot set',
			alternativeNames: [],
			formula: 'zₙ₊₁ = zₙ² + c, z₀ = 0',
			computationalClass: 'escape-time',
			pixelRole: 'The parameter c',
			fixedQuantities: 'The starting value z₀ = 0 and the quadratic rule',
			variableQuantities: 'The parameter c changes from pixel to pixel',
			colorMeaning: 'Whether the orbit escaped, and how quickly it did so',
			typicalSymmetry: 'Reflection across the real axis',
			suggestedExperiment: 'Probe points on both sides of the main boundary.',
			historicalNote:
				'Computer experiments made the connectedness map of quadratic Julia sets visible at useful scale.',
			sectionId: 'the-census-and-the-citizen',
			finiteComputationCaveat:
				'Not escaping before the iteration limit is evidence of unresolved boundedness, not a proof for an arbitrary pixel.'
		}
	},
	{
		id: 'julia',
		supportedPlanes: ['dynamical'],
		defaults: defaults({
			plane: 'dynamical',
			viewport: { center: { ...ZERO }, spanY: 3, rotation: 0 },
			juliaC: { ...DEFAULT_JULIA_C }
		}),
		passport: {
			name: 'Julia set',
			alternativeNames: ['Filled Julia set'],
			formula: 'zₙ₊₁ = zₙ² + c',
			computationalClass: 'escape-time',
			pixelRole: 'The starting value z₀',
			fixedQuantities: 'The parameter c',
			variableQuantities: 'The starting value changes from pixel to pixel',
			colorMeaning: 'Whether the selected starting orbit escaped, and its escape speed',
			typicalSymmetry:
				'Half-turn symmetry for every quadratic Julia set; real-axis reflection when c is real',
			suggestedExperiment:
				'Move c through the Mandelbrot set and watch the entire dynamical plane change.',
			historicalNote:
				'Gaston Julia and Pierre Fatou developed the foundational theory of iterated rational maps in the early twentieth century.',
			sectionId: 'the-census-and-the-citizen',
			finiteComputationCaveat:
				'A finite iteration count samples the filled Julia set; it cannot decide every boundary point exactly.'
		}
	},
	{
		id: 'multibrot',
		supportedPlanes: ['parameter', 'dynamical'],
		defaults: defaults({
			viewport: { center: { re: -0.2, im: 0 }, spanY: 3, rotation: 0 },
			exponent: 3
		}),
		passport: {
			name: 'Multibrot set',
			alternativeNames: ['Degree-d Multibrot'],
			formula: 'zₙ₊₁ = zₙᵈ + c',
			computationalClass: 'escape-time',
			pixelRole: 'c in parameter mode; z₀ in dynamical mode',
			fixedQuantities: 'An integer exponent d and, in dynamical mode, c',
			variableQuantities: 'The pixel-supplied complex value',
			colorMeaning: 'Escape status and escape speed',
			typicalSymmetry: 'Rotational symmetry determined by the integer degree',
			suggestedExperiment: 'Change d from two to three and compare the reorganised symmetry.',
			historicalNote:
				'Multibrot sets generalise the quadratic parameter-space construction to higher integer powers.',
			sectionId: 'the-relatives-who-altered-one-line-of-the-recipe',
			finiteComputationCaveat:
				'Only bounded integer powers are accepted; non-integer complex branches are deliberately outside this model.'
		}
	},
	{
		id: 'burning-ship',
		supportedPlanes: ['parameter', 'dynamical'],
		defaults: defaults({
			viewport: { center: { re: -0.45, im: -0.5 }, spanY: 2.8, rotation: 0 }
		}),
		passport: {
			name: 'Burning Ship',
			alternativeNames: ['Burning Ship fractal'],
			formula: 'zₙ₊₁ = (|Re zₙ| + i|Im zₙ|)² + c',
			computationalClass: 'escape-time',
			pixelRole: 'c in parameter mode; z₀ in dynamical mode',
			fixedQuantities: 'The absolute-value-before-squaring recurrence',
			variableQuantities: 'The pixel-supplied complex value',
			colorMeaning: 'Escape status and escape speed',
			typicalSymmetry:
				'No general holomorphic symmetry; individual details often show strong bilateral-looking structure',
			suggestedExperiment:
				'Compare the same coordinate with Mandelbrot before using the presentation flip.',
			historicalNote:
				'The absolute values destroy the ordinary holomorphic structure and create a genuinely different map.',
			sectionId: 'the-relatives-who-altered-one-line-of-the-recipe',
			finiteComputationCaveat:
				'The familiar vertical flip is a presentation choice; it is not silently baked into the recurrence.'
		}
	},
	{
		id: 'tricorn',
		supportedPlanes: ['parameter', 'dynamical'],
		defaults: defaults({
			viewport: { center: { ...ZERO }, spanY: 3.2, rotation: 0 }
		}),
		passport: {
			name: 'Tricorn',
			alternativeNames: ['Mandelbar set'],
			formula: 'zₙ₊₁ = conjugate(zₙ)² + c',
			computationalClass: 'escape-time',
			pixelRole: 'c in parameter mode; z₀ in dynamical mode',
			fixedQuantities: 'The antiholomorphic quadratic rule',
			variableQuantities: 'The pixel-supplied complex value',
			colorMeaning: 'Escape status and escape speed',
			typicalSymmetry: 'Threefold parameter-space structure with real-axis reflection',
			suggestedExperiment:
				'Compare Mandelbrot and Tricorn with the same palette and iteration limit.',
			historicalNote:
				'Complex conjugation changes the map from holomorphic to antiholomorphic dynamics.',
			sectionId: 'the-relatives-who-altered-one-line-of-the-recipe',
			finiteComputationCaveat:
				'Its dynamical plane must use the conjugated recurrence as written, not an ordinary Julia shortcut.'
		}
	},
	{
		id: 'phoenix',
		supportedPlanes: ['dynamical'],
		defaults: defaults({
			plane: 'dynamical',
			viewport: { center: { ...ZERO }, spanY: 3.2, rotation: 0 },
			juliaC: { re: 0.56667, im: 0 },
			phoenixP: { re: -0.5, im: 0 },
			phoenixPrevious: { ...ZERO }
		}),
		passport: {
			name: 'Phoenix',
			alternativeNames: ['Phoenix Julia set'],
			formula: 'zₙ₊₁ = zₙ² + c + pzₙ₋₁',
			computationalClass: 'escape-time',
			pixelRole: 'The starting value z₀',
			fixedQuantities: 'The parameters c and p, with z₋₁ = 0 by default',
			variableQuantities: 'The current and previous iterates',
			colorMeaning: 'Escape status and escape speed',
			typicalSymmetry: 'Parameter-dependent, with real-axis reflection for real c and p',
			suggestedExperiment: 'Step one orbit while watching both zₙ and zₙ₋₁.',
			historicalNote:
				'The additional memory term makes Phoenix a second-order recurrence rather than a one-state quadratic map.',
			sectionId: 'the-relatives-who-altered-one-line-of-the-recipe',
			finiteComputationCaveat:
				'Updating the remembered value in the wrong order produces a different recurrence.'
		}
	},
	{
		id: 'custom-map',
		supportedPlanes: ['parameter', 'dynamical'],
		defaults: defaults({
			viewport: { center: { re: -0.5, im: 0 }, spanY: 2.8, rotation: 0 },
			customMap: cloneCustomMapRecipe(DEFAULT_CUSTOM_MAP_RECIPE)
		}),
		passport: {
			name: 'Custom map',
			alternativeNames: ['Formula mutation laboratory'],
			formula: 'zₙ₊₁ = T(zₙ)ᵈ + [c] + [pzₙ₋₁] — exact active recipe shown in the laboratory',
			computationalClass: 'escape-time',
			pixelRole: 'c in parameter mode; the candidate starting value in dynamical mode',
			fixedQuantities:
				'A bounded, data-only recipe: integer power, optional folds, optional c, and optional memory',
			variableQuantities:
				'The pixel-supplied value and the current/previous iterates selected by the recipe',
			colorMeaning: 'Finite escape status, escape speed, or orbit-trap proximity',
			typicalSymmetry:
				'Recipe-dependent; component folds and conjugation can remove or reorganise familiar symmetries',
			suggestedExperiment:
				'Start with the quadratic recipe, fold both components to recover the Burning Ship, then add memory.',
			historicalNote:
				'This workshop mutates known escape maps through a constrained recipe rather than evaluating user-authored code.',
			sectionId: 'the-relatives-who-altered-one-line-of-the-recipe',
			finiteComputationCaveat:
				'Unescaped pixels remain unresolved at the selected limit. Custom maps use ordinary GPU precision and an honest bounded CPU-double fallback when float coordinates collapse.'
		}
	},
	{
		id: 'newton',
		supportedPlanes: ['basin'],
		defaults: defaults({
			plane: 'basin',
			viewport: { center: { ...ZERO }, spanY: 3.2, rotation: 0 },
			maxIterations: 80,
			coloring: 'root-basin',
			paletteId: 'categorical-roots',
			polynomial: {
				coefficients: [
					{ re: 1, im: 0 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: -1, im: 0 }
				]
			}
		}),
		passport: {
			name: 'Newton fractal',
			alternativeNames: ['Newton basin'],
			formula: 'zₙ₊₁ = zₙ − λ f(zₙ) / f′(zₙ)',
			computationalClass: 'convergence-basin',
			pixelRole: 'The starting guess z₀',
			fixedQuantities: 'A structured polynomial, relaxation λ, and convergence tolerance',
			variableQuantities: 'The starting guess and the root eventually reached',
			colorMeaning: 'Root identity by hue; convergence speed by intensity',
			typicalSymmetry: 'Inherited from the selected polynomial and its roots',
			suggestedExperiment: 'Let every starting point vote on a root of z³ − 1.',
			historicalNote:
				'Newton iteration was designed to find roots; applying it across a plane reveals disputed basin boundaries.',
			sectionId: 'newton-draws-a-map-by-trying-to-solve-an-equation',
			finiteComputationCaveat:
				'Derivative singularities, cycles, and the iteration limit leave some points unresolved.'
		}
	},
	{
		id: 'buddhabrot',
		supportedPlanes: ['density'],
		defaults: defaults({
			plane: 'density',
			viewport: { center: { re: -0.5, im: 0 }, spanY: 3, rotation: 0 },
			maxIterations: 500,
			coloring: 'density',
			paletteId: 'bone-and-soot',
			density: {
				targetSamples: 250_000,
				exposure: 1,
				gamma: 0.65,
				iterationBands: [
					[20, 80],
					[80, 250],
					[250, 500]
				]
			}
		}),
		passport: {
			name: 'Buddhabrot',
			alternativeNames: ['Orbit-density Mandelbrot rendering'],
			formula: 'Accumulate visited positions from sampled c whose Mandelbrot orbits escape',
			computationalClass: 'orbit-density',
			pixelRole: 'A histogram bin visited by many sampled escaping orbits',
			fixedQuantities: 'Sampling bounds, seed, iteration budget, and tone mapping',
			variableQuantities: 'Sampled c values and their visited orbit positions',
			colorMeaning: 'Accumulated orbit density',
			typicalSymmetry: 'Expected real-axis symmetry; finite samples retain visible noise',
			suggestedExperiment: 'Pause after several sample budgets and watch noise become structure.',
			historicalNote:
				'It reverses the ordinary emphasis: the routes of escaping orbits form the image.',
			sectionId: 'the-ghost-made-by-escape',
			finiteComputationCaveat:
				'This is a seeded sampled histogram whose appearance depends on budget, bounds, and tone mapping.'
		}
	},
	{
		id: 'barnsley-fern',
		supportedPlanes: ['construction'],
		defaults: defaults({
			plane: 'construction',
			viewport: { center: { re: 0, im: 5 }, spanY: 11, rotation: 0 },
			coloring: 'density',
			paletteId: 'algae',
			ifs: {
				transforms: BARNSLEY_TRANSFORMS.map((transform) => ({ ...transform })),
				colorBy: 'transform'
			}
		}),
		passport: {
			name: 'Barnsley fern',
			alternativeNames: ['IFS fern'],
			formula: 'Choose one of four affine maps, then feed its output back as the next point',
			computationalClass: 'iterated-function-system',
			pixelRole: 'A plotted visit, not a membership candidate',
			fixedQuantities: 'The affine transforms and their probabilities',
			variableQuantities: 'The current point and the seeded transform choice',
			colorMeaning: 'Transform identity, visit age, or accumulated density',
			typicalSymmetry: 'Asymmetric botanical form',
			suggestedExperiment: 'Grow one seeded affine decision at a time.',
			historicalNote:
				'Michael Barnsley popularised iterated-function-system constructions as a compact language for natural-looking forms.',
			sectionId: 'a-fern-assembled-by-probability',
			finiteComputationCaveat:
				'The finite point cloud is a sample approaching the invariant set, not a trace drawn from stem to tip.'
		}
	},
	{
		id: 'sierpinski',
		supportedPlanes: ['construction'],
		defaults: defaults({
			plane: 'construction',
			viewport: { center: { re: 0, im: 0.45 }, spanY: 1.2, rotation: 0 },
			coloring: 'density',
			paletteId: 'printers-proof'
		}),
		passport: {
			name: 'Sierpiński triangle',
			alternativeNames: ['Sierpiński gasket'],
			formula: 'Repeatedly halve toward a chosen vertex, or recursively remove central triangles',
			computationalClass: 'recursive-construction',
			pixelRole: 'A plotted chaos-game visit or a retained recursive triangle',
			fixedQuantities: 'Three vertices and one of two construction rules',
			variableQuantities: 'The chosen vertex or recursion depth',
			colorMeaning: 'Visit density, vertex choice, or recursion depth',
			typicalSymmetry: 'Threefold triangular symmetry',
			suggestedExperiment: 'Compare the chaos game with recursive removal at matching depth.',
			historicalNote:
				'Distinct stochastic and deterministic procedures approach the same limiting object.',
			sectionId: 'a-fern-assembled-by-probability',
			finiteComputationCaveat:
				'Every displayed generation or point budget is finite; the mathematical gasket is the limit.'
		}
	},
	{
		id: 'l-system',
		supportedPlanes: ['construction'],
		defaults: defaults({
			plane: 'construction',
			viewport: { center: { ...ZERO }, spanY: 1.5, rotation: 0 },
			coloring: 'bands',
			paletteId: 'tram-brass',
			lSystem: {
				presetId: 'koch-curve',
				axiom: 'F',
				rules: { F: 'F+F--F+F' },
				generations: 4,
				angleDegrees: 60,
				stepLength: 1,
				startAngleDegrees: 0,
				lineWidth: 1.5,
				colorByDepth: true
			}
		}),
		passport: {
			name: 'L-system laboratory',
			alternativeNames: ['Lindenmayer-system curves'],
			formula:
				'Repeatedly replace symbols using a restricted grammar, then interpret the result as turtle commands',
			computationalClass: 'recursive-grammar',
			pixelRole: 'A rasterised or vectorised curve segment',
			fixedQuantities: 'The axiom, production rules, angle, and drawing interpretation',
			variableQuantities: 'Generation and the expanded symbol sequence',
			colorMeaning: 'Recursion depth or drawing order',
			typicalSymmetry: 'Preset-dependent',
			suggestedExperiment:
				'Raise the Hilbert generation while watching the predicted segment count.',
			historicalNote:
				'Aristid Lindenmayer introduced parallel rewriting systems to model biological growth.',
			sectionId: 'a-fern-assembled-by-probability',
			finiteComputationCaveat:
				'Expansion is hard-limited before the grammar can allocate an unsafe number of symbols or segments.'
		}
	}
] as const satisfies readonly FamilyDefinition[];

export const FAMILY_BY_ID: Readonly<Record<FractalFamily, FamilyDefinition>> = Object.freeze(
	Object.fromEntries(FAMILY_REGISTRY.map((family) => [family.id, family])) as unknown as Record<
		FractalFamily,
		FamilyDefinition
	>
);

const FAMILY_IDS = new Set<string>(FAMILY_REGISTRY.map((family) => family.id));
const ESCAPE_FAMILY_IDS = new Set<string>([
	'mandelbrot',
	'julia',
	'multibrot',
	'burning-ship',
	'tricorn',
	'phoenix',
	'custom-map'
] satisfies EscapeTimeFamily[]);

export function isFractalFamily(value: unknown): value is FractalFamily {
	return typeof value === 'string' && FAMILY_IDS.has(value);
}

export function isEscapeTimeFamily(value: unknown): value is EscapeTimeFamily {
	return typeof value === 'string' && ESCAPE_FAMILY_IDS.has(value);
}

export function getFamilyDefinition(family: FractalFamily): FamilyDefinition {
	return FAMILY_BY_ID[family];
}

export function createFamilyDefaultState(family: FractalFamily = 'mandelbrot'): FractalViewState {
	const definition = FAMILY_BY_ID[family];
	const familyDefaults = definition.defaults;
	return {
		version: FRACTAL_STATE_VERSION,
		family,
		plane: familyDefaults.plane,
		center: { ...familyDefaults.viewport.center },
		centerDecimal: {
			re: familyDefaults.viewport.center.re.toString(),
			im: familyDefaults.viewport.center.im.toString()
		},
		spanY: familyDefaults.viewport.spanY,
		rotation: familyDefaults.viewport.rotation,
		maxIterations: familyDefaults.maxIterations,
		bailout: familyDefaults.bailout,
		exponent: familyDefaults.exponent,
		juliaC: { ...familyDefaults.juliaC },
		juliaCDecimal: familyDefaults.juliaCDecimal
			? { ...familyDefaults.juliaCDecimal }
			: {
					re: familyDefaults.juliaC.re.toString(),
					im: familyDefaults.juliaC.im.toString()
				},
		phoenixP: { ...familyDefaults.phoenixP },
		phoenixPrevious: { ...familyDefaults.phoenixPrevious },
		newtonRelaxation: familyDefaults.newtonRelaxation,
		coloring: familyDefaults.coloring,
		paletteId: familyDefaults.paletteId,
		paletteOffset: 0,
		paletteCycles: 1,
		distanceLightAngle: -Math.PI / 4,
		distanceLightStrength: 0.72,
		interiorColor: '#090B12',
		orbitTrap: {
			kind: 'point',
			position: { re: 0, im: 0 },
			radius: 0.5,
			spacing: 0.5,
			rotation: 0,
			mix: 0.65
		},
		polynomial: familyDefaults.polynomial
			? {
					coefficients: familyDefaults.polynomial.coefficients.map((coefficient) => ({
						...coefficient
					}))
				}
			: undefined,
		customMap: familyDefaults.customMap
			? cloneCustomMapRecipe(familyDefaults.customMap)
			: undefined,
		ifs: familyDefaults.ifs
			? {
					colorBy: familyDefaults.ifs.colorBy,
					transforms: familyDefaults.ifs.transforms.map((transform) => ({ ...transform }))
				}
			: undefined,
		lSystem: familyDefaults.lSystem
			? {
					...familyDefaults.lSystem,
					rules: { ...familyDefaults.lSystem.rules }
				}
			: undefined,
		density: familyDefaults.density
			? {
					...familyDefaults.density,
					iterationBands: familyDefaults.density.iterationBands.map(
						([minimum, maximum]) => [minimum, maximum] as [number, number]
					)
				}
			: undefined,
		seed: 0x5eed1234,
		renderQuality: 'balanced',
		precisionMode: 'auto',
		flipY: false,
		analyticInteriorTests: true,
		convergenceTolerance: 1e-8
	};
}
