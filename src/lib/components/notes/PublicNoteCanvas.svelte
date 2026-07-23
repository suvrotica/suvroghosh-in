<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { noteDocumentSchema } from '$lib/notes/schema';
	import type { NoteDocument } from '$lib/notes/model';
	import NoteViewer from './NoteViewer.svelte';

	type Props = {
		slug: string;
		title: string;
		downloadsEnabled: boolean;
		initialDocument?: NoteDocument | null;
	};

	let { slug, title, downloadsEnabled, initialDocument = null }: Props = $props();
	let document = $state<NoteDocument | null>(untrack(() => initialDocument));
	let loading = $state(untrack(() => !initialDocument));
	let error = $state('');

	async function loadDocument() {
		loading = true;
		error = '';
		try {
			const response = await fetch(`/api/public/notes/${encodeURIComponent(slug)}/document`);
			if (!response.ok) throw new Error('The canvas could not be loaded.');
			const payload = (await response.json()) as { document: unknown };
			document = noteDocumentSchema.parse(payload.document);
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'The canvas could not be loaded.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!document) void loadDocument();
	});
</script>

{#if document}
	<NoteViewer {document} {title} {downloadsEnabled} />
{:else if loading}
	<div class="canvas-loading" role="status" aria-live="polite">
		<span aria-hidden="true"></span>
		<p>Loading the handwritten canvas…</p>
	</div>
{:else}
	<div class="canvas-error" role="alert">
		<p>{error}</p>
		<button type="button" onclick={() => void loadDocument()}>Try again</button>
	</div>
{/if}

<style>
	.canvas-loading,
	.canvas-error {
		display: grid;
		min-height: 30rem;
		place-content: center;
		justify-items: center;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: #fbf7ec;
		color: var(--ink-muted);
		text-align: center;
	}

	.canvas-loading span {
		width: 2rem;
		height: 2rem;
		border: 3px solid #cfc2ab;
		border-top-color: #2f6b60;
		border-radius: 50%;
		animation: spin 850ms linear infinite;
	}

	.canvas-error button {
		min-height: 2.75rem;
		border: 1px solid var(--ink);
		border-radius: 0.4rem;
		background: var(--ink);
		padding: 0.5rem 0.85rem;
		color: var(--paper);
		font-weight: 750;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.canvas-loading span {
			animation: none;
		}
	}
</style>
