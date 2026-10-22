<script lang="ts">
	import geometry from '$lib/visualizations/the-six-week-shadow/geometry.json';
	import {
		shadowBands,
		type Schedule,
		type TaskId
	} from '$lib/visualizations/the-six-week-shadow/model';
	let {
		schedule,
		changed,
		selected = 'A',
		emphasis = 'all',
		beat = 4,
		replayDay = null,
		still = true,
		onselect = () => {}
	}: {
		schedule: Schedule;
		changed: boolean;
		selected?: string;
		emphasis?: 'all' | 'work' | 'wait';
		beat?: number;
		replayDay?: number | null;
		still?: boolean;
		onselect?: (id: TaskId) => void;
	} = $props();
	const bands = $derived(shadowBands(schedule));
	let replayMarker: SVGPathElement;
	export function renderReplayMarker(day: number) {
		if (replayMarker) replayMarker.setAttribute('transform', `translate(${20 + day * 19} 0)`);
	}
	const areaTasks: Record<string, string[]> = {
		drawing: ['A'],
		lamp: ['A'],
		sample: ['B'],
		supplier: ['C', 'D'],
		production: ['E', 'F', 'G'],
		packing: ['H'],
		documents: ['I'],
		support: ['J']
	};
	const revealAt: Record<string, number> = {
		drawing: 0,
		lamp: 0,
		sample: 1,
		supplier: 2,
		production: 2,
		documents: 3,
		support: 3,
		packing: 4
	};
	const pins: { id: TaskId; name: string; x: number; y: number }[] = [
		{ id: 'A', name: 'Drawing', x: 22, y: 76 },
		{ id: 'B', name: 'Sample', x: 43, y: 40 },
		{ id: 'C', name: 'Supplier', x: 53, y: 49 },
		{ id: 'E', name: 'Fixture', x: 67, y: 61 },
		{ id: 'I', name: 'References', x: 39, y: 68 },
		{ id: 'H', name: 'Packing', x: 61, y: 81 }
	];
	function dimmed(area: string) {
		if (emphasis === 'all' || !areaTasks[area]) return false;
		return !schedule.tasks.some((t) => areaTasks[area].includes(t.id) && t.kind === emphasis);
	}
	function activity(area: string) {
		if (replayDay === null) return '';
		const tasks = schedule.tasks.filter((t) => areaTasks[area]?.includes(t.id));
		if (tasks.some((t) => replayDay! >= t.start && replayDay! < t.finish)) return 'active';
		if (tasks.length && tasks.every((t) => replayDay! >= t.finish)) return 'complete';
		return 'pending';
	}
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Trusted, committed geometry from the vendored MIT Anatomy kit. No reader-controlled markup. -->
<div class="shadow-scene" class:is-still={still}>
	<div class="shadow-machine iso iso-plate" data-lamp-changed={changed}>
		<svg
			class="iso-svg shadow-desktop-scene"
			viewBox={`0 0 ${geometry.width} ${geometry.height}`}
			role="img"
			aria-labelledby="shadow-scene-title shadow-scene-desc"
		>
			<title id="shadow-scene-title">A small lamp change reaches a foldout workshop</title>
			<desc id="shadow-scene-desc"
				>The lamp stays the same size beside its drawing, sample bench, supplier crate, production
				fixture, parallel reference shelf and packing parcel. {changed
					? `The proposed change takes ${schedule.elapsedWorkingDays} elapsed working days and ${schedule.activeEffortPersonDays} person-days of active effort in this fictional scenario.`
					: 'The button is on the shade. No change project is proposed.'} The separate ruler below uses
				a fixed scale; it is a time metaphor, not a cast light shadow.</desc
			>
			{#each geometry.parts as part (part.id)}
				{#if (part.area !== 'old-button' || !changed) && (part.area !== 'base-button' || changed)}
					<g
						data-area={part.area}
						data-activity={activity(part.area)}
						class:scene-selected={areaTasks[part.area]?.includes(selected)}
						class:scene-dimmed={dimmed(part.area)}
						class:scene-unrevealed={changed && (revealAt[part.area] ?? 0) > beat}
						class:scene-unneeded={!changed &&
							!['lamp', 'drawing', 'stage', 'old-button'].includes(part.area)}
						class:scene-outside-context={changed &&
							!!areaTasks[part.area] &&
							!schedule.tasks.some((t) => areaTasks[part.area].includes(t.id))}>{@html part.svg}</g
					>
				{/if}
			{/each}
		</svg>
		<svg
			class="iso-svg shadow-phone-lamp"
			viewBox="300 20 180 230"
			role="img"
			aria-label={changed
				? 'Fictional lamp with the moved button on its base'
				: 'Fictional lamp with its button on the shade'}
		>
			<title>The same lamp, at a readable size</title><desc
				>The phone view brings the lamp forward. Consequences continue in the vertical task journey
				below, using the same schedule.</desc
			>
			{#each geometry.parts.filter( (p) => ['lamp', 'old-button', 'base-button'].includes(p.area) ) as part (part.id)}
				{#if (part.area !== 'old-button' || !changed) && (part.area !== 'base-button' || changed)}<g
						>{@html part.svg}</g
					>{/if}
			{/each}
		</svg>
		<div class="shadow-drawing-caption">
			<span>01 / THE SAME LAMP</span><strong
				>{changed ? 'Button on the base' : 'Button on the shade'}</strong
			><span>A fictional teaching object</span>
		</div>
		{#if changed}
			<div class="shadow-scene-pins" aria-label="Inspect physical work areas">
				{#each pins as pin (pin.id)}<button
						type="button"
						style={`left:${pin.x}%;top:${pin.y}%`}
						class:chosen={selected === pin.id}
						aria-label={`Inspect ${pin.name.toLowerCase()}`}
						aria-pressed={selected === pin.id}
						onclick={() => onselect(pin.id)}>{pin.id}<span>{pin.name}</span></button
					>{/each}
			</div>
		{/if}
	</div>
	<div class="shadow-time-ruler" data-elapsed={schedule.elapsedWorkingDays}>
		<div class="shadow-ruler-heading">
			<span>THE TIME SHADOW</span><strong
				>{changed ? `${schedule.elapsedWorkingDays} working days` : 'No change proposed'}</strong
			><span>Fixed scale · 1 division = 1 working day</span>
		</div>
		<svg
			viewBox="0 0 1000 105"
			role="img"
			aria-label={changed
				? `A ${schedule.elapsedWorkingDays}-day ruler. Solid bands mean work and hatched bands mean waiting.`
				: 'An empty change-project ruler. No change is proposed.'}
		>
			<defs
				><pattern id="shadow-wait-hatch" patternUnits="userSpaceOnUse" width="8" height="8"
					><path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" class="shadow-hatch" /></pattern
				></defs
			>
			<rect x="20" y="18" width="950" height="38" rx="2" class="shadow-ruler-track" />
			{#each bands as band (band.id)}
				<g class:shadow-band-muted={emphasis !== 'all' && emphasis !== band.kind}>
					<rect
						x={20 + band.start * 19}
						y="18"
						width={band.durationWorkingDays * 19}
						height="38"
						class:shadow-work-band={band.kind === 'work'}
						class:shadow-wait-band={band.kind === 'wait'}
					/>
					{#if band.kind === 'wait'}<rect
							x={20 + band.start * 19}
							y="18"
							width={band.durationWorkingDays * 19}
							height="38"
							fill="url(#shadow-wait-hatch)"
						/>{/if}
					{#if band.durationWorkingDays > 1}<text
							x={20 + (band.start + band.durationWorkingDays / 2) * 19}
							y="43"
							class:shadow-work-letter={band.kind === 'work'}>{band.id}</text
						>{/if}
				</g>
			{/each}
			{#each Array.from({ length: 51 }, (_, i) => i) as day (day)}<path
					d={`M${20 + day * 19} 56v${day % 5 === 0 ? 12 : 5}`}
					class="shadow-ruler-tick"
				/>{#if day % 5 === 0}<text x={20 + day * 19} y="91">{day}</text>{/if}{/each}
			<path
				bind:this={replayMarker}
				d="M0 10v52"
				transform="translate(20 0)"
				visibility={replayDay !== null && changed ? 'visible' : 'hidden'}
				class="shadow-replay-marker"
			/>
		</svg>
		<div class="shadow-ruler-key">
			<span><i class="key-work"></i> Work on the path to release</span><span
				><i class="key-wait"></i> Waiting for a slot</span
			><span>Parallel cards add effort beside the ruler.</span>
		</div>
	</div>
</div>
