<script lang="ts">
	import type { AcousticMetrics } from '$lib/visualizations/acoustic-wavefield';

	interface Props {
		metrics: AcousticMetrics | null;
		previousRir: Float32Array | null;
		reciprocityRho: number | null;
		capturing: boolean;
		onSelectModeHz?: (hz: number) => void;
	}

	let { metrics, previousRir, reciprocityRho, capturing, onSelectModeHz }: Props = $props();

	const W = 380;
	const H = 148;
	const PAD_L = 32;
	const PAD_R = 10;
	const PAD_T = 12;
	const PAD_B = 22;
	const PW = W - PAD_L - PAD_R;
	const PH = H - PAD_T - PAD_B;

	function downsamplePolyline(
		data: Float32Array,
		peakNorm: number,
		startX = PAD_L,
		width = PW,
		midY = PAD_T + PH * 0.5,
		halfH = PH * 0.46
	): string {
		const n = data.length;
		if (n === 0 || peakNorm <= 1e-12) return '';
		const bins = 180;
		const pts: string[] = [];
		for (let b = 0; b < bins; b++) {
			const i0 = Math.floor((b / bins) * n);
			const i1 = Math.max(i0 + 1, Math.floor(((b + 1) / bins) * n));
			let minV = 0;
			let maxV = 0;
			for (let i = i0; i < i1 && i < n; i++) {
				const v = data[i];
				if (v < minV) minV = v;
				if (v > maxV) maxV = v;
			}
			const x = startX + (b / (bins - 1)) * width;
			const yMax = midY - (maxV / peakNorm) * halfH;
			const yMin = midY - (minV / peakNorm) * halfH;
			pts.push(`${x.toFixed(1)},${yMax.toFixed(1)}`);
			if (Math.abs(yMin - yMax) > 0.4) {
				pts.push(`${x.toFixed(1)},${yMin.toFixed(1)}`);
			}
		}
		return pts.join(' ');
	}

	const rirView = $derived.by(() => {
		if (!metrics || metrics.rir.length === 0) return null;
		const n = metrics.rir.length;
		const peak = Math.max(metrics.peakAmplitude, 1e-6);
		let ghostPeak = peak;
		if (previousRir && previousRir.length > 0) {
			for (let i = 0; i < previousRir.length; i++) {
				const a = Math.abs(previousRir[i]);
				if (a > ghostPeak) ghostPeak = a;
			}
		}

		const directX = PAD_L + (metrics.directSampleIndex / Math.max(1, n - 1)) * PW;
		const earlyEndX = PAD_L + (metrics.earlyEndSampleIndex / Math.max(1, n - 1)) * PW;
		const livePoints = downsamplePolyline(metrics.rir, ghostPeak);
		const ghostPoints = previousRir ? downsamplePolyline(previousRir, ghostPeak) : '';
		return { directX, earlyEndX, livePoints, ghostPoints };
	});

	const schroederPoints = $derived.by(() => {
		if (!metrics || metrics.schroederDb.length === 0) return '';
		const db = metrics.schroederDb;
		const n = db.length;
		const steps = 150;
		const pts: string[] = [];
		for (let s = 0; s < steps; s++) {
			const idx = Math.min(n - 1, Math.round((s / (steps - 1)) * (n - 1)));
			const x = PAD_L + (s / (steps - 1)) * PW;
			const clamped = Math.max(-60, Math.min(0, db[idx]));
			const y = PAD_T + (-clamped / 60) * PH;
			pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		}
		return pts.join(' ');
	});

	const spectrumPoints = $derived.by(() => {
		if (!metrics || metrics.spectrumDb.length === 0) return '';
		const db = metrics.spectrumDb;
		const n = db.length;
		const steps = Math.min(n, 220);
		const pts: string[] = [];
		for (let s = 0; s < steps; s++) {
			const idx = Math.min(n - 1, Math.round((s / (steps - 1)) * (n - 1)));
			const x = PAD_L + (s / (steps - 1)) * PW;
			const clamped = Math.max(-45, Math.min(0, db[idx]));
			const y = PAD_T + (-clamped / 45) * PH;
			pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		}
		return pts.join(' ');
	});
</script>

<section
	class="awc-telemetry"
	data-testid="awc-telemetry"
	aria-label="Live acoustic telemetry ledger"
>
	<div class="awc-telemetry-head">
		<div>
			<h2 class="awc-section-title">Room Impulse Telemetry &amp; Decay Ledger</h2>
		</div>
		<div class="awc-kpi-strip">
			<span class="awc-kpi-pill" data-testid="awc-metric-t0">
				t₀ Direct: <strong>{metrics ? `${metrics.directArrivalMs.toFixed(1)} ms` : '—'}</strong>
			</span>
			<span class="awc-kpi-pill" data-testid="awc-metric-rt60">
				RT₆₀:
				<strong>
					{#if capturing}
						Computing…
					{:else if metrics === null}
						—
					{:else if metrics.rt60Ms !== null}
						{`${Math.round(metrics.rt60Ms)} ms (${metrics.rt60Method})`}
					{:else}
						Open / High Decay (&gt; window)
					{/if}
				</strong>
			</span>
			<span class="awc-kpi-pill" data-testid="awc-metric-c80">
				Clarity C₈₀:
				<strong>
					{metrics?.clarityC80Db !== null && metrics?.clarityC80Db !== undefined
						? `${metrics.clarityC80Db >= 0 ? '+' : ''}${metrics.clarityC80Db.toFixed(1)} dB`
						: '—'}
				</strong>
			</span>
			{#if reciprocityRho !== null}
				<span class="awc-kpi-pill" data-testid="awc-reciprocity-badge">
					Reciprocity ρ(S↔L): <strong>{reciprocityRho.toFixed(4)}</strong>
				</span>
			{/if}
		</div>
	</div>

	<div class="awc-plots-grid">
		<!-- 1. RIR Oscillogram -->
		<article class="awc-plot-card">
			<div class="awc-plot-title-row">
				<h3 class="awc-plot-title">Room Impulse Response h(t)</h3>
				<span class="awc-plot-meta">
					Direct · Early (80 ms) · Late
					{#if previousRir}
						· <span class="awc-ghost-chip" data-testid="awc-ghost-legend"
							>Coral dashed: Previous RIR (Ghost)</span
						>
					{/if}
				</span>
			</div>
			<svg
				class="awc-svg-plot"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Room Impulse Response waveform showing direct arrival, early reflections, and late reverberant tail"
			>
				{#if rirView}
					<!-- Direct + Early band -->
					<rect
						x={rirView.directX}
						y={PAD_T}
						width={Math.max(2, rirView.earlyEndX - rirView.directX)}
						height={PH}
						fill="var(--awc-cyan-bg)"
					/>
					<!-- Late tail band -->
					<rect
						x={rirView.earlyEndX}
						y={PAD_T}
						width={Math.max(0, PAD_L + PW - rirView.earlyEndX)}
						height={PH}
						fill="var(--awc-amber-bg)"
					/>
					<line
						x1={rirView.directX}
						y1={PAD_T}
						x2={rirView.directX}
						y2={PAD_T + PH}
						stroke="var(--awc-listener)"
						stroke-width="1.4"
					/>
				{/if}
				<line
					x1={PAD_L}
					y1={PAD_T + PH * 0.5}
					x2={PAD_L + PW}
					y2={PAD_T + PH * 0.5}
					stroke="var(--awc-border-strong)"
					stroke-width="1"
				/>
				{#if rirView?.ghostPoints}
					<polyline
						data-testid="awc-rir-ghost"
						fill="none"
						stroke="var(--awc-source)"
						stroke-width="1.35"
						stroke-dasharray="4 3"
						opacity="0.88"
						points={rirView.ghostPoints}
					/>
				{/if}
				{#if rirView?.livePoints}
					<polyline
						fill="none"
						stroke="var(--awc-cyan)"
						stroke-width="1.4"
						points={rirView.livePoints}
					/>
				{/if}
				<text x={PAD_L} y={H - 6} fill="var(--awc-ink-soft)" font-size="9" font-family="monospace"
					>0 ms</text
				>
				<text
					x={PAD_L + PW}
					y={H - 6}
					text-anchor="end"
					fill="var(--awc-ink-soft)"
					font-size="9"
					font-family="monospace">1200 ms</text
				>
			</svg>
		</article>

		<!-- 2. Schroeder Decay Curve -->
		<article class="awc-plot-card">
			<div class="awc-plot-title-row">
				<h3 class="awc-plot-title">Schroeder Decay L(t)</h3>
				<span class="awc-plot-meta">0 to −60 dB</span>
			</div>
			<svg
				class="awc-svg-plot"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Schroeder backward-integrated energy decay curve in decibels"
			>
				{#each [0, -20, -40, -60] as tick (tick)}
					{@const y = PAD_T + (-tick / 60) * PH}
					<line
						x1={PAD_L}
						y1={y}
						x2={PAD_L + PW}
						y2={y}
						stroke="var(--awc-border)"
						stroke-width="1"
					/>
					<text
						x={PAD_L - 4}
						y={y + 3}
						text-anchor="end"
						fill="var(--awc-ink-soft)"
						font-size="8.5"
						font-family="monospace">{tick}</text
					>
				{/each}
				{#if schroederPoints}
					<polyline
						fill="none"
						stroke="var(--awc-amber)"
						stroke-width="2"
						points={schroederPoints}
					/>
				{/if}
				<text x={PAD_L} y={H - 6} fill="var(--awc-ink-soft)" font-size="9" font-family="monospace"
					>0 ms</text
				>
				<text
					x={PAD_L + PW}
					y={H - 6}
					text-anchor="end"
					fill="var(--awc-ink-soft)"
					font-size="9"
					font-family="monospace">1200 ms</text
				>
			</svg>
		</article>

		<!-- 3. Eigenmode FFT Spectrum -->
		<article class="awc-plot-card">
			<div class="awc-plot-title-row">
				<h3 class="awc-plot-title">Eigenmode Spectrum</h3>
				<span class="awc-plot-meta">40 – 1,100 Hz</span>
			</div>
			<svg
				class="awc-svg-plot"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Eigenmode frequency magnitude spectrum from 40 Hz to 1100 Hz"
			>
				{#each [0, -15, -30, -45] as tick (tick)}
					{@const y = PAD_T + (-tick / 45) * PH}
					<line
						x1={PAD_L}
						y1={y}
						x2={PAD_L + PW}
						y2={y}
						stroke="var(--awc-border)"
						stroke-width="1"
					/>
					<text
						x={PAD_L - 4}
						y={y + 3}
						text-anchor="end"
						fill="var(--awc-ink-soft)"
						font-size="8.5"
						font-family="monospace">{tick}</text
					>
				{/each}
				{#if spectrumPoints}
					<polyline
						fill="none"
						stroke="var(--awc-listener)"
						stroke-width="1.6"
						points={spectrumPoints}
					/>
				{/if}
				<text x={PAD_L} y={H - 6} fill="var(--awc-ink-soft)" font-size="9" font-family="monospace"
					>40 Hz</text
				>
				<text
					x={PAD_L + PW}
					y={H - 6}
					text-anchor="end"
					fill="var(--awc-ink-soft)"
					font-size="9"
					font-family="monospace">1100 Hz</text
				>
			</svg>
			{#if metrics && metrics.peakModes.length > 0}
				<div class="awc-mode-chips" aria-label="Detected resonant modes">
					{#each metrics.peakModes as mode (mode.freqHz)}
						<button
							type="button"
							class="awc-btn awc-btn-xs awc-mono"
							onclick={() => onSelectModeHz?.(Math.round(mode.freqHz))}
							title={`Tune continuous tone to ${Math.round(mode.freqHz)} Hz mode`}
						>
							{Math.round(mode.freqHz)} Hz
						</button>
					{/each}
				</div>
			{/if}
		</article>
	</div>
</section>
