<script lang="ts">
	import type {
		AdsrConfig,
		FilterType,
		LfoConfig,
		LfoWave,
		NoiseType,
		Osc1Wave,
		Osc2Wave,
		OscOctave,
		SubOctave,
		SubWave,
		SynthPatch
	} from '$lib/visualizations/probabilistic-piano/synth-patch';
	import Knob from './Knob.svelte';
	import ModMatrix from './ModMatrix.svelte';
	import VerticalFader from './VerticalFader.svelte';

	interface Props {
		patch: SynthPatch;
		basePreset: SynthPatch;
		heldCount: number;
		onUpdatePatch: (next: SynthPatch, echo?: { label: string; valueText: string }) => void;
	}

	let { patch, basePreset, heldCount, onUpdatePatch }: Props = $props();

	let envTab = $state<'amp' | 'filter'>('amp');

	const hasActiveMod = $derived(
		patch.modMatrix.some((row) => row.some((val) => Math.abs(val) > 0.004))
	);
	const activeEnv = $derived(envTab === 'amp' ? patch.ampEnv : patch.filterEnv);
	const baseEnv = $derived(envTab === 'amp' ? basePreset.ampEnv : basePreset.filterEnv);

	const formatHz = (hz: number) =>
		hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
	const formatMsOrSec = (sec: number) =>
		sec < 1 ? `${Math.round(sec * 1000)} ms` : `${sec.toFixed(2)} s`;
	const formatPct = (v: number) => `${Math.round(v)}%`;

	function updateEnv(field: keyof AdsrConfig, val: number, label: string, valueText: string) {
		onUpdatePatch(
			{
				...patch,
				ampEnv: envTab === 'amp' ? { ...patch.ampEnv, [field]: val } : patch.ampEnv,
				filterEnv: envTab === 'filter' ? { ...patch.filterEnv, [field]: val } : patch.filterEnv
			},
			{ label, valueText }
		);
	}

	function updateLfo(
		which: 'lfo1' | 'lfo2',
		partial: Partial<LfoConfig>,
		echo?: { label: string; valueText: string }
	) {
		onUpdatePatch(
			{
				...patch,
				[which]: { ...patch[which], ...partial }
			},
			echo
		);
	}
</script>

<div
	class="control-deck"
	data-synth-deck
	role="region"
	aria-label="Synthesis control deck"
	data-tts-exclude
>
	<svg
		class="pcb-traces"
		class:active-audio={heldCount > 0}
		class:active-mod={hasActiveMod}
		viewBox="0 0 1200 220"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path class="trace-audio" d="M 160 40 L 290 40 L 310 60 L 420 60 L 560 60 L 760 60" />
		<path class="trace-mod" d="M 960 175 L 820 175 L 800 135 L 540 135 L 220 135" />
		<circle class="trace-node" cx="290" cy="40" r="2.5" />
		<circle class="trace-node" cx="560" cy="60" r="2.5" />
		<circle class="trace-node mod" cx="800" cy="135" r="2.5" />
	</svg>

	<!-- Module 1: Osc 1 & 2 + Sub/Noise -->
	<section class="synth-card osc-card" data-deck-group="osc-mix" aria-label="Oscillators">
		<div class="module-head">
			<span class="module-title">OSC 1 &amp; 2 · SUB · NOISE</span>
			<span class="jewel-led" class:lit={heldCount > 0} aria-hidden="true"></span>
		</div>

		<div class="osc-row">
			<div class="osc-selects">
				<label class="compact-field">
					<span>OSC 1</span>
					<select
						aria-label="Osc 1 wave"
						value={patch.osc1.wave}
						onchange={(e) =>
							onUpdatePatch(
								{ ...patch, osc1: { ...patch.osc1, wave: e.currentTarget.value as Osc1Wave } },
								{ label: 'Osc 1 Wave', valueText: e.currentTarget.value }
							)}
					>
						<option value="saw">Saw</option>
						<option value="pwm">PWM</option>
						<option value="tri">Tri</option>
						<option value="sine">Sine</option>
						<option value="supersaw">Supersaw</option>
						<option value="fm">2-Op FM</option>
						<option value="harmonic">Harmonic</option>
						<option value="5-partial">5-Partial</option>
					</select>
				</label>
				<label class="compact-field">
					<span>OCT</span>
					<select
						aria-label="Osc 1 Oct"
						value={String(patch.osc1.oct)}
						onchange={(e) =>
							onUpdatePatch({
								...patch,
								osc1: { ...patch.osc1, oct: Number(e.currentTarget.value) as OscOctave }
							})}
					>
						<option value="-1">16'</option>
						<option value="0">8'</option>
						<option value="1">4'</option>
						<option value="2">2'</option>
					</select>
				</label>
			</div>
			<div class="knob-row">
				<Knob
					label="Osc 1 Semi"
					value={patch.osc1.semi}
					min={-12}
					max={12}
					step={1}
					defaultValue={basePreset.osc1.semi}
					format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc1: { ...patch.osc1, semi: v } },
							{ label: 'Osc 1 Semi', valueText: `${Math.round(v)} st` }
						)}
				/>
				<Knob
					label="Osc 1 Fine"
					value={patch.osc1.fine}
					min={-50}
					max={50}
					step={1}
					defaultValue={basePreset.osc1.fine}
					format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc1: { ...patch.osc1, fine: v } },
							{ label: 'Osc 1 Fine', valueText: `${Math.round(v)} ct` }
						)}
				/>
				<Knob
					label="Osc 1 Shape"
					value={Math.round(patch.osc1.shape * 100)}
					min={0}
					max={100}
					step={1}
					defaultValue={Math.round(basePreset.osc1.shape * 100)}
					format={formatPct}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc1: { ...patch.osc1, shape: v / 100 } },
							{ label: 'Osc 1 Shape', valueText: formatPct(v) }
						)}
				/>
				<Knob
					label="FM Ratio"
					value={patch.osc1.fmRatio}
					min={0.5}
					max={8}
					step={0.1}
					defaultValue={basePreset.osc1.fmRatio}
					accent="cyan"
					format={(v) => `${v.toFixed(1)}×`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc1: { ...patch.osc1, fmRatio: v } },
							{ label: 'FM Ratio', valueText: `${v.toFixed(1)}×` }
						)}
				/>
			</div>
		</div>

		<div class="osc-row">
			<div class="osc-selects">
				<label class="compact-field">
					<span>OSC 2</span>
					<select
						aria-label="Osc 2 wave"
						value={patch.osc2.wave}
						onchange={(e) =>
							onUpdatePatch(
								{ ...patch, osc2: { ...patch.osc2, wave: e.currentTarget.value as Osc2Wave } },
								{ label: 'Osc 2 Wave', valueText: e.currentTarget.value }
							)}
					>
						<option value="saw">Saw</option>
						<option value="pwm">PWM</option>
						<option value="tri">Tri</option>
						<option value="sine">Sine</option>
					</select>
				</label>
				<label class="compact-field">
					<span>OCT</span>
					<select
						aria-label="Osc 2 Oct"
						value={String(patch.osc2.oct)}
						onchange={(e) =>
							onUpdatePatch({
								...patch,
								osc2: { ...patch.osc2, oct: Number(e.currentTarget.value) as OscOctave }
							})}
					>
						<option value="-1">16'</option>
						<option value="0">8'</option>
						<option value="1">4'</option>
						<option value="2">2'</option>
					</select>
				</label>
				<button
					type="button"
					class="pill-btn ring-btn"
					aria-pressed={patch.osc2.ringMod}
					onclick={() =>
						onUpdatePatch(
							{ ...patch, osc2: { ...patch.osc2, ringMod: !patch.osc2.ringMod } },
							{ label: 'Ring Mod', valueText: !patch.osc2.ringMod ? 'ON' : 'OFF' }
						)}
				>
					Ring Mod
				</button>
			</div>
			<div class="knob-row">
				<Knob
					label="Osc 2 Semi"
					value={patch.osc2.semi}
					min={-12}
					max={12}
					step={1}
					defaultValue={basePreset.osc2.semi}
					format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc2: { ...patch.osc2, semi: v } },
							{ label: 'Osc 2 Semi', valueText: `${Math.round(v)} st` }
						)}
				/>
				<Knob
					label="Osc 2 Fine"
					value={patch.osc2.fine}
					min={-50}
					max={50}
					step={1}
					defaultValue={basePreset.osc2.fine}
					format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc2: { ...patch.osc2, fine: v } },
							{ label: 'Osc 2 Fine', valueText: `${Math.round(v)} ct` }
						)}
				/>
				<Knob
					label="Osc 2 Shape"
					value={Math.round(patch.osc2.shape * 100)}
					min={0}
					max={100}
					step={1}
					defaultValue={Math.round(basePreset.osc2.shape * 100)}
					format={formatPct}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, osc2: { ...patch.osc2, shape: v / 100 } },
							{ label: 'Osc 2 Shape', valueText: formatPct(v) }
						)}
				/>
			</div>
		</div>

		<div class="sub-noise-row">
			<label class="compact-field">
				<span>SUB OCT</span>
				<select
					aria-label="Sub Oct"
					value={String(patch.sub.oct)}
					onchange={(e) =>
						onUpdatePatch({
							...patch,
							sub: { ...patch.sub, oct: Number(e.currentTarget.value) as SubOctave }
						})}
				>
					<option value="-1">-1 Oct</option>
					<option value="-2">-2 Oct</option>
				</select>
			</label>
			<label class="compact-field">
				<span>SUB WAVE</span>
				<select
					aria-label="Sub Wave"
					value={patch.sub.wave}
					onchange={(e) =>
						onUpdatePatch({
							...patch,
							sub: { ...patch.sub, wave: e.currentTarget.value as SubWave }
						})}
				>
					<option value="sine">Sine</option>
					<option value="square">Square</option>
				</select>
			</label>
			<label class="compact-field">
				<span>NOISE</span>
				<select
					aria-label="Noise Type"
					value={patch.noise.type}
					onchange={(e) =>
						onUpdatePatch({
							...patch,
							noise: { type: e.currentTarget.value as NoiseType }
						})}
				>
					<option value="white">White</option>
					<option value="pink">Pink</option>
				</select>
			</label>
		</div>
	</section>

	<!-- Module 2: 4-Ch Source Mixer -->
	<section
		class="synth-card mixer-card"
		data-deck-group="osc-mix"
		aria-label="4-Channel Source Mixer"
	>
		<div class="module-head">
			<span class="module-title">SRC MIX</span>
		</div>
		<div class="fader-bank">
			<VerticalFader
				label="Osc 1 Mix"
				value={patch.mix.osc1}
				min={0}
				max={1}
				step={0.01}
				defaultValue={basePreset.mix.osc1}
				format={(v) => `${Math.round(v * 100)}%`}
				onchange={(v) =>
					onUpdatePatch(
						{ ...patch, mix: { ...patch.mix, osc1: v } },
						{ label: 'Osc 1 Mix', valueText: `${Math.round(v * 100)}%` }
					)}
			/>
			<VerticalFader
				label="Osc 2 Mix"
				value={patch.mix.osc2}
				min={0}
				max={1}
				step={0.01}
				defaultValue={basePreset.mix.osc2}
				format={(v) => `${Math.round(v * 100)}%`}
				onchange={(v) =>
					onUpdatePatch(
						{ ...patch, mix: { ...patch.mix, osc2: v } },
						{ label: 'Osc 2 Mix', valueText: `${Math.round(v * 100)}%` }
					)}
			/>
			<VerticalFader
				label="Sub Mix"
				value={patch.mix.sub}
				min={0}
				max={1}
				step={0.01}
				defaultValue={basePreset.mix.sub}
				format={(v) => `${Math.round(v * 100)}%`}
				onchange={(v) =>
					onUpdatePatch(
						{ ...patch, mix: { ...patch.mix, sub: v } },
						{ label: 'Sub Mix', valueText: `${Math.round(v * 100)}%` }
					)}
			/>
			<VerticalFader
				label="Noise Mix"
				value={patch.mix.noise}
				min={0}
				max={1}
				step={0.01}
				defaultValue={basePreset.mix.noise}
				accent="cyan"
				format={(v) => `${Math.round(v * 100)}%`}
				onchange={(v) =>
					onUpdatePatch(
						{ ...patch, mix: { ...patch.mix, noise: v } },
						{ label: 'Noise Mix', valueText: `${Math.round(v * 100)}%` }
					)}
			/>
		</div>
	</section>

	<!-- Module 3: Multimode Filter -->
	<section
		class="synth-card filter-card"
		data-deck-group="filter-env"
		aria-label="Multimode Filter"
	>
		<div class="module-head">
			<span class="module-title">MULTIMODE FILTER</span>
			<div class="filter-modes" role="group" aria-label="Filter mode">
				{#each [['lp12', 'LP12'], ['lp24', 'LP24'], ['bp12', 'BP12'], ['hp12', 'HP12']] as const as [val, label] (val)}
					<button
						type="button"
						class="pill-btn"
						aria-pressed={patch.filter.type === val}
						onclick={() =>
							onUpdatePatch(
								{ ...patch, filter: { ...patch.filter, type: val as FilterType } },
								{ label: 'Filter Mode', valueText: label }
							)}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		<div class="filter-body">
			<div class="hero-cutoff-wrap">
				<Knob
					label="Filter Cutoff"
					value={patch.filter.cutoffHz}
					min={20}
					max={18000}
					defaultValue={basePreset.filter.cutoffHz}
					curve="log"
					accent="amber"
					hero={true}
					format={formatHz}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, filter: { ...patch.filter, cutoffHz: v } },
							{ label: 'Filter Cutoff', valueText: formatHz(v) }
						)}
				/>
			</div>
			<div class="filter-knobs">
				<Knob
					label="Filter Resonance"
					value={patch.filter.resonance}
					min={0.5}
					max={20}
					defaultValue={basePreset.filter.resonance}
					curve="log"
					format={(v) => `Q ${v.toFixed(2)}`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, filter: { ...patch.filter, resonance: v } },
							{ label: 'Filter Resonance', valueText: `Q ${v.toFixed(2)}` }
						)}
				/>
				<Knob
					label="Pre-Drive"
					value={Math.round(patch.filter.drive * 100)}
					min={0}
					max={100}
					step={1}
					defaultValue={Math.round(basePreset.filter.drive * 100)}
					format={formatPct}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, filter: { ...patch.filter, drive: v / 100 } },
							{ label: 'Pre-Drive', valueText: formatPct(v) }
						)}
				/>
				<Knob
					label="Env Amt"
					value={Math.round(patch.filter.envAmt * 100)}
					min={-100}
					max={100}
					step={1}
					defaultValue={Math.round(basePreset.filter.envAmt * 100)}
					accent="cyan"
					format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, filter: { ...patch.filter, envAmt: v / 100 } },
							{ label: 'Env Amt', valueText: `${v > 0 ? '+' : ''}${Math.round(v)}%` }
						)}
				/>
				<Knob
					label="Key Track"
					value={Math.round(patch.filter.keyTrack * 100)}
					min={0}
					max={100}
					step={1}
					defaultValue={Math.round(basePreset.filter.keyTrack * 100)}
					accent="cyan"
					format={formatPct}
					onchange={(v) =>
						onUpdatePatch(
							{ ...patch, filter: { ...patch.filter, keyTrack: v / 100 } },
							{ label: 'Key Track', valueText: formatPct(v) }
						)}
				/>
			</div>
		</div>
	</section>

	<!-- Module 4: Dual ADSR & LFO 1/2 -->
	<section
		class="synth-card env-lfo-card"
		data-deck-group="filter-env"
		aria-label="Envelopes and LFOs"
	>
		<div class="module-head">
			<span class="module-title">DUAL ADSR &amp; LFO 1/2</span>
			<div class="env-switch" role="group" aria-label="Envelope select">
				<button
					type="button"
					class="pill-btn"
					aria-pressed={envTab === 'amp'}
					onclick={() => (envTab = 'amp')}
				>
					Amp
				</button>
				<button
					type="button"
					class="pill-btn"
					aria-pressed={envTab === 'filter'}
					onclick={() => (envTab = 'filter')}
				>
					Filter
				</button>
			</div>
		</div>

		<div class="env-lfo-body">
			<div class="fader-bank env-faders">
				<VerticalFader
					label="Attack"
					value={activeEnv.attack}
					min={0.002}
					max={4}
					defaultValue={baseEnv.attack}
					curve="log"
					format={formatMsOrSec}
					onchange={(v) =>
						updateEnv(
							'attack',
							v,
							`${envTab === 'amp' ? 'Amp' : 'Filter'} Attack`,
							formatMsOrSec(v)
						)}
				/>
				<VerticalFader
					label="Decay"
					value={activeEnv.decay}
					min={0.01}
					max={6}
					defaultValue={baseEnv.decay}
					curve="log"
					format={formatMsOrSec}
					onchange={(v) =>
						updateEnv('decay', v, `${envTab === 'amp' ? 'Amp' : 'Filter'} Decay`, formatMsOrSec(v))}
				/>
				<VerticalFader
					label="Sustain"
					value={activeEnv.sustain}
					min={0}
					max={1}
					step={0.01}
					defaultValue={baseEnv.sustain}
					format={(v) => `${Math.round(v * 100)}%`}
					onchange={(v) =>
						updateEnv(
							'sustain',
							v,
							`${envTab === 'amp' ? 'Amp' : 'Filter'} Sustain`,
							`${Math.round(v * 100)}%`
						)}
				/>
				<VerticalFader
					label="Release"
					value={activeEnv.release}
					min={0.015}
					max={6}
					defaultValue={baseEnv.release}
					curve="log"
					format={formatMsOrSec}
					onchange={(v) =>
						updateEnv(
							'release',
							v,
							`${envTab === 'amp' ? 'Amp' : 'Filter'} Release`,
							formatMsOrSec(v)
						)}
				/>
			</div>

			<div class="lfo-stack">
				{#each [['lfo1', 'LFO 1', patch.lfo1, basePreset.lfo1], ['lfo2', 'LFO 2', patch.lfo2, basePreset.lfo2]] as const as [key, title, lfo, baseLfo] (key)}
					<div class="lfo-unit">
						<div class="lfo-top">
							<label class="compact-field">
								<span>{title}</span>
								<select
									aria-label={`${title} Wave`}
									value={lfo.wave}
									onchange={(e) =>
										updateLfo(
											key,
											{ wave: e.currentTarget.value as LfoWave },
											{
												label: `${title} Wave`,
												valueText: e.currentTarget.value
											}
										)}
								>
									<option value="sine">Sine</option>
									<option value="tri">Tri</option>
									<option value="saw">Saw</option>
									<option value="square">Square</option>
									<option value="sh">S&amp;H</option>
								</select>
							</label>
							<button
								type="button"
								class="pill-btn"
								aria-label={`${title} BPM Sync`}
								aria-pressed={lfo.bpmSync}
								onclick={() => updateLfo(key, { bpmSync: !lfo.bpmSync })}
							>
								BPM
							</button>
							<button
								type="button"
								class="pill-btn"
								aria-label={`${title} Key Sync`}
								aria-pressed={lfo.keySync}
								onclick={() => updateLfo(key, { keySync: !lfo.keySync })}
							>
								Key
							</button>
						</div>
						<div class="lfo-knobs">
							<Knob
								label={`${title} Rate`}
								value={lfo.rateHz}
								min={0.05}
								max={25}
								defaultValue={baseLfo.rateHz}
								curve="log"
								accent="cyan"
								format={(v) => `${v.toFixed(2)} Hz`}
								onchange={(v) =>
									updateLfo(
										key,
										{ rateHz: v },
										{ label: `${title} Rate`, valueText: `${v.toFixed(2)} Hz` }
									)}
							/>
							<Knob
								label={`${title} Depth`}
								value={Math.round(lfo.depth * 100)}
								min={0}
								max={100}
								step={1}
								defaultValue={Math.round(baseLfo.depth * 100)}
								accent="cyan"
								format={formatPct}
								onchange={(v) =>
									updateLfo(
										key,
										{ depth: v / 100 },
										{ label: `${title} Depth`, valueText: formatPct(v) }
									)}
							/>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Module 5: 5x5 Mod Matrix -->
	<ModMatrix
		modMatrix={patch.modMatrix}
		onChangeCell={(row, col, depth) => {
			const nextMatrix = patch.modMatrix.map((r, rIdx) =>
				rIdx === row ? r.map((v, cIdx) => (cIdx === col ? depth : v)) : [...r]
			) as SynthPatch['modMatrix'];
			onUpdatePatch(
				{ ...patch, modMatrix: nextMatrix },
				{ label: 'Mod Depth', valueText: `${depth > 0 ? '+' : ''}${Math.round(depth * 100)}%` }
			);
		}}
	/>
</div>
