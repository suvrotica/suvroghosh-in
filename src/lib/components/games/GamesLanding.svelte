<script lang="ts">
	import { resolve } from '$app/paths';
	import GameCard from './GameCard.svelte';
	import { gamesCatalog } from '$lib/games/catalog';
</script>

<section class="games-shelf page-enter" aria-labelledby="games-heading">
	<header
		class="relative mb-8 overflow-hidden rounded-2xl border border-amber-900/20 bg-[#efe2c5] p-5 text-[#30231d] sm:p-8 dark:border-amber-300/15 dark:bg-[#201a16] dark:text-[#f9edda]"
	>
		<a
			href={resolve('/blog')}
			class="shelf-link mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline decoration-amber-800/40 underline-offset-4 hover:decoration-current dark:decoration-amber-300/40"
		>
			<span aria-hidden="true">←</span> Writing and archive
		</a>
		<div class="flex flex-wrap items-baseline justify-between gap-3">
			<h1
				id="games-heading"
				class="m-0 text-5xl leading-none font-black tracking-tight sm:text-6xl"
			>
				Games
			</h1>
			<p class="m-0 text-xs font-bold tracking-[0.14em] uppercase">
				{gamesCatalog.length} games · No account needed
			</p>
		</div>
		<p class="mt-4 mb-6 max-w-xl text-left text-base leading-relaxed sm:text-lg">
			A folding board, a crossword, a paper plane, a Calcutta street. Find a little world to spend
			some time in.
		</p>

		<nav aria-label="Choose a game">
			<p class="mb-3 text-xs font-black tracking-[0.14em] uppercase">Pick your pace</p>
			<ul class="m-0 grid list-none grid-cols-2 gap-2 p-0">
				{#each gamesCatalog as game (game.slug)}
					<li>
						<a
							href={resolve('/blog/games/[slug]', { slug: game.slug })}
							class="shelf-link flex h-full min-h-11 items-center justify-between gap-3 rounded-lg border border-amber-950/20 bg-white/40 px-3 py-3 no-underline transition-colors hover:bg-white/75 motion-reduce:transition-none dark:border-amber-200/20 dark:bg-white/5 dark:hover:bg-white/10"
						>
							<span class="min-w-0">
								<span class="block text-sm leading-snug font-bold">{game.shortTitle}</span>
								<span class="mt-1 block text-xs leading-relaxed">{game.duration}</span>
							</span>
							<span aria-hidden="true">↗</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="m-0 text-xl font-black">On the shelf</h2>
		<p class="m-0 text-sm text-neutral-600 dark:text-neutral-400">Choose a cover to play</p>
	</div>
	<div class="games-grid">
		{#each gamesCatalog as game, index (game.slug)}
			<GameCard {game} eager={index < 2} />
		{/each}
	</div>

	<aside
		class="mt-7 rounded-xl border border-dashed border-neutral-300 p-5 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
		aria-labelledby="games-save-heading"
	>
		<h2
			id="games-save-heading"
			class="m-0 text-base font-bold text-neutral-900 dark:text-neutral-100"
		>
			Make yourself at home
		</h2>
		<p class="mt-2 mb-0 text-left text-sm leading-relaxed">
			Saved rounds, scores and settings stay in this browser. Ludo and the crossword let you resume
			unfinished play. Each game has its own instructions. No account or online leaderboard
			required.
		</p>
	</aside>
</section>

<style>
	.games-grid {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: minmax(0, 1fr);
	}

	.shelf-link:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 3px;
	}

	@media (min-width: 48rem) {
		.games-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
