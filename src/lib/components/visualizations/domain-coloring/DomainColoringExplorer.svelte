<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import DomainColoring2D from './DomainColoring2D.svelte';
	import DomainColoring3D from './DomainColoring3D.svelte';
	import { heightDefinition as describeHeight } from '$lib/visualizations/domain-coloring/height';
	import {
		DOMAIN_COLORING_PRESETS,
		ExpressionError,
		createDefaultExplorerState,
		domainColoringPreset,
		estimateWinding,
		parseExplorerUrlState,
		parseExpression,
		probeExpression,
		serializeExplorerUrlState,
		viewportBounds,
		zoomViewport,
		type CameraState,
		type Complex,
		type ComplexFeature,
		type DomainColoringPreset,
		type ExplorerState,
		type ExpressionNode,
		type ViewMode,
		type Viewport,
		type WindingResult
	} from '$lib/visualizations/domain-coloring';

	const uid = $props.id();
	const fallbackPoster = '/images/domain-coloring-explorer.svg';
	const categoryOrder = [
		'Start here',
		'Zeros, poles, and critical points',
		'Classical maps',
		'Periodicity and growth',
		'Removable and essential singularities',
		'Principal branches and sheets',
		'Non-holomorphic control'
	] as const;
	const guidedTour = ['identity', 'squaring', 'reciprocal', 'rational-map', 'square-root'];
	const initialExplorerState = createDefaultExplorerState();

	let laboratory: HTMLElement;
	let stage2d = $state<DomainColoring2D | undefined>(undefined);
	let stage3d = $state<DomainColoring3D | undefined>(undefined);
	let focusAfterFullscreen: HTMLElement | null = null;
	let explorerState = $state<ExplorerState>(initialExplorerState);
	let functionDraft = $state(initialExplorerState.expression);
	let functionSource = $state(initialExplorerState.expression);
	let activeExpression = $state<ExpressionNode>(parseExpression(initialExplorerState.expression));
	let status = $state('Preparing the synchronized complex-function views…');
	let expressionError = $state('');
	let urlWarnings = $state<string[]>([]);
	let twoDStatus = $state<'ready' | 'fallback' | 'context-lost'>('ready');
	let threeDStatus = $state<'loading' | 'ready' | 'fallback' | 'context-lost'>('loading');
	let meshStatus = $state('Terrain sampling has not started.');
	let fullscreen = $state(false);
	let smallViewport = $state(false);
	let hoverPoint = $state<Complex>({ re: 0.75, im: 0.5 });
	let pinnedPoint = $state<Complex | null>(null);
	let windingResult = $state<WindingResult | null>(null);
	let liveProbeAnnouncement = $state('');

	let activePreset = $derived(
		explorerState.presetId ? domainColoringPreset(explorerState.presetId) : undefined
	);
	let bounds = $derived(viewportBounds(explorerState.viewport));
	let visibleFeatures = $derived.by(() => featuresInView(activePreset, bounds));
	let hoverProbe = $derived(
		probeExpression(
			activeExpression,
			hoverPoint,
			explorerState.height,
			activePreset,
			visibleFeatures,
			Math.min(explorerState.viewport.spanRe, explorerState.viewport.spanIm) / 180
		)
	);
	let pinnedProbe = $derived(
		pinnedPoint
			? probeExpression(
					activeExpression,
					pinnedPoint,
					explorerState.height,
					activePreset,
					visibleFeatures,
					Math.min(explorerState.viewport.spanRe, explorerState.viewport.spanIm) / 180
				)
			: null
	);
	let displayedProbe = $derived(pinnedProbe ?? hoverProbe);
	let rangeLabel = $derived(
		`Re ${formatNumber(bounds.minRe)} to ${formatNumber(bounds.maxRe)} · Im ${formatNumber(bounds.minIm)} to ${formatNumber(bounds.maxIm)}`
	);
	let heightDefinition = $derived(describeHeight(explorerState.height));
	let sheetProjectionDescription = $derived.by(() => {
		if (activePreset?.sheets?.kind === 'log') {
			return 'Log sheet projection: (Re z, Im z, (θ + 2πk)/π); colour encodes ln r. This is a finite window of an infinite covering.';
		}
		if (activePreset?.sheets) {
			return `Root-sheet projection: (Re z, Im z, Re w); colour encodes Im w. The screen projection may self-intersect without the abstract surface being singular.`;
		}
		return '';
	});
	let sheetWindowLabel = $derived.by(() => {
		if (!activePreset?.sheets) return '';
		if (!explorerState.allSheets)
			return 'Displayed branch: principal sheet k = 0 with an open cut boundary.';
		if (activePreset.sheets.kind === 'sqrt')
			return 'Displayed sheet indices: k = 0, 1, cyclically joined across paired cut edges.';
		if (activePreset.sheets.kind === 'cuberoot')
			return 'Displayed sheet indices: k = 0, 1, 2, cyclically joined across paired cut edges.';
		return `Displayed finite sheet indices: k = −${explorerState.sheetRange}, …, 0, …, +${explorerState.sheetRange}; adjacent turns differ by 2πi.`;
	});
	let sheetExportWindowLabel = $derived.by(() => {
		if (!activePreset?.sheets) return '';
		const indices = !explorerState.allSheets
			? 'k = 0'
			: activePreset.sheets.kind === 'sqrt'
				? 'k = 0, 1'
				: activePreset.sheets.kind === 'cuberoot'
					? 'k = 0, 1, 2'
					: `k = −${explorerState.sheetRange}, …, +${explorerState.sheetRange}`;
		const innerRadius = activePreset.sheets.kind === 'log' ? explorerState.sheetRadialMin : 0;
		return `Sheet indices ${indices} · inner radial boundary r = ${formatNumber(innerRadius, 3)} · outer radial boundary r = ${formatNumber(explorerState.sheetRadialMax, 3)}`;
	});
	let currentDescription = $derived(
		explorerState.viewMode === 'sheets'
			? `${activePreset?.notation ?? `f(z) = ${functionSource}`}. ${activePreset?.summary ?? ''} ${viewDescription('sheets')} ${sheetProjectionDescription} ${sheetWindowLabel}`
			: `${activePreset?.notation ?? `f(z) = ${functionSource}`}. ${activePreset?.summary ?? 'Safely parsed custom expression.'} ${viewDescription(explorerState.viewMode)} The selected vertical quantity is ${explorerState.height.lens}: ${heightDefinition}. Domain: ${rangeLabel}. This is a projection of a four-real-dimensional graph, not the complete graph itself.`
	);

	function featuresInView(
		preset: DomainColoringPreset | undefined,
		visibleBounds: ReturnType<typeof viewportBounds>
	): ComplexFeature[] {
		if (!preset) return [];
		const finite = preset.features.filter(
			(feature) =>
				feature.z.re >= visibleBounds.minRe &&
				feature.z.re <= visibleBounds.maxRe &&
				feature.z.im >= visibleBounds.minIm &&
				feature.z.im <= visibleBounds.maxIm
		);
		const generated =
			preset.featureFamilies?.flatMap((family) => family.generate(visibleBounds, 24)) ?? [];
		return [...finite, ...generated].slice(0, 32);
	}

	function viewDescription(viewMode: ViewMode) {
		if (viewMode === '2d')
			return 'The 2D field maps output phase to hue and magnitude to logarithmic contours.';
		if (viewMode === '3d')
			return 'The 3D landscape raises the selected scalar above the input plane and retains phase colour.';
		if (viewMode === 'comparison')
			return 'The same mathematical domain is shown simultaneously in 2D and 3D.';
		return explorerState.allSheets
			? 'The curated sheet view constructs and joins the displayed branches; it is separate from the ordinary height field.'
			: 'The curated sheet view displays one chosen branch with two open cut edges; it is separate from the ordinary height field.';
	}

	function formatNumber(value: number | null, digits = 5) {
		if (value === null) return '—';
		if (value === Number.POSITIVE_INFINITY) return '+∞';
		if (value === Number.NEGATIVE_INFINITY) return '−∞';
		if (!Number.isFinite(value)) return 'undefined';
		if (Math.abs(value) >= 10_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.0001)) {
			return value.toExponential(3);
		}
		const rounded = Number(value.toFixed(digits));
		return Object.is(rounded, -0) ? '0' : String(rounded);
	}

	function formatComplex(value: Complex) {
		const sign = value.im < 0 ? '−' : '+';
		return `${formatNumber(value.re)} ${sign} ${formatNumber(Math.abs(value.im))}i`;
	}

	function updateState(next: ExplorerState, message?: string) {
		explorerState = next;
		windingResult = null;
		if (message) status = message;
	}

	function patchState(patch: Partial<ExplorerState>, message?: string) {
		updateState({ ...explorerState, ...patch }, message);
	}

	function applyFunction() {
		try {
			const parsed = parseExpression(functionDraft);
			activeExpression = parsed;
			functionSource = functionDraft.trim();
			explorerState = {
				...explorerState,
				presetId: null,
				expression: functionSource,
				viewMode:
					explorerState.viewMode === 'sheets'
						? smallViewport
							? '2d'
							: 'comparison'
						: explorerState.viewMode
			};
			expressionError = '';
			pinnedPoint = null;
			windingResult = null;
			status = `Rendered the custom expression f(z) = ${functionSource}. The previous camera and domain were retained; curated sheet mode was closed if necessary.`;
		} catch (error) {
			expressionError =
				error instanceof ExpressionError
					? error.message
					: 'This function could not be drawn. Try one of the examples.';
			status = 'The previous valid function remains in every view.';
		}
	}

	function choosePreset(id: string) {
		const preset = domainColoringPreset(id);
		if (!preset) return;
		const next = createDefaultExplorerState(preset.id);
		next.viewMode =
			explorerState.viewMode === 'sheets' && !preset.sheets
				? smallViewport
					? '2d'
					: 'comparison'
				: explorerState.viewMode;
		activeExpression = parseExpression(preset.expression);
		functionDraft = preset.expression;
		functionSource = preset.expression;
		explorerState = next;
		pinnedPoint = null;
		windingResult = null;
		expressionError = '';
		status = `${preset.label} selected. ${preset.notice}`;
	}

	function selectView(viewMode: ViewMode) {
		if (viewMode === 'sheets' && !activePreset?.sheets) {
			status =
				'Riemann sheets are available only for the curated square root, cube root, and logarithm presets.';
			return;
		}
		patchState({ viewMode }, `${viewDescription(viewMode)}`);
	}

	function setViewport(viewport: Viewport) {
		patchState({ viewport }, 'The shared mathematical domain changed in both views.');
	}

	function setDomainField(key: keyof Viewport, value: number, minimum: number, maximum: number) {
		if (!Number.isFinite(value) || value < minimum || value > maximum) {
			status = `Ignored an invalid ${key} value.`;
			return;
		}
		setViewport({ ...explorerState.viewport, [key]: value });
	}

	function zoomDomain(factor: number) {
		setViewport(zoomViewport(explorerState.viewport, 0.5, 0.5, 1, 1, factor));
	}

	function panDomain(realFraction: number, imaginaryFraction: number) {
		setViewport({
			...explorerState.viewport,
			centerRe: explorerState.viewport.centerRe + explorerState.viewport.spanRe * realFraction,
			centerIm: explorerState.viewport.centerIm + explorerState.viewport.spanIm * imaginaryFraction
		});
	}

	function resetFunctionView() {
		const defaults = createDefaultExplorerState(activePreset?.id ?? 'identity');
		explorerState = {
			...explorerState,
			viewport: { ...defaults.viewport },
			height: { ...defaults.height },
			overlays: { ...defaults.overlays },
			quality: defaults.quality,
			sheetRange: defaults.sheetRange,
			sheetRadialMin: defaults.sheetRadialMin,
			sheetRadialMax: defaults.sheetRadialMax,
			allSheets: defaults.allSheets,
			loop: null
		};
		pinnedPoint = null;
		windingResult = null;
		status = 'Function view reset. The 3D camera was left unchanged.';
	}

	function resetCamera() {
		const camera = { ...(activePreset?.camera ?? createDefaultExplorerState().camera) };
		patchState({ camera }, 'Camera reset. The mathematical domain was left unchanged.');
	}

	function updateCamera(camera: CameraState) {
		explorerState = { ...explorerState, camera };
	}

	function cameraPresetSelected(orientation: CameraState['orientation']) {
		if (orientation !== 'top' || !explorerState.overlays.lighting) return;
		patchState(
			{ overlays: { ...explorerState.overlays, lighting: false } },
			'Top camera selected with geometry lighting disabled; phase colour and contours are unchanged.'
		);
	}

	function pinProbe(z: Complex) {
		pinnedPoint = z;
		const result = probeExpression(
			activeExpression,
			z,
			explorerState.height,
			activePreset,
			visibleFeatures,
			Math.min(explorerState.viewport.spanRe, explorerState.viewport.spanIm) / 180
		);
		liveProbeAnnouncement = `Probe pinned at z ${formatComplex(z)}. f(z) ${formatComplex(result.value)}. Status: ${result.statusDetail}`;
		status = 'Probe pinned in the synchronized views.';
	}

	function enableLoop() {
		const radius = Math.min(explorerState.viewport.spanRe, explorerState.viewport.spanIm) * 0.23;
		patchState(
			{
				loop: explorerState.loop
					? null
					: {
							center: { re: explorerState.viewport.centerRe, im: explorerState.viewport.centerIm },
							radius
						}
			},
			explorerState.loop
				? 'Winding loop removed.'
				: 'Counterclockwise winding loop added. Run the estimate when its path is clear.'
		);
	}

	function runWinding() {
		if (!explorerState.loop) return;
		windingResult = estimateWinding(activeExpression, explorerState.loop, {
			bounds,
			preset: activePreset,
			minimumSamples: 64,
			maximumSamples: 4_096
		});
		status = windingResult.detail;
	}

	function moveLoop(deltaRe: number, deltaIm: number) {
		if (!explorerState.loop) return;
		patchState({
			loop: {
				...explorerState.loop,
				center: {
					re: explorerState.loop.center.re + deltaRe,
					im: explorerState.loop.center.im + deltaIm
				}
			}
		});
	}

	async function copyLink() {
		try {
			const url = new SvelteURL(window.location.href);
			url.search = serializeExplorerUrlState(explorerState, url.searchParams).toString();
			window.history.replaceState(window.history.state, '', url.href);
			await navigator.clipboard.writeText(url.toString());
			status = 'A bounded, versioned link to this deterministic view was copied.';
		} catch {
			status = 'Clipboard access was denied. The current address still contains the share state.';
		}
	}

	async function exportPng() {
		try {
			const source =
				explorerState.viewMode === '2d' || threeDStatus === 'fallback'
					? stage2d?.captureCanvas()
					: stage3d?.captureCanvas();
			if (!source || source.width < 2 || source.height < 2)
				throw new Error('The selected canvas is not ready.');
			const { exportLaboratoryPng } = await import('$lib/visualizations/domain-coloring/export');
			const result = await exportLaboratoryPng({
				source,
				state: explorerState,
				functionLabel: activePreset?.notation ?? `f(z) = ${functionSource}`,
				heightDefinition:
					explorerState.viewMode === 'sheets' ? sheetProjectionDescription : heightDefinition,
				domainLabel: explorerState.viewMode === 'sheets' ? sheetExportWindowLabel : undefined,
				viewLegend: explorerState.viewMode === 'sheets' ? sheetWindowLabel : undefined,
				sheetColourLabel:
					explorerState.viewMode === 'sheets'
						? activePreset?.sheets?.kind === 'log'
							? 'ln r'
							: 'Im w'
						: undefined
			});
			status = `PNG exported at ${result.width} × ${result.height} with the function, ${explorerState.viewMode === 'sheets' ? 'sheet window and projection' : 'domain and height lens'}, legend, and credit.`;
		} catch (error) {
			status =
				error instanceof Error ? `PNG export failed: ${error.message}` : 'PNG export failed.';
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === laboratory) {
				await document.exitFullscreen();
				return;
			}
			focusAfterFullscreen = document.activeElement as HTMLElement | null;
			await laboratory.requestFullscreen();
			await tick();
			const focusTarget = laboratory.querySelector<HTMLElement>('canvas[tabindex="0"]');
			focusTarget?.focus();
		} catch {
			status = 'Fullscreen is unavailable in this browser or embedding context.';
		}
	}

	function updateOverlay(key: keyof ExplorerState['overlays'], value: boolean) {
		patchState({ overlays: { ...explorerState.overlays, [key]: value } });
	}

	function updateHeight(key: keyof ExplorerState['height'], value: number | string) {
		patchState({ height: { ...explorerState.height, [key]: value } as ExplorerState['height'] });
	}

	function setLoopValue(key: 're' | 'im' | 'radius', value: number) {
		if (!explorerState.loop || !Number.isFinite(value)) return;
		const next =
			key === 'radius'
				? { ...explorerState.loop, radius: Math.max(1e-5, value) }
				: { ...explorerState.loop, center: { ...explorerState.loop.center, [key]: value } };
		patchState({ loop: next });
	}

	onMount(() => {
		const initialParameters = new URLSearchParams(window.location.search);
		const parsed = parseExplorerUrlState(window.location.search);
		urlWarnings = [...parsed.warnings];
		explorerState = parsed.state;
		const restoredPreset = explorerState.presetId
			? domainColoringPreset(explorerState.presetId)
			: undefined;
		try {
			activeExpression = parseExpression(explorerState.expression);
			functionDraft = explorerState.expression;
			functionSource = explorerState.expression;
		} catch {
			const fallback = createDefaultExplorerState();
			explorerState = fallback;
			activeExpression = parseExpression(fallback.expression);
			functionDraft = fallback.expression;
			functionSource = fallback.expression;
			urlWarnings = [...urlWarnings, 'The shared expression was invalid; restored identity.'];
		}
		const media = window.matchMedia('(max-width: 760px)');
		const updateSmall = () => {
			smallViewport = media.matches;
		};
		updateSmall();
		if (smallViewport && explorerState.viewMode === 'comparison' && !initialParameters.has('dcm')) {
			explorerState = { ...explorerState, viewMode: '2d' };
		}
		media.addEventListener('change', updateSmall);
		status =
			initialParameters.get('webgl') === 'off'
				? 'WebGL is disabled. The honest static poster and full server-rendered mathematics remain available.'
				: urlWarnings.length
					? `${urlWarnings.join(' ')} ${restoredPreset?.label ?? 'Custom expression'} is ready.`
					: `${restoredPreset?.label ?? 'Custom expression'} restored. Choose a view or pin a probe point.`;
		const fullscreenChanged = () => {
			fullscreen = document.fullscreenElement === laboratory;
			if (!fullscreen && focusAfterFullscreen) {
				focusAfterFullscreen.focus();
				focusAfterFullscreen = null;
			}
		};
		document.addEventListener('fullscreenchange', fullscreenChanged);
		return () => {
			media.removeEventListener('change', updateSmall);
			document.removeEventListener('fullscreenchange', fullscreenChanged);
		};
	});
</script>

<section
	bind:this={laboratory}
	class:fullscreen
	class="domain-lab article-breakout not-prose"
	aria-labelledby={`${uid}-heading`}
	data-testid="domain-coloring-lab"
>
	<header class="lab-header">
		<div>
			<p class="lab-kicker">Interactive laboratory · Complex analysis</p>
			<h2 id={`${uid}-heading`}>Complex functions as landscapes</h2>
			<p class="lab-subtitle">
				Synchronized projections, numerical probes, winding, and curated sheets.
			</p>
		</div>
		<p class="lab-status" aria-live="polite">{status}</p>
	</header>
	{#if twoDStatus !== 'ready'}
		<p class="static-calibration" role="status">
			The visible static poster is an identity-function calibration, not a rendering of the
			currently selected function. The numerical controls and article remain available.
		</p>
	{/if}

	<div class="function-panel" data-tts-exclude>
		<form
			class="function-form"
			onsubmit={(event) => {
				event.preventDefault();
				applyFunction();
			}}
		>
			<label for={`${uid}-function`}>Complex function <span>f(z) =</span></label>
			<div class="function-row">
				<input
					id={`${uid}-function`}
					type="text"
					bind:value={functionDraft}
					maxlength="180"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					aria-describedby={`${uid}-syntax ${expressionError ? `${uid}-error` : ''}`}
				/>
				<button type="submit">Draw function</button>
			</div>
			<p id={`${uid}-syntax`} class="syntax-help">
				Use z, i, + − * / ^, parentheses, exp, log, sin, cos, tan, sqrt, abs, conj, or sinc.
			</p>
			{#if expressionError}<p id={`${uid}-error`} class="expression-error" role="alert">
					{expressionError}
				</p>{/if}
		</form>

		<div class="preset-control">
			<label for={`${uid}-preset`}
				>Grouped examples · {DOMAIN_COLORING_PRESETS.length} presets</label
			>
			<select
				id={`${uid}-preset`}
				value={explorerState.presetId ?? 'custom'}
				onchange={(event) => {
					if (event.currentTarget.value !== 'custom') choosePreset(event.currentTarget.value);
				}}
			>
				{#if !explorerState.presetId}<option value="custom">Custom expression</option>{/if}
				{#each categoryOrder as category (category)}
					<optgroup label={category}>
						{#each DOMAIN_COLORING_PRESETS.filter((preset) => preset.category === category) as preset (preset.id)}
							<option value={preset.id}>{preset.label} · {preset.expression}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			<p>
				{activePreset?.summary ??
					'A safely parsed custom function; numerical classifications remain provisional.'}
			</p>
		</div>
	</div>

	<nav class="guided-tour" aria-label="Short guided tour" data-tts-exclude>
		<span>Start here</span>
		{#each guidedTour as id (id)}
			{@const preset = domainColoringPreset(id)}
			{#if preset}
				<button
					type="button"
					class:active={explorerState.presetId === id}
					onclick={() => choosePreset(id)}>{preset.label}</button
				>
			{/if}
		{/each}
	</nav>

	<div class="view-tabs" role="group" aria-label="Laboratory view" data-tts-exclude>
		<button
			type="button"
			aria-pressed={explorerState.viewMode === '2d'}
			onclick={() => selectView('2d')}>2D field</button
		>
		<button
			type="button"
			aria-pressed={explorerState.viewMode === '3d'}
			onclick={() => selectView('3d')}>3D landscape</button
		>
		<button
			class="comparison-tab"
			type="button"
			aria-pressed={explorerState.viewMode === 'comparison'}
			onclick={() => selectView('comparison')}>Comparison</button
		>
		<button
			type="button"
			disabled={!activePreset?.sheets}
			aria-pressed={explorerState.viewMode === 'sheets'}
			onclick={() => selectView('sheets')}>Riemann sheets</button
		>
	</div>

	<div class:comparison={explorerState.viewMode === 'comparison'} class="stage-grid">
		{#if explorerState.viewMode === '2d' || explorerState.viewMode === 'comparison' || ((explorerState.viewMode === '3d' || explorerState.viewMode === 'sheets') && threeDStatus === 'fallback')}
			<div class="stage-panel">
				<div class="stage-label"><span>2D</span><span>domain pan/zoom · exact location</span></div>
				<DomainColoring2D
					bind:this={stage2d}
					explorer={explorerState}
					node={activeExpression}
					{functionSource}
					{fallbackPoster}
					{pinnedPoint}
					features={visibleFeatures}
					descriptionId={`${uid}-description`}
					onviewport={setViewport}
					onhover={(z) => (hoverPoint = z)}
					onpin={pinProbe}
					onreset={resetFunctionView}
					onstatus={(next, message) => {
						twoDStatus = next;
						if (next !== 'ready') status = message;
					}}
				/>
			</div>
		{/if}
		{#if explorerState.viewMode === '3d' || explorerState.viewMode === 'comparison' || explorerState.viewMode === 'sheets'}
			{#if threeDStatus !== 'fallback' || explorerState.viewMode === 'comparison'}
				<div class="stage-panel">
					<div class="stage-label">
						<span>{explorerState.viewMode === 'sheets' ? 'Sheets' : '3D'}</span>
						<span
							>{explorerState.viewMode === 'sheets'
								? explorerState.allSheets
									? 'connected displayed model'
									: 'principal branch · open cuts'
								: 'camera orbit/pan/dolly'}</span
						>
					</div>
					<DomainColoring3D
						bind:this={stage3d}
						explorer={explorerState}
						node={activeExpression}
						preset={activePreset}
						{functionSource}
						{fallbackPoster}
						{pinnedPoint}
						descriptionId={`${uid}-description`}
						oncamera={updateCamera}
						oncamerapreset={cameraPresetSelected}
						onpin={pinProbe}
						onmeshstatus={(message) => (meshStatus = message)}
						onstatus={(next, message) => {
							threeDStatus = next;
							if (next !== 'ready') status = message;
						}}
					/>
				</div>
			{/if}
		{/if}
	</div>

	<div class="control-deck" data-tts-exclude>
		<details open>
			<summary
				>{explorerState.viewMode === 'sheets'
					? 'Sheet projection and sampling'
					: 'Projection and height'}</summary
			>
			{#if explorerState.viewMode === 'sheets'}
				<div class="control-grid">
					<label>
						<span>Camera projection</span>
						<select
							value={explorerState.camera.projection}
							onchange={(event) =>
								patchState({
									camera: {
										...explorerState.camera,
										projection: event.currentTarget.value as 'orthographic' | 'perspective'
									}
								})}
						>
							<option value="orthographic">Orthographic</option>
							<option value="perspective">Perspective</option>
						</select>
					</label>
					<label>
						<span>Sheet sampling quality</span>
						<select
							value={explorerState.quality}
							onchange={(event) =>
								patchState({ quality: event.currentTarget.value as ExplorerState['quality'] })}
						>
							<option value="low">Low · phone preview</option>
							<option value="medium">Medium</option>
							<option value="high">High · refined</option>
						</select>
					</label>
				</div>
				<p class="formula-note">{sheetProjectionDescription}</p>
			{:else}
				<div class="control-grid">
					<label>
						<span>Height lens</span>
						<select
							value={explorerState.height.lens}
							onchange={(event) => updateHeight('lens', event.currentTarget.value)}
						>
							<option value="log-magnitude">Log magnitude · log₂|f|</option>
							<option value="real">Real output · symlog Re f</option>
							<option value="imaginary">Imaginary output · symlog Im f</option>
							<option value="phase">Principal phase · Arg f / π</option>
							<option value="flat">Flat · h = 0</option>
						</select>
					</label>
					<label>
						<span
							>Vertical exaggeration <output
								>{formatNumber(explorerState.height.verticalScale, 2)}×</output
							></span
						>
						<input
							type="range"
							min="0.1"
							max="3"
							step="0.05"
							value={explorerState.height.verticalScale}
							oninput={(event) => updateHeight('verticalScale', Number(event.currentTarget.value))}
						/>
					</label>
					{#if explorerState.height.lens === 'log-magnitude'}
						<label>
							<span
								>Symmetric log cap <output>±{formatNumber(explorerState.height.logCap, 1)}</output
								></span
							>
							<input
								type="range"
								min="1"
								max="12"
								step="0.5"
								value={explorerState.height.logCap}
								oninput={(event) => updateHeight('logCap', Number(event.currentTarget.value))}
							/>
						</label>
						<label>
							<span>Log transform</span>
							<select
								value={explorerState.height.compression}
								onchange={(event) => updateHeight('compression', event.currentTarget.value)}
							>
								<option value="linear">Literal linear log height</option>
								<option value="asinh">asinh compression</option>
							</select>
						</label>
					{:else if explorerState.height.lens === 'real' || explorerState.height.lens === 'imaginary'}
						<label>
							<span
								>Symlog scale a <output
									>{formatNumber(explorerState.height.componentScale, 2)}</output
								></span
							>
							<input
								type="range"
								min="0.1"
								max="5"
								step="0.1"
								value={explorerState.height.componentScale}
								oninput={(event) =>
									updateHeight('componentScale', Number(event.currentTarget.value))}
							/>
						</label>
						<label>
							<span
								>Component cap <output>±{formatNumber(explorerState.height.componentCap, 1)}</output
								></span
							>
							<input
								type="range"
								min="1"
								max="12"
								step="0.5"
								value={explorerState.height.componentCap}
								oninput={(event) => updateHeight('componentCap', Number(event.currentTarget.value))}
							/>
						</label>
					{/if}
					<label>
						<span>Camera projection</span>
						<select
							value={explorerState.camera.projection}
							onchange={(event) =>
								patchState({
									camera: {
										...explorerState.camera,
										projection: event.currentTarget.value as 'orthographic' | 'perspective'
									}
								})}
						>
							<option value="orthographic">Orthographic</option>
							<option value="perspective">Perspective</option>
						</select>
					</label>
					<label>
						<span>Adaptive quality</span>
						<select
							value={explorerState.quality}
							onchange={(event) =>
								patchState({ quality: event.currentTarget.value as ExplorerState['quality'] })}
						>
							<option value="low">Low · phone preview</option>
							<option value="medium">Medium</option>
							<option value="high">High · refined</option>
						</select>
					</label>
				</div>
				<p class="formula-note">{heightDefinition}</p>
				{#if explorerState.height.lens === 'phase'}<p class="warning-note">
						Principal phase height must expose a seam at −π/π. It is not a globally unwrapped
						intrinsic surface.
					</p>{/if}
				{#if explorerState.height.lens === 'log-magnitude' && explorerState.height.compression === 'asinh'}<p
						class="warning-note"
					>
						Nonlinear asinh compression changes slopes and curvature. Harmonic-surface claims apply
						only to the literal linear log lens before clipping.
					</p>{/if}
			{/if}
		</details>

		<details>
			<summary
				>{explorerState.viewMode === 'sheets'
					? 'Sheet camera and overlays'
					: 'Domain, camera, and overlays'}</summary
			>
			{#if explorerState.viewMode !== 'sheets'}
				<div class="action-row" aria-label="Domain pan and zoom controls">
					<span>Domain</span>
					<button type="button" onclick={() => panDomain(-0.12, 0)}>Pan left</button>
					<button type="button" onclick={() => panDomain(0.12, 0)}>Pan right</button>
					<button type="button" onclick={() => panDomain(0, 0.12)}>Pan up</button>
					<button type="button" onclick={() => panDomain(0, -0.12)}>Pan down</button>
					<button type="button" onclick={() => zoomDomain(0.72)}>Zoom in</button>
					<button type="button" onclick={() => zoomDomain(1.38)}>Zoom out</button>
				</div>
				<div class="numeric-domain">
					<label
						>Centre Re <input
							type="number"
							step="any"
							value={explorerState.viewport.centerRe}
							onchange={(event) =>
								setDomainField('centerRe', Number(event.currentTarget.value), -1e6, 1e6)}
						/></label
					>
					<label
						>Centre Im <input
							type="number"
							step="any"
							value={explorerState.viewport.centerIm}
							onchange={(event) =>
								setDomainField('centerIm', Number(event.currentTarget.value), -1e6, 1e6)}
						/></label
					>
					<label
						>Real span <input
							type="number"
							min="0.00001"
							max="1000000"
							step="any"
							value={explorerState.viewport.spanRe}
							onchange={(event) =>
								setDomainField('spanRe', Number(event.currentTarget.value), 1e-5, 1e6)}
						/></label
					>
					<label
						>Imaginary span <input
							type="number"
							min="0.00001"
							max="1000000"
							step="any"
							value={explorerState.viewport.spanIm}
							onchange={(event) =>
								setDomainField('spanIm', Number(event.currentTarget.value), 1e-5, 1e6)}
						/></label
					>
				</div>
			{/if}
			<div class="toggle-grid">
				{#each explorerState.viewMode === 'sheets' ? [['grid', 'Input-plane reference grid'], ['markers', 'Known branch-point markers'], ['mesh', 'Sheet construction mesh'], ['lighting', 'Neutral geometry lighting']] : [['contours', 'Magnitude and phase contours'], ['grid', 'Input-plane grid and axes'], ['markers', 'Known feature markers'], ['mesh', 'Surface mesh'], ['lighting', 'Neutral geometry lighting'], ['caps', 'Clipping-cap indicators']] as item (item[0])}
					<label
						><input
							type="checkbox"
							checked={explorerState.overlays[item[0] as keyof ExplorerState['overlays']]}
							onchange={(event) =>
								updateOverlay(
									item[0] as keyof ExplorerState['overlays'],
									event.currentTarget.checked
								)}
						/>
						{item[1]}</label
					>
				{/each}
			</div>
			<div class="action-row">
				<button type="button" onclick={resetFunctionView}
					>{explorerState.viewMode === 'sheets'
						? 'Reset sheet view'
						: 'Reset function view'}</button
				>
				<button type="button" onclick={resetCamera}>Reset camera</button>
			</div>
			{#if explorerState.viewMode !== 'sheets'}<p class="formula-note">{rangeLabel}</p>{/if}
			<p class="mesh-note">{meshStatus}</p>
		</details>

		{#if explorerState.viewMode === 'sheets' && activePreset?.sheets}
			<details open>
				<summary>Displayed sheet window</summary>
				<div class="control-grid">
					<label
						><span>Branch display</span><select
							value={explorerState.allSheets ? 'all' : 'principal'}
							onchange={(event) => patchState({ allSheets: event.currentTarget.value === 'all' })}
							><option value="principal">Principal branch only</option><option value="all"
								>All displayed sheets</option
							></select
						></label
					>
					{#if activePreset.sheets.kind === 'log'}<label
							><span>Log sheets each side <output>{explorerState.sheetRange}</output></span><input
								type="range"
								min="1"
								max="5"
								step="1"
								value={explorerState.sheetRange}
								oninput={(event) => patchState({ sheetRange: Number(event.currentTarget.value) })}
							/></label
						>{/if}
					<label
						><span
							>Outer radial boundary <output>{formatNumber(explorerState.sheetRadialMax, 2)}</output
							></span
						><input
							type="range"
							min="1"
							max="8"
							step="0.1"
							value={explorerState.sheetRadialMax}
							oninput={(event) => patchState({ sheetRadialMax: Number(event.currentTarget.value) })}
						/></label
					>
					{#if activePreset.sheets.kind === 'log'}<label
							><span
								>Inner radial boundary <output
									>{formatNumber(explorerState.sheetRadialMin, 2)}</output
								></span
							><input
								type="range"
								min="0.03"
								max="1"
								step="0.01"
								value={explorerState.sheetRadialMin}
								oninput={(event) =>
									patchState({ sheetRadialMin: Number(event.currentTarget.value) })}
							/></label
						>{/if}
				</div>
				<p class="formula-note">{sheetWindowLabel}</p>
				<p class="warning-note">
					{explorerState.allSheets
						? activePreset.sheets.description
						: 'Only the curated principal branch is displayed; its two cut edges remain open.'}
					Bright lines mark displayed surface edges. The named open edges in principal mode are cut boundaries;
					radial and top/bottom limits are finite display boundaries, not extra cuts.
				</p>
			</details>
		{/if}
	</div>

	<section class="probe-panel" aria-labelledby={`${uid}-probe-heading`}>
		<div class="panel-heading">
			<div>
				<p class="panel-kicker">Numerical probe</p>
				<h3 id={`${uid}-probe-heading`}>
					{explorerState.viewMode === 'sheets'
						? 'Principal-value probe at the selected domain point'
						: pinnedProbe
							? 'Pinned synchronized sample'
							: 'Pointer sample'}
				</h3>
			</div>
			{#if pinnedPoint}<button
					type="button"
					onclick={() => {
						pinnedPoint = null;
						liveProbeAnnouncement = 'Pinned probe cleared.';
					}}>Clear pin</button
				>{/if}
		</div>
		<dl class="probe-grid">
			<div>
				<dt>Input z</dt>
				<dd>{formatComplex(displayedProbe.z)}</dd>
			</div>
			<div>
				<dt>{explorerState.viewMode === 'sheets' ? 'Principal output f(z)' : 'Output f(z)'}</dt>
				<dd>{formatComplex(displayedProbe.value)}</dd>
			</div>
			<div>
				<dt>Modulus |f|</dt>
				<dd>{formatNumber(displayedProbe.modulus)}</dd>
			</div>
			<div>
				<dt>Principal phase</dt>
				<dd>
					{formatNumber(displayedProbe.phase)} rad · {formatNumber(displayedProbe.phaseDegrees, 2)}°
				</dd>
			</div>
			<div>
				<dt>Unclipped log₂|f|</dt>
				<dd>{formatNumber(displayedProbe.logMagnitude)}</dd>
			</div>
			{#if explorerState.viewMode !== 'sheets'}
				<div>
					<dt>Selected raw quantity</dt>
					<dd>{formatNumber(displayedProbe.height.raw)}</dd>
				</div>
				<div>
					<dt>Displayed height</dt>
					<dd>
						{formatNumber(displayedProbe.height.displayed)} · {displayedProbe.height.clipped ===
						'none'
							? 'not clipped'
							: `clipped ${displayedProbe.height.clipped}`}
					</dd>
				</div>
			{/if}
			<div>
				<dt>Status</dt>
				<dd>{displayedProbe.status} · {displayedProbe.statusDetail}</dd>
			</div>
			<div>
				<dt>Numerical f′(z)</dt>
				<dd>
					{displayedProbe.derivative
						? formatComplex(displayedProbe.derivative)
						: 'suppressed or unavailable'}
				</dd>
			</div>
			<div>
				<dt>Local scale / rotation</dt>
				<dd>
					{formatNumber(displayedProbe.localScale)} · {displayedProbe.localRotation === null
						? 'rotation undefined'
						: `${formatNumber(displayedProbe.localRotation)} rad`}
				</dd>
			</div>
		</dl>
		<p class="probe-note">
			{explorerState.viewMode === 'sheets'
				? 'A sheet click is raycast to its input z, but this shared probe deliberately reports the principal expression value at z; it does not pretend to identify an overlapping projected sheet. Press Enter on the canvas to pin the domain centre.'
				: 'Hover values are visual-only. Pin a point with a click or tap, or press Enter on a focused canvas to pin the domain centre. Custom-expression zero-like or pole-like samples are numerical clues, not proofs.'}
		</p>
	</section>

	{#if explorerState.viewMode !== 'sheets'}
		<section class="winding-panel" aria-labelledby={`${uid}-winding-heading`}>
			<div class="panel-heading">
				<div>
					<p class="panel-kicker">Argument-principle loop</p>
					<h3 id={`${uid}-winding-heading`}>Converged winding, or an honest refusal</h3>
				</div>
				<button type="button" aria-pressed={Boolean(explorerState.loop)} onclick={enableLoop}
					>{explorerState.loop ? 'Remove loop' : 'Add loop'}</button
				>
			</div>
			{#if explorerState.loop}
				<div class="loop-controls" data-tts-exclude>
					<label
						>Centre Re <input
							type="number"
							step="any"
							value={explorerState.loop.center.re}
							onchange={(event) => setLoopValue('re', Number(event.currentTarget.value))}
						/></label
					>
					<label
						>Centre Im <input
							type="number"
							step="any"
							value={explorerState.loop.center.im}
							onchange={(event) => setLoopValue('im', Number(event.currentTarget.value))}
						/></label
					>
					<label
						>Radius <input
							type="number"
							min="0.00001"
							step="any"
							value={explorerState.loop.radius}
							onchange={(event) => setLoopValue('radius', Number(event.currentTarget.value))}
						/></label
					>
					<div class="loop-nudge" aria-label="Move winding loop">
						<button type="button" onclick={() => moveLoop(-explorerState.viewport.spanRe * 0.04, 0)}
							>←</button
						><button type="button" onclick={() => moveLoop(explorerState.viewport.spanRe * 0.04, 0)}
							>→</button
						><button type="button" onclick={() => moveLoop(0, explorerState.viewport.spanIm * 0.04)}
							>↑</button
						><button
							type="button"
							onclick={() => moveLoop(0, -explorerState.viewport.spanIm * 0.04)}>↓</button
						>
					</div>
					<button type="button" class="primary" onclick={runWinding}>Run convergent estimate</button
					>
				</div>
				{#if windingResult}
					<p
						class:success={windingResult.ok}
						class:error={!windingResult.ok}
						class="winding-result"
						role="status"
					>
						{windingResult.detail}
						{#if windingResult.ok}
							Samples: {windingResult.samples}; minimum sampled |f|: {formatNumber(
								windingResult.minimumModulus
							)}.{/if}
					</p>
				{:else}<p class="probe-note">
						The path is sampled counterclockwise with recursive midpoint/chord checks, sample
						doubling, a coprime N + 1 audit grid, a minimum-distance test, phase-step limits, and
						repeated stabilisation. Press Run; the tool will refuse an unsafe result.
					</p>{/if}
			{:else}<p class="probe-note">
					Add a circular loop to compare colour winding with zeros minus poles. Branch and
					non-holomorphic examples can report only output-curve winding, never N − P.
				</p>{/if}
		</section>
	{/if}

	<div class="learning-row">
		<section class="notice-panel" aria-labelledby={`${uid}-notice`}>
			<p class="panel-kicker">What to notice</p>
			<h3 id={`${uid}-notice`}>{activePreset?.notation ?? `f(z) = ${functionSource}`}</h3>
			<p>
				{activePreset?.notice ??
					'Follow phase and contours cautiously. The custom expression has no curated proof metadata.'}
			</p>
			{#if activePreset?.featureFamilies?.length}<p class="family-note">
					Visible family markers are bounds-aware and deliberately capped; they are not an
					exhaustive finite list.
				</p>{/if}
		</section>
		<section class="legend-panel" aria-labelledby={`${uid}-legend`}>
			<p class="panel-kicker">Quantitative legend</p>
			{#if explorerState.viewMode === 'sheets' && activePreset?.sheets}
				<h3 id={`${uid}-legend`}>Sheet projection channels and finite boundaries</h3>
				<div class="legend-items">
					<div>
						<span class="sheet-floor-key" aria-hidden="true"></span>
						<p>
							<strong>Input floor</strong><span>The horizontal coordinates are Re z and Im z.</span>
						</p>
					</div>
					<div>
						<span class="sheet-height-key" aria-hidden="true"></span>
						<p>
							<strong>Projected height</strong><span
								>{activePreset.sheets.kind === 'log'
									? '(θ + 2πk)/π for the displayed log sheet.'
									: 'Re w for the constructed root value.'}</span
							>
						</p>
					</div>
					<div>
						<span class="sheet-colour-key" aria-hidden="true"></span>
						<p>
							<strong>Surface colour</strong><span
								>{activePreset.sheets.kind === 'log'
									? 'A non-cyclic scale encodes ln r.'
									: 'A non-cyclic scale encodes Im w.'}</span
							>
						</p>
					</div>
					<div>
						<span class="sheet-boundary-key" aria-hidden="true"></span>
						<p>
							<strong>Boundary edge</strong><span
								>Yellow marks finite display limits; magenta marks the two open cut edges in
								principal mode.</span
							>
						</p>
					</div>
				</div>
			{:else}
				<h3 id={`${uid}-legend`}>Hue is phase; height is named separately</h3>
				<div class="legend-items">
					<div>
						<span class="hue-wheel" aria-hidden="true"></span>
						<p>
							<strong>Phase hue</strong><span
								>One cyclic hue turn is 2π. Twelve phase contours supplement colour.</span
							>
						</p>
					</div>
					<div>
						<span class="magnitude-key" aria-hidden="true"></span>
						<p>
							<strong>Log contours</strong><span
								>Each integer level changes |f| by a factor of two; |f| = 1 is sea level.</span
							>
						</p>
					</div>
					<div>
						<span class="zero-dot" aria-hidden="true"></span>
						<p>
							<strong>Zero limit</strong><span
								>log₂|f| tends to −∞; the display stops at the labelled low cap.</span
							>
						</p>
					</div>
					<div>
						<span class="pole-dot" aria-hidden="true"></span>
						<p>
							<strong>Pole limit</strong><span
								>log₂|f| tends to +∞; invalid or 0/0 samples remain holes instead.</span
							>
						</p>
					</div>
				</div>
			{/if}
		</section>
	</div>

	<div class="utility-bar" data-tts-exclude>
		<button type="button" onclick={copyLink}>Copy deterministic link</button>
		<button type="button" onclick={exportPng}>Export PNG + legend</button>
		<button type="button" onclick={toggleFullscreen}
			>{fullscreen ? 'Exit full screen' : 'Full screen'}</button
		>
		<output>{explorerState.viewMode === 'sheets' ? sheetWindowLabel : rangeLabel}</output>
	</div>

	<p id={`${uid}-description`} class="sr-only">{currentDescription}</p>
	<p class="sr-only" aria-live="polite">{liveProbeAnnouncement}</p>
	<footer class="lab-footer">
		In 2D, use plane pan/zoom. In 3D, use camera orbit/pan/dolly; these never change the
		mathematical domain. One-finger touch scrolls the page until the labelled gesture button is
		engaged; then one finger drags and two fingers pinch/pan. Top/unlit view removes geometry
		shading but does not turn this projection into the full graph in ℝ⁴.
	</footer>
</section>

<style>
	.domain-lab {
		position: relative;
		width: min(92rem, calc(100vw - 1.5rem));
		transform: translateX(-50%);
		margin: 2.5rem 0;
		overflow: hidden;
		border: 1px solid #30394d;
		border-radius: 0.9rem;
		background: #090d16;
		color: #e9edf5;
		box-shadow: 0 24px 60px -34px rgb(0 0 0 / 0.78);
		color-scheme: dark;
	}

	.domain-lab:fullscreen {
		width: 100vw;
		height: 100vh;
		transform: none;
		margin: 0;
		overflow: auto;
		border: 0;
		border-radius: 0;
	}

	.lab-header,
	.function-panel,
	.guided-tour,
	.view-tabs,
	.utility-bar {
		border-bottom: 1px solid #293247;
	}

	.lab-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem 1.4rem;
		padding: 1rem 1.1rem;
		background: #0d1320;
	}

	.lab-kicker,
	.panel-kicker {
		margin: 0 0 0.2rem;
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #67e8f9;
	}

	h2,
	h3 {
		margin: 0;
		color: #fff;
	}

	h2 {
		font-size: clamp(1.25rem, 2vw, 1.7rem);
	}

	h3 {
		font-size: 1rem;
		line-height: 1.35;
	}

	.lab-subtitle,
	.lab-status,
	.syntax-help,
	.preset-control p,
	.formula-note,
	.warning-note,
	.mesh-note,
	.probe-note,
	.notice-panel p,
	.legend-panel p,
	.lab-footer {
		margin: 0;
		text-align: left;
	}

	.lab-subtitle {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: #a3afc4;
	}

	.lab-status {
		max-width: 38rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: #b4bed0;
	}

	.static-calibration {
		margin: 0;
		border-top: 1px solid #354158;
		border-bottom: 1px solid #354158;
		background: #172033;
		padding: 0.65rem 1rem;
		font-size: 0.74rem;
		line-height: 1.5;
		color: #fef3c7;
	}

	.function-panel {
		display: grid;
		gap: 1rem;
		padding: 0.9rem 1rem;
		background: #101725;
	}

	.function-form label,
	.preset-control label,
	.control-grid label,
	.numeric-domain label,
	.loop-controls label {
		display: grid;
		gap: 0.32rem;
		font-size: 0.74rem;
		font-weight: 700;
		color: #dce3ef;
	}

	.function-form label span,
	.control-grid label > span output {
		color: #7dd3fc;
	}

	.function-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
	}

	input,
	select,
	button {
		min-height: 2.7rem;
		border: 1px solid #495671;
		border-radius: 0.45rem;
		background: #0a101c;
		color: #f4f7fb;
		font: inherit;
	}

	input,
	select {
		width: 100%;
		padding: 0.5rem 0.65rem;
	}

	input[type='range'],
	input[type='checkbox'] {
		min-height: auto;
	}

	input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
	}

	.function-form input,
	.numeric-domain input,
	.loop-controls input,
	.probe-grid dd,
	.utility-bar output {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
	}

	button {
		padding: 0.48rem 0.75rem;
		font-size: 0.76rem;
		font-weight: 750;
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button[aria-pressed='true'],
	button.active {
		border-color: #67e8f9;
		background: #164e63;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 3px solid #fef08a;
		outline-offset: 2px;
	}

	.function-row button,
	button.primary {
		border-color: #67e8f9;
		background: #155e75;
	}

	.syntax-help,
	.preset-control p,
	.formula-note,
	.mesh-note {
		margin-top: 0.38rem;
		font-size: 0.7rem;
		line-height: 1.45;
		color: #97a4ba;
	}

	.expression-error,
	.warning-note {
		margin-top: 0.45rem;
		font-size: 0.74rem;
		line-height: 1.5;
		color: #fda4af;
	}

	.guided-tour,
	.view-tabs,
	.utility-bar,
	.action-row,
	.loop-nudge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.guided-tour,
	.view-tabs {
		padding: 0.65rem 0.85rem;
		background: #0c121e;
	}

	.guided-tour span,
	.action-row > span {
		margin-right: 0.2rem;
		font-size: 0.67rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8fa0b8;
	}

	.view-tabs button {
		flex: 1 1 9rem;
	}

	.stage-grid {
		display: grid;
		gap: 1px;
		background: #2b3448;
	}

	.stage-grid.comparison {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.stage-panel {
		min-width: 0;
		background: #05070d;
	}

	.stage-label {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.65rem;
		font-size: 0.64rem;
		font-weight: 750;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #bac6d8;
		background: #111827;
	}

	.control-deck {
		display: grid;
		gap: 1px;
		background: #293247;
	}

	details {
		background: #0e1522;
	}

	summary {
		cursor: pointer;
		padding: 0.8rem 1rem;
		font-size: 0.78rem;
		font-weight: 800;
		color: #e4eaf3;
	}

	.control-grid,
	.numeric-domain,
	.toggle-grid,
	.loop-controls {
		display: grid;
		gap: 0.75rem;
		padding: 0.2rem 1rem 0.9rem;
	}

	.toggle-grid label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.73rem;
		color: #c0cada;
	}

	.action-row {
		padding: 0.25rem 1rem 0.8rem;
	}

	.formula-note,
	.warning-note,
	.mesh-note {
		padding: 0 1rem 0.8rem;
	}

	.probe-panel,
	.winding-panel,
	.learning-row {
		border-top: 1px solid #293247;
		padding: 0.95rem 1rem;
		background: #0c121e;
	}

	.panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.probe-grid {
		display: grid;
		gap: 1px;
		margin: 0.8rem 0 0;
		background: #2a3448;
	}

	.probe-grid div {
		display: grid;
		grid-template-columns: minmax(8rem, 0.8fr) minmax(0, 1.8fr);
		gap: 0.75rem;
		padding: 0.55rem 0.65rem;
		background: #111827;
	}

	.probe-grid dt,
	.probe-grid dd {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.probe-grid dt {
		color: #92a0b5;
	}

	.probe-grid dd {
		overflow-wrap: anywhere;
		color: #edf2f7;
	}

	.probe-note,
	.winding-result {
		margin: 0.75rem 0 0;
		font-size: 0.74rem;
		line-height: 1.55;
		color: #aeb9cb;
	}

	.winding-result {
		border-left: 3px solid #fda4af;
		padding: 0.55rem 0.7rem;
		background: #21131c;
		color: #fecdd3;
	}

	.winding-result.success {
		border-color: #67e8f9;
		background: #0a2028;
		color: #cffafe;
	}

	.learning-row {
		display: grid;
		gap: 0.8rem;
	}

	.notice-panel,
	.legend-panel {
		border: 1px solid #30394d;
		border-radius: 0.6rem;
		background: #101725;
		padding: 0.85rem;
	}

	.notice-panel > p:not(.panel-kicker),
	.family-note {
		margin-top: 0.5rem;
		font-size: 0.76rem;
		line-height: 1.55;
		color: #b7c1d2;
	}

	.legend-items {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.65rem;
	}

	.legend-items > div {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
	}

	.legend-items p {
		display: grid;
		gap: 0.08rem;
		font-size: 0.7rem;
		color: #aab5c8;
	}

	.legend-items strong {
		color: #eef2f7;
	}

	.hue-wheel {
		width: 1.8rem;
		height: 1.8rem;
		border: 2px solid rgb(255 255 255 / 0.35);
		border-radius: 999px;
		background: conic-gradient(#ff3b3b, #fff238, #38ef7d, #35d6ff, #7457ff, #ff43bd, #ff3b3b);
	}

	.magnitude-key {
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid rgb(255 255 255 / 0.25);
		border-radius: 0.25rem;
		background: repeating-linear-gradient(90deg, #1b2437 0 4px, #d8e0ec 4px 8px);
	}

	.sheet-floor-key,
	.sheet-height-key,
	.sheet-colour-key,
	.sheet-boundary-key {
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 0.25rem;
	}

	.sheet-floor-key {
		background:
			linear-gradient(90deg, transparent 47%, #9fb2ca 48% 52%, transparent 53%),
			linear-gradient(0deg, transparent 47%, #9fb2ca 48% 52%, transparent 53%), #172033;
	}

	.sheet-height-key {
		background: linear-gradient(135deg, #101827 0 46%, #dbeafe 48% 52%, #4c6b86 54% 100%);
	}

	.sheet-colour-key {
		background: linear-gradient(90deg, #8b5cf6, #38bdf8, #a3e635, #fb923c);
	}

	.sheet-boundary-key {
		border-width: 3px;
		border-style: solid;
		border-color: #fef08a #e879f9 #fef08a #e879f9;
		background: #101827;
	}

	.zero-dot,
	.pole-dot {
		width: 1.15rem;
		height: 1.15rem;
		margin-left: 0.32rem;
		border-radius: 999px;
	}

	.zero-dot {
		border: 1px solid #526078;
		background: #02040c;
	}

	.pole-dot {
		border: 1px solid #fff;
		background: #fff3d9;
		box-shadow: 0 0 0.45rem #fff3d9;
	}

	.utility-bar {
		justify-content: flex-start;
		padding: 0.7rem 0.85rem;
		background: #101725;
	}

	.utility-bar output {
		margin-left: auto;
		font-size: 0.68rem;
		color: #aab5c8;
	}

	.lab-footer {
		padding: 0.8rem 1rem;
		font-size: 0.7rem;
		line-height: 1.55;
		color: #8997ad;
		background: #090e18;
	}

	@media (min-width: 780px) {
		.function-panel {
			grid-template-columns: minmax(0, 1.4fr) minmax(17rem, 0.8fr);
		}

		.control-grid,
		.numeric-domain,
		.toggle-grid,
		.loop-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.probe-grid,
		.learning-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.legend-items {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.stage-grid.comparison {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.domain-lab {
			width: calc(100vw - 1rem);
			border-radius: 0.7rem;
		}

		.comparison-tab {
			display: none;
		}

		.function-row {
			grid-template-columns: 1fr;
		}

		.guided-tour button,
		.view-tabs button,
		.utility-bar button {
			flex: 1 1 calc(50% - 0.4rem);
		}

		.probe-grid div {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}

		.utility-bar output {
			width: 100%;
			margin-left: 0;
			line-height: 1.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}

	@media (forced-colors: active) {
		.domain-lab,
		.lab-header,
		.function-panel,
		.guided-tour,
		.view-tabs,
		.probe-panel,
		.winding-panel,
		.notice-panel,
		.legend-panel,
		.utility-bar {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		button,
		input,
		select {
			border: 1px solid ButtonText;
			background: Canvas;
			color: ButtonText;
		}
	}
</style>
