<script lang="ts">
	import geometry from '$lib/visualizations/the-museum-of-almost/geometry.json';
	import { ARCHIVE } from '$lib/visualizations/the-museum-of-almost/fixtures';
	import {
		collectionLabel,
		collectionTally,
		illustrationForSpecimen,
		ILLUSTRATION_PARTS
	} from '$lib/visualizations/the-museum-of-almost/model';
	const tally = collectionTally(ARCHIVE);
	const slotCount = Object.keys(ILLUSTRATION_PARTS).length;
	const collectionDescription = `${tally.total} records in a ${slotCount}-drawer cabinet: ${ARCHIVE.specimens.map((record) => `${record.title}, ${record.version}`).join('; ')}. ${collectionLabel(ARCHIVE)}. ${tally.demonstration} fictional demonstration records; ${tally.verified} verified records; ${tally.testedReuse} tested reuse; ${tally.untestedPossibilities} untested possibilities; ${tally.withoutDemonstratedReuse} records without demonstrated reuse.`;
	let {
		selectedId = null,
		selectedPartId = null,
		compact = false
	}: { selectedId?: string | null; selectedPartId?: string | null; compact?: boolean } = $props();
	const groups: Record<string, SVGGElement> = {};
	const current = $derived(ARCHIVE.specimens.find((record) => record.id === selectedId));
	const selectedIllustration = $derived(illustrationForSpecimen(ARCHIVE, selectedId));
	const viewBox = $derived(
		compact && current
			? geometry.mobileBoxes[current.illustration]
			: `0 0 ${geometry.width} ${geometry.height}`
	);
	/** Presentation writes use owned SVG refs; no content state changes per frame. */
	export function setPose(progress: readonly number[]) {
		if (compact) return;
		for (const part of geometry.parts) {
			const index = ARCHIVE.specimens.findIndex((record) => record.illustration === part.piece);
			if (index < 0) continue;
			const value = progress[index] ?? 0;
			const eased = value * value * (3 - 2 * value);
			groups[part.id]?.setAttribute(
				'transform',
				`translate(${geometry.offset[0] * eased} ${geometry.offset[1] * eased})`
			);
		}
	}
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Committed, controlled Anatomy SVG; no reader markup or URL text. -->
<svg
	class="ma-cabinet"
	class:ma-compact={compact}
	{viewBox}
	role="img"
	aria-labelledby={compact ? 'ma-tray-title' : 'ma-cabinet-title'}
>
	<title id={compact ? 'ma-tray-title' : 'ma-cabinet-title'}
		>{compact && current
			? `${current.title}, a ${current.contentStatus === 'demonstration' ? 'fictional demonstration' : 'verified'} specimen in a fitted drawer`
			: `The Museum of Almost: a ${slotCount}-drawer cabinet containing ${tally.total} records`}</title
	>
	<desc
		>{current
			? `${current.purpose} ${current.observations[0].text} ${selectedPartId ? current.partExplanation : ''}`
			: collectionDescription}
		The rails retain the open drawer. Select matching labelled buttons to inspect every object.</desc
	>
	{#each geometry.parts as part (part.id)}
		{#if !compact || part.piece === selectedIllustration}
			<g
				bind:this={groups[part.id]}
				class:ma-paper={part.id.endsWith('.record') ||
					part.id.endsWith('.record-tab') ||
					part.id.endsWith('.liner') ||
					part.id === 'bench.paper'}
				class:ma-focus={selectedPartId !== null && part.part === selectedPartId}
				class:ma-selected={part.piece === selectedIllustration && part.id.endsWith('.front')}
				data-museum-part={part.id}
				aria-hidden="true">{@html part.svg}</g
			>
		{/if}
	{/each}
</svg>
