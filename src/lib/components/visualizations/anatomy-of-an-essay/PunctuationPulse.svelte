<script lang="ts">
	import { onMount } from 'svelte';

	let { symbols, playing }: { symbols: string[]; playing: boolean } = $props();
	let surface = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let readout = $state<HTMLSpanElement>();
	let available = $state(true);
	let update: ((nextSymbols: string[], nextPlaying: boolean) => void) | undefined;

	/** Durations and amplitudes are an interpretive punctuation score, in seconds and CSS pixels. */
	function eventFor(mark: string) {
		if (mark === ',') return { mark, duration: 0.38, amplitude: 5 };
		if (mark === ';') return { mark, duration: 0.6, amplitude: 7 };
		if (mark === ':') return { mark, duration: 0.55, amplitude: 6 };
		if (mark === '.') return { mark, duration: 0.85, amplitude: 10 };
		if (mark === '…') return { mark, duration: 1.1, amplitude: 8 };
		if (/[—–-]/.test(mark)) return { mark, duration: 0.55, amplitude: 9 };
		if (mark === '?' || mark === '!')
			return { mark, duration: 1, amplitude: mark === '?' ? 11 : 12 };
		return { mark, duration: 0.3, amplitude: 4 };
	}

	$effect(() => {
		// Read props even before onMount installs the drawing controller, so the
		// initial optional call cannot leave the effect without dependencies.
		const nextSymbols = symbols,
			nextPlaying = playing;
		update?.(nextSymbols, nextPlaying);
	});

	onMount(() => {
		const host = surface,
			output = canvas,
			label = readout;
		if (!host || !output) return;
		const ctx = output.getContext('2d');
		if (!ctx) {
			available = false;
			return;
		}
		const context = ctx;
		let currentSymbols = symbols;
		let enabled = playing;
		let events = currentSymbols.slice(0, 30).map(eventFor);
		let total = events.reduce((sum, event) => sum + event.duration, 0);
		let width = 260;
		const height = 42;
		let clock = 0,
			last = 0,
			frame = 0;
		let visible = false,
			pageVisible = !window.document.hidden;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		let reduced = motion.matches;
		let accent = '#a24c32',
			ink = '#6b7065';
		const wave = [
			[0, 0],
			[0.2, 0],
			[0.32, -0.2],
			[0.4, -1],
			[0.48, 0.75],
			[0.57, -0.25],
			[0.69, 0],
			[1, 0]
		];
		const baseline = height / 2;

		function palette() {
			const style = getComputedStyle(host!);
			accent = style.getPropertyValue('--ea-accent').trim() || '#a24c32';
			ink = style.getPropertyValue('--ea-muted').trim() || '#6b7065';
		}
		function ordinate(progress: number, amplitude: number) {
			for (let i = 1; i < wave.length; i++) {
				if (progress <= wave[i][0]) {
					const t = (progress - wave[i - 1][0]) / (wave[i][0] - wave[i - 1][0]);
					return baseline + (wave[i - 1][1] + (wave[i][1] - wave[i - 1][1]) * t) * amplitude;
				}
			}
			return baseline;
		}
		function position(time: number) {
			let elapsed = 0;
			for (const event of events) {
				if (time <= elapsed + event.duration) {
					const progress = Math.max(0, Math.min(1, (time - elapsed) / event.duration));
					return {
						x: 7 + (Math.min(total, time) / Math.max(0.01, total)) * (width - 14),
						y: ordinate(progress, event.amplitude),
						mark: event.mark
					};
				}
				elapsed += event.duration;
			}
			return { x: width - 7, y: baseline, mark: '·' };
		}
		function draw(time: number | null) {
			context.clearRect(0, 0, width, height);
			context.lineWidth = 0.8;
			context.strokeStyle = ink;
			context.globalAlpha = 0.5;
			context.beginPath();
			context.moveTo(7, baseline);
			let elapsed = 0;
			for (const event of events) {
				for (const [progress, relative] of wave)
					context.lineTo(
						7 + ((elapsed + progress * event.duration) / Math.max(0.01, total)) * (width - 14),
						baseline + relative * event.amplitude
					);
				elapsed += event.duration;
			}
			context.lineTo(width - 7, baseline);
			context.stroke();
			if (time !== null && events.length) {
				const phase = Math.min(total, time % (total + 0.6));
				context.strokeStyle = accent;
				context.lineWidth = 1.6;
				context.globalAlpha = 0.9;
				context.beginPath();
				for (let i = 0; i <= 14; i++) {
					const p = position(Math.max(0, phase - 0.28 + i * 0.02));
					if (!i) context.moveTo(p.x, p.y);
					else context.lineTo(p.x, p.y);
				}
				context.stroke();
				const active = position(phase);
				context.fillStyle = accent;
				context.globalAlpha = 0.13;
				context.beginPath();
				context.arc(active.x, active.y, 5, 0, Math.PI * 2);
				context.fill();
				context.globalAlpha = 1;
				context.beginPath();
				context.arc(active.x, active.y, 1.9, 0, Math.PI * 2);
				context.fill();
				if (label && label.textContent !== active.mark) label.textContent = active.mark;
			} else if (label) label.textContent = events.length ? '·' : '—';
			context.globalAlpha = 1;
		}
		function stop() {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			last = 0;
		}
		function tick(now: number) {
			frame = 0;
			const dt = last ? Math.min(0.033, Math.max(0, (now - last) / 1000)) : 0;
			last = now;
			clock += dt;
			draw(clock);
			if (enabled && visible && pageVisible && !reduced && events.length)
				frame = requestAnimationFrame(tick);
		}
		function sync() {
			stop();
			if (enabled && visible && pageVisible && !reduced && events.length)
				frame = requestAnimationFrame(tick);
			else draw(null);
		}
		function resize() {
			width = Math.max(80, Math.round(host!.getBoundingClientRect().width - 25));
			const ratio = Math.min(1.5, window.devicePixelRatio || 1);
			output!.width = Math.round(width * ratio);
			output!.height = Math.round(height * ratio);
			output!.style.width = `${width}px`;
			output!.style.height = `${height}px`;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			palette();
			draw(enabled && visible && !reduced ? clock : null);
		}
		update = (nextSymbols, nextPlaying) => {
			if (nextSymbols !== currentSymbols) {
				currentSymbols = nextSymbols;
				events = nextSymbols.slice(0, 30).map(eventFor);
				total = events.reduce((sum, event) => sum + event.duration, 0);
				clock = 0;
			}
			enabled = nextPlaying;
			palette();
			sync();
		};
		const pageChange = () => {
			pageVisible = !window.document.hidden;
			sync();
		};
		const motionChange = () => {
			reduced = motion.matches;
			sync();
		};
		const intersection = new IntersectionObserver((entries) => {
			visible = entries[entries.length - 1].isIntersecting;
			sync();
		});
		const resizeObserver = new ResizeObserver(resize);
		const themeObserver = new MutationObserver(() => {
			palette();
			draw(enabled && visible && !reduced ? clock : null);
		});
		resize();
		intersection.observe(host);
		resizeObserver.observe(host);
		themeObserver.observe(window.document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});
		window.document.addEventListener('visibilitychange', pageChange);
		motion.addEventListener('change', motionChange);
		return () => {
			stop();
			update = undefined;
			intersection.disconnect();
			resizeObserver.disconnect();
			themeObserver.disconnect();
			window.document.removeEventListener('visibilitychange', pageChange);
			motion.removeEventListener('change', motionChange);
		};
	});
</script>

<div class="punctuation-pulse">
	<div class="pulse-surface" bind:this={surface} aria-hidden="true">
		{#if available}<canvas bind:this={canvas} width="260" height="42">{symbols.join(' ')}</canvas
			>{:else}<span class="pulse-fallback">{symbols.length ? symbols.join(' ') : '—'}</span>{/if}
		<span class="pulse-mark" bind:this={readout}>·</span>
	</div>
	<p class="pulse-score">
		Interpretive pauses: comma .38s · semicolon .6s · stop .85s · dash .55s · ? ! 1s
	</p>
</div>

<style>
	.punctuation-pulse {
		min-width: 0;
	}
	.pulse-surface {
		display: flex;
		align-items: center;
		min-width: 0;
		height: 42px;
	}
	canvas {
		display: block;
		flex: 0 1 auto;
		min-width: 0;
	}
	.pulse-mark {
		width: 25px;
		flex: 0 0 25px;
		color: var(--ea-accent, #a24c32);
		font:
			21px Georgia,
			serif;
		text-align: center;
	}
	.pulse-score {
		margin: 2px 0 0;
		color: var(--ea-muted, #6b7065);
		font: 8px/1.5 monospace;
	}
	.pulse-fallback {
		display: block;
		flex: 1;
		color: var(--ea-muted, #6b7065);
		font: 15px/1.5 monospace;
		letter-spacing: 6px;
		overflow: hidden;
	}
</style>
