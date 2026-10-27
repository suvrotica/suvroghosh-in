<script lang="ts">
	import { onMount } from 'svelte';
	import type { AnalysisResult } from '$lib/visualizations/knowledge-gap-atlas/types';
	import {
		mapLayout,
		escapeXml,
		downloadBlob
	} from '$lib/visualizations/knowledge-gap-atlas/layout';
	let {
		result,
		selected = '',
		focused = [],
		topic = null,
		density = 140,
		search = '',
		pins = [],
		dark = false,
		onselect
	}: {
		result: AnalysisResult;
		selected?: string;
		focused?: string[];
		topic?: number | null;
		density?: number;
		search?: string;
		pins?: string[];
		dark?: boolean;
		onselect: (id: string) => void;
	} = $props();
	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let size = $state({ width: 1000, height: 660 });
	let zoom = $state(1);
	let pan = $state({ x: 0, y: 0 });
	let hovered = $state('');
	let unavailable = $state(false);
	let dragging: { x: number; y: number; startX: number; startY: number; moved: boolean } | null =
		null;
	const layout = $derived(mapLayout(result, density, topic, pins, { selected, focused, search }));
	const nodeMap = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
	const edges = $derived(
		result.edges.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
	);
	const highlight = $derived(selected || hovered);
	const neighbours = $derived(
		new Set(
			result.edges
				.filter((e) => e.source === highlight || e.target === highlight)
				.flatMap((e) => [e.source, e.target])
		)
	);
	function coordinates(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		const scale = Math.min(size.width / 1000, size.height / 660);
		return {
			x: ((event.clientX - rect.left - size.width / 2) / scale - pan.x) / zoom + 500,
			y: ((event.clientY - rect.top - size.height / 2) / scale - pan.y) / zoom + 330
		};
	}
	function hit(event: PointerEvent) {
		const p = coordinates(event);
		return layout.nodes.find(
			(n) => Math.hypot(n.x - p.x, n.y - p.y) < Math.max(n.r + 5, 12 / zoom)
		);
	}
	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		dragging = { x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y, moved: false };
		canvas.setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		if (dragging) {
			const scale = Math.min(size.width / 1000, size.height / 660);
			const dx = event.clientX - dragging.x,
				dy = event.clientY - dragging.y;
			if (Math.hypot(dx, dy) > 5) dragging.moved = true;
			if (dragging.moved)
				pan = { x: dragging.startX + dx / scale, y: dragging.startY + dy / scale };
		} else hovered = hit(event)?.id ?? '';
	}
	function pointerUp(event: PointerEvent) {
		if (dragging && !dragging.moved) {
			const node = hit(event);
			if (node) onselect(node.id);
		}
		dragging = null;
	}
	export function reset() {
		zoom = 1;
		pan = { x: 0, y: 0 };
	}
	export function exportPng() {
		canvas?.toBlob((blob) => {
			if (blob) downloadBlob(blob, 'knowledge-gap-atlas.png');
		}, 'image/png');
	}
	export function exportSvg() {
		const bg = dark ? '#152728' : '#f5f4ec',
			ink = dark ? '#e2e7db' : '#243c38';
		const circles = layout.islands
			.map(
				(t) =>
					`<ellipse cx="${t.x}" cy="${t.y}" rx="${t.r + 25}" ry="${(t.r + 25) * 0.82}" fill="${t.colour}" fill-opacity=".06" stroke="${t.colour}" stroke-opacity=".25"/>`
			)
			.join('');
		const lines = edges
			.map((e) => {
				const a = nodeMap.get(e.source)!,
					b = nodeMap.get(e.target)!;
				return `<path d="M${a.x},${a.y} Q${(a.x + b.x) / 2 + 12},${(a.y + b.y) / 2 - 15} ${b.x},${b.y}" fill="none" stroke="${a.colour}" stroke-opacity=".25" stroke-width="${Math.min(3, 0.5 + Math.log1p(e.count) * 0.25)}"/>`;
			})
			.join('');
		const representative = new Set(result.topics.flatMap((t) => t.terms.slice(0, 3)));
		const labelled: { x: number; y: number; w: number }[] = [];
		const measure = canvas?.getContext('2d');
		measure?.save();
		const nodeLabels: string[] = [];
		const nodes = layout.nodes
			.map((n) => {
				const active = n.id === selected;
				const wanted =
					active ||
					focused.includes(n.id) ||
					pins.includes(n.id) ||
					representative.has(n.id) ||
					zoom > 1.65 ||
					Boolean(search && n.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
				const fontSize = active ? 13 : 11;
				if (measure) measure.font = `${active ? '600' : '400'} ${fontSize}px Arial, sans-serif`;
				const w = measure?.measureText(n.label).width ?? Array.from(n.label).length * 6.5;
				const x = n.x + n.r + 5,
					y = n.y + 4;
				const show =
					wanted &&
					(active || !labelled.some((r) => Math.abs(r.y - y) < 14 && x < r.x + r.w && x + w > r.x));
				if (show) {
					labelled.push({ x, y, w });
					nodeLabels.push(
						`<text x="${x}" y="${y}" fill="${ink}" stroke="${bg}" stroke-width="3" paint-order="stroke" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${active ? 600 : 400}">${escapeXml(n.label)}</text>`
					);
				}
				return `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.colour}"><title>${escapeXml(n.label)}</title></circle>`;
			})
			.join('');
		measure?.restore();
		const labels = layout.islands
			.map(
				(t) =>
					`<text x="${t.x}" y="${t.y - t.r - 31}" text-anchor="middle" fill="${t.colour}" font-family="Arial,sans-serif" font-size="13" font-weight="bold">${escapeXml(t.label)}</text>`
			)
			.join('');
		downloadBlob(
			new Blob(
				[
					`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="980" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="${bg}"/><text x="30" y="35" fill="${ink}" font-family="Georgia,serif" font-size="20">Knowledge Gap Atlas</text>${circles}${lines}${nodes}${nodeLabels.join('')}${labels}<text x="30" y="685" fill="${ink}" font-family="Arial,sans-serif" font-size="10">${layout.nodes.length} of ${result.concepts.length} analysed concepts · Co-occurrence, not causality · suvroghosh.in</text></svg>`
				],
				{ type: 'image/svg+xml' }
			),
			'knowledge-gap-atlas.svg'
		);
	}
	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			unavailable = true;
			return;
		}
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = size.width * dpr;
		canvas.height = size.height * dpr;
		ctx.scale(dpr, dpr);
		const bg = dark ? '#152728' : '#f5f4ec';
		const ink = dark ? '#e2e7db' : '#243c38';
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, size.width, size.height);
		ctx.fillStyle = dark ? '#ffffff0e' : '#314e3814';
		for (let x = 16; x < size.width; x += 24)
			for (let y = 16; y < size.height; y += 24) {
				ctx.beginPath();
				ctx.arc(x, y, 0.7, 0, Math.PI * 2);
				ctx.fill();
			}
		const scale = Math.min(size.width / 1000, size.height / 660);
		ctx.translate(size.width / 2, size.height / 2);
		ctx.scale(scale, scale);
		ctx.translate(pan.x, pan.y);
		ctx.scale(zoom, zoom);
		ctx.translate(-500, -330);
		for (const island of layout.islands) {
			for (let ring = 3; ring >= 0; ring--) {
				ctx.beginPath();
				ctx.ellipse(
					island.x,
					island.y,
					island.r + ring * 8,
					(island.r + ring * 8) * 0.82,
					-0.15,
					0,
					Math.PI * 2
				);
				ctx.strokeStyle = island.colour + (dark ? '38' : '25');
				ctx.lineWidth = 0.65;
				ctx.stroke();
				if (ring === 0) {
					ctx.fillStyle = island.colour + '0b';
					ctx.fill();
				}
			}
		}
		for (const e of edges) {
			const a = nodeMap.get(e.source)!,
				b = nodeMap.get(e.target)!;
			const active = highlight && (e.source === highlight || e.target === highlight);
			ctx.globalAlpha = highlight ? (active ? 0.8 : 0.055) : 0.14;
			ctx.strokeStyle = active ? ink : a.colour;
			ctx.lineWidth = active ? 1.8 : Math.min(2, 0.4 + Math.log1p(e.count) * 0.22);
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.quadraticCurveTo((a.x + b.x) / 2 + 12, (a.y + b.y) / 2 - 15, b.x, b.y);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		if (focused.length > 1) {
			const a = nodeMap.get(focused[0]),
				b = nodeMap.get(focused[1]);
			if (a && b) {
				ctx.strokeStyle = dark ? '#e3b184' : '#aa5939';
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 6]);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 80, b.x, b.y);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
		const labelled: { x: number; y: number; w: number }[] = [];
		const labelPaints: { text: string; x: number; y: number; font: string; alpha: number }[] = [];
		const representative = new Set(result.topics.flatMap((t) => t.terms.slice(0, 3)));
		for (const n of layout.nodes) {
			const active = n.id === highlight;
			const match = search && n.label.toLowerCase().includes(search.toLowerCase());
			ctx.globalAlpha =
				active || focused.includes(n.id)
					? 1
					: highlight && !neighbours.has(n.id)
						? 0.25
						: search && !match
							? 0.25
							: 1;
			if (active || focused.includes(n.id) || pins.includes(n.id)) {
				ctx.beginPath();
				ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
				ctx.strokeStyle = n.colour;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
			ctx.fillStyle = n.colour;
			ctx.fill();
			ctx.strokeStyle = bg;
			ctx.lineWidth = 1.5;
			ctx.stroke();
			if (
				active ||
				match ||
				representative.has(n.id) ||
				zoom > 1.65 ||
				focused.includes(n.id) ||
				pins.includes(n.id)
			) {
				const text = n.label;
				ctx.font = `${active ? '600' : '400'} ${Math.max(active ? 13 : 11, 10 / (scale * zoom))}px Arial, sans-serif`;
				const w = ctx.measureText(text).width;
				const x = n.x + n.r + 5,
					y = n.y + 4;
				if (
					active ||
					match ||
					!labelled.some((r) => Math.abs(r.y - y) < 14 && x < r.x + r.w && x + w > r.x)
				) {
					labelPaints.push({ text, x, y, font: ctx.font, alpha: ctx.globalAlpha });
					labelled.push({ x, y, w });
				}
			}
		}
		for (const label of labelPaints) {
			ctx.font = label.font;
			ctx.globalAlpha = label.alpha;
			ctx.strokeStyle = bg;
			ctx.lineWidth = 4;
			ctx.lineJoin = 'round';
			ctx.strokeText(label.text, label.x, label.y);
			ctx.fillStyle = ink;
			ctx.fillText(label.text, label.x, label.y);
		}
		ctx.globalAlpha = 1;
		for (const t of layout.islands) {
			ctx.font = '600 13px Arial, sans-serif';
			ctx.textAlign = 'center';
			ctx.strokeStyle = bg;
			ctx.lineWidth = 5;
			ctx.strokeText(t.label.toLocaleUpperCase(), t.x, t.y - t.r - 23);
			ctx.fillStyle = dark ? '#bbcbbd' : t.colour;
			ctx.fillText(t.label.toLocaleUpperCase(), t.x, t.y - t.r - 23);
			ctx.textAlign = 'left';
		}
	}
	$effect(() => {
		void layout;
		void edges;
		void selected;
		void hovered;
		void focused;
		void search;
		void zoom;
		void pan;
		void size;
		void dark;
		draw();
	});
	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			size = { width: entry.contentRect.width, height: entry.contentRect.height };
		});
		observer.observe(host);
		return () => observer.disconnect();
	});
</script>

<div class="kga-map-host" bind:this={host} data-testid="atlas-map">
	<canvas
		bind:this={canvas}
		aria-label={`Topic map showing ${layout.nodes.length} of ${result.concepts.length} concepts. Use the Concepts view for keyboard-accessible exploration.`}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={() => (dragging = null)}
		onpointerleave={() => (hovered = '')}
		style:cursor={hovered ? 'pointer' : 'grab'}
	></canvas>
	{#if unavailable}<p class="kga-canvas-fallback">
			Map drawing is unavailable. All topics, evidence and findings are available in the Concepts
			view.
		</p>{/if}
	<div class="kga-map-caption">
		<span class="kga-live-dot"></span>
		{topic === null
			? 'THE SHAPE OF YOUR MATERIAL'
			: layout.outsideTopic
				? 'TOPIC + SELECTED CONNECTIONS'
				: 'TOPIC IN FOCUS'}
	</div>
	<div class="kga-map-count">{layout.nodes.length} / {result.concepts.length} concepts visible</div>
	<div class="kga-map-navigation">
		<button aria-label="Zoom out" onclick={() => (zoom = Math.max(0.45, zoom / 1.25))}>−</button
		><button onclick={reset} aria-label="Fit map">↗↙</button><button
			aria-label="Zoom in"
			onclick={() => (zoom = Math.min(4, zoom * 1.25))}>+</button
		>
	</div>
	<div class="kga-map-key">
		<span><i></i> observed together</span>{#if focused.length > 1}<span
				><i class="dashed"></i> investigate a connection</span
			>{/if}<span class="kga-map-hint">Drag to explore · Select a concept</span>
	</div>
</div>
