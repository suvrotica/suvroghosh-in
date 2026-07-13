<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeSelect from '$lib/components/layout/ThemeSelect.svelte';

	const dialogId = 'site-command-palette';
	const quickLinks = [
		{ href: '/', label: 'Home', description: 'Return to the main page' },
		{ href: '/start-here', label: 'Start Here', description: 'Follow five curated reading paths' },
		{ href: '/writing', label: 'Writing', description: 'Browse the reading room' },
		{ href: '/blog', label: 'All posts', description: 'Search the complete archive' },
		{ href: '/blog/topics', label: 'Topics', description: 'Follow recurring subjects' },
		{ href: '/consulting', label: 'Healthcare IT', description: 'Consulting and systems work' },
		{ href: '/resume', label: 'Resume', description: 'Experience and capabilities' },
		{ href: '/contact', label: 'Contact', description: 'Start a conversation' }
	] as const;

	let dialog: HTMLDialogElement;
	let searchInput: HTMLInputElement;
	let query = $state('');

	function isEditableTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function openPalette() {
		if (!dialog || dialog.open) return;

		query = '';
		dialog.showModal();
		requestAnimationFrame(() => searchInput?.focus());
	}

	function enhanceTrigger(event: MouseEvent) {
		event.preventDefault();
		openPalette();
	}

	function closePalette() {
		if (dialog?.open) dialog.close();
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;

		event.preventDefault();
		closePalette();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			event.key.toLocaleLowerCase('en') !== 'k' ||
			(!event.ctrlKey && !event.metaKey) ||
			event.altKey ||
			event.shiftKey ||
			isEditableTarget(event.target)
		) {
			return;
		}

		event.preventDefault();
		openPalette();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<a
	href={resolve('/blog')}
	onclick={enhanceTrigger}
	class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
	aria-label="Open search and shortcuts"
	aria-haspopup="dialog"
	aria-controls={dialogId}
	aria-keyshortcuts="Control+K Meta+K"
>
	<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
		/>
	</svg>
</a>

<dialog
	bind:this={dialog}
	id={dialogId}
	aria-labelledby="command-palette-title"
	aria-describedby="command-palette-description"
	onkeydown={handleDialogKeydown}
	class="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-xl border border-neutral-300 bg-neutral-50 p-0 text-neutral-950 shadow-2xl backdrop:bg-neutral-950/70 backdrop:backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
>
	<div class="p-4 sm:p-6">
		<header class="mb-5 flex items-start justify-between gap-4">
			<div>
				<h2 id="command-palette-title" class="m-0 text-xl font-bold sm:text-2xl">
					Search &amp; shortcuts
				</h2>
				<p
					id="command-palette-description"
					class="mt-1 mb-0 text-left text-sm text-neutral-600 dark:text-neutral-400"
				>
					Search the library or move directly to a major section.
				</p>
			</div>
			<button
				type="button"
				onclick={closePalette}
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
				aria-label="Close search and shortcuts"
			>
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18 18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</header>

		<form action={resolve('/blog')} method="get" role="search" class="mb-6">
			<label for="command-search" class="sr-only">Search all writing</label>
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					bind:this={searchInput}
					bind:value={query}
					id="command-search"
					name="search"
					type="search"
					placeholder="Search titles, topics, and article text"
					autocomplete="off"
					class="min-h-11 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-950 shadow-sm placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:outline-neutral-300"
				/>
				<button
					type="submit"
					class="min-h-11 rounded-md bg-neutral-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white dark:focus-visible:outline-neutral-300"
				>
					Search writing
				</button>
			</div>
		</form>

		<section aria-labelledby="quick-destinations-heading">
			<h3
				id="quick-destinations-heading"
				class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Quick destinations
			</h3>
			<ul class="grid gap-2 sm:grid-cols-2">
				{#each quickLinks as link (link.href)}
					<li>
						<a
							href={resolve(link.href)}
							onclick={closePalette}
							class="group flex min-h-14 items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 py-2 no-underline transition-colors hover:border-neutral-400 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
						>
							<span>
								<span class="block text-sm font-semibold text-neutral-900 dark:text-neutral-100"
									>{link.label}</span
								>
								<span class="block text-xs text-neutral-500 dark:text-neutral-400"
									>{link.description}</span
								>
							</span>
							<span
								aria-hidden="true"
								class="text-neutral-400 transition-transform group-hover:translate-x-0.5">→</span
							>
						</a>
					</li>
				{/each}
			</ul>
		</section>

		<div class="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
			<ThemeSelect id="palette-theme" variant="menu" />
			<p class="mt-3 mb-0 text-center text-xs text-neutral-500 dark:text-neutral-400">
				<kbd class="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
					>Ctrl/⌘ K</kbd
				>
				opens this panel ·
				<kbd class="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
					>Esc</kbd
				>
				closes it
			</p>
		</div>
	</div>
</dialog>
