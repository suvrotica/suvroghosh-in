<script lang="ts">
	import { onMount, tick } from 'svelte';

	import canvasSource from './RayMarchingCanvas.svelte?raw';
	import exhibitSource from './RayMarchingExhibit.svelte?raw';
	import fragmentSource from '$lib/visualizations/experiments/ray-marching/fragment.frag?raw';
	import qualitySource from '$lib/visualizations/experiments/ray-marching/quality.ts?raw';
	import sketchSource from '$lib/visualizations/experiments/ray-marching/sketch.ts?raw';
	import stagesSource from '$lib/visualizations/experiments/ray-marching/stages.ts?raw';
	import vertexSource from '$lib/visualizations/experiments/ray-marching/vertex.vert?raw';

	type Props = {
		onopen?: () => void;
	};

	let { onopen = () => {} }: Props = $props();

	type SourceFile = {
		id: string;
		label: string;
		filename: string;
		source: string;
	};

	const files: readonly SourceFile[] = [
		{
			id: 'exhibit',
			label: 'Svelte exhibit host',
			filename: 'RayMarchingExhibit.svelte',
			source: exhibitSource
		},
		{
			id: 'host',
			label: 'Svelte canvas host',
			filename: 'RayMarchingCanvas.svelte',
			source: canvasSource
		},
		{
			id: 'sketch',
			label: 'p5 sketch adapter',
			filename: 'sketch.ts',
			source: sketchSource
		},
		{
			id: 'vertex',
			label: 'Vertex shader',
			filename: 'vertex.vert',
			source: vertexSource
		},
		{
			id: 'fragment',
			label: 'Fragment shader',
			filename: 'fragment.frag',
			source: fragmentSource
		},
		{
			id: 'stages',
			label: 'Stage definitions',
			filename: 'stages.ts',
			source: stagesSource
		},
		{
			id: 'quality',
			label: 'Quality policy',
			filename: 'quality.ts',
			source: qualitySource
		}
	];

	let enhanced = $state(false);
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	let hasReportedOpen = false;

	onMount(() => {
		enhanced = true;

		return () => {
			if (statusTimer) clearTimeout(statusTimer);
		};
	});

	async function announce(message: string) {
		status = '';
		await tick();
		status = message;

		if (statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => {
			status = '';
		}, 2400);
	}

	function copyWithSelection(text: string): boolean {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.setAttribute('readonly', '');
		textArea.style.position = 'fixed';
		textArea.style.inset = '-9999px auto auto -9999px';
		document.body.appendChild(textArea);
		textArea.select();

		try {
			return document.execCommand('copy');
		} finally {
			textArea.remove();
		}
	}

	async function copyFile(file: SourceFile) {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(file.source);
			} else if (!copyWithSelection(file.source)) {
				throw new Error('The browser did not provide a clipboard method.');
			}

			await announce(`Copied ${file.filename}.`);
		} catch {
			await announce(`Could not copy ${file.filename}. Select its source manually.`);
		}
	}

	function reportOpen(event: Event) {
		if (hasReportedOpen || !(event.currentTarget as HTMLDetailsElement).open) return;
		hasReportedOpen = true;
		onopen();
	}
</script>

<details
	class="source-explorer not-prose group overflow-hidden rounded-xl border border-cyan-200/15 bg-slate-950 text-slate-100 shadow-[0_20px_70px_rgba(2,8,23,0.32)]"
	ontoggle={reportOpen}
>
	<summary
		class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-bold tracking-wide text-slate-50 transition outline-none hover:bg-slate-900/80 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden"
	>
		<span class="flex items-center gap-3">
			<span aria-hidden="true" class="font-mono text-cyan-300">&lt;/&gt;</span>
			<span>Source</span>
			<span class="font-normal text-slate-400">Actual files running this exhibit</span>
		</span>
		<span
			aria-hidden="true"
			class="text-xl leading-none text-cyan-200 transition-transform group-open:rotate-45">＋</span
		>
	</summary>

	<div class="border-t border-cyan-200/10 px-3 py-4 sm:px-5 sm:py-5">
		<p class="!mt-0 !mb-4 !text-left text-sm leading-relaxed !text-slate-300">
			These are the host, p5 adapter, shader, lesson stages, and quality policy used by the live
			scene. Each file remains readable when JavaScript is unavailable.
		</p>

		<div class="space-y-3">
			{#each files as file (file.id)}
				<details
					class="source-file overflow-hidden rounded-lg border border-slate-700/80 bg-black/25"
				>
					<summary
						class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 transition outline-none hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-inset sm:px-4 [&::-webkit-details-marker]:hidden"
					>
						<span class="min-w-0">
							<span class="block text-sm font-semibold text-slate-100">{file.label}</span>
							<span class="block truncate font-mono text-xs text-slate-400">{file.filename}</span>
						</span>
						<span aria-hidden="true" class="source-file__chevron text-cyan-300">⌄</span>
					</summary>

					<div class="border-t border-slate-800">
						{#if enhanced}
							<div class="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4">
								<p class="!m-0 min-w-0 truncate font-mono text-xs !text-slate-400">
									{file.filename}
								</p>
								<button
									type="button"
									onclick={() => copyFile(file)}
									aria-label={`Copy ${file.filename}`}
									class="min-h-11 shrink-0 rounded-md border border-cyan-200/30 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none"
								>
									Copy file
								</button>
							</div>
						{/if}

						<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard-scrollable source region) -->
						<div
							class="max-h-[38rem] overflow-auto overscroll-contain border-t border-slate-800 bg-[#020617]"
							tabindex="0"
							role="region"
							aria-label={`${file.filename} source code`}
						>
							<pre
								class="!m-0 min-w-max !bg-transparent !p-4 text-[0.78rem] leading-relaxed !text-slate-100"><code
									>{file.source}</code
								></pre>
						</div>
					</div>
				</details>
			{/each}
		</div>

		<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</p>
	</div>
</details>

<style>
	.source-explorer summary::marker,
	.source-file summary::marker {
		display: none;
	}

	.source-file[open] .source-file__chevron {
		transform: rotate(180deg);
	}

	.source-file__chevron {
		transition: transform 160ms ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.source-file__chevron {
			transition: none;
		}
	}
</style>
