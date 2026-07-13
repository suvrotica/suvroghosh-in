<script lang="ts">
	import { onMount } from 'svelte';
	import { Progress } from '$lib/components/ui/progress';

	const MAX_CHUNK_LENGTH = 180;
	const CHUNK_STALL_TIMEOUT_MS = 40_000;

	let speaking = $state(false);
	let paused = $state(false);
	let needsRecovery = $state(false);
	let finished = $state(false);
	let supported = $state(false);
	let capabilityChecked = $state(false);
	let chunks: string[] = $state([]);
	let currentChunkIndex = $state(0);
	let currentChunkOffset = 0;
	let voices: SpeechSynthesisVoice[] = [];
	let utterance: SpeechSynthesisUtterance | null = null;
	let nextTimer: ReturnType<typeof setTimeout> | undefined;
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	let stallTimer: ReturnType<typeof setTimeout> | undefined;
	let announcement = $state('');

	const icons = {
		play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
		pause:
			'M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z'
	};

	let progressPct = $derived.by(() => {
		if (finished) return 100;
		if (chunks.length === 0 || (!speaking && !paused)) return 0;
		return Math.min(100, Math.max(1, Math.round(((currentChunkIndex + 1) / chunks.length) * 100)));
	});

	let playbackLabel = $derived.by(() => {
		if (finished) return 'Audio complete';
		if (needsRecovery)
			return `Playback interrupted at part ${currentChunkIndex + 1} of ${chunks.length}`;
		if (paused) return `Paused at part ${currentChunkIndex + 1} of ${chunks.length}`;
		if (speaking) return `Reading part ${currentChunkIndex + 1} of ${chunks.length}`;
		return 'Audio article';
	});

	let playButtonLabel = $derived.by(() => {
		if (needsRecovery) return 'Continue article audio from interruption';
		if (paused) return 'Resume article audio';
		if (speaking) return 'Pause article audio';
		if (finished) return 'Listen to article again';
		return 'Listen to article';
	});

	onMount(() => {
		supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
		capabilityChecked = true;

		if (!supported) return;

		const updateVoices = () => {
			voices = window.speechSynthesis.getVoices();
		};

		updateVoices();
		window.speechSynthesis.addEventListener('voiceschanged', updateVoices);

		return () => {
			window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
			resetPlayback();
		};
	});

	function getText() {
		const articleBody = document.querySelector<HTMLElement>('.prose');
		if (!articleBody) return '';

		const clone = articleBody.cloneNode(true) as HTMLElement;
		clone
			.querySelectorAll(
				[
					'[data-tts-exclude]',
					'.no-read',
					'button',
					'nav',
					'aside',
					'audio',
					'video',
					'iframe',
					'script',
					'style',
					'noscript',
					'pre',
					'code',
					'kbd',
					'samp',
					'svg'
				].join(', ')
			)
			.forEach((element) => element.remove());

		return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
	}

	function splitIntoChunks(text: string) {
		const language = document.documentElement.lang || 'en';
		let sentences: string[];

		if (typeof Intl.Segmenter === 'function') {
			const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
			sentences = Array.from(segmenter.segment(text), ({ segment }) => segment.trim());
		} else {
			sentences = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map((sentence) =>
				sentence.trim()
			);
		}

		return sentences.flatMap(splitLongChunk).filter(Boolean);
	}

	function splitLongChunk(text: string) {
		const parts: string[] = [];
		let remaining = text.trim();

		while (remaining.length > MAX_CHUNK_LENGTH) {
			const candidate = remaining.slice(0, MAX_CHUNK_LENGTH + 1);
			const breakAt = Math.max(
				candidate.lastIndexOf(', '),
				candidate.lastIndexOf('; '),
				candidate.lastIndexOf(' ')
			);
			const splitAt = breakAt >= MAX_CHUNK_LENGTH * 0.6 ? breakAt + 1 : MAX_CHUNK_LENGTH;

			parts.push(remaining.slice(0, splitAt).trim());
			remaining = remaining.slice(splitAt).trim();
		}

		if (remaining) parts.push(remaining);
		return parts;
	}

	function preferredVoice() {
		const pageLanguage = document.documentElement.lang || 'en';
		const preferences = pageLanguage.includes('-')
			? [pageLanguage, 'en-IN', 'en-GB', 'en-US']
			: ['en-IN', 'en-GB', 'en-US', pageLanguage];

		for (const language of preferences) {
			const match = voices.find(
				(voice) => voice.lang.toLocaleLowerCase('en') === language.toLocaleLowerCase('en')
			);
			if (match) return match;
		}

		return voices.find((voice) => voice.lang.toLocaleLowerCase('en').startsWith('en')) ?? null;
	}

	function speakNextChunk() {
		nextTimer = undefined;
		if (!speaking || paused) return;
		if (currentChunkIndex >= chunks.length) {
			finishPlayback();
			return;
		}

		const sourceChunk = chunks[currentChunkIndex];
		if (currentChunkOffset >= sourceChunk.length) {
			currentChunkIndex += 1;
			currentChunkOffset = 0;
			speakNextChunk();
			return;
		}

		const chunkStartOffset = currentChunkOffset;
		const chunkText = sourceChunk.slice(chunkStartOffset);
		const nextUtterance = new SpeechSynthesisUtterance(chunkText);
		const voice = preferredVoice();

		if (voice) nextUtterance.voice = voice;
		nextUtterance.lang = voice?.lang ?? document.documentElement.lang ?? 'en';
		nextUtterance.rate = 1;
		nextUtterance.onboundary = (event) => {
			if (utterance !== nextUtterance || !Number.isFinite(event.charIndex)) return;

			currentChunkOffset = Math.min(
				sourceChunk.length,
				Math.max(currentChunkOffset, chunkStartOffset + event.charIndex)
			);
			armStallTimer(nextUtterance);
		};

		nextUtterance.onend = () => {
			clearStallTimer();
			if (utterance !== nextUtterance) return;
			utterance = null;
			if (!speaking || paused) return;
			currentChunkIndex += 1;
			currentChunkOffset = 0;
			scheduleNextChunk();
		};

		nextUtterance.onerror = (event: SpeechSynthesisErrorEvent) => {
			clearStallTimer();
			if (utterance !== nextUtterance) return;
			utterance = null;
			if (!speaking) return;

			if (Number.isFinite(event.charIndex)) {
				currentChunkOffset = Math.min(
					sourceChunk.length,
					Math.max(currentChunkOffset, chunkStartOffset + event.charIndex)
				);
			}
			paused = true;
			needsRecovery = true;
			announcement = 'Audio was interrupted. Press Play to continue from where it stopped.';
		};

		utterance = nextUtterance;
		window.speechSynthesis.speak(nextUtterance);
		armStallTimer(nextUtterance);
	}

	function togglePlay() {
		if (!supported) return;

		if (speaking && !paused) {
			if (!utterance || !window.speechSynthesis.speaking) {
				restartCurrentChunk();
				return;
			}

			window.speechSynthesis.pause();
			clearStallTimer();
			paused = true;
			needsRecovery = false;
			announcement = 'Audio paused.';
			return;
		}

		if (speaking && paused) {
			if (utterance && window.speechSynthesis.paused && !needsRecovery) {
				window.speechSynthesis.resume();
				paused = false;
				armStallTimer(utterance);
				announcement = 'Audio resumed.';
			} else {
				restartCurrentChunk();
			}
			return;
		}

		resetPlayback();
		const text = getText();
		if (!text) {
			announcement = 'No readable article text was found.';
			return;
		}

		chunks = splitIntoChunks(text);
		currentChunkIndex = 0;
		currentChunkOffset = 0;
		speaking = true;
		needsRecovery = false;
		announcement = 'Audio playback started.';
		scheduleNextChunk();
	}

	function restartCurrentChunk() {
		clearStallTimer();
		clearNextTimer();
		detachUtterance();
		window.speechSynthesis.cancel();
		utterance = null;
		paused = false;
		needsRecovery = false;
		speaking = true;
		announcement = 'Audio resumed from where it stopped.';
		scheduleNextChunk(100);
	}

	function scheduleNextChunk(delay = 50) {
		clearNextTimer();
		nextTimer = setTimeout(speakNextChunk, delay);
	}

	function armStallTimer(activeUtterance: SpeechSynthesisUtterance) {
		clearStallTimer();
		stallTimer = setTimeout(() => {
			if (utterance !== activeUtterance || !speaking || paused) return;

			detachUtterance();
			window.speechSynthesis.cancel();
			utterance = null;
			paused = true;
			needsRecovery = true;
			announcement = 'Audio timed out. Press Play to continue from where it stopped.';
		}, CHUNK_STALL_TIMEOUT_MS);
	}

	function stopPlayback() {
		resetPlayback();
		announcement = 'Audio stopped.';
	}

	function finishPlayback() {
		clearTimers();
		utterance = null;
		speaking = false;
		paused = false;
		needsRecovery = false;
		finished = true;
		currentChunkIndex = chunks.length;
		currentChunkOffset = 0;
		announcement = 'Audio playback finished.';
		resetTimer = setTimeout(() => {
			finished = false;
			chunks = [];
			currentChunkIndex = 0;
			currentChunkOffset = 0;
		}, 4000);
	}

	function resetPlayback() {
		clearTimers();
		detachUtterance();
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
		}
		utterance = null;
		speaking = false;
		paused = false;
		needsRecovery = false;
		finished = false;
		chunks = [];
		currentChunkIndex = 0;
		currentChunkOffset = 0;
	}

	function detachUtterance() {
		if (!utterance) return;
		utterance.onboundary = null;
		utterance.onend = null;
		utterance.onerror = null;
	}

	function clearNextTimer() {
		if (nextTimer) clearTimeout(nextTimer);
		nextTimer = undefined;
	}

	function clearStallTimer() {
		if (stallTimer) clearTimeout(stallTimer);
		stallTimer = undefined;
	}

	function clearTimers() {
		clearNextTimer();
		clearStallTimer();
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = undefined;
	}
</script>

{#if !capabilityChecked || supported}
	<section
		data-tts-exclude
		aria-label="Audio article"
		class="not-prose my-8 flex items-center gap-4 rounded-xl border border-neutral-200 bg-white/50 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/50 print:hidden"
	>
		<button
			type="button"
			onclick={togglePlay}
			disabled={!supported}
			aria-label={playButtonLabel}
			aria-describedby="audio-article-description"
			class="flex h-12 w-12 flex-none touch-manipulation items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-colors hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
		>
			<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
				{#if speaking && !paused}
					<path d={icons.pause} />
				{:else}
					<path d={icons.play} />
				{/if}
			</svg>
		</button>

		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<div class="flex min-h-11 items-center justify-between gap-3">
				<span
					class="text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
				>
					{playbackLabel}
				</span>
				{#if speaking}
					<button
						type="button"
						onclick={stopPlayback}
						class="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold tracking-wider text-red-600 uppercase transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 dark:focus-visible:ring-red-400 dark:focus-visible:ring-offset-neutral-950"
					>
						Stop
					</button>
				{/if}
			</div>

			<Progress
				value={progressPct}
				class="h-1.5"
				role="progressbar"
				aria-label="Audio progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={progressPct}
			/>
			<p id="audio-article-description" class="m-0 text-xs text-neutral-500 dark:text-neutral-500">
				Uses the speech voice supplied by your browser or device.
			</p>
		</div>

		<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{announcement}
		</span>
	</section>
{/if}
