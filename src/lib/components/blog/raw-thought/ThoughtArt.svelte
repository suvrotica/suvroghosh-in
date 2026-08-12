<script lang="ts">
	let {
		src,
		alt,
		caption,
		width,
		height,
		ratio = 'landscape',
		position = 'center'
	}: {
		src: string;
		alt: string;
		caption?: string;
		width: number;
		height: number;
		ratio?: 'portrait' | 'landscape' | 'wide';
		position?: string;
	} = $props();
</script>

<figure class="thought-art" data-ratio={ratio}>
	<img
		{src}
		{alt}
		{width}
		{height}
		loading="lazy"
		decoding="async"
		style:object-position={position}
	/>
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>
