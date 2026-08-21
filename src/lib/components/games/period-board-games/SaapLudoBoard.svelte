<script lang="ts">
	import {
		TRANSPORTS,
		squareCenter,
		squareToGrid,
		type Transport
	} from '$lib/games/period-board-games/snakes/board';
	import type { SnakesState } from '$lib/games/period-board-games/snakes/types';

	let {
		state,
		animatedCounter = null
	}: {
		state: SnakesState;
		animatedCounter?: { playerId: string; position?: number; x?: number; y?: number } | null;
	} = $props();

	const squares = Array.from({ length: 100 }, (_, index) => index + 1);
	const snakeColors = [
		'#C54435',
		'#326797',
		'#34804A',
		'#CA8178',
		'#87664f',
		'#70A7A0',
		'#b75d43',
		'#496f56'
	];

	function ladderGeometry(transport: Transport) {
		const from = squareCenter(transport.from);
		const to = squareCenter(transport.to);
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const length = Math.hypot(dx, dy);
		const nx = (-dy / length) * 1.15;
		const ny = (dx / length) * 1.15;
		const rungCount = Math.max(4, Math.round(length / 6));
		return {
			left: { x1: from.x + nx, y1: from.y + ny, x2: to.x + nx, y2: to.y + ny },
			right: { x1: from.x - nx, y1: from.y - ny, x2: to.x - nx, y2: to.y - ny },
			rungs: Array.from({ length: rungCount }, (_, index) => {
				const progress = (index + 0.65) / (rungCount + 0.25);
				const jitter = index % 2 === 0 ? 0.18 : -0.16;
				return {
					x1: from.x + dx * progress + nx + jitter,
					y1: from.y + dy * progress + ny,
					x2: from.x + dx * progress - nx - jitter,
					y2: from.y + dy * progress - ny
				};
			})
		};
	}

	function snakeGeometry(transport: Transport, index: number) {
		const head = squareCenter(transport.from);
		const tail = squareCenter(transport.to);
		const dx = tail.x - head.x;
		const dy = tail.y - head.y;
		const side = index % 2 === 0 ? 1 : -1;
		const bend = (4.5 + (index % 3) * 1.2) * side;
		const first = { x: head.x + dx * 0.28 + bend, y: head.y + dy * 0.24 };
		const second = { x: head.x + dx * 0.64 - bend, y: head.y + dy * 0.7 };
		return {
			head,
			tail,
			path: `M ${head.x} ${head.y} C ${first.x} ${first.y}, ${head.x + dx * 0.34 - bend} ${head.y + dy * 0.42}, ${head.x + dx * 0.5} ${head.y + dy * 0.5} S ${second.x} ${second.y}, ${tail.x} ${tail.y}`,
			angle: Math.atan2(dy, dx) * (180 / Math.PI)
		};
	}

	function displayPosition(playerId: string, logical: number) {
		return animatedCounter?.playerId === playerId && animatedCounter.position !== undefined
			? animatedCounter.position
			: logical;
	}

	function counterLayout() {
		const groups: Record<number, string[]> = {};
		for (const counter of state.counters) {
			const position = displayPosition(counter.playerId, counter.position);
			groups[position] = [...(groups[position] ?? []), counter.id];
		}
		const offsets = [
			[-1.45, -1.1],
			[1.45, -1.1],
			[-1.45, 1.2],
			[1.45, 1.2]
		];
		return state.counters.flatMap((counter) => {
			const position = displayPosition(counter.playerId, counter.position);
			if (
				animatedCounter?.playerId === counter.playerId &&
				animatedCounter.x !== undefined &&
				animatedCounter.y !== undefined
			) {
				return { counter, position, x: animatedCounter.x, y: animatedCounter.y };
			}
			if (position === 0) return [];
			const center = squareCenter(position);
			const group = groups[position];
			const offset = group.length === 1 ? [0, 0] : offsets[group.indexOf(counter.id)];
			return { counter, position, x: center.x + offset[0], y: center.y + offset[1] };
		});
	}

	function counterMark(playerId: string) {
		const marks = ['১', '২', '৩', '৪'];
		return marks[
			Math.max(
				0,
				state.players.findIndex((player) => player.id === playerId)
			)
		];
	}

	let laidOutCounters = $derived(counterLayout());
	let offboardCounters = $derived(
		state.counters.filter(
			(counter) =>
				displayPosition(counter.playerId, counter.position) === 0 &&
				!(
					animatedCounter?.playerId === counter.playerId &&
					animatedCounter.x !== undefined &&
					animatedCounter.y !== undefined
				)
		)
	);
</script>

<div class="board-frame">
	<div
		class="snakes-board"
		data-testid="saap-ludo-board"
		role="img"
		aria-labelledby="snakes-board-title snakes-board-desc"
	>
		<span id="snakes-board-title" class="sr-only">A fixed one hundred square Saap-Ludo board</span>
		<span id="snakes-board-desc" class="sr-only">
			Square 1 is lower left and square 100 upper left. The numbered rows alternate direction. Eight
			ladders climb and eight snakes descend at the listed fixed endpoints.
		</span>

		<div class="grid" aria-hidden="true">
			{#each squares as square (square)}
				{@const coordinate = squareToGrid(square)}
				<div
					class={`cell shade-${(coordinate.row * 3 + coordinate.column * 2) % 5}`}
					style={`grid-row:${coordinate.row + 1};grid-column:${coordinate.column + 1}`}
				>
					<span>{square}</span>
				</div>
			{/each}
		</div>

		<svg class="transports" viewBox="0 0 100 100" aria-hidden="true">
			<defs>
				<pattern id="saap-perimeter-ornament" width="8" height="1.5" patternUnits="userSpaceOnUse">
					<path d="M.4.75L1.4.15l1 .6-1 .6Z" fill="none" stroke="#2B241F" stroke-width=".18" />
					<path d="M3.1.75Q4.1 0 5.1.75Q4.1 1.5 3.1.75Z" fill="#2B241F" />
					<circle cx="6.5" cy=".75" r=".28" fill="#2B241F" />
				</pattern>
			</defs>
			<g class="perimeter-ornament">
				<rect x=".8" y=".8" width="98.4" height="1.5" />
				<rect x=".8" y="97.7" width="98.4" height="1.5" />
				<g transform="rotate(90 50 50)">
					<rect x=".8" y=".8" width="98.4" height="1.5" />
					<rect x=".8" y="97.7" width="98.4" height="1.5" />
				</g>
			</g>
			{#each TRANSPORTS.filter((transport) => transport.type === 'ladder') as ladder (`${ladder.from}-${ladder.to}`)}
				{@const geometry = ladderGeometry(ladder)}
				<g class="ladder">
					<line {...geometry.left} />
					<line {...geometry.right} />
					{#each geometry.rungs as rung (`${rung.x1}-${rung.y1}-${rung.x2}-${rung.y2}`)}
						<line {...rung} />
					{/each}
				</g>
			{/each}

			{#each TRANSPORTS.filter((transport) => transport.type === 'snake') as snake, index (`${snake.from}-${snake.to}`)}
				{@const geometry = snakeGeometry(snake, index)}
				<g class="snake">
					<path class="snake-outline" d={geometry.path} />
					<path class="snake-body" d={geometry.path} stroke={snakeColors[index]} />
					<g
						transform={`translate(${geometry.head.x} ${geometry.head.y}) rotate(${geometry.angle - 90})`}
					>
						<ellipse
							rx="2.5"
							ry="3.2"
							fill={snakeColors[index]}
							stroke="#2B241F"
							stroke-width=".6"
						/>
						<circle cx="-.85" cy="-1" r=".52" fill="#efe4be" stroke="#2B241F" stroke-width=".25" />
						<circle cx=".85" cy="-1" r=".52" fill="#efe4be" stroke="#2B241F" stroke-width=".25" />
						<circle cx="-.85" cy="-1" r=".19" fill="#2B241F" />
						<circle cx=".85" cy="-1" r=".19" fill="#2B241F" />
						<path
							d="M0 -3.1v-2m0 2l-1 -1m1 1l1 -1"
							fill="none"
							stroke="#8b2d2b"
							stroke-width=".4"
						/>
					</g>
					<path
						d={`M ${geometry.head.x} ${geometry.head.y + 4} l -1.2 2.1 M ${geometry.head.x} ${geometry.head.y + 4} l 1.2 2.1`}
						fill="none"
						stroke="#2B241F"
						stroke-width=".45"
					/>
				</g>
			{/each}
		</svg>

		<div class="fold" aria-hidden="true"></div>

		<div class="counters" aria-hidden="true">
			{#each laidOutCounters as item (item.counter.id)}
				<div
					class={`counter ${item.counter.color}`}
					style={`--counter-x:${item.x};--counter-y:${item.y}`}
				>
					<span>{counterMark(item.counter.playerId)}</span>
				</div>
			{/each}
		</div>
	</div>
	{#if offboardCounters.length > 0}
		<div class="offboard-tray" aria-hidden="true">
			<span class="offboard-label">OFF BOARD / <span lang="bn">বাইরে</span></span>
			<div class="offboard-pieces">
				{#each offboardCounters as counter (counter.id)}
					<div class={`counter offboard ${counter.color}`}>
						<span>{counterMark(counter.playerId)}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<div class="sr-only">
	<h3>Counter positions</h3>
	<ul>
		{#each state.counters as counter (counter.id)}
			<li>
				{state.players.find((player) => player.id === counter.playerId)?.name}, {counter.color}
				counter, {counter.position === 0 ? 'off the board' : `square ${counter.position}`}.
			</li>
		{/each}
	</ul>
	<h3>Snakes and ladders</h3>
	<ul>
		{#each TRANSPORTS as transport (`${transport.type}-${transport.from}-${transport.to}`)}
			<li>{transport.type} from {transport.from} to {transport.to}</li>
		{/each}
	</ul>
</div>

<style>
	.board-frame {
		position: relative;
		padding: clamp(0.38rem, 1.4vw, 0.78rem);
		border: 2px solid #5e5343;
		border-radius: 0.38rem;
		background:
			repeating-linear-gradient(90deg, transparent 0 29px, rgb(255 255 255 / 0.035) 30px), #80745d;
		box-shadow:
			0 0.55rem 1.2rem rgb(19 13 9 / 0.34),
			inset 0 1px rgb(255 255 255 / 0.2);
	}

	.offboard-tray {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
		padding: 0.35rem 0.2rem 0;
		color: #2b241f;
	}

	.offboard-label {
		padding: 0.2rem 0.35rem;
		border: 1px solid rgb(43 36 31 / 0.45);
		background: #e4d3a7;
		color: #2b241f;
		font-family: var(--font-sans);
		font-size: clamp(0.56rem, 1.8cqi, 0.72rem);
		font-weight: 850;
		letter-spacing: 0.08em;
	}

	.offboard-pieces {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.snakes-board {
		position: relative;
		container-type: inline-size;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid #2b241f;
		border-radius: 0.15rem;
		background: #e4d3a7;
	}

	.grid {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template: repeat(10, 1fr) / repeat(10, 1fr);
	}

	.cell {
		position: relative;
		border: 0.7px solid rgb(43 36 31 / 0.78);
		box-shadow: inset 0 0 0 0.45px rgb(255 255 255 / 0.15);
	}

	.cell span {
		position: absolute;
		z-index: 5;
		top: 4%;
		left: 7%;
		padding: 0 0.08em;
		background: rgb(238 225 188 / 0.88);
		color: #2b241f;
		font-family: var(--font-mono);
		font-size: clamp(0.66rem, 2.8cqi, 0.88rem);
		font-weight: 800;
		line-height: 1;
	}

	.shade-0 {
		background: #dfd0a7;
	}
	.shade-1 {
		background: #ca8178;
	}
	.shade-2 {
		background: #70a7a0;
	}
	.shade-3 {
		background: #d8ad32;
	}
	.shade-4 {
		background: #9ebc88;
	}

	.transports {
		position: absolute;
		z-index: 2;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.ladder line {
		stroke: #4c3828;
		stroke-width: 1.5;
		stroke-linecap: round;
		filter: drop-shadow(0.25px 0.35px 0 #c8aa6b);
		vector-effect: non-scaling-stroke;
	}

	.perimeter-ornament {
		fill: url('#saap-perimeter-ornament');
		opacity: 0.52;
		pointer-events: none;
	}

	.snake-outline,
	.snake-body {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.snake-outline {
		stroke: #2b241f;
		stroke-width: 4.8;
	}
	.snake-body {
		stroke-width: 3.3;
		stroke-dasharray: 6 1.5 2 1.5;
	}

	.fold {
		position: absolute;
		z-index: 3;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1.2%;
		transform: translateX(-50%);
		background: linear-gradient(
			90deg,
			transparent,
			rgb(65 52 39 / 0.16),
			rgb(255 248 219 / 0.22),
			transparent
		);
		pointer-events: none;
	}

	.counters {
		position: absolute;
		z-index: 6;
		inset: 0;
		pointer-events: none;
	}

	.counter {
		--counter-color: #333;
		position: absolute;
		left: calc(var(--counter-x) * 1%);
		top: calc(var(--counter-y) * 1%);
		display: grid;
		width: clamp(0.9rem, 4.7cqi, 2rem);
		aspect-ratio: 1;
		place-items: center;
		border: 1.4px solid #241d19;
		border-radius: 50%;
		background:
			repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 0.18) 4px 5px),
			var(--counter-color);
		box-shadow:
			0 2px 1px rgb(37 27 20 / 0.35),
			inset 1px 1px rgb(255 255 255 / 0.25);
		color: #fff8df;
		font-size: clamp(0.42rem, 1.7cqi, 0.68rem);
		font-weight: 900;
		text-shadow: 0 1px #211;
		transform: translate(-50%, -50%);
	}

	.counter.offboard {
		position: relative;
		left: auto;
		top: auto;
		width: clamp(1.35rem, 4.7cqi, 2rem);
		transform: none;
	}

	.counter::after {
		position: absolute;
		inset: 18%;
		border: 1px solid rgb(43 36 31 / 0.55);
		border-radius: 50%;
		content: '';
	}

	.counter.green {
		--counter-color: #34804a;
	}
	.counter.yellow {
		--counter-color: #d8ad32;
		color: #241d19;
		text-shadow: none;
	}
	.counter.blue {
		--counter-color: #326797;
	}
	.counter.red {
		--counter-color: #c54435;
	}

	@media (forced-colors: active) {
		.counter {
			forced-color-adjust: none;
			outline: 2px solid CanvasText;
		}
	}
</style>
