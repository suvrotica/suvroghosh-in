<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveMotion } from '$lib/motion/preferences';
	import { LifeModel } from '$lib/visualizations/living-systems/life';
	import { AntModel } from '$lib/visualizations/living-systems/ant';
	import { DiffusionModel } from '$lib/visualizations/living-systems/diffusion';
	import { WalkModel } from '$lib/visualizations/living-systems/walk';
	import { createPainter, type Models } from '$lib/visualizations/living-systems/renderer';
	import {
		MODES,
		SPEEDS,
		FixedClock,
		cellSize,
		screenToWorld,
		zoomAt,
		formatNumber,
		type Mode,
		type Camera,
		type Tool,
		type Metric
	} from '$lib/visualizations/living-systems/presentation';

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let mode = $state<Mode>('life');
	let playing = $state(false);
	let ready = $state(false);
	let error = $state('');
	let seed = $state(1847);
	let speedIndex = $state(2);
	let density = $state(0.28);
	let boundary = $state<'wrap' | 'finite'>('wrap');
	let diffusivity = $state(0.18);
	let continuous = $state(false);
	let walkers = $state(160);
	let trails = $state(100);
	let heatmap = $state(false);
	let grid = $state(false);
	let follow = $state(false);
	let brush = $state(3);
	let stamp = $state('glider');
	let tool = $state<Tool>('pan');
	let metrics = $state<Metric[]>([]);
	let history = $state<number[]>([]);
	let steps = $state(0);
	let zoom = $state(100);
	let status = $state('');
	let reduced = $state(false);
	let presets = $state<Record<Mode, string>>({
		life: 'soup',
		ant: 'highway',
		diffusion: 'drop',
		walk: 'ensemble'
	});
	const info = $derived(MODES.find((item) => item.id === mode)!);
	const presetName = $derived(
		info.presets.find(([id]) => id === presets[mode])?.[1] ?? 'Custom field'
	);
	const targetRate = $derived(info.rate * SPEEDS[speedIndex]);
	const chartMax = $derived(Math.max(1e-8, ...history, mode === 'walk' ? steps : 0));
	const chartPath = $derived(
		history
			.map(
				(value, index) =>
					`${index === 0 ? 'M' : 'L'}${((index / Math.max(1, history.length - 1)) * 270 + 5).toFixed(2)},${(72 - (value / chartMax) * 60).toFixed(2)}`
			)
			.join(' ')
	);
	const referencePath = $derived(
		mode === 'walk' && history.length > 1
			? `M5,${72 - (Math.max(0, steps - history.length + 1) / chartMax) * 60} L275,${72 - (steps / chartMax) * 60}`
			: ''
	);
	const help = $derived(
		mode === 'walk'
			? 'Drag to pan · scroll or pinch to zoom · Home to fit'
			: tool === 'pan'
				? 'Drag to pan · scroll or pinch to zoom · choose a brush to edit'
				: 'Paint on the field · editing pauses the clock · arrows + Enter also paint'
	);
	const clock = new FixedClock();
	let models: Models;
	const seeds: Record<Mode, number> = { life: 1847, ant: 1847, diffusion: 1847, walk: 1847 };
	let painter: ReturnType<typeof createPainter>;
	let context: CanvasRenderingContext2D | null = null;
	let width = 800,
		height = 560,
		pixelRatio = 1;
	let mounted = false,
		visible = true,
		raf = 0,
		lastTime = 0,
		lastReadout = 0,
		dirty = true;
	let camera: Camera = { x: 60, y: 42, zoom: 1 };
	const cameras: Record<Mode, Camera> = {
		life: { x: 60, y: 42, zoom: 1 },
		ant: { x: 0, y: 0, zoom: 1 },
		diffusion: { x: 60, y: 42, zoom: 1 },
		walk: { x: 60, y: 42, zoom: 1 }
	};
	let cursor: { x: number; y: number; radius: number } | null = null;
	let keyboardX = 60,
		keyboardY = 42;
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDistance = 0;
	let lastPaint: { x: number; y: number } | null = null;

	function refresh() {
		if (!mounted) return;
		metrics = models[mode].stats();
		history = [...models[mode].history];
		steps = models[mode].steps;
		zoom = Math.round(camera.zoom * 100);
	}
	function invalidate() {
		dirty = true;
		schedule();
	}
	function schedule() {
		if (mounted && !raf && visible && !document.hidden && (dirty || playing))
			raf = requestAnimationFrame(frame);
	}
	function drawNow() {
		if (!context || !ready) return;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		painter(context, width, height, models, mode, camera, { grid, trails, heatmap, cursor });
		dirty = false;
	}
	function followAnt() {
		if (mode === 'ant' && follow) {
			camera.x = models.ant.x + 0.5;
			camera.y = models.ant.y + 0.5;
		}
	}
	function frame(time: number) {
		raf = 0;
		if (!mounted || !visible || document.hidden) {
			lastTime = 0;
			return;
		}
		if (playing && lastTime) {
			const count = clock.advance(
				time - lastTime,
				info.rate * SPEEDS[speedIndex],
				mode === 'ant' ? 4096 : 32
			);
			if (count) {
				models[mode].step(count);
				dirty = true;
			}
			if (mode === 'ant') {
				followAnt();
				if (models.ant.exhausted) {
					playing = false;
					status = 'One million steps reached. Reset to start another experiment.';
				}
			}
		}
		lastTime = time;
		if (dirty) drawNow();
		if (time - lastReadout > 180 || !playing) {
			refresh();
			lastReadout = time;
		}
		if (playing) schedule();
	}
	function setPlaying(value: boolean) {
		if (!ready) return;
		playing = value;
		lastTime = 0;
		clock.clear();
		invalidate();
	}
	function singleStep() {
		if (!ready) return;
		setPlaying(false);
		models[mode].step();
		followAnt();
		refresh();
		invalidate();
	}
	function switchMode(next: Mode) {
		if (!ready || next === mode) return;
		cameras[mode] = { ...camera };
		seeds[mode] = seed;
		mode = next;
		seed = seeds[next];
		camera = { ...cameras[next] };
		keyboardX = Math.floor(camera.x);
		keyboardY = Math.floor(camera.y);
		tool = 'pan';
		cursor = null;
		follow = false;
		lastTime = 0;
		clock.clear();
		status = '';
		refresh();
		invalidate();
	}
	function reset() {
		if (!ready) return;
		setPlaying(false);
		if (mode === 'life') models.life.reset(seed, presets.life, density, boundary);
		else if (mode === 'ant') models.ant.reset(presets.ant);
		else if (mode === 'diffusion') {
			models.diffusion.reset(presets.diffusion, diffusivity);
			models.diffusion.continuous = continuous;
		} else models.walk.reset(seed, presets.walk, walkers);
		if (mode === 'walk') walkers = models.walk.count;
		status = '';
		fit();
		refresh();
		invalidate();
	}
	function choosePreset(value: string) {
		presets[mode] = value;
		reset();
	}
	function freshSeed() {
		seed = crypto.getRandomValues(new Uint32Array(1))[0];
		reset();
	}
	function fit() {
		if (!ready) return;
		if (mode === 'ant') {
			const ant = models.ant;
			let minX = Math.min(ant.x, -8),
				maxX = Math.max(ant.x, 8),
				minY = Math.min(ant.y, -8),
				maxY = Math.max(ant.y, 8);
			for (const key of ant.black) {
				const [x, y] = key.split(',').map(Number);
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
			camera = {
				x: (minX + maxX + 1) / 2,
				y: (minY + maxY + 1) / 2,
				zoom: Math.min(3, 108 / (maxX - minX + 10), 72 / (maxY - minY + 10))
			};
		} else camera = { x: 60, y: 42, zoom: 1 };
		follow = false;
		keyboardX = Math.floor(camera.x);
		keyboardY = Math.floor(camera.y);
		refresh();
		invalidate();
	}
	function setTool(value: Tool) {
		tool = value;
		cursor = null;
		if (value !== 'pan') setPlaying(false);
		invalidate();
	}
	function changeZoom(factor: number) {
		camera = zoomAt(camera, factor, width / 2, height / 2, width, height);
		refresh();
		invalidate();
	}
	function pointerLocation(event: PointerEvent | WheelEvent) {
		const rect = canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) * width) / rect.width,
			y: ((event.clientY - rect.top) * height) / rect.height
		};
	}
	function paint(x: number, y: number) {
		const px = Math.floor(x),
			py = Math.floor(y);
		if (mode !== 'ant' && (px < 0 || py < 0 || px >= 120 || py >= 84)) return;
		if (mode === 'life' && (tool === 'paint' || tool === 'erase' || tool === 'stamp'))
			models.life.paint(px, py, tool, brush, stamp);
		else if (mode === 'ant' && (tool === 'paint' || tool === 'erase'))
			models.ant.paint(px, py, tool);
		else if (mode === 'diffusion' && (tool === 'paint' || tool === 'erase' || tool === 'obstacle'))
			models.diffusion.paint(px, py, tool, brush);
		refresh();
		invalidate();
	}
	function pointerDown(event: PointerEvent) {
		if (!ready || (event.button !== 0 && event.pointerType === 'mouse')) return;
		canvas.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		const point = pointerLocation(event);
		pointers.set(event.pointerId, point);
		lastPaint = null;
		if (pointers.size > 1) {
			const [a, b] = [...pointers.values()];
			pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
			cursor = null;
			return;
		}
		if (tool !== 'pan') {
			setPlaying(false);
			const p = screenToWorld(point.x, point.y, width, height, camera);
			paint(p.x, p.y);
			lastPaint = p;
		}
	}
	function pointerMove(event: PointerEvent) {
		if (!ready) return;
		const point = pointerLocation(event),
			previous = pointers.get(event.pointerId);
		if (previous) pointers.set(event.pointerId, point);
		if (pointers.size >= 2) {
			const [a, b] = [...pointers.values()];
			const distance = Math.hypot(b.x - a.x, b.y - a.y);
			if (pinchDistance > 0)
				camera = zoomAt(
					camera,
					distance / pinchDistance,
					(a.x + b.x) / 2,
					(a.y + b.y) / 2,
					width,
					height
				);
			pinchDistance = distance;
			refresh();
			invalidate();
			return;
		}
		if (previous && tool === 'pan') {
			const scale = cellSize(width, height, camera);
			camera.x -= (point.x - previous.x) / scale;
			camera.y -= (point.y - previous.y) / scale;
			follow = false;
		}
		const p = screenToWorld(point.x, point.y, width, height, camera);
		cursor =
			tool === 'pan'
				? null
				: { x: Math.floor(p.x), y: Math.floor(p.y), radius: mode === 'ant' ? 1 : brush };
		if (previous && tool !== 'pan' && tool !== 'stamp') {
			if (lastPaint) {
				const length = Math.hypot(p.x - lastPaint.x, p.y - lastPaint.y);
				const samples = Math.min(180, Math.max(1, Math.ceil(length / Math.max(1, brush / 2))));
				for (let i = 1; i <= samples; i++)
					paint(
						lastPaint.x + ((p.x - lastPaint.x) * i) / samples,
						lastPaint.y + ((p.y - lastPaint.y) * i) / samples
					);
			} else paint(p.x, p.y);
			lastPaint = p;
		}
		invalidate();
	}
	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		pinchDistance = 0;
		lastPaint = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}
	function wheel(event: WheelEvent) {
		event.preventDefault();
		if (!ready) return;
		const p = pointerLocation(event);
		camera = zoomAt(
			camera,
			Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.0025),
			p.x,
			p.y,
			width,
			height
		);
		refresh();
		invalidate();
	}
	function keyDown(event: KeyboardEvent) {
		if (!ready || event.target !== canvas) return;
		if (event.key === ' ') {
			event.preventDefault();
			setPlaying(!playing);
		} else if (event.key.toLowerCase() === 'r') reset();
		else if (event.key.toLowerCase() === 'n') singleStep();
		else if (event.key === 'Home') {
			event.preventDefault();
			fit();
		} else if (event.key === '+' || event.key === '=') changeZoom(1.25);
		else if (event.key === '-') changeZoom(0.8);
		else if (event.key.startsWith('Arrow')) {
			event.preventDefault();
			const distance = event.shiftKey ? 5 : 1;
			if (event.key === 'ArrowUp') keyboardY -= distance;
			if (event.key === 'ArrowDown') keyboardY += distance;
			if (event.key === 'ArrowLeft') keyboardX -= distance;
			if (event.key === 'ArrowRight') keyboardX += distance;
			if (mode !== 'ant') {
				keyboardX = Math.max(0, Math.min(119, keyboardX));
				keyboardY = Math.max(0, Math.min(83, keyboardY));
			}
			cursor = { x: keyboardX, y: keyboardY, radius: brush };
			invalidate();
		} else if (event.key === 'Enter' && tool !== 'pan') {
			event.preventDefault();
			setPlaying(false);
			paint(keyboardX, keyboardY);
		}
	}
	function saveFrame() {
		if (!ready) return;
		drawNow();
		const filename = `living-systems-${mode}-${models[mode].steps}.png`;
		const output = document.createElement('canvas');
		output.width = canvas.width;
		output.height = canvas.height + 100;
		const ctx = output.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#f3efe5';
		ctx.fillRect(0, 0, output.width, output.height);
		ctx.fillStyle = '#203331';
		ctx.font = '28px Georgia';
		ctx.fillText(`Living Systems / ${info.name}`, 28, 40);
		ctx.font = '13px monospace';
		ctx.fillText(
			`Step ${models[mode].steps} · ${presetName}${mode === 'life' || mode === 'walk' ? ` · Seed ${seed}` : ''} · suvroghosh.in`,
			28,
			70
		);
		ctx.drawImage(canvas, 0, 100);
		output.toBlob((blob) => {
			if (!blob || !mounted) return;
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
		}, 'image/png');
	}
	onMount(() => {
		mounted = true;
		try {
			context = canvas.getContext('2d', { alpha: false });
			if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
			models = {
				life: new LifeModel(seed, 'soup', density, boundary),
				ant: new AntModel('highway'),
				diffusion: new DiffusionModel(),
				walk: new WalkModel(seed)
			};
			painter = createPainter();
			ready = true;
		} catch (problem) {
			error = problem instanceof Error ? problem.message : 'The field could not initialise.';
			return;
		}
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			reduced =
				resolveMotion(document.documentElement.dataset.motionPreference, query.matches) ===
					'still' || new URLSearchParams(location.search).get('motion') === 'reduce';
			if (reduced) setPlaying(false);
		};
		motion();
		playing = !reduced;
		const motionObserver = new MutationObserver(motion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion-preference']
		});
		query.addEventListener('change', motion);
		const resize = new ResizeObserver(() => {
			const rect = stage.getBoundingClientRect();
			width = Math.max(1, rect.width);
			height = Math.max(1, rect.height);
			pixelRatio = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.round(width * pixelRatio);
			canvas.height = Math.round(height * pixelRatio);
			invalidate();
		});
		resize.observe(stage);
		const intersection = new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			lastTime = 0;
			clock.clear();
			if (!visible) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else invalidate();
		});
		intersection.observe(stage);
		const visibility = () => {
			lastTime = 0;
			clock.clear();
			if (document.hidden) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else invalidate();
		};
		document.addEventListener('visibilitychange', visibility);
		canvas.addEventListener('wheel', wheel, { passive: false });
		refresh();
		invalidate();
		return () => {
			mounted = false;
			cancelAnimationFrame(raf);
			resize.disconnect();
			intersection.disconnect();
			motionObserver.disconnect();
			query.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
			canvas.removeEventListener('wheel', wheel);
			pointers.clear();
		};
	});
</script>

<div class="ls-runtime" bind:this={host} data-mode={mode} data-steps={steps} data-playing={playing}>
	<nav class="ls-modes" aria-label="Choose a simulation">
		{#each MODES as item}
			<button
				class:active={mode === item.id}
				aria-pressed={mode === item.id}
				onclick={() => switchMode(item.id)}
				disabled={!ready}
			>
				<span class="ls-mode-number">{item.index}</span>
				<svg viewBox="0 0 52 42" aria-hidden="true">
					{#if item.id === 'life'}<path
							d="M10 7h7v7h-7zm9 0h7v7h-7zm9 9h7v7h-7zM10 25h7v7h-7zm9 0h7v7h-7zm9 0h7v7h-7z"
							fill="currentColor"
						/>
					{:else if item.id === 'ant'}<path
							d="M9 31V14h9v17h9V7h9v24h8"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
						/><circle cx="36" cy="7" r="3" fill="currentColor" />
					{:else if item.id === 'diffusion'}<circle
							cx="26"
							cy="21"
							r="15"
							fill="none"
							stroke="currentColor"
							opacity=".25"
						/><circle
							cx="26"
							cy="21"
							r="10"
							fill="none"
							stroke="currentColor"
							opacity=".6"
						/><circle cx="26" cy="21" r="5" fill="currentColor" />
					{:else}<path
							d="M7 30h9V17h8v8h8V9h12"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						/><circle cx="44" cy="9" r="3" fill="currentColor" />{/if}
				</svg>
				<span class="ls-mode-name">{item.name}<small>{item.category}</small></span><span
					class="ls-mode-arrow"
					aria-hidden="true">↗</span
				>
			</button>
		{/each}
	</nav>
	<div class="ls-workspace">
		<div class="ls-main">
			<div class="ls-stage-heading">
				<div>
					<span class="ls-eyebrow">EXPERIMENT {info.index} / {info.category}</span>
					<h3>{info.heading}</h3>
				</div>
				<span class="ls-rule">{info.rule}</span>
			</div>
			<div class="ls-stage" bind:this={stage} class:painting={tool !== 'pan'}>
				<canvas
					bind:this={canvas}
					tabindex="0"
					aria-label={`${info.name} interactive field`}
					aria-describedby="ls-field-help"
					onpointerdown={pointerDown}
					onpointermove={pointerMove}
					onpointerup={pointerUp}
					onpointercancel={pointerUp}
					onlostpointercapture={pointerUp}
					onpointerleave={() => {
						if (!pointers.size) {
							cursor = null;
							invalidate();
						}
					}}
					onkeydown={keyDown}
				></canvas>
				<div class="ls-stage-top">
					<span><i class:running={playing}></i>{playing ? 'IN MOTION' : 'OBSERVATION PAUSED'}</span
					><span
						>{mode === 'ant'
							? 'UNBOUNDED LATTICE'
							: mode === 'walk'
								? 'WRAPPED VIEW / UNBOUNDED WALK'
								: mode === 'diffusion'
									? 'CLOSED FIELD / NO FLUX'
									: boundary === 'wrap'
										? '120 × 84 / WRAPPING EDGES'
										: '120 × 84 / FINITE EDGES'}</span
					>
				</div>
				{#if error}<div class="ls-canvas-error" role="status">
						{error} The rules and guide remain available below.
					</div>{/if}
				<div class="ls-stage-bottom">
					<span
						>{mode === 'life'
							? 'CORAL = NEW / TEAL = SURVIVING'
							: mode === 'ant'
								? 'GOLD = BLACK CELL / CORAL = ANT'
								: mode === 'diffusion'
									? 'CONCENTRATION 0 ━━━━━ ≥4 (SATURATED)'
									: heatmap
										? 'HEAT = RELATIVE VISITS / RING = ORIGIN'
										: 'TRAILS = RECENT PATHS / RING = ORIGIN'}</span
					><span>{zoom}%</span>
				</div>
			</div>
			<div class="ls-transport">
				<div class="ls-transport-actions">
					<button
						class="ls-play"
						onclick={() => setPlaying(!playing)}
						disabled={!ready}
						aria-label={playing ? 'Pause simulation' : 'Play simulation'}
						><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing
							? 'Pause'
							: 'Play'}</button
					><button onclick={singleStep} disabled={!ready} title="Advance exactly one step (N)"
						>Step <span aria-hidden="true">↦</span></button
					><button
						onclick={reset}
						disabled={!ready}
						title="Restore the selected initial conditions (R)"
						>Reset <span aria-hidden="true">↺</span></button
					>
				</div>
				<label class="ls-speed"
					><span>SPEED <b>{SPEEDS[speedIndex]}×</b></span><input
						aria-label="Simulation speed"
						type="range"
						min="0"
						max="6"
						step="1"
						bind:value={speedIndex}
						oninput={() => {
							clock.clear();
							lastTime = 0;
						}}
					/><small>{formatNumber(targetRate)} steps / second target</small></label
				>
				<div class="ls-zoom">
					<button aria-label="Zoom out" onclick={() => changeZoom(0.8)}>−</button><button
						onclick={fit}
						title="Fit the field (Home)">Fit</button
					><button aria-label="Zoom in" onclick={() => changeZoom(1.25)}>+</button>
				</div>
			</div>
			<p class="ls-field-help" id="ls-field-help">{help}</p>
		</div>
		<aside class="ls-panel" aria-label={`${info.name} controls and measurements`}>
			<div class="ls-panel-block">
				<div class="ls-section-label"><span>INITIAL CONDITIONS</span><span>↙ START HERE</span></div>
				<label class="ls-control"
					><span>Choose a beginning</span><select
						aria-label="Preset"
						value={presets[mode]}
						onchange={(e) => choosePreset(e.currentTarget.value)}
						>{#each info.presets as [id, name]}<option value={id}>{name}</option>{/each}</select
					></label
				>
				{#if mode === 'life' || mode === 'walk'}<div class="ls-seed-row">
						<label class="ls-control"
							><span>Seed</span><input
								aria-label="Random seed"
								type="number"
								min="0"
								max="4294967295"
								step="1"
								bind:value={seed}
								onchange={() => {
									seed = Number.isFinite(seed)
										? Math.max(0, Math.min(4294967295, Math.trunc(seed)))
										: 1847;
									reset();
								}}
							/></label
						><button onclick={freshSeed} aria-label="Generate a new random seed" title="New seed"
							>↻</button
						>
					</div>{/if}
				{#if mode === 'ant'}<p class="ls-small">
						{presets.ant === 'highway'
							? 'Pre-rolled through 11,000 real steps. Continue to watch the highway grow.'
							: presets.ant === 'classic'
								? 'An empty grid, one ant, and no random decisions.'
								: 'The same rule on a patterned starting grid. A different future.'}
					</p>
					<label class="ls-check"
						><input
							type="checkbox"
							bind:checked={follow}
							onchange={() => {
								followAnt();
								invalidate();
							}}
						/>Follow the ant</label
					>{/if}
				{#if mode === 'life'}<label class="ls-control"
						><span>Boundary</span><select
							aria-label="Life boundary"
							bind:value={boundary}
							onchange={() => {
								models.life.boundary = boundary;
								invalidate();
							}}
							><option value="wrap">Wrap around</option><option value="finite"
								>Finite, dead outside</option
							></select
						></label
					>{/if}
				{#if mode === 'diffusion'}<label class="ls-control"
						><span>Diffusivity <b>{diffusivity.toFixed(2)}</b></span><input
							aria-label="Diffusivity"
							type="range"
							min=".02"
							max=".24"
							step=".01"
							bind:value={diffusivity}
							oninput={() => {
								models.diffusion.diffusivity = diffusivity;
								invalidate();
							}}
						/></label
					><label class="ls-check"
						><input
							type="checkbox"
							bind:checked={continuous}
							onchange={() => {
								models.diffusion.continuous = continuous;
								invalidate();
							}}
						/>Continuous source</label
					>
					<p class="ls-small">
						{continuous
							? 'The last deposit keeps adding dye each step.'
							: 'Each brush stroke adds dye once. Total dye is conserved afterwards.'}
					</p>{/if}
				{#if mode === 'walk'}<label class="ls-control"
						><span>Walkers <b>{walkers}</b></span><input
							aria-label="Walker count"
							type="range"
							min="1"
							max="600"
							step="1"
							bind:value={walkers}
							onchange={() => {
								presets.walk = 'ensemble';
								reset();
							}}
						/></label
					><label class="ls-check"
						><input type="checkbox" bind:checked={heatmap} onchange={invalidate} />Show occupancy
						heatmap</label
					>{/if}
			</div>
			<div class="ls-panel-block ls-observations">
				<div class="ls-section-label">
					<span>LIVE OBSERVATIONS</span><span aria-hidden="true">●</span>
				</div>
				<dl class="ls-metrics">
					{#each metrics as metric}<div>
							<dt>{metric.label}</dt>
							<dd>
								{formatNumber(metric.value)}{#if metric.unit}<small>{metric.unit}</small>{/if}
							</dd>
						</div>{/each}
				</dl>
				<div class="ls-chart">
					<div><span>{info.chart}</span><span>{formatNumber(chartMax)}</span></div>
					<svg
						viewBox="0 0 280 82"
						role="img"
						aria-label={`${info.chart}: ${history.length} recorded steps, latest ${formatNumber(history.at(-1) ?? 0)}`}
						><path
							d="M5 12H275 M5 42H275 M5 72H275"
							stroke="currentColor"
							opacity=".12"
							fill="none"
						/>{#if referencePath}<path
								d={referencePath}
								stroke="#b25b41"
								stroke-dasharray="4 4"
								fill="none"
								stroke-width="1.5"
							/>{/if}<path
							d={chartPath}
							stroke="#257b70"
							fill="none"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/></svg
					>
					<div>
						<span>{Math.max(0, steps - history.length + 1)}</span><span
							>STEP {formatNumber(steps)}</span
						>
					</div>
					{#if mode === 'walk'}<p class="ls-small">Solid: measured · Dashed: E[r²] = steps</p>{/if}
				</div>
			</div>
			<div class="ls-panel-block ls-notice">
				<span class="ls-eyebrow">WHAT TO NOTICE</span>
				<p>
					{mode === 'ant' && presets.ant !== 'highway'
						? 'White: turn right. Black: turn left. Flip the square and move. The whole path follows from those instructions; no random choice is involved.'
						: info.notice}
				</p>
			</div>
		</aside>
	</div>
	<div class="ls-tools">
		<div>
			<span class="ls-section-label">FIELD TOOLS</span>
			<div class="ls-tool-buttons">
				<button
					class:chosen={tool === 'pan'}
					aria-pressed={tool === 'pan'}
					onclick={() => setTool('pan')}>↔ Pan</button
				>{#if mode !== 'walk'}<button
						class:chosen={tool === 'paint'}
						aria-pressed={tool === 'paint'}
						onclick={() => setTool('paint')}>{mode === 'diffusion' ? '+ Dye' : '+ Paint'}</button
					><button
						class:chosen={tool === 'erase'}
						aria-pressed={tool === 'erase'}
						onclick={() => setTool('erase')}>− Erase</button
					>{#if mode === 'life'}<button
							class:chosen={tool === 'stamp'}
							aria-pressed={tool === 'stamp'}
							onclick={() => setTool('stamp')}>◇ Stamp</button
						>{/if}{#if mode === 'diffusion'}<button
							class:chosen={tool === 'obstacle'}
							aria-pressed={tool === 'obstacle'}
							onclick={() => setTool('obstacle')}>▥ Wall</button
						>{/if}{/if}
			</div>
		</div>
		<div class="ls-tool-options">
			{#if mode !== 'walk' && mode !== 'ant' && tool !== 'pan'}<label
					>Brush <input
						aria-label="Brush size"
						type="range"
						min="1"
						max="12"
						step="1"
						bind:value={brush}
					/><b>{brush}</b></label
				>{/if}{#if tool === 'stamp'}<select aria-label="Stamp pattern" bind:value={stamp}
					><option value="glider">Glider</option><option value="blinker">Blinker</option><option
						value="pulsar">Pulsar</option
					><option value="gun">Glider gun</option></select
				>{/if}<label class="ls-check"
				><input type="checkbox" bind:checked={grid} onchange={invalidate} />Grid</label
			><button onclick={saveFrame} disabled={!ready}>Save frame ↗</button>
		</div>
	</div>
	<details class="ls-advanced">
		<summary>Experiment notes & keyboard controls</summary>
		<div>
			{#if mode === 'life'}<label class="ls-control"
					><span>Random garden density <b>{Math.round(density * 100)}%</b></span><input
						aria-label="Initial density"
						type="range"
						min=".05"
						max=".65"
						step=".01"
						bind:value={density}
						onchange={() => {
							presets.life = 'soup';
							reset();
						}}
					/></label
				>
				<p>
					Rules are evaluated simultaneously. Colour shows cell age; every colour obeys the same
					B3/S23 rule.
				</p>{:else if mode === 'ant'}<p>
					White and black describe the logical cell states, shown here as charcoal and gold. The
					sparse grid has no edge. The experiment pauses at 1,000,000 steps to bound browser memory.
				</p>{:else if mode === 'diffusion'}<p>
					Dimensionless concentration; fixed colour scale 0–4, saturated above 4. Pale cells are
					impermeable walls. Painting a wall redistributes its dye to adjacent fluid; an
					isolated-pocket stroke is rejected. Erase deliberately removes dye and walls. Diffusivity
					is bounded at 0.24 for stability.
				</p>{:else}<label class="ls-control"
					><span>Visible trail <b>{trails} positions</b></span><input
						aria-label="Trail persistence"
						type="range"
						min="0"
						max="256"
						step="1"
						bind:value={trails}
						oninput={invalidate}
					/></label
				>
				<p>
					The display and occupancy heatmap wrap over a 120 × 84 tile. Displacement uses the actual
					unwrapped positions. Paths retain at most 256 positions per walker. Heatmap brightness is
					relative to the most visited cell.
				</p>{/if}
			<p>
				Focus the field: <kbd>Space</kbd> play/pause · <kbd>N</kbd> one step · <kbd>R</kbd> reset ·
				<kbd>Home</kbd>
				fit · <kbd>+</kbd>/<kbd>−</kbd> zoom. Arrow keys move the brush; <kbd>Enter</kbd> applies it.
				Hold Shift for larger moves.
			</p>
		</div>
	</details>
	<footer class="ls-footer">
		<span><i></i> DETERMINISTIC RULES. REAL MEASUREMENTS.</span><span
			>{reduced
				? 'Starts paused for your motion preference. Play when ready.'
				: 'Every world runs locally in your browser.'}</span
		>
	</footer>
	<p class="ls-status" role="status">{status}</p>
</div>
