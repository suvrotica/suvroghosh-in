<script lang="ts">
	import { replaceState as replaceNavigationState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, type Component } from 'svelte';

	let loadTarget: HTMLElement;
	let Laboratory = $state<Component | null>(null);
	let loading = $state(false);
	let error = $state('');
	let initialCommand = $state<'begin' | 'open' | null>(null);
	let commandId = $state(0);

	async function loadLaboratory() {
		if (Laboratory || loading) return;
		loading = true;
		error = '';
		try {
			const module = await import('./GradientDescentLaboratory.svelte');
			Laboratory = module.default;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The laboratory could not be loaded.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		let hashFrame = 0;
		const clearCommandHash = () => {
			window.cancelAnimationFrame(hashFrame);
			hashFrame = window.requestAnimationFrame(() => {
				if (!/^#gradient-descent-(?:begin|open)$/u.test(window.location.hash)) return;
				const route =
					`${window.location.pathname}${window.location.search}` as '/blog/visualizations/gradient-descent-landscapes';
				replaceNavigationState(resolve(route), {});
			});
		};
		const acceptCommand = (command: 'begin' | 'open') => {
			initialCommand = command;
			commandId += 1;
			void loadLaboratory();
			clearCommandHash();
		};
		const handleCommand = (event: Event) => {
			const command = (event as CustomEvent<{ action?: unknown }>).detail?.action;
			if (command !== 'begin' && command !== 'open') return;
			acceptCommand(command);
		};
		window.addEventListener('gradient-descent-command', handleCommand);
		const hashCommand =
			window.location.hash === '#gradient-descent-begin'
				? 'begin'
				: window.location.hash === '#gradient-descent-open'
					? 'open'
					: null;
		if (hashCommand) {
			acceptCommand(hashCommand);
			loadTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
		}

		if (typeof IntersectionObserver === 'undefined') {
			void loadLaboratory();
			return () => {
				window.cancelAnimationFrame(hashFrame);
				window.removeEventListener('gradient-descent-command', handleCommand);
			};
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				void loadLaboratory();
				observer.disconnect();
			},
			{ rootMargin: '520px 0px' }
		);
		observer.observe(loadTarget);
		return () => {
			window.cancelAnimationFrame(hashFrame);
			observer.disconnect();
			window.removeEventListener('gradient-descent-command', handleCommand);
		};
	});
</script>

<span id="gradient-descent-begin" class="command-anchor" aria-hidden="true"></span>
<span id="gradient-descent-open" class="command-anchor" aria-hidden="true"></span>
<section
	bind:this={loadTarget}
	id="gradient-descent-laboratory"
	class="lab-loader article-breakout not-prose"
	aria-labelledby="gradient-descent-laboratory-heading"
	data-gradient-descent-lab
>
	{#if Laboratory}
		<Laboratory {initialCommand} {commandId} />
	{:else}
		<div class="fallback-plate">
			<img
				src="/images/gradient-descent-landscapes.png"
				alt="A topographic loss landscape crossed by a measured gradient-descent path"
				width="1200"
				height="630"
				loading="lazy"
				decoding="async"
			/>
			<div class="fallback-shade" aria-hidden="true"></div>
			<div class="fallback-copy">
				<p class="eyebrow">Interactive optimization observatory</p>
				<h2 id="gradient-descent-laboratory-heading">The common instrument</h2>
				<p>
					Seven landscapes, four optimizers and one authoritative iteration clock. The contour map
					remains the complete scientific fallback if three-dimensional terrain is unavailable.
				</p>
				<button type="button" onclick={loadLaboratory} disabled={loading}>
					{loading ? 'Calibrating the laboratory…' : 'Load the interactive laboratory'}
				</button>
				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}
			</div>
		</div>
		<noscript>
			<div class="noscript-note">
				<strong>The static topographic plate is the no-JavaScript version.</strong>
				The measured trail descends a two-parameter loss surface; the article below supplies the update
				rule, formulas, captions and numerical cautions without requiring the live controls.
			</div>
		</noscript>
	{/if}
</section>

<style>
	.command-anchor {
		display: block;
		height: 0;
		scroll-margin-top: 1rem;
	}

	.lab-loader {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(94rem, calc(100vw - 1rem));
		margin-block: 3rem;
		scroll-margin-top: 5rem;
		transform: translateX(-50%);
	}

	.fallback-plate {
		position: relative;
		min-height: clamp(30rem, 55vw, 46rem);
		overflow: hidden;
		border: 1px solid #4a453e;
		border-radius: 0.75rem;
		background: #0b0d0d;
		box-shadow: 0 1.8rem 4.5rem rgb(8 8 7 / 30%);
		color: #f1eadb;
	}

	.fallback-plate img,
	.fallback-shade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.fallback-shade {
		background:
			linear-gradient(90deg, rgb(8 10 10 / 96%), rgb(8 10 10 / 76%) 48%, rgb(8 10 10 / 18%)),
			linear-gradient(0deg, rgb(8 10 10 / 55%), transparent 52%);
	}

	.fallback-copy {
		position: relative;
		z-index: 1;
		display: flex;
		min-height: inherit;
		max-width: 42rem;
		flex-direction: column;
		justify-content: center;
		padding: clamp(1.5rem, 6vw, 5rem);
	}

	.eyebrow {
		margin: 0 0 0.6rem;
		color: #ddb76e;
		font: 750 0.7rem/1.2 var(--font-sans);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		color: #fff9ea;
		font: 760 clamp(2rem, 5vw, 4.3rem) / 0.98 var(--font-sans);
		letter-spacing: -0.05em;
	}

	.fallback-copy > p:not(.eyebrow, .error) {
		max-width: 58ch;
		margin: 1rem 0 0;
		color: #cbc6bb;
		font: 1rem/1.65 var(--font-serif);
	}

	button {
		width: fit-content;
		min-height: 2.9rem;
		margin-top: 1.4rem;
		border: 1px solid #d5ac62;
		border-radius: 0.35rem;
		background: #c79a52;
		padding: 0.68rem 1rem;
		color: #17130d;
		font: 750 0.8rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.78;
	}

	button:focus-visible {
		outline: 3px solid #fff5d8;
		outline-offset: 3px;
	}

	.error {
		margin-top: 0.8rem;
		color: #ffb8a4;
		font: 0.8rem/1.45 var(--font-sans);
	}

	.noscript-note {
		position: relative;
		z-index: 2;
		border: 1px solid #6e665a;
		border-top: 0;
		background: #141615;
		padding: 0.85rem 1rem;
		color: #e5ded0;
		font: 0.84rem/1.55 var(--font-sans);
	}

	@media (max-width: 46rem) {
		.lab-loader {
			width: calc(100vw - 1rem);
		}

		.fallback-plate {
			min-height: 40rem;
		}

		.fallback-shade {
			background: linear-gradient(
				0deg,
				rgb(8 10 10 / 98%) 12%,
				rgb(8 10 10 / 82%) 61%,
				transparent
			);
		}

		.fallback-copy {
			justify-content: flex-end;
			padding: 1.25rem;
		}

		button {
			width: 100%;
		}
	}

	@media (forced-colors: active) {
		.fallback-plate {
			border: 3px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.fallback-plate img,
		.fallback-shade {
			display: none;
		}

		.fallback-copy,
		.fallback-copy h2,
		.fallback-copy p {
			color: CanvasText;
		}
	}
</style>
