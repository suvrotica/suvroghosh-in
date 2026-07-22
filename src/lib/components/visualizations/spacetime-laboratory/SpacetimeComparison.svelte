<script lang="ts">
	import type { SpacetimeModel } from '$lib/visualizations/spacetime-laboratory/spacetimeTypes';

	type Props = {
		modelA: SpacetimeModel;
		modelB: SpacetimeModel;
		onchoose?: (a: SpacetimeModel, b: SpacetimeModel) => void;
	};

	let { modelA, modelB, onchoose }: Props = $props();

	const pairs: { a: SpacetimeModel; b: SpacetimeModel; label: string }[] = [
		{ a: 'minkowski', b: 'schwarzschild', label: 'Flat vs. black hole' },
		{ a: 'schwarzschild', b: 'kerr', label: 'Static vs. rotating' },
		{ a: 'weak-field', b: 'schwarzschild', label: 'Weak vs. strong lensing' },
		{ a: 'minkowski', b: 'flrw', label: 'Static vs. expanding' },
		{ a: 'minkowski', b: 'gravitational-wave', label: 'Calm vs. rippled' },
		{ a: 'de-sitter', b: 'anti-de-sitter', label: 'Positive vs. negative Λ' }
	];
</script>

<div class="comparison-picker" aria-label="Comparison presets">
	{#each pairs as pair (pair.label)}
		<button
			type="button"
			class:active={modelA === pair.a && modelB === pair.b}
			onclick={() => onchoose?.(pair.a, pair.b)}
		>
			{pair.label}
		</button>
	{/each}
</div>

<style>
	.comparison-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		border-top: 1px solid #1d2236;
	}
	button {
		border: 1px solid #3a4160;
		border-radius: 999px;
		background: #161a2b;
		color: #b9c0d8;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.35rem 0.75rem;
		cursor: pointer;
	}
	button.active {
		border-color: #67e8f9;
		color: #a5f3fc;
		background: #14324a;
	}
</style>
