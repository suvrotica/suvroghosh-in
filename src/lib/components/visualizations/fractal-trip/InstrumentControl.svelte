<script lang="ts">
	let {
		label,
		value,
		min = 0,
		max = 1,
		step = 0.01,
		hint = '',
		dial = false,
		onvalue,
		onstart = () => {}
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		hint?: string;
		dial?: boolean;
		onvalue: (value: number) => void;
		onstart?: () => void;
	} = $props();
	const uid = $props.id();
	let drag: { y: number; value: number; id: number } | null = null;
	let angle = $derived(-135 + (270 * (value - min)) / (max - min));
	let decimals = $derived(Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)))));
	function change(next: number) {
		if (!Number.isFinite(next)) return;
		onvalue(Number(Math.max(min, Math.min(max, Math.round(next / step) * step)).toFixed(decimals)));
	}
	function key(event: KeyboardEvent) {
		if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
			return;
		event.preventDefault();
		onstart();
		if (event.key === 'Home') change(min);
		else if (event.key === 'End') change(max);
		else
			change(
				value +
					(['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1) *
						step *
						(event.shiftKey ? 10 : 1)
			);
	}
</script>

<div class:ft-dial-control={dial} class="ft-control">
	<div class="ft-control-caption">
		<label for={`${uid}-range`}>{label}</label><input
			aria-label={`${label} value`}
			type="number"
			{min}
			{max}
			{step}
			value={Number(value.toFixed(decimals))}
			onfocus={onstart}
			onchange={(event) => change(event.currentTarget.valueAsNumber)}
		/>
	</div>
	{#if dial}
		<button
			type="button"
			class="ft-knob"
			aria-label={`Adjust ${label.toLowerCase()}`}
			title={`Drag up or down to change ${label.toLowerCase()}`}
			style={`--knob-angle:${angle}deg`}
			onkeydown={key}
			onpointerdown={(event) => {
				event.preventDefault();
				onstart();
				drag = { y: event.clientY, value, id: event.pointerId };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onpointermove={(event) => {
				if (drag?.id === event.pointerId)
					change(drag.value + ((drag.y - event.clientY) / 160) * (max - min));
			}}
			onpointerup={() => {
				drag = null;
			}}
			onpointercancel={() => {
				drag = null;
			}}><span></span></button
		>
	{/if}
	<input
		id={`${uid}-range`}
		class="ft-range"
		type="range"
		{min}
		{max}
		{step}
		{value}
		onpointerdown={onstart}
		onkeydown={(event) => {
			if (
				event.key.startsWith('Arrow') ||
				['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
			)
				onstart();
		}}
		oninput={(event) => change(event.currentTarget.valueAsNumber)}
	/>
	{#if hint}<p class="ft-control-hint">{hint}</p>{/if}
</div>
