<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { supportsWebGL } from '$lib/visualizations/webgl';
	import type { SketchArtwork } from '$lib/sketches/types';
	import MuseumFallback from './MuseumFallback.svelte';

	type MuseumSceneProps = {
		artworks: SketchArtwork[];
		selectedSlug?: string | null;
		reducedMotion?: boolean;
		onSelect: (slug: string) => void;
		onDetails: (artwork: SketchArtwork) => void;
		onExit: () => void;
		onReady?: () => void;
		onError?: (message: string) => void;
	};

	type Props = {
		artworks: SketchArtwork[];
		selectedSlug?: string | null;
		onSelect: (slug: string) => void;
		onDetails: (artwork: SketchArtwork) => void;
	};

	let { artworks, selectedSlug = null, onSelect, onDetails }: Props = $props();
	let RendererComponent = $state<Component<MuseumSceneProps> | null>(null);
	let capable = $state<boolean | null>(null);
	let entered = $state(false);
	let loading = $state(false);
	let errorMessage = $state('');
	let prefersReducedMotion = $state(false);
	let enterButton = $state<HTMLButtonElement>();
	let returnFocus = false;

	onMount(() => {
		capable = supportsWebGL();
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = media.matches;
		const updateMotion = (event: MediaQueryListEvent) => {
			prefersReducedMotion = event.matches;
		};
		media.addEventListener('change', updateMotion);
		return () => media.removeEventListener('change', updateMotion);
	});

	async function enterMuseum() {
		if (capable === false || loading) return;
		loading = true;
		errorMessage = '';
		try {
			const module = await import('./MuseumScene.svelte');
			RendererComponent = module.default;
			entered = true;
			returnFocus = true;
		} catch (error) {
			console.error('Sketch Museum renderer failed to load.', error);
			errorMessage = 'The gallery renderer could not be loaded.';
			capable = false;
		} finally {
			loading = false;
		}
	}

	function exitMuseum() {
		entered = false;
		RendererComponent = null;
		if (returnFocus) {
			returnFocus = false;
			requestAnimationFrame(() => enterButton?.focus());
		}
	}

	function handleReady() {
		loading = false;
	}

	function handleError(message: string) {
		errorMessage = message;
		capable = false;
		entered = false;
		RendererComponent = null;
	}
</script>

<section class="museum-shell" aria-labelledby="museum-view-heading">
	<div class="museum-heading-row">
		<div>
			<p class="museum-kicker">Three-dimensional gallery</p>
			<h2 id="museum-view-heading">Museum View</h2>
		</div>
		<a href="#sketch-collection">Skip Museum View</a>
	</div>

	{#if entered && RendererComponent}
		<div class="museum-breakout">
			<RendererComponent
				{artworks}
				{selectedSlug}
				reducedMotion={prefersReducedMotion}
				{onSelect}
				{onDetails}
				onExit={exitMuseum}
				onReady={handleReady}
				onError={handleError}
			/>
		</div>
	{:else if capable === false}
		<MuseumFallback message={errorMessage || undefined} />
	{:else}
		<div class="museum-entrance">
			<div class="entrance-architecture" aria-hidden="true">
				<span class="entrance-light"></span>
				<span class="entrance-frame"><i></i></span>
				<span class="entrance-bench"></span>
			</div>
			<div class="entrance-copy">
				<p class="entrance-eyebrow">{artworks.length} works · procedurally arranged rooms</p>
				<h3>Step into the opening gallery</h3>
				<p>
					Walk among framed sketches under focused gallery lights. Follow the illuminated room signs
					above each doorway, or use the guided artwork and room controls. Movement begins only when
					you choose to enter.
				</p>
				<div class="entrance-actions">
					<button bind:this={enterButton} type="button" onclick={enterMuseum} disabled={loading}>
						{loading ? 'Preparing gallery…' : 'Enter Museum'}
					</button>
					<a href="#sketch-collection">Open the collection instead</a>
				</div>
				<p class="entrance-note">
					The museum loads separately. The complete two-dimensional collection remains available
					below.
				</p>
			</div>
		</div>
	{/if}
</section>

<style>
	.museum-shell {
		margin-block: 2.25rem 3.5rem;
		scroll-margin-top: 1rem;
	}

	.museum-heading-row {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.museum-kicker {
		margin: 0 0 0.25rem;
		color: var(--ink-faint);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-size: clamp(1.8rem, 4vw, 2.45rem);
	}

	.museum-heading-row > a,
	.entrance-actions a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--ink-muted);
		font-size: 0.8rem;
		font-weight: 750;
		text-underline-offset: 0.25rem;
	}

	.museum-breakout {
		position: relative;
		left: 50%;
		width: min(96vw, 100rem);
		translate: -50% 0;
	}

	.museum-entrance {
		display: grid;
		min-height: 29rem;
		overflow: hidden;
		border: 1px solid #5a4938;
		border-radius: 0.55rem;
		background: #1d1510;
		box-shadow: var(--shadow-overlay);
		color: #f4ecdc;
		grid-template-columns: minmax(14rem, 0.9fr) minmax(18rem, 1.1fr);
	}

	.entrance-architecture {
		position: relative;
		min-height: 24rem;
		overflow: hidden;
		background:
			linear-gradient(90deg, rgb(0 0 0 / 34%), transparent 42%, rgb(0 0 0 / 24%)),
			linear-gradient(#958669 0 78%, #261a12 78%);
		perspective: 38rem;
	}

	.entrance-architecture::before,
	.entrance-architecture::after {
		position: absolute;
		z-index: 1;
		content: '';
	}

	.entrance-architecture::before {
		inset: 0 auto 22% 0;
		width: 18%;
		background: linear-gradient(90deg, #3c3024, #706149);
		transform: skewY(-5deg);
		transform-origin: bottom;
	}

	.entrance-architecture::after {
		right: -8%;
		bottom: -7%;
		left: -8%;
		height: 31%;
		background:
			linear-gradient(110deg, transparent 0 46%, rgb(255 255 255 / 7%) 47% 48%, transparent 49%),
			#211711;
		transform: rotateX(54deg);
	}

	.entrance-frame {
		position: absolute;
		z-index: 2;
		top: 22%;
		left: 50%;
		width: 38%;
		aspect-ratio: 0.76;
		border: clamp(0.7rem, 2vw, 1.15rem) ridge #4a2d17;
		background: #e8dfcd;
		box-shadow:
			0 0 0 0.28rem #8f743d,
			0 0.8rem 1.8rem rgb(0 0 0 / 42%);
		translate: -50% 0;
	}

	.entrance-frame i {
		position: absolute;
		inset: 22% 25%;
		display: block;
		border-radius: 50% 46% 55% 42%;
		background:
			radial-gradient(circle at 52% 30%, transparent 0 20%, #37332d 21% 23%, transparent 24%),
			linear-gradient(148deg, transparent 0 42%, #37332d 43% 46%, transparent 47%);
		rotate: -10deg;
		opacity: 0.72;
	}

	.entrance-light {
		position: absolute;
		z-index: 1;
		top: -11%;
		left: 50%;
		width: 82%;
		height: 82%;
		border-radius: 50%;
		background: radial-gradient(ellipse, rgb(255 230 174 / 42%), transparent 64%);
		translate: -50% 0;
	}

	.entrance-bench {
		position: absolute;
		z-index: 3;
		right: 18%;
		bottom: 14%;
		left: 18%;
		height: 5%;
		border-radius: 0.15rem;
		background: #3a2518;
		box-shadow:
			1.2rem 2.4rem 0 -0.9rem #2a1b12,
			-1.2rem 2.4rem 0 -0.9rem #2a1b12;
	}

	.entrance-copy {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: clamp(1.5rem, 5vw, 3.25rem);
		background: linear-gradient(135deg, rgb(255 255 255 / 3%), transparent 45%), #1d1510;
	}

	.entrance-eyebrow {
		margin: 0 0 0.75rem;
		color: #cdb98f;
		font-size: 0.69rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.entrance-copy h3 {
		margin: 0 0 0.9rem;
		color: #fff8e9;
		font-size: clamp(1.75rem, 4vw, 2.85rem);
		line-height: 1.02;
	}

	.entrance-copy > p:not(.entrance-eyebrow, .entrance-note) {
		max-width: 38rem;
		margin: 0;
		color: #d8cdb9;
		font-size: 0.96rem;
		line-height: 1.65;
		text-align: left;
	}

	.entrance-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem 1rem;
		margin-top: 1.4rem;
	}

	button {
		min-height: 3rem;
		padding: 0.7rem 1.2rem;
		border: 1px solid #d6bd83;
		border-radius: 0.35rem;
		background: #8a6338;
		color: #fffaf0;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 800;
		cursor: pointer;
	}

	button:hover {
		background: #a27849;
	}

	button:focus-visible {
		outline: 2px solid #fff7df;
		outline-offset: 3px;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.68;
	}

	.entrance-actions a {
		color: #e3d5bb;
	}

	.entrance-note {
		margin: 1rem 0 0;
		color: #aa9b83;
		font-size: 0.72rem;
		line-height: 1.45;
		text-align: left;
	}

	@media (max-width: 45rem) {
		.museum-heading-row {
			align-items: start;
		}

		.museum-entrance {
			grid-template-columns: 1fr;
		}

		.entrance-architecture {
			min-height: 17rem;
		}

		.entrance-frame {
			top: 13%;
			width: 25%;
			min-width: 6rem;
		}

		.entrance-copy {
			padding: 1.35rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
