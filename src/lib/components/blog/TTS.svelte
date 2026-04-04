<script lang="ts">
	import { onMount } from 'svelte';
	
	let speaking = false;
	let paused = false;
	let supported = false;
	let buffering = false;
	let chunks: string[] = [];
	let currentChunkIndex = 0;
	let currentUtterance: SpeechSynthesisUtterance | null = null;
	let debugLog = "";
	let debugMode = true;

	function log(msg: string) {
		console.log(msg);
		if (debugMode) debugLog = msg;
	}

	const icons = {
		play: "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z",
		pause: "M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z",
	};

	onMount(() => {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			supported = true;
			window.speechSynthesis.getVoices();
			window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
		}
		return () => cancel();
	});

	function getText(): string {
		const article = document.querySelector('article') || document.querySelector('.prose') || document.body;
		// Cast the Node to an HTMLElement so TS knows it has innerText and querySelector
		const clone = article.cloneNode(true) as HTMLElement; 
		const self = clone.querySelector('[data-tts-exclude]');
		if (self) self.remove();
		clone.querySelectorAll('button, script, style, .no-read').forEach((el: Element) => el.remove());
		return clone.innerText || "";
	}

	function splitIntoChunks(text: string): string[] {
		const rawChunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
		return rawChunks.map((c: string) => c.trim()).filter((c: string) => c.length > 0);
	}

	function speakNextChunk() {
		if (currentChunkIndex >= chunks.length) {
			log("Finished all chunks");
			speaking = false;
			paused = false;
			currentChunkIndex = 0;
			return;
		}

		const chunkText = chunks[currentChunkIndex];
		const utt = new SpeechSynthesisUtterance(chunkText);
		currentUtterance = utt;
		
		const voices = window.speechSynthesis.getVoices();
		const voice = voices.find(v => v.name.includes("Google US English")) || voices.find(v => v.lang === "en-US") || null; 
		
		if (voice) utt.voice = voice;
		utt.rate = 1.0;

		utt.onstart = () => {
			buffering = false;
			log(`Speaking chunk ${currentChunkIndex + 1}/${chunks.length}`);
		};
		utt.onend = () => {
			if (speaking && !paused) {
				currentChunkIndex++;
				speakNextChunk();
			}
		};
		utt.onerror = (e: SpeechSynthesisErrorEvent) => {
			log(`Error on chunk ${currentChunkIndex}: ${e.error}`);
			if (e.error === 'interrupted') return;
			currentChunkIndex++;
			setTimeout(speakNextChunk, 100);
		};

		window.speechSynthesis.speak(utt);
	}

	function togglePlay() {
		if (!supported) return;
		if (speaking && !paused) {
			log("Pausing...");
			window.speechSynthesis.cancel();
			paused = true;
			return;
		}
		if (paused) {
			log("Resuming...");
			paused = false;
			speaking = true;
			speakNextChunk(); 
			return;
		}

		log("Starting New...");
		window.speechSynthesis.cancel();
		const text = getText();
		if (!text.trim()) {
			log("No text found");
			return;
		}

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
			log("Stopped");
		}
	}
	
	$: progressPct = chunks.length > 0 ? Math.min(100, Math.round((currentChunkIndex / chunks.length) * 100)) : 0;
</script>

{#if supported}
	<div data-tts-exclude class="my-8 flex items-center gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm not-prose shadow-sm">
		<button on:click={togglePlay} class="flex-none flex items-center justify-center w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:scale-105 active:scale-95 transition-all shadow-md touch-manipulation" aria-label={speaking && !paused ? "Pause" : "Listen to post"}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
				{#if speaking && !paused}
					<path d={icons.pause} />
				{:else}
					<path d={icons.play} />
				{/if}
			</svg>
		</button>

		<div class="flex-1 flex flex-col gap-1.5 min-w-0">
			<div class="flex justify-between items-center">
				<span class="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
					{#if speaking && !paused}
						Reading chunk {currentChunkIndex + 1} of {chunks.length}
					{:else if paused}
						Paused
					{:else}
						Audio Article
					{/if}
				</span>
				{#if speaking || paused}
					<button on:click={cancel} class="text-xs font-medium text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider p-2">
						Stop
					</button>
				{/if}
			</div>
			
			<div class="h-1.5 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
				<div class="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300 ease-linear" style="width: {progressPct}%"></div>
			</div>
		</div>
	</div>
{/if}