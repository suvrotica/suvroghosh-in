<script lang="ts">
	import { getContext } from 'svelte';

	const embeddedInStudio = getContext<boolean>('pointillism-studio-embedded-article') === true;
</script>

{#if !embeddedInStudio}
	<aside
		class="pointillism-launch-card"
		data-tts-exclude
		aria-label="Interactive Pointillism painting studio"
	>
		<div class="pointillism-launch-copy">
			<p class="pointillism-launch-eyebrow">Interactive Studio</p>
			<p class="pointillism-launch-title">
				Choose a Texas scene. Change the dots and colors. Watch the picture emerge.
			</p>
			<p class="pointillism-launch-sub">
				Open the fullscreen Pointillism studio to generate everyday San Antonio and Hill Country
				scenes, inspect individual oil-paint dabs up close, adjust dot size and spacing, and save a
				high-resolution PNG.
			</p>
		</div>
		<a class="pointillism-launch-btn" href="/tools/pointillism-studio">Open painting studio</a>
	</aside>
{/if}

<style>
	.pointillism-launch-card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 1.5rem;
		margin: 1.25rem 0 2rem;
		padding: 1.15rem 1.35rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(25, 24, 21, 0.18);
		background: #f3efe4;
		color: #191815;
	}

	.pointillism-launch-copy {
		flex: 1 1 18rem;
	}

	.pointillism-launch-eyebrow {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #265c73;
	}

	.pointillism-launch-title {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 650;
		line-height: 1.35;
		color: #191815;
	}

	.pointillism-launch-sub {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #38362f;
	}

	.pointillism-launch-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.6rem 1.1rem;
		border-radius: 0.5rem;
		background: #191815;
		color: #f6f3eb;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 140ms ease;
	}

	.pointillism-launch-btn:hover,
	.pointillism-launch-btn:focus-visible {
		background: #b85238;
		color: #ffffff;
	}
</style>
