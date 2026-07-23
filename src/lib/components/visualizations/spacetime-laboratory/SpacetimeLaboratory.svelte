<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import SpacetimeCanvas from './SpacetimeCanvas.svelte';
	import SpacetimeControls from './SpacetimeControls.svelte';
	import SpacetimeEquationPanel from './SpacetimeEquationPanel.svelte';
	import SpacetimeGraph from './SpacetimeGraph.svelte';
	import SpacetimeSeeingPanel from './SpacetimeSeeingPanel.svelte';
	import SpacetimeComparison from './SpacetimeComparison.svelte';
	import WebGLFallback from '$lib/components/visualizations/WebGLFallback.svelte';
	import { createSpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import { supportsWebGL } from '$lib/visualizations/webgl';

	type Props = {
		title?: string;
		caption?: string;
		poster?: string;
		posterAlt?: string;
	};

	let {
		title = 'Spacetime Laboratory',
		caption = 'One equation, many universes. Choose a metric solution, move the observer, and watch what changes for light.',
		poster = '/images/spacetime-laboratory-einstein-equations.webp',
		posterAlt = 'A black hole lensing stars and galaxies into arcs beside a glowing accretion disk'
	}: Props = $props();

	const store = createSpacetimeStore();

	let webglError = $state<string | null>(null);
	let webglAvailable = $state(true);
	let shareCopied = $state(false);
	let saveMessage = $state('');
	let captureRef = $state<(() => string | null) | null>(null);
	let shell: HTMLElement;
	let showControls = $state(true);
	let uid = $props.id();

	function handleSave() {
		const data = captureRef?.();
		if (!data) {
			saveMessage = 'Save failed — the frame could not be read.';
			return;
		}
		const link = document.createElement('a');
		link.href = data;
		link.download = `spacetime-${store.state.model}-${Date.now()}.png`;
		link.click();
		saveMessage = 'Frame saved as PNG.';
		setTimeout(() => (saveMessage = ''), 3000);
	}

	async function handleShare() {
		const url = new SvelteURL(window.location.href);
		url.search = store.queryString();
		try {
			await navigator.clipboard.writeText(url.toString());
			shareCopied = true;
			setTimeout(() => (shareCopied = false), 2500);
		} catch {
			window.prompt('Copy this link:', url.toString());
		}
	}

	async function handleFullscreen() {
		try {
			if (document.fullscreenElement === shell) await document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			/* fullscreen unsupported */
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
			return;
		const obs = store.state.observer;
		const step = event.shiftKey ? 10 : 2;
		switch (event.key) {
			case 'ArrowLeft':
				store.setObserver('azimuthDeg', obs.azimuthDeg - step);
				break;
			case 'ArrowRight':
				store.setObserver('azimuthDeg', obs.azimuthDeg + step);
				break;
			case 'ArrowUp':
				store.setObserver('elevationDeg', obs.elevationDeg + step);
				break;
			case 'ArrowDown':
				store.setObserver('elevationDeg', obs.elevationDeg - step);
				break;
			case '+':
			case '=':
				store.setObserver('distance', obs.distance - 0.5);
				break;
			case '-':
				store.setObserver('distance', obs.distance + 0.5);
				break;
			case ' ':
				store.update({ playing: !store.state.playing });
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	onMount(() => {
		webglAvailable = supportsWebGL();
		if (!webglAvailable) webglError = 'WebGL is unavailable in this browser.';
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			store.update({ playing: false });
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<section
	bind:this={shell}
	class="spacetime-lab article-breakout not-prose"
	aria-labelledby="{uid}-heading"
>
	<header class="lab-header">
		<div>
			<p class="lab-kicker">Interactive · General relativity</p>
			<h2 id="{uid}-heading">{title}</h2>
		</div>
		<div class="lab-actions">
			<button
				type="button"
				onclick={() => (showControls = !showControls)}
				aria-expanded={showControls}
			>
				{showControls ? 'Hide controls' : 'Show controls'}
			</button>
		</div>
	</header>

	<div
		class="lab-canvas-frame"
		role="application"
		aria-label="Spacetime laboratory viewport. Arrow keys orbit the observer, plus and minus zoom, space pauses."
	>
		{#if webglAvailable && !webglError}
			<SpacetimeCanvas
				{store}
				onwebglerror={(m) => (webglError = m)}
				oncapture={(fn) => (captureRef = fn)}
			/>
			<div class="lab-hud" aria-hidden="true">
				<span>{store.state.model.replace(/-/g, ' ')}</span>
				<span
					>r = {store.state.observer.distance.toFixed(1)} r_s · θ = {store.state.observer.elevationDeg.toFixed(
						0
					)}°</span
				>
			</div>
		{:else}
			<WebGLFallback
				{poster}
				{posterAlt}
				title="WebGL unavailable"
				message={webglError ??
					'This browser could not create a WebGL2 context. The equations and article below remain fully readable, and the table of effects summarizes each parameter.'}
			/>
		{/if}
		<noscript>
			<img src={poster} alt={posterAlt} class="noscript-poster" />
		</noscript>
	</div>

	{#if shareCopied}<p class="toast" role="status">Share link copied to clipboard.</p>{/if}
	{#if saveMessage}<p class="toast" role="status">{saveMessage}</p>{/if}

	<div class="lab-panels">
		<SpacetimeEquationPanel model={store.state.model} />
		<SpacetimeSeeingPanel {store} />
		<SpacetimeGraph {store} />
	</div>

	{#if store.state.compare}
		<SpacetimeComparison
			modelA={store.state.model}
			modelB={store.state.compareModel}
			onchoose={(a, b) => store.update({ model: a, compareModel: b })}
		/>
	{/if}

	{#if showControls}
		<SpacetimeControls
			{store}
			onsave={handleSave}
			onshare={handleShare}
			onfullscreen={handleFullscreen}
		/>
	{/if}

	<footer class="lab-footer">
		{caption} Keyboard: arrow keys orbit, +/- zoom, space pauses. This is a scientifically informed visualization
		using known metrics — not a real-time solver of the Einstein field equation.
	</footer>
</section>

<style>
	.spacetime-lab {
		position: relative;
		width: min(84rem, calc(100vw - 1.5rem));
		transform: translateX(-50%);
		margin: 2.5rem 0;
		overflow: hidden;
		border: 1px solid #232841;
		border-radius: 1rem;
		background: #0b0e18;
		color: #e5e9f5;
		box-shadow: 0 24px 60px -30px rgb(0 0 0 / 0.8);
	}
	.lab-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid #1d2236;
		padding: 0.9rem 1.1rem;
	}
	.lab-kicker {
		margin: 0 0 0.15rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #7dd3fc;
	}
	h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 800;
		color: #fff;
	}
	.lab-actions button {
		min-height: 2.5rem;
		border: 1px solid #3a4160;
		border-radius: 0.5rem;
		background: #1a1f33;
		color: #e5e9f5;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.45rem 0.8rem;
		cursor: pointer;
	}
	.lab-canvas-frame {
		position: relative;
		aspect-ratio: 16 / 9;
		min-height: 18rem;
		background: #05070d;
		outline: none;
	}
	@media (max-width: 640px) {
		.lab-canvas-frame {
			aspect-ratio: 4 / 5;
			min-height: 22rem;
		}
	}
	.lab-hud {
		position: absolute;
		left: 0.7rem;
		bottom: 0.6rem;
		display: flex;
		gap: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: #8b93b0;
		text-transform: capitalize;
		pointer-events: none;
	}
	.lab-panels {
		display: grid;
		gap: 0.9rem;
		padding: 0.9rem 1rem 0;
	}
	@media (min-width: 900px) {
		.lab-panels {
			grid-template-columns: 1.2fr 1.2fr 1fr;
		}
	}
	.toast {
		margin: 0.5rem 1rem 0;
		border-radius: 0.5rem;
		background: #14324a;
		padding: 0.5rem 0.8rem;
		font-size: 0.78rem;
		color: #a5f3fc;
	}
	.lab-footer {
		border-top: 1px solid #1d2236;
		padding: 0.8rem 1.1rem;
		font-size: 0.74rem;
		line-height: 1.55;
		color: #6b7494;
	}
	.noscript-poster {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.spacetime-lab:fullscreen {
		width: 100vw;
		border-radius: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	.spacetime-lab:fullscreen .lab-canvas-frame {
		flex: 1;
		aspect-ratio: auto;
	}
</style>
