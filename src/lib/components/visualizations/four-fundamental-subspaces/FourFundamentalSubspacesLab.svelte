<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import './four-fundamental-subspaces.css';
	import {
		CANONICAL_PRESETS,
		DEFAULT_PRESET_ID,
		MAX_MATRIX_ENTRY,
		PRESET_GROUPS,
		analyzeMatrix,
		applyPresetToState,
		applySeededRandomMatrix,
		applySmallestSingularValue,
		buildJsonSummary,
		buildPlainTextSummary,
		clampNumber,
		cloneState,
		createDefaultState,
		decodeStateFromSearch,
		encodeStateToQuery,
		formatEuclideanSpace,
		getPresetById,
		perturbTargetIntoLeftNullspace,
		resizeMatrixState,
		smallestSingularValueUpperBound,
		snapTargetToColumnSpace,
		symmetrizeState,
		transposeState,
		type BasisMode,
		type CameraPresetId,
		type Dim,
		type LayerFlags,
		type MorphMode,
		type StudioTheme,
		type SubspaceViewerState,
		type SvdResult,
		type ViewMode
	} from '$lib/visualizations/four-fundamental-subspaces';
	import DualSubspaceViewport from './DualSubspaceViewport.svelte';
	import MatrixControlPanel from './MatrixControlPanel.svelte';
	import SubspaceLedger from './SubspaceLedger.svelte';

	let shellEl = $state<HTMLElement | null>(null);
	let viewportComp = $state<DualSubspaceViewport | null>(null);

	let viewerState = $state<SubspaceViewerState>(createDefaultState());
	let lastPresetId = $state<string>(DEFAULT_PRESET_ID);
	let cameraResetNonce = $state(0);
	let sigmaHomotopyAnchor: SvdResult | null = null;
	let isFullscreen = $state(false);
	let fullscreenFallback = $state(false);
	let announcement = $state('');
	let shareFeedback = $state('');
	let exportFeedback = $state('');

	let urlSyncTimer: number | null = null;
	let slideRafId: number | null = null;
	let slideLastTime = 0;

	const analysis = $derived(
		analyzeMatrix(viewerState.matrix, viewerState.x, viewerState.b, viewerState.relativeTolerance)
	);

	const activePreset = $derived(getPresetById(viewerState.presetId));
	const effectiveFullscreen = $derived(isFullscreen || fullscreenFallback);
	const sigmaUpperBound = $derived(smallestSingularValueUpperBound(analysis.svd));

	function announce(text: string): void {
		announcement = text;
	}

	function scheduleUrlSync(next: SubspaceViewerState): void {
		if (typeof window === 'undefined') return;
		if (urlSyncTimer !== null) window.clearTimeout(urlSyncTimer);
		urlSyncTimer = window.setTimeout(() => {
			urlSyncTimer = null;
			const query = encodeStateToQuery(next, window.location.search);
			const nextUrl = query
				? `${window.location.pathname}?${query}${window.location.hash}`
				: `${window.location.pathname}${window.location.hash}`;
			try {
				window.history.replaceState(null, '', nextUrl);
			} catch {
				// Safe no-op if history API is restricted
			}
		}, 180);
	}

	function setState(next: SubspaceViewerState, announceText?: string, syncUrl = true): void {
		viewerState = next;
		if (syncUrl) scheduleUrlSync(next);
		if (announceText) announce(announceText);
	}

	function stopSlideNull(): void {
		if (slideRafId !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(slideRafId);
			slideRafId = null;
		}
		if (viewerState.slideNullActive) {
			viewerState.slideNullActive = false;
		}
	}

	function handleToggleSlideNull(): void {
		if (analysis.subspaces.null.dimension === 0) return;

		if (viewerState.slideNullActive) {
			stopSlideNull();
			announce('Stopped sliding input vector x along nullspace.');
			return;
		}

		// Respect prefers-reduced-motion: step deterministically to discrete positions along N(A)
		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			viewerState.slideNullPhase = (viewerState.slideNullPhase + Math.PI / 2) % (Math.PI * 2);
			announce('Stepped input vector x along the nullspace fiber xᵣ + N(A); Ax remains unchanged.');
			return;
		}

		viewerState.slideNullActive = true;
		announce('Sliding input vector x along affine fiber xᵣ + N(A); watch Ax stay fixed.');

		slideLastTime = performance.now();
		const tick = (now: number) => {
			if (!viewerState.slideNullActive || analysis.subspaces.null.dimension === 0) {
				stopSlideNull();
				return;
			}
			const dt = Math.min(0.06, (now - slideLastTime) / 1000);
			slideLastTime = now;
			// Fine-grained mutation avoids re-running SVD/RREF 60 times/sec while updating 3D/SVG views
			viewerState.slideNullPhase = (viewerState.slideNullPhase + dt * 1.65) % (Math.PI * 2);
			slideRafId = window.requestAnimationFrame(tick);
		};
		slideRafId = window.requestAnimationFrame(tick);
	}

	function handleSelectPreset(presetId: string): void {
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const next = applyPresetToState(viewerState, presetId);
		const p = getPresetById(presetId);
		if (p) lastPresetId = p.id;
		cameraResetNonce += 1;
		setState(next, p ? `Loaded canonical example: ${p.name}.` : 'Loaded preset.');
	}

	function handleResizeShape(m: Dim, n: Dim): void {
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const next = resizeMatrixState(viewerState, m, n);
		setState(next, `Resized matrix to ${m} by ${n}.`);
	}

	function handleUpdateMatrixEntry(row: number, col: number, value: number): void {
		sigmaHomotopyAnchor = null;
		const next = cloneState(viewerState);
		next.presetId = 'custom';
		next.matrix[row][col] = clampNumber(value, -MAX_MATRIX_ENTRY, MAX_MATRIX_ENTRY);
		setState(next);
	}

	function handleTranspose(): void {
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const next = transposeState(viewerState);
		setState(next, `Transposed matrix to ${next.m} by ${next.n}; row and column spaces swapped.`);
	}

	function handleSymmetrize(): void {
		if (viewerState.m !== viewerState.n) return;
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const next = symmetrizeState(viewerState);
		setState(next, 'Symmetrized matrix to ½(A + Aᵀ); row space now equals column space.');
	}

	function handleRandomRank(targetRank: number): void {
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const next = applySeededRandomMatrix(viewerState, targetRank);
		setState(
			next,
			`Generated deterministic ${next.m} by ${next.n} matrix of exact rank ${targetRank} (seed ${next.randomSeed}).`
		);
	}

	function handleResetPreset(): void {
		stopSlideNull();
		sigmaHomotopyAnchor = null;
		const targetPreset = getPresetById(viewerState.presetId)
			? viewerState.presetId
			: getPresetById(lastPresetId)
				? lastPresetId
				: CANONICAL_PRESETS[0].id;
		lastPresetId = targetPreset;
		cameraResetNonce += 1;
		const next = applyPresetToState(viewerState, targetPreset);
		setState(next, 'Reset matrix and probe vectors to preset defaults.');
	}

	function handleSetSmallestSigma(sigma: number): void {
		// Pin the SVD orientation frame when sweeping sigma_min so dragging 0.04 -> 0 -> 0.04 never flips sign
		if (!sigmaHomotopyAnchor) {
			sigmaHomotopyAnchor = analysis.svd;
		}
		const next = applySmallestSingularValue(viewerState, sigma, sigmaHomotopyAnchor);
		setState(next, `Set smallest singular value to ${sigma.toFixed(2)}.`);
	}

	function handleSetRelativeTolerance(tol: number): void {
		const next = cloneState(viewerState);
		next.relativeTolerance = tol;
		setState(next);
	}

	function handleUpdateX(idx: number, val: number): void {
		stopSlideNull();
		const next = cloneState(viewerState);
		next.slideNullPhase = 0;
		next.x[idx] = clampNumber(val, -10, 10);
		setState(next);
	}

	function handleUpdateB(idx: number, val: number): void {
		const next = cloneState(viewerState);
		next.b[idx] = clampNumber(val, -10, 10);
		setState(next);
	}

	function handleSnapBToColSpace(): void {
		const next = snapTargetToColumnSpace(viewerState, analysis);
		setState(
			next,
			'Snapped target vector b orthogonally into column space C(A). Residual is now 0.'
		);
	}

	function handlePerturbBIntoLeftNull(): void {
		const next = perturbTargetIntoLeftNullspace(viewerState, analysis, 1.2);
		setState(next, 'Perturbed target vector b along left nullspace N(Aᵀ).');
	}

	function handleSetBasisMode(mode: BasisMode): void {
		const next = cloneState(viewerState);
		next.basisMode = mode;
		setState(
			next,
			mode === 'svd'
				? 'Switched basis display to SVD orthonormal vectors.'
				: 'Switched basis display to RREF and pivot vectors.'
		);
	}

	function handleToggleLayer(key: keyof LayerFlags): void {
		const next = cloneState(viewerState);
		next.layers[key] = !next.layers[key];
		setState(next, undefined, false);
	}

	function handleSetCameraPreset(preset: CameraPresetId): void {
		const next = cloneState(viewerState);
		next.cameraPreset = preset;
		setState(next, `Camera angle preset: ${preset}.`);
	}

	function handleToggleLinkCameras(): void {
		const next = cloneState(viewerState);
		next.linkCameras = !next.linkCameras;
		setState(
			next,
			next.linkCameras
				? 'Linked Domain and Codomain camera orbits.'
				: 'Unlocked independent camera orbits.'
		);
	}

	function handleSetViewMode(mode: ViewMode): void {
		if (mode === 'superimposed' && viewerState.m !== viewerState.n) return;
		const next = cloneState(viewerState);
		next.viewMode = mode;
		setState(
			next,
			mode === 'superimposed'
				? 'Switched to Superimposed Transformation Morph view.'
				: 'Switched to Linked Dual-Stage view.'
		);
	}

	function handleSetMorphMode(mode: MorphMode): void {
		const next = cloneState(viewerState);
		next.morphMode = mode;
		setState(next);
	}

	function handleSetMorphT(t: number, syncUrl = false): void {
		viewerState.morphT = clampNumber(t, 0, 1);
		if (syncUrl) scheduleUrlSync(viewerState);
	}

	function handleSetStudioTheme(theme: StudioTheme): void {
		const next = cloneState(viewerState);
		next.studioTheme = theme;
		setState(next, `Switched canvas studio theme to ${theme}.`);
	}

	async function handleCopyShareUrl(): Promise<void> {
		if (typeof window === 'undefined') return;
		const query = encodeStateToQuery(viewerState);
		const fullUrl = `${window.location.origin}${window.location.pathname}?${query}`;
		try {
			await navigator.clipboard.writeText(fullUrl);
			shareFeedback = 'Copied shareable URL to clipboard.';
		} catch {
			window.history.replaceState(null, '', fullUrl);
			shareFeedback = 'Updated browser URL for sharing.';
		}
		setTimeout(() => (shareFeedback = ''), 3200);
	}

	async function handleExportPng(): Promise<void> {
		if (!viewportComp) return;
		exportFeedback = 'Rendering PNG snapshot…';
		const blob = await viewportComp.exportPng();
		if (!blob) {
			exportFeedback = 'PNG snapshot export failed in this browser context.';
			return;
		}
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `four-fundamental-subspaces-${viewerState.presetId}.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		exportFeedback = 'Downloaded PNG snapshot.';
		setTimeout(() => (exportFeedback = ''), 3200);
	}

	async function handleCopyPlainText(): Promise<void> {
		const text = buildPlainTextSummary(viewerState, analysis);
		try {
			await navigator.clipboard.writeText(text);
			exportFeedback = 'Copied plain-text subspace summary.';
		} catch {
			exportFeedback = 'Clipboard unavailable in this browser context.';
		}
		setTimeout(() => (exportFeedback = ''), 3200);
	}

	async function handleCopyJson(): Promise<void> {
		const json = buildJsonSummary(viewerState, analysis);
		try {
			await navigator.clipboard.writeText(json);
			exportFeedback = 'Copied JSON subspace summary.';
		} catch {
			exportFeedback = 'Clipboard unavailable in this browser context.';
		}
		setTimeout(() => (exportFeedback = ''), 3200);
	}

	function handleFullscreenChange(): void {
		isFullscreen = typeof document !== 'undefined' && document.fullscreenElement === shellEl;
		if (isFullscreen) fullscreenFallback = false;
	}

	async function toggleFullscreen(): Promise<void> {
		if (!shellEl || typeof document === 'undefined') return;
		if (document.fullscreenElement === shellEl) {
			try {
				await document.exitFullscreen();
			} catch {
				fullscreenFallback = false;
			}
			isFullscreen = false;
			return;
		}
		if (fullscreenFallback) {
			fullscreenFallback = false;
			return;
		}
		if (typeof shellEl.requestFullscreen === 'function') {
			try {
				await shellEl.requestFullscreen();
				isFullscreen = true;
				return;
			} catch {
				// Graceful fallback when native fullscreen is unavailable
			}
		}
		fullscreenFallback = true;
	}

	function handleKeyDown(e: KeyboardEvent): void {
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
			return;
		}

		if (e.key === 'Escape' && fullscreenFallback) {
			fullscreenFallback = false;
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			viewportComp?.orbitKeyboard(-0.18, 0);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			viewportComp?.orbitKeyboard(0.18, 0);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			viewportComp?.orbitKeyboard(0, -0.14);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			viewportComp?.orbitKeyboard(0, 0.14);
		} else if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			viewportComp?.zoomStep(0.84);
		} else if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			viewportComp?.zoomStep(1.18);
		} else if (e.key === 'r' || e.key === 'R') {
			e.preventDefault();
			viewportComp?.resetView();
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			if (window.location.search) {
				const decoded = decodeStateFromSearch(window.location.search);
				viewerState = decoded;
				const urlPreset = new URLSearchParams(window.location.search).get('preset');
				if (urlPreset && getPresetById(urlPreset)) {
					lastPresetId = urlPreset;
				} else if (getPresetById(decoded.presetId)) {
					lastPresetId = decoded.presetId;
				}
			}
			document.addEventListener('fullscreenchange', handleFullscreenChange);
		}
		shellEl?.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		stopSlideNull();
		shellEl?.removeEventListener('keydown', handleKeyDown);
		if (urlSyncTimer !== null && typeof window !== 'undefined') {
			window.clearTimeout(urlSyncTimer);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		}
	});
</script>

<section
	class="ffs-breakout-root article-breakout not-prose"
	class:ffs-elevated={effectiveFullscreen}
	aria-label="Interactive 3D Four Fundamental Subspaces of Linear Algebra Laboratory"
>
	<div
		bind:this={shellEl}
		class="ffs-shell"
		class:ffs-fullscreen-fallback={fullscreenFallback}
		data-studio-theme={viewerState.studioTheme}
		data-testid="four-fundamental-subspaces-lab"
		tabindex="-1"
	>
		<!-- Accessible screen-reader announcements -->
		<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

		<!-- Top Instrument Header Plaque (provides the single H1 for immersiveLead) -->
		<header class="ffs-header">
			<div class="ffs-title-block">
				<div class="ffs-title-row">
					<h1 class="ffs-title">The Four Fundamental Subspaces in 3D</h1>
					<span class="ffs-rank-pill" data-testid="ffs-rank-pill">
						{analysis.m}×{analysis.n} · Rank r = {analysis.rank} · {analysis.target.regimeTitle}
					</span>
				</div>
			</div>

			<div class="ffs-header-actions">
				<button
					type="button"
					class="ffs-btn ffs-btn-xs"
					aria-pressed={viewerState.studioTheme === 'light'}
					onclick={() =>
						handleSetStudioTheme(viewerState.studioTheme === 'dark' ? 'light' : 'dark')}
				>
					{viewerState.studioTheme === 'dark' ? 'Paper Canvas' : 'Graphite Canvas'}
				</button>
				<button
					type="button"
					class="ffs-btn ffs-btn-xs"
					aria-pressed={effectiveFullscreen}
					onclick={toggleFullscreen}
				>
					{effectiveFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				</button>
			</div>
		</header>

		<!-- Canonical Examples Dropdown Bar -->
		<div class="ffs-preset-bar">
			<div class="ffs-preset-select-wrap">
				<label for="ffs-canonical-select" class="ffs-field-label">Canonical Example</label>
				<select
					id="ffs-canonical-select"
					class="ffs-select"
					data-testid="ffs-canonical-select"
					value={viewerState.presetId}
					onchange={(e) => handleSelectPreset((e.currentTarget as HTMLSelectElement).value)}
				>
					{#each PRESET_GROUPS as group (group.id)}
						<optgroup label={group.label}>
							{#each CANONICAL_PRESETS.filter((p) => p.group === group.id) as preset (preset.id)}
								<option value={preset.id}>{preset.name}</option>
							{/each}
						</optgroup>
					{/each}
					{#if viewerState.presetId === 'custom'}
						<option value="custom"
							>Custom {analysis.m}×{analysis.n} Matrix (Rank {analysis.rank})</option
						>
					{/if}
				</select>
			</div>
			<p class="ffs-takeaway" data-testid="ffs-preset-takeaway">
				{#if activePreset}
					<strong>Geometric takeaway:</strong> {activePreset.takeaway}
				{:else}
					<strong>Custom {analysis.m}×{analysis.n} matrix (Rank {analysis.rank}):</strong>
					Row space {analysis.subspaces.row.geometryLabel} ⊥ Nullspace {analysis.subspaces.null
						.geometryLabel}
					in {formatEuclideanSpace(analysis.n)}; Column space {analysis.subspaces.col.geometryLabel}
					⊥ Left nullspace {analysis.subspaces.leftNull.geometryLabel} in {formatEuclideanSpace(
						analysis.m
					)}.
				{/if}
			</p>
		</div>

		<!-- Main Workbench: 3D Viewports + Parameter Controls -->
		<div class="ffs-main-grid">
			<DualSubspaceViewport
				bind:this={viewportComp}
				{viewerState}
				{analysis}
				{cameraResetNonce}
				onSetCameraPreset={handleSetCameraPreset}
				onToggleLinkCameras={handleToggleLinkCameras}
				onSetViewMode={handleSetViewMode}
				onSetMorphMode={handleSetMorphMode}
				onSetMorphT={handleSetMorphT}
				onStatusAnnouncement={announce}
			/>

			<MatrixControlPanel
				{viewerState}
				{analysis}
				{sigmaUpperBound}
				{shareFeedback}
				{exportFeedback}
				onResizeShape={handleResizeShape}
				onUpdateMatrixEntry={handleUpdateMatrixEntry}
				onTranspose={handleTranspose}
				onSymmetrize={handleSymmetrize}
				onRandomRank={handleRandomRank}
				onResetPreset={handleResetPreset}
				onSetSmallestSigma={handleSetSmallestSigma}
				onSetRelativeTolerance={handleSetRelativeTolerance}
				onUpdateX={handleUpdateX}
				onToggleSlideNull={handleToggleSlideNull}
				onUpdateB={handleUpdateB}
				onSnapBToColSpace={handleSnapBToColSpace}
				onPerturbBIntoLeftNull={handlePerturbBIntoLeftNull}
				onSetBasisMode={handleSetBasisMode}
				onToggleLayer={handleToggleLayer}
				onSetStudioTheme={handleSetStudioTheme}
				onCopyShareUrl={handleCopyShareUrl}
				onExportPng={handleExportPng}
				onCopyPlainText={handleCopyPlainText}
				onCopyJson={handleCopyJson}
			/>
		</div>

		<!-- Live Algebraic & Geometric Ledger + Accessible Data Table -->
		<SubspaceLedger {viewerState} {analysis} onSetBasisMode={handleSetBasisMode} />
	</div>
</section>
