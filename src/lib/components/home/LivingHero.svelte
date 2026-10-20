<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<section class="fb-hero" aria-labelledby="living-hero-heading" data-living-hero>
	<div class="fb-hero__introduction">
		<p class="fb-hero__eyebrow"><span aria-hidden="true"></span> From Calcutta, with curiosity.</p>
		<h1 id="living-hero-heading">Suvro <em>Ghosh<span aria-hidden="true">.</span></em></h1>
		<p class="fb-hero__role">Independent entrepreneur, maker and writer</p>
		<p class="fb-hero__description">
			I make things, explore how they work, and write about what I find along the way.
		</p>
		<div class="fb-hero__actions" aria-label="Introduction links">
			<a class="fb-hero__primary" href={resolve('/projects')}
				>Explore the work <span aria-hidden="true">↗</span></a
			>
			<a class="fb-hero__secondary" href={resolve('/writing')}
				>Read the writing <span aria-hidden="true">→</span></a
			>
		</div>
		<nav class="fb-hero__more" aria-label="More about Suvro Ghosh">
			<a href={resolve('/about')}>About</a><span aria-hidden="true">/</span>
			<a href={resolve('/start-here')}>Start here</a><span aria-hidden="true">/</span>
			<a href={resolve('/contact')}>Contact</a>
		</nav>
	</div>

	<div class="fb-hero__exhibit">
		<div class="fb-hero__exhibit-top" aria-hidden="true">
			<span>An open fieldbook</span><span>Art · Code · Everyday life</span>
		</div>
		<div class="fb-hero__composition">
			<span class="fb-hero__orbit" aria-hidden="true"></span>
			<a
				class="fb-hero__pigment"
				href={resolve('/blog/visualizations/create-art-living-pigment-studio')}
			>
				<figure>
					<img
						data-hero-artwork
						src="/images/create-art-living-pigment-studio.webp"
						alt="Blue and ochre pigment spreading across textured paper, the cover artwork for Living Pigment Studio."
						width="1536"
						height="1024"
						fetchpriority="high"
						decoding="async"
					/>
					<figcaption>
						<span>Living Pigment Studio</span><span aria-hidden="true">↗</span>
					</figcaption>
				</figure>
			</a>
			<a
				class="fb-hero__sculpture"
				href={resolve('/blog/visualizations/mrinmoyee-the-durga-atelier')}
			>
				<figure>
					<img
						src="/images/visualizations/mrinmoyee/mrinmoyee-poster.jpg"
						alt="A red and gold Durga sculpture from Mrinmoyee, the browser-based sculpture atelier."
						width="1200"
						height="1050"
						decoding="async"
					/>
					<figcaption><span>Mrinmoyee</span><span aria-hidden="true">↗</span></figcaption>
				</figure>
			</a>
		</div>
		<p class="fb-hero__exhibit-caption">
			<span>Open an experiment. Follow an idea.</span><span aria-hidden="true"
				>22.5726° N / 88.3639° E</span
			>
		</p>
	</div>
</section>

<style>
	.fb-hero {
		display: grid;
		grid-template-columns: 0.88fr 1.12fr;
		gap: clamp(2rem, 5vw, 5rem);
		align-items: center;
		padding-block: clamp(2.5rem, 5vw, 5rem) 3.5rem;
	}
	.fb-hero__eyebrow {
		display: flex;
		gap: 0.65rem;
		align-items: center;
		margin: 0 0 1.8rem;
		color: var(--fb-muted);
		font: 400 0.69rem/1.6 var(--fb-mono);
	}
	.fb-hero__eyebrow > span {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--fb-accent);
	}
	.fb-hero h1 {
		margin: 0;
		color: var(--fb-ink);
		font: 450 clamp(5rem, 8.9vw, 8.6rem)/0.84 var(--fb-serif);
		letter-spacing: -0.065em;
	}
	.fb-hero h1 em {
		display: block;
		font-weight: 420;
	}
	.fb-hero h1 em > span {
		color: var(--fb-accent);
	}
	.fb-hero__role {
		max-width: 25ch;
		margin: 1.9rem 0 0;
		color: var(--fb-ink);
		font: 550 clamp(1.05rem, 1.5vw, 1.28rem)/1.45 var(--fb-sans);
		letter-spacing: -0.025em;
	}
	.fb-hero__description {
		max-width: 33ch;
		margin: 0.85rem 0 0;
		color: var(--fb-muted);
		font: 400 1rem/1.7 var(--fb-sans);
	}
	.fb-hero__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem 1.4rem;
		margin-top: 1.65rem;
	}
	.fb-hero__actions a {
		display: inline-flex;
		min-height: 2.9rem;
		align-items: center;
		justify-content: center;
		gap: 1.1rem;
		font: 550 0.81rem/1.4 var(--fb-sans);
		text-decoration: none;
	}
	.fb-hero__primary {
		padding: 0.8rem 1.1rem;
		border: 1px solid var(--fb-ink);
		background: var(--fb-ink);
		color: var(--fb-paper);
	}
	.fb-hero__primary:hover {
		background: var(--fb-accent);
		border-color: var(--fb-accent);
	}
	.fb-hero__secondary {
		color: var(--fb-ink);
		border-bottom: 1px solid var(--fb-rule);
	}
	.fb-hero__secondary:hover {
		border-color: var(--fb-accent);
		color: var(--fb-accent);
	}
	.fb-hero__more {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		margin-top: 1rem;
		color: var(--fb-rule);
	}
	.fb-hero__more a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--fb-muted);
		font: 400 0.75rem/1.4 var(--fb-sans);
		text-decoration: none;
	}
	.fb-hero__more a:hover {
		color: var(--fb-accent);
	}
	.fb-hero__exhibit {
		min-width: 0;
		align-self: center;
	}
	.fb-hero__exhibit-top,
	.fb-hero__exhibit-caption {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		color: var(--fb-muted);
		font: 400 0.57rem/1.6 var(--fb-mono);
	}
	.fb-hero__exhibit-top {
		padding-bottom: 0.8rem;
		border-bottom: 1px solid var(--fb-rule);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.fb-hero__composition {
		position: relative;
		isolation: isolate;
		aspect-ratio: 1.4;
		margin-block: 0.75rem;
		background-image: radial-gradient(var(--fb-rule) 0.65px, transparent 0.65px);
		background-size: 18px 18px;
	}
	.fb-hero__orbit {
		position: absolute;
		inset: 14% 12%;
		border: 1px solid var(--fb-rule);
		border-radius: 50%;
		transform: rotate(-15deg);
		z-index: -1;
	}
	.fb-hero figure {
		margin: 0;
	}
	.fb-hero__pigment {
		position: absolute;
		display: block;
		top: 1.5rem;
		left: 0.75rem;
		width: 84%;
		padding: 0.55rem 0.55rem 0;
		background: #f5efdf;
		color: #302a21;
		box-shadow: 0 14px 30px #00000020;
		transform: rotate(-5deg);
		transition: transform 0.3s ease;
	}
	.fb-hero__pigment img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3/2;
		object-fit: contain;
	}
	.fb-hero__pigment figcaption,
	.fb-hero__sculpture figcaption {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 2.3rem;
		font: 500 0.65rem/1.3 var(--fb-sans);
	}
	.fb-hero__sculpture {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		display: block;
		width: 38%;
		padding: 0.4rem 0.4rem 0;
		background: #f5efdf;
		color: #302a21;
		box-shadow: 0 10px 25px #00000026;
		transform: rotate(7deg);
		transition: transform 0.3s ease;
	}
	.fb-hero__sculpture img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 8/7;
		object-fit: contain;
		background: #181411;
	}
	.fb-hero__exhibit-caption {
		margin: 1.2rem 0 0;
		border-top: 1px solid var(--fb-rule);
		padding-top: 0.8rem;
		font-size: 0.55rem;
	}
	.fb-hero__exhibit-caption > span:last-child {
		white-space: nowrap;
	}
	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		:global(html:not([data-motion='still'])) .fb-hero__pigment:hover {
			transform: rotate(-3deg) translateY(-4px);
		}
		:global(html:not([data-motion='still'])) .fb-hero__sculpture:hover {
			transform: rotate(4deg) translateY(-4px);
		}
	}
	@media (max-width: 68rem) {
		.fb-hero {
			gap: 2rem;
		}
		.fb-hero__exhibit-caption > span:last-child {
			display: none;
		}
	}
	@media (max-width: 48rem) {
		.fb-hero {
			grid-template-columns: 1fr;
			gap: 1.3rem;
			padding-top: 2rem;
			padding-bottom: 2.5rem;
		}
		.fb-hero__eyebrow {
			margin-bottom: 1rem;
		}
		.fb-hero h1 {
			font-size: clamp(4.2rem, 15.5vw, 7rem);
			line-height: 0.92;
		}
		.fb-hero h1 em {
			display: inline;
		}
		.fb-hero__role {
			margin-top: 1.1rem;
			font-size: 1rem;
			max-width: none;
		}
		.fb-hero__description {
			max-width: 42ch;
			font-size: 0.92rem;
			line-height: 1.6;
			margin-top: 0.65rem;
		}
		.fb-hero__actions {
			margin-top: 1.1rem;
			gap: 1rem;
		}
		.fb-hero__actions a {
			font-size: 0.75rem;
			gap: 0.65rem;
		}
		.fb-hero__more {
			display: none;
		}
		.fb-hero__composition {
			aspect-ratio: 1.25;
		}
		.fb-hero__pigment {
			top: 1.5rem;
			width: 84%;
		}
		.fb-hero__sculpture {
			width: 33%;
			bottom: 1rem;
			right: 1rem;
		}
		.fb-hero__exhibit-caption {
			margin-top: 0.5rem;
		}
	}
	@media (max-width: 25rem) {
		.fb-hero h1 {
			font-size: clamp(3.6rem, 16vw, 4rem);
		}
		.fb-hero__eyebrow {
			font-size: 0.61rem;
		}
		.fb-hero__exhibit-top {
			font-size: 0.5rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fb-hero__pigment,
		.fb-hero__sculpture {
			transition: none;
		}
	}
	:global(html[data-motion='still']) .fb-hero__pigment,
	:global(html[data-motion='still']) .fb-hero__sculpture {
		transition: none;
	}
	:global(html[data-theme='high-contrast']) .fb-hero__pigment,
	:global(html[data-theme='high-contrast']) .fb-hero__sculpture {
		border: 2px solid black;
		box-shadow: none;
	}
	@media print {
		.fb-hero {
			grid-template-columns: 1fr 1fr;
		}
		.fb-hero h1 {
			font-size: 4rem;
		}
	}
</style>
