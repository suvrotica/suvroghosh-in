<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteURL } from 'svelte/reactivity';
	import InstrumentControl from './InstrumentControl.svelte';
	import {
		DEFAULT_STATE,
		FAMILIES,
		PALETTES,
		PRESETS,
		SCENES_3D,
		checkCameraClearance,
		defaultForFamily,
		decodeState,
		encodeState,
		lookCamera3D,
		minimumSpan,
		moveCamera3D,
		normalizeState,
		orbitCamera3D,
		panView,
		scenePreset,
		sceneToState,
		varyState,
		zoomAt,
		type CameraMode,
		type FamilyId,
		type FractalState,
		type Scene3DId
	} from '$lib/visualizations/fractal-trip/model';
	import {
		JOURNEY_DURATION_SECONDS,
		createJourney,
		nextTourSceneId,
		sampleJourney,
		type JourneyPlan
	} from '$lib/visualizations/fractal-trip/journeys';
	import type {
		FractalRenderStatus,
		createFractalRenderer
	} from '$lib/visualizations/fractal-trip/renderer';

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
	let tourMode = $state(true);
	let offTour = $state(false);
	let transitioning = $state(false);
	let clean = $state(false);
	let cinemaIdle = $state(false);
	let expanded = $state(false);
	let nativeFullscreen = $state(false);
	let exporting = $state(false);
	let status = $state('');
	let stats = $state<FractalRenderStatus>({
		quality: 'Preparing',
		fps: 0,
		precision: 'Bounded 3D detail'
	});
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
	let journey = $state<JourneyPlan | null>(null);
	let journeyElapsed = $state(0);
	let messageTimer: ReturnType<typeof setTimeout>;
	let wheelTimer: ReturnType<typeof setTimeout>;
	let idleTimer: ReturnType<typeof setTimeout>;
	let transitionTimer: ReturnType<typeof setTimeout>;
	let wheelActive = false;
	let pointers = new SvelteMap<number, { x: number; y: number }>();
	const storageKey = 'suvro-fractal-trip-favourites-v1';

	let family = $derived(FAMILIES.find((item) => item.id === design.family) ?? FAMILIES[0]);
	let is3d = $derived(family.kind === '3d');
	let activeScene = $derived(
		is3d && design.sceneId ? (SCENES_3D.find((item) => item.id === design.sceneId) ?? null) : null
	);
	let currentName = $derived(
		activeScene
			? activeScene.name
			: design.family === 'mandelbrot' && design.power > 2
				? 'Multibrot'
				: design.family === 'tricorn' && design.power > 2
					? 'Multicorn'
					: family.name
	);
	let currentSubtitle = $derived(
		activeScene
			? activeScene.description
			: is3d
				? 'Drag to look or orbit. Use W/S or +/− to move through space.'
				: 'Choose a shape. Change its equation. Follow the detail.'
	);
	let activeDuration = $derived(
		journey?.duration ?? (activeScene ? activeScene.duration : JOURNEY_DURATION_SECONDS)
	);
	let journeyProgress = $derived(
		activeDuration > 0 ? ((journeyElapsed % activeDuration) + activeDuration) % activeDuration : 0
	);
	let clearanceInfo = $derived(is3d ? checkCameraClearance(design) : null);
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

	function formatSeconds(sec: number): string {
		const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
		const m = Math.floor(s / 60);
		const rem = s % 60;
		return `${m}:${String(rem).padStart(2, '0')}`;
	}

	function currentAspect(): number {
		if (!canvas) return 16 / 9;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width || canvas.clientWidth || 960;
		const h = rect.height || canvas.clientHeight || 600;
		return w / Math.max(1, h);
	}

	function wakeControls() {
		cinemaIdle = false;
		clearTimeout(idleTimer);
		if (playing && !panel) {
			idleTimer = setTimeout(() => {
				if (disposed || !playing || panel) return;
				const focusedControl = app?.querySelector(
					'.ft-header :focus, .ft-instrument :focus, .ft-footer :focus, .ft-panel :focus'
				);
				if (!focusedControl) cinemaIdle = true;
			}, 4500);
		}
	}

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
		if (
			is3d &&
			[
				'power',
				'seedRe',
				'seedIm',
				'seedZ',
				'bulbJulia',
				'foldScale',
				'foldLimit',
				'minRadius'
			].includes(key)
		) {
			journey = null;
		}
		apply(next, true);
	}

	function startEdit() {
		pause();
		remember();
	}

	function selectScene3D(id: Scene3DId, keepPlaying = false) {
		const wasPlaying = keepPlaying && playing;
		if (!wasPlaying) pause();
		remember();
		transitioning = true;
		clearTimeout(transitionTimer);
		transitionTimer = setTimeout(() => {
			transitioning = false;
		}, 360);

		const nextState = { ...sceneToState(id), quality: design.quality, speed: design.speed };
		journey = createJourney(nextState, currentAspect());
		journeyElapsed = 0;
		offTour = false;
		apply(nextState, wasPlaying);
		rootIndex = 0;
		if (wasPlaying) {
			playing = true;
			lastTime = 0;
			startClock();
		} else {
			announce(`${scenePreset(id).name} ready. Press Start trip to travel through the scene.`);
		}
	}

	function stepScene(direction: 1 | -1) {
		const nextId = nextTourSceneId(design.sceneId, direction);
		selectScene3D(nextId, playing);
	}

	function selectFamily(id: FamilyId) {
		pause();
		remember();
		const base = defaultForFamily(id);
		const next =
			id === 'mandelbulb' || id === 'mandelbox'
				? { ...base, quality: design.quality, speed: design.speed }
				: { ...base, palette: design.palette, quality: design.quality, speed: design.speed };
		journey = createJourney(next, currentAspect());
		journeyElapsed = 0;
		offTour = false;
		apply(next);
		rootIndex = 0;
		panel = null;
		announce(
			`${FAMILIES.find((item) => item.id === id)?.name} ready. Open Equation to change its rule.`
		);
	}

	function choosePreset(state: FractalState) {
		pause();
		remember();
		const next = { ...state, quality: design.quality };
		journey = createJourney(next, currentAspect());
		journeyElapsed = 0;
		offTour = false;
		apply(next);
		panel = null;
		rootIndex = 0;
	}

	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		pause();
		redoStack = [...redoStack.slice(-29), snapshot()];
		undoStack = undoStack.slice(0, -1);
		journey = createJourney(previous, currentAspect());
		journeyElapsed = previous.journeyTime % journey.duration;
		offTour = false;
		apply(previous);
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		pause();
		undoStack = [...undoStack.slice(-29), snapshot()];
		redoStack = redoStack.slice(0, -1);
		journey = createJourney(next, currentAspect());
		journeyElapsed = next.journeyTime % journey.duration;
		offTour = false;
		apply(next);
	}

	function resetView() {
		pause();
		remember();
		const initial =
			is3d && design.sceneId ? sceneToState(design.sceneId) : defaultForFamily(design.family);
		const broad = !is3d && design.power > 2 && design.family !== 'newton';
		const next = normalizeState({
			...design,
			centerRe: broad ? 0 : initial.centerRe,
			centerIm: broad ? 0 : initial.centerIm,
			span: broad ? 3.5 : initial.span,
			rotation: 0,
			yaw: initial.yaw,
			pitch: initial.pitch,
			roll: initial.roll,
			fov: initial.fov,
			distance: initial.distance,
			cameraPos: [...initial.cameraPos],
			cameraMode: initial.cameraMode,
			journeyTime: 0
		});
		journey = createJourney(next, currentAspect());
		journeyElapsed = 0;
		offTour = false;
		apply(next);
	}

	function returnToTour() {
		pause();
		remember();
		const baseState =
			is3d && design.sceneId ? sceneToState(design.sceneId) : defaultForFamily(design.family);
		const merged = normalizeState({
			...design,
			yaw: baseState.yaw,
			pitch: baseState.pitch,
			roll: baseState.roll,
			fov: baseState.fov,
			distance: baseState.distance,
			cameraPos: [...baseState.cameraPos],
			cameraMode: 'free'
		});
		const activePlan = createJourney(merged, currentAspect());
		journey = activePlan;
		const pose = sampleJourney(activePlan, journeyElapsed, merged);
		offTour = false;
		apply(pose);
		announce('Returned to the guided tour path. Press Start trip to resume.');
	}

	function resetEquation() {
		pause();
		remember();
		const initial =
			is3d && design.sceneId ? sceneToState(design.sceneId) : defaultForFamily(design.family);
		const next = normalizeState({
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
		journey = createJourney(next, currentAspect());
		apply(next);
		rootIndex = 0;
	}

	function variation() {
		pause();
		remember();
		const next = varyState(snapshot());
		journey = createJourney(next, currentAspect());
		journeyElapsed = 0;
		offTour = false;
		apply(next);
		rootIndex = 0;
		announce('A new variation. Undo brings the previous one back.');
	}

	function pause() {
		playing = false;
		morphing = false;
		cinemaIdle = false;
		clearTimeout(idleTimer);
		cancelAnimationFrame(frame);
		frame = 0;
		lastTime = 0;
		if (engine && ready) engine.update(design, false);
	}

	function tick(now: number) {
		frame = 0;
		if (disposed || (!playing && !morphing) || !visible || document.hidden) {
			lastTime = 0;
			return;
		}
		const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
		lastTime = now;
		const delta = dt * design.speed;
		const time = design.journeyTime + delta;
		let next = { ...design, journeyTime: time };

		if (playing && journey) {
			const previousElapsed = journeyElapsed;
			journeyElapsed += delta;
			if (
				is3d &&
				tourMode &&
				design.sceneId &&
				previousElapsed < journey.duration &&
				journeyElapsed >= journey.duration
			) {
				const nextId = nextTourSceneId(design.sceneId, 1);
				selectScene3D(nextId, true);
				return;
			}
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
		if (!journey || journey.family !== design.family || offTour) {
			journey = createJourney(snapshot(), currentAspect());
			if (offTour) {
				journeyElapsed = 0;
				offTour = false;
			}
		}
		playing = true;
		wakeControls();
		startClock();
	}

	function seekJourney(seconds: number) {
		const targetSeconds = Math.max(0, Math.min(activeDuration, seconds));
		if (!journey || journey.family !== design.family) {
			const baseState = is3d && design.sceneId ? sceneToState(design.sceneId) : snapshot();
			journey = createJourney(baseState, currentAspect());
		}
		journeyElapsed = targetSeconds;
		offTour = false;
		const sampled = sampleJourney(journey, journeyElapsed, {
			...design,
			journeyTime: targetSeconds
		});
		apply(sampled, playing);
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

	function setCameraMode(mode: CameraMode) {
		apply({ ...design, cameraMode: mode });
	}

	function stepSpatial(forwardDelta: number, rightDelta = 0, upDelta = 0, save = true) {
		pause();
		if (save) remember();
		offTour = true;
		apply(moveCamera3D(design, forwardDelta, rightDelta, upDelta), true);
	}

	function zoom(factor: number, x = 0.5, y = 0.5, save = true) {
		pause();
		if (save) remember();
		if (is3d) {
			offTour = true;
			if (design.cameraMode === 'orbit') {
				apply(orbitCamera3D(design, 0, 0, factor), true);
			} else {
				const step = factor < 1 ? 0.16 : -0.16;
				apply(moveCamera3D(design, step, 0, 0), true);
			}
		} else {
			apply(zoomAt(design, x, y, factor, currentAspect()), true);
		}
	}

	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		wakeControls();
		pause();
		if (pointers.size === 0) remember();
		canvas.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	}

	function pointerMove(event: PointerEvent) {
		wakeControls();
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
		} else if (is3d) {
			offTour = true;
			const dYaw = -(event.clientX - before.x) * 0.0065;
			const dPitch = (event.clientY - before.y) * 0.0065;
			if (design.cameraMode === 'orbit' || event.shiftKey) {
				apply(orbitCamera3D(design, dYaw, dPitch, 1), true);
			} else {
				apply(lookCamera3D(design, dYaw, dPitch), true);
			}
		} else {
			apply(
				panView(
					design,
					(event.clientX - before.x) / rect.width,
					(event.clientY - before.y) / rect.height,
					rect.width / rect.height
				),
				true
			);
		}
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	}

	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (!pointers.size) engine?.update(design, false);
	}

	function wheel(event: WheelEvent) {
		if (document.activeElement !== canvas && !nativeFullscreen && !expanded) return;
		event.preventDefault();
		wakeControls();
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
			engine?.update(design, false);
		}, 180);
	}

	function key(event: KeyboardEvent) {
		wakeControls();
		if (event.key === 'Escape') {
			closeExpanded();
			clean = false;
			panel = null;
			return;
		}
		if ((event.target as HTMLElement).matches('input, select, textarea, button')) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const lower = event.key.toLowerCase();
		if (
			[
				' ',
				'+',
				'=',
				'-',
				'r',
				'f',
				'w',
				'a',
				's',
				'd',
				'q',
				'e',
				'ArrowUp',
				'ArrowDown',
				'ArrowLeft',
				'ArrowRight'
			].includes(event.key) ||
			['w', 'a', 's', 'd', 'q', 'e', 'r', 'f'].includes(lower)
		) {
			event.preventDefault();
		}
		if (event.key === ' ') toggleTrip();
		else if (['+', '='].includes(event.key)) zoom(0.8);
		else if (event.key === '-') zoom(1.25);
		else if (lower === 'r') resetView();
		else if (lower === 'f') void fullscreen();
		else if (is3d && ['w', 'a', 's', 'd', 'q', 'e'].includes(lower)) {
			const fwd = lower === 'w' ? 0.14 : lower === 's' ? -0.14 : 0;
			const right = lower === 'd' ? 0.12 : lower === 'a' ? -0.12 : 0;
			const up = lower === 'e' ? 0.1 : lower === 'q' ? -0.1 : 0;
			stepSpatial(fwd, right, up);
		} else if (event.key.startsWith('Arrow')) {
			pause();
			remember();
			const dx = event.key === 'ArrowLeft' ? 0.08 : event.key === 'ArrowRight' ? -0.08 : 0;
			const dy = event.key === 'ArrowUp' ? 0.08 : event.key === 'ArrowDown' ? -0.08 : 0;
			if (is3d) {
				offTour = true;
				if (event.shiftKey) {
					apply(lookCamera3D(design, dx, dy));
				} else {
					apply(moveCamera3D(design, dy * 1.6, -dx * 1.4, 0));
				}
			} else {
				apply(panView(design, dx, dy, currentAspect()));
			}
		}
	}

	function closeExpanded() {
		if (typeof app?.hidePopover === 'function' && app.matches(':popover-open')) app.hidePopover();
		app?.removeAttribute('popover');
		expanded = false;
	}

	function expandView() {
		expanded = true;
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
			const ratio = currentAspect();
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
		if (restored) {
			design = restored;
			journeyElapsed = restored.journeyTime;
		}
		journey = createJourney(design, currentAspect());
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
		app.addEventListener('pointermove', wakeControls);
		app.addEventListener('focusin', wakeControls);
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
			clearTimeout(idleTimer);
			clearTimeout(transitionTimer);
			observer.disconnect();
			engine?.destroy();
			motion.removeEventListener('change', motionChange);
			canvas.removeEventListener('wheel', wheel);
			app.removeEventListener('keydown', key);
			app.removeEventListener('pointermove', wakeControls);
			app.removeEventListener('focusin', wakeControls);
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('fullscreenchange', fullscreenChange);
		};
	});
</script>

<div
	class="ft-app"
	class:ft-expanded={expanded}
	class:ft-clean={clean}
	class:ft-cinema-idle={cinemaIdle}
	bind:this={app}
	id="fractal-trip"
	data-ready={ready}
	data-family={design.family}
	data-scene={design.sceneId ?? ''}
	data-playing={playing}
>
	<header class="ft-header">
		<div class="ft-brand">
			<span class="ft-emblem" aria-hidden="true">◎</span>
			<div>
				<span class="ft-wordmark">FRACTAL<span>TRIP</span></span>
				<p>CINEMATIC 3D &amp; PLANAR FRACTAL EXPLORER</p>
			</div>
		</div>
		<div class="ft-scene-strip" aria-label="Featured 3D scenes">
			<button
				class="ft-scene-step"
				onclick={() => stepScene(-1)}
				aria-label="Previous scene"
				title="Previous 3D scene"
				disabled={!ready}>‹</button
			>
			{#each SCENES_3D as scene (scene.id)}
				<button
					class="ft-scene-chip"
					class:active={is3d && design.sceneId === scene.id}
					onclick={() => selectScene3D(scene.id)}
					disabled={!ready}>{scene.name}</button
				>
			{/each}
			<button
				class="ft-scene-step"
				onclick={() => stepScene(1)}
				aria-label="Next scene"
				title="Next 3D scene"
				disabled={!ready}>›</button
			>
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
				aria-label={`${currentName} fractal. Drag to ${is3d ? (design.cameraMode === 'orbit' ? 'orbit' : 'look around') : 'pan'}, use plus and minus or W and S to move.`}
				onpointerdown={pointerDown}
				onpointermove={pointerMove}
				onpointerup={pointerUp}
				onpointercancel={pointerUp}
			></canvas>
			<div class="ft-transition-veil" class:active={transitioning} aria-hidden="true"></div>
			<div class="ft-screen-top">
				<span
					><i class:running={playing}></i>{playing
						? 'JOURNEY IN PROGRESS'
						: offTour
							? 'FREE EXPLORATION'
							: 'READY TO EXPLORE'}</span
				><span
					>{activeScene
						? activeScene.badge.toUpperCase()
						: is3d
							? 'THREE DIMENSIONS'
							: 'COMPLEX PLANE'}</span
				>
			</div>
			<div class="ft-scene-label">
				<span class="ft-eyebrow"
					>{activeScene
						? `SCENE 0${SCENES_3D.findIndex((s) => s.id === activeScene.id) + 1} / 04 · ${activeScene.badge.toUpperCase()}`
						: `${String(FAMILIES.findIndex((item) => item.id === design.family) + 1).padStart(2, '0')} / ${
								is3d
									? '3D FRACTAL'
									: design.relief > 0
										? '2D FRACTAL · RELIEF SHADING'
										: '2D FRACTAL'
							}`}</span
				>
				<h2>{currentName}<span>.</span></h2>
				<p>{currentSubtitle}</p>
			</div>
			{#if is3d}
				<div class="ft-explore-bar" aria-label="3D exploration mode">
					<button
						class:active={design.cameraMode === 'free'}
						onclick={() => setCameraMode('free')}
						title="Drag to look around from the current 3D position">Free look</button
					><button
						class:active={design.cameraMode === 'orbit'}
						onclick={() => setCameraMode('orbit')}
						title="Drag to orbit around the focus point">Orbit</button
					>
					{#if offTour}
						<button class="ft-return-tour" onclick={returnToTour}>↺ Return to tour</button>
					{/if}
				</div>
			{/if}
			<div class="ft-view-tools">
				{#if is3d}
					<button
						onclick={() => stepSpatial(0, 0, 0.12)}
						aria-label="Move up"
						title="Move up (E)"
						disabled={!ready}>↑</button
					>
					<button
						onclick={() => stepSpatial(0, 0, -0.12)}
						aria-label="Move down"
						title="Move down (Q)"
						disabled={!ready}>↓</button
					>
				{/if}
				<button
					onclick={() => zoom(0.72)}
					aria-label="Zoom in"
					title={is3d ? 'Fly forward (+ / W)' : 'Zoom in (+)'}
					disabled={!ready}>+</button
				><button
					onclick={() => zoom(1.4)}
					aria-label="Zoom out"
					title={is3d ? 'Fly backward (− / S)' : 'Zoom out (−)'}
					disabled={!ready}>−</button
				><button onclick={resetView} aria-label="Reset view" title="Reset view (R)">↺</button>
			</div>
			{#if !ready || error}<div class="ft-fallback">
					<img
						src="/images/visualizations/fractal-trip/poster.png"
						alt="A still view of the Fractal Trip Copper Reef 3D Mandelbulb artwork"
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
							? 'SCENES & SHAPES'
							: panel === 'equation'
								? 'CHANGE THE RULE'
								: panel === 'colour'
									? 'MATERIAL, LIGHT & RENDER'
									: panel === 'saved'
										? 'KEEP A DISCOVERY'
										: 'HOW TO EXPLORE'}</span
					><button onclick={() => (panel = null)} aria-label="Close panel">×</button>
				</div>
				{#if panel === 'shapes'}
					<p class="ft-panel-subtitle">FEATURED 3D WORLDS</p>
					<div class="ft-scene-cards">
						{#each SCENES_3D as scene (scene.id)}
							<button
								class="ft-scene-card"
								class:active={is3d && design.sceneId === scene.id}
								onclick={() => {
									selectScene3D(scene.id);
									panel = null;
								}}
							>
								<div>
									<strong>{scene.name}</strong>
									<small>{scene.badge} · {scene.duration}s tour</small>
									<p>{scene.description}</p>
								</div>
								<span aria-hidden="true">↗</span>
							</button>
						{/each}
					</div>
					<p class="ft-panel-subtitle">ALL SEVEN MATHEMATICAL FAMILIES</p>
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
										>{item.kind === '3d' ? '3D distance field' : '2D complex plane'}</small
									></span
								><span aria-hidden="true">↗</span></button
							>{/each}
					</div>
					<p class="ft-panel-subtitle">FAMILY PRESETS</p>
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
							? 'These controls change the 3D distance-estimated geometry. Surface detail is bounded by ray steps and recurrence depth.'
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
					{#if is3d}
						<InstrumentControl
							label="Field of view"
							value={Math.round(design.fov)}
							min={32}
							max={78}
							step={1}
							onstart={startEdit}
							onvalue={(value) => setValue('fov', value)}
						/>
					{/if}
					<details class="ft-diagnostics">
						<summary>Technical diagnostics</summary>
						<dl>
							<div>
								<dt>Quality tier</dt>
								<dd>{stats.quality}</dd>
							</div>
							<div>
								<dt>Internal buffer</dt>
								<dd>{stats.resolution ?? 'Adaptive'}</dd>
							</div>
							<div>
								<dt>Frame rate</dt>
								<dd>
									{stats.fps
										? `${stats.fps} fps (${stats.frameTimeMs ?? 16.7} ms)`
										: 'Idle / settled'}
								</dd>
							</div>
							<div>
								<dt>Refinement</dt>
								<dd>{stats.refinement ?? stats.precision}</dd>
							</div>
							{#if is3d}
								<div>
									<dt>Ray / iter budget</dt>
									<dd>{stats.steps ?? 96} steps · {stats.iterations ?? 15} iters</dd>
								</div>
								<div>
									<dt>Camera position</dt>
									<dd>
										[{design.cameraPos[0].toFixed(2)}, {design.cameraPos[1].toFixed(2)}, {design.cameraPos[2].toFixed(
											2
										)}]
									</dd>
								</div>
								<div>
									<dt>Surface clearance</dt>
									<dd>{clearanceInfo ? clearanceInfo.minDistance.toFixed(4) : '—'}</dd>
								</div>
							{/if}
						</dl>
					</details>
					<p class="ft-panel-note">
						Colours and surface lighting are artistic choices. Paused 3D views progressively
						accumulate sub-pixel samples and stop drawing once converged.
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
						Travel through four composed 3D fractal scenes, or pause anywhere to explore on your
						own.
					</p>
					<dl class="ft-help">
						<dt>Take the 3D tour</dt>
						<dd>
							Press Start trip to fly along a validated 3D spline path through Copper Reef, Folded
							Cathedral, Alien Garden and Fractal Canyon. Use the progress bar to scrub to any
							moment.
						</dd>
						<dt>Explore freely</dt>
						<dd>
							Drag on the canvas to look around (or switch to Orbit mode to revolve around a focus).
							When the viewer is focused, use W, A, S, D (or arrow keys) and Q, E to fly through 3D
							space. Click Return to tour at any time to rejoin the guided path.
						</dd>
						<dt>Use the keyboard</dt>
						<dd>
							Focus the view. Space starts or pauses, W/S or +/− move forward and back, A/D strafe,
							Q/E move vertically, R resets the view, F opens fullscreen.
						</dd>
						<dt>Progressive 3D refinement</dt>
						<dd>
							When paused on a 3D scene, the renderer accumulates jittered sub-pixel samples to
							resolve fine ridges, ambient occlusion and soft shadows, then stops drawing once
							converged.
						</dd>
						<dt>Keep something</dt>
						<dd>
							Saved views stay on this device. A view link opens the same camera pose and equation,
							paused. PNG saves a high-detail render without controls.
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
			<div class="ft-transport-meta">
				<div class="ft-transport-headline">
					<strong>{playing ? 'Pause trip' : 'Start trip'}</strong>
					<span class="ft-journey-clock"
						>{formatSeconds(journeyProgress)} / {formatSeconds(activeDuration)}</span
					>
				</div>
				<input
					class="ft-range ft-scrub"
					type="range"
					aria-label="Journey progress"
					min="0"
					max={activeDuration}
					step="0.25"
					value={journeyProgress}
					disabled={!ready}
					oninput={(event) => seekJourney(Number(event.currentTarget.value))}
				/>
				<div class="ft-transport-sub">
					<span>{playing ? 'Traveling through the fractal' : 'Scrub timeline or press Start'}</span>
					{#if is3d}
						<label class="ft-tour-toggle">
							<input
								type="checkbox"
								aria-label="Continuous tour"
								checked={tourMode}
								onchange={(event) => (tourMode = event.currentTarget.checked)}
							/>
							Continuous tour
						</label>
					{/if}
				</div>
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
					><option value="balanced">Balanced</option><option value="high">High detail</option
					></select
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
