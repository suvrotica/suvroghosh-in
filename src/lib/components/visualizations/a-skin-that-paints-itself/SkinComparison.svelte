<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		DEFAULT_SETTINGS,
		OBSERVATION_TIME,
		type SkinSettings
	} from '$lib/visualizations/a-skin-that-paints-itself/settings';

	type Specimen = 'formed' | 'fitted';

	let {
		settings = DEFAULT_SETTINGS,
		formedTime = OBSERVATION_TIME,
		observationTime = OBSERVATION_TIME,
		previous = false,
		saved = true,
		specimen
	}: {
		settings?: SkinSettings;
		formedTime?: number;
		observationTime?: number;
		previous?: boolean;
		saved?: boolean;
		specimen?: Snippet<[Specimen]>;
	} = $props();

	const panels = [
		{
			kind: 'formed',
			title: 'Formed on this shape',
			caption: 'The signals interact and spread inside this boundary.',
			alt: 'Pattern formed in the strip, with a dark band spanning the width near the right end'
		},
		{
			kind: 'fitted',
			title: 'Finished pattern fitted to this shape',
			caption: 'A saved pattern from a broad surface is mapped into this boundary.',
			alt: 'Folds of dark and light from the broad patch squeezed into the same narrow strip'
		}
	] as const;

	let widthText = $derived(
		settings.shape === 'tapered'
			? `${settings.widthPercent}% width at wide end`
			: `${settings.widthPercent}% width`
	);
</script>

<div
	class="skin-comparison"
	data-testid="skin-comparison"
	data-displayed-width={settings.widthPercent}
	data-displayed-shape={settings.shape}
	data-displayed-appearance={settings.appearance}
	data-displayed-seed={settings.seed}
>
	{#each panels as panel, index (panel.kind)}
		<figure class="skin-panel">
			<h3>
				<span class="skin-panel-letter" aria-hidden="true">{index === 0 ? 'A' : 'B'}</span>
				<span>{panel.title}</span>
			</h3>
			<div class="skin-window">
				{#if saved}
					<img
						class="skin-specimen"
						src={`/images/visualizations/a-skin-that-paints-itself/${panel.kind}.png`}
						alt={panel.alt}
						width="384"
						height="200"
						loading="eager"
						decoding="async"
					/>
				{/if}
				{@render specimen?.(panel.kind)}
			</div>
			<figcaption>
				<p>{panel.caption}</p>
				<p class="skin-reading">
					<span>{previous ? 'Previous result · ' : ''}{widthText}</span>
					<span data-testid={`skin-${panel.kind}-time`}>
						{panel.kind === 'formed'
							? `t = ${formedTime} · model time`
							: `Saved at t = ${observationTime}`}
					</span>
				</p>
			</figcaption>
		</figure>
	{/each}
</div>
