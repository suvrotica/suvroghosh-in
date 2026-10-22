<script lang="ts">
	import type { Evidence, Specimen } from '$lib/visualizations/the-museum-of-almost/model';
	let { record, evidence }: { record: Specimen; evidence: Evidence } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- These validated HTTPS evidence sources are external public source locators, not application routes. -->
{#if evidence.provenanceIds.length}
	<ul class="ma-source-references" aria-label={`Public sources for ${evidence.label}`}>
		{#each evidence.provenanceIds as id (id)}
			{@const source = record.provenance.find((item) => item.id === id)}
			{#if source && source.permission === 'public'}
				<li>
					{#if source.source.startsWith('https://')}<a href={source.source}>{source.summary}</a
						>{:else}{source.summary} <code>{source.source}</code>{/if}
				</li>
			{/if}
		{/each}
	</ul>
{/if}
