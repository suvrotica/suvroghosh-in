<script lang="ts">
	import { onMount } from 'svelte';
	import ShaderCanvas from './ShaderCanvas.svelte';
	import WebGLFallback from './WebGLFallback.svelte';
	import { loadVisualization, visualizationSummary } from '$lib/visualizations/registry';
	import type { VisualizationDefinition } from '$lib/visualizations/types';

	type Props = {
		sketch: string;
		title?: string;
	};

	let { sketch, title = 'Build the shader, one idea at a time' }: Props = $props();
	const uid = $props.id();
	let summary = $derived(visualizationSummary(sketch));
	let host: HTMLElement;
	let definition = $state<VisualizationDefinition | null>(null);
	let selectedStageId = $state('');
	let errorMessage = $state('');
	let copied = $state(false);
	let activeStage = $derived(
		definition?.stages.find((stage) => stage.id === selectedStageId) ?? definition?.stages[0]
	);

	async function load() {
		if (definition || errorMessage) return;
		try {
			definition = await loadVisualization(sketch);
			selectedStageId = definition.stages[0]?.id ?? '';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'The walkthrough could not be loaded.';
		}
	}

	async function copyStage() {
		if (!activeStage) return;
		try {
			await navigator.clipboard.writeText(activeStage.code);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	onMount(() => {
		const observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) {
								void load();
								observer?.disconnect();
							}
						},
						{ rootMargin: '240px 0px' }
					);
		if (observer) observer.observe(host);
		else void load();
		return () => observer?.disconnect();
	});
</script>

<section
	bind:this={host}
	class="not-prose my-10 overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900"
	aria-labelledby={`${uid}-heading`}
>
	<header class="border-b border-neutral-300 p-5 dark:border-neutral-700">
		<p
			class="!mb-1 !text-left text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Incremental code walkthrough
		</p>
		<h2
			id={`${uid}-heading`}
			class="!m-0 !text-2xl !leading-tight text-neutral-950 dark:text-white"
		>
			{title}
		</h2>
	</header>

	{#if definition && activeStage}
		<div class="border-b border-neutral-300 p-3 dark:border-neutral-700">
			<div class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Shader stages">
				{#each definition.stages as stage (stage.id)}
					<button
						type="button"
						role="tab"
						aria-selected={stage.id === activeStage.id}
						aria-controls={`${uid}-stage`}
						onclick={() => (selectedStageId = stage.id)}
						class="min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-bold {stage.id ===
						activeStage.id
							? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
							: 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300'}"
					>
						{stage.label}
					</button>
				{/each}
			</div>
		</div>

		<div id={`${uid}-stage`} role="tabpanel" class="grid lg:grid-cols-[1.05fr_0.95fr]">
			<div
				class="min-w-0 border-b border-neutral-300 lg:border-r lg:border-b-0 dark:border-neutral-700"
			>
				{#key activeStage.id}
					<ShaderCanvas
						fragmentSource={activeStage.previewFragmentSource}
						title={activeStage.title}
						onerror={(message) => (errorMessage = message)}
					/>
				{/key}
				<div class="p-5">
					<p
						class="!mb-1 !text-left text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						Stage {activeStage.label}
					</p>
					<h3 class="!mt-0 !mb-3 !text-xl text-neutral-950 dark:text-white">{activeStage.title}</h3>
					<p
						class="!mb-3 !text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
					>
						{activeStage.explanation}
					</p>
					<p
						class="!m-0 border-l-2 border-cyan-600 pl-3 !text-left text-sm font-semibold text-neutral-700 dark:border-cyan-300 dark:text-neutral-200"
					>
						{activeStage.callout}
					</p>
				</div>
			</div>

			<div class="min-w-0 bg-neutral-950 text-neutral-100">
				<div
					class="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2"
				>
					<span class="font-mono text-xs text-neutral-400">{activeStage.filename}</span>
					<button
						type="button"
						onclick={copyStage}
						class="min-h-9 rounded-md border border-neutral-700 px-3 py-1 text-xs font-bold hover:border-neutral-500 hover:bg-neutral-900"
					>
						{copied ? 'Copied' : 'Copy code'}
					</button>
				</div>
				<div class="max-h-[36rem] overflow-auto">
					<pre class="!m-0 !bg-transparent !p-5 text-sm leading-relaxed !text-neutral-100"><code
							>{activeStage.code}</code
						></pre>
				</div>
			</div>
		</div>
	{:else if errorMessage && summary}
		<WebGLFallback
			poster={summary.poster}
			posterAlt={summary.posterAlt}
			title="Walkthrough unavailable"
			message={errorMessage}
		/>
	{:else}
		<div class="grid min-h-64 place-items-center p-6 text-center">
			<div>
				<p class="!mb-3 !text-center text-sm text-neutral-600 dark:text-neutral-400">
					The code stages load only when this part of the article approaches the viewport.
				</p>
				<button
					type="button"
					onclick={load}
					class="min-h-11 rounded-md bg-neutral-900 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-neutral-950"
				>
					Load walkthrough
				</button>
			</div>
		</div>
	{/if}
</section>
