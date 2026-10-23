<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import { Button } from '$lib/components/ui/button';

	const title = 'Healthcare IT Context: Gulf & Kuwait | Suvro Ghosh';
	const description =
		'Career background and healthcare systems writing for readers arriving through Suvro Ghosh’s earlier Gulf and Kuwait healthcare IT page.';
	const canonicalUrl = siteUrl + '/healthcare-it-gulf';
</script>

<SEO {title} {description} {canonicalUrl} schema={withSiteGraph()} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10" data-route-scene="healthcare">
		<p
			class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Career context
		</p>
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Healthcare IT: Gulf &amp; Kuwait
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			If you arrived through an earlier link about Gulf or Kuwait healthcare IT opportunities, you
			can still find my career history and healthcare systems writing here.
		</p>
		<p class="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			My current direction is independent work as an entrepreneur, maker and writer. Healthcare IT
			is part of my background, alongside systems software, research and teaching.
		</p>
		<p class="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			For help with a project, see <a
				href={resolve('/consulting')}
				class="font-semibold underline underline-offset-4">Services &amp; partnerships</a
			>. This page does not claim that I have worked for Gulf clients.
		</p>
	</header>

	<div class="card mb-8">
		<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Background and further reading
		</h2>
		<p class="mb-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			My earlier work included VA research data systems, SQL Server warehouses, ETL pipelines,
			health information exchange and clinical trial platforms. The résumé retains the roles, dates,
			projects and publications behind that work.
		</p>
		<p class="mb-0 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			The <a
				href={resolve('/blog/[category]', { category: 'healthcare-it' })}
				class="font-semibold underline underline-offset-4">healthcare IT writing</a
			>
			explores interoperability, legacy systems, clinical data and the assumptions behind analytics. The
			<a href={resolve('/consulting')} class="font-semibold underline underline-offset-4"
				>services and partnerships page</a
			> connects that writing to earlier experience and the current service offer.
		</p>
	</div>

	<div class="flex flex-wrap gap-3">
		<Button href="/resume" size="lg">Career history</Button>
		<Button href="/projects" variant="outline" size="lg">Work &amp; experiments</Button>
		<Button href="/writing" variant="ghost" size="lg">Writing</Button>
	</div>
</section>
