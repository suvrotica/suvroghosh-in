<script lang="ts">
	import {
		BACKGROUND_THEMES,
		BONE_BY_ID,
		CAMERA_PRESETS,
		EXPLOSION_DIRECTION_MODES,
		EXPLOSION_PRESETS,
		MATERIAL_PRESETS,
		SKULL_BONES,
		type BackgroundThemeId,
		type BoneId,
		type CameraPresetId,
		type ExplosionDirectionMode,
		type ExplosionPresetId,
		type MaterialPresetId,
		type SavedSkullConfiguration,
		type SkullViewerState
	} from '$lib/visualizations/exploded-skull';

	type ControlTabId = 'explode' | 'bone' | 'view' | 'look' | 'studies';

	interface Props {
		viewerState: SkullViewerState;
		savedConfigs: SavedSkullConfiguration[];
		activeTab?: ControlTabId;
		shareFeedback?: string;
		exportFeedback?: string;
		importFeedback?: string;
		onTabChange?: (tab: ControlTabId) => void;
		onSetGlobalExplosion: (value01: number) => void;
		onSelectPreset: (presetId: ExplosionPresetId) => void;
		onSetDirectionMode: (mode: ExplosionDirectionMode) => void;
		onSetAnimationSpeed: (speed: number) => void;
		onToggleCompareAssembled: () => void;
		onToggleGlobalVisible: () => void;
		onReassemble: () => void;
		onSelectBone: (boneId: BoneId, additive: boolean) => void;
		onToggleBoneVisible: (boneId: BoneId) => void;
		onToggleIsolateBone: (boneId: BoneId) => void;
		onUpdateBoneDistance: (boneId: BoneId, dist: number) => void;
		onUpdateBoneOffset: (boneId: BoneId, axisIdx: 0 | 1 | 2, val: number) => void;
		onUpdateBoneOpacity: (boneId: BoneId, opacity: number) => void;
		onResetBone: (boneId: BoneId) => void;
		onFocusBone: (boneId: BoneId) => void;
		onSetCameraPreset: (camId: CameraPresetId) => void;
		onZoomStep: (factor: number) => void;
		onFitModel: () => void;
		onResetView: () => void;
		onSetRotationAxis: (axis: 'xDeg' | 'yDeg' | 'zDeg', deg: number) => void;
		onNudgeRotation: (dYaw: number, dPitch: number) => void;
		onResetRotation: () => void;
		onToggleAutoRotate: () => void;
		onSetAutoRotateSpeed: (speed: number) => void;
		onSelectMaterialPreset: (id: MaterialPresetId) => void;
		onSetBoneColor: (hex: string) => void;
		onSetRoughness: (val: number) => void;
		onSelectBackground: (id: BackgroundThemeId) => void;
		onToggleAppearanceFlag: (
			flag:
				| 'showSutures'
				| 'wireframe'
				| 'showDentition'
				| 'showHyoid'
				| 'showGhostReference'
				| 'showArmatureFilaments'
		) => void;
		onToggleDisplayFlag: (
			flag:
				| 'showLabels'
				| 'showBoneNames'
				| 'showAxisIndicator'
				| 'showCoordinateGrid'
				| 'showBoneList'
		) => void;
		onSetLabelDensity: (density: 'selected-and-key' | 'all-visible') => void;
		onExportPng: (includeLabels: boolean) => void;
		onCopyShareUrl: () => void;
		onSaveConfig: (name: string) => void;
		onLoadConfig: (id: string) => void;
		onDeleteConfig: (id: string) => void;
		onDownloadConfigJson: (id: string) => void;
		onImportConfigFile: (file: File) => void;
		onResetAll: () => void;
	}

	let {
		viewerState,
		savedConfigs,
		activeTab = 'explode',
		shareFeedback = '',
		exportFeedback = '',
		importFeedback = '',
		onTabChange,
		onSetGlobalExplosion,
		onSelectPreset,
		onSetDirectionMode,
		onSetAnimationSpeed,
		onToggleCompareAssembled,
		onToggleGlobalVisible,
		onReassemble,
		onSelectBone,
		onToggleBoneVisible,
		onToggleIsolateBone,
		onUpdateBoneDistance,
		onUpdateBoneOffset,
		onUpdateBoneOpacity,
		onResetBone,
		onFocusBone,
		onSetCameraPreset,
		onZoomStep,
		onFitModel,
		onResetView,
		onSetRotationAxis,
		onNudgeRotation,
		onResetRotation,
		onToggleAutoRotate,
		onSetAutoRotateSpeed,
		onSelectMaterialPreset,
		onSetBoneColor,
		onSetRoughness,
		onSelectBackground,
		onToggleAppearanceFlag,
		onToggleDisplayFlag,
		onSetLabelDensity,
		onExportPng,
		onCopyShareUrl,
		onSaveConfig,
		onLoadConfig,
		onDeleteConfig,
		onDownloadConfigJson,
		onImportConfigFile,
		onResetAll
	}: Props = $props();

	let studyName = $state('');
	let includeLabelsInPng = $state(true);

	const currentTab = $derived(activeTab);

	function switchTab(tab: ControlTabId): void {
		onTabChange?.(tab);
	}

	const primaryBoneId = $derived<BoneId>(
		viewerState.selectedBoneIds.length > 0
			? viewerState.selectedBoneIds[viewerState.selectedBoneIds.length - 1]
			: 'frontal'
	);
	const primaryBoneMeta = $derived(BONE_BY_ID[primaryBoneId]);
	const primaryBoneOverride = $derived(viewerState.boneOverrides[primaryBoneId]);

	const explosionPct = $derived(Math.round(viewerState.globalExplosion * 100));
	const detents = [0, 10, 25, 50, 75, 100] as const;

	function handleSaveSubmit(e: SubmitEvent): void {
		e.preventDefault();
		const cleanName = studyName.trim() || `${primaryBoneMeta.shortName} Study (${explosionPct}%)`;
		onSaveConfig(cleanName);
		studyName = '';
	}

	function handleFileInput(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			onImportConfigFile(file);
			input.value = '';
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="esm-tabs" role="tablist" aria-label="Museum specimen controls">
		<button
			type="button"
			role="tab"
			class="esm-tab-btn"
			aria-selected={currentTab === 'explode'}
			onclick={() => switchTab('explode')}
		>
			Explode
		</button>
		<button
			type="button"
			role="tab"
			class="esm-tab-btn"
			aria-selected={currentTab === 'bone'}
			onclick={() => switchTab('bone')}
		>
			Bone
		</button>
		<button
			type="button"
			role="tab"
			class="esm-tab-btn"
			aria-selected={currentTab === 'view'}
			onclick={() => switchTab('view')}
		>
			Camera
		</button>
		<button
			type="button"
			role="tab"
			class="esm-tab-btn"
			aria-selected={currentTab === 'look'}
			onclick={() => switchTab('look')}
		>
			Style
		</button>
		<button
			type="button"
			role="tab"
			class="esm-tab-btn"
			aria-selected={currentTab === 'studies'}
			onclick={() => switchTab('studies')}
		>
			Studies
		</button>
	</div>

	<div class="esm-scroll-pane">
		{#if currentTab === 'explode'}
			<div class="esm-section">
				<h3 class="esm-section-title">Master Explosion</h3>
				<div class="esm-field-label">
					<label for="esm-master-explosion">Anatomical Separation</label>
					<span class="esm-num-readout">{explosionPct}%</span>
				</div>
				<input
					id="esm-master-explosion"
					type="range"
					class="esm-range"
					min="0"
					max="100"
					step="1"
					value={explosionPct}
					oninput={(e) =>
						onSetGlobalExplosion(Number((e.currentTarget as HTMLInputElement).value) / 100)}
				/>
				<div class="esm-detent-row">
					{#each detents as pct (pct)}
						<button
							type="button"
							class="esm-btn esm-btn-xs"
							aria-pressed={explosionPct === pct}
							onclick={() => onSetGlobalExplosion(pct / 100)}
						>
							{pct}%
						</button>
					{/each}
				</div>

				<div class="mt-2.5 flex flex-wrap gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.compareAssembled}
						onclick={onToggleCompareAssembled}
					>
						{viewerState.compareAssembled ? 'Return to Exploded' : 'Compare Assembled'}
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onReassemble}>
						Reassemble
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.globalVisible}
						onclick={onToggleGlobalVisible}
					>
						{viewerState.globalVisible ? 'Global: Visible' : 'Global: Hidden'}
					</button>
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Explosion Presets</h3>
				<div class="grid grid-cols-2 gap-1.5">
					{#each EXPLOSION_PRESETS as preset (preset.id)}
						<button
							type="button"
							class="esm-btn flex-col items-start text-left"
							aria-pressed={viewerState.presetId === preset.id}
							onclick={() => onSelectPreset(preset.id)}
						>
							<span class="font-medium text-[var(--esm-ink)]">{preset.name}</span>
							<span class="text-[10px] text-[var(--esm-ink-soft)]">{preset.subtitle}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Explosion Direction</h3>
				<div class="grid grid-cols-2 gap-1.5">
					{#each EXPLOSION_DIRECTION_MODES as mode (mode.id)}
						<button
							type="button"
							class="esm-btn esm-btn-xs justify-start text-left"
							title={mode.description}
							aria-pressed={viewerState.directionMode === mode.id}
							onclick={() => onSetDirectionMode(mode.id)}
						>
							{mode.label}
						</button>
					{/each}
				</div>
				<div class="mt-3">
					<div class="esm-field-label">
						<label for="esm-anim-speed">Transition Damping Speed</label>
						<span class="esm-num-readout">{viewerState.animationSpeed.toFixed(2)}×</span>
					</div>
					<input
						id="esm-anim-speed"
						type="range"
						class="esm-range"
						min="0.25"
						max="2.5"
						step="0.05"
						value={viewerState.animationSpeed}
						oninput={(e) =>
							onSetAnimationSpeed(Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>
			</div>
		{:else if currentTab === 'bone'}
			<div class="esm-section">
				<h3 class="esm-section-title">Target Bone Control</h3>
				<label for="esm-bone-target-select" class="sr-only">Choose bone to customize</label>
				<select
					id="esm-bone-target-select"
					class="esm-select"
					value={primaryBoneId}
					onchange={(e) =>
						onSelectBone((e.currentTarget as HTMLSelectElement).value as BoneId, false)}
				>
					{#each SKULL_BONES as bone (bone.id)}
						<option value={bone.id}>{bone.name}</option>
					{/each}
				</select>

				<div class="mt-2.5 flex flex-wrap gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={primaryBoneOverride.visible}
						onclick={() => onToggleBoneVisible(primaryBoneId)}
					>
						{primaryBoneOverride.visible ? 'Visible' : 'Hidden'}
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.isolatedBoneIds.includes(primaryBoneId)}
						onclick={() => onToggleIsolateBone(primaryBoneId)}
					>
						{viewerState.isolatedBoneIds.includes(primaryBoneId) ? 'Isolated' : 'Isolate'}
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						onclick={() => onFocusBone(primaryBoneId)}
					>
						Focus Camera
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						onclick={() => onResetBone(primaryBoneId)}
					>
						Reset Bone
					</button>
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Individual Displacement &amp; Offset</h3>
				<div class="esm-field-label">
					<label for="esm-bone-dist">Individual Explosion Distance</label>
					<span class="esm-num-readout">{primaryBoneOverride.explosionDistance.toFixed(2)}×</span>
				</div>
				<input
					id="esm-bone-dist"
					type="range"
					class="esm-range"
					min="0"
					max="2.5"
					step="0.05"
					value={primaryBoneOverride.explosionDistance}
					oninput={(e) =>
						onUpdateBoneDistance(
							primaryBoneId,
							Number((e.currentTarget as HTMLInputElement).value)
						)}
				/>

				<div class="esm-field-label mt-2.5">
					<label for="esm-bone-opacity">Individual Opacity</label>
					<span class="esm-num-readout">{Math.round(primaryBoneOverride.opacity * 100)}%</span>
				</div>
				<input
					id="esm-bone-opacity"
					type="range"
					class="esm-range"
					min="0.05"
					max="1"
					step="0.02"
					value={primaryBoneOverride.opacity}
					oninput={(e) =>
						onUpdateBoneOpacity(primaryBoneId, Number((e.currentTarget as HTMLInputElement).value))}
				/>

				<div class="mt-3 space-y-2">
					<div class="esm-field-label">
						<label for="esm-off-x">Offset Left (+X) / Right (−X)</label>
						<span class="esm-num-readout">
							{(primaryBoneOverride.customOffset[0] * 100).toFixed(0)} mm
						</span>
					</div>
					<input
						id="esm-off-x"
						type="range"
						class="esm-range"
						min="-1.5"
						max="1.5"
						step="0.02"
						value={primaryBoneOverride.customOffset[0]}
						oninput={(e) =>
							onUpdateBoneOffset(
								primaryBoneId,
								0,
								Number((e.currentTarget as HTMLInputElement).value)
							)}
					/>

					<div class="esm-field-label">
						<label for="esm-off-y">Offset Superior (+Y) / Inferior (−Y)</label>
						<span class="esm-num-readout">
							{(primaryBoneOverride.customOffset[1] * 100).toFixed(0)} mm
						</span>
					</div>
					<input
						id="esm-off-y"
						type="range"
						class="esm-range"
						min="-1.5"
						max="1.5"
						step="0.02"
						value={primaryBoneOverride.customOffset[1]}
						oninput={(e) =>
							onUpdateBoneOffset(
								primaryBoneId,
								1,
								Number((e.currentTarget as HTMLInputElement).value)
							)}
					/>

					<div class="esm-field-label">
						<label for="esm-off-z">Offset Anterior (+Z) / Posterior (−Z)</label>
						<span class="esm-num-readout">
							{(primaryBoneOverride.customOffset[2] * 100).toFixed(0)} mm
						</span>
					</div>
					<input
						id="esm-off-z"
						type="range"
						class="esm-range"
						min="-1.5"
						max="1.5"
						step="0.02"
						value={primaryBoneOverride.customOffset[2]}
						oninput={(e) =>
							onUpdateBoneOffset(
								primaryBoneId,
								2,
								Number((e.currentTarget as HTMLInputElement).value)
							)}
					/>
				</div>
			</div>
		{:else if currentTab === 'view'}
			<div class="esm-section">
				<h3 class="esm-section-title">Camera Viewpoints</h3>
				<div class="grid grid-cols-2 gap-1.5">
					{#each CAMERA_PRESETS as cam (cam.id)}
						<button
							type="button"
							class="esm-btn esm-btn-xs justify-between"
							title={cam.description}
							aria-pressed={viewerState.cameraPreset === cam.id}
							onclick={() => onSetCameraPreset(cam.id)}
						>
							<span>{cam.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Zoom &amp; Framing</h3>
				<div class="flex flex-wrap gap-1.5">
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onZoomStep(0.78)}>
						Zoom In +
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onZoomStep(1.26)}>
						Zoom Out −
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onFitModel}>
						Fit Entire Skull
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						disabled={viewerState.selectedBoneIds.length === 0}
						onclick={() => onFocusBone(primaryBoneId)}
					>
						Focus Selected Bone
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onResetView}>
						Reset View
					</button>
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Specimen Axis Rotation</h3>
				<div class="space-y-2">
					<div class="esm-field-label">
						<label for="esm-rot-x">Pitch (X Axis)</label>
						<span class="esm-num-readout">{Math.round(viewerState.rotation.xDeg)}°</span>
					</div>
					<input
						id="esm-rot-x"
						type="range"
						class="esm-range"
						min="-180"
						max="180"
						step="1"
						value={viewerState.rotation.xDeg}
						oninput={(e) =>
							onSetRotationAxis('xDeg', Number((e.currentTarget as HTMLInputElement).value))}
					/>

					<div class="esm-field-label">
						<label for="esm-rot-y">Yaw (Y Axis)</label>
						<span class="esm-num-readout">{Math.round(viewerState.rotation.yDeg)}°</span>
					</div>
					<input
						id="esm-rot-y"
						type="range"
						class="esm-range"
						min="-180"
						max="180"
						step="1"
						value={viewerState.rotation.yDeg}
						oninput={(e) =>
							onSetRotationAxis('yDeg', Number((e.currentTarget as HTMLInputElement).value))}
					/>

					<div class="esm-field-label">
						<label for="esm-rot-z">Roll (Z Axis)</label>
						<span class="esm-num-readout">{Math.round(viewerState.rotation.zDeg)}°</span>
					</div>
					<input
						id="esm-rot-z"
						type="range"
						class="esm-range"
						min="-180"
						max="180"
						step="1"
						value={viewerState.rotation.zDeg}
						oninput={(e) =>
							onSetRotationAxis('zDeg', Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>

				<div class="mt-2.5 flex flex-wrap gap-1.5">
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onNudgeRotation(-20, 0)}>
						↺ Rotate Left
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onNudgeRotation(20, 0)}>
						↻ Rotate Right
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onNudgeRotation(0, -18)}>
						↑ Rotate Up
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={() => onNudgeRotation(0, 18)}>
						↓ Rotate Down
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onResetRotation}>
						Reset Rotation
					</button>
				</div>

				<div class="mt-3 flex items-center justify-between gap-2">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.rotation.autoRotate}
						onclick={onToggleAutoRotate}
					>
						{viewerState.rotation.autoRotate ? 'Auto-Rotate: On' : 'Auto-Rotate: Off'}
					</button>
					<span class="esm-num-readout">{viewerState.rotation.autoRotateSpeed.toFixed(2)}×</span>
				</div>
				<input
					type="range"
					class="esm-range mt-1.5"
					min="0.1"
					max="3.0"
					step="0.05"
					aria-label="Turntable auto-rotate speed"
					value={viewerState.rotation.autoRotateSpeed}
					oninput={(e) => onSetAutoRotateSpeed(Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</div>
		{:else if currentTab === 'look'}
			<div class="esm-section">
				<h3 class="esm-section-title">Osteology Material Finish</h3>
				<div class="grid grid-cols-1 gap-1.5">
					{#each MATERIAL_PRESETS as mat (mat.id)}
						<button
							type="button"
							class="esm-btn esm-btn-xs justify-between"
							aria-pressed={viewerState.appearance.materialPreset === mat.id}
							onclick={() => onSelectMaterialPreset(mat.id)}
						>
							<span class="flex items-center gap-2">
								<span
									class="inline-block h-3 w-3 rounded-full border border-white/30"
									style={`background:${mat.color}`}
								></span>
								{mat.label}
							</span>
						</button>
					{/each}
				</div>

				<div class="mt-2.5 flex items-center justify-between gap-3">
					<label for="esm-bone-color" class="text-xs text-[var(--esm-ink-muted)]">
						Bone Tint
					</label>
					<input
						id="esm-bone-color"
						type="color"
						class="h-7 w-12 cursor-pointer rounded border border-[var(--esm-border)] bg-transparent p-0"
						value={viewerState.appearance.boneColor}
						oninput={(e) => onSetBoneColor((e.currentTarget as HTMLInputElement).value)}
					/>
				</div>

				<div class="esm-field-label mt-2">
					<label for="esm-roughness">Surface Roughness</label>
					<span class="esm-num-readout">{viewerState.appearance.roughness.toFixed(2)}</span>
				</div>
				<input
					id="esm-roughness"
					type="range"
					class="esm-range"
					min="0.08"
					max="1"
					step="0.02"
					value={viewerState.appearance.roughness}
					oninput={(e) => onSetRoughness(Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Gallery Lighting Theme</h3>
				<div class="grid grid-cols-2 gap-1.5">
					{#each BACKGROUND_THEMES as theme (theme.id)}
						<button
							type="button"
							class="esm-btn esm-btn-xs justify-start"
							aria-pressed={viewerState.appearance.backgroundTheme === theme.id}
							onclick={() => onSelectBackground(theme.id)}
						>
							<span
								class="inline-block h-2.5 w-2.5 rounded-full border border-white/25"
								style={`background:${theme.hex}`}
							></span>
							<span>{theme.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Anatomical Overlays &amp; Guides</h3>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.showSutures}
						onclick={() => onToggleAppearanceFlag('showSutures')}
					>
						Cranial Sutures
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.showDentition}
						onclick={() => onToggleAppearanceFlag('showDentition')}
					>
						Dentition (28 Teeth)
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.showHyoid}
						onclick={() => onToggleAppearanceFlag('showHyoid')}
					>
						Hyoid Bone
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.showGhostReference}
						onclick={() => onToggleAppearanceFlag('showGhostReference')}
					>
						Ghost Reference
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.showArmatureFilaments}
						onclick={() => onToggleAppearanceFlag('showArmatureFilaments')}
					>
						Armature Filaments
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.appearance.wireframe}
						onclick={() => onToggleAppearanceFlag('wireframe')}
					>
						Wireframe Mesh
					</button>
				</div>
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Labels &amp; Spatial Orientation</h3>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.showLabels}
						onclick={() => onToggleDisplayFlag('showLabels')}
					>
						Anatomical Labels
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.showBoneNames}
						onclick={() => onToggleDisplayFlag('showBoneNames')}
					>
						{viewerState.display.showBoneNames ? 'Full Bone Names' : 'Short Names'}
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.showAxisIndicator}
						onclick={() => onToggleDisplayFlag('showAxisIndicator')}
					>
						S/I/A/P/L/R Compass
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.showCoordinateGrid}
						onclick={() => onToggleDisplayFlag('showCoordinateGrid')}
					>
						Coordinate Grid
					</button>
				</div>
				<div class="mt-2 flex gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.labelDensity === 'selected-and-key'}
						onclick={() => onSetLabelDensity('selected-and-key')}
					>
						Key Bones
					</button>
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={viewerState.display.labelDensity === 'all-visible'}
						onclick={() => onSetLabelDensity('all-visible')}
					>
						All Visible Bones
					</button>
				</div>
			</div>
		{:else if currentTab === 'studies'}
			<div class="esm-section">
				<h3 class="esm-section-title">Screenshot &amp; Shareable Link</h3>
				<label class="mb-2 flex items-center gap-2 text-xs text-[var(--esm-ink-muted)]">
					<input type="checkbox" bind:checked={includeLabelsInPng} />
					<span>Include anatomical labels in PNG export</span>
				</label>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						onclick={() => onExportPng(includeLabelsInPng)}
					>
						Export Specimen PNG
					</button>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onCopyShareUrl}>
						Copy Share Link
					</button>
				</div>
				{#if shareFeedback}
					<p class="mt-1.5 text-[11px] text-[var(--esm-accent-strong)]">{shareFeedback}</p>
				{/if}
				{#if exportFeedback}
					<p class="mt-1.5 text-[11px] text-[var(--esm-accent-strong)]">{exportFeedback}</p>
				{/if}
			</div>

			<div class="esm-section">
				<h3 class="esm-section-title">Save Local Dissection Study</h3>
				<form class="flex gap-1.5" onsubmit={handleSaveSubmit}>
					<label for="esm-study-name" class="sr-only">Study name</label>
					<input
						id="esm-study-name"
						type="text"
						class="esm-text-input"
						maxlength="72"
						placeholder="e.g. Pterion & Sphenoid Wing..."
						bind:value={studyName}
					/>
					<button type="submit" class="esm-btn shrink-0">Save</button>
				</form>

				{#if savedConfigs.length > 0}
					<ul class="mt-2.5 space-y-1.5">
						{#each savedConfigs as cfg (cfg.id)}
							<li
								class="flex items-center justify-between gap-2 rounded-md border border-[var(--esm-border)] bg-black/25 px-2.5 py-1.5 text-xs"
							>
								<div class="min-w-0">
									<div class="truncate font-medium text-[var(--esm-ink)]">{cfg.name}</div>
									<div class="text-[10px] text-[var(--esm-ink-soft)]">
										{Math.round(cfg.state.globalExplosion * 100)}% · {cfg.state.presetId}
									</div>
								</div>
								<div class="flex shrink-0 gap-1">
									<button
										type="button"
										class="esm-btn esm-btn-xs"
										onclick={() => onLoadConfig(cfg.id)}
									>
										Load
									</button>
									<button
										type="button"
										class="esm-btn esm-btn-xs"
										title="Download study configuration as JSON"
										onclick={() => onDownloadConfigJson(cfg.id)}
									>
										JSON
									</button>
									<button
										type="button"
										class="esm-btn esm-btn-xs text-[var(--esm-danger)]"
										aria-label="Delete saved study {cfg.name}"
										onclick={() => onDeleteConfig(cfg.id)}
									>
										×
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-2 text-xs text-[var(--esm-ink-soft)]">
						Saved custom dissections stay in this browser and can be exported as JSON.
					</p>
				{/if}

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<label class="esm-btn esm-btn-xs cursor-pointer">
						<span>Import Study JSON</span>
						<input
							type="file"
							accept="application/json,.json"
							class="sr-only"
							onchange={handleFileInput}
						/>
					</label>
					<button type="button" class="esm-btn esm-btn-xs" onclick={onResetAll}>
						Reset Defaults
					</button>
				</div>
				{#if importFeedback}
					<p class="mt-1.5 text-[11px] text-[var(--esm-accent-strong)]">{importFeedback}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
