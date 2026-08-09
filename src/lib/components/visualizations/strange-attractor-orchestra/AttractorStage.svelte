<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		CoreGenerationResult,
		NoiseLens,
		SonicEvent
	} from '$lib/visualizations/strange-attractor-orchestra/types';
	import type {
		OrchestraQualityTier,
		OrchestraRenderChoreography,
		OrchestraRenderer,
		OrchestraRenderPacket,
		OrchestraRenderPacketSource,
		OrchestraRenderStats,
		OrchestraRenderView
	} from '$lib/visualizations/strange-attractor-orchestra/renderer/types';

	type RendererModule = typeof import('$lib/visualizations/strange-attractor-orchestra/renderer');
	type MutableChoreography = {
		-readonly [Key in keyof OrchestraRenderChoreography]: OrchestraRenderChoreography[Key];
	};

	type RendererReport = {
		kind: string;
		status: string;
		pointCount: number;
		drawCalls: number;
	};

	type Props = {
		data: CoreGenerationResult | null;
		view: OrchestraRenderView;
		lens: NoiseLens;
		quality: OrchestraQualityTier;
		playing: boolean;
		playhead01: number;
		choreography: Partial<OrchestraRenderChoreography>;
		reducedMotion: boolean;
		onconduct?: (horizontal: number, vertical: number, active: boolean) => void;
		onrenderer?: (report: RendererReport) => void;
		onfps?: (fps: number) => void;
		onfailure?: (message: string) => void;
	};

	let {
		data,
		view,
		lens,
		quality,
		playing,
		playhead01,
		choreography,
		reducedMotion,
		onconduct = () => undefined,
		onrenderer = () => undefined,
		onfps = () => undefined,
		onfailure = () => undefined
	}: Props = $props();

	let shell!: HTMLElement;
	let canvas!: HTMLCanvasElement;
	let renderer = $state.raw<OrchestraRenderer | null>(null);
	let packet: OrchestraRenderPacket | null = null;
	let fillPacket: RendererModule['fillRenderPacket'] | null = null;
	let animationFrame = 0;
	let resizeFrame = 0;
	let conductReleaseFrame = 0;
	let conductReleaseStartedAt = 0;
	let conductReleaseFromX = 0;
	let conductReleaseFromY = 0;
	let visible = true;
	let rendererLabel = $state('renderer not loaded');
	let contextMessage = $state('');
	let conductX = $state(0);
	let conductY = $state(0);
	let conducting = $state(false);
	let preparedData: CoreGenerationResult | null = null;
	let eventFeatureIndices = new Uint32Array(0);
	let packetSequence = 0;
	let lastPulseScoreTime = Number.NaN;
	let frameWindowStart = 0;
	let frameWindowCount = 0;
	let lastRendererReportAt = Number.NEGATIVE_INFINITY;

	const causeCode: Record<SonicEvent['type'], number> = {
		'section-crossing': 0,
		'region-transition': 1,
		recurrence: 2,
		fold: 3,
		'cell-boundary': 4
	};
	const EVENT_PULSE_STRIDE = 8;
	const MAX_EVENT_PULSES = 256;
	const CONDUCT_WEATHER_PHASE_SPAN = 4;
	const CONDUCT_RELEASE_MS = 280;

	function currentScoreTime(): number {
		const score = data?.score;
		return (score?.at(-1)?.time ?? 30) * Math.max(0, Math.min(1, playhead01));
	}

	function currentSimulationTime(): number {
		const simulationTimes = data?.features.simulationTimes;
		if (!simulationTimes?.length) return 0;
		const scaledIndex = Math.max(0, Math.min(1, playhead01)) * (simulationTimes.length - 1);
		const lowerIndex = Math.floor(scaledIndex);
		const upperIndex = Math.min(simulationTimes.length - 1, lowerIndex + 1);
		const amount = scaledIndex - lowerIndex;
		return (
			(simulationTimes[lowerIndex] ?? 0) * (1 - amount) +
			(simulationTimes[upperIndex] ?? 0) * amount
		);
	}

	function currentVisualSimulationTime(): number {
		const phaseOffset = Math.max(-1, Math.min(1, conductX)) * CONDUCT_WEATHER_PHASE_SPAN;
		return Math.max(0, currentSimulationTime() + phaseOffset);
	}

	function featureIndexForStep(steps: Uint32Array, step: number): number {
		if (!steps.length) return 0;
		let low = 0;
		let high = steps.length - 1;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (steps[middle] < step) low = middle + 1;
			else high = middle;
		}
		return low;
	}

	function unit(value: number | undefined, fallback: number): number {
		return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : fallback;
	}

	function rebuildEventFeatureIndices(currentData: CoreGenerationResult): void {
		const events = currentData.score;
		const steps = currentData.features.simulationSteps;
		eventFeatureIndices = new Uint32Array(events.length);
		for (let index = 0; index < events.length; index += 1) {
			eventFeatureIndices[index] = featureIndexForStep(steps, events[index].simulationStep);
		}
	}

	function fillStablePacket(currentData: CoreGenerationResult): void {
		const currentPacket = packet;
		const currentFillPacket = fillPacket;
		if (!currentPacket || !currentFillPacket || preparedData === currentData) return;
		rebuildEventFeatureIndices(currentData);
		packetSequence = (packetSequence + 1) >>> 0;
		const displayQuality = currentPacket.quality;
		const source: OrchestraRenderPacketSource = {
			rawPositions: currentData.features.position01,
			warpedPositions: currentData.features.warpedPosition01,
			positionStride: 3,
			pointCount: currentData.features.pointCount,
			features: {
				noiseValue01: currentData.features.noiseValue01,
				curvature01: currentData.features.curvature01,
				density01: currentData.features.density01,
				recurrence01: currentData.features.recurrence01,
				curlAngle01: currentData.features.noiseCurlAngle01,
				region: currentData.features.region
			},
			eventCount: 0,
			view: currentPacket.view,
			lens: currentPacket.lens,
			// Keep the complete stable packet; presentation tiers cap the visible range later.
			quality: 'high',
			choreography: currentPacket.choreography,
			sequence: packetSequence,
			simulationTime: 0
		};
		currentFillPacket(currentPacket, source);
		currentPacket.quality = displayQuality;
		preparedData = currentData;
		lastPulseScoreTime = Number.NaN;
	}

	function clearStablePacket(): void {
		preparedData = null;
		eventFeatureIndices = new Uint32Array(0);
		lastPulseScoreTime = Number.NaN;
		if (!packet) return;
		packet.pointCount = 0;
		packet.eventCount = 0;
		packet.geometryRevision = (packet.geometryRevision + 1) >>> 0;
		packet.eventRevision = (packet.eventRevision + 1) >>> 0;
	}

	function syncPacketPresentation(
		nextView: OrchestraRenderView,
		nextLens: NoiseLens,
		nextQuality: OrchestraQualityTier,
		nextChoreography: Partial<OrchestraRenderChoreography>,
		nextPlaying: boolean
	): void {
		if (!packet) return;
		packet.view = nextView;
		packet.lens = nextLens;
		packet.quality = nextQuality;
		const target = packet.choreography as MutableChoreography;
		target.reveal01 = unit(nextChoreography.reveal01, 1);
		const requestedTrailHead = unit(nextChoreography.trailHead01, 1);
		target.trailHead01 = nextPlaying
			? Math.max(0.18, requestedTrailHead)
			: requestedTrailHead <= 0
				? 1
				: requestedTrailHead;
		target.rawMix01 = unit(nextChoreography.rawMix01, 1);
		target.weatherMix01 = unit(nextChoreography.weatherMix01, 1);
		target.voiceMix01 = unit(nextChoreography.voiceMix01, 1);
	}

	function updatePulses(scoreTime: number): void {
		const currentData = data;
		const currentPacket = packet;
		if (!currentData || !currentPacket || Object.is(scoreTime, lastPulseScoreTime)) return;
		let nextCount = 0;
		const events = currentData.score;
		const pulseCapacity = Math.min(
			MAX_EVENT_PULSES,
			Math.floor(currentPacket.eventPulses.length / EVENT_PULSE_STRIDE)
		);
		for (let index = events.length - 1; index >= 0 && nextCount < pulseCapacity; index -= 1) {
			const event = events[index];
			const age = scoreTime - event.time;
			if (age < 0 || age > 1.35) continue;
			const featureIndex = eventFeatureIndices[index] ?? 0;
			const positionOffset = featureIndex * 3;
			const writeOffset = nextCount * EVENT_PULSE_STRIDE;
			currentPacket.eventPulses[writeOffset] =
				currentData.features.warpedPosition01[positionOffset] ?? 0.5;
			currentPacket.eventPulses[writeOffset + 1] =
				currentData.features.warpedPosition01[positionOffset + 1] ?? 0.5;
			currentPacket.eventPulses[writeOffset + 2] =
				currentData.features.warpedPosition01[positionOffset + 2] ?? 0.5;
			currentPacket.eventPulses[writeOffset + 3] = event.velocity01;
			currentPacket.eventPulses[writeOffset + 4] = age / 1.35;
			currentPacket.eventPulses[writeOffset + 5] = causeCode[event.type];
			currentPacket.eventPulses[writeOffset + 6] = currentData.features.region[featureIndex] ?? 0;
			currentPacket.eventPulses[writeOffset + 7] = Math.min(1, 0.3 + event.velocity01 * 0.7);
			nextCount += 1;
		}
		currentPacket.eventCount = nextCount;
		currentPacket.eventRevision = (currentPacket.eventRevision + 1) >>> 0;
		lastPulseScoreTime = scoreTime;
	}

	function reportFrame(now: number, stats: Readonly<OrchestraRenderStats>): void {
		if (now - lastRendererReportAt >= 800) {
			lastRendererReportAt = now;
			onrenderer({
				kind: stats.kind,
				status: renderer?.status ?? 'disposed',
				pointCount: stats.pointCount,
				drawCalls: stats.drawCalls
			});
		}
		if (!frameWindowStart) frameWindowStart = now;
		frameWindowCount += 1;
		const elapsed = now - frameWindowStart;
		if (elapsed >= 800) {
			onfps((frameWindowCount * 1_000) / elapsed);
			frameWindowStart = now;
			frameWindowCount = 0;
		}
	}

	function render(now = performance.now()): void {
		animationFrame = 0;
		if (!renderer || !packet || !fillPacket || !visible || document.hidden) return;
		try {
			const scoreTime = currentScoreTime();
			packet.simulationTime = currentVisualSimulationTime();
			updatePulses(scoreTime);
			const stats = renderer.render(packet);
			reportFrame(now, stats);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'The visual renderer stopped safely.';
			contextMessage = message;
			onfailure(message);
			return;
		}
		if (playing && !reducedMotion) animationFrame = requestAnimationFrame(render);
	}

	function requestRender(): void {
		if (!animationFrame) animationFrame = requestAnimationFrame(render);
	}

	function resize(): void {
		if (!renderer || !shell) return;
		const bounds = shell.getBoundingClientRect();
		renderer.resize(bounds.width, bounds.height, window.devicePixelRatio, quality);
		requestRender();
	}

	function pointerCoordinates(event: PointerEvent): [number, number] {
		const bounds = canvas.getBoundingClientRect();
		return [
			Math.max(
				-1,
				Math.min(1, ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1)
			),
			Math.max(-1, Math.min(1, 1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2))
		];
	}

	function beginConducting(event: PointerEvent): void {
		if (conductReleaseFrame) cancelAnimationFrame(conductReleaseFrame);
		conductReleaseFrame = 0;
		conducting = true;
		canvas.setPointerCapture(event.pointerId);
		[conductX, conductY] = pointerCoordinates(event);
		onconduct(conductX, conductY, true);
		requestRender();
	}

	function moveConducting(event: PointerEvent): void {
		if (!conducting) return;
		[conductX, conductY] = pointerCoordinates(event);
		onconduct(conductX, conductY, true);
		requestRender();
	}

	function advanceConductRelease(now: number): void {
		conductReleaseFrame = 0;
		const progress = Math.max(0, Math.min(1, (now - conductReleaseStartedAt) / CONDUCT_RELEASE_MS));
		const remaining = (1 - progress) ** 3;
		conductX = conductReleaseFromX * remaining;
		conductY = conductReleaseFromY * remaining;
		requestRender();
		if (progress < 1) conductReleaseFrame = requestAnimationFrame(advanceConductRelease);
	}

	function releaseConductingHome(): void {
		conducting = false;
		onconduct(0, 0, false);
		if (conductReleaseFrame) cancelAnimationFrame(conductReleaseFrame);
		conductReleaseFrame = 0;
		if (reducedMotion || (conductX === 0 && conductY === 0)) {
			conductX = 0;
			conductY = 0;
			requestRender();
			return;
		}
		conductReleaseFromX = conductX;
		conductReleaseFromY = conductY;
		conductReleaseStartedAt = performance.now();
		conductReleaseFrame = requestAnimationFrame(advanceConductRelease);
	}

	function endConducting(event: PointerEvent): void {
		if (!conducting) return;
		conducting = false;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		releaseConductingHome();
	}

	function handleKeydown(event: KeyboardEvent): void {
		const amount = event.shiftKey ? 0.2 : 0.1;
		if (event.key.startsWith('Arrow') && conductReleaseFrame) {
			cancelAnimationFrame(conductReleaseFrame);
			conductReleaseFrame = 0;
		}
		if (event.key === 'ArrowLeft') conductX = Math.max(-1, conductX - amount);
		else if (event.key === 'ArrowRight') conductX = Math.min(1, conductX + amount);
		else if (event.key === 'ArrowUp') conductY = Math.min(1, conductY + amount);
		else if (event.key === 'ArrowDown') conductY = Math.max(-1, conductY - amount);
		else if (event.key === 'Home') {
			releaseConductingHome();
			event.preventDefault();
			return;
		} else return;
		event.preventDefault();
		onconduct(conductX, conductY, conductX !== 0 || conductY !== 0);
		requestRender();
	}

	$effect(() => {
		const currentData = data;
		if (currentData) fillStablePacket(currentData);
		else clearStablePacket();
		requestRender();
	});

	$effect(() => {
		syncPacketPresentation(view, lens, quality, choreography, playing);
		if (packet) packet.simulationTime = currentVisualSimulationTime();
		requestRender();
	});

	$effect(() => {
		const shouldAnimate = playing && !reducedMotion;
		if (reducedMotion && conductReleaseFrame) {
			cancelAnimationFrame(conductReleaseFrame);
			conductReleaseFrame = 0;
			conductX = 0;
			conductY = 0;
		}
		renderer?.setSuspended(!visible || document.hidden);
		if (shouldAnimate) {
			requestRender();
		} else {
			if (animationFrame) cancelAnimationFrame(animationFrame);
			animationFrame = 0;
			frameWindowStart = 0;
			frameWindowCount = 0;
			requestRender();
		}
	});

	onMount(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		const handleVisibility = () => {
			renderer?.setSuspended(document.hidden || !visible);
			if (!document.hidden) requestRender();
		};
		const initialize = async () => {
			try {
				const module = await import('$lib/visualizations/strange-attractor-orchestra/renderer');
				if (disposed) return;
				fillPacket = module.fillRenderPacket;
				packet = module.createRenderPacket({
					pointCapacity: 60_000,
					eventCapacity: MAX_EVENT_PULSES,
					quality,
					view,
					lens
				});
				syncPacketPresentation(view, lens, quality, choreography, playing);
				if (data) fillStablePacket(data);
				const query = new URLSearchParams(window.location.search);
				const forceCanvas = query.get('webgl') === 'off' || query.get('sa_renderer') === 'canvas';
				renderer = module.createOrchestraRenderer(canvas, {
					mode: forceCanvas ? 'canvas2d' : 'auto',
					quality,
					devicePixelRatio: window.devicePixelRatio,
					onStatus: (_status, message) => {
						contextMessage = message;
					},
					onFallback: (message) => {
						contextMessage = message;
					}
				});
				rendererLabel = renderer.kind === 'webgl2' ? 'WebGL2 point buffer' : 'Canvas 2D fallback';
				resize();
			} catch (error) {
				const message = error instanceof Error ? error.message : 'No visual renderer is available.';
				contextMessage = message;
				onfailure(message);
			}
		};

		resizeObserver = new ResizeObserver(() => {
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				resizeFrame = 0;
				resize();
			});
		});
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				renderer?.setSuspended(!visible || document.hidden);
				if (visible) requestRender();
			},
			{ rootMargin: '160px' }
		);
		resizeObserver.observe(shell);
		intersectionObserver.observe(shell);
		document.addEventListener('visibilitychange', handleVisibility);
		void initialize();

		return () => {
			disposed = true;
			if (animationFrame) cancelAnimationFrame(animationFrame);
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			if (conductReleaseFrame) cancelAnimationFrame(conductReleaseFrame);
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			renderer?.dispose();
			renderer = null;
			packet = null;
		};
	});
</script>

<div
	bind:this={shell}
	class="stage-shell"
	data-renderer={renderer?.kind ?? 'loading'}
	data-view={view}
>
	<img
		class="poster"
		src="/images/visualizations/strange-attractor-orchestra/langford-poster.png"
		alt=""
		aria-hidden="true"
	/>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="Conduct the current strange attractor. Horizontal movement biases visible weather and stereo circulation; vertical movement changes sparseness and brightness without changing the canonical orbit."
		aria-describedby="sa-stage-instructions"
		onpointerdown={beginConducting}
		onpointermove={moveConducting}
		onpointerup={endConducting}
		onpointercancel={endConducting}
		onlostpointercapture={endConducting}
		onkeydown={handleKeydown}
	></canvas>
	<div
		class="reticle"
		style={`--x:${conductX};--y:${conductY}`}
		class:active={conducting}
		aria-hidden="true"
	></div>
	<div class="layer-label" aria-hidden="true">
		<span>orbit</span><b>→</b><span>weather</span><b>→</b><span>voice</span>
	</div>
	{#if !data}<div class="loading">Warming the fixed-step orbit…</div>{/if}
	{#if contextMessage}<p class="renderer-message" role="status">{contextMessage}</p>{/if}
</div>
<p id="sa-stage-instructions" class="sr-only">
	Drag or move a pointer to conduct temporarily. Arrow keys conduct in ten-percent steps; hold Shift
	for larger steps. Home returns to the deterministic baseline. These gestures never alter the
	canonical trajectory or shared score.
</p>
<p class="renderer-line"><span></span>{rendererLabel}</p>

<style>
	.stage-shell {
		position: relative;
		min-height: min(78svh, 900px);
		overflow: hidden;
		border: 1px solid rgb(225 219 200 / 18%);
		border-radius: 0.65rem;
		background: #030709;
		box-shadow: inset 0 0 5rem rgb(0 0 0 / 52%);
	}

	.poster,
	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.poster {
		object-fit: cover;
		opacity: 0.52;
	}

	canvas {
		z-index: 2;
		touch-action: none;
		cursor: crosshair;
	}

	canvas:focus-visible {
		outline: 4px solid #8ee8eb;
		outline-offset: -6px;
	}

	.reticle {
		position: absolute;
		z-index: 4;
		left: calc(50% + var(--x) * 42%);
		top: calc(50% - var(--y) * 42%);
		width: 1.8rem;
		height: 1.8rem;
		transform: translate(-50%, -50%);
		border: 1px solid rgb(122 208 212 / 48%);
		border-radius: 50%;
		opacity: 0.35;
		pointer-events: none;
		transition:
			left 180ms ease,
			top 180ms ease,
			opacity 180ms ease;
	}

	.reticle.active {
		opacity: 0.9;
	}

	.layer-label {
		position: absolute;
		z-index: 5;
		top: 1rem;
		left: 1rem;
		display: flex;
		gap: 0.42rem;
		align-items: center;
		border: 1px solid rgb(225 219 200 / 16%);
		border-radius: 999px;
		background: rgb(3 7 9 / 68%);
		padding: 0.45rem 0.65rem;
		color: #a6adac;
		font: 700 0.59rem/1 var(--font-mono, monospace);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		backdrop-filter: blur(10px);
	}

	.layer-label b {
		color: #79cbd0;
	}

	.loading,
	.renderer-message {
		position: absolute;
		z-index: 6;
		left: 50%;
		transform: translateX(-50%);
		border: 1px solid rgb(225 219 200 / 20%);
		border-radius: 999px;
		background: rgb(3 7 9 / 88%);
		padding: 0.55rem 0.75rem;
		color: #aec8c7;
		font: 680 0.64rem/1.3 var(--font-mono, monospace);
	}

	.loading {
		top: 50%;
	}

	.renderer-message {
		bottom: 1rem;
		margin: 0;
	}

	.renderer-line {
		display: flex;
		gap: 0.45rem;
		align-items: center;
		margin: 0.5rem 0 0;
		color: #727c79;
		font: 0.61rem/1.4 var(--font-mono, monospace);
	}

	.renderer-line span {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #70b8ab;
		box-shadow: 0 0 0 3px rgb(112 184 171 / 14%);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (max-width: 1024px) {
		.stage-shell {
			min-height: min(68svh, 720px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.reticle {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.stage-shell,
		.layer-label,
		.loading,
		.renderer-message {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
