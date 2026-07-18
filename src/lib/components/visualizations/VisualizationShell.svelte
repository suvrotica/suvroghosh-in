<script lang="ts">
	import { onMount } from 'svelte';
	import P5Sketch from './P5Sketch.svelte';
	import SourceExplorer from './SourceExplorer.svelte';
	import VisualizationControls from './VisualizationControls.svelte';
	import WebGLFallback from './WebGLFallback.svelte';
	import { loadVisualization, visualizationSummary } from '$lib/visualizations/registry';
	import {
		coerceParameterValue,
		defaultParameters,
		type VisualizationDefinition,
		type VisualizationParameters,
		type VisualizationValue
	} from '$lib/visualizations/types';

	type Props = {
		sketch: string;
		title?: string;
		controls?: boolean;
		source?: boolean;
		caption?: string;
	};

	let { sketch, title, controls = true, source = true, caption }: Props = $props();
	const uid = $props.id();
	let summary = $derived(visualizationSummary(sketch));
	let shell: HTMLElement;
	let loadTarget: HTMLDivElement;
	let definition = $state<VisualizationDefinition | null>(null);
	let parameters = $state<VisualizationParameters>({});
	let status = $state<'idle' | 'loading' | 'ready' | 'fallback' | 'error'>('idle');
	let statusMessage = $state('Interactive shader not loaded yet.');
	let playing = $state(true);
	let reducedMotion = $state(false);
	let restartToken = $state(0);
	let isFullscreen = $state(false);
	let loadingPromise: Promise<void> | null = null;
	let displayTitle = $derived(
		title ?? definition?.title ?? summary?.title ?? 'Interactive visualization'
	);
	let poster = $derived(definition?.poster ?? summary?.poster ?? '');
	let posterAlt = $derived(definition?.posterAlt ?? summary?.posterAlt ?? 'Visualization preview');

	function beginLoading() {
		if (loadingPromise || definition) return;
		status = 'loading';
		statusMessage = 'Loading the interactive shader…';
		loadingPromise = loadVisualization(sketch)
			.then((loaded) => {
				definition = loaded;
				parameters = defaultParameters(loaded);
			})
			.catch((error) => {
				status = 'error';
				statusMessage =
					error instanceof Error ? error.message : 'The visualization could not be loaded.';
			})
			.finally(() => {
				loadingPromise = null;
			});
	}

	function handleSketchStatus(
		nextStatus: 'loading' | 'ready' | 'webgl-unavailable' | 'error',
		message?: string
	) {
		if (nextStatus === 'ready') {
			status = 'ready';
			statusMessage = playing ? 'Interactive shader running.' : 'Interactive shader paused.';
		} else if (nextStatus === 'webgl-unavailable') {
			status = 'fallback';
			statusMessage = 'WebGL is unavailable. Showing the static fallback.';
		} else if (nextStatus === 'error') {
			status = 'error';
			statusMessage = message ?? 'The shader could not start.';
		} else {
			status = 'loading';
			statusMessage = 'Preparing p5 and the GPU shader…';
		}
	}

	function changeParameter(id: string, value: VisualizationValue) {
		if (!definition) return;
		const parameter = definition.parameters.find((candidate) => candidate.id === id);
		if (!parameter) return;
		parameters = { ...parameters, [id]: coerceParameterValue(parameter, value) };
	}

	function applyPreset(id: string) {
		const preset = definition?.presets.find((candidate) => candidate.id === id);
		if (!preset) return;
		parameters = { ...preset.values };
		restartToken += 1;
	}

	function togglePlayback() {
		playing = !playing;
		statusMessage = playing ? 'Interactive shader running.' : 'Interactive shader paused.';
	}

	function restart() {
		restartToken += 1;
		playing = true;
		statusMessage = 'Interactive shader restarted.';
	}

	function reset() {
		if (!definition) return;
		parameters = defaultParameters(definition);
		restartToken += 1;
		statusMessage = 'Parameters and time reset.';
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === shell) await document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			statusMessage = 'Fullscreen is not available in this browser.';
		}
	}

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motionQuery.matches;
			if (reducedMotion) playing = false;
		};
		const updateFullscreen = () => (isFullscreen = document.fullscreenElement === shell);
		updateMotion();

		const observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) {
								beginLoading();
								observer?.disconnect();
							}
						},
						{ rootMargin: '320px 0px' }
					);

		if (observer) observer.observe(loadTarget);
		else beginLoading();
		motionQuery.addEventListener('change', updateMotion);
		document.addEventListener('fullscreenchange', updateFullscreen);

		return () => {
			observer?.disconnect();
			motionQuery.removeEventListener('change', updateMotion);
			document.removeEventListener('fullscreenchange', updateFullscreen);
		};
	});
</script>

<figure
	bind:this={shell}
	class="visualization-shell not-prose my-10 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl shadow-neutral-950/20"
	aria-labelledby={`${uid}-title`}
>
	<header
		class="flex flex-col gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5"
	>
		<div>
			<p
				class="!mb-1 !text-left text-[0.68rem] font-bold tracking-[0.18em] !text-cyan-300 uppercase"
			>
				Live experiment
			</p>
			<h2 id={`${uid}-title`} class="!m-0 !text-xl !leading-tight !font-bold !text-white">
				{displayTitle}
			</h2>
		</div>
		<p id={`${uid}-status`} class="!m-0 !text-left text-xs !text-neutral-400" aria-live="polite">
			{statusMessage}
		</p>
	</header>

	<div
		bind:this={loadTarget}
		class="visualization-canvas-frame relative aspect-video min-h-56 bg-neutral-950 sm:min-h-80"
	>
		{#if poster}
			<img src={poster} alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy" />
		{/if}

		{#if definition && status !== 'fallback' && status !== 'error'}
			<div class="absolute inset-0">
				<P5Sketch
					{definition}
					{parameters}
					paused={!playing}
					{restartToken}
					onstatus={handleSketchStatus}
					ontoggle={togglePlayback}
				/>
			</div>
		{/if}

		{#if status === 'idle' || status === 'loading'}
			<div
				class="absolute inset-0 grid place-items-center bg-neutral-950/45 p-4 backdrop-blur-[2px]"
			>
				<button
					type="button"
					onclick={beginLoading}
					disabled={status === 'loading'}
					class="min-h-11 rounded-full border border-white/40 bg-neutral-950/80 px-5 py-2 text-sm font-bold text-white shadow-lg hover:bg-neutral-900 disabled:cursor-wait disabled:opacity-80"
				>
					{status === 'loading' ? 'Loading shader…' : 'Load interactive shader'}
				</button>
			</div>
		{:else if status === 'fallback' || status === 'error'}
			<div class="absolute inset-0">
				<WebGLFallback
					{poster}
					{posterAlt}
					title={status === 'fallback' ? 'WebGL unavailable' : 'Shader could not start'}
					message={statusMessage}
				/>
			</div>
		{/if}

		<noscript>
			<p
				class="absolute inset-x-0 bottom-0 !m-0 bg-neutral-950/90 p-4 !text-left text-sm !text-neutral-100"
			>
				JavaScript is disabled, so this is the static version of the experiment.
			</p>
		</noscript>
	</div>

	{#if definition && controls}
		<VisualizationControls
			{definition}
			{parameters}
			{playing}
			{isFullscreen}
			controlPrefix={`${uid}-control`}
			{reducedMotion}
			onchange={changeParameter}
			onpreset={applyPreset}
			onplaytoggle={togglePlayback}
			onreset={reset}
			onrestart={restart}
			onfullscreen={toggleFullscreen}
		/>
	{/if}

	{#if definition && source}
		<SourceExplorer files={definition.sourceFiles} />
	{/if}

	{#if caption}
		<figcaption
			class="border-t border-neutral-800 bg-neutral-950 px-4 py-3 text-sm leading-relaxed text-neutral-400 sm:px-5"
		>
			{caption}
		</figcaption>
	{/if}
</figure>

<style>
	.visualization-shell:fullscreen {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100vh;
		border: 0;
		border-radius: 0;
		background: #0a0a0a;
	}

	.visualization-shell:fullscreen .visualization-canvas-frame {
		flex: 1;
		min-height: 40vh;
		aspect-ratio: auto;
	}
</style>
