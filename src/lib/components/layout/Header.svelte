<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	let {
		isMenuOpen,
		toggleMenu
	}: {
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

	let currentPath = $derived(page.url.pathname);
</script>

<header
	class="sticky top-0 z-30 border-b border-neutral-300 bg-neutral-100/95 backdrop-blur-sm transition-colors dark:border-neutral-700 dark:bg-neutral-900/95"
>
	<div class="container mx-auto flex items-center justify-between gap-4 p-4">
		<a
			href="/"
			class="text-lg font-bold whitespace-nowrap text-neutral-900 transition-colors hover:text-neutral-400 dark:text-neutral-100"
		>
			SuvroGhosh<span class="text-neutral-400">.In</span>
		</a>

		<div class="flex items-center gap-3">
			<div class="hidden items-center space-x-6 md:flex">
				<a
					href="/blog"
					class="nav-link text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-400 dark:text-neutral-300"
					aria-current={currentPath === '/blog' ? 'page' : undefined}
				>
					Blog
				</a>

				<a
					href="/resume"
					class="nav-link text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-400 dark:text-neutral-300"
					aria-current={currentPath === '/resume' ? 'page' : undefined}
				>
					Resume
				</a>
			</div>

			<form onsubmit={handleSearch} class="flex items-center gap-1" role="search">
				<Input
					type="search"
					name="search"
					bind:value={searchQuery}
					placeholder="Search posts…"
					aria-label="Search posts"
					class="h-8 w-28 sm:w-40"
				/>
				<Button type="submit" variant="ghost" size="icon" aria-label="Search" class="h-8 w-8">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</Button>
			</form>

			<button
				class="cursor-pointer rounded-md p-2 hover:bg-neutral-200 lg:hidden dark:hover:bg-neutral-800"
				onclick={toggleMenu}
				aria-label="Toggle menu"
			>
				<svg
					class="h-6 w-6 text-neutral-800 dark:text-neutral-200"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					{#if isMenuOpen}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					{:else}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					{/if}
				</svg>
			</button>
		</div>
	</div>
</header>
