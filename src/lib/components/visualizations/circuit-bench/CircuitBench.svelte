<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import '@fontsource-variable/archivo';
	import '@fontsource/ibm-plex-mono';
	import './circuit-bench.css';

	let Runtime = $state<Component | null>(null);
	let failed = $state(false);

	onMount(() => {
		let disposed = false;
		void import('./CircuitBenchApp.svelte')
			.then((module) => {
				if (!disposed) Runtime = module.default;
			})
			.catch(() => {
				if (!disposed) failed = true;
			});
		return () => {
			disposed = true;
		};
	});
</script>

<section
	class="cb-shell not-prose"
	aria-label="Circuit Bench interactive electronic circuit simulator"
	data-tts-exclude
>
	<h1 class="cb-sr-only">Circuit Bench: Build a Circuit, Change a Component, See What Changes</h1>

	{#if Runtime}
		<Runtime />
	{:else}
		<div class="cb-enclosure" data-ssr-placeholder="true">
			<header class="cb-toolbar">
				<div class="cb-toolbar-group">
					<div class="cb-brand">
						<span class="cb-brand-mark" aria-hidden="true"></span>
						<span class="cb-brand-title">Circuit Bench</span>
					</div>
					<span style="font-weight:600;color:var(--cb-text);">
						Prepared example: How long does a capacitor take to charge?
					</span>
				</div>
				<div class="cb-status-readout">
					<span class="cb-status-pill" data-status="Paused">Paused</span>
					<span class="cb-time-readout">t = 0.000 s</span>
				</div>
			</header>

			<div class="cb-prompt-strip">
				<div class="cb-prompt-main">
					<h2 class="cb-prompt-title">How long does a capacitor take to charge?</h2>
					<p class="cb-prompt-instruction">
						Press Run. Watch the capacitor voltage rise and the current fall. Then double the
						resistance and run it again.
					</p>
					<p class="cb-prompt-note">
						A 5 V DC supply (V1), a 1 kΩ resistor (R1), a 1,000 µF capacitor (C1, initially
						uncharged at 0 V), and Ground (0 V). Time constant τ = R × C = 1 second. Doubling the
						resistance doubles the charging time and halves the initial current.
					</p>
				</div>
				<div class="cb-checkpoints">
					<span class="cb-checkpoint-chip">Time constant: <strong>1 second</strong></span>
					<span class="cb-checkpoint-chip">t = 0 s: <strong>0 V · 5 mA</strong></span>
					<span class="cb-checkpoint-chip">t = 1 s: <strong>≈ 3.16 V · 1.84 mA</strong></span>
					<span class="cb-checkpoint-chip">t = 5 s: <strong>≈ 4.97 V</strong></span>
				</div>
			</div>

			<div
				style="padding:18px;background:var(--cb-display);border:1px solid var(--cb-border);border-radius:6px;display:flex;flex-direction:column;gap:12px;"
			>
				<img
					src="/images/visualizations/circuit-bench/social.png"
					alt="Circuit Bench showing a 5 V supply, 1 kΩ resistor, and 1,000 µF capacitor with its RC charging curve rising to 3.16 V at 1 second and 4.97 V at 5 seconds"
					width="1200"
					height="630"
					style="width:100%;height:auto;border-radius:4px;border:1px solid #2b3138;"
				/>
				<p
					role="status"
					style="margin:0;color:var(--cb-muted);font-family:'IBM Plex Mono',monospace;"
				>
					{failed
						? 'The interactive simulator could not load. Reload the page to try again.'
						: 'Initialising Circuit Bench workbench…'}
				</p>
				<noscript>
					<p style="margin:0;color:var(--cb-text);">
						Enable JavaScript to use the interactive circuit editor, transient solver, and
						two-channel oscilloscope. The notes and examples below remain readable without
						JavaScript.
					</p>
				</noscript>
			</div>
		</div>
	{/if}
</section>
