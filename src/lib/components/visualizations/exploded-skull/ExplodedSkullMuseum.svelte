<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import './exploded-skull-museum.css';
	import {
		BONE_BY_ID,
		MATERIAL_PRESETS,
		SKULL_BONE_IDS,
		applyExplosionPreset,
		bonesByCategory,
		cloneSkullState,
		createDefaultBoneOverride,
		createDefaultRotation,
		createDefaultState,
		decodeStateFromSearch,
		encodeStateToQuery,
		exportConfigJson,
		parseImportedConfigJson,
		readSavedConfigurations,
		writeSavedConfigurations,
		type BackgroundThemeId,
		type BoneCategory,
		type BoneId,
		type CameraPresetId,
		type ExplosionDirectionMode,
		type ExplosionPresetId,
		type MaterialPresetId,
		type SavedSkullConfiguration,
		type SkullViewerState
	} from '$lib/visualizations/exploded-skull';
	import AnatomicalInfoPanel from './AnatomicalInfoPanel.svelte';
	import BoneHierarchyPanel from './BoneHierarchyPanel.svelte';
	import ControlDock from './ControlDock.svelte';
	import SkullViewport from './SkullViewport.svelte';

	let shellEl = $state<HTMLElement | null>(null);
	let viewportComp = $state<SkullViewport | null>(null);

	let viewerState = $state<SkullViewerState>(createDefaultState());
	let savedConfigs = $state<SavedSkullConfiguration[]>([]);
	let mobileCatalogOpen = $state(false);
	let isFullscreen = $state(false);
	let fullscreenFallback = $state(false);
	let hidePanels = $state(false);
	let activeTab = $state<'explode' | 'bone' | 'view' | 'look' | 'studies'>('explode');
	let announcement = $state('');
	let shareFeedback = $state('');
	let exportFeedback = $state('');
	let importFeedback = $state('');

	const explosionPct = $derived(
		viewerState.compareAssembled ? 0 : Math.round(viewerState.globalExplosion * 100)
	);
	const effectiveFullscreen = $derived(isFullscreen || fullscreenFallback);
	const showLeftPanel = $derived(!hidePanels && viewerState.display.showBoneList);
	const showRightPanel = $derived(!hidePanels && viewerState.display.showInfoPanel);

	let urlSyncTimer: number | null = null;

	function announce(text: string): void {
		announcement = text;
	}

	function scheduleUrlSync(next: SkullViewerState): void {
		if (typeof window === 'undefined') return;
		if (urlSyncTimer !== null) window.clearTimeout(urlSyncTimer);
		urlSyncTimer = window.setTimeout(() => {
			urlSyncTimer = null;
			const query = encodeStateToQuery(next);
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

	function commitState(updater: (draft: SkullViewerState) => void, announceText?: string): void {
		const next = cloneSkullState(viewerState);
		updater(next);
		viewerState = next;
		scheduleUrlSync(next);
		if (announceText) announce(announceText);
	}

	function handleFullscreenChange(): void {
		isFullscreen = typeof document !== 'undefined' && document.fullscreenElement === shellEl;
		if (isFullscreen) {
			fullscreenFallback = false;
		}
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
				// Graceful fallback when fullscreen API is blocked (e.g. iframe or headless)
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

		if (e.key === 'Escape') {
			if (fullscreenFallback) {
				fullscreenFallback = false;
				return;
			}
			if (!isFullscreen && viewerState.isolatedBoneIds.length > 0) {
				handleExitIsolation();
				return;
			}
			if (!isFullscreen && viewerState.selectedBoneIds.length > 0) {
				handleClearSelection();
			}
			return;
		}

		if (e.key === ' ') {
			e.preventDefault();
			handleToggleCompare();
		} else if (e.key === 'l' || e.key === 'L') {
			handleToggleDisplayFlag('showLabels');
		} else if (e.key === 'h' || e.key === 'H') {
			hidePanels = !hidePanels;
			announce(hidePanels ? 'Theater mode: panels collapsed.' : 'Museum panels expanded.');
		} else if (e.key === 'f' || e.key === 'F') {
			if (viewerState.selectedBoneIds.length > 0) {
				viewportComp?.focusBone(
					viewerState.selectedBoneIds[viewerState.selectedBoneIds.length - 1]
				);
			} else {
				viewportComp?.fitModel();
			}
		} else if (e.key === 'r' || e.key === 'R') {
			handleResetView();
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			if (window.location.search) {
				viewerState = decodeStateFromSearch(window.location.search, window.location.hash);
			}
			savedConfigs = readSavedConfigurations(window.localStorage);
			document.addEventListener('fullscreenchange', handleFullscreenChange);
		}
		shellEl?.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		shellEl?.removeEventListener('keydown', handleKeyDown);
		if (urlSyncTimer !== null && typeof window !== 'undefined') {
			window.clearTimeout(urlSyncTimer);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		}
	});

	// Selection & Isolation Handlers
	function handleSelectBone(boneId: BoneId | null, additive: boolean): void {
		if (!boneId) {
			if (!additive && viewerState.selectedBoneIds.length > 0) {
				commitState((s) => {
					s.selectedBoneIds = [];
				}, 'Cleared bone selection.');
			}
			return;
		}

		commitState((s) => {
			if (additive) {
				if (s.selectedBoneIds.includes(boneId)) {
					s.selectedBoneIds = s.selectedBoneIds.filter((id) => id !== boneId);
				} else {
					s.selectedBoneIds = [...s.selectedBoneIds, boneId];
				}
			} else {
				s.selectedBoneIds = [boneId];
			}
		}, `Selected ${BONE_BY_ID[boneId].name}.`);
	}

	function handleDoubleClickBone(boneId: BoneId): void {
		const alreadyOnlyIsolated =
			viewerState.isolatedBoneIds.length === 1 && viewerState.isolatedBoneIds[0] === boneId;
		if (alreadyOnlyIsolated) {
			commitState((s) => {
				s.isolatedBoneIds = [];
			}, 'Exited isolation mode.');
			viewportComp?.fitModel();
			return;
		}
		commitState((s) => {
			s.selectedBoneIds = [boneId];
			s.isolatedBoneIds = [boneId];
			s.boneOverrides[boneId].visible = true;
			if (boneId === 'hyoid') s.appearance.showHyoid = true;
		}, `Isolated ${BONE_BY_ID[boneId].name}.`);
		viewportComp?.focusBone(boneId);
	}

	function handleToggleIsolateBone(boneId: BoneId): void {
		commitState((s) => {
			if (s.isolatedBoneIds.includes(boneId)) {
				s.isolatedBoneIds = s.isolatedBoneIds.filter((id) => id !== boneId);
			} else {
				s.isolatedBoneIds = [boneId];
				s.selectedBoneIds = [boneId];
				s.boneOverrides[boneId].visible = true;
				if (boneId === 'hyoid') s.appearance.showHyoid = true;
			}
		}, `Updated isolation for ${BONE_BY_ID[boneId].shortName}.`);
	}

	function handleExitIsolation(): void {
		commitState((s) => {
			s.isolatedBoneIds = [];
		}, 'Restored all bones from isolation.');
		viewportComp?.fitModel();
	}

	function handleToggleBoneVisible(boneId: BoneId): void {
		commitState((s) => {
			if (boneId === 'hyoid' && !s.appearance.showHyoid) {
				s.appearance.showHyoid = true;
				s.boneOverrides.hyoid.visible = true;
				return;
			}
			s.boneOverrides[boneId].visible = !s.boneOverrides[boneId].visible;
		});
	}

	function handleToggleCategoryVisible(category: BoneCategory, makeVisible: boolean): void {
		const groupBones = bonesByCategory(category);
		commitState((s) => {
			if (category === 'associated') {
				s.appearance.showHyoid = makeVisible;
			}
			for (const b of groupBones) {
				s.boneOverrides[b.id].visible = makeVisible;
			}
		});
	}

	function handleIsolateCategory(category: BoneCategory): void {
		const groupBones = bonesByCategory(category);
		commitState((s) => {
			s.isolatedBoneIds = groupBones.map((b) => b.id);
			s.selectedBoneIds = [groupBones[0].id];
			if (category === 'associated') s.appearance.showHyoid = true;
			for (const b of groupBones) {
				s.boneOverrides[b.id].visible = true;
			}
		});
		viewportComp?.fitModel();
	}

	function handleShowAllVisible(): void {
		commitState((s) => {
			s.globalVisible = true;
			s.isolatedBoneIds = [];
			for (const id of SKULL_BONE_IDS) {
				s.boneOverrides[id].visible = true;
			}
		}, 'All 22 skull bones visible.');
	}

	function handleClearSelection(): void {
		commitState((s) => {
			s.selectedBoneIds = [];
		});
	}

	// Explosion Handlers
	function handleSetGlobalExplosion(val01: number): void {
		commitState((s) => {
			s.globalExplosion = Math.max(0, Math.min(1, val01));
			s.compareAssembled = false;
		});
	}

	function handleSelectPreset(presetId: ExplosionPresetId): void {
		const next = applyExplosionPreset(viewerState, presetId);
		viewerState = next;
		scheduleUrlSync(next);
		if (presetId !== 'custom') {
			const camPreset =
				presetId === 'cranial-base'
					? 'basal'
					: presetId === 'cranial-vault'
						? 'three-quarter'
						: next.cameraPreset;
			viewportComp?.setCameraPresetView(camPreset);
		}
		announce(`Applied preset ${presetId}.`);
	}

	function handleSetDirectionMode(mode: ExplosionDirectionMode): void {
		commitState((s) => {
			s.directionMode = mode;
			if (s.globalExplosion < 0.05) s.globalExplosion = 0.65;
			s.compareAssembled = false;
		});
	}

	function handleSetAnimationSpeed(speed: number): void {
		commitState((s) => {
			s.animationSpeed = speed;
		});
	}

	function handleToggleCompare(): void {
		commitState(
			(s) => {
				s.compareAssembled = !s.compareAssembled;
			},
			viewerState.compareAssembled ? 'Returned to exploded view.' : 'Comparing assembled skull.'
		);
	}

	function handleToggleGlobalVisible(): void {
		commitState((s) => {
			s.globalVisible = !s.globalVisible;
		});
	}

	function handleReassemble(): void {
		handleSelectPreset('assembled');
	}

	// Per-Bone Offset/Opacity Handlers
	function handleUpdateBoneDistance(boneId: BoneId, dist: number): void {
		commitState((s) => {
			s.boneOverrides[boneId].explosionDistance = dist;
		});
	}

	function handleUpdateBoneOffset(boneId: BoneId, axisIdx: 0 | 1 | 2, val: number): void {
		commitState((s) => {
			s.boneOverrides[boneId].customOffset[axisIdx] = val;
		});
	}

	function handleUpdateBoneOpacity(boneId: BoneId, opacity: number): void {
		commitState((s) => {
			s.boneOverrides[boneId].opacity = opacity;
		});
	}

	function handleResetBone(boneId: BoneId): void {
		commitState((s) => {
			s.boneOverrides[boneId] = createDefaultBoneOverride(true);
		}, `Reset ${BONE_BY_ID[boneId].shortName}.`);
	}

	// Camera & Rotation Handlers
	function handleSetCameraPreset(camId: CameraPresetId): void {
		commitState((s) => {
			s.cameraPreset = camId;
		});
		viewportComp?.setCameraPresetView(camId);
	}

	function handleSetRotationAxis(axis: 'xDeg' | 'yDeg' | 'zDeg', deg: number): void {
		commitState((s) => {
			s.rotation[axis] = deg;
		});
	}

	function handleNudgeRotation(dYaw: number, dPitch: number): void {
		commitState((s) => {
			const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
			s.rotation.yDeg = wrap(s.rotation.yDeg + dYaw);
			s.rotation.xDeg = Math.max(-180, Math.min(180, s.rotation.xDeg + dPitch));
		});
	}

	function handleResetRotation(): void {
		commitState((s) => {
			s.rotation = createDefaultRotation();
		});
	}

	function handleResetView(): void {
		handleResetRotation();
		handleSetCameraPreset('three-quarter');
		viewportComp?.fitModel();
	}

	function handleToggleAutoRotate(): void {
		commitState((s) => {
			s.rotation.autoRotate = !s.rotation.autoRotate;
		});
	}

	function handleSetAutoRotateSpeed(speed: number): void {
		commitState((s) => {
			s.rotation.autoRotateSpeed = speed;
		});
	}

	// Appearance & Display Handlers
	function handleSelectMaterialPreset(id: MaterialPresetId): void {
		const preset = MATERIAL_PRESETS.find((m) => m.id === id);
		if (!preset) return;
		commitState((s) => {
			s.appearance.materialPreset = preset.id;
			s.appearance.boneColor = preset.color;
			s.appearance.roughness = preset.roughness;
		});
	}

	function handleSetBoneColor(hex: string): void {
		commitState((s) => {
			s.appearance.boneColor = hex;
		});
	}

	function handleSetRoughness(val: number): void {
		commitState((s) => {
			s.appearance.roughness = val;
		});
	}

	function handleSelectBackground(id: BackgroundThemeId): void {
		commitState((s) => {
			s.appearance.backgroundTheme = id;
		});
	}

	function handleToggleAppearanceFlag(
		flag:
			| 'showSutures'
			| 'wireframe'
			| 'showDentition'
			| 'showHyoid'
			| 'showGhostReference'
			| 'showArmatureFilaments'
	): void {
		commitState((s) => {
			s.appearance[flag] = !s.appearance[flag];
			if (flag === 'showHyoid' && s.appearance.showHyoid) {
				s.boneOverrides.hyoid.visible = true;
			}
		});
	}

	function handleToggleDisplayFlag(
		flag:
			| 'showLabels'
			| 'showBoneNames'
			| 'showAxisIndicator'
			| 'showCoordinateGrid'
			| 'showBoneList'
	): void {
		commitState((s) => {
			s.display[flag] = !s.display[flag];
		});
	}

	function handleSetLabelDensity(density: 'selected-and-key' | 'all-visible'): void {
		commitState((s) => {
			s.display.labelDensity = density;
		});
	}

	// Studies, Share & Export Handlers
	async function handleExportPng(includeLabels: boolean): Promise<void> {
		if (!viewportComp) return;
		exportFeedback = 'Rendering specimen PNG...';
		const blob = await viewportComp.exportPng(includeLabels);
		if (!blob) {
			exportFeedback = 'PNG export unavailable in non-WebGL mode.';
			return;
		}
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `exploded-human-skull-${explosionPct}pct.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		exportFeedback = 'Downloaded high-resolution PNG specimen plate.';
		setTimeout(() => (exportFeedback = ''), 3000);
	}

	async function handleCopyShareUrl(): Promise<void> {
		if (typeof window === 'undefined') return;
		const query = encodeStateToQuery(viewerState);
		const fullUrl = query
			? `${window.location.origin}${window.location.pathname}?${query}`
			: `${window.location.origin}${window.location.pathname}`;
		try {
			await navigator.clipboard.writeText(fullUrl);
			shareFeedback = 'Copied shareable study URL.';
		} catch {
			window.history.replaceState(null, '', fullUrl);
			shareFeedback = 'Updated page URL for bookmarking.';
		}
		setTimeout(() => (shareFeedback = ''), 3000);
	}

	function handleSaveConfig(name: string): void {
		const cam = viewportComp?.getCameraSnapshot();
		const nextRecord: SavedSkullConfiguration = {
			id: `study-${Date.now().toString(36)}`,
			name,
			savedAt: new Date().toISOString(),
			camera: cam,
			state: cloneSkullState(viewerState)
		};
		const nextList = [nextRecord, ...savedConfigs].slice(0, 16);
		savedConfigs = nextList;
		if (typeof window !== 'undefined') {
			writeSavedConfigurations(window.localStorage, nextList);
		}
		announce(`Saved configuration ${name}.`);
	}

	function handleLoadConfig(id: string): void {
		const found = savedConfigs.find((c) => c.id === id);
		if (!found) return;
		viewerState = cloneSkullState(found.state);
		scheduleUrlSync(viewerState);
		if (found.camera) {
			viewportComp?.setCameraSnapshot(found.camera);
		}
		announce(`Loaded study ${found.name}.`);
	}

	function handleDeleteConfig(id: string): void {
		const nextList = savedConfigs.filter((c) => c.id !== id);
		savedConfigs = nextList;
		if (typeof window !== 'undefined') {
			writeSavedConfigurations(window.localStorage, nextList);
		}
	}

	function handleDownloadConfigJson(id: string): void {
		const found = savedConfigs.find((c) => c.id === id);
		if (!found) return;
		const json = exportConfigJson(found);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${found.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function handleImportConfigFile(file: File): Promise<void> {
		try {
			const text = await file.text();
			const parsed = parseImportedConfigJson(text);
			if (!parsed) {
				importFeedback = 'Invalid skull study JSON schema.';
				return;
			}
			const nextList = [parsed, ...savedConfigs].slice(0, 16);
			savedConfigs = nextList;
			if (typeof window !== 'undefined') {
				writeSavedConfigurations(window.localStorage, nextList);
			}
			viewerState = cloneSkullState(parsed.state);
			scheduleUrlSync(viewerState);
			if (parsed.camera) {
				viewportComp?.setCameraSnapshot(parsed.camera);
			}
			importFeedback = `Imported and loaded "${parsed.name}".`;
		} catch {
			importFeedback = 'Could not read study file.';
		}
		setTimeout(() => (importFeedback = ''), 3500);
	}

	function handleResetAll(): void {
		const def = createDefaultState();
		viewerState = def;
		scheduleUrlSync(def);
		viewportComp?.setCameraPresetView(def.cameraPreset);
		announce('Reset exhibit to default museum state.');
	}
</script>

<section
	class="esm-breakout-root article-breakout not-prose"
	class:esm-elevated={mobileCatalogOpen || effectiveFullscreen}
	aria-label="Interactive 3D Exploded Human Skull Osteology Museum"
>
	<div
		bind:this={shellEl}
		class="esm-shell"
		class:esm-fullscreen-fallback={fullscreenFallback}
		data-testid="exploded-skull-museum"
		tabindex="-1"
	>
		<!-- Screen reader live announcements -->
		<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

		<!-- Top Museum Plaque Bar -->
		<header class="esm-header">
			<div class="esm-title-group">
				<h1 class="esm-title">Exploded Human Skull</h1>
				<div class="esm-specimen-badge" title="22 skull bones plus optional associated hyoid">
					<span>22 Cranial &amp; Facial Bones</span>
					{#if viewerState.appearance.showHyoid}
						<span>+ Hyoid</span>
					{/if}
					<span>·</span>
					<span>Sep {explosionPct}%</span>
				</div>
			</div>

			<div class="esm-header-actions">
				<button
					type="button"
					class="esm-btn"
					aria-pressed={viewerState.compareAssembled}
					title="Temporarily reassemble for anatomical comparison (Space)"
					onclick={handleToggleCompare}
				>
					{viewerState.compareAssembled ? 'Exploded' : 'Compare'}
				</button>
				<button
					type="button"
					class="esm-btn"
					aria-pressed={viewerState.display.showLabels}
					title="Toggle anatomical callout labels (L)"
					onclick={() => handleToggleDisplayFlag('showLabels')}
				>
					Labels
				</button>
				<button
					type="button"
					class="esm-btn"
					aria-pressed={!hidePanels}
					title="Show or collapse side inspection panels (H)"
					onclick={() => (hidePanels = !hidePanels)}
				>
					{hidePanels ? 'Show Panels' : 'Hide Panels'}
				</button>
				<button
					type="button"
					class="esm-btn"
					aria-pressed={effectiveFullscreen}
					title="Full-screen museum exhibit mode (Esc to exit)"
					onclick={toggleFullscreen}
				>
					{effectiveFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				</button>
			</div>
		</header>

		<!-- Main 3-Pane / Responsive Workbench -->
		<div
			class="esm-workspace"
			class:esm-no-left={!showLeftPanel}
			class:esm-no-right={!showRightPanel}
		>
			{#if showLeftPanel}
				<aside
					class="esm-side-left"
					class:esm-mobile-open={mobileCatalogOpen}
					aria-label="Osteology bone hierarchy explorer"
				>
					<BoneHierarchyPanel
						{viewerState}
						onSelectBone={handleSelectBone}
						onDoubleClickBone={handleDoubleClickBone}
						onToggleBoneVisible={handleToggleBoneVisible}
						onToggleIsolateBone={handleToggleIsolateBone}
						onToggleCategoryVisible={handleToggleCategoryVisible}
						onIsolateCategory={handleIsolateCategory}
						onShowAllVisible={handleShowAllVisible}
						onClearSelection={handleClearSelection}
						onCloseMobile={() => (mobileCatalogOpen = false)}
					/>
				</aside>
			{/if}

			<div class="relative min-w-0" role="region" aria-label="3D specimen viewport">
				<SkullViewport
					bind:this={viewportComp}
					{viewerState}
					isFullscreen={effectiveFullscreen}
					onSelectBone={handleSelectBone}
					onDoubleClickBone={handleDoubleClickBone}
					onExitIsolation={handleExitIsolation}
					onSetGlobalExplosion={handleSetGlobalExplosion}
					onSelectPreset={handleSelectPreset}
					onToggleCompare={handleToggleCompare}
					onSetCameraPreset={handleSetCameraPreset}
					onToggleLabels={() => handleToggleDisplayFlag('showLabels')}
					onTogglePanels={() => (hidePanels = !hidePanels)}
					onOpenMobileCatalog={() => {
						hidePanels = false;
						mobileCatalogOpen = true;
					}}
					onStatusAnnouncement={announce}
				/>
			</div>

			{#if showRightPanel}
				<aside class="esm-side-right" aria-label="Anatomical bone details and museum controls">
					<AnatomicalInfoPanel
						{viewerState}
						onSelectBone={handleSelectBone}
						onFocusBone={(id) => viewportComp?.focusBone(id)}
						onToggleIsolateBone={handleToggleIsolateBone}
						onToggleBoneVisible={handleToggleBoneVisible}
						onUpdateBoneDistance={handleUpdateBoneDistance}
						onUpdateBoneOpacity={handleUpdateBoneOpacity}
						onResetBone={handleResetBone}
						onToggleShowHyoid={() => handleToggleAppearanceFlag('showHyoid')}
					/>
					<ControlDock
						{viewerState}
						{savedConfigs}
						{activeTab}
						{shareFeedback}
						{exportFeedback}
						{importFeedback}
						onTabChange={(t) => (activeTab = t)}
						onSetGlobalExplosion={handleSetGlobalExplosion}
						onSelectPreset={handleSelectPreset}
						onSetDirectionMode={handleSetDirectionMode}
						onSetAnimationSpeed={handleSetAnimationSpeed}
						onToggleCompareAssembled={handleToggleCompare}
						onToggleGlobalVisible={handleToggleGlobalVisible}
						onReassemble={handleReassemble}
						onSelectBone={handleSelectBone}
						onToggleBoneVisible={handleToggleBoneVisible}
						onToggleIsolateBone={handleToggleIsolateBone}
						onUpdateBoneDistance={handleUpdateBoneDistance}
						onUpdateBoneOffset={handleUpdateBoneOffset}
						onUpdateBoneOpacity={handleUpdateBoneOpacity}
						onResetBone={handleResetBone}
						onFocusBone={(id) => viewportComp?.focusBone(id)}
						onSetCameraPreset={handleSetCameraPreset}
						onZoomStep={(f) => viewportComp?.zoomStep(f)}
						onFitModel={() => viewportComp?.fitModel()}
						onResetView={handleResetView}
						onSetRotationAxis={handleSetRotationAxis}
						onNudgeRotation={handleNudgeRotation}
						onResetRotation={handleResetRotation}
						onToggleAutoRotate={handleToggleAutoRotate}
						onSetAutoRotateSpeed={handleSetAutoRotateSpeed}
						onSelectMaterialPreset={handleSelectMaterialPreset}
						onSetBoneColor={handleSetBoneColor}
						onSetRoughness={handleSetRoughness}
						onSelectBackground={handleSelectBackground}
						onToggleAppearanceFlag={handleToggleAppearanceFlag}
						onToggleDisplayFlag={handleToggleDisplayFlag}
						onSetLabelDensity={handleSetLabelDensity}
						onExportPng={handleExportPng}
						onCopyShareUrl={handleCopyShareUrl}
						onSaveConfig={handleSaveConfig}
						onLoadConfig={handleLoadConfig}
						onDeleteConfig={handleDeleteConfig}
						onDownloadConfigJson={handleDownloadConfigJson}
						onImportConfigFile={handleImportConfigFile}
						onResetAll={handleResetAll}
					/>
				</aside>
			{/if}
		</div>

		<!-- Subtle specimen provenance strip -->
		<footer
			class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--esm-border)] bg-[#0b0c10] px-4 py-2 text-[11px] text-[var(--esm-ink-soft)]"
		>
			<span>
				Anatomical geometry derived from <a
					href="https://lifesciencedb.jp/bp3d/"
					target="_blank"
					rel="noopener noreferrer"
					class="underline decoration-[var(--esm-border)] hover:text-[var(--esm-ink)]"
					>BodyParts3D</a
				> (© DBCLS, CC BY 4.0) · 22 articulated skull bones + associated hyoid + 28 permanent teeth.
			</span>
			<span>
				Shortcuts: <code>Space</code> compare · <code>L</code> labels · <code>H</code> theater ·
				<code>F</code> focus · <code>R</code> reset
			</span>
		</footer>
	</div>
</section>
