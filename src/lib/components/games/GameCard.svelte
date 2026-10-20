<script lang="ts">
	import { resolve } from '$app/paths';
	import type { GameCatalogEntry } from '$lib/games/catalog';

	let { game, eager = false }: { game: GameCatalogEntry; eager?: boolean } = $props();
</script>

<article
	class="game-card group relative rounded-2xl border border-amber-950/30 bg-[#221b17] text-[#f8edd7] shadow-lg shadow-amber-950/10"
>
	<a
		href={resolve('/blog/games/[slug]', { slug: game.slug })}
		class="game-card-link flex h-full flex-col rounded-2xl no-underline"
		aria-label={`${game.actionLabel}: ${game.title}`}
	>
		<div class="relative aspect-[3/2] overflow-hidden rounded-t-2xl bg-[#3b2a22]">
			<img
				src={game.cover}
				alt={game.coverAlt}
				width="1200"
				height="800"
				loading={eager ? 'eager' : 'lazy'}
				decoding="async"
				class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
			/>
		</div>

		<div class="flex flex-1 flex-col p-5">
			<div class="mb-2 flex items-start justify-between gap-3">
				<p class="m-0 text-xs leading-relaxed font-bold tracking-[0.1em] text-amber-300 uppercase">
					{game.kind}
				</p>
				<span
					class="shrink-0 rounded border border-amber-200/40 px-2 py-0.5 text-xs font-bold text-amber-200"
				>
					{game.status}
				</span>
			</div>
			<h3 class="m-0 text-2xl leading-tight font-black text-[#fff7e8]">
				{game.shortTitle}
			</h3>
			<p class="mt-3 mb-5 text-left text-sm leading-relaxed text-[#d9cab2]">
				{game.description}
			</p>

			<dl
				class="mt-auto mb-0 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/15 pt-4 text-sm"
			>
				<div>
					<dt class="text-xs font-bold text-amber-300">{game.durationLabel}</dt>
					<dd class="mt-1 ml-0 leading-relaxed text-[#f8edd7]">{game.duration}</dd>
				</div>
				<div>
					<dt class="text-xs font-bold text-amber-300">Works on</dt>
					<dd class="mt-1 ml-0 leading-relaxed text-[#f8edd7]">{game.compatibility.join(' · ')}</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-xs font-bold text-amber-300">Controls</dt>
					<dd class="mt-1 ml-0 leading-relaxed text-[#f8edd7]">{game.inputs.join(' · ')}</dd>
				</div>
			</dl>
			<span
				class="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-amber-300 px-4 py-3 text-sm font-black text-amber-950 transition-colors group-hover:bg-amber-200 motion-reduce:transition-none"
			>
				{game.actionLabel} <span aria-hidden="true">→</span>
			</span>
		</div>
	</a>
</article>

<style>
	.game-card {
		min-width: 0;
	}

	.game-card-link:focus-visible {
		outline: 3px solid var(--ink);
		outline-offset: 4px;
	}

	@media (forced-colors: active) {
		.game-card-link:focus-visible {
			outline-color: Highlight;
		}
	}
</style>
