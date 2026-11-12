<script lang="ts">
	import { getContext } from 'svelte';

	const embeddedInStudio = getContext<boolean>('mondrian-studio-embedded-article') === true;
</script>

{#if !embeddedInStudio}
	<aside class="mondrian-launch-card" data-tts-exclude aria-label="Interactive painting studio">
		<div class="mondrian-launch-copy">
			<p class="mondrian-launch-eyebrow">Interactive Studio</p>
			<p class="mondrian-launch-title">
				Change the spacing, color, and paint. Watch a new composition take shape.
			</p>
			<p class="mondrian-launch-sub">
				Open the fullscreen Mondrian-inspired painting generator to adjust proportions, primary
				color balance, line weight, and oil-on-canvas brushwork, then export a high-resolution PNG.
			</p>
		</div>
		<a class="mondrian-launch-btn" href="/tools/mondrian-studio">Open painting studio</a>
	</aside>
{/if}

<style>
	.mondrian-launch-card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 1.5rem;
		margin: 1.25rem 0 2rem;
		padding: 1.15rem 1.35rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(23, 23, 20, 0.18);
		background: #f3efe3;
		color: #171714;
	}

	.mondrian-launch-copy {
		flex: 1 1 18rem;
	}

	.mondrian-launch-eyebrow {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #245294;
	}

	.mondrian-launch-title {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 650;
		line-height: 1.35;
		color: #171714;
	}

	.mondrian-launch-sub {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #35342e;
	}

	.mondrian-launch-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.6rem 1.1rem;
		border-radius: 0.5rem;
		background: #171714;
		color: #f3efe3;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 140ms ease;
	}

	.mondrian-launch-btn:hover,
	.mondrian-launch-btn:focus-visible {
		background: #c83b30;
		color: #ffffff;
	}
</style>
