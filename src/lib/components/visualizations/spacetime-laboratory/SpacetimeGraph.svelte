<script lang="ts">
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import {
		kerrHorizonRadius,
		schwarzschildTimeDilation,
		weakDeflectionAngle
	} from '$lib/visualizations/spacetime-laboratory/spacetimeMath';

	type Props = { store: SpacetimeStore };
	let { store }: Props = $props();

	type Curve = { x: number; y: number }[];
	type GraphSpec = {
		title: string;
		xLabel: string;
		yLabel: string;
		curve: Curve;
		marks: { x: number; label: string }[];
	};

	const W = 300;
	const H = 150;
	const PAD = { l: 34, r: 8, t: 10, b: 22 };

	function makeCurve(fn: (x: number) => number, x0: number, x1: number, n = 90, yMax = 10): Curve {
		const pts: Curve = [];
		for (let i = 0; i <= n; i++) {
			const x = x0 + ((x1 - x0) * i) / n;
			const y = fn(x);
			if (Number.isFinite(y)) pts.push({ x, y: Math.min(y, yMax) });
		}
		return pts;
	}

	function scale(curve: Curve) {
		const xs = curve.map((p) => p.x);
		const ys = curve.map((p) => p.y);
		const x0 = Math.min(...xs);
		const x1 = Math.max(...xs);
		const y0 = 0;
		const y1 = Math.max(...ys) * 1.08 || 1;
		return {
			px: (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r),
			py: (y: number) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b),
			x0,
			x1,
			y1
		};
	}

	function path(curve: Curve): string {
		const { px, py } = scale(curve);
		return curve
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
			.join(' ');
	}

	let model = $derived(store.state.model);
	let params = $derived(store.state.params);

	let graph = $derived.by((): GraphSpec => {
		if (model === 'schwarzschild' || model === 'reissner-nordstrom') {
			return {
				title: 'Gravitational time dilation dτ/dt vs radius',
				xLabel: 'r / r_s',
				yLabel: 'dτ/dt',
				curve: makeCurve((r) => schwarzschildTimeDilation(r), 1.01, 12),
				marks: [
					{ x: 1, label: 'r_s' },
					{ x: 1.5, label: '3M' },
					{ x: 3, label: '6M' }
				]
			};
		}
		if (model === 'kerr') {
			return {
				title: 'Kerr outer horizon r₊ vs spin a/M',
				xLabel: 'a / M',
				yLabel: 'r₊ / M',
				curve: makeCurve((a) => kerrHorizonRadius(a), 0, 0.998),
				marks: [{ x: params.kerrSpin, label: 'you' }]
			};
		}
		if (model === 'weak-field') {
			return {
				title: 'Light deflection α = 2r_s/b vs impact parameter',
				xLabel: 'b / r_s',
				yLabel: 'α (rad ×10³)',
				curve: makeCurve(
					(b) => weakDeflectionAngle(b) * 1000 * params.weakCompactness * params.weakExaggeration,
					1,
					20,
					90,
					60
				),
				marks: []
			};
		}
		if (model === 'flrw') {
			const dominant =
				params.omegaLambda > params.omegaMatter
					? 'lambda'
					: params.omegaRadiation > params.omegaMatter
						? 'radiation'
						: 'matter';
			const fn = (t: number) =>
				dominant === 'matter'
					? Math.pow(Math.max(t, 1e-4), 2 / 3)
					: dominant === 'radiation'
						? Math.pow(Math.max(t, 1e-4), 1 / 2)
						: Math.exp(t - 1);
			return {
				title: `Scale factor a(t), ${dominant === 'lambda' ? 'dark-energy' : dominant}-dominated`,
				xLabel: 't (normalized)',
				yLabel: 'a(t)',
				curve: makeCurve(fn, 0.05, 2),
				marks: []
			};
		}
		if (model === 'de-sitter' || model === 'anti-de-sitter') {
			return {
				title: 'Scale factor a(t) = exp(Ht) for Λ-driven vacuum',
				xLabel: 'Ht',
				yLabel: 'a(t)',
				curve: makeCurve((t) => Math.exp(params.lambdaH0 * t) / Math.E, 0, 2),
				marks: []
			};
		}
		if (model === 'gravitational-wave') {
			const fn = (t: number) => {
				if (params.gwChirp) {
					const tc = (((t % 6) + 6) % 6) / 6;
					const env = Math.min(1, tc / 0.75) * (1 - Math.max(0, (tc - 0.9) / 0.1) * 0.9);
					return 0.5 + 0.45 * env * Math.cos(2 * Math.PI * params.gwFrequency * (t + tc * tc * t));
				}
				return 0.5 + 0.45 * Math.cos(2 * Math.PI * params.gwFrequency * t + params.gwPhase);
			};
			return {
				title: 'Strain h(t) — one polarization',
				xLabel: 't (s, visual)',
				yLabel: 'h',
				curve: makeCurve(fn, 0, 6),
				marks: []
			};
		}
		// minkowski
		return {
			title: 'Gravitational redshift 1 + z vs radius (flat: none)',
			xLabel: 'r / r_s',
			yLabel: '1 + z',
			curve: makeCurve(() => 1, 1, 12),
			marks: []
		};
	});

	let graphScale = $derived(scale(graph.curve));
</script>

<figure class="graph" aria-label={graph.title}>
	<figcaption>{graph.title}</figcaption>
	<svg
		viewBox="0 0 {W} {H}"
		role="img"
		aria-label={graph.title}
		preserveAspectRatio="xMidYMid meet"
	>
		<line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} class="axis" />
		<line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} class="axis" />
		<path d={path(graph.curve)} class="curve" fill="none" />
		{#each graph.marks as mark (mark.label)}
			{@const x = graphScale.px(mark.x)}
			<line x1={x} y1={PAD.t} x2={x} y2={H - PAD.b} class="mark" />
			<text {x} y={PAD.t + 8} class="mark-label">{mark.label}</text>
		{/each}
		<text x={(PAD.l + W - PAD.r) / 2} y={H - 4} class="axis-label">{graph.xLabel}</text>
		<text
			x={4}
			y={(PAD.t + H - PAD.b) / 2}
			class="axis-label"
			transform="rotate(-90 8 {(PAD.t + H - PAD.b) / 2})">{graph.yLabel}</text
		>
	</svg>
</figure>

<style>
	.graph {
		margin: 0;
		border: 1px solid #2a2f45;
		border-radius: 0.75rem;
		background: #10131f;
		padding: 0.7rem 0.9rem 0.5rem;
	}
	figcaption {
		font-size: 0.72rem;
		font-weight: 600;
		color: #b9c0d8;
		margin-bottom: 0.3rem;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.axis {
		stroke: #3a4160;
		stroke-width: 1;
	}
	.curve {
		stroke: #67e8f9;
		stroke-width: 1.8;
	}
	.mark {
		stroke: #f59e0b;
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}
	.mark-label {
		fill: #f59e0b;
		font-size: 8px;
		text-anchor: middle;
	}
	.axis-label {
		fill: #7a82a3;
		font-size: 8.5px;
		text-anchor: middle;
	}
</style>
