<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import RotaryControl from './RotaryControl.svelte';
	import WaveformCanvas from './WaveformCanvas.svelte';
	import {
		EXPORT_PRESETS,
		RECORDING_MODES,
		type ActiveRecordingSessionJournal,
		type CaptureTrackDiagnostics,
		type ExportFormat,
		type ExportPresetId,
		type ExportResult,
		type MicrophoneDeviceOption,
		type NeuralModelStatus,
		type RecorderState,
		type RecorderView,
		type RecordingMetadata,
		type RecordingMode,
		type StorageStatusSummary
	} from '$lib/recorder/types';
	import {
		enumerateAudioInputsSafe,
		formatCaptureError,
		importExternalAudioFile,
		RecorderCaptureController,
		type LiveMeterSnapshot
	} from '$lib/recorder/capture';
	import {
		analyzeAudioBuffer,
		dbToLinear,
		enhanceAudioBuffer,
		extractRepresentativePreview
	} from '$lib/recorder/dsp';
	import {
		applySilenceShorteningToRecipe,
		applyTrimToRecipe,
		buildWaveformSummary,
		cutTimelineSelection,
		detectSilenceIntervals,
		getEditedTimelineDurationSec,
		joinRecordingToRecipe,
		pushRecipeHistory,
		redoRecipe,
		renderEditedAudio,
		resetRecipeToOriginal,
		splitTimelineAt,
		undoRecipe
	} from '$lib/recorder/editor';
	import { estimateExportSizeBytes, exportRecordingMedia } from '$lib/recorder/mp4-encoder';
	import {
		downloadAndCacheNeuralModel,
		getNeuralModelStatus,
		removeCachedNeuralModel
	} from '$lib/recorder/neural-weights';
	import {
		exportProjectBackupZip,
		findRecoverableSessions,
		getStorageStatus,
		importProjectBackupZip,
		listAllRecordings,
		loadDecodedPcmSnapshot,
		permanentlyDeleteRecording,
		recoverInterruptedSession,
		restoreDeletedRecording,
		softDeleteRecording,
		updateRecordingMetadata,
		verifyOriginalIntegrity
	} from '$lib/recorder/storage';
	import { createWorkedExampleRecording } from '$lib/recorder/demo-samples';

	// Primary Navigation & Recorder State
	let activeView: RecorderView = 'record';
	let recorderState: RecorderState = 'ready';
	let statusAnnouncement = 'Recorder ready. Record something. Make it clearer. Keep it.';

	// Capture configuration
	let recordingTitle = 'Speech Note';
	let selectedMode: RecordingMode = 'speech';
	let selectedChannels: 1 | 2 = 1;
	let selectedDeviceId = 'default';
	let microphones: MicrophoneDeviceOption[] = [];
	let useCountdown = false;
	let liveMonitoring = false;
	let captureDiagnostics: CaptureTrackDiagnostics | null = null;
	let captureError: ReturnType<typeof formatCaptureError> | null = null;
	let interruptionNotice: string | null = null;

	// Live meters & timers during Record / Test
	let liveMeter: LiveMeterSnapshot = {
		rmsDbfs: -96,
		peakDbfs: -96,
		clipping: false,
		waveformColumnPeak: 0
	};
	let liveWaveformPeaks: number[] = Array.from({ length: 96 }, () => 0);
	let liveWaveformRms: number[] = Array.from({ length: 96 }, () => 0);
	let capturedMs = 0;
	let pausedMs = 0;
	let interruptionGapMs = 0;
	let committedChunks = 0;
	let committedBytes = 0;
	let bookmarkDraftLabel = '';

	// Library & Storage State
	let library: RecordingMetadata[] = [];
	let deletedLibrary: RecordingMetadata[] = [];
	let lastDeletedRecording: RecordingMetadata | null = null;
	let searchQuery = '';
	let filterMode: 'all' | RecordingMode = 'all';
	let filterFavouritesOnly = false;
	let sortOrder: 'newest' | 'oldest' | 'longest' | 'title' = 'newest';
	let storageStatus: StorageStatusSummary = {
		backend: 'indexeddb',
		persisted: false,
		usedBytes: 0,
		quotaBytes: 512 * 1024 * 1024,
		usageRatio: 0,
		isLowQuota: false,
		isCriticalQuota: false
	};
	let recoverableSessions: {
		journal: ActiveRecordingSessionJournal;
		recoverableDurationSec: number;
		droppedTrailingChunks: number;
	}[] = [];

	// Active Editing Session State
	let currentRecording: RecordingMetadata | null = null;
	let originalChannelData: Float32Array[] = [];
	let renderedOriginalChannels: Float32Array[] = [];
	let renderedEnhancedChannels: Float32Array[] = [];
	let secondaryRecordingsMap = new Map<string, Float32Array[]>();
	let originalIntegrityVerified: boolean | null = null;
	let originalIntegrityHash = '';

	// Playback & A/B Comparison State
	let isPlaying = false;
	let playheadSec = 0;
	let playbackRate = 1.0;
	let comparisonMode: 'original' | 'improved' = 'improved';
	let matchComparisonLoudness = true;
	let matchedLoudnessGainDb = 0;
	let matchedLoudnessGainLinear = 1;
	let waveformZoom = 1;
	let waveformScrollRatio = 0;

	// Processing & Neural Model State
	let isProcessingSound = false;
	let processingProgress = 0;
	let cancelProcessingFlag = false;
	let previewBannerText: string | null = null;
	let neuralModelStatus: NeuralModelStatus = {
		id: 'suvro-speech-gru-v1',
		name: 'Bark-GRU Local Speech Enhancer v1',
		version: '1.0.0',
		sizeBytes: 147_456,
		assetPath: '/downloads/recorder-neural-speech-v1.bin',
		state: 'not-downloaded',
		cachedBytes: 0
	};

	// Non-destructive Editing Helpers
	let joinCandidateId = '';
	let silencePreviewActive = false;
	let silenceTotalSavedSec = 0;
	let newTagInput = '';

	// Export State
	let selectedExportFormat: ExportFormat = 'mp4-audio';
	let selectedPresetId: ExportPresetId = 'standard-speech';
	let isExporting = false;
	let exportProgress = 0;
	let lastExportResult: ExportResult | null = null;
	let exportErrorMessage: string | null = null;

	// Web Audio Playback Engine
	let playbackCtx: AudioContext | null = null;
	let playbackSource: AudioBufferSourceNode | null = null;
	let playbackGainNode: GainNode | null = null;
	let playbackStartedAtCtxTime = 0;
	let playbackStartOffsetSec = 0;
	let playbackRafId: number | null = null;

	let captureController: RecorderCaptureController | null = null;
	let fileImportInput: HTMLInputElement | null = null;

	function announce(msg: string) {
		statusAnnouncement = msg;
	}

	function formatTimecode(sec: number, showTenths = true): string {
		const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
		const hrs = Math.floor(safe / 3600);
		const mins = Math.floor((safe % 3600) / 60);
		const secs = Math.floor(safe % 60);
		const tenths = Math.floor((safe - Math.floor(safe)) * 10);
		const hh = String(hrs).padStart(2, '0');
		const mm = String(mins).padStart(2, '0');
		const ss = String(secs).padStart(2, '0');
		return showTenths ? `${hh}:${mm}:${ss}.${tenths}` : `${hh}:${mm}:${ss}`;
	}

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	async function refreshLibraryAndStorage() {
		const all = await listAllRecordings({ includeDeleted: true });
		library = all.filter((r) => r.deletedAt === null);
		deletedLibrary = all.filter((r) => r.deletedAt !== null);
		storageStatus = await getStorageStatus();
		const recSessions = await findRecoverableSessions();
		recoverableSessions = recSessions.map((r) => ({
			journal: r.journal,
			recoverableDurationSec: r.recoverableDurationSec,
			droppedTrailingChunks: r.droppedTrailingChunks
		}));
	}

	onMount(() => {
		captureController = new RecorderCaptureController({
			onStateChange: (nextState) => {
				recorderState = nextState;
				if (nextState === 'recording') {
					announce('Recording in progress.');
				} else if (nextState === 'paused') {
					announce('Recording paused.');
				} else if (nextState === 'saving') {
					announce('Committing recording to local storage.');
				} else if (nextState === 'saved') {
					announce('Recording saved and verified.');
				}
			},
			onMeterUpdate: (meter) => {
				liveMeter = meter;
				if (recorderState === 'recording' || recorderState === 'testing-mic') {
					liveWaveformPeaks = [...liveWaveformPeaks.slice(1), meter.waveformColumnPeak];
					liveWaveformRms = [
						...liveWaveformRms.slice(1),
						Math.max(0, meter.waveformColumnPeak * 0.65)
					];
				}
			},
			onTimerUpdate: (timing) => {
				capturedMs = timing.capturedMs;
				pausedMs = timing.pausedMs;
				interruptionGapMs = timing.interruptionGapMs;
				committedChunks = timing.committedChunks;
				committedBytes = timing.committedBytes;
			},
			onDiagnostics: (diag) => {
				captureDiagnostics = diag;
			},
			onError: (err) => {
				captureError = err;
				announce(`${err.title}: ${err.message}`);
			},
			onInterruption: (reason) => {
				interruptionNotice = reason;
				announce(`Recording interrupted: ${reason}`);
			}
		});

		void (async () => {
			await refreshLibraryAndStorage();
			neuralModelStatus = await getNeuralModelStatus();
		})();

		// Prevent accidental page reload during active recording
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (recorderState === 'recording' || recorderState === 'paused' || recorderState === 'saving') {
				event.preventDefault();
				event.returnValue = 'A recording is currently active.';
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	onDestroy(() => {
		stopPlayback();
		void captureController?.destroy();
		if (playbackCtx) {
			void playbackCtx.close();
			playbackCtx = null;
		}
	});

	// Mode changes update default channel count & preset
	function selectRecordingMode(mode: RecordingMode) {
		selectedMode = mode;
		const spec = RECORDING_MODES[mode];
		selectedChannels = spec.defaultChannels;
		selectedPresetId = spec.defaultPreset;
	}

	async function handleTestMicrophone() {
		captureError = null;
		if (recorderState === 'testing-mic') {
			await captureController?.stopMicrophoneTest();
			liveMeter = { rmsDbfs: -96, peakDbfs: -96, clipping: false, waveformColumnPeak: 0 };
			return;
		}
		const devices = await captureController?.startMicrophoneTest({
			deviceId: selectedDeviceId,
			mode: selectedMode,
			channels: selectedChannels
		});
		if (devices && devices.length > 0) {
			microphones = devices;
		}
	}

	async function handleStartRecording() {
		captureError = null;
		interruptionNotice = null;
		liveWaveformPeaks = Array.from({ length: 96 }, () => 0);
		liveWaveformRms = Array.from({ length: 96 }, () => 0);
		capturedMs = 0;
		pausedMs = 0;
		interruptionGapMs = 0;
		committedChunks = 0;
		committedBytes = 0;

		const started = await captureController?.startRecording({
			title: recordingTitle,
			mode: selectedMode,
			channels: selectedChannels,
			deviceId: selectedDeviceId,
			countdownSec: useCountdown ? 3 : 0,
			monitoring: liveMonitoring
		});

		if (started) {
			const devices = await enumerateAudioInputsSafe();
			if (devices.length > 0) microphones = devices;
		}
	}

	function handlePauseOrResume() {
		if (recorderState === 'recording') {
			captureController?.pauseRecording();
		} else if (recorderState === 'paused') {
			captureController?.resumeRecording();
		}
	}

	function handleAddLiveBookmark() {
		const bm = captureController?.addBookmark(bookmarkDraftLabel);
		if (bm) {
			bookmarkDraftLabel = '';
			announce(`Added bookmark ${bm.label} at ${bm.timeSec.toFixed(1)} seconds.`);
		}
	}

	async function handleStopAndSave() {
		stopPlayback();
		const saved = await captureController?.stopAndSave(recordingTitle);
		if (saved) {
			await refreshLibraryAndStorage();
			await openRecordingInEditor(saved.metadata, saved.channelData);
		}
	}

	async function handleLoadWorkedExample(mode: RecordingMode = 'speech') {
		stopPlayback();
		captureError = null;
		const demo = await createWorkedExampleRecording(mode);
		await refreshLibraryAndStorage();
		await openRecordingInEditor(demo.metadata, demo.channelData);
		if (demo.metadata.status !== 'saved') {
			recorderState = 'error';
			captureError = {
				code: 'unknown',
				title: 'Browser storage failed — Recording is NOT saved',
				message:
					'Browser storage (OPFS and IndexedDB) could not save this recording to disk.',
				recoveryHint:
					'Your audio is held only in temporary memory and will disappear if you reload this page. Export MP4 or WAV immediately to save a copy to your device.'
			};
			announce(
				'Warning: Browser storage failed. Recording is in temporary memory only and will disappear if reloaded.'
			);
		} else {
			announce(
				`Loaded worked example: "${demo.metadata.title}". Click "Improve sound" to reduce fan noise and balance vocal clarity.`
			);
		}
	}

	async function handleRecoverSession(sessionId: string) {
		const recovered = await recoverInterruptedSession(sessionId);
		await refreshLibraryAndStorage();
		if (recovered) {
			await openRecordingInEditor(recovered);
			announce(`Recovered interrupted recording "${recovered.title}".`);
		}
	}

	async function openRecordingInEditor(
		meta: RecordingMetadata,
		preloadedChannels?: Float32Array[]
	) {
		stopPlayback();
		lastExportResult = null;
		exportErrorMessage = null;
		previewBannerText = null;
		silencePreviewActive = false;

		let channels = preloadedChannels;
		if (!channels || channels.length === 0) {
			const snapshot = await loadDecodedPcmSnapshot(meta.id);
			if (snapshot) {
				channels = snapshot.channelData;
			} else {
				const fallbackLen = Math.max(1024, Math.round(meta.durationSec * meta.sampleRate));
				channels = [new Float32Array(fallbackLen)];
			}
		}

		// Deep copy to keep originalChannelData strictly immutable in memory
		originalChannelData = channels.map((ch) => new Float32Array(ch));
		currentRecording = structuredClone(meta);
		selectedExportFormat = 'mp4-audio';
		selectedPresetId = RECORDING_MODES[meta.mode].defaultPreset;
		playheadSec = currentRecording.recipe.trimStartSec;
		waveformZoom = 1;
		waveformScrollRatio = 0;

		// Verify stored original SHA-256 integrity on durable browser storage
		const integrity = await verifyOriginalIntegrity(meta.id);
		originalIntegrityVerified = integrity.valid && meta.status === 'saved';
		originalIntegrityHash = integrity.actualSha256.slice(0, 16);
		if (!originalIntegrityVerified) {
			currentRecording = {
				...currentRecording,
				status: 'error'
			};
		}

		await rebuildRenderedAudioBuffers(false);
		activeView = 'edit';
	}

	async function rebuildRenderedAudioBuffers(runEnhancement = true) {
		if (!currentRecording || originalChannelData.length === 0) return;

		// Always build the unenhanced trimmed/edited reference buffer for instant A/B comparison
		const unenhancedRender = renderEditedAudio({
			originalChannels: originalChannelData,
			sampleRate: currentRecording.sampleRate,
			recipe: currentRecording.recipe,
			secondaryRecordings: secondaryRecordingsMap,
			includeEnhancement: false
		});
		renderedOriginalChannels = unenhancedRender.renderedChannels;

		if (
			currentRecording.recipe.enhancement.enabled &&
			currentRecording.recipe.enhancement.amount > 0 &&
			runEnhancement
		) {
			isProcessingSound = true;
			processingProgress = 0.05;
			cancelProcessingFlag = false;

			// Yield briefly so UI renders progress state
			await new Promise((r) => setTimeout(r, 10));

			const enhancedOut = enhanceAudioBuffer(
				renderedOriginalChannels,
				currentRecording.sampleRate,
				currentRecording.recipe.enhancement,
				{
					onProgress: (p) => {
						processingProgress = p;
					},
					shouldCancel: () => cancelProcessingFlag
				}
			);

			if (cancelProcessingFlag) {
				isProcessingSound = false;
				announce('Sound improvement cancelled; original sound preserved.');
				return;
			}

			renderedEnhancedChannels = enhancedOut.enhancedChannels;
			matchedLoudnessGainDb = enhancedOut.matchedLoudnessGainDb;
			matchedLoudnessGainLinear = enhancedOut.matchedLoudnessGainLinear;

			const waveform = buildWaveformSummary(
				renderedEnhancedChannels,
				currentRecording.sampleRate,
				360
			);
			currentRecording = await updateRecordingMetadata({
				...currentRecording,
				waveform,
				analysis: enhancedOut.analysis
			});
			await refreshLibraryAndStorage();
			isProcessingSound = false;
			comparisonMode = 'improved';
		} else {
			renderedEnhancedChannels = renderedOriginalChannels.map((ch) => new Float32Array(ch));
			const baseMeasure = analyzeAudioBuffer(renderedOriginalChannels, currentRecording.sampleRate);
			matchedLoudnessGainDb = 0;
			matchedLoudnessGainLinear = 1;
			const waveform = buildWaveformSummary(
				renderedOriginalChannels,
				currentRecording.sampleRate,
				360
			);
			currentRecording = await updateRecordingMetadata({
				...currentRecording,
				waveform,
				analysis: currentRecording.analysis ?? {
					before: baseMeasure,
					after: baseMeasure,
					summary: 'Original sound ready for improvement.',
					changeNotes: ['Click "Improve sound" to reduce background noise and balance loudness.']
				}
			});
			await refreshLibraryAndStorage();
		}
	}

	async function handleImproveSoundClick() {
		if (!currentRecording) return;
		stopPlayback();
		previewBannerText = null;
		const nextRecipe = pushRecipeHistory(currentRecording.recipe, 'Improve sound');
		nextRecipe.enhancement = {
			...nextRecipe.enhancement,
			enabled: true,
			amount: nextRecipe.enhancement.amount > 0 ? nextRecipe.enhancement.amount : 68,
			mode: currentRecording.mode
		};
		currentRecording = { ...currentRecording, recipe: nextRecipe };
		await rebuildRenderedAudioBuffers(true);

		// Verify that the stored original file on disk was NOT mutated by sound improvement
		const integrity = await verifyOriginalIntegrity(currentRecording.id);
		originalIntegrityVerified = integrity.valid;
		originalIntegrityHash = integrity.actualSha256.slice(0, 16);

		announce(
			`Sound improved: ${currentRecording.analysis?.summary ?? 'Noise reduced and voice clarity balanced.'}`
		);
	}

	async function handlePreview10Seconds() {
		if (!currentRecording || originalChannelData.length === 0) return;
		stopPlayback();
		const previewSlice = extractRepresentativePreview(
			originalChannelData,
			currentRecording.sampleRate,
			10
		);
		const enhancedPreview = enhanceAudioBuffer(
			previewSlice.previewChannels,
			currentRecording.sampleRate,
			{
				...currentRecording.recipe.enhancement,
				enabled: true,
				amount: Math.max(30, currentRecording.recipe.enhancement.amount)
			}
		);
		previewBannerText = `10s preview (${previewSlice.startSec}s–${previewSlice.endSec}s): ${enhancedPreview.analysis.summary}`;
		await playBufferChannels(enhancedPreview.enhancedChannels, currentRecording.sampleRate, 0);
	}

	async function handleEnhancementAmountChange(nextAmount: number) {
		if (!currentRecording) return;
		currentRecording.recipe.enhancement.amount = nextAmount;
		currentRecording.recipe.enhancement.enabled = nextAmount > 0;
		await rebuildRenderedAudioBuffers(nextAmount > 0);
	}

	async function handleMoreAdjustmentChange() {
		if (!currentRecording) return;
		currentRecording.recipe.enhancement.enabled = true;
		await rebuildRenderedAudioBuffers(true);
	}

	async function handleDownloadNeuralModel() {
		neuralModelStatus = { ...neuralModelStatus, state: 'downloading' };
		neuralModelStatus = await downloadAndCacheNeuralModel();
		if (neuralModelStatus.state === 'ready' && currentRecording) {
			currentRecording.recipe.enhancement.engine = 'neural';
			if (currentRecording.recipe.enhancement.enabled) {
				await rebuildRenderedAudioBuffers(true);
			}
			announce('Local Bark-GRU neural speech model downloaded and enabled.');
		}
	}

	async function handleRemoveNeuralModel() {
		neuralModelStatus = await removeCachedNeuralModel();
		if (currentRecording && currentRecording.recipe.enhancement.engine === 'neural') {
			currentRecording.recipe.enhancement.engine = 'dsp';
			if (currentRecording.recipe.enhancement.enabled) {
				await rebuildRenderedAudioBuffers(true);
			}
		}
		announce('Local neural speech model removed from browser cache.');
	}

	// Non-destructive Editing Handlers
	async function handleTrimChange(startSec: number, endSec: number) {
		if (!currentRecording) return;
		const updatedRecipe = applyTrimToRecipe(
			currentRecording.recipe,
			startSec,
			endSec,
			currentRecording.durationSec
		);
		currentRecording = { ...currentRecording, recipe: updatedRecipe };
		playheadSec = Math.max(updatedRecipe.trimStartSec, Math.min(playheadSec, updatedRecipe.trimEndSec));
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
	}

	async function handleCutSelection() {
		if (!currentRecording) return;
		const { selectionStartSec, selectionEndSec } = currentRecording.recipe;
		if (selectionStartSec === null || selectionEndSec === null) return;
		stopPlayback();
		const updatedRecipe = cutTimelineSelection(
			currentRecording.recipe,
			selectionStartSec,
			selectionEndSec
		);
		currentRecording = { ...currentRecording, recipe: updatedRecipe };
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
		announce(
			`Cut selected region (${selectionStartSec.toFixed(2)}s to ${selectionEndSec.toFixed(2)}s).`
		);
	}

	async function handleSplitAtPlayhead() {
		if (!currentRecording) return;
		const relTimelineSec = Math.max(0, playheadSec - currentRecording.recipe.trimStartSec);
		const updatedRecipe = splitTimelineAt(currentRecording.recipe, relTimelineSec);
		currentRecording = { ...currentRecording, recipe: updatedRecipe };
		await updateRecordingMetadata(currentRecording);
		announce(`Split clip at ${playheadSec.toFixed(2)} seconds (${updatedRecipe.segments.length} segments).`);
	}

	async function handleJoinRecording() {
		if (!currentRecording || !joinCandidateId) return;
		const candidateMeta = library.find((r) => r.id === joinCandidateId);
		if (!candidateMeta) return;
		const snap = await loadDecodedPcmSnapshot(candidateMeta.id);
		if (snap) {
			secondaryRecordingsMap.set(candidateMeta.id, snap.channelData);
		}
		const updatedRecipe = joinRecordingToRecipe(
			currentRecording.recipe,
			candidateMeta.id,
			candidateMeta.durationSec
		);
		currentRecording = { ...currentRecording, recipe: updatedRecipe };
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
		announce(`Joined "${candidateMeta.title}" non-destructively.`);
	}

	function handlePreviewSilenceShortening() {
		if (!currentRecording || originalChannelData.length === 0) return;
		const detection = detectSilenceIntervals(
			originalChannelData,
			currentRecording.sampleRate,
			currentRecording.recipe.silenceReduction,
			{
				startSec: currentRecording.recipe.trimStartSec,
				endSec: currentRecording.recipe.trimEndSec
			}
		);
		currentRecording.recipe.silenceReduction = {
			...currentRecording.recipe.silenceReduction,
			previewed: true,
			detectedIntervals: detection.intervals
		};
		silencePreviewActive = true;
		silenceTotalSavedSec = detection.totalSavedSec;
		announce(
			`Detected ${detection.intervals.length} long pause(s); applying will shorten recording by ${detection.totalSavedSec.toFixed(1)} seconds.`
		);
	}

	async function handleApplySilenceShortening() {
		if (!currentRecording || !silencePreviewActive) return;
		const intervals = currentRecording.recipe.silenceReduction.detectedIntervals;
		if (intervals.length === 0) return;
		const updatedRecipe = applySilenceShorteningToRecipe(currentRecording.recipe, intervals);
		currentRecording = { ...currentRecording, recipe: updatedRecipe };
		silencePreviewActive = false;
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
		announce(`Shortened ${intervals.length} pause(s), saving ${silenceTotalSavedSec.toFixed(1)} seconds.`);
	}

	async function handleUndo() {
		if (!currentRecording || currentRecording.recipe.undoStack.length === 0) return;
		stopPlayback();
		currentRecording = {
			...currentRecording,
			recipe: undoRecipe(currentRecording.recipe)
		};
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
		announce('Undid last edit.');
	}

	async function handleRedo() {
		if (!currentRecording || currentRecording.recipe.redoStack.length === 0) return;
		stopPlayback();
		currentRecording = {
			...currentRecording,
			recipe: redoRecipe(currentRecording.recipe)
		};
		await rebuildRenderedAudioBuffers(currentRecording.recipe.enhancement.enabled);
		announce('Redid edit.');
	}

	async function handleResetToOriginal() {
		if (!currentRecording) return;
		stopPlayback();
		const reset = resetRecipeToOriginal(currentRecording.durationSec, currentRecording.recipe);
		currentRecording = {
			...currentRecording,
			recipe: reset
		};
		silencePreviewActive = false;
		comparisonMode = 'original';
		await rebuildRenderedAudioBuffers(false);
		const integrity = await verifyOriginalIntegrity(currentRecording.id);
		originalIntegrityVerified = integrity.valid;
		announce('Reset all edits and sound settings to the untouched original recording.');
	}

	// Web Audio Playback & Instant Matched-Loudness Comparison
	function getActivePlaybackChannels(): Float32Array[] {
		if (!currentRecording) return [];
		if (
			comparisonMode === 'improved' &&
			currentRecording.recipe.enhancement.enabled &&
			renderedEnhancedChannels.length > 0
		) {
			return renderedEnhancedChannels;
		}
		return renderedOriginalChannels.length > 0 ? renderedOriginalChannels : originalChannelData;
	}

	async function playBufferChannels(
		channels: Float32Array[],
		sampleRate: number,
		startOffsetSec = 0
	) {
		stopPlayback();
		if (channels.length === 0 || (channels[0]?.length ?? 0) === 0) return;

		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!playbackCtx) {
			playbackCtx = new AudioCtx({ sampleRate });
		}
		if (playbackCtx.state === 'suspended') {
			await playbackCtx.resume();
		}

		const frameCount = channels[0].length;
		const audioBuffer = playbackCtx.createBuffer(channels.length, frameCount, sampleRate);
		for (let c = 0; c < channels.length; c++) {
			const dst = audioBuffer.getChannelData(c);
			dst.set(channels[c]);
		}

		const source = playbackCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.playbackRate.value = playbackRate;

		const gainNode = playbackCtx.createGain();
		const isComparingOriginalWithMatch =
			comparisonMode === 'original' &&
			matchComparisonLoudness &&
			currentRecording?.recipe.enhancement.enabled;
		gainNode.gain.value = isComparingOriginalWithMatch ? matchedLoudnessGainLinear : 1.0;

		source.connect(gainNode);
		gainNode.connect(playbackCtx.destination);

		const clampedOffset = Math.max(0, Math.min(audioBuffer.duration - 0.02, startOffsetSec));
		playbackStartedAtCtxTime = playbackCtx.currentTime;
		playbackStartOffsetSec = clampedOffset;

		source.onended = () => {
			if (isPlaying) {
				if (currentRecording?.recipe.loopSelection) {
					void playBufferChannels(channels, sampleRate, 0);
					return;
				}
				isPlaying = false;
				if (playbackRafId !== null) {
					cancelAnimationFrame(playbackRafId);
					playbackRafId = null;
				}
			}
		};

		source.start(0, clampedOffset);
		playbackSource = source;
		playbackGainNode = gainNode;
		isPlaying = true;

		const tickPlayhead = () => {
			if (!isPlaying || !playbackCtx) return;
			const elapsed = (playbackCtx.currentTime - playbackStartedAtCtxTime) * playbackRate;
			const trimBase = currentRecording?.recipe.trimStartSec ?? 0;
			playheadSec = Math.min(
				currentRecording?.recipe.trimEndSec ?? audioBuffer.duration,
				Number((trimBase + playbackStartOffsetSec + elapsed).toFixed(2))
			);
			playbackRafId = requestAnimationFrame(tickPlayhead);
		};
		playbackRafId = requestAnimationFrame(tickPlayhead);
	}

	function stopPlayback() {
		isPlaying = false;
		if (playbackRafId !== null) {
			cancelAnimationFrame(playbackRafId);
			playbackRafId = null;
		}
		if (playbackSource) {
			try {
				playbackSource.onended = null;
				playbackSource.stop();
				playbackSource.disconnect();
			} catch {
				// Ignore
			}
			playbackSource = null;
		}
		if (playbackGainNode) {
			try {
				playbackGainNode.disconnect();
			} catch {
				// Ignore
			}
			playbackGainNode = null;
		}
	}

	async function togglePlayback() {
		if (isPlaying) {
			stopPlayback();
			return;
		}
		const channels = getActivePlaybackChannels();
		if (!currentRecording || channels.length === 0) return;
		const relOffset = Math.max(0, playheadSec - currentRecording.recipe.trimStartSec);
		const totalEditedDur = (channels[0]?.length ?? 0) / currentRecording.sampleRate;
		const startOffset = relOffset >= totalEditedDur - 0.08 ? 0 : relOffset;
		await playBufferChannels(channels, currentRecording.sampleRate, startOffset);
	}

	async function switchComparisonMode(target: 'original' | 'improved') {
		comparisonMode = target;
		if (isPlaying && currentRecording) {
			const relOffset = Math.max(0, playheadSec - currentRecording.recipe.trimStartSec);
			await playBufferChannels(getActivePlaybackChannels(), currentRecording.sampleRate, relOffset);
		}
		announce(
			target === 'original'
				? `Hearing original recording${matchComparisonLoudness ? ' (loudness-matched)' : ''}.`
				: 'Hearing improved sound.'
		);
	}

	// Export & Share Handlers
	async function handleExportMedia() {
		if (!currentRecording || isExporting) return;
		isExporting = true;
		exportProgress = 0.05;
		exportErrorMessage = null;

		try {
			const activeChannels = getActivePlaybackChannels();
			const originalWavBlob =
				selectedExportFormat === 'original'
					? new Blob(
							[
								(await exportRecordingMedia({
									title: currentRecording.title,
									mode: currentRecording.mode,
									format: 'wav',
									presetId: selectedPresetId,
									channelData: originalChannelData,
									sampleRate: currentRecording.sampleRate,
									waveformPeaks: currentRecording.waveform.peaks
								})).blob
							],
							{ type: currentRecording.originalMimeType || 'audio/wav' }
						)
					: undefined;

			const res = await exportRecordingMedia({
				title: currentRecording.title,
				mode: currentRecording.mode,
				format: selectedExportFormat,
				presetId: selectedPresetId,
				channelData: activeChannels,
				sampleRate: currentRecording.sampleRate,
				waveformPeaks: currentRecording.waveform.peaks,
				originalBlob: originalWavBlob,
				originalExtension: currentRecording.originalExtension,
				onProgress: (p) => {
					exportProgress = p;
				}
			});

			lastExportResult = res;
			triggerBrowserDownload(res.blob, res.filename);
			announce(
				`Exported ${res.filename} (${formatBytes(res.actualBytes)}, verified ${res.inspection.container.toUpperCase()} container).`
			);
		} catch (err) {
			exportErrorMessage = err instanceof Error ? err.message : 'Export failed.';
			announce(`Export error: ${exportErrorMessage}`);
		} finally {
			isExporting = false;
		}
	}

	function triggerBrowserDownload(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	}

	async function handleShareExport() {
		if (!lastExportResult) {
			await handleExportMedia();
		}
		if (!lastExportResult) return;

		const file = new File([lastExportResult.blob], lastExportResult.filename, {
			type: lastExportResult.mimeType
		});
		if (
			typeof navigator !== 'undefined' &&
			typeof navigator.canShare === 'function' &&
			navigator.canShare({ files: [file] })
		) {
			try {
				await navigator.share({
					title: currentRecording?.title ?? 'Recording',
					text: 'Recorded and cleaned with Recorder — by Suvro Ghosh',
					files: [file]
				});
				return;
			} catch {
				// Fallback to download
			}
		}
		triggerBrowserDownload(lastExportResult.blob, lastExportResult.filename);
	}

	async function handleBackupZip(recordingId: string) {
		try {
			const { zipBytes, filename } = await exportProjectBackupZip(recordingId);
			const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
			triggerBrowserDownload(blob, filename);
			announce(`Downloaded project backup archive ${filename}.`);
		} catch (err) {
			announce(err instanceof Error ? err.message : 'Backup failed.');
		}
	}

	async function handleFileImportChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.name.toLowerCase().endsWith('.zip')) {
				const buf = await file.arrayBuffer();
				const restored = await importProjectBackupZip(buf);
				await refreshLibraryAndStorage();
				await openRecordingInEditor(restored);
				announce(`Restored project backup "${restored.title}".`);
			} else {
				const imported = await importExternalAudioFile(file, selectedMode);
				await refreshLibraryAndStorage();
				await openRecordingInEditor(imported.metadata, imported.channelData);
				announce(`Imported "${imported.metadata.title}".`);
			}
		} catch (err) {
			captureError = {
				code: 'unknown',
				title: 'Import failed',
				message: err instanceof Error ? err.message : 'Could not decode selected file.',
				recoveryHint: 'Select a valid WAV, MP4, M4A, MP3, OGG, FLAC, or project backup .zip file.'
			};
		} finally {
			input.value = '';
		}
	}

	// Library Organization & Deletion Handlers
	async function handleToggleFavourite(rec: RecordingMetadata) {
		const updated = await updateRecordingMetadata({
			...rec,
			favourite: !rec.favourite
		});
		if (currentRecording?.id === rec.id) {
			currentRecording = updated;
		}
		await refreshLibraryAndStorage();
	}

	async function handleSoftDelete(rec: RecordingMetadata) {
		await softDeleteRecording(rec.id);
		lastDeletedRecording = rec;
		if (currentRecording?.id === rec.id) {
			currentRecording = null;
		}
		await refreshLibraryAndStorage();
		announce(`Deleted "${rec.title}". You can click Undo delete to restore it.`);
	}

	async function handleUndoDelete() {
		if (!lastDeletedRecording) return;
		await restoreDeletedRecording(lastDeletedRecording.id);
		const title = lastDeletedRecording.title;
		lastDeletedRecording = null;
		await refreshLibraryAndStorage();
		announce(`Restored "${title}".`);
	}

	async function handlePermanentDelete(recId: string, title: string) {
		await permanentlyDeleteRecording(recId);
		if (lastDeletedRecording?.id === recId) {
			lastDeletedRecording = null;
		}
		await refreshLibraryAndStorage();
		announce(`Permanently deleted "${title}" and freed device storage.`);
	}

	async function handleAddTag() {
		if (!currentRecording || !newTagInput.trim()) return;
		const clean = newTagInput.trim().toLowerCase();
		if (!currentRecording.tags.includes(clean)) {
			currentRecording = await updateRecordingMetadata({
				...currentRecording,
				tags: [...currentRecording.tags, clean]
			});
			await refreshLibraryAndStorage();
		}
		newTagInput = '';
	}

	async function handleRemoveTag(tag: string) {
		if (!currentRecording) return;
		currentRecording = await updateRecordingMetadata({
			...currentRecording,
			tags: currentRecording.tags.filter((t) => t !== tag)
		});
		await refreshLibraryAndStorage();
	}

	// Keyboard shortcuts that never interfere with typing in form controls
	function handleGlobalKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase();
		if (
			tag === 'input' ||
			tag === 'textarea' ||
			tag === 'select' ||
			target?.isContentEditable
		) {
			return;
		}

		if (event.code === 'Space' && activeView === 'edit' && currentRecording) {
			event.preventDefault();
			void togglePlayback();
		} else if (event.key.toLowerCase() === 'i' && activeView === 'edit' && currentRecording) {
			event.preventDefault();
			void switchComparisonMode(comparisonMode === 'original' ? 'improved' : 'original');
		} else if (event.key.toLowerCase() === 'b' && recorderState === 'recording') {
			event.preventDefault();
			handleAddLiveBookmark();
		} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && activeView === 'edit') {
			event.preventDefault();
			if (event.shiftKey) {
				void handleRedo();
			} else {
				void handleUndo();
			}
		}
	}

	// Filtered & sorted library items
	$: filteredLibrary = library
		.filter((item) => {
			if (filterMode !== 'all' && item.mode !== filterMode) return false;
			if (filterFavouritesOnly && !item.favourite) return false;
			if (searchQuery.trim()) {
				const q = searchQuery.trim().toLowerCase();
				const matchTitle = item.title.toLowerCase().includes(q);
				const matchNotes = item.notes.toLowerCase().includes(q);
				const matchTags = item.tags.some((t) => t.toLowerCase().includes(q));
				return matchTitle || matchNotes || matchTags;
			}
			return true;
		})
		.sort((a, b) => {
			if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
			if (sortOrder === 'longest') return b.durationSec - a.durationSec;
			if (sortOrder === 'title') return a.title.localeCompare(b.title);
			return b.createdAt - a.createdAt;
		});

	$: editedDurationSec = currentRecording
		? getEditedTimelineDurationSec(currentRecording.recipe)
		: 0;

	$: estimatedExportBytes = currentRecording
		? estimateExportSizeBytes(
				editedDurationSec,
				selectedExportFormat,
				selectedPresetId,
				currentRecording.sampleRate,
				currentRecording.originalByteLength
			)
		: 0;
</script>

<svelte:window on:keydown={handleGlobalKeyDown} />

<div class="recorder-shell" data-testid="recorder-app">
	<!-- Screen-reader live status region -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">{statusAnnouncement}</div>

	<!-- Hidden file input for audio & backup import -->
	<input
		bind:this={fileImportInput}
		type="file"
		accept="audio/*,.wav,.mp4,.m4a,.mp3,.aac,.ogg,.flac,.webm,.zip"
		class="sr-only"
		on:change={handleFileImportChange}
	/>

	<!-- Hardware Top Bezel Header Above the Fold -->
	<header class="hardware-header">
		<div class="brand-cluster">
			<div class="led-cluster" aria-hidden="true">
				<span class="led-dot is-lit"></span>
				<span class="led-dot is-lit"></span>
				<span class="led-dot is-lit"></span>
				<span class="led-dot"></span>
			</div>
			<div>
				<div class="eyebrow-row">
					<span class="hardware-model">FIELD UNIT // SG-R1</span>
					<span class="privacy-pill">Local-First • On-Device Only</span>
				</div>
				<h1 class="app-title">Recorder <span class="byline">— by Suvro Ghosh</span></h1>
				<p class="hero-sentence" data-testid="recorder-hero-tagline">
					Record something. Make it clearer. Keep it.
				</p>
			</div>
		</div>

		<!-- Primary Workflow Tabs: Record -> Edit -> Library -->
		<nav class="view-tabs" aria-label="Recorder views">
			<button
				type="button"
				class="view-tab"
				class:is-active={activeView === 'record'}
				on:click={() => (activeView = 'record')}
			>
				<span class="tab-step">01</span>
				<span>Record</span>
			</button>
			<button
				type="button"
				class="view-tab"
				class:is-active={activeView === 'edit'}
				on:click={() => (activeView = 'edit')}
			>
				<span class="tab-step">02</span>
				<span>Edit</span>
				{#if currentRecording}
					<span class="tab-indicator" aria-hidden="true"></span>
				{/if}
			</button>
			<button
				type="button"
				class="view-tab"
				class:is-active={activeView === 'library'}
				on:click={() => (activeView = 'library')}
			>
				<span class="tab-step">03</span>
				<span>Library</span>
				<span class="tab-count">{library.length}</span>
			</button>
		</nav>
	</header>

	<!-- Quick Worked-Example Action Bar -->
	<section class="worked-example-strip" aria-label="Quick start and worked example">
		<div class="strip-copy">
			<strong>Everyday scenario:</strong>
			<span
				>“I recorded ten minutes of speech beside a running fan. Help me reduce the noise, make my
				voice easier to hear, trim the beginning and end, and save a small MP4 file.”</span
			>
		</div>
		<div class="strip-actions">
			<button
				type="button"
				class="hw-btn hw-btn-accent"
				data-testid="load-worked-example-btn"
				on:click={() => handleLoadWorkedExample('speech')}
			>
				Load Fan-Noise Speech Example
			</button>
			<button
				type="button"
				class="hw-btn hw-btn-secondary"
				on:click={() => fileImportInput?.click()}
			>
				Import recording
			</button>
		</div>
	</section>

	<!-- Crash / Interrupted Session Recovery Alert -->
	{#if recoverableSessions.length > 0}
		<div class="recovery-banner" role="alert">
			<div>
				<strong>Interrupted session detected:</strong>
				{#each recoverableSessions as item (item.journal.sessionId)}
					<span>
						“{item.journal.title}” has {item.recoverableDurationSec}s of verified committed audio
						ready for recovery.
					</span>
					<button
						type="button"
						class="hw-btn hw-btn-accent"
						on:click={() => handleRecoverSession(item.journal.sessionId)}
					>
						Recover session ({item.recoverableDurationSec}s)
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Undoable Soft Delete Banner -->
	{#if lastDeletedRecording}
		<div class="undo-delete-banner" role="status">
			<span>Moved “{lastDeletedRecording.title}” to trash.</span>
			<button type="button" class="hw-btn hw-btn-secondary" on:click={handleUndoDelete}>
				Undo delete
			</button>
		</div>
	{/if}

	<!-- Main Responsive Hardware Workspace -->
	<div class="workspace-grid">
		<!-- Primary Active View Column (Record or Edit or Full Library) -->
		<main class="main-unit-column">
			{#if activeView === 'record'}
				<!-- ================= RECORD VIEW ================= -->
				<section class="hardware-panel record-panel" aria-label="Record view">
					<!-- Recessed OLED Display Screen -->
					<div class="oled-bezel">
						<div class="oled-top-bar">
							<div class="status-cluster">
								<span
									class="state-pill state-{recorderState}"
									data-testid="recording-state-badge"
								>
									{#if recorderState === 'recording'}
										● REC
									{:else if recorderState === 'paused'}
										❚❚ PAUSED
									{:else if recorderState === 'saving'}
										⏳ SAVING…
									{:else if recorderState === 'saved'}
										✓ SAVED
									{:else if recorderState === 'testing-mic'}
										◎ MIC TEST
									{:else if recorderState === 'interrupted'}
										⚠ INTERRUPTED
									{:else if recorderState === 'error'}
										✕ ERROR
									{:else}
										○ READY
									{/if}
								</span>
								<input
									type="text"
									class="title-inline-input"
									bind:value={recordingTitle}
									aria-label="Recording title"
									placeholder="Recording title"
								/>
							</div>

							<div class="oled-meta-readout">
								<span>{RECORDING_MODES[selectedMode].label.toUpperCase()}</span>
								<span>{selectedChannels === 2 ? 'STEREO' : 'MONO'}</span>
								<span>{captureDiagnostics?.sampleRate ?? 48000} Hz</span>
							</div>
						</div>

						<!-- Dominant Waveform Display -->
						<WaveformCanvas
							peaks={liveWaveformPeaks}
							rms={liveWaveformRms}
							durationSec={Math.max(1, capturedMs / 1000)}
							playheadSec={capturedMs / 1000}
							isRecording={recorderState === 'recording'}
							interactive={false}
						/>

						<!-- Large Elapsed Numerals & Level Meter Bar -->
						<div class="oled-bottom-bar">
							<div class="elapsed-block">
								<div class="elapsed-numerals" data-testid="elapsed-time-display">
									{formatTimecode(capturedMs / 1000)}
								</div>
								<div class="timing-subrow">
									<span>Captured: {(capturedMs / 1000).toFixed(1)}s</span>
									{#if pausedMs > 0}
										<span>• Paused: {(pausedMs / 1000).toFixed(1)}s</span>
									{/if}
									{#if interruptionGapMs > 0}
										<span>• Gap: {(interruptionGapMs / 1000).toFixed(1)}s</span>
									{/if}
									<span>• Committed: {committedChunks} seg ({formatBytes(committedBytes)})</span>
								</div>
							</div>

							<!-- Real Input Level Meter -->
							<div class="level-meter-box" aria-label="Input level meter">
								<div class="meter-labels">
									<span>INPUT LEVEL</span>
									<span class="mono-num" class:is-clipping={liveMeter.clipping}>
										{liveMeter.peakDbfs <= -90 ? '-∞' : `${liveMeter.peakDbfs.toFixed(1)} dB`}
										{liveMeter.clipping ? ' CLIP!' : ''}
									</span>
								</div>
								<div class="meter-track">
									<div
										class="meter-fill"
										class:is-clipping={liveMeter.clipping}
										style="width: {Math.max(0, Math.min(100, ((liveMeter.peakDbfs + 60) / 60) * 100))}%;"
									></div>
								</div>
							</div>
						</div>
					</div>

					<!-- Permission or Capture Error Recovery Notice -->
					{#if captureError}
						<div class="error-recovery-card" role="alert" data-testid="capture-error-card">
							<div class="error-header">
								<strong>{captureError.title}</strong>
								<span>{captureError.message}</span>
							</div>
							<p class="error-hint">{captureError.recoveryHint}</p>
							<div class="error-actions">
								<button
									type="button"
									class="hw-btn hw-btn-accent"
									on:click={() => handleLoadWorkedExample(selectedMode)}
								>
									Open Worked Example Instead
								</button>
								<button
									type="button"
									class="hw-btn hw-btn-secondary"
									on:click={() => fileImportInput?.click()}
								>
									Import Existing Audio
								</button>
							</div>
						</div>
					{/if}

					{#if interruptionNotice}
						<div class="interruption-alert" role="status">
							<strong>Interruption note:</strong> {interruptionNotice}
						</div>
					{/if}

					<!-- Physical Transport Controls Below Waveform -->
					<div class="transport-deck">
						<div class="secondary-transport-left">
							<button
								type="button"
								class="hw-btn hw-btn-secondary"
								disabled={recorderState === 'recording' || recorderState === 'paused' || recorderState === 'saving'}
								on:click={handleTestMicrophone}
							>
								{recorderState === 'testing-mic' ? 'Stop mic test' : 'Test microphone'}
							</button>

							{#if recorderState === 'recording' || recorderState === 'paused'}
								<button
									type="button"
									class="hw-btn hw-btn-secondary"
									on:click={handlePauseOrResume}
								>
									{recorderState === 'paused' ? 'Resume' : 'Pause'}
								</button>
							{/if}
						</div>

						<!-- Large Circular Record Button -->
						<div class="primary-record-well">
							{#if recorderState !== 'recording' && recorderState !== 'paused'}
								<button
									type="button"
									class="record-circle-btn"
									data-testid="record-start-btn"
									disabled={recorderState === 'saving' || recorderState === 'requesting-permission'}
									aria-label="Record"
									on:click={handleStartRecording}
								>
									<span class="record-core"></span>
									<span class="record-caption">Record</span>
								</button>
							{:else}
								<button
									type="button"
									class="record-circle-btn is-active-recording"
									data-testid="stop-and-save-btn"
									aria-label="Stop and save"
									on:click={handleStopAndSave}
								>
									<span class="stop-core"></span>
									<span class="record-caption">Stop and save</span>
								</button>
							{/if}
						</div>

						<div class="secondary-transport-right">
							{#if recorderState === 'recording' || recorderState === 'paused'}
								<div class="bookmark-inline">
									<input
										type="text"
										class="compact-input"
										placeholder="Bookmark note"
										bind:value={bookmarkDraftLabel}
										aria-label="Bookmark label"
									/>
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										on:click={handleAddLiveBookmark}
									>
										Bookmark
									</button>
								</div>
							{:else}
								<label class="toggle-chip">
									<input type="checkbox" bind:checked={useCountdown} />
									<span>3s countdown</span>
								</label>
							{/if}
						</div>
					</div>

					<!-- Recording Mode Selector & Input Configuration -->
					<div class="capture-settings-grid">
						<div class="setting-group">
							<span class="group-title">Recording mode</span>
							<div class="mode-pills" role="radiogroup" aria-label="Recording mode">
								{#each Object.values(RECORDING_MODES) as modeSpec (modeSpec.id)}
									<button
										type="button"
										class="mode-pill"
										class:is-selected={selectedMode === modeSpec.id}
										aria-pressed={selectedMode === modeSpec.id}
										on:click={() => selectRecordingMode(modeSpec.id)}
									>
										<strong>{modeSpec.label}</strong>
										<span>{modeSpec.subtitle}</span>
									</button>
								{/each}
							</div>
							<p class="setting-explanation">
								{RECORDING_MODES[selectedMode].captureExplanation}
							</p>
						</div>

						<div class="setting-group">
							<span class="group-title">Microphone & Channels</span>
							<div class="input-controls-row">
								<label class="field-label">
									<span>Microphone</span>
									<select
										class="hw-select"
										bind:value={selectedDeviceId}
										aria-label="Select microphone"
									>
										<option value="default">System Default Microphone</option>
										{#each microphones as mic (mic.deviceId)}
											<option value={mic.deviceId}>{mic.label}</option>
										{/each}
									</select>
								</label>

								<label class="field-label">
									<span>Channels</span>
									<select
										class="hw-select"
										bind:value={selectedChannels}
										aria-label="Channel count"
									>
										<option value={1}>Mono (1 ch — compact speech)</option>
										<option value={2}>Stereo (2 ch — wide music/room)</option>
									</select>
								</label>
							</div>

							<div class="monitoring-row">
								<label class="toggle-chip">
									<input
										type="checkbox"
										bind:checked={liveMonitoring}
										on:change={() => captureController?.setLiveMonitoring(liveMonitoring)}
									/>
									<span>Live headphone monitoring (off by default)</span>
								</label>
								{#if liveMonitoring}
									<p class="monitoring-warning">
										Use wired headphones when monitoring live input to prevent speaker feedback loops
										and Bluetooth echo delay.
									</p>
								{/if}
							</div>

							<p class="setting-explanation">
								Hardware note: Software gain and enhancement cannot repair severe analog clipping
								that already occurred inside the microphone capsule. Keep peaks below 0 dB.
							</p>
						</div>
					</div>
				</section>
			{:else if activeView === 'edit'}
				<!-- ================= EDIT & IMPROVE SOUND VIEW ================= -->
				<section class="hardware-panel edit-panel" aria-label="Edit and improve sound view">
					{#if !currentRecording}
						<div class="empty-editor-state">
							<h2>No recording open for editing</h2>
							<p>
								Record something in the Record tab, select a saved recording from your Library, or
								load the worked example below.
							</p>
							<div class="empty-actions">
								<button
									type="button"
									class="hw-btn hw-btn-accent"
									on:click={() => handleLoadWorkedExample('speech')}
								>
									Load Fan-Noise Speech Example
								</button>
								<button
									type="button"
									class="hw-btn hw-btn-secondary"
									on:click={() => (activeView = 'record')}
								>
									Go to Record
								</button>
							</div>
						</div>
					{:else}
						{#if currentRecording.status !== 'saved' || !originalIntegrityVerified}
							<div
								class="error-recovery-card"
								role="alert"
								data-testid="storage-failure-banner"
							>
								<div class="error-header">
									<span class="error-badge">UNSAVED — MEMORY ONLY</span>
									<strong>Browser storage failed — Recording is NOT saved</strong>
								</div>
								<p>
									Browser storage (OPFS and IndexedDB) could not persist this recording. Your audio
									is held only in temporary memory and will disappear if you reload or close this
									page.
								</p>
								<p class="recovery-hint">
									<strong>Rescue action:</strong> Click <strong>Export MP4</strong> below right now to
									download the file directly to your device disk.
								</p>
							</div>
						{/if}

						<!-- Recessed Editor OLED Display -->
						<div class="oled-bezel">
							<div class="oled-top-bar">
								<div class="status-cluster">
									{#if currentRecording.status === 'saved' && originalIntegrityVerified}
										<span class="state-pill state-saved" data-testid="editor-saved-badge">
											✓ SAVED ({currentRecording.storageBackend.toUpperCase()})
										</span>
									{:else}
										<span class="state-pill state-error" data-testid="editor-saved-badge">
											⚠ UNSAVED — MEMORY ONLY (EXPORT NOW)
										</span>
									{/if}
									<input
										type="text"
										class="title-inline-input"
										bind:value={currentRecording.title}
										aria-label="Edit recording title"
										on:change={() => currentRecording && updateRecordingMetadata(currentRecording)}
									/>
								</div>

								<div class="oled-meta-readout">
									{#if currentRecording.status === 'saved' && originalIntegrityVerified}
										<span
											class="integrity-pill"
											data-testid="original-integrity-badge"
											title="Original SHA-256 prefix: {originalIntegrityHash}"
										>
											Original Safe (SHA-256 ✓)
										</span>
									{:else}
										<span
											class="integrity-pill integrity-pill-error"
											data-testid="original-integrity-badge"
										>
											Storage Failed — Will Disappear on Reload
										</span>
									{/if}
									<span>{currentRecording.sampleRate} Hz</span>
									<span>{currentRecording.channels === 2 ? 'STEREO' : 'MONO'}</span>
								</div>
							</div>

							<WaveformCanvas
								peaks={currentRecording.waveform.peaks}
								rms={currentRecording.waveform.rms}
								durationSec={currentRecording.durationSec}
								{playheadSec}
								trimStartSec={currentRecording.recipe.trimStartSec}
								trimEndSec={currentRecording.recipe.trimEndSec}
								selectionStartSec={currentRecording.recipe.selectionStartSec}
								selectionEndSec={currentRecording.recipe.selectionEndSec}
								bookmarks={currentRecording.bookmarks}
								silenceIntervals={currentRecording.recipe.silenceReduction.detectedIntervals}
								showSilencePreview={silencePreviewActive}
								isRecording={false}
								isEnhanced={comparisonMode === 'improved' && currentRecording.recipe.enhancement.enabled}
								zoom={waveformZoom}
								scrollOffsetRatio={waveformScrollRatio}
								onSeek={(sec) => {
									playheadSec = sec;
									if (isPlaying && currentRecording) {
										const rel = Math.max(0, sec - currentRecording.recipe.trimStartSec);
										void playBufferChannels(
											getActivePlaybackChannels(),
											currentRecording.sampleRate,
											rel
										);
									}
								}}
								onTrimChange={handleTrimChange}
								onSelectionChange={(s, e) => {
									if (!currentRecording) return;
									currentRecording.recipe.selectionStartSec = s;
									currentRecording.recipe.selectionEndSec = e;
								}}
							/>

							<!-- Playback Transport & Timecode Bar -->
							<div class="oled-bottom-bar editor-transport-bar">
								<div class="transport-buttons">
									<button
										type="button"
										class="hw-btn hw-btn-transport"
										data-testid="play-pause-btn"
										on:click={togglePlayback}
									>
										{isPlaying ? 'Pause' : 'Play'}
									</button>
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										aria-label="Skip back 2 seconds"
										on:click={() => {
											playheadSec = Math.max(0, Number((playheadSec - 2).toFixed(2)));
										}}
									>
										-2s
									</button>
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										aria-label="Skip forward 2 seconds"
										on:click={() => {
											if (!currentRecording) return;
											playheadSec = Math.min(
												currentRecording.durationSec,
												Number((playheadSec + 2).toFixed(2))
											);
										}}
									>
										+2s
									</button>
									<label class="speed-select-label">
										<span>Speed</span>
										<select
											class="hw-select compact-select"
											bind:value={playbackRate}
											aria-label="Playback speed"
										>
											<option value={0.75}>0.75×</option>
											<option value={1}>1.0×</option>
											<option value={1.25}>1.25×</option>
											<option value={1.5}>1.5×</option>
											<option value={2}>2.0×</option>
										</select>
									</label>
								</div>

								<div class="timecode-cluster">
									<span class="elapsed-numerals compact-numerals" data-testid="editor-playhead-readout">
										{formatTimecode(playheadSec)}
									</span>
									<span class="duration-divider">/ {formatTimecode(editedDurationSec)} active</span>
								</div>

								<div class="zoom-cluster">
									<label class="zoom-label">
										<span>Zoom {waveformZoom}×</span>
										<input
											type="range"
											min="1"
											max="16"
											step="1"
											bind:value={waveformZoom}
											aria-label="Waveform zoom"
										/>
									</label>
									{#if waveformZoom > 1}
										<input
											type="range"
											min="0"
											max="1"
											step="0.01"
											bind:value={waveformScrollRatio}
											aria-label="Waveform horizontal scroll"
										/>
									{/if}
								</div>
							</div>
						</div>

						<!-- Three-Column Tactical Edit Deck: Improve Sound | Trim & Edit | Export MP4 -->
						<div class="edit-deck-grid">
							<!-- 1. IMPROVE SOUND MODULE -->
							<div class="deck-card sound-improvement-card">
								<div class="card-header">
									<div>
										<span class="step-tag">STEP A</span>
										<h3>Automatic Sound Improvement</h3>
									</div>
									<button
										type="button"
										class="hw-btn hw-btn-accent"
										data-testid="improve-sound-btn"
										disabled={isProcessingSound}
										on:click={handleImproveSoundClick}
									>
										{isProcessingSound ? 'Improving…' : 'Improve sound'}
									</button>
								</div>

								<!-- Hear Original vs Hear Improved Matched-Loudness Toggle -->
								<div class="ab-comparison-bar" role="group" aria-label="Compare original and improved sound">
									<button
										type="button"
										class="ab-btn"
										class:is-selected={comparisonMode === 'original'}
										data-testid="hear-original-btn"
										on:click={() => switchComparisonMode('original')}
									>
										Hear original
									</button>
									<button
										type="button"
										class="ab-btn"
										class:is-selected={comparisonMode === 'improved'}
										data-testid="hear-improved-btn"
										on:click={() => switchComparisonMode('improved')}
									>
										Hear improved
									</button>
									<label class="toggle-chip compact-chip" title="Matches perceived loudness so volume boost alone does not bias comparison">
										<input type="checkbox" bind:checked={matchComparisonLoudness} />
										<span>Match loudness ({matchedLoudnessGainDb >= 0 ? `+${matchedLoudnessGainDb}` : matchedLoudnessGainDb} dB)</span>
									</label>
								</div>

								<!-- Rotary / Linear / Numeric Enhancement Amount Control -->
								<RotaryControl
									label="Enhancement amount"
									bind:value={currentRecording.recipe.enhancement.amount}
									onChange={handleEnhancementAmountChange}
								/>

								<div class="preview-action-row">
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										on:click={handlePreview10Seconds}
									>
										Preview 10s sample
									</button>
									{#if isProcessingSound}
										<button
											type="button"
											class="hw-btn hw-btn-danger"
											on:click={() => (cancelProcessingFlag = true)}
										>
											Cancel ({Math.round(processingProgress * 100)}%)
										</button>
									{/if}
								</div>

								{#if previewBannerText}
									<p class="preview-note">{previewBannerText}</p>
								{/if}

								<!-- Real Measurement Readout & Plain-Language Explanation -->
								{#if currentRecording.analysis}
									<div class="analysis-readout-box" data-testid="enhancement-analysis-box">
										<div class="metrics-strip">
											<div>
												<span class="metric-label">Noise floor</span>
												<strong class="mono-num">
													{currentRecording.analysis.before.noiseFloorDbfs.toFixed(1)} →
													{currentRecording.analysis.after.noiseFloorDbfs.toFixed(1)} dB
												</strong>
											</div>
											<div>
												<span class="metric-label">Loudness</span>
												<strong class="mono-num">
													{currentRecording.analysis.before.integratedLufs.toFixed(1)} →
													{currentRecording.analysis.after.integratedLufs.toFixed(1)} LUFS
												</strong>
											</div>
											<div>
												<span class="metric-label">Peak ceiling</span>
												<strong class="mono-num">
													{currentRecording.analysis.after.peakDbfs.toFixed(1)} dBFS
												</strong>
											</div>
											<div>
												<span class="metric-label">Mains hum</span>
												<strong class="mono-num">
													{currentRecording.analysis.before.humFrequencyHz
														? `${currentRecording.analysis.before.humFrequencyHz} Hz`
														: 'None'}
												</strong>
											</div>
										</div>
										<ul class="change-notes-list">
											{#each currentRecording.analysis.changeNotes as note (note)}
												<li>{note}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Collapsed Advanced Adjustments & Local Neural Speech Model -->
								<details class="more-adjustments-drawer">
									<summary>More adjustments & Local Neural Speech Model</summary>
									<div class="drawer-body">
										<label class="slider-row">
											<div class="slider-label-line">
												<span>Noise reduction</span>
												<span class="mono-num">{currentRecording.recipe.enhancement.noiseReduction}%</span>
											</div>
											<input
												type="range"
												min="0"
												max="100"
												bind:value={currentRecording.recipe.enhancement.noiseReduction}
												on:change={handleMoreAdjustmentChange}
											/>
											<small>Suppresses steady fan, air-conditioner, and room hiss.</small>
										</label>

										<label class="slider-row">
											<div class="slider-label-line">
												<span>Voice clarity</span>
												<span class="mono-num">{currentRecording.recipe.enhancement.voiceClarity}%</span>
											</div>
											<input
												type="range"
												min="0"
												max="100"
												bind:value={currentRecording.recipe.enhancement.voiceClarity}
												on:change={handleMoreAdjustmentChange}
											/>
											<small>Cuts 250 Hz boxiness and lifts 2.5 kHz vocal articulation.</small>
										</label>

										<label class="slider-row">
											<div class="slider-label-line">
												<span>Harshness (De-esser)</span>
												<span class="mono-num">{currentRecording.recipe.enhancement.harshness}%</span>
											</div>
											<input
												type="range"
												min="0"
												max="100"
												bind:value={currentRecording.recipe.enhancement.harshness}
												on:change={handleMoreAdjustmentChange}
											/>
											<small>Tames sharp sibilant “s” and “sh” bursts (4.8–9 kHz).</small>
										</label>

										<label class="slider-row">
											<div class="slider-label-line">
												<span>Volume consistency</span>
												<span class="mono-num">{currentRecording.recipe.enhancement.volumeConsistency}%</span>
											</div>
											<input
												type="range"
												min="0"
												max="100"
												bind:value={currentRecording.recipe.enhancement.volumeConsistency}
												on:change={handleMoreAdjustmentChange}
											/>
											<small>Gentle dynamic compression + loudness leveling with -1.0 dBFS peak limiting.</small>
										</label>

										<div class="checkbox-grid">
											<label class="toggle-chip">
												<input
													type="checkbox"
													bind:checked={currentRecording.recipe.enhancement.humRemoval}
													on:change={handleMoreAdjustmentChange}
												/>
												<span>50/60 Hz hum removal</span>
											</label>
											<label class="toggle-chip">
												<input
													type="checkbox"
													bind:checked={currentRecording.recipe.enhancement.echoReduction}
													on:change={handleMoreAdjustmentChange}
												/>
												<span>Room echo reduction</span>
											</label>
											<label class="toggle-chip">
												<input
													type="checkbox"
													bind:checked={currentRecording.recipe.enhancement.deClick}
													on:change={handleMoreAdjustmentChange}
												/>
												<span>De-click & mouth noise</span>
											</label>
											<label class="toggle-chip">
												<input
													type="checkbox"
													bind:checked={currentRecording.recipe.enhancement.clipRepair}
													on:change={handleMoreAdjustmentChange}
												/>
												<span>Soft-repair clipped peaks</span>
											</label>
										</div>

										<!-- On-Demand Local Neural Speech Model Section -->
										<div class="neural-model-box" data-testid="neural-model-panel">
											<div class="neural-header">
												<strong>{neuralModelStatus.name}</strong>
												<span class="mono-num">{formatBytes(neuralModelStatus.sizeBytes)}</span>
											</div>
											<p>
												Runs a 24-band Bark-scale recurrent neural mask entirely on your device to
												separate human speech modulation from steady fan noise.
											</p>
											<div class="neural-actions">
												{#if neuralModelStatus.state !== 'ready'}
													<button
														type="button"
														class="hw-btn hw-btn-accent"
														data-testid="download-neural-model-btn"
														disabled={neuralModelStatus.state === 'downloading'}
														on:click={handleDownloadNeuralModel}
													>
														{neuralModelStatus.state === 'downloading'
															? 'Loading model…'
															: `Load Local Neural Model (${formatBytes(neuralModelStatus.sizeBytes)})`}
													</button>
												{:else}
													<label class="field-label">
														<span>Active Speech Engine</span>
														<select
															class="hw-select"
															bind:value={currentRecording.recipe.enhancement.engine}
															on:change={handleMoreAdjustmentChange}
														>
															<option value="neural">Local Neural (Bark-GRU) + Spectral DSP</option>
															<option value="dsp">Standard Spectral DSP Only</option>
														</select>
													</label>
													<button
														type="button"
														class="hw-btn hw-btn-secondary"
														data-testid="remove-neural-model-btn"
														on:click={handleRemoveNeuralModel}
													>
														Remove cached model ({formatBytes(neuralModelStatus.cachedBytes)})
													</button>
												{/if}
											</div>
										</div>
									</div>
								</details>
							</div>

							<!-- 2. TRIM & NON-DESTRUCTIVE EDITING MODULE -->
							<div class="deck-card trim-edit-card">
								<div class="card-header">
									<div>
										<span class="step-tag">STEP B</span>
										<h3>Trim & Non-Destructive Edit</h3>
									</div>
									<div class="undo-redo-group">
										<button
											type="button"
											class="hw-btn hw-btn-secondary"
											disabled={currentRecording.recipe.undoStack.length === 0}
											on:click={handleUndo}
										>
											Undo
										</button>
										<button
											type="button"
											class="hw-btn hw-btn-secondary"
											disabled={currentRecording.recipe.redoStack.length === 0}
											on:click={handleRedo}
										>
											Redo
										</button>
										<button
											type="button"
											class="hw-btn hw-btn-secondary"
											data-testid="reset-to-original-btn"
											on:click={handleResetToOriginal}
										>
											Reset
										</button>
									</div>
								</div>

								<!-- Exact Trim Start / End Numeric Inputs -->
								<div class="trim-inputs-grid">
									<label class="field-label">
										<span>Trim start (sec)</span>
										<input
											type="number"
											step="0.1"
											min="0"
											max={Math.max(0, currentRecording.recipe.trimEndSec - 0.05)}
											class="hw-number-input"
											data-testid="trim-start-input"
											value={currentRecording.recipe.trimStartSec}
											on:change={(e) => {
												if (!currentRecording) return;
												const val = Number((e.currentTarget as HTMLInputElement).value);
												if (!Number.isNaN(val)) {
													void handleTrimChange(val, currentRecording.recipe.trimEndSec);
												}
											}}
										/>
									</label>

									<label class="field-label">
										<span>Trim end (sec)</span>
										<input
											type="number"
											step="0.1"
											min={currentRecording.recipe.trimStartSec + 0.05}
											max={currentRecording.durationSec}
											class="hw-number-input"
											data-testid="trim-end-input"
											value={currentRecording.recipe.trimEndSec}
											on:change={(e) => {
												if (!currentRecording) return;
												const val = Number((e.currentTarget as HTMLInputElement).value);
												if (!Number.isNaN(val)) {
													void handleTrimChange(currentRecording.recipe.trimStartSec, val);
												}
											}}
										/>
									</label>
								</div>

								<!-- Clip Operations: Cut Selection, Split, Loop -->
								<div class="clip-ops-row">
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										disabled={currentRecording.recipe.selectionStartSec === null}
										on:click={handleCutSelection}
									>
										Cut selected region
									</button>
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										on:click={handleSplitAtPlayhead}
									>
										Split at playhead ({currentRecording.recipe.segments.length})
									</button>
									<label class="toggle-chip compact-chip">
										<input
											type="checkbox"
											bind:checked={currentRecording.recipe.loopSelection}
										/>
										<span>Loop</span>
									</label>
								</div>

								<!-- Explicit, Previewable Silence Shortening -->
								<div class="silence-shortening-box">
									<div class="silence-header">
										<strong>Silence shortening (Previewable)</strong>
										<button
											type="button"
											class="hw-btn hw-btn-secondary"
											data-testid="preview-silence-btn"
											on:click={handlePreviewSilenceShortening}
										>
											Preview pauses
										</button>
									</div>
									<p class="setting-explanation">
										Detects long pauses below {currentRecording.recipe.silenceReduction.thresholdDbfs} dBFS
										and shows them on the waveform before changing anything.
									</p>
									{#if silencePreviewActive}
										<div class="silence-confirm-row" data-testid="silence-preview-summary">
											<span>
												Found {currentRecording.recipe.silenceReduction.detectedIntervals.length} pause(s)
												(saves {silenceTotalSavedSec.toFixed(2)}s).
											</span>
											<button
												type="button"
												class="hw-btn hw-btn-accent"
												disabled={currentRecording.recipe.silenceReduction.detectedIntervals.length === 0}
												on:click={handleApplySilenceShortening}
											>
												Apply shortening
											</button>
										</div>
									{/if}
								</div>

								<!-- Fade-in, Fade-out, Clip Gain & Join Compatible Recording -->
								<details class="more-adjustments-drawer">
									<summary>Fades, Clip Gain & Join Recording</summary>
									<div class="drawer-body">
										<div class="trim-inputs-grid">
											<label class="field-label">
												<span>Fade in (s)</span>
												<input
													type="number"
													step="0.1"
													min="0"
													max="10"
													class="hw-number-input"
													bind:value={currentRecording.recipe.fadeInSec}
													on:change={() => rebuildRenderedAudioBuffers(false)}
												/>
											</label>
											<label class="field-label">
												<span>Fade out (s)</span>
												<input
													type="number"
													step="0.1"
													min="0"
													max="10"
													class="hw-number-input"
													bind:value={currentRecording.recipe.fadeOutSec}
													on:change={() => rebuildRenderedAudioBuffers(false)}
												/>
											</label>
											<label class="field-label">
												<span>Clip gain (dB)</span>
												<input
													type="number"
													step="0.5"
													min="-18"
													max="18"
													class="hw-number-input"
													bind:value={currentRecording.recipe.clipGainDb}
													on:change={() => rebuildRenderedAudioBuffers(false)}
												/>
											</label>
										</div>

										<div class="join-row">
											<select
												class="hw-select"
												bind:value={joinCandidateId}
												aria-label="Select recording to join"
											>
												<option value="">Join another recording…</option>
												{#each library.filter((r) => r.id !== currentRecording?.id) as candidate (candidate.id)}
													<option value={candidate.id}>
														{candidate.title} ({candidate.durationSec.toFixed(1)}s)
													</option>
												{/each}
											</select>
											<button
												type="button"
												class="hw-btn hw-btn-secondary"
												disabled={!joinCandidateId}
												on:click={handleJoinRecording}
											>
												Join clip
											</button>
										</div>
									</div>
								</details>
							</div>

							<!-- 3. EXPORT MP4 & SHARE MODULE -->
							<div class="deck-card export-card">
								<div class="card-header">
									<div>
										<span class="step-tag">STEP C</span>
										<h3>Export & Save Small MP4</h3>
									</div>
									<button
										type="button"
										class="hw-btn hw-btn-accent"
										data-testid="export-mp4-btn"
										disabled={isExporting}
										on:click={handleExportMedia}
									>
										{isExporting
											? `Exporting (${Math.round(exportProgress * 100)}%)…`
											: 'Export MP4'}
									</button>
								</div>

								<p class="setting-explanation">
									Audio compression (above) balances quiet and loud voice dynamics. File compression
									(below) encodes compact AAC inside a genuine ISO BMFF <code>.mp4</code> container.
								</p>

								<label class="field-label">
									<span>Export format</span>
									<select
										class="hw-select"
										data-testid="export-format-select"
										bind:value={selectedExportFormat}
									>
										<option value="mp4-audio">MP4 Audio (.mp4 — AAC-LC ISO container)</option>
										<option value="m4a-audio">M4A Audio (.m4a — Apple / Podcast players)</option>
										<option value="mp4-video">
											MP4 Video with Title Card (.mp4 — H.264 + AAC for social platforms)
										</option>
										<option value="wav">Lossless WAV (.wav — 16-bit PCM archival)</option>
										<option value="original">Original Untouched Capture</option>
									</select>
								</label>

								{#if selectedExportFormat === 'mp4-audio' || selectedExportFormat === 'm4a-audio' || selectedExportFormat === 'mp4-video'}
									<label class="field-label">
										<span>AAC Bitrate & Channel Preset</span>
										<select
											class="hw-select"
											data-testid="export-preset-select"
											bind:value={selectedPresetId}
										>
											{#each Object.values(EXPORT_PRESETS) as preset (preset.id)}
												<option value={preset.id}>
													{preset.label} — {preset.description}
												</option>
											{/each}
										</select>
									</label>
								{/if}

								<div class="export-estimate-bar" data-testid="export-size-estimate">
									<div>
										<span class="metric-label">Active duration</span>
										<strong class="mono-num">{editedDurationSec.toFixed(2)}s</strong>
									</div>
									<div>
										<span class="metric-label">Estimated file size</span>
										<strong class="mono-num">~{formatBytes(estimatedExportBytes)}</strong>
									</div>
									<div>
										<span class="metric-label">10-min equivalent</span>
										<strong class="mono-num">
											~{formatBytes(
												estimateExportSizeBytes(
													600,
													selectedExportFormat,
													selectedPresetId,
													currentRecording.sampleRate
												)
											)}
										</strong>
									</div>
								</div>

								<div class="export-secondary-actions">
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										on:click={handleShareExport}
									>
										Share / Download
									</button>
									<button
										type="button"
										class="hw-btn hw-btn-secondary"
										on:click={() => currentRecording && handleBackupZip(currentRecording.id)}
									>
										Project Backup (.zip)
									</button>
								</div>

								{#if lastExportResult}
									<div class="export-verification-card" data-testid="export-verification-card">
										<strong>Verified {lastExportResult.filename}</strong>
										<span class="mono-num">
											{formatBytes(lastExportResult.actualBytes)} •
											Container: {lastExportResult.inspection.container.toUpperCase()} ({lastExportResult.inspection.majorBrand.trim()}) •
											Codec: {lastExportResult.inspection.audioCodec}
											{lastExportResult.inspection.hasVideo ? ` + ${lastExportResult.inspection.videoCodec}` : ''}
										</span>
									</div>
								{/if}

								{#if exportErrorMessage}
									<div class="error-recovery-card" role="alert">
										<strong>Export issue:</strong> {exportErrorMessage}
									</div>
								{/if}
							</div>
						</div>

						<!-- Notes & Tags Metadata Bar -->
						<div class="metadata-footer-card">
							<div class="notes-col">
								<label class="field-label">
									<span>Session notes</span>
									<textarea
										rows="2"
										class="hw-textarea"
										placeholder="Add notes, interview context, or timestamps…"
										bind:value={currentRecording.notes}
										on:change={() => currentRecording && updateRecordingMetadata(currentRecording)}
									></textarea>
								</label>
							</div>
							<div class="tags-col">
								<span class="group-title">Tags & Organisation</span>
								<div class="tags-list">
									{#each currentRecording.tags as tag (tag)}
										<span class="tag-chip">
											#{tag}
											<button
												type="button"
												aria-label="Remove tag {tag}"
												on:click={() => handleRemoveTag(tag)}
											>
												×
											</button>
										</span>
									{/each}
								</div>
								<div class="tag-add-row">
									<input
										type="text"
										class="compact-input"
										placeholder="Add tag…"
										bind:value={newTagInput}
										on:keydown={(e) => e.key === 'Enter' && handleAddTag()}
									/>
									<button type="button" class="hw-btn hw-btn-secondary" on:click={handleAddTag}>
										Add tag
									</button>
								</div>
							</div>
						</div>
					{/if}
				</section>
			{:else}
				<!-- ================= DEDICATED LIBRARY VIEW ================= -->
				<section class="hardware-panel library-full-panel" aria-label="Library view">
					<div class="library-top-controls">
						<input
							type="search"
							class="hw-search-input"
							placeholder="Search recordings by title, note, or #tag…"
							bind:value={searchQuery}
							aria-label="Search saved recordings"
						/>
						<select class="hw-select" bind:value={filterMode} aria-label="Filter by mode">
							<option value="all">All modes</option>
							<option value="speech">Speech</option>
							<option value="music">Music</option>
							<option value="ambience">Ambience</option>
						</select>
						<select class="hw-select" bind:value={sortOrder} aria-label="Sort recordings">
							<option value="newest">Newest first</option>
							<option value="oldest">Oldest first</option>
							<option value="longest">Longest duration</option>
							<option value="title">Title A–Z</option>
						</select>
						<label class="toggle-chip">
							<input type="checkbox" bind:checked={filterFavouritesOnly} />
							<span>★ Favourites</span>
						</label>
					</div>

					{#if filteredLibrary.length === 0}
						<div class="empty-editor-state">
							<h3>No matching recordings in your local library</h3>
							<p>
								Recordings stay private on this device inside IndexedDB and OPFS storage. Load the
								worked example or import an audio file to get started.
							</p>
							<div class="empty-actions">
								<button
									type="button"
									class="hw-btn hw-btn-accent"
									on:click={() => handleLoadWorkedExample('speech')}
								>
									Load Fan-Noise Speech Example
								</button>
								<button
									type="button"
									class="hw-btn hw-btn-secondary"
									on:click={() => fileImportInput?.click()}
								>
									Import audio or .zip backup
								</button>
							</div>
						</div>
					{:else}
						<div class="library-list" data-testid="library-list">
							{#each filteredLibrary as rec (rec.id)}
								<article
									class="library-item-card"
									class:is-selected={currentRecording?.id === rec.id}
								>
									<div class="lib-item-main">
										<button
											type="button"
											class="fav-btn"
											class:is-fav={rec.favourite}
											aria-label={rec.favourite ? 'Remove from favourites' : 'Mark as favourite'}
											on:click={() => handleToggleFavourite(rec)}
										>
											{rec.favourite ? '★' : '☆'}
										</button>
										<div class="lib-item-info">
											<h4>{rec.title}</h4>
											<div class="lib-meta-line">
												<span class="mono-num">{formatTimecode(rec.durationSec, false)}</span>
												<span>• {RECORDING_MODES[rec.mode].label}</span>
												<span>• {formatBytes(rec.originalByteLength)}</span>
												<span>• {new Date(rec.createdAt).toLocaleDateString()}</span>
												{#if rec.recipe.enhancement.enabled}
													<span class="enhanced-pill">Enhanced</span>
												{/if}
											</div>
											{#if rec.notes}
												<p class="lib-notes">{rec.notes}</p>
											{/if}
										</div>
									</div>

									<div class="lib-item-actions">
										<button
											type="button"
											class="hw-btn hw-btn-accent"
											on:click={() => openRecordingInEditor(rec)}
										>
											Open in Editor
										</button>
										<button
											type="button"
											class="hw-btn hw-btn-secondary"
											on:click={() => handleBackupZip(rec.id)}
										>
											Backup .zip
										</button>
										<button
											type="button"
											class="hw-btn hw-btn-danger"
											on:click={() => handleSoftDelete(rec)}
										>
											Delete
										</button>
									</div>
								</article>
							{/each}
						</div>
					{/if}

					{#if deletedLibrary.length > 0}
						<details class="trash-drawer">
							<summary>Recently deleted ({deletedLibrary.length}) — Undo or permanently delete</summary>
							<div class="trash-list">
								{#each deletedLibrary as del (del.id)}
									<div class="trash-row">
										<span>{del.title} ({formatBytes(del.originalByteLength)})</span>
										<div class="trash-actions">
											<button
												type="button"
												class="hw-btn hw-btn-secondary"
												on:click={async () => {
													await restoreDeletedRecording(del.id);
													await refreshLibraryAndStorage();
												}}
											>
												Restore
											</button>
											<button
												type="button"
												class="hw-btn hw-btn-danger"
												data-testid="permanent-delete-btn"
												on:click={() => handlePermanentDelete(del.id, del.title)}
											>
												Delete permanently
											</button>
										</div>
									</div>
								{/each}
							</div>
						</details>
					{/if}
				</section>
			{/if}
		</main>

		<!-- Desktop Companion Sidebar: Library & Device Storage Meter -->
		<aside class="companion-sidebar" aria-label="Saved library and device storage">
			<div class="sidebar-card">
				<div class="sidebar-header">
					<h2>Device Library ({library.length})</h2>
					<button
						type="button"
						class="hw-btn hw-btn-secondary compact-btn"
						on:click={() => fileImportInput?.click()}
					>
						+ Import
					</button>
				</div>

				<input
					type="search"
					class="hw-search-input compact-search"
					placeholder="Filter recordings…"
					bind:value={searchQuery}
					aria-label="Filter library sidebar"
				/>

				<div class="sidebar-recordings-list">
					{#if filteredLibrary.length === 0}
						<p class="sidebar-empty">
							No recordings yet. Record voice or load the fan-noise speech demo above.
						</p>
					{:else}
						{#each filteredLibrary as item (item.id)}
							<div
								class="sidebar-rec-row"
								class:is-current={currentRecording?.id === item.id}
							>
								<button
									type="button"
									class="sidebar-rec-select"
									on:click={() => openRecordingInEditor(item)}
								>
									<span class="rec-row-title">{item.title}</span>
									<span class="rec-row-meta mono-num">
										{formatTimecode(item.durationSec, false)} • {item.mode.toUpperCase()}
									</span>
								</button>
								<button
									type="button"
									class="sidebar-delete-btn"
									title="Delete recording"
									aria-label="Delete {item.title}"
									on:click={() => handleSoftDelete(item)}
								>
									×
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Local Storage & Quota Readout -->
				<div class="storage-Readout-box" data-testid="storage-status-box">
					<div class="storage-row">
						<span>Storage ({storageStatus.backend.toUpperCase()})</span>
						<span class="mono-num">
							{formatBytes(storageStatus.usedBytes)} / {formatBytes(storageStatus.quotaBytes)}
						</span>
					</div>
					<div class="meter-track compact-meter">
						<div
							class="meter-fill"
							style="width: {Math.max(2, Math.min(100, storageStatus.usageRatio * 100))}%;"
						></div>
					</div>
					<p class="storage-privacy-note">
						Recordings remain private on this device. Clearing site data removes browser storage —
						export MP4 or a <code>.zip</code> backup for long-term keeping.
					</p>
				</div>
			</div>
		</aside>
	</div>
</div>

<style>
	.recorder-shell {
		--rec-bg-deep: #101214;
		--rec-panel: #171a1e;
		--rec-panel-raised: #1e2228;
		--rec-text-main: #f3efe6;
		--rec-text-muted: #b5b0a6;
		--rec-accent-orange: #f26b21;
		--rec-accent-red: #e63946;
		--rec-accent-mint: #4fd18b;

		background:
			radial-gradient(circle at 18% 0%, rgba(242, 107, 33, 0.06), transparent 45%),
			var(--rec-bg-deep);
		color: var(--rec-text-main);
		min-height: calc(100vh - 4rem);
		padding: 1.25rem clamp(0.85rem, 2.5vw, 2rem) 3rem;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.mono-num {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	/* Hardware Top Bezel Header */
	.hardware-header {
		max-width: 1380px;
		margin: 0 auto 1rem;
		padding: 1rem 1.25rem;
		background: linear-gradient(180deg, #1b1f25 0%, #14171b 100%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 10px 26px rgba(0, 0, 0, 0.45);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.brand-cluster {
		display: flex;
		align-items: flex-start;
		gap: 0.9rem;
	}

	.led-cluster {
		display: flex;
		gap: 5px;
		padding-top: 6px;
	}

	.led-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.16);
	}

	.led-dot.is-lit {
		background: var(--rec-accent-mint);
		box-shadow: 0 0 6px rgba(79, 209, 139, 0.65);
	}

	.eyebrow-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.2rem;
	}

	.hardware-model {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		color: var(--rec-text-muted);
	}

	.privacy-pill {
		font-size: 0.68rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: rgba(79, 209, 139, 0.12);
		border: 1px solid rgba(79, 209, 139, 0.35);
		color: var(--rec-accent-mint);
	}

	.app-title {
		font-size: clamp(1.25rem, 2.2vw, 1.6rem);
		font-weight: 700;
		margin: 0;
		color: var(--rec-text-main);
		letter-spacing: -0.01em;
	}

	.byline {
		font-weight: 400;
		font-size: 0.95rem;
		color: var(--rec-text-muted);
	}

	.hero-sentence {
		margin: 0.2rem 0 0;
		font-size: 0.94rem;
		color: var(--rec-text-muted);
	}

	/* View Navigation Tabs */
	.view-tabs {
		display: flex;
		gap: 0.45rem;
		background: #0d0f12;
		padding: 0.32rem;
		border-radius: 9px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.view-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.5rem 0.95rem;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--rec-text-muted);
		font-size: 0.86rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 120ms ease, color 120ms ease;
	}

	.view-tab:hover {
		color: var(--rec-text-main);
	}

	.view-tab.is-active {
		background: linear-gradient(180deg, #272c34 0%, #1c2026 100%);
		color: var(--rec-text-main);
		border-color: rgba(242, 107, 33, 0.55);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
	}

	.tab-step {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.7rem;
		color: #ff985a;
	}

	.tab-indicator {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--rec-accent-orange);
	}

	.tab-count {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		padding: 0.05rem 0.38rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--rec-text-main);
	}

	/* Worked Example Strip */
	.worked-example-strip {
		max-width: 1380px;
		margin: 0 auto 1rem;
		padding: 0.75rem 1.1rem;
		background: rgba(24, 28, 34, 0.92);
		border: 1px solid rgba(242, 107, 33, 0.28);
		border-radius: 10px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
	}

	.strip-copy {
		font-size: 0.84rem;
		color: var(--rec-text-muted);
		max-width: 78ch;
	}

	.strip-copy strong {
		color: var(--rec-text-main);
		margin-right: 0.35rem;
	}

	.strip-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Workspace Responsive Layout */
	.workspace-grid {
		max-width: 1380px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1.15rem;
		align-items: start;
	}

	@media (max-width: 1080px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}
	}

	.hardware-panel {
		background: linear-gradient(180deg, #191c21 0%, #13161a 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 14px;
		padding: clamp(0.95rem, 2vw, 1.4rem);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.06),
			0 14px 34px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	/* Recessed OLED Screen Bezel */
	.oled-bezel {
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		padding: 0.85rem 1rem;
		box-shadow: inset 0 4px 14px rgba(0, 0, 0, 0.85);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.oled-top-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.status-cluster {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
		min-width: 220px;
	}

	.state-pill {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.22rem 0.55rem;
		border-radius: 4px;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.state-ready,
	.state-testing-mic {
		background: rgba(255, 255, 255, 0.08);
		color: var(--rec-text-main);
	}

	.state-recording,
	.state-countdown {
		background: rgba(230, 57, 70, 0.22);
		border: 1px solid var(--rec-accent-red);
		color: #ff858f;
	}

	.state-paused,
	.state-saving,
	.state-interrupted {
		background: rgba(242, 107, 33, 0.2);
		border: 1px solid var(--rec-accent-orange);
		color: #ff9c63;
	}

	.state-saved {
		background: rgba(79, 209, 139, 0.16);
		border: 1px solid rgba(79, 209, 139, 0.5);
		color: var(--rec-accent-mint);
	}

	.state-error {
		background: rgba(230, 57, 70, 0.25);
		border: 1px solid var(--rec-accent-red);
		color: #ff9aa2;
	}

	.title-inline-input {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 0.28rem 0.6rem;
		color: var(--rec-text-main);
		font-size: 0.9rem;
		font-weight: 600;
		flex: 1;
		max-width: 340px;
	}

	.oled-meta-readout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.74rem;
		color: var(--rec-text-muted);
	}

	.integrity-pill {
		padding: 0.15rem 0.48rem;
		border-radius: 4px;
		background: rgba(79, 209, 139, 0.12);
		border: 1px solid rgba(79, 209, 139, 0.38);
		color: var(--rec-accent-mint);
	}

	.oled-bottom-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}

	.elapsed-numerals {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: clamp(1.9rem, 3.8vw, 2.75rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: 0.03em;
		color: var(--rec-text-main);
	}

	.compact-numerals {
		font-size: 1.35rem;
	}

	.timing-subrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.25rem;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		color: var(--rec-text-muted);
	}

	.level-meter-box {
		width: min(100%, 280px);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.meter-labels {
		display: flex;
		justify-content: space-between;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.7rem;
		color: var(--rec-text-muted);
	}

	.meter-labels .is-clipping {
		color: #ff6b76;
		font-weight: 700;
	}

	.meter-track {
		width: 100%;
		height: 8px;
		background: #181c22;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.meter-fill {
		height: 100%;
		background: linear-gradient(90deg, #4fd18b 0%, #f26b21 80%, #e63946 100%);
		transition: width 60ms linear;
	}

	/* Transport Deck with Large Circular Record Button */
	.transport-deck {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1rem;
		padding: 0.85rem 1rem;
		background: #14171c;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 12px;
	}

	@media (max-width: 680px) {
		.transport-deck {
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}

	.secondary-transport-left,
	.secondary-transport-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
	}

	.secondary-transport-right {
		justify-content: flex-end;
	}

	.primary-record-well {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
		border-radius: 999px;
		background: #0c0e11;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.8);
	}

	.record-circle-btn {
		width: 88px;
		height: 88px;
		border-radius: 50%;
		background: linear-gradient(180deg, #282d35 0%, #191d22 100%);
		border: 2px solid rgba(255, 255, 255, 0.16);
		box-shadow:
			0 6px 16px rgba(0, 0, 0, 0.65),
			inset 0 1px 1px rgba(255, 255, 255, 0.18);
		color: var(--rec-text-main);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		cursor: pointer;
		transition: transform 90ms ease, border-color 120ms ease;
	}

	.record-circle-btn:hover:not(:disabled) {
		border-color: var(--rec-accent-red);
	}

	.record-circle-btn:active:not(:disabled) {
		transform: translateY(2px);
	}

	.record-circle-btn.is-active-recording {
		border-color: var(--rec-accent-red);
		box-shadow:
			0 0 18px rgba(230, 57, 70, 0.45),
			inset 0 1px 1px rgba(255, 255, 255, 0.2);
	}

	.record-core {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--rec-accent-red);
		box-shadow: 0 0 10px rgba(230, 57, 70, 0.8);
	}

	.stop-core {
		width: 22px;
		height: 22px;
		border-radius: 4px;
		background: var(--rec-accent-orange);
	}

	.record-caption {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	/* Capture Settings & Mode Cards */
	.capture-settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
		gap: 1rem;
	}

	.setting-group {
		background: #14171c;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 10px;
		padding: 0.9rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.group-title {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--rec-text-muted);
	}

	.mode-pills {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.mode-pill {
		background: #1b1f26;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.55rem 0.6rem;
		text-align: left;
		color: var(--rec-text-main);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.mode-pill strong {
		font-size: 0.84rem;
	}

	.mode-pill span {
		font-size: 0.7rem;
		color: var(--rec-text-muted);
		line-height: 1.25;
	}

	.mode-pill.is-selected {
		border-color: var(--rec-accent-orange);
		background: rgba(242, 107, 33, 0.14);
	}

	.setting-explanation {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--rec-text-muted);
	}

	.input-controls-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.65rem;
	}

	.field-label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--rec-text-muted);
	}

	.hw-select,
	.hw-number-input,
	.hw-search-input,
	.hw-textarea,
	.compact-input {
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 0.42rem 0.6rem;
		color: var(--rec-text-main);
		font-size: 0.84rem;
	}

	.hw-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.48rem 0.88rem;
		border-radius: 7px;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid rgba(255, 255, 255, 0.14);
		transition: transform 80ms ease, background 120ms ease;
	}

	.hw-btn:active:not(:disabled) {
		transform: translateY(1px);
	}

	.hw-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hw-btn-accent {
		background: linear-gradient(180deg, #f57931 0%, #d95812 100%);
		border-color: #ff9457;
		color: #0b0d0f;
		font-weight: 700;
		box-shadow: 0 3px 10px rgba(242, 107, 33, 0.35);
	}

	.hw-btn-secondary,
	.hw-btn-transport {
		background: linear-gradient(180deg, #252a32 0%, #1a1e24 100%);
		color: var(--rec-text-main);
	}

	.hw-btn-danger {
		background: rgba(230, 57, 70, 0.18);
		border-color: rgba(230, 57, 70, 0.55);
		color: #ff9aa2;
	}

	.toggle-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--rec-text-main);
		cursor: pointer;
	}

	/* Editor Deck Grid */
	.edit-deck-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(295px, 1fr));
		gap: 1rem;
	}

	.deck-card {
		background: #14171c;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 11px;
		padding: 0.95rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.step-tag {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.66rem;
		color: #ff985a;
		letter-spacing: 0.08em;
	}

	.card-header h3 {
		margin: 0.1rem 0 0;
		font-size: 0.96rem;
		color: var(--rec-text-main);
	}

	.ab-comparison-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		background: #0d0f12;
		padding: 0.35rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.ab-btn {
		flex: 1;
		padding: 0.4rem 0.65rem;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--rec-text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.ab-btn.is-selected {
		background: #232830;
		border-color: var(--rec-accent-orange);
		color: var(--rec-text-main);
	}

	.analysis-readout-box {
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.65rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.metrics-strip {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.45rem;
	}

	.metric-label {
		display: block;
		font-size: 0.68rem;
		color: var(--rec-text-muted);
	}

	.metrics-strip strong {
		font-size: 0.78rem;
		color: var(--rec-text-main);
	}

	.change-notes-list {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.76rem;
		color: var(--rec-text-muted);
		line-height: 1.4;
	}

	.more-adjustments-drawer {
		background: #101317;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.55rem 0.75rem;
	}

	.more-adjustments-drawer summary {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--rec-text-main);
		cursor: pointer;
	}

	.drawer-body {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.slider-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.78rem;
	}

	.slider-label-line {
		display: flex;
		justify-content: space-between;
		color: var(--rec-text-main);
	}

	.slider-row small {
		font-size: 0.7rem;
		color: var(--rec-text-muted);
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.neural-model-box {
		margin-top: 0.35rem;
		padding: 0.65rem;
		border-radius: 7px;
		background: rgba(242, 107, 33, 0.08);
		border: 1px solid rgba(242, 107, 33, 0.28);
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.neural-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.78rem;
	}

	.neural-model-box p {
		margin: 0;
		font-size: 0.73rem;
		color: var(--rec-text-muted);
	}

	.trim-inputs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.6rem;
	}

	.clip-ops-row,
	.export-secondary-actions,
	.preview-action-row,
	.undo-redo-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}

	.silence-shortening-box {
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.65rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.silence-header,
	.silence-confirm-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.78rem;
	}

	.export-estimate-bar {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.6rem 0.7rem;
	}

	.export-verification-card {
		background: rgba(79, 209, 139, 0.12);
		border: 1px solid rgba(79, 209, 139, 0.4);
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.76rem;
		color: var(--rec-accent-mint);
	}

	.metadata-footer-card {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 1rem;
		background: #14171c;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 10px;
		padding: 0.85rem 1rem;
	}

	@media (max-width: 760px) {
		.metadata-footer-card {
			grid-template-columns: 1fr;
		}
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0.35rem 0;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		padding: 0.15rem 0.48rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--rec-text-main);
	}

	.tag-chip button {
		background: none;
		border: none;
		color: var(--rec-text-muted);
		cursor: pointer;
		padding: 0;
	}

	/* Companion Sidebar */
	.sidebar-card {
		background: linear-gradient(180deg, #181b20 0%, #121519 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.sidebar-header h2 {
		font-size: 0.92rem;
		margin: 0;
	}

	.sidebar-recordings-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 380px;
		overflow-y: auto;
	}

	.sidebar-rec-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 7px;
		padding: 0.45rem 0.6rem;
	}

	.sidebar-rec-row.is-current {
		border-color: var(--rec-accent-orange);
		background: rgba(242, 107, 33, 0.1);
	}

	.sidebar-rec-select {
		background: none;
		border: none;
		color: var(--rec-text-main);
		text-align: left;
		cursor: pointer;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.rec-row-title {
		font-size: 0.82rem;
		font-weight: 600;
	}

	.rec-row-meta {
		font-size: 0.68rem;
		color: var(--rec-text-muted);
	}

	.sidebar-delete-btn {
		background: none;
		border: none;
		color: var(--rec-text-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
	}

	.storage-Readout-box {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.74rem;
		color: var(--rec-text-muted);
	}

	.storage-row {
		display: flex;
		justify-content: space-between;
	}

	.storage-privacy-note {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	/* Library Full View */
	.library-top-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.library-top-controls .hw-search-input {
		flex: 1;
		min-width: 220px;
	}

	.library-list {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.library-item-card {
		background: #14171c;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 0.85rem 1rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
	}

	.lib-item-main {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
	}

	.fav-btn {
		background: none;
		border: none;
		color: var(--rec-text-muted);
		font-size: 1.2rem;
		cursor: pointer;
	}

	.fav-btn.is-fav {
		color: var(--rec-accent-orange);
	}

	.lib-item-info h4 {
		margin: 0 0 0.25rem;
		font-size: 0.95rem;
	}

	.lib-meta-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		font-size: 0.75rem;
		color: var(--rec-text-muted);
	}

	.enhanced-pill {
		color: #ff985a;
		font-weight: 600;
	}

	.lib-notes {
		margin: 0.35rem 0 0;
		font-size: 0.78rem;
		color: var(--rec-text-muted);
	}

	.lib-item-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.error-recovery-card,
	.recovery-banner,
	.undo-delete-banner,
	.interruption-alert {
		max-width: 1380px;
		margin: 0 auto 0.85rem;
		padding: 0.75rem 1rem;
		border-radius: 9px;
		background: rgba(230, 57, 70, 0.14);
		border: 1px solid rgba(230, 57, 70, 0.45);
		font-size: 0.82rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.recovery-banner,
	.undo-delete-banner {
		background: rgba(242, 107, 33, 0.14);
		border-color: rgba(242, 107, 33, 0.45);
	}

	@media (prefers-reduced-motion: reduce) {
		.meter-fill,
		.hw-btn,
		.record-circle-btn,
		.view-tab {
			transition: none;
		}
	}
</style>
