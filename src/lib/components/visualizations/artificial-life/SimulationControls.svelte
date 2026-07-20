<script lang="ts">
	import {
		ARTIFICIAL_LIFE_PRESETS,
		SIMULATION_CONTROLS,
		type SimulationControlDefinition
	} from '$lib/visualizations/artificial-life/simulationPresets';
	import type {
		NumericSimulationParameter,
		SimulationParameters
	} from '$lib/visualizations/artificial-life/types';

	type Props = {
		parameters: SimulationParameters;
		seed: string;
		paused: boolean;
		reducedMotion: boolean;
		highlightLineage: boolean;
		pendingRestart: string[];
		currentPresetId: string;
		onparameter: (key: NumericSimulationParameter, value: number) => void;
		onpredators: (value: boolean) => void;
		onseed: (value: string) => void;
		onhighlight: (value: boolean) => void;
		onpreset: (id: string) => void;
		onpause: () => void;
		onstep: () => void;
		onrestart: () => void;
		onrandomize: () => void;
		ondefaults: () => void;
	};

	let {
		parameters,
		seed,
		paused,
		reducedMotion,
		highlightLineage,
		pendingRestart,
		currentPresetId,
		onparameter,
		onpredators,
		onseed,
		onhighlight,
		onpreset,
		onpause,
		onstep,
		onrestart,
		onrandomize,
		ondefaults
	}: Props = $props();

	const groups = ['World', 'Energy economy', 'Evolution and pressure'] as const;

	function progress(control: SimulationControlDefinition) {
		return (parameters[control.key] - control.minimum) / (control.maximum - control.minimum);
	}

	function displayValue(control: SimulationControlDefinition) {
		const value = parameters[control.key];
		if (control.format === 'percent') return `${Math.round(value * 100)}%`;
		if (control.format === 'integer') return `${Math.round(value)}${control.unit ?? ''}`;
		return `${value.toFixed(2).replace(/\.00$/, '')}${control.unit ?? ''}`;
	}

	function updateNumber(event: Event, key: NumericSimulationParameter) {
		onparameter(key, Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

<section
	class="border-t border-neutral-800 bg-neutral-950 px-4 py-5 sm:px-5"
	aria-labelledby="lab-controls-heading"
>
	<div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<p class="m-0 text-[0.68rem] font-bold tracking-[0.16em] text-cyan-300 uppercase">
				Experimental conditions
			</p>
			<h3 id="lab-controls-heading" class="mt-1 mb-0 text-xl text-white">
				Shape the selection pressure
			</h3>
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="button" onclick={onpause} class="lab-button lab-button-primary">
				{paused ? 'Resume' : 'Pause'}
			</button>
			<button
				type="button"
				onclick={onstep}
				class="lab-button"
				aria-describedby="advance-fixed-time-help"
			>
				Advance 8 simulated seconds
			</button>
			<button type="button" onclick={onrestart} class="lab-button">Restart</button>
			<button type="button" onclick={onrandomize} class="lab-button">Randomize parameters</button>
			<button type="button" onclick={ondefaults} class="lab-button">Restore defaults</button>
		</div>
	</div>

	{#if reducedMotion}
		<p class="mb-4 rounded-md border border-cyan-900 bg-cyan-950/40 p-3 text-sm text-cyan-100">
			Motion began paused because your device requests reduced motion. Resume only when you are
			ready.
		</p>
	{/if}

	<div class="mb-6">
		<p class="mb-2 text-xs font-bold tracking-wide text-neutral-400 uppercase">
			Scientific presets
		</p>
		<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
			{#each ARTIFICIAL_LIFE_PRESETS as preset (preset.id)}
				<button
					type="button"
					onclick={() => onpreset(preset.id)}
					aria-pressed={currentPresetId === preset.id}
					class="min-h-20 rounded-lg border p-3 text-left transition-colors {currentPresetId ===
					preset.id
						? 'border-cyan-300 bg-cyan-950/60 text-white'
						: 'border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500'}"
				>
					<strong class="block text-sm">{preset.label}</strong>
					<span class="mt-1 block text-xs leading-relaxed text-neutral-400"
						>{preset.description}</span
					>
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-5 xl:grid-cols-3">
		{#each groups as group (group)}
			<fieldset class="min-w-0 border-0 p-0">
				<legend class="mb-3 text-sm font-bold text-neutral-200">{group}</legend>
				<div class="grid gap-3">
					{#each SIMULATION_CONTROLS.filter((control) => control.group === group) as control (control.key)}
						<label
							class="grid grid-cols-[3.25rem_1fr] gap-3 rounded-lg border border-neutral-800 bg-neutral-900/65 p-3"
						>
							<span
								class="control-dial relative grid h-12 w-12 place-items-center rounded-full bg-neutral-950 text-[0.62rem] font-bold text-neutral-100"
								style={`--dial-angle: ${progress(control) * 270}deg`}
								aria-hidden="true"
							>
								<span class="relative z-10 max-w-10 text-center leading-tight"
									>{displayValue(control)}</span
								>
							</span>
							<span class="min-w-0">
								<span class="flex flex-wrap items-baseline justify-between gap-2">
									<strong class="text-xs text-neutral-100">{control.label}</strong>
									{#if control.restartRequired}
										<span class="text-[0.62rem] font-bold tracking-wide text-amber-300 uppercase"
											>Restart required</span
										>
									{/if}
								</span>
								<span class="mt-1 block text-[0.7rem] leading-relaxed text-neutral-400"
									>{control.description}</span
								>
								<input
									type="range"
									value={parameters[control.key]}
									min={control.minimum}
									max={control.maximum}
									step={control.step}
									oninput={(event) => updateNumber(event, control.key)}
									class="mt-2 min-h-11 w-full cursor-pointer accent-cyan-300"
								/>
							</span>
						</label>
					{/each}

					{#if group === 'World'}
						<label class="rounded-lg border border-neutral-800 bg-neutral-900/65 p-3">
							<span class="flex flex-wrap items-baseline justify-between gap-2">
								<strong class="text-xs text-neutral-100">Deterministic seed</strong>
								<span class="text-[0.62rem] font-bold tracking-wide text-amber-300 uppercase"
									>Restart required</span
								>
							</span>
							<span class="mt-1 block text-[0.7rem] leading-relaxed text-neutral-400">
								The same seed, parameters, and exact fixed-step sequence reproduce the engine
								history. Real-time actions can occur at different simulation times across devices.
							</span>
							<input
								type="text"
								value={seed}
								oninput={(event) => onseed((event.currentTarget as HTMLInputElement).value)}
								class="mt-3 min-h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 font-mono text-sm text-white"
								aria-label="Deterministic simulation seed"
							/>
						</label>
					{/if}

					{#if group === 'Evolution and pressure'}
						<label
							class="flex min-h-16 items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/65 p-3"
						>
							<input
								type="checkbox"
								checked={parameters.predatorsEnabled}
								onchange={(event) => onpredators((event.currentTarget as HTMLInputElement).checked)}
								class="mt-1 h-5 w-5 shrink-0 accent-cyan-300"
							/>
							<span>
								<strong class="block text-xs text-neutral-100">Predators</strong>
								<span class="mt-1 block text-[0.7rem] leading-relaxed text-neutral-400">
									Adds a moving danger that changes fitness by rewarding avoidance, sensing, and
									speed.
								</span>
							</span>
						</label>

						<label
							class="flex min-h-16 items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/65 p-3"
						>
							<input
								type="checkbox"
								checked={highlightLineage}
								onchange={(event) => onhighlight((event.currentTarget as HTMLInputElement).checked)}
								class="mt-1 h-5 w-5 shrink-0 accent-cyan-300"
							/>
							<span>
								<strong class="block text-xs text-neutral-100"
									>Highlight deepest surviving lineage</strong
								>
								<span class="mt-1 block text-[0.7rem] leading-relaxed text-neutral-400">
									Adds a white membrane ring to the lineage containing the highest-generation living
									descendant.
								</span>
							</span>
						</label>
					{/if}
				</div>
			</fieldset>
		{/each}
	</div>

	{#if pendingRestart.length > 0}
		<p
			class="mt-5 mb-0 rounded-md border border-amber-800/70 bg-amber-950/35 p-3 text-sm text-amber-100"
			aria-live="polite"
		>
			Restart to apply: {pendingRestart.join(', ')}.
		</p>
	{/if}

	<details class="mt-5 border-t border-neutral-800 pt-4 text-sm text-neutral-300">
		<summary class="min-h-11 cursor-pointer py-2 font-bold text-neutral-100"
			>Six ideas the controls expose</summary
		>
		<dl class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			<div>
				<dt class="font-bold text-cyan-200">Selection pressure</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Conditions change which inherited variants leave descendants.
				</dd>
			</div>
			<div>
				<dt class="font-bold text-cyan-200">Mutation</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Random bounded variation enters when offspring inherit a genome.
				</dd>
			</div>
			<div>
				<dt class="font-bold text-cyan-200">Inheritance</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Offspring begin with their parent's traits before mutation.
				</dd>
			</div>
			<div>
				<dt class="font-bold text-cyan-200">Fitness</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Here it means leaving surviving offspring, not strength or worth.
				</dd>
			</div>
			<div>
				<dt class="font-bold text-cyan-200">Drift</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Finite populations let chance change trait frequencies.
				</dd>
			</div>
			<div>
				<dt class="font-bold text-cyan-200">Carrying capacity</dt>
				<dd class="m-0 text-xs text-neutral-400">
					Food, energy costs, competition, and mortality shape an emergent sustainable population.
					The separate population cap is only a browser safety limit.
				</dd>
			</div>
		</dl>
	</details>
	<p id="advance-fixed-time-help" class="sr-only">
		Pauses the live run and advances exactly 240 fixed simulation ticks, equal to 8 simulated
		seconds.
	</p>
</section>

<style>
	.lab-button {
		min-height: 2.75rem;
		border: 1px solid #525252;
		border-radius: 0.5rem;
		background: #171717;
		padding: 0.55rem 0.8rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: #f5f5f5;
	}

	.lab-button:hover {
		border-color: #a3a3a3;
		background: #262626;
	}

	.lab-button-primary {
		border-color: #67e8f9;
		background: #a5f3fc;
		color: #0a0a0a;
	}

	.control-dial::before {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background: conic-gradient(
			from -135deg,
			#67e8f9 var(--dial-angle),
			#262626 0 270deg,
			transparent 270deg
		);
		content: '';
	}

	.control-dial::after {
		position: absolute;
		inset: 0.28rem;
		border-radius: 9999px;
		background: #0a0a0a;
		content: '';
	}

	@media (prefers-reduced-motion: reduce) {
		.lab-button {
			transition: none;
		}
	}
</style>
