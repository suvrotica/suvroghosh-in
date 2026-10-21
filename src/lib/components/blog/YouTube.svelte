<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { initializeConsent, subscribeConsent, openPrivacySettings } from '../../privacy/consent';

	let {
		src,
		title = 'Embedded YouTube video',
		caption = '',
		aspectRatio = '16/9',
		clickToPlay = false
	}: {
		src: string;
		title?: string;
		caption?: string;
		aspectRatio?: '16/9' | '4/3' | '1/1';
		clickToPlay?: boolean;
	} = $props();

	let activated = $state(false);
	let mediaAllowed = $state(false);
	let player: HTMLIFrameElement | undefined = $state();
	let canLoad = $derived(activated || (mediaAllowed && !clickToPlay));

	onMount(() => {
		const dispose = initializeConsent();
		const unsubscribe = subscribeConsent((record) => {
			mediaAllowed = record?.media === true;
			// A new rejection or expiry also ends any one-video activation.
			if (!mediaAllowed) activated = false;
		});
		return () => {
			unsubscribe();
			dispose();
		};
	});

	async function activatePlayer() {
		activated = true;
		await tick();
		player?.focus();
	}

	function parseYouTubeId(url: string): string | null {
		const regex =
			/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
		const match = url.match(regex);
		return match ? match[1] : null;
	}

	function parseYouTubePlaylistId(url: string): string | null {
		const regex = /[?&]list=([^"&?/\s]+)/;
		const match = url.match(regex);
		return match ? match[1] : null;
	}

	let playlistId = $derived(parseYouTubePlaylistId(src));

	let embedSrc = $derived.by(() => {
		const videoId = parseYouTubeId(src);
		const baseUrl = 'https://www.youtube.com/embed/';

		const params = new SvelteURLSearchParams({
			playsinline: '1',
			controls: '1',
			fs: '1',
			rel: '0'
		});

		if (playlistId) {
			params.set('list', playlistId);
			if (videoId) {
				return `${baseUrl}${videoId}?${params.toString()}`;
			} else {
				return `${baseUrl}videoseries?${params.toString()}`;
			}
		} else if (videoId) {
			return `${baseUrl}${videoId}?${params.toString()}`;
		}

		return null;
	});
</script>

{#if embedSrc}
	<figure class="not-prose clear-both mx-auto my-8 block w-full">
		<div
			class="relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
			style:aspect-ratio={aspectRatio}
		>
			{#if !canLoad}
				<div class="video-placeholder">
					<span class="video-entry">EXTERNAL MEDIA / YOUTUBE</span>
					<svg aria-hidden="true" viewBox="0 0 48 48" fill="none"
						><circle cx="24" cy="24" r="22" /><path d="m20 16 12 8-12 8V16Z" /></svg
					>
					<strong>{title}</strong>
					<p>Loading connects to YouTube, which may use cookies and receive your IP address.</p>
					<div class="video-actions">
						<button
							type="button"
							class="video-load"
							aria-label={`Load YouTube video: ${title}`}
							onclick={activatePlayer}
							>Load this video once <span aria-hidden="true">↗</span></button
						><button type="button" class="video-settings" onclick={openPrivacySettings}
							>Remember media permission</button
						>
					</div>
				</div>
			{:else}
				<iframe
					bind:this={player}
					class="absolute top-0 left-0 h-full w-full"
					src={embedSrc}
					{title}
					frameborder="0"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowfullscreen
					referrerpolicy="strict-origin-when-cross-origin"
				></iframe>
			{/if}
		</div>
		{#if caption || src}
			<figcaption
				class="mt-2 text-center text-sm leading-tight text-neutral-600 italic dark:text-neutral-400"
			>
				{caption}
				{#if src}
					<br />
					<a
						href={src}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-sky-600 hover:underline dark:text-sky-400"
					>
						{playlistId ? '(Open Playlist on YouTube)' : '(Watch on YouTube)'}
					</a>
				{/if}
			</figcaption>
		{/if}
	</figure>
{:else}
	<div
		class="my-6 rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400"
	>
		<p>Invalid YouTube URL provided: {src}</p>
	</div>
{/if}

<style>
	.video-placeholder {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: clamp(0.8rem, 3vw, 2rem);
		background: var(--paper-soft);
		color: var(--ink);
		text-align: center;
	}
	.video-entry {
		font: 0.55rem/1.5 var(--font-mono, monospace);
		letter-spacing: 0.16em;
		color: var(--ink-faint);
	}
	.video-placeholder > svg {
		width: 2.8rem;
		height: 2.8rem;
		margin: 0.7rem 0;
		stroke: var(--accent);
		stroke-width: 1.2;
	}
	.video-placeholder > strong {
		max-width: 32rem;
		font: 550 clamp(1rem, 2.7vw, 1.6rem)/1.2 var(--font-serif, serif);
	}
	.video-placeholder p {
		margin: 0.55rem auto 0.9rem;
		max-width: 25rem;
		text-align: center;
		font: 0.73rem/1.5 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}
	.video-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem 1rem;
	}
	.video-actions button {
		min-height: 44px;
		font: 600 0.7rem/1.4 var(--font-sans, sans-serif);
		cursor: pointer;
	}
	.video-load {
		padding: 0.6rem 0.9rem;
		background: var(--ink);
		color: var(--paper-raised);
		border: 1px solid var(--ink);
	}
	.video-load span {
		margin-left: 0.8rem;
	}
	.video-settings {
		color: var(--ink-muted);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.video-actions button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 3px;
	}
	@media (max-width: 420px) {
		.video-placeholder > svg {
			display: none;
		}
		.video-entry {
			margin-bottom: 0.6rem;
			font-size: 0.48rem;
		}
		.video-placeholder p {
			margin: 0.4rem auto 0.5rem;
			font-size: 0.65rem;
		}
		.video-actions {
			gap: 0;
		}
	}
</style>
