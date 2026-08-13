<script lang="ts">
	import { resolve } from '$app/paths';
	import type { GameCatalogEntry } from '$lib/games/catalog';

	let { game }: { game: GameCatalogEntry } = $props();
</script>

<article
	class="game-card group relative overflow-hidden rounded-2xl border border-amber-950/30 bg-[#221b17] text-[#f8edd7] shadow-2xl shadow-amber-950/20"
>
	<a
		href={resolve('/blog/games/[slug]', { slug: game.slug })}
		class="block rounded-2xl no-underline outline-none focus-visible:ring-4 focus-visible:ring-amber-400 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-100 dark:focus-visible:ring-offset-neutral-950"
		aria-label={`${game.actionLabel}: ${game.title}`}
	>
		<div class="relative aspect-[3/2] overflow-hidden bg-[#3b2a22]">
			<img
				src={game.cover}
				alt={game.coverAlt}
				width="1200"
				height="800"
				class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
			/>
			<div
				class="absolute inset-0 bg-gradient-to-t from-[#17110e] via-transparent to-transparent"
				aria-hidden="true"
			></div>
			<span
				class="absolute top-4 left-4 rounded-full border border-amber-200/50 bg-[#241711]/90 px-3 py-1.5 text-xs font-black tracking-[0.14em] text-amber-200 uppercase shadow-lg backdrop-blur"
			>
				{game.status}
			</span>
			<span
				class="absolute right-4 bottom-4 inline-flex min-h-11 items-center rounded-full bg-amber-300 px-5 py-2 text-sm font-black text-amber-950 shadow-xl transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none"
			>
				{game.actionLabel} <span class="ml-2" aria-hidden="true">→</span>
			</span>
		</div>

		<div class="p-5 sm:p-7">
			<p class="mb-2 text-xs font-bold tracking-[0.16em] text-amber-300 uppercase">
				{game.cardEyebrow}
			</p>
			<h2 class="m-0 text-2xl leading-tight font-black text-[#fff7e8] sm:text-3xl">
				{game.title}
			</h2>
			<p class="mt-3 mb-5 max-w-3xl text-left leading-relaxed text-[#d9cab2]">
				{game.description}
			</p>

			<dl class="grid gap-3 text-sm sm:grid-cols-3">
				<div class="rounded-lg border border-white/10 bg-white/5 p-3">
					<dt class="text-xs font-bold tracking-wider text-amber-300 uppercase">Controls</dt>
					<dd class="mt-1 text-[#f8edd7]">{game.inputs.join(' · ')}</dd>
				</div>
				<div class="rounded-lg border border-white/10 bg-white/5 p-3">
					<dt class="text-xs font-bold tracking-wider text-amber-300 uppercase">
						{game.durationLabel}
					</dt>
					<dd class="mt-1 text-[#f8edd7]">{game.duration}</dd>
				</div>
				<div class="rounded-lg border border-white/10 bg-white/5 p-3">
					<dt class="text-xs font-bold tracking-wider text-amber-300 uppercase">Works on</dt>
					<dd class="mt-1 text-[#f8edd7]">{game.compatibility.join(' · ')}</dd>
				</div>
			</dl>
		</div>
	</a>
</article>

<style>
	.game-card {
		isolation: isolate;
	}

	.game-card::after {
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image: repeating-linear-gradient(
			-8deg,
			transparent 0,
			transparent 9px,
			rgb(255 255 255 / 0.018) 10px
		);
		content: '';
		pointer-events: none;
	}
</style>
