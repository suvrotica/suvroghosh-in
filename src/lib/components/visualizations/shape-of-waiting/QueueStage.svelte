<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Person, Settings, Snapshot } from '$lib/visualizations/shape-of-waiting/types';
	import {
		ageColour,
		pathLengths,
		pointOnPath,
		queuePath,
		ticketLabel
	} from '$lib/visualizations/shape-of-waiting/drawing';

	let {
		snapshot,
		settings,
		selected = null,
		onselect,
		label = 'Live queue',
		compact = false
	}: {
		snapshot: Snapshot;
		settings: Settings;
		selected?: number | null;
		onselect: (id: number) => void;
		label?: string;
		compact?: boolean;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let surface = $state<HTMLDivElement>();
	let width = $state(760);
	let height = $state(470);
	let hits: { x: number; y: number; person: Person }[] = [];
	const drawLimit = $derived(width < 450 ? 125 : 250);
	const aggregated = $derived(snapshot.waiting.length > drawLimit);
	const currentIndex = $derived(snapshot.waiting.findIndex((person) => person.id === selected));
	const selectedWaiting = $derived(currentIndex >= 0 ? snapshot.waiting[currentIndex] : null);
	const age = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} min`);

	function selectRelative(direction: number) {
		if (!snapshot.waiting.length) return;
		const index =
			currentIndex < 0
				? direction > 0
					? 0
					: snapshot.waiting.length - 1
				: currentIndex + direction;
		onselect(snapshot.waiting[(index + snapshot.waiting.length) % snapshot.waiting.length].id);
	}

	function selectCanvas(event: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		let nearest: (typeof hits)[number] | null = null;
		let distance = 22;
		for (const hit of hits) {
			const candidate = Math.hypot(hit.x - x, hit.y - y);
			if (candidate < distance) {
				distance = candidate;
				nearest = hit;
			}
		}
		if (nearest) onselect(nearest.person.id);
	}

	function drawMark(
		context: CanvasRenderingContext2D,
		person: Person,
		x: number,
		y: number,
		radius: number
	) {
		context.fillStyle = ageColour(person.wait);
		context.strokeStyle = '#f7f3e9';
		context.lineWidth = 1.3;
		context.beginPath();
		if (person.classId === 2) {
			context.moveTo(x, y - radius - 1);
			context.lineTo(x + radius + 1, y);
			context.lineTo(x, y + radius + 1);
			context.lineTo(x - radius - 1, y);
			context.closePath();
		} else if (person.classId === 1) {
			context.roundRect(x - radius, y - radius, radius * 2, radius * 2, 1.5);
		} else {
			context.arc(x, y, radius, 0, Math.PI * 2);
		}
		context.fill();
		context.stroke();
		if (person.id === selected || person.id === snapshot.oldest?.id) {
			context.beginPath();
			context.strokeStyle = person.id === selected ? '#23352f' : '#b9513e';
			context.lineWidth = person.id === selected ? 2 : 1.5;
			context.arc(x, y, radius + 4, 0, Math.PI * 2);
			context.stroke();
		}
	}

	function draw() {
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const density = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * density);
		canvas.height = Math.round(height * density);
		context.setTransform(density, 0, 0, density, 0, 0);
		context.clearRect(0, 0, width, height);
		const points = queuePath(width, height);
		const distances = pathLengths(points);
		const pathLength = distances[distances.length - 1];
		context.strokeStyle = '#d9d9c9';
		context.lineWidth = 1;
		context.setLineDash([2, 5]);
		context.beginPath();
		points.forEach((point, index) =>
			index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
		);
		context.stroke();
		context.setLineDash([]);

		// Sampling preserves queue order; the oldest and selected people are always individual marks.
		const count = snapshot.waiting.length;
		const sampled = new SvelteSet<number>();
		const limit = Math.min(count, drawLimit);
		for (let i = 0; i < limit; i++) sampled.add(Math.floor((i * count) / limit));
		for (const id of [snapshot.oldest?.id, selected]) {
			const index = snapshot.waiting.findIndex((person) => person.id === id);
			if (index >= 0) sampled.add(index);
		}
		const occupiedLength = Math.min(pathLength, Math.max(0, count - 1) * 16);
		const radius = count > 150 ? 3.7 : width < 450 ? 4.7 : 5.5;
		hits = [];
		for (const index of [...sampled].sort((a, b) => a - b)) {
			const person = snapshot.waiting[index];
			const point = pointOnPath(
				points,
				distances,
				count > 1 ? (index / (count - 1)) * occupiedLength : 0
			);
			drawMark(context, person, point.x, point.y, radius);
			hits.push({ ...point, person });
		}

		const gateWidth = width < 450 ? 49 : 59;
		const gateX = width - gateWidth - 14;
		context.fillStyle = '#e2e6d9';
		context.beginPath();
		context.roundRect(gateX - 9, 15, gateWidth + 18, height - 30, 8);
		context.fill();
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = '#536653';
		context.font = '600 9px ui-monospace, monospace';
		context.fillText('SERVICE', gateX + gateWidth / 2, 31);
		const serverHeight = Math.min(43, (height - 110) / Math.max(1, settings.servers) - 6);
		const serverStep = (height - 108) / Math.max(1, settings.servers);
		for (let server = 0; server < settings.servers; server++) {
			const y = 68 + server * serverStep;
			const active = snapshot.active.filter((person) => person.server === server);
			context.fillStyle = active.length ? '#263e33' : '#81917b';
			context.beginPath();
			context.roundRect(gateX, y, gateWidth, serverHeight, 4);
			context.fill();
			context.fillStyle = '#f7f3e9';
			context.font = '600 11px ui-monospace, monospace';
			context.fillText(
				String(server + 1).padStart(2, '0'),
				gateX + gateWidth / 2,
				y + serverHeight / 2 - 5
			);
			context.fillStyle = active.length ? '#dcc482' : '#edf0e6';
			context.font = '8px ui-monospace, monospace';
			context.fillText(
				active.length ? (active.length > 1 ? `${active.length} jobs` : 'busy') : 'ready',
				gateX + gateWidth / 2,
				y + serverHeight / 2 + 8
			);
			if (active[0]) {
				const point = { x: gateX - 15, y: y + serverHeight / 2 };
				drawMark(context, active[0], point.x, point.y, 4.5);
				hits.push({ ...point, person: active[0] });
			}
		}
		context.fillStyle = '#536653';
		context.font = '9px ui-monospace, monospace';
		context.textAlign = 'left';
		context.fillText('QUEUE →', width < 450 ? 23 : 34, 24);
		context.font = '9px ui-monospace, monospace';
		context.fillText('ARRIVAL ORDER / POLICY', width < 450 ? 23 : 34, height - 19);
	}

	onMount(() => {
		if (!surface) return;
		const measure = () => {
			if (!surface) return;
			const rect = surface.getBoundingClientRect();
			width = Math.max(240, rect.width);
			height = Math.max(280, rect.height);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(surface);
		return () => observer.disconnect();
	});

	$effect(() => {
		void snapshot;
		void settings;
		void selected;
		void width;
		void height;
		void drawLimit;
		if (canvas) draw();
	});
</script>

<section class:compact class="queue-stage" aria-label={label}>
	<div class="stage-heading">
		<span>{label}</span>
		<span class="clock"
			><span class:finished={snapshot.final} class="live-dot"></span>{snapshot.time.toFixed(1)} simulated
			min</span
		>
	</div>
	<div class="surface" bind:this={surface}>
		<canvas
			bind:this={canvas}
			onclick={selectCanvas}
			onkeydown={(event) => {
				if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
					event.preventDefault();
					selectRelative(event.key === 'ArrowRight' ? 1 : -1);
				} else if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					if (snapshot.oldest) onselect(snapshot.oldest.id);
				}
			}}
			role="button"
			tabindex="0"
			aria-label={`Inspect the queue: ${snapshot.waiting.length} waiting, ${snapshot.active.length} in service across ${settings.servers} counters. Oldest current wait ${age(snapshot.metrics.oldestAge)}. Arrow keys select waiting tickets; Enter follows the oldest.`}
		>
			The queue is rendered here. {snapshot.waiting.length} people are waiting and {snapshot.active
				.length} are in service.
		</canvas>
		<div class="centre">
			<span class="centre-eyebrow"
				>{snapshot.final ? 'THE COHORT HAS RESOLVED' : 'BEHIND THE AVERAGE'}</span
			>
			<strong>{snapshot.waiting.length.toLocaleString()}</strong>
			<span class="centre-label"
				>{snapshot.waiting.length === 1 ? 'person still waiting' : 'people still waiting'}</span
			>
			<div class="centre-rule"></div>
			{#if snapshot.oldest}
				<button
					class="oldest"
					onclick={() => onselect(snapshot.oldest!.id)}
					aria-label={`Follow the oldest, ticket ${ticketLabel(snapshot.oldest.id)}, waiting ${age(snapshot.oldest.wait)}`}
				>
					<span>OLDEST STILL WAITING ↗</span>
					<b>{age(snapshot.oldest.wait)}</b>
					<small>Follow ticket {ticketLabel(snapshot.oldest.id)}</small>
				</button>
			{:else}
				<span class="empty-note"
					>{snapshot.final
						? 'Every arrival has an outcome.'
						: 'The next arrival changes the shape.'}</span
				>
			{/if}
		</div>
	</div>
	<div class="stage-key">
		<div class="age-key">
			<span>WAITING AGE</span>
			<div class="gradient"></div>
			<div class="age-ticks"><span>0</span><span>30</span><span>90</span><span>180+ min</span></div>
		</div>
		<div class="class-key">
			<span><i class="ordinary"></i>Priority 1</span><span><i class="priority"></i>Priority 2</span
			><span><i class="urgent"></i>Priority 3</span>
		</div>
	</div>
	<div class="ticket-controls">
		<span
			>{selectedWaiting
				? `Ticket ${ticketLabel(selectedWaiting.id)} · ${age(selectedWaiting.wait)}`
				: 'Select a mark. Follow a person.'}</span
		>
		<div>
			<button
				onclick={() => selectRelative(-1)}
				disabled={!snapshot.waiting.length}
				aria-label="Select previous person in the waiting queue">←</button
			><button
				onclick={() => selectRelative(1)}
				disabled={!snapshot.waiting.length}
				aria-label="Select next person in the waiting queue">→</button
			>
		</div>
	</div>
	{#if aggregated}<p class="aggregation">
			{Math.min(snapshot.waiting.length, drawLimit)} sampled marks represent {snapshot.waiting.length.toLocaleString()}
			waiting people. The oldest and selected ticket are always shown individually. All counts remain
			exact.
		</p>{/if}
</section>

<style>
	.queue-stage {
		min-width: 0;
		color: #23352f;
	}
	.stage-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0 0 0.8rem;
		font:
			600 0.68rem/1.4 ui-monospace,
			SFMono-Regular,
			monospace;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.clock {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		font-weight: 400;
		letter-spacing: 0;
		text-align: right;
	}
	.live-dot {
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #b9513e;
	}
	.live-dot.finished {
		background: #287f79;
	}
	.surface {
		position: relative;
		height: clamp(340px, 36vw, 420px);
		min-height: 0;
		overflow: hidden;
		border: 1px solid #cbd0bf;
		border-radius: 4px;
		background: radial-gradient(ellipse at 45% 46%, #fcfaf4 0, #f3f1e6 65%, #ebeede 100%);
		isolation: isolate;
	}
	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}
	canvas:focus-visible {
		outline: 2px solid #b9513e;
		outline-offset: -5px;
	}
	.centre {
		position: absolute;
		left: 44%;
		top: 51%;
		width: 47%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		flex-direction: column;
		text-align: center;
		pointer-events: none;
	}
	.centre-eyebrow {
		font:
			600 0.58rem/1.3 ui-monospace,
			SFMono-Regular,
			monospace;
		letter-spacing: 0.16em;
		color: #53624d;
	}
	.centre strong {
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 400;
		font-size: clamp(4.2rem, 8.2vw, 7.1rem);
		line-height: 1.08;
		letter-spacing: -0.065em;
		font-variant-numeric: tabular-nums;
		margin: 0.25rem 0 0.1rem;
	}
	.centre-label {
		font-size: 0.85rem;
		line-height: 1.3;
	}
	.centre-rule {
		width: 32px;
		border-top: 1px solid #b7beab;
		margin: 1rem 0 0.8rem;
	}
	.oldest {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		border: 0;
		background: transparent;
		padding: 0 0.35rem 0.3rem;
		color: #8f3f30;
		cursor: pointer;
		pointer-events: auto;
	}
	.oldest span {
		font:
			600 0.56rem/1.3 ui-monospace,
			SFMono-Regular,
			monospace;
		letter-spacing: 0.08em;
	}
	.oldest b {
		font-size: 1.55rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 400;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.oldest small {
		font:
			400 0.6rem/1.3 ui-monospace,
			SFMono-Regular,
			monospace;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.oldest:hover {
		color: #5f252b;
	}
	.oldest:focus-visible,
	.ticket-controls button:focus-visible {
		outline: 2px solid #b9513e;
		outline-offset: 5px;
	}
	.empty-note {
		font-size: 0.74rem;
		color: #53624d;
		line-height: 1.5;
		max-width: 160px;
	}
	.stage-key {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 1rem;
		margin-top: 0.8rem;
	}
	.age-key {
		width: 218px;
		max-width: 48%;
		font:
			500 0.55rem/1.5 ui-monospace,
			SFMono-Regular,
			monospace;
		letter-spacing: 0.05em;
	}
	.gradient {
		height: 5px;
		margin-top: 0.32rem;
		background: linear-gradient(90deg, #287f79 0%, #c49c4d 16.67%, #b9513e 50%, #6e2432 100%);
		border-radius: 4px;
	}
	.age-ticks {
		display: flex;
		justify-content: space-between;
		margin-top: 0.18rem;
		font-size: 0.55rem;
		font-weight: 400;
		letter-spacing: 0;
	}
	.class-key {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		padding-bottom: 0.2rem;
		font:
			400 0.57rem/1.4 ui-monospace,
			SFMono-Regular,
			monospace;
	}
	.class-key span {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.class-key i {
		display: block;
		width: 6px;
		height: 6px;
		background: #536653;
	}
	.ordinary {
		border-radius: 50%;
	}
	.urgent {
		transform: rotate(45deg);
	}
	.ticket-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.7rem;
		border-top: 1px solid #d0d4c6;
		padding-top: 0.7rem;
		font:
			400 0.66rem/1.4 ui-monospace,
			SFMono-Regular,
			monospace;
		color: #52604d;
	}
	.ticket-controls div {
		display: flex;
		gap: 0.4rem;
	}
	.ticket-controls button {
		width: 32px;
		height: 30px;
		border: 1px solid #bdc5b4;
		border-radius: 2px;
		color: #23352f;
		background: transparent;
		cursor: pointer;
	}
	.ticket-controls button:hover {
		background: #e2e6d9;
	}
	.ticket-controls button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.aggregation {
		font:
			400 0.64rem/1.55 ui-monospace,
			SFMono-Regular,
			monospace;
		margin: 0.7rem 0 0;
		color: #53624d;
	}
	.compact .surface {
		height: 320px;
	}
	.compact .centre-eyebrow {
		display: none;
	}
	.compact .centre strong {
		font-size: 3.5rem;
		line-height: 1;
		margin: 0.1rem 0;
	}
	.compact .centre-label {
		font-size: 0.72rem;
	}
	.compact .centre-rule {
		margin: 0.4rem 0;
	}
	.compact .oldest {
		gap: 0.2rem;
	}
	.compact .oldest b {
		font-size: 1.25rem;
	}
	.compact .oldest span {
		font-size: 0.5rem;
	}
	.compact .oldest small {
		font-size: 0.55rem;
	}
	.compact .stage-key {
		align-items: start;
	}
	.compact .class-key {
		gap: 0.5rem;
	}
	@media (max-width: 520px) {
		.surface {
			height: 360px;
		}
		.stage-heading {
			font-size: 0.59rem;
			gap: 0.4rem;
		}
		.clock {
			font-size: 0.56rem;
		}
		.centre {
			left: 43%;
			width: 47%;
			top: 50%;
		}
		.centre-eyebrow {
			font-size: 0.47rem;
			letter-spacing: 0.09em;
		}
		.centre strong {
			font-size: 4.9rem;
		}
		.centre-label {
			font-size: 0.72rem;
		}
		.centre-rule {
			margin: 0.8rem 0;
		}
		.oldest b {
			font-size: 1.4rem;
		}
		.oldest span {
			font-size: 0.48rem;
		}
		.stage-key {
			gap: 0.6rem;
		}
		.class-key {
			gap: 0.45rem;
			font-size: 0.5rem;
		}
		.class-key i {
			width: 5px;
			height: 5px;
		}
		.ticket-controls {
			font-size: 0.58rem;
		}
		.compact .surface {
			height: 340px;
		}
	}
</style>
