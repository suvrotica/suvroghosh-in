<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		PRESETS,
		DEMO,
		MIDI_MIN,
		MIDI_MAX,
		decide,
		noteName,
		type Mode,
		type Decision
	} from '$lib/visualizations/probabilistic-piano/model';
	import { VoiceLedger } from '$lib/visualizations/probabilistic-piano/voices';
	import { PIANO_KEYS } from '$lib/visualizations/probabilistic-piano/keyboard';
	import { resolveMotion } from '$lib/motion/preferences';
	import { PianoAudio } from '$lib/visualizations/probabilistic-piano/audio';
	import './piano.css';

	let root: HTMLElement;
	let canvas: HTMLCanvasElement;
	let effectsCanvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let keyboardWindow: HTMLDivElement;
	let keyboardElement: HTMLDivElement;
	let view = $state<'fit' | 'playing'>('playing');
	let viewChosen = false;
	let focusView = $state(false);
	let keyboardBase = $state(60);
	let focusedPitch = $state(60);
	let activePointers = $state<number[]>([]);
	let onScreen = $state(true);
	let pageVisible = $state(true);
	let geometry = $state({
		width: 1,
		height: 1,
		left: 0,
		top: 0,
		content: 1,
		viewport: 1,
		scroll: 0
	});
	const overviewPosition = $derived(
		Math.max(0, Math.min(100, ((geometry.scroll + geometry.viewport / 2) / geometry.content) * 100))
	);
	const overviewWidth = $derived(Math.min(100, (geometry.viewport / geometry.content) * 100));
	let mounted = $state(false);
	let presetIndex = $state(0);
	let chordIndex = $state(0);
	let mode = $state<Mode>('nearest');
	let temperature = $state(0.7);
	let seed = $state(1907);
	let volume = $state(0.45);
	let muted = $state(false);
	let sustain = $state(false);
	let sound = $state(false);
	let starting = $state(false);
	let frozen = $state(false);
	let still = $state(true);
	let quality = $state<'painted' | 'simple'>('painted');
	let canvasFailed = $state(false);
	let error = $state('');
	let status = $state('Sound is off. You can still play the painting.');
	let latest = $state<Decision | null>(null);
	let inspected = $state<Decision | null>(null);
	let history = $state<Decision[]>([]);
	let held = $state<
		{ id: string; input: number; output: number; voiceId: string; effectId: string }[]
	>([]);
	let sustained = $state<{ pitch: number; effectId: string; voiceId: string }[]>([]);
	let progressing = $state(false);
	let accompaniment = $state(false);
	let replaying = $state(false);
	let guide = $state(0);
	let scheduleMs = $state(0);
	const preset = $derived(PRESETS[presetIndex]);
	const chord = $derived(preset.chords[chordIndex]);
	const shown = $derived(frozen ? inspected : latest);
	const ledger = new VoiceLedger();
	let audio: PianoAudio | undefined;
	let disposed = false;
	let startupToken = 0;
	let eventIndex = 0;
	let recent: number[] = [];
	let painter: typeof import('$lib/visualizations/probabilistic-piano/painting') | undefined;
	let effects: import('$lib/visualizations/probabilistic-piano/effects').PondEffects | undefined;
	let effectSerial = 0;
	let transportTimer: ReturnType<typeof setInterval> | undefined;
	let replayTimer: ReturnType<typeof setInterval> | undefined;
	let nextChordAt = 0;
	let demoTimers: ReturnType<typeof setTimeout>[] = [];
	const nativeTimers = new SvelteMap<ReturnType<typeof setTimeout>, string>();
	let buttonSerial = 0;
	const shortcuts = [
		'a',
		'w',
		's',
		'e',
		'd',
		'f',
		't',
		'g',
		'y',
		'h',
		'u',
		'j',
		'k',
		'o',
		'l',
		'p',
		';',
		"'"
	];
	const shortcutPitches = $derived(
		shortcuts.map((_, index) => keyboardBase + index).filter((pitch) => pitch <= MIDI_MAX)
	);
	const shortcutFor = (pitch: number) => shortcuts[shortcutPitches.indexOf(pitch)] ?? '';
	const keyX = (pitch: number) =>
		((PIANO_KEYS.find((item) => item.pitch === pitch)?.centre ?? 0) / 100) * geometry.content -
		geometry.scroll;
	const effectPosition = (pitch: number) => (geometry.left + keyX(pitch)) / geometry.width;
	const navigationBusy = $derived(activePointers.length > 0);

	function measure() {
		if (!stage || !keyboardElement || !keyboardWindow) return;
		const initialView = keyboardWindow.clientWidth >= 1080 ? 'fit' : 'playing';
		if (
			(view === 'fit' && initialView === 'playing') ||
			(!viewChosen && !navigationBusy && view !== initialView)
		) {
			view = initialView;
			void tick().then(() => {
				if (!disposed) {
					centreOn(focusedPitch);
					measure();
				}
			});
			return;
		}
		const bounds = stage.getBoundingClientRect();
		const keys = keyboardWindow.getBoundingClientRect();
		geometry = {
			width: bounds.width,
			height: bounds.height,
			left: keys.left - bounds.left,
			top: keys.top - bounds.top,
			content: keyboardElement.clientWidth,
			viewport: keyboardWindow.clientWidth,
			scroll: keyboardWindow.scrollLeft
		};
		effects?.configure({ position: effectPosition, baseline: geometry.top / geometry.height });
	}
	function centreOn(pitch: number) {
		if (!keyboardWindow || navigationBusy) return;
		const centre = PIANO_KEYS.find((key) => key.pitch === pitch)?.centre ?? 50;
		keyboardWindow.scrollLeft =
			(centre / 100) * keyboardElement.clientWidth - keyboardWindow.clientWidth / 2;
		measure();
	}
	async function changeView(next: 'fit' | 'playing', pitch = focusedPitch) {
		if (navigationBusy) return;
		viewChosen = true;
		view = next === 'fit' && keyboardWindow.clientWidth < 1080 ? 'playing' : next;
		await tick();
		centreOn(pitch);
	}
	function navigateOctave(direction: number) {
		if (navigationBusy) return;
		viewChosen = true;
		if (view === 'fit') {
			void changeView(
				'playing',
				Math.max(MIDI_MIN, Math.min(MIDI_MAX, focusedPitch + direction * 12))
			);
			return;
		}
		keyboardWindow.scrollBy({ left: (geometry.content / 52) * 7 * direction, behavior: 'instant' });
		measure();
	}
	async function navigateOverview(value: number) {
		if (navigationBusy) return;
		viewChosen = true;
		view = 'playing';
		await tick();
		keyboardWindow.scrollLeft =
			(value / 100) * keyboardElement.clientWidth - keyboardWindow.clientWidth / 2;
		measure();
	}
	function shiftShortcuts(direction: number) {
		viewChosen = true;
		keyboardBase = Math.max(MIDI_MIN, Math.min(96, keyboardBase + direction * 12));
		if (!navigationBusy) centreOn(Math.min(MIDI_MAX, keyboardBase + 6));
	}
	async function toggleFocus() {
		if (navigationBusy) return;
		focusView = !focusView;
		await tick();
		measure();
		root.scrollIntoView({ block: 'start', behavior: 'instant' });
	}
	function pedalChanged() {
		audio?.setSustain(sustain);
		if (!sustain) {
			for (const note of sustained) effects?.noteOff(note.effectId);
			sustained = [];
		}
	}

	function repaint() {
		if (!painter || !canvas || quality === 'simple' || canvasFailed) return;
		try {
			painter.paintPond(canvas, { palette: preset.colours, seed: seed >>> 0 });
		} catch {
			canvasFailed = true;
		}
	}
	$effect(() => {
		if (mounted) repaint();
	});
	$effect(() => {
		if (mounted)
			effects?.configure({
				still,
				visible: onScreen && pageVisible && quality === 'painted' && !canvasFailed,
				palette: preset.colours
			});
	});

	function release(id: string) {
		const note = held.find((item) => item.id === id);
		const voice = ledger.release(id);
		if (voice?.voiceId) audio?.noteOff(voice.voiceId);
		if (note) {
			if (sustain) {
				if (sustained.length >= 24) effects?.noteOff(sustained[0].effectId);
				sustained = [
					...sustained,
					{ pitch: note.output, effectId: note.effectId, voiceId: note.voiceId }
				].slice(-24);
			} else effects?.noteOff(note.effectId);
		}
		held = held.filter((item) => item.id !== id);
	}
	function press(
		id: string,
		pitch: number,
		velocity = 0.65,
		prepared?: Decision,
		scheduledVoice?: string
	) {
		if (disposed || ledger.get(id)) return;
		const began = performance.now();
		try {
			const decision =
				prepared ??
				decide({
					pitch,
					chord,
					mode,
					temperature,
					seed: Number(seed),
					eventIndex: eventIndex++,
					lastPitch: recent.at(-1),
					recent,
					active: held.map((v) => v.output)
				});
			const voiceId = scheduledVoice ?? audio?.noteOn(decision.output, velocity) ?? '';
			if (sound && audio) {
				for (const note of sustained)
					if (note.voiceId && !audio.hasVoice(note.voiceId)) effects?.noteOff(note.effectId);
				sustained = sustained.filter((note) => !note.voiceId || audio?.hasVoice(note.voiceId));
			}
			ledger.bind(id, voiceId, decision.output);
			const remaining = sound ? held.filter((v) => !v.voiceId || audio?.hasVoice(v.voiceId)) : held;
			for (const note of held) if (!remaining.includes(note)) effects?.noteOff(note.effectId);
			const effectId = `note-${++effectSerial}`;
			effects?.noteOn(effectId, decision.output, velocity);
			held = [...remaining, { id, input: pitch, output: decision.output, voiceId, effectId }];
			latest = decision;
			if (!frozen) inspected = decision;
			history = [decision, ...history].slice(0, 16);
			recent = [...recent, decision.output].slice(-8);
			scheduleMs = performance.now() - began;
			error = '';
			status = sound
				? 'Sound enabled. A synthesised piano, gently played.'
				: 'Sound is off. You can still play the painting.';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to choose this note.';
		}
	}
	function cancelDemo() {
		if (replayTimer) clearInterval(replayTimer);
		replayTimer = undefined;
		for (const timer of demoTimers) clearTimeout(timer);
		demoTimers = [];
		replaying = false;
	}
	function stopAll(message = 'All notes released.') {
		cancelDemo();
		for (const timer of nativeTimers.keys()) clearTimeout(timer);
		nativeTimers.clear();
		if (transportTimer) clearInterval(transportTimer);
		transportTimer = undefined;
		progressing = false;
		ledger.clear();
		activePointers = [];
		held = [];
		sustained = [];
		effects?.releaseAll();
		sustain = false;
		audio?.setSustain(false);
		audio?.stopAll();
		startupToken++;
		starting = false;
		status = message;
	}
	async function enableSound() {
		if (starting) return;
		const pedal = sustain;
		stopAll('Opening sound; the phrase starts fresh.');
		sustain = pedal;
		starting = true;
		const token = ++startupToken;
		try {
			if (!audio) {
				audio = new PianoAudio();
			}
			await audio.enable();
			if (disposed || token !== startupToken) {
				return;
			}
			audio.setVolume(volume);
			audio.setMuted(muted);
			audio.setSustain(sustain);
			sound = true;
			status = 'Sound enabled. A synthesised piano, gently played.';
		} catch (caught) {
			error =
				caught instanceof Error ? caught.message : 'Sound unavailable. Silent playing still works.';
		} finally {
			if (token === startupToken) starting = false;
		}
	}
	function presetChanged() {
		stopAll('A new light, a new harmony.');
		chordIndex = 0;
		recent = [];
		eventIndex = 0;
		latest = null;
		inspected = null;
		frozen = false;
		history = [];
	}
	function clockNow() {
		return sound && audio ? audio.currentTime : performance.now() / 1000;
	}
	function activateKey(pitch: number) {
		if (nativeTimers.size >= 20) {
			const first = nativeTimers.entries().next().value;
			if (first) {
				clearTimeout(first[0]);
				release(first[1]);
				nativeTimers.delete(first[0]);
			}
		}
		const id = `button-${++buttonSerial}`;
		press(id, pitch);
		const timer = setTimeout(() => {
			release(id);
			nativeTimers.delete(timer);
		}, 280);
		nativeTimers.set(timer, id);
	}
	function playBacking(at: number, target = chord) {
		if (!accompaniment || !sound || !audio) return;
		for (const pitch of target.voicing) audio.scheduleNote(pitch, 0.25, at, 1.4);
	}
	function toggleTransport() {
		if (progressing) {
			stopAll('Progression stopped on the selected chord.');
			return;
		}
		progressing = true;
		nextChordAt = clockNow() + 3;
		playBacking(clockNow() + 0.03);
		transportTimer = setInterval(() => {
			const now = clockNow();
			if (now > nextChordAt + 0.2) {
				nextChordAt = now + 3;
				return;
			}
			if (now < nextChordAt - 0.08) return;
			const next = (chordIndex + 1) % preset.chords.length;
			playBacking(nextChordAt, preset.chords[next]);
			const delay = Math.max(0, (nextChordAt - now) * 1000);
			demoTimers.push(
				setTimeout(() => {
					chordIndex = next;
					demoTimers = [];
				}, delay)
			);
			nextChordAt += 3;
		}, 25);
	}
	function replay() {
		stopAll('Playing the same original phrase through this mode.');
		recent = [];
		eventIndex = 0;
		replaying = true;
		try {
			let replayRecent: number[] = [];
			const score = DEMO.map((note, index) => {
				const decision = decide({
					pitch: note.pitch,
					chord,
					mode,
					temperature,
					seed: Number(seed),
					eventIndex: index,
					lastPitch: replayRecent.at(-1),
					recent: replayRecent
				});
				replayRecent = [...replayRecent, decision.output].slice(-8);
				return { ...note, decision };
			});
			const epoch = clockNow() + 0.1;
			let cursor = 0;
			const tickReplay = () => {
				const now = clockNow();
				while (cursor < score.length && epoch + score[cursor].at <= now + 0.08) {
					const index = cursor++;
					const note = score[index];
					const at = epoch + note.at;
					if (at < now - 0.2) continue;
					const voice =
						sound && audio?.ready
							? audio.scheduleNote(note.decision.output, note.velocity, at, note.duration)
							: '';
					demoTimers.push(
						setTimeout(
							() => press(`demo-${index}`, note.pitch, note.velocity, note.decision, voice),
							Math.max(0, (at - now) * 1000)
						)
					);
					demoTimers.push(
						setTimeout(
							() => release(`demo-${index}`),
							Math.max(0, (at + note.duration - now) * 1000)
						)
					);
				}
				const last = score.at(-1);
				if (last && now > epoch + last.at + last.duration + 0.1) {
					if (replayTimer) clearInterval(replayTimer);
					replayTimer = undefined;
					replaying = false;
					demoTimers = [];
					status = 'Phrase complete. Switch mode and replay to compare.';
				}
			};
			replayTimer = setInterval(tickReplay, 25);
			tickReplay();
		} catch (caught) {
			cancelDemo();
			error = caught instanceof Error ? caught.message : 'Replay unavailable.';
		}
	}
	function pointerPitch(event: PointerEvent): number | undefined {
		const element = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-piano-key]');
		return element && root.contains(element) ? Number(element.dataset.pianoKey) : undefined;
	}
	function pointerDown(event: PointerEvent, pitch: number) {
		if (event.button !== 0) return;
		event.preventDefault();
		viewChosen = true;
		activePointers = [...activePointers.filter((id) => id !== event.pointerId), event.pointerId];
		(event.currentTarget as HTMLElement).focus({ preventScroll: true });
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		press(
			`pointer-${event.pointerId}`,
			pitch,
			event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.65
		);
	}
	function pointerEnd(event: PointerEvent) {
		release(`pointer-${event.pointerId}`);
		activePointers = activePointers.filter((id) => id !== event.pointerId);
	}
	function focusKey(pitch: number) {
		focusedPitch = Math.max(MIDI_MIN, Math.min(MIDI_MAX, pitch));
		const button = keyboardElement.querySelector<HTMLButtonElement>(
			`[data-piano-key="${focusedPitch}"]`
		);
		button?.focus({ preventScroll: true });
		if (!navigationBusy && button) {
			const bounds = button.getBoundingClientRect();
			const windowBounds = keyboardWindow.getBoundingClientRect();
			if (bounds.left < windowBounds.left || bounds.right > windowBounds.right)
				centreOn(focusedPitch);
		}
	}
	function pointerMove(event: PointerEvent) {
		const id = `pointer-${event.pointerId}`;
		if (!activePointers.includes(event.pointerId)) return;
		const pitch = pointerPitch(event);
		const old = held.find((item) => item.id === id);
		if (old?.input === pitch) return;
		release(id);
		if (pitch !== undefined && event.buttons)
			press(id, pitch, event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.65);
	}
	function keyboardDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key === 'Escape' && focusView) {
			event.preventDefault();
			void toggleFocus();
			return;
		}
		if (
			target.closest('input,select,textarea,summary,[contenteditable="true"]') ||
			event.ctrlKey ||
			event.altKey ||
			event.metaKey ||
			event.repeat
		)
			return;
		if (event.key === '[' || event.key === ']') {
			event.preventDefault();
			shiftShortcuts(event.key === '[' ? -1 : 1);
			return;
		}
		if (target.closest('[data-piano-key]')) {
			const moves: Record<string, number> = {
				ArrowLeft: -1,
				ArrowRight: 1,
				PageUp: 12,
				PageDown: -12
			};
			if (event.key in moves || event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				focusKey(
					event.key === 'Home'
						? MIDI_MIN
						: event.key === 'End'
							? MIDI_MAX
							: focusedPitch + moves[event.key]
				);
				return;
			}
		}
		const position = shortcuts.indexOf(event.key.toLowerCase());
		if (position >= 0 && shortcutPitches[position] !== undefined) {
			event.preventDefault();
			press(`key-${event.code}`, shortcutPitches[position]);
		}
	}
	function keyUp(event: KeyboardEvent) {
		release(`key-${event.code}`);
	}
	function freezeChanged() {
		if (frozen) inspected = latest;
	}
	function inspectExample(step: number) {
		stopAll();
		guide = step;
		presetIndex = 0;
		chordIndex = 0;
		mode = 'nearest';
		seed = 1907;
		recent = [];
		eventIndex = 0;
		const pitch = step === 1 ? 60 : 61;
		press('guide', pitch);
		release('guide');
	}
	onMount(() => {
		mounted = true;
		disposed = false;
		let alive = true;
		Promise.all([
			import('$lib/visualizations/probabilistic-piano/painting'),
			import('$lib/visualizations/probabilistic-piano/effects')
		])
			.then(([module, visual]) => {
				if (alive) {
					painter = module;
					effects = visual.createPondEffects(effectsCanvas, {
						palette: preset.colours,
						position: effectPosition,
						baseline: geometry.top / geometry.height,
						still,
						visible: onScreen && pageVisible && quality === 'painted' && !canvasFailed
					});
					repaint();
				}
			})
			.catch(() => {
				canvasFailed = true;
			});
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, media.matches) === 'still';
			effects?.configure({ still });
		};
		updateMotion();
		media.addEventListener('change', updateMotion);
		const mutations = new MutationObserver(updateMotion);
		mutations.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const resize = new ResizeObserver(() => {
			measure();
			repaint();
			effects?.resize();
		});
		resize.observe(stage);
		resize.observe(keyboardWindow);
		const visibility = () => {
			pageVisible = !document.hidden;
			if (document.hidden) stopAll('Paused while the page is hidden.');
		};
		const blur = () => stopAll('All notes released when focus left the window.');
		const guardWheel = (event: WheelEvent) => {
			if (navigationBusy) event.preventDefault();
		};
		const intersection = new IntersectionObserver(
			([entry]) => {
				onScreen = entry.isIntersecting;
				if (!entry.isIntersecting) stopAll('Paused outside the viewport.');
			},
			{ threshold: 0 }
		);
		intersection.observe(root);
		window.addEventListener('keyup', keyUp);
		root.addEventListener('keydown', keyboardDown);
		keyboardWindow.addEventListener('wheel', guardWheel, { passive: false });
		window.addEventListener('blur', blur);
		document.addEventListener('visibilitychange', visibility);
		view = keyboardWindow.clientWidth >= 1080 ? 'fit' : 'playing';
		void tick().then(() => {
			if (alive) {
				measure();
				centreOn(60);
			}
		});
		return () => {
			alive = false;
			disposed = true;
			stopAll();
			effects?.dispose();
			audio?.dispose();
			resize.disconnect();
			intersection.disconnect();
			mutations.disconnect();
			media.removeEventListener('change', updateMotion);
			window.removeEventListener('keyup', keyUp);
			root.removeEventListener('keydown', keyboardDown);
			keyboardWindow.removeEventListener('wheel', guardWheel);
			window.removeEventListener('blur', blur);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<section
	bind:this={root}
	class="forgiving-piano not-prose"
	class:still
	class:focus-view={focusView}
	data-piano-root
	data-view={view}
	data-focus={focusView}
	data-keyboard-base={keyboardBase}
	data-held={held.length}
	data-sound={sound}
	data-schedule-ms={scheduleMs.toFixed(3)}
	aria-label="The Piano That Forgives interactive instrument"
>
	<header class="piano-heading">
		<div class="piano-edition">
			<span>THE LISTENING GARDEN</span><span>№ 01 / AN INTERACTIVE STUDY</span>
		</div>
		<div class="piano-title-row">
			<h1>The piano<br />that <em>forgives.</em></h1>
			<div class="piano-invitation">
				<span class="piano-flower">✳</span>
				<p>
					<span>A little uncertainty.</span><span>A nearby possibility.</span><em
						>Something like jazz.</em
					>
				</p>
				<span>Touch a key. Let the painting answer.</span>
			</div>
		</div>
	</header>
	<div
		class="piano-world"
		bind:this={stage}
		class:ready={mounted}
		class:simple={quality === 'simple' || canvasFailed}
		data-piano-stage
	>
		{#if !mounted}<img
				class="piano-poster"
				src="/images/visualizations/probabilistic-piano/piano-poster.jpg"
				alt="An impressionist piano floating over a moonlit pond, with a fan of nearby musical possibilities"
				width="1440"
				height="760"
			/>{/if}
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<canvas class="piano-effects" bind:this={effectsCanvas} aria-hidden="true"></canvas>
		{#if shown}
			{#key shown}
				<svg
					class="probability-light"
					style={`left:${geometry.left}px;width:${geometry.viewport}px;height:${geometry.top + 28}px`}
					viewBox={`0 0 ${geometry.viewport} ${geometry.top + 28}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{#each shown.candidates as candidate (candidate.pitch)}
						<path
							class:selected={candidate.pitch === shown.output}
							data-probability={candidate.probability}
							d={`M ${keyX(shown.input)} ${geometry.top + 14} C ${keyX(shown.input)} ${geometry.top - 100}, ${keyX(candidate.pitch)} ${geometry.top - 100}, ${keyX(candidate.pitch)} ${geometry.top + 8}`}
							style={`stroke-width:${1 + candidate.probability * 4};opacity:${0.25 + candidate.probability * 0.65}`}
						/>
						<circle
							cx={keyX(candidate.pitch)}
							cy={geometry.top + 8}
							r={candidate.pitch === shown.output ? 5 : 3}
							class:selected={candidate.pitch === shown.output}
						/>
					{/each}
					<circle class="requested-mark" cx={keyX(shown.input)} cy={geometry.top + 14} r="7" />
				</svg>
			{/key}
		{/if}
		<div class="piano-world-top">
			<span>01 — {preset.name}</span><span>HARMONY <b>{chord.name}</b></span>
			<button
				class="focus-button"
				type="button"
				aria-pressed={focusView}
				disabled={navigationBusy}
				onclick={toggleFocus}
				>{focusView ? 'Exit focus view' : 'Enter focus view'}
				<span aria-hidden="true">⤢</span></button
			>
		</div>
		<div class="piano-whisper">
			{shown
				? `${noteName(shown.input)} → ${noteName(shown.output)}`
				: 'Every note begins as a possibility.'}<span
				>{shown
					? shown.shift === 0
						? 'UNCHANGED · ALREADY AT HOME'
						: `${shown.shift > 0 ? '+' : ''}${shown.shift} SEMITONE${Math.abs(shown.shift) === 1 ? '' : 'S'} · GENTLY GUIDED`
					: 'A POND, A PIANO, A SMALL ACT OF FORGIVENESS'}</span
			>
		</div>
		<div class="possibility-fan" aria-label="Actual note selection probabilities">
			{#if shown}
				{#each shown.candidates as candidate (candidate.pitch)}<div
						class:selected={candidate.pitch === shown.output}
						class="possibility"
					>
						<span class="probability-note"
							>{candidate.pitch === shown.output ? '● ' : '○ '}{noteName(candidate.pitch)}</span
						>
						<div class="probability-track">
							<i style={`width:${candidate.probability * 100}%`}></i>
						</div>
						<span>{(candidate.probability * 100).toFixed(1)}%</span>
					</div>{/each}
			{:else}<div class="piano-waiting">
					<i></i><i></i><i></i><span>The possibilities appear when you play.</span>
				</div>{/if}
		</div>
		<div class="piano-key-caption">
			<span
				>YOU TOUCH <i class="outline-dot"></i>
				<span class="caption-gap">THE PIANO ANSWERS <i class="fill-dot"></i></span></span
			><span>88 KEYS · A0 — C8 · MIDDLE C = C4</span>
		</div>
		<div
			class="keyboard-window"
			bind:this={keyboardWindow}
			role="group"
			aria-label="Playable piano, scroll sideways for more octaves"
			onscroll={measure}
			onfocusout={(event) => {
				if (
					!(event.relatedTarget instanceof Node) ||
					!keyboardWindow.contains(event.relatedTarget)
				) {
					for (const item of held.filter((v) => v.id.startsWith('key-'))) release(item.id);
				}
			}}
		>
			<div
				class="painted-keyboard"
				class:fit={view === 'fit'}
				bind:this={keyboardElement}
				data-piano-keyboard
			>
				{#each PIANO_KEYS as key (key.pitch)}<button
						type="button"
						data-piano-key={key.pitch}
						aria-label={`Play ${noteName(key.pitch)}`}
						tabindex={key.pitch === focusedPitch ? 0 : -1}
						onfocus={() => {
							focusedPitch = key.pitch;
						}}
						class="painted-key"
						class:black={key.black}
						class:requested={held.some((v) => v.input === key.pitch)}
						class:sounded={held.some((v) => v.output === key.pitch) ||
							sustained.some((v) => v.pitch === key.pitch)}
						class:middle-c={key.pitch === 60}
						style={`left:${key.left}%;width:calc(${key.width}% - ${key.black ? 0 : 1}px); --key-paint:${preset.colours[key.pitch % preset.colours.length]}`}
						onpointerdown={(event) => pointerDown(event, key.pitch)}
						onpointermove={pointerMove}
						onpointerup={pointerEnd}
						onpointercancel={pointerEnd}
						onlostpointercapture={pointerEnd}
						onclick={(event) => {
							if (event.detail === 0) {
								activateKey(key.pitch);
							}
						}}
						><span class="key-pitch">{noteName(key.pitch)}</span><kbd>{shortcutFor(key.pitch)}</kbd
						></button
					>{/each}
			</div>
		</div>
		<div class="keyboard-overview">
			<div class="overview-head">
				<span>THE WHOLE PIANO <b>A0 — C8</b></span><span
					>Drag the map to travel · drag the keys to play</span
				>
			</div>
			<div class="overview-track">
				<div class="overview-keys" aria-hidden="true">
					{#each PIANO_KEYS as key (key.pitch)}<i
							class:black={key.black}
							class:lit={held.some((v) => v.output === key.pitch) ||
								sustained.some((v) => v.pitch === key.pitch)}
							style={`left:${key.left}%;width:${key.width}%`}
						></i>{/each}
				</div>
				<div
					class="overview-window"
					style={`left:${Math.max(0, overviewPosition - overviewWidth / 2)}%;width:${overviewWidth}%`}
					aria-hidden="true"
				></div>
				<input
					type="range"
					aria-label="Keyboard overview"
					min="0"
					max="100"
					step="1"
					value={overviewPosition}
					disabled={navigationBusy}
					oninput={(event) => navigateOverview(Number(event.currentTarget.value))}
				/>
			</div>
		</div>
		<div class="keyboard-scroll-tools">
			<button type="button" disabled={navigationBusy} onclick={() => navigateOctave(-1)}
				>← Lower octave</button
			><button
				type="button"
				aria-pressed={view === 'fit'}
				disabled={navigationBusy || geometry.viewport < 1080}
				title={geometry.viewport < 1080
					? 'Use the overview to explore all 88 keys on a narrow screen.'
					: undefined}
				onclick={() => changeView('fit')}>Fit all 88 keys</button
			><button
				type="button"
				aria-pressed={view === 'playing'}
				disabled={navigationBusy}
				onclick={() => changeView('playing')}>Playing view</button
			><button
				type="button"
				disabled={navigationBusy}
				onclick={() => {
					focusedPitch = 60;
					void changeView('playing', 60);
				}}>Return to middle C</button
			><button type="button" disabled={navigationBusy} onclick={() => navigateOctave(1)}
				>Higher octave →</button
			>
		</div>
		<div class="piano-world-bottom">
			<span>A SYNTHESISED PIANO · AN ORIGINAL PAINTING</span><span
				>{still ? 'STILL LIGHT' : 'GENTLE LIGHT'} / LOCAL & PRIVATE</span
			>
		</div>
	</div>
	<div class="piano-controls">
		<button type="button" class="sound-button" disabled={!mounted || starting} onclick={enableSound}
			>{starting ? 'Opening sound…' : sound ? 'Sound enabled ✓' : 'Enable sound'}<span>↗</span
			></button
		>
		<label class="preset-control"
			>THE LIGHT<select
				aria-label="Painting and harmony preset"
				bind:value={presetIndex}
				onchange={presetChanged}
				>{#each PRESETS as item, index (item.id)}<option value={index}>{item.name}</option
					>{/each}</select
			></label
		>
		<fieldset class="mode-control">
			<legend>THE POSSIBILITY</legend>{#each ['nearest', 'wander', 'raw'] as item (item)}<button
					type="button"
					aria-pressed={mode === item}
					onclick={() => {
						stopAll();
						mode = item as Mode;
					}}
					class:chosen={mode === item}>{item[0].toUpperCase() + item.slice(1)}</button
				>{/each}
		</fieldset>
		<label class="volume-control"
			>VOLUME<input
				aria-label="Volume"
				type="range"
				min="0"
				max="0.8"
				step="0.01"
				bind:value={volume}
				oninput={() => audio?.setVolume(volume)}
			/></label
		>
		<button type="button" class="stop-button" onclick={() => stopAll()}
			>■ <span>Stop all sound</span></button
		>
	</div>

	<div class="piano-playing-tools">
		<div class="shortcut-range">
			<span>COMPUTER KEYS</span><button
				type="button"
				aria-label="Lower computer-keyboard octave"
				disabled={keyboardBase <= MIDI_MIN}
				onclick={() => shiftShortcuts(-1)}>[ −</button
			><output>{noteName(keyboardBase)}–{noteName(shortcutPitches.at(-1) ?? keyboardBase)}</output
			><button
				type="button"
				aria-label="Higher computer-keyboard octave"
				disabled={keyboardBase >= 96}
				onclick={() => shiftShortcuts(1)}>+ ]</button
			>
		</div>
		<label class="check pedal-control"
			><input type="checkbox" bind:checked={sustain} onchange={pedalChanged} /> Hold pedal</label
		>

		<label
			>Current chord<select aria-label="Current chord" bind:value={chordIndex}
				>{#each preset.chords as item, index (item.id)}<option value={index}>{item.name}</option
					>{/each}</select
			></label
		>
		<button class="phrase-button" type="button" onclick={replay} disabled={replaying}
			>Replay phrase
			<span aria-hidden="true">↗</span></button
		>
	</div>
	<div class="piano-footnote">
		<p>
			{mode === 'nearest'
				? 'The closest note in this harmony. Equally close? A little probability.'
				: mode === 'wander'
					? 'Nearby alternatives, at most one extra semitone beyond the closest.'
					: 'Your original notes, untouched. Every possibility is yours.'}
		</p>
		<p class="sound-status" role="status">{error || status}</p>
	</div>
	<noscript
		><p class="piano-noscript">
			This is a still view of the instrument. Enable JavaScript to play; the essay and worked
			example below remain readable.
		</p></noscript
	>
	<details class="piano-workbench">
		<summary>Inside the possibility <span>HARMONY · REPLAY · THE EXACT NUMBERS</span></summary>
		<div class="workbench-grid">
			<div class="musical-tools">
				<h2>A few ways to listen</h2>
				<p class="palette-notes">Palette: {chord.tones.map((tone) => tone.label).join(' · ')}</p>
				<div class="tool-buttons">
					<button type="button" aria-pressed={progressing} onclick={toggleTransport}
						>{progressing ? 'Stop progression' : 'Start progression'}</button
					>
				</div>
				<label class="check"
					><input type="checkbox" bind:checked={accompaniment} /> Soft accompaniment (with sound and progression)</label
				><label class="check"
					><input type="checkbox" bind:checked={muted} onchange={() => audio?.setMuted(muted)} /> Mute</label
				><label
					>Temperature <output>{Number(temperature).toFixed(2)}</output><input
						aria-label="Temperature"
						type="range"
						min="0"
						max="2"
						step="0.05"
						bind:value={temperature}
					/></label
				>
				<p>A single candidate stays certain at every temperature.</p>
				<label
					>Musical seed<input
						aria-label="Musical seed"
						type="number"
						min="0"
						max="4294967295"
						step="1"
						bind:value={seed}
					/></label
				><label
					>Painting detail<select aria-label="Painting detail" bind:value={quality}
						><option value="painted">Laid brushstrokes</option><option value="simple"
							>Quiet wash (low cost)</option
						></select
					></label
				>
			</div>
			<div class="decision-inspector">
				<h2>The note, with its workings</h2>
				<label class="check"
					><input type="checkbox" bind:checked={frozen} onchange={freezeChanged} /> Freeze decision</label
				>{#if shown}<dl>
						<div>
							<dt>Requested</dt>
							<dd>{noteName(shown.input)} / MIDI {shown.input}</dd>
						</div>
						<div>
							<dt>Played</dt>
							<dd>{noteName(shown.output)} / MIDI {shown.output}</dd>
						</div>
						<div>
							<dt>Shift</dt>
							<dd>{shown.shift > 0 ? '+' : ''}{shown.shift} semitones</dd>
						</div>
						<div>
							<dt>Context</dt>
							<dd>{shown.chord} · {shown.mode}</dd>
						</div>
					</dl>
					<p data-decision-reason>{shown.reason}</p>
					<table>
						<caption>Actual sampler distribution</caption><thead
							><tr><th>Candidate</th><th>Probability</th><th>Selected</th></tr></thead
						><tbody
							>{#each shown.candidates as candidate (candidate.pitch)}<tr
									><td>{noteName(candidate.pitch)}</td><td
										>{(candidate.probability * 100).toFixed(2)}%</td
									><td>{candidate.pitch === shown.output ? 'Yes ●' : '—'}</td></tr
								>{/each}</tbody
						>
					</table>
					<p>
						Eligible within A0–C8: {shown.eligible.map(noteName).join(', ')}. Eligible pitches
						outside this mode’s distance bound are omitted from the sampler.
					</p>{:else}<p>Play a key to see the complete decision here.</p>{/if}
				<details>
					<summary>Recent notes ({history.length} / 16)</summary>
					<ol>
						{#each history as item, index (index)}<li>
								{noteName(item.input)} → {noteName(item.output)} · {item.chord} · {item.mode}
							</li>{/each}
					</ol>
				</details>
			</div>
		</div>
	</details>
	<div class="piano-guide">
		<span class="guide-kicker">TRY A SMALL EXPERIMENT</span>
		<div class="guide-steps">
			<button type="button" class:active={guide === 1} onclick={() => inspectExample(1)}
				><b>01</b><span>Find a home note<small>C4 stays C4 in the pond.</small></span></button
			><button type="button" class:active={guide === 2} onclick={() => inspectExample(2)}
				><b>02</b><span>Try the space between<small>C♯4 is equally near C4 and D4.</small></span
				></button
			><button
				type="button"
				class:active={guide === 3}
				onclick={() => {
					guide = 3;
					replay();
				}}
				><b>03</b><span
					>Hear another possibility<small>Replay; change mode; replay again.</small></span
				></button
			>
		</div>
		<p>
			Computer keys A W S E D F T G Y H U J K O L P ; ’ play the marked range while the piano has
			focus. Use [ and ] to shift that range; arrow keys move between piano keys, Home/End reach
			A0/C8, and Page Up/Down move an octave. The overview travels across all 88 keys. Your touch
			supplies the rhythm; assistance changes pitch.
		</p>
	</div>
</section>
