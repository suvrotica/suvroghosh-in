<script lang="ts">
	import {
		GREEN_ROUTE,
		HOME_LANES,
		PRINTED_STAR_COORDINATES,
		START_COORDINATES,
		coordinateForPosition,
		pointKey,
		type GridPoint
	} from '$lib/games/period-board-games/ludo/board';
	import { positionDescription } from '$lib/games/period-board-games/ludo/legal';
	import type {
		LudoMove,
		LudoPosition,
		LudoState,
		LudoToken
	} from '$lib/games/period-board-games/ludo/types';
	import { COLOR_SYMBOLS, type PlayerColor } from '$lib/games/period-board-games/shared';

	let {
		state,
		animatedToken = null,
		onmove
	}: {
		state: LudoState;
		animatedToken?: { tokenId: string; position: LudoPosition } | null;
		onmove: (moveId: string) => void;
	} = $props();

	const colors: Record<PlayerColor, string> = {
		green: '#34804A',
		yellow: '#D8AD32',
		blue: '#326797',
		red: '#C54435'
	};

	const homeRegions: { color: PlayerColor; x: number; y: number }[] = [
		{ color: 'green', x: 0, y: 0 },
		{ color: 'yellow', x: 900, y: 0 },
		{ color: 'blue', x: 900, y: 900 },
		{ color: 'red', x: 0, y: 900 }
	];

	const homeLaneCells = Object.entries(HOME_LANES).flatMap(([color, points]) =>
		points.map((point) => ({ color: color as PlayerColor, point }))
	);

	function startingColor(point: GridPoint) {
		return (Object.entries(START_COORDINATES) as [PlayerColor, GridPoint][]).find(
			([, candidate]) => pointKey(candidate) === pointKey(point)
		)?.[0];
	}

	function displayPosition(token: LudoToken) {
		if (animatedToken?.tokenId === token.id) return animatedToken.position;
		return token.position;
	}

	function displayCoordinate(token: LudoToken) {
		if (state.phase === 'token-moving' && state.pendingMove?.capturedTokenIds.includes(token.id)) {
			const mover = state.tokens.find(
				(candidate) => candidate.id === state.pendingMove?.move.tokenId
			);
			if (mover) return coordinateForPosition(mover.color, state.pendingMove.move.to, mover.number);
		}
		return coordinateForPosition(token.color, displayPosition(token), token.number);
	}

	function tokenLayout(tokens: LudoToken[]) {
		const groups: Record<string, string[]> = {};
		for (const token of tokens) {
			const point = displayCoordinate(token);
			const key = pointKey(point);
			groups[key] = [...(groups[key] ?? []), token.id];
		}
		function offsetFor(index: number, total: number): GridPoint {
			if (total === 1) return [0, 0];
			if (total <= 4) {
				const compactOffsets: GridPoint[] = [
					[-0.2, -0.2],
					[-0.2, 0.2],
					[0.2, -0.2],
					[0.2, 0.2]
				];
				return compactOffsets[index] ?? [0, 0];
			}
			const innerCount = total <= 8 ? total : 6;
			const onInnerRing = index < innerCount;
			const ringIndex = onInnerRing ? index : index - innerCount;
			const ringTotal = onInnerRing ? innerCount : total - innerCount;
			const radius = onInnerRing ? 0.32 : 0.5;
			const phase = onInnerRing ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ringTotal;
			const angle = phase + (ringIndex / ringTotal) * Math.PI * 2;
			return [Math.sin(angle) * radius, Math.cos(angle) * radius];
		}
		return tokens.map((token) => {
			const position = displayPosition(token);
			const point = displayCoordinate(token);
			const group = groups[pointKey(point)];
			const index = group.indexOf(token.id);
			const offset = offsetFor(index, group.length);
			return {
				token,
				position,
				stackSize: group.length,
				x: ((point[1] + 0.5 + offset[1]) / 15) * 100,
				y: ((point[0] + 0.5 + offset[0]) / 15) * 100
			};
		});
	}

	let legalMoves = $derived(new Map(state.legalMoves.map((move) => [move.tokenId, move])));
	let laidOutTokens = $derived(tokenLayout(state.tokens));

	function tokenLabel(token: LudoToken, position: LudoPosition, move?: LudoMove) {
		const player = state.players.find((candidate) => candidate.id === token.playerId);
		const shown = { ...token, position };
		return `${player?.name ?? token.playerId}, ${token.color} token ${token.number + 1}, ${positionDescription(shown)}${move ? `. Legal move: ${move.label}` : ''}`;
	}
</script>

<div class="board-frame" data-testid="ludo-board">
	<div class="ludo-board">
		<svg viewBox="0 0 1500 1500" role="img" aria-labelledby="ludo-board-title ludo-board-desc">
			<title id="ludo-board-title">A fifteen by fifteen Calcutta-family Ludo board</title>
			<desc id="ludo-board-desc">
				Green is northwest, yellow northeast, blue southeast and red southwest. Tokens move
				clockwise along the cream track into their private home lanes.
			</desc>
			<defs>
				<pattern id="paper-fibres" width="91" height="73" patternUnits="userSpaceOnUse">
					<path
						d="M8 13h23M56 41h12M21 65h7M72 17h9"
						stroke="#6f624b"
						stroke-width="1"
						opacity=".13"
					/>
					<circle cx="43" cy="22" r="1.2" fill="#4b4033" opacity=".15" />
					<circle cx="84" cy="62" r=".9" fill="#4b4033" opacity=".12" />
				</pattern>
				<pattern id="ludo-perimeter-ornament" width="96" height="22" patternUnits="userSpaceOnUse">
					<circle cx="8" cy="11" r="3" fill="#2B241F" />
					<path
						d="M18 11Q27 2 36 11Q27 20 18 11Z"
						fill="none"
						stroke="#2B241F"
						stroke-width="2.2"
					/>
					<path d="M27 5v12" stroke="#2B241F" stroke-width="1.4" />
					<path d="M48 11l7-6 7 6-7 6Z" fill="none" stroke="#2B241F" stroke-width="2.2" />
					<circle cx="76" cy="11" r="3" fill="#2B241F" />
					<path d="M84 11h8" stroke="#2B241F" stroke-width="1.6" />
				</pattern>
			</defs>

			<rect width="1500" height="1500" fill="#E4D3A7" />
			{#each homeRegions as region (region.color)}
				<rect x={region.x} y={region.y} width="600" height="600" fill={colors[region.color]} />
				<rect
					x={region.x + 105}
					y={region.y + 105}
					width="390"
					height="390"
					rx="18"
					fill="#eadcb8"
					stroke="#2B241F"
					stroke-width="7"
					vector-effect="non-scaling-stroke"
				/>
			{/each}

			{#each GREEN_ROUTE as point (pointKey(point))}
				{@const start = startingColor(point)}
				<rect
					x={point[1] * 100}
					y={point[0] * 100}
					width="100"
					height="100"
					fill={start ? colors[start] : '#eadfbd'}
					stroke="#2B241F"
					stroke-width="5"
					vector-effect="non-scaling-stroke"
				/>
			{/each}

			{#each homeLaneCells as cell (`${cell.color}-${pointKey(cell.point)}`)}
				<rect
					x={cell.point[1] * 100}
					y={cell.point[0] * 100}
					width="100"
					height="100"
					fill={colors[cell.color]}
					stroke="#2B241F"
					stroke-width="5"
					vector-effect="non-scaling-stroke"
				/>
			{/each}

			<g stroke="#2B241F" stroke-width="6" vector-effect="non-scaling-stroke">
				<path d="M600 600L750 750L600 900Z" fill={colors.green} />
				<path d="M600 600L900 600L750 750Z" fill={colors.yellow} />
				<path d="M900 600L900 900L750 750Z" fill={colors.blue} />
				<path d="M600 900L750 750L900 900Z" fill={colors.red} />
			</g>

			{#each homeRegions as region (region.color)}
				{#each [[210, 210], [390, 210], [210, 390], [390, 390]] as circle (`${circle[0]}-${circle[1]}`)}
					<circle
						cx={region.x + circle[0]}
						cy={region.y + circle[1]}
						r="48"
						fill="#e4d3a7"
						stroke="#2B241F"
						stroke-width="5"
						vector-effect="non-scaling-stroke"
					/>
				{/each}
			{/each}

			{#each PRINTED_STAR_COORDINATES as point (pointKey(point))}
				<g
					transform={`translate(${point[1] * 100 + 50} ${point[0] * 100 + 50})`}
					aria-hidden="true"
				>
					<path
						d="M0 -34L9 -13L29 -24L20 0L34 9L13 13L24 30L0 20L-10 34L-13 13L-31 23L-20 0L-34 -9L-13 -13L-23 -30L0 -20Z"
						fill="#eadfbd"
						stroke="#2B241F"
						stroke-width="4"
						vector-effect="non-scaling-stroke"
					/>
					<circle r="7" fill="#2B241F" />
				</g>
			{/each}

			<g fill="#2B241F" opacity=".8" aria-hidden="true">
				<path d="M265 650h120v-28l62 50-62 50v-28H265Z" />
				<path d="M805 265v120h28l-50 62-50-62h28V265Z" />
				<path d="M1115 805H995v28l-62-50 62-50v28h120Z" />
				<path d="M695 1115V995h-28l50-62 50 62h-28v120Z" />
			</g>

			<rect width="1500" height="1500" fill="url(#paper-fibres)" pointer-events="none" />
			<path
				d="M750 0C746 260 755 510 750 750S756 1230 750 1500"
				fill="none"
				stroke="#6d604c"
				stroke-width="9"
				opacity=".22"
				pointer-events="none"
			/>
			<path
				d="M744 0C750 290 741 525 747 751S742 1210 746 1500"
				fill="none"
				stroke="#f6e9c8"
				stroke-width="3"
				opacity=".38"
				pointer-events="none"
			/>
			<g opacity=".46" pointer-events="none" aria-hidden="true">
				<rect x="18" y="18" width="1464" height="22" fill="#eadfbd" opacity=".68" />
				<rect x="18" y="18" width="1464" height="22" fill="url(#ludo-perimeter-ornament)" />
				<rect x="18" y="1460" width="1464" height="22" fill="#eadfbd" opacity=".68" />
				<rect x="18" y="1460" width="1464" height="22" fill="url(#ludo-perimeter-ornament)" />
				<g transform="rotate(90 750 750)">
					<rect x="18" y="18" width="1464" height="22" fill="#eadfbd" opacity=".68" />
					<rect x="18" y="18" width="1464" height="22" fill="url(#ludo-perimeter-ornament)" />
					<rect x="18" y="1460" width="1464" height="22" fill="#eadfbd" opacity=".68" />
					<rect x="18" y="1460" width="1464" height="22" fill="url(#ludo-perimeter-ornament)" />
				</g>
			</g>
			<rect
				x="6"
				y="6"
				width="1488"
				height="1488"
				fill="none"
				stroke="#2B241F"
				stroke-width="12"
				vector-effect="non-scaling-stroke"
			/>
		</svg>

		<div class="tokens" role="group" aria-label="Ludo tokens">
			{#each laidOutTokens as item (item.token.id)}
				{@const move = legalMoves.get(item.token.id)}
				<button
					type="button"
					class:legal={Boolean(move)}
					class={`token ${item.token.color}`}
					style={`--token-x:${item.x};--token-y:${item.y};--token-scale:${item.stackSize > 8 ? 0.72 : item.stackSize > 4 ? 0.84 : 1}`}
					disabled={!move}
					aria-label={tokenLabel(item.token, item.position, move)}
					onclick={() => move && onmove(move.id)}
				>
					<span class="token-cap" aria-hidden="true">{COLOR_SYMBOLS[item.token.color]}</span>
				</button>
			{/each}
		</div>
	</div>
</div>

<div class="sr-only">
	<h3>Token positions</h3>
	<ul>
		{#each state.tokens as token (token.id)}
			<li>{tokenLabel(token, token.position, legalMoves.get(token.id))}</li>
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

	.ludo-board {
		position: relative;
		container-type: inline-size;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 0.15rem;
		background: #e4d3a7;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.tokens {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.token {
		--token-color: #333;
		--token-scale: 1;
		position: absolute;
		z-index: 4;
		left: calc(var(--token-x) * 1%);
		top: calc(var(--token-y) * 1%);
		width: clamp(1rem, 5.3cqi, 2.25rem);
		aspect-ratio: 0.92;
		padding: 0;
		border: 1.5px solid #241d19;
		border-radius: 48% 48% 42% 42% / 34% 34% 60% 60%;
		background:
			linear-gradient(90deg, transparent 47%, rgb(255 255 255 / 0.2) 49% 51%, transparent 53%),
			var(--token-color);
		box-shadow:
			0 2px 1px rgb(37 27 20 / 0.33),
			inset 1px 0 rgb(255 255 255 / 0.24);
		transform: translate(-50%, -58%) scale(var(--token-scale));
		pointer-events: auto;
	}

	.token::after {
		position: absolute;
		left: 8%;
		bottom: -8%;
		width: 84%;
		height: 32%;
		border: 1px solid #241d19;
		border-radius: 50%;
		background: var(--token-color);
		box-shadow: 0 2px 2px rgb(37 27 20 / 0.25);
		content: '';
	}

	.token-cap {
		position: absolute;
		z-index: 1;
		top: -16%;
		left: 24%;
		display: grid;
		width: 52%;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid #241d19;
		border-radius: 50%;
		background: var(--token-color);
		color: #fff8df;
		font-family: var(--font-sans);
		font-size: clamp(0.42rem, 1.65cqi, 0.68rem);
		font-weight: 900;
		line-height: 1;
		text-shadow: 0 1px #211;
	}

	.token.yellow .token-cap {
		color: #241d19;
		text-shadow: none;
	}
	.token.green {
		--token-color: #34804a;
	}
	.token.yellow {
		--token-color: #d8ad32;
	}
	.token.blue {
		--token-color: #326797;
	}
	.token.red {
		--token-color: #c54435;
	}

	.token:disabled {
		cursor: default;
		opacity: 1;
	}

	.token.legal {
		cursor: pointer;
		filter: drop-shadow(0 0 3px #fff3bd) drop-shadow(0 0 1px #241d19);
		animation: legal-breathe 1.2s ease-in-out infinite alternate;
	}

	.token.legal:focus-visible {
		outline: 3px solid #102f58;
		outline-offset: 4px;
	}

	@keyframes legal-breathe {
		to {
			transform: translate(-50%, -62%) scale(var(--token-scale));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.token.legal {
			animation: none;
		}
	}

	:global(html[data-motion='still']) .token.legal {
		animation: none;
	}

	@media (forced-colors: active) {
		.token {
			forced-color-adjust: none;
		}
		.token.legal {
			outline: 3px solid Highlight;
		}
	}
</style>
