<script lang="ts">
	import { resolve } from '$app/paths';
	import GameCard from './GameCard.svelte';
	import { gamesCatalog } from '$lib/games/catalog';
</script>

<section class="page-enter">
	<header
		class="relative mb-9 overflow-hidden rounded-2xl border border-amber-900/20 bg-[#efe2c5] p-6 text-[#30231d] shadow-sm sm:p-9 dark:border-amber-300/15 dark:bg-[#201a16] dark:text-[#f9edda]"
	>
		<div
			class="pointer-events-none absolute inset-0 opacity-25"
			style="background-image: repeating-linear-gradient(97deg, transparent 0, transparent 19px, currentColor 20px);"
			aria-hidden="true"
		></div>
		<div class="relative">
			<a
				href={resolve('/blog')}
				class="mb-6 inline-flex min-h-11 items-center text-sm font-bold underline decoration-amber-800/40 underline-offset-4 hover:decoration-amber-900 dark:decoration-amber-300/40 dark:hover:decoration-amber-200"
			>
				<span aria-hidden="true">←</span>&nbsp;Writing and archive
			</a>
			<p
				class="mb-2 text-xs font-black tracking-[0.2em] text-amber-800 uppercase dark:text-amber-300"
			>
				Games from an unreasonable city
			</p>
			<h1 class="m-0 max-w-3xl text-4xl leading-none font-black tracking-tight sm:text-6xl">
				Games
			</h1>
			<p class="mt-5 mb-0 max-w-2xl text-left text-lg leading-relaxed opacity-80">
				Original little systems of trouble: playable satire, procedural streets, and browser-sized
				catastrophes. Built for a keyboard, a thumb, and a willingness to be blamed by a cow.
			</p>
		</div>
	</header>

	<div class="grid gap-7">
		{#each gamesCatalog as game (game.slug)}
			<GameCard {game} />
		{/each}
	</div>

	<aside
		class="mt-8 rounded-xl border border-dashed border-neutral-300 p-5 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
	>
		<h2 class="m-0 text-base font-bold text-neutral-900 dark:text-neutral-100">
			A shelf designed to grow
		</h2>
		<p class="mt-2 mb-0 max-w-3xl text-left text-sm leading-relaxed">
			Every title gets its own controls, play-time estimate, device support, status, and saved local
			progress. Nothing here requires an account or sends a score to a remote leaderboard.
		</p>
	</aside>
</section>
