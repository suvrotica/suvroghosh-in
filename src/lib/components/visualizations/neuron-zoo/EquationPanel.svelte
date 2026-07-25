<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		plainText: string;
		children?: Snippet;
	};

	let { title, plainText, children }: Props = $props();
	const uid = $props.id();
</script>

<section
	class="equation-panel rounded-lg border border-rule bg-paper-raised"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-plain-description`}
>
	<header class="border-b border-rule px-4 py-3 sm:px-5">
		<h3 id={`${uid}-title`} class="m-0 text-base font-bold text-ink">{title}</h3>
	</header>

	<div class="px-4 py-4 sm:px-5">
		<p id={`${uid}-plain-description`} class="sr-only">Equation in plain text: {plainText}</p>

		{#if children}
			<div class="equation-rendered overflow-x-auto" aria-describedby={`${uid}-plain-description`}>
				{@render children()}
			</div>
			<details class="mt-3 border-t border-rule pt-2">
				<summary class="flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink">
					Plain-text equation
				</summary>
				<code class="plain-equation block rounded bg-paper-soft p-3 text-sm text-ink">
					{plainText}
				</code>
			</details>
		{:else}
			<code class="plain-equation block overflow-x-auto rounded bg-paper-soft p-3 text-sm text-ink">
				{plainText}
			</code>
		{/if}
	</div>
</section>

<style>
	.equation-panel {
		--paper-raised: #0d1118;
		--paper-soft: #070a0f;
		--ink: #eef2f6;
		--rule: #303744;
		--focus: #f4d58d;
	}

	.equation-rendered {
		overscroll-behavior-inline: contain;
	}

	.plain-equation {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		line-height: 1.65;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	details > summary {
		touch-action: manipulation;
	}

	@media (prefers-reduced-motion: reduce) {
		details,
		summary {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.equation-panel,
		details {
			border-color: CanvasText;
		}
	}
</style>
