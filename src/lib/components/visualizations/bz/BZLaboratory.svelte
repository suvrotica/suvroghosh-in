<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BZDishStage, {
		type BZEngineKind,
		type BZStageCommand,
		type BZStageFrame,
		type BZTool
	} from './BZDishStage.svelte';
	import BZProbePanel, { type BZProbeSample } from './BZProbePanel.svelte';
	import {
		BZ_GUIDED_EXPERIMENTS,
		BZ_PRESETS,
		DEFAULT_OREGONATOR_SETUP,
		assessBZTimestep,
		buildBZShareUrl,
		createBZExperimentRecord,
		decodeBZUrlState,
		getBZPreset,
		parseBZExperiment,
		scanSchnakenbergDispersion,
		serializeBZExperiment
	} from '$lib/visualizations/bz';
	import type { BZPresetV2 } from '$lib/visualizations/bz/v2-types';
	import { createBZExportCanvas } from '$lib/visualizations/bz/display';
	import type {
		ActiveTerms,
		BZFieldState,
		BZGuidedExperiment,
		BZIntervention,
		BZPalette,
		BZSetup,
		BZViewMode,
		ProbeReading
	} from '$lib/visualizations/bz';

	type Panel = 'readout' | 'probe' | 'method' | 'export';
	type SpeedId = 'observe' | 'normal' | 'fast';
	type GuidedPayload = {
		experimentId?: string;
		sourceGuideId?: string;
		presetId?: string;
		setup?: BZSetup;
		observationTime?: number;
		interventions?: readonly BZIntervention[];
		activeTerms?: ActiveTerms;
	};
	type Props = {
		requestedV2Preset?: Readonly<BZPresetV2> | null;
		requestRevision?: number;
	};

	let { requestedV2Preset = null, requestRevision = 0 }: Props = $props();

	const SPEEDS: Readonly<Record<SpeedId, { label: string; work: number }>> = {
		observe: { label: 'Observe', work: 240 },
		normal: { label: 'Normal', work: 720 },
		fast: { label: 'Fast', work: 1_500 }
	};
	const VIEWS: readonly { id: BZViewMode; label: string }[] = [
		{ id: 'dish', label: 'Dish composite' },
		{ id: 'u', label: 'u field' },
		{ id: 'v', label: 'v field' },
		{ id: 'reaction-u', label: 'Reaction Rᵤ' },
		{ id: 'diffusion-u', label: 'Diffusion Dᵤ∇²u' },
		{ id: 'net-u', label: 'Net ∂u/∂t' },
		{ id: 'difference-from-mean', label: 'u − mean(u)' },
		{ id: 'mask', label: 'Physical mask' }
	];
	const PALETTES: readonly { id: BZPalette; label: string }[] = [
		{ id: 'ferroin', label: 'Ferroin' },
		{ id: 'cerium', label: 'Cerium' },
		{ id: 'phase-spectrum', label: 'Phase spectrum' },
		{ id: 'scientific', label: 'Scientific' },
		{ id: 'high-contrast', label: 'High contrast' }
	];
	const TOOLS: readonly { id: BZTool; label: string; key: string; hint: string }[] = [
		{
			id: 'probe',
			label: 'Probe',
			key: '1',
			hint: 'Read a local u,v history without changing the field.'
		},
		{ id: 'excite', label: 'Excite · one pulse', key: '2', hint: 'Add one finite local u pulse.' },
		{ id: 'inhibit', label: 'Inhibit', key: '3', hint: 'Lower u and raise recovery v locally.' },
		{
			id: 'cut',
			label: 'Cut front',
			key: '4',
			hint: 'Drag a recovered-state line through a wave front.'
		},
		{
			id: 'pacemaker',
			label: 'Pacemaker · repeated',
			key: 'P',
			hint: 'Schedule eight deterministic local pulses.'
		},
		{ id: 'obstacle', label: 'Obstacle', key: 'O', hint: 'Drag an impermeable no-flux obstacle.' },
		{
			id: 'restore',
			label: 'Restore',
			key: 'X',
			hint: 'Re-open obstacle cells from neighbour means.'
		}
	];

	function cloneSetup(source: Readonly<BZSetup>): BZSetup {
		return { ...source, parameters: { ...source.parameters } } as BZSetup;
	}

	function safeTimestepAssessment(source: Readonly<BZSetup>) {
		try {
			return assessBZTimestep(source);
		} catch (error) {
			return {
				state: 'unsafe' as const,
				gridSpacing: Number.NaN,
				diffusionLimit: Number.NaN,
				diffusionRatio: Number.POSITIVE_INFINITY,
				reactionScale: Number.POSITIVE_INFINITY,
				reasons: [error instanceof Error ? error.message : 'The raw setup is invalid.']
			};
		}
	}

	function safeTuringReading(source: Readonly<BZSetup>) {
		if (source.model !== 'schnakenberg') return null;
		try {
			return scanSchnakenbergDispersion(source, { samples: 256 });
		} catch {
			return null;
		}
	}

	let initialPreset = getBZPreset('zhabotinsky-dish');
	let setup = $state<BZSetup>(cloneSetup(initialPreset.setup));
	let presetId = $state(initialPreset.id);
	let running = $state(false);
	let speed = $state<SpeedId>('normal');
	let view = $state<BZViewMode>('dish');
	let palette = $state<BZPalette>(initialPreset.palette);
	let tool = $state<BZTool>('probe');
	let brushRadius = $state(0.045);
	let showSourceMarkers = $state(true);
	let selected = $state<readonly [number, number]>([0.5, 0.5]);
	let termsMode = $state<'both' | 'reaction' | 'diffusion'>('both');
	let panel = $state<Panel>('readout');
	let status = $state(
		'Ready. Choose a preset, then run fixed numerical steps or intervene in the dish.'
	);
	let urlIssues = $state<string[]>([]);
	let latestFrame = $state.raw<BZStageFrame | null>(null);
	let probeHistory = $state<BZProbeSample[]>([]);
	let probeActive = $state(true);
	let stage: BZDishStage | undefined = $state();
	let laboratory: HTMLElement | undefined = $state();
	let jsonInput: HTMLInputElement | undefined = $state();
	let isFullscreen = $state(false);
	let busy = $state(false);
	let engine = $state<BZEngineKind>('cpu-f64');
	let engineFailure = $state(false);
	let v2InitialInterventions = $state<readonly BZIntervention[]>([]);
	let v2PresetTitle = $state<string | null>(null);
	let v2NumericallyModified = $state(false);
	let appliedV2RequestRevision = -1;

	let activeTerms = $derived<ActiveTerms>({
		reaction: termsMode !== 'diffusion',
		diffusion: termsMode !== 'reaction'
	});
	let timestepAssessment = $derived(safeTimestepAssessment(setup));
	let turingReading = $derived(safeTuringReading(setup));
	let currentMetrics = $derived(
		latestFrame?.metrics ?? {
			activeCells: 0,
			meanU: 0,
			meanV: 0,
			varianceU: 0,
			varianceV: 0,
			minimumU: 0,
			maximumU: 0,
			minimumV: 0,
			maximumV: 0,
			excitedFraction: 0
		}
	);

	$effect(() => {
		const preset = requestedV2Preset;
		const revision = requestRevision;
		if (!preset || revision === appliedV2RequestRevision) return;
		appliedV2RequestRevision = revision;
		void openV2Setup(preset);
	});

	onMount(() => {
		const hasState = new URLSearchParams(window.location.search).has('bz_v');
		if (hasState) void restoreUrlState();
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			running = false;
			status = 'Reduced motion is preferred, so this deterministic experiment begins paused.';
		}
		const guideHandler = (event: Event) =>
			void openGuide((event as CustomEvent<GuidedPayload>).detail);
		const fullscreenHandler = () => (isFullscreen = document.fullscreenElement === laboratory);
		window.addEventListener('bz-guide-select', guideHandler);
		document.addEventListener('fullscreenchange', fullscreenHandler);
		return () => {
			window.removeEventListener('bz-guide-select', guideHandler);
			document.removeEventListener('fullscreenchange', fullscreenHandler);
		};
	});

	async function restoreUrlState() {
		const decoded = decodeBZUrlState(window.location.href, DEFAULT_OREGONATOR_SETUP);
		setup = cloneSetup(decoded.state.setup);
		presetId = decoded.state.presetId;
		termsMode = termsModeFor(decoded.state.activeTerms);
		view = decoded.state.display.view;
		palette = decoded.state.display.palette;
		urlIssues = [...decoded.issues];
		v2InitialInterventions = [];
		v2PresetTitle = null;
		v2NumericallyModified = false;
		running = false;
		probeHistory = [];
		await tick();
		if (decoded.state.step > 0 || decoded.state.interventions.length > 0) {
			busy = true;
			await stage?.replay(decoded.state.step, decoded.state.interventions);
			busy = false;
		}
		status = decoded.issues.length
			? 'Shared state opened with the disclosures listed below.'
			: 'Versioned setup, seed, fixed step and bounded intervention log restored from the address.';
	}

	async function openGuide(detail: GuidedPayload) {
		const guide = findGuide(detail);
		if (!guide && !detail.setup) return;
		const nextSetup = detail.setup ?? getBZPreset(guide!.presetId).setup;
		const requestedPreset = detail.presetId
			? BZ_PRESETS.find((candidate) => candidate.id === detail.presetId)
			: undefined;
		setup = cloneSetup(nextSetup);
		presetId = requestedPreset?.id ?? guide?.presetId ?? 'custom';
		palette = getBZPreset(
			presetId === 'custom'
				? setup.model === 'oregonator'
					? 'zhabotinsky-dish'
					: 'diffusion-driven-spots'
				: presetId
		).palette;
		view = 'dish';
		termsMode = termsModeFor(detail.activeTerms ?? { reaction: true, diffusion: true });
		v2InitialInterventions = [];
		v2PresetTitle = null;
		v2NumericallyModified = false;
		running = false;
		probeHistory = [];
		await tick();
		const events = detail.interventions ?? guide?.interventions ?? [];
		if (events.length > 0) await stage?.replay(0, events);
		status = `${guide?.title ?? 'Guided setup'} opened exactly. The field is live, paused at model step zero.`;
		laboratory?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function findGuide(detail: GuidedPayload): BZGuidedExperiment | undefined {
		const experimentGuide = detail.experimentId
			? BZ_GUIDED_EXPERIMENTS.find((candidate) => candidate.id === detail.experimentId)
			: undefined;
		return (
			experimentGuide ??
			(detail.sourceGuideId
				? BZ_GUIDED_EXPERIMENTS.find((candidate) => candidate.id === detail.sourceGuideId)
				: undefined)
		);
	}

	function termsModeFor(terms: Readonly<ActiveTerms>): typeof termsMode {
		if (terms.reaction && terms.diffusion) return 'both';
		return terms.reaction ? 'reaction' : 'diffusion';
	}

	function loadPreset(id: string) {
		const preset = getBZPreset(id);
		setup = cloneSetup(preset.setup);
		presetId = preset.id;
		palette = preset.palette;
		view = 'dish';
		termsMode = 'both';
		v2InitialInterventions = [];
		v2PresetTitle = null;
		v2NumericallyModified = false;
		running = false;
		probeHistory = [];
		status = `${preset.title} loaded from seed “${preset.setup.seed}”. Its browser-calibration claim is shown below.`;
	}

	async function openV2Setup(preset: Readonly<BZPresetV2>) {
		const requiresExplicitReset =
			termsMode === 'both' && JSON.stringify(setup) === JSON.stringify(preset.setup);
		setup = cloneSetup(preset.setup);
		presetId = 'custom';
		palette = 'ferroin';
		view = 'dish';
		termsMode = 'both';
		v2InitialInterventions = [...preset.initialInterventions];
		v2PresetTitle = preset.title;
		v2NumericallyModified = false;
		running = false;
		probeHistory = [];
		latestFrame = null;
		engineFailure = false;
		status = `${preset.title} opened from the V2 manifest at its declared genesis setup. The Gallery checkpoint session remains separate and unchanged.`;
		await tick();
		if (requiresExplicitReset) stage?.reset();
	}

	function switchModel(model: BZSetup['model']) {
		loadPreset(model === 'oregonator' ? 'zhabotinsky-dish' : 'diffusion-driven-spots');
	}

	function markCustom(reason = 'Raw setup changed; the run restarted from step zero.') {
		presetId = 'custom';
		v2InitialInterventions = [];
		v2PresetTitle = null;
		v2NumericallyModified = false;
		running = false;
		probeHistory = [];
		status = reason;
	}

	function updateCommonNumber(
		key: 'diffusionU' | 'diffusionV' | 'timestep' | 'domainSize' | 'activeRadius',
		event: Event
	) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		setup = { ...setup, [key]: value } as BZSetup;
		markCustom();
	}

	function updateGrid(event: Event) {
		const gridSize = Number((event.currentTarget as HTMLSelectElement).value);
		setup = { ...setup, gridSize } as BZSetup;
		markCustom(`Requested grid changed to ${gridSize} × ${gridSize}; solver state restarted.`);
	}

	function updateBaseSelect(
		key: 'boundary' | 'geometry' | 'maskPreset' | 'initialCondition',
		event: Event
	) {
		setup = { ...setup, [key]: (event.currentTarget as HTMLSelectElement).value } as BZSetup;
		markCustom();
	}

	function updateSeed(event: Event) {
		const seed = (event.currentTarget as HTMLInputElement).value.slice(0, 256);
		if (!seed) return;
		setup = { ...setup, seed } as BZSetup;
		markCustom('Seed changed; the deterministic initial condition was rebuilt.');
	}

	function updateParameter(key: string, event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		if (setup.model === 'oregonator' && ['epsilon', 'q', 'f'].includes(key)) {
			setup = { ...setup, parameters: { ...setup.parameters, [key]: value } } as BZSetup;
		} else if (setup.model === 'schnakenberg' && ['a', 'b', 'gamma'].includes(key)) {
			setup = { ...setup, parameters: { ...setup.parameters, [key]: value } } as BZSetup;
		}
		markCustom();
	}

	function newSeed() {
		const random = new Uint32Array(2);
		crypto.getRandomValues(random);
		setup = { ...setup, seed: `bz-${random[0].toString(36)}-${random[1].toString(36)}` } as BZSetup;
		markCustom('A new seed was drawn and the numerical field restarted.');
	}

	function handleFrame(next: BZStageFrame) {
		latestFrame = next;
		engine = next.engine;
		const reading = next.probe ?? (next.field ? readPoint(next.field, selected) : null);
		if (!reading) return;
		probeActive = reading.active;
		if (reading.active && reading.u !== null && reading.v !== null) {
			const last = probeHistory.at(-1);
			if (!last || last.step !== next.step) {
				probeHistory = [
					...probeHistory.slice(-359),
					{ step: next.step, time: next.modelTime, u: reading.u, v: reading.v }
				];
			}
		}
	}

	function readPoint(
		field: Readonly<BZFieldState>,
		point: readonly [number, number]
	): ProbeReading {
		const column = Math.min(field.size - 1, Math.floor(point[0] * field.size));
		const row = Math.min(field.size - 1, Math.floor(point[1] * field.size));
		const index = row * field.size + column;
		const active = Boolean(field.mask[index]);
		return {
			row,
			column,
			index,
			active,
			u: active ? field.u[index] : null,
			v: active ? field.v[index] : null
		};
	}

	function handleProbe(reading: ProbeReading, point: readonly [number, number]) {
		selected = point;
		probeActive = reading.active;
		panel = 'probe';
		if (reading.active && reading.u !== null && reading.v !== null && latestFrame) {
			const last = probeHistory.at(-1);
			if (!last || last.step !== latestFrame.step) {
				probeHistory = [
					...probeHistory.slice(-359),
					{ step: latestFrame.step, time: latestFrame.modelTime, u: reading.u, v: reading.v }
				];
			}
		}
	}

	function handleIntervention(event: Readonly<BZIntervention>) {
		if (event.kind === 'probe' || !v2PresetTitle) return;
		v2NumericallyModified = true;
		status =
			'Modified experiment — the mounted V2 preset validation no longer applies to this Laboratory trajectory.';
	}

	function handleStageStatus(message: string, nextEngine: BZEngineKind, failure: boolean) {
		engine = nextEngine;
		engineFailure = failure;
		if (failure) {
			running = false;
			status = message;
		}
	}

	function handleCommand(command: BZStageCommand) {
		if (command === 'toggle-running') running = !running;
		else if (command === 'reset') resetExperiment();
		else if (command === 'step') stage?.manualStep();
		else if (command === 'radius-down') brushRadius = Math.max(0.008, brushRadius - 0.008);
		else if (command === 'radius-up') brushRadius = Math.min(0.18, brushRadius + 0.008);
		else if (command === 'tool-probe') tool = 'probe';
		else if (command === 'tool-excite') tool = 'excite';
		else if (command === 'tool-inhibit') tool = 'inhibit';
		else if (command === 'tool-cut') tool = 'cut';
		else if (command === 'cancel') tool = 'probe';
	}

	function resetExperiment() {
		running = false;
		probeHistory = [];
		if (v2PresetTitle) v2NumericallyModified = false;
		stage?.reset();
		status = 'Same setup and same seed restored at model step zero.';
	}

	async function replayExperiment() {
		if (!stage || busy) return;
		const target = stage.stepIndex();
		const events = stage.interventions();
		running = false;
		busy = true;
		status = `Replaying ${target.toLocaleString()} fixed steps and ${events.length} logged interventions…`;
		await stage.replay(target, events);
		busy = false;
		status = `Replay completed at step ${target.toLocaleString()}. CPU Float64 replay is deterministic for this engine version.`;
	}

	async function undoLastIntervention() {
		if (!stage || busy) return;
		const target = stage.stepIndex();
		const events = [...stage.interventions()];
		let index = events.length - 1;
		while (index >= 0 && events[index].kind === 'probe') index -= 1;
		if (index < 0) {
			status = 'There is no state-changing intervention to undo.';
			return;
		}
		const [removed] = events.splice(index, 1);
		running = false;
		busy = true;
		probeHistory = [];
		status = `Removing the last ${removed.kind} intervention by deterministic replay to step ${target.toLocaleString()}…`;
		await stage.replay(target, events);
		busy = false;
		if (v2PresetTitle) v2NumericallyModified = true;
		status = `Undid the last ${removed.kind} intervention by replaying the same seed and remaining event log to step ${target.toLocaleString()}.`;
	}

	function stir() {
		stage?.stir(1);
		status =
			'Approximate homogenisation applied: active-area u and v means were preserved and variance collapsed at the instant of mixing, before the following fixed Heun step. No fluid flow was simulated.';
	}

	function selectTermsMode(next: typeof termsMode) {
		if (next === termsMode) return;
		termsMode = next;
		presetId = 'custom';
		v2InitialInterventions = [];
		v2PresetTitle = null;
		running = false;
		probeHistory = [];
		status = `Active terms changed to ${next === 'both' ? 'reaction plus diffusion' : `${next} only`}; the same seed restarted at step zero.`;
	}

	async function toggleFullscreen() {
		if (!laboratory) return;
		if (document.fullscreenElement === laboratory) await document.exitFullscreen();
		else await laboratory.requestFullscreen();
	}

	function experimentSetup(): BZSetup {
		return cloneSetup(latestFrame?.setup ?? setup);
	}

	function experimentStep(): number {
		return stage?.stepIndex() ?? latestFrame?.step ?? 0;
	}

	function experimentEvents(): readonly BZIntervention[] {
		return stage?.interventions() ?? latestFrame?.interventions ?? [];
	}

	function experimentRecord() {
		return createBZExperimentRecord({
			title: `${getPresetTitle()} — BZ Laboratory`,
			setup: experimentSetup(),
			step: experimentStep(),
			interventions: experimentEvents(),
			activeTerms,
			display: { view, palette },
			numericalWarnings: [
				...timestepAssessment.reasons,
				...(latestFrame && latestFrame.setup.gridSize !== setup.gridSize
					? [
							`CPU fallback reconstructed the requested ${setup.gridSize}² field at ${latestFrame.setup.gridSize}².`
						]
					: [])
			]
		});
	}

	function getPresetTitle(): string {
		return (
			BZ_PRESETS.find((preset) => preset.id === presetId)?.title ?? v2PresetTitle ?? 'Custom setup'
		);
	}

	function downloadText(text: string, filename: string, type: string) {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function exportJson() {
		downloadText(
			serializeBZExperiment(experimentRecord()),
			'bz-laboratory-experiment.json',
			'application/json'
		);
		status =
			'Versioned experiment JSON exported with setup, seed, grid, fixed step, display state and intervention log.';
	}

	function exportPng() {
		const snapshot = stage?.snapshot();
		if (!snapshot) return;
		const canvas = createBZExportCanvas(snapshot, experimentSetup(), {
			view,
			palette,
			width: 1200,
			height: 1200
		});
		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `bz-${view}-step-${experimentStep()}.png`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		}, 'image/png');
		status = 'PNG rendered from the current numerical fields using the declared display mapping.';
	}

	async function copyShareUrl() {
		const url = buildBZShareUrl(window.location.href, {
			setup: experimentSetup(),
			presetId,
			step: experimentStep(),
			interventions: experimentEvents(),
			activeTerms,
			display: { view, palette }
		});
		try {
			await navigator.clipboard.writeText(url);
			status =
				'Versioned share address copied. Large intervention logs may require experiment JSON for exact replay.';
		} catch {
			window.history.replaceState({}, '', url);
			status =
				'Clipboard access was unavailable; the versioned state was written into this page address.';
		}
	}

	function exportProbeCsv() {
		const rows = [
			'step,model_time,u,v',
			...probeHistory.map((sample) => `${sample.step},${sample.time},${sample.u},${sample.v}`)
		];
		downloadText(`${rows.join('\n')}\n`, 'bz-probe-history.csv', 'text/csv');
	}

	async function importJson(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file || busy) return;
		busy = true;
		try {
			const record = parseBZExperiment(await file.text());
			setup = cloneSetup(record.setup);
			v2InitialInterventions = [];
			v2PresetTitle = null;
			presetId = 'custom';
			termsMode = termsModeFor(record.activeTerms);
			view = record.display.view;
			palette = record.display.palette;
			running = false;
			probeHistory = [];
			await tick();
			await stage?.replay(record.step, record.interventions);
			status = `Experiment JSON restored at model step ${record.step.toLocaleString()}.`;
		} catch (error) {
			status = `Experiment import rejected: ${error instanceof Error ? error.message : 'invalid document'}`;
		} finally {
			busy = false;
			if (jsonInput) jsonInput.value = '';
		}
	}

	function format(value: number, digits = 4): string {
		if (!Number.isFinite(value)) return '—';
		return Math.abs(value) >= 1_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
			? value.toExponential(2)
			: value.toFixed(digits);
	}
</script>

<section
	class="laboratory article-breakout"
	class:is-fullscreen={isFullscreen}
	bind:this={laboratory}
	id="bz-laboratory"
	aria-labelledby="bz-laboratory-title"
	data-testid="bz-laboratory"
>
	<header class="masthead">
		<div>
			<p class="kicker">Live numerical exhibit · no chemical recipe</p>
			<h2 id="bz-laboratory-title">The clock that escaped into space</h2>
			<p class="dek">
				A fixed-step Oregonator dish with a separately validated Schnakenberg comparator. Every
				pattern below is evolved now from the declared seed.
			</p>
		</div>
		<div class="engine-badge" data-engine={engine} data-failure={engineFailure}>
			<span></span>
			<b
				>{engine === 'gpu-f32'
					? 'GPU 32-bit float'
					: engine === 'gpu-f16'
						? 'GPU 16-bit float'
						: 'CPU Float64 reference'}</b
			>
		</div>
	</header>

	<div class="setup-bar">
		<label class="preset-select">
			<span>Exhibit preset</span>
			<select
				value={presetId}
				onchange={(event) => loadPreset((event.currentTarget as HTMLSelectElement).value)}
				data-testid="bz-preset"
			>
				<optgroup label="Belousov–Zhabotinsky waves">
					{#each BZ_PRESETS.filter((preset) => preset.setup.model === 'oregonator') as preset (preset.id)}
						<option value={preset.id}>{preset.title}</option>
					{/each}
				</optgroup>
				<optgroup label="Schnakenberg Turing comparator">
					{#each BZ_PRESETS.filter((preset) => preset.setup.model === 'schnakenberg') as preset (preset.id)}
						<option value={preset.id}>{preset.title}</option>
					{/each}
				</optgroup>
				{#if presetId === 'custom'}
					<option value="custom"
						>{v2PresetTitle ? `V2 · ${v2PresetTitle}` : 'Custom raw setup'}</option
					>
				{/if}
			</select>
		</label>
		<fieldset class="segmented model-switch">
			<legend>Model</legend>
			<button
				type="button"
				class:active={setup.model === 'oregonator'}
				aria-pressed={setup.model === 'oregonator'}
				onclick={() => switchModel('oregonator')}>BZ waves</button
			>
			<button
				type="button"
				class:active={setup.model === 'schnakenberg'}
				aria-pressed={setup.model === 'schnakenberg'}
				onclick={() => switchModel('schnakenberg')}>Turing comparator</button
			>
		</fieldset>
		<label
			><span>View</span><select bind:value={view}
				>{#each VIEWS as option (option.id)}<option value={option.id}>{option.label}</option
					>{/each}</select
			></label
		>
		<label
			><span>Palette</span><select bind:value={palette}
				>{#each PALETTES as option (option.id)}<option value={option.id}>{option.label}</option
					>{/each}</select
			></label
		>
	</div>

	<div class="workspace">
		<div class="dish-column">
			<div class="stage-wrap">
				<BZDishStage
					bind:this={stage}
					{setup}
					{running}
					workPerSecond={SPEEDS[speed].work}
					{view}
					{palette}
					{tool}
					{brushRadius}
					{showSourceMarkers}
					{selected}
					{activeTerms}
					initialInterventions={v2InitialInterventions}
					onframe={handleFrame}
					onstatus={handleStageStatus}
					onprobe={handleProbe}
					onintervention={handleIntervention}
					onselect={(point) => (selected = point)}
					oncommand={handleCommand}
				/>
				<div class="hud" aria-hidden="true">
					<span>step {latestFrame?.step.toLocaleString() ?? '0'}</span>
					<span>t {format(latestFrame?.modelTime ?? 0, 3)}</span>
					<span>{latestFrame?.setup.gridSize ?? setup.gridSize}² cells</span>
				</div>
			</div>

			<div class="transport" aria-label="Simulation transport">
				<button
					type="button"
					class="primary"
					onclick={() => (running = !running)}
					disabled={busy || engineFailure || timestepAssessment.state === 'unsafe'}
					data-testid="bz-run"
				>
					{running ? 'Pause' : 'Run'}
				</button>
				<button
					type="button"
					onclick={() => stage?.manualStep()}
					disabled={running || busy || engineFailure || timestepAssessment.state === 'unsafe'}
					>Step</button
				>
				<button type="button" onclick={resetExperiment} disabled={busy}>Reset</button>
				<button type="button" onclick={replayExperiment} disabled={busy || experimentStep() === 0}
					>{busy ? 'Replaying…' : 'Replay'}</button
				>
				<button
					type="button"
					onclick={undoLastIntervention}
					disabled={busy || experimentEvents().every((event) => event.kind === 'probe')}
					>Undo last intervention</button
				>
				<button
					type="button"
					onclick={stir}
					disabled={busy || engineFailure || timestepAssessment.state === 'unsafe'}>Stir</button
				>
				<label class="speed"
					><span>Rate</span><select bind:value={speed}
						>{#each Object.entries(SPEEDS) as [id, option] (id)}<option value={id}
								>{option.label}</option
							>{/each}</select
					></label
				>
				<button type="button" class="fullscreen" onclick={toggleFullscreen}
					>{isFullscreen ? 'Exit full screen' : 'Full screen'}</button
				>
			</div>

			<fieldset class="tools">
				<legend>Dish instruments</legend>
				{#each TOOLS as option (option.id)}
					<button
						type="button"
						class:active={tool === option.id}
						aria-pressed={tool === option.id}
						title={option.hint}
						onclick={() => (tool = option.id)}
					>
						<span>{option.label}</span><kbd>{option.key}</kbd>
					</button>
				{/each}
				<label class="radius"
					><span>Radius {Math.round(brushRadius * 1000) / 10}%</span><input
						type="range"
						min="0.008"
						max="0.18"
						step="0.004"
						bind:value={brushRadius}
					/></label
				>
				<label class="marker-toggle">
					<input type="checkbox" bind:checked={showSourceMarkers} />
					<span>Show repeated-source markers</span>
				</label>
			</fieldset>
			{#if tool === 'cut'}
				<p class="tool-guidance" data-testid="bz-cut-guidance">
					<b>Cut front:</b> drag once across the bright front, then release. The pale guide follows your
					stroke while the numerical field remains paused or running in place.
				</p>
			{:else if tool === 'pacemaker'}
				<p class="tool-guidance">
					<b>Repeated source:</b> click once to schedule eight pulses, period 0.8 model-time units,
					radius {Math.round(brushRadius * 1000) / 10}%. Use <i>Excite · one pulse</i> for a single event.
				</p>
			{/if}
		</div>

		<aside class="instrument-panel">
			<div class="panel-tabs" role="tablist" aria-label="Laboratory notebook panels">
				{#each [['readout', 'Readout'], ['probe', 'Probe'], ['method', 'Method'], ['export', 'Save']] as [id, label] (id)}
					<button
						type="button"
						role="tab"
						aria-selected={panel === id}
						class:active={panel === id}
						onclick={() => (panel = id as Panel)}>{label}</button
					>
				{/each}
			</div>

			{#if panel === 'readout'}
				<section class="panel-content" aria-labelledby="bz-readout-title">
					<p class="panel-kicker">Live field audit</p>
					<h3 id="bz-readout-title">What the pixels are doing</h3>
					<dl class="metrics">
						<div>
							<dt>Model time</dt>
							<dd>{format(latestFrame?.modelTime ?? 0)}</dd>
						</div>
						<div>
							<dt>Fixed step</dt>
							<dd>{latestFrame?.step.toLocaleString() ?? '0'}</dd>
						</div>
						<div>
							<dt>mean u</dt>
							<dd>{format(currentMetrics.meanU)}</dd>
						</div>
						<div>
							<dt>mean v</dt>
							<dd>{format(currentMetrics.meanV)}</dd>
						</div>
						<div>
							<dt>var(u)</dt>
							<dd>{format(currentMetrics.varianceU)}</dd>
						</div>
						<div>
							<dt>excited area</dt>
							<dd>{format(100 * currentMetrics.excitedFraction, 2)}%</dd>
						</div>
						<div>
							<dt>Measured rate</dt>
							<dd>{format(latestFrame?.stepsPerSecond ?? 0, 0)} steps/s</dd>
						</div>
						<div>
							<dt>Boundary</dt>
							<dd>{setup.boundary}</dd>
						</div>
					</dl>
					<div class="assessment" data-state={timestepAssessment.state}>
						<b>{timestepAssessment.state} timestep assessment</b>
						<span>Δt / diffusion ceiling = {format(timestepAssessment.diffusionRatio, 3)}</span>
						{#each timestepAssessment.reasons as reason (reason)}<small>{reason}</small>{/each}
					</div>
					{#if turingReading}
						<div class="turing-chip">
							<b>{turingReading.classification.replaceAll('-', ' ')}</b>
							<span>max Re λ = {format(turingReading.maximumGrowth)}</span>
							<span
								>λ* = {turingReading.predictedWavelength
									? format(turingReading.predictedWavelength)
									: 'none'}</span
							>
						</div>
					{/if}
				</section>
			{:else if panel === 'probe'}
				<div class="embedded-probe">
					<BZProbePanel
						history={probeHistory}
						point={selected}
						active={probeActive}
						onclear={() => (probeHistory = [])}
						ondownload={exportProbeCsv}
					/>
				</div>
			{:else if panel === 'method'}
				<section class="panel-content method" aria-labelledby="bz-method-title">
					<p class="panel-kicker">Numerical ledger</p>
					<h3 id="bz-method-title">No hidden animation</h3>
					<ol>
						<li>Two dimensionless fields occupy a declared square grid inside a physical mask.</li>
						<li>A five-point Laplacian uses reflected neighbours at no-flux walls.</li>
						<li>Heun predictor and corrector passes advance one fixed Δt; no state is clamped.</li>
						<li>Pointer actions enter a seed-replayable, step-indexed intervention log.</li>
						<li>Colour mapping occurs after evolution and never feeds back into chemistry.</li>
					</ol>
					<fieldset class="term-switch">
						<legend>Active terms</legend>
						<label
							><input
								type="radio"
								name="bz-active-terms"
								checked={termsMode === 'both'}
								onchange={() => selectTermsMode('both')}
							/> Reaction + diffusion</label
						>
						<label
							><input
								type="radio"
								name="bz-active-terms"
								checked={termsMode === 'reaction'}
								onchange={() => selectTermsMode('reaction')}
							/> Reaction only</label
						>
						<label
							><input
								type="radio"
								name="bz-active-terms"
								checked={termsMode === 'diffusion'}
								onchange={() => selectTermsMode('diffusion')}
							/> Diffusion only</label
						>
					</fieldset>
					<p class="fine-print">
						Changing active terms restarts the field. “Stir” is explicit active-area homogenisation,
						not computational fluid dynamics.
					</p>
				</section>
			{:else}
				<section class="panel-content" aria-labelledby="bz-export-title">
					<p class="panel-kicker">Reproducibility</p>
					<h3 id="bz-export-title">Save the experiment, not just the spectacle</h3>
					<div class="export-grid">
						<button type="button" onclick={copyShareUrl}>Copy setup URL</button>
						<button type="button" onclick={exportJson}>Experiment JSON</button>
						<button type="button" onclick={exportPng}>Field PNG</button>
						<button type="button" onclick={() => jsonInput?.click()}>Open JSON</button>
					</div>
					<input
						bind:this={jsonInput}
						class="sr-only"
						type="file"
						accept="application/json,.json"
						onchange={importJson}
					/>
					<p class="fine-print">
						URLs are readable and bounded. Exact long intervention histories belong in versioned
						JSON. GPU floating-point results can differ slightly across vendors; CPU Float64 replay
						is the reference.
					</p>
				</section>
			{/if}
		</aside>
	</div>

	<details class="raw-controls">
		<summary
			><span>Raw model controls</span><small>Parameters, grid, boundary, geometry, seed</small
			></summary
		>
		<div class="raw-grid">
			{#if setup.model === 'oregonator'}
				<label
					><span>ε</span><input
						type="number"
						min="0.00001"
						max="10"
						step="0.001"
						value={setup.parameters.epsilon}
						onchange={(event) => updateParameter('epsilon', event)}
					/></label
				>
				<label
					><span>q</span><input
						type="number"
						min="0.00000001"
						max="1"
						step="0.0001"
						value={setup.parameters.q}
						onchange={(event) => updateParameter('q', event)}
					/></label
				>
				<label
					><span>f</span><input
						type="number"
						min="0"
						max="20"
						step="0.05"
						value={setup.parameters.f}
						onchange={(event) => updateParameter('f', event)}
					/></label
				>
			{:else}
				<label
					><span>a</span><input
						type="number"
						min="0"
						max="10"
						step="0.01"
						value={setup.parameters.a}
						onchange={(event) => updateParameter('a', event)}
					/></label
				>
				<label
					><span>b</span><input
						type="number"
						min="0"
						max="10"
						step="0.01"
						value={setup.parameters.b}
						onchange={(event) => updateParameter('b', event)}
					/></label
				>
				<label
					><span>γ</span><input
						type="number"
						min="0.000001"
						max="1000"
						step="0.1"
						value={setup.parameters.gamma}
						onchange={(event) => updateParameter('gamma', event)}
					/></label
				>
			{/if}
			<label
				><span>Dᵤ</span><input
					type="number"
					min="0"
					max="10"
					step="0.01"
					value={setup.diffusionU}
					onchange={(event) => updateCommonNumber('diffusionU', event)}
				/></label
			>
			<label
				><span>Dᵥ</span><input
					type="number"
					min="0"
					max="10"
					step="0.01"
					value={setup.diffusionV}
					onchange={(event) => updateCommonNumber('diffusionV', event)}
				/></label
			>
			<label
				><span>Δt</span><input
					type="number"
					min="0.00000001"
					max="10"
					step="0.0001"
					value={setup.timestep}
					onchange={(event) => updateCommonNumber('timestep', event)}
				/></label
			>
			<label
				><span>Grid</span><select value={setup.gridSize} onchange={updateGrid}
					><option value="64">64²</option><option value="128">128²</option><option value="256"
						>256²</option
					></select
				></label
			>
			<label
				><span>Domain L</span><input
					type="number"
					min="0.001"
					max="10000"
					step="0.5"
					value={setup.domainSize}
					onchange={(event) => updateCommonNumber('domainSize', event)}
				/></label
			>
			<label
				><span>Dish radius</span><input
					type="number"
					min="0.001"
					max="10000"
					step="0.1"
					value={setup.activeRadius}
					onchange={(event) => updateCommonNumber('activeRadius', event)}
				/></label
			>
			<label
				><span>Boundary</span><select
					value={setup.boundary}
					onchange={(event) => updateBaseSelect('boundary', event)}
					><option value="no-flux">No flux</option><option value="periodic">Periodic</option
					></select
				></label
			>
			<label
				><span>Geometry</span><select
					value={setup.geometry}
					onchange={(event) => updateBaseSelect('geometry', event)}
					><option value="circular-dish">Circular dish</option><option value="square">Square</option
					></select
				></label
			>
			<label
				><span>Obstacle preset</span><select
					value={setup.maskPreset}
					onchange={(event) => updateBaseSelect('maskPreset', event)}
					><option value="none">None</option><option value="central-obstacle"
						>Central obstacle</option
					><option value="seeded-obstacles">Seeded obstacles</option></select
				></label
			>
			<label
				><span>Initial state</span><select
					value={setup.initialCondition}
					onchange={(event) => updateBaseSelect('initialCondition', event)}
					><option value="uniform-equilibrium">Uniform equilibrium</option><option
						value="uniform-clock">Uniform clock</option
					><option value="target-wave">Target wave</option><option value="broken-front"
						>Broken front</option
					><option value="paired-fronts">Paired fronts</option><option value="heterogeneity"
						>Heterogeneity</option
					><option value="pacemaker">Pacemaker</option><option value="turing-noise"
						>Turing noise</option
					></select
				></label
			>
			<label class="seed"
				><span>Seed</span><input
					type="text"
					value={setup.seed}
					maxlength="256"
					onchange={updateSeed}
				/></label
			>
			<button type="button" class="new-seed" onclick={newSeed}>New seed</button>
		</div>
	</details>

	<div class="preset-note">
		<b>{getPresetTitle()}</b>
		{#if presetId !== 'custom'}
			<span>{getBZPreset(presetId).expectedQualitativeBehaviour}</span>
			<small>{getBZPreset(presetId).caveat}</small>
			<!-- Static publication artifact, not a SvelteKit route. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/data/bz-preset-calibration.json">Open the exact finite-time calibration record →</a>
		{:else if v2PresetTitle}
			<span>
				Exact V2 manifest genesis setup with {v2InitialInterventions.length} declared intervention{v2InitialInterventions.length ===
				1
					? ''
					: 's'}. Changes in this Laboratory do not reset the mounted mature Gallery session.
			</span>
			{#if v2NumericallyModified}
				<strong class="claim-state invalidated"
					>Modified experiment — preset validation no longer applies</strong
				>
			{:else if view !== 'dish' || palette !== 'ferroin'}
				<strong class="claim-state appearance"
					>Custom appearance — numerical validation unchanged</strong
				>
			{/if}
			<!-- Static publication artifact, not a SvelteKit route. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/data/bz-v2-calibration.json">Open the V2 calibration and provenance record →</a>
		{:else}
			<span
				>Custom values have no preset morphology claim. Use the numerical and dispersion
				diagnostics.</span
			>
		{/if}
	</div>

	{#if urlIssues.length > 0}
		<div class="url-issues" role="note">
			<b>Shared-state disclosures</b>
			<ul>
				{#each urlIssues as issue (issue)}<li>{issue}</li>{/each}
			</ul>
		</div>
	{/if}
	<p class="status" aria-live="polite" data-testid="bz-status">{status}</p>
	<p class="safety">
		This is a dimensionless numerical model, not a reagent reconstruction. The page intentionally
		provides no quantities, concentrations, mixing order, or home-laboratory procedure.
	</p>
</section>

<style>
	.laboratory {
		--lab-paper: #efe9dc;
		--lab-ink: #202826;
		--lab-wine: #8e4b55;
		--lab-cyan: #267f93;
		position: relative;
		width: min(82rem, calc(100vw - 2rem));
		margin-block: 2rem 3rem;
		transform: translateX(-50%);
		border: 1px solid #35413f;
		border-radius: clamp(1rem, 2.5vw, 1.6rem);
		background: #151c1e;
		color: #edf0e8;
		box-shadow: 0 2rem 5rem rgb(7 11 12 / 0.26);
		overflow: clip;
	}
	.laboratory.is-fullscreen {
		width: 100vw;
		height: 100vh;
		overflow: auto;
		border-radius: 0;
		padding-bottom: 2rem;
	}
	.masthead {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1.5rem;
		padding: clamp(1.1rem, 3vw, 2rem);
		border-bottom: 1px solid rgb(255 255 255 / 0.1);
		background: radial-gradient(circle at 82% 0%, rgb(142 75 85 / 0.28), transparent 38%);
	}
	.kicker,
	.panel-kicker {
		margin: 0 0 0.35rem;
		color: #e1a78b;
		font:
			700 0.68rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		max-width: 19ch;
		font-family: var(--font-serif, 'Source Serif 4', serif);
		font-size: clamp(1.65rem, 4vw, 3.15rem);
		line-height: 0.98;
		letter-spacing: -0.035em;
	}
	.dek {
		max-width: 62ch;
		margin: 0.75rem 0 0;
		color: rgb(237 240 232 / 0.72);
		font-size: clamp(0.82rem, 1.6vw, 0.96rem);
		line-height: 1.55;
	}
	.engine-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 0 0 auto;
		border: 1px solid rgb(255 255 255 / 0.16);
		border-radius: 999px;
		padding: 0.45rem 0.7rem;
		color: rgb(237 240 232 / 0.75);
		font:
			0.66rem/1.2 ui-monospace,
			monospace;
	}
	.engine-badge span {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #61b69d;
		box-shadow: 0 0 0 3px rgb(97 182 157 / 0.18);
	}
	.engine-badge[data-failure='true'] span {
		background: #e45468;
	}
	.setup-bar {
		display: grid;
		grid-template-columns: minmax(13rem, 1.7fr) minmax(14rem, 1fr) repeat(2, minmax(8rem, 0.7fr));
		gap: 0.75rem;
		align-items: end;
		padding: 0.9rem clamp(1rem, 3vw, 2rem);
		background: #101719;
		border-bottom: 1px solid rgb(255 255 255 / 0.09);
	}
	label {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	label > span,
	legend {
		color: rgb(237 240 232 / 0.62);
		font:
			700 0.63rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	select,
	input {
		width: 100%;
		min-height: 2.25rem;
		border: 1px solid rgb(255 255 255 / 0.19);
		border-radius: 0.45rem;
		background: #222b2c;
		color: #f5f2e9;
		padding: 0.38rem 0.55rem;
		font: inherit;
		font-size: 0.78rem;
	}
	select:focus-visible,
	input:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #ffce63;
		outline-offset: 2px;
	}
	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.segmented legend {
		grid-column: 1 / -1;
		margin-bottom: 0.3rem;
	}
	button {
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.5rem;
		background: #222b2c;
		color: inherit;
		min-height: 2.25rem;
		padding: 0.45rem 0.68rem;
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: rgb(255 255 255 / 0.48);
		background: #2a3536;
	}
	button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	button.active,
	button.primary {
		border-color: #e1a78b;
		background: #8e4b55;
		color: #fff8e8;
	}
	.model-switch button:first-of-type {
		border-radius: 0.45rem 0 0 0.45rem;
	}
	.model-switch button:last-of-type {
		border-left: 0;
		border-radius: 0 0.45rem 0.45rem 0;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(19rem, 0.78fr);
		gap: clamp(1rem, 3vw, 2rem);
		padding: clamp(1rem, 3vw, 2rem);
	}
	.dish-column {
		min-width: 0;
	}
	.stage-wrap {
		position: relative;
		width: min(100%, 48rem);
		margin-inline: auto;
	}
	.hud {
		position: absolute;
		z-index: 7;
		top: 0.8rem;
		left: 50%;
		display: flex;
		gap: 0.55rem;
		transform: translateX(-50%);
		pointer-events: none;
	}
	.hud span {
		border: 1px solid rgb(255 255 255 / 0.15);
		border-radius: 999px;
		background: rgb(7 10 12 / 0.67);
		color: rgb(255 246 215 / 0.78);
		padding: 0.28rem 0.5rem;
		backdrop-filter: blur(7px);
		font:
			0.6rem/1 ui-monospace,
			monospace;
		white-space: nowrap;
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: end;
		margin-top: 0.9rem;
	}
	.transport .speed {
		width: 7.2rem;
		margin-left: auto;
	}
	.transport .fullscreen {
		white-space: nowrap;
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.4rem;
		margin: 1rem 0 0;
		padding: 0.8rem;
		border: 1px solid rgb(255 255 255 / 0.12);
		border-radius: 0.8rem;
	}
	.tools legend {
		padding-inline: 0.3rem;
	}
	.tools button {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.35rem;
		padding-inline: 0.55rem;
	}
	kbd {
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.25rem;
		padding: 0.1rem 0.25rem;
		color: rgb(255 255 255 / 0.55);
		font:
			0.58rem ui-monospace,
			monospace;
	}
	.radius {
		grid-column: span 4;
		grid-template-columns: 8rem 1fr;
		align-items: center;
		margin-top: 0.2rem;
	}
	.radius input {
		min-height: 1rem;
		padding: 0;
		accent-color: #e1a78b;
	}
	.marker-toggle {
		grid-column: span 4;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgb(237 240 232 / 0.68);
		font-size: 0.7rem;
	}
	.marker-toggle input {
		width: auto;
		min-height: auto;
		accent-color: #e1a78b;
	}
	.tool-guidance {
		margin: 0.55rem 0 0;
		border-left: 3px solid #e1a78b;
		background: rgb(225 167 139 / 0.07);
		color: rgb(237 240 232 / 0.72);
		padding: 0.55rem 0.7rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.instrument-panel {
		align-self: start;
		min-width: 0;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.12);
		border-radius: 0.9rem;
		background: #101719;
	}
	.panel-tabs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-bottom: 1px solid rgb(255 255 255 / 0.1);
	}
	.panel-tabs button {
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0.62rem 0.25rem;
		color: rgb(237 240 232 / 0.58);
	}
	.panel-tabs button.active {
		box-shadow: inset 0 -2px #e1a78b;
		color: #fff8e8;
	}
	.panel-content {
		padding: 1rem;
	}
	.panel-content h3 {
		margin: 0 0 0.85rem;
		font-family: var(--font-serif, serif);
		font-size: 1.35rem;
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		margin: 0;
		background: rgb(255 255 255 / 0.1);
	}
	.metrics div {
		min-width: 0;
		background: #101719;
		padding: 0.6rem;
	}
	.metrics dt {
		color: rgb(237 240 232 / 0.52);
		font:
			0.61rem ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	.metrics dd {
		margin: 0.18rem 0 0;
		overflow-wrap: anywhere;
		font:
			0.74rem ui-monospace,
			monospace;
	}
	.assessment,
	.turing-chip {
		display: grid;
		gap: 0.28rem;
		margin-top: 0.8rem;
		border-left: 3px solid #61b69d;
		background: rgb(255 255 255 / 0.04);
		padding: 0.7rem;
		font:
			0.68rem/1.4 ui-monospace,
			monospace;
	}
	.assessment[data-state='caution'] {
		border-color: #ffce63;
	}
	.assessment[data-state='unsafe'] {
		border-color: #e45468;
	}
	.assessment small,
	.preset-note small {
		color: rgb(237 240 232 / 0.58);
	}
	.turing-chip {
		border-color: #5eb1c5;
	}
	.embedded-probe {
		padding: 0.65rem;
		color: var(--lab-ink);
	}
	.method ol {
		padding-left: 1.2rem;
		color: rgb(237 240 232 / 0.75);
		font-size: 0.78rem;
		line-height: 1.55;
	}
	.term-switch {
		display: grid;
		gap: 0.45rem;
		margin: 1rem 0 0;
		border: 1px solid rgb(255 255 255 / 0.13);
		border-radius: 0.6rem;
		padding: 0.75rem;
	}
	.term-switch label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.term-switch input {
		width: auto;
		min-height: auto;
		accent-color: #e1a78b;
	}
	.fine-print {
		color: rgb(237 240 232 / 0.58);
		font-size: 0.72rem;
		line-height: 1.55;
	}
	.export-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.raw-controls {
		margin: 0 clamp(1rem, 3vw, 2rem) 1rem;
		border: 1px solid rgb(255 255 255 / 0.12);
		border-radius: 0.8rem;
		background: #101719;
	}
	.raw-controls summary {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		cursor: pointer;
		padding: 0.85rem 1rem;
		font-weight: 700;
	}
	.raw-controls summary small {
		color: rgb(237 240 232 / 0.55);
		font:
			0.65rem ui-monospace,
			monospace;
	}
	.raw-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.65rem;
		border-top: 1px solid rgb(255 255 255 / 0.1);
		padding: 1rem;
	}
	.raw-grid .seed {
		grid-column: span 3;
	}
	.new-seed {
		align-self: end;
	}
	.preset-note,
	.url-issues,
	.status,
	.safety {
		margin-inline: clamp(1rem, 3vw, 2rem);
	}
	.preset-note {
		display: grid;
		gap: 0.3rem;
		border-left: 3px solid #e1a78b;
		background: rgb(225 167 139 / 0.07);
		padding: 0.75rem 0.9rem;
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.preset-note a {
		color: #80c9d7;
		font-size: 0.69rem;
		text-underline-offset: 0.18em;
	}
	.claim-state {
		justify-self: start;
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 0.2rem 0.45rem;
		font:
			0.62rem/1.2 ui-monospace,
			monospace;
	}
	.claim-state.invalidated {
		color: #ff9caa;
	}
	.claim-state.appearance {
		color: #9adce6;
	}
	.url-issues {
		margin-top: 0.8rem;
		border: 1px solid #ffce63;
		border-radius: 0.6rem;
		padding: 0.7rem;
		color: #ffdf93;
		font-size: 0.74rem;
	}
	.url-issues ul {
		margin: 0.35rem 0 0;
		padding-left: 1.2rem;
	}
	.status {
		min-height: 1.4rem;
		margin-top: 0.9rem;
		margin-bottom: 0;
		color: #d5dcd5;
		font:
			0.7rem/1.5 ui-monospace,
			monospace;
	}
	.safety {
		margin-top: 0.6rem;
		margin-bottom: 1.4rem;
		color: rgb(237 240 232 / 0.52);
		font-size: 0.67rem;
		line-height: 1.45;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 1000px) {
		.setup-bar {
			grid-template-columns: 1.4fr 1fr 1fr;
		}
		.preset-select {
			grid-column: span 2;
		}
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.instrument-panel {
			width: 100%;
		}
		.raw-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 680px) {
		.laboratory {
			width: calc(100vw - 1rem);
		}
		.masthead {
			display: grid;
		}
		.engine-badge {
			justify-self: start;
		}
		.setup-bar {
			grid-template-columns: 1fr 1fr;
		}
		.preset-select,
		.model-switch {
			grid-column: 1 / -1;
		}
		.workspace {
			padding-inline: 0.65rem;
		}
		.transport .speed {
			margin-left: 0;
		}
		.transport .fullscreen {
			display: none;
		}
		.tools {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.radius {
			grid-column: span 2;
		}
		.raw-grid {
			grid-template-columns: 1fr 1fr;
		}
		.raw-grid .seed {
			grid-column: 1 / -1;
		}
		.raw-controls summary small {
			display: none;
		}
		.hud span:nth-child(3) {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
</style>
