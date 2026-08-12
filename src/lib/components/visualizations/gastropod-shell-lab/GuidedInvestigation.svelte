<script lang="ts">
	import { tick } from 'svelte';
	import {
		createDefaultRecipe,
		patchShellRecipe,
		type DeepPartial
	} from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import Equation from './Equation.svelte';

	interface GuideStep {
		title: string;
		copy: string;
		formula: string;
		plain: string;
		instruction: string;
		patch: DeepPartial<ShellRecipe>;
	}

	interface Guide {
		id: string;
		title: string;
		summary: string;
		steps: GuideStep[];
	}

	interface Props {
		open: boolean;
		recipe: ShellRecipe;
		onapply: (recipe: ShellRecipe) => void;
		onclose: () => void;
	}

	let { open, recipe, onapply, onclose }: Props = $props();
	let dialog = $state<HTMLDialogElement>();
	let guideIndex = $state(0);
	let stepIndex = $state(-1);
	let startingRecipe = $state.raw<ShellRecipe>();

	const guides: Guide[] = [
		{
			id: 'circle-shell',
			title: 'From circle to shell',
			summary: 'Build bending, expansion and spire one local rule at a time.',
			steps: [
				{
					title: 'One opening',
					copy: 'Begin with a circular aperture. It is the active boundary from which future material will be deposited.',
					formula: '\\mathbf A(u)',
					plain: 'A(u) names points around the current opening.',
					instruction: 'Orbit the ring, then continue.',
					patch: {
						coiling: { turns: 0.25 },
						aperture: { profile: 'circle', scale: 0.42 },
						ornament: {
							ribs: { enabled: false },
							varices: { enabled: false },
							spines: { enabled: false }
						}
					}
				},
				{
					title: 'Expansion',
					copy: 'Successive openings grow, turning straight deposition into a cone-like history.',
					formula: "s'=gs",
					plain: 'A positive growth rate makes each new opening larger.',
					instruction: 'Notice that old rings do not change size.',
					patch: {
						engine: 'accretion',
						kinematics: {
							curvature1: { type: 'constant', value: 0 },
							growthRate: { type: 'constant', value: 0.16 }
						},
						coiling: { turns: 2 }
					}
				},
				{
					title: 'Differential deposition',
					copy: 'Turning the local frame bends the advancing opening; the deposited strip records that bending.',
					formula: "\\mathbf T'=\\kappa_1\\mathbf E_1+\\kappa_2\\mathbf E_2",
					plain: 'Unequal local advance changes the direction of the growing opening.',
					instruction: 'Use the timeline to inspect the turn forming.',
					patch: {
						kinematics: { curvature1: { type: 'constant', value: 0.72 } },
						coiling: { turns: 4 }
					}
				},
				{
					title: 'Exponential coil',
					copy: 'The analytic reference uses proportional radial growth, producing a logarithmic spiral.',
					formula: 'r(\\theta)=r_0e^{a\\theta}',
					plain: 'Each turn multiplies radius by the same factor.',
					instruction: 'Compare an early and late turn.',
					patch: {
						engine: 'analytic',
						coiling: { curve: 'logarithmic', whorlExpansion: 2.35, turns: 5.25 }
					}
				},
				{
					title: 'Spire',
					copy: 'A cone-similar axial law lifts height in proportion to radius.',
					formula: 'z=z_0+q(r-r_0)',
					plain: 'Height and radius share one scale factor.',
					instruction: 'Keep this shell and continue exploring.',
					patch: { coiling: { axial: { mode: 'cone-similar', coneSpireRatio: 0.78 } } }
				}
			]
		},
		{
			id: 'similarity',
			title: 'Why the spiral resembles itself',
			summary: 'Compare proportional and additive spacing without golden-ratio folklore.',
			steps: [
				{
					title: 'Proportional growth',
					copy: 'A logarithmic spiral repeats its planar form under a combined scale and rotation.',
					formula: 'W=e^{2\\pi a}',
					plain: 'W is the freely chosen size multiplier after one turn.',
					instruction: 'Change coil tightness after the guide.',
					patch: {
						engine: 'analytic',
						coiling: { curve: 'logarithmic', axial: { mode: 'planispiral' }, whorlExpansion: 2.15 },
						aperture: { scaleExponent: Math.log(2.15) / (Math.PI * 2) }
					}
				},
				{
					title: 'Constant angle',
					copy: 'The tangent meets the radial direction at the same angle all along the planar spiral.',
					formula: '\\alpha=\\operatorname{atan2}(1,a)',
					plain: 'The tangent-to-radius angle is constant, including a circle at a=0.',
					instruction: 'Turn on the centreline overlay.',
					patch: {}
				},
				{
					title: 'Wrong spacing for ordinary coiling',
					copy: 'An Archimedean curve adds the same radial gap each turn rather than multiplying it.',
					formula: 'r=r_0+c\\theta',
					plain: 'Constant spacing differs from constant proportional growth.',
					instruction: 'Compare the early and adult spacing.',
					patch: { coiling: { curve: 'archimedean', archimedeanSpacing: 0.16 } }
				},
				{
					title: 'Two honest 3D lifts',
					copy: 'Linear height produces only a self-similar top view. Cone-similar height shares radial scaling.',
					formula: 'z_{lift}=p\\theta,\\quad z_{cone}=q(r-r_0)',
					plain: 'These lifted curves have different three-dimensional similarity status.',
					instruction: 'Keep cone-similar mode.',
					patch: {
						coiling: { curve: 'logarithmic', axial: { mode: 'cone-similar', coneSpireRatio: 0.6 } }
					}
				}
			]
		},
		{
			id: 'lip-growth',
			title: 'Growth happens at the lip',
			summary: 'Reveal aperture rings and contrast accretion with scaling an adult shell.',
			steps: [
				{
					title: 'Deposit a prefix',
					copy: 'At any timeline age the mesh reveals a strict prefix of the adult aperture-ring history.',
					formula: '\\mathcal S(\\tau)=\\bigcup_{i\\leq k(\\tau)}[A_i,A_{i+1}]',
					plain: 'The visible shell contains only strips already deposited by that age.',
					instruction: 'Scrub backwards and watch later rings disappear.',
					patch: {}
				},
				{
					title: 'A local velocity field',
					copy: 'Finite differences between apertures are decomposed in a moving local basis.',
					formula: '\\partial_t\\mathbf A=V_T\\mathbf t+V_G\\mathbf g+V_N\\mathbf n',
					plain:
						'The app calculates local advance from its kinematics; the mollusc is not solving this equation.',
					instruction: 'Turn on accretion vectors.',
					patch: {}
				},
				{
					title: 'Permanent history',
					copy: 'Changing an age-dependent law affects rings deposited after that transition, while earlier coordinates remain fixed.',
					formula: 'A_i^{adult}=A_i^{prefix}',
					plain: 'An already revealed vertex is bit-identical to its adult-history counterpart.',
					instruction: 'Keep the deposited shell.',
					patch: {
						aperture: {
							lipFlare: {
								type: 'keyframes',
								interpolation: 'smooth',
								points: [
									{ age: 0, value: 0 },
									{ age: 0.82, value: 0 },
									{ age: 1, value: 0.28 }
								]
							}
						}
					}
				}
			]
		},
		{
			id: 'ornament',
			title: 'How ribs and spines appear',
			summary: 'Separate direct geometry from reduced mechanism-inspired proxies.',
			steps: [
				{
					title: 'Comarginal rhythm',
					copy: 'Growth-periodic displacement leaves ribs parallel to old aperture positions.',
					formula: 'D_r=A_r f(\\sin(n_r\\theta+\\phi))',
					plain: 'A deterministic oscillator along growth time perturbs each deposited rim.',
					instruction: 'Inspect the repeated permanent traces.',
					patch: { ornament: { ribs: { enabled: true, amplitude: 0.08, countPerTurn: 11 } } }
				},
				{
					title: 'An episodic varix',
					copy: 'A varix is a wider, stronger growth episode and may carry a spine row.',
					formula: 'D_v=A_v\\sum_iK(\\theta-\\theta_i)',
					plain: 'Compact growth-time windows leave broad permanent ridges.',
					instruction: 'Watch the episode pass through the bright aperture.',
					patch: { ornament: { varices: { enabled: true, amplitude: 0.22, countPerTurn: 3 } } }
				},
				{
					title: 'Smooth spine windows',
					copy: 'Spines are continuous peaks formed during finite windows around the aperture, not glued cones.',
					formula: 'D_s=\\ell_sK_\\theta(\\theta)K_u(u)',
					plain: 'A smooth two-coordinate kernel is carried forward by deposition.',
					instruction: 'Orbit along a spine row.',
					patch: {
						ornament: {
							spines: { enabled: true, length: 0.48, countAroundAperture: 4 },
							varices: { enabled: true }
						}
					}
				},
				{
					title: 'Reduced instability proxy',
					copy: 'A modal beam-on-foundation surrogate explores how compression and bending penalties select finite modes.',
					formula: '\\sigma_m=\\gamma_0(\\xi k_m^2-Kk_m^4-1)',
					plain: 'These are dimensionless model proxies, not measured mantle stress.',
					instruction: 'Keep the caveat with the result.',
					patch: {
						ornament: {
							buckling: {
								enabled: true,
								mismatchProxy: 2.2,
								stiffnessProxy: 0.65,
								mode: 5,
								amplitude: 0.09
							}
						}
					}
				}
			]
		},
		{
			id: 'hierarchy',
			title: 'Making a hierarchy',
			summary: 'Let old peak levels persist while progressively finer levels activate.',
			steps: [
				{
					title: 'Primary peaks',
					copy: 'Begin with a small periodic set of dominant aperture-edge peaks.',
					formula: 'P_1=\\{p_i^{(1)}\\}',
					plain: 'Generation one establishes the largest persistent ornament.',
					instruction: 'Count the primary peaks.',
					patch: {
						ornament: {
							hierarchy: { enabled: true, depth: 1, amplitude: 0.16 },
							spines: { enabled: true, countAroundAperture: 3, length: 0.35 }
						}
					}
				},
				{
					title: 'Persistent levels',
					copy: 'As the aperture grows, deposited traces remain while the deterministic hierarchy retains every earlier level.',
					formula: 'P_{j}\\subset P_{j+1}',
					plain: 'Older peak levels remain visible when finer levels activate.',
					instruction: 'Advance the timeline.',
					patch: { aperture: { scale: 0.58 } }
				},
				{
					title: 'Finer phases',
					copy: 'Later levels add smaller Gaussian peaks at progressively finer aperture phases. The browser model has no explicit gap threshold or stored parent graph.',
					formula: 'N_j=2^j,\\quad a_j=a_0q^j',
					plain: 'Smaller, later levels are superposed on persistent older levels.',
					instruction: 'Inspect primary, secondary and tertiary structure.',
					patch: {
						ornament: {
							hierarchy: { enabled: true, depth: 4, parentChildScale: 0.42, amplitude: 0.18 }
						}
					}
				},
				{
					title: 'Finite, not infinite',
					copy: 'This deterministic multilevel Gaussian-peak surrogate is capped at six levels and does not solve the 2025 constrained energy minimum or an explicit gap-insertion lineage.',
					formula: '0\\leq d_h\\leq6',
					plain: 'The result is finite and fractal-like rather than a mathematical true fractal.',
					instruction: 'Keep the finite hierarchy.',
					patch: {}
				}
			]
		},
		{
			id: 'impossible',
			title: 'Known to impossible',
			summary: 'Cross a safe morphospace boundary while keeping mathematical warnings useful.',
			steps: [
				{
					title: 'A plausible archetype',
					copy: 'Start with a compact, smooth logarithmic shell in a conservative parameter range.',
					formula: '1.03\\leq W\\leq6',
					plain: 'Interface-safe domains are starting ranges, not biological confidence intervals.',
					instruction: 'Note the green geometry status.',
					patch: createDefaultRecipe()
				},
				{
					title: 'Allometry',
					copy: 'Let the aperture exponent differ from radial expansion so the body whorl becomes disproportionately large.',
					formula: 'b\\ne a',
					plain: 'Aperture and centreline no longer share a per-turn factor.',
					instruction: 'Read the allometric badge.',
					patch: { aperture: { scaleExponent: 0.24, scale: 0.75 } }
				},
				{
					title: 'Probable overlap',
					copy: 'Large openings and a loose coil can place non-neighbouring growth rings close together.',
					formula: 'A/R\\gg(W-1)/(W+1)',
					plain:
						'A conservative broad-phase check can warn of likely self-intersection but is not a mathematical proof.',
					instruction: 'Find the specific repair advice.',
					patch: { coiling: { whorlExpansion: 1.15 }, aperture: { scale: 1.15 } }
				},
				{
					title: 'Explore without crashing',
					copy: 'Defined but implausible values remain navigable; an undefined aperture is diagnosed while the viewport retains its last valid mesh.',
					formula: '\\rho(u)>\\varepsilon',
					plain:
						'The pure engine can supply a circular diagnostic fallback, but the interactive viewport does not replace a valid specimen with it.',
					instruction: 'Keep or reset this forbidden experiment.',
					patch: {
						ornament: {
							imperfection: { enabled: true, amplitude: 0.2 },
							spines: { enabled: true, length: 1.5, countAroundAperture: 7 }
						}
					}
				}
			]
		}
	];

	let guide = $derived(guides[guideIndex]);
	let step = $derived(stepIndex >= 0 ? guide.steps[stepIndex] : undefined);

	function beginGuide(): void {
		startingRecipe = structuredClone(recipe);
		stepIndex = 0;
		onapply(patchShellRecipe(structuredClone(recipe), guide.steps[0].patch));
	}

	function selectGuide(index: number): void {
		guideIndex = index;
		stepIndex = -1;
		startingRecipe = undefined;
	}

	function next(): void {
		if (stepIndex < 0) return beginGuide();
		if (stepIndex >= guide.steps.length - 1) {
			dialog?.close();
			onclose();
			return;
		}
		stepIndex += 1;
		onapply(patchShellRecipe(recipe, guide.steps[stepIndex].patch));
	}

	function back(): void {
		if (stepIndex <= 0) {
			stepIndex = -1;
			return;
		}
		stepIndex -= 1;
		const base = startingRecipe ?? recipe;
		let accumulated = structuredClone(base);
		for (let index = 0; index <= stepIndex; index += 1)
			accumulated = patchShellRecipe(accumulated, guide.steps[index].patch);
		onapply(accumulated);
	}

	function skip(): void {
		if (startingRecipe) onapply(startingRecipe);
		dialog?.close();
		onclose();
	}

	$effect(() => {
		const currentDialog = dialog;
		if (!currentDialog) return;
		if (open && !currentDialog.open)
			void tick().then(() => {
				if (open && !currentDialog.open && currentDialog.isConnected) currentDialog.showModal();
			});
		else if (!open && currentDialog.open) currentDialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="guide-dialog"
	aria-labelledby="guide-title"
	oncancel={(event) => {
		event.preventDefault();
		skip();
	}}
	onclose={() => open && onclose()}
>
	<header>
		<div>
			<p class="panel-title">Skippable investigations · keep the result</p>
			<h2 id="guide-title">{guide.title}</h2>
		</div>
		<button
			class="icon-button"
			type="button"
			aria-label="Close guide and restore previous shell"
			onclick={skip}>×</button
		>
	</header>
	{#if stepIndex < 0}
		<div class="guide-picker">
			<nav aria-label="Guided investigations">
				{#each guides as item, index (item.title)}<button
						type="button"
						class:active={index === guideIndex}
						onclick={() => selectGuide(index)}
						><span>{index + 1}</span>
						<div><strong>{item.title}</strong><small>{item.summary}</small></div></button
					>{/each}
			</nav>
			<section class="guide-intro">
				<span class="guide-number">0{guideIndex + 1}</span>
				<h3>{guide.title}</h3>
				<p>{guide.summary}</p>
				<ul>
					<li>{guide.steps.length} short steps</li>
					<li>One idea changes at a time</li>
					<li>The resulting recipe remains editable</li>
				</ul>
				<button class="primary-button" type="button" onclick={beginGuide}
					>Begin investigation</button
				>
			</section>
		</div>
	{:else if step}
		<div class="step-body">
			<div class="progress" aria-label={`Step ${stepIndex + 1} of ${guide.steps.length}`}>
				{#each guide.steps as guideStep, index (guideStep.title)}<i
						class:done={index < stepIndex}
						class:current={index === stepIndex}
						title={guideStep.title}
					></i>{/each}
			</div>
			<p class="step-count">Step {stepIndex + 1} of {guide.steps.length}</p>
			<h3>{step.title}</h3>
			<p class="copy">{step.copy}</p>
			<div class="equation-card">
				<Equation formula={step.formula} plain={step.plain} display />
			</div>
			<div class="interaction">
				<strong>Your move</strong>
				<p>{step.instruction}</p>
			</div>
		</div>
		<footer>
			<button class="quiet-button" type="button" onclick={back}>Back</button><button
				class="quiet-button"
				type="button"
				onclick={skip}>Skip & restore</button
			><button class="primary-button" type="button" onclick={next}
				>{stepIndex === guide.steps.length - 1 ? 'Keep this shell' : 'Continue'}</button
			>
		</footer>
	{/if}
</dialog>

<style>
	.guide-dialog {
		width: min(820px, calc(100vw - 2rem));
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	footer {
		border-top: 1px solid var(--line);
		border-bottom: 0;
	}
	h2 {
		margin: 0.14rem 0 0;
		font-size: 1.15rem;
	}
	.guide-picker {
		display: grid;
		grid-template-columns: 1fr 1.2fr;
		min-height: 430px;
	}
	nav {
		padding: 0.65rem;
		border-right: 1px solid var(--line);
		background: var(--bg);
	}
	nav button {
		display: grid;
		grid-template-columns: 24px 1fr;
		gap: 0.6rem;
		width: 100%;
		min-height: 58px;
		padding: 0.55rem;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		text-align: left;
	}
	nav button:hover,
	nav button.active {
		border-color: var(--line);
		background: var(--panel);
	}
	nav button.active {
		border-left-color: var(--amber);
	}
	nav button > span {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--line);
		border-radius: 50%;
		font:
			0.58rem 'IBM Plex Mono',
			monospace;
		color: var(--amber);
	}
	nav button div {
		display: grid;
		gap: 0.18rem;
	}
	nav strong {
		font-size: 0.68rem;
	}
	nav small {
		font-size: 0.55rem;
		line-height: 1.35;
		color: var(--muted);
	}
	.guide-intro {
		padding: 2rem;
	}
	.guide-number {
		font:
			4rem/1 Georgia,
			serif;
		color: var(--amber-soft);
	}
	.guide-intro h3 {
		margin: 0.5rem 0 0;
		font:
			1.65rem/1.15 Georgia,
			serif;
	}
	.guide-intro p {
		margin: 0.7rem 0;
		line-height: 1.6;
		color: var(--muted);
	}
	.guide-intro ul {
		padding-left: 1.1rem;
		font-size: 0.7rem;
		line-height: 1.8;
		color: var(--muted);
	}
	.guide-intro .primary-button {
		margin-top: 0.8rem;
	}
	.step-body {
		max-width: 590px;
		min-height: 440px;
		margin: auto;
		padding: 2rem 1.2rem;
		text-align: center;
	}
	.progress {
		display: flex;
		justify-content: center;
		gap: 5px;
	}
	.progress i {
		width: 34px;
		height: 3px;
		border-radius: 99px;
		background: var(--line);
	}
	.progress i.done,
	.progress i.current {
		background: var(--amber);
	}
	.step-count {
		margin: 0.7rem 0 0;
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}
	.step-body h3 {
		margin: 1.1rem 0 0;
		font:
			1.65rem/1.2 Georgia,
			serif;
	}
	.copy {
		margin: 0.7rem auto 0;
		max-width: 520px;
		font-size: 0.78rem;
		line-height: 1.65;
		color: var(--muted);
	}
	.equation-card {
		margin: 1.2rem 0 0;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--bg);
		text-align: left;
	}
	.interaction {
		margin-top: 1rem;
		padding: 0.75rem;
		border-left: 2px solid var(--cyan);
		background: color-mix(in srgb, var(--cyan-soft) 10%, transparent);
		text-align: left;
	}
	.interaction strong {
		font-size: 0.62rem;
		color: var(--cyan);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.interaction p {
		margin: 0.25rem 0 0;
		font-size: 0.68rem;
		color: var(--muted);
	}
	@media (max-width: 620px) {
		.guide-picker {
			grid-template-columns: 1fr;
		}
		nav {
			display: flex;
			overflow-x: auto;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		nav button {
			flex: 0 0 220px;
		}
		.guide-intro {
			padding: 1.2rem;
			min-height: 360px;
		}
		.step-body {
			min-height: 470px;
			padding: 1.4rem 0.9rem;
		}
		footer {
			flex-wrap: wrap;
		}
	}
</style>
