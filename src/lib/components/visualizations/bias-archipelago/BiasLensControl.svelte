<script lang="ts">
	import type { BiasLens } from '$lib/visualizations/bias-archipelago/bias-types';

	const lenses: { id: BiasLens; label: string; mark: string; description: string }[] = [
		{
			id: 'none',
			label: 'Survey',
			mark: '○',
			description: 'Monochrome base map'
		},
		{
			id: 'mechanism',
			label: 'Mechanism',
			mark: '◉',
			description: 'Cognitive machinery'
		},
		{ id: 'task', label: 'Task', mark: '◇', description: 'Where judgment changes' },
		{ id: 'lineage', label: 'Lineage', mark: '▧', description: 'Research tradition' },
		{ id: 'scale', label: 'Scale', mark: '△', description: 'Individual to organization' },
		{ id: 'conditions', label: 'Conditions', mark: '✦', description: 'Associated pressures' }
	];

	let {
		lens,
		conditions,
		conditionOptions,
		onlens,
		oncondition
	}: {
		lens: BiasLens;
		conditions: string[];
		conditionOptions: string[];
		onlens: (lens: BiasLens) => void;
		oncondition: (condition: string) => void;
	} = $props();
</script>

<div class="lens-control">
	<div class="lens-row" role="group" aria-label="Map lens">
		{#each lenses as option (option.id)}
			<button
				type="button"
				class:active={lens === option.id}
				onclick={() => onlens(option.id)}
				aria-pressed={lens === option.id}
				title={option.description}
			>
				<span aria-hidden="true">{option.mark}</span>
				{option.label}
			</button>
		{/each}
	</div>

	{#if lens === 'conditions'}
		<div class="condition-row" aria-label="Environmental conditions">
			{#each conditionOptions as condition (condition)}
				<button
					type="button"
					class:active={conditions.includes(condition)}
					onclick={() => oncondition(condition)}
					aria-pressed={conditions.includes(condition)}
				>
					{condition.replaceAll('-', ' ')}
				</button>
			{/each}
		</div>
		<p class="simulation-note">
			An explanatory simulation of associated conditions—not a psychological test or a measure of
			your susceptibility.
		</p>
	{/if}
</div>

<style>
	.lens-control {
		display: grid;
		gap: 0.55rem;
	}

	.lens-row,
	.condition-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	button {
		min-height: 2.55rem;
		padding: 0.42rem 0.68rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		background: var(--arch-panel);
		color: var(--arch-muted);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 680;
		letter-spacing: 0.025em;
		cursor: pointer;
	}

	button span {
		margin-right: 0.3rem;
	}

	button:hover,
	button.active {
		border-color: var(--arch-accent);
		background: color-mix(in srgb, var(--arch-accent) 15%, var(--arch-panel));
		color: var(--arch-text);
	}

	.condition-row button {
		min-height: 2.2rem;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.simulation-note {
		margin: 0;
		color: var(--arch-muted);
		font-size: 0.71rem;
		line-height: 1.45;
	}
</style>
