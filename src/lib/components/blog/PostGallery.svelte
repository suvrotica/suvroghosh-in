<script lang="ts">
	type Post = {
		slug: string;
		title: string;
		thumbnail?: string;
		category: string;
	};

	let { posts = [] }: { posts: Post[] } = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-8">
	{#each posts as post (post.slug)}
		{@const href = `/blog/${post.category}/${post.slug}`}

		<a
			{href}
			class="post-card group block overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 shadow-md no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
		>
			{#if post.thumbnail}
				<div class="relative aspect-[2/3] overflow-hidden bg-neutral-200 dark:bg-neutral-700">
					<img
						src={post.thumbnail}
						alt={post.title}
						loading="lazy"
						class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
					/>

					<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3 pt-10">
						<div class="text-white text-sm sm:text-base font-semibold leading-snug break-words">
							{post.title}
						</div>
						<div class="text-gold-light text-[11px] sm:text-xs leading-tight mt-0.5 uppercase tracking-wide">
							{post.category}
						</div>
					</div>
				</div>
			{:else}
				<div class="p-5 min-h-[8rem] flex flex-col justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900">
					<div class="text-neutral-900 dark:text-neutral-100 text-sm sm:text-base font-semibold leading-snug break-words group-hover:text-gold transition-colors">
						{post.title}
					</div>
					<div class="text-gold text-[11px] sm:text-xs leading-tight mt-1 uppercase tracking-wide">
						{post.category}
					</div>
				</div>
			{/if}
		</a>
	{/each}
</div>