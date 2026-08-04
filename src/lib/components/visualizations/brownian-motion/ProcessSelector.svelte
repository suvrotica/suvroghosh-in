<script lang="ts">
	import type { ProcessChoice, ProcessFamily } from './ui-types';

	type Props = {
		processes: readonly ProcessChoice[];
		selected: string;
		onselect: (id: string) => void;
	};

	let { processes, selected, onselect }: Props = $props();
	let buttons = $state<HTMLButtonElement[]>([]);

	const familyLabels: Readonly<Record<ProcessFamily, string>> = {
		brownian: 'Brownian family',
		conditioned: 'Conditioned & correlated',
		active: 'Driven motion',
		arrival: 'Arrival experiments',
		cousin: 'Relatives, not Brownian'
	};

	let families = $derived(
		Array.from(new Set(processes.map((process) => process.family))).map((family) => ({
			family,
			label: familyLabels[family],
			processes: processes.filter((process) => process.family === family)
		}))
	);

	function keydown(event: KeyboardEvent, id: string): void {
		const current = processes.findIndex((process) => process.id === id);
		if (current < 0) return;
		let target: number;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			target = (current + 1) % processes.length;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			target = (current - 1 + processes.length) % processes.length;
		else if (event.key === 'Home') target = 0;
		else if (event.key === 'End') target = processes.length - 1;
		else return;
		event.preventDefault();
		onselect(processes[target].id);
		buttons[target]?.focus();
	}
</script>

<div class="selector" role="tablist" aria-label="Stochastic process selector">
	{#each families as group (group.family)}
		<section role="presentation">
			<h3 id={`process-family-${group.family}`}>{group.label}</h3>
			<div class="process-tabs" role="presentation">
				{#each group.processes as process (process.id)}
					{@const absoluteIndex = processes.findIndex((candidate) => candidate.id === process.id)}
					<button
						bind:this={buttons[absoluteIndex]}
						id={`brownian-process-tab-${process.id}`}
						type="button"
						role="tab"
						aria-selected={selected === process.id}
						aria-controls="brownian-process-panel"
						tabindex={selected === process.id ? 0 : -1}
						class:active={selected === process.id}
						title={process.description}
						onclick={() => onselect(process.id)}
						onkeydown={(event) => keydown(event, process.id)}
					>
						<span class="wide">{process.label}</span>
						<span class="narrow">{process.shortLabel}</span>
					</button>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.selector {
		display: grid;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--paper-soft, #ece6da) 94%, transparent);
	}
	section {
		display: grid;
		grid-template-columns: 9.5rem minmax(0, 1fr);
		border-top: 1px solid color-mix(in srgb, var(--rule, #c8c1b2) 65%, transparent);
	}
	section:first-child {
		border-top: 0;
	}
	h3 {
		align-self: stretch;
		margin: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		padding: 0.72rem 0.8rem;
		color: var(--ink-muted, #68707a);
		font:
			700 0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.process-tabs {
		display: flex;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	button {
		min-height: 2.8rem;
		flex: 1 0 auto;
		border: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		background: transparent;
		padding: 0.55rem 0.75rem;
		color: var(--ink-muted, #68707a);
		font:
			700 0.76rem Roboto,
			system-ui,
			sans-serif;
		cursor: pointer;
	}
	button.active {
		box-shadow: inset 0 -3px var(--lab-accent, #6f7fa8);
		background: color-mix(in srgb, var(--lab-accent, #6f7fa8) 12%, transparent);
		color: var(--ink, #242a32);
	}
	button:focus-visible {
		position: relative;
		z-index: 2;
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 70%, white);
		outline-offset: -3px;
	}
	.narrow {
		display: none;
	}
	@media (max-width: 50rem) {
		section {
			grid-template-columns: 1fr;
		}
		h3 {
			border-right: 0;
			border-bottom: 1px solid var(--rule, #c8c1b2);
			padding: 0.4rem 0.65rem;
		}
		button {
			flex: 0 0 auto;
		}
	}
	@media (max-width: 32rem) {
		.wide {
			display: none;
		}
		.narrow {
			display: inline;
		}
	}
</style>
