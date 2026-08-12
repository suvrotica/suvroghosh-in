<script lang="ts">
	import { onMount } from 'svelte';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model/recipe-schema';

	interface Props {
		recipe: ShellRecipe;
		label: string;
		active?: boolean;
	}

	let { recipe, label, active = false }: Props = $props();
	let canvas!: HTMLCanvasElement;

	function draw(): void {
		if (!canvas) return;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		canvas.width = Math.max(1, Math.round(width * ratio));
		canvas.height = Math.max(1, Math.round(height * ratio));
		const context = canvas.getContext('2d');
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);

		const style = getComputedStyle(canvas);
		const line = style.getPropertyValue('--line-bright').trim() || '#4b554f';
		const shell = style.getPropertyValue('--shell').trim() || '#e5d6b8';
		const amber = style.getPropertyValue('--amber').trim() || '#e0a45a';
		const turns = Math.min(7, Math.max(1.2, recipe.coiling.turns));
		const samples = 190;
		const a = Math.log(Math.max(0.26, recipe.coiling.whorlExpansion)) / (Math.PI * 2);
		const spire =
			recipe.coiling.axial.mode === 'planispiral' ? 0 : recipe.coiling.axial.coneSpireRatio;
		const radial = recipe.coiling.meander.radialAmplitude;
		const axial = recipe.coiling.meander.axialAmplitude;
		const cycles = recipe.coiling.meander.cycles;
		const points: { x: number; y: number; r: number; tau: number }[] = [];
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (let index = 0; index < samples; index += 1) {
			const tau = index / (samples - 1);
			const theta = (tau - 1) * turns * Math.PI * 2;
			const r =
				recipe.coiling.curve === 'logarithmic'
					? Math.exp(a * theta)
					: Math.max(0.03, 0.05 + tau * 0.95);
			const wobble =
				radial * 0.15 * Math.sin(cycles * Math.PI * 2 * tau + recipe.coiling.meander.phase);
			const x = (r + wobble) * Math.cos(theta);
			const z = spire * (r - Math.exp(-Math.abs(a) * turns * Math.PI * 2));
			const y =
				recipe.coiling.axial.mode === 'lecture-lift'
					? recipe.coiling.axial.risePerTurn * (tau - 0.5) * 0.5
					: z * 0.45 + axial * 0.14 * Math.sin(cycles * Math.PI * 2 * tau);
			points.push({ x, y, r, tau });
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		const padding = 8;
		const scale = Math.min(
			(width - padding * 2) / Math.max(0.001, maxX - minX),
			(height - padding * 2) / Math.max(0.001, maxY - minY + recipe.aperture.scale * 1.2)
		);
		const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
		const offsetY = height / 2 + ((minY + maxY) / 2) * scale;

		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.strokeStyle = line;
		context.lineWidth = Math.max(2, recipe.aperture.scale * 7);
		context.globalAlpha = 0.52;
		context.beginPath();
		points.forEach((point, index) => {
			const x = offsetX + point.x * scale;
			const y = offsetY - point.y * scale;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.stroke();

		context.strokeStyle = shell;
		context.lineWidth = 1.25;
		context.globalAlpha = 0.92;
		context.beginPath();
		points.forEach((point, index) => {
			const x = offsetX + point.x * scale;
			const y = offsetY - point.y * scale;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.stroke();

		const adult = points.at(-1);
		if (adult) {
			const apertureWidth = Math.max(3, recipe.aperture.scale * scale * 0.65);
			const apertureHeight = Math.max(
				3,
				apertureWidth * Math.min(2.2, recipe.aperture.aspectRatio)
			);
			context.translate(offsetX + adult.x * scale, offsetY - adult.y * scale);
			context.rotate(-recipe.aperture.rotation);
			context.strokeStyle = amber;
			context.lineWidth = active ? 2 : 1.2;
			context.globalAlpha = 1;
			context.beginPath();
			context.ellipse(0, 0, apertureWidth, apertureHeight, 0, 0, Math.PI * 2);
			context.stroke();
		}
	}

	onMount(() => {
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	$effect(() => {
		void recipe;
		void active;
		if (typeof window !== 'undefined') requestAnimationFrame(draw);
	});
</script>

<canvas
	bind:this={canvas}
	aria-label={`Schematic two-dimensional centreline preview of ${label}; not a rendered specimen`}
></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		background:
			radial-gradient(
				circle at 50% 58%,
				color-mix(in srgb, var(--amber-soft) 7%, transparent),
				transparent 58%
			),
			var(--bg);
	}
</style>
