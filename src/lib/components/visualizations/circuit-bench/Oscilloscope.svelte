<script lang="ts">
	import {
		describeScopeChannel,
		getScopeChannelUnit
	} from '$lib/visualizations/circuit-bench/model';
	import { formatMeasurement } from '$lib/visualizations/circuit-bench/notation';
	import type {
		CircuitDocument,
		ScopeChannelTarget,
		ScopeSample,
		TraceMarker
	} from '$lib/visualizations/circuit-bench/types';

	interface Props {
		doc: CircuitDocument;
		samples: ScopeSample[];
		markers: TraceMarker[];
		running: boolean;
		ontoggleRun: () => void;
		onupdateChannel: (channel: 'channel1' | 'channel2', target: ScopeChannelTarget) => void;
		onupdateTimeSpan: (spanSec: number) => void;
		ontoggleScaleMode: () => void;
		onexportCsv: () => void;
	}

	let {
		doc,
		samples,
		markers,
		running,
		ontoggleRun,
		onupdateChannel,
		onupdateTimeSpan,
		ontoggleScaleMode,
		onexportCsv
	}: Props = $props();

	let cursorIndex = $state<number | null>(null);

	const timeSpan = $derived(doc.scope.timeSpanSec);
	const latestTime = $derived(samples.length > 0 ? samples[samples.length - 1].timeSec : 0);
	const windowStart = $derived(Math.max(0, latestTime - timeSpan));
	const windowEnd = $derived(Math.max(timeSpan, windowStart + timeSpan));

	const visibleSamples = $derived(
		samples.filter((s) => s.timeSec >= windowStart - 1e-9 && s.timeSec <= windowEnd + 1e-9)
	);

	const activeSampleIndex = $derived(
		cursorIndex !== null && cursorIndex >= 0 && cursorIndex < visibleSamples.length
			? cursorIndex
			: visibleSamples.length > 0
				? visibleSamples.length - 1
				: -1
	);

	const inspectedSample = $derived(
		activeSampleIndex >= 0 ? visibleSamples[activeSampleIndex] : null
	);

	const ch1Label = $derived(describeScopeChannel(doc, doc.scope.channel1));
	const ch2Label = $derived(describeScopeChannel(doc, doc.scope.channel2));
	const ch1Unit = $derived(getScopeChannelUnit(doc.scope.channel1));
	const ch2Unit = $derived(getScopeChannelUnit(doc.scope.channel2));

	// Compute vertical ranges (Auto vs Fixed)
	const ch1Range = $derived.by((): [number, number] => {
		if (doc.scope.verticalScaleMode === 'fixed') {
			return doc.scope.channel1Range;
		}
		const vals = visibleSamples
			.map((s) => s.ch1)
			.filter((v): v is number => v !== null && Number.isFinite(v));
		if (vals.length === 0) return doc.scope.channel1Range;
		const min = Math.min(0, ...vals);
		const max = Math.max(...vals, 1e-6);
		const pad = Math.max(1e-4, (max - min) * 0.12);
		return [min - (min < 0 ? pad : 0), max + pad];
	});

	const ch2Range = $derived.by((): [number, number] => {
		if (doc.scope.verticalScaleMode === 'fixed') {
			return doc.scope.channel2Range;
		}
		const vals = visibleSamples
			.map((s) => s.ch2)
			.filter((v): v is number => v !== null && Number.isFinite(v));
		if (vals.length === 0) return doc.scope.channel2Range;
		const min = Math.min(0, ...vals);
		const max = Math.max(...vals, 1e-6);
		const pad = Math.max(1e-5, (max - min) * 0.12);
		return [min - (min < 0 ? pad : 0), max + pad];
	});

	// SVG geometry: two aligned lanes sharing x from 68 to 880
	const plotLeft = 68;
	const plotRight = 880;
	const plotWidth = plotRight - plotLeft;
	const lane1Top = 16;
	const lane1Bottom = 94;
	const lane1Height = lane1Bottom - lane1Top;
	const lane2Top = 116;
	const lane2Bottom = 194;
	const lane2Height = lane2Bottom - lane2Top;

	function timeToX(t: number): number {
		const ratio = (t - windowStart) / Math.max(1e-9, windowEnd - windowStart);
		return plotLeft + Math.min(1, Math.max(0, ratio)) * plotWidth;
	}

	function valToY1(v: number): number {
		const [min, max] = ch1Range;
		const ratio = (v - min) / Math.max(1e-12, max - min);
		return lane1Bottom - Math.min(1, Math.max(0, ratio)) * lane1Height;
	}

	function valToY2(v: number): number {
		const [min, max] = ch2Range;
		const ratio = (v - min) / Math.max(1e-12, max - min);
		return lane2Bottom - Math.min(1, Math.max(0, ratio)) * lane2Height;
	}

	const ch1Path = $derived.by(() => {
		if (doc.scope.channel1.kind === 'none' || visibleSamples.length === 0) return '';
		const pts: string[] = [];
		for (const s of visibleSamples) {
			if (s.ch1 === null || !Number.isFinite(s.ch1)) continue;
			pts.push(
				`${pts.length === 0 ? 'M' : 'L'}${timeToX(s.timeSec).toFixed(1)},${valToY1(s.ch1).toFixed(1)}`
			);
		}
		return pts.join(' ');
	});

	const ch2Path = $derived.by(() => {
		if (doc.scope.channel2.kind === 'none' || visibleSamples.length === 0) return '';
		const pts: string[] = [];
		for (const s of visibleSamples) {
			if (s.ch2 === null || !Number.isFinite(s.ch2)) continue;
			pts.push(
				`${pts.length === 0 ? 'M' : 'L'}${timeToX(s.timeSec).toFixed(1)},${valToY2(s.ch2).toFixed(1)}`
			);
		}
		return pts.join(' ');
	});

	const visibleMarkers = $derived(
		markers.filter((m) => m.timeSec >= windowStart - 1e-9 && m.timeSec <= windowEnd + 1e-9)
	);

	// Build available probe options from current circuit components
	const probeOptions = $derived.by(() => {
		const opts: Array<{ value: string; label: string; target: ScopeChannelTarget }> = [
			{ value: 'none', label: 'Off (No trace)', target: { kind: 'none' } }
		];
		for (const comp of doc.components) {
			if (comp.kind === 'ground') continue;
			if (comp.kind === 'probe_voltage') {
				opts.push({
					value: `probe_voltage:${comp.id}`,
					label: `Probe ${comp.label} (V)`,
					target: { kind: 'probe_voltage', componentId: comp.id, label: `Probe ${comp.label}` }
				});
				continue;
			}
			opts.push({
				value: `component_voltage:${comp.id}`,
				label: `V(${comp.label}) · Voltage across ${comp.label}`,
				target: { kind: 'component_voltage', componentId: comp.id, label: `V(${comp.label})` }
			});
			opts.push({
				value: `component_current:${comp.id}`,
				label: `I(${comp.label}) · Current through ${comp.label}`,
				target: { kind: 'component_current', componentId: comp.id, label: `I(${comp.label})` }
			});
		}
		return opts;
	});

	function targetToOptionValue(target: ScopeChannelTarget): string {
		if (target.kind === 'none') return 'none';
		if (target.kind === 'node_voltage') return `component_voltage:${target.componentId}`;
		return `${target.kind}:${target.componentId}`;
	}

	function handleChannelSelect(channel: 'channel1' | 'channel2', val: string): void {
		const found = probeOptions.find((o) => o.value === val);
		if (found) {
			onupdateChannel(channel, found.target);
		}
	}

	function handleScopeSvgClick(event: MouseEvent): void {
		if (visibleSamples.length === 0) return;
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const relX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 900;
		const ratio = Math.min(1, Math.max(0, (relX - plotLeft) / plotWidth));
		const clickedTime = windowStart + ratio * (windowEnd - windowStart);
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < visibleSamples.length; i += 1) {
			const dist = Math.abs(visibleSamples[i].timeSec - clickedTime);
			if (dist < bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}
		cursorIndex = bestIdx;
	}

	/**
	 * Format oscilloscope time-axis tick labels with sufficient precision for the active span
	 * so adjacent ticks never round to duplicate strings at short time spans.
	 */
	function formatScopeTimeTick(tVal: number, startSec: number, endSec: number): string {
		const spanSec = Math.max(1e-9, endSec - startSec);
		const stepSec = spanSec / 5;
		const maxEdge = Math.max(Math.abs(startSec), Math.abs(endSec));

		let scale = 1;
		let suffix = 's';
		if (maxEdge < 1e-3) {
			scale = 1e6;
			suffix = 'µs';
		} else if (maxEdge < 0.1 || (spanSec < 0.1 && maxEdge < 1)) {
			scale = 1e3;
			suffix = 'ms';
		}

		const stepInUnit = stepSec * scale;
		let decimals = suffix === 's' ? 2 : 1;
		if (stepInUnit < 1) {
			const k = Math.ceil(-Math.log10(stepInUnit) - 1e-9);
			const leading = stepInUnit * Math.pow(10, k);
			decimals = Math.min(6, Math.max(decimals, k + (leading < 1.999 ? 1 : 0)));
		} else if (Math.abs(stepInUnit - Math.round(stepInUnit)) > 1e-6) {
			decimals = Math.max(decimals, 2);
		}

		const scaled = tVal * scale;
		const sign = scaled < -1e-12 ? '−' : '';
		return `${sign}${Math.abs(scaled).toFixed(decimals)} ${suffix}`;
	}
</script>

<section class="cb-scope-panel" aria-label="Two-channel oscilloscope">
	<div class="cb-scope-toolbar">
		<div class="cb-toolbar-group">
			<span
				style="font-weight:700;font-size:11.5px;letter-spacing:0.05em;text-transform:uppercase;color:var(--cb-muted);padding-right:4px;"
			>
				Oscilloscope
			</span>

			<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;">
				<span style="color:#EF762F;font-weight:700;">CH1:</span>
				<select
					class="cb-select"
					aria-label="Oscilloscope Channel 1 probe"
					value={targetToOptionValue(doc.scope.channel1)}
					onchange={(e) =>
						handleChannelSelect('channel1', (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each probeOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;">
				<span style="color:#9EC985;font-weight:700;">CH2:</span>
				<select
					class="cb-select"
					aria-label="Oscilloscope Channel 2 probe"
					value={targetToOptionValue(doc.scope.channel2)}
					onchange={(e) =>
						handleChannelSelect('channel2', (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each probeOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="cb-toolbar-group">
			<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;">
				<span style="color:var(--cb-muted);">Time span:</span>
				<select
					class="cb-select"
					aria-label="Oscilloscope visible time span"
					value={String(doc.scope.timeSpanSec)}
					onchange={(e) => onupdateTimeSpan(Number((e.currentTarget as HTMLSelectElement).value))}
				>
					<option value="0.01">10 ms</option>
					<option value="0.03">30 ms</option>
					<option value="0.04">40 ms</option>
					<option value="0.1">100 ms</option>
					<option value="1">1 s</option>
					<option value="2">2 s</option>
					<option value="5">5 s</option>
					<option value="6">6 s</option>
					<option value="10">10 s</option>
					<option value="20">20 s</option>
				</select>
			</label>

			<button
				type="button"
				class="cb-btn cb-btn-compact"
				onclick={ontoggleScaleMode}
				aria-label={`Vertical scale mode: ${doc.scope.verticalScaleMode === 'fixed' ? 'Fixed scale' : 'Auto scale'}`}
				title="Switch between fixed vertical scale and automatic vertical rescaling"
			>
				Scale: {doc.scope.verticalScaleMode === 'fixed' ? 'Fixed' : 'Auto'}
			</button>

			<button
				type="button"
				class="cb-btn cb-btn-compact"
				onclick={ontoggleRun}
				aria-label={running
					? 'Pause oscilloscope and simulation'
					: 'Run simulation from oscilloscope'}
			>
				{running ? 'Pause' : 'Run'}
			</button>

			<button
				type="button"
				class="cb-btn cb-btn-compact"
				onclick={onexportCsv}
				disabled={samples.length === 0}
				aria-label="Export recorded oscilloscope samples as CSV"
			>
				Export CSV
			</button>
		</div>
	</div>

	<div class="cb-scope-display">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<svg
			class="cb-scope-svg"
			viewBox="0 0 900 218"
			role="img"
			aria-label={`Oscilloscope traces for ${ch1Label} and ${ch2Label} over ${formatMeasurement(timeSpan, 's')}`}
			onclick={handleScopeSvgClick}
		>
			<!-- Lane 1 background & grid (Channel 1) -->
			<rect
				x={plotLeft}
				y={lane1Top}
				width={plotWidth}
				height={lane1Height}
				fill="#080B0E"
				stroke="#252C33"
				stroke-width="1"
			/>
			<!-- Lane 2 background & grid (Channel 2) -->
			<rect
				x={plotLeft}
				y={lane2Top}
				width={plotWidth}
				height={lane2Height}
				fill="#080B0E"
				stroke="#252C33"
				stroke-width="1"
			/>

			<!-- Vertical time grid lines -->
			{#each [0, 0.2, 0.4, 0.6, 0.8, 1] as frac (frac)}
				{@const gx = plotLeft + frac * plotWidth}
				{@const tVal = windowStart + frac * (windowEnd - windowStart)}
				<line x1={gx} y1={lane1Top} x2={gx} y2={lane1Bottom} stroke="#171E24" stroke-width="1" />
				<line x1={gx} y1={lane2Top} x2={gx} y2={lane2Bottom} stroke="#171E24" stroke-width="1" />
				<text
					x={gx}
					y="212"
					text-anchor={frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle'}
					fill="#B8BFC5"
					font-family="IBM Plex Mono, monospace"
					font-size="10.5"
				>
					{formatScopeTimeTick(tVal, windowStart, windowEnd)}
				</text>
			{/each}

			<!-- Horizontal midlines -->
			<line
				x1={plotLeft}
				y1={(lane1Top + lane1Bottom) / 2}
				x2={plotRight}
				y2={(lane1Top + lane1Bottom) / 2}
				stroke="#171E24"
				stroke-dasharray="3 3"
			/>
			<line
				x1={plotLeft}
				y1={(lane2Top + lane2Bottom) / 2}
				x2={plotRight}
				y2={(lane2Top + lane2Bottom) / 2}
				stroke="#171E24"
				stroke-dasharray="3 3"
			/>

			<!-- Lane 1 Y-axis labels -->
			<text
				x={plotLeft - 6}
				y={lane1Top + 9}
				text-anchor="end"
				fill="#EF762F"
				font-family="IBM Plex Mono, monospace"
				font-size="10"
			>
				{formatMeasurement(ch1Range[1], ch1Unit)}
			</text>
			<text
				x={plotLeft - 6}
				y={lane1Bottom - 2}
				text-anchor="end"
				fill="#EF762F"
				font-family="IBM Plex Mono, monospace"
				font-size="10"
			>
				{formatMeasurement(ch1Range[0], ch1Unit)}
			</text>
			<text
				x={plotLeft + 8}
				y={lane1Top + 14}
				fill="#EF762F"
				font-family="IBM Plex Mono, monospace"
				font-size="11"
				font-weight="600"
			>
				CH1 · {ch1Label} ({ch1Unit})
			</text>

			<!-- Lane 2 Y-axis labels -->
			<text
				x={plotLeft - 6}
				y={lane2Top + 9}
				text-anchor="end"
				fill="#9EC985"
				font-family="IBM Plex Mono, monospace"
				font-size="10"
			>
				{formatMeasurement(ch2Range[1], ch2Unit)}
			</text>
			<text
				x={plotLeft - 6}
				y={lane2Bottom - 2}
				text-anchor="end"
				fill="#9EC985"
				font-family="IBM Plex Mono, monospace"
				font-size="10"
			>
				{formatMeasurement(ch2Range[0], ch2Unit)}
			</text>
			<text
				x={plotLeft + 8}
				y={lane2Top + 14}
				fill="#9EC985"
				font-family="IBM Plex Mono, monospace"
				font-size="11"
				font-weight="600"
			>
				CH2 · {ch2Label} ({ch2Unit})
			</text>

			<!-- Channel 1 waveform (solid orange) -->
			{#if ch1Path}
				<path
					d={ch1Path}
					fill="none"
					stroke="#EF762F"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			<!-- Channel 2 waveform (dashed green so traces are distinguishable without colour alone) -->
			{#if ch2Path}
				<path
					d={ch2Path}
					fill="none"
					stroke="#9EC985"
					stroke-width="2.2"
					stroke-dasharray="6 3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			<!-- Value-change event markers on the trace -->
			{#each visibleMarkers as marker (marker.id)}
				{@const mx = timeToX(marker.timeSec)}
				<line
					x1={mx}
					y1={lane1Top}
					x2={mx}
					y2={lane2Bottom}
					stroke="#F1EEE7"
					stroke-width="1.2"
					stroke-dasharray="2 3"
					opacity="0.8"
				/>
				<text
					x={Math.min(plotRight - 4, mx + 4)}
					y={lane1Bottom - 6}
					fill="#F1EEE7"
					font-family="IBM Plex Mono, monospace"
					font-size="9.5"
				>
					▲ {marker.label}
				</text>
			{/each}

			<!-- Inspection Cursor -->
			{#if inspectedSample}
				{@const cx = timeToX(inspectedSample.timeSec)}
				<line
					x1={cx}
					y1={lane1Top}
					x2={cx}
					y2={lane2Bottom}
					stroke="#F1EEE7"
					stroke-width="1.4"
					opacity="0.9"
				/>
				{#if inspectedSample.ch1 !== null && Number.isFinite(inspectedSample.ch1)}
					<circle
						{cx}
						cy={valToY1(inspectedSample.ch1)}
						r="4"
						fill="#EF762F"
						stroke="#0B0F12"
						stroke-width="1.5"
					/>
				{/if}
				{#if inspectedSample.ch2 !== null && Number.isFinite(inspectedSample.ch2)}
					<circle
						{cx}
						cy={valToY2(inspectedSample.ch2)}
						r="4"
						fill="#9EC985"
						stroke="#0B0F12"
						stroke-width="1.5"
					/>
				{/if}
			{/if}
		</svg>
	</div>

	<!-- Numerical Probe Readouts Outside Graph (Keyboard & Screen-Reader Accessible) -->
	<div
		class="cb-scope-readout-bar"
		role="region"
		aria-label="Oscilloscope numerical probe readings"
	>
		<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
			<span>
				<strong style="color:var(--cb-muted);">Cursor time:</strong>
				{inspectedSample ? formatMeasurement(inspectedSample.timeSec, 's') : '0.00 s'}
			</span>
			<span>
				<strong style="color:#EF762F;">CH1 ({ch1Label}):</strong>
				{inspectedSample && inspectedSample.ch1 !== null
					? formatMeasurement(inspectedSample.ch1, ch1Unit)
					: '—'}
			</span>
			<span>
				<strong style="color:#9EC985;">CH2 ({ch2Label}):</strong>
				{inspectedSample && inspectedSample.ch2 !== null
					? formatMeasurement(inspectedSample.ch2, ch2Unit)
					: '—'}
			</span>
			<span style="color:var(--cb-muted);">
				Vertical scale: <strong
					>{doc.scope.verticalScaleMode === 'fixed' ? 'Fixed' : 'Automatic'}</strong
				>
			</span>
		</div>

		<div class="cb-scrubber-wrap">
			<label for="cb-scope-scrubber" style="color:var(--cb-muted);font-size:11.5px;">
				Inspect time:
			</label>
			<input
				id="cb-scope-scrubber"
				type="range"
				min="0"
				max={Math.max(0, visibleSamples.length - 1)}
				value={activeSampleIndex >= 0 ? activeSampleIndex : 0}
				disabled={visibleSamples.length <= 1}
				aria-label="Inspect oscilloscope sample at specific time"
				oninput={(e) => {
					cursorIndex = Number((e.currentTarget as HTMLInputElement).value);
				}}
			/>
			{#if cursorIndex !== null}
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={() => {
						cursorIndex = null;
					}}
				>
					Follow live
				</button>
			{/if}
		</div>
	</div>
</section>
