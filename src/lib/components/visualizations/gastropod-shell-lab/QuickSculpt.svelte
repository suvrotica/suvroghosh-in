<script lang="ts">
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model/recipe-schema';
	import ParameterControl from './ParameterControl.svelte';

	export type LockGroup = 'coiling' | 'aperture' | 'ornament' | 'handedness';

	interface Props {
		recipe: ShellRecipe;
		unsafeRange: boolean;
		locks: Record<LockGroup, boolean>;
		onunsafechange: (value: boolean) => void;
		onlockchange: (group: LockGroup, value: boolean) => void;
		onbegin: () => void;
		onpreview: (mutator: (draft: ShellRecipe) => void) => void;
		oncommit: () => void;
		onsurprise: () => void;
	}

	let {
		recipe,
		unsafeRange,
		locks,
		onunsafechange,
		onlockchange,
		onbegin,
		onpreview,
		oncommit,
		onsurprise
	}: Props = $props();

	let ornamentLevel = $derived.by(() => {
		if (recipe.ornament.hierarchy.enabled && recipe.ornament.hierarchy.depth > 0) return 4;
		if (recipe.ornament.spines.enabled && recipe.ornament.spines.length > 0) return 3;
		if (recipe.ornament.varices.enabled && recipe.ornament.varices.amplitude > 0) return 2;
		if (recipe.ornament.ribs.enabled && recipe.ornament.ribs.amplitude > 0) return 1;
		return 0;
	});

	function previewField(mutator: (draft: ShellRecipe) => void): void {
		onpreview(mutator);
	}

	function setOrnament(level: number): void {
		previewField((draft) => {
			const rounded = Math.round(level);
			draft.ornament.ribs.enabled = rounded >= 1;
			draft.ornament.ribs.amplitude = rounded >= 1 ? 0.075 : 0;
			draft.ornament.varices.enabled = rounded >= 2;
			draft.ornament.varices.amplitude = rounded >= 2 ? 0.2 : 0;
			draft.ornament.spines.enabled = rounded >= 3;
			draft.ornament.spines.length = rounded >= 3 ? (rounded === 4 ? 0.55 : 0.38) : 0;
			draft.ornament.hierarchy.enabled = rounded >= 4;
			draft.ornament.hierarchy.depth = rounded >= 4 ? 3 : 0;
			draft.ornament.hierarchy.amplitude = rounded >= 4 ? 0.16 : 0;
		});
	}

	function selectProfile(event: Event): void {
		const profile = (event.currentTarget as HTMLSelectElement)
			.value as ShellRecipe['aperture']['profile'];
		onbegin();
		previewField((draft) => {
			draft.aperture.profile = profile;
			if (profile === 'circle') draft.aperture.aspectRatio = 1;
			if (profile === 'ellipse' && Math.abs(draft.aperture.aspectRatio - 1) < 0.02)
				draft.aperture.aspectRatio = 1.35;
			if (profile === 'lobed') draft.aperture.lobeAmplitude = 0.12;
		});
		oncommit();
	}

	const ornamentNames = ['Smooth', 'Ribbed', 'Variced', 'Spiny', 'Hierarchical'];
</script>

<section class="quick-sculpt" aria-labelledby="quick-sculpt-title">
	<div class="section-heading">
		<div>
			<p class="panel-title">Shape in seconds</p>
			<h2 id="quick-sculpt-title">Quick Sculpt</h2>
		</div>
		<span class="badge cyan">{recipe.engine === 'analytic' ? '6 controls' : '5 controls'}</span>
	</div>

	{#if recipe.engine === 'analytic'}
		<div class="control-card">
			<div class="mini-diagram coil" aria-hidden="true"><i></i><i></i><i></i></div>
			<ParameterControl
				id="quick-expansion"
				label="Coil tightness"
				symbol="W"
				value={recipe.coiling.whorlExpansion}
				min={unsafeRange ? 0.4 : 1.03}
				max={unsafeRange ? 14 : 6}
				step={0.01}
				defaultValue={2.35}
				unit="factor / turn"
				equation="W = exp(2πa)"
				explanation="The proportional radial expansion after one full turn. Values near one make a tight, slowly opening coil."
				{onbegin}
				onpreview={(value) => previewField((draft) => (draft.coiling.whorlExpansion = value))}
				{oncommit}
			/>
			<button
				class="lock"
				type="button"
				aria-pressed={locks.coiling}
				aria-label={`${locks.coiling ? 'Unlock' : 'Lock'} analytic coiling during Surprise me`}
				onclick={() => onlockchange('coiling', !locks.coiling)}
			>
				{locks.coiling ? 'Locked' : 'Lock'}
			</button>
		</div>

		<div class="control-card">
			<div class="mini-diagram spire" aria-hidden="true"><i></i><i></i><i></i></div>
			<ParameterControl
				id="quick-spire"
				label="Spire height"
				symbol="H/R"
				value={recipe.coiling.axial.coneSpireRatio}
				min={unsafeRange ? -2 : 0}
				max={unsafeRange ? 6 : 3}
				step={0.01}
				defaultValue={0.78}
				unit="dimensionless"
				equation="z = z₀ + q[r(θ) − r(θ₀)]"
				explanation="Cone-similar axial rise. Zero makes a planispiral; larger values build a taller spire."
				{onbegin}
				onpreview={(value) =>
					previewField((draft) => {
						draft.coiling.axial.coneSpireRatio = value;
						draft.coiling.axial.mode = Math.abs(value) < 0.001 ? 'planispiral' : 'cone-similar';
					})}
				{oncommit}
			/>
		</div>
	{:else}
		<p class="engine-note">
			<strong>Living-aperture mode.</strong> Analytic coil, axial-rise and meander controls are hidden
			because they do not determine the normalized Model B form. Use Advanced → Growth for the local speed,
			growth, curvature and frame-twist laws.
		</p>
		<div class="control-card">
			<div class="mini-diagram coil" aria-hidden="true"><i></i><i></i><i></i></div>
			<ParameterControl
				id="quick-integration-span"
				label="Integration span"
				symbol="N"
				value={recipe.coiling.turns}
				min={2}
				max={12}
				step={0.05}
				defaultValue={5.25}
				unit="turn-equivalent span"
				equation="Δθ = 2πN"
				explanation="Sets how long the authored local-frame rates are integrated. It changes the deposited trajectory, unlike the stored analytic coil and axial settings."
				{onbegin}
				onpreview={(value) => previewField((draft) => (draft.coiling.turns = value))}
				{oncommit}
			/>
			<button
				class="lock"
				type="button"
				aria-pressed={locks.coiling}
				aria-label={`${locks.coiling ? 'Unlock' : 'Lock'} integration span during Surprise me`}
				onclick={() => onlockchange('coiling', !locks.coiling)}
			>
				{locks.coiling ? 'Locked' : 'Lock'}
			</button>
		</div>
	{/if}

	<div class="control-card">
		<div class="mini-diagram aperture" aria-hidden="true"><i></i><i></i></div>
		<ParameterControl
			id="quick-aperture"
			label={recipe.engine === 'analytic' ? 'Aperture size & overlap' : 'Relative aperture size'}
			symbol="A/R"
			value={recipe.aperture.scale}
			min={0.03}
			max={unsafeRange ? 2.5 : 1.2}
			step={0.005}
			defaultValue={0.48}
			unit="axis-distance ratio"
			equation="X = C + s(pₓE₁ + pᵧE₂)"
			explanation={recipe.engine === 'analytic'
				? 'The adult opening size relative to the coiling axis. Larger values hide earlier whorls and may create overlap.'
				: 'The adult opening size relative to the local-frame path scale. Larger openings can overlap earlier deposited rings.'}
			{onbegin}
			onpreview={(value) => previewField((draft) => (draft.aperture.scale = value))}
			{oncommit}
		/>
		<button
			class="lock"
			type="button"
			aria-pressed={locks.aperture}
			aria-label={`${locks.aperture ? 'Unlock' : 'Lock'} aperture during Surprise me`}
			onclick={() => onlockchange('aperture', !locks.aperture)}
		>
			{locks.aperture ? 'Locked' : 'Lock'}
		</button>
	</div>

	<div class="select-card">
		<div class="select-copy">
			<span class="control-label">Aperture shape <em>p(u)</em></span>
			<span>The opening carried through the shell's history.</span>
		</div>
		<select
			aria-label="Aperture profile family"
			value={recipe.aperture.profile}
			onchange={selectProfile}
		>
			<option value="circle">Circle</option>
			<option value="ellipse">Ellipse</option>
			<option value="superellipse">Superellipse</option>
			<option value="rounded-polygon">Rounded polygon</option>
			<option value="lobed">Lobed</option>
			<option value="fourier">Fourier</option>
		</select>
	</div>

	<div class="control-card ornament-card">
		<div class="ornament-scale" aria-hidden="true">
			{#each ornamentNames as name, index (name)}
				<span class:active={index === ornamentLevel}>{name}</span>
			{/each}
		</div>
		<ParameterControl
			id="quick-ornament"
			label="Ornament character"
			symbol="D(θ,u)"
			value={ornamentLevel}
			min={0}
			max={4}
			step={1}
			defaultValue={0}
			unit={ornamentNames[ornamentLevel]}
			equation="X̃ = X + D(θ,u)n"
			explanation="Moves continuously from smooth growth to ribs, episodic varices, spines, and a finite hierarchy."
			{onbegin}
			onpreview={setOrnament}
			{oncommit}
			format={(value) => ornamentNames[Math.round(value)]}
		/>
		<button
			class="lock"
			type="button"
			aria-pressed={locks.ornament}
			aria-label={`${locks.ornament ? 'Unlock' : 'Lock'} ornament during Surprise me`}
			onclick={() => onlockchange('ornament', !locks.ornament)}
		>
			{locks.ornament ? 'Locked' : 'Lock'}
		</button>
	</div>

	<div class="handedness-card">
		<div>
			<span class="control-label">Handedness <em>χ</em></span>
			<span class="control-note"
				>{recipe.engine === 'analytic'
					? 'Mirrors coiling and reverses mesh winding.'
					: 'Sets integrated path orientation and mesh winding.'}</span
			>
		</div>
		<div class="segmented" role="group" aria-label="Shell handedness">
			<button
				type="button"
				aria-pressed={recipe.coiling.handedness === -1}
				onclick={() => {
					onbegin();
					previewField((draft) => (draft.coiling.handedness = -1));
					oncommit();
				}}>Left</button
			>
			<button
				type="button"
				aria-pressed={recipe.coiling.handedness === 1}
				onclick={() => {
					onbegin();
					previewField((draft) => (draft.coiling.handedness = 1));
					oncommit();
				}}>Right</button
			>
		</div>
		<button
			class="lock"
			type="button"
			aria-pressed={locks.handedness}
			onclick={() => onlockchange('handedness', !locks.handedness)}
		>
			{locks.handedness ? 'Locked' : 'Lock'}
		</button>
	</div>

	<div class="surprise-row">
		<button class="primary-button surprise" type="button" onclick={onsurprise}>
			<span aria-hidden="true">✦</span> Surprise me
		</button>
		<label class="range-toggle">
			<input
				type="checkbox"
				checked={unsafeRange}
				onchange={(event) => onunsafechange((event.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Unsafe laboratory range</span>
		</label>
	</div>
</section>

<style>
	.quick-sculpt {
		padding: 1rem;
	}

	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.9rem;
	}

	.engine-note {
		margin: 0 0 0.52rem;
		padding: 0.62rem 0.7rem;
		border-left: 2px solid var(--amber);
		background: color-mix(in srgb, var(--amber-soft) 12%, transparent);
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--muted);
	}

	.engine-note strong {
		color: var(--amber);
	}

	h2 {
		margin: 0.16rem 0 0;
		font-size: 1.1rem;
		font-weight: 650;
	}

	.control-card,
	.select-card,
	.handedness-card {
		position: relative;
		margin-bottom: 0.52rem;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: color-mix(in srgb, var(--panel-2) 55%, transparent);
		overflow: hidden;
	}

	.control-card :global(.parameter) {
		padding-left: 3.35rem;
	}

	.control-card.ornament-card :global(.parameter) {
		padding-left: 0.8rem;
	}

	.lock {
		position: absolute;
		top: 0.48rem;
		right: 0.48rem;
		z-index: 2;
		padding: 0.18rem 0.36rem;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		font-size: 0.55rem;
		color: var(--faint);
	}

	.lock:hover,
	.lock[aria-pressed='true'] {
		border-color: var(--line);
		color: var(--amber);
	}

	.mini-diagram {
		position: absolute;
		top: 0.75rem;
		left: 0.65rem;
		width: 34px;
		height: 34px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--bg);
		overflow: hidden;
	}

	.mini-diagram i {
		position: absolute;
		display: block;
		border: 1px solid var(--amber);
	}

	.mini-diagram.coil i {
		border-radius: 50%;
	}

	.mini-diagram.coil i:nth-child(1) {
		width: 24px;
		height: 24px;
		top: 5px;
		left: 5px;
	}
	.mini-diagram.coil i:nth-child(2) {
		width: 15px;
		height: 15px;
		top: 9px;
		left: 9px;
	}
	.mini-diagram.coil i:nth-child(3) {
		width: 6px;
		height: 6px;
		top: 14px;
		left: 14px;
	}

	.mini-diagram.spire i {
		left: 4px;
		width: 26px;
		height: 8px;
		border-radius: 50%;
	}

	.mini-diagram.spire i:nth-child(1) {
		bottom: 4px;
	}
	.mini-diagram.spire i:nth-child(2) {
		bottom: 12px;
		transform: scale(0.74);
	}
	.mini-diagram.spire i:nth-child(3) {
		bottom: 20px;
		transform: scale(0.48);
	}

	.mini-diagram.aperture i:first-child {
		width: 22px;
		height: 28px;
		left: 6px;
		top: 3px;
		border-radius: 50%;
	}

	.mini-diagram.aperture i:last-child {
		width: 6px;
		height: 6px;
		left: 14px;
		top: 14px;
		border-radius: 50%;
		background: var(--amber);
	}

	.select-card,
	.handedness-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
	}

	.select-copy,
	.handedness-card > div:first-child {
		display: grid;
		gap: 0.18rem;
	}

	.control-label {
		font-size: 0.76rem;
		font-weight: 640;
	}

	.control-label em {
		margin-left: 0.25rem;
		font-family: Georgia, serif;
		font-weight: 400;
		color: var(--cyan);
	}

	.select-copy > span:last-child,
	.control-note {
		font-size: 0.6rem;
		line-height: 1.35;
		color: var(--faint);
	}

	select {
		max-width: 9.5rem;
		min-height: 34px;
		padding: 0.32rem 1.6rem 0.32rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.68rem;
	}

	.ornament-scale {
		display: flex;
		justify-content: space-between;
		padding: 0.46rem 0.78rem 0;
		font-size: 0.5rem;
		color: var(--faint);
	}

	.ornament-scale span.active {
		color: var(--amber);
	}

	.segmented {
		display: flex;
		padding: 2px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--bg);
	}

	.segmented button {
		min-height: 30px;
		padding: 0.25rem 0.55rem;
		border: 0;
		border-radius: 5px;
		background: transparent;
		font-size: 0.65rem;
	}

	.segmented button[aria-pressed='true'] {
		background: var(--panel-2);
		color: var(--amber);
	}

	.handedness-card .lock {
		position: static;
		flex: 0 0 auto;
	}

	.surprise-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
		margin-top: 0.8rem;
	}

	.surprise {
		width: 100%;
	}

	.range-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 36px;
		font-size: 0.65rem;
		color: var(--muted);
	}

	.range-toggle input {
		width: 16px;
		height: 16px;
		accent-color: var(--amber);
	}

	@media (max-width: 720px) {
		.quick-sculpt {
			padding: 0.85rem;
		}

		.control-card :global(.parameter) {
			padding-left: 3.6rem;
		}

		.select-card,
		.handedness-card {
			min-height: 62px;
		}

		.segmented button,
		select {
			min-height: 44px;
		}
	}
</style>
