<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let {
		src,
		title = 'Embedded YouTube video',
		caption = '',
		aspectRatio = '16/9'
	}: {
		src: string;
		title?: string;
		caption?: string;
		aspectRatio?: '16/9' | '4/3' | '1/1';
	} = $props();

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
			<iframe
				class="absolute top-0 left-0 h-full w-full"
				src={embedSrc}
				{title}
				frameborder="0"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				allowfullscreen
				referrerpolicy="strict-origin-when-cross-origin"
			></iframe>
		</div>
		{#if caption || playlistId}
			<figcaption
				class="mt-2 text-center text-sm leading-tight text-neutral-600 italic dark:text-neutral-400"
			>
				{caption}
				{#if playlistId}
					<br />
					<a
						href={src}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-sky-600 hover:underline dark:text-sky-400"
					>
						(Open Playlist on YouTube)
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
