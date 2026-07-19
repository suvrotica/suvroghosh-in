<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks } from '$lib/config/links';

	const links = [
		{ href: '/writing', label: 'More writing' },
		{ href: '/consulting', label: 'Healthcare IT work' },
		{ href: '/resume', label: 'Résumé', rel: 'author' },
		{ href: '/contact', label: 'Corrections or enquiries' }
	] as const;
</script>

<aside
	id="about-the-author"
	data-tts-exclude
	aria-labelledby="about-author-heading"
	class="mt-14 scroll-mt-24 border-y border-neutral-300 py-7 dark:border-neutral-700 print:hidden"
>
	<div class="grid gap-5 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-start">
		<div
			class="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 font-serif text-xl font-bold tracking-tight text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
			aria-hidden="true"
		>
			SG
		</div>

		<div class="min-w-0">
			<p
				class="m-0 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Author
			</p>
			<h2
				id="about-author-heading"
				class="mt-1 mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
			>
				About Suvro Ghosh
			</h2>
			<p
				class="m-0 max-w-2xl text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
			>
				Suvro Ghosh is a healthcare IT and clinical data systems architect who also writes essays,
				fiction, satire, and explanations of science, mathematics, AI, and public systems from
				Calcutta.
			</p>
			<p class="mt-3 mb-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
				The Substack newsletter carries a curated selection of essays from this site. Questions,
				factual corrections, and thoughtful disagreements are also welcome.
			</p>

			<nav aria-label="About the author" class="mt-4">
				<ul class="flex flex-wrap gap-x-5 gap-y-1">
					<li>
						<a
							href={substackLinks.subscribe}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex min-h-11 items-center text-sm font-bold text-neutral-950 underline decoration-neutral-500 underline-offset-4 transition-colors hover:text-neutral-600 hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-100 dark:decoration-neutral-500 dark:hover:text-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
						>
							Subscribe on Substack<span class="ml-1" aria-hidden="true">↗</span>
							<span class="sr-only">, opens in a new tab</span>
						</a>
					</li>
					{#each links as link (link.href)}
						<li>
							<a
								href={resolve(link.href)}
								rel={'rel' in link ? link.rel : undefined}
								class="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
							>
								{link.label}<span class="ml-1" aria-hidden="true">→</span>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
	</div>
</aside>
