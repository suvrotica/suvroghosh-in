<script lang="ts">
	import type { SynthAudio } from '$lib/visualizations/probabilistic-piano/audio';
	import type { MidiInputDevice } from '$lib/visualizations/probabilistic-piano/midi';
	import type {
		PatchCategory,
		SynthPatch,
		VoiceMode
	} from '$lib/visualizations/probabilistic-piano/synth-patch';
	import Knob from './Knob.svelte';
	import OledScope, { type ParamEcho } from './OledScope.svelte';

	interface Props {
		mounted: boolean;
		sound: boolean;
		starting: boolean;
		patch: SynthPatch;
		factoryPresets: readonly SynthPatch[];
		userPatches: readonly SynthPatch[];
		patchNameDraft: string;
		auditionCategory: PatchCategory | null;
		volume: number;
		visualMode: 'pond' | 'oled';
		still: boolean;
		visible: boolean;
		paramEcho: ParamEcho | null;
		activeChordName: string;
		voiceCount: number;
		audio: SynthAudio | undefined;
		midiSupported: boolean;
		midiConnected: boolean;
		midiInputs: readonly MidiInputDevice[];
		midiSelectedId: string | null;
		wavRecording: boolean;
		exportingWav: boolean;
		wavDownloadUrl: string | null;
		wavDownloadName: string;
		onEnableSound: () => void;
		onSelectPatch: (id: string) => void;
		onStepPatch: (dir: -1 | 1) => void;
		onPatchNameChange: (name: string) => void;
		onSavePatch: () => void;
		onSharePatch: () => void;
		onAuditionCategory: (category: 'Poly' | 'Lead' | 'Bass' | 'Pad') => void;
		onVoiceModeChange: (mode: VoiceMode) => void;
		onToggleMidi: () => void;
		onSelectMidiInput: (id: string) => void;
		onToggleRecWav: () => void;
		onVisualModeChange: (mode: 'pond' | 'oled') => void;
		onVolumeChange: (vol: number) => void;
		onStopAll: () => void;
	}

	let {
		mounted,
		sound,
		starting,
		patch,
		factoryPresets,
		userPatches,
		patchNameDraft,
		auditionCategory,
		volume,
		visualMode,
		still,
		visible,
		paramEcho,
		activeChordName,
		voiceCount,
		audio,
		midiSupported,
		midiConnected,
		midiInputs,
		midiSelectedId,
		wavRecording,
		exportingWav,
		wavDownloadUrl,
		wavDownloadName,
		onEnableSound,
		onSelectPatch,
		onStepPatch,
		onPatchNameChange,
		onSavePatch,
		onSharePatch,
		onAuditionCategory,
		onVoiceModeChange,
		onToggleMidi,
		onSelectMidiInput,
		onToggleRecWav,
		onVisualModeChange,
		onVolumeChange,
		onStopAll
	}: Props = $props();

	const hasKnownPatchId = $derived(
		factoryPresets.some((p) => p.id === patch.id) || userPatches.some((p) => p.id === patch.id)
	);
</script>

<div
	class="telemetry-bar"
	data-synth-telemetry
	role="region"
	aria-label="Telemetry and patch bar"
	data-tts-exclude
>
	<div class="telemetry-left">
		<button
			type="button"
			class="sound-button"
			disabled={!mounted || starting}
			onclick={onEnableSound}
		>
			{starting ? 'Opening sound…' : sound ? 'Sound enabled ✓' : 'Enable sound'}
			<span aria-hidden="true">↗</span>
		</button>

		<div class="patch-browser">
			<div class="patch-select-row">
				<button
					type="button"
					class="step-btn"
					aria-label="Previous patch"
					onclick={() => onStepPatch(-1)}
				>
					‹
				</button>
				<select
					aria-label="Patch preset"
					value={patch.id}
					onchange={(e) => onSelectPatch(e.currentTarget.value)}
				>
					{#if !hasKnownPatchId}
						<optgroup label="Loaded">
							<option value={patch.id}>{patch.name}</option>
						</optgroup>
					{/if}
					<optgroup label="Factory">
						{#each factoryPresets as preset (preset.id)}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</optgroup>
					{#if userPatches.length > 0}
						<optgroup label="User">
							{#each userPatches as preset (preset.id)}
								<option value={preset.id}>{preset.name}</option>
							{/each}
						</optgroup>
					{/if}
				</select>
				<button
					type="button"
					class="step-btn"
					aria-label="Next patch"
					onclick={() => onStepPatch(1)}
				>
					›
				</button>
			</div>

			<div class="patch-save-row">
				<input
					type="text"
					aria-label="Patch name"
					maxlength={48}
					value={patchNameDraft}
					oninput={(e) => onPatchNameChange(e.currentTarget.value)}
				/>
				<button type="button" class="pill-btn" onclick={onSavePatch}>Save patch</button>
				<button type="button" class="pill-btn" onclick={onSharePatch}>Share patch</button>
			</div>
		</div>

		<div class="telemetry-pills">
			<div class="audition-group" role="group" aria-label="Audition">
				{#each ['Poly', 'Lead', 'Bass', 'Pad'] as const as cat (cat)}
					<button
						type="button"
						class="pill-btn"
						aria-pressed={auditionCategory === cat}
						onclick={() => onAuditionCategory(cat)}
					>
						{cat}
					</button>
				{/each}
			</div>

			<label class="inline-select">
				<span>VOICE</span>
				<select
					aria-label="Voice mode"
					value={patch.voiceMode}
					onchange={(e) => onVoiceModeChange(e.currentTarget.value as VoiceMode)}
				>
					<option value="poly">Poly</option>
					<option value="mono">Mono</option>
					<option value="legato">Legato</option>
					<option value="unison">Unison</option>
				</select>
			</label>
		</div>
	</div>

	<div class="telemetry-center">
		<OledScope
			{audio}
			{sound}
			{patch}
			{still}
			{visible}
			{paramEcho}
			{activeChordName}
			{voiceCount}
		/>
	</div>

	<div class="telemetry-right">
		<div class="hardware-io">
			<button
				type="button"
				class="pill-btn"
				aria-label="MIDI"
				aria-pressed={midiConnected}
				title={midiSupported ? 'Connect Web MIDI controller' : 'Web MIDI unavailable in browser'}
				onclick={onToggleMidi}
			>
				MIDI
			</button>
			{#if midiInputs.length > 0}
				<select
					aria-label="MIDI input device"
					value={midiSelectedId ?? ''}
					onchange={(e) => onSelectMidiInput(e.currentTarget.value)}
				>
					{#each midiInputs as dev (dev.id)}
						<option value={dev.id}>{dev.name}</option>
					{/each}
				</select>
			{/if}

			<button
				type="button"
				class="pill-btn rec-btn"
				aria-label={wavRecording ? 'Rec WAV (Stop & Export)' : 'Rec WAV'}
				aria-pressed={wavRecording}
				disabled={exportingWav}
				onclick={onToggleRecWav}
			>
				{exportingWav ? 'Exporting…' : wavRecording ? 'Stop Rec / Export' : 'Rec WAV'}
			</button>

			{#if wavDownloadUrl}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="wav-download pill-btn" download={wavDownloadName} href={wavDownloadUrl}>
					Export WAV
				</a>
				<audio class="wav-preview" controls src={wavDownloadUrl}></audio>
			{/if}
		</div>

		<div class="visual-mode-group" role="group" aria-label="Visual mode">
			<button
				type="button"
				class="pill-btn"
				aria-pressed={visualMode === 'pond'}
				onclick={() => onVisualModeChange('pond')}
			>
				Ambient Pond
			</button>
			<button
				type="button"
				class="pill-btn"
				aria-pressed={visualMode === 'oled'}
				onclick={() => onVisualModeChange('oled')}
			>
				OLED Focus
			</button>
		</div>

		<div class="telemetry-master">
			<Knob
				label="Master volume"
				value={volume}
				min={0}
				max={0.8}
				step={0.01}
				defaultValue={0.45}
				accent="amber"
				format={(v) => `${Math.round((v / 0.8) * 100)}%`}
				onchange={onVolumeChange}
			/>
			<button type="button" class="stop-button" onclick={onStopAll}>
				<span aria-hidden="true">■</span>
				<span>Stop all sound</span>
			</button>
		</div>
	</div>
</div>
