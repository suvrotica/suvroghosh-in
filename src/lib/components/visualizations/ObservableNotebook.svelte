<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Module, Observer, Runtime } from '@observablehq/runtime';
	import type { ObservableNotebookDefinition } from '$lib/visualizations/observable';

	type Props = {
		notebook: ObservableNotebookDefinition;
		cells?: readonly string[];
		title?: string;
		description?: string;
		caption?: string;
		compact?: boolean;
	};

	let { notebook, cells = [], title, description, caption, compact = false }: Props = $props();
	const uid = $props.id();
	const outputHosts = new SvelteMap<string, HTMLDivElement>();
	let shell: HTMLElement;
	let loadTarget: HTMLDivElement;
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let statusMessage = $state('Notebook cells are ready to load.');
	let cellStates = $state<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({});
	let cellErrors = $state<Record<string, string>>({});
	let loadingPromise: Promise<void> | null = null;
	let runtime: Runtime | null = null;
	let runtimeModule: Module | null = null;
	let destroyed = false;
	let forcedReducedMotion = false;
	let motionQuery: MediaQueryList | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let selectedCells = $derived.by(() => {
		const requested = new Set(cells);
		return cells.length === 0
			? notebook.cells
			: notebook.cells.filter((cell) => requested.has(cell.name));
	});
	let displayTitle = $derived(title ?? notebook.title);
	let displayDescription = $derived(description ?? notebook.description);

	function reducedMotionRequested() {
		return forcedReducedMotion || (motionQuery?.matches ?? false);
	}

	function outputHost(node: HTMLDivElement, name: string) {
		outputHosts.set(name, node);
		return {
			destroy() {
				outputHosts.delete(name);
			}
		};
	}

	function errorText(error: unknown) {
		return error instanceof Error ? error.message : 'This notebook cell could not be evaluated.';
	}

	function renderValue(host: HTMLDivElement, value: unknown) {
		host.replaceChildren();
		if (value instanceof Node) {
			host.append(value);
			return;
		}

		const output = document.createElement('pre');
		output.className = 'observable-value';
		output.textContent =
			typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
		host.append(output);
	}

	function observerFor(
		name: string,
		selectedNames: Set<string>,
		fulfilledCells: Set<string>
	): Observer | null {
		if (!selectedNames.has(name)) return null;

		return {
			pending() {
				cellStates[name] = 'loading';
			},
			fulfilled(value) {
				const host = outputHosts.get(name);
				if (!host || destroyed) return;
				renderValue(host, value);
				cellStates[name] = 'ready';
				delete cellErrors[name];
				fulfilledCells.add(name);
				if (fulfilledCells.size === selectedNames.size) {
					status = 'ready';
					statusMessage = 'Observable cells are live and reactive.';
				}
			},
			rejected(error) {
				const message = errorText(error);
				cellStates[name] = 'error';
				cellErrors[name] = message;
				status = 'error';
				statusMessage = `The ${name} cell could not be evaluated.`;
			}
		};
	}

	async function loadNotebook() {
		if (loadingPromise || runtime || destroyed) return;
		if (selectedCells.length === 0) {
			status = 'error';
			statusMessage = 'No matching notebook cells were requested.';
			return;
		}

		status = 'loading';
		statusMessage = 'Loading Observable and D3…';
		for (const cell of selectedCells) cellStates[cell.name] = 'loading';

		loadingPromise = Promise.all([import('@observablehq/runtime'), import('d3')])
			.then(([runtimePackage, d3]) => {
				if (destroyed) return;
				const selectedNames = new Set(selectedCells.map((cell) => cell.name));
				const fulfilledCells = new Set<string>();
				runtime = new runtimePackage.Runtime({
					d3,
					reducedMotion: reducedMotionRequested()
				});
				runtimeModule = runtime.module(notebook.define, (name) =>
					observerFor(name, selectedNames, fulfilledCells)
				);
			})
			.catch((error) => {
				if (destroyed) return;
				status = 'error';
				statusMessage = errorText(error);
			})
			.finally(() => {
				loadingPromise = null;
			});

		await loadingPromise;
	}

	onMount(() => {
		forcedReducedMotion = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			if (runtimeModule) {
				runtimeModule.redefine('reducedMotion', reducedMotionRequested());
			}
		};

		intersectionObserver =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) {
								void loadNotebook();
								intersectionObserver?.disconnect();
							}
						},
						{ rootMargin: '280px 0px' }
					);

		if (intersectionObserver) intersectionObserver.observe(loadTarget);
		else void loadNotebook();
		motionQuery.addEventListener('change', updateMotion);

		return () => {
			destroyed = true;
			intersectionObserver?.disconnect();
			motionQuery?.removeEventListener('change', updateMotion);
			runtime?.dispose();
			runtime = null;
			runtimeModule = null;
			for (const host of outputHosts.values()) host.replaceChildren();
		};
	});
</script>

<figure
	bind:this={shell}
	class:compact
	class="observable-shell not-prose my-10 overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 shadow-lg shadow-neutral-950/5 dark:border-neutral-700 dark:bg-neutral-900"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-description`}
	aria-busy={status === 'loading'}
>
	<header
		class="flex flex-col gap-2 border-b border-neutral-300 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 dark:border-neutral-700"
	>
		<div class="min-w-0">
			<p
				class="!mb-1 !text-left text-[0.68rem] font-bold tracking-[0.18em] text-cyan-700 uppercase dark:text-cyan-300"
			>
				Observable notebook
			</p>
			<h2
				id={`${uid}-title`}
				class="!m-0 !text-xl !leading-tight !font-bold text-neutral-950 dark:text-white"
			>
				{displayTitle}
			</h2>
			<p
				id={`${uid}-description`}
				class="!mt-2 !mb-0 max-w-2xl !text-left text-sm !leading-relaxed text-neutral-600 dark:text-neutral-400"
			>
				{displayDescription}
			</p>
		</div>
		<p class="!m-0 shrink-0 !text-left text-xs text-neutral-500" aria-live="polite">
			{statusMessage}
		</p>
	</header>

	<div bind:this={loadTarget} class="divide-y divide-neutral-300 dark:divide-neutral-700">
		{#each selectedCells as cell (cell.name)}
			<section
				class="observable-cell {cell.kind === 'control' ? 'observable-control-cell' : ''}"
				aria-labelledby={`${uid}-${cell.name}-label`}
			>
				<div class="px-4 pt-4 sm:px-5">
					<h3
						id={`${uid}-${cell.name}-label`}
						class="!m-0 !text-sm !font-bold text-neutral-900 dark:text-neutral-100"
					>
						{cell.label}
					</h3>
					<p
						class="!mt-1 !mb-0 !text-left text-xs !leading-relaxed text-neutral-500 dark:text-neutral-400"
					>
						{cell.description}
					</p>
				</div>
				<div
					use:outputHost={cell.name}
					class="observable-output min-h-28 p-4 sm:p-5"
					data-cell={cell.name}
				>
					{#if cellStates[cell.name] === 'error'}
						<p class="!m-0 !text-left text-sm font-semibold text-red-700 dark:text-red-300">
							{cellErrors[cell.name]}
						</p>
					{:else}
						<div class="grid min-h-20 place-items-center text-sm text-neutral-500">
							{status === 'idle'
								? 'This cell will load as it approaches the screen.'
								: 'Evaluating cell…'}
						</div>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	{#if status === 'idle'}
		<div class="border-t border-neutral-300 px-4 py-3 dark:border-neutral-700">
			<button
				type="button"
				onclick={loadNotebook}
				class="min-h-11 rounded-md border border-neutral-400 bg-white px-4 py-2 text-sm font-bold text-neutral-900 hover:border-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-white dark:hover:border-neutral-400"
			>
				Load live cells
			</button>
		</div>
	{/if}

	<noscript>
		<p class="!m-0 border-t border-neutral-300 p-4 !text-left text-sm dark:border-neutral-700">
			JavaScript is disabled. The tutorial and source remain readable, but these reactive cells
			cannot run.
		</p>
	</noscript>

	{#if caption}
		<figcaption
			class="border-t border-neutral-300 px-4 py-3 text-sm leading-relaxed text-neutral-500 sm:px-5 dark:border-neutral-700 dark:text-neutral-400"
		>
			{caption}
		</figcaption>
	{/if}
</figure>

<style>
	.observable-shell {
		--observable-surface: #fafaf9;
		--observable-grid: #d6d3d1;
		--observable-axis: #57534e;
		--observable-ink: #0e7490;
		--observable-accent: #c026d3;
		--observable-point: #ea580c;
	}

	:global(.dark) .observable-shell {
		--observable-surface: #0a0a0a;
		--observable-grid: #404040;
		--observable-axis: #d4d4d4;
		--observable-ink: #67e8f9;
		--observable-accent: #f0abfc;
		--observable-point: #fdba74;
	}

	.observable-shell.compact .observable-cell > div:first-child {
		display: none;
	}

	.observable-output :global(svg),
	.observable-output :global(canvas) {
		display: block;
		width: 100%;
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}

	.observable-output :global(.observable-controls) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.observable-output :global(.observable-control) {
		display: grid;
		gap: 0.4rem;
		min-width: 0;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--observable-axis);
	}

	.observable-output :global(.observable-control-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.observable-output :global(.observable-control output) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--observable-ink);
	}

	.observable-output :global(.observable-control input[type='range']) {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--observable-ink);
	}

	.observable-output :global(.observable-toggle) {
		grid-column: 1 / -1;
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.65rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--observable-axis);
	}

	.observable-output :global(.observable-toggle input) {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--observable-ink);
	}

	.observable-output :global(.observable-value) {
		margin: 0;
		white-space: pre-wrap;
		color: var(--observable-axis);
	}

	@media (max-width: 640px) {
		.observable-output :global(.observable-controls) {
			grid-template-columns: 1fr;
		}

		.observable-output :global(.observable-toggle) {
			grid-column: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.observable-shell,
		.observable-shell * {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
