<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { initializeConsent, subscribeConsent, openPrivacySettings } from '$lib/privacy/consent';
	import { catalogue } from '$lib/visualizations/videos-i-like/catalogue';
	import {
		TOPICS,
		MUSIC_TOPICS,
		filterGallery,
		eligibleQueue,
		formatDuration,
		contentFailure,
		playbackMessage
	} from '$lib/visualizations/videos-i-like/gallery';
	import type {
		GalleryItem,
		GalleryResponse,
		MusicTopic,
		Topic,
		VideoAvailability
	} from '$lib/visualizations/videos-i-like/types';
	import {
		createYouTubeController,
		type YouTubeController,
		type YouTubeSnapshot
	} from '$lib/visualizations/listening-room/youtube';
	import './videos-i-like.css';

	let items = $state<GalleryItem[]>([]);
	let topic = $state<'all' | Topic>('all');
	let music = $state<'all' | MusicTopic>('all');
	let query = $state('');
	let checking = $state(true);
	let moreBusy = $state(false);
	let pendingBatch = $state<number | null>(null);
	let checkError = $state('');
	let checkedAt = $state<string | null>(null);
	let expiresAt = $state<string | null>(null);
	let now = $state(Date.now());
	let mediaAllowed = $state(false);
	let onceAllowed = $state(false);
	let selected = $state<GalleryItem | null>(null);
	let current = $state<VideoAvailability | null>(null);
	let failed = $state(new Set<string>());
	let playerBusy = $state(false);
	let playerError = $state('');
	let autoplayBlocked = $state(false);
	let playerReady = $state(false);
	let host = $state<HTMLDivElement>();
	let panel = $state<HTMLElement>();
	let tablist = $state<HTMLDivElement>();
	let controller: YouTubeController | undefined;
	let playerRequest: AbortController | undefined;
	let availabilityRequest: AbortController | undefined;
	let generation = 0;
	let destroyed = false;
	let lastTrigger: HTMLButtonElement | null = null;
	let lastState = '';
	let currentPosition = $state(-1);

	const canLoadMedia = $derived(mediaAllowed || onceAllowed);
	const stale = $derived(Boolean(expiresAt && Date.parse(expiresAt) <= now));
	const visible = $derived(stale ? [] : filterGallery(items, topic, music, query, failed));
	const queue = $derived(selected ? eligibleQueue(selected, failed) : []);
	const queueOccurrences = $derived(
		selected?.videos
			.map((video, position) => ({ video, position }))
			.filter(({ video }) => video.state === 'eligible' && !failed.has(video.id)) ?? []
	);
	const unknownCount = $derived(
		items.filter((item) => item.state === 'unknown' && item.kind !== 'mix').length
	);
	const unavailableCount = $derived(
		items.filter((item) => item.state === 'unavailable' && item.kind !== 'mix').length
	);
	const continuations = $derived(
		items.filter(
			(item) =>
				item.kind === 'playlist' &&
				item.nextPage !== undefined &&
				(topic === 'all' || item.categories.includes(topic))
		)
	);
	const sourceFiles = [
		...new Map(
			catalogue.entries.flatMap((entry) => entry.sources).map((source) => [source.file, source])
		).values()
	];
	const mixes = catalogue.entries.filter((entry) => entry.kind === 'mix');
	const localCollections = sourceFiles
		.filter((source) => source.collection === 'obsidian')
		.map((source) => ({
			...source,
			entries: catalogue.entries.filter((entry) =>
				entry.sources.some((reference) => reference.file === source.file)
			)
		}));
	const titles = $derived(new Map(items.map((item) => [item.key, item.title])));
	const checkedSelections = $derived(items.filter((item) => item.kind !== 'mix').length);
	const totalSelections = catalogue.entries.filter((entry) => entry.kind !== 'mix').length;

	function releasePlayer() {
		generation++;
		playerRequest?.abort();
		playerRequest = undefined;
		controller?.destroy();
		controller = undefined;
		playerBusy = false;
		playerReady = false;
		autoplayBlocked = false;
		lastState = '';
	}

	function closePlayer(restoreFocus = true) {
		releasePlayer();
		selected = null;
		current = null;
		currentPosition = -1;
		playerError = '';
		if (restoreFocus) lastTrigger?.focus();
	}

	async function checkAvailability(playlist?: GalleryItem, resume = false) {
		availabilityRequest?.abort();
		const request = new AbortController();
		availabilityRequest = request;
		let batch = !playlist && resume ? pendingBatch : null;
		if (!playlist && !resume) pendingBatch = null;
		if (playlist) moreBusy = true;
		else checking = true;
		checkError = '';
		try {
			for (;;) {
				let data: GalleryResponse;
				const deadline = setTimeout(() => request.abort(), 30_000);
				try {
					const response = await fetch('/api/videos-i-like', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(
							playlist
								? { playlistKey: playlist.key, page: playlist.nextPage }
								: batch !== null
									? { batch }
									: {}
						),
						signal: request.signal
					});
					if (!response.ok) throw new Error('check-failed');
					data = await response.json();
				} finally {
					clearTimeout(deadline);
				}
				if (!Array.isArray(data.items) || !['ready', 'missing-key'].includes(data.configuration))
					throw new Error('invalid-response');
				if (
					data.nextBatch !== undefined &&
					(!Number.isInteger(data.nextBatch) ||
						data.nextBatch <= (batch ?? 0) ||
						data.nextBatch > catalogue.entries.length)
				)
					throw new Error('invalid-batch');
				if (destroyed || availabilityRequest !== request) return;
				// A continuation may have restarted an expired server snapshot. Refresh the
				// complete catalogue before extending the lifetime of any older cards.
				if (playlist && expiresAt && Date.parse(expiresAt) <= Date.now()) {
					await checkAvailability();
					return;
				}
				if (playlist || batch !== null) {
					items = [
						...items.map((item) => data.items.find((next) => next.key === item.key) ?? item),
						...data.items.filter((item) => !items.some((previous) => previous.key === item.key))
					];
					if (data.expiresAt && (!expiresAt || Date.parse(data.expiresAt) < Date.parse(expiresAt)))
						expiresAt = data.expiresAt;
					if (data.checkedAt && (!checkedAt || Date.parse(data.checkedAt) < Date.parse(checkedAt)))
						checkedAt = data.checkedAt;
				} else {
					items = data.items;
					checkedAt = data.checkedAt;
					expiresAt = data.expiresAt;
				}
				now = Date.now();
				if (selected) {
					selected = items.find((item) => item.key === selected?.key) ?? null;
					const refreshed = selected?.videos[currentPosition];
					if (
						current &&
						(!refreshed || refreshed.id !== current.id || refreshed.state !== 'eligible')
					) {
						releasePlayer();
						current = refreshed ?? { ...current, state: 'unknown' };
						playerError =
							'This selection is no longer available to play here. Refresh the check or choose another video.';
					} else if (refreshed) current = refreshed;
				}
				if (data.configuration === 'missing-key')
					checkError =
						'Video checks are not available yet. You can still browse the original collections below.';
				else if (
					items.some(
						(item) =>
							item.kind !== 'mix' &&
							(item.state === 'unknown' || item.videos.some((video) => video.state === 'unknown'))
					)
				)
					checkError = 'Some videos could not be checked. Try again.';
				else checkError = '';
				if (playlist) break;
				pendingBatch = data.configuration === 'ready' ? (data.nextBatch ?? null) : null;
				if (expiresAt && Date.parse(expiresAt) <= now) {
					pendingBatch = null;
					break;
				}
				if (pendingBatch === null) break;
				batch = pendingBatch;
			}
		} catch {
			if (!destroyed && availabilityRequest === request)
				checkError = 'The videos could not be checked. Please try again.';
		} finally {
			if (!destroyed && availabilityRequest === request) {
				checking = false;
				moreBusy = false;
			}
		}
	}

	function onSnapshot(snapshot: YouTubeSnapshot, token: number, videoId: string) {
		if (destroyed || token !== generation || current?.id !== videoId) return;
		autoplayBlocked = Boolean(snapshot.autoplayBlocked);
		if (snapshot.state === 'error') {
			playerError = playbackMessage(snapshot.errorCode);
			if (contentFailure(snapshot.errorCode)) {
				failed = new Set([...failed, videoId]);
				// Dispose after the API callback returns; no automatic error-skipping loop.
				queueMicrotask(() => {
					if (token === generation) releasePlayer();
				});
			}
		}
		if (snapshot.state === 'playing') playerError = '';
		const ended = snapshot.state === 'ended' && lastState !== 'ended';
		lastState = snapshot.state;
		if (ended && selected && !document.hidden) {
			const nextIndex = selected.videos.findIndex(
				(video, index) =>
					index > currentPosition && video.state === 'eligible' && !failed.has(video.id)
			);
			const next = selected.videos[nextIndex];
			if (next)
				queueMicrotask(() => {
					if (token === generation) void playVideo(next, nextIndex);
				});
		}
	}

	async function playVideo(video: VideoAvailability, position?: number) {
		if (!canLoadMedia || video.state !== 'eligible' || failed.has(video.id)) return;
		if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
			now = Date.now();
			playerError = 'Refresh videos before starting another selection.';
			return;
		}
		releasePlayer();
		current = video;
		currentPosition = position ?? selected?.videos.findIndex((entry) => entry === video) ?? -1;
		playerError = '';
		playerBusy = true;
		const token = generation;
		const request = new AbortController();
		playerRequest = request;
		await tick();
		if (destroyed || token !== generation || !host) return;
		const source = {
			videoId: video.id,
			...(selected?.kind === 'video' && selected.sources[0]?.startSeconds !== undefined
				? { startSeconds: selected.sources[0].startSeconds }
				: {})
		};
		try {
			const created = await createYouTubeController(
				host,
				(snapshot) => onSnapshot(snapshot, token, video.id),
				{
					signal: request.signal,
					source,
					mode: 'video',
					iframeTitle: 'YouTube video player'
				}
			);
			if (destroyed || token !== generation || !canLoadMedia) {
				created.destroy();
				return;
			}
			controller = created;
			controller.cue(source, 'video');
			playerReady = true;
			controller.play();
		} catch {
			if (!destroyed && token === generation && !request.signal.aborted)
				playerError = 'The player could not start. Try again or open this video on YouTube.';
		} finally {
			if (token === generation) playerBusy = false;
		}
	}

	async function selectItem(item: GalleryItem, trigger: HTMLButtonElement) {
		closePlayer(false);
		lastTrigger = trigger;
		selected = item;
		current = eligibleQueue(item, failed)[0] ?? null;
		currentPosition = item.videos.findIndex((video) => video === current);
		await tick();
		panel?.focus({ preventScroll: true });
		panel?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
		if (current && canLoadMedia) await playVideo(current, currentPosition);
	}

	function allowOnce() {
		onceAllowed = true;
		if (current) void playVideo(current, currentPosition);
	}

	function resumePlayback() {
		now = Date.now();
		if (expiresAt && Date.parse(expiresAt) <= now) {
			playerError = 'Refresh videos before starting another selection.';
			return;
		}
		if (canLoadMedia && current?.state === 'eligible' && !failed.has(current.id))
			controller?.play();
	}

	function nextAfterFailure() {
		if (!selected || !current) return;
		const nextIndex = selected.videos.findIndex(
			(video, index) =>
				index > currentPosition && video.state === 'eligible' && !failed.has(video.id)
		);
		const next = selected.videos[nextIndex];
		if (next) void playVideo(next, nextIndex);
		else closePlayer();
	}

	function tabKey(event: KeyboardEvent) {
		const index = TOPICS.findIndex((value) => value.id === topic);
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % TOPICS.length;
		else if (event.key === 'ArrowLeft') next = (index + TOPICS.length - 1) % TOPICS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = TOPICS.length - 1;
		else return;
		event.preventDefault();
		topic = TOPICS[next].id;
		const button = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
		button?.focus();
		button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	onMount(() => {
		const cleanupConsent = initializeConsent();
		const unsubscribe = subscribeConsent((record) => {
			mediaAllowed = record?.media === true;
			if (!mediaAllowed) {
				onceAllowed = false;
				releasePlayer();
			}
		});
		void checkAvailability();
		const clock = setInterval(() => {
			now = Date.now();
		}, 30_000);
		return () => {
			destroyed = true;
			availabilityRequest?.abort();
			releasePlayer();
			clearInterval(clock);
			unsubscribe();
			cleanupConsent();
		};
	});
</script>

<section class="vif not-prose" aria-label="Videos I Like" data-testid="videos-i-like">
	<header class="vif-heading">
		<div>
			<p class="vif-eyebrow">FROM MY POSTS AND SAVED NOTES</p>
			<h1>Videos I Like</h1>
			<p class="vif-subtitle">Music, films, courses and ideas. Pick a topic and press Play.</p>
			<p class="vif-updated">Updated <time datetime="2026-11-03">3 November 2026</time></p>
		</div>
		<span class="vif-mark" aria-hidden="true">▶</span>
	</header>

	<div class="vif-tools">
		<div class="vif-tabs" role="tablist" aria-label="Video topics" bind:this={tablist}>
			{#each TOPICS as tab (tab.id)}
				<button
					type="button"
					id={`vif-tab-${tab.id}`}
					role="tab"
					aria-selected={topic === tab.id}
					aria-controls="vif-results"
					tabindex={topic === tab.id ? 0 : -1}
					onclick={() => {
						topic = tab.id;
					}}
					onkeydown={tabKey}>{tab.label}</button
				>
			{/each}
		</div>
		<label class="vif-search"
			><span>Search this collection</span><input
				type="search"
				bind:value={query}
				placeholder="Title, channel or topic"
				maxlength="200"
			/></label
		>
	</div>
	{#if topic === 'music'}
		<div class="vif-music" aria-label="Music category">
			{#each MUSIC_TOPICS as filter (filter.id)}<button
					type="button"
					aria-pressed={music === filter.id}
					onclick={() => {
						music = filter.id;
					}}>{filter.label}</button
				>{/each}
		</div>
	{/if}

	{#if !canLoadMedia}
		<div class="vif-consent">
			<p>Thumbnails and playback connect to YouTube.</p>
			<button type="button" class="vif-primary" onclick={allowOnce}>Load YouTube content</button
			><button type="button" class="vif-text-button" onclick={openPrivacySettings}
				>Media preferences</button
			>
		</div>
	{:else}<div class="vif-media-note">
			<span>YouTube content enabled for this visit.</span><button
				type="button"
				class="vif-text-button"
				onclick={() => {
					onceAllowed = false;
					mediaAllowed = false;
					releasePlayer();
				}}>Hide YouTube content</button
			>
		</div>{/if}

	{#if selected && current}
		<section class="vif-player" aria-label="Selected video" tabindex="-1" bind:this={panel}>
			<div class="vif-player-heading">
				<div>
					<p class="vif-eyebrow">
						{selected.kind === 'playlist' ? selected.title : 'NOW SELECTED'}
					</p>
					<h3>{current.title}</h3>
					<p>{current.channelTitle}</p>
				</div>
				<button
					type="button"
					class="vif-close"
					onclick={() => closePlayer()}
					aria-label="Close player">×</button
				>
			</div>
			{#if canLoadMedia && current.state === 'eligible' && !failed.has(current.id)}
				<div class="vif-player-frame" bind:this={host}></div>
			{:else}<div class="vif-player-placeholder">
					<span aria-hidden="true">▶</span>
					<p>
						{failed.has(current.id)
							? 'This video cannot play here.'
							: 'Load YouTube content to watch here.'}
					</p>
					{#if !canLoadMedia}<button type="button" class="vif-primary" onclick={allowOnce}
							>Load YouTube content</button
						>{/if}
				</div>{/if}
			<div class="vif-player-actions">
				<a
					href={`https://www.youtube.com/watch?v=${current.id}`}
					target="_blank"
					rel="external noopener noreferrer">Open video on YouTube ↗</a
				>
				{#if selected.kind === 'playlist'}<a
						href={selected.url}
						target="_blank"
						rel="external noopener noreferrer">Original playlist ↗</a
					>{/if}
				{#if playerReady}<button
						type="button"
						disabled={stale ||
							!canLoadMedia ||
							current.state !== 'eligible' ||
							failed.has(current.id)}
						onclick={resumePlayback}>Play</button
					>{/if}
			</div>
			<div role="status" class="vif-player-status">
				{#if playerBusy}Loading player…{:else if playerError}{playerError}{:else if autoplayBlocked}Press
					Play to start the video.{/if}
			</div>
			{#if playerError}
				{#if failed.has(current.id)}<button type="button" onclick={nextAfterFailure}
						>{queue.length ? 'Choose next available video' : 'Return to gallery'}</button
					>
				{:else}<button
						type="button"
						disabled={!canLoadMedia || playerBusy || current.state !== 'eligible' || stale}
						onclick={() => current && playVideo(current, currentPosition)}
						>Try playback again</button
					>{/if}
			{/if}
			{#if selected.kind === 'playlist'}
				<div class="vif-queue-heading">
					<h4>In this playlist</h4>
					<span
						>{queue.length} eligible · {selected.checkedCount} checked{selected.nextPage !==
						undefined
							? ' · more to check'
							: ''}</span
					>
				</div>
				{#if selected.reason}<p class="vif-check-note">{selected.reason}</p>{/if}
				<ol class="vif-queue">
					{#each queueOccurrences as { video, position }, index (position)}<li>
							<button
								type="button"
								aria-current={currentPosition === position ? 'true' : undefined}
								disabled={!canLoadMedia || stale}
								onclick={() => playVideo(video, position)}
								><span class="vif-queue-number">{index + 1}</span><span
									>{video.title}<small>{video.channelTitle}</small></span
								><span>{formatDuration(video.durationSeconds)}</span></button
							>
						</li>{/each}
				</ol>
				{#if selected.nextPage !== undefined}<button
						type="button"
						disabled={moreBusy || checking}
						onclick={() => selected && checkAvailability(selected)}
						>{moreBusy ? 'Checking more…' : 'Check more playlist videos'}</button
					>{/if}
			{/if}
		</section>
	{/if}

	<div class="vif-status" role="status" aria-live="polite">
		{#if checking}<span
				>Checking videos…{checkedSelections > 0
					? ` ${checkedSelections} of ${totalSelections} selections checked. You can play the available ones.`
					: ''}</span
			>
		{:else if stale}<span>The last check has expired. Refresh to see available videos.</span>
		{:else if checkError}<span>{checkError}</span>
		{:else}<span
				>{visible.length}
				{visible.length === 1 ? 'selection' : 'selections'}{query || topic !== 'all'
					? ' found'
					: ' available'}</span
			>{/if}
		<button type="button" disabled={checking || moreBusy} onclick={() => checkAvailability()}
			>Refresh videos</button
		>
	</div>
	{#if !checking && pendingBatch !== null && !stale}<p class="vif-check-note">
			More saved selections still need checking.
			<button type="button" disabled={moreBusy} onclick={() => checkAvailability(undefined, true)}
				>Continue checking</button
			>
		</p>{/if}
	{#if checkedAt && !checking}<p class="vif-check-note">
			Checked <time datetime={checkedAt}
				>{new Date(checkedAt).toLocaleTimeString('en-GB', {
					hour: '2-digit',
					minute: '2-digit'
				})}</time
			>. YouTube may still restrict playback for some viewers.{unavailableCount > 0
				? ` ${unavailableCount} unavailable ${unavailableCount === 1 ? 'selection is' : 'selections are'} hidden.`
				: ''}{unknownCount && !checkError ? ' Some selections could not be checked.' : ''}
		</p>{/if}

	<div
		id="vif-results"
		role="tabpanel"
		aria-labelledby={`vif-tab-${topic}`}
		aria-busy={checking}
		tabindex="0"
	>
		{#if checking && items.length === 0}<div class="vif-skeletons" aria-hidden="true">
				{#each [0, 1, 2, 3, 4, 5] as placeholder (placeholder)}<div>
						<span></span><i></i><i></i>
					</div>{/each}
			</div>
		{:else if visible.length}
			<div class="vif-grid">
				{#each visible as item (item.key)}
					<article class="vif-card">
						<button
							class="vif-card-open"
							type="button"
							onclick={(event) => selectItem(item, event.currentTarget)}
							aria-label={`Play ${item.title}`}
						>
							<div class="vif-thumbnail">
								{#if canLoadMedia && item.thumbnail}<img
										src={item.thumbnail}
										alt=""
										loading="lazy"
										width="480"
										height="270"
										onerror={(event) => {
											(event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
										}}
									/>{/if}
								<span class="vif-play" aria-hidden="true">▶</span>
								{#if item.kind === 'playlist'}<span class="vif-badge"
										>Playlist · {eligibleQueue(item, failed).length} eligible</span
									>{:else if formatDuration(item.durationSeconds)}<span class="vif-badge"
										>{formatDuration(item.durationSeconds)}</span
									>{/if}
							</div>
							<h3>{item.title}</h3>
						</button>
						<p>{item.channelTitle || 'YouTube'}</p>
						<div class="vif-card-meta">
							<span
								>{item.kind === 'playlist'
									? `${item.checkedCount} checked${item.nextPage !== undefined ? ' · more to check' : ''}`
									: TOPICS.find((tab) => tab.id === item.categories[0])?.label}</span
							><a
								href={item.url}
								target="_blank"
								rel="external noopener noreferrer"
								aria-label={`Open ${item.title} on YouTube`}>YouTube ↗</a
							>
						</div>
					</article>
				{/each}
			</div>
		{:else if !checking}<div class="vif-empty">
				<span aria-hidden="true">▶</span>
				<h3>
					{checkError || stale ? 'Nothing ready to play here yet.' : 'No videos match this view.'}
				</h3>
				<p>
					{checkError || stale
						? 'Refresh the check, or browse the original collections below.'
						: 'Try another topic or a shorter search.'}
				</p>
				{#if query}<button
						type="button"
						onclick={() => {
							query = '';
						}}>Clear search</button
					>{/if}
			</div>{/if}
	</div>
	{#if continuations.some((item) => !visible.some((shown) => shown.key === item.key))}
		<div class="vif-more">
			<p>Some playlists have more videos to check.</p>
			{#each continuations.filter((item) => !visible.some((shown) => shown.key === item.key)) as item (item.key)}<button
					type="button"
					disabled={checking || moreBusy}
					onclick={() => checkAvailability(item)}>Check more: {item.title}</button
				>{/each}
		</div>
	{/if}
	<details class="vif-sources">
		<summary>Original collections and source links</summary>
		<p>Collected from my posts and saved notes. Availability is checked separately.</p>
		<ul>
			{#each sourceFiles.filter((source) => source.url) as source (source.file)}<li>
					<a href={source.url} target="_blank" rel="external noopener noreferrer"
						>{source.file.replace(/^drafts\//, '').replace(/\.md$/, '')}</a
					>
				</li>{/each}
		</ul>
		{#if localCollections.length}<p>Saved-note collections</p>
			{#each localCollections as collection (collection.file)}
				<details>
					<summary>{collection.label} · {collection.entries.length} selections</summary>
					<ul>
						{#each collection.entries as entry (entry.key)}<li>
								<a href={entry.url} target="_blank" rel="external noopener noreferrer"
									>{titles.get(entry.key) ||
										`${entry.kind === 'video' ? 'Video' : 'Playlist'} ${entry.id}`}</a
								>
							</li>{/each}
					</ul>
				</details>
			{/each}
		{/if}
		{#each mixes as mix (mix.key)}<p>
				<a href={mix.url} target="_blank" rel="external noopener noreferrer"
					>Open the Hindi YouTube Mix ↗</a
				> — generated mixes are available on YouTube.
			</p>{/each}
		<p class="vif-check-note">
			{catalogue.entries.length} saved selections from {sourceFiles.length} posts and saved-note collections.
			Availability is checked separately.
		</p>
	</details>
	<noscript
		><p>
			This gallery needs JavaScript to check videos and load the player. The original collection
			links above still work.
		</p></noscript
	>
</section>
