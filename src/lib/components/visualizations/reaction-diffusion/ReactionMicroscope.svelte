<script lang="ts">
	import { DEFAULT_REACTION_DIFFUSION_SETUP } from '$lib/visualizations/reaction-diffusion/constants';
	import { findHomogeneousEquilibria } from '$lib/visualizations/reaction-diffusion/stability';
	import type {
		ChemicalBudget,
		GrayScottSetup,
		HomogeneousEquilibrium,
		LocalTermLedger
	} from '$lib/visualizations/reaction-diffusion/types';

	export type MicroscopeHistorySample = {
		readonly step: number;
		readonly modelTime: number;
		readonly row: number;
		readonly column: number;
		readonly u: number;
		readonly v: number;
	};

	type Vector2 = { readonly u: number; readonly v: number };
	type PhaseGeometry = {
		readonly uMin: number;
		readonly uMax: number;
		readonly vMin: number;
		readonly vMax: number;
		readonly fPath: string;
		readonly gPath: string;
		readonly selected: readonly [number, number];
		readonly reactionEnd: readonly [number, number];
		readonly diffusionEnd: readonly [number, number];
		readonly netEnd: readonly [number, number];
		readonly vectorHorizon: number;
	};

	type Props = {
		ledger?: LocalTermLedger | null;
		budget?: ChemicalBudget | null;
		setup?: GrayScottSetup;
		equilibria?: readonly HomogeneousEquilibrium[];
		history?: readonly MicroscopeHistorySample[];
		title?: string;
		id?: string;
	};

	const DEFAULT_EQUILIBRIA = findHomogeneousEquilibria(DEFAULT_REACTION_DIFFUSION_SETUP);

	let {
		ledger = null,
		budget = null,
		setup = { ...DEFAULT_REACTION_DIFFUSION_SETUP },
		equilibria = DEFAULT_EQUILIBRIA,
		history = [],
		title = 'Reaction–diffusion microscope',
		id = 'reaction-microscope'
	}: Props = $props();

	const EMPTY_LEDGER: LocalTermLedger = {
		row: 0,
		column: 0,
		u: 1,
		v: 0,
		north: [1, 0],
		south: [1, 0],
		east: [1, 0],
		west: [1, 0],
		laplacianU: 0,
		laplacianV: 0,
		diffusionU: 0,
		reactionU: 0,
		feedU: 0,
		derivativeU: 0,
		diffusionV: 0,
		reactionV: 0,
		feedRemovalV: 0,
		killV: 0,
		derivativeV: 0
	};

	let active = $derived(ledger ?? EMPTY_LEDGER);
	let terms = $derived([
		{ field: 'U', label: 'diffusion', value: active.diffusionU },
		{ field: 'U', label: '−uv²', value: active.reactionU },
		{ field: 'U', label: 'feed', value: active.feedU },
		{ field: 'V', label: 'diffusion', value: active.diffusionV },
		{ field: 'V', label: '+uv²', value: active.reactionV },
		{ field: 'V', label: 'feed removal', value: active.feedRemovalV },
		{ field: 'V', label: 'kill', value: active.killV }
	]);
	let magnitude = $derived(Math.max(1e-12, ...terms.map((term) => Math.abs(term.value))));
	let reactionVector = $derived<Vector2>({
		u: active.reactionU + active.feedU,
		v: active.reactionV + active.feedRemovalV + active.killV
	});
	let diffusionVector = $derived<Vector2>({ u: active.diffusionU, v: active.diffusionV });
	let netVector = $derived<Vector2>({ u: active.derivativeU, v: active.derivativeV });
	let phase = $derived(
		buildPhaseGeometry(active, setup, equilibria, reactionVector, diffusionVector, netVector)
	);
	let historyGeometry = $derived(buildHistoryGeometry(history));
	let tableHistory = $derived(history.slice(-96));

	function format(value: number) {
		if (!Number.isFinite(value)) return 'not finite';
		if (Math.abs(value) < 5e-8) return '0';
		return `${value >= 0 ? '+' : '−'}${Math.abs(value).toPrecision(4)}`;
	}

	function buildHistoryGeometry(samples: readonly MicroscopeHistorySample[]) {
		const left = 46;
		const right = 510;
		const top = 14;
		const bottom = 128;
		const firstTime = samples[0]?.modelTime ?? 0;
		const lastTime = samples.at(-1)?.modelTime ?? firstTime;
		const timeRange = Math.max(1e-12, lastTime - firstTime);
		const maximum = Math.max(1, ...samples.flatMap((sample) => [sample.u, sample.v])) * 1.04;
		const minimum = Math.min(0, ...samples.flatMap((sample) => [sample.u, sample.v]));
		const valueRange = Math.max(1e-12, maximum - minimum);
		const x = (time: number, index: number) =>
			samples.length < 2
				? (left + right) / 2
				: left + ((time - firstTime) / timeRange || index / (samples.length - 1)) * (right - left);
		const y = (value: number) => bottom - ((value - minimum) / valueRange) * (bottom - top);
		const path = (field: 'u' | 'v') =>
			samples
				.map(
					(sample, index) =>
						`${index === 0 ? 'M' : 'L'}${x(sample.modelTime, index).toFixed(2)},${y(sample[field]).toFixed(2)}`
				)
				.join(' ');
		const latest = samples.at(-1);
		return {
			uPath: path('u'),
			vPath: path('v'),
			latestU: latest ? ([x(latest.modelTime, samples.length - 1), y(latest.u)] as const) : null,
			latestV: latest ? ([x(latest.modelTime, samples.length - 1), y(latest.v)] as const) : null,
			firstTime,
			lastTime,
			minimum,
			maximum
		};
	}

	function buildPhaseGeometry(
		cell: LocalTermLedger,
		model: GrayScottSetup,
		fixedPoints: readonly HomogeneousEquilibrium[],
		reaction: Vector2,
		diffusion: Vector2,
		net: Vector2
	): PhaseGeometry {
		const equilibriumUMax = Math.max(0, ...fixedPoints.map((point) => point.u));
		const equilibriumVMax = Math.max(0, ...fixedPoints.map((point) => point.v));
		const uMin = Math.min(-0.05, cell.u - 0.18);
		const uMax = Math.max(1.05, cell.u + 0.18, equilibriumUMax * 1.1);
		const vMin = Math.min(-0.05, cell.v - 0.18);
		const vMax = Math.max(0.65, cell.v + 0.18, equilibriumVMax * 1.1);
		const left = 52;
		const right = 510;
		const top = 18;
		const bottom = 308;
		const x = (u: number) => left + ((u - uMin) / (uMax - uMin)) * (right - left);
		const y = (v: number) => bottom - ((v - vMin) / (vMax - vMin)) * (bottom - top);
		const makePath = (points: readonly (readonly [number, number])[]) =>
			points
				.map(
					(point, index) =>
						`${index === 0 ? 'M' : 'L'}${x(point[0]).toFixed(2)},${y(point[1]).toFixed(2)}`
				)
				.join(' ');
		const fPoints: [number, number][] = [];
		const gPoints: [number, number][] = [];
		for (let index = 0; index <= 180; index += 1) {
			const v = Math.max(0, vMin) + (index / 180) * (vMax - Math.max(0, vMin));
			const u = model.feed / (model.feed + v * v);
			if (Number.isFinite(u) && u >= uMin && u <= uMax) fPoints.push([u, v]);
		}
		for (let index = 1; index <= 180; index += 1) {
			const u = Math.max(1e-6, uMin + (index / 180) * (uMax - uMin));
			const v = (model.feed + model.kill) / u;
			if (v >= vMin && v <= vMax) gPoints.push([u, v]);
		}
		const fPath =
			model.feed === 0
				? `${makePath([
						[0, Math.max(0, vMin)],
						[0, vMax]
					])} ${makePath([
						[Math.max(0, uMin), 0],
						[uMax, 0]
					])}`
				: makePath(fPoints);
		const gPath =
			model.feed + model.kill === 0
				? makePath([
						[0, Math.max(0, vMin)],
						[0, vMax]
					])
				: makePath(gPoints);
		const vectorMagnitude = Math.max(
			Math.hypot(reaction.u, reaction.v),
			Math.hypot(diffusion.u, diffusion.v),
			Math.hypot(net.u, net.v),
			1e-12
		);
		const vectorHorizon = Math.min(
			20,
			(0.13 * Math.min(uMax - uMin, vMax - vMin)) / vectorMagnitude
		);
		const endpoint = (vector: Vector2) =>
			[x(cell.u + vector.u * vectorHorizon), y(cell.v + vector.v * vectorHorizon)] as const;
		return {
			uMin,
			uMax,
			vMin,
			vMax,
			fPath,
			gPath,
			selected: [x(cell.u), y(cell.v)],
			reactionEnd: endpoint(reaction),
			diffusionEnd: endpoint(diffusion),
			netEnd: endpoint(net),
			vectorHorizon
		};
	}

	function phaseX(u: number) {
		return 52 + ((u - phase.uMin) / (phase.uMax - phase.uMin)) * (510 - 52);
	}

	function phaseY(v: number) {
		return 308 - ((v - phase.vMin) / (phase.vMax - phase.vMin)) * (308 - 18);
	}
</script>

<section class="microscope instrument-panel" aria-labelledby={`${id}-title`}>
	<header>
		<p class="eyebrow">One cell · every term</p>
		<h3 id={`${id}-title`}>{title}</h3>
		<p>
			Cell ({active.column}, {active.row}) contains <i>u</i> = {active.u.toFixed(4)} and
			<i>v</i> = {active.v.toFixed(4)}. Values below are dimensionless concentration change per
			model-time unit.
		</p>
	</header>

	<div class="microscope-grid">
		<div class="stencil-card" aria-label="Five-point finite-difference stencil values">
			<div></div>
			<div class="cell neighbour"><span>N</span>{active.north[1].toFixed(3)}</div>
			<div></div>
			<div class="cell neighbour"><span>W</span>{active.west[1].toFixed(3)}</div>
			<div class="cell centre"><span>V centre</span>{active.v.toFixed(3)}</div>
			<div class="cell neighbour"><span>E</span>{active.east[1].toFixed(3)}</div>
			<div></div>
			<div class="cell neighbour"><span>S</span>{active.south[1].toFixed(3)}</div>
			<div></div>
			<p class="laplacian">∇²v = {format(active.laplacianV)}</p>
		</div>

		<div class="term-ledger">
			{#each ['U', 'V'] as field (field)}
				<section aria-labelledby={`${id}-${field}`}>
					<h4 id={`${id}-${field}`}>{field} ledger</h4>
					{#each terms.filter((term) => term.field === field) as term (`${field}-${term.label}`)}
						<div class="term-row">
							<span>{term.label}</span>
							<div class="bar-track" aria-hidden="true">
								<span
									class:negative={term.value < 0}
									class:positive={term.value >= 0}
									style={`--term-size:${Math.min(50, (Math.abs(term.value) / magnitude) * 50)}%`}
								></span>
							</div>
							<output>{format(term.value)}</output>
						</div>
					{/each}
					<p class="total">
						<strong>Net ∂{field.toLowerCase()}/∂t</strong>
						<output>{format(field === 'U' ? active.derivativeU : active.derivativeV)}</output>
					</p>
				</section>
			{/each}
		</div>
	</div>

	<div class="diagnostic-pair">
		<section class="history-card" aria-labelledby={`${id}-history-title`}>
			<div class="subhead">
				<div>
					<p class="mini-eyebrow">Recent selected-cell record</p>
					<h4 id={`${id}-history-title`}>Local concentration history</h4>
				</div>
				<span>{history.length} samples</span>
			</div>
			{#if history.length > 0}
				<svg
					class="history-plot"
					viewBox="0 0 530 150"
					role="img"
					aria-labelledby={`${id}-history-svg-title ${id}-history-svg-description`}
				>
					<title id={`${id}-history-svg-title`}>Recent u and v history at the selected cell</title>
					<desc id={`${id}-history-svg-description`}>
						{history.length} samples from model time {historyGeometry.firstTime.toFixed(2)} to {historyGeometry.lastTime.toFixed(
							2
						)}. The latest values are u {history.at(-1)?.u.toPrecision(4)} and v {history
							.at(-1)
							?.v.toPrecision(4)}.
					</desc>
					<rect x="46" y="14" width="464" height="114" class="plot-background" />
					{#each [0, 0.5, 1] as fraction (fraction)}
						<line
							x1="46"
							x2="510"
							y1={14 + fraction * 114}
							y2={14 + fraction * 114}
							class="grid-line"
						/>
					{/each}
					<path d={historyGeometry.uPath} class="history-u" />
					<path d={historyGeometry.vPath} class="history-v" />
					{#if historyGeometry.latestU}
						<circle
							cx={historyGeometry.latestU[0]}
							cy={historyGeometry.latestU[1]}
							r="3.5"
							class="history-u-dot"
						/>
					{/if}
					{#if historyGeometry.latestV}
						<circle
							cx={historyGeometry.latestV[0]}
							cy={historyGeometry.latestV[1]}
							r="3.5"
							class="history-v-dot"
						/>
					{/if}
					<text x="8" y="20">{historyGeometry.maximum.toPrecision(3)}</text>
					<text x="8" y="130">{historyGeometry.minimum.toPrecision(3)}</text>
					<text x="46" y="144">t {historyGeometry.firstTime.toFixed(1)}</text>
					<text x="510" y="144" text-anchor="end">t {historyGeometry.lastTime.toFixed(1)}</text>
					<text x="445" y="27" class="label-u">u —</text>
					<text x="480" y="27" class="label-v">v --</text>
				</svg>
				<p class="chart-summary">
					From model time {historyGeometry.firstTime.toFixed(2)} to {historyGeometry.lastTime.toFixed(
						2
					)}, the selected cell moved from (u, v) = ({history[0].u.toPrecision(4)}, {history[0].v.toPrecision(
						4
					)}) to ({history.at(-1)?.u.toPrecision(4)}, {history.at(-1)?.v.toPrecision(4)}).
				</p>
				<details>
					<summary>Recent u/v values as a table</summary>
					<div class="table-scroll compact-table">
						<table>
							<caption>Bounded selected-cell history, oldest to newest</caption>
							<thead
								><tr><th>Step</th><th>Model time</th><th>Cell</th><th>u</th><th>v</th></tr></thead
							>
							<tbody>
								{#each tableHistory as sample (`${sample.step}-${sample.row}-${sample.column}`)}
									<tr
										><td>{sample.step}</td><td>{sample.modelTime.toFixed(3)}</td><td
											>({sample.column}, {sample.row})</td
										><td>{sample.u.toPrecision(6)}</td><td>{sample.v.toPrecision(6)}</td></tr
									>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{:else}
				<p class="empty-state">
					Run or step the laboratory to collect a bounded u/v trace for this cell.
				</p>
			{/if}
		</section>

		<section class="phase-card" aria-labelledby={`${id}-phase-title`}>
			<div class="subhead">
				<div>
					<p class="mini-eyebrow">Reaction-only kinetics · spatial overlay</p>
					<h4 id={`${id}-phase-title`}>Local phase plane</h4>
				</div>
				<span>u–v state space</span>
			</div>
			<p class="phase-intro">
				The nullclines describe a spatially isolated cell. Diffusion is overlaid at the selected
				cell from its four actual neighbours; it is not a function of (u, v) alone.
			</p>
			<div class="phase-equations" aria-label="Reaction-only nullcline equations">
				<code>f(u,v) = −uv² + F(1−u) = 0</code>
				<code>g(u,v) = uv² − (F+k)v = 0</code>
			</div>
			<svg
				class="phase-plot"
				viewBox="0 0 540 350"
				role="img"
				aria-labelledby={`${id}-phase-svg-title ${id}-phase-svg-description`}
			>
				<title id={`${id}-phase-svg-title`}
					>Reaction-only phase plane with local spatial vectors</title
				>
				<desc id={`${id}-phase-svg-description`}>
					The f equals zero and g equals zero reaction nullclines, {equilibria.length} homogeneous equilibria,
					the selected concentration pair, and arrows for reaction, actual diffusion, and their net derivative.
				</desc>
				<defs>
					<marker
						id={`${id}-arrow-reaction`}
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"><path d="M0,0 L7,3.5 L0,7 z" class="marker-reaction" /></marker
					>
					<marker
						id={`${id}-arrow-diffusion`}
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"><path d="M0,0 L7,3.5 L0,7 z" class="marker-diffusion" /></marker
					>
					<marker
						id={`${id}-arrow-net`}
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"><path d="M0,0 L7,3.5 L0,7 z" class="marker-net" /></marker
					>
				</defs>
				<rect x="52" y="18" width="458" height="290" class="plot-background" />
				{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
					<line
						x1={52 + fraction * 458}
						x2={52 + fraction * 458}
						y1="18"
						y2="308"
						class="grid-line"
					/>
					<line
						x1="52"
						x2="510"
						y1={18 + fraction * 290}
						y2={18 + fraction * 290}
						class="grid-line"
					/>
				{/each}
				<line x1="52" x2="510" y1={phaseY(0)} y2={phaseY(0)} class="g-nullcline" />
				<path d={phase.fPath} class="f-nullcline" />
				<path d={phase.gPath} class="g-nullcline" />
				<text
					x={phaseX(setup.feed / (setup.feed + 0.18 ** 2)) + 6}
					y={phaseY(0.18) - 6}
					class="f-label">f = 0</text
				>
				<text
					x={phaseX(Math.min(phase.uMax, 0.55)) + 6}
					y={phaseY(Math.min(phase.vMax, (setup.feed + setup.kill) / 0.55)) - 6}
					class="g-label">g = 0</text
				>
				{#each equilibria as equilibrium (`${equilibrium.id}-${equilibrium.u}-${equilibrium.v}`)}
					<circle
						cx={phaseX(equilibrium.u)}
						cy={phaseY(equilibrium.v)}
						r="5"
						class="equilibrium-point"
						><title
							>{equilibrium.id} equilibrium: u {equilibrium.u.toPrecision(5)}, v {equilibrium.v.toPrecision(
								5
							)}</title
						></circle
					>
				{/each}
				<line
					x1={phase.selected[0]}
					y1={phase.selected[1]}
					x2={phase.reactionEnd[0]}
					y2={phase.reactionEnd[1]}
					class="reaction-vector"
					marker-end={`url(#${id}-arrow-reaction)`}
				/>
				<line
					x1={phase.selected[0]}
					y1={phase.selected[1]}
					x2={phase.diffusionEnd[0]}
					y2={phase.diffusionEnd[1]}
					class="diffusion-vector"
					marker-end={`url(#${id}-arrow-diffusion)`}
				/>
				<line
					x1={phase.selected[0]}
					y1={phase.selected[1]}
					x2={phase.netEnd[0]}
					y2={phase.netEnd[1]}
					class="net-vector"
					marker-end={`url(#${id}-arrow-net)`}
				/>
				<circle cx={phase.selected[0]} cy={phase.selected[1]} r="6" class="selected-point"
					><title>Selected cell: u {active.u.toPrecision(5)}, v {active.v.toPrecision(5)}</title
					></circle
				>
				<text x="281" y="340" text-anchor="middle">u concentration</text>
				<text x="15" y="164" text-anchor="middle" transform="rotate(-90 15 164)"
					>v concentration</text
				>
				<text x="52" y="323">{phase.uMin.toPrecision(2)}</text>
				<text x="510" y="323" text-anchor="end">{phase.uMax.toPrecision(2)}</text>
				<text x="47" y="308" text-anchor="end">{phase.vMin.toPrecision(2)}</text>
				<text x="47" y="24" text-anchor="end">{phase.vMax.toPrecision(2)}</text>
			</svg>
			<div class="phase-legend" aria-hidden="true">
				<span class="legend-null-f">f=0</span><span class="legend-null-g">g=0</span><span
					class="legend-equilibrium">equilibrium</span
				><span class="legend-reaction">reaction only</span><span class="legend-diffusion"
					>actual diffusion</span
				><span class="legend-net">net</span>
			</div>
			<p class="chart-summary">
				Arrows use a common tangent horizon τ = {phase.vectorHorizon.toPrecision(3)} model-time units
				to make direction legible; they are derivatives at this instant, not integrated trajectories.
			</p>
			<div class="table-scroll compact-table">
				<table>
					<caption>Vectors at selected (u, v)</caption>
					<thead><tr><th>Vector</th><th>du/dt</th><th>dv/dt</th><th>Depends on</th></tr></thead>
					<tbody>
						<tr
							><th>Reaction only</th><td>{format(reactionVector.u)}</td><td
								>{format(reactionVector.v)}</td
							><td>selected u, v; F, k</td></tr
						>
						<tr
							><th>Actual diffusion</th><td>{format(diffusionVector.u)}</td><td
								>{format(diffusionVector.v)}</td
							><td>north, south, east, west; Dᵤ, Dᵥ; boundary</td></tr
						>
						<tr
							><th>Net PDE</th><td>{format(netVector.u)}</td><td>{format(netVector.v)}</td><td
								>reaction + actual diffusion</td
							></tr
						>
					</tbody>
				</table>
			</div>
		</section>
	</div>

	<div class="table-scroll">
		<table>
			<caption>Exact local PDE ledger</caption>
			<thead
				><tr
					><th>Field</th><th>Diffusion</th><th>Autocatalysis</th><th>Feed</th><th>Kill</th><th
						>Total</th
					></tr
				></thead
			>
			<tbody>
				<tr
					><th>U</th><td>{format(active.diffusionU)}</td><td>{format(active.reactionU)}</td><td
						>{format(active.feedU)}</td
					><td>—</td><td>{format(active.derivativeU)}</td></tr
				>
				<tr
					><th>V</th><td>{format(active.diffusionV)}</td><td>{format(active.reactionV)}</td><td
						>{format(active.feedRemovalV)}</td
					><td>{format(active.killV)}</td><td>{format(active.derivativeV)}</td></tr
				>
			</tbody>
		</table>
	</div>

	{#if budget}
		<section class="budget" aria-labelledby={`${id}-chemical-budget-title`}>
			<h4 id={`${id}-chemical-budget-title`}>Global chemical budget</h4>
			<p class="budget-note">
				Measured change and residual come from one exact Float64 reference step initialized from the
				currently sampled field. This audits the documented integrator; it does not conceal or claim
				to measure GPU rounding differences.
			</p>
			<div
				class="flow"
				aria-label="Feed supplies U, autocatalysis converts U to V, and V is removed"
			>
				<span>feed</span><b aria-hidden="true">→</b><span>U</span><b aria-hidden="true">→</b><span
					>V</span
				><b aria-hidden="true">→</b><span>removal</span>
			</div>
			<div class="table-scroll">
				<table>
					<caption>Domain-mean change over one numerical timestep Δt</caption>
					<thead
						><tr
							><th>Field</th><th>Reaction</th><th>Feed</th><th>Kill</th><th>Diffusion / boundary</th
							><th>Predicted</th><th>Measured</th><th>Residual</th></tr
						></thead
					>
					<tbody>
						<tr
							><th>U</th><td>{format(budget.autocatalysisU)}</td><td>{format(budget.feedU)}</td><td
								>—</td
							><td>{format(budget.diffusionU)}</td><td>{format(budget.predictedChangeU)}</td><td
								>{budget.measuredChangeU === null
									? 'collecting'
									: format(budget.measuredChangeU)}</td
							><td>{budget.residualU === null ? 'collecting' : format(budget.residualU)}</td></tr
						>
						<tr
							><th>V</th><td>{format(budget.autocatalysisV)}</td><td
								>{format(budget.feedRemovalV)}</td
							><td>{format(budget.killV)}</td><td>{format(budget.diffusionV)}</td><td
								>{format(budget.predictedChangeV)}</td
							><td
								>{budget.measuredChangeV === null
									? 'collecting'
									: format(budget.measuredChangeV)}</td
							><td>{budget.residualV === null ? 'collecting' : format(budget.residualV)}</td></tr
						>
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</section>

<style>
	.instrument-panel {
		--instrument-accent: #317a72;
		margin-block: 2rem;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #24302e) 22%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--paper-raised, #faf6ec) 95%, var(--instrument-accent));
		padding: clamp(1rem, 3vw, 1.6rem);
		color: var(--essay-ink, #24302e);
	}
	header > :global(p) {
		max-width: 54rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--instrument-accent);
	}
	h3,
	h4 {
		margin: 0 0 0.55rem;
	}
	.microscope-grid {
		display: grid;
		gap: 1rem;
		margin-top: 1.2rem;
	}
	.stencil-card {
		display: grid;
		grid-template-columns: repeat(3, minmax(3.4rem, 1fr));
		gap: 0.35rem;
		align-self: start;
		border-radius: 0.75rem;
		background: #101817;
		padding: 0.8rem;
		color: #f1eadb;
		font:
			600 0.78rem/1.2 ui-monospace,
			monospace;
	}
	.cell {
		display: grid;
		min-height: 3.4rem;
		place-content: center;
		border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 0.35rem;
		text-align: center;
	}
	.cell span {
		display: block;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: #b9c8c2;
	}
	.centre {
		border-color: #e9c978;
		background: rgb(233 201 120 / 0.12);
	}
	.laplacian {
		grid-column: 1 / -1;
		margin: 0.4rem 0 0;
		text-align: center;
	}
	.term-ledger {
		display: grid;
		gap: 1rem;
	}
	.term-ledger section {
		border-radius: 0.7rem;
		background: color-mix(in oklab, var(--paper, #f4efe3) 92%, white);
		padding: 0.85rem;
	}
	.term-row {
		display: grid;
		grid-template-columns: minmax(5.5rem, 1fr) minmax(7rem, 2fr) 6rem;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.15rem;
		font-size: 0.78rem;
	}
	.term-row output,
	.total output {
		font:
			700 0.74rem/1 ui-monospace,
			monospace;
		text-align: right;
	}
	.bar-track {
		position: relative;
		height: 0.72rem;
		border-radius: 1rem;
		background: linear-gradient(
			to right,
			transparent 49.7%,
			currentColor 49.7% 50.3%,
			transparent 50.3%
		);
		opacity: 0.85;
	}
	.bar-track span {
		position: absolute;
		top: 0.13rem;
		height: 0.46rem;
		width: var(--term-size);
		border-radius: 1rem;
	}
	.bar-track .positive {
		left: 50%;
		background: #247f72;
	}
	.bar-track .negative {
		right: 50%;
		background: #a64f3f;
	}
	.total {
		display: flex;
		justify-content: space-between;
		border-top: 1px solid color-mix(in oklab, currentColor 18%, transparent);
		padding-top: 0.6rem;
	}
	.diagnostic-pair {
		display: grid;
		gap: 1rem;
		margin-top: 1.2rem;
	}
	.history-card,
	.phase-card {
		min-width: 0;
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--paper, #f4efe3) 93%, white);
		padding: 0.85rem;
	}
	.subhead {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.8rem;
		margin-bottom: 0.65rem;
	}
	.subhead h4 {
		margin-bottom: 0;
	}
	.subhead > span {
		flex: 0 0 auto;
		border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
		border-radius: 999px;
		padding: 0.28rem 0.5rem;
		font:
			700 0.58rem/1.1 ui-monospace,
			monospace;
	}
	.mini-eyebrow {
		margin: 0 0 0.22rem;
		color: var(--instrument-accent);
		font:
			800 0.59rem/1.15 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.history-plot,
	.phase-plot {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.5rem;
		background: #101817;
		color: #e9e2d2;
	}
	.history-plot text,
	.phase-plot text {
		fill: #d7d5c9;
		font:
			600 9px/1 ui-monospace,
			monospace;
	}
	.plot-background {
		fill: #111b1a;
		stroke: rgb(255 255 255 / 0.18);
	}
	.grid-line {
		stroke: rgb(255 255 255 / 0.1);
		stroke-width: 1;
	}
	.history-u,
	.history-v,
	.f-nullcline,
	.g-nullcline {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.history-u {
		stroke: #f0cf79;
		stroke-width: 2.25;
	}
	.history-v {
		stroke: #72c8b7;
		stroke-width: 2.25;
		stroke-dasharray: 5 3;
	}
	.history-u-dot {
		fill: #f0cf79;
	}
	.history-v-dot {
		fill: #72c8b7;
	}
	.history-plot .label-u {
		fill: #f0cf79;
	}
	.history-plot .label-v {
		fill: #72c8b7;
	}
	.chart-summary,
	.phase-intro {
		margin: 0.65rem 0 0;
		font-size: 0.72rem;
		line-height: 1.45;
		color: color-mix(in oklab, currentColor 76%, transparent);
	}
	.phase-intro {
		margin: 0 0 0.65rem;
	}
	.phase-equations {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.65rem;
	}
	.phase-equations code {
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		border-radius: 0.35rem;
		background: color-mix(in oklab, var(--instrument-accent) 7%, transparent);
		padding: 0.35rem 0.45rem;
		color: inherit;
		font:
			650 0.64rem/1.2 ui-monospace,
			monospace;
	}
	.empty-state {
		min-height: 9rem;
		display: grid;
		place-items: center;
		margin: 0;
		border: 1px dashed color-mix(in oklab, currentColor 24%, transparent);
		border-radius: 0.5rem;
		padding: 1rem;
		color: color-mix(in oklab, currentColor 70%, transparent);
		font-size: 0.8rem;
		text-align: center;
	}
	details {
		margin-top: 0.7rem;
	}
	summary {
		min-height: 2.5rem;
		cursor: pointer;
		font-size: 0.74rem;
		font-weight: 800;
	}
	.compact-table {
		margin-top: 0.4rem;
	}
	.compact-table table {
		min-width: 32rem;
		font-size: 0.68rem;
	}
	.f-nullcline {
		stroke: #f0cf79;
		stroke-width: 2;
	}
	.g-nullcline {
		stroke: #78b8dc;
		stroke-width: 2;
		stroke-dasharray: 6 3;
	}
	.phase-plot .f-label {
		fill: #f0cf79;
		font-weight: 800;
	}
	.phase-plot .g-label {
		fill: #78b8dc;
		font-weight: 800;
	}
	.equilibrium-point {
		fill: #f5f1e3;
		stroke: #101817;
		stroke-width: 2;
	}
	.selected-point {
		fill: #101817;
		stroke: #ffffff;
		stroke-width: 3;
	}
	.reaction-vector,
	.diffusion-vector,
	.net-vector {
		stroke-width: 3;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.reaction-vector {
		stroke: #df9d55;
	}
	.diffusion-vector {
		stroke: #77cbbb;
		stroke-dasharray: 5 3;
	}
	.net-vector {
		stroke: #dc6d63;
		stroke-width: 4;
	}
	.marker-reaction {
		fill: #df9d55;
	}
	.marker-diffusion {
		fill: #77cbbb;
	}
	.marker-net {
		fill: #dc6d63;
	}
	.phase-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		margin-top: 0.55rem;
		font:
			700 0.59rem/1.2 ui-monospace,
			monospace;
	}
	.phase-legend span::before {
		content: '';
		display: inline-block;
		width: 1.1rem;
		margin-right: 0.25rem;
		border-top: 2px solid currentColor;
		vertical-align: middle;
	}
	.legend-null-f {
		color: #9b6a17;
	}
	.legend-null-g {
		color: #397ca4;
	}
	.legend-equilibrium {
		color: currentColor;
	}
	.legend-equilibrium::before {
		width: 0.45rem !important;
		height: 0.45rem;
		border: 1px solid currentColor !important;
		border-radius: 50%;
	}
	.legend-reaction {
		color: #a8601e;
	}
	.legend-diffusion {
		color: #287b6f;
	}
	.legend-diffusion::before,
	.legend-null-g::before {
		border-top-style: dashed !important;
	}
	.legend-net {
		color: #aa433a;
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 1rem;
		border-radius: 0.6rem;
	}
	table {
		width: 100%;
		min-width: 42rem;
		border-collapse: collapse;
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
	}
	caption {
		padding: 0.45rem;
		font-weight: 700;
		text-align: left;
	}
	th,
	td {
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		padding: 0.5rem;
		text-align: right;
	}
	th:first-child {
		text-align: left;
	}
	.budget {
		margin-top: 1.2rem;
		border-top: 1px solid color-mix(in oklab, currentColor 18%, transparent);
		padding-top: 1rem;
	}
	.flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.flow span {
		border: 1px solid color-mix(in oklab, currentColor 24%, transparent);
		border-radius: 999px;
		padding: 0.35rem 0.65rem;
		font-size: 0.78rem;
		font-weight: 800;
	}
	@media (min-width: 54rem) {
		.microscope-grid {
			grid-template-columns: minmax(15rem, 0.7fr) minmax(25rem, 1.3fr);
		}
		.term-ledger {
			grid-template-columns: 1fr 1fr;
		}
		.diagnostic-pair {
			grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
		}
	}
	@media (max-width: 35rem) {
		.term-row {
			grid-template-columns: 5.4rem 1fr 4.7rem;
		}
		.instrument-panel {
			border-radius: 0.65rem;
		}
	}
	:global(html[data-theme='night']) .instrument-panel,
	:global(html[data-theme='high-contrast']) .instrument-panel {
		--instrument-accent: #8fd7c5;
	}
	:global(html[data-theme='high-contrast']) .instrument-panel {
		border-width: 2px;
	}
</style>
