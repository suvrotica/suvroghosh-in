<script lang="ts">
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import {
		gravitationalRedshift,
		kerrHorizonRadius,
		rnHorizonRadii,
		schwarzschildTimeDilation
	} from '$lib/visualizations/spacetime-laboratory/spacetimeMath';

	type Props = { store: SpacetimeStore };
	let { store }: Props = $props();

	let state = $derived(store.state);
	let model = $derived(state.model);

	const descriptions: Record<string, string> = {
		minkowski:
			'Straight light rays through flat spacetime. The grid is regular, stars stay where they are, and every clock ticks at the same rate. This is what “no gravity” looks like — the reference against which every other universe here is measured.',
		'weak-field':
			'A gentle gravitational well bends light only slightly and slows clocks only slightly. Increase compactness to approach the strong-field regime; the exaggeration slider magnifies the deflection for teaching, always labelled.',
		schwarzschild:
			'Light from the far side of the disk bends over and under the hole, so the disk appears warped above and below the shadow. Rays inside ~2.6 r_s are captured — the dark region is not a surface but the set of directions from which no light reaches you.',
		kerr: 'Rotation drags the geometry: the shadow is offset and deformed, prograde photons swing closer than retrograde ones, and the approaching side of the disk is boosted brighter and bluer. Increase spin toward 0.998 to strengthen the effect.',
		'reissner-nordstrom':
			'Electric charge adds a repulsive term to the metric, shrinking the shadow and creating a second, inner horizon. Astrophysical black holes are expected to be nearly neutral — this mode explores the mathematics of the solution family.',
		flrw: 'The comoving grid itself expands. Galaxies hold fixed comoving coordinates while proper distances grow, and light stretches: distant sources are redshifted by 1 + z = a_now/a_then. Bound systems — atoms, people, galaxies — do not expand with the flow.',
		'de-sitter':
			'Positive Λ drives accelerating expansion. Beyond the horizon at c/H, recession outruns light: those regions are causally disconnected from you, forever. A 2D screen can only gesture at the full four-dimensional geometry.',
		'anti-de-sitter':
			'Negative Λ acts like a confining potential. Light aimed outward curves back, and the grid echoes repeat — a cartoon of the refocusing property that makes AdS the stage for holographic physics.',
		'gravitational-wave':
			'A passing ripple of the metric alternately stretches and squeezes space perpendicular to its travel. The test-particle ring deforms; the interferometer arms change length in opposite phase. Real strain (~10⁻²¹) is multiplied by the labelled exaggeration factor.'
	};

	let dilation = $derived(
		model === 'schwarzschild' || model === 'kerr' || model === 'reissner-nordstrom'
			? schwarzschildTimeDilation(state.observer.distance)
			: 1
	);
	let redshift = $derived(
		model === 'schwarzschild' || model === 'kerr' || model === 'reissner-nordstrom'
			? gravitationalRedshift(state.observer.distance)
			: 1
	);
	let kerrRPlus = $derived(kerrHorizonRadius(state.params.kerrSpin));
	let rnRadii = $derived(rnHorizonRadii(Math.min(state.params.rnCharge, 1)));
</script>

<aside class="seeing-panel" aria-label="What am I seeing">
	<p class="panel-kicker">What am I seeing?</p>
	<p class="description">{descriptions[model]}</p>

	<dl class="readouts">
		{#if model === 'schwarzschild' || model === 'kerr' || model === 'reissner-nordstrom'}
			<div>
				<dt>Schwarzschild radius r_s</dt>
				<dd>2M (2 scene units)</dd>
			</div>
			<div>
				<dt>Photon sphere</dt>
				<dd>3M = 1.5 r_s</dd>
			</div>
			<div>
				<dt>ISCO</dt>
				<dd>6M = 3 r_s</dd>
			</div>
			<div>
				<dt>Your clock vs. infinity</dt>
				<dd>dτ/dt = {dilation.toFixed(3)} (z ≈ {(redshift - 1).toFixed(3)})</dd>
			</div>
		{/if}
		{#if model === 'kerr'}
			<div>
				<dt>Kerr outer horizon r₊</dt>
				<dd>{kerrRPlus.toFixed(3)} M</dd>
			</div>
			<div>
				<dt>Ergosphere (equator)</dt>
				<dd>2M</dd>
			</div>
		{/if}
		{#if model === 'reissner-nordstrom' && rnRadii}
			<div>
				<dt>Outer horizon r₊</dt>
				<dd>{rnRadii.outer.toFixed(3)} M</dd>
			</div>
			<div>
				<dt>Inner horizon r₋</dt>
				<dd>{rnRadii.inner.toFixed(3)} M</dd>
			</div>
		{/if}
		{#if model === 'flrw'}
			<div>
				<dt>Scale factor a(t)</dt>
				<dd>
					{(
						1 +
						(store.time % 60) * 0.04 * state.params.flrwSpeed * (state.params.hubble / 70)
					).toFixed(3)}
				</dd>
			</div>
			<div>
				<dt>Hubble constant</dt>
				<dd>{state.params.hubble.toFixed(0)} km/s/Mpc</dd>
			</div>
		{/if}
		{#if model === 'gravitational-wave'}
			<div>
				<dt>Display strain</dt>
				<dd>
					{state.params.gwScale === 'physical'
						? `h ≈ 10⁻²¹ × ${state.params.gwExaggeration.toExponential(0)} exaggeration`
						: `h ≈ ${(state.params.gwAmplitude * 0.12).toFixed(3)} (educational)`}
				</dd>
			</div>
		{/if}
	</dl>
</aside>

<style>
	.seeing-panel {
		border: 1px solid #2a2f45;
		border-radius: 0.75rem;
		background: #10131f;
		padding: 1rem 1.1rem;
	}
	.panel-kicker {
		margin: 0 0 0.35rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #7dd3fc;
	}
	.description {
		margin: 0 0 0.7rem;
		font-size: 0.82rem;
		line-height: 1.6;
		color: #b9c0d8;
	}
	.readouts {
		display: grid;
		gap: 0.3rem;
		margin: 0;
	}
	.readouts div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid #1d2236;
		padding-top: 0.3rem;
	}
	dt {
		font-size: 0.74rem;
		color: #7a82a3;
	}
	dd {
		margin: 0;
		font-family: ui-monospace, monospace;
		font-size: 0.74rem;
		color: #a5f3fc;
	}
</style>
