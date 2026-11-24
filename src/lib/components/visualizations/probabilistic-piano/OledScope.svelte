<script lang="ts">
	import { onMount } from 'svelte';
	import type { SynthAudio } from '$lib/visualizations/probabilistic-piano/audio';
	import type { SynthPatch } from '$lib/visualizations/probabilistic-piano/synth-patch';

	export interface ParamEcho {
		label: string;
		valueText: string;
		serial: number;
	}

	interface Props {
		audio: SynthAudio | undefined;
		sound: boolean;
		patch: SynthPatch;
		still: boolean;
		visible: boolean;
		paramEcho: ParamEcho | null;
		activeChordName: string;
		voiceCount: number;
	}

	let { audio, sound, patch, still, visible, paramEcho, activeChordName, voiceCount }: Props =
		$props();

	let scopeMode = $state<'scope' | 'spectrum' | 'curve'>('scope');
	let canvas: HTMLCanvasElement | undefined = $state();
	let container: HTMLDivElement | undefined = $state();
	let rafId = 0;

	const timeDomain = new Float32Array(2048);
	const freqBins = new Uint8Array(1024);

	function resizeCanvas() {
		if (!canvas || !container) return;
		const rect = container.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		const w = Math.max(200, Math.round(rect.width * dpr));
		const h = Math.max(68, Math.round(rect.height * dpr));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
	}

	function drawFrame() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		if (w === 0 || h === 0) return;

		ctx.fillStyle = '#050608';
		ctx.fillRect(0, 0, w, h);

		// Subtle reticle grid
		ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let i = 1; i < 4; i++) {
			const y = Math.round((h * i) / 4) + 0.5;
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
		}
		for (let i = 1; i < 6; i++) {
			const x = Math.round((w * i) / 6) + 0.5;
			ctx.moveTo(x, 0);
			ctx.lineTo(x, h);
		}
		ctx.stroke();

		const hasLive = Boolean(sound && audio?.ready && audio.getAnalyserData(timeDomain, freqBins));

		if (scopeMode === 'scope') {
			ctx.strokeStyle = '#38BDF8';
			ctx.lineWidth = 1.8;
			ctx.beginPath();

			let peak = 0;
			if (hasLive) {
				for (let i = 0; i < timeDomain.length; i++) {
					const a = Math.abs(timeDomain[i]);
					if (a > peak) peak = a;
				}
			}

			if (hasLive && peak > 0.002) {
				let start = 0;
				for (let i = 1; i < 1024; i++) {
					if (timeDomain[i - 1] < 0 && timeDomain[i] >= 0) {
						start = i;
						break;
					}
				}
				const span = 512;
				for (let px = 0; px < w; px++) {
					const idx = start + Math.floor((px / Math.max(1, w - 1)) * span);
					const sample = timeDomain[Math.min(idx, timeDomain.length - 1)];
					const y = h * 0.5 - Math.max(-0.92, Math.min(0.92, sample * 1.6)) * (h * 0.42);
					if (px === 0) ctx.moveTo(px, y);
					else ctx.lineTo(px, y);
				}
			} else {
				const shape = patch.osc1.shape;
				for (let px = 0; px < w; px++) {
					const t = (px / Math.max(1, w - 1)) * Math.PI * 4;
					const sig = Math.sin(t) * 0.35 + Math.sin(t * 2) * (0.12 + shape * 0.14);
					const y = h * 0.5 - sig * (h * 0.25);
					if (px === 0) ctx.moveTo(px, y);
					else ctx.lineTo(px, y);
				}
			}
			ctx.stroke();
		} else if (scopeMode === 'spectrum') {
			const bars = 28;
			const gap = 2;
			const barW = Math.max(2, (w - gap * (bars + 1)) / bars);
			for (let i = 0; i < bars; i++) {
				let mag = 0;
				if (hasLive) {
					const binStart = Math.floor(Math.pow(i / bars, 1.5) * 240);
					const binEnd = Math.max(binStart + 1, Math.floor(Math.pow((i + 1) / bars, 1.5) * 240));
					let sum = 0;
					for (let b = binStart; b < binEnd && b < freqBins.length; b++) {
						sum += freqBins[b];
					}
					mag = sum / Math.max(1, binEnd - binStart) / 255;
				}
				const floorMag = 0.08 + 0.08 * Math.exp(-i * 0.14);
				const level = Math.max(floorMag, mag);
				const barH = Math.max(3, Math.round(level * (h - 10)));
				const x = Math.round(gap + i * (barW + gap));
				const y = h - barH - 4;
				ctx.fillStyle = i < 8 ? '#FF8A1E' : '#38BDF8';
				ctx.fillRect(x, y, Math.max(2, Math.floor(barW)), barH);
			}
		} else {
			// Curve mode: Filter frequency response (amber) + Amp ADSR contour (cyan)
			const cutoffNorm = Math.log(patch.filter.cutoffHz / 20) / Math.log(18000 / 20);
			const resNorm = Math.min(1, (patch.filter.resonance - 0.5) / 19.5);
			const cutoffX = cutoffNorm * w;

			ctx.strokeStyle = '#FF8A1E';
			ctx.lineWidth = 2;
			ctx.beginPath();
			for (let px = 0; px < w; px++) {
				const xNorm = px / Math.max(1, w - 1);
				let gain: number;
				if (patch.filter.type === 'hp12') {
					gain = xNorm < cutoffNorm ? Math.max(0.08, 0.72 - (cutoffNorm - xNorm) * 2.2) : 0.72;
				} else if (patch.filter.type === 'bp12') {
					const dist = Math.abs(xNorm - cutoffNorm);
					gain = Math.max(0.1, 0.78 - dist * 2.6);
				} else {
					const slope = patch.filter.type === 'lp24' ? 3.4 : 2.1;
					gain = xNorm > cutoffNorm ? Math.max(0.08, 0.72 - (xNorm - cutoffNorm) * slope) : 0.72;
				}
				const peakDist = Math.abs(px - cutoffX) / Math.max(12, w * 0.08);
				const resBump = resNorm * 0.32 * Math.exp(-peakDist * peakDist);
				const y = h - Math.min(0.94, gain + resBump) * (h - 10) - 5;
				if (px === 0) ctx.moveTo(px, y);
				else ctx.lineTo(px, y);
			}
			ctx.stroke();

			// Amp ADSR overlay in cyan
			const env = patch.ampEnv;
			const totalT = Math.max(0.2, env.attack + env.decay + 0.6 + env.release);
			const ax = (env.attack / totalT) * w;
			const dx = ((env.attack + env.decay) / totalT) * w;
			const sx = ((env.attack + env.decay + 0.6) / totalT) * w;
			const sy = h - 6 - env.sustain * (h - 16);

			ctx.strokeStyle = '#38BDF8';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(2, h - 6);
			ctx.lineTo(Math.max(4, ax), 8);
			ctx.lineTo(Math.max(8, dx), sy);
			ctx.lineTo(Math.max(12, sx), sy);
			ctx.lineTo(w - 2, h - 6);
			ctx.stroke();
		}
	}

	function stopLoop() {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	}

	function scheduleLoop() {
		stopLoop();
		drawFrame();
		if (still || !visible) return;
		const tick = () => {
			if (still || !visible) {
				rafId = 0;
				return;
			}
			drawFrame();
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
	}

	$effect(() => {
		// Track reactive inputs so static frames redraw on any mode/patch/motion/visibility update
		void scopeMode;
		void patch;
		void still;
		void visible;
		void sound;
		scheduleLoop();
		return () => stopLoop();
	});

	onMount(() => {
		resizeCanvas();
		drawFrame();
		const observer = new ResizeObserver(() => {
			resizeCanvas();
			drawFrame();
		});
		if (container) observer.observe(container);
		return () => {
			stopLoop();
			observer.disconnect();
		};
	});
</script>

<div class="oled-scope" data-oled-scope role="region" aria-label="OLED scope" data-tts-exclude>
	<div class="oled-head">
		<div class="oled-modes" role="group" aria-label="Scope mode">
			<button
				type="button"
				aria-pressed={scopeMode === 'scope'}
				onclick={() => (scopeMode = 'scope')}
			>
				Oscilloscope
			</button>
			<button
				type="button"
				aria-pressed={scopeMode === 'spectrum'}
				onclick={() => (scopeMode = 'spectrum')}
			>
				Spectrum
			</button>
			<button
				type="button"
				aria-pressed={scopeMode === 'curve'}
				onclick={() => (scopeMode = 'curve')}
			>
				Curve
			</button>
		</div>
		<span class="oled-voices" aria-label="Active voice count">{voiceCount}V</span>
	</div>
	<div class="oled-screen" bind:this={container}>
		<canvas bind:this={canvas} width="260" height="76" aria-hidden="true"></canvas>
		<div class="oled-echo" aria-live="polite">
			{#if paramEcho}
				<span class="echo-badge">{paramEcho.label}: {paramEcho.valueText}</span>
			{:else}
				<span class="echo-idle">{activeChordName} · {patch.name}</span>
			{/if}
		</div>
	</div>
</div>
