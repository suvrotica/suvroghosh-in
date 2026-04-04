<script lang="ts">
	let {
		src,
		alt,
		caption = '',
		layout = 'block',
		size = 1
	}: {
		src: string;
		alt?: string;
		caption?: string;
		layout?: 'block' | 'iL' | 'iR';
		size?: number;
	} = $props();

	let fullSrc = $derived(
		src.startsWith('/') || src.startsWith('http') ? src : `/images/${src}`
	);

	function formatAlt(filename: string) {
		const name = filename.split('/').pop() ?? filename;
		const noExt = name.split('.').slice(0, -1).join('.');
		return noExt.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}

	let finalAlt = $derived(alt ?? formatAlt(src));
	let containerStyle = $derived(`width: ${size * 100}%;`);

	let figureClasses = $derived.by(() => {
		let classes = "post-image relative";
		if (layout === 'iL') return `${classes} float-left mr-6 mb-4 clear-left`;
		if (layout === 'iR') return `${classes} float-right ml-6 mb-4 clear-right`;
		return `${classes} block mx-auto my-8`;
	});

	let imgClasses = $derived("h-auto w-full rounded-lg shadow-md");
</script>

<figure class={figureClasses} style={containerStyle}>
	<img src={fullSrc} alt={finalAlt} loading="lazy" decoding="async" class={imgClasses} />
	{#if caption}
		<figcaption class="mt-2 text-sm italic text-neutral-600 dark:text-neutral-400 text-center leading-tight">
			{caption}
		</figcaption>
	{/if}
</figure>