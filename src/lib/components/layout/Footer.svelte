<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks, xProfile } from '$lib/config/links';

	const year = new Date().getFullYear();
	const email = 'contact@suvroghosh.in';

	const footerGroups = [
		{
			id: 'footer-explore',
			label: 'Explore',
			links: [
				{ href: '/start-here', label: 'Start here' },
				{ href: '/writing', label: 'Writing' },
				{ href: '/blog', label: 'Search & archive' },
				{ href: '/blog/topics', label: 'Topics' },
				{ href: '/blog/visualizations', label: 'Visualizations' },
				{ href: '/resume', label: 'Resume' }
			]
		},
		{
			id: 'footer-work',
			label: 'Professional',
			links: [
				{ href: '/projects', label: 'Projects' },
				{ href: '/consulting', label: 'Healthcare IT' },
				{ href: '/healthcare-it-gulf', label: 'Gulf & Kuwait' },
				{ href: '/contact', label: 'Contact' }
			]
		}
	] as const;

	const externalLinks = [
		{
			href: substackLinks.subscribe,
			label: 'Substack newsletter',
			icon: 'M3 3h18v3H3V3zm0 5h18v3H3V8zm1 5h16v8l-8-4.5L4 21v-8z'
		},
		{
			href: 'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
			label: 'LinkedIn',
			icon: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z'
		},
		{
			href: 'https://www.youtube.com/@SuvroGhoshIN',
			label: 'YouTube',
			icon: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'
		},
		{
			href: xProfile.url,
			label: `X (${xProfile.handle})`,
			icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z'
		}
	] as const;

	const footerLinkClass =
		'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-neutral-600 underline-offset-4 transition-colors hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950';
</script>

<footer
	class="mt-auto border-t border-neutral-300 bg-neutral-100 font-sans dark:border-neutral-700 dark:bg-neutral-950 print:hidden"
>
	<div class="container mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
		<div class="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12">
			<div class="max-w-sm">
				<a
					href={resolve('/')}
					class="inline-flex min-h-11 items-center rounded-sm font-serif text-xl font-bold tracking-tight text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
				>
					SuvroGhosh<span class="text-neutral-500 dark:text-neutral-400">.IN</span>
				</a>
				<p
					class="mt-3 !mb-0 max-w-xs !text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
				>
					Essays, healthcare systems, science, and Calcutta—written and maintained independently.
				</p>
			</div>

			{#each footerGroups as group (group.id)}
				<nav aria-labelledby={group.id}>
					<h2
						id={group.id}
						class="!m-0 !text-xs !leading-5 font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						{group.label}
					</h2>
					<ul class="mt-2">
						{#each group.links as link (link.href)}
							<li>
								<a href={resolve(link.href)} class={footerLinkClass}>{link.label}</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/each}

			<nav aria-labelledby="footer-follow">
				<h2
					id="footer-follow"
					class="!m-0 !text-xs !leading-5 font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
				>
					Follow &amp; subscribe
				</h2>
				<ul class="mt-2">
					{#each externalLinks as link (link.href)}
						<li>
							<a href={link.href} target="_blank" rel="noopener noreferrer" class={footerLinkClass}>
								<svg
									class="mr-2 h-4 w-4 shrink-0 text-neutral-500"
									fill="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path d={link.icon} />
								</svg>
								{link.label}<span class="sr-only">, opens in a new tab</span>
								<svg
									class="ml-1.5 h-3.5 w-3.5 text-neutral-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M14 5h5v5m0-5L10 14M5 7v12h12v-5"
									/>
								</svg>
							</a>
						</li>
					{/each}
					<li><a href={resolve('/rss.xml')} class={footerLinkClass}>RSS feed</a></li>
				</ul>
			</nav>
		</div>

		<div
			class="mt-9 flex flex-col gap-2 border-t border-neutral-300 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800"
		>
			<p class="!mb-0 !text-left text-xs text-neutral-500 dark:text-neutral-500">
				&copy; {year} Suvro Ghosh. All writing and opinions are my own.
			</p>
			<div class="flex flex-wrap items-center gap-x-5">
				<a href={'mailto:' + email} class={footerLinkClass}>{email}</a>
				<a href={resolve('/sitemap.xml')} class={footerLinkClass}>Sitemap</a>
			</div>
		</div>
	</div>
</footer>
