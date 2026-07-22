<script lang="ts">
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
			note: 'The control universe. No curvature: light travels straight, and every clock agrees.'
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
			note: 'Spin a (angular momentum per unit mass) drags spacetime itself. Horizons solve Δ = 0: r± = M ± √(M² − a²).'
		},
		'reissner-nordstrom': {
			title: 'Reissner–Nordström metric — charged black hole',
			tex: 'ds^2 = -f(r)\\,c^2dt^2 + \\frac{dr^2}{f(r)} + r^2d\\Omega^2, \\quad f(r) = 1 - \\frac{2GM}{rc^2} + \\frac{GQ^2}{4\\pi\\varepsilon_0 r^2 c^4}',
			note: 'Electric charge adds a repulsive 1/r² term, creating inner and outer horizons that merge at the extremal limit.'
		},
		flrw: {
			title: 'FLRW metric — homogeneous expanding universe',
			tex: 'ds^2 = -c^2dt^2 + a(t)^2\\left[\\frac{dr^2}{1 - kr^2} + r^2d\\Omega^2\\right]',
			note: 'The scale factor a(t) carries all the dynamics. Galaxies sit in comoving coordinates while the metric grows.'
		},
		'de-sitter': {
			title: 'de Sitter space — positive cosmological constant',
			tex: 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = 0, \\qquad \\Lambda > 0',
			note: 'Empty space that expands exponentially. Every observer is wrapped in a cosmological event horizon at c/H.'
		},
		'anti-de-sitter': {
			title: 'anti-de Sitter space — negative cosmological constant',
			tex: 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = 0, \\qquad \\Lambda < 0',
			note: 'A confining geometry: light sent outward is refocused back. Central to holographic dualities (AdS/CFT).'
		},
		'gravitational-wave': {
			title: 'Linearized gravity — gravitational waves',
			tex: 'g_{\\mu\\nu} = \\eta_{\\mu\\nu} + h_{\\mu\\nu}, \\qquad |h_{\\mu\\nu}| \\ll 1',
			note: 'Ripples of the metric itself, travelling at c with two polarizations. Real astrophysical strain is ~10⁻²¹.'
		}
	};

	let panel = $derived(panels[model]);
</script>

<aside class="equation-panel" aria-label="Equation for the selected spacetime">
	<p class="panel-kicker">Now showing</p>
	<h3>{panel.title}</h3>
	<p class="tex" aria-label={panel.tex}><code>{panel.tex}</code></p>
	<p class="note">{panel.note}</p>
	<p class="convention">
		Convention: metric signature (−, +, +, +); geometrized units G = c = 1 in the shader.
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
	.tex code {
		font-family: ui-monospace, 'Cascadia Mono', monospace;
		font-size: 0.8rem;
		color: #a5f3fc;
		white-space: nowrap;
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
