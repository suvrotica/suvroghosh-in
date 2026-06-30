<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import { slugifyCategory } from '$lib/content/categories';

	type Post = {
		slug: string;
		title: string;
		thumbnail?: string;
		category: string;
	};

	let { posts = [] }: { posts: Post[] } = $props();
</script>

<div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	{#each posts as post, index (post.slug)}
		{@const href = resolve('/blog/[category]/[slug]', {
			category: slugifyCategory(post.category),
			slug: post.slug
		})}

		<a
			{href}
			class="post-card group block overflow-hidden rounded-lg border border-neutral-200 bg-white no-underline shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-800"
		>
			{#if post.thumbnail}
				<div class="relative aspect-[2/3] overflow-hidden bg-neutral-200 dark:bg-neutral-700">
					<img
						src={post.thumbnail}
						alt={post.title}
						loading={index === 0 ? 'eager' : 'lazy'}
						fetchpriority={index === 0 ? 'high' : 'auto'}
						decoding="async"
						class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
					/>

					<div
						class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3 pt-10"
					>
						<div class="text-sm leading-snug font-semibold break-words text-white sm:text-base">
							{post.title}
						</div>
						<div class="mt-1">
							<Badge
								variant="secondary"
								class="border-transparent bg-black/40 text-neutral-200 backdrop-blur-sm"
							>
								{post.category}
							</Badge>
						</div>
					</div>
				</div>
			{:else}
				<div
					class="flex min-h-[8rem] flex-col justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 p-5 dark:from-neutral-800 dark:to-neutral-900"
				>
					<div
						class="text-sm leading-snug font-semibold break-words text-neutral-900 transition-colors group-hover:text-neutral-400 sm:text-base dark:text-neutral-100"
					>
						{post.title}
					</div>
					<div class="mt-2">
						<Badge variant="outline" class="text-[11px] tracking-wide uppercase">
							{post.category}
						</Badge>
					</div>
				</div>
			{/if}
		</a>
	{/each}
</div>
