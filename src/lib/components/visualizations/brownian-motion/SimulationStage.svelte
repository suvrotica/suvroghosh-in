<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		BoundaryCondition,
		ParticleArrays,
		SimulationMetrics
	} from '$lib/visualizations/brownian-motion/types';
	import type { TrajectoryBuffer } from '$lib/visualizations/brownian-motion/trajectory-buffer';
	import { potentialEnergy } from '$lib/visualizations/brownian-motion/models/potential-diffusion';
	import type { CameraState, ObstacleOverlay, PotentialOverlay, TheoryOverlay } from './ui-types';

	type Props = {
		particles: ParticleArrays;
		metrics: SimulationMetrics;
		trajectories?: TrajectoryBuffer;
		revision: number;
		diffusion: number;
		boundary?: BoundaryCondition;
		particleSize?: number;
		trailOpacity?: number;
		showTheory?: boolean;
		showParticles?: boolean;
		showPaths?: boolean;
		showDensity?: boolean;
		showVelocity?: boolean;
		camera?: CameraState;
		oncamera?: (camera: CameraState) => void;
		theory?: TheoryOverlay | null;
		potential?: PotentialOverlay | null;
		obstacles?: readonly ObstacleOverlay[];
		onrender?: (durationMilliseconds: number) => void;
		registerCanvas?: (canvas: HTMLCanvasElement | null) => void;
	};

	let {
		particles,
		metrics,
		trajectories,
		revision,
		diffusion,
		boundary = { mode: 'unbounded' },
		particleSize = 3.6,
		trailOpacity = 0.72,
		showTheory = true,
		showParticles = true,
		showPaths = true,
		showDensity = false,
		showVelocity = false,
		camera = { centreX: 0, centreY: 0, zoom: 1, autoFit: true },
		oncamera = () => undefined,
		theory = null,
		potential = null,
		obstacles = [],
		onrender = () => undefined,
		registerCanvas = () => undefined
	}: Props = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ready = $state(false);
	let width = 960;
	let height = 560;
	let resizeObserver: ResizeObserver | null = null;
	let dragging = false;
	let dragPointer = -1;
	let dragX = 0;
	let dragY = 0;
	let dragCamera: CameraState = { centreX: 0, centreY: 0, zoom: 1, autoFit: true };

	function css(name: string, fallback: string): string {
		const value = getComputedStyle(host).getPropertyValue(name).trim();
		return value || fallback;
	}

	function worldRadius(): number {
		const theoretical = theory
			? Math.max(
					Math.abs(theory.meanX),
					Math.abs(theory.meanY),
					Math.sqrt(Math.max(0, theory.varianceX)),
					Math.sqrt(Math.max(0, theory.varianceY))
				) * 3.2
			: Math.sqrt(Math.max(0, 2 * diffusion * metrics.simulationTime)) * 4.5;
		let measured = 0;
		const stride = Math.max(1, Math.floor(particles.count / 2_000));
		for (let index = 0; index < particles.count; index += stride) {
			if (particles.alive[index] === 0) continue;
			measured = Math.max(measured, Math.abs(particles.x[index]), Math.abs(particles.y[index]));
		}
		return Math.max(3, theoretical, measured * 1.15);
	}

	function visibleRadius(): number {
		return worldRadius() / Math.max(0.25, Math.min(12, camera.zoom));
	}

	function drawGrid(
		context: CanvasRenderingContext2D,
		scale: number,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		const radius = visibleRadius();
		const raw = radius / 5;
		const power = 10 ** Math.floor(Math.log10(Math.max(raw, Number.EPSILON)));
		const normalized = raw / power;
		const step = (normalized < 2 ? 1 : normalized < 5 ? 2 : 5) * power;
		const left = camera.centreX - width / (2 * scale);
		const right = camera.centreX + width / (2 * scale);
		const bottom = camera.centreY - height / (2 * scale);
		const top = camera.centreY + height / (2 * scale);

		context.save();
		context.strokeStyle = css('--brownian-grid', 'rgba(84, 91, 102, 0.16)');
		context.lineWidth = 1;
		context.beginPath();
		for (let worldX = Math.floor(left / step) * step; worldX <= right; worldX += step) {
			const x = Math.round(toX(worldX)) + 0.5;
			context.moveTo(x, 0);
			context.lineTo(x, height);
		}
		for (let worldY = Math.floor(bottom / step) * step; worldY <= top; worldY += step) {
			const y = Math.round(toY(worldY)) + 0.5;
			context.moveTo(0, y);
			context.lineTo(width, y);
		}
		context.stroke();
		context.restore();
	}

	function drawDensity(
		context: CanvasRenderingContext2D,
		radius: number,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		if (!showDensity || particles.count < 2) return;
		const cells = width < 560 ? 36 : 52;
		const counts = new Uint32Array(cells * cells);
		const minimumX = camera.centreX - radius;
		const minimumY = camera.centreY - radius;
		let maximum = 0;
		for (let index = 0; index < particles.count; index += 1) {
			if (particles.alive[index] === 0) continue;
			const column = Math.floor(((particles.x[index] - minimumX) / (radius * 2)) * cells);
			const row = Math.floor(((particles.y[index] - minimumY) / (radius * 2)) * cells);
			if (column < 0 || row < 0 || column >= cells || row >= cells) continue;
			const count = (counts[row * cells + column] += 1);
			maximum = Math.max(maximum, count);
		}
		if (maximum === 0) return;
		const worldCell = (radius * 2) / cells;
		context.save();
		context.fillStyle = css('--brownian-particle', '#596d9d');
		for (let row = 0; row < cells; row += 1) {
			for (let column = 0; column < cells; column += 1) {
				const count = counts[row * cells + column];
				if (count === 0) continue;
				const opacity = 0.04 + 0.38 * Math.sqrt(count / maximum);
				context.globalAlpha = opacity;
				const worldX = minimumX + column * worldCell;
				const worldY = minimumY + (row + 1) * worldCell;
				context.fillRect(
					toX(worldX),
					toY(worldY),
					Math.max(1, worldCell * (Math.min(width, height) / (2 * radius)) + 0.8),
					Math.max(1, worldCell * (Math.min(width, height) / (2 * radius)) + 0.8)
				);
			}
		}
		context.restore();
	}

	function drawPotential(
		context: CanvasRenderingContext2D,
		radius: number,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		if (!potential) return;
		const columns = width < 560 ? 34 : 52;
		const rows = Math.max(24, Math.round(columns * (height / width)));
		const left = camera.centreX - radius * (width / Math.min(width, height));
		const right = camera.centreX + radius * (width / Math.min(width, height));
		const bottom = camera.centreY - radius * (height / Math.min(width, height));
		const top = camera.centreY + radius * (height / Math.min(width, height));
		const values = new Float64Array(columns * rows);
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const x = left + ((column + 0.5) / columns) * (right - left);
				const y = bottom + ((row + 0.5) / rows) * (top - bottom);
				const value = potentialEnergy(potential, x, y);
				values[row * columns + column] = value;
				minimum = Math.min(minimum, value);
				maximum = Math.max(maximum, value);
			}
		}
		const cellWidth = (right - left) / columns;
		const cellHeight = (top - bottom) / rows;
		context.save();
		context.fillStyle = css('--brownian-potential', '#9b5f48');
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const normalized =
					(values[row * columns + column] - minimum) / Math.max(Number.EPSILON, maximum - minimum);
				context.globalAlpha = 0.025 + normalized * 0.12;
				context.fillRect(
					toX(left + column * cellWidth),
					toY(bottom + (row + 1) * cellHeight),
					Math.ceil(cellWidth * (Math.min(width, height) / (2 * radius))) + 1,
					Math.ceil(cellHeight * (Math.min(width, height) / (2 * radius))) + 1
				);
			}
		}
		context.restore();
	}

	function drawObstacles(
		context: CanvasRenderingContext2D,
		scale: number,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		if (obstacles.length === 0) return;
		context.save();
		context.fillStyle = css('--brownian-obstacle-fill', 'rgba(78, 75, 70, 0.18)');
		context.strokeStyle = css('--brownian-boundary', '#5d5850');
		context.lineWidth = 1.5;
		context.setLineDash([4, 3]);
		for (const obstacle of obstacles) {
			context.beginPath();
			context.arc(toX(obstacle.x), toY(obstacle.y), obstacle.radius * scale, 0, Math.PI * 2);
			context.fill();
			context.stroke();
		}
		context.restore();
	}

	function drawTheory(
		context: CanvasRenderingContext2D,
		scale: number,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		if (!showTheory || metrics.simulationTime <= 0) return;
		const overlay: TheoryOverlay = theory ?? {
			meanX: 0,
			meanY: 0,
			varianceX: 2 * diffusion * metrics.simulationTime,
			varianceY: 2 * diffusion * metrics.simulationTime,
			covarianceXY: 0,
			label: 'Gaussian theory'
		};
		const halfDifference = (overlay.varianceX - overlay.varianceY) / 2;
		const radius = Math.hypot(halfDifference, overlay.covarianceXY);
		const centreVariance = (overlay.varianceX + overlay.varianceY) / 2;
		const majorVariance = Math.max(0, centreVariance + radius);
		const minorVariance = Math.max(0, centreVariance - radius);
		const angle = 0.5 * Math.atan2(2 * overlay.covarianceXY, overlay.varianceX - overlay.varianceY);
		context.save();
		context.translate(toX(overlay.meanX), toY(overlay.meanY));
		context.rotate(-angle);
		context.strokeStyle = css('--brownian-theory', '#8d5541');
		context.setLineDash([7, 6]);
		context.lineWidth = 1.5;
		for (const multiplier of [1, 2]) {
			context.beginPath();
			context.ellipse(
				0,
				0,
				Math.sqrt(majorVariance) * multiplier * scale,
				Math.sqrt(minorVariance) * multiplier * scale,
				0,
				0,
				Math.PI * 2
			);
			context.stroke();
		}
		context.restore();
		if (Math.hypot(overlay.meanX, overlay.meanY) > 0.02) {
			context.save();
			context.strokeStyle = css('--brownian-theory', '#8d5541');
			context.fillStyle = css('--brownian-theory', '#8d5541');
			context.lineWidth = 1.8;
			context.beginPath();
			context.moveTo(toX(0), toY(0));
			context.lineTo(toX(overlay.meanX), toY(overlay.meanY));
			context.stroke();
			context.beginPath();
			context.arc(toX(overlay.meanX), toY(overlay.meanY), 3.5, 0, Math.PI * 2);
			context.fill();
			context.restore();
		}
	}

	function drawTrails(
		context: CanvasRenderingContext2D,
		toX: (value: number) => number,
		toY: (value: number) => number
	): void {
		if (!showPaths || !trajectories || trajectories.length < 2) return;
		const tracked = Math.min(
			trajectories.trackedParticleCount,
			particles.count === 1 ? 1 : width < 560 ? 10 : 24
		);
		const trailColor = css('--brownian-trail', '#3f4f74');
		context.save();
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.lineWidth = particles.count === 1 ? 1.65 : 0.85;
		for (let particle = 0; particle < tracked; particle += 1) {
			const trail = trajectories.particleTrail(particle);
			const stride = Math.max(1, Math.floor(trail.x.length / 260));
			for (let index = stride; index < trail.x.length; index += stride) {
				const previous = index - stride;
				if (trail.alive[previous] === 0 || trail.alive[index] === 0) continue;
				const age = index / Math.max(1, trail.x.length - 1);
				context.globalAlpha =
					(particles.count === 1 ? 0.1 + age * 0.72 : 0.015 + age * 0.075) *
					(particle === 0 ? 1 : 0.72) *
					Math.max(0, Math.min(1, trailOpacity));
				context.strokeStyle = trailColor;
				context.beginPath();
				context.moveTo(toX(trail.x[previous]), toY(trail.y[previous]));
				context.lineTo(toX(trail.x[index]), toY(trail.y[index]));
				context.stroke();
			}
		}
		context.restore();
	}

	function draw(): void {
		if (!canvas || !host) return;
		const started = performance.now();
		const context = canvas.getContext('2d');
		if (!context) return;
		const radius = visibleRadius();
		const scale = Math.min(width, height) / (2 * radius);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = css('--brownian-stage', '#f4f0e6');
		context.fillRect(0, 0, width, height);
		const toX = (value: number) => width / 2 + (value - camera.centreX) * scale;
		const toY = (value: number) => height / 2 - (value - camera.centreY) * scale;
		drawPotential(context, radius, toX, toY);
		drawGrid(context, scale, toX, toY);
		drawDensity(context, radius, toX, toY);
		drawTrails(context, toX, toY);
		drawObstacles(context, scale, toX, toY);

		if (boundary.mode !== 'unbounded') {
			context.save();
			context.strokeStyle = css('--brownian-boundary', '#5d5850');
			context.lineWidth = 1.5;
			context.setLineDash(boundary.mode === 'periodic' ? [5, 5] : []);
			context.strokeRect(
				toX(boundary.bounds.minX),
				toY(boundary.bounds.maxY),
				(boundary.bounds.maxX - boundary.bounds.minX) * scale,
				(boundary.bounds.maxY - boundary.bounds.minY) * scale
			);
			context.restore();
		}

		drawTheory(context, scale, toX, toY);

		if (showParticles) {
			context.save();
			context.fillStyle = css('--brownian-particle', '#596d9d');
			const visibleStride = Math.max(1, Math.ceil(particles.count / 8_000));
			for (let index = 0; index < particles.count; index += visibleStride) {
				if (particles.alive[index] === 0) continue;
				const x = toX(particles.x[index]);
				const y = toY(particles.y[index]);
				context.beginPath();
				context.arc(
					x,
					y,
					particles.count === 1 ? particleSize * 1.35 : particleSize,
					0,
					Math.PI * 2
				);
				context.fill();
				if (
					showVelocity &&
					(particles.velocityX[index] !== 0 || particles.velocityY[index] !== 0)
				) {
					const magnitude = Math.hypot(particles.velocityX[index], particles.velocityY[index]);
					const arrowScale = Math.min(18, 8 + magnitude * 2) / Math.max(Number.EPSILON, magnitude);
					context.save();
					context.strokeStyle = css('--brownian-velocity', '#9b5f48');
					context.globalAlpha = 0.72;
					context.lineWidth = 1.2;
					context.beginPath();
					context.moveTo(x, y);
					context.lineTo(
						x + particles.velocityX[index] * arrowScale,
						y - particles.velocityY[index] * arrowScale
					);
					context.stroke();
					context.restore();
				} else if (showVelocity && particles.orientation[index] !== 0) {
					context.save();
					context.strokeStyle = css('--brownian-velocity', '#9b5f48');
					context.globalAlpha = 0.72;
					context.beginPath();
					context.moveTo(x, y);
					context.lineTo(
						x + Math.cos(particles.orientation[index]) * 11,
						y - Math.sin(particles.orientation[index]) * 11
					);
					context.stroke();
					context.restore();
				}
			}
			context.restore();
		}

		if (metrics.mean) {
			const x = toX(metrics.mean.x);
			const y = toY(metrics.mean.y);
			context.save();
			context.strokeStyle = css('--brownian-mean', '#242a32');
			context.lineWidth = 1.5;
			context.beginPath();
			context.moveTo(x - 6, y);
			context.lineTo(x + 6, y);
			context.moveTo(x, y - 6);
			context.lineTo(x, y + 6);
			context.stroke();
			context.restore();
		}
		onrender(performance.now() - started);
	}

	function resize(): void {
		const bounds = host.getBoundingClientRect();
		width = Math.max(280, Math.round(bounds.width));
		height = Math.max(320, Math.round(Math.min(620, Math.max(360, width * 0.56))));
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		draw();
	}

	function setCamera(next: CameraState): void {
		camera = {
			centreX: Number.isFinite(next.centreX) ? next.centreX : 0,
			centreY: Number.isFinite(next.centreY) ? next.centreY : 0,
			zoom: Math.max(0.25, Math.min(12, Number.isFinite(next.zoom) ? next.zoom : 1)),
			autoFit: next.autoFit
		};
		oncamera(camera);
	}

	function pointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		dragging = true;
		dragPointer = event.pointerId;
		dragX = event.clientX;
		dragY = event.clientY;
		dragCamera = camera;
		canvas.setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent): void {
		if (!dragging || event.pointerId !== dragPointer) return;
		const scale = Math.min(width, height) / (2 * visibleRadius());
		setCamera({
			centreX: dragCamera.centreX - (event.clientX - dragX) / scale,
			centreY: dragCamera.centreY + (event.clientY - dragY) / scale,
			zoom: dragCamera.zoom,
			autoFit: false
		});
	}

	function pointerUp(event: PointerEvent): void {
		if (event.pointerId !== dragPointer) return;
		dragging = false;
		dragPointer = -1;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function wheel(event: WheelEvent): void {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		setCamera({
			...camera,
			zoom: camera.zoom * Math.exp(-event.deltaY * 0.002),
			autoFit: false
		});
	}

	function keydown(event: KeyboardEvent): void {
		const radius = visibleRadius();
		const distance = radius * (event.shiftKey ? 0.03 : 0.12);
		let next: CameraState;
		if (event.key === 'ArrowLeft')
			next = { ...camera, centreX: camera.centreX - distance, autoFit: false };
		else if (event.key === 'ArrowRight')
			next = { ...camera, centreX: camera.centreX + distance, autoFit: false };
		else if (event.key === 'ArrowUp')
			next = { ...camera, centreY: camera.centreY + distance, autoFit: false };
		else if (event.key === 'ArrowDown')
			next = { ...camera, centreY: camera.centreY - distance, autoFit: false };
		else if (event.key === '+' || event.key === '=')
			next = { ...camera, zoom: camera.zoom * 1.25, autoFit: false };
		else if (event.key === '-' || event.key === '_')
			next = { ...camera, zoom: camera.zoom / 1.25, autoFit: false };
		else if (event.key === '0' || event.key === 'Home')
			next = { centreX: 0, centreY: 0, zoom: 1, autoFit: true };
		else return;
		event.preventDefault();
		setCamera(next);
	}

	$effect(() => {
		revision.toString();
		diffusion.toString();
		particleSize.toString();
		trailOpacity.toString();
		showTheory.toString();
		showParticles.toString();
		showPaths.toString();
		showDensity.toString();
		showVelocity.toString();
		camera.centreX.toString();
		camera.centreY.toString();
		camera.zoom.toString();
		potential?.landscape.toString();
		potential?.centerX.toString();
		potential?.centerY.toString();
		potential?.stiffness.toString();
		potential?.transverseStiffness.toString();
		potential?.barrierHeight.toString();
		potential?.wellSeparation.toString();
		potential?.period.toString();
		potential?.tilt.toString();
		obstacles.length.toString();
		if (ready) draw();
	});

	onMount(() => {
		ready = true;
		registerCanvas(canvas);
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(host);
		resize();
		return () => {
			registerCanvas(null);
			resizeObserver?.disconnect();
			resizeObserver = null;
		};
	});
</script>

<div class="stage-shell" class:is-ready={ready} bind:this={host} data-testid="brownian-stage">
	<img
		class="stage-poster"
		src="/images/brownian-motion-laboratory.png"
		alt="A Brownian trajectory crossing a measured cloud of possible paths beside a Gaussian curve"
		width="1600"
		height="900"
		loading="eager"
		decoding="async"
	/>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="Brownian-motion stage. Drag to pan. Use Control or Command plus the wheel to zoom; arrow keys pan; plus and minus zoom; zero resets the camera. The measurement table reports the experiment numerically."
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onwheel={wheel}
		onkeydown={keydown}
	>
		A Brownian-motion stage. The text status and measurement table below report the same experiment
		numerically.
	</canvas>
	<p class="camera-help" aria-hidden="true">
		drag to pan · Ctrl/⌘ + wheel to zoom · arrows / + / − / 0
	</p>
	<noscript>
		<p class="noscript-note">
			The live laboratory requires JavaScript. The article, equations, and static experiment poster
			remain available.
		</p>
	</noscript>
</div>

<style>
	.stage-shell {
		--brownian-stage: color-mix(in srgb, var(--paper, #f4f0e6) 94%, var(--accent, #6f7fa8));
		--brownian-grid: color-mix(in srgb, var(--ink-muted, #68707a) 20%, transparent);
		--brownian-particle: #5f73a7;
		--brownian-trail: #405078;
		--brownian-theory: #9b5f48;
		--brownian-boundary: var(--ink-muted, #5d5850);
		--brownian-mean: var(--ink, #242a32);
		--brownian-potential: #9b5f48;
		--brownian-velocity: #9b5f48;
		position: relative;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		background: var(--brownian-stage);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--paper, #fff) 65%, transparent);
	}
	canvas,
	.stage-poster {
		display: block;
		width: 100%;
		min-height: 22rem;
		object-fit: cover;
	}
	canvas {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 160ms ease;
		cursor: grab;
		touch-action: pan-y;
	}
	canvas:active {
		cursor: grabbing;
	}
	canvas:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 72%, white);
		outline-offset: -3px;
	}
	.is-ready canvas {
		position: relative;
		opacity: 1;
	}
	.is-ready .stage-poster {
		display: none;
	}
	.camera-help {
		position: absolute;
		right: 0.55rem;
		bottom: 0.45rem;
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--rule, #c8c1b2) 75%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--paper, #f4f0e6) 88%, transparent);
		padding: 0.25rem 0.55rem;
		color: var(--ink-muted, #68707a);
		font:
			0.64rem 'Courier Prime',
			monospace;
		pointer-events: none;
	}
	.noscript-note {
		margin: 0;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding: 0.8rem 1rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.84rem;
		line-height: 1.5;
	}
	@media (max-width: 40rem) {
		canvas,
		.stage-poster {
			min-height: 20rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}
	}
</style>
