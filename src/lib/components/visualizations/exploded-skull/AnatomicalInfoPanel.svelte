<script lang="ts">
	import {
		BONE_BY_ID,
		BONE_CATEGORY_META,
		PRESET_BY_ID,
		computeBoneTargetTransform,
		type BoneId,
		type SkullViewerState
	} from '$lib/visualizations/exploded-skull';

	interface Props {
		viewerState: SkullViewerState;
		onSelectBone: (boneId: BoneId, additive: boolean) => void;
		onFocusBone: (boneId: BoneId) => void;
		onToggleIsolateBone: (boneId: BoneId) => void;
		onToggleBoneVisible: (boneId: BoneId) => void;
		onUpdateBoneDistance: (boneId: BoneId, mult: number) => void;
		onUpdateBoneOpacity: (boneId: BoneId, opacity: number) => void;
		onResetBone: (boneId: BoneId) => void;
		onToggleShowHyoid: () => void;
	}

	let {
		viewerState,
		onSelectBone,
		onFocusBone,
		onToggleIsolateBone,
		onToggleBoneVisible,
		onUpdateBoneDistance,
		onUpdateBoneOpacity,
		onResetBone,
		onToggleShowHyoid
	}: Props = $props();

	let detailExpanded = $state(false);

	const activeBoneId = $derived(
		viewerState.selectedBoneIds.length > 0
			? viewerState.selectedBoneIds[viewerState.selectedBoneIds.length - 1]
			: null
	);
	const boneMeta = $derived(activeBoneId ? BONE_BY_ID[activeBoneId] : null);
	const boneOverride = $derived(activeBoneId ? viewerState.boneOverrides[activeBoneId] : null);
	const boneTransform = $derived(
		boneMeta ? computeBoneTargetTransform(boneMeta, viewerState) : null
	);
	const activePreset = $derived(PRESET_BY_ID[viewerState.presetId]);
	const isIsolated = $derived(
		activeBoneId !== null && viewerState.isolatedBoneIds.includes(activeBoneId)
	);

	function sideLabel(side: 'left' | 'right' | 'midline'): string {
		if (side === 'left') return 'Left (patient anatomical left)';
		if (side === 'right') return 'Right (patient anatomical right)';
		return 'Midline unpaired';
	}
</script>

<section class="esm-info-card" aria-label="Anatomical bone information">
	{#if boneMeta && boneOverride && boneTransform}
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="esm-info-title">{boneMeta.name}</h2>
				<div class="esm-info-latin">
					{boneMeta.latinName}
					{#if boneMeta.commonName}
						· {boneMeta.commonName}
					{/if}
				</div>
			</div>
			<button
				type="button"
				class="esm-btn esm-btn-xs shrink-0"
				aria-expanded={detailExpanded}
				onclick={() => (detailExpanded = !detailExpanded)}
			>
				{detailExpanded ? 'Compact' : 'Details'}
			</button>
		</div>

		{#if viewerState.selectedBoneIds.length > 1}
			<div class="mt-2 flex flex-wrap items-center gap-1">
				<span class="text-[11px] text-[var(--esm-ink-soft)]">Selected:</span>
				{#each viewerState.selectedBoneIds as selId (selId)}
					<button
						type="button"
						class="esm-btn esm-btn-xs"
						aria-pressed={selId === activeBoneId}
						onclick={() => onSelectBone(selId, false)}
					>
						{BONE_BY_ID[selId].shortName}
					</button>
				{/each}
			</div>
		{/if}

		<div class="esm-meta-chips">
			<span class="esm-meta-chip">{BONE_CATEGORY_META[boneMeta.category].label}</span>
			<span class="esm-meta-chip">{sideLabel(boneMeta.side)}</span>
			<span class="esm-meta-chip">{boneMeta.fmaId}</span>
			{#if boneTransform.displacementMm > 0}
				<span class="esm-meta-chip">Offset {boneTransform.displacementMm} mm</span>
			{/if}
		</div>

		<p class="m-0 text-xs leading-relaxed text-[var(--esm-ink-muted)]">
			{boneMeta.location}
		</p>

		<div class="mt-2.5 flex flex-wrap gap-1.5">
			<button type="button" class="esm-btn esm-btn-xs" onclick={() => onFocusBone(boneMeta.id)}>
				Focus
			</button>
			<button
				type="button"
				class="esm-btn esm-btn-xs"
				aria-pressed={isIsolated}
				onclick={() => onToggleIsolateBone(boneMeta.id)}
			>
				{isIsolated ? 'Un-isolate' : 'Isolate'}
			</button>
			<button
				type="button"
				class="esm-btn esm-btn-xs"
				aria-pressed={boneTransform.visible}
				onclick={() => onToggleBoneVisible(boneMeta.id)}
			>
				{boneTransform.visible ? 'Hide' : 'Show'}
			</button>
			<button type="button" class="esm-btn esm-btn-xs" onclick={() => onResetBone(boneMeta.id)}>
				Reset bone
			</button>
		</div>

		<div class="mt-2.5 grid grid-cols-2 gap-2">
			<div>
				<div class="esm-field-label">
					<span>Bone Distance</span>
					<span class="esm-num-readout">{boneOverride.explosionDistance.toFixed(2)}×</span>
				</div>
				<input
					type="range"
					class="esm-range"
					min="0"
					max="2.5"
					step="0.05"
					aria-label="Selected bone explosion distance multiplier"
					value={boneOverride.explosionDistance}
					oninput={(e) =>
						onUpdateBoneDistance(boneMeta.id, Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</div>
			<div>
				<div class="esm-field-label">
					<span>Bone Opacity</span>
					<span class="esm-num-readout">{Math.round(boneOverride.opacity * 100)}%</span>
				</div>
				<input
					type="range"
					class="esm-range"
					min="0.08"
					max="1"
					step="0.02"
					aria-label="Selected bone opacity"
					value={boneOverride.opacity}
					oninput={(e) =>
						onUpdateBoneOpacity(boneMeta.id, Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</div>
		</div>

		{#if detailExpanded}
			<div class="mt-3 space-y-2.5 border-t border-[var(--esm-border)] pt-2.5 text-xs">
				<div>
					<div class="font-semibold text-[var(--esm-accent-strong)]">Primary Functions</div>
					<ul class="mt-1 list-disc space-y-1 pl-4 text-[var(--esm-ink-muted)]">
						{#each boneMeta.functions as fn (fn)}
							<li>{fn}</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="font-semibold text-[var(--esm-accent-strong)]">Sutural Articulations</div>
					<ul class="mt-1 list-disc space-y-1 pl-4 text-[var(--esm-ink-muted)]">
						{#each boneMeta.articulations as art (art)}
							<li>{art}</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="font-semibold text-[var(--esm-accent-strong)]">
						Major Anatomical Landmarks
					</div>
					<ul class="mt-1 list-disc space-y-1 pl-4 text-[var(--esm-ink-muted)]">
						{#each boneMeta.landmarks as lm (lm)}
							<li>{lm}</li>
						{/each}
					</ul>
				</div>
				<div
					class="rounded-md bg-black/25 p-2 text-[11px] leading-relaxed text-[var(--esm-ink-muted)]"
				>
					<strong class="text-[var(--esm-ink)]">Clinical &amp; Osteological Note:</strong>
					{boneMeta.clinicalSignificance}
				</div>
				<div class="text-[11px] text-[var(--esm-ink-soft)]">
					BodyParts3D Part ID: <code>{boneMeta.bp3dPartId}</code> · FMA:
					<code>{boneMeta.fmaId}</code>
				</div>
			</div>
		{/if}
	{:else}
		<div class="flex items-start justify-between gap-2">
			<div>
				<h2 class="esm-info-title">Adult Human Cranium &amp; Face</h2>
				<div class="esm-info-latin">
					{activePreset?.name ?? 'Osteological Study'} · {activePreset?.subtitle ?? ''}
				</div>
			</div>
		</div>
		<p class="mt-1.5 mb-2 text-xs leading-relaxed text-[var(--esm-ink-muted)]">
			{activePreset?.description ??
				'Click any bone in the 3D specimen or catalog to inspect its sutures, landmarks, and osteological role.'}
		</p>
		<div class="flex flex-wrap items-center gap-1.5 text-[11px]">
			<button
				type="button"
				class="esm-btn esm-btn-xs"
				aria-pressed={viewerState.appearance.showHyoid}
				onclick={onToggleShowHyoid}
			>
				{viewerState.appearance.showHyoid ? 'Hide Associated Hyoid' : 'Include Associated Hyoid'}
			</button>
			<span class="text-[var(--esm-ink-soft)]">Double-click a bone to isolate &amp; frame.</span>
		</div>
	{/if}
</section>
