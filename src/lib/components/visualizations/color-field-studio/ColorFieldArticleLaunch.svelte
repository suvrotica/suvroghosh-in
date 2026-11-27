<script lang="ts">
	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';

	const embeddedInStudio = getContext<boolean>('color-field-studio-embedded-article') === true;
</script>

{#if !embeddedInStudio}
	<aside class="cf-launch-card" data-tts-exclude aria-label="Interactive Color Field Studio">
		<div class="cf-launch-copy">
			<p class="cf-launch-eyebrow">Interactive Studio</p>
			<p class="cf-launch-title">
				Layer broad fields of pigment, soften their boundaries, and watch successive glazes deepen
				over woven canvas.
			</p>
			<p class="cf-launch-sub">
				Open the fullscreen Color Field Studio to explore stacked multiform and soak-stain studies,
				vary color areas, area size, edge softness, and paint transparency, inspect the canvas weave
				close up, and export a 4096 px PNG.
			</p>
		</div>
		<a class="cf-launch-btn" href={resolve('/tools/color-field-studio')}> Open painting studio </a>
	</aside>
{/if}

<style>
	.cf-launch-card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 1.5rem;
		margin: 1.25rem 0 2rem;
		padding: 1.15rem 1.35rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(28, 27, 26, 0.18);
		background: #f3efe4;
		color: #1c1b1a;
	}

	.cf-launch-copy {
		flex: 1 1 18rem;
	}

	.cf-launch-eyebrow {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #1e526b;
	}

	.cf-launch-title {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 650;
		line-height: 1.35;
		color: #1c1b1a;
	}

	.cf-launch-sub {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #38362f;
	}

	.cf-launch-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.6rem 1.1rem;
		border-radius: 0.5rem;
		background: #1c1b1a;
		color: #f6f3eb;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 140ms ease;
	}

	.cf-launch-btn:hover,
	.cf-launch-btn:focus-visible {
		background: #6e2326;
		color: #ffffff;
	}

	.cf-launch-btn:focus-visible {
		outline: 2px solid #1e526b !important;
		outline-color: #1e526b !important;
		outline-offset: 2px;
	}

	@media (forced-colors: active) {
		.cf-launch-btn:focus-visible {
			outline: 2px solid Highlight !important;
			outline-color: Highlight !important;
		}
	}
</style>
