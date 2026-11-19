<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { supportsWebGL } from '$lib/visualizations/webgl';
	import {
		computeMorphMatrix3,
		computeSmartCameraPose,
		formatEuclideanSpace,
		formatScalar,
		formatSubscriptIndex,
		type CameraPresetId,
		type MorphMode,
		type OrientationSnapshot,
		type ProjectedLabel,
		type SubspaceAnalysis,
		type SubspaceViewerState,
		type Vec3,
		type ViewMode
	} from '$lib/visualizations/four-fundamental-subspaces';
	import type { SubspaceStageHandle } from '$lib/visualizations/four-fundamental-subspaces/renderer';
	import SubspaceSvgFallback from './SubspaceSvgFallback.svelte';

	interface Props {
		viewerState: SubspaceViewerState;
		analysis: SubspaceAnalysis;
		cameraResetNonce: number;
		onSetCameraPreset: (preset: CameraPresetId) => void;
		onToggleLinkCameras: () => void;
		onSetViewMode: (mode: ViewMode) => void;
		onSetMorphMode: (mode: MorphMode) => void;
		onSetMorphT: (t: number, syncUrl?: boolean) => void;
		onStatusAnnouncement?: (text: string) => void;
	}

	let {
		viewerState,
		analysis,
		cameraResetNonce,
		onSetCameraPreset,
		onToggleLinkCameras,
		onSetViewMode,
		onSetMorphMode,
		onSetMorphT,
		onStatusAnnouncement
	}: Props = $props();

	let primaryCanvas = $state<HTMLCanvasElement | null>(null);
	let secondaryCanvas = $state<HTMLCanvasElement | null>(null);
	let primaryHandle = $state<SubspaceStageHandle | null>(null);
	let secondaryHandle = $state<SubspaceStageHandle | null>(null);
	let svgFallbackComp = $state<SubspaceSvgFallback | null>(null);

	let webglSupported = $state(true);
	let webglError = $state('');
	let contextLost = $state(false);
	let morphPlaying = $state(false);
	let morphRafId: number | null = null;
	let morphLastTime = 0;

	let domainLabels = $state<ProjectedLabel[]>([]);
	let codomainLabels = $state<ProjectedLabel[]>([]);
	let orientation = $state<OrientationSnapshot>({
		right: [1, 0, 0],
		up: [0, 1, 0],
		forward: [0, 0, 1]
	});

	const isSuperimposed = $derived(
		viewerState.viewMode === 'superimposed' && analysis.m === analysis.n
	);
	const morphInfo = $derived(
		computeMorphMatrix3(analysis, viewerState.morphT, viewerState.morphMode)
	);
	const cameraNote = $derived.by(() => {
		const stage = isSuperimposed ? 'superimposed' : 'domain';
		return computeSmartCameraPose(analysis, viewerState.cameraPreset, stage).note;
	});

	// Interactive 3D orientation compass nodes (+x1, +x2, +x3)
	const compassNodes = $derived.by(() => {
		const cx = 34;
		const cy = 34;
		const r = 21;
		const axes: { key: string; title: string; axis: Vec3; v: Vec3; color: string }[] = [
			{ key: 'x₁', title: '+x₁ axis', axis: [1, 0, 0], v: orientation.right, color: '#5eead4' },
			{ key: 'x₂', title: '+x₂ axis', axis: [0, 1, 0], v: orientation.up, color: '#93c5fd' },
			{ key: 'x₃', title: '+x₃ axis', axis: [0, 0, 1], v: orientation.forward, color: '#fbbf24' }
		];
		return axes
			.slice(0, analysis.n)
			.map((a) => ({
				...a,
				x: cx + a.v[0] * r,
				y: cy - a.v[1] * r,
				z: a.v[2]
			}))
			.sort((a, b) => a.z - b.z);
	});

	onMount(async () => {
		if (!supportsWebGL()) {
			webglSupported = false;
			return;
		}
		if (!primaryCanvas || !secondaryCanvas) return;

		try {
			const { createSubspaceStageRenderer } =
				await import('$lib/visualizations/four-fundamental-subspaces/renderer');
			if (!primaryCanvas || !secondaryCanvas) return;

			const primaryRole = isSuperimposed ? 'superimposed' : 'domain';
			primaryHandle = createSubspaceStageRenderer(primaryCanvas, primaryRole, {
				onCameraOrbit: (snap) => {
					if (viewerState.linkCameras && !isSuperimposed) {
						secondaryHandle?.syncCameraFrom(snap);
					}
				},
				onLabelsUpdate: (next) => {
					domainLabels = next;
				},
				onOrientationUpdate: (snap) => {
					orientation = snap;
				},
				onContextLossChange: (lost) => {
					contextLost = lost;
				}
			});

			secondaryHandle = createSubspaceStageRenderer(secondaryCanvas, 'codomain', {
				onCameraOrbit: (snap) => {
					if (viewerState.linkCameras && !isSuperimposed) {
						primaryHandle?.syncCameraFrom(snap);
					}
				},
				onLabelsUpdate: (next) => {
					codomainLabels = next;
				},
				onContextLossChange: (lost) => {
					contextLost = lost;
				}
			});

			primaryHandle.update(viewerState, analysis, primaryRole);
			secondaryHandle.update(viewerState, analysis, 'codomain');
			primaryHandle.applySmartCamera(analysis, viewerState.cameraPreset, true);
			secondaryHandle.applySmartCamera(analysis, viewerState.cameraPreset, true);
			secondaryHandle.setPaused(isSuperimposed);
			onStatusAnnouncement?.('Mounted 3D Four Fundamental Subspaces dual-stage laboratory.');
		} catch (err) {
			webglError = err instanceof Error ? err.message : 'WebGL initialization failed.';
			webglSupported = false;
		}
	});

	// Keep WebGL scenes synchronized with reactive Svelte 5 state (including fine-grained phase/morph updates)
	$effect(() => {
		const nextState = viewerState;
		const nextAnalysis = analysis;
		const superimposed = isSuperimposed;
		const pHandle = primaryHandle;
		const sHandle = secondaryHandle;
		// Explicitly read animation-mutated scalars and layer flags so fine-grained mutations trigger scene refresh
		void nextState.slideNullPhase;
		void nextState.morphT;
		void nextState.morphMode;
		void nextState.basisMode;
		void nextState.studioTheme;
		void nextState.layers.showRowSpace;
		void nextState.layers.showNullspace;
		void nextState.layers.showColSpace;
		void nextState.layers.showLeftNullspace;
		void nextState.layers.showBasisVectors;
		void nextState.layers.showUnitSphere;
		void nextState.layers.showInputVector;
		void nextState.layers.showInputSplit;
		void nextState.layers.showAffineFiber;
		void nextState.layers.showTargetVector;
		void nextState.layers.showTargetSplit;
		void nextState.layers.showPseudoinverse;
		void nextState.layers.showRightAngles;
		void nextState.layers.showLabels;
		void nextState.layers.showGridAxes;
		if (!pHandle || !sHandle) return;

		pHandle.update(nextState, nextAnalysis, superimposed ? 'superimposed' : 'domain');
		sHandle.setPaused(superimposed);
		if (!superimposed) {
			sHandle.update(nextState, nextAnalysis, 'codomain');
		}
	});

	// Re-aim camera ONLY on preset loads, shape changes, camera preset clicks, or dual/superimposed switches
	// (never yanks the user's manually orbited camera when scrubbing individual matrix entries).
	let lastCamKey = $state('');
	$effect(() => {
		const key = `${analysis.m}x${analysis.n}|${viewerState.cameraPreset}|${isSuperimposed ? 'sup' : 'dual'}|${cameraResetNonce}`;
		const nextAnalysis = analysis;
		const camPreset = viewerState.cameraPreset;
		const pHandle = primaryHandle;
		const sHandle = secondaryHandle;
		if (!pHandle || !sHandle) return;
		if (lastCamKey && lastCamKey !== key) {
			pHandle.applySmartCamera(nextAnalysis, camPreset, false);
			if (!isSuperimposed) {
				sHandle.applySmartCamera(nextAnalysis, camPreset, false);
			}
		}
		lastCamKey = key;
	});

	function stopMorphPlayback(): void {
		morphPlaying = false;
		if (morphRafId !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(morphRafId);
			morphRafId = null;
		}
	}

	function toggleMorphPlay(): void {
		if (morphPlaying) {
			stopMorphPlayback();
			return;
		}
		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			// Respect reduced motion: step cleanly between key milestones
			const nextT =
				viewerState.morphT < 0.33
					? 1 / 3
					: viewerState.morphT < 0.66
						? 2 / 3
						: viewerState.morphT < 0.99
							? 1
							: 0;
			onSetMorphT(nextT, true);
			return;
		}
		if (viewerState.morphT >= 0.99) onSetMorphT(0, false);
		morphPlaying = true;
		morphLastTime = performance.now();
		const tick = (now: number) => {
			if (!morphPlaying) return;
			const dt = Math.min(0.08, (now - morphLastTime) / 1000);
			morphLastTime = now;
			const next = viewerState.morphT + dt * 0.28;
			if (next >= 1) {
				onSetMorphT(1, true);
				stopMorphPlayback();
				return;
			}
			onSetMorphT(Number(next.toFixed(3)), false);
			morphRafId = window.requestAnimationFrame(tick);
		};
		morphRafId = window.requestAnimationFrame(tick);
	}

	onDestroy(() => {
		stopMorphPlayback();
		primaryHandle?.dispose();
		secondaryHandle?.dispose();
		primaryHandle = null;
		secondaryHandle = null;
	});

	export function applyCameraPresetNow(preset: CameraPresetId): void {
		if (!webglSupported) {
			svgFallbackComp?.applyCameraPresetNow(preset);
			return;
		}
		primaryHandle?.applySmartCamera(analysis, preset, false);
		if (!isSuperimposed) {
			secondaryHandle?.applySmartCamera(analysis, preset, false);
		}
	}

	export function orbitKeyboard(dAz: number, dEl: number): void {
		if (!webglSupported) {
			svgFallbackComp?.orbitBy(dAz, dEl);
			return;
		}
		primaryHandle?.orbitBy(dAz, dEl);
		if (viewerState.linkCameras && !isSuperimposed && primaryHandle && secondaryHandle) {
			secondaryHandle.syncCameraFrom(primaryHandle.getCameraSnapshot());
		}
	}

	export function zoomStep(factor: number): void {
		if (!webglSupported) {
			svgFallbackComp?.zoomStep(factor);
			return;
		}
		primaryHandle?.zoomStep(factor);
		if (viewerState.linkCameras && !isSuperimposed && primaryHandle && secondaryHandle) {
			secondaryHandle.syncCameraFrom(primaryHandle.getCameraSnapshot());
		}
	}

	export function resetView(): void {
		onSetCameraPreset('isometric');
		if (!webglSupported) {
			svgFallbackComp?.resetView();
			return;
		}
		primaryHandle?.applySmartCamera(analysis, 'isometric', false);
		if (!isSuperimposed) {
			secondaryHandle?.applySmartCamera(analysis, 'isometric', false);
		}
	}

	function rasterizeSvgToImage(svgEl: SVGSVGElement): Promise<HTMLImageElement | null> {
		return new Promise((resolve) => {
			try {
				const serialized = new XMLSerializer().serializeToString(svgEl);
				const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => {
					URL.revokeObjectURL(url);
					resolve(img);
				};
				img.onerror = () => {
					URL.revokeObjectURL(url);
					resolve(null);
				};
				img.src = url;
			} catch {
				resolve(null);
			}
		});
	}

	export async function exportPng(): Promise<Blob | null> {
		const outW = 1440;
		const outH = 760;
		const headerH = 68;
		const pad = 20;
		const off = document.createElement('canvas');
		off.width = outW;
		off.height = outH;
		const ctx = off.getContext('2d');
		if (!ctx) return null;

		const light = viewerState.studioTheme === 'light';
		ctx.fillStyle = light ? '#f5f2ea' : '#0c1016';
		ctx.fillRect(0, 0, outW, outH);

		ctx.fillStyle = light ? '#0f172a' : '#f1f5f9';
		ctx.font = '700 22px system-ui, -apple-system, sans-serif';
		ctx.fillText(
			`Four Fundamental Subspaces (${analysis.m}×${analysis.n}, Rank ${analysis.rank})`,
			pad,
			36
		);
		ctx.fillStyle = light ? '#475569' : '#94a3b8';
		ctx.font = '500 14px ui-monospace, SFMono-Regular, monospace';
		ctx.fillText(
			`C(Aᵀ) ${analysis.subspaces.row.dimension}D ⊥ N(A) ${analysis.subspaces.null.dimension}D   |   C(A) ${analysis.subspaces.col.dimension}D ⊥ N(Aᵀ) ${analysis.subspaces.leftNull.dimension}D   |   ${analysis.target.regimeTitle}`,
			pad,
			58
		);

		const bodyY = headerH + 8;
		const bodyH = outH - bodyY - pad;

		if (!webglSupported) {
			const svgs = svgFallbackComp?.getSvgElements() ?? [];
			if (svgs.length === 0) return null;
			const imgs = await Promise.all(svgs.map((el) => rasterizeSvgToImage(el)));
			const valid = imgs.filter((img): img is HTMLImageElement => img !== null);
			if (valid.length === 0) return null;
			if (valid.length >= 2) {
				const stageW = Math.floor((outW - pad * 3) / 2);
				ctx.drawImage(valid[0], pad, bodyY, stageW, bodyH);
				ctx.drawImage(valid[1], pad * 2 + stageW, bodyY, stageW, bodyH);
			} else {
				ctx.drawImage(valid[0], pad, bodyY, outW - pad * 2, bodyH);
			}
			return new Promise((resolve) => off.toBlob((blob) => resolve(blob), 'image/png'));
		}

		if (!primaryHandle) return null;
		primaryHandle.renderOnce();
		if (!isSuperimposed) secondaryHandle?.renderOnce();

		const c1 = primaryHandle.getCanvas();
		const c2 = !isSuperimposed && secondaryHandle ? secondaryHandle.getCanvas() : null;

		if (c2) {
			const stageW = Math.floor((outW - pad * 3) / 2);
			ctx.drawImage(c1, pad, bodyY, stageW, bodyH);
			ctx.drawImage(c2, pad * 2 + stageW, bodyY, stageW, bodyH);
		} else {
			ctx.drawImage(c1, pad, bodyY, outW - pad * 2, bodyH);
		}

		return new Promise((resolve) => off.toBlob((blob) => resolve(blob), 'image/png'));
	}

	const cameraPresets: { id: CameraPresetId; label: string; title: string }[] = [
		{ id: 'isometric', label: 'Isometric 3/4', title: 'Balanced 3/4 overview (R)' },
		{
			id: 'edge-on',
			label: 'Edge-On to Plane',
			title: 'View 2D subspace edge-on so its 1D orthogonal complement pierces it at 90°'
		},
		{
			id: 'down-nullspace',
			label: 'Look Down Nullspace',
			title: 'Sight along N(A) so affine solution fibers visually collapse to a single point'
		},
		{
			id: 'face-on-active',
			label: 'Face-On Active',
			title: 'Look head-on at the active Row / Column space'
		}
	];
</script>

<div class="ffs-viewport-column">
	<!-- Camera & View Toolbar -->
	<div class="ffs-camera-toolbar" role="toolbar" aria-label="3D camera angles and view mode">
		<div class="ffs-toolbar-group">
			{#each cameraPresets as preset (preset.id)}
				<button
					type="button"
					class="ffs-btn ffs-btn-xs"
					aria-pressed={viewerState.cameraPreset === preset.id}
					title={preset.title}
					onclick={() => {
						onSetCameraPreset(preset.id);
						applyCameraPresetNow(preset.id);
					}}
				>
					{preset.label}
				</button>
			{/each}
		</div>

		<div class="ffs-toolbar-group">
			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-pressed={viewerState.linkCameras}
				disabled={isSuperimposed}
				title="Keep Domain and Codomain camera orbits synchronized"
				onclick={onToggleLinkCameras}
			>
				{viewerState.linkCameras ? 'Linked Orbit' : 'Free Orbit'}
			</button>

			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-pressed={isSuperimposed}
				disabled={analysis.m !== analysis.n}
				title={analysis.m === analysis.n
					? 'Merge Domain and Codomain into one 3D frame with transformation morph slider'
					: 'Superimposed morph requires a square matrix (m = n)'}
				onclick={() => onSetViewMode(isSuperimposed ? 'dual' : 'superimposed')}
			>
				{isSuperimposed ? 'Dual Stages' : 'Superimposed Morph'}
			</button>

			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-label="Zoom in"
				title="Zoom in (+)"
				onclick={() => zoomStep(0.84)}
			>
				+
			</button>
			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				aria-label="Zoom out"
				title="Zoom out (-)"
				onclick={() => zoomStep(1.18)}
			>
				−
			</button>
			<button
				type="button"
				class="ffs-btn ffs-btn-xs"
				title="Reset camera angle (R)"
				onclick={resetView}
			>
				Reset View
			</button>
		</div>
	</div>

	<div class="ffs-camera-note">
		<span>{cameraNote}</span>
		<span class="ffs-mono" style="font-size: 0.72rem;">
			Drag to orbit · Scroll zoom · Arrow keys / + / − / R
		</span>
	</div>

	{#if !webglSupported}
		{#if webglError}
			<div class="ffs-fallback-banner" role="alert">
				WebGL renderer notice: {webglError}
			</div>
		{/if}
		<SubspaceSvgFallback bind:this={svgFallbackComp} {viewerState} {analysis} />
	{:else}
		{#if contextLost}
			<div class="ffs-fallback-banner" role="status">
				WebGL context paused by browser; restoring automatically…
			</div>
		{/if}

		<div
			class="ffs-dual-stages"
			class:ffs-superimposed-layout={isSuperimposed}
			data-testid="ffs-webgl-stages"
		>
			<!-- Primary Stage: Domain R^n OR Superimposed Space -->
			<div class="ffs-stage-card" data-testid="ffs-domain-stage">
				<div class="ffs-stage-bar">
					<span class="ffs-stage-badge">
						{#if isSuperimposed}
							Superimposed Space {formatEuclideanSpace(analysis.n)} (Domain + Codomain)
						{:else}
							Input Space {formatEuclideanSpace(analysis.n)}
						{/if}
					</span>
					<div class="ffs-stage-subbadges">
						<span class="ffs-chip ffs-chip-row">
							Row C(Aᵀ) · {analysis.subspaces.row.dimension}D
						</span>
						<span class="ffs-chip ffs-chip-null">
							Null N(A) · {analysis.subspaces.null.dimension}D
						</span>
						{#if isSuperimposed}
							<span class="ffs-chip ffs-chip-col">
								Col C(A) · {analysis.subspaces.col.dimension}D
							</span>
							<span class="ffs-chip ffs-chip-left-null">
								Left N(Aᵀ) · {analysis.subspaces.leftNull.dimension}D
							</span>
						{/if}
					</div>
				</div>

				<div class="ffs-canvas-wrap">
					<canvas
						bind:this={primaryCanvas}
						class="ffs-canvas"
						data-testid="ffs-domain-canvas"
						tabindex="0"
						aria-label={isSuperimposed
							? `Superimposed 3D viewport of ${analysis.m} by ${analysis.n} linear transformation. Drag to rotate, scroll to zoom.`
							: `Domain input space ${formatEuclideanSpace(analysis.n)} 3D viewport showing Row Space C(Aᵀ) and Nullspace N(A). Drag to rotate, scroll to zoom.`}
					></canvas>

					{#if viewerState.layers.showLabels && domainLabels.length > 0}
						<div class="ffs-label-layer" aria-hidden="true">
							<svg class="ffs-label-svg">
								{#each domainLabels as item (item.id)}
									<line
										x1={item.anchorX}
										y1={item.anchorY}
										x2={item.labelX}
										y2={item.labelY}
										stroke={item.color}
										stroke-opacity="0.6"
										stroke-width="1"
									/>
									<circle cx={item.anchorX} cy={item.anchorY} r="2.4" fill={item.color} />
								{/each}
							</svg>
							{#each domainLabels as item (item.id)}
								<span
									class="ffs-label-pill"
									style={`left:${item.labelX}px;top:${item.labelY}px;color:${item.color};`}
								>
									{item.text}
								</span>
							{/each}
						</div>
					{/if}

					<!-- Interactive 3D Orientation Compass -->
					<div
						class="ffs-compass"
						title="Click an axis badge to align camera along that coordinate axis"
					>
						<svg width="68" height="68" viewBox="0 0 68 68" aria-label="3D orientation compass">
							<circle
								cx="34"
								cy="34"
								r="30"
								fill="none"
								stroke="rgba(148, 163, 184, 0.28)"
								stroke-width="1"
							/>
							{#each compassNodes as node (node.key)}
								<line
									x1="34"
									y1="34"
									x2={node.x}
									y2={node.y}
									stroke={node.color}
									stroke-width={node.z >= 0 ? 1.8 : 1.1}
									stroke-opacity={node.z >= 0 ? 0.92 : 0.45}
								/>
								<g
									role="button"
									tabindex="0"
									style="cursor: pointer;"
									aria-label={`Align camera to ${node.title}`}
									onclick={() => {
										primaryHandle?.setAxisView(node.axis);
										if (viewerState.linkCameras && !isSuperimposed) {
											secondaryHandle?.setAxisView(node.axis);
										}
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											primaryHandle?.setAxisView(node.axis);
											if (viewerState.linkCameras && !isSuperimposed) {
												secondaryHandle?.setAxisView(node.axis);
											}
										}
									}}
								>
									<circle
										cx={node.x}
										cy={node.y}
										r={node.z >= 0 ? 9 : 7}
										fill={node.color}
										fill-opacity={node.z >= 0 ? 0.94 : 0.55}
									/>
									<text
										x={node.x}
										y={node.y + 0.5}
										text-anchor="middle"
										dominant-baseline="central"
										font-size="8.5"
										font-weight="700"
										fill="#0c1016"
									>
										{node.key}
									</text>
								</g>
							{/each}
						</svg>
					</div>

					<div class="ffs-stage-hint">
						{analysis.subspaces.row.geometryLabel} ⊥ {analysis.subspaces.null.geometryLabel}
					</div>
				</div>
			</div>

			<!-- Center Action Bridge (Dual mode only) -->
			{#if !isSuperimposed}
				<div class="ffs-action-bridge" aria-label="Matrix action bridge">
					<div class="ffs-bridge-title">
						A : {formatEuclideanSpace(analysis.n)} → {formatEuclideanSpace(analysis.m)}
					</div>
					<div class="ffs-bridge-box">
						<div class="ffs-mono" style="color: var(--ffs-row); font-weight: 700;">
							C(Aᵀ) ≅ C(A)
						</div>
						<div style="color: var(--ffs-ink-muted); font-size: 0.69rem; margin-top: 0.12rem;">
							{analysis.rank === 0 ? 'Rank 0 (trivial)' : `${analysis.rank}D active bijection`}
						</div>
						<div class="ffs-bridge-sigmas">
							{#each analysis.svd.singularValues as s, i (i)}
								<div class="ffs-bridge-sigma-row">
									<span>σ{formatSubscriptIndex(i + 1)}</span>
									<strong
										style={i < analysis.rank
											? 'color: var(--ffs-col);'
											: 'color: var(--ffs-ink-soft);'}
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
						<div style="color: var(--ffs-ink-muted); font-size: 0.69rem; margin-top: 0.12rem;">
							{analysis.subspaces.null.dimension === 0
								? 'No directions lost'
								: `${analysis.subspaces.null.dimension}D crushed to 0`}
						</div>
					</div>

					<div class="ffs-bridge-box">
						<div class="ffs-mono" style="color: var(--ffs-left-null); font-weight: 700;">
							N(Aᵀ) ⊥ C(A)
						</div>
						<div style="color: var(--ffs-ink-muted); font-size: 0.69rem; margin-top: 0.12rem;">
							{analysis.subspaces.leftNull.dimension === 0
								? 'Every b reachable'
								: `${analysis.subspaces.leftNull.dimension}D unreachable`}
						</div>
					</div>
				</div>
			{/if}

			<!-- Secondary Stage: Codomain R^m -->
			<div
				class="ffs-stage-card"
				class:ffs-stage-hidden={isSuperimposed}
				data-testid="ffs-codomain-stage"
			>
				<div class="ffs-stage-bar">
					<span class="ffs-stage-badge">Output Space {formatEuclideanSpace(analysis.m)}</span>
					<div class="ffs-stage-subbadges">
						<span class="ffs-chip ffs-chip-col">
							Col C(A) · {analysis.subspaces.col.dimension}D
						</span>
						<span class="ffs-chip ffs-chip-left-null">
							Left N(Aᵀ) · {analysis.subspaces.leftNull.dimension}D
						</span>
					</div>
				</div>

				<div class="ffs-canvas-wrap">
					<canvas
						bind:this={secondaryCanvas}
						class="ffs-canvas"
						data-testid="ffs-codomain-canvas"
						tabindex="0"
						aria-label={`Codomain output space ${formatEuclideanSpace(analysis.m)} 3D viewport showing Column Space C(A), Left Nullspace N(Aᵀ), Ax, and least-squares projection b = p + e. Drag to rotate, scroll to zoom.`}
					></canvas>

					{#if viewerState.layers.showLabels && codomainLabels.length > 0}
						<div class="ffs-label-layer" aria-hidden="true">
							<svg class="ffs-label-svg">
								{#each codomainLabels as item (item.id)}
									<line
										x1={item.anchorX}
										y1={item.anchorY}
										x2={item.labelX}
										y2={item.labelY}
										stroke={item.color}
										stroke-opacity="0.6"
										stroke-width="1"
									/>
									<circle cx={item.anchorX} cy={item.anchorY} r="2.4" fill={item.color} />
								{/each}
							</svg>
							{#each codomainLabels as item (item.id)}
								<span
									class="ffs-label-pill"
									style={`left:${item.labelX}px;top:${item.labelY}px;color:${item.color};`}
								>
									{item.text}
								</span>
							{/each}
						</div>
					{/if}

					<div class="ffs-stage-hint">
						{analysis.subspaces.col.geometryLabel} ⊥ {analysis.subspaces.leftNull.geometryLabel}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Transformation Morph Dock (visible in Superimposed View for both WebGL and SVG fallback) -->
	{#if isSuperimposed}
		<div class="ffs-morph-dock" data-testid="ffs-morph-dock">
			<div class="ffs-morph-row">
				<button type="button" class="ffs-btn ffs-btn-xs" onclick={toggleMorphPlay}>
					{morphPlaying ? 'Pause Morph' : 'Play Morph'}
				</button>
				<button
					type="button"
					class="ffs-btn ffs-btn-xs"
					aria-pressed={viewerState.morphMode === 'linear'}
					onclick={() => onSetMorphMode('linear')}
				>
					Linear (1−t)I + tA
				</button>
				<button
					type="button"
					class="ffs-btn ffs-btn-xs"
					aria-pressed={viewerState.morphMode === 'svd-stages'}
					onclick={() => onSetMorphMode('svd-stages')}
				>
					3-Stage SVD (Vᵀ → ΣVᵀ → UΣVᵀ)
				</button>
				<span
					class="ffs-mono"
					style="margin-left: auto; font-size: 0.76rem; color: var(--ffs-ink-muted);"
				>
					{morphInfo.stageLabel}
				</span>
			</div>
			<div class="ffs-morph-row">
				<label
					for="ffs-morph-slider"
					class="ffs-mono"
					style="font-size: 0.78rem; font-weight: 700;"
				>
					t = {viewerState.morphT.toFixed(2)}
				</label>
				<input
					id="ffs-morph-slider"
					type="range"
					class="ffs-range"
					style="flex: 1 1 12rem;"
					min="0"
					max="1"
					step="0.01"
					value={viewerState.morphT}
					oninput={(e) => {
						stopMorphPlayback();
						onSetMorphT(Number((e.currentTarget as HTMLInputElement).value), false);
					}}
					onchange={(e) => {
						stopMorphPlayback();
						onSetMorphT(Number((e.currentTarget as HTMLInputElement).value), true);
					}}
				/>
				{#each [{ label: 'I (0)', val: 0 }, { label: 'Vᵀ (0.33)', val: 1 / 3 }, { label: 'ΣVᵀ (0.67)', val: 2 / 3 }, { label: 'A (1.0)', val: 1 }] as stop (stop.label)}
					<button
						type="button"
						class="ffs-btn ffs-btn-xs"
						onclick={() => {
							stopMorphPlayback();
							onSetMorphT(stop.val, true);
						}}
					>
						{stop.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
