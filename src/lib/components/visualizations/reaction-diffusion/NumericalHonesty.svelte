<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_REACTION_DIFFUSION_SETUP } from '$lib/visualizations/reaction-diffusion/constants';
	import type {
		NumericalComparisonResult,
		NumericalExperimentKind
	} from '$lib/visualizations/reaction-diffusion/numerical-experiments';
	import type { GrayScottSetup } from '$lib/visualizations/reaction-diffusion/types';
	import type {
		NumericalExperimentWorkerClient,
		NumericalExperimentWorkerResponse
	} from '$lib/visualizations/reaction-diffusion/workers/numerical-client';
	type Props = {
		id?: string;
		setup?: GrayScottSetup;
	};

	let { id = 'rd-numerical-honesty', setup = DEFAULT_REACTION_DIFFUSION_SETUP }: Props = $props();
	let localResults = $state<NumericalComparisonResult[]>([]);
	let localBusy = $state<NumericalExperimentKind | null>(null);
	let workerReady = $state(false);
	let workerMessage = $state('Preparing the dedicated numerical-comparison Worker.');
	let worker: NumericalExperimentWorkerClient | null = null;
	let unsubscribeWorker: (() => void) | null = null;
	const experiments: readonly {
		id: NumericalExperimentKind;
		label: string;
		question: string;
		method: string;
	}[] = [
		{
			id: 'timestep',
			label: 'Δt versus Δt/2',
			question: 'Does halving the step change the field at equal model time?',
			method: 'Same domain, field, boundary and Heun method; only the fixed timestep changes.'
		},
		{
			id: 'resolution',
			label: 'Coarse versus fine h',
			question: 'Does the morphology survive a smaller grid spacing?',
			method: 'Same physical domain and continuous seed, resampled on two stable grids.'
		},
		{
			id: 'integrator',
			label: 'Euler versus Heun',
			question: 'How much does integration order matter over a controlled interval?',
			method: 'Both methods meet a smaller-step Heun reference at the same model time.'
		},
		{
			id: 'unsafe',
			label: 'Deliberately unsafe Δt',
			question: 'What does numerical failure look like without a clipping rescue?',
			method: 'Opt-in run above the explicit diffusion ceiling; pause at the first invalid state.'
		}
	];

	onMount(() => {
		let active = true;
		void import('$lib/visualizations/reaction-diffusion/workers/numerical-client')
			.then((module) => {
				if (!active) return;
				worker = module.createNumericalExperimentWorkerClient();
				unsubscribeWorker = worker.subscribe(handleWorkerResponse);
				workerReady = true;
				workerMessage = 'Controlled comparison runs execute in a dedicated CPU Worker.';
			})
			.catch((error) => {
				if (!active) return;
				workerMessage = `Numerical comparisons are unavailable: ${error instanceof Error ? error.message : 'the Worker could not start'}`;
			});
		return () => {
			active = false;
			unsubscribeWorker?.();
			unsubscribeWorker = null;
			worker?.dispose();
			worker = null;
		};
	});

	function resultFor(kind: NumericalExperimentKind) {
		return localResults.find((result) => result.kind === kind) ?? null;
	}

	function format(value: number | null) {
		if (value === null) return 'not available';
		if (!Number.isFinite(value)) return 'not finite';
		return Math.abs(value) < 1e-4 ? value.toExponential(3) : value.toPrecision(4);
	}

	function trigger(kind: NumericalExperimentKind) {
		if (localBusy || !worker) return;
		localBusy = kind;
		workerMessage = `Running the ${kind} comparison away from the main thread.`;
		worker.run(setup, kind);
	}

	function handleWorkerResponse(response: NumericalExperimentWorkerResponse) {
		if (response.type === 'RESULT') {
			localResults = [
				...localResults.filter((entry) => entry.kind !== response.result.kind),
				response.result
			];
			localBusy = null;
			workerMessage = `${response.result.kind} comparison complete at equal model time ${response.result.modelTime}.`;
		} else {
			localBusy = null;
			workerMessage = `Numerical comparison declined: ${response.message}`;
		}
	}
</script>

<section class="honesty-panel" {id} aria-labelledby={`${id}-title`}>
	<header>
		<p class="eyebrow">Convergence · stability · no quiet repairs</p>
		<h3 id={`${id}-title`}>Is the pattern in the equation, or in the calculation?</h3>
		<p>
			Visual resemblance, numerical convergence and physical validity are three separate claims.
			These controlled pairs test the first two; neither can validate the idealised model against
			nature.
		</p>
		<p class="worker-status" role="status">{workerMessage}</p>
	</header>

	<div class="experiment-grid">
		{#each experiments as experiment (experiment.id)}
			{@const result = resultFor(experiment.id)}
			<article class:failed={result?.failed}>
				<div>
					<span>{experiment.label}</span>
					<h4>{experiment.question}</h4>
					<p>{experiment.method}</p>
				</div>
				<button
					type="button"
					onclick={() => trigger(experiment.id)}
					disabled={localBusy !== null || !workerReady}
				>
					{localBusy === experiment.id
						? 'Calculating…'
						: result
							? 'Repeat comparison'
							: 'Run comparison'}
				</button>
				{#if result}
					<dl aria-live="polite">
						<div>
							<dt>equal model time</dt>
							<dd>{result.modelTime.toPrecision(5)}</dd>
						</div>
						<div>
							<dt>L² field difference</dt>
							<dd>{format(result.l2Difference)}</dd>
						</div>
						<div>
							<dt>maximum difference</dt>
							<dd>{format(result.maximumDifference)}</dd>
						</div>
						<div>
							<dt>mean U difference</dt>
							<dd>{format(result.meanUDifference)}</dd>
						</div>
						<div>
							<dt>mean V difference</dt>
							<dd>{format(result.meanVDifference)}</dd>
						</div>
						<div>
							<dt>stability μ</dt>
							<dd>{result.baselineMu.toPrecision(3)} / {result.comparisonMu.toPrecision(3)}</dd>
						</div>
						<div>
							<dt>runtime</dt>
							<dd>
								{result.baselineRuntimeMs.toFixed(1)} / {result.comparisonRuntimeMs.toFixed(1)} ms
							</dd>
						</div>
						{#if result.kind === 'integrator'}
							<div>
								<dt>Euler → Heun Δt/4 reference</dt>
								<dd>{format(result.baselineReferenceL2)}</dd>
							</div>
							<div>
								<dt>Heun → Heun Δt/4 reference</dt>
								<dd>{format(result.comparisonReferenceL2)}</dd>
							</div>
						{/if}
					</dl>
					<details class="trajectory">
						<summary>Metric trajectory ({result.trajectory.length} equal-time samples)</summary>
						<div class="table-scroll">
							<table>
								<caption>Mean V and field difference through model time</caption>
								<thead>
									<tr
										><th>t</th><th>Baseline ⟨V⟩</th><th>Comparison ⟨V⟩</th><th>Reference ⟨V⟩</th><th
											>L² A–B</th
										></tr
									>
								</thead>
								<tbody>
									{#each result.trajectory as sample (sample.modelTime)}
										<tr>
											<td>{sample.modelTime.toPrecision(4)}</td>
											<td>{sample.baselineMeanV.toPrecision(5)}</td>
											<td>{format(sample.comparisonMeanV)}</td>
											<td>{format(sample.referenceMeanV)}</td>
											<td>{format(sample.fieldDifference)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
					<p class="outcome">
						<strong>{result.failed ? 'Numerical failure detected.' : 'Outcome.'}</strong>
						{result.outcome}
					</p>
				{:else}
					<p class="empty">No calculation has been run in this session.</p>
				{/if}
			</article>
		{/each}
	</div>

	<aside>
		<strong>What this instrument refuses to do</strong>
		<span
			>It does not clamp concentrations, replace NaN, normalise a sick field, lower Δt mid-run, or
			compare unequal model times and call the result convergence.</span
		>
	</aside>
</section>

<style>
	.honesty-panel {
		margin-block: 2rem;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #24302e) 22%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--paper-raised, #faf6ec) 96%, #7b6850);
		padding: clamp(1rem, 3vw, 1.7rem);
		color: var(--essay-ink, #24302e);
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #8a6034;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0 0 0.6rem;
	}
	header p:last-child {
		max-width: 58rem;
	}
	.experiment-grid {
		display: grid;
		gap: 0.85rem;
		margin-top: 1.2rem;
	}
	article {
		display: grid;
		align-content: start;
		border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--paper, #f4efe3) 93%, white);
		padding: 1rem;
	}
	article.failed {
		border-color: #ad5142;
		background: color-mix(in oklab, #ad5142 8%, var(--paper, #f4efe3));
	}
	article span {
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #8a6034;
	}
	h4 {
		margin: 0.3rem 0 0.45rem;
		font-size: 1rem;
	}
	article p {
		margin: 0;
		font-size: 0.8rem;
	}
	button {
		min-height: 2.75rem;
		margin-top: 0.85rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		padding: 0.45rem 0.85rem;
		color: inherit;
		font-weight: 800;
	}
	button:disabled {
		opacity: 0.58;
	}
	dl {
		margin: 0.9rem 0 0;
		border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent);
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		border-bottom: 1px solid color-mix(in oklab, currentColor 12%, transparent);
		padding-block: 0.36rem;
	}
	dt {
		font-size: 0.72rem;
	}
	dd {
		margin: 0;
		font:
			700 0.69rem/1.2 ui-monospace,
			monospace;
		text-align: right;
	}
	.outcome {
		margin-top: 0.75rem;
	}
	.trajectory {
		margin-top: 0.8rem;
		font-size: 0.75rem;
	}
	.trajectory summary {
		cursor: pointer;
		font-weight: 800;
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 0.55rem;
	}
	table {
		width: 100%;
		min-width: 34rem;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	caption,
	th,
	td {
		border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
		padding: 0.35rem;
		text-align: right;
	}
	caption,
	th:first-child {
		text-align: left;
	}
	.empty {
		margin-top: 0.85rem;
		color: color-mix(in oklab, currentColor 68%, transparent);
	}
	aside {
		display: grid;
		gap: 0.2rem;
		margin-top: 1rem;
		border-left: 0.32rem solid #a75344;
		background: color-mix(in oklab, #a75344 8%, transparent);
		padding: 0.75rem 0.9rem;
		font-size: 0.8rem;
	}
	@media (min-width: 52rem) {
		.experiment-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	:global(html[data-theme='night']) .eyebrow,
	:global(html[data-theme='high-contrast']) .eyebrow,
	:global(html[data-theme='night']) article span,
	:global(html[data-theme='high-contrast']) article span {
		color: #e3bd82;
	}
	:global(html[data-theme='high-contrast']) .honesty-panel {
		border-width: 2px;
	}
</style>
