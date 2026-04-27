<script lang="ts">
	let {
		src,
		caption = '',
		layout = 'block',
		size = 1,
		autoplay = false,
		loop = false,
		muted = false,
		poster = ''
	}: {
		src: string;
		caption?: string;
		layout?: 'block' | 'iL' | 'iR';
		size?: number;
		autoplay?: boolean;
		loop?: boolean;
		muted?: boolean;
		poster?: string;
	} = $props();

	// Defaults to looking in the /videos/ directory of your `static` folder 
	// unless a full HTTP/HTTPS url or explicit root path is provided.
	let fullSrc = $derived(
		src.startsWith('/') || src.startsWith('http') ? src : `/videos/${src}`
	);

	let fullPoster = $derived(
		poster ? (poster.startsWith('/') || poster.startsWith('http') ? poster : `/images/${poster}`) : undefined
	);

	let containerStyle = $derived(`width: ${size * 100}%; max-width: 100%;`);

	// Utilize the same floating layout logic derived from PostImage.svelte
	let figureClasses = $derived.by(() => {
		let classes = "post-video relative clear-both not-prose";
		if (layout === 'iL') return `${classes} float-left mr-6 mb-4 max-w-[100%] md:max-w-[50%]`;
		if (layout === 'iR') return `${classes} float-right ml-6 mb-4 max-w-[100%] md:max-w-[50%]`;
		return `${classes} block mx-auto my-8`;
	});

	let videoClasses = $derived("h-auto w-full rounded-lg shadow-md border border-neutral-200 dark:border-neutral-800 bg-black object-cover");
</script>

<figure class={figureClasses} style={containerStyle}>
	<video 
		src={fullSrc} 
		poster={fullPoster}
		controls 
		{autoplay}
		{loop}
		{muted}
		playsinline
		preload="metadata"
		class={videoClasses}
	></video>
	
	{#if caption}
		<figcaption class="mt-2 text-sm italic text-neutral-600 dark:text-neutral-400 text-center leading-tight">
			{caption}
		</figcaption>
	{/if}
</figure>
