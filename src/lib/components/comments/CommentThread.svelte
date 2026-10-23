<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { CommentPage, PublicComment } from '$lib/comments/types';
	import CommentContent from './CommentContent.svelte';
	import CommentForm from './CommentForm.svelte';

	let {
		comment,
		postSlug,
		refreshVersion
	}: { comment: PublicComment; postSlug: string; refreshVersion: number } = $props();
	const threadId = $props.id();
	let expanded = $state(false);
	let replying = $state(false);
	let replies = $state<PublicComment[]>([]);
	let replyTotal = $state<number | null>(null);
	let replyPage = $state(0);
	let loading = $state(false);
	let error = $state('');
	let controller: AbortController | undefined;
	let disposed = false;
	let lastRefreshVersion = -1;
	let visibleReplyCount = $derived(replyTotal ?? comment.reply_count);

	$effect(() => {
		if (refreshVersion === lastRefreshVersion) return;
		lastRefreshVersion = refreshVersion;
		controller?.abort();
		controller = undefined;
		expanded = false;
		replies = [];
		replyTotal = null;
		replyPage = 0;
		loading = false;
		error = '';
	});

	async function loadReplies() {
		if (loading) return;
		loading = true;
		error = '';
		const requestController = new AbortController();
		controller = requestController;
		const timeout = setTimeout(() => requestController.abort(), 15_000);
		try {
			const query = new URLSearchParams({
				post: postSlug,
				parent: comment.id,
				page: String(replyPage + 1)
			});
			const response = await fetch(`/api/comments?${query}`, {
				credentials: 'omit',
				cache: 'no-store',
				signal: requestController.signal
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !Array.isArray(result?.comments)) {
				throw new Error(
					typeof result?.message === 'string' ? result.message : 'Replies could not be loaded.'
				);
			}
			if (disposed || controller !== requestController) return;
			const page = result as CommentPage;
			const existingIds = new Set(replies.map((reply) => reply.id));
			replies = [...replies, ...page.comments.filter((reply) => !existingIds.has(reply.id))];
			replyTotal = page.total;
			replyPage = page.page;
		} catch (cause) {
			if (disposed || controller !== requestController) return;
			error = requestController.signal.aborted
				? 'Loading replies took too long. Please try again.'
				: cause instanceof Error
					? cause.message
					: 'Replies could not be loaded. Please try again.';
		} finally {
			clearTimeout(timeout);
			if (!disposed && controller === requestController) loading = false;
		}
	}

	function toggleReplies() {
		expanded = !expanded;
		if (expanded && replyPage === 0) void loadReplies();
	}

	onDestroy(() => {
		disposed = true;
		controller?.abort();
	});
</script>

<article class="thread" aria-label={`Comment by ${comment.display_name}`}>
	<CommentContent {comment} />
	<div class="thread-actions">
		<button
			type="button"
			aria-expanded={replying}
			aria-controls={`${threadId}-form`}
			onclick={() => (replying = !replying)}
			>Reply<span class="sr-only"> to {comment.display_name}</span></button
		>
		{#if visibleReplyCount > 0 || expanded}
			<button
				type="button"
				class="replies-toggle"
				aria-expanded={expanded}
				aria-controls={`${threadId}-replies`}
				onclick={toggleReplies}
			>
				<span aria-hidden="true">{expanded ? '−' : '+'}</span>
				{expanded ? 'Hide' : 'View'}
				{visibleReplyCount}
				{visibleReplyCount === 1 ? 'reply' : 'replies'}
			</button>
		{/if}
	</div>
	{#if replying}
		<div id={`${threadId}-form`} class="reply-form">
			<CommentForm {postSlug} parentId={comment.id} oncancel={() => (replying = false)} />
		</div>
	{/if}
	{#if expanded}
		<div id={`${threadId}-replies`} class="replies" aria-busy={loading}>
			<ul aria-label={`Replies to ${comment.display_name}`}>
				{#each replies as reply (reply.id)}
					<li><CommentContent comment={reply} /></li>
				{/each}
			</ul>
			{#if loading}<p class="status" role="status">Loading replies…</p>{/if}
			{#if error}
				<p class="status" role="alert">{error}</p>
				<button type="button" onclick={loadReplies}>Try loading replies again</button>
			{:else if !loading && replyPage > 0 && replies.length === 0}
				<p class="status">There are no published replies in this thread.</p>
			{:else if !loading && replies.length < visibleReplyCount}
				<button type="button" onclick={loadReplies}>Load more replies</button>
			{/if}
		</div>
	{/if}
</article>

<style>
	.thread {
		padding: 1.6rem 0;
	}

	.thread-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1rem;
		margin: 0.35rem 0 0 3.05rem;
	}

	button {
		min-height: 2.75rem;
		border-radius: 0.3rem;
		background: transparent;
		padding: 0.4rem 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover {
		color: var(--foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}

	.replies-toggle {
		color: var(--foreground);
	}

	.replies-toggle span {
		display: inline-block;
		width: 1rem;
	}

	.reply-form,
	.replies {
		margin: 0.75rem 0 0 3.05rem;
		border-inline-start: 1px solid var(--border);
		padding-inline-start: 1.2rem;
	}

	.reply-form {
		padding-top: 0.5rem;
		padding-bottom: 0.5rem;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		margin-top: 1.4rem;
	}

	.status {
		margin: 0.8rem 0;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	@media (max-width: 30rem) {
		.thread-actions,
		.reply-form,
		.replies {
			margin-inline-start: 2.4rem;
		}

		.reply-form,
		.replies {
			padding-inline-start: 0.75rem;
		}
	}
</style>
