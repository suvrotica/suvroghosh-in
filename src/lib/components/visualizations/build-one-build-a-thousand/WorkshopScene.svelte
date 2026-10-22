<script lang="ts">
	import geometry from '$lib/visualizations/build-one-build-a-thousand/geometry.json';
	import type {
		Area,
		WorkshopSnapshot
	} from '$lib/visualizations/build-one-build-a-thousand/model';
	let {
		snapshot,
		beat = 0,
		initialAssembly = 1,
		selected = 'cutting',
		differences = false,
		overview = false
	}: {
		snapshot: WorkshopSnapshot;
		beat?: number;
		initialAssembly?: number;
		selected?: Area;
		differences?: boolean;
		overview?: boolean;
	} = $props();
	let host: HTMLDivElement;
	/** Presentation writes are owned by this scene; no frame changes domain/Svelte state. */
	export function present(assembly: number, dispatch: number) {
		if (!host) return;
		const eased = assembly * assembly * (3 - 2 * assembly);
		for (const element of host.querySelectorAll<SVGGElement>('[data-motion-piece]')) {
			element.setAttribute(
				'transform',
				`translate(${(1 - eased) * Number(element.dataset.dx)} ${(1 - eased) * Number(element.dataset.dy)})`
			);
		}
		for (const element of host.querySelectorAll<SVGGElement>('[data-phone]'))
			element.style.visibility = assembly > 0.98 ? 'visible' : 'hidden';
		for (const element of host.querySelectorAll<HTMLElement>('[data-parcel-token]'))
			element.style.transform = `translateX(${dispatch * 100}%)`;
		for (const element of host.querySelectorAll<HTMLElement>('[data-delivery-mark]'))
			element.style.visibility = dispatch >= 1 ? 'visible' : 'hidden';
	}
	function shown(area: string, id: string) {
		if (area === 'repeat') return snapshot.input.quantity > 1;
		if (area === 'stock') return (beat >= 2 || overview) && snapshot.materialWaitDays === 0;
		if (area === 'instructions') return (beat >= 2 || overview) && snapshot.input.instructions;
		if (area === 'protection') return (beat >= 3 || overview) && snapshot.input.protectivePackaging;
		if (id.includes('guide-shoulder')) return snapshot.input.cuttingGuide;
		if (['material', 'assembly', 'fixes'].includes(area)) return beat >= 2 || overview;
		if (['packing', 'parcel', 'customer'].includes(area)) return beat >= 3 || overview;
		return true;
	}
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Only controlled, committed Anatomy geometry. No user text or URL input becomes markup. -->
<div
	class="bott-scene"
	class:scene-overview={overview}
	data-area={selected}
	data-maker-capture
	bind:this={host}
>
	<div class="bott-figure-caption">
		<span>FIG. 01 / THE REPEATABLE WORKSHOP</span><span
			>{snapshot.input.quantity.toLocaleString('en-GB')}
			{snapshot.input.quantity === 1 ? 'stand' : 'stands'} · one maker</span
		>
	</div>
	<svg class="iso-plate iso-svg bott-workshop bott-scene-desktop" viewBox="0 0 1100 650" role="img">
		<title>A wooden phone stand on an expanding fitted workbench</title>
		<desc
			>The same three-piece stand stays at the centre. A cutting guide, stock drawer, assembly tray
			and packing wing expose the work around it. The customer-side shelf shows that sending and
			arriving are different concerns. {snapshot.materialWaitDays
				? 'The empty stock drawer means five working days of waiting before production.'
				: 'Stock is available for this batch.'}</desc
		>
		{#each geometry.parts as part (part.id)}
			{#if shown(part.area, part.id)}
				<g
					aria-hidden="true"
					data-workshop-part={part.id}
					data-motion-piece={part.piece === 'back' || part.piece === 'lip' ? part.piece : undefined}
					data-dx={part.move[0]}
					data-dy={part.move[1]}
					data-phone={part.area === 'phone' ? '' : undefined}
					style:visibility={part.area === 'phone' && initialAssembly < 0.98 ? 'hidden' : 'visible'}
					class:is-selected={part.area === selected ||
						(selected === 'cutting' && part.area === 'stand')}
					class:is-choice={(snapshot.input.cuttingGuide && part.id.includes('guide')) ||
						(snapshot.input.instructions && part.area === 'instructions') ||
						(snapshot.input.protectivePackaging && part.area === 'protection')}
					transform={`translate(${(1 - initialAssembly) * part.move[0]} ${(1 - initialAssembly) * part.move[1]})`}
					>{@html part.svg}</g
				>
			{/if}
		{/each}
		{#if (beat >= 3 || overview) && snapshot.deliveryProblems > 0}<g
				class="bott-problem-mark"
				aria-hidden="true"
				transform={`translate(${geometry.markers.customer[0]} ${geometry.markers.customer[1]})`}
				><path d="M0 -9L8 0L0 9L-8 0Z" /></g
			>{/if}
	</svg>
	<svg
		class="iso-plate iso-svg bott-workshop bott-scene-phone"
		viewBox={geometry.crops[selected]}
		role="img"
	>
		<title
			>Close view of the {selected === 'material'
				? 'material stock drawer'
				: `${selected} area`}</title
		>
		<desc
			>This phone view enlarges the selected work area. The controls below inspect each area. {snapshot
				.input.quantity} stands are accounted for in the counted-bundle summary.</desc
		>
		{#each geometry.parts as part (part.id)}
			{#if shown(part.area, part.id)}
				<g
					aria-hidden="true"
					data-motion-piece={part.piece === 'back' || part.piece === 'lip' ? part.piece : undefined}
					data-dx={part.move[0]}
					data-dy={part.move[1]}
					data-phone={part.area === 'phone' ? '' : undefined}
					data-workshop-part={part.id}
					style:visibility={part.area === 'phone' && initialAssembly < 0.98 ? 'hidden' : 'visible'}
					class:is-selected={part.area === selected ||
						(selected === 'cutting' && part.area === 'stand')}
					transform={`translate(${(1 - initialAssembly) * part.move[0]} ${(1 - initialAssembly) * part.move[1]})`}
					>{@html part.svg}</g
				>
			{/if}
		{/each}
	</svg>
	<div class="bott-mobile-overview" aria-hidden="true">
		<svg class="bott-workshop" viewBox="0 0 1100 650"
			>{#each geometry.parts as part (part.id)}{#if shown(part.area, part.id)}<g
						class:is-selected={part.area === selected}>{@html part.svg}</g
					>{/if}{/each}</svg
		><span>Whole bench · {selected} selected</span>
	</div>
	{#if differences && snapshot.input.quantity > 1}
		<div class="bott-fit-overlay">
			<strong>THE SLOT, CLOSE UP</strong>
			<svg viewBox="0 0 220 76" aria-hidden="true"
				><path d="M12 62V14H66V62H56V26H22V62Z" /><path d="M88 62V14H142V62H128V26H100V62Z" /><path
					d="M164 62V14H208V62H201V26H174V62Z"
				/></svg
			>
			<span
				>{snapshot.input.cuttingGuide
					? 'A shared guide gives the cuts a common reference.'
					: 'Too loose. Snug. Too tight. Repeating the shape does not guarantee the same fit.'} Illustrated
				differences, not measured dimensions.</span
			>
		</div>
	{/if}
	{#if beat >= 2 || overview}
		<div class="bott-stock-strip">
			<span
				>{snapshot.materialWaitDays
					? 'EMPTY RACK → MATERIAL ARRIVES'
					: 'MATERIAL ALREADY HERE'}</span
			>
			<div aria-hidden="true">
				{#each [1, 2, 3, 4, 5] as day (day)}<i class:waiting={snapshot.materialWaitDays > 0}
						>{snapshot.materialWaitDays ? day : '✓'}</i
					>{/each}
			</div>
			<span>{snapshot.materialWaitDays} working days before production</span>
		</div>
	{/if}
	{#if beat >= 3 || overview}<div class="bott-dispatch">
			<span>PACKED HERE</span>
			<div class="bott-dispatch-track" aria-hidden="true">
				<i data-parcel-token
					><svg viewBox="0 0 30 27" aria-hidden="true"
						><path d="M3 9L15 3L27 9L15 15Z" /><path d="M3 9V21L15 27V15Z" /><path
							d="M15 15L27 9V21L15 27Z"
						/></svg
					></i
				>
			</div>
			<span>CUSTOMER SHELF</span><strong data-delivery-mark style="visibility:hidden"
				>◇ {snapshot.deliveryProblems} illustrative concerns</strong
			><small>Compressed journey · transport duration is outside the model</small>
		</div>{/if}
	<p class="bott-scene-account">
		{snapshot.input.quantity === 1
			? 'Three shaped pieces hold a phone upright while someone works.'
			: `One familiar stand; ${snapshot.input.quantity.toLocaleString('en-GB')} promises to keep. The small row represents counted bundles, not every individual object.`}
		{beat >= 3 || overview
			? `Customer-side problems: ${snapshot.deliveryProblems} under this fixed illustrative rule. A diamond marker means a delivery concern, separate from workshop fixes.`
			: ''}
	</p>
</div>
