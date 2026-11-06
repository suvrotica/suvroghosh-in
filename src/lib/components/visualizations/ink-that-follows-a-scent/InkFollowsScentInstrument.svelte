<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { resolve } from '$app/paths';
	import './ink-follows-scent.css';

	let AppComponent = $state<Component<{ initialReducedMotion?: boolean }> | null>(null);
	let forceStaticFallback = $state<boolean>(false);
	let initialReducedMotion = $state<boolean>(false);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('canvas') === 'off' || params.get('fallback') === '1') {
			forceStaticFallback = true;
			return;
		}
		if (
			params.get('motion') === 'reduce' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			initialReducedMotion = true;
		}

		try {
			const mod = await import('./InkFollowsScentApp.svelte');
			AppComponent = mod.default;
		} catch (err) {
			loadError =
				err instanceof Error
					? err.message
					: 'The interactive simulation module could not be loaded.';
		}
	});
</script>

<section
	class="ink-scent-shell not-prose"
	aria-label="Ink That Follows a Scent interactive chemotaxis experiment"
	data-testid="ink-follows-scent-shell"
	data-tts-exclude
>
	<header class="ink-scent-intro">
		<div class="ink-scent-intro__top">
			<h1 class="ink-scent-intro__title">Ink That Follows a Scent</h1>
			<p class="ink-scent-intro__meta">
				By <a href={resolve('/resume')} rel="author">Suvro Ghosh</a>
				<span aria-hidden="true">·</span>
				Published <time datetime="2026-11-06">6 November 2026</time>
				<span aria-hidden="true">·</span>
				Updated <time datetime="2026-11-06">6 November 2026</time>
			</p>
		</div>
		<p class="ink-scent-intro__lead" data-testid="intro-copy-primary">
			Paint an invisible chemical trail. Watch the particles respond.
		</p>
		<p class="ink-scent-intro__sub" data-testid="intro-copy-secondary">
			Each particle wanders randomly. Sensing adds a small push towards stronger chemical.
		</p>
		<ol class="ink-scent-sequence" aria-label="Suggested exploration sequence">
			<li>
				<span class="ink-scent-sequence__num">1</span>
				<span>Watch particles gather around the initial source.</span>
			</li>
			<li>
				<span class="ink-scent-sequence__num">2</span>
				<span>Drag the source elsewhere.</span>
			</li>
			<li>
				<span class="ink-scent-sequence__num">3</span>
				<span>Paint a curved line of chemical.</span>
			</li>
			<li>
				<span class="ink-scent-sequence__num">4</span>
				<span>Compare sensing on and off using the same starting positions and random nudges.</span>
			</li>
		</ol>
	</header>

	{#if AppComponent && !forceStaticFallback}
		<AppComponent {initialReducedMotion} />
	{:else}
		<div class="ink-scent-fallback" data-testid="ink-scent-static-fallback">
			<p style="margin: 0; font-weight: 600; color: var(--ifs-text);">
				How can a group look purposeful when each particle follows only a local rule?
			</p>
			<p style="margin: 0; color: var(--ifs-muted);">
				Thousands of independent particles move through a prescribed <code>256 × 192</code>
				chemical landscape by combining unbiased random wandering with an optional local push up the chemical
				concentration gradient. In the computed comparison below (seed <code>2026</code>,
				<code>t = 14.0 s</code>), both runs share the exact same starting coordinates and random
				nudges at every step; only chemical sensing differs.
			</p>

			{#if loadError}
				<p role="alert" style="margin: 0; color: #ffaa4c; font-weight: 600;">
					Interactive canvas unavailable ({loadError}). Showing the verified computed comparison
					below.
				</p>
			{/if}

			<img
				src="/images/visualizations/ink-that-follows-a-scent/poster.png"
				alt="Computed paired comparison of Ink That Follows a Scent at t = 14 seconds: Sensing on gathers warm off-white ink trails around the chemical source and painted curve, while Sensing off wanders uniformly from the exact same starting points and random nudges."
				width="1200"
				height="750"
				loading="eager"
				decoding="async"
			/>

			<p style="margin: 0; font-size: 0.85rem; color: var(--ifs-muted);">
				<strong>Model summary when canvas is unavailable:</strong> Each particle updates its
				position by
				<code
					>nextPosition = reflectAtBoundary(position + sqrt(2 * D * dt) * randomVector + sensitivity
					* gradient(C, position) * dt)</code
				>. The chemical landscape is drawn directly on a fixed scale; this version does not simulate
				chemical spreading or decay.
			</p>
		</div>
	{/if}

	<details class="ink-scent-disclosure" data-testid="how-it-works-disclosure">
		<summary>How it works</summary>
		<div class="ink-scent-disclosure__body">
			<p>
				<strong>
					The chemical landscape is drawn directly. This version does not simulate chemical
					spreading or decay.
				</strong>
			</p>

			<p>
				At each fixed timestep (<code>dt = 1/60 s</code>), every particle updates its position
				independently on the fixed <code>256 × 192</code> logical domain using an additive biased random
				walk:
			</p>

			<pre class="ink-scent-disclosure__formula" data-testid="update-rule-formula"><code
					>nextPosition = reflectAtBoundary(
  position + sqrt(2 * D * dt) * randomVector + sensitivity * gradient(C, position) * dt
)</code
				></pre>

			<ul class="ink-scent-disclosure__list">
				<li>
					<strong><code>C</code> (chemical concentration field):</strong> An invisible landscape on
					a fixed <code>0.0</code> to <code>1.0</code> scale, combining painted strokes on a
					smoothed <code>256 × 192</code> grid with an optional broad movable source peak.
				</li>
				<li>
					<strong><code>gradient(C, position)</code>:</strong> The local slope
					<code>(∂C/∂x, ∂C/∂y)</code> bilinearly interpolated at the particle’s current coordinate. Gradient
					magnitude is preserved (with a smooth stability cap for heavy painting) so steeper slopes pull
					more strongly than flat regions.
				</li>
				<li>
					<strong><code>D</code> (random wandering):</strong> Controls the magnitude of the unbiased
					diffusive step <code>sqrt(2 * D * dt)</code>.
				</li>
				<li>
					<strong><code>randomVector</code>:</strong> Two independent standard normal values
					<code>(Z_x, Z_y)</code> generated deterministically from the tuple
					<code>(seed, particleId, simulationStep, component)</code>.
				</li>
				<li>
					<strong><code>sensitivity</code>:</strong> How strongly the local chemical gradient biases movement.
					Setting sensitivity to zero reduces the rule to a pure random walk.
				</li>
				<li>
					<strong><code>dt</code>:</strong> The fixed simulation timestep (<code>1/60 s</code>),
					kept independent of display frame rate and browser resizing.
				</li>
				<li>
					<strong><code>reflectAtBoundary</code>:</strong> Mirror reflection that keeps particles
					inside the <code>256 × 192</code> domain without wrapping lines across the canvas.
				</li>
			</ul>

			<p>
				<strong>Chemical, particles, and trails remain separate:</strong> Chemical concentration is
				the environment; particles are independent point agents that read only their local
				surroundings; visible ink trails are a fading history buffer (<code>512 × 384</code>) that
				never attracts particles or deposits chemical. Clearing trails erases only the drawing,
				whereas clearing chemical removes the environmental pull while earlier marks fade naturally.
			</p>

			<p>
				<strong>Why the paired runs share random nudges:</strong> In
				<strong>Compare from same start</strong>, matching particles in the
				<strong>Sensing on</strong> and <strong>Sensing off</strong> panels begin at identical coordinates
				and receive the exact same random nudge at every timestep. Because random walk noise cannot explain
				any divergence between the two panels, the visible separation isolates the effect of the local
				gradient-sensing term.
			</p>

			<p>
				<strong>Teaching simplifications and scientific background:</strong> This experiment is a
				teaching approximation inspired by Chapter 11 of J. D. Murray’s
				<em>Mathematical Biology I: An Introduction</em> (<a
					href="https://link.springer.com/chapter/10.1007/978-0-387-22437-4_11"
					target="_blank"
					rel="noopener noreferrer">Springer chapter reference</a
				>), which connects microscopic biased random walks to macroscopic diffusion and chemotaxis.
				It does not model a specific biological organism, receptor adaptation, cell-to-cell
				signalling, nutrient consumption, chemical secretion, or physical chemical diffusion.
			</p>
		</div>
	</details>

	<noscript>
		<p style="margin-top: 0.75rem; color: var(--ifs-muted);">
			Enable JavaScript to paint on the chemical landscape and run the live particle simulation in
			your browser.
		</p>
	</noscript>
</section>
