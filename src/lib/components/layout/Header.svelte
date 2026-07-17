<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
	import ThemeSelect from '$lib/components/layout/ThemeSelect.svelte';

	type NavigationItem = {
		href: '/' | '/start-here' | '/writing' | '/consulting' | '/projects' | '/resume' | '/contact';
		label: string;
		sections: readonly string[];
	};

	const navLinks: readonly NavigationItem[] = [
		{ href: '/', label: 'Home', sections: ['/'] },
		{ href: '/start-here', label: 'Start Here', sections: ['/start-here'] },
		{ href: '/writing', label: 'Writing', sections: ['/writing', '/blog'] },
		{
			href: '/consulting',
			label: 'Healthcare IT',
			sections: ['/consulting', '/healthcare-it-gulf']
		},
		{ href: '/projects', label: 'Projects', sections: ['/projects'] },
		{ href: '/resume', label: 'Resume', sections: ['/resume'] },
		{ href: '/contact', label: 'Contact', sections: ['/contact'] }
	];

	let currentPath = $derived(page.url.pathname);
	let searchQuery = $state(page.url.searchParams.get('search') ?? '');
	let searchInput = $state<HTMLInputElement>();
	let mobileMenu: HTMLDetailsElement;
	let menuSummary: HTMLElement;

	function isCurrent(item: NavigationItem) {
		return item.sections.some((section) =>
			section === '/'
				? currentPath === '/'
				: currentPath === section || currentPath.startsWith(`${section}/`)
		);
	}

	function closeMobile() {
		if (mobileMenu) mobileMenu.open = false;
	}

	function isEditableTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && mobileMenu?.open) {
			closeMobile();
			menuSummary?.focus();
			return;
		}

		if (
			event.defaultPrevented ||
			event.key !== '/' ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			isEditableTarget(event.target) ||
			!searchInput ||
			searchInput.offsetParent === null
		) {
			return;
		}

		event.preventDefault();
		searchInput.focus();
		searchInput.select();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<header
	class="relative sticky top-0 z-40 border-b border-neutral-300/90 bg-neutral-100/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-md transition-colors dark:border-neutral-700/90 dark:bg-neutral-950/95 dark:shadow-none print:hidden"
>
	<div
		class="container mx-auto flex min-h-18 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
	>
		<a
			href={resolve('/')}
			onclick={closeMobile}
			class="group shrink-0 rounded-sm text-neutral-950 outline-offset-4 dark:text-neutral-50"
			aria-label="SuvroGhosh.IN — home"
		>
			<span class="block font-serif text-lg leading-none font-bold tracking-tight sm:text-xl">
				SuvroGhosh<span
					class="text-neutral-500 transition-colors group-hover:text-neutral-700 dark:text-neutral-400 dark:group-hover:text-neutral-200"
					>.IN</span
				>
			</span>
			<span
				class="mt-1 hidden text-[0.625rem] leading-none font-semibold tracking-[0.18em] text-neutral-500 uppercase sm:block dark:text-neutral-400"
			>
				Writing &amp; systems
			</span>
		</a>

		<nav class="hidden items-center gap-5 xl:flex" aria-label="Primary navigation">
			{#each navLinks as link (link.href)}
				<a
					href={resolve(link.href)}
					class="nav-link rounded-sm py-2 text-sm font-semibold text-neutral-700 outline-offset-4 transition-colors hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
					aria-current={isCurrent(link) ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="flex items-center gap-2 sm:gap-3">
			<CommandPalette />

			<form
				action={resolve('/blog')}
				method="get"
				class="hidden items-center gap-1 lg:flex"
				role="search"
				aria-label="Site search"
			>
				<div class="relative">
					<Input
						bind:ref={searchInput}
						type="search"
						name="search"
						bind:value={searchQuery}
						placeholder="Search writing"
						aria-label="Search writing"
						aria-keyshortcuts="/"
						class="h-11 w-44 bg-white/70 pr-9 dark:bg-neutral-900/80"
					/>
					<kbd
						aria-hidden="true"
						class="search-shortcut-hint pointer-events-none absolute top-1/2 right-2 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-neutral-300 bg-neutral-100 px-1 text-[0.65rem] leading-5 font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
					>
						/
					</kbd>
				</div>
				<Button
					type="submit"
					variant="ghost"
					size="icon"
					aria-label="Submit search"
					class="h-11 w-11"
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
				</Button>
			</form>

			<div class="hidden xl:block">
				<ThemeSelect id="desktop-theme" />
			</div>

			<details bind:this={mobileMenu} class="group xl:hidden">
				<summary
					bind:this={menuSummary}
					class="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md text-neutral-800 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950 [&::-webkit-details-marker]:hidden"
				>
					<span class="sr-only">Navigation menu</span>
					<svg
						class="h-6 w-6 group-open:hidden"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
					<svg
						class="hidden h-6 w-6 group-open:block"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</summary>

				<nav
					class="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-b border-neutral-300 bg-neutral-100 px-4 py-4 shadow-xl sm:px-6 dark:border-neutral-700 dark:bg-neutral-950"
					aria-label="Mobile and tablet navigation"
				>
					<ul class="container mx-auto grid gap-1 sm:grid-cols-2 sm:gap-2 lg:max-w-3xl">
						{#each navLinks as link (link.href)}
							<li>
								<a
									href={resolve(link.href)}
									onclick={closeMobile}
									class="flex min-h-11 items-center rounded-md border-l-2 px-4 py-2.5 text-sm font-semibold transition-colors {isCurrent(
										link
									)
										? 'border-neutral-800 bg-neutral-200 text-neutral-950 dark:border-neutral-200 dark:bg-neutral-800 dark:text-white'
										: 'border-transparent text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white'}"
									aria-current={isCurrent(link) ? 'page' : undefined}
								>
									{link.label}
								</a>
							</li>
						{/each}
						<li class="mt-2 sm:col-span-2">
							<ThemeSelect id="mobile-theme" variant="menu" />
						</li>
					</ul>
				</nav>
			</details>
		</div>
	</div>
</header>
