<script lang="ts">
	type Props = {
		reason?: 'viewport' | 'save-data' | 'failure';
		showLoad?: boolean;
		onloadinteractive?: () => void;
	};

	let { reason = 'viewport', showLoad = false, onloadinteractive }: Props = $props();

	let explanation = $derived(
		reason === 'save-data'
			? 'Data saving is active, so the cinematic scene has not been requested.'
			: reason === 'failure'
				? 'The live stage could not continue safely, so this static scientific route is active.'
				: 'This model needs a wider stage. The scientific essay continues below.'
	);
</script>

<section
	class="portrait-poster"
	data-testid="weather-portrait-poster"
	aria-labelledby="wn-poster-heading"
>
	<picture>
		<source
			type="image/avif"
			srcset="
				/images/weather-inside-nucleus/portrait/weather-nucleus-360.avif 360w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-390.avif 390w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-412.avif 412w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-540.avif 540w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-824.avif 824w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-1080.avif 1080w
			"
			sizes="(max-width: 540px) 100vw, 540px"
		/>
		<source
			type="image/webp"
			srcset="
				/images/weather-inside-nucleus/portrait/weather-nucleus-360.webp 360w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-390.webp 390w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-412.webp 412w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-540.webp 540w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-824.webp 824w,
				/images/weather-inside-nucleus/portrait/weather-nucleus-1080.webp 1080w
			"
			sizes="(max-width: 540px) 100vw, 540px"
		/>
		<img
			src="/images/weather-inside-nucleus/portrait/weather-nucleus-540.webp"
			width="540"
			height="720"
			alt="EGF remains outside a membrane receptor; local activity regions change in sequence before a separate nuclear response, an enlarged enhancer–promoter locus, and a field of silent and bursting histories."
			loading="eager"
			fetchpriority="high"
			decoding="async"
		/>
	</picture>

	<div class="poster-copy">
		<p class="eyebrow">Static scientific route</p>
		<h2 id="wn-poster-heading">Weather Inside the Nucleus</h2>
		<p>{explanation}</p>
		<p class="orientation-note">Open on a landscape tablet or larger screen to intervene.</p>
		<p class="poster-meta">
			By Suvro Ghosh · Updated <time datetime="2026-08-09">9 August 2026</time>
		</p>
		{#if showLoad}
			<button type="button" onclick={onloadinteractive}>Load interactive version</button>
		{/if}
		<details>
			<summary>Read the causal transcript</summary>
			<ol>
				<li>EGF stays outside and activates the membrane-bound EGFR receptor.</li>
				<li>Separate local activity changes relay a consequence inside the cell.</li>
				<li>A modeled nuclear activity proxy responds; no molecule is shown crossing a pore.</li>
				<li>The view cuts from cell to nucleus to locus; it is not a continuous zoom.</li>
				<li>Signaling and chromatin geometry remain independent model histories.</li>
				<li>A close enhancer–promoter encounter can remain silent.</li>
				<li>One valid history later contains three modeled transcription-initiation events.</li>
				<li>
					Across 48 histories, increased contact shifts a distribution without commanding one
					outcome.
				</li>
			</ol>
		</details>
	</div>
</section>

<style>
	.portrait-poster {
		width: min(100%, 36rem);
		margin-inline: auto;
		border: 1px solid rgb(155 160 192 / 30%);
		border-radius: 0.8rem;
		overflow: clip;
		background: #070915;
		box-shadow: 0 1.5rem 5rem rgb(2 3 10 / 28%);
		color: #f7fbff;
		color-scheme: dark;
	}

	picture,
	img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 4;
	}

	img {
		object-fit: cover;
		background: #050712;
	}

	.poster-copy {
		padding: clamp(1rem, 5vw, 1.5rem);
	}

	.eyebrow {
		margin: 0;
		color: #8de5f5;
		font:
			750 0.68rem/1.2 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0.45rem 0 0;
		font: 760 clamp(1.65rem, 8vw, 2.6rem) / 0.98 var(--font-sans, sans-serif);
		letter-spacing: -0.045em;
	}

	p,
	details,
	li {
		font: 0.9rem/1.55 var(--font-sans, sans-serif);
	}

	p {
		margin: 0.7rem 0 0;
		color: #d5d5e0;
	}

	.orientation-note {
		color: #aaaabd;
		font-size: 0.8rem;
	}

	.poster-meta {
		color: #8f92a3;
		font:
			700 0.66rem/1.4 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	button {
		margin-top: 0.9rem;
		border: 1px solid #ffd58a;
		border-radius: 999px;
		background: #ffd58a;
		padding: 0.68rem 1rem;
		color: #181206;
		font: 750 0.8rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	details {
		margin-top: 1rem;
		border-top: 1px solid rgb(181 184 208 / 22%);
		padding-top: 0.85rem;
		color: #c8c8d5;
	}

	summary {
		color: #f6e9c6;
		font-weight: 700;
		cursor: pointer;
	}

	ol {
		margin: 0.75rem 0 0;
		padding-left: 1.25rem;
	}

	li + li {
		margin-top: 0.45rem;
	}

	@media (forced-colors: active) {
		.portrait-poster,
		button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
