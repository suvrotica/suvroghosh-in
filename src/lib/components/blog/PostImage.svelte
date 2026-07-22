<script lang="ts">
	import { dev } from '$app/environment';

	const RESPONSIVE_WIDTHS = [320, 480, 640, 768, 960, 1200, 1600, 1920] as const;

	let {
		src,
		alt,
		caption = '',
		layout = 'block',
		size = 1,
		width,
		height,
		sizes,
		loading = 'lazy',
		fetchpriority = 'auto'
	}: {
		src: string;
		alt?: string;
		caption?: string;
		layout?: 'block' | 'iL' | 'iR';
		size?: number;
		width?: number;
		height?: number;
		sizes?: string;
		loading?: 'eager' | 'lazy';
		fetchpriority?: 'high' | 'low' | 'auto';
	} = $props();

	let optimizerFailed = $state(false);

	let fullSrc = $derived(
		src.trim() === '' ? '' : src.startsWith('/') || src.startsWith('http') ? src : `/images/${src}`
	);

	// An absent authored alternative is decorative. A filename is not a meaningful description.
	let finalAlt = $derived(alt ?? '');
	let containerStyle = $derived(`width: ${size * 100}%;`);
	let sizeRatio = $derived(Math.min(1, Math.max(0.05, Number.isFinite(size) ? size : 1)));
	let responsiveSizes = $derived(
		sizes ??
			`(max-width: 48rem) calc(${Math.round(sizeRatio * 100)}vw - ${Math.round(sizeRatio * 32)}px), ${Math.round(sizeRatio * 650)}px`
	);
	let responsiveSrcset = $derived.by(() => {
		if (
			dev ||
			optimizerFailed ||
			!Number.isInteger(width) ||
			(width ?? 0) <= 0 ||
			!/^\/(?:images|photos|thumbnail)\/.+\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(fullSrc)
		) {
			return '';
		}

		return RESPONSIVE_WIDTHS.filter((candidate) => candidate <= (width ?? 0))
			.map(
				(candidate) =>
					`/_vercel/image?url=${encodeURIComponent(fullSrc)}&w=${candidate}&q=82 ${candidate}w`
			)
			.join(', ');
	});

	let figureClasses = $derived.by(() => {
		let classes = 'post-image relative';
		if (layout === 'iL') return `${classes} float-left mr-6 mb-4 clear-left`;
		if (layout === 'iR') return `${classes} float-right ml-6 mb-4 clear-right`;
		return `${classes} block mx-auto my-8`;
	});

	let imgClasses = $derived('h-auto w-full rounded-lg shadow-md');

	function useOriginalImage(event: Event) {
		const image = event.currentTarget as HTMLImageElement;
		if (optimizerFailed || !responsiveSrcset) return;

		optimizerFailed = true;
		image.src = fullSrc;
	}
</script>

<figure class={figureClasses} style={containerStyle}>
	{#if fullSrc}
		<picture class="block w-full">
			{#if responsiveSrcset}
				<source
					data-responsive-image
					type="image/webp"
					srcset={responsiveSrcset}
					sizes={responsiveSizes}
				/>
			{/if}
			<img
				src={fullSrc}
				data-original-src={fullSrc}
				alt={finalAlt}
				{width}
				{height}
				{loading}
				{fetchpriority}
				decoding="async"
				class={imgClasses}
				onerror={useOriginalImage}
			/>
		</picture>
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
