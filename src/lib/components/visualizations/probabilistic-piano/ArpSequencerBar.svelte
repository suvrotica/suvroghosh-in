<script lang="ts">
	import type {
		ArpDivision,
		ArpEngine,
		ArpMode,
		ArpSeqConfig,
		SeqStep
	} from '$lib/visualizations/probabilistic-piano/synth-patch';
	import Knob from './Knob.svelte';

	interface Props {
		arpSeq: ArpSeqConfig;
		baseArpSeq: ArpSeqConfig;
		running: boolean;
		displayStep: number;
		selectedStep: number;
		stepRec: boolean;
		onTogglePlay: () => void;
		onTapTempo: () => void;
		onSelectAndToggleStep: (index: number) => void;
		onUpdateArpSeq: (
			partial: Partial<ArpSeqConfig>,
			echo?: { label: string; valueText: string }
		) => void;
		onUpdateStep: (
			index: number,
			partial: Partial<SeqStep>,
			echo?: { label: string; valueText: string }
		) => void;
		onToggleStepRec: () => void;
	}

	let {
		arpSeq,
		baseArpSeq,
		running,
		displayStep,
		selectedStep,
		stepRec,
		onTogglePlay,
		onTapTempo,
		onSelectAndToggleStep,
		onUpdateArpSeq,
		onUpdateStep,
		onToggleStepRec
	}: Props = $props();

	const activeStep = $derived(arpSeq.steps[selectedStep] ?? arpSeq.steps[0]);
	const formatPct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<div
	class="arp-seq-bar synth-card"
	data-synth-arp
	data-arp-sequencer
	role="region"
	aria-label="Arp and 16-step sequencer"
	data-tts-exclude
>
	<div class="arp-transport-row">
		<div class="arp-title-cluster">
			<span class="module-title">ARP / 16-STEP SEQ</span>
			<button type="button" class="pill-btn play-btn" aria-pressed={running} onclick={onTogglePlay}>
				{running ? 'Stop' : 'Play'}
			</button>
			<button type="button" class="pill-btn" onclick={onTapTempo}>Tap</button>
		</div>

		<Knob
			label="BPM"
			value={arpSeq.bpm}
			min={40}
			max={220}
			step={1}
			defaultValue={baseArpSeq.bpm}
			format={(v) => `${Math.round(v)}`}
			onchange={(v) =>
				onUpdateArpSeq({ bpm: Math.round(v) }, { label: 'BPM', valueText: `${Math.round(v)}` })}
		/>

		<label class="compact-field">
			<span>ENGINE</span>
			<select
				aria-label="Arp Engine"
				value={arpSeq.engine}
				onchange={(e) => onUpdateArpSeq({ engine: e.currentTarget.value as ArpEngine })}
			>
				<option value="off">Off</option>
				<option value="arp">Arp</option>
				<option value="seq">Seq</option>
			</select>
		</label>

		<label class="compact-field">
			<span>MODE</span>
			<select
				aria-label="Arp mode"
				value={arpSeq.arpMode}
				onchange={(e) => onUpdateArpSeq({ arpMode: e.currentTarget.value as ArpMode })}
			>
				<option value="up">Up</option>
				<option value="down">Down</option>
				<option value="up-down">Up+Down</option>
				<option value="random">Random</option>
				<option value="chord">Chord</option>
				<option value="order">Order</option>
			</select>
		</label>

		<label class="compact-field">
			<span>OCT</span>
			<select
				aria-label="Arp Octaves"
				value={String(arpSeq.octaves)}
				onchange={(e) => onUpdateArpSeq({ octaves: Number(e.currentTarget.value) as 1 | 2 | 3 })}
			>
				<option value="1">1</option>
				<option value="2">2</option>
				<option value="3">3</option>
			</select>
		</label>

		<label class="compact-field">
			<span>DIV</span>
			<select
				aria-label="Arp Division"
				value={arpSeq.division}
				onchange={(e) => onUpdateArpSeq({ division: e.currentTarget.value as ArpDivision })}
			>
				<option value="1/4">1/4</option>
				<option value="1/8">1/8</option>
				<option value="1/8t">1/8t</option>
				<option value="1/16">1/16</option>
				<option value="1/16t">1/16t</option>
				<option value="1/32">1/32</option>
			</select>
		</label>

		<Knob
			label="Arp Gate"
			value={arpSeq.gate}
			min={0.05}
			max={1}
			step={0.01}
			defaultValue={baseArpSeq.gate}
			format={formatPct}
			onchange={(v) => onUpdateArpSeq({ gate: v }, { label: 'Arp Gate', valueText: formatPct(v) })}
		/>

		<Knob
			label="Arp Swing"
			value={Math.round(arpSeq.swing * 100)}
			min={0}
			max={100}
			step={1}
			defaultValue={Math.round(baseArpSeq.swing * 100)}
			accent="cyan"
			format={(v) => `${Math.round(v)}%`}
			onchange={(v) =>
				onUpdateArpSeq({ swing: v / 100 }, { label: 'Swing', valueText: `${Math.round(v)}%` })}
		/>

		<div class="arp-toggles">
			<button
				type="button"
				class="pill-btn"
				aria-label="Arp Hold Latch"
				aria-pressed={arpSeq.hold}
				onclick={() => onUpdateArpSeq({ hold: !arpSeq.hold })}
			>
				Latch
			</button>
			<button
				type="button"
				class="pill-btn rec-btn"
				aria-pressed={stepRec}
				onclick={onToggleStepRec}
			>
				Step Rec
			</button>
		</div>
	</div>

	<div class="arp-steps-row">
		<div class="step-ribbon" role="group" aria-label="16-step sequence">
			{#each arpSeq.steps as step, index (index)}
				{@const isCurrent = running && displayStep === index}
				<button
					type="button"
					class="step-led"
					class:active={step.active}
					class:current={isCurrent}
					class:selected={selectedStep === index}
					class:accent={step.accent}
					data-step-index={index}
					data-current={isCurrent ? 'true' : 'false'}
					aria-current={isCurrent ? 'step' : undefined}
					aria-label={`Step ${index + 1}`}
					aria-pressed={step.active}
					onclick={() => onSelectAndToggleStep(index)}
				>
					<span>{index + 1}</span>
				</button>
			{/each}
		</div>

		<div class="step-editor" role="group" aria-label={`Step ${selectedStep + 1} editor`}>
			<span class="step-editor-badge">STEP {selectedStep + 1}</span>
			<Knob
				label="Step Note Offset"
				value={activeStep.noteOffset}
				min={-24}
				max={24}
				step={1}
				defaultValue={0}
				accent="cyan"
				format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`}
				onchange={(v) =>
					onUpdateStep(
						selectedStep,
						{ noteOffset: Math.round(v) },
						{ label: `Step ${selectedStep + 1} Note`, valueText: `${Math.round(v)} st` }
					)}
			/>
			<Knob
				label="Step Gate"
				value={activeStep.gate}
				min={0.05}
				max={1}
				step={0.01}
				defaultValue={0.8}
				format={formatPct}
				onchange={(v) =>
					onUpdateStep(
						selectedStep,
						{ gate: v },
						{ label: `Step ${selectedStep + 1} Gate`, valueText: formatPct(v) }
					)}
			/>
			<button
				type="button"
				class="pill-btn"
				aria-pressed={activeStep.accent}
				onclick={() => onUpdateStep(selectedStep, { accent: !activeStep.accent })}
			>
				Accent
			</button>
			<button
				type="button"
				class="pill-btn"
				aria-pressed={activeStep.tie}
				onclick={() => onUpdateStep(selectedStep, { tie: !activeStep.tie })}
			>
				Tie
			</button>
		</div>
	</div>
</div>
