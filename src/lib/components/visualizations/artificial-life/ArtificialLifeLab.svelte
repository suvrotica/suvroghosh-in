<script lang="ts">
	import { onMount } from 'svelte';
	import ArtificialLifeCanvas from './ArtificialLifeCanvas.svelte';
	import SimulationControls from './SimulationControls.svelte';
	import SimulationStatsView from './SimulationStats.svelte';
	import { SeededRandom } from '$lib/visualizations/artificial-life/seededRandom';
	import {
		ARTIFICIAL_LIFE_PRESETS,
		DEFAULT_SIMULATION_PARAMETERS,
		SIMULATION_CONTROLS,
		randomizeParameters
	} from '$lib/visualizations/artificial-life/simulationPresets';
	import {
		EMPTY_SIMULATION_STATS,
		type NumericSimulationParameter,
		type SimulationHistoryPoint,
		type SimulationParameters,
		type SimulationStats as SimulationStatsData,
		type SimulationUpdate,
		type TraitDistributions
	} from '$lib/visualizations/artificial-life/types';

	type Props = {
		title?: string;
		caption?: string;
		compact?: boolean;
		controls?: boolean;
		poster?: string;
	};

	let {
		title = 'Evolving Microbe Garden',
		caption = 'A deterministic artificial-life model: organisms inherit bounded traits, compete for energy, reproduce with mutation, and die.',
		compact = false,
		controls = true,
		poster = '/images/visualizations/artificial-life-lab-evolving-microbe-garden-poster.jpg'
	}: Props = $props();

	let parameters = $state<SimulationParameters>({ ...DEFAULT_SIMULATION_PARAMETERS });
	let seed = $state('evolving-microbe-garden');
	let paused = $state(true);
	let reducedMotion = $state(false);
	let highlightLineage = $state(false);
	let pendingRestart = $state<string[]>([]);
	let currentPresetId = $state('');
	let restartToken = $state(0);
	let stepToken = $state(0);
	let status = $state('Preparing the habitat…');
	let stats = $state<SimulationStatsData>({ ...EMPTY_SIMULATION_STATS });
	let history = $state<SimulationHistoryPoint[]>([]);
	let distributions = $state<TraitDistributions>({
		movementSpeed: [],
		bodySize: [],
		sensoryRadius: [],
		mutationRate: []
	});
	let randomizationCount = 0;

	function updateParameter(key: NumericSimulationParameter, value: number) {
		parameters = { ...parameters, [key]: value };
		currentPresetId = '';
		const control = SIMULATION_CONTROLS.find((item) => item.key === key);
		if (control?.restartRequired && !pendingRestart.includes(control.label)) {
			pendingRestart = [...pendingRestart, control.label];
		}
	}

	function updateSeed(value: string) {
		seed = value;
		currentPresetId = '';
		if (!pendingRestart.includes('Deterministic seed')) {
			pendingRestart = [...pendingRestart, 'Deterministic seed'];
		}
	}

	function updatePredators(value: boolean) {
		parameters = { ...parameters, predatorsEnabled: value };
		currentPresetId = '';
		status = value ? 'Predators entered the habitat.' : 'Predators removed from the habitat.';
	}

	function applyPreset(id: string) {
		const preset = ARTIFICIAL_LIFE_PRESETS.find((item) => item.id === id);
		if (!preset) return;
		parameters = { ...preset.parameters };
		seed = preset.seed;
		currentPresetId = preset.id;
		pendingRestart = [];
		restartToken += 1;
		status = `${preset.label} loaded with seed ${preset.seed}.`;
	}

	function restart() {
		seed = seed.trim() || 'evolving-microbe-garden';
		pendingRestart = [];
		restartToken += 1;
		status = `Habitat restarted from seed ${seed}.`;
	}

	function pauseOrResume() {
		paused = !paused;
		status = paused ? 'Simulation paused.' : 'Simulation running.';
	}

	function stepGeneration() {
		paused = true;
		stepToken += 1;
	}

	function randomize() {
		randomizationCount += 1;
		const random = new SeededRandom(`${seed}-parameter-draw-${randomizationCount}`);
		parameters = randomizeParameters(random);
		seed = `garden-${random.integer(1000, 9999)}`;
		currentPresetId = '';
		pendingRestart = [];
		restartToken += 1;
		status = `Randomized conditions loaded with seed ${seed}.`;
	}

	function restoreDefaults() {
		parameters = { ...DEFAULT_SIMULATION_PARAMETERS };
		seed = 'evolving-microbe-garden';
		currentPresetId = '';
		pendingRestart = [];
		restartToken += 1;
		status = 'Default conditions restored.';
	}

	function receiveUpdate(update: SimulationUpdate) {
		stats = update.stats;
		history = update.history;
		distributions = update.distributions;
	}

	onMount(() => {
		const query = new URLSearchParams(window.location.search);
		reducedMotion =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			query.get('motion') === 'reduce';
		paused = reducedMotion;
		status = reducedMotion ? 'Paused because reduced motion is requested.' : 'Simulation running.';
	});
</script>

<section
	class="artificial-life-lab article-breakout not-prose relative my-10 w-[min(78rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl shadow-black/30"
	aria-labelledby="artificial-life-lab-heading"
>
	<header
		class="flex flex-col gap-4 border-b border-neutral-800 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
	>
		<div class="min-w-0">
			<p class="m-0 text-[0.68rem] font-bold tracking-[0.18em] text-cyan-300 uppercase">
				Artificial Life Lab · Series 01
			</p>
			<h2
				id="artificial-life-lab-heading"
				class="mt-1 mb-0 text-xl font-bold text-white sm:text-2xl"
			>
				{title}
			</h2>
		</div>
		<div class="flex flex-wrap items-center gap-2" aria-label="Simulation actions">
			<button type="button" onclick={pauseOrResume} class="lab-toolbar-button lab-toolbar-primary">
				{paused ? 'Resume' : 'Pause'}
			</button>
			<button
				type="button"
				onclick={stepGeneration}
				class="lab-toolbar-button"
				aria-describedby="generation-window-help"
			>
				Advance 8 simulated seconds
			</button>
			<button type="button" onclick={restart} class="lab-toolbar-button">Restart</button>
		</div>
	</header>

	<div class={compact ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]' : ''}>
		<ArtificialLifeCanvas
			{parameters}
			{seed}
			{paused}
			{restartToken}
			{stepToken}
			{highlightLineage}
			{poster}
			onupdate={receiveUpdate}
			onstatus={(message) => (status = message)}
		/>

		<div
			class={`border-t border-neutral-800 bg-neutral-950 p-4 sm:p-5 ${compact ? 'xl:border-t-0 xl:border-l' : ''}`}
		>
			<SimulationStatsView {stats} {history} {distributions} {compact} />
		</div>
	</div>

	<div
		class="flex flex-col gap-1 border-t border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-5"
	>
		<p id="generation-window-help" class="m-0">
			This advances exactly 240 fixed ticks. Generations overlap, so zero, one, or many births may
			occur.
		</p>
		<p class="m-0 font-mono text-neutral-300" aria-live="polite">{status}</p>
	</div>

	{#if controls && !compact}
		<SimulationControls
			{parameters}
			{seed}
			{paused}
			{reducedMotion}
			{highlightLineage}
			{pendingRestart}
			{currentPresetId}
			onparameter={updateParameter}
			onpredators={updatePredators}
			onseed={updateSeed}
			onhighlight={(value) => (highlightLineage = value)}
			onpreset={applyPreset}
			onpause={pauseOrResume}
			onstep={stepGeneration}
			onrestart={restart}
			onrandomize={randomize}
			ondefaults={restoreDefaults}
		/>
	{/if}

	<footer
		class="border-t border-neutral-800 px-4 py-3 text-xs leading-relaxed text-neutral-500 sm:px-5"
	>
		{caption} This is an explanatory model, not a claim that the organisms are conscious or biologically
		complete.
	</footer>
</section>

<style>
	.lab-toolbar-button {
		min-height: 2.75rem;
		border: 1px solid #525252;
		border-radius: 0.5rem;
		background: #171717;
		padding: 0.55rem 0.8rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: #f5f5f5;
	}

	.lab-toolbar-button:hover {
		border-color: #a3a3a3;
		background: #262626;
	}

	.lab-toolbar-primary {
		border-color: #67e8f9;
		background: #a5f3fc;
		color: #0a0a0a;
	}

	@media (prefers-reduced-motion: reduce) {
		.lab-toolbar-button {
			transition: none;
		}
	}
</style>
