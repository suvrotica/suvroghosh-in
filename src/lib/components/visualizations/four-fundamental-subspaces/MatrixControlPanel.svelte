<script lang="ts">
	import {
		DEFAULT_RELATIVE_TOLERANCE,
		MAX_MATRIX_ENTRY,
		formatEuclideanSpace,
		formatScalar,
		formatScientific,
		formatSubscriptIndex,
		formatVec,
		getPresetById,
		type BasisMode,
		type Dim,
		type LayerFlags,
		type StudioTheme,
		type SubspaceAnalysis,
		type SubspaceViewerState
	} from '$lib/visualizations/four-fundamental-subspaces';

	interface Props {
		viewerState: SubspaceViewerState;
		analysis: SubspaceAnalysis;
		sigmaUpperBound: number;
		shareFeedback: string;
		exportFeedback: string;
		onResizeShape: (m: Dim, n: Dim) => void;
		onUpdateMatrixEntry: (row: number, col: number, value: number) => void;
		onTranspose: () => void;
		onSymmetrize: () => void;
		onRandomRank: (targetRank: number) => void;
		onResetPreset: () => void;
		onSetSmallestSigma: (sigma: number) => void;
		onSetRelativeTolerance: (tol: number) => void;
		onUpdateX: (idx: number, val: number) => void;
		onToggleSlideNull: () => void;
		onUpdateB: (idx: number, val: number) => void;
		onSnapBToColSpace: () => void;
		onPerturbBIntoLeftNull: () => void;
		onSetBasisMode: (mode: BasisMode) => void;
		onToggleLayer: (key: keyof LayerFlags) => void;
		onSetStudioTheme: (theme: StudioTheme) => void;
		onCopyShareUrl: () => void;
		onExportPng: () => void;
		onCopyPlainText: () => void;
		onCopyJson: () => void;
	}

	let {
		viewerState,
		analysis,
		sigmaUpperBound,
		shareFeedback,
		exportFeedback,
		onResizeShape,
		onUpdateMatrixEntry,
		onTranspose,
		onSymmetrize,
		onRandomRank,
		onResetPreset,
		onSetSmallestSigma,
		onSetRelativeTolerance,
		onUpdateX,
		onToggleSlideNull,
		onUpdateB,
		onSnapBToColSpace,
		onPerturbBIntoLeftNull,
		onSetBasisMode,
		onToggleLayer,
		onSetStudioTheme,
		onCopyShareUrl,
		onExportPng,
		onCopyPlainText,
		onCopyJson
	}: Props = $props();

	let activeTab = $state<'matrix' | 'vectors' | 'layers' | 'export'>('matrix');

	const maxRank = $derived(Math.min(analysis.m, analysis.n));
	const smallestSigma = $derived(analysis.svd.singularValues[maxRank - 1] ?? 0);
	const sigmaSliderDisabled = $derived(sigmaUpperBound <= 1e-9);
	const sigmaSliderMax = $derived(Math.max(0.01, Number(sigmaUpperBound.toFixed(2))));
	const activePreset = $derived(getPresetById(viewerState.presetId));
	const tolExponent = $derived(Math.log10(Math.max(1e-9, viewerState.relativeTolerance)));

	function onTolSliderInput(rawExp: number): void {
		onSetRelativeTolerance(Math.pow(10, rawExp));
	}

	const dims: Dim[] = [1, 2, 3];
</script>

<aside class="ffs-control-panel" aria-label="Matrix, vector, and visualization controls">
	<div class="ffs-tabs" role="tablist" aria-label="Control sections">
		<button
			id="ffs-tab-matrix"
			type="button"
			role="tab"
			class="ffs-tab"
			aria-selected={activeTab === 'matrix'}
			aria-controls="ffs-tabpanel-controls"
			onclick={() => (activeTab = 'matrix')}
		>
			Matrix
		</button>
		<button
			id="ffs-tab-vectors"
			type="button"
			role="tab"
			class="ffs-tab"
			aria-selected={activeTab === 'vectors'}
			aria-controls="ffs-tabpanel-controls"
			onclick={() => (activeTab = 'vectors')}
		>
			Vectors
		</button>
		<button
			id="ffs-tab-layers"
			type="button"
			role="tab"
			class="ffs-tab"
			aria-selected={activeTab === 'layers'}
			aria-controls="ffs-tabpanel-controls"
			onclick={() => (activeTab = 'layers')}
		>
			Layers
		</button>
		<button
			id="ffs-tab-export"
			type="button"
			role="tab"
			class="ffs-tab"
			aria-selected={activeTab === 'export'}
			aria-controls="ffs-tabpanel-controls"
			onclick={() => (activeTab = 'export')}
		>
			Share
		</button>
	</div>

	<div
		id="ffs-tabpanel-controls"
		class="ffs-tab-body"
		role="tabpanel"
		aria-labelledby={`ffs-tab-${activeTab}`}
	>
		{#if activeTab === 'matrix'}
			<!-- Shape selector -->
			<div class="ffs-panel-section">
				<div class="ffs-section-head">
					<h2 class="ffs-section-title">
						Matrix Shape <span class="ffs-math-inline">(m × n)</span>
					</h2>
					<span class="ffs-mono" style="font-size: 0.74rem; color: var(--ffs-ink-muted);">
						{formatEuclideanSpace(analysis.n)} → {formatEuclideanSpace(analysis.m)}
					</span>
				</div>
				<div style="display: flex; gap: 0.55rem; align-items: center; flex-wrap: wrap;">
					<div style="display: flex; align-items: center; gap: 0.25rem;">
						<span class="ffs-field-label">Rows <span class="ffs-math-inline">m</span>:</span>
						{#each dims as d (d)}
							<button
								type="button"
								class="ffs-btn ffs-btn-xs"
								aria-pressed={viewerState.m === d}
								onclick={() => onResizeShape(d, viewerState.n)}
							>
								{d}
							</button>
						{/each}
					</div>
					<div style="display: flex; align-items: center; gap: 0.25rem;">
						<span class="ffs-field-label">Cols <span class="ffs-math-inline">n</span>:</span>
						{#each dims as d (d)}
							<button
								type="button"
								class="ffs-btn ffs-btn-xs"
								aria-pressed={viewerState.n === d}
								onclick={() => onResizeShape(viewerState.m, d)}
							>
								{d}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Editable Matrix Grid -->
			<div class="ffs-panel-section">
				<div class="ffs-section-head">
					<h2 class="ffs-section-title">Entries of A</h2>
					<span class="ffs-mono" style="font-size: 0.72rem; color: var(--ffs-ink-muted);">
						Range [−{MAX_MATRIX_ENTRY}, {MAX_MATRIX_ENTRY}]
					</span>
				</div>
				<div
					class="ffs-matrix-grid"
					style={`grid-template-columns: repeat(${viewerState.n}, minmax(0, 1fr));`}
					data-testid="ffs-matrix-grid"
				>
					{#each viewerState.matrix as row, i (i)}
						{#each row as val, j (j)}
							<div class="ffs-matrix-cell">
								<label for={`ffs-a-${i}-${j}`} class="sr-only">
									Matrix entry row {i + 1} column {j + 1}
								</label>
								<input
									id={`ffs-a-${i}-${j}`}
									type="number"
									class="ffs-num-input"
									min={-MAX_MATRIX_ENTRY}
									max={MAX_MATRIX_ENTRY}
									step="0.1"
									value={Number(val.toFixed(3))}
									onchange={(e) => {
										const parsed = Number((e.currentTarget as HTMLInputElement).value);
										if (Number.isFinite(parsed)) onUpdateMatrixEntry(i, j, parsed);
									}}
								/>
								<input
									type="range"
									class="ffs-range"
									aria-label={`Scrub entry A(${i + 1},${j + 1})`}
									min="-3"
									max="3"
									step="0.1"
									value={Math.max(-3, Math.min(3, val))}
									oninput={(e) =>
										onUpdateMatrixEntry(i, j, Number((e.currentTarget as HTMLInputElement).value))}
								/>
							</div>
						{/each}
					{/each}
				</div>

				<!-- Quick Algebraic Operations -->
				<div style="display: flex; flex-wrap: wrap; gap: 0.36rem; margin-top: 0.25rem;">
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						title="Swap A with Aᵀ (swaps Row/Col spaces and Null/Left-Null spaces)"
						onclick={onTranspose}
					>
						Transpose A ↔ Aᵀ
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						disabled={viewerState.m !== viewerState.n}
						title="Replace A with ½(A + Aᵀ) so row space equals column space"
						onclick={onSymmetrize}
					>
						Symmetrize
					</button>
					<button type="button" class="ffs-btn ffs-btn-xs" onclick={onResetPreset}>
						Reset Preset
					</button>
				</div>

				<!-- Seeded deterministic Random Matrix of Rank r -->
				<div
					style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin-top: 0.2rem;"
				>
					<span class="ffs-field-label">Seeded Rank <span class="ffs-math-inline">r</span>:</span>
					{#each Array.from({ length: maxRank + 1 }, (_, r) => r) as r (r)}
						<button
							type="button"
							class="ffs-btn ffs-btn-xs"
							title={`Generate deterministic integer ${viewerState.m}×${viewerState.n} matrix of exact rank ${r}`}
							onclick={() => onRandomRank(r)}
						>
							Rank {r}
						</button>
					{/each}
				</div>
			</div>

			<!-- Continuous Homotopy: Scale Smallest Singular Value + Rank Tolerance -->
			<div class="ffs-panel-section">
				<div class="ffs-section-head">
					<h2 class="ffs-section-title">
						Rank Drop &amp; Numerical Fragility
						{#if activePreset?.highlightSigmaControl}
							<span style="color: var(--ffs-gold); margin-left: 0.25rem;">★</span>
						{/if}
					</h2>
				</div>

				<div>
					<div class="ffs-section-head" style="margin-bottom: 0.2rem;">
						<label for="ffs-sigma-min" style="font-size: 0.76rem; color: var(--ffs-ink-muted);">
							Smallest singular value σ{formatSubscriptIndex(maxRank)}
						</label>
						<span class="ffs-mono" style="font-size: 0.78rem; font-weight: 700;">
							{formatScalar(smallestSigma, 3)}
						</span>
					</div>
					<input
						id="ffs-sigma-min"
						type="range"
						class="ffs-range"
						min="0"
						max={sigmaSliderMax}
						step="0.01"
						disabled={sigmaSliderDisabled}
						value={Math.min(sigmaSliderMax, smallestSigma)}
						oninput={(e) => onSetSmallestSigma(Number((e.currentTarget as HTMLInputElement).value))}
					/>
					{#if sigmaSliderDisabled}
						<p style="margin: 0.2rem 0 0; font-size: 0.71rem; color: var(--ffs-ink-soft);">
							σ{formatSubscriptIndex(maxRank)} is pinned at 0 because σ{formatSubscriptIndex(
								maxRank - 1
							)} = 0 (rank &lt; {maxRank - 1}).
						</p>
					{:else}
						<div style="display: flex; gap: 0.3rem; margin-top: 0.25rem; flex-wrap: wrap;">
							<button
								type="button"
								class="ffs-btn ffs-btn-xs"
								onclick={() => onSetSmallestSigma(0)}
							>
								Drop to 0
							</button>
							<button
								type="button"
								class="ffs-btn ffs-btn-xs"
								disabled={sigmaUpperBound < 0.04}
								onclick={() => onSetSmallestSigma(0.04)}
							>
								0.04 (Fragile)
							</button>
							<button
								type="button"
								class="ffs-btn ffs-btn-xs"
								disabled={sigmaUpperBound < 0.8}
								onclick={() => onSetSmallestSigma(0.8)}
							>
								0.80 (Healthy)
							</button>
						</div>
					{/if}
				</div>

				<div style="margin-top: 0.35rem;">
					<div class="ffs-section-head" style="margin-bottom: 0.2rem;">
						<label for="ffs-tol-slider" style="font-size: 0.76rem; color: var(--ffs-ink-muted);">
							Rank tolerance τ = max(m,n)·σ₁·tol
						</label>
						<span class="ffs-mono" style="font-size: 0.75rem;">
							τ = {formatScientific(analysis.svd.tolerance)}
						</span>
					</div>
					<input
						id="ffs-tol-slider"
						type="range"
						class="ffs-range"
						min="-9"
						max="-0.6"
						step="0.05"
						value={tolExponent}
						oninput={(e) => onTolSliderInput(Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div
						style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: var(--ffs-ink-soft);"
					>
						<span class="ffs-mono">tol = {viewerState.relativeTolerance.toExponential(1)}</span>
						<button
							type="button"
							class="ffs-btn ffs-btn-xs"
							onclick={() => onSetRelativeTolerance(DEFAULT_RELATIVE_TOLERANCE)}
						>
							Default 1e-6
						</button>
					</div>
				</div>
			</div>
		{:else if activeTab === 'vectors'}
			<!-- Input Vector x Lab -->
			<div class="ffs-panel-section">
				<div class="ffs-section-head">
					<h2 class="ffs-section-title">
						Input Vector <span class="ffs-math-inline">x ∈ {formatEuclideanSpace(analysis.n)}</span>
					</h2>
					<span class="ffs-mono" style="font-size: 0.72rem; color: var(--ffs-ink-muted);">
						Ax = {formatVec(analysis.input.ax, 2)}
					</span>
				</div>

				{#each viewerState.x as coord, idx (idx)}
					<div class="ffs-slider-row">
						<label for={`ffs-x-${idx}`} class="ffs-mono">x{idx + 1}</label>
						<input
							id={`ffs-x-${idx}`}
							type="range"
							class="ffs-range"
							min="-3"
							max="3"
							step="0.1"
							value={coord}
							oninput={(e) => onUpdateX(idx, Number((e.currentTarget as HTMLInputElement).value))}
						/>
						<span class="ffs-mono" style="text-align: right;">{formatScalar(coord, 2)}</span>
					</div>
				{/each}

				<div style="display: flex; flex-wrap: wrap; gap: 0.36rem; margin-top: 0.25rem;">
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						aria-pressed={viewerState.slideNullActive}
						disabled={analysis.subspaces.null.dimension === 0}
						title={analysis.subspaces.null.dimension > 0
							? 'Move x along its affine fiber xᵣ + N(A) while watching Ax stay completely stationary'
							: 'N(A) = {0}; no nullspace direction to slide along'}
						onclick={onToggleSlideNull}
					>
						{viewerState.slideNullActive ? 'Stop Sliding x' : 'Slide x along N(A)'}
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						aria-pressed={viewerState.layers.showInputSplit}
						onclick={() => onToggleLayer('showInputSplit')}
					>
						x = xᵣ + xₙ
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						aria-pressed={viewerState.layers.showAffineFiber}
						onclick={() => onToggleLayer('showAffineFiber')}
					>
						Fiber xᵣ + N(A)
					</button>
				</div>
			</div>

			<!-- Target Vector b & Least Squares Lab -->
			<div class="ffs-panel-section">
				<div class="ffs-section-head">
					<h2 class="ffs-section-title">
						Target Vector <span class="ffs-math-inline"
							>b ∈ {formatEuclideanSpace(analysis.m)} (Ax = b)</span
						>
					</h2>
					<span class="ffs-mono" style="font-size: 0.72rem; color: var(--ffs-left-null);">
						‖e‖ = {formatScientific(analysis.target.normResidual)}
					</span>
				</div>

				{#each viewerState.b as coord, idx (idx)}
					<div class="ffs-slider-row">
						<label for={`ffs-b-${idx}`} class="ffs-mono">b{idx + 1}</label>
						<input
							id={`ffs-b-${idx}`}
							type="range"
							class="ffs-range"
							min="-3"
							max="3"
							step="0.1"
							value={coord}
							oninput={(e) => onUpdateB(idx, Number((e.currentTarget as HTMLInputElement).value))}
						/>
						<span class="ffs-mono" style="text-align: right;">{formatScalar(coord, 2)}</span>
					</div>
				{/each}

				<div style="display: flex; flex-wrap: wrap; gap: 0.36rem; margin-top: 0.25rem;">
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						title="Project b orthogonally onto C(A) so e = 0 and Ax = b becomes exact"
						onclick={onSnapBToColSpace}
					>
						Snap b into C(A)
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						disabled={analysis.subspaces.leftNull.dimension === 0}
						title={analysis.subspaces.leftNull.dimension > 0
							? 'Add a component along N(Aᵀ) to push b outside C(A)'
							: 'N(Aᵀ) = {0}; every b lies inside C(A)'}
						onclick={onPerturbBIntoLeftNull}
					>
						Perturb b into N(Aᵀ)
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						aria-pressed={viewerState.layers.showTargetSplit}
						onclick={() => onToggleLayer('showTargetSplit')}
					>
						b = p + e
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						aria-pressed={viewerState.layers.showPseudoinverse}
						onclick={() => onToggleLayer('showPseudoinverse')}
					>
						x⁺ = A⁺b
					</button>
				</div>

				<div class="ffs-regime-card" data-testid="ffs-regime-card">
					<div class="ffs-regime-title">{analysis.target.regimeTitle}</div>
					<p class="ffs-regime-copy">{analysis.target.regimeSummary}</p>
					<div
						class="ffs-mono"
						style="margin-top: 0.35rem; font-size: 0.72rem; color: var(--ffs-accent);"
					>
						x⁺ = {formatVec(analysis.target.xPlus, 2)} · p = {formatVec(
							analysis.target.projection,
							2
						)}
					</div>
				</div>
			</div>
		{:else if activeTab === 'layers'}
			<!-- Basis Mode Switcher -->
			<div class="ffs-panel-section">
				<h2 class="ffs-section-title">Displayed Basis Vectors</h2>
				<div style="display: flex; gap: 0.4rem;">
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						style="flex: 1;"
						aria-pressed={viewerState.basisMode === 'svd'}
						onclick={() => onSetBasisMode('svd')}
					>
						SVD Orthonormal (vᵢ, uᵢ)
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						style="flex: 1;"
						aria-pressed={viewerState.basisMode === 'rref'}
						onclick={() => onSetBasisMode('rref')}
					>
						RREF / Pivot Basis
					</button>
				</div>
				<p style="margin: 0; font-size: 0.74rem; color: var(--ffs-ink-muted);">
					Subspace geometry stays completely invariant; only the basis arrows spanning each subspace
					switch between orthonormal SVD axes and algebraic RREF pivots/special solutions.
				</p>
			</div>

			<!-- Visibility Layers -->
			<div class="ffs-panel-section">
				<h2 class="ffs-section-title">Subspaces &amp; Geometry Layers</h2>
				<div class="ffs-toggle-grid">
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showRowSpace}
							onchange={() => onToggleLayer('showRowSpace')}
						/>
						<span>Row Space C(Aᵀ)</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showNullspace}
							onchange={() => onToggleLayer('showNullspace')}
						/>
						<span>Nullspace N(A)</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showColSpace}
							onchange={() => onToggleLayer('showColSpace')}
						/>
						<span>Col Space C(A)</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showLeftNullspace}
							onchange={() => onToggleLayer('showLeftNullspace')}
						/>
						<span>Left Null N(Aᵀ)</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showBasisVectors}
							onchange={() => onToggleLayer('showBasisVectors')}
						/>
						<span>Basis Vectors</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showUnitSphere}
							onchange={() => onToggleLayer('showUnitSphere')}
						/>
						<span>Sphere → Ellipsoid</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showRightAngles}
							onchange={() => onToggleLayer('showRightAngles')}
						/>
						<span>90° Right Angles</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showLabels}
							onchange={() => onToggleLayer('showLabels')}
						/>
						<span>3D Labels</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showGridAxes}
							onchange={() => onToggleLayer('showGridAxes')}
						/>
						<span>Axes &amp; Grid</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showInputVector}
							onchange={() => onToggleLayer('showInputVector')}
						/>
						<span>Input x &amp; Ax</span>
					</label>
					<label class="ffs-check-label">
						<input
							type="checkbox"
							checked={viewerState.layers.showTargetVector}
							onchange={() => onToggleLayer('showTargetVector')}
						/>
						<span>Target Vector b</span>
					</label>
				</div>
			</div>

			<!-- Studio Canvas Theme -->
			<div class="ffs-panel-section">
				<h2 class="ffs-section-title">Studio Canvas Theme</h2>
				<div style="display: flex; gap: 0.4rem;">
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						style="flex: 1;"
						aria-pressed={viewerState.studioTheme === 'dark'}
						onclick={() => onSetStudioTheme('dark')}
					>
						Dark Graphite
					</button>
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						style="flex: 1;"
						aria-pressed={viewerState.studioTheme === 'light'}
						onclick={() => onSetStudioTheme('light')}
					>
						Warm Paper
					</button>
				</div>
			</div>
		{:else}
			<!-- Export & Share -->
			<div class="ffs-panel-section">
				<h2 class="ffs-section-title">Reproducibility &amp; Export</h2>
				<p style="margin: 0; font-size: 0.78rem; color: var(--ffs-ink-muted);">
					Every matrix entry, probe vector, basis mode, tolerance, and camera preset encodes cleanly
					in the page URL.
				</p>
				<div style="display: flex; flex-direction: column; gap: 0.45rem;">
					<button type="button" class="ffs-btn" onclick={onCopyShareUrl}> Copy Share Link </button>
					<button type="button" class="ffs-btn" onclick={onExportPng}> Export PNG Snapshot </button>
					<button type="button" class="ffs-btn" onclick={onCopyPlainText}>
						Copy Plain-Text Subspace Summary
					</button>
					<button type="button" class="ffs-btn" onclick={onCopyJson}>
						Copy JSON Subspace Summary
					</button>
				</div>
				{#if shareFeedback}
					<p
						class="ffs-mono"
						style="margin: 0; font-size: 0.75rem; color: var(--ffs-row);"
						role="status"
					>
						{shareFeedback}
					</p>
				{/if}
				{#if exportFeedback}
					<p
						class="ffs-mono"
						style="margin: 0; font-size: 0.75rem; color: var(--ffs-col);"
						role="status"
					>
						{exportFeedback}
					</p>
				{/if}
			</div>
		{/if}
	</div>
</aside>
