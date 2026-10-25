<script lang="ts">
	let {
		label,
		value,
		min = 0,
		max = 1,
		step = 0.01,
		reset = 0,
		hint = '',
		onchange
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		reset?: number;
		hint?: string;
		onchange: (value: number) => void;
	} = $props();
	const id = $props.id();
	const angle = $derived(-135 + ((value - min) / (max - min)) * 270);
	const precision = $derived(step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
	let startY = 0;
	let startValue = 0;
	function turn(event: PointerEvent) {
		if (!event.buttons) return;
		const next = startValue + ((startY - event.clientY) / 140) * (max - min);
		onchange(Math.max(min, Math.min(max, Math.round(next / step) * step)));
	}
	function key(event: KeyboardEvent) {
		let next = value;
		if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next += step;
		else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next -= step;
		else if (event.key === 'Home') next = min;
		else if (event.key === 'End') next = max;
		else return;
		event.preventDefault();
		onchange(Math.max(min, Math.min(max, next)));
	}
	function update(event: Event) {
		const next = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (Number.isFinite(next)) onchange(Math.min(max, Math.max(min, next)));
	}
</script>

<div class="optics-knob">
	<div class="knob-heading">
		<label for={id}>{label}</label><button
			type="button"
			aria-label={`Reset ${label}`}
			onclick={() => onchange(reset)}
			title={`Reset ${label}`}>↺</button
		>
	</div>
	<div class="knob-body">
		<button
			type="button"
			class="knob-turn"
			aria-label={`Turn ${label} knob, current value ${value.toFixed(precision)}`}
			title="Drag up or down, or use the arrow keys"
			onpointerdown={(event) => {
				startY = event.clientY;
				startValue = value;
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onpointermove={turn}
			onkeydown={key}
		>
			<svg viewBox="0 0 76 76" aria-hidden="true">
				<circle class="knob-track" cx="38" cy="38" r="32" />
				{#each [-135, -90, -45, 0, 45, 90, 135] as tick}<path
						class="knob-tick"
						d="M38 3v4"
						transform={`rotate(${tick} 38 38)`}
					/>{/each}
				<circle class="knob-shadow" cx="38" cy="40" r="25" />
				<circle class="knob-face" cx="38" cy="38" r="24" />
				<circle class="knob-inner" cx="38" cy="38" r="19" />
				<path class="knob-pointer" d="M38 19v10" transform={`rotate(${angle} 38 38)`} />
				<circle class="knob-hub" cx="38" cy="38" r="2" />
			</svg>
		</button>
		<input
			aria-label={`${label} value`}
			type="number"
			{min}
			{max}
			{step}
			value={Number(value.toFixed(precision))}
			oninput={update}
		/>
	</div>
	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		{value}
		oninput={update}
		aria-describedby={`${id}-hint`}
	/>
	<span id={`${id}-hint`} class="knob-hint">{hint}</span>
</div>
