<script lang="ts">
	let {
		tide,
		onchange,
		id = 'bias-tide'
	}: {
		tide: number;
		onchange: (tide: number) => void;
		id?: string;
	} = $props();

	let description = $derived(
		tide < 0.34
			? 'High tide · individual bias names'
			: tide < 0.7
				? 'Middle tide · related families'
				: 'Low tide · shared mechanisms'
	);
</script>

<div class="tide-control">
	<div class="tide-heading">
		<label for={id}>Tide of explanation</label>
		<output for={id}>{description}</output>
	</div>
	<input
		{id}
		type="range"
		min="0"
		max="1"
		step="0.01"
		value={tide}
		oninput={(event) => onchange(Number(event.currentTarget.value))}
		aria-valuetext={description}
	/>
	<div class="tide-labels" aria-hidden="true">
		<span>Individual names</span>
		<span>Related families</span>
		<span>Shared mechanisms</span>
	</div>
</div>

<style>
	.tide-control {
		padding: 0.9rem 1rem 0.75rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.7rem;
		background: color-mix(in srgb, var(--arch-panel) 92%, transparent);
		box-shadow: 0 0.7rem 2rem rgb(2 18 24 / 18%);
	}

	.tide-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.55rem;
	}

	label {
		font-family: var(--arch-serif);
		font-size: 0.98rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	output {
		color: var(--arch-muted);
		font-size: 0.69rem;
		letter-spacing: 0.08em;
		text-align: right;
		text-transform: uppercase;
	}

	input {
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		accent-color: var(--arch-accent);
		cursor: ew-resize;
	}

	.tide-labels {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		margin-top: 0.35rem;
		color: var(--arch-muted);
		font-size: 0.65rem;
		line-height: 1.2;
	}

	.tide-labels span:nth-child(2) {
		text-align: center;
	}

	.tide-labels span:last-child {
		text-align: right;
	}

	@media (max-width: 39rem) {
		.tide-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.15rem;
		}

		output {
			text-align: left;
		}
	}
</style>
