<script lang="ts">
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import {
		kerrHorizonRadius,
		schwarzschildTimeDilation,
		reissnerNordstromTimeDilation,
		rnHorizonRadii,
		PHYSICAL_GW_STRAIN
	} from '$lib/visualizations/spacetime-laboratory/spacetimeMath';
	import {
		flrwScaleFactorAt,
		flrwHubbleTime
	} from '$lib/visualizations/spacetime-laboratory/spacetimeCosmology';

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
	const PAD = { l: 38, r: 10, t: 14, b: 24 };

	function makeCurve(fn: (x: number) => number, x0: number, x1: number, n = 90): Curve {
		const pts: Curve = [];
		for (let i = 0; i <= n; i++) {
			const x = x0 + ((x1 - x0) * i) / n;
			const y = fn(x);
			if (Number.isFinite(y)) pts.push({ x, y });
		}
		return pts;
	}
	function scale(curve: Curve) {
		const x0 = Math.min(...curve.map((p) => p.x));
		const x1 = Math.max(...curve.map((p) => p.x));
		const y0 = Math.min(0, ...curve.map((p) => p.y)) * 1.08;
		const y1 = Math.max(0, ...curve.map((p) => p.y)) * 1.08 || 1;
		return {
			px: (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r),
			py: (y: number) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b),
			x0,
			x1,
			y0,
			y1
		};
	}
	function path(curve: Curve): string {
		const { px, py } = scale(curve);
		return curve
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
			.join(' ');
	}
	function smoothstep(a: number, b: number, x: number) {
		const y = Math.min(1, Math.max(0, (x - a) / (b - a)));
		return y * y * (3 - 2 * y);
	}
	let model = $derived(store.state.model);
	let params = $derived(store.state.params);
	let graph = $derived.by((): GraphSpec => {
		if (model === 'schwarzschild' || model === 'reissner-nordstrom') {
			const rn = model === 'reissner-nordstrom';
			const horizon = rn ? rnHorizonRadii(params.rnCharge)?.outer : 2;
			return {
				title: `${rn ? 'RN' : 'Schwarzschild'} static clock relative to infinity`,
				xLabel: 'r / M',
				yLabel: 'dτ/dt',
				curve: makeCurve(
					(r) =>
						rn
							? (reissnerNordstromTimeDilation(r, params.rnCharge) ?? 0)
							: schwarzschildTimeDilation(r),
					(horizon ?? 0.5) + 0.01,
					20
				),
				marks: horizon === undefined ? [] : [{ x: horizon, label: 'horizon' }]
			};
		}
		if (model === 'kerr')
			return {
				title: 'Analytic Kerr outer horizon vs spin',
				xLabel: 'a / M',
				yLabel: 'r₊ / M',
				curve: makeCurve((a) => kerrHorizonRadius(a), 0, 0.998),
				marks: [{ x: params.kerrSpin, label: 'selected' }]
			};
		if (model === 'weak-field') {
			const strength =
				params.weakCompactness * (params.weakMode === 'physical' ? 1 : params.weakExaggeration);
			return {
				title: 'Weak-bending reference α ≈ 4μ/b (magnification included)',
				xLabel: 'b (scene units)',
				yLabel: 'α (rad)',
				curve: makeCurve((b) => (4 * strength) / b, 10, 100),
				marks: []
			};
		}
		if (model === 'flrw')
			return {
				title: 'Mixed-density Friedmann solution; a(0) = 1',
				xLabel: 'H₀ Δt (from reference epoch)',
				yLabel: 'a(t)',
				curve: makeCurve((t) => flrwScaleFactorAt(t, params).scaleFactor, 0, 4),
				marks: []
			};
		if (model === 'de-sitter')
			return {
				title: 'Analytic de Sitter flat slicing: a = exp(Ht)',
				xLabel: 't (normalized)',
				yLabel: 'a(t)',
				curve: makeCurve((t) => Math.exp(params.lambdaH0 * t), 0, 2),
				marks: []
			};
		if (model === 'anti-de-sitter')
			return {
				title: 'Analytic static AdS clock factor √(1 + r²/L²)',
				xLabel: 'r (normalized)',
				yLabel: 'dτ/dt',
				curve: makeCurve((r) => Math.sqrt(1 + (r * r) / params.adSLength ** 2), 0, 2),
				marks: []
			};
		if (model === 'gravitational-wave') {
			const amplitude = Math.min(
				0.5,
				params.gwAmplitude *
					PHYSICAL_GW_STRAIN *
					(params.gwScale === 'physical' ? 1 : params.gwExaggeration)
			);
			return {
				title: 'Displayed strain h(t); schematic chirp',
				xLabel: 't (s, animation)',
				yLabel: 'h(t)',
				curve: makeCurve(
					(t) => {
						const local = t % 6;
						const fraction = local / 6;
						const envelope = params.gwChirp
							? smoothstep(0, 0.75, fraction) * (1 - smoothstep(0.9, 1, fraction))
							: 1;
						const phaseTime = params.gwChirp ? local * (1 + 2 * fraction * fraction) : t;
						return (
							amplitude *
							envelope *
							Math.cos(2 * Math.PI * params.gwFrequency * phaseTime + params.gwPhase)
						);
					},
					0,
					6,
					240
				),
				marks: []
			};
		}
		return {
			title: 'Flat spacetime: no gravitational clock shift',
			xLabel: 'r (scene units)',
			yLabel: 'dτ/dt',
			curve: makeCurve(() => 1, 0, 20),
			marks: []
		};
	});
	let graphScale = $derived(scale(graph.curve));
	let marks = $derived(
		model === 'flrw' ? [{ x: flrwHubbleTime(params, store.time), label: 'now' }] : graph.marks
	);
	function numberLabel(value: number) {
		return Math.abs(value) > 0 && Math.abs(value) < 0.001
			? value.toExponential(0)
			: value.toFixed(2);
	}
</script>

<figure class="graph" aria-label={graph.title}>
	<figcaption>{graph.title}</figcaption>
	<svg
		viewBox="0 0 {W} {H}"
		role="img"
		aria-label={graph.title}
		preserveAspectRatio="xMidYMid meet"
	>
		<line x1={PAD.l} y1={graphScale.py(0)} x2={W - PAD.r} y2={graphScale.py(0)} class="axis" />
		<line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} class="axis" />
		<path d={path(graph.curve)} class="curve" fill="none" />
		{#each marks.filter((mark) => mark.x >= graphScale.x0 && mark.x <= graphScale.x1) as mark (mark.label)}
			{@const x = graphScale.px(mark.x)}
			<line x1={x} y1={PAD.t} x2={x} y2={H - PAD.b} class="mark" />
			<text {x} y={PAD.t + 8} class="mark-label">{mark.label}</text>
		{/each}
		<text x={PAD.l - 3} y={PAD.t + 1} class="tick" text-anchor="end"
			>{numberLabel(graphScale.y1)}</text
		>
		<text x={PAD.l - 3} y={H - PAD.b} class="tick" text-anchor="end"
			>{numberLabel(graphScale.y0)}</text
		>
		<text x={PAD.l} y={H - PAD.b + 9} class="tick">{graphScale.x0.toFixed(1)}</text>
		<text x={W - PAD.r} y={H - PAD.b + 9} class="tick" text-anchor="end"
			>{graphScale.x1.toFixed(1)}</text
		>
		<text x={(PAD.l + W - PAD.r) / 2} y={H - 3} class="axis-label">{graph.xLabel}</text>
		<text
			x={8}
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
	.tick {
		fill: #a1abc7;
		font-size: 7px;
	}
	.axis-label {
		fill: #7a82a3;
		font-size: 8.5px;
		text-anchor: middle;
	}
</style>
