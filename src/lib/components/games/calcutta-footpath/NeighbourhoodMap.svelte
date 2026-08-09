<script lang="ts">
	import {
		CALCUTTA_SPATIAL_WORLD,
		CALCUTTA_WORLD_BOUNDS,
		edgePolyline
	} from '$lib/games/calcutta-footpath/spatial-world';

	type Props = {
		open: boolean;
		player: { x: number; z: number; heading: number } | undefined;
		visitedEdges: readonly string[];
		onclose: () => void;
	};

	let { open, player, visitedEdges, onclose }: Props = $props();
	let closeButton = $state<HTMLButtonElement>();
	const padding = 9;
	const viewWidth = 360;
	const viewHeight = 270;

	function mapX(x: number): number {
		return (
			padding +
			((x - CALCUTTA_WORLD_BOUNDS.minX) / CALCUTTA_WORLD_BOUNDS.widthM) * (viewWidth - padding * 2)
		);
	}

	function mapY(z: number): number {
		return (
			viewHeight -
			padding -
			((z - CALCUTTA_WORLD_BOUNDS.minZ) / CALCUTTA_WORLD_BOUNDS.depthM) * (viewHeight - padding * 2)
		);
	}

	function edgePoints(edgeId: string): string {
		const edge = CALCUTTA_SPATIAL_WORLD.edges.find((candidate) => candidate.id === edgeId);
		if (!edge) return '';
		return edgePolyline(edge)
			.map((point) => `${mapX(point.x)},${mapY(point.z)}`)
			.join(' ');
	}

	const destination = CALCUTTA_SPATIAL_WORLD.nodes.find(
		(node) => node.id === CALCUTTA_SPATIAL_WORLD.destinationNodeId
	)!;

	$effect(() => {
		if (!open) return;
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onclose();
			} else if (event.key === 'Tab') {
				// The map has one interactive control, so keep modal focus on it.
				event.preventDefault();
				closeButton?.focus({ preventScroll: true });
			}
		};
		window.addEventListener('keydown', handleKeydown);
		requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if open}
	<div class="map-layer">
		<div class="map-panel" role="dialog" aria-modal="true" aria-labelledby="map-title">
			<header>
				<div>
					<p>Neighbourhood map</p>
					<h2 id="map-title">Where am I going?</h2>
				</div>
				<button bind:this={closeButton} type="button" onclick={onclose}>Close map</button>
			</header>

			<svg
				viewBox={`0 0 ${viewWidth} ${viewHeight}`}
				role="img"
				aria-label="Street map showing your location and destination"
			>
				<rect width={viewWidth} height={viewHeight} rx="10" class="paper"></rect>
				{#each CALCUTTA_SPATIAL_WORLD.edges as edge (edge.id)}
					<polyline
						class:visited={visitedEdges.includes(edge.id)}
						class:wider={edge.archetype === 'wider-road'}
						class="street"
						points={edgePoints(edge.id)}
					></polyline>
				{/each}

				{#each CALCUTTA_SPATIAL_WORLD.landmarks.filter((item) => item.visibleOnMinimap) as landmark (landmark.id)}
					<circle
						cx={mapX(landmark.position.x)}
						cy={mapY(landmark.position.z)}
						r="2.5"
						class="landmark"
					></circle>
				{/each}

				<circle
					cx={mapX(destination.position.x)}
					cy={mapY(destination.position.z)}
					r="6"
					class="destination"
				></circle>
				<text
					x={mapX(destination.position.x) - 4}
					y={mapY(destination.position.z) - 9}
					text-anchor="end">DESTINATION</text
				>

				{#if player}
					<circle cx={mapX(player.x)} cy={mapY(player.z)} r="6" class="player"></circle>
					<line
						x1={mapX(player.x)}
						y1={mapY(player.z)}
						x2={mapX(player.x) + Math.sin(player.heading) * 12}
						y2={mapY(player.z) - Math.cos(player.heading) * 12}
						class="direction"
					></line>
					<text x={mapX(player.x) + 9} y={mapY(player.z) + 16}>YOU ARE HERE</text>
				{/if}
			</svg>

			<p class="map-help">The stronger streets are the ones you have already walked.</p>
		</div>
	</div>
{/if}

<style>
	.map-layer {
		position: absolute;
		z-index: 44;
		inset: 0;
		background: rgb(0 0 0 / 18%);
	}

	.map-panel {
		position: absolute;
		z-index: 1;
		top: max(4.2rem, calc(env(safe-area-inset-top) + 3.5rem));
		left: max(0.75rem, env(safe-area-inset-left));
		width: min(28rem, calc(100% - 1.5rem));
		border: 1px solid rgb(244 226 187 / 38%);
		border-radius: 0.8rem;
		background: rgb(24 21 17 / 94%);
		padding: 0.8rem;
		box-shadow: 0 1rem 3rem rgb(0 0 0 / 42%);
		color: #f8ecd6;
		font-family: var(--font-sans, system-ui, sans-serif);
		backdrop-filter: blur(12px);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.65rem;
	}

	header p,
	header h2 {
		margin: 0;
	}
	header p {
		color: #bbaa8f;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}
	header h2 {
		margin-top: 0.1rem;
		font-size: 1rem;
	}

	button {
		min-height: 2.6rem;
		border: 1px solid rgb(244 226 187 / 40%);
		border-radius: 0.5rem;
		background: #342b23;
		padding: 0.45rem 0.7rem;
		color: #fff5e3;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.paper {
		fill: #d8c9aa;
	}
	.street {
		fill: none;
		stroke: #6f685a;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.34;
	}
	.street.wider {
		stroke-width: 5;
	}
	.street.visited {
		stroke: #4a4135;
		stroke-width: 3.2;
		opacity: 0.92;
	}
	.street.visited.wider {
		stroke-width: 6.2;
	}
	.landmark {
		fill: #6d644e;
	}
	.destination {
		fill: #9b3e31;
		stroke: #fff3d8;
		stroke-width: 2;
	}
	.player {
		fill: #275f63;
		stroke: #fff3d8;
		stroke-width: 2;
	}
	.direction {
		stroke: #275f63;
		stroke-width: 3;
		stroke-linecap: round;
	}
	text {
		fill: #352c22;
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.map-help {
		margin: 0.55rem 0 0;
		color: #cabb9f;
		font-size: 0.7rem;
	}

	@media (orientation: portrait) and (max-width: 35rem) {
		.map-panel {
			top: auto;
			bottom: max(4.2rem, calc(env(safe-area-inset-bottom) + 3.8rem));
		}
	}

	@media (max-height: 31rem) and (orientation: landscape) {
		.map-panel {
			top: max(0.5rem, env(safe-area-inset-top));
			max-height: calc(100% - max(1rem, env(safe-area-inset-top)) - env(safe-area-inset-bottom));
			overflow: auto;
		}

		svg {
			width: min(100%, 25rem);
			max-height: calc(100vh - 6rem);
		}
	}
</style>
