<script lang="ts">
	import { onMount } from 'svelte';
	import geometry from '$lib/visualizations/between-a-click-and-a-page/geometry.json';
	import type { Area, JourneySnapshot } from '$lib/visualizations/between-a-click-and-a-page/model';
	let {
		snapshot,
		selected = 'address',
		overview = false
	}: { snapshot: JourneySnapshot; selected?: Area; overview?: boolean } = $props();
	let host: HTMLDivElement;
	let phone = $state(false);
	onMount(() => {
		const query = matchMedia('(max-width: 700px)');
		const resize = () => {
			phone = query.matches;
		};
		resize();
		query.addEventListener('change', resize);
		return () => query.removeEventListener('change', resize);
	});
	function partVisible(id: string, current: JourneySnapshot) {
		if (id.startsWith('buffer.card-')) {
			const segment = current.segments[Number(id.split('-').at(-1))];
			return !!segment && ['buffered', 'delivered'].includes(segment.state);
		}
		if (id === 'browser.page') return current.pageProgress > 0;
		if (id === 'browser.page-title') return current.pageProgress >= 0.1;
		if (id === 'browser.page-image') return current.pageProgress >= 0.8;
		if (id.startsWith('browser.page-copy-'))
			return current.pageProgress >= 0.2 + Number(id.split('-').at(-1)) * 0.1;
		return true;
	}
	function buffered(id: string, current: JourneySnapshot) {
		return (
			id.startsWith('buffer.card-') &&
			current.segments[Number(id.split('-').at(-1))]?.state === 'buffered'
		);
	}
	export function present(current: JourneySnapshot) {
		if (!host) return;
		const request = host.querySelector<SVGGElement>('[data-net-request]');
		if (request) {
			request.style.visibility = current.stage.id === 'request' ? 'visible' : 'hidden';
			const [from, to] = geometry.requestPath;
			request.setAttribute(
				'transform',
				`translate(${from[0] + (to[0] - from[0]) * current.stageProgress} ${from[1] + (to[1] - from[1]) * current.stageProgress})`
			);
		}
		for (const token of host.querySelectorAll<SVGGElement>('[data-net-token]')) {
			const segment = current.segments[Number(token.dataset.netToken)];
			const visible = segment && ['travelling', 'retransmitting'].includes(segment.state);
			token.style.visibility = visible ? 'visible' : 'hidden';
			if (!visible) continue;
			// Constant travel speed preserves the spacing set by serialization. The
			// viewing clock already slows the model by 24×; easing each tile would bunch them.
			const share = segment.travelProgress;
			const [from, to] = geometry.responsePath;
			token.setAttribute(
				'transform',
				`translate(${from[0] + (to[0] - from[0]) * share} ${from[1] + (to[1] - from[1]) * share})`
			);
		}
		for (const part of host.querySelectorAll<SVGGElement>('[data-net-part]')) {
			const id = part.dataset.netPart ?? '';
			part.style.visibility = partVisible(id, current) ? 'visible' : 'hidden';
			part.classList.toggle('is-buffered', buffered(id, current));
		}
	}
	$effect(() => {
		present(snapshot);
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Geometry is committed build output from the vendored Anatomy kit, never reader-supplied markup. -->
<div class="net-figure iso" data-network-capture data-selected={selected} bind:this={host}>
	<div class="net-figure-top">
		<span>FIG. 01 / THE REQUEST BENCH</span><span>HTTP/1.1 · TLS 1.3 · TCP/IP</span>
	</div>
	<div class="net-scene-wrap">
		<svg
			class="iso-plate iso-svg net-scene"
			class:net-scene-mobile={phone}
			class:net-scene-desktop={!phone}
			viewBox={phone && !overview
				? geometry.crops[selected]
				: `0 0 ${geometry.width} ${geometry.height}`}
			role="img"
		>
			<title>A dispatch and reassembly instrument for a web request</title><desc
				>An address index, paired connection couplings, transport tracks, four receiving trays, a
				server rack and a browser document easel share one fitted bench. The emphasized mechanism is {selected}.
				The physical apparatus is a teaching metaphor, not literal network equipment.</desc
			>
			{#each geometry.parts as part (part.id)}<g
					data-net-part={part.id}
					class:is-selected={part.area === selected}
					class:is-buffered={buffered(part.id, snapshot)}
					style:visibility={partVisible(part.id, snapshot) ? 'visible' : 'hidden'}
					aria-hidden="true">{@html part.svg}</g
				>{/each}
			{#each [0, 1, 2, 3] as index (index)}<g
					class="net-token"
					data-net-token={index}
					aria-hidden="true"
					style="visibility:hidden">{@html geometry.token.svg}</g
				>{/each}
			<g class="net-token" data-net-request aria-hidden="true" style="visibility:hidden"
				>{@html geometry.token.svg}</g
			>
			{#each geometry.parts.filter((part) => geometry.tokenOccluderIds.includes(part.id) || part.id === 'transport.front-guide-0') as part (part.id)}<g
					class:is-selected={part.area === selected}
					aria-hidden="true">{@html part.svg}</g
				>{/each}
		</svg>
	</div>
	<div class="net-figure-bottom">
		<span>Inspect a mechanism · follow the exchange</span><span>SIMULATED / NO LIVE TRAFFIC</span>
	</div>
</div>
