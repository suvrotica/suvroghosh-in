<script lang="ts">
	import {
		MIDI_MAX,
		MIDI_MIN,
		noteName,
		type Chord
	} from '$lib/visualizations/probabilistic-piano/model';
	import type { ChordMemoryMode } from '$lib/visualizations/probabilistic-piano/synth-patch';
	import Knob from './Knob.svelte';
	import VerticalFader from './VerticalFader.svelte';

	interface Props {
		pitchBend: number;
		modWheel: number;
		glideMs: number;
		baseGlideMs: number;
		keyboardBase: number;
		sustain: boolean;
		dynamicVelocity: boolean;
		qwertyVelocity: 0.35 | 0.65 | 0.92;
		chordMemory: ChordMemoryMode;
		paletteChord: Chord;
		onPitchBend: (norm: number) => void;
		onModWheel: (norm: number) => void;
		onGlideChange: (ms: number) => void;
		onShiftOctave: (dir: -1 | 1) => void;
		onToggleSustain: () => void;
		onToggleDynamicVelocity: () => void;
		onQwertyVelocityChange: (vel: 0.35 | 0.65 | 0.92) => void;
		onChordMemoryChange: (mode: ChordMemoryMode) => void;
		onPadDown: (index: number, pitch: number) => void;
		onPadUp: (index: number) => void;
		onPadPulse: (index: number, pitch: number) => void;
	}

	let {
		pitchBend,
		modWheel,
		glideMs,
		baseGlideMs,
		keyboardBase,
		sustain,
		dynamicVelocity,
		qwertyVelocity,
		chordMemory,
		paletteChord,
		onPitchBend,
		onModWheel,
		onGlideChange,
		onShiftOctave,
		onToggleSustain,
		onToggleDynamicVelocity,
		onQwertyVelocityChange,
		onChordMemoryChange,
		onPadDown,
		onPadUp,
		onPadPulse
	}: Props = $props();

	let activePad = $state<number | null>(null);

	const padPitches = $derived.by(() => {
		const tones = paletteChord.tones;
		const baseOct = Math.max(24, Math.min(84, keyboardBase));
		const pitches: { index: number; pitch: number; label: string }[] = [];
		for (let i = 0; i < 9; i++) {
			const tone = tones[i % tones.length];
			const octShift = Math.floor(i / tones.length) * 12;
			const raw = baseOct + tone.pc + octShift;
			const clamped = Math.max(MIDI_MIN, Math.min(MIDI_MAX, raw));
			pitches.push({
				index: i,
				pitch: clamped,
				label: noteName(clamped)
			});
		}
		return pitches;
	});
</script>

<div
	class="performance-bay"
	data-performance-bay
	role="region"
	aria-label="Performance bay"
	data-tts-exclude
>
	<div class="perf-wheels">
		<VerticalFader
			label="Pitch Bend"
			value={pitchBend}
			min={-1}
			max={1}
			step={0.01}
			defaultValue={0}
			springReturn={true}
			compact={true}
			accent="amber"
			format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
			onchange={onPitchBend}
		/>
		<VerticalFader
			label="Mod Wheel"
			value={modWheel}
			min={0}
			max={1}
			step={0.01}
			defaultValue={0}
			compact={true}
			accent="cyan"
			format={(v) => `${Math.round(v * 100)}%`}
			onchange={onModWheel}
		/>
		<Knob
			label="Glide"
			value={glideMs}
			min={0}
			max={600}
			step={1}
			defaultValue={baseGlideMs}
			accent="cyan"
			format={(v) => `${Math.round(v)} ms`}
			onchange={onGlideChange}
		/>
	</div>

	<div class="perf-toggles">
		<div class="oct-shift-group" role="group" aria-label="Octave shift">
			<button
				type="button"
				class="pill-btn"
				aria-label="Lower computer-keyboard octave"
				disabled={keyboardBase <= 24}
				onclick={() => onShiftOctave(-1)}
			>
				[ −
			</button>
			<span class="oct-readout">{noteName(keyboardBase)}</span>
			<button
				type="button"
				class="pill-btn"
				aria-label="Higher computer-keyboard octave"
				disabled={keyboardBase >= 96}
				onclick={() => onShiftOctave(1)}
			>
				+ ]
			</button>
		</div>

		<button type="button" class="pill-btn" aria-pressed={sustain} onclick={onToggleSustain}>
			Hold
		</button>

		<button
			type="button"
			class="pill-btn"
			aria-pressed={dynamicVelocity}
			onclick={onToggleDynamicVelocity}
		>
			{dynamicVelocity ? 'Dynamic Y-Vel' : 'Fixed Vel'}
		</button>

		<label class="compact-field">
			<span>KEYS VEL</span>
			<select
				aria-label="QWERTY velocity"
				value={String(qwertyVelocity)}
				onchange={(e) =>
					onQwertyVelocityChange(Number(e.currentTarget.value) as 0.35 | 0.65 | 0.92)}
			>
				<option value="0.35">Soft</option>
				<option value="0.65">Med</option>
				<option value="0.92">Hard</option>
			</select>
		</label>

		<label class="compact-field">
			<span>CHORD MEM</span>
			<select
				aria-label="Chord Memory"
				value={chordMemory}
				onchange={(e) => onChordMemoryChange(e.currentTarget.value as ChordMemoryMode)}
			>
				<option value="off">Off</option>
				<option value="oct">Oct</option>
				<option value="5th">5th</option>
				<option value="maj7">Maj7</option>
				<option value="min7">Min7</option>
				<option value="sus4">Sus4</option>
				<option value="9th">9th</option>
				<option value="latch">Latch</option>
			</select>
		</label>
	</div>

	<div class="chord-pad-grid" role="group" aria-label="Chord trigger pads">
		{#each padPitches as pad (pad.index)}
			<button
				type="button"
				class="chord-pad"
				class:lit={activePad === pad.index}
				data-chord-pad
				data-pad-index={pad.index}
				aria-label={`Trigger ${pad.label}`}
				onpointerdown={(e) => {
					if (e.button !== 0) return;
					e.preventDefault();
					e.currentTarget.setPointerCapture(e.pointerId);
					activePad = pad.index;
					onPadDown(pad.index, pad.pitch);
				}}
				onpointerup={() => {
					activePad = null;
					onPadUp(pad.index);
				}}
				onpointercancel={() => {
					activePad = null;
					onPadUp(pad.index);
				}}
				onlostpointercapture={() => {
					activePad = null;
					onPadUp(pad.index);
				}}
				onclick={(e) => {
					if (e.detail === 0) onPadPulse(pad.index, pad.pitch);
				}}
			>
				<span>{pad.label}</span>
			</button>
		{/each}
	</div>
</div>
