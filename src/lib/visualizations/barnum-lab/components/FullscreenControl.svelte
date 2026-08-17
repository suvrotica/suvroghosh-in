<script lang="ts">
	let {
		active = false,
		available = false,
		onenter,
		onexit
	}: {
		active?: boolean;
		available?: boolean;
		onenter: (trigger: HTMLButtonElement) => void;
		onexit: () => void;
	} = $props();
</script>

<button
	type="button"
	data-testid="barnum-fullscreen"
	class:exit={active}
	aria-label={active
		? 'Exit Barnum laboratory focus mode'
		: available
			? 'Open Barnum laboratory fullscreen'
			: 'Open Barnum laboratory focus mode'}
	onclick={(event) => (active ? onexit() : onenter(event.currentTarget))}
>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if active}
			<path d="m8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
		{:else}
			<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
		{/if}
	</svg>
	<span>{active ? 'Exit' : available ? 'Full-screen lab' : 'Focus mode'}</span>
</button>

<style>
	button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.4rem;
		background: var(--barnum-raised);
		padding: 0.48rem 0.65rem;
		color: var(--barnum-ink);
		font: 750 0.75rem/1.25 var(--barnum-sans);
		cursor: pointer;
	}

	button:hover,
	button.exit {
		border-color: var(--barnum-blue);
		color: var(--barnum-blue-text);
	}

	button:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
	}

	@media (max-width: 27rem) {
		button span {
			display: none;
		}
	}

	@media (forced-colors: active) {
		button {
			border-color: ButtonText;
		}
	}
</style>
