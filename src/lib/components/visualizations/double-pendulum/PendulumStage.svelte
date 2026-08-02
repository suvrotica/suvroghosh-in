<script module lang="ts">
	export type StageState = {
		theta1: number;
		omega1: number;
		theta2: number;
		omega2: number;
	};

	export type StageParameters = { m1: number; m2: number; l1: number; l2: number; g: number };
	export type TrailPoint = { x: number; y: number };
	export type StageTrajectory = {
		state: StageState;
		trail: TrailPoint[];
		label: string;
		kind: 'primary' | 'shadow' | 'euler';
	};
	export type StageFrame = {
		parameters: StageParameters;
		trajectories: StageTrajectory[];
		view: 'overlay' | 'split' | 'trails';
		animate: boolean;
		showTrails: boolean;
		showGuides: boolean;
		showLabels: boolean;
		directManipulation: boolean;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		getframe: () => StageFrame;
		revision: number;
		ondrag: (
			target: 'upper' | 'lower',
			angle: number,
			phase: 'start' | 'move' | 'end' | 'cancel'
		) => void;
		oncapture: (capture: () => HTMLCanvasElement | null) => void;
		poster?: string;
		posterAlt?: string;
		label?: string;
	};

	let {
		getframe,
		revision,
		ondrag,
		oncapture,
		poster = '/images/double-pendulum-chaos.svg',
		posterAlt = 'A double pendulum with two initially close trails separating across a dark field',
		label = 'Animated double-pendulum mechanism. Drag either mass to create a release-from-rest state.'
	}: Props = $props();

	let shell: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let context: CanvasRenderingContext2D | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let frameId = 0;
	let width = 0;
	let height = 0;
	let dpr = 1;
	let visible = true;
	let ready = $state(false);
	let dragging: 'upper' | 'lower' | null = null;
	let pointerId: number | null = null;

	const palette = {
		background: '#081015',
		grid: '#253841',
		vertical: '#45606a',
		primary: '#e2764b',
		shadow: '#92d8ca',
		euler: '#e8b65b',
		rod: '#ddd4c5',
		ink: '#f4ede2',
		muted: '#91a5ac'
	};

	$effect(() => {
		revision.toString();
		if (!canvas || !context || !visible) return;
		const animate = getframe().animate;
		if (animate && frameId === 0) startDrawing();
		else if (!animate) {
			cancelAnimationFrame(frameId);
			frameId = 0;
			draw();
		}
	});

	onMount(() => {
		context = canvas.getContext('2d', { alpha: false });
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(shell);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				const nextVisible = entries.some((entry) => entry.isIntersecting);
				if (nextVisible === visible) return;
				visible = nextVisible;
				if (visible) startDrawing();
				else cancelAnimationFrame(frameId);
			},
			{ rootMargin: '180px 0px', threshold: 0.01 }
		);
		intersectionObserver.observe(shell);
		oncapture(() => (ready ? canvas : null));
		resize();
		startDrawing();
		return () => {
			cancelAnimationFrame(frameId);
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			oncapture(() => null);
		};
	});

	function startDrawing() {
		cancelAnimationFrame(frameId);
		const loop = () => {
			frameId = 0;
			draw();
			if (visible && !document.hidden && getframe().animate) {
				frameId = requestAnimationFrame(loop);
			}
		};
		frameId = requestAnimationFrame(loop);
	}

	function resize() {
		const rect = shell.getBoundingClientRect();
		width = Math.max(300, rect.width);
		height = Math.max(320, Math.min(720, width * (width < 640 ? 1.08 : 0.56)));
		dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
		canvas.style.height = `${height}px`;
		context?.setTransform(dpr, 0, 0, dpr, 0, 0);
		draw();
	}

	function trajectoryColor(kind: StageTrajectory['kind']) {
		return kind === 'shadow' ? palette.shadow : kind === 'euler' ? palette.euler : palette.primary;
	}

	function geometry(state: StageState, parameters: StageParameters) {
		const x1 = parameters.l1 * Math.sin(state.theta1);
		const y1 = parameters.l1 * Math.cos(state.theta1);
		return {
			x1,
			y1,
			x2: x1 + parameters.l2 * Math.sin(state.theta2),
			y2: y1 + parameters.l2 * Math.cos(state.theta2)
		};
	}

	function layout(frame: StageFrame) {
		const split = frame.view === 'split' && frame.trajectories.length > 1;
		const maxLength = Math.max(0.1, frame.parameters.l1 + frame.parameters.l2);
		const scale = split
			? Math.min(width * 0.2, height * 0.39) / maxLength
			: Math.min(width * 0.42, height * 0.4) / maxLength;
		const pivots = frame.trajectories.map((_, index) => ({
			x: split ? width * (index === 0 ? 0.28 : 0.72) : width / 2,
			y: height * 0.23
		}));
		return { scale, pivots };
	}

	function draw() {
		if (!context || width <= 0 || height <= 0) return;
		const ctx = context;
		const current = getframe();
		const { scale, pivots } = layout(current);
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = palette.background;
		ctx.fillRect(0, 0, width, height);
		drawGrid(ctx, width, height, scale);

		if (current.showTrails) {
			current.trajectories.forEach((trajectory, index) => {
				drawTrail(ctx, trajectory, pivots[index], scale, current.view === 'split');
			});
		}

		current.trajectories.forEach((trajectory, index) => {
			drawMechanism(ctx, trajectory, current.parameters, pivots[index], scale, current, index);
		});
		ctx.restore();
		if (!ready) ready = true;
	}

	function drawGrid(
		ctx: CanvasRenderingContext2D,
		canvasWidth: number,
		canvasHeight: number,
		scale: number
	) {
		ctx.save();
		ctx.strokeStyle = palette.grid;
		ctx.globalAlpha = 0.34;
		ctx.lineWidth = 1;
		const spacing = Math.max(36, Math.min(72, scale * 0.5));
		ctx.beginPath();
		for (let x = (canvasWidth / 2) % spacing; x < canvasWidth; x += spacing) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvasHeight);
		}
		for (let y = (canvasHeight * 0.23) % spacing; y < canvasHeight; y += spacing) {
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
		}
		ctx.stroke();
		ctx.restore();
	}

	function drawTrail(
		ctx: CanvasRenderingContext2D,
		trajectory: StageTrajectory,
		pivot: { x: number; y: number },
		scale: number,
		split: boolean
	) {
		if (trajectory.trail.length < 2) return;
		ctx.save();
		ctx.lineWidth = trajectory.kind === 'shadow' ? 1.25 : 1.55;
		ctx.lineCap = 'round';
		if (trajectory.kind === 'shadow') ctx.setLineDash([5, 4]);
		const color = trajectoryColor(trajectory.kind);
		const chunk = Math.max(12, Math.ceil(trajectory.trail.length / 20));
		for (let start = 1; start < trajectory.trail.length; start += chunk) {
			const end = Math.min(trajectory.trail.length, start + chunk);
			ctx.globalAlpha = 0.08 + 0.55 * (end / trajectory.trail.length) ** 1.5;
			ctx.strokeStyle = color;
			ctx.beginPath();
			const first = trajectory.trail[Math.max(0, start - 1)];
			ctx.moveTo(pivot.x + first.x * scale, pivot.y + first.y * scale);
			for (let index = start; index < end; index += 1) {
				const point = trajectory.trail[index];
				ctx.lineTo(pivot.x + point.x * scale, pivot.y + point.y * scale);
			}
			ctx.stroke();
		}
		if (split) ctx.setLineDash([]);
		ctx.restore();
	}

	function drawMechanism(
		ctx: CanvasRenderingContext2D,
		trajectory: StageTrajectory,
		parameters: StageParameters,
		pivot: { x: number; y: number },
		scale: number,
		frame: StageFrame,
		index: number
	) {
		const position = geometry(trajectory.state, parameters);
		const x1 = pivot.x + position.x1 * scale;
		const y1 = pivot.y + position.y1 * scale;
		const x2 = pivot.x + position.x2 * scale;
		const y2 = pivot.y + position.y2 * scale;
		const color = trajectoryColor(trajectory.kind);
		ctx.save();

		if (frame.showGuides) {
			ctx.strokeStyle = palette.vertical;
			ctx.globalAlpha = 0.7;
			ctx.setLineDash([3, 6]);
			ctx.beginPath();
			ctx.moveTo(pivot.x, pivot.y - 12);
			ctx.lineTo(pivot.x, pivot.y + (parameters.l1 + parameters.l2) * scale + 18);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.arc(
				pivot.x,
				pivot.y,
				parameters.l1 * scale * 0.24,
				Math.PI / 2,
				Math.PI / 2 - trajectory.state.theta1,
				trajectory.state.theta1 > 0
			);
			ctx.stroke();
		}

		const subdued = frame.view === 'trails';
		ctx.globalAlpha = subdued ? 0.36 : trajectory.kind === 'shadow' ? 0.84 : 1;
		ctx.strokeStyle = trajectory.kind === 'primary' ? palette.rod : color;
		ctx.lineWidth = trajectory.kind === 'shadow' ? 1.5 : 2.4;
		if (trajectory.kind === 'shadow') ctx.setLineDash([7, 5]);
		ctx.beginPath();
		ctx.moveTo(pivot.x, pivot.y);
		ctx.lineTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.globalAlpha = 1;
		ctx.fillStyle = palette.ink;
		ctx.beginPath();
		ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
		ctx.fill();
		drawMass(
			ctx,
			x1,
			y1,
			7 + Math.min(6, parameters.m1 * 2.2),
			color,
			trajectory.kind === 'shadow'
		);
		drawMass(
			ctx,
			x2,
			y2,
			9 + Math.min(8, parameters.m2 * 2.5),
			color,
			trajectory.kind === 'shadow'
		);

		if (frame.showLabels || frame.view === 'split') {
			ctx.fillStyle = trajectory.kind === 'primary' ? palette.ink : color;
			ctx.font = '600 11px ui-monospace, monospace';
			const split = frame.view === 'split';
			ctx.textAlign = index === 0 ? 'left' : 'right';
			const labelX = split
				? index === 0
					? pivot.x - width * 0.21
					: pivot.x + width * 0.21
				: index === 0
					? 18
					: width - 18;
			ctx.fillText(trajectory.label, labelX, 24);
		}
		ctx.restore();
	}

	function drawMass(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		radius: number,
		color: string,
		hollow: boolean
	) {
		ctx.save();
		ctx.fillStyle = hollow ? palette.background : color;
		ctx.strokeStyle = color;
		ctx.lineWidth = hollow ? 2.5 : 1.4;
		if (hollow) ctx.setLineDash([3, 2]);
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		if (!hollow) {
			ctx.fillStyle = 'rgb(255 249 235 / 0.72)';
			ctx.beginPath();
			ctx.arc(x - radius * 0.32, y - radius * 0.34, Math.max(1.5, radius * 0.2), 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	function pointerPosition(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function handlePointerDown(event: PointerEvent) {
		const current = getframe();
		if (!current.directManipulation || current.trajectories.length === 0) return;
		const point = pointerPosition(event);
		const { scale, pivots } = layout(current);
		const pivot = pivots[0];
		const position = geometry(current.trajectories[0].state, current.parameters);
		const upper = { x: pivot.x + position.x1 * scale, y: pivot.y + position.y1 * scale };
		const lower = { x: pivot.x + position.x2 * scale, y: pivot.y + position.y2 * scale };
		const upperDistance = Math.hypot(point.x - upper.x, point.y - upper.y);
		const lowerDistance = Math.hypot(point.x - lower.x, point.y - lower.y);
		const target = lowerDistance <= 34 ? 'lower' : upperDistance <= 32 ? 'upper' : null;
		if (!target) return;
		dragging = target;
		pointerId = event.pointerId;
		canvas.setPointerCapture(event.pointerId);
		updateDrag(event, 'start');
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging || pointerId !== event.pointerId) return;
		updateDrag(event, 'move');
		event.preventDefault();
	}

	function handlePointerUp(event: PointerEvent) {
		if (!dragging || pointerId !== event.pointerId) return;
		updateDrag(event, 'end');
		dragging = null;
		pointerId = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		event.preventDefault();
	}

	function handlePointerCancel(event: PointerEvent) {
		if (!dragging || pointerId !== event.pointerId) return;
		ondrag(dragging, 0, 'cancel');
		dragging = null;
		pointerId = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function updateDrag(event: PointerEvent, phase: 'start' | 'move' | 'end') {
		if (!dragging) return;
		const current = getframe();
		const point = pointerPosition(event);
		const { scale, pivots } = layout(current);
		const pivot = pivots[0];
		let origin = pivot;
		if (dragging === 'lower') {
			const state = current.trajectories[0].state;
			origin = {
				x: pivot.x + current.parameters.l1 * Math.sin(state.theta1) * scale,
				y: pivot.y + current.parameters.l1 * Math.cos(state.theta1) * scale
			};
		}
		const angle = Math.atan2(point.x - origin.x, point.y - origin.y);
		ondrag(dragging, angle, phase);
	}
</script>

<div bind:this={shell} class="stage-shell" class:is-ready={ready}>
	<img class="stage-poster" src={poster} alt={ready ? '' : posterAlt} aria-hidden={ready} />
	<canvas
		bind:this={canvas}
		aria-label={label}
		tabindex="0"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		onlostpointercapture={handlePointerCancel}
	></canvas>
	<p class="drag-hint" aria-hidden="true">Drag a mass · release from rest</p>
	<noscript
		><p class="noscript-note">
			The interactive mechanism requires JavaScript; the illustrated trajectories show the same
			experiment at rest.
		</p></noscript
	>
</div>

<style>
	.stage-shell {
		position: relative;
		min-width: 0;
		background: #081015;
		isolation: isolate;
		overflow: hidden;
		touch-action: pan-y;
	}
	.stage-poster,
	canvas {
		display: block;
		width: 100%;
	}
	.stage-poster {
		position: absolute;
		inset: 0;
		height: 100%;
		object-fit: cover;
		transition: opacity 180ms ease;
	}
	canvas {
		position: relative;
		z-index: 1;
		cursor: grab;
		background: transparent;
	}
	canvas:active {
		cursor: grabbing;
	}
	canvas:focus-visible {
		outline: 3px solid #a7dfd1;
		outline-offset: -5px;
	}
	.is-ready .stage-poster {
		opacity: 0;
		pointer-events: none;
	}
	.drag-hint {
		position: absolute;
		z-index: 2;
		right: 0.7rem;
		bottom: 0.55rem;
		margin: 0;
		border: 1px solid #38515a;
		border-radius: 999px;
		background: rgb(8 16 21 / 0.78);
		padding: 0.28rem 0.55rem;
		color: #aebdc2;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		pointer-events: none;
	}
	.noscript-note {
		position: absolute;
		z-index: 3;
		inset: auto 1rem 1rem;
		margin: 0;
		background: #101b20;
		padding: 0.7rem;
		color: #f3ecdf;
	}
	@media (prefers-reduced-motion: reduce) {
		.stage-poster {
			transition: none;
		}
	}
</style>
