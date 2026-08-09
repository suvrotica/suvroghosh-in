<script lang="ts">
	type Option = { id: string; name: string; family: string; warning?: string };
	type Props = {
		options: readonly Option[];
		value: string;
		disabled?: boolean;
		onchange: (value: string) => void;
	};

	let { options, value, disabled = false, onchange }: Props = $props();
	let selected = $derived(options.find((option) => option.id === value));

	function move(offset: number): void {
		const index = Math.max(
			0,
			options.findIndex((option) => option.id === value)
		);
		const next = options[(index + offset + options.length) % options.length];
		if (next) onchange(next.id);
	}
</script>

<label class="selector">
	<span>Attractor</span>
	<select
		{value}
		{disabled}
		aria-describedby="sa-attractor-family"
		onchange={(event) => onchange(event.currentTarget.value)}
		onkeydown={(event) => {
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				move(-1);
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				move(1);
			}
		}}
	>
		{#each options as option (option.id)}
			<option value={option.id}>{option.name}</option>
		{/each}
	</select>
	<small id="sa-attractor-family">
		{selected?.family ?? 'dynamical system'}{selected?.warning ? ` · ${selected.warning}` : ''}
	</small>
</label>

<style>
	.selector {
		display: grid;
		min-width: min(100%, 15rem);
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
		min-height: 2.2em;
		color: #778482;
		font-size: 0.61rem;
		line-height: 1.35;
	}
</style>
