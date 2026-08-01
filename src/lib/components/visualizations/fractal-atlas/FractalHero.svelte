<script lang="ts">
	import { onMount } from 'svelte';

	type Props = { deck: string };
	let { deck }: Props = $props();

	let canvas: HTMLCanvasElement;
	let hero: HTMLElement;
	let ready = $state(false);
	let stopped = $state(false);
	let coordinate = $state('centre −0.500000 + 0.000000i · span 2.800000');

	function openLab(tour = false) {
		stopped = true;
		window.dispatchEvent(
			new CustomEvent('fractal-atlas-command', {
				detail: { action: tour ? 'tour' : 'enter', source: 'hero' }
			})
		);
	}

	onMount(() => {
		const maybeContext = canvas.getContext('2d', { alpha: false });
		if (!maybeContext) return;
		const context = maybeContext;

		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const queryReduced = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		const reduced = motionQuery.matches || queryReduced;
		let frame = 0;
		let lastDraw = -Infinity;
		let startedAt = performance.now();
		let centreRe = -0.5;
		let centreIm = 0;
		let spanY = 2.8;

		function draw() {
			const width = canvas.width;
			const height = canvas.height;
			const image = context.createImageData(width, height);
			const aspect = width / height;
			const maxIterations = 96;

			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					const cRe = centreRe + (x / width - 0.5) * spanY * aspect;
					const cIm = centreIm + (0.5 - y / height) * spanY;
					let zRe = 0;
					let zIm = 0;
					let iteration = 0;

					for (; iteration < maxIterations; iteration += 1) {
						const nextRe = zRe * zRe - zIm * zIm + cRe;
						zIm = 2 * zRe * zIm + cIm;
						zRe = nextRe;
						if (zRe * zRe + zIm * zIm > 16) break;
					}

					const offset = (y * width + x) * 4;
					if (iteration === maxIterations) {
						image.data[offset] = 4;
						image.data[offset + 1] = 5;
						image.data[offset + 2] = 12;
					} else {
						const t = iteration / maxIterations;
						const wave = 0.5 + 0.5 * Math.cos(iteration * 0.38);
						image.data[offset] = Math.round(19 + 170 * t + 42 * wave);
						image.data[offset + 1] = Math.round(16 + 92 * t + 24 * (1 - wave));
						image.data[offset + 2] = Math.round(48 + 165 * Math.sqrt(t));
					}
					image.data[offset + 3] = 255;
				}
			}

			context.putImageData(image, 0, 0);
			ready = true;
			coordinate = `centre ${centreRe.toFixed(6)} ${centreIm < 0 ? '−' : '+'} ${Math.abs(centreIm).toFixed(6)}i · span ${spanY.toFixed(6)}`;
		}

		function animate(now: number) {
			if (stopped || document.hidden || reduced) return;
			if (now - lastDraw >= 680) {
				const elapsed = Math.min(1, (now - startedAt) / 48_000);
				const eased = elapsed * elapsed * (3 - 2 * elapsed);
				centreRe = -0.5 + (-0.743643887 - -0.5) * eased;
				centreIm = 0.131825904 * eased;
				spanY = 2.8 * Math.exp(-0.72 * elapsed);
				draw();
				lastDraw = now;
			}
			frame = requestAnimationFrame(animate);
		}

		function stop() {
			stopped = true;
			cancelAnimationFrame(frame);
		}

		function handleVisibility() {
			if (document.hidden) {
				cancelAnimationFrame(frame);
			} else if (!stopped && !reduced) {
				startedAt = performance.now();
				frame = requestAnimationFrame(animate);
			}
		}

		draw();
		if (!reduced) frame = requestAnimationFrame(animate);
		hero.addEventListener('pointerdown', stop, { once: true });
		hero.addEventListener('wheel', stop, { once: true, passive: true });
		hero.addEventListener('keydown', stop, { once: true });
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<section
	bind:this={hero}
	class="fractal-hero article-breakout not-prose"
	aria-labelledby="fractal-hero-heading"
>
	<div class="visual" aria-hidden="true">
		<img src="/images/fractal-atlas.png" alt="" width="1600" height="900" class:concealed={ready} />
		<canvas bind:this={canvas} width="320" height="180"></canvas>
		<div class="visual-shade"></div>
	</div>
	<div class="hero-copy">
		<p class="eyebrow">Interactive Mathematics</p>
		<h2 id="fractal-hero-heading">A coastline with no country</h2>
		<p class="deck">{deck}</p>
		<p class="coordinate"><span aria-hidden="true">⌖</span> {coordinate}</p>
		<div class="actions">
			<button class="primary" type="button" onclick={() => openLab(false)}
				>Enter the laboratory</button
			>
			<button type="button" onclick={() => openLab(true)}>Take the five-minute tour</button>
		</div>
		<p class="local-note">Runs locally in your browser. No API or account required.</p>
	</div>
	<div class="field-note" aria-hidden="true">
		<span>PLATE 01</span>
		<span>PARAMETER COAST</span>
	</div>
	<noscript>
		<p class="noscript-note">
			The live renderer needs JavaScript. The complete article, formulae, captions, and FAQ remain
			available below.
		</p>
	</noscript>
</section>

<style>
	.fractal-hero {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(78rem, calc(100vw - 2rem));
		min-height: clamp(31rem, 61vw, 43rem);
		margin: 0 0 2.4rem;
		overflow: hidden;
		transform: translateX(-50%);
		border: 1px solid #3b3553;
		border-radius: 0.8rem;
		background: #080910;
		color: #f1eadc;
		box-shadow: 0 24px 70px rgb(15 8 28 / 24%);
		isolation: isolate;
	}

	.visual,
	.visual img,
	.visual canvas,
	.visual-shade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.visual img,
	.visual canvas {
		object-fit: cover;
		image-rendering: auto;
		transition: opacity 500ms ease;
	}

	.visual img.concealed {
		opacity: 0;
	}

	.visual canvas {
		opacity: 0.72;
		filter: saturate(0.86) contrast(1.05);
	}

	.visual-shade {
		background:
			linear-gradient(90deg, rgb(5 6 12 / 98%) 0%, rgb(5 6 12 / 91%) 40%, rgb(5 6 12 / 32%) 76%),
			linear-gradient(0deg, rgb(4 5 10 / 55%), transparent 45%);
	}

	.hero-copy {
		position: relative;
		z-index: 2;
		display: flex;
		min-height: inherit;
		width: min(45rem, 73%);
		flex-direction: column;
		justify-content: center;
		padding: clamp(2rem, 7vw, 5.2rem);
	}

	.eyebrow {
		margin: 0;
		color: #d3ad66;
		font: 700 0.72rem/1.2 var(--font-sans);
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	h2 {
		max-width: 12ch;
		margin: 0.7rem 0 1rem;
		color: #fff9ec;
		font: 780 clamp(2.2rem, 6vw, 5.2rem) / 0.94 var(--font-sans);
		letter-spacing: -0.055em;
		text-wrap: balance;
	}

	.deck {
		max-width: 59ch;
		margin: 0;
		color: #d6cfdf;
		font: clamp(0.94rem, 1.4vw, 1.08rem) / 1.62 var(--font-serif);
	}

	.coordinate {
		width: fit-content;
		margin: 1.2rem 0 0;
		border: 1px solid rgb(199 172 113 / 42%);
		border-radius: 999px;
		background: rgb(3 4 9 / 68%);
		padding: 0.42rem 0.65rem;
		color: #c9c2d4;
		font: 0.68rem/1.2 var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1.35rem;
	}

	button {
		min-height: 2.9rem;
		border: 1px solid #8e87a8;
		border-radius: 0.35rem;
		background: rgb(9 10 18 / 78%);
		padding: 0.65rem 0.9rem;
		color: #f3ecdf;
		font: 700 0.78rem/1.2 var(--font-sans);
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	button:hover {
		border-color: #e0bd78;
	}

	button.primary {
		border-color: #d6ad60;
		background: #d2aa62;
		color: #171018;
	}

	.local-note {
		margin: 0.7rem 0 0;
		color: #9d96ac;
		font: 0.68rem/1.3 var(--font-sans);
	}

	.field-note {
		position: absolute;
		z-index: 2;
		right: 1rem;
		bottom: 0.85rem;
		display: flex;
		gap: 1rem;
		color: #aca4ba;
		font: 0.6rem/1.2 var(--font-mono);
		letter-spacing: 0.12em;
	}

	.noscript-note {
		position: absolute;
		z-index: 4;
		right: 1rem;
		bottom: 2.4rem;
		left: 1rem;
		margin: 0;
		border: 1px solid #857a9c;
		background: #0b0c14;
		padding: 0.65rem;
		color: #f2ecdf;
		font: 0.8rem/1.4 var(--font-sans);
	}

	@media (max-width: 44rem) {
		.fractal-hero {
			min-height: 39rem;
		}

		.visual-shade {
			background:
				linear-gradient(0deg, rgb(5 6 12 / 98%) 8%, rgb(5 6 12 / 88%) 57%, rgb(5 6 12 / 42%)),
				linear-gradient(90deg, rgb(5 6 12 / 75%), transparent);
		}

		.hero-copy {
			width: auto;
			justify-content: flex-end;
			padding: 1.35rem;
		}

		h2 {
			font-size: clamp(2.2rem, 13vw, 3.8rem);
		}

		.actions {
			display: grid;
		}

		button {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.visual img,
		.visual canvas {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.fractal-hero {
			border: 3px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.visual {
			display: none;
		}

		.hero-copy,
		h2,
		.deck,
		.local-note,
		.coordinate {
			color: CanvasText;
		}

		button {
			border: 2px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
			backdrop-filter: none;
		}
	}
</style>
