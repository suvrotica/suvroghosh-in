<script lang="ts">
	import { onMount } from 'svelte';

	let { title, preparePrint }: { title: string; preparePrint?: () => void | Promise<void> } =
		$props();

	let enhanced = $state(false);
	let canShare = $state(false);
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	function announce(message: string) {
		status = message;
		if (statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => {
			status = '';
		}, 3500);
	}

	function copyWithSelection(text: string) {
		const previouslyFocused = document.activeElement;
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.top = '0';
		textarea.style.left = '0';
		textarea.style.opacity = '0';
		document.body.append(textarea);

		try {
			textarea.select();
			return document.execCommand('copy');
		} finally {
			textarea.remove();
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
		}
	}

	async function writeLink() {
		const url = window.location.href;

		if (navigator.clipboard && window.isSecureContext) {
			try {
				await navigator.clipboard.writeText(url);
				return true;
			} catch {
				// Fall through to the selection-based copy method.
			}
		}

		return copyWithSelection(url);
	}

	async function copyLink() {
		const copied = await writeLink();
		announce(copied ? 'Link copied.' : 'Could not copy. Select the address from your browser.');
	}

	async function shareArticle() {
		try {
			await navigator.share({ title, url: window.location.href });
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;

			const copied = await writeLink();
			announce(
				copied ? 'Sharing was unavailable. Link copied.' : 'Sharing and copying were unavailable.'
			);
		}
	}

	async function printArticle() {
		try {
			await preparePrint?.();
		} finally {
			window.print();
		}
	}

	onMount(() => {
		enhanced = true;
		canShare = typeof navigator.share === 'function';

		return () => {
			if (statusTimer) clearTimeout(statusTimer);
		};
	});
</script>

{#if enhanced}
	<div
		class="article-actions mt-6 flex flex-wrap items-center gap-2 print:hidden"
		role="group"
		aria-label="Article actions"
	>
		{#if canShare}
			<button
				type="button"
				onclick={shareArticle}
				class="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					class="h-4 w-4 fill-none stroke-current"
					stroke-width="2"
				>
					<circle cx="18" cy="5" r="3" />
					<circle cx="6" cy="12" r="3" />
					<circle cx="18" cy="19" r="3" />
					<path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
				</svg>
				Share
			</button>
		{/if}

		<button
			type="button"
			onclick={copyLink}
			class="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				class="h-4 w-4 fill-none stroke-current"
				stroke-width="2"
			>
				<rect x="9" y="9" width="11" height="11" rx="2" />
				<path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
			</svg>
			Copy link
		</button>

		<button
			type="button"
			onclick={printArticle}
			class="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				class="h-4 w-4 fill-none stroke-current"
				stroke-width="2"
			>
				<path
					d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
				/>
				<path d="M6 14h12v7H6z" />
			</svg>
			Print
		</button>

		<span
			class="min-h-5 basis-full text-sm font-medium text-neutral-500 sm:basis-auto dark:text-neutral-400"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			{status}
		</span>
	</div>
{/if}
