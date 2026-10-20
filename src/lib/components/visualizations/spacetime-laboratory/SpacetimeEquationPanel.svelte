<script lang="ts">
	import katex from 'katex';
	import type { SpacetimeModel } from '$lib/visualizations/spacetime-laboratory/spacetimeTypes';

	type Props = {
		model: SpacetimeModel;
	};

	let { model }: Props = $props();

	type Panel = { title: string; tex: string; note: string };

	const panels: Record<SpacetimeModel, Panel> = {
		minkowski: {
			title: 'Minkowski metric — flat spacetime',
			tex: 'ds^2 = -c^2\\,dt^2 + dx^2 + dy^2 + dz^2',
			note: 'No curvature: light travels straight. Inertial clocks at rest in these coordinates have the same gravitational clock rate.'
		},
		'weak-field': {
			title: 'Newtonian weak-field limit',
			tex: 'g_{00} \\approx -\\left(1 + \\frac{2\\Phi}{c^2}\\right), \\qquad \\Phi = -\\frac{GM}{r}',
			note: 'General relativity reduced to the low-speed, weak-curvature limit — not a rival theory.'
		},
		schwarzschild: {
			title: 'Schwarzschild metric — non-rotating black hole',
			tex: 'ds^2 = -\\!\\left(1 - \\frac{2GM}{rc^2}\\right)c^2dt^2 + \\left(1 - \\frac{2GM}{rc^2}\\right)^{-1}\\!dr^2 + r^2d\\Omega^2',
			note: 'The unique spherically symmetric vacuum solution. Horizon at r_s = 2GM/c², photon sphere at 3GM/c², ISCO at 6GM/c².'
		},
		kerr: {
			title: 'Kerr metric — rotating black hole',
			tex: '\\Sigma = r^2 + a^2\\cos^2\\theta, \\qquad \\Delta = r^2 - \\frac{2GMr}{c^2} + a^2',
			note: 'Here a = J/(Mc), a length; the control selects a/M in geometrized units. Horizons solve Δ = 0: r± = M ± √(M² − a²). The scene uses a spin illustration, not a full Kerr geodesic solver.'
		},
		'reissner-nordstrom': {
			title: 'Reissner–Nordström metric — charged black hole',
			tex: 'ds^2 = -f(r)\\,c^2dt^2 + \\frac{dr^2}{f(r)} + r^2d\\Omega^2, \\quad f(r) = 1 - \\frac{2GM}{rc^2} + \\frac{GQ^2}{4\\pi\\varepsilon_0 r^2 c^4}',
			note: 'Below the extremal charge there are inner and outer horizons; they merge at extremality. Super-extremal charge has no horizon, and that regime is not simulated by the renderer.'
		},
		flrw: {
			title: 'FLRW metric — homogeneous expanding universe',
			tex: 'ds^2 = -c^2dt^2 + a(t)^2\\left[\\frac{dr^2}{1 - kr^2} + r^2d\\Omega^2\\right]',
			note: 'The CPU integrates the mixed-density Friedmann equations, with Ωk = 1 − Ωm − Ωr − ΩΛ and a=1 at the reference epoch. The sky/grid is an expansion diagram; it is not a cosmological light-cone calculation.'
		},
		'de-sitter': {
			title: 'de Sitter space — positive cosmological constant',
			tex: 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = 0, \\qquad \\Lambda > 0',
			note: 'The flat slicing has a(t) = exp(Ht). A comoving observer has an event-horizon radius c/H. The screen image and horizon circle are schematic.'
		},
		'anti-de-sitter': {
			title: 'anti-de Sitter space — negative cosmological constant',
			tex: 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = 0, \\qquad \\Lambda < 0',
			note: 'Static coordinates have g_tt = −(1 + r²/L²) and a timelike conformal boundary. This is not exponential expansion with a negative H. The screen pattern is illustrative.'
		},
		'gravitational-wave': {
			title: 'Linearized gravity — gravitational waves',
			tex: 'g_{\\mu\\nu} = \\eta_{\\mu\\nu} + h_{\\mu\\nu}, \\qquad |h_{\\mu\\nu}| \\ll 1',
			note: 'At linear order a transverse ring has displacement h/2, with plus and cross axes rotated 45°. The visible magnification is a teaching diagram and can exceed the small-strain regime.'
		}
	};

	let panel = $derived(panels[model]);
	let renderedEquation = $derived(
		katex.renderToString(panel.tex, {
			displayMode: true,
			throwOnError: false,
			output: 'htmlAndMathml',
			trust: false,
			strict: 'ignore'
		})
	);
</script>

<aside class="equation-panel" aria-label="Equation for the selected spacetime">
	<p class="panel-kicker">Now showing</p>
	<h3>{panel.title}</h3>
	<!-- Only feature-owned constant equations reach KaTeX, with trusted commands disabled. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="tex">{@html renderedEquation}</div>
	<p class="note">{panel.note}</p>
	<p class="convention">
		Convention: metric signature (−, +, +, +). Black-hole scene lengths use GM/c²; G = c = M = 1, so
		the Schwarzschild horizon is at 2 scene units.
	</p>
</aside>

<style>
	.equation-panel {
		border: 1px solid #2a2f45;
		border-radius: 0.75rem;
		background: #10131f;
		padding: 1rem 1.1rem;
	}
	.panel-kicker {
		margin: 0 0 0.2rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #7dd3fc;
	}
	h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		font-weight: 700;
		color: #eef1fa;
	}
	.tex {
		margin: 0 0 0.55rem;
		overflow-x: auto;
		border-radius: 0.5rem;
		background: #0a0d17;
		padding: 0.6rem 0.7rem;
	}
	.tex :global(.katex) {
		font-size: 0.8rem;
		color: #a5f3fc;
	}
	.tex :global(.katex-display) {
		margin: 0;
	}
	.note {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		line-height: 1.55;
		color: #b9c0d8;
	}
	.convention {
		margin: 0;
		font-size: 0.68rem;
		color: #6b7494;
	}
</style>
