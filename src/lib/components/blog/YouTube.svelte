<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

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
	let player: HTMLIFrameElement | undefined = $state();

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
			{#if clickToPlay && !activated}
				<button
					type="button"
					class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-neutral-100 p-6 text-center text-neutral-900 transition-colors hover:bg-neutral-200 focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-sky-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:outline-sky-400"
					aria-label={`Load YouTube video: ${title}`}
					onclick={activatePlayer}
				>
					<svg aria-hidden="true" viewBox="0 0 48 48" class="h-12 w-12" fill="currentColor">
						<path d="M17 10v28l23-14z" />
					</svg>
					<span class="font-semibold">{title}</span>
					<span class="text-sm">Load YouTube video</span>
				</button>
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
		{#if caption || playlistId || clickToPlay}
			<figcaption
				class="mt-2 text-center text-sm leading-tight text-neutral-600 italic dark:text-neutral-400"
			>
				{caption}
				{#if playlistId || clickToPlay}
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
