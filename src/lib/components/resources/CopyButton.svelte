<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ResourceKind } from '$lib/content/resources';

	let {
		copyText,
		kind,
		title,
		class: className = ''
	}: {
		copyText: string;
		kind: ResourceKind;
		title: string;
		class?: string;
	} = $props();

	type CopyState = 'idle' | 'copied' | 'failed';

	let state = $state<CopyState>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	let idleLabel = $derived(kind === 'prompt' ? 'Copy prompt' : 'Copy list');
	let visibleLabel = $derived(
		state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : idleLabel
	);

	function fallbackCopy(value: string) {
		const previousFocus = document.activeElement;
		const textarea = document.createElement('textarea');
		textarea.value = value;
		textarea.readOnly = true;
		textarea.setAttribute('aria-hidden', 'true');
		textarea.style.position = 'fixed';
		textarea.style.inset = '0 auto auto -10000px';
		textarea.style.width = '1px';
		textarea.style.height = '1px';
		textarea.style.opacity = '0';
		document.body.append(textarea);

		let copied: boolean;
		try {
			textarea.focus({ preventScroll: true });
			textarea.select();
			textarea.setSelectionRange(0, textarea.value.length);
			copied = document.execCommand('copy');
		} finally {
			textarea.remove();
			if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
		}
		return copied;
	}

	async function copy() {
		if (resetTimer) clearTimeout(resetTimer);

		let copied = false;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(copyText);
				copied = true;
			}
		} catch {
			// A user-gesture-preserving selection fallback is attempted below.
		}

		if (!copied) {
			try {
				copied = fallbackCopy(copyText);
			} catch {
				copied = false;
			}
		}

		state = copied ? 'copied' : 'failed';
		resetTimer = setTimeout(() => {
			state = 'idle';
			resetTimer = undefined;
		}, 2000);
	}

	onDestroy(() => {
		if (resetTimer) clearTimeout(resetTimer);
	});
</script>

<div class="inline-flex min-w-0 flex-col items-start">
	<button
		type="button"
		onclick={copy}
		data-copy-button
		data-state={state}
		aria-label={`${visibleLabel}: ${title}`}
		class="inline-flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 {state ===
		'copied'
			? 'border-emerald-700 bg-emerald-50 text-emerald-900 focus-visible:outline-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200 dark:focus-visible:outline-emerald-300'
			: state === 'failed'
				? 'border-red-700 bg-red-50 text-red-900 focus-visible:outline-red-700 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200 dark:focus-visible:outline-red-300'
				: 'border-neutral-400 bg-white text-neutral-900 hover:border-neutral-600 hover:bg-neutral-100 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-400 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300'} {className}"
	>
		<span aria-hidden="true">{state === 'copied' ? '✓' : state === 'failed' ? '×' : '⧉'}</span>
		<span>{visibleLabel}</span>
	</button>
	<span class="sr-only" aria-live="polite" aria-atomic="true" data-copy-status>
		{state === 'copied'
			? `${title} copied to the clipboard.`
			: state === 'failed'
				? `${title} could not be copied. Select the resource text manually.`
				: ''}
	</span>
</div>
