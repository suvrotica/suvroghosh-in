<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { slugifyCategory, categoryLabel } from '$lib/content/categories';

	let categories = $derived(page.data.categories || []);
	let currentPath = $derived(page.url.pathname as string);
	let currentCategory = $derived(page.url.searchParams.get('category') ?? '');
</script>

<aside class="h-full overflow-y-auto p-4">
	<nav class="space-y-8">
		<div class="sidebar-group space-y-2">
			<a
				href={resolve('/blog')}
				class="sidebar-topic block text-sm font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-400 dark:text-neutral-400"
				class:text-neutral-400={currentPath === '/blog' && !currentCategory}
			>
				All Posts
			</a>

			<a
				href={resolve('/resume')}
				class="sidebar-topic block text-sm font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-400 dark:text-neutral-400"
				class:text-neutral-400={currentPath === '/resume'}
			>
				Resume
			</a>
		</div>
		{#each categories as category (category.name)}
			{@const catSlug = slugifyCategory(category.name)}
			<div class="sidebar-group mb-6">
				<a
					href={resolve(`/blog?category=${catSlug}`)}
					class="sidebar-topic mb-3 block text-xs font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-400 dark:text-neutral-500"
					class:text-neutral-400={currentCategory === catSlug}
				>
					{categoryLabel(category.name)}
				</a>

				<ul class="space-y-1">
					{#each category.articles as article (article.slug)}
						<li>
							<a
								href={resolve('/blog/[category]/[slug]', {
									category: category.name,
									slug: article.slug
								})}
								class="block rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-neutral-700 transition-all hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
								class:border-neutral-400={currentPath.includes(article.slug)}
								class:bg-neutral-200={currentPath.includes(article.slug)}
								class:dark:bg-neutral-800={currentPath.includes(article.slug)}
							>
								{article.title}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</aside>
