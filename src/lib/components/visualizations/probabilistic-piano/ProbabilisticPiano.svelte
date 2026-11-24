<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		DEMO,
		MIDI_MAX,
		MIDI_MIN,
		SYNTH_PALETTES,
		decide,
		noteName,
		type Decision,
		type Mode
	} from '$lib/visualizations/probabilistic-piano/model';
	import { VoiceLedger } from '$lib/visualizations/probabilistic-piano/voices';
	import { PIANO_KEYS } from '$lib/visualizations/probabilistic-piano/keyboard';
	import { resolveMotion } from '$lib/motion/preferences';
	import { SynthAudio } from '$lib/visualizations/probabilistic-piano/audio';
	import {
		FACTORY_PRESETS,
		decodePatchHash,
		encodePatchHash,
		getFactoryPreset,
		loadUserPatches,
		saveUserPatches,
		validateSynthPatch,
		type ArpSeqConfig,
		type ChordMemoryMode,
		type FxConfig,
		type PatchCategory,
		type SeqStep,
		type SynthPatch,
		type VoiceMode
	} from '$lib/visualizations/probabilistic-piano/synth-patch';
	import {
		createSynthScheduler,
		type SchedulerConfig,
		type SchedulerSource,
		type SynthScheduler
	} from '$lib/visualizations/probabilistic-piano/synth-scheduler';
	import {
		createMidiController,
		type MidiController,
		type MidiInputDevice
	} from '$lib/visualizations/probabilistic-piano/midi';
	import {
		createWavRecorder,
		type WavRecorder
	} from '$lib/visualizations/probabilistic-piano/wav-recorder';
	import TelemetryBar from './TelemetryBar.svelte';
	import ControlDeck from './ControlDeck.svelte';
	import ArpSequencerBar from './ArpSequencerBar.svelte';
	import FxRack from './FxRack.svelte';
	import FullPianoKeybed from './FullPianoKeybed.svelte';
	import type { ParamEcho } from './OledScope.svelte';
	import './piano.css';
	import './synth.css';

	type MobileTab = 'OSC/MIX' | 'FILTER/ENV' | 'MOD/FX' | 'ARP/SEQ' | 'INSPECT';
	const MOBILE_TABS: readonly MobileTab[] = [
		'OSC/MIX',
		'FILTER/ENV',
		'MOD/FX',
		'ARP/SEQ',
		'INSPECT'
	];

	function handleMobileTabKeyDown(event: KeyboardEvent, idx: number) {
		let nextIdx: number | null = null;
		if (event.key === 'ArrowRight') nextIdx = (idx + 1) % MOBILE_TABS.length;
		else if (event.key === 'ArrowLeft')
			nextIdx = (idx - 1 + MOBILE_TABS.length) % MOBILE_TABS.length;
		else if (event.key === 'Home') nextIdx = 0;
		else if (event.key === 'End') nextIdx = MOBILE_TABS.length - 1;
		if (nextIdx === null) return;
		event.preventDefault();
		event.stopPropagation();
		activeMobileTab = MOBILE_TABS[nextIdx];
		void tick().then(() => {
			root?.querySelector<HTMLButtonElement>(`#mobile-tab-${nextIdx}`)?.focus();
		});
	}

	const CHORD_INTERVALS: Readonly<Record<Exclude<ChordMemoryMode, 'latch'>, readonly number[]>> = {
		off: [0],
		oct: [0, 12],
		'5th': [0, 7],
		maj7: [0, 4, 7, 11],
		min7: [0, 3, 7, 10],
		sus4: [0, 5, 7],
		'9th': [0, 4, 7, 11, 14]
	};

	const CATEGORY_DEFAULTS: Readonly<Record<'Poly' | 'Lead' | 'Bass' | 'Pad', string>> = {
		Poly: '03-warm-analog-poly',
		Lead: '06-midnight-mono-lead',
		Bass: '08-sub-octave-bass',
		Pad: '10-monsoon-haze-pad'
	};

	let root: HTMLElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let effectsCanvas: HTMLCanvasElement | undefined = $state();
	let stage: HTMLDivElement | undefined = $state();
	let keybedRow: HTMLDivElement | undefined = $state();
	let keyboardWindow: HTMLDivElement | undefined = $state();
	let keyboardElement: HTMLDivElement | undefined = $state();

	let view = $state<'fit' | 'playing'>('playing');
	let viewChosen = false;
	let focusView = $state(false);
	let keyboardBase = $state(60);
	let focusedPitch = $state(60);
	let activePointers = $state<number[]>([]);
	let onScreen = $state(true);
	let pageVisible = $state(true);
	let isNarrowViewport = $state(false);
	let activeMobileTab = $state<MobileTab>('OSC/MIX');

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
	let visualMode = $state<'pond' | 'oled'>('pond');
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

	// Synthesizer state
	let patch = $state<SynthPatch>(getFactoryPreset(0));
	let basePreset = $state<SynthPatch>(getFactoryPreset(0));
	let userPatches = $state<SynthPatch[]>([]);
	let patchNameDraft = $state(FACTORY_PRESETS[0].name);
	let auditionCategory = $state<PatchCategory | null>(null);
	let paramEcho = $state<ParamEcho | null>(null);
	let pitchBend = $state(0);
	let modWheel = $state(0);
	let dynamicVelocity = $state(true);
	let lastVelocity = $state(0.65);
	let qwertyVelocity = $state<0.35 | 0.65 | 0.92>(0.65);
	let latchedChordIntervals = $state<number[]>([0, 4, 7, 11]);
	let arpRunning = $state(false);
	let displayStep = $state(-1);
	let selectedSeqStep = $state(0);
	let stepRec = $state(false);

	// MIDI & WAV state
	let midiSupported = $state(false);
	let midiConnected = $state(false);
	let midiInputs = $state<readonly MidiInputDevice[]>([]);
	let midiSelectedId = $state<string | null>(null);
	let wavRecording = $state(false);
	let exportingWav = $state(false);
	let wavDownloadUrl = $state<string | null>(null);
	let wavDownloadName = $state('synth-take.wav');

	const preset = $derived(SYNTH_PALETTES[presetIndex] ?? SYNTH_PALETTES[0]);
	const chord = $derived(preset.chords[chordIndex] ?? preset.chords[0]);
	const shown = $derived(frozen ? inspected : latest);
	const ledger = new VoiceLedger();

	let audio = $state.raw<SynthAudio | undefined>(undefined);
	let activeVoicesCount = $state(0);
	let scheduler: SynthScheduler | undefined;
	let midi: MidiController | undefined;
	let wavRecorder: WavRecorder | undefined;
	let painter: typeof import('$lib/visualizations/probabilistic-piano/painting') | undefined;
	let effects: import('$lib/visualizations/probabilistic-piano/effects').PondEffects | undefined;

	let disposed = false;
	let startupToken = 0;
	let eventIndex = 0;
	let recent: number[] = [];
	let effectSerial = 0;
	let echoSerial = 0;
	let echoTimer: ReturnType<typeof setTimeout> | undefined;
	let auditionTimer: ReturnType<typeof setTimeout> | undefined;
	const demoTimers = new SvelteSet<ReturnType<typeof setTimeout>>();
	const nativeTimers = new SvelteMap<ReturnType<typeof setTimeout>, string>();
	let buttonSerial = 0;
	let replayScore: {
		pitch: number;
		velocity: number;
		at: number;
		duration: number;
		decision: Decision;
	}[] = [];
	const scheduledPhraseVoices = new SvelteMap<string, string>();

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
	const keyX = (pitch: number) =>
		((PIANO_KEYS.find((item) => item.pitch === pitch)?.centre ?? 0) / 100) * geometry.content -
		geometry.scroll;
	const effectPosition = (pitch: number) => (geometry.left + keyX(pitch)) / geometry.width;
	const navigationBusy = $derived(activePointers.length > 0);

	function syncActiveVoicesCount() {
		activeVoicesCount = sound ? (audio?.activeCount ?? held.length) : held.length;
	}

	function syncSeed() {
		const parsed = Number(seed);
		scheduler?.setConfig({ seed: (Number.isFinite(parsed) ? parsed : 0) >>> 0 });
	}

	function showEcho(label: string, valueText: string) {
		const serial = ++echoSerial;
		paramEcho = { label, valueText, serial };
		if (echoTimer) clearTimeout(echoTimer);
		echoTimer = setTimeout(() => {
			if (!disposed && paramEcho?.serial === serial) {
				paramEcho = null;
			}
		}, 4000);
	}

	function schedulerConfigFromPatch(
		target: SynthPatch,
		engineActive = arpRunning
	): Partial<SchedulerConfig> {
		return {
			playMode: engineActive ? target.arpSeq.engine : 'off',
			bpm: target.arpSeq.bpm,
			division: target.arpSeq.division,
			gate: target.arpSeq.gate,
			swing: target.arpSeq.swing,
			arpMode: target.arpSeq.arpMode,
			arpOctaves: target.arpSeq.octaves,
			hold: target.arpSeq.hold,
			seed: Number(seed) >>> 0,
			stepRec,
			steps: target.arpSeq.steps
		};
	}

	function applyPatch(next: SynthPatch, echo?: { label: string; valueText: string }) {
		const validated = validateSynthPatch(next);
		patch = validated;
		patchNameDraft = validated.name;
		audio?.setPatch(validated);
		scheduler?.setConfig(schedulerConfigFromPatch(validated));
		if (wavRecording) wavRecorder?.recordEvent({ type: 'patch', patch: validated });
		if (echo) showEcho(echo.label, echo.valueText);
	}

	function selectPresetById(id: string) {
		const factory = FACTORY_PRESETS.find((p) => p.id === id);
		if (factory) {
			const clone = getFactoryPreset(factory.id);
			basePreset = getFactoryPreset(factory.id);
			auditionCategory = null;
			try {
				sessionStorage.setItem('suvro-synth-last-id', clone.id);
			} catch {
				// Ignore storage access errors
			}
			if (clone.arpSeq.engine === 'off') {
				arpRunning = false;
				if (!progressing && !replaying) scheduler?.stop();
			}
			applyPatch(clone, { label: 'Patch', valueText: clone.name });
			return;
		}
		const user = userPatches.find((p) => p.id === id);
		if (user) {
			const clone = validateSynthPatch(user);
			basePreset = validateSynthPatch(user);
			auditionCategory = null;
			try {
				sessionStorage.setItem('suvro-synth-last-id', clone.id);
			} catch {
				// Ignore storage access errors
			}
			if (clone.arpSeq.engine === 'off') {
				arpRunning = false;
				if (!progressing && !replaying) scheduler?.stop();
			}
			applyPatch(clone, { label: 'Patch', valueText: clone.name });
		}
	}

	function stepPatch(dir: -1 | 1) {
		const all = [...FACTORY_PRESETS, ...userPatches];
		if (all.length === 0) return;
		const idx = all.findIndex((p) => p.id === patch.id);
		const nextIdx = idx < 0 ? 0 : (idx + dir + all.length) % all.length;
		selectPresetById(all[nextIdx].id);
	}

	function handleSavePatch() {
		const trimmedDraft = patchNameDraft.trim().slice(0, 48);
		if (!trimmedDraft) {
			patchNameDraft = patch.name;
			status = 'Enter a non-empty patch name to save.';
			return;
		}
		const cleanName = trimmedDraft;
		const baseSlug =
			cleanName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'custom';
		const activeUserPatch = userPatches.find((p) => p.id === patch.id);
		const isSameUserPatch = Boolean(
			activeUserPatch && activeUserPatch.name.toLowerCase() === cleanName.toLowerCase()
		);
		let nextId: string;
		if (isSameUserPatch && activeUserPatch) {
			nextId = activeUserPatch.id;
		} else {
			const existingIds = new Set([
				...FACTORY_PRESETS.map((p) => p.id),
				...userPatches.map((p) => p.id)
			]);
			let candidate = `user-${baseSlug}`;
			let suffix = 2;
			while (existingIds.has(candidate)) {
				candidate = `user-${baseSlug}-${suffix++}`;
			}
			nextId = candidate;
		}
		const saved = validateSynthPatch({
			...patch,
			id: nextId,
			name: cleanName
		});
		const nextList = [saved, ...userPatches.filter((p) => p.id !== saved.id)].slice(0, 32);
		userPatches = nextList;
		saveUserPatches(nextList);
		try {
			sessionStorage.setItem('suvro-synth-last-id', saved.id);
		} catch {
			// Ignore storage access errors
		}
		basePreset = validateSynthPatch(saved);
		applyPatch(saved, { label: 'Saved', valueText: saved.name });
		status = `Saved patch "${saved.name}" locally.`;
	}

	function handleSharePatch() {
		try {
			const encoded = encodePatchHash(patch);
			window.location.hash = encoded;
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				void navigator.clipboard.writeText(window.location.href).catch(() => {});
			}
			showEcho('Share', 'URL hash updated');
			status = `Patch encoded in URL hash (${encoded.length} chars).`;
		} catch (caught) {
			status = caught instanceof Error ? caught.message : 'Unable to encode patch hash.';
		}
	}

	function handleAuditionCategory(category: 'Poly' | 'Lead' | 'Bass' | 'Pad') {
		const targetId = CATEGORY_DEFAULTS[category];
		selectPresetById(targetId);
		auditionCategory = category;
		if (auditionTimer) clearTimeout(auditionTimer);
		if (sound && audio?.ready) {
			const auditionPitch = category === 'Bass' ? 36 : 60;
			const voiceId = audio.noteOn(auditionPitch, 0.72);
			if (voiceId) {
				syncActiveVoicesCount();
				auditionTimer = setTimeout(() => {
					if (!disposed) {
						audio?.noteOff(voiceId);
						syncActiveVoicesCount();
					}
				}, 240);
			}
		}
	}

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
		if (!keyboardWindow || !keyboardElement || navigationBusy) return;
		const centre = PIANO_KEYS.find((key) => key.pitch === pitch)?.centre ?? 50;
		keyboardWindow.scrollLeft =
			(centre / 100) * keyboardElement.clientWidth - keyboardWindow.clientWidth / 2;
		measure();
	}

	async function changeView(next: 'fit' | 'playing', pitch = focusedPitch) {
		if (navigationBusy || !keyboardWindow) return;
		viewChosen = true;
		view = next === 'fit' && keyboardWindow.clientWidth < 1080 ? 'playing' : next;
		await tick();
		centreOn(pitch);
	}

	function navigateOctave(direction: number) {
		if (navigationBusy || !keyboardWindow) return;
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
		if (navigationBusy || !keyboardWindow || !keyboardElement) return;
		viewChosen = true;
		view = 'playing';
		await tick();
		keyboardWindow.scrollLeft =
			(value / 100) * keyboardElement.clientWidth - keyboardWindow.clientWidth / 2;
		measure();
	}

	function shiftShortcuts(direction: number) {
		viewChosen = true;
		keyboardBase = Math.max(24, Math.min(96, keyboardBase + direction * 12));
		if (!navigationBusy) centreOn(Math.min(MIDI_MAX, keyboardBase + 6));
	}

	async function toggleFocus() {
		if (navigationBusy) return;
		focusView = !focusView;
		await tick();
		measure();
		root?.scrollIntoView({ block: 'start', behavior: 'instant' });
	}

	function pedalChanged() {
		audio?.setSustain(sustain);
		if (wavRecording) wavRecorder?.recordEvent({ type: 'sustain', value: sustain });
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
		if (!mounted || !sound || activeVoicesCount === 0) return;
		const timer = setInterval(() => {
			if (!disposed) syncActiveVoicesCount();
		}, 100);
		return () => clearInterval(timer);
	});

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

	function chordMemoryOffsets(mem: ChordMemoryMode): readonly number[] {
		if (mem === 'latch') return latchedChordIntervals.length > 0 ? latchedChordIntervals : [0];
		return CHORD_INTERVALS[mem];
	}

	function syncSchedulerHeldNotes() {
		const physicalInputs = Array.from(
			new Set(
				held
					.filter((item) => !item.id.startsWith('arp-') && !item.id.startsWith('demo-'))
					.map((item) => item.input)
			)
		);
		scheduler?.setHeldNotes(physicalInputs);
	}

	function release(id: string) {
		const releasedNotes = held.filter((item) => item.id === id || item.id.startsWith(`${id}-`));
		const single = ledger.release(id);
		const chordVoices = ledger.releaseChord(id);
		const allReleased = single ? [single, ...chordVoices] : chordVoices;

		for (const voice of allReleased) {
			if (voice.voiceId) audio?.noteOff(voice.voiceId);
			if (wavRecording) wavRecorder?.recordEvent({ type: 'noteOff', voiceKey: voice.inputId });
		}

		for (const note of releasedNotes) {
			if (sustain) {
				if (sustained.length >= 24) effects?.noteOff(sustained[0].effectId);
				sustained = [
					...sustained,
					{ pitch: note.output, effectId: note.effectId, voiceId: note.voiceId }
				].slice(-24);
			} else {
				effects?.noteOff(note.effectId);
			}
		}

		if (releasedNotes.length > 0) {
			held = held.filter((item) => item.id !== id && !item.id.startsWith(`${id}-`));
			if (!id.startsWith('arp-') && !id.startsWith('demo-')) {
				syncSchedulerHeldNotes();
			}
		}
		syncActiveVoicesCount();
	}

	function pruneDeadVoices() {
		if (!sound || !audio) return;
		for (const note of sustained) {
			if (note.voiceId && !audio.hasVoice(note.voiceId)) {
				effects?.noteOff(note.effectId);
			}
		}
		sustained = sustained.filter((note) => !note.voiceId || audio?.hasVoice(note.voiceId));

		const prunedVoices = ledger.prune((voiceId) => !voiceId || Boolean(audio?.hasVoice(voiceId)));
		const prunedIds = new Set(prunedVoices.map((pv) => pv.inputId));
		if (wavRecording) {
			for (const pv of prunedVoices) {
				if (pv.voiceId) {
					wavRecorder?.recordEvent({ type: 'noteOff', voiceKey: pv.inputId });
				}
			}
		}

		if (held.length > 0) {
			const remainingHeld = held.filter(
				(note) =>
					!prunedIds.has(note.id) && (!note.voiceId || Boolean(audio?.hasVoice(note.voiceId)))
			);
			if (remainingHeld.length !== held.length) {
				const remainingSet = new Set(remainingHeld);
				for (const note of held) {
					if (!remainingSet.has(note)) effects?.noteOff(note.effectId);
				}
				held = remainingHeld;
			}
		}

		syncActiveVoicesCount();
	}

	function press(
		id: string,
		pitch: number,
		velocity = 0.65,
		prepared?: Decision,
		scheduledVoice?: string
	) {
		if (disposed) return;
		pruneDeadVoices();
		if (ledger.get(id) || ledger.get(`${id}-0`)) return;
		const began = performance.now();
		const clampedVel = Math.max(0.05, Math.min(1, velocity));
		lastVelocity = clampedVel;

		try {
			const isUserTriggered =
				!id.startsWith('demo-') && !id.startsWith('arp-') && !id.startsWith('guide');
			if (stepRec && isUserTriggered) {
				scheduler?.recordStep(pitch);
			}

			const offsets = prepared ? [0] : chordMemoryOffsets(patch.chordMemory);
			const inputPitches = Array.from(
				new Set(offsets.map((off) => pitch + off).filter((p) => p >= MIDI_MIN && p <= MIDI_MAX))
			);
			if (inputPitches.length === 0)
				inputPitches.push(Math.max(MIDI_MIN, Math.min(MIDI_MAX, pitch)));

			const rootDecision =
				prepared ??
				decide({
					pitch: inputPitches[0],
					chord,
					mode,
					temperature,
					seed: Number(seed),
					eventIndex: eventIndex++,
					lastPitch: recent.at(-1),
					recent,
					active: held.map((v) => v.output)
				});

			let remaining = held;
			const newHeld: typeof held = [];
			if (inputPitches.length === 1) {
				const voiceId = scheduledVoice ?? audio?.noteOn(rootDecision.output, clampedVel) ?? '';
				if (wavRecording && !scheduledVoice) {
					wavRecorder?.recordEvent({
						type: 'noteOn',
						pitch: rootDecision.output,
						velocity: clampedVel,
						voiceKey: id
					});
				}
				ledger.bind(id, voiceId, rootDecision.output);
				const effectId = `note-${++effectSerial}`;
				effects?.noteOn(effectId, rootDecision.output, clampedVel);
				newHeld.push({
					id,
					input: inputPitches[0],
					output: rootDecision.output,
					voiceId,
					effectId
				});
			} else {
				const staleChord = ledger.releaseChord(id);
				if (staleChord.length > 0) {
					for (const stale of staleChord) {
						if (stale.voiceId) audio?.noteOff(stale.voiceId);
						if (wavRecording)
							wavRecorder?.recordEvent({ type: 'noteOff', voiceKey: stale.inputId });
					}
					const isChordItem = (itemId: string) =>
						itemId.startsWith(`${id}-`) && /^\d+$/.test(itemId.slice(id.length + 1));
					for (const note of remaining) {
						if (isChordItem(note.id)) effects?.noteOff(note.effectId);
					}
					remaining = remaining.filter((item) => !isChordItem(item.id));
				}
				const targets: { voiceId: string; pitch: number }[] = [];
				const decisions: { input: number; output: number }[] = [
					{ input: inputPitches[0], output: rootDecision.output }
				];
				for (let i = 1; i < inputPitches.length; i++) {
					const extraInput = inputPitches[i];
					const extraDec = decide({
						pitch: extraInput,
						chord,
						mode,
						temperature,
						seed: Number(seed),
						eventIndex: eventIndex++,
						lastPitch: recent.at(-1),
						recent,
						active: [...remaining.map((v) => v.output), ...decisions.map((d) => d.output)]
					});
					decisions.push({ input: extraInput, output: extraDec.output });
				}
				const chordPatchOverride =
					decisions.length > 1 && (patch.voiceMode === 'legato' || patch.voiceMode === 'mono')
						? { ...patch, voiceMode: 'poly' as const }
						: undefined;
				for (let i = 0; i < decisions.length; i++) {
					const d = decisions[i];
					const voiceId = audio?.noteOn(d.output, clampedVel, undefined, chordPatchOverride) ?? '';
					if (wavRecording) {
						wavRecorder?.recordEvent({
							type: 'noteOn',
							pitch: d.output,
							velocity: clampedVel,
							voiceKey: `${id}-${i}`
						});
					}
					targets.push({ voiceId, pitch: d.output });
					const effectId = `note-${++effectSerial}`;
					effects?.noteOn(effectId, d.output, clampedVel);
					newHeld.push({
						id: `${id}-${i}`,
						input: d.input,
						output: d.output,
						voiceId,
						effectId
					});
				}
				ledger.bindChord(id, targets);
			}

			held = [...remaining, ...newHeld];
			pruneDeadVoices();
			if (isUserTriggered) {
				const heldInputs = Array.from(
					new Set(
						held
							.filter((h) => !h.id.startsWith('arp-') && !h.id.startsWith('demo-'))
							.map((h) => h.input)
					)
				).sort((a, b) => a - b);
				if (patch.chordMemory !== 'latch' && heldInputs.length >= 2) {
					const base = heldInputs[0];
					latchedChordIntervals = heldInputs.map((p) => p - base);
				}
				syncSchedulerHeldNotes();
			}

			latest = rootDecision;
			if (!frozen) inspected = rootDecision;
			history = [rootDecision, ...history].slice(0, 16);
			recent = [...recent, rootDecision.output].slice(-8);
			scheduleMs = performance.now() - began;
			error = '';
			status = sound
				? 'Sound enabled. A synthesised piano, gently played.'
				: 'Sound is off. You can still play the painting.';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to choose this note.';
		}
	}

	function scheduleDemoTimer(fn: () => void, delayMs: number) {
		const timer = setTimeout(() => {
			demoTimers.delete(timer);
			fn();
		}, delayMs);
		demoTimers.add(timer);
	}

	function cancelDemo() {
		for (const timer of demoTimers) clearTimeout(timer);
		demoTimers.clear();
		scheduledPhraseVoices.clear();
		scheduler?.stopPhrase();
		replaying = false;
	}

	function stopAll(message = 'All notes released.', resetLatch = false) {
		cancelDemo();
		if (auditionTimer) clearTimeout(auditionTimer);
		auditionTimer = undefined;
		for (const timer of nativeTimers.keys()) clearTimeout(timer);
		nativeTimers.clear();
		scheduler?.stop();
		scheduler?.setHeldNotes([]);
		scheduler?.clearLatch();
		scheduler?.setRecordCursor(0);
		selectedSeqStep = 0;
		arpRunning = false;
		stepRec = false;
		progressing = false;
		if (resetLatch && patch.arpSeq.hold) {
			const nextPatch = validateSynthPatch({
				...patch,
				arpSeq: { ...patch.arpSeq, hold: false }
			});
			patch = nextPatch;
			audio?.setPatch(nextPatch);
		}
		scheduler?.setConfig({
			stepRec: false,
			playMode: 'off',
			hold: resetLatch ? false : patch.arpSeq.hold
		});
		syncProgressionToScheduler(false);
		ledger.clear();
		activePointers = [];
		held = [];
		sustained = [];
		effects?.releaseAll();
		sustain = false;
		audio?.setSustain(false);
		audio?.stopAll();
		if (wavRecording) wavRecorder?.recordEvent({ type: 'stopAll' });
		syncActiveVoicesCount();
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
				audio = new SynthAudio({
					patch,
					onExternalStop: () => {
						if (!disposed) stopAll('Paused for article narration.');
					}
				});
			}
			await audio.enable();
			if (disposed || token !== startupToken) return;
			audio.setPatch(patch);
			audio.setVolume(volume);
			audio.setMuted(muted);
			audio.setSustain(sustain);
			audio.setPitchBend(pitchBend);
			audio.setModWheel(modWheel);
			sound = true;
			syncActiveVoicesCount();
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
		return sound && audio?.ready ? audio.currentTime : performance.now() / 1000;
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
		press(id, pitch, 0.65);
		const timer = setTimeout(() => {
			nativeTimers.delete(timer);
			if (!disposed) release(id);
		}, 280);
		nativeTimers.set(timer, id);
	}

	function syncProgressionToScheduler(enabled: boolean) {
		scheduler?.setConfig({
			chordProgression: {
				enabled,
				chords: preset.chords.map((c) => ({ voicing: c.voicing })),
				currentIndex: chordIndex,
				intervalSeconds: 3,
				accompaniment,
				velocity: 0.25,
				durationSeconds: 1.4
			}
		});
	}

	function toggleTransport() {
		if (progressing) {
			progressing = false;
			syncProgressionToScheduler(false);
			if (!arpRunning && !replaying) stopAll('Progression stopped on the selected chord.');
			return;
		}
		progressing = true;
		syncProgressionToScheduler(true);
		scheduler?.start();
	}

	function toggleArpPlay() {
		if (arpRunning) {
			arpRunning = false;
			scheduler?.setConfig({ playMode: 'off' });
			if (!progressing && !replaying) {
				scheduler?.stop();
			}
			return;
		}
		let nextEngine = patch.arpSeq.engine;
		if (nextEngine === 'off') {
			const hasActiveStep = patch.arpSeq.steps.some((s) => s.active);
			nextEngine = hasActiveStep && held.length === 0 ? 'seq' : 'arp';
			applyPatch({
				...patch,
				arpSeq: { ...patch.arpSeq, engine: nextEngine }
			});
		}
		arpRunning = true;
		scheduler?.setConfig(schedulerConfigFromPatch(patch, true));
		scheduler?.start();
	}

	function replay() {
		stopAll('Playing the same original phrase through this mode.');
		recent = [];
		eventIndex = 0;
		replaying = true;
		try {
			let replayRecent: number[] = [];
			replayScore = DEMO.map((note, index) => {
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

			scheduler?.startPhrase(
				replayScore.map((item) => ({
					pitch: item.decision.output,
					at: item.at,
					duration: item.duration,
					velocity: item.velocity
				})),
				{
					onEvent: (idx, emitAt) => {
						const item = replayScore[idx];
						if (!item || disposed) return;
						const now = clockNow();
						const voiceKey = `${item.decision.output}@${emitAt.toFixed(4)}`;
						const voiceId = scheduledPhraseVoices.get(voiceKey) ?? '';
						scheduledPhraseVoices.delete(voiceKey);
						if (wavRecording && voiceId) {
							wavRecorder?.recordEvent({
								type: 'noteOn',
								pitch: item.decision.output,
								velocity: item.velocity,
								voiceKey: `demo-${idx}`
							});
						}
						const startMs = Math.max(0, (emitAt - now) * 1000);
						const endMs = Math.max(0, (emitAt + item.duration - now) * 1000);
						scheduleDemoTimer(
							() => press(`demo-${idx}`, item.pitch, item.velocity, item.decision, voiceId),
							startMs
						);
						scheduleDemoTimer(() => release(`demo-${idx}`), endMs);
					},
					onComplete: () => {
						replaying = false;
						if (!arpRunning && !progressing) scheduler?.stop();
						status = 'Phrase complete. Switch mode and replay to compare.';
					}
				}
			);
			scheduler?.start();
		} catch (caught) {
			cancelDemo();
			error = caught instanceof Error ? caught.message : 'Replay unavailable.';
		}
	}

	function handleScheduleNoteAt(
		pitch: number,
		velocity: number,
		whenSeconds: number,
		durationSeconds: number,
		source: SchedulerSource
	) {
		if (disposed) return;
		if (source === 'chord') {
			if (replaying) {
				if (sound && audio?.ready) {
					const voiceId = audio.scheduleNote(pitch, velocity, whenSeconds, durationSeconds);
					if (voiceId) {
						scheduledPhraseVoices.set(`${pitch}@${whenSeconds.toFixed(4)}`, voiceId);
						syncActiveVoicesCount();
					}
				}
				return;
			}
			if (progressing && accompaniment && sound && audio?.ready) {
				const voiceId = audio.scheduleNote(pitch, velocity, whenSeconds, durationSeconds);
				if (voiceId) syncActiveVoicesCount();
				if (wavRecording && voiceId) {
					const accKey = `acc-${++effectSerial}`;
					const now = clockNow();
					const startMs = Math.max(0, (whenSeconds - now) * 1000);
					const endMs = Math.max(startMs + 25, (whenSeconds + durationSeconds - now) * 1000);
					wavRecorder?.recordEvent({
						type: 'noteOn',
						pitch,
						velocity,
						voiceKey: accKey
					});
					scheduleDemoTimer(() => {
						if (!disposed && wavRecording) {
							wavRecorder?.recordEvent({ type: 'noteOff', voiceKey: accKey });
						}
					}, endMs);
				}
			}
			return;
		}

		// Arp / Sequencer notes route through Harmonic Assist
		const bounded = Math.max(MIDI_MIN, Math.min(MIDI_MAX, Math.round(pitch)));
		try {
			const decision = decide({
				pitch: bounded,
				chord,
				mode,
				temperature,
				seed: Number(seed),
				eventIndex: eventIndex++,
				lastPitch: recent.at(-1),
				recent
			});
			const arpId = `arp-${++effectSerial}`;
			const voiceId =
				sound && audio?.ready
					? audio.scheduleNote(decision.output, velocity, whenSeconds, durationSeconds)
					: '';
			if (voiceId) syncActiveVoicesCount();
			if (wavRecording && voiceId) {
				wavRecorder?.recordEvent({
					type: 'noteOn',
					pitch: decision.output,
					velocity,
					voiceKey: arpId
				});
			}
			const now = clockNow();
			const startMs = Math.max(0, (whenSeconds - now) * 1000);
			const endMs = Math.max(startMs + 25, (whenSeconds + durationSeconds - now) * 1000);
			scheduleDemoTimer(() => {
				if (!disposed) press(arpId, bounded, velocity, decision, voiceId);
			}, startMs);
			scheduleDemoTimer(() => {
				if (!disposed) release(arpId);
			}, endMs);
		} catch {
			// Ignore out-of-range arp notes gracefully
		}
	}

	function computeKeyVelocity(event: PointerEvent, keyEl: HTMLElement | null): number {
		if (event.pointerType === 'pen' && event.pressure > 0) {
			return Math.max(0.2, Math.min(1, event.pressure));
		}
		if (!dynamicVelocity || !keyEl) return 0.65;
		const rect = keyEl.getBoundingClientRect();
		const yNorm = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
		return Number((0.25 + yNorm * 0.75).toFixed(3));
	}

	function pointerKeyElement(event: PointerEvent): HTMLElement | null {
		const element = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-piano-key]');
		return element && root?.contains(element) ? element : null;
	}

	function pointerDown(event: PointerEvent, pitch: number) {
		if (event.button !== 0) return;
		event.preventDefault();
		activePointers = [...activePointers.filter((id) => id !== event.pointerId), event.pointerId];
		const keyEl = event.currentTarget as HTMLElement;
		keyEl.focus({ preventScroll: true });
		keyEl.setPointerCapture(event.pointerId);
		press(`pointer-${event.pointerId}`, pitch, computeKeyVelocity(event, keyEl));
	}

	function pointerEnd(event: PointerEvent) {
		release(`pointer-${event.pointerId}`);
		activePointers = activePointers.filter((id) => id !== event.pointerId);
	}

	function focusKey(pitch: number) {
		focusedPitch = Math.max(MIDI_MIN, Math.min(MIDI_MAX, pitch));
		const button = keyboardElement?.querySelector<HTMLButtonElement>(
			`[data-piano-key="${focusedPitch}"]`
		);
		button?.focus({ preventScroll: true });
		if (!navigationBusy && button && keyboardWindow) {
			const bounds = button.getBoundingClientRect();
			const windowBounds = keyboardWindow.getBoundingClientRect();
			if (bounds.left < windowBounds.left || bounds.right > windowBounds.right)
				centreOn(focusedPitch);
		}
	}

	function pointerMove(event: PointerEvent) {
		const id = `pointer-${event.pointerId}`;
		if (!activePointers.includes(event.pointerId)) return;
		const keyEl = pointerKeyElement(event);
		const pitch = keyEl ? Number(keyEl.dataset.pianoKey) : undefined;
		const old = held.find((item) => item.id === id || item.id === `${id}-0`);
		if (old?.input === pitch) return;
		release(id);
		if (pitch !== undefined && event.buttons) {
			press(id, pitch, computeKeyVelocity(event, keyEl));
		}
	}

	function keyboardDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key === 'Escape' && focusView) {
			event.preventDefault();
			void toggleFocus();
			return;
		}
		if (
			target.closest(
				'input,select,textarea,summary,[contenteditable="true"],[role="slider"],[role="tab"],[role="spinbutton"],[role="combobox"]'
			) ||
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
			press(`key-${event.code}`, shortcutPitches[position], qwertyVelocity);
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
		press('guide', pitch, 0.65);
		release('guide');
	}

	async function handleToggleMidi() {
		if (!midi || !midiSupported) {
			status = 'Web MIDI is unsupported in this browser.';
			return;
		}
		const res = await midi.requestAccess();
		if (res.ok) {
			midiConnected = true;
			midiInputs = res.inputs;
			midiSelectedId = res.selectedId;
			status =
				res.inputs.length > 0
					? `MIDI connected: ${res.inputs[0].name}`
					: 'MIDI ready (no input devices connected).';
		} else {
			midiConnected = false;
			status = res.error ?? 'MIDI access denied or unavailable.';
		}
	}

	async function handleToggleRecWav() {
		if (!wavRecorder) return;
		if (!wavRecording) {
			wavRecorder.revokeLastUrl();
			wavDownloadUrl = null;
			wavRecorder.start(patch);
			wavRecording = true;
			status = 'Recording live performance…';
			return;
		}
		wavRecording = false;
		const events = wavRecorder.stop();
		const hasNotes = events.some((ev) => ev.type === 'noteOn');
		if (!hasNotes) {
			status = 'Recording stopped: no notes were played.';
			return;
		}
		exportingWav = true;
		status = 'Rendering WAV export…';
		try {
			const blob = await wavRecorder.exportWav(patch);
			if (disposed) return;
			const url = wavRecorder.createBlobUrl(blob);
			wavDownloadUrl = url;
			wavDownloadName = `${patch.id || 'synth-take'}.wav`;
			status = 'WAV export ready for download.';
			await tick();
			root?.querySelector<HTMLAnchorElement>('a.wav-download')?.click();
		} catch (caught) {
			status = caught instanceof Error ? caught.message : 'WAV export failed.';
		} finally {
			exportingWav = false;
		}
	}

	function updateArpSeq(
		partial: Partial<ArpSeqConfig>,
		echo?: { label: string; valueText: string }
	) {
		if (partial.engine === 'off') {
			arpRunning = false;
			if (!progressing && !replaying) scheduler?.stop();
		}
		applyPatch(
			{
				...patch,
				arpSeq: { ...patch.arpSeq, ...partial }
			},
			echo
		);
	}

	function updateSeqStep(
		index: number,
		partial: Partial<SeqStep>,
		echo?: { label: string; valueText: string }
	) {
		const nextSteps = patch.arpSeq.steps.map((s, i) => (i === index ? { ...s, ...partial } : s));
		updateArpSeq({ steps: nextSteps }, echo);
	}

	onMount(() => {
		mounted = true;
		disposed = false;
		let alive = true;

		// Load user patches & #patch= hash safely inside onMount
		userPatches = loadUserPatches();
		if (window.location.hash.startsWith('#patch=')) {
			const decoded = decodePatchHash(window.location.hash);
			if (decoded.ok) {
				basePreset = validateSynthPatch(decoded.patch);
				applyPatch(decoded.patch);
			} else {
				basePreset = getFactoryPreset(0);
				applyPatch(getFactoryPreset(0));
				status = decoded.reason ?? 'Invalid patch hash; loaded 01 Forgiving Grand.';
			}
		} else {
			try {
				const lastId = sessionStorage.getItem('suvro-synth-last-id');
				if (lastId) {
					const restoredFactory = FACTORY_PRESETS.find((p) => p.id === lastId);
					const restoredUser = userPatches.find((p) => p.id === lastId);
					if (restoredFactory) {
						const clone = getFactoryPreset(restoredFactory.id);
						basePreset = getFactoryPreset(restoredFactory.id);
						applyPatch(clone);
					} else if (restoredUser) {
						const clone = validateSynthPatch(restoredUser);
						basePreset = validateSynthPatch(restoredUser);
						applyPatch(clone);
					}
				}
			} catch {
				// Ignore storage access errors
			}
		}

		scheduler = createSynthScheduler({
			nowSeconds: clockNow,
			scheduleNoteAt: handleScheduleNoteAt,
			onStep: (stepIdx) => {
				if (!still) displayStep = stepIdx;
			},
			onChordChange: (nextIdx) => {
				chordIndex = nextIdx % preset.chords.length;
			},
			onStepRecord: (stepIdx, recordedStep) => {
				const nextSteps = patch.arpSeq.steps.map((s, i) =>
					i === stepIdx ? { ...recordedStep } : s
				);
				selectedSeqStep = stepIdx;
				applyPatch({
					...patch,
					arpSeq: { ...patch.arpSeq, steps: nextSteps }
				});
			}
		});
		scheduler.setConfig(schedulerConfigFromPatch(patch));

		wavRecorder = createWavRecorder({ nowSeconds: clockNow });

		midi = createMidiController({
			onNoteOn: (pitch, velocity) => {
				const clamped = Math.max(MIDI_MIN, Math.min(MIDI_MAX, pitch));
				press(`midi-${pitch}`, clamped, velocity);
			},
			onNoteOff: (pitch) => {
				release(`midi-${pitch}`);
			},
			onPitchBend: (val) => {
				pitchBend = val;
				audio?.setPitchBend(val);
				if (wavRecording) wavRecorder?.recordEvent({ type: 'pitchBend', value: val });
			},
			onModWheel: (val) => {
				modWheel = val;
				audio?.setModWheel(val);
				if (wavRecording) wavRecorder?.recordEvent({ type: 'modWheel', value: val });
			},
			onSustain: (val) => {
				sustain = val;
				pedalChanged();
			},
			onAllNotesOff: () => stopAll('MIDI all notes off.', true),
			onDevicesChange: (inputs, selectedId) => {
				midiInputs = inputs;
				midiSelectedId = selectedId;
			},
			onStatus: (msg) => {
				status = msg;
			}
		});
		midiSupported = midi.isSupported();

		Promise.all([
			import('$lib/visualizations/probabilistic-piano/painting'),
			import('$lib/visualizations/probabilistic-piano/effects')
		])
			.then(([module, visual]) => {
				if (alive && effectsCanvas) {
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

		const narrowMq = window.matchMedia('(max-width: 959px)');
		const updateNarrow = () => {
			isNarrowViewport = narrowMq.matches;
		};
		updateNarrow();
		narrowMq.addEventListener('change', updateNarrow);

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
		if (stage) resize.observe(stage);
		if (keyboardWindow) resize.observe(keyboardWindow);
		if (keybedRow) resize.observe(keybedRow);

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
		if (root) intersection.observe(root);

		window.addEventListener('keyup', keyUp);
		root?.addEventListener('keydown', keyboardDown);
		keyboardWindow?.addEventListener('wheel', guardWheel, { passive: false });
		window.addEventListener('blur', blur);
		document.addEventListener('visibilitychange', visibility);

		if (keyboardWindow) {
			view = keyboardWindow.clientWidth >= 1080 ? 'fit' : 'playing';
		}
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
			if (echoTimer) clearTimeout(echoTimer);
			scheduler?.dispose();
			midi?.dispose();
			wavRecorder?.dispose();
			effects?.dispose();
			audio?.dispose();
			resize.disconnect();
			intersection.disconnect();
			mutations.disconnect();
			media.removeEventListener('change', updateMotion);
			narrowMq.removeEventListener('change', updateNarrow);
			window.removeEventListener('keyup', keyUp);
			root?.removeEventListener('keydown', keyboardDown);
			keyboardWindow?.removeEventListener('wheel', guardWheel);
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
	data-visual-mode={visualMode}
	data-last-velocity={lastVelocity.toFixed(2)}
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

	<!-- ZONE 1: Telemetry & Patch Bar -->
	<TelemetryBar
		{mounted}
		{sound}
		{starting}
		{patch}
		factoryPresets={FACTORY_PRESETS}
		{userPatches}
		{patchNameDraft}
		{auditionCategory}
		{volume}
		{visualMode}
		{still}
		visible={onScreen && pageVisible}
		{paramEcho}
		activeChordName={chord.name}
		voiceCount={sound ? activeVoicesCount : held.length}
		{audio}
		{midiSupported}
		{midiConnected}
		{midiInputs}
		{midiSelectedId}
		{wavRecording}
		{exportingWav}
		{wavDownloadUrl}
		{wavDownloadName}
		onEnableSound={enableSound}
		onSelectPatch={selectPresetById}
		onStepPatch={stepPatch}
		onPatchNameChange={(name) => (patchNameDraft = name)}
		onSavePatch={handleSavePatch}
		onSharePatch={handleSharePatch}
		onAuditionCategory={handleAuditionCategory}
		onVoiceModeChange={(vm: VoiceMode) =>
			applyPatch({ ...patch, voiceMode: vm }, { label: 'Voice Mode', valueText: vm })}
		onToggleMidi={handleToggleMidi}
		onSelectMidiInput={(id) => {
			midi?.selectInput(id);
			midiSelectedId = id;
		}}
		onToggleRecWav={handleToggleRecWav}
		onVisualModeChange={(vm) => (visualMode = vm)}
		onVolumeChange={(v) => {
			volume = v;
			audio?.setVolume(v);
			showEcho('Master Volume', `${Math.round((v / 0.8) * 100)}%`);
		}}
		onStopAll={() => stopAll('All notes released.', true)}
	/>

	<!-- Mobile < 960px 5-Tab Drawer Navigation -->
	<div class="mobile-drawer-bar" role="tablist" aria-label="Synth modules" data-tts-exclude>
		{#each MOBILE_TABS as tab, idx (tab)}
			<button
				type="button"
				role="tab"
				id={`mobile-tab-${idx}`}
				class="mobile-tab-btn"
				tabindex={activeMobileTab === tab ? 0 : -1}
				aria-selected={activeMobileTab === tab}
				aria-controls="synth-mobile-tabpanel"
				onclick={() => (activeMobileTab = tab)}
				onkeydown={(e) => handleMobileTabKeyDown(e, idx)}
			>
				{tab}
			</button>
		{/each}
	</div>

	<!-- ZONES 2 & 3 Workspace -->
	<div
		id="synth-mobile-tabpanel"
		class="synth-workspace"
		data-mobile-tab={activeMobileTab}
		data-tts-exclude
		role={isNarrowViewport ? 'tabpanel' : undefined}
		aria-labelledby={isNarrowViewport
			? `mobile-tab-${MOBILE_TABS.indexOf(activeMobileTab)}`
			: undefined}
		aria-label={isNarrowViewport ? activeMobileTab : undefined}
	>
		<ControlDeck
			{patch}
			{basePreset}
			heldCount={held.length}
			onUpdatePatch={(next, echo) => applyPatch(next, echo)}
		/>

		<div class="zone3-rack">
			<ArpSequencerBar
				arpSeq={patch.arpSeq}
				baseArpSeq={basePreset.arpSeq}
				running={arpRunning}
				{displayStep}
				selectedStep={selectedSeqStep}
				{stepRec}
				onTogglePlay={toggleArpPlay}
				onTapTempo={() => {
					const tapped = scheduler?.tapTempo();
					if (tapped !== null && tapped !== undefined) {
						updateArpSeq({ bpm: tapped }, { label: 'Tap BPM', valueText: `${tapped}` });
					}
				}}
				onSelectAndToggleStep={(index) => {
					selectedSeqStep = index;
					scheduler?.setRecordCursor(index);
					const cur = patch.arpSeq.steps[index];
					if (cur) updateSeqStep(index, { active: !cur.active });
				}}
				onUpdateArpSeq={updateArpSeq}
				onUpdateStep={updateSeqStep}
				onToggleStepRec={() => {
					stepRec = !stepRec;
					scheduler?.setConfig({ stepRec });
				}}
			/>

			<FxRack
				fx={patch.fx}
				baseFx={basePreset.fx}
				onUpdateFx={(nextFx: FxConfig, echo) => applyPatch({ ...patch, fx: nextFx }, echo)}
			/>
		</div>

		<div class="mobile-inspect-pane" data-mobile-inspect>
			<div class="module-head">
				<span class="module-title">HARMONIC ASSIST INSPECTOR</span>
				<span class="module-sub">{chord.name} · {mode.toUpperCase()}</span>
			</div>
			<p>
				{#if shown}
					Last decision: {noteName(shown.input)} → {noteName(shown.output)} ({shown.reason})
				{:else}
					Play any key to inspect harmonic probabilities and voice allocation.
				{/if}
			</p>
			<p class="inspect-palette">
				Palette: {chord.tones.map((t) => t.label).join(' · ')}
			</p>
		</div>
	</div>

	<!-- ZONE 4: Stage + Performance Bay + 88-Key Keybed -->
	<FullPianoKeybed
		bind:stage
		bind:canvas
		bind:effectsCanvas
		bind:keybedRow
		bind:keyboardWindow
		bind:keyboardElement
		bind:focusedPitch
		{mounted}
		{still}
		{quality}
		{canvasFailed}
		{visualMode}
		{view}
		{focusView}
		{geometry}
		{overviewPosition}
		{overviewWidth}
		{navigationBusy}
		{preset}
		{chord}
		{shown}
		{held}
		{sustained}
		{keyboardBase}
		{shortcutPitches}
		{shortcuts}
		{pitchBend}
		{modWheel}
		glideMs={patch.glideMs}
		baseGlideMs={basePreset.glideMs}
		{sustain}
		{dynamicVelocity}
		{qwertyVelocity}
		chordMemory={patch.chordMemory}
		onMeasure={measure}
		onPointerDownKey={pointerDown}
		onPointerMoveKey={pointerMove}
		onPointerEndKey={pointerEnd}
		onActivateKey={activateKey}
		onReleaseKeyboardNotes={() => {
			for (const item of held.filter((v) => v.id.startsWith('key-'))) release(item.id);
		}}
		onChangeView={changeView}
		onNavigateOctave={navigateOctave}
		onNavigateOverview={navigateOverview}
		onReturnMiddleC={() => void changeView('playing', 60)}
		onToggleFocus={toggleFocus}
		onPitchBend={(norm) => {
			pitchBend = norm;
			audio?.setPitchBend(norm);
			if (wavRecording) wavRecorder?.recordEvent({ type: 'pitchBend', value: norm });
			showEcho('Pitch Bend', `${norm > 0 ? '+' : ''}${Math.round(norm * 100)}%`);
		}}
		onModWheel={(norm) => {
			modWheel = norm;
			audio?.setModWheel(norm);
			if (wavRecording) wavRecorder?.recordEvent({ type: 'modWheel', value: norm });
			showEcho('Mod Wheel', `${Math.round(norm * 100)}%`);
		}}
		onGlideChange={(ms) =>
			applyPatch({ ...patch, glideMs: ms }, { label: 'Glide', valueText: `${Math.round(ms)} ms` })}
		onShiftOctave={(dir) => shiftShortcuts(dir)}
		onToggleSustain={() => {
			sustain = !sustain;
			pedalChanged();
		}}
		onToggleDynamicVelocity={() => {
			dynamicVelocity = !dynamicVelocity;
			showEcho('Velocity', dynamicVelocity ? 'Dynamic Y-Vel' : 'Fixed 0.65');
		}}
		onQwertyVelocityChange={(vel) => {
			qwertyVelocity = vel;
			showEcho('QWERTY Vel', `${Math.round(vel * 100)}%`);
		}}
		onChordMemoryChange={(cm) =>
			applyPatch({ ...patch, chordMemory: cm }, { label: 'Chord Memory', valueText: cm })}
		onPadDown={(index, pitch) => press(`pad-${index}`, pitch, 0.78)}
		onPadUp={(index) => release(`pad-${index}`)}
		onPadPulse={(index, pitch) => {
			const id = `pad-${index}`;
			for (const [existingTimer, existingId] of nativeTimers) {
				if (existingId === id) {
					clearTimeout(existingTimer);
					nativeTimers.delete(existingTimer);
					release(id);
				}
			}
			press(id, pitch, 0.78);
			const timer = setTimeout(() => {
				nativeTimers.delete(timer);
				if (!disposed) release(id);
			}, 220);
			nativeTimers.set(timer, id);
		}}
	/>

	<!-- Preserved Editorial & Assist Controls (TTS Hash Anchors Intact) -->
	<div class="piano-controls">
		<label class="preset-control"
			>THE LIGHT<select
				aria-label="Painting and harmony preset"
				bind:value={presetIndex}
				onchange={presetChanged}
				>{#each SYNTH_PALETTES as item, index (item.id)}<option value={index}>{item.name}</option
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
				>{/each}<span class="assist-badge" data-tts-exclude aria-hidden="true"
				>Snap · Wander · Free Play</span
			>
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
	</div>

	<div class="piano-playing-tools">
		<div class="shortcut-range">
			<span>COMPUTER KEYS</span><output data-tts-text={`${noteName(60)}–${noteName(77)}`}
				>{noteName(keyboardBase)}–{noteName(shortcutPitches.at(-1) ?? keyboardBase)}</output
			>
		</div>
		<label class="check pedal-control"
			><input type="checkbox" bind:checked={sustain} onchange={pedalChanged} /> Hold pedal</label
		>

		<label
			>Current chord<select
				aria-label="Current chord"
				bind:value={chordIndex}
				onchange={() => {
					if (progressing) syncProgressionToScheduler(true);
				}}
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
		<p data-tts-text="The closest note in this harmony. Equally close? A little probability.">
			{mode === 'nearest'
				? 'The closest note in this harmony. Equally close? A little probability.'
				: mode === 'wander'
					? 'Nearby alternatives, at most one extra semitone beyond the closest.'
					: 'Your original notes, untouched. Every possibility is yours.'}
		</p>
		<p
			class="sound-status"
			role="status"
			data-tts-text="Sound is off. You can still play the painting."
		>
			{error || status}
		</p>
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
				<p
					class="palette-notes"
					data-tts-text={`Palette: ${SYNTH_PALETTES[0].chords[0].tones.map((tone) => tone.label).join(' · ')}`}
				>
					Palette: {chord.tones.map((tone) => tone.label).join(' · ')}
				</p>
				<div class="tool-buttons">
					<button type="button" aria-pressed={progressing} onclick={toggleTransport}
						>{progressing ? 'Stop progression' : 'Start progression'}</button
					>
				</div>
				<label class="check"
					><input
						type="checkbox"
						bind:checked={accompaniment}
						onchange={() => {
							if (progressing) syncProgressionToScheduler(true);
						}}
					/> Soft accompaniment (with sound and progression)</label
				><label class="check"
					><input type="checkbox" bind:checked={muted} onchange={() => audio?.setMuted(muted)} /> Mute</label
				><label
					>Temperature <output data-tts-text="0.70">{Number(temperature).toFixed(2)}</output><input
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
						oninput={syncSeed}
						onchange={syncSeed}
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
				>{#if shown}<dl data-tts-text="Play a key to see the complete decision here.">
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
					<p data-decision-reason data-tts-exclude>{shown.reason}</p>
					<table data-tts-exclude>
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
					<p data-tts-exclude>
						Eligible within A0–C8: {shown.eligible.map(noteName).join(', ')}. Eligible pitches
						outside this mode’s distance bound are omitted from the sampler.
					</p>{:else}<p>Play a key to see the complete decision here.</p>{/if}
				<details>
					<summary data-tts-text="Recent notes (0 / 16)"
						>Recent notes ({history.length} / 16)</summary
					>
					<ol data-tts-exclude>
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
