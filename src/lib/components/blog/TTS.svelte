<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Progress } from '$lib/components/ui/progress';
	import { extractNarration, hashNarration, NARRATION_VERSION } from './tts/narration.mjs';
	import {
		browserChunks,
		chooseDeviceVoice,
		claimPlayback,
		readManifest,
		releasePlayback,
		timelinePosition,
		validArticleSlug,
		validateManifest,
		type NarrationManifest,
		type SpeechChunk
	} from './tts/playback';

	type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'interrupted' | 'complete' | 'error';
	type Engine = 'google' | 'device';
	const owner = {};
	const id = $props.id();
	const preferenceKey = 'article-narration-preferences-v1';
	const unavailableNarrationDetail =
		'Google narration is not available for this article. Device voice uses US English when available.';
	let mounted = $state(false);
	let supported = $state(false);
	let manifest = $state<NarrationManifest | null>(null);
	let checking = $state(true);
	let engine = $state<Engine>('device');
	let explicitlySelectedDevice = false;
	let status = $state<Status>('idle');
	let announcement = $state('');
	let detail = $state('Checking article narration…');
	let voices = $state<SpeechSynthesisVoice[]>([]);
	let selectedVoice = $state('');
	let speed = $state(1);
	let elapsed = $state(0);
	let segmentIndex = $state(0);
	let chunks = $state<SpeechChunk[]>([]);
	let chunkIndex = $state(0);
	let chunkOffset = 0;
	let articleText = '';
	let audio: HTMLAudioElement | null = null;
	let utterance: SpeechSynthesisUtterance | null = null;
	let manifestController: AbortController | null = null;
	let nextTimer: ReturnType<typeof setTimeout> | undefined;
	let stallTimer: ReturnType<typeof setTimeout> | undefined;
	let articleRevision = 0;
	let playbackRevision = 0;
	let playRequest = 0;
	let audioSourceRevision = 0;
	let voicesWaitStarted = 0;

	const icons = {
		play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
		pause:
			'M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z'
	};
	let total = $derived(manifest?.segments.reduce((sum, segment) => sum + segment.duration, 0) ?? 0);
	let active = $derived(status === 'playing' || status === 'loading');
	let progress = $derived(
		status === 'complete'
			? 100
			: engine === 'google' && total > 0
				? Math.min(100, (elapsed / total) * 100)
				: chunks.length > 0
					? (chunkIndex / chunks.length) * 100
					: 0
	);
	let playButtonLabel = $derived(
		active
			? 'Pause article audio'
			: status === 'complete'
				? 'Listen to article again'
				: status === 'paused'
					? 'Resume article audio'
					: status === 'interrupted'
						? 'Continue article audio from interruption'
						: 'Listen to article'
	);
	let playbackLabel = $derived(
		status === 'complete'
			? 'Audio complete'
			: status === 'loading'
				? 'Loading audio…'
				: status === 'playing'
					? 'Playing article'
					: status === 'paused'
						? 'Audio paused'
						: status === 'interrupted'
							? 'Playback interrupted'
							: status === 'error'
								? 'Audio unavailable'
								: 'Audio article'
	);
	let availableVoices = $derived(
		[...voices].sort((a, b) => {
			const aUS = a.lang.toLowerCase() === 'en-us' ? 0 : 1;
			const bUS = b.lang.toLowerCase() === 'en-us' ? 0 : 1;
			return aUS - bUS || a.name.localeCompare(b.name);
		})
	);
	let visibleVoice = $derived(
		voices.some((voice) => voice.voiceURI === selectedVoice) ? selectedVoice : ''
	);

	$effect(() => {
		const slug = page.data.slug ?? page.params.slug ?? '';
		const path = page.url.pathname;
		const available = page.data.narrationAvailable === true;
		if (mounted) untrack(() => void prepareArticle(slug, path, available));
	});

	onMount(() => {
		supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
		try {
			const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
			if (typeof saved.voice === 'string') selectedVoice = saved.voice;
			if ([0.75, 1, 1.25, 1.5, 1.75, 2].includes(saved.speed)) speed = saved.speed;
		} catch {
			/* Storage is optional, including in private browsing. */
		}
		const updateVoices = () => {
			voices = window.speechSynthesis.getVoices();
		};
		if (supported) {
			updateVoices();
			window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
		}
		mounted = true;
		return () => {
			mounted = false;
			articleRevision++;
			manifestController?.abort();
			if (supported) window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
			stopPlayback(false);
		};
	});

	async function prepareArticle(slug: string, path: string, available: boolean) {
		const revision = ++articleRevision;
		manifestController?.abort();
		stopPlayback(false);
		manifest = null;
		engine = 'device';
		explicitlySelectedDevice = false;
		checking = true;
		detail = 'Checking article narration…';
		await tick();
		if (!mounted || revision !== articleRevision || path !== page.url.pathname) return;
		articleText = extractNarration(document);
		if (!available) {
			detail = unavailableNarrationDetail;
			checking = false;
			return;
		}
		const controller = new AbortController();
		manifestController = controller;
		const timeout = setTimeout(() => controller.abort(), 8000);
		try {
			if (!validArticleSlug(slug) || !articleText) throw new Error('No narration');
			const response = await fetch(`/audio/articles/${encodeURIComponent(slug)}/manifest.json`, {
				signal: controller.signal,
				credentials: 'omit'
			});
			const value = await readManifest(response);
			const textHash = await hashNarration(articleText);
			const candidate = validateManifest(value, slug, articleText, textHash, NARRATION_VERSION);
			if (!candidate) throw new Error('Outdated or incomplete narration');
			if (!mounted || revision !== articleRevision) return;
			manifest = candidate;
			// A late manifest must never interrupt an explicit choice or device playback.
			if (!explicitlySelectedDevice && status === 'idle') engine = 'google';
			detail =
				'Natural US English narration, generated with Google. Audio loads when you press Play.';
		} catch {
			if (!mounted || revision !== articleRevision) return;
			detail = unavailableNarrationDetail;
		} finally {
			clearTimeout(timeout);
			if (revision === articleRevision) checking = false;
		}
	}

	function clearSpeechTimers() {
		if (nextTimer) clearTimeout(nextTimer);
		if (stallTimer) clearTimeout(stallTimer);
		nextTimer = undefined;
		stallTimer = undefined;
	}

	function disposeAudio() {
		playRequest++;
		audioSourceRevision++;
		if (!audio) return;
		const previous = audio;
		audio = null;
		previous.onended = previous.onerror = previous.ontimeupdate = previous.onloadedmetadata = null;
		previous.pause();
		previous.removeAttribute('src');
		previous.load();
	}

	function disposeSpeech() {
		clearSpeechTimers();
		if (utterance) utterance.onboundary = utterance.onend = utterance.onerror = null;
		if (utterance && supported) window.speechSynthesis.cancel();
		utterance = null;
	}

	function stopPlayback(announce = true) {
		playbackRevision++;
		disposeAudio();
		disposeSpeech();
		releasePlayback(owner);
		status = 'idle';
		elapsed = 0;
		segmentIndex = 0;
		chunkIndex = 0;
		chunkOffset = 0;
		chunks = [];
		voicesWaitStarted = 0;
		if (announce) announcement = 'Audio stopped.';
	}

	function completePlayback() {
		disposeAudio();
		disposeSpeech();
		releasePlayback(owner);
		status = 'complete';
		elapsed = total;
		announcement = 'Audio playback finished.';
	}

	function savedOffset(index: number) {
		return (
			manifest?.segments.slice(0, index).reduce((sum, segment) => sum + segment.duration, 0) ?? 0
		);
	}

	async function playAudio(element: HTMLAudioElement) {
		const request = ++playRequest;
		status = 'loading';
		try {
			await element.play();
			if (!mounted || element !== audio || request !== playRequest) {
				if (element !== audio || !active) element.pause();
				return;
			}
			status = 'playing';
			announcement = 'Audio playback started.';
		} catch (error) {
			if (element !== audio || request !== playRequest) return;
			if (error instanceof Error && error.name === 'NotAllowedError') {
				status = 'paused';
				announcement = 'Your browser requires another tap. Press Play to start the audio.';
			} else {
				status = 'error';
				announcement = 'Google narration could not play. You can use a device voice instead.';
			}
		}
	}

	function loadSegment(index: number, offset = 0, play = true) {
		if (!manifest) return;
		const segment = manifest.segments[index];
		if (!segment) {
			completePlayback();
			return;
		}
		// Keep the gesture-authorized element across segments and seeks (especially for Safari).
		// Invalidate both old source handlers and pending play promises before replacing its source.
		playRequest++;
		const sourceRevision = ++audioSourceRevision;
		const element = audio ?? new Audio();
		element.onended = element.onerror = element.ontimeupdate = element.onloadedmetadata = null;
		element.pause();
		segmentIndex = index;
		elapsed = savedOffset(index) + offset;
		audio = element;
		element.preload = play ? 'none' : 'metadata';
		let pendingOffset: number | null = offset;
		element.onloadedmetadata = () => {
			if (audio !== element || sourceRevision !== audioSourceRevision) return;
			if (pendingOffset !== null) {
				element.currentTime = Math.min(
					pendingOffset,
					Number.isFinite(element.duration) ? element.duration : pendingOffset
				);
				pendingOffset = null;
			}
		};
		element.ontimeupdate = () => {
			if (audio === element && sourceRevision === audioSourceRevision)
				elapsed = savedOffset(index) + element.currentTime;
		};
		element.onended = () => {
			if (audio !== element || sourceRevision !== audioSourceRevision || status !== 'playing')
				return;
			if (index + 1 >= (manifest?.segments.length ?? 0)) completePlayback();
			else loadSegment(index + 1);
		};
		element.onerror = () => {
			if (audio !== element || sourceRevision !== audioSourceRevision) return;
			playRequest++;
			element.pause();
			status = 'error';
			announcement = 'Google narration could not load. You can use a device voice instead.';
		};
		element.src = segment.src;
		element.load();
		element.playbackRate = speed;
		if (play) void playAudio(element);
		else status = 'paused';
	}

	function scheduleSpeech(delay = 50) {
		const revision = playbackRevision;
		if (nextTimer) clearTimeout(nextTimer);
		nextTimer = setTimeout(() => {
			nextTimer = undefined;
			if (revision === playbackRevision) speakChunk();
		}, delay);
	}

	function armStallTimer(current: SpeechSynthesisUtterance) {
		if (stallTimer) clearTimeout(stallTimer);
		stallTimer = setTimeout(
			() => {
				if (utterance !== current || status !== 'playing') return;
				disposeSpeech();
				status = 'interrupted';
				announcement = 'Audio was interrupted. Press Play to continue from the current sentence.';
			},
			40_000 / Math.min(speed, 1)
		);
	}

	function speakChunk() {
		if (engine !== 'device' || status !== 'playing') return;
		if (chunkIndex >= chunks.length) {
			completePlayback();
			return;
		}
		if (!voices.length && chunkIndex === 0 && chunkOffset === 0) {
			voices = window.speechSynthesis.getVoices();
			if (!voices.length) {
				voicesWaitStarted ||= Date.now();
				if (Date.now() - voicesWaitStarted < 600) {
					scheduleSpeech(100);
					return;
				}
			}
		}
		const chunk = chunks[chunkIndex];
		if (chunkOffset >= chunk.text.length) {
			chunkIndex++;
			chunkOffset = 0;
			scheduleSpeech();
			return;
		}
		const startOffset = chunkOffset;
		const current = new SpeechSynthesisUtterance(chunk.text.slice(startOffset));
		const bengaliCount = (current.text.match(/[\u0980-\u09ff]/gu) ?? []).length;
		const latinCount = (current.text.match(/[a-z]/giu) ?? []).length;
		const language = bengaliCount > latinCount ? 'bn-BD' : 'en-US';
		const voice = chooseDeviceVoice(voices, language === 'en-US' ? selectedVoice : '', language);
		if (voice) current.voice = voice;
		current.lang = voice?.lang ?? language;
		current.rate = speed;
		current.onboundary = (event) => {
			if (utterance !== current || !Number.isFinite(event.charIndex)) return;
			chunkOffset = Math.min(
				chunk.text.length,
				Math.max(chunkOffset, startOffset + event.charIndex)
			);
			armStallTimer(current);
		};
		current.onend = () => {
			if (utterance !== current) return;
			clearSpeechTimers();
			utterance = null;
			if (status !== 'playing') return;
			chunkIndex++;
			chunkOffset = 0;
			scheduleSpeech();
		};
		current.onerror = (event) => {
			if (utterance !== current) return;
			if (Number.isFinite(event.charIndex))
				chunkOffset = Math.min(chunk.text.length, startOffset + event.charIndex);
			disposeSpeech();
			status = 'interrupted';
			announcement = 'Audio was interrupted. Press Play to continue from the current sentence.';
		};
		utterance = current;
		if (window.speechSynthesis.paused) window.speechSynthesis.resume();
		window.speechSynthesis.speak(current);
		armStallTimer(current);
	}

	function togglePlay() {
		if (!mounted) return;
		if (active) {
			playRequest++;
			if (engine === 'google') audio?.pause();
			else {
				if (utterance) window.speechSynthesis.pause();
				clearSpeechTimers();
			}
			status = 'paused';
			announcement = 'Audio paused.';
			return;
		}
		if (engine === 'device' && !supported) return;
		claimPlayback(owner, () => stopPlayback());
		if (engine === 'google' && manifest) {
			if (audio && status === 'paused') void playAudio(audio);
			else
				loadSegment(
					status === 'complete' ? 0 : segmentIndex,
					status === 'complete' ? 0 : Math.max(0, elapsed - savedOffset(segmentIndex))
				);
			return;
		}
		explicitlySelectedDevice = true;
		if (status === 'paused' && utterance && window.speechSynthesis.paused) {
			status = 'playing';
			window.speechSynthesis.resume();
			armStallTimer(utterance);
		} else {
			if (!chunks.length || status === 'complete') {
				articleText = extractNarration(document);
				chunks = browserChunks(articleText);
				chunkIndex = 0;
				chunkOffset = 0;
			}
			if (!chunks.length) {
				releasePlayback(owner);
				status = 'error';
				announcement = 'No readable article text was found.';
				return;
			}
			disposeSpeech();
			status = 'playing';
			scheduleSpeech();
		}
		announcement = 'Device voice playback started.';
	}

	function changeEngine(next: Engine) {
		if (next === engine) return;
		const textOffset =
			status === 'complete'
				? 0
				: engine === 'google'
					? (manifest?.segments[segmentIndex]?.textStart ?? 0)
					: (chunks[chunkIndex]?.start ?? 0);
		stopPlayback(false);
		engine = next;
		explicitlySelectedDevice = next === 'device';
		if (next === 'device' && textOffset > 0) {
			chunks = browserChunks(articleText);
			const index = chunks.findIndex((chunk) => chunk.end > textOffset);
			chunkIndex = Math.max(0, index);
			status = 'paused';
		} else if (next === 'google' && manifest && textOffset > 0) {
			const index = manifest.segments.findIndex((segment) => segment.textEnd > textOffset);
			segmentIndex = Math.max(0, index);
			elapsed = savedOffset(segmentIndex);
			status = 'paused';
		}
		announcement =
			textOffset > 0
				? 'Narration source changed. Press Play to continue from the beginning of the current section.'
				: 'Narration source changed. Press Play to listen.';
	}

	function savePreferences() {
		try {
			localStorage.setItem(preferenceKey, JSON.stringify({ voice: selectedVoice, speed }));
		} catch {
			/* Listening does not depend on storage access. */
		}
	}

	function changeSpeed(rate: number) {
		speed = rate;
		savePreferences();
		if (audio) audio.playbackRate = speed;
		if (engine === 'device' && status === 'playing') {
			disposeSpeech();
			scheduleSpeech();
		} else if (engine === 'device' && status === 'paused') disposeSpeech();
	}

	function changeVoice(voiceURI: string) {
		selectedVoice = voiceURI;
		savePreferences();
		if (engine === 'device' && status === 'playing') {
			disposeSpeech();
			scheduleSpeech();
		} else if (engine === 'device' && status === 'paused') disposeSpeech();
	}

	function seek(event: Event) {
		if (!manifest) return;
		const target = Number((event.currentTarget as HTMLInputElement).value);
		if (target >= total) {
			completePlayback();
			return;
		}
		const position = timelinePosition(manifest.segments, target);
		const wasPlaying = active;
		if (wasPlaying) claimPlayback(owner, () => stopPlayback());
		loadSegment(position.index, position.offset, wasPlaying);
	}

	function time(value: number) {
		const seconds = Math.floor(Math.max(0, value));
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}
</script>

<section
	data-tts-exclude
	data-testid="article-tts"
	aria-label="Audio article"
	class="not-prose my-8 flex items-start gap-4 rounded-xl border border-neutral-200 bg-white/50 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/50 print:hidden"
>
	<button
		type="button"
		onclick={togglePlay}
		disabled={!mounted || (engine === 'device' && !supported)}
		aria-label={playButtonLabel}
		aria-describedby={`${id}-description`}
		class="flex h-12 w-12 flex-none touch-manipulation items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-colors hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
	>
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6"
			><path d={active ? icons.pause : icons.play} /></svg
		>
	</button>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<div class="flex min-h-11 flex-wrap items-center justify-between gap-2">
			<span
				class="text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
				>{playbackLabel}</span
			>
			{#if status !== 'idle' && status !== 'complete'}
				<button
					type="button"
					aria-label="Stop article audio"
					onclick={() => stopPlayback()}
					class="min-h-11 rounded-md px-3 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none dark:text-red-400 dark:hover:bg-red-950/40"
					>Stop</button
				>
			{/if}
		</div>
		{#if engine === 'google' && manifest}
			<label class="sr-only" for={`${id}-position`}>Playback position</label>
			<input
				id={`${id}-position`}
				type="range"
				min="0"
				max={total}
				step="0.1"
				value={elapsed}
				onchange={seek}
				class="w-full accent-neutral-800 dark:accent-neutral-200"
				aria-valuetext={`${time(elapsed)} of ${time(total)}`}
			/>
			<p class="m-0 text-xs text-neutral-600 tabular-nums dark:text-neutral-400">
				{time(elapsed)} / {time(total)}
			</p>
		{:else}
			<Progress
				value={progress}
				class="h-1.5"
				role="progressbar"
				aria-label="Audio progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress)}
			/>
		{/if}
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-700 dark:text-neutral-300"
		>
			{#if manifest}
				<label class="flex flex-wrap items-center gap-2"
					>Narration source
					<select
						value={engine}
						onchange={(event) => changeEngine(event.currentTarget.value as Engine)}
						class="min-h-10 max-w-full rounded-md border-neutral-300 bg-transparent text-xs dark:border-neutral-700"
					>
						<option value="google">Google narration</option><option
							value="device"
							disabled={!supported}>Device voice</option
						>
					</select>
				</label>
			{:else}<span>{checking ? 'Checking narration…' : 'Device voice'}</span>{/if}
			<label class="flex items-center gap-2"
				>Playback speed
				<select
					value={speed}
					onchange={(event) => changeSpeed(Number(event.currentTarget.value))}
					class="min-h-10 rounded-md border-neutral-300 bg-transparent text-xs dark:border-neutral-700"
				>
					{#each [0.75, 1, 1.25, 1.5, 1.75, 2] as rate (rate)}<option value={rate}>{rate}×</option
						>{/each}
				</select>
			</label>
			{#if engine === 'device' && availableVoices.length > 0}
				<label class="flex max-w-full min-w-0 flex-wrap items-center gap-2"
					>Device voice
					<select
						value={visibleVoice}
						onchange={(event) => changeVoice(event.currentTarget.value)}
						class="min-h-10 max-w-full rounded-md border-neutral-300 bg-transparent text-xs dark:border-neutral-700"
					>
						<option value="">Automatic · US English preferred</option>
						{#each availableVoices as voice (`${voice.voiceURI}-${voice.lang}`)}<option
								value={voice.voiceURI}>{voice.name} ({voice.lang})</option
							>{/each}
					</select>
				</label>
			{/if}
		</div>
		<p
			id={`${id}-description`}
			class="m-0 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			{#if !checking && engine === 'device' && !supported}Device speech is unavailable in this
				browser. Google narration can play here when available.
			{:else if engine === 'device' && manifest}Device voice · US English preferred. Voice quality
				depends on your browser or device.
			{:else}{detail}{/if}
		</p>
		{#if engine === 'google' && status === 'error' && supported}
			<button
				type="button"
				onclick={() => {
					changeEngine('device');
					togglePlay();
				}}
				class="min-h-11 self-start rounded-md px-2 text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
				>Use device voice</button
			>
		{/if}
		<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
	</div>
</section>
