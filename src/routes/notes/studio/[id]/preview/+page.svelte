<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import NoteViewer from '$lib/components/notes/NoteViewer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO
	title={`Preview ${data.note.title} | Notes Studio`}
	description="Private preview of an unpublished handwritten note."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<div class="preview-page">
	<header>
		<div>
			<a href={resolve('/notes/studio/[id]', { id: data.note.id })}>← Back to editor</a>
			<p>Private preview · {data.note.status}</p>
			<h1>{data.note.title}</h1>
		</div>
		<p>This is the current draft. It is not the public published snapshot.</p>
	</header>
	{#key `${data.note.id}:${data.note.revision}`}
		<NoteViewer
			document={data.note.document}
			title={data.note.title}
			downloadsEnabled={data.note.downloadsEnabled}
		/>
	{/key}
	{#if data.note.transcript}
		<section>
			<h2>Transcript</h2>
			<p>{data.note.transcript}</p>
		</section>
	{/if}
</div>

<style>
	.preview-page {
		min-height: 100dvh;
		background: var(--paper);
		padding: clamp(0.75rem, 3vw, 2rem);
		color: var(--ink);
	}

	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 auto 1rem;
	}

	header a {
		color: var(--ink-muted);
		font-size: 0.8rem;
	}

	header p {
		max-width: 28rem;
		margin: 0.6rem 0 0;
		color: var(--ink-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}

	h1 {
		margin: 0.2rem 0 0;
		font-family: var(--font-serif);
		font-size: clamp(2rem, 5vw, 4rem);
		line-height: 1;
	}

	section {
		max-width: 48rem;
		margin: 2rem auto;
		padding-top: 1.5rem;
		border-top: 1px solid var(--rule);
	}

	section p {
		white-space: pre-wrap;
		font-family: var(--font-serif);
		line-height: 1.7;
	}

	@media (max-width: 42rem) {
		header {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
