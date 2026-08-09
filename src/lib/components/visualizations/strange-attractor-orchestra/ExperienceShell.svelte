<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ATTRACTOR_REGISTRY,
		DEFAULT_ORCHESTRA_SNAPSHOT,
		SOUND_WORLD_PATCHES,
		createOrchestraWorkerClient,
		getAttractorDefinition,
		parseOrchestraUrlState,
		serializeOrchestraUrlState,
		type AttractorId,
		type CoreGenerationResult,
		type GenerationProgress,
		type NoiseFamily,
		type NoiseLens,
		type OrchestraSnapshot,
		type SonicEvent,
		type SoundWorldId,
		type TimingMode
	} from '$lib/visualizations/strange-attractor-orchestra';
	import { StrangeAttractorAudioEngine } from '$lib/visualizations/strange-attractor-orchestra/audio/audio-engine';
	import type {
		AudioIntensityMode,
		GuidedIntroAudioStage
	} from '$lib/visualizations/strange-attractor-orchestra/audio/contracts';
	import type {
		OrchestraQualityTier,
		OrchestraRenderChoreography,
		OrchestraRenderView
	} from '$lib/visualizations/strange-attractor-orchestra/renderer/types';
	import AccessibleSummary from './AccessibleSummary.svelte';
	import AttractorSelector from './AttractorSelector.svelte';
	import AttractorStage from './AttractorStage.svelte';
	import CausalLegend from './CausalLegend.svelte';
	import DiagnosticsPanel from './DiagnosticsPanel.svelte';
	import EquationPanel from './EquationPanel.svelte';
	import ExportSharePanel from './ExportSharePanel.svelte';
	import GuidedChoreography from './GuidedChoreography.svelte';
	import NoiseLensSelector from './NoiseLensSelector.svelte';
	import SoundWorldSelector from './SoundWorldSelector.svelte';
	import StartGate from './StartGate.svelte';
	import TransportControls from './TransportControls.svelte';

	type ExportKind = 'poster' | 'snapshot' | 'score' | 'wav';
	type WorkerClient = ReturnType<typeof createOrchestraWorkerClient>;
	type RendererReport = { kind: string; status: string; pointCount: number; drawCalls: number };

	const INTRO_ENDS_MS = [9_000, 20_000, 30_000, 40_000, 50_000] as const;
	const GUIDED_AUDIO_STAGES = [
		'shot-1',
		'shot-2',
		'shot-3',
		'shot-4',
		'shot-5'
	] as const satisfies readonly GuidedIntroAudioStage[];
	const SOUND_DESCRIPTIONS: Readonly<Record<SoundWorldId, string>> = {
		glass: 'Clear, blue-noise resonators with long glass-like partials.',
		magnetic: 'Lower brown-noise excitation and slow, weighty modal motion.',
		swarm: 'Brief bright grains arranged as a restrained luminous cloud.',
		radio: 'Sparse narrow-band calls with the longest midnight tail.'
	};

	let shell!: HTMLElement;
	let snapshot = $state<OrchestraSnapshot>({ ...DEFAULT_ORCHESTRA_SNAPSHOT });
	let data = $state<CoreGenerationResult | null>(null);
	let entered = $state(false);
	let generating = $state(true);
	let generationProgress = $state(0);
	let generationPhase = $state('trajectory');
	let generationMs = $state(0);
	let status = $state('Preparing the canonical orbit without starting sound.');
	let urlNotice = $state('');
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(0.23);
	let lowerIntensity = $state(false);
	let audioAvailable = $state(false);
	let audioStarting = $state(false);
	let emergencySilenced = $state(false);
	let playheadSeconds = $state(0);
	let view: OrchestraRenderView = $state('braided');
	let quality: OrchestraQualityTier = $state('high');
	let rendererReport: RendererReport = $state({
		kind: 'loading',
		status: 'warming',
		pointCount: 0,
		drawCalls: 0
	});
	let fps = $state(0);
	let workerMode = $state('dedicated Worker');
	let reducedMotion = $state(false);
	let introActive = $state(false);
	let introPaused = $state(false);
	let introShot = $state(0);
	let introProgress = $state(0);
	let introElapsedMs = 0;
	let bluetoothOffsetMs = $state(0);
	let exporting: ExportKind | null = $state(null);
	let exportProgress = $state(0);
	let exportMessage = $state('');
	let advancedOpen = $state(false);
	let conductorX = $state(0);
	let conductorY = $state(0);
	let conductorActive = $state(false);

	let workerClient: WorkerClient | null = null;
	let unsubscribeProgress: (() => void) | null = null;
	let audioEngine: StrangeAttractorAudioEngine | null = null;
	let generationTimer = 0;
	let transitionClearTimer = 0;
	let generationSequence = 0;
	let lastAnnouncedGenerationPhase = '';
	let resumeAfterGeneration = false;
	let introFrame = 0;
	let introLastFrame = 0;
	let introResumePlayback = false;
	let stateTick = 0;
	let lastTickTime = 0;
	let exportController: AbortController | null = null;

	let definition = $derived(getAttractorDefinition(snapshot.attractorId));
	let scoreDuration = $derived(
		Math.max(
			1,
			(data?.score[data.score.length - 1]?.time ?? 59) +
				(data?.score[data.score.length - 1]?.duration ?? 1)
		)
	);
	let visualPlayheadSeconds = $derived(
		Math.max(0, Math.min(scoreDuration, playheadSeconds + bluetoothOffsetMs / 1_000))
	);
	let visualPlayhead01 = $derived(Math.max(0, Math.min(1, visualPlayheadSeconds / scoreDuration)));
	let currentEvent = $derived.by((): SonicEvent | null => {
		if (!data?.score.length) return null;
		let candidate: SonicEvent | null = null;
		for (const event of data.score) {
			if (event.time > visualPlayheadSeconds) break;
			candidate = event;
		}
		return candidate;
	});
	let currentFeatureIndex = $derived(
		data?.features.pointCount
			? Math.min(
					data.features.pointCount - 1,
					Math.max(0, Math.floor(visualPlayhead01 * (data.features.pointCount - 1)))
				)
			: 0
	);
	let currentRegion = $derived.by(() => {
		if (!data?.features.region.length) return 'warming';
		const region = data.features.region[currentFeatureIndex] ?? 0;
		return definition.regionClassifier.labels[region] ?? `region ${region + 1}`;
	});
	let stageView = $derived<OrchestraRenderView>(
		introActive ? (introShot === 0 ? 'raw' : introShot < 3 ? 'braided' : view) : view
	);
	let guidedAudioStage = $derived<GuidedIntroAudioStage>(
		introActive ? (GUIDED_AUDIO_STAGES[introShot] ?? 'shot-5') : 'free'
	);
	let stageChoreography = $derived.by((): Partial<OrchestraRenderChoreography> => {
		if (!introActive) {
			return {
				reveal01: 1,
				trailHead01: visualPlayhead01,
				rawMix01: view === 'noise' ? 0 : 0.28,
				weatherMix01: view === 'raw' ? 0 : 1,
				voiceMix01: lowerIntensity ? 0.48 : 1
			};
		}
		const mixes = [
			{ rawMix01: 1, weatherMix01: 0, voiceMix01: 0 },
			{ rawMix01: 1, weatherMix01: 0.16, voiceMix01: 0 },
			{ rawMix01: 0.52, weatherMix01: 0.88, voiceMix01: 0 },
			{ rawMix01: 0.3, weatherMix01: 1, voiceMix01: 0.65 },
			{ rawMix01: 0.24, weatherMix01: 1, voiceMix01: 1 }
		] as const;
		const mix = mixes[introShot];
		return {
			reveal01: 1,
			trailHead01: Math.max(0.18, introProgress),
			...mix,
			voiceMix01: mix.voiceMix01 * (lowerIntensity ? 0.48 : 1)
		};
	});
	let attractorOptions = $derived(
		ATTRACTOR_REGISTRY.map((item) => ({
			id: item.id,
			name: item.name,
			family: item.family.replace('-', ' '),
			warning: item.warnings?.[0]
		}))
	);
	let soundOptions = $derived(
		(Object.values(SOUND_WORLD_PATCHES) as Array<(typeof SOUND_WORLD_PATCHES)[SoundWorldId]>).map(
			(patch) => ({ id: patch.id, name: patch.name, description: SOUND_DESCRIPTIONS[patch.id] })
		)
	);
	let summaryRows = $derived([
		{ label: 'Canonical system', value: `${definition.name} · ${definition.family}` },
		{
			label: 'Weather',
			value: `${snapshot.noiseFamily} ${snapshot.noiseLens} at ${Math.round(snapshot.noiseInfluence * 100)}%`
		},
		{ label: 'Sound world', value: SOUND_WORLD_PATCHES[snapshot.soundWorld].name },
		{ label: 'Deterministic seed', value: snapshot.masterSeed },
		{ label: 'Current region', value: currentRegion },
		{
			label: 'Speed / stretching',
			value: data
				? `${(data.features.speed01[currentFeatureIndex] ?? 0).toFixed(2)} / ${(data.features.stretching01[currentFeatureIndex] ?? 0).toFixed(2)}`
				: 'warming'
		},
		{
			label: 'Curvature / recurrence',
			value: data
				? `${(data.features.curvature01[currentFeatureIndex] ?? 0).toFixed(2)} / ${(data.features.recurrence01[currentFeatureIndex] ?? 0).toFixed(2)}`
				: 'warming'
		},
		{
			label: 'Density / noise',
			value: data
				? `${(data.features.density01[currentFeatureIndex] ?? 0).toFixed(2)} / ${(data.features.noiseValue01[currentFeatureIndex] ?? 0).toFixed(2)}`
				: 'warming'
		},
		{ label: 'Score identity', value: data?.scoreHash ?? 'generating' },
		{
			label: 'Playback',
			value: emergencySilenced
				? 'faded silent'
				: playing
					? muted
						? 'playing, muted'
						: 'playing'
					: 'paused'
		}
	]);
	let exportReady = $derived.by(() => {
		if (!data || generating) return false;
		const generated = data.snapshot;
		return (Object.keys(snapshot) as Array<keyof OrchestraSnapshot>).every(
			(key) => generated[key] === snapshot[key]
		);
	});

	$effect(() => {
		// The guided shots and comparison buttons share one ephemeral observation view.
		// This changes the performance treatment, never the deterministic score or URL.
		const observation = stageView;
		const audioStage = guidedAudioStage;
		audioEngine?.setObservationView(observation);
		audioEngine?.setGuidedIntroStage(audioStage);
	});

	function progressStatus(progress: GenerationProgress): void {
		generationProgress = progress.progress01;
		generationPhase = progress.phase;
		if (progress.phase !== lastAnnouncedGenerationPhase) {
			lastAnnouncedGenerationPhase = progress.phase;
			status = `Computing ${progress.phase}.`;
		}
	}

	function syncUrl(next: OrchestraSnapshot): void {
		if (typeof window === 'undefined') return;
		const params = serializeOrchestraUrlState(next, new URLSearchParams(window.location.search));
		const query = params.toString();
		window.history.replaceState(
			null,
			'',
			`${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
		);
	}

	function beginGenerationTransition(): void {
		resumeAfterGeneration ||= playing;
		if (playing) {
			playheadSeconds = audioEngine?.pause() ?? playheadSeconds;
			playing = false;
		}
		// Discard future events immediately after the transport fade; the next accepted Worker result
		// installs a fresh score atomically. The core arrays remain untouched while fading visually.
		audioEngine?.setScore([], snapshot.masterSeed);
		if (transitionClearTimer) window.clearTimeout(transitionClearTimer);
		if (data) {
			transitionClearTimer = window.setTimeout(() => {
				transitionClearTimer = 0;
				if (generating) data = null;
			}, 180);
		}
	}

	async function generate(next: OrchestraSnapshot): Promise<void> {
		if (!workerClient) return;
		const sequence = ++generationSequence;
		// Svelte's deep state is a Proxy and cannot cross postMessage's structured-clone boundary.
		const cloneableSnapshot = { ...next } as OrchestraSnapshot;
		const started = performance.now();
		generating = true;
		generationProgress = 0;
		generationPhase = 'burn-in';
		lastAnnouncedGenerationPhase = '';
		try {
			const result = await workerClient.generate(cloneableSnapshot, {
				durationSeconds: 60,
				mobile: false,
				includeDiagnostics: true,
				diagnosticPointCount: 4_096
			});
			if (sequence !== generationSequence) return;
			if (transitionClearTimer) window.clearTimeout(transitionClearTimer);
			transitionClearTimer = 0;
			data = result;
			generationMs = performance.now() - started;
			generationProgress = 1;
			const readyMessage = `${getAttractorDefinition(result.snapshot.attractorId).name} ready: ${result.trajectory.pointCount.toLocaleString('en-GB')} canonical points and ${result.score.length.toLocaleString('en-GB')} causal events.`;
			const shouldResume = resumeAfterGeneration;
			let audioResumeWarning = '';
			if (audioEngine) {
				audioEngine.setScore(result.score, result.snapshot.masterSeed);
				audioEngine.seek(0);
				audioEngine.setPlaybackRate(result.snapshot.simulationRate);
				if (shouldResume) {
					try {
						await audioEngine.resume();
					} catch (error) {
						audioAvailable = false;
						audioResumeWarning = ` ${error instanceof Error ? error.message : 'Sound could not resume.'} Visual playback remains active.`;
					}
				}
			}
			playheadSeconds = 0;
			if (shouldResume) playing = true;
			resumeAfterGeneration = false;
			status = `${readyMessage}${audioResumeWarning}`;
		} catch (error) {
			if (sequence !== generationSequence || /superseded|cancelled/iu.test(String(error))) return;
			status =
				error instanceof Error ? error.message : 'The canonical orbit could not be generated.';
		} finally {
			if (sequence === generationSequence) generating = false;
		}
	}

	function queueGeneration(next: OrchestraSnapshot, delay = 160): void {
		if (generationTimer) window.clearTimeout(generationTimer);
		generationSequence += 1;
		try {
			workerClient?.cancel();
		} catch {
			// A disposed client is already unable to deliver stale work.
		}
		beginGenerationTransition();
		generating = true;
		generationProgress = 0;
		generationPhase = 'burn-in';
		generationTimer = window.setTimeout(() => {
			generationTimer = 0;
			void generate(next);
		}, delay);
	}

	function changeSnapshot(
		patch: Partial<OrchestraSnapshot>,
		options: { delay?: number; regenerate?: boolean } = {}
	): void {
		let next = { ...snapshot, ...patch } as OrchestraSnapshot;
		if (patch.attractorId) {
			next = { ...next, stableStepSize: getAttractorDefinition(patch.attractorId).stepSize ?? 1 };
		}
		snapshot = next;
		syncUrl(next);
		if (options.regenerate !== false) queueGeneration(next, options.delay);
		if (patch.soundWorld) audioEngine?.setSoundWorld(patch.soundWorld);
		if (patch.simulationRate) audioEngine?.setPlaybackRate(patch.simulationRate);
	}

	function freshSeed(): string {
		const bytes = new Uint32Array(2);
		crypto.getRandomValues(bytes);
		return `weather-${bytes[0].toString(36)}${bytes[1].toString(36)}`.slice(0, 48);
	}

	function resetSeed(): void {
		changeSnapshot({ masterSeed: DEFAULT_ORCHESTRA_SNAPSHOT.masterSeed });
		status = 'The documented default seed has been restored.';
	}

	function resetInstrument(): void {
		const next = { ...DEFAULT_ORCHESTRA_SNAPSHOT };
		snapshot = next;
		view = 'braided';
		bluetoothOffsetMs = 0;
		syncUrl(next);
		queueGeneration(next, 0);
		audioEngine?.setSoundWorld(next.soundWorld);
		audioEngine?.setPlaybackRate(next.simulationRate);
		audioEngine?.setObservationView('braided');
		status = 'The canonical Langford instrument has been restored.';
	}

	function selectObservationView(next: OrchestraRenderView): void {
		view = next;
		audioEngine?.setObservationView(next);
		status =
			next === 'raw'
				? 'Raw observation: canonical geometry and restrained height panning.'
				: next === 'noise'
					? 'Weather observation: noise excitation and weather colour are foregrounded.'
					: 'Braided observation: canonical orbit, weather, and causal voices are reunited.';
	}

	function runIntro(): void {
		entered = true;
		introActive = true;
		introPaused = false;
		introShot = 0;
		introProgress = 0;
		introElapsedMs = 0;
		introLastFrame = 0;
		if (!reducedMotion) introFrame = requestAnimationFrame(advanceIntro);
	}

	function advanceIntro(now: number): void {
		introFrame = 0;
		if (!introActive || reducedMotion) return;
		if (!introLastFrame) introLastFrame = now;
		const elapsed = Math.min(100, now - introLastFrame);
		introLastFrame = now;
		if (!introPaused && !document.hidden) introElapsedMs += elapsed;
		introProgress = Math.min(1, introElapsedMs / INTRO_ENDS_MS[4]);
		const shot = INTRO_ENDS_MS.findIndex((end) => introElapsedMs < end);
		introShot = shot < 0 ? 4 : shot;
		if (introElapsedMs >= INTRO_ENDS_MS[4]) {
			finishIntro();
			return;
		}
		introFrame = requestAnimationFrame(advanceIntro);
	}

	function finishIntro(): void {
		introActive = false;
		introPaused = false;
		introShot = 4;
		introProgress = 1;
		if (introFrame) cancelAnimationFrame(introFrame);
		introFrame = 0;
		status =
			'Free conducting is ready. The orbit remains canonical while gestures alter only the performance layer.';
	}

	async function toggleIntroPause(): Promise<void> {
		if (!introPaused) {
			introResumePlayback = playing;
			introPaused = true;
			if (playing) {
				playheadSeconds = audioEngine?.pause() ?? playheadSeconds;
				playing = false;
			}
			status = 'The guided introduction is paused at this causal step.';
			return;
		}

		introPaused = false;
		if (introResumePlayback) {
			if (audioEngine && audioAvailable) {
				try {
					await audioEngine.resume();
				} catch (error) {
					status = error instanceof Error ? error.message : 'Sound could not resume.';
					introResumePlayback = false;
					return;
				}
			}
			playing = true;
			lastTickTime = performance.now();
		}
		introResumePlayback = false;
		status = 'The guided introduction has resumed from the same causal step.';
	}

	function skipIntro(): void {
		if (introPaused) void toggleIntroPause();
		finishIntro();
	}

	function moveIntro(offset: number): void {
		introShot = Math.max(0, Math.min(4, introShot + offset));
		introElapsedMs = introShot === 0 ? 0 : INTRO_ENDS_MS[introShot - 1];
		introProgress = introElapsedMs / INTRO_ENDS_MS[4];
	}

	async function startWithSound(): Promise<void> {
		if (audioStarting) return;
		audioStarting = true;
		try {
			const enteringIntro = !entered;
			const startingStage: GuidedIntroAudioStage = enteringIntro ? 'shot-1' : guidedAudioStage;
			const intensityMode: AudioIntensityMode = lowerIntensity ? 'lower' : 'standard';
			if (!audioEngine) {
				audioEngine = new StrangeAttractorAudioEngine({
					seed: snapshot.masterSeed,
					soundWorld: snapshot.soundWorld,
					volume: lowerIntensity ? volume * 0.62 : volume,
					guidedIntroStage: startingStage,
					intensityMode
				});
				if (data) audioEngine.setScore(data.score, snapshot.masterSeed);
			}
			audioEngine.setGuidedIntroStage(startingStage);
			audioEngine.setIntensityMode(intensityMode);
			await audioEngine.start({ scorePosition: playheadSeconds, audible: !muted });
			audioEngine.setPlaybackRate(snapshot.simulationRate);
			audioEngine.setObservationView(enteringIntro ? 'raw' : stageView);
			audioAvailable = true;
			emergencySilenced = false;
			playing = true;
			status = 'Sound is active at a restrained level. Mute and Fade silent remain available.';
			if (!entered) runIntro();
		} catch (error) {
			audioAvailable = false;
			playing = true;
			status = `${error instanceof Error ? error.message : 'Web Audio is unavailable.'} The visual instrument remains active.`;
			if (!entered) runIntro();
		} finally {
			audioStarting = false;
		}
	}

	function continueSilently(): void {
		playing = true;
		status = 'Silent mode is active. Sound will remain off unless you explicitly enable it.';
		runIntro();
	}

	async function togglePlayback(): Promise<void> {
		if (generating || !data) {
			status = 'Playback will be available when the selected deterministic score is ready.';
			return;
		}
		if (playing) {
			playheadSeconds = audioEngine?.pause() ?? playheadSeconds;
			playing = false;
			status = 'The score and visual playhead are paused.';
			return;
		}
		if (audioEngine) {
			try {
				if (emergencySilenced) {
					await audioEngine.clearEmergencySilence();
					emergencySilenced = false;
				}
				await audioEngine.resume();
			} catch (error) {
				status = error instanceof Error ? error.message : 'Sound could not resume.';
				return;
			}
		} else emergencySilenced = false;
		playing = true;
		lastTickTime = performance.now();
		status = audioEngine ? 'Playback resumed.' : 'Silent visual playback resumed.';
	}

	function toggleMute(): void {
		muted = !muted;
		audioEngine?.setMuted(muted);
		status = muted
			? 'Audio muted. Visual events continue.'
			: 'Audio unmuted at the saved safe level.';
	}

	function setVolume(value: number): void {
		volume = Math.max(0, Math.min(0.5, value));
		audioEngine?.setVolume(lowerIntensity ? volume * 0.62 : volume);
	}

	function toggleIntensity(): void {
		lowerIntensity = !lowerIntensity;
		const mode: AudioIntensityMode = lowerIntensity ? 'lower' : 'standard';
		audioEngine?.setIntensityMode(mode);
		audioEngine?.setVolume(lowerIntensity ? volume * 0.62 : volume);
		status = lowerIntensity
			? 'Lower-intensity listening is active.'
			: 'Standard restrained intensity restored.';
	}

	function fadeSilent(): void {
		resumeAfterGeneration = false;
		audioEngine?.emergencySilence();
		emergencySilenced = true;
		playing = false;
		status = 'Emergency fade complete. Use Play to clear it explicitly.';
	}

	function conduct(horizontal: number, vertical: number, active: boolean): void {
		conductorX = horizontal;
		conductorY = vertical;
		conductorActive = active;
		audioEngine?.setConducting(horizontal, vertical, active);
		// The gesture intentionally never enters snapshot, trajectory, features, URL, or score.
		status = active
			? `Conducting: circulation ${horizontal.toFixed(1)}, brightness ${vertical.toFixed(1)}. Canonical score unchanged.`
			: 'Conducting released; the deterministic baseline has returned.';
	}

	function tickState(): void {
		const now = performance.now();
		const elapsed = lastTickTime ? Math.min(0.5, (now - lastTickTime) / 1_000) : 0;
		lastTickTime = now;
		if (!playing || document.hidden) return;
		const audio = audioEngine?.debugSnapshot();
		playheadSeconds = audio?.contextConstructed
			? audio.playheadSeconds
			: playheadSeconds + elapsed * snapshot.simulationRate;
		if (playheadSeconds < scoreDuration) return;
		playheadSeconds = 0;
		if (audioEngine) {
			audioEngine.pause();
			audioEngine.seek(0);
			void audioEngine.resume().catch(() => {
				playing = false;
			});
		}
	}

	async function toggleFullscreen(): Promise<void> {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await shell.requestFullscreen();
			status = document.fullscreenElement
				? 'Full-screen instrument active.'
				: 'Exited full screen.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Full screen is unavailable.';
		}
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			(target instanceof HTMLElement && target.isContentEditable)
		);
	}

	function cycle<Value>(values: readonly Value[], current: Value): Value {
		const index = values.indexOf(current);
		return values[(Math.max(0, index) + 1) % values.length] ?? values[0];
	}

	function handleKeyboard(event: KeyboardEvent): void {
		if (!entered || isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey)
			return;
		const key = event.key.toLowerCase();
		if (
			key === ' ' ||
			key === 'm' ||
			key === 'escape' ||
			key === 'n' ||
			key === 's' ||
			key === 'r' ||
			key === 'f'
		)
			event.preventDefault();
		if (key === ' ') void togglePlayback();
		else if (key === 'm' && audioAvailable) toggleMute();
		else if (key === 'escape') {
			if (document.fullscreenElement) void document.exitFullscreen();
			fadeSilent();
		} else if (key === 'n') {
			changeSnapshot({ noiseLens: cycle<NoiseLens>(['dye', 'warp', 'wake'], snapshot.noiseLens) });
		} else if (key === 's') {
			changeSnapshot({
				soundWorld: cycle<SoundWorldId>(
					['glass', 'magnetic', 'swarm', 'radio'],
					snapshot.soundWorld
				)
			});
		} else if (key === 'r') resetSeed();
		else if (key === 'f') void toggleFullscreen();
	}

	function downloadBlob(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
	}

	function jsonBlob(value: unknown): Blob {
		return new Blob([`${JSON.stringify(value, null, 2)}\n`], {
			type: 'application/json;charset=utf-8'
		});
	}

	async function renderCurrentPoster(): Promise<Blob> {
		if (!data) throw new Error('Wait for the canonical orbit before exporting a poster.');
		const canvas = document.createElement('canvas');
		canvas.width = 1_600;
		canvas.height = 1_000;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas poster export is unavailable.');
		const gradient = context.createRadialGradient(920, 440, 40, 920, 440, 860);
		gradient.addColorStop(0, '#152b2e');
		gradient.addColorStop(0.46, '#071013');
		gradient.addColorStop(1, '#020507');
		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);
		const drawPath = (positions: Float64Array, colour: string, width: number, alpha: number) => {
			context.beginPath();
			const count = positions.length / 3;
			for (let index = 0; index < count; index += 1) {
				const x = 470 + (positions[index * 3] ?? 0.5) * 980;
				const y = 80 + (1 - (positions[index * 3 + 2] ?? 0.5)) * 830;
				if (index === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			}
			context.globalAlpha = alpha;
			context.strokeStyle = colour;
			context.lineWidth = width;
			context.stroke();
		};
		drawPath(data.features.position01, '#d3c9af', 1.1, 0.34);
		drawPath(data.features.warpedPosition01, '#65d1d2', 1.65, 0.78);
		context.globalAlpha = 1;
		context.fillStyle = '#c89167';
		context.font = '700 18px ui-monospace, monospace';
		context.fillText('ORBIT → WEATHER → VOICE', 72, 82);
		context.fillStyle = '#f1ecdf';
		context.font = '700 58px Georgia, serif';
		context.fillText(definition.name, 72, 160);
		context.fillStyle = '#9aaaa8';
		context.font = '22px ui-monospace, monospace';
		context.fillText(
			`${snapshot.noiseFamily} ${snapshot.noiseLens} · ${SOUND_WORLD_PATCHES[snapshot.soundWorld].name}`,
			76,
			205
		);
		context.fillText(`seed ${snapshot.masterSeed} · score ${data.scoreHash}`, 76, 920);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))),
				'image/png'
			)
		);
	}

	async function copyDeterministicUrl(): Promise<void> {
		const text = window.location.href;
		try {
			await navigator.clipboard.writeText(text);
			exportMessage = 'Deterministic URL copied.';
		} catch {
			const field = document.createElement('textarea');
			field.value = text;
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.append(field);
			field.select();
			document.execCommand('copy');
			field.remove();
			exportMessage = 'Deterministic URL copied with the compatibility fallback.';
		}
	}

	async function runExport(kind: ExportKind): Promise<void> {
		if (exporting || !data) return;
		if (!exportReady) {
			exportMessage = 'Wait for the selected deterministic snapshot to finish generating.';
			return;
		}
		exporting = kind;
		exportProgress = 0;
		exportMessage = `Preparing ${kind}.`;
		exportController = new AbortController();
		const stem = `strange-attractor-${snapshot.attractorId}-${snapshot.masterSeed}`;
		try {
			if (kind === 'poster') {
				const blob = await renderCurrentPoster();
				downloadBlob(blob, `${stem}.png`);
				exportProgress = 1;
			} else if (kind === 'snapshot') {
				downloadBlob(
					jsonBlob({
						schema: 'strange-attractor-orchestra-snapshot',
						version: 1,
						modelVersion: data.modelVersion,
						snapshot,
						scoreHash: data.scoreHash,
						pointCount: data.trajectory.pointCount,
						eventCount: data.score.length
					}),
					`${stem}.snapshot.json`
				);
				exportProgress = 1;
			} else if (kind === 'score') {
				const { exportOrchestraScoreJson } =
					await import('$lib/visualizations/strange-attractor-orchestra/audio/score-export');
				const result = exportOrchestraScoreJson({
					events: data.score,
					seed: snapshot.masterSeed,
					soundWorld: snapshot.soundWorld,
					filenameStem: stem
				});
				downloadBlob(result.blob, result.filename);
				exportProgress = 1;
			} else {
				const { exportOrchestraOffline } =
					await import('$lib/visualizations/strange-attractor-orchestra/audio/offline-export');
				const result = await exportOrchestraOffline({
					events: data.score,
					seed: snapshot.masterSeed,
					soundWorld: snapshot.soundWorld,
					durationSeconds: 30,
					volume: lowerIntensity ? volume * 0.62 : volume,
					signal: exportController.signal,
					filenameStem: stem,
					onProgress(update) {
						exportProgress = update.progress;
						exportMessage = update.message;
					}
				});
				downloadBlob(result.wav.blob, result.wavFilename);
				exportProgress = 1;
			}
			exportMessage = `${kind === 'wav' ? 'WAV composition' : kind} downloaded.`;
		} catch (error) {
			exportMessage = exportController.signal.aborted
				? 'Export cancelled cleanly.'
				: error instanceof Error
					? error.message
					: 'Export failed safely.';
		} finally {
			exporting = null;
			exportController = null;
		}
	}

	function cancelExport(): void {
		exportController?.abort();
		exportMessage = 'Cancelling export…';
	}

	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const applyMotion = () => {
			reducedMotion = media.matches;
			if (media.matches && introFrame) {
				cancelAnimationFrame(introFrame);
				introFrame = 0;
			} else if (!media.matches && introActive && !introFrame) {
				introLastFrame = 0;
				introFrame = requestAnimationFrame(advanceIntro);
			}
		};
		applyMotion();
		media.addEventListener('change', applyMotion);

		const restored = parseOrchestraUrlState(window.location.href);
		snapshot = restored.state;
		urlNotice = restored.issues.length
			? `${restored.issues.length} unsafe or unsupported URL value${restored.issues.length === 1 ? '' : 's'} restored to documented defaults.`
			: '';
		if (urlNotice) status = urlNotice;
		const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
		if ((memory && memory <= 4) || window.devicePixelRatio > 2) quality = 'medium';
		workerMode =
			typeof Worker === 'undefined' ? 'cooperative main-thread fallback' : 'dedicated Worker';
		workerClient = createOrchestraWorkerClient();
		unsubscribeProgress = workerClient.subscribeProgress(progressStatus);
		void generate(snapshot);
		const handlePopState = () => {
			const restoredState = parseOrchestraUrlState(window.location.href);
			snapshot = restoredState.state;
			queueGeneration(snapshot, 0);
			audioEngine?.setSoundWorld(snapshot.soundWorld);
			audioEngine?.setPlaybackRate(snapshot.simulationRate);
			status = restoredState.issues.length
				? 'History state contained unsupported values; documented defaults were restored.'
				: 'The deterministic URL state was restored from browser history.';
		};
		window.addEventListener('keydown', handleKeyboard);
		window.addEventListener('popstate', handlePopState);
		lastTickTime = performance.now();
		stateTick = window.setInterval(tickState, 125);

		return () => {
			if (generationTimer) window.clearTimeout(generationTimer);
			if (transitionClearTimer) window.clearTimeout(transitionClearTimer);
			if (introFrame) cancelAnimationFrame(introFrame);
			if (stateTick) window.clearInterval(stateTick);
			exportController?.abort();
			unsubscribeProgress?.();
			workerClient?.dispose();
			workerClient = null;
			window.removeEventListener('keydown', handleKeyboard);
			window.removeEventListener('popstate', handlePopState);
			media.removeEventListener('change', applyMotion);
			void audioEngine?.dispose();
			audioEngine = null;
		};
	});
</script>

<section
	bind:this={shell}
	class="experience"
	data-testid="sa-desktop-experience"
	data-score-hash={data?.scoreHash ?? 'warming'}
>
	<header class="masthead">
		<div>
			<p>Browser instrument no. 01</p>
			<h2>The Strange Attractor Orchestra</h2>
		</div>
		<div class="masthead-actions">
			<span class="seed"><i></i>seed <code>{snapshot.masterSeed}</code></span>
			{#if entered && !audioAvailable}
				<button
					class="sound-enable"
					type="button"
					disabled={audioStarting}
					onclick={() => void startWithSound()}
				>
					{audioStarting ? 'Starting…' : 'Enable sound'}
				</button>
			{/if}
			<button type="button" onclick={() => void toggleFullscreen()}>Full screen <kbd>F</kbd></button
			>
		</div>
	</header>

	<div class="stage-frame" class:regenerating={generating && entered}>
		<AttractorStage
			{data}
			view={stageView}
			lens={snapshot.noiseLens}
			{quality}
			{playing}
			playhead01={visualPlayhead01}
			choreography={stageChoreography}
			{reducedMotion}
			onconduct={conduct}
			onrenderer={(report) => (rendererReport = report)}
			onfps={(value) => (fps = value)}
			onfailure={(message) =>
				(status = `${message} The poster and listening controls remain available.`)}
		/>
		{#if !entered}
			<StartGate
				loading={audioStarting}
				onstartsound={() => void startWithSound()}
				oncontinuesilent={continueSilently}
			/>
		{:else if introActive}
			<GuidedChoreography
				shot={introShot}
				progress={introProgress}
				paused={introPaused}
				{reducedMotion}
				onpause={() => void toggleIntroPause()}
				onskip={skipIntro}
				onprevious={() => moveIntro(-1)}
				onnext={() => (introShot === 4 ? finishIntro() : moveIntro(1))}
			/>
		{/if}
		{#if entered && audioAvailable}
			<button class="stage-stop" type="button" onclick={fadeSilent}
				>Fade silent <kbd>Esc</kbd></button
			>
		{/if}
		<div class="generation" class:visible={generating} aria-hidden="true">
			<span style={`--progress:${generationProgress}`}></span>
			{generating
				? `${generationPhase} ${Math.round(generationProgress * 100)}%`
				: `${data?.scoreHash ?? 'safe fallback'} score`}
		</div>
	</div>

	{#if entered && !introActive}
		<div class="instrument" data-testid="sa-free-instrument">
			<div class="transport-row">
				<TransportControls
					{playing}
					{muted}
					{volume}
					{lowerIntensity}
					{audioAvailable}
					onplaypause={() => void togglePlayback()}
					onmute={toggleMute}
					onvolume={setVolume}
					onstop={fadeSilent}
					onintensity={toggleIntensity}
				/>
				<div class="view-choices" aria-label="Compare canonical and weather observations">
					{#each [['raw', 'Raw orbit'], ['noise', 'Weather only'], ['braided', 'Braided']] as option (option[0])}
						<button
							type="button"
							aria-pressed={view === option[0]}
							onclick={() => selectObservationView(option[0] as OrchestraRenderView)}
							>{option[1]}</button
						>
					{/each}
				</div>
			</div>

			<div class="control-grid">
				<AttractorSelector
					options={attractorOptions}
					value={snapshot.attractorId}
					onchange={(value) => changeSnapshot({ attractorId: value as AttractorId }, { delay: 0 })}
				/>
				<NoiseLensSelector
					noise={snapshot.noiseFamily}
					lens={snapshot.noiseLens}
					influence={snapshot.noiseInfluence}
					onnoise={(value) => changeSnapshot({ noiseFamily: value as NoiseFamily })}
					onlens={(value) => changeSnapshot({ noiseLens: value as NoiseLens })}
					oninfluence={(value) => changeSnapshot({ noiseInfluence: value }, { delay: 220 })}
				/>
				<SoundWorldSelector
					options={soundOptions}
					value={snapshot.soundWorld}
					onchange={(value) => changeSnapshot({ soundWorld: value as SoundWorldId })}
				/>
				<div class="seed-controls">
					<p>Reproducibility</p>
					<code>{snapshot.masterSeed}</code>
					<div>
						<button type="button" onclick={() => changeSnapshot({ masterSeed: freshSeed() })}
							>New seed</button
						>
						<button type="button" onclick={resetSeed}>Reset seed <kbd>R</kbd></button>
					</div>
				</div>
			</div>

			<CausalLegend event={currentEvent} regionLabel={currentRegion} mode={view} />

			<details class="advanced" bind:open={advancedOpen}>
				<summary>Advanced · equations, timing &amp; diagnostics</summary>
				<div class="advanced-grid">
					<EquationPanel
						name={definition.name}
						equationLatex={definition.equationLatex}
						family={definition.family}
						stepSize={definition.stepSize}
						parameters={definition.parameters}
						initialState={definition.initialState}
						burnInSteps={definition.burnInSteps}
						sampleStride={definition.sampleStride}
						warnings={definition.warnings}
						sourceTitle={`${definition.source.authors}, ${definition.source.year}: ${definition.source.title}`}
						sourceUrl={definition.source.doiOrUrl}
					/>
					<div class="advanced-controls">
						<fieldset>
							<legend>Event timing</legend>
							<label
								><input
									type="radio"
									name="sa-timing"
									checked={snapshot.timingMode === 'composed'}
									onchange={() => changeSnapshot({ timingMode: 'composed' as TimingMode })}
								/> Composed</label
							>
							<label
								><input
									type="radio"
									name="sa-timing"
									checked={snapshot.timingMode === 'raw'}
									onchange={() => changeSnapshot({ timingMode: 'raw' as TimingMode })}
								/> Raw simulation time</label
							>
						</fieldset>
						<label
							>Simulation rate <output>{snapshot.simulationRate.toFixed(2)}×</output>
							<input
								type="range"
								min="0.25"
								max="2"
								step="0.25"
								value={snapshot.simulationRate}
								onchange={(event) =>
									changeSnapshot({ simulationRate: Number(event.currentTarget.value) })}
							/>
						</label>
						<label
							>Bluetooth visual offset <output>{bluetoothOffsetMs} ms</output>
							<input
								type="range"
								min="-500"
								max="500"
								step="10"
								value={bluetoothOffsetMs}
								oninput={(event) => (bluetoothOffsetMs = Number(event.currentTarget.value))}
							/>
						</label>
						<label
							>Rendering quality
							<select bind:value={quality}
								><option value="low">Low</option><option value="medium">Medium</option><option
									value="high">High</option
								></select
							>
						</label>
						<button type="button" onclick={resetInstrument}>Reset complete instrument</button>
					</div>
					<DiagnosticsPanel
						pointCount={data?.trajectory.pointCount}
						eventCount={data?.score.length}
						{generationMs}
						{fps}
						{workerMode}
						renderer={`${rendererReport.kind} · ${rendererReport.status}`}
						diagnostics={data?.diagnostics}
						lyapunovUnit={definition.family === 'discrete-map'
							? 'per iteration'
							: 'per simulated time unit'}
						audioLookaheadMs={125}
					/>
				</div>
			</details>

			<div class="lower-grid">
				<AccessibleSummary {status} rows={summaryRows} />
				<ExportSharePanel
					busy={exporting}
					disabled={!exportReady}
					progress={exportProgress}
					message={exportMessage}
					oncopylink={() => void copyDeterministicUrl()}
					onexport={(kind) => void runExport(kind)}
					oncancel={cancelExport}
				/>
			</div>
		</div>
	{/if}

	<p class="live-status" aria-live="polite">{status}</p>
	{#if urlNotice}<p class="url-notice">{urlNotice}</p>{/if}
	<p class="gesture-note" aria-hidden={!conductorActive}>
		gesture {conductorX.toFixed(1)} / {conductorY.toFixed(1)} · ephemeral, never serialized
	</p>
</section>

<style>
	.experience {
		min-height: 100svh;
		background:
			radial-gradient(circle at 79% 12%, rgb(24 61 64 / 28%), transparent 36rem),
			linear-gradient(180deg, #060b0e, #030608 58%, #070b0d);
		padding: clamp(0.7rem, 1.7vw, 1.65rem);
		color: #ece7da;
		font-family: var(--font-sans, sans-serif);
	}

	.masthead,
	.masthead-actions,
	.transport-row,
	.view-choices,
	.seed-controls div {
		display: flex;
		align-items: center;
	}

	.masthead {
		justify-content: space-between;
		gap: 1rem;
		padding: 0.2rem 0 0.8rem;
	}

	.masthead p,
	.masthead h2 {
		margin: 0;
	}

	.masthead p {
		color: #7ebfc0;
		font: 700 0.58rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.masthead h2 {
		margin-top: 0.15rem;
		font: 720 clamp(1.2rem, 2.3vw, 2rem) / 1 var(--font-serif, serif);
		letter-spacing: -0.035em;
	}

	.masthead-actions {
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
	}

	.masthead button,
	.view-choices button,
	.seed-controls button,
	.advanced-controls button,
	.stage-stop {
		min-height: 2.75rem;
		border: 1px solid rgb(225 219 201 / 22%);
		border-radius: 0.42rem;
		background: #0a1013;
		padding: 0.62rem 0.78rem;
		color: #d8d4c8;
		font: 680 0.69rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	.masthead button.sound-enable {
		border-color: #bd865e;
		background: #bd865e;
		color: #140d09;
	}

	.seed {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2.75rem;
		color: #7f8c89;
		font: 0.61rem/1 var(--font-mono, monospace);
	}

	.seed i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: #6bb4a6;
		box-shadow: 0 0 0 3px rgb(107 180 166 / 12%);
	}

	.seed code {
		max-width: 16ch;
		overflow: hidden;
		color: #b6b9af;
		text-overflow: ellipsis;
	}

	kbd {
		color: #737c79;
		font: 600 0.6rem/1 var(--font-mono, monospace);
	}

	.stage-frame {
		position: relative;
	}

	.stage-frame :global(.stage-shell) {
		transition:
			opacity 220ms ease,
			filter 220ms ease;
	}

	.stage-frame.regenerating :global(.stage-shell) {
		filter: saturate(0.45) brightness(0.72);
		opacity: 0.22;
	}

	.stage-stop {
		position: absolute;
		z-index: 15;
		top: 0.85rem;
		right: 0.85rem;
		border-color: rgb(209 111 116 / 58%);
		background: rgb(30 12 15 / 88%);
		color: #f0c3c2;
	}

	.generation {
		position: absolute;
		z-index: 16;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 0.38rem;
		color: #6f7b78;
		font: 0.58rem/1.4 var(--font-mono, monospace);
		pointer-events: none;
	}

	.generation span {
		width: 2.8rem;
		height: 2px;
		background: linear-gradient(
			90deg,
			#79cbd0 calc(var(--progress) * 100%),
			rgb(220 216 200 / 13%) 0
		);
	}

	.generation.visible {
		color: #91babb;
	}

	.instrument {
		display: grid;
		gap: 1rem;
		padding-block: 0.85rem 0.4rem;
	}

	.transport-row {
		justify-content: space-between;
		gap: 0.75rem;
	}

	.view-choices {
		gap: 0.3rem;
	}

	.view-choices button[aria-pressed='true'] {
		border-color: #71c5c8;
		background: #173033;
		color: #d8fbfb;
	}

	.control-grid {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) minmax(17rem, 1.25fr) minmax(13rem, 1fr) minmax(
				12rem,
				0.8fr
			);
		gap: clamp(0.8rem, 2vw, 1.5rem);
		align-items: start;
		border-block: 1px solid rgb(220 215 198 / 14%);
		padding-block: 1rem;
	}

	.seed-controls {
		display: grid;
		gap: 0.45rem;
	}

	.seed-controls p {
		margin: 0;
		color: #8da5a4;
		font: 700 0.65rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.seed-controls > code {
		min-height: 2.75rem;
		overflow: hidden;
		border: 1px solid rgb(223 220 203 / 17%);
		border-radius: 0.42rem;
		background: #070d0f;
		padding: 0.85rem 0.65rem;
		color: #b9beb5;
		font-size: 0.67rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.seed-controls div {
		gap: 0.35rem;
	}

	.seed-controls button {
		flex: 1;
	}

	.advanced {
		border: 1px solid rgb(222 217 199 / 16%);
		border-radius: 0.55rem;
		background: #080d10;
	}

	.advanced > summary {
		min-height: 3rem;
		padding: 0.85rem 1rem;
		color: #aec3c1;
		font: 700 0.7rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.advanced-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(14rem, 0.8fr) minmax(15rem, 0.8fr);
		gap: 1.4rem;
		border-top: 1px solid rgb(222 217 199 / 12%);
		padding: 1rem;
	}

	.advanced-controls,
	.advanced-controls fieldset,
	.advanced-controls label {
		display: grid;
		gap: 0.45rem;
	}

	.advanced-controls fieldset {
		border: 0;
		padding: 0;
	}

	.advanced-controls legend,
	.advanced-controls > label {
		color: #91a09d;
		font: 650 0.67rem/1.4 var(--font-mono, monospace);
	}

	.advanced-controls fieldset label {
		display: flex;
		min-height: 2rem;
		align-items: center;
		color: #bbb9b0;
		font-size: 0.72rem;
	}

	.advanced-controls output {
		color: #d0c9b8;
	}

	.advanced-controls input,
	.advanced-controls select {
		min-height: 2rem;
		accent-color: #75c9cc;
	}

	.advanced-controls select {
		border: 1px solid rgb(223 220 203 / 22%);
		border-radius: 0.35rem;
		background: #0b1114;
		padding-inline: 0.5rem;
		color: #ddd9cd;
	}

	.lower-grid {
		display: grid;
		grid-template-columns: minmax(18rem, 0.8fr) minmax(24rem, 1.2fr);
		gap: 1rem;
	}

	.live-status {
		min-height: 1.4em;
		margin: 0.55rem 0 0;
		color: #9abdbc;
		font: 0.65rem/1.45 var(--font-mono, monospace);
	}

	.url-notice {
		margin: 0.25rem 0 0;
		color: #d4ae7d;
		font: 0.62rem/1.45 var(--font-mono, monospace);
	}

	.gesture-note {
		margin: 0.2rem 0 0;
		color: #697370;
		font: 0.58rem/1.4 var(--font-mono, monospace);
	}

	button:focus-visible,
	summary:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	@media (max-width: 1180px) {
		.control-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.advanced-grid {
			grid-template-columns: 1fr 1fr;
		}

		.advanced-grid > :last-child {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 900px) {
		.transport-row,
		.masthead {
			align-items: flex-start;
			flex-direction: column;
		}

		.masthead-actions {
			justify-content: flex-start;
		}

		.lower-grid,
		.advanced-grid {
			grid-template-columns: 1fr;
		}

		.advanced-grid > :last-child {
			grid-column: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto;
		}

		.stage-frame :global(.stage-shell) {
			transition: none;
		}
	}

	@media (prefers-contrast: more) {
		.experience,
		.advanced {
			background: #000;
		}
	}

	@media (forced-colors: active) {
		.experience,
		.advanced,
		button,
		select {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}

	@media print {
		.experience {
			min-height: auto;
			background: white;
			color: black;
		}

		.instrument,
		.masthead-actions,
		.stage-stop {
			display: none;
		}
	}
</style>
