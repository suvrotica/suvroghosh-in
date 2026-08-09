<script lang="ts">
	import { onMount } from 'svelte';
	import {
		PORTRAIT_DURATION_SECONDS,
		startPortraitComposition
	} from '$lib/visualizations/strange-attractor-orchestra/audio/portrait';
	import PortraitListeningMode from './PortraitListeningMode.svelte';

	type Eligibility = 'loading' | 'desktop' | 'portrait' | 'save-data' | 'failure';
	type ExperienceComponent = typeof import('./ExperienceShell.svelte').default;

	let root!: HTMLElement;
	let eligibility: Eligibility = $state('loading');
	let Experience: ExperienceComponent | null = $state(null);
	let status = $state('Inspecting this screen before loading the instrument.');
	let portraitPlaying = $state(false);
	let portraitLoading = $state(false);
	let resizeFrame = 0;
	let portraitStopTimer = 0;
	let portraitCaptionTimer = 0;
	let portraitRequest = 0;

	function isWideInstrumentViewport(): boolean {
		return (
			window.innerWidth >= 900 &&
			window.innerHeight >= 600 &&
			window.innerWidth / window.innerHeight >= 4 / 3
		);
	}

	function saveDataEnabled(): boolean {
		return (
			(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
			true
		);
	}

	function stopPortrait(message: string): void {
		portraitRequest += 1;
		if (portraitStopTimer) window.clearTimeout(portraitStopTimer);
		if (portraitCaptionTimer) window.clearInterval(portraitCaptionTimer);
		portraitStopTimer = 0;
		portraitCaptionTimer = 0;
		if (portraitPlaying || portraitLoading)
			window.dispatchEvent(new CustomEvent('sa:portrait-stop'));
		portraitPlaying = false;
		portraitLoading = false;
		status = message;
	}

	async function assess(): Promise<void> {
		if (saveDataEnabled()) {
			if (eligibility === 'save-data') return;
			stopPortrait('Data Saver kept the desktop renderer closed.');
			eligibility = 'save-data';
			return;
		}
		if (!isWideInstrumentViewport()) {
			if (eligibility === 'portrait') return;
			eligibility = 'portrait';
			status = 'Poster and listening mode is ready.';
			return;
		}
		if (eligibility === 'desktop' && Experience) return;
		stopPortrait('Loading the conducting instrument.');
		if (Experience) {
			eligibility = 'desktop';
			status = 'The conducting instrument is ready. Sound still requires an explicit choice.';
			return;
		}

		eligibility = 'loading';
		try {
			const loaded = await import('./ExperienceShell.svelte');
			Experience = loaded.default;
			eligibility = 'desktop';
			status = 'The conducting instrument is ready. Sound still requires an explicit choice.';
		} catch (error) {
			Experience = null;
			eligibility = 'failure';
			status = error instanceof Error ? error.message : 'The live instrument could not load.';
		}
	}

	async function togglePortraitAudio(
		snapshot: import('$lib/visualizations/strange-attractor-orchestra/types').OrchestraSnapshot
	): Promise<void> {
		if (portraitPlaying) {
			stopPortrait('The portrait composition is stopped.');
			return;
		}
		portraitLoading = true;
		const request = ++portraitRequest;
		status = `Preparing ${snapshot.attractorId} in ${snapshot.soundWorld}.`;
		try {
			const handle = await startPortraitComposition({
				snapshot,
				onProgress: (progress) => {
					if (request !== portraitRequest) return;
					status = `Preparing ${snapshot.attractorId} · ${progress.phase} ${Math.round(progress.progress01 * 100)}%.`;
				}
			});
			if (request !== portraitRequest) {
				void handle.stop();
				return;
			}
			portraitPlaying = true;
			let captionIndex = 0;
			const updateCaption = () => {
				const event = handle.events[captionIndex % Math.max(1, handle.events.length)];
				status = event?.explanation
					? `Composition playing · ${event.explanation}`
					: `Composition playing · ${handle.scoreHash} causal score.`;
				captionIndex += Math.max(1, Math.floor(handle.events.length / 4));
			};
			updateCaption();
			portraitCaptionTimer = window.setInterval(updateCaption, 4_000);
			portraitStopTimer = window.setTimeout(() => {
				if (portraitCaptionTimer) window.clearInterval(portraitCaptionTimer);
				portraitCaptionTimer = 0;
				portraitStopTimer = 0;
				portraitPlaying = false;
				window.dispatchEvent(new CustomEvent('sa:portrait-stop'));
				status = 'The fifteen-second portrait composition is complete.';
			}, PORTRAIT_DURATION_SECONDS * 1_000);
		} catch (error) {
			if (request !== portraitRequest) return;
			portraitPlaying = false;
			status =
				error instanceof Error
					? error.message
					: 'Audio is unavailable; the poster and essay remain usable.';
		} finally {
			if (request === portraitRequest) portraitLoading = false;
		}
	}

	onMount(() => {
		void assess();
		const handleResize = () => {
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				resizeFrame = 0;
				void assess();
			});
		};
		window.addEventListener('resize', handleResize, { passive: true });
		return () => {
			window.removeEventListener('resize', handleResize);
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			stopPortrait('The portrait composition is stopped.');
		};
	});
</script>

<h1 class="sr-only">The Strange Attractor Orchestra: When Chaos Learns to Sing</h1>

<section
	bind:this={root}
	class="orchestra-root article-breakout not-prose"
	data-testid="strange-attractor-orchestra"
	data-eligibility={eligibility}
	data-tts-exclude
	aria-label="The Strange Attractor Orchestra interactive visualization"
>
	{#if eligibility === 'desktop' && Experience}
		{@const DesktopExperience = Experience}
		<DesktopExperience />
	{:else}
		<PortraitListeningMode
			reason={eligibility === 'save-data'
				? 'save-data'
				: eligibility === 'failure'
					? 'failure'
					: eligibility === 'loading'
						? 'loading'
						: 'portrait'}
			onplay={(snapshot) => void togglePortraitAudio(snapshot)}
			playing={portraitPlaying}
			loading={portraitLoading}
			{status}
		/>
	{/if}
</section>

<style>
	:global(body:has(.orchestra-root) nav[aria-label='Breadcrumb']) {
		display: none;
	}

	.orchestra-root {
		position: relative;
		width: min(calc(100vw - 1rem), 110rem);
		margin-block: 0 clamp(2.5rem, 7vw, 6rem);
		transform: translateX(-50%);
		background: #04090b;
		color: #eee9dc;
		color-scheme: dark;
		isolation: isolate;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (max-width: 899px), (max-height: 599px), (max-aspect-ratio: 4/3) {
		.orchestra-root {
			left: auto;
			width: auto;
			margin-inline: calc(var(--article-breakout-offset, 0rem) * -1);
			transform: none;
			background: transparent;
			padding-inline: 0.25rem;
		}
	}

	@media print {
		.orchestra-root {
			width: 100%;
			background: #fff;
			color: #000;
		}
	}
</style>
