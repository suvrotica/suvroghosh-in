<script lang="ts">
	import { onMount } from 'svelte';
	import Dice from './Dice.svelte';
	import SaapLudoBoard from './SaapLudoBoard.svelte';
	import { squareCenter } from '$lib/games/period-board-games/snakes/board';
	import {
		configureSnakesSetup,
		createSnakesSetupState,
		isCustomSnakesRules,
		openingSnakesPlayer,
		reduceSnakes,
		startSnakesGame
	} from '$lib/games/period-board-games/snakes/engine';
	import {
		loadSnakesState,
		saveSnakesState
	} from '$lib/games/period-board-games/snakes/persistence';
	import type {
		SnakesAction,
		SnakesSetup,
		SnakesState
	} from '$lib/games/period-board-games/snakes/types';
	import { freshBrowserSeed } from '$lib/games/period-board-games/rng';
	import type { BoardPreferences, Pace, PlayerColor } from '$lib/games/period-board-games/shared';
	import { BoardSoundPlayer } from '$lib/games/period-board-games/sound';
	import { EffectScheduler, timing } from '$lib/games/period-board-games/timing';

	type AnimatedCounter = { playerId: string; position?: number; x?: number; y?: number };

	let {
		active,
		preferences,
		fullscreenActive,
		onpreferences,
		onfullscreen
	}: {
		active: boolean;
		preferences: BoardPreferences;
		fullscreenActive: boolean;
		onpreferences: (preferences: BoardPreferences) => void;
		onfullscreen: () => void;
	} = $props();

	let gameState = $state<SnakesState>(createSnakesSetupState());
	let mounted = $state(false);
	let reducedMotion = $state(false);
	let animatedCounter = $state<AnimatedCounter | null>(null);
	let scheduler = new EffectScheduler();
	let soundPlayer = new BoardSoundPlayer();
	let statusHeading: HTMLHeadingElement;

	function focusStatus() {
		queueMicrotask(() => {
			if (active) statusHeading?.focus({ preventScroll: true });
		});
	}

	let activePlayer = $derived(
		gameState.phase === 'opening-roll' ||
			(gameState.phase === 'die-rolling' && gameState.opening.contenders.length > 0)
			? openingSnakesPlayer(gameState)
			: (gameState.players[gameState.turnIndex] ?? null)
	);
	let statusTitle = $derived.by(() => {
		if (gameState.phase === 'setup') return 'Saap-Ludo setup';
		if (gameState.phase === 'game-over') {
			const winner = gameState.players.find((player) => player.id === gameState.winnerId);
			if (!winner) return 'Game over';
			return winner.name === 'You' ? 'You win' : `${winner.name} wins`;
		}
		if (!activePlayer) return 'Saap-Ludo match';
		return activePlayer.name === 'You' ? 'Your turn' : `${activePlayer.name}'s turn`;
	});
	let canHumanRoll = $derived(
		active &&
			activePlayer?.kind === 'human' &&
			(gameState.phase === 'opening-roll' || gameState.phase === 'awaiting-roll')
	);
	let customRules = $derived(isCustomSnakesRules(gameState.setup.houseRules));
	let entryRule = $derived(
		gameState.setup.houseRules.requireOneToEnter
			? 'Every counter begins off the board and needs exactly one to enter square 1. That entry throw ends the turn. After entry, move the full die value.'
			: 'Every counter begins off the board. The first throw moves its full value straight onto the board; no entry roll of one is required.'
	);
	let sixBonusRule = $derived(
		gameState.setup.houseRules.extraThrowAfterSix
			? 'A six grants another throw.'
			: 'A six does not grant another throw.'
	);
	let announcementParts = $derived.by(() => {
		const separator = gameState.announcement.indexOf(' / ');
		return separator < 0
			? { bengali: null, english: gameState.announcement }
			: {
					bengali: gameState.announcement.slice(0, separator),
					english: gameState.announcement.slice(separator + 3)
				};
	});

	function persist() {
		if (mounted) saveSnakesState(window.localStorage, gameState);
	}

	function maybePlay(action: SnakesAction, previous: SnakesState, next: SnakesState) {
		if (action.type === 'ROLL' && next !== previous)
			void soundPlayer.play('die', preferences.sound);
		if (action.type === 'DIE_SETTLED' && next.phase === 'counter-moving') {
			void soundPlayer.play('move', preferences.sound);
		}
		if (action.type === 'COUNTER_SETTLED' && next.phase === 'resolving-transport') {
			void soundPlayer.play(
				next.pendingMove?.transport?.type === 'ladder' ? 'ladder' : 'snake',
				preferences.sound
			);
		}
		if (next.phase === 'game-over' && previous.phase !== 'game-over') {
			void soundPlayer.play('win', preferences.sound);
		}
	}

	function dispatch(action: SnakesAction) {
		const previous = gameState;
		const result = reduceSnakes(gameState, action);
		if (result.state === gameState) return;
		if (result.state.phase === 'counter-moving' && result.state.pendingMove) {
			animatedCounter = {
				playerId: result.state.players[result.state.turnIndex].id,
				position: result.state.pendingMove.from
			};
		}
		if (result.state.phase === 'resolving-transport' && result.state.pendingMove?.transport) {
			animatedCounter = {
				playerId: result.state.players[result.state.turnIndex].id,
				position: result.state.pendingMove.transport.from
			};
		}
		gameState = result.state;
		persist();
		maybePlay(action, previous, gameState);
	}

	function updateSetup(patch: Partial<SnakesSetup>) {
		gameState = configureSnakesSetup(gameState, patch);
		persist();
	}

	function startGame() {
		scheduler.cancel();
		animatedCounter = null;
		gameState = startSnakesGame(gameState.setup, freshBrowserSeed());
		persist();
		focusStatus();
	}

	function newGame() {
		const inProgress = gameState.phase !== 'setup' && gameState.phase !== 'game-over';
		if (
			inProgress &&
			!window.confirm('Start a new Saap-Ludo match? The current Saap-Ludo match will be replaced.')
		) {
			return;
		}
		scheduler.cancel();
		animatedCounter = null;
		gameState = createSnakesSetupState(gameState.setup);
		persist();
		focusStatus();
	}

	function playAgain() {
		gameState = startSnakesGame(gameState.setup, freshBrowserSeed());
		persist();
		focusStatus();
	}

	function roll() {
		if (canHumanRoll && activePlayer) {
			const previous = gameState;
			dispatch({ type: 'ROLL', playerId: activePlayer.id });
			if (gameState !== previous) focusStatus();
		}
	}

	function transportPath(from: number, to: number) {
		const start = squareCenter(from);
		const end = squareCenter(to);
		const steps = reducedMotion ? 1 : 12;
		return Array.from({ length: steps }, (_, index) => {
			const progress = (index + 1) / steps;
			const curve = Math.sin(progress * Math.PI) * (to > from ? -2.4 : 3.2);
			return {
				x: start.x + (end.x - start.x) * progress + curve,
				y: start.y + (end.y - start.y) * progress
			};
		});
	}

	function drive() {
		if (!mounted || !active || document.hidden || gameState.phase === 'paused') return;
		const key = `${gameState.turnId}:${gameState.effectId}:${gameState.phase}`;
		if (
			(gameState.phase === 'opening-roll' || gameState.phase === 'awaiting-roll') &&
			activePlayer?.kind === 'computer'
		) {
			scheduler.schedule(key, timing('computer-roll', preferences.pace, reducedMotion), () => {
				dispatch({ type: 'ROLL', playerId: activePlayer!.id });
			});
			return;
		}
		if (gameState.phase === 'die-rolling') {
			scheduler.schedule(key, timing('die', preferences.pace, reducedMotion), () => {
				dispatch({ type: 'DIE_SETTLED', effectId: gameState.effectId });
			});
			return;
		}
		if (gameState.phase === 'counter-moving' && gameState.pendingMove) {
			const playerId = gameState.players[gameState.turnIndex].id;
			const squares = gameState.pendingMove.overshoot
				? []
				: Array.from(
						{ length: Math.max(0, gameState.pendingMove.landed - gameState.pendingMove.from) },
						(_, index) => gameState.pendingMove!.from + index + 1
					);
			if (squares.length === 0 || reducedMotion) {
				animatedCounter = { playerId, position: gameState.pendingMove.landed };
				scheduler.schedule(key, timing('ludo-step', preferences.pace, reducedMotion), () => {
					animatedCounter = null;
					dispatch({ type: 'COUNTER_SETTLED', effectId: gameState.effectId });
				});
			} else {
				scheduler.sequence(
					key,
					squares,
					timing('ludo-step', preferences.pace),
					(position) => (animatedCounter = { playerId, position }),
					() => {
						animatedCounter = null;
						dispatch({ type: 'COUNTER_SETTLED', effectId: gameState.effectId });
					}
				);
			}
			return;
		}
		if (gameState.phase === 'resolving-transport' && gameState.pendingMove?.transport) {
			const playerId = gameState.players[gameState.turnIndex].id;
			const transport = gameState.pendingMove.transport;
			const points = transportPath(transport.from, transport.to);
			scheduler.sequence(
				key,
				points,
				Math.max(
					10,
					Math.round(timing('transport', preferences.pace, reducedMotion) / points.length)
				),
				(point) => (animatedCounter = { playerId, ...point }),
				() => {
					animatedCounter = null;
					dispatch({ type: 'TRANSPORT_SETTLED', effectId: gameState.effectId });
				}
			);
			return;
		}
		if (gameState.phase === 'resolving-bonus') {
			scheduler.schedule(key, timing('turn', preferences.pace, reducedMotion), () => {
				dispatch({ type: 'BONUS_SETTLED', effectId: gameState.effectId });
			});
			return;
		}
		if (gameState.phase === 'changing-turn') {
			const noMove =
				gameState.announcement.includes('needs exactly one') ||
				gameState.announcement.includes('Exact roll required');
			scheduler.schedule(
				key,
				timing(noMove ? 'no-move' : 'turn', preferences.pace, reducedMotion),
				() => dispatch({ type: 'TURN_SETTLED', effectId: gameState.effectId })
			);
		}
	}

	$effect(() => {
		if (!mounted) return;
		const phase = gameState.phase;
		const effectId = gameState.effectId;
		const pace = preferences.pace;
		void effectId;
		void pace;
		if (!active || document.hidden) {
			scheduler.cancel();
			animatedCounter = null;
			if (phase !== 'paused' && phase !== 'setup' && phase !== 'game-over') {
				queueMicrotask(() => dispatch({ type: 'PAUSE' }));
			}
			return;
		}
		if (phase === 'paused') {
			queueMicrotask(() => dispatch({ type: 'RESUME' }));
			return;
		}
		drive();
		return () => scheduler.cancel();
	});

	onMount(() => {
		gameState = loadSnakesState(window.localStorage);
		mounted = true;
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = media.matches || document.documentElement.dataset.motion === 'still';
		};
		const onVisibility = () => {
			scheduler.cancel();
			animatedCounter = null;
			if (document.hidden) dispatch({ type: 'PAUSE' });
			else if (active) dispatch({ type: 'RESUME' });
		};
		const unlockSound = () => soundPlayer.unlock();
		updateMotion();
		media.addEventListener('change', updateMotion);
		window.addEventListener('site-motion-change', updateMotion);
		document.addEventListener('visibilitychange', onVisibility);
		document.addEventListener('pointerdown', unlockSound, true);
		document.addEventListener('keydown', unlockSound, true);
		return () => {
			scheduler.cancel();
			soundPlayer.destroy();
			media.removeEventListener('change', updateMotion);
			window.removeEventListener('site-motion-change', updateMotion);
			document.removeEventListener('visibilitychange', onVisibility);
			document.removeEventListener('pointerdown', unlockSound, true);
			document.removeEventListener('keydown', unlockSound, true);
		};
	});
</script>

<div
	class="game-layout"
	data-game="saap-ludo"
	data-phase={gameState.phase}
	data-turn-id={gameState.turnId}
	data-effect-id={gameState.effectId}
	aria-busy={gameState.phase === 'die-rolling' || gameState.phase === 'counter-moving'}
>
	<div class="board-column"><SaapLudoBoard state={gameState} {animatedCounter} /></div>
	<aside class="control-panel" aria-label="Saap-Ludo match controls">
		<div class="status-card">
			<p class="eyebrow">{customRules ? 'Custom house rules' : 'Calcutta family preset'}</p>
			<h2 bind:this={statusHeading} tabindex="-1">{statusTitle}</h2>
			<p class="status-text">
				{#if announcementParts.bengali}<span lang="bn">{announcementParts.bengali}</span> /
				{/if}{announcementParts.english}
			</p>
			<div class="sr-only" aria-live="polite" aria-atomic="true">
				{#if announcementParts.bengali}<span lang="bn">{announcementParts.bengali}</span> /
				{/if}{announcementParts.english}
			</div>
		</div>

		{#if gameState.phase === 'setup'}
			<form
				class="setup"
				onsubmit={(event) => {
					event.preventDefault();
					startGame();
				}}
			>
				<label
					><span>Your display name</span><input
						type="text"
						maxlength="24"
						value={gameState.setup.humanName}
						oninput={(event) => updateSetup({ humanName: event.currentTarget.value })}
					/></label
				>
				<label>
					<span>Computer opponents</span>
					<select
						value={String(gameState.setup.computerCount)}
						onchange={(event) =>
							updateSetup({ computerCount: Number(event.currentTarget.value) as 1 | 2 | 3 })}
					>
						<option value="1">1 computer</option><option value="2">2 computers</option><option
							value="3">3 computers</option
						>
					</select>
				</label>
				<fieldset>
					<legend>Your counter colour</legend>
					<div class="color-choices">
						{#each ['red', 'green', 'yellow', 'blue'] as color (color)}
							<label class={`color-choice ${color}`}
								><input
									type="radio"
									name="snakes-color"
									value={color}
									checked={gameState.setup.humanColor === color}
									onchange={() => updateSetup({ humanColor: color as PlayerColor })}
								/><span>{color}</span></label
							>
						{/each}
					</div>
				</fieldset>
				<details class="house-rules">
					<summary>House rules</summary>
					<label
						><input
							type="checkbox"
							checked={gameState.setup.houseRules.requireOneToEnter}
							onchange={(event) =>
								updateSetup({
									houseRules: {
										...gameState.setup.houseRules,
										requireOneToEnter: event.currentTarget.checked
									}
								})}
						/>Require one to enter</label
					>
					<label
						><input
							type="checkbox"
							checked={gameState.setup.houseRules.extraThrowAfterSix}
							onchange={(event) =>
								updateSetup({
									houseRules: {
										...gameState.setup.houseRules,
										extraThrowAfterSix: event.currentTarget.checked
									}
								})}
						/>Extra throw after six</label
					>
					{#if customRules}<p>Changing a switch labels this match Custom house rules.</p>{/if}
				</details>
				<button class="primary" type="submit">Start Saap-Ludo</button>
			</form>
		{:else}
			<div class="turn-controls">
				<Dice
					value={gameState.die}
					canRoll={canHumanRoll}
					rolling={gameState.phase === 'die-rolling'}
					label={gameState.phase === 'opening-roll'
						? 'Make your opening throw'
						: 'Roll the Saap-Ludo die'}
					onroll={roll}
				/>
				{#if gameState.phase === 'game-over'}<button
						class="primary"
						type="button"
						onclick={playAgain}>Play again</button
					>{/if}
			</div>
		{/if}

		<div class="toolbar" role="group" aria-label="Game preferences">
			<button type="button" onclick={newGame}>New game</button>
			<button
				type="button"
				aria-pressed={preferences.sound}
				onclick={() => onpreferences({ ...preferences, sound: !preferences.sound })}
				>Sound {preferences.sound ? 'on' : 'off'}</button
			>
			<label
				><span>Pace</span><select
					value={preferences.pace}
					onchange={(event) =>
						onpreferences({ ...preferences, pace: event.currentTarget.value as Pace })}
					><option value="relaxed">Relaxed</option><option value="normal">Normal</option><option
						value="brisk">Brisk</option
					></select
				></label
			>
			<button
				type="button"
				data-fullscreen-control
				aria-pressed={fullscreenActive}
				onclick={onfullscreen}
			>
				{fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
			</button>
		</div>

		<details class="rules">
			<summary>Rules</summary>
			<p>{entryRule}</p>
			<p>
				Only exact landings use a ladder or snake, and only one transport resolves. {sixBonusRule}
				Counters may share squares and never capture.
			</p>
			<p>
				Square 100 requires an exact roll; overshoots stay put. The first player to reach 100 wins.
				The board’s eight snakes and eight ladders are fixed.
			</p>
		</details>

		<div class="players" role="list" aria-label="Players">
			{#each gameState.players as player (player.id)}<span
					role="listitem"
					class:current={activePlayer?.id === player.id}
					><i class={player.color} aria-hidden="true"></i>{player.name}{player.kind === 'computer'
						? ' · computer'
						: ''}</span
				>{/each}
		</div>

		<section class="history" aria-labelledby="snakes-history-heading">
			<h3 id="snakes-history-heading">Recent moves</h3>
			{#if gameState.history.length === 0}<p>No throws yet.</p>{:else}<ol>
					{#each gameState.history as entry (entry.id)}<li>{entry.text}</li>{/each}
				</ol>{/if}
		</section>
	</aside>
</div>

<style>
	.game-layout {
		display: grid;
		gap: clamp(1rem, 2vw, 1.6rem);
	}
	.board-column {
		min-width: 0;
	}
	.control-panel {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.9rem;
		color: #2b241f;
	}
	.status-card,
	.setup,
	.turn-controls,
	.toolbar,
	.rules,
	.players,
	.history {
		border: 1px solid rgb(43 36 31 / 0.38);
		border-radius: 0.2rem;
		background: rgb(238 225 188 / 0.91);
		box-shadow: 2px 3px 0 rgb(43 36 31 / 0.13);
	}
	.status-card,
	.setup,
	.turn-controls,
	.rules,
	.players,
	.history {
		padding: 0.9rem;
	}
	.eyebrow {
		margin: 0 0 0.25rem;
		color: #73573a;
		font-size: 0.69rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		color: #2b241f;
		font-size: clamp(1.25rem, 2.5vw, 1.65rem);
		line-height: 1.1;
	}
	.status-text {
		min-height: 2.7em;
		margin: 0.45rem 0 0;
		color: #2b241f;
		text-align: left;
		font-size: 0.94rem;
		line-height: 1.35;
	}
	.setup {
		display: grid;
		gap: 0.8rem;
	}
	.setup > label,
	.toolbar label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.82rem;
		font-weight: 800;
	}
	input[type='text'],
	select {
		min-height: 2.75rem;
		border: 1px solid #655844;
		border-radius: 0.12rem;
		background: #f3e8c8;
		color: #2b241f;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 0.35rem;
		font-size: 0.82rem;
		font-weight: 800;
	}
	.color-choices {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.35rem;
	}
	.color-choice {
		display: grid;
		min-height: 2.75rem;
		place-items: center;
		border: 1px solid #5e5140;
		background: #eee1bc;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: capitalize;
	}
	.color-choice input {
		position: absolute;
		opacity: 0;
	}
	.color-choice:has(input:checked) {
		outline: 3px solid #1f5f80;
		outline-offset: 1px;
	}
	.color-choice:has(input:focus-visible) {
		outline: 3px dashed #102f58;
		outline-offset: 3px;
		box-shadow: 0 0 0 2px #f3e8c8;
	}
	.color-choice.red {
		border-bottom: 7px solid #c54435;
	}
	.color-choice.green {
		border-bottom: 7px solid #34804a;
	}
	.color-choice.yellow {
		border-bottom: 7px solid #d8ad32;
	}
	.color-choice.blue {
		border-bottom: 7px solid #326797;
	}
	.house-rules {
		border-top: 1px dashed #776750;
		padding-top: 0.65rem;
	}
	.house-rules summary,
	.rules summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-weight: 900;
		line-height: 2.75rem;
	}
	.house-rules label {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.86rem;
	}
	.house-rules input {
		width: 1.2rem;
		height: 1.2rem;
	}
	.house-rules p {
		margin: 0.25rem 0;
		color: #2b241f;
		text-align: left;
		font-size: 0.75rem;
	}
	.primary,
	.toolbar button {
		min-height: 2.75rem;
		border: 1px solid #4f4333;
		border-radius: 0.12rem;
		background: #3e3429;
		color: #fff3d4;
		font-weight: 850;
	}
	.primary:hover,
	.toolbar button:hover {
		background: #574735;
	}
	.turn-controls {
		display: grid;
		gap: 0.75rem;
	}
	.toolbar {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		padding: 0.55rem;
	}
	.toolbar label {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		border: 1px solid #685b45;
		padding-left: 0.55rem;
		background: #eee1bc;
	}
	.toolbar select {
		min-width: 0;
		border: 0;
		background: transparent;
	}
	.rules p {
		margin: 0.45rem 0;
		color: #2b241f;
		text-align: left;
		font-size: 0.83rem;
		line-height: 1.45;
	}
	.players {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.players span {
		display: inline-flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.45rem;
		border: 1px solid transparent;
		font-size: 0.73rem;
	}
	.players span.current {
		border-color: #4f4333;
		background: #f6eac8;
		font-weight: 850;
	}
	.players i {
		width: 0.8rem;
		aspect-ratio: 1;
		border: 1px solid #2b241f;
		border-radius: 50%;
	}
	.players i.red {
		background: #c54435;
	}
	.players i.green {
		background: #34804a;
	}
	.players i.yellow {
		background: #d8ad32;
	}
	.players i.blue {
		background: #326797;
	}
	.history h3 {
		margin: 0 0 0.45rem;
		color: #2b241f;
		font-size: 0.88rem;
	}
	.history p {
		margin: 0;
		color: #2b241f;
		text-align: left;
		font-size: 0.78rem;
	}
	.history ol {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.75rem;
		color: #2b241f;
		line-height: 1.35;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 3px solid #1f5f80;
		outline-offset: 2px;
	}
	@media (min-width: 900px) {
		.game-layout {
			grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
			align-items: start;
		}
		.control-panel {
			max-height: min(84vw, 51rem);
			overflow-y: auto;
			padding-right: 0.15rem;
		}
	}
	@media (max-width: 420px) {
		.toolbar {
			grid-template-columns: 1fr;
		}
		.color-choices {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (forced-colors: active) {
		.status-card,
		.setup,
		.turn-controls,
		.toolbar,
		.rules,
		.players,
		.history {
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
