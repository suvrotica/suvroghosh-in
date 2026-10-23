<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteURLSearchParams } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { AdminComment, CommentStatus, ModerationPage } from '$lib/comments/types';

	type FilterStatus = CommentStatus | 'all';
	const filters: { value: FilterStatus; label: string }[] = [
		{ value: 'pending', label: 'Pending' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'hidden', label: 'Hidden' },
		{ value: 'all', label: 'All comments' }
	];
	let status = $state<FilterStatus>('pending');
	let post = $state('');
	let page = $state(1);
	let result = $state<ModerationPage | null>(null);
	let loading = $state(true);
	let loadError = $state('');
	let actionError = $state('');
	let notice = $state('');
	let workingId = $state<string | null>(null);
	let replyTarget = $state<string | null>(null);
	let replyDrafts = $state<Record<string, string>>({});
	let lastRefreshed = $state<Date | null>(null);
	let mounted = false;
	let fetching = false;
	let refreshQueued = false;
	let queueController: AbortController | null = null;
	let actionController: AbortController | null = null;
	const replyAttempts = new SvelteMap<string, { body: string; id: string }>();
	let totalPages = $derived(
		Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)))
	);

	function queryParameters(exportPage = false) {
		const query = new SvelteURLSearchParams({ status, page: String(page) });
		if (post) query.set('post', post);
		if (exportPage) query.set('export', '1');
		return query;
	}

	function formatDate(value: string | Date) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function articleFor(comment: AdminComment) {
		return result?.articles.find((article) => article.slug === comment.post_slug);
	}

	async function errorMessage(response: Response) {
		try {
			const payload = await response.json();
			if (typeof payload.message === 'string') return payload.message;
		} catch {
			// A proxy or expired session can return a non-JSON response.
		}
		if (response.status === 401 || response.status === 403) {
			return 'Your owner session has expired. Sign in again before continuing.';
		}
		return 'The comments service is unavailable. Please try again shortly.';
	}

	async function refreshQueue() {
		if (!mounted || document.hidden) return;
		if (fetching) {
			refreshQueued = true;
			return;
		}
		fetching = true;
		loading = true;
		const query = queryParameters().toString();
		const controller = new AbortController();
		queueController = controller;
		const timeout = window.setTimeout(() => controller.abort(), 12_000);
		try {
			const response = await fetch(`/api/notes/comments?${query}`, {
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) throw new Error(await errorMessage(response));
			const nextResult: ModerationPage = await response.json();
			if (!mounted || query !== queryParameters().toString()) return;
			result = nextResult;
			lastRefreshed = new Date();
			loadError = '';
			if (page > totalPages) {
				page = totalPages;
				refreshQueued = true;
			}
		} catch (error) {
			if (mounted && query === queryParameters().toString()) {
				loadError = controller.signal.aborted
					? 'Refreshing took too long. Your current queue is still shown; try again.'
					: error instanceof Error
						? error.message
						: 'The comments service is unavailable. Please try again shortly.';
			}
		} finally {
			window.clearTimeout(timeout);
			fetching = false;
			if (mounted) {
				loading = false;
				if (refreshQueued) {
					refreshQueued = false;
					void refreshQueue();
				}
			}
		}
	}

	function changeStatus(value: FilterStatus) {
		status = value;
		page = 1;
		void refreshQueue();
	}

	function changeArticle() {
		page = 1;
		void refreshQueue();
	}

	function changePage(next: number) {
		page = next;
		void refreshQueue();
	}

	async function performAction(comment: AdminComment, payload: Record<string, unknown>) {
		if (workingId) return false;
		workingId = comment.id;
		actionError = '';
		notice = '';
		const controller = new AbortController();
		actionController = controller;
		const timeout = window.setTimeout(() => controller.abort(), 15_000);
		try {
			const response = await fetch('/api/notes/comments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(await errorMessage(response));
			const reply = await response.json();
			if (!mounted) return false;
			notice = typeof reply.message === 'string' ? reply.message : 'Comment updated.';
			window.dispatchEvent(new Event('comments-updated'));
			await refreshQueue();
			return true;
		} catch (error) {
			if (mounted) {
				actionError = controller.signal.aborted
					? 'The request timed out. Refresh the queue to check its status before trying again. Your reply text has been kept.'
					: error instanceof Error
						? error.message
						: 'The comment could not be updated. Please try again.';
			}
			return false;
		} finally {
			window.clearTimeout(timeout);
			if (mounted) workingId = null;
		}
	}

	function moderate(comment: AdminComment, nextStatus: CommentStatus) {
		void performAction(comment, { action: 'moderate', id: comment.id, status: nextStatus });
	}

	async function sendReply(event: SubmitEvent, comment: AdminComment) {
		event.preventDefault();
		const body = (replyDrafts[comment.id] ?? '').trim();
		if (!body || workingId) return;
		let attempt = replyAttempts.get(comment.id);
		if (!attempt || attempt.body !== body) {
			attempt = { body, id: crypto.randomUUID() };
			replyAttempts.set(comment.id, attempt);
		}
		const success = await performAction(comment, {
			action: 'reply',
			parentId: comment.parent_id ?? comment.id,
			body,
			submissionId: attempt.id
		});
		if (success) {
			replyDrafts[comment.id] = '';
			replyAttempts.delete(comment.id);
			replyTarget = null;
		}
	}

	onMount(() => {
		mounted = true;
		void refreshQueue();
		const interval = window.setInterval(() => {
			if (!workingId) void refreshQueue();
		}, 30_000);
		const onVisible = () => {
			if (!document.hidden && !workingId) void refreshQueue();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			mounted = false;
			queueController?.abort();
			actionController?.abort();
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<SEO
	title="Comment moderation | SuvroGhosh.IN"
	description="Private comment moderation for the site owner."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<main class="moderation-board">
	<header class="board-header">
		<div>
			<p class="eyebrow">Private workspace · Reader conversations</p>
			<h1>Comments</h1>
			<p class="intro">
				Read, approve and reply. Reader submissions stay private until you approve them.
			</p>
		</div>
		<div class="queue-summary" aria-label="Comment queue totals">
			<div><strong>{result?.pending ?? '—'}</strong><span>awaiting approval</span></div>
			<div><strong>{result?.unread ?? '—'}</strong><span>unread</span></div>
		</div>
	</header>

	<noscript><p class="message error">Enable JavaScript to load and moderate comments.</p></noscript>

	<div class="queue-tools">
		<div class="status-filters" role="group" aria-label="Filter comments by status">
			{#each filters as filter (filter.value)}
				<button
					type="button"
					aria-pressed={status === filter.value}
					disabled={workingId !== null}
					onclick={() => changeStatus(filter.value)}>{filter.label}</button
				>
			{/each}
		</div>
		<div class="secondary-tools">
			<label>
				<span>Article</span>
				<select bind:value={post} onchange={changeArticle} disabled={workingId !== null}>
					<option value="">All articles</option>
					{#each result?.articles ?? [] as article (article.slug)}
						<option value={article.slug}>{article.title}</option>
					{/each}
				</select>
			</label>
			<button type="button" disabled={loading || workingId !== null} onclick={() => refreshQueue()}>
				{loading ? 'Refreshing…' : 'Refresh'}
			</button>
			<a class="export-link" href={resolve(`/api/notes/comments?${queryParameters(true)}`)} download
				>Export this page as JSON</a
			>
		</div>
	</div>

	{#if loadError}
		<p class="message error" role="alert">{loadError}</p>
	{/if}
	{#if actionError}
		<p class="message error" role="alert">{actionError}</p>
	{/if}
	{#if notice}
		<p class="message success" role="status">{notice}</p>
	{/if}

	<div class="queue-meta">
		<p aria-live="polite">
			{#if result}
				{result.total} {result.total === 1 ? 'comment' : 'comments'} in this view
			{:else if loading}
				Loading comments…
			{/if}
		</p>
		{#if lastRefreshed}<p>
				Updated {formatDate(lastRefreshed)} · refreshes while this tab is open
			</p>{/if}
	</div>

	<section class="comment-queue" aria-label="Moderation queue" aria-busy={loading}>
		{#if result?.comments.length === 0}
			<div class="empty-state">
				<h2>{status === 'pending' ? 'Your queue is clear' : 'No comments in this view'}</h2>
				<p>
					{status === 'pending'
						? 'New reader submissions will appear here for approval.'
						: 'Choose another status or article to continue.'}
				</p>
			</div>
		{:else}
			{#each result?.comments ?? [] as comment (comment.id)}
				{@const article = articleFor(comment)}
				{@const visibleParent = !comment.parent_id || comment.parent_status === 'approved'}
				<article
					class="comment-card"
					class:unread={!comment.read_at}
					aria-label={`Comment by ${comment.display_name}`}
				>
					<header class="comment-header">
						<div>
							<p class="article-link">
								{#if article}
									<a
										href={`${resolve(article.href as `/blog/${string}/${string}`)}#comments`}
										target="_blank"
										rel="noopener noreferrer"
										>{article.title} ↗<span class="sr-only">, opens in a new tab</span></a
									>
								{:else}
									{comment.post_slug}
								{/if}
							</p>
							<div class="identity">
								<strong>{comment.display_name}</strong>
								{#if comment.is_author}<span class="author-badge">Author</span>{/if}
								{#if !comment.read_at}<span class="unread-badge">Unread</span>{/if}
							</div>
							<time datetime={comment.created_at}>{formatDate(comment.created_at)}</time>
						</div>
						<span class="comment-status" data-status={comment.status}>{comment.status}</span>
					</header>

					{#if comment.parent_id}
						<blockquote class="parent-context">
							<p class="context-label">Reply to {comment.parent_display_name ?? 'a reader'}</p>
							<p>{comment.parent_body ?? 'Parent comment unavailable.'}</p>
						</blockquote>
						{#if !visibleParent}
							<p class="visibility-note">
								This reply stays off the page while its parent comment is {comment.parent_status ??
									'unavailable'}.
							</p>
						{/if}
					{/if}
					<p class="comment-body">{comment.body}</p>
					{#if !comment.parent_id && comment.reply_count > 0}
						<p class="thread-count">
							{comment.reply_count}
							{comment.reply_count === 1 ? 'reply' : 'replies'} in this thread
						</p>
					{/if}

					<div
						class="comment-actions"
						role="group"
						aria-label={`Actions for ${comment.display_name}'s comment`}
					>
						{#if comment.status !== 'approved'}
							<button
								class="approve"
								type="button"
								disabled={workingId !== null}
								onclick={() => moderate(comment, 'approved')}
							>
								{comment.status === 'hidden' ? 'Restore as approved' : 'Approve'}
							</button>
						{/if}
						{#if comment.status !== 'rejected'}
							<button
								type="button"
								disabled={workingId !== null}
								onclick={() => moderate(comment, 'rejected')}>Reject</button
							>
						{/if}
						{#if comment.status === 'approved'}
							<button
								type="button"
								disabled={workingId !== null}
								onclick={() => moderate(comment, 'hidden')}
								>Hide{comment.parent_id ? '' : ' thread'}</button
							>
						{/if}
						{#if comment.status !== 'pending'}
							<button
								type="button"
								disabled={workingId !== null}
								onclick={() => moderate(comment, 'pending')}>Return to pending</button
							>
						{/if}
						{#if !comment.read_at}
							<button
								type="button"
								disabled={workingId !== null}
								onclick={() => performAction(comment, { action: 'read', id: comment.id })}
								>Mark read</button
							>
						{/if}
						{#if comment.status === 'approved' && visibleParent}
							<button
								type="button"
								aria-expanded={replyTarget === comment.id}
								aria-controls={`reply-${comment.id}`}
								disabled={workingId !== null}
								onclick={() => (replyTarget = replyTarget === comment.id ? null : comment.id)}
								>Reply as author</button
							>
						{/if}
						{#if workingId === comment.id}<span class="action-progress" role="status">Saving…</span
							>{/if}
					</div>

					{#if replyTarget === comment.id && comment.status === 'approved' && visibleParent}
						<form
							id={`reply-${comment.id}`}
							class="reply-form"
							onsubmit={(event) => sendReply(event, comment)}
						>
							<label for={`reply-body-${comment.id}`}
								>Your author reply{comment.parent_id ? ' to this thread' : ''}</label
							>
							<textarea
								id={`reply-body-${comment.id}`}
								bind:value={replyDrafts[comment.id]}
								required
								maxlength="3000"
								rows="4"
								disabled={workingId !== null}
								placeholder="Continue the conversation…"
							></textarea>
							<p>Your reply publishes immediately on this approved thread.</p>
							<div>
								<button
									class="approve"
									type="submit"
									disabled={workingId !== null || !(replyDrafts[comment.id] ?? '').trim()}
									>Publish reply</button
								>
								<button
									type="button"
									disabled={workingId !== null}
									onclick={() => (replyTarget = null)}>Close</button
								>
							</div>
						</form>
					{/if}

					{#if comment.history?.length}
						<details class="moderation-history">
							<summary>Moderation history</summary>
							<ul>
								{#each comment.history as item, index (`${item.created_at}-${index}`)}
									<li>
										<span>{item.action.replaceAll('_', ' ')}</span><time datetime={item.created_at}
											>{formatDate(item.created_at)}</time
										>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</article>
			{/each}
		{/if}
	</section>

	{#if result && totalPages > 1}
		<nav class="pagination" aria-label="Comment pages">
			<button
				type="button"
				disabled={page <= 1 || loading || workingId !== null}
				onclick={() => changePage(page - 1)}>← Previous</button
			>
			<span>Page {page} of {totalPages}</span>
			<button
				type="button"
				disabled={page >= totalPages || loading || workingId !== null}
				onclick={() => changePage(page + 1)}>Next →</button
			>
		</nav>
	{/if}

	<footer class="board-note">
		Reading this queue does not mark comments read. Use “Mark read” or take a moderation action.
		JSON exports contain private submissions; each download includes only the selected page.
	</footer>
</main>

<style>
	.moderation-board {
		--board-paper: #fbfaf6;
		--board-surface: #f1efe8;
		--board-ink: #292820;
		--board-muted: #6b675e;
		--board-line: #d8d3c7;
		--board-accent: #2f665b;
		--board-tint: #e4eee8;
		--board-alert: #8d3c27;
		width: min(1160px, calc(100% - 2rem));
		margin: 2.5rem auto 5rem;
		color: var(--board-ink);
		font-family: var(--font-sans, sans-serif);
	}

	:global(.dark) .moderation-board {
		--board-paper: #24231f;
		--board-surface: #2d2b25;
		--board-ink: #eee9df;
		--board-muted: #b8b2a5;
		--board-line: #504b40;
		--board-accent: #a0d2bc;
		--board-tint: #293e34;
		--board-alert: #f2ac93;
	}

	.board-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--board-line);
	}

	.eyebrow {
		margin: 0 0 0.8rem;
		color: var(--board-muted);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: Georgia, serif;
		font-size: clamp(2.5rem, 6vw, 3.7rem);
		font-weight: 400;
		line-height: 1.1;
	}

	.intro {
		max-width: 38rem;
		margin: 1rem 0 0;
		color: var(--board-muted);
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.queue-summary {
		display: flex;
		flex-shrink: 0;
		gap: 2rem;
	}

	.queue-summary strong {
		display: block;
		font-family: Georgia, serif;
		font-size: 2.25rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}

	.queue-summary span,
	.queue-meta,
	.board-note {
		color: var(--board-muted);
		font-size: 0.78rem;
		line-height: 1.6;
	}

	.queue-tools {
		display: grid;
		gap: 1.2rem;
		padding: 1.4rem 0;
	}

	.status-filters,
	.secondary-tools,
	.comment-actions,
	.identity,
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
	}

	button,
	.export-link {
		min-height: 44px;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--board-line);
		border-radius: 6px;
		background: var(--board-paper);
		color: var(--board-ink);
		font: inherit;
		font-size: 0.82rem;
		line-height: 1.35;
		text-decoration: none;
	}

	button {
		cursor: pointer;
	}

	button:hover:not(:disabled),
	.export-link:hover {
		border-color: var(--board-accent);
		background: var(--board-surface);
	}

	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	button[aria-pressed='true'],
	button.approve {
		border-color: var(--board-accent);
		background: var(--board-tint);
		color: var(--board-accent);
	}

	button:focus-visible,
	a:focus-visible,
	select:focus-visible,
	textarea:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--board-accent);
		outline-offset: 3px;
	}

	.secondary-tools label {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		margin-right: auto;
		font-size: 0.8rem;
	}

	select,
	textarea {
		border: 1px solid var(--board-line);
		border-radius: 6px;
		background: var(--board-paper);
		color: var(--board-ink);
		font: inherit;
	}

	select {
		width: min(30rem, 50vw);
		min-height: 44px;
		padding: 0.6rem 2rem 0.6rem 0.7rem;
		font-size: 0.82rem;
		text-overflow: ellipsis;
	}

	.queue-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.3rem 1rem;
		margin: 0.5rem 0 1rem;
	}

	.queue-meta p {
		margin: 0;
	}

	.comment-queue {
		display: grid;
		gap: 1rem;
	}

	.comment-card {
		min-width: 0;
		padding: 1.5rem;
		border: 1px solid var(--board-line);
		border-radius: 10px;
		background: var(--board-paper);
	}

	.comment-card.unread {
		border-left: 3px solid var(--board-accent);
	}

	.comment-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.article-link {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	.article-link a {
		color: var(--board-accent);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}

	.identity {
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}

	.comment-header time {
		display: block;
		margin-top: 0.35rem;
		color: var(--board-muted);
		font-size: 0.75rem;
	}

	.comment-status,
	.author-badge,
	.unread-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: var(--board-surface);
		font-size: 0.7rem;
		font-weight: 500;
	}

	.comment-status {
		flex-shrink: 0;
		text-transform: capitalize;
	}

	.comment-status[data-status='approved'],
	.author-badge {
		background: var(--board-tint);
		color: var(--board-accent);
	}

	.unread-badge,
	.comment-status[data-status='pending'] {
		color: var(--board-alert);
	}

	.comment-body,
	.parent-context > p:last-child {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.comment-body {
		margin: 1.2rem 0;
		font-size: 0.95rem;
		line-height: 1.7;
	}

	.parent-context {
		margin: 1rem 0 0;
		padding: 0.8rem 1rem;
		border-left: 2px solid var(--board-line);
		background: var(--board-surface);
		color: var(--board-muted);
		font-size: 0.82rem;
		line-height: 1.6;
	}

	.parent-context p {
		margin: 0;
	}

	.parent-context .context-label {
		margin-bottom: 0.35rem;
		font-weight: 600;
	}

	.visibility-note {
		margin: 0.7rem 0;
		color: var(--board-alert);
		font-size: 0.8rem;
		line-height: 1.6;
	}

	.thread-count,
	.action-progress {
		color: var(--board-muted);
		font-size: 0.78rem;
	}

	.comment-actions {
		padding-top: 0.8rem;
		border-top: 1px solid var(--board-line);
	}

	.reply-form {
		display: grid;
		gap: 0.6rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--board-line);
	}

	.reply-form label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.reply-form textarea {
		width: 100%;
		min-height: 7rem;
		padding: 0.8rem;
		font-size: 0.9rem;
		line-height: 1.6;
		resize: vertical;
	}

	.reply-form p {
		margin: 0;
		color: var(--board-muted);
		font-size: 0.78rem;
	}

	.reply-form > div {
		display: flex;
		gap: 0.6rem;
	}

	.moderation-history {
		margin-top: 1rem;
		color: var(--board-muted);
		font-size: 0.76rem;
	}

	.moderation-history summary {
		width: fit-content;
		padding: 0.4rem 0;
		cursor: pointer;
	}

	.moderation-history ul {
		display: grid;
		gap: 0.4rem;
		margin: 0.5rem 0 0;
		padding-left: 1.2rem;
	}

	.moderation-history li time {
		margin-left: 1rem;
	}

	.message {
		padding: 1rem;
		border: 1px solid var(--board-line);
		border-radius: 6px;
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.error {
		color: var(--board-alert);
	}

	.success {
		background: var(--board-tint);
		color: var(--board-accent);
	}

	.empty-state {
		padding: 4rem 1.5rem;
		border: 1px dashed var(--board-line);
		border-radius: 10px;
		text-align: center;
	}

	.empty-state h2 {
		margin: 0 0 0.7rem;
		font-family: Georgia, serif;
		font-size: 1.7rem;
		font-weight: 400;
	}

	.empty-state p {
		margin: 0;
		color: var(--board-muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.pagination {
		justify-content: center;
		gap: 1rem;
		margin-top: 1.5rem;
		font-size: 0.8rem;
	}

	.board-note {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid var(--board-line);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 700px) {
		.moderation-board {
			margin-top: 2rem;
		}

		.board-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 1.5rem;
		}

		.queue-summary {
			gap: 2.5rem;
		}

		.secondary-tools label {
			width: 100%;
		}

		select {
			width: 100%;
			min-width: 0;
		}

		.comment-card {
			padding: 1rem;
		}

		.comment-header {
			gap: 0.5rem;
		}

		.moderation-history li time {
			display: block;
			margin-left: 0;
		}
	}
</style>
