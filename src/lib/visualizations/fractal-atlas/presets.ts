import { createFamilyDefaultState } from './families';
import { getLSystemPreset } from './lsystem';
import type { AtlasPreset, FractalFamily, FractalViewState, LSystemState } from './types';

type StateOverrides = Partial<Omit<FractalViewState, 'version' | 'family'>> & {
	center?: FractalViewState['center'];
};

function makePreset(
	id: string,
	label: string,
	group: AtlasPreset['group'],
	description: string,
	family: FractalFamily,
	overrides: StateOverrides = {},
	metadata: Partial<
		Pick<AtlasPreset, 'verified' | 'verificationNote' | 'historicalNote' | 'openLinkedView'>
	> = {}
): AtlasPreset {
	const base = createFamilyDefaultState(family);
	return {
		id,
		label,
		group,
		description,
		verified: metadata.verified ?? true,
		verificationNote:
			metadata.verificationNote ??
			'Deterministic local thumbnail rendered and inspected against the stored coordinates.',
		historicalNote: metadata.historicalNote,
		openLinkedView: metadata.openLinkedView,
		state: {
			...base,
			...overrides,
			version: 1,
			family,
			center: { ...(overrides.center ?? base.center) },
			centerDecimal: overrides.centerDecimal
				? { ...overrides.centerDecimal }
				: {
						re: (overrides.center ?? base.center).re.toString(),
						im: (overrides.center ?? base.center).im.toString()
					},
			juliaC: { ...(overrides.juliaC ?? base.juliaC) },
			juliaCDecimal: overrides.juliaCDecimal
				? { ...overrides.juliaCDecimal }
				: {
						re: (overrides.juliaC ?? base.juliaC).re.toString(),
						im: (overrides.juliaC ?? base.juliaC).im.toString()
					},
			phoenixP: { ...(overrides.phoenixP ?? base.phoenixP) },
			phoenixPrevious: { ...(overrides.phoenixPrevious ?? base.phoenixPrevious) },
			orbitTrap: overrides.orbitTrap
				? {
						...overrides.orbitTrap,
						position: { ...overrides.orbitTrap.position }
					}
				: base.orbitTrap
					? { ...base.orbitTrap, position: { ...base.orbitTrap.position } }
					: undefined,
			polynomial: overrides.polynomial
				? {
						coefficients: overrides.polynomial.coefficients.map((coefficient) => ({
							...coefficient
						}))
					}
				: base.polynomial
					? {
							coefficients: base.polynomial.coefficients.map((coefficient) => ({
								...coefficient
							}))
						}
					: undefined,
			customMap: overrides.customMap
				? {
						...overrides.customMap,
						memoryCoefficient: { ...overrides.customMap.memoryCoefficient }
					}
				: base.customMap
					? {
							...base.customMap,
							memoryCoefficient: { ...base.customMap.memoryCoefficient }
						}
					: undefined,
			ifs: overrides.ifs
				? {
						colorBy: overrides.ifs.colorBy,
						transforms: overrides.ifs.transforms.map((transform) => ({ ...transform }))
					}
				: base.ifs
					? {
							colorBy: base.ifs.colorBy,
							transforms: base.ifs.transforms.map((transform) => ({ ...transform }))
						}
					: undefined,
			lSystem: overrides.lSystem
				? { ...overrides.lSystem, rules: { ...overrides.lSystem.rules } }
				: base.lSystem
					? { ...base.lSystem, rules: { ...base.lSystem.rules } }
					: undefined,
			density: overrides.density
				? {
						...overrides.density,
						iterationBands: overrides.density.iterationBands.map(
							(band) => [...band] as [number, number]
						)
					}
				: base.density
					? {
							...base.density,
							iterationBands: base.density.iterationBands.map(
								(band) => [...band] as [number, number]
							)
						}
					: undefined,
			customPalette: overrides.customPalette?.map((stop) => ({ ...stop }))
		}
	};
}

function lSystemState(
	presetId: string,
	generations: number,
	extras: Partial<Pick<LSystemState, 'lineWidth' | 'colorByDepth'>> = {}
): LSystemState {
	const preset = getLSystemPreset(presetId);
	return {
		presetId: preset.id,
		axiom: preset.axiom,
		rules: { ...preset.rules },
		generations,
		angleDegrees: preset.angleDegrees,
		stepLength: preset.stepLength,
		startAngleDegrees: preset.startAngleDegrees,
		lineWidth: extras.lineWidth ?? 1.5,
		colorByDepth: extras.colorByDepth ?? true
	};
}

export const ATLAS_PRESETS = [
	makePreset(
		'mandelbrot-full',
		'The full set',
		'mandelbrot-landmarks',
		'The complete familiar body before the boundary begins its finer mischief.',
		'mandelbrot',
		{},
		{ openLinkedView: true }
	),
	makePreset(
		'cardioid-and-bulb',
		'Cardioid and period-two bulb',
		'mandelbrot-landmarks',
		'The main cardioid meets the large period-two bulb at the most legible scale.',
		'mandelbrot',
		{
			center: { re: -0.75, im: 0 },
			spanY: 1.45,
			maxIterations: 420
		},
		{ openLinkedView: true }
	),
	makePreset(
		'across-the-boundary',
		'Across the boundary',
		'mandelbrot-landmarks',
		'A mixed interior and exterior view suited to probing orbit outcomes.',
		'mandelbrot',
		{
			center: { re: -0.75, im: 0 },
			spanY: 0.32,
			maxIterations: 500
		},
		{ openLinkedView: true }
	),
	makePreset(
		'seahorse-valley',
		'Seahorse Valley',
		'mandelbrot-landmarks',
		'A stable landmark near the long spiral boundary, still within ordinary Number precision.',
		'mandelbrot',
		{
			center: { re: -0.743643887037151, im: 0.13182590420533 },
			spanY: 0.002,
			maxIterations: 800,
			paletteId: 'monsoon-ink',
			paletteCycles: 1.6
		},
		{ openLinkedView: true }
	),
	makePreset(
		'elephant-valley',
		'Elephant Valley',
		'mandelbrot-landmarks',
		'A tested boundary window where repeated lobes suggest trunks and curling ears.',
		'mandelbrot',
		{
			center: { re: 0.285, im: 0.01 },
			centerDecimal: { re: '0.285', im: '0.01' },
			spanY: 0.045,
			maxIterations: 900,
			paletteId: 'tram-brass'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'boundary-spiral',
		'A boundary spiral',
		'mandelbrot-landmarks',
		'A locally tested spiral window, named only for the structure visible in this rendering.',
		'mandelbrot',
		{
			center: { re: -0.777807810193171, im: 0.131645108003206 },
			centerDecimal: { re: '-0.777807810193171', im: '0.131645108003206' },
			spanY: 0.0024,
			maxIterations: 1_100,
			paletteId: 'ember-field'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'satellite-minibrot',
		'A satellite copy',
		'mandelbrot-landmarks',
		'A tested small copy of the full silhouette embedded in a filamented neighbourhood.',
		'mandelbrot',
		{
			center: { re: -1.768778833, im: 0.001738996 },
			centerDecimal: { re: '-1.768778833', im: '0.001738996' },
			spanY: 0.00035,
			maxIterations: 1_400,
			paletteId: 'bone-and-soot'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'misiurewicz-region',
		'A Misiurewicz-region junction',
		'mandelbrot-landmarks',
		'A tested neighbourhood of a preperiodic-parameter junction with radiating filaments.',
		'mandelbrot',
		{
			center: { re: -0.10109636384562, im: 0.95628651080914 },
			centerDecimal: { re: '-0.10109636384562', im: '0.95628651080914' },
			spanY: 0.018,
			maxIterations: 1_000,
			paletteId: 'observatory'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'high-period-bulb',
		'A high-period bulb neighbourhood',
		'mandelbrot-landmarks',
		'A tested upper satellite cluster; the card does not assign an unverified exact period.',
		'mandelbrot',
		{
			center: { re: -0.15652, im: 1.03225 },
			centerDecimal: { re: '-0.15652', im: '1.03225' },
			spanY: 0.085,
			maxIterations: 900,
			paletteId: 'printers-proof'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'julia-unit-circle',
		'The unit-circle case',
		'julia-personalities',
		'With c = 0, the filled Julia set is the closed unit disk.',
		'julia',
		{
			juliaC: { re: 0, im: 0 },
			center: { re: 0, im: 0 },
			spanY: 2.6
		},
		{ openLinkedView: true }
	),
	makePreset(
		'julia-basilica',
		'The Basilica',
		'julia-personalities',
		'The period-two quadratic Julia set for c = −1.',
		'julia',
		{
			juliaC: { re: -1, im: 0 },
			center: { re: 0, im: 0 },
			spanY: 3
		},
		{ openLinkedView: true }
	),
	makePreset(
		'julia-rabbit-like',
		'The Douady rabbit parameter',
		'julia-personalities',
		'The positive-imaginary period-three parameter, checked against fᶜ³(0) = 0.',
		'julia',
		{
			juliaC: { re: -0.12256116687665362, im: 0.7448617666197442 },
			center: { re: 0, im: 0 },
			spanY: 3,
			maxIterations: 650
		},
		{
			openLinkedView: true,
			verificationNote:
				'Parameter numerically satisfies the primitive period-three critical-orbit polynomial; the deterministic Julia thumbnail was inspected.'
		}
	),
	makePreset(
		'julia-dendrite',
		'The i dendrite',
		'julia-personalities',
		'A dendritic quadratic Julia set with c = i.',
		'julia',
		{
			juliaC: { re: 0, im: 1 },
			center: { re: 0, im: 0 },
			spanY: 3.2
		},
		{ openLinkedView: true }
	),
	makePreset(
		'julia-minus-08-plus-0156i',
		'Intricacy at −0.8 + 0.156i',
		'julia-personalities',
		'An exact displayed parameter with a fine, near-dendritic boundary and small detached pieces.',
		'julia',
		{
			juliaC: { re: -0.8, im: 0.156 },
			center: { re: 0, im: 0 },
			spanY: 3.1,
			maxIterations: 720,
			paletteId: 'tram-brass'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'julia-disconnected-dust',
		'Disconnected Julia dust',
		'julia-personalities',
		'A parameter outside the Mandelbrot set whose filled Julia set separates into dust.',
		'julia',
		{
			juliaC: { re: 0.355, im: 0.355 },
			center: { re: 0, im: 0 },
			spanY: 3.2,
			maxIterations: 620,
			paletteId: 'printers-proof'
		},
		{ openLinkedView: true }
	),
	makePreset(
		'multibrot-cubic',
		'Turn the square into a cube',
		'related-escape-maps',
		'Degree three reorganises the entire parameter-space symmetry.',
		'multibrot',
		{
			exponent: 3,
			plane: 'parameter',
			center: { re: 0, im: 0 },
			spanY: 3
		}
	),
	makePreset(
		'multibrot-quintic',
		'Raise the power to five',
		'related-escape-maps',
		'Degree five produces the fourfold rotational symmetry expected of z⁵ + c.',
		'multibrot',
		{
			exponent: 5,
			plane: 'parameter',
			center: { re: 0, im: 0 },
			spanY: 2.8,
			maxIterations: 560,
			paletteId: 'algae'
		}
	),
	makePreset(
		'burning-ship-full',
		'The Burning Ship',
		'related-escape-maps',
		'The full mathematical orientation before any explicit presentation flip.',
		'burning-ship'
	),
	makePreset(
		'burning-ship-detail',
		'Burning Ship detail',
		'related-escape-maps',
		'A tested magnified fleet-like structure in the mathematical, unflipped orientation.',
		'burning-ship',
		{
			center: { re: -1.8613446669, im: -0.0072430108 },
			centerDecimal: { re: '-1.8613446669', im: '-0.0072430108' },
			spanY: 0.00072,
			maxIterations: 1_200,
			paletteId: 'ember-field'
		}
	),
	makePreset(
		'tricorn-full',
		'The Tricorn',
		'related-escape-maps',
		'The full antiholomorphic parameter set, also called the Mandelbar.',
		'tricorn'
	),
	makePreset(
		'phoenix-memory',
		'Phoenix remembers',
		'related-escape-maps',
		'A real-parameter Phoenix example for inspecting the previous-iterate term.',
		'phoenix',
		{
			juliaC: { re: 0.56667, im: 0 },
			phoenixP: { re: -0.5, im: 0 }
		}
	),
	makePreset(
		'newton-three-roots',
		'Newton’s three countries',
		'root-basins',
		'The convergence basins of z³ − 1.',
		'newton'
	),
	makePreset(
		'newton-four-roots',
		'Newton’s four countries',
		'root-basins',
		'The convergence basins of z⁴ − 1.',
		'newton',
		{
			polynomial: {
				coefficients: [
					{ re: 1, im: 0 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: -1, im: 0 }
				]
			}
		}
	),
	makePreset(
		'buddhabrot-ghost',
		'The ghost made by escape',
		'orbit-ghosts',
		'A seeded progressive orbit-density rendering of escaping Mandelbrot samples.',
		'buddhabrot'
	),
	makePreset(
		'nebulabrot-bands',
		'Nebulabrot traffic bands',
		'orbit-ghosts',
		'Three iteration windows separate short, medium and long escaping-orbit traffic.',
		'buddhabrot',
		{
			maxIterations: 1_200,
			density: {
				targetSamples: 420_000,
				exposure: 0.9,
				gamma: 0.62,
				iterationBands: [
					[12, 55],
					[55, 180],
					[180, 1_200]
				]
			}
		}
	),
	makePreset(
		'precision-cliff',
		'The ordinary-float precision cliff',
		'precision-demonstrations',
		'A tested Seahorse coordinate where the float grid has collapsed and extended mapping becomes visible.',
		'mandelbrot',
		{
			center: { re: -0.743643887037151, im: 0.13182590420533 },
			centerDecimal: {
				re: '-0.74364388703715100792301305236157',
				im: '0.13182590420532999943598128774412'
			},
			spanY: 2.4e-13,
			maxIterations: 1_400,
			precisionMode: 'double-single',
			paletteId: 'monsoon-ink',
			paletteCycles: 1.8
		},
		{
			verificationNote:
				'Exact decimal centre survives serialisation; the live deep view was checked with double-single diagnostics. The portable card image uses the same centre at a labelled parent scale because its build-time CPU renderer cannot claim that tier.'
		}
	),
	makePreset(
		'barnsley-fern',
		'Four photocopiers grow a fern',
		'recursive-cousins',
		'A seeded Barnsley affine system with transform identity visible.',
		'barnsley-fern'
	),
	makePreset(
		'sierpinski-two-roads',
		'Two roads to Sierpiński',
		'recursive-cousins',
		'Compare chaos-game visits with deterministic central-triangle removal.',
		'sierpinski'
	),
	makePreset(
		'koch-snowflake',
		'Koch snowflake',
		'recursive-cousins',
		'A bounded fourth-generation recursive snowflake.',
		'l-system',
		{ lSystem: lSystemState('koch-snowflake', 4) }
	),
	makePreset(
		'hilbert-room',
		'A curve learns to fill a room',
		'recursive-cousins',
		'A fifth-generation Hilbert curve with its segment budget known in advance.',
		'l-system',
		{ lSystem: lSystemState('hilbert-curve', 5) }
	)
] as const satisfies readonly AtlasPreset[];

export const PRESET_BY_ID: Readonly<Record<string, AtlasPreset>> = Object.freeze(
	Object.fromEntries(ATLAS_PRESETS.map((preset) => [preset.id, preset]))
);

export function getAtlasPreset(id: string): AtlasPreset | undefined {
	return PRESET_BY_ID[id];
}

export function createPresetState(id: string): FractalViewState {
	const preset = getAtlasPreset(id);
	if (!preset) return createFamilyDefaultState();
	return clonePresetState(preset.state);
}

function clonePresetState(state: FractalViewState): FractalViewState {
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
		customMap: state.customMap
			? {
					...state.customMap,
					memoryCoefficient: { ...state.customMap.memoryCoefficient }
				}
			: undefined,
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
