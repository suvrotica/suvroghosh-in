<script lang="ts">
	import {
		buildOrthoBasisFromAngles,
		buildOrthoBasisFromPosition,
		computeMorphMatrix3,
		computeSmartCameraPose,
		effectiveInputVector,
		formatEuclideanSpace,
		formatScalar,
		formatSubscriptIndex,
		matVec,
		norm,
		padToVec3,
		project3DTo2D,
		type CameraPresetId,
		type OrthoProjectionBasis,
		type SubspaceAnalysis,
		type SubspaceViewerState,
		type Vec,
		type Vec3
	} from '$lib/visualizations/four-fundamental-subspaces';

	interface Props {
		viewerState: SubspaceViewerState;
		analysis: SubspaceAnalysis;
	}

	let { viewerState, analysis }: Props = $props();

	let azimuthDeg = $state(36);
	let elevationDeg = $state(24);
	let zoomMultiplier = $state(1);
	let useSmartPose = $state(false);
	let dragging = $state(false);
	let lastPointer = $state<{ x: number; y: number } | null>(null);
	let domainSvgEl = $state<SVGSVGElement | null>(null);
	let codomainSvgEl = $state<SVGSVGElement | null>(null);

	const W = 420;
	const H = 360;
	const CX = W / 2;
	const CY = H / 2;

	const isSuperimposed = $derived(
		viewerState.viewMode === 'superimposed' && analysis.m === analysis.n
	);

	// Sync when camera preset changes from parent toolbar OR on initial non-isometric URL load
	let prevPreset = $state<CameraPresetId | null>(null);
	$effect(() => {
		const cam = viewerState.cameraPreset;
		if (prevPreset === null) {
			if (cam !== 'isometric') useSmartPose = true;
		} else if (prevPreset !== cam) {
			useSmartPose = true;
		}
		prevPreset = cam;
	});

	export function orbitBy(dAzRad: number, dElRad: number): void {
		useSmartPose = false;
		azimuthDeg = (azimuthDeg + (dAzRad * 180) / Math.PI + 360) % 360;
		elevationDeg = Math.max(-80, Math.min(80, elevationDeg - (dElRad * 180) / Math.PI));
	}

	export function zoomStep(factor: number): void {
		// factor < 1 zooms in (larger scale), factor > 1 zooms out (smaller scale)
		zoomMultiplier = Math.max(0.5, Math.min(2.4, zoomMultiplier / factor));
	}

	export function applyCameraPresetNow(preset: CameraPresetId): void {
		if (preset === 'isometric') {
			azimuthDeg = 36;
			elevationDeg = 24;
		}
		useSmartPose = true;
	}

	export function resetView(): void {
		azimuthDeg = 36;
		elevationDeg = 24;
		zoomMultiplier = 1;
		useSmartPose = true;
	}

	export function getSvgElements(): SVGSVGElement[] {
		if (isSuperimposed) {
			return domainSvgEl ? [domainSvgEl] : [];
		}
		return [domainSvgEl, codomainSvgEl].filter((el): el is SVGSVGElement => el !== null);
	}

	const isLight = $derived(viewerState.studioTheme === 'light');
	const colors = $derived(
		isLight
			? {
					bg: '#f5f2ea',
					axis: '#64748b',
					row: '#0f766e',
					null: '#b45309',
					col: '#1d4ed8',
					leftNull: '#be185d',
					x: '#0f172a',
					ax: '#854d0e',
					b: '#6d28d9',
					xPlus: '#0369a1',
					rightAngle: '#0f172a',
					text: '#0f172a',
					muted: '#475569'
				}
			: {
					bg: '#0d1117',
					axis: '#64748b',
					row: '#2dd4bf',
					null: '#f59e0b',
					col: '#60a5fa',
					leftNull: '#f472b6',
					x: '#f8fafc',
					ax: '#fde047',
					b: '#c4b5fd',
					xPlus: '#38bdf8',
					rightAngle: '#f8fafc',
					text: '#f1f5f9',
					muted: '#94a3b8'
				}
	);

	const xEff = $derived(effectiveInputVector(viewerState, analysis));
	const axEff = $derived(matVec(analysis.matrix, xEff));
	const scale = $derived.by(() => {
		const maxV = Math.max(
			2.6,
			norm(xEff),
			norm(axEff),
			norm(analysis.target.b),
			norm(analysis.target.xPlus),
			analysis.svd.singularValues[0] ?? 1
		);
		return Math.min(54, 138 / maxV) * zoomMultiplier;
	});

	const morphMatrix3 = $derived(
		isSuperimposed
			? computeMorphMatrix3(analysis, viewerState.morphT, viewerState.morphMode).matrix3
			: null
	);

	function mappedLoopPath(
		transform: (p: Vec) => Vec3,
		projBasis: OrthoProjectionBasis,
		dim: 1 | 2 | 3
	): string {
		if (dim === 1) {
			const a = project3DTo2D(transform([-1]), projBasis, CX, CY, scale);
			const b = project3DTo2D(transform([1]), projBasis, CX, CY, scale);
			return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
		}
		const segs = 48;
		const cmds: string[] = [];
		for (let i = 0; i <= segs; i += 1) {
			const th = (i / segs) * Math.PI * 2;
			const pt3 =
				dim === 2
					? transform([Math.cos(th), Math.sin(th)])
					: transform([Math.cos(th), Math.sin(th), 0]);
			const p = project3DTo2D(pt3, projBasis, CX, CY, scale);
			cmds.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
		}
		return `${cmds.join(' ')} Z`;
	}

	function morphTrailPath(projBasis: OrthoProjectionBasis): string {
		const cmds: string[] = [];
		for (let step = 0; step <= 20; step += 1) {
			const s = step / 20;
			const m3 = computeMorphMatrix3(analysis, s, viewerState.morphMode).matrix3;
			const p3 = padToVec3(matVec(m3, padToVec3(xEff)));
			const p = project3DTo2D(p3, projBasis, CX, CY, scale);
			cmds.push(`${step === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
		}
		return cmds.join(' ');
	}

	const domainBasis = $derived.by((): OrthoProjectionBasis => {
		if (useSmartPose) {
			const pose = computeSmartCameraPose(analysis, viewerState.cameraPreset, 'domain');
			return buildOrthoBasisFromPosition(pose.position, pose.up);
		}
		return buildOrthoBasisFromAngles(azimuthDeg, elevationDeg);
	});

	const codomainBasis = $derived.by((): OrthoProjectionBasis => {
		if (useSmartPose) {
			const pose = computeSmartCameraPose(analysis, viewerState.cameraPreset, 'codomain');
			return buildOrthoBasisFromPosition(pose.position, pose.up);
		}
		return buildOrthoBasisFromAngles(azimuthDeg, elevationDeg);
	});

	function pt(v: Vec, basis: OrthoProjectionBasis): { x: number; y: number } {
		const p = project3DTo2D(padToVec3(v), basis, CX, CY, scale);
		return { x: p.x, y: p.y };
	}

	function diskPath(
		basisA: Vec,
		basisB: Vec,
		projBasis: OrthoProjectionBasis,
		radius = 2.4,
		offset?: Vec
	): string {
		const a = padToVec3(basisA);
		const b = padToVec3(basisB);
		const o = offset ? padToVec3(offset) : ([0, 0, 0] as Vec3);
		const segs = 48;
		const cmds: string[] = [];
		for (let i = 0; i <= segs; i += 1) {
			const th = (i / segs) * Math.PI * 2;
			const c = Math.cos(th) * radius;
			const s = Math.sin(th) * radius;
			const p = project3DTo2D(
				[o[0] + c * a[0] + s * b[0], o[1] + c * a[1] + s * b[1], o[2] + c * a[2] + s * b[2]],
				projBasis,
				CX,
				CY,
				scale
			);
			cmds.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
		}
		return `${cmds.join(' ')} Z`;
	}

	function rightAnglePath(
		corner: Vec,
		dirA: Vec,
		dirB: Vec,
		projBasis: OrthoProjectionBasis,
		size = 0.36
	): string {
		const c = padToVec3(corner);
		const na = norm(dirA);
		const nb = norm(dirB);
		if (na < 1e-8 || nb < 1e-8) return '';
		const a = padToVec3(dirA).map((v) => (v / na) * size) as Vec3;
		const b = padToVec3(dirB).map((v) => (v / nb) * size) as Vec3;
		const p1 = project3DTo2D([c[0] + a[0], c[1] + a[1], c[2] + a[2]], projBasis, CX, CY, scale);
		const p2 = project3DTo2D(
			[c[0] + a[0] + b[0], c[1] + a[1] + b[1], c[2] + a[2] + b[2]],
			projBasis,
			CX,
			CY,
			scale
		);
		const p3 = project3DTo2D([c[0] + b[0], c[1] + b[1], c[2] + b[2]], projBasis, CX, CY, scale);
		return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)} L${p3.x.toFixed(1)},${p3.y.toFixed(1)}`;
	}

	function onPointerDown(ev: PointerEvent): void {
		dragging = true;
		useSmartPose = false;
		lastPointer = { x: ev.clientX, y: ev.clientY };
		(ev.currentTarget as Element).setPointerCapture(ev.pointerId);
	}

	function onPointerMove(ev: PointerEvent): void {
		if (!dragging || !lastPointer) return;
		const dx = ev.clientX - lastPointer.x;
		const dy = ev.clientY - lastPointer.y;
		azimuthDeg = (azimuthDeg - dx * 0.65 + 360) % 360;
		elevationDeg = Math.max(-80, Math.min(80, elevationDeg + dy * 0.55));
		lastPointer = { x: ev.clientX, y: ev.clientY };
	}

	function onPointerUp(): void {
		dragging = false;
		lastPointer = null;
	}
</script>

<div class="ffs-fallback-banner" data-testid="ffs-svg-fallback" role="status">
	<strong>2D Orthographic SVG Mode</strong> (WebGL disabled or unavailable). Drag either viewport to rotate
	in 3D, or use the smart camera presets and full matrix / vector controls.
</div>

<div class="ffs-svg-fallback-grid" class:ffs-superimposed-layout={isSuperimposed}>
	<!-- Domain Stage (Input Space R^n) OR Superimposed Space -->
	<div class="ffs-stage-card">
		<div class="ffs-stage-bar">
			<span class="ffs-stage-badge">
				{#if isSuperimposed}
					Superimposed Space {formatEuclideanSpace(analysis.n)} (Domain + Codomain)
				{:else}
					Input Space {formatEuclideanSpace(analysis.n)}
				{/if}
			</span>
			<div class="ffs-stage-subbadges">
				<span class="ffs-chip ffs-chip-row">C(Aᵀ) · {analysis.subspaces.row.dimension}D</span>
				<span class="ffs-chip ffs-chip-null">N(A) · {analysis.subspaces.null.dimension}D</span>
				{#if isSuperimposed}
					<span class="ffs-chip ffs-chip-col">C(A) · {analysis.subspaces.col.dimension}D</span>
					<span class="ffs-chip ffs-chip-left-null"
						>N(Aᵀ) · {analysis.subspaces.leftNull.dimension}D</span
					>
				{/if}
			</div>
		</div>
		<svg
			bind:this={domainSvgEl}
			class="ffs-svg-stage"
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={isSuperimposed
				? `Orthographic 3D projection of Superimposed space ${formatEuclideanSpace(analysis.n)} at morph t=${viewerState.morphT.toFixed(2)}`
				: `Orthographic 3D projection of Domain ${formatEuclideanSpace(analysis.n)} showing Row Space C(Aᵀ) of dimension ${analysis.subspaces.row.dimension} and Nullspace N(A) of dimension ${analysis.subspaces.null.dimension}`}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<rect x="0" y="0" width={W} height={H} fill={colors.bg} />

			<!-- Active ambient axes -->
			{#if viewerState.layers.showGridAxes}
				{#each Array.from({ length: analysis.n }, (_, i) => i) as axisIdx (axisIdx)}
					{@const neg = Array.from({ length: 3 }, (_, k) => (k === axisIdx ? -2.6 : 0))}
					{@const pos = Array.from({ length: 3 }, (_, k) => (k === axisIdx ? 2.6 : 0))}
					{@const pA = pt(neg, domainBasis)}
					{@const pB = pt(pos, domainBasis)}
					<line
						x1={pA.x}
						y1={pA.y}
						x2={pB.x}
						y2={pB.y}
						stroke={colors.axis}
						stroke-opacity="0.45"
						stroke-width="1.2"
					/>
					<text
						x={pB.x + 6}
						y={pB.y + 4}
						fill={colors.muted}
						font-size="11"
						font-family="monospace"
					>
						x{axisIdx + 1}
					</text>
				{/each}
			{/if}

			<!-- Row Space C(A^T) -->
			{#if viewerState.layers.showRowSpace}
				{@const rowInfo = analysis.subspaces.row}
				{#if rowInfo.dimension === 0}
					<circle cx={CX} cy={CY} r="7" fill="none" stroke={colors.row} stroke-width="2.2" />
				{:else if rowInfo.dimension === 1 && rowInfo.svdBasis[0]}
					{@const d = rowInfo.svdBasis[0]}
					{@const p1 = pt(
						d.map((v) => -v * 2.5),
						domainBasis
					)}
					{@const p2 = pt(
						d.map((v) => v * 2.5),
						domainBasis
					)}
					<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={colors.row} stroke-width="3.2" />
				{:else if rowInfo.dimension === 2 && rowInfo.svdBasis.length >= 2}
					<path
						d={diskPath(rowInfo.svdBasis[0], rowInfo.svdBasis[1], domainBasis, 2.35)}
						fill={colors.row}
						fill-opacity="0.2"
						stroke={colors.row}
						stroke-width="1.8"
					/>
				{:else if rowInfo.dimension === 3}
					<circle
						cx={CX}
						cy={CY}
						r={scale * 2.1}
						fill={colors.row}
						fill-opacity="0.06"
						stroke={colors.row}
						stroke-dasharray="5 4"
						stroke-width="1.2"
					/>
				{/if}
			{/if}

			<!-- Nullspace N(A) -->
			{#if viewerState.layers.showNullspace}
				{@const nullInfo = analysis.subspaces.null}
				{#if nullInfo.dimension === 0}
					<circle cx={CX} cy={CY} r="4.5" fill={colors.null} />
				{:else if nullInfo.dimension === 1 && nullInfo.svdBasis[0]}
					{@const d = nullInfo.svdBasis[0]}
					{@const p1 = pt(
						d.map((v) => -v * 2.5),
						domainBasis
					)}
					{@const p2 = pt(
						d.map((v) => v * 2.5),
						domainBasis
					)}
					<line
						x1={p1.x}
						y1={p1.y}
						x2={p2.x}
						y2={p2.y}
						stroke={colors.null}
						stroke-width="3"
						stroke-dasharray="7 4"
					/>
				{:else if nullInfo.dimension === 2 && nullInfo.svdBasis.length >= 2}
					<path
						d={diskPath(nullInfo.svdBasis[0], nullInfo.svdBasis[1], domainBasis, 2.25)}
						fill={colors.null}
						fill-opacity="0.16"
						stroke={colors.null}
						stroke-dasharray="6 4"
						stroke-width="1.6"
					/>
				{:else if nullInfo.dimension === 3}
					<circle
						cx={CX}
						cy={CY}
						r={scale * 2.1}
						fill={colors.null}
						fill-opacity="0.08"
						stroke={colors.null}
						stroke-dasharray="4 4"
						stroke-width="1.4"
					/>
				{/if}
			{/if}

			<!-- Right angle glyph between C(A^T) and N(A) -->
			{#if viewerState.layers.showRightAngles && analysis.subspaces.row.svdBasis[0] && analysis.subspaces.null.svdBasis[0]}
				<path
					d={rightAnglePath(
						[0, 0, 0],
						analysis.subspaces.row.svdBasis[0],
						analysis.subspaces.null.svdBasis[0],
						domainBasis
					)}
					fill="none"
					stroke={colors.rightAngle}
					stroke-width="1.6"
				/>
			{/if}

			<!-- Input x = x_r + x_n and fiber -->
			{#if viewerState.layers.showInputVector}
				{@const pO = pt([0, 0, 0], domainBasis)}
				{@const pX = pt(xEff, domainBasis)}
				{@const pXr = pt(analysis.input.xRow, domainBasis)}
				{#if viewerState.layers.showAffineFiber && analysis.subspaces.null.dimension === 1 && analysis.subspaces.null.svdBasis[0]}
					{@const d = analysis.subspaces.null.svdBasis[0]}
					{@const f1 = pt(
						analysis.input.xRow.map((v, i) => v - d[i] * 2.1),
						domainBasis
					)}
					{@const f2 = pt(
						analysis.input.xRow.map((v, i) => v + d[i] * 2.1),
						domainBasis
					)}
					<line
						x1={f1.x}
						y1={f1.y}
						x2={f2.x}
						y2={f2.y}
						stroke={colors.null}
						stroke-opacity="0.7"
						stroke-dasharray="4 3"
						stroke-width="1.5"
					/>
				{/if}
				{#if viewerState.layers.showInputSplit}
					<line x1={pO.x} y1={pO.y} x2={pXr.x} y2={pXr.y} stroke={colors.row} stroke-width="2.2" />
					<line
						x1={pXr.x}
						y1={pXr.y}
						x2={pX.x}
						y2={pX.y}
						stroke={colors.null}
						stroke-dasharray="4 3"
						stroke-width="1.8"
					/>
				{/if}
				<line x1={pO.x} y1={pO.y} x2={pX.x} y2={pX.y} stroke={colors.x} stroke-width="2.6" />
				<circle cx={pX.x} cy={pX.y} r="4.2" fill={colors.x} />
				{#if viewerState.layers.showLabels}
					<text
						x={pX.x + 8}
						y={pX.y - 6}
						fill={colors.x}
						font-size="12"
						font-weight="700"
						font-family="monospace"
					>
						x
					</text>
				{/if}
			{/if}

			{#if isSuperimposed}
				<!-- Codomain subspaces overlaid in Superimposed mode -->
				{#if viewerState.layers.showColSpace}
					{@const colInfo = analysis.subspaces.col}
					{#if colInfo.dimension === 1 && colInfo.svdBasis[0]}
						{@const d = colInfo.svdBasis[0]}
						{@const p1 = pt(
							d.map((v) => -v * 2.5),
							domainBasis
						)}
						{@const p2 = pt(
							d.map((v) => v * 2.5),
							domainBasis
						)}
						<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={colors.col} stroke-width="3" />
					{:else if colInfo.dimension === 2 && colInfo.svdBasis.length >= 2}
						<path
							d={diskPath(colInfo.svdBasis[0], colInfo.svdBasis[1], domainBasis, 2.35)}
							fill={colors.col}
							fill-opacity="0.18"
							stroke={colors.col}
							stroke-width="1.8"
						/>
					{/if}
				{/if}

				{#if viewerState.layers.showLeftNullspace}
					{@const leftInfo = analysis.subspaces.leftNull}
					{#if leftInfo.dimension === 1 && leftInfo.svdBasis[0]}
						{@const d = leftInfo.svdBasis[0]}
						{@const p1 = pt(
							d.map((v) => -v * 2.5),
							domainBasis
						)}
						{@const p2 = pt(
							d.map((v) => v * 2.5),
							domainBasis
						)}
						<line
							x1={p1.x}
							y1={p1.y}
							x2={p2.x}
							y2={p2.y}
							stroke={colors.leftNull}
							stroke-width="2.8"
							stroke-dasharray="7 4"
						/>
					{:else if leftInfo.dimension === 2 && leftInfo.svdBasis.length >= 2}
						<path
							d={diskPath(leftInfo.svdBasis[0], leftInfo.svdBasis[1], domainBasis, 2.25)}
							fill={colors.leftNull}
							fill-opacity="0.14"
							stroke={colors.leftNull}
							stroke-dasharray="6 4"
							stroke-width="1.5"
						/>
					{/if}
				{/if}

				{#if viewerState.layers.showUnitSphere && morphMatrix3}
					<path
						d={mappedLoopPath((p) => padToVec3(p), domainBasis, analysis.n)}
						fill="none"
						stroke={colors.axis}
						stroke-opacity="0.45"
						stroke-dasharray="4 3"
						stroke-width="1.3"
					/>
					<path
						d={mappedLoopPath(
							(p) => padToVec3(matVec(morphMatrix3, padToVec3(p))),
							domainBasis,
							analysis.n
						)}
						fill={colors.col}
						fill-opacity="0.12"
						stroke={colors.col}
						stroke-width="2"
					/>
				{/if}

				{#if viewerState.layers.showInputVector && morphMatrix3}
					{@const pO = pt([0, 0, 0], domainBasis)}
					{@const pMt = pt(matVec(morphMatrix3, padToVec3(xEff)), domainBasis)}
					<path
						d={morphTrailPath(domainBasis)}
						fill="none"
						stroke={colors.ax}
						stroke-opacity="0.55"
						stroke-dasharray="3 3"
						stroke-width="1.5"
					/>
					<line x1={pO.x} y1={pO.y} x2={pMt.x} y2={pMt.y} stroke={colors.ax} stroke-width="2.8" />
					<circle cx={pMt.x} cy={pMt.y} r="4.5" fill={colors.ax} />
					{#if viewerState.layers.showLabels}
						<text
							x={pMt.x + 8}
							y={pMt.y - 6}
							fill={colors.ax}
							font-size="11.5"
							font-weight="700"
							font-family="monospace"
						>
							{viewerState.morphT > 0.98 ? 'Ax' : `M(${viewerState.morphT.toFixed(2)})x`}
						</text>
					{/if}
				{/if}
			{/if}

			{#if viewerState.layers.showPseudoinverse}
				{@const pXp = pt(analysis.target.xPlus, domainBasis)}
				<circle cx={pXp.x} cy={pXp.y} r="4.8" fill={colors.xPlus} />
				{#if viewerState.layers.showLabels}
					<text
						x={pXp.x + 8}
						y={pXp.y + 12}
						fill={colors.xPlus}
						font-size="11"
						font-weight="700"
						font-family="monospace"
					>
						x⁺
					</text>
				{/if}
			{/if}
		</svg>
	</div>

	{#if !isSuperimposed}
		<!-- Center Action Bridge -->
		<div class="ffs-action-bridge" aria-label="Linear map summary between domain and codomain">
			<div class="ffs-bridge-title">
				A : {formatEuclideanSpace(analysis.n)} → {formatEuclideanSpace(analysis.m)}
			</div>
			<div class="ffs-bridge-box">
				<div class="ffs-mono" style="color: var(--ffs-row); font-weight: 700;">C(Aᵀ) ≅ C(A)</div>
				<div style="color: var(--ffs-ink-muted); font-size: 0.68rem;">
					Rank r = {analysis.rank} bijection
				</div>
				<div class="ffs-bridge-sigmas">
					{#each analysis.svd.singularValues as s, i (i)}
						<div class="ffs-bridge-sigma-row">
							<span>σ{formatSubscriptIndex(i + 1)}</span>
							<strong
								style={i < analysis.rank ? 'color: var(--ffs-col);' : 'color: var(--ffs-ink-soft);'}
							>
								{formatScalar(s, 3)}
							</strong>
						</div>
					{/each}
				</div>
			</div>
			<div class="ffs-bridge-box">
				<div class="ffs-mono" style="color: var(--ffs-null); font-weight: 700;">
					N(A) → &#123;0&#125;
				</div>
				<div style="color: var(--ffs-ink-muted); font-size: 0.68rem;">
					{analysis.subspaces.null.dimension === 0
						? 'Injective (no collapse)'
						: `${analysis.subspaces.null.dimension}D collapsed to origin`}
				</div>
			</div>
		</div>

		<!-- Codomain Stage (Output Space R^m) -->
		<div class="ffs-stage-card">
			<div class="ffs-stage-bar">
				<span class="ffs-stage-badge">Output Space {formatEuclideanSpace(analysis.m)}</span>
				<div class="ffs-stage-subbadges">
					<span class="ffs-chip ffs-chip-col">C(A) · {analysis.subspaces.col.dimension}D</span>
					<span class="ffs-chip ffs-chip-left-null"
						>N(Aᵀ) · {analysis.subspaces.leftNull.dimension}D</span
					>
				</div>
			</div>
			<svg
				bind:this={codomainSvgEl}
				class="ffs-svg-stage"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`Orthographic 3D projection of Codomain ${formatEuclideanSpace(analysis.m)} showing Column Space C(A) of dimension ${analysis.subspaces.col.dimension} and Left Nullspace N(Aᵀ) of dimension ${analysis.subspaces.leftNull.dimension}`}
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
			>
				<rect x="0" y="0" width={W} height={H} fill={colors.bg} />

				{#if viewerState.layers.showGridAxes}
					{#each Array.from({ length: analysis.m }, (_, i) => i) as axisIdx (axisIdx)}
						{@const neg = Array.from({ length: 3 }, (_, k) => (k === axisIdx ? -2.6 : 0))}
						{@const pos = Array.from({ length: 3 }, (_, k) => (k === axisIdx ? 2.6 : 0))}
						{@const pA = pt(neg, codomainBasis)}
						{@const pB = pt(pos, codomainBasis)}
						<line
							x1={pA.x}
							y1={pA.y}
							x2={pB.x}
							y2={pB.y}
							stroke={colors.axis}
							stroke-opacity="0.45"
							stroke-width="1.2"
						/>
						<text
							x={pB.x + 6}
							y={pB.y + 4}
							fill={colors.muted}
							font-size="11"
							font-family="monospace"
						>
							y{axisIdx + 1}
						</text>
					{/each}
				{/if}

				<!-- Column Space C(A) -->
				{#if viewerState.layers.showColSpace}
					{@const colInfo = analysis.subspaces.col}
					{#if colInfo.dimension === 0}
						<circle cx={CX} cy={CY} r="7" fill="none" stroke={colors.col} stroke-width="2.2" />
					{:else if colInfo.dimension === 1 && colInfo.svdBasis[0]}
						{@const d = colInfo.svdBasis[0]}
						{@const p1 = pt(
							d.map((v) => -v * 2.5),
							codomainBasis
						)}
						{@const p2 = pt(
							d.map((v) => v * 2.5),
							codomainBasis
						)}
						<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={colors.col} stroke-width="3.2" />
					{:else if colInfo.dimension === 2 && colInfo.svdBasis.length >= 2}
						<path
							d={diskPath(colInfo.svdBasis[0], colInfo.svdBasis[1], codomainBasis, 2.35)}
							fill={colors.col}
							fill-opacity="0.2"
							stroke={colors.col}
							stroke-width="1.8"
						/>
					{:else if colInfo.dimension === 3}
						<circle
							cx={CX}
							cy={CY}
							r={scale * 2.1}
							fill={colors.col}
							fill-opacity="0.06"
							stroke={colors.col}
							stroke-dasharray="5 4"
							stroke-width="1.2"
						/>
					{/if}
				{/if}

				<!-- Left Nullspace N(A^T) -->
				{#if viewerState.layers.showLeftNullspace}
					{@const leftInfo = analysis.subspaces.leftNull}
					{#if leftInfo.dimension === 0}
						<circle cx={CX} cy={CY} r="4.5" fill={colors.leftNull} />
					{:else if leftInfo.dimension === 1 && leftInfo.svdBasis[0]}
						{@const d = leftInfo.svdBasis[0]}
						{@const p1 = pt(
							d.map((v) => -v * 2.5),
							codomainBasis
						)}
						{@const p2 = pt(
							d.map((v) => v * 2.5),
							codomainBasis
						)}
						<line
							x1={p1.x}
							y1={p1.y}
							x2={p2.x}
							y2={p2.y}
							stroke={colors.leftNull}
							stroke-width="3"
							stroke-dasharray="7 4"
						/>
					{:else if leftInfo.dimension === 2 && leftInfo.svdBasis.length >= 2}
						<path
							d={diskPath(leftInfo.svdBasis[0], leftInfo.svdBasis[1], codomainBasis, 2.25)}
							fill={colors.leftNull}
							fill-opacity="0.16"
							stroke={colors.leftNull}
							stroke-dasharray="6 4"
							stroke-width="1.6"
						/>
					{:else if leftInfo.dimension === 3}
						<circle
							cx={CX}
							cy={CY}
							r={scale * 2.1}
							fill={colors.leftNull}
							fill-opacity="0.08"
							stroke={colors.leftNull}
							stroke-dasharray="4 4"
							stroke-width="1.4"
						/>
					{/if}
				{/if}

				{#if viewerState.layers.showRightAngles && analysis.subspaces.col.svdBasis[0] && analysis.subspaces.leftNull.svdBasis[0]}
					<path
						d={rightAnglePath(
							[0, 0, 0],
							analysis.subspaces.col.svdBasis[0],
							analysis.subspaces.leftNull.svdBasis[0],
							codomainBasis
						)}
						fill="none"
						stroke={colors.rightAngle}
						stroke-width="1.6"
					/>
				{/if}

				<!-- Output Ax -->
				{#if viewerState.layers.showInputVector}
					{@const pO = pt([0, 0, 0], codomainBasis)}
					{@const pAx = pt(axEff, codomainBasis)}
					<line x1={pO.x} y1={pO.y} x2={pAx.x} y2={pAx.y} stroke={colors.ax} stroke-width="2.8" />
					<circle cx={pAx.x} cy={pAx.y} r="4.4" fill={colors.ax} />
					{#if viewerState.layers.showLabels}
						<text
							x={pAx.x + 8}
							y={pAx.y - 6}
							fill={colors.ax}
							font-size="12"
							font-weight="700"
							font-family="monospace"
						>
							Ax
						</text>
					{/if}
				{/if}

				<!-- Target b = p + e -->
				{#if viewerState.layers.showTargetVector}
					{@const pO = pt([0, 0, 0], codomainBasis)}
					{@const pB = pt(analysis.target.b, codomainBasis)}
					{@const pP = pt(analysis.target.projection, codomainBasis)}
					{#if viewerState.layers.showTargetSplit}
						<line x1={pO.x} y1={pO.y} x2={pP.x} y2={pP.y} stroke={colors.col} stroke-width="2.2" />
						{#if analysis.target.normResidual > 0.03}
							<line
								x1={pP.x}
								y1={pP.y}
								x2={pB.x}
								y2={pB.y}
								stroke={colors.leftNull}
								stroke-width="2.2"
								stroke-dasharray="5 3"
							/>
						{/if}
					{/if}
					<line x1={pO.x} y1={pO.y} x2={pB.x} y2={pB.y} stroke={colors.b} stroke-width="2.4" />
					<circle cx={pB.x} cy={pB.y} r="4.2" fill={colors.b} />
					{#if viewerState.layers.showLabels}
						<text
							x={pB.x + 8}
							y={pB.y + 12}
							fill={colors.b}
							font-size="12"
							font-weight="700"
							font-family="monospace"
						>
							b
						</text>
					{/if}
				{/if}
			</svg>
		</div>
	{/if}
</div>
