<script lang="ts">
	import { onMount } from 'svelte';
	import AcquisitionView from './AcquisitionView.svelte';
	import CTControls from './CTControls.svelte';
	import ExperimentGuides, { type ExperimentId } from './ExperimentGuides.svelte';
	import PhantomEditor, { type PhantomSelection } from './PhantomEditor.svelte';
	import ReconstructionComparison from './ReconstructionComparison.svelte';
	import SinogramView from './SinogramView.svelte';
	import {
		DEFAULT_ACQUISITION_SETTINGS,
		DEFAULT_RECONSTRUCTION_SETTINGS,
		clonePhantom,
		createPresetPhantom,
		createProjectionGeometry,
		phantomToAttenuation,
		type AcquisitionSettings,
		type Phantom,
		type PhantomPresetId,
		type ReconstructionMetrics,
		type ReconstructionSettings
	} from '$lib/visualizations/ct-reconstruction';
	import {
		createCTWorkerClient,
		type CTWorkerClient,
		type CTWorkerResponse
	} from '$lib/visualizations/ct-reconstruction/worker';

	type PlaybackState = 'idle' | 'ready' | 'running' | 'paused' | 'complete' | 'error';
	type SinogramSelection = {
		angleIndex: number;
		detectorIndex: number;
		value: number | null;
	};
	type DisplaySettings = {
		autoWindow: boolean;
		windowCenter: number;
		windowWidth: number;
		zoom: number;
	};

	const DEFAULT_PRESET: PhantomPresetId = 'hidden-lesion';
	const FILTER_LABELS: Record<ReconstructionSettings['filter'], string> = {
		ramp: 'Ramp (Ram–Lak)',
		'shepp-logan': 'Shepp–Logan',
		cosine: 'Cosine',
		hann: 'Hann',
		hamming: 'Hamming'
	};
	const INITIAL_PHANTOM = createPresetPhantom(DEFAULT_PRESET);
	const INITIAL_ACQUISITION: AcquisitionSettings = { ...DEFAULT_ACQUISITION_SETTINGS };

	let shell: HTMLElement;
	let fullscreenTrigger: HTMLButtonElement;
	let fullscreenSettingsTrigger: HTMLButtonElement;
	let fullscreenSettingsClose: HTMLButtonElement;
	let client: CTWorkerClient | null = null;
	let unsubscribeWorker: (() => void) | null = null;
	let nextBatchTimer: ReturnType<typeof setTimeout> | null = null;
	let reconstructionTimer: ReturnType<typeof setTimeout> | null = null;
	let lastFullscreenTrigger: HTMLButtonElement | null = null;
	let motionQuery: MediaQueryList | null = null;

	let preset = $state<PhantomPresetId>(DEFAULT_PRESET);
	let editablePhantom = $state.raw<Phantom>(INITIAL_PHANTOM);
	let committedPhantom = $state.raw<Phantom>(clonePhantom(INITIAL_PHANTOM));
	let acquisition = $state<AcquisitionSettings>({ ...INITIAL_ACQUISITION });
	let reconstruction = $state<ReconstructionSettings>({
		...DEFAULT_RECONSTRUCTION_SETTINGS
	});
	let display = $state<DisplaySettings>({
		autoWindow: true,
		windowCenter: 0.5,
		windowWidth: 1,
		zoom: 1
	});
	let playbackSpeed = $state(1);
	let playbackState = $state<PlaybackState>('idle');
	let workerReady = $state(false);
	let initializing = $state(false);
	let initialized = $state(false);
	let stale = $state(false);
	let reducedMotion = $state(false);
	let batchInFlight = $state(false);
	let pendingAutoplay = false;
	let pendingSingleStep = false;
	let stepping = false;
	let progress = $state(0);
	let actualProjectionCount = $state(countActualProjections(INITIAL_ACQUISITION));
	let scanProjectionCount = $state(INITIAL_ACQUISITION.projectionCount);
	let scanDetectorCount = $state(INITIAL_ACQUISITION.detectorCount);
	let acquiredProjectionCount = $state(0);
	let revealedRows = $state(0);
	let currentAngle = $state(0);
	let currentProjection = $state.raw<Float32Array | null>(null);
	let sinogram = $state.raw<Float32Array | null>(null);
	let angles = $state.raw<Float64Array | null>(null);
	let acquiredMask = $state.raw<Uint8Array | null>(null);
	let backprojection = $state.raw<Float32Array | null>(null);
	let filteredBackprojection = $state.raw<Float32Array | null>(null);
	let backprojectionMetrics = $state<ReconstructionMetrics | null>(null);
	let filteredMetrics = $state<ReconstructionMetrics | null>(null);
	let selectedPoint = $state<PhantomSelection | null>(null);
	let selectedDetector = $state(Math.floor(INITIAL_ACQUISITION.detectorCount / 2));
	let activeExperiment = $state<ExperimentId | null>(null);
	let fullscreen = $state(false);
	let fullscreenSettingsOpen = $state(false);
	let fullscreenAvailable = $state(false);
	let errorMessage = $state('');
	let liveMessage = $state('The CT laboratory is ready to initialize.');
	let announcedDecile = -1;
	let nextPreviewProjection = 1;

	let groundTruth = $derived(phantomToAttenuation(committedPhantom));
	let filterLabel = $derived(FILTER_LABELS[reconstruction.filter]);
	let displayedProjectionCount = $derived(
		initialized ? scanProjectionCount : acquisition.projectionCount
	);
	let displayedDetectorCount = $derived(
		initialized ? scanDetectorCount : acquisition.detectorCount
	);
	let missingCount = $derived(acquisition.projectionCount - actualProjectionCount);
	let fullscreenPrimaryLabel = $derived(
		playbackState === 'running'
			? 'Pause'
			: playbackState === 'paused' && !stale
				? 'Resume'
				: playbackState === 'complete' || stale
					? 'New scan'
					: 'Start'
	);
	let fullscreenNeedsRecovery = $derived(playbackState === 'error' || !workerReady);
	let fullscreenStatusLabel = $derived(
		errorMessage ? `Error: ${errorMessage}` : `${Math.round(progress * 100)}% complete`
	);
	let stateDescription = $derived.by(() => {
		const percent = Math.round(progress * 100);
		const coverage =
			missingCount === 0
				? 'No angles are missing.'
				: `${missingCount} of ${acquisition.projectionCount} nominal angles are omitted.`;
		if (errorMessage) return `The scan stopped with an error. ${errorMessage}`;
		if (stale) {
			return `Controls or the phantom have changed. The displayed ${acquiredProjectionCount > 0 ? 'scan is stale' : 'state has not been scanned'}; start a new scan to apply them.`;
		}
		if (playbackState === 'idle' || playbackState === 'ready') {
			return `Ready to acquire ${actualProjectionCount} of ${acquisition.projectionCount} projection angles. ${coverage}`;
		}
		if (playbackState === 'complete') {
			return `Scan complete. ${acquiredProjectionCount} projections acquired. ${coverage} ${filterLabel} reconstruction is final.`;
		}
		return `Scan ${percent}% complete. ${acquiredProjectionCount} of ${actualProjectionCount} acquired projection angles processed. ${coverage} ${filterLabel} reconstruction is updating.`;
	});

	function countActualProjections(settings: AcquisitionSettings): number {
		const geometry = createProjectionGeometry(settings);
		let count = 0;
		for (const value of geometry.acquired) count += value === 0 ? 0 : 1;
		return count;
	}

	function clearBatchTimer() {
		if (nextBatchTimer !== null) {
			clearTimeout(nextBatchTimer);
			nextBatchTimer = null;
		}
	}

	function clearReconstructionTimer() {
		if (reconstructionTimer !== null) {
			clearTimeout(reconstructionTimer);
			reconstructionTimer = null;
		}
	}

	function batchSize() {
		if (reducedMotion) return 1;
		return Math.max(2, Math.min(12, Math.round(playbackSpeed * 3)));
	}

	function batchDelay() {
		return reducedMotion ? 150 : Math.max(18, Math.round(90 / playbackSpeed));
	}

	function scheduleNextBatch(immediate = false) {
		clearBatchTimer();
		if (playbackState !== 'running' || batchInFlight || !client) return;
		nextBatchTimer = setTimeout(
			() => {
				nextBatchTimer = null;
				requestBatch(batchSize());
			},
			immediate ? 0 : batchDelay()
		);
	}

	function requestBatch(size: number) {
		if (!client || batchInFlight) return;
		batchInFlight = true;
		try {
			const previewInterval = Math.max(1, Math.ceil(actualProjectionCount / 10));
			const includePreview = stepping || acquiredProjectionCount + size >= nextPreviewProjection;
			if (includePreview) {
				nextPreviewProjection = acquiredProjectionCount + Math.max(size, previewInterval);
			}
			client.processBatch(size, includePreview);
		} catch (error) {
			handleFatalError(error);
		}
	}

	function cancelPendingInitialization(): boolean {
		if (!initializing) return false;
		initializing = false;
		pendingAutoplay = false;
		pendingSingleStep = false;
		stepping = false;
		batchInFlight = false;
		try {
			client?.cancel();
		} catch {
			// A failed or disposed Worker is surfaced by the next explicit action.
		}
		return true;
	}

	function beginNewScan(autoplay: boolean, singleStep = false) {
		if (!client || !workerReady) {
			handleFatalError(new Error('The numerical Worker is not ready.'));
			return;
		}
		clearBatchTimer();
		clearReconstructionTimer();
		committedPhantom = clonePhantom(editablePhantom);
		scanProjectionCount = acquisition.projectionCount;
		scanDetectorCount = acquisition.detectorCount;
		progress = 0;
		acquiredProjectionCount = 0;
		revealedRows = 0;
		currentAngle = 0;
		currentProjection = null;
		sinogram = null;
		angles = null;
		acquiredMask = null;
		backprojection = null;
		filteredBackprojection = null;
		backprojectionMetrics = null;
		filteredMetrics = null;
		errorMessage = '';
		stale = false;
		initializing = true;
		initialized = false;
		batchInFlight = false;
		announcedDecile = -1;
		nextPreviewProjection = 1;
		pendingAutoplay = autoplay;
		pendingSingleStep = singleStep;
		stepping = singleStep;
		playbackState = autoplay ? 'running' : 'paused';
		liveMessage = 'Preparing the phantom and projection geometry.';
		try {
			client.initialize({
				phantom: committedPhantom,
				acquisition,
				reconstruction
			});
		} catch (error) {
			initializing = false;
			handleFatalError(error);
		}
	}

	function startScan() {
		beginNewScan(true);
	}

	function pauseScan() {
		if (playbackState !== 'running') return;
		clearBatchTimer();
		pendingAutoplay = false;
		playbackState = 'paused';
		liveMessage = `Scan paused at ${Math.round(progress * 100)}%.`;
	}

	function resumeScan() {
		if (stale || !initialized || playbackState === 'complete') {
			beginNewScan(true);
			return;
		}
		playbackState = 'running';
		stepping = false;
		liveMessage = `Scan resumed at ${Math.round(progress * 100)}%.`;
		scheduleNextBatch(true);
	}

	function singleStep() {
		clearBatchTimer();
		if (stale || !initialized || playbackState === 'complete') {
			beginNewScan(false, true);
			return;
		}
		playbackState = 'paused';
		stepping = true;
		requestBatch(1);
	}

	function restartScan() {
		beginNewScan(true);
	}

	function resetLaboratory() {
		clearBatchTimer();
		clearReconstructionTimer();
		const shouldReconnectWorker = playbackState === 'error' || !workerReady;
		if (client) {
			try {
				client.cancel();
			} catch {
				// A disposed Worker is handled by the state reset below.
			}
		}
		preset = DEFAULT_PRESET;
		editablePhantom = createPresetPhantom(DEFAULT_PRESET);
		committedPhantom = clonePhantom(editablePhantom);
		acquisition = { ...DEFAULT_ACQUISITION_SETTINGS };
		reconstruction = { ...DEFAULT_RECONSTRUCTION_SETTINGS };
		display = { autoWindow: true, windowCenter: 0.5, windowWidth: 1, zoom: 1 };
		playbackSpeed = 1;
		progress = 0;
		actualProjectionCount = countActualProjections(acquisition);
		scanProjectionCount = acquisition.projectionCount;
		scanDetectorCount = acquisition.detectorCount;
		acquiredProjectionCount = 0;
		revealedRows = 0;
		currentAngle = 0;
		currentProjection = null;
		sinogram = null;
		angles = null;
		acquiredMask = null;
		backprojection = null;
		filteredBackprojection = null;
		backprojectionMetrics = null;
		filteredMetrics = null;
		selectedPoint = null;
		selectedDetector = Math.floor(acquisition.detectorCount / 2);
		activeExperiment = null;
		errorMessage = '';
		stale = false;
		initializing = false;
		initialized = false;
		batchInFlight = false;
		pendingAutoplay = false;
		pendingSingleStep = false;
		stepping = false;
		nextPreviewProjection = 1;
		const workerConnected = shouldReconnectWorker ? connectWorker() : workerReady;
		if (!workerConnected) return;
		playbackState = workerReady ? 'ready' : 'idle';
		liveMessage = 'Laboratory reset to the hidden-lesion phantom and default scan settings.';
	}

	function markAcquisitionStale(message: string) {
		clearBatchTimer();
		const interruptedInitialization = cancelPendingInitialization();
		if (playbackState === 'running') playbackState = 'paused';
		stale = interruptedInitialization || initialized || acquiredProjectionCount > 0;
		actualProjectionCount = countActualProjections(acquisition);
		const visibleDetectorCount = initialized ? scanDetectorCount : acquisition.detectorCount;
		selectedDetector = Math.min(selectedDetector, visibleDetectorCount - 1);
		activeExperiment = null;
		liveMessage = message;
	}

	function changeAcquisition<Key extends keyof AcquisitionSettings>(
		key: Key,
		value: AcquisitionSettings[Key]
	) {
		acquisition = { ...acquisition, [key]: value };
		markAcquisitionStale(`${humanizeSetting(String(key))} changed. Start a new scan to apply it.`);
	}

	function changeReconstruction<Key extends keyof ReconstructionSettings>(
		key: Key,
		value: ReconstructionSettings[Key]
	) {
		reconstruction = { ...reconstruction, [key]: value };
		activeExperiment = null;
		if (cancelPendingInitialization()) {
			stale = true;
			playbackState = 'ready';
			liveMessage = `${humanizeSetting(String(key))} changed while the scan was preparing. Start a new scan to apply it.`;
			return;
		}
		if (!initialized || acquiredProjectionCount === 0 || stale || !client) {
			liveMessage = `${humanizeSetting(String(key))} set for the next reconstruction.`;
			return;
		}
		clearReconstructionTimer();
		reconstructionTimer = setTimeout(() => {
			reconstructionTimer = null;
			try {
				client?.reconstruct(reconstruction);
				liveMessage = `Reconstructing the existing sinogram with ${FILTER_LABELS[reconstruction.filter]}.`;
			} catch (error) {
				handleFatalError(error);
			}
		}, 120);
	}

	function changeDisplay(patch: Partial<DisplaySettings>) {
		display = { ...display, ...patch };
	}

	function handlePhantomCommit(next: Phantom) {
		editablePhantom = next;
		selectedPoint = null;
		markAcquisitionStale('The editable phantom changed. Start a new scan to commit it.');
	}

	function handlePresetChange(nextPreset: PhantomPresetId, next: Phantom) {
		preset = nextPreset;
		editablePhantom = next;
		selectedPoint = null;
		markAcquisitionStale(
			`${presetLabel(nextPreset)} phantom selected. Start a new scan to apply it.`
		);
	}

	function handleSelectionChange(selection: PhantomSelection | null) {
		selectedPoint = selection;
	}

	function handleSinogramSelection(selection: SinogramSelection) {
		selectedDetector = Math.min(selection.detectorIndex, displayedDetectorCount - 1);
		if (!angles || selection.angleIndex >= angles.length) {
			currentProjection = null;
			return;
		}
		currentAngle = angles[selection.angleIndex];
		if (
			!sinogram ||
			!acquiredMask ||
			acquiredMask[selection.angleIndex] === 0 ||
			selection.angleIndex >= revealedRows
		) {
			currentProjection = null;
			return;
		}
		const offset = selection.angleIndex * scanDetectorCount;
		const row = sinogram.slice(offset, offset + scanDetectorCount);
		currentProjection = row.every((value) => Number.isFinite(value)) ? row : null;
	}

	function newNoiseRealisation() {
		acquisition = {
			...acquisition,
			seed: (Math.imul(acquisition.seed >>> 0, 1_664_525) + 1_013_904_223) >>> 0
		};
		markAcquisitionStale('A new deterministic noise seed is ready. Start a new scan to use it.');
	}

	function applyExperiment(experiment: ExperimentId) {
		clearBatchTimer();
		const interruptedInitialization = cancelPendingInitialization();
		if (playbackState === 'running') playbackState = 'paused';
		activeExperiment = experiment;
		const baselinePreset: PhantomPresetId = experiment === 'metal' ? 'metal' : DEFAULT_PRESET;
		preset = baselinePreset;
		editablePhantom = createPresetPhantom(baselinePreset, editablePhantom.size);
		selectedPoint = null;
		switch (experiment) {
			case 'few-views':
				acquisition = {
					...DEFAULT_ACQUISITION_SETTINGS,
					projectionCount: 18,
					detectorCount: 192,
					dose: 0.9,
					additionalNoise: 0
				};
				reconstruction = {
					...DEFAULT_RECONSTRUCTION_SETTINGS,
					filter: 'shepp-logan',
					cutoff: 1
				};
				break;
			case 'low-dose':
				acquisition = {
					...DEFAULT_ACQUISITION_SETTINGS,
					projectionCount: 180,
					detectorCount: 256,
					dose: 0,
					additionalNoise: 0
				};
				reconstruction = { ...DEFAULT_RECONSTRUCTION_SETTINGS, filter: 'ramp', cutoff: 1 };
				break;
			case 'missing-wedge':
				acquisition = {
					...DEFAULT_ACQUISITION_SETTINGS,
					projectionCount: 180,
					detectorCount: 192,
					dose: 0.55,
					missingAngleWidth: 60,
					missingAngleCenter: 90
				};
				reconstruction = {
					...DEFAULT_RECONSTRUCTION_SETTINGS,
					filter: 'shepp-logan',
					cutoff: 1
				};
				break;
			case 'metal':
				acquisition = {
					...DEFAULT_ACQUISITION_SETTINGS,
					projectionCount: 180,
					detectorCount: 256,
					dose: 0,
					additionalNoise: 0,
					metalArtifacts: true
				};
				reconstruction = {
					...DEFAULT_RECONSTRUCTION_SETTINGS,
					filter: 'shepp-logan',
					cutoff: 1
				};
				break;
			case 'detectors-vs-angles':
				acquisition = {
					...DEFAULT_ACQUISITION_SETTINGS,
					projectionCount: 18,
					detectorCount: 384,
					dose: 0.9,
					additionalNoise: 0
				};
				reconstruction = {
					...DEFAULT_RECONSTRUCTION_SETTINGS,
					filter: 'shepp-logan',
					cutoff: 1
				};
				break;
		}
		actualProjectionCount = countActualProjections(acquisition);
		selectedDetector = initialized
			? Math.min(selectedDetector, scanDetectorCount - 1)
			: Math.floor(acquisition.detectorCount / 2);
		stale = interruptedInitialization || initialized || acquiredProjectionCount > 0;
		liveMessage = `${experimentLabel(experiment)} experiment configured. Start a new scan when ready.`;
	}

	function handleWorkerMessage(response: CTWorkerResponse) {
		switch (response.type) {
			case 'READY': {
				initializing = false;
				initialized = true;
				scanProjectionCount = response.projectionCount;
				scanDetectorCount = response.detectorCount;
				actualProjectionCount = response.actualProjectionCount;
				angles = response.angles;
				acquiredMask = response.acquiredMask;
				const nextSinogram = new Float32Array(response.projectionCount * response.detectorCount);
				nextSinogram.fill(Number.NaN);
				sinogram = nextSinogram;
				selectedDetector = Math.floor(response.detectorCount / 2);
				batchInFlight = false;
				if (pendingSingleStep) {
					pendingSingleStep = false;
					playbackState = 'paused';
					stepping = true;
					requestBatch(1);
				} else if (pendingAutoplay) {
					pendingAutoplay = false;
					playbackState = 'running';
					scheduleNextBatch(true);
				} else {
					playbackState = 'ready';
				}
				break;
			}
			case 'BATCH': {
				batchInFlight = false;
				if (sinogram) {
					const next = new Float32Array(sinogram);
					for (let row = 0; row < response.rowIndices.length; row += 1) {
						const angleIndex = response.rowIndices[row];
						const sourceOffset = row * scanDetectorCount;
						next.set(
							response.rowValues.subarray(sourceOffset, sourceOffset + scanDetectorCount),
							angleIndex * scanDetectorCount
						);
					}
					sinogram = next;
				}
				progress = response.progress;
				acquiredProjectionCount = response.acquiredProjectionCount;
				actualProjectionCount = response.actualProjectionCount;
				revealedRows = Math.max(revealedRows, response.revealedThroughAngleIndex + 1);
				currentAngle = response.currentAngle;
				currentProjection = response.currentProjection;
				if (response.backprojection) backprojection = response.backprojection;
				if (response.filteredBackprojection) {
					filteredBackprojection = response.filteredBackprojection;
				}
				if (response.metrics) {
					backprojectionMetrics = response.metrics.backprojection;
					filteredMetrics = response.metrics.filteredBackprojection;
				}
				announceProgress(response.progress);
				if (response.complete) {
					clearBatchTimer();
					stepping = false;
					playbackState = 'complete';
					liveMessage = `Scan complete with ${response.acquiredProjectionCount} acquired projections.`;
				} else if (stepping) {
					stepping = false;
					playbackState = 'paused';
					liveMessage = `Advanced to projection ${response.acquiredProjectionCount} of ${response.actualProjectionCount}.`;
				} else if (playbackState === 'running') {
					scheduleNextBatch();
				}
				break;
			}
			case 'RECONSTRUCTED':
				backprojection = response.backprojection;
				filteredBackprojection = response.filteredBackprojection;
				if (response.metrics) {
					backprojectionMetrics = response.metrics.backprojection;
					filteredMetrics = response.metrics.filteredBackprojection;
				}
				liveMessage = `${FILTER_LABELS[response.reconstruction.filter]} reconstruction updated from the existing sinogram.`;
				break;
			case 'ERROR':
				initializing = false;
				batchInFlight = false;
				workerReady = false;
				handleFatalError(new Error(response.message));
				break;
			case 'CANCELLED':
				initializing = false;
				batchInFlight = false;
				break;
			case 'DISPOSED':
				break;
		}
	}

	function announceProgress(nextProgress: number) {
		const decile = Math.floor(nextProgress * 10);
		if (decile <= announcedDecile || decile >= 10) return;
		announcedDecile = decile;
		liveMessage = `Scan ${decile * 10}% complete. ${acquiredProjectionCount} projections acquired.`;
	}

	function handleFatalError(error: unknown) {
		clearBatchTimer();
		clearReconstructionTimer();
		initializing = false;
		pendingAutoplay = false;
		pendingSingleStep = false;
		errorMessage = error instanceof Error ? error.message : 'The numerical scan failed.';
		playbackState = 'error';
		batchInFlight = false;
		liveMessage = `Scan error. ${errorMessage}`;
	}

	function humanizeSetting(value: string) {
		return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
	}

	function presetLabel(value: PhantomPresetId) {
		return value.replace(/-/g, ' ');
	}

	function experimentLabel(value: ExperimentId) {
		return value.replace(/-/g, ' ');
	}

	async function toggleFullscreen(trigger: HTMLButtonElement) {
		if (!fullscreenAvailable) {
			liveMessage = 'Fullscreen is not available in this browser.';
			return;
		}
		lastFullscreenTrigger = document.fullscreenElement === shell ? fullscreenTrigger : trigger;
		try {
			if (document.fullscreenElement === shell) {
				fullscreenSettingsOpen = false;
				await document.exitFullscreen();
			} else await shell.requestFullscreen();
		} catch {
			liveMessage = 'Fullscreen could not be opened in this browser.';
		}
	}

	function updateFullscreenState() {
		const wasFullscreen = fullscreen;
		fullscreen = document.fullscreenElement === shell;
		if (!fullscreen) fullscreenSettingsOpen = false;
		if (wasFullscreen && !fullscreen && lastFullscreenTrigger) {
			const trigger = lastFullscreenTrigger;
			lastFullscreenTrigger = null;
			requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
		}
	}

	function runFullscreenPrimaryAction() {
		if (playbackState === 'running') {
			pauseScan();
			return;
		}
		if (playbackState === 'paused' && !stale) {
			resumeScan();
			return;
		}
		startScan();
	}

	function openFullscreenSettings() {
		fullscreenSettingsOpen = true;
		requestAnimationFrame(() => fullscreenSettingsClose?.focus({ preventScroll: true }));
	}

	function closeFullscreenSettings(restoreFocus = true) {
		if (!fullscreenSettingsOpen) return;
		fullscreenSettingsOpen = false;
		if (restoreFocus) {
			requestAnimationFrame(() => fullscreenSettingsTrigger?.focus({ preventScroll: true }));
		}
	}

	function handleLaboratoryKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !fullscreen || !fullscreenSettingsOpen) return;
		event.preventDefault();
		event.stopPropagation();
		closeFullscreenSettings();
	}

	function disconnectWorker() {
		unsubscribeWorker?.();
		unsubscribeWorker = null;
		try {
			client?.dispose();
		} catch {
			// The Worker may already have failed; termination in dispose remains idempotent.
		}
		client = null;
		workerReady = false;
	}

	function connectWorker(): boolean {
		disconnectWorker();
		try {
			client = createCTWorkerClient();
			unsubscribeWorker = client.subscribe(handleWorkerMessage);
			workerReady = true;
			errorMessage = '';
			return true;
		} catch (error) {
			handleFatalError(error);
			return false;
		}
	}

	onMount(() => {
		const canvas = document.createElement('canvas');
		if (!canvas.getContext('2d')) {
			handleFatalError(new Error('Canvas rendering is unavailable in this browser.'));
			return;
		}
		if (connectWorker()) {
			playbackState = 'ready';
		}

		fullscreenAvailable =
			document.fullscreenEnabled && typeof shell.requestFullscreen === 'function';
		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motionQuery?.matches ?? false;
			if (reducedMotion && playbackState === 'running') {
				clearBatchTimer();
				scheduleNextBatch();
			}
		};
		const handleVisibility = () => {
			if (document.hidden && playbackState === 'running') pauseScan();
		};
		updateMotion();
		motionQuery.addEventListener('change', updateMotion);
		document.addEventListener('fullscreenchange', updateFullscreenState);
		document.addEventListener('visibilitychange', handleVisibility);

		if (
			window.innerWidth <= 480 &&
			acquisition.projectionCount === DEFAULT_ACQUISITION_SETTINGS.projectionCount
		) {
			acquisition = { ...acquisition, projectionCount: 120, detectorCount: 192 };
			actualProjectionCount = countActualProjections(acquisition);
			selectedDetector = Math.floor(acquisition.detectorCount / 2);
			liveMessage = 'Mobile-friendly projection defaults are ready.';
		}

		return () => {
			clearBatchTimer();
			clearReconstructionTimer();
			disconnectWorker();
			motionQuery?.removeEventListener('change', updateMotion);
			document.removeEventListener('fullscreenchange', updateFullscreenState);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<svelte:window onkeydown={handleLaboratoryKeydown} />

<section
	bind:this={shell}
	class="ct-laboratory article-breakout not-prose"
	class:settings-open={fullscreenSettingsOpen}
	aria-labelledby="ct-laboratory-heading"
	data-tts-exclude
>
	<div class="fullscreen-toolbar" aria-label="Fullscreen laboratory controls">
		<div class="fullscreen-identity">
			<span>CT laboratory</span>
			<strong>How a scanner sees</strong>
		</div>
		<div class="fullscreen-progress">
			<div>
				<span aria-live="polite" title={errorMessage || undefined}>{fullscreenStatusLabel}</span>
				<output>{acquiredProjectionCount}/{actualProjectionCount} views</output>
			</div>
			<progress
				max="1"
				value={progress}
				aria-label={`Scan progress: ${Math.round(progress * 100)}%`}
			>
				{Math.round(progress * 100)}%
			</progress>
		</div>
		<div class="fullscreen-actions">
			<button
				type="button"
				class="primary"
				disabled={!workerReady}
				onclick={runFullscreenPrimaryAction}
			>
				{fullscreenPrimaryLabel}
			</button>
			<button
				type="button"
				disabled={!workerReady || playbackState === 'running'}
				onclick={singleStep}>Step</button
			>
			<button
				type="button"
				class:recovery={fullscreenNeedsRecovery}
				onclick={() => (fullscreenNeedsRecovery ? resetLaboratory() : restartScan())}
			>
				{fullscreenNeedsRecovery ? 'Reconnect' : 'Restart'}
			</button>
			<button
				bind:this={fullscreenSettingsTrigger}
				type="button"
				aria-controls="ct-fullscreen-settings"
				aria-expanded={fullscreenSettingsOpen}
				onclick={openFullscreenSettings}
			>
				Settings
			</button>
			<button type="button" class="exit" onclick={(event) => toggleFullscreen(event.currentTarget)}>
				Exit
			</button>
		</div>
	</div>

	<header class="lab-header">
		<div>
			<p class="kicker">Interactive · Parallel-beam reconstruction</p>
			<h2 id="ct-laboratory-heading">How a scanner sees</h2>
			<p class="subtitle">One ray, one number; many angles, one synthetic cross-section.</p>
		</div>
		<button
			bind:this={fullscreenTrigger}
			type="button"
			class="open-lab"
			disabled={!fullscreenAvailable}
			title={!fullscreenAvailable ? 'Fullscreen is unavailable in this browser.' : undefined}
			onclick={(event) => toggleFullscreen(event.currentTarget)}
		>
			{fullscreen ? 'Exit laboratory' : 'Open laboratory'}
		</button>
	</header>

	<ol class="workflow" aria-label="CT reconstruction workflow">
		<li class:active={playbackState === 'ready' || playbackState === 'idle'}>
			<span>1</span><strong>Shape</strong><small>edit μ(x,y)</small>
		</li>
		<li class:active={playbackState === 'running' || playbackState === 'paused'}>
			<span>2</span><strong>Measure</strong><small>trace parallel rays</small>
		</li>
		<li class:active={acquiredProjectionCount > 0 && playbackState !== 'complete'}>
			<span>3</span><strong>Stack</strong><small>build the sinogram</small>
		</li>
		<li class:active={playbackState === 'complete'}>
			<span>4</span><strong>Reconstruct</strong><small>back-project + filter</small>
		</li>
	</ol>

	<div class="status-strip">
		<p>{stateDescription}</p>
		<span
			>{acquisition.projectionCount} nominal views · {acquisition.detectorCount} bins ·
			{filterLabel}</span
		>
	</div>
	<p class="sr-live" aria-live="polite" aria-atomic="true">{liveMessage}</p>

	<div class="laboratory-body">
		<div class="transport-region">
			<CTControls
				mode="transport"
				headingId="ct-transport-controls-heading"
				{acquisition}
				{reconstruction}
				{playbackState}
				{playbackSpeed}
				{progress}
				{actualProjectionCount}
				{acquiredProjectionCount}
				{stale}
				{workerReady}
				autoWindow={display.autoWindow}
				windowCenter={display.windowCenter}
				windowWidth={display.windowWidth}
				zoom={display.zoom}
				{errorMessage}
				onacquisitionchange={changeAcquisition}
				onreconstructionchange={changeReconstruction}
				onspeedchange={(value) => (playbackSpeed = value)}
				onstart={startScan}
				onpause={pauseScan}
				onresume={resumeScan}
				onstep={singleStep}
				onrestart={restartScan}
				onreset={resetLaboratory}
				onnewnoise={newNoiseRealisation}
				onwindowchange={changeDisplay}
			/>
		</div>

		<div
			class="workbench"
			aria-hidden={fullscreen && fullscreenSettingsOpen ? 'true' : undefined}
			inert={fullscreen && fullscreenSettingsOpen}
		>
			<div class="stage-section measurement-stage">
				<div class="measurement-layout">
					<PhantomEditor
						phantom={editablePhantom}
						{preset}
						disabled={playbackState === 'error'}
						onphantomcommit={handlePhantomCommit}
						onpresetchange={handlePresetChange}
						onselectionchange={handleSelectionChange}
					/>
					<div class="measurement-column">
						<AcquisitionView
							materials={committedPhantom.materials}
							gridSize={committedPhantom.size}
							angleRad={currentAngle}
							projection={currentProjection}
							detectorCount={displayedDetectorCount}
							{selectedDetector}
							acquired={currentProjection !== null}
						/>
						<SinogramView
							{sinogram}
							projectionCount={displayedProjectionCount}
							detectorCount={displayedDetectorCount}
							{acquiredMask}
							completedRows={revealedRows}
							selectedPoint={selectedPoint ? { x: selectedPoint.x, y: selectedPoint.y } : null}
							onselect={handleSinogramSelection}
						/>
					</div>
				</div>
			</div>

			<div class="stage-section reconstruction-stage">
				<ReconstructionComparison
					{groundTruth}
					{backprojection}
					{filteredBackprojection}
					size={reconstruction.imageSize ?? committedPhantom.size}
					{filterLabel}
					partial={acquiredProjectionCount > 0 && playbackState !== 'complete'}
					{progress}
					{backprojectionMetrics}
					{filteredMetrics}
					autoWindow={display.autoWindow}
					windowCenter={display.windowCenter}
					windowWidth={display.windowWidth}
					zoom={display.zoom}
				/>
			</div>

			<div class="stage-section experiment-stage">
				<ExperimentGuides onapply={applyExperiment} active={activeExperiment} />
			</div>
		</div>

		<div
			id="ct-fullscreen-settings"
			class="advanced-region"
			aria-hidden={fullscreen && !fullscreenSettingsOpen ? 'true' : undefined}
			inert={fullscreen && !fullscreenSettingsOpen}
		>
			<div class="settings-drawer-header">
				<div>
					<p>Laboratory console</p>
					<h3>Advanced settings</h3>
				</div>
				<button
					bind:this={fullscreenSettingsClose}
					type="button"
					onclick={() => closeFullscreenSettings()}>Close</button
				>
			</div>
			<CTControls
				mode="settings"
				headingId="ct-advanced-controls-heading"
				{acquisition}
				{reconstruction}
				{playbackState}
				{playbackSpeed}
				{progress}
				{actualProjectionCount}
				{acquiredProjectionCount}
				{stale}
				{workerReady}
				autoWindow={display.autoWindow}
				windowCenter={display.windowCenter}
				windowWidth={display.windowWidth}
				zoom={display.zoom}
				{errorMessage}
				onacquisitionchange={changeAcquisition}
				onreconstructionchange={changeReconstruction}
				onspeedchange={(value) => (playbackSpeed = value)}
				onstart={startScan}
				onpause={pauseScan}
				onresume={resumeScan}
				onstep={singleStep}
				onrestart={restartScan}
				onreset={resetLaboratory}
				onnewnoise={newNoiseRealisation}
				onwindowchange={changeDisplay}
			/>
		</div>

		<button
			type="button"
			class="settings-scrim"
			aria-label="Close advanced settings"
			aria-hidden={!fullscreenSettingsOpen}
			tabindex="-1"
			onclick={() => closeFullscreenSettings()}
		></button>
	</div>

	<footer class="lab-footer">
		<p>
			<strong>Educational model.</strong> Synthetic shapes only. Relative dose, illustrative attenuation,
			simplified spectrum. Not for diagnosis or scanner protocol decisions.
		</p>
		<p>
			Unique parallel-beam information occupies 180°: another half-turn repeats the same lines in
			reverse.
		</p>
	</footer>

	<noscript>
		<p class="noscript">
			JavaScript is disabled. The explanatory article remains available, but the numerical CT
			laboratory needs browser scripting to run its local Worker and canvases.
		</p>
	</noscript>
</section>

<style>
	.ct-laboratory {
		position: relative;
		container-name: ct-lab;
		container-type: inline-size;
		width: min(88rem, calc(100vw - 1rem));
		margin-block: 2rem 2.75rem;
		transform: translateX(-50%);
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.9rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: var(--shadow-overlay);
		--ct-accent: var(--accent);
	}
	.fullscreen-toolbar {
		display: none;
	}
	.lab-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.9rem 1rem;
	}
	.lab-header p,
	.lab-header h2,
	.status-strip p,
	.lab-footer p,
	.noscript {
		margin: 0;
	}
	.kicker {
		margin-bottom: 0.18rem !important;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.lab-header h2 {
		font-size: clamp(1.1rem, 2vw, 1.45rem);
		line-height: 1.1;
		color: var(--ink);
	}
	.subtitle {
		margin-top: 0.25rem !important;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--ink-muted);
	}
	button {
		font: inherit;
	}
	.open-lab {
		min-height: 2.75rem;
		flex: none;
		border: 1px solid var(--accent);
		border-radius: 0.48rem;
		background: var(--accent);
		padding: 0.5rem 0.8rem;
		font-size: 0.8125rem;
		font-weight: 800;
		color: var(--accent-foreground);
		cursor: pointer;
	}
	.open-lab:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.workflow {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0;
		list-style: none;
	}
	.workflow li {
		display: grid;
		grid-template-columns: 1.55rem 1fr;
		grid-template-rows: auto auto;
		column-gap: 0.45rem;
		min-height: 3.65rem;
		align-content: center;
		border-right: 1px solid var(--rule);
		padding: 0.48rem 0.65rem;
		color: var(--ink-muted);
	}
	.workflow li:last-child {
		border-right: 0;
	}
	.workflow li.active {
		box-shadow: inset 0 -3px 0 var(--accent);
		color: var(--ink);
	}
	.workflow span {
		display: grid;
		grid-row: 1 / 3;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		align-self: center;
		border: 1px solid var(--control-border);
		border-radius: 50%;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}
	.workflow strong {
		font-size: 0.8125rem;
	}
	.workflow small {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--ink-muted);
	}
	.status-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem 0.85rem;
		background: var(--paper-raised);
	}
	.status-strip p {
		max-width: 60rem;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--ink);
	}
	.status-strip span {
		flex: none;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--ink-muted);
	}
	.sr-live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.laboratory-body {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem);
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.8rem;
		min-width: 0;
		padding: 0.8rem;
	}
	.workbench {
		display: grid;
		grid-column: 1;
		grid-row: 1 / span 2;
		min-width: 0;
		gap: 0.8rem;
	}
	.stage-section,
	.stage-section > :global(*) {
		min-width: 0;
	}
	.transport-region {
		grid-column: 2;
		grid-row: 1;
	}
	.advanced-region {
		grid-column: 2;
		grid-row: 2;
		align-self: start;
		min-width: 0;
	}
	.settings-drawer-header,
	.settings-scrim {
		display: none;
	}
	.measurement-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(16rem, 1fr);
		gap: 0.8rem;
		min-width: 0;
		align-items: start;
	}
	.measurement-layout > :global(*) {
		min-width: 0;
	}
	.measurement-column {
		display: grid;
		min-width: 0;
		gap: 0.8rem;
	}
	.lab-footer {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.75rem 0.9rem;
	}
	.lab-footer p {
		max-width: 48rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	.noscript {
		border-top: 1px solid var(--rule);
		padding: 0.8rem;
		font-size: 0.8125rem;
		color: var(--ink);
	}
	.ct-laboratory :global(.controls button),
	.ct-laboratory :global(.controls select),
	.ct-laboratory :global(.controls summary),
	.ct-laboratory :global(.controls .progress-block > div),
	.ct-laboratory :global(.controls .range-field),
	.ct-laboratory :global(.controls .select-field),
	.ct-laboratory :global(.controls .checkbox-field) {
		font-size: 0.8125rem;
	}
	.ct-laboratory :global(.controls small),
	.ct-laboratory :global(.controls summary span),
	.ct-laboratory :global(.controls .control-header p),
	.ct-laboratory :global(.controls .control-header > span),
	.ct-laboratory :global(.controls .seed-field) {
		font-size: 0.75rem;
	}
	@container ct-lab (max-width: 80rem) {
		.laboratory-body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: none;
		}
		.transport-region,
		.advanced-region,
		.workbench {
			grid-column: 1;
			grid-row: auto;
		}
		.transport-region {
			order: 1;
		}
		.workbench {
			order: 10;
		}
		.advanced-region {
			order: 20;
		}
	}

	@container ct-lab (max-width: 56.25rem) {
		.measurement-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.measurement-column {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@container ct-lab (max-width: 43.75rem) {
		.advanced-region :global(.field-grid) {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 640px) {
		.ct-laboratory {
			width: calc(100vw - 0.5rem);
			border-radius: 0.55rem;
		}
		.lab-header,
		.status-strip,
		.lab-footer {
			align-items: start;
			flex-direction: column;
		}
		.open-lab {
			width: 100%;
		}
		.workflow {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.workflow li:nth-child(2) {
			border-right: 0;
		}
		.workflow li:nth-child(-n + 2) {
			border-bottom: 1px solid var(--rule);
		}
		.status-strip span {
			white-space: normal;
		}
		.laboratory-body {
			padding: 0.45rem;
		}
		.measurement-column {
			grid-template-columns: 1fr;
		}
	}

	.ct-laboratory:fullscreen {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 100vw;
		height: 100dvh;
		margin: 0;
		overflow: hidden;
		border: 0;
		border-radius: 0;
		padding: 0 0 env(safe-area-inset-bottom);
		background: var(--paper);
		transform: none;
	}
	.ct-laboratory:fullscreen .lab-header,
	.ct-laboratory:fullscreen .workflow,
	.ct-laboratory:fullscreen .status-strip,
	.ct-laboratory:fullscreen .lab-footer {
		display: none;
	}
	.ct-laboratory:fullscreen .fullscreen-toolbar {
		position: sticky;
		z-index: 10;
		top: 0;
		display: grid;
		grid-template-columns: minmax(10rem, 0.8fr) minmax(13rem, 1fr) auto;
		align-items: center;
		gap: 0.9rem;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: calc(0.55rem + env(safe-area-inset-top)) 0.75rem 0.55rem;
		box-shadow: 0 0.3rem 1rem color-mix(in oklab, var(--ink) 10%, transparent);
	}
	.fullscreen-identity {
		display: grid;
		min-width: 0;
		line-height: 1.15;
	}
	.fullscreen-identity span {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.fullscreen-identity strong {
		overflow: hidden;
		font-size: 0.9375rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fullscreen-progress {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.fullscreen-progress > div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.8125rem;
	}
	.fullscreen-progress span {
		min-width: 0;
		overflow: hidden;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fullscreen-progress output {
		font-family: ui-monospace, monospace;
		color: var(--ink-muted);
	}
	.fullscreen-progress progress {
		width: 100%;
		height: 0.55rem;
		accent-color: var(--accent);
	}
	.fullscreen-actions {
		display: flex;
		gap: 0.4rem;
	}
	.fullscreen-actions button {
		min-height: 2.65rem;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.45rem 0.65rem;
		font-size: 0.8125rem;
		font-weight: 750;
		color: var(--ink);
		cursor: pointer;
	}
	.fullscreen-actions button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.fullscreen-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	.fullscreen-actions button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}
	.fullscreen-actions button.recovery {
		border-color: var(--accent);
		color: var(--accent);
	}
	.fullscreen-actions button.exit {
		border-color: var(--accent);
	}
	.ct-laboratory:fullscreen .laboratory-body {
		display: block;
		min-height: 0;
		overflow: hidden;
		padding: 0.8rem;
	}
	.ct-laboratory:fullscreen .workbench {
		display: grid;
		height: 100%;
		min-height: 0;
		align-content: start;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 0.2rem;
		scrollbar-gutter: stable;
	}
	.ct-laboratory:fullscreen .advanced-region {
		position: absolute;
		z-index: 5;
		top: 0;
		right: 0;
		bottom: 0;
		display: block;
		width: min(25rem, calc(100% - 3rem));
		overflow-y: auto;
		overscroll-behavior: contain;
		border-left: 1px solid var(--rule);
		background: var(--paper-raised);
		box-shadow: -0.5rem 0 1.5rem color-mix(in oklab, var(--ink) 18%, transparent);
		transform: translateX(calc(100% + 1.6rem));
		visibility: hidden;
		transition:
			transform 180ms ease,
			visibility 0s linear 180ms;
	}
	.ct-laboratory:fullscreen.settings-open .advanced-region {
		transform: translateX(0);
		visibility: visible;
		transition-delay: 0s;
	}
	.ct-laboratory:fullscreen .transport-region {
		display: none;
	}
	.ct-laboratory:fullscreen .advanced-region :global(.controls) {
		display: block;
		overflow: visible;
		border: 0;
		border-radius: 0;
	}
	.ct-laboratory:fullscreen .advanced-region :global(.control-header),
	.ct-laboratory:fullscreen .advanced-region :global(.transport),
	.ct-laboratory:fullscreen .advanced-region :global(.progress-block) {
		display: none;
	}
	.ct-laboratory:fullscreen .advanced-region :global(details) {
		overflow: visible;
		border: 0;
		border-bottom: 1px solid var(--rule);
		border-radius: 0;
	}
	.ct-laboratory:fullscreen .advanced-region :global(.field-grid) {
		grid-template-columns: minmax(0, 1fr);
	}
	.ct-laboratory:fullscreen .settings-drawer-header {
		position: sticky;
		z-index: 1;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.7rem 0.8rem;
	}
	.ct-laboratory:fullscreen .settings-drawer-header p,
	.ct-laboratory:fullscreen .settings-drawer-header h3 {
		margin: 0;
	}
	.ct-laboratory:fullscreen .settings-drawer-header p {
		margin-bottom: 0.12rem;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.ct-laboratory:fullscreen .settings-drawer-header h3 {
		font-size: 1rem;
	}
	.ct-laboratory:fullscreen .settings-drawer-header button {
		display: block;
		min-height: 2.65rem;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.45rem 0.7rem;
		font-size: 0.8125rem;
		font-weight: 750;
		color: var(--ink);
		cursor: pointer;
	}
	.ct-laboratory:fullscreen .settings-scrim {
		position: absolute;
		z-index: 4;
		inset: 0;
		display: block;
		border: 0;
		background: color-mix(in oklab, var(--ink) 28%, transparent);
		opacity: 0;
		pointer-events: none;
		transition: opacity 180ms ease;
	}
	.ct-laboratory:fullscreen.settings-open .settings-scrim {
		opacity: 1;
		pointer-events: auto;
	}

	@container ct-lab (max-width: 58rem) {
		.ct-laboratory:fullscreen .fullscreen-toolbar {
			grid-template-columns: minmax(9rem, 0.55fr) minmax(12rem, 1fr);
		}
		.ct-laboratory:fullscreen .fullscreen-actions {
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}

	@container ct-lab (max-width: 48rem) {
		.ct-laboratory:fullscreen .fullscreen-toolbar {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.45rem;
			padding-inline: 0.45rem;
		}
		.ct-laboratory:fullscreen .fullscreen-identity {
			display: none;
		}
		.ct-laboratory:fullscreen .fullscreen-actions {
			grid-column: 1;
		}
		.ct-laboratory:fullscreen .fullscreen-actions button {
			min-width: 0;
			min-height: 2.5rem;
			padding-inline: 0.3rem;
			font-size: 0.8125rem;
		}
		.ct-laboratory:fullscreen .laboratory-body {
			padding: 0.45rem;
		}
		.ct-laboratory:fullscreen .advanced-region {
			top: auto;
			left: 0;
			width: 100%;
			max-height: min(72dvh, 42rem);
			border-top: 1px solid var(--rule);
			border-left: 0;
			border-radius: 0.85rem 0.85rem 0 0;
			box-shadow: 0 -0.5rem 1.5rem color-mix(in oklab, var(--ink) 18%, transparent);
			transform: translateY(calc(100% + 1.6rem));
		}
		.ct-laboratory:fullscreen.settings-open .advanced-region {
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ct-laboratory *,
		.ct-laboratory *::before,
		.ct-laboratory *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
	@media (forced-colors: active) {
		.ct-laboratory,
		.lab-header,
		.workflow,
		.workflow li,
		.status-strip,
		.lab-footer,
		.open-lab {
			border-color: CanvasText;
		}
	}
</style>
