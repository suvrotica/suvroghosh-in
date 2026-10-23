<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks, youtubeProfile } from '$lib/config/links';
</script>

<section class="fb-closing" aria-labelledby="home-invitation-heading" data-home-invitation>
	<div class="fb-closing__mark" aria-hidden="true">↗</div>
	<div class="fb-closing__content">
		<p class="fb-closing__eyebrow">The notebook stays open.</p>
		<h2 id="home-invitation-heading">Follow a little <em>curiosity.</em></h2>
		<p>
			There’s always another idea to explore. Questions, corrections and thoughtful disagreements
			are welcome.
		</p>
		<p>Need help with software or data? I also work with businesses on small, agreed projects.</p>
		<nav aria-label="Follow or contact Suvro Ghosh">
			<a class="fb-closing__contact" href={resolve('/contact')}
				>Get in touch <span aria-hidden="true">↗</span></a
			>
			<a href={resolve('/about')}>About Suvro</a>
			<a href={resolve('/consulting')}>Services &amp; partnerships</a>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a href={youtubeProfile.url} target="_blank" rel="noopener noreferrer"
				>Videos <span aria-hidden="true">↗</span><span class="sr-only">, opens in a new tab</span
				></a
			>
			<a href={substackLinks.subscribe} target="_blank" rel="noopener noreferrer"
				>Newsletter <span aria-hidden="true">↗</span><span class="sr-only"
					>, opens in a new tab</span
				></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</div>
	<p class="fb-closing__location">Made with curiosity.<br />Rooted in Calcutta.</p>
</section>

<style>
	.fb-closing {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 2.5rem;
		align-items: start;
		padding-block: clamp(3rem, 7vw, 6rem) 2rem;
		border-top: 1px solid var(--fb-rule);
	}
	.fb-closing__mark {
		color: var(--fb-accent);
		font: 400 clamp(4rem, 7vw, 6rem)/0.9 var(--fb-serif);
	}
	.fb-closing__eyebrow {
		margin: 0 0 1rem;
		color: var(--fb-muted);
		font: 400 0.65rem/1.5 var(--fb-mono);
	}
	.fb-closing h2 {
		margin: 0;
		font: 450 clamp(2.4rem, 4.5vw, 4.2rem)/1 var(--fb-serif);
		letter-spacing: -0.04em;
	}
	.fb-closing h2 em {
		font-weight: 420;
		color: var(--fb-teal);
	}
	.fb-closing__content > p:not(.fb-closing__eyebrow) {
		max-width: 48ch;
		margin: 1.2rem 0 1.4rem;
		color: var(--fb-muted);
		font: 400 0.93rem/1.7 var(--fb-sans);
	}
	.fb-closing nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.5rem;
	}
	.fb-closing nav a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.6rem;
		color: var(--fb-ink);
		font: 500 0.78rem/1.5 var(--fb-sans);
		text-decoration: none;
	}
	.fb-closing nav a:hover {
		color: var(--fb-accent);
	}
	.fb-closing nav a.fb-closing__contact {
		border-bottom: 1px solid var(--fb-ink);
	}
	.fb-closing__location {
		margin: 2rem 0 0;
		color: var(--fb-muted);
		font: 400 0.59rem/1.9 var(--fb-mono);
	}
	@media (max-width: 48rem) {
		.fb-closing {
			grid-template-columns: 1fr;
			gap: 1.25rem;
		}
		.fb-closing__mark {
			font-size: 3rem;
		}
		.fb-closing__location {
			margin: 0.5rem 0 0;
		}
	}
</style>
