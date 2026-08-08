<script lang="ts">
	import { BZ_V2_LAYERS } from './v2-experience-model';
	import type { BZV2Layer } from '$lib/visualizations/bz/v2-types';

	type Props = {
		value: BZV2Layer;
		onchange?: (layer: BZV2Layer) => void;
	};

	let { value, onchange }: Props = $props();

	function choose(layer: BZV2Layer) {
		onchange?.(layer);
	}

	function navigate(event: KeyboardEvent, index: number) {
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % BZ_V2_LAYERS.length;
		else if (event.key === 'ArrowLeft') {
			next = (index - 1 + BZ_V2_LAYERS.length) % BZ_V2_LAYERS.length;
		} else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = BZ_V2_LAYERS.length - 1;
		else return;
		event.preventDefault();
		choose(BZ_V2_LAYERS[next].id);
		const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
		(list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next] ?? null)?.focus();
	}
</script>

<div
	class="mode-tabs"
	role="tablist"
	aria-label="Belousov–Zhabotinsky experience mode"
	aria-orientation="horizontal"
>
	{#each BZ_V2_LAYERS as layer, index (layer.id)}
		<button
			type="button"
			id={`bz-v2-tab-${layer.id}`}
			role="tab"
			aria-selected={value === layer.id}
			aria-controls={`bz-v2-panel-${layer.id}`}
			tabindex={value === layer.id ? 0 : -1}
			data-active={value === layer.id}
			onclick={() => choose(layer.id)}
			onkeydown={(event) => navigate(event, index)}
		>
			<span>{layer.label}</span>
			<small>{layer.description}</small>
		</button>
	{/each}
</div>

<style>
	.mode-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.35rem;
		padding: 0.45rem;
		border: 1px solid rgb(255 255 255 / 0.11);
		border-radius: 0.85rem;
		background: rgb(5 9 12 / 0.56);
	}
	button {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
		min-height: 3.25rem;
		border: 1px solid transparent;
		border-radius: 0.62rem;
		background: transparent;
		color: rgb(239 241 235 / 0.64);
		padding: 0.58rem 0.75rem;
		text-align: left;
		cursor: pointer;
	}
	button:hover {
		border-color: rgb(255 255 255 / 0.18);
		background: rgb(255 255 255 / 0.045);
		color: #f2eee2;
	}
	button[data-active='true'] {
		border-color: rgb(225 167 139 / 0.46);
		background: linear-gradient(135deg, rgb(142 75 85 / 0.42), rgb(38 127 147 / 0.15));
		color: #fff8e8;
	}
	button:focus-visible {
		outline: 3px solid #ffce63;
		outline-offset: 2px;
	}
	span {
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	small {
		overflow: hidden;
		color: inherit;
		font-size: 0.62rem;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.7;
	}
	@media (max-width: 600px) {
		button {
			place-items: center;
			min-height: 2.8rem;
			padding-inline: 0.35rem;
			text-align: center;
		}
		small {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button {
			scroll-behavior: auto;
		}
	}
</style>
