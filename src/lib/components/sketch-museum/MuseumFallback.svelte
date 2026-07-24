<script lang="ts">
	type Props = {
		message?: string;
	};

	let {
		message = 'This browser cannot open the three-dimensional gallery, but every sketch and its details remain available in the collection.'
	}: Props = $props();
</script>

<div class="museum-fallback" role="status">
	<div aria-hidden="true" class="fallback-mark">□</div>
	<div>
		<h3>Museum View is unavailable</h3>
		<p>{message}</p>
		<a href="#sketch-collection">Continue to the accessible collection</a>
	</div>
</div>

<style>
	.museum-fallback {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		align-items: start;
		padding: clamp(1.1rem, 4vw, 2rem);
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: var(--paper-soft);
		color: var(--ink);
	}

	.fallback-mark {
		display: grid;
		width: 3rem;
		height: 3rem;
		place-items: center;
		border: 0.2rem double var(--ink-faint);
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: 1.3rem;
	}

	h3 {
		margin: 0 0 0.4rem;
		font-size: 1.1rem;
	}

	p {
		margin: 0 0 0.8rem;
		color: var(--ink-muted);
		font-size: 0.92rem;
		line-height: 1.55;
		text-align: left;
	}

	a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		font-size: 0.86rem;
		font-weight: 750;
		text-underline-offset: 0.25rem;
	}
</style>
