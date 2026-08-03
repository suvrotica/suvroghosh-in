<script lang="ts">
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import AccessibleStrikeTable from './AccessibleStrikeTable.svelte';
	import AtlasSelector from './AtlasSelector.svelte';
	import CrossSection from './CrossSection.svelte';
	import LightningControls from './LightningControls.svelte';
	import LightningTimeline from './LightningTimeline.svelte';
	import LightningViewport from './LightningViewport.svelte';
	import MethodologyPanel from './MethodologyPanel.svelte';
	import StrikeInspector from './StrikeInspector.svelte';
	import TerrainStudyPanel from './TerrainStudyPanel.svelte';
	import {
		effectiveThunderArrivalTime,
		ThunderSynth
	} from '$lib/visualizations/lightning-atlas/audio/thunder';
	import {
		DEFAULT_ATLAS_STATE,
		ENGINE_LIMITS,
		FEATURE_LABELS,
		MODEL_VERSION,
		terrainPreset
	} from '$lib/visualizations/lightning-atlas/config';
	import {
		replayJson,
		safeFilename,
		strikeLogCsv
	} from '$lib/visualizations/lightning-atlas/exports';
	import { hashString } from '$lib/visualizations/lightning-atlas/prng';
	import {
		atlasStateQuery,
		parseAtlasState
	} from '$lib/visualizations/lightning-atlas/serialization';
	import { StormPlaybackEngine } from '$lib/visualizations/lightning-atlas/storm-engine';
	import {
		generateTerrain,
		sampleTerrainHeight
	} from '$lib/visualizations/lightning-atlas/terrain';
	import type {
		AtlasMode,
		BatchAnalysisResult,
		CameraPreset,
		FlashTypeChoice,
		LayerId,
		LightningFlash,
		PlacedFeature,
		PlaceableFeatureKind,
		QualityChoice,
		SerializableAtlasState,
		StormPhase,
		TerrainData,
		TerrainPresetId
	} from '$lib/visualizations/lightning-atlas/types';
	import {
		createLightningAtlasWorkerClient,
		type LightningAtlasWorkerClient
	} from '$lib/visualizations/lightning-atlas/worker/client';

	function cloneState(source: SerializableAtlasState): SerializableAtlasState {
		return {
			...source,
			stormPosition: { ...source.stormPosition },
			storm: { ...source.storm },
			environment: { ...source.environment },
			observer: { ...source.observer },
			visibleLayers: [...source.visibleLayers],
			placedFeatures: source.placedFeatures.map((feature) => ({ ...feature }))
		};
	}

	const playbackEngine = new StormPlaybackEngine();
	const thunder = new ThunderSynth();
	const initialAtlasState = cloneState(DEFAULT_ATLAS_STATE);
	let atlasState = $state(initialAtlasState);
	let terrain = $state<TerrainData>(
		generateTerrain(
			initialAtlasState.terrain,
			initialAtlasState.seed,
			initialAtlasState.placedFeatures,
			65,
			initialAtlasState.environment.surfaceWetness
		)
	);
	let flashLog = $state<LightningFlash[]>([]);
	let currentFlash = $state<LightningFlash | null>(null);
	let playback = $state(playbackEngine.snapshot());
	let playbackSpeed = $state(1);
	let shell: HTMLElement;
	let sceneColumn: HTMLElement;
	let viewportComponent = $state<LightningViewport | null>(null);
	let workerClient: LightningAtlasWorkerClient | null = null;
	let workerMode = $state<'idle' | 'worker' | 'fallback'>('idle');
	let nearViewport = $state(false);
	let inViewport = $state(false);
	let documentHidden = $state(false);
	let reducedMotion = $state(false);
	let busy = $state(false);
	let batchBusy = $state(false);
	let batchResult = $state<BatchAnalysisResult | null>(null);
	let comparisonResult = $state<BatchAnalysisResult | null>(null);
	let compareTerrain = $state<TerrainPresetId>('himalayan-ridge');
	let atlasOpen = $state(false);
	let crossSectionOpen = $state(false);
	let keyboardHelpOpen = $state(false);
	let crossSectionSlice = $state(0.5);
	let crossSectionOpener: HTMLElement | null = null;
	let placementKind = $state<PlaceableFeatureKind>('radio-mast');
	let placementRotation = $state(0);
	let placementX = $state(0.5);
	let placementZ = $state(0.5);
	let actionStatus = $state('A deterministic storm is ready. Sound is off.');
	let liveMessage = $state('Lightning Atlas loaded. Sound is off.');
	let soundEnabled = $state(false);
	let audioEverEnabled = $state(false);
	let soundVolume = $state(0.45);
	let compressedThunder = $state(false);
	let rendererStatus = $state<'loading' | 'ready' | 'fallback' | 'context-lost'>('loading');
	let frameQuality = $state('Auto quality awaiting measurements.');
	let strikeToken = 0;
	let batchToken = 0;
	let replaceTimer: ReturnType<typeof setTimeout> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let autoStrikeTimer: ReturnType<typeof setTimeout> | null = null;
	let motionPreferenceObserver: MutationObserver | null = null;
	let lastAnnouncedPhase: StormPhase = 'charging';
	let wasPlaying = false;
	let restoringHistory = false;
	let active = $derived(nearViewport && inViewport && !documentHidden && !atlasOpen);
	let currentPreset = $derived(terrainPreset(atlasState.terrain));
	let placementEnabled = $derived(
		atlasState.mode === 'study' &&
			atlasState.placedFeatures.length < ENGINE_LIMITS.maximumPlacedFeatures
	);
	let thunderCountdown = $derived.by(() => {
		if (!currentFlash) return null;
		const dischargeEvent = currentFlash.phaseEvents.find(
			(event) => event.phase === 'return-stroke' || event.phase === 'in-cloud-pulse'
		);
		if (!dischargeEvent || playback.time < dischargeEvent.startTime) return null;
		const arrival = effectiveThunderArrivalTime(currentFlash, compressedThunder);
		return Math.max(0, arrival - playback.time);
	});

	function rebuildTerrain(state = atlasState) {
		terrain = generateTerrain(
			state.terrain,
			state.seed,
			state.placedFeatures,
			65,
			state.environment.surfaceWetness
		);
		batchResult = null;
		comparisonResult = null;
	}

	function stateUrl(state = atlasState) {
		return `${window.location.pathname}${atlasStateQuery(state)}${window.location.hash}`;
	}

	function ensureWorkerClient() {
		workerClient ??= createLightningAtlasWorkerClient();
		workerMode = workerClient.usingFallback ? 'fallback' : 'worker';
		return workerClient;
	}

	function activateViewport() {
		nearViewport = true;
		if (!currentFlash && !busy) void restoreSelectedStrike(!reducedMotion);
	}

	function writeStateUrl(kind: 'push' | 'replace') {
		if (typeof window === 'undefined' || restoringHistory) return;
		const url = stateUrl();
		if (kind === 'push') pushState(resolve(url as '/blog/visualizations/lightning-atlas'), {});
		else replaceState(resolve(url as '/blog/visualizations/lightning-atlas'), {});
	}

	function scheduleUrlReplace() {
		if (replaceTimer) clearTimeout(replaceTimer);
		replaceTimer = setTimeout(() => writeStateUrl('replace'), 160);
	}

	function canonicalFeatureId(
		kind: PlaceableFeatureKind,
		x: number,
		z: number,
		occurrence: number
	) {
		const signature = `${kind}@${x.toFixed(3)}@${z.toFixed(3)}@${occurrence}`;
		return `placed-${hashString(signature).toString(16)}`;
	}

	function invalidateAsyncWork() {
		strikeToken += 1;
		batchToken += 1;
		workerClient?.cancelAll();
		busy = false;
		batchBusy = false;
		if (refreshTimer) clearTimeout(refreshTimer);
		if (autoStrikeTimer) clearTimeout(autoStrikeTimer);
		refreshTimer = null;
		autoStrikeTimer = null;
		thunder.cancel();
	}

	function clearAutoStrikeTimer() {
		if (autoStrikeTimer) clearTimeout(autoStrikeTimer);
		autoStrikeTimer = null;
	}

	function openAtlas() {
		clearAutoStrikeTimer();
		thunder.cancel();
		atlasOpen = true;
	}

	function closeAtlas() {
		atlasOpen = false;
	}

	function loadPlaybackFlash(flash: LightningFlash, autoplay: boolean, seekTime = 0) {
		currentFlash = flash;
		playbackEngine.load(flash, autoplay && !reducedMotion);
		if (reducedMotion) {
			const leader = flash.phaseEvents.find((event) => event.phase === 'leader');
			if (leader) playbackEngine.seek(leader.startTime + 0.001);
			playbackEngine.pause();
		} else if (seekTime > 0) {
			playbackEngine.seek(Math.min(seekTime, playbackEngine.snapshot().duration));
			if (autoplay) playbackEngine.play();
		}
		playbackEngine.setSpeed(reducedMotion ? Math.min(0.5, playbackSpeed) : playbackSpeed);
		playback = playbackEngine.snapshot();
		wasPlaying = playback.playing;
		lastAnnouncedPhase = playback.phase;
	}

	async function restoreSelectedStrike(autoplay: boolean) {
		thunder.cancel();
		const token = ++strikeToken;
		const selected = atlasState.selectedStrikeIndex;
		const firstStoredIndex = Math.max(0, selected - 11);
		const strikeIndices = Array.from(
			{ length: selected - firstStoredIndex + 1 },
			(_, index) => firstStoredIndex + index
		);
		busy = true;
		actionStatus = `Reconstructing flash history through ${selected + 1} from the shared model state.`;
		try {
			const client = ensureWorkerClient();
			const state = cloneState(atlasState);
			const results = await Promise.all(
				strikeIndices.map((strikeIndex) =>
					client.generateFlash({ state: cloneState(state), strikeIndex })
				)
			);
			workerMode = client.usingFallback ? 'fallback' : 'worker';
			if (token !== strikeToken) return;
			const selectedResult = results.at(-1);
			if (!selectedResult) throw new Error('No deterministic strike was reconstructed.');
			terrain = selectedResult.terrain;
			flashLog = results.map((result) => result.flash);
			loadPlaybackFlash(selectedResult.flash, autoplay);
			actionStatus = `${results.length} deterministic flash${results.length === 1 ? '' : 'es'} through ${selected + 1} reconstructed from seed ${atlasState.seed}.`;
		} catch (error) {
			if (token === strikeToken) {
				actionStatus =
					error instanceof Error ? error.message : 'The shared strike could not be restored.';
			}
		} finally {
			if (token === strikeToken) busy = false;
		}
	}

	function scheduleCurrentStrikeRegeneration() {
		if (!currentFlash) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			if (!currentFlash) return;
			const token = ++strikeToken;
			const previousTime = playback.time;
			const previousPlaying = playback.playing;
			const state = cloneState(atlasState);
			const client = ensureWorkerClient();
			void client
				.generateFlash({ state, strikeIndex: state.selectedStrikeIndex })
				.then((result) => {
					workerMode = client.usingFallback ? 'fallback' : 'worker';
					if (token !== strikeToken) return;
					terrain = result.terrain;
					flashLog = flashLog.map((entry) =>
						entry.strikeIndex === result.flash.strikeIndex ? result.flash : entry
					);
					if (!flashLog.some((entry) => entry.strikeIndex === result.flash.strikeIndex)) {
						flashLog = [...flashLog, result.flash].slice(-12);
					}
					loadPlaybackFlash(result.flash, previousPlaying, previousTime);
					actionStatus = 'The selected strike was regenerated from the changed model state.';
				})
				.catch((error) => {
					if (token === strikeToken) {
						actionStatus =
							error instanceof Error ? error.message : 'The strike could not be regenerated.';
					}
				});
		}, 180);
	}

	function setState(
		next: SerializableAtlasState,
		urlKind: 'push' | 'replace' | 'none' = 'replace'
	) {
		atlasState = next;
		if (urlKind === 'push') writeStateUrl('push');
		else if (urlKind === 'replace') scheduleUrlReplace();
	}

	async function callStrike(manual = true) {
		if (busy) return;
		const maximumIndex = flashLog.reduce(
			(maximum, flash) => Math.max(maximum, flash.strikeIndex),
			atlasState.selectedStrikeIndex
		);
		if (maximumIndex >= ENGINE_LIMITS.maximumStrikeIndex) {
			clearAutoStrikeTimer();
			actionStatus = 'This storm has reached 1,000 flashes. Choose New storm to continue.';
			return;
		}
		invalidateAsyncWork();
		busy = true;
		const token = ++strikeToken;
		thunder.cancel();
		const strikeIndex = maximumIndex + 1;
		actionStatus = 'The stepped leader is searching the current field.';
		try {
			const client = ensureWorkerClient();
			const result = await client.generateFlash({
				state: cloneState(atlasState),
				strikeIndex
			});
			workerMode = client.usingFallback ? 'fallback' : 'worker';
			if (token !== strikeToken) return;
			terrain = result.terrain;
			currentFlash = result.flash;
			flashLog = [...flashLog.filter((flash) => flash.strikeIndex !== strikeIndex), result.flash]
				.sort((a, b) => a.strikeIndex - b.strikeIndex)
				.slice(-12);
			atlasState = { ...atlasState, selectedStrikeIndex: strikeIndex };
			playbackEngine.load(result.flash, !reducedMotion);
			if (reducedMotion) {
				const leader = result.flash.phaseEvents.find((event) => event.phase === 'leader');
				if (leader) playbackEngine.seek(leader.startTime + 0.001);
				playbackEngine.pause();
			}
			playback = playbackEngine.snapshot();
			wasPlaying = playback.playing;
			writeStateUrl('push');
			actionStatus = manual
				? `Flash ${strikeIndex + 1} generated. Replay hash ${result.flash.channelHash}.`
				: `The live storm produced flash ${strikeIndex + 1}.`;
			liveMessage = `${playback.phaseLabel}. ${result.flash.narrative}`;
		} catch (error) {
			if (token === strikeToken) {
				actionStatus =
					error instanceof Error ? error.message : 'The strike could not be generated.';
			}
		} finally {
			if (token === strikeToken) busy = false;
		}
	}

	function selectTerrain(id: TerrainPresetId) {
		invalidateAsyncWork();
		const preset = terrainPreset(id);
		atlasState = {
			...atlasState,
			terrain: id,
			selectedStrikeIndex: 0,
			storm: { ...atlasState.storm, cloudBaseMetres: preset.cloudBaseMetres },
			environment: { ...atlasState.environment, surfaceWetness: preset.defaultWetness }
		};
		rebuildTerrain();
		void restoreSelectedStrike(atlasState.mode === 'live');
		writeStateUrl('push');
		actionStatus = `${preset.name} loaded under seed ${atlasState.seed}.`;
	}

	function selectMode(mode: AtlasMode) {
		if (mode === 'cross-section') {
			openCrossSection();
			return;
		}
		crossSectionOpen = false;
		crossSectionOpener = null;
		atlasState = { ...atlasState, mode };
		if (mode === 'replay' && currentFlash) replayLast();
		else writeStateUrl('push');
	}

	function selectFlashType(flashType: FlashTypeChoice) {
		invalidateAsyncWork();
		setState({ ...atlasState, flashType });
		scheduleCurrentStrikeRegeneration();
	}

	function updateParameter(
		section: 'storm' | 'environment' | 'stormPosition' | 'observer',
		key: string,
		value: number | boolean
	) {
		const changesModel =
			section === 'storm' ||
			section === 'stormPosition' ||
			section === 'observer' ||
			(section === 'environment' &&
				['surfaceWetness', 'conductivityProxy', 'windSpeed', 'windDirection'].includes(key));
		if (changesModel) invalidateAsyncWork();
		const next = cloneState(atlasState);
		if (section === 'storm') {
			(next.storm as unknown as Record<string, number | boolean>)[key] = value;
		} else if (section === 'environment') {
			(next.environment as unknown as Record<string, number | boolean>)[key] = value;
		} else {
			(next[section] as unknown as Record<string, number>)[key] = Number(value);
		}
		atlasState = next;
		if (changesModel) {
			batchResult = null;
			comparisonResult = null;
		}
		scheduleUrlReplace();
		if (changesModel && currentFlash) scheduleCurrentStrikeRegeneration();
		else if (section === 'environment' && key === 'surfaceWetness') {
			if (refreshTimer) clearTimeout(refreshTimer);
			const terrainState = cloneState(next);
			refreshTimer = setTimeout(() => rebuildTerrain(terrainState), 180);
		}
	}

	function toggleLayer(layer: LayerId, visible: boolean) {
		const visibleLayers = visible
			? Array.from(new Set([...atlasState.visibleLayers, layer]))
			: atlasState.visibleLayers.filter((candidate) => candidate !== layer);
		setState({ ...atlasState, visibleLayers });
	}

	function replayLast() {
		if (!currentFlash) return;
		thunder.cancel();
		atlasState = { ...atlasState, mode: 'replay' };
		playbackEngine.load(currentFlash, !reducedMotion);
		if (reducedMotion) playbackEngine.pause();
		playback = playbackEngine.snapshot();
		wasPlaying = playback.playing;
		clearAutoStrikeTimer();
		writeStateUrl('push');
		actionStatus = `Replaying stored channel ${currentFlash.channelHash}; no geometry was regenerated.`;
	}

	function replayStateFor(flash: LightningFlash): SerializableAtlasState {
		const causalState = cloneState(flash.modelState);
		return {
			...causalState,
			environment: {
				...causalState.environment,
				rainIntensity: atlasState.environment.rainIntensity,
				visibility: atlasState.environment.visibility,
				timeOfDay: atlasState.environment.timeOfDay
			},
			mode: 'replay',
			displayMode: atlasState.displayMode,
			cameraPreset: atlasState.cameraPreset,
			quality: atlasState.quality,
			visibleLayers: [...atlasState.visibleLayers],
			flashSafe: atlasState.flashSafe,
			selectedStrikeIndex: flash.strikeIndex
		};
	}

	function selectLoggedFlash(flash: LightningFlash) {
		invalidateAsyncWork();
		atlasState = replayStateFor(flash);
		rebuildTerrain(atlasState);
		currentFlash = flash;
		playbackEngine.load(flash, false);
		playback = playbackEngine.snapshot();
		wasPlaying = false;
		clearAutoStrikeTimer();
		writeStateUrl('push');
	}

	function togglePlayback() {
		if (!currentFlash) return;
		playbackEngine.toggle();
		playback = playbackEngine.snapshot();
		wasPlaying = playback.playing;
		clearAutoStrikeTimer();
		if (!playback.playing) thunder.cancel();
	}

	function seek(time: number) {
		playbackEngine.seek(time);
		playbackEngine.pause();
		thunder.cancel();
		playback = playbackEngine.snapshot();
		wasPlaying = false;
		clearAutoStrikeTimer();
	}

	function stepPhase(direction: -1 | 1) {
		playbackEngine.stepPhase(direction);
		thunder.cancel();
		playback = playbackEngine.snapshot();
		wasPlaying = playback.playing;
		clearAutoStrikeTimer();
	}

	function setPlaybackSpeed(speed: number) {
		playbackSpeed = reducedMotion ? Math.min(0.5, speed) : speed;
		playbackEngine.setSpeed(playbackSpeed);
	}

	function onFrame(delta: number) {
		const previousTime = playback.time;
		const next = playbackEngine.advance(delta);
		playback = next;
		if (next.phase !== lastAnnouncedPhase) {
			lastAnnouncedPhase = next.phase;
			liveMessage = `${next.phaseLabel}.`;
		}
		if (currentFlash && soundEnabled) {
			const dischargeEvent = currentFlash.phaseEvents.find(
				(event) => event.phase === 'return-stroke' || event.phase === 'in-cloud-pulse'
			);
			const arrival = dischargeEvent
				? effectiveThunderArrivalTime(currentFlash, compressedThunder)
				: Number.POSITIVE_INFINITY;
			if (previousTime < arrival && next.time >= arrival) thunder.schedule(currentFlash);
		}
		const reachedEnd = next.duration > 0 && next.time >= next.duration - 0.000_001;
		if (
			wasPlaying &&
			!next.playing &&
			reachedEnd &&
			atlasState.mode === 'live' &&
			!reducedMotion &&
			active
		) {
			clearAutoStrikeTimer();
			autoStrikeTimer = setTimeout(() => {
				autoStrikeTimer = null;
				if (atlasState.mode === 'live' && !reducedMotion && active) void callStrike(false);
			}, 12_000);
		}
		wasPlaying = next.playing;
	}

	function followBolt() {
		if (!currentFlash) return;
		atlasState = { ...atlasState, cameraPreset: reducedMotion ? 'attachment' : 'follow' };
		if (!reducedMotion) replayLast();
		else writeStateUrl('push');
		actionStatus = reducedMotion
			? 'Reduced motion uses a framed attachment view instead of a moving camera.'
			: 'Camera follow enabled; drag the scene to cancel it.';
	}

	function manualCamera() {
		if (atlasState.cameraPreset !== 'follow') return;
		atlasState = { ...atlasState, cameraPreset: 'overview' };
		scheduleUrlReplace();
		actionStatus = 'Camera follow cancelled by manual input.';
	}

	function openCrossSection() {
		if (crossSectionOpen) return;
		crossSectionOpener =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		crossSectionOpen = true;
		atlasState = { ...atlasState, mode: 'cross-section' };
		writeStateUrl('push');
		setTimeout(() => {
			const section = document.getElementById('lightning-atlas-cross-section');
			section?.focus({ preventScroll: true });
			section?.scrollIntoView({ block: 'nearest' });
		}, 0);
	}

	function closeCrossSection() {
		const opener =
			crossSectionOpener ?? document.getElementById('lightning-atlas-cross-section-trigger');
		crossSectionOpen = false;
		if (atlasState.mode === 'cross-section') atlasState = { ...atlasState, mode: 'study' };
		scheduleUrlReplace();
		crossSectionOpener = null;
		setTimeout(() => opener?.focus({ preventScroll: true }), 0);
	}

	async function toggleSound() {
		if (soundEnabled) {
			soundEnabled = false;
			await thunder.suspend();
			actionStatus = 'Sound off; pending thunder cancelled.';
			return;
		}
		const enabled = await thunder.enable();
		soundEnabled = enabled;
		audioEverEnabled ||= enabled;
		thunder.setVolume(soundVolume);
		actionStatus = enabled
			? 'Sound on. Thunder will retain its visible distance delay.'
			: 'This browser does not expose Web Audio.';
	}

	function setVolume(volume: number) {
		soundVolume = volume;
		thunder.setVolume(volume);
	}

	function createReadableSeed() {
		const values = new Uint32Array(1);
		crypto.getRandomValues(values);
		return `storm-${values[0].toString(36)}`;
	}

	function newStorm() {
		invalidateAsyncWork();
		atlasState = { ...atlasState, seed: createReadableSeed(), selectedStrikeIndex: 0 };
		rebuildTerrain();
		void restoreSelectedStrike(atlasState.mode === 'live');
		writeStateUrl('push');
		actionStatus = `New deterministic seed: ${atlasState.seed}.`;
	}

	function applySeed(raw: string) {
		const seed = raw
			.trim()
			.replace(/[^a-zA-Z0-9._~-]/g, '-')
			.slice(0, 64);
		if (!seed || seed === atlasState.seed) return;
		invalidateAsyncWork();
		atlasState = { ...atlasState, seed, selectedStrikeIndex: 0 };
		rebuildTerrain();
		void restoreSelectedStrike(false);
		writeStateUrl('push');
		actionStatus = `Seed ${seed} applied.`;
	}

	function resetScene() {
		invalidateAsyncWork();
		atlasState = cloneState(DEFAULT_ATLAS_STATE);
		if (reducedMotion) atlasState.displayMode = 'field-map';
		rebuildTerrain();
		void restoreSelectedStrike(!reducedMotion);
		crossSectionOpen = false;
		batchResult = null;
		comparisonResult = null;
		writeStateUrl('push');
		actionStatus = 'The default Monsoon Delta storm has been restored.';
	}

	function placeFeature(position: { x: number; z: number }) {
		if (atlasState.placedFeatures.length >= ENGINE_LIMITS.maximumPlacedFeatures) {
			actionStatus = 'The scene already contains the maximum of 20 user features.';
			return;
		}
		invalidateAsyncWork();
		const x = Math.max(0, Math.min(1, position.x));
		const z = Math.max(0, Math.min(1, position.z));
		let occurrence = 0;
		let id = canonicalFeatureId(placementKind, x, z, occurrence);
		while (atlasState.placedFeatures.some((feature) => feature.id === id)) {
			occurrence += 1;
			id = canonicalFeatureId(placementKind, x, z, occurrence);
		}
		const feature: PlacedFeature = {
			id,
			kind: placementKind,
			x,
			z,
			rotation: placementRotation
		};
		atlasState = { ...atlasState, placedFeatures: [...atlasState.placedFeatures, feature] };
		placementX = x;
		placementZ = z;
		rebuildTerrain();
		scheduleCurrentStrikeRegeneration();
		writeStateUrl('push');
		actionStatus = `${FEATURE_LABELS[placementKind]} placed. It changes model odds, not certainty.`;
	}

	function removeFeature(id: string) {
		invalidateAsyncWork();
		atlasState = {
			...atlasState,
			placedFeatures: atlasState.placedFeatures.filter((feature) => feature.id !== id)
		};
		rebuildTerrain();
		scheduleCurrentStrikeRegeneration();
		writeStateUrl('push');
	}

	function clearFeatures() {
		invalidateAsyncWork();
		atlasState = { ...atlasState, placedFeatures: [] };
		rebuildTerrain();
		scheduleCurrentStrikeRegeneration();
		writeStateUrl('push');
		actionStatus = 'All user-placed features removed.';
	}

	async function runBatch(comparison = false) {
		if (batchBusy) return;
		batchBusy = true;
		const token = ++batchToken;
		try {
			const client = ensureWorkerClient();
			let state = cloneState(atlasState);
			if (comparison) {
				const preset = terrainPreset(compareTerrain);
				state = {
					...cloneState(atlasState),
					terrain: compareTerrain,
					placedFeatures: [],
					storm: { ...atlasState.storm, cloudBaseMetres: preset.cloudBaseMetres },
					environment: { ...atlasState.environment, surfaceWetness: preset.defaultWetness }
				};
			}
			const result = await client.analyseBatch({ state, runs: 100 });
			workerMode = client.usingFallback ? 'fallback' : 'worker';
			if (token !== batchToken) return;
			if (comparison) comparisonResult = result;
			else batchResult = result;
			actionStatus = `${result.runs} virtual flashes analysed in ${Math.round(result.durationMs)} ms. Frequencies belong only to this model.`;
		} catch (error) {
			if (token === batchToken) {
				actionStatus = error instanceof Error ? error.message : 'Batch analysis failed.';
			}
		} finally {
			if (token === batchToken) batchBusy = false;
		}
	}

	async function shareStorm() {
		const url = new URL(stateUrl(), window.location.origin).toString();
		try {
			await navigator.clipboard.writeText(url);
			actionStatus = 'Permanent storm URL copied.';
		} catch {
			actionStatus = 'Copy was blocked. The address bar contains the current storm state.';
			writeStateUrl('replace');
		}
	}

	function downloadBlob(blob: Blob, filename: string) {
		const href = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = href;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(href), 0);
	}

	function saveReplay() {
		if (!currentFlash) return;
		const causalState = currentFlash.modelState;
		downloadBlob(
			new Blob([replayJson(atlasState, currentFlash)], { type: 'application/json' }),
			`${safeFilename(`${causalState.seed}-${currentFlash.strikeIndex + 1}`)}-replay.json`
		);
		actionStatus = 'Versioned replay JSON saved.';
	}

	function saveCsv() {
		if (!flashLog.length) return;
		downloadBlob(
			new Blob([strikeLogCsv(flashLog)], { type: 'text/csv;charset=utf-8' }),
			`${safeFilename(atlasState.seed)}-strike-log.csv`
		);
		actionStatus = 'Accessible strike-log CSV saved.';
	}

	function drawAnalyticalStormScene(
		context: CanvasRenderingContext2D,
		state: SerializableAtlasState,
		flash: LightningFlash
	) {
		const recordTerrain = generateTerrain(
			state.terrain,
			state.seed,
			state.placedFeatures,
			65,
			state.environment.surfaceWetness
		);
		const sceneHeight = 760;
		const floor = Math.min(-40, recordTerrain.minHeight - 80);
		const channelCeiling = flash.segments.reduce(
			(maximum, segment) => Math.max(maximum, segment.start.y, segment.end.y),
			state.storm.cloudBaseMetres
		);
		const ceiling = Math.max(
			channelCeiling + 220,
			state.storm.cloudBaseMetres * 1.55,
			recordTerrain.maxHeight + 800
		);
		const project = (point: { x: number; y: number; z: number }) => ({
			x:
				80 +
				(point.x / recordTerrain.widthMetres + 0.5) * 1_440 +
				(point.z / recordTerrain.depthMetres) * 90,
			y: 700 - ((point.y - floor) / Math.max(1, ceiling - floor)) * 620
		});

		const sky = context.createLinearGradient(0, 0, 0, sceneHeight);
		sky.addColorStop(0, '#050914');
		sky.addColorStop(0.58, '#14233a');
		sky.addColorStop(1, '#263343');
		context.fillStyle = sky;
		context.fillRect(0, 0, 1600, sceneHeight);

		const stormWorldX = (state.stormPosition.x - 0.5) * recordTerrain.widthMetres;
		const stormWorldZ = (state.stormPosition.z - 0.5) * recordTerrain.depthMetres;
		const cloud = project({ x: stormWorldX, y: state.storm.cloudBaseMetres + 420, z: stormWorldZ });
		const cloudGradient = context.createRadialGradient(cloud.x, cloud.y, 20, cloud.x, cloud.y, 420);
		cloudGradient.addColorStop(0, 'rgba(151, 166, 198, 0.52)');
		cloudGradient.addColorStop(0.52, 'rgba(76, 89, 119, 0.42)');
		cloudGradient.addColorStop(1, 'rgba(16, 28, 48, 0)');
		context.fillStyle = cloudGradient;
		context.beginPath();
		context.ellipse(cloud.x, cloud.y, 510, 145, -0.04, 0, Math.PI * 2);
		context.fill();

		context.strokeStyle = 'rgba(145, 174, 203, 0.18)';
		context.lineWidth = 2;
		const rainCount = Math.round(state.environment.rainIntensity * 130);
		for (let index = 0; index < rainCount; index += 1) {
			const x = (index * 137 + hashString(state.seed)) % 1_600;
			const y = 160 + ((index * 73) % 430);
			context.beginPath();
			context.moveTo(x, y);
			context.lineTo(x - 7, y + 32);
			context.stroke();
		}

		const terrainZ = stormWorldZ;
		context.beginPath();
		context.moveTo(0, sceneHeight);
		for (let index = 0; index <= 180; index += 1) {
			const fraction = index / 180;
			const x = (fraction - 0.5) * recordTerrain.widthMetres;
			const y = sampleTerrainHeight(recordTerrain, x, terrainZ);
			const screen = project({ x, y, z: terrainZ });
			context.lineTo(screen.x, screen.y);
		}
		context.lineTo(1_600, sceneHeight);
		context.closePath();
		const ground = context.createLinearGradient(0, 500, 0, sceneHeight);
		ground.addColorStop(0, '#26342f');
		ground.addColorStop(1, '#09100f');
		context.fillStyle = ground;
		context.fill();

		context.lineCap = 'round';
		context.lineJoin = 'round';
		for (const segment of flash.segments) {
			const start = project(segment.start);
			const end = project(segment.end);
			context.strokeStyle = segment.isMainChannel
				? 'rgba(235, 241, 255, 0.98)'
				: 'rgba(161, 184, 231, 0.68)';
			context.lineWidth = segment.isMainChannel ? 4.4 : Math.max(0.8, segment.energy * 2.2);
			context.beginPath();
			context.moveTo(start.x, start.y);
			context.lineTo(end.x, end.y);
			context.stroke();
		}
		context.strokeStyle = 'rgba(240, 199, 105, 0.92)';
		context.lineWidth = 2.4;
		for (const streamer of flash.streamers) {
			const start = project(streamer.start);
			const end = project(streamer.end);
			context.beginPath();
			context.moveTo(start.x, start.y);
			context.lineTo(end.x, end.y);
			context.stroke();
		}
		if (flash.attachment) {
			const point = project(flash.attachment.position);
			const ring = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 90);
			ring.addColorStop(0, 'rgba(232, 225, 162, 0.42)');
			ring.addColorStop(1, 'rgba(232, 225, 162, 0)');
			context.fillStyle = ring;
			context.beginPath();
			context.ellipse(point.x, point.y + 6, 90, 24, 0, 0, Math.PI * 2);
			context.fill();
		}

		context.fillStyle = 'rgba(225, 232, 244, 0.72)';
		context.font = '18px ui-monospace, monospace';
		context.fillText('ANALYTICAL MODEL PROJECTION · WEBGL FALLBACK', 36, 42);
	}

	function flashMatchesCurrentModel(flash: LightningFlash): boolean {
		const causalShape = (state: SerializableAtlasState) => ({
			seed: state.seed,
			terrain: state.terrain,
			flashType: state.flashType,
			stormPosition: state.stormPosition,
			storm: state.storm,
			environment: {
				windSpeed: state.environment.windSpeed,
				windDirection: state.environment.windDirection,
				surfaceWetness: state.environment.surfaceWetness,
				conductivityProxy: state.environment.conductivityProxy
			},
			observer: state.observer,
			placedFeatures: state.placedFeatures,
			selectedStrikeIndex: state.selectedStrikeIndex
		});
		return (
			JSON.stringify(causalShape(atlasState)) === JSON.stringify(causalShape(flash.modelState))
		);
	}

	async function saveStormRecord() {
		if (!currentFlash) return;
		try {
			const causalState = replayStateFor(currentFlash);
			const causalPreset = terrainPreset(causalState.terrain);
			const output = document.createElement('canvas');
			output.width = 1600;
			output.height = 1000;
			const context = output.getContext('2d');
			if (!context) throw new Error('Canvas export is unavailable.');
			const source =
				rendererStatus === 'ready' && flashMatchesCurrentModel(currentFlash)
					? viewportComponent?.captureCanvas()
					: null;
			if (source?.width && source.height) {
				context.fillStyle = '#07101f';
				context.fillRect(0, 0, output.width, output.height);
				context.drawImage(source, 0, 0, source.width, source.height, 0, 0, 1600, 760);
			} else {
				drawAnalyticalStormScene(context, causalState, currentFlash);
			}
			const gradient = context.createLinearGradient(0, 700, 0, 1000);
			gradient.addColorStop(0, 'rgba(5,10,20,0.25)');
			gradient.addColorStop(0.2, 'rgba(5,10,20,0.94)');
			gradient.addColorStop(1, '#050a14');
			context.fillStyle = gradient;
			context.fillRect(0, 680, 1600, 320);
			context.fillStyle = '#f4f6fb';
			context.font = '700 48px system-ui, sans-serif';
			context.fillText('Lightning Atlas — Storm Record', 70, 775);
			context.fillStyle = '#9fb0c7';
			context.font = '25px system-ui, sans-serif';
			const fields = [
				`${causalPreset.name} · seed ${causalState.seed} · ${currentFlash.type}`,
				`Simulated attachment: ${currentFlash.attachment?.label ?? 'intra-cloud'} · ${currentFlash.branchCount} branches · relative intensity ${currentFlash.relativeIntensity.toFixed(2)}`,
				`Simulated channel ${(currentFlash.channelLengthMetres / 1_000).toFixed(2)} km · observer ${(currentFlash.observerDistanceMetres / 1_000).toFixed(2)} km · thunder ${currentFlash.thunderDelaySeconds.toFixed(1)} s`
			];
			fields.forEach((field, index) => context.fillText(field, 72, 830 + index * 38));
			context.fillStyle = '#6f8099';
			context.font = '19px system-ui, sans-serif';
			context.fillText(
				'Physically inspired procedural model — not weather, detection, safety or engineering guidance · suvroghosh.in',
				72,
				965
			);
			const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
			if (!blob) throw new Error('Storm Record PNG could not be encoded.');
			downloadBlob(
				blob,
				`${safeFilename(`${causalState.seed}-${currentFlash.strikeIndex + 1}`)}-storm-record.png`
			);
			actionStatus = 'Storm Record PNG saved.';
		} catch (error) {
			actionStatus = error instanceof Error ? error.message : 'Storm Record export failed.';
		}
	}

	function handleKeyboard(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (!shell?.contains(target)) return;
		if (target.matches('input, select, textarea, button, [contenteditable="true"]')) return;
		const key = event.key.toLocaleLowerCase('en');
		if (event.key === ' ') {
			event.preventDefault();
			togglePlayback();
		} else if (key === 'l') {
			event.preventDefault();
			void callStrike();
		} else if (key === 'r') {
			replayLast();
		} else if (key === 'n') {
			newStorm();
		} else if (key === 'f') {
			followBolt();
		} else if (key === 'c') {
			if (crossSectionOpen) closeCrossSection();
			else openCrossSection();
		} else if (key === 'm') {
			atlasState = {
				...atlasState,
				displayMode: atlasState.displayMode === 'night' ? 'field-map' : 'night'
			};
			scheduleUrlReplace();
		} else if (key === 's') {
			if (audioEverEnabled) void toggleSound();
			else actionStatus = 'Activate Sound once with its button before using the S shortcut.';
		} else if (event.key === 'ArrowLeft') {
			stepPhase(-1);
		} else if (event.key === 'ArrowRight') {
			stepPhase(1);
		} else if (event.key === 'Escape') {
			closeAtlas();
			keyboardHelpOpen = false;
			if (atlasState.cameraPreset === 'follow') manualCamera();
		} else if (key === '?') {
			keyboardHelpOpen = !keyboardHelpOpen;
		}
	}

	onMount(() => {
		documentHidden = document.hidden;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motionQuery.matches || document.documentElement.dataset.motion === 'still';
			if (reducedMotion) {
				atlasState = { ...atlasState, displayMode: 'field-map' };
				playbackEngine.pause();
				playback = playbackEngine.snapshot();
				wasPlaying = false;
				clearAutoStrikeTimer();
			}
		};
		const updateVisibility = () => {
			documentHidden = document.hidden;
			if (documentHidden) {
				thunder.cancel();
				if (autoStrikeTimer) clearTimeout(autoStrikeTimer);
			}
		};
		updateMotion();
		restoringHistory = true;
		atlasState = parseAtlasState(window.location.href);
		crossSectionOpen = atlasState.mode === 'cross-section';
		if (reducedMotion && !new URLSearchParams(window.location.search).has('display')) {
			atlasState.displayMode = 'field-map';
		}
		rebuildTerrain();
		restoringHistory = false;

		const lazyObserver = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					activateViewport();
					lazyObserver.disconnect();
				}
			},
			{ rootMargin: '360px 0px' }
		);
		const activityObserver = new IntersectionObserver(
			(entries) => {
				inViewport = entries.some(
					(entry) => entry.isIntersecting && entry.intersectionRatio > 0.01
				);
				if (!inViewport) {
					thunder.cancel();
					if (autoStrikeTimer) clearTimeout(autoStrikeTimer);
				}
			},
			{ threshold: [0, 0.01, 0.25] }
		);
		lazyObserver.observe(shell);
		activityObserver.observe(sceneColumn);

		const handlePopState = () => {
			invalidateAsyncWork();
			restoringHistory = true;
			atlasState = parseAtlasState(window.location.href);
			rebuildTerrain();
			void restoreSelectedStrike(false);
			crossSectionOpen = atlasState.mode === 'cross-section';
			restoringHistory = false;
		};
		window.addEventListener('popstate', handlePopState);
		window.addEventListener('site-motion-change', updateMotion);
		document.addEventListener('visibilitychange', updateVisibility);
		motionQuery.addEventListener('change', updateMotion);
		motionPreferenceObserver = new MutationObserver(updateMotion);
		motionPreferenceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});

		return () => {
			strikeToken += 1;
			batchToken += 1;
			if (replaceTimer) clearTimeout(replaceTimer);
			if (refreshTimer) clearTimeout(refreshTimer);
			if (autoStrikeTimer) clearTimeout(autoStrikeTimer);
			lazyObserver.disconnect();
			activityObserver.disconnect();
			motionPreferenceObserver?.disconnect();
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('site-motion-change', updateMotion);
			document.removeEventListener('visibilitychange', updateVisibility);
			motionQuery.removeEventListener('change', updateMotion);
			workerClient?.dispose();
			workerClient = null;
			void thunder.dispose();
		};
	});
</script>

<svelte:window onkeydown={handleKeyboard} />

<figure
	bind:this={shell}
	class:field-map={atlasState.displayMode === 'field-map'}
	class="lightning-atlas article-breakout not-prose"
	data-display-mode={atlasState.displayMode}
	data-worker-mode={workerMode}
	inert={atlasOpen}
	aria-hidden={atlasOpen ? 'true' : undefined}
>
	<div class="atlas-js">
		<header class="atlas-header">
			<div class="title-lockup">
				<p>Atmospheric electricity field instrument · {MODEL_VERSION}</p>
				<h2>Lightning Atlas: How the Sky Finds the Ground</h2>
				<span
					>A procedural storm laboratory for watching charge, terrain, and chance negotiate a route
					through the night.</span
				>
			</div>
			<div class="instrument-status">
				<label>
					<span>Reproducible seed</span>
					<input
						value={atlasState.seed}
						maxlength="64"
						onchange={(event) => applySeed(event.currentTarget.value)}
					/>
				</label>
				<div>
					<span class="status-dot" class:active={playback.playing}></span><strong
						>{playback.phaseLabel}</strong
					>
				</div>
				<small>Physically inspired procedural model</small>
			</div>
		</header>

		<div class="safety-strip">
			<span
				><strong>Flash-safe mode {atlasState.flashSafe ? 'on' : 'off'}</strong> · sound {soundEnabled
					? 'on'
					: 'off'}</span
			>
			{#if thunderCountdown !== null && thunderCountdown > 0}
				<span class="thunder-countdown">Thunder in {thunderCountdown.toFixed(1)} s</span>
			{:else if currentFlash && thunderCountdown === 0}
				<span class="thunder-countdown">Thunder arrival</span>
			{/if}
			<button
				type="button"
				aria-expanded={keyboardHelpOpen}
				aria-controls="lightning-atlas-keyboard-help"
				onclick={() => (keyboardHelpOpen = !keyboardHelpOpen)}>Keyboard help</button
			>
		</div>

		{#if keyboardHelpOpen}
			<section
				id="lightning-atlas-keyboard-help"
				class="keyboard-help"
				aria-labelledby="keyboard-help-heading"
			>
				<h3 id="keyboard-help-heading">Keyboard controls</h3>
				<p>
					When focus is inside the exhibit and not in a form control: Space play/pause · L strike ·
					R replay · N new seed · F follow · C cross-section · M presentation · S sound after
					activation · arrows step · Escape close · ? help.
				</p>
			</section>
		{/if}

		<div class="laboratory-grid">
			<div class="controls-column">
				<LightningControls
					state={atlasState}
					playing={playback.playing}
					{busy}
					hasFlash={Boolean(currentFlash)}
					{soundEnabled}
					{crossSectionOpen}
					{soundVolume}
					{compressedThunder}
					{placementKind}
					{placementRotation}
					{placementX}
					{placementZ}
					{actionStatus}
					oncall={() => void callStrike()}
					onreplay={replayLast}
					onnewseed={newStorm}
					onplaytoggle={togglePlayback}
					onfollow={followBolt}
					onatlas={openAtlas}
					onshare={() => void shareStorm()}
					onsound={() => void toggleSound()}
					oncrosssection={() => (crossSectionOpen ? closeCrossSection() : openCrossSection())}
					onreset={resetScene}
					onmode={selectMode}
					onterrain={selectTerrain}
					onflash={selectFlashType}
					ondisplay={(displayMode) => setState({ ...atlasState, displayMode })}
					onquality={(quality: QualityChoice) => setState({ ...atlasState, quality })}
					oncamera={(cameraPreset: CameraPreset) => setState({ ...atlasState, cameraPreset })}
					onparameter={updateParameter}
					onlayer={toggleLayer}
					onflashsafe={(flashSafe) => setState({ ...atlasState, flashSafe })}
					onplacementkind={(kind) => (placementKind = kind)}
					onplacementrotation={(rotation) => (placementRotation = rotation)}
					onplacementcoordinate={(axis, value) =>
						axis === 'x'
							? (placementX = Math.max(0, Math.min(1, value)))
							: (placementZ = Math.max(0, Math.min(1, value)))}
					onplacekeyboard={() => placeFeature({ x: placementX, z: placementZ })}
					onremovefeature={removeFeature}
					onclearfeatures={clearFeatures}
					onvolume={setVolume}
					oncompressedthunder={(value) => (compressedThunder = value)}
				/>
			</div>

			<div class="scene-column" bind:this={sceneColumn}>
				{#if nearViewport}
					<LightningViewport
						bind:this={viewportComponent}
						{atlasState}
						{terrain}
						flash={currentFlash}
						phase={playback.phase}
						phaseProgress={playback.phaseProgress}
						playbackTime={playback.time}
						{active}
						playing={playback.playing}
						motionAllowed={!reducedMotion}
						{placementEnabled}
						onframe={onFrame}
						onplace={placeFeature}
						onstatus={(status, message) => {
							rendererStatus = status;
							actionStatus = message;
						}}
						onquality={(quality, frameMs) =>
							(frameQuality = `${quality} rendering · ${frameMs.toFixed(1)} ms average frame`)}
						onmanualcamera={manualCamera}
					/>
				{:else}
					<div class="static-poster">
						<img
							src="/images/lightning-atlas.png"
							alt="A dark procedural storm over a monsoon landscape, with a branching leader descending towards several faint upward streamers"
							width="1600"
							height="900"
						/>
						<button type="button" onclick={activateViewport}>Start the storm instrument</button>
					</div>
				{/if}
				<div class="scene-telemetry">
					<span>{currentPreset.name}</span>
					<span>charge {Math.round(playback.chargeReservoir * 100)}%</span>
					<span>{currentFlash ? `${currentFlash.branchCount} branches` : 'channel pending'}</span>
					<span>{frameQuality}</span>
				</div>
			</div>

			<div class="inspector-column">
				<StrikeInspector
					flash={currentFlash}
					phaseLabel={playback.phaseLabel}
					playing={playback.playing}
				/>
			</div>
		</div>

		<LightningTimeline
			flash={currentFlash}
			time={playback.time}
			duration={playback.duration}
			playing={playback.playing}
			phaseLabel={playback.phaseLabel}
			speed={playbackSpeed}
			onseek={seek}
			onstep={stepPhase}
			onplaytoggle={togglePlayback}
			onspeed={setPlaybackSpeed}
		/>

		{#if crossSectionOpen}
			<CrossSection
				state={atlasState}
				{terrain}
				flash={currentFlash}
				slice={crossSectionSlice}
				onslice={(value) => (crossSectionSlice = value)}
				onclose={closeCrossSection}
			/>
		{/if}

		{#if atlasState.mode === 'study'}
			<TerrainStudyPanel
				result={batchResult}
				comparison={comparisonResult}
				busy={batchBusy}
				{compareTerrain}
				onrun={() => void runBatch(false)}
				oncompare={() => void runBatch(true)}
				oncompareterrain={(terrainId) => (compareTerrain = terrainId)}
			/>
		{/if}

		<section class="artifact-bar" aria-label="Storm artifacts">
			<div>
				<strong>Carry-away storm record</strong>
				<span>Every derived number is labelled as simulated.</span>
			</div>
			<button type="button" onclick={saveStormRecord} disabled={!currentFlash}
				>Save storm record</button
			>
			<button type="button" onclick={saveReplay} disabled={!currentFlash}>Save replay JSON</button>
			<button type="button" onclick={saveCsv} disabled={!flashLog.length}>Save strike CSV</button>
		</section>

		<section class="accessible-view" aria-labelledby="accessible-storm-heading">
			<div class="accessible-heading">
				<div>
					<p>Text and table view</p>
					<h3 id="accessible-storm-heading">The same storm without the canvas</h3>
				</div>
				<dl>
					<div>
						<dt>Terrain</dt>
						<dd>{currentPreset.name}</dd>
					</div>
					<div>
						<dt>Seed</dt>
						<dd>{atlasState.seed}</dd>
					</div>
					<div>
						<dt>Phase</dt>
						<dd>{playback.phaseLabel}</dd>
					</div>
					<div>
						<dt>Storm position</dt>
						<dd>
							{atlasState.stormPosition.x.toFixed(2)}, {atlasState.stormPosition.z.toFixed(2)}
						</dd>
					</div>
				</dl>
			</div>
			{#if currentFlash}<p class="screen-reader-narrative">{currentFlash.narrative}</p>{/if}
			<AccessibleStrikeTable
				flashes={flashLog}
				selectedIndex={atlasState.selectedStrikeIndex}
				onselect={selectLoggedFlash}
			/>
		</section>

		<MethodologyPanel state={atlasState} oncopied={(message) => (actionStatus = message)} />
	</div>

	<noscript>
		<style>
			.lightning-atlas .atlas-js {
				display: none !important;
			}
		</style>
		<div class="noscript-fallback">
			<img
				src="/images/lightning-atlas.png"
				alt="A static procedural lightning study over a monsoon landscape"
				width="1600"
				height="900"
			/>
			<h3>Static Lightning Atlas</h3>
			<p>
				The interactive model needs JavaScript. The poster preserves a negative cloud-to-ground
				sequence: a branched leader descends, several upward streamers rise, one connects, and the
				bright return stroke follows the established channel upward. The article below explains
				every stage and the model's limits.
			</p>
		</div>
	</noscript>

	<p class="sr-only" aria-live="polite">{liveMessage}</p>
</figure>

<AtlasSelector
	open={atlasOpen}
	selected={atlasState.terrain}
	{reducedMotion}
	onselect={selectTerrain}
	onclose={closeAtlas}
/>

<style>
	.lightning-atlas {
		--atlas-bg: #07101f;
		--atlas-panel: #0d1727;
		--atlas-panel-strong: #091321;
		--atlas-control: #152235;
		--atlas-line: #2c3b52;
		--atlas-text: #dce5f2;
		--atlas-text-strong: #f5f7fb;
		--atlas-muted: #91a0b5;
		--atlas-accent: #aebfff;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(96vw, 94rem);
		margin-block: 2.25rem;
		overflow: hidden;
		transform: translateX(-50%);
		border: 1px solid var(--atlas-line);
		border-radius: 0.8rem;
		background: var(--atlas-bg);
		box-shadow: 0 2rem 5rem rgb(2 8 18 / 0.28);
		color: var(--atlas-text);
		font-family: Roboto, system-ui, sans-serif;
	}

	.lightning-atlas.field-map {
		--atlas-bg: #d7d0bd;
		--atlas-panel: #e2dccb;
		--atlas-panel-strong: #ece6d6;
		--atlas-control: #d0c7b2;
		--atlas-line: #99907a;
		--atlas-text: #252a2f;
		--atlas-text-strong: #171b20;
		--atlas-muted: #5e615e;
		--atlas-accent: #435576;
		box-shadow: 0 1.2rem 3rem rgb(55 49 36 / 0.2);
	}

	.lightning-atlas :global(button),
	.lightning-atlas :global(select),
	.lightning-atlas input:not([type='range']):not([type='checkbox']) {
		min-height: 2.75rem;
	}

	.atlas-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		border-bottom: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 1.1rem 1.25rem;
	}

	.title-lockup {
		max-width: 52rem;
	}
	.title-lockup p,
	.title-lockup h2,
	.title-lockup span {
		margin: 0;
	}
	.title-lockup p {
		color: var(--atlas-accent);
		font:
			0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.title-lockup h2 {
		margin-top: 0.28rem;
		color: var(--atlas-text-strong);
		font-size: clamp(1.25rem, 2.1vw, 2rem);
		line-height: 1.1;
	}
	.title-lockup span {
		display: block;
		margin-top: 0.4rem;
		color: var(--atlas-muted);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.instrument-status {
		display: grid;
		min-width: 15rem;
		gap: 0.35rem;
	}
	.instrument-status label {
		display: grid;
		gap: 0.18rem;
	}
	.instrument-status label span,
	.instrument-status small {
		color: var(--atlas-muted);
		font:
			0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.instrument-status input {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.4rem 0.6rem;
		color: var(--atlas-text);
		font:
			0.76rem 'Courier Prime',
			monospace;
	}
	.instrument-status > div {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.76rem;
	}
	.status-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #788394;
	}
	.status-dot.active {
		background: #c6d36e;
		box-shadow: 0 0 0 0.2rem rgb(198 211 110 / 0.14);
	}

	.safety-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--atlas-line);
		background: color-mix(in srgb, var(--atlas-panel) 86%, #7b6427 14%);
		padding: 0.5rem 1rem;
		color: var(--atlas-muted);
		font-size: 0.68rem;
	}
	.safety-strip button {
		min-height: 2.75rem;
		border: 0;
		background: transparent;
		color: var(--atlas-accent);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 0.2rem;
	}
	.thunder-countdown {
		color: #f0c96f;
		font-family: 'Courier Prime', monospace;
		font-weight: 700;
	}
	.field-map .thunder-countdown {
		color: #785a20;
	}

	.keyboard-help {
		border-bottom: 1px solid var(--atlas-line);
		background: var(--atlas-control);
		padding: 0.7rem 1rem;
	}
	.keyboard-help h3,
	.keyboard-help p {
		margin: 0;
	}
	.keyboard-help h3 {
		font-size: 0.8rem;
	}
	.keyboard-help p {
		margin-top: 0.2rem;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.laboratory-grid {
		display: grid;
		grid-template-columns: minmax(17.5rem, 20rem) minmax(30rem, 1fr) minmax(17rem, 20rem);
		grid-template-areas: 'controls scene inspector';
		min-height: 40rem;
	}
	.scene-column {
		position: relative;
		grid-area: scene;
		min-width: 0;
		background: var(--atlas-bg);
	}
	.controls-column {
		grid-area: controls;
		min-width: 0;
	}
	.inspector-column {
		grid-area: inspector;
		min-width: 0;
	}

	.static-poster {
		position: relative;
		min-height: 36rem;
		background: #07101f;
	}
	.static-poster img {
		width: 100%;
		height: 100%;
		min-height: 36rem;
		object-fit: cover;
	}
	.static-poster button {
		position: absolute;
		left: 50%;
		bottom: 3.5rem;
		min-height: 3rem;
		transform: translateX(-50%);
		border: 1px solid rgb(255 255 255 / 0.5);
		border-radius: 999px;
		background: rgb(5 10 20 / 0.85);
		padding: 0.6rem 1.1rem;
		color: white;
		font: inherit;
		font-weight: 750;
	}

	.scene-telemetry {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.35rem 0.8rem;
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 0.55rem 0.75rem;
		color: var(--atlas-muted);
		font:
			0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	.artifact-bar {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 0.8rem 1rem;
	}
	.artifact-bar > div {
		display: grid;
		flex: 1;
		gap: 0.12rem;
	}
	.artifact-bar > div span {
		color: var(--atlas-muted);
		font-size: 0.68rem;
	}
	.artifact-bar button {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.7rem;
		color: var(--atlas-text);
		font: inherit;
		font-size: 0.72rem;
	}
	.artifact-bar button:hover:not(:disabled),
	.artifact-bar button:focus-visible {
		border-color: var(--atlas-accent);
		outline: none;
	}
	.artifact-bar button:disabled {
		opacity: 0.45;
	}

	.accessible-view {
		display: grid;
		gap: 0.75rem;
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-bg);
		padding: 1rem;
	}
	.accessible-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.accessible-heading p,
	.accessible-heading h3 {
		margin: 0;
	}
	.accessible-heading p {
		color: var(--atlas-muted);
		font:
			0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.accessible-heading h3 {
		margin-top: 0.15rem;
		font-size: 1rem;
	}
	.accessible-heading dl {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem 1rem;
		margin: 0;
	}
	.accessible-heading dl div {
		display: grid;
		gap: 0.08rem;
	}
	.accessible-heading dt {
		color: var(--atlas-muted);
		font-size: 0.61rem;
		text-transform: uppercase;
	}
	.accessible-heading dd {
		margin: 0;
		font:
			0.7rem 'Courier Prime',
			monospace;
	}
	.screen-reader-narrative {
		margin: 0;
		border-left: 2px solid var(--atlas-accent);
		padding-left: 0.7rem;
		color: var(--atlas-muted);
		font-size: 0.76rem;
		line-height: 1.55;
	}

	.noscript-fallback {
		padding: 1rem;
		background: var(--atlas-panel);
	}
	.noscript-fallback img {
		width: 100%;
		border-radius: 0.4rem;
	}
	.noscript-fallback h3 {
		margin: 0.8rem 0 0;
	}
	.noscript-fallback p {
		color: var(--atlas-muted);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}

	@media (max-width: 1180px) {
		.laboratory-grid {
			grid-template-columns: minmax(16rem, 18rem) 1fr;
			grid-template-areas: 'controls scene' 'inspector scene';
			min-height: 0;
		}
		.scene-column {
			min-height: 30rem;
		}
	}

	@media (max-width: 760px) {
		.lightning-atlas {
			width: 100vw;
			margin-left: 0;
			border-right: 0;
			border-left: 0;
			border-radius: 0;
		}
		.atlas-header {
			flex-direction: column;
		}
		.instrument-status {
			width: 100%;
			min-width: 0;
		}
		.laboratory-grid {
			grid-template-columns: 1fr;
			grid-template-areas: 'controls' 'scene' 'inspector';
		}
		.scene-column {
			min-height: 0;
		}
		.artifact-bar,
		.accessible-heading {
			align-items: stretch;
			flex-direction: column;
		}
		.artifact-bar button {
			width: 100%;
		}
		.accessible-heading dl {
			justify-content: flex-start;
		}
	}

	@media (max-width: 420px) {
		.atlas-header {
			padding: 0.85rem;
		}
		.safety-strip {
			align-items: flex-start;
			flex-direction: column;
		}
		.scene-telemetry span:last-child {
			display: none;
		}
		.artifact-bar {
			padding: 0.7rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lightning-atlas *,
		.lightning-atlas *::before,
		.lightning-atlas *::after {
			scroll-behavior: auto !important;
			animation-duration: 0.001ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.001ms !important;
		}
	}

	@media (forced-colors: active) {
		.lightning-atlas {
			border: 2px solid CanvasText;
		}
		.lightning-atlas button,
		.lightning-atlas input,
		.lightning-atlas :global(select) {
			border: 1px solid ButtonText;
		}
		.lightning-atlas :global(button:focus-visible),
		.lightning-atlas :global(select:focus-visible),
		.lightning-atlas input:focus-visible,
		.lightning-atlas :global(summary:focus-visible) {
			outline: 3px solid Highlight;
			outline-offset: 2px;
		}
	}
</style>
