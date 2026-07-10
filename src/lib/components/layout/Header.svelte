<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	let currentPath = $derived(page.url.pathname);

	const navLinks = [
		{ href: '/', label: 'Home' },
		{ href: '/resume', label: 'Resume' },
		{ href: '/consulting', label: 'Healthcare IT' },
		{ href: '/healthcare-it-gulf', label: 'Gulf / Kuwait' },
		{ href: '/writing', label: 'Writing' },
		{ href: '/contact', label: 'Contact' }
	] as const;

	let mobileOpen = $state(false);

	function closeMobile() {
		mobileOpen = false;
	}

	let searchQuery = $state(page.url.searchParams.get('search') ?? '');
</script>

<header
	class="sticky top-0 z-30 border-b border-neutral-300 bg-neutral-100/95 backdrop-blur-sm transition-colors dark:border-neutral-700 dark:bg-neutral-900/95"
>
	<div class="container mx-auto flex items-center justify-between gap-4 p-4">
		<a
			href={resolve('/')}
			class="text-lg font-bold whitespace-nowrap text-neutral-900 transition-colors hover:text-neutral-400 dark:text-neutral-100"
		>
			SuvroGhosh<span class="text-neutral-400">.In</span>
		</a>

		<nav class="hidden items-center gap-5 md:flex" aria-label="Main navigation">
			{#each navLinks as link (link.href)}
				<a
					href={resolve(link.href)}
					class="nav-link text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-400 dark:text-neutral-300"
					aria-current={currentPath === link.href ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="flex items-center gap-3">
			<a
				href={resolve('/blog')}
				class="flex h-11 w-11 items-center justify-center rounded-md hover:bg-neutral-200 sm:hidden dark:hover:bg-neutral-800"
				aria-label="Search writing"
			>
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			</a>

			<form
				action={resolve('/blog')}
				method="get"
				class="hidden items-center gap-1 sm:flex"
				role="search"
			>
				<Input
					type="search"
					name="search"
					bind:value={searchQuery}
					placeholder="Search posts..."
					aria-label="Search posts"
					class="h-10 w-40"
				/>
				<Button type="submit" variant="ghost" size="icon" aria-label="Search" class="h-10 w-10">
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
				class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-neutral-200 md:hidden dark:hover:bg-neutral-800"
				onclick={() => (mobileOpen = !mobileOpen)}
				aria-label="Toggle navigation menu"
				aria-expanded={mobileOpen}
			>
				<svg
					class="h-6 w-6 text-neutral-800 dark:text-neutral-200"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					{#if mobileOpen}
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

	{#if mobileOpen}
		<nav
			class="border-t border-neutral-300 px-4 py-3 md:hidden dark:border-neutral-700"
			aria-label="Mobile navigation"
		>
			<ul class="flex flex-col gap-2">
				{#each navLinks as link (link.href)}
					<li>
						<a
							href={resolve(link.href)}
							onclick={closeMobile}
							class="block rounded-md px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200 hover:text-neutral-400 dark:text-neutral-300 dark:hover:bg-neutral-800"
							aria-current={currentPath === link.href ? 'page' : undefined}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
</header>
