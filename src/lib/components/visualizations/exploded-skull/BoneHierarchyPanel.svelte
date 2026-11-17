<script lang="ts">
	import {
		BONE_CATEGORY_META,
		bonesByCategory,
		computeAllBoneTransforms,
		type BoneCategory,
		type BoneId,
		type SkullBoneMetadata,
		type SkullViewerState
	} from '$lib/visualizations/exploded-skull';

	interface Props {
		viewerState: SkullViewerState;
		onSelectBone: (boneId: BoneId, additive: boolean) => void;
		onDoubleClickBone: (boneId: BoneId) => void;
		onToggleBoneVisible: (boneId: BoneId) => void;
		onToggleIsolateBone: (boneId: BoneId) => void;
		onToggleCategoryVisible: (category: BoneCategory, makeVisible: boolean) => void;
		onIsolateCategory: (category: BoneCategory) => void;
		onShowAllVisible: () => void;
		onClearSelection: () => void;
		onCloseMobile?: () => void;
	}

	let {
		viewerState,
		onSelectBone,
		onDoubleClickBone,
		onToggleBoneVisible,
		onToggleIsolateBone,
		onToggleCategoryVisible,
		onIsolateCategory,
		onShowAllVisible,
		onClearSelection,
		onCloseMobile
	}: Props = $props();

	let searchQuery = $state('');
	let multiSelectTouch = $state(false);
	let collapsedCategories = $state<Record<BoneCategory, boolean>>({
		neurocranium: false,
		viscerocranium: false,
		mandible: false,
		associated: false
	});

	const categoryOrder: BoneCategory[] = [
		'neurocranium',
		'viscerocranium',
		'mandible',
		'associated'
	];

	const transforms = $derived(computeAllBoneTransforms(viewerState));
	const selectedSet = $derived(new Set(viewerState.selectedBoneIds));
	const isolatedSet = $derived(new Set(viewerState.isolatedBoneIds));

	function matchesSearch(bone: SkullBoneMetadata, q: string): boolean {
		if (!q) return true;
		const haystack = [
			bone.name,
			bone.shortName,
			bone.commonName ?? '',
			bone.latinName,
			bone.fmaId,
			bone.category
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(q);
	}

	const filteredGroups = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return categoryOrder.map((category) => {
			const meta = BONE_CATEGORY_META[category];
			const allBones = bonesByCategory(category);
			const visibleBones = allBones.filter((b) => matchesSearch(b, q));
			const anyVisibleInGroup = allBones.some((b) => transforms[b.id].visible);
			return {
				category,
				meta,
				allBones,
				bones: visibleBones,
				anyVisibleInGroup
			};
		});
	});

	function handleRowClick(boneId: BoneId, event: MouseEvent): void {
		const additive = multiSelectTouch || event.shiftKey || event.ctrlKey || event.metaKey;
		onSelectBone(boneId, additive);
	}
</script>

<div class="flex h-full flex-col">
	<div
		class="flex items-center justify-between gap-2 border-b border-[var(--esm-border)] px-3 py-2"
	>
		<div>
			<div class="text-xs font-semibold tracking-wide text-[var(--esm-ink)] uppercase">
				Osteology Catalog
			</div>
			<div class="text-[11px] text-[var(--esm-ink-soft)]">22 Skull + 1 Hyoid</div>
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				class="esm-btn esm-btn-xs"
				aria-pressed={multiSelectTouch}
				title="Toggle multi-select mode without holding Shift"
				onclick={() => (multiSelectTouch = !multiSelectTouch)}
			>
				Multi
			</button>
			{#if onCloseMobile}
				<button
					type="button"
					class="esm-btn esm-btn-xs esm-drawer-only"
					aria-label="Close catalog drawer"
					onclick={onCloseMobile}
				>
					Done
				</button>
			{/if}
		</div>
	</div>

	<div class="border-b border-[var(--esm-border)] px-3 py-2">
		<label for="esm-bone-search" class="sr-only">Search bones by name, Latin, or FMA ID</label>
		<input
			id="esm-bone-search"
			type="search"
			class="esm-search-input"
			placeholder="Search bone, Latin name, FMA..."
			bind:value={searchQuery}
		/>
		<div class="mt-2 flex flex-wrap gap-1.5">
			<button type="button" class="esm-btn esm-btn-xs" onclick={onShowAllVisible}>
				Show all 22
			</button>
			{#if viewerState.selectedBoneIds.length > 0}
				<button type="button" class="esm-btn esm-btn-xs" onclick={onClearSelection}>
					Clear ({viewerState.selectedBoneIds.length})
				</button>
			{/if}
		</div>
	</div>

	<div class="esm-scroll-pane">
		{#each filteredGroups as group (group.category)}
			{#if group.bones.length > 0}
				<div class="mb-2">
					<div class="esm-cat-header">
						<button
							type="button"
							class="flex min-w-0 items-center gap-1 text-left text-[11px] font-semibold tracking-wider text-[var(--esm-ink-muted)] uppercase"
							aria-expanded={!collapsedCategories[group.category]}
							onclick={() =>
								(collapsedCategories[group.category] = !collapsedCategories[group.category])}
						>
							<span class="inline-block w-3 text-center">
								{collapsedCategories[group.category] ? '▸' : '▾'}
							</span>
							<span class="truncate">{group.meta.label}</span>
							<span class="text-[10px] font-normal text-[var(--esm-ink-soft)]">
								({group.bones.length})
							</span>
						</button>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								class="esm-btn esm-btn-xs"
								title="Isolate {group.meta.label}"
								aria-label="Isolate {group.meta.label}"
								onclick={() => onIsolateCategory(group.category)}
							>
								Solo
							</button>
							<button
								type="button"
								class="esm-btn esm-btn-xs"
								aria-pressed={group.anyVisibleInGroup}
								aria-label={group.anyVisibleInGroup
									? `Hide ${group.meta.label}`
									: `Show ${group.meta.label}`}
								onclick={() => onToggleCategoryVisible(group.category, !group.anyVisibleInGroup)}
							>
								{group.anyVisibleInGroup ? 'Hide' : 'Show'}
							</button>
						</div>
					</div>

					{#if !collapsedCategories[group.category]}
						<div class="space-y-0.5 pl-1" role="list">
							{#each group.bones as bone (bone.id)}
								{@const tr = transforms[bone.id]}
								{@const isSel = selectedSet.has(bone.id)}
								{@const isIso = isolatedSet.has(bone.id)}
								<div class="esm-bone-row" data-selected={isSel} role="listitem">
									<button
										type="button"
										class="esm-bone-pick"
										aria-pressed={isSel}
										onclick={(e) => handleRowClick(bone.id, e)}
										ondblclick={() => onDoubleClickBone(bone.id)}
									>
										<span
											class="esm-bone-name"
											class:opacity-45={!tr.visible}
											title={`${bone.name} (${bone.latinName})`}
										>
											{bone.shortName}
										</span>
										{#if tr.displacementMm > 0}
											<span class="esm-disp-pill">+{tr.displacementMm}mm</span>
										{/if}
									</button>
									<button
										type="button"
										class="esm-btn esm-btn-xs"
										aria-pressed={isIso}
										title={isIso
											? `Exit isolation (${bone.shortName})`
											: `Isolate ${bone.shortName}`}
										aria-label={isIso
											? `Exit isolation (${bone.shortName})`
											: `Isolate ${bone.shortName}`}
										onclick={() => onToggleIsolateBone(bone.id)}
									>
										◎
									</button>
									<button
										type="button"
										class="esm-btn esm-btn-xs"
										aria-pressed={tr.visible}
										title={tr.visible ? `Hide ${bone.shortName}` : `Show ${bone.shortName}`}
										aria-label={tr.visible ? `Hide ${bone.shortName}` : `Show ${bone.shortName}`}
										onclick={() => onToggleBoneVisible(bone.id)}
									>
										{tr.visible ? '●' : '○'}
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
