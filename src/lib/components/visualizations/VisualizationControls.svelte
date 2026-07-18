<script lang="ts">
	import ParameterSlider from './ParameterSlider.svelte';
	import type {
		VisualizationDefinition,
		VisualizationParameters,
		VisualizationValue
	} from '$lib/visualizations/types';

	type Props = {
		definition: VisualizationDefinition;
		parameters: VisualizationParameters;
		playing: boolean;
		isFullscreen: boolean;
		controlPrefix: string;
		reducedMotion: boolean;
		onchange: (id: string, value: VisualizationValue) => void;
		onpreset: (id: string) => void;
		onplaytoggle: () => void;
		onreset: () => void;
		onrestart: () => void;
		onfullscreen: () => void;
	};

	let {
		definition,
		parameters,
		playing,
		isFullscreen,
		controlPrefix,
		reducedMotion,
		onchange,
		onpreset,
		onplaytoggle,
		onreset,
		onrestart,
		onfullscreen
	}: Props = $props();

	function presetIsActive(values: VisualizationParameters) {
		return Object.entries(values).every(([id, value]) => parameters[id] === value);
	}
</script>

<div class="border-t border-neutral-700 bg-neutral-950 p-4 text-neutral-100 sm:p-5">
	<div
		class="flex flex-col gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="flex flex-wrap gap-2" aria-label="Playback controls">
			<button
				type="button"
				onclick={onplaytoggle}
				class="inline-flex min-h-11 items-center rounded-md bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
				aria-pressed={playing}
			>
				{playing ? 'Pause' : 'Start'}
			</button>
			<button
				type="button"
				onclick={onrestart}
				class="inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 py-2 text-sm font-semibold hover:border-neutral-500 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
			>
				Restart motion
			</button>
			<button
				type="button"
				onclick={onreset}
				class="inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 py-2 text-sm font-semibold hover:border-neutral-500 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
			>
				Reset all
			</button>
		</div>
		<button
			type="button"
			onclick={onfullscreen}
			class="inline-flex min-h-11 w-fit items-center rounded-md border border-neutral-700 px-3 py-2 text-sm font-semibold hover:border-neutral-500 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
		>
			{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
		</button>
	</div>

	<div class="py-4">
		<p class="!mb-2 !text-left text-xs font-bold tracking-[0.14em] !text-neutral-400 uppercase">
			Presets
		</p>
		<div class="flex flex-wrap gap-2">
			{#each definition.presets as preset (preset.id)}
				<button
					type="button"
					onclick={() => onpreset(preset.id)}
					aria-pressed={presetIsActive(preset.values)}
					class="min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors aria-pressed:border-cyan-300 aria-pressed:bg-cyan-300 aria-pressed:text-neutral-950 {presetIsActive(
						preset.values
					)
						? 'border-cyan-300 bg-cyan-300 text-neutral-950'
						: 'border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-900'}"
					title={preset.description}
				>
					{preset.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-5 border-t border-neutral-800 pt-5 sm:grid-cols-2">
		{#each definition.parameters as parameter (parameter.id)}
			{@const id = `${controlPrefix}-${parameter.id}`}
			{#if parameter.type === 'range'}
				<ParameterSlider
					{id}
					{parameter}
					value={Number(parameters[parameter.id])}
					onchange={(value) => onchange(parameter.id, value)}
				/>
			{:else if parameter.type === 'number'}
				<label for={id} class="grid content-start gap-2 text-sm font-semibold text-neutral-200">
					<span>{parameter.label}</span>
					<input
						{id}
						type="number"
						min={parameter.min}
						max={parameter.max}
						step={parameter.step}
						value={Number(parameters[parameter.id])}
						onchange={(event) =>
							onchange(parameter.id, Number((event.currentTarget as HTMLInputElement).value))}
						aria-describedby={`${id}-description`}
						class="h-11 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					/>
					<span
						id={`${id}-description`}
						class="text-xs leading-relaxed font-normal text-neutral-400"
					>
						{parameter.description}
					</span>
				</label>
			{:else if parameter.type === 'select'}
				<label for={id} class="grid content-start gap-2 text-sm font-semibold text-neutral-200">
					<span>{parameter.label}</span>
					<select
						{id}
						value={String(parameters[parameter.id])}
						onchange={(event) =>
							onchange(parameter.id, (event.currentTarget as HTMLSelectElement).value)}
						aria-describedby={`${id}-description`}
						class="h-11 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					>
						{#each parameter.options as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<span
						id={`${id}-description`}
						class="text-xs leading-relaxed font-normal text-neutral-400"
					>
						{parameter.description}
					</span>
				</label>
			{:else}
				<label
					for={id}
					class="flex min-h-24 items-start gap-3 rounded-md border border-neutral-800 p-3"
				>
					<input
						{id}
						type="checkbox"
						checked={Boolean(parameters[parameter.id])}
						onchange={(event) =>
							onchange(parameter.id, (event.currentTarget as HTMLInputElement).checked)}
						class="mt-1 h-5 w-5 shrink-0 accent-cyan-300"
					/>
					<span>
						<span class="block text-sm font-semibold text-neutral-200">{parameter.label}</span>
						<span class="mt-1 block text-xs leading-relaxed font-normal text-neutral-400">
							{parameter.description}
						</span>
					</span>
				</label>
			{/if}
		{/each}
	</div>

	{#if reducedMotion}
		<p class="!mt-4 !mb-0 !text-left text-xs !text-neutral-400">
			Motion was paused because your device requests reduced motion. Start plays it only after your
			explicit action.
		</p>
	{/if}
</div>
