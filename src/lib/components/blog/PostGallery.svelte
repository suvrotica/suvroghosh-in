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
			class="group block overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 shadow-md hover:shadow-xl transition-all duration-300 ease-in-out no-underline"
		>
			{#if post.thumbnail}
				<div class="relative aspect-[2/3] overflow-hidden bg-neutral-200 dark:bg-neutral-700">
					<img
						src={post.thumbnail}
						alt={post.title}
						class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
					/>

					<div class="absolute bottom-3 left-3 right-3">
						<div class="inline-block max-w-full rounded-md bg-black/75 px-3 py-2 backdrop-blur-sm">
							<div class="text-white text-sm sm:text-base font-semibold leading-snug break-words">
								{post.title}
							</div>
							<div class="text-neutral-300 text-[11px] sm:text-xs leading-tight mt-0.5 uppercase tracking-wide">
								{post.category}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="p-4">
					<div class="inline-block max-w-full rounded-md bg-black px-3 py-2">
						<div class="text-white text-sm sm:text-base font-semibold leading-snug break-words">
							{post.title}
						</div>
						<div class="text-neutral-300 text-[11px] sm:text-xs leading-tight mt-0.5 uppercase tracking-wide">
							{post.category}
						</div>
					</div>
				</div>
			{/if}
		</a>
	{/each}
</div>
