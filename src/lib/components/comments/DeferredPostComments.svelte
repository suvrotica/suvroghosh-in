<script lang="ts">
	import { onMount, type Component } from 'svelte';

	let { postSlug }: { postSlug: string } = $props();
	const headingId = $props.id();
	let container: HTMLDivElement;
	let Comments = $state<Component<{ postSlug: string }> | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let observer: IntersectionObserver | undefined;
	let disposed = false;

	async function loadComments() {
		if (Comments || loading || disposed) return;
		observer?.disconnect();
		loading = true;
		failed = false;
		try {
			const module = await import('./PostComments.svelte');
			if (!disposed) Comments = module.default;
		} catch {
			if (!disposed) failed = true;
		} finally {
			if (!disposed) loading = false;
		}
	}

	onMount(() => {
		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) void loadComments();
				},
				{ rootMargin: '250px' }
			);
			observer.observe(container);
		} else {
			void loadComments();
		}
		return () => {
			disposed = true;
			observer?.disconnect();
		};
	});
</script>

<div bind:this={container} data-comments-loader data-tts-exclude>
	{#if Comments}
		<Comments {postSlug} />
	{:else}
		<section
			id="comments"
			aria-labelledby={headingId}
			class="scroll-mt-24 border-t border-neutral-300 pt-10 pb-8 font-sans dark:border-neutral-700"
		>
			<h2 id={headingId} class="m-0 text-2xl font-bold tracking-tight">Comments</h2>
			<p class="mt-4 mb-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
				Read the conversation or leave a thought for review. Comments load when this section is in
				view.
			</p>
			{#if failed}
				<p role="alert" class="mb-4 text-sm">Comments could not be loaded. Please try again.</p>
			{/if}
			<button
				type="button"
				disabled={loading}
				onclick={loadComments}
				class="min-h-11 rounded border border-neutral-400 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-neutral-600"
			>
				{loading ? 'Loading comments…' : failed ? 'Try loading comments again' : 'Load comments'}
			</button>
			<noscript><p class="mt-4 text-sm">Enable JavaScript to read and leave comments.</p></noscript>
		</section>
	{/if}
</div>
