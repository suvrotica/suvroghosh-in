<script lang="ts">
	import {
		effectiveInputVector,
		formatEuclideanSpace,
		formatScalar,
		formatScientific,
		formatSubscriptIndex,
		formatVec,
		matVec,
		type BasisMode,
		type SubspaceAnalysis,
		type SubspaceKey,
		type SubspaceViewerState
	} from '$lib/visualizations/four-fundamental-subspaces';

	interface Props {
		viewerState: SubspaceViewerState;
		analysis: SubspaceAnalysis;
		onSetBasisMode: (mode: BasisMode) => void;
	}

	let { viewerState, analysis, onSetBasisMode }: Props = $props();

	const subspaceOrder: { key: SubspaceKey; glyph: string; roleTag: string }[] = [
		{ key: 'row', glyph: '■', roleTag: 'Active input' },
		{ key: 'null', glyph: '⊥', roleTag: 'Lost input' },
		{ key: 'col', glyph: '■', roleTag: 'Reachable output' },
		{ key: 'leftNull', glyph: '⊥', roleTag: 'Unreachable residual' }
	];

	const xEff = $derived(effectiveInputVector(viewerState, analysis));
	const axEff = $derived(matVec(analysis.matrix, xEff));
	const pivotSet = $derived(new Set(analysis.rref.pivotColumns));
	const maxSigma = $derived(Math.max(analysis.svd.singularValues[0] ?? 1, 1e-6));
</script>

<section
	class="ffs-ledger"
	aria-label="Algebraic and geometric subspace ledger"
	data-testid="ffs-ledger"
>
	<div class="ffs-ledger-top">
		<div class="ffs-dim-identities">
			<span class="ffs-identity-pill">
				<strong>Rank r = {analysis.rank}</strong>
			</span>
			<span class="ffs-identity-pill">
				dim C(Aᵀ) + dim N(A) = {analysis.receipts.dimRow} + {analysis.receipts.dimNull} = {analysis.n}
			</span>
			<span class="ffs-identity-pill">
				dim C(A) + dim N(Aᵀ) = {analysis.receipts.dimCol} + {analysis.receipts.dimLeftNull} = {analysis.m}
			</span>
			<span class="ffs-identity-pill">
				κ(A) = {analysis.svd.conditionNumber === null
					? '∞'
					: formatScalar(analysis.svd.conditionNumber, 2)}
			</span>
			{#if analysis.determinant !== null}
				<span class="ffs-identity-pill">
					det(A) = {formatScalar(analysis.determinant, 3)}
				</span>
			{/if}
		</div>

		<div style="display: flex; align-items: center; gap: 0.35rem;">
			<span class="ffs-field-label">Basis:</span>
			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-pressed={viewerState.basisMode === 'svd'}
				onclick={() => onSetBasisMode('svd')}
			>
				SVD Orthonormal
			</button>
			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-pressed={viewerState.basisMode === 'rref'}
				onclick={() => onSetBasisMode('rref')}
			>
				RREF / Pivot
			</button>
		</div>
	</div>

	<!-- Four Subspace Cards -->
	<div class="ffs-subspace-cards">
		{#each subspaceOrder as item (item.key)}
			{@const info = analysis.subspaces[item.key]}
			{@const basis = viewerState.basisMode === 'svd' ? info.svdBasis : info.rrefBasis}
			<article class="ffs-sub-card" data-subspace={item.key}>
				<div class="ffs-sub-head">
					<span class="ffs-sub-name">
						<span aria-hidden="true">{item.glyph}</span>
						{info.name}
						<span class="ffs-mono">{info.symbol}</span>
					</span>
					<span class="ffs-sub-meta">dim {info.dimension}</span>
				</div>
				<div class="ffs-sub-meta">
					{info.geometryLabel} ⊂ {formatEuclideanSpace(info.ambientDim)} · {item.roleTag}
				</div>
				<ul class="ffs-basis-list" aria-label={`Basis vectors of ${info.name}`}>
					{#if basis.length === 0}
						<li style="color: var(--ffs-ink-soft);">&#123;0&#125; (trivial — empty basis)</li>
					{:else}
						{#each basis as vec, idx (idx)}
							{@const label =
								viewerState.basisMode === 'svd'
									? `${item.key === 'row' || item.key === 'null' ? 'v' : 'u'}${
											(item.key === 'null' || item.key === 'leftNull' ? analysis.rank : 0) + idx + 1
										}`
									: `${
											item.key === 'row'
												? 'r'
												: item.key === 'null'
													? 'n'
													: item.key === 'col'
														? 'c'
														: 'y'
										}${idx + 1}`}
							<li>
								<strong>{label}</strong> = {formatVec(vec, 3)}
							</li>
						{/each}
					{/if}
				</ul>
			</article>
		{/each}
	</div>

	<!-- Lower Detail Grid: Singular Values + RREF / Orthogonality Receipts / Vectors Table -->
	<div class="ffs-ledger-details-grid">
		<!-- Singular Values & RREF Tableau -->
		<div class="ffs-detail-box">
			<div class="ffs-section-head">
				<h2 class="ffs-section-title">Singular Values &amp; RREF Tableau</h2>
				<span class="ffs-mono" style="font-size: 0.71rem; color: var(--ffs-ink-soft);">
					τ = {formatScientific(analysis.svd.tolerance)}
				</span>
			</div>

			<div style="display: flex; flex-direction: column; gap: 0.34rem;">
				{#each analysis.svd.singularValues as sigma, idx (idx)}
					{@const active = idx < analysis.rank}
					{@const pct = Math.min(100, (sigma / maxSigma) * 100)}
					<div
						style="display: grid; grid-template-columns: 2.2rem 1fr 4.4rem; align-items: center; gap: 0.45rem; font-size: 0.74rem;"
					>
						<span class="ffs-mono">σ{formatSubscriptIndex(idx + 1)}</span>
						<div
							style="height: 0.5rem; border-radius: 999px; background: var(--ffs-surface-alt); overflow: hidden; border: 1px solid var(--ffs-border);"
						>
							<div
								style={`width:${pct.toFixed(1)}%;height:100%;background:${active ? 'var(--ffs-col)' : 'var(--ffs-null)'};`}
							></div>
						</div>
						<span
							class="ffs-mono"
							style={`text-align: right; color: ${active ? 'var(--ffs-ink)' : 'var(--ffs-null)'};`}
						>
							{formatScalar(sigma, 4)}
						</span>
					</div>
				{/each}
			</div>

			<div style="margin-top: 0.35rem; overflow-x: auto;">
				<table class="ffs-rref-table" aria-label="Reduced Row Echelon Form of A">
					<thead>
						<tr>
							{#each Array.from({ length: analysis.n }, (_, j) => j) as col (col)}
								<th class={pivotSet.has(col) ? 'ffs-pivot-col' : 'ffs-free-col'}>
									x{col + 1} ({pivotSet.has(col) ? 'pivot' : 'free'})
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each analysis.rref.rref as row, i (i)}
							<tr>
								{#each row as entry, j (j)}
									<td class={pivotSet.has(j) ? 'ffs-pivot-col' : ''}>
										{formatScalar(entry, 3)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if analysis.rref.usedRankTruncation}
				<p style="margin: 0; font-size: 0.71rem; color: var(--ffs-null);">
					Note: RREF computed on the rank-{analysis.rank} truncated SVD approximation matching τ.
				</p>
			{/if}
		</div>

		<!-- Orthogonality & Reconstruction Receipts -->
		<div class="ffs-detail-box">
			<h2 class="ffs-section-title">Orthogonality &amp; SVD Receipts</h2>
			<table
				class="ffs-data-table"
				aria-label="Numerical orthogonality and SVD verification receipts"
			>
				<tbody>
					<tr>
						<th>max |v<sub>r</sub> · v<sub>n</sub>| (Row ⊥ Null)</th>
						<td class="ffs-mono">{formatScientific(analysis.receipts.rowNullMaxDot)}</td>
					</tr>
					<tr>
						<th>max |u<sub>c</sub> · y| (Col ⊥ Left Null)</th>
						<td class="ffs-mono">{formatScientific(analysis.receipts.colLeftNullMaxDot)}</td>
					</tr>
					<tr>
						<th>|x<sub>r</sub> · x<sub>n</sub>| (Input split 90°)</th>
						<td class="ffs-mono">{formatScientific(analysis.receipts.inputOrthogonalityDot)}</td>
					</tr>
					<tr>
						<th>‖Aᵀe‖<sub>2</sub> (Normal eq. residual)</th>
						<td class="ffs-mono">{formatScientific(analysis.receipts.normalEquationResidual)}</td>
					</tr>
					<tr>
						<th>‖A − UΣVᵀ‖<sub>F</sub> (SVD fit)</th>
						<td class="ffs-mono">{formatScientific(analysis.receipts.svdReconstructionError)}</td>
					</tr>
					<tr>
						<th>‖UᵀU − I‖<sub>F</sub> / ‖VᵀV − I‖<sub>F</sub></th>
						<td class="ffs-mono">
							{formatScientific(analysis.receipts.uOrthonormalityError)} /
							{formatScientific(analysis.receipts.vOrthonormalityError)}
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Accessible Vector & Ax=b Breakdown Table -->
		<div class="ffs-detail-box">
			<h2 class="ffs-section-title">
				Probe Vectors &amp; <span class="ffs-math-inline">Ax = b</span> Status
			</h2>
			<table class="ffs-data-table" aria-label="Input vector and least-squares breakdown">
				<tbody>
					<tr>
						<th>Input x</th>
						<td class="ffs-mono">{formatVec(xEff, 2)}</td>
					</tr>
					<tr>
						<th>Row part x<sub>r</sub> ∈ C(Aᵀ)</th>
						<td class="ffs-mono" style="color: var(--ffs-row);"
							>{formatVec(analysis.input.xRow, 2)}</td
						>
					</tr>
					<tr>
						<th>Null part x<sub>n</sub> ∈ N(A)</th>
						<td class="ffs-mono" style="color: var(--ffs-null);">
							{formatVec(
								xEff.map((v, i) => v - analysis.input.xRow[i]),
								2
							)}
						</td>
					</tr>
					<tr>
						<th>Output Ax ∈ C(A)</th>
						<td class="ffs-mono" style="color: var(--ffs-gold);">{formatVec(axEff, 2)}</td>
					</tr>
					<tr>
						<th>Target b</th>
						<td class="ffs-mono">{formatVec(analysis.target.b, 2)}</td>
					</tr>
					<tr>
						<th>Projection p ∈ C(A)</th>
						<td class="ffs-mono" style="color: var(--ffs-col);">
							{formatVec(analysis.target.projection, 2)}
						</td>
					</tr>
					<tr>
						<th>Residual e ∈ N(Aᵀ)</th>
						<td class="ffs-mono" style="color: var(--ffs-left-null);">
							{formatVec(analysis.target.residual, 2)} (‖e‖ = {formatScientific(
								analysis.target.normResidual
							)})
						</td>
					</tr>
					<tr>
						<th>Pseudoinverse x⁺ = A⁺b</th>
						<td class="ffs-mono" style="color: var(--ffs-accent);">
							{formatVec(analysis.target.xPlus, 2)}
						</td>
					</tr>
					<tr>
						<th>System regime</th>
						<td><strong>{analysis.target.regimeTitle}</strong></td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</section>
