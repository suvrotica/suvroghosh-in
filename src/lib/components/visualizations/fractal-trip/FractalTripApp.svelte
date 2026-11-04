<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteURL } from 'svelte/reactivity';
	import InstrumentControl from './InstrumentControl.svelte';
	import {
		DEFAULT_STATE,
		FAMILIES,
		PALETTES,
		PRESETS,
		minimumSpan,
		defaultForFamily,
		normalizeState,
		encodeState,
		decodeState,
		varyState,
		zoomAt,
		panView,
		type FractalState,
		type FamilyId
	} from '$lib/visualizations/fractal-trip/model';
	import {
		createJourney,
		sampleJourney,
		type JourneyPlan
	} from '$lib/visualizations/fractal-trip/journeys';
	import type { createFractalRenderer } from '$lib/visualizations/fractal-trip/renderer';
	type Panel = 'shapes' | 'equation' | 'colour' | 'saved' | 'help' | null;
	type Favourite = { name: string; state: FractalState };
	let design = $state<FractalState>(normalizeState(DEFAULT_STATE));
	let app: HTMLElement;
	let canvas: HTMLCanvasElement;
	let engine: ReturnType<typeof createFractalRenderer> | undefined;
	let ready = $state(false);
	let error = $state('');
	let panel = $state<Panel>(null);
	let playing = $state(false);
	let morphing = $state(false);
	let clean = $state(false);
	let expanded = $state(false);
	let nativeFullscreen = $state(false);
	let exporting = $state(false);
	let status = $state('');
	let stats = $state({ quality: 'Preparing', fps: 0, precision: 'Bounded precision' });
	let undoStack = $state<FractalState[]>([]);
	let redoStack = $state<FractalState[]>([]);
	let favourites = $state<Favourite[]>([]);
	let shareLink = $state('');
	let rootIndex = $state(0);
	let reduced = $state(false);
	let visible = true;
	let disposed = false;
	let frame = 0;
	let lastTime = 0;
	let journey: JourneyPlan | null = null;
	let journeyElapsed = 0;
	let messageTimer: ReturnType<typeof setTimeout>;
	let wheelTimer: ReturnType<typeof setTimeout>;
	let wheelActive = false;
	let pointers = new SvelteMap<number, { x: number; y: number }>();
	const storageKey = 'suvro-fractal-trip-favourites-v1';
	let family = $derived(FAMILIES.find((item) => item.id === design.family) ?? FAMILIES[0]);
	let is3d = $derived(family.kind === '3d');
	let currentName = $derived(
		design.family === 'mandelbrot' && design.power > 2
			? 'Multibrot'
			: design.family === 'tricorn' && design.power > 2
				? 'Multicorn'
				: family.name
	);
	let palette = $derived(PALETTES.find((item) => item.id === design.palette) ?? PALETTES[0]);
	let formula = $derived.by(() => {
		if (design.family === 'newton') return `z′ = z − ${design.relaxation.toFixed(2)} P(z) / P′(z)`;
		if (design.family === 'mandelbox')
			return `z′ = ${design.foldScale.toFixed(2)} · sphereFold(boxFold(z)) + c`;
		if (design.family === 'mandelbulb')
			return `z′ = sphericalPower(z, ${design.power}) + ${design.bulbJulia ? 'seed' : 'c'}`;
		const base =
			design.family === 'burning-ship'
				? '(|Re z| + i|Im z|)'
				: design.family === 'tricorn'
					? 'conj(z)'
					: 'z';
		return `${base}^${design.power} + ${design.family === 'julia' ? `(${design.seedRe.toFixed(3)} ${design.seedIm < 0 ? '−' : '+'} ${Math.abs(design.seedIm).toFixed(3)}i)` : 'c'}`;
	});
	function snapshot() {
		return normalizeState(design);
	}
	function announce(message: string) {
		status = message;
		clearTimeout(messageTimer);
		messageTimer = setTimeout(() => {
			if (!disposed) status = '';
		}, 5000);
	}
	function remember() {
		undoStack = [...undoStack.slice(-29), snapshot()];
		redoStack = [];
	}
	function apply(next: FractalState, interactive = false) {
		const normalized = normalizeState(next);
		if (!['mandelbulb', 'mandelbox'].includes(normalized.family))
			normalized.span = Math.max(normalized.span, minimumSpan(normalized, canvas?.height || 720));
		design = normalized;
		rootIndex = Math.min(rootIndex, design.roots.length - 1);
		engine?.update(design, interactive);
		shareLink = '';
	}
	function setValue(key: keyof FractalState, value: number | string | boolean) {
		pause();
		const next = { ...design, [key]: value };
		if (key === 'power' && !is3d) {
			const initial = defaultForFamily(design.family);
			next.centerRe = value === 2 ? initial.centerRe : 0;
			next.centerIm = value === 2 ? initial.centerIm : 0;
			next.span = value === 2 ? initial.span : 3.5;
		}
		apply(next, true);
	}
	function startEdit() {
		pause();
		remember();
	}
	function selectFamily(id: FamilyId) {
		pause();
		remember();
		apply({ ...defaultForFamily(id), palette: design.palette, quality: design.quality });
		rootIndex = 0;
		panel = null;
		announce(
			`${FAMILIES.find((item) => item.id === id)?.name} ready. Open Equation to change its rule.`
		);
	}
	function choosePreset(state: FractalState) {
		pause();
		remember();
		apply(state);
		panel = null;
		rootIndex = 0;
	}
	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		pause();
		redoStack = [...redoStack.slice(-29), snapshot()];
		undoStack = undoStack.slice(0, -1);
		apply(previous);
	}
	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		pause();
		undoStack = [...undoStack.slice(-29), snapshot()];
		redoStack = redoStack.slice(0, -1);
		apply(next);
	}
	function resetView() {
		pause();
		remember();
		const initial = defaultForFamily(design.family);
		const broad = !is3d && design.power > 2 && design.family !== 'newton';
		apply({
			...design,
			centerRe: broad ? 0 : initial.centerRe,
			centerIm: broad ? 0 : initial.centerIm,
			span: broad ? 3.5 : initial.span,
			rotation: 0,
			yaw: initial.yaw,
			pitch: initial.pitch,
			distance: initial.distance,
			journeyTime: 0
		});
	}
	function resetEquation() {
		pause();
		remember();
		const initial = defaultForFamily(design.family);
		apply({
			...design,
			power: initial.power,
			seedRe: initial.seedRe,
			seedIm: initial.seedIm,
			seedZ: initial.seedZ,
			bulbJulia: initial.bulbJulia,
			roots: initial.roots,
			relaxation: initial.relaxation,
			foldScale: initial.foldScale,
			foldLimit: initial.foldLimit,
			minRadius: initial.minRadius
		});
		rootIndex = 0;
	}
	function variation() {
		pause();
		remember();
		apply(varyState(snapshot()));
		rootIndex = 0;
		announce('A new variation. Undo brings the previous one back.');
	}
	function pause() {
		playing = false;
		morphing = false;
		cancelAnimationFrame(frame);
		frame = 0;
		lastTime = 0;
	}
	function tick(now: number) {
		frame = 0;
		if (disposed || (!playing && !morphing) || !visible || document.hidden) {
			lastTime = 0;
			return;
		}
		const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
		lastTime = now;
		const time = design.journeyTime + dt * design.speed;
		let next = { ...design, journeyTime: time };
		if (playing && journey) {
			journeyElapsed += dt * design.speed;
			next = sampleJourney(journey, journeyElapsed, next);
		}
		if (morphing) {
			next.seedRe += 0.12 * (Math.cos(time * 0.35) - Math.cos(design.journeyTime * 0.35));
			next.seedIm += 0.12 * (Math.sin(time * 0.35) - Math.sin(design.journeyTime * 0.35));
		}
		apply(next, true);
		frame = requestAnimationFrame(tick);
	}
	function startClock() {
		if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
	}
	function toggleTrip() {
		if (playing) {
			pause();
			return;
		}
		remember();
		journey = createJourney(snapshot(), canvas.clientWidth / canvas.clientHeight);
		journeyElapsed = 0;
		playing = true;
		startClock();
	}
	function toggleMorph() {
		if (morphing) {
			pause();
			return;
		}
		remember();
		morphing = true;
		startClock();
	}
	function zoom(factor: number, x = 0.5, y = 0.5, save = true) {
		pause();
		if (save) remember();
		if (is3d) apply({ ...design, distance: design.distance * factor }, true);
		else apply(zoomAt(design, x, y, factor, canvas.clientWidth / canvas.clientHeight), true);
	}
	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		pause();
		if (pointers.size === 0) remember();
		canvas.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	}
	function pointerMove(event: PointerEvent) {
		const before = pointers.get(event.pointerId);
		if (!before) return;
		const rect = canvas.getBoundingClientRect();
		const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
		if (other) {
			const previousDistance = Math.hypot(before.x - other.x, before.y - other.y);
			const distance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
			if (distance > 5 && previousDistance > 5) {
				const x = ((event.clientX + other.x) / 2 - rect.left) / rect.width;
				const y = ((event.clientY + other.y) / 2 - rect.top) / rect.height;
				zoom(previousDistance / distance, x, y, false);
			}
		} else if (is3d)
			apply(
				{
					...design,
					yaw: design.yaw - (event.clientX - before.x) * 0.007,
					pitch: design.pitch + (event.clientY - before.y) * 0.007
				},
				true
			);
		else
			apply(
				panView(
					design,
					(event.clientX - before.x) / rect.width,
					(event.clientY - before.y) / rect.height,
					rect.width / rect.height
				),
				true
			);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	}
	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (!pointers.size) engine?.update(design);
	}
	function wheel(event: WheelEvent) {
		if (document.activeElement !== canvas && !nativeFullscreen && !expanded) return;
		event.preventDefault();
		if (!wheelActive) remember();
		wheelActive = true;
		const rect = canvas.getBoundingClientRect();
		zoom(
			Math.exp(Math.max(-120, Math.min(120, event.deltaY)) * 0.003),
			(event.clientX - rect.left) / rect.width,
			(event.clientY - rect.top) / rect.height,
			false
		);
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(() => {
			wheelActive = false;
			engine?.update(design);
		}, 180);
	}
	function key(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeExpanded();
			clean = false;
			panel = null;
			return;
		}
		if ((event.target as HTMLElement).matches('input, select, textarea, button')) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (
			[' ', '+', '=', '-', 'r', 'f', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
				event.key
			)
		)
			event.preventDefault();
		if (event.key === ' ') toggleTrip();
		else if (['+', '='].includes(event.key)) zoom(0.8);
		else if (event.key === '-') zoom(1.25);
		else if (event.key === 'r') resetView();
		else if (event.key === 'f') void fullscreen();
		else if (event.key.startsWith('Arrow')) {
			pause();
			remember();
			const dx = event.key === 'ArrowLeft' ? 0.08 : event.key === 'ArrowRight' ? -0.08 : 0;
			const dy = event.key === 'ArrowUp' ? 0.08 : event.key === 'ArrowDown' ? -0.08 : 0;
			if (is3d) apply({ ...design, yaw: design.yaw + dx, pitch: design.pitch + dy });
			else apply(panView(design, dx, dy, canvas.clientWidth / canvas.clientHeight));
		}
	}
	function closeExpanded() {
		if (typeof app?.hidePopover === 'function' && app.matches(':popover-open')) app.hidePopover();
		app?.removeAttribute('popover');
		expanded = false;
	}
	function expandView() {
		expanded = true;
		// The article shell has a desktop transform. The top layer keeps this
		// fallback attached to the viewport rather than that transformed ancestor.
		if (typeof app.showPopover === 'function') {
			try {
				app.setAttribute('popover', 'manual');
				app.showPopover();
			} catch {
				app.removeAttribute('popover');
			}
		}
	}
	$effect(() => {
		if (!expanded) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});
	async function fullscreen() {
		if (expanded) {
			closeExpanded();
			return;
		}
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (app.requestFullscreen) await app.requestFullscreen();
			else expandView();
		} catch {
			expandView();
			announce('Expanded view. Use Exit fullscreen to return.');
		}
	}
	async function share() {
		const url = new SvelteURL(location.href);
		url.searchParams.set('trip', encodeState(snapshot()));
		url.hash = 'fractal-trip';
		shareLink = url.toString();
		try {
			await navigator.clipboard.writeText(shareLink);
			announce('Link copied. It opens on this exact view, paused.');
		} catch {
			announce('Select and copy your view link below.');
		}
	}
	async function saveImage() {
		if (!engine || exporting) return;
		exporting = true;
		try {
			const ratio = canvas.clientWidth / canvas.clientHeight;
			const blob = await engine.capture(
				Math.round(ratio >= 1 ? 1600 : 1600 * ratio),
				Math.round(ratio >= 1 ? 1600 / ratio : 1600)
			);
			if (disposed) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `fractal-trip-${design.family}.png`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			announce('Your artwork is saved as a PNG.');
		} catch (cause) {
			announce(cause instanceof Error ? cause.message : 'Could not export this view.');
		} finally {
			exporting = false;
		}
	}
	function storeFavourites(next: Favourite[]) {
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
			favourites = next;
			return true;
		} catch {
			announce('This browser could not save locally. Copy a link to keep the view.');
			return false;
		}
	}
	function favourite() {
		if (
			storeFavourites([
				...favourites.slice(-7),
				{ name: `${currentName} · ${palette.name}`, state: snapshot() }
			])
		)
			announce('Saved on this device. Find it under Saved views.');
	}
	function changeRoot(part: 're' | 'im', value: number) {
		const roots = design.roots.map((root, index) =>
			index === rootIndex ? { ...root, [part]: value } : { ...root }
		);
		pause();
		apply({ ...design, roots }, true);
	}
	function rootCount(value: number) {
		startEdit();
		const roots = Array.from({ length: value }, (_, i) => ({
			re: Math.cos((i / value) * 2 * Math.PI),
			im: Math.sin((i / value) * 2 * Math.PI)
		}));
		rootIndex = 0;
		apply({ ...design, roots });
	}
	function seedPad(event: PointerEvent) {
		startEdit();
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		const move = (e: PointerEvent) => {
			const rect = target.getBoundingClientRect();
			apply(
				{
					...design,
					seedRe: ((e.clientX - rect.left) / rect.width) * 3 - 1.5,
					seedIm: 1.5 - ((e.clientY - rect.top) / rect.height) * 3
				},
				true
			);
		};
		move(event);
		target.onpointermove = move;
		target.onpointerup = target.onpointercancel = () => {
			target.onpointermove = null;
			target.onpointerup = target.onpointercancel = null;
		};
	}
	onMount(() => {
		disposed = false;
		const restored = decodeState(new URL(location.href).searchParams.get('trip'));
		if (restored) design = restored;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		reduced = motion.matches;
		const motionChange = () => {
			reduced = motion.matches;
			if (reduced) pause();
		};
		motion.addEventListener('change', motionChange);
		try {
			const saved = localStorage.getItem(storageKey);
			if (saved && saved.length < 40000) {
				const parsed: unknown = JSON.parse(saved);
				if (Array.isArray(parsed))
					favourites = parsed
						.slice(0, 8)
						.filter(
							(item) =>
								item && typeof item === 'object' && typeof item.name === 'string' && item.state
						)
						.map((item) => ({ name: item.name.slice(0, 70), state: normalizeState(item.state) }));
			}
		} catch {
			/* Storage is optional. */
		}
		void import('$lib/visualizations/fractal-trip/renderer')
			.then(({ createFractalRenderer }) => {
				if (disposed) return;
				engine = createFractalRenderer(canvas, {
					onStatus: (value) => {
						if (!disposed) {
							stats = value;
							if (value.error) error = value.error;
							else error = '';
						}
					}
				});
				engine.update(design);
				engine.setVisible(visible);
				ready = true;
			})
			.catch((cause) => {
				if (!disposed)
					error = cause instanceof Error ? cause.message : 'WebGL2 is unavailable in this browser.';
			});
		canvas.addEventListener('wheel', wheel, { passive: false });
		app.addEventListener('keydown', key);
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				engine?.setVisible(visible);
				if (!visible) {
					cancelAnimationFrame(frame);
					frame = 0;
					lastTime = 0;
				} else startClock();
			},
			{ threshold: 0.05 }
		);
		observer.observe(app);
		const visibility = () => {
			if (document.hidden) {
				cancelAnimationFrame(frame);
				frame = 0;
				lastTime = 0;
			} else startClock();
		};
		const fullscreenChange = () => {
			nativeFullscreen = document.fullscreenElement === app;
		};
		document.addEventListener('visibilitychange', visibility);
		document.addEventListener('fullscreenchange', fullscreenChange);
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			clearTimeout(messageTimer);
			clearTimeout(wheelTimer);
			observer.disconnect();
			engine?.destroy();
			motion.removeEventListener('change', motionChange);
			canvas.removeEventListener('wheel', wheel);
			app.removeEventListener('keydown', key);
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('fullscreenchange', fullscreenChange);
		};
	});
</script>

<div
	class="ft-app"
	class:ft-expanded={expanded}
	class:ft-clean={clean}
	bind:this={app}
	id="fractal-trip"
	data-ready={ready}
	data-family={design.family}
	data-playing={playing}
>
	<header class="ft-header">
		<div class="ft-brand">
			<span class="ft-emblem" aria-hidden="true">◎</span>
			<div>
				<span class="ft-wordmark">FRACTAL<span>TRIP</span></span>
				<p>A SMALL RULE. A WORLD OF DETAIL.</p>
			</div>
		</div>
		<div class="ft-header-actions">
			<button
				class:active={panel === 'help'}
				onclick={() => (panel = panel === 'help' ? null : 'help')}
				aria-label="How to explore">?</button
			><button
				onclick={() => {
					clean = !clean;
				}}
				aria-label={clean ? 'Show controls' : 'Hide controls'}
				>{clean ? 'Show controls' : 'Hide controls'}</button
			><button class="ft-fullscreen" onclick={fullscreen}
				>{nativeFullscreen || expanded ? '↙ Exit fullscreen' : '↗ Fullscreen'}</button
			>
		</div>
	</header>
	<div class="ft-stage">
		<div class="ft-viewport">
			<canvas
				bind:this={canvas}
				tabindex="0"
				aria-label={`${currentName} fractal. Drag to ${is3d ? 'orbit' : 'pan'}, use plus and minus to zoom.`}
				onpointerdown={pointerDown}
				onpointermove={pointerMove}
				onpointerup={pointerUp}
				onpointercancel={pointerUp}
			></canvas>
			<div class="ft-screen-top">
				<span
					><i class:running={playing}></i>{playing
						? 'JOURNEY IN PROGRESS'
						: 'READY TO EXPLORE'}</span
				><span>{is3d ? 'THREE DIMENSIONS' : 'COMPLEX PLANE'}</span>
			</div>
			<div class="ft-scene-label">
				<span class="ft-eyebrow"
					>{String(FAMILIES.findIndex((item) => item.id === design.family) + 1).padStart(2, '0')} / {is3d
						? '3D FRACTAL'
						: design.relief > 0
							? '2D FRACTAL · RELIEF SHADING'
							: '2D FRACTAL'}</span
				>
				<h2>{currentName}<span>.</span></h2>
				<p>
					{is3d
						? 'Drag to look around. Get closer to the surface.'
						: 'Choose a shape. Change its equation. Follow the detail.'}
				</p>
			</div>
			<div class="ft-view-tools">
				<button onclick={() => zoom(0.72)} aria-label="Zoom in" disabled={!ready}>+</button><button
					onclick={() => zoom(1.4)}
					aria-label="Zoom out"
					disabled={!ready}>−</button
				><button onclick={resetView} aria-label="Reset view" title="Reset view">↺</button>
			</div>
			{#if !ready || error}<div class="ft-fallback">
					<img
						src="/images/visualizations/fractal-trip/poster.png"
						alt="A still view of the Fractal Trip Mandelbrot artwork"
						width="1440"
						height="900"
					/>
					<p role="status">
						{error ? `${error} You can still read the guide below.` : 'Preparing the renderer…'}
					</p>
				</div>{/if}
			<span class="ft-corner ft-corner-tl" aria-hidden="true"></span><span
				class="ft-corner ft-corner-tr"
				aria-hidden="true"
			></span><span class="ft-corner ft-corner-bl" aria-hidden="true"></span><span
				class="ft-corner ft-corner-br"
				aria-hidden="true"
			></span>
		</div>
		{#if panel}
			<aside
				class="ft-panel"
				aria-label={panel === 'equation' ? 'Equation controls' : `${panel} panel`}
			>
				<div class="ft-panel-title">
					<span
						>{panel === 'shapes'
							? 'CHOOSE YOUR SHAPE'
							: panel === 'equation'
								? 'CHANGE THE RULE'
								: panel === 'colour'
									? 'COLOUR & SURFACE'
									: panel === 'saved'
										? 'KEEP A DISCOVERY'
										: 'A FEW SIMPLE CONTROLS'}</span
					><button onclick={() => (panel = null)} aria-label="Close panel">×</button>
				</div>
				{#if panel === 'shapes'}
					<p class="ft-panel-intro">Small changes. Entirely different worlds.</p>
					<div class="ft-shape-list">
						{#each FAMILIES as item (item.id)}<button
								class:active={design.family === item.id}
								onclick={() => selectFamily(item.id)}
								><img
									src={`/images/visualizations/fractal-trip/${item.id}.png`}
									alt=""
									width="80"
									height="60"
									loading="lazy"
								/><span
									><strong>{item.name}</strong><small
										>{item.kind === '3d' ? '3D surface' : 'Zoom & explore'}</small
									></span
								><span aria-hidden="true">↗</span></button
							>{/each}
					</div>
					<p class="ft-panel-subtitle">PLACES TO BEGIN</p>
					{#each PRESETS.filter((item) => item.family === design.family) as preset (preset.id)}<button
							class="ft-preset"
							onclick={() => choosePreset(preset.state)}>{preset.name}<span>↗</span></button
						>{/each}
				{:else if panel === 'equation'}
					<p class="ft-panel-intro">{family.description}</p>
					<div class="ft-equation" aria-label="Current equation">{formula}</div>
					{#if !['newton', 'mandelbox'].includes(design.family)}<InstrumentControl
							label="Power"
							value={design.power}
							min={2}
							max={is3d ? 10 : 8}
							step={1}
							hint="Changes the repeated power in the equation."
							onstart={startEdit}
							onvalue={(value) => setValue('power', value)}
						/>{/if}
					{#if design.family === 'mandelbulb'}<label class="ft-check"
							><input
								type="checkbox"
								checked={design.bulbJulia}
								onchange={(event) => {
									startEdit();
									setValue('bulbJulia', event.currentTarget.checked);
								}}
							/>Use a fixed Julia seed</label
						>{/if}
					{#if design.family === 'julia' || (design.family === 'mandelbulb' && design.bulbJulia)}
						<button
							class="ft-seed-pad"
							aria-label="Julia seed pad. Drag to adjust real and imaginary seed; exact controls follow."
							onpointerdown={seedPad}
							style={`--seed-x:${((design.seedRe + 1.5) / 3) * 100}%;--seed-y:${((1.5 - design.seedIm) / 3) * 100}%`}
							><span></span><small>MOVE THE SEED</small></button
						>
						<InstrumentControl
							label="Seed real"
							value={design.seedRe}
							min={-1.5}
							max={1.5}
							step={0.001}
							onstart={startEdit}
							onvalue={(value) => setValue('seedRe', value)}
						/>
						<InstrumentControl
							label="Seed imaginary"
							value={design.seedIm}
							min={-1.5}
							max={1.5}
							step={0.001}
							onstart={startEdit}
							onvalue={(value) => setValue('seedIm', value)}
						/>
						{#if is3d}<InstrumentControl
								label="Seed depth"
								value={design.seedZ}
								min={-1.5}
								max={1.5}
								step={0.001}
								onstart={startEdit}
								onvalue={(value) => setValue('seedZ', value)}
							/>{/if}
						<button class="ft-wide-button" class:active={morphing} onclick={toggleMorph}
							>{morphing ? 'Pause seed motion' : 'Gently animate seed'}</button
						>
					{/if}
					{#if design.family === 'newton'}
						<label class="ft-select-label"
							>Number of roots<select
								value={design.roots.length}
								onchange={(event) => rootCount(Number(event.currentTarget.value))}
								>{#each [3, 4, 5, 6] as count (count)}<option value={count}>{count} roots</option
									>{/each}</select
							></label
						>
						<label class="ft-select-label"
							>Root to edit<select bind:value={rootIndex}
								>{#each design.roots as root, index (root)}<option value={index}
										>Root {index + 1}</option
									>{/each}</select
							></label
						>
						<InstrumentControl
							label="Root real"
							value={design.roots[Math.min(rootIndex, design.roots.length - 1)].re}
							min={-2}
							max={2}
							step={0.01}
							onstart={startEdit}
							onvalue={(value) => changeRoot('re', value)}
						/>
						<InstrumentControl
							label="Root imaginary"
							value={design.roots[Math.min(rootIndex, design.roots.length - 1)].im}
							min={-2}
							max={2}
							step={0.01}
							onstart={startEdit}
							onvalue={(value) => changeRoot('im', value)}
						/>
						<InstrumentControl
							label="Relaxation"
							value={design.relaxation}
							min={0.25}
							max={1.5}
							step={0.01}
							hint="How far each root-finding step travels."
							onstart={startEdit}
							onvalue={(value) => setValue('relaxation', value)}
						/>
					{/if}
					{#if design.family === 'mandelbox'}
						<InstrumentControl
							label="Fold scale"
							value={design.foldScale}
							min={-2.5}
							max={-1.2}
							step={0.01}
							hint="Expansion and inversion after each fold."
							onstart={startEdit}
							onvalue={(value) => setValue('foldScale', value)}
						/>
						<InstrumentControl
							label="Box fold size"
							value={design.foldLimit}
							min={0.5}
							max={1.5}
							step={0.01}
							onstart={startEdit}
							onvalue={(value) => setValue('foldLimit', value)}
						/>
						<InstrumentControl
							label="Inner radius"
							value={design.minRadius}
							min={0.2}
							max={0.8}
							step={0.01}
							hint="Outer sphere radius stays at 1."
							onstart={startEdit}
							onvalue={(value) => setValue('minRadius', value)}
						/>
					{/if}
					<button class="ft-wide-button" onclick={resetEquation}>Reset equation</button>
					<p class="ft-panel-note">
						{is3d
							? 'These controls change the 3D construction. The surface uses a finite calculation.'
							: design.family === 'julia'
								? 'Each pixel starts at a different z. Your seed c stays fixed.'
								: design.family === 'newton'
									? 'Colour identifies the root approached; unresolved points stay dark.'
									: 'Each pixel chooses c. The starting value is zero. Dark regions have not escaped within the calculation budget.'}
					</p>
				{:else if panel === 'colour'}
					<p class="ft-panel-intro">Same mathematics. A different light.</p>
					<div class="ft-palettes">
						{#each PALETTES as item (item.id)}<button
								class:active={design.palette === item.id}
								onclick={() => {
									remember();
									apply({ ...design, palette: item.id });
								}}
								><span
									class="ft-swatch"
									style={`background:linear-gradient(100deg,${item.colors.join(',')})`}
								></span>{item.name}</button
							>{/each}
					</div>
					<InstrumentControl
						label="Surface roughness"
						value={design.roughness}
						min={0.15}
						max={0.9}
						step={0.01}
						onstart={startEdit}
						onvalue={(value) => setValue('roughness', value)}
					/>
					<InstrumentControl
						label="Glow"
						value={design.glow}
						min={0}
						max={1}
						step={0.01}
						onstart={startEdit}
						onvalue={(value) => setValue('glow', value)}
					/>
					<InstrumentControl
						label="Light angle"
						value={Math.round((design.lightAngle * 180) / Math.PI)}
						min={0}
						max={359}
						step={1}
						onstart={startEdit}
						onvalue={(value) => setValue('lightAngle', (value * Math.PI) / 180)}
					/>
					<p class="ft-panel-note">
						Colours and surface lighting are artistic choices. They do not change the equation.
					</p>
				{:else if panel === 'saved'}
					<button class="ft-wide-button ft-primary" onclick={favourite}
						>+ Save this view on this device</button
					>
					{#if !favourites.length}<p class="ft-panel-intro">
							Keep a view here, or copy a link to take it with you.
						</p>{/if}
					{#each favourites as item, index (index)}<div class="ft-favourite">
							<button onclick={() => choosePreset(item.state)}
								>{item.name}<small>Open view ↗</small></button
							><button
								aria-label={`Delete saved view ${index + 1}`}
								onclick={() => storeFavourites(favourites.filter((_, i) => i !== index))}>×</button
							>
						</div>{/each}
					<button class="ft-wide-button" onclick={share}>Copy view link ↗</button><button
						class="ft-wide-button"
						onclick={saveImage}
						disabled={!ready || exporting}>{exporting ? 'Saving…' : 'Save artwork as PNG ↓'}</button
					>
				{:else}
					<p class="ft-panel-intro">
						Choose a shape, then open Equation to change the rule that makes it.
					</p>
					<dl class="ft-help">
						<dt>Explore</dt>
						<dd>
							Drag to pan a flat fractal or orbit a 3D surface. Pinch to zoom. Click the view to
							focus it, then scroll to zoom.
						</dd>
						<dt>Take a trip</dt>
						<dd>
							Start trip moves slowly through the current view. Dragging pauses it. A flat journey
							reverses at its numeric limit; 3D journeys orbit the surface.
						</dd>
						<dt>Use the keyboard</dt>
						<dd>
							Focus the view. Space starts or pauses, + and − zoom, arrows move, R resets, F opens
							fullscreen.
						</dd>
						<dt>What is the depth?</dt>
						<dd>
							Mandelbrot and Julia can have raised-looking shading. Mandelbulb and Mandelbox
							calculate actual 3D surfaces.
						</dd>
						<dt>Keep something</dt>
						<dd>
							Saved views stay on this device. A view link opens the same settings, paused. PNG
							saves the artwork without controls.
						</dd>
					</dl>
					<p class="ft-panel-note">
						{reduced
							? 'Reduced motion is on. All motion starts only when you choose it.'
							: 'Motion starts only when you choose it. You can pause at any time.'}
					</p>
				{/if}
			</aside>
		{/if}
	</div>
	<div class="ft-instrument">
		<div class="ft-transport">
			<button
				class="ft-play"
				onclick={toggleTrip}
				disabled={!ready || !!error}
				aria-label={playing ? 'Pause trip' : 'Start trip'}
				><span>{playing ? 'Ⅱ' : '▶'}</span></button
			>
			<div>
				<strong>{playing ? 'Pause trip' : 'Start trip'}</strong><span
					>{playing ? 'Enjoy the journey' : 'A little closer. A little stranger.'}</span
				>
			</div>
		</div>
		<div class="ft-main-dials">
			<InstrumentControl
				label="Trip speed"
				value={design.speed}
				min={0.15}
				max={1.5}
				step={0.05}
				dial
				onstart={remember}
				onvalue={(value) => apply({ ...design, speed: value })}
			/><InstrumentControl
				label={is3d ? 'Surface shading' : 'Relief depth'}
				value={design.relief}
				min={0}
				max={1}
				step={0.01}
				dial
				onstart={startEdit}
				onvalue={(value) => setValue('relief', value)}
			/>
		</div>
		<div class="ft-navigation">
			<button
				class:active={panel === 'shapes'}
				onclick={() => (panel = panel === 'shapes' ? null : 'shapes')}
				aria-expanded={panel === 'shapes'}
				><span class="ft-button-icon" aria-hidden="true">◈</span>Choose shape</button
			><button
				class:active={panel === 'equation'}
				onclick={() => (panel = panel === 'equation' ? null : 'equation')}
				aria-expanded={panel === 'equation'}
				><span class="ft-button-icon" aria-hidden="true">ƒ</span>Equation</button
			><button
				class:active={panel === 'colour'}
				onclick={() => (panel = panel === 'colour' ? null : 'colour')}
				aria-expanded={panel === 'colour'}
				><span class="ft-colour-dot" style={`background:${palette.colors[1]}`}></span>Colour</button
			><button
				class:active={panel === 'saved'}
				onclick={() => (panel = panel === 'saved' ? null : 'saved')}
				aria-expanded={panel === 'saved'}
				><span class="ft-button-icon" aria-hidden="true">⌑</span>Saved views</button
			>
		</div>
	</div>
	<footer class="ft-footer">
		<div class="ft-history">
			<button onclick={undo} disabled={!undoStack.length} aria-label="Undo">↶</button><button
				onclick={redo}
				disabled={!redoStack.length}
				aria-label="Redo">↷</button
			><button onclick={variation}>Try a variation ↗</button>
		</div>
		<div class="ft-render-status">
			<span class="ft-led"></span><span>{stats.quality} · {stats.precision}</span><label
				><span class="ft-sr-only">Render quality</span><select
					aria-label="Render quality"
					value={design.quality}
					onchange={(event) =>
						apply({ ...design, quality: event.currentTarget.value as FractalState['quality'] })}
					><option value="auto">Auto quality</option><option value="saver">Battery saver</option
					><option value="high">High detail</option></select
				></label
			>
		</div>
		<button onclick={saveImage} disabled={!ready || exporting}
			>{exporting ? 'Saving…' : 'Save image ↓'}</button
		>
	</footer>
	{#if shareLink}<div class="ft-share-link">
			<label for="ft-share">Your view link</label><input
				id="ft-share"
				readonly
				value={shareLink}
				onclick={(event) => event.currentTarget.select()}
			/><button onclick={() => (shareLink = '')} aria-label="Close view link">×</button>
		</div>{/if}
	<div class="ft-notice" class:shown={!!status} role="status" aria-live="polite">{status}</div>
</div>
