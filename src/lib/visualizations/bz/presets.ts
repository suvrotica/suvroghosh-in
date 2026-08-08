import { DEFAULT_OREGONATOR_SETUP, DEFAULT_SCHNAKENBERG_SETUP } from './constants';
import { scanSchnakenbergDispersion } from './stability';
import {
	BZ_SCHEMA_VERSION,
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	SCHNAKENBERG_EQUATIONS_ID,
	SCHNAKENBERG_MODEL_VERSION
} from './types';
import type {
	BZGuidedExperiment,
	BZIntervention,
	BZPreset,
	BZPresetDiagnostics,
	BZSetup,
	OregonatorSetup,
	SchnakenbergSetup
} from './types';

function oregonatorSetup(
	overrides: Partial<
		Omit<OregonatorSetup, 'parameters' | 'model' | 'modelVersion' | 'equationsId'>
	> & {
		readonly parameters?: Partial<OregonatorSetup['parameters']>;
	} = {}
): OregonatorSetup {
	return {
		...DEFAULT_OREGONATOR_SETUP,
		...overrides,
		model: 'oregonator',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters, ...overrides.parameters }
	};
}

function schnakenbergSetup(
	overrides: Partial<
		Omit<SchnakenbergSetup, 'parameters' | 'model' | 'modelVersion' | 'equationsId'>
	> & {
		readonly parameters?: Partial<SchnakenbergSetup['parameters']>;
	} = {}
): SchnakenbergSetup {
	return {
		...DEFAULT_SCHNAKENBERG_SETUP,
		...overrides,
		model: 'schnakenberg',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		parameters: { ...DEFAULT_SCHNAKENBERG_SETUP.parameters, ...overrides.parameters }
	};
}

const OREGONATOR_CAVEAT =
	'Dimensionless exhibit-calibrated candidate, not a reagent reconstruction. Dv = 0 follows common two-variable spatial practice; the requested generalized Dv term remains available as a raw control. Revalidate behaviour after changing grid, timestep, domain, or parameters.';
const TURING_CAVEAT =
	'Dimensionless exhibit candidate. Linear diffusion-driven instability is checked from the declared equilibrium and dispersion relation; the named nonlinear morphology and observation time still require deterministic field calibration before being labelled validated.';

function candidateDiagnostics(
	turingClassification: BZPresetDiagnostics['turingClassification'] = null
): BZPresetDiagnostics {
	return {
		validationStatus: 'candidate',
		finite: null,
		meanU: null,
		meanV: null,
		varianceU: null,
		varianceV: null,
		turingClassification,
		measuredWavelength: null,
		checksum: null
	};
}

const wellMixed = oregonatorSetup({
	diffusionU: 0,
	diffusionV: 0,
	gridSize: 64,
	initialCondition: 'uniform-clock',
	seed: 'well-mixed-clock-01'
});
const targetDish = oregonatorSetup({
	initialCondition: 'target-wave',
	seed: 'zhabotinsky-dish-01'
});
const brokenFront = oregonatorSetup({
	initialCondition: 'broken-front',
	seed: 'broken-front-spiral-01'
});
const collision = oregonatorSetup({
	initialCondition: 'paired-fronts',
	seed: 'collision-annihilation-01'
});
const imperfectDish = oregonatorSetup({
	initialCondition: 'heterogeneity',
	seed: 'imperfect-dish-01'
});
const pacemakerDish = oregonatorSetup({
	initialCondition: 'pacemaker',
	seed: 'pacemaker-under-glass-01'
});
const obstacleDish = oregonatorSetup({
	initialCondition: 'target-wave',
	maskPreset: 'central-obstacle',
	seed: 'obstacle-pinning-01'
});

const stableUniform = schnakenbergSetup({
	parameters: { a: 0.1, b: 0.9, gamma: 1 },
	diffusionU: 0.01,
	diffusionV: 0.01,
	initialCondition: 'uniform-equilibrium',
	seed: 'schnakenberg-stable-01'
});
const turingSpots = schnakenbergSetup({
	parameters: { a: 0.1, b: 0.9, gamma: 1 },
	diffusionU: 0.01,
	diffusionV: 0.1,
	initialCondition: 'turing-noise',
	seed: 'schnakenberg-spots-01'
});
const turingStripes = schnakenbergSetup({
	parameters: { a: 0.05, b: 1, gamma: 1 },
	diffusionU: 0.01,
	diffusionV: 0.1,
	initialCondition: 'turing-noise',
	seed: 'schnakenberg-stripes-01'
});
const turingLabyrinth = schnakenbergSetup({
	parameters: { a: 0.06, b: 0.98, gamma: 1 },
	diffusionU: 0.01,
	diffusionV: 0.1,
	initialCondition: 'turing-noise',
	seed: 'schnakenberg-labyrinth-01'
});

export const BZ_PRESETS: readonly BZPreset[] = Object.freeze([
	{
		id: 'well-mixed-clock',
		title: 'Well-Mixed Chemical Clock',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: wellMixed,
		palette: 'ferroin',
		calibrationModelTime: 8,
		expectedQualitativeBehaviour:
			'All active cells remain identical while the local Oregonator trajectory approaches temporal oscillation.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'zhabotinsky-dish',
		title: 'One Finite Outward Front',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: targetDish,
		palette: 'ferroin',
		calibrationModelTime: 8,
		expectedQualitativeBehaviour:
			'A finite central excitation should launch radial travelling fronts through recovered medium.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'broken-front-spiral',
		title: 'A Broken Front Becomes a Spiral',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: brokenFront,
		palette: 'phase-spectrum',
		calibrationModelTime: 12,
		expectedQualitativeBehaviour:
			'The finite excited segment supplies free wave ends that are candidates for curling spiral cores.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'collision-annihilation',
		title: 'Collision and Annihilation',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: collision,
		palette: 'ferroin',
		calibrationModelTime: 8,
		expectedQualitativeBehaviour:
			'Opposing fronts should meet in refractory material and extinguish rather than transmit.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'imperfect-dish',
		title: 'Imperfect Dish',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: imperfectDish,
		palette: 'cerium',
		calibrationModelTime: 8,
		expectedQualitativeBehaviour:
			'Seeded low-amplitude heterogeneity perturbs timing reproducibly without changing model parameters.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'pacemaker-under-glass',
		title: 'Pacemaker Under Glass',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: pacemakerDish,
		palette: 'ferroin',
		calibrationModelTime: 8,
		expectedQualitativeBehaviour:
			'A declared periodic local source should emit successive target-wave candidates.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'obstacle-and-pinning',
		title: 'Obstacle and Pinning',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		setup: obstacleDish,
		palette: 'high-contrast',
		calibrationModelTime: 10,
		expectedQualitativeBehaviour:
			'Travelling activity meets an explicitly impermeable, no-flux central obstacle.',
		diagnostics: candidateDiagnostics(),
		caveat: OREGONATOR_CAVEAT
	},
	{
		id: 'stable-uniform-state',
		title: 'Stable Uniform State',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		setup: stableUniform,
		palette: 'scientific',
		calibrationModelTime: 120,
		expectedQualitativeBehaviour:
			'Equal diffusivities leave the linearly stable homogeneous reaction equilibrium without a growing spatial mode.',
		diagnostics: candidateDiagnostics(scanSchnakenbergDispersion(stableUniform).classification),
		caveat: TURING_CAVEAT
	},
	{
		id: 'diffusion-driven-spots',
		title: 'Diffusion-Driven Spots',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		setup: turingSpots,
		palette: 'scientific',
		calibrationModelTime: 300,
		expectedQualitativeBehaviour:
			'A stable reaction equilibrium has a resolved nonzero growing band; nonlinear spot morphology is the calibration target.',
		diagnostics: candidateDiagnostics(scanSchnakenbergDispersion(turingSpots).classification),
		caveat: TURING_CAVEAT
	},
	{
		id: 'diffusion-driven-stripes',
		title: 'Diffusion-Driven Stripes',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		setup: turingStripes,
		palette: 'scientific',
		calibrationModelTime: 300,
		expectedQualitativeBehaviour:
			'A stable reaction equilibrium has a resolved nonzero growing band; nonlinear stripe morphology is the calibration target.',
		diagnostics: candidateDiagnostics(scanSchnakenbergDispersion(turingStripes).classification),
		caveat: TURING_CAVEAT
	},
	{
		id: 'labyrinth',
		title: 'Labyrinth',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		setup: turingLabyrinth,
		palette: 'scientific',
		calibrationModelTime: 300,
		expectedQualitativeBehaviour:
			'A resolved diffusion-driven band should amplify noise; labyrinth morphology remains an explicit nonlinear calibration target.',
		diagnostics: candidateDiagnostics(scanSchnakenbergDispersion(turingLabyrinth).classification),
		caveat: TURING_CAVEAT
	}
]);

export const BZ_PRESET_BY_ID: ReadonlyMap<string, BZPreset> = new Map(
	BZ_PRESETS.map((preset) => [preset.id, preset])
);

export function getBZPreset(id: string): BZPreset {
	const preset = BZ_PRESET_BY_ID.get(id);
	if (!preset) throw new RangeError(`Unknown BZ preset: ${id}`);
	return preset;
}

function rawParameters(setup: Readonly<BZSetup>): Readonly<Record<string, number>> {
	return setup.model === 'oregonator'
		? {
				epsilon: setup.parameters.epsilon,
				q: setup.parameters.q,
				f: setup.parameters.f,
				D_u: setup.diffusionU,
				D_v: setup.diffusionV
			}
		: {
				a: setup.parameters.a,
				b: setup.parameters.b,
				gamma: setup.parameters.gamma,
				D_u: setup.diffusionU,
				D_v: setup.diffusionV
			};
}

function guide(
	id: string,
	title: string,
	question: string,
	preset: BZPreset,
	lookFor: string,
	whatHappened: string,
	activeTerms: BZGuidedExperiment['activeTerms'],
	interventions: readonly BZIntervention[] = []
): BZGuidedExperiment {
	return {
		id,
		title,
		question,
		presetId: preset.id,
		initialCondition: preset.setup.initialCondition,
		model: preset.setup.model,
		rawParameters: rawParameters(preset.setup),
		grid: preset.setup.gridSize,
		domainSize: preset.setup.domainSize,
		timestep: preset.setup.timestep,
		boundary: preset.setup.boundary,
		seed: preset.setup.seed,
		observationTime: preset.calibrationModelTime,
		activeTerms,
		lookFor,
		whatHappened,
		interventions,
		caveat: preset.caveat
	};
}

const preset = (id: string): BZPreset => getBZPreset(id);
const pacemaker: BZIntervention = {
	schemaVersion: BZ_SCHEMA_VERSION,
	sequence: 0,
	step: 0,
	kind: 'pacemaker',
	center: [0.5, 0.5],
	radius: 0.045,
	amount: 0.45,
	periodSteps: 2_000,
	endStep: 16_000
};
const stir: BZIntervention = {
	schemaVersion: BZ_SCHEMA_VERSION,
	sequence: 0,
	step: 8_000,
	kind: 'mix',
	fraction: 1
};

export const BZ_GUIDED_EXPERIMENTS: readonly BZGuidedExperiment[] = Object.freeze([
	guide(
		'well-mixed-clock',
		'01. The Well-Mixed Clock',
		'How can chemistry return repeatedly without returning to equilibrium?',
		preset('well-mixed-clock'),
		'Look for every active cell following the same u(t), v(t) trajectory.',
		'Spatial variance remains at round-off scale; any continuing change is local reaction kinetics, not movement of pixels.',
		['reaction']
	),
	guide(
		'clock-enters-space',
		'02. The Clock Enters Space',
		'What changes when neighbouring locations are allowed to disagree?',
		preset('pacemaker-under-glass'),
		'Look for successive radial fronts and a recovery wake behind each front.',
		'Diffusion couples nearby states while the Oregonator kinetics determine excitation and recovery.',
		['reaction', 'diffusion', 'intervention'],
		[pacemaker]
	),
	guide(
		'break-front',
		'03. Break a Front; Make a Spiral',
		'Why does an unfinished wave edge curl rather than simply heal?',
		preset('broken-front-spiral'),
		'Look for the free end of the finite front turning into recovered medium.',
		'The broken-front field is a reproducible candidate seed; persistence of a rotating core is a stated calibration test, not a prerecorded effect.',
		['reaction', 'diffusion']
	),
	guide(
		'collision',
		'04. Collision Without Passing Through',
		'Why do chemical waves behave unlike water waves?',
		preset('collision-annihilation'),
		'Look where the two fronts meet and whether excitation reappears beyond the collision.',
		'Each front leaves refractory state behind, so transmission through the collision is the falsifying outcome to check.',
		['reaction', 'diffusion']
	),
	guide(
		'stir-dish',
		'05. Stir the Dish',
		'Does stirring stop the clock, or merely erase its geography?',
		preset('zhabotinsky-dish'),
		'Compare active-area means and variances immediately before and after model step 8,000.',
		'The explicit approximate-homogenization event preserves means within floating tolerance while collapsing spatial variance; chemistry then continues.',
		['reaction', 'diffusion', 'intervention'],
		[stir]
	),
	guide(
		'bz-versus-turing',
		'06. BZ Wave versus Turing Morphology',
		'What exactly is shared by these systems, and what is not?',
		preset('diffusion-driven-spots'),
		'Compare a travelling BZ front with the nonzero growing band and finite wavelength predicted here.',
		'The Schnakenberg equilibrium is reaction-stable but diffusion-unstable; this is a different diagnostic from an excitable Oregonator front.',
		['reaction', 'diffusion']
	)
]);
