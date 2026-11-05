<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		createSoundboardEngine,
		isWebAudioSupported,
		type SoundboardState
	} from '$lib/visualizations/binaural-acoustic-soundboard/engine';
	import {
		BINAURAL_BASE_HZ,
		BINAURAL_PRESETS,
		CHANNEL_DEFINITIONS,
		CHANNEL_IDS,
		DEFAULT_MASTER_VOLUME,
		MAX_DIFFERENCE_HZ,
		MIN_DIFFERENCE_HZ,
		STARTING_PRESETS,
		TIMER_OPTIONS,
		clampDifferenceHz,
		clampLevel,
		cloneMix,
		matchingStartingPresetId,
		mixEquals,
		resolveBinauralFrequencies,
		type ChannelId,
		type NoiseColor,
		type SoundboardMix,
		type StartingPresetId,
		type TimerMinutes
	} from '$lib/visualizations/binaural-acoustic-soundboard/sounds';
	import {
		MAX_MIX_NAME_LENGTH,
		createSavedMix,
		loadSoundboardStorage,
		sanitizeMixName,
		saveSoundboardStorage,
		type SavedSoundboardMix
	} from '$lib/visualizations/binaural-acoustic-soundboard/storage';

	const dialTicks = Array.from({ length: 41 }, (_, i) => i);
	const volumeScaleMarks = [0, 25, 50, 75, 100];
	const faderScaleMarks = [100, 75, 50, 25, 0];

	let engine: ReturnType<typeof createSoundboardEngine> | undefined;
	let ready = $state(false);
	let audioSupported = $state(true);
	let storageAvailable = $state(true);
	let deviceVolumeOnly = $state(false);
	let reducedMotion = $state(false);
	let pageHidden = $state(false);
	let nowMs = $state(0);
	let outputMeterLevel = $state(0);

	let savedMixes = $state<SavedSoundboardMix[]>([]);
	let selectedSavedMixId = $state<string | null>(null);
	let mixNameInput = $state('');
	let renamingMixId = $state<string | null>(null);
	let renameInput = $state('');
	let deletedMixUndo = $state<{
		mix: SavedSoundboardMix;
		index: number;
	} | null>(null);
	let undoTimeout: ReturnType<typeof setTimeout> | undefined;

	let engineState = $state<SoundboardState>({
		status: 'stopped',
		mix: cloneMix(STARTING_PRESETS.reading.mix),
		masterVolume: DEFAULT_MASTER_VOLUME,
		masterMuted: false,
		sleepEndsAt: null,
		sleepMinutes: 0,
		fadingOut: false,
		loadingChannels: [],
		unavailableChannels: [],
		channelErrors: {},
		error: ''
	});

	// Drag state for vertical rotary dials and desktop vertical fader tracks
	let masterDialDrag: { startY: number; startVolume: number } | null = null;
	let diffDialDrag: { startY: number; startHz: number } | null = null;

	const isPlaying = $derived(engineState.status === 'playing');
	const isLoading = $derived(engineState.status === 'loading');
	const isActive = $derived(isPlaying || isLoading);
	const masterPercent = $derived(Math.round(engineState.masterVolume * 100));

	const matchedStartingPresetId = $derived(matchingStartingPresetId(engineState.mix));
	const matchedSavedMix = $derived(
		savedMixes.find(
			(item) => item.id === selectedSavedMixId && mixEquals(item.mix, engineState.mix)
		) ??
			savedMixes.find((item) => mixEquals(item.mix, engineState.mix)) ??
			null
	);
	const selectedSavedMixRecord = $derived(
		savedMixes.find((item) => item.id === selectedSavedMixId) ?? null
	);
	const canUpdateSelectedSavedMix = $derived(
		selectedSavedMixRecord !== null && !mixEquals(selectedSavedMixRecord.mix, engineState.mix)
	);

	const activeMixLabel = $derived(
		matchedSavedMix
			? matchedSavedMix.name
			: matchedStartingPresetId
				? STARTING_PRESETS[matchedStartingPresetId].name
				: 'Custom mix'
	);

	const isCustomMix = $derived(!matchedStartingPresetId && !matchedSavedMix);

	const binauralInfo = $derived(
		resolveBinauralFrequencies(engineState.mix.binauralDifferenceHz, BINAURAL_BASE_HZ)
	);
	const binauralActive = $derived(
		!engineState.mix.channels.binaural.muted && engineState.mix.channels.binaural.level > 0
	);

	const sleepRemainingSec = $derived(
		engineState.sleepEndsAt === null
			? 0
			: Math.max(0, Math.ceil((engineState.sleepEndsAt - nowMs) / 1000))
	);
	const formattedSleepCountdown = $derived(
		`${Math.floor(sleepRemainingSec / 60)
			.toString()
			.padStart(2, '0')}:${(sleepRemainingSec % 60).toString().padStart(2, '0')}`
	);
	const timerDisplayText = $derived(
		engineState.sleepEndsAt === null
			? 'Timer off'
			: engineState.fadingOut
				? `Stops in ${formattedSleepCountdown} · Fading`
				: `Stops in ${formattedSleepCountdown}`
	);

	const statusDisplayText = $derived(
		engineState.status === 'playing'
			? `Playing · ${activeMixLabel}`
			: engineState.status === 'loading'
				? `Loading audio · ${activeMixLabel}`
				: engineState.status === 'error'
					? 'Playback interrupted'
					: `Stopped · ${activeMixLabel}`
	);

	const effectiveOutputMeter = $derived(
		!isPlaying || engineState.masterMuted
			? 0
			: reducedMotion
				? 0.42
				: outputMeterLevel
	);

	function scalePosition(index: number, totalSteps = 4, radius = 64) {
		const angle = ((-135 + index * (270 / totalSteps)) * Math.PI) / 180;
		return { x: 100 + Math.sin(angle) * radius, y: 100 - Math.cos(angle) * radius };
	}

	function persistState() {
		if (!ready) return;
		const ok = saveSoundboardStorage({
			version: 1,
			master: {
				volume: engineState.masterVolume,
				muted: engineState.masterMuted
			},
			savedMixes
		});
		storageAvailable = ok;
	}

	function togglePlayback() {
		if (!audioSupported || !engine) return;
		if (isActive) {
			engine.stop();
		} else {
			nowMs = Date.now();
			void engine.play();
		}
	}

	function selectStartingPreset(presetId: StartingPresetId) {
		selectedSavedMixId = null;
		const preset = STARTING_PRESETS[presetId];
		engine?.setMix(preset.mix, { rampSeconds: 0.12 });
	}

	function handleChannelFaderInput(channelId: ChannelId, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		engine?.setChannelLevel(channelId, clampLevel(Number(input.value), 0));
	}

	function toggleChannelMuteButton(channelId: ChannelId) {
		const current = engineState.mix.channels[channelId];
		engine?.setChannelMuted(channelId, !current.muted);
	}

	function chooseNoiseColor(color: NoiseColor) {
		engine?.setNoiseColor(color);
	}

	function chooseBinauralPreset(differenceHz: number) {
		engine?.setBinauralDifferenceHz(differenceHz);
	}

	function toggleBinauralLayer() {
		const ch = engineState.mix.channels.binaural;
		const currentlyOn = !ch.muted && ch.level > 0;
		engine?.setChannelMuted('binaural', currentlyOn);
	}

	function handleDifferenceInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		engine?.setBinauralDifferenceHz(clampDifferenceHz(Number(input.value), 10));
	}

	function handleMasterVolumeInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		engine?.setMasterVolume(Number(input.value) / 100);
		persistState();
	}

	function toggleMasterMute() {
		engine?.setMasterMuted(!engineState.masterMuted);
		persistState();
	}

	function chooseTimer(minutes: TimerMinutes) {
		nowMs = Date.now();
		engine?.setSleep(minutes);
	}

	// Rotary dial vertical pointer dragging & keyboard handlers
	function startMasterDialDrag(event: PointerEvent) {
		if (!ready || deviceVolumeOnly) return;
		const el = event.currentTarget as HTMLElement;
		el.setPointerCapture(event.pointerId);
		masterDialDrag = {
			startY: event.clientY,
			startVolume: engineState.masterMuted ? 0 : engineState.masterVolume
		};
	}

	function moveMasterDialDrag(event: PointerEvent) {
		if (!masterDialDrag) return;
		const deltaY = masterDialDrag.startY - event.clientY;
		const nextVol = Math.min(1, Math.max(0, masterDialDrag.startVolume + deltaY / 150));
		engine?.setMasterVolume(Math.round(nextVol * 100) / 100);
	}

	function endMasterDialDrag(event: PointerEvent) {
		if (!masterDialDrag) return;
		const el = event.currentTarget as HTMLElement;
		if (el.hasPointerCapture(event.pointerId)) {
			el.releasePointerCapture(event.pointerId);
		}
		masterDialDrag = null;
		persistState();
	}

	function handleMasterDialKeydown(event: KeyboardEvent) {
		if (!ready || deviceVolumeOnly) return;
		let delta = 0;
		if (event.key === 'ArrowUp' || event.key === 'ArrowRight') delta = 0.02;
		else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') delta = -0.02;
		else if (event.key === 'PageUp') delta = 0.1;
		else if (event.key === 'PageDown') delta = -0.1;
		else if (event.key === 'Home') {
			event.preventDefault();
			engine?.setMasterVolume(0);
			persistState();
			return;
		} else if (event.key === 'End') {
			event.preventDefault();
			engine?.setMasterVolume(1);
			persistState();
			return;
		}
		if (delta !== 0) {
			event.preventDefault();
			const base = engineState.masterMuted ? 0 : engineState.masterVolume;
			engine?.setMasterVolume(Math.round(Math.min(1, Math.max(0, base + delta)) * 100) / 100);
			persistState();
		}
	}

	function startDiffDialDrag(event: PointerEvent) {
		if (!ready) return;
		const el = event.currentTarget as HTMLElement;
		el.setPointerCapture(event.pointerId);
		diffDialDrag = {
			startY: event.clientY,
			startHz: engineState.mix.binauralDifferenceHz
		};
	}

	function moveDiffDialDrag(event: PointerEvent) {
		if (!diffDialDrag) return;
		const deltaY = diffDialDrag.startY - event.clientY;
		const nextHz = clampDifferenceHz(diffDialDrag.startHz + deltaY / 4);
		engine?.setBinauralDifferenceHz(nextHz);
	}

	function endDiffDialDrag(event: PointerEvent) {
		if (!diffDialDrag) return;
		const el = event.currentTarget as HTMLElement;
		if (el.hasPointerCapture(event.pointerId)) {
			el.releasePointerCapture(event.pointerId);
		}
		diffDialDrag = null;
	}

	function handleDiffDialKeydown(event: KeyboardEvent) {
		if (!ready) return;
		let delta = 0;
		if (event.key === 'ArrowUp' || event.key === 'ArrowRight') delta = 0.5;
		else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') delta = -0.5;
		else if (event.key === 'PageUp') delta = 2;
		else if (event.key === 'PageDown') delta = -2;
		else if (event.key === 'Home') {
			event.preventDefault();
			engine?.setBinauralDifferenceHz(MIN_DIFFERENCE_HZ);
			return;
		} else if (event.key === 'End') {
			event.preventDefault();
			engine?.setBinauralDifferenceHz(MAX_DIFFERENCE_HZ);
			return;
		}
		if (delta !== 0) {
			event.preventDefault();
			engine?.setBinauralDifferenceHz(
				clampDifferenceHz(engineState.mix.binauralDifferenceHz + delta)
			);
		}
	}

	// Saved mixes CRUD + Undo
	function saveCurrentMix(event?: SubmitEvent) {
		event?.preventDefault();
		if (!ready) return;
		const fallbackName =
			mixNameInput.trim() ||
			(matchedStartingPresetId
				? `${STARTING_PRESETS[matchedStartingPresetId].name} mix`
				: `Mix ${savedMixes.length + 1}`);
		const entry = createSavedMix(fallbackName, engineState.mix);
		savedMixes = [entry, ...savedMixes].slice(0, 24);
		selectedSavedMixId = entry.id;
		mixNameInput = '';
		persistState();
	}

	function loadSavedMix(item: SavedSoundboardMix) {
		selectedSavedMixId = item.id;
		renamingMixId = null;
		engine?.setMix(item.mix, { rampSeconds: 0.12 });
	}

	function updateSavedMix(item: SavedSoundboardMix) {
		const updated: SavedSoundboardMix = {
			...item,
			mix: cloneMix(engineState.mix),
			updatedAt: Date.now()
		};
		savedMixes = savedMixes.map((entry) => (entry.id === item.id ? updated : entry));
		selectedSavedMixId = item.id;
		persistState();
	}

	function startRenamingMix(item: SavedSoundboardMix) {
		renamingMixId = item.id;
		renameInput = item.name;
	}

	function commitRenameMix(item: SavedSoundboardMix) {
		const nextName = sanitizeMixName(renameInput, item.name);
		savedMixes = savedMixes.map((entry) =>
			entry.id === item.id ? { ...entry, name: nextName, updatedAt: Date.now() } : entry
		);
		renamingMixId = null;
		renameInput = '';
		persistState();
	}

	function deleteSavedMix(item: SavedSoundboardMix) {
		const index = savedMixes.findIndex((entry) => entry.id === item.id);
		if (index === -1) return;
		savedMixes = savedMixes.filter((entry) => entry.id !== item.id);
		if (selectedSavedMixId === item.id) selectedSavedMixId = null;
		if (renamingMixId === item.id) renamingMixId = null;

		clearTimeout(undoTimeout);
		deletedMixUndo = { mix: item, index };
		undoTimeout = setTimeout(() => {
			deletedMixUndo = null;
		}, 10_000);
		persistState();
	}

	function undoDeleteMix() {
		if (!deletedMixUndo) return;
		const { mix, index } = deletedMixUndo;
		clearTimeout(undoTimeout);
		deletedMixUndo = null;
		if (!savedMixes.some((entry) => entry.id === mix.id)) {
			const next = [...savedMixes];
			next.splice(Math.min(index, next.length), 0, mix);
			savedMixes = next.slice(0, 24);
			selectedSavedMixId = mix.id;
			persistState();
		}
	}

	function formatMixSummary(mix: SoundboardMix): string {
		const activeParts: string[] = [];
		for (const id of CHANNEL_IDS) {
			const ch = mix.channels[id];
			if (!ch.muted && ch.level > 0) {
				if (id === 'noise') {
					activeParts.push(`${mix.noiseColor === 'pink' ? 'Pink' : 'Brown'} ${ch.level}%`);
				} else if (id === 'binaural') {
					activeParts.push(`Binaural ${mix.binauralDifferenceHz} Hz (${ch.level}%)`);
				} else {
					activeParts.push(`${CHANNEL_DEFINITIONS[id].name} ${ch.level}%`);
				}
			}
		}
		return activeParts.length > 0 ? activeParts.join(' · ') : 'All channels muted';
	}

	onMount(() => {
		audioSupported = isWebAudioSupported();
		const loaded = loadSoundboardStorage();
		storageAvailable = loaded.available;
		savedMixes = loaded.record.savedMixes;

		deviceVolumeOnly =
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			const rootStill = document.documentElement.dataset.motion === 'still';
			reducedMotion = motionQuery.matches || rootStill;
		};
		syncMotion();
		motionQuery.addEventListener('change', syncMotion);

		const motionObserver = new MutationObserver(syncMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});

		engine = createSoundboardEngine((next) => {
			engineState = next;
		});
		engine.setMasterVolume(loaded.record.master.volume);
		engine.setMasterMuted(loaded.record.master.muted);

		nowMs = Date.now();
		pageHidden = document.hidden;
		ready = true;

		let rafId = 0;
		const updateMeterFrame = () => {
			rafId = 0;
			if (!ready || pageHidden || reducedMotion || !engine) return;
			if (engineState.status === 'playing' && !engineState.masterMuted) {
				outputMeterLevel = engine.getOutputLevel();
				rafId = window.requestAnimationFrame(updateMeterFrame);
			} else {
				outputMeterLevel = 0;
			}
		};

		const clockInterval = window.setInterval(() => {
			if (!document.hidden) {
				nowMs = Date.now();
			}
			if (
				ready &&
				!pageHidden &&
				!reducedMotion &&
				engineState.status === 'playing' &&
				!rafId
			) {
				rafId = window.requestAnimationFrame(updateMeterFrame);
			}
		}, 250);

		const handleVisibility = () => {
			pageHidden = document.hidden;
			if (!document.hidden) {
				nowMs = Date.now();
				engine?.checkSleep();
				if (!reducedMotion && engineState.status === 'playing' && !rafId) {
					rafId = window.requestAnimationFrame(updateMeterFrame);
				}
			} else if (rafId) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			ready = false;
			clearTimeout(undoTimeout);
			window.clearInterval(clockInterval);
			if (rafId) window.cancelAnimationFrame(rafId);
			motionQuery.removeEventListener('change', syncMotion);
			motionObserver.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			engine?.destroy();
			engine = undefined;
		};
	});
</script>

<section
	class="soundboard-app not-prose article-breakout"
	data-testid="binaural-acoustic-soundboard"
	data-tts-exclude
	aria-label="Binaural Acoustic Soundboard"
>
	<header class="soundboard-header">
		<div class="header-copy">
			<p class="eyebrow">ACOUSTIC INSTRUMENT · BACKGROUND MIXER</p>
			<h1>Binaural Acoustic Soundboard</h1>
			<p class="intro">
				Mix rain, a fan, soft noise and optional binaural tones. Save a mix you like, or set it to
				stop after 15, 30 or 60 minutes.
			</p>
		</div>
		<div class="header-companion">
			<a href={resolve('/blog/visualizations/calcutta-radio')} class="companion-link">
				<span>Companion to Calcutta Radio</span>
				<small>Open live stations ↗</small>
			</a>
		</div>
	</header>

	{#if !audioSupported}
		<div class="unsupported-banner" role="alert" data-testid="webaudio-unavailable">
			<p>
				<strong>Web Audio is unavailable in this browser.</strong> Sound synthesis and mixing controls
				require a browser that supports the Web Audio API.
			</p>
		</div>
	{:else}
		<div class="instrument-casing" data-testid="soundboard-panel">
			<!-- Area 1: Narrow Status Display Across the Top -->
			<div class="status-display" data-testid="soundboard-display">
				<div class="status-left">
					<span
						class="status-lamp"
						class:playing={isPlaying}
						class:loading={isLoading}
						aria-hidden="true"
					></span>
					<span
						class="status-readout"
						role="status"
						aria-live="polite"
						data-testid="soundboard-status"
					>
						{statusDisplayText}
					</span>
				</div>

				<div class="status-right">
					<div class="output-meter" aria-label="Outgoing audio level">
						<span class="meter-caption">Output</span>
						<div
							class="meter-bars"
							role="meter"
							aria-label="Output level"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.round(effectiveOutputMeter * 100)}
						>
							{#each Array.from({ length: 8 }, (_, idx) => idx) as barIdx (barIdx)}
								<span
									class="meter-segment"
									class:lit={isPlaying &&
										!engineState.masterMuted &&
										effectiveOutputMeter >= (barIdx + 1) * 0.1}
								></span>
							{/each}
						</div>
					</div>

					<span
						class="timer-readout"
						class:active={engineState.sleepEndsAt !== null}
						class:fading={engineState.fadingOut}
						data-testid="soundboard-timer-status"
					>
						{timerDisplayText}
					</span>
				</div>
			</div>

			{#if engineState.error}
				<div class="status-alert" role="alert" data-testid="soundboard-error">
					<p>{engineState.error}</p>
					<button type="button" onclick={togglePlayback}>Try Play again</button>
				</div>
			{/if}

			{#if engineState.unavailableChannels.length > 0}
				<div class="status-alert channel-warning" role="status" data-testid="channel-unavailable">
					{#each engineState.unavailableChannels as chId (chId)}
						<div class="unavailable-row">
							<span>
								{engineState.channelErrors[chId] ??
									`${CHANNEL_DEFINITIONS[chId].name} audio is unavailable right now.`}
							</span>
							{#if chId === 'rain' || chId === 'city'}
								<button type="button" onclick={() => engine?.retryChannel(chId)}>
									Retry {CHANNEL_DEFINITIONS[chId].name}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Main Workbench: Centre Faders + Right Master Dial / Transport / Timer -->
			<div class="workbench-grid">
				<!-- Area 2: Five Sound Faders in the Centre -->
				<div class="fader-bank" data-testid="channel-faders" role="group" aria-label="Sound channels">
					{#each CHANNEL_IDS as channelId (channelId)}
						{@const def = CHANNEL_DEFINITIONS[channelId]}
						{@const ch = engineState.mix.channels[channelId]}
						{@const isOff = ch.muted || ch.level === 0}
						{@const fillPercent = ch.muted ? 0 : ch.level}
						{@const isUnavailable = engineState.unavailableChannels.includes(channelId)}
						<div
							class="channel-strip"
							class:muted={ch.muted}
							class:active={!isOff}
							class:unavailable={isUnavailable}
							data-testid={`channel-strip-${channelId}`}
						>
							<div class="channel-top">
								<div class="channel-title-row">
									<label for={`fader-${channelId}`} class="channel-name">{def.name}</label>
									<output
										for={`fader-${channelId}`}
										class="channel-value"
										data-testid={`channel-level-${channelId}`}
									>
										{#if isUnavailable}
											Unavailable
										{:else if ch.muted}
											{ch.level > 0 ? `Muted · ${ch.level}%` : 'Off'}
										{:else}
											{ch.level}%
										{/if}
									</output>
								</div>
								<p class="channel-desc">{def.description}</p>
							</div>

							<div class="fader-well">
								<div class="fader-scale" aria-hidden="true">
									{#each faderScaleMarks as mark (mark)}
										<span>{mark}</span>
									{/each}
								</div>
								<div class="fader-slot">
									<div class="fader-track-groove" aria-hidden="true">
										<div class="fader-fill" style={`--fill: ${fillPercent}%`}></div>
										<div class="fader-cap" style={`--pos: ${ch.level}%`}>
											<span class="cap-line"></span>
										</div>
									</div>
									<input
										id={`fader-${channelId}`}
										type="range"
										min="0"
										max="100"
										step="1"
										value={ch.level}
										aria-label={`${def.name} level`}
										aria-valuetext={ch.muted
											? `${ch.level} per cent (muted)`
											: `${ch.level} per cent`}
										oninput={(e) => handleChannelFaderInput(channelId, e)}
										disabled={!ready}
										class="fader-input"
										data-testid={`fader-${channelId}`}
									/>
								</div>
							</div>

							<div class="channel-subcontrol">
								{#if channelId === 'noise'}
									<div
										class="segmented-choice"
										role="group"
										aria-label="Soft noise type"
									>
										<button
											type="button"
											class:chosen={engineState.mix.noiseColor === 'brown'}
											aria-pressed={engineState.mix.noiseColor === 'brown'}
											onclick={() => chooseNoiseColor('brown')}
											disabled={!ready}
											data-testid="noise-color-brown"
										>
											Brown
										</button>
										<button
											type="button"
											class:chosen={engineState.mix.noiseColor === 'pink'}
											aria-pressed={engineState.mix.noiseColor === 'pink'}
											onclick={() => chooseNoiseColor('pink')}
											disabled={!ready}
											data-testid="noise-color-pink"
										>
											Pink
										</button>
									</div>
								{:else if channelId === 'binaural'}
									<div class="binaural-strip-badge" data-testid="binaural-strip-summary">
										<span>{binauralInfo.presetLabel}</span>
										<small>{binauralInfo.leftHz}L / {binauralInfo.rightHz}R</small>
									</div>
								{:else}
									<div class="channel-spacer" aria-hidden="true"></div>
								{/if}
							</div>

							<button
								type="button"
								class="mute-button"
								class:is-muted={ch.muted}
								aria-pressed={ch.muted}
								aria-label={ch.muted ? `Unmute ${def.name}` : `Mute ${def.name}`}
								onclick={() => toggleChannelMuteButton(channelId)}
								disabled={!ready}
								data-testid={`channel-mute-${channelId}`}
							>
								<span class="mute-dot" aria-hidden="true"></span>
								<span>{ch.muted ? 'Muted' : 'Mute'}</span>
							</button>
						</div>
					{/each}
				</div>

				<!-- Area 3: Main Volume Dial with Playback and Timer Controls Beside Them -->
				<aside class="master-column" data-testid="master-section" aria-label="Master controls">
					<fieldset class="master-dial-box">
						<legend class="section-caption">Master volume</legend>

						<div
							class="rotary-dial-surface"
							role="slider"
							tabindex={ready && !deviceVolumeOnly ? 0 : -1}
							aria-label="Master volume dial"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={engineState.masterMuted ? 0 : masterPercent}
							aria-valuetext={deviceVolumeOnly
								? 'Controlled by device volume buttons'
								: engineState.masterMuted
									? `Muted (${masterPercent} per cent retained)`
									: `${masterPercent} per cent`}
							onpointerdown={startMasterDialDrag}
							onpointermove={moveMasterDialDrag}
							onpointerup={endMasterDialDrag}
							onpointercancel={endMasterDialDrag}
							onkeydown={handleMasterDialKeydown}
							data-testid="master-volume-dial"
						>
							<svg viewBox="0 0 200 200" class="dial-svg" aria-hidden="true">
								<circle cx="100" cy="100" r="92" class="dial-well" />
								<circle cx="100" cy="100" r="78" class="dial-cap-outer" />
								<circle cx="100" cy="100" r="68" class="dial-cap-inner" />

								{#each dialTicks as i (i)}
									<line
										x1="100"
										y1="14"
										x2="100"
										y2={i % 10 === 0 ? 24 : 19}
										transform={`rotate(${-135 + i * 6.75} 100 100)`}
										class="dial-tick"
										class:lit={!deviceVolumeOnly &&
											!engineState.masterMuted &&
											i <= Math.round(engineState.masterVolume * 40)}
									/>
								{/each}

								{#each volumeScaleMarks as label, idx (label)}
									{@const pos = scalePosition(idx, 4, 84)}
									<text x={pos.x} y={pos.y} class="dial-scale-label">{label}</text>
								{/each}

								<g
									transform={`rotate(${-135 + (deviceVolumeOnly || engineState.masterMuted ? 0 : engineState.masterVolume) * 270} 100 100)`}
								>
									<line x1="100" y1="100" x2="100" y2="38" class="dial-pointer" />
									<circle cx="100" cy="42" r="3.2" class="dial-pointer-tip" />
								</g>

								<circle cx="100" cy="100" r="14" class="dial-hub" />
								<text x="100" y="148" class="dial-readout-text">
									{deviceVolumeOnly ? 'DEVICE' : engineState.masterMuted ? 'MUTED' : `${masterPercent}%`}
								</text>
							</svg>
						</div>

						<div class="master-slider-fallback">
							{#if deviceVolumeOnly}
								<p class="device-volume-note">Use your device’s volume buttons</p>
							{:else}
								<label for="master-volume-range" class="sr-only">Master volume slider</label>
								<input
									id="master-volume-range"
									type="range"
									min="0"
									max="100"
									step="1"
									value={masterPercent}
									aria-label="Master volume"
									aria-valuetext={engineState.masterMuted
										? `${masterPercent} per cent (muted)`
										: `${masterPercent} per cent`}
									oninput={handleMasterVolumeInput}
									disabled={!ready}
									data-testid="master-volume-slider"
								/>
							{/if}
						</div>
					</fieldset>

					<div class="transport-box" role="group" aria-label="Playback controls">
						<button
							type="button"
							class="play-button"
							class:active={isActive}
							onclick={togglePlayback}
							disabled={!ready}
							aria-label={isActive ? 'Stop' : 'Play'}
							data-testid="soundboard-play"
						>
							{#if isActive}
								<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
									<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
								</svg>
								<span>Stop</span>
							{:else}
								<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
									<path d="M8 5v14l11-7Z" fill="currentColor" />
								</svg>
								<span>Play</span>
							{/if}
						</button>

						<button
							type="button"
							class="master-mute-button"
							class:is-muted={engineState.masterMuted}
							aria-pressed={engineState.masterMuted}
							aria-label={engineState.masterMuted ? 'Unmute master output' : 'Mute master output'}
							onclick={toggleMasterMute}
							disabled={!ready}
							data-testid="master-mute"
						>
							<svg
								width="17"
								height="17"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								aria-hidden="true"
							>
								<path d="M11 5 6 9H3v6h3l5 4V5Z" />
								{#if engineState.masterMuted}
									<path d="m16 9 5 6m0-6-5 6" />
								{:else}
									<path d="M15.5 8.5a5 5 0 0 1 0 7" />
								{/if}
							</svg>
							<span>{engineState.masterMuted ? 'Muted' : 'Mute'}</span>
						</button>
					</div>

					<fieldset class="timer-box" data-testid="timer-controls">
						<legend class="section-caption">Sleep timer</legend>
						<div class="timer-buttons" role="group" aria-label="Sleep timer duration">
							{#each TIMER_OPTIONS as minutes (minutes)}
								{@const isChosen =
									minutes === 0
										? engineState.sleepEndsAt === null
										: engineState.sleepEndsAt !== null && engineState.sleepMinutes === minutes}
								<button
									type="button"
									class:chosen={isChosen}
									aria-pressed={isChosen}
									aria-label={minutes === 0
										? 'Timer off'
										: `Stop after ${minutes} minutes`}
									onclick={() => chooseTimer(minutes)}
									disabled={!ready}
									data-testid={`timer-${minutes === 0 ? 'off' : minutes}`}
								>
									{minutes === 0 ? 'Off' : `${minutes}m`}
								</button>
							{/each}
						</div>
						<p class="timer-subnote" data-testid="timer-subnote">
							{#if engineState.sleepEndsAt !== null}
								{timerDisplayText} · Fades gently over the final 10s
							{:else}
								Timer off · Continuous until you press Stop
							{/if}
						</p>
					</fieldset>
				</aside>
			</div>

			<!-- Binaural Tones Control Bay -->
			<div class="binaural-bay" data-testid="binaural-controls">
				<div class="binaural-header">
					<div class="binaural-title-group">
						<h2>Binaural tones</h2>
						<span class="headphones-badge">Stereo headphones needed for the binaural effect</span>
					</div>
					<div class="binaural-layer-actions">
						<span class="speakers-note">Ambient channels can also be used through speakers.</span>
						<button
							type="button"
							class="binaural-enable-btn"
							class:on={binauralActive}
							aria-pressed={binauralActive}
							onclick={toggleBinauralLayer}
							disabled={!ready}
							data-testid="binaural-toggle"
						>
							{binauralActive
								? `Binaural on (${engineState.mix.channels.binaural.level}%)`
								: 'Binaural off'}
						</button>
					</div>
				</div>

				<div
					class="binaural-preset-row"
					role="group"
					aria-label="Binaural frequency difference presets"
				>
					{#each BINAURAL_PRESETS as preset (preset.id)}
						{@const selected = binauralInfo.presetId === preset.id}
						<button
							type="button"
							class="freq-preset-btn"
							class:selected
							aria-pressed={selected}
							onclick={() => chooseBinauralPreset(preset.differenceHz)}
							disabled={!ready}
							data-testid={`binaural-preset-${preset.id}`}
						>
							<span class="freq-name">{preset.label}</span>
							<span class="freq-hz">{preset.differenceHz} Hz</span>
						</button>
					{/each}
				</div>

				<div class="binaural-disclosures">
					<details class="soundboard-disclosure" data-testid="binaural-explanation">
						<summary>How binaural tones work</summary>
						<div class="disclosure-body">
							<p>
								Each ear receives a slightly different tone. With stereo headphones, this can create
								the impression of a repeating beat. The frequency names describe the setting, not
								what your brain is doing.
							</p>
							<p>
								For example, the <strong>Alpha</strong> setting uses
								<code>220 Hz left / 230 Hz right</code>, a difference of <code>10 Hz</code>. The
								<code>40 Hz</code> <strong>Gamma</strong> option is an exploratory frequency setting and
								does not promise a single slow beat.
							</p>
						</div>
					</details>

					<details class="soundboard-disclosure" data-testid="fine-adjustment-disclosure">
						<summary>Fine adjustment</summary>
						<div class="disclosure-body fine-adjust-grid">
							<div
								class="mini-dial-wrap"
								role="slider"
								tabindex={ready ? 0 : -1}
								aria-label="Frequency difference dial"
								aria-valuemin={MIN_DIFFERENCE_HZ}
								aria-valuemax={MAX_DIFFERENCE_HZ}
								aria-valuenow={binauralInfo.differenceHz}
								aria-valuetext={`${binauralInfo.differenceHz} hertz difference (${binauralInfo.leftHz} hertz left, ${binauralInfo.rightHz} hertz right)`}
								onpointerdown={startDiffDialDrag}
								onpointermove={moveDiffDialDrag}
								onpointerup={endDiffDialDrag}
								onpointercancel={endDiffDialDrag}
								onkeydown={handleDiffDialKeydown}
								data-testid="binaural-diff-dial"
							>
								<svg viewBox="0 0 120 120" class="mini-dial-svg" aria-hidden="true">
									<circle cx="60" cy="60" r="52" class="dial-well" />
									<circle cx="60" cy="60" r="42" class="dial-cap-inner" />
									<g
										transform={`rotate(${-135 + ((binauralInfo.differenceHz - MIN_DIFFERENCE_HZ) / (MAX_DIFFERENCE_HZ - MIN_DIFFERENCE_HZ)) * 270} 60 60)`}
									>
										<line x1="60" y1="60" x2="60" y2="24" class="dial-pointer" />
									</g>
									<circle cx="60" cy="60" r="8" class="dial-hub" />
								</svg>
								<span class="mini-dial-caption">Drag vertically</span>
							</div>

							<div class="fine-controls-stack">
								<div class="ear-values-readout" data-testid="binaural-ear-readout">
									<span>Left ear: <strong>{binauralInfo.leftHz} Hz</strong></span>
									<span aria-hidden="true">·</span>
									<span>Right ear: <strong>{binauralInfo.rightHz} Hz</strong></span>
									<span aria-hidden="true">·</span>
									<span>Difference: <strong>{binauralInfo.differenceHz} Hz</strong></span>
								</div>

								<div class="fine-slider-row">
									<label for="binaural-diff-range">Frequency difference (1–40 Hz)</label>
									<div class="fine-inputs">
										<input
											id="binaural-diff-range"
											type="range"
											min={MIN_DIFFERENCE_HZ}
											max={MAX_DIFFERENCE_HZ}
											step="0.5"
											value={binauralInfo.differenceHz}
											oninput={handleDifferenceInput}
											disabled={!ready}
											data-testid="binaural-diff-slider"
										/>
										<input
											type="number"
											min={MIN_DIFFERENCE_HZ}
											max={MAX_DIFFERENCE_HZ}
											step="0.5"
											value={binauralInfo.differenceHz}
											aria-label="Frequency difference in Hz"
											onchange={handleDifferenceInput}
											disabled={!ready}
											class="fine-number-input"
											data-testid="binaural-diff-number"
										/>
									</div>
								</div>
							</div>
						</div>
					</details>
				</div>
			</div>

			<!-- Presets and Saved Mixes Immediately Below -->
			<div class="presets-bay" data-testid="presets-and-mixes">
				<div class="starting-presets-row">
					<div class="presets-heading">
						<h2>Starting mixes</h2>
						<span class="mix-state-pill" class:custom={isCustomMix} data-testid="active-mix-badge">
							{activeMixLabel}
						</span>
					</div>

					<div class="preset-buttons" role="group" aria-label="Starting mixes">
						{#each ['reading', 'work', 'rest'] as const as presetId (presetId)}
							{@const preset = STARTING_PRESETS[presetId]}
							{@const selected = matchedStartingPresetId === presetId && !matchedSavedMix}
							<button
								type="button"
								class="preset-card-btn"
								class:selected
								aria-pressed={selected}
								onclick={() => selectStartingPreset(presetId)}
								disabled={!ready}
								data-testid={`preset-${presetId}`}
							>
								<span class="preset-title">
									{preset.name}
									{#if selected}<i aria-hidden="true">●</i>{/if}
								</span>
								<span class="preset-summary">{preset.summary}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="saved-mixes-section">
					<form class="save-mix-form" onsubmit={saveCurrentMix}>
						<label for="save-mix-name" class="sr-only">Mix name</label>
						<input
							id="save-mix-name"
							type="text"
							maxlength={MAX_MIX_NAME_LENGTH}
							bind:value={mixNameInput}
							placeholder={isCustomMix ? 'Name this custom mix…' : 'Name this mix…'}
							disabled={!ready || !storageAvailable}
							data-testid="save-mix-input"
						/>
						<button
							type="submit"
							class="hardware-btn primary-save"
							disabled={!ready || !storageAvailable}
							data-testid="save-mix-button"
						>
							Save mix
						</button>
						{#if canUpdateSelectedSavedMix && selectedSavedMixRecord}
							<button
								type="button"
								class="hardware-btn"
								onclick={() => updateSavedMix(selectedSavedMixRecord)}
								disabled={!ready || !storageAvailable}
								data-testid="update-selected-mix-button"
							>
								Update “{selectedSavedMixRecord.name}”
							</button>
						{/if}
					</form>

					<div class="storage-meta-row">
						{#if storageAvailable}
							<p class="storage-hint">Saved on this browser and device.</p>
						{:else}
							<p class="storage-warning" role="status" data-testid="storage-blocked-message">
								Your mixes cannot be saved in this browser right now.
							</p>
						{/if}

						{#if deletedMixUndo}
							<div class="undo-banner" role="status" data-testid="undo-delete-banner">
								<span>Deleted “{deletedMixUndo.mix.name}”.</span>
								<button type="button" onclick={undoDeleteMix} data-testid="undo-delete-button">
									Undo
								</button>
							</div>
						{/if}
					</div>

					{#if savedMixes.length > 0}
						<ul class="saved-mix-list" aria-label="Saved mixes" data-testid="saved-mix-list">
							{#each savedMixes as item (item.id)}
								{@const isCurrent = matchedSavedMix?.id === item.id}
								<li class="saved-mix-item" class:selected={isCurrent}>
									{#if renamingMixId === item.id}
										<div class="rename-row">
											<label for={`rename-${item.id}`} class="sr-only">New mix name</label>
											<input
												id={`rename-${item.id}`}
												type="text"
												maxlength={MAX_MIX_NAME_LENGTH}
												bind:value={renameInput}
												data-testid={`rename-input-${item.id}`}
											/>
											<button
												type="button"
												class="hardware-btn small"
												onclick={() => commitRenameMix(item)}
												data-testid={`rename-save-${item.id}`}
											>
												Save name
											</button>
											<button
												type="button"
												class="hardware-btn small"
												onclick={() => (renamingMixId = null)}
											>
												Cancel
											</button>
										</div>
									{:else}
										<button
											type="button"
											class="saved-mix-select"
											aria-pressed={isCurrent}
											onclick={() => loadSavedMix(item)}
											data-testid={`load-mix-${item.id}`}
										>
											<span class="saved-mix-name">
												{item.name}
												{#if isCurrent}<i aria-hidden="true">●</i>{/if}
											</span>
											<span class="saved-mix-details">{formatMixSummary(item.mix)}</span>
										</button>
										<div class="saved-mix-actions">
											<button
												type="button"
												class="hardware-btn small"
												onclick={() => updateSavedMix(item)}
												title="Overwrite this mix with current fader settings"
												data-testid={`update-mix-${item.id}`}
											>
												Update
											</button>
											<button
												type="button"
												class="hardware-btn small"
												onclick={() => startRenamingMix(item)}
												data-testid={`rename-mix-${item.id}`}
											>
												Rename
											</button>
											<button
												type="button"
												class="hardware-btn small danger"
												onclick={() => deleteSavedMix(item)}
												aria-label={`Delete ${item.name}`}
												data-testid={`delete-mix-${item.id}`}
											>
												Delete
											</button>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<details class="technical-disclosure">
		<summary>Technical notes: sound generation, stereo routing and timer fade</summary>
		<div class="disclosure-body">
			<p>
				<strong>Fan</strong> and <strong>Soft noise</strong> (Brown and Pink) are generated procedurally
				in your browser using Web Audio filters and crossfaded stochastic buffers.
				<strong>Rain</strong> and <strong>Distant city</strong> use compact, same-origin seamless stereo
				loops loaded only when those channels are turned up during playback.
			</p>
			<p>
				When <strong>Binaural tones</strong> are enabled, two separate sine oscillators are routed
				independently to the left and right ears through a stereo <code>ChannelMergerNode</code>
				rather than amplitude-modulating a single tone. The sleep timer uses a dedicated Web Audio gain
				stage that ramps smoothly to silence over the final ten seconds, so adjusting the master volume
				dial never overrides an active fade.
			</p>
		</div>
	</details>
</section>

<style>
	.soundboard-app {
		--sb-casing: #1c1f21;
		--sb-surface: #25292c;
		--sb-inset: #131618;
		--sb-border: #373c40;
		--sb-groove: #0c0e10;
		--sb-text: #eeeadd;
		--sb-muted: #aba89e;
		--sb-amber: #f07d38;
		--sb-amber-bright: #ffa15f;
		--sb-amber-dim: #5e3820;
		--sb-mono: 'IBM Plex Mono', 'Courier New', monospace;
		--sb-sans: 'Archivo Variable', system-ui, -apple-system, sans-serif;

		box-sizing: border-box;
		position: relative;
		width: min(1120px, calc(100vw - 2rem));
		max-width: none;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		transform: translateX(-50%);
		margin: 0 0 2.5rem;
		padding: clamp(18px, 3.2vw, 38px);
		border: 1px solid #3c4043;
		border-radius: 20px;
		background:
			radial-gradient(ellipse at 18% 15%, rgba(255, 165, 105, 0.055), transparent 58%),
			linear-gradient(165deg, #272b2e 0%, #1c1f22 55%, #171a1c 100%);
		color: var(--sb-text);
		font-family: var(--sb-sans);
		font-size: 14px;
		line-height: 1.5;
		text-align: left;
		color-scheme: dark;
		isolation: isolate;
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.42),
			0 1px 0 rgba(255, 255, 255, 0.08) inset;
	}

	.soundboard-app *,
	.soundboard-app *::before,
	.soundboard-app *::after {
		box-sizing: border-box;
	}

	.soundboard-app h1,
	.soundboard-app h2,
	.soundboard-app p,
	.soundboard-app ul,
	.soundboard-app fieldset {
		margin: 0;
	}

	.soundboard-app button,
	.soundboard-app input {
		font: inherit;
	}

	.soundboard-app button {
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.soundboard-app button:disabled,
	.soundboard-app input:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.soundboard-app button:focus-visible,
	.soundboard-app a:focus-visible,
	.soundboard-app input:focus-visible,
	.soundboard-app summary:focus-visible,
	.rotary-dial-surface:focus-visible,
	.mini-dial-wrap:focus-visible {
		outline: 3px solid #ffba83;
		outline-offset: 3px;
	}

	/* Header */
	.soundboard-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 22px;
	}

	.eyebrow {
		color: #b7b3a8;
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.soundboard-header h1 {
		margin: 6px 0 8px;
		color: #f6f2e8;
		font-size: clamp(26px, 3.6vw, 40px);
		font-weight: 650;
		letter-spacing: -0.04em;
		line-height: 1.12;
	}

	.intro {
		max-width: 62ch;
		color: #cbc7bc;
		font-size: 14px;
		line-height: 1.55;
	}

	.companion-link {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		padding: 8px 12px;
		border: 1px solid #3c4145;
		border-radius: 10px;
		background: rgba(19, 22, 24, 0.65);
		color: #ece8dc;
		text-decoration: none;
		font-size: 12px;
		white-space: nowrap;
		transition: border-color 140ms ease;
	}

	.companion-link:hover {
		border-color: var(--sb-amber);
	}

	.companion-link small {
		color: var(--sb-amber-bright);
		font-size: 11px;
	}

	/* Casing */
	.instrument-casing {
		padding: clamp(14px, 2.2vw, 22px);
		border: 1px solid var(--sb-groove);
		border-radius: 16px;
		background: linear-gradient(180deg, #222629 0%, #191c1f 100%);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.07) inset,
			0 -2px 0 rgba(0, 0, 0, 0.6) inset,
			0 14px 28px rgba(0, 0, 0, 0.35);
	}

	/* Area 1: Narrow Status Display */
	.status-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px 20px;
		padding: 11px 16px;
		border: 2px solid #0d1012;
		border-radius: 10px;
		background: linear-gradient(180deg, #111416 0%, #161a1d 100%);
		box-shadow:
			0 2px 6px rgba(0, 0, 0, 0.75) inset,
			0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.status-lamp {
		flex-shrink: 0;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #4d5256;
		box-shadow: 0 0 0 2px #0b0d0e;
	}

	.status-lamp.playing {
		background: var(--sb-amber);
		box-shadow:
			0 0 0 2px #0b0d0e,
			0 0 10px rgba(240, 125, 56, 0.75);
	}

	.status-lamp.loading {
		background: #e5b55c;
	}

	.status-readout {
		color: #f5efe2;
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	.status-right {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
	}

	.output-meter {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.meter-caption {
		color: #a9a69c;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.meter-bars {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		border-radius: 5px;
		background: #0c0e10;
		border: 1px solid #262b2e;
	}

	.meter-segment {
		width: 4px;
		height: 11px;
		border-radius: 1.5px;
		background: #2b3034;
	}

	.meter-segment.lit {
		background: var(--sb-amber);
		box-shadow: 0 0 5px rgba(240, 125, 56, 0.5);
	}

	.timer-readout {
		font-family: var(--sb-mono);
		font-variant-numeric: tabular-nums;
		font-size: 13px;
		color: #b7b3a8;
		padding: 3px 9px;
		border-radius: 5px;
		background: #0e1113;
		border: 1px solid #282d30;
	}

	.timer-readout.active {
		color: var(--sb-amber-bright);
		border-color: #6b4125;
	}

	.timer-readout.fading {
		color: #ffd09b;
		border-color: var(--sb-amber);
	}

	.status-alert {
		margin-top: 12px;
		padding: 10px 14px;
		border: 1px solid #965734;
		border-radius: 8px;
		background: #281b14;
		color: #f3dfd1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
	}

	.status-alert.channel-warning {
		flex-direction: column;
		align-items: stretch;
	}

	.unavailable-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.status-alert button {
		min-height: 34px;
		padding: 4px 12px;
		border: 1px solid #be7346;
		border-radius: 6px;
		background: #42291b;
		color: #fff2e6;
		font-size: 12px;
		font-weight: 600;
	}

	/* Workbench Grid: Faders + Master Column */
	.workbench-grid {
		margin-top: 16px;
		display: grid;
		grid-template-columns: minmax(0, 1.95fr) minmax(250px, 0.95fr);
		gap: 16px;
		align-items: stretch;
	}

	/* Area 2: Five Sound Faders */
	.fader-bank {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 10px;
	}

	.channel-strip {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px 10px;
		border: 1px solid #101315;
		border-radius: 12px;
		background: linear-gradient(180deg, #282c30 0%, #1f2326 100%);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 4px 10px rgba(0, 0, 0, 0.25);
	}

	.channel-strip.active {
		border-color: #4f3828;
	}

	.channel-top {
		margin-bottom: 10px;
	}

	.channel-title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px;
	}

	.channel-name {
		font-weight: 650;
		font-size: 13px;
		color: #f4f0e4;
		cursor: pointer;
	}

	.channel-value {
		font-family: var(--sb-mono);
		font-variant-numeric: tabular-nums;
		font-size: 11px;
		color: var(--sb-amber-bright);
	}

	.channel-strip.muted .channel-value {
		color: #9e9b91;
	}

	.channel-desc {
		margin-top: 4px;
		color: #b1ada2;
		font-size: 11px;
		line-height: 1.35;
		min-height: 2.7em;
	}

	/* Vertical Fader Well on Desktop */
	.fader-well {
		display: flex;
		align-items: stretch;
		justify-content: center;
		gap: 8px;
		height: 176px;
		margin: 6px 0 10px;
		padding: 8px 6px;
		border-radius: 8px;
		background: #15181b;
		border: 1px solid #0c0e10;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.65) inset;
	}

	.fader-scale {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		color: #8f8c82;
		font-family: var(--sb-mono);
		font-size: 9px;
		line-height: 1;
		padding: 4px 0;
		user-select: none;
	}

	.fader-slot {
		position: relative;
		width: 38px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fader-track-groove {
		position: relative;
		width: 8px;
		height: calc(100% - 16px);
		border-radius: 4px;
		background: #090b0c;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) inset;
	}

	.fader-fill {
		position: absolute;
		left: 1px;
		right: 1px;
		bottom: 1px;
		height: calc(var(--fill, 0%) - 2px);
		min-height: 0;
		max-height: calc(100% - 2px);
		border-radius: 3px;
		background: linear-gradient(180deg, var(--sb-amber-bright), var(--sb-amber));
	}

	.fader-cap {
		position: absolute;
		left: 50%;
		bottom: var(--pos, 0%);
		transform: translate(-50%, 50%);
		width: 28px;
		height: 16px;
		border-radius: 4px;
		background: linear-gradient(180deg, #4b5156 0%, #2a2e32 50%, #383d42 100%);
		border: 1px solid #101214;
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.7),
			0 1px 0 rgba(255, 255, 255, 0.18) inset;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.cap-line {
		width: 16px;
		height: 2px;
		border-radius: 1px;
		background: var(--sb-amber-bright);
	}

	.channel-strip.muted .cap-line {
		background: #8b887f;
	}

	/* Native range input rotated over the vertical slot on desktop */
	.fader-input {
		position: absolute;
		width: 156px;
		height: 38px;
		margin: 0;
		opacity: 0;
		cursor: ns-resize;
		transform: rotate(-90deg);
		touch-action: none;
	}

	.fader-slot:focus-within .fader-cap {
		outline: 2px solid #ffba83;
		outline-offset: 2px;
	}

	.channel-subcontrol {
		min-height: 36px;
		margin-bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.segmented-choice {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		width: 100%;
		padding: 3px;
		border-radius: 6px;
		background: #131618;
		border: 1px solid #0c0e10;
	}

	.segmented-choice button {
		min-height: 28px;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: #b8b4a9;
		font-size: 11px;
		font-weight: 600;
	}

	.segmented-choice button.chosen {
		background: #2f3438;
		border-color: #6b452b;
		color: #ffad73;
	}

	.binaural-strip-badge {
		width: 100%;
		padding: 3px 6px;
		border-radius: 6px;
		background: #14171a;
		border: 1px solid #2b3034;
		text-align: center;
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}

	.binaural-strip-badge span {
		font-size: 11px;
		font-weight: 600;
		color: #f0ebe0;
	}

	.binaural-strip-badge small {
		font-family: var(--sb-mono);
		font-size: 9.5px;
		color: #b4b0a5;
	}

	.mute-button {
		width: 100%;
		min-height: 38px;
		padding: 6px 8px;
		border: 1px solid #101315;
		border-radius: 7px;
		background: linear-gradient(180deg, #31363a 0%, #23272a 100%);
		color: #e4e0d4;
		font-size: 12px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.08) inset,
			0 2px 3px rgba(0, 0, 0, 0.45);
	}

	.mute-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--sb-amber);
	}

	.mute-button.is-muted {
		background: #16191b;
		border-color: #4a3425;
		color: #b9b5aa;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.65) inset;
	}

	.mute-button.is-muted .mute-dot {
		background: #55595c;
	}

	/* Area 3: Master Column */
	.master-column {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 12px;
		padding: 14px;
		border: 1px solid #101315;
		border-radius: 12px;
		background: linear-gradient(180deg, #262a2e 0%, #1c2023 100%);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 4px 10px rgba(0, 0, 0, 0.3);
	}

	.master-dial-box,
	.timer-box {
		border: 1px solid #121518;
		border-radius: 10px;
		padding: 10px 12px 12px;
		background: #181b1e;
	}

	.section-caption {
		padding: 0 6px;
		color: #bebaa0;
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.rotary-dial-surface {
		width: min(176px, 100%);
		margin: 2px auto 6px;
		cursor: ns-resize;
		user-select: none;
		touch-action: none;
		border-radius: 50%;
	}

	.dial-svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.dial-well {
		fill: #0f1214;
		stroke: #07090a;
		stroke-width: 3;
	}

	.dial-cap-outer {
		fill: #24292d;
		stroke: #3b4146;
		stroke-width: 1.5;
	}

	.dial-cap-inner {
		fill: #1b1f22;
		stroke: #111416;
		stroke-width: 2;
	}

	.dial-tick {
		stroke: #565b60;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.dial-tick.lit {
		stroke: var(--sb-amber);
	}

	.dial-scale-label {
		fill: #b4b0a5;
		font-family: var(--sb-mono);
		font-size: 9.5px;
		text-anchor: middle;
		dominant-baseline: middle;
	}

	.dial-pointer {
		stroke: #f6efe0;
		stroke-width: 3.5;
		stroke-linecap: round;
	}

	.dial-pointer-tip {
		fill: var(--sb-amber-bright);
	}

	.dial-hub {
		fill: #121518;
		stroke: #34393e;
		stroke-width: 2;
	}

	.dial-readout-text {
		fill: #f5efe2;
		font-family: var(--sb-mono);
		font-size: 17px;
		font-weight: 600;
		text-anchor: middle;
	}

	.master-slider-fallback input[type='range'] {
		width: 100%;
		height: 28px;
		accent-color: var(--sb-amber);
		cursor: pointer;
	}

	.device-volume-note {
		text-align: center;
		font-size: 11px;
		color: #b8b4a9;
	}

	.transport-box {
		display: grid;
		grid-template-columns: 1.35fr 1fr;
		gap: 10px;
	}

	.play-button {
		min-height: 48px;
		padding: 8px 14px;
		border: 1px solid #0e1113;
		border-radius: 10px;
		background: linear-gradient(180deg, #383e42 0%, #252a2d 100%);
		color: #f7f3e8;
		font-size: 15px;
		font-weight: 650;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		box-shadow:
			0 0 0 2px #5c3922,
			0 4px 10px rgba(0, 0, 0, 0.5),
			0 1px 0 rgba(255, 255, 255, 0.12) inset;
	}

	.play-button.active {
		background: linear-gradient(180deg, #d86928 0%, #a84b16 100%);
		color: #fffaf3;
		box-shadow:
			0 0 0 2px #ff9d5c,
			0 4px 12px rgba(240, 125, 56, 0.35);
	}

	.master-mute-button {
		min-height: 48px;
		padding: 8px 12px;
		border: 1px solid #101315;
		border-radius: 10px;
		background: linear-gradient(180deg, #303539 0%, #222629 100%);
		color: #e4e0d4;
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.master-mute-button.is-muted {
		background: #15181a;
		border-color: var(--sb-amber);
		color: var(--sb-amber-bright);
	}

	.timer-buttons {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		margin-top: 4px;
	}

	.timer-buttons button {
		min-height: 36px;
		padding: 4px 6px;
		border: 1px solid #0e1012;
		border-radius: 6px;
		background: linear-gradient(180deg, #2d3236 0%, #1f2326 100%);
		color: #cbc7bc;
		font-family: var(--sb-mono);
		font-size: 12px;
		font-weight: 600;
	}

	.timer-buttons button.chosen {
		background: #121517;
		border-color: var(--sb-amber);
		color: var(--sb-amber-bright);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.7) inset;
	}

	.timer-subnote {
		margin-top: 8px;
		font-size: 11px;
		color: #b1ada2;
		text-align: center;
	}

	/* Binaural Tones Bay */
	.binaural-bay {
		margin-top: 16px;
		padding: 14px 16px;
		border: 1px solid #111417;
		border-radius: 12px;
		background: linear-gradient(180deg, #23272b 0%, #1b1e21 100%);
	}

	.binaural-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px 16px;
	}

	.binaural-title-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}

	.binaural-title-group h2 {
		font-size: 15px;
		font-weight: 650;
		color: #f3efe4;
	}

	.headphones-badge {
		padding: 3px 9px;
		border-radius: 999px;
		background: #131618;
		border: 1px solid #4d392b;
		color: #f5b484;
		font-size: 11px;
		font-weight: 600;
	}

	.binaural-layer-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}

	.speakers-note {
		color: #b2aea3;
		font-size: 12px;
	}

	.binaural-enable-btn {
		min-height: 36px;
		padding: 5px 12px;
		border: 1px solid #3c4246;
		border-radius: 7px;
		background: #171a1d;
		color: #d6d2c7;
		font-size: 12px;
		font-weight: 600;
	}

	.binaural-enable-btn.on {
		border-color: var(--sb-amber);
		background: #302016;
		color: #ffb178;
	}

	.binaural-preset-row {
		margin-top: 12px;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
	}

	.freq-preset-btn {
		min-height: 44px;
		padding: 7px 10px;
		border: 1px solid #121518;
		border-radius: 8px;
		background: linear-gradient(180deg, #2d3236 0%, #202427 100%);
		color: #e4e0d4;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}

	.freq-preset-btn.selected {
		border-color: var(--sb-amber);
		background: #16191c;
		color: var(--sb-amber-bright);
	}

	.freq-name {
		font-weight: 650;
		font-size: 13px;
	}

	.freq-hz {
		font-family: var(--sb-mono);
		font-size: 12px;
		color: #b7b3a8;
	}

	.freq-preset-btn.selected .freq-hz {
		color: var(--sb-amber-bright);
	}

	.binaural-disclosures {
		margin-top: 12px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: 10px;
	}

	.soundboard-disclosure,
	.technical-disclosure {
		border: 1px solid #2e3337;
		border-radius: 8px;
		background: #16191c;
		padding: 8px 12px;
	}

	.technical-disclosure {
		margin-top: 14px;
	}

	.soundboard-disclosure summary,
	.technical-disclosure summary {
		cursor: pointer;
		color: #dfd9cc;
		font-size: 12px;
		font-weight: 600;
		min-height: 26px;
		display: flex;
		align-items: center;
	}

	.disclosure-body {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #262b2f;
		color: #c7c3b8;
		font-size: 12px;
		line-height: 1.55;
		display: grid;
		gap: 8px;
	}

	.disclosure-body code {
		font-family: var(--sb-mono);
		color: #f5b484;
		font-size: 11.5px;
	}

	.fine-adjust-grid {
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 14px;
	}

	.mini-dial-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		cursor: ns-resize;
		user-select: none;
		touch-action: none;
	}

	.mini-dial-svg {
		width: 72px;
		height: 72px;
	}

	.mini-dial-caption {
		font-size: 10px;
		color: #a8a499;
	}

	.fine-controls-stack {
		display: grid;
		gap: 8px;
	}

	.ear-values-readout {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		font-family: var(--sb-mono);
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #dedad0;
	}

	.ear-values-readout strong {
		color: var(--sb-amber-bright);
	}

	.fine-slider-row label {
		display: block;
		font-size: 11px;
		color: #b7b3a8;
		margin-bottom: 4px;
	}

	.fine-inputs {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.fine-inputs input[type='range'] {
		flex: 1;
		accent-color: var(--sb-amber);
	}

	.fine-number-input {
		width: 72px;
		min-height: 34px;
		padding: 4px 8px;
		border: 1px solid #3a4045;
		border-radius: 6px;
		background: #0f1214;
		color: #f4f0e4;
		font-family: var(--sb-mono);
		font-size: 12px;
	}

	/* Presets and Saved Mixes Area */
	.presets-bay {
		margin-top: 16px;
		padding: 14px 16px;
		border: 1px solid #111417;
		border-radius: 12px;
		background: linear-gradient(180deg, #23272b 0%, #1a1d20 100%);
		display: grid;
		gap: 14px;
	}

	.presets-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}

	.presets-heading h2 {
		font-size: 15px;
		font-weight: 650;
		color: #f3efe4;
	}

	.mix-state-pill {
		padding: 3px 10px;
		border-radius: 999px;
		background: #14171a;
		border: 1px solid #3a4045;
		color: #dedad0;
		font-size: 11.5px;
		font-weight: 600;
	}

	.mix-state-pill.custom {
		border-color: var(--sb-amber);
		color: var(--sb-amber-bright);
	}

	.preset-buttons {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.preset-card-btn {
		min-height: 54px;
		padding: 10px 12px;
		border: 1px solid #121518;
		border-radius: 9px;
		background: linear-gradient(180deg, #2d3236 0%, #202428 100%);
		color: #ece8dc;
		text-align: left;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
	}

	.preset-card-btn.selected {
		border-color: var(--sb-amber);
		background: #16191c;
	}

	.preset-title {
		font-weight: 650;
		font-size: 13.5px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.preset-title i {
		font-style: normal;
		color: var(--sb-amber);
		font-size: 11px;
	}

	.preset-summary {
		font-size: 11px;
		color: #b4b0a5;
	}

	.save-mix-form {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.save-mix-form input[type='text'],
	.rename-row input[type='text'] {
		flex: 1 1 200px;
		min-height: 38px;
		padding: 6px 12px;
		border: 1px solid #3c4247;
		border-radius: 7px;
		background: #121518;
		color: #f3efe4;
		font-size: 13px;
	}

	.save-mix-form input[type='text']::placeholder {
		color: #9e9a90;
	}

	.hardware-btn {
		min-height: 38px;
		padding: 6px 14px;
		border: 1px solid #101315;
		border-radius: 7px;
		background: linear-gradient(180deg, #34393e 0%, #24282c 100%);
		color: #eeeadd;
		font-size: 12.5px;
		font-weight: 600;
	}

	.hardware-btn.primary-save {
		border-color: #7c4928;
		background: linear-gradient(180deg, #473022 0%, #322117 100%);
		color: #ffbe91;
	}

	.hardware-btn.small {
		min-height: 34px;
		padding: 4px 10px;
		font-size: 11.5px;
	}

	.hardware-btn.danger {
		color: #f2b4a6;
	}

	.storage-meta-row {
		margin-top: 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 16px;
	}

	.storage-hint {
		font-size: 11.5px;
		color: #a9a59b;
	}

	.storage-warning {
		font-size: 12px;
		color: #f5b484;
	}

	.undo-banner {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 4px 10px;
		border-radius: 6px;
		background: #2c2018;
		border: 1px solid #7d4c2c;
		font-size: 12px;
		color: #f7dfd0;
	}

	.undo-banner button {
		min-height: 28px;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid var(--sb-amber);
		background: #42291a;
		color: #ffbe91;
		font-weight: 600;
		font-size: 11.5px;
	}

	.saved-mix-list {
		margin-top: 10px;
		list-style: none;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.saved-mix-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 8px 10px;
		border-radius: 8px;
		background: #15181b;
		border: 1px solid #2b3035;
	}

	.saved-mix-item.selected {
		border-color: var(--sb-amber);
	}

	.saved-mix-select {
		flex: 1 1 220px;
		text-align: left;
		border: 0;
		background: transparent;
		color: #f0ece0;
		padding: 4px 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.saved-mix-name {
		font-weight: 650;
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.saved-mix-name i {
		font-style: normal;
		color: var(--sb-amber);
		font-size: 10px;
	}

	.saved-mix-details {
		font-size: 11px;
		color: #b1ada2;
	}

	.saved-mix-actions,
	.rename-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.rename-row {
		width: 100%;
	}

	.unsupported-banner {
		padding: 18px;
		border-radius: 12px;
		border: 1px solid #8c5230;
		background: #241913;
		color: #f2dfd2;
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

	/* Responsive Mobile & Tablet Layout */
	@media (max-width: 900px) {
		.workbench-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.master-column {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
			align-items: center;
		}
	}

	@media (max-width: 760px) {
		.soundboard-app {
			width: calc(100vw - 1rem);
			padding: 18px 14px;
			border-radius: 14px;
		}

		.soundboard-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.companion-link {
			align-items: flex-start;
		}

		/* Horizontal channel sliders on narrow screens */
		.fader-bank {
			grid-template-columns: minmax(0, 1fr);
		}

		.channel-strip {
			gap: 8px;
		}

		.channel-desc {
			min-height: 0;
		}

		.fader-well {
			height: 46px;
			margin: 2px 0;
			padding: 6px 10px;
		}

		.fader-scale {
			display: none;
		}

		.fader-slot {
			width: 100%;
			height: 32px;
		}

		.fader-track-groove {
			width: 100%;
			height: 8px;
		}

		.fader-fill {
			top: 1px;
			bottom: 1px;
			left: 1px;
			right: auto;
			width: calc(var(--fill, 0%) - 2px);
			height: auto;
			max-height: none;
			background: linear-gradient(90deg, var(--sb-amber), var(--sb-amber-bright));
		}

		.fader-cap {
			left: var(--pos, 0%);
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			width: 18px;
			height: 26px;
		}

		.cap-line {
			width: 2px;
			height: 15px;
		}

		.fader-input {
			width: 100%;
			height: 34px;
			transform: none;
			cursor: ew-resize;
			touch-action: pan-y;
		}

		.binaural-preset-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.preset-buttons {
			grid-template-columns: minmax(0, 1fr);
		}

		.fine-adjust-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
