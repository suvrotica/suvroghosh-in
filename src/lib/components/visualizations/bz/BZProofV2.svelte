<script lang="ts">
	import { BZ_V2_CALIBRATION_MANIFEST } from '$lib/visualizations/bz/calibration/manifest';
	import type { BZCalibrationRecordV2 } from '$lib/visualizations/bz/v2-types';
	import BZProofFieldViews from './BZProofFieldViews.svelte';
	import {
		BZ_V2_HERO_SLOTS,
		bzV2HeroPreset,
		bzV2HeroStatusLabel,
		type BZV2SharedSessionSnapshot
	} from './v2-experience-model';

	type Props = {
		session?: Readonly<BZV2SharedSessionSnapshot> | null;
		active?: boolean;
	};
	type ParityCase = {
		readonly id: string;
		readonly gridSize: number;
		readonly step: number;
		readonly maxAbsolute: number;
		readonly rms: number;
		readonly pass: boolean;
	};
	type ParityView = {
		readonly measured: boolean;
		readonly pass: boolean;
		readonly scope: string;
		readonly evidencePath: string | null;
		readonly reason: string | null;
		readonly cases: readonly ParityCase[];
	};
	let { session = null, active = false }: Props = $props();

	const manifest = BZ_V2_CALIBRATION_MANIFEST;
	const validatedCount = manifest.presets.filter(
		(preset) => preset.hero && preset.validationStatus === 'validated'
	).length;
	const failingConvergence = manifest.calibrations.flatMap((calibration) =>
		calibration.convergence.filter((record) => !record.pass)
	).length;
	const performanceReadbacks = manifest.performance.reduce(
		(total, report) => total + report.fullStateReadbacks,
		0
	);

	function format(value: number, digits = 3): string {
		return Number.isFinite(value) ? value.toFixed(digits) : '—';
	}

	function formatBytes(value: number): string {
		if (!Number.isFinite(value) || value < 0) return '—';
		return value >= 1024 * 1024
			? `${format(value / (1024 * 1024), 1)} MiB`
			: `${format(value / 1024, 1)} KiB`;
	}

	function object(value: unknown): Readonly<Record<string, unknown>> | null {
		return value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as Readonly<Record<string, unknown>>)
			: null;
	}

	function parityView(calibration: Readonly<BZCalibrationRecordV2>): ParityView {
		const parity = calibration.cpuGpuParity;
		if (parity.status !== 'measured') {
			return {
				measured: false,
				pass: false,
				scope: 'not measured',
				evidencePath: null,
				reason: typeof parity.reason === 'string' ? parity.reason : 'No measured parity record.',
				cases: []
			};
		}
		const cases = (Array.isArray(parity.numericalCases) ? parity.numericalCases : []).flatMap(
			(value): ParityCase[] => {
				const item = object(value);
				const error = object(item?.error);
				return typeof item?.id === 'string' &&
					typeof item.gridSize === 'number' &&
					typeof item.step === 'number' &&
					typeof error?.maxAbsolute === 'number' &&
					typeof error.rms === 'number' &&
					typeof item.pass === 'boolean'
					? [
							{
								id: item.id,
								gridSize: item.gridSize,
								step: item.step,
								maxAbsolute: error.maxAbsolute,
								rms: error.rms,
								pass: item.pass
							}
						]
					: [];
			}
		);
		return {
			measured: true,
			pass: parity.pass === true,
			scope: typeof parity.scope === 'string' ? parity.scope : 'measured CPU/GPU parity',
			evidencePath: typeof parity.evidencePath === 'string' ? parity.evidencePath : null,
			reason: null,
			cases
		};
	}

	let selectedHeroId = $derived(session?.heroId ?? 'persistent-single-spiral');
	let selectedSlot = $derived(BZ_V2_HERO_SLOTS.find((slot) => slot.id === selectedHeroId) ?? null);
	let selectedPreset = $derived(bzV2HeroPreset(manifest, selectedHeroId));
	let selectedCalibration = $derived(
		selectedPreset
			? (manifest.calibrations.find(
					(record) => record.id === selectedPreset?.calibrationRecordId
				) ?? null)
			: null
	);
</script>

<section class="proof" data-testid="bz-v2-proof" aria-labelledby="bz-v2-proof-title">
	<header>
		<div>
			<p class="eyebrow">Proof · generated evidence</p>
			<h3 id="bz-v2-proof-title">Claims stop where the manifest stops.</h3>
		</div>
		<p>
			This layer reads the same public V2 calibration manifest used by presets, checkpoints and
			publication records. Empty evidence remains visibly empty.
		</p>
	</header>

	<section class="live-session" aria-labelledby="bz-v2-live-session-title">
		<div>
			<span>Shared numerical session</span>
			<h4 id="bz-v2-live-session-title">{selectedSlot?.title ?? 'Gallery session preparing'}</h4>
			<p>
				The Gallery stage remains the owner of this run. Proof reads its bounded frame summary;
				opening this panel neither reconstructs nor resets the field.
			</p>
		</div>
		{#if session?.latestFrame}
			<dl>
				<div>
					<dt>Origin</dt>
					<dd>{session.runOrigin}</dd>
				</div>
				<div>
					<dt>State</dt>
					<dd>{session.running ? 'running' : 'paused'}</dd>
				</div>
				<div>
					<dt>Step</dt>
					<dd>{session.latestFrame.step.toLocaleString()}</dd>
				</div>
				<div>
					<dt>Model t</dt>
					<dd>{format(session.latestFrame.modelTime)}</dd>
				</div>
				<div>
					<dt>Engine</dt>
					<dd>{session.latestFrame.engine}</dd>
				</div>
				<div>
					<dt>mean u</dt>
					<dd>{format(session.latestFrame.metrics.meanU)}</dd>
				</div>
				<div>
					<dt>mean v</dt>
					<dd>{format(session.latestFrame.metrics.meanV)}</dd>
				</div>
				<div>
					<dt>var(u)</dt>
					<dd>{format(session.latestFrame.metrics.varianceU)}</dd>
				</div>
			</dl>
		{:else}
			<p class="session-empty">
				{session?.failure
					? 'The selected Gallery state failed to initialise.'
					: 'No numerical frame has been published by the Gallery stage yet.'}
			</p>
		{/if}
	</section>

	<div class="summary-grid" aria-label="V2 evidence summary">
		<article>
			<span>Hero regimes</span>
			<strong>{validatedCount} / 3</strong>
			<small>manifest-validated</small>
		</article>
		<article>
			<span>Calibration records</span>
			<strong>{manifest.calibrations.length}</strong>
			<small>{failingConvergence} failed convergence comparisons</small>
		</article>
		<article>
			<span>Checkpoints</span>
			<strong>{manifest.checkpoints.length}</strong>
			<small>checksum-addressed</small>
		</article>
		<article>
			<span>Performance reports</span>
			<strong>{manifest.performance.length}</strong>
			<small>{performanceReadbacks} declared full-state readbacks</small>
		</article>
	</div>

	{#if validatedCount < 3}
		<div class="boundary" role="note">
			<b>Validation boundary active</b>
			<p>
				{manifest.articleClaims.validationBoundary ??
					'No complete set of three validated V2 hero regimes is present.'}
			</p>
		</div>
	{/if}

	<div class="hero-ledger">
		{#each BZ_V2_HERO_SLOTS as slot (slot.id)}
			{@const preset = bzV2HeroPreset(manifest, slot.id)}
			<article data-status={preset?.validationStatus ?? 'missing'}>
				<div class="ledger-heading">
					<div>
						<span>{slot.shortTitle}</span>
						<h4>{slot.title}</h4>
					</div>
					<b>{bzV2HeroStatusLabel(preset)}</b>
				</div>
				{#if preset}
					<p>{preset.validationSummary.headline}</p>
					<dl>
						<div>
							<dt>Observation</dt>
							<dd>
								{format(preset.observationWindow.startTime)}–{format(
									preset.observationWindow.endTime
								)}
							</dd>
						</div>
						<div>
							<dt>Grid</dt>
							<dd>{preset.setup.gridSize}²</dd>
						</div>
						<div>
							<dt>Fixed Δt</dt>
							<dd>{preset.setup.timestep}</dd>
						</div>
						<div>
							<dt>Source</dt>
							<dd>{preset.sourceSemantics.replaceAll('-', ' ')}</dd>
						</div>
					</dl>
					<details>
						<summary>Criteria and measurements</summary>
						<div class="criteria">
							{#if preset.validationSummary.passedCriteria.length > 0}
								<section>
									<h5>Passed</h5>
									<ul>
										{#each preset.validationSummary.passedCriteria as criterion (criterion)}<li>
												{criterion}
											</li>{/each}
									</ul>
								</section>
							{/if}
							{#if preset.validationSummary.failedCriteria.length > 0}
								<section>
									<h5>Not passed</h5>
									<ul>
										{#each preset.validationSummary.failedCriteria as criterion (criterion)}<li>
												{criterion}
											</li>{/each}
									</ul>
								</section>
							{/if}
							{#if Object.keys(preset.validationSummary.measurements).length > 0}
								<section>
									<h5>Measurements</h5>
									<dl class="measurements">
										{#each Object.entries(preset.validationSummary.measurements) as [name, value] (name)}<div
											>
												<dt>{name}</dt>
												<dd>{String(value ?? 'null')}</dd>
											</div>{/each}
									</dl>
								</section>
							{/if}
						</div>
					</details>
				{:else}
					<p>{slot.criterion}</p>
					<small
						>No setup, status, checkpoint or morphology claim is supplied by the manifest.</small
					>
				{/if}
			</article>
		{/each}
	</div>

	<BZProofFieldViews preset={selectedPreset} calibration={selectedCalibration} {active} />

	<div class="proof-details">
		<details open>
			<summary>Numerical contract</summary>
			<div class="detail-body">
				<dl>
					<div>
						<dt>Engine</dt>
						<dd><code>{manifest.engineVersion}</code></dd>
					</div>
					<div>
						<dt>Display</dt>
						<dd><code>{manifest.displayVersion}</code></dd>
					</div>
					<div>
						<dt>Generated by</dt>
						<dd>{manifest.generatedBy}</dd>
					</div>
					<div>
						<dt>Generated at</dt>
						<dd>{manifest.generatedAt}</dd>
					</div>
				</dl>
				<p><b>Integrator:</b> {manifest.numericalMethod}</p>
				<p><b>Boundary:</b> {manifest.boundaryMethod}</p>
			</div>
		</details>

		<details>
			<summary>Display contract</summary>
			<div class="detail-body">
				<p>
					Interpolation, palette, exposure, bloom, tone mapping and glass treatment are presentation
					only. They do not enter the PDE state.
				</p>
				{#if manifest.displayProfiles.length > 0}
					<ul class="profile-list">
						{#each manifest.displayProfiles as profile (profile.id)}
							<li>
								<b>{profile.title}</b><span>{profile.style} · {profile.rangeMode} ranges</span
								><small>{profile.disclosure}</small>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">No calibrated display profile is published in this manifest.</p>
				{/if}
			</div>
		</details>

		<details>
			<summary>Convergence and parity</summary>
			<div class="detail-body">
				{#if manifest.calibrations.length > 0}
					{#each manifest.calibrations as calibration (calibration.id)}
						{@const parity = parityView(calibration)}
						<section class="calibration-block">
							<h4>{calibration.id}</h4>
							<p>{calibration.statusReason}</p>
							<ul>
								{#each calibration.convergence as comparison (comparison.comparison)}
									<li data-pass={comparison.pass}>
										<b>{comparison.observable}</b><span
											>{comparison.comparison}: {format(100 * comparison.relativeDifference, 2)}% / {format(
												100 * comparison.tolerance,
												2
											)}% tolerance</span
										>
									</li>
								{/each}
							</ul>
							<div class="parity-record" data-pass={parity.pass} data-measured={parity.measured}>
								<div>
									<b>CPU/GPU parity</b>
									<span
										>{parity.measured ? (parity.pass ? 'passed' : 'failed') : 'not measured'}</span
									>
								</div>
								<p>{parity.reason ?? parity.scope}</p>
								{#if parity.cases.length > 0}
									<ul class="parity-cases">
										{#each parity.cases as parityCase (parityCase.id)}
											<li data-pass={parityCase.pass}>
												<b>{parityCase.id.replaceAll('-', ' ')}</b>
												<span>{parityCase.gridSize}² · step {parityCase.step.toLocaleString()}</span
												>
												<small
													>max |Δ| {format(parityCase.maxAbsolute, 6)} · RMS {format(
														parityCase.rms,
														6
													)}</small
												>
											</li>
										{/each}
									</ul>
								{/if}
								{#if parity.evidencePath}
									<!-- Static evidence artifact, not a SvelteKit route. -->
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={parity.evidencePath}>Open parity evidence →</a>
								{/if}
							</div>
						</section>
					{/each}
				{:else}
					<p class="empty">No convergence or CPU/GPU parity record is published yet.</p>
				{/if}
			</div>
		</details>

		<details>
			<summary>Browser performance evidence</summary>
			<div class="detail-body">
				{#if manifest.performance.length > 0}
					<div class="performance-table" role="table" aria-label="Browser performance reports">
						<div class="header table-row" role="row">
							<span role="columnheader">Browser / GPU</span><span role="columnheader"
								>Grid / display</span
							><span role="columnheader">FPS</span><span role="columnheader">Steps/s</span><span
								role="columnheader">Telemetry</span
							><span role="columnheader">Full reads</span><span role="columnheader">Textures</span>
						</div>
						{#each manifest.performance as report (report.browser)}
							<div class="table-row" role="row">
								<span role="cell"><b>{report.browser}</b><small>{report.gpu}</small></span><span
									role="cell">{report.stateGrid}² <small>{report.displayResolution}</small></span
								><span role="cell">{format(report.medianFps, 1)}</span><span role="cell"
									>{format(report.medianStepsPerSecond, 1)}</span
								><span role="cell">{format(report.telemetryHz, 1)} Hz</span><span role="cell"
									>{report.fullStateReadbacks}</span
								><span role="cell"
									>{formatBytes(report.scientificTextureBytes + report.displayTextureBytes)}</span
								>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty">No measured browser performance report is published yet.</p>
				{/if}
			</div>
		</details>
	</div>

	<p class="manifest-link">
		<!-- Static publication artifact, not a SvelteKit route. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/data/bz-v2-calibration.json">Open the complete public V2 manifest →</a>
	</p>
</section>

<style>
	.proof {
		padding: clamp(1rem, 3vw, 2rem);
		background: #12191b;
		color: #edf0e8;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 1.2rem;
		margin-bottom: 1.2rem;
	}
	header h3 {
		margin: 0;
		font-family: var(--font-serif, 'Source Serif 4', serif);
		font-size: clamp(1.45rem, 3vw, 2.25rem);
		letter-spacing: -0.03em;
	}
	header > p {
		max-width: 50ch;
		margin: 0;
		color: rgb(237 240 232 / 0.62);
		font-size: 0.75rem;
		line-height: 1.55;
	}
	.live-session {
		display: grid;
		grid-template-columns: minmax(13rem, 0.8fr) minmax(0, 1.4fr);
		gap: 1rem;
		align-items: end;
		margin-bottom: 0.8rem;
		border: 1px solid rgb(38 127 147 / 0.36);
		border-left-width: 4px;
		border-radius: 0.75rem;
		background: rgb(38 127 147 / 0.075);
		padding: 0.8rem;
	}
	.live-session span,
	.live-session dt {
		color: rgb(237 240 232 / 0.45);
		font:
			700 0.57rem/1.2 ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	.live-session h4 {
		margin: 0.18rem 0 0;
		font-size: 0.92rem;
	}
	.live-session p {
		margin: 0.35rem 0 0;
		color: rgb(237 240 232 / 0.58);
		font-size: 0.65rem;
		line-height: 1.45;
	}
	.live-session dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
		margin: 0;
	}
	.live-session dd {
		margin: 0.15rem 0 0;
		font:
			0.63rem/1.25 ui-monospace,
			monospace;
		font-variant-numeric: tabular-nums;
	}
	.session-empty {
		align-self: center;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #e1a78b;
		font:
			700 0.63rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.summary-grid article {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 0.75rem;
		background: rgb(5 9 12 / 0.52);
		padding: 0.8rem;
	}
	.summary-grid span,
	.summary-grid small {
		color: rgb(237 240 232 / 0.5);
		font:
			0.6rem/1.35 ui-monospace,
			monospace;
	}
	.summary-grid strong {
		font-size: 1.5rem;
		font-variant-numeric: tabular-nums;
	}
	.boundary {
		margin-top: 0.8rem;
		border: 1px solid rgb(255 206 99 / 0.35);
		border-left-width: 4px;
		border-radius: 0.65rem;
		background: rgb(255 206 99 / 0.055);
		padding: 0.75rem 0.85rem;
		color: #ffdf93;
	}
	.boundary p {
		margin: 0.25rem 0 0;
		color: rgb(255 223 147 / 0.75);
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.hero-ledger {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 1rem;
	}
	.hero-ledger > article {
		min-width: 0;
		border: 1px solid rgb(255 255 255 / 0.11);
		border-top: 3px solid #ffce63;
		border-radius: 0.8rem;
		background: rgb(5 9 12 / 0.5);
		padding: 0.85rem;
	}
	.hero-ledger > article[data-status='validated'] {
		border-top-color: #61b69d;
	}
	.hero-ledger > article[data-status='rejected'] {
		border-top-color: #e45468;
	}
	.ledger-heading {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		align-items: start;
	}
	.ledger-heading span,
	.ledger-heading > b {
		color: rgb(237 240 232 / 0.5);
		font:
			700 0.57rem/1.2 ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	.ledger-heading h4 {
		margin: 0.16rem 0 0;
		font-size: 0.9rem;
	}
	.hero-ledger article > p {
		margin: 0.65rem 0;
		color: rgb(237 240 232 / 0.65);
		font-size: 0.69rem;
		line-height: 1.5;
	}
	.hero-ledger article > small {
		display: block;
		color: rgb(237 240 232 / 0.45);
		font-size: 0.63rem;
		line-height: 1.45;
	}
	.hero-ledger dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
		margin: 0;
	}
	.hero-ledger dl div {
		min-width: 0;
	}
	.hero-ledger dt,
	.hero-ledger dd {
		font:
			0.58rem/1.35 ui-monospace,
			monospace;
	}
	.hero-ledger dt {
		color: rgb(237 240 232 / 0.42);
	}
	.hero-ledger dd {
		margin: 0.12rem 0 0;
		overflow-wrap: anywhere;
	}
	details {
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 0.65rem;
		background: rgb(5 9 12 / 0.46);
	}
	.hero-ledger details {
		margin-top: 0.7rem;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		padding: 0.72rem 0.8rem;
		font-size: 0.72rem;
		font-weight: 800;
	}
	summary:focus-visible,
	a:focus-visible {
		outline: 3px solid #ffce63;
		outline-offset: 2px;
	}
	.criteria {
		display: grid;
		gap: 0.65rem;
		border-top: 1px solid rgb(255 255 255 / 0.08);
		padding: 0.7rem;
	}
	.criteria h5 {
		margin: 0;
		font-size: 0.65rem;
	}
	.criteria ul {
		margin: 0.25rem 0 0;
		padding-left: 1rem;
		color: rgb(237 240 232 / 0.58);
		font-size: 0.61rem;
		line-height: 1.45;
	}
	.measurements {
		display: grid !important;
		grid-template-columns: 1fr !important;
	}
	.measurements div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.proof-details {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
	}
	.detail-body {
		border-top: 1px solid rgb(255 255 255 / 0.08);
		padding: 0.8rem;
		color: rgb(237 240 232 / 0.66);
		font-size: 0.7rem;
		line-height: 1.55;
	}
	.detail-body > dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
		margin: 0 0 0.8rem;
	}
	.detail-body dt {
		color: rgb(237 240 232 / 0.43);
		font:
			0.58rem/1.2 ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	.detail-body dd {
		margin: 0.2rem 0 0;
		overflow-wrap: anywhere;
	}
	.profile-list {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.profile-list li {
		display: grid;
		grid-template-columns: minmax(10rem, 0.8fr) minmax(10rem, 0.7fr) minmax(0, 1.6fr);
		gap: 0.6rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.06);
		padding-bottom: 0.45rem;
	}
	.profile-list small,
	.profile-list span,
	.empty {
		color: rgb(237 240 232 / 0.5);
	}
	.calibration-block h4,
	.calibration-block p {
		margin: 0 0 0.4rem;
	}
	.calibration-block ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.calibration-block li {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		border-left: 3px solid #e45468;
		padding: 0.35rem 0.5rem;
	}
	.calibration-block li[data-pass='true'] {
		border-left-color: #61b69d;
	}
	.parity-record {
		margin-top: 0.65rem;
		border: 1px solid rgb(228 84 104 / 0.32);
		border-left: 3px solid #e45468;
		border-radius: 0.45rem;
		padding: 0.55rem;
	}
	.parity-record[data-pass='true'] {
		border-color: rgb(97 182 157 / 0.32);
		border-left-color: #61b69d;
	}
	.parity-record[data-measured='false'] {
		border-color: rgb(255 206 99 / 0.3);
		border-left-color: #ffce63;
	}
	.parity-record > div {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.parity-record > div span,
	.parity-record small {
		color: rgb(237 240 232 / 0.5);
		font:
			0.58rem/1.35 ui-monospace,
			monospace;
	}
	.parity-record p {
		margin: 0.3rem 0;
	}
	.parity-record > a {
		color: #80c9d7;
		font-size: 0.63rem;
	}
	.parity-cases {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.35rem;
		margin: 0.5rem 0;
		padding: 0;
		list-style: none;
	}
	.parity-cases li {
		display: grid;
		justify-content: initial;
		gap: 0.12rem;
		border: 1px solid rgb(255 255 255 / 0.08);
		border-left: 3px solid #e45468;
		padding: 0.42rem;
	}
	.parity-cases li[data-pass='true'] {
		border-left-color: #61b69d;
	}
	.performance-table {
		display: grid;
		min-width: 48rem;
	}
	.table-row {
		display: grid;
		grid-template-columns: 1.5fr 1.1fr repeat(5, 0.7fr);
		gap: 0.5rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.07);
		padding: 0.45rem;
	}
	.table-row.header {
		font-weight: 800;
	}
	.table-row > span {
		display: grid;
		align-content: center;
	}
	.table-row small {
		color: rgb(237 240 232 / 0.46);
		font-size: 0.56rem;
	}
	.proof-details details:last-child .detail-body {
		overflow-x: auto;
	}
	.manifest-link {
		margin: 1rem 0 0;
		text-align: right;
	}
	.manifest-link a {
		color: #80c9d7;
		font-size: 0.72rem;
		text-underline-offset: 0.18em;
	}
	@media (max-width: 900px) {
		.live-session {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary-grid {
			grid-template-columns: 1fr 1fr;
		}
		.hero-ledger {
			grid-template-columns: minmax(0, 1fr);
		}
		.detail-body > dl {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 600px) {
		.proof {
			padding: 0.85rem;
		}
		header {
			display: block;
		}
		header > p {
			margin-top: 0.55rem;
		}
		.profile-list li {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.15rem;
		}
		.live-session dl {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 390px) {
		.summary-grid,
		.detail-body > dl {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		details,
		summary {
			scroll-behavior: auto;
		}
	}
</style>
