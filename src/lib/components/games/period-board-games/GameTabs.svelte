<script lang="ts">
	type BoardTab = 'ludo' | 'snakes';

	let {
		active,
		onselect
	}: {
		active: BoardTab;
		onselect: (tab: BoardTab) => void;
	} = $props();

	let ludoTab: HTMLButtonElement;
	let snakesTab: HTMLButtonElement;

	function select(tab: BoardTab, focus = false) {
		onselect(tab);
		if (focus) queueMicrotask(() => (tab === 'ludo' ? ludoTab : snakesTab)?.focus());
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Home') select('ludo', true);
		else if (event.key === 'End') select('snakes', true);
		else select(active === 'ludo' ? 'snakes' : 'ludo', true);
	}
</script>

<div class="board-tabs" role="tablist" aria-label="Choose a side of the folding game board">
	<button
		bind:this={ludoTab}
		id="ludo-tab"
		type="button"
		role="tab"
		aria-selected={active === 'ludo'}
		aria-controls="ludo-panel"
		tabindex={active === 'ludo' ? 0 : -1}
		class:active={active === 'ludo'}
		onkeydown={handleKeydown}
		onclick={() => select('ludo')}
	>
		<span lang="bn">লুডো</span> <span aria-hidden="true">/</span> <span>LUDO</span>
	</button>
	<button
		bind:this={snakesTab}
		id="snakes-tab"
		type="button"
		role="tab"
		aria-selected={active === 'snakes'}
		aria-controls="snakes-panel"
		tabindex={active === 'snakes' ? 0 : -1}
		class:active={active === 'snakes'}
		onkeydown={handleKeydown}
		onclick={() => select('snakes')}
	>
		<span lang="bn">সাপলুডো</span> <span aria-hidden="true">/</span>
		<span>SNAKES &amp; LADDERS</span>
	</button>
</div>

<style>
	.board-tabs {
		display: grid;
		grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
		align-items: end;
		gap: 0.35rem;
		max-width: 52rem;
		margin-inline: auto;
		padding-inline: clamp(0.35rem, 2vw, 1.5rem);
	}

	button {
		min-height: 3.25rem;
		padding: 0.7rem 0.65rem 0.6rem;
		border: 1px solid #675a45;
		border-bottom-width: 2px;
		border-radius: 0.15rem 0.15rem 0 0;
		background: #c7b685;
		box-shadow:
			inset 0 1px rgb(255 255 255 / 0.35),
			0 -1px 0 #80745d;
		color: #2b241f;
		font-family: var(--font-sans);
		font-size: clamp(0.69rem, 1.9vw, 0.86rem);
		font-weight: 850;
		letter-spacing: 0.055em;
		line-height: 1.15;
		text-transform: uppercase;
		transition:
			transform 180ms ease,
			background-color 180ms ease;
	}

	button:nth-child(2) {
		transform-origin: bottom left;
	}

	button:hover {
		background: #d7c796;
	}

	button.active {
		position: relative;
		z-index: 2;
		margin-bottom: -2px;
		padding-bottom: calc(0.6rem + 2px);
		border-bottom-color: #e4d3a7;
		background: #e4d3a7;
		box-shadow: inset 0 2px rgb(255 255 255 / 0.4);
	}

	button:focus-visible {
		outline: 3px solid #1f5f80;
		outline-offset: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}

	:global(html[data-motion='still']) button {
		transition: none;
	}
</style>
