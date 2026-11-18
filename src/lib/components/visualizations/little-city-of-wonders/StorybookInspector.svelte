<script lang="ts">
	import {
		LANDMARKS,
		LANDMARK_BY_ID,
		NEIGHBORHOODS,
		NEIGHBORHOOD_BY_ID,
		SECRET_BY_ID,
		SECRET_CURIOSITIES,
		type CityViewerState,
		type LandmarkId,
		type NeighborhoodId,
		type SecretId
	} from '$lib/visualizations/little-city-of-wonders';

	interface Props {
		viewerState: CityViewerState;
		activeTab: 'story' | 'buildings' | 'secrets';
		onTabChange: (tab: 'story' | 'buildings' | 'secrets') => void;
		onSelectNeighborhood: (id: NeighborhoodId) => void;
		onSelectLandmark: (id: LandmarkId | null) => void;
		onFocusLandmark: (id: LandmarkId) => void;
		onWalkToLandmark: (id: LandmarkId) => void;
		onVisitSecret: (id: SecretId) => void;
	}

	let {
		viewerState,
		activeTab,
		onTabChange,
		onSelectNeighborhood,
		onSelectLandmark,
		onFocusLandmark,
		onWalkToLandmark,
		onVisitSecret
	}: Props = $props();

	let searchQuery = $state('');

	const selectedLandmark = $derived(
		viewerState.selectedLandmarkId ? LANDMARK_BY_ID[viewerState.selectedLandmarkId] : null
	);
	const selectedSecret = $derived(
		viewerState.selectedSecretId ? SECRET_BY_ID[viewerState.selectedSecretId] : null
	);
	const activeDistrict = $derived(
		selectedLandmark
			? NEIGHBORHOOD_BY_ID[selectedLandmark.neighborhoodId]
			: viewerState.activeNeighborhood !== 'overview'
				? NEIGHBORHOOD_BY_ID[viewerState.activeNeighborhood]
				: NEIGHBORHOODS[0]
	);

	const districtLandmarks = $derived(
		LANDMARKS.filter((lm) => lm.neighborhoodId === activeDistrict.id)
	);

	const filteredLandmarks = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return LANDMARKS;
		return LANDMARKS.filter((lm) => {
			const nb = NEIGHBORHOOD_BY_ID[lm.neighborhoodId];
			return (
				lm.name.toLowerCase().includes(q) ||
				lm.subtitle.toLowerCase().includes(q) ||
				nb.name.toLowerCase().includes(q) ||
				lm.materials.some((m) => m.toLowerCase().includes(q))
			);
		});
	});

	const discoveredSet = $derived(new Set(viewerState.discoveredSecrets));
</script>

<aside class="lcw-inspector" aria-label="Storybook architectural guide and curiosities">
	<div class="lcw-tabs" role="tablist" aria-label="City guide sections">
		<button
			type="button"
			role="tab"
			class="lcw-tab-btn"
			aria-selected={activeTab === 'story'}
			onclick={() => onTabChange('story')}
		>
			Story
		</button>
		<button
			type="button"
			role="tab"
			class="lcw-tab-btn"
			aria-selected={activeTab === 'buildings'}
			onclick={() => onTabChange('buildings')}
		>
			Buildings ({LANDMARKS.length})
		</button>
		<button
			type="button"
			role="tab"
			class="lcw-tab-btn"
			aria-selected={activeTab === 'secrets'}
			onclick={() => onTabChange('secrets')}
		>
			Secrets ({viewerState.discoveredSecrets.length}/{SECRET_CURIOSITIES.length})
		</button>
	</div>

	<div class="lcw-inspector-body">
		{#if activeTab === 'story'}
			{#if selectedSecret}
				{@const secDistrict = NEIGHBORHOOD_BY_ID[selectedSecret.neighborhoodId]}
				<div class="lcw-card-box">
					<div class="mb-2 flex items-center justify-between gap-2">
						<span class="text-[11px] font-semibold tracking-wider text-[#f7cf8b] uppercase">
							Curiosity Discovered · {secDistrict.shortLabel}
						</span>
						<button
							type="button"
							class="lcw-btn !px-2 !py-0.5 !text-[11px]"
							onclick={() => onSelectLandmark(null)}
						>
							Back
						</button>
					</div>
					<h2 class="m-0 text-base font-bold text-[#f6efe2]">{selectedSecret.title}</h2>
					<p class="mt-2 mb-0 text-xs leading-relaxed text-[#d1c7b4]">{selectedSecret.story}</p>
				</div>
			{/if}

			{#if selectedLandmark}
				{@const lmDistrict = NEIGHBORHOOD_BY_ID[selectedLandmark.neighborhoodId]}
				<div class="lcw-card-box" data-testid="landmark-story-card">
					<div class="mb-1.5 flex items-center justify-between gap-2">
						<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f7cf8b]">
							<span class="lcw-swatch-dot" style="background:{lmDistrict.accentHex}"></span>
							{lmDistrict.name}
						</span>
						<button
							type="button"
							class="lcw-btn !px-2 !py-0.5 !text-[11px]"
							onclick={() => onSelectLandmark(null)}
						>
							District Info
						</button>
					</div>

					<h2 class="m-0 text-base font-bold text-[#f6efe2]">{selectedLandmark.name}</h2>
					<p class="mt-0.5 mb-2 text-xs font-medium text-[#a89e8c]">{selectedLandmark.subtitle}</p>

					<p class="m-0 text-xs leading-relaxed text-[#e6decb]">{selectedLandmark.story}</p>

					<div class="mt-3 border-t border-white/10 pt-2.5">
						<div class="text-[11px] font-semibold tracking-wide text-[#f7cf8b] uppercase">
							Behind the Windows
						</div>
						<p class="mt-1 mb-0 text-xs leading-relaxed text-[#d1c7b4]">
							{selectedLandmark.residentNote}
						</p>
					</div>

					<div class="mt-2.5 border-t border-white/10 pt-2.5">
						<div class="text-[11px] font-semibold tracking-wide text-[#a89e8c] uppercase">
							Handcrafted Materials
						</div>
						<div class="mt-1.5 flex flex-wrap gap-1.5">
							{#each selectedLandmark.materials as mat (mat)}
								<span
									class="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-[#e6decb]"
								>
									{mat}
								</span>
							{/each}
						</div>
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							class="lcw-btn"
							onclick={() => onFocusLandmark(selectedLandmark.id)}
						>
							Focus Camera
						</button>
						<button
							type="button"
							class="lcw-btn"
							onclick={() => onWalkToLandmark(selectedLandmark.id)}
						>
							Walk to Door
						</button>
					</div>
				</div>
			{:else}
				<div class="lcw-card-box">
					<div class="flex items-center justify-between gap-2">
						<span class="text-[11px] font-semibold tracking-wider text-[#f7cf8b] uppercase">
							District {activeDistrict.number} of 6
						</span>
						<div class="flex items-center gap-1" title="District artisan color palette">
							{#each activeDistrict.paletteSwatches as hex (hex)}
								<span class="lcw-swatch-dot" style="background:{hex}"></span>
							{/each}
						</div>
					</div>

					<h2 class="mt-1 mb-0 text-base font-bold text-[#f6efe2]">{activeDistrict.name}</h2>
					<p class="mt-0.5 mb-2 text-xs font-medium text-[#a89e8c]">{activeDistrict.subtitle}</p>
					<p class="m-0 text-xs leading-relaxed text-[#e6decb]">{activeDistrict.description}</p>

					<p class="mt-2.5 mb-0 border-t border-white/10 pt-2 text-[11px] text-[#d1c7b4]">
						<strong class="text-[#f6efe2]">Craftsmanship:</strong>
						{activeDistrict.architecturalNotes}
					</p>

					<div class="mt-3">
						<button
							type="button"
							class="lcw-btn w-full justify-center"
							onclick={() => onSelectNeighborhood(activeDistrict.id)}
						>
							Visit {activeDistrict.shortLabel}
						</button>
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<div class="text-[11px] font-semibold tracking-wider text-[#a89e8c] uppercase">
						Landmarks in {activeDistrict.shortLabel}
					</div>
					{#each districtLandmarks as lm (lm.id)}
						<button
							type="button"
							class="lcw-list-btn"
							onclick={() => {
								onSelectLandmark(lm.id);
								onFocusLandmark(lm.id);
							}}
						>
							<span class="text-xs font-semibold text-[#f6efe2]">{lm.name}</span>
							<span class="text-[11px] text-[#a89e8c]">{lm.subtitle}</span>
						</button>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'buildings'}
			<input
				type="search"
				bind:value={searchQuery}
				placeholder="Filter buildings, districts, materials..."
				aria-label="Filter handcrafted buildings"
				class="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-[#f6efe2] placeholder:text-[#a89e8c]"
			/>

			<div class="flex flex-col gap-1.5">
				{#each filteredLandmarks as lm (lm.id)}
					{@const nb = NEIGHBORHOOD_BY_ID[lm.neighborhoodId]}
					<button
						type="button"
						class="lcw-list-btn"
						aria-current={viewerState.selectedLandmarkId === lm.id}
						onclick={() => {
							onSelectLandmark(lm.id);
							onFocusLandmark(lm.id);
							onTabChange('story');
						}}
					>
						<span class="flex items-center gap-1.5 text-xs font-semibold text-[#f6efe2]">
							<span class="lcw-swatch-dot" style="background:{nb.accentHex}"></span>
							{lm.name}
						</span>
						<span class="text-[11px] text-[#a89e8c]">{nb.shortLabel} · {lm.subtitle}</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="m-0 text-xs leading-relaxed text-[#d1c7b4]">
				Click tiny hidden details on balconies, spouts, counters, and bridges—or stroll right past
				them in Walk Mode—to collect their stories.
			</p>

			<div class="flex flex-col gap-1.5">
				{#each SECRET_CURIOSITIES as sec (sec.id)}
					{@const found = discoveredSet.has(sec.id)}
					{@const nb = NEIGHBORHOOD_BY_ID[sec.neighborhoodId]}
					<div class="lcw-card-box !p-2.5">
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs font-semibold text-[#f6efe2]">
								{found ? `✨ ${sec.title}` : `🔒 Mystery in ${nb.shortLabel}`}
							</span>
							<button
								type="button"
								class="lcw-btn !px-2 !py-0.5 !text-[11px]"
								onclick={() => onVisitSecret(sec.id)}
							>
								{found ? 'View' : 'Peek'}
							</button>
						</div>
						<p class="mt-1 mb-0 text-[11px] leading-relaxed text-[#d1c7b4]">
							{found ? sec.story : sec.hint}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</aside>
