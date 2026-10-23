<script lang="ts">
	import type { PublicComment } from '$lib/comments/types';

	let { comment }: { comment: PublicComment } = $props();
	let initials = $derived(
		comment.display_name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => Array.from(part)[0] ?? '')
			.join('')
			.toLocaleUpperCase('en-GB')
	);
	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	function formatDate(date: string) {
		const parsed = new Date(date);
		return Number.isFinite(parsed.getTime()) ? dateFormatter.format(parsed) : '';
	}
</script>

<div class="comment-content">
	<span class:author-avatar={comment.is_author} class="avatar" aria-hidden="true">{initials}</span>
	<div class="content">
		<div class="meta">
			<span class="name">{comment.display_name}</span>
			{#if comment.is_author}<span class="author-badge">Author</span>{/if}
			<time datetime={comment.created_at}>{formatDate(comment.created_at)}</time>
		</div>
		<p class="body">{comment.body}</p>
	</div>
</div>

<style>
	.comment-content {
		display: grid;
		grid-template-columns: 2.25rem minmax(0, 1fr);
		gap: 0.8rem;
	}

	.avatar {
		display: flex;
		width: 2.25rem;
		height: 2.25rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--muted);
		color: var(--foreground);
		font-size: 0.7rem;
		font-weight: 650;
	}

	.author-avatar {
		background: var(--primary);
		color: var(--primary-foreground);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.6rem;
		min-height: 1.6rem;
		font-size: 0.78rem;
	}

	.name {
		overflow-wrap: anywhere;
		font-size: 0.9rem;
		font-weight: 650;
	}

	time {
		color: var(--muted-foreground);
	}

	.author-badge {
		border-radius: 0.25rem;
		background: var(--primary);
		padding: 0.1rem 0.4rem;
		color: var(--primary-foreground);
		font-size: 0.65rem;
		font-weight: 650;
	}

	.body {
		margin: 0.25rem 0 0;
		color: var(--foreground);
		font-size: 0.95rem;
		line-height: 1.75;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	@media (max-width: 30rem) {
		.comment-content {
			grid-template-columns: 1.8rem minmax(0, 1fr);
			gap: 0.6rem;
		}

		.avatar {
			width: 1.8rem;
			height: 1.8rem;
			font-size: 0.6rem;
		}
	}
</style>
