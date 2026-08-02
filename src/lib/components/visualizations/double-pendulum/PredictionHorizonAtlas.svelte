<script module lang="ts">
	import { AtlasMemoryCache } from '$lib/visualizations/double-pendulum/atlas';

	const sharedAtlasMemoryCache = new AtlasMemoryCache(4);
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		atlasCacheKey,
		validateAtlasSettings,
		type AtlasAngularBounds,
		type AtlasGridResult,
		type AtlasSettings
	} from '$lib/visualizations/double-pendulum/atlas';
	import {
		createAtlasWorkerClient,
		type AtlasWorkerClient
	} from '$lib/visualizations/double-pendulum/worker/client';
	import type { AtlasWorkerResponse } from '$lib/visualizations/double-pendulum/worker/protocol';
	import type {
		AtlasConfiguration,
		PendulumParameters,
		PerturbationDimension
	} from '$lib/visualizations/double-pendulum/types';

	type AtlasPreset = 'classic' | 'low-energy' | 'high-energy' | 'heavy' | 'moon' | 'custom';
	type Props = {
		parameters: PendulumParameters;
		initialSelection?: { theta1: number; theta2: number } | null;
		initialConfiguration: AtlasConfiguration;
		onselection: (theta1: number, theta2: number) => void;
		onwatch: (theta1: number, theta2: number, parameters: PendulumParameters) => void;
		onsettings: (configuration: AtlasConfiguration) => void;
		onparameters: (parameters: PendulumParameters) => void;
		oncapture: (capture: () => HTMLCanvasElement | null) => void;
		oncopycapture: (capture: () => string | null) => void;
	};

	let {
		parameters,
		initialSelection = null,
		initialConfiguration,
		onselection,
		onwatch,
		onsettings,
		onparameters,
		oncapture,
		oncopycapture
	}: Props = $props();

	const FULL_BOUNDS: AtlasAngularBounds = {
		theta1Min: -Math.PI,
		theta1Max: Math.PI,
		theta2Min: -Math.PI,
		theta2Max: Math.PI
	};
	const HORIZON_COLOR_STOPS = new Uint8Array([
		111, 39, 35, 205, 93, 52, 218, 161, 80, 91, 157, 150, 63, 119, 132
	]);

	let shell: HTMLElement;
	let canvas: HTMLCanvasElement;
	let worker: AtlasWorkerClient | null = null;
	let unsubscribe: (() => void) | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let currentSettings: AtlasSettings | null = null;
	let currentCacheKey = '';
	let currentPass = 0;
	let drawFrameId = 0;
	let pendingPasses: number[] = [];
	let visible = true;
	let pointerDown: { x: number; y: number } | null = null;
	let dragPoint: { x: number; y: number } | null = null;

	let preset = $state<AtlasPreset>('classic');
	let bounds = $state<AtlasAngularBounds>({ ...FULL_BOUNDS });
	let resolution = $state(96);
	let threshold = $state(0.1);
	let maxTime = $state(10);
	let atlasDt = $state(1 / 120);
	let fixedOmega1 = $state(0);
	let fixedOmega2 = $state(0);
	let atlasPerturbationDimension = $state<PerturbationDimension>('theta1');
	let atlasPerturbationMagnitude = $state(1e-7);
	let baseParameters = $state<PendulumParameters>({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 });
	let experimentParameters = $state<PendulumParameters>({
		m1: 1,
		m2: 1,
		l1: 1,
		l2: 1,
		g: 9.81
	});
	let running = $state(false);
	let progress = $state(0);
	let status = $state('The atlas is preparing its first experiment.');
	let completionAnnouncement = $state('');
	let error = $state('');
	let preview = $state(false);
	let zoomTool = $state(false);
	let selected = $state<{ theta1: number; theta2: number } | null>(null);
	let selectedHorizon = $state<number | null>(null);
	let selectedCapped = $state(false);
	let copied = $state(false);
	let horizons = $state.raw<Float32Array | null>(null);
	let capped = $state.raw<Uint8Array | null>(null);
	let previewGrid = $state.raw<AtlasGridResult | null>(null);

	let experimentVelocities = $derived({ omega1: fixedOmega1, omega2: fixedOmega2 });
	let legend = $derived(
		`Colour shows simulated seconds before the lower bobs differ by ${formatDistance(threshold)}. The ${formatDimension(atlasPerturbationDimension)} values differ by ${atlasPerturbationMagnitude.toExponential(1)} ${atlasPerturbationDimension.startsWith('omega') ? 'rad/s' : 'rad'}. Fixed ω₁ ${fixedOmega1.toFixed(2)} rad/s and ω₂ ${fixedOmega2.toFixed(2)} rad/s; masses ${experimentParameters.m1.toFixed(2)} kg and ${experimentParameters.m2.toFixed(2)} kg; rods ${experimentParameters.l1.toFixed(2)} m and ${experimentParameters.l2.toFixed(2)} m; g ${experimentParameters.g.toFixed(2)} m/s²; atlas timestep ${formatTimestep(atlasDt)}.`
	);
	let selectionText = $derived(
		selected
			? `θ₁ ${radiansToDegrees(selected.theta1).toFixed(3)}°, θ₂ ${radiansToDegrees(selected.theta2).toFixed(3)}°${selectedHorizon === null ? '' : selectedCapped ? `; agreement retained for at least ${selectedHorizon.toFixed(2)} s` : `; measured horizon ${selectedHorizon.toFixed(2)} s`}`
			: 'Choose a cell to inspect its initial angles and measured horizon.'
	);

	onMount(() => {
		selected = initialSelection;
		baseParameters = { ...parameters };
		experimentParameters = { ...parameters };
		bounds = {
			theta1Min: initialConfiguration.theta1Min,
			theta1Max: initialConfiguration.theta1Max,
			theta2Min: initialConfiguration.theta2Min,
			theta2Max: initialConfiguration.theta2Max
		};
		const resolutionWasShared = new URLSearchParams(window.location.search).has('ares');
		const narrowScreen = window.matchMedia('(max-width: 720px)').matches;
		const constrainedProcessor =
			typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
		resolution =
			resolutionWasShared || (!narrowScreen && !constrainedProcessor)
				? initialConfiguration.resolution
				: constrainedProcessor
					? 80
					: 96;
		threshold = initialConfiguration.divergenceThreshold;
		maxTime = initialConfiguration.timeCap;
		atlasDt = initialConfiguration.timestep;
		fixedOmega1 = clampFixedOmega(initialConfiguration.fixedOmega1);
		fixedOmega2 = clampFixedOmega(initialConfiguration.fixedOmega2);
		atlasPerturbationDimension = initialConfiguration.perturbationDimension;
		atlasPerturbationMagnitude = initialConfiguration.perturbationMagnitude;
		if (fixedOmega1 !== 0 || fixedOmega2 !== 0) preset = 'custom';
		oncapture(() => canvas ?? null);
		oncopycapture(exportAtlasCsv);
		resizeObserver = new ResizeObserver(draw);
		resizeObserver.observe(canvas);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries.some((entry) => entry.isIntersecting);
				if (!visible && running)
					cancelAtlas('Atlas paused because it moved offscreen. Generate again when ready.');
			},
			{ rootMargin: '240px 0px', threshold: 0.01 }
		);
		intersectionObserver.observe(shell);
		document.addEventListener('visibilitychange', handleVisibility);
		try {
			connectWorker();
			generate();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The atlas Worker could not be created.';
			status = 'Prediction Horizon Atlas unavailable. The Pendulum Lab remains fully functional.';
		}
		return () => {
			cancelAnimationFrame(drawFrameId);
			oncapture(() => null);
			oncopycapture(() => null);
			document.removeEventListener('visibilitychange', handleVisibility);
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			unsubscribe?.();
			worker?.dispose();
			worker = null;
		};
	});

	function connectWorker() {
		unsubscribe?.();
		worker?.dispose();
		worker = createAtlasWorkerClient();
		unsubscribe = worker.subscribe(handleWorkerMessage);
	}

	function handleVisibility() {
		if (document.hidden && running) cancelAtlas('Atlas cancelled while this tab was hidden.');
	}

	function parametersForPreset(
		base: PendulumParameters,
		selectedPreset: AtlasPreset
	): PendulumParameters {
		if (selectedPreset === 'heavy') return { ...base, m2: Math.max(base.m2, base.m1 * 4) };
		if (selectedPreset === 'moon') return { ...base, g: 1.62 };
		return { ...base };
	}

	function applyPreset(next: AtlasPreset) {
		preset = next;
		if (next === 'high-energy') {
			fixedOmega1 = 2;
			fixedOmega2 = -1;
		} else if (next !== 'custom') {
			fixedOmega1 = 0;
			fixedOmega2 = 0;
		}
		bounds =
			next === 'low-energy'
				? {
						theta1Min: -Math.PI / 2,
						theta1Max: Math.PI / 2,
						theta2Min: -Math.PI / 2,
						theta2Max: Math.PI / 2
					}
				: { ...FULL_BOUNDS };
		clampSelectionToBounds();
		experimentParameters = parametersForPreset(baseParameters, next);
		onparameters({ ...experimentParameters });
		invalidateExperiment('Atlas preset changed. Generate to run the new experiment.');
	}

	function atlasControlChanged() {
		preset = 'custom';
		invalidateExperiment('Atlas settings changed. Generate to run the new experiment.');
	}

	function clampFixedOmega(value: number) {
		return Number.isFinite(value) ? Math.max(-20, Math.min(20, value)) : 0;
	}

	function changeFixedOmega(target: 'omega1' | 'omega2', value: number) {
		const bounded = clampFixedOmega(value);
		if (target === 'omega1') fixedOmega1 = bounded;
		else fixedOmega2 = bounded;
		atlasControlChanged();
	}

	function changeAtlasPerturbationExponent(exponent: number) {
		atlasPerturbationMagnitude = 10 ** Math.max(-12, Math.min(-2, exponent));
		atlasControlChanged();
	}

	function invalidateExperiment(message: string) {
		pendingPasses = [];
		if (running) {
			try {
				worker?.cancel();
			} catch {
				// The stale experiment is discarded locally even if its Worker has already stopped.
			}
		}
		running = false;
		currentSettings = null;
		currentCacheKey = '';
		horizons = null;
		capped = null;
		previewGrid = null;
		preview = false;
		progress = 0;
		selectedHorizon = null;
		error = '';
		status = message;
		emitSettings();
		draw();
	}

	function clampSelectionToBounds() {
		if (!selected) return;
		const theta1 = Math.max(bounds.theta1Min, Math.min(bounds.theta1Max, selected.theta1));
		const theta2 = Math.max(bounds.theta2Min, Math.min(bounds.theta2Max, selected.theta2));
		if (theta1 === selected.theta1 && theta2 === selected.theta2) return;
		selected = { theta1, theta2 };
		onselection(theta1, theta2);
	}

	function settingsFor(size: number): AtlasSettings {
		return validateAtlasSettings({
			bounds: { ...bounds },
			width: size,
			height: size,
			parameters: { ...experimentParameters },
			omega1: experimentVelocities.omega1,
			omega2: experimentVelocities.omega2,
			perturbation: {
				dimension: atlasPerturbationDimension,
				magnitude: atlasPerturbationMagnitude
			},
			divergenceThreshold: threshold,
			maxTime,
			dt: atlasDt,
			rowsPerChunk: 1
		});
	}

	function currentConfiguration(): AtlasConfiguration {
		return {
			theta1Min: bounds.theta1Min,
			theta1Max: bounds.theta1Max,
			theta2Min: bounds.theta2Min,
			theta2Max: bounds.theta2Max,
			resolution,
			fixedOmega1: experimentVelocities.omega1,
			fixedOmega2: experimentVelocities.omega2,
			perturbationDimension: atlasPerturbationDimension,
			perturbationMagnitude: atlasPerturbationMagnitude,
			divergenceThreshold: threshold,
			timeCap: maxTime,
			timestep: atlasDt,
			selectedTheta1: selected?.theta1,
			selectedTheta2: selected?.theta2
		};
	}

	function emitSettings() {
		onsettings(currentConfiguration());
	}

	function generate() {
		emitSettings();
		completionAnnouncement = '';
		if (!worker) {
			try {
				connectWorker();
			} catch (cause) {
				error =
					cause instanceof Error
						? cause.message
						: 'Web Workers are unavailable, so the atlas cannot calculate safely.';
				status = 'Prediction Horizon Atlas unavailable. The other laboratory modes still work.';
				return;
			}
		}
		if (running) cancelAtlas('Earlier atlas calculation cancelled for a new experiment.');
		error = '';
		preview = false;
		previewGrid = null;
		pendingPasses = Array.from(new Set([Math.min(20, resolution), resolution]));
		startNextPass();
	}

	function startNextPass() {
		if (!worker) return;
		const size = pendingPasses.shift();
		if (!size) {
			running = false;
			preview = false;
			progress = 1;
			status = `Atlas complete at ${currentPass} × ${currentPass}. Select a point to launch its trajectory.`;
			completionAnnouncement = status;
			draw();
			return;
		}
		currentPass = size;
		try {
			currentSettings = settingsFor(size);
			if (size === resolution) snapSelectionToCurrentGrid();
			currentCacheKey = atlasCacheKey(currentSettings);
			const cached = sharedAtlasMemoryCache.get(currentSettings);
			if (cached) {
				horizons = cached.horizons;
				capped = cached.capped;
				refreshSelectedHorizon();
				progress = 1;
				if (pendingPasses.length > 0) {
					previewGrid = cached;
					preview = true;
				}
				draw();
				startNextPass();
				return;
			}
			horizons = new Float32Array(size * size).fill(Number.NaN);
			capped = new Uint8Array(size * size);
			selectedHorizon = null;
			selectedCapped = false;
			progress = 0;
			running = true;
			preview = size < resolution || previewGrid !== null;
			status =
				size < resolution
					? `Computing a genuine ${size} × ${size} coarse preview…`
					: previewGrid
						? `Refining the labelled coarse preview to ${size} × ${size}…`
						: `Computing ${size} × ${size} atlas…`;
			worker.start(currentSettings);
			draw();
		} catch (cause) {
			running = false;
			error = cause instanceof Error ? cause.message : 'The atlas settings were rejected.';
			status = 'Atlas could not start. Adjust the experiment and try again.';
		}
	}

	function handleWorkerMessage(message: AtlasWorkerResponse) {
		if (!currentSettings) return;
		switch (message.type) {
			case 'READY':
				status =
					currentPass < resolution
						? `Computing a genuine ${currentPass} × ${currentPass} coarse preview…`
						: `Computing atlas rows in a background Worker…`;
				break;
			case 'CHUNK': {
				if (!horizons || !capped || message.chunk.width !== currentPass) return;
				const offset = message.chunk.rowStart * currentPass;
				horizons.set(message.chunk.horizons, offset);
				capped.set(message.chunk.capped, offset);
				progress = message.chunk.progress;
				status = `${preview ? 'Preview/refinement' : 'Atlas'} ${Math.round(progress * 100)}% complete.`;
				refreshSelectedHorizon();
				scheduleDraw();
				break;
			}
			case 'COMPLETE': {
				if (!horizons || !capped || message.cacheKey !== currentCacheKey) return;
				const grid = {
					width: currentPass,
					height: currentPass,
					horizons: horizons.slice(),
					capped: capped.slice()
				};
				sharedAtlasMemoryCache.set(currentSettings, grid);
				if (pendingPasses.length > 0) {
					previewGrid = grid;
					preview = true;
					status = `${currentPass} × ${currentPass} coarse preview complete; beginning refinement.`;
				}
				startNextPass();
				break;
			}
			case 'CANCELLED':
				running = false;
				progress = message.totalRows > 0 ? message.completedRows / message.totalRows : 0;
				status = 'Atlas calculation cancelled. Existing computed rows remain visible.';
				break;
			case 'ERROR':
				running = false;
				error = message.message;
				unsubscribe?.();
				unsubscribe = null;
				worker?.dispose();
				worker = null;
				status = 'Atlas Worker stopped. Adjust settings and Generate to start a fresh Worker.';
				break;
			case 'STALE':
			case 'DISPOSED':
				break;
		}
	}

	function cancelAtlas(message = 'Atlas calculation cancelled.') {
		pendingPasses = [];
		if (running) {
			try {
				worker?.cancel();
			} catch {
				// The Worker may already have failed; the visible error remains authoritative.
			}
		}
		running = false;
		status = message;
	}

	function resetView() {
		bounds = { ...FULL_BOUNDS };
		zoomTool = false;
		clampSelectionToBounds();
		invalidateExperiment('Angular view reset to −π…π on both axes. Generate to recompute.');
	}

	function canvasMetrics() {
		const rect = canvas.getBoundingClientRect();
		return { rect, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
	}

	function cellAt(clientX: number, clientY: number) {
		if (!currentSettings) return null;
		const { rect, width, height } = canvasMetrics();
		const x = Math.max(0, Math.min(width - Number.EPSILON, clientX - rect.left));
		const y = Math.max(0, Math.min(height - Number.EPSILON, clientY - rect.top));
		const column = Math.min(
			currentSettings.width - 1,
			Math.floor((x / width) * currentSettings.width)
		);
		const row = Math.min(
			currentSettings.height - 1,
			Math.floor((y / height) * currentSettings.height)
		);
		return { column, row, x, y };
	}

	function anglesAt(column: number, row: number) {
		if (!currentSettings) return null;
		return {
			theta1:
				currentSettings.bounds.theta1Min +
				((column + 0.5) / currentSettings.width) *
					(currentSettings.bounds.theta1Max - currentSettings.bounds.theta1Min),
			theta2:
				currentSettings.bounds.theta2Max -
				((row + 0.5) / currentSettings.height) *
					(currentSettings.bounds.theta2Max - currentSettings.bounds.theta2Min)
		};
	}

	function selectCell(column: number, row: number) {
		const angles = anglesAt(column, row);
		if (!angles || !currentSettings) return;
		selected = angles;
		refreshSelectedHorizon();
		onselection(angles.theta1, angles.theta2);
		draw();
	}

	function snapSelectionToCurrentGrid() {
		if (!selected || !currentSettings) return;
		const cell = cellForAngles(selected, currentSettings);
		const angles = anglesAt(cell.column, cell.row);
		if (!angles) return;
		if (angles.theta1 === selected.theta1 && angles.theta2 === selected.theta2) return;
		selected = angles;
		onselection(angles.theta1, angles.theta2);
	}

	function refreshSelectedHorizon() {
		if (!selected || !currentSettings || !horizons) {
			selectedHorizon = null;
			selectedCapped = false;
			return;
		}
		const cell = cellForAngles(selected, currentSettings);
		const index = cell.row * currentSettings.width + cell.column;
		selectedHorizon = Number.isFinite(horizons[index]) ? horizons[index] : null;
		selectedCapped = selectedHorizon !== null && capped?.[index] === 1;
	}

	function scheduleDraw() {
		if (drawFrameId !== 0) return;
		drawFrameId = requestAnimationFrame(() => {
			drawFrameId = 0;
			draw();
		});
	}

	function handlePointerDown(event: PointerEvent) {
		const point = cellAt(event.clientX, event.clientY);
		if (!point) return;
		pointerDown = { x: point.x, y: point.y };
		dragPoint = pointerDown;
		canvas.setPointerCapture(event.pointerId);
		if (zoomTool) event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		const point = cellAt(event.clientX, event.clientY);
		if (!point) return;
		if (pointerDown && zoomTool) {
			dragPoint = { x: point.x, y: point.y };
			event.preventDefault();
		}
		draw();
	}

	function handlePointerUp(event: PointerEvent) {
		const point = cellAt(event.clientX, event.clientY);
		if (point && pointerDown && currentSettings) {
			if (
				zoomTool &&
				dragPoint &&
				Math.hypot(dragPoint.x - pointerDown.x, dragPoint.y - pointerDown.y) > 12
			) {
				const { width, height } = canvasMetrics();
				const left = Math.min(pointerDown.x, dragPoint.x) / width;
				const right = Math.max(pointerDown.x, dragPoint.x) / width;
				const top = Math.min(pointerDown.y, dragPoint.y) / height;
				const bottom = Math.max(pointerDown.y, dragPoint.y) / height;
				const old = currentSettings.bounds;
				bounds = {
					theta1Min: old.theta1Min + left * (old.theta1Max - old.theta1Min),
					theta1Max: old.theta1Min + right * (old.theta1Max - old.theta1Min),
					theta2Min: old.theta2Max - bottom * (old.theta2Max - old.theta2Min),
					theta2Max: old.theta2Max - top * (old.theta2Max - old.theta2Min)
				};
				zoomTool = false;
				clampSelectionToBounds();
				invalidateExperiment('Zoom region selected. Generate to calculate this angular rectangle.');
			} else {
				selectCell(point.column, point.row);
			}
		}
		pointerDown = null;
		dragPoint = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		draw();
	}

	function handlePointerCancel(event: PointerEvent) {
		pointerDown = null;
		dragPoint = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		draw();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!currentSettings) return;
		const current = selected ? cellForAngles(selected, currentSettings) : { column: 0, row: 0 };
		let column = current.column;
		let row = current.row;
		switch (event.key) {
			case 'ArrowLeft':
				column -= 1;
				break;
			case 'ArrowRight':
				column += 1;
				break;
			case 'ArrowUp':
				row -= 1;
				break;
			case 'ArrowDown':
				row += 1;
				break;
			case 'Enter':
				if (selected) onwatch(selected.theta1, selected.theta2, { ...experimentParameters });
				return;
			default:
				return;
		}
		selectCell(
			Math.max(0, Math.min(currentSettings.width - 1, column)),
			Math.max(0, Math.min(currentSettings.height - 1, row))
		);
		event.preventDefault();
	}

	function cellForAngles(point: { theta1: number; theta2: number }, settings: AtlasSettings) {
		return {
			column: Math.max(
				0,
				Math.min(
					settings.width - 1,
					Math.floor(
						((point.theta1 - settings.bounds.theta1Min) /
							(settings.bounds.theta1Max - settings.bounds.theta1Min)) *
							settings.width
					)
				)
			),
			row: Math.max(
				0,
				Math.min(
					settings.height - 1,
					Math.floor(
						((settings.bounds.theta2Max - point.theta2) /
							(settings.bounds.theta2Max - settings.bounds.theta2Min)) *
							settings.height
					)
				)
			)
		};
	}

	function draw() {
		if (!canvas || !visible) return;
		const rect = canvas.getBoundingClientRect();
		const width = Math.max(300, rect.width);
		const height = Math.max(300, Math.min(width, 720));
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.height = `${height}px`;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#081015';
		ctx.fillRect(0, 0, width, height);
		const settings = currentSettings;
		if (!settings) return;

		const cellWidth = width / settings.width;
		const cellHeight = height / settings.height;
		for (let row = 0; row < settings.height; row += 1) {
			for (let column = 0; column < settings.width; column += 1) {
				const index = row * settings.width + column;
				let horizon = horizons?.[index] ?? Number.NaN;
				let isCapped = capped?.[index] === 1;
				let fromPreview = false;
				if (!Number.isFinite(horizon) && previewGrid) {
					const previewColumn = Math.min(
						previewGrid.width - 1,
						Math.floor((column / settings.width) * previewGrid.width)
					);
					const previewRow = Math.min(
						previewGrid.height - 1,
						Math.floor((row / settings.height) * previewGrid.height)
					);
					const previewIndex = previewRow * previewGrid.width + previewColumn;
					horizon = previewGrid.horizons[previewIndex];
					isCapped = previewGrid.capped[previewIndex] === 1;
					fromPreview = true;
				}
				ctx.fillStyle = Number.isFinite(horizon)
					? horizonColor(horizon, settings.maxTime, isCapped, fromPreview)
					: '#111d23';
				ctx.fillRect(
					column * cellWidth,
					row * cellHeight,
					Math.ceil(cellWidth + 0.5),
					Math.ceil(cellHeight + 0.5)
				);
			}
		}

		if (selected) {
			const cell = cellForAngles(selected, settings);
			const x = (cell.column + 0.5) * cellWidth;
			const y = (cell.row + 0.5) * cellHeight;
			ctx.strokeStyle = '#fff8e8';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(x - 11, y);
			ctx.lineTo(x + 11, y);
			ctx.moveTo(x, y - 11);
			ctx.lineTo(x, y + 11);
			ctx.stroke();
			ctx.strokeStyle = '#081015';
			ctx.strokeRect(x - 5, y - 5, 10, 10);
		}

		if (pointerDown && dragPoint && zoomTool) {
			ctx.fillStyle = 'rgb(255 248 232 / 0.12)';
			ctx.strokeStyle = '#fff8e8';
			ctx.setLineDash([5, 4]);
			const left = Math.min(pointerDown.x, dragPoint.x);
			const top = Math.min(pointerDown.y, dragPoint.y);
			const boxWidth = Math.abs(dragPoint.x - pointerDown.x);
			const boxHeight = Math.abs(dragPoint.y - pointerDown.y);
			ctx.fillRect(left, top, boxWidth, boxHeight);
			ctx.strokeRect(left, top, boxWidth, boxHeight);
			ctx.setLineDash([]);
		}

		ctx.fillStyle = '#eef0e9';
		ctx.font = '11px ui-monospace, monospace';
		ctx.fillText(`${radiansToDegrees(settings.bounds.theta1Min).toFixed(0)}°`, 8, height - 8);
		ctx.textAlign = 'right';
		ctx.fillText(
			`${radiansToDegrees(settings.bounds.theta1Max).toFixed(0)}° θ₁`,
			width - 8,
			height - 8
		);
		ctx.textAlign = 'left';
		ctx.fillText(`${radiansToDegrees(settings.bounds.theta2Max).toFixed(0)}° θ₂`, 8, 16);
	}

	function horizonColor(horizon: number, cap: number, isCapped: boolean, fromPreview: boolean) {
		if (isCapped) return fromPreview ? '#395d68' : '#4f8992';
		const t = Math.max(0, Math.min(1, horizon / Math.max(cap, 1e-9)));
		const scaled = t * 4;
		const lower = Math.min(3, Math.floor(scaled));
		const fraction = scaled - lower;
		const offset = lower * 3;
		const nextOffset = offset + 3;
		const red = Math.round(
			HORIZON_COLOR_STOPS[offset] +
				(HORIZON_COLOR_STOPS[nextOffset] - HORIZON_COLOR_STOPS[offset]) * fraction
		);
		const green = Math.round(
			HORIZON_COLOR_STOPS[offset + 1] +
				(HORIZON_COLOR_STOPS[nextOffset + 1] - HORIZON_COLOR_STOPS[offset + 1]) * fraction
		);
		const blue = Math.round(
			HORIZON_COLOR_STOPS[offset + 2] +
				(HORIZON_COLOR_STOPS[nextOffset + 2] - HORIZON_COLOR_STOPS[offset + 2]) * fraction
		);
		const alpha = fromPreview ? 0.62 : 1;
		return `rgb(${red} ${green} ${blue} / ${alpha})`;
	}

	function exportAtlasCsv() {
		if (!currentSettings || !horizons) return null;
		const finiteIndices: number[] = [];
		for (let index = 0; index < horizons.length; index += 1) {
			if (Number.isFinite(horizons[index])) finiteIndices.push(index);
		}
		if (finiteIndices.length === 0) return null;
		const rowCount = Math.min(2_000, finiteIndices.length);
		const rows = [
			'theta1_rad,theta2_rad,prediction_horizon_s,capped,grid_width,grid_height,divergence_threshold_m,time_cap_s,timestep_s,perturbation_dimension,perturbation_magnitude'
		];
		for (let outputIndex = 0; outputIndex < rowCount; outputIndex += 1) {
			const sourceOffset =
				finiteIndices.length <= rowCount || rowCount <= 1
					? outputIndex
					: Math.round((outputIndex * (finiteIndices.length - 1)) / (rowCount - 1));
			const index = finiteIndices[sourceOffset];
			const row = Math.floor(index / currentSettings.width);
			const column = index % currentSettings.width;
			const angles = anglesAt(column, row);
			if (!angles) continue;
			rows.push(
				[
					angles.theta1.toPrecision(12),
					angles.theta2.toPrecision(12),
					horizons[index].toPrecision(12),
					capped?.[index] === 1 ? 'true' : 'false',
					currentSettings.width,
					currentSettings.height,
					currentSettings.divergenceThreshold,
					currentSettings.maxTime,
					currentSettings.dt,
					atlasPerturbationDimension,
					atlasPerturbationMagnitude
				].join(',')
			);
		}
		return rows.join('\n');
	}

	async function copyCoordinates() {
		if (!selected) return;
		const value = `theta1=${selected.theta1.toPrecision(12)}, theta2=${selected.theta2.toPrecision(12)}`;
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			window.prompt('Copy coordinates:', value);
		}
		copied = true;
		setTimeout(() => (copied = false), 2200);
	}

	function formatDimension(dimension: PerturbationDimension) {
		return dimension === 'theta1'
			? 'initial θ₁'
			: dimension === 'theta2'
				? 'initial θ₂'
				: dimension === 'omega1'
					? 'initial ω₁'
					: 'initial ω₂';
	}

	function formatDistance(value: number) {
		if (value < 0.01) return `${(value * 1000).toFixed(0)} mm`;
		if (value < 1) return `${(value * 100).toFixed(0)} cm`;
		return `${value.toFixed(0)} m`;
	}

	function formatTimestep(value: number) {
		return `1/${Math.round(1 / value)} s`;
	}

	function radiansToDegrees(value: number) {
		return (value * 180) / Math.PI;
	}
</script>

<section bind:this={shell} class="atlas-panel" aria-labelledby="atlas-title">
	<header class="atlas-header">
		<div>
			<p class="eyebrow">Specified numerical experiment</p>
			<h3 id="atlas-title">Prediction Horizon Atlas</h3>
			<p>
				Every coloured cell evolves two real double-pendulum calculations. No colour is decorative
				noise.
			</p>
		</div>
		<div class="challenge" aria-label="Atlas field challenges">
			<span>Find a calm island.</span>
			<span>Find the seam where tomorrow disappears fastest.</span>
		</div>
	</header>

	<div class="atlas-layout">
		<div class="canvas-column">
			<div class="atlas-canvas-frame">
				<canvas
					bind:this={canvas}
					class:zoom-active={zoomTool}
					aria-label={`Prediction-horizon map with θ1 on the horizontal axis and θ2 on the vertical axis. ${selectionText}`}
					tabindex="0"
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerup={handlePointerUp}
					onpointercancel={handlePointerCancel}
					onkeydown={handleKeydown}
				></canvas>
				{#if preview}<span class="preview-badge">Coarse preview under genuine refinement</span>{/if}
			</div>
			<div class="legend" aria-label={legend}>
				<div class="legend-ramp" aria-hidden="true"></div>
				<div><span>Short horizon</span><span>Long horizon / capped</span></div>
				<p>{legend}</p>
			</div>
		</div>

		<aside class="atlas-controls" aria-label="Atlas experiment controls">
			<label>
				<span>Experiment preset</span>
				<select
					value={preset}
					onchange={(event) => applyPreset(event.currentTarget.value as AtlasPreset)}
				>
					<option value="classic">Classic zero-velocity plane</option>
					<option value="low-energy">Low-energy close-up</option>
					<option value="high-energy">High-energy tumbler</option>
					<option value="heavy">Heavy lower bob</option>
					<option value="moon">Moon gravity</option>
					<option value="custom">Custom atlas plane</option>
				</select>
			</label>
			<label>
				<span>Quality</span>
				<select bind:value={resolution} onchange={atlasControlChanged}>
					<option value={80}>Quick · 80 × 80</option>
					<option value={96}>Standard · 96 × 96</option>
					<option value={144}>Detailed · 144 × 144</option>
				</select>
			</label>
			<label>
				<span>Divergence threshold</span>
				<select bind:value={threshold} onchange={atlasControlChanged}>
					<option value={0.01}>1 cm</option>
					<option value={0.1}>10 cm</option>
					<option value={1}>1 metre</option>
				</select>
			</label>
			<label>
				<span>Time cap <output>{maxTime.toFixed(0)} s</output></span>
				<input
					type="range"
					min="4"
					max="20"
					step="1"
					bind:value={maxTime}
					onchange={atlasControlChanged}
				/>
			</label>
			<label>
				<span>Atlas timestep</span>
				<select bind:value={atlasDt} onchange={atlasControlChanged}>
					<option value={1 / 120}>1/120 s · standard</option>
					<option value={1 / 180}>1/180 s · careful</option>
					<option value={1 / 240}>1/240 s · expensive</option>
				</select>
			</label>
			<div class="velocity-controls">
				<label>
					<span>Fixed ω₁ <small>rad/s</small></span>
					<input
						type="number"
						min="-20"
						max="20"
						step="0.1"
						value={fixedOmega1}
						onchange={(event) => changeFixedOmega('omega1', event.currentTarget.valueAsNumber)}
					/>
				</label>
				<label>
					<span>Fixed ω₂ <small>rad/s</small></span>
					<input
						type="number"
						min="-20"
						max="20"
						step="0.1"
						value={fixedOmega2}
						onchange={(event) => changeFixedOmega('omega2', event.currentTarget.valueAsNumber)}
					/>
				</label>
			</div>
			<div class="velocity-controls">
				<label>
					<span>Shadow coordinate</span>
					<select bind:value={atlasPerturbationDimension} onchange={atlasControlChanged}>
						<option value="theta1">Upper angle θ₁</option>
						<option value="theta2">Lower angle θ₂</option>
						<option value="omega1">Upper velocity ω₁</option>
						<option value="omega2">Lower velocity ω₂</option>
					</select>
				</label>
				<label>
					<span>Shadow nudge <output>{atlasPerturbationMagnitude.toExponential(1)}</output></span>
					<input
						aria-label="Atlas perturbation exponent"
						type="range"
						min="-12"
						max="-2"
						step="0.25"
						value={Math.log10(atlasPerturbationMagnitude)}
						onchange={(event) => changeAtlasPerturbationExponent(event.currentTarget.valueAsNumber)}
					/>
				</label>
			</div>

			<div class="control-actions">
				<button class="primary" type="button" onclick={generate} disabled={running}
					>Generate atlas</button
				>
				<button type="button" onclick={() => cancelAtlas()} disabled={!running}>Cancel</button>
			</div>
			<div class="control-actions">
				<button
					type="button"
					class:pressed={zoomTool}
					aria-pressed={zoomTool}
					onclick={() => (zoomTool = !zoomTool)}>Select zoom region</button
				>
				<button type="button" onclick={resetView}>Reset view</button>
			</div>

			<div class="progress-wrap" aria-busy={running}>
				<div
					class="progress-track"
					role="progressbar"
					aria-label="Atlas computation progress"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(progress * 100)}
				>
					<span style={`width:${Math.round(progress * 100)}%`}></span>
				</div>
				<p>{status}</p>
				<span class="sr-only" role="status">{completionAnnouncement}</span>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<div class="selection-readout">
				<strong>Selected experiment</strong>
				<p>{selectionText}</p>
				<div class="control-actions">
					<button type="button" onclick={copyCoordinates} disabled={!selected}
						>{copied ? 'Coordinates copied' : 'Copy coordinates'}</button
					>
					<button
						class="primary"
						type="button"
						disabled={!selected}
						onclick={() =>
							selected && onwatch(selected.theta1, selected.theta2, { ...experimentParameters })}
						>Watch this point</button
					>
				</div>
			</div>
			<p class="local-note">
				Computed locally in your browser. Completed maps are cached only in memory for this visit.
			</p>
		</aside>
	</div>
</section>

<style>
	.atlas-panel {
		border-top: 1px solid var(--dp-line, #344750);
		background: #0c151a;
		padding: clamp(1rem, 3vw, 1.75rem);
		color: #f4eee4;
	}
	.atlas-header,
	.atlas-layout,
	.control-actions,
	.legend > div,
	.challenge {
		display: flex;
		gap: 0.8rem;
	}
	.atlas-header {
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.atlas-header h3,
	.atlas-header p,
	.challenge,
	.legend p,
	.progress-wrap p,
	.selection-readout p,
	.local-note {
		margin: 0;
	}
	.atlas-header h3 {
		color: #f4eee4 !important;
		font-size: clamp(1.25rem, 3vw, 1.8rem);
		font-weight: 500;
		letter-spacing: -0.025em;
	}
	.atlas-header > div > p:last-child {
		max-width: 46rem;
		color: #a8b7bc;
		font-size: 0.8rem;
	}
	.eyebrow {
		color: #dc825a !important;
		font-size: 0.68rem !important;
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.challenge {
		flex-direction: column;
		border-left: 1px solid #4a6069;
		padding-left: 0.8rem;
		color: #d9c49e;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
	}
	.atlas-layout {
		align-items: start;
	}
	.canvas-column {
		min-width: 0;
		flex: 1 1 50rem;
	}
	.atlas-canvas-frame {
		position: relative;
		border: 1px solid #40545d;
		background: #081015;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		min-height: 300px;
		cursor: crosshair;
		touch-action: pan-y;
	}
	canvas.zoom-active {
		touch-action: none;
	}
	canvas:focus-visible,
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 3px solid #a7dfd1;
		outline-offset: 2px;
	}
	.preview-badge {
		position: absolute;
		top: 0.6rem;
		left: 0.6rem;
		border: 1px solid #d2b883;
		background: rgb(8 16 21 / 0.88);
		padding: 0.3rem 0.48rem;
		color: #ead7ad;
		font:
			0.66rem ui-monospace,
			monospace;
	}
	.legend {
		padding-top: 0.65rem;
	}
	.legend-ramp {
		height: 0.65rem;
		background: linear-gradient(90deg, #6f2723, #cd5d34, #daa150, #5b9d96, #4f8992);
	}
	.legend > div {
		justify-content: space-between;
		margin-top: 0.25rem;
		color: #a9b9be;
		font-size: 0.66rem;
	}
	.legend p {
		margin-top: 0.45rem;
		color: #c7d1d3;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.atlas-controls {
		display: grid;
		flex: 0 1 20rem;
		gap: 0.75rem;
		min-width: min(100%, 18rem);
	}
	.velocity-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.velocity-controls small {
		color: #82979e;
		font-size: 0.62rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		color: #bac7ca;
		font-size: 0.72rem;
	}
	label > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	select,
	button {
		min-height: 2.75rem;
		border: 1px solid #465d66;
		border-radius: 0.4rem;
		background: #132229;
		color: #f4eee4;
		font: inherit;
	}
	select {
		width: 100%;
		padding: 0.52rem 2rem 0.52rem 0.65rem;
	}
	input[type='range'] {
		width: 100%;
		min-height: 2rem;
		accent-color: #dc744c;
	}
	button {
		cursor: pointer;
		padding: 0.55rem 0.7rem;
	}
	button.primary,
	button.pressed {
		border-color: #e18a64;
		background: #7c3528;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.control-actions {
		flex-wrap: wrap;
	}
	.control-actions button {
		flex: 1 1 8rem;
	}
	.progress-wrap {
		min-height: 3.2rem;
	}
	.progress-track {
		height: 0.42rem;
		background: #22333a;
		overflow: hidden;
	}
	.progress-track span {
		display: block;
		height: 100%;
		background: #d27650;
		transition: width 120ms linear;
	}
	.progress-wrap p,
	.error,
	.local-note {
		margin-top: 0.38rem;
		color: #9fb0b5;
		font-size: 0.7rem;
		line-height: 1.4;
	}
	.error {
		color: #ffb199;
	}
	.selection-readout {
		border: 1px solid #3a5059;
		background: #101d23;
		padding: 0.75rem;
	}
	.selection-readout strong {
		font-size: 0.78rem;
	}
	.selection-readout p {
		min-height: 3rem;
		padding: 0.4rem 0;
		color: #c2ced1;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		line-height: 1.45;
	}
	@media (max-width: 840px) {
		.atlas-header,
		.atlas-layout {
			flex-direction: column;
		}
		.challenge {
			width: 100%;
		}
		.canvas-column,
		.atlas-controls {
			width: 100%;
			flex-basis: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-track span {
			transition: none;
		}
	}
</style>
