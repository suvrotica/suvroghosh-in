<script lang="ts">
	import { onMount } from 'svelte';
	import type { CommentPage } from '$lib/comments/types';
	import CommentForm from './CommentForm.svelte';
	import CommentThread from './CommentThread.svelte';

	let { postSlug }: { postSlug: string } = $props();
	const commentsId = $props.id();
	let section: HTMLElement;
	let result = $state<CommentPage | null>(null);
	let loading = $state(false);
	let attempted = $state(false);
	let error = $state('');
	let revision = $state(0);
	let controller: AbortController | undefined;
	let observer: IntersectionObserver | undefined;
	let disposed = false;
	let lastRequestedPage = 1;
	let pageCount = $derived(result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1);

	async function loadPage(page = result?.page ?? 1) {
		controller?.abort();
		observer?.disconnect();
		const requestController = new AbortController();
		controller = requestController;
		loading = true;
		attempted = true;
		error = '';
		lastRequestedPage = page;
		const timeout = setTimeout(() => requestController.abort(), 15_000);
		try {
			const query = new URLSearchParams({ post: postSlug, page: String(page) });
			const response = await fetch(`/api/comments?${query}`, {
				credentials: 'omit',
				cache: 'no-store',
				signal: requestController.signal
			});
			const data = await response.json().catch(() => null);
			if (!response.ok || !Array.isArray(data?.comments)) {
				throw new Error(
					typeof data?.message === 'string'
						? data.message
						: 'Comments could not be loaded. Please try again.'
				);
			}
			if (disposed || controller !== requestController) return;
			result = data as CommentPage;
			revision += 1;
		} catch (cause) {
			if (disposed || controller !== requestController) return;
			error = requestController.signal.aborted
				? 'Loading comments took too long. Please try again.'
				: cause instanceof Error
					? cause.message
					: 'Comments could not be loaded. Please try again.';
		} finally {
			clearTimeout(timeout);
			if (!disposed && controller === requestController) loading = false;
		}
	}

	onMount(() => {
		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) void loadPage(1);
				},
				{ rootMargin: '250px' }
			);
			observer.observe(section);
		} else {
			void loadPage(1);
		}
		return () => {
			disposed = true;
			observer?.disconnect();
			controller?.abort();
		};
	});
</script>

<section
	id="comments"
	bind:this={section}
	class="post-comments"
	data-tts-exclude
	aria-labelledby={`${commentsId}-heading`}
>
	<header class="comments-header">
		<div>
			<p class="eyebrow">The conversation</p>
			<h2 id={`${commentsId}-heading`}>
				Comments
				{#if result}<span class="count">{result.commentCount.toLocaleString('en-GB')}</span>{/if}
			</h2>
		</div>
		{#if attempted}
			<button type="button" class="refresh" disabled={loading} onclick={() => loadPage()}>
				{loading ? 'Loading…' : 'Refresh comments'}
			</button>
		{/if}
	</header>
	<p class="introduction">
		Questions, thoughtful disagreements and your own experiences are welcome.
	</p>

	<div class="new-comment"><CommentForm {postSlug} /></div>

	<div class="published-comments" aria-busy={loading}>
		{#if !attempted}
			<p class="status">Published comments load when this section is in view.</p>
			<button type="button" class="secondary-button" onclick={() => loadPage(1)}
				>Load comments</button
			>
		{/if}
		{#if loading}<p class="status" role="status">Loading published comments…</p>{/if}
		{#if error}
			<p class="status" role="alert">{error}</p>
			<button
				type="button"
				class="secondary-button"
				disabled={loading}
				onclick={() => loadPage(lastRequestedPage)}>Try loading comments again</button
			>
		{/if}
		{#if result}
			{#if result.total === 0 && !loading}
				<div class="empty-state">
					<p class="empty-title">Start the conversation.</p>
					<p>No comments have been published yet. Leave a thought above for review.</p>
				</div>
			{:else}
				<p class="list-summary" aria-live="polite">
					{result.total.toLocaleString('en-GB')}
					{result.total === 1 ? 'thread' : 'threads'}
					<span aria-hidden="true">·</span> Page {result.page} of {pageCount}
				</p>
				<ul class="threads" aria-label="Published comments">
					{#each result.comments as comment (comment.id)}
						<li><CommentThread {comment} {postSlug} refreshVersion={revision} /></li>
					{/each}
				</ul>
				{#if pageCount > 1}
					<nav class="pagination" aria-label="Comment pages">
						<button
							type="button"
							class="secondary-button"
							disabled={loading || result.page <= 1}
							onclick={() => loadPage((result?.page ?? 1) - 1)}>Previous page</button
						>
						<span>{result.page} / {pageCount}</span>
						<button
							type="button"
							class="secondary-button"
							disabled={loading || result.page >= pageCount}
							onclick={() => loadPage((result?.page ?? 1) + 1)}>Next page</button
						>
					</nav>
				{/if}
			{/if}
		{/if}
	</div>
	<noscript><p class="status">Enable JavaScript to read and leave comments.</p></noscript>
</section>

<style>
	.post-comments {
		scroll-margin-top: 6rem;
		border-top: 1px solid var(--border);
		padding-top: 2.5rem;
		padding-bottom: 2rem;
		color: var(--foreground);
		font-family: var(--font-sans);
	}

	.comments-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.eyebrow {
		margin: 0 0 0.3rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 650;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h2 {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: clamp(1.55rem, 4vw, 1.9rem);
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.3;
	}

	.count {
		border: 1px solid var(--border);
		border-radius: 1rem;
		padding: 0.15rem 0.6rem;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		font-weight: 550;
		letter-spacing: 0;
	}

	.introduction {
		margin: 1rem 0 1.75rem;
		color: var(--muted-foreground);
		font-size: 0.95rem;
		line-height: 1.7;
	}

	.new-comment {
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		background: var(--muted);
		padding: clamp(1rem, 3vw, 1.5rem);
	}

	.published-comments {
		margin-top: 2rem;
	}

	button {
		min-height: 2.75rem;
		border-radius: 0.35rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.refresh {
		background: transparent;
		padding: 0.5rem 0;
		color: var(--muted-foreground);
	}

	.secondary-button {
		border: 1px solid var(--border);
		background: var(--card);
		padding: 0.6rem 0.85rem;
		color: var(--foreground);
	}

	.status,
	.list-summary {
		margin: 0 0 1rem;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.list-summary {
		font-size: 0.75rem;
	}

	.list-summary span {
		padding: 0 0.4rem;
	}

	.empty-state {
		border-bottom: 1px solid var(--border);
		padding: 0.5rem 0 1.5rem;
	}

	.empty-state p {
		margin: 0.35rem 0;
		color: var(--muted-foreground);
		font-size: 0.9rem;
		line-height: 1.7;
	}

	.empty-state .empty-title {
		color: var(--foreground);
		font-weight: 600;
	}

	.threads {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.threads > li {
		border-top: 1px solid var(--border);
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-top: 1px solid var(--border);
		padding-top: 1rem;
	}

	.pagination > span {
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}

	@media print {
		.post-comments {
			display: none;
		}
	}
</style>
