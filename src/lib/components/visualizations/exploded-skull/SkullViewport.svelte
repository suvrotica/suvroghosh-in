<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { supportsWebGL } from '$lib/visualizations/webgl';
	import {
		BACKGROUND_THEMES,
		BONE_BY_ID,
		EXPLOSION_PRESETS,
		SKULL_BONES,
		type BoneId,
		type CameraPresetId,
		type ExplosionPresetId,
		type ProjectedBoneLabel,
		type SkullViewerState,
		type Vec3
	} from '$lib/visualizations/exploded-skull';
	import type {
		SkullHoverEvent,
		SkullOrientationSnapshot,
		SkullRendererHandle
	} from '$lib/visualizations/exploded-skull/renderer';

	interface Props {
		viewerState: SkullViewerState;
		isFullscreen?: boolean;
		onSelectBone: (boneId: BoneId | null, additive: boolean) => void;
		onDoubleClickBone: (boneId: BoneId) => void;
		onExitIsolation: () => void;
		onSetGlobalExplosion: (val01: number) => void;
		onSelectPreset: (presetId: ExplosionPresetId) => void;
		onToggleCompare: () => void;
		onSetCameraPreset: (camId: CameraPresetId) => void;
		onToggleLabels: () => void;
		onTogglePanels?: () => void;
		onOpenMobileCatalog?: () => void;
		onStatusAnnouncement?: (text: string) => void;
	}

	let {
		viewerState,
		isFullscreen = false,
		onSelectBone,
		onDoubleClickBone,
		onExitIsolation,
		onSetGlobalExplosion,
		onSelectPreset,
		onToggleCompare,
		onSetCameraPreset,
		onToggleLabels,
		onTogglePanels,
		onOpenMobileCatalog,
		onStatusAnnouncement
	}: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let rendererHandle = $state<SkullRendererHandle | null>(null);
	let webglSupported = $state(true);
	let loadingProgress = $state(0);
	let isLoaded = $state(false);
	let loadError = $state('');
	let contextLost = $state(false);
	let labels = $state<ProjectedBoneLabel[]>([]);
	let hoverInfo = $state<SkullHoverEvent>({ boneId: null, clientX: 0, clientY: 0 });
	let orientation = $state<SkullOrientationSnapshot>({
		right: [1, 0, 0],
		up: [0, 1, 0],
		forward: [0, 0, 1]
	});

	const bgTheme = $derived(
		BACKGROUND_THEMES.find((b) => b.id === viewerState.appearance.backgroundTheme) ??
			BACKGROUND_THEMES[0]
	);
	const explosionPct = $derived(Math.round(viewerState.globalExplosion * 100));
	const hoverBone = $derived(hoverInfo.boneId ? BONE_BY_ID[hoverInfo.boneId] : null);

	onMount(async () => {
		if (!supportsWebGL()) {
			webglSupported = false;
			return;
		}
		if (!canvasEl) return;

		try {
			const { createSkullRenderer } = await import('$lib/visualizations/exploded-skull/renderer');
			if (!canvasEl) return;

			rendererHandle = await createSkullRenderer(
				canvasEl,
				viewerState,
				{
					onLoadProgress: (r) => {
						loadingProgress = Math.round(r * 100);
					},
					onLoaded: ({ meshCount, triangleCount }) => {
						isLoaded = true;
						loadingProgress = 100;
						onStatusAnnouncement?.(
							`Loaded 3D anatomical human skull (${meshCount} meshes, ${triangleCount.toLocaleString()} triangles).`
						);
					},
					onLoadError: (msg) => {
						loadError = msg;
					},
					onSelectBone: (boneId, additive) => {
						onSelectBone(boneId, additive);
					},
					onDoubleClickBone: (boneId) => {
						onDoubleClickBone(boneId);
					},
					onHoverBone: (ev) => {
						hoverInfo = ev;
					},
					onLabelsUpdate: (nextLabels) => {
						labels = nextLabels;
					},
					onOrientationUpdate: (snap) => {
						orientation = snap;
					},
					onContextLossChange: (lost) => {
						contextLost = lost;
					}
				},
				asset('/data/exploded-human-skull/human-skull-bp3d.glb')
			);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Unable to initialize 3D WebGL exhibit.';
		}
	});

	$effect(() => {
		// Read viewerState unconditionally before branching so Svelte 5 always tracks state updates.
		const nextState = viewerState;
		rendererHandle?.updateState(nextState);
	});

	onDestroy(() => {
		rendererHandle?.dispose();
		rendererHandle = null;
	});

	export function setCameraPresetView(presetId: CameraPresetId): void {
		rendererHandle?.setCameraPreset(presetId, false);
	}

	export function zoomStep(factor: number): void {
		rendererHandle?.zoomStep(factor);
	}

	export function fitModel(): void {
		rendererHandle?.fitModel(false);
	}

	export function focusBone(boneId: BoneId): void {
		rendererHandle?.focusBone(boneId, false);
	}

	export function getCameraSnapshot(): { position: Vec3; target: Vec3 } | undefined {
		return rendererHandle?.getCameraSnapshot();
	}

	export function setCameraSnapshot(snapshot: { position: Vec3; target: Vec3 }): void {
		rendererHandle?.setCameraSnapshot(snapshot, false);
	}

	export async function exportPng(includeLabels: boolean): Promise<Blob | null> {
		if (!rendererHandle) return null;
		return rendererHandle.exportPng({ includeLabels, labels });
	}

	// Build depth-sorted cardinal handles for the S/I/A/P/L/R interactive compass
	const compassNodes = $derived.by(() => {
		const scale = 23;
		const cx = 38;
		const cy = 38;
		const items = [
			{
				key: 'L',
				title: 'Anatomical Left (+X)',
				axis: [1, 0, 0] as Vec3,
				v: orientation.right,
				color: '#d97b6c'
			},
			{
				key: 'R',
				title: 'Anatomical Right (-X)',
				axis: [-1, 0, 0] as Vec3,
				v: [-orientation.right[0], -orientation.right[1], -orientation.right[2]] as Vec3,
				color: '#8f6962'
			},
			{
				key: 'S',
				title: 'Superior / Cranial (+Y)',
				axis: [0, 1, 0] as Vec3,
				v: orientation.up,
				color: '#8cc084'
			},
			{
				key: 'I',
				title: 'Inferior / Basal (-Y)',
				axis: [0, -1, 0] as Vec3,
				v: [-orientation.up[0], -orientation.up[1], -orientation.up[2]] as Vec3,
				color: '#64855f'
			},
			{
				key: 'A',
				title: 'Anterior / Facial (+Z)',
				axis: [0, 0, 1] as Vec3,
				v: orientation.forward,
				color: '#73a9e8'
			},
			{
				key: 'P',
				title: 'Posterior / Occipital (-Z)',
				axis: [0, 0, -1] as Vec3,
				v: [-orientation.forward[0], -orientation.forward[1], -orientation.forward[2]] as Vec3,
				color: '#5a789c'
			}
		];
		return items
			.map((it) => ({
				...it,
				x: cx + it.v[0] * scale,
				y: cy - it.v[1] * scale,
				z: it.v[2]
			}))
			.sort((a, b) => a.z - b.z);
	});
</script>

<div
	class="esm-stage-wrap"
	data-light-stage={bgTheme.isLight ? 'true' : 'false'}
	style={`--esm-stage-bg:${bgTheme.hex};--esm-stage-radial:${bgTheme.radialCenter};`}
>
	{#if !webglSupported}
		<div class="flex h-full min-h-[460px] flex-col items-center justify-center p-6 text-center">
			<img
				src={asset('/images/visualizations/exploded-human-skull/poster.png')}
				alt="Exploded Human Skull specimen anatomical plate"
				class="max-h-72 rounded-lg border border-[var(--esm-border)] object-contain shadow-xl"
			/>
			<div class="mt-4 max-w-md space-y-2">
				<h2 class="font-serif text-lg font-semibold text-[var(--esm-ink)]">
					Interactive 2D Osteology Plate Fallback
				</h2>
				<p class="text-xs leading-relaxed text-[var(--esm-ink-muted)]">
					WebGL is disabled or unavailable in this browser context. You can still inspect every
					cranial, facial, and associated hyoid bone in the catalog panels alongside this specimen.
				</p>
				<div class="flex flex-wrap justify-center gap-1.5 pt-2">
					{#each SKULL_BONES.filter((b) => b.isMajorLandmark) as landmark (landmark.id)}
						<button
							type="button"
							class="esm-btn esm-btn-xs"
							aria-pressed={viewerState.selectedBoneIds.includes(landmark.id)}
							onclick={() => onSelectBone(landmark.id, false)}
						>
							{landmark.shortName}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<canvas
			bind:this={canvasEl}
			class="esm-canvas"
			aria-label="Interactive 3D Exploded Human Skull specimen. Drag to orbit, scroll to zoom, right-drag to pan, click a bone to inspect, double-click to isolate."
			tabindex="0"
		></canvas>

		{#if !isLoaded && !loadError}
			<div class="esm-loading-veil" role="status" aria-live="polite">
				<div class="font-serif text-lg text-[#f4efe4]">Mounting Osteology Specimen...</div>
				<div class="esm-progress-track">
					<div class="esm-progress-fill" style={`width:${Math.max(12, loadingProgress)}%`}></div>
				</div>
				<div class="text-xs text-[var(--esm-ink-muted)]">
					Preparing 22 skull bones, cranial sutures, and alveolar dentition ({loadingProgress}%)
				</div>
			</div>
		{/if}

		{#if loadError}
			<div class="esm-loading-veil" role="alert">
				<div class="font-serif text-base text-[var(--esm-danger)]">Unable to Render Specimen</div>
				<p class="max-w-sm text-xs text-[var(--esm-ink-muted)]">{loadError}</p>
			</div>
		{/if}

		{#if contextLost}
			<div class="esm-loading-veil" role="status">
				<div class="font-serif text-base text-[var(--esm-accent-strong)]">
					Restoring 3D Graphics Context...
				</div>
				<p class="max-w-sm text-xs text-[var(--esm-ink-muted)]">
					Your browser paused WebGL rendering. The specimen will resume automatically once restored.
				</p>
			</div>
		{/if}

		{#if viewerState.display.showLabels && labels.length > 0}
			<div class="esm-label-layer" aria-label="Projected anatomical bone labels">
				<svg class="esm-label-svg" aria-hidden="true">
					{#each labels as item (item.boneId)}
						<line
							x1={item.anchorX}
							y1={item.anchorY}
							x2={item.labelX}
							y2={item.labelY}
							stroke={item.selected
								? 'rgba(230, 171, 85, 0.92)'
								: bgTheme.isLight
									? 'rgba(42, 34, 24, 0.45)'
									: 'rgba(233, 226, 210, 0.45)'}
							stroke-width={item.selected ? 1.5 : 1}
						/>
						<circle
							cx={item.anchorX}
							cy={item.anchorY}
							r={item.selected ? 3 : 2.2}
							fill={item.selected ? '#e6ab55' : bgTheme.isLight ? '#2a2218' : '#e9e2d2'}
						/>
					{/each}
				</svg>
				{#each labels as item (item.boneId)}
					<button
						type="button"
						class="esm-label-chip"
						data-selected={item.selected}
						style={`left:${item.labelX}px;top:${item.labelY}px;`}
						onclick={(e) => onSelectBone(item.boneId, e.shiftKey || e.ctrlKey || e.metaKey)}
					>
						{item.label}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Top Floating Camera & Isolation HUD -->
		<div class="esm-floating-top">
			<div class="esm-hud-pill-row" role="toolbar" aria-label="Quick camera viewpoints">
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-pressed={viewerState.cameraPreset === 'three-quarter'}
					onclick={() => onSetCameraPreset('three-quarter')}
				>
					3/4
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-pressed={viewerState.cameraPreset === 'anterior'}
					onclick={() => onSetCameraPreset('anterior')}
				>
					Anterior
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-pressed={viewerState.cameraPreset === 'left-lateral'}
					onclick={() => onSetCameraPreset('left-lateral')}
				>
					Lateral
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-pressed={viewerState.cameraPreset === 'superior'}
					onclick={() => onSetCameraPreset('superior')}
				>
					Superior
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-pressed={viewerState.cameraPreset === 'basal'}
					onclick={() => onSetCameraPreset('basal')}
				>
					Basal
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					title="Fit skull to frame (F)"
					onclick={fitModel}
				>
					Fit
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-label="Zoom in"
					onclick={() => zoomStep(0.8)}
				>
					+
				</button>
				<button
					type="button"
					class="esm-btn esm-btn-xs"
					aria-label="Zoom out"
					onclick={() => zoomStep(1.25)}
				>
					−
				</button>
			</div>

			<div class="flex flex-col items-end gap-1.5">
				<div class="esm-hud-pill-row">
					{#if onOpenMobileCatalog}
						<button
							type="button"
							class="esm-btn esm-btn-xs esm-drawer-only"
							onclick={onOpenMobileCatalog}
						>
							Bones (22)
						</button>
					{/if}
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.showLabels}
						onclick={onToggleLabels}
					>
						Labels
					</button>
					{#if isFullscreen && onTogglePanels}
						<button type="button" class="esm-btn esm-btn-xs" onclick={onTogglePanels}>
							Controls
						</button>
					{/if}
				</div>

				{#if viewerState.isolatedBoneIds.length > 0}
					<div class="esm-hud-pill-row border-[var(--esm-border-strong)]">
						<span class="text-[11px] font-medium text-[var(--esm-accent-strong)]">
							Isolated: {viewerState.isolatedBoneIds
								.slice(0, 2)
								.map((id) => BONE_BY_ID[id].shortName)
								.join(', ')}{viewerState.isolatedBoneIds.length > 2
								? ` +${viewerState.isolatedBoneIds.length - 2}`
								: ''}
						</span>
						<button type="button" class="esm-btn esm-btn-xs" onclick={onExitIsolation}>
							Show All (Esc)
						</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Anatomical Orientation Indicator (S / I / A / P / L / R) -->
		{#if viewerState.display.showAxisIndicator}
			<div
				class="esm-compass"
				title="Anatomical axis compass: L/R follow patient anatomical left (+X) and right (−X)"
			>
				<svg
					width="76"
					height="76"
					viewBox="0 0 76 76"
					aria-label="Anatomical S I A P L R orientation compass"
				>
					<circle
						cx="38"
						cy="38"
						r="34"
						fill="none"
						stroke={bgTheme.isLight ? 'rgba(30,26,22,0.16)' : 'rgba(233,226,210,0.16)'}
						stroke-width="1"
					/>
					{#each compassNodes as node (node.key)}
						<line
							x1="38"
							y1="38"
							x2={node.x}
							y2={node.y}
							stroke={node.color}
							stroke-width={node.z > 0 ? 1.8 : 1.0}
							stroke-opacity={node.z > 0 ? 0.92 : 0.36}
						/>
						<g
							class="cursor-pointer"
							role="button"
							tabindex="0"
							aria-label={`Snap camera to ${node.title}`}
							onclick={() => rendererHandle?.setOrientationView(node.axis)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									rendererHandle?.setOrientationView(node.axis);
								}
							}}
						>
							<circle
								cx={node.x}
								cy={node.y}
								r={node.z >= 0 ? 8.5 : 6.5}
								fill={node.color}
								fill-opacity={node.z >= 0 ? 0.94 : 0.5}
							/>
							<text
								x={node.x}
								y={node.y + 0.5}
								text-anchor="middle"
								dominant-baseline="central"
								font-size="8.5"
								font-weight="700"
								fill="#0f1116"
							>
								{node.key}
							</text>
						</g>
					{/each}
				</svg>
				<span class="mt-0.5 text-[9px] tracking-wide text-[var(--esm-stage-hud-muted)]">
					Patient L (+X) / R (−X)
				</span>
			</div>
		{/if}

		<!-- Bottom Translucent Museum Explosion Dock -->
		<div class="esm-floating-bottom">
			<div class="esm-explosion-dock">
				<div class="esm-dock-row">
					<div class="flex min-w-[140px] items-center gap-2">
						<label for="esm-stage-explosion" class="text-xs font-medium">Explode</label>
						<span class="esm-num-readout">
							{viewerState.compareAssembled ? 'Assembled (Compare)' : `${explosionPct}%`}
						</span>
					</div>
					<div class="flex min-w-[150px] flex-1 items-center gap-2">
						<input
							id="esm-stage-explosion"
							type="range"
							class="esm-range"
							min="0"
							max="100"
							step="1"
							aria-label="Master skull explosion amount"
							value={explosionPct}
							oninput={(e) =>
								onSetGlobalExplosion(Number((e.currentTarget as HTMLInputElement).value) / 100)}
						/>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							class="esm-btn esm-btn-xs"
							aria-pressed={viewerState.compareAssembled}
							title="Toggle assembled comparison (Space)"
							onclick={onToggleCompare}
						>
							{viewerState.compareAssembled ? 'Exploded' : 'Compare'}
						</button>
						<label for="esm-quick-preset" class="sr-only">Quick explosion preset</label>
						<select
							id="esm-quick-preset"
							class="esm-select w-auto py-1 text-[11px]"
							value={viewerState.presetId}
							onchange={(e) =>
								onSelectPreset((e.currentTarget as HTMLSelectElement).value as ExplosionPresetId)}
						>
							{#each EXPLOSION_PRESETS as preset (preset.id)}
								<option value={preset.id}>{preset.name}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="esm-detent-row" aria-label="Quick explosion steps">
					{#each [0, 10, 25, 50, 75, 100] as pct (pct)}
						<button
							type="button"
							class="esm-btn esm-btn-xs"
							aria-pressed={!viewerState.compareAssembled && explosionPct === pct}
							onclick={() => onSetGlobalExplosion(pct / 100)}
						>
							{pct}%
						</button>
					{/each}
					<span class="ml-auto hidden text-[10px] text-[var(--esm-stage-hud-muted)] sm:inline">
						Drag orbit · Right-drag pan · Scroll zoom · Click inspect · Dbl-click isolate
					</span>
				</div>
			</div>
		</div>

		{#if hoverBone}
			<div
				class="esm-hover-tooltip"
				style={`left:min(${hoverInfo.clientX}px, calc(100vw - 230px));top:min(${hoverInfo.clientY}px, calc(100vh - 64px));`}
				role="tooltip"
			>
				<strong>{hoverBone.name}</strong>
				<span class="esm-hover-sub">{hoverBone.latinName} · Click to inspect</span>
			</div>
		{/if}
	{/if}
</div>
