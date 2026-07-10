<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	const recoveryLinks = [
		{
			href: '/writing',
			label: 'Browse writing',
			description: 'Essays, fiction, satire, and reflections.'
		},
		{
			href: '/consulting',
			label: 'Healthcare IT',
			description: 'Interoperability, clinical data, and consulting work.'
		},
		{
			href: '/resume',
			label: 'View resume',
			description: 'Professional background, projects, and experience.'
		}
	] as const;

	let isNotFound = $derived(page.status === 404);
	let title = $derived(
		isNotFound ? 'Page not found | SuvroGhosh.In' : 'Something went wrong | SuvroGhosh.In'
	);
	let heading = $derived(
		isNotFound ? 'This page has slipped out of the catalogue.' : 'Something interrupted this page.'
	);
	let description = $derived(
		isNotFound
			? 'The address may be old, mistyped, or attached to a page that has moved. Search the archive or choose a reliable path below.'
			: 'The page could not be displayed just now. You can try again, search the archive, or return to a stable section of the site.'
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="robots" content="noindex,follow" />
</svelte:head>

<section class="page-enter mx-auto max-w-3xl" aria-labelledby="error-heading">
	<div class="border-y border-neutral-300 py-8 sm:py-12 dark:border-neutral-700">
		<p
			class="mb-3 text-left text-sm font-semibold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			{page.status} · {isNotFound ? 'Page not found' : 'Site error'}
		</p>

		<h1 id="error-heading" class="max-w-2xl text-4xl sm:text-5xl md:text-6xl">
			{heading}
		</h1>

		<p class="mt-5 max-w-2xl text-left text-lg text-neutral-700 dark:text-neutral-300">
			{description}
		</p>

		<div class="mt-7 flex flex-wrap gap-3">
			<Button href={resolve('/')} size="lg" class="min-h-11">Return home</Button>
			<Button href={resolve('/blog')} variant="outline" size="lg" class="min-h-11">
				View all posts
			</Button>
		</div>
	</div>

	<div class="py-8 sm:py-10">
		<h2 class="mb-3 text-2xl sm:text-3xl">Search the archive</h2>
		<p class="max-w-2xl text-left text-neutral-600 dark:text-neutral-400">
			Search titles, descriptions, tags, and the full text of published writing.
		</p>

		<form
			action={resolve('/blog')}
			method="get"
			role="search"
			class="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row"
		>
			<label for="error-search" class="sr-only">Search published writing</label>
			<Input
				id="error-search"
				name="search"
				type="search"
				placeholder="Try a title, topic, or phrase"
				autocomplete="off"
				class="min-h-11 flex-1"
			/>
			<Button type="submit" class="min-h-11 px-6">Search writing</Button>
		</form>
	</div>

	<nav class="border-t border-neutral-300 pt-8 dark:border-neutral-700" aria-label="Recovery links">
		<h2 class="mb-5 text-2xl sm:text-3xl">Or continue from here</h2>
		<ul class="grid grid-cols-1 gap-3 md:grid-cols-3">
			{#each recoveryLinks as link (link.href)}
				<li>
					<a
						href={resolve(link.href)}
						class="group flex h-full min-h-28 flex-col rounded-lg border border-neutral-300 bg-neutral-100 p-5 transition-colors hover:border-neutral-500 hover:bg-white focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
					>
						<span
							class="font-semibold text-neutral-900 group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
						>
							{link.label}
						</span>
						<span class="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
							{link.description}
						</span>
					</a>
				</li>
			{/each}
		</ul>

		<p class="mt-7 text-left text-sm text-neutral-600 dark:text-neutral-400">
			Still stuck? <a
				href={resolve('/contact')}
				class="font-semibold text-neutral-800 underline underline-offset-4 dark:text-neutral-200"
				>Contact me</a
			> and include the address you were trying to open.
		</p>
	</nav>
</section>
