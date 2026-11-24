<script lang="ts">
	import { PIANO_KEYS } from '$lib/visualizations/probabilistic-piano/keyboard';
	import {
		PRESETS,
		noteName,
		type Chord,
		type Decision,
		type Preset
	} from '$lib/visualizations/probabilistic-piano/model';
	import type { ChordMemoryMode } from '$lib/visualizations/probabilistic-piano/synth-patch';
	import PerformanceBay from './PerformanceBay.svelte';

	interface HeldEntry {
		id: string;
		input: number;
		output: number;
		voiceId: string;
		effectId: string;
	}

	interface SustainedEntry {
		pitch: number;
		effectId: string;
		voiceId: string;
	}

	interface Geometry {
		left: number;
		top: number;
		content: number;
		viewport: number;
		scroll: number;
	}

	interface Props {
		stage?: HTMLDivElement;
		canvas?: HTMLCanvasElement;
		effectsCanvas?: HTMLCanvasElement;
		keybedRow?: HTMLDivElement;
		keyboardWindow?: HTMLDivElement;
		keyboardElement?: HTMLDivElement;
		mounted: boolean;
		still: boolean;
		quality: 'painted' | 'simple';
		canvasFailed: boolean;
		visualMode: 'pond' | 'oled';
		view: 'fit' | 'playing';
		focusView: boolean;
		geometry: Geometry;
		overviewPosition: number;
		overviewWidth: number;
		navigationBusy: boolean;
		preset: Preset;
		chord: Chord;
		shown: Decision | null;
		held: HeldEntry[];
		sustained: SustainedEntry[];
		focusedPitch: number;
		keyboardBase: number;
		shortcutPitches: number[];
		shortcuts: readonly string[];
		pitchBend: number;
		modWheel: number;
		glideMs: number;
		baseGlideMs: number;
		sustain: boolean;
		dynamicVelocity: boolean;
		qwertyVelocity: 0.35 | 0.65 | 0.92;
		chordMemory: ChordMemoryMode;
		onMeasure: () => void;
		onPointerDownKey: (event: PointerEvent, pitch: number) => void;
		onPointerMoveKey: (event: PointerEvent) => void;
		onPointerEndKey: (event: PointerEvent) => void;
		onActivateKey: (pitch: number) => void;
		onReleaseKeyboardNotes: () => void;
		onChangeView: (next: 'fit' | 'playing', pitch?: number) => void;
		onNavigateOctave: (dir: number) => void;
		onNavigateOverview: (val: number) => void;
		onReturnMiddleC: () => void;
		onToggleFocus: () => void;
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
		stage = $bindable(),
		canvas = $bindable(),
		effectsCanvas = $bindable(),
		keybedRow = $bindable(),
		keyboardWindow = $bindable(),
		keyboardElement = $bindable(),
		mounted,
		still,
		quality,
		canvasFailed,
		visualMode,
		view,
		focusView,
		geometry,
		overviewPosition,
		overviewWidth,
		navigationBusy,
		preset,
		chord,
		shown,
		held,
		sustained,
		focusedPitch = $bindable(),
		keyboardBase,
		shortcutPitches,
		shortcuts,
		pitchBend,
		modWheel,
		glideMs,
		baseGlideMs,
		sustain,
		dynamicVelocity,
		qwertyVelocity,
		chordMemory,
		onMeasure,
		onPointerDownKey,
		onPointerMoveKey,
		onPointerEndKey,
		onActivateKey,
		onReleaseKeyboardNotes,
		onChangeView,
		onNavigateOctave,
		onNavigateOverview,
		onReturnMiddleC,
		onToggleFocus,
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

	const shortcutFor = (pitch: number) => shortcuts[shortcutPitches.indexOf(pitch)] ?? '';
	const keyX = (pitch: number) =>
		((PIANO_KEYS.find((item) => item.pitch === pitch)?.centre ?? 0) / 100) * geometry.content -
		geometry.scroll;
</script>

<div
	class="piano-world"
	bind:this={stage}
	class:ready={mounted}
	class:simple={quality === 'simple' || canvasFailed}
	class:oled-focus={visualMode === 'oled'}
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
		<span data-tts-text={`01 — ${PRESETS[0].name}`}>01 — {preset.name}</span><span
			data-tts-text={`HARMONY ${PRESETS[0].chords[0].name}`}>HARMONY <b>{chord.name}</b></span
		>
		<button
			class="focus-button"
			type="button"
			aria-pressed={focusView}
			disabled={navigationBusy}
			onclick={onToggleFocus}
			>{focusView ? 'Exit focus view' : 'Enter focus view'}
			<span aria-hidden="true">⤢</span></button
		>
	</div>
	<div
		class="piano-whisper"
		data-tts-text="Every note begins as a possibility.A POND, A PIANO, A SMALL ACT OF FORGIVENESS"
	>
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
	<div
		class="possibility-fan"
		aria-label="Actual note selection probabilities"
		data-tts-text="The possibilities appear when you play."
	>
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
	<div class="zone4-dock-container" bind:this={keybedRow}>
		<div class="zone4-keybed-row">
			<PerformanceBay
				{pitchBend}
				{modWheel}
				{glideMs}
				{baseGlideMs}
				{keyboardBase}
				{sustain}
				{dynamicVelocity}
				{qwertyVelocity}
				{chordMemory}
				paletteChord={chord}
				{onPitchBend}
				{onModWheel}
				{onGlideChange}
				{onShiftOctave}
				{onToggleSustain}
				{onToggleDynamicVelocity}
				{onQwertyVelocityChange}
				{onChordMemoryChange}
				{onPadDown}
				{onPadUp}
				{onPadPulse}
			/>
			<div
				class="keyboard-window"
				bind:this={keyboardWindow}
				role="group"
				aria-label="Playable piano, scroll sideways for more octaves"
				onscroll={onMeasure}
				onfocusout={(event) => {
					if (
						!(event.relatedTarget instanceof Node) ||
						!keyboardWindow?.contains(event.relatedTarget)
					) {
						onReleaseKeyboardNotes();
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
							onpointerdown={(event) => onPointerDownKey(event, key.pitch)}
							onpointermove={onPointerMoveKey}
							onpointerup={onPointerEndKey}
							onpointercancel={onPointerEndKey}
							onlostpointercapture={onPointerEndKey}
							onclick={(event) => {
								if (event.detail === 0) {
									onActivateKey(key.pitch);
								}
							}}
							><span class="key-pitch">{noteName(key.pitch)}</span><kbd
								>{shortcutFor(key.pitch)}</kbd
							></button
						>{/each}
				</div>
			</div>
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
				oninput={(event) => onNavigateOverview(Number(event.currentTarget.value))}
			/>
		</div>
	</div>
	<div class="keyboard-scroll-tools">
		<button type="button" disabled={navigationBusy} onclick={() => onNavigateOctave(-1)}
			>← Lower octave</button
		><button
			type="button"
			aria-pressed={view === 'fit'}
			disabled={navigationBusy || geometry.viewport < 1080}
			title={geometry.viewport < 1080
				? 'Use the overview to explore all 88 keys on a narrow screen.'
				: undefined}
			onclick={() => onChangeView('fit')}>Fit all 88 keys</button
		><button
			type="button"
			aria-pressed={view === 'playing'}
			disabled={navigationBusy}
			onclick={() => onChangeView('playing')}>Playing view</button
		><button
			type="button"
			disabled={navigationBusy}
			onclick={() => {
				focusedPitch = 60;
				onReturnMiddleC();
			}}>Return to middle C</button
		><button type="button" disabled={navigationBusy} onclick={() => onNavigateOctave(1)}
			>Higher octave →</button
		>
	</div>
	<div class="piano-world-bottom">
		<span>A SYNTHESISED PIANO · AN ORIGINAL PAINTING</span><span
			data-tts-text="STILL LIGHT / LOCAL & PRIVATE"
			>{still ? 'STILL LIGHT' : 'GENTLE LIGHT'} / LOCAL & PRIVATE</span
		>
	</div>
</div>
