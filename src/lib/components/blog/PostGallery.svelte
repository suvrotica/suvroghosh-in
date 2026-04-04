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
		<a {href} class="group block relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-all duration-300 ease-in-out border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800"> 
            <div class="aspect-2/3 overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                {#if post.thumbnail}
				    <img src={post.thumbnail} alt={post.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {:else}
                    <div class="w-full h-full flex items-center justify-center text-neutral-400 text-4xl font-serif">
                        {post.title.charAt(0)}
                    </div>
                {/if}
			</div>
            
            <div class="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-black/90 via-black/60 to-transparent pt-12">
                <h3 class="text-white font-bold text-lg leading-tight group-hover:text-gold transition-colors">
                    {post.title}
                </h3>
                <p class="text-neutral-300 text-xs mt-1 uppercase tracking-wide">{post.category}</p>
            </div>
		</a>
	{/each}
</div>