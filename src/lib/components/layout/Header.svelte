<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
	import ThemeSelect from '$lib/components/layout/ThemeSelect.svelte';
	import MotionSelect from '$lib/components/motion/MotionSelect.svelte';
	import { substackLinks } from '$lib/config/links';

	type NavigationItem = {
		href:
			| '/start-here'
			| '/topics'
			| '/blog'
			| '/notes'
			| '/resources'
			| '/blog/visualizations'
			| '/blog/games'
			| '/projects'
			| '/resume';
		label: string;
		sections: readonly string[];
	};

	const navLinks: readonly NavigationItem[] = [
		{ href: '/start-here', label: 'Start Here', sections: ['/start-here'] },
		{ href: '/topics', label: 'Topics', sections: ['/topics'] },
		{ href: '/blog', label: 'Essays', sections: ['/writing', '/blog'] },
		{ href: '/notes', label: 'Notes', sections: ['/notes'] },
		{ href: '/resources', label: 'Field Kit', sections: ['/resources'] },
		{
			href: '/blog/visualizations',
			label: 'Lab',
			sections: ['/blog/visualizations']
		},
		{ href: '/blog/games', label: 'Games', sections: ['/blog/games'] },
		{
			href: '/projects',
			label: 'Work',
			sections: ['/projects', '/consulting', '/healthcare-it-gulf']
		},
		{ href: '/resume', label: 'Resume', sections: ['/resume'] }
	];

	let currentPath = $derived(page.url.pathname);
	let mobileMenu: HTMLDetailsElement;
	let menuSummary: HTMLElement;

	function isCurrent(item: NavigationItem) {
		if (currentPath.startsWith('/blog/games')) {
			return item.href === '/blog/games';
		}
		if (currentPath.startsWith('/blog/visualizations')) {
			return item.href === '/blog/visualizations';
		}
		return item.sections.some((section) =>
			section === '/'
				? currentPath === '/'
				: currentPath === section || currentPath.startsWith(`${section}/`)
		);
	}

	function closeMobile() {
		if (mobileMenu) mobileMenu.open = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && mobileMenu?.open) {
			closeMobile();
			menuSummary?.focus();
		}
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
			<span class="block font-sans text-lg leading-none font-bold tracking-tight sm:text-xl">
				SuvroGhosh<span
					class="text-neutral-500 transition-colors group-hover:text-neutral-700 dark:text-neutral-400 dark:group-hover:text-neutral-200"
					>.IN</span
				>
			</span>
			<span
				lang="bn"
				class="mt-1 hidden font-serif text-[0.7rem] leading-none font-semibold tracking-[0.08em] text-neutral-500 sm:block dark:text-neutral-400"
			>
				সুভ্র ঘোষ
			</span>
		</a>

		<nav class="hidden items-center gap-4 xl:flex xl:gap-5" aria-label="Primary navigation">
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

			<a
				href={substackLinks.subscribe}
				target="_blank"
				rel="noopener noreferrer"
				class="hidden min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white/60 px-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none sm:inline-flex dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
				aria-label="Subscribe to SuvroGhosh.IN on Substack"
				title="Subscribe on Substack"
			>
				<svg
					class="h-5 w-5 shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-width="2" d="M4 5h16M4 9h16M5 13h14v7l-7-4-7 4v-7Z" />
				</svg>
				<span class="hidden 2xl:inline">Subscribe</span>
				<span class="sr-only">, opens in a new tab</span>
			</a>

			<div class="hidden xl:block">
				<ThemeSelect id="desktop-theme" />
			</div>

			<div class="hidden xl:block">
				<MotionSelect id="desktop-motion" />
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
					class="absolute inset-x-0 top-full hidden max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-b border-neutral-300 bg-neutral-100 px-4 py-4 shadow-xl group-open:block sm:px-6 dark:border-neutral-700 dark:bg-neutral-950"
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
						<li class="sm:col-span-2">
							<a
								href={substackLinks.subscribe}
								target="_blank"
								rel="noopener noreferrer"
								onclick={closeMobile}
								class="flex min-h-11 items-center justify-between rounded-md border-l-2 border-transparent px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
							>
								<span>Subscribe on Substack</span>
								<span aria-hidden="true">↗</span>
							</a>
						</li>
						<li class="mt-2 sm:col-span-2">
							<ThemeSelect id="mobile-theme" variant="menu" />
						</li>
						<li class="sm:col-span-2">
							<MotionSelect id="mobile-motion" variant="menu" />
						</li>
					</ul>
				</nav>
			</details>
		</div>
	</div>
</header>
