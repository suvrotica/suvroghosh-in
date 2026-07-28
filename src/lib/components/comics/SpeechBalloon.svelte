<script lang="ts">
	import type { ComicBalloonTailRoute, ComicDialogue } from '$lib/comics/schema';

	let { dialogue }: { dialogue: ComicDialogue } = $props();

	const percent = (value: number) => Number((value * 100).toFixed(4));
	const rounded = (value: number) => Number(value.toFixed(6));
	const routedTailPath = (route: ComicBalloonTailRoute) => {
		const tangent = {
			x: route.control.x - route.start.x,
			y: route.control.y - route.start.y
		};
		const length = Math.hypot(tangent.x, tangent.y) || 1;
		const halfBase = dialogue.style === 'robot' ? 0.006 : 0.008;
		const perpendicular = {
			x: (-tangent.y / length) * halfBase,
			y: (tangent.x / length) * halfBase
		};
		const first = {
			x: rounded(route.start.x + perpendicular.x),
			y: rounded(route.start.y + perpendicular.y)
		};
		const second = {
			x: rounded(route.start.x - perpendicular.x),
			y: rounded(route.start.y - perpendicular.y)
		};
		return `M ${first.x} ${first.y} Q ${route.control.x} ${route.control.y} ${route.end.x} ${route.end.y} Q ${route.control.x} ${route.control.y} ${second.x} ${second.y} Z`;
	};
	const styleName = $derived(`comic-balloon--${dialogue.style}`);
	const tailName = $derived(`comic-balloon--tail-${dialogue.balloon.tailDirection ?? 'down'}`);
	const safeTailRoute = $derived(
		dialogue.balloon.tailRoute?.safe && dialogue.balloon.tailDirection !== 'none'
			? dialogue.balloon.tailRoute
			: null
	);
	const tailPath = $derived(safeTailRoute ? routedTailPath(safeTailRoute) : '');
	const boxStyle = $derived(
		[
			`--balloon-x:${percent(dialogue.balloon.x)}%`,
			`--balloon-y:${percent(dialogue.balloon.y)}%`,
			`--balloon-width:${percent(dialogue.balloon.width)}%`,
			`--balloon-height:${percent(dialogue.balloon.height)}%`,
			`--balloon-z:${dialogue.balloon.z}`,
			`--balloon-scale:${dialogue.balloon.fontScale ?? 1}`,
			`--balloon-fit:${dialogue.balloon.renderScale ?? 1}`,
			dialogue.balloon.tailTarget
				? `--tail-x:${percent(dialogue.balloon.tailTarget.x)}%;--tail-y:${percent(dialogue.balloon.tailTarget.y)}%`
				: ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

{#if safeTailRoute}
	<svg
		class="comic-balloon__tail-route"
		class:comic-balloon__tail-route--machine={dialogue.style === 'robot' ||
			dialogue.style === 'system'}
		style={`z-index:${dialogue.balloon.z}`}
		viewBox="0 0 1 1"
		preserveAspectRatio="none"
		aria-hidden="true"
		data-routed-tail={dialogue.id}
		data-route-safe={safeTailRoute.safe}
		data-tail-side={safeTailRoute.side}
		data-tail-control-x={safeTailRoute.control.x}
		data-tail-control-y={safeTailRoute.control.y}
		data-tail-end-x={safeTailRoute.end.x}
		data-tail-end-y={safeTailRoute.end.y}
	>
		<path d={tailPath} vector-effect="non-scaling-stroke" />
	</svg>
{/if}

<div
	class="comic-balloon {styleName} {tailName}"
	class:comic-balloon--no-tail={dialogue.balloon.tailDirection === 'none' ||
		Boolean(dialogue.balloon.tailRoute)}
	style={boxStyle}
	aria-hidden="true"
	data-dialogue-id={dialogue.id}
	data-reading-order={dialogue.readingOrder}
>
	<span>
		{#each dialogue.balloon.manualBreaks ?? [dialogue.text] as line, index (index)}
			{line}{#if index < (dialogue.balloon.manualBreaks?.length ?? 1) - 1}<br />{/if}
		{/each}
	</span>
</div>

<style>
	.comic-balloon__tail-route {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.comic-balloon__tail-route path {
		fill: color-mix(in srgb, var(--comic-paper, #fff9e9) 96%, transparent);
		stroke: var(--comic-ink, #1e1a16);
		stroke-width: 2px;
		stroke-linejoin: round;
	}

	.comic-balloon__tail-route--machine path {
		fill: #e7f0f1;
	}

	.comic-balloon {
		position: absolute;
		z-index: var(--balloon-z);
		left: var(--balloon-x);
		top: var(--balloon-y);
		display: grid;
		box-sizing: border-box;
		width: var(--balloon-width);
		height: var(--balloon-height);
		overflow: hidden;
		place-items: center;
		border: clamp(1.5px, 0.18vw, 2.5px) solid var(--comic-ink, #1e1a16);
		border-radius: 50%;
		background: color-mix(in srgb, var(--comic-paper, #fff9e9) 96%, transparent);
		padding: clamp(0.35rem, 1.1vw, 0.8rem);
		color: var(--comic-ink, #1e1a16);
		font-family: Roboto, Arial, sans-serif;
		font-size: max(
			0.55rem,
			calc(clamp(0.64rem, 1.35vw, 1rem) * var(--balloon-scale) * var(--balloon-fit))
		);
		font-weight: 650;
		line-height: 1.14;
		text-align: center;
		text-wrap: balance;
		box-shadow: 0 1px 0 rgb(255 255 255 / 0.7);
	}

	.comic-balloon::after {
		position: absolute;
		left: 50%;
		bottom: -0.75rem;
		width: 1rem;
		height: 1rem;
		transform: translateX(-50%) rotate(45deg);
		border-right: inherit;
		border-bottom: inherit;
		background: inherit;
		content: '';
	}

	.comic-balloon--tail-up::after {
		top: -0.75rem;
		bottom: auto;
		transform: translateX(-50%) rotate(225deg);
	}

	.comic-balloon--tail-left::after {
		top: 50%;
		bottom: auto;
		left: -0.75rem;
		transform: translateY(-50%) rotate(135deg);
	}

	.comic-balloon--tail-right::after {
		top: 50%;
		right: -0.75rem;
		bottom: auto;
		left: auto;
		transform: translateY(-50%) rotate(-45deg);
	}

	.comic-balloon--no-tail::after {
		display: none;
	}

	.comic-balloon--robot,
	.comic-balloon--system {
		border-radius: 0.4rem;
		background: #e7f0f1;
		font-family: 'Courier Prime', ui-monospace, monospace;
		letter-spacing: -0.02em;
	}

	.comic-balloon--robot:not(.comic-balloon--no-tail)::after,
	.comic-balloon--system:not(.comic-balloon--no-tail)::after {
		border-radius: 0;
	}

	.comic-balloon--thought {
		border-style: dotted;
	}

	.comic-balloon--thought::after {
		width: 0.55rem !important;
		height: 0.55rem !important;
		border: inherit !important;
		border-radius: 50% !important;
	}

	.comic-balloon--whisper {
		border-style: dashed;
		font-weight: 500;
	}

	.comic-balloon--off-panel {
		border-radius: 0.35rem;
	}

	@media (forced-colors: active) {
		.comic-balloon__tail-route path {
			fill: Canvas;
			stroke: CanvasText;
		}

		.comic-balloon {
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: auto;
		}
	}
</style>
