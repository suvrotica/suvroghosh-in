<script lang="ts">
	import type { RecorderBookmark, SilenceInterval } from '$lib/recorder/types';

	export let peaks: number[] = [];
	export let rms: number[] = [];
	export let durationSec = 0;
	export let playheadSec = 0;
	export let trimStartSec = 0;
	export let trimEndSec = 0;
	export let selectionStartSec: number | null = null;
	export let selectionEndSec: number | null = null;
	export let bookmarks: RecorderBookmark[] = [];
	export let silenceIntervals: SilenceInterval[] = [];
	export let showSilencePreview = false;
	export let isRecording = false;
	export let isEnhanced = false;
	export let interactive = true;
	export let zoom = 1;
	export let scrollOffsetRatio = 0; // 0..1

	export let onSeek: ((sec: number) => void) | undefined = undefined;
	export let onTrimChange: ((startSec: number, endSec: number) => void) | undefined = undefined;
	export let onSelectionChange:
		| ((startSec: number | null, endSec: number | null) => void)
		| undefined = undefined;

	let containerEl: HTMLDivElement | null = null;
	let activeDrag: 'playhead' | 'trim-start' | 'trim-end' | 'selection' | null = null;
	let selectionAnchorSec = 0;

	$: safeDuration = Math.max(0.01, durationSec);
	$: visibleWindowRatio = 1 / Math.max(1, zoom);
	$: clampedScrollRatio = Math.max(0, Math.min(1 - visibleWindowRatio, scrollOffsetRatio));
	$: viewStartSec = clampedScrollRatio * safeDuration;
	$: viewEndSec = (clampedScrollRatio + visibleWindowRatio) * safeDuration;
	$: viewSpanSec = Math.max(0.01, viewEndSec - viewStartSec);

	function secToPercent(sec: number): number {
		return Math.max(-5, Math.min(105, ((sec - viewStartSec) / viewSpanSec) * 100));
	}

	function clientXToSec(clientX: number): number {
		if (!containerEl) return 0;
		const rect = containerEl.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
		return Number(Math.max(0, Math.min(safeDuration, viewStartSec + ratio * viewSpanSec)).toFixed(3));
	}

	// Slice peaks & rms to visible zoom window
	$: visibleBars = (() => {
		const total = peaks.length;
		if (total === 0) {
			return Array.from({ length: 96 }, (_, idx) => ({
				idx,
				peak: 0,
				rmsVal: 0,
				sec: 0,
				inTrim: true
			}));
		}
		const targetCount = 120;
		const bars: { idx: number; peak: number; rmsVal: number; sec: number; inTrim: boolean }[] = [];
		for (let i = 0; i < targetCount; i++) {
			const frac = (i + 0.5) / targetCount;
			const sec = viewStartSec + frac * viewSpanSec;
			const globalRatio = Math.max(0, Math.min(0.9999, sec / safeDuration));
			const srcIdx = Math.floor(globalRatio * total);
			const peak = peaks[srcIdx] ?? 0;
			const rmsVal = rms[srcIdx] ?? peak * 0.6;
			const effectiveTrimEnd = trimEndSec > 0 ? trimEndSec : safeDuration;
			const inTrim = isRecording || (sec >= trimStartSec && sec <= effectiveTrimEnd);
			bars.push({ idx: i, peak, rmsVal, sec, inTrim });
		}
		return bars;
	})();

	function startHandleDrag(kind: 'trim-start' | 'trim-end', event: PointerEvent) {
		if (!interactive || isRecording) return;
		event.stopPropagation();
		activeDrag = kind;
		containerEl?.setPointerCapture(event.pointerId);
	}

	function handleSurfacePointerDown(event: PointerEvent) {
		if (!interactive || isRecording || durationSec <= 0) return;
		const clickedSec = clientXToSec(event.clientX);
		containerEl?.setPointerCapture(event.pointerId);

		if (event.shiftKey) {
			activeDrag = 'selection';
			selectionAnchorSec = clickedSec;
			onSelectionChange?.(clickedSec, clickedSec);
		} else {
			activeDrag = 'playhead';
			onSeek?.(clickedSec);
		}
	}

	function handleSurfacePointerMove(event: PointerEvent) {
		if (!activeDrag || !interactive) return;
		const sec = clientXToSec(event.clientX);
		const effectiveEnd = trimEndSec > 0 ? trimEndSec : safeDuration;

		if (activeDrag === 'playhead') {
			onSeek?.(sec);
		} else if (activeDrag === 'trim-start') {
			const nextStart = Math.max(0, Math.min(sec, effectiveEnd - 0.05));
			onTrimChange?.(Number(nextStart.toFixed(2)), effectiveEnd);
		} else if (activeDrag === 'trim-end') {
			const nextEnd = Math.max(trimStartSec + 0.05, Math.min(sec, safeDuration));
			onTrimChange?.(trimStartSec, Number(nextEnd.toFixed(2)));
		} else if (activeDrag === 'selection') {
			const s = Math.min(selectionAnchorSec, sec);
			const e = Math.max(selectionAnchorSec, sec);
			if (e - s >= 0.04) {
				onSelectionChange?.(Number(s.toFixed(2)), Number(e.toFixed(2)));
			}
		}
	}

	function handleSurfacePointerUp(event: PointerEvent) {
		if (!activeDrag) return;
		activeDrag = null;
		if (containerEl?.hasPointerCapture(event.pointerId)) {
			containerEl.releasePointerCapture(event.pointerId);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!interactive || isRecording || durationSec <= 0) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			onSeek?.(Math.max(0, Number((playheadSec - 0.5).toFixed(2))));
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			onSeek?.(Math.min(safeDuration, Number((playheadSec + 0.5).toFixed(2))));
		} else if (event.key === 'Home') {
			event.preventDefault();
			onSeek?.(trimStartSec);
		} else if (event.key === 'End') {
			event.preventDefault();
			onSeek?.(trimEndSec > 0 ? trimEndSec : safeDuration);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div
	bind:this={containerEl}
	class="waveform-screen"
	class:is-recording={isRecording}
	class:is-enhanced={isEnhanced}
	role="region"
	aria-label="Audio waveform display"
	tabindex={interactive && !isRecording ? 0 : -1}
	on:pointerdown={handleSurfacePointerDown}
	on:pointermove={handleSurfacePointerMove}
	on:pointerup={handleSurfacePointerUp}
	on:pointercancel={handleSurfacePointerUp}
	on:keydown={handleKeyDown}
>
	<!-- Reference dB grid lines inspired by hardware reference 1 -->
	<div class="db-grid" aria-hidden="true">
		<div class="db-line db-line-top"><span>0 dB</span></div>
		<div class="db-line db-line-mid"><span>-12 dB</span></div>
		<div class="db-line db-line-center"><span>-40 dB</span></div>
		<div class="db-line db-line-mid-bottom"><span>-12 dB</span></div>
		<div class="db-line db-line-bottom"><span>0 dB</span></div>
	</div>

	<!-- Silence shortening preview overlays -->
	{#if showSilencePreview && silenceIntervals.length > 0 && durationSec > 0}
		{#each silenceIntervals as interval (`${interval.startSec}-${interval.endSec}`)}
			{@const leftPct = Math.max(0, secToPercent(interval.startSec))}
			{@const rightPct = Math.min(100, secToPercent(interval.endSec))}
			{#if rightPct > leftPct}
				<div
					class="silence-preview-band"
					style="left: {leftPct}%; width: {rightPct - leftPct}%;"
					title="Detected pause ({interval.originalDurationSec}s → {interval.shortenedDurationSec}s)"
				>
					<span class="silence-tag">Pause</span>
				</div>
			{/if}
		{/each}
	{/if}

	<!-- Active selection region -->
	{#if selectionStartSec !== null && selectionEndSec !== null && selectionEndSec > selectionStartSec && durationSec > 0}
		{@const selLeft = Math.max(0, secToPercent(selectionStartSec))}
		{@const selRight = Math.min(100, secToPercent(selectionEndSec))}
		{#if selRight > selLeft}
			<div
				class="selection-band"
				style="left: {selLeft}%; width: {selRight - selLeft}%;"
				aria-label="Selected region {selectionStartSec.toFixed(2)}s to {selectionEndSec.toFixed(2)}s"
			></div>
		{/if}
	{/if}

	<!-- Trimmed-out left/right masks -->
	{#if !isRecording && durationSec > 0}
		{@const trimLeftPct = Math.max(0, Math.min(100, secToPercent(trimStartSec)))}
		{@const effectiveEnd = trimEndSec > 0 ? trimEndSec : durationSec}
		{@const trimRightPct = Math.max(0, Math.min(100, secToPercent(effectiveEnd)))}

		{#if trimLeftPct > 0}
			<div class="trimmed-mask trimmed-mask-left" style="width: {trimLeftPct}%;"></div>
		{/if}
		{#if trimRightPct < 100}
			<div class="trimmed-mask trimmed-mask-right" style="left: {trimRightPct}%; width: {100 - trimRightPct}%;"></div>
		{/if}
	{/if}

	<!-- SVG Symmetric Hardware Waveform -->
	<svg
		class="waveform-svg"
		viewBox="0 0 480 160"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<!-- Center zero baseline -->
		<line x1="0" y1="80" x2="480" y2="80" class="zero-axis" />

		{#each visibleBars as bar (bar.idx)}
			{@const x = bar.idx * 4 + 1.5}
			{@const peakH = Math.max(1.5, Math.min(74, bar.peak * 74))}
			{@const rmsH = Math.max(1, Math.min(peakH, bar.rmsVal * 74))}
			<rect
				x={x - 1}
				y={80 - peakH}
				width="2.2"
				height={peakH * 2}
				rx="1"
				class="wave-bar-peak"
				class:is-outside-trim={!bar.inTrim}
				class:is-recording={isRecording}
				class:is-enhanced={isEnhanced && bar.inTrim}
			/>
			<rect
				x={x - 1}
				y={80 - rmsH}
				width="2.2"
				height={rmsH * 2}
				rx="1"
				class="wave-bar-rms"
				class:is-outside-trim={!bar.inTrim}
				class:is-recording={isRecording}
				class:is-enhanced={isEnhanced && bar.inTrim}
			/>
		{/each}
	</svg>

	<!-- Bookmark markers -->
	{#if durationSec > 0 && bookmarks.length > 0}
		<div class="bookmarks-layer">
			{#each bookmarks as bm (bm.id)}
				{@const bmPct = secToPercent(bm.timeSec)}
				{#if bmPct >= 0 && bmPct <= 100}
					<button
						type="button"
						class="bookmark-pin"
						style="left: {bmPct}%;"
						title="{bm.label} ({bm.timeSec.toFixed(1)}s)"
						on:pointerdown|stopPropagation={() => onSeek?.(bm.timeSec)}
					>
						<span>{bm.label}</span>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Draggable Trim Start / End Handles -->
	{#if interactive && !isRecording && durationSec > 0 && onTrimChange}
		{@const startPct = Math.max(0, Math.min(100, secToPercent(trimStartSec)))}
		{@const effectiveEnd = trimEndSec > 0 ? trimEndSec : durationSec}
		{@const endPct = Math.max(0, Math.min(100, secToPercent(effectiveEnd)))}

		<div
			class="trim-handle trim-handle-start"
			style="left: {startPct}%;"
			role="slider"
			tabindex="0"
			aria-label="Trim start handle"
			aria-valuemin={0}
			aria-valuemax={effectiveEnd}
			aria-valuenow={trimStartSec}
			on:pointerdown={(e) => startHandleDrag('trim-start', e)}
		>
			<span class="handle-grip" aria-hidden="true">IN</span>
		</div>

		<div
			class="trim-handle trim-handle-end"
			style="left: {endPct}%;"
			role="slider"
			tabindex="0"
			aria-label="Trim end handle"
			aria-valuemin={trimStartSec}
			aria-valuemax={durationSec}
			aria-valuenow={effectiveEnd}
			on:pointerdown={(e) => startHandleDrag('trim-end', e)}
		>
			<span class="handle-grip" aria-hidden="true">OUT</span>
		</div>
	{/if}

	<!-- Playhead Cursor -->
	{#if !isRecording && durationSec > 0}
		{@const playPct = secToPercent(playheadSec)}
		{#if playPct >= 0 && playPct <= 100}
			<div class="playhead-line" style="left: {playPct}%;" aria-hidden="true">
				<div class="playhead-cap"></div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.waveform-screen {
		position: relative;
		width: 100%;
		height: 186px;
		background:
			radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.03), transparent 70%),
			#0b0d0f;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		box-shadow:
			inset 0 3px 10px rgba(0, 0, 0, 0.85),
			0 1px 0 rgba(255, 255, 255, 0.06);
		overflow: hidden;
		user-select: none;
		touch-action: none;
		cursor: pointer;
	}

	.waveform-screen:focus-visible {
		outline: 2px solid #f26b21;
		outline-offset: 2px;
	}

	.db-grid {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px 10px;
		pointer-events: none;
		z-index: 1;
	}

	.db-line {
		border-bottom: 1px dashed rgba(255, 255, 255, 0.07);
		display: flex;
		justify-content: flex-end;
	}

	.db-line span {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.64rem;
		color: rgba(243, 239, 230, 0.42);
		transform: translateY(-50%);
		background: rgba(11, 13, 15, 0.75);
		padding: 0 4px;
	}

	.waveform-svg {
		position: relative;
		width: 100%;
		height: 100%;
		z-index: 2;
		display: block;
	}

	.zero-axis {
		stroke: rgba(255, 255, 255, 0.14);
		stroke-width: 1;
	}

	.wave-bar-peak {
		fill: rgba(243, 239, 230, 0.36);
		transition: height 60ms linear, y 60ms linear;
	}

	.wave-bar-rms {
		fill: #f3efe6;
		transition: height 60ms linear, y 60ms linear;
	}

	.wave-bar-peak.is-recording {
		fill: rgba(230, 57, 70, 0.42);
	}

	.wave-bar-rms.is-recording {
		fill: #ff5c67;
	}

	.wave-bar-peak.is-enhanced {
		fill: rgba(242, 107, 33, 0.42);
	}

	.wave-bar-rms.is-enhanced {
		fill: #ff8c47;
	}

	.wave-bar-peak.is-outside-trim,
	.wave-bar-rms.is-outside-trim {
		opacity: 0.22;
	}

	.trimmed-mask {
		position: absolute;
		top: 0;
		bottom: 0;
		background: repeating-linear-gradient(
			-45deg,
			rgba(0, 0, 0, 0.62),
			rgba(0, 0, 0, 0.62) 6px,
			rgba(20, 23, 28, 0.62) 6px,
			rgba(20, 23, 28, 0.62) 12px
		);
		z-index: 3;
		pointer-events: none;
	}

	.trimmed-mask-left {
		left: 0;
		border-right: 1px solid rgba(242, 107, 33, 0.45);
	}

	.trimmed-mask-right {
		border-left: 1px solid rgba(242, 107, 33, 0.45);
	}

	.selection-band {
		position: absolute;
		top: 0;
		bottom: 0;
		background: rgba(242, 107, 33, 0.2);
		border-left: 1px solid #f26b21;
		border-right: 1px solid #f26b21;
		z-index: 3;
		pointer-events: none;
	}

	.silence-preview-band {
		position: absolute;
		top: 8px;
		bottom: 8px;
		background: rgba(79, 209, 139, 0.14);
		border: 1px dashed rgba(79, 209, 139, 0.6);
		border-radius: 4px;
		z-index: 3;
		pointer-events: none;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;
	}

	.silence-tag {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.6rem;
		color: #4fd18b;
		background: rgba(11, 13, 15, 0.85);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.bookmarks-layer {
		position: absolute;
		top: 4px;
		left: 0;
		right: 0;
		height: 22px;
		z-index: 5;
		pointer-events: none;
	}

	.bookmark-pin {
		position: absolute;
		transform: translateX(-50%);
		pointer-events: auto;
		background: #1f242b;
		border: 1px solid rgba(242, 107, 33, 0.65);
		color: #f3efe6;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.62rem;
		padding: 1px 5px;
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
	}

	.trim-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 16px;
		transform: translateX(-50%);
		z-index: 6;
		cursor: ew-resize;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 6px;
	}

	.trim-handle::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 2px;
		transform: translateX(-50%);
		background: #f26b21;
	}

	.handle-grip {
		position: relative;
		background: #f26b21;
		color: #0b0d0f;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.58rem;
		font-weight: 700;
		padding: 2px 4px;
		border-radius: 3px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
	}

	.playhead-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: #f3efe6;
		transform: translateX(-50%);
		z-index: 5;
		pointer-events: none;
		box-shadow: 0 0 8px rgba(243, 239, 230, 0.65);
	}

	.playhead-cap {
		width: 8px;
		height: 8px;
		background: #f3efe6;
		border-radius: 50%;
		transform: translate(-3px, 2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.wave-bar-peak,
		.wave-bar-rms {
			transition: none;
		}
	}
</style>
