<script lang="ts">
	import { onMount } from 'svelte';
	import type { BiasScenario } from '$lib/visualizations/bias-archipelago/bias-types';

	let {
		scenarios,
		activeScenarioId,
		activeStep,
		onactivate
	}: {
		scenarios: BiasScenario[];
		activeScenarioId?: string;
		activeStep: number;
		onactivate: (scenarioId: string, step: number) => void;
	} = $props();

	let rail: HTMLElement;
	let observer: IntersectionObserver | null = null;

	onMount(() => {
		observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
				if (!visible) return;
				const element = visible.target as HTMLElement;
				const scenarioId = element.dataset.scenario;
				const step = Number(element.dataset.step);
				if (scenarioId && Number.isInteger(step)) onactivate(scenarioId, step);
			},
			{ rootMargin: '-32% 0px -48% 0px', threshold: [0.15, 0.45, 0.75] }
		);
		for (const element of rail.querySelectorAll<HTMLElement>('[data-scenario-step]')) {
			observer.observe(element);
		}
		return () => observer?.disconnect();
	});
</script>

<div bind:this={rail} class="scenario-rail">
	<header>
		<p>Four guided soundings</p>
		<h2>Decisions happen in coalitions</h2>
		<span>
			Scroll normally. As each passage enters the reading line, the survey illuminates its sequence;
			no single peak is accused of causing the whole outcome.
		</span>
	</header>
	{#each scenarios as scenario, scenarioIndex (scenario.id)}
		<article class:active={scenario.id === activeScenarioId} id={`scenario-${scenario.id}`}>
			<div class="scenario-number" aria-hidden="true">0{scenarioIndex + 1}</div>
			<p class="eyebrow">Decision cascade</p>
			<h3>{scenario.title}</h3>
			<p class="deck">{scenario.introduction}</p>
			{#if scenario.id === 'pattern-in-six-coin-tosses'}
				<div class="coins" aria-label="Six heads in sequence">
					{#each [0, 1, 2, 3, 4, 5] as index (index)}<span style={`--coin-delay:${index * 90}ms`}
							>H</span
						>{/each}
				</div>
			{/if}
			<ol>
				{#each scenario.steps as step, stepIndex (`${scenario.id}:${stepIndex}`)}
					<li
						data-scenario-step
						data-scenario={scenario.id}
						data-step={stepIndex}
						class:active-step={scenario.id === activeScenarioId && stepIndex === activeStep}
					>
						<button type="button" onclick={() => onactivate(scenario.id, stepIndex)}>
							<span>{String(stepIndex + 1).padStart(2, '0')}</span>
							{step.text}
						</button>
					</li>
				{/each}
			</ol>
			<p class="interpretation">{scenario.interpretation}</p>
		</article>
	{/each}
</div>

<style>
	.scenario-rail {
		display: grid;
		gap: 3rem;
	}

	header {
		padding: 1rem 0 2rem;
		border-bottom: 1px solid var(--arch-rule);
	}

	header p,
	.eyebrow {
		margin: 0 0 0.45rem;
		color: var(--arch-accent-bright);
		font-size: 0.68rem;
		font-weight: 780;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	header h2 {
		margin: 0 0 0.65rem;
		font-family: var(--arch-serif);
		font-size: clamp(1.65rem, 3.5vw, 2.8rem);
		line-height: 1.02;
	}

	header span,
	.deck,
	.interpretation {
		color: var(--arch-muted);
		font-size: 0.82rem;
		line-height: 1.6;
	}

	article {
		position: relative;
		padding: 1.2rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.65rem;
		background: color-mix(in srgb, var(--arch-panel) 78%, transparent);
		opacity: 0.72;
		transition:
			opacity 220ms ease,
			border-color 220ms ease;
	}

	article.active {
		border-color: color-mix(in srgb, var(--arch-accent) 70%, var(--arch-rule));
		opacity: 1;
	}

	.scenario-number {
		position: absolute;
		top: 0.6rem;
		right: 0.9rem;
		color: color-mix(in srgb, var(--arch-accent) 30%, transparent);
		font-family: var(--arch-serif);
		font-size: 3.5rem;
		font-style: italic;
		line-height: 1;
		pointer-events: none;
	}

	article h3 {
		position: relative;
		max-width: 85%;
		margin: 0 0 0.65rem;
		font-family: var(--arch-serif);
		font-size: 1.55rem;
		line-height: 1.08;
	}

	.deck {
		position: relative;
		margin: 0 0 1rem;
	}

	ol {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		border-left: 2px solid var(--arch-rule);
		transition: border-color 180ms ease;
	}

	li.active-step {
		border-color: var(--arch-accent-bright);
	}

	li button {
		display: grid;
		width: 100%;
		min-height: 4.1rem;
		grid-template-columns: 1.7rem 1fr;
		gap: 0.55rem;
		align-items: start;
		padding: 0.68rem 0.75rem;
		border: 0;
		background: transparent;
		color: var(--arch-text);
		font: inherit;
		font-size: 0.79rem;
		line-height: 1.48;
		text-align: left;
		cursor: pointer;
	}

	li button:hover,
	li.active-step button {
		background: color-mix(in srgb, var(--arch-accent) 11%, transparent);
	}

	li button span {
		color: var(--arch-accent-bright);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}

	.interpretation {
		margin: 1rem 0 0;
		padding-top: 0.8rem;
		border-top: 1px solid var(--arch-rule);
		font-style: italic;
	}

	.coins {
		display: flex;
		gap: 0.4rem;
		margin: 0.8rem 0 1.1rem;
	}

	.coins span {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid var(--arch-accent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--arch-accent) 16%, transparent);
		font-family: var(--arch-serif);
		font-weight: 800;
		animation: coin-arrival 1.8s ease-in-out infinite;
		animation-delay: var(--coin-delay);
	}

	@keyframes coin-arrival {
		0%,
		55%,
		100% {
			transform: translateY(0);
			box-shadow: none;
		}
		68% {
			transform: translateY(-0.3rem);
			box-shadow: 0 0 1rem color-mix(in srgb, var(--arch-accent) 60%, transparent);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		article,
		li,
		.coins span {
			animation: none;
			transition: none;
		}
	}
</style>
