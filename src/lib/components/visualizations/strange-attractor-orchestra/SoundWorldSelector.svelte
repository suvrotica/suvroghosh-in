<script lang="ts">
	type Option = { id: string; name: string; description: string };
	type Props = {
		options: readonly Option[];
		value: string;
		disabled?: boolean;
		onchange: (value: string) => void;
	};

	let { options, value, disabled = false, onchange }: Props = $props();
	let active = $derived(options.find((option) => option.id === value));
</script>

<label class="sound-world">
	<span>Voice · sound world</span>
	<select
		{value}
		{disabled}
		aria-describedby="sa-sound-description"
		onchange={(event) => onchange(event.currentTarget.value)}
	>
		{#each options as option (option.id)}
			<option value={option.id}>{option.name}</option>
		{/each}
	</select>
	<small id="sa-sound-description">{active?.description ?? ''}</small>
</label>

<style>
	.sound-world {
		display: grid;
		gap: 0.32rem;
	}

	span,
	small {
		font-family: var(--font-mono, monospace);
	}

	span {
		color: #8da5a4;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	select {
		min-height: 2.9rem;
		width: 100%;
		border: 1px solid rgb(223 220 203 / 24%);
		border-radius: 0.45rem;
		background: #0a1013;
		padding: 0.55rem 2rem 0.55rem 0.7rem;
		color: #eee9db;
		font: 650 0.82rem/1.2 var(--font-sans, sans-serif);
	}

	select:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	small {
		min-height: 2.7em;
		color: #778482;
		font-size: 0.61rem;
		line-height: 1.35;
	}
</style>
