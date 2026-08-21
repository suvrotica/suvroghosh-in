<script lang="ts">
	import { onMount } from 'svelte';
	import Dice from './Dice.svelte';
	import LudoBoard from './LudoBoard.svelte';
	import {
		configureLudoSetup,
		createLudoSetupState,
		isCustomLudoRules,
		openingPlayer,
		reduceLudo,
		startLudoGame
	} from '$lib/games/period-board-games/ludo/engine';
	import { loadLudoState, saveLudoState } from '$lib/games/period-board-games/ludo/persistence';
	import type {
		LudoAction,
		LudoPosition,
		LudoSetup,
		LudoState
	} from '$lib/games/period-board-games/ludo/types';
	import { freshBrowserSeed } from '$lib/games/period-board-games/rng';
	import type { BoardPreferences, Pace, PlayerColor } from '$lib/games/period-board-games/shared';
	import { BoardSoundPlayer } from '$lib/games/period-board-games/sound';
	import { EffectScheduler, timing } from '$lib/games/period-board-games/timing';

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

	let gameState = $state<LudoState>(createLudoSetupState());
	let mounted = $state(false);
	let reducedMotion = $state(false);
	let animatedToken = $state<{ tokenId: string; position: LudoPosition } | null>(null);
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
			? openingPlayer(gameState)
			: (gameState.players[gameState.turnIndex] ?? null)
	);
	let statusTitle = $derived.by(() => {
		if (gameState.phase === 'setup') return 'Ludo setup';
		if (gameState.phase === 'game-over') {
			const winner = gameState.players.find((player) => player.id === gameState.winnerId);
			if (!winner) return 'Game over';
			return winner.name === 'You' ? 'You win' : `${winner.name} wins`;
		}
		if (!activePlayer) return 'Ludo match';
		return activePlayer.name === 'You' ? 'Your turn' : `${activePlayer.name}'s turn`;
	});
	let canHumanRoll = $derived(
		active &&
			activePlayer?.kind === 'human' &&
			(gameState.phase === 'opening-roll' || gameState.phase === 'awaiting-roll')
	);
	let customRules = $derived(isCustomLudoRules(gameState.setup.houseRules));
	let blockadeRule = $derived(
		gameState.setup.houseRules.blockades
			? 'On an ordinary track square, two matching tokens form a blockade that opponents cannot pass.'
			: 'With blockades off, matching tokens may not stack on ordinary unsafe squares; opponents may pass lone tokens and capture one on an exact landing.'
	);
	let bonusRule = $derived.by(() => {
		const { extraThrowAfterCapture, extraThrowAfterHome } = gameState.setup.houseRules;
		if (extraThrowAfterCapture && extraThrowAfterHome) {
			return 'Capturing a token and bringing a token home each grant an extra throw.';
		}
		if (extraThrowAfterCapture) {
			return 'Capturing a token grants an extra throw; bringing a token home does not.';
		}
		if (extraThrowAfterHome) {
			return 'Bringing a token home grants an extra throw; capturing a token does not.';
		}
		return 'Capturing a token and bringing a token home do not grant extra throws.';
	});
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
		if (mounted) saveLudoState(window.localStorage, gameState);
	}

	function maybePlay(action: LudoAction, previous: LudoState, next: LudoState) {
		if (action.type === 'ROLL' && next !== previous)
			void soundPlayer.play('die', preferences.sound);
		if (action.type === 'MOVE' || action.type === 'BOT_CHOOSE') {
			if (next.phase === 'token-moving') void soundPlayer.play('move', preferences.sound);
		}
		if (action.type === 'MOVE_SETTLED' && next.pendingMove) {
			if (next.pendingMove.capturedTokenIds.length > 0) {
				void soundPlayer.play('capture', preferences.sound);
			}
		}
		if (next.phase === 'game-over' && previous.phase !== 'game-over') {
			void soundPlayer.play('win', preferences.sound);
		}
	}

	function dispatch(action: LudoAction) {
		const previous = gameState;
		const result = reduceLudo(gameState, action);
		if (result.state === gameState) return;
		if (result.state.phase === 'token-moving' && result.state.pendingMove) {
			animatedToken = {
				tokenId: result.state.pendingMove.move.tokenId,
				position: result.state.pendingMove.move.from
			};
		}
		gameState = result.state;
		persist();
		maybePlay(action, previous, gameState);
	}

	function updateSetup(patch: Partial<LudoSetup>) {
		gameState = configureLudoSetup(gameState, patch);
		persist();
	}

	function startGame() {
		scheduler.cancel();
		animatedToken = null;
		gameState = startLudoGame(gameState.setup, freshBrowserSeed());
		persist();
		focusStatus();
	}

	function newGame() {
		const inProgress = gameState.phase !== 'setup' && gameState.phase !== 'game-over';
		if (
			inProgress &&
			!window.confirm('Start a new Ludo match? The current Ludo match will be replaced.')
		) {
			return;
		}
		scheduler.cancel();
		animatedToken = null;
		gameState = createLudoSetupState(gameState.setup);
		persist();
		focusStatus();
	}

	function playAgain() {
		gameState = startLudoGame(gameState.setup, freshBrowserSeed());
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

	function move(moveId: string) {
		if (activePlayer?.kind === 'human') {
			const previous = gameState;
			dispatch({ type: 'MOVE', playerId: activePlayer.id, moveId });
			if (gameState !== previous) focusStatus();
		}
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
		if (gameState.phase === 'computer-choosing') {
			scheduler.schedule(key, timing('decision', preferences.pace, reducedMotion), () => {
				dispatch({ type: 'BOT_CHOOSE', effectId: gameState.effectId });
			});
			return;
		}
		if (gameState.phase === 'token-moving' && gameState.pendingMove) {
			const move = gameState.pendingMove.move;
			if (reducedMotion) {
				animatedToken = { tokenId: move.tokenId, position: move.to };
				scheduler.schedule(key, timing('ludo-step', preferences.pace, true), () => {
					animatedToken = null;
					dispatch({ type: 'MOVE_SETTLED', effectId: gameState.effectId });
				});
			} else {
				scheduler.sequence(
					key,
					move.path,
					timing('ludo-step', preferences.pace),
					(position) => (animatedToken = { tokenId: move.tokenId, position }),
					() => {
						animatedToken = null;
						dispatch({ type: 'MOVE_SETTLED', effectId: gameState.effectId });
					}
				);
			}
			return;
		}
		if (gameState.phase === 'resolving-landing') {
			scheduler.schedule(key, timing('landing', preferences.pace, reducedMotion), () => {
				dispatch({ type: 'LANDING_SETTLED', effectId: gameState.effectId });
			});
			return;
		}
		if (gameState.phase === 'resolving-bonus') {
			const noMove = gameState.announcement.includes('No legal move');
			scheduler.schedule(
				key,
				timing(noMove ? 'no-move' : 'turn', preferences.pace, reducedMotion),
				() => dispatch({ type: 'BONUS_SETTLED', effectId: gameState.effectId })
			);
			return;
		}
		if (gameState.phase === 'changing-turn') {
			const noMove =
				gameState.announcement.includes('No legal move') ||
				gameState.announcement.includes('Third consecutive');
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
			animatedToken = null;
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
		gameState = loadLudoState(window.localStorage);
		mounted = true;
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = media.matches || document.documentElement.dataset.motion === 'still';
		};
		const onVisibility = () => {
			scheduler.cancel();
			animatedToken = null;
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
	data-game="ludo"
	data-phase={gameState.phase}
	data-turn-id={gameState.turnId}
	data-effect-id={gameState.effectId}
	aria-busy={gameState.phase === 'die-rolling' || gameState.phase === 'token-moving'}
>
	<div class="board-column">
		<LudoBoard state={gameState} {animatedToken} onmove={move} />
	</div>

	<aside class="control-panel" aria-label="Ludo match controls">
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
				<label>
					<span>Your display name</span>
					<input
						type="text"
						maxlength="24"
						value={gameState.setup.humanName}
						oninput={(event) => updateSetup({ humanName: event.currentTarget.value })}
					/>
				</label>
				<label>
					<span>Computer opponents</span>
					<select
						value={String(gameState.setup.computerCount)}
						onchange={(event) =>
							updateSetup({ computerCount: Number(event.currentTarget.value) as 1 | 2 | 3 })}
					>
						<option value="1">1 computer</option>
						<option value="2">2 computers</option>
						<option value="3">3 computers</option>
					</select>
				</label>
				<fieldset>
					<legend>Your colour</legend>
					<div class="color-choices">
						{#each ['red', 'green', 'yellow', 'blue'] as color (color)}
							<label class={`color-choice ${color}`}>
								<input
									type="radio"
									name="ludo-color"
									value={color}
									checked={gameState.setup.humanColor === color}
									onchange={() => updateSetup({ humanColor: color as PlayerColor })}
								/>
								<span>{color}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				<details class="house-rules">
					<summary>House rules</summary>
					<label>
						<input
							type="checkbox"
							checked={gameState.setup.houseRules.extraThrowAfterCapture}
							onchange={(event) =>
								updateSetup({
									houseRules: {
										...gameState.setup.houseRules,
										extraThrowAfterCapture: event.currentTarget.checked
									}
								})}
						/>
						Extra throw after capture
					</label>
					<label>
						<input
							type="checkbox"
							checked={gameState.setup.houseRules.extraThrowAfterHome}
							onchange={(event) =>
								updateSetup({
									houseRules: {
										...gameState.setup.houseRules,
										extraThrowAfterHome: event.currentTarget.checked
									}
								})}
						/>
						Extra throw after reaching home
					</label>
					<label>
						<input
							type="checkbox"
							checked={gameState.setup.houseRules.blockades}
							onchange={(event) =>
								updateSetup({
									houseRules: {
										...gameState.setup.houseRules,
										blockades: event.currentTarget.checked
									}
								})}
						/>
						Blockades
					</label>
					{#if customRules}<p>Changing a switch labels this match Custom house rules.</p>{/if}
				</details>
				<button class="primary" type="submit">Start Ludo</button>
			</form>
		{:else}
			<div class="turn-controls">
				<Dice
					value={gameState.die}
					canRoll={canHumanRoll}
					rolling={gameState.phase === 'die-rolling'}
					label={gameState.phase === 'opening-roll'
						? 'Make your opening throw'
						: 'Roll the Ludo die'}
					onroll={roll}
				/>

				{#if gameState.phase === 'awaiting-human-token'}
					<div class="legal-actions" role="group" aria-labelledby="legal-ludo-heading">
						<h3 id="legal-ludo-heading">Choose your move</h3>
						{#each gameState.legalMoves as legalMove (legalMove.id)}
							<button type="button" onclick={() => move(legalMove.id)}>{legalMove.label}</button>
						{/each}
					</div>
				{/if}
				{#if gameState.phase === 'game-over'}
					<button class="primary" type="button" onclick={playAgain}>Play again</button>
				{/if}
			</div>
		{/if}

		<div class="toolbar" role="group" aria-label="Game preferences">
			<button type="button" onclick={newGame}>New game</button>
			<button
				type="button"
				aria-pressed={preferences.sound}
				onclick={() => onpreferences({ ...preferences, sound: !preferences.sound })}
			>
				Sound {preferences.sound ? 'on' : 'off'}
			</button>
			<label>
				<span>Pace</span>
				<select
					value={preferences.pace}
					onchange={(event) =>
						onpreferences({ ...preferences, pace: event.currentTarget.value as Pace })}
				>
					<option value="relaxed">Relaxed</option>
					<option value="normal">Normal</option>
					<option value="brisk">Brisk</option>
				</select>
			</label>
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
			<p>
				Four tokens begin in each yard. A six enters or moves a token and grants another throw; the
				third consecutive six is discarded. Exact throws are required for home.
			</p>
			<p>
				Starts, rosettes, private lanes and the centre are safe. An ordinary exact landing captures
				one opposing token. {blockadeRule}
			</p>
			<p>
				{bonusRule} Even when several reasons apply, only one extra throw is granted. The first player
				to bring all four tokens home wins.
			</p>
		</details>

		<div class="players" role="list" aria-label="Players">
			{#each gameState.players as player (player.id)}
				<span role="listitem" class:current={activePlayer?.id === player.id}>
					<i class={player.color} aria-hidden="true"></i>{player.name}{player.kind === 'computer'
						? ' · computer'
						: ''}
				</span>
			{/each}
		</div>

		<section class="history" aria-labelledby="ludo-history-heading">
			<h3 id="ludo-history-heading">Recent moves</h3>
			{#if gameState.history.length === 0}
				<p>No throws yet.</p>
			{:else}
				<ol>
					{#each gameState.history as entry (entry.id)}<li>{entry.text}</li>{/each}
				</ol>
			{/if}
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
	.legal-actions button,
	.toolbar button {
		min-height: 2.75rem;
		border: 1px solid #4f4333;
		border-radius: 0.12rem;
		background: #3e3429;
		color: #fff3d4;
		font-weight: 850;
	}
	.primary:hover,
	.legal-actions button:hover,
	.toolbar button:hover {
		background: #574735;
	}
	.turn-controls {
		display: grid;
		gap: 0.75rem;
	}
	.legal-actions {
		display: grid;
		gap: 0.45rem;
	}
	.legal-actions h3 {
		margin: 0;
		font-size: 0.88rem;
	}
	.legal-actions button {
		padding: 0.55rem 0.7rem;
		text-align: left;
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
