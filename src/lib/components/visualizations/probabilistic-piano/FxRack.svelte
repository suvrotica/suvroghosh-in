<script lang="ts">
	import type { FxConfig, ReverbRoom } from '$lib/visualizations/probabilistic-piano/synth-patch';
	import Knob from './Knob.svelte';

	interface Props {
		fx: FxConfig;
		baseFx: FxConfig;
		onUpdateFx: (nextFx: FxConfig, echo?: { label: string; valueText: string }) => void;
	}

	let { fx, baseFx, onUpdateFx }: Props = $props();

	const formatPct = (v: number) => `${Math.round(v)}%`;
	const formatHz = (hz: number) =>
		hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
</script>

<div
	class="fx-rack"
	data-synth-fx
	data-fx-rack
	role="region"
	aria-label="Master FX rack"
	data-tts-exclude
>
	<!-- 1. Chorus (#38BDF8) -->
	<section class="synth-card fx-card" data-fx-accent="cyan" aria-label="Chorus">
		<div class="module-head">
			<span class="module-title">CHORUS</span>
			<button
				type="button"
				class="pill-btn bypass-btn"
				aria-label="Chorus Bypass"
				aria-pressed={fx.chorus.bypass}
				onclick={() => onUpdateFx({ ...fx, chorus: { ...fx.chorus, bypass: !fx.chorus.bypass } })}
			>
				{fx.chorus.bypass ? 'Bypassed' : 'Active'}
			</button>
		</div>
		<div class="knob-row">
			<Knob
				label="Chorus Rate"
				value={fx.chorus.rateHz}
				min={0.1}
				max={5}
				step={0.05}
				defaultValue={baseFx.chorus.rateHz}
				accent="cyan"
				format={(v) => `${v.toFixed(2)} Hz`}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, chorus: { ...fx.chorus, rateHz: v } },
						{ label: 'Chorus Rate', valueText: `${v.toFixed(2)} Hz` }
					)}
			/>
			<Knob
				label="Chorus Depth"
				value={Math.round(fx.chorus.depth * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.chorus.depth * 100)}
				accent="cyan"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, chorus: { ...fx.chorus, depth: v / 100 } },
						{ label: 'Chorus Depth', valueText: formatPct(v) }
					)}
			/>
			<Knob
				label="Chorus Mix"
				value={Math.round(fx.chorus.mix * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.chorus.mix * 100)}
				accent="cyan"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, chorus: { ...fx.chorus, mix: v / 100 } },
						{ label: 'Chorus Mix', valueText: formatPct(v) }
					)}
			/>
		</div>
	</section>

	<!-- 2. Bit-Depth Crush & Drive (#FF8A1E) -->
	<section class="synth-card fx-card" data-fx-accent="amber" aria-label="Bit-Depth Crush and Drive">
		<div class="module-head">
			<span class="module-title">CRUSH &amp; DRIVE</span>
			<button
				type="button"
				class="pill-btn bypass-btn"
				aria-label="Crush Bypass"
				aria-pressed={fx.crush.bypass}
				onclick={() => onUpdateFx({ ...fx, crush: { ...fx.crush, bypass: !fx.crush.bypass } })}
			>
				{fx.crush.bypass ? 'Bypassed' : 'Active'}
			</button>
		</div>
		<div class="knob-row">
			<Knob
				label="Crush Drive"
				value={Math.round(fx.crush.drive * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.crush.drive * 100)}
				accent="amber"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, crush: { ...fx.crush, drive: v / 100 } },
						{ label: 'Crush Drive', valueText: formatPct(v) }
					)}
			/>
			<Knob
				label="Bit Depth"
				value={fx.crush.bitDepth}
				min={3}
				max={16}
				step={1}
				defaultValue={baseFx.crush.bitDepth}
				accent="amber"
				format={(v) => `${Math.round(v)}-bit`}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, crush: { ...fx.crush, bitDepth: Math.round(v) } },
						{ label: 'Bit Depth', valueText: `${Math.round(v)}-bit` }
					)}
			/>
			<Knob
				label="Crush Tone"
				value={fx.crush.toneHz}
				min={400}
				max={16000}
				defaultValue={baseFx.crush.toneHz}
				curve="log"
				accent="amber"
				format={formatHz}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, crush: { ...fx.crush, toneHz: v } },
						{ label: 'Crush Tone', valueText: formatHz(v) }
					)}
			/>
			<Knob
				label="Crush Mix"
				value={Math.round(fx.crush.mix * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.crush.mix * 100)}
				accent="amber"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, crush: { ...fx.crush, mix: v / 100 } },
						{ label: 'Crush Mix', valueText: formatPct(v) }
					)}
			/>
		</div>
	</section>

	<!-- 3. Stereo Multi-Delay (#38BDF8) -->
	<section class="synth-card fx-card" data-fx-accent="cyan" aria-label="Stereo Multi-Delay">
		<div class="module-head">
			<span class="module-title">MULTI-DELAY</span>
			<div class="fx-btn-group">
				<button
					type="button"
					class="pill-btn"
					aria-label="Delay BPM Sync"
					aria-pressed={fx.delay.bpmSync}
					onclick={() => onUpdateFx({ ...fx, delay: { ...fx.delay, bpmSync: !fx.delay.bpmSync } })}
				>
					BPM
				</button>
				<button
					type="button"
					class="pill-btn bypass-btn"
					aria-label="Delay Bypass"
					aria-pressed={fx.delay.bypass}
					onclick={() => onUpdateFx({ ...fx, delay: { ...fx.delay, bypass: !fx.delay.bypass } })}
				>
					{fx.delay.bypass ? 'Bypassed' : 'Active'}
				</button>
			</div>
		</div>
		<div class="knob-row">
			<Knob
				label="Delay Time"
				value={fx.delay.timeMs}
				min={40}
				max={900}
				step={1}
				defaultValue={baseFx.delay.timeMs}
				accent="cyan"
				format={(v) => `${Math.round(v)} ms`}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, delay: { ...fx.delay, timeMs: Math.round(v) } },
						{ label: 'Delay Time', valueText: `${Math.round(v)} ms` }
					)}
			/>
			<Knob
				label="Delay Feedback"
				value={fx.delay.feedback}
				min={0}
				max={0.88}
				step={0.01}
				defaultValue={baseFx.delay.feedback}
				accent="cyan"
				format={(v) => `${Math.round(v * 100)}%`}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, delay: { ...fx.delay, feedback: v } },
						{ label: 'Delay Feedback', valueText: `${Math.round(v * 100)}%` }
					)}
			/>
			<Knob
				label="Delay Tone"
				value={fx.delay.toneHz}
				min={400}
				max={16000}
				defaultValue={baseFx.delay.toneHz}
				curve="log"
				accent="cyan"
				format={formatHz}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, delay: { ...fx.delay, toneHz: v } },
						{ label: 'Delay Tone', valueText: formatHz(v) }
					)}
			/>
			<Knob
				label="Delay Mix"
				value={Math.round(fx.delay.mix * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.delay.mix * 100)}
				accent="cyan"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, delay: { ...fx.delay, mix: v / 100 } },
						{ label: 'Delay Mix', valueText: formatPct(v) }
					)}
			/>
		</div>
	</section>

	<!-- 4. Procedural Reverb (#E5E7EB) -->
	<section class="synth-card fx-card" data-fx-accent="silver" aria-label="Reverb">
		<div class="module-head">
			<span class="module-title">REVERB</span>
		</div>
		<div class="reverb-body">
			<label class="compact-field">
				<span>ROOM</span>
				<select
					aria-label="Reverb Room"
					value={fx.reverb.room}
					onchange={(e) =>
						onUpdateFx(
							{ ...fx, reverb: { ...fx.reverb, room: e.currentTarget.value as ReverbRoom } },
							{ label: 'Reverb Room', valueText: e.currentTarget.value }
						)}
				>
					<option value="off">Off</option>
					<option value="room">Room</option>
					<option value="studio">Studio</option>
					<option value="chamber">Chamber</option>
					<option value="hall">Hall</option>
					<option value="canyon">Canyon</option>
				</select>
			</label>
			<Knob
				label="Reverb Mix"
				value={Math.round(fx.reverb.mix * 100)}
				min={0}
				max={100}
				step={1}
				defaultValue={Math.round(baseFx.reverb.mix * 100)}
				accent="neutral"
				format={formatPct}
				onchange={(v) =>
					onUpdateFx(
						{ ...fx, reverb: { ...fx.reverb, mix: v / 100 } },
						{ label: 'Reverb Mix', valueText: formatPct(v) }
					)}
			/>
		</div>
	</section>
</div>
