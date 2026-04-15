<script lang="ts">
	type Post = {
		slug: string;
		title: string;
		category: string;
	};

	// Svelte 5 Runes for component props
	let { posts = [] }: { posts: Post[] } = $props();

	// Function to remove underscores and format nicely
	function formatTitle(text: string) {
		return text
			.replace(/[-_]/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}
</script>

<div class="blog-badge-list">
	{#each posts as post (post.slug)}
		<a href={`/blog/${post.slug}`} class="blog-badge-link">
			<span class="blog-badge-title">
				{formatTitle(post.title || post.slug)}
			</span>
		</a>
	{/each}
</div>