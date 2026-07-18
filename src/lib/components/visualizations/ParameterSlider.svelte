<script lang="ts">
	import type { RangeParameter } from '$lib/visualizations/types';

	type Props = {
		id: string;
		parameter: RangeParameter;
		value: number;
		onchange: (value: number) => void;
	};

	let { id, parameter, value, onchange }: Props = $props();

	function updateValue(event: Event) {
		onchange(Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

<label for={id} class="grid gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
	<span class="flex items-baseline justify-between gap-3">
		<span>{parameter.label}</span>
		<output for={id} class="font-mono text-xs font-medium text-neutral-500 dark:text-neutral-400">
			{value.toFixed(parameter.step < 0.1 ? 2 : parameter.step < 1 ? 1 : 0)}{parameter.unit ?? ''}
		</output>
	</span>
	<input
		{id}
		type="range"
		min={parameter.min}
		max={parameter.max}
		step={parameter.step}
		{value}
		oninput={updateValue}
		aria-describedby={`${id}-description`}
		class="h-11 w-full cursor-pointer accent-neutral-800 dark:accent-neutral-200"
	/>
	<span
		id={`${id}-description`}
		class="text-xs leading-relaxed font-normal text-neutral-500 dark:text-neutral-400"
	>
		{parameter.description}
	</span>
</label>
