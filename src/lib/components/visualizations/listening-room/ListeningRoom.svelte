<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Icon from './Icon.svelte';
	import { initializeConsent, subscribeConsent, openPrivacySettings } from '$lib/privacy/consent';
	import {
		createYouTubeController,
		parseYouTubeUrl,
		type YouTubeController,
		type YouTubeSnapshot,
		type YouTubeSource
	} from '$lib/visualizations/listening-room/youtube';
	import { SONG_PRESETS } from '$lib/visualizations/listening-room/presets';
	import { LocalAudioEngine, createDemoWav } from '$lib/visualizations/listening-room/audio';
	import {
		PREFERENCES_KEY,
		normalizePreferences
	} from '$lib/visualizations/listening-room/preferences';
	import {
		connectListeningExtension,
		type ExtensionStatus
	} from '$lib/visualizations/listening-room/extension';
	import {
		DEFAULT_AUDIO_SETTINGS,
		EQ_FREQUENCIES,
		EQ_PRESETS,
		eqResponseDb,
		type AudioSettings
	} from '$lib/visualizations/listening-room/dsp';
	import './listening-room.css';

	let mode = $state<'youtube' | 'file'>('youtube');
	let ready = $state(false);
	let inputUrl = $state(SONG_PRESETS[0].url);
	let selectedSong = $state(SONG_PRESETS[0].videoId);
	let playlistChoice = $state<'video' | 'playlist'>('playlist');
	let activePlaylistChoice = $state<'video' | 'playlist'>('video');
	let busy = $state(false);
	let error = $state('');
	let mediaAllowed = $state(false);
	let youtubeMounted = $state(false);
	let youtubeHost = $state<HTMLDivElement>();
	let audioElement: HTMLAudioElement;
	let fileInput: HTMLInputElement;
	let youtube: YouTubeController | undefined;
	let pendingPlayer: AbortController | undefined;
	let playerGeneration = 0;
	let activeSource = $state<YouTubeSource | null>(null);
	let yt = $state<YouTubeSnapshot>({
		state: 'idle',
		currentTime: 0,
		duration: 0,
		volume: 55,
		muted: false,
		playlist: [],
		playlistIndex: 0
	});
	let settings = $state<AudioSettings>({
		...DEFAULT_AUDIO_SETTINGS,
		eq: [...DEFAULT_AUDIO_SETTINGS.eq]
	});
	let muted = $state(false);
	let shuffle = $state(false);
	let repeat = $state<'off' | 'one' | 'all'>('off');
	let localEngine: LocalAudioEngine | undefined;
	let fileName = $state('');
	let fileKind = $state('');
	let objectUrl = '';
	let localPlaybackGeneration = 0;
	let localPlaying = $state(false);
	let localTime = $state(0);
	let localDuration = $state(0);
	let advanced = $state(false);
	let eqPreset = $state('neutral');
	let preferencesSaved = $state(true);
	let extensionStatus = $state<ExtensionStatus>({ installed: false, active: false, error: '' });
	let extension: ReturnType<typeof connectListeningExtension> | undefined;
	let snapshot = $state({
		sampleRate: 0,
		headroomDb: 0,
		peakLeft: 0,
		peakRight: 0,
		rmsLeft: 0,
		rmsRight: 0,
		spectrum: Array(48).fill(0) as number[]
	});
	let response = $state<number[]>([]);
	let destroyed = false;
	let clipUntil = $state(0);
	let clipping = $state(false);

	const parsed = $derived(parseYouTubeUrl(inputUrl));
	const soundControls = $derived(mode === 'file' || extensionStatus.active);
	const playing = $derived(mode === 'youtube' ? yt.state === 'playing' : localPlaying);
	const displayMuted = $derived(mode === 'youtube' && youtubeMounted ? yt.muted : muted);
	const displayVolume = $derived(
		mode === 'youtube' && youtubeMounted ? yt.volume : settings.volume
	);
	const duration = $derived(mode === 'youtube' ? yt.duration : localDuration);
	const position = $derived(mode === 'youtube' ? yt.currentTime : localTime);
	const queueIds = $derived(
		yt.playlist.length
			? yt.playlist
			: activeSource?.videoIds || (activeSource?.videoId ? [activeSource.videoId] : [])
	);
	const currentId = $derived(
		queueIds[yt.playlistIndex] || activeSource?.videoId || (!activeSource ? selectedSong : '')
	);
	const knownSong = $derived(SONG_PRESETS.find((song) => song.videoId === currentId));
	const trackTitle = $derived(
		mode === 'file'
			? fileName || 'Your sound, a little closer.'
			: knownSong?.title || 'YouTube selection'
	);
	const trackArtist = $derived(
		mode === 'file'
			? fileKind || 'Open a file to begin'
			: knownSong?.artist || 'Playing through YouTube'
	);
	const canControl = $derived(
		mode === 'youtube'
			? youtubeMounted &&
					!busy &&
					['cued', 'playing', 'paused', 'buffering', 'ended'].includes(yt.state)
			: !!fileName
	);
	const canNavigate = $derived(
		mode === 'youtube' &&
			youtubeMounted &&
			!busy &&
			!['idle', 'unstarted'].includes(yt.state) &&
			queueIds.length > 1
	);
	const status = $derived(
		busy
			? 'Connecting'
			: playing
				? 'Playing'
				: mode === 'file'
					? fileName
						? 'Ready to listen'
						: 'Local audio'
					: youtubeMounted
						? yt.state === 'unstarted' || yt.state === 'idle'
							? 'Preparing track'
							: yt.state === 'buffering'
								? 'Buffering'
								: 'Ready to listen'
						: 'Ready when you are'
	);
	const watchUrl = $derived(
		activeSource?.playlistId && activePlaylistChoice === 'playlist'
			? `https://www.youtube.com/playlist?list=${activeSource.playlistId}`
			: `https://www.youtube.com/watch?v=${currentId}`
	);
	const responsePath = $derived(
		response
			.map(
				(value, index) =>
					`${index === 0 ? 'M' : 'L'}${(index / Math.max(1, response.length - 1)) * 600},${50 - Math.max(-12, Math.min(12, value)) * 3}`
			)
			.join(' ')
	);

	function time(value: number) {
		if (!Number.isFinite(value) || value < 0) return '0:00';
		const seconds = Math.floor(value);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}
	function db(value: number) {
		return value > 0.0001 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : '−∞ dBFS';
	}
	function releaseYouTube() {
		playerGeneration++;
		pendingPlayer?.abort();
		pendingPlayer = undefined;
		youtube?.destroy();
		youtube = undefined;
		youtubeMounted = false;
		busy = false;
		yt = {
			...yt,
			state: 'idle',
			currentTime: 0,
			duration: 0,
			playlist: [],
			playlistIndex: 0,
			error: undefined,
			autoplayBlocked: false
		};
	}
	function switchMode(next: 'youtube' | 'file') {
		if (next === mode) return;
		localPlaybackGeneration++;
		audioElement?.pause();
		releaseYouTube();
		mode = next;
		error = '';
	}
	async function loadYouTube(sourceOverride?: YouTubeSource) {
		const source = sourceOverride || parsed;
		if (!source) {
			error = 'Enter a valid YouTube song or playlist link.';
			return;
		}
		localPlaybackGeneration++;
		audioElement?.pause();
		releaseYouTube();
		mode = 'youtube';
		error = '';
		busy = true;
		activeSource = source;
		activePlaylistChoice = source.videoId ? playlistChoice : 'playlist';
		const selectedMode = activePlaylistChoice;
		youtubeMounted = true;
		const generation = playerGeneration;
		const aborter = new AbortController();
		pendingPlayer = aborter;
		await tick();
		try {
			if (!youtubeHost) throw new Error('The YouTube player area is not ready. Please try again.');
			const controller = await createYouTubeController(
				youtubeHost,
				(next) => {
					if (destroyed || generation !== playerGeneration) return;
					const previousProviderError = yt.error;
					yt = next;
					// Initial provider defaults must not overwrite the remembered sound.
					if (youtube && !busy) {
						if (settings.volume !== next.volume) settings = { ...settings, volume: next.volume };
						muted = next.muted;
					}
					if (next.error) error = next.error;
					else if (previousProviderError && error === previousProviderError) error = '';
				},
				{ signal: aborter.signal, source, mode: selectedMode }
			);
			if (destroyed || generation !== playerGeneration) {
				controller.destroy();
				return;
			}
			youtube = controller;
			controller.volume(settings.volume);
			controller.mute(muted);
			controller.cue(source, selectedMode);
			controller.repeat(repeat);
			controller.shuffle(shuffle);
		} catch (cause) {
			if (!aborter.signal.aborted && generation === playerGeneration) {
				const message =
					cause instanceof Error
						? cause.message
						: 'YouTube could not load. Try again or open the song on YouTube.';
				releaseYouTube();
				error = message;
			}
		} finally {
			if (generation === playerGeneration) busy = false;
		}
	}
	function selectSong(id: string) {
		selectedSong = id;
		const song = SONG_PRESETS.find((item) => item.videoId === id);
		if (song) inputUrl = song.url;
		error = '';
	}
	function loadStarterCollection() {
		playlistChoice = 'playlist';
		void loadYouTube({ videoIds: SONG_PRESETS.map((song) => song.videoId), index: 0 });
	}
	async function togglePlay() {
		error = '';
		if (mode === 'youtube') {
			if (playing) youtube?.pause();
			else youtube?.play();
			return;
		}
		if (!fileName) return;
		const generation = ++localPlaybackGeneration;
		const sourceUrl = objectUrl;
		if (localPlaying) {
			audioElement.pause();
			return;
		}
		try {
			const stopped = await (extension?.stopAndWait() ?? Promise.resolve(true));
			if (
				destroyed ||
				mode !== 'file' ||
				generation !== localPlaybackGeneration ||
				objectUrl !== sourceUrl
			)
				return;
			if (!stopped) {
				error = 'Turn off the tab equaliser from the browser toolbar before playing a local file.';
				return;
			}
			await localEngine?.resume();
			if (
				destroyed ||
				mode !== 'file' ||
				generation !== localPlaybackGeneration ||
				objectUrl !== sourceUrl
			)
				return;
			await audioElement.play();
		} catch {
			if (destroyed || generation !== localPlaybackGeneration || mode !== 'file') return;
			error = 'This audio could not play. Try a supported WAV, FLAC, MP3 or M4A file.';
		}
	}
	function seek(value: number) {
		if (!Number.isFinite(value)) return;
		if (mode === 'youtube') youtube?.seek(value);
		else if (Number.isFinite(audioElement.duration)) audioElement.currentTime = value;
	}
	function setVolume(value: number) {
		settings = { ...settings, volume: value };
		muted = false;
		youtube?.volume(value);
		youtube?.mute(false);
	}
	function toggleMute() {
		muted = !displayMuted;
		youtube?.mute(muted);
	}
	function changeRepeat() {
		repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
		youtube?.repeat(repeat);
	}
	function openLocal(blob: Blob, name: string, kind: string) {
		switchMode('file');
		localPlaybackGeneration++;
		audioElement.pause();
		localPlaying = false;
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		objectUrl = URL.createObjectURL(blob);
		fileName = name;
		fileKind = kind;
		localTime = 0;
		localDuration = 0;
		audioElement.src = objectUrl;
		audioElement.load();
		error = '';
	}
	function pickFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (
			!/\.(wav|flac|mp3|m4a|aac|ogg|opus|aif|aiff|webm)$/i.test(file.name) &&
			!file.type.startsWith('audio/')
		) {
			error = 'Choose an audio file such as WAV, FLAC, MP3 or M4A.';
			return;
		}
		openLocal(
			file,
			file.name.replace(/\.[^.]+$/, ''),
			`${file.name.split('.').pop()?.toUpperCase()} · stays on your device`
		);
		(event.currentTarget as HTMLInputElement).value = '';
	}
	async function playDemo() {
		openLocal(createDemoWav(), 'A little room', 'Original 12-second stereo sample');
		await togglePlay();
	}
	function applyPreset(id: string) {
		const preset = EQ_PRESETS.find((item) => item.id === id);
		if (!preset) return;
		eqPreset = id;
		settings = { ...settings, eq: [...preset.gains], bypass: false };
	}
	function setBand(index: number, value: number) {
		const eq = [...settings.eq];
		eq[index] = value;
		settings = { ...settings, eq, bypass: false };
		eqPreset = 'custom';
	}
	function resetSound() {
		settings = {
			...DEFAULT_AUDIO_SETTINGS,
			eq: [...DEFAULT_AUDIO_SETTINGS.eq],
			volume: settings.volume
		};
		eqPreset = 'neutral';
	}
	function updateTime() {
		localTime = audioElement.currentTime || 0;
		localDuration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
	}

	$effect(() => {
		if (!ready) return;
		localEngine?.setSettings({ ...settings, volume: muted ? 0 : settings.volume });
		response =
			mode === 'youtube'
				? eqResponseDb(settings.bypass ? EQ_FREQUENCIES.map(() => 0) : settings.eq, 48000)
				: localEngine?.getFrequencyResponse() || [];
	});

	$effect(() => {
		if (!ready) return;
		try {
			localStorage.setItem(
				PREFERENCES_KEY,
				JSON.stringify({
					v: 2,
					settings,
					mode,
					muted,
					advanced,
					repeat,
					shuffle
				})
			);
			preferencesSaved = true;
		} catch {
			preferencesSaved = false;
		}
	});

	$effect(() => {
		if (!ready || !extensionStatus.installed) return;
		if (mode === 'youtube') extension?.settings(settings);
		else extension?.stop();
	});

	onMount(() => {
		try {
			const stored = normalizePreferences(
				JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null')
			);
			({ settings, mode, muted, advanced, repeat, shuffle } = stored);
			eqPreset =
				EQ_PRESETS.find((preset) =>
					preset.gains.every((gain, index) => gain === settings.eq[index])
				)?.id || 'custom';
		} catch {
			/* Use neutral defaults if storage is unavailable. */
		}
		extension = connectListeningExtension((next) => {
			const newlyConnected = !extensionStatus.installed || (!extensionStatus.active && next.active);
			if (
				extensionStatus.installed !== next.installed ||
				extensionStatus.active !== next.active ||
				extensionStatus.error !== next.error
			) {
				extensionStatus = next;
			}
			if (newlyConnected && next.installed && mode === 'youtube')
				extension?.settings(settings, true);
			if (next.active && mode === 'file') extension?.stop();
		});
		localEngine = new LocalAudioEngine(audioElement);
		const disposeConsent = initializeConsent();
		const unsubscribe = subscribeConsent((record) => {
			mediaAllowed = record?.media === true;
			if (!mediaAllowed) releaseYouTube();
		});
		const visibility = () => {
			if (document.hidden) youtube?.pause();
		};
		document.addEventListener('visibilitychange', visibility);
		let frame = 0;
		let lastUpdate = 0;
		function measure(now: number) {
			if (mode === 'file' && now - lastUpdate > 100) {
				snapshot = localEngine!.getSnapshot();
				response = localEngine!.getFrequencyResponse();
				if (snapshot.peakLeft >= 1 || snapshot.peakRight >= 1) clipUntil = now + 1500;
				clipping = now < clipUntil;
				lastUpdate = now;
			}
			frame = requestAnimationFrame(measure);
		}
		frame = requestAnimationFrame(measure);
		ready = true;
		return () => {
			destroyed = true;
			extension?.destroy();
			localPlaybackGeneration++;
			releaseYouTube();
			audioElement.pause();
			audioElement.removeAttribute('src');
			audioElement.load();
			localEngine?.destroy();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			cancelAnimationFrame(frame);
			document.removeEventListener('visibilitychange', visibility);
			unsubscribe();
			disposeConsent();
		};
	});
</script>

<section
	class="listening-room not-prose"
	data-testid="listening-room"
	aria-label="Listening Room music player"
>
	<audio
		bind:this={audioElement}
		preload="metadata"
		ontimeupdate={updateTime}
		onloadedmetadata={updateTime}
		onplay={() => (localPlaying = true)}
		onpause={() => (localPlaying = false)}
		onended={() => (localPlaying = false)}
		onerror={() => {
			if (fileName && !destroyed)
				error =
					'Your browser could not read this file. Try WAV, MP3, FLAC or another supported format.';
		}}
	></audio>
	<input
		class="lr-file-input"
		type="file"
		accept="audio/*,.flac,.wav,.m4a,.opus"
		bind:this={fileInput}
		onchange={pickFile}
		aria-label="Choose a local audio file"
	/>
	<header class="lr-header">
		<div class="lr-brand">
			<div class="lr-brand-icon"><Icon name="headphones" size={27} /></div>
			<div>
				<span class="lr-eyebrow">A SPACE FOR YOUR MUSIC</span>
				<h1>Listening Room<span>.</span></h1>
			</div>
		</div>
		<div class="lr-source-tabs" role="group" aria-label="Audio source">
			<button
				class:active={mode === 'youtube'}
				aria-pressed={mode === 'youtube'}
				disabled={!ready}
				onclick={() => switchMode('youtube')}><Icon name="play" size={16} /> YouTube</button
			>
			<button
				class:active={mode === 'file'}
				aria-pressed={mode === 'file'}
				disabled={!ready}
				onclick={() => switchMode('file')}><Icon name="file" size={16} /> Audio file</button
			>
		</div>
	</header>
	<div class="lr-intro">
		<p>Play a song. Settle into the sound.</p>
		<span class="lr-status"><i class:live={playing}></i>{status}</span>
	</div>

	{#if mode === 'youtube'}
		<div class="lr-source-panel">
			<div class="lr-select-field">
				<label for="lr-song">Popular songs</label><select
					id="lr-song"
					value={selectedSong}
					onchange={(event) => selectSong(event.currentTarget.value)}
					>{#each SONG_PRESETS as song (song.videoId)}<option value={song.videoId}
							>{song.artist} — {song.title}</option
						>{/each}</select
				>
			</div>
			<form
				class="lr-url-form"
				onsubmit={(event) => {
					event.preventDefault();
					void loadYouTube();
				}}
			>
				<label for="lr-url">Or paste a YouTube song or playlist</label>
				<div class="lr-input-action">
					<input
						id="lr-url"
						type="url"
						value={inputUrl}
						oninput={(event) => {
							inputUrl = event.currentTarget.value;
							error = '';
						}}
						placeholder="Paste a YouTube link"
						autocomplete="off"
						spellcheck="false"
					/><button class="lr-button lr-primary" disabled={!ready || busy} type="submit"
						>{busy ? 'Loading…' : 'Load'}<Icon name="arrow" size={17} /></button
					>
				</div>
			</form>
			{#if parsed?.videoId && parsed?.playlistId}<fieldset class="lr-playlist-choice">
					<legend>This link includes a playlist</legend><label
						><input type="radio" bind:group={playlistChoice} value="video" /> This song</label
					><label
						><input type="radio" bind:group={playlistChoice} value="playlist" /> Whole playlist</label
					>
				</fieldset>{/if}
			<p class="lr-source-note">
				{mediaAllowed
					? 'YouTube is allowed in your media settings.'
					: 'Loading connects to YouTube for this session.'}<button onclick={openPrivacySettings}
					>Media settings <span aria-hidden="true">↗</span></button
				>
			</p>
		</div>
	{:else}
		<div class="lr-file-panel">
			<div>
				<span class="lr-eyebrow">YOUR FILE. YOUR DEVICE.</span>
				<p>Open an audio file and make the sound your own.</p>
			</div>
			<div class="lr-file-actions">
				<button class="lr-button lr-primary" onclick={() => fileInput.click()} disabled={!ready}
					><Icon name="file" size={17} /> Open audio file</button
				><button class="lr-button" onclick={playDemo} disabled={!ready}
					>Try the sample <Icon name="play" size={15} /></button
				>
			</div>
		</div>
	{/if}

	{#if error}<div class="lr-error" role="alert">
			<span>{error}</span>{#if mode === 'youtube'}<button
					onclick={() => loadYouTube(activeSource || undefined)}
					disabled={busy}>Retry</button
				>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated external YouTube URL. -->
				<a href={watchUrl} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>{/if}
		</div>{/if}
	{#if yt.autoplayBlocked && mode === 'youtube'}<p class="lr-notice" role="status">
			Press Play in the YouTube player to start listening.
		</p>{/if}
	{#if mode === 'youtube'}
		<div class="lr-extension-panel">
			<div class="lr-extension-status">
				<div>
					<strong>{extensionStatus.active ? 'Tab equaliser is on' : 'Equaliser for YouTube'}</strong
					>
					<p role="status">
						{extensionStatus.error ||
							(extensionStatus.active
								? 'The sound controls below now apply to this tab’s audio.'
								: extensionStatus.installed
									? 'Click Listening Room in your browser’s extensions toolbar to turn it on for this tab.'
									: 'Add the Listening Room extension to use these sound controls with YouTube.')}
					</p>
				</div>
				{#if extensionStatus.active}<button class="lr-button" onclick={() => extension?.stop()}
						>Turn off tab equaliser</button
					>{/if}
			</div>
			<details class="lr-extension-setup">
				<summary>Set up the Edge extension</summary>
				<ol>
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Static extension download, not a SvelteKit route. -->
						<a href="/downloads/listening-room-extension.zip" download
							>Download Listening Room for Edge</a
						> and extract the ZIP into a folder you will keep.
					</li>
					<li>
						In Edge, open Extensions → Manage extensions. Turn on Developer mode, choose Load
						unpacked, and select the extracted folder containing <code>manifest.json</code>.
					</li>
					<li>
						Refresh this page, load a song or playlist, then click Listening Room in Edge’s
						extensions toolbar. The equaliser controls will appear here.
					</li>
				</ol>
				<p>
					This is a custom extension, installed manually. It processes this tab’s audio on your
					device; it does not record or upload it. Closing or reloading the tab ends the connection.
					Your settings stay saved; click the extension again next time.
				</p>
			</details>
		</div>
	{/if}

	<div class="lr-workspace">
		<div class="lr-main">
			<div class="lr-display" class:lr-has-player={mode === 'youtube' && youtubeMounted}>
				{#if mode === 'youtube' && youtubeMounted}<div
						class="lr-youtube-host"
						bind:this={youtubeHost}
						data-testid="youtube-host"
					></div>
				{:else if mode === 'file' && fileName}
					<div class="lr-spectrum-heading">
						<span class="lr-eyebrow">FREQUENCY SPECTRUM</span><span
							>{playing ? 'Live audio' : 'Press play to measure'}</span
						>
					</div>
					<div
						class="lr-spectrum"
						role="img"
						aria-label="Live spectrum of the local audio, from low to high frequencies"
					>
						<div class="lr-spectrum-grid"><span>0 dB</span><span>−45</span><span>−90</span></div>
						<div class="lr-spectrum-bars">
							{#each snapshot.spectrum as height, bandIndex (bandIndex)}<div
									style:height={`${Math.max(0.7, height * 100)}%`}
								></div>{/each}
						</div>
					</div>
					<div class="lr-spectrum-labels">
						<span>30 Hz</span><span>18 kHz</span>
					</div>
					<p class="lr-display-caption">Where the energy is, from bass to treble.</p>
				{:else}
					<div class="lr-record-scene" aria-hidden="true">
						<div class="lr-record">
							<div class="lr-record-label"><Icon name="sound" size={35} /></div>
						</div>
						<div class="lr-tonearm"></div>
						<span class="lr-record-dot"></span>
					</div>
					<div class="lr-display-copy">
						<span class="lr-eyebrow"
							>{mode === 'youtube'
								? 'GOOD MUSIC. A LITTLE SPACE.'
								: 'LISTEN A LITTLE CLOSER.'}</span
						>
						<p>{mode === 'youtube' ? 'Your next listen is ready.' : 'Find your own balance.'}</p>
						<span
							>{mode === 'youtube'
								? 'Choose a song above, then load the player.'
								: 'Open an audio file or try our original sample.'}</span
						>
					</div>
				{/if}
			</div>
			<div class="lr-track">
				<div class="lr-track-mark">
					<Icon name={mode === 'youtube' ? 'play' : 'sound'} size={21} />
				</div>
				<div class="lr-track-name">
					<h3>{trackTitle}</h3>
					<p>{trackArtist}</p>
				</div>
				<span class="lr-source-badge">{mode === 'youtube' ? 'YOUTUBE' : 'LOCAL AUDIO'}</span>
			</div>
			<div class="lr-transport">
				<div class="lr-seek">
					<span>{time(position)}</span><input
						aria-label="Playback position"
						type="range"
						min="0"
						max={duration || 1}
						step="0.1"
						value={position}
						disabled={!canControl || !Number.isFinite(duration) || duration <= 0}
						oninput={(event) => seek(Number(event.currentTarget.value))}
					/><span>{time(duration)}</span>
				</div>
				<div class="lr-controls">
					<div class="lr-controls-extra">
						{#if mode === 'youtube'}<button
								class="lr-icon-button"
								class:selected={shuffle}
								aria-label="Shuffle playlist"
								aria-pressed={shuffle}
								disabled={!canControl || queueIds.length < 2}
								onclick={() => {
									shuffle = !shuffle;
									youtube?.shuffle(shuffle);
								}}><Icon name="shuffle" size={18} /></button
							>{:else}<span class="lr-small-label">2-CH</span>{/if}
					</div>
					<div class="lr-play-controls">
						<button
							class="lr-icon-button"
							aria-label="Previous track"
							disabled={!canNavigate}
							onclick={() => youtube?.previous()}><Icon name="previous" /></button
						><button
							class="lr-play-button"
							aria-label={playing ? 'Pause' : 'Play'}
							disabled={!canControl}
							onclick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={27} /></button
						><button
							class="lr-icon-button"
							aria-label="Next track"
							disabled={!canNavigate}
							onclick={() => youtube?.next()}><Icon name="next" /></button
						>
					</div>
					<div class="lr-controls-extra">
						{#if mode === 'youtube'}<button
								class="lr-icon-button lr-repeat"
								class:selected={repeat !== 'off'}
								aria-label={`Repeat: ${repeat}`}
								disabled={!canControl}
								onclick={changeRepeat}
								><Icon name="repeat" size={18} />{#if repeat === 'one'}<small>1</small>{/if}</button
							>{:else}<span class="lr-small-label">{settings.bypass ? 'BYPASS' : 'DSP'}</span>{/if}
					</div>
				</div>
				<div class="lr-volume">
					<button
						class="lr-icon-button"
						aria-label={displayMuted ? 'Unmute' : 'Mute'}
						aria-pressed={displayMuted}
						onclick={toggleMute}><Icon name={displayMuted ? 'mute' : 'volume'} size={18} /></button
					><input
						type="range"
						aria-label="Volume"
						min="0"
						max="100"
						step="1"
						value={displayVolume}
						oninput={(event) => setVolume(Number(event.currentTarget.value))}
					/><span>{displayMuted ? 'Muted' : `${Math.round(displayVolume)}%`}</span>
				</div>
			</div>
		</div>

		<aside
			class="lr-side"
			aria-label={mode === 'youtube' ? 'Listening queue and sound controls' : 'Sound controls'}
		>
			{#if mode === 'youtube'}
				<div class="lr-panel-heading">
					<div>
						<span class="lr-eyebrow">A FEW FAMILIAR FAVOURITES</span>
						<h3>{queueIds.length > 1 ? 'In your queue' : 'Your next listen'}</h3>
					</div>
					<span class="lr-count">{queueIds.length > 1 ? queueIds.length : SONG_PRESETS.length}</span
					>
				</div>
				<div class="lr-queue">
					{#each queueIds.length > 1 ? queueIds : SONG_PRESETS.map((song) => song.videoId) as id, index (`${index}-${id}`)}{@const song =
							SONG_PRESETS.find((item) => item.videoId === id)}<button
							class="lr-queue-item"
							class:current={currentId === id}
							onclick={() => {
								if (queueIds.length > 1 && youtube) youtube.playAt(index);
								else {
									selectSong(id);
									void loadYouTube({ videoId: id });
								}
							}}
							disabled={busy || !ready}
							><span class="lr-queue-number"
								>{currentId === id && playing ? '▶' : String(index + 1).padStart(2, '0')}</span
							><span
								><strong>{song?.title || `Track ${index + 1}`}</strong><small
									>{song?.artist || 'YouTube playlist'}</small
								></span
							><span class="lr-queue-arrow">↗</span></button
						>{/each}
				</div>
				<button
					class="lr-collection-button"
					onclick={loadStarterCollection}
					disabled={busy || !ready}><Icon name="play" size={16} /> Load starter collection</button
				>
				<div class="lr-side-note">
					<Icon name="headphones" size={21} />
					<p>
						{#if extensionStatus.active}Your equaliser applies after YouTube’s playback controls.
						{:else}YouTube handles the source quality.<br /><button
								onclick={() => switchMode('file')}
								>Try the equaliser with an audio file <span aria-hidden="true">↗</span></button
							>{/if}
					</p>
				</div>
			{/if}
			{#if soundControls}
				<div class="lr-panel-heading">
					<div>
						<span class="lr-eyebrow">SMALL ADJUSTMENTS</span>
						<h3>Make it yours</h3>
					</div>
					<Icon name="sound" size={23} />
				</div>
				<div class="lr-presets">
					<label for="lr-preset">Sound preset</label><select
						id="lr-preset"
						value={eqPreset}
						onchange={(event) => applyPreset(event.currentTarget.value)}
						>{#each EQ_PRESETS as preset (preset.id)}<option value={preset.id}
								>{preset.label}</option
							>{/each}{#if eqPreset === 'custom'}<option value="custom">Custom</option>{/if}</select
					>
					<p>Start neutral. Change only what helps.</p>
				</div>
				{#if mode === 'file'}<div class="lr-meter-panel">
						<div class="lr-meter-title">
							<span>Output level</span><span class:clipping
								>{clipping ? 'CLIPPING' : 'SAMPLE PEAK'}</span
							>
						</div>
						{#each [{ label: 'L', rms: snapshot.rmsLeft, peak: snapshot.peakLeft }, { label: 'R', rms: snapshot.rmsRight, peak: snapshot.peakRight }] as meter (meter.label)}<div
								class="lr-meter-row"
							>
								<span>{meter.label}</span>
								<div class="lr-meter-track">
									<div
										style:width={`${Math.min(100, Math.max(0, ((20 * Math.log10(Math.max(0.001, meter.rms)) + 60) / 60) * 100))}%`}
									></div>
								</div>
								<span>{db(meter.peak)}</span>
							</div>{/each}
					</div>{/if}
				<div class="lr-adjust">
					<label for="lr-balance"
						>Balance <span
							>{settings.balance === 0
								? 'Centre'
								: `${Math.round(Math.abs(settings.balance) * 100)}% ${settings.balance < 0 ? 'left' : 'right'}`}</span
						></label
					><input
						id="lr-balance"
						type="range"
						min="-1"
						max="1"
						step="0.05"
						value={settings.balance}
						oninput={(event) =>
							(settings = { ...settings, balance: Number(event.currentTarget.value) })}
					/>
					<div class="lr-range-labels"><span>Left</span><span>Right</span></div>
				</div>
				<div class="lr-switch-row">
					<label
						><input
							type="checkbox"
							checked={settings.mono}
							onchange={(event) => (settings = { ...settings, mono: event.currentTarget.checked })}
						/> Mono listening</label
					><label
						><input
							type="checkbox"
							checked={settings.bypass}
							onchange={(event) =>
								(settings = { ...settings, bypass: event.currentTarget.checked })}
						/> Bypass effects</label
					>
				</div>
				{#if mode === 'file'}<div class="lr-quality">
						<span class="lr-quality-dot"></span>
						<div>
							<strong
								>{snapshot.sampleRate
									? `${snapshot.sampleRate / 1000} kHz processing`
									: 'Ready for local audio'}</strong
							><small
								>{snapshot.sampleRate
									? 'Browser audio engine · source resolution may differ'
									: 'Your file stays on this device'}</small
							>
						</div>
					</div>
					<div class="lr-headroom">
						<span>Automatic headroom</span><strong>{snapshot.headroomDb.toFixed(1)} dB</strong>
					</div>{:else}<p class="lr-eq-footnote">
						Tab audio passes through the extension. Volume and mute stay controlled by the player.
					</p>{/if}
			{/if}
		</aside>
	</div>

	{#if soundControls}
		<div class="lr-eq-panel">
			<button
				class="lr-eq-toggle"
				aria-expanded={advanced}
				aria-controls="lr-equaliser"
				onclick={() => (advanced = !advanced)}
				><span
					><Icon name="sound" size={19} /><strong>Equaliser &amp; fine adjustments</strong></span
				><span>{advanced ? 'Close' : 'Open'} <Icon name="chevron" size={16} /></span></button
			>
			{#if advanced}<div id="lr-equaliser" class="lr-eq-content">
					<div class="lr-eq-top">
						<p>Ten bands. A little goes a long way.</p>
						<button class="lr-text-button" onclick={resetSound}
							><Icon name="reset" size={15} /> Reset sound</button
						>
					</div>
					<div class="lr-eq-bands">
						{#each EQ_FREQUENCIES as frequency, index (frequency)}<div class="lr-eq-band">
								<output for={`lr-band-${index}`}
									>{settings.eq[index] > 0 ? '+' : ''}{settings.eq[index].toFixed(0)}<small>
										dB</small
									></output
								><input
									id={`lr-band-${index}`}
									aria-label={`Equaliser ${frequency} Hz`}
									type="range"
									min="-6"
									max="6"
									step="1"
									value={settings.eq[index]}
									oninput={(event) => setBand(index, Number(event.currentTarget.value))}
								/><label for={`lr-band-${index}`}
									>{frequency >= 1000 ? `${frequency / 1000}k` : frequency}<small>Hz</small></label
								>
							</div>{/each}
					</div>
					<div class="lr-response">
						<svg
							viewBox="0 0 600 100"
							role="img"
							aria-label="Equaliser frequency response from low to high frequencies"
							><path d="M0 50H600" stroke="currentColor" stroke-dasharray="3 6" /><path
								d={responsePath}
								fill="none"
								class="lr-response-curve"
								stroke-width="2"
							/></svg
						><span
							>EQ response · {settings.bypass ? 'bypassed' : 'bass → treble'}{mode === 'youtube'
								? ' · 48 kHz reference'
								: ''}</span
						>
					</div>
					<div class="lr-fine-controls">
						<div class="lr-adjust">
							<label for="lr-trim"
								>Gain trim <span>{settings.trimDb > 0 ? '+' : ''}{settings.trimDb} dB</span></label
							><input
								id="lr-trim"
								type="range"
								min="-18"
								max="6"
								step="1"
								value={settings.trimDb}
								oninput={(event) =>
									(settings = { ...settings, trimDb: Number(event.currentTarget.value) })}
							/>
						</div>
						<div class="lr-adjust">
							<label for="lr-width"
								>Stereo width <span>{Math.round(settings.width * 100)}%</span></label
							><input
								id="lr-width"
								type="range"
								min="0"
								max="1.25"
								step="0.05"
								value={settings.width}
								disabled={settings.mono}
								oninput={(event) =>
									(settings = { ...settings, width: Number(event.currentTarget.value) })}
							/>
							<div class="lr-range-labels"><span>Mono</span><span>Original at 100%</span></div>
						</div>
					</div>
					<p class="lr-eq-footnote">
						Boosts reserve headroom. No compressor or automatic loudness matching is applied. Bypass
						keeps your listening volume.
					</p>
				</div>{/if}
		</div>
	{/if}
	<p class="lr-preferences" class:lr-preferences-warning={!preferencesSaved} role="status">
		{preferencesSaved
			? 'Settings are saved in this browser.'
			: 'Settings could not be saved. Keep this tab open to retain your changes.'}
	</p>
	<footer class="lr-footer">
		<span><Icon name="headphones" size={16} /> A little room to listen.</span
		>{#if mode === 'youtube'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated external YouTube URL. -->
			<a href={watchUrl} target="_blank" rel="noopener noreferrer"
				>Open on YouTube <Icon name="arrow" size={14} /></a
			>{:else}<button onclick={() => fileInput.click()}
				>Choose another file <Icon name="arrow" size={14} /></button
			>{/if}
	</footer>
	<details class="lr-about">
		<summary>About the sound</summary>
		<div>
			<p>
				YouTube playback uses the official video player. Its audio quality is managed by YouTube;
				this app cannot turn it into a lossless or high-resolution source. The video stays visible,
				and the optional Listening Room extension applies EQ to the tab’s output. Without the
				extension, equaliser controls apply to local audio files.
			</p>
			<p>
				Audio files play on your device through a neutral audio path. EQ changes the frequency
				balance; stereo width changes the relationship between left and right. Neither restores
				information removed during compression. The meters show actual local audio, and the
				processing rate describes the browser engine rather than your original file or headphones.
			</p>
			<p>
				Opus is an efficient lossy codec. Its transform and perceptual coding happen during
				encoding, so they are not extra “enhancement” switches here. YouTube’s own loudness and
				Stable volume settings are separate from this app.
			</p>
			<p>
				<a
					href="https://developers.google.com/youtube/iframe_api_reference"
					target="_blank"
					rel="noopener noreferrer">YouTube player documentation ↗</a
				>
				·
				<a href="https://opus-codec.org/" target="_blank" rel="noopener noreferrer">About Opus ↗</a>
			</p>
		</div>
	</details>
</section>
