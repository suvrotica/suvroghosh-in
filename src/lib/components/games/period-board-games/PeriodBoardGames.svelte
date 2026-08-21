<script lang="ts">
	import { onMount } from 'svelte';
	import { pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import GameTabs from './GameTabs.svelte';
	import LudoGame from './LudoGame.svelte';
	import SaapLudoGame from './SaapLudoGame.svelte';
	import { loadPreferences, savePreferences } from '$lib/games/period-board-games/preferences';
	import { DEFAULT_PREFERENCES, type BoardPreferences } from '$lib/games/period-board-games/shared';
	import type { GameCatalogEntry } from '$lib/games/catalog';

	type BoardTab = 'ludo' | 'snakes';

	let { game }: { game: GameCatalogEntry } = $props();
	function tabForUrl(url: URL): BoardTab {
		return url.searchParams.get('board') === 'saap-ludo' ? 'snakes' : 'ludo';
	}

	// A prerendered page cannot vary its HTML by query string. Hydrate one
	// stable face, then apply an exact deep link when the controller mounts.
	let activeTab = $state<BoardTab>('ludo');
	let preferences = $state<BoardPreferences>({ ...DEFAULT_PREFERENCES });
	let fallbackFullscreen = $state(false);
	let nativeFullscreen = $state(false);
	let gameRoot: HTMLElement;
	let fullscreenTrigger: HTMLElement | null = null;
	const inertedOutside: Array<readonly [element: HTMLElement, wasInert: boolean]> = [];
	let previousImmersiveValue: string | undefined;
	let fullscreenActive = $derived(fallbackFullscreen || nativeFullscreen);

	function tabFromUrl() {
		if (typeof window === 'undefined') return 'ludo' as const;
		return tabForUrl(new URL(window.location.href));
	}

	function selectTab(tab: BoardTab, updateHistory = true) {
		if (activeTab === tab && updateHistory) return;
		activeTab = tab;
		if (!updateHistory || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (tab === 'snakes') url.searchParams.set('board', 'saap-ludo');
		else url.searchParams.delete('board');
		pushState(
			resolve(`${url.pathname}${url.search}${url.hash}` as '/blog/games/ludo-and-saap-ludo'),
			{ periodBoard: tab }
		);
	}

	function restoreFullscreenFocus() {
		const triggerIsUsable =
			fullscreenTrigger?.isConnected &&
			!fullscreenTrigger.closest('[inert]') &&
			fullscreenTrigger.offsetParent !== null;
		const target = triggerIsUsable
			? fullscreenTrigger
			: gameRoot.querySelector<HTMLElement>(
					'[role="tabpanel"]:not([hidden]) [data-fullscreen-control]'
				);
		target?.focus();
	}

	function enterImmersiveMode() {
		if (typeof document === 'undefined' || inertedOutside.length > 0) return;
		previousImmersiveValue = document.documentElement.dataset.gameImmersive;
		document.documentElement.dataset.gameImmersive = 'true';

		let branch: HTMLElement = gameRoot;
		while (branch.parentElement) {
			const parent = branch.parentElement;
			for (const sibling of parent.children) {
				if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
				inertedOutside.push([sibling, sibling.inert]);
				sibling.inert = true;
			}
			if (parent === document.body) break;
			branch = parent;
		}
	}

	function leaveImmersiveMode() {
		if (typeof document === 'undefined') return;
		for (const [element, wasInert] of inertedOutside) {
			if (element.isConnected) element.inert = wasInert;
		}
		inertedOutside.length = 0;
		if (previousImmersiveValue === undefined) {
			delete document.documentElement.dataset.gameImmersive;
		} else {
			document.documentElement.dataset.gameImmersive = previousImmersiveValue;
		}
		previousImmersiveValue = undefined;
	}

	function updatePreferences(next: BoardPreferences) {
		preferences = next;
		if (typeof window !== 'undefined') {
			savePreferences(window.localStorage, preferences);
		}
	}

	async function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		fullscreenTrigger =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (document.fullscreenElement) {
			await document.exitFullscreen();
			return;
		}
		if (fallbackFullscreen) {
			fallbackFullscreen = false;
			restoreFullscreenFocus();
			return;
		}
		if (gameRoot.requestFullscreen) {
			try {
				await gameRoot.requestFullscreen();
				return;
			} catch {
				// A CSS fallback preserves the whole game when native fullscreen is unavailable.
			}
		}
		fallbackFullscreen = true;
	}

	onMount(() => {
		preferences = loadPreferences(window.localStorage);
		selectTab(tabFromUrl(), false);
		const onPopState = () => selectTab(tabFromUrl(), false);
		const onFullscreenChange = () => {
			nativeFullscreen = document.fullscreenElement === gameRoot;
			if (!document.fullscreenElement && !fallbackFullscreen) restoreFullscreenFocus();
		};
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && fallbackFullscreen) {
				fallbackFullscreen = false;
				restoreFullscreenFocus();
			}
		};
		window.addEventListener('popstate', onPopState);
		window.addEventListener('keydown', onKeydown);
		document.addEventListener('fullscreenchange', onFullscreenChange);
		return () => {
			leaveImmersiveMode();
			window.removeEventListener('popstate', onPopState);
			window.removeEventListener('keydown', onKeydown);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
		};
	});

	$effect(() => {
		if (!fullscreenActive) {
			leaveImmersiveMode();
			return;
		}
		enterImmersiveMode();
		return leaveImmersiveMode;
	});
</script>

<section
	bind:this={gameRoot}
	id="game-experience"
	class="period-game"
	class:fallback-fullscreen={fallbackFullscreen}
	data-active-board={activeTab}
	data-fullscreen={fullscreenActive ? (nativeFullscreen ? 'native' : 'fallback') : 'off'}
	aria-labelledby="period-game-title"
>
	<div class="table-surface">
		<header class="game-heading">
			<div>
				<p>Two faces of one folding board</p>
				<h1 id="period-game-title">{game.title}</h1>
			</div>
			<p class="description">{game.description}</p>
		</header>

		<GameTabs active={activeTab} onselect={selectTab} />

		<div class="board-paper" class:flipped={activeTab === 'snakes'}>
			<div
				id="ludo-panel"
				role="tabpanel"
				aria-labelledby="ludo-tab"
				tabindex="0"
				hidden={activeTab !== 'ludo'}
				inert={activeTab !== 'ludo'}
			>
				<LudoGame
					active={activeTab === 'ludo'}
					{preferences}
					{fullscreenActive}
					onpreferences={updatePreferences}
					onfullscreen={toggleFullscreen}
				/>
			</div>
			<div
				id="snakes-panel"
				role="tabpanel"
				aria-labelledby="snakes-tab"
				tabindex="0"
				hidden={activeTab !== 'snakes'}
				inert={activeTab !== 'snakes'}
			>
				<SaapLudoGame
					active={activeTab === 'snakes'}
					{preferences}
					{fullscreenActive}
					onpreferences={updatePreferences}
					onfullscreen={toggleFullscreen}
				/>
			</div>
		</div>
	</div>
</section>

<style>
	.period-game {
		--table: #2c211b;
		--paper: #e4d3a7;
		position: relative;
		isolation: isolate;
		width: 100%;
		background: var(--table);
		color: #2b241f;
		font-family: var(--font-serif);
	}

	.table-surface {
		min-height: min(100svh, 58rem);
		padding: clamp(0.55rem, 2.2vw, 1.7rem);
		background:
			linear-gradient(90deg, transparent 49.8%, rgb(0 0 0 / 0.1) 50%, transparent 50.2%),
			repeating-linear-gradient(92deg, rgb(255 255 255 / 0.018) 0 1px, transparent 1px 54px),
			#2c211b;
	}

	.game-heading {
		display: grid;
		max-width: 82rem;
		align-items: end;
		gap: 0.5rem 2rem;
		margin: 0 auto clamp(0.8rem, 1.6vw, 1.25rem);
		padding: 0.35rem clamp(0.2rem, 1.4vw, 0.8rem);
		color: #f0e0bc;
	}

	.game-heading p {
		margin: 0;
		text-align: left;
	}

	.game-heading > div > p {
		margin-bottom: 0.2rem;
		color: #ceb989;
		font-family: var(--font-sans);
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		color: #fff1cf;
		font-size: clamp(1.65rem, 4vw, 2.6rem);
		line-height: 1;
	}

	.description {
		max-width: 34rem;
		color: #d5c39e;
		font-size: clamp(0.85rem, 1.6vw, 1rem);
		line-height: 1.45;
	}

	.board-paper {
		max-width: 82rem;
		margin-inline: auto;
		padding: clamp(0.48rem, 1.4vw, 1.15rem);
		border: 1px solid #655947;
		border-radius: 0.2rem;
		background:
			repeating-linear-gradient(4deg, transparent 0 38px, rgb(73 60 43 / 0.035) 39px), var(--paper);
		box-shadow:
			0 0.7rem 2.2rem rgb(0 0 0 / 0.34),
			inset 0 1px rgb(255 255 255 / 0.35);
		transform-origin: 50% 50%;
		transition:
			opacity 160ms ease,
			transform 220ms ease;
	}

	.board-paper.flipped {
		animation: turn-board 220ms ease-out;
	}

	[role='tabpanel']:focus-visible {
		outline: 3px solid #1f5f80;
		outline-offset: 4px;
	}

	.fallback-fullscreen {
		position: fixed;
		z-index: 1000;
		inset: 0;
		overflow: auto;
	}

	.period-game:fullscreen {
		max-height: 100svh;
		overflow: auto;
	}

	.period-game:fullscreen .table-surface,
	.fallback-fullscreen .table-surface {
		min-height: 100svh;
		padding-top: max(clamp(0.55rem, 2.2vw, 1.7rem), env(safe-area-inset-top));
		padding-right: max(clamp(0.55rem, 2.2vw, 1.7rem), env(safe-area-inset-right));
		padding-bottom: max(clamp(0.55rem, 2.2vw, 1.7rem), env(safe-area-inset-bottom));
		padding-left: max(clamp(0.55rem, 2.2vw, 1.7rem), env(safe-area-inset-left));
	}

	@keyframes turn-board {
		0% {
			opacity: 0.66;
			transform: scaleX(0.985);
		}
		100% {
			opacity: 1;
			transform: scaleX(1);
		}
	}

	@media (min-width: 760px) {
		.game-heading {
			grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.72fr);
		}
	}

	@media (max-width: 420px) {
		.table-surface {
			padding-inline: 0.25rem;
		}
		.board-paper {
			padding: 0.35rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.board-paper {
			transition: none;
		}
		.board-paper.flipped {
			animation: none;
		}
	}

	:global(html[data-motion='still']) .board-paper {
		transition: none;
	}

	:global(html[data-motion='still']) .board-paper.flipped {
		animation: none;
	}

	@media (forced-colors: active) {
		.period-game,
		.table-surface,
		.board-paper {
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
