<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import CalcuttaFootpathGame from '$lib/components/games/calcutta-footpath/CalcuttaFootpathGame.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO {...data.seo} />

<CalcuttaFootpathGame game={data.game} />

<section
	id="about-the-game"
	aria-labelledby="about-game-heading"
	class="game-static-copy bg-[#f3ead9] px-5 py-14 text-[#302821] sm:px-8 sm:py-20 dark:bg-[#161513] dark:text-[#eee4d3]"
>
	<div class="mx-auto max-w-4xl">
		<nav aria-label="Breadcrumb" class="mb-4 text-sm">
			<ol class="flex flex-wrap items-center gap-2 text-[#6c5a48] dark:text-[#b9aa93]">
				<li><a href={resolve('/')} class="underline underline-offset-4">Home</a></li>
				<li aria-hidden="true">/</li>
				<li><a href={resolve('/blog/games')} class="underline underline-offset-4">Games</a></li>
				<li aria-hidden="true">/</li>
				<li aria-current="page">{data.game.shortTitle}</li>
			</ol>
		</nav>
		{#if data.metadata.dateModified}
			<p class="mb-8 text-xs text-[#6c5a48] dark:text-[#b9aa93]">
				Updated <time datetime={data.metadata.dateModified}>{data.metadata.dateModified}</time>
			</p>
		{/if}

		<div class="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
			<div>
				<p
					class="mb-2 text-xs font-black tracking-[0.17em] text-amber-800 uppercase dark:text-amber-300"
				>
					About the game
				</p>
				<h2 id="about-game-heading" class="m-0 text-3xl leading-tight font-black sm:text-4xl">
					One ordinary walk. No correct side.
				</h2>
				<p class="mt-5 text-left text-lg leading-relaxed">
					Walk into a small three-dimensional North Calcutta neighbourhood of bending lanes,
					ordinary old houses, shops, courtyards and one wider road. Choose a bylane, turn around,
					wait for traffic, stop for tea and find another route when the city occupies the first
					one.
				</p>
				<p class="mt-4 text-left leading-relaxed">
					The authored street network includes residential, bazaar, workshop and old-house lanes.
					Pedestrians have destinations, vehicles approach through real depth, rain changes the
					street, and every run’s small events remain deterministic from its seed.
				</p>
			</div>

			<aside class="rounded-2xl border border-amber-950/15 bg-white/55 p-5 dark:bg-white/5">
				<h2 class="m-0 text-lg font-black">How to walk</h2>
				<ul class="mt-4 space-y-3 text-sm leading-relaxed">
					<li><strong>Click or tap the visible road</strong> and the walker goes there.</li>
					<li>
						<strong>Arrow Up:</strong> walk. <strong>Left / Right:</strong> turn.
						<strong>Down:</strong> step back.
					</li>
					<li><strong>Space:</strong> hurry briefly. <strong>Escape:</strong> pause.</li>
					<li>Labelled Stop, Turn around, Map and food buttons require no game shorthand.</li>
				</ul>
			</aside>
		</div>

		<div class="mt-12 grid gap-5 sm:grid-cols-2">
			<section class="rounded-xl border border-amber-950/15 p-5">
				<h2 class="m-0 text-xl font-black">Food and effects</h2>
				<p class="mt-3 text-left text-sm leading-relaxed">
					Fuchka restores stamina. Mishti restores morale but slows the eater. Tea sharpens hazard
					warnings until the hands become optimistic. Suspicious ghugni selects one consequence
					without consulting you.
				</p>
			</section>
			<section class="rounded-xl border border-amber-950/15 p-5">
				<h2 class="m-0 text-xl font-black">Accessibility</h2>
				<p class="mt-3 text-left text-sm leading-relaxed">
					Menus, map, prompts and route results are accessible HTML. The game supports simple
					keyboard and tap controls, visible equivalents for sound, high contrast, explicit mute,
					gentle camera movement, reduced motion, focus management and automatic pause.
				</p>
			</section>
			<section class="rounded-xl border border-amber-950/15 p-5">
				<h2 class="m-0 text-xl font-black">Technical notes</h2>
				<p class="mt-3 text-left text-sm leading-relaxed">
					A lightweight Three.js world is loaded only after Play. Metre-based geometry, a fixed step
					simulation, an authored navigation graph and named random streams keep movement, traffic
					and temporary obstructions coherent. Web Audio positions important sounds in the world and
					applies distance filtering, modest occlusion and restrained Doppler shift.
				</p>
			</section>
			<section class="rounded-xl border border-amber-950/15 p-5">
				<h2 class="m-0 text-xl font-black">Privacy and saved scores</h2>
				<p class="mt-3 text-left text-sm leading-relaxed">
					Settings, best scores, recent run summaries and the latest route stay in this browser’s
					local storage. They are not uploaded. There is no account, remote leaderboard,
					advertising, or game-specific telemetry.
				</p>
			</section>
		</div>

		<p class="mt-10 mb-0 text-center text-sm text-[#6c5a48] dark:text-[#b9aa93]">
			<a
				href="#game-experience"
				class="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
			>
				Return to the game <span class="ml-1" aria-hidden="true">↑</span>
			</a>
		</p>
	</div>
</section>

<noscript>
	<div class="bg-[#2a211b] p-6 text-center text-[#f8edd7]">
		JavaScript is required to run the street simulation. The game description and controls remain
		available below.
	</div>
</noscript>
