<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { children }: { children: Snippet } = $props();
	let pending = $state<number | null>(null);
	let unread = $state(0);
	// The editor owns its full-viewport canvas and existing Back to studio control.
	let showWorkspaceNav = $derived(
		page.route.id !== '/notes/studio/[id]' && page.route.id !== '/notes/studio/[id]/preview'
	);

	onMount(() => {
		let busy = false;
		let disposed = false;
		let controller: AbortController | null = null;

		async function refreshCounts() {
			if (busy || disposed || document.hidden) return;
			busy = true;
			controller = new AbortController();
			const timeout = window.setTimeout(() => controller?.abort(), 12_000);
			try {
				const response = await fetch('/api/notes/comments?counts=1', {
					cache: 'no-store',
					signal: controller.signal
				});
				if (!response.ok) return;
				const counts = await response.json();
				if (
					!disposed &&
					Number.isSafeInteger(counts.pending) &&
					counts.pending >= 0 &&
					Number.isSafeInteger(counts.unread) &&
					counts.unread >= 0
				) {
					pending = counts.pending;
					unread = counts.unread;
				}
			} catch {
				// Comments configuration must not interrupt the existing Notes workspace.
			} finally {
				window.clearTimeout(timeout);
				busy = false;
			}
		}

		void refreshCounts();
		const interval = window.setInterval(() => void refreshCounts(), 60_000);
		const refresh = () => void refreshCounts();
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('comments-updated', refresh);
		return () => {
			disposed = true;
			controller?.abort();
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('comments-updated', refresh);
		};
	});
</script>

{#if showWorkspaceNav}
	<nav class="workspace-nav" aria-label="Owner workspace">
		<a
			href={resolve('/notes/studio')}
			aria-current={page.url.pathname === '/notes/studio' ? 'page' : undefined}>Notes studio</a
		>
		<a
			href={resolve('/notes/studio/analytics')}
			aria-current={page.url.pathname.startsWith('/notes/studio/analytics') ? 'page' : undefined}
			>Analytics</a
		>
		<a
			href={resolve('/notes/studio/comments')}
			aria-current={page.url.pathname === '/notes/studio/comments' ? 'page' : undefined}
		>
			Comments
			{#if pending !== null}
				<span class="pending-count" aria-label={`${pending} pending comments`}>{pending}</span>
			{/if}
			{#if unread > 0}
				<span class="unread-dot" title={`${unread} unread comments`}>
					<span class="sr-only">{unread} unread</span>
				</span>
			{/if}
		</a>
	</nav>
{/if}

{@render children()}

<style>
	.workspace-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		width: min(1400px, calc(100% - 2rem));
		margin: 1rem auto 0;
		font-family: var(--font-sans, sans-serif);
		font-size: 0.85rem;
	}

	.workspace-nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
		padding: 0.5rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 999px;
		color: #62605c;
		text-decoration: none;
	}

	.workspace-nav a:hover,
	.workspace-nav a[aria-current='page'] {
		border-color: #cfcac0;
		background: #f0eee8;
		color: #272620;
	}

	.workspace-nav a:focus-visible {
		outline: 2px solid #347269;
		outline-offset: 3px;
	}

	.pending-count {
		min-width: 1.5rem;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: #dedad0;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.unread-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #ac4c2f;
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

	:global(.dark) .workspace-nav a {
		color: #b9b5ad;
	}

	:global(.dark) .workspace-nav a:hover,
	:global(.dark) .workspace-nav a[aria-current='page'] {
		border-color: #504c44;
		background: #282720;
		color: #f1ede4;
	}

	:global(.dark) .pending-count {
		background: #49453b;
	}

	:global(.dark) .unread-dot {
		background: #f0a384;
	}
</style>
