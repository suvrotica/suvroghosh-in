<script lang="ts">
	import { ALL_PRESETS } from '$lib/visualizations/gastropod-shell-lab/shell/presets';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';

	interface Props {
		open: boolean;
		current: ShellRecipe;
		compareRecipe?: ShellRecipe;
		onchange: (recipe?: ShellRecipe) => void;
		onclose: () => void;
	}

	let { open, current, compareRecipe, onchange, onclose }: Props = $props();
	let selected = $state('');

	function select(event: Event): void {
		selected = (event.currentTarget as HTMLSelectElement).value;
		const preset = ALL_PRESETS.find((item) => item.id === selected);
		onchange(preset ? structuredClone(preset.recipe) : undefined);
	}

	$effect(() => {
		if (!compareRecipe) selected = '';
	});
</script>

{#if open}
	<section class="compare-panel" aria-labelledby="compare-title">
		<header>
			<div>
				<p class="panel-title">Translucent A/B overlay</p>
				<h2 id="compare-title">Compare forms</h2>
			</div>
			<button class="icon-button" type="button" aria-label="Close comparison" onclick={onclose}
				>×</button
			>
		</header>
		<label
			><span>Ghost specimen</span><select value={selected} onchange={select}
				><option value="">No comparison</option>{#each ALL_PRESETS as preset (preset.id)}<option
						value={preset.id}>{preset.title} · {preset.scopeBadge}</option
					>{/each}</select
			></label
		>
		{#if compareRecipe}
			<div class="comparison-table">
				<div>
					<span>Analytic whorl expansion W</span><strong class="number"
						>{current.engine === 'analytic'
							? current.coiling.whorlExpansion.toFixed(2)
							: 'not used'}</strong
					><strong class="number ghost"
						>{compareRecipe.engine === 'analytic'
							? compareRecipe.coiling.whorlExpansion.toFixed(2)
							: 'not used'}</strong
					>
				</div>
				<div>
					<span>Analytic spire H/R</span><strong class="number"
						>{current.engine === 'analytic'
							? current.coiling.axial.coneSpireRatio.toFixed(2)
							: 'not used'}</strong
					><strong class="number ghost"
						>{compareRecipe.engine === 'analytic'
							? compareRecipe.coiling.axial.coneSpireRatio.toFixed(2)
							: 'not used'}</strong
					>
				</div>
				<div>
					<span>Aperture A/R</span><strong class="number"
						>{current.aperture.scale.toFixed(2)}</strong
					><strong class="number ghost">{compareRecipe.aperture.scale.toFixed(2)}</strong>
				</div>
			</div>
			<p>
				<i class="current"></i> current <i class="ghost"></i> ghost. The ghost uses the same deterministic
				rendering pipeline at a lighter viewport resolution; each recipe keeps its own selected engine
				and equations.
			</p>
		{/if}
	</section>
{/if}

<style>
	.compare-panel {
		position: absolute;
		z-index: 12;
		top: 4rem;
		left: 50%;
		width: min(460px, calc(100% - 2rem));
		padding: 0.85rem;
		border: 1px solid var(--line-bright);
		border-radius: 12px;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--panel) 96%, transparent);
		box-shadow: var(--shadow);
		backdrop-filter: blur(12px);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		margin: 0.14rem 0 0;
		font-size: 0.95rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		margin-top: 0.75rem;
		font-size: 0.6rem;
		color: var(--muted);
	}
	select {
		min-height: 40px;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
	}
	.comparison-table {
		display: grid;
		gap: 1px;
		margin-top: 0.75rem;
		background: var(--line);
		border: 1px solid var(--line);
		border-radius: 7px;
		overflow: hidden;
	}
	.comparison-table div {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.75rem;
		padding: 0.5rem;
		background: var(--panel-2);
	}
	.comparison-table span {
		font-size: 0.6rem;
		color: var(--muted);
	}
	.comparison-table strong {
		font-size: 0.65rem;
	}
	.comparison-table strong.ghost {
		color: var(--cyan);
	}
	p {
		margin: 0.55rem 0 0;
		font-size: 0.58rem;
		color: var(--muted);
	}
	p i {
		display: inline-block;
		width: 9px;
		height: 9px;
		margin: 0 0.2rem;
		border-radius: 50%;
		background: var(--amber);
	}
	p i.ghost {
		background: var(--cyan);
		opacity: 0.55;
	}
</style>
