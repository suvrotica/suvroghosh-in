<script lang="ts">
	import { dev } from '$app/environment';
	import { getContext } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import {
		THOUGHT_FOLIO_CONTEXT,
		type ThoughtFolioArt,
		type ThoughtFolioContext
	} from './thought-folio-context';

	const RESPONSIVE_WIDTHS = [320, 480, 640, 768, 960, 1200, 1600, 1920] as const;

	let {
		id,
		src,
		alt,
		caption,
		width,
		height,
		ratio,
		position,
		fit,
		sizes,
		priority = false
	}: {
		id?: string;
		src?: string;
		alt?: string;
		caption?: string;
		width?: number;
		height?: number;
		ratio?: 'portrait' | 'landscape' | 'wide';
		position?: string;
		fit?: 'cover' | 'contain';
		sizes?: string;
		priority?: boolean;
	} = $props();

	const context = getContext<ThoughtFolioContext | undefined>(THOUGHT_FOLIO_CONTEXT);
	let optimizerFailed = $state(false);

	let art = $derived.by<ThoughtFolioArt>(() => {
		const manifestArt = id ? context?.manifest.art?.[id] : undefined;
		const resolved = {
			src: src ?? manifestArt?.src ?? '',
			alt: alt ?? manifestArt?.alt ?? '',
			caption: caption ?? manifestArt?.caption,
			width: width ?? manifestArt?.width ?? 0,
			height: height ?? manifestArt?.height ?? 0,
			ratio: ratio ?? manifestArt?.ratio ?? 'landscape',
			position: position ?? manifestArt?.position ?? 'center',
			fit: fit ?? manifestArt?.fit ?? 'cover',
			sizes: sizes ?? manifestArt?.sizes,
			priority: priority || manifestArt?.priority === true
		};

		if (!resolved.src || !resolved.width || !resolved.height) {
			throw new Error(`Incomplete thought-folio art definition${id ? `: ${id}` : ''}`);
		}
		return resolved;
	});

	let responsiveSizes = $derived(
		art.sizes ??
			'(orientation: portrait) calc(100vw - 2rem), (max-width: 59.99rem) calc(100vw - 2rem), min(calc((100vw - 4.5rem) / 2), 46rem)'
	);
	let responsiveSrcset = $derived.by(() => {
		if (
			dev ||
			optimizerFailed ||
			!/^\/(?:images|photos|thumbnail)\/.+\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(art.src)
		) {
			return '';
		}

		return RESPONSIVE_WIDTHS.filter((candidate) => candidate <= art.width)
			.map(
				(candidate) =>
					`/_vercel/image?url=${encodeURIComponent(art.src)}&w=${candidate}&q=82 ${candidate}w`
			)
			.join(', ');
	});

	const useOriginalImage: Attachment<HTMLImageElement> = (image) => {
		const handleError = () => {
			if (optimizerFailed || !responsiveSrcset) return;
			optimizerFailed = true;
			image.src = art.src;
		};
		image.addEventListener('error', handleError);
		if (image.complete && image.naturalWidth === 0) handleError();
		return () => image.removeEventListener('error', handleError);
	};
</script>

<figure class="thought-art" data-ratio={art.ratio} data-art={id} data-tts-exclude>
	<picture>
		{#if responsiveSrcset}
			<source
				data-responsive-image
				type="image/webp"
				media="(scripting: enabled)"
				srcset={responsiveSrcset}
				sizes={responsiveSizes}
			/>
		{/if}
		<img
			src={art.src}
			data-original-src={art.src}
			alt={art.alt}
			width={art.width}
			height={art.height}
			sizes={responsiveSizes}
			loading={art.priority ? 'eager' : 'lazy'}
			fetchpriority={art.priority ? 'high' : 'auto'}
			decoding="async"
			style:object-position={art.position}
			style:object-fit={art.fit}
			{@attach useOriginalImage}
		/>
	</picture>
	{#if art.caption}<figcaption>{art.caption}</figcaption>{/if}
</figure>
