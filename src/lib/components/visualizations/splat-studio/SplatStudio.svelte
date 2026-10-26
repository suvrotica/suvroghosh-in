<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_SETTINGS,
		PRESETS,
		PALETTES,
		STYLES,
		normalizeSettings,
		presetSettings,
		encodeSettings,
		decodeSettings,
		randomizeSettings,
		type SplatSettings
	} from '$lib/visualizations/splat-studio/model';
	import type { SplatRenderer } from '$lib/visualizations/splat-studio/renderer';
	import './studio.css';

	type NumericKey = {
		[K in keyof SplatSettings]: SplatSettings[K] extends number ? K : never;
	}[keyof SplatSettings];
	type Knob = {
		key: NumericKey;
		label: string;
		min: number;
		max: number;
		step: number;
		unit?: string;
	};
	const primary: Knob[] = [
		{ key: 'density', label: 'Density', min: 0.25, max: 1.5, step: 0.05, unit: '×' },
		{ key: 'size', label: 'Splat size', min: 0.3, max: 2.5, step: 0.05, unit: '×' },
		{ key: 'flow', label: 'Flow intensity', min: 0, max: 2, step: 0.05 },
		{ key: 'speed', label: 'Animation speed', min: 0, max: 2, step: 0.05, unit: '×' },
		{ key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05 }
	];
	const groups: { name: string; icon: string; knobs: Knob[] }[] = [
		{
			name: 'Shape',
			icon: 'shape',
			knobs: [
				{ key: 'scale', label: 'Scale', min: 0.6, max: 1.5, step: 0.05 },
				{ key: 'twist', label: 'Twist', min: -2, max: 2, step: 0.05 },
				{ key: 'curl', label: 'Curl', min: 0, max: 2, step: 0.05 },
				{ key: 'spread', label: 'Spread', min: 0.2, max: 1.8, step: 0.05 },
				{ key: 'hollow', label: 'Hollow centre', min: 0, max: 1, step: 0.05 },
				{ key: 'symmetry', label: 'Symmetry', min: 1, max: 8, step: 1 }
			]
		},
		{
			name: 'Splats',
			icon: 'splats',
			knobs: [
				{ key: 'opacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05 },
				{ key: 'softness', label: 'Softness', min: 0.2, max: 1, step: 0.05 },
				{ key: 'elongation', label: 'Elongation', min: 1, max: 5, step: 0.1 },
				{ key: 'orientation', label: 'Orientation variation', min: 0, max: 1, step: 0.05 }
			]
		},
		{
			name: 'Colour',
			icon: 'colour',
			knobs: [
				{ key: 'hue', label: 'Hue shift', min: 0, max: 360, step: 1, unit: '°' },
				{ key: 'saturation', label: 'Saturation', min: 0, max: 1.5, step: 0.05 },
				{ key: 'gradient', label: 'Gradient spread', min: 0.2, max: 2, step: 0.05 }
			]
		},
		{
			name: 'Motion',
			icon: 'motion',
			knobs: [
				{ key: 'turbulence', label: 'Turbulence', min: 0, max: 1.5, step: 0.05 },
				{ key: 'breathing', label: 'Breathing', min: 0, max: 1, step: 0.05 },
				{ key: 'rotation', label: 'Rotation speed', min: 0, max: 0.5, step: 0.01 }
			]
		},
		{
			name: 'View',
			icon: 'view',
			knobs: [
				{ key: 'exposure', label: 'Exposure', min: 0.4, max: 2, step: 0.05 },
				{ key: 'bloom', label: 'Bloom', min: 0, max: 1.5, step: 0.05 },
				{ key: 'distance', label: 'Camera distance', min: 4, max: 12, step: 0.1 }
			]
		}
	];
	let settings = $state<SplatSettings>({ ...DEFAULT_SETTINGS });
	let canvas: HTMLCanvasElement;
	let studio: HTMLElement;
	let renderer: SplatRenderer | undefined;
	let mounted = false;
	let ready = $state(false);
	let error = $state('');
	let playing = $state(true);
	let controlsVisible = $state(true);
	let mobileControls = $state(false);
	let diagnostics = $state(false);
	let stats = $state({ fps: 0, count: 0, quality: 'auto' });
	let notice = $state('');
	let sceneLink = $state('');
	let exporting = $state(false);
	let fullscreen = $state(false);
	let cleanupNotice: ReturnType<typeof setTimeout> | undefined;
	const exportURLs = new Set<string>();
	const current = $derived(PRESETS.find((preset) => preset.id === settings.preset) ?? PRESETS[0]);
	const palette = $derived(PALETTES.find((entry) => entry.id === settings.palette) ?? PALETTES[0]);
	const currentIndex = $derived(PRESETS.findIndex((preset) => preset.id === settings.preset));

	$effect(() => {
		const snapshot = $state.snapshot(settings);
		renderer?.update(snapshot);
	});
	$effect(() => {
		const active = playing;
		renderer?.setPlaying(active);
	});

	onMount(() => {
		mounted = true;
		let disposed = false;
		settings = decodeSettings(window.location.search);
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		playing = !reduced.matches && document.documentElement.dataset.motion !== 'still';
		const onMotion = () => {
			if (reduced.matches) playing = false;
		};
		const onFullscreen = () => {
			fullscreen = document.fullscreenElement === studio;
		};
		const onHistory = () => {
			settings = decodeSettings(window.location.search);
		};
		reduced.addEventListener('change', onMotion);
		document.addEventListener('fullscreenchange', onFullscreen);
		window.addEventListener('popstate', onHistory);
		if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
			error =
				'3D rendering is switched off in this link. Remove webgl=off from the URL to start the studio.';
		} else {
			void import('$lib/visualizations/splat-studio/renderer')
				.then(({ SplatRenderer }) => {
					if (disposed) return;
					try {
						renderer = new SplatRenderer(canvas, $state.snapshot(settings), {
							onStats: (value) => {
								if (!disposed) stats = value;
							},
							onReady: () => {
								if (!disposed) {
									ready = true;
									error = '';
								}
							},
							onError: (message) => {
								if (!disposed) {
									error = message;
									ready = false;
								}
							}
						});
						renderer.setPlaying(playing);
					} catch (cause) {
						error =
							cause instanceof Error
								? cause.message
								: 'Your browser could not start the 3D canvas. Try a browser with WebGL 2 enabled.';
					}
				})
				.catch(() => {
					if (!disposed) error = 'The studio could not load. Reload the page to try again.';
				});
		}
		return () => {
			mounted = false;
			disposed = true;
			renderer?.dispose();
			renderer = undefined;
			reduced.removeEventListener('change', onMotion);
			document.removeEventListener('fullscreenchange', onFullscreen);
			window.removeEventListener('popstate', onHistory);
			clearTimeout(cleanupNotice);
			for (const url of exportURLs) URL.revokeObjectURL(url);
		};
	});

	function setNumber(key: NumericKey, value: number) {
		settings = normalizeSettings({ ...$state.snapshot(settings), [key]: value });
	}
	function choosePreset(id: string) {
		settings = presetSettings(id, settings.seed);
		sceneLink = '';
	}
	function announce(message: string) {
		if (!mounted) return;
		notice = message;
		clearTimeout(cleanupNotice);
		cleanupNotice = setTimeout(() => {
			notice = '';
		}, 4000);
	}
	function newSeed() {
		const value = new Uint32Array(1);
		crypto.getRandomValues(value);
		return value[0] % 1_000_000;
	}
	function surprise() {
		settings = randomizeSettings(newSeed());
		announce('A new little universe, just for you.');
	}
	function resetGroup(group: (typeof groups)[number]) {
		const defaults = presetSettings(settings.preset, settings.seed);
		const next = { ...$state.snapshot(settings) };
		for (const knob of group.knobs) next[knob.key] = defaults[knob.key];
		if (group.name === 'Colour') next.colorBy = defaults.colorBy;
		if (group.name === 'View') next.background = defaults.background;
		if (group.name === 'Motion') next.pointer = defaults.pointer;
		settings = next;
	}
	async function copyLink() {
		const url = new URL(window.location.href);
		url.search = encodeSettings($state.snapshot(settings));
		url.hash = '';
		window.history.replaceState({}, '', url);
		try {
			await navigator.clipboard.writeText(url.href);
			announce('Scene link copied. Same seed, same sculpture.');
			sceneLink = '';
		} catch {
			sceneLink = url.href;
			announce('Your scene link is ready to copy below.');
		}
	}
	async function exportImage() {
		if (!renderer || exporting) return;
		exporting = true;
		try {
			const blob = await renderer.exportPNG();
			if (!mounted) return;
			const url = URL.createObjectURL(blob);
			exportURLs.add(url);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `splat-studio-${settings.preset}-${settings.seed}.png`;
			anchor.click();
			announce('Your artwork is ready.');
			URL.revokeObjectURL(url);
			exportURLs.delete(url);
		} catch {
			announce('The image could not be exported. Please try again.');
		} finally {
			exporting = false;
		}
	}
	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (studio.requestFullscreen) await studio.requestFullscreen();
			else announce('Use Hide controls for an immersive view on this browser.');
		} catch {
			announce('Fullscreen is unavailable. Try Hide controls.');
		}
	}
	function display(value: number, knob: Knob) {
		return `${knob.step === 1 ? value.toFixed(0) : value.toFixed(2)}${knob.unit ?? ''}`;
	}
	function disabledKnob(key: NumericKey) {
		return (
			((key === 'elongation' || key === 'orientation') &&
				(settings.style === 'gaussian' || settings.style === 'spark')) ||
			(key === 'softness' && ['surfel', 'ink', 'spark'].includes(settings.style))
		);
	}
</script>

{#snippet icon(name: string, size = 18)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === 'play'}<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />
		{:else if name === 'pause'}<path d="M9 5v14M16 5v14" stroke-width="3" />
		{:else if name === 'reset'}<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
		{:else if name === 'export'}<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
		{:else if name === 'link'}<path
				d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
				transform="translate(1 0) scale(.9)"
			/>
		{:else if name === 'full'}<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
		{:else if name === 'shuffle'}<path
				d="m17 3 4 4-4 4M3 7h3c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c2 0 4-3 5-5m3-3c1-1 2-2 4-2h3"
			/>
		{:else if name === 'sliders'}<path d="M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6" />
		{:else if name === 'close'}<path d="m6 6 12 12M6 18 18 6" />
		{:else if name === 'shape'}<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 17l9 5 9-5" />
		{:else if name === 'colour'}<circle cx="9" cy="9" r="5" /><circle cx="15" cy="9" r="5" /><circle
				cx="12"
				cy="15"
				r="5"
			/>
		{:else if name === 'motion'}<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5" />
		{:else if name === 'view'}<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle
				cx="12"
				cy="12"
				r="3"
			/>
		{:else}<circle cx="7" cy="7" r="3" /><circle cx="17" cy="9" r="2" /><circle
				cx="12"
				cy="17"
				r="4"
			/>{/if}
	</svg>
{/snippet}

{#snippet knobControl(knob: Knob)}
	<div class="ss-knob" class:ss-disabled={disabledKnob(knob.key)}>
		<div class="ss-knob-label">
			<label for={`ss-${knob.key}`}>{knob.label}</label><output for={`ss-${knob.key}`}
				>{display(settings[knob.key], knob)}</output
			>
		</div>
		<input
			id={`ss-${knob.key}`}
			type="range"
			min={knob.min}
			max={knob.max}
			step={knob.step}
			value={settings[knob.key]}
			disabled={disabledKnob(knob.key)}
			oninput={(event) => setNumber(knob.key, Number(event.currentTarget.value))}
			style={`--fill: ${((settings[knob.key] - knob.min) / (knob.max - knob.min)) * 100}%`}
		/>
	</div>
{/snippet}

<section
	id="splat-studio"
	class="splat-studio"
	class:ss-immersive={!controlsVisible}
	class:ss-mobile-open={mobileControls}
	data-state={error ? 'error' : ready ? 'ready' : 'rendering'}
	data-preset={settings.preset}
	data-style={settings.style}
	style={`--ss-accent: ${current.accent}`}
	bind:this={studio}
>
	<header class="ss-topbar">
		<div class="ss-brand">
			<a href="/" class="ss-monogram" aria-label="Suvro Ghosh home">s<span>g</span><i></i></a><span
				class="ss-brand-rule"
			></span>
			<div>
				<h1>Splat Studio<span class="ss-beta" aria-hidden="true">LAB</span></h1>
				<p>A PLAYGROUND FOR COLOUR & FORM</p>
			</div>
		</div>
		<div class="ss-header-actions">
			<span class="ss-local"><i></i> Made of light. Made by you.</span>
			<button class="ss-button ss-share" onclick={copyLink} aria-label="Copy scene link"
				>{@render icon('link', 16)}<span>Share scene</span></button
			>
			<button
				class="ss-button ss-export"
				onclick={exportImage}
				disabled={!ready || exporting}
				aria-label="Export PNG"
				>{@render icon('export', 16)}<span>{exporting ? 'Exporting…' : 'Export PNG'}</span></button
			>
		</div>
	</header>

	<div class="ss-workspace">
		<div
			class="ss-stage"
			class:ss-bg-plum={settings.background === 'plum'}
			class:ss-bg-ink={settings.background === 'ink'}
		>
			<canvas
				bind:this={canvas}
				aria-describedby="ss-keyboard-hint"
				aria-label="Interactive 3D splat sculpture"
				tabindex="0"
			></canvas>
			<span id="ss-keyboard-hint" class="ss-sr-only"
				>Drag or use arrow keys to orbit. Scroll, pinch or use plus and minus to zoom. Home resets
				the camera.</span
			>
			<div class="ss-scene-heading">
				<div class="ss-eyebrow">
					<span></span> PROCEDURAL SCULPTURE / {String(currentIndex + 1).padStart(2, '0')}
				</div>
				<h2>{current.name}</h2>
				<p>{current.description}</p>
			</div>
			<div class="ss-corner-top">
				<span>∞ POSSIBILITIES</span><button
					class="ss-icon-button"
					onclick={toggleFullscreen}
					aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					title="Fullscreen">{@render icon('full')}</button
				>
			</div>
			{#if !ready || error}
				<div class="ss-loading" role="status">
					<div class="ss-loading-orbit"><i></i><i></i><i></i></div>
					<strong>{error ? 'A little pause in the universe.' : 'Gathering a little light…'}</strong>
					<p>{error || 'Your sculpture is taking shape.'}</p>
					{#if error}<button class="ss-button" onclick={() => window.location.reload()}
							>Reload studio</button
						>{/if}<noscript
						>Enable JavaScript and WebGL 2 to explore the interactive studio.</noscript
					>
				</div>
			{/if}
			<div class="ss-view-tools">
				<div class="ss-transport">
					<button
						class="ss-icon-button ss-play"
						onclick={() => (playing = !playing)}
						aria-label={playing ? 'Pause animation' : 'Play animation'}
						title={playing ? 'Pause animation' : 'Play animation'}
						>{@render icon(playing ? 'pause' : 'play', 16)}</button
					><span>{playing ? 'IN MOTION' : 'STILL FRAME'}</span><span class="ss-tool-rule"
					></span><button
						class="ss-icon-button"
						onclick={() => renderer?.resetCamera()}
						aria-label="Reset camera"
						title="Reset camera">{@render icon('reset', 15)}</button
					>
				</div>
				<div class="ss-gesture-hint"><span>↔</span> Drag to orbit <i></i> Scroll to explore</div>
				<button
					class="ss-button ss-hide"
					onclick={() => (controlsVisible = !controlsVisible)}
					aria-label={controlsVisible ? 'Hide controls' : 'Show controls'}
					>{@render icon('sliders', 15)}<span
						>{controlsVisible ? 'Hide controls' : 'Show controls'}</span
					></button
				>
			</div>
			<div class="ss-presets">
				<div class="ss-preset-heading">
					<span>FIND YOUR STARTING POINT</span><button
						onclick={surprise}
						class="ss-text-button"
						aria-label="Surprise me">{@render icon('shuffle', 14)} Surprise me</button
					>
				</div>
				<div class="ss-preset-grid">
					{#each PRESETS as preset, i}
						<button
							class="ss-preset"
							class:ss-selected={settings.preset === preset.id}
							onclick={() => choosePreset(preset.id)}
							aria-pressed={settings.preset === preset.id}
							aria-label={preset.name}
							style={`--preset-accent: ${preset.accent}`}
							><span class={`ss-preset-art ss-art-${i}`}><i></i><i></i><i></i></span><span
								class="ss-preset-title">{preset.name}</span
							><span class="ss-preset-number">0{i + 1}</span></button
						>
					{/each}
				</div>
			</div>
			<div class="ss-stage-meta">
				<button
					onclick={() => (diagnostics = !diagnostics)}
					aria-expanded={diagnostics}
					class="ss-diagnostics-toggle"
					><i></i>{ready ? `${(stats.count / 1000).toFixed(1)}K SPLATS` : 'WEBGL 2'}<span
						>{diagnostics
							? `${stats.fps.toFixed(0)} FPS · ${stats.quality.toUpperCase()}`
							: 'RENDERED LIVE'}</span
					></button
				><span>EVERY POINT, A POSSIBILITY.</span>
			</div>
		</div>

		{#if controlsVisible}
			<aside class="ss-controls" aria-label="Sculpture controls">
				<div class="ss-control-heading">
					<div>
						<span class="ss-eyebrow">THE PLAYGROUND</span>
						<h2>Make it yours<span>.</span></h2>
					</div>
					<button
						class="ss-icon-button ss-panel-reset"
						onclick={() => choosePreset(settings.preset)}
						aria-label="Reset preset"
						title="Reset preset">{@render icon('reset', 17)}</button
					><button
						class="ss-icon-button ss-mobile-close"
						onclick={() => (mobileControls = false)}
						aria-label="Close controls">{@render icon('close')}</button
					>
				</div>
				<div class="ss-control-scroll">
					<div class="ss-field">
						<label for="ss-style">Splat style</label><select
							id="ss-style"
							bind:value={settings.style}
							>{#each STYLES as style}<option value={style.id}>{style.name}</option>{/each}</select
						>
						<p class="ss-field-hint">
							{STYLES.find((style) => style.id === settings.style)?.description}
						</p>
					</div>
					<div class="ss-field">
						<label for="ss-palette">Colour palette</label>
						<div
							class="ss-palette-preview"
							style={`background: linear-gradient(90deg, ${palette.colors.join(',')})`}
						></div>
						<select id="ss-palette" bind:value={settings.palette}
							>{#each PALETTES as entry}<option value={entry.id}>{entry.name}</option
								>{/each}</select
						>
					</div>
					<div class="ss-primary-knobs">
						{#each primary as knob}{@render knobControl(knob)}{/each}
					</div>
					<div class="ss-advanced-heading">A LITTLE MORE CONTROL</div>
					{#each groups as group}
						<details class="ss-control-group">
							<summary
								>{@render icon(group.icon, 16)}<span>{group.name}</span><span class="ss-chevron"
									>+</span
								></summary
							>
							<div class="ss-group-body">
								{#each group.knobs as knob}{@render knobControl(knob)}{/each}
								{#if group.name === 'Colour'}<div class="ss-field">
										<label for="ss-colour-mapping">Colour mapping</label><select
											id="ss-colour-mapping"
											bind:value={settings.colorBy}
											><option value="position">Along the sculpture</option><option value="depth"
												>Camera depth</option
											><option value="flow">Flow direction</option></select
										>
									</div>{/if}
								{#if group.name === 'Motion'}<label class="ss-checkbox"
										><input type="checkbox" bind:checked={settings.pointer} /><span
											>Pointer interaction</span
										></label
									>{/if}
								{#if group.name === 'View'}<div class="ss-field">
										<label for="ss-background">Background</label><select
											id="ss-background"
											bind:value={settings.background}
											><option value="midnight">Midnight blue</option><option value="ink"
												>Pure ink</option
											><option value="plum">Deep plum</option></select
										>
									</div>{/if}
								<button class="ss-text-button ss-reset-group" onclick={() => resetGroup(group)}
									>Reset {group.name.toLowerCase()}</button
								>
							</div>
						</details>
					{/each}
					<div class="ss-bottom-settings">
						<div class="ss-field">
							<label for="ss-quality">Quality</label><select
								id="ss-quality"
								bind:value={settings.quality}
								><option value="auto">Auto · adapts to your device</option><option value="high"
									>High</option
								><option value="medium">Medium</option><option value="low">Low</option></select
							>
						</div>
						<div class="ss-field">
							<label for="ss-seed">Seed</label>
							<div class="ss-seed-row">
								<input
									id="ss-seed"
									type="number"
									min="0"
									max="4294967295"
									step="1"
									value={settings.seed}
									onchange={(event) => setNumber('seed', Number(event.currentTarget.value))}
								/><button
									class="ss-icon-button"
									onclick={() => (settings.seed = newSeed())}
									aria-label="Regenerate seed"
									title="Regenerate seed">{@render icon('shuffle', 17)}</button
								>
							</div>
						</div>
						<p class="ss-seed-hint">Same seed. Same little universe.</p>
					</div>
				</div>
				<div class="ss-panel-footer">
					<span class="ss-status-dot"></span> PROCEDURAL ART. ENDLESSLY YOURS.
				</div>
			</aside>
		{/if}
	</div>
	<button
		class="ss-mobile-toggle ss-button"
		onclick={() => {
			controlsVisible = true;
			mobileControls = !mobileControls;
		}}
		aria-expanded={mobileControls}
		aria-label="Tune sculpture">{@render icon('sliders', 17)} Tune sculpture <span>↗</span></button
	>
	{#if sceneLink}<div class="ss-link-fallback">
			<label for="ss-share-link">Copy scene link</label><input
				id="ss-share-link"
				readonly
				value={sceneLink}
				onfocus={(event) => event.currentTarget.select()}
			/><button
				class="ss-icon-button"
				onclick={() => (sceneLink = '')}
				aria-label="Close scene link">{@render icon('close')}</button
			>
		</div>{/if}
	<div class="ss-toast" class:ss-toast-visible={Boolean(notice)} role="status" aria-live="polite">
		{notice}
	</div>
</section>
