<script lang="ts">
	type Props = {
		title?: string;
		message?: string;
		poster: string;
		posterAlt: string;
	};

	let {
		title = 'Interactive view unavailable',
		message = 'This browser could not create a WebGL drawing surface. The static image preserves the result.',
		poster,
		posterAlt
	}: Props = $props();
</script>

<div class="relative min-h-56 overflow-hidden bg-neutral-950 text-white" role="status">
	<img
		src={poster}
		alt={posterAlt}
		class="h-full min-h-56 w-full object-cover opacity-75"
		loading="lazy"
	/>
	<div
		class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent p-5 pt-16 sm:p-6 sm:pt-20"
	>
		<p class="!mb-1 !text-left text-base font-bold !text-white">{title}</p>
		<p class="!mb-0 max-w-2xl !text-left text-sm leading-relaxed !text-neutral-200">{message}</p>
	</div>
</div>
