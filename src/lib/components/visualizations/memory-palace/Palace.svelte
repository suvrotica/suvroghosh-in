<script lang="ts">
	import geometry from '$lib/visualizations/memory-palace/geometry.json';

	let {
		selected = 0,
		occupied = [],
		recall = false,
		onselect,
		routeNumber = 1,
		sceneProp = '',
		sceneVisible = false
	}: {
		selected: number;
		occupied: number[];
		recall?: boolean;
		onselect: (index: number) => void;
		routeNumber?: number;
		sceneProp?: string;
		sceneVisible?: boolean;
	} = $props();
	const locations = geometry.locations;
	let active = $derived(locations[Math.max(0, Math.min(11, selected))]);
	const propKinds: Record<string, string> = {
		seed: 'plant',
		ground: 'plant',
		stream: 'water',
		droplet: 'water',
		rain: 'water',
		sun: 'light',
		music: 'sound',
		wings: 'motion',
		wheel: 'motion',
		animal: 'object'
	};
	let sceneKind = $derived(propKinds[sceneProp] ?? sceneProp);
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Only trusted repository-generated geometry is inserted; learner text never enters SVG markup. -->
<figure
	class="palace-figure"
	aria-label="A fixed route through twelve landmarks in a Calcutta house"
>
	<div class="palace-heading">
		<span class="palace-kicker">Your memory house</span>
		<span class="palace-route">Practice batch {routeNumber} · twelve places</span>
	</div>
	<div class="palace-stage">
		<svg
			class="palace-house"
			viewBox="0 0 {geometry.width} {geometry.height}"
			aria-hidden="true"
			focusable="false"
		>
			<ellipse cx="452" cy="591" rx="275" ry="51" fill="#6b6149" opacity=".07" />
			<!-- Trusted, repository-generated geometry only; learner input never enters markup. -->
			{@html geometry.art}
			<path class="palace-path-under" d={geometry.route} />
			<path class="palace-path" d={geometry.route} />
			{#if sceneVisible && sceneProp}
				<!-- A scene token marks an authored association without placing the answer
				     in the map. Scene descriptions are rendered as text by the runtime. -->
				<g
					class="palace-scene-token"
					transform="translate({active.point[0] + 25} {active.point[1] - 31})"
				>
					<circle r="23" fill="#fff5dc" fill-opacity=".94" stroke="#beac83" stroke-width=".8" />
					{#if sceneKind === 'water'}
						<path
							d="M0-16C-4-8-11-2-11 5a11 11 0 0 0 22 0C11-2 4-8 0-16Z"
							fill="#6c978d"
							stroke="#3d6157"
							stroke-width="1.2"
						/>
						<path
							d="M-6 5Q-6 11 0 12"
							fill="none"
							stroke="#e1eee1"
							stroke-width="2"
							stroke-linecap="round"
						/>
					{:else if sceneKind === 'light'}
						<circle r="8" fill="#d8b86e" stroke="#99763f" stroke-width="1.2" />
						<path
							d="M0-12V-18M0 12V18M12 0H18M-12 0H-18M9-9 13-13M9 9 13 13M-9-9-13-13M-9 9-13 13"
							fill="none"
							stroke="#aa8045"
							stroke-width="2"
							stroke-linecap="round"
						/>
					{:else if sceneKind === 'plant'}
						<path d="M-8 7H8L6 17H-6Z" fill="#ba7b59" stroke="#8b553d" stroke-width="1.2" />
						<path
							d="M0 7V-13M0-4Q-14-14-13-2Q-7 4 0 1M0-9Q10-19 12-9Q7-2 0-4"
							fill="#6a8567"
							stroke="#3e604a"
							stroke-width="1.2"
						/>
					{:else if sceneKind === 'sound'}
						<path
							d="M-10 9Q-7 4-7-4a7 7 0 0 1 14 0Q7 4 10 9Z"
							fill="#d3b271"
							stroke="#80643f"
							stroke-width="1.2"
						/>
						<path
							d="M-3 13a3 3 0 0 0 6 0M-13-6Q-20 0-13 6M13-6Q20 0 13 6M0-14V-11"
							fill="none"
							stroke="#80643f"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					{:else if sceneKind === 'motion'}
						<path
							d="M-14 0a14 14 0 0 1 24-10M14 0A14 14 0 0 1-10 10M4-11 11-10 10-17M-4 11-11 10-10 17"
							fill="none"
							stroke="#567861"
							stroke-width="2.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path d="M-7 0H7M0-7V7" fill="none" stroke="#a97a49" stroke-width="1.4" />
					{:else if sceneKind === 'umbrella'}
						<path
							d="M-17-1a17 17 0 0 1 34 0Q12-6 7-1Q0-6-7-1Q-12-6-17-1Z"
							fill="#b37b56"
							stroke="#80583c"
							stroke-width="1.2"
						/>
						<path
							d="M0-17V12q0 7 6 4M0-17Q-7-10-7-1M0-17Q7-10 7-1"
							fill="none"
							stroke="#80583c"
							stroke-width="1.2"
						/>
					{:else if sceneKind === 'fruit'}
						<path
							d="M0-8C-15-16-19 2-10 12Q-5 18 0 14Q5 18 10 12C19 2 15-16 0-8Z"
							fill="#c48d65"
							stroke="#8b6048"
							stroke-width="1.2"
						/>
						<path
							d="M0-8V-17M0-12Q10-21 11-12Q6-8 0-12"
							fill="#708b68"
							stroke="#4c6b4e"
							stroke-width="1.2"
						/>
					{:else if sceneKind === 'flame'}
						<path
							d="M0-18C5-7 17-2 11 11Q0 23-11 11C-17 1-8-3-9-10Q-5-7-4-2Q2-10 0-18Z"
							fill="#c18350"
							stroke="#9c633c"
							stroke-width="1.2"
						/>
						<path d="M0-2Q10 10 0 15Q-9 9 0-2Z" fill="#efcf7c" />
					{:else if sceneKind === 'clock'}
						<circle r="15" fill="#fff0cf" stroke="#806342" stroke-width="2.5" />
						<path
							d="M0-12V-10M12 0H10M0 12V10M-12 0H-10M0-7V0L6 4"
							fill="none"
							stroke="#4f6251"
							stroke-width="2"
							stroke-linecap="round"
						/>
					{:else if sceneKind === 'key'}
						<circle cx="-7" cy="-7" r="7" fill="#d4b470" stroke="#87683d" stroke-width="1.5" />
						<circle cx="-7" cy="-7" r="3" fill="#fff5dc" />
						<path
							d="M-2-2 14 14M7 7 12 2M11 11 16 6"
							fill="none"
							stroke="#a88244"
							stroke-width="4"
							stroke-linecap="square"
						/>
					{:else if sceneKind === 'cloud'}
						<path
							d="M-13 10C-25 6-17-8-9-5C-7-22 15-18 14-4C28-2 23 12 13 10Z"
							fill="#b4c5b6"
							stroke="#607d69"
							stroke-width="1.3"
						/>
					{:else}
						<path
							d="M0-14 12-7V7L0 14-12 7V-7Z"
							fill="#d3b271"
							stroke="#71603d"
							stroke-width="1.2"
						/>
						<path
							d="M0-14V0L12-7M0 0-12-7M0 0V14"
							fill="none"
							stroke="#fff3cf"
							stroke-width="1.2"
						/>
					{/if}
				</g>
			{/if}
		</svg>
		{#each locations as location, index (location.name)}
			<button
				type="button"
				class="palace-marker"
				class:palace-selected={selected === index}
				class:palace-occupied={occupied.includes(index) && !recall}
				style:left="{(location.point[0] / geometry.width) * 100}%"
				style:top="{(location.point[1] / geometry.height) * 100}%"
				aria-label="Location {index + 1}: {location.name}"
				aria-current={selected === index ? 'step' : undefined}
				disabled={recall}
				title="{index + 1}. {location.name}"
				onclick={() => onselect(index)}
			>
				{index + 1}
				{#if occupied.includes(index) && !recall}<span class="palace-assigned" aria-hidden="true"
					></span>{/if}
			</button>
		{/each}
	</div>
	<figcaption class="palace-caption">
		<span>Select a numbered place. Keep the route familiar.</span>
		<strong>{selected + 1} / 12 · {active.name}</strong>
	</figcaption>
</figure>

<style>
	.palace-figure {
		margin: 0;
		overflow: hidden;
		border: 1px solid #cfc4aa;
		border-radius: 1rem;
		background: #f7f0df;
		color: #34463c;
		box-shadow: inset 0 0 70px #e5d8bc55;
	}
	.palace-heading,
	.palace-caption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1.15rem;
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.palace-heading {
		padding-bottom: 0;
	}
	.palace-kicker {
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.palace-route {
		color: #696653;
	}
	.palace-stage {
		position: relative;
		isolation: isolate;
		width: 100%;
		aspect-ratio: 900 / 680;
	}
	.palace-house {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.palace-path-under,
	.palace-path {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.palace-path-under {
		stroke: #fff8e5;
		stroke-width: 4.2;
		opacity: 0.7;
	}
	.palace-path {
		stroke: #8f7654;
		stroke-width: 1.6;
		stroke-dasharray: 2 6;
		opacity: 0.82;
	}
	.palace-marker {
		position: absolute;
		z-index: 1;
		display: grid;
		place-items: center;
		width: clamp(1.7rem, 4.8vw, 2.1rem);
		height: clamp(1.7rem, 4.8vw, 2.1rem);
		min-width: 0;
		min-height: 0;
		margin: 0;
		padding: 0;
		transform: translate(-50%, -50%);
		border: 1.5px solid #83775d;
		border-radius: 50%;
		background: #fff8e9;
		color: #34463c;
		box-shadow: 0 2px 5px #554a3030;
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		transition:
			background 180ms ease,
			box-shadow 180ms ease,
			border-color 180ms ease;
	}
	.palace-marker:not(:disabled):hover {
		background: #efe2bf;
		border-color: #364c40;
	}
	.palace-marker.palace-selected {
		z-index: 2;
		border: 2px solid #263f33;
		background: #354e3e;
		color: #fff7df;
		box-shadow:
			0 0 0 4px #f7f0dfcc,
			0 0 0 6px #53684a80;
	}
	.palace-marker:focus-visible {
		outline: 3px solid #aa582e;
		outline-offset: 5px;
	}
	.palace-marker:disabled {
		cursor: default;
		opacity: 1;
	}
	.palace-assigned {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 0.44rem;
		height: 0.44rem;
		border: 1.5px solid #fff8e9;
		border-radius: 50%;
		background: #aa633e;
	}
	.palace-caption {
		align-items: baseline;
		border-top: 1px solid #d9ceb5;
		background: #f0e6d180;
		color: #696653;
	}
	.palace-caption strong {
		color: #34463c;
		font-size: 0.77rem;
		white-space: nowrap;
	}
	@media (max-width: 480px) {
		.palace-heading {
			gap: 0.3rem;
			padding: 0.8rem 0.8rem 0;
		}
		.palace-route {
			font-size: 0.67rem;
		}
		.palace-caption {
			flex-direction: column;
			gap: 0.15rem;
			padding: 0.65rem 0.8rem;
			font-size: 0.69rem;
		}
		.palace-marker {
			width: 1.65rem;
			height: 1.65rem;
			font-size: 0.63rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.palace-marker {
			transition: none;
		}
	}
</style>
