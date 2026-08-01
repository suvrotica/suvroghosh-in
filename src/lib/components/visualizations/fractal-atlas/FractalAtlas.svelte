<script lang="ts">
	import Decimal from 'decimal.js';
	import { onMount, untrack } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FractalCanvas from './FractalCanvas.svelte';
	import FamilyPassport from './FamilyPassport.svelte';
	import OrbitInspector from './OrbitInspector.svelte';
	import PaletteLab from './PaletteLab.svelte';
	import PrecisionMeter from './PrecisionMeter.svelte';
	import {
		createFamilyDefaultState,
		getFamilyDefinition,
		isEscapeTimeFamily
	} from '$lib/visualizations/fractal-atlas/families';
	import {
		cloneCustomMapRecipe,
		customMapFormula,
		identifyCustomMap,
		normalizeCustomMapRecipe
	} from '$lib/visualizations/fractal-atlas/custom-map';
	import {
		expandLSystemState,
		getLSystemPreset,
		LSYSTEM_PRESETS,
		LSYSTEM_SVG_SEGMENT_LIMIT,
		parseProductionRules,
		validateLSystemDefinition
	} from '$lib/visualizations/fractal-atlas/lsystem';
	import { iterateEscapeOrbit, iterateNewton } from '$lib/visualizations/fractal-atlas/math';
	import {
		ATLAS_PRESETS,
		createPresetState,
		getAtlasPreset
	} from '$lib/visualizations/fractal-atlas/presets';
	import { getPalette } from '$lib/visualizations/fractal-atlas/palettes';
	import {
		createFractalPngExportPlan,
		exportFractalPng,
		PNG_EXPORT_RASTER_FAMILIES,
		type FractalPngCaption,
		type FractalPngExportPlan
	} from '$lib/visualizations/fractal-atlas/png-export';
	import { recursiveSierpinskiTriangles } from '$lib/visualizations/fractal-atlas/recursive';
	import type { WebGLPrecisionDiagnostics } from '$lib/visualizations/fractal-atlas/render/webgl';
	import {
		changeStateFamily,
		cloneFractalState,
		normalizeFractalState,
		parseFractalState,
		parseLocalState,
		serializeFractalState,
		serializeLocalState
	} from '$lib/visualizations/fractal-atlas/state';
	import type {
		ColoringMode,
		ComplexValue,
		CustomMapInitialZRule,
		CustomMapRecipe,
		AtlasPreset,
		DecimalComplexValue,
		FractalFamily,
		FractalViewState,
		RenderQuality
	} from '$lib/visualizations/fractal-atlas/types';
	import { zoomViewport } from '$lib/visualizations/fractal-atlas/viewport';

	type Panel = 'explore' | 'inspect' | 'colour' | 'formula' | 'precision' | 'presets' | 'export';
	type AtlasPath = `/blog/visualizations/the-fractal-atlas${string}`;
	type CanvasHandle = {
		pauseProgressive(): void;
		runProgressive(): void;
		stepProgressive(): void;
		restartProgressive(): void;
		pngBlob(caption?: FractalPngCaption): Promise<Blob | null>;
		cssSize(): { width: number; height: number };
		focus(): void;
	};
	type PngResolution = 'current' | '1x' | '2x' | '4x' | 'custom';
	type SavedSpecimen = {
		id: string;
		name: string;
		savedAt: string;
		state: string;
		selected: ComplexValue;
		selectedDecimal?: DecimalComplexValue;
		lab?: {
			comparisonState: string;
			linkedJulia: boolean;
			showGrid: boolean;
			compareMode: boolean;
			linkComparisonViewport: boolean;
			linkComparisonColour: boolean;
			linkComparisonIterations: boolean;
			compareSplit: number;
			compareSplitLocked: boolean;
			parameterA: ComplexValue;
			parameterB: ComplexValue;
			parameterADecimal?: DecimalComplexValue;
			parameterBDecimal?: DecimalComplexValue;
			parameterPathOpen?: boolean;
			parameterPathSampleCount?: number;
			parameterPathIndex?: number;
			showMandelbrotLandmarks?: boolean;
			showMultibrotSymmetry?: boolean;
			sierpinskiMode?: 'recursive' | 'chaos' | 'overlay';
			activePanel: Panel;
		};
	};
	type AtlasCommand = {
		preset?: string;
		family?: FractalFamily;
		exponent?: number;
		coloring?: ColoringMode;
		panel?: 'orbit' | 'colour' | 'precision' | 'presets';
		action?: 'step' | 'tour' | 'enter';
	};
	type GuidedExperiment = {
		id: string;
		title: string;
		question: string;
		preset: string;
		panel: Panel;
		inspect: string;
		expected: string;
		caveat: string;
		patch?: Partial<
			Pick<FractalViewState, 'maxIterations' | 'coloring' | 'exponent' | 'precisionMode'>
		>;
		comparisonPreset?: string;
	};
	type GuidedMode = 'none' | 'three-fates' | 'power' | 'mirror' | 'ghost' | 'tiny-change';
	type GuidedOrbitSample = {
		label: string;
		point: ComplexValue;
		certificate?: string;
	};

	const STORAGE_KEY = 'fractal-atlas-specimens-v1';
	const MAX_SPECIMENS = 20;
	const NOSCRIPT_FALLBACK = `<noscript>
		<style>.atlas-js { display: none !important; }</style>
		<div class="no-script-atlas">
			<img
				src="/images/fractal-atlas.png"
				alt="A dark Mandelbrot form with violet, brass and blue filaments and a linked Julia specimen lens"
				width="1600"
				height="900"
			/>
			<div>
				<p>Static field plate</p>
				<h2>The Fractal Atlas requires JavaScript for numerical navigation.</h2>
				<p>
					The article, formulas and finite-computation cautions remain available. Enable JavaScript
					to run the WebGL, Canvas and Worker instruments.
				</p>
			</div>
		</div>
	</noscript>`;
	const ATLAS_QUERY_KEYS = [
		'v',
		'f',
		'p',
		'x',
		'y',
		'xd',
		'yd',
		's',
		'r',
		'it',
		'b',
		'd',
		'jr',
		'ji',
		'jrd',
		'jid',
		'pr',
		'pi',
		'pzr',
		'pzi',
		'lam',
		'col',
		'pal',
		'po',
		'pc',
		'inside',
		'seed',
		'q',
		'prec',
		'flip',
		'analytic',
		'tol',
		'stops',
		'trap',
		'poly',
		'ifs',
		'ls',
		'density',
		'map',
		'sr',
		'si',
		'srd',
		'sid',
		'lj',
		'grid',
		'cmp',
		'cv',
		'cc',
		'ci',
		'cs',
		'cl',
		'ar',
		'ai',
		'ard',
		'aid',
		'br',
		'bi',
		'brd',
		'bid',
		'path',
		'pn',
		'px',
		'card',
		'sym',
		'sier',
		'ui'
	] as const;
	const PANEL_LABELS: ReadonlyArray<{ id: Panel; label: string; short: string }> = [
		{ id: 'explore', label: 'Explore', short: 'Map' },
		{ id: 'inspect', label: 'Orbit inspector', short: 'Orbit' },
		{ id: 'colour', label: 'Palette laboratory', short: 'Colour' },
		{ id: 'formula', label: 'Formula controls', short: 'Rule' },
		{ id: 'precision', label: 'Precision meter', short: 'Limits' },
		{ id: 'presets', label: 'Field expeditions', short: 'Trips' },
		{ id: 'export', label: 'Save and export', short: 'Export' }
	];
	const FAMILY_GROUPS: ReadonlyArray<{
		label: string;
		families: ReadonlyArray<{ id: FractalFamily; label: string }>;
	}> = [
		{
			label: 'Quadratic pair',
			families: [
				{ id: 'mandelbrot', label: 'Mandelbrot' },
				{ id: 'julia', label: 'Julia' }
			]
		},
		{
			label: 'Altered recurrence',
			families: [
				{ id: 'multibrot', label: 'Multibrot' },
				{ id: 'burning-ship', label: 'Burning Ship' },
				{ id: 'tricorn', label: 'Tricorn' },
				{ id: 'phoenix', label: 'Phoenix' },
				{ id: 'custom-map', label: 'Map Workshop' }
			]
		},
		{
			label: 'Convergence',
			families: [{ id: 'newton', label: 'Newton' }]
		},
		{
			label: 'Orbit traffic',
			families: [{ id: 'buddhabrot', label: 'Buddhabrot' }]
		},
		{
			label: 'Recursive cousins',
			families: [
				{ id: 'barnsley-fern', label: 'Barnsley fern' },
				{ id: 'sierpinski', label: 'Sierpiński' },
				{ id: 'l-system', label: 'L-systems' }
			]
		}
	];
	const TOUR_STEPS = [
		{
			title: 'Every pixel supplies a question',
			copy: 'The Mandelbrot plane lets each pixel choose c while z₀ remains zero.',
			preset: 'mandelbrot-full'
		},
		{
			title: 'Feedback writes the itinerary',
			copy: 'Select a boundary point. Its repeated values become a numerical orbit.',
			preset: 'across-the-boundary'
		},
		{
			title: 'One law, an entire dynamical plane',
			copy: 'Pin c in the Mandelbrot plane and the companion Julia plane uses it everywhere.',
			preset: 'linked-rabbit'
		},
		{
			title: 'One changed operation, new geography',
			copy: 'A cubic Multibrot changes the symmetry without changing the feedback principle.',
			preset: 'multibrot-cubic'
		},
		{
			title: 'Convergence instead of escape',
			copy: 'Newton’s method colours starting guesses by the root they reach.',
			preset: 'newton-three-roots'
		},
		{
			title: 'Escaping orbits leave traffic',
			copy: 'Buddhabrot accumulates the routes of sampled orbits that eventually escape.',
			preset: 'buddhabrot-ghost'
		},
		{
			title: 'A cousin built by affine choices',
			copy: 'The Barnsley fern grows from one seeded sequence of four small transformations.',
			preset: 'barnsley-fern'
		},
		{
			title: 'Arithmetic eventually loses the map',
			copy: 'The precision stop makes coordinate collapse visible and identifies the active arithmetic tier.',
			preset: 'precision-cliff'
		}
	] as const;
	const GUIDED_EXPERIMENTS: readonly GuidedExperiment[] = [
		{
			id: 'three-fates',
			title: 'Three fates',
			question: 'How do escaping, analytically certified and unresolved points differ?',
			preset: 'boundary-probe',
			panel: 'inspect',
			inspect:
				'Pin points outside, inside and immediately beside the boundary; compare their orbit rows.',
			expected:
				'The escaping orbit crosses the bailout; the interior test can certify only special regions; a boundary-near point may remain unresolved.',
			caveat: 'A finite unresolved orbit is not proof that the point belongs to the set.'
		},
		{
			id: 'one-point-two-worlds',
			title: 'One point, two worlds',
			question: 'What changes when one Mandelbrot parameter becomes a Julia law?',
			preset: 'linked-rabbit',
			panel: 'explore',
			inspect:
				'Move the selected c marker across the boundary and watch the companion dynamical plane.',
			expected:
				'Small parameter changes can reorganise the Julia plane while the quadratic recurrence stays fixed.',
			caveat: 'A rendered transition is numerical evidence, not a proof of connectedness.'
		},
		{
			id: 'more-iterations',
			title: 'More iterations, not more truth',
			question: 'Which pixels change when the finite stopping rule is extended?',
			preset: 'across-the-boundary',
			panel: 'explore',
			patch: { maxIterations: 2_000 },
			inspect: 'Use Undo to compare the 2,000-step field with the preset’s lower iteration count.',
			expected:
				'Some slow-escaping pixels resolve; many already classified pixels remain unchanged.',
			caveat: 'A larger finite cap still does not settle every non-escaping pixel.'
		},
		{
			id: 'four-colours',
			title: 'Four colours, one calculation',
			question: 'How much of a fractal image belongs to its numerical encoding?',
			preset: 'seahorse-valley',
			panel: 'colour',
			inspect:
				'Try raw bands, smooth escape, distance shading and an orbit trap without moving the view.',
			expected: 'The geometry stays fixed while contour emphasis and apparent texture change.',
			caveat: 'A palette boundary is not automatically a mathematical boundary.'
		},
		{
			id: 'power-symmetry',
			title: 'A power changes the symmetry',
			question: 'What does replacing z² with z³ do to parameter space?',
			preset: 'multibrot-cubic',
			panel: 'formula',
			inspect:
				'Change the bounded integer exponent through 2, 3, 4 and 5 while watching the formula.',
			expected: 'The rotational organisation changes with the degree.',
			caveat: 'This recipe intentionally excludes ambiguous non-integer complex powers.'
		},
		{
			id: 'mirror-mathematics',
			title: 'Add a mirror to the mathematics',
			question: 'How do conjugation and componentwise absolute value alter one feedback rule?',
			preset: 'burning-ship-full',
			panel: 'formula',
			comparisonPreset: 'tricorn-full',
			inspect: 'Compare the displayed Burning Ship and Tricorn recurrences with a linked viewport.',
			expected:
				'Closely related-looking formulas generate different symmetry and boundary structure.',
			caveat: 'The Burning Ship presentation flip is separate from its recurrence.'
		},
		{
			id: 'newton-divides',
			title: 'Newton divides the plane',
			question: 'How can convergence to three roots partition starting guesses?',
			preset: 'newton-three-roots',
			panel: 'inspect',
			inspect:
				'Probe either side of a basin boundary and compare root, residual and convergence path.',
			expected:
				'Nearby starts can converge to different roots, with slower convergence near intricate boundaries.',
			caveat:
				'The tolerance and iteration cap make every displayed basin a finite numerical classification.'
		},
		{
			id: 'draw-ghosts',
			title: 'Draw the ghosts',
			question: 'What image appears when escaping routes, rather than parameters, receive the ink?',
			preset: 'buddhabrot-ghost',
			panel: 'explore',
			inspect: 'Pause, add one seeded batch, then resume and watch the sample counters.',
			expected:
				'A reproducible density field emerges progressively from accumulated orbit traffic.',
			caveat: 'This is a sampled encoding of trajectories, not a photograph or a membership plot.'
		},
		{
			id: 'arithmetic-edge',
			title: 'Where arithmetic reaches its edge',
			question: 'When does a screen pixel become smaller than the active coordinate arithmetic?',
			preset: 'precision-cliff',
			panel: 'precision',
			inspect:
				'Compare ordinary and extended diagnostics, then find the published numeric ceiling.',
			expected:
				'The meter detects coordinate collapse and shows the increased cost and useful scale of each published tier.',
			caveat:
				'No browser mode supplies infinite zoom; screen, iteration and arithmetic limits remain distinct.'
		},
		{
			id: 'tiny-change',
			title: 'Tiny change, different journey',
			question:
				'How differently can two nearby parameters organise their Julia planes and critical orbits?',
			preset: 'mandelbrot-full',
			panel: 'inspect',
			inspect:
				'Compare the two Julia panes, then use the A/B critical-orbit table to inspect their escape histories.',
			expected:
				'A small Δc can produce conspicuously different dynamical structure and orbit timing near a boundary.',
			caveat:
				'One nearby pair demonstrates sensitivity; it does not assign the same behaviour to every boundary neighbourhood.'
		}
	];
	const COLOUR_COSTUMES: ReadonlyArray<{ mode: ColoringMode; label: string }> = [
		{ mode: 'bands', label: 'Raw escape bands' },
		{ mode: 'smooth', label: 'Smooth escape' },
		{ mode: 'distance', label: 'Distance estimate' },
		{ mode: 'orbit-trap', label: 'Orbit trap' }
	];

	let laboratory: HTMLElement;
	let mainCanvas: CanvasHandle | null = null;
	let mainState = $state<FractalViewState>(createPresetState('mandelbrot-full'));
	let comparisonState = $state<FractalViewState>(createPresetState('tricorn-full'));
	let selectedPoint = $state<ComplexValue>({ re: -0.123, im: 0.745 });
	let selectedPointDecimal = $state<DecimalComplexValue>({ re: '-0.123', im: '0.745' });
	let parameterA = $state<ComplexValue>({ re: -0.123, im: 0.745 });
	let parameterB = $state<ComplexValue>({ re: -0.124, im: 0.744 });
	let parameterADecimal = $state<DecimalComplexValue>({ re: '-0.123', im: '0.745' });
	let parameterBDecimal = $state<DecimalComplexValue>({ re: '-0.124', im: '0.744' });
	let parameterPathOpen = $state(false);
	let parameterPathSampleCount = $state(7);
	let parameterPathIndex = $state(0);
	let parameterPathPlaying = $state(false);
	let parameterPathTimer: ReturnType<typeof setInterval> | null = null;
	let showMandelbrotLandmarks = $state(false);
	let showMultibrotSymmetry = $state(false);
	let sierpinskiMode = $state<'recursive' | 'chaos' | 'overlay'>('overlay');
	let lSystemGrowthPlaying = $state(false);
	let lSystemGrowthTarget = $state(0);
	let lSystemGrowthTimer: ReturnType<typeof setInterval> | null = null;
	let hoverPoint = $state<ComplexValue | null>(null);
	let hoverPointDecimal = $state<DecimalComplexValue | null>(null);
	let activePanel = $state<Panel>('explore');
	let linkedJulia = $state(true);
	let compareMode = $state(false);
	let linkComparisonViewport = $state(true);
	let linkComparisonColour = $state(true);
	let linkComparisonIterations = $state(true);
	let compareSplit = $state(50);
	let compareSplitLocked = $state(false);
	let guidedMode = $state<GuidedMode>('none');
	let guidedOrbitSamples = $state<GuidedOrbitSample[]>([]);
	let ghostOrbit = $state<ComplexValue[]>([]);
	let ghostParameter = $state<ComplexValue | null>(null);
	let showGrid = $state(true);
	let backend = $state('preparing');
	let hydrated = $state(false);
	let precisionDiagnostics = $state<WebGLPrecisionDiagnostics | null>(null);
	let status = $state('Preparing the atlas instruments…');
	let renderStatus = $state('Preparing a bounded renderer…');
	let progress = $state(0);
	let progressLabel = $state('');
	let progressCountLabel = $state('');
	let undoStack = $state<FractalViewState[]>([]);
	let redoStack = $state<FractalViewState[]>([]);
	let specimens = $state<SavedSpecimen[]>([]);
	let specimenName = $state('');
	let tourOpen = $state(false);
	let tourIndex = $state(0);
	let tourDialog = $state<HTMLDialogElement | null>(null);
	let tourReturnFocus: HTMLElement | null = null;
	let tourOrigin: {
		state: FractalViewState;
		selected: ComplexValue;
		selectedDecimal: DecimalComplexValue;
		linked: boolean;
	} | null = null;
	let flash = $state(false);
	let fullscreen = $state(false);
	let fullscreenReturnFocus: HTMLElement | null = null;
	let reducedMotion = $state(false);
	let mobileLayout = $state(false);
	let activePlane = $state<'primary' | 'companion'>('primary');
	let stateWarnings = $state<string[]>([]);
	let urlTimer: ReturnType<typeof setTimeout> | null = null;
	let liveHistoryOrigin: AtlasPath | null = null;
	let historyReady = false;
	let restoringHistory = false;
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let pngResolution = $state<PngResolution>('current');
	let customPngWidth = $state(2400);
	let customPngHeight = $state(1600);
	let includePngCaption = $state(false);
	let pngExporting = $state(false);
	let pngExportProgress = $state(0);
	let pngExportStatus = $state('Ready to export the visible composed canvas.');
	let pngExportError = $state('');
	let pngExportPlan = $state<FractalPngExportPlan | null>(null);
	let pngExportController: AbortController | null = null;
	let mainCanvasMetrics = $state({ width: 900, height: 600, devicePixelRatio: 1 });

	let family = $derived(getFamilyDefinition(mainState.family));
	let activeCustomMap = $derived(
		mainState.family === 'custom-map' ? cloneCustomMapRecipe(mainState.customMap) : null
	);
	let customMapIdentity = $derived(
		activeCustomMap && (mainState.plane === 'parameter' || mainState.plane === 'dynamical')
			? identifyCustomMap(activeCustomMap, mainState.plane)
			: null
	);
	let activeFamilyName = $derived(customMapIdentity?.label ?? family.passport.name);
	let activeFormula = $derived(
		activeCustomMap && (mainState.plane === 'parameter' || mainState.plane === 'dynamical')
			? customMapFormula(activeCustomMap, mainState.plane).full
			: family.passport.formula
	);
	let pngCaption = $derived<FractalPngCaption>({
		title: 'The Fractal Atlas: A Field Guide to Infinity',
		formula: `${activeFamilyName} · ${activeFormula}`,
		coordinate: `centre ${decimalComplexLabel(mainState.center, mainState.centerDecimal)} · vertical span ${mainState.spanY.toExponential(12)}`
	});
	let zoomBreadcrumb = $derived.by(() => {
		const defaultState = createFamilyDefaultState(mainState.family);
		const atDefault =
			mainState.center.re === defaultState.center.re &&
			mainState.center.im === defaultState.center.im &&
			mainState.spanY === defaultState.spanY &&
			mainState.rotation === defaultState.rotation;
		const candidates = atDefault
			? [mainState]
			: [...undoStack, mainState].filter((state) => state.family === mainState.family);
		const unique: FractalViewState[] = [];
		for (const state of candidates) {
			const previous = unique.at(-1);
			if (!previous || previous.spanY !== state.spanY) unique.push(state);
		}
		return unique.slice(-4).map((state) => ({
			state,
			label: zoomMagnificationLabel(state, defaultState.spanY)
		}));
	});
	let linkedParameter = $derived(hoverPoint ?? selectedPoint);
	let linkedParameterDecimal = $derived(hoverPointDecimal ?? selectedPointDecimal);
	let linkedJuliaState = $derived.by(() => {
		const next = createFamilyDefaultState('julia');
		next.juliaC = { ...linkedParameter };
		next.juliaCDecimal = { ...linkedParameterDecimal };
		next.paletteId = mainState.paletteId;
		next.customPalette = mainState.customPalette?.map((stop) => ({ ...stop }));
		next.paletteOffset = mainState.paletteOffset;
		next.paletteCycles = mainState.paletteCycles;
		next.coloring =
			mainState.coloring === 'root-basin' || mainState.coloring === 'density'
				? 'smooth'
				: mainState.coloring;
		next.maxIterations = Math.min(650, mainState.maxIterations);
		next.renderQuality = hoverPoint ? 'draft' : mainState.renderQuality;
		return next;
	});
	let displayedComparison = $derived.by(() => {
		const next = cloneFractalState(comparisonState);
		if (linkComparisonViewport) {
			next.center = { ...mainState.center };
			next.centerDecimal = mainState.centerDecimal ? { ...mainState.centerDecimal } : undefined;
			next.spanY = mainState.spanY;
			next.rotation = mainState.rotation;
		}
		if (linkComparisonColour) {
			next.paletteId = mainState.paletteId;
			next.customPalette = mainState.customPalette?.map((stop) => ({ ...stop }));
			next.paletteOffset = mainState.paletteOffset;
			next.paletteCycles = mainState.paletteCycles;
			if (isEscapeTimeFamily(next.family) && isEscapeTimeFamily(mainState.family)) {
				next.coloring = mainState.coloring;
			}
		}
		if (linkComparisonIterations) next.maxIterations = mainState.maxIterations;
		return normalizeFractalState(next, next.family).state;
	});
	let orbitResult = $derived.by(() => {
		try {
			if (mainState.family === 'newton' && mainState.polynomial) {
				return iterateNewton(selectedPoint, mainState.polynomial, {
					maxIterations: mainState.maxIterations,
					convergenceTolerance: mainState.convergenceTolerance,
					relaxation: mainState.newtonRelaxation,
					recordOrbit: true,
					maxRecordedPoints: 1_000
				});
			}
			if (isEscapeTimeFamily(mainState.family)) {
				return iterateEscapeOrbit({
					family: mainState.family,
					plane: mainState.plane,
					pixel: selectedPoint,
					pixelDecimal: selectedPointDecimal,
					c: mainState.juliaC,
					cDecimal: mainState.juliaCDecimal,
					exponent: mainState.exponent,
					phoenixP: mainState.phoenixP,
					previous: mainState.phoenixPrevious,
					customMap: mainState.customMap,
					maxIterations: Math.min(20_000, mainState.maxIterations),
					bailout: mainState.bailout,
					recordOrbit: true,
					maxRecordedPoints: 2_000
				});
			}
		} catch {
			return null;
		}
		return null;
	});
	let progressiveFamily = $derived(
		mainState.family === 'buddhabrot' || mainState.family === 'barnsley-fern'
	);
	let buddhabrotConfidence = $derived.by(() => {
		const candidateMatch = progressLabel.match(/([\d,]+)\s+candidates/u);
		const acceptedMatch = progressLabel.match(/([\d,]+)\s+accepted/u);
		const candidates = Number(candidateMatch?.[1]?.replaceAll(',', '') ?? 0);
		const accepted = Number(acceptedMatch?.[1]?.replaceAll(',', '') ?? 0);
		const proxy = candidates > 0 ? 1 / Math.sqrt(candidates) : 1;
		const level =
			progress >= 0.85
				? 'high global confidence'
				: progress >= 0.35
					? 'settling'
					: progress > 0
						? 'visibly noisy'
						: 'awaiting samples';
		return {
			candidates,
			accepted,
			level,
			proxyPercent: proxy * 100
		};
	});
	let hasCompanion = $derived(
		compareMode || (mainState.family === 'mandelbrot' && linkedJulia && !compareMode)
	);
	let companionTabLabel = $derived(
		compareMode
			? `B · ${getFamilyDefinition(displayedComparison.family).passport.name}`
			: 'Linked Julia'
	);
	let pointerCoordinate = $derived(hoverPoint ?? selectedPoint);
	let pointerCoordinateDecimal = $derived(hoverPointDecimal ?? selectedPointDecimal);
	let parameterDelta = $derived({
		re: parameterB.re - parameterA.re,
		im: parameterB.im - parameterA.im
	});
	let parameterDeltaDecimal = $derived.by(() => {
		try {
			const DecimalType = Decimal.clone({ precision: 170 });
			const re = new DecimalType(parameterBDecimal.re).minus(parameterADecimal.re);
			const im = new DecimalType(parameterBDecimal.im).minus(parameterADecimal.im);
			return {
				re: re.toString(),
				im: im.toString(),
				magnitude: re.times(re).plus(im.times(im)).sqrt().toString()
			};
		} catch {
			return {
				re: parameterDelta.re.toString(),
				im: parameterDelta.im.toString(),
				magnitude: Math.hypot(parameterDelta.re, parameterDelta.im).toString()
			};
		}
	});
	let parameterPathSamples = $derived.by(() => {
		const count = Math.max(5, Math.min(9, Math.round(parameterPathSampleCount)));
		const DecimalType = Decimal.clone({ precision: 170 });
		try {
			const aRe = new DecimalType(parameterADecimal.re);
			const aIm = new DecimalType(parameterADecimal.im);
			const deltaRe = new DecimalType(parameterBDecimal.re).minus(aRe);
			const deltaIm = new DecimalType(parameterBDecimal.im).minus(aIm);
			return Array.from({ length: count }, (_, index) => {
				const t = new DecimalType(index).div(count - 1);
				const decimal = {
					re: aRe.plus(deltaRe.times(t)).toSignificantDigits(120).toString(),
					im: aIm.plus(deltaIm.times(t)).toSignificantDigits(120).toString()
				};
				const parameter = { re: Number(decimal.re), im: Number(decimal.im) };
				const state = createFamilyDefaultState('julia');
				state.juliaC = { ...parameter };
				state.juliaCDecimal = { ...decimal };
				state.paletteId = mainState.paletteId;
				state.customPalette = mainState.customPalette?.map((stop) => ({ ...stop }));
				state.paletteOffset = mainState.paletteOffset;
				state.paletteCycles = mainState.paletteCycles;
				state.maxIterations = Math.min(360, mainState.maxIterations);
				state.renderQuality = 'draft';
				return {
					index,
					t: t.toDecimalPlaces(4).toString(),
					parameter,
					decimal,
					state
				};
			});
		} catch {
			return [];
		}
	});
	let mainGuideOverlay = $derived<'none' | 'mandelbrot-landmarks' | 'multibrot-symmetry'>(
		mainState.family === 'mandelbrot' && showMandelbrotLandmarks
			? 'mandelbrot-landmarks'
			: mainState.family === 'multibrot' && showMultibrotSymmetry
				? 'multibrot-symmetry'
				: 'none'
	);
	let colourCostumeStates = $derived.by(() =>
		COLOUR_COSTUMES.map((costume) => {
			const state = cloneFractalState(mainState);
			state.coloring = costume.mode;
			state.renderQuality = 'draft';
			state.maxIterations = Math.min(360, state.maxIterations);
			state.precisionMode = 'float';
			return { ...costume, state };
		})
	);
	let guidedOrbitResults = $derived.by(() =>
		guidedOrbitSamples.map((sample) => ({
			...sample,
			result: iterateEscapeOrbit({
				family: 'mandelbrot',
				plane: 'parameter',
				pixel: sample.point,
				c: sample.point,
				exponent: 2,
				phoenixP: { re: 0, im: 0 },
				maxIterations: Math.min(2_000, mainState.maxIterations),
				bailout: mainState.bailout,
				recordOrbit: true,
				maxRecordedPoints: 2_000
			})
		}))
	);
	let pinnedCriticalOrbits = $derived.by(() => {
		if (!compareMode || mainState.family !== 'julia' || displayedComparison.family !== 'julia') {
			return [];
		}
		return [
			{ label: 'A', parameter: parameterA, parameterDecimal: parameterADecimal },
			{ label: 'B', parameter: parameterB, parameterDecimal: parameterBDecimal }
		].map((entry) => ({
			...entry,
			result: iterateEscapeOrbit({
				family: 'julia',
				plane: 'dynamical',
				pixel: { re: 0, im: 0 },
				c: entry.parameter,
				cDecimal: entry.parameterDecimal,
				exponent: 2,
				phoenixP: { re: 0, im: 0 },
				maxIterations: Math.min(2_000, mainState.maxIterations),
				bailout: mainState.bailout,
				recordOrbit: true,
				maxRecordedPoints: 2_000
			})
		}));
	});
	let degreeComparisonStates = $derived.by(() =>
		[2, 3, 4, 5].map((degree) => {
			const state = createPresetState('multibrot-cubic');
			state.exponent = degree;
			state.renderQuality = 'draft';
			state.maxIterations = 420;
			return { degree, state };
		})
	);
	let mirrorComparisonStates = $derived.by(() =>
		(['mandelbrot', 'tricorn', 'burning-ship'] as const).map((familyId) => {
			const state = createFamilyDefaultState(familyId);
			state.renderQuality = 'draft';
			state.maxIterations = 420;
			return {
				label: getFamilyDefinition(familyId).passport.name,
				formula: getFamilyDefinition(familyId).passport.formula,
				state
			};
		})
	);
	let supportsFourCostumes = $derived(
		mainState.family === 'mandelbrot' ||
			mainState.family === 'julia' ||
			mainState.family === 'multibrot'
	);
	let tiledPngAvailable = $derived(
		PNG_EXPORT_RASTER_FAMILIES.some((candidate) => candidate === mainState.family) &&
			mainState.coloring !== 'histogram'
	);
	let svgAvailability = $derived.by(() => {
		if (mainState.family === 'sierpinski') {
			const count = 3 ** Math.min(9, Math.max(0, Math.round(mainState.exponent)));
			return { available: count <= 40_000, label: `${count.toLocaleString()} triangles` };
		}
		if (mainState.family === 'l-system' && mainState.lSystem) {
			try {
				const expanded = expandLSystemState(mainState.lSystem);
				return {
					available: expanded.estimate.svgSafe,
					label: `${expanded.estimate.segmentCount.toLocaleString()} segments`
				};
			} catch (error) {
				return {
					available: false,
					label: error instanceof Error ? error.message : 'Unsafe expansion'
				};
			}
		}
		return { available: false, label: 'Raster family' };
	});

	function formatNumber(value: number, digits = 8) {
		if (!Number.isFinite(value)) return 'not finite';
		const absolute = Math.abs(value);
		if ((absolute > 0 && absolute < 1e-5) || absolute >= 1e6) return value.toExponential(5);
		return Number(value.toFixed(digits)).toString();
	}

	function complexLabel(value: ComplexValue) {
		return `${formatNumber(value.re)} ${value.im < 0 ? '−' : '+'} ${formatNumber(Math.abs(value.im))}i`;
	}

	function decimalComplexLabel(value: ComplexValue, decimal?: DecimalComplexValue | null) {
		if (!decimal) return complexLabel(value);
		return `${decimal.re} ${decimal.im.startsWith('-') ? '−' : '+'} ${decimal.im.replace(/^-/, '')}i`;
	}

	function statesDiffer(left: FractalViewState, right: FractalViewState) {
		return serializeLocalState(left) !== serializeLocalState(right);
	}

	function announce(message: string) {
		status = message;
	}

	function commitMain(
		nextInput: FractalViewState,
		reason: string,
		record = true,
		urlBehavior: 'push' | 'replace' = 'push'
	) {
		const normalized = normalizeFractalState(nextInput, nextInput.family);
		const next = normalized.state;
		if (!statesDiffer(mainState, next)) {
			announce(reason);
			if (urlBehavior === 'replace') replaceUrlState();
			else commitUrlState();
			return;
		}
		const familyChanged = mainState.family !== next.family;
		if (record) {
			undoStack = [...undoStack.slice(-59), cloneFractalState(mainState)];
			redoStack = [];
		}
		mainState = next;
		if (familyChanged || next.family === 'buddhabrot' || next.family === 'barnsley-fern') {
			progress = 0;
			progressLabel = '';
			progressCountLabel = '';
		}
		if (familyChanged) {
			activePlane = 'primary';
		}
		stateWarnings = normalized.issues.map((issue) => issue.message);
		announce(reason);
		if (urlBehavior === 'replace') replaceUrlState();
		else commitUrlState();
	}

	function assignSelectedPoint(point: ComplexValue, decimal?: DecimalComplexValue | null) {
		selectedPoint = { ...point };
		selectedPointDecimal = decimal
			? { ...decimal }
			: { re: point.re.toString(), im: point.im.toString() };
	}

	function handleCanvasChange(next: FractalViewState) {
		stopParameterPathAnimation('Parameter-path animation paused for direct canvas navigation.');
		mainState = next;
		scheduleUrlReplace();
	}

	function handleViewCommit(before: FractalViewState, after: FractalViewState, reason: string) {
		stopParameterPathAnimation('Parameter-path animation paused for direct canvas navigation.');
		if (!statesDiffer(before, after)) return;
		undoStack = [...undoStack.slice(-59), cloneFractalState(before)];
		redoStack = [];
		mainState = normalizeFractalState(after, after.family).state;
		announce(reason);
		commitUrlState();
	}

	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		redoStack = [...redoStack.slice(-59), cloneFractalState(mainState)];
		undoStack = undoStack.slice(0, -1);
		mainState = cloneFractalState(previous);
		announce('Restored the previous atlas state.');
		commitUrlState();
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack.slice(-59), cloneFractalState(mainState)];
		redoStack = redoStack.slice(0, -1);
		mainState = cloneFractalState(next);
		announce('Reapplied the next atlas state.');
		commitUrlState();
	}

	function resetFamily() {
		commitMain(createFamilyDefaultState(mainState.family), `${activeFamilyName} reset.`);
	}

	function resetAtlas() {
		stopParameterPathAnimation();
		stopLSystemGrowth();
		assignSelectedPoint({ re: -0.123, im: 0.745 }, { re: '-0.123', im: '0.745' });
		parameterA = { re: -0.123, im: 0.745 };
		parameterB = { re: -0.124, im: 0.744 };
		parameterADecimal = { re: '-0.123', im: '0.745' };
		parameterBDecimal = { re: '-0.124', im: '0.744' };
		parameterPathOpen = false;
		parameterPathSampleCount = 7;
		parameterPathIndex = 0;
		showMandelbrotLandmarks = false;
		showMultibrotSymmetry = false;
		sierpinskiMode = 'overlay';
		hoverPoint = null;
		hoverPointDecimal = null;
		activePanel = 'explore';
		activePlane = 'primary';
		linkedJulia = true;
		compareMode = false;
		comparisonState = createPresetState('tricorn-full');
		linkComparisonViewport = true;
		linkComparisonColour = true;
		linkComparisonIterations = true;
		compareSplit = 50;
		compareSplitLocked = false;
		guidedMode = 'none';
		guidedOrbitSamples = [];
		ghostOrbit = [];
		ghostParameter = null;
		showGrid = true;
		pngResolution = 'current';
		includePngCaption = false;
		commitMain(
			createPresetState('mandelbrot-full'),
			'All atlas instruments reset to launch state.'
		);
	}

	function restoreZoomBreadcrumb(state: FractalViewState) {
		commitMain(cloneFractalState(state), `Returned to ${zoomMagnificationLabel(state)} zoom.`);
	}

	function zoomMagnificationLabel(state: FractalViewState, baseSpan?: number) {
		const launchSpan = baseSpan ?? createFamilyDefaultState(state.family).spanY;
		const magnification = launchSpan / Math.max(Number.MIN_VALUE, Math.abs(state.spanY));
		if (magnification < 10) return `${Number(magnification.toFixed(2))}×`;
		if (magnification < 10_000) return `${Math.round(magnification).toLocaleString()}×`;
		return `${magnification.toExponential(2)}×`;
	}

	function chooseFamily(nextFamily: FractalFamily) {
		if (nextFamily !== 'mandelbrot') stopParameterPathAnimation();
		if (nextFamily !== 'l-system') stopLSystemGrowth();
		const next = changeStateFamily(mainState, nextFamily, { preservePalette: true });
		if (nextFamily === 'julia') assignSelectedPoint(next.juliaC, next.juliaCDecimal);
		activePlane = 'primary';
		commitMain(next, `${getFamilyDefinition(nextFamily).passport.name} selected.`);
		activePanel = 'explore';
	}

	function chooseComparisonFamily(nextFamily: FractalFamily) {
		comparisonState = changeStateFamily(comparisonState, nextFamily);
		announce(`Comparison pane changed to ${getFamilyDefinition(nextFamily).passport.name}.`);
	}

	function swapComparisonPlanes() {
		const previousMain = cloneFractalState(mainState);
		const nextMain = cloneFractalState(displayedComparison);
		comparisonState = previousMain;
		commitMain(nextMain, 'Primary and comparison families swapped.');
	}

	function handleComparisonCanvasChange(next: FractalViewState) {
		if (linkComparisonViewport) return;
		comparisonState = normalizeFractalState(next, next.family).state;
	}

	function handleComparisonViewCommit(
		_before: FractalViewState,
		after: FractalViewState,
		reason: string
	) {
		if (linkComparisonViewport) return;
		comparisonState = normalizeFractalState(after, after.family).state;
		announce(`Comparison B: ${reason}`);
	}

	function pinParameter(which: 'A' | 'B') {
		stopParameterPathAnimation();
		if (which === 'A') {
			parameterA = { ...selectedPoint };
			parameterADecimal = { ...selectedPointDecimal };
		} else {
			parameterB = { ...selectedPoint };
			parameterBDecimal = { ...selectedPointDecimal };
		}
		announce(
			`Pinned parameter ${which} at ${decimalComplexLabel(selectedPoint, selectedPointDecimal)}.`
		);
	}

	function stopParameterPathAnimation(message?: string) {
		if (parameterPathTimer) clearInterval(parameterPathTimer);
		parameterPathTimer = null;
		const wasPlaying = parameterPathPlaying;
		parameterPathPlaying = false;
		if (message && wasPlaying) announce(message);
	}

	function selectParameterPathSample(index: number, deliberate = true) {
		const safeIndex = Math.max(0, Math.min(parameterPathSamples.length - 1, Math.round(index)));
		const sample = parameterPathSamples[safeIndex];
		if (!sample) return;
		parameterPathIndex = safeIndex;
		assignSelectedPoint(sample.parameter, sample.decimal);
		if (deliberate) {
			announce(
				`Parameter-path sample ${safeIndex + 1} of ${parameterPathSamples.length} selected at ${decimalComplexLabel(sample.parameter, sample.decimal)}.`
			);
			commitUrlState();
		} else {
			replaceUrlState();
		}
	}

	function changeParameterPathSampleCount(value: number) {
		stopParameterPathAnimation('Parameter-path animation paused while its sample count changed.');
		parameterPathSampleCount = Math.max(5, Math.min(9, Math.round(value)));
		parameterPathIndex = Math.min(parameterPathIndex, parameterPathSampleCount - 1);
		commitUrlState();
	}

	function toggleParameterPath() {
		if (mainState.family !== 'mandelbrot') {
			chooseFamily('mandelbrot');
		}
		parameterPathOpen = !parameterPathOpen;
		if (!parameterPathOpen) {
			stopParameterPathAnimation();
			announce('Parameter-path Julia strip closed.');
		} else {
			announce(
				'Parameter path opened between pinned A and B with bounded Julia thumbnail samples.'
			);
		}
		commitUrlState();
	}

	function toggleParameterPathAnimation() {
		if (parameterPathPlaying) {
			stopParameterPathAnimation('Parameter-path animation paused.');
			commitUrlState();
			return;
		}
		if (reducedMotion) {
			announce(
				'Parameter-path animation stays disabled because reduced motion is preferred; the scrubber remains available.'
			);
			return;
		}
		if (parameterPathSamples.length < 2) return;
		parameterPathPlaying = true;
		announce('Parameter-path animation started. Pause remains available beside the scrubber.');
		parameterPathTimer = setInterval(() => {
			const next = (parameterPathIndex + 1) % parameterPathSamples.length;
			selectParameterPathSample(next, false);
		}, 900);
	}

	function comparePinnedJulias() {
		const left = createFamilyDefaultState('julia');
		const right = createFamilyDefaultState('julia');
		left.juliaC = { ...parameterA };
		right.juliaC = { ...parameterB };
		left.juliaCDecimal = { ...parameterADecimal };
		right.juliaCDecimal = { ...parameterBDecimal };
		left.center = { re: 0, im: 0 };
		right.center = { re: 0, im: 0 };
		left.centerDecimal = { re: '0', im: '0' };
		right.centerDecimal = { re: '0', im: '0' };
		left.spanY = 3;
		right.spanY = 3;
		left.paletteId = mainState.paletteId;
		right.paletteId = mainState.paletteId;
		left.maxIterations = mainState.maxIterations;
		right.maxIterations = mainState.maxIterations;
		comparisonState = right;
		linkComparisonViewport = true;
		linkComparisonColour = true;
		linkComparisonIterations = true;
		compareMode = true;
		assignSelectedPoint({ re: 0, im: 0 }, { re: '0', im: '0' });
		commitMain(left, 'Pinned Julia parameters A and B opened for comparison.');
	}

	function inspectPinnedCritical(which: 'A' | 'B') {
		const primaryParameter = which === 'A' ? parameterA : parameterB;
		const secondaryParameter = which === 'A' ? parameterB : parameterA;
		const primary = createFamilyDefaultState('julia');
		const secondary = createFamilyDefaultState('julia');
		primary.juliaC = { ...primaryParameter };
		secondary.juliaC = { ...secondaryParameter };
		primary.juliaCDecimal = {
			...(which === 'A' ? parameterADecimal : parameterBDecimal)
		};
		secondary.juliaCDecimal = {
			...(which === 'A' ? parameterBDecimal : parameterADecimal)
		};
		primary.paletteId = mainState.paletteId;
		secondary.paletteId = mainState.paletteId;
		primary.maxIterations = mainState.maxIterations;
		secondary.maxIterations = mainState.maxIterations;
		comparisonState = secondary;
		assignSelectedPoint({ re: 0, im: 0 }, { re: '0', im: '0' });
		compareMode = true;
		linkComparisonViewport = true;
		linkComparisonColour = true;
		linkComparisonIterations = true;
		commitMain(primary, `Critical orbit ${which} selected for the detailed inspector.`);
		activePanel = 'inspect';
	}

	function presetParameterSummary(state: FractalViewState) {
		if (state.family === 'julia') return `c ${complexLabel(state.juliaC)}`;
		if (state.family === 'multibrot') {
			return `degree ${Math.round(state.exponent)} · ${state.plane} plane`;
		}
		if (state.family === 'phoenix') {
			return `c ${complexLabel(state.juliaC)} · p ${complexLabel(state.phoenixP)} · z₋₁ ${complexLabel(state.phoenixPrevious)}`;
		}
		if (state.family === 'newton') {
			return `degree ${Math.max(1, (state.polynomial?.coefficients.length ?? 2) - 1)} polynomial · λ ${formatNumber(state.newtonRelaxation, 4)}`;
		}
		if (state.family === 'buddhabrot') {
			return `${state.density?.iterationBands.length ?? 1} density band${state.density?.iterationBands.length === 1 ? '' : 's'} · seed ${state.seed}`;
		}
		return `${state.plane} plane`;
	}

	function exactPresetCentre(preset: AtlasPreset) {
		const centre = preset.state.centerDecimal ?? {
			re: preset.state.center.re.toString(),
			im: preset.state.center.im.toString()
		};
		return `${centre.re} ${centre.im.startsWith('-') ? '−' : '+'} ${centre.im.replace(/^-/, '')}i`;
	}

	function openPresetLinked(preset: AtlasPreset) {
		compareMode = false;
		linkedJulia = true;
		activePlane = 'primary';
		activePanel = 'explore';
		if (preset.state.family === 'julia') {
			const next = createPresetState('mandelbrot-full');
			assignSelectedPoint(preset.state.juliaC, preset.state.juliaCDecimal);
			commitMain(next, `${preset.label} opened as the fixed parameter in the linked Julia plane.`);
			return;
		}
		assignSelectedPoint(preset.state.center, preset.state.centerDecimal);
		commitMain(createPresetState(preset.id), `${preset.label} opened with the linked Julia plane.`);
	}

	function applyPreset(
		id: string,
		reason?: string,
		record = true,
		urlBehavior: 'push' | 'replace' = 'push'
	) {
		if (id === 'linked-rabbit') {
			const next = createPresetState('mandelbrot-full');
			next.center = { re: -0.4, im: 0 };
			next.centerDecimal = { re: '-0.4', im: '0' };
			next.spanY = 2.4;
			assignSelectedPoint({ re: -0.123, im: 0.745 });
			linkedJulia = true;
			commitMain(
				next,
				reason ?? 'Linked rabbit-like Julia expedition loaded.',
				record,
				urlBehavior
			);
			return;
		}
		if (id === 'boundary-probe' || id === 'across-the-boundary') {
			assignSelectedPoint({ re: -0.748, im: 0.1 });
			activePanel = 'inspect';
			commitMain(
				createPresetState('across-the-boundary'),
				reason ?? 'Across-the-boundary probe loaded with the Orbit Inspector.',
				record,
				urlBehavior
			);
			return;
		}
		if (id === 'mandelbrot-binary') {
			const next = createPresetState('mandelbrot-full');
			next.coloring = 'binary';
			commitMain(next, reason ?? 'Binary Mandelbrot census loaded.', record, urlBehavior);
			return;
		}
		if (id === 'precision-cliff') {
			const next = createPresetState('precision-cliff');
			commitMain(next, reason ?? 'Precision-limit field stop loaded.', record, urlBehavior);
			return;
		}
		const preset = getAtlasPreset(id);
		if (!preset) {
			announce(`The preset “${id}” is not available.`);
			return;
		}
		commitMain(createPresetState(id), reason ?? `${preset.label} loaded.`, record, urlBehavior);
	}

	function findGhostOrbit() {
		if (mainState.family !== 'buddhabrot') return;
		const bands = mainState.density?.iterationBands ?? [[20, 80]];
		let randomState = mainState.seed >>> 0 || 0x6d2b79f5;
		const random = () => {
			randomState ^= randomState << 13;
			randomState ^= randomState >>> 17;
			randomState ^= randomState << 5;
			return (randomState >>> 0) / 4_294_967_296;
		};
		const candidates: ComplexValue[] = [
			{ re: -0.75, im: 0.1 },
			...Array.from({ length: 4_096 }, () => ({
				re: -2.2 + random() * 3.4,
				im: -1.6 + random() * 3.2
			}))
		];
		for (const candidate of candidates) {
			const result = iterateEscapeOrbit({
				family: 'mandelbrot',
				plane: 'parameter',
				pixel: candidate,
				c: candidate,
				exponent: 2,
				phoenixP: { re: 0, im: 0 },
				maxIterations: Math.min(2_000, mainState.maxIterations),
				bailout: mainState.bailout,
				recordOrbit: true,
				maxRecordedPoints: 2_000
			});
			const accepted =
				result.status === 'escaped' &&
				bands.some(([low, high]) => result.iterations >= low && result.iterations <= high);
			if (!accepted) continue;
			ghostParameter = candidate;
			ghostOrbit = result.orbit.map((point) => ({ ...point.value }));
			announce(
				`Showing one accepted ${result.iterations}-step ghost orbit at ${complexLabel(candidate)}.`
			);
			return;
		}
		ghostParameter = null;
		ghostOrbit = [];
		announce('No accepted ghost orbit was found inside the bounded deterministic search budget.');
	}

	function runGuidedExperiment(experiment: GuidedExperiment) {
		guidedMode = 'none';
		guidedOrbitSamples = [];
		ghostOrbit = [];
		ghostParameter = null;
		applyPreset(experiment.preset, `${experiment.title} experiment set up.`);
		if (experiment.patch) {
			commitMain(
				{ ...mainState, ...experiment.patch },
				`${experiment.title} calculation settings applied.`
			);
		}
		if (experiment.comparisonPreset) {
			comparisonState = createPresetState(experiment.comparisonPreset);
			linkComparisonViewport = true;
			compareMode = true;
		} else {
			compareMode = false;
		}
		if (experiment.id === 'one-point-two-worlds') linkedJulia = true;
		if (experiment.id === 'three-fates') {
			guidedMode = 'three-fates';
			guidedOrbitSamples = [
				{
					label: 'Rapid escape',
					point: { re: 0.5, im: 0.5 }
				},
				{
					label: 'Certified interior',
					point: { re: 0, im: 0 },
					certificate: 'c = 0 lies inside the main cardioid; zₙ remains 0.'
				},
				{
					label: 'Boundary-near unresolved',
					point: { re: -0.743643887037151, im: 0.13182590420533 }
				}
			];
			commitMain({ ...mainState, maxIterations: 2_000 }, 'Three bounded orbit fates prepared.');
			assignSelectedPoint(guidedOrbitSamples[0].point);
		} else if (experiment.id === 'more-iterations') {
			const low = createPresetState('across-the-boundary');
			low.maxIterations = 100;
			comparisonState = low;
			linkComparisonViewport = true;
			linkComparisonColour = true;
			linkComparisonIterations = false;
			compareMode = true;
		} else if (experiment.id === 'power-symmetry') {
			guidedMode = 'power';
			commitMain({ ...mainState, exponent: 2 }, 'Degrees two through five prepared.');
		} else if (experiment.id === 'mirror-mathematics') {
			guidedMode = 'mirror';
			commitMain(
				createPresetState('mandelbrot-full'),
				'Mandelbrot, Tricorn and Burning Ship formula comparison prepared.'
			);
			comparisonState = createPresetState('tricorn-full');
			linkComparisonViewport = false;
			compareMode = true;
		} else if (experiment.id === 'draw-ghosts') {
			guidedMode = 'ghost';
			queueMicrotask(findGhostOrbit);
		} else if (experiment.id === 'tiny-change') {
			guidedMode = 'tiny-change';
			parameterA = { re: -0.12256116687665362, im: 0.7448617666197442 };
			parameterB = { re: -0.122, im: 0.75 };
			parameterADecimal = {
				re: '-0.12256116687665362',
				im: '0.7448617666197442'
			};
			parameterBDecimal = { re: '-0.122', im: '0.75' };
			comparePinnedJulias();
		}
		activePanel = experiment.panel;
		activePlane = 'primary';
	}

	function zoom(factor: number) {
		const nextViewport = zoomViewport(
			{
				center: mainState.center,
				centerDecimal: mainState.centerDecimal,
				spanY: mainState.spanY,
				rotation: mainState.rotation
			},
			450,
			300,
			900,
			600,
			factor
		);
		commitMain(
			{
				...mainState,
				center: nextViewport.center,
				centerDecimal: nextViewport.centerDecimal,
				spanY: nextViewport.spanY,
				rotation: nextViewport.rotation
			},
			factor < 1 ? 'Zoomed in.' : 'Zoomed out.'
		);
	}

	function updateMultibrotDegree(requestedDegree: number) {
		if (mainState.family !== 'multibrot') return;
		const degree = Math.max(2, Math.min(12, Math.round(requestedDegree)));
		const spanY = degree === 2 ? 2.8 : degree <= 4 ? 3 : 2.7;
		commitMain(
			{
				...mainState,
				exponent: degree,
				center: { re: 0, im: 0 },
				centerDecimal: { re: '0', im: '0' },
				spanY,
				rotation: 0
			},
			`Viewport fitted to the degree-${degree} Multibrot overview.`
		);
	}

	function fitMultibrotDegree() {
		updateMultibrotDegree(mainState.exponent);
	}

	function updateExactCenter(axis: 're' | 'im', rawValue: string) {
		const value = rawValue.trim();
		const parsed = Number(value);
		if (!value || !Number.isFinite(parsed)) {
			announce(`Centre ${axis === 're' ? 'real' : 'imaginary'} value must be a finite decimal.`);
			return;
		}
		const centerDecimal = {
			re: mainState.centerDecimal?.re ?? mainState.center.re.toString(),
			im: mainState.centerDecimal?.im ?? mainState.center.im.toString(),
			[axis]: value
		};
		commitMain(
			{
				...mainState,
				center: { re: Number(centerDecimal.re), im: Number(centerDecimal.im) },
				centerDecimal
			},
			`Exact centre ${axis === 're' ? 'real' : 'imaginary'} coordinate changed.`
		);
	}

	function updateViewportSpan(value: number) {
		if (!Number.isFinite(value) || value <= 0) {
			announce('Viewport span must be a positive finite number.');
			return;
		}
		commitMain({ ...mainState, spanY: value }, 'Viewport span changed.');
	}

	function updateNumber(
		field: 'maxIterations' | 'bailout' | 'exponent' | 'paletteCycles' | 'paletteOffset',
		value: number,
		reason: string
	) {
		commitMain({ ...mainState, [field]: value }, reason);
	}

	function commitCustomMapRecipe(nextRecipe: CustomMapRecipe, reason: string) {
		const validation = normalizeCustomMapRecipe(nextRecipe);
		commitMain(
			{
				...mainState,
				family: 'custom-map',
				customMap: validation.recipe,
				exponent: validation.recipe.power
			},
			reason
		);
		if (validation.issues.length) {
			stateWarnings = validation.issues.map((issue) => issue.message);
		}
	}

	function updateCustomMapBoolean(
		field: 'conjugateBeforePower' | 'absoluteReal' | 'absoluteImaginary' | 'addC' | 'memoryEnabled',
		value: boolean
	) {
		if (!activeCustomMap) return;
		commitCustomMapRecipe(
			{ ...activeCustomMap, [field]: value },
			`Map Workshop ${field.replace(/([A-Z])/gu, ' $1').toLowerCase()} ${value ? 'enabled' : 'disabled'}.`
		);
	}

	function updateCustomMapPower(value: number) {
		if (!activeCustomMap) return;
		commitCustomMapRecipe(
			{ ...activeCustomMap, power: value },
			`Map Workshop integer power changed to ${Math.round(value)}.`
		);
	}

	function updateCustomMapInitialZ(initialZ: CustomMapInitialZRule) {
		if (!activeCustomMap) return;
		commitCustomMapRecipe(
			{ ...activeCustomMap, initialZ },
			`Map Workshop initial z rule changed to ${initialZ.replace('-', ' ')}.`
		);
	}

	function updateCustomMapMemory(part: 're' | 'im', value: number) {
		if (!activeCustomMap) return;
		commitCustomMapRecipe(
			{
				...activeCustomMap,
				memoryCoefficient: { ...activeCustomMap.memoryCoefficient, [part]: value }
			},
			`Map Workshop memory coefficient ${part === 're' ? 'real' : 'imaginary'} part changed.`
		);
	}

	function returnToKnownFamily() {
		const target = customMapIdentity?.conventionalFamily ?? 'mandelbrot';
		chooseFamily(target);
		announce(
			customMapIdentity?.conventionalFamily
				? `Returned to the named ${customMapIdentity.label} family.`
				: 'Returned to the standard Mandelbrot family; the custom recipe remains in browser history.'
		);
	}

	function saveMutation() {
		if (!activeCustomMap) return;
		const formula =
			mainState.plane === 'parameter' || mainState.plane === 'dynamical'
				? customMapFormula(activeCustomMap, mainState.plane).recurrence
				: 'Custom map';
		const name = `${customMapIdentity?.label ?? 'Custom map'} mutation · ${formula}`.slice(0, 80);
		const specimen: SavedSpecimen = {
			id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			name,
			savedAt: new Date().toISOString(),
			state: serializeLocalState(mainState),
			selected: { ...selectedPoint },
			selectedDecimal: { ...selectedPointDecimal },
			lab: captureSpecimenLab()
		};
		persistSpecimens([specimen, ...specimens]);
		announce(`Saved mutation “${name}” on this device.`);
	}

	async function copyMutationSettings() {
		if (!activeCustomMap) return;
		await copyText(
			JSON.stringify(
				{
					family: 'custom-map',
					name: customMapIdentity?.label ?? 'Custom map',
					plane: mainState.plane,
					formula: activeFormula,
					recipe: activeCustomMap,
					bailout: mainState.bailout,
					maxIterations: mainState.maxIterations
				},
				null,
				2
			),
			'Map Workshop settings copied as safe JSON.'
		);
	}

	function setPlane(plane: FractalViewState['plane']) {
		if (!family.supportedPlanes.includes(plane)) {
			announce(`${plane} plane is unavailable for ${activeFamilyName}.`);
			return;
		}
		commitMain({ ...mainState, plane }, `${plane} plane selected.`);
	}

	function updateComplex(
		field: 'juliaC' | 'phoenixP' | 'phoenixPrevious',
		part: 're' | 'im',
		value: number,
		reason: string
	) {
		const next = { ...mainState, [field]: { ...mainState[field], [part]: value } };
		if (field === 'juliaC') {
			next.juliaCDecimal = {
				re:
					part === 're'
						? String(value)
						: (mainState.juliaCDecimal?.re ?? String(mainState.juliaC.re)),
				im:
					part === 'im'
						? String(value)
						: (mainState.juliaCDecimal?.im ?? String(mainState.juliaC.im))
			};
		}
		commitMain(next, reason);
	}

	function loadNewtonDegree(degree: number) {
		const safeDegree = Math.max(2, Math.min(8, Math.round(degree)));
		const coefficients = Array.from({ length: safeDegree + 1 }, (_, index) => ({
			re: index === 0 ? 1 : index === safeDegree ? -1 : 0,
			im: 0
		}));
		commitMain(
			{ ...mainState, polynomial: { coefficients } },
			`Newton polynomial changed to z${superscript(safeDegree)} − 1.`
		);
	}

	function loadNewtonPreset(preset: 'z3-minus-one' | 'z3-minus-z') {
		const coefficients =
			preset === 'z3-minus-z'
				? [
						{ re: 1, im: 0 },
						{ re: 0, im: 0 },
						{ re: -1, im: 0 },
						{ re: 0, im: 0 }
					]
				: [
						{ re: 1, im: 0 },
						{ re: 0, im: 0 },
						{ re: 0, im: 0 },
						{ re: -1, im: 0 }
					];
		commitMain(
			{ ...mainState, polynomial: { coefficients } },
			preset === 'z3-minus-z'
				? 'Newton polynomial changed to z³ − z.'
				: 'Newton polynomial changed to z³ − 1.'
		);
	}

	function updateNewtonCoefficient(index: number, part: 're' | 'im', requestedValue: number) {
		if (!mainState.polynomial || !Number.isFinite(requestedValue)) {
			announce('Newton coefficients must be finite numbers.');
			return;
		}
		const value = Math.max(-1_000_000, Math.min(1_000_000, requestedValue));
		const coefficients = mainState.polynomial.coefficients.map((coefficient) => ({
			...coefficient
		}));
		const coefficient = coefficients[index];
		if (!coefficient) return;
		const nextCoefficient = { ...coefficient, [part]: value };
		if (index === 0 && nextCoefficient.re === 0 && nextCoefficient.im === 0) {
			announce('The leading Newton coefficient cannot be zero.');
			return;
		}
		coefficients[index] = nextCoefficient;
		commitMain(
			{ ...mainState, polynomial: { coefficients } },
			`Newton coefficient ${newtonTermLabel(coefficients.length - index - 1)} updated.`
		);
	}

	function superscript(value: number) {
		return String(value)
			.split('')
			.map((digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)])
			.join('');
	}

	function newtonTermLabel(power: number) {
		if (power === 0) return 'constant';
		if (power === 1) return 'z';
		return `z${superscript(power)}`;
	}

	function updateDensity(field: 'targetSamples' | 'exposure' | 'gamma', value: number) {
		const density = mainState.density ?? createFamilyDefaultState('buddhabrot').density!;
		commitMain(
			{ ...mainState, density: { ...density, [field]: value } },
			`Density ${field.replace(/([A-Z])/gu, ' $1').toLowerCase()} changed.`
		);
	}

	function setDensityMode(mode: 'monochrome' | 'rgb') {
		const density = mainState.density ?? createFamilyDefaultState('buddhabrot').density!;
		const lastBand = density.iterationBands.at(-1);
		const low = Math.max(0, Math.min(19_999, density.iterationBands[0]?.[0] ?? 20));
		const high = Math.max(low + 1, Math.min(20_000, lastBand?.[1] ?? 500));
		const iterationBands: [number, number][] =
			mode === 'rgb'
				? [
						[20, 80],
						[80, 250],
						[250, Math.max(500, Math.min(20_000, mainState.maxIterations))]
					]
				: [[low, high]];
		commitMain(
			{ ...mainState, density: { ...density, iterationBands } },
			mode === 'rgb' ? 'Three-band RGB orbit density enabled.' : 'Monochrome orbit density enabled.'
		);
	}

	function updateDensityBand(index: number, endpoint: 0 | 1, requestedValue: number) {
		if (!mainState.density || !Number.isFinite(requestedValue)) {
			announce('Iteration-window bounds must be finite numbers.');
			return;
		}
		const iterationBands = mainState.density.iterationBands.map(
			(band) => [...band] as [number, number]
		);
		const band = iterationBands[index];
		if (!band) return;
		const value = Math.max(0, Math.min(20_000, Math.round(requestedValue)));
		if ((endpoint === 0 && value >= band[1]) || (endpoint === 1 && value <= band[0])) {
			announce('Each density window needs a high iteration greater than its low iteration.');
			return;
		}
		band[endpoint] = value;
		commitMain(
			{ ...mainState, density: { ...mainState.density, iterationBands } },
			`Density iteration window ${index + 1} updated.`
		);
	}

	function applyLSystemPreset(id: string) {
		stopLSystemGrowth();
		const preset = getLSystemPreset(id);
		const previous = mainState.lSystem;
		commitMain(
			{
				...mainState,
				lSystem: {
					presetId: preset.id,
					axiom: preset.axiom,
					rules: { ...preset.rules },
					angleDegrees: preset.angleDegrees,
					stepLength: preset.stepLength,
					startAngleDegrees: preset.startAngleDegrees,
					generations: Math.min(6, previous?.generations ?? 4),
					lineWidth: previous?.lineWidth ?? 1.5,
					colorByDepth: previous?.colorByDepth ?? true
				}
			},
			`${preset.label} grammar loaded.`
		);
	}

	function updateLSystem(
		field: 'generations' | 'angleDegrees' | 'startAngleDegrees' | 'stepLength' | 'lineWidth',
		value: number
	) {
		if (!mainState.lSystem) return;
		stopLSystemGrowth();
		commitMain(
			{ ...mainState, lSystem: { ...mainState.lSystem, [field]: value } },
			`L-system ${field.replace(/([A-Z])/gu, ' $1').toLowerCase()} changed.`
		);
	}

	function updateLSystemDefinition(
		patch: Partial<Pick<NonNullable<FractalViewState['lSystem']>, 'axiom' | 'rules'>>,
		reason: string
	) {
		if (!mainState.lSystem) return;
		stopLSystemGrowth();
		const next = { ...mainState.lSystem, ...patch, presetId: 'custom' };
		const validation = validateLSystemDefinition(next);
		if (!validation.valid) {
			stateWarnings = validation.issues;
			announce(validation.issues[0] ?? 'The restricted L-system grammar is invalid.');
			return;
		}
		commitMain({ ...mainState, lSystem: next }, reason);
	}

	function updateLSystemRules(source: string) {
		try {
			updateLSystemDefinition(
				{ rules: parseProductionRules(source) },
				'L-system production rules changed.'
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'The restricted production rules are invalid.';
			stateWarnings = [message];
			announce(message);
		}
	}

	function updateLSystemDepthColour(enabled: boolean) {
		if (!mainState.lSystem) return;
		stopLSystemGrowth();
		commitMain(
			{ ...mainState, lSystem: { ...mainState.lSystem, colorByDepth: enabled } },
			`L-system depth colouring ${enabled ? 'enabled' : 'disabled'}.`
		);
	}

	function stopLSystemGrowth(message?: string) {
		if (lSystemGrowthTimer) clearInterval(lSystemGrowthTimer);
		lSystemGrowthTimer = null;
		const wasPlaying = lSystemGrowthPlaying;
		lSystemGrowthPlaying = false;
		if (message && wasPlaying) announce(message);
	}

	function toggleLSystemGrowth() {
		if (lSystemGrowthPlaying) {
			stopLSystemGrowth('L-system growth animation paused.');
			commitUrlState();
			return;
		}
		if (!mainState.lSystem) return;
		if (reducedMotion) {
			announce(
				'L-system growth animation stays disabled because reduced motion is preferred; the generation control remains available.'
			);
			return;
		}
		lSystemGrowthTarget = Math.max(
			1,
			Math.min(7, lSystemGrowthTarget || mainState.lSystem.generations || 5)
		);
		if (mainState.lSystem.generations >= lSystemGrowthTarget) {
			commitMain(
				{ ...mainState, lSystem: { ...mainState.lSystem, generations: 0 } },
				`L-system growth reset to generation 0; building to ${lSystemGrowthTarget}.`
			);
		}
		lSystemGrowthPlaying = true;
		announce(
			`L-system growth animation started toward generation ${lSystemGrowthTarget}; Pause remains available.`
		);
		lSystemGrowthTimer = setInterval(() => {
			if (!mainState.lSystem) {
				stopLSystemGrowth();
				return;
			}
			const nextGeneration = Math.min(lSystemGrowthTarget, mainState.lSystem.generations + 1);
			mainState = normalizeFractalState({
				...mainState,
				lSystem: { ...mainState.lSystem, generations: nextGeneration }
			}).state;
			replaceUrlState();
			if (nextGeneration >= lSystemGrowthTarget) {
				stopLSystemGrowth();
				announce(`L-system growth reached generation ${lSystemGrowthTarget}.`);
			}
		}, 700);
	}

	function updateIFSColourBy(colorBy: 'transform' | 'age') {
		if (!mainState.ifs) return;
		commitMain(
			{ ...mainState, ifs: { ...mainState.ifs, colorBy } },
			`Fern colour now records ${colorBy === 'transform' ? 'the chosen transform' : 'point age'}.`
		);
	}

	function updateTransform(
		index: number,
		field: 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'probability',
		value: number
	) {
		if (!mainState.ifs) return;
		const transforms = mainState.ifs.transforms.map((transform, transformIndex) =>
			transformIndex === index ? { ...transform, [field]: value } : { ...transform }
		);
		commitMain(
			{ ...mainState, ifs: { ...mainState.ifs, transforms } },
			`Affine transform ${index + 1} updated.`
		);
	}

	function setRenderQuality(quality: RenderQuality) {
		commitMain({ ...mainState, renderQuality: quality }, `Render quality set to ${quality}.`);
	}

	function handleProbe(point: ComplexValue, decimal?: DecimalComplexValue) {
		stopParameterPathAnimation('Parameter-path animation paused for direct canvas inspection.');
		assignSelectedPoint(point, decimal);
		activePanel = 'inspect';
		announce(`Pinned ${decimalComplexLabel(point, decimal)} for orbit inspection.`);
		commitUrlState();
	}

	function handleCanvasStatus(message: string, nextBackend: string) {
		backend = nextBackend;
		if (nextBackend !== 'webgl2') precisionDiagnostics = null;
		renderStatus = message;
	}

	function handleProgress(nextProgress: number, label: string) {
		progress = Math.max(0, Math.min(1, nextProgress));
		progressLabel = label;
		if (/\d/u.test(label)) progressCountLabel = label;
		else if (progress === 0) progressCountLabel = '';
	}

	function selectPanel(panel: Panel) {
		activePanel = panel;
	}

	function setActivePlane(next: 'primary' | 'companion', focusTab = false) {
		activePlane = next;
		if (focusTab) {
			requestAnimationFrame(() => {
				laboratory?.querySelector<HTMLButtonElement>(`#atlas-${next}-plane-tab`)?.focus();
			});
		}
	}

	function handlePlaneTabKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Home') setActivePlane('primary', true);
		else if (event.key === 'End') setActivePlane('companion', true);
		else setActivePlane(activePlane === 'primary' ? 'companion' : 'primary', true);
	}

	function setLinkedJulia(enabled: boolean) {
		linkedJulia = enabled;
		activePlane = 'primary';
		announce(enabled ? 'Linked Julia plane enabled.' : 'Linked Julia plane hidden.');
	}

	function setCompareMode(enabled: boolean) {
		compareMode = enabled;
		activePlane = 'primary';
		announce(enabled ? 'Comparison plane enabled.' : 'Comparison plane hidden.');
	}

	function scrollToLaboratory() {
		laboratory?.scrollIntoView({
			behavior: reducedMotion ? 'auto' : 'smooth',
			block: 'start'
		});
		mainCanvas?.focus();
		flash = true;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = false), 1_600);
	}

	function handleNarrativeCommand(event: Event) {
		const command = (event as CustomEvent<AtlasCommand>).detail ?? {};
		if (command.preset) applyPreset(command.preset);
		if (command.family) chooseFamily(command.family);
		if (command.exponent !== undefined) {
			if (mainState.family === 'multibrot') updateMultibrotDegree(command.exponent);
			else updateNumber('exponent', command.exponent, `Exponent set to ${command.exponent}.`);
		}
		if (command.coloring) {
			commitMain(
				{ ...mainState, coloring: command.coloring },
				`${command.coloring} colouring selected.`
			);
		}
		if (command.panel === 'orbit') activePanel = 'inspect';
		else if (command.panel === 'colour') activePanel = 'colour';
		else if (command.panel === 'precision') activePanel = 'precision';
		else if (command.panel === 'presets') activePanel = 'presets';
		if (command.action === 'tour') startTour();
		if (command.action === 'step') {
			setTimeout(() => mainCanvas?.stepProgressive(), 140);
		}
		scrollToLaboratory();
	}

	function startTour() {
		if (!tourOpen) {
			tourReturnFocus =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			tourOrigin = {
				state: cloneFractalState(mainState),
				selected: { ...selectedPoint },
				selectedDecimal: { ...selectedPointDecimal },
				linked: linkedJulia
			};
		}
		tourIndex = 0;
		tourOpen = true;
		applyTourStep(0);
		requestAnimationFrame(() =>
			tourDialog?.querySelector<HTMLButtonElement>('.primary-action')?.focus()
		);
	}

	function applyTourStep(index: number) {
		const step = TOUR_STEPS[index];
		if (!step) return;
		applyPreset(step.preset, `Tour stop ${index + 1}: ${step.title}`, false, 'replace');
		activePanel = index === 1 || index === 4 ? 'inspect' : 'explore';
	}

	function moveTour(delta: number) {
		const next = Math.max(0, Math.min(TOUR_STEPS.length - 1, tourIndex + delta));
		tourIndex = next;
		applyTourStep(next);
	}

	function finishTour() {
		tourOpen = false;
		tourOrigin = null;
		announce('Guided tour complete. The last specimen remains in the atlas.');
		restoreTourFocus();
	}

	function skipTour() {
		tourOpen = false;
		tourOrigin = null;
		announce('Guided tour skipped. The current specimen remains in the atlas.');
		restoreTourFocus();
	}

	function exitTourAndRestore() {
		if (tourOrigin) {
			mainState = cloneFractalState(tourOrigin.state);
			assignSelectedPoint(tourOrigin.selected, tourOrigin.selectedDecimal);
			linkedJulia = tourOrigin.linked;
		}
		tourOpen = false;
		tourOrigin = null;
		announce('Tour closed and the pre-tour specimen restored.');
		commitUrlState();
		restoreTourFocus();
	}

	function restoreTourFocus() {
		const returnTarget = tourReturnFocus;
		tourReturnFocus = null;
		requestAnimationFrame(() => {
			if (returnTarget?.isConnected) returnTarget.focus();
			else mainCanvas?.focus();
		});
	}

	function handleTourKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			exitTourAndRestore();
			return;
		}
		if (event.key !== 'Tab' || !tourDialog) return;
		const controls = [
			...tourDialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
		].filter((control) => control.offsetParent !== null);
		if (!controls.length) return;
		const first = controls[0];
		const last = controls.at(-1)!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === laboratory) {
				await document.exitFullscreen();
			} else {
				fullscreenReturnFocus =
					document.activeElement instanceof HTMLElement ? document.activeElement : null;
				await laboratory.requestFullscreen();
			}
		} catch {
			announce('Fullscreen is unavailable in this browser.');
		}
	}

	function browserPath(): AtlasPath {
		return `${window.location.pathname}${window.location.search}${window.location.hash}` as AtlasPath;
	}

	function atlasUrl(): AtlasPath {
		const url = new SvelteURL(window.location.href);
		for (const key of ATLAS_QUERY_KEYS) {
			url.searchParams.delete(key);
			url.searchParams.delete(`b_${key}`);
		}
		for (const [key, value] of serializeFractalState(mainState)) {
			url.searchParams.set(key, value);
		}
		for (const [key, value] of serializeFractalState(comparisonState)) {
			url.searchParams.set(`b_${key}`, value);
		}
		url.searchParams.set('sr', selectedPoint.re.toString());
		url.searchParams.set('si', selectedPoint.im.toString());
		url.searchParams.set('srd', selectedPointDecimal.re);
		url.searchParams.set('sid', selectedPointDecimal.im);
		url.searchParams.set('lj', linkedJulia ? '1' : '0');
		url.searchParams.set('grid', showGrid ? '1' : '0');
		url.searchParams.set('cmp', compareMode ? '1' : '0');
		url.searchParams.set('cv', linkComparisonViewport ? '1' : '0');
		url.searchParams.set('cc', linkComparisonColour ? '1' : '0');
		url.searchParams.set('ci', linkComparisonIterations ? '1' : '0');
		url.searchParams.set('cs', Math.round(compareSplit).toString());
		url.searchParams.set('cl', compareSplitLocked ? '1' : '0');
		url.searchParams.set('ar', parameterA.re.toString());
		url.searchParams.set('ai', parameterA.im.toString());
		url.searchParams.set('ard', parameterADecimal.re);
		url.searchParams.set('aid', parameterADecimal.im);
		url.searchParams.set('br', parameterB.re.toString());
		url.searchParams.set('bi', parameterB.im.toString());
		url.searchParams.set('brd', parameterBDecimal.re);
		url.searchParams.set('bid', parameterBDecimal.im);
		url.searchParams.set('path', parameterPathOpen ? '1' : '0');
		url.searchParams.set('pn', Math.round(parameterPathSampleCount).toString());
		url.searchParams.set('px', Math.round(parameterPathIndex).toString());
		url.searchParams.set('card', showMandelbrotLandmarks ? '1' : '0');
		url.searchParams.set('sym', showMultibrotSymmetry ? '1' : '0');
		url.searchParams.set('sier', sierpinskiMode);
		url.searchParams.set('ui', activePanel);
		return `${url.pathname}${url.search}${url.hash}` as AtlasPath;
	}

	function cancelPendingUrlReplace() {
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = null;
	}

	function scheduleUrlReplace() {
		if (!historyReady || restoringHistory || typeof window === 'undefined') return;
		if (!liveHistoryOrigin) liveHistoryOrigin = browserPath();
		cancelPendingUrlReplace();
		urlTimer = setTimeout(() => {
			urlTimer = null;
			if (!restoringHistory) {
				replaceState(resolve(atlasUrl()), window.history.state);
			}
		}, 240);
	}

	function commitUrlState() {
		if (!historyReady || restoringHistory || typeof window === 'undefined') return;
		cancelPendingUrlReplace();
		const committedUrl = resolve(atlasUrl());
		if (!liveHistoryOrigin && committedUrl === browserPath()) return;
		if (liveHistoryOrigin) {
			replaceState(resolve(liveHistoryOrigin), window.history.state);
			liveHistoryOrigin = null;
		}
		pushState(committedUrl, window.history.state);
	}

	function replaceUrlState() {
		if (!historyReady || restoringHistory || typeof window === 'undefined') return;
		cancelPendingUrlReplace();
		liveHistoryOrigin = null;
		replaceState(resolve(atlasUrl()), window.history.state);
	}

	function loadUrlState(fromHistory = false) {
		const params = new URLSearchParams(window.location.search);
		if (!params.has('f') && !params.has('v')) {
			if (fromHistory) {
				mainState = createPresetState('mandelbrot-full');
				assignSelectedPoint({ re: -0.123, im: 0.745 });
				stateWarnings = [];
				undoStack = [];
				redoStack = [];
				activePlane = 'primary';
				announce('Restored the atlas opening view from browser history.');
			}
			return;
		}
		const result = parseFractalState(params);
		mainState = result.state;
		stateWarnings = result.issues.map((issue) => issue.message);
		const comparisonParams = new URLSearchParams(
			[...params]
				.filter(([key]) => key.startsWith('b_'))
				.map(([key, value]) => [key.slice(2), value])
		);
		if (comparisonParams.has('f') || comparisonParams.has('v')) {
			comparisonState = parseFractalState(comparisonParams).state;
		}
		const selectedRe = Number(params.get('sr'));
		const selectedIm = Number(params.get('si'));
		if (Number.isFinite(selectedRe) && Number.isFinite(selectedIm)) {
			const exactRe = params.get('srd');
			const exactIm = params.get('sid');
			assignSelectedPoint(
				{ re: selectedRe, im: selectedIm },
				exactRe &&
					exactIm &&
					exactRe.length <= 160 &&
					exactIm.length <= 160 &&
					Number.isFinite(Number(exactRe)) &&
					Number.isFinite(Number(exactIm))
					? { re: exactRe, im: exactIm }
					: undefined
			);
		}
		if (params.has('lj')) linkedJulia = params.get('lj') !== '0';
		if (params.has('grid')) showGrid = params.get('grid') !== '0';
		if (params.has('cmp')) compareMode = params.get('cmp') === '1';
		if (params.has('cv')) linkComparisonViewport = params.get('cv') !== '0';
		if (params.has('cc')) linkComparisonColour = params.get('cc') !== '0';
		if (params.has('ci')) linkComparisonIterations = params.get('ci') !== '0';
		if (params.has('cl')) compareSplitLocked = params.get('cl') === '1';
		const requestedSplit = Number(params.get('cs'));
		if (Number.isFinite(requestedSplit)) {
			compareSplit = Math.max(25, Math.min(75, Math.round(requestedSplit)));
		}
		const nextParameterA = { re: Number(params.get('ar')), im: Number(params.get('ai')) };
		const nextParameterB = { re: Number(params.get('br')), im: Number(params.get('bi')) };
		if (Number.isFinite(nextParameterA.re) && Number.isFinite(nextParameterA.im)) {
			parameterA = nextParameterA;
			const re = params.get('ard');
			const im = params.get('aid');
			parameterADecimal =
				re &&
				im &&
				re.length <= 160 &&
				im.length <= 160 &&
				Number.isFinite(Number(re)) &&
				Number.isFinite(Number(im))
					? { re, im }
					: { re: nextParameterA.re.toString(), im: nextParameterA.im.toString() };
		}
		if (Number.isFinite(nextParameterB.re) && Number.isFinite(nextParameterB.im)) {
			parameterB = nextParameterB;
			const re = params.get('brd');
			const im = params.get('bid');
			parameterBDecimal =
				re &&
				im &&
				re.length <= 160 &&
				im.length <= 160 &&
				Number.isFinite(Number(re)) &&
				Number.isFinite(Number(im))
					? { re, im }
					: { re: nextParameterB.re.toString(), im: nextParameterB.im.toString() };
		}
		if (params.has('path')) parameterPathOpen = params.get('path') === '1';
		const requestedPathCount = Number(params.get('pn'));
		if (Number.isFinite(requestedPathCount)) {
			parameterPathSampleCount = Math.max(5, Math.min(9, Math.round(requestedPathCount)));
		}
		const requestedPathIndex = Number(params.get('px'));
		if (Number.isFinite(requestedPathIndex)) {
			parameterPathIndex = Math.max(
				0,
				Math.min(parameterPathSampleCount - 1, Math.round(requestedPathIndex))
			);
		}
		if (params.has('card')) showMandelbrotLandmarks = params.get('card') === '1';
		if (params.has('sym')) showMultibrotSymmetry = params.get('sym') === '1';
		const requestedSierpinskiMode = params.get('sier');
		if (
			requestedSierpinskiMode === 'recursive' ||
			requestedSierpinskiMode === 'chaos' ||
			requestedSierpinskiMode === 'overlay'
		) {
			sierpinskiMode = requestedSierpinskiMode;
		}
		const requestedPanel = params.get('ui');
		if (requestedPanel && PANEL_LABELS.some((panel) => panel.id === requestedPanel)) {
			activePanel = requestedPanel as Panel;
		}
		if (fromHistory) {
			undoStack = [];
			redoStack = [];
			activePlane = 'primary';
		}
		if (result.issues.length) {
			announce(
				`Loaded shared state with ${result.issues.length} bounded correction${result.issues.length === 1 ? '' : 's'}.`
			);
		} else {
			announce('Loaded Fractal Atlas state from the URL.');
		}
	}

	function handlePopState() {
		cancelPendingUrlReplace();
		liveHistoryOrigin = null;
		restoringHistory = true;
		loadUrlState(true);
		queueMicrotask(() => (restoringHistory = false));
	}

	function loadSpecimens() {
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
			if (!Array.isArray(parsed)) return;
			specimens = parsed
				.filter(
					(item): item is SavedSpecimen =>
						Boolean(item) &&
						typeof item === 'object' &&
						typeof (item as SavedSpecimen).id === 'string' &&
						typeof (item as SavedSpecimen).name === 'string' &&
						typeof (item as SavedSpecimen).state === 'string'
				)
				.slice(0, MAX_SPECIMENS);
		} catch {
			specimens = [];
		}
	}

	function persistSpecimens(next: SavedSpecimen[]) {
		specimens = next.slice(0, MAX_SPECIMENS);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(specimens));
		} catch {
			announce('This browser would not store another local specimen.');
		}
	}

	function captureSpecimenLab(): NonNullable<SavedSpecimen['lab']> {
		return {
			comparisonState: serializeLocalState(comparisonState),
			linkedJulia,
			showGrid,
			compareMode,
			linkComparisonViewport,
			linkComparisonColour,
			linkComparisonIterations,
			compareSplit,
			compareSplitLocked,
			parameterA: { ...parameterA },
			parameterB: { ...parameterB },
			parameterADecimal: { ...parameterADecimal },
			parameterBDecimal: { ...parameterBDecimal },
			parameterPathOpen,
			parameterPathSampleCount,
			parameterPathIndex,
			showMandelbrotLandmarks,
			showMultibrotSymmetry,
			sierpinskiMode,
			activePanel
		};
	}

	function restoreSpecimenLab(lab: SavedSpecimen['lab']) {
		if (!lab) return;
		comparisonState = parseLocalState(lab.comparisonState).state;
		linkedJulia = Boolean(lab.linkedJulia);
		showGrid = Boolean(lab.showGrid);
		compareMode = Boolean(lab.compareMode);
		linkComparisonViewport = Boolean(lab.linkComparisonViewport);
		linkComparisonColour = Boolean(lab.linkComparisonColour);
		linkComparisonIterations = Boolean(lab.linkComparisonIterations);
		compareSplit = Math.max(25, Math.min(75, Math.round(lab.compareSplit)));
		compareSplitLocked = Boolean(lab.compareSplitLocked);
		if (Number.isFinite(lab.parameterA?.re) && Number.isFinite(lab.parameterA?.im)) {
			parameterA = { ...lab.parameterA };
			parameterADecimal = lab.parameterADecimal
				? { ...lab.parameterADecimal }
				: { re: lab.parameterA.re.toString(), im: lab.parameterA.im.toString() };
		}
		if (Number.isFinite(lab.parameterB?.re) && Number.isFinite(lab.parameterB?.im)) {
			parameterB = { ...lab.parameterB };
			parameterBDecimal = lab.parameterBDecimal
				? { ...lab.parameterBDecimal }
				: { re: lab.parameterB.re.toString(), im: lab.parameterB.im.toString() };
		}
		parameterPathOpen = Boolean(lab.parameterPathOpen);
		if (
			typeof lab.parameterPathSampleCount === 'number' &&
			Number.isFinite(lab.parameterPathSampleCount)
		) {
			parameterPathSampleCount = Math.max(
				5,
				Math.min(9, Math.round(lab.parameterPathSampleCount ?? 7))
			);
		}
		if (typeof lab.parameterPathIndex === 'number' && Number.isFinite(lab.parameterPathIndex)) {
			parameterPathIndex = Math.max(
				0,
				Math.min(parameterPathSampleCount - 1, Math.round(lab.parameterPathIndex ?? 0))
			);
		}
		showMandelbrotLandmarks = Boolean(lab.showMandelbrotLandmarks);
		showMultibrotSymmetry = Boolean(lab.showMultibrotSymmetry);
		if (
			lab.sierpinskiMode === 'recursive' ||
			lab.sierpinskiMode === 'chaos' ||
			lab.sierpinskiMode === 'overlay'
		) {
			sierpinskiMode = lab.sierpinskiMode;
		}
		if (PANEL_LABELS.some((panel) => panel.id === lab.activePanel)) {
			activePanel = lab.activePanel;
		}
	}

	function saveSpecimen() {
		const defaultName = `${activeFamilyName} · ${formatNumber(mainState.center.re, 5)}, ${formatNumber(mainState.center.im, 5)}`;
		const specimen: SavedSpecimen = {
			id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			name: (specimenName.trim() || defaultName).slice(0, 80),
			savedAt: new Date().toISOString(),
			state: serializeLocalState(mainState),
			selected: { ...selectedPoint },
			selectedDecimal: { ...selectedPointDecimal },
			lab: captureSpecimenLab()
		};
		persistSpecimens([specimen, ...specimens.filter((item) => item.id !== specimen.id)]);
		specimenName = '';
		announce(`Saved “${specimen.name}” on this device.`);
	}

	function restoreSpecimen(specimen: SavedSpecimen) {
		const result = parseLocalState(specimen.state);
		if (Number.isFinite(specimen.selected?.re) && Number.isFinite(specimen.selected?.im)) {
			assignSelectedPoint(specimen.selected, specimen.selectedDecimal);
		}
		restoreSpecimenLab(specimen.lab);
		commitMain(result.state, `Restored “${specimen.name}”.`);
		stateWarnings = result.issues.map((issue) => issue.message);
	}

	function deleteSpecimen(id: string) {
		const removed = specimens.find((specimen) => specimen.id === id);
		persistSpecimens(specimens.filter((specimen) => specimen.id !== id));
		announce(removed ? `Removed local specimen “${removed.name}”.` : 'Local specimen removed.');
	}

	function renameSpecimen(specimen: SavedSpecimen) {
		const requested = window.prompt('Rename this local specimen', specimen.name);
		if (requested === null) return;
		const name = requested.trim().slice(0, 80);
		if (!name) {
			announce('A specimen name cannot be empty.');
			return;
		}
		persistSpecimens(
			specimens.map((candidate) =>
				candidate.id === specimen.id ? { ...candidate, name } : candidate
			)
		);
		announce(`Renamed local specimen to “${name}”.`);
	}

	function exportSavedSpecimen(specimen: SavedSpecimen) {
		const parsed = parseLocalState(specimen.state);
		const payload = {
			artifact: 'Fractal Atlas saved specimen',
			name: specimen.name,
			savedAt: specimen.savedAt,
			selectedPoint: specimen.selected,
			selectedPointDecimal: specimen.selectedDecimal,
			laboratory: specimen.lab,
			state: JSON.parse(serializeLocalState(parsed.state))
		};
		downloadBlob(
			new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
			`fractal-atlas-${
				specimen.name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '') || 'specimen'
			}.json`
		);
		announce(`Exported “${specimen.name}” settings locally.`);
	}

	async function copySavedSpecimenLink(specimen: SavedSpecimen) {
		const parsed = parseLocalState(specimen.state);
		const url = new SvelteURL(window.location.href);
		for (const key of ATLAS_QUERY_KEYS) {
			url.searchParams.delete(key);
			url.searchParams.delete(`b_${key}`);
		}
		for (const [key, value] of serializeFractalState(parsed.state))
			url.searchParams.set(key, value);
		url.searchParams.set('sr', specimen.selected.re.toString());
		url.searchParams.set('si', specimen.selected.im.toString());
		url.searchParams.set('srd', specimen.selectedDecimal?.re ?? specimen.selected.re.toString());
		url.searchParams.set('sid', specimen.selectedDecimal?.im ?? specimen.selected.im.toString());
		if (specimen.lab) {
			const comparison = parseLocalState(specimen.lab.comparisonState).state;
			for (const [key, value] of serializeFractalState(comparison)) {
				url.searchParams.set(`b_${key}`, value);
			}
			url.searchParams.set('lj', specimen.lab.linkedJulia ? '1' : '0');
			url.searchParams.set('grid', specimen.lab.showGrid ? '1' : '0');
			url.searchParams.set('cmp', specimen.lab.compareMode ? '1' : '0');
			url.searchParams.set('cv', specimen.lab.linkComparisonViewport ? '1' : '0');
			url.searchParams.set('cc', specimen.lab.linkComparisonColour ? '1' : '0');
			url.searchParams.set('ci', specimen.lab.linkComparisonIterations ? '1' : '0');
			url.searchParams.set('cs', Math.round(specimen.lab.compareSplit).toString());
			url.searchParams.set('cl', specimen.lab.compareSplitLocked ? '1' : '0');
			url.searchParams.set('ar', specimen.lab.parameterA.re.toString());
			url.searchParams.set('ai', specimen.lab.parameterA.im.toString());
			url.searchParams.set(
				'ard',
				specimen.lab.parameterADecimal?.re ?? specimen.lab.parameterA.re.toString()
			);
			url.searchParams.set(
				'aid',
				specimen.lab.parameterADecimal?.im ?? specimen.lab.parameterA.im.toString()
			);
			url.searchParams.set('br', specimen.lab.parameterB.re.toString());
			url.searchParams.set('bi', specimen.lab.parameterB.im.toString());
			url.searchParams.set(
				'brd',
				specimen.lab.parameterBDecimal?.re ?? specimen.lab.parameterB.re.toString()
			);
			url.searchParams.set(
				'bid',
				specimen.lab.parameterBDecimal?.im ?? specimen.lab.parameterB.im.toString()
			);
			url.searchParams.set('path', specimen.lab.parameterPathOpen ? '1' : '0');
			url.searchParams.set(
				'pn',
				Math.max(5, Math.min(9, Math.round(specimen.lab.parameterPathSampleCount ?? 7))).toString()
			);
			url.searchParams.set(
				'px',
				Math.max(0, Math.round(specimen.lab.parameterPathIndex ?? 0)).toString()
			);
			url.searchParams.set('card', specimen.lab.showMandelbrotLandmarks ? '1' : '0');
			url.searchParams.set('sym', specimen.lab.showMultibrotSymmetry ? '1' : '0');
			url.searchParams.set('sier', specimen.lab.sierpinskiMode ?? 'overlay');
			url.searchParams.set('ui', specimen.lab.activePanel);
		}
		await copyText(url.toString(), `Permanent link for “${specimen.name}” copied.`);
	}

	async function copyText(value: string, success: string) {
		try {
			await navigator.clipboard.writeText(value);
			announce(success);
		} catch {
			const area = document.createElement('textarea');
			area.value = value;
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.append(area);
			area.select();
			document.execCommand('copy');
			area.remove();
			announce(success);
		}
	}

	async function copyLink() {
		replaceUrlState();
		await copyText(window.location.href, 'Permanent atlas link copied.');
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1_000);
	}

	function pngDimensions() {
		const canvasSize = mainCanvas?.cssSize() ?? { width: 900, height: 600 };
		if (pngResolution === 'custom') {
			return {
				width: Math.round(customPngWidth),
				height: Math.round(customPngHeight)
			};
		}
		const multiplier =
			pngResolution === '4x' ? 4 : pngResolution === '2x' ? 2 : pngResolution === '1x' ? 1 : 1;
		return {
			width: Math.max(1, Math.round(canvasSize.width * multiplier)),
			height: Math.max(1, Math.round(canvasSize.height * multiplier))
		};
	}

	function formatMebibytes(bytes: number) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
	}

	function refreshPngExportPlan() {
		if (pngExporting) return;
		pngExportError = '';
		if (pngResolution === 'current') {
			pngExportPlan = null;
			pngExportStatus =
				'Visible composed canvas: includes the grid, orbit and selection overlays at the current device resolution.';
			return;
		}
		if (!tiledPngAvailable) {
			pngExportPlan = null;
			pngExportStatus =
				mainState.coloring === 'histogram'
					? 'Histogram equalisation needs the complete frame, so use Current composed for its genuine two-pass result.'
					: 'This progressive or vector family exports through its visible composed canvas.';
			return;
		}
		try {
			const dimensions = pngDimensions();
			const plan = createFractalPngExportPlan(cloneFractalState(mainState), dimensions);
			pngExportPlan = plan;
			const iterationNote = plan.iterations.capped
				? `${plan.iterations.effective.toLocaleString()} effective iterations (${plan.iterations.reasons.join('; ')})`
				: `${plan.iterations.effective.toLocaleString()} iterations`;
			pngExportStatus = `${plan.width.toLocaleString()} × ${plan.height.toLocaleString()} · ${plan.pixelCount.toLocaleString()} pixels · about ${formatMebibytes(plan.estimatedPeakBytes)} peak memory · ${iterationNote}.`;
		} catch (error) {
			pngExportPlan = null;
			pngExportError = error instanceof Error ? error.message : 'This export plan is not safe.';
			pngExportStatus = 'Adjust the requested dimensions before starting the export.';
		}
	}

	function pngFilename(width: number, height: number) {
		const centre = `${formatNumber(mainState.center.re, 5)}-${formatNumber(mainState.center.im, 5)}i`;
		const magnification = Math.max(1, 4 / Math.max(Number.MIN_VALUE, mainState.spanY));
		const raw = `fractal-${mainState.family}-${centre}-${formatNumber(magnification, 3)}x-${width}x${height}`;
		return `${raw
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/-+/g, '-')}.png`;
	}

	function cancelPngExport() {
		pngExportController?.abort();
	}

	async function exportPng() {
		if (pngExporting) return;
		pngExportError = '';
		pngExportProgress = 0;
		if (pngResolution === 'current') {
			pngExporting = true;
			pngExportStatus = 'Composing the visible canvas and overlays…';
			try {
				const blob = await mainCanvas?.pngBlob(includePngCaption ? pngCaption : undefined);
				if (!blob) throw new Error('The current canvas could not be exported.');
				const dimensions = mainCanvas?.cssSize() ?? { width: 1, height: 1 };
				downloadBlob(blob, pngFilename(dimensions.width, dimensions.height));
				pngExportProgress = 1;
				pngExportStatus = `PNG ready · ${formatMebibytes(blob.size)}.`;
				announce('Current composed PNG exported locally.');
			} catch (error) {
				pngExportError =
					error instanceof Error ? error.message : 'The current canvas could not be exported.';
				pngExportStatus = 'PNG export did not complete.';
			} finally {
				pngExporting = false;
			}
			return;
		}
		if (!tiledPngAvailable) {
			refreshPngExportPlan();
			announce('Choose Current composed for this family or colour mode.');
			return;
		}

		const dimensions = pngDimensions();
		let plan: FractalPngExportPlan;
		try {
			plan = createFractalPngExportPlan(cloneFractalState(mainState), dimensions);
			pngExportPlan = plan;
		} catch (error) {
			pngExportError = error instanceof Error ? error.message : 'This export plan is not safe.';
			pngExportStatus = 'PNG export did not start.';
			return;
		}

		const controller = new AbortController();
		pngExportController = controller;
		pngExporting = true;
		pngExportStatus = 'Rendering local tiles…';
		try {
			const result = await exportFractalPng(cloneFractalState(mainState), {
				width: plan.width,
				height: plan.height,
				caption: includePngCaption ? pngCaption : undefined,
				signal: controller.signal,
				onProgress(update) {
					pngExportProgress =
						update.phase === 'encoding'
							? 0.99
							: update.phase === 'complete'
								? 1
								: update.renderFraction * 0.98;
					pngExportStatus =
						update.phase === 'rendering'
							? `Rendering tile ${update.completedTiles.toLocaleString()} of ${update.totalTiles.toLocaleString()} · ${Math.round(update.renderFraction * 100)}%`
							: update.phase === 'encoding'
								? 'Encoding the completed frame as PNG…'
								: 'PNG encoding complete.';
				}
			});
			downloadBlob(result.blob, pngFilename(result.metadata.width, result.metadata.height));
			pngExportProgress = 1;
			pngExportStatus = `${result.metadata.width.toLocaleString()} × ${result.metadata.height.toLocaleString()} PNG ready · ${formatMebibytes(result.metadata.blobBytes)} · ${result.metadata.effectiveIterations.toLocaleString()} effective iterations.`;
			announce('High-resolution tiled PNG exported locally.');
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				pngExportStatus = 'PNG export cancelled; partial tiles were discarded.';
				announce('PNG export cancelled.');
			} else {
				pngExportError = error instanceof Error ? error.message : 'PNG export failed.';
				pngExportStatus = 'PNG export did not complete.';
			}
		} finally {
			if (pngExportController === controller) pngExportController = null;
			pngExporting = false;
		}
	}

	function exportSettings() {
		const payload = {
			artifact: 'Fractal Atlas specimen',
			exportedAt: new Date().toISOString(),
			selectedPoint,
			selectedPointDecimal,
			laboratory: captureSpecimenLab(),
			state: JSON.parse(serializeLocalState(mainState))
		};
		downloadBlob(
			new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
			`fractal-atlas-${mainState.family}.json`
		);
		announce('Settings JSON exported locally.');
	}

	async function importSettings(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > 256 * 1024) {
			announce('Settings import refused: the local JSON file exceeds 256 KiB.');
			return;
		}
		try {
			const payload = JSON.parse(await file.text()) as unknown;
			const candidate =
				payload && typeof payload === 'object' && 'state' in payload
					? (payload as { state: unknown }).state
					: payload;
			const result = parseLocalState(JSON.stringify(candidate));
			if (
				payload &&
				typeof payload === 'object' &&
				'selectedPoint' in payload &&
				(payload as { selectedPoint?: unknown }).selectedPoint &&
				typeof (payload as { selectedPoint: unknown }).selectedPoint === 'object'
			) {
				const selected = (payload as { selectedPoint: { re?: unknown; im?: unknown } })
					.selectedPoint;
				const re = Number(selected.re);
				const im = Number(selected.im);
				if (Number.isFinite(re) && Number.isFinite(im)) {
					const decimalCandidate =
						'selectedPointDecimal' in payload &&
						(payload as { selectedPointDecimal?: unknown }).selectedPointDecimal &&
						typeof (payload as { selectedPointDecimal: unknown }).selectedPointDecimal === 'object'
							? (
									payload as {
										selectedPointDecimal: { re?: unknown; im?: unknown };
									}
								).selectedPointDecimal
							: null;
					const exactRe =
						typeof decimalCandidate?.re === 'string' ? decimalCandidate.re : re.toString();
					const exactIm =
						typeof decimalCandidate?.im === 'string' ? decimalCandidate.im : im.toString();
					assignSelectedPoint(
						{ re, im },
						exactRe.length <= 160 &&
							exactIm.length <= 160 &&
							Number.isFinite(Number(exactRe)) &&
							Number.isFinite(Number(exactIm))
							? { re: exactRe, im: exactIm }
							: undefined
					);
				}
			}
			if (
				payload &&
				typeof payload === 'object' &&
				'laboratory' in payload &&
				(payload as { laboratory?: unknown }).laboratory &&
				typeof (payload as { laboratory: unknown }).laboratory === 'object'
			) {
				const laboratoryState = (
					payload as { laboratory: Partial<NonNullable<SavedSpecimen['lab']>> }
				).laboratory;
				if (typeof laboratoryState.comparisonState === 'string') {
					restoreSpecimenLab(laboratoryState as SavedSpecimen['lab']);
				}
			}
			stateWarnings = result.issues.map((issue) => issue.message);
			commitMain(result.state, `Imported bounded settings from ${file.name}.`);
		} catch (error) {
			announce(
				error instanceof Error
					? `Settings import failed: ${error.message}`
					: 'Settings import failed validation.'
			);
		}
	}

	function exportOrbitCsv() {
		if (!orbitResult) {
			announce('Choose an escape-time or Newton specimen before exporting an orbit.');
			return;
		}
		const rootIndex = 'rootIndex' in orbitResult ? (orbitResult.rootIndex ?? '') : '';
		const residual = 'residual' in orbitResult ? orbitResult.residual : '';
		const header = [
			'n',
			're_z',
			'im_z',
			'magnitude',
			'argument_radians',
			'previous_re',
			'previous_im',
			'final_status',
			'nearest_root_index',
			'final_residual'
		];
		const rows = orbitResult.orbit
			.slice(0, 2_000)
			.map((point) => [
				point.iteration,
				point.value.re,
				point.value.im,
				Math.hypot(point.value.re, point.value.im),
				Math.atan2(point.value.im, point.value.re),
				point.previous?.re ?? '',
				point.previous?.im ?? '',
				orbitResult.status,
				rootIndex,
				residual
			]);
		const csv = [header, ...rows]
			.map((row) =>
				row
					.map((value) => {
						const text = String(value);
						return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
					})
					.join(',')
			)
			.join('\r\n');
		downloadBlob(
			new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
			`fractal-atlas-${mainState.family}-orbit.csv`
		);
		announce(`${rows.length.toLocaleString()} orbit rows exported as CSV.`);
	}

	function createSvg(): string | null {
		if (mainState.family === 'sierpinski') {
			const triangles = recursiveSierpinskiTriangles(
				Math.min(9, Math.max(0, Math.round(mainState.exponent)))
			);
			const width = 1000;
			const height = 866;
			const polygon = triangles
				.map(({ a, b, c }) => {
					const point = (value: { x: number; y: number }) =>
						`${500 + value.x * 500},${288.7 + value.y * 577.3}`;
					return `<polygon points="${point(a)} ${point(b)} ${point(c)}"/>`;
				})
				.join('');
			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sierpiński triangle, generation ${Math.round(mainState.exponent)}"><rect width="1000" height="866" fill="#090a10"/><g fill="#e7d29b">${polygon}</g></svg>`;
		}
		if (mainState.family === 'l-system' && mainState.lSystem) {
			const expanded = expandLSystemState(mainState.lSystem);
			if (expanded.estimate.segmentCount > LSYSTEM_SVG_SEGMENT_LIMIT) return null;
			const points = expanded.segments.flatMap((segment) => [segment.from, segment.to]);
			const minX = Math.min(...points.map((point) => point.x));
			const maxX = Math.max(...points.map((point) => point.x));
			const minY = Math.min(...points.map((point) => point.y));
			const maxY = Math.max(...points.map((point) => point.y));
			const spanX = Math.max(1e-9, maxX - minX);
			const spanY = Math.max(1e-9, maxY - minY);
			const project = (point: { x: number; y: number }) => {
				const x = 30 + ((point.x - minX) / spanX) * 940;
				const y = 30 + ((maxY - point.y) / spanY) * 940;
				return `${x.toFixed(2)} ${y.toFixed(2)}`;
			};
			const path = expanded.segments
				.map((segment) => `M ${project(segment.from)} L ${project(segment.to)}`)
				.join(' ');
			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="${mainState.lSystem.presetId} L-system"><rect width="1000" height="1000" fill="#090a10"/><path d="${path}" fill="none" stroke="#e7d29b" stroke-width="${Math.max(0.5, mainState.lSystem.lineWidth)}" stroke-linecap="round"/></svg>`;
		}
		return null;
	}

	function exportSvg() {
		try {
			const svg = createSvg();
			if (!svg) {
				announce('SVG export is unavailable or exceeds the safe vector segment limit.');
				return;
			}
			downloadBlob(
				new Blob([svg], { type: 'image/svg+xml' }),
				`fractal-atlas-${mainState.family}.svg`
			);
			announce('SVG exported locally.');
		} catch (error) {
			announce(error instanceof Error ? error.message : 'SVG export failed.');
		}
	}

	function numberFromEvent(event: Event) {
		return (event.currentTarget as HTMLInputElement).valueAsNumber;
	}

	function selectFromEvent(event: Event) {
		return (event.currentTarget as HTMLSelectElement).value;
	}

	function handleLaboratoryKeydown(event: KeyboardEvent) {
		if (!laboratory?.contains(event.target as Node)) return;
		if (tourOpen) {
			if (event.key === 'Escape') {
				event.preventDefault();
				exitTourAndRestore();
			}
			return;
		}
		const target = event.target as HTMLElement;
		if (
			target.matches('input, select, textarea, [contenteditable="true"]') ||
			target.closest('input, select, textarea, [contenteditable="true"]')
		) {
			return;
		}

		const lowerKey = event.key.toLowerCase();
		if ((event.ctrlKey || event.metaKey) && !event.altKey && lowerKey === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && !event.altKey && lowerKey === 'y') {
			event.preventDefault();
			redo();
			return;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		let handled = true;
		if (event.key === '0' || event.key === 'Home' || lowerKey === 'r') resetFamily();
		else if (event.key === '[' || lowerKey === 'h') undo();
		else if (event.key === ']') redo();
		else if (lowerKey === 'g') {
			showGrid = !showGrid;
			announce(`Coordinate grid ${showGrid ? 'shown' : 'hidden'}.`);
		} else if (lowerKey === 'j' && mainState.family === 'mandelbrot') {
			setLinkedJulia(!linkedJulia);
		} else if (lowerKey === 'v') {
			setCompareMode(!compareMode);
		} else if (lowerKey === 'i') {
			activePanel = 'inspect';
			announce('Orbit inspector opened.');
		} else if (lowerKey === 'o') {
			activePanel = activePanel === 'inspect' ? 'explore' : 'inspect';
			announce(activePanel === 'inspect' ? 'Orbit inspector opened.' : 'Orbit inspector closed.');
		} else if (lowerKey === 'c') {
			activePanel = 'colour';
			announce('Palette laboratory opened.');
		} else if (lowerKey === 'p') {
			activePanel = 'presets';
			announce('Field expeditions opened.');
		} else if (lowerKey === 'f') {
			void toggleFullscreen();
		} else if (
			(event.key === '+' || event.key === '=') &&
			!target.closest('[role="application"]')
		) {
			zoom(0.68);
		} else if (
			(event.key === '-' || event.key === '_') &&
			!target.closest('[role="application"]')
		) {
			zoom(1.46);
		} else {
			handled = false;
		}
		if (handled) event.preventDefault();
	}

	$effect(() => {
		void activePanel;
		void pngResolution;
		void customPngWidth;
		void customPngHeight;
		void mainState.family;
		void mainState.coloring;
		void mainState.maxIterations;
		if (activePanel === 'export') untrack(refreshPngExportPlan);
	});

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const mobileQuery = window.matchMedia('(max-width: 50rem)');
		const updateMotion = () => {
			reducedMotion = motionQuery.matches;
			if (reducedMotion) {
				stopParameterPathAnimation(
					'Parameter-path animation paused because reduced motion is preferred.'
				);
				stopLSystemGrowth('L-system growth animation paused because reduced motion is preferred.');
			}
		};
		const updateMobileLayout = () => {
			mobileLayout = mobileQuery.matches;
			if (!mobileLayout) activePlane = 'primary';
		};
		const updateFullscreen = () => {
			const nextFullscreen = document.fullscreenElement === laboratory;
			if (fullscreen && !nextFullscreen) {
				const returnTarget = fullscreenReturnFocus;
				fullscreenReturnFocus = null;
				requestAnimationFrame(() => returnTarget?.focus());
			}
			fullscreen = nextFullscreen;
		};
		const updatePngPlan = () => {
			if (activePanel === 'export') refreshPngExportPlan();
		};
		updateMotion();
		updateMobileLayout();
		loadUrlState();
		loadSpecimens();
		historyReady = true;
		hydrated = true;
		window.addEventListener('fractal-atlas-command', handleNarrativeCommand);
		window.addEventListener('popstate', handlePopState);
		window.addEventListener('keydown', handleLaboratoryKeydown);
		window.addEventListener('resize', updatePngPlan);
		motionQuery.addEventListener('change', updateMotion);
		mobileQuery.addEventListener('change', updateMobileLayout);
		document.addEventListener('fullscreenchange', updateFullscreen);
		return () => {
			window.removeEventListener('fractal-atlas-command', handleNarrativeCommand);
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('keydown', handleLaboratoryKeydown);
			window.removeEventListener('resize', updatePngPlan);
			motionQuery.removeEventListener('change', updateMotion);
			mobileQuery.removeEventListener('change', updateMobileLayout);
			document.removeEventListener('fullscreenchange', updateFullscreen);
			cancelPendingUrlReplace();
			if (flashTimer) clearTimeout(flashTimer);
			stopParameterPathAnimation();
			stopLSystemGrowth();
			pngExportController?.abort();
		};
	});
</script>

<section
	bind:this={laboratory}
	id="fractal-atlas-laboratory"
	data-testid="fractal-atlas-lab"
	data-family={mainState.family}
	data-backend={backend}
	data-hydrated={hydrated}
	data-progress={progress}
	class:flash
	class="atlas article-breakout not-prose"
	aria-labelledby="fractal-atlas-heading"
>
	<div class="atlas-js">
		<header class="atlas-header">
			<div class="title-lockup">
				<p>Live field instrument · schema v1</p>
				<h2 id="fractal-atlas-heading">The Fractal Atlas</h2>
				<span>{family.passport.computationalClass.replaceAll('-', ' ')}</span>
			</div>
			<div class="history-tools" aria-label="Atlas history and view controls">
				<button
					type="button"
					onclick={undo}
					disabled={!undoStack.length}
					title="Undo"
					aria-label="Undo"
					aria-keyshortcuts="Control+Z Meta+Z H">↶ <span>Undo</span></button
				>
				<button
					type="button"
					onclick={redo}
					disabled={!redoStack.length}
					title="Redo"
					aria-label="Redo"
					aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y">↷ <span>Redo</span></button
				>
				<button
					type="button"
					onclick={resetFamily}
					title="Reset current family (R or 0)"
					aria-keyshortcuts="R 0">⌂ <span>Reset</span></button
				>
				<button
					type="button"
					onclick={resetAtlas}
					title="Reset every atlas instrument"
					aria-label="Reset all"
				>
					↺ <span>Reset all</span>
				</button>
				<button type="button" onclick={() => zoom(0.68)} title="Zoom in"
					>＋ <span class="sr-only">Zoom in</span></button
				>
				<button type="button" onclick={() => zoom(1.46)} title="Zoom out"
					>− <span class="sr-only">Zoom out</span></button
				>
				<button
					type="button"
					onclick={toggleFullscreen}
					aria-pressed={fullscreen}
					aria-keyshortcuts="F"
				>
					{fullscreen ? '↙' : '↗'} <span>{fullscreen ? 'Exit' : 'Full'}</span>
				</button>
			</div>
			<nav class="zoom-breadcrumb" aria-label="Zoom breadcrumb">
				<span class="breadcrumb-family">{activeFamilyName}</span>
				{#each zoomBreadcrumb as crumb, index (`${crumb.state.spanY}:${index}`)}
					<span aria-hidden="true">›</span>
					{#if index === zoomBreadcrumb.length - 1}
						<span aria-current="location">{crumb.label}</span>
					{:else}
						<button
							type="button"
							onclick={() => restoreZoomBreadcrumb(crumb.state)}
							aria-label={`Return to ${crumb.label} magnification`}>{crumb.label}</button
						>
					{/if}
				{/each}
			</nav>
		</header>

		<div class="family-rack" aria-label="Fractal families">
			{#each FAMILY_GROUPS as group (group.label)}
				<div class="family-group">
					<span>{group.label}</span>
					<div>
						{#each group.families as item (item.id)}
							<button
								type="button"
								class:active={mainState.family === item.id}
								aria-pressed={mainState.family === item.id}
								onclick={() => chooseFamily(item.id)}
							>
								{item.label}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		{#if mobileLayout && hasCompanion}
			<div class="plane-tabs" role="tablist" aria-label="Visible fractal plane">
				<button
					id="atlas-primary-plane-tab"
					type="button"
					role="tab"
					aria-selected={activePlane === 'primary'}
					aria-controls="atlas-primary-plane"
					tabindex={activePlane === 'primary' ? 0 : -1}
					class:active={activePlane === 'primary'}
					onclick={() => setActivePlane('primary')}
					onkeydown={handlePlaneTabKeydown}
				>
					A · {activeFamilyName}
				</button>
				<button
					id="atlas-companion-plane-tab"
					type="button"
					role="tab"
					aria-selected={activePlane === 'companion'}
					aria-controls="atlas-companion-plane"
					tabindex={activePlane === 'companion' ? 0 : -1}
					class:active={activePlane === 'companion'}
					onclick={() => setActivePlane('companion')}
					onkeydown={handlePlaneTabKeydown}
				>
					{companionTabLabel}
				</button>
			</div>
		{/if}

		<div
			class:compare={compareMode}
			class:with-companion={mainState.family === 'mandelbrot' && linkedJulia && !compareMode}
			class="canvas-rack"
			style:--compare-split={`${compareSplit}%`}
		>
			<div
				id="atlas-primary-plane"
				class="primary-plane"
				role={mobileLayout && hasCompanion ? 'tabpanel' : undefined}
				aria-labelledby={mobileLayout && hasCompanion ? 'atlas-primary-plane-tab' : undefined}
				hidden={mobileLayout && hasCompanion && activePlane !== 'primary'}
			>
				<div class="plane-label">
					<span>{activeFamilyName}</span>
					<code>{activeFormula}</code>
				</div>
				<FractalCanvas
					bind:this={mainCanvas}
					viewState={mainState}
					{selectedPoint}
					{selectedPointDecimal}
					orbitOverlay={mainState.family === 'buddhabrot' ? ghostOrbit : []}
					{showGrid}
					guideOverlay={mainGuideOverlay}
					{sierpinskiMode}
					label={`${activeFamilyName} interactive plane`}
					onviewchange={handleCanvasChange}
					onviewcommit={handleViewCommit}
					onprobe={handleProbe}
					onhover={(point, decimal) => {
						hoverPoint = point;
						hoverPointDecimal = decimal ?? null;
					}}
					onstatus={handleCanvasStatus}
					onprogress={handleProgress}
					onprecision={(diagnostics) => (precisionDiagnostics = diagnostics)}
					onsize={(metrics) => (mainCanvasMetrics = metrics)}
				/>
			</div>

			{#if compareMode}
				<div
					id="atlas-companion-plane"
					class="companion-plane compare-plane"
					role={mobileLayout ? 'tabpanel' : undefined}
					aria-labelledby={mobileLayout ? 'atlas-companion-plane-tab' : undefined}
					hidden={mobileLayout && activePlane !== 'companion'}
				>
					<div class="plane-label">
						<span>Comparison · {getFamilyDefinition(displayedComparison.family).passport.name}</span
						>
						<code>{getFamilyDefinition(displayedComparison.family).passport.formula}</code>
					</div>
					<FractalCanvas
						viewState={displayedComparison}
						{selectedPoint}
						{selectedPointDecimal}
						{showGrid}
						interactive={!linkComparisonViewport}
						label={`${getFamilyDefinition(displayedComparison.family).passport.name} comparison plane`}
						onviewchange={handleComparisonCanvasChange}
						onviewcommit={handleComparisonViewCommit}
					/>
				</div>
			{:else if mainState.family === 'mandelbrot' && linkedJulia}
				<div
					id="atlas-companion-plane"
					class="companion-plane julia-plane"
					role={mobileLayout ? 'tabpanel' : undefined}
					aria-labelledby={mobileLayout ? 'atlas-companion-plane-tab' : undefined}
					hidden={mobileLayout && activePlane !== 'companion'}
				>
					<div class="plane-label">
						<span
							>Linked Julia · c = {decimalComplexLabel(
								linkedParameter,
								linkedParameterDecimal
							)}</span
						>
						<code>pixel → z₀ · c fixed</code>
					</div>
					<FractalCanvas
						viewState={linkedJuliaState}
						selectedPoint={null}
						showGrid={false}
						interactive={false}
						linked={true}
						label={`Linked Julia preview for c equals ${decimalComplexLabel(linkedParameter, linkedParameterDecimal)}`}
					/>
				</div>
			{/if}
		</div>

		<div class="readout-strip">
			<div>
				<span>Pointer / pinned coordinate</span>
				<code>{decimalComplexLabel(pointerCoordinate, pointerCoordinateDecimal)}</code>
			</div>
			<div>
				<span>Centre</span>
				<code>{complexLabel(mainState.center)}</code>
			</div>
			<div>
				<span>Vertical span</span>
				<code>{mainState.spanY.toExponential(4)}</code>
			</div>
			<div>
				<span>Backend</span>
				<code>{backend}</code>
			</div>
			<p>{renderStatus}</p>
		</div>
		<p class="sr-only" aria-live="polite">{status}</p>

		<details class="passport-drawer">
			<summary>
				<span>Family passport · {activeFamilyName}</span>
				<code>{activeFormula}</code>
			</summary>
			<FamilyPassport family={mainState.family} />
		</details>

		{#if progressiveFamily}
			<div class="progress-strip">
				<div
					class="progress-meter"
					role="progressbar"
					aria-label={mainState.family === 'buddhabrot'
						? 'Buddhabrot orbit samples'
						: 'Barnsley fern points'}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(progress * 100)}
					aria-valuetext={progressCountLabel || progressLabel || 'Preparing a deterministic batch'}
				>
					<span style:width={`${Math.round(progress * 100)}%`}></span>
				</div>
				<p>
					<strong>{mainState.family === 'buddhabrot' ? 'Orbit samples' : 'Fern points'}:</strong>
					{progressCountLabel || '0 processed'}
					{#if progressLabel && progressLabel !== progressCountLabel}
						<small>{progressLabel}</small>
					{/if}
				</p>
				{#if mainState.family === 'buddhabrot'}
					<p class="confidence-note" aria-live="polite">
						<strong>Sampling confidence: {buddhabrotConfidence.level}.</strong>
						{#if buddhabrotConfidence.candidates > 0}
							<small>
								Global Monte Carlo grain proxy ≈ {buddhabrotConfidence.proxyPercent.toFixed(2)}%
								(1/√N across {buddhabrotConfidence.candidates.toLocaleString()} seeded candidates); sparse
								pixels remain noisier. {buddhabrotConfidence.accepted.toLocaleString()} accepted orbits
								currently support the field.
							</small>
						{:else}
							<small>
								No statistical confidence is claimed until seeded candidate batches arrive.
							</small>
						{/if}
					</p>
				{/if}
				<nav aria-label="Progressive render controls">
					<button type="button" onclick={() => mainCanvas?.runProgressive()}>Run</button>
					<button type="button" onclick={() => mainCanvas?.pauseProgressive()}>Pause</button>
					<button type="button" onclick={() => mainCanvas?.stepProgressive()}>One batch</button>
					<button type="button" onclick={() => mainCanvas?.restartProgressive()}
						>Restart seed</button
					>
					{#if mainState.family === 'buddhabrot'}
						<button
							type="button"
							aria-pressed={ghostOrbit.length > 0}
							onclick={() => {
								if (ghostOrbit.length) {
									ghostOrbit = [];
									ghostParameter = null;
									announce('Ghost-orbit overlay hidden.');
								} else {
									findGhostOrbit();
								}
							}}
						>
							{ghostOrbit.length ? 'Hide ghost orbit' : 'Show one ghost orbit'}
						</button>
					{/if}
				</nav>
				{#if mainState.family === 'buddhabrot' && ghostParameter && ghostOrbit.length}
					<small class="ghost-note">
						One accepted path for c = {complexLabel(ghostParameter)} is overlaid. The density image accumulates
						many such escaped paths; this line is an example, not the whole field.
					</small>
				{/if}
			</div>
		{/if}

		<nav class="panel-tabs" aria-label="Fractal Atlas instruments">
			{#each PANEL_LABELS as panel (panel.id)}
				<button
					type="button"
					class:active={activePanel === panel.id}
					aria-pressed={activePanel === panel.id}
					aria-label={panel.label}
					aria-keyshortcuts={panel.id === 'inspect' ? 'O' : undefined}
					onclick={() => selectPanel(panel.id)}
				>
					<span class="wide-label">{panel.label}</span>
					<span class="short-label">{panel.short}</span>
				</button>
			{/each}
		</nav>

		<div class="instrument-bay">
			{#if activePanel === 'explore'}
				<div class="panel-stack explore-panel">
					<section class="control-card" aria-labelledby="atlas-navigation-heading">
						<div class="card-heading">
							<div>
								<p>Navigation desk</p>
								<h3 id="atlas-navigation-heading">Move, link and compare</h3>
							</div>
							<button type="button" class="tour-button" onclick={startTour}
								>Start guided tour</button
							>
						</div>
						<p class="help">
							Drag to pan; Shift-drag draws a rectangular zoom. Wheel, double-click or pinch zooms
							beneath the pointer. Click a pixel to pin its orbit, or drag the pinned crosshair.
							Keyboard: arrows and +/− navigate; Alt+arrows move the crosshair one pixel (Shift+Alt
							moves eight); R, 0 or Home resets; H or [ returns to the previous view and ] moves
							forward; O toggles the Orbit Inspector (I also opens it); C and P open Colour and
							Presets; J links Julia; V compares; G toggles the grid; F toggles fullscreen; Escape
							releases touch navigation or closes the active overlay.
						</p>
						<div class="toggle-grid">
							<label>
								<input
									type="checkbox"
									checked={showGrid}
									onchange={(event) => (showGrid = event.currentTarget.checked)}
								/>
								<span><b>Coordinate grid</b><small>Axes and scale marks</small></span>
							</label>
							<label>
								<input
									type="checkbox"
									checked={linkedJulia}
									disabled={mainState.family !== 'mandelbrot'}
									onchange={(event) => setLinkedJulia(event.currentTarget.checked)}
								/>
								<span><b>Linked Julia</b><small>Preview c under the pointer</small></span>
							</label>
							<label>
								<input
									type="checkbox"
									checked={compareMode}
									onchange={(event) => setCompareMode(event.currentTarget.checked)}
								/>
								<span><b>Compare mode</b><small>One common instrument, two panes</small></span>
							</label>
							<label>
								<input
									type="checkbox"
									checked={mainState.analyticInteriorTests}
									onchange={(event) =>
										commitMain(
											{ ...mainState, analyticInteriorTests: event.currentTarget.checked },
											'Analytic interior tests changed.'
										)}
								/>
								<span
									><b>Analytic interior tests</b><small>Quadratic cardioid and bulbs</small></span
								>
							</label>
							<label>
								<input
									type="checkbox"
									checked={showMandelbrotLandmarks}
									disabled={mainState.family !== 'mandelbrot'}
									onchange={(event) => {
										showMandelbrotLandmarks = event.currentTarget.checked;
										commitUrlState();
									}}
								/>
								<span
									><b>Cardioid + bulb guide</b><small>Analytic boundaries, clearly overlaid</small
									></span
								>
							</label>
							<label>
								<input
									type="checkbox"
									checked={showMultibrotSymmetry}
									disabled={mainState.family !== 'multibrot'}
									onchange={(event) => {
										showMultibrotSymmetry = event.currentTarget.checked;
										commitUrlState();
									}}
								/>
								<span
									><b>Degree symmetry guide</b><small
										>{Math.max(1, Math.round(mainState.exponent) - 1)}-fold parameter guide</small
									></span
								>
							</label>
						</div>
						<div class="quality-row">
							<span>Render quality</span>
							{#each [{ id: 'battery', label: 'battery saver' }, { id: 'draft', label: 'draft' }, { id: 'balanced', label: 'balanced' }, { id: 'high', label: 'high' }] as quality (quality.id)}
								<button
									type="button"
									class:active={mainState.renderQuality === quality.id}
									onclick={() => setRenderQuality(quality.id as RenderQuality)}
									>{quality.label}</button
								>
							{/each}
						</div>
						<fieldset class="viewport-editor">
							<legend>Exact viewport</legend>
							<div class="field-grid">
								<label>
									<span>Centre real · decimal string</span>
									<input
										type="text"
										inputmode="decimal"
										maxlength="128"
										spellcheck="false"
										value={mainState.centerDecimal?.re ?? mainState.center.re.toString()}
										onchange={(event) => updateExactCenter('re', event.currentTarget.value)}
									/>
								</label>
								<label>
									<span>Centre imaginary · decimal string</span>
									<input
										type="text"
										inputmode="decimal"
										maxlength="128"
										spellcheck="false"
										value={mainState.centerDecimal?.im ?? mainState.center.im.toString()}
										onchange={(event) => updateExactCenter('im', event.currentTarget.value)}
									/>
								</label>
								<label>
									<span>Vertical span</span>
									<input
										type="number"
										min="1e-35"
										max="1e6"
										step="any"
										value={mainState.spanY}
										onchange={(event) => updateViewportSpan(numberFromEvent(event))}
									/>
								</label>
							</div>
							<div class="button-row">
								<button
									type="button"
									onclick={() =>
										copyText(
											`${mainState.centerDecimal?.re ?? mainState.center.re.toString()}, ${mainState.centerDecimal?.im ?? mainState.center.im.toString()}`,
											'Exact centre coordinate copied.'
										)}>Copy exact centre</button
								>
								<button type="button" onclick={() => zoom(0.5)}>Zoom 2×</button>
								<button type="button" onclick={() => zoom(2)}>Zoom out 2×</button>
							</div>
						</fieldset>
						{#if compareMode}
							<div class="compare-controls">
								<label>
									<span>Second family</span>
									<select
										value={comparisonState.family}
										onchange={(event) =>
											chooseComparisonFamily(selectFromEvent(event) as FractalFamily)}
									>
										{#each FAMILY_GROUPS.flatMap((group) => group.families) as item (item.id)}
											<option value={item.id}>{item.label}</option>
										{/each}
									</select>
								</label>
								<label class="inline-check">
									<input
										type="checkbox"
										checked={linkComparisonViewport}
										onchange={(event) => (linkComparisonViewport = event.currentTarget.checked)}
									/>
									Link viewport
								</label>
								<label class="inline-check">
									<input
										type="checkbox"
										checked={linkComparisonColour}
										onchange={(event) => (linkComparisonColour = event.currentTarget.checked)}
									/>
									Link palette / colouring
								</label>
								<label class="inline-check">
									<input
										type="checkbox"
										checked={linkComparisonIterations}
										onchange={(event) => (linkComparisonIterations = event.currentTarget.checked)}
									/>
									Link iteration budget
								</label>
							</div>
							<div class="compare-divider-control">
								<label>
									<span>Pane divider · A {compareSplit}% / B {100 - compareSplit}%</span>
									<input
										type="range"
										min="25"
										max="75"
										step="1"
										bind:value={compareSplit}
										disabled={compareSplitLocked}
										aria-label="Comparison pane divider"
									/>
								</label>
								<label class="inline-check">
									<input type="checkbox" bind:checked={compareSplitLocked} />
									Lock divider
								</label>
							</div>
							<div class="compare-actions">
								<button type="button" onclick={swapComparisonPlanes}>Swap A ↔ B</button>
								<button type="button" onclick={() => setCompareMode(false)}>Exit compare</button>
							</div>
						{/if}
						<div class="parameter-pins" aria-labelledby="parameter-pins-heading">
							<div>
								<p>Two nearby laws</p>
								<h4 id="parameter-pins-heading">Pinned Julia parameters</h4>
							</div>
							<dl>
								<div>
									<dt>A</dt>
									<dd><code>{decimalComplexLabel(parameterA, parameterADecimal)}</code></dd>
								</div>
								<div>
									<dt>B</dt>
									<dd><code>{decimalComplexLabel(parameterB, parameterBDecimal)}</code></dd>
								</div>
								<div>
									<dt>Δc</dt>
									<dd>
										<code
											>{parameterDeltaDecimal.re}
											{parameterDeltaDecimal.im.startsWith('-') ? '−' : '+'}
											{parameterDeltaDecimal.im.replace(/^-/, '')}i</code
										>
										<small>|Δc| = {parameterDeltaDecimal.magnitude}</small>
									</dd>
								</div>
							</dl>
							<div>
								<button
									type="button"
									onclick={() => pinParameter('A')}
									disabled={mainState.family !== 'mandelbrot'}>Pin selected as A</button
								>
								<button
									type="button"
									onclick={() => pinParameter('B')}
									disabled={mainState.family !== 'mandelbrot'}>Pin selected as B</button
								>
								<button type="button" onclick={comparePinnedJulias}>Compare Julia A / B</button>
								<button
									type="button"
									aria-expanded={parameterPathOpen}
									aria-controls="parameter-path-laboratory"
									onclick={toggleParameterPath}
									>{parameterPathOpen ? 'Close Julia path' : 'Build Julia path A → B'}</button
								>
							</div>
							<small>
								Pin A and B from the Mandelbrot plane, then compare their critical orbits by
								swapping the two Julia panes and opening Orbit.
							</small>
						</div>
						{#if parameterPathOpen}
							<section
								id="parameter-path-laboratory"
								class="parameter-path-lab"
								aria-labelledby="parameter-path-heading"
							>
								<div class="parameter-path-heading">
									<div>
										<p>Bounded c-plane transect</p>
										<h4 id="parameter-path-heading">Julia strip from A to B</h4>
									</div>
									<code>{parameterPathSamples.length} exact samples</code>
								</div>
								<p class="help">
									The line is defined by pinned A and B. Each thumbnail fixes one interpolated value
									of c; selecting it moves the Mandelbrot marker and linked Julia law.
								</p>
								<div class="parameter-path-controls">
									<label>
										<span>Samples · bounded 5–9</span>
										<input
											type="number"
											min="5"
											max="9"
											step="1"
											value={parameterPathSampleCount}
											onchange={(event) => changeParameterPathSampleCount(numberFromEvent(event))}
										/>
									</label>
									<label class="path-scrubber">
										<span
											>Active sample {Math.min(parameterPathIndex + 1, parameterPathSamples.length)}
											of {parameterPathSamples.length}</span
										>
										<input
											type="range"
											min="0"
											max={Math.max(0, parameterPathSamples.length - 1)}
											step="1"
											value={parameterPathIndex}
											aria-label="Scrub through Julia parameter path"
											oninput={(event) => {
												stopParameterPathAnimation();
												selectParameterPathSample(numberFromEvent(event), false);
											}}
											onchange={(event) => selectParameterPathSample(numberFromEvent(event), true)}
										/>
									</label>
									<button
										type="button"
										aria-pressed={parameterPathPlaying}
										disabled={reducedMotion}
										onclick={toggleParameterPathAnimation}
									>
										{parameterPathPlaying ? 'Pause path' : 'Play path'}
									</button>
								</div>
								{#if reducedMotion}
									<small class="motion-note">
										Animation is disabled by the reduced-motion preference. Thumbnails, selection
										and the scrubber remain fully available.
									</small>
								{/if}
								<div class="parameter-path-strip" aria-label="Julia thumbnails along A to B">
									{#each parameterPathSamples as sample (sample.index)}
										<article class:active={sample.index === parameterPathIndex}>
											<div class="parameter-path-canvas" aria-hidden="true">
												<FractalCanvas
													viewState={sample.state}
													selectedPoint={null}
													showGrid={false}
													interactive={false}
													linked={true}
													label={`Julia thumbnail ${sample.index + 1}`}
												/>
											</div>
											<button
												type="button"
												aria-pressed={sample.index === parameterPathIndex}
												aria-label={`Select Julia sample ${sample.index + 1} of ${parameterPathSamples.length}, c ${decimalComplexLabel(sample.parameter, sample.decimal)}`}
												onclick={() => {
													stopParameterPathAnimation();
													selectParameterPathSample(sample.index);
												}}
											>
												<b
													>{sample.index === 0
														? 'A'
														: sample.index === parameterPathSamples.length - 1
															? 'B'
															: `t = ${sample.t}`}</b
												>
												<code>{decimalComplexLabel(sample.parameter, sample.decimal)}</code>
											</button>
										</article>
									{/each}
								</div>
								<small class="path-state-note">
									The endpoints, sample count, selected sample and open state travel with copied
									links and saved specimens. Playback state does not: animation never starts on
									load.
								</small>
							</section>
						{/if}
					</section>
				</div>
			{:else if activePanel === 'inspect'}
				<div class="panel-stack">
					{#if guidedOrbitResults.length}
						<section class="control-card guided-orbit-comparison">
							<p>Guided comparison · three fates</p>
							<h3>One quick escape, one certificate, one finite unresolved orbit</h3>
							<div>
								{#each guidedOrbitResults as sample (sample.label)}
									<article>
										<div>
											<strong>{sample.label}</strong>
											<code>{complexLabel(sample.point)}</code>
										</div>
										<dl>
											<div>
												<dt>Finite result</dt>
												<dd>{sample.result.status}</dd>
											</div>
											<div>
												<dt>Iterations</dt>
												<dd>{sample.result.iterations}</dd>
											</div>
										</dl>
										{#if sample.certificate}
											<small>{sample.certificate}</small>
										{:else if sample.result.status === 'max-iterations'}
											<small>Unresolved at this cap is not a membership proof.</small>
										{:else}
											<small>The orbit crosses the displayed bailout radius.</small>
										{/if}
										<button
											type="button"
											onclick={() => {
												assignSelectedPoint(sample.point);
												announce(`${sample.label} loaded into the detailed orbit table.`);
											}}>Inspect this orbit</button
										>
									</article>
								{/each}
							</div>
						</section>
					{/if}
					{#if pinnedCriticalOrbits.length}
						<section class="control-card guided-orbit-comparison">
							<p>A/B critical-orbit ledger</p>
							<h3>Nearby parameters, two Julia laws</h3>
							<div>
								{#each pinnedCriticalOrbits as entry (entry.label)}
									<article>
										<div>
											<strong>Parameter {entry.label}</strong>
											<code>{decimalComplexLabel(entry.parameter, entry.parameterDecimal)}</code>
										</div>
										<dl>
											<div>
												<dt>Critical orbit</dt>
												<dd>{entry.result.status}</dd>
											</div>
											<div>
												<dt>Iterations</dt>
												<dd>{entry.result.iterations}</dd>
											</div>
										</dl>
										<small>
											The critical start is z₀ = 0; the side-by-side panes show the full dynamical
											planes.
										</small>
										<button
											type="button"
											onclick={() => inspectPinnedCritical(entry.label as 'A' | 'B')}
											>Inspect orbit {entry.label}</button
										>
									</article>
								{/each}
							</div>
						</section>
					{/if}
					{#if orbitResult}
						<OrbitInspector
							result={orbitResult}
							selected={selectedPoint}
							family={mainState.family}
							juliaC={mainState.juliaC}
						/>
					{:else}
						<section class="control-card empty-instrument">
							<p>Probe instrument</p>
							<h3>
								This family does not assign one escape or convergence orbit to each display pixel.
							</h3>
							<p class="help">
								Use the progressive counters for density and IFS families. Return to Mandelbrot,
								Julia, a related escape map, or Newton to inspect a numbered complex orbit.
							</p>
						</section>
					{/if}
					<section class="control-card">
						<p>Selected coordinate</p>
						<h3>{decimalComplexLabel(selectedPoint, selectedPointDecimal)}</h3>
						<div class="button-row">
							<button
								type="button"
								onclick={() =>
									copyText(
										decimalComplexLabel(selectedPoint, selectedPointDecimal),
										'Coordinate copied.'
									)}>Copy coordinate</button
							>
							<button
								type="button"
								onclick={() => assignSelectedPoint(mainState.center, mainState.centerDecimal)}
								>Use centre</button
							>
						</div>
					</section>
				</div>
			{:else if activePanel === 'colour'}
				<div class="panel-stack">
					<PaletteLab
						state={mainState}
						onchange={(next) => commitMain(next, 'Palette laboratory updated.')}
					/>
					<section
						class="control-card colour-costume-lab"
						aria-labelledby="colour-costumes-heading"
					>
						<p>Same mathematics, four costumes</p>
						<h3 id="colour-costumes-heading">Hold the coordinates still; change the encoding</h3>
						{#if supportsFourCostumes}
							<div>
								{#each colourCostumeStates as costume (costume.mode)}
									<figure>
										<div>
											<FractalCanvas
												viewState={costume.state}
												selectedPoint={null}
												showGrid={false}
												interactive={false}
												label={`${costume.label} comparison of the current ${activeFamilyName} region`}
											/>
										</div>
										<figcaption>
											<b>{costume.label}</b>
											<code>{costume.mode}</code>
										</figcaption>
									</figure>
								{/each}
							</div>
							<p class="help">
								All four panes use the same centre, span, recurrence and bounded iteration field.
								Only the numerical-to-visual mapping changes.
							</p>
						{:else}
							<p class="help">
								This four-way comparison is available for Mandelbrot, Julia and holomorphic
								Multibrot views, where all four displayed methods are mathematically supported.
							</p>
						{/if}
					</section>
				</div>
			{:else if activePanel === 'formula'}
				<div class="panel-stack">
					<section class="control-card" aria-labelledby="formula-controls-heading">
						<div class="card-heading">
							<div>
								<p>Bounded parameters</p>
								<h3 id="formula-controls-heading">{activeFormula}</h3>
							</div>
							<span class="class-badge">{mainState.plane} plane</span>
						</div>
						<div class="field-grid">
							{#if family.supportedPlanes.length > 1}
								<label>
									<span>Mathematical plane</span>
									<select
										value={mainState.plane}
										onchange={(event) =>
											setPlane(selectFromEvent(event) as FractalViewState['plane'])}
									>
										{#each family.supportedPlanes as plane (plane)}
											<option value={plane}>{plane}</option>
										{/each}
									</select>
								</label>
							{/if}
							<label>
								<span>Iteration limit</span>
								<input
									type="number"
									min="24"
									max="2048"
									step="10"
									value={mainState.maxIterations}
									onchange={(event) =>
										updateNumber(
											'maxIterations',
											numberFromEvent(event),
											'Iteration limit changed.'
										)}
								/>
							</label>
							{#if isEscapeTimeFamily(mainState.family)}
								<label>
									<span>Bailout radius</span>
									<input
										type="number"
										min="2"
										max="1000"
										step="0.5"
										value={mainState.bailout}
										onchange={(event) =>
											updateNumber('bailout', numberFromEvent(event), 'Bailout radius changed.')}
									/>
								</label>
							{/if}
							<label>
								<span>Seed</span>
								<input
									type="number"
									min="0"
									max="2147483647"
									step="1"
									value={mainState.seed}
									onchange={(event) =>
										commitMain(
											{ ...mainState, seed: numberFromEvent(event) },
											'Deterministic seed changed.'
										)}
								/>
							</label>
						</div>

						{#if mainState.family === 'multibrot'}
							<label class="range-field">
								<span>Integer degree d <b>{mainState.exponent}</b></span>
								<input
									type="range"
									min="2"
									max="8"
									step="1"
									value={mainState.exponent}
									oninput={(event) => updateMultibrotDegree(numberFromEvent(event))}
								/>
							</label>
							<div class="button-row">
								<button type="button" onclick={fitMultibrotDegree}
									>Fit degree-{Math.round(mainState.exponent)} overview</button
								>
								<button
									type="button"
									aria-pressed={showMultibrotSymmetry}
									onclick={() => {
										showMultibrotSymmetry = !showMultibrotSymmetry;
										commitUrlState();
									}}
									>{showMultibrotSymmetry ? 'Hide' : 'Show'}
									{Math.max(1, Math.round(mainState.exponent) - 1)}-fold symmetry guide</button
								>
							</div>
						{/if}

						{#if mainState.family === 'custom-map' && activeCustomMap}
							<fieldset class="map-workshop" data-testid="map-workshop">
								<legend>Constrained Map Workshop</legend>
								<div class="map-identity" class:unclassified={!customMapIdentity?.conventional}>
									<div>
										<span>Current identity</span>
										<strong>{customMapIdentity?.label ?? 'Custom map'}</strong>
									</div>
									<code>{activeFormula}</code>
								</div>
								{#if !customMapIdentity?.conventional}
									<p class="workshop-warning" role="status">
										<strong>Custom map.</strong> This bounded recipe has no conventional family name here;
										the atlas makes no claim that it has established mathematical significance.
									</p>
								{/if}
								<div class="field-grid">
									<label>
										<span>Integer power</span>
										<input
											type="number"
											min="2"
											max="12"
											step="1"
											value={activeCustomMap.power}
											onchange={(event) => updateCustomMapPower(numberFromEvent(event))}
										/>
									</label>
									<label>
										<span>Initial z rule</span>
										<select
											value={activeCustomMap.initialZ}
											onchange={(event) =>
												updateCustomMapInitialZ(selectFromEvent(event) as CustomMapInitialZRule)}
										>
											<option value="plane-default">Plane default</option>
											<option value="zero">z₀ = 0</option>
											<option value="pixel">z₀ = pixel</option>
											<option value="parameter">z₀ = c</option>
										</select>
									</label>
								</div>
								<div class="workshop-switches">
									<label class="inline-check">
										<input
											type="checkbox"
											checked={activeCustomMap.conjugateBeforePower}
											onchange={(event) =>
												updateCustomMapBoolean('conjugateBeforePower', event.currentTarget.checked)}
										/>
										Conjugate z before the power
									</label>
									<label class="inline-check">
										<input
											type="checkbox"
											checked={activeCustomMap.absoluteReal}
											onchange={(event) =>
												updateCustomMapBoolean('absoluteReal', event.currentTarget.checked)}
										/>
										Absolute value of the real part
									</label>
									<label class="inline-check">
										<input
											type="checkbox"
											checked={activeCustomMap.absoluteImaginary}
											onchange={(event) =>
												updateCustomMapBoolean('absoluteImaginary', event.currentTarget.checked)}
										/>
										Absolute value of the imaginary part
									</label>
									<label class="inline-check">
										<input
											type="checkbox"
											checked={activeCustomMap.addC}
											onchange={(event) =>
												updateCustomMapBoolean('addC', event.currentTarget.checked)}
										/>
										Add c after the power
									</label>
									<label class="inline-check">
										<input
											type="checkbox"
											checked={activeCustomMap.memoryEnabled}
											onchange={(event) =>
												updateCustomMapBoolean('memoryEnabled', event.currentTarget.checked)}
										/>
										Add a Phoenix-style previous-iterate memory term
									</label>
								</div>
								{#if activeCustomMap.memoryEnabled}
									<fieldset class="memory-coefficient">
										<legend>Complex memory coefficient</legend>
										<div class="field-grid">
											<label>
												<span>Real</span>
												<input
													type="number"
													min="-16"
													max="16"
													step="0.01"
													value={activeCustomMap.memoryCoefficient.re}
													onchange={(event) => updateCustomMapMemory('re', numberFromEvent(event))}
												/>
											</label>
											<label>
												<span>Imaginary</span>
												<input
													type="number"
													min="-16"
													max="16"
													step="0.01"
													value={activeCustomMap.memoryCoefficient.im}
													onchange={(event) => updateCustomMapMemory('im', numberFromEvent(event))}
												/>
											</label>
										</div>
									</fieldset>
								{/if}
								<div class="workshop-actions">
									<button type="button" onclick={returnToKnownFamily}>Return to known family</button
									>
									<button type="button" onclick={saveMutation}>Save mutation</button>
									<button type="button" onclick={copyMutationSettings}>Copy settings</button>
								</div>
								<p class="help">
									This builder accepts only the fixed controls above—never JavaScript, GLSL or a
									free-form expression. Bailout and iteration bounds remain in the shared controls.
								</p>
							</fieldset>
						{/if}

						{#if mainState.family === 'julia' || mainState.family === 'phoenix' || (mainState.family === 'multibrot' && mainState.plane === 'dynamical') || (mainState.family === 'custom-map' && mainState.plane === 'dynamical')}
							<fieldset>
								<legend>Fixed parameter c</legend>
								<div class="field-grid">
									<label
										><span>Real</span><input
											type="number"
											step="0.001"
											value={mainState.juliaC.re}
											onchange={(event) =>
												updateComplex(
													'juliaC',
													're',
													numberFromEvent(event),
													'Real part of c changed.'
												)}
										/></label
									>
									<label
										><span>Imaginary</span><input
											type="number"
											step="0.001"
											value={mainState.juliaC.im}
											onchange={(event) =>
												updateComplex(
													'juliaC',
													'im',
													numberFromEvent(event),
													'Imaginary part of c changed.'
												)}
										/></label
									>
								</div>
							</fieldset>
						{/if}

						{#if mainState.family === 'phoenix'}
							<fieldset>
								<legend>Memory parameter p</legend>
								<div class="field-grid">
									<label
										><span>Real</span><input
											type="number"
											step="0.01"
											value={mainState.phoenixP.re}
											onchange={(event) =>
												updateComplex(
													'phoenixP',
													're',
													numberFromEvent(event),
													'Real part of p changed.'
												)}
										/></label
									>
									<label
										><span>Imaginary</span><input
											type="number"
											step="0.01"
											value={mainState.phoenixP.im}
											onchange={(event) =>
												updateComplex(
													'phoenixP',
													'im',
													numberFromEvent(event),
													'Imaginary part of p changed.'
												)}
										/></label
									>
								</div>
							</fieldset>
							<fieldset>
								<legend>Initial remembered value z₋₁</legend>
								<div class="field-grid">
									<label>
										<span>Real</span>
										<input
											type="number"
											min="-16"
											max="16"
											step="0.01"
											value={mainState.phoenixPrevious.re}
											onchange={(event) =>
												updateComplex(
													'phoenixPrevious',
													're',
													numberFromEvent(event),
													'Real part of the Phoenix initial previous value changed.'
												)}
										/>
									</label>
									<label>
										<span>Imaginary</span>
										<input
											type="number"
											min="-16"
											max="16"
											step="0.01"
											value={mainState.phoenixPrevious.im}
											onchange={(event) =>
												updateComplex(
													'phoenixPrevious',
													'im',
													numberFromEvent(event),
													'Imaginary part of the Phoenix initial previous value changed.'
												)}
										/>
									</label>
								</div>
								<p class="help">
									Phoenix is second-order: this fixed z₋₁ is used before the first update, then each
									old zₙ becomes the next remembered value.
								</p>
							</fieldset>
						{/if}

						{#if mainState.family === 'burning-ship'}
							<label class="inline-check prominent">
								<input
									type="checkbox"
									checked={mainState.flipY}
									onchange={(event) =>
										commitMain(
											{ ...mainState, flipY: event.currentTarget.checked },
											'Burning Ship presentation orientation changed.'
										)}
								/>
								Flip the finished display vertically (presentation only)
							</label>
						{/if}

						{#if mainState.family === 'newton'}
							<div class="newton-editor">
								<label>
									<span>Start with zᵈ − 1</span>
									<select
										value={Math.max(2, (mainState.polynomial?.coefficients.length ?? 4) - 1)}
										onchange={(event) => loadNewtonDegree(Number(selectFromEvent(event)))}
									>
										{#each [2, 3, 4, 5, 6] as degree (degree)}
											<option value={degree}>z{superscript(degree)} − 1</option>
										{/each}
									</select>
								</label>
								<label>
									<span>Convergence tolerance</span>
									<input
										type="number"
										min="1e-14"
										max="0.01"
										step="1e-8"
										value={mainState.convergenceTolerance}
										onchange={(event) =>
											commitMain(
												{ ...mainState, convergenceTolerance: numberFromEvent(event) },
												'Newton tolerance changed.'
											)}
									/>
								</label>
								<label>
									<span>Relaxation λ</span>
									<input
										type="number"
										min="0.05"
										max="2"
										step="0.05"
										value={mainState.newtonRelaxation}
										onchange={(event) =>
											commitMain(
												{ ...mainState, newtonRelaxation: numberFromEvent(event) },
												'Newton relaxation changed.'
											)}
									/>
								</label>
								<div class="newton-presets" aria-label="Newton polynomial presets">
									<span>Named cubic presets</span>
									<div>
										<button type="button" onclick={() => loadNewtonPreset('z3-minus-one')}>
											z³ − 1
										</button>
										<button type="button" onclick={() => loadNewtonPreset('z3-minus-z')}>
											z³ − z
										</button>
									</div>
								</div>
								{#if mainState.polynomial}
									<fieldset class="coefficient-editor">
										<legend>Bounded complex coefficients</legend>
										<p class="help">
											Coefficients are ordered from the highest power to the constant term and
											clamped to ±1,000,000.
										</p>
										<div class="coefficient-grid">
											{#each mainState.polynomial.coefficients as coefficient, index (index)}
												{@const power = mainState.polynomial.coefficients.length - index - 1}
												<div class="coefficient-row">
													<strong>{newtonTermLabel(power)}</strong>
													<label>
														<span>Real</span>
														<input
															type="number"
															min="-1000000"
															max="1000000"
															step="0.01"
															value={coefficient.re}
															aria-label={`Real coefficient for ${newtonTermLabel(power)}`}
															onchange={(event) =>
																updateNewtonCoefficient(index, 're', numberFromEvent(event))}
														/>
													</label>
													<label>
														<span>Imaginary</span>
														<input
															type="number"
															min="-1000000"
															max="1000000"
															step="0.01"
															value={coefficient.im}
															aria-label={`Imaginary coefficient for ${newtonTermLabel(power)}`}
															onchange={(event) =>
																updateNewtonCoefficient(index, 'im', numberFromEvent(event))}
														/>
													</label>
												</div>
											{/each}
										</div>
									</fieldset>
								{/if}
								<p class="help">
									The editor constructs bounded coefficients. It never evaluates a typed expression.
								</p>
							</div>
						{/if}

						{#if mainState.family === 'buddhabrot' && mainState.density}
							<fieldset>
								<legend>Progressive density budget</legend>
								<div class="field-grid">
									<label>
										<span>Density channels</span>
										<select
											value={mainState.density.iterationBands.length >= 3 ? 'rgb' : 'monochrome'}
											onchange={(event) =>
												setDensityMode(selectFromEvent(event) as 'monochrome' | 'rgb')}
										>
											<option value="monochrome">Monochrome · one window</option>
											<option value="rgb">RGB · three windows</option>
										</select>
									</label>
									<label
										><span>Candidate samples</span><input
											type="number"
											min="10000"
											max="5000000"
											step="10000"
											value={mainState.density.targetSamples}
											onchange={(event) => updateDensity('targetSamples', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Exposure</span><input
											type="number"
											min="0.05"
											max="20"
											step="0.1"
											value={mainState.density.exposure}
											onchange={(event) => updateDensity('exposure', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Gamma</span><input
											type="number"
											min="0.05"
											max="5"
											step="0.05"
											value={mainState.density.gamma}
											onchange={(event) => updateDensity('gamma', numberFromEvent(event))}
										/></label
									>
								</div>
								<div class="density-band-grid">
									{#each mainState.density.iterationBands as band, index (index)}
										<div>
											<strong>
												{mainState.density.iterationBands.length >= 3
													? `${['Red', 'Green', 'Blue'][index] ?? `Band ${index + 1}`} window`
													: 'Accepted escape window'}
											</strong>
											<label>
												<span>Low iteration</span>
												<input
													type="number"
													min="0"
													max="19999"
													step="1"
													value={band[0]}
													onchange={(event) => updateDensityBand(index, 0, numberFromEvent(event))}
												/>
											</label>
											<label>
												<span>High iteration</span>
												<input
													type="number"
													min="1"
													max="20000"
													step="1"
													value={band[1]}
													onchange={(event) => updateDensityBand(index, 1, numberFromEvent(event))}
												/>
											</label>
										</div>
									{/each}
								</div>
								<p class="help">
									Only orbits escaping inside a listed window contribute to that density channel.
									All windows and the candidate budget are bounded before Worker allocation.
								</p>
							</fieldset>
						{/if}

						{#if mainState.family === 'sierpinski'}
							<label>
								<span>Construction view</span>
								<select
									value={sierpinskiMode}
									onchange={(event) => {
										sierpinskiMode = selectFromEvent(event) as typeof sierpinskiMode;
										commitUrlState();
									}}
								>
									<option value="recursive">Recursive removal only</option>
									<option value="chaos">Seeded chaos game only</option>
									<option value="overlay">Overlay comparison</option>
								</select>
							</label>
							<label class="range-field">
								<span
									>Recursive generation <b>{Math.round(mainState.exponent)}</b> · {3 **
										Math.round(mainState.exponent)} retained triangles</span
								>
								<input
									type="range"
									min="0"
									max="9"
									step="1"
									value={mainState.exponent}
									oninput={(event) =>
										updateNumber(
											'exponent',
											numberFromEvent(event),
											'Sierpiński generation changed.'
										)}
								/>
							</label>
							<p class="help">
								Recursive removal is deterministic geometry. The chaos game is a deterministic
								seeded sample of a stochastic construction. Overlay mode lets their common limit be
								compared without claiming the finite point cloud and filled triangles are the same
								data.
							</p>
						{/if}

						{#if mainState.family === 'l-system' && mainState.lSystem}
							<fieldset>
								<legend>Restricted grammar</legend>
								<div class="field-grid">
									<label>
										<span>Preset</span>
										<select
											value={mainState.lSystem.presetId}
											onchange={(event) => applyLSystemPreset(selectFromEvent(event))}
										>
											{#each LSYSTEM_PRESETS as preset (preset.id)}
												<option value={preset.id}>{preset.label}</option>
											{/each}
										</select>
									</label>
									<label
										><span>Generation</span><input
											type="number"
											min="0"
											max="7"
											step="1"
											value={mainState.lSystem.generations}
											onchange={(event) => updateLSystem('generations', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Turn angle</span><input
											type="number"
											min="-360"
											max="360"
											step="1"
											value={mainState.lSystem.angleDegrees}
											onchange={(event) => updateLSystem('angleDegrees', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Step length</span><input
											type="number"
											min="0.001"
											max="1000"
											step="0.1"
											value={mainState.lSystem.stepLength}
											onchange={(event) => updateLSystem('stepLength', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Starting angle</span><input
											type="number"
											min="-36000"
											max="36000"
											step="1"
											value={mainState.lSystem.startAngleDegrees}
											onchange={(event) =>
												updateLSystem('startAngleDegrees', numberFromEvent(event))}
										/></label
									>
									<label
										><span>Line thickness</span><input
											type="number"
											min="0.5"
											max="8"
											step="0.25"
											value={mainState.lSystem.lineWidth}
											onchange={(event) => updateLSystem('lineWidth', numberFromEvent(event))}
										/></label
									>
								</div>
								<div class="growth-controls">
									<div>
										<strong>Generation growth</strong>
										<small>Presentation only · bounded and pausable</small>
									</div>
									<button
										type="button"
										aria-pressed={lSystemGrowthPlaying}
										disabled={reducedMotion}
										onclick={toggleLSystemGrowth}
									>
										{lSystemGrowthPlaying
											? 'Pause growth'
											: `Grow 0 → ${Math.max(1, mainState.lSystem.generations || 5)}`}
									</button>
								</div>
								{#if reducedMotion}
									<small class="motion-note">
										Growth animation is disabled by the reduced-motion preference; choose any
										generation directly above.
									</small>
								{/if}
								<div class="grammar-editor">
									<label>
										<span>Axiom</span>
										<input
											type="text"
											maxlength="4096"
											spellcheck="false"
											value={mainState.lSystem.axiom}
											onchange={(event) =>
												updateLSystemDefinition(
													{ axiom: event.currentTarget.value },
													'L-system axiom changed.'
												)}
										/>
									</label>
									<label>
										<span>Production rules · one per line</span>
										<textarea
											rows="5"
											maxlength="8192"
											spellcheck="false"
											value={Object.entries(mainState.lSystem.rules)
												.map(([symbol, replacement]) => `${symbol} -> ${replacement}`)
												.join('\n')}
											onchange={(event) => updateLSystemRules(event.currentTarget.value)}
										></textarea>
									</label>
								</div>
								<label class="inline-check prominent">
									<input
										type="checkbox"
										checked={mainState.lSystem.colorByDepth}
										onchange={(event) => updateLSystemDepthColour(event.currentTarget.checked)}
									/>
									Colour line segments by branch depth
								</label>
								<dl class="grammar-readout">
									<div>
										<dt>Axiom</dt>
										<dd><code>{mainState.lSystem.axiom}</code></dd>
									</div>
									{#each Object.entries(mainState.lSystem.rules) as [symbol, rule] (symbol)}
										<div>
											<dt>{symbol} →</dt>
											<dd><code>{rule}</code></dd>
										</div>
									{/each}
								</dl>
								<p class="help">
									This is a data-only turtle grammar, never executable code. It accepts alphabetic
									variables and the bounded symbols + − [ ] | &amp; ^ \ /. Expansion is estimated
									before drawing and hard-limited to one million symbols and 250,000 segments.
								</p>
							</fieldset>
						{/if}
					</section>

					{#if guidedMode === 'power'}
						<section class="control-card guided-canvas-comparison">
							<p>Guided comparison · one changed integer</p>
							<h3>Multibrot degrees 2, 3, 4 and 5</h3>
							<div class="four-up">
								{#each degreeComparisonStates as specimen (specimen.degree)}
									<figure>
										<div>
											<FractalCanvas
												viewState={specimen.state}
												selectedPoint={null}
												showGrid={false}
												interactive={false}
												label={`Degree ${specimen.degree} Multibrot comparison`}
											/>
										</div>
										<figcaption>
											<strong>d = {specimen.degree}</strong>
											<code>zₙ₊₁ = zₙ{superscript(specimen.degree)} + c</code>
										</figcaption>
									</figure>
								{/each}
							</div>
							<p class="help">
								The centre, span, iteration cap and palette are identical. Only the bounded integer
								power changes.
							</p>
						</section>
					{:else if guidedMode === 'mirror'}
						<section class="control-card guided-canvas-comparison">
							<p>Guided comparison · mirror operations</p>
							<h3>Mandelbrot, Tricorn and Burning Ship</h3>
							<div class="three-up">
								{#each mirrorComparisonStates as specimen (specimen.label)}
									<figure>
										<div>
											<FractalCanvas
												viewState={specimen.state}
												selectedPoint={null}
												showGrid={false}
												interactive={false}
												label={`${specimen.label} recurrence comparison`}
											/>
										</div>
										<figcaption>
											<strong>{specimen.label}</strong>
											<code>{specimen.formula}</code>
										</figcaption>
									</figure>
								{/each}
							</div>
							<p class="help">
								These panes use their verified overview windows so each family remains legible. The
								displayed recurrence identifies the exact altered operation; the Burning Ship’s
								optional presentation flip remains separate.
							</p>
						</section>
					{/if}

					{#if mainState.family === 'barnsley-fern' && mainState.ifs}
						<details class="advanced-card">
							<summary>Edit the bounded affine-transform table</summary>
							<p>
								Each row maps (x, y) through six coefficients and a non-negative selection weight.
							</p>
							<label class="ifs-colour-control">
								<span>Colour each point by</span>
								<select
									value={mainState.ifs.colorBy}
									onchange={(event) =>
										updateIFSColourBy(selectFromEvent(event) as 'transform' | 'age')}
								>
									<option value="transform">Chosen affine transform</option>
									<option value="age">Age in the seeded sequence</option>
								</select>
							</label>
							<div class="transform-table">
								{#each mainState.ifs.transforms as transform, index (transform.id)}
									<fieldset>
										<legend>{transform.label}</legend>
										{#each ['a', 'b', 'c', 'd', 'e', 'f', 'probability'] as coefficient (coefficient)}
											<label>
												<span>{coefficient}</span>
												<input
													type="number"
													step="0.01"
													value={transform[coefficient as keyof typeof transform]}
													onchange={(event) =>
														updateTransform(
															index,
															coefficient as 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'probability',
															numberFromEvent(event)
														)}
												/>
											</label>
										{/each}
									</fieldset>
								{/each}
							</div>
						</details>
					{/if}
				</div>
			{:else if activePanel === 'precision'}
				<div class="panel-stack">
					<PrecisionMeter
						center={mainState.center}
						centerDecimal={mainState.centerDecimal}
						spanY={mainState.spanY}
						rotation={mainState.rotation}
						canvasWidth={mainCanvasMetrics.width}
						renderer={backend}
						mode={mainState.precisionMode}
						canvasHeight={mainCanvasMetrics.height}
						devicePixelRatio={backend === 'webgl2' ? mainCanvasMetrics.devicePixelRatio : 1}
						maxIterations={mainState.maxIterations}
						diagnostics={precisionDiagnostics}
					/>
					<section class="control-card">
						<p>Honest stopping rule</p>
						<h3>Iterations, pixels and arithmetic fail differently</h3>
						<ul class="limit-list">
							<li><b>More iterations</b> may reveal a late escape or convergence.</li>
							<li><b>More pixels</b> sample the same viewport more densely.</li>
							<li><b>More colour bands</b> only change the visual ledger.</li>
							<li><b>Merged coordinates</b> require different arithmetic, not more patience.</li>
						</ul>
						<label>
							<span>Requested precision policy</span>
							<select
								value={mainState.precisionMode}
								onchange={(event) =>
									commitMain(
										{
											...mainState,
											precisionMode: selectFromEvent(event) as FractalViewState['precisionMode']
										},
										'Precision policy changed.'
									)}
							>
								<option value="auto">Auto, with warning</option>
								<option value="float">GPU highp float</option>
								<option value="double-single"
									>GPU double-single (quadratic Mandelbrot / Julia)</option
								>
							</select>
						</label>
						<p class="help">
							Auto begins with GPU highp and switches to tested hi/lo double-single mapping and
							orbit arithmetic when the float grid collapses. Beyond that tested ceiling—and for
							unsupported families—the atlas falls back honestly to bounded CPU doubles. The
							experimental perturbation shader is intentionally excluded from this published runtime
							because target ANGLE drivers compiled it synchronously long enough to freeze the page.
							No mode is described as “infinite zoom”.
						</p>
					</section>
				</div>
			{:else if activePanel === 'presets'}
				<div class="panel-stack">
					<section class="experiment-field-guide" aria-labelledby="guided-experiments-heading">
						<div class="card-heading">
							<div>
								<p>Ten reusable investigations</p>
								<h3 id="guided-experiments-heading">Guided experiments</h3>
							</div>
						</div>
						<p class="help">
							Every card configures this same laboratory. Each names an expected observation and the
							claim that the finite picture cannot establish.
						</p>
						<div class="experiment-grid">
							{#each GUIDED_EXPERIMENTS as experiment, index (experiment.id)}
								<article>
									<p>Experiment {index + 1}</p>
									<h4>{experiment.title}</h4>
									<strong>{experiment.question}</strong>
									<details>
										<summary>Field notes</summary>
										<dl>
											<div>
												<dt>Inspect</dt>
												<dd>{experiment.inspect}</dd>
											</div>
											<div>
												<dt>Expect</dt>
												<dd>{experiment.expected}</dd>
											</div>
											<div>
												<dt>Does not establish</dt>
												<dd>{experiment.caveat}</dd>
											</div>
										</dl>
									</details>
									<button type="button" onclick={() => runGuidedExperiment(experiment)}
										>Set up experiment</button
									>
								</article>
							{/each}
						</div>
					</section>

					<div class="preset-gallery">
						{#each ['mandelbrot-landmarks', 'julia-personalities', 'related-escape-maps', 'root-basins', 'orbit-ghosts', 'precision-demonstrations', 'recursive-cousins'] as group (group)}
							<section>
								<h3>{group.replaceAll('-', ' ')}</h3>
								<div>
									{#each ATLAS_PRESETS.filter((preset) => preset.group === group) as preset (preset.id)}
										<article>
											<img
												src={`/images/fractal-atlas/presets/${preset.id}.webp`}
												alt={`Deterministic local rendering of ${preset.label}`}
												width="360"
												height="220"
												loading="lazy"
												decoding="async"
											/>
											<div class="preset-card-copy">
												<h4>{preset.label}</h4>
												<p>{preset.description}</p>
												<dl>
													<div>
														<dt>Family</dt>
														<dd>{getFamilyDefinition(preset.state.family).passport.name}</dd>
													</div>
													<div>
														<dt>Centre</dt>
														<dd><code>{exactPresetCentre(preset)}</code></dd>
													</div>
													<div>
														<dt>Vertical span</dt>
														<dd><code>{formatNumber(preset.state.spanY, 12)}</code></dd>
													</div>
													<div>
														<dt>Parameters</dt>
														<dd>{presetParameterSummary(preset.state)}</dd>
													</div>
													<div>
														<dt>Calculation</dt>
														<dd>
															{preset.state.maxIterations} iterations{isEscapeTimeFamily(
																preset.state.family
															)
																? ` · bailout ${formatNumber(preset.state.bailout, 6)}`
																: ''}
														</dd>
													</div>
													<div>
														<dt>Palette</dt>
														<dd>{getPalette(preset.state.paletteId).label}</dd>
													</div>
												</dl>
												<small class="preset-verification">
													{preset.verified ? '✓ Verified local render' : 'Development preset'} ·
													{preset.verificationNote}
												</small>
												<div class="preset-actions">
													<button type="button" onclick={() => applyPreset(preset.id)}
														>Load expedition</button
													>
													{#if preset.openLinkedView}
														<button type="button" onclick={() => openPresetLinked(preset)}
															>Open in linked view</button
														>
													{/if}
												</div>
											</div>
										</article>
									{/each}
								</div>
							</section>
						{/each}
					</div>
				</div>
			{:else if activePanel === 'export'}
				<div class="panel-stack export-panel">
					<section class="control-card">
						<p>Portable specimen</p>
						<h3>Export what the instrument actually knows</h3>
						<div class="png-exporter">
							<label>
								<span>PNG resolution</span>
								<select bind:value={pngResolution} disabled={pngExporting}>
									<option value="current">Current composed canvas</option>
									<option value="1x" disabled={!tiledPngAvailable}>Tiled 1× canvas size</option>
									<option value="2x" disabled={!tiledPngAvailable}>Tiled 2× canvas size</option>
									<option value="4x" disabled={!tiledPngAvailable}>Tiled 4× canvas size</option>
									<option value="custom" disabled={!tiledPngAvailable}>Custom dimensions</option>
								</select>
							</label>
							{#if pngResolution === 'custom'}
								<div class="png-dimensions">
									<label>
										<span>Width in pixels</span>
										<input
											type="number"
											min="1"
											max="8192"
											step="1"
											bind:value={customPngWidth}
											disabled={pngExporting}
										/>
									</label>
									<label>
										<span>Height in pixels</span>
										<input
											type="number"
											min="1"
											max="8192"
											step="1"
											bind:value={customPngHeight}
											disabled={pngExporting}
										/>
									</label>
								</div>
							{/if}
							<label class="png-caption-toggle">
								<input type="checkbox" bind:checked={includePngCaption} disabled={pngExporting} />
								<span>
									<b>Include atlas caption</b>
									<small
										>Title, active formula and current exact centre; off by default for clean art.</small
									>
								</span>
							</label>
							<div class="png-plan" aria-live="polite">
								<strong>{pngExportStatus}</strong>
								{#if pngExportPlan?.iterations.capped}
									<small>
										The requested iteration count is retained in the settings export; this PNG uses
										a bounded effective count so one local export cannot monopolise the browser.
									</small>
								{/if}
								{#if pngExportError}
									<small class="export-error" role="alert">{pngExportError}</small>
								{/if}
							</div>
							{#if pngExporting || pngExportProgress > 0}
								<div class="png-progress">
									<progress max="1" value={pngExportProgress} aria-label="PNG export progress"
									></progress>
									<output>{Math.round(pngExportProgress * 100)}%</output>
								</div>
							{/if}
							<div class="png-actions">
								<button
									type="button"
									onclick={exportPng}
									disabled={pngExporting ||
										(pngResolution !== 'current' && (!tiledPngAvailable || !pngExportPlan))}
								>
									<b>{pngExporting ? 'Rendering locally…' : 'Export PNG'}</b>
									<small>
										{pngResolution === 'current'
											? 'Visible raster plus overlays'
											: 'Seam-free, bounded tiled renderer'}
									</small>
								</button>
								{#if pngExporting}
									<button type="button" class="secondary-action" onclick={cancelPngExport}>
										Cancel export
									</button>
								{/if}
							</div>
						</div>
						<div class="export-grid">
							<button type="button" onclick={exportSettings}
								><b>Settings JSON</b><small>Versioned state and selected point</small></button
							>
							<button type="button" onclick={exportOrbitCsv} disabled={!orbitResult}
								><b>Orbit CSV</b><small
									>{orbitResult
										? `Up to ${Math.min(2_000, orbitResult.orbit.length).toLocaleString()} numerical rows`
										: 'Available for escape and Newton orbits'}</small
								></button
							>
							<button type="button" onclick={copyLink}
								><b>Copy permanent link</b><small>Bounded readable URL state</small></button
							>
							<label class="import-settings">
								<b>Import settings JSON</b>
								<small>Validated locally · maximum 256 KiB</small>
								<input type="file" accept="application/json,.json" onchange={importSettings} />
							</label>
							<button type="button" onclick={exportSvg} disabled={!svgAvailability.available}
								><b>SVG construction</b><small>{svgAvailability.label}</small></button
							>
						</div>
						<p class="help">
							Current composed preserves the visible grid and markers. Tiled sizes re-sample the
							unadorned raster in global image coordinates, yield between bounded tiles, and
							disclose memory and iteration caps before starting. Histogram equalisation stays on
							the genuine two-pass current canvas. SVG is offered only for safe, genuinely
							vector-sized recursive constructions.
						</p>
					</section>
					<section class="control-card">
						<p>Local field case</p>
						<h3>Saved specimens on this device</h3>
						<div class="save-row">
							<label>
								<span>Optional name</span>
								<input
									type="text"
									maxlength="80"
									bind:value={specimenName}
									placeholder={`${activeFamilyName} at current centre`}
								/>
							</label>
							<button type="button" onclick={saveSpecimen}>Save specimen</button>
						</div>
						{#if specimens.length}
							<ul class="specimen-list">
								{#each specimens as specimen (specimen.id)}
									<li>
										<div>
											<b>{specimen.name}</b>
											<small
												>{new Date(specimen.savedAt).toLocaleString()} · {parseLocalState(
													specimen.state
												).state.family}</small
											>
										</div>
										<div class="specimen-actions">
											<button type="button" onclick={() => restoreSpecimen(specimen)}>Load</button>
											<button type="button" onclick={() => renameSpecimen(specimen)}>Rename</button>
											<button type="button" onclick={() => exportSavedSpecimen(specimen)}
												>JSON</button
											>
											<button type="button" onclick={() => copySavedSpecimenLink(specimen)}
												>Link</button
											>
											<button
												type="button"
												class="danger-button"
												onclick={() => deleteSpecimen(specimen.id)}>Remove</button
											>
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="empty-copy">
								No specimens saved yet. The cap is {MAX_SPECIMENS}; nothing is uploaded.
							</p>
						{/if}
					</section>
				</div>
			{/if}
		</div>

		{#if stateWarnings.length}
			<details class="warning-ledger">
				<summary
					>{stateWarnings.length} state correction{stateWarnings.length === 1 ? '' : 's'} applied</summary
				>
				<ul>
					{#each stateWarnings as warning, index (`${index}-${warning}`)}<li>{warning}</li>{/each}
				</ul>
			</details>
		{/if}

		<footer class="atlas-footer">
			<p><b>Finite-computation notice:</b> {family.passport.finiteComputationCaveat}</p>
			<button
				type="button"
				onclick={() => copyText(serializeLocalState(mainState), 'Settings copied as JSON.')}
				>Copy raw settings</button
			>
		</footer>

		{#if tourOpen}
			<div class="tour-scrim" role="presentation">
				<dialog
					bind:this={tourDialog}
					open
					class="tour-card"
					aria-modal="true"
					aria-labelledby="tour-heading"
					aria-describedby="tour-description"
					onkeydown={handleTourKeydown}
				>
					<p>Guided expedition · {tourIndex + 1} / {TOUR_STEPS.length}</p>
					<h3 id="tour-heading">{TOUR_STEPS[tourIndex].title}</h3>
					<div class="tour-progress" aria-hidden="true">
						{#each TOUR_STEPS as step, index (step.title)}<i class:active={index <= tourIndex}
							></i>{/each}
					</div>
					<p id="tour-description">{TOUR_STEPS[tourIndex].copy}</p>
					<div class="tour-actions">
						<button type="button" onclick={exitTourAndRestore}>Exit & restore</button>
						<button type="button" onclick={skipTour}>Skip tour</button>
						<button type="button" onclick={() => moveTour(-1)} disabled={tourIndex === 0}
							>Back</button
						>
						{#if tourIndex < TOUR_STEPS.length - 1}
							<button type="button" class="primary-action" onclick={() => moveTour(1)}
								>Next stop</button
							>
						{:else}
							<button type="button" class="primary-action" onclick={finishTour}
								>Explore freely</button
							>
						{/if}
					</div>
				</dialog>
			</div>
		{/if}
	</div>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html NOSCRIPT_FALLBACK}
</section>

<style>
	:global(.article-breakout .atlas *) {
		box-sizing: border-box;
	}

	.atlas {
		--atlas-ink: #090a10;
		--atlas-panel: #11131b;
		--atlas-panel-raised: #171923;
		--atlas-rule: #373946;
		--atlas-rule-bright: #5c5d6d;
		--atlas-text: #f0ece3;
		--atlas-muted: #aaa6b5;
		--atlas-brass: #d1a65d;
		--atlas-cyan: #6eb4bd;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(84rem, calc(100vw - 2rem));
		margin-block: 3.5rem;
		overflow: clip;
		transform: translateX(-50%);
		border: 1px solid #292a34;
		border-radius: 0.7rem;
		background:
			linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.012) 1px, transparent 1px), #0d0f16;
		background-size: 24px 24px;
		color: var(--atlas-text);
		box-shadow: 0 1.8rem 4.5rem rgba(5, 5, 12, 0.34);
		font-family: var(--font-sans);
		scroll-margin-top: 5rem;
		transition: box-shadow 400ms ease;
	}

	.atlas.flash {
		box-shadow:
			0 0 0 4px rgba(209, 166, 93, 0.68),
			0 1.8rem 4.5rem rgba(5, 5, 12, 0.34);
	}

	button,
	input,
	select,
	textarea {
		font: inherit;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-rule-bright);
		border-radius: 0.32rem;
		background: #181a24;
		color: var(--atlas-text);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #9b895d;
		background: #20222d;
	}

	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	textarea:focus-visible,
	summary:focus-visible {
		outline: 3px solid #e0bd69;
		outline-offset: 2px;
	}

	button:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.atlas-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--atlas-rule);
		padding: 0.9rem 1rem;
		background: rgba(10, 11, 17, 0.95);
	}

	.title-lockup {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	.title-lockup p,
	.control-card > p:first-child,
	.card-heading p,
	.tour-card > p:first-child {
		width: 100%;
		margin: 0;
		color: var(--atlas-brass);
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.title-lockup h2 {
		margin: 0;
		color: var(--atlas-text);
		font: 760 clamp(1.25rem, 2vw, 1.75rem)/1.1 var(--font-sans);
	}

	.title-lockup > span,
	.class-badge {
		border: 1px solid var(--atlas-rule);
		border-radius: 999px;
		padding: 0.26rem 0.48rem;
		color: var(--atlas-muted);
		font: 0.58rem/1.2 var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.history-tools {
		display: flex;
		flex: 0 0 auto;
		gap: 0.34rem;
	}

	.history-tools button {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.45rem 0.58rem;
		font-size: 0.64rem;
		font-weight: 700;
	}

	.zoom-breadcrumb {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: center;
		gap: 0.35rem;
		overflow-x: auto;
		color: #8f91a0;
		font: 0.56rem/1.2 var(--font-mono);
		scrollbar-width: thin;
		white-space: nowrap;
	}

	.zoom-breadcrumb .breadcrumb-family {
		max-width: 14rem;
		overflow: hidden;
		color: #c5b787;
		text-overflow: ellipsis;
	}

	.zoom-breadcrumb button {
		min-height: 1.9rem;
		border: 0;
		background: transparent;
		padding: 0.2rem 0.3rem;
		color: #83b7ba;
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 0.16rem;
	}

	.zoom-breadcrumb [aria-current='location'] {
		color: #ede7dc;
		font-weight: 720;
	}

	.family-rack {
		display: flex;
		gap: 0;
		overflow-x: auto;
		border-bottom: 1px solid var(--atlas-rule);
		background: #12141c;
		scrollbar-width: thin;
	}

	.family-group {
		flex: 0 0 auto;
		border-right: 1px solid var(--atlas-rule);
		padding: 0.5rem 0.65rem 0.6rem;
	}

	.family-group > span {
		display: block;
		margin-bottom: 0.32rem;
		color: #767887;
		font-size: 0.54rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.family-group > div {
		display: flex;
		gap: 0.28rem;
	}

	.family-group button {
		min-height: 2.75rem;
		border-color: transparent;
		background: transparent;
		padding: 0.4rem 0.55rem;
		font-size: 0.64rem;
		font-weight: 680;
		white-space: nowrap;
	}

	.family-group button.active {
		border-color: #866f3c;
		background: #292319;
		color: #f3dba4;
	}

	.plane-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-bottom: 1px solid var(--atlas-rule);
		background: #0b0d13;
		padding: 0.4rem;
		gap: 0.4rem;
	}

	.plane-tabs button {
		min-width: 0;
		overflow: hidden;
		border-color: transparent;
		background: transparent;
		padding: 0.5rem 0.65rem;
		color: var(--atlas-muted);
		font-size: 0.64rem;
		font-weight: 720;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.plane-tabs button.active {
		border-color: #866f3c;
		background: #292319;
		color: #f3dba4;
	}

	.canvas-rack {
		display: grid;
		grid-template-columns: 1fr;
		min-height: clamp(25rem, 55vw, 43rem);
		border-bottom: 1px solid var(--atlas-rule);
	}

	.canvas-rack.with-companion {
		grid-template-columns: minmax(0, 1.45fr) minmax(17rem, 0.55fr);
	}

	.canvas-rack.compare {
		grid-template-columns:
			minmax(0, var(--compare-split, 50%))
			minmax(0, calc(100% - var(--compare-split, 50%)));
	}

	.primary-plane,
	.companion-plane {
		position: relative;
		min-width: 0;
		min-height: 24rem;
	}

	.companion-plane {
		border-left: 1px solid var(--atlas-rule);
	}

	.plane-label {
		position: absolute;
		z-index: 6;
		right: 0.8rem;
		bottom: 0.8rem;
		left: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border: 1px solid rgba(218, 202, 162, 0.18);
		border-radius: 0.35rem;
		background: rgba(8, 9, 14, 0.76);
		padding: 0.45rem 0.6rem;
		pointer-events: none;
		backdrop-filter: blur(9px);
	}

	.plane-label span {
		color: #e9d8b2;
		font-size: 0.64rem;
		font-weight: 720;
	}

	.plane-label code {
		overflow: hidden;
		color: #9a9baa;
		font: 0.56rem/1.2 var(--font-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.readout-strip {
		display: grid;
		grid-template-columns: 1.2fr 1.2fr 0.8fr 0.65fr minmax(12rem, 1.4fr);
		align-items: stretch;
		border-bottom: 1px solid var(--atlas-rule);
		background: #0b0d13;
	}

	.readout-strip > div,
	.readout-strip > p {
		min-width: 0;
		margin: 0;
		border-right: 1px solid var(--atlas-rule);
		padding: 0.48rem 0.65rem;
	}

	.readout-strip span {
		display: block;
		margin-bottom: 0.16rem;
		color: #747684;
		font-size: 0.52rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.readout-strip code {
		display: block;
		overflow: hidden;
		color: #d8d1c4;
		font: 0.59rem/1.3 var(--font-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.readout-strip > p {
		display: flex;
		align-items: center;
		border: 0;
		color: #aaa6b5;
		font: 0.6rem/1.35 var(--font-mono);
	}

	.passport-drawer {
		border-bottom: 1px solid var(--atlas-rule);
		background: #0d0f16;
	}

	.passport-drawer > summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.8rem;
		color: #d2b979;
		font-size: 0.62rem;
		font-weight: 720;
		cursor: pointer;
	}

	.passport-drawer > summary code {
		overflow-wrap: anywhere;
		color: #8ab5b8;
		font-size: 0.56rem;
		font-weight: 500;
		text-align: right;
	}

	.passport-drawer[open] > summary {
		border-bottom: 1px solid var(--atlas-rule);
	}

	.passport-drawer :global(.passport) {
		border: 0;
		border-radius: 0;
	}

	.progress-strip {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) minmax(10rem, auto) minmax(14rem, 24rem) auto;
		align-items: center;
		gap: 0.65rem;
		border-bottom: 1px solid var(--atlas-rule);
		background: #11131b;
		padding: 0.48rem 0.65rem;
	}

	.progress-strip > div {
		height: 0.32rem;
		overflow: hidden;
		border-radius: 999px;
		background: #292b34;
	}

	.progress-strip > div span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, #64518f, #65a7a9, #d0a85e);
		transition: width 180ms linear;
	}

	.progress-strip p {
		margin: 0;
		color: var(--atlas-muted);
		font: 0.58rem/1.3 var(--font-mono);
	}

	.progress-strip p strong,
	.progress-strip p small {
		display: block;
	}

	.progress-strip .confidence-note strong {
		color: #b8c8a6;
	}

	.progress-strip p strong {
		margin-bottom: 0.12rem;
		color: #d8d1c4;
		font-weight: 720;
	}

	.progress-strip p small {
		margin-top: 0.12rem;
		color: #858493;
		font: inherit;
	}

	.progress-strip nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.progress-strip button {
		min-height: 2.75rem;
		padding: 0.35rem 0.55rem;
		font-size: 0.58rem;
	}

	.progress-strip .ghost-note {
		grid-column: 1 / -1;
		color: #9fb8b6;
		font-size: 0.56rem;
		line-height: 1.45;
	}

	.panel-tabs {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border-bottom: 1px solid var(--atlas-rule);
		background: #151720;
	}

	.panel-tabs button {
		min-width: 0;
		border: 0;
		border-right: 1px solid var(--atlas-rule);
		border-radius: 0;
		background: transparent;
		padding: 0.7rem 0.45rem;
		color: #9794a2;
		font-size: 0.62rem;
		font-weight: 720;
	}

	.panel-tabs button.active {
		box-shadow: inset 0 -3px 0 var(--atlas-brass);
		background: #1b1d27;
		color: #f0e5cc;
	}

	.short-label {
		display: none;
	}

	.instrument-bay {
		min-height: 26rem;
		padding: 0.85rem;
		background: rgba(9, 10, 15, 0.74);
	}

	.panel-stack {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.control-card,
	.advanced-card {
		border: 1px solid var(--atlas-rule);
		border-radius: 0.45rem;
		background: var(--atlas-panel);
		padding: 0.85rem;
	}

	.control-card h3,
	.card-heading h3,
	.tour-card h3 {
		margin: 0.22rem 0 0;
		color: var(--atlas-text);
		font: 740 1rem/1.25 var(--font-sans);
	}

	.card-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.tour-button {
		flex: 0 0 auto;
		border-color: #8e713d;
		background: #2b2317;
		padding-inline: 0.7rem;
		color: #f0d492;
		font-size: 0.62rem;
		font-weight: 750;
	}

	.help,
	.empty-copy,
	.advanced-card > p {
		margin: 0.65rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.5;
	}

	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.75rem;
	}

	.toggle-grid label {
		display: flex;
		min-height: 3.6rem;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		padding: 0.55rem;
		cursor: pointer;
	}

	.toggle-grid input,
	.inline-check input {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		accent-color: var(--atlas-brass);
	}

	.toggle-grid b,
	.toggle-grid small {
		display: block;
	}

	.toggle-grid b {
		color: #e6e0d5;
		font-size: 0.65rem;
	}

	.toggle-grid small {
		margin-top: 0.12rem;
		color: #858493;
		font-size: 0.58rem;
	}

	.quality-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.7rem;
	}

	.quality-row > span {
		margin-right: auto;
		color: var(--atlas-muted);
		font-size: 0.62rem;
	}

	.quality-row button {
		min-height: 2.75rem;
		padding: 0.35rem 0.55rem;
		font-size: 0.58rem;
		text-transform: capitalize;
	}

	.quality-row button.active {
		border-color: #9d7f46;
		background: #2a2319;
		color: #f0d492;
	}

	.compare-controls,
	.save-row {
		display: grid;
		grid-template-columns: minmax(9rem, 1fr) auto auto;
		align-items: end;
		gap: 0.55rem;
		margin-top: 0.7rem;
		border-top: 1px solid var(--atlas-rule);
		padding-top: 0.7rem;
	}

	.compare-controls {
		grid-template-columns: minmax(9rem, 1fr) repeat(3, auto);
	}

	.compare-actions {
		display: flex;
		justify-content: end;
		gap: 0.4rem;
		margin-top: 0.55rem;
	}

	.compare-actions button {
		padding-inline: 0.7rem;
		font-size: 0.62rem;
	}

	.compare-divider-control {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto;
		align-items: end;
		gap: 0.55rem;
		margin-top: 0.55rem;
	}

	.compare-divider-control input[type='range'] {
		width: 100%;
		accent-color: var(--atlas-brass);
	}

	.parameter-pins {
		display: grid;
		grid-template-columns: minmax(8rem, 0.7fr) minmax(14rem, 1.3fr);
		gap: 0.55rem 0.8rem;
		margin-top: 0.75rem;
		border-top: 1px solid var(--atlas-rule);
		padding-top: 0.75rem;
	}

	.parameter-pins p {
		margin: 0;
		color: var(--atlas-brass);
		font-size: 0.54rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.parameter-pins h4 {
		margin: 0.18rem 0 0;
		color: #e9dfcc;
		font-size: 0.75rem;
	}

	.parameter-pins dl {
		display: grid;
		gap: 0.28rem;
		margin: 0;
	}

	.parameter-pins dl div {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr);
		gap: 0.4rem;
	}

	.parameter-pins dt {
		color: #c7a665;
		font-size: 0.58rem;
		font-weight: 780;
	}

	.parameter-pins dd {
		display: flex;
		min-width: 0;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.4rem;
		margin: 0;
		color: var(--atlas-muted);
		font-size: 0.55rem;
	}

	.parameter-pins dd code {
		overflow-wrap: anywhere;
		color: #9bc2c4;
	}

	.parameter-pins > div:nth-of-type(2) {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.parameter-pins > small {
		grid-column: 1 / -1;
		color: var(--atlas-muted);
		font-size: 0.56rem;
		line-height: 1.4;
	}

	.parameter-path-lab {
		margin-top: 0.8rem;
		border: 1px solid rgba(112, 211, 218, 0.28);
		border-radius: 0.4rem;
		background: linear-gradient(135deg, rgba(43, 29, 85, 0.22), transparent 58%), #0d0f16;
		padding: 0.75rem;
	}

	.parameter-path-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.7rem;
	}

	.parameter-path-heading p,
	.parameter-path-heading h4 {
		margin: 0;
	}

	.parameter-path-heading p {
		color: var(--atlas-brass);
		font-size: 0.54rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.parameter-path-heading h4 {
		margin-top: 0.18rem;
		color: #e9dfcc;
		font-size: 0.82rem;
	}

	.parameter-path-heading > code {
		color: #91bdc0;
		font-size: 0.56rem;
	}

	.parameter-path-controls {
		display: grid;
		grid-template-columns: minmax(8rem, 0.3fr) minmax(15rem, 1fr) auto;
		align-items: end;
		gap: 0.55rem;
		margin-top: 0.7rem;
	}

	.parameter-path-controls input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--atlas-brass);
	}

	.parameter-path-controls > button {
		padding-inline: 0.75rem;
		font-size: 0.62rem;
	}

	.parameter-path-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.4rem, 1fr));
		gap: 0.45rem;
		margin-top: 0.7rem;
	}

	.parameter-path-strip article {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.34rem;
		background: #080a0f;
	}

	.parameter-path-strip article.active {
		border-color: #d0aa59;
		box-shadow: 0 0 0 2px rgba(208, 170, 89, 0.22);
	}

	.parameter-path-canvas {
		display: block;
		height: 7.2rem;
		pointer-events: none;
	}

	:global(.parameter-path-canvas .fractal-stage) {
		min-height: 0;
	}

	.parameter-path-strip button {
		display: grid;
		width: 100%;
		min-height: 3.2rem;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.45rem;
		border: 0;
		border-top: 1px solid var(--atlas-rule);
		border-radius: 0;
		padding: 0.42rem 0.5rem;
		text-align: left;
	}

	.parameter-path-strip b {
		color: #e4c275;
		font-size: 0.58rem;
	}

	.parameter-path-strip code {
		overflow: hidden;
		color: #8eb9bc;
		font-size: 0.52rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.motion-note,
	.path-state-note {
		display: block;
		margin-top: 0.55rem;
		color: var(--atlas-muted);
		font-size: 0.56rem;
		line-height: 1.45;
	}

	.colour-costume-lab > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.7rem;
	}

	.colour-costume-lab figure {
		overflow: hidden;
		margin: 0;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		background: #090a10;
	}

	.colour-costume-lab figure > div {
		height: 10.5rem;
	}

	:global(.colour-costume-lab .fractal-stage) {
		min-height: 0;
	}

	.colour-costume-lab figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-top: 1px solid var(--atlas-rule);
		padding: 0.45rem 0.55rem;
		color: #d9d0bf;
		font-size: 0.58rem;
	}

	.colour-costume-lab figcaption code {
		color: #85afb2;
	}

	label {
		display: grid;
		gap: 0.28rem;
		color: var(--atlas-muted);
		font-size: 0.62rem;
	}

	input[type='number'],
	input[type='text'],
	select,
	textarea {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--atlas-rule-bright);
		border-radius: 0.3rem;
		background: #0b0d14;
		padding: 0.48rem 0.58rem;
		color: var(--atlas-text);
		font-family: var(--font-mono);
	}

	textarea {
		resize: vertical;
		line-height: 1.45;
	}

	.inline-check {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
	}

	.inline-check.prominent {
		margin-top: 0.7rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		padding: 0.55rem;
		white-space: normal;
	}

	.button-row {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.7rem;
	}

	.button-row button {
		padding-inline: 0.65rem;
		font-size: 0.62rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.7rem;
	}

	fieldset {
		min-width: 0;
		margin: 0.75rem 0 0;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.38rem;
		padding: 0.65rem;
	}

	legend {
		padding: 0 0.4rem;
		color: #d1bc8d;
		font-size: 0.62rem;
		font-weight: 720;
	}

	fieldset .field-grid {
		margin-top: 0;
	}

	.map-workshop {
		border-color: rgba(112, 211, 218, 0.34);
		background:
			linear-gradient(135deg, rgba(43, 29, 85, 0.22), transparent 55%), rgba(8, 10, 16, 0.4);
	}

	.map-identity {
		display: grid;
		grid-template-columns: minmax(7.5rem, 0.35fr) minmax(0, 1fr);
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.65rem;
		border: 1px solid rgba(112, 211, 218, 0.28);
		border-radius: 0.34rem;
		padding: 0.6rem;
		background: rgba(112, 211, 218, 0.05);
	}

	.map-identity.unclassified {
		border-color: rgba(211, 168, 94, 0.45);
		background: rgba(211, 168, 94, 0.06);
	}

	.map-identity div {
		display: grid;
		gap: 0.15rem;
	}

	.map-identity span {
		color: var(--atlas-muted);
		font-size: 0.52rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.map-identity strong {
		color: #f0dfb9;
		font-size: 0.72rem;
	}

	.map-identity code {
		overflow-wrap: anywhere;
		color: #a8d9da;
		font-size: 0.62rem;
		line-height: 1.5;
	}

	.workshop-warning {
		margin: 0 0 0.65rem;
		border-left: 3px solid var(--atlas-brass);
		padding: 0.45rem 0.55rem;
		background: rgba(211, 168, 94, 0.08);
		color: #d7caaa;
		font-size: 0.61rem;
		line-height: 1.5;
	}

	.workshop-switches {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem 0.65rem;
		margin-top: 0.65rem;
	}

	.workshop-switches .inline-check {
		min-height: 2.15rem;
		white-space: normal;
	}

	.memory-coefficient {
		margin-top: 0.55rem;
	}

	.workshop-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.65rem;
	}

	.workshop-actions button {
		padding-inline: 0.65rem;
		font-size: 0.61rem;
	}

	.range-field {
		margin-top: 0.75rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		padding: 0.65rem;
	}

	.density-band-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.7rem;
	}

	.density-band-grid > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		padding: 0.55rem;
	}

	.density-band-grid strong {
		grid-column: 1 / -1;
		color: #e6d6b6;
		font-size: 0.62rem;
	}

	.range-field span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--atlas-brass);
	}

	.newton-editor {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
		margin-top: 0.75rem;
	}

	.newton-editor .help {
		grid-column: 1 / -1;
	}

	.newton-presets {
		display: grid;
		grid-column: 1 / -1;
		gap: 0.28rem;
	}

	.newton-presets > span {
		color: var(--atlas-muted);
		font-size: 0.62rem;
	}

	.newton-presets > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.newton-presets button {
		font-family: var(--font-mono);
	}

	.coefficient-editor {
		grid-column: 1 / -1;
		margin-top: 0;
	}

	.coefficient-editor > .help {
		margin-top: 0;
	}

	.coefficient-grid {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}

	.coefficient-row {
		display: grid;
		grid-template-columns: minmax(4rem, 0.35fr) repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: 0.45rem;
		border-top: 1px solid var(--atlas-rule);
		padding-top: 0.4rem;
	}

	.coefficient-row strong {
		align-self: center;
		color: #e6d6b6;
		font: 0.72rem/1.2 var(--font-mono);
	}

	.grammar-readout {
		display: grid;
		gap: 0.28rem;
		margin: 0.65rem 0 0;
	}

	.grammar-readout div {
		display: grid;
		grid-template-columns: 4rem minmax(0, 1fr);
		gap: 0.4rem;
	}

	.grammar-readout dt {
		color: #868492;
		font-size: 0.6rem;
	}

	.grammar-readout dd {
		margin: 0;
		overflow-wrap: anywhere;
		color: #d8d0bd;
		font: 0.62rem/1.4 var(--font-mono);
	}

	.grammar-editor {
		display: grid;
		grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.35fr);
		gap: 0.55rem;
		margin-top: 0.75rem;
	}

	.growth-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		margin-top: 0.65rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		padding: 0.55rem;
	}

	.growth-controls strong,
	.growth-controls small {
		display: block;
	}

	.growth-controls strong {
		color: #e7ddc9;
		font-size: 0.64rem;
	}

	.growth-controls small {
		margin-top: 0.12rem;
		color: var(--atlas-muted);
		font-size: 0.56rem;
	}

	.growth-controls button {
		flex: 0 0 auto;
		padding-inline: 0.7rem;
		font-size: 0.62rem;
	}

	.advanced-card {
		grid-column: 1 / -1;
	}

	.advanced-card summary {
		min-height: 2.75rem;
		color: #eee5d3;
		font-size: 0.68rem;
		font-weight: 720;
		cursor: pointer;
	}

	.transform-table {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.ifs-colour-control {
		max-width: 26rem;
		margin: 0.7rem 0;
	}

	.transform-table fieldset {
		margin: 0;
	}

	.transform-table label {
		grid-template-columns: 2.5rem 1fr;
		align-items: center;
		margin-bottom: 0.28rem;
	}

	.transform-table input {
		min-height: 2.75rem;
	}

	.limit-list {
		display: grid;
		gap: 0.45rem;
		margin: 0.7rem 0;
		padding-left: 1.1rem;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.limit-list b {
		color: #e9ddc5;
	}

	.experiment-field-guide {
		border: 1px solid var(--atlas-rule);
		border-radius: 0.42rem;
		background: var(--atlas-panel);
		padding: 0.85rem;
	}

	.experiment-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.7rem;
	}

	.experiment-grid article {
		display: grid;
		align-content: start;
		gap: 0.42rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.38rem;
		background: #0c0e15;
		padding: 0.7rem;
	}

	.experiment-grid article > p {
		margin: 0;
		color: var(--atlas-brass);
		font-size: 0.53rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.experiment-grid h4 {
		margin: 0;
		color: #f0e7d4;
		font-size: 0.78rem;
	}

	.experiment-grid article > strong {
		color: #b9c8c9;
		font-size: 0.62rem;
		font-weight: 620;
		line-height: 1.42;
	}

	.experiment-grid details {
		color: var(--atlas-muted);
		font-size: 0.58rem;
		line-height: 1.4;
	}

	.experiment-grid summary {
		min-height: 1.8rem;
		color: #89b8bc;
		cursor: pointer;
	}

	.experiment-grid dl {
		display: grid;
		gap: 0.42rem;
		margin: 0.25rem 0 0;
	}

	.experiment-grid dl div {
		display: grid;
		grid-template-columns: 5.8rem 1fr;
		gap: 0.35rem;
	}

	.experiment-grid dt {
		color: #c8aa70;
		font-weight: 700;
	}

	.experiment-grid dd {
		margin: 0;
	}

	.experiment-grid article > button {
		align-self: end;
		margin-top: 0.15rem;
	}

	.guided-orbit-comparison > div {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.65rem;
	}

	.guided-orbit-comparison article {
		display: grid;
		gap: 0.48rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.36rem;
		background: #0b0d14;
		padding: 0.6rem;
	}

	.guided-orbit-comparison article > div,
	.guided-orbit-comparison article dl {
		display: grid;
		gap: 0.22rem;
		margin: 0;
	}

	.guided-orbit-comparison strong {
		color: #e8d8b4;
		font-size: 0.65rem;
	}

	.guided-orbit-comparison code {
		overflow-wrap: anywhere;
		color: #8fc1c3;
		font-size: 0.55rem;
	}

	.guided-orbit-comparison dl div {
		display: flex;
		justify-content: space-between;
		gap: 0.35rem;
		border-top: 1px solid var(--atlas-rule);
		padding-top: 0.2rem;
		font-size: 0.54rem;
	}

	.guided-orbit-comparison dd {
		margin: 0;
		color: #d2cabd;
	}

	.guided-orbit-comparison article small {
		color: var(--atlas-muted);
		font-size: 0.54rem;
		line-height: 1.4;
	}

	.guided-orbit-comparison article button {
		align-self: end;
		font-size: 0.56rem;
	}

	.guided-canvas-comparison > div {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.65rem;
	}

	.guided-canvas-comparison .four-up {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.guided-canvas-comparison .three-up {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.guided-canvas-comparison figure {
		overflow: hidden;
		margin: 0;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.35rem;
		background: #090a10;
	}

	.guided-canvas-comparison figure > div {
		height: 9.25rem;
	}

	:global(.guided-canvas-comparison .fractal-stage) {
		min-height: 0;
	}

	.guided-canvas-comparison figcaption {
		display: grid;
		gap: 0.24rem;
		border-top: 1px solid var(--atlas-rule);
		padding: 0.48rem;
	}

	.guided-canvas-comparison figcaption strong {
		color: #e7d7b5;
		font-size: 0.61rem;
	}

	.guided-canvas-comparison figcaption code {
		overflow-wrap: anywhere;
		color: #83b6b9;
		font-size: 0.51rem;
		line-height: 1.35;
	}

	.preset-gallery {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.preset-gallery section {
		border: 1px solid var(--atlas-rule);
		border-radius: 0.42rem;
		background: var(--atlas-panel);
		padding: 0.7rem;
	}

	.preset-gallery h3 {
		margin: 0 0 0.5rem;
		color: var(--atlas-brass);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: capitalize;
	}

	.preset-gallery section > div {
		display: grid;
		gap: 0.42rem;
	}

	.preset-gallery article {
		display: grid;
		overflow: hidden;
		border: 1px solid var(--atlas-rule-bright);
		border-radius: 0.35rem;
		background: #0b0d14;
		text-align: left;
	}

	.preset-gallery article > img {
		width: 100%;
		height: 7.2rem;
		border-bottom: 1px solid var(--atlas-rule);
		object-fit: cover;
		filter: saturate(0.9) contrast(1.04);
	}

	.preset-card-copy {
		display: grid;
		gap: 0.45rem;
		padding: 0.62rem;
	}

	.preset-card-copy h4,
	.preset-card-copy p {
		margin: 0;
	}

	.preset-card-copy h4 {
		color: #e8dcc3;
		font-size: 0.72rem;
	}

	.preset-card-copy > p {
		color: var(--atlas-muted);
		font-size: 0.6rem;
		line-height: 1.45;
	}

	.preset-card-copy dl {
		display: grid;
		gap: 0.22rem;
		margin: 0;
	}

	.preset-card-copy dl div {
		display: grid;
		grid-template-columns: 4.7rem minmax(0, 1fr);
		gap: 0.35rem;
		border-top: 1px solid rgba(116, 110, 127, 0.16);
		padding-top: 0.22rem;
	}

	.preset-card-copy dt {
		color: #a19b8f;
		font-size: 0.52rem;
	}

	.preset-card-copy dd {
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
		color: #c8c1b4;
		font-size: 0.54rem;
	}

	.preset-card-copy code {
		color: #82b9bc;
		font-size: inherit;
	}

	.preset-verification {
		color: #8ea99a;
		font-size: 0.51rem;
		line-height: 1.4;
	}

	.preset-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
		margin-top: 0.1rem;
	}

	.preset-actions button {
		padding: 0.48rem;
		font-size: 0.56rem;
		text-align: center;
	}

	.preset-actions button:only-child {
		grid-column: 1 / -1;
	}

	.png-exporter {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.75rem;
		border: 1px solid var(--atlas-rule);
		border-radius: 0.42rem;
		background: #0c0e15;
		padding: 0.7rem;
	}

	.png-dimensions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.png-caption-toggle {
		display: flex;
		align-items: start;
		gap: 0.55rem;
		border: 1px solid #33333f;
		background: #10121a;
		padding: 0.55rem 0.65rem;
	}

	.png-caption-toggle input {
		flex: 0 0 auto;
		margin-top: 0.18rem;
	}

	.png-caption-toggle > span,
	.png-caption-toggle b,
	.png-caption-toggle small {
		display: block;
	}

	.png-caption-toggle b {
		color: #d8d1c4;
		font-size: 0.62rem;
	}

	.png-caption-toggle small {
		margin-top: 0.18rem;
		color: var(--atlas-muted);
		font-size: 0.56rem;
		line-height: 1.45;
	}

	.png-plan {
		border-left: 3px solid #816a3f;
		background: #13151e;
		padding: 0.55rem 0.65rem;
	}

	.png-plan strong,
	.png-plan small {
		display: block;
	}

	.png-plan strong {
		color: #d8d1c4;
		font: 0.58rem/1.5 var(--font-mono);
	}

	.png-plan small {
		margin-top: 0.28rem;
		color: var(--atlas-muted);
		font-size: 0.59rem;
		line-height: 1.45;
	}

	.png-plan .export-error {
		color: #f0aa9d;
	}

	.png-progress {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 0.55rem;
	}

	.png-progress progress {
		width: 100%;
		height: 0.55rem;
		accent-color: var(--atlas-brass);
	}

	.png-progress output {
		color: #d6c08d;
		font: 0.58rem/1 var(--font-mono);
	}

	.png-actions {
		display: flex;
		align-items: stretch;
		gap: 0.45rem;
	}

	.png-actions button {
		padding: 0.6rem 0.75rem;
		font-size: 0.62rem;
	}

	.png-actions button:first-child {
		display: grid;
		flex: 1;
		gap: 0.15rem;
		text-align: left;
	}

	.png-actions small {
		color: var(--atlas-muted);
		font-size: 0.56rem;
	}

	.png-actions .secondary-action {
		flex: 0 0 auto;
		border-color: #8b534b;
		color: #f0c5bc;
	}

	.export-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.7rem;
	}

	.export-grid button {
		display: grid;
		gap: 0.18rem;
		padding: 0.65rem;
		text-align: left;
	}

	.import-settings {
		display: grid;
		gap: 0.18rem;
		border: 1px solid var(--atlas-rule-bright);
		border-radius: 0.3rem;
		background: #171924;
		padding: 0.65rem;
		color: var(--atlas-text);
		cursor: pointer;
	}

	.import-settings input {
		width: 100%;
		margin-top: 0.25rem;
		color: var(--atlas-muted);
		font-size: 0.55rem;
	}

	.import-settings b {
		font-size: 0.67rem;
	}

	.export-grid b {
		font-size: 0.67rem;
	}

	.export-grid small {
		color: var(--atlas-muted);
		font-size: 0.58rem;
		line-height: 1.35;
	}

	.save-row {
		grid-template-columns: 1fr auto;
	}

	.save-row button {
		padding-inline: 0.8rem;
		font-size: 0.62rem;
		font-weight: 720;
	}

	.specimen-list {
		display: grid;
		gap: 0.4rem;
		margin: 0.7rem 0 0;
		padding: 0;
		list-style: none;
	}

	.specimen-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.38rem;
		border-top: 1px solid var(--atlas-rule);
		padding-top: 0.4rem;
	}

	.specimen-list b,
	.specimen-list small {
		display: block;
	}

	.specimen-list b {
		overflow: hidden;
		font-size: 0.65rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.specimen-list small {
		margin-top: 0.12rem;
		color: var(--atlas-muted);
		font-size: 0.55rem;
	}

	.specimen-list button {
		min-height: 2.75rem;
		padding: 0.35rem 0.5rem;
		font-size: 0.57rem;
	}

	.specimen-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.3rem;
	}

	.danger-button {
		border-color: #754a45;
		color: #dfa39a;
	}

	.warning-ledger {
		margin: 0 0.85rem 0.85rem;
		border: 1px solid #725c34;
		border-radius: 0.4rem;
		background: #211c14;
		padding: 0.55rem 0.7rem;
		color: #ddc28a;
	}

	.warning-ledger summary {
		min-height: 2.5rem;
		font-size: 0.64rem;
		font-weight: 720;
		cursor: pointer;
	}

	.warning-ledger ul {
		margin: 0.35rem 0;
		padding-left: 1rem;
		font-size: 0.6rem;
		line-height: 1.45;
	}

	.atlas-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		border-top: 1px solid var(--atlas-rule);
		background: #0b0d13;
		padding: 0.65rem 0.85rem;
	}

	.atlas-footer p {
		margin: 0;
		color: var(--atlas-muted);
		font-size: 0.6rem;
		line-height: 1.45;
	}

	.atlas-footer b {
		color: #d5c8ae;
	}

	.atlas-footer button {
		flex: 0 0 auto;
		padding: 0.4rem 0.6rem;
		font-size: 0.58rem;
	}

	.tour-scrim {
		position: absolute;
		z-index: 20;
		inset: 0;
		display: flex;
		align-items: end;
		justify-content: center;
		background: linear-gradient(transparent 32%, rgba(4, 5, 9, 0.74));
		padding: 1rem;
		pointer-events: auto;
	}

	.tour-card {
		width: min(37rem, 100%);
		margin: 0;
		border: 1px solid #8a7446;
		border-radius: 0.55rem;
		background: rgba(17, 19, 27, 0.97);
		padding: 0.9rem;
		box-shadow: 0 1.2rem 4rem rgba(0, 0, 0, 0.52);
		pointer-events: auto;
	}

	:global(.no-script-atlas) {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.6fr);
		align-items: center;
		background: #0d0f16;
	}

	:global(.no-script-atlas img) {
		display: block;
		width: 100%;
		height: auto;
	}

	:global(.no-script-atlas > div) {
		padding: 1.2rem;
	}

	:global(.no-script-atlas p:first-child) {
		margin: 0;
		color: var(--atlas-brass);
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	:global(.no-script-atlas h2) {
		margin: 0.35rem 0;
		color: var(--atlas-text);
		font-size: 1.2rem;
	}

	:global(.no-script-atlas p:last-child) {
		color: var(--atlas-muted);
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.tour-card > p:not(:first-child) {
		margin: 0.65rem 0;
		color: var(--atlas-muted);
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.tour-progress {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 0.22rem;
		margin-top: 0.7rem;
	}

	.tour-progress i {
		height: 0.24rem;
		border-radius: 999px;
		background: #343641;
	}

	.tour-progress i.active {
		background: var(--atlas-brass);
	}

	.tour-actions {
		display: flex;
		justify-content: end;
		gap: 0.4rem;
	}

	.tour-actions button {
		padding-inline: 0.65rem;
		font-size: 0.62rem;
	}

	.tour-actions .primary-action {
		border-color: #a28248;
		background: #3a2e1d;
		color: #f0d59a;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 68rem) {
		.canvas-rack.with-companion {
			grid-template-columns: minmax(0, 1.35fr) minmax(14rem, 0.65fr);
		}

		.readout-strip {
			grid-template-columns: repeat(4, 1fr);
		}

		.readout-strip > p {
			grid-column: 1 / -1;
			border-top: 1px solid var(--atlas-rule);
		}

		.wide-label {
			display: none;
		}

		.short-label {
			display: inline;
		}

		.transform-table {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 50rem) {
		.atlas-header {
			align-items: start;
			flex-direction: column;
		}

		.history-tools {
			width: 100%;
			overflow-x: auto;
		}

		.history-tools button {
			flex: 1 0 auto;
		}

		.canvas-rack,
		.canvas-rack.with-companion,
		.canvas-rack.compare {
			grid-template-columns: 1fr;
			min-height: auto;
		}

		.primary-plane {
			min-height: 29rem;
		}

		.companion-plane {
			min-height: 29rem;
			border-top: 1px solid var(--atlas-rule);
			border-left: 0;
		}

		.panel-stack,
		.preset-gallery,
		.experiment-grid,
		.colour-costume-lab > div {
			grid-template-columns: 1fr;
		}

		.compare-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.compare-controls > label:first-child {
			grid-column: 1 / -1;
		}

		.density-band-grid {
			grid-template-columns: 1fr;
		}

		.progress-strip {
			grid-template-columns: 1fr;
		}

		.progress-strip nav {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
		}

		.instrument-bay {
			min-height: 0;
			padding: 0.65rem;
		}

		:global(.no-script-atlas) {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 36rem) {
		.history-tools button span:not(.sr-only) {
			display: none;
		}

		.readout-strip {
			grid-template-columns: repeat(2, 1fr);
		}

		.panel-tabs {
			position: sticky;
			z-index: 8;
			bottom: 0;
			overflow-x: auto;
			grid-template-columns: repeat(7, minmax(4.2rem, 1fr));
			padding-bottom: max(0.2rem, env(safe-area-inset-bottom));
		}

		.instrument-bay {
			max-height: min(62svh, 40rem);
			overflow-y: auto;
			overscroll-behavior: contain;
			padding-bottom: max(0.65rem, env(safe-area-inset-bottom));
			scrollbar-gutter: stable;
		}

		.toggle-grid,
		.field-grid,
		.map-identity,
		.workshop-switches,
		.guided-orbit-comparison > div,
		.guided-canvas-comparison .four-up,
		.guided-canvas-comparison .three-up,
		.newton-editor,
		.grammar-editor,
		.export-grid,
		.png-dimensions,
		.transform-table {
			grid-template-columns: 1fr;
		}

		.coefficient-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.coefficient-row strong {
			grid-column: 1 / -1;
		}

		.compare-controls,
		.save-row,
		.parameter-pins,
		.parameter-path-controls,
		.compare-divider-control {
			grid-template-columns: 1fr;
		}

		.parameter-pins > div:nth-of-type(2) {
			grid-template-columns: 1fr;
		}

		.workshop-actions {
			display: grid;
			grid-template-columns: 1fr;
		}

		.png-actions {
			flex-direction: column;
		}

		.quality-row {
			flex-wrap: wrap;
		}

		.quality-row > span {
			width: 100%;
		}

		.progress-strip nav {
			grid-template-columns: repeat(2, 1fr);
		}

		.plane-label {
			align-items: start;
			flex-direction: column;
		}

		.atlas-footer {
			align-items: stretch;
			flex-direction: column;
		}

		.tour-actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.tour-actions .primary-action {
			grid-column: 1 / -1;
		}

		.passport-drawer > summary {
			align-items: start;
			flex-direction: column;
		}

		.passport-drawer > summary code {
			text-align: left;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.atlas,
		.progress-strip > div span {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.atlas,
		.control-card,
		.advanced-card,
		.experiment-field-guide,
		.experiment-grid article,
		.preset-gallery section,
		.map-workshop,
		.map-identity,
		.tour-card {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		button,
		input,
		select,
		textarea {
			border: 2px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
		}
	}
</style>
