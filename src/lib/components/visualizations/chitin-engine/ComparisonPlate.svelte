<script lang="ts">
	import WorldMiniature from './WorldMiniature.svelte';
	import type { CreatureGenome, WorldId } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		genome: CreatureGenome;
		onUseWorld: (world: WorldId) => void;
	};

	let { genome, onUseWorld }: Props = $props();
	const worlds: readonly WorldId[] = [
		'terminator-line',
		'basalt-gravity-well',
		'brine-under-ice',
		'orbital-ruin'
	];
</script>

<section class="comparison" aria-labelledby="world-comparison-heading">
	<header>
		<p>Comparative specimen plate</p>
		<h3 id="world-comparison-heading">The same genome, four worlds</h3>
		<span>Base seed <code>{genome.seed}</code>; only the declared world transform changes.</span>
	</header>
	<div class="plates">
		{#each worlds as world (world)}
			<WorldMiniature {genome} worldId={world} onUse={onUseWorld} />
		{/each}
	</div>
</section>

<style>
	.comparison {
		display: grid;
		gap: 1rem;
		padding: clamp(1rem, 2vw, 1.4rem);
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 1.1rem;
		background: linear-gradient(145deg, #090917, #05060e);
		color: #d9dbe5;
		font-family: var(--font-sans, system-ui, sans-serif);
	}
	header p,
	header h3,
	header span {
		margin: 0;
	}
	header p {
		color: #b695d5;
		font: 700 0.62rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	header h3 {
		margin-top: 0.28rem;
		color: white;
		font-size: clamp(1.15rem, 2.4vw, 1.65rem);
	}
	header span {
		display: block;
		margin-top: 0.4rem;
		color: #9699aa;
		font-size: 0.78rem;
	}
	code {
		color: #b8ff3d;
		font-family: var(--font-mono, monospace);
	}
	.plates {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}
	@media (max-width: 62rem) {
		.plates {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 34rem) {
		.plates {
			grid-template-columns: 1fr;
		}
	}
</style>
