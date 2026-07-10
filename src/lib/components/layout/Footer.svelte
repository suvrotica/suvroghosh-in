<script lang="ts">
	import { resolve } from '$app/paths';

	const year = new Date().getFullYear();
	const email = 'contact@suvroghosh.in';

	const footerLinks = [
		{ href: '/resume', label: 'Resume' },
		{ href: '/consulting', label: 'Healthcare IT Consulting' },
		{ href: '/healthcare-it-gulf', label: 'Gulf / Kuwait' },
		{ href: '/writing', label: 'Writing & Essays' },
		{ href: '/blog', label: 'All Posts' },
		{ href: '/contact', label: 'Contact' }
	] as const;

	const socialLinks = [
		{
			href: 'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
			label: 'LinkedIn',
			icon: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z'
		},
		{
			href: 'https://www.youtube.com/@SuvroGhoshIN',
			label: 'YouTube',
			icon: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'
		}
	];
</script>

<footer
	class="mt-12 border-t border-neutral-300 bg-neutral-100 py-8 font-sans dark:border-neutral-700 dark:bg-neutral-900"
>
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<nav class="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
			{#each footerLinks as link (link.href)}
				<a
					href={resolve(link.href)}
					class="text-xs font-medium text-neutral-600 underline-offset-4 transition-colors hover:text-neutral-400 dark:text-neutral-400"
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-left text-sm text-neutral-600 dark:text-neutral-400">
				&copy; {year} Suvro Ghosh &middot;
				<a
					href={'mailto:' + email}
					class="underline underline-offset-4 transition-colors hover:text-neutral-400"
				>
					{email}
				</a>
				&middot;
				<a
					href={resolve('/rss.xml')}
					class="underline underline-offset-4 transition-colors hover:text-neutral-400">RSS</a
				>
				&middot;
				<a
					href={resolve('/sitemap.xml')}
					class="underline underline-offset-4 transition-colors hover:text-neutral-400">Sitemap</a
				>
			</p>

			<div class="flex items-center gap-3">
				{#each socialLinks as link (link.href)}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-neutral-500 transition-colors hover:text-neutral-300 dark:text-neutral-400"
						aria-label={link.label}
						title={link.label}
					>
						<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d={link.icon} />
						</svg>
					</a>
				{/each}
			</div>
		</div>
	</div>
</footer>
