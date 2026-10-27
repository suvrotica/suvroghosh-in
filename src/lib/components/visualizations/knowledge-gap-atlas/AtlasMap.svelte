<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { AnalysisResult } from '$lib/visualizations/knowledge-gap-atlas/types';
	import {
		mapLayout,
		mapLabels,
		mapConnections,
		focusConnections,
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
	const layout = $derived(
		mapLayout(result, density, topic, pins, {
			selected,
			focused,
			search,
			maxTopics: size.width < 480 ? 4 : size.width < 760 ? 8 : 12
		})
	);
	const nodeMap = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
	const highlight = $derived(selected || hovered);
	const baseConnections = $derived(mapConnections(result.edges, layout.nodes));
	const connections = $derived(focusConnections(baseConnections, highlight));
	const edges = $derived(connections.edges);
	const neighbours = $derived(
		new Set(
			result.edges
				.filter((e) => e.source === highlight || e.target === highlight)
				.flatMap((e) => [e.source, e.target])
		)
	);
	function topicTextColour(colour: string, background: string, ink: string) {
		const luminance = (hex: string) => {
			const channels = [1, 3, 5].map((offset) => {
				const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
				return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
			});
			return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
		};
		const foreground = luminance(colour),
			paper = luminance(background);
		const contrast = (Math.max(foreground, paper) + 0.05) / (Math.min(foreground, paper) + 0.05);
		return contrast >= 4.5 ? colour : ink;
	}
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
		const scale = Math.min(size.width / 1000, size.height / 660);
		let nearest,
			distance = Infinity;
		for (const node of layout.nodes) {
			const candidate = Math.hypot(node.x - p.x, node.y - p.y);
			if (candidate < Math.max(node.r + 4, 9 / (scale * zoom)) && candidate < distance) {
				nearest = node;
				distance = candidate;
			}
		}
		return nearest;
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
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}
	function zoomAt(factor: number, x = size.width / 2, y = size.height / 2) {
		const scale = Math.min(size.width / 1000, size.height / 660);
		const next = Math.max(0.45, Math.min(12, zoom * factor));
		const ratio = next / zoom;
		pan = {
			x: ((x - size.width / 2) / scale) * (1 - ratio) + pan.x * ratio,
			y: ((y - size.height / 2) / scale) * (1 - ratio) + pan.y * ratio
		};
		zoom = next;
	}
	function wheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		const rect = canvas.getBoundingClientRect();
		zoomAt(
			Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.01),
			event.clientX - rect.left,
			event.clientY - rect.top
		);
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
		const measure = canvas?.getContext('2d');
		measure?.save();
		const labels = mapLabels(
			layout,
			(text, size, weight) => {
				if (!measure) return Array.from(text).length * size * 0.55;
				measure.font = `${weight} ${size}px Arial, sans-serif`;
				return measure.measureText(text).width;
			},
			{ highlight: selected, focused, pins, search }
		)
			.map(
				(label) =>
					`<text x="${label.x}" y="${label.y + label.fontSize}" fill="${label.kind === 'topic' ? topicTextColour(label.colour, bg, ink) : ink}" stroke="${bg}" stroke-width="3" paint-order="stroke" font-family="Arial,sans-serif" font-size="${label.fontSize}" font-weight="${label.weight}">${escapeXml(label.text)}</text>`
			)
			.join('');
		const nodes = layout.nodes
			.map(
				(n) =>
					`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.colour}"><title>${escapeXml(n.label)}</title></circle>`
			)
			.join('');
		measure?.restore();
		downloadBlob(
			new Blob(
				[
					`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="980" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="${bg}"/><text x="30" y="35" fill="${ink}" font-family="Georgia,serif" font-size="20">Knowledge Gap Atlas</text>${circles}${lines}${nodes}${labels}<text x="30" y="685" fill="${ink}" font-family="Arial,sans-serif" font-size="10">${layout.nodes.length} / ${result.concepts.length} concepts · ${layout.islands.length} / ${result.topics.length} topics · ${edges.length} / ${connections.total} visible-node connections · Co-occurrence, not causality · suvroghosh.in</text></svg>`
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
		if (
			canvas.width !== Math.round(size.width * dpr) ||
			canvas.height !== Math.round(size.height * dpr)
		) {
			canvas.width = Math.round(size.width * dpr);
			canvas.height = Math.round(size.height * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.globalAlpha = 1;
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
		}
		const labels = mapLabels(
			layout,
			(text, size, weight) => {
				ctx.font = `${weight} ${size}px Arial, sans-serif`;
				return ctx.measureText(text).width;
			},
			{
				scale,
				zoom,
				highlight,
				focused,
				pins,
				search,
				bounds: {
					x: 500 + ((18 - size.width / 2) / scale - pan.x) / zoom,
					y: 330 + ((65 - size.height / 2) / scale - pan.y) / zoom,
					width: (size.width - 36) / (scale * zoom),
					height: (size.height - 115) / (scale * zoom)
				}
			}
		);
		for (const label of labels) {
			const node = nodeMap.get(label.id);
			ctx.font = `${label.weight} ${label.fontSize}px Arial, sans-serif`;
			ctx.globalAlpha =
				label.kind === 'topic' || label.id === highlight || focused.includes(label.id)
					? 1
					: highlight && !neighbours.has(label.id)
						? 0.35
						: search && !node?.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())
							? 0.35
							: 1;
			ctx.strokeStyle = bg;
			ctx.lineWidth = 4 / (scale * zoom);
			ctx.lineJoin = 'round';
			ctx.strokeText(label.text, label.x, label.y + label.fontSize);
			ctx.fillStyle = label.kind === 'topic' ? topicTextColour(label.colour, bg, ink) : ink;
			ctx.fillText(label.text, label.x, label.y + label.fontSize);
		}
		ctx.globalAlpha = 1;
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
	$effect(() => {
		void result;
		void topic;
		void density;
		void search;
		reset();
	});
	$effect(() => {
		const requested = selected ? [selected] : focused;
		const points = layout.nodes.filter((node) => requested.includes(node.id));
		const scale = Math.min(size.width / 1000, size.height / 660);
		if (!points.length) return;
		// A newly selected concept may be outside a panned/zoomed viewport. Reveal it,
		// while leaving manual camera movement alone until the selection/layout changes.
		untrack(() => {
			const visible = points.every((node) => {
				const x = size.width / 2 + scale * (pan.x + (node.x - 500) * zoom);
				const y = size.height / 2 + scale * (pan.y + (node.y - 330) * zoom);
				return x > 35 && x < size.width - 35 && y > 70 && y < size.height - 55;
			});
			if (visible) return;
			const left = Math.min(...points.map((node) => node.x)),
				right = Math.max(...points.map((node) => node.x));
			const top = Math.min(...points.map((node) => node.y)),
				bottom = Math.max(...points.map((node) => node.y));
			zoom = Math.max(
				0.45,
				Math.min(
					zoom,
					(size.width - 80) / (scale * (right - left + 100)),
					(size.height - 140) / (scale * (bottom - top + 100))
				)
			);
			pan = { x: (500 - (left + right) / 2) * zoom, y: (330 - (top + bottom) / 2) * zoom };
		});
	});
	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			size = { width: entry.contentRect.width, height: entry.contentRect.height };
		});
		observer.observe(host);
		canvas.addEventListener('wheel', wheel, { passive: false });
		return () => {
			observer.disconnect();
			canvas.removeEventListener('wheel', wheel);
		};
	});
</script>

<div class="kga-map-host" bind:this={host} data-testid="atlas-map">
	<canvas
		bind:this={canvas}
		aria-label={`Topic map showing ${layout.nodes.length} of ${result.concepts.length} concepts. Use the Concepts view for keyboard-accessible exploration.`}
		title={nodeMap.get(hovered)?.label.slice(0, 512) ??
			'Drag to pan. Hold Ctrl or Command and scroll to zoom. Select a concept to inspect its evidence.'}
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
	<div class="kga-map-count">
		{layout.nodes.length.toLocaleString()} / {result.concepts.length.toLocaleString()} concepts<br
		/>{layout.islands.length} / {result.topics.length} topics{#if layout.searchMatches}
			· {layout.visibleMatches} / {layout.searchMatches} matches{/if}
	</div>
	<div class="kga-map-navigation">
		<button aria-label="Zoom out" onclick={() => zoomAt(1 / 1.25)}>−</button><button
			onclick={reset}
			aria-label="Fit map">↗↙</button
		><button aria-label="Zoom in" onclick={() => zoomAt(1.25)}>+</button>
	</div>
	<div class="kga-map-key">
		<span
			title={`${edges.length.toLocaleString()} of ${connections.total.toLocaleString()} connections between the visible concepts. Select a concept to reveal all its connections to other visible concepts.`}
			><i></i>
			{edges.length < connections.total
				? `${edges.length.toLocaleString()} / ${connections.total.toLocaleString()} strongest links`
				: 'observed together'}</span
		>{#if focused.length > 1}<span><i class="dashed"></i> investigate a connection</span>{/if}<span
			class="kga-map-hint">Drag · Ctrl/⌘ scroll to zoom</span
		>
	</div>
</div>
