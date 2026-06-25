<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, personSchema } from '$lib/components/seo/SEO';
	import { Button } from '$lib/components/ui/button';

	const title = 'Contact | Suvro Ghosh';
	const description =
		'Contact Suvro Ghosh for healthcare IT consulting, interoperability, clinical data systems, and advisory opportunities. Based in Calcutta, open to Gulf, remote, and hybrid work.';
	const canonicalUrl = siteUrl + '/contact';

	const email = 'contact@suvroghosh.in';
</script>

<SEO {title} {description} {canonicalUrl} schema={personSchema} />

<section class="page-enter mx-auto max-w-2xl py-8 md:py-12">
	<header class="mb-10 text-center">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Contact
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			For healthcare IT consulting, interoperability, clinical data systems, advisory, or writing
			inquiries.
		</p>
	</header>

	<div class="card text-center">
		<p class="mb-2 text-base text-neutral-700 dark:text-neutral-300">Email</p>
		<a
			href={'mailto:' + email}
			class="text-xl font-bold text-neutral-900 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-100"
		>
			{email}
		</a>
		<p class="mt-6 text-sm text-neutral-600 dark:text-neutral-400">
			Based in Calcutta, India. Open to remote, hybrid, contract, consulting, and Gulf healthcare IT
			opportunities.
		</p>
	</div>

	<div class="mt-8 flex items-center justify-center gap-4">
		<Button
			href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label="LinkedIn"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"
				/>
			</svg>
		</Button>
		<Button
			href="https://www.youtube.com/@SuvroGhoshIN"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label="YouTube"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
				/>
			</svg>
		</Button>
	</div>
</section>
