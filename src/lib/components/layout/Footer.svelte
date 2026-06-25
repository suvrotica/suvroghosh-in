<script lang="ts">
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

	const year = new Date().getFullYear();
	const email = 'contact@suvroghosh.in';

	const socialLinks = [
		{
			href: 'https://www.linkedin.com/in/suvro-ghosh-78a5aa278',
			label: 'LinkedIn',
			icon: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z'
		}
	];
</script>

<footer class="border-t border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 px-6 py-8 mt-12">
	<ScrollReveal class="max-w-4xl mx-auto">
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4">
			<p class="text-sm text-neutral-600 dark:text-neutral-400 text-center sm:text-left">
				&copy; {year} Suvro Ghosh &middot;
				<a
					href={`mailto:${email}`}
					class="underline underline-offset-4 hover:text-neutral-400 transition-colors"
				>
					{email}
				</a>
			</p>

			<div class="flex items-center gap-3">
				{#each socialLinks as link}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-neutral-500 dark:text-neutral-400 hover:text-neutral-300 transition-colors"
						aria-label={link.label}
					>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d={link.icon} />
						</svg>
					</a>
				{/each}
			</div>
		</div>
	</ScrollReveal>
</footer>