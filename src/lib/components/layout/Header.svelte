<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { isMenuOpen, toggleMenu }: {
		isMenuOpen: boolean;
		toggleMenu: () => void;
	} = $props();

	let searchQuery = $state(page.url.searchParams.get('search') ?? '');

	$effect(() => {
		searchQuery = page.url.searchParams.get('search') ?? '';
	});

	function handleSearch(e: SubmitEvent) {
		e.preventDefault();
		const query = searchQuery.trim();
		goto(query ? `/blog?search=${encodeURIComponent(query)}` : '/blog');
	}
</script>

<header class="border-b border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 transition-colors duration-300">
	<div class="container mx-auto flex items-center justify-between p-4">
		<a href="/" class="text-2xl font-bold text-neutral-900 dark:text-neutral-100 hover:text-gold transition-colors">
			SuvroGhosh.In
		</a>

		<div class="flex items-center gap-4">
			<div class="hidden md:flex items-center space-x-6">
				<a href="/blog" class="text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-gold transition-colors">
					Blog
				</a>

				<a href="/resume" class="text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-gold transition-colors">
					Resume
				</a>
			</div>

			<form onsubmit={handleSearch} class="flex items-center gap-1" role="search">
				<input
					type="search"
					name="search"
					bind:value={searchQuery}
					placeholder="Search posts…"
					aria-label="Search posts"
					class="w-32 sm:w-40 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-gold"
				/>
				<button
					type="submit"
					aria-label="Search"
					class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</button>
			</form>
		</div>

		<button
			class="lg:hidden p-2 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
			onclick={toggleMenu}
			aria-label="Toggle menu"
		>
			<svg class="w-6 h-6 text-neutral-800 dark:text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				{#if isMenuOpen}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				{:else}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				{/if}
			</svg>
		</button>
	</div>
</header>