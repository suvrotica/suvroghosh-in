<script lang="ts">
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import { SPACETIME_PRESETS } from '$lib/visualizations/spacetime-laboratory/spacetimeState';
	import {
		SPACETIME_MODELS,
		type OverlayKey,
		type QualityLevel,
		type SpacetimeModel
	} from '$lib/visualizations/spacetime-laboratory/spacetimeTypes';
	import { EXTREMAL_SPIN } from '$lib/visualizations/spacetime-laboratory/spacetimeMath';

	type Props = {
		store: SpacetimeStore;
		onsave?: () => void;
		onshare?: () => void;
		onfullscreen?: () => void;
	};

	let { store, onsave, onshare, onfullscreen }: Props = $props();
	let uid = $props.id();

	const modelLabels: Record<SpacetimeModel, string> = {
		minkowski: 'Flat spacetime (Minkowski)',
		'weak-field': 'Newtonian weak-field limit',
		schwarzschild: 'Schwarzschild black hole',
		kerr: 'Kerr rotating black hole',
		'reissner-nordstrom': 'Reissner–Nordström charged hole',
		flrw: 'FLRW expanding universe',
		'de-sitter': 'de Sitter (positive Λ)',
		'anti-de-sitter': 'anti-de Sitter (negative Λ)',
		'gravitational-wave': 'Gravitational-wave spacetime'
	};

	const overlayLabels: { key: OverlayKey; label: string; hint: string }[] = [
		{ key: 'grid', label: 'Coordinate grid', hint: 'A coordinate mesh on the equatorial plane.' },
		{
			key: 'photonPaths',
			label: 'Photon paths',
			hint: 'Show how light rays curve through the geometry.'
		},
		{
			key: 'horizon',
			label: 'Event horizon',
			hint: 'Mark the boundary from which light cannot return.'
		},
		{
			key: 'photonSphere',
			label: 'Photon sphere',
			hint: 'Unstable circular light orbit at r = 3M.'
		},
		{ key: 'isco', label: 'ISCO', hint: 'Innermost stable circular orbit at r = 6M.' },
		{
			key: 'ergosphere',
			label: 'Ergosphere',
			hint: 'Kerr region where nothing can remain static.'
		},
		{ key: 'redshiftMap', label: 'Redshift map', hint: 'Tint the scene by gravitational redshift.' }
	];

	let model = $derived(store.state.model);
	let compare = $derived(store.state.compare);
	let params = $derived(store.state.params);
	let observer = $derived(store.state.observer);
	let overlays = $derived(store.state.overlays);
	let quality = $derived(store.state.quality);

	const blackHoleModels: SpacetimeModel[] = ['schwarzschild', 'kerr', 'reissner-nordstrom'];
	let isBlackHole = $derived(blackHoleModels.includes(model));
	let isWeak = $derived(model === 'weak-field');
	let isKerr = $derived(model === 'kerr');
	let isRN = $derived(model === 'reissner-nordstrom');
	let isFLRW = $derived(model === 'flrw');
	let isDS = $derived(model === 'de-sitter');
	let isAdS = $derived(model === 'anti-de-sitter');
	let isGW = $derived(model === 'gravitational-wave');
	let isMinkowski = $derived(model === 'minkowski');
</script>

<div class="grid gap-5 p-4 sm:p-5 lg:grid-cols-2 xl:grid-cols-3">
	<!-- Spacetime -->
	<fieldset class="spacetime-group">
		<legend>Spacetime</legend>
		<label for="{uid}-model">Metric solution</label>
		<select
			id="{uid}-model"
			value={model}
			onchange={(e) =>
				store.setModel((e.currentTarget as HTMLSelectElement).value as SpacetimeModel)}
		>
			{#each SPACETIME_MODELS as m (m)}
				<option value={m}>{modelLabels[m]}</option>
			{/each}
		</select>
		<p class="hint">Choose which exact solution or limit of the field equation shapes the light.</p>

		<label for="{uid}-preset">Scene preset</label>
		<select
			id="{uid}-preset"
			value=""
			onchange={(e) => store.loadPreset((e.currentTarget as HTMLSelectElement).value)}
		>
			<option value="" disabled selected>Load a preset…</option>
			{#each SPACETIME_PRESETS as preset (preset.id)}
				<option value={preset.id}>{preset.label}</option>
			{/each}
		</select>
		<p class="hint">Presets move the camera, model, and parameters together.</p>

		<label class="check">
			<input
				type="checkbox"
				checked={compare}
				onchange={(e) => store.update({ compare: (e.currentTarget as HTMLInputElement).checked })}
			/>
			Split-screen comparison
		</label>
		{#if compare}
			<label for="{uid}-cmpmodel">Right-hand universe</label>
			<select
				id="{uid}-cmpmodel"
				value={store.state.compareModel}
				onchange={(e) =>
					store.update({
						compareModel: (e.currentTarget as HTMLSelectElement).value as SpacetimeModel
					})}
			>
				{#each SPACETIME_MODELS as m (m)}
					<option value={m}>{modelLabels[m]}</option>
				{/each}
			</select>
			<label for="{uid}-split">Divider position</label>
			<input
				id="{uid}-split"
				type="range"
				min="0.15"
				max="0.85"
				step="0.01"
				value={store.state.compareSplit}
				oninput={(e) =>
					store.update({ compareSplit: Number((e.currentTarget as HTMLInputElement).value) })}
			/>
		{/if}

		<label for="{uid}-quality">Integration quality</label>
		<select
			id="{uid}-quality"
			value={quality}
			onchange={(e) =>
				store.setQuality((e.currentTarget as HTMLSelectElement).value as QualityLevel)}
		>
			<option value="low">Low — smooth on phones</option>
			<option value="medium">Medium</option>
			<option value="high">High</option>
			<option value="research">Research — maximum steps</option>
		</select>
		<p class="hint">Higher quality integrates light more accurately at a GPU cost.</p>
	</fieldset>

	<!-- Central object -->
	{#if !isMinkowski && !isFLRW && !isDS && !isAdS && !isGW}
		<fieldset class="spacetime-group">
			<legend>Central object</legend>
			{#if isBlackHole}
				<label for="{uid}-mass">Mass <output>{params.massSolar.toExponential(1)} M☉</output></label>
				<input
					id="{uid}-mass"
					type="range"
					min="1"
					max="8"
					step="0.05"
					value={Math.log10(params.massSolar)}
					oninput={(e) =>
						store.setParam(
							'massSolar',
							Math.pow(10, Number((e.currentTarget as HTMLInputElement).value))
						)}
				/>
				<p class="hint">Log scale from one to one hundred million solar masses.</p>
			{/if}
			{#if isWeak}
				<label for="{uid}-weakmu"
					>Compactness GM/(rc²) <output>{params.weakCompactness.toFixed(3)}</output></label
				>
				<input
					id="{uid}-weakmu"
					type="range"
					min="0"
					max="0.35"
					step="0.005"
					value={params.weakCompactness}
					oninput={(e) =>
						store.setParam('weakCompactness', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<p class="hint">
					Zero is flat space; 0.5 would be a black hole. Keep it small for honest Newtonian physics.
				</p>
				<label for="{uid}-weakex"
					>Educational exaggeration <output>{params.weakExaggeration.toFixed(1)}×</output></label
				>
				<input
					id="{uid}-weakex"
					type="range"
					min="1"
					max="20"
					step="0.5"
					value={params.weakExaggeration}
					oninput={(e) =>
						store.setParam('weakExaggeration', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<label class="check">
					<input
						type="checkbox"
						checked={params.weakMode === 'physical'}
						onchange={(e) =>
							store.setParam(
								'weakMode',
								(e.currentTarget as HTMLInputElement).checked ? 'physical' : 'exaggerated'
							)}
					/>
					Physical scale (ignore exaggeration)
				</label>
			{/if}
			{#if isKerr}
				<label for="{uid}-spin"
					>Dimensionless spin a/M <output>{params.kerrSpin.toFixed(3)}</output></label
				>
				<input
					id="{uid}-spin"
					type="range"
					min="0"
					max={EXTREMAL_SPIN}
					step="0.005"
					value={params.kerrSpin}
					oninput={(e) =>
						store.setParam('kerrSpin', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<p class="hint">
					Zero reduces Kerr to Schwarzschild. {EXTREMAL_SPIN} is near-extremal; 1.0 is the physical limit.
				</p>
			{/if}
			{#if isRN}
				<label for="{uid}-charge"
					>Normalized charge Q/Q* <output>{params.rnCharge.toFixed(2)}</output></label
				>
				<input
					id="{uid}-charge"
					type="range"
					min="0"
					max="1.2"
					step="0.02"
					value={params.rnCharge}
					oninput={(e) =>
						store.setParam('rnCharge', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				{#if params.rnCharge > 1}
					<p class="warning" role="alert">
						Charge exceeds the extremal limit: this is no longer an ordinary Reissner–Nordström
						black hole but a naked-singularity regime.
					</p>
				{:else}
					<p class="hint">Zero reduces to Schwarzschild; 1.0 is extremal (horizons merge).</p>
				{/if}
			{/if}
		</fieldset>
	{/if}

	<!-- Cosmology -->
	{#if isFLRW || isDS || isAdS}
		<fieldset class="spacetime-group">
			<legend>Cosmology</legend>
			{#if isFLRW}
				<label for="{uid}-curv">Spatial curvature</label>
				<select
					id="{uid}-curv"
					value={params.flrwCurvature}
					onchange={(e) =>
						store.setParam(
							'flrwCurvature',
							Number((e.currentTarget as HTMLSelectElement).value) as -1 | 0 | 1
						)}
				>
					<option value={-1}>Open (k = −1)</option>
					<option value={0}>Flat (k = 0)</option>
					<option value={1}>Closed (k = +1)</option>
				</select>
				<label for="{uid}-om"
					>Matter density Ωₘ <output>{params.omegaMatter.toFixed(2)}</output></label
				>
				<input
					id="{uid}-om"
					type="range"
					min="0"
					max="1.2"
					step="0.01"
					value={params.omegaMatter}
					oninput={(e) =>
						store.setParam('omegaMatter', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<label for="{uid}-ol"
					>Dark-energy density ΩΛ <output>{params.omegaLambda.toFixed(2)}</output></label
				>
				<input
					id="{uid}-ol"
					type="range"
					min="0"
					max="1.5"
					step="0.01"
					value={params.omegaLambda}
					oninput={(e) =>
						store.setParam('omegaLambda', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<label for="{uid}-h0"
					>Hubble constant H₀ <output>{params.hubble.toFixed(0)} km/s/Mpc</output></label
				>
				<input
					id="{uid}-h0"
					type="range"
					min="20"
					max="120"
					step="1"
					value={params.hubble}
					oninput={(e) =>
						store.setParam('hubble', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<label for="{uid}-fspeed"
					>Expansion speed <output>{params.flrwSpeed.toFixed(2)}×</output></label
				>
				<input
					id="{uid}-fspeed"
					type="range"
					min="0"
					max="2"
					step="0.05"
					value={params.flrwSpeed}
					oninput={(e) =>
						store.setParam('flrwSpeed', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<label class="check">
					<input
						type="checkbox"
						checked={params.flrwView === 'proper'}
						onchange={(e) =>
							store.setParam(
								'flrwView',
								(e.currentTarget as HTMLInputElement).checked ? 'proper' : 'comoving'
							)}
					/>
					Proper-distance view (grid expands with a(t))
				</label>
			{/if}
			{#if isDS}
				<label for="{uid}-lh"
					>Cosmological constant strength <output>{params.lambdaH0.toFixed(2)}</output></label
				>
				<input
					id="{uid}-lh"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={params.lambdaH0}
					oninput={(e) =>
						store.setParam('lambdaH0', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<p class="hint">
					Zero is flat; higher values accelerate expansion and pull the cosmological horizon closer.
				</p>
			{/if}
			{#if isAdS}
				<label for="{uid}-al"
					>AdS curvature scale L <output>{params.adSLength.toFixed(2)}</output></label
				>
				<input
					id="{uid}-al"
					type="range"
					min="0.2"
					max="1"
					step="0.01"
					value={params.adSLength}
					oninput={(e) =>
						store.setParam('adSLength', Number((e.currentTarget as HTMLInputElement).value))}
				/>
				<p class="hint">
					Smaller L means stronger confining curvature — light refocuses instead of escaping.
				</p>
			{/if}
		</fieldset>
	{/if}

	<!-- Gravitational waves -->
	{#if isGW}
		<fieldset class="spacetime-group">
			<legend>Gravitational wave</legend>
			<label for="{uid}-gpol">Polarization</label>
			<select
				id="{uid}-gpol"
				value={params.gwPolarization}
				onchange={(e) =>
					store.setParam(
						'gwPolarization',
						(e.currentTarget as HTMLSelectElement).value as 'plus' | 'cross'
					)}
			>
				<option value="plus">Plus (+)</option>
				<option value="cross">Cross (×)</option>
			</select>
			<label for="{uid}-gamp">Amplitude <output>{params.gwAmplitude.toFixed(2)}</output></label>
			<input
				id="{uid}-gamp"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={params.gwAmplitude}
				oninput={(e) =>
					store.setParam('gwAmplitude', Number((e.currentTarget as HTMLInputElement).value))}
			/>
			<label for="{uid}-gfreq"
				>Frequency <output>{params.gwFrequency.toFixed(2)} Hz (visual)</output></label
			>
			<input
				id="{uid}-gfreq"
				type="range"
				min="0.05"
				max="2"
				step="0.05"
				value={params.gwFrequency}
				oninput={(e) =>
					store.setParam('gwFrequency', Number((e.currentTarget as HTMLInputElement).value))}
			/>
			<label class="check">
				<input
					type="checkbox"
					checked={params.gwChirp}
					onchange={(e) => store.setParam('gwChirp', (e.currentTarget as HTMLInputElement).checked)}
				/>
				Inspiral chirp (frequency & amplitude sweep up)
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={params.gwRing}
					onchange={(e) => store.setParam('gwRing', (e.currentTarget as HTMLInputElement).checked)}
				/>
				Test-particle ring
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={params.gwArms}
					onchange={(e) => store.setParam('gwArms', (e.currentTarget as HTMLInputElement).checked)}
				/>
				Interferometer arms
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={params.gwScale === 'physical'}
					onchange={(e) =>
						store.setParam(
							'gwScale',
							(e.currentTarget as HTMLInputElement).checked ? 'physical' : 'exaggerated'
						)}
				/>
				Physical strain scale
			</label>
			{#if params.gwScale === 'physical'}
				<label for="{uid}-gex"
					>Exaggeration factor <output>×{params.gwExaggeration.toExponential(0)}</output></label
				>
				<input
					id="{uid}-gex"
					type="range"
					min="18"
					max="24"
					step="0.1"
					value={Math.log10(params.gwExaggeration)}
					oninput={(e) =>
						store.setParam(
							'gwExaggeration',
							Math.pow(10, Number((e.currentTarget as HTMLInputElement).value))
						)}
				/>
				<p class="hint">
					Real strain is ~10⁻²¹. This factor magnifies it to visibility — always labelled.
				</p>
			{/if}
		</fieldset>
	{/if}

	<!-- Observer -->
	<fieldset class="spacetime-group">
		<legend>Observer</legend>
		<label for="{uid}-dist">Distance <output>{observer.distance.toFixed(1)} r_s</output></label>
		<input
			id="{uid}-dist"
			type="range"
			min="1.05"
			max="40"
			step="0.05"
			value={observer.distance}
			oninput={(e) =>
				store.setObserver('distance', Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<label for="{uid}-az">Azimuth <output>{observer.azimuthDeg.toFixed(0)}°</output></label>
		<input
			id="{uid}-az"
			type="range"
			min="0"
			max="359"
			step="1"
			value={observer.azimuthDeg}
			oninput={(e) =>
				store.setObserver('azimuthDeg', Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<label for="{uid}-el">Inclination <output>{observer.elevationDeg.toFixed(0)}°</output></label>
		<input
			id="{uid}-el"
			type="range"
			min="-85"
			max="85"
			step="1"
			value={observer.elevationDeg}
			oninput={(e) =>
				store.setObserver('elevationDeg', Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<label for="{uid}-fov"
			>Field of view <output>{observer.fieldOfViewDeg.toFixed(0)}°</output></label
		>
		<input
			id="{uid}-fov"
			type="range"
			min="20"
			max="110"
			step="1"
			value={observer.fieldOfViewDeg}
			oninput={(e) =>
				store.setObserver('fieldOfViewDeg', Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<label for="{uid}-speed"
			>Simulation speed <output>{store.state.simulationSpeed.toFixed(2)}×</output></label
		>
		<input
			id="{uid}-speed"
			type="range"
			min="0.05"
			max="4"
			step="0.05"
			value={store.state.simulationSpeed}
			oninput={(e) =>
				store.update({ simulationSpeed: Number((e.currentTarget as HTMLInputElement).value) })}
		/>
	</fieldset>

	<!-- Light and matter -->
	<fieldset class="spacetime-group">
		<legend>Light & matter</legend>
		{#if isBlackHole || isWeak}
			<label for="{uid}-dinner"
				>Disk inner radius <output>{store.state.disk.innerRadius.toFixed(1)} r_s</output></label
			>
			<input
				id="{uid}-dinner"
				type="range"
				min="1.6"
				max="12"
				step="0.1"
				value={store.state.disk.innerRadius}
				oninput={(e) =>
					store.setDisk('innerRadius', Number((e.currentTarget as HTMLInputElement).value))}
			/>
			<label for="{uid}-douter"
				>Disk outer radius <output>{store.state.disk.outerRadius.toFixed(1)} r_s</output></label
			>
			<input
				id="{uid}-douter"
				type="range"
				min="4"
				max="30"
				step="0.5"
				value={store.state.disk.outerRadius}
				oninput={(e) =>
					store.setDisk('outerRadius', Number((e.currentTarget as HTMLInputElement).value))}
			/>
			<label for="{uid}-dtemp"
				>Disk temperature <output>{store.state.disk.temperature.toFixed(2)}×</output></label
			>
			<input
				id="{uid}-dtemp"
				type="range"
				min="0.4"
				max="2"
				step="0.05"
				value={store.state.disk.temperature}
				oninput={(e) =>
					store.setDisk('temperature', Number((e.currentTarget as HTMLInputElement).value))}
			/>
			<label class="check">
				<input
					type="checkbox"
					checked={store.state.disk.beaming}
					onchange={(e) => store.setDisk('beaming', (e.currentTarget as HTMLInputElement).checked)}
				/>
				Relativistic beaming (bright approaching side)
			</label>
		{/if}
		<label for="{uid}-stars"
			>Star density <output>{store.state.sky.starDensity.toFixed(2)}×</output></label
		>
		<input
			id="{uid}-stars"
			type="range"
			min="0"
			max="2"
			step="0.05"
			value={store.state.sky.starDensity}
			oninput={(e) =>
				store.setSky('starDensity', Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<label class="check">
			<input
				type="checkbox"
				checked={store.state.sky.milkyWay}
				onchange={(e) => store.setSky('milkyWay', (e.currentTarget as HTMLInputElement).checked)}
			/>
			Milky-Way band
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={store.state.sky.galaxies}
				onchange={(e) => store.setSky('galaxies', (e.currentTarget as HTMLInputElement).checked)}
			/>
			Distant galaxies
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={store.state.sky.cmb}
				onchange={(e) => store.setSky('cmb', (e.currentTarget as HTMLInputElement).checked)}
			/>
			Cosmic microwave background mode
		</label>
	</fieldset>

	<!-- Overlays -->
	<fieldset class="spacetime-group">
		<legend>Overlays</legend>
		{#each overlayLabels as o (o.key)}
			<label class="check" title={o.hint}>
				<input
					type="checkbox"
					checked={overlays[o.key]}
					onchange={(e) => store.setOverlay(o.key, (e.currentTarget as HTMLInputElement).checked)}
				/>
				{o.label}
			</label>
		{/each}
	</fieldset>

	<!-- Session -->
	<fieldset class="spacetime-group">
		<legend>Session</legend>
		<div class="button-row">
			<button type="button" onclick={() => store.update({ playing: !store.state.playing })}>
				{store.state.playing ? 'Pause' : 'Play'}
			</button>
			<button type="button" onclick={() => store.reset()}>Reset</button>
			<button type="button" onclick={() => store.randomize()}>New sky seed</button>
		</div>
		<div class="button-row">
			<button type="button" onclick={onsave}>Save image</button>
			<button type="button" onclick={onshare}>Copy share link</button>
			<button type="button" onclick={onfullscreen}>Fullscreen</button>
		</div>
		<p class="hint fps">
			{store.fps > 0 ? `${store.fps} fps · ` : ''}{store.state.quality} quality
		</p>
	</fieldset>
</div>

<style>
	.spacetime-group {
		display: grid;
		gap: 0.45rem;
		align-content: start;
		border: 1px solid #2a2f45;
		border-radius: 0.75rem;
		padding: 0.9rem 1rem 1rem;
		background: #10131f;
	}
	.spacetime-group legend {
		padding: 0 0.4rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #7dd3fc;
	}
	.spacetime-group label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #dbe2f1;
	}
	.spacetime-group label output {
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
		font-weight: 500;
		color: #8b93b0;
	}
	.spacetime-group label.check {
		justify-content: flex-start;
		align-items: center;
		gap: 0.55rem;
		font-weight: 500;
		cursor: pointer;
	}
	.spacetime-group input[type='range'] {
		width: 100%;
		accent-color: #67e8f9;
	}
	.spacetime-group select {
		width: 100%;
		border: 1px solid #3a4160;
		border-radius: 0.45rem;
		background: #161a2b;
		color: #e5e9f5;
		padding: 0.45rem 0.55rem;
		font-size: 0.82rem;
	}
	.spacetime-group input[type='checkbox'] {
		accent-color: #67e8f9;
		width: 1rem;
		height: 1rem;
	}
	.hint {
		margin: -0.2rem 0 0.35rem;
		font-size: 0.72rem;
		line-height: 1.45;
		color: #7a82a3;
	}
	.warning {
		margin: 0.1rem 0 0.3rem;
		border-left: 3px solid #f59e0b;
		background: #2b2113;
		padding: 0.45rem 0.6rem;
		font-size: 0.74rem;
		line-height: 1.45;
		color: #fcd34d;
		border-radius: 0 0.4rem 0.4rem 0;
	}
	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.button-row button {
		min-height: 2.5rem;
		flex: 1 1 auto;
		border: 1px solid #3a4160;
		border-radius: 0.5rem;
		background: #1a1f33;
		color: #e5e9f5;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.45rem 0.7rem;
		cursor: pointer;
	}
	.button-row button:hover {
		border-color: #67e8f9;
		background: #22283f;
	}
	.fps {
		font-family: ui-monospace, monospace;
	}
	@media (prefers-reduced-motion: reduce) {
		.spacetime-group * {
			transition: none !important;
		}
	}
</style>
