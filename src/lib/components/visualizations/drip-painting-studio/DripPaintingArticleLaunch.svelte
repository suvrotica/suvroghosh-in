<script lang="ts">
	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';

	const embeddedInStudio = getContext<boolean>('drip-painting-studio-embedded-article') === true;
</script>

{#if !embeddedInStudio}
	<aside class="drip-launch-card" data-tts-exclude aria-label="Interactive Drip Painting Studio">
		<div class="drip-launch-copy">
			<p class="drip-launch-eyebrow">Interactive Studio</p>
			<p class="drip-launch-title">
				Hold the path steady. Change the flow, passes, sweep, and layers—and watch single gestures
				tangle into an opaque web.
			</p>
			<p class="drip-launch-sub">
				Open the fullscreen Drip Painting Studio to run the four non-figurative studies on unprimed
				cotton-duck cloth, compare thin and heavy flow over a fixed seed, inspect dried enamel
				ridges up close, and export a 4096 px PNG.
			</p>
		</div>
		<a class="drip-launch-btn" href={resolve('/tools/drip-painting-studio')}>
			Open painting studio
		</a>
	</aside>
{/if}

<style>
	.drip-launch-card {
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

	.drip-launch-copy {
		flex: 1 1 18rem;
	}

	.drip-launch-eyebrow {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #1e526b;
	}

	.drip-launch-title {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 650;
		line-height: 1.35;
		color: #1c1b1a;
	}

	.drip-launch-sub {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #38362f;
	}

	.drip-launch-btn {
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

	.drip-launch-btn:hover,
	.drip-launch-btn:focus-visible {
		background: #a8342a;
		color: #ffffff;
	}

	.drip-launch-btn:focus-visible {
		outline: 2px solid #1e526b !important;
		outline-color: #1e526b !important;
		outline-offset: 2px;
	}

	@media (forced-colors: active) {
		.drip-launch-btn:focus-visible {
			outline: 2px solid Highlight !important;
			outline-color: Highlight !important;
		}
	}
</style>
