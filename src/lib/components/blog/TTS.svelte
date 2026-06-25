<script lang="ts">
	import { onMount } from 'svelte';
	import { Progress } from '$lib/components/ui/progress';

	let speaking = $state(false);
	let paused = $state(false);
	let supported = $state(false);
	let buffering = $state(false);
	let chunks: string[] = $state([]);
	let currentChunkIndex = $state(0);
	let currentUtterance: SpeechSynthesisUtterance | null = null;

	const icons = {
		play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
		pause:
			'M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z'
	};

	let progressPct = $derived(
		chunks.length > 0 ? Math.min(100, Math.round((currentChunkIndex / chunks.length) * 100)) : 0
	);

	onMount(() => {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			supported = true;
			window.speechSynthesis.getVoices();
			window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
		}
		return () => cancel();
	});

	function getText(): string {
		const article =
			document.querySelector('article') || document.querySelector('.prose') || document.body;
		const clone = article.cloneNode(true) as HTMLElement;
		const self = clone.querySelector('[data-tts-exclude]');
		if (self) self.remove();
		clone.querySelectorAll('button, script, style, .no-read').forEach((el: Element) => el.remove());
		return clone.innerText || '';
	}

	function splitIntoChunks(text: string): string[] {
		const rawChunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
		return rawChunks.map((c: string) => c.trim()).filter((c: string) => c.length > 0);
	}

	function speakNextChunk() {
		if (currentChunkIndex >= chunks.length) {
			speaking = false;
			paused = false;
			currentChunkIndex = 0;
			return;
		}

		const chunkText = chunks[currentChunkIndex];
		const utt = new SpeechSynthesisUtterance(chunkText);
		currentUtterance = utt;

		const voices = window.speechSynthesis.getVoices();
		const voice =
			voices.find((v) => v.name.includes('Google US English')) ||
			voices.find((v) => v.lang === 'en-US') ||
			null;

		if (voice) utt.voice = voice;
		utt.rate = 1.0;

		utt.onstart = () => {
			buffering = false;
		};
		utt.onend = () => {
			if (speaking && !paused) {
				currentChunkIndex++;
				speakNextChunk();
			}
		};
		utt.onerror = (e: SpeechSynthesisErrorEvent) => {
			if (e.error === 'interrupted') return;
			currentChunkIndex++;
			setTimeout(speakNextChunk, 100);
		};

		window.speechSynthesis.speak(utt);
	}

	function togglePlay() {
		if (!supported) return;
		if (speaking && !paused) {
			window.speechSynthesis.cancel();
			paused = true;
			return;
		}
		if (paused) {
			paused = false;
			speaking = true;
			speakNextChunk();
			return;
		}

		window.speechSynthesis.cancel();
		const text = getText();
		if (!text.trim()) return;

		chunks = splitIntoChunks(text);
		currentChunkIndex = 0;
		speaking = true;
		paused = false;
		buffering = true;
		setTimeout(speakNextChunk, 50);
	}

	function cancel() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
			speaking = false;
			paused = false;
			buffering = false;
			currentChunkIndex = 0;
		}
	}
</script>

{#if supported}
	<div
		data-tts-exclude
		class="not-prose my-8 flex items-center gap-4 rounded-xl border border-neutral-200 bg-white/50 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/50"
	>
		<button
			onclick={togglePlay}
			class="flex h-12 w-12 flex-none touch-manipulation items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-all hover:scale-105 active:scale-95 dark:bg-white dark:text-neutral-900"
			aria-label={speaking && !paused ? 'Pause' : 'Listen to post'}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="currentColor"
				class="h-6 w-6"
			>
				{#if speaking && !paused}
					<path d={icons.pause} />
				{:else}
					<path d={icons.play} />
				{/if}
			</svg>
		</button>

		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<span
					class="text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
				>
					{#if speaking && !paused}
						Reading chunk {currentChunkIndex + 1} of {chunks.length}
					{:else if paused}
						Paused
					{:else}
						Audio Article
					{/if}
				</span>
				{#if speaking || paused}
					<button
						onclick={cancel}
						class="p-2 text-xs font-medium tracking-wider text-red-500 uppercase transition-colors hover:text-red-600"
					>
						Stop
					</button>
				{/if}
			</div>

			<Progress value={progressPct} class="h-1.5" />
		</div>
	</div>
{/if}
