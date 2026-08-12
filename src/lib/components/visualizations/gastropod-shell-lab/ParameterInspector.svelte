<script lang="ts">
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import ParameterControl from './ParameterControl.svelte';
	import ParameterCurveEditor from './ParameterCurveEditor.svelte';

	type InspectorTab = 'coiling' | 'aperture' | 'growth' | 'ornament' | 'appearance';

	interface Props {
		recipe: ShellRecipe;
		onbegin: () => void;
		onpreview: (mutator: (draft: ShellRecipe) => void) => void;
		oncommit: () => void;
	}

	let { recipe, onbegin, onpreview, oncommit }: Props = $props();
	let tab = $state<InspectorTab>('coiling');

	const tabs: Array<{ id: InspectorTab; label: string; short: string }> = [
		{ id: 'coiling', label: 'Coiling', short: 'Shape' },
		{ id: 'aperture', label: 'Aperture', short: 'Aperture' },
		{ id: 'growth', label: 'Growth', short: 'Growth' },
		{ id: 'ornament', label: 'Ornament', short: 'Ornament' },
		{ id: 'appearance', label: 'Appearance', short: 'Look' }
	];

	function mutate(mutator: (draft: ShellRecipe) => void): void {
		onpreview(mutator);
	}

	function choose(mutator: (draft: ShellRecipe) => void): void {
		onbegin();
		mutate(mutator);
		oncommit();
	}

	function toggleOrnament(key: keyof ShellRecipe['ornament'], enabled: boolean): void {
		choose((draft) => {
			draft.ornament[key].enabled = enabled;
			// Mode zero is the engine's explicit no-displacement sentinel. An enabled
			// instability proxy should therefore start at a real finite mode.
			if (key === 'buckling' && enabled && draft.ornament.buckling.mode === 0) {
				draft.ornament.buckling.mode = 4;
			}
		});
	}

	function degrees(radians: number): number {
		return (radians * 180) / Math.PI;
	}

	function radians(deg: number): number {
		return (deg * Math.PI) / 180;
	}

	const CANONICAL_WHORL_EXPANSION = 2.35;
	const CANONICAL_GROWTH_RATE = Math.log(CANONICAL_WHORL_EXPANSION) / (Math.PI * 2);
	const radialExponent = $derived(Math.log(recipe.coiling.whorlExpansion) / (Math.PI * 2));
</script>

<section class="inspector" aria-labelledby="inspector-title">
	<header class="inspector-heading">
		<div>
			<p class="panel-title">Equation-linked controls</p>
			<h2 id="inspector-title">Advanced inspector</h2>
		</div>
		<span
			class="badge"
			class:amber={recipe.engine === 'accretion'}
			class:cyan={recipe.engine === 'analytic'}
		>
			{recipe.engine === 'analytic' ? 'Model A · analytic' : 'Model B · living aperture'}
		</span>
	</header>

	<div class="tabs" role="tablist" aria-label="Advanced parameter groups">
		{#each tabs as item (item.id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === item.id}
				aria-controls={`${item.id}-panel`}
				onclick={() => (tab = item.id)}
			>
				<span class="long">{item.label}</span><span class="short">{item.short}</span>
			</button>
		{/each}
	</div>

	<div class="panel-scroll">
		{#if tab === 'coiling'}
			<div id="coiling-panel" role="tabpanel" aria-label="Coiling parameters">
				<div class="select-row">
					<label for="engine">Engine</label>
					<select
						id="engine"
						value={recipe.engine}
						onchange={(event) =>
							choose(
								(draft) =>
									(draft.engine = (event.currentTarget as HTMLSelectElement)
										.value as ShellRecipe['engine'])
							)}
					>
						<option value="analytic">Model A — analytic sculptor</option>
						<option value="accretion">Model B — local kinematic frame</option>
					</select>
					<p>
						{recipe.engine === 'analytic'
							? 'Fast descriptive sweep for direct manipulation and comparison.'
							: 'RK4-integrated local frame with ring-by-ring kinematics; not a tissue mechanics solver.'}
					</p>
				</div>
				{#if recipe.engine === 'accretion'}
					<div class="scope-note proxy">
						<strong>Model B control boundary.</strong> The normalized living-aperture form is driven by
						the integration span below and the local laws under Growth. Planar-curve, expansion, axis-scale,
						axial-rise and meander values remain stored for a deliberate switch back to Model A, but do
						not sculpt Model B's normalized morphology.
					</div>
				{/if}
				<div class="select-row">
					<label for="curve-family">Analytic planar curve</label>
					<select
						id="curve-family"
						value={recipe.coiling.curve}
						disabled={recipe.engine === 'accretion'}
						onchange={(event) =>
							choose(
								(draft) =>
									(draft.coiling.curve = (event.currentTarget as HTMLSelectElement)
										.value as ShellRecipe['coiling']['curve'])
							)}
					>
						<option value="logarithmic">Logarithmic — proportional spacing</option>
						<option value="archimedean">Archimedean comparison — additive spacing</option>
					</select>
					<p>
						{recipe.engine === 'analytic'
							? 'The Archimedean curve is a historical/mathematical comparison, not the default shell law.'
							: 'Stored for Model A only; this curve selector does not alter normalized Model B output.'}
					</p>
				</div>
				<ParameterControl
					id="advanced-turns"
					label={recipe.engine === 'analytic' ? 'Growth turns' : 'Integration span'}
					symbol="N"
					value={recipe.coiling.turns}
					min={2}
					max={12}
					step={0.05}
					defaultValue={5.25}
					unit={recipe.engine === 'analytic' ? 'turns' : 'turn-equivalent span'}
					equation="θ₁ − θ₀ = 2πN"
					explanation={recipe.engine === 'analytic'
						? 'The finite sampled developmental interval. Values near W=1 need more turns and samples.'
						: 'The angular-equivalent interval over which Model B integrates its authored local speed, growth, curvature and twist laws.'}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.coiling.turns = value))}
					{oncommit}
				/>
				<ParameterControl
					id="advanced-expansion"
					label="Analytic expansion per radian"
					symbol="a"
					value={radialExponent}
					min={-0.15}
					max={0.35}
					step={0.001}
					defaultValue={CANONICAL_GROWTH_RATE}
					unit="rad⁻¹"
					equation="r(θ)=rₘₐₓeᵃ⁽ᶿ⁻ᶿ¹⁾"
					explanation={recipe.engine === 'analytic'
						? 'The exponential radial growth rate. The synchronized whorl factor is W=e²ᵖⁱᵃ.'
						: 'Stored for Model A only. Model B aperture growth is set by g(τ) under Growth.'}
					disabled={recipe.engine === 'accretion'}
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.coiling.whorlExpansion = Math.exp(Math.PI * 2 * value)))}
					{oncommit}
				/>
				<ParameterControl
					id="advanced-axis-distance"
					label="Analytic axis scale"
					symbol="R"
					value={recipe.coiling.axisDistance}
					min={0.1}
					max={4}
					step={0.01}
					defaultValue={1}
					unit="normalized"
					equation="C=(r cosθ, χr sinθ, z)"
					explanation={recipe.engine === 'analytic'
						? 'Reference distance from the coiling axis before the finished shape is normalized for display.'
						: 'Stored for Model A. In Model B this common dimensional scale is removed by display normalization, so it does not sculpt the normalized form.'}
					disabled={recipe.engine === 'accretion'}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.coiling.axisDistance = value))}
					{oncommit}
				/>
				<div class="select-row">
					<label for="axial-law">Analytic axial law z(θ)</label>
					<select
						id="axial-law"
						value={recipe.coiling.axial.mode}
						disabled={recipe.engine === 'accretion'}
						onchange={(event) =>
							choose(
								(draft) =>
									(draft.coiling.axial.mode = (event.currentTarget as HTMLSelectElement)
										.value as ShellRecipe['coiling']['axial']['mode'])
							)}
					>
						<option value="planispiral">Planispiral · z=0</option>
						<option value="lecture-lift">Lecture lift · z linear in θ</option>
						<option value="cone-similar">Cone-similar · z follows r</option>
						<option value="keyframed">Keyframed experiment</option>
					</select>
					<p>
						{recipe.engine === 'accretion'
							? 'Stored for Model A only; Model B leaves the planar/axial path to its two local curvature laws.'
							: recipe.coiling.axial.mode === 'lecture-lift'
								? 'Self-similar in top view only; the complete lifted 3D curve is not uniformly scale-invariant.'
								: recipe.coiling.axial.mode === 'cone-similar'
									? 'Radial and axial coordinates share a similarity transform about an offset centre.'
									: 'The axial law is disclosed separately from radial coiling.'}
					</p>
				</div>
				{#if recipe.coiling.axial.mode === 'lecture-lift'}
					<ParameterControl
						id="advanced-lift"
						label="Axial rise per turn"
						symbol="p"
						value={recipe.coiling.axial.risePerTurn}
						min={-3}
						max={3}
						step={0.01}
						defaultValue={0.32}
						unit="normalized / turn"
						equation="z=z₀+p(θ−θ₀)/(2π)"
						explanation="Adds the same height each turn while radial distance expands exponentially."
						disabled={recipe.engine === 'accretion'}
						{onbegin}
						onpreview={(value) => mutate((draft) => (draft.coiling.axial.risePerTurn = value))}
						{oncommit}
					/>
				{:else if recipe.coiling.axial.mode === 'cone-similar'}
					<ParameterControl
						id="advanced-cone"
						label="Cone-similar spire ratio"
						symbol="q=H/R"
						value={recipe.coiling.axial.coneSpireRatio}
						min={0}
						max={3}
						step={0.01}
						defaultValue={0.78}
						unit="dimensionless"
						equation="z=z₀+q[r(θ)−r(θ₀)]"
						explanation="Axial height grows in proportion to radial coordinate, preserving the centreline's scale law."
						disabled={recipe.engine === 'accretion'}
						{onbegin}
						onpreview={(value) => mutate((draft) => (draft.coiling.axial.coneSpireRatio = value))}
						{oncommit}
					/>
				{/if}
				<ParameterControl
					id="advanced-roll"
					label="Initial aperture roll"
					symbol="ψ₀"
					value={degrees(recipe.twist.initialAngle)}
					min={-180}
					max={180}
					step={1}
					defaultValue={0}
					unit="degrees"
					equation="Ēᵢ=R_T(ψ)Eᵢ"
					explanation="Rolls the aperture profile about an already transported centreline frame. This is not developmental torsion."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.twist.initialAngle = radians(value)))}
					{oncommit}
				/>
				<ParameterCurveEditor
					id="roll-law"
					label="Aperture roll rate"
					symbol="ωᵣ(τ)"
					law={recipe.twist.rate}
					unit="radians / coiling radian"
					equation="ψ(θ)=ψ₀+∫ωᵣdθ"
					defaultValue={0}
					explanation="The authored rate is integrated over the angular coiling parameter θ, not directly over normalized age τ."
					onchange={(law) => choose((draft) => (draft.twist.rate = law))}
				/>
				<ParameterControl
					id="advanced-meander"
					label="Analytic radial meander"
					symbol="mᵣ"
					value={recipe.coiling.meander.radialAmplitude}
					min={0}
					max={2}
					step={0.01}
					defaultValue={0}
					unit="axis radii"
					equation="r̃=r+mᵣ sin(2πcτ+φ)"
					explanation={recipe.engine === 'analytic'
						? 'A deterministic geometric perturbation for heteromorphic experiments; it is not a fitted biological mechanism.'
						: 'Stored for Model A only. Model B centreline excursions come from its local curvature laws.'}
					disabled={recipe.engine === 'accretion'}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.coiling.meander.radialAmplitude = value))}
					{oncommit}
				/>
				<ParameterControl
					id="advanced-meander-cycles"
					label="Analytic meander cycles"
					symbol="cₘ"
					value={recipe.coiling.meander.cycles}
					min={0}
					max={24}
					step={0.25}
					defaultValue={0}
					unit="cycles / history"
					equation="sin(2πcₘτ+φ)"
					explanation={recipe.engine === 'analytic'
						? 'Controls the number of deterministic centreline excursions over the deposited history.'
						: 'Stored for Model A only; it does not modulate the integrated Model B path.'}
					disabled={recipe.engine === 'accretion'}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.coiling.meander.cycles = value))}
					{oncommit}
				/>
			</div>
		{:else if tab === 'aperture'}
			<div id="aperture-panel" role="tabpanel" aria-label="Aperture parameters">
				<div class="select-row">
					<label for="aperture-profile">Profile family p(u)</label>
					<select
						id="aperture-profile"
						value={recipe.aperture.profile}
						onchange={(event) =>
							choose(
								(draft) =>
									(draft.aperture.profile = (event.currentTarget as HTMLSelectElement)
										.value as ShellRecipe['aperture']['profile'])
							)}
					>
						<option value="circle">Circle</option><option value="ellipse">Ellipse</option><option
							value="superellipse">Positive-radius superellipse</option
						><option value="rounded-polygon">Rounded polygon</option><option value="lobed"
							>Lobed polar profile</option
						><option value="fourier">Polar Fourier profile</option>
					</select>
					<p>
						The dense validator requires positive radius and frequencies below the aperture sampling
						limit.
					</p>
				</div>
				<ParameterControl
					id="aperture-scale"
					label="Adult aperture scale"
					symbol="sₘₐₓ"
					value={recipe.aperture.scale}
					min={0.03}
					max={1.2}
					step={0.005}
					defaultValue={0.48}
					unit="axis-distance ratio"
					equation="X=C+s(pₓE₁+pᵧE₂)"
					explanation="Sets the adult opening relative to the coiling axis and therefore overlap or umbilicus visibility."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.scale = value))}
					{oncommit}
				/>
				<ParameterControl
					id="aperture-exponent"
					label="Analytic aperture growth exponent"
					symbol="b"
					value={recipe.aperture.scaleExponent}
					min={-0.1}
					max={0.4}
					step={0.001}
					defaultValue={Math.log(2.35) / (Math.PI * 2)}
					unit="rad⁻¹"
					equation="s=sₘₐₓeᵇ⁽ᶿ⁻ᶿ¹⁾"
					explanation={recipe.engine === 'analytic'
						? 'When b matches a, radius and opening share a per-turn factor. Other non-periodic laws may still break whole-surface similarity.'
						: 'Stored for Model A only. Model B integrates the aperture growth law g(τ) under Growth.'}
					disabled={recipe.engine === 'accretion'}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.scaleExponent = value))}
					{oncommit}
				/>
				<ParameterControl
					id="aperture-aspect"
					label="Height / width"
					symbol="η"
					value={recipe.aperture.aspectRatio}
					min={0.2}
					max={5}
					step={0.01}
					defaultValue={1.3}
					unit="dimensionless"
					equation="p=(ρ cosu, ηρ sinu)"
					explanation="Stretches the periodic profile in its local aperture frame."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.aspectRatio = value))}
					{oncommit}
				/>
				{#if recipe.aperture.profile === 'superellipse'}
					<ParameterControl
						id="aperture-superellipse"
						label="Superellipse exponent"
						symbol="n"
						value={recipe.aperture.superellipseExponent}
						min={0.5}
						max={8}
						step={0.05}
						defaultValue={2.4}
						unit="dimensionless"
						equation="|x|ⁿ+|y|ⁿ=1"
						explanation="Moves from diamond-like to elliptical to rounded-rectangular positive-radius openings."
						{onbegin}
						onpreview={(value) => mutate((draft) => (draft.aperture.superellipseExponent = value))}
						{oncommit}
					/>
				{:else if recipe.aperture.profile === 'lobed'}
					<ParameterControl
						id="aperture-lobes"
						label="Lobe count"
						symbol="m"
						value={recipe.aperture.lobes}
						min={1}
						max={16}
						step={1}
						defaultValue={5}
						unit="modes"
						equation="ρ=1+A cos(mu)"
						explanation="Sets a finite periodic around-aperture mode beneath Nyquist."
						{onbegin}
						onpreview={(value) => mutate((draft) => (draft.aperture.lobes = Math.round(value)))}
						{oncommit}
					/>
					<ParameterControl
						id="aperture-lobe-amplitude"
						label="Lobe amplitude"
						symbol="Aₘ"
						value={recipe.aperture.lobeAmplitude}
						min={-0.5}
						max={0.5}
						step={0.01}
						defaultValue={0}
						unit="local radius"
						equation="ρ=1+Aₘ cos(mu)"
						explanation="Bounded radial variation; the validator prevents the profile crossing the origin."
						{onbegin}
						onpreview={(value) => mutate((draft) => (draft.aperture.lobeAmplitude = value))}
						{oncommit}
					/>
				{/if}
				<ParameterControl
					id="aperture-rotation"
					label="In-plane rotation"
					symbol="β"
					value={degrees(recipe.aperture.rotation)}
					min={-180}
					max={180}
					step={1}
					defaultValue={degrees(0.08)}
					unit="degrees"
					equation="p̃=R(β)p"
					explanation="Rotates the profile within the current aperture plane before it is swept."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.rotation = radians(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="aperture-tilt"
					label="Aperture tilt"
					symbol="γ"
					value={degrees(recipe.aperture.tilt)}
					min={-80}
					max={80}
					step={1}
					defaultValue={0}
					unit="degrees"
					equation="(E₁,E₂)→R_E(γ)(E₁,E₂)"
					explanation="Tilts the local opening relative to the transported frame and may increase overlap."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.tilt = radians(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="aperture-eccentricity"
					label="Profile eccentricity"
					symbol="e"
					value={recipe.aperture.eccentricity}
					min={-0.9}
					max={0.9}
					step={0.01}
					defaultValue={0}
					unit="dimensionless"
					equation="pₓ→pₓ+e"
					explanation="Offsets the profile in growth coordinates while retaining a periodic rim."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.aperture.eccentricity = value))}
					{oncommit}
				/>
				<ParameterCurveEditor
					id="aperture-scale-law"
					label="Ontogenetic scale modulation"
					symbol="mₛ(τ)"
					law={recipe.aperture.scaleModulation}
					equation="s(θ,τ)=s_base(θ)mₛ(τ)"
					defaultValue={1}
					onchange={(law) => choose((draft) => (draft.aperture.scaleModulation = law))}
				/>
				<ParameterCurveEditor
					id="lip-flare-law"
					label="Late lip flare"
					symbol="fₗ(τ)"
					law={recipe.aperture.lipFlare}
					equation="s̃=s[1+fₗ(τ)]"
					defaultValue={0}
					onchange={(law) => choose((draft) => (draft.aperture.lipFlare = law))}
				/>
			</div>
		{:else if tab === 'growth'}
			<div id="growth-panel" role="tabpanel" aria-label="Growth and local kinematic parameters">
				<div class="scope-note">
					<strong>Local kinematic frame model.</strong> The authored rates below are per radian of the
					angular coiling parameter θ. The engine multiplies them by the shell's total θ span before integrating
					over normalized age τ. They generate a path; they do not solve mantle forces, biomineralization,
					or embryonic cell division.
				</div>
				<ParameterCurveEditor
					id="speed-law"
					label="Centerline speed"
					symbol="v(τ)"
					law={recipe.kinematics.speed}
					unit="axis radii / coiling radian"
					equation="dC/dθ=RvT"
					defaultValue={1}
					explanation="Dimensionless v is scaled by axis distance R; the displayed unit describes the resulting centreline advance."
					onchange={(law) => choose((draft) => (draft.kinematics.speed = law))}
				/>
				<ParameterCurveEditor
					id="growth-rate-law"
					label="Aperture growth rate"
					symbol="g(τ)"
					law={recipe.kinematics.growthRate}
					unit="coiling radian⁻¹"
					equation="ds/dθ=gs"
					defaultValue={CANONICAL_GROWTH_RATE}
					defaultLabel="canonical default"
					resetLabel="Reset canonical"
					explanation="The canonical reset matches W=2.35. It stays fixed when the current whorl expansion changes."
					onchange={(law) => choose((draft) => (draft.kinematics.growthRate = law))}
				/>
				<ParameterCurveEditor
					id="curvature-one-law"
					label="Turning rate one"
					symbol="κ₁(τ)"
					law={recipe.kinematics.curvature1}
					unit="coiling radian⁻¹"
					equation="dT/dθ=κ₁E₁+κ₂E₂"
					defaultValue={0.72}
					onchange={(law) => choose((draft) => (draft.kinematics.curvature1 = law))}
				/>
				<ParameterCurveEditor
					id="curvature-two-law"
					label="Turning rate two"
					symbol="κ₂(τ)"
					law={recipe.kinematics.curvature2}
					unit="coiling radian⁻¹"
					equation="dT/dθ=κ₁E₁+κ₂E₂"
					defaultValue={0}
					onchange={(law) => choose((draft) => (draft.kinematics.curvature2 = law))}
				/>
				<ParameterCurveEditor
					id="frame-twist-law"
					label="Frame twist rate"
					symbol="ω(τ)"
					law={recipe.kinematics.twistRate}
					unit="coiling radian⁻¹"
					equation="dE₁/dθ=−κ₁T+ωE₂"
					defaultValue={0}
					onchange={(law) => choose((draft) => (draft.kinematics.twistRate = law))}
				/>
				<ParameterControl
					id="protoconch"
					label="Protoconch scale"
					symbol="s₀"
					value={recipe.qualityIndependent.protoconchScale}
					min={0.001}
					max={0.25}
					step={0.001}
					defaultValue={0.018}
					unit="normalized"
					equation="s(θ₀)≥s₀"
					explanation="Keeps the earliest opening finite and supports a deliberate nondegenerate apex cap; it is not an embryology simulation."
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.qualityIndependent.protoconchScale = value))}
					{oncommit}
				/>
				<ParameterCurveEditor
					id="handedness-law"
					label="Winding-sense multiplier"
					symbol="h(τ)"
					law={recipe.coiling.handednessLaw}
					unit="dimensionless; runtime clipped to [−1, 1]"
					equation="χ_eff(τ)=χ₀ clamp[h(τ),−1,1]"
					defaultValue={1}
					explanation="This preserves constant, episodic, sinusoidal and keyframed winding laws. In planispiral forms it is view-oriented winding sense, not intrinsic biological chirality."
					onchange={(law) => choose((draft) => (draft.coiling.handednessLaw = law))}
				/>
			</div>
		{:else if tab === 'ornament'}
			<div id="ornament-panel" role="tabpanel" aria-label="Ornament parameters">
				<div class="ornament-toggles" aria-label="Ornament modules">
					{#each [['ribs', 'Ribs'], ['cords', 'Cords'], ['nodules', 'Nodules'], ['varices', 'Varices'], ['spines', 'Spines'], ['buckling', 'Instability proxy'], ['hierarchy', 'Finite hierarchy'], ['imperfection', 'Imperfection']] as item (item[0])}
						<label
							><input
								type="checkbox"
								checked={recipe.ornament[item[0] as keyof ShellRecipe['ornament']].enabled}
								onchange={(event) =>
									toggleOrnament(
										item[0] as keyof ShellRecipe['ornament'],
										(event.currentTarget as HTMLInputElement).checked
									)}
							/><span>{item[1]}</span></label
						>
					{/each}
				</div>
				<ParameterControl
					id="rib-frequency"
					label="Comarginal ribs per turn"
					symbol="nᵣ"
					value={recipe.ornament.ribs.countPerTurn}
					min={0}
					max={80}
					step={0.25}
					defaultValue={12}
					unit="turn⁻¹"
					equation="Dᵣ=Aᵣ f(sin(nᵣθ+φ))"
					explanation="Growth-periodic deformation parallel to deposited aperture histories; sampling rises or warns before aliasing."
					disabled={!recipe.ornament.ribs.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.ribs.countPerTurn = value))}
					{oncommit}
				/>
				<ParameterControl
					id="rib-amplitude"
					label="Rib amplitude"
					symbol="Aᵣ"
					value={recipe.ornament.ribs.amplitude}
					min={0}
					max={0.5}
					step={0.005}
					defaultValue={0.06}
					unit="local radii"
					equation="X̃=X+Dᵣn"
					explanation="Continuous displacement in growth coordinates, scaled with the local aperture."
					disabled={!recipe.ornament.ribs.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.ribs.amplitude = value))}
					{oncommit}
				/>
				<ParameterControl
					id="varix-frequency"
					label="Varices per turn"
					symbol="nᵥ"
					value={recipe.ornament.varices.countPerTurn}
					min={0}
					max={12}
					step={0.25}
					defaultValue={3}
					unit="turn⁻¹"
					equation="Dᵥ=AᵥΣK(θ−θᵢ)"
					explanation="Wider, stronger episodes in deposition time that may carry selected spine rows."
					disabled={!recipe.ornament.varices.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.varices.countPerTurn = value))}
					{oncommit}
				/>
				<ParameterControl
					id="varix-amplitude"
					label="Varix amplitude"
					symbol="Aᵥ"
					value={recipe.ornament.varices.amplitude}
					min={0}
					max={1.2}
					step={0.01}
					defaultValue={0.18}
					unit="local radii"
					equation="Dᵥ=AᵥΣK(θ−θᵢ)"
					explanation="The height of episodic permanent growth traces."
					disabled={!recipe.ornament.varices.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.varices.amplitude = value))}
					{oncommit}
				/>
				<ParameterControl
					id="cord-count"
					label="Spiral cord count"
					symbol="m_c"
					value={recipe.ornament.cords.count}
					min={0}
					max={32}
					step={1}
					defaultValue={6}
					unit="around-aperture modes"
					equation="D_c=A_c f(cos(m_cu+φ))"
					explanation="Fixed aperture-coordinate ridges that persist as the opening advances."
					disabled={!recipe.ornament.cords.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.cords.count = Math.round(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="nodule-amplitude"
					label="Nodule interaction"
					symbol="Aₙ"
					value={recipe.ornament.nodules.amplitude}
					min={0}
					max={0.8}
					step={0.01}
					defaultValue={0.08}
					unit="local radii"
					equation="Dₙ=AₙDᵣD_c"
					explanation="Localized peaks where growth-periodic ribs/varices interact with around-aperture modes."
					disabled={!recipe.ornament.nodules.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.nodules.amplitude = value))}
					{oncommit}
				/>
				<ParameterControl
					id="spine-count"
					label="Spines around aperture"
					symbol="mₛ"
					value={recipe.ornament.spines.countAroundAperture}
					min={0}
					max={24}
					step={1}
					defaultValue={3}
					unit="peaks"
					equation="Dₛ=ℓₛKθ(θ)ΣKu(u−uᵢ)"
					explanation="Smooth peaks formed during finite growth windows and carried forward by subsequent deposition."
					disabled={!recipe.ornament.spines.enabled}
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.ornament.spines.countAroundAperture = Math.round(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="spine-length"
					label="Spine length"
					symbol="ℓₛ"
					value={recipe.ornament.spines.length}
					min={0}
					max={2}
					step={0.01}
					defaultValue={0.35}
					unit="local radii"
					equation="Dₛ∝ℓₛKθKu"
					explanation="Direct procedural extent. This does not solve the published growing elastic-rod spine boundary-value problem."
					disabled={!recipe.ornament.spines.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.spines.length = value))}
					{oncommit}
				/>
				<div class="scope-note proxy">
					<strong>Reduced instability proxy.</strong> ξ, K and mode m below belong to an app-authored
					nondimensional beam-on-foundation surrogate, not one universal mantle property and never measured
					stress.
				</div>
				<ParameterControl
					id="mismatch-proxy"
					label="Compressive mismatch proxy"
					symbol="ξ"
					value={recipe.ornament.buckling.mismatchProxy}
					min={0}
					max={6}
					step={0.02}
					defaultValue={0.2}
					unit="model proxy"
					equation="σₘ=γ₀[ξkₘ²−Kkₘ⁴−1]"
					explanation="A normalized compression/load input for modal exploration; it is not a measured tissue mismatch."
					disabled={!recipe.ornament.buckling.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.buckling.mismatchProxy = value))}
					{oncommit}
				/>
				<ParameterControl
					id="stiffness-proxy"
					label="Bending stiffness proxy"
					symbol="K"
					value={recipe.ornament.buckling.stiffnessProxy}
					min={0.05}
					max={8}
					step={0.02}
					defaultValue={1}
					unit="model proxy"
					equation="σₘ=γ₀[ξkₘ²−Kkₘ⁴−1]"
					explanation="Penalizes high-wavenumber modes in the reduced periodic beam surrogate."
					disabled={!recipe.ornament.buckling.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.buckling.stiffnessProxy = value))}
					{oncommit}
				/>
				<ParameterControl
					id="buckling-mode"
					label="Instability mode"
					symbol="m"
					value={recipe.ornament.buckling.mode}
					min={1}
					max={24}
					step={1}
					defaultValue={4}
					unit="around-aperture mode"
					equation="kₘ=2πm/L"
					explanation="An enabled instability proxy uses a finite mode from 1 upward, kept beneath the current aperture Nyquist limit. Turn the module off to suppress its displacement."
					disabled={!recipe.ornament.buckling.enabled}
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.ornament.buckling.mode = Math.round(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="hierarchy-depth"
					label="Finite hierarchy depth"
					symbol="d_h"
					value={recipe.ornament.hierarchy.depth}
					min={0}
					max={6}
					step={1}
					defaultValue={0}
					unit="levels"
					equation={'P_j={2^j evenly phased Gaussian peaks}+seeded jitter'}
					explanation="Adds a capped, deterministic level of evenly phased Gaussian peaks at each depth, with seeded angular jitter. It is a finite multilevel surrogate, not a gap-insertion lineage or a true fractal."
					disabled={!recipe.ornament.hierarchy.enabled}
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.ornament.hierarchy.depth = Math.round(value)))}
					{oncommit}
				/>
				<ParameterControl
					id="hierarchy-scale"
					label="Parent / child scale"
					symbol="λ_h"
					value={recipe.ornament.hierarchy.parentChildScale}
					min={0.1}
					max={0.9}
					step={0.01}
					defaultValue={0.42}
					unit="dimensionless"
					equation="A_j=A_0 λ_h^j"
					explanation="Reduces Gaussian peak amplitude and width across successive finite levels; it does not encode biological parentage."
					disabled={!recipe.ornament.hierarchy.enabled}
					{onbegin}
					onpreview={(value) =>
						mutate((draft) => (draft.ornament.hierarchy.parentChildScale = value))}
					{oncommit}
				/>
				<ParameterControl
					id="imperfection-amplitude"
					label="Seeded imperfection"
					symbol="ε"
					value={recipe.ornament.imperfection.amplitude}
					min={0}
					max={0.25}
					step={0.002}
					defaultValue={0}
					unit="local radii"
					equation="D̃=D+εn_seed(θ,u)"
					explanation="Low-amplitude band-limited asymmetry from the visible deterministic seed, not an unstructured weirdness control."
					disabled={!recipe.ornament.imperfection.enabled}
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.ornament.imperfection.amplitude = value))}
					{oncommit}
				/>
			</div>
		{:else}
			<div id="appearance-panel" role="tabpanel" aria-label="Appearance parameters">
				<div class="scope-note look">
					<strong>Appearance only.</strong> These controls change rendering and microtexture; they carry
					no geometric or biological claim.
				</div>
				<div class="colour-fields">
					<label
						><span>Shell colour</span><input
							type="color"
							value={recipe.appearance.shellColor}
							onchange={(event) =>
								choose(
									(draft) =>
										(draft.appearance.shellColor = (event.currentTarget as HTMLInputElement).value)
								)}
						/></label
					>
					<label
						><span>Growth history</span><input
							type="color"
							value={recipe.appearance.growthColor}
							onchange={(event) =>
								choose(
									(draft) =>
										(draft.appearance.growthColor = (event.currentTarget as HTMLInputElement).value)
								)}
						/></label
					>
					<label
						><span>Math overlays</span><input
							type="color"
							value={recipe.appearance.overlayColor}
							onchange={(event) =>
								choose(
									(draft) =>
										(draft.appearance.overlayColor = (
											event.currentTarget as HTMLInputElement
										).value)
								)}
						/></label
					>
				</div>
				<ParameterControl
					id="roughness"
					label="Surface roughness"
					symbol="r_m"
					value={recipe.appearance.roughness}
					min={0}
					max={1}
					step={0.01}
					defaultValue={0.62}
					unit="shader value"
					equation="BRDF roughness = r_m"
					explanation="Changes the studio-light response without changing the shell geometry."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.appearance.roughness = value))}
					{oncommit}
				/>
				<ParameterControl
					id="microdetail"
					label="Shader microdetail"
					symbol="μ"
					value={recipe.appearance.microdetail}
					min={0}
					max={1}
					step={0.01}
					defaultValue={0.18}
					unit="shader value"
					equation="ñ=n+μ n_micro"
					explanation="A visual-only fine texture that does not enter exported structural geometry."
					{onbegin}
					onpreview={(value) => mutate((draft) => (draft.appearance.microdetail = value))}
					{oncommit}
				/>
				<div class="select-row">
					<label for="background">Studio environment</label>
					<select
						id="background"
						value={recipe.appearance.background}
						onchange={(event) =>
							choose(
								(draft) =>
									(draft.appearance.background = (event.currentTarget as HTMLSelectElement)
										.value as ShellRecipe['appearance']['background'])
							)}
					>
						<option value="museum-dark">Museum dark</option><option value="warm-light"
							>Warm light</option
						><option value="transparent">Transparent canvas</option>
					</select>
					<p>Background and quiet studio light are rendering choices, separate from morphology.</p>
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg-raised);
	}

	.inspector-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		min-height: 58px;
		padding: 0.7rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	h2 {
		margin: 0.14rem 0 0;
		font-size: 0.95rem;
		font-weight: 650;
	}

	.tabs {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border-bottom: 1px solid var(--line);
	}

	.tabs button {
		min-width: 0;
		min-height: 40px;
		padding: 0.35rem 0.2rem;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		font-size: 0.55rem;
		color: var(--muted);
	}

	.tabs button[aria-selected='true'] {
		border-bottom-color: var(--amber);
		color: var(--amber);
	}

	.tabs .short {
		display: none;
	}

	.panel-scroll {
		min-height: 0;
		overflow-y: auto;
	}

	.select-row {
		padding: 0.72rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	.select-row label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.7rem;
		font-weight: 650;
	}

	.select-row select {
		width: 100%;
		min-height: 36px;
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.68rem;
	}

	.select-row p,
	.scope-note {
		margin: 0.38rem 0 0;
		font-size: 0.58rem;
		line-height: 1.48;
		color: var(--muted);
	}

	.scope-note {
		margin: 0;
		padding: 0.7rem 0.8rem;
		border-bottom: 1px solid var(--line);
		border-left: 2px solid var(--cyan);
		background: color-mix(in srgb, var(--cyan-soft) 9%, transparent);
	}

	.scope-note strong {
		color: var(--cyan);
	}
	.scope-note.proxy {
		border-left-color: var(--amber);
	}
	.scope-note.proxy strong {
		color: var(--amber);
	}
	.scope-note.look {
		border-left-color: var(--line-bright);
	}
	.scope-note.look strong {
		color: var(--text);
	}

	.ornament-toggles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.38rem;
		padding: 0.7rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	.ornament-toggles label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 32px;
		font-size: 0.6rem;
		color: var(--muted);
	}

	.ornament-toggles input {
		width: 15px;
		height: 15px;
		accent-color: var(--amber);
	}

	.colour-fields {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		padding: 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	.colour-fields label {
		display: grid;
		gap: 0.32rem;
		font-size: 0.58rem;
		color: var(--muted);
	}

	.colour-fields input {
		width: 100%;
		height: 38px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg);
	}

	@media (max-width: 1160px) {
		.tabs .long {
			display: none;
		}
		.tabs .short {
			display: inline;
		}
	}

	@media (max-width: 900px) {
		.inspector-heading {
			display: none;
		}

		.tabs {
			grid-template-columns: repeat(4, 1fr);
			position: sticky;
			top: 0;
			z-index: 2;
			background: var(--bg-raised);
		}

		.tabs button:nth-child(2) {
			display: none;
		}
		.tabs button {
			min-height: 48px;
			font-size: 0.65rem;
		}
		.panel-scroll {
			overflow: visible;
		}
		.select-row select {
			min-height: 44px;
		}
	}
</style>
