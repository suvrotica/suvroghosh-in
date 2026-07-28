<script lang="ts">
	type Props = {
		inPlainEnglish?: string;
		keyTerms?: string[];
		faq?: { question: string; answer: string }[];
		deferred?: boolean;
	};

	let { inPlainEnglish = '', keyTerms = [], faq = [], deferred = false }: Props = $props();

	let headingId = $derived(deferred ? 'article-quick-reference' : 'answer-summary');
</script>

<section
	id={deferred ? 'faq' : undefined}
	aria-labelledby={headingId}
	class="rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/60"
	class:mt-12={deferred}
	class:mb-10={!deferred}
>
	<h2 id={headingId} class="mb-3 text-lg font-bold text-neutral-900 dark:text-white">
		{deferred ? 'Quick reference and FAQ' : 'Quick Answer'}
	</h2>
	{#if inPlainEnglish}
		<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			{inPlainEnglish}
		</p>
	{/if}
	{#if keyTerms.length}
		<div class="mt-4">
			<h3 class="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Key Terms</h3>
			<ul class="flex flex-wrap gap-2">
				{#each keyTerms as term (term)}
					<li
						class="rounded-md bg-white px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
					>
						{term}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if faq.length}
		<div class="mt-5 space-y-4">
			<h3 class="text-base font-bold text-neutral-900 dark:text-neutral-100">
				Frequently asked questions
			</h3>
			{#each faq as item (item.question)}
				<div>
					<h4 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
						{item.question}
					</h4>
					<p class="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
						{item.answer}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</section>
