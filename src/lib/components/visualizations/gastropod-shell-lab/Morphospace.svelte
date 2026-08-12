<script lang="ts">
	import { onMount } from 'svelte';
	import { GASTROPOD_PRESETS } from '$lib/visualizations/gastropod-shell-lab/shell/presets';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';

	interface Props {
		recipe: ShellRecipe;
		onbegin: () => void;
		onpreview: (mutator: (draft: ShellRecipe) => void) => void;
		oncommit: () => void;
	}

	let { recipe, onbegin, onpreview, oncommit }: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let dragging = $state(false);
	const W_MIN = 1.03;
	const W_MAX = 6;
	const H_MIN = 0;
	const H_MAX = 3;
	const landmarks = GASTROPOD_PRESETS.filter((preset) =>
		[
			'turritella-turret',
			'conus-body-whorl',
			'architectonica-sundial',
			'naticid-moon',
			'bolinus-murex-varices'
		].includes(preset.id)
	).slice(0, 5);

	function map(recipeValue: ShellRecipe): { x: number; y: number } {
		const x =
			(Math.log(recipeValue.coiling.whorlExpansion) - Math.log(W_MIN)) /
			(Math.log(W_MAX) - Math.log(W_MIN));
		const y = (recipeValue.coiling.axial.coneSpireRatio - H_MIN) / (H_MAX - H_MIN);
		return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
	}

	function draw(): void {
		if (!canvas) return;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = width * ratio;
		canvas.height = height * ratio;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);
		const style = getComputedStyle(canvas);
		const line = style.getPropertyValue('--line').trim() || '#303a36';
		const text = style.getPropertyValue('--muted').trim() || '#9ca59f';
		const cyan = style.getPropertyValue('--cyan').trim() || '#69c8c2';
		const amber = style.getPropertyValue('--amber').trim() || '#e0a45a';
		const left = 34;
		const right = width - 12;
		const top = 12;
		const bottom = height - 28;
		context.strokeStyle = line;
		context.lineWidth = 1;
		context.strokeRect(left, top, right - left, bottom - top);
		context.font = '9px system-ui';
		context.fillStyle = text;
		context.textAlign = 'center';
		context.fillText('Whorl expansion W →', (left + right) / 2, height - 6);
		context.save();
		context.translate(9, (top + bottom) / 2);
		context.rotate(-Math.PI / 2);
		context.fillText('Spire H/R →', 0, 0);
		context.restore();
		for (let i = 0; i <= 4; i += 1) {
			const x = left + ((right - left) * i) / 4;
			const y = top + ((bottom - top) * i) / 4;
			context.strokeStyle = line;
			context.globalAlpha = 0.5;
			context.beginPath();
			context.moveTo(x, top);
			context.lineTo(x, bottom);
			context.stroke();
			context.beginPath();
			context.moveTo(left, y);
			context.lineTo(right, y);
			context.stroke();
		}
		context.globalAlpha = 1;
		for (const landmark of landmarks) {
			const point = map(landmark.recipe);
			const x = left + point.x * (right - left);
			const y = bottom - point.y * (bottom - top);
			context.fillStyle = cyan;
			context.beginPath();
			context.arc(x, y, 2.5, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = text;
			context.textAlign = x > right - 70 ? 'right' : 'left';
			context.fillText(landmark.title.replace('-like', ''), x + (x > right - 70 ? -5 : 5), y - 4);
		}
		const point = map(recipe);
		const x = left + point.x * (right - left);
		const y = bottom - point.y * (bottom - top);
		context.fillStyle = amber;
		context.strokeStyle = '#111';
		context.lineWidth = 2;
		context.beginPath();
		context.arc(x, y, 6, 0, Math.PI * 2);
		context.fill();
		context.stroke();
	}

	function update(event: PointerEvent): void {
		if (!canvas) return;
		const bounds = canvas.getBoundingClientRect();
		const x = Math.max(
			0,
			Math.min(1, (event.clientX - bounds.left - 34) / Math.max(1, bounds.width - 46))
		);
		const y = Math.max(
			0,
			Math.min(1, 1 - (event.clientY - bounds.top - 12) / Math.max(1, bounds.height - 40))
		);
		const expansion = Math.exp(Math.log(W_MIN) + x * (Math.log(W_MAX) - Math.log(W_MIN)));
		const spire = H_MIN + y * (H_MAX - H_MIN);
		onpreview((draft) => {
			draft.coiling.whorlExpansion = expansion;
			draft.coiling.axial.coneSpireRatio = spire;
			draft.coiling.axial.mode = spire < 0.01 ? 'planispiral' : 'cone-similar';
		});
	}

	function pointerDown(event: PointerEvent): void {
		if (recipe.engine !== 'analytic') return;
		dragging = true;
		onbegin();
		canvas?.setPointerCapture(event.pointerId);
		update(event);
	}

	function pointerUp(event: PointerEvent): void {
		if (!dragging) return;
		dragging = false;
		canvas?.releasePointerCapture(event.pointerId);
		oncommit();
	}

	onMount(() => {
		draw();
		if (!canvas) return;
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	$effect(() => {
		void recipe;
		if (typeof window !== 'undefined') requestAnimationFrame(draw);
	});
</script>

<section class="morphospace" aria-labelledby="morphospace-title">
	<header>
		<div>
			<p class="panel-title">Two-dimensional exploration</p>
			<h2 id="morphospace-title">Morphospace</h2>
		</div>
		<span class="badge cyan">drag point</span>
	</header>
	<canvas
		class:disabled={recipe.engine !== 'analytic'}
		bind:this={canvas}
		aria-disabled={recipe.engine !== 'analytic'}
		aria-label="Morphospace with whorl expansion on the horizontal axis and spire ratio on the vertical axis. Drag to change both values."
		onpointerdown={pointerDown}
		onpointermove={(event) => dragging && update(event)}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
	></canvas>
	<p>
		{recipe.engine === 'analytic'
			? 'Landmarks are archetypal recipes, not a realism score. The amber point is your current shell.'
			: 'This W–H/R morphospace controls the analytic engine. Switch engines deliberately before dragging; the accretion recipe is not silently converted.'}
	</p>
</section>

<style>
	.morphospace {
		padding: 0.85rem;
		border-top: 1px solid var(--line);
	}
	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		margin: 0.14rem 0 0;
		font-size: 0.9rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 190px;
		margin-top: 0.65rem;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--bg);
		touch-action: none;
		cursor: crosshair;
	}
	canvas.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	p {
		margin: 0.45rem 0 0;
		font-size: 0.58rem;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
