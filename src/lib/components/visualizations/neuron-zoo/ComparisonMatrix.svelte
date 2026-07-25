<script lang="ts">
	type MatrixRow = {
		feature: string;
		cells: [string, string, string, string, string];
	};

	const models = [
		'McCulloch–Pitts',
		'Leaky integrate-and-fire',
		'Izhikevich',
		'FitzHugh–Nagumo',
		'Hodgkin–Huxley'
	] as const;

	const rows: MatrixRow[] = [
		{
			feature: 'Binary output',
			cells: [
				'explicit 0/1 state',
				'not represented',
				'not represented',
				'not represented',
				'not represented'
			]
		},
		{
			feature: 'Continuous membrane-like variable',
			cells: [
				'not represented',
				'explicit V between resets',
				'phenomenological v',
				'dimensionless fast v',
				'physical membrane V'
			]
		},
		{
			feature: 'Physical membrane voltage',
			cells: [
				'not represented',
				'explicit subthreshold mV',
				'phenomenological voltage-like v',
				'not represented',
				'explicit mV'
			]
		},
		{
			feature: 'Passive leak',
			cells: [
				'not represented',
				'explicit gL',
				'not separately represented',
				'not separately represented',
				'explicit ionic leak IL'
			]
		},
		{
			feature: 'Threshold event',
			cells: [
				'explicit Heaviside threshold',
				'explicit Vth crossing',
				'explicit 30 mV cutoff',
				'analysis convention: upward v = 1',
				'analysis convention: upward V = 0 mV'
			]
		},
		{
			feature: 'Artificial reset',
			cells: [
				'not represented',
				'explicit Vreset',
				'explicit v ← c; u ← u + d',
				'none; trajectory continues',
				'none; waveform continues'
			]
		},
		{
			feature: 'Explicit refractory timer',
			cells: [
				'not represented',
				'explicit tref',
				'not represented',
				'not represented',
				'not represented'
			]
		},
		{
			feature: 'Recovery variable',
			cells: [
				'not represented',
				'timer only; no dynamic recovery variable',
				'explicit phenomenological u',
				'explicit slow w',
				'emergent through h and n gates'
			]
		},
		{
			feature: 'Generated action-potential waveform',
			cells: [
				'not represented',
				'event only; no waveform',
				'phenomenological hybrid waveform and reset',
				'emergent dimensionless excursion',
				'generated conductance-based voltage waveform'
			]
		},
		{
			feature: 'Ion-channel gates',
			cells: [
				'not represented',
				'not represented',
				'not represented',
				'not represented',
				'explicit m, h, and n'
			]
		},
		{
			feature: 'Ionic currents',
			cells: [
				'not identifiable',
				'not identifiable',
				'not identifiable',
				'not identifiable',
				'explicit INa, IK, and IL'
			]
		},
		{
			feature: 'Conductance parameters',
			cells: [
				'not represented',
				'leak conductance gL only',
				'not represented',
				'not represented',
				'Na⁺, K⁺, and leak conductances'
			]
		},
		{
			feature: 'Phase-plane interpretation',
			cells: [
				'not represented',
				'one-dimensional subthreshold flow',
				'phenomenological v–u geometry',
				'explicit v–w nullcline geometry',
				'four-dimensional; projections only'
			]
		},
		{
			feature: 'Physical biological-energy estimate',
			cells: [
				'not identifiable from this model',
				'not identifiable from this model',
				'not identifiable from this model',
				'not identifiable from this model',
				'caveated sodium-restoration estimate'
			]
		},
		{
			feature: 'Native units',
			cells: [
				'unitless command and binary state',
				'ms, mV, pA, pF, nS',
				'ms, mV-like v, model input units',
				'dimensionless v, w, and model time; mapped to ms',
				'ms, mV, µA/cm², mS/cm²'
			]
		},
		{
			feature: 'Typical computational cost',
			cells: [
				'very low: threshold update',
				'low: one state plus event logic',
				'low: two states plus reset',
				'moderate: two-state fixed-step RK4',
				'highest here: four-state RK4 and rate functions'
			]
		}
	];

	const uid = $props.id();
</script>

<section
	class="comparison-matrix rounded-xl border border-rule bg-paper-raised"
	aria-labelledby={`${uid}-title`}
>
	<header class="border-b border-rule px-4 py-5 sm:px-6">
		<p class="mb-1 text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
			What was thrown overboard?
		</p>
		<h2 id={`${uid}-title`} class="m-0 text-xl font-bold text-ink">Five different bargains</h2>
		<p class="mt-2 mb-0 max-w-4xl text-sm leading-relaxed text-ink-muted">
			These phrases describe what each equation actually represents. “Not identifiable” means the
			requested quantity cannot be recovered from that model—not that its physical value is zero.
		</p>
	</header>

	<!-- The overflow region must be focusable so keyboard users can pan the wide matrix. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="matrix-scroll overflow-x-auto"
		role="region"
		tabindex="0"
		aria-label="Scrollable model comparison"
	>
		<table class="w-full min-w-[82rem] border-separate border-spacing-0 text-left text-sm">
			<caption class="sr-only">
				Scientific capability comparison for the five neuron models
			</caption>
			<thead>
				<tr>
					<th
						scope="col"
						class="sticky left-0 z-20 w-52 border-r border-b border-rule bg-paper-soft px-4 py-3 font-bold text-ink"
					>
						Representation
					</th>
					{#each models as model, index (model)}
						<th
							scope="col"
							class="model-heading min-w-52 border-r border-b border-rule bg-paper-soft px-4 py-3 align-bottom font-bold text-ink last:border-r-0"
						>
							<span class="mr-2 font-mono text-xs text-ink-muted">{index + 1}</span>
							{model}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.feature)}
					<tr>
						<th
							scope="row"
							class="sticky left-0 z-10 border-r border-b border-rule bg-paper-raised px-4 py-3 font-bold text-ink"
						>
							{row.feature}
						</th>
						{#each row.cells as cell, index (`${row.feature}-${models[index]}`)}
							<td
								class="border-r border-b border-rule px-4 py-3 leading-relaxed text-ink last:border-r-0"
							>
								{cell}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<footer class="border-t border-rule px-4 py-4 text-xs leading-relaxed text-ink-muted sm:px-6">
		<p class="m-0">
			Computer cost is qualitative here and separate from biological energy. All five models still
			receive the same normalized command samples, translated through their visible native gains.
		</p>
	</footer>
</section>

<style>
	.comparison-matrix {
		--paper-raised: #0d1118;
		--paper-soft: #141922;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--rule: #303744;
		--focus: #f4d58d;
	}

	.matrix-scroll {
		max-height: min(75vh, 58rem);
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	.matrix-scroll:focus-visible {
		outline: 3px solid var(--focus, currentColor);
		outline-offset: -3px;
	}

	tbody tr:nth-child(even) td {
		background: color-mix(in oklab, var(--paper-soft) 52%, var(--paper-raised));
	}

	tbody tr:last-child > * {
		border-bottom: 0;
	}

	@media (max-width: 40rem) {
		.matrix-scroll {
			max-height: 70vh;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.matrix-scroll {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.comparison-matrix,
		th,
		td {
			border-color: CanvasText;
		}

		tbody tr:nth-child(even) td {
			background: Canvas;
		}
	}
</style>
