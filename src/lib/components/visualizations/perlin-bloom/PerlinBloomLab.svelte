<script lang="ts">
	import { onMount } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import BloomCanvas from './BloomCanvas.svelte';
	import BloomControls from './BloomControls.svelte';
	import BloomIdentityBar from './BloomIdentityBar.svelte';
	import KeyboardHelp from './KeyboardHelp.svelte';
	import {
		DEFAULT_CONFIG,
		PRESETS,
		buildPerlinBloomShareUrl,
		buildPerlinBloomStatePath,
		describeBloom,
		generateFriendlySeed,
		getPreset,
		morphologyHash,
		normalizeConfig,
		parsePerlinBloomState,
		stateForPreset,
		type FlowerConfig
	} from '$lib/visualizations/perlin-bloom';

	const uid = $props.id();
	type BloomPath = `/blog/visualizations/thinking-outside-the-box${string}`;
	const descriptionId = `${uid}-description`;
	const SUMMARY_KEYS = new Set<keyof FlowerConfig>([
		'seed',
		'preset',
		'palette',
		'petals',
		'whorls',
		'bloomScale',
		'petalLength',
		'petalWidth',
		'widthProfile',
		'curl',
		'symmetry',
		'asymmetry',
		'tipStyle',
		'noiseStrength',
		'noiseScale',
		'domainWarp',
		'octaves',
		'falloff',
		'boxSize',
		'constraint',
		'ruptureThreshold',
		'breakout',
		'boundaryPhysics'
	]);

	let exhibit: HTMLElement;
	let canvas: BloomCanvas;
	let config = $state<FlowerConfig>({ ...DEFAULT_CONFIG });
	let paused = $state(false);
	let allowMotionOverride = $state(false);
	let systemMotionBlocked = $state(false);
	let controlsHidden = $state(false);
	let posterMode = $state(false);
	let debugMode = $state(false);
	let mounted = $state(false);
	let canvasStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let statusMessage = $state('Cultivating the bloom field…');
	let exportScale = $state<1 | 2 | 4>(2);
	let includeSignature = $state(true);
	let exportBusy = $state(false);
	let fullscreenAvailable = $state(false);
	let fullscreen = $state(false);
	let urlTimer: ReturnType<typeof setTimeout> | undefined;
	let summaryTimer: ReturnType<typeof setTimeout> | undefined;

	let currentPreset = $derived(PRESETS.find((preset) => preset.id === config.preset) ?? PRESETS[0]);
	let currentPalette = $derived(
		PRESETS.find((preset) => preset.id === config.palette) ?? PRESETS[0]
	);
	let bloomDescription = $state(describeBloom(DEFAULT_CONFIG));
	let bloomHash = $derived(morphologyHash(config));
	let effectivelyPaused = $derived(
		paused || !config.motionEnabled || (systemMotionBlocked && !allowMotionOverride)
	);
	let pauseLabel = $derived(
		systemMotionBlocked && !allowMotionOverride
			? 'Enable motion'
			: effectivelyPaused
				? 'Resume'
				: 'Pause'
	);

	function safeFilenamePart(value: string) {
		return (
			value
				.toLocaleLowerCase('en')
				.replace(/[^a-z0-9._-]+/gu, '-')
				.replace(/^-+|-+$/gu, '')
				.slice(0, 64) || 'bloom'
		);
	}

	function isTypingTarget(target: EventTarget | null) {
		return (
			target instanceof Element &&
			Boolean(
				target.closest('input, select, textarea, [contenteditable="true"], [contenteditable=""]')
			)
		);
	}

	function isButtonActivation(event: KeyboardEvent) {
		return (
			(event.key === ' ' || event.key === 'Enter') &&
			event.target instanceof Element &&
			Boolean(event.target.closest('button, summary'))
		);
	}

	function queueBloomDescription(patch?: Partial<FlowerConfig>, immediate = false) {
		if (patch && !Object.keys(patch).some((key) => SUMMARY_KEYS.has(key as keyof FlowerConfig))) {
			return;
		}
		if (summaryTimer) clearTimeout(summaryTimer);
		const snapshot = { ...config };
		if (immediate) {
			bloomDescription = describeBloom(snapshot);
			return;
		}
		summaryTimer = setTimeout(() => {
			bloomDescription = describeBloom(snapshot);
		}, 140);
	}

	function updateConfig(patch: Partial<FlowerConfig>) {
		config = normalizeConfig({ ...config, ...patch });
		queueBloomDescription(patch);

		if ('motionEnabled' in patch) {
			allowMotionOverride = config.motionEnabled;
			paused = !config.motionEnabled;
			statusMessage = config.motionEnabled
				? 'Continuous bloom motion enabled.'
				: 'Still mode enabled. Morphology remains fully rendered.';
		} else if ('seed' in patch) {
			statusMessage = `Seed ${config.seed} reconstructed.`;
		} else if ('palette' in patch) {
			statusMessage = `${getPreset(config.palette).name} light applied without changing the bloom anatomy.`;
		} else if ('view' in patch) {
			statusMessage =
				config.view === 'anatomy'
					? 'Anatomy view opened without changing the seed.'
					: 'Artwork view restored.';
		}
	}

	function applyPalette(id: FlowerConfig['palette']) {
		updateConfig({ palette: id });
	}

	function applyPreset(id: FlowerConfig['preset']) {
		const preset = getPreset(id);
		config = stateForPreset(id, config.seed);
		queueBloomDescription();
		paused = !config.motionEnabled;
		allowMotionOverride = false;
		pushStateUrl();
		statusMessage = `${preset.name} installed around seed ${config.seed}.`;
	}

	function newBloom() {
		try {
			config = normalizeConfig({ ...config, seed: generateFriendlySeed() });
			queueBloomDescription();
			pushStateUrl();
			statusMessage = `New bloom grown from seed ${config.seed}.`;
		} catch {
			statusMessage =
				'This browser could not provide secure seed entropy. Enter a seed to grow a new bloom.';
		}
	}

	function resetDefaults() {
		config = { ...DEFAULT_CONFIG };
		queueBloomDescription();
		paused = false;
		allowMotionOverride = false;
		pushStateUrl();
		statusMessage = 'Neon Orchid and the outside-1847 seed restored.';
	}

	function togglePause() {
		if (!config.motionEnabled) {
			config = normalizeConfig({ ...config, motionEnabled: true });
			allowMotionOverride = true;
			paused = false;
			statusMessage = 'Continuous bloom motion enabled.';
			return;
		}

		if (systemMotionBlocked && !allowMotionOverride) {
			allowMotionOverride = true;
			paused = false;
			statusMessage = 'Motion enabled for this bloom despite the reduced-motion preference.';
			return;
		}

		paused = !paused;
		statusMessage = paused ? 'Bloom paused.' : 'Bloom resumed.';
	}

	function toggleView() {
		updateConfig({ view: config.view === 'artwork' ? 'anatomy' : 'artwork' });
	}

	function toggleControls() {
		controlsHidden = !controlsHidden;
		statusMessage = controlsHidden ? 'Studio controls hidden.' : 'Studio controls revealed.';
	}

	function createStatePath() {
		return buildPerlinBloomStatePath(window.location.href, config) as BloomPath;
	}

	function replaceStateUrl() {
		if (!mounted) return;
		const path = createStatePath();
		if (path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
			replaceState(resolve(path), window.history.state);
		}
	}

	function pushStateUrl() {
		if (!mounted) return;
		if (urlTimer) clearTimeout(urlTimer);
		const path = createStatePath();
		if (path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
			pushState(resolve(path), window.history.state);
		}
	}

	async function copyText(text: string) {
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch {
				// Continue to the selection-based fallback for restricted browsing contexts.
			}
		}

		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		document.body.append(textarea);
		textarea.select();
		const copied = document.execCommand('copy');
		textarea.remove();
		if (!copied) throw new Error('Clipboard access was denied.');
	}

	async function copyBloomLink() {
		const url = buildPerlinBloomShareUrl(window.location.href, config);
		try {
			await copyText(url);
			statusMessage = `Bloom link copied for seed ${config.seed}.`;
		} catch {
			statusMessage =
				'This browser blocked clipboard access. The current bloom remains encoded in the address bar.';
			replaceStateUrl();
		}
	}

	async function saveStill() {
		if (exportBusy) return;
		if (canvasStatus !== 'ready') {
			statusMessage = 'The bloom renderer is not ready to export yet.';
			return;
		}

		exportBusy = true;
		statusMessage = `Rendering a deterministic ${exportScale}× PNG…`;
		try {
			const result = await canvas.exportStill({
				scale: exportScale,
				signature: includeSignature,
				filename: `perlin-bloom-${safeFilenamePart(config.preset)}-${safeFilenamePart(config.palette)}-${safeFilenamePart(config.seed)}.png`
			});
			statusMessage = result.wasCapped
				? `The ${exportScale}× request exceeded the safe memory budget; saved ${result.width} × ${result.height} instead.`
				: `PNG saved at ${result.width} × ${result.height}.`;
		} catch {
			statusMessage =
				'The browser could not complete this export. Try a smaller scale or close memory-heavy tabs.';
		} finally {
			exportBusy = false;
		}
	}

	async function toggleFullscreen() {
		if (!fullscreenAvailable) {
			statusMessage = 'Fullscreen is not available in this browser.';
			return;
		}

		try {
			if (document.fullscreenElement === exhibit) await document.exitFullscreen();
			else await exhibit.requestFullscreen();
		} catch {
			statusMessage = 'Fullscreen could not be opened in this browser.';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
		if (isButtonActivation(event)) return;

		const key = event.key.toLocaleLowerCase('en');
		if (event.key === ' ') {
			event.preventDefault();
			togglePause();
		} else if (key === 'r') {
			event.preventDefault();
			newBloom();
		} else if (key === 's') {
			event.preventDefault();
			void saveStill();
		} else if (key === 'f') {
			event.preventDefault();
			void toggleFullscreen();
		} else if (key === 'h') {
			event.preventDefault();
			toggleControls();
		} else if (key === '0') {
			event.preventDefault();
			resetDefaults();
		} else if (key === 'a') {
			event.preventDefault();
			toggleView();
		}
	}

	function restoreFromLocation(kind: 'initial' | 'history') {
		const parameters = new URLSearchParams(window.location.search);
		const parsed = parsePerlinBloomState(parameters);
		config = parsed.config;
		queueBloomDescription(undefined, true);
		paused = !config.motionEnabled;
		allowMotionOverride = false;
		posterMode = parameters.get('pb_poster') === '1';
		debugMode = parameters.get('pb_debug') === '1';
		if (posterMode) paused = true;

		if (parsed.unsupportedVersion) {
			statusMessage = 'An unsupported bloom-link version was repaired with current defaults.';
		} else if (parsed.issues.length > 0) {
			statusMessage = `${parsed.issues.length} malformed bloom setting${parsed.issues.length === 1 ? '' : 's'} repaired.`;
		} else {
			statusMessage =
				kind === 'history'
					? `History restored seed ${config.seed}.`
					: `Bloom restored from seed ${config.seed}.`;
		}
	}

	onMount(() => {
		restoreFromLocation('initial');
		mounted = true;
		fullscreenAvailable =
			document.fullscreenEnabled && typeof exhibit.requestFullscreen === 'function';

		const handlePopstate = () => restoreFromLocation('history');
		const handleFullscreen = () => {
			fullscreen = document.fullscreenElement === exhibit;
			statusMessage = fullscreen ? 'Fullscreen specimen chamber opened.' : 'Fullscreen closed.';
		};

		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('popstate', handlePopstate);
		document.addEventListener('fullscreenchange', handleFullscreen);

		return () => {
			if (urlTimer) clearTimeout(urlTimer);
			if (summaryTimer) clearTimeout(summaryTimer);
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('popstate', handlePopstate);
			document.removeEventListener('fullscreenchange', handleFullscreen);
		};
	});

	$effect(() => {
		const snapshot = { ...config };
		if (!mounted) return;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			void snapshot;
			replaceStateUrl();
		}, 180);
		return () => {
			if (urlTimer) clearTimeout(urlTimer);
		};
	});
</script>

<section
	bind:this={exhibit}
	class:controls-hidden={controlsHidden}
	class:poster-mode={posterMode}
	class:is-fullscreen={fullscreen}
	class="exhibit article-breakout not-prose"
	data-testid="perlin-bloom-exhibit"
	data-preset={config.preset}
	data-palette={config.palette}
	data-view={config.view}
	aria-labelledby={`${uid}-title`}
	tabindex="-1"
>
	<BloomIdentityBar
		titleId={`${uid}-title`}
		{config}
		presets={PRESETS}
		presetName={currentPreset.name}
		paletteName={currentPalette.name}
		morphologyHash={bloomHash}
		paused={effectivelyPaused}
		{posterMode}
		onPreset={applyPreset}
		onSeed={(seed) => updateConfig({ seed })}
		onNewBloom={newBloom}
	/>

	<div class="action-dock" role="group" aria-label="Bloom actions">
		<button type="button" onclick={togglePause} title="Pause · Space">
			{pauseLabel}
		</button>
		<button
			type="button"
			onclick={toggleView}
			aria-pressed={config.view === 'anatomy'}
			title="View · A"
		>
			{config.view === 'artwork' ? 'Anatomy' : 'Artwork'}
		</button>
		<button
			type="button"
			onclick={toggleControls}
			aria-expanded={!controlsHidden}
			title="Studio · H"
		>
			{controlsHidden ? 'Show studio' : 'Hide studio'}
		</button>
		<button
			type="button"
			onclick={saveStill}
			disabled={canvasStatus !== 'ready' || exportBusy}
			title="Save · S"
		>
			{exportBusy ? 'Rendering…' : `Save ${exportScale}×`}
		</button>
		<button type="button" onclick={toggleFullscreen} title="Fullscreen · F">
			{fullscreen ? 'Exit full' : 'Fullscreen'}
		</button>
		<KeyboardHelp />
	</div>

	<div class="laboratory-grid">
		<div class="stage-column">
			<div class="canvas-shell">
				<BloomCanvas
					bind:this={canvas}
					{config}
					{paused}
					{allowMotionOverride}
					{posterMode}
					debug={debugMode}
					{descriptionId}
					onStatus={(status, message) => {
						canvasStatus = status;
						if (message) statusMessage = message;
					}}
					onSystemMotionChange={(blocked) => {
						systemMotionBlocked = blocked;
					}}
				/>

				<div class="stage-readout" aria-hidden="true">
					<span>FIELD · {config.noiseScale.toFixed(2)}</span>
					<span>WARP · {config.domainWarp.toFixed(2)}</span>
					<span>PRESSURE · {config.constraint.toFixed(2)}</span>
				</div>

				<div class="poster-title" aria-hidden="true">
					<p>Generative botany · PB–01</p>
					<h2>Thinking Outside the Box</h2>
					<strong>The Perlin Bloom Engine</strong>
				</div>
			</div>

			<div class="specimen-caption" aria-hidden={posterMode}>
				<span>Pointer bends the outer whorls · tap sends a light pulse</span>
				<strong>{config.petals} petals × {config.whorls} whorls</strong>
			</div>
		</div>

		{#if !controlsHidden}
			<aside class="controls-panel" aria-label="Bloom studio controls">
				<BloomControls
					{config}
					presets={PRESETS}
					{exportScale}
					{includeSignature}
					disabled={exportBusy}
					onPatch={updateConfig}
					onPalette={applyPalette}
					onExportScale={(scale) => (exportScale = scale)}
					onSignature={(include) => (includeSignature = include)}
					onCopyLink={copyBloomLink}
					onReset={resetDefaults}
					onSave={saveStill}
				/>
			</aside>
		{/if}
	</div>

	<p id={descriptionId} class="canvas-description" data-testid="perlin-bloom-summary">
		Interactive generative artwork showing a luminous synthetic flower pressing through a
		transparent square chamber. {bloomDescription} Pointer movement bends nearby outer petals, and a tap
		sends a brief light pulse. All actions also have visible controls.
	</p>

	<p class="status" role="status" aria-live="polite" data-testid="perlin-bloom-status">
		<span aria-hidden="true"></span>{statusMessage}
	</p>
</section>

<style>
	.exhibit {
		--pb-void: #05040f;
		--pb-panel: rgb(7 10 28 / 92%);
		--pb-line: rgb(129 211 255 / 20%);
		--pb-line-bright: rgb(122 238 255 / 45%);
		--pb-ink: #eaf3ff;
		--pb-muted: #95a9c8;
		--pb-cyan: #8df6ff;
		--pb-magenta: #f073ff;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(94rem, calc(100vw - 1rem));
		margin: 1.5rem 0 3rem;
		overflow: hidden;
		transform: translateX(-50%);
		border: 1px solid rgb(126 216 255 / 24%);
		border-radius: 1rem;
		background:
			radial-gradient(circle at 13% 0%, rgb(104 35 155 / 18%), transparent 30rem),
			linear-gradient(145deg, #070511, #050919 58%, #03050d);
		box-shadow:
			0 2rem 5rem rgb(0 0 0 / 42%),
			inset 0 1px rgb(255 255 255 / 5%);
		color: var(--pb-ink);
		font-family: var(--font-sans, sans-serif);
		isolation: isolate;
	}

	.poster-title p,
	.poster-title h2 {
		margin: 0;
	}

	.action-dock {
		position: relative;
		z-index: 10;
		display: flex;
		align-items: stretch;
		flex-wrap: wrap;
		gap: 0.42rem;
		overflow: visible;
		border-bottom: 1px solid var(--pb-line);
		padding: 0.58rem 0.72rem;
		background: linear-gradient(90deg, rgb(12 18 42 / 94%), rgb(14 8 32 / 86%));
	}

	.action-dock > button {
		flex: 0 0 auto;
		min-height: 2.75rem;
		border: 1px solid rgb(139 209 255 / 22%);
		border-radius: 0.65rem;
		background: rgb(9 14 35 / 86%);
		padding: 0.5rem 0.75rem;
		color: #d8eaff;
		font: 700 0.78rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
		white-space: nowrap;
	}

	.action-dock > button:hover {
		border-color: rgb(100 235 255 / 62%);
		background: rgb(23 33 70 / 94%);
	}

	.action-dock > button:disabled {
		cursor: not-allowed;
		opacity: 0.46;
	}

	button:focus-visible {
		outline: 2px solid var(--pb-cyan);
		outline-offset: 2px;
	}

	.laboratory-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem);
		align-items: stretch;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.controls-hidden .laboratory-grid {
		grid-template-columns: 1fr;
	}

	.stage-column {
		display: grid;
		min-width: 0;
		align-content: start;
		gap: 0.45rem;
	}

	.canvas-shell {
		position: relative;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border: 1px solid rgb(134 222 255 / 24%);
		border-radius: 0.8rem;
		background: var(--pb-void);
		box-shadow:
			0 1.2rem 3rem rgb(0 0 0 / 32%),
			inset 0 0 4rem rgb(96 31 157 / 8%);
	}

	.stage-readout {
		position: absolute;
		z-index: 2;
		top: 0.7rem;
		right: 0.7rem;
		display: grid;
		gap: 0.15rem;
		border-right: 1px solid rgb(113 229 255 / 28%);
		padding-right: 0.45rem;
		color: rgb(184 225 255 / 56%);
		font: 650 0.5rem/1.3 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-align: right;
		text-transform: uppercase;
		pointer-events: none;
	}

	.specimen-caption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border: 1px solid rgb(126 211 255 / 12%);
		border-radius: 0.55rem;
		background: rgb(7 11 29 / 68%);
		padding: 0.5rem 0.7rem;
		color: var(--pb-muted);
		font: 520 0.75rem/1.35 var(--font-sans, sans-serif);
	}

	.specimen-caption strong {
		color: #d6e8ff;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.controls-panel {
		min-width: 0;
		max-height: min(50rem, calc(100vh - 8rem));
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-color: rgb(92 178 211 / 54%) transparent;
		scrollbar-width: thin;
	}

	.canvas-description {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}

	.status {
		display: flex;
		min-height: 2.5rem;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		border-top: 1px solid var(--pb-line);
		padding: 0.55rem 0.85rem;
		color: var(--pb-muted);
		font: 540 0.75rem/1.4 var(--font-sans, sans-serif);
	}

	.status > span {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--pb-cyan);
		box-shadow: 0 0 0.65rem rgb(114 237 255 / 68%);
	}

	.poster-title {
		display: none;
	}

	.exhibit:fullscreen,
	.exhibit.is-fullscreen {
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		transform: none;
		border: 0;
		border-radius: 0;
		overflow: auto;
	}

	.exhibit:fullscreen .laboratory-grid,
	.exhibit.is-fullscreen .laboratory-grid {
		min-height: calc(100vh - 13rem);
	}

	.exhibit:fullscreen .canvas-shell,
	.exhibit.is-fullscreen .canvas-shell {
		height: min(72vh, 64rem);
		aspect-ratio: auto;
	}

	.exhibit.poster-mode {
		position: fixed;
		z-index: 9999;
		inset: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		transform: none;
		border: 0;
		border-radius: 0;
		background: #03040d;
	}

	.exhibit.poster-mode .action-dock,
	.exhibit.poster-mode .controls-panel,
	.exhibit.poster-mode .specimen-caption,
	.exhibit.poster-mode .status,
	.exhibit.poster-mode .stage-readout {
		display: none;
	}

	.exhibit.poster-mode .laboratory-grid,
	.exhibit.poster-mode .stage-column,
	.exhibit.poster-mode .canvas-shell {
		width: 100%;
		height: 100%;
		margin: 0;
		border: 0;
		border-radius: 0;
		padding: 0;
	}

	.exhibit.poster-mode .laboratory-grid {
		display: block;
	}

	.exhibit.poster-mode .canvas-shell {
		aspect-ratio: 1200 / 630;
	}

	.exhibit.poster-mode .canvas-shell::after {
		position: absolute;
		z-index: 2;
		inset: 0;
		background:
			linear-gradient(90deg, rgb(3 4 13 / 78%) 0%, transparent 45%),
			linear-gradient(0deg, rgb(3 4 13 / 78%) 0%, transparent 34%);
		content: '';
		pointer-events: none;
	}

	.exhibit.poster-mode .poster-title {
		position: absolute;
		z-index: 3;
		bottom: clamp(2.25rem, 7vw, 5rem);
		left: clamp(2.25rem, 7vw, 5.25rem);
		display: grid;
		max-width: min(40rem, 58vw);
		gap: 0.35rem;
		text-shadow: 0 0.35rem 1.5rem #000;
	}

	.poster-title p {
		color: var(--pb-cyan);
		font: 800 clamp(0.62rem, 1.3vw, 0.9rem)/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.poster-title h2 {
		font: 610 clamp(2.5rem, 6vw, 5.4rem)/0.9 var(--font-serif, serif);
		letter-spacing: -0.055em;
	}

	.poster-title > strong {
		color: #d7dcff;
		font: 580 clamp(1rem, 2.2vw, 1.55rem)/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.03em;
	}

	:global(html[data-theme='high-contrast']) .exhibit,
	:global(html[data-theme='high-contrast']) .canvas-shell,
	:global(html[data-theme='high-contrast']) .action-dock > button {
		border-width: 2px;
		box-shadow: none;
	}

	@media (max-width: 68rem) {
		.laboratory-grid {
			grid-template-columns: minmax(0, 1fr) minmax(17rem, 19rem);
		}
	}

	@media (max-width: 55rem) {
		.laboratory-grid {
			grid-template-columns: 1fr;
		}

		.controls-panel {
			max-height: none;
			overflow: visible;
			overscroll-behavior: auto;
		}

		.canvas-shell {
			aspect-ratio: 4 / 3;
		}
	}

	@media (max-width: 42rem) {
		.exhibit {
			width: min(100%, calc(100vw - 0.5rem));
			border-radius: 0.65rem;
		}

		.laboratory-grid {
			padding: 0.45rem;
		}

		.canvas-shell {
			aspect-ratio: 1 / 1.06;
			border-radius: 0.58rem;
		}

		.stage-readout {
			display: none;
		}

		.specimen-caption {
			display: grid;
			gap: 0.25rem;
		}

		.status {
			padding-right: 0.65rem;
			padding-left: 0.65rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.exhibit *,
		.exhibit *::before,
		.exhibit *::after {
			scroll-behavior: auto;
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.exhibit,
		.action-dock,
		.canvas-shell,
		.specimen-caption,
		.status,
		.action-dock > button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}
		.status > span {
			background: CanvasText;
			box-shadow: none;
		}
	}
</style>
