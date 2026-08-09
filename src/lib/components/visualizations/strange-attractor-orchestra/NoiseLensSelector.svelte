<script lang="ts">
	type Props = {
		noise: string;
		lens: string;
		influence: number;
		disabled?: boolean;
		onnoise: (value: string) => void;
		onlens: (value: string) => void;
		oninfluence: (value: number) => void;
	};

	let { noise, lens, influence, disabled = false, onnoise, onlens, oninfluence }: Props = $props();

	const noiseOptions = [
		['smooth', 'Smooth atmosphere'],
		['curl', 'Curl weather'],
		['cellular', 'Cellular glass'],
		['ridged', 'Ridged mineral']
	] as const;
	const lenses = [
		['dye', 'Dye'],
		['warp', 'Warp'],
		['wake', 'Wake']
	] as const;
</script>

<fieldset class="weather" {disabled}>
	<legend>Weather</legend>
	<label>
		<span>Noise family</span>
		<select value={noise} onchange={(event) => onnoise(event.currentTarget.value)}>
			{#each noiseOptions as option (option[0])}
				<option value={option[0]}>{option[1]}</option>
			{/each}
		</select>
	</label>
	<div class="lens-group" aria-label="Noise lens">
		{#each lenses as option (option[0])}
			<button type="button" aria-pressed={lens === option[0]} onclick={() => onlens(option[0])}
				>{option[1]}</button
			>
		{/each}
	</div>
	<label class="influence">
		<span>Influence <output>{Math.round(influence * 100)}%</output></span>
		<input
			type="range"
			min="0"
			max="0.8"
			step="0.01"
			value={influence}
			aria-label="Noise influence"
			oninput={(event) => oninfluence(Number(event.currentTarget.value))}
		/>
	</label>
</fieldset>

<style>
	.weather {
		display: grid;
		min-width: 0;
		gap: 0.55rem;
		border: 0;
		padding: 0;
	}

	legend,
	label > span {
		color: #8da5a4;
		font: 700 0.65rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	label {
		display: grid;
		gap: 0.32rem;
	}

	select,
	button {
		min-height: 2.75rem;
		border: 1px solid rgb(223 220 203 / 24%);
		border-radius: 0.42rem;
		background: #0a1013;
		color: #e9e5d8;
		font: 650 0.76rem/1 var(--font-sans, sans-serif);
	}

	select {
		padding-inline: 0.7rem;
	}

	.lens-group {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.32rem;
	}

	button {
		padding: 0.55rem;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		border-color: #75c9cc;
		background: #183134;
		color: #d7fbfa;
	}

	.influence span {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	output {
		color: #d0c8b4;
	}

	input {
		min-height: 1.6rem;
		width: 100%;
		accent-color: #75c9cc;
	}

	select:focus-visible,
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}
</style>
