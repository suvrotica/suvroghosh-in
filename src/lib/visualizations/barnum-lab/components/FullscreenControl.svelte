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
		? available
			? 'Exit Barnum laboratory full screen'
			: 'Collapse Barnum laboratory'
		: available
			? 'Open Barnum laboratory full screen'
			: 'Expand Barnum laboratory in the page'}
	onclick={(event) => (active ? onexit() : onenter(event.currentTarget))}
>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if active}
			<path d="m8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
		{:else}
			<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
		{/if}
	</svg>
	<span>{active ? 'Exit' : available ? 'Full-screen lab' : 'Expand lab'}</span>
</button>
