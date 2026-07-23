<script lang="ts">
	import { onMount } from 'svelte';
	import { documentBounds, objectBounds, screenToWorld } from '$lib/notes/geometry';
	import type { InkEditorState } from '$lib/notes/editor-state.svelte';

	type Props = {
		editor: InkEditorState;
		surfaceWidth: number;
		surfaceHeight: number;
	};

	let { editor, surfaceWidth, surfaceHeight }: Props = $props();
	let canvas: HTMLCanvasElement;
	let width = 168;
	let height = 112;

	function paint() {
		if (!canvas) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#f8f2e5';
		context.fillRect(0, 0, width, height);
		const bounds = documentBounds(editor.document, 120);
		const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
		const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
		const scale = Math.min((width - 12) / contentWidth, (height - 12) / contentHeight);
		const offsetX = (width - contentWidth * scale) / 2 - bounds.minX * scale;
		const offsetY = (height - contentHeight * scale) / 2 - bounds.minY * scale;

		for (const object of editor.document.objects) {
			if (object.hidden) continue;
			const objectBox = objectBounds(object);
			context.fillStyle =
				object.type === 'image' ? '#7f8f87' : object.type === 'tile' ? '#d4c7ad' : '#4f4a40';
			context.globalAlpha = object.type === 'tile' ? 0.45 : 0.72;
			context.fillRect(
				objectBox.minX * scale + offsetX,
				objectBox.minY * scale + offsetY,
				Math.max(1.5, (objectBox.maxX - objectBox.minX) * scale),
				Math.max(1.5, (objectBox.maxY - objectBox.minY) * scale)
			);
		}
		context.globalAlpha = 1;

		const topLeft = screenToWorld({ x: 0, y: 0 }, editor.viewport);
		const bottomRight = screenToWorld({ x: surfaceWidth, y: surfaceHeight }, editor.viewport);
		context.strokeStyle = '#2f6b60';
		context.lineWidth = 1.5;
		context.strokeRect(
			topLeft.x * scale + offsetX,
			topLeft.y * scale + offsetY,
			(bottomRight.x - topLeft.x) * scale,
			(bottomRight.y - topLeft.y) * scale
		);
	}

	function navigate(event: MouseEvent) {
		const rectangle = canvas.getBoundingClientRect();
		const bounds = documentBounds(editor.document, 120);
		const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
		const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
		const scale = Math.min((width - 12) / contentWidth, (height - 12) / contentHeight);
		const offsetX = (width - contentWidth * scale) / 2 - bounds.minX * scale;
		const offsetY = (height - contentHeight * scale) / 2 - bounds.minY * scale;
		const minimapX =
			event.detail === 0 ? width / 2 : (event.clientX - rectangle.left) * (width / rectangle.width);
		const minimapY =
			event.detail === 0
				? height / 2
				: (event.clientY - rectangle.top) * (height / rectangle.height);
		const worldX = (minimapX - offsetX) / scale;
		const worldY = (minimapY - offsetY) / scale;
		editor.setViewport({
			...editor.viewport,
			x: surfaceWidth / 2 - worldX * editor.viewport.zoom,
			y: surfaceHeight / 2 - worldY * editor.viewport.zoom
		});
	}

	onMount(paint);

	$effect(() => {
		void editor.document;
		void editor.viewport;
		void surfaceWidth;
		void surfaceHeight;
		paint();
	});
</script>

<button
	type="button"
	class="ink-minimap"
	aria-label="Canvas minimap. Click to move the viewport."
	onclick={navigate}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
</button>

<style>
	.ink-minimap {
		position: absolute;
		right: max(0.75rem, env(safe-area-inset-right));
		bottom: max(5.25rem, calc(env(safe-area-inset-bottom) + 4.75rem));
		z-index: 8;
		width: 168px;
		height: 112px;
		overflow: hidden;
		padding: 0;
		border: 1px solid rgb(76 67 55 / 45%);
		border-radius: 0.55rem;
		background: #f8f2e5;
		box-shadow: 0 5px 18px rgb(43 36 28 / 15%);
		cursor: crosshair;
	}

	canvas {
		display: block;
		width: 168px;
		height: 112px;
	}

	.ink-minimap:focus-visible {
		outline: 3px solid #2f6b60;
		outline-offset: 3px;
	}

	@media (max-width: 39rem) {
		.ink-minimap {
			width: 126px;
			height: 84px;
			opacity: 0.88;
		}

		canvas {
			width: 126px;
			height: 84px;
		}
	}
</style>
