<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	type Point = { x: number; y: number };
	type Props = {
		subtitle?: string;
		author?: string;
		publishedDate?: string;
		updatedDate?: string;
		readingTime?: string;
	};

	let {
		subtitle = 'An interactive atlas of gradient descent, learning rates, curvature, momentum, noise, saddles, and the peculiar geography of machine learning.',
		author,
		publishedDate,
		updatedDate,
		readingTime
	}: Props = $props();
	let canvas: HTMLCanvasElement;
	let hero: HTMLElement;
	let ready = $state(false);
	let interrupted = false;

	const DOMAIN = { x: [-2, 2] as const, y: [-1, 3] as const };
	const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	function formatDate(value: string) {
		return longDateFormatter.format(new Date(`${value}T00:00:00Z`));
	}

	function loss(point: Point): number {
		const a = 1 - point.x;
		const b = point.y - point.x * point.x;
		return a * a + 100 * b * b;
	}

	function gradient(point: Point): Point {
		const residual = point.y - point.x * point.x;
		return {
			x: -2 * (1 - point.x) - 400 * point.x * residual,
			y: 200 * residual
		};
	}

	function measuredTrail(): readonly Point[] {
		const points: Point[] = [{ x: -1.2, y: 1 }];
		let point = points[0];
		for (let iteration = 0; iteration < 230; iteration += 1) {
			const slope = gradient(point);
			point = { x: point.x - 0.001 * slope.x, y: point.y - 0.001 * slope.y };
			points.push(point);
		}
		return points;
	}

	function command(event: MouseEvent, action: 'begin' | 'open') {
		event.preventDefault();
		window.location.replace(`#gradient-descent-${action}`);
		interrupted = true;
		window.dispatchEvent(
			new CustomEvent('gradient-descent-command', { detail: { action, source: 'hero' } })
		);
		document.getElementById('gradient-descent-laboratory')?.scrollIntoView({
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'start'
		});
	}

	onMount(() => {
		const maybeContext = canvas.getContext('2d', { alpha: false });
		if (!maybeContext) return;
		const context: CanvasRenderingContext2D = maybeContext;

		const trail = measuredTrail();
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const queryReduced = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		const introDuration = 18_000;
		let reduced = motionQuery.matches || queryReduced;
		let frame = 0;
		let introElapsed = 0;
		let previousAnimationTime = 0;
		let introComplete = false;
		let lastDraw = -Infinity;
		let width = 1;
		let height = 1;
		let dpr = 1;

		function resize() {
			const bounds = canvas.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, bounds.width < 700 ? 1.25 : 1.6);
			width = Math.max(1, Math.round(bounds.width * dpr));
			height = Math.max(1, Math.round(bounds.height * dpr));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			draw();
		}

		function project(point: Point, rawLoss: number, yaw: number): Point {
			const nx = (point.x - DOMAIN.x[0]) / (DOMAIN.x[1] - DOMAIN.x[0]) - 0.5;
			const ny = (point.y - DOMAIN.y[0]) / (DOMAIN.y[1] - DOMAIN.y[0]) - 0.5;
			const cos = Math.cos(yaw);
			const sin = Math.sin(yaw);
			const rx = nx * cos - ny * sin;
			const ry = nx * sin + ny * cos;
			const displayHeight = Math.log1p(Math.max(0, rawLoss)) / Math.log1p(2500);
			return {
				x: width * (0.62 + rx * 0.9),
				y: height * (0.66 + ry * 0.42 - displayHeight * 0.33)
			};
		}

		function draw() {
			const elapsed = interrupted || reduced ? 0 : Math.min(1, introElapsed / introDuration);
			const yaw = -0.74 + 0.055 * Math.sin(elapsed * Math.PI);
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.fillStyle = '#090b0b';
			context.fillRect(0, 0, width, height);

			const haze = context.createRadialGradient(
				width * 0.7,
				height * 0.38,
				0,
				width * 0.7,
				height * 0.38,
				width * 0.72
			);
			haze.addColorStop(0, '#27312d');
			haze.addColorStop(0.55, '#111615');
			haze.addColorStop(1, '#080a0a');
			context.fillStyle = haze;
			context.fillRect(0, 0, width, height);

			const grid = width < 780 ? 32 : 46;
			for (let row = grid - 2; row >= 0; row -= 1) {
				for (let column = 0; column < grid - 1; column += 1) {
					const corners = [
						{ x: column / (grid - 1), y: row / (grid - 1) },
						{ x: (column + 1) / (grid - 1), y: row / (grid - 1) },
						{ x: (column + 1) / (grid - 1), y: (row + 1) / (grid - 1) },
						{ x: column / (grid - 1), y: (row + 1) / (grid - 1) }
					].map((corner) => ({
						x: DOMAIN.x[0] + corner.x * (DOMAIN.x[1] - DOMAIN.x[0]),
						y: DOMAIN.y[0] + corner.y * (DOMAIN.y[1] - DOMAIN.y[0])
					}));
					const values = corners.map(loss);
					const projected = corners.map((corner, index) => project(corner, values[index], yaw));
					const average = values.reduce((sum, value) => sum + value, 0) / values.length;
					const band = Math.abs(Math.sin(Math.log1p(average) * 4.2));
					const luminance = Math.round(20 + 24 / (1 + Math.log1p(average) * 0.18));
					context.beginPath();
					context.moveTo(projected[0].x, projected[0].y);
					for (let index = 1; index < projected.length; index += 1) {
						context.lineTo(projected[index].x, projected[index].y);
					}
					context.closePath();
					context.fillStyle = `rgb(${luminance - 4} ${luminance + 2} ${luminance})`;
					context.fill();
					context.strokeStyle =
						band > 0.91 ? 'rgb(208 196 171 / 0.34)' : 'rgb(157 167 157 / 0.075)';
					context.lineWidth = band > 0.91 ? 1.05 * dpr : 0.55 * dpr;
					context.stroke();
				}
			}

			context.lineCap = 'round';
			context.lineJoin = 'round';
			for (let index = 1; index < trail.length; index += 1) {
				const previous = project(trail[index - 1], loss(trail[index - 1]), yaw);
				const current = project(trail[index], loss(trail[index]), yaw);
				const progress = index / trail.length;
				context.beginPath();
				context.moveTo(previous.x, previous.y - 2.2 * dpr);
				context.lineTo(current.x, current.y - 2.2 * dpr);
				context.strokeStyle = `rgb(244 190 91 / ${0.12 + 0.78 * progress})`;
				context.lineWidth = (0.8 + progress * 1.7) * dpr;
				context.stroke();
			}

			const markerPoint = trail.at(-1) ?? trail[0];
			const marker = project(markerPoint, loss(markerPoint), yaw);
			context.beginPath();
			context.arc(marker.x, marker.y - 3 * dpr, 6.8 * dpr, 0, Math.PI * 2);
			context.fillStyle = '#ffe4a6';
			context.shadowBlur = 18 * dpr;
			context.shadowColor = '#efb54e';
			context.fill();
			context.shadowBlur = 0;
			context.strokeStyle = '#2a2113';
			context.lineWidth = 1.2 * dpr;
			context.stroke();

			context.fillStyle = 'rgb(210 202 185 / 0.72)';
			context.font = `${Math.round(10 * dpr)}px Courier Prime, monospace`;
			context.fillText('x', width * 0.88, height * 0.85);
			context.fillText('y', width * 0.42, height * 0.78);
			context.fillText('LOSS', width * 0.76, height * 0.13);
			ready = true;
		}

		function cancelAnimation(): void {
			if (frame !== 0) cancelAnimationFrame(frame);
			frame = 0;
			previousAnimationTime = 0;
		}

		function scheduleAnimation(): void {
			if (frame !== 0 || introComplete || interrupted || reduced || document.hidden) return;
			frame = requestAnimationFrame(animate);
		}

		function animate(now: number) {
			frame = 0;
			if (document.hidden || interrupted || reduced || introComplete) return;
			if (previousAnimationTime !== 0) {
				introElapsed = Math.min(introDuration, introElapsed + (now - previousAnimationTime));
			}
			previousAnimationTime = now;
			const completedNow = introElapsed >= introDuration;
			if (completedNow || now - lastDraw > 90) {
				draw();
				lastDraw = now;
			}
			if (completedNow) {
				introComplete = true;
				previousAnimationTime = 0;
				return;
			}
			scheduleAnimation();
		}

		function stopIdleMotion() {
			interrupted = true;
			cancelAnimation();
			draw();
		}

		function handleVisibility() {
			cancelAnimation();
			if (!document.hidden) scheduleAnimation();
		}

		function handleMotion() {
			reduced = motionQuery.matches || queryReduced;
			cancelAnimation();
			draw();
			if (!reduced) scheduleAnimation();
		}

		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(hero);
		hero.addEventListener('pointerdown', stopIdleMotion, { once: true });
		hero.addEventListener('wheel', stopIdleMotion, { once: true, passive: true });
		hero.addEventListener('keydown', stopIdleMotion, { once: true });
		document.addEventListener('visibilitychange', handleVisibility);
		motionQuery.addEventListener('change', handleMotion);
		resize();
		scheduleAnimation();

		return () => {
			cancelAnimation();
			resizeObserver.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			motionQuery.removeEventListener('change', handleMotion);
		};
	});
</script>

<section
	bind:this={hero}
	class="hero article-breakout not-prose"
	aria-labelledby="landscape-title"
	data-route-atmosphere-region
	data-route-scene="article"
>
	<div class="terrain" aria-hidden="true">
		<img
			src="/images/gradient-descent-landscapes.png"
			alt=""
			width="1200"
			height="630"
			class:concealed={ready}
		/>
		<canvas bind:this={canvas}></canvas>
		<div class="shade"></div>
	</div>
	<div class="copy">
		<p class="eyebrow">Interactive mathematics · field plate 01</p>
		<h1 id="landscape-title">The Landscape of Error</h1>
		<p class="subtitle">{subtitle}</p>
		{#if author || publishedDate || updatedDate || readingTime}
			<p class="byline">
				{#if author}<span>By <a href={resolve('/resume')} rel="author">{author}</a></span>{/if}
				{#if author && (publishedDate || updatedDate || readingTime)}<span aria-hidden="true"
						>·</span
					>{/if}
				{#if publishedDate}<span
						>Published <time datetime={publishedDate}>{formatDate(publishedDate)}</time></span
					>{/if}
				{#if publishedDate && (updatedDate || readingTime)}<span aria-hidden="true">·</span>{/if}
				{#if updatedDate}<span
						>Updated <time datetime={updatedDate}>{formatDate(updatedDate)}</time></span
					>{/if}
				{#if updatedDate && readingTime}<span aria-hidden="true">·</span>{/if}
				{#if readingTime}<span>{readingTime} read</span>{/if}
			</p>
		{/if}
		<p class="invitation">
			Drop a survey beacon anywhere. It has no map of the landscape; it can feel only the local
			slope beneath its feet.
		</p>
		<div class="actions">
			<a class="primary" href="#gradient-descent-begin" onclick={(event) => command(event, 'begin')}
				>Begin the descent</a
			>
			<a href="#gradient-descent-open" onclick={(event) => command(event, 'open')}
				>Open the laboratory</a
			>
		</div>
		<p class="truth-label">Display height: log-compressed; calculations use raw loss.</p>
	</div>
	<div class="scale" aria-hidden="true">
		<span>LOW LOSS</span><i></i><span>HIGH LOSS</span>
	</div>
	<noscript>
		<p class="noscript">
			This is the static field plate. The complete article and mathematical captions remain readable
			without JavaScript.
		</p>
	</noscript>
</section>

<style>
	.hero {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(90rem, calc(100vw - 1rem));
		min-height: clamp(38rem, 65vw, 51rem);
		margin: 0 0 3rem;
		overflow: hidden;
		transform: translateX(-50%);
		border: 1px solid #403f3a;
		border-radius: 0.75rem;
		background: #090b0b;
		box-shadow: 0 2rem 5rem rgb(8 8 7 / 30%);
		color: #f4eddf;
		isolation: isolate;
	}

	.terrain,
	.terrain img,
	.terrain canvas,
	.shade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.terrain img,
	.terrain canvas {
		display: block;
		object-fit: cover;
		transition: opacity 450ms ease;
	}

	.terrain img.concealed {
		opacity: 0;
	}

	.shade {
		background:
			linear-gradient(90deg, rgb(7 9 9 / 98%) 0%, rgb(7 9 9 / 89%) 39%, rgb(7 9 9 / 24%) 73%),
			linear-gradient(0deg, rgb(7 9 9 / 62%), transparent 48%);
	}

	.copy {
		position: relative;
		z-index: 2;
		display: flex;
		min-height: inherit;
		width: min(50rem, 70%);
		flex-direction: column;
		justify-content: center;
		padding: clamp(2rem, 7vw, 6rem);
	}

	.eyebrow {
		margin: 0;
		color: #ddb66c;
		font: 750 0.7rem/1.2 var(--font-sans);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h1 {
		max-width: 10ch;
		margin: 0.8rem 0 1.1rem;
		color: #fff9eb;
		font: 790 clamp(3rem, 7vw, 6.9rem) / 0.88 var(--font-sans);
		letter-spacing: -0.065em;
		text-wrap: balance;
	}

	.subtitle {
		max-width: 62ch;
		margin: 0;
		color: #d5cec1;
		font: clamp(0.95rem, 1.4vw, 1.12rem) / 1.58 var(--font-serif);
	}

	.byline {
		display: flex;
		max-width: 62ch;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		margin: 0.9rem 0 0;
		color: #c5beb1;
		font: 650 0.72rem/1.45 var(--font-sans);
	}

	.byline a {
		color: #f0d49b;
		text-decoration-color: rgb(240 212 155 / 50%);
		text-underline-offset: 0.18em;
	}

	.byline a:hover {
		color: #fff4d1;
	}

	.invitation {
		max-width: 58ch;
		margin: 1rem 0 0;
		color: #b9b5ab;
		font: 0.82rem/1.55 var(--font-sans);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1.45rem;
	}

	.actions a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		border: 1px solid #88857b;
		border-radius: 0.35rem;
		background: rgb(15 17 16 / 78%);
		padding: 0.68rem 1rem;
		color: #f4eddf;
		font: 750 0.8rem/1.2 var(--font-sans);
		text-decoration: none;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.actions a:hover {
		border-color: #edc478;
		background: #1d211f;
	}

	.actions a.primary {
		border-color: #dfb66c;
		background: #c79a52;
		color: #16120c;
	}

	.actions a:focus-visible {
		outline: 3px solid #fff4d1;
		outline-offset: 3px;
	}

	.truth-label {
		width: fit-content;
		margin: 0.9rem 0 0;
		border: 1px solid rgb(210 190 150 / 35%);
		border-radius: 999px;
		background: rgb(5 7 7 / 72%);
		padding: 0.4rem 0.64rem;
		color: #bcb7ac;
		font: 0.66rem/1.2 var(--font-mono);
	}

	.scale {
		position: absolute;
		z-index: 2;
		right: 1.1rem;
		bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #aca99f;
		font: 0.56rem/1.2 var(--font-mono);
		letter-spacing: 0.1em;
	}

	.scale i {
		display: block;
		width: 6rem;
		height: 0.28rem;
		background: linear-gradient(90deg, #1d2925, #8f6e3d, #efc16c);
	}

	.noscript {
		position: absolute;
		z-index: 4;
		right: 1rem;
		bottom: 2.6rem;
		left: 1rem;
		margin: 0;
		border: 1px solid #8a8172;
		background: #101211;
		padding: 0.7rem;
		color: #f0e9dc;
		font: 0.8rem/1.5 var(--font-sans);
	}

	@media (max-width: 48rem) {
		.hero {
			min-height: 46rem;
		}

		.shade {
			background:
				linear-gradient(0deg, rgb(7 9 9 / 99%) 12%, rgb(7 9 9 / 89%) 57%, rgb(7 9 9 / 21%)),
				linear-gradient(90deg, rgb(7 9 9 / 54%), transparent);
		}

		.copy {
			width: auto;
			justify-content: flex-end;
			padding: 1.25rem 1.25rem 2rem;
		}

		h1 {
			font-size: clamp(3rem, 16vw, 5rem);
		}

		.actions {
			display: grid;
		}

		.actions a {
			width: 100%;
		}

		.scale {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.terrain img,
		.terrain canvas {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.hero {
			border: 3px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.terrain,
		.scale {
			display: none;
		}

		.copy,
		.copy h1,
		.copy p {
			color: CanvasText;
		}
	}
</style>
