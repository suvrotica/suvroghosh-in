<script lang="ts">
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import {
		kerrHorizonRadius,
		kerrIscoRadius,
		kerrStaticTimeDilation,
		rnHorizonRadii,
		rnPhotonSphereRadius,
		rnIscoRadius,
		reissnerNordstromTimeDilation,
		schwarzschildTimeDilation,
		schwarzschildRadiusKm,
		PHYSICAL_GW_STRAIN
	} from '$lib/visualizations/spacetime-laboratory/spacetimeMath';
	import { flrwSnapshot } from '$lib/visualizations/spacetime-laboratory/spacetimeCosmology';

	type Props = { store: SpacetimeStore };
	let { store }: Props = $props();
	let state = $derived(store.state);
	let model = $derived(state.model);
	let blackHole = $derived(['schwarzschild', 'kerr', 'reissner-nordstrom'].includes(model));

	const descriptions: Record<string, string> = {
		minkowski:
			'A seeded artificial sky viewed along straight rays in flat spacetime. This is the reference scene: no gravitational lensing or gravitational clock shift. The grid is a drawing aid.',
		'weak-field':
			'A bending approximation illustrates the weak-field trend. The compactness and labelled magnification control its strength. Large compactness or magnification leaves the weak-field regime; it is not a strong-field prediction.',
		schwarzschild:
			'Rays follow the spherical Schwarzschild null-geodesic equations with finite numerical steps. The shadow is a set of viewing directions whose rays are captured, not a material surface. Disk light, colours and beaming are illustrative.',
		kerr: 'This scene adds a spin-dependent swirl to illustrate a rotating black hole. It does not integrate Kerr geodesics, so its shadow shape and apparent photon paths are not quantitative predictions. The horizon, equatorial ISCO and static-clock readouts below use analytic Kerr formulas.',
		'reissner-nordstrom':
			'Rays follow spherical charged-black-hole null-geodesic equations for charge at or below the extremal limit. The horizon, photon orbit and clock depend on charge. The disk is illustrative. Above the extremal limit the renderer does not simulate the naked singularity.',
		flrw: 'The scale factor follows the mixed matter, radiation and vacuum Friedmann equations. The grid and sky are an expansion diagram, not a computed cosmological light cone. The displayed redshift compares light emitted at the reference epoch a=1 with this epoch; it is not a redshift assigned from each galaxy’s distance.',
		'de-sitter':
			'Positive cosmological constant admits an exponentially expanding flat slicing and an observer event horizon at c/H. The sky distortion and horizon circle here are schematic. Recession faster than c alone is not a general test of causal disconnection.',
		'anti-de-sitter':
			'Negative cosmological constant gives anti-de Sitter geometry. The patterned sky is a teaching metaphor, not integrated AdS light propagation. AdS has a timelike boundary whose boundary conditions matter; it is not a negative version of de Sitter exponential expansion.',
		'gravitational-wave':
			'A linear tensor-strain diagram deforms a test ring by h/2. Cross polarization rotates its axes by 45°. The drawn detector arms stay on the screen axes, so a pure cross wave has no first-order length response in those arms. The sky warp and repeating chirp are illustrative.'
	};

	let dilation = $derived.by((): number | null => {
		if (model === 'schwarzschild')
			return state.observer.distance > 2
				? schwarzschildTimeDilation(state.observer.distance)
				: null;
		if (model === 'kerr')
			return kerrStaticTimeDilation(
				state.observer.distance,
				state.params.kerrSpin,
				Math.PI / 2 - (state.observer.elevationDeg * Math.PI) / 180
			);
		if (model === 'reissner-nordstrom')
			return reissnerNordstromTimeDilation(state.observer.distance, state.params.rnCharge);
		return 1;
	});
	let rnRadii = $derived(rnHorizonRadii(state.params.rnCharge));
	let rnPhoton = $derived(rnPhotonSphereRadius(state.params.rnCharge));
	let rnIsco = $derived(rnIscoRadius(state.params.rnCharge));
	let cosmology = $derived(model === 'flrw' ? flrwSnapshot(state.params, store.time) : null);
	let gwUncapped = $derived(
		state.params.gwAmplitude *
			PHYSICAL_GW_STRAIN *
			(state.params.gwScale === 'physical' ? 1 : state.params.gwExaggeration)
	);
	let gwDisplay = $derived(Math.min(0.5, gwUncapped));
</script>

<aside class="seeing-panel" aria-label="What am I seeing">
	<p class="panel-kicker">What am I seeing?</p>
	<p class="description">{descriptions[model]}</p>
	<dl class="readouts">
		{#if blackHole}
			<div>
				<dt>Scene length unit</dt>
				<dd>M = GM/c²; r_s = 2M</dd>
			</div>
			<div>
				<dt>Physical r_s for chosen mass</dt>
				<dd>{schwarzschildRadiusKm(state.params.massSolar).toExponential(3)} km</dd>
			</div>
			<div>
				<dt>Static clock relative to infinity</dt>
				<dd>{dilation === null ? 'No static worldline here' : `dτ/dt = ${dilation.toFixed(4)}`}</dd>
			</div>
			{#if dilation !== null && dilation > 0}
				<div>
					<dt>Light emitted here, received at infinity</dt>
					<dd>z = {(1 / dilation - 1).toFixed(4)}</dd>
				</div>
			{/if}
		{/if}
		{#if model === 'minkowski'}
			<div>
				<dt>Gravitational clock ratio</dt>
				<dd>dτ/dt = 1</dd>
			</div>
		{/if}
		{#if model === 'schwarzschild'}
			<div>
				<dt>Event horizon</dt>
				<dd>2M = 1 r_s</dd>
			</div>
			<div>
				<dt>Photon sphere</dt>
				<dd>3M = 1.5 r_s</dd>
			</div>
			<div>
				<dt>Circular-orbit ISCO</dt>
				<dd>6M = 3 r_s</dd>
			</div>
		{/if}
		{#if model === 'kerr'}
			<div>
				<dt>Kerr outer horizon r₊</dt>
				<dd>{kerrHorizonRadius(state.params.kerrSpin).toFixed(3)} M</dd>
			</div>
			<div>
				<dt>Ergosphere at the equator</dt>
				<dd>2M</dd>
			</div>
			<div>
				<dt>Prograde equatorial ISCO</dt>
				<dd>{kerrIscoRadius(state.params.kerrSpin).toFixed(3)} M</dd>
			</div>
			<div>
				<dt>Photon orbits</dt>
				<dd>
					{state.params.kerrSpin === 0
						? 'Photon sphere at 3M (zero spin)'
						: 'No single spherical radius'}
				</dd>
			</div>
		{/if}
		{#if model === 'reissner-nordstrom'}
			{#if rnRadii}
				<div>
					<dt>Outer horizon</dt>
					<dd>{rnRadii.outer.toFixed(3)} M</dd>
				</div>
				<div>
					<dt>Inner horizon</dt>
					<dd>
						{state.params.rnCharge === 0
							? 'Absent at zero charge'
							: `${rnRadii.inner.toFixed(3)} M`}
					</dd>
				</div>
			{:else}
				<div>
					<dt>Horizons</dt>
					<dd>None: super-extremal charge</dd>
				</div>
			{/if}
			{#if rnPhoton !== null}<div>
					<dt>Outer circular photon orbit</dt>
					<dd>{rnPhoton.toFixed(3)} M</dd>
				</div>{/if}
			{#if rnIsco !== null}<div>
					<dt>Outermost ISCO</dt>
					<dd>{rnIsco.toFixed(3)} M</dd>
				</div>{/if}
		{/if}
		{#if model === 'flrw' && cosmology}
			<div>
				<dt>Scale factor a(t), reference a=1</dt>
				<dd>{cosmology.scaleFactor.toFixed(4)}</dd>
			</div>
			<div>
				<dt>Time since reference epoch</dt>
				<dd>{cosmology.elapsedGyr.toFixed(3)} Gyr</dd>
			</div>
			<div>
				<dt>Reference-epoch redshift</dt>
				<dd>z = {cosmology.redshift.toFixed(4)}</dd>
			</div>
			<div>
				<dt>Curvature density Ωk = 1 − ΣΩ</dt>
				<dd>{cosmology.omegaCurvature.toFixed(5)}</dd>
			</div>
			<div>
				<dt>Cosmological phase</dt>
				<dd>{cosmology.phase}</dd>
			</div>
		{/if}
		{#if model === 'gravitational-wave'}
			<div>
				<dt>Physical input strain h₀</dt>
				<dd>{(state.params.gwAmplitude * PHYSICAL_GW_STRAIN).toExponential(2)}</dd>
			</div>
			<div>
				<dt>Display magnification</dt>
				<dd>
					{state.params.gwScale === 'physical'
						? '1× (unmagnified)'
						: `${state.params.gwExaggeration.toExponential(1)}×`}
				</dd>
			</div>
			<div>
				<dt>Displayed peak h₀</dt>
				<dd>{gwDisplay.toExponential(2)}{gwUncapped > 0.5 ? ' (capped at 0.5)' : ''}</dd>
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
