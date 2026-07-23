<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { downloadPdf, downloadPng } from '$lib/notes/export';
	import { zoomAround } from '$lib/notes/geometry';
	import { InkEditorState } from '$lib/notes/editor-state.svelte';
	import type { NoteDocument } from '$lib/notes/model';
	import InkCanvas from './InkCanvas.svelte';

	type Props = {
		document: NoteDocument;
		title: string;
		downloadsEnabled?: boolean;
	};

	let { document, title, downloadsEnabled = false }: Props = $props();
	let shell: HTMLDivElement;
	let editor = new InkEditorState(untrack(() => document));
	let message = $state('');

	function fit() {
		editor.fitToContent(shell.clientWidth, shell.clientHeight, 52);
	}

	function zoom(factor: number) {
		editor.setViewport(
			zoomAround(
				editor.viewport,
				{ x: shell.clientWidth / 2, y: shell.clientHeight / 2 },
				editor.viewport.zoom * factor
			)
		);
	}

	async function fullscreen() {
		try {
			if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			message = 'Fullscreen is not available in this browser.';
		}
	}

	async function download(format: 'png' | 'pdf') {
		message = `Preparing ${format.toUpperCase()}…`;
		try {
			if (format === 'png') await downloadPng(editor.document);
			else await downloadPdf(editor.document);
			message = `${format.toUpperCase()} downloaded.`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'The download could not be created.';
		}
	}

	onMount(() => {
		requestAnimationFrame(fit);
	});
</script>

<div bind:this={shell} class="note-viewer">
	<InkCanvas {editor} readOnly label={`Read-only canvas: ${title}`} />

	<div class="viewer-controls" role="toolbar" aria-label="Note view controls">
		<button type="button" onclick={() => zoom(0.82)} aria-label="Zoom out">−</button>
		<span aria-live="polite">{Math.round(editor.viewport.zoom * 100)}%</span>
		<button type="button" onclick={() => zoom(1.22)} aria-label="Zoom in">+</button>
		<button type="button" onclick={fit}>Fit</button>
		<button type="button" onclick={() => void fullscreen()}>Full screen</button>
		{#if downloadsEnabled}
			<button type="button" onclick={() => void download('png')}>PNG</button>
			<button type="button" onclick={() => void download('pdf')}>PDF</button>
		{/if}
	</div>

	{#if message}
		<div class="viewer-message" role="status" aria-live="polite">{message}</div>
	{/if}
</div>

<style>
	.note-viewer {
		position: relative;
		width: 100%;
		height: min(72vh, 52rem);
		min-height: 28rem;
		overflow: hidden;
		border: 1px solid var(--rule, #cfc2ab);
		border-radius: 0.75rem;
		background: #fbf7ec;
		box-shadow: 0 14px 45px rgb(43 36 28 / 10%);
	}

	.viewer-controls {
		position: absolute;
		top: max(0.65rem, env(safe-area-inset-top));
		left: 50%;
		z-index: 20;
		display: flex;
		max-width: calc(100% - 1rem);
		transform: translateX(-50%);
		align-items: center;
		gap: 0.2rem;
		overflow-x: auto;
		border: 1px solid rgb(108 95 76 / 40%);
		border-radius: 999px;
		background: rgb(255 250 240 / 92%);
		padding: 0.3rem;
		box-shadow: 0 5px 20px rgb(43 36 28 / 14%);
		backdrop-filter: blur(12px);
	}

	.viewer-controls button {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		padding: 0.4rem 0.65rem;
		color: #463d31;
		font-size: 0.75rem;
		font-weight: 750;
		white-space: nowrap;
		cursor: pointer;
	}

	.viewer-controls button:hover {
		background: #e9dfcd;
	}

	.viewer-controls button:focus-visible {
		outline: 3px solid #2f6b60;
		outline-offset: 2px;
	}

	.viewer-controls span {
		min-width: 3rem;
		text-align: center;
		color: #655947;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.viewer-message {
		position: absolute;
		inset: auto auto 1rem 50%;
		z-index: 20;
		transform: translateX(-50%);
		border-radius: 999px;
		background: rgb(43 36 28 / 90%);
		padding: 0.5rem 0.8rem;
		color: white;
		font-size: 0.75rem;
	}

	.note-viewer:fullscreen {
		width: 100vw;
		height: 100dvh;
		border: 0;
		border-radius: 0;
	}

	@media (max-width: 38rem) {
		.note-viewer {
			height: 66dvh;
			min-height: 24rem;
			border-radius: 0.5rem;
		}
	}
</style>
