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
		src.trim() === '' ? '' : src.startsWith('/') || src.startsWith('http') ? src : `/images/${src}`
	);

	function formatAlt(filename: string) {
		const name = filename.split('/').pop() ?? filename;
		const noExt = name.split('.').slice(0, -1).join('.');
		return noExt.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}

	let finalAlt = $derived(alt ?? formatAlt(src));
	let containerStyle = $derived(`width: ${size * 100}%;`);

	let figureClasses = $derived.by(() => {
		let classes = 'post-image relative';
		if (layout === 'iL') return `${classes} float-left mr-6 mb-4 clear-left`;
		if (layout === 'iR') return `${classes} float-right ml-6 mb-4 clear-right`;
		return `${classes} block mx-auto my-8`;
	});

	let imgClasses = $derived('h-auto w-full rounded-lg shadow-md');
</script>

<figure class={figureClasses} style={containerStyle}>
	{#if fullSrc}
		<img src={fullSrc} alt={finalAlt} loading="lazy" decoding="async" class={imgClasses} />
	{:else}
		<div
			class="image-placeholder grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100 p-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-950"
			role="img"
			aria-label={finalAlt || 'Image placeholder'}
		>
			<div>
				<span
					class="mb-2 block text-xs font-bold tracking-[0.18em] text-cyan-700 uppercase dark:text-cyan-300"
					>Interactive article</span
				>
				<strong class="block text-xl text-neutral-900 dark:text-white">Image coming soon</strong>
			</div>
		</div>
	{/if}
	{#if caption}
		<figcaption
			class="mt-2 text-center text-sm leading-tight text-neutral-600 italic dark:text-neutral-400"
		>
			{caption}
		</figcaption>
	{/if}
</figure>

<style>
	.image-placeholder {
		background-image:
			linear-gradient(rgba(8, 145, 178, 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgba(8, 145, 178, 0.1) 1px, transparent 1px),
			radial-gradient(circle at 50% 55%, rgba(192, 38, 211, 0.14), transparent 48%);
		background-size:
			2rem 2rem,
			2rem 2rem,
			auto;
	}
</style>
