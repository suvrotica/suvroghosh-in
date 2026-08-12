<script lang="ts">
	import type {
		PreferencesState,
		OverlayPreferences,
		ProjectionMode,
		SurfaceMode,
		ViewportQuality
	} from '$lib/visualizations/gastropod-shell-lab/state/preferences-state.svelte';
	import type { CameraAction } from './Viewport3D.svelte';
	interface Props {
		preferences: PreferencesState;
		oncamera: (action: CameraAction) => void;
		ontoggleoverlay: (name: keyof OverlayPreferences) => void;
		onprojection: (mode: ProjectionMode) => void;
		onsurfacemode: (mode: SurfaceMode) => void;
		onquality: (quality: ViewportQuality) => void;
		onaccesschange: () => void;
	}
	let {
		preferences,
		oncamera,
		ontoggleoverlay,
		onprojection,
		onsurfacemode,
		onquality,
		onaccesschange
	}: Props = $props();
	let expanded = $state(false);
</script>

<div class="view-toolbar" aria-label="3D specimen view tools">
	<div class="primary-tools">
		<button
			class="icon-button"
			type="button"
			title="Frame shell (F)"
			aria-label="Frame shell"
			onclick={() => oncamera('frame')}>⌗</button
		>
		<button
			class="icon-button"
			type="button"
			title="Reset view (R)"
			aria-label="Reset view"
			onclick={() => oncamera('reset')}>⟳</button
		>
		<button
			class="icon-button"
			type="button"
			title="Aperture view (1)"
			aria-label="Aperture view"
			onclick={() => oncamera('aperture')}>1</button
		>
		<button
			class="icon-button"
			type="button"
			title="Apex view (2)"
			aria-label="Apex view"
			onclick={() => oncamera('apex')}>2</button
		>
		<button
			class="icon-button"
			type="button"
			title="Side view (3)"
			aria-label="Side view"
			onclick={() => oncamera('side')}>3</button
		>
		<button
			class="icon-button"
			type="button"
			title="Top view (4)"
			aria-label="Top view"
			onclick={() => oncamera('top')}>4</button
		>
		<button
			class="tool-button"
			type="button"
			aria-pressed={preferences.projection === 'orthographic'}
			onclick={() =>
				onprojection(preferences.projection === 'perspective' ? 'orthographic' : 'perspective')}
			>{preferences.projection === 'perspective' ? 'Perspective' : 'Orthographic'}</button
		>
		<button
			class="tool-button"
			type="button"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}>Overlays</button
		>
	</div>
	{#if expanded}
		<div class="overlay-menu">
			<fieldset>
				<legend>Construction</legend>
				{#each [['axis', 'Coiling axis'], ['centerline', 'Centreline'], ['aperture', 'Current aperture'], ['recentRings', 'Recent rings'], ['historicalApertures', 'Historical ghosts'], ['frame', 'Local frame'], ['accretionVectors', 'Accretion decomposition']] as item (item[0])}<label
						><input
							type="checkbox"
							checked={preferences.overlays[item[0] as keyof OverlayPreferences]}
							onchange={() => ontoggleoverlay(item[0] as keyof OverlayPreferences)}
						/><span>{item[1]}</span></label
					>{/each}
			</fieldset>
			<fieldset>
				<legend>View</legend>
				{#each [['grid', 'Scale grid'], ['groundShadow', 'Ground shadow'], ['cutaway', 'Cutaway plane']] as item (item[0])}<label
						><input
							type="checkbox"
							checked={preferences.overlays[item[0] as keyof OverlayPreferences]}
							onchange={() => ontoggleoverlay(item[0] as keyof OverlayPreferences)}
						/><span>{item[1]}</span></label
					>{/each}
			</fieldset>
			<label class="select"
				><span>Surface</span><select
					value={preferences.surfaceMode}
					onchange={(event) =>
						onsurfacemode((event.currentTarget as HTMLSelectElement).value as SurfaceMode)}
					><option value="solid">Solid</option><option value="wireframe">Wireframe</option><option
						value="instability">Instability proxy colour</option
					></select
				></label
			>
			<label class="select"
				><span>Quality</span><select
					value={preferences.quality}
					onchange={(event) =>
						onquality((event.currentTarget as HTMLSelectElement).value as ViewportQuality)}
					><option value="auto">Auto</option><option value="low">Low</option><option
						value="balanced">Balanced</option
					><option value="fine">Fine</option></select
				></label
			>
			<fieldset>
				<legend>Access</legend>
				<label
					><input
						type="checkbox"
						checked={preferences.highContrast}
						onchange={(event) => {
							preferences.highContrast = (event.currentTarget as HTMLInputElement).checked;
							onaccesschange();
						}}
					/><span>High contrast</span></label
				>
				<label
					><input
						type="checkbox"
						checked={preferences.reducedMotion}
						onchange={(event) => {
							preferences.reducedMotion = (event.currentTarget as HTMLInputElement).checked;
							onaccesschange();
						}}
					/><span>Reduced motion</span></label
				>
			</fieldset>
			<label class="select"
				><span>Theme</span><select
					value={preferences.theme}
					onchange={(event) => {
						preferences.theme = (event.currentTarget as HTMLSelectElement).value as
							| 'dark'
							| 'light';
						onaccesschange();
					}}
					><option value="dark">Dark laboratory</option><option value="light"
						>Light laboratory</option
					></select
				></label
			>
		</div>
	{/if}
</div>

<style>
	.view-toolbar {
		position: absolute;
		z-index: 11;
		top: 0.8rem;
		right: 0.8rem;
	}
	.primary-tools {
		display: flex;
		gap: 0.3rem;
		padding: 0.28rem;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: color-mix(in srgb, var(--panel) 86%, transparent);
		box-shadow: var(--shadow);
		backdrop-filter: blur(8px);
	}
	.primary-tools .icon-button {
		width: 32px;
		height: 32px;
		min-height: 32px;
		font-size: 0.65rem;
	}
	.primary-tools .tool-button {
		min-height: 32px;
		padding: 0.32rem 0.48rem;
		font-size: 0.58rem;
	}
	.overlay-menu {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
		width: 300px;
		padding: 0.7rem;
		border: 1px solid var(--line-bright);
		border-radius: 9px;
		background: var(--panel);
		box-shadow: var(--shadow);
	}
	fieldset {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend,
	.select > span {
		margin-bottom: 0.25rem;
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	fieldset label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 26px;
		font-size: 0.58rem;
		color: var(--muted);
	}
	fieldset input {
		width: 15px;
		height: 15px;
		accent-color: var(--cyan);
	}
	.select {
		display: grid;
		gap: 0.25rem;
	}
	.select select {
		min-height: 34px;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.6rem;
	}
	@media (max-width: 720px) {
		.view-toolbar {
			top: 3.55rem;
			right: 0.5rem;
		}
		.primary-tools .icon-button:nth-child(3),
		.primary-tools .icon-button:nth-child(4),
		.primary-tools .icon-button:nth-child(5),
		.primary-tools .icon-button:nth-child(6),
		.primary-tools .tool-button:first-of-type {
			display: none;
		}
		.overlay-menu {
			width: min(300px, calc(100vw - 1rem));
			grid-template-columns: 1fr;
		}
		.primary-tools .icon-button,
		.primary-tools .tool-button {
			min-height: 40px;
			height: 40px;
		}
	}
</style>
