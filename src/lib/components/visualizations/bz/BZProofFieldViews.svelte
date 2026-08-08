<script lang="ts">
	import {
		BZ_SCIENTIFIC_REFERENCE_PROFILE_V2,
		checkpointStateToBZFieldState,
		circularDishWallDistance,
		decodeBZCheckpointV1,
		detectBZPhaseCores,
		renderBZToCanvasV2,
		type BZCalibrationRecordV2,
		type BZPhaseCore,
		type BZPresetV2,
		type BZRenderProfileV2
	} from '$lib/visualizations/bz';
	import {
		bzProofSpiralTrace,
		bzProofTargetTrace,
		type BZProofCoreSample,
		type BZProofRotationTrack
	} from '$lib/visualizations/bz/proof-evidence';
	import { BZ_V2_CALIBRATION_MANIFEST } from '$lib/visualizations/bz/calibration/manifest';

	type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';
	type CheckpointProvenance = {
		readonly checkpointId: string;
		readonly fileSha256: string;
		readonly browserStateSha256: string;
		readonly cpuReferenceSha256: string;
		readonly modelStep: number;
		readonly modelTime: number;
		readonly grid: number;
	};
	type Props = {
		preset: Readonly<BZPresetV2> | null;
		calibration: Readonly<BZCalibrationRecordV2> | null;
		active?: boolean;
	};

	let { preset, calibration, active = false }: Props = $props();
	let rawCanvas: HTMLCanvasElement | undefined = $state();
	let phaseCanvas: HTMLCanvasElement | undefined = $state();
	let loadStatus = $state<LoadStatus>('idle');
	let errorMessage = $state('');
	let phaseCores = $state.raw<readonly BZPhaseCore[]>([]);
	let provenance = $state.raw<CheckpointProvenance | null>(null);
	let renderedPresetId: string | null = null;

	const manifest = BZ_V2_CALIBRATION_MANIFEST;
	const traceColours = ['#f0b24b', '#df4965', '#7bc6d7', '#9d7bea'] as const;
	const comparatorAsset = manifest.assets.find((asset) =>
		asset.id.startsWith('bz-v2-bz-versus-turing-plate')
	);
	let targetTrace = $derived(calibration ? bzProofTargetTrace(calibration) : null);
	let spiralTrace = $derived(calibration ? bzProofSpiralTrace(calibration) : null);

	const targetPlot = { left: 44, top: 14, width: 284, height: 112 } as const;
	const corePlot = { left: 44, top: 14, width: 284, height: 92 } as const;

	function shortHash(value: string): string {
		return `${value.slice(0, 12)}…${value.slice(-8)}`;
	}

	function format(value: number, digits = 2): string {
		return Number.isFinite(value) ? value.toFixed(digits) : '—';
	}

	function publicAssetPath(path: string): string {
		const normalized = path.replaceAll('\\', '/').replace(/^static\//u, '');
		return normalized.startsWith('/') ? normalized : `/${normalized}`;
	}

	function targetX(value: number): number {
		if (!targetTrace) return targetPlot.left;
		const span = Math.max(Number.EPSILON, targetTrace.endTime - targetTrace.startTime);
		return targetPlot.left + ((value - targetTrace.startTime) / span) * targetPlot.width;
	}

	function targetY(value: number): number {
		if (!targetTrace) return targetPlot.top + targetPlot.height;
		return (
			targetPlot.top +
			targetPlot.height -
			(value / Math.max(Number.EPSILON, targetTrace.maximumRadius)) * targetPlot.height
		);
	}

	function coreX(value: number): number {
		if (!spiralTrace) return corePlot.left;
		const span = Math.max(Number.EPSILON, spiralTrace.endTime - spiralTrace.startTime);
		return corePlot.left + ((value - spiralTrace.startTime) / span) * corePlot.width;
	}

	function coreY(value: number): number {
		if (!spiralTrace) return corePlot.top + corePlot.height / 2;
		const bound = Math.max(Number.EPSILON, spiralTrace.maximumCoordinate);
		return corePlot.top + corePlot.height / 2 - (value / bound) * (corePlot.height / 2);
	}

	function coreSeries(samples: readonly BZProofCoreSample[], coordinate: 'x' | 'y'): string {
		return samples
			.map((sample) => `${coreX(sample.modelTime)},${coreY(sample[coordinate])}`)
			.join(' ');
	}

	function rotationTicks(track: Readonly<BZProofRotationTrack>): readonly number[] {
		const count = Math.max(0, Math.floor(track.rotations));
		return Array.from(
			{ length: count },
			(_, index) =>
				track.startTime + ((index + 1) / track.rotations) * (track.endTime - track.startTime)
		).filter((time) => time <= track.endTime);
	}

	function markerStyle(core: Readonly<BZPhaseCore>): string {
		if (!preset) return '';
		const x = Math.max(0, Math.min(100, (core.x / preset.setup.domainSize + 0.5) * 100));
		const y = Math.max(0, Math.min(100, (core.y / preset.setup.domainSize + 0.5) * 100));
		return `left:${x}%;top:${y}%`;
	}

	function profileFor(selected: Readonly<BZPresetV2>): Readonly<BZRenderProfileV2> {
		return (
			manifest.displayProfiles.find((profile) => profile.id === selected.displayProfileId) ??
			BZ_SCIENTIFIC_REFERENCE_PROFILE_V2
		);
	}

	async function loadCheckpoint(
		selected: Readonly<BZPresetV2>,
		raw: HTMLCanvasElement,
		phase: HTMLCanvasElement,
		signal: AbortSignal
	): Promise<void> {
		const descriptor = selected.optionalCheckpoint;
		loadStatus = 'loading';
		errorMessage = '';
		phaseCores = [];
		provenance = null;
		if (!descriptor) throw new Error(`${selected.title} has no authenticated checkpoint.`);
		const response = await fetch(descriptor.path, { cache: 'force-cache', signal });
		if (!response.ok) throw new Error(`Checkpoint request returned HTTP ${response.status}.`);
		const decoded = await decodeBZCheckpointV1(new Uint8Array(await response.arrayBuffer()), {
			checkpointId: descriptor.id,
			sourcePresetId: selected.id,
			setup: selected.setup,
			interventions: selected.initialInterventions,
			engineVersion: manifest.engineVersion,
			validationRecordId: selected.calibrationRecordId,
			cpuFloat64StateSha256: descriptor.fieldSha256F64Reference ?? undefined,
			fileSha256: descriptor.sha256
		});
		if (signal.aborted) return;
		const field = checkpointStateToBZFieldState(decoded.state);
		const phaseProfile = profileFor(selected);
		renderBZToCanvasV2(raw, field, selected.setup, {
			profile: BZ_SCIENTIFIC_REFERENCE_PROFILE_V2,
			view: 'u',
			width: 512,
			height: 512,
			rangeMode: 'fixed',
			interpolation: 'raw-cell',
			bloom: false,
			glass: false
		});
		renderBZToCanvasV2(phase, field, selected.setup, {
			profile: phaseProfile,
			view: 'phase',
			width: 512,
			height: 512,
			rangeMode: 'fixed',
			interpolation: 'raw-cell',
			bloom: false,
			glass: false
		});
		if (selected.id !== 'classic-target-rings') {
			const minimumWallDistance = selected.id === 'spiral-garden' ? 1.25 : 1.5;
			phaseCores = detectBZPhaseCores(
				field,
				selected.setup,
				phaseProfile.phase,
				Math.PI,
				0.025
			).filter(
				(core) => circularDishWallDistance([core.x, core.y], selected.setup) > minimumWallDistance
			);
		}
		provenance = {
			checkpointId: decoded.metadata.checkpointId,
			fileSha256: decoded.sha256,
			browserStateSha256: decoded.metadata.checksums.browserFloat32State,
			cpuReferenceSha256: decoded.metadata.checksums.cpuFloat64State,
			modelStep: decoded.metadata.warmupStep,
			modelTime: decoded.metadata.modelTime,
			grid: decoded.metadata.width
		};
		loadStatus = 'ready';
	}

	$effect(() => {
		const selected = preset;
		const raw = rawCanvas;
		const phase = phaseCanvas;
		if (!active || !selected || !raw || !phase) {
			renderedPresetId = null;
			return;
		}
		if (renderedPresetId === selected.id) return;
		renderedPresetId = selected.id;
		const controller = new AbortController();
		void loadCheckpoint(selected, raw, phase, controller.signal).catch((error) => {
			if (controller.signal.aborted) return;
			loadStatus = 'failed';
			errorMessage = error instanceof Error ? error.message : String(error);
		});
		return () => {
			controller.abort();
			if (renderedPresetId === selected.id) renderedPresetId = null;
		};
	});
</script>

<section
	class="field-proof"
	data-testid="bz-v2-proof-field-views"
	aria-labelledby="bz-v2-field-proof-title"
>
	<header>
		<div>
			<span>Authenticated field evidence</span>
			<h4 id="bz-v2-field-proof-title">Checkpoint fields and measured motion</h4>
		</div>
		<p>
			This panel reads the selected checkpoint directly. It never requests a field snapshot from the
			live Gallery engine.
		</p>
	</header>

	{#if !active}
		<p class="idle">Field evidence loads only while Proof is open.</p>
	{:else if !preset || !calibration}
		<p class="empty">No selected hero calibration is available.</p>
	{:else}
		<div class="selected-evidence">
			<div>
				<span>Selected record</span>
				<strong>{preset.title}</strong>
			</div>
			<small>{calibration.id} · {calibration.status}</small>
		</div>

		<div
			class="field-grid"
			aria-busy={loadStatus === 'loading'}
			data-ready={loadStatus === 'ready'}
		>
			<figure>
				<div
					class="canvas-shell"
					role="img"
					aria-label={`Raw activator field u for ${preset.title} at its authenticated checkpoint`}
				>
					<canvas bind:this={rawCanvas} aria-hidden="true"></canvas>
					{#if loadStatus === 'loading'}<span class="loading">Authenticating checkpoint…</span>{/if}
				</div>
				<figcaption>
					<b>Raw u field</b>
					<span>Fixed manifest range · exact stored texels · no bloom</span>
				</figcaption>
			</figure>

			<figure>
				<div
					class="canvas-shell phase-shell"
					role="img"
					aria-label={`Cyclic phase field for ${preset.title} at its authenticated checkpoint; ${phaseCores.length} measured cores are labelled`}
				>
					<canvas bind:this={phaseCanvas} aria-hidden="true"></canvas>
					{#if loadStatus === 'loading'}<span class="loading">Computing phase winding…</span>{/if}
					{#if loadStatus === 'ready'}
						{#each phaseCores as core, index (`${core.x}:${core.y}:${core.charge}`)}
							<span
								class="core-marker"
								style={markerStyle(core)}
								aria-hidden="true"
								data-charge={core.charge}>C{index + 1}</span
							>
						{/each}
					{/if}
				</div>
				<figcaption>
					<b>Phase winding</b>
					<span>Same u,v checkpoint · measured cores labelled C1…Cn</span>
				</figcaption>
			</figure>
		</div>

		{#if loadStatus === 'failed'}
			<p class="error" role="alert"><b>Checkpoint evidence unavailable.</b> {errorMessage}</p>
		{/if}

		{#if provenance}
			<dl class="provenance">
				<div>
					<dt>Checkpoint</dt>
					<dd>{provenance.checkpointId}</dd>
				</div>
				<div>
					<dt>Grid / time</dt>
					<dd>{provenance.grid}² · t={format(provenance.modelTime, 3)}</dd>
				</div>
				<div>
					<dt>Step</dt>
					<dd>{provenance.modelStep.toLocaleString()}</dd>
				</div>
				<div>
					<dt>File SHA-256</dt>
					<dd><code>{shortHash(provenance.fileSha256)}</code></dd>
				</div>
				<div>
					<dt>Browser-state SHA-256</dt>
					<dd><code>{shortHash(provenance.browserStateSha256)}</code></dd>
				</div>
				<div>
					<dt>CPU-reference SHA-256</dt>
					<dd><code>{shortHash(provenance.cpuReferenceSha256)}</code></dd>
				</div>
			</dl>
			{#if phaseCores.length > 0}
				<ul class="core-list" aria-label="Detected checkpoint phase cores">
					{#each phaseCores as core, index (`core-${core.x}-${core.y}`)}
						<li>
							<b>C{index + 1}</b>
							<span>x={format(core.x, 3)}, y={format(core.y, 3)}</span>
							<small
								>charge {core.charge > 0 ? '+1' : '−1'} · winding {format(
									core.winding / (2 * Math.PI),
									2
								)} turns</small
							>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		<div class="trace-grid">
			{#if targetTrace}
				<figure class="trace-card">
					<svg
						viewBox="0 0 360 166"
						role="img"
						aria-labelledby="target-trace-title target-trace-desc"
					>
						<title id="target-trace-title">Measured radial target-wave tracks</title>
						<desc id="target-trace-desc">
							Four fitted front tracks move outwards over the declared finite observation window.
						</desc>
						<line
							class="axis"
							x1={targetPlot.left}
							y1={targetPlot.top}
							x2={targetPlot.left}
							y2={targetPlot.top + targetPlot.height}
						/>
						<line
							class="axis"
							x1={targetPlot.left}
							y1={targetPlot.top + targetPlot.height}
							x2={targetPlot.left + targetPlot.width}
							y2={targetPlot.top + targetPlot.height}
						/>
						{#each targetTrace.tracks as track, index (`${track.startTime}:${track.startRadius}`)}
							<line
								class="trace-line"
								x1={targetX(track.startTime)}
								y1={targetY(track.startRadius)}
								x2={targetX(track.endTime)}
								y2={targetY(track.endRadius)}
								style={`stroke:${traceColours[index % traceColours.length]}`}
							/>
							<circle
								cx={targetX(track.startTime)}
								cy={targetY(track.startRadius)}
								r="3"
								style={`fill:${traceColours[index % traceColours.length]}`}
							/>
							<circle
								cx={targetX(track.endTime)}
								cy={targetY(track.endRadius)}
								r="3"
								style={`fill:${traceColours[index % traceColours.length]}`}
							/>
						{/each}
						<text x={targetPlot.left} y="151">t {format(targetTrace.startTime, 1)}</text>
						<text x={targetPlot.left + targetPlot.width} y="151" text-anchor="end"
							>t {format(targetTrace.endTime, 1)}</text
						>
						<text x="6" y={targetPlot.top + 5}>r {format(targetTrace.maximumRadius, 1)}</text>
						<text x="28" y={targetPlot.top + targetPlot.height}>0</text>
					</svg>
					<figcaption>
						<b>Radial-front evidence</b>
						<span
							>{targetTrace.tracks.length} outward tracks; line endpoints come from the calibration manifest.</span
						>
					</figcaption>
				</figure>
			{:else if spiralTrace}
				<figure class="trace-card">
					<svg
						viewBox="0 0 360 190"
						role="img"
						aria-labelledby="spiral-trace-title spiral-trace-desc"
					>
						<title id="spiral-trace-title">Measured spiral-core and rotation timeline</title>
						<desc id="spiral-trace-desc">
							Core coordinates and finite-time rotation intervals published by the calibration
							manifest.
						</desc>
						<line
							class="axis"
							x1={corePlot.left}
							y1={coreY(0)}
							x2={corePlot.left + corePlot.width}
							y2={coreY(0)}
						/>
						<line
							class="axis"
							x1={corePlot.left}
							y1={corePlot.top}
							x2={corePlot.left}
							y2={corePlot.top + corePlot.height}
						/>
						{#if spiralTrace.samples.length > 1}
							<polyline class="core-x" points={coreSeries(spiralTrace.samples, 'x')} />
							<polyline class="core-y" points={coreSeries(spiralTrace.samples, 'y')} />
						{/if}
						<text x="8" y="22" class="x-label">x</text><text x="24" y="22" class="y-label">y</text>
						{#each spiralTrace.tracks as track, index (track.label)}
							{@const barY = 124 + index * 20}
							<text x="4" y={barY + 4}>{track.label.replace('Tracked ', '')}</text>
							<line
								class="rotation-bar"
								x1={coreX(track.startTime)}
								y1={barY}
								x2={coreX(track.endTime)}
								y2={barY}
							/>
							{#each rotationTicks(track) as time (time)}
								<line
									class="rotation-tick"
									x1={coreX(time)}
									y1={barY - 5}
									x2={coreX(time)}
									y2={barY + 5}
								/>
							{/each}
							<text x={coreX(track.endTime)} y={barY - 5} text-anchor="end"
								>{format(track.rotations, 2)} rot.</text
							>
						{/each}
						<text x={corePlot.left} y="184">t {format(spiralTrace.startTime, 1)}</text>
						<text x={corePlot.left + corePlot.width} y="184" text-anchor="end"
							>t {format(spiralTrace.endTime, 1)}</text
						>
					</svg>
					<figcaption>
						<b>Core / rotation evidence</b>
						<span>
							{spiralTrace.tracks.length} persistent track{spiralTrace.tracks.length === 1
								? ''
								: 's'}
							{spiralTrace.periodMean ? ` · mean period ${format(spiralTrace.periodMean, 3)}` : ''}
						</span>
					</figcaption>
				</figure>
			{/if}

			{#if comparatorAsset}
				<figure class="comparator-card">
					<img
						src={publicAssetPath(comparatorAsset.path)}
						alt="Solver-generated rotating Oregonator wave beside a stationary Schnakenberg Turing comparator, with their different diagnostics labelled"
						loading="lazy"
						decoding="async"
					/>
					<figcaption>
						<b>BZ versus Turing</b>
						<span
							>Travelling phase core versus reaction-stable, diffusion-unstable finite-wave-number
							mode.</span
						>
					</figcaption>
				</figure>
			{/if}
		</div>

		<p class="boundary-note">
			Checkpoint images use the exact stored browser Float32 state. Rotation and radial-track claims
			remain finite-time Float64 CPU measurements from <code>{calibration.id}</code>; this view does
			not silently remeasure or extend them.
		</p>
	{/if}
</section>

<style>
	.field-proof {
		margin: 1rem 0 0;
		border: 1px solid rgb(255 255 255 / 0.11);
		border-radius: 0.9rem;
		background: #0c1315;
		padding: clamp(0.8rem, 2.5vw, 1.15rem);
	}
	.field-proof > header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.8fr);
		gap: 1rem;
		align-items: end;
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
		padding-bottom: 0.75rem;
	}
	header span,
	.selected-evidence span {
		color: #7bc6d7;
		font:
			700 0.59rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	h4 {
		margin: 0.2rem 0 0;
		font: 700 clamp(1rem, 2.3vw, 1.35rem)/1.1 var(--font-serif, serif);
	}
	header p,
	.boundary-note,
	.idle,
	.empty {
		margin: 0;
		color: rgb(237 240 232 / 0.6);
		font-size: 0.68rem;
		line-height: 1.55;
	}
	.idle,
	.empty {
		padding-top: 0.8rem;
	}
	.selected-evidence {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
		margin-top: 0.8rem;
	}
	.selected-evidence strong {
		display: block;
		margin-top: 0.15rem;
		color: #fff5df;
		font-size: 0.86rem;
	}
	.selected-evidence small {
		color: rgb(237 240 232 / 0.48);
		font:
			0.58rem/1.35 ui-monospace,
			monospace;
	}
	.field-grid,
	.trace-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	figure {
		min-width: 0;
		margin: 0;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 0.72rem;
		background: #080d10;
		overflow: hidden;
	}
	.canvas-shell {
		position: relative;
		aspect-ratio: 1;
		background: #05080a;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		transition: opacity 150ms ease;
	}
	.field-grid[data-ready='false'] canvas {
		opacity: 0.18;
	}
	.loading {
		position: absolute;
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		width: max-content;
		max-width: 80%;
		border: 1px solid rgb(255 255 255 / 0.17);
		border-radius: 999px;
		background: rgb(5 9 11 / 0.88);
		color: #ffdfa1;
		padding: 0.45rem 0.65rem;
		font:
			0.58rem/1.2 ui-monospace,
			monospace;
		text-align: center;
	}
	.core-marker {
		position: absolute;
		transform: translate(-50%, -50%);
		display: grid;
		place-items: center;
		min-width: 1.55rem;
		height: 1.55rem;
		border: 2px solid #fff8dc;
		border-radius: 50%;
		background: rgb(9 13 16 / 0.72);
		box-shadow: 0 0 0 3px rgb(224 67 95 / 0.38);
		color: #fff8dc;
		font:
			800 0.54rem/1 ui-monospace,
			monospace;
	}
	.core-marker[data-charge='1'] {
		box-shadow: 0 0 0 3px rgb(123 198 215 / 0.4);
	}
	figcaption {
		display: grid;
		gap: 0.15rem;
		border-top: 1px solid rgb(255 255 255 / 0.08);
		padding: 0.62rem 0.7rem;
	}
	figcaption b {
		color: #fff5df;
		font-size: 0.69rem;
	}
	figcaption span {
		color: rgb(237 240 232 / 0.52);
		font-size: 0.6rem;
		line-height: 1.45;
	}
	.error {
		margin: 0.75rem 0 0;
		border-left: 3px solid #df4965;
		background: rgb(223 73 101 / 0.08);
		color: #ffd2d8;
		padding: 0.6rem 0.75rem;
		font-size: 0.66rem;
		line-height: 1.45;
	}
	.provenance {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		margin: 0.75rem 0 0;
		background: rgb(255 255 255 / 0.08);
	}
	.provenance div {
		min-width: 0;
		background: #101719;
		padding: 0.55rem 0.65rem;
	}
	.provenance dt {
		color: rgb(237 240 232 / 0.42);
		font-size: 0.55rem;
		text-transform: uppercase;
	}
	.provenance dd {
		margin: 0.18rem 0 0;
		color: #e9eadf;
		font-size: 0.63rem;
		overflow-wrap: anywhere;
	}
	.provenance code {
		font-size: 0.57rem;
	}
	.core-list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin: 0.65rem 0 0;
		padding: 0;
		list-style: none;
	}
	.core-list li {
		display: grid;
		gap: 0.1rem;
		border: 1px solid rgb(123 198 215 / 0.18);
		border-radius: 0.5rem;
		background: rgb(123 198 215 / 0.04);
		padding: 0.45rem 0.55rem;
	}
	.core-list b {
		color: #7bc6d7;
		font-size: 0.66rem;
	}
	.core-list span,
	.core-list small {
		color: rgb(237 240 232 / 0.55);
		font:
			0.56rem/1.35 ui-monospace,
			monospace;
	}
	.trace-card svg {
		display: block;
		width: 100%;
		height: auto;
		background:
			linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px), #0a1013;
		background-size: 28px 28px;
	}
	svg text {
		fill: rgb(237 240 232 / 0.58);
		font:
			8px ui-monospace,
			monospace;
	}
	.axis {
		stroke: rgb(237 240 232 / 0.28);
		stroke-width: 1;
	}
	.trace-line {
		stroke-width: 3;
		stroke-linecap: round;
	}
	.core-x,
	.core-y {
		fill: none;
		stroke-width: 2;
	}
	.core-x {
		stroke: #df4965;
	}
	.core-y {
		stroke: #7bc6d7;
	}
	.x-label {
		fill: #df4965;
	}
	.y-label {
		fill: #7bc6d7;
	}
	.rotation-bar {
		stroke: #f0b24b;
		stroke-width: 5;
		stroke-linecap: round;
	}
	.rotation-tick {
		stroke: #fff5df;
		stroke-width: 1.5;
	}
	.comparator-card img {
		display: block;
		width: 100%;
		aspect-ratio: 18 / 11;
		object-fit: cover;
	}
	.boundary-note {
		margin-top: 0.75rem;
		border-left: 3px solid rgb(240 178 75 / 0.65);
		background: rgb(240 178 75 / 0.045);
		padding: 0.6rem 0.7rem;
	}
	.boundary-note code {
		color: #ffdfa1;
		font-size: 0.61rem;
	}
	@media (max-width: 760px) {
		.field-proof > header,
		.field-grid,
		.trace-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.provenance,
		.core-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 460px) {
		.selected-evidence {
			display: grid;
			gap: 0.25rem;
		}
		.provenance,
		.core-list {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}
	}
	:global(html[data-motion='still']) .field-proof * {
		transition: none !important;
		animation: none !important;
	}
</style>
