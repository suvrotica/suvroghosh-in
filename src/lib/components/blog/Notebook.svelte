<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		src,
		title = 'Mojo notebook',
		caption,
		height = 760
	}: {
		src: string;
		title?: string;
		caption?: string;
		height?: number;
	} = $props();

	const notebookName = $derived(src.replace(/^\/notebooks\//, '').replace(/\.html$/i, ''));
	const notebookPath = $derived(`/notebooks/${encodeURIComponent(notebookName)}.html`);
	const captionId = $derived(
		`notebook-caption-${notebookName.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`
	);
</script>

<figure
	class="not-prose my-10 overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800"
	>
		<div class="min-w-0">
			<p class="mb-0 truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">{title}</p>
			<p class="mb-0 text-xs text-neutral-500 dark:text-neutral-400">Jupyter · Mojo</p>
		</div>
		<a
			href={resolve(notebookPath as '/')}
			target="_blank"
			rel="noreferrer"
			class="inline-flex min-h-11 shrink-0 items-center rounded-md border border-neutral-400 px-3 py-2 text-xs font-semibold text-neutral-700 no-underline transition-colors hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-white dark:focus-visible:outline-neutral-300"
		>
			Open full notebook
		</a>
	</div>

	<iframe
		src={resolve(notebookPath as '/')}
		{title}
		loading="lazy"
		sandbox=""
		referrerpolicy="no-referrer"
		aria-describedby={caption ? captionId : undefined}
		class="block w-full border-0 bg-white dark:bg-neutral-950"
		style={`height: ${Math.max(320, height)}px`}
	></iframe>

	{#if caption}
		<figcaption
			id={captionId}
			class="border-t border-neutral-300 px-4 py-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
		>
			{caption}
		</figcaption>
	{/if}
</figure>
