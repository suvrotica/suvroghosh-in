<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PostGallery from './PostGallery.svelte';
	import { slugifyCategory, categoryLabel } from '$lib/content/categories';

	type Post = {
		slug: string;
		title: string;
		date: string;
		thumbnail?: string;
		category: string;
		published?: boolean;
	};

	let { posts, basePath = '/blog' }: { posts: Post[]; basePath?: string } = $props();

	let tabs = $derived.by(() => {
		const groups = new Map<string, Post[]>();
		for (const post of posts) {
			const slug = slugifyCategory(post.category || 'uncategorized');
			if (!groups.has(slug)) groups.set(slug, []);
			groups.get(slug)!.push(post);
		}
		return Array.from(groups.entries())
			.map(([slug, articles]) => ({
				slug,
				label: categoryLabel(slug),
				posts: articles.sort(
					(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
				)
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	});

	let tabKeys = $derived(tabs.map((t) => t.slug));
	let defaultTab = $derived(tabKeys.includes('healthcare-it') ? 'healthcare-it' : (tabKeys[0] ?? ''));

	let activeTab = $derived(page.url.searchParams.get('tab') ?? defaultTab);

	function selectTab(slug: string) {
		goto(`${basePath}?tab=${slug}`, { keepFocus: true, noScroll: true });
	}

	let visiblePosts = $derived(
		tabs.find((t) => t.slug === activeTab)?.posts ?? []
	);
</script>

<div class="mb-6">
	<div class="flex flex-wrap gap-1 border-b border-neutral-300 dark:border-neutral-700">
		{#each tabs as tab (tab.slug)}
			<button
				onclick={() => selectTab(tab.slug)}
				class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab === tab.slug
					? 'border-gold text-gold'
					: 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>

{#if visiblePosts.length > 0}
	<PostGallery posts={visiblePosts} />
{:else}
	<div class="py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
		<p>No posts in this category yet.</p>
	</div>
{/if}