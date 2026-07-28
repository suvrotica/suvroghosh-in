<script lang="ts">
	let {
		text,
		position = 'top'
	}: {
		text: string;
		position?: 'top' | 'bottom';
	} = $props();
</script>

<div class="comic-caption comic-caption--{position}" aria-hidden="true">
	{text}
</div>

<style>
	.comic-caption {
		position: absolute;
		z-index: 30;
		right: 0.55rem;
		left: 0.55rem;
		width: fit-content;
		max-width: calc(100% - 1.1rem);
		border: 2px solid var(--comic-ink, #1e1a16);
		background: var(--comic-caption, #f1d996);
		padding: 0.38rem 0.55rem;
		color: var(--comic-ink, #1e1a16);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: clamp(0.68rem, 1.4vw, 0.95rem);
		font-weight: 650;
		line-height: 1.2;
		box-shadow: 2px 2px 0 rgb(30 26 22 / 0.18);
	}

	.comic-caption--top {
		top: 0.55rem;
	}

	.comic-caption--bottom {
		bottom: 0.55rem;
	}
</style>
