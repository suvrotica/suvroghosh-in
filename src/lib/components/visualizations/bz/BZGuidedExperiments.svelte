<script module lang="ts">
	import type {
		ActiveTerms as GuideActiveTerms,
		BZIntervention as GuideIntervention,
		BZSetup as GuideSetup
	} from '$lib/visualizations/bz/types';

	export type BZGuideTool = 'probe' | 'cut' | 'pacemaker' | 'mix';
	export type BZGuideToolAction =
		| { readonly kind: 'reset' }
		| { readonly kind: 'select-tool'; readonly tool: BZGuideTool }
		| { readonly kind: 'apply-interventions'; readonly interventions: readonly GuideIntervention[] }
		| { readonly kind: 'run-to'; readonly modelTime: number }
		| {
				readonly kind: 'open-comparison';
				readonly presetId: string;
				readonly setup: GuideSetup;
		  };

	export interface BZGuideSelectDetail {
		readonly schemaVersion: 1;
		readonly experimentId: string;
		readonly sourceGuideId: string;
		readonly presetId: string;
		readonly setup: GuideSetup;
		readonly observationTime: number;
		readonly interventions: readonly GuideIntervention[];
		readonly activeTerms: GuideActiveTerms;
		readonly toolActions: readonly BZGuideToolAction[];
	}
</script>

<script lang="ts">
	import { BZ_GUIDED_EXPERIMENTS, getBZPreset } from '$lib/visualizations/bz/presets';
	import { BZ_SCHEMA_VERSION } from '$lib/visualizations/bz/types';
	import type {
		BZGuidedExperiment,
		BZIntervention,
		BZPreset,
		BZSetup
	} from '$lib/visualizations/bz/types';

	type GuideCard = {
		readonly id: string;
		readonly ordinal: string;
		readonly title: string;
		readonly summary: string;
		readonly question: string;
		readonly sourceGuideId: string;
		readonly presetId: string;
		readonly steps: readonly string[];
		readonly expected: string;
		readonly falsifier: string;
		readonly control: string;
		readonly limitation: string;
		readonly interventions: readonly BZIntervention[];
		readonly toolActions: readonly BZGuideToolAction[];
		readonly companionPresetId?: string;
	};

	function sourceGuide(id: string): BZGuidedExperiment {
		const guide = BZ_GUIDED_EXPERIMENTS.find((candidate) => candidate.id === id);
		if (!guide) throw new RangeError(`Missing BZ guided experiment: ${id}`);
		return guide;
	}

	function preset(id: string): BZPreset {
		return getBZPreset(id);
	}

	function runTo(presetId: string): BZGuideToolAction {
		return { kind: 'run-to', modelTime: preset(presetId).calibrationModelTime };
	}

	const pacemakerInterventions = sourceGuide('clock-enters-space').interventions;
	const stirInterventions = sourceGuide('stir-dish').interventions;
	const turingCompanion = preset('zhabotinsky-dish');
	const FULL_TERMS = Object.freeze({ reaction: true, diffusion: true });

	const GUIDES: readonly GuideCard[] = [
		{
			id: 'target-waves',
			ordinal: '01',
			title: 'Follow a target front',
			summary: 'Track one radial crest instead of admiring several rings at once.',
			question: 'Does the ring travel through recovered medium, or merely flash in place?',
			sourceGuideId: 'clock-enters-space',
			presetId: 'zhabotinsky-dish',
			steps: [
				'Load the declared target-wave seed and leave the fixed timestep unchanged.',
				'Run, then place the probe ahead of the visible excitation front.',
				'Pause twice at equal model-time intervals and compare the same crest’s radius.'
			],
			expected:
				'The crest reaches progressively larger radii and leaves elevated recovery behind it.',
			falsifier:
				'A ring that appears everywhere simultaneously, crosses the no-flux wall, or advances only when the palette changes would not support the explanation.',
			control:
				'The initial condition supplies one finite central excitation; reaction and diffusion then evolve normally.',
			limitation:
				'One launched front is not evidence for a permanent pacemaker or a classical Turing instability.',
			interventions: [],
			toolActions: [
				{ kind: 'reset' },
				{ kind: 'select-tool', tool: 'probe' },
				runTo('zhabotinsky-dish')
			]
		},
		{
			id: 'spiral',
			ordinal: '02',
			title: 'Break a front; test the tip',
			summary: 'A free end must curl through the field, not rotate as a display effect.',
			question: 'Can a genuine broken wave sustain a rotating free tip?',
			sourceGuideId: 'break-front',
			presetId: 'broken-front-spiral',
			steps: [
				'Run the reproducible broken-front seed without painting extra excitation.',
				'Probe just ahead of a free end, then probe the refractory wake behind it.',
				'Reset and use Cut front once if you want to compare a hand-made break with the seed.'
			],
			expected:
				'The free end turns into recovered territory while the wake blocks immediate return; a persistent candidate core should rotate over the stated interval.',
			falsifier:
				'A stationary state with a rotating colour map, or a tip that survives only through hidden clipping, is not a spiral-wave result.',
			control:
				'The setup fixes the finite front, refractory strip, seed, circular mask and no-flux boundary.',
			limitation:
				'The preset is an exhibit-calibrated model setup, not a claim about the radius of a laboratory spiral.',
			interventions: [],
			toolActions: [
				{ kind: 'reset' },
				{ kind: 'select-tool', tool: 'probe' },
				{ kind: 'select-tool', tool: 'cut' },
				runTo('broken-front-spiral')
			]
		},
		{
			id: 'collision-annihilation',
			ordinal: '03',
			title: 'Collide two fronts',
			summary: 'Ask whether excitation transmits through recently excited material.',
			question: 'Why do the fronts disappear instead of passing through?',
			sourceGuideId: 'collision',
			presetId: 'collision-annihilation',
			steps: [
				'Load the paired-front initial condition and run without further interventions.',
				'Pause immediately before contact and inspect the recovery field behind both fronts.',
				'Continue beyond contact and look for transmitted excitation on either far side.'
			],
			expected:
				'Both fronts extinguish at contact because neither finds recovered medium through which to continue.',
			falsifier:
				'Unchanged fronts emerging after contact would contradict annihilation under this declared setup.',
			control:
				'The two fronts share one solver, timestep and domain; only their opposed orientation differs.',
			limitation:
				'Annihilation is characteristic of this excitable-wave regime, not a rule for every nonlinear wave system.',
			interventions: [],
			toolActions: [
				{ kind: 'reset' },
				{ kind: 'select-tool', tool: 'probe' },
				runTo('collision-annihilation')
			]
		},
		{
			id: 'pacemaker',
			ordinal: '04',
			title: 'Install a declared pacemaker',
			summary: 'Separate a repeated local source from a one-off central disturbance.',
			question: 'Does a periodic local intervention emit successive travelling fronts?',
			sourceGuideId: 'clock-enters-space',
			presetId: 'pacemaker-under-glass',
			steps: [
				'Load the pacemaker setup; the guide installs the recorded periodic intervention.',
				'Run past more than one declared firing period without adding brush strokes.',
				'Probe a fixed radius and compare the arrival spacing of successive crests.'
			],
			expected:
				'Successive fronts originate at the same local source, travel outward and arrive periodically after a propagation delay.',
			falsifier:
				'A single fading ring shows excitation, not repeated pacemaking; global flashing shows no travelling geography.',
			control:
				'The event log states the pacemaker centre, radius, amount, period and end step explicitly.',
			limitation:
				'The pacemaker is a controlled model intervention, not an unidentified dust grain or a reconstructed chemical defect.',
			interventions: pacemakerInterventions,
			toolActions: [
				{ kind: 'reset' },
				{ kind: 'select-tool', tool: 'pacemaker' },
				{ kind: 'apply-interventions', interventions: pacemakerInterventions },
				{ kind: 'select-tool', tool: 'probe' },
				runTo('pacemaker-under-glass')
			]
		},
		{
			id: 'stir-reset-memory',
			ordinal: '05',
			title: 'Stir space; retain state',
			summary: 'Collapse spatial variance without pretending to solve fluid flow.',
			question: 'Does mixing erase the geography while preserving the active-area means?',
			sourceGuideId: 'stir-dish',
			presetId: 'zhabotinsky-dish',
			steps: [
				'Run until the dish contains a resolved front and note both field means and variances.',
				'Apply the recorded full Mix intervention once at its declared model step.',
				'Compare the immediate metrics, then continue to see what the homogenised state does.'
			],
			expected:
				'Spatial variances collapse while active-area means are conserved within floating tolerance; local kinetics then continue from that mean state.',
			falsifier:
				'A large mean jump, residual unmixed islands, or claims about vortices would expose a different operation.',
			control:
				'Mix replaces accessible cells with the declared active-area means and does not alter the obstacle or dish masks.',
			limitation:
				'This is approximate homogenisation, not computational fluid dynamics and not a reset to chemical equilibrium.',
			interventions: stirInterventions,
			toolActions: [
				{ kind: 'reset' },
				{ kind: 'select-tool', tool: 'mix' },
				{ kind: 'apply-interventions', interventions: stirInterventions },
				runTo('zhabotinsky-dish')
			]
		},
		{
			id: 'turing-comparator',
			ordinal: '06',
			title: 'BZ wave versus Turing onset',
			summary: 'Compare diagnostics as well as finished morphology.',
			question: 'What is shared by the two reaction–diffusion systems, and what is not?',
			sourceGuideId: 'bz-versus-turing',
			presetId: 'diffusion-driven-spots',
			companionPresetId: 'zhabotinsky-dish',
			steps: [
				'Open the Schnakenberg setup beside the declared Oregonator companion.',
				'Run each with its own fixed timestep to its own stated model time.',
				'Compare front motion and phase with the k = 0 and non-zero-k stability evidence.'
			],
			expected:
				'The BZ excitation travels and leaves a refractory wake; the comparator has a reaction-stable equilibrium and a finite diffusion-driven growing band.',
			falsifier:
				'Calling both pictures “Turing” solely because they contain structure would fail the experiment before either solver runs.',
			control:
				'The side-by-side fields retain separate models, parameters, timesteps, seeds and observation times.',
			limitation:
				'The linear Turing test classifies onset; the named mature spot morphology still requires finite-field calibration.',
			interventions: [],
			toolActions: [
				{ kind: 'reset' },
				{
					kind: 'open-comparison',
					presetId: turingCompanion.id,
					setup: turingCompanion.setup
				},
				runTo('diffusion-driven-spots')
			]
		}
	] as const;

	let selectedId = $state(GUIDES[0].id);
	let announcement = $state('Select one experiment to inspect its method.');
	let selected = $derived(GUIDES.find((guide) => guide.id === selectedId) ?? GUIDES[0]);
	let selectedPreset = $derived(preset(selected.presetId));

	function selectGuide(guide: GuideCard): void {
		selectedId = guide.id;
		announcement = `${guide.ordinal}. ${guide.title} selected.`;
	}

	function requestLab(guide: GuideCard, event: MouseEvent): void {
		const guidePreset = preset(guide.presetId);
		const detail: BZGuideSelectDetail = {
			schemaVersion: BZ_SCHEMA_VERSION,
			experimentId: guide.id,
			sourceGuideId: guide.sourceGuideId,
			presetId: guidePreset.id,
			setup: guidePreset.setup,
			observationTime: guidePreset.calibrationModelTime,
			interventions: guide.interventions,
			activeTerms: FULL_TERMS,
			toolActions: guide.toolActions
		};
		(event.currentTarget as HTMLButtonElement).dispatchEvent(
			new CustomEvent<BZGuideSelectDetail>('bz-guide-select', {
				bubbles: true,
				composed: true,
				detail
			})
		);
		announcement = `${guide.title}: exact setup sent to the laboratory.`;
	}

	function modelLabel(setup: BZSetup): string {
		return setup.model === 'oregonator' ? 'Oregonator' : 'Schnakenberg';
	}

	function parameterRows(setup: BZSetup): readonly [string, string][] {
		const common: [string, string][] = [
			['Dᵤ', formatNumber(setup.diffusionU)],
			['Dᵥ', formatNumber(setup.diffusionV)]
		];
		return setup.model === 'oregonator'
			? [
					['ε', formatNumber(setup.parameters.epsilon)],
					['q', formatNumber(setup.parameters.q)],
					['f', formatNumber(setup.parameters.f)],
					...common
				]
			: [
					['a', formatNumber(setup.parameters.a)],
					['b', formatNumber(setup.parameters.b)],
					['γ', formatNumber(setup.parameters.gamma)],
					...common
				];
	}

	function formatNumber(value: number): string {
		if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(2);
		return value.toPrecision(4).replace(/\.0+$/, '');
	}

	function actionLabel(action: BZGuideToolAction): string {
		if (action.kind === 'reset') return 'reset exact setup';
		if (action.kind === 'select-tool') return `select ${action.tool} tool`;
		if (action.kind === 'apply-interventions')
			return `install ${action.interventions.length} recorded intervention${action.interventions.length === 1 ? '' : 's'}`;
		if (action.kind === 'run-to') return `run towards model time ${action.modelTime}`;
		return `open comparison with ${action.presetId}`;
	}
</script>

<section class="guided-experiments article-breakout" aria-labelledby="bz-guides-title">
	<header>
		<div>
			<p class="eyebrow">Six controlled investigations</p>
			<h3 id="bz-guides-title">Begin with a question, not seven Greek letters</h3>
		</div>
		<p class="intro">
			Selecting a card changes only this guide. <strong>Open exact setup</strong> sends its immutable
			preset and declared actions to the laboratory.
		</p>
	</header>

	<div class="guide-grid" aria-label="Guided experiment selection">
		{#each GUIDES as guide (guide.id)}
			<button
				type="button"
				class:selected={selected.id === guide.id}
				aria-pressed={selected.id === guide.id}
				aria-controls="bz-guide-detail"
				onclick={() => selectGuide(guide)}
			>
				<span class="ordinal">{guide.ordinal}</span>
				<span class="card-copy">
					<strong>{guide.title}</strong>
					<small>{guide.summary}</small>
				</span>
			</button>
		{/each}
	</div>

	<article id="bz-guide-detail" class="guide-detail" aria-labelledby="bz-selected-guide-title">
		<div class="detail-heading">
			<div>
				<p>{selected.ordinal} · {modelLabel(selectedPreset.setup)}</p>
				<h4 id="bz-selected-guide-title">{selected.title}</h4>
				<strong class="question">{selected.question}</strong>
			</div>
			<button type="button" class="open-button" onclick={(event) => requestLab(selected, event)}>
				Open exact setup
			</button>
		</div>

		<div class="method-grid">
			<div class="steps">
				<h5>Method</h5>
				<ol>
					{#each selected.steps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			</div>
			<div class="observations">
				<section>
					<h5>Expected observation</h5>
					<p>{selected.expected}</p>
				</section>
				<section class="challenge">
					<h5>What would challenge it?</h5>
					<p>{selected.falsifier}</p>
				</section>
			</div>
		</div>

		<div class="honesty-grid">
			<section>
				<h5>Controlled change</h5>
				<p>{selected.control}</p>
			</section>
			<section>
				<h5>Claim boundary</h5>
				<p>{selected.limitation}</p>
			</section>
		</div>

		<details>
			<summary>Exact setup and queued actions</summary>
			<div class="setup-layout">
				<dl>
					<div>
						<dt>Preset</dt>
						<dd><code>{selected.presetId}</code></dd>
					</div>
					<div>
						<dt>Initial state</dt>
						<dd>{selectedPreset.setup.initialCondition}</dd>
					</div>
					<div>
						<dt>Grid and domain</dt>
						<dd>{selectedPreset.setup.gridSize}² over L = {selectedPreset.setup.domainSize}</dd>
					</div>
					<div>
						<dt>Fixed timestep</dt>
						<dd>{formatNumber(selectedPreset.setup.timestep)}</dd>
					</div>
					<div>
						<dt>Boundary</dt>
						<dd>{selectedPreset.setup.boundary}</dd>
					</div>
					<div>
						<dt>Seed</dt>
						<dd><code>{selectedPreset.setup.seed}</code></dd>
					</div>
					<div>
						<dt>Observation time</dt>
						<dd>{selectedPreset.calibrationModelTime}</dd>
					</div>
					<div>
						<dt>Active terms</dt>
						<dd>reaction + diffusion</dd>
					</div>
				</dl>
				<div>
					<table>
						<caption>Raw parameters</caption>
						<tbody>
							{#each parameterRows(selectedPreset.setup) as [name, value] (name)}
								<tr><th scope="row">{name}</th><td>{value}</td></tr>
							{/each}
						</tbody>
					</table>
					<h5>Queued laboratory actions</h5>
					<ul class="action-list">
						{#each selected.toolActions as action, index (`${action.kind}-${index}`)}
							<li>{actionLabel(action)}</li>
						{/each}
					</ul>
				</div>
			</div>
		</details>
	</article>

	<p class="announcement" aria-live="polite">{announcement}</p>
</section>

<style>
	.guided-experiments {
		--cyan: #6de6ef;
		--gold: #f5c66a;
		--violet: #b99aee;
		width: min(74rem, calc(100vw - 2rem));
		margin-block: 2.5rem;
		padding: clamp(1rem, 2.4vw, 1.75rem);
		border: 1px solid #3b515b;
		border-radius: 1.25rem;
		background: linear-gradient(145deg, #0b171d, #071015 72%);
		color: #eaf5f8;
		box-shadow: 0 1.5rem 3.5rem rgb(2 8 12 / 24%);
	}

	header,
	.detail-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	header {
		margin-bottom: 1rem;
	}

	h3,
	h4,
	h5,
	p {
		margin: 0;
	}

	h3 {
		color: #fff;
		font-size: clamp(1.25rem, 2vw, 1.7rem);
	}

	h4 {
		color: #fff;
		font-size: clamp(1.15rem, 2vw, 1.5rem);
	}

	h5 {
		margin-bottom: 0.5rem;
		color: #fff;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
	}

	.eyebrow {
		margin-bottom: 0.3rem;
		color: var(--cyan);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.intro {
		max-width: 32rem;
		color: #b9c8ce;
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.intro strong {
		color: #fff;
	}

	.guide-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.7rem;
		margin-bottom: 1rem;
	}

	.guide-grid button {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.7rem;
		align-items: start;
		min-width: 0;
		min-height: 5.5rem;
		border: 1px solid #354a53;
		border-radius: 0.85rem;
		background: #0d1a20;
		padding: 0.8rem;
		color: #e7f1f4;
		text-align: left;
		transition:
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.guide-grid button:hover {
		border-color: #65808c;
		background: #12242c;
	}

	.guide-grid button.selected {
		border-color: var(--cyan);
		background: #12303a;
		box-shadow: inset 0 0 0 1px var(--cyan);
	}

	.guide-grid button:focus-visible,
	.open-button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #fff;
		outline-offset: 3px;
	}

	.ordinal {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: #1d3038;
		color: var(--gold);
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 0.76rem;
		font-weight: 800;
	}

	.selected .ordinal {
		background: var(--cyan);
		color: #061014;
	}

	.card-copy {
		display: grid;
		gap: 0.28rem;
	}

	.card-copy strong {
		color: #fff;
		font-size: 0.9rem;
	}

	.card-copy small {
		color: #afc0c7;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.guide-detail {
		border: 1px solid #3a515b;
		border-radius: 1rem;
		background: rgb(12 25 31 / 88%);
		padding: clamp(0.9rem, 2vw, 1.25rem);
	}

	.detail-heading {
		align-items: start;
		padding-bottom: 1rem;
		border-bottom: 1px solid #344a53;
	}

	.detail-heading > div > p {
		margin-bottom: 0.25rem;
		color: var(--violet);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.question {
		display: block;
		margin-top: 0.45rem;
		color: #c6d5da;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.open-button {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border: 1px solid var(--cyan);
		border-radius: 0.72rem;
		background: #143a44;
		padding: 0.55rem 0.9rem;
		color: #f5fdff;
		font-weight: 800;
	}

	.method-grid,
	.honesty-grid,
	.setup-layout {
		display: grid;
		gap: 1rem;
	}

	.method-grid {
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
		padding-block: 1rem;
	}

	.steps ol {
		display: grid;
		gap: 0.65rem;
		margin: 0;
		padding-left: 1.4rem;
	}

	.steps li,
	.observations p,
	.honesty-grid p,
	details,
	.announcement {
		color: #bac9cf;
		font-size: 0.83rem;
		line-height: 1.55;
	}

	.steps li::marker {
		color: var(--gold);
		font-weight: 800;
	}

	.observations {
		display: grid;
		gap: 0.75rem;
	}

	.observations section,
	.honesty-grid section {
		border-left: 3px solid var(--cyan);
		background: rgb(109 230 239 / 6%);
		padding: 0.7rem 0.8rem;
	}

	.observations .challenge {
		border-left-color: var(--gold);
		background: rgb(245 198 106 / 6%);
	}

	.honesty-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding-top: 1rem;
		border-top: 1px solid #344a53;
	}

	.honesty-grid section:last-child {
		border-left-color: var(--violet);
		background: rgb(185 154 238 / 6%);
	}

	details {
		margin-top: 1rem;
		border-top: 1px solid #344a53;
		padding-top: 0.8rem;
	}

	summary {
		min-height: 2.75rem;
		cursor: pointer;
		color: #fff;
		font-weight: 800;
	}

	.setup-layout {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding-top: 0.3rem;
	}

	dl {
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: minmax(8rem, 0.65fr) 1fr;
		gap: 0.6rem;
		padding: 0.38rem 0;
		border-bottom: 1px solid rgb(73 94 103 / 45%);
	}

	dt {
		color: #9fb2ba;
	}

	dd {
		min-width: 0;
		margin: 0;
		color: #eef5f7;
		overflow-wrap: anywhere;
	}

	code {
		color: #fff0c6;
		font-size: 0.78rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	caption {
		padding-bottom: 0.4rem;
		color: #fff;
		font-weight: 800;
		text-align: left;
	}

	th,
	td {
		border-bottom: 1px solid rgb(73 94 103 / 45%);
		padding: 0.35rem 0.45rem;
		text-align: left;
	}

	td {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-variant-numeric: tabular-nums;
	}

	.setup-layout h5 {
		margin-top: 0.8rem;
	}

	.action-list {
		margin: 0;
		padding-left: 1.2rem;
	}

	.action-list li::marker {
		color: var(--cyan);
	}

	.announcement {
		min-height: 1.4em;
		margin-top: 0.75rem;
		color: #adc0c7;
	}

	:global(html[data-theme='high-contrast']) .guided-experiments {
		border: 2px solid currentColor;
		background: #000;
		box-shadow: none;
	}

	@media (max-width: 55rem) {
		.guide-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		header {
			align-items: start;
			flex-direction: column;
		}
	}

	@media (max-width: 42rem) {
		.guide-grid,
		.method-grid,
		.honesty-grid,
		.setup-layout {
			grid-template-columns: 1fr;
		}

		.detail-heading {
			align-items: stretch;
			flex-direction: column;
		}

		.open-button {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.guide-grid button {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.guided-experiments,
		.guide-grid button,
		.guide-detail,
		.observations section,
		.honesty-grid section {
			border: 1px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}
	}
</style>
