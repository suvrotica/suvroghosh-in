<script lang="ts">
	import type { Settings } from './config';
	import type { FingerprintFrame } from './protocol';
	import { paint, RENDER_HEIGHT, RENDER_WIDTH, startingRegions, type View } from './render';

	let {
		frame,
		image,
		settings,
		view,
		showRegions,
		positionPreview,
		rendererUnavailable
	}: {
		frame: FingerprintFrame | null;
		image?: string;
		settings: Settings;
		view: View;
		showRegions: boolean;
		positionPreview?: Settings;
		rendererUnavailable: () => void;
	} = $props();
	let canvas = $state<HTMLCanvasElement>();
	const name = $derived(settings.preset[0].toUpperCase() + settings.preset.slice(1));
	const markers = $derived(
		showRegions
			? startingRegions(
					positionPreview ?? settings,
					positionPreview ? undefined : (frame ?? undefined)
				)
			: positionPreview
				? startingRegions(positionPreview).filter((region) => region.id === 'pad')
				: []
	);

	$effect(() => {
		if (!canvas || !frame) return;
		try {
			if (paint(canvas, frame, view)) return;
		} catch {
			// The parent restores the verified static example if the renderer is unavailable.
		}
		rendererUnavailable();
	});
</script>

<div class="fp-sheet">
	{#if frame}
		<div
			class="fp-raster"
			role="img"
			aria-label={view === 'print'
				? `Synthetic ${name} preset print`
				: `${name} preset activator signal`}
		>
			<canvas
				bind:this={canvas}
				width={RENDER_WIDTH}
				height={RENDER_HEIGHT}
				data-testid="fingerprint-canvas"
				aria-hidden="true"
			></canvas>
		</div>
	{:else if image}
		<img
			src={image}
			alt={`Stored ${name} example from the numerical model`}
			width={RENDER_WIDTH}
			height={RENDER_HEIGHT}
			decoding="async"
		/>
	{/if}
	{#each markers as marker (marker.id)}
		<div class="fp-marker" style:left={`${marker.x * 100}%`} style:top={`${marker.y * 100}%`}>
			<span class="fp-marker-dot" aria-hidden="true"></span>
			<span class="fp-marker-label"
				>{positionPreview && marker.id === 'pad' ? 'New pad start' : marker.label}</span
			>
		</div>
	{/each}
</div>
