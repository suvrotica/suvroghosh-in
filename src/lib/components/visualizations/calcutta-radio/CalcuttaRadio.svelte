<script lang="ts">
	import { onMount } from 'svelte';
	import { createRadioPlayer, type RadioState } from '$lib/visualizations/calcutta-radio/player';
	import {
		stations,
		externalStations,
		type RadioStation
	} from '$lib/visualizations/calcutta-radio/stations';

	const preferenceKey = 'calcutta-radio:v1';
	const timerOptions = [0, 15, 30, 60];
	const ticks = Array.from({ length: 41 }, (_, i) => i);
	const volumeLabels = [0, 25, 50, 75, 100];
	const sleepLabels = [0, 15, 30, 45, 60];
	let player: ReturnType<typeof createRadioPlayer> | undefined;
	let ready = $state(false);
	let selectedId = $state(stations[0]?.id ?? '');
	let favourites = $state<string[]>([]);
	let onlyFavourites = $state(false);
	let query = $state('');
	let storageAvailable = $state(true);
	let deviceVolume = $state(false);
	let clock = $state('--:--');
	let date = $state('CALCUTTA · IST');
	let now = $state(0);
	let selectedTimer = $state(0);
	let radioState = $state<RadioState>({
		status: 'ready',
		stationId: null,
		error: '',
		volume: 0.6,
		muted: false,
		sleepEndsAt: null
	});

	const selectedStation = $derived(
		stations.find((station) => station.id === selectedId) ?? stations[0]
	);
	const isPlaying = $derived(radioState.status === 'playing');
	const isConnecting = $derived(radioState.status === 'connecting');
	const isActive = $derived(isPlaying || isConnecting);
	const volume = $derived(Math.round(radioState.volume * 100));
	const sleepRemaining = $derived(
		radioState.sleepEndsAt === null
			? 0
			: Math.max(0, Math.ceil((radioState.sleepEndsAt - now) / 1000))
	);
	const sleepText = $derived(
		radioState.sleepEndsAt === null
			? 'OFF'
			: `${Math.floor(sleepRemaining / 60)
					.toString()
					.padStart(2, '0')}:${(sleepRemaining % 60).toString().padStart(2, '0')}`
	);
	const filteredStations = $derived(
		stations.filter((station) => {
			const matchesText = `${station.name} ${station.location} ${station.languages.join(' ')}`
				.toLowerCase()
				.includes(query.trim().toLowerCase());
			return matchesText && (!onlyFavourites || favourites.includes(station.id));
		})
	);
	const statusText = $derived(
		{
			ready: 'Ready to listen',
			connecting: 'Connecting…',
			playing: 'Playing live',
			stopped: 'Stopped',
			unavailable: 'Station unavailable'
		}[radioState.status]
	);

	function labelPosition(index: number) {
		const angle = ((-135 + index * 67.5) * Math.PI) / 180;
		return { x: 100 + Math.sin(angle) * 61, y: 100 - Math.cos(angle) * 61 };
	}

	function savePreferences() {
		if (!ready) return;
		try {
			localStorage.setItem(
				preferenceKey,
				JSON.stringify({
					selectedId,
					favourites,
					volume: radioState.volume,
					muted: radioState.muted
				})
			);
			storageAvailable = true;
		} catch {
			storageAvailable = false;
		}
	}

	function chooseStation(station: RadioStation) {
		selectedId = station.id;
		savePreferences();
		if (radioState.stationId !== station.id || !isActive) void player?.play(station);
	}

	function togglePlayback() {
		if (isActive) player?.stop();
		else if (selectedStation) void player?.play(selectedStation);
	}

	function changeStation(direction: number) {
		const index = stations.findIndex((station) => station.id === selectedId);
		const next = stations[(index + direction + stations.length) % stations.length];
		if (next) chooseStation(next);
	}

	function toggleFavourite(id: string) {
		favourites = favourites.includes(id)
			? favourites.filter((favourite) => favourite !== id)
			: [...favourites, id];
		savePreferences();
	}

	function changeVolume(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		player?.setVolume(Number(target.value) / 100);
		savePreferences();
	}

	function toggleMute() {
		player?.setMuted(!radioState.muted);
		savePreferences();
	}

	function setTimer(minutes: number) {
		selectedTimer = minutes;
		player?.setSleep(minutes);
	}

	onMount(() => {
		let restoredVolume = 0.6;
		let restoredMute = false;
		try {
			const raw = localStorage.getItem(preferenceKey);
			const stored = raw ? JSON.parse(raw) : null;
			if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
				if (stations.some((station) => station.id === stored.selectedId))
					selectedId = stored.selectedId;
				if (Array.isArray(stored.favourites)) {
					favourites = stations
						.filter((station) => stored.favourites.includes(station.id))
						.map((station) => station.id);
				}
				if (typeof stored.volume === 'number' && Number.isFinite(stored.volume)) {
					restoredVolume = Math.min(1, Math.max(0, stored.volume));
				}
				if (typeof stored.muted === 'boolean') restoredMute = stored.muted;
			}
		} catch {
			storageAvailable = false;
		}
		deviceVolume =
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		player = createRadioPlayer((next) => {
			radioState = next;
			if (next.stationId && stations.some((station) => station.id === next.stationId))
				selectedId = next.stationId;
			if (next.sleepEndsAt === null) selectedTimer = 0;
		});
		player.setVolume(restoredVolume);
		player.setMuted(restoredMute);
		const timeFormat = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Asia/Kolkata',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
		const dateFormat = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Asia/Kolkata',
			weekday: 'short',
			day: '2-digit',
			month: 'short'
		});
		const updateClock = () => {
			now = Date.now();
			clock = timeFormat.format(now);
			date = dateFormat.format(now).replace(',', '').toUpperCase();
		};
		updateClock();
		ready = true;
		const interval = window.setInterval(updateClock, 1000);
		return () => {
			ready = false;
			window.clearInterval(interval);
			player?.destroy();
			player = undefined;
		};
	});
</script>

<section
	class="radio-app not-prose article-breakout"
	data-testid="calcutta-radio"
	data-tts-exclude
	aria-label="Calcutta Radio"
>
	<div class="app-heading">
		<div>
			<p class="eyebrow">A LITTLE RADIO FOR YOUR BROWSER</p>
			<h1>Calcutta Radio<span aria-hidden="true">.</span></h1>
			<p class="intro">Choose a station. Press Play. Make yourself at home.</p>
		</div>
		<span class="edition">LIVE RADIO<br /><b>CALCUTTA + WORLD</b></span>
	</div>

	<div class="radio-layout">
		<div class="receiver" data-testid="radio-receiver">
			<div class="receiver-top">
				<span class="brand">CALCUTTA <b>RADIO</b></span>
				<span class="model">INTERNET RECEIVER</span>
			</div>

			<div class="instrument-row">
				<fieldset class="instrument">
					<legend class="sr-only">Volume</legend>
					<span class="screw top-left" aria-hidden="true"></span>
					<span class="screw top-right" aria-hidden="true"></span>
					<svg viewBox="0 0 200 200" class="dial" aria-hidden="true">
						<circle cx="100" cy="100" r="95" class="dial-rim" />
						<circle cx="100" cy="100" r="87" class="dial-face" />
						{#each ticks as i}
							<line
								x1="100"
								y1="21"
								x2="100"
								y2={i % 10 === 0 ? 31 : 26}
								transform={`rotate(${-135 + i * 6.75} 100 100)`}
								class:lit={i <= (deviceVolume ? 0 : radioState.muted ? 0 : radioState.volume * 40)}
								class="dial-tick"
							/>
						{/each}
						{#each volumeLabels as label, i}
							<text x={labelPosition(i).x} y={labelPosition(i).y} class="scale-number">{label}</text
							>
						{/each}
						<text x="100" y="72" class="dial-caption">VOLUME</text>
						<g
							transform={`rotate(${-135 + (deviceVolume || radioState.muted ? 0 : radioState.volume) * 270} 100 100)`}
						>
							<path d="M 97 116 L 98 45 L 102 45 L 103 116 Z" class="needle" />
						</g>
						<circle cx="100" cy="100" r="10" class="needle-hub" />
						<circle cx="100" cy="100" r="3" fill="#555856" />
						<text x="100" y="149" class="dial-value"
							>{deviceVolume ? 'DEVICE' : radioState.muted ? 'MUTE' : volume}</text
						>
					</svg>
					<div class="instrument-control">
						{#if deviceVolume}
							<p class="device-volume">Use device volume</p>
						{:else}
							<label for="radio-volume" class="sr-only">Volume</label>
							<input
								id="radio-volume"
								type="range"
								min="0"
								max="100"
								step="1"
								value={volume}
								aria-valuetext={`${volume} per cent`}
								oninput={changeVolume}
								disabled={!ready}
							/>
						{/if}
					</div>
				</fieldset>

				<fieldset class="instrument">
					<legend class="sr-only">Sleep timer</legend>
					<span class="screw top-left" aria-hidden="true"></span>
					<span class="screw top-right" aria-hidden="true"></span>
					<svg viewBox="0 0 200 200" class="dial timer-dial" aria-hidden="true">
						<circle cx="100" cy="100" r="95" class="dial-rim" />
						<circle cx="100" cy="100" r="87" class="dial-face" />
						{#each ticks as i}
							<line
								x1="100"
								y1="21"
								x2="100"
								y2={i % 10 === 0 ? 31 : 26}
								transform={`rotate(${-135 + i * 6.75} 100 100)`}
								class:lit={radioState.sleepEndsAt !== null && i <= (sleepRemaining / 3600) * 40}
								class="dial-tick"
							/>
						{/each}
						{#each sleepLabels as label, i}
							<text x={labelPosition(i).x} y={labelPosition(i).y} class="scale-number">{label}</text
							>
						{/each}
						<text x="100" y="72" class="dial-caption">SLEEP</text>
						<g transform={`rotate(${-135 + Math.min(1, sleepRemaining / 3600) * 270} 100 100)`}>
							<path d="M 97 116 L 98 45 L 102 45 L 103 116 Z" class="needle" />
						</g>
						<circle cx="100" cy="100" r="10" class="needle-hub" />
						<circle cx="100" cy="100" r="3" fill="#555856" />
						<text x="100" y="146" class="dial-value timer-value">{sleepText}</text>
						<text x="100" y="163" class="dial-unit">MIN : SEC</text>
					</svg>
					<div class="timer-controls instrument-control" aria-label="Sleep timer duration">
						{#each timerOptions as minutes}
							<button
								type="button"
								class:chosen={selectedTimer === minutes}
								disabled={!ready}
								aria-pressed={selectedTimer === minutes}
								aria-label={minutes ? `Stop after ${minutes} minutes` : 'Turn sleep timer off'}
								onclick={() => setTimer(minutes)}>{minutes || 'Off'}</button
							>
						{/each}
					</div>
				</fieldset>
			</div>

			<div class="display-panel">
				<div class="display-header">
					<span class="connection" class:playing={isPlaying} class:connecting={isConnecting}>
						<i aria-hidden="true"></i><span aria-live="polite" role="status">{statusText}</span>
					</span>
					<span class="clock" aria-label={`Time in Calcutta: ${clock}`}
						>{clock}<small>IST</small></span
					>
				</div>
				<div class="station-display">
					<span class="display-label"
						>{isPlaying ? 'YOU ARE LISTENING TO' : 'SELECTED STATION'}</span
					>
					<h2>{selectedStation?.shortName ?? 'Choose a station'}</h2>
					<p>
						{selectedStation?.location ?? 'Calcutta'}<span aria-hidden="true">
							/
						</span>{selectedStation?.languages.join(' · ')}
					</p>
				</div>
				<div class="display-bottom"><span>LIVE INTERNET RADIO</span><span>{date}</span></div>
			</div>

			<div class="transport-panel">
				<div class="transport-side">
					<button
						type="button"
						class="hardware small-control"
						onclick={() => changeStation(-1)}
						disabled={!ready || !stations.length}
						aria-label="Play previous station"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
							><path d="M5 4h1v16H5zm14 1v14L9 12z" /></svg
						><span>Previous</span>
					</button>
					<button
						type="button"
						class="hardware small-control"
						onclick={toggleMute}
						disabled={!ready}
						aria-pressed={radioState.muted}
						aria-label={radioState.muted ? 'Unmute radio' : 'Mute radio'}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							aria-hidden="true"
							><path d="M11 4 5 9H2v6h2l6 5Z" />{#if radioState.muted}<path
									d="m16 9 6 6m0-6-6 6"
								/>{:else}<path d="M15 8c3 2 3 6 0 8m3-11c6 4 6 10 0 14" />{/if}</svg
						><span>{radioState.muted ? 'Unmute' : 'Mute'}</span>
					</button>
				</div>
				<div class="power-wrap">
					<button
						type="button"
						class="power-button"
						class:active={isActive}
						onclick={togglePlayback}
						disabled={!ready || !selectedStation}
						aria-label={isActive ? 'Stop radio' : 'Play radio'}
						data-testid="radio-play"
					>
						{#if isActive}<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"
								><rect x="7" y="7" width="18" height="18" rx="2" fill="currentColor" /></svg
							>{:else}<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"
								><path d="M10 5v22l18-11Z" fill="currentColor" /></svg
							>{/if}
					</button>
					<span class="power-label">{isActive ? 'STOP' : 'PLAY'}</span>
				</div>
				<div class="transport-side">
					<button
						type="button"
						class="hardware small-control"
						onclick={() => changeStation(1)}
						disabled={!ready || !stations.length}
						aria-label="Play next station"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
							><path d="M17 4h1v16h-2zM5 5v14l10-7z" /></svg
						><span>Next</span>
					</button>
					<button
						type="button"
						class="hardware small-control"
						disabled={!ready || !selectedStation}
						aria-pressed={favourites.includes(selectedId)}
						onclick={() => toggleFavourite(selectedId)}
						aria-label={favourites.includes(selectedId)
							? 'Remove selected station from favourites'
							: 'Save selected station to favourites'}
					>
						<span class="favourite-symbol" aria-hidden="true"
							>{favourites.includes(selectedId) ? '★' : '☆'}</span
						><span>{favourites.includes(selectedId) ? 'Saved' : 'Save'}</span>
					</button>
				</div>
			</div>

			{#if radioState.error}
				<div class="playback-error" role="alert">
					<p>{radioState.error}</p>
					<div>
						<button type="button" onclick={() => selectedStation && player?.play(selectedStation)}
							>Retry station</button
						>{#if selectedStation}<a
								href={selectedStation.website}
								target="_blank"
								rel="noopener noreferrer">Official listening site ↗</a
							>{/if}
					</div>
				</div>
			{/if}
			<div class="receiver-foot">
				<span class="speaker-grille" aria-hidden="true"></span><span
					>GOOD COMPANY. ONE STATION AT A TIME.</span
				><span class="speaker-grille" aria-hidden="true"></span>
			</div>
		</div>

		<div class="station-cabinet">
			<div class="station-heading">
				<div>
					<p class="eyebrow">ON THE DIAL</p>
					<h2>Find your station</h2>
				</div>
				<span class="station-count"
					>{stations.length.toString().padStart(2, '0')}<small>STATIONS</small></span
				>
			</div>
			<label class="search-control"
				><svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
				><span class="sr-only">Search stations</span><input
					type="search"
					bind:value={query}
					placeholder="Search name or language"
				/></label
			>
			<div class="station-filters" aria-label="Filter stations">
				<button
					type="button"
					class:chosen={!onlyFavourites}
					aria-pressed={!onlyFavourites}
					onclick={() => (onlyFavourites = false)}>All stations</button
				>
				<button
					type="button"
					class:chosen={onlyFavourites}
					aria-pressed={onlyFavourites}
					onclick={() => (onlyFavourites = true)}
					>Favourites <span>{favourites.length}</span></button
				>
			</div>
			<ul class="station-list" aria-label="Radio stations">
				{#each filteredStations as station (station.id)}
					<li
						class:selected={selectedId === station.id}
						class:on-air={radioState.stationId === station.id && isPlaying}
					>
						<button
							type="button"
							class="station-choice"
							onclick={() => chooseStation(station)}
							disabled={!ready}
							aria-label={`Play ${station.name}`}
							aria-pressed={selectedId === station.id}
							data-station={station.id}
						>
							<span class="preset-number"
								>{(stations.indexOf(station) + 1).toString().padStart(2, '0')}</span
							>
							<span class="station-copy"
								><b>{station.shortName}</b><span
									>{station.languages.join(' · ')}<span aria-hidden="true">
										/
									</span>{station.location}</span
								></span
							>
							<span class="station-indicator" aria-hidden="true"
								>{radioState.stationId === station.id && isPlaying ? '●' : '▸'}</span
							>
						</button>
						<button
							type="button"
							class="star-button"
							class:saved={favourites.includes(station.id)}
							aria-label={`${favourites.includes(station.id) ? 'Remove' : 'Save'} ${station.name} ${favourites.includes(station.id) ? 'from' : 'to'} favourites`}
							aria-pressed={favourites.includes(station.id)}
							onclick={() => toggleFavourite(station.id)}
							disabled={!ready}>{favourites.includes(station.id) ? '★' : '☆'}</button
						>
					</li>
				{:else}
					<li class="empty-stations">
						{onlyFavourites && !favourites.length
							? 'Save a station with its star, then find it here.'
							: 'No stations match. Try another name or language.'}
					</li>
				{/each}
			</ul>
			{#if filteredStations.length > 7}
				<p class="scroll-note">Scroll for more stations <span aria-hidden="true">↓</span></p>
			{/if}
			{#if externalStations.length}
				<details class="official-links">
					<summary>More stations on their official sites</summary>
					<p>These open separately; they do not play inside this radio.</p>
					<ul>
						{#each externalStations as station}<li>
								<a href={station.website} target="_blank" rel="noopener noreferrer"
									>{station.name}<span aria-hidden="true"> ↗</span></a
								><span>{station.description}</span>
							</li>{/each}
					</ul>
				</details>
			{/if}
			<p class="listening-note">
				Pressing Play connects to the broadcaster’s streaming service. Internet required. Station
				availability can change.
			</p>
			{#if !storageAvailable}<p class="storage-note" role="status">
					Your browser cannot save these settings. They will last while this page is open.
				</p>{/if}
		</div>
	</div>
	<noscript
		><p class="no-script">
			Enable JavaScript to use the radio, or listen through <a
				href="https://akashvani.gov.in/radio/live.php">Akashvani’s official live radio page</a
			>.
		</p></noscript
	>
</section>

<style>
	.radio-app {
		--radio-text: #e8e8df;
		--radio-muted: #a9aca6;
		--radio-orange: #f4834d;
		--radio-green: #a3d878;
		box-sizing: border-box;
		position: relative;
		width: min(1120px, calc(100vw - 2rem));
		max-width: none;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		transform: translateX(-50%);
		margin: 0 0 2rem;
		padding: clamp(20px, 4vw, 48px);
		border: 1px solid #414442;
		border-radius: 18px;
		background: radial-gradient(ellipse at 20% 30%, #383d3c 0, transparent 65%), #242827;
		color: var(--radio-text);
		font-family: 'Archivo Variable', 'Arial', sans-serif;
		font-size: 14px;
		line-height: 1.5;
		text-align: left;
		color-scheme: dark;
		isolation: isolate;
	}
	.radio-app *,
	.radio-app *::before,
	.radio-app *::after {
		box-sizing: border-box;
	}
	.radio-app h1,
	.radio-app h2,
	.radio-app p,
	.radio-app ul,
	.radio-app fieldset {
		margin: 0;
	}
	.radio-app h1,
	.radio-app h2 {
		font-family: inherit;
		letter-spacing: normal;
		line-height: 1.2;
	}
	.radio-app button,
	.radio-app input {
		font: inherit;
	}
	.radio-app button {
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.radio-app button:disabled {
		cursor: default;
		opacity: 0.55;
	}
	.radio-app button:focus-visible,
	.radio-app a:focus-visible,
	.radio-app input:focus-visible,
	.radio-app summary:focus-visible {
		outline: 3px solid #ffba83;
		outline-offset: 4px;
	}
	.radio-app a {
		color: #ffac78;
		text-underline-offset: 3px;
	}
	.app-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 28px;
	}
	.eyebrow {
		color: #bbc1b8;
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.17em;
	}
	.app-heading h1 {
		margin: 7px 0 9px;
		color: #f4f1e8;
		font-size: clamp(30px, 4vw, 43px);
		font-weight: 650;
		letter-spacing: -0.055em;
	}
	.app-heading h1 span {
		color: var(--radio-orange);
	}
	.intro {
		color: #c2c6bd;
		font-size: 14px;
	}
	.edition {
		flex-shrink: 0;
		text-align: right;
		font-size: 9px;
		letter-spacing: 0.12em;
		line-height: 1.9;
		color: #9da59c;
	}
	.edition b {
		font-weight: 500;
		color: #d9dbd1;
	}
	.radio-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.04fr) minmax(0, 1fr);
		align-items: start;
		gap: clamp(22px, 3vw, 38px);
	}
	.receiver {
		min-width: 0;
		padding: 17px 16px 13px;
		border: 1px solid #080b09;
		border-radius: 24px;
		background: linear-gradient(110deg, #181c1a, #080b0a 60%, #171a18);
		box-shadow:
			0 20px 34px #0005,
			0 2px 0 #565b50 inset,
			2px 0 0 #343a32 inset,
			-2px 0 0 #000 inset;
	}
	.receiver-top {
		display: flex;
		gap: 8px;
		justify-content: space-between;
		align-items: center;
		padding: 2px 6px 14px;
	}
	.brand {
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.15em;
		color: #aeb5aa;
	}
	.brand b {
		color: #e6e8db;
		font-weight: 700;
	}
	.model {
		font-size: 7px;
		letter-spacing: 0.1em;
		color: #a2aa9e;
	}
	.instrument-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.instrument {
		min-width: 0;
		padding: 5px 5px 7px;
		position: relative;
		border: 1px solid #040605;
		border-radius: 7px;
		background: linear-gradient(145deg, #262c28, #131714 70%);
		box-shadow:
			0 1px 1px #6b73624d inset,
			0 0 0 3px #060907,
			0 2px 1px 3px #424a3c;
	}
	.screw {
		position: absolute;
		top: 7px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: linear-gradient(120deg, #343d34, #101510);
		box-shadow:
			0 1px 1px #000 inset,
			0 1px 1px #5b6353;
	}
	.screw::after {
		content: '';
		position: absolute;
		left: 3px;
		top: 2px;
		width: 4px;
		height: 6px;
		background: #060907;
		clip-path: polygon(
			34% 0,
			66% 0,
			66% 34%,
			100% 34%,
			100% 66%,
			66% 66%,
			66% 100%,
			34% 100%,
			34% 66%,
			0 66%,
			0 34%,
			34% 34%
		);
	}
	.top-left {
		left: 7px;
	}
	.top-right {
		right: 7px;
	}
	.dial {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}
	.dial-rim {
		fill: #121714;
		stroke: #080b09;
		stroke-width: 4;
	}
	.dial-face {
		fill: #0c100d;
		stroke: #343c31;
		stroke-width: 2;
	}
	.dial-tick {
		stroke: #5e685b;
		stroke-width: 2;
	}
	.dial-tick.lit {
		stroke: #c0cdb1;
	}
	.timer-dial .dial-tick.lit {
		stroke: #dc9862;
	}
	.scale-number {
		fill: #c1c8b8;
		font-size: 10px;
		text-anchor: middle;
		dominant-baseline: middle;
		font-variant-numeric: tabular-nums;
	}
	.dial-caption {
		fill: #9da893;
		font-size: 9px;
		letter-spacing: 1.5px;
		text-anchor: middle;
	}
	.needle {
		fill: #e0d9bb;
		stroke: #070b07;
		stroke-width: 1;
		filter: drop-shadow(1px 2px 2px #000);
	}
	.timer-dial .needle {
		fill: #ef9255;
	}
	.needle-hub {
		fill: #20271f;
		stroke: #050a06;
		stroke-width: 3;
	}
	.dial-value {
		fill: #e1e7ce;
		font:
			600 21px 'Courier New',
			monospace;
		text-anchor: middle;
	}
	.timer-value {
		fill: #efa16c;
		font-size: 18px;
	}
	.dial-unit {
		fill: #99a58c;
		font-size: 7px;
		letter-spacing: 1.1px;
		text-anchor: middle;
	}
	.instrument-control {
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.instrument-control input {
		width: calc(100% - 17px);
		height: 32px;
		padding: 0;
		margin: 0;
		accent-color: #bfcbac;
		cursor: pointer;
	}
	.device-volume {
		color: #c7cdbd;
		font-size: 11px;
		text-align: center;
	}
	.timer-controls {
		gap: 3px;
	}
	.timer-controls button {
		display: grid;
		place-items: center;
		min-width: 0;
		flex: 1;
		height: 34px;
		padding: 0 2px;
		border: 1px solid #050806;
		border-radius: 3px;
		background: linear-gradient(#30352d, #171c17);
		color: #b7bfad;
		font-size: 11px;
		box-shadow:
			0 1px 0 #58604d inset,
			0 1px 1px #000;
	}
	.timer-controls button.chosen {
		color: #ffa76e;
		background: #10150f;
		box-shadow: 0 1px 4px #000 inset;
		border-color: #5b4832;
	}
	.display-panel {
		margin-top: 15px;
		padding: 12px 14px 9px;
		border: 6px solid #101510;
		border-radius: 7px;
		outline: 1px solid #323b2c;
		background: linear-gradient(125deg, #171d17, #0d110e);
		box-shadow:
			0 2px 1px #000 inset,
			0 3px 7px #000 inset,
			0 2px 3px #000;
	}
	.display-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-bottom: 12px;
		border-bottom: 1px solid #30392c;
	}
	.connection {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #adb6a1;
		font-size: 10px;
	}
	.connection i {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #5c6552;
	}
	.connection.playing {
		color: #b6d592;
	}
	.connection.playing i {
		background: #9bdb5e;
		box-shadow: 0 0 7px #9bdb5e66;
	}
	.connection.connecting i {
		background: #eaa75d;
	}
	.clock {
		white-space: nowrap;
		color: #f3925b;
		font:
			22px 'Courier New',
			monospace;
		letter-spacing: -0.08em;
		font-variant-numeric: tabular-nums;
	}
	.clock small {
		color: #b5baaa;
		font:
			8px 'Arial',
			sans-serif;
		letter-spacing: 0.06em;
		margin-left: 5px;
	}
	.station-display {
		padding: 17px 0 15px;
		min-height: 121px;
	}
	.display-label {
		font-size: 8px;
		letter-spacing: 0.13em;
		color: #b1b6a6;
	}
	.station-display h2 {
		color: #ff995c;
		font-size: clamp(20px, 2.4vw, 27px);
		font-weight: 550;
		letter-spacing: -0.025em;
		margin: 6px 0 7px;
		text-shadow: 0 0 14px #f6844d18;
	}
	.station-display p {
		color: #c3c7b7;
		font-size: 10px;
	}
	.station-display p > span {
		padding: 0 6px;
		color: #6d7866;
	}
	.display-bottom {
		display: flex;
		justify-content: space-between;
		gap: 5px;
		padding-top: 7px;
		border-top: 1px solid #30392c;
		color: #9ba88b;
		font-size: 7px;
		letter-spacing: 0.06em;
	}
	.transport-panel {
		margin-top: 12px;
		padding: 16px 10px 13px;
		display: grid;
		grid-template-columns: 1fr 1.1fr 1fr;
		align-items: center;
		gap: 12px;
		border: 1px solid #050805;
		border-radius: 7px;
		background: linear-gradient(110deg, #252b23, #171c16);
		box-shadow:
			0 1px 1px #555d494d inset,
			0 2px 1px #414a35;
	}
	.transport-side {
		display: grid;
		gap: 9px;
	}
	.hardware {
		border: 1px solid #080c08;
		border-radius: 4px;
		background: linear-gradient(#363c31 0, #252b21 20%, #171d16 90%);
		color: #cbd0bf;
		box-shadow:
			0 1px 0 #5d67514d inset,
			0 3px 3px #0007;
	}
	.hardware:hover {
		background: linear-gradient(#424a38, #222b1e);
		color: #f1e9ce;
	}
	.hardware:active {
		transform: translateY(1px);
		box-shadow: 0 1px 3px #000 inset;
	}
	.small-control {
		display: flex;
		flex-direction: column;
		gap: 3px;
		justify-content: center;
		align-items: center;
		min-height: 45px;
		padding: 6px 3px;
		font-size: 10px;
	}
	.small-control svg {
		color: #d29362;
	}
	.favourite-symbol {
		font-size: 20px;
		color: #dcb175;
		line-height: 18px;
	}
	.power-wrap {
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 8px;
	}
	.power-button {
		display: grid;
		place-items: center;
		width: 90px;
		height: 90px;
		padding: 0;
		border: 5px solid #10150f;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 32%, #313b2a, #141d10 75%);
		color: #dce7cd;
		outline: 3px solid #ac542c;
		box-shadow:
			0 0 0 6px #080d08,
			0 0 0 7px #434934,
			0 3px 5px #6f795f33 inset,
			0 5px 10px #000;
		transition:
			background 150ms,
			color 150ms;
	}
	.power-button:hover {
		color: #b9ed8e;
		background: radial-gradient(circle at 40% 32%, #3e4c32, #1a2413 75%);
	}
	.power-button.active {
		color: #9ddb63;
		outline-color: #df7139;
	}
	.power-button:focus-visible {
		outline: 3px solid #ffcc9c;
		outline-offset: 6px;
	}
	.power-label {
		color: #c4cdba;
		font-size: 9px;
		letter-spacing: 0.12em;
		margin-top: 2px;
	}
	.receiver-foot {
		display: flex;
		gap: 9px;
		justify-content: center;
		align-items: center;
		padding-top: 16px;
		color: #a8b19b;
		font-size: 6px;
		letter-spacing: 0.1em;
	}
	.speaker-grille {
		flex: 1;
		height: 15px;
		background: repeating-linear-gradient(
			to bottom,
			#030703 0,
			#030703 2px,
			#2c3427 2px,
			#2c3427 3px,
			transparent 3px,
			transparent 5px
		);
		border-radius: 2px;
		opacity: 0.7;
	}
	.station-cabinet {
		min-width: 0;
		padding-top: 5px;
	}
	.station-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 21px;
	}
	.station-heading .eyebrow {
		color: #c0a689;
		font-size: 9px;
	}
	.station-heading h2 {
		font-size: 22px;
		font-weight: 550;
		color: #edece2;
		margin-top: 7px;
		letter-spacing: -0.03em;
	}
	.station-count {
		color: #adb3a7;
		font:
			27px 'Courier New',
			monospace;
		text-align: right;
		line-height: 1;
	}
	.station-count small {
		display: block;
		margin-top: 6px;
		font:
			7px 'Arial',
			sans-serif;
		letter-spacing: 0.1em;
	}
	.search-control {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		min-height: 43px;
		border: 1px solid #50584a;
		border-radius: 6px;
		color: #a5ad9b;
		background: #171d1759;
	}
	.search-control input {
		min-width: 0;
		width: 100%;
		height: 42px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #ecede5;
		font-size: 12px;
	}
	.search-control input::placeholder {
		color: #b0b6a7;
		opacity: 1;
	}
	.search-control:focus-within {
		outline: 2px solid #d99462;
		outline-offset: 2px;
	}
	.search-control input:focus-visible {
		outline: none;
	}
	.station-filters {
		display: flex;
		gap: 7px;
		margin: 12px 0 18px;
	}
	.station-filters button {
		min-height: 34px;
		padding: 5px 12px;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		color: #bec5b5;
		font-size: 11px;
	}
	.station-filters button.chosen {
		border-color: #657057;
		background: #414b35;
		color: #eef0e0;
	}
	.station-filters button span {
		margin-left: 5px;
		opacity: 0.75;
	}
	.station-list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 7px;
		max-height: 540px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #879174 #1d241b;
		scrollbar-gutter: stable;
		padding-right: 5px;
	}
	.station-list > li {
		display: flex;
		align-items: stretch;
		border: 1px solid #525a493d;
		border-radius: 7px;
		background: #161d182b;
		overflow: hidden;
	}
	.station-list::-webkit-scrollbar {
		width: 8px;
	}
	.station-list::-webkit-scrollbar-track {
		background: #1d241b;
		border-radius: 5px;
	}
	.station-list::-webkit-scrollbar-thumb {
		background: #879174;
		border-radius: 5px;
	}
	.scroll-note {
		margin-top: 9px !important;
		color: #b8c1aa;
		font-size: 10px;
		text-align: right;
	}
	.station-list > li.selected {
		border-color: #98704b;
		background: #aa744611;
	}
	.station-list > li.on-air {
		border-color: #8d9d66;
	}
	.station-choice {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
		text-align: left;
		padding: 13px 2px 13px 12px;
		border: 0;
		background: transparent;
		color: #eceee3;
	}
	.station-choice:hover {
		background: #9eac7d12;
	}
	.preset-number {
		flex-shrink: 0;
		font:
			10px 'Courier New',
			monospace;
		color: #b4bda8;
	}
	.selected .preset-number {
		color: #f0a671;
	}
	.station-copy {
		flex: 1;
		min-width: 0;
	}
	.station-copy > b {
		display: block;
		font-size: 13px;
		line-height: 1.3;
		font-weight: 550;
	}
	.station-copy > span {
		display: block;
		margin-top: 4px;
		color: #b6bdac;
		font-size: 10px;
		line-height: 1.4;
	}
	.station-copy > span > span {
		padding: 0 3px;
		color: #a1a990;
	}
	.station-indicator {
		color: #b3bd9d;
		font-size: 18px;
		line-height: 1;
	}
	.on-air .station-indicator {
		color: #b0da83;
		font-size: 11px;
	}
	.star-button {
		display: grid;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 39px;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: transparent;
		color: #bcc4ad;
		font:
			22px 'Arial',
			sans-serif;
	}
	.star-button:hover,
	.star-button.saved {
		color: #efbd7f;
	}
	.station-choice:focus-visible,
	.star-button:focus-visible {
		outline-offset: -4px;
	}
	.station-list > li.empty-stations {
		display: block;
		padding: 24px 16px;
		color: #c7ceba;
		font-size: 13px;
		text-align: center;
	}
	.official-links {
		margin-top: 19px;
		border-top: 1px solid #535c473d;
		padding-top: 13px;
	}
	.official-links summary {
		color: #d1d8c3;
		cursor: pointer;
		font-size: 11px;
		min-height: 30px;
	}
	.official-links p {
		color: #b9c2ac;
		font-size: 11px;
		margin: 7px 0 10px;
	}
	.official-links ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 9px;
	}
	.official-links li {
		display: grid;
		gap: 2px;
		font-size: 12px;
	}
	.official-links li > span {
		color: #b9c2ac;
		font-size: 10px;
	}
	.listening-note,
	.storage-note {
		margin-top: 18px !important;
		color: #b6beaa;
		font-size: 10px;
		line-height: 1.7;
	}
	.storage-note {
		color: #e6bc83;
	}
	.playback-error {
		margin-top: 14px;
		padding: 12px;
		border: 1px solid #916748;
		border-radius: 6px;
		background: #2a2118;
		color: #e9d4bc;
		font-size: 11px;
	}
	.playback-error > div {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 12px;
		align-items: center;
		margin-top: 10px;
	}
	.playback-error button {
		min-height: 34px;
		border: 1px solid #ac7c52;
		border-radius: 3px;
		padding: 5px 9px;
		background: #473221;
		color: #fff0dc;
	}
	.no-script {
		margin-top: 16px !important;
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
	@media (min-width: 1100px) {
		.radio-app {
			max-width: 1120px;
		}
		.station-list {
			gap: 9px;
		}
		.station-choice {
			padding-top: 16px;
			padding-bottom: 16px;
		}
	}
	@media (max-width: 760px) {
		.radio-app {
			width: calc(100vw - 1rem);
			padding: 25px 20px;
		}
		.radio-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: 30px;
		}
		.receiver {
			max-width: 470px;
			width: 100%;
			margin: 0 auto;
		}
		.station-cabinet {
			max-width: 470px;
			width: 100%;
			margin: 0 auto;
		}
		.edition {
			display: none;
		}
		.app-heading {
			max-width: 470px;
			margin: 0 auto 23px;
		}
		.station-display h2 {
			font-size: 27px;
		}
		.station-display {
			min-height: 95px;
			padding: 12px 0;
		}
		.station-list {
			max-height: none;
			overflow: visible;
			padding-right: 0;
		}
		.scroll-note {
			display: none;
		}
		.station-heading h2 {
			font-size: 24px;
		}
		.station-choice {
			padding-top: 15px;
			padding-bottom: 15px;
		}
		.station-copy > b {
			font-size: 14px;
		}
		.station-copy > span,
		.listening-note,
		.storage-note {
			font-size: 11px;
		}
		.station-filters button {
			min-height: 40px;
			font-size: 12px;
		}
		.search-control input {
			font-size: 16px;
		}
		.timer-controls button {
			min-height: 38px;
		}
	}
	@media (max-width: 400px) {
		.radio-app {
			border-radius: 12px;
			padding: 20px 12px;
		}
		.app-heading h1 {
			font-size: 32px;
		}
		.intro {
			font-size: 12px;
		}
		.receiver {
			padding: 14px 11px 12px;
			border-radius: 20px;
		}
		.instrument-row {
			gap: 8px;
		}
		.brand {
			font-size: 9px;
		}
		.model {
			font-size: 6px;
		}
		.instrument {
			padding: 5px 3px 7px;
		}
		.display-panel {
			padding: 10px;
			border-width: 5px;
		}
		.station-display h2 {
			font-size: 24px;
		}
		.connection {
			font-size: 9px;
			gap: 5px;
		}
		.clock {
			font-size: 20px;
		}
		.transport-panel {
			gap: 11px;
			padding: 14px 8px 11px;
		}
		.power-button {
			width: 75px;
			height: 75px;
		}
		.receiver-foot {
			font-size: 5.5px;
		}
		.speaker-grille {
			min-width: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.radio-app button {
			transition: none;
		}
	}
</style>
